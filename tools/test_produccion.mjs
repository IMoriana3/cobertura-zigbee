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
          Sol:Sol, elevPreset, buildT, buildTX, buildTReal, elburgoRows, elburgoSegs, elburgoGroups,
          invTotals, filtraStringsNCU, ncuPorCoordenadas, tCellPVSyst, pStringW,
          dcLossEta, invAC, gridLimit, invMapUniforme, strPdc, acPlant, dayAC,
          tmyAt, tmyFromPVGIS, numES, parseMedidas, careoMedidas,
          instant, dayTotals, dayEnergy, fechasPeriodo, doyOf, localToUTCms};`).call(globalThis);

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

t('El Burgo: una MESA por tracker y viga del layout, con caminos y sin vanos fabricados', () => {
  const vigasX = [];
  for (const tk of layout.trackers) vigasX.push(tk.x - 3, tk.x + 3);
  const rows = S.elburgoRows(strdb, 3, vigasX);
  // columnas ancladas a las vigas del layout: TODOS los vanos a 6 m clavados
  // (la media ponderada de las líneas partidas fabricaba un vano de 5,73 m y
  // dos inversores «producían menos» al atardecer por un vano que no existe)
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].x - rows[i - 1].x;
    if (Math.abs(d - 6) > 0.05) throw new Error(`vano ${i} de ${d.toFixed(2)} m ≠ 6,00: columnas sin anclar a las vigas del layout`);
  }
  const segs = S.elburgoSegs(rows, layout.trackers);
  // una mesa por viga del layout (430) + las de los strings sin tracker (1.18.7)
  const nTramos = segs.reduce((a, l) => a + l.length, 0);
  if (nTramos < 428 || nTramos > 440)
    throw new Error(nTramos + ' mesas: deberían ser ~430 vigas del layout (+huérfanas) — o desaparecen trackers o se fabrican');
  // cada string casado cae dentro de un tramo de su columna
  rows.forEach((r, i) => {
    for (const s of r.strs)
      if (!segs[i].some(sg => s.n >= sg[0] - 0.5 && s.n <= sg[1] + 0.5))
        throw new Error('string ' + s.id + ' fuera de todo tramo de su columna');
  });
  // los CAMINOS siguen: huecos > 8 m entre mesas consecutivas de una columna
  let caminos = 0;
  for (const l of segs) for (let k = 1; k < l.length; k++) if (l[k][0] - l[k - 1][1] > 8) caminos++;
  if (caminos < 20) throw new Error('solo ' + caminos + ' huecos de camino: la calle vuelve a desaparecer');
  // y en llano, a la caída del sol NINGUNA columna produce distinto (el
  // artefacto daba 177 vs 185 W/m² a las 20:40)
  const c = { ...C, nrows: rows.length };
  const T = S.buildTX(S.F, c, rows.map(r => r.x), new Array(rows.length).fill(0), null, segs);
  const r = S.instant(S.F, c, T, 1240);
  const mn = Math.min(...r.rows), mx = Math.max(...r.rows);
  if (mx - mn > 1) throw new Error(`a las 20:40 en llano hay ${(mx - mn).toFixed(2)} W/m² de dispersión: queda algún vano fabricado`);
});

t('El Burgo es BIFILA: 45 unidades de dos vigas, θ ACOPLADO y motor solo en la viga oeste', () => {
  const rows = S.elburgoRows(strdb, 3);
  const xs = rows.map(r => r.x);
  const groups = S.elburgoGroups(xs, layout.trackers);
  const pares = groups.filter(g => g.length === 2);
  // «45 columnas de seguidores = 90 filas» (layout.geometria)
  if (pares.length < 42) throw new Error('solo ' + pares.length + ' unidades bifila de ~45');
  for (const g of pares) {
    const d = xs[g[1]] - xs[g[0]];
    if (Math.abs(d - 6) > 1.2) throw new Error('vigas de una unidad a ' + d.toFixed(2) + ' m (≠6): el emparejado no es el bifilo del layout');
  }
  // θ común por unidad: con drive bifila, cada pareja comparte el θ EXACTO…
  const segs = S.elburgoSegs(rows, layout.trackers);
  const c = { ...C, nrows: rows.length };
  const z = new Array(rows.length).fill(0);
  const T = S.buildTX(S.F, c, xs, z, null, segs, groups, 'bifila');
  const r = S.instant(S.F, c, T, 1140);   // 19:00 — donde el acople muerde
  for (const g of pares)
    if (r.ang[g[0]] !== r.ang[g[1]])
      throw new Error(`unidad ${g[0]}-${g[1]}: θ ${r.ang[g[0]]} ≠ ${r.ang[g[1]]} — el accionamiento no acopla`);
  // …y el acople se ejercita donde muerde: El Burgo es plano (en mono las
  // vigas ya coinciden solas), así que un z sintético en escalón alterno las
  // desiguala — SIN grupos difieren, CON los MISMOS grupos vuelven a compartir
  const zPert = xs.map((_, i) => (i % 2) * 0.8);
  const rSin = S.instant(S.F, c, S.buildTX(S.F, c, xs, zPert, null, segs), 1140);
  if (!pares.some(g => rSin.ang[g[0]] !== rSin.ang[g[1]]))
    throw new Error('el escalón sintético no desiguala ninguna pareja: el careo del acople es vacío');
  const rCon = S.instant(S.F, c, S.buildTX(S.F, c, xs, zPert, null, segs, groups, 'bifila'), 1140);
  for (const g of pares)
    if (rCon.ang[g[0]] !== rCon.ang[g[1]])
      throw new Error(`con escalón y grupos, la unidad ${g[0]}-${g[1]} no acopla (${rCon.ang[g[0]]} ≠ ${rCon.ang[g[1]]})`);
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
  // y en cotas (Ayora): layout 751 ≠ cotas 754, así que el 1:1 NO vale — el
  // casado va por COORDENADAS y tiene que cubrir la planta (el `if (ncuOf)`
  // que aquí callaba cuando no alineaba es exactamente como se escapó el bug
  // de «elijo NCU y me carga la planta entera»)
  if (layAyora.trackers.length === cotasAyora.t.length)
    throw new Error('Ayora ahora alinea 1:1 (' + layAyora.trackers.length + '): este careo vigila el camino por coordenadas — revísalo');
  const m = S.ncuPorCoordenadas(cotasAyora, layAyora.trackers);
  if (m.casados < cotasAyora.t.length * 0.9)
    throw new Error('solo ' + m.casados + '/' + cotasAyora.t.length + ' trackers de Ayora casan con su NCU por coordenadas');
  const primera = m.ncuOf.find(v => v != null);
  const sub = { ...cotasAyora, t: cotasAyora.t.filter((_, i) => m.ncuOf[i] === primera) };
  const Pn = S.F.plantFromCotas(sub, 80, null);
  const Pf = S.F.plantFromCotas(cotasAyora, 80, null);
  if (!(Pn.elev.length >= 2)) throw new Error('el parque de la NCU ' + primera + ' no forma planta');
  if (!(Pn.elev.length < Pf.elev.length))
    throw new Error(`NCU ${primera} con ${Pn.elev.length} líneas = planta entera (${Pf.elev.length}): el filtro no recorta`);
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

// ── cadena AC según el Notebook: la portación JS careada contra el CORE ──
const gac = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'golden_ac_notebook.json'), 'utf-8'));

t('AC NOTEBOOK: inversor, pérdidas DC y límite de red clavan el golden del core (≤1e-9 rel.)', () => {
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  // el barrido del golden CRUZA los límites: recorte (ratio>1), tope de ratio
  // (1.5) y la zona de carga mínima — sin ellos, quitar el clip daría verde
  if (!gac.inversor.some(cs => cs.p_dc_w > cs.p_ac_nom_w * 1.6))
    throw new Error('el golden ya no cruza el tope de ratio 1.5: regenera con casos de recorte');
  for (const cs of gac.inversor) {
    const r = S.invAC(cs.p_dc_w, cs.p_ac_nom_w, cs.eta_max);
    if (rel(r.pac, cs.p_ac_w) > 1e-9) throw new Error(`invAC(${cs.p_dc_w},${cs.p_ac_nom_w}): pac ${r.pac} ≠ core ${cs.p_ac_w}`);
    if (rel(r.eta, cs.eta) > 1e-9) throw new Error(`invAC(${cs.p_dc_w},${cs.p_ac_nom_w}): η ${r.eta} ≠ core ${cs.eta}`);
  }
  for (const cs of gac.perdidas_dc) {
    const eta = S.dcLossEta({ soiling: cs.soiling, mismatch: cs.mismatch, wiring: cs.wiring, lid: cs.lid });
    if (rel(eta, cs.eta) > 1e-9) throw new Error(`dcLossEta(${cs.soiling},${cs.mismatch},${cs.wiring},${cs.lid}) = ${eta} ≠ core ${cs.eta}`);
    if (rel(1000000 * eta, cs.p_out_w) > 1e-9) throw new Error('la pérdida DC aplicada se separa del core');
  }
  for (const cs of gac.limite_red) {
    const out = S.gridLimit(cs.p_ac_w, cs.p_max_w);
    if (rel(out, cs.p_out_w) > 1e-9) throw new Error(`gridLimit(${cs.p_ac_w},${cs.p_max_w}) = ${out} ≠ core ${cs.p_out_w}`);
  }
});

t('acPlant conserva la energía DC, cuenta los recortes, y bajar Pnom nunca SUBE el AC', () => {
  const rows = S.elburgoRows(strdb, 3);
  const strInv = rows.map(r => r.strs.map(s => s.inv));
  const poa = rows.map((_, i) => 700 + (i % 7) * 10);
  const e = { mods: 28, wp: 590, gamma: -0.34, uc: 29, uv: 0 };
  const por = S.strPdc(poa, strInv, { tamb: 20, wind: 1 }, e);
  if (por.length !== strdb.count) throw new Error(por.length + ' strings en la cadena AC ≠ ' + strdb.count + ' del plano');
  const ac = { loss: { soiling: 2, mismatch: 2, wiring: 1.5, lid: 1.5 }, pnomW: 330000, etaMax: 0.985, gridW: 0 };
  const a = S.acPlant(por, ac);
  if (a.invs.length !== Object.keys(strdb.byInv).length)
    throw new Error(a.invs.length + ' inversores ≠ ' + Object.keys(strdb.byInv).length + ' del plano');
  for (const v of a.invs)
    if (strdb.byInv[v.inv] !== v.nstr) throw new Error('inversor ' + v.inv + ' con ' + v.nstr + ' strings ≠ plano');
  const sumStr = por.reduce((s, v) => s + v.pdcW, 0);
  if (Math.abs(a.pdcW - sumStr) / sumStr > 1e-12)
    throw new Error('la suma DC por inversores pierde energía: ' + a.pdcW + ' ≠ ' + sumStr);
  // recorte: con Pnom pequeña TODOS recortan y el AC de planta es n·Pnom exacto
  const chico = S.acPlant(por, { ...ac, pnomW: 100000 });
  if (chico.clips !== chico.invs.length) throw new Error('con Pnom 100 kW deberían recortar todos (' + chico.clips + ')');
  if (Math.abs(chico.pacW - chico.invs.length * 100000) > 1e-6)
    throw new Error('recortando todos, el AC de planta debe ser n·Pnom exacto');
  // monotonía: bajar Pnom nunca sube el AC de ningún inversor
  for (let i = 0; i < a.invs.length; i++)
    if (chico.invs[i].pacW > a.invs[i].pacW + 1e-9)
      throw new Error('bajar Pnom SUBE el AC del inversor ' + a.invs[i].inv);
  // y el límite de red recorta la suma, no los inversores
  const red = S.acPlant(por, { ...ac, gridW: 5000000 });
  if (red.redW !== Math.min(red.pacW, 5000000)) throw new Error('el límite de red no es min(pac, límite)');
});

t('dayAC integra la cadena PASO A PASO (Σ por inversor ≡ Σ de planta) y el recorte muerde', () => {
  const c = { ...C, nrows: 6, elec: { mods: 28, wp: 590, gamma: -0.34, tamb: 20, wind: 1, uc: 29, uv: 0 } };
  const T = S.buildT(S.F, c, S.elevPreset('llano', 6, 0, C.pitch));
  const strInv = S.invMapUniforme(6, 2).map(v => [v]);
  const ac = { loss: { soiling: 2, mismatch: 2, wiring: 1.5, lid: 1.5 }, pnomW: 40000, etaMax: 0.985, gridW: 0 };
  const d = S.dayAC(S.F, c, T, strInv, ac, 30);
  const porInv = d.porInv.reduce((s, v) => s + v.kwh, 0);
  if (Math.abs(porInv - d.eacKwh) / d.eacKwh > 1e-9)
    throw new Error('Σ por inversor ' + porInv + ' ≠ E AC de planta ' + d.eacKwh);
  if (!(d.eacKwh > 0 && d.eacKwh < d.edcKwh))
    throw new Error('E AC (' + d.eacKwh + ') debe ser positiva y menor que la DC (' + d.edcKwh + ')');
  // el recorte muerde a mediodía y la integral lo recoge PASO A PASO: con el
  // MISMO Pnom, la suma sin clip (pdcNet·η, la curva sin el min) debe superar
  // a la de dayAC. (Comparar contra un Pnom holgado NO vale: la curva η del
  // PVWatts castiga la carga parcial y un inversor sobredimensionado pierde
  // más por η que lo que el clip quita — medido: 858 vs 937 kWh.)
  let sinClip = 0, clipVisto = false;
  for (let m = 0; m < 1440; m += 30) {
    const r = S.instant(S.F, c, T, m);
    const x = S.acPlant(S.strPdc(r.rows, strInv, r.met, c.elec), ac);
    if (x.clips > 0) clipVisto = true;
    for (const v of x.invs) sinClip += v.pdcNetW * v.eta;
  }
  sinClip *= 30 / 60 / 1000;
  if (!clipVisto) throw new Error('con Pnom 40 kW nadie recorta a mediodía: el caso no ejercita el clip');
  if (!(sinClip > d.eacKwh + 1))
    throw new Error('quitar el recorte no sube la E AC (' + sinClip.toFixed(1) + ' vs ' + d.eacKwh.toFixed(1) + '): el clipping no muerde en la integral');
});

t('invMapUniforme: bloques contiguos, todos los strings repartidos, n inversores exactos', () => {
  const m = S.invMapUniforme(10, 3);
  if (m.length !== 10) throw new Error('longitud');
  if (new Set(m).size !== 3) throw new Error('deberían salir 3 inversores, salen ' + new Set(m).size);
  for (let i = 1; i < m.length; i++)
    if (m[i] < m[i - 1]) throw new Error('el reparto no es por bloques contiguos');
});

// ── meteo TMY: interpolación, huso y consumo por instant() ──
t('TMY: en la hora exacta devuelve el dato clavado, interpola el punto medio y respeta el huso', () => {
  const H = 8760, h = [];
  for (let i = 0; i < H; i++) h.push([i % 1000, (i * 2) % 1000, (i * 3) % 500, 10 + (i % 30), i % 12]);
  const tmy = { h: h };
  // doy=2, 03:00 local, tz=2 → hora UTC 24+1=25
  const a = S.tmyAt(tmy, 2, 180, 2);
  if (a.ghi !== h[25][0] || a.tamb !== h[25][3]) throw new Error('hora exacta con huso: índice UTC mal (' + a.ghi + ')');
  // punto medio entre 25 y 26
  const b = S.tmyAt(tmy, 2, 210, 2);
  const esp = (h[25][0] + h[26][0]) / 2;
  if (Math.abs(b.ghi - esp) > 1e-9) throw new Error('interpolación del punto medio: ' + b.ghi + ' ≠ ' + esp);
  // la madrugada del 1-ene con huso positivo cae en el 31-dic del TMY (envuelve, no revienta)
  const w = S.tmyAt(tmy, 1, 0, 2);
  if (w.ghi !== h[H - 2][0]) throw new Error('el envolvente de fin de año no cae donde toca');
});

t('TMY: instant() la CONSUME — mismos números que el cielo cuando el TMY trae el cielo', () => {
  // TMY sintética que en la hora exacta lleva EXACTAMENTE el cielo Ineichen del
  // instante (tz=0, minuto en punto): el camino TMY debe dar la MISMA POA bit a
  // bit — si difiere, instant() no está leyendo la meteo que dice leer.
  const c0 = { ...C, tz: 0, elec: { mods: 28, wp: 590, gamma: -0.34, tamb: 20, wind: 1, uc: 29, uv: 0 } };
  const T = S.buildT(S.F, c0, S.elevPreset('pendiente', C.nrows, 4, C.pitch));
  const doy = S.doyOf(c0.date), H = 8760, h = [];
  for (let i = 0; i < H; i++) h.push([0, 0, 0, 20, 1]);
  for (let hr = 0; hr < 24; hr++) {
    const g = S.Sol.solarPos(S.localToUTCms(c0.date, hr * 60, 0), c0.lat, c0.lon, { refract: true });
    const irr = S.F.clearskyIneichen(90 - g.elev, doy, c0.alt, C.tl);
    h[(doy - 1) * 24 + hr] = [irr.ghi, irr.dni, irr.dhi, 20, 1];
  }
  const cT = { ...c0, meteo: 'tmy', tmy: { h: h } };
  for (const m of [600, 720, 900]) {   // horas en punto: la interpolación es identidad
    const rT = S.instant(S.F, cT, T, m), rC = S.instant(S.F, c0, T, m);
    for (let k = 0; k < c0.nrows; k++)
      if (rT.rows[k] !== rC.rows[k])
        throw new Error(`min ${m} fila ${k}: TMY ${rT.rows[k]} ≠ cielo ${rC.rows[k]} — instant no come el TMY`);
  }
  // y la Tamb/viento del TMY llegan a la energía: con un TMY a 45 °C la E del
  // día BAJA respecto a los inputs fijos de 20 °C (γ negativa)
  const hHot = h.map(r => [r[0], r[1], r[2], 45, 0]);
  const eHot = S.dayEnergy(S.F, { ...cT, tmy: { h: hHot } }, T, c0.date, 60, (v, met) => S.pStringW(v, met.tamb, met.wind, c0.elec));
  const eStd = S.dayEnergy(S.F, cT, T, c0.date, 60, (v, met) => S.pStringW(v, met.tamb, met.wind, c0.elec));
  if (!(eHot[0] < eStd[0] * 0.97))
    throw new Error('a 45 °C la energía no baja (' + eHot[0] + ' vs ' + eStd[0] + '): la Tamb del TMY no llega a la t_cell');
});

t('tmyFromPVGIS: condensa la respuesta de la API y rechaza un TMY corto', () => {
  const mk = n => ({ outputs: { tmy_hourly: Array.from({ length: n }, (_, i) => ({
    'time(UTC)': '20090101:0000', 'T2m': 15.5, 'G(h)': 100 + i % 5, 'Gb(n)': 200, 'Gd(h)': 50, 'WS10m': 3.2, 'RH': 60 })) } });
  const d = S.tmyFromPVGIS(mk(8760));
  if (d.h.length !== 8760) throw new Error('longitud');
  if (d.h[0][0] !== 100 || d.h[0][1] !== 200 || d.h[0][2] !== 50 || d.h[0][3] !== 15.5 || d.h[0][4] !== 3.2)
    throw new Error('las columnas no casan con G(h)/Gb(n)/Gd(h)/T2m/WS10m');
  let peto = false;
  try { S.tmyFromPVGIS(mk(8000)); } catch (e) { peto = true; }
  if (!peto) throw new Error('un TMY de 8000 horas debería rechazarse, no consumirse a medias');
});

// ── careo con medida + agregados ──
t('parseMedidas/careoMedidas: formatos es/en, prefijo I, y lo que no casa se LISTA', () => {
  const med = S.parseMedidas('1.1;1234,5\nI2.3, 987.6\n3.1\t1.234,5\nbasura\n');
  if (med.size !== 3) throw new Error(med.size + ' medidas de 3');
  if (med.get('1.1') !== 1234.5 || med.get('2.3') !== 987.6 || med.get('3.1') !== 1234.5)
    throw new Error('los números es/en no se leen igual: ' + [...med.entries()].join(' '));
  const rows = S.careoMedidas([{ inv: '1.1', kwh: 1200 }, { inv: '9.9', kwh: 500 }], med);
  const r11 = rows.find(r => r.inv === '1.1');
  if (Math.abs(r11.dev - 100 * (1234.5 - 1200) / 1200) > 1e-9) throw new Error('desvío mal: ' + r11.dev);
  const r99 = rows.find(r => r.inv === '9.9');
  if (r99.med !== null || r99.dev !== null) throw new Error('un esperado sin medida debe salir con med=null');
  if (!rows.find(r => r.inv === '2.3' && r.esp === null)) throw new Error('una medida sin esperado debe LISTARSE');
});

t('fechasPeriodo y dayEnergy: el mes son sus días, el año 365/366, y dayTotals ≡ dayEnergy(5 min)', () => {
  const feb = S.fechasPeriodo('2026-02-10', 'mes');
  if (feb.length !== 28 || feb[0] !== '2026-02-01' || feb[27] !== '2026-02-28') throw new Error('feb 2026: ' + feb.length);
  if (S.fechasPeriodo('2024-02-10', 'mes').length !== 29) throw new Error('feb 2024 bisiesto');
  const ano = S.fechasPeriodo('2026-06-21', 'ano');
  if (ano.length !== 365 || ano[0] !== '2026-01-01' || ano[364] !== '2026-12-31') throw new Error('año 2026: ' + ano.length);
  // el refactor de dayTotals no puede mover NI UN BIT el Σ día existente
  const T = S.buildT(S.F, C, S.elevPreset('pendiente', C.nrows, 4, C.pitch));
  const a = S.dayTotals(S.F, C, T), b = S.dayEnergy(S.F, C, T, C.date, 5);
  for (let k = 0; k < C.nrows; k++)
    if (a[k] !== b[k]) throw new Error('dayTotals ya no es dayEnergy(fecha, 5 min) bit a bit');
});

console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
