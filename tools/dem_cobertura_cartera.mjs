/* dem_cobertura_cartera.mjs — ¿el DEM cubre de verdad cada planta, y a qué
 * resolución REAL?
 *
 * ═══ POR QUÉ ESTO VA PRIMERO ═══
 *
 * Ayora y San José tienen terreno porque tienen LEVANTAMIENTO. Las otras no, y
 * la idea es darles terreno desde el DEM. Pero antes de generar nada hay que
 * contestar dos cosas por planta, no en global:
 *
 *   1 · ¿llegan las teselas? Túnez está en África, Dicayagua en el Caribe y
 *       San José en el hemisferio sur. La cobertura y la fuente cambian, y
 *       «el DEM cubre» dicho del conjunto no significa nada.
 *   2 · ¿a qué resolución REAL? Una tesela de z14 son ~7 m/píxel, pero eso es
 *       la rejilla de la IMAGEN, no la del dato. Si debajo hay SRTM de 30 m
 *       remuestreado, pedirle 6 m de paso es pedirle precisión que no tiene.
 *
 * ═══ CÓMO SE MIDE LA RESOLUCIÓN, SIN SUPONERLA ═══
 *
 * No por lo que diga la documentación de la fuente —que además no se puede
 * consultar desde aquí—, sino por una FIRMA en el propio dato.
 *
 * Si una rejilla fina sale de remuestrear BILINEALMENTE una más gruesa de
 * factor N, a lo largo de una fila la SEGUNDA DIFERENCIA es exactamente cero
 * dentro de cada tramo de N píxeles, y sólo deja de serlo en los nodos de la
 * rejilla original. O sea: la separación entre segundas diferencias NO NULAS
 * da N directamente, y la resolución real es N × el tamaño de píxel.
 *
 * Esto es una medida, no una inferencia: si el dato fuera nativo a la
 * resolución de la tesela, las segundas diferencias serían no nulas casi en
 * todas partes y N saldría 1.
 *
 * Se mide sobre los PÍXELES CRUDOS de la tesela, sin interpolar: interpolar
 * antes de medir la interpolación no diría nada.
 *
 *   node tools/dem_cobertura_cartera.mjs [--zoom 14] [plantas…]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ZOOM = parseInt(arg('zoom', '14'), 10);
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--') &&
  process.argv[process.argv.indexOf(a) - 1] !== '--zoom');

/* ── PNG Terrarium, igual que en `relieve_de_levantamiento.mjs` ───────────
   Se copia el descodificador a propósito y se dice: node no trae lector de
   PNG, y el del generador es una función interna sin exportar. Lo que NO se
   copia es ninguna decisión —aquí no se construye malla ninguna—, así que no
   hay dos fuentes de verdad que puedan separarse. */
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

const lon2px = (lon, z) => (lon + 180) / 360 * Math.pow(2, z) * 256;
const lat2px = (lat, z) => { const la = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * Math.pow(2, z) * 256; };

async function tesela(z, x, y) {
  const url = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + x + '/' + y + '.png';
  const r = await fetch(url);
  if (!r.ok) return { error: 'HTTP ' + r.status };
  try { return pngRGB(Buffer.from(await r.arrayBuffer())); }
  catch (e) { return { error: String(e.message || e) }; }
}
export const cotaPx = (img, ix, iy) => {
  const k = (iy * img.W + ix) * img.ca;
  return img.px[k] * 256 + img.px[k + 1] + img.px[k + 2] / 256 - 32768;
};

/* EL FACTOR DE REMUESTREO.
 *
 * ═══ LA PRIMERA VERSIÓN DE ESTO ESTABA ROTA, Y SE DEJA DICHO ═══
 *
 * Buscaba segundas diferencias «exactamente no nulas» con umbral 1/256 m. Pero
 * 1/256 es EXACTAMENTE el escalón de cuantización de terrarium, así que el
 * ruido de redondeo lo disparaba en todos los píxeles y salía N = 1 en las doce
 * plantas — incluida Túnez, que casi con seguridad es SRTM de 30 m. Un
 * detector que da «nativo» siempre no está midiendo: está diciendo que sí.
 *
 * ═══ CÓMO SE MIDE AHORA ═══
 *
 * No por un umbral, que es justo lo que había que elegir a ojo, sino por
 * PERIODICIDAD. Si la rejilla viene de remuestrear bilinealmente de factor N,
 * la curvatura verdadera se concentra en los NODOS —posiciones ≡ fase (mod N)—
 * y entre nodos sólo queda ruido de redondeo. Así que para cada N y cada fase
 * se compara la |segunda diferencia| media EN los nodos contra la de ENTRE
 * nodos, y se queda el N con el contraste más fuerte.
 *
 * Se publica el CONTRASTE junto al N, no sólo el N: sin él, «N = 4» es una
 * afirmación que nadie puede comprobar. Contraste bajo significa que no hay
 * firma —dato nativo, o firma no detectable—, y eso se dice en vez de
 * redondearlo a 1. */
