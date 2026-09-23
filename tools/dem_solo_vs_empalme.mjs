/* dem_solo_vs_empalme.mjs — cuánto se pierde por no tener levantamiento.
 *
 * ═══ POR QUÉ ESTA COMPARACIÓN Y NO LA DE ANTES ═══
 *
 * `dem_error_vertical.mjs` compara el DEM contra las COTAS MEDIDAS, que son
 * unos miles de puntos en los extremos de fila. Está bien, pero el perfil de un
 * enlace no pasa por los extremos de fila: pasa por donde pasa, y muestrea la
 * MALLA entera.
 *
 * Esto compara las dos MALLAS, nodo a nodo, sobre la misma rejilla:
 *
 *     <planta>_relieve.json           el empalmado, lo más cercano a verdad
 *     <planta>_demsolo_relieve.json   el mismo sitio con solo DEM
 *
 * Las dos se generan con la misma geometría (`relieve_de_dem.mjs --comoel`),
 * así que la resta es directa y no mezcla el error del DEM con el de
 * remuestrear una malla sobre otra.
 *
 * El residuo que sale de aquí es el que se propaga a dB en
 * `Siting/tools/relieve_incertidumbre.mjs`, y el que acaba en el rótulo.
 *
 *   node tools/dem_solo_vs_empalme.mjs [ayora sanjose]
 *
 * ═══ EL ESCALÓN NO ES ERROR ═══
 *
 * El empalmado está en el datum de la obra y el DEM en el suyo. Entre los dos
 * hay una constante de metros, y una constante NO mueve el relieve —medido:
 * 2,5e-12 dB con ±0,80 m de desplazamiento uniforme—. Se quita la mediana y se
 * publica aparte. Sumarla al error daría metros que no afectan a nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PLANTAS = (SOLO.length ? SOLO : ['ayora', 'sanjose']);

const pct = (a, p) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
/* MAXIMO A BUCLE, no `Math.max(...a)`. Con 237.244 nodos el operador de
   propagacion mete un argumento por elemento y revienta la pila —«Maximum call
   stack size exceeded»—. Paso aqui: los otros utiles trabajan con miles de
   elementos y no lo notan, este con cientos de miles y si. */
const maxDe = a => { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };

console.log('el DEM SOLO contra el EMPALMADO, nodo a nodo sobre la misma malla\n');
const filas = [];
for (const planta of PLANTAS) {
  const fa = path.join(RAIZ, planta + '_relieve.json');
  const fb = path.join(RAIZ, planta + '_demsolo_relieve.json');
  if (!fs.existsSync(fa) || !fs.existsSync(fb)) {
    console.log('  ' + planta + ': falta ' + (fs.existsSync(fa) ? fb : fa));
    console.log('  Genera el DEM solo con:');
    console.log('    node tools/relieve_de_dem.mjs ' + planta + ' --forzar-dem-solo'
              + ' --sufijo _demsolo --comoel ' + planta + '_relieve.json --write\n');
    continue;
  }
  const A = JSON.parse(fs.readFileSync(fa, 'utf8'));
  const B = JSON.parse(fs.readFileSync(fb, 'utf8'));
  /* LAS DOS MALLAS TIENEN QUE SER LA MISMA. Si no, la resta compara nodos que
     no están en el mismo sitio y el número sale de la nada. */
  for (const k of ['x0', 'n0', 'paso', 'nx', 'nn', 'cE', 'cN']) {
    if (A[k] !== B[k]) {
      console.error(planta + ': las mallas no coinciden en «' + k + '» (' + A[k] + ' vs ' + B[k] + '). ABORTA.');
      process.exit(2);
    }
  }
  /* ── DÓNDE SE MIDE, Y POR QUÉ NO EN TODA LA MALLA ──────────────────────
     EL PRIMER INTENTO DIO p50 = 0,00 m EN LAS DOS PLANTAS, y no porque el DEM
     sea perfecto: el empalme SÓLO actúa cerca de las filas levantadas. Fuera de
     ahí los dos ficheros son el MISMO DEM, nodo por nodo, así que restarlos da
     cero por construcción. Y como el campo es mucho mayor que las filas, esos
     ceros se comen la mediana.
     Publicar aquel p50 habría dicho «el DEM no se equivoca nunca».
     Así que se mide DONDE EL EMPALME ACTUÓ, que es además por donde pasan los
     enlaces: nodos a menos de RADIO metros de un seguidor. Se publican los dos
     recuentos para que se vea la diferencia y nadie se lleve el cero. */
  const RADIO = parseFloat((process.argv.indexOf('--radio') >= 0
    && process.argv[process.argv.indexOf('--radio') + 1]) || '30');
  const L = JSON.parse(fs.readFileSync(path.join(RAIZ, planta + '_layout.json'), 'utf8'));
  const trk = (L.trackers || []).filter(t => t && t.x != null && t.n != null);
  if (!trk.length) { console.error(planta + ': el layout no trae seguidores con x/n. ABORTA.'); process.exit(2); }
  /* Rejilla de ocupación, para no hacer nodos × seguidores. */
  const cel = RADIO, ocup = new Set();
  const clave = (a, b) => a + ':' + b;
  for (const t of trk) {
    const ci = Math.round(t.x / cel), cj = Math.round(t.n / cel);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) ocup.add(clave(ci + di, cj + dj));
  }
  const cerca = (x, n) => ocup.has(clave(Math.round(x / cel), Math.round(n / cel)));

  const dif = [], difCerca = [];
  let soloA = 0, soloB = 0;
  for (let i = 0; i < A.z.length; i++) {
    const a = A.z[i], b = B.z[i];
    if (a == null && b == null) continue;
    if (a == null) { soloB++; continue; }
    if (b == null) { soloA++; continue; }
    dif.push(b - a);                       // DEM menos empalmado
    const gi = i % A.nx, gj = Math.floor(i / A.nx);
    if (cerca(A.x0 + gi * A.paso, A.n0 + gj * A.paso)) difCerca.push(b - a);
  }
  if (!dif.length) { console.log('  ' + planta + ': ningún nodo comparable.'); continue; }
  const esc = pct(dif, 0.5);
  const mide = (arr) => {
    const r = arr.map(d => d - esc), ab = r.map(Math.abs);
    return { n: arr.length, p50: pct(ab, 0.5), p90: pct(ab, 0.90), max: maxDe(ab),
             q05: pct(r, 0.05), q95: pct(r, 0.95) };
  };
  const todo = mide(dif), zona = difCerca.length ? mide(difCerca) : null;

  console.log('═══ ' + planta.toUpperCase() + ' ═══  malla ' + A.nx + '×' + A.nn + ' a ' + A.paso + ' m');
  console.log('  escalón de datum       ' + esc.toFixed(2) + ' m   (NO es error: es constante)');
  console.log('                         nodos     |res| p50    p90      máx      p05      p95');
  console.log('  toda la malla     ' + todo.n.toLocaleString('es').padStart(10)
    + (todo.p50.toFixed(2) + ' m').padStart(11) + todo.p90.toFixed(2).padStart(8)
    + todo.max.toFixed(2).padStart(9) + todo.q05.toFixed(2).padStart(9) + todo.q95.toFixed(2).padStart(9));
  if (zona) console.log('  a ≤' + RADIO + ' m de fila ' + zona.n.toLocaleString('es').padStart(9)
    + (zona.p50.toFixed(2) + ' m').padStart(11) + zona.p90.toFixed(2).padStart(8)
    + zona.max.toFixed(2).padStart(9) + zona.q05.toFixed(2).padStart(9) + zona.q95.toFixed(2).padStart(9));
  console.log('  huecos sólo en el empalmado: ' + soloB.toLocaleString('es'));
  console.log('  El p50 de «toda la malla» sale ' + todo.p50.toFixed(2) + ' porque fuera de las filas');
  console.log('  los dos ficheros son EL MISMO DEM: restarlos da cero por construcción.\n');
  filas.push({ planta, todo, zona, esc });
}

if (filas.length) {
  console.log('═══ RESUMEN ═══');
  console.log('  el que cuenta es el de la ZONA DE FILAS: es donde el empalme actuó y');
  console.log('  por donde pasan los enlaces.\n');
  console.log('  planta       nodos      escalón   |res| p50    p90      máx');
  for (const f of filas) { const z = f.zona || f.todo;
    console.log('  ' + f.planta.padEnd(12) + z.n.toLocaleString('es').padStart(9)
      + (f.esc.toFixed(2) + ' m').padStart(11) + (z.p50.toFixed(2) + ' m').padStart(11)
      + z.p90.toFixed(2).padStart(8) + z.max.toFixed(2).padStart(9)); }
  console.log('');
  console.log('  Este residuo es el que se propaga a dB. Y ojo con compararlo con el');
  console.log('  0,83 / 1,29 m de `dem_error_vertical.mjs`: aquél mide contra las cotas');
  console.log('  MEDIDAS —unos miles de puntos en extremos de fila— y éste contra la');
  console.log('  MALLA entera, que es por donde de verdad pasa el perfil de un enlace.');
  console.log('  No tienen por qué dar lo mismo, y el que manda aquí es éste.');
}
