/* R4 — LA REJILLA DE DOS EJES: IRREGULARIDAD DEL TERRENO × POLÍTICA
 *
 * El formato es el de la diapositiva de Solargik («Smart Backtracking – Highly
 * complex ground»): las filas degradan el terreno, las columnas vuelven la
 * política más agresiva, y cada celda es la ganancia frente a la baseline. Lo
 * que se lee no es una celda: es EL PATRÓN —que empeore hacia abajo y mejore
 * hacia la derecha— y que el signo cambie donde tiene que cambiar.
 *
 * LO QUE AÑADIMOS A ESE FORMATO, que es justo lo que a esa tabla le falta:
 *   · DENOMINADOR explícito: la POA de planta del día de `pairwise`, con su
 *     valor absoluto publicado. Un «+2,3 %» sin denominador no es una medida.
 *   · VARIANTE: cada celda se mide en TRES fechas (21-mar, 21-jun, 21-dic) y
 *     se publica el intervalo, no un punto. Dos celdas cuyos intervalos se
 *     solapan no están separadas, y la tabla lo dice.
 *   · QUÉ MAGNITUD: POA de planta NETA del modelo Martinez —la pérdida
 *     eléctrica ya dentro—, no sombra óptica. Son dos cosas distintas y
 *     mezclarlas es el error que R3 persiguió media auditoría.
 *   · QUÉ MANDA Y QUÉ MIDE: el ángulo pasa por el LAZO de control (banda
 *     muerta y velocidad del actuador) antes de puntuarse, así que la cifra es
 *     lo que la planta EJECUTA y no lo que la política pide.
 *   · Y la fila del terreno dice de qué es la amplitud, que en la diapositiva
 *     hay que deducirlo.
 *
 * TEST NULO delante de todo: la rejilla tiene que DISTINGUIR. Si todas las
 * celdas de una fila salieran iguales, esa fila no informaría de nada.
 *
 *     node audit4/F_rejilla_energia.mjs [--json=audit4/out/rejilla.json]
 */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, solarPos, clearskyIneichen,
  mulberry32, driveGroups, effRowTilts, nsSegments, pairsFromElev, rotulaMesas, crearLazo, topeBacktracking };`)();
const RAD = Math.PI / 180;
const VER = /const VER='([^']+)'/.exec(html)[1];
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();

/* ── el terreno: pendiente E-O FIJA y fluctuación N-S variable ──────────────
   Las mismas rutinas que usa el barrido de CI, para que esto no sea una
   segunda verdad sobre cómo se construye un terreno. */
function elevPreset(v, n, pitch) {
  const z = new Array(n).fill(0);
  for (let i = 0; i < n; i++) z[i] = -i * pitch * Math.tan(v * RAD);
  return z;
}
const nsSenoidal = (v, n) => Array.from({ length: n }, (_, i) => v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2))));
function mkT(c) {
  const ELEV = elevPreset(c.pendienteEO, c.nrows, c.pitch);
  const groups = F.driveGroups(c.nrows, c.drive);
  const eff = F.effRowTilts(nsSenoidal(c.fluctNS, c.nrows), c.drive, groups);
  const filaLen = 2 * c.mods * 1.146 + 0.55;
  const segs = F.nsSegments(c.nrows, 'alineadas', 1, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(s => s.slice());
  return { pairs: F.pairsFromElev(ELEV, c.pitch, eff), cw: c.cw, axisAz: 0, maxAngle: c.maxang,
           gcr: c.cw / c.pitch, z0: 0.17, nBypass: c.nbp, iam: c.iam, rowTilt: eff, groups,
           drive: c.drive, segs, filaLen };
}

/* de la más prudente a la más agresiva, que es el orden que hace legible la
   tabla: pairwise es la BASELINE y su columna es 0 por construcción */
const COLS = [
  { key: 'pairwise', nm: 'Pairwise (baseline)' },
  { key: 'true3d',   nm: 'True-3D' },
  { key: 'mgl',      nm: 'Min ground light' },
  { key: 'optimal',  nm: 'Energy-optimal' },
  { key: 'optfree',  nm: 'Óptimo libre' },
  { key: 'astro',    nm: 'Astronómico (sin BT)' },
];
const FILAS = [0.5, 1, 2, 3, 4];               // amplitud de la fluctuación N-S, en grados
const DIAS = [['21-mar', Date.UTC(2026, 2, 21), 80], ['21-jun', Date.UTC(2026, 5, 21), 172], ['21-dic', Date.UTC(2026, 11, 21), 355]];
const SITIO = { nm: 'Zaragoza', lat: 41.5763, lon: -0.7981, alt: 300, tl: 3.5 };
const BASE = { pendienteEO: 10, nrows: 8, pitch: 6, cw: 2.382, maxang: 55, nbp: 2, iam: 0.05, mods: 28, drive: 'bifila' };
const PASO_MIN = 20, ALB = 0.2;

/* la POA del día de una política, PASADA POR EL LAZO: lo que la planta ejecuta */
function diaDe(key, T, dia, doy) {
  const LZ = F.crearLazo();
  let acc = 0, n = 0;
  for (let m = 0; m < 1440; m += PASO_MIN) {
    const g = F.solarPos(dia + m * 60000, SITIO.lat, SITIO.lon);
    if (!(g.elev > 0)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, SITIO.alt, SITIO.tl);
    const a = F.policyAngles(key, g.zen, g.az, T, irr, doy, ALB).angles;
    const lim = F.topeBacktracking(g.zen, g.az, T, a, LZ.paso(a, PASO_MIN * 60));
    acc += F.poaPlant(g.zen, g.az, T, lim, irr, doy, ALB).plant;
    n++;
  }
  return { poa: acc, n };
}

const t0 = Date.now();
const celdas = {};
for (const flu of FILAS) {
  const T = mkT(Object.assign({}, BASE, { fluctNS: flu }));
  for (const [nmDia, dia, doy] of DIAS) {
    const base = diaDe('pairwise', T, dia, doy);
    for (const c of COLS) {
      const r = c.key === 'pairwise' ? base : diaDe(c.key, T, dia, doy);
      const k = flu + '|' + c.key;
      (celdas[k] = celdas[k] || { dias: {} }).dias[nmDia] = {
        pct: +(100 * (r.poa / base.poa - 1)).toFixed(3),
        poa_dia_Wm2: +r.poa.toFixed(1), base_Wm2: +base.poa.toFixed(1), instantes: r.n };
    }
    console.error(`  ±${flu}° · ${nmDia} · listo · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}

