/* Genera <planta>_layout.json a partir del KML de layout de un proyecto en OFERTA.
 *
 * Dicayagua llegó en KML de Google Earth, no en DWG: 22.902 marcas repartidas en 18 carpetas
 * (estructuras, viales, vallado, zanjas, centros de transformación, subestación, BESS, áreas). El
 * KML es aquí lo que el DWG es en las demás plantas: la autoridad. Todo lo que sale de este fichero
 * está MEDIDO sobre él; nada se deduce.
 *
 * OJO, ESTA PLANTA NO ES DE SEGUIDORES. El plano dice «Estructura: Generic - 3V, inclinación fija
 * 10°», y la medida lo confirma: las mesas son largas ESTE-OESTE (20,48 m) y estrechas norte-sur
 * (7,25 m), justo al revés que un seguidor de eje N-S. Se emiten en el campo `trackers` porque es
 * lo que leen las herramientas de la casa, pero con `rot:90` —el eje largo apuntando al este— y con
 * `fija` describiendo lo que son. Quien lea este fichero tiene que saberlo.
 *
 * CONVENIO DE COORDENADAS, el mismo que el resto del ecosistema:
 *   lat/lon del KML -> UTM (Krüger, la conversión ya validada a 3 mm en tres plantas)
 *   x = E − cE      n = N − cN      con (cE,cN) el centro del campo de estructuras
 *
 *   node tools/kml_a_layout.mjs <layout.kml> <planta> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [kmlPath, planta, ...rest] = process.argv.slice(2);
const WRITE = rest.includes('--write');
if (!kmlPath || !planta) { console.error('uso: node tools/kml_a_layout.mjs <layout.kml> <planta> [--write]'); process.exit(2); }
const RAIZ = new URL('..', import.meta.url).pathname;

/* ---------- WGS84 -> UTM (serie de Krüger), la misma de gen_siting.mjs ---------- */
function utm(lat, lon, zona, sur) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const lam0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180, phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - 2 * Math.sqrt(n) / (1 + n) * Math.atanh(2 * Math.sqrt(n) / (1 + n) * Math.sin(phi)));
  const xi = Math.atan(t / Math.cos(lam - lam0)), eta = Math.atanh(Math.sin(lam - lam0) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + k0 * A * E, (sur ? 10000000 : 0) + k0 * A * N];
}

/* ---------- lectura del KML: carpeta -> marcas, con su geometría ---------- */
const xml = readFileSync(kmlPath, 'utf8');
function carpetas(s) {
  /* El KML es plano y enorme; se trocea por <Folder> con un contador de anidamiento en vez de
     parsearlo entero, que con 9,7 MB y 22.902 marcas es mucho más rápido y no necesita librería. */
  const out = {};
  let i = 0;
  while ((i = s.indexOf('<Folder>', i)) >= 0) {
    /* Se busca SU cierre llevando la cuenta de anidamiento. Sin esta cuenta, el primer </Folder>
       que aparecía cerraba la carpeta de fuera y todas las marcas del fichero acababan en todas
       las carpetas: salían 22.879 centros de transformación y 815 km de viales. */
    let j = i + 8, prof = 1;
    while (prof > 0) {
      const a = s.indexOf('<Folder>', j), b = s.indexOf('</Folder>', j);
      if (b < 0) { j = s.length; break; }
      if (a >= 0 && a < b) { prof++; j = a + 8; } else { prof--; j = b + 9; }
    }
    const bloque = s.slice(i, j);
    const nom = (/<name>([^<]*)<\/name>/.exec(bloque) || [, ''])[1].trim();
    /* Solo las marcas PROPIAS: las de las subcarpetas se recogen en su propia vuelta. Se mira el
       INTERIOR del bloque, sin sus propias etiquetas: si no, el patrón casaba la carpeta consigo
       misma —empieza por <Folder> y acaba por </Folder>— y se borraba entera. */
    const dentro = bloque.slice(8, -9);
    const sinHijas = dentro.replace(/<Folder>[\s\S]*?<\/Folder>/g, '');
    const marcas = [...sinHijas.matchAll(/<Placemark[\s\S]*?<\/Placemark>/g)].map(x => x[0]);
    if (nom && marcas.length) (out[nom] = out[nom] || []).push(...marcas);
    i += 8;
  }
  return out;
}
const F = carpetas(xml);
const puntos = pm => {
  const c = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm);
  if (!c) return [];
  return c[1].trim().split(/\s+/).map(t => t.split(',')).filter(p => p.length >= 2)
             .map(p => [parseFloat(p[0]), parseFloat(p[1]), p.length > 2 ? parseFloat(p[2]) : 0]);
};
const nombre = pm => (/<name>([^<]*)<\/name>/.exec(pm) || [, ''])[1].trim();