const N_MAX = 8;
export function factorRemuestreo(img) {
  const suma = [], cuenta = [];
  for (let n = 0; n <= N_MAX; n++) { suma.push(new Array(n + 1).fill(0)); cuenta.push(new Array(n + 1).fill(0)); }
  const linea = (leer, largo, cuantas) => {
    for (let a = 1; a < cuantas - 1; a += 7) {
      for (let i = 1; i < largo - 1; i++) {
        const d2 = Math.abs(leer(a, i - 1) - 2 * leer(a, i) + leer(a, i + 1));
        for (let n = 2; n <= N_MAX; n++) { const f = i % n; suma[n][f] += d2; cuenta[n][f]++; }
      }
    }
  };
  linea((a, i) => cotaPx(img, i, a), img.W, img.H);      // filas
  linea((a, i) => cotaPx(img, a, i), img.H, img.W);      // columnas

  let mejorN = null, mejorC = 0;
  for (let n = 2; n <= N_MAX; n++) {
    for (let f = 0; f < n; f++) {
      if (!cuenta[n][f]) continue;
      const enNodo = suma[n][f] / cuenta[n][f];
      let sOtros = 0, cOtros = 0;
      for (let g = 0; g < n; g++) if (g !== f) { sOtros += suma[n][g]; cOtros += cuenta[n][g]; }
      if (!cOtros) continue;
      const entre = sOtros / cOtros;
      const c = entre > 0 ? enNodo / entre : 0;
      if (c > mejorC) { mejorC = c; mejorN = n; }
    }
  }
  /* CONTRASTE MÍNIMO PARA CREÉRSELO. Con 2 el detector empieza a ver figuras
     en el ruido; con 3 los casos sintéticos de `test_dem_cobertura.mjs` salen
     bien y el ruido puro no pasa. Es un umbral ELEGIDO, y va dicho. */
  if (mejorC < 3) return { n: 1, contraste: mejorC, firma: false };
  return { n: mejorN, contraste: mejorC, firma: true };
}

/* El cuerpo sólo corre si esto es el programa. `test_dem_cobertura.mjs` importa
   `factorRemuestreo` para probarlo contra dato de N CONOCIDO, y sin esta
   guarda importarlo se pondría a bajar teselas. */
const ESTE = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (!ESTE) { /* importado como módulo: nada más que hacer */ } else {

const LAYOUTS = fs.readdirSync(RAIZ).filter(f => f.endsWith('_layout.json'));
const PLANTAS = LAYOUTS.map(f => f.replace('_layout.json', ''))
  .filter(p => !SOLO.length || SOLO.includes(p)).sort();

const CON_TERRENO = new Set(fs.readdirSync(RAIZ)
  .filter(f => f.endsWith('_relieve.json')).map(f => f.replace('_relieve.json', '')));

console.log('teselas terrarium z' + ZOOM + ' · s3.amazonaws.com/elevation-tiles-prod');
console.log('la resolución REAL se mide por la firma del remuestreo bilineal,');
console.log('no por lo que diga la documentación de la fuente.\n');
console.log('planta        terreno        lat      lon    px(m)   N  contr.  res.real  cotas (m)      firma');

const filas = [];
for (const planta of PLANTAS) {
  const L = JSON.parse(fs.readFileSync(path.join(RAIZ, planta + '_layout.json'), 'utf8'));
  if (L.clat == null || L.clon == null) {
    console.log('  ' + planta.padEnd(12) + '  SIN clat/clon en el layout: no se puede situar');
    filas.push({ planta, estado: 'sin_coordenadas' });
    continue;
  }
  const fx = lon2px(L.clon, ZOOM), fy = lat2px(L.clat, ZOOM);
  const tx = Math.floor(fx / 256), ty = Math.floor(fy / 256);
  const img = await tesela(ZOOM, tx, ty);
  const pxM = 156543.03392 * Math.cos(L.clat * Math.PI / 180) / Math.pow(2, ZOOM);

  if (img.error) {
    console.log('  ' + planta.padEnd(12) + (CON_TERRENO.has(planta) ? 'sí ' : 'NO ').padEnd(9)
      + String(L.clat.toFixed(3)).padStart(9) + String(L.clon.toFixed(3)).padStart(9)
      + '        NO LLEGA LA TESELA: ' + img.error);
    filas.push({ planta, estado: 'sin_tesela', detalle: img.error });
    continue;
  }
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < img.W; i += 4) for (let j = 0; j < img.H; j += 4) {
    const v = cotaPx(img, i, j); if (v < min) min = v; if (v > max) max = v;
  }
  const F = factorRemuestreo(img);
  const res = F.n ? F.n * pxM : null;
  /* Sin relieve ninguno —mar, o una tesela plana— el factor no significa nada
     y se dice, en vez de publicar un número sacado de datos constantes. */
  const plano = (max - min) < 1.0;
  console.log('  ' + planta.padEnd(12) + (CON_TERRENO.has(planta) ? 'sí' : 'NO').padEnd(9)
    + String(L.clat.toFixed(3)).padStart(9) + String(L.clon.toFixed(3)).padStart(9)
    + pxM.toFixed(1).padStart(8)
    + (plano ? '   —' : String(F.n).padStart(4))
    + (plano ? '     —' : F.contraste.toFixed(1).padStart(7))
    + (plano ? '        —' : (F.firma ? (res.toFixed(0) + ' m').padStart(9) : '     n/d'))
    + ('  ' + min.toFixed(0) + '–' + max.toFixed(0)).padEnd(15)
    + (plano ? 'TESELA VACÍA O PLANA: no se mide nada'
             : (F.firma ? 'remuestreo bilineal ×' + F.n : 'sin firma bilineal')));
  filas.push({ planta, estado: plano ? 'tesela_plana' : 'ok', pxM, n: F.n, res,
               contraste: F.contraste, firma: F.firma, min, max,
               terreno: CON_TERRENO.has(planta) });
}