/* ── TEST NULO: la rejilla tiene que distinguir ─────────────────────────── */
const nulo = { filasQueNoDistinguen: [], columnaQueNoSepara: [] };
for (const flu of FILAS) {
  const v = COLS.map(c => celdas[flu + '|' + c.key].dias['21-jun'].pct);
  if (Math.max(...v) - Math.min(...v) < 1e-6) nulo.filasQueNoDistinguen.push(flu);
}
for (const c of COLS) {
  const v = FILAS.map(f => celdas[f + '|' + c.key].dias['21-jun'].pct);
  if (Math.max(...v) - Math.min(...v) < 1e-6) nulo.columnaQueNoSepara.push(c.key);
}

const salida = {
  commit: sha, ver: VER, generado: new Date().toISOString().slice(0, 10),
  que_mide: 'POA de planta NETA (Martinez dentro) del día, integrada sobre los instantes con sol, con el ángulo PASADO POR EL LAZO de control (banda muerta + velocidad del actuador) y por el tope del backtracking',
  denominador: 'la POA de planta del día de `pairwise` en la MISMA fila, publicada en valor absoluto en cada celda',
  eje_filas: 'amplitud de la fluctuación N-S (perfil senoidal) sobre una pendiente E-O FIJA de ' + BASE.pendienteEO + '°',
  eje_columnas: 'política, de la más prudente a la más agresiva',
  geometria: BASE, sitio: SITIO, paso_min: PASO_MIN, fechas: DIAS.map(d => d[0]),
  test_nulo: nulo, segundos: +((Date.now() - t0) / 1000).toFixed(1), celdas,
};
const dest = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7) || 'audit4/out/rejilla.json';
fs.mkdirSync(path.dirname(path.join(ROOT, dest)), { recursive: true });
fs.writeFileSync(path.join(ROOT, dest), JSON.stringify(salida, null, 1));
console.error(`  rejilla → ${dest} · ${salida.segundos} s`);
console.log(JSON.stringify({ test_nulo: nulo, segundos: salida.segundos }, null, 1));
