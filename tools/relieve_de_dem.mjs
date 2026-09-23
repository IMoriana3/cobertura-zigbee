/* relieve_de_dem.mjs — terreno para las plantas que NO tienen levantamiento.
 *
 * ═══ QUÉ ES ESTO Y QUÉ NO ES ═══
 *
 * `relieve_de_levantamiento.mjs` hace el producto BUENO: empalma el
 * levantamiento as-built con el DEM y valida contra cotas medidas (p50 0,030 m
 * en Ayora, 0,074 en San José). Eso necesita levantamiento, y sólo dos plantas
 * lo tienen.
 *
 * Esto hace el producto POBRE, para las otras: sólo DEM. Y la diferencia no es
 * de matiz —está medida en `dem_error_vertical.mjs`—:
 *
 *     empalmado con levantamiento   |err| p50  0,030 – 0,074 m
 *     sólo DEM                      |err| p50  0,83  – 1,29  m     ×17 a ×28
 *
 * Por eso el fichero sale ROTULADO, y el rótulo es obligatorio: quien lo lea
 * tiene que poder distinguir un producto del otro sin preguntar.
 *
 *   node tools/relieve_de_dem.mjs <planta…> [--write] [--paso 10]
 *
 * ═══ EL PASO ES 10 m, Y NO SE ELIGE A GUSTO ═══
 *
 * La tesela terrarium z14 da 7,1–7,9 m por píxel en estas latitudes. Pedirle al
 * fichero un paso MÁS FINO no añade terreno: añade bytes e invita a creer una
 * precisión que el dato no tiene. 10 m queda por encima del píxel, así que cada
 * nodo de la malla sale de dato y no de interpolar interpolado.
 *
 * (La resolución REAL del dato bajo la tesela no se ha podido establecer —ver
 * `dem_cobertura_cartera.mjs`—, así que 10 m es una cota inferior de prudencia,
 * no la resolución verdadera. Podría ser peor; no puede ser mejor.)
 *
 * ═══ NO SE INVENTA UNA MÉTRICA DE CALIDAD ═══
 *
 * Ninguno de estos layouts trae cotas de seguidor —se comprobó campo a campo:
 * llevan x, n, rot, id, ncu y poco más—, así que NO HAY CONTRA QUÉ VALIDAR.
 * El fichero lo dice y no se le pone un número prestado de otra planta: el
 * error de Ayora y San José va en el bloque `referencia`, rotulado como lo que
 * es, y nunca como el error de esta planta.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ESCRIBE = process.argv.includes('--write');
const PASO = parseFloat(arg('paso', '10'));
const ZOOM = parseInt(arg('zoom', '14'), 10);
const MARGEN = parseFloat(arg('margen', '250'));   // para que los vanos a NCU quepan
const VERSION = 'relieve_de_dem.mjs v1';

/* MEDIR CUÁNTO SE PIERDE SIN LEVANTAMIENTO. `--forzar-dem-solo` genera el DEM
   solo de una planta que SÍ lo tiene, que es la única forma de compararlos.
   `--comoel <fichero>` copia la GEOMETRÍA DE MALLA de un relieve existente
   —x0, n0, paso, nx, nn— para que la comparación salga nodo a nodo y no de
   interpolar una malla contra otra, que mezclaría el error del DEM con el del
   remuestreo. `--sufijo` evita pisar el fichero bueno, y es OBLIGATORIO con
   `--forzar-dem-solo`. */
const FORZAR = process.argv.includes('--forzar-dem-solo');
const COMOEL = arg('comoel', null);
const SUFIJO = arg('sufijo', '');
if (FORZAR && !SUFIJO) {
  console.error('--forzar-dem-solo EXIGE --sufijo: sin el pisarias el terreno bueno de esa planta.');
  process.exit(2);
}
const PLANTAS = process.argv.slice(2).filter(a => !a.startsWith('--') &&
  !['--paso', '--zoom', '--margen', '--comoel', '--sufijo'].includes(process.argv[process.argv.indexOf(a) - 1]));
if (!PLANTAS.length) {
  console.error('uso: node tools/relieve_de_dem.mjs <planta…> [--write]');
  process.exit(2);
}

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

/* EL VALOR VACÍO DE TERRARIUM. Un PNG negro da e = −32768 exacto: no es una
   cota, es «no hay dato». Catania entera vino así. Se detecta y se propaga como
   null en vez de escribir una llanura a 32 km bajo el mar. */
