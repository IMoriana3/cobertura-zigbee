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

/* Cotas MEDIDAS con tools/extract_dwg_cotas.mjs sobre estos mismos ficheros. Las dos plantas dan lo
   mismo al milímetro —mismo emplazamiento y mismo diseño—:
     1V62  62·1,134 + 60·0,015 + 0,70 = 71,908 m   (el DWG mide 71,91)
     1V31  31·1,134 + 29·0,015 + 0,70 = 36,289 m   (el DWG mide 36,29) */
const SICILIA = { modW: 1.134, modH: 2.382, gapMod: 0.015, gapDrive: 0.70, filaZ: 2.62,
                  fuente: 'medido en el propio DWG con tools/extract_dwg_cotas.mjs' };
/* POLVORÍN. Su módulo NO es el de Sicilia: 1,303 x 2,384 (Luxen Luxpower N6 710 W), y su bifilar
   lleva las dos filas a 2,25 m del eje (ancho 6,884 = 2 x 2,384 + 2,116 de calle). Medido con
   tools/_blq.mjs, que resuelve bloques ANIDADOS: aquí el bloque del seguidor solo contiene
   sub-INSERT y la geometría está un nivel más abajo, por eso extract_dwg_cotas no veía nada.
   El modelo cuadra al milímetro en los SIETE tipos:  n·modW + (n−2)·gapMod + gapDrive
     31+31    62/columna ->  62·1,303 + 60·0,015 + 0,70 = 82,386   (el DWG mide 82,386)
     24+23x3  47/columna ->  62,616                                (mide 62,616)             */
const POLVORIN = { modW: 1.303, modH: 2.384, gapMod: 0.015, gapDrive: 0.70, filaZ: 2.25,
                   fuente: 'medido en el propio DWG con tools/_blq.mjs (bloques anidados)' };

/* CATANIA. Medida con tools/extract_dwg_cotas.mjs sobre su propio DWG, bloque «TRX01 2TTx58»:
   módulo 1,134 x 2,382, hueco entre módulos 0,015, hueco de motor 0,70 y las DOS filas a 5 m.
   El modelo cuadra al milímetro:  2·(29·1,134 + 28·0,015) + 0,70 = 67,312  (el DWG mide 67,312).
   `filaZ` es la mitad del paso entre filas: 2,5. DERIVADO, no medido — el DWG da el paso, no la
   distancia de cada fila al eje; en un bífilo simétrico son la mitad. */
const CATANIA = { modW: 1.134, modH: 2.382, gapMod: 0.015, gapDrive: 0.70, filaZ: 2.5,
                  fuente: 'medido en el propio DWG con tools/extract_dwg_cotas.mjs' };

/* Cada DWG nombra sus capas a su manera; aquí se declara la equivalencia, plano a plano, en vez de
   adivinarla con expresiones regulares que un día casan otra cosa. */
