/* LA CIFRA ANUAL POR POLÍTICA, CON EL CONSUMO DEL MOTOR AL LADO.

   LA PREGUNTA. `pairwise` es la política canónica de la página y del gemelo.
   `optimal` (energy-optimal / Deeptrack) busca el θ que más POA de planta da en
   cada instante, así que por construcción estima MÁS energía. La pregunta no es
   si gana —gana—, sino si gana LO SUFICIENTE para pagar lo que mueve: el
   energy-optimal persigue un objetivo bimodal (dos máximos, f=0 y f=1, con un
   valle del 28 % en medio) y eso le hace cambiar de pico a media mañana. Cada
   cambio de pico es recorrido de actuador y arranques de motor, y el motor come
   de la misma planta. Esta herramienta pone las dos cifras en las mismas
   unidades y resta.

   POR QUÉ NO SALE DE LA PÁGINA NI DEL CANARIO. `golden_anual.json` tiene la
   cifra anual, pero a paso HORARIO y sin lazo: a paso horario el techo de
   velocidad del actuador son 0,17·3600 = 612°, más que el recorrido entero del
   tracker, así que la banda muerta se vuelve invisible y el recorrido que se
   mide no es el que hace el tracker. El consumo de motor SOLO tiene sentido con
   el lazo real y en una rejilla que el actuador no pueda saltarse: aquí el año
   va a paso de 1 MINUTO, con banda 1°, 0,17 °/s y ciclo 1 s — los valores de
   arranque de la tarjeta «lazo de control del tracker».
   Cuesta ~10 min el año de pairwise y ~33 min el de optimal. No es un banco: es
   una medida, y por eso vive en tools/ y no en un test.

   ── EL LADO DEL MOTOR: DOS REGÍMENES MEDIDOS, Y UNA COSTURA DECLARADA ──

   El modelo es `solargpt_core.motor_energy` del hermano SolarGPTfull, y sus
   constantes se LEEN de ese fichero (no se copian aquí): si no está el hermano,
   esto no estima nada y lo dice.

   E(Δθ) = intercepto + k·|Δθ|, y una maniobra es un tramo CONTIGUO de
   movimiento — una rampa de 55° en pasos de 1° es UNA maniobra de 55°, no 55
   de 1°. Se segmenta igual que `daily_motor_energy_wh`, con el mismo ε = 0,05°
   (resolución del encoder: por debajo no hay maniobra, hay ruido).

   Y AQUÍ ESTÁ LA TRAMPA DE ESTA MEDIDA, que es el motivo de que el core se
   niegue a dar un número: el modelo del ensayo está medido sobre barridos de
   ±55° y su dominio es |Δθ| ≥ 20°. Las maniobras de un backtracking son de
   grado y medio. Extrapolar el intercepto del ensayo hacia abajo se equivoca
   por un factor 27 —lo dice la validación contra 106 TCUs de flota— y por eso
   `daily_motor_energy_wh` devuelve NaN en cuanto hay una maniobra fuera de
   dominio. Llamar a eso «Wh de motor» sería inventar.
   Así que cada maniobra se cobra con el modelo medido EN SU régimen:
     · |Δθ| ≥ 20°  → el ensayo dedicado (8 barridos de ±55°, r² mediana 0,982).
                     Aquí eso son el estacionamiento nocturno y la inversión de
                     la mañana, que son las maniobras grandes del día.
     · |Δθ| <  20° → AJUSTE_FLOTA, el MISMO modelo ajustado sobre las 14.759
                     maniobras reales de flota de El Burgo, que es exactamente
                     este régimen: E = 0,0901 + 0,0447·|Δθ|.
   La costura en 20° es un salto de verdad (×3,7 en el intercepto) y no se
   disimula: se imprime cuánta energía cae a cada lado, para que se vea de qué
   depende el resultado. Y como segunda opinión se cobra el tramo pequeño con la
   tabla por bandas de Wh/° del mismo careo de flota, que es más fina que el
   ajuste porque recoge que el coste por grado CRECE al bajar la amplitud
   (0,2262 Wh/° por debajo de 1° frente a 0,0653 por encima de 5°). Si las dos
   opiniones dan el mismo signo, el resultado no depende del modelo.

   ── LAS UNIDADES SE PUEDEN RESTAR ──

   La genérica es monofila y sin accionamiento acoplado: una fila es un string
   Y un motor. Así que los kWh de string y los Wh de motor de esa misma fila son
   el mismo tracker, y restar es legítimo. En una planta bifila NO lo sería —un
   motor mueve dos filas— y por eso esta medida va sobre la genérica.

       node tools/anual_motor.mjs [--pol a,b,c] [--cada N] [--ano 2026] [--filas N]

   `--filas N` cambia el tamaño de la planta, y NO es un detalle: la ganancia de
   `optimal` sale en parte de la fila de CABEZA, que nunca se sombrea, y esa fila
   es el 10 % de una planta de 10 filas y el 1,3 % de las 79 líneas de Ayora.
   Medido a 12 días: +0,460 % con 10 filas, +0,298 % con 20 y +0,229 % con 40.

   `--cada N` mide uno de cada N días y escala: sirve para tantear, NO para dar
   la cifra. Lo declara en la salida.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carga, CFG0 } from './gen_golden_anual.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(AQUI);

/* ── las constantes del motor, LEÍDAS del core ─────────────────────────────
   Por regex sobre el fuente y no por un JSON copiado: un número copiado se
   queda viejo en silencio el día que el core recalibre. Si el hermano no está
   o el fichero ya no dice lo que decía, esto revienta con el motivo. */
