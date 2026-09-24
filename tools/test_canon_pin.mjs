/* LA COPIA FIJADA DEL CANON DE RADIO, CAREADA — y el despeje, que ya no se
 * escribe aquí.
 *
 * ═══ QUÉ HABÍA ═══
 *
 * `terreno.html` calculaba el radio de la primera zona de Fresnel con
 *
 *     var lam = 0.125;
 *     var r   = Math.sqrt(lam * D * f * (1 - f));
 *
 * Es EXACTAMENTE la fórmula del canon —`radioFresnel(d1, d2, f)` con d1 = f·D y
 * d2 = (1−f)·D se simplifica a eso— pero con la longitud de onda redondeada a
 * mano y sin decir de qué frecuencia sale. Una segunda copia de una fórmula es
 * una copia que se queda vieja: la del canon depende de la frecuencia, y el día
 * que esta página tenga que pintar 868 MHz, un 0,125 escrito a mano no se
 * entera.
 *
 * ═══ QUÉ COMPRUEBA ═══
 *
 *   1. la copia fijada es IDÉNTICA al canon, byte a byte (sin él, rc = 2);
 *   2. el despeje de la página SIGUE al canon: si al canon se le cambia
 *      `radioFresnel`, el `ratio` de `linkClearance` cambia con él. Eso no lo
 *      puede fingir una copia local — o delega o no delega;
 *   3. la fórmula NO está escrita dos veces en el repo;
 *   4. y la cuenta de cuánto movió el cambio, que es lo que había que publicar.
 *
 *     node tools/test_canon_pin.mjs
 *     MUTA=<clave> node tools/test_canon_pin.mjs      (TIENE que salir rojo)
 *
 * rc = 0 careado y coincide · 1 discrepa · 2 NO SE HA PODIDO CAREAR
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let ok = 0, ko = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (x !== undefined ? ' -> ' + x : '')); } };

const MUTACIONES = {
  // la copia se desvía del canon por un byte: el caso que esto existe para cazar
  copiaDesviada: ['lib/radio_pv_model.js', 'var C_LUZ = 299792458;', 'var C_LUZ = 299792459;'],
  // el candado deja de corresponder con el fichero que fija
  candadoRancio: ['lib/canon.lock.json', '"sha256": "8a68a48c', '"sha256": "00000000'],
  // vuelve la lambda escrita a mano: el estado del que se sale con esto
  lambdaAMano: ['terreno.html', 'var r=RadioPV.radioFresnel(f*D,(1-f)*D,RF_F_HZ)',
                'var r=Math.sqrt(0.125*D*f*(1-f))'],
  // la frecuencia deja de estar declarada y se cuela un número suelto
  frecuenciaMuda: ['terreno.html', 'var RF_F_HZ = 2.45e9;', 'var RF_F_HZ = 0.125;'],
  // la página deja de cargar el canon
  sinCanonEnLaPagina: ['terreno.html', '<script src="lib/radio_pv_model.js"></script>', ''],
};
const MUTA = process.env.MUTA;
let DIR = RAIZ;
if (MUTA) {
  const mu = MUTACIONES[MUTA];
  if (!mu) { console.error('mutacion desconocida. Hay: ' + Object.keys(MUTACIONES).join(', ')); process.exit(2); }
  DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'canonpin-'));
  fs.mkdirSync(path.join(DIR, 'lib'));
  for (const f of ['lib/radio_pv_model.js', 'lib/canon.lock.json', 'terreno.html'])
    fs.copyFileSync(path.join(RAIZ, f), path.join(DIR, f));
  const dest = path.join(DIR, mu[0]), antes = fs.readFileSync(dest, 'utf8');
  const despues = antes.replace(mu[1], mu[2]);
  if (despues === antes) {
    console.error('la mutacion «' + MUTA + '» no casó con ' + mu[0] + '. Eso es NO COMPROBADO, no rojo.');
    process.exit(2);
  }
  fs.writeFileSync(dest, despues);
  console.log('### MUTACION «' + MUTA + '» PUESTA: este banco TIENE que salir rojo\n');
}

/* ── 1 · EL CANDADO Y LA COPIA ──────────────────────────────────────────── */
const fCopia = path.join(DIR, 'lib/radio_pv_model.js');
const fLock = path.join(DIR, 'lib/canon.lock.json');
check('la copia y su candado están donde se espera', fs.existsSync(fCopia) && fs.existsSync(fLock));
if (!fs.existsSync(fCopia) || !fs.existsSync(fLock)) { console.log('\nFALLAN ' + ko); process.exit(1); }

