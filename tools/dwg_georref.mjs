/* ¿EN QUÉ SISTEMA ESTÁ ESTE DWG? Un layout en UTM sin decir su huso no sirve: la misma X e Y caen
   en Andalucía o en Sicilia según la zona, y de ahí saldría el satélite y el relieve de otro sitio.
   Este script NO adivina: busca la evidencia que el propio fichero traiga —variables de cabecera,
   la definición de sistema de coordenadas geográficas, textos con EPSG/huso— y, por separado,
   enumera las zonas compatibles con la coordenada para que se elija con un criterio declarado.

       node tools/dwg_georref.mjs <fichero.dwg>                                                   */
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta) { console.error('uso: node tools/dwg_georref.mjs <fichero.dwg>'); process.exit(2); }
const lib = await LibreDwg.create();
if (typeof lib.dwg_bmp === 'function') lib.dwg_bmp = () => null;
const db = lib.convert(lib.dwg_read_data(readFileSync(ruta).buffer, 0));

console.log('· ' + ruta.split('/').pop());

/* 1. Cabecera y tablas: aquí es donde AutoCAD guarda el sistema de coordenadas si el plano se
      georreferenció de verdad (GEODATA, $PROJECTNAME, las variables de unidades). */
const cab = db.header || db.tables?.header || {};
const claves = Object.keys(cab).filter(k => /COORD|GEO|PROJ|UNIT|INSUNIT|LATI|LONGI|NORTH|ELEV|UCS/i.test(k));
console.log('  cabecera con pistas: ' + (claves.length ? '' : '(ninguna)'));
claves.forEach(k => console.log('    ' + k + ' = ' + JSON.stringify(cab[k])));
for (const k of ['GEODATA', 'geoData', 'objects']) if (db[k]) console.log('  db.' + k + ': ' + (Array.isArray(db[k]) ? db[k].length + ' elementos' : typeof db[k]));

/* 2. Cualquier texto del plano que nombre un sistema. En los planos de la casa suele venir en el
      cajetín: «ETRS89 UTM 30N», «WGS84 / UTM zone 33N», «EPSG:25830»… */
const E = db.entities || [];
const T = [];
for (const e of E) { const t = (e.text ?? e.textValue ?? '').toString(); if (t.trim()) T.push(t.replace(/\s+/g, ' ').trim()); }
for (const e of E) for (const a of (e.attributes || e.attribs || [])) { const t = (a.text ?? a.textValue ?? '').toString(); if (t.trim()) T.push(t.replace(/\s+/g, ' ').trim()); }
const sis = [...new Set(T.filter(t => /ETRS|WGS|EPSG|UTM|HUSO|FUSO|ZONE|ZONA|GAUSS|MONTE\s*MARIO|ROMA\s*40|DATUM/i.test(t)))];
console.log('  textos con sistema: ' + (sis.length ? '' : '(ninguno)'));
sis.slice(0, 25).forEach(t => console.log('    « ' + t.slice(0, 160) + ' »'));

/* 3. Zonas COMPATIBLES con la coordenada. Toda X entre 160.000 y 840.000 vale para cualquier huso:
      la coordenada sola NUNCA identifica la zona. Se listan las candidatas y a qué punto del mundo
      correspondería cada una, para poder cruzarlo con el nombre del proyecto o con el cliente. */
const gx = e => e.x ?? e.insertionPoint?.x, gy = e => e.y ?? e.insertionPoint?.y;
const P = E.filter(e => e.type === 'INSERT').map(e => [gx(e), gy(e)]).filter(p => isFinite(p[0]) && p[0] > 100000 && p[1] > 1000000);
if (!P.length) { console.log('  sin INSERTs en coordenadas UTM'); process.exit(0); }
const E0 = P.reduce((s, p) => s + p[0], 0) / P.length, N0 = P.reduce((s, p) => s + p[1], 0) / P.length;
console.log('  centro de las inserciones: E ' + E0.toFixed(1) + '  N ' + N0.toFixed(1));

function inv(E1, N1, zona, sur) {            // UTM -> lat/lon (Krüger inversa, la misma serie del repo)
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
  const de = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
  const xi = (N1 - (sur ? 10000000 : 0)) / (k0 * A), eta = (E1 - 500000) / (k0 * A);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const ch = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let lat = ch;
  for (let j = 1; j <= 3; j++) lat += de[j - 1] * Math.sin(2 * j * ch);
  const lon = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180 + Math.atan(Math.sinh(ep) / Math.cos(xp));
  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}
console.log('  zonas compatibles (la coordenada sola NO identifica el huso):');
for (const z of [28, 29, 30, 31, 32, 33, 34]) {
  const [la, lo] = inv(E0, N0, z, false);
  console.log('    UTM ' + z + 'N (EPSG:326' + z + ')  ->  ' + la.toFixed(5) + ', ' + lo.toFixed(5)
    + '   https://www.openstreetmap.org/?mlat=' + la.toFixed(5) + '&mlon=' + lo.toFixed(5) + '#map=14/' + la.toFixed(4) + '/' + lo.toFixed(4));
}