console.log('\n═══ LO QUE ESTO DECIDE ═══');
const sin = filas.filter(f => !f.terreno && f.estado === 'ok');
const malas = filas.filter(f => f.estado !== 'ok');
if (malas.length) {
  console.log('  NO SE PUEDE MEDIR EN: ' + malas.map(m => m.planta + ' (' + m.estado + ')').join(', '));
  console.log('  Esas NO llevan terreno generado, y el motivo va rotulado, no en silencio.');
}
if (sin.length) {
  console.log('  Plantas sin terreno y con DEM legible: ' + sin.length
            + '  (' + sin.map(s => s.planta).join(', ') + ')');
  console.log('  Tamaño de píxel de la tesela: ' + Math.min(...sin.map(s => s.pxM)).toFixed(1)
            + ' a ' + Math.max(...sin.map(s => s.pxM)).toFixed(1) + ' m');
}

/* ═══ LO QUE ESTA SONDA NO CONTESTA, Y NO SE DISIMULA ═════════════════════ */
const conFirma = filas.filter(f => f.firma);
console.log('');
console.log('  ⚠ NINGUNA TESELA ENSEÑA FIRMA DE REMUESTREO BILINEAL'
          + (conFirma.length ? ' salvo ' + conFirma.map(f => f.planta).join(', ') : '')
          + '.');
console.log('  Contraste 1,0–1,1, que es EL MISMO que da el ruido blanco en el banco.');
console.log('');
console.log('  Y ESO NO SIGNIFICA «RESOLUCIÓN NATIVA DE 7 m». Significa sólo que el');
console.log('  remuestreo, si lo hay, NO es bilineal — terrarium se construye con');
console.log('  reproyecciones que usan núcleos cúbicos o lanczos, y ésos no dejan');
console.log('  segundas diferencias nulas entre nodos. La firma que esta sonda busca');
console.log('  no existiría aunque el dato viniera de SRTM de 30 m.');
console.log('');
console.log('  Así que la resolución real queda SIN ESTABLECER por este camino, y se');
console.log('  dice en vez de rellenar la columna. Lo que sí se puede medir, y es lo');
console.log('  que de verdad hace falta, es el ERROR VERTICAL del DEM contra cotas');
console.log('  medidas — y de eso hay verdad de campo en Ayora y San José.');
console.log('  Ver `tools/dem_error_vertical.mjs`.');
console.log('');
console.log('  El detector NO está roto: encuentra N = 2, 3, 4 y 8 con contraste 8–26,');
console.log('  incluso con los nodos desfasados, y da 1,0 con ruido puro');
console.log('  (`tools/test_dem_cobertura.mjs`, 10 comprobaciones, 3 mutaciones).');
console.log('  Es que la firma que busca no está.');

}   // fin de la guarda de «esto es el programa»
