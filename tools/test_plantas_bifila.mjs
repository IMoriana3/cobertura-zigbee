/* EL ACCIONAMIENTO DE CADA PLANTA SALE DE SU LAYOUT, Y SE LEE DONDE ESTÁ.
 *
 * Reportado en la revisión del 3D: «El Burgo/Bagnarelli monofila — revisar
 * todos». Al revisarlos apareció que el semipaso de fila (`filaZ`) YA estaba
 * declarado en casi todos los layouts y la página miraba en otro sitio: sólo
 * leía `geometria.bifila`, que lo traen tres. Cargar una bífila como monofila
 * DIVIDE EL GCR POR DOS —el parámetro que manda en el backtracking— y quita el
 * acople que obliga a las dos filas de un motor a compartir θ.
 *
 * Medido antes y después, con este mismo cargador:
 *
 *   Fayón      14 → 28 filas · 12,00 → 6,00 m · GCR 0,199 → 0,397
 *   Polvorín   39 → 78 filas ·  9,00 → 4,50 m · GCR 0,265 → 0,529
 *   Benante    45 → 90 filas · 10,48 → 5,24 m · GCR 0,227 → 0,455
 *   Panbianco  46 → 92 filas · 10,48 → 5,24 m · GCR 0,227 → 0,455
 *   El Burgo y Páramo: NO se mueven (ya iban bien)
 *
 * Este banco no mira cómo está escrito el cargador: carga cada planta y exige
 * la propiedad —el GCR que sale del filaZ declarado, las parejas de un motor, y
 * que Páramo siga monofila porque su layout declara filaZ 0—. Y el caso MIXTO
 * (una línea con bífilas y monofilas a la vez), que ningún dato real ejercita,
 * va con un layout SINTÉTICO servido por interceptación, para que ese camino no
 * quede sin probar.
 *
 *     node tools/test_plantas_bifila.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8290 + (process.pid % 400);
let ok = 0, ko = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { ko++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')); } };

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2000);

  const carga = async (n) => {
    await pg.evaluate((nm) => { window.__done = false; window.__err = null;
      loadLayoutPlant(nm).then(() => { window.__done = true; }).catch(e => { window.__err = String(e); window.__done = true; }); }, n);
    await pg.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
    await pg.waitForTimeout(250);
    return pg.evaluate(() => {
      const P = PLANT_REAL || {}, gs = P.groups || [];
      const en = new Set(); gs.forEach(g => g.forEach(x => en.add(x)));
      const nR = P.elev ? P.elev.length : 0;
      const ordenadas = P.lineX ? P.lineX.every((x, i) => i === 0 || x >= P.lineX[i - 1] - 1e-9) : false;
      return { nR, pitch: P.pitch, gcr: P.cw && P.pitch ? +(P.cw / P.pitch).toFixed(3) : null,
               pares: gs.length, sueltas: nR - en.size, grupos: gs, lineX: P.lineX, ordenadas,
               casilla: document.getElementById('drive').value,
               nota: ((document.getElementById('realnote') || {}).textContent || '').replace(/\s+/g, ' '),
               err: window.__err };
    });
  };

  /* ── 1. las plantas reales, contra el GCR que sale de su filaZ declarado ── */
  const CASOS = [
    { n: 'elburgo',   nR: 90, pitch: 6.00, gcr: 0.397, pares: 45, bi: true },
    { n: 'fayon',     nR: 28, pitch: 6.00, gcr: 0.397, pares: 14, bi: true },
    { n: 'polvorin',  nR: 78, pitch: 4.50, gcr: 0.529, pares: 39, bi: true },
    { n: 'benante',   nR: 90, pitch: 5.24, gcr: 0.455, pares: 45, bi: true },
    { n: 'panbianco', nR: 92, pitch: 5.24, gcr: 0.455, pares: 46, bi: true },
  ];
  for (const c of CASOS) {
    const r = await carga(c.n);
    check(`${c.n}: ${c.nR} filas a ${c.pitch.toFixed(2)} m, GCR ${c.gcr} y ${c.pares} parejas de un motor`,
          !r.err && r.nR === c.nR && Math.abs(r.pitch - c.pitch) < 0.01 && Math.abs(r.gcr - c.gcr) < 0.002 && r.pares === c.pares && r.casilla === 'bifila',
          `${r.nR} filas · ${r.pitch} m · GCR ${r.gcr} · parejas ${r.pares} · casilla ${r.casilla}${r.err ? ' · ' + r.err : ''}`);
    check(`${c.n}: ninguna fila se queda sin su motor`, r.sueltas === 0, 'sueltas ' + r.sueltas);
  }

  /* ── 2. PÁRAMO: filaZ 0 es un DATO, no un hueco ──
     Su layout lo razona: «filaZ = 0 porque el bloque es 1V (una fila). Cuadra
     con la cartera: trk_mono 396, trk_bi 0». Así que tiene que seguir monofila
     Y decir que está DECLARADO, no que no se sabe. */
  const pa = await carga('paramo');
  check('páramo sigue monofila: su layout declara filaZ 0', pa.nR === 65 && pa.pares === 0 && pa.casilla === 'mono',
        `${pa.nR} filas · parejas ${pa.pares} · casilla ${pa.casilla}`);
  check('y la página dice que la monofila está DECLARADA, no que se ignore', /MONOFILA declarada/.test(pa.nota),
        pa.nota.slice(0, 120));

  /* ── 3. el caso MIXTO, con layout sintético ──
     Ningún dato real lo ejercita: los dos monofila de Polvorín caen fuera de la
     sub-rejilla dominante que se simula. Se sirve un layout inventado con una
     línea que lleva bífilas Y un monofila, y se exige lo único fiel: tres filas
     para esa línea, la del monofila en el EJE y SIN motor compartido. */
  const SINT = { plant: 'fayon', title: 'sintético mixto', clat: 41.2, clon: 0.3, filaZ: 3, trackers: [] };
  for (const [x, mono] of [[0, false], [12, false], [24, 'mixta'], [36, false]])
    for (const n of [0, 40, 80]) {
      SINT.trackers.push({ id: `T${x}_${n}`, x, n, t: 'completo', tp: (mono === 'mixta' && n === 40) ? 'Mono 31+31' : '2V14', mods: 28 });
    }
  await pg.route('**/fayon_layout.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SINT) }));
  await pg.evaluate(() => { try { LAYOUT_CACHE.fayon = undefined; } catch (e) { /* si no existe, la carga lo crea */ } });
  const mx = await carga('fayon');
  // 3 líneas puras × 2 filas + 1 línea mixta × 3 filas = 9
  check('línea mixta: la planta sale con 9 filas (3 líneas de 2 + la mixta de 3)', mx.nR === 9, `${mx.nR} filas · lineX ${JSON.stringify(mx.lineX)}`);
  check('el monofila va SOLO, sin motor compartido (1 fila suelta)', mx.sueltas === 1 && mx.pares === 4,
        `sueltas ${mx.sueltas} · parejas ${mx.pares}`);
  /* las TRES filas de la línea mixta, a la vez: las dos vigas a ±filaZ y la del
     monofila justo en medio. Pedir sólo la del eje no comprobaba nada — esa x
     existe también cargando la planta como monofila, y la comprobación pasaba
     igual con el defecto puesto (verificado). */
  const tieneX = (v) => !!mx.lineX && mx.lineX.some(x => Math.abs(x - v) < 0.01);
  check('la línea mixta da sus TRES filas: las dos vigas a ±3 y la del monofila en el eje',
        tieneX(6 - 3) && tieneX(6) && tieneX(6 + 3) && mx.ordenadas,
        `lineX ${JSON.stringify(mx.lineX)} · ordenadas ${mx.ordenadas}`);
  const g = (mx.grupos || []).find(gg => gg.some(i => Math.abs(mx.lineX[i] - (24 - 18 - 3)) < 0.01));
  check('las dos vigas de la mixta siguen siendo un solo motor, saltándose la del monofila',
        !!g && g.length === 2 && Math.abs(mx.lineX[g[1]] - mx.lineX[g[0]] - 6) < 0.01,
        `grupos ${JSON.stringify(mx.grupos)} · lineX ${JSON.stringify(mx.lineX)}`);

  check('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' · '));
  await browser.close();
} finally {
  try { srv.kill(); } catch { /* nada */ }
}
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
