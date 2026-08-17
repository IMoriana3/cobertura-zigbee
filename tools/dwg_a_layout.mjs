/* DWG de layout de comunicaciones -> <planta>_layout.json, para las plantas que vienen en DWG.
 *
 * QUÉ SE MIDE Y QUÉ SE DERIVA, que es lo único que importa aquí:
 *   MEDIDO del DWG   posición y giro de cada seguidor (INSERT), su tipo (nombre de bloque),
 *                    posición de NCU / anemómetros / torres / Power Stations / repetidores,
 *                    el vallado, y el ÁMBITO de cada NCU (los polígonos grandes de su capa).
 *   DERIVADO         el reparto seguidor->NCU sale de caer DENTRO del polígono de ámbito que el
 *                    propio plano dibuja; no es «la NCU más cercana». Lo que queda fuera de todo
 *                    polígono se declara y se le asigna la NCU más próxima, marcándolo.
 *   NO SE INVENTA    si el DWG no trae una cosa, el campo va vacío y se dice.
 *
 * EL HUSO NO ESTÁ EN EL FICHERO. Estos DWG no llevan sistema de coordenadas (ni GEODATA ni texto de
 * cajetín): solo X e Y. La misma coordenada cae en Andalucía (UTM 30N) o en Sicilia (33N). La zona
 * se pasa por parámetro y se declara en `georef`, con la razón por la que se eligió.
 *
 *   npm install --no-save @mlightcad/libredwg-web    (12 MB de WASM, NO va commiteado)
 *   node tools/dwg_a_layout.mjs <planta> [--write]
 */
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';

const SUBIDAS = '/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/';

/* Cada DWG nombra sus capas a su manera; aquí se declara la equivalencia, plano a plano, en vez de
   adivinarla con expresiones regulares que un día casan otra cosa. */
const PLANTAS = {
  panbianco: {
    title: 'Panbianco 25004.2', num: '25004.2', pais: 'Italia',
    zona: 33, sur: false, crs: 'EPSG:25833', tzFijo: null,      // Italia: CET/CEST, la regla peninsular vale
    geo: SUBIDAS + '101d99f5-PR.24.005_PANBIANCO_Layout_comunicaciones_2C.dwg',
    com: SUBIDAS + 'c46ae7dc-PR.24.005_PANBIANCO_Layout_comunicaciones_3B.dwg',
    trk: { 'AE_IMP_1v62': '1V62', 'AE_IMP_1v31': '1V31' },
    capaNCU: 'NCU', capaNCUtxt: 'NCU text', capaNCUsop: 'NCU soporte',
    capaHSU: 'HSU', capaHSUtxt: 'HSU text', capaTorre: 'Sensores - Torre',
    capaPS: 'AE_ELE_Power Station', capaVallado: 'AE_IMP_Vallado',
    capaRep: 'AE_ELE_Repetidor', capaPira: 'AE_PYRANOMETER',
  },
  benante: {
    title: 'Benante 25004', num: '25004', pais: 'Italia',
    zona: 33, sur: false, crs: 'EPSG:25833', tzFijo: null,
    geo: SUBIDAS + 'a0f20545-LO.25.004_BENANTE_Layout_comunicaciones_2C.dwg',
    com: SUBIDAS + 'f2fe8bf1-LO.25.004_R01C_Benante__Layout_comunicaciones_03B.dwg',
    trk: { 'EXT_1V62': '1V62', 'AE_IMP_Seguidor Factiun': '1V31' },
    capaNCU: 'SNC', capaNCUtxt: 'SNC Text', capaNCUsop: 'SNC Y MBOX - Hinca',
    capaHSU: 'Sensor - IWC CAZOLETAS', capaHSUtxt: 'Sensor - IWC Text', capaTorre: 'Sensores - Torre',
    capaPS: 'AE_ELE_Power Station', capaVallado: 'AE_IMP_Vallado',
    capaRep: null, capaPira: 'AE_PYRANOMETER',
  },
};

/* Cotas MEDIDAS con tools/extract_dwg_cotas.mjs sobre estos mismos ficheros. Las dos plantas dan lo
   mismo al milímetro —mismo emplazamiento y mismo diseño—:
     1V62  62·1,134 + 60·0,015 + 0,70 = 71,908 m   (el DWG mide 71,91)
     1V31  31·1,134 + 29·0,015 + 0,70 = 36,289 m   (el DWG mide 36,29) */