/* zona UTM del propio campo */
const est = (F['Structures'] || []).map(puntos).filter(p => p.length >= 4);
if (!est.length) { console.error('el KML no trae carpeta "Structures" con polígonos'); process.exit(1); }
const todosLat = est.flat().map(p => p[1]), todosLon = est.flat().map(p => p[0]);
const clat = (Math.min(...todosLat) + Math.max(...todosLat)) / 2;
const clon = (Math.min(...todosLon) + Math.max(...todosLon)) / 2;
const zona = Math.floor((clon + 180) / 6) + 1, sur = clat < 0;
const [cE, cN] = utm(clat, clon, zona, sur);
const XY = (lon, lat) => { const [e, n] = utm(lat, lon, zona, sur); return [e - cE, n - cN]; };
const r2 = v => +v.toFixed(2);

/* ---------- las mesas ---------- */
const mesas = est.map((c, i) => {
  const xy = c.slice(0, 4).map(p => XY(p[0], p[1]));
  const xs = xy.map(q => q[0]), ys = xy.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x: r2((x0 + x1) / 2), n: r2((y0 + y1) / 2), largo: +(x1 - x0).toFixed(2), ancho: +(y1 - y0).toFixed(2),
           id: nombre(F['Structures'][i]) || ('E' + (i + 1)) };
});
const tam = {};
for (const m of mesas) { const k = m.largo + 'x' + m.ancho; tam[k] = (tam[k] || 0) + 1; }
const tipos = Object.entries(tam).sort((a, b) => b[1] - a[1]);
console.log(`${mesas.length} estructuras · ${tipos.length} tamaños:`);
for (const [k, n] of tipos) console.log(`   ${k} m   x${n}`);

/* Nombre de tipo por tamaño: el KML no los clasifica, así que el tipo ES su largo medido. */
const clave = m => 'M' + m.largo.toFixed(2).replace('.', '_');
const mesaTipos = {};
for (const [k, n] of tipos) {
  const [L, A] = k.split('x').map(Number);
  mesaTipos['M' + L.toFixed(2).replace('.', '_')] = { largo: L, ancho: A, desde: -L / 2, hasta: L / 2, unidades: n };
}

/* ---------- el resto de capas, cada una con lo suyo ---------- */
const centroide = pm => { const p = puntos(pm); if (!p.length) return null;
  const xy = p.map(q => XY(q[0], q[1]));
  return [r2(xy.reduce((s, q) => s + q[0], 0) / xy.length), r2(xy.reduce((s, q) => s + q[1], 0) / xy.length)]; };
const linea = pm => puntos(pm).map(q => { const [x, n] = XY(q[0], q[1]); return [r2(x), r2(n)]; });
const areaDe = pm => { const xy = puntos(pm).map(q => XY(q[0], q[1])); let s = 0;
  for (let i = 0; i < xy.length - 1; i++) s += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  return Math.abs(s) / 2; };
const largoDe = pm => { const xy = puntos(pm).map(q => XY(q[0], q[1])); let s = 0;
  for (let i = 0; i < xy.length - 1; i++) s += Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]);
  return s; };

const ps = (F['Power Stations'] || []).map((pm, i) => { const c = centroide(pm); return { id: 'PS' + (i + 1), x: c[0], n: c[1] }; });
const sub = (F['Substations'] || []).map(pm => { const c = centroide(pm); return { x: c[0], n: c[1], area: +areaDe(pm).toFixed(0) }; });
const bess = (F['DC BESS Containers'] || []).map((pm, i) => { const c = centroide(pm); return { id: 'B' + (i + 1), x: c[0], n: c[1] }; });
const roads = (F['Internal Roads'] || []).map(linea);
const fence = (F['Civil Fences'] || []).map(linea);
const areas = (F['Available Areas'] || []).map(pm => ({ nombre: nombre(pm), ha: +(areaDe(pm) / 10000).toFixed(2), poly: linea(pm) }));
const restr = (F['Restricted Areas: RA'] || []).map(pm => ({ ha: +(areaDe(pm) / 10000).toFixed(2), poly: linea(pm) }));

const kmDe = arr => +(arr.reduce((s, pm) => s + largoDe(pm), 0) / 1000).toFixed(2);
console.log(`\ncentros de transformación ${ps.length} · subestación ${sub.length} · contenedores BESS ${bess.length}`);
console.log(`viales ${kmDe(F['Internal Roads'] || [])} km · vallado ${kmDe(F['Civil Fences'] || [])} km`);
console.log(`zanjas MT ${kmDe(F['MV Electrical cabling trenches'] || [])} km · BT ${kmDe(F['LV Electrical cabling trenches'] || [])} km`);
const haDisp = areas.reduce((s, a) => s + a.ha, 0), haRes = restr.reduce((s, a) => s + a.ha, 0);
console.log(`área disponible ${haDisp.toFixed(2)} ha − restringida ${haRes.toFixed(2)} = ${(haDisp - haRes).toFixed(2)} ha aptas`);

/* ---------- el fichero ---------- */
/* Reparto de módulos por mesa. El plano dice «Generic - 3V» —tres filas— y el módulo Astronergy
   CHSM66N(DG)F-BH-685 mide 1,134 m de ancho, así que en los 20,48 m medidos entran 18 columnas y
   en los 10,28 entran 9.
   NO CUADRA CON EL PLANO, y queda escrito en el propio fichero: 4.851×54 + 642×27 = 279.288
   módulos, y el plano declara 263.640. Un 5,9 %. No hay reparto entero que dé la cifra del plano
   (con 17 columnas salen 262.809 y con 17/9, 264.735), así que no es un redondeo: es que el KML y
   el plano son revisiones distintas. Lo mismo pasa con los centros de transformación (19 medidos
   contra 18 declarados) y con el vallado (17,77 km contra 18,83). Manda lo dibujado, que es lo que
   se ve; la cifra del plano queda anotada al lado. */