const VACIO = -32768;
async function cotaDem(z, lat, lon) {
  const fx = lon2px(lon, z), fy = lat2px(lat, z);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const v = async (px, py) => {
    const img = await tesela(z, Math.floor(px / 256), Math.floor(py / 256));
    const ix = ((py % 256) * img.W + (px % 256)) * img.ca;
    return img.px[ix] * 256 + img.px[ix + 1] + img.px[ix + 2] / 256 - 32768;
  };
  const a = await v(x0, y0), b = await v(x0 + 1, y0), c = await v(x0, y0 + 1), d = await v(x0 + 1, y0 + 1);
  if (a === VACIO || b === VACIO || c === VACIO || d === VACIO) return null;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/* EL ORIGEN UTM. Unas plantas lo llevan en cE/cN y otras dentro de
   `georef.origen_utm`. Se leen los dos sitios y, si no está en ninguno, se
   ABORTA: sin origen el terreno no se puede alinear con el preset y se
   colocaría donde no está. */
function origenUTM(L, planta) {
  if (L.cE != null && L.cN != null) return { cE: L.cE, cN: L.cN, de: 'cE/cN' };
  if (L.georef && Array.isArray(L.georef.origen_utm) && L.georef.origen_utm.length === 2)
    return { cE: L.georef.origen_utm[0], cN: L.georef.origen_utm[1], de: 'georef.origen_utm' };
  return null;
}

/* La referencia de error. Va rotulada como lo que es: NO es de esta planta. */
const REFERENCIA = {
  nota: 'NO es el error de esta planta. Es el del MISMO producto (solo DEM) medido '
      + 'donde si habia levantamiento as-built con que compararlo.',
  medido_en: ['ayora', 'sanjose'],
  err_p50_m: [0.83, 1.29],
  err_p95_m: [2.37, 3.77],
  util: 'tools/dem_error_vertical.mjs'
};

/* EL ± EN dB, QUE ES LO QUE DE VERDAD IMPORTA AL QUE MIRA EL MAPA.
   Los metros de error no dicen nada por si solos: lo que decide es cuanto
   mueven el relieveDb. Medido comparando el terreno EMPALMADO contra el mismo
   sitio con SOLO DEM, sobre 400 vanos por banda
   (`Siting/tools/relieve_valor_incertidumbre.mjs`).
   Va aqui, en el fichero, para que la pantalla lo pueda poner al lado del
   valor sin tener que saberselo. Y rotulado: NO es de esta planta. */
const Z_DB = {
  nota: 'Cuanto cambia relieveDb si en vez de terreno empalmado se usa solo DEM. '
      + 'p90 de |empalmado - solo DEM|. MEDIDO en ayora y sanjose, NO en esta planta.',
  util: 'Siting/tools/relieve_valor_incertidumbre.mjs',
  medido_en: ['ayora', 'sanjose'],
  p90_db: {
    '10-20': [0.00, 0.00], '20-50': [0.00, 6.57], '50-100': [0.00, 8.07],
    '100-200': [3.74, 12.94], '200-400': [5.00, 13.14],
    '400-800': [4.37, 12.94], '800-1600': [4.59, 12.87]
  },
  aviso: 'A menos de 100 m el relieve verdadero es CERO EXACTO y el DEM solo llega '
       + 'a inventarse hasta 8,1 dB. Ahi no es que sea impreciso: cobra relieve que no hay.'
};

/* EL VANO POR DEBAJO DEL CUAL ESTE TERRENO NO TIENE RESOLUCION.
   Medido con bandas finas, empalmado contra solo DEM, 400 vanos por banda:

     vano        relieve VERDADERO p95      el que da el DEM solo p95
     30-50 m          0,00 dB                       9,89 dB
     50-75 m          2,54                         11,10
     75-100 m         1,21                         13,14
     100-150 m        3,89 (ayora) / 2,96 (sj)      5,13 / 13,66

   Por debajo de 100 m el relieve de verdad es cero en mediana en las DOS
   plantas y su p95 no pasa de 2,54 dB, mientras el DEM solo llega a 13,14. Lo
   que se pinta ahi es un termino que no existe.

   100 m ES UNA ELECCION, informada por la medida y con su coste dicho: por
   debajo se pierde hasta ~2,5 dB de relieve REAL en la cola p95 de San Jose. A
   cambio se quitan hasta 13 dB de invento. No es gratis y no se presenta como
   si lo fuera. */
const VANO_MIN_UTIL_M = 100;

const hoy = new Date().toISOString().slice(0, 10);
console.log('terreno SOLO DEM · teselas z' + ZOOM + ' · paso ' + PASO + ' m · margen ' + MARGEN + ' m');
console.log(ESCRIBE ? 'se ESCRIBE en disco\n' : 'ensayo: NO se escribe (usa --write)\n');

for (const planta of PLANTAS) {
  const fl = path.join(RAIZ, planta + '_layout.json');
  if (!fs.existsSync(fl)) { console.error(planta + ': no hay ' + planta + '_layout.json'); process.exit(1); }
  const L = JSON.parse(fs.readFileSync(fl, 'utf8'));
  const org = origenUTM(L, planta);
  if (!org) { console.error(planta + ': el layout no trae cE/cN ni georef.origen_utm. ABORTA: '
    + 'sin origen el terreno se situaria donde no esta.'); process.exit(1); }
  if (L.clat == null || L.clon == null) {
    console.error(planta + ': el layout no trae clat/clon. ABORTA.'); process.exit(1);
  }

  /* ¿ESTA PLANTA TIENE LEVANTAMIENTO? Si lo tiene, este útil NO es el suyo: el
     bueno es `relieve_de_levantamiento.mjs`, y generar aquí el pobre encima del
     bueno seria degradarla sin que nadie se entere.
     `--forzar-dem-solo` lo salta A PROPOSITO y sólo para MEDIR: generar el DEM
     solo de una planta que SI tiene levantamiento es la unica forma de saber
     cuanto se pierde por no tenerlo. Va con `--sufijo` para que no pise el
     fichero bueno, y el guardia de abajo lo exige. */
  if (fs.existsSync(path.join(RAIZ, planta + '_cotas.json')) && !FORZAR) {
    console.log('═══ ' + planta.toUpperCase() + ' ═══  TIENE LEVANTAMIENTO (' + planta
      + '_cotas.json). Este util NO es el suyo: usa relieve_de_levantamiento.mjs.');
    console.log('  Se salta, para no degradar un terreno bueno con uno pobre.\n');
    continue;
  }

  /* LA HUELLA: seguidores, y tambien NCU y HSU si el layout las trae, porque el
     vano va de la TCU a SU NCU y el perfil tiene que cubrir los dos extremos. */
  const pts = [];
  for (const t of (L.trackers || [])) if (t && t.x != null && t.n != null) pts.push([t.x, t.n]);
  for (const k of ['ncus', 'ncu_hsu', 'hsus', 'gates']) {
    const v = L[k];
    if (Array.isArray(v)) for (const e of v) {
      if (e && e.x != null && e.n != null) pts.push([e.x, e.n]);
      else if (Array.isArray(e) && e.length >= 2 && typeof e[0] === 'number') pts.push([e[0], e[1]]);
    }
  }
  if (pts.length < 2) { console.error(planta + ': menos de 2 puntos con x/n en el layout. ABORTA.'); process.exit(1); }
  let xmin = Infinity, xmax = -Infinity, nmin = Infinity, nmax = -Infinity;
  for (const [x, n] of pts) { if (x < xmin) xmin = x; if (x > xmax) xmax = x;
                              if (n < nmin) nmin = n; if (n > nmax) nmax = n; }
  let x0 = Math.floor((xmin - MARGEN) / PASO) * PASO, n0 = Math.floor((nmin - MARGEN) / PASO) * PASO;
  let nx = Math.ceil((xmax + MARGEN - x0) / PASO) + 1, nn = Math.ceil((nmax + MARGEN - n0) / PASO) + 1;
  let paso = PASO;
  if (COMOEL) {
    const R = JSON.parse(fs.readFileSync(path.join(RAIZ, COMOEL), 'utf8'));
    /* Y SE EXIGE EL MISMO ORIGEN UTM. Copiar la rejilla de un fichero cuyo
       cE/cN sea otro daría dos mallas que parecen iguales y están desplazadas:
       la comparación mediría el desfase, no el error del DEM. */
    if (Math.abs(R.cE - org.cE) > 1e-6 || Math.abs(R.cN - org.cN) > 1e-6) {
      console.error(planta + ': --comoel ' + COMOEL + ' tiene otro origen UTM ('
        + R.cE + ',' + R.cN + ' frente a ' + org.cE + ',' + org.cN + '). ABORTA.');
      process.exit(1);
    }
    x0 = R.x0; n0 = R.n0; paso = R.paso; nx = R.nx; nn = R.nn;
    console.log('  malla copiada de ' + COMOEL + ': ' + nx + '×' + nn + ' a ' + paso + ' m');
  }
  const PASO_USO = paso;

  const mPerLat = 111320, mPerLon = 111320 * Math.cos(L.clat * Math.PI / 180);
  const z = new Array(nx * nn).fill(null);
  let nulos = 0, zmin = Infinity, zmax = -Infinity;
  for (let j = 0; j < nn; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * PASO_USO, n = n0 + j * PASO_USO;
      const c = await cotaDem(ZOOM, L.clat + n / mPerLat, L.clon + x / mPerLon);
      if (c === null) { nulos++; continue; }
      const v = Math.round(c * 100) / 100;
      z[j * nx + i] = v;
      if (v < zmin) zmin = v; if (v > zmax) zmax = v;
    }
  }

  console.log('═══ ' + planta.toUpperCase() + ' ═══  ' + pts.length + ' puntos de huella · origen '
            + org.de);
  console.log('  malla ' + nx + ' × ' + nn + ' a ' + PASO_USO + ' m  ·  ' + (nx * nn).toLocaleString('es')
            + ' nodos  ·  teselas ' + cacheTeselas.size);
  if (nulos) {
    console.log('  ⚠ ' + nulos + ' nodos SIN DATO (' + (100 * nulos / (nx * nn)).toFixed(1)
              + ' %): la tesela viene vacia ahi. Van a null, NO a una cota inventada.');
  }
  if (!(zmax > zmin)) {
    console.log('  ⚠ SIN RELIEVE: la malla entera sale a la misma cota. NO se escribe: un');
    console.log('    fichero llano no es terreno, y taparia el rotulo de «sin perfil».\n');
    continue;
  }
  console.log('  cotas ' + zmin.toFixed(1) + ' – ' + zmax.toFixed(1) + ' m  (desnivel '
            + (zmax - zmin).toFixed(1) + ' m)');

  const pxM = 156543.03392 * Math.cos(L.clat * Math.PI / 180) / Math.pow(2, ZOOM);
  const obj = {
    planta: planta, crs: L.crs || null, cE: org.cE, cN: org.cN,
    x0: x0, n0: n0, paso: PASO_USO, nx: nx, nn: nn,
    productor: VERSION, tipo: 'dem', generado: hoy,
    /* eje_m/eje_medido NO APLICAN aqui: el empalme los necesita porque resta la
       altura de viga de la cota medida sobre modulo. Sin levantamiento no hay
       viga de la que restar, asi que van a null y se dice — poner 1,20 aqui
       seria copiar un numero que no ha intervenido en nada. */
    eje_m: null, eje_medido: false,
    calidad: {
      validado: false,
      motivo: 'sin levantamiento: el layout no trae cotas de seguidor, asi que no hay '
            + 'verdad de campo contra la que validar esta planta',
      px_tesela_m: Math.round(pxM * 10) / 10,
      referencia: REFERENCIA,
      z_db: Z_DB,
      vano_min_util_m: VANO_MIN_UTIL_M
    },
    z: z
  };
  const texto = JSON.stringify(obj);
  const sha = crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
  const man = {
    fichero: planta + SUFIJO + '_relieve.json', sha256: sha, bytes: Buffer.byteLength(texto),
    productor: VERSION, tipo: 'dem', generado: hoy,
    planta: planta, crs: obj.crs, cE: org.cE, cN: org.cN, paso: PASO_USO, nx: nx, nn: nn,
    eje_m: null, eje_medido: false, calidad: obj.calidad
  };
  console.log('  ' + (texto.length / 1048576).toFixed(2) + ' MB  ·  sha256 ' + sha.slice(0, 16) + '…');
  console.log('  ROTULO: solo DEM ~' + obj.calidad.px_tesela_m + ' m/pixel, SIN VALIDAR');
  if (ESCRIBE) {
    const base = planta + SUFIJO;
    fs.writeFileSync(path.join(RAIZ, base + '_relieve.json'), texto);
    fs.writeFileSync(path.join(RAIZ, base + '_relieve.sha256.json'), JSON.stringify(man, null, 2) + '\n');
    console.log('  escritos ' + base + '_relieve.json y su manifiesto');
  }
  console.log('');
}

console.log('RECUERDA: esto NO valida nada. Ninguna de estas plantas tiene cotas medidas,');
console.log('y el error que va en `calidad.referencia` es de Ayora y San Jose, rotulado como');
console.log('tal. Un numero prestado presentado como propio seria peor que no tener ninguno.');