const MESA = { modW: 1.134, modH: 2.382, gapMod: 0.015, gapDrive: 0.70, filaZ: 2.62,
               fuente: 'medido en el propio DWG con tools/extract_dwg_cotas.mjs' };
const LARGO = { '1V62': 71.908, '1V31': 36.289 };

const [planta, ...rest] = process.argv.slice(2);
const WRITE = rest.includes('--write');
const C = PLANTAS[planta];
if (!C) { console.error('uso: node tools/dwg_a_layout.mjs <' + Object.keys(PLANTAS).join('|') + '> [--write]'); process.exit(2); }
const RAIZ = new URL('..', import.meta.url).pathname;

const lib = await LibreDwg.create();
if (typeof lib.dwg_bmp === 'function') lib.dwg_bmp = () => null;
const lee = f => lib.convert(lib.dwg_read_data(readFileSync(f).buffer, 0)).entities || [];
const G = lee(C.geo);
const M = C.com ? lee(C.com) : [];
console.log(`${C.title}\n  geometría ${G.length} entidades · comunicaciones ${M.length}`);

const gx = e => e.x ?? e.insertionPoint?.x ?? e.startPoint?.x ?? e.center?.x;
const gy = e => e.y ?? e.insertionPoint?.y ?? e.startPoint?.y ?? e.center?.y;
const txt = e => ((e.text?.text ?? e.text ?? e.textValue ?? '') + '').replace(/\\P/g, ' ').replace(/\s+/g, ' ').trim();
const verts = e => (e.vertices || e.points || []).map(v => [v.x, v.y]).filter(p => isFinite(p[0]));
const r3 = v => +v.toFixed(3);

/* ---------- seguidores ---------- */
const TRK = [];
for (const e of G) {
  if (e.type !== 'INSERT') continue;
  const tipo = C.trk[e.layer]; if (!tipo) continue;
  const x = gx(e), y = gy(e); if (!isFinite(x)) continue;
  /* El giro del INSERT viene en RADIANES; y una escala X negativa es un espejo, que en un seguidor
     de eje N-S no cambia su traza pero sí el lado al que mira el motor. Se guarda tal cual. */
  const rot = (e.rotation || 0) * 180 / Math.PI;
  TRK.push({ E: x, N: y, rot: +(((rot % 360) + 360) % 360).toFixed(3), tipo, esp: (+(e.xScale ?? 1) < 0) });
}
console.log(`  seguidores ${TRK.length}  (` + Object.entries(TRK.reduce((a, t) => (a[t.tipo] = (a[t.tipo] || 0) + 1, a), {})).map(([k, v]) => k + '×' + v).join(', ') + ')');
if (!TRK.length) { console.error('  sin seguidores: revisa las capas'); process.exit(1); }
const giros = [...new Set(TRK.map(t => t.rot))];
console.log(`  giros distintos: ${giros.slice(0, 6).join(', ')}${giros.length > 6 ? ' …(' + giros.length + ')' : ''} · espejados ${TRK.filter(t => t.esp).length}`);

/* ---------- ámbitos de NCU: los polígonos grandes de su capa ---------- */
/* La capa de NCU lleva mezclado el símbolo (rectángulos de 0,5 x 0,4 m) y el ÁMBITO de cada NCU
   (polígonos de cientos de metros). Solo los segundos sirven para repartir seguidores, y se
   distinguen por tamaño, no por adivinar el orden en el que están dibujados. */
const ZON0 = [];
for (const e of G) {
  if (e.layer !== C.capaNCU || !/POLYLINE/.test(e.type)) continue;
  const P = (e.vertices || e.points || []).map(v => [v.x, v.y]).filter(p => isFinite(p[0]));
  if (P.length < 5) continue;
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 50) continue;
  ZON0.push(P);
}
const enPol = (P, x, y) => { let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++)
    if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c; };

/* ---------- EL CAMPO DE SEGUIDORES PUEDE VENIR EN OTRO MARCO ----------
   En Panbianco el campo está dibujado en coordenadas LOCALES (X −1623..33) mientras las NCU, las
   Power Stations, los anemómetros y el vallado van en UTM: una incoherencia del propio fichero.
   Se recupera la TRASLACIÓN, y no se da por buena hasta comprobarla: el criterio es que los 1.476
   seguidores caigan DENTRO de los ámbitos de NCU que el plano dibuja. Con 1.476 puntos contra 13
   polígonos el problema está muy sobredeterminado —una traslación mala no mete ni la mitad—, así
   que el porcentaje que encaja es la medida de si la traslación es la buena. Se declara siempre. */
