/* relieve_de_levantamiento.mjs — escribe `<planta>_relieve.json` de las plantas
 * con levantamiento, empalmando DEM y levantamiento como ya lo hace el 3D.
 *
 *   node tools/relieve_de_levantamiento.mjs ayora sanjose [--write]
 *                                           [--paso 6] [--zoom 14] [--radio 120]
 *
 * Sin `--write` no toca disco: mide, valida y lo cuenta. Es lo que hay que
 * correr primero.
 *
 * ═══ POR QUÉ ESTE FICHERO, Y NO OTRO FORMATO ═══
 *
 * `<planta>_relieve.json` ya existe —lo escribe `kml_curvas_a_cotas.mjs` para
 * Dicayagua— y ya lo consume `terreno.html` (`relAt`). Ahora lo consume también
 * el motor de radio de Siting (`terreno_planta.js`), que NO puede bajarse el
 * DEM: un fichero por planta, dos consumidores. Inventar un segundo formato
 * sería la avería que estos repos ya persiguen en otros sitios.
 *
 * ═══ EL EMPALME ES EL DEL 3D, NO UNO NUEVO ═══
 *
 * `terreno.html` reconstruye el suelo de Ayora y San José así, y aquí se
 * replica paso a paso para que el fichero valga lo mismo que lo que la página
 * calcula en vivo:
 *
 *   1. cota de suelo de cada punto medido = base + y − HEJE, con
 *      HEJE = eje + off. `y` es «cota MEDIDA sobre el modulo» (lo dice el
 *      propio `<planta>_cotas.json`), así que hay que restar la cara del
 *      módulo para llegar al suelo.
 *   2. COTAOFF = mediana(suelo medido − DEM). Entre un DEM global y un
 *      levantamiento hay siempre un escalón sistemático; sin medirlo y
 *      quitarlo, el borde de la zona levantada sale como un cantil.
 *   3. residuo = IDW de (suelo medido − COTAOFF − DEM) sobre los puntos
 *      medidos, con confianza 1 hasta radio/2 y 0 en radio (smoothstep). Se
 *      interpola el RESIDUO y no la cota absoluta: el residuo es un campo
 *      suave, y así se conserva la textura fina del DEM entre filas.
 *   4. z = DEM + residuo. Dentro de la zona levantada eso ES el levantamiento;
 *      fuera se va suavemente al DEM.
 *
 * ═══ LA SUPOSICIÓN QUE HAY QUE DECLARAR ═══
 *
 * El levantamiento mide **dos puntos por fila** —sus dos puntas, 74,6 m de
 * mediana— y nada en medio. Con la nube cruda, la malla de Ayora sale al 7,5 %
 * de nodos con dato y 695 de sus 751 TCU se quedan sin cota; medido. Así que el
 * suelo bajo una fila se toma **lineal entre sus dos puntas**, que es lo mismo
 * que ya supone `buildCava` del 3D (`beam = mc.gnd + (…)·fr`) y lo que
 * justifica la estructura: un tubo rígido sobre hincas. **Es una suposición
 * declarada, y va escrita en el `nota` del fichero que se escribe.**
 *
 * ═══ Y LA ALTURA DE POSTE ES DECLARADA, PERO NO CONTAMINA EL RADIO ═══
 *
 * HEJE lleva el eje del tubo, que hoy es el estándar Factiun **1,20 m
 * DECLARADO** (el plano no está). Mover el eje mueve TODO el terreno la misma
 * cantidad, metro por metro, así que para el 3D importa. Para el relieve de
 * radio **no**: medido en `Siting/tools/relieve_plantas.mjs`, mover el eje de
 * 0,70 a 2,00 m mueve el relieve **5,1e-12 dB** en Ayora y 9,1e-12 en San José,
 * porque perfil y antenas se desplazan juntos y la tierra lisa de P.1812 es
 * invariante a una traslación. Por eso se puede producir ya, con el 1,20
 * rotulado en el fichero, sin esperar al plano.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PLANTAS = process.argv.slice(2).filter(a => !a.startsWith('--') &&
  !['--paso', '--zoom', '--radio'].includes(process.argv[process.argv.indexOf(a) - 1]));
const ESCRIBE = process.argv.includes('--write');
const PASO = parseFloat(arg('paso', '6'));
const ZOOM = parseInt(arg('zoom', '14'), 10);
const RADIO = parseFloat(arg('radio', '120'));   // el mismo `cb` que usa buildResiduo
const DENS = 4;                                   // un punto cada ~4 m sobre la viga
const OFF = 0.14;                                 // cara del módulo sobre el eje (seguidor.js)
const EJE = parseFloat(arg('eje', '1.20'));       // estándar Factiun DECLARADO

if (!PLANTAS.length) { console.error('uso: node tools/relieve_de_levantamiento.mjs <planta…> [--write]'); process.exit(2); }

/* ── PNG Terrarium: e = R·256 + G + B/256 − 32768 ───────────────────────────
   Se decodifica aquí y no con una dependencia porque el repo no tiene ninguna
   para leer PNG, y `dem_sintetico.mjs` ya escribe este mismo formato a mano. */
