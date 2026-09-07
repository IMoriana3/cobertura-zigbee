/* QA de produccion.html (Producción 3D por string) — sin navegador.

   La página NO lleva física propia: extrae en caliente el bloque FÍSICA PURA
   de backtracking.html (el mismo contrato de delimitadores que usa
   test_backtracking_sim.mjs). Este test hace las DOS cosas que eso obliga:

   a) extrae la LÓGICA PURA de la página (delimitadores propios) y la ejecuta
      en Node con la física real debajo;
   b) carea que lo que la página calcula es EXACTAMENTE lo que da llamar al
      motor a mano — si la T que construye se separa del contrato de
      terrain(), esto se pone rojo antes de que lo vea un usuario.

     node tools/test_produccion.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, ko = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('  ✓ ' + name); }
  catch (e) { ko++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

const bt = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const pg = fs.readFileSync(path.join(ROOT, 'produccion.html'), 'utf-8');
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
          + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');

// física del simulador (mismo troceo que su QA)
const f0 = bt.indexOf('FÍSICA PURA'), f1 = bt.indexOf('/* FIN-FÍSICA');
const fis = bt.slice(bt.lastIndexOf('/*', f0), f1);
// lógica pura de la página
const l0 = pg.indexOf('LÓGICA PURA'), l1 = pg.indexOf('/* FIN-LÓGICA');
if (l0 < 0 || l1 < 0) { console.error('produccion.html sin delimitadores LÓGICA PURA / FIN-LÓGICA'); process.exit(1); }
const log = pg.slice(pg.lastIndexOf('/*', l0), l1);

const S = new Function(sol + fis + log + `
  return {F:{poaPlant,anglesPairwise,anglesManual,skyWithClouds,prodColor,
             pairsFromElev,pairsFromElevX,nsSegments,clearskyIneichen:clearskyIneichen},
          Sol:Sol, elevPreset, buildT, buildTX, elburgoRows, invTotals,
          instant, dayTotals, doyOf, localToUTCms};`).call(globalThis);

console.log('produccion.html — la página come la física del simulador, sin copiarla');

const C = { lat: 41.5763, lon: -0.7981, date: '2026-06-21', tz: 2, alt: 300,
            albedo: 0.20, cc: 0, pitch: 6.0, cw: 2.382, maxang: 55, nrows: 8,
            manual: false, manth: 0, tl: 3.5 };

t('la página extrae la física con los delimitadores-contrato del simulador', () => {
  if (!/FÍSICA PURA/.test(pg) || !/FIN-FÍSICA/.test(pg))
    throw new Error('produccion.html ya no nombra los delimitadores que extrae');
  for (const fn of ['poaPlant', 'anglesPairwise', 'anglesManual', 'skyWithClouds', 'prodColor'])
    if (typeof S.F[fn] !== 'function') throw new Error(fn + ' no salió de la extracción');
});

t('buildT produce una T que el motor ACEPTA (mediodía, POA finita y por fila)', () => {
  const elev = S.elevPreset('pendiente', C.nrows, 4, C.pitch);
  const T = S.buildT(S.F, C, elev);
  const r = S.instant(S.F, C, T, 720);
  if (r.rows.length !== C.nrows) throw new Error('rows ' + r.rows.length + ' ≠ ' + C.nrows);
  for (const v of r.rows) if (!Number.isFinite(v) || v < 0) throw new Error('POA no finita/negativa: ' + v);
  if (!(r.plant > 300)) throw new Error('mediodía de junio con ' + r.plant + ' W/m²: T rota');
});

t('PARIDAD: la página da EXACTAMENTE lo que da llamar al motor a mano', () => {
  const elev = S.elevPreset('pendiente', C.nrows, 4, C.pitch);
  const T = S.buildT(S.F, C, elev);
  const m = 1185; // 19:45 — sombra entre filas, el caso que discrimina
  const r = S.instant(S.F, C, T, m);
  const g = S.Sol.solarPos(S.localToUTCms(C.date, m, C.tz), C.lat, C.lon, { refract: true });
  const zen = 90 - g.elev, doy = S.doyOf(C.date);
  const irr = S.F.clearskyIneichen(zen, doy, C.alt, C.tl);
  const ang = S.F.anglesPairwise(zen, g.az, T);
  const pp = S.F.poaPlant(zen, g.az, T, ang, irr, doy, C.albedo);
  for (let k = 0; k < C.nrows; k++)
    if (r.rows[k] !== pp.rows[k]) throw new Error(`fila ${k}: ${r.rows[k]} ≠ ${pp.rows[k]} — la página ya no es el motor`);
});

t('manual: θ común, recortado, y el POA cambia respecto al AUTO', () => {
  const elev = S.elevPreset('llano', C.nrows, 0, C.pitch);
  const T = S.buildT(S.F, C, elev);
  const cm = { ...C, manual: true, manth: 80 };
  const r = S.instant(S.F, cm, T, 900);
  const ra = S.instant(S.F, C, T, 900);
  if (!r.ang.every(v => v === 55)) throw new Error('80° con tope 55 no recorta (θ=' + r.ang[0] + ')');
  if (Math.abs(r.plant - ra.plant) < 1) throw new Error('manual a tope y AUTO dan lo mismo: el modo no manda');
});

t('nubosidad: 0 es no-op y 100 % deja ~30 % del global (el canónico)', () => {
  const elev = S.elevPreset('llano', C.nrows, 0, C.pitch);
  const T = S.buildT(S.F, C, elev);
  const claro = S.instant(S.F, C, T, 720);
  const nublado = S.instant(S.F, { ...C, cc: 1 }, T, 720);
  const ratio = nublado.irr.ghi / claro.irr.ghi;
  if (Math.abs(ratio - 0.30) > 1e-9) throw new Error('a cc=1 el GHI debe ser 0,30·claro y es ' + ratio.toFixed(4));
  if (nublado.irr.dni !== 0) throw new Error('a cc=1 el haz debe morir (DNI=' + nublado.irr.dni + ')');
});

t('Σ día por string: en AUTO el backtracking iguala; en MANUAL la sombra separa', () => {
  const elev = S.elevPreset('pendiente', C.nrows, 6, C.pitch);
  const T = S.buildT(S.F, C, elev);
  const auto = S.dayTotals(S.F, C, T);
  if (auto.length !== C.nrows) throw new Error('un total por string');
  for (const v of auto) if (!(v > 1)) throw new Error('día de junio con ' + v + ' kWh/m²');
  // El backtracking existe para NO sombrear: en AUTO los strings quedan parejos…
  const sepA = Math.max(...auto) - Math.min(...auto);
  if (!(sepA < 0.05)) throw new Error('AUTO con ' + sepA.toFixed(3) + ' kWh/m² de dispersión: el BT no está evitando la sombra');
  // …y con θ fijo a tope (MANUAL) la sombra entra de madrugada/tarde y separa.
  const man = S.dayTotals(S.F, { ...C, manual: true, manth: 50 }, T);
  const sepM = Math.max(...man) - Math.min(...man);
  if (!(sepM > sepA + 0.01)) throw new Error('MANUAL a 50° no separa más que AUTO (' + sepM.toFixed(3) + ' vs ' + sepA.toFixed(3) + '): la sombra no entra en los totales');
});

// ── El Burgo real: los 823 strings del plano, agregados por inversor ──
const strdb = JSON.parse(fs.readFileSync(path.join(ROOT, 'elburgo_strings.json'), 'utf-8'));
const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'elburgo_layout.json'), 'utf-8'));

t('El Burgo: 823 strings → columnas E-O contiguas a ~6 m (el bifilo partido se funde)', () => {
  const rows = S.elburgoRows(strdb, 3);
  const total = rows.reduce((a, r) => a + r.strs.length, 0);
  if (total !== strdb.count) throw new Error(`se pierden strings: ${total} ≠ ${strdb.count}`);
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].x - rows[i - 1].x;
    if (d < 5 || d > 7) throw new Error(`vano ${i} de ${d.toFixed(2)} m: la fusión de columnas no casa con el plano (paso 6 m)`);
  }
  if (rows.length < 85 || rows.length > 94) throw new Error(rows.length + ' filas: fuera de lo que dibuja el plano');
});

t('El Burgo: buildTX (pitch por vano) + motor → POA por fila finita y de mediodía', () => {
  const rows = S.elburgoRows(strdb, 3);
  const c = { ...C, lat: layout.clat, lon: layout.clon, alt: 180, nrows: rows.length,
              cw: layout.montaje.cuerda, maxang: layout.montaje.max_angle };
  const T = S.buildTX(S.F, c, rows.map(r => r.x));
  const r = S.instant(S.F, c, T, 720);
  if (r.rows.length !== rows.length) throw new Error('rows ' + r.rows.length + ' ≠ ' + rows.length);
  for (const v of r.rows) if (!Number.isFinite(v) || v < 0) throw new Error('POA no finita/negativa: ' + v);
  if (!(r.plant > 300)) throw new Error('mediodía de junio con ' + r.plant + ' W/m²: T real rota');
});

t('El Burgo: agregado por inversor — 36 inversores, 823 strings, medias acotadas', () => {
  const rows = S.elburgoRows(strdb, 3);
  const vals = rows.map((_, i) => 100 + i);            // valores distinguibles por fila
  const iv = S.invTotals(rows, vals);
  if (iv.length !== Object.keys(strdb.byInv).length)
    throw new Error(iv.length + ' inversores ≠ ' + Object.keys(strdb.byInv).length + ' del plano');
  const nsum = iv.reduce((a, v) => a + v.nstr, 0);
  if (nsum !== strdb.count) throw new Error('los inversores reparten ' + nsum + ' strings, no ' + strdb.count);
  for (const v of iv) {
    if (strdb.byInv[v.inv] !== v.nstr) throw new Error('inversor ' + v.inv + ': ' + v.nstr + ' strings ≠ ' + strdb.byInv[v.inv] + ' del plano');
    if (v.val < 100 || v.val > 100 + rows.length) throw new Error('media del inversor ' + v.inv + ' fuera de rango');
  }
});

console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