export function motorDelCore(raizCore) {
  const f = path.join(raizCore || path.join(path.dirname(ROOT), 'SolarGPTfull'),
                      'solargpt', 'solargpt_core', 'motor_energy.py');
  if (!fs.existsSync(f))
    throw new Error('no encuentro el modelo de motor del core en ' + f + '\n' +
      'El consumo de motor NO se estima aquí: sale de solargpt_core.motor_energy, ' +
      'medido en El Burgo. Clona SolarGPTfull al lado de este repo.');
  const src = fs.readFileSync(f, 'utf-8');
  const num = (re, qué) => {
    const m = src.match(re);
    if (!m) throw new Error('motor_energy.py ya no declara ' + qué + ' donde esto lo buscaba');
    return parseFloat(m[1]);
  };
  const cfg = (nombre) => {
    const i = src.indexOf(nombre + ' = MotorConfig(');
    if (i < 0) throw new Error('motor_energy.py sin la configuración ' + nombre);
    const bloque = src.slice(i, src.indexOf(')', src.indexOf('procedencia', i)));
    const dame = (re, qué) => {
      const m = bloque.match(re);
      if (!m) throw new Error(nombre + ' ya no declara ' + qué);
      return parseFloat(m[1]);
    };
    return { nombre: nombre.toLowerCase(),
             k: dame(/k_wh_per_deg=([0-9.]+)/, 'k_wh_per_deg'),
             e0: dame(/intercept_wh=([0-9.]+)/, 'intercept_wh') };
  };
  return {
    monofila: cfg('MONOFILA'),
    bifila: cfg('BIFILA'),
    flota: { e0: num(/"intercepto_wh":\s*([0-9.]+)/, 'AJUSTE_FLOTA.intercepto_wh'),
             k: num(/"k_wh_per_deg":\s*([0-9.]+)/, 'AJUSTE_FLOTA.k_wh_per_deg'),
             n: num(/"n_maniobras":\s*([0-9]+)/, 'AJUSTE_FLOTA.n_maniobras') },
    dominio: num(/^DOMINIO_MIN_DEG:\s*float\s*=\s*([0-9.]+)/m, 'DOMINIO_MIN_DEG'),
    eps: num(/^_EPS_DEG:\s*float\s*=\s*([0-9.]+)/m, '_EPS_DEG'),
    fuente: f,
  };
}

/* La tabla por bandas del careo de flota (Wh/° medido por amplitud), la segunda
   opinión para el régimen pequeño. Vive en el docstring de motor_energy.py
   porque los logs de flota no están en ningún repositorio; se cita, con su n. */
export const BANDAS_FLOTA = [
  { hasta: 1.0, whDeg: 0.2262, n: 8335, et: '<1°' },
  { hasta: 2.0, whDeg: 0.0880, n: 5171, et: '1-2°' },
  { hasta: 5.0, whDeg: 0.0701, n: 1177, et: '2-5°' },
  { hasta: Infinity, whDeg: 0.0653, n: 76, et: '>5°' },
];
const whBanda = (amp) => amp * BANDAS_FLOTA.find(b => amp < b.hasta).whDeg;

/* ── maniobras de una trayectoria, como las cuenta el core ────────────────── */
export function maniobras(th, eps) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < th.length; i++) {
    const d = Math.abs(th[i] - th[i - 1]);
    if (d > eps) acc += d;
    else if (acc > 0) { out.push(acc); acc = 0; }
  }
  if (acc > 0) out.push(acc);
  return out;
}

/* El coste de una lista de maniobras, cada una con el modelo de SU régimen. */
export function costeMotor(amps, M, cfg) {
  const c = M[cfg];
  let grande = 0, peque = 0, pequeBanda = 0, nG = 0, nP = 0, recG = 0, recP = 0;
  for (const a of amps) {
    if (a >= M.dominio) { grande += c.e0 + c.k * a; nG++; recG += a; }
    else { peque += M.flota.e0 + M.flota.k * a; pequeBanda += whBanda(a); nP++; recP += a; }
  }
  return { wh: grande + peque, whBanda: grande + pequeBanda,
           grande, peque, pequeBanda, nG, nP, recG, recP };
}

