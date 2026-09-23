/* EL DETECTOR DE RESOLUCIÓN REAL, PROBADO CONTRA DATO DE N CONOCIDO.
 *
 * ═══ POR QUÉ ESTE BANCO EXISTE, Y NO ES CEREMONIA ═══
 *
 * La PRIMERA versión de `factorRemuestreo` daba N = 1 en las DOCE plantas de la
 * cartera, incluida Túnez —que casi con seguridad es SRTM de 30 m— y se habría
 * publicado como «resolución real 7 m» si nadie la hubiera probado contra dato
 * de respuesta conocida. La avería: el umbral era 1/256 m, que es EXACTAMENTE
 * el escalón de cuantización de terrarium, así que el ruido de redondeo lo
 * disparaba en todos los píxeles.
 *
 * Un detector que contesta «nativo» siempre no está midiendo: está diciendo
 * que sí. Y eso sólo se ve fabricando el caso cuya respuesta ya se sabe.
 *
 * ═══ LOS CASOS ═══
 *
 * Se fabrica una tesela terrarium SINTÉTICA con relieve continuo, se remuestrea
 * bilinealmente de factor N conocido, se CUANTIZA a 1/256 como hace terrarium
 * —sin eso el banco sería más fácil que la realidad— y se le pide al detector
 * que encuentre ese N.
 *
 * Con el test nulo que hace falta: dato NATIVO (N = 1) tiene que salir sin
 * firma. Un detector que acierta los cuatro N pero también «encuentra» firma
 * en dato nativo no sirve para nada, porque entonces siempre encuentra.
 *
 * USO:  node tools/test_dem_cobertura.mjs
 *       MUTA=<clave> node tools/test_dem_cobertura.mjs   (TIENE que salir rojo)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MUTA = process.env.MUTA;

/* ── LAS MUTACIONES ───────────────────────────────────────────────────────
   Se aplican sobre el FUENTE del útil y se importa el resultado, para que lo
   que se prueba sea el código que corre y no una copia. */
const MUTACIONES = {
  // el umbral de contraste desaparece: cualquier ruido pasa por firma
  umbralFuera:  [/if \(mejorC < 3\) return \{ n: 1, contraste: mejorC, firma: false \};/,
                 'if (false) return { n: 1, contraste: mejorC, firma: false };'],
  /* LA FASE DEJA DE BUSCARSE. Los nodos de la rejilla original NO caen en el
     borde de la tesela: caen donde caigan. Un detector que sólo mire la fase 0
     acierta en los casos de laboratorio y falla en las teselas de verdad.
     (Esta mutación sustituye a una primera, `ruidoEsSenal`, que salió DORMIDA
     porque no modelaba nada: `entre` siempre supera 1/256 en estos casos. Y
     buscarle sustituto destapó que al banco le faltaba el caso desfasado.) */
  faseFija:     [/for \(let f = 0; f < n; f\+\+\) \{/, 'for (let f = 0; f < 1; f++) {'],
  // sólo mira filas: una fuente remuestreada sólo en columnas se escaparía
  soloFilas:    [/linea\(\(a, i\) => cotaPx\(img, a, i\), img\.H, img\.W\);/, ';'],
};
let casada = false;
const fUtil = path.join(RAIZ, 'tools', 'dem_cobertura_cartera.mjs');
let src = fs.readFileSync(fUtil, 'utf8');
if (MUTA) {
  const m = MUTACIONES[MUTA];
  if (!m) { console.error('mutacion desconocida. Hay: ' + Object.keys(MUTACIONES).join(', ')); process.exit(2); }
  const antes = src; src = src.replace(m[0], m[1]);
  if (src === antes) { console.error('la mutacion «' + MUTA + '» no casó'); process.exit(2); }
  casada = true;
  console.log('### MUTACION «' + MUTA + '» PUESTA: este banco TIENE que salir rojo\n');
}
const tmp = path.join(RAIZ, 'tools', '_dem_cobertura_bajo_prueba.mjs');
fs.writeFileSync(tmp, src);
let factorRemuestreo;
try { ({ factorRemuestreo } = await import('file://' + tmp)); }
finally { fs.unlinkSync(tmp); }
if (MUTA && !casada) { console.error('la mutacion no llegó a ponerse'); process.exit(2); }

let ok = 0, ko = 0;
const check = (q, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + q); }
  else { ko++; console.log('FAIL ' + q + (extra != null ? ' -> ' + JSON.stringify(extra) : '')); }
};

/* ── LA TESELA SINTÉTICA ──────────────────────────────────────────────────
   Relieve continuo con varias escalas, para que la curvatura en los nodos sea
   de verdad y no un escalón artificial. `semilla` fija: un banco que dependa
   de Math.random sale verde unas veces y rojo otras. */
function cotaSintetica(x, y) {
  return 300
    + 40 * Math.sin(x / 61.0) * Math.cos(y / 47.0)
    + 12 * Math.sin(x / 17.0 + 1.3) * Math.sin(y / 23.0 - 0.7)
    +  3 * Math.cos(x / 6.0 - 2.1) * Math.cos(y / 5.0 + 0.4);
}