let DX = 0, DY = 0, ajuste = null;
const enUTM = TRK.filter(t => t.E > 1e5 && t.N > 1e6).length;
if (enUTM < TRK.length * 0.5 && ZON0.length) {
  const bb = a => { const xs = a.map(p => p[0]), ys = a.map(p => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
  const cz = bb(ZON0.flat()), ct = bb(TRK.map(t => [t.E, t.N]));
  const cuenta = (dx, dy) => TRK.reduce((s, t) => s + (ZON0.some(P => enPol(P, t.E + dx, t.N + dy)) ? 1 : 0), 0);
  let mejor = { n: -1, dx: cz[0] - ct[0], dy: cz[1] - ct[1] };
  for (let paso of [16, 4, 1, 0.25]) {                       // refinado grueso->fino alrededor del centro de cajas
    let base = { ...mejor };
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      const dx = base.dx + i * paso, dy = base.dy + j * paso, n = cuenta(dx, dy);
      if (n > mejor.n) mejor = { n, dx, dy };
    }
  }
  DX = mejor.dx; DY = mejor.dy;
  ajuste = { dx: r3(DX), dy: r3(DY), dentro: mejor.n, total: TRK.length, pct: +(100 * mejor.n / TRK.length).toFixed(1) };
  console.log(`  ⚠ el campo venía en marco LOCAL. Traslación recuperada dE ${DX.toFixed(2)} dN ${DY.toFixed(2)}` +
              `  ->  ${mejor.n}/${TRK.length} seguidores (${ajuste.pct} %) dentro de los ámbitos dibujados`);
  for (const t of TRK) { t.E += DX; t.N += DY; }
}

/* ---------- centro y sistema local ---------- */
const cE = TRK.reduce((s, t) => s + t.E, 0) / TRK.length, cN = TRK.reduce((s, t) => s + t.N, 0) / TRK.length;
function inv(E1, N1, zona, sur) {                       // UTM -> lat/lon (Krüger inversa)
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
  const de = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
  const xi = (N1 - (sur ? 1e7 : 0)) / (k0 * A), eta = (E1 - 5e5) / (k0 * A);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const ch = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let lat = ch; for (let j = 1; j <= 3; j++) lat += de[j - 1] * Math.sin(2 * j * ch);
  return [lat * 180 / Math.PI, (((zona - 1) * 6 - 180 + 3) * Math.PI / 180 + Math.atan(Math.sinh(ep) / Math.cos(xp))) * 180 / Math.PI];
}
const [clat, clon] = inv(cE, cN, C.zona, C.sur);
console.log(`  centro UTM ${C.zona}N  E ${cE.toFixed(2)}  N ${cN.toFixed(2)}  ->  ${clat.toFixed(6)}, ${clon.toFixed(6)}`);
const loc = (E1, N1) => [r3(E1 - cE), r3(N1 - cN)];

const ZON = ZON0;
console.log(`  ámbitos de NCU dibujados: ${ZON.length}`);
const dentro = enPol;

/* ---------- NCU, anemómetros, torres, PS, repetidores ---------- */
function puntos(ent, capa, bloque) {
  return ent.filter(e => e.type === 'INSERT' && e.layer === capa && (!bloque || e.name === bloque))
            .map(e => ({ E: gx(e), N: gy(e) })).filter(o => isFinite(o.E));
}
function rotula(ent, capa, pref, x, y) {                // el rótulo MÁS PRÓXIMO que empiece por el prefijo
  let b = null, bd = 1e18;
  for (const e of ent) {
    if (e.layer !== capa) continue;
    const t = txt(e); if (!new RegExp('^' + pref, 'i').test(t)) continue;
    const d = Math.hypot((gx(e) ?? 1e9) - x, (gy(e) ?? 1e9) - y);
    if (d < bd) { bd = d; b = t; }
  }
  return { n: b, d: bd };
}
/* MANDA EL FICHERO DE GEOMETRÍA. Los dos planos son REVISIONES distintas y sus equipos no caen en
   el mismo punto —en Benante las NCU bailan más de un metro entre el 2C y el 03B—, así que juntarlos
   sin más duplicaba las seis NCU en doce. Del plano de comunicaciones solo se toma lo que el de
   geometría no trae (los repetidores de Panbianco), y a más de 5 m de cualquier equipo ya conocido. */
function une(a, b2) { return a.length ? a : b2; }   // si el de geometría trae la capa, manda él ENTERO
const NCUp = une(puntos(G, C.capaNCUsop), puntos(M, C.capaNCUsop));
const NCUS = NCUp.map(o => { const r = rotula(G, C.capaNCUtxt, 'NCU', o.E, o.N);
  const [x, n] = loc(o.E, o.N); return { x, n, name: (r.n || 'NCU').replace(/\s*\(.*\)$/, ''), enlace: (/\(([^)]+)\)/.exec(r.n || '') || [, ''])[1] || null, _d: r.d }; });