const PLANTAS = {
  /* CATANIA — EN OFERTA. El DWG es de ALTURA DE TORQUE TUBE, no de comunicaciones: no hay NCU, ni
     HSU, ni Power Stations, ni repetidores, ni vallado de obra. Todos esos campos van VACÍOS y se
     dice; no se rellenan con nada.

     LOS SEGUIDORES son BÍFILOS (confirmado por el proyectista, 2026-09-10), y cada INSERT de las
     capas SO.01_TRX1 y SO.01_TRX2 es UNA FILA —un tubo—, no un seguidor entero. Su bloque nombra
     la talla: «1P58@55DEG F TR ID*» (58 módulos) y «1P29@55DEG F TR ID*» (29). Son 2.796 y 518 =
     3.314 filas y 177.190 módulos, o sea 1.657 seguidores bífilos. Giro 0 en todas: filas N-S. El
     paso entre filas contiguas mide 5,00 m uniforme (13 de 15 saltos en una banda de 16 filas), y
     es también la separación entre los dos tubos de un bífilo: por eso `filaZ` va a 2,5.

     QUÉ FILA VA CON CUÁL NO ESTÁ EN ESTE PLANO, y por eso se guarda fila a fila en vez de
     publicarse un emparejamiento inventado. Se intentó por tres caminos y ninguno cierra:
       · por el ID del bloque (ID1..ID6, que vienen en parejas de cuenta exacta: 565/565, 350/350,
         483/483): 423 de 565 filas se quedan sin pareja;
       · por geometría, la fila de 5 m al lado con la Y más próxima: 152 filas sueltas y 13 parejas
         de talla distinta (una de 58 con una de 29), que no puede ser;
       · por las capas FS.0x_TRXx, que SÍ son las estructuras bífilas («TRX01 2TTx58», una cada
         10 m): solo explican el 25,3 % de las filas. Son la cota de altura de tubo —de lo que va
         este plano— y no cubren el campo entero.
     Con el DWG de comunicaciones o el de strings sale solo; con este, no.

     EL RECINTO es «00 - Recinzione» (7 anillos, 157,08 ha). «PVcase PV Area» son las 23 áreas de
     implantación (138,09 ha) y viajan aparte: no son un vallado. */
  catania: {
    title: 'Catania', num: '', pais: 'Italia', estado: 'oferta',
    zona: 33, sur: false, crs: 'EPSG:25833', tzFijo: null,      // Italia: CET/CEST, la regla peninsular vale
    geo: SUBIDAS + '2a19e262-PR.26.203_R02C__TRX___Layout_Catania_ALTURA_TORQUE_TUBE_TRACKERS.dwg',
    com: null,
    /* Se nombran como los nombra su propio bloque —1P58 / 1P29, «1 fila Portrait de N módulos»—
       y NO como las bifilas del resto de la cartera (1V62, 31+31): aquí cada INSERT es UNA FILA.
       La estructura que agrupa dos de ellas existe (TRX01 2TTx58) pero está en otra capa y su
       correspondencia con las filas no sale de este plano. */
    trk: { 'SO.01_TRX1': '1P58', 'SO.01_TRX2': '1P29' },
    capaNCU: null, capaNCUtxt: null, capaNCUsop: null,
    capaHSU: null, capaHSUtxt: null, capaTorre: null,
    capaPS: null, capaVallado: '00 - Recinzione', capaRep: null, capaPira: null,
    mesa: CATANIA, mods: 58,
    /* 1V58 MEDIDO (67,312 m, el bloque TRX01 2TTx58). 1V29 DERIVADO con el mismo modelo de una
       sola ala —29·1,134 + 28·0,015 = 33,306—: su bloque va en 3DSOLID y este lector no le saca
       geometría, así que el largo es del modelo, no de la cinta métrica. El motor cae en el centro
       en las dos (alas iguales), así que desde/hasta son simétricos. */
    largo: { '1P58': 67.312, '1P29': 33.306 }, largoDerivado: ['1P29'],
    /* `mono: true` es cómo se DIBUJA —una sola banda—, y es lo correcto: cada entrada es un tubo.
       No quiere decir que la planta sea monofila: es bífila, y lo que falta es qué tubo va con
       cuál, no el hecho. */
    tipos: {
      '1P58': { largo: 67.312, ancho: 2.382, desde: -33.656, hasta: 33.656, mods: 58, mono: true },
      '1P29': { largo: 33.306, ancho: 2.382, desde: -16.653, hasta: 16.653, mods: 29, mono: true },
    },
    bifilo: { filas: 2, pasoFilas: 5,
               nota: 'Bífilo confirmado por el proyectista (2026-09-10). Cada entrada de `trackers` '
                   + 'es UNA FILA (un tubo): 3.314 filas = 1.657 seguidores. El emparejamiento fila '
                   + 'a fila NO está en este DWG y no se inventa.' },
  },
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
    mesa: SICILIA, largo: { '1V62': 71.908, '1V31': 36.289 }, mods: 31,
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
    mesa: SICILIA, largo: { '1V62': 71.908, '1V31': 36.289 }, mods: 31,
  },
  /* POLVORÍN (25082 · El Polvorín + Higueras, Badajoz). Aquí NO hay dos tipos de seguidor sino
     SIETE, y el tipo lo da el nombre de bloque, que es además el reparto de string que declara la
     cartera («31», «16+15», «8+8+8+7», «5+5+4+4», «3+3+3+4», «24+23*3»). Dos son MONOFILARES, los
     mismos dos que la cartera cuenta en trk_mono. */
  polvorin: {
    title: 'El Polvorín 25082', num: '25082', pais: 'España',
    zona: 29, sur: false, crs: 'EPSG:25829', tzFijo: null,   // Badajoz: en 30N caería en Albacete
    geo: SUBIDAS + 'a0a6539b-LO.PR25.082_R12C_LAYOUT_COMUNICACIONES_02C_1.dwg',
    com: null,
    trk: { '_INT_31+31': '31+31', '_EXT_31+31': '31+31', '_Mono_31+31': 'Mono 31+31',
           '_INT 16+15': '16+15', '_EXT 16+15': '16+15',
           '_2423X3_Interiores': '24+23x3', '_24+23x3': '24+23x3',
           '_EXT 8+8+8+7': '7+8x3', '_5+4': '5+4', '_4+3x3': '4+3x3' },
    capaNCU: 'NCU', capaNCUtxt: 'NCU Text', capaNCUsop: 'NCU',
    capaHSU: 'Sensores - Torre', capaHSUtxt: 'Sensor Text', capaTorre: 'Sensores - Torre',
    capaPS: null, capaVallado: 'Perimetro', capaRep: null, capaPira: null,
    mesa: POLVORIN, mods: 31,
    /* envolvente MEDIDA de cada bloque, con su nº de módulos: el motor no cae en el centro cuando
       las dos alas son desiguales (16+15, 24+23x3, 5+4, 4+3x3), y por eso desde/hasta no son
       simétricos. Sale de tools/_blq.mjs sobre los bloques resueltos. */
    tipos: {
      '31+31':      { largo: 82.386, ancho: 6.884, desde: -41.193, hasta: 41.193, mods: 124 },
      'Mono 31+31': { largo: 82.386, ancho: 2.384, desde: -41.193, hasta: 41.193, mods: 62, mono: true },
      '16+15':      { largo: 41.528, ancho: 6.884, desde: -20.105, hasta: 21.423, mods: 62 },
      '24+23x3':    { largo: 62.616, ancho: 6.884, desde: -30.649, hasta: 31.967, mods: 93 },
      '7+8x3':      { largo: 21.758, ancho: 6.884, desde: -10.879, hasta: 10.879, mods: 31 },
      '5+4':        { largo: 12.532, ancho: 6.884, desde: -5.607,  hasta: 6.925,  mods: 18 },
      '4+3x3':      { largo: 9.896,  ancho: 6.884, desde: -4.289,  hasta: 5.607,  mods: 13 },
    },
  },
};

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
  /* `estado` solo viaja si la ficha lo declara: una planta EN OFERTA no es lo mismo que una
     firmada, y quien lea el layout tiene que poder distinguirlo sin ir a preguntar. */
  ...(C.estado ? { estado: C.estado } : {}),
  /* `bifilo` cuando cada entrada de `trackers` es UNA FILA de un seguidor de dos: sin esto,
     quien lea el layout cuenta 3.314 seguidores donde hay 1.657. No se llama `montaje` porque
     ese campo ya es la ficha de montaje de pvlib y la escribe otra herramienta. */
  ...(C.bifilo ? { bifilo: C.bifilo } : {}),
  crs: C.crs, clat: +clat.toFixed(7), clon: +clon.toFixed(7), cE: r3(cE), cN: r3(cN),
  mods: C.mods, filaZ: C.mesa.filaZ,
  /* `tipos` con la envolvente MEDIDA por bloque. Lo lee calcTDIM del Layout 2D para dibujar cada
     seguidor a su tamaño, y `desde`/`hasta` no son simétricos cuando el motor no cae en el centro
     —alas desiguales—. Si la planta no lo declara, se compone con el modelo a partir del `largo`. */
  mesa: { ...C.mesa, tipos: C.tipos ? C.tipos
    : Object.fromEntries(Object.entries(C.largo || {}).map(([k, lg]) => [k,
        { largo: lg, ancho: 2 * C.mesa.filaZ + C.mesa.modH, desde: -lg / 2, hasta: lg / 2,
          unidades: TRK.filter(t => t.tipo === k).length }])) },
  georef: {
    fuente: C.geo.split('/').pop() + (C.com ? ' + ' + C.com.split('/').pop() : ''),
    huso: `UTM ${C.zona}N`,
    nota: 'El DWG NO trae sistema de coordenadas: ni GEODATA ni texto de cajetín, solo X e Y, y la ' +
          'misma coordenada cae en países distintos según el huso. Se elige el ÚNICO huso ' +
          'compatible que cae en el país que declara la cartera (' + C.pais + '). NO verificado ' +
          'contra ortofoto: el entorno de generación no tiene salida a los servidores de teselas.',
  },
  tipos: { fuente: 'nombre de capa/bloque del DWG, no inferido',
           ...Object.fromEntries(Object.keys(C.tipos || C.largo || {}).map(k => {
             const T = (C.tipos || {})[k], lg = T ? T.largo : (C.largo || {})[k];
             return [k, `${T && T.mono ? 'MONOFILAR' : 'bifilar'} · ${T && T.mods ? T.mods + ' módulos · ' : ''}${lg} m` +
                        `  (×${TRK.filter(t => t.tipo === k).length})`]; })) },
  /* El seguidor MÁS LARGO de la planta es el que fija la cota canónica; los demás se declaran con
     `mr`, la razón entre su largo y el de aquél, que es como el visor acorta un seguidor corto sin
     inventarle una cota propia. Un `t:'Medio'` es lo que el 3D busca para saber que va acortado. */
  trackers: (() => {
    const lg = k => ((C.tipos || {})[k] || {}).largo || (C.largo || {})[k] || 0;
    const LMAX = Math.max(...TRK.map(t => lg(t.tipo)), 0) || 1;
    return TRK.map((t, i) => { const [x, n] = loc(t.E, t.N);
      const T = (C.tipos || {})[t.tipo] || {}, corto = lg(t.tipo) < LMAX - 0.01;
      return { x, n, rot: t.rot, t: corto ? 'Medio' : 'completo', id: 'TK' + String(i + 1).padStart(4, '0'),
               /* sin NCUs dibujadas no hay reparto que valga: va a null y no a 0, que es un
                  número de NCU y aquí no hay ninguna */
               tp: t.tipo, mods: T.mods != null ? T.mods : C.mods,
               ncu: NCUS.length ? t.ncu : null, gw: NCUS.length ? t.ncu : null,
               ...(corto ? { mr: +(lg(t.tipo) / LMAX).toFixed(5) } : {}),
               ...(T.mono ? { filaZ: 0 } : {}),                      // monofilar: sus dos filas son una
               ...(t.esp ? { esp: 1 } : {}), ...(NCUS.length && !t.zona ? { ncuCerca: 1 } : {}) }; });
  })(),
  ncus: NCUS.map(o => ({ x: o.x, n: o.n, name: o.name, enlace: o.enlace })),
  meteo: METEO, reps: REPS, ps: PS, piranometros: PIRA, fence: FENCE,
  /* Lo que el DWG trae y AQUÍ NO se ha extraído todavía, dicho en vez de callado: los viales van
     como HATCH de PVcase y necesitan el tratamiento de superficies de tools/extract_roads.mjs; las
     plataformas, la balsa y el drenaje de Panbianco vienen como XREF y no están en este fichero. */
  pendiente: ['viales (HATCH de PVcase)', 'plataformas/balsa/drenaje (XREF externos)', 'cotas del terreno'],
  ...(ajuste ? { traslacion: { ...ajuste, nota: 'El campo de seguidores venía dibujado en marco LOCAL y el resto del plano en UTM. Traslación recuperada maximizando los seguidores dentro de los ámbitos de NCU dibujados, y CONTRASTADA contra el vallado, que no entró en el ajuste.' } } : {}),
  generado_de: 'tools/dwg_a_layout.mjs',
};
/* RECUENTO DE MÓDULOS por tipo, que es el contraste independiente contra la cartera: si el DWG y
   la ficha dicen el mismo número, la lectura de bloques es buena. */
const _mods = TRK.reduce((a, t) => a + (((C.tipos || {})[t.tipo] || {}).mods || 0), 0);
console.log(`\n  módulos: ${_mods.toLocaleString('es')}  (` +
  Object.keys(C.tipos || {}).map(k => k + ' ' + (((C.tipos || {})[k] || {}).mods || 0) + '×' + TRK.filter(t => t.tipo === k).length).join(' · ') + ')');
const xs = L.trackers.map(t => t.x), ns = L.trackers.map(t => t.n);
console.log(`  huella ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} x ${(Math.max(...ns) - Math.min(...ns)).toFixed(0)} m`);
if (!WRITE) { console.log('\n(dry-run: pasa --write)'); process.exit(0); }
writeFileSync(RAIZ + planta + '_layout.json', JSON.stringify(L));
console.log(`\nescrito ${planta}_layout.json`);