const lock = JSON.parse(fs.readFileSync(fLock, 'utf8'));
const copia = fs.readFileSync(fCopia);
const sha = crypto.createHash('sha256').update(copia).digest('hex');
check('el candado declara su canon (repo y rama)',
      lock.canon.repo === 'imoriana3/siting' && lock.canon.rama === 'main', JSON.stringify(lock.canon));
check('y de qué commit salió', /^[0-9a-f]{40}$/.test(String(lock.canon.commit)), lock.canon.commit);
check('el sha del candado corresponde con la copia', lock.copias[0].sha256 === sha,
      lock.copias[0].sha256.slice(0, 12) + ' vs ' + sha.slice(0, 12));

/* ── 2 · CONTRA EL ORIGINAL, QUE ES LO QUE DA SENTIDO AL RESTO ──────────── */
const hermano = ['../Siting', '../siting'].map(p => path.join(RAIZ, p, 'radio_pv_model.js'))
                                          .find(p => fs.existsSync(p));
if (!hermano) {
  console.log('\nNO SE HA PODIDO CAREAR: no encuentro `radio_pv_model.js` en el repo hermano.');
  console.log('El candado cuadra consigo mismo, que no dice NADA sobre si la copia está al día.');
  console.log('«No he podido mirar» no es «está bien».');
  process.exit(2);
}
const canon = fs.readFileSync(hermano);
check('la copia es IDÉNTICA al canon, byte a byte', canon.equals(copia),
      'canon ' + crypto.createHash('sha256').update(canon).digest('hex').slice(0, 12) + ' · copia ' + sha.slice(0, 12));

/* ── 3 · LA FÓRMULA, UNA SOLA VEZ ──────────────────────────────────────── */
const html = fs.readFileSync(path.join(DIR, 'terreno.html'), 'utf8');
const sinCom = html.replace(/\/\*[\s\S]*?\*\//g, ' ')
                   .split('\n').map(l => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');
check('la página carga el canon', /<script src="lib\/radio_pv_model\.js">/.test(html));
check('la página NO se escribe su propia longitud de onda',
      !/lam\s*=\s*0\.12/.test(sinCom), (sinCom.match(/lam\s*=\s*[\d.]+/) || [])[0]);
check('ni su propio radio de Fresnel',
      !/Math\.sqrt\(\s*(lam|0\.12)[^)]*\*\s*D\s*\*/.test(sinCom),
      (sinCom.match(/Math\.sqrt\([^)]*D[^)]*\)/) || [])[0]);
check('y declara la frecuencia, con un valor de radio y no una longitud de onda',
      /var RF_F_HZ = 2\.45e9;/.test(sinCom), (sinCom.match(/RF_F_HZ = [^;]*/) || [])[0]);

/* ── 4 · Y QUE EL DESPEJE SIGA AL CANON, EJECUTÁNDOLO ──────────────────── */
/* Se extrae `linkClearance` del HTML REAL —nunca una copia— y se le ponen los
   alrededores mínimos: una cota plana y ningún panel, que es el caso donde el
   único término que queda es el radio de Fresnel. Así lo que se mide es la
   dependencia, sin geometría de por medio. */
const bloque = html.match(/var RF_F_HZ = [\s\S]*?\n}\n/);
check('el bloque del despeje se extrae del terreno.html real', !!bloque);
if (!bloque) { console.log('\nFALLAN ' + ko); process.exit(1); }

const RPV = require(fCopia);
function contexto(rpv) {
  const ctx = {
    Math, RadioPV: rpv,
    ELEV: () => 0,                 // terreno plano: el hueco es la propia altura
    panelBand: () => null,         // sin paneles: manda el relieve
    inField: () => false, nearRowD: () => 1e9, projX: (x) => x,
    mPerLon: 1, mPerLat: 1,
  };
  ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(bloque[0], ctx);
  return ctx;
}
const c1 = contexto(RPV);
const r1 = c1.linkClearance(0, 0, 3, 0, 200, 3);
check('el despeje sale un número, no un NaN', Number.isFinite(r1.ratio), JSON.stringify(r1));