/* ── el año de una política ────────────────────────────────────────────────
   Un solo recorrido del año: la energía y el recorrido EJECUTADO salen del
   mismo paso, así que hablan del mismo tracker en el mismo instante. */
export function anoDe(S, pol, opt) {
  const c = JSON.parse(JSON.stringify(CFG0));
  c.pol = pol;
  if (opt.filas) c.nrows = opt.filas;
  c.date = opt.ano + '-06-21';
  c.ctrl = { on: true, db: 1.0, slew: 0.17, cicloSeg: 1, modo: 'libre' };
  const T = S.tGenerica(S.F, c), map = S.mapStringW(S.F, c, T.obj);
  const n = c.nrows;
  const kwh = new Array(n).fill(0);
  const mes = new Array(12).fill(0);        // kWh de planta por mes: la ganancia
  const mesMan = new Array(12).fill(0);     // …y las maniobras, que es lo que cuesta
  const amps = Array.from({ length: n }, () => []);
  let dias = 0, saltoNoche = 0, i = -1;
  let ultimo = null;                        // θ del último minuto del día anterior
  for (const ds of S.fechasPeriodo(c.date, 'ano')) {
    if (++i % opt.cada !== 0) { ultimo = null; continue; }   // tanteo: sin día anterior
    dias++;
    // El día se recorre con `instant` y se integra exactamente como `dayAvanza`
    // (misma fórmula, mismo map, mismo paso), porque aquí hace falta LEER el θ
    // ejecutado de cada minuto y dayEnergy solo devuelve la energía.
    const c2 = Object.assign({}, c, { date: ds });
    const mi = +ds.slice(5, 7) - 1;
    const trz = Array.from({ length: n }, () => []);
    let prev = null;
    for (let m = 0; m < 1440; m += 1) {
      const r = S.instant(S.F, c2, T.obj, m, prev); prev = r;
      for (let k = 0; k < n; k++) {
        const w = map(r.rows[k], r.met, r, k);
        kwh[k] += w; mes[mi] += w; trz[k].push(r.ang[k]);
      }
    }
    if (ultimo) for (let k = 0; k < n; k++)
      saltoNoche = Math.max(saltoNoche, Math.abs(trz[k][0] - ultimo[k]));
    ultimo = trz.map(t => t[t.length - 1]);
    for (let k = 0; k < n; k++) {
      const ms = maniobras(trz[k], opt.eps);
      mesMan[mi] += ms.length;
      for (const a of ms) amps[k].push(a);
    }
  }
  for (let k = 0; k < n; k++) kwh[k] *= 1 / 60 / 1000;      // paso 1 min → kWh
  for (let i = 0; i < 12; i++) mes[i] *= 1 / 60 / 1000;
  const esc = opt.cada > 1 ? 365 / dias : 1;
  return { pol, kwh, mes, mesMan, amps, dias, esc, saltoNoche, n };
}