const MODW = 1.134, ROWS = 3, TILT = 10;

const L = {
  plant: planta, title: 'El Naranjo Dicayagua', estado: 'oferta',
  crs: `EPSG:${(sur ? 32700 : 32600) + zona}`, clat: +clat.toFixed(7), clon: +clon.toFixed(7),
  cE: +cE.toFixed(3), cN: +cN.toFixed(3),
  /* HUSO de la planta, en minutos y SIN cambio de hora. La República Dominicana va en UTC−4 todo
     el año (no aplica horario de verano desde 1974). Sin este dato el visor cae a la regla
     peninsular —España/Italia— y en verano dibujaba el sol de Madrid: seis horas de desfase. */
  tzFijo: -240,
  /* NO es una planta de seguidores: estructura fija. Va aquí arriba para que se lea antes que nada. */
  fija: { tilt: 10, tipo: 'Generic 3V', pitch: 8.8, nota: 'inclinación fija 10°, 3 módulos en vertical (del plano de layout)' },
  mesa: { modH: null, filaZ: 0, tipos: mesaTipos,
          fuente: `medido en ${kmlPath.split('/').pop()} (carpeta Structures del KML)` },
  /* MESAS FIJAS en el esquema `fijas` de la casa, el mismo que Túnez: el 3D y el Layout 2D ya lo
     saben dibujar y no hace falta inventar nada nuevo.
       w  ancho de la mesa, MEDIDO
       p  fondo EN PLANTA, MEDIDO (la mesa sobre su plano inclinado mide p/cos(i); lo desescorza
          el propio visor, como en Túnez)
       inclinacion  10°, del plano de oferta
       azimut 180   mirando al sur. DERIVADO: el plano no lo dice, pero las mesas son largas
          este-oeste y esto es hemisferio norte; no hay otra orientación posible
       h 0.8        canto bajo sobre el suelo. DERIVADO: el proyecto no lo publica y es la misma
          cota que usa Túnez
       cols/rows    DERIVADOS y NO cuadran con el plano — ver la nota `modulos` de abajo */
  fijas: mesas.map(m => { const cols = Math.round(m.largo / MODW), rows = ROWS;
    return { nombre: m.id, x: m.x, n: m.n, w: m.largo, p: m.ancho, cols, rows, mods: cols * rows,
             inclinacion: TILT, azimut: 180, h: 0.8 }; }),
  /* trackers[] se mantiene porque es lo que leen el Layout 2D y la Cobertura para el encuadre y el
     recuento; aquí NO son seguidores, son las mismas mesas fijas. */
  trackers: mesas.map(m => ({ x: m.x, n: m.n, rot: 90, t: 'completo', id: m.id, blk: clave(m), ncu: 1, gw: 1 })),
  ncus: [], meteo: [], reps: [],
  ps, subestacion: sub[0] || null, bess,
  roads, fence, areas, restringidas: restr,
  modulos: { por_geometria: null, declarado_plano: 263640, modW: MODW, rows: ROWS,
             nota: 'cols = ancho medido / 1,134 (módulo Astronergy CHSM66N-685) y 3 filas («Generic 3V»). El total por geometría NO coincide con el del plano: son revisiones distintas, igual que 19 CT medidos contra 18 declarados' },
  generado_de: `${kmlPath.split('/').pop()} · tools/kml_a_layout.mjs`,
};
/* La cuerda de la mesa fija es su fondo: 7,25 m, el mismo en los dos tamaños. Se toma del propio
   dato medido y no de la constante de El Burgo. */
L.mesa.modH = tipos.length ? +tipos[0][0].split('x')[1] : null;

L.modulos.por_geometria = L.fijas.reduce((s2, f) => s2 + f.mods, 0);
console.log(`\nmódulos por geometría ${L.modulos.por_geometria.toLocaleString('es')} · el plano declara ${L.modulos.declarado_plano.toLocaleString('es')} (${((L.modulos.por_geometria / L.modulos.declarado_plano - 1) * 100).toFixed(1)} %)`);
const rep = {}; L.fijas.forEach(f => { const k = f.cols + 'x' + f.rows; rep[k] = (rep[k] || 0) + 1; });
console.log('reparto: ' + Object.entries(rep).map(([k, v]) => k + ' → ' + v + ' mesas').join(' · '));

if (!WRITE) { console.log('\n(dry-run: pasa --write para escribir ' + planta + '_layout.json)'); process.exit(0); }
writeFileSync(RAIZ + planta + '_layout.json', JSON.stringify(L));
console.log(`\nescrito ${planta}_layout.json (${(JSON.stringify(L).length / 1024 / 1024).toFixed(2)} MB)`);