NCUS.sort((a, b) => (parseInt((a.name.match(/\d+/) || [99])[0]) - parseInt((b.name.match(/\d+/) || [99])[0])));
console.log(`  NCU ${NCUS.length}: ` + NCUS.map(o => o.name + (o.enlace ? '/' + o.enlace : '')).join(', '));

const TORp = une(puntos(G, C.capaTorre), puntos(M, C.capaTorre));
const METEO = TORp.map(o => { const r = rotula(G, C.capaHSUtxt, 'HSU', o.E, o.N) .n || rotula(M, C.capaHSUtxt, 'HSU', o.E, o.N).n;
  const [x, n] = loc(o.E, o.N); return { x, n, name: (r || 'HSU').split(' ').slice(0, 2).join(' ') }; });
console.log(`  torres/anemómetros ${METEO.length}: ` + METEO.map(o => o.name).join(', '));

const PS = puntos(G, C.capaPS).map(o => { const [x, n] = loc(o.E, o.N); return { x, n }; });
const REPS = C.capaRep ? puntos(M, C.capaRep).map(o => { const [x, n] = loc(o.E, o.N); return { x, n, name: 'REP' }; }) : [];
const PIRA = puntos(G, C.capaPira).map(o => { const [x, n] = loc(o.E, o.N); return { x, n }; });
console.log(`  Power Stations ${PS.length} · repetidores ${REPS.length} · piranómetros ${PIRA.length}`);

const FENCE = [];
for (const e of G) if (e.layer === C.capaVallado && /POLYLINE/.test(e.type)) { const P = verts(e); if (P.length > 2) FENCE.push(P.map(p => loc(p[0], p[1]))); }
console.log(`  vallado: ${FENCE.length} tramo(s), ${FENCE.reduce((s, p) => s + p.length, 0)} vértices`);

/* CONTRASTE INDEPENDIENTE de la traslación recuperada. El ajuste se hizo contra los ámbitos de NCU;
   el VALLADO no entró en él, así que sirve de oráculo: si la traslación fuera otra, el campo se
   saldría del recinto. Se declara el porcentaje que cae dentro, sea el que sea. */
if (ajuste && FENCE.length) {
  const anillos = FENCE.map(P => P.map(p => [p[0] + cE, p[1] + cN]));
  const d = TRK.reduce((s, t) => s + (anillos.some(P => enPol(P, t.E, t.N)) ? 1 : 0), 0);
  ajuste.dentroVallado = d; ajuste.pctVallado = +(100 * d / TRK.length).toFixed(1);
  console.log(`  contraste independiente (vallado, no usado en el ajuste): ${d}/${TRK.length} (${ajuste.pctVallado} %) dentro del recinto`);
}

/* ---------- reparto seguidor -> NCU ---------- */
/* Primero por ÁMBITO dibujado. El polígono se casa con su NCU por la que cae dentro de él; si un
   ámbito no contiene ninguna NCU, o un seguidor no cae en ninguno, se dice y se resuelve por
   proximidad, que es lo único que queda, marcándolo. */
