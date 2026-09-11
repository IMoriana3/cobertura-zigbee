/* RENDER ≡ FÍSICA, medido en el navegador.
 *
 * La doctrina del simulador es que lo que se pinta es lo que la física
 * calcula. Estas comprobaciones lo MIDEN, no lo suponen:
 *
 *   1. Cámara desde el SOL (3D): «lo que no ves desde aquí es exactamente lo
 *      que está en sombra». La silueta roja es la sombra calculada; si desde el
 *      sol se ve rojo, el render pinta sombra donde el sol llega. Se cuentan
 *      píxeles rojos en el framebuffer: tienen que ser CERO. Cazó (v1.56) que en
 *      la viga del motor el largo de la mesa se tomaba de todo el modelo (TCU y
 *      motor asoman 2,6 m por el morro) y la silueta se pintaba sobre esa
 *      prolongación inexistente; y antes (v1.42) la pegatina 2,5 cm en el aire.
 *      EXCEPCIÓN DECLARADA (no se prueba aquí, está medida): en los presets sin
 *      quiebro la física modela el tramo como vidrio CONTINUO (sin el hueco del
 *      motor, 0,55 m de 65) y el modelo 3D sí lleva el hueco: desde el sol se
 *      ven ~50 px de rojo a través del hueco de la emisora (la física cobra esa
 *      sombra de más, 0,85 % del largo). El quiebro en la rótula ya parte las
 *      mesas con su hueco y pasa a cero. Pendiente: partir todas las mesas.
 *   2. Corte 2D: el borde por el que ENTRA la sombra roja lo decide un ray-cast
 *      2D independiente (rayo desde puntos de la receptora hacia el sol contra
 *      la cuerda de la emisora), no la regla de la página. Con la mesa de
 *      ESPALDAS al sol (manual) la página pintaba la sombra por el borde de cara
 *      al sol, que es el alto: incoherente con la sombra al suelo (reportado).
 *   3. Signo del manual: slider s ⇒ HUD s (el HUD y el slider hablan la misma
 *      convención, − = este) y la normal de la mesa mira al lado que dice.
 *
 *     node tools/test_render_sol.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8300 + (process.pid % 500);
let ok = 0, ko = 0;
const check = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { ko++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
};

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2500);

  const configura = async (c) => {
    await pg.evaluate((c) => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
      set('lat', c.lat); set('lon', c.lon); set('nrows', c.nrows); set('drive', c.drive); set('nspreset', c.nspreset);
      set('axtilt', c.axtilt); set('nsl', 'alineadas'); set('ntrk', '1');
      document.getElementById('date').value = c.date; document.getElementById('date').dispatchEvent(new Event('change'));
      document.getElementById('tpreset').value = c.tpreset; document.getElementById('tpreset').dispatchEvent(new Event('change'));
      document.getElementById('tparam').value = c.tparam; document.getElementById('tapply').click();
    }, c);
    await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
    await pg.waitForTimeout(1500);
    await pg.evaluate((k) => { const i = document.querySelector(`#polbox input[data-k="${k}"]`); if (i && !i.checked) i.click(); }, c.pol);
    await pg.waitForFunction((k) => DAY && DAY.pol && DAY.pol[k], c.pol, { timeout: 120000 });
    await pg.waitForTimeout(800);
    await pg.evaluate((k) => { const s = document.getElementById('polview'); s.value = k; s.dispatchEvent(new Event('change')); }, c.pol);
    await pg.evaluate((m) => { const h = document.getElementById('hour'); h.value = String(m); h.dispatchEvent(new Event('input')); }, c.min);
    await pg.waitForTimeout(600);
  };

  /* ── 1. desde el sol no se ve rojo ─────────────────────────────────────── */
  const rojoDesdeElSol = async () => {
    await pg.click('#tab3d'); await pg.waitForTimeout(2500);
    await pg.click('#sunpov'); await pg.waitForTimeout(1000);
    return pg.evaluate(() => {
      TD.orthoCam.zoom = 6; TD.orthoCam.updateProjectionMatrix();
      // solo geometría: los rótulos (sprites) y el haz son capa de UI, no sombra
      const ocultos = []; TD.scene.traverse(o => { if ((o.isSprite || o === TD.hazGrp || o === TD.rayGrp) && o.visible) { o.visible = false; ocultos.push(o); } });
      const cam = TD.orthoCam; TD.renderer.render(TD.scene, cam);
      const gl = TD.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let rojo = 0, azul = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 170 && px[i + 1] < 110 && px[i + 2] < 110) rojo++;
        if (px[i + 2] > px[i] + 20 && px[i + 2] > 60) azul++;            // pala vista desde el sol
      }
      ocultos.forEach(o => { o.visible = true; });
      const t = timeIndex(), key = document.getElementById('polview').value, sh = DAY.pol[key].shade[t];
      return { w, h, rojo, azul, elev: DAY.sun[t].elev, sombra: Math.max(...sh) };
    });
  };
  const casos = [
    { nm: 'rótula ±6° · bt2d · Arequipa 21-dic 17:30 (sol 10°)', lat: '-16.59577', lon: '-71.80644', nrows: '8', drive: 'quebrado', nspreset: 'rotula', axtilt: '6', date: '2026-12-21', tpreset: 'pendiente', tparam: '5.14', pol: 'bt2d', min: 17 * 60 + 30 },
    // con quiebro (casi nulo) para que la física lleve el hueco del motor — ver la excepción declarada arriba
    { nm: 'cresta 3 · rótula ±0,5° · astro (sin BT) · Zaragoza 21-jun 08:00', lat: '41.65', lon: '-0.88', nrows: '8', drive: 'quebrado', nspreset: 'rotula', axtilt: '0.5', date: '2026-06-21', tpreset: 'cresta', tparam: '3', pol: 'astro', min: 8 * 60 },
  ];
  for (const c of casos) {
    await configura(c);
    const r = await rojoDesdeElSol();
    check(`desde el sol no se ve rojo — ${c.nm}`, r.rojo === 0 && r.azul > 1000 && r.sombra > 0.05,
          `rojos ${r.rojo} · pala ${r.azul} px · sombra máx ${(r.sombra * 100).toFixed(1)} % · sol ${r.elev.toFixed(1)}°`);
  }

  /* ── 2. corte 2D: el borde por el que entra la sombra, contra un ray-cast 2D ─ */
  await pg.click('#tab2d'); await pg.waitForTimeout(800);
  check('en el corte 2D no hay botón «sol» (ese punto de vista es del 3D)',
        await pg.evaluate(() => getComputedStyle(document.getElementById('sunpov')).display === 'none'));
  const c2 = { lat: '-16.59577', lon: '-71.80644', nrows: '8', drive: 'mono', nspreset: 'constante', axtilt: '0', date: '2026-12-21', tpreset: 'cresta', tparam: '3', pol: 'row', min: 18 * 60 + 5 };
  await configura(c2);
  const bordeManual = async (slider) => {
    await pg.evaluate((v) => {
      const m = document.getElementById('manual'); if (!m.checked) m.click();
      const t = document.getElementById('manth'); t.value = String(v); t.dispatchEvent(new Event('input'));
    }, slider);
    await pg.waitForTimeout(1000);
    return pg.evaluate(() => {
      const inst = sceneInstant(), t = timeIndex(), c = DAY.c, n = c.nrows, g = inst.g;
      const ang = inst.pv.ang[t], sh = inst.pv.shade[t];
      const psz = trueTrackAngle(g.zen, g.az, pvTilt(c.axtilt), c.axaz);
      const EL2D = viewElev(n), hubH = 1.6, hw = c.cw / 2, RAD = Math.PI / 180;
      const mesa = (i) => { const th = ang[i] * RAD, cx = (DAY.T.lineX ? DAY.T.lineX[i] : i * c.pitch), cz = EL2D[i] + hubH;
        return { L: [cx - hw * Math.cos(th), cz + hw * Math.sin(th)], R: [cx + hw * Math.cos(th), cz - hw * Math.sin(th)] }; };
      // ray-cast 2D: ¿el rayo desde P hacia el sol (sin psz, cos psz) corta la cuerda de la emisora?
      const u = [Math.sin(psz * RAD), Math.cos(psz * RAD)];
      const corta = (P, E) => { const d = [E.R[0] - E.L[0], E.R[1] - E.L[1]]; const den = u[0] * d[1] - u[1] * d[0]; if (Math.abs(den) < 1e-12) return false;
        const w = [E.L[0] - P[0], E.L[1] - P[1]]; const s = (w[0] * d[1] - w[1] * d[0]) / den, q = (w[0] * u[1] - w[1] * u[0]) / den; return s > 1e-9 && q >= 0 && q <= 1; };
      const out = [];
      for (let i = 0; i < n; i++) {
        if (!(sh[i] > 0.02)) continue;
        const e = psz < 0 ? i - 1 : i + 1; if (e < 0 || e >= n) continue;
        const R = mesa(i), E = mesa(e);
        // por qué borde entra la sombra SEGÚN EL RAY-CAST: el primer 4 % de cuerda desde cada borde
        const desde = (A, B) => { let k = 0; for (const f of [0.005, 0.015, 0.025, 0.035]) { const P = [A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])]; if (corta(P, E)) k++; } return k; };
        const izq = desde(R.L, R.R), der = desde(R.R, R.L);
        // y lo que PINTA la página (SCENE_DBG lo publica drawScene)
        const d = SCENE_DBG && SCENE_DBG.rows ? SCENE_DBG.rows[i] : null;
        out.push({ i, sh: +(sh[i] * 100).toFixed(1), th: +ang[i].toFixed(1), izq, der, pinta: d ? (d.fromRight ? 'der' : 'izq') : null });
      }
      return { psz: +psz.toFixed(1), hud: (document.getElementById('hud') || {}).textContent || '', filas: out, thHud: TH_DISP * ang[0] };
    });
  };
  for (const [slider, nm] of [[-60, 'mesa de ESPALDAS al sol (slider −60 = este, sol al oeste)'], [60, 'mesa de CARA al sol (slider +60 = oeste)'], [-22, 'la captura reportada (−22)']]) {
    const r = await bordeManual(slider);
    const malas = r.filas.filter(f => (f.izq === 4 && f.der === 0 && f.pinta !== 'izq') || (f.der === 4 && f.izq === 0 && f.pinta !== 'der'));
    const decididas = r.filas.filter(f => (f.izq === 4 && f.der === 0) || (f.der === 4 && f.izq === 0));
    check(`corte 2D: la sombra roja entra por el borde que dice el ray-cast — ${nm}`, r.filas.length > 0 && decididas.length > 0 && malas.length === 0,
          `psz ${r.psz} · filas ${JSON.stringify(r.filas)}`);
    check(`el manual cruza el signo: slider ${slider} ⇒ HUD ${slider} (θ físico ${-slider})`, Math.round(r.thHud) === Math.max(-55, Math.min(55, slider)),
          `HUD ${r.thHud}`);
  }

  check('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' · '));
  await browser.close();
} finally {
  try { srv.kill(); } catch { /* nada */ }
}
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