function pngRGB(buf) {
  let p = 8, W = 0, H = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tipo = buf.toString('ascii', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (tipo === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (tipo === 'IDAT') idat.push(d);
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
  const url = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + k + '.png';
  const r = await fetch(url);
  if (!r.ok) throw new Error('tesela ' + k + ': HTTP ' + r.status);
  const img = pngRGB(Buffer.from(await r.arrayBuffer()));
  cacheTeselas.set(k, img);
  return img;
}
const lon2px = (lon, z) => (lon + 180) / 360 * Math.pow(2, z) * 256;
const lat2px = (lat, z) => { const la = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * Math.pow(2, z) * 256; };

/* Mosaico perezoso: se piden solo las teselas que se tocan. */
function hazDem(z) {
  return {
    async cota(lat, lon) {
      const fx = lon2px(lon, z), fy = lat2px(lat, z);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const v = async (px, py) => {
        const img = await tesela(z, Math.floor(px / 256), Math.floor(py / 256));
        const ix = ((py % 256) * img.W + (px % 256)) * img.ca;
        return img.px[ix] * 256 + img.px[ix + 1] + img.px[ix + 2] / 256 - 32768;
      };
      const a = await v(x0, y0), b = await v(x0 + 1, y0), c = await v(x0, y0 + 1), d = await v(x0 + 1, y0 + 1);
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  };
}

const mediana = a => { const s = [...a].sort((u, v) => u - v); return s[s.length >> 1]; };
const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

for (const planta of PLANTAS) {
  const fc = path.join(RAIZ, planta + '_cotas.json'), fl = path.join(RAIZ, planta + '_layout.json');
  if (!fs.existsSync(fc) || !fs.existsSync(fl)) { console.error(planta + ': falta ' + planta + '_cotas.json o _layout.json'); process.exit(1); }
  const C = JSON.parse(fs.readFileSync(fc, 'utf8')), L = JSON.parse(fs.readFileSync(fl, 'utf8'));
  const mPerLat = 111320, mPerLon = 111320 * Math.cos(L.clat * Math.PI / 180);
  const dem = hazDem(ZOOM);
  const cotaDem = (x, n) => dem.cota(L.clat + n / mPerLat, L.clon + x / mPerLon);

  console.log('\n═══ ' + planta.toUpperCase() + ' ═══');
  console.log('  levantamiento: ' + C.n_trk + ' seguidores · base ' + C.base + ' m · eje '
            + EJE.toFixed(2) + ' m DECLARADO + off ' + OFF);

  /* 1 · la nube de suelo, densificada sobre la viga */
  const H = EJE + OFF, P = [];
  for (const t of C.t) { if (!t) continue;
    for (const f of t.f) {
      const Lg = Math.abs(f.n[1] - f.n[0]), k = Math.max(1, Math.round(Lg / DENS));
      for (let i = 0; i <= k; i++) { const u = i / k;
        P.push([f.x, f.n[0] + (f.n[1] - f.n[0]) * u, C.base + (f.y[0] + (f.y[1] - f.y[0]) * u) - H]); }
    } }
  console.log('  nube de suelo: ' + P.length.toLocaleString('es') + ' puntos (2 medidos por fila, densificados cada ' + DENS + ' m)');

  /* 2 · COTAOFF: el escalón sistemático entre levantamiento y DEM.
        Se mide sobre una muestra: pedir el DEM de los 26.000 puntos sería
        pedir las mismas teselas 26.000 veces para nada. */
  const muestra = P.filter((_, i) => i % 37 === 0);
  const dif = [];
  for (const p of muestra) dif.push(p[2] - await cotaDem(p[0], p[1]));
  const COTAOFF = mediana(dif);
  console.log('  escalón levantamiento − DEM: mediana ' + COTAOFF.toFixed(2) + ' m'
            + '  (p05 ' + pct(dif, 0.05).toFixed(2) + ' · p95 ' + pct(dif, 0.95).toFixed(2) + ', n=' + dif.length + ')');
  console.log('  teselas z' + ZOOM + ' usadas: ' + cacheTeselas.size);

  /* 3 · malla y residuo */
  const xs = P.map(p => p[0]), ns = P.map(p => p[1]), pad = RADIO + PASO;
  const x0 = Math.floor((Math.min(...xs) - pad) / PASO) * PASO, x1 = Math.ceil((Math.max(...xs) + pad) / PASO) * PASO;
  const n0 = Math.floor((Math.min(...ns) - pad) / PASO) * PASO, n1 = Math.ceil((Math.max(...ns) + pad) / PASO) * PASO;
  const nx = Math.round((x1 - x0) / PASO) + 1, nn = Math.round((n1 - n0) / PASO) + 1;
  console.log('  malla: ' + nx + ' x ' + nn + ' nodos a ' + PASO + ' m  ('
            + ((x1 - x0) / 1000).toFixed(2) + ' x ' + ((n1 - n0) / 1000).toFixed(2) + ' km)');

  /* ── EL RESIDUO VA EN DOS TÉRMINOS, Y ESTO SE MIDIÓ ANTES DE ELEGIRLO ──────
     Con UN solo IDW no caben las dos cosas que hacen falta. Medido sobre las
     3.004 cotas medidas de Ayora, |error| p50 del fichero contra ellas:

         radio 120 soft 25   0,214 m      <- el del 3D. Empalma suave, borra el detalle
         radio  40 soft 25   0,115
         radio  20 soft  1   0,056
         radio  12 soft  1   0,043        <- fiel, pero corta el empalme a 12 m

     Y ensanchar el radio con peso 1/d² tampoco lo arregla: con 26.318 puntos,
     los lejanos son tantos que en conjunto dominan a los cercanos (radio 120
     soft 1 da 0,146). Fidelidad y empalme suave NO caben en un IDW.

     Así que dos:
       ANCHO   radio 120, soft 25, confianza sobre 120 m. Coge la tendencia y
               es el que muere suavemente contra el DEM, sin cantil.
       FINO    radio 12, soft 1, confianza sobre 25 m, sobre lo que al ancho le
               FALTA en cada punto medido. Pincha el levantamiento donde está.

     Resultado: p50 0,033 m manteniendo los 120 m de empalme. Mejor que el fino
     solo Y sin su cantil. */
  const ss = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  const cubos = radio => { const B = new Map();
    P.forEach((p, i) => { const k = Math.floor(p[0] / radio) + '|' + Math.floor(p[1] / radio);
      if (!B.has(k)) B.set(k, []); B.get(k).push(i); });
    return B; };
  const idw = (B, radio, soft, v, X, N, mezcla) => {
    let sw = 0, sv = 0, dmin = Infinity;
    const bx = Math.floor(X / radio), bn = Math.floor(N / radio);
    for (let dx = -1; dx <= 1; dx++) for (let dn = -1; dn <= 1; dn++) {
      const l = B.get((bx + dx) + '|' + (bn + dn)); if (!l) continue;
      for (const ix of l) { const p = P[ix];
        const d2 = (p[0] - X) ** 2 + (p[1] - N) ** 2;
        if (d2 < dmin) dmin = d2;
        if (d2 > radio * radio) continue;
        const w = 1 / (d2 + soft); sw += w; sv += w * v[ix]; } }
    if (!(sw > 0)) return 0;
    return (sv / sw) * ss((mezcla - Math.sqrt(dmin)) / (mezcla * 0.5));
  };
  const R_FINO = 12, M_FINO = 25;

  /* El término ancho necesita el DEM en cada punto MEDIDO para saber qué
     residuo tapa; se saca una vez y se reutiliza. */
  process.stdout.write('  DEM en los puntos medidos… ');
  const demEn = [];
  for (const p of P) demEn.push(await cotaDem(p[0], p[1]));
  const vAncho = P.map((p, i) => p[2] - COTAOFF - demEn[i]);
  const Ba = cubos(RADIO);
  const anchoEn = P.map((p, i) => idw(Ba, RADIO, 25, vAncho, p[0], p[1], RADIO));
  const vFino = P.map((p, i) => vAncho[i] - anchoEn[i]);
  const Bf = cubos(R_FINO);
  console.log('hecho (' + cacheTeselas.size + ' teselas)');

  const z = new Array(nx * nn).fill(null);
  let hechos = 0;
  for (let j = 0; j < nn; j++) {
    const N = n0 + j * PASO;
    for (let i = 0; i < nx; i++) {
      const X = x0 + i * PASO;
      const D = await cotaDem(X, N);
      const res = idw(Ba, RADIO, 25, vAncho, X, N, RADIO) + idw(Bf, R_FINO, 1, vFino, X, N, M_FINO);
      z[j * nx + i] = +(D + res).toFixed(2);
      hechos++;
    }
    if (j % 40 === 0) process.stdout.write('\r  construyendo… ' + Math.round(100 * j / nn) + ' %   ');
  }
  process.stdout.write('\r  construida: ' + hechos.toLocaleString('es') + ' nodos, 0 huecos          \n');

  /* 4 · VALIDACIÓN, y sin esto no se escribe nada. El suelo del fichero bajo
        cada seguidor medido tiene que coincidir con su propia cota medida:
        es lo que el empalme promete y es lo único que lo demuestra. */
  const muestreo = (X, N) => {
    const fi = (X - x0) / PASO, fj = (N - n0) / PASO;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    if (i0 < 0 || j0 < 0 || i0 + 1 >= nx || j0 + 1 >= nn) return null;
    const a = z[j0 * nx + i0], b = z[j0 * nx + i0 + 1], c = z[(j0 + 1) * nx + i0], d = z[(j0 + 1) * nx + i0 + 1];
    if (a == null || b == null || c == null || d == null) return null;
    const tx = fi - i0, tn = fj - j0;
    return (a * (1 - tx) + b * tx) * (1 - tn) + (c * (1 - tx) + d * tx) * tn;
  };
  const err = [];
  for (const t of C.t) { if (!t) continue;
    for (const f of t.f) for (let k = 0; k < 2; k++) {
      const v = muestreo(f.x, f.n[k]);
      if (v === null) { err.push(NaN); continue; }
      err.push(v - (C.base + f.y[k] - H - COTAOFF)); } }
  const finitos = err.filter(v => isFinite(v)).map(Math.abs);
  const fuera = err.length - finitos.length;
  console.log('  VALIDACIÓN contra las ' + err.length.toLocaleString('es') + ' cotas medidas:');
  console.log('    |error|  p50 ' + pct(finitos, 0.5).toFixed(3) + ' m · p95 ' + pct(finitos, 0.95).toFixed(3)
            + ' · máx ' + Math.max(...finitos).toFixed(3) + ' m' + (fuera ? '  · ' + fuera + ' fuera de malla' : ''));
  /* EL TECHO DEL ERROR NO ES DEL MÉTODO, ES DEL PASO DE MALLA CONTRA EL DATO, y
     conviene decirlo con su número al lado en vez de dejar el máximo suelto. */
  const paso2 = [];
  for (const t of C.t) { if (!t) continue;
    paso2.push(Math.abs(t.f[0].y[0] - t.f[1].y[0]), Math.abs(t.f[0].y[1] - t.f[1].y[1])); }
  console.log('    (el máx no es del método: las DOS vigas de un mismo seguidor van a '
            + Math.abs(C.t.find(Boolean).f[0].x - C.t.find(Boolean).f[1].x).toFixed(2)
            + ' m y difieren hasta ' + Math.max(...paso2).toFixed(3) + ' m en cota;');
  console.log('     con paso de malla ' + PASO + ' m caen en celdas contiguas y la bilineal reparte)');

  /* LA VERSION DEL PRODUCTOR VA DENTRO DEL FICHERO, y se sube A MANO cuando
     cambia como se construye la malla -el empalme, el densificado, los radios
     del IDW-. No es la version del repo: lo que le importa a quien consume es
     si la malla se hizo con el MISMO metodo, no si alguien toco un comentario.
     Quien la lea puede decir «este terreno es de la v1» sin mirar el diff. */
  const salida = {
    planta, crs: L.crs, cE: L.cE, cN: L.cN, x0, n0, paso: PASO, nx, nn,
    productor: 'relieve_de_levantamiento.mjs v1',
    tipo: 'empalme',            // empalme | levantamiento | dem | curvas
    generado: new Date().toISOString().slice(0, 10),
    eje_m: EJE, eje_medido: false,
    /* LA CALIDAD, DECLARADA EN EL FICHERO. El consumidor la pinta en pantalla,
       y sin este bloque el rotulo de un terreno VALIDADO diria «calidad no
       declarada» — o sea, se presentaria igual que uno de solo DEM, que es
       justo lo que el rotulo viene a impedir. Los numeros son los de la
       validacion de arriba, no unos escritos a mano. */
    calidad: {
      validado: true,
      metodo: 'contra las cotas as-built medidas, punto a punto',
      n_cotas: err.length,
      p50_m: +pct(finitos, 0.5).toFixed(3),
      p95_m: +pct(finitos, 0.95).toFixed(3),
      max_m: +Math.max(...finitos).toFixed(3),
      fuera_de_malla: fuera
    },
    fuente: planta + '_cotas.json (levantamiento) + DEM Terrarium z' + ZOOM,
    nota: 'suelo = DEM + residuo IDW del levantamiento, el mismo empalme que hace terreno.html. '
        + 'Cota de suelo = base + y - (eje ' + EJE.toFixed(2) + ' DECLARADO + off ' + OFF + '); '
        + 'el levantamiento mide la CARA DEL MODULO, no el suelo. '
        + 'SUPOSICION DECLARADA: el suelo bajo cada fila es lineal entre sus dos puntas medidas '
        + '(74,6 m de mediana entre ellas); con la nube cruda solo el 7,5 % de los nodos tendria dato. '
        + 'El eje es el estandar Factiun 1,20 m DECLARADO, no medido: mueve el terreno metro por metro '
        + 'y por tanto el 3D, pero NO el relieve de radio (medido: 5e-12 dB moviendolo de 0,70 a 2,00). '
        + 'Escalon levantamiento-DEM medido y quitado: ' + COTAOFF.toFixed(2) + ' m. '
        + 'Generado por tools/relieve_de_levantamiento.mjs',
    z
  };
  /* EL SHA SE CALCULA SOBRE EL TEXTO QUE SE ESCRIBE, no sobre el objeto: es el
     que va a comprobar quien lo consuma, y tiene que ser byte a byte lo mismo.
     Se imprime siempre, se escriba o no, para poder carearlo sin tocar disco. */
  const texto = JSON.stringify(salida);
  const sha = crypto.createHash('sha256').update(texto, 'utf8').digest('hex');
  console.log('  productor  ' + salida.productor + '  ·  tipo ' + salida.tipo);
  console.log('  sha256     ' + sha);
  if (ESCRIBE) {
    const destino = path.join(RAIZ, planta + '_relieve.json');
    fs.writeFileSync(destino, texto);
    console.log('  ESCRITO ' + planta + '_relieve.json  ('
              + (fs.statSync(destino).size / 1048576).toFixed(2) + ' MB)');
    /* Y EL MANIFIESTO, que es lo que viaja con el preset del proyecto. El
       fichero no puede llevar su propio sha dentro -se mordería la cola-, así
       que vive aquí al lado y es lo que Siting comprueba. */
    const man = path.join(RAIZ, planta + '_relieve.sha256.json');
    fs.writeFileSync(man, JSON.stringify({
      fichero: planta + '_relieve.json', sha256: sha, bytes: texto.length,
      productor: salida.productor, tipo: salida.tipo, generado: salida.generado,
      planta, crs: L.crs, cE: L.cE, cN: L.cN, paso: PASO, nx, nn,
      eje_m: EJE, eje_medido: false,
      /* La calidad va TAMBIEN en el manifiesto: es lo que viaja con el preset,
         y la pantalla lo lee de ahi sin tener que bajar 1,5 MB de malla. */
      calidad: salida.calidad,
      _que_es: 'Manifiesto del terreno de esta planta. Viaja con el preset del proyecto; '
             + 'quien consuma el fichero comprueba este sha256 antes de usarlo. '
             + 'El sha se calcula sobre el TEXTO del JSON, byte a byte.'
    }, null, 2) + '\n');
    console.log('  ESCRITO ' + planta + '_relieve.sha256.json');
  } else {
    console.log('  (sin --write: no se ha escrito nada)');
  }
}
