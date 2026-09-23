/* dem_error_vertical.mjs — cuánto se equivoca el DEM SOLO, en metros.
 *
 * ═══ POR QUÉ ESTA Y NO LA DE LA RESOLUCIÓN ═══
 *
 * `dem_cobertura_cartera.mjs` intentó establecer la resolución real del DEM por
 * la firma del remuestreo, y la respuesta honrada fue «no se puede por ese
 * camino»: terrarium no remuestrea bilinealmente, así que la firma no está
 * aunque el dato venga de una fuente gruesa.
 *
 * Pero la resolución nunca fue la pregunta. La pregunta es CUÁNTO SE EQUIVOCA,
 * y eso sí se puede medir, porque en Ayora y San José hay VERDAD DE CAMPO: un
 * levantamiento as-built con cota medida en cada extremo de fila.
 *
 * Y el número que sale de aquí es el que va en el rótulo de calidad de las
 * plantas que sólo tienen DEM. No se puede validar el DEM de Túnez —no hay
 * levantamiento— pero sí se puede decir cuánto se equivoca el MISMO producto
 * en las dos plantas donde hay con qué compararlo, y rotularlo así.
 *
 *   node tools/dem_error_vertical.mjs [--zoom 14] [plantas…]
 *
 * ═══ EL ESCALÓN NO ES ERROR, Y SE SEPARA ═══
 *
 * Entre el levantamiento y el DEM hay un escalón SISTEMÁTICO de varios metros:
 * son datums verticales distintos —el DEM viene sobre elipsoide o sobre un
 * geoide global, el levantamiento sobre el de la obra—. Eso no es error del
 * DEM: es una constante, y una constante NO MUEVE EL RELIEVE (medido: un
 * desplazamiento uniforme cambia el relieve en 1e-12 dB).
 *
 * Lo que sí es error es lo que queda DESPUÉS de quitar la mediana. Por eso se
 * publican las dos cosas por separado y no un solo número: juntarlas daría un
 * «error» de metros que en realidad no afecta a nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ZOOM = parseInt(arg('zoom', '14'), 10);
const OFF = 0.14;                                  // cara del módulo sobre el eje
const EJE = parseFloat(arg('eje', '1.20'));        // estándar Factiun DECLARADO

function pngRGB(buf) {
  let p = 8, W = 0, H = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tipo = buf.toString('ascii', p + 4, p + 8);
    if (tipo === 'IHDR') { W = buf.readUInt32BE(p + 8); H = buf.readUInt32BE(p + 12);
      bd = buf[p + 16]; ct = buf[p + 17]; }
    else if (tipo === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    else if (tipo === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error('PNG no soportado: bd=' + bd + ' ct=' + ct);
  const ca = ct === 2 ? 3 : 4, raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * ca, out = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], lin = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ca ? out[y * stride + x - ca] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= ca && y > 0) ? out[(y - 1) * stride + x - ca] : 0;
      let v = lin[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[y * stride + x] = v & 255;
    }
  }
  return { W, H, ca, px: out };
}
const cacheTeselas = new Map();
async function tesela(z, x, y) {
  const k = z + '/' + x + '/' + y;
  if (cacheTeselas.has(k)) return cacheTeselas.get(k);
  const r = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + k + '.png');
  if (!r.ok) throw new Error('tesela ' + k + ': HTTP ' + r.status);
  const img = pngRGB(Buffer.from(await r.arrayBuffer()));
  cacheTeselas.set(k, img);
  return img;
}
const lon2px = (lon, z) => (lon + 180) / 360 * Math.pow(2, z) * 256;
const lat2px = (lat, z) => { const la = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * Math.pow(2, z) * 256; };
function hazDem(z) {
  return { async cota(lat, lon) {
    const fx = lon2px(lon, z), fy = lat2px(lat, z);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const v = async (px, py) => {
      const img = await tesela(z, Math.floor(px / 256), Math.floor(py / 256));
      const ix = ((py % 256) * img.W + (px % 256)) * img.ca;
      return img.px[ix] * 256 + img.px[ix + 1] + img.px[ix + 2] / 256 - 32768;
    };
    const a = await v(x0, y0), b = await v(x0 + 1, y0), c = await v(x0, y0 + 1), d = await v(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  } };
}
const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mediana = a => pct(a, 0.5);

/* Sólo donde hay verdad de campo. Las demás NO se pueden validar, y eso es
   parte del resultado: su rótulo dirá «solo DEM, sin validar». */
