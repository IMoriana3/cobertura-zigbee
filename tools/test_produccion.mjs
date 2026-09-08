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
             policyAnglesSeg,poaPlantSeg,anglesAstroSeg,clearskyIneichen:clearskyIneichen},
          Sol:Sol, elevPreset, buildT, buildTX, buildTReal, elburgoRows, elburgoSegs, elburgoGroups,
          invTotals, filtraStringsNCU, ncuPorCoordenadas, tCellPVSyst, pStringW, elburgoStrInv,
          dcLossEta, invAC, gridLimit, invMapUniforme, strPdc, strInvCotas, acPlant, dayAC,
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
  // y en cotas (Ayora): desde v1.13.1 layout y cotas van 1:1 (751, las cotas
  // regeneradas con el as-built), que es el camino del simulador. El casado
  // por COORDENADAS queda de RESERVA y tiene que decir LO MISMO que el 1:1:
  // si un día discrepan, uno de los dos ficheros se ha re-exportado en otro
  // orden y el `if (ncuOf)` callaría (así se escapó «elijo NCU y me carga la
  // planta entera»)
  if (layAyora.trackers.length !== cotasAyora.t.length)
    throw new Error('Ayora ya no alinea 1:1: layout ' + layAyora.trackers.length + ' ≠ cotas ' + cotasAyora.t.length + ' — regenera las cotas con tools/cotas_asbuilt.py');
  const m = S.ncuPorCoordenadas(cotasAyora, layAyora.trackers);
  if (m.casados < cotasAyora.t.length * 0.9)
    throw new Error('solo ' + m.casados + '/' + cotasAyora.t.length + ' trackers de Ayora casan con su NCU por coordenadas');
  let disc = 0;
  for (let i = 0; i < cotasAyora.t.length; i++) if (m.ncuOf[i] != null && m.ncuOf[i] !== layAyora.trackers[i].ncu) disc++;
  if (disc > cotasAyora.t.length * 0.01)
    throw new Error(disc + ' trackers con NCU distinta por coordenadas y por índice: uno de los dos ficheros va en otro orden');
  const primera = m.ncuOf.find(v => v != null);
  const sub = { ...cotasAyora, t: cotasAyora.t.filter((_, i) => m.ncuOf[i] === primera) };
  const Pn = S.F.plantFromCotas(sub, 80, null);
  const Pf = S.F.plantFromCotas(cotasAyora, 80, null);
  if (!(Pn.elev.length >= 2)) throw new Error('el parque de la NCU ' + primera + ' no forma planta');
  if (!(Pn.elev.length < Pf.elev.length))
    throw new Error(`NCU ${primera} con ${Pn.elev.length} líneas = planta entera (${Pf.elev.length}): el filtro no recorta`);
});

t('El Burgo por NCU: el ámbito recorta también las MESAS del layout, no solo los strings', () => {
  // «Selecciono una NCU y me carga las dos»: las dos NCUs comparten 40 de 45
  // columnas E-O, así que elburgoSegs con el layout SIN filtrar ancla las
  // mesas de la otra NCU en las filas del ámbito. El careo exige el mundo
  // donde la distinción existe: filtrado vs sin filtrar tienen que separarse.
  const mapa = new Map();
  for (const tk of layout.trackers) if (tk.idPrevio != null) mapa.set(String(tk.idPrevio), tk.ncu);
  const db1 = S.filtraStringsNCU(strdb, mapa, 1);
  const vigasX = [];
  for (const tk of layout.trackers) vigasX.push(tk.x - 3, tk.x + 3);
  const rows1 = S.elburgoRows(db1, 3, vigasX);
  const trk1 = layout.trackers.filter(t => t.ncu === 1);
  const segsF = S.elburgoSegs(rows1, trk1);
  const segsSin = S.elburgoSegs(rows1, layout.trackers);
  const nF = segsF.reduce((a, l) => a + l.length, 0), nSin = segsSin.reduce((a, l) => a + l.length, 0);
  // filtrado: ~2 vigas por tracker de la NCU (+huérfanas de los 4 sin casar)
  if (nF > trk1.length * 2 + 10 || nF < trk1.length * 2 - 10)
    throw new Error(nF + ' mesas para ' + trk1.length + ' trackers de la NCU 1: el recorte no cuadra con el layout');
  if (!(nSin > nF + 50))
    throw new Error('el layout sin filtrar da ' + nSin + ' mesas vs ' + nF + ': la distinción que vigila este careo ya no existe — revísalo');
  // y ninguna mesa del ámbito invade el rango N de la OTRA NCU (sur: n<0)
  for (const l of segsF) for (const sg of l)
    if (sg[1] < 0) throw new Error('mesa en n<0 (NCU 2) dentro del ámbito de la NCU 1: el filtro no recorta el layout');
});