/* Si al canon se le toca `radioFresnel`, el ratio de la página tiene que
   cambiar con él. Una copia local pasaría el resto y fallaría esto. */
const orig = RPV.radioFresnel;
RPV.radioFresnel = (a, b, f, n) => orig(a, b, f, n) * 2;
const r2 = contexto(RPV).linkClearance(0, 0, 3, 0, 200, 3);
RPV.radioFresnel = orig;
check('toca el canon el radio de Fresnel: el despeje de la página cambia con él',
      Math.abs(r2.ratio - r1.ratio / 2) < 1e-9, r1.ratio + ' -> ' + r2.ratio);

/* ── 5 · EL ANTES/DESPUÉS, MEDIDO ──────────────────────────────────────── */
const LAM_VIEJA = 0.125, LAM_CANON = RPV.longitudOnda(2.45e9);
const factor = Math.sqrt(LAM_VIEJA / LAM_CANON);
check('λ del canon a 2,45 GHz es 0,12236 m, no 0,125',
      Math.abs(LAM_CANON - 0.1223642) < 1e-6, LAM_CANON);
/* MEDIDO, no razonado de cabeza: 1,0107126404395765. La primera versión de esta
   línea puso 1,010725 «a ojo» y el banco la cazó por 1,2e-5. Es la cuarta vez
   hoy que una expectativa escrita de memoria no aguanta la medida. */
check('los radios encogen un 1,06 % y los ratios suben un 1,07 %',
      Math.abs(factor - 1.0107126404) < 1e-9, factor);
/* EL SIGNO NO PUEDE CAMBIAR, y es lo que hace que esto sea un arreglo de
   correccion y no un cambio de dibujo: `ratio` se multiplica por un factor
   POSITIVO, asi que «sin vision» (ratio < 0) sigue siendo «sin vision». */
/* EL BARRIDO, FINO. Con paso 0,01 no cambia NINGUNO —lo comprobé, y mi primera
   versión esperaba que sí—, porque la franja que se mueve es más estrecha que el
   paso: mide 0,0064 de ancho. Hace falta muestrear por debajo de eso para verla,
   y ese es justo el tamaño del efecto. */
const bordeBajo = 0.6 / factor;
let cruzaCero = 0, movidos = 0, fuera = 0, total = 0;
for (let i = -200000; i <= 200000; i++) {
  const viejo = i / 100000, nuevo = viejo * factor;       // paso 1e-5
  total++;
  if ((viejo < 0) !== (nuevo < 0)) cruzaCero++;
  if ((viejo < 0.6) !== (nuevo < 0.6)) {
    movidos++;
    if (!(viejo >= bordeBajo && viejo < 0.6)) fuera++;
  }
}
check('ningún enlace cambia de «sin visión» a «con visión» ni al revés', cruzaCero === 0, cruzaCero);
check('los que se mueven están TODOS en la franja [0,5936 · 0,6)', fuera === 0,
      fuera + ' fuera de ' + movidos);
check('y son ' + movidos + ' de ' + total.toLocaleString('es') + ' ratios muestreados',
      movidos > 0 && movidos / total < 0.002, (100 * movidos / total).toFixed(4) + ' %');
check('la franja mide 0,0064 de ancho', Math.abs((0.6 - bordeBajo) - 0.0063602) < 1e-6,
      (0.6 - bordeBajo).toFixed(7));

/* ── EL ALCANCE ────────────────────────────────────────────────────────── */
const PISO = 18, PISO_MUT = 5;
console.log('\nalcance: 1 copia fijada careada byte a byte · el despeje ejecutado contra el canon · ' +
            Object.keys(MUTACIONES).length + ' mutaciones (piso ' + PISO_MUT + ')');
console.log('');
if (ko) { console.log('FALLAN ' + ko + ' de ' + (ok + ko) + ' comprobaciones'); process.exit(1); }
if (ok < PISO || Object.keys(MUTACIONES).length < PISO_MUT) {
  console.log('ALCANCE INSUFICIENTE: nada ha fallado, pero esto no ha mirado bastante (' + ok + ' de ' + PISO + ').');
  process.exit(2);
}
console.log('TODO OK — ' + ok + ' comprobaciones');