const TODAS = fs.readdirSync(RAIZ).filter(f => f.endsWith('_cotas.json'))
  .map(f => f.replace('_cotas.json', '')).sort();
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--') &&
  process.argv[process.argv.indexOf(a) - 1] !== '--zoom' &&
  process.argv[process.argv.indexOf(a) - 1] !== '--eje');
const PLANTAS = TODAS.filter(p => !SOLO.length || SOLO.includes(p));

if (!PLANTAS.length) {
  console.log('SIN MEDIDA: no hay ningún <planta>_cotas.json.');
  console.log('No se ha comprobado nada. Esto no es un verde.');
  process.exit(0);
}

console.log('error vertical del DEM SOLO, contra el levantamiento as-built');
console.log('teselas terrarium z' + ZOOM + ' · eje ' + EJE.toFixed(2) + ' m DECLARADO + off ' + OFF + '\n');

const resumen = [];
for (const planta of PLANTAS) {
  const fc = path.join(RAIZ, planta + '_cotas.json'), fl = path.join(RAIZ, planta + '_layout.json');
  if (!fs.existsSync(fc) || !fs.existsSync(fl)) { console.log('  ' + planta + ': falta cotas o layout'); continue; }
  const C = JSON.parse(fs.readFileSync(fc, 'utf8')), L = JSON.parse(fs.readFileSync(fl, 'utf8'));
  const mPerLat = 111320, mPerLon = 111320 * Math.cos(L.clat * Math.PI / 180);
  const dem = hazDem(ZOOM);
  const H = EJE + OFF;

  /* LAS COTAS MEDIDAS, en los extremos de fila: son las de verdad, sin
     densificar. Densificar aquí inventaría puntos de comparación. */
  const pts = [];
  for (const t of C.t) { if (!t) continue;
    for (const f of t.f) for (const k of [0, 1]) pts.push([f.x, f.n[k], C.base + f.y[k] - H]); }

  const dif = [];
  for (const p of pts) dif.push(p[2] - await dem.cota(L.clat + p[1] / mPerLat, L.clon + p[0] / mPerLon));
  const esc = mediana(dif);
  const res = dif.map(d => d - esc);            // quitado el escalón de datum
  const abs = res.map(Math.abs);

  console.log('═══ ' + planta.toUpperCase() + ' ═══  ' + pts.length.toLocaleString('es')
            + ' cotas medidas · ' + cacheTeselas.size + ' teselas');
  console.log('  escalón de datum (mediana, NO es error): ' + esc.toFixed(2) + ' m');
  console.log('  error del DEM una vez quitado el escalón:');
  console.log('      |err| p50 ' + pct(abs, 0.5).toFixed(2) + ' m   p95 ' + pct(abs, 0.95).toFixed(2)
            + '   máx ' + Math.max(...abs).toFixed(2));
  console.log('      firmado p05 ' + pct(res, 0.05).toFixed(2) + '   p95 ' + pct(res, 0.95).toFixed(2) + '\n');
  resumen.push({ planta, n: pts.length, esc, p50: pct(abs, 0.5), p95: pct(abs, 0.95), max: Math.max(...abs) });
}

if (resumen.length) {
  console.log('═══ EL RÓTULO DE CALIDAD SALE DE AQUÍ ═══');
  console.log('');
  console.log('  Estas dos plantas tienen levantamiento, así que su terreno va');
  console.log('  rotulado «DEM+levantamiento, validado p50 0,03–0,07 m» (el número lo');
  console.log('  da `relieve_de_levantamiento.mjs`, que valida el fichero FINAL).');
  console.log('');
  console.log('  Lo que esta medida añade es cuánto se equivoca el DEM **SOLO**, que');
  console.log('  es lo que van a tener las otras ocho:');
  console.log('');
  console.log('    planta        n      escalón   |err| p50    p95     máx');
  for (const r of resumen) {
    console.log('    ' + r.planta.padEnd(12) + String(r.n).padStart(6)
      + (r.esc.toFixed(2) + ' m').padStart(11)
      + (r.p50.toFixed(2) + ' m').padStart(11) + (r.p95.toFixed(2)).padStart(8)
      + (r.max.toFixed(2)).padStart(8));
  }
  console.log('');
  console.log('  ⚠ Y ESTE NÚMERO NO SE PUEDE TRASLADAR SIN MÁS a las otras ocho. Sale');
  console.log('  de dos plantas, y la fuente que hay debajo de las teselas cambia con');
  console.log('  la región. Es la mejor cota que hay, no una garantía: por eso el');
  console.log('  rótulo de las otras dice «solo DEM, SIN VALIDAR» y no repite este');
  console.log('  número como si fuera suyo.');
}