t('cotas: la cadena AC cuenta las FILAS medidas con sus módulos, no un string por línea', () => {
  // Ayora/San José no traen plano de strings: cada segmento de línea es una
  // FILA medida (~74 m = dos mesas, ~65 módulos). Contarla como un string de
  // 28 dejaba la Pdc de planta ~5× corta («Pdc 817 kW» para 69 trackers).
  const P = S.F.plantFromCotas(cotasAyora, 80, null);
  const inv = S.invMapUniforme(P.elev.length, 1);
  const si = S.strInvCotas(P.segs, inv);
  const nSeg = P.segs.reduce((a, l) => a + l.length, 0), nEnt = si.reduce((a, l) => a + l.length, 0);
  if (nEnt !== nSeg) throw new Error(nEnt + ' entradas ≠ ' + nSeg + ' filas medidas');
  // módulos por fila DERIVADOS del largo, con la misma cota que el render: si
  // alguien vuelve a poner 28 fijos, esto lo dice
  let modsTot = 0;
  si.forEach((l, r) => l.forEach((e, k) => {
    const sg = P.segs[r][k], esp = Math.max(1, Math.round(((sg[1] - sg[0]) - 0.55) / 1.146));
    if (e.mods !== esp) throw new Error(`fila ${r}/${k}: ${e.mods} módulos ≠ ${esp} por su largo ${(sg[1] - sg[0]).toFixed(1)} m`);
    if (e.mods < 8 || e.mods > 80) throw new Error('módulos por fila fuera de lo físico: ' + e.mods);
    modsTot += e.mods;
  }));
  // y la Pdc de planta escala con esos módulos: contra «un string por línea»
  // la diferencia tiene que ser la de verdad (>3×), no un redondeo
  const poa = P.elev.map(() => 800), met = { tamb: 20, wind: 1 }, e = { mods: 28, wp: 590, gamma: -0.34, uc: 29, uv: 0 };
  const ac = { loss: { soiling: 0, mismatch: 0, wiring: 0, lid: 0 }, pnomW: 1e9, etaMax: 0.985, gridW: 0 };
  const conFilas = S.acPlant(S.strPdc(poa, si, met, e), ac).pdcW;
  const unoPorLinea = S.acPlant(S.strPdc(poa, inv.map(v => [v]), met, e), ac).pdcW;
  const esperado = modsTot * 590 * 0.8 * (1 + (-0.34 / 100) * (S.tCellPVSyst(800, 20, 1, 29, 0) - 25));
  if (Math.abs(conFilas - esperado) / esperado > 1e-9) throw new Error('la Pdc por filas no es Σ módulos × Wp × PVWatts: ' + conFilas + ' vs ' + esperado);
  if (!(conFilas > unoPorLinea * 3)) throw new Error(`por filas ${(conFilas / 1e6).toFixed(2)} MW vs un string por línea ${(unoPorLinea / 1e6).toFixed(2)} MW: la distinción no existe`);
  // El Burgo NO pasa por aquí: sus strings son los del plano (entradas string)
  const rows = S.elburgoRows(strdb, 3);
  const eb = S.strPdc(rows.map(() => 800), rows.map(r => r.strs.map(s2 => s2.inv)), met, e);
  if (eb.length !== strdb.count) throw new Error('El Burgo dejó de contar sus ' + strdb.count + ' strings del plano');
});