function main() {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const pols = arg('pol', 'pairwise,optimal').split(',');
  const cada = Math.max(1, parseInt(arg('cada', '1'), 10));
  const filas = parseInt(arg('filas', '0'), 10) || 0;
  const ano = arg('ano', '2026');
  const M = motorDelCore();
  const S = carga(ROOT);
  const CFGM = 'monofila';           // la genérica: media estructura por accionamiento

  console.log('LA CIFRA ANUAL CON EL MOTOR DENTRO — genérica de arranque (' + (filas || CFG0.nrows) +
              ' filas, pitch 6 m,');
  console.log('cuerda 2,382 m, pendiente 4°, lat 41,58), año ' + ano + ', paso 1 min, lazo REAL');
  console.log('(banda 1,0° · 0,17 °/s · ciclo 1 s · modo libre). Una fila = un string = un motor.');
  console.log('Motor: ' + M.fuente.replace(path.dirname(ROOT) + '/', '') +
              ' · ' + CFGM + ' k=' + M[CFGM].k + ' Wh/° e0=' + M[CFGM].e0 + ' Wh (|Δθ|≥' + M.dominio + '°)');
  console.log('        AJUSTE_FLOTA e0=' + M.flota.e0 + ' k=' + M.flota.k +
              ' Wh/° sobre ' + M.flota.n + ' maniobras reales (|Δθ|<' + M.dominio + '°)');
  if (cada > 1) console.log('¡TANTEO! uno de cada ' + cada + ' días, escalado a 365 — no es la cifra');
  console.log('');

  const res = [];
  for (const pol of pols) {
    const t0 = Date.now();
    const r = anoDe(S, pol, { ano, cada, filas, eps: M.eps });
    const amps = r.amps.flat();
    const cm = costeMotor(amps, M, CFGM);
    const kwhPlanta = r.kwh.reduce((a, b) => a + b, 0) * r.esc;
    const whMotor = cm.wh * r.esc, whMotorB = cm.whBanda * r.esc;
    res.push({ pol, kwhPlanta, whMotor, whMotorB, cm, r, seg: (Date.now() - t0) / 1000,
               rec: (cm.recG + cm.recP) * r.esc, nMan: amps.length * r.esc });
    console.log('  ' + pol.padEnd(9) + ' ' + r.dias + ' días en ' + ((Date.now() - t0) / 60000).toFixed(1) +
                ' min · E ' + kwhPlanta.toFixed(1) + ' kWh · recorrido ' +
                ((cm.recG + cm.recP) * r.esc / 1000).toFixed(1) + ' k° · ' +
                (amps.length * r.esc / 1000).toFixed(1) + ' k maniobras · motor ' +
                (whMotor / 1000).toFixed(2) + ' kWh (bandas ' + (whMotorB / 1000).toFixed(2) + ')' +
                ' · salto de medianoche ' + r.saltoNoche.toFixed(4) + '°');
  }

  console.log('\n── EL NETO, sobre ' + res[0].pol + ' (planta entera: ' + res[0].r.n + ' filas) ──');
  console.log('política   ΔE estimada     Δmotor        NETO          maniobras   recorrido');
  const b = res[0];
  for (const x of res) {
    const dE = (x.kwhPlanta - b.kwhPlanta) * 1000;                  // Wh
    const dM = x.whMotor - b.whMotor, dMB = x.whMotorB - b.whMotorB;
    const net = dE - dM, netB = dE - dMB;
    console.log('  ' + x.pol.padEnd(9) +
      (x === b ? ' (referencia)' :
       (dE >= 0 ? '+' : '') + (dE / 1000).toFixed(1).padStart(8) + ' kWh  ' +
       (dM >= 0 ? '+' : '') + (dM / 1000).toFixed(2).padStart(7) + ' kWh  ' +
       (net >= 0 ? '+' : '') + (net / 1000).toFixed(1).padStart(7) + ' kWh  ' +
       ((net / b.kwhPlanta / 1000 * 100 >= 0 ? '+' : '') +
        (net / (b.kwhPlanta * 1000) * 100).toFixed(3) + ' %').padStart(9) + '  ' +
       ((x.nMan - b.nMan) / 1000).toFixed(1).padStart(7) + ' k  ' +
       ((x.rec - b.rec) / 1000).toFixed(1).padStart(7) + ' k°' +
       '   [bandas: neto ' + (netB / 1000).toFixed(1) + ' kWh]'));
  }
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (res.length > 1 && cada === 1) {
    console.log('\n── DÓNDE GANA, MES A MES (kWh de planta, y % sobre ' + b.pol + ') ──');
    console.log('           ' + MES.map(m => m.padStart(8)).join(''));
    for (const x of res) {
      if (x === b) { console.log('  ' + x.pol.padEnd(9) + x.r.mes.map(v => v.toFixed(0).padStart(8)).join('')); continue; }
      console.log('  ' + x.pol.padEnd(9) + x.r.mes.map((v, i) => (v - b.r.mes[i]).toFixed(0).padStart(8)).join(''));
      console.log('  ' + ''.padEnd(9) + x.r.mes.map((v, i) => ((v / b.r.mes[i] - 1) * 100).toFixed(2).padStart(8)).join('') + '  %');
    }
    console.log('  maniobras/mes, ' + res.map(x => x.pol + ' ' +
      (x.r.mesMan.reduce((a, c) => a + c, 0) / 1000).toFixed(0) + ' k').join(' · '));
  }
  console.log('\n── DE QUÉ LADO DE LA COSTURA SALE EL MOTOR (' + M.dominio + '°) ──');
  console.log('política   maniobras ≥20°   su Wh     maniobras <20°   su Wh (ajuste/bandas)');
  for (const x of res) {
    const c = x.cm, e = x.r.esc;
    console.log('  ' + x.pol.padEnd(9) + String(Math.round(c.nG * e)).padStart(12) + '  ' +
      (c.grande * e / 1000).toFixed(2).padStart(8) + ' kWh  ' +
      String(Math.round(c.nP * e)).padStart(12) + '  ' +
      (c.peque * e / 1000).toFixed(2) + ' / ' + (c.pequeBanda * e / 1000).toFixed(2) + ' kWh');
  }
}

if (import.meta.url === 'file://' + process.argv[1]) main();
