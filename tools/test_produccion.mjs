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
             pairsFromElev,pairsFromElevX,nsSegments,plantFromCotas,policyAngles,
             clearskyIneichen:clearskyIneichen},
          Sol:Sol, elevPreset, buildT, buildTX, buildTReal, elburgoRows, elburgoSegs, invTotals,
          filtraStringsNCU, tCellPVSyst, pStringW, instant, dayTotals, doyOf, localToUTCms};`).call(globalThis);

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
  const T = S.buildTX(S.F, c, rows.map(r => r.x), new Array(rows.length).fill(0), null);
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

// ── energía según el Notebook: la portación JS careada contra el CORE ──
const gld = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'golden_energia_notebook.json'), 'utf-8'));

t('NOTEBOOK: t_cell y P string clavan el golden del core (111 casos, ≤1e-9 rel.)', () => {
  const K = gld.constantes;
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  for (const cs of gld.casos) {
    const tc = S.tCellPVSyst(cs.poa, cs.tair, cs.wind, K.u_c, K.u_v);
    const pw = S.pStringW(cs.poa, cs.tair, cs.wind, { mods: K.mods, wp: K.wp, gamma: K.gamma, uc: K.u_c, uv: K.u_v });
    if (rel(tc, cs.t_cell) > 1e-9) throw new Error(`t_cell(${cs.poa},${cs.tair}) = ${tc} ≠ core ${cs.t_cell}`);
    if (rel(pw, cs.p_string_w) > 1e-9) throw new Error(`P(${cs.poa},${cs.tair}) = ${pw} ≠ core ${cs.p_string_w}`);
  }
  for (const cs of gld.casos_uc_uv) {   // la rama u_v·viento, con u_c/u_v no canónicos
    const tc = S.tCellPVSyst(cs.poa, cs.tair, cs.wind, cs.u_c, cs.u_v);
    const pw = S.pStringW(cs.poa, cs.tair, cs.wind, { mods: K.mods, wp: K.wp, gamma: K.gamma, uc: cs.u_c, uv: cs.u_v });
    if (rel(tc, cs.t_cell) > 1e-9) throw new Error(`t_cell u_v: ${tc} ≠ core ${cs.t_cell}`);
    if (rel(pw, cs.p_string_w) > 1e-9) throw new Error(`P u_v: ${pw} ≠ core ${cs.p_string_w}`);
  }
});

t('E por string: día positivo, y por inversor la SUMA conserva la energía', () => {
  const rows = S.elburgoRows(strdb, 3);
  const c = { ...C, lat: layout.clat, lon: layout.clon, alt: 180, nrows: rows.length,
              cw: layout.montaje.cuerda, maxang: layout.montaje.max_angle };
  const T = S.buildTX(S.F, c, rows.map(r => r.x), new Array(rows.length).fill(0), null);
  const e = { mods: 28, wp: 590, gamma: -0.34, uc: 29, uv: 0 };
  const eDay = S.dayTotals(S.F, c, T, v => S.pStringW(v, 20, 1, e));   // kWh/string
  for (const v of eDay) if (!(v > 50)) throw new Error('string de junio con ' + v + ' kWh: la cadena DC no convierte');
  const iv = S.invTotals(rows, eDay, 'suma');
  const total = iv.reduce((a, v) => a + v.val, 0);
  const porFila = rows.reduce((a, r, i) => a + eDay[i] * r.strs.length, 0);
  if (Math.abs(total - porFila) > 1e-6)
    throw new Error(`la suma por inversores (${total.toFixed(3)}) pierde energía vs por filas (${porFila.toFixed(3)})`);
});

// ── cotas z REALES de extremos de mesa (el mismo cargador que el simulador) ──
const cotasAyora = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const layAyora = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));

t('Ayora: buildTReal usa las cotas z medidas — tilt N-S no nulo, pitch por vano y pairDz del solape', () => {
  const P = S.F.plantFromCotas(cotasAyora, 80, null);
  const c = { ...C, lat: layAyora.clat, lon: layAyora.clon, alt: Math.round(cotasAyora.base),
              nrows: P.elev.length, cw: P.cw, maxang: P.maxAngle, pitch: P.pitch };
  const T = S.buildTReal(S.F, c, P);
  if (T.pairs.length !== P.lineX.length - 1) throw new Error('parejas ' + T.pairs.length + ' ≠ líneas−1');
  // las cotas MEDIDAS tienen que llegar a la T: tilts N-S no todos cero…
  if (!T.rowTilt.some(v => Math.abs(v) > 0.05)) throw new Error('ningún tilt N-S medido llega a la T: cotas ignoradas');
  // …pendiente por pareja desde el Δz del solape (la receta de terrain())…
  let live = 0;
  for (let i = 0; i < T.pairs.length; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    const esperado = Math.atan2(P.pairDz[i] || 0, dx) * (180 / Math.PI);   // *DEG, la op exacta de terrain()
    if (T.pairs[i].slope !== esperado) throw new Error(`pareja ${i}: slope ${T.pairs[i].slope} ≠ ${esperado} (la receta de terrain() se ha separado)`);
    if (Math.abs(T.pairs[i].slope) > 0.05) live++;
  }
  if (!live) throw new Error('todas las pendientes de pareja a cero: el pairDz medido no entra');
  // …y los TRAMOS reales de mesa van en T.segs (poaPlant pondera el solape axial)
  if (!T.segs || T.segs.length !== P.elev.length) throw new Error('sin tramos reales en la T');
  const r = S.instant(S.F, c, T, 720);
  if (r.rows.length !== P.elev.length) throw new Error('rows ' + r.rows.length);
  for (const v of r.rows) if (!Number.isFinite(v) || v < 0) throw new Error('POA no finita: ' + v);
  if (!(r.plant > 300)) throw new Error('mediodía de junio en Ayora con ' + r.plant + ' W/m²');
});

t('El Burgo: los tramos de mesa respetan los CAMINOS del plano (la calle no desaparece)', () => {
  const rows = S.elburgoRows(strdb, 3);
  const segs = S.elburgoSegs(rows);
  // cada string cae dentro de un tramo de SU columna…
  rows.forEach((r, i) => {
    for (const s of r.strs)
      if (!segs[i].some(sg => s.n >= sg[0] - 0.5 && s.n <= sg[1] + 0.5))
        throw new Error('string ' + s.id + ' fuera de todo tramo de su columna');
  });
  // …y los caminos parten columnas: el plano corta ~37 veces (huecos 36–70 m)
  const cortes = segs.reduce((a, l) => a + l.length - 1, 0);
  if (cortes < 20) throw new Error('solo ' + cortes + ' cortes: los caminos del plano no aparecen');
  if (cortes > 120) throw new Error(cortes + ' cortes: las mesas se están troceando de más');
  // ningún tramo más corto que media mesa ni más largo que la columna entera
  for (const l of segs) for (const sg of l)
    if (sg[1] - sg[0] < 12) throw new Error('tramo de ' + (sg[1] - sg[0]).toFixed(1) + ' m: demasiado corto para una mesa');
});

t('ámbito por NCU: el plano se parte en parques SIN perder strings, y cada parque calcula', () => {
  // El Burgo: g.i.t del string → idPrevio del layout → ncu (como terreno.html)
  const mapa = new Map();
  for (const tk of layout.trackers) if (tk.idPrevio != null) mapa.set(String(tk.idPrevio), tk.ncu);
  const ncu1 = S.filtraStringsNCU(strdb, mapa, 1), ncu2 = S.filtraStringsNCU(strdb, mapa, 2);
  const sinNCU = strdb.strings.filter(s => !mapa.has(s.g + '.' + s.i + '.' + s.t)).length;
  if (ncu1.count + ncu2.count + sinNCU !== strdb.count)
    throw new Error(`${ncu1.count}+${ncu2.count}+${sinNCU} ≠ ${strdb.count}: el ámbito pierde strings`);
  if (sinNCU > 8) throw new Error(sinNCU + ' strings sin NCU: el casado g.i.t→idPrevio se ha roto');
  for (const db of [ncu1, ncu2]) {
    if (!(db.count > 300)) throw new Error('parque de NCU con solo ' + db.count + ' strings');
    const rows = S.elburgoRows(db, 3);
    const c = { ...C, nrows: rows.length };
    const T = S.buildTX(S.F, c, rows.map(r => r.x), new Array(rows.length).fill(0), null);
    const r = S.instant(S.F, c, T, 720);
    if (!(r.plant > 300)) throw new Error('el parque de una NCU no calcula (' + r.plant + ' W/m²)');
  }
  // y en cotas (Ayora): el filtrado por ncuOf del layout deja una planta válida
  const ncuOf = (layAyora.trackers && layAyora.trackers.length === cotasAyora.t.length)
    ? layAyora.trackers.map(tk => tk.ncu) : null;
  if (ncuOf) {
    const primera = ncuOf.find(v => v != null);
    const sub = { ...cotasAyora, t: cotasAyora.t.filter((_, i) => ncuOf[i] === primera) };
    const P = S.F.plantFromCotas(sub, 80, null);
    if (!(P.elev.length >= 2)) throw new Error('el parque de la NCU ' + primera + ' no forma planta');
  }
});

t('los presets capan a ±30° por vano (clampSlopes del simulador): sin terrenos inmontables', () => {
  // «ondulado 4 m» fabricaba parejas de 38° y el pairwise clavaba filas a ±55°,
  // que en pantalla se leía como «no está haciendo backtracking». El simulador
  // capa su editor a tan(30°)·pitch; los presets de la tarjeta, igual.
  const lim = 6 * Math.tan(30 * Math.PI / 180) + 1e-9;
  for (const [pre, v] of [['ondulado', 4], ['valle', 6], ['pendiente', 35]]) {
    const z = S.elevPreset(pre, 12, v, 6);
    for (let i = 1; i < z.length; i++)
      if (Math.abs(z[i - 1] - z[i]) > lim)
        throw new Error(`${pre} ${v}: vano ${i} con Δz ${Math.abs(z[i - 1] - z[i]).toFixed(2)} m > tan(30°)·pitch`);
  }
  const T = S.buildT(S.F, { ...C, nrows: 12 }, S.elevPreset('ondulado', 12, 4, 6));
  for (const p of T.pairs) if (Math.abs(p.slope) > 30.001)
    throw new Error('pareja de ' + p.slope.toFixed(1) + '°: el capado no llega a la T');
});

t('MISMO BT que el simulador: los θ del AUTO son policyAngles(pairwise) EXACTOS, día entero', () => {
  // La tarjeta y el BT 3D tienen que dar EL MISMO ángulo, no uno parecido.
  // Dos plantas, barrido del día a paso de 30 min, igualdad === por fila:
  // (a) genérica en pendiente (groups=null → driveCoupleSafe identidad
  //     → pairwise puro), (b) Ayora real con sus grupos bifila de cotas
  //     (el acople por accionamiento del simulador, aplicado aquí igual).
  const P = S.F.plantFromCotas(cotasAyora, 80, null);
  const cAy = { ...C, lat: layAyora.clat, lon: layAyora.clon, alt: Math.round(cotasAyora.base),
                nrows: P.elev.length, cw: P.cw, maxang: P.maxAngle, pitch: P.pitch };
  const TAy = S.buildTReal(S.F, cAy, P);
  if (TAy.drive !== P.drive || TAy.groups !== P.groups)
    throw new Error('la T de cotas no lleva el accionamiento real (' + P.drive + '): el acople del simulador no se aplicaría');
  const elev = S.elevPreset('pendiente', C.nrows, 4, C.pitch);
  const TGen = S.buildT(S.F, C, elev);
  for (const [c, T] of [[C, TGen], [cAy, TAy]]) {
    for (let m = 0; m < 1440; m += 30) {
      const r = S.instant(S.F, c, T, m);
      const g = S.Sol.solarPos(S.localToUTCms(c.date, m, c.tz), c.lat, c.lon, { refract: true });
      const zen = 90 - g.elev, doy = S.doyOf(c.date);
      const irr = S.F.clearskyIneichen(zen, doy, c.alt, C.tl);
      const sim = S.F.policyAngles('pairwise', zen, g.az, T, irr, doy, c.albedo).angles;
      for (let k = 0; k < c.nrows; k++)
        if (r.ang[k] !== sim[k])
          throw new Error(`min ${m}, fila ${k}: tarjeta ${r.ang[k]} ≠ simulador ${sim[k]} — el BT ya no es el mismo`);
    }
  }
  // y la identidad que sostiene a las plantas mono: sin grupos, la política
  // del simulador ES anglesPairwise a pelo (si esto rompe, el careo de arriba
  // ya no justifica «pairwise puro» para genérica/El Burgo)
  const g12 = S.Sol.solarPos(S.localToUTCms(C.date, 720, C.tz), C.lat, C.lon, { refract: true });
  const zen12 = 90 - g12.elev, doy12 = S.doyOf(C.date);
  const irr12 = S.F.clearskyIneichen(zen12, doy12, C.alt, C.tl);
  const pol = S.F.policyAngles('pairwise', zen12, g12.az, TGen, irr12, doy12, C.albedo).angles;
  const raw = S.F.anglesPairwise(zen12, g12.az, TGen);
  for (let k = 0; k < C.nrows; k++)
    if (pol[k] !== raw[k]) throw new Error('con groups=null policyAngles(pairwise) ya no es anglesPairwise puro');
});

console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