/* Empaqueta una rejilla de cotas como PNG terrarium DESCODIFICADO, que es lo
   que `factorRemuestreo` recibe: {W,H,ca,px}. Se cuantiza a 1/256 igual que
   terrarium — sin cuantizar, el banco sería más fácil que la realidad. */
function comoTesela(z) {
  const H = z.length, W = z[0].length, ca = 3, px = Buffer.alloc(W * H * ca);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = Math.max(0, Math.min(65535.99, z[j][i] + 32768));
    const R = Math.floor(v / 256), G = Math.floor(v - R * 256), B = Math.round((v - R * 256 - G) * 256) & 255;
    const k = (j * W + i) * ca; px[k] = R; px[k + 1] = G; px[k + 2] = B;
  }
  return { W, H, ca, px };
}

/* Rejilla NATIVA: una cota por píxel, sin remuestrear. */
function nativa(n) {
  const z = [];
  for (let j = 0; j < n; j++) { const f = [];
    for (let i = 0; i < n; i++) f.push(cotaSintetica(i, j)); z.push(f); }
  return z;
}

/* Rejilla REMUESTREADA de factor N: se toma una cota cada N píxeles y se
   interpola bilinealmente el resto, que es lo que hace la cadena de teselas. */
function remuestreada(n, N, off) {
  const o = off || 0;
  const z = [];
  for (let j = 0; j < n; j++) { const f = [];
    for (let i = 0; i < n; i++) {
      const i0 = Math.floor((i - o) / N) * N + o, j0 = Math.floor((j - o) / N) * N + o;
      const tx = (i - i0) / N, ty = (j - j0) / N;
      const a = cotaSintetica(i0, j0), b = cotaSintetica(i0 + N, j0);
      const c = cotaSintetica(i0, j0 + N), d = cotaSintetica(i0 + N, j0 + N);
      f.push((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
    } z.push(f); }
  return z;
}

console.log('· el detector encuentra el N con el que se remuestreó');
for (const N of [2, 3, 4, 8]) {
  const r = factorRemuestreo(comoTesela(remuestreada(256, N)));
  check('remuestreado de ' + N + ' -> el detector dice ' + r.n
        + ' (contraste ' + r.contraste.toFixed(1) + ')', r.n === N && r.firma, r);
}

console.log('\n· y con los nodos DESFASADOS, que es como vienen de verdad');
/* Los nodos de la rejilla original no caen en el borde de la tesela: caen
   donde caigan. Sin este caso, un detector que sólo mirase la fase 0 pasaría
   el banco entero y fallaría en cuanto tocase una tesela real. */
for (const [N, off] of [[4, 2], [4, 1], [3, 2]]) {
  const r = factorRemuestreo(comoTesela(remuestreada(256, N, off)));
  check('remuestreado de ' + N + ' con los nodos en fase ' + off + ' -> dice ' + r.n
        + ' (contraste ' + r.contraste.toFixed(1) + ')', r.n === N && r.firma, r);
}

console.log('\n· EL TEST NULO: dato nativo NO puede dar firma');
{
  const r = factorRemuestreo(comoTesela(nativa(256)));
  check('nativo -> sin firma, N = 1 (contraste ' + r.contraste.toFixed(1) + ')',
        r.n === 1 && !r.firma, r);
}

console.log('\n· y el ruido puro tampoco, que es de donde salen las figuras');
{
  /* Congruencial lineal con semilla fija: reproducible en cualquier máquina. */
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const z = [];
  for (let j = 0; j < 256; j++) { const f = [];
    for (let i = 0; i < 256; i++) f.push(300 + 20 * rnd()); z.push(f); }
  const r = factorRemuestreo(comoTesela(z));
  check('ruido blanco -> sin firma (contraste ' + r.contraste.toFixed(1) + ')', !r.firma, r);
}

console.log('\n· el remuestreo SOLO EN COLUMNAS también se ve');
{
  const z = [];
  for (let j = 0; j < 256; j++) { const f = [];
    for (let i = 0; i < 256; i++) {
      const j0 = Math.floor(j / 4) * 4, ty = (j - j0) / 4;
      f.push(cotaSintetica(i, j0) * (1 - ty) + cotaSintetica(i, j0 + 4) * ty);
    } z.push(f); }
  const r = factorRemuestreo(comoTesela(z));
  check('columnas remuestreadas de 4 -> N = 4 (contraste ' + r.contraste.toFixed(1) + ')',
        r.n === 4 && r.firma, r);
}

console.log('');
console.log(ko ? 'FALLAN ' + ko + ' de ' + (ok + ko) : 'TODO OK — ' + ok + ' comprobaciones');
if (MUTA) console.log(ko ? '### bien: la mutacion «' + MUTA + '» sale roja'
                         : '### MAL: la mutacion «' + MUTA + '» pasa desapercibida');
process.exit(ko ? 1 : 0);
