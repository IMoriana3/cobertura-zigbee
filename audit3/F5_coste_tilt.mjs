/* R3 · DIAGNÓSTICO — POR QUÉ CUESTA EL TERRENO CON PENDIENTE N-S
 *
 * SÓLO MIDE. No toca `mvPara`, ni `anglesPairwiseRaw`, ni `anglesTrue3d`, ni
 * ningún umbral. El arreglo se decide con el número delante.
 *
 * SÍNTOMA: generar terreno con pendiente en las dos direcciones cuesta mucho más
 * que en plano, y el coste no parece depender del VALOR de la pendiente.
 *
 * HIPÓTESIS A PONER A PRUEBA: el tilt N-S no hace el cálculo más grande, enciende
 * un CAMINO distinto. Tres guardas que en plano cortocircuitan:
 *   1 · `anglesPairwiseRaw:1203` sólo entra en su bucle de reparación si
 *       `T.rowTilt && zen<90 && T.pairs.some(i=>pairStations(T,i).length>1)`
 *   2 · `anglesTrue3d:1339` devuelve la baseline si `|axisTilt| <= EPS_TILT` (0,5°)
 *   3 · `mvPara:928` baja el denominador de 4 a 2 si la torsión entre vecinas >= 0,5°
 * Los tres se disparan por un UMBRAL, no por magnitud — eso explicaría la
 * insensibilidad al valor.
 *
 * BARRIDO: 0,0 / 0,2 / 0,4 / 0,45 / 0,49 / 0,51 / 0,55 / 0,6 / 1,0 / 2,0 / 4,0°,
 * todo lo demás idéntico. Y en DOS presets, no uno: `constante` y `quebrado`.
 * El encargo pedía un preset, pero el síntoma dice «quebrado o constante da
 * igual» y eso sólo se puede confirmar o refutar midiendo los dos — y los tres
 * guardas se reparten distinto entre ellos (`pairStations:1074` devuelve UNA
 * estación cuando las filas vecinas tienen el mismo tilt, así que con tilt
 * constante el guarda 1 no puede dispararse).
 *
 * LAS ITERACIONES DEL BUCLE DE REPARACIÓN se cuentan con una RÉPLICA del bucle
 * escrita aquí, no tocando el original. Y la réplica lleva su propio control: su
 * resultado tiene que coincidir con el de `anglesPairwiseRaw` ángulo a ángulo. Si
 * no coincide, el recuento no vale y se dice — una réplica que se ha desviado
 * cuenta las iteraciones de otro bucle.
 *
 *     node audit3/F5_coste_tilt.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TILTS = [0.0, 0.2, 0.4, 0.45, 0.49, 0.51, 0.55, 0.6, 1.0, 2.0, 4.0];
const PRESETS = ['constante', 'quebrado'];
const PASO_MIN = +(process.env.F5_PASO || 30);

const PORT = 9051 + (process.pid % 25);
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('ERR ' + e.message));
  pg.on('crash', () => console.error('MUERTE · renderer'));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.waitForTimeout(300);

  const res = await pg.evaluate(([TILTS, PRESETS, PASO]) => {
    const c0 = cfg();
    const POLS = POLICIES.map(p => p.key);

    /* instantes: los mismos para TODOS los puntos del barrido */
    const doy = doyOf(c0.date), inst = [];
    for (let m = 0; m < 1440; m += PASO) {
      const g = solarPos(localToUTCms(c0.date, m, c0.tz), c0.lat, c0.lon);
      if (!(g.elev > 0)) continue;
      const irr = clearskyIneichen(g.zen, doy, c0.alt, c0.tl);
      if (!(irr.dni > 25)) continue;
      inst.push({ m, zen: g.zen, az: g.az, irr });
    }

    /* RÉPLICA del bucle de reparación de anglesPairwiseRaw, para contar sus
       iteraciones sin tocar el original. Copia literal de la lógica de
       backtracking.html:1203-1224. */
    const replicaReparacion = (zen, az, T) => {
      const nR = T.pairs.length + 1, out = new Array(nR);
      const ev = pairEval3D(zen, az, T, new Map());
      const th = T.pairs.map((p, i) => pairThetaTorsion(zen, az, T, i, nan0(singleaxis(zen, az, {
        axisTilt: pvTilt(p.axisTilt), axisAz: T.axisAz, maxAngle: T.maxAngle,
        backtrack: true, gcr: T.cw / p.pitch, crossAxisTilt: p.slope })), ev));
      out[0] = th[0]; out[nR - 1] = th[th.length - 1];
      const sg = trueTrackAngle(zen, az, 0, T.axisAz) >= 0 ? 1 : -1;
      for (let r = 1; r < nR - 1; r++) out[r] = sg * th[r - 1] < sg * th[r] ? th[r - 1] : th[r];
      const guarda = !!(T.rowTilt && isFinite(zen) && zen < 90 && T.pairs.some((_, i) => pairStations(T, i).length > 1));
      let its = 0, tope = false;
      if (guarda) {
        const ITS = Math.round(12 * 0.5 / PASO_BUSQ);
        for (let it = 0; it < ITS; it++) {
          its++;
          let dirty = false;
          for (let p = 0; p < T.pairs.length; p++) {
            if (ev(p, out[p], out[p + 1]) <= 1e-3) continue;
            let t = sg * out[p] < sg * out[p + 1] ? out[p] : out[p + 1];
            if (out[p] === out[p + 1]) t = t - sg * PASO_BUSQ;
            const [hLo, hHi] = rangoHaz(zen, az, T, T.pairs[p].axisTilt, T.pairs[p].slope);
            t = Math.max(hLo, Math.min(hHi, t));
            if (out[p] !== t || out[p + 1] !== t) { out[p] = t; out[p + 1] = t; dirty = true; }
          }
          if (!dirty) break;
        }
        tope = (its === ITS);
      }
      return { out, its, tope, guarda, ITS: Math.round(12 * 0.5 / PASO_BUSQ) };
    };

    const salida = [];
    for (const preset of PRESETS) for (const tilt of TILTS) {
      const c = Object.assign({}, c0, { axtilt: tilt, nspreset: preset   /* 'constante' no casa con ninguna rama de nsProfile y cae en el constante */ });
      const T = terrain(c);

      /* ── los tres guardas, LEÍDOS, no tocados ───────────────────────────── */
      const EPS = 0.5;
      const nPdeg = T.pairs.filter(p => Math.abs(p.axisTilt) <= EPS).length;
      let torMax = 0;
      if (T.rowTilt) for (let r = 0; r + 1 < T.rowTilt.length; r++) torMax = Math.max(torMax, Math.abs((T.rowTilt[r] || 0) - (T.rowTilt[r + 1] || 0)));
      const estMulti = T.pairs.filter((_, i) => pairStations(T, i).length > 1).length;

      /* ── MV efectivo ────────────────────────────────────────────────────── */
      const mvAlto = mvPara(T, 45), mvRasante = mvPara(T, 86);

      /* ── tiempo por política, las nueve por separado ─────────────────────── */
      const tPol = {}; let tTot = 0, itsTot = 0, nTope = 0, replicaOK = true, nCmp = 0;
      for (const k of POLS) {
        const t0 = performance.now();
        for (const I of inst) policyAngles(k, I.zen, I.az, T, I.irr, doy, c.albedo);
        const dt = performance.now() - t0;
        tPol[k] = +dt.toFixed(1); tTot += dt;
      }

      /* ── iteraciones del bucle de reparación, por réplica + CONTROL ──────── */
      let guardaOn = 0;
      for (const I of inst) {
        const R = replicaReparacion(I.zen, I.az, T);
        itsTot += R.its; if (R.tope) nTope++; if (R.guarda) guardaOn++;
        const real = anglesPairwiseRaw(I.zen, I.az, T);
        nCmp++;
        for (let r = 0; r < real.length; r++) if (Math.abs(real[r] - R.out[r]) > 1e-9) { replicaOK = false; break; }
      }

      salida.push({
        preset, tilt,
        ms_total: +tTot.toFixed(1),
        ms_por_politica: tPol,
        ms_tres_caras: +(tPol.mgl + tPol.optimal + tPol.optfree).toFixed(1),
        MV_sol_alto: mvAlto, MV_rasante: mvRasante,
        torsion_max_entre_vecinas: +torMax.toFixed(4),
        parejas: T.pairs.length,
        true3d_atajo_parejas: nPdeg,                       // cuántas toman el atajo
        true3d_atajo_todas: nPdeg === T.pairs.length,
        parejas_con_mas_de_una_estacion: estMulti,
        reparacion_guarda_activa_en_instantes: guardaOn,
        reparacion_iteraciones_totales: itsTot,
        reparacion_instantes_que_agotan_el_tope: nTope,
        replica_coincide_con_el_original: replicaOK,
        instantes_careados: nCmp,
      });
    }
    return { instantes: inst.length, paso_min: PASO, filas: c0.nrows, fecha: c0.date, res: salida };
  }, [TILTS, PRESETS, PASO_MIN]);

  console.log(JSON.stringify(Object.assign({ commit: sha }, res), null, 1));
} finally { await browser.close(); srv.kill(); }