const ncuDeZona = ZON.map(P => { const i = NCUS.findIndex(o => dentro(P, o.x + cE, o.n + cN)); return i; });
let porZona = 0, porCerca = 0;
for (const t of TRK) {
  let k = -1;
  for (let z = 0; z < ZON.length; z++) if (ncuDeZona[z] >= 0 && dentro(ZON[z], t.E, t.N)) { k = ncuDeZona[z]; break; }
  if (k >= 0) { porZona++; t.ncu = k + 1; t.zona = true; }
  else { let bd = 1e18; NCUS.forEach((o, i) => { const d = Math.hypot(o.x + cE - t.E, o.n + cN - t.N); if (d < bd) { bd = d; k = i; } });
         t.ncu = k + 1; t.zona = false; porCerca++; }
}
console.log(`  reparto a NCU: ${porZona} por ámbito dibujado, ${porCerca} por proximidad (DERIVADO)`);
const porNCU = {}; TRK.forEach(t => porNCU[t.ncu] = (porNCU[t.ncu] || 0) + 1);
console.log('   ' + NCUS.map((o, i) => o.name + ':' + (porNCU[i + 1] || 0)).join(' · '));

/* ---------- salida ---------- */
const L = {
  plant: planta, title: C.title, num: C.num, pais: C.pais,
  crs: C.crs, clat: +clat.toFixed(7), clon: +clon.toFixed(7), cE: r3(cE), cN: r3(cN),
  mods: 31, filaZ: MESA.filaZ,
  mesa: MESA,
  georef: {
    fuente: C.geo.split('/').pop() + (C.com ? ' + ' + C.com.split('/').pop() : ''),
    huso: `UTM ${C.zona}N`,
    nota: 'El DWG NO trae sistema de coordenadas: ni GEODATA ni texto de cajetín, solo X e Y. ' +
          'La misma coordenada cae en Andalucía (30N) o en Sicilia (33N). Se toma 33N porque la ' +
          'cartera declara la planta en ITALIA y es el único huso compatible que cae en Italia ' +
          '(32N daría Túnez y 34N el mar Jónico). NO verificado contra ortofoto: el entorno de ' +
          'generación no tiene salida a los servidores de teselas.',
  },
  tipos: { fuente: 'nombre de capa/bloque del DWG, no inferido',
           '1V62': 'seguidor completo, 62 módulos por fila (2 alas de 31) · 71,908 m',
           '1V31': 'seguidor MEDIO, 31 módulos por fila · 36,289 m' },
  trackers: TRK.map((t, i) => { const [x, n] = loc(t.E, t.N);
    const medio = t.tipo === '1V31';
    return { x, n, rot: t.rot, t: medio ? 'Medio' : 'completo', id: 'TK' + String(i + 1).padStart(4, '0'),
             tp: t.tipo, mods: 31, ncu: t.ncu, gw: t.ncu,
             ...(medio ? { mr: +(LARGO['1V31'] / LARGO['1V62']).toFixed(5) } : {}),
             ...(t.esp ? { esp: 1 } : {}), ...(t.zona ? {} : { ncuCerca: 1 }) }; }),
  ncus: NCUS.map(o => ({ x: o.x, n: o.n, name: o.name, enlace: o.enlace })),
  meteo: METEO, reps: REPS, ps: PS, piranometros: PIRA, fence: FENCE,
  /* Lo que el DWG trae y AQUÍ NO se ha extraído todavía, dicho en vez de callado: los viales van
     como HATCH de PVcase y necesitan el tratamiento de superficies de tools/extract_roads.mjs; las
     plataformas, la balsa y el drenaje de Panbianco vienen como XREF y no están en este fichero. */
  pendiente: ['viales (HATCH de PVcase)', 'plataformas/balsa/drenaje (XREF externos)', 'cotas del terreno'],
  ...(ajuste ? { traslacion: { ...ajuste, nota: 'El campo de seguidores venía dibujado en marco LOCAL y el resto del plano en UTM. Traslación recuperada maximizando los seguidores dentro de los ámbitos de NCU dibujados, y CONTRASTADA contra el vallado, que no entró en el ajuste.' } } : {}),
  generado_de: 'tools/dwg_a_layout.mjs',
};
console.log(`\n  módulos: ${(TRK.reduce((s, t) => s + (t.tipo === '1V62' ? 62 : 31), 0)).toLocaleString('es')} (62 por 1V62, 31 por 1V31)`);
const xs = L.trackers.map(t => t.x), ns = L.trackers.map(t => t.n);
console.log(`  huella ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} x ${(Math.max(...ns) - Math.min(...ns)).toFixed(0)} m`);
if (!WRITE) { console.log('\n(dry-run: pasa --write)'); process.exit(0); }
writeFileSync(RAIZ + planta + '_layout.json', JSON.stringify(L));
console.log(`\nescrito ${planta}_layout.json`);