t('POR MESA (v1.13): con cotas, instant() calcula θ y POA mesa a mesa con la física del simulador, exactos', () => {
  const P = S.F.plantFromCotas(cotasAyora, 40, null);
  const c = { ...C, lat: layAyora.clat, lon: layAyora.clon, alt: Math.round(cotasAyora.base),
              nrows: P.elev.length, cw: P.cw, maxang: P.maxAngle, pitch: P.pitch,
              elec: { mods: 28, wp: 590, gamma: -0.34, tamb: 20, wind: 1, uc: 29, uv: 0 } };
  const T = S.buildTReal(S.F, c, P);
  if (!T.segTilt || !T.segPairs) throw new Error('buildTReal no lleva el tilt/parejas por mesa a la T');
  const r = S.instant(S.F, c, T, 720);
  if (!r.segs || !r.segAng) throw new Error('instant() no devuelve θ/POA por mesa con cotas');
  // PARIDAD por mesa: lo que da llamar al simulador a mano, bit a bit
  const g = S.Sol.solarPos(S.localToUTCms(c.date, 720, c.tz), c.lat, c.lon, { refract: true });
  const zen = 90 - g.elev, doy = S.doyOf(c.date), irr = S.F.clearskyIneichen(zen, doy, c.alt, C.tl);
  const seg = S.F.policyAnglesSeg('pairwise', zen, g.az, T, irr, doy, c.albedo);
  const ps = S.F.poaPlantSeg(zen, g.az, T, seg, irr, doy, c.albedo);
  for (let i = 0; i < c.nrows; i++) {
    if (r.rows[i] !== ps.rows[i]) throw new Error(`línea ${i}: ${r.rows[i]} ≠ ${ps.rows[i]} — la tarjeta ya no es el motor por mesa`);
    for (let k = 0; k < ps.segs[i].length; k++) {
      if (r.segs[i][k] !== ps.segs[i][k] || r.segAng[i][k] !== seg[i][k]) throw new Error(`mesa ${i}/${k} distinta del motor`);
    }
  }
  // el mundo donde la distinción existe: mesas de una misma línea con θ y POA distintos
  let disp = 0;
  r.segAng.forEach(l => { if (l.length > 1 && Math.max(...l) - Math.min(...l) > 0.02) disp++; });
  if (!(disp > c.nrows * 0.3)) throw new Error('solo ' + disp + '/' + c.nrows + ' líneas con θ distinto por mesa');
  // y la cadena AC come la POA de CADA mesa (strInvCotas lleva k)
  const si = S.strInvCotas(P.segs, S.invMapUniforme(c.nrows, 1));
  const por = S.strPdc(r.rows, si, r.met, c.elec, r.segs);
  let usaSeg = false;
  por.forEach(e => { const k = si[e.row].find(x => x.inv === e.inv).k; if (r.segs[e.row][k] !== r.rows[e.row]) usaSeg = true; });
  const esp = por.reduce((a, e) => a + e.pdcW, 0);
  const manual = si.flat().reduce((a, e, i) => a + S.pStringW(r.segs[por[i].row][e.k], r.met.tamb, r.met.wind, { ...c.elec, mods: e.mods }), 0);
  if (Math.abs(esp - manual) / manual > 1e-12) throw new Error('la Pdc no sale de la POA de cada mesa: ' + esp + ' vs ' + manual);
  if (!usaSeg) throw new Error('ninguna mesa difiere de su línea: el careo de la cadena por mesa es vacío');
  // El Burgo y la genérica NO tienen tilt por mesa: el camino de siempre (segs=null, POA bit a bit como el motor por línea)
  const elev = S.elevPreset('pendiente', C.nrows, 4, C.pitch), Tg = S.buildT(S.F, C, elev);
  const rg = S.instant(S.F, C, Tg, 720);
  if (rg.segs !== null || rg.segAng !== null) throw new Error('la genérica se ha ido al camino por mesa sin tilt por mesa');
});

t('POR ALA (v1.14): la mesa larga son DOS strings, cada uno con la POA de SU ala (sombra por ala del contador 3D)', () => {
  const P = S.F.plantFromCotas(cotasAyora, 40, null);
  const c = { ...C, lat: layAyora.clat, lon: layAyora.clon, alt: Math.round(cotasAyora.base),
              nrows: P.elev.length, cw: P.cw, maxang: P.maxAngle, pitch: P.pitch,
              elec: { mods: 28, wp: 590, gamma: -0.34, tamb: 20, wind: 1, uc: 29, uv: 0 } };
  const T = S.buildTReal(S.F, c, P), filaLen = T.filaLen;
  if (!(filaLen > 60)) throw new Error('buildTReal sin filaLen: ' + filaLen);
  // la cadena: largas → 2 strings (a: sur, b: norte) con los módulos de la fila repartidos; medias → 1
  const inv = S.invMapUniforme(c.nrows, 1);
  const si = S.strInvCotas(P.segs, inv, 1.146, 0.55, filaLen), si1 = S.strInvCotas(P.segs, inv);
  let largas = 0, medias = 0;
  P.segs.forEach((l, r) => l.forEach((sg, k) => {
    const ent = si[r].filter(e => e.k === k), uno = si1[r].find(e => e.k === k);
    if ((sg[1] - sg[0]) >= 0.7 * filaLen) {
      largas++;
      if (ent.length !== 2 || ent[0].w !== 0 || ent[1].w !== 1) throw new Error(`fila ${r}/${k} larga sin sus dos alas`);
      if (ent[0].mods + ent[1].mods !== uno.mods) throw new Error(`fila ${r}/${k}: ${ent[0].mods}+${ent[1].mods} ≠ ${uno.mods} módulos`);
      if (Math.abs(ent[0].mods - ent[1].mods) > 1) throw new Error('alas desiguales');
    } else { medias++; if (ent.length !== 1 || ent[0].w != null) throw new Error(`fila ${r}/${k} media partida`); }
  }));
  if (!(largas > 0)) throw new Error('sin filas largas en Ayora: el careo es vacío');
  // al ALBA (sol bajo del este, sombra desplazada a lo largo del eje) el
  // contador reparte la sombra por ala y la POA de cada ala sale de ahí
  const r = S.instant(S.F, c, T, 7 * 60 + 30);   // 07:30 local: sol a ~7° del este (a las 06:40 aún no ha salido)
  if (!r.wings || !r.shade.wing) throw new Error('instant() no trae POA/sombra por ala');
  let n = 0, distintas = 0;
  for (let i = 0; i < c.nrows; i++) for (let k = 0; k < r.segs[i].length; k++) {
    const w = r.wings[i][k], sw = r.shade.wing[i][k], ss = r.shade.seg[i][k];
    if (!w) throw new Error(`mesa ${i}/${k} sin POA por ala`);
    // con 8 estaciones (4 por ala) la media de las alas ES la mesa, en sombra y en POA
    if (Math.abs((sw[0] + sw[1]) / 2 - ss) > 1e-12) throw new Error(`mesa ${i}/${k}: sombra alas ${sw} ≠ mesa ${ss}`);
    if (Math.abs((w[0] + w[1]) / 2 - r.segs[i][k]) > 1e-9 * Math.max(1, r.segs[i][k])) throw new Error(`mesa ${i}/${k}: POA alas ${w} ≠ mesa ${r.segs[i][k]}`);
    n++; if (Math.abs(w[0] - w[1]) > 1) distintas++;
  }
  if (!(distintas > 0)) throw new Error('al alba ninguna mesa tiene alas con POA distinta: la sombra por ala no existe (' + n + ' mesas)');
  // y la cadena: cada string con su ala; Σ de los dos ≈ la fila entera (la
  // tcell hace a P ligeramente convexa en POA: <1 %), y en alguna fila los
  // dos strings difieren de verdad
  const por = S.strPdc(r.rows, si, r.met, c.elec, r.segs, r.wings), por1 = S.strPdc(r.rows, si1, r.met, c.elec, r.segs);
  const sum = por.reduce((a, e) => a + e.pdcW, 0), sum1 = por1.reduce((a, e) => a + e.pdcW, 0);
  if (Math.abs(sum - sum1) / sum1 > 0.01) throw new Error('Σ Pdc por alas ' + sum + ' vs por filas ' + sum1);
  let dif = 0, usa = 0;
  for (let i = 0; i < por.length - 1; i++) {
    const a = por[i], b = por[i + 1];
    if (a.row === b.row && a.k === b.k && a.w === 0 && b.w === 1) {
      const pa = S.pStringW(r.wings[a.row][a.k][0], r.met.tamb, r.met.wind, { ...c.elec, mods: a.mods });
      if (Math.abs(pa - a.pdcW) > 1e-9) throw new Error('el string a no come la POA de su ala');
      usa++; if (Math.abs(a.pdcW - b.pdcW) / Math.max(1, b.pdcW) > 0.01) dif++;
    }
  }
  if (!(usa > 0 && dif > 0)) throw new Error('ningún par de strings de una fila difiere (' + usa + ' pares)');
  // mutante: sin las alas, los dos strings de cada fila salen iguales POR
  // MÓDULO (33 y 32 módulos de una fila de 65 dan Pdc distinta sin ser el ala)
  const sin = S.strPdc(r.rows, si, r.met, c.elec, r.segs, null);
  let difSin = 0;
  for (let i = 0; i < sin.length - 1; i++)
    if (sin[i].row === sin[i + 1].row && sin[i].k === sin[i + 1].k && sin[i].w === 0 &&
        Math.abs(sin[i].pdcW / sin[i].mods - sin[i + 1].pdcW / sin[i + 1].mods) > 1e-9) difSin++;
  if (difSin) throw new Error('sin POA por ala los strings de una fila ya difieren por módulo: el careo no mide las alas');
  // El Burgo: cada string del plano a su mesa y su ala; en la mesa larga, uno por ala
  const rows = S.elburgoRows(strdb, 3), segsAbs = S.elburgoSegs(rows, layout.trackers);
  let mn = Infinity, mx = -Infinity; for (const sg of segsAbs.flat()) { mn = Math.min(mn, sg[0]); mx = Math.max(mx, sg[1]); }
  const nc = (mn + mx) / 2, segs = segsAbs.map(l => l.map(sg => [sg[0] - nc, sg[1] - nc]));
  const eb = S.elburgoStrInv(rows, segs, nc, filaLen, 28);
  const porMesa = new Map(); let sinK = 0, conAla = 0, sinAla = 0;
  eb.forEach((l, i) => l.forEach(e => {
    if (e.k == null) { sinK++; return; }
    const key = i + '/' + e.k; if (!porMesa.has(key)) porMesa.set(key, []); porMesa.get(key).push(e.w);
    if (e.w == null) sinAla++; else conAla++;
  }));
  if (sinK) throw new Error(sinK + ' strings de El Burgo sin mesa');
  for (const [key, ws] of porMesa) {
    if (ws.length === 2 && !(ws.includes(0) && ws.includes(1))) throw new Error('mesa ' + key + ': dos strings en la misma ala (' + ws + ')');
    if (ws.length > 2) throw new Error('mesa ' + key + ' con ' + ws.length + ' strings');
  }
  if (!(conAla > sinAla)) throw new Error('El Burgo: ' + conAla + ' strings con ala frente a ' + sinAla + ' sin ala — las mesas largas no dominan');
  if (eb.flat().length !== strdb.count) throw new Error('El Burgo perdió strings: ' + eb.flat().length + ' de ' + strdb.count);
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

t('TMY horneados: 8760 h, columnas sanas y GHI anual del sitio (si están desplegados)', () => {
  // los <planta>_tmy.json los descarga el maintainer de PVGIS y los condensa
  // el flujo de tools/gen_tmy_pvgis.py: si alguna regeneración los deja cortos,
  // con columnas cambiadas o con un GHI de otro planeta, esto lo dice ANTES
  // de que la tarjeta los sirva. Ausentes no es fallo: la página cae a la API
  // del navegador y lo declara.
  const rangos = { elburgo: [1400, 2000], ayora: [1400, 2000], sanjose: [2000, 2800] };
  let vistos = 0;
  for (const [k, [lo, hi]] of Object.entries(rangos)) {
    const f = path.join(ROOT, k + '_tmy.json');
    if (!fs.existsSync(f)) continue;
    vistos++;
    const tmy = JSON.parse(fs.readFileSync(f, 'utf-8'));
    if (!tmy.h || tmy.h.length !== 8760) throw new Error(k + ': ' + (tmy.h ? tmy.h.length : 0) + ' horas (esperaba 8760)');
    let ghi = 0;
    for (const r of tmy.h) {
      if (r.length !== 5 || r.some(v => !Number.isFinite(v))) throw new Error(k + ': fila con columnas malas: ' + JSON.stringify(r));
      if (r[0] < 0 || r[0] > 1500 || r[3] < -40 || r[3] > 55) throw new Error(k + ': valor fuera de rango físico: ' + JSON.stringify(r));
      ghi += r[0];
    }
    ghi /= 1000;
    if (ghi < lo || ghi > hi) throw new Error(k + ': GHI anual ' + ghi.toFixed(0) + ' kWh/m² fuera de [' + lo + ',' + hi + ']');
    // y el tmyAt de la página lo come tal cual (hora exacta = dato clavado)
    const a = S.tmyAt(tmy, 100, 720, 0);
    if (a.ghi !== tmy.h[99 * 24 + 12][0]) throw new Error(k + ': tmyAt no indexa el fichero horneado donde toca');
  }
  console.log('    (' + vistos + ' TMY horneados presentes)');
});

console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
