/* PROTOCOLO DE LA PRUEBA DE UN SEGUIDOR — el experimento que cierra la última
   verificación pendiente del firmware.

   Uso:
     node tools/protocolo_prueba_pendiente.mjs --planta ayora --ncu 12 --tcu 26 --fecha 2026-08-30

   QUÉ FALTA POR VERIFICAR, Y POR QUÉ ESTO LO CIERRA. El volcado de la NCU12
   demostró (a) que la TCU hace backtracking, (b) que usa el vano bien (6,00 m
   ajustado = 6,00 medido) y (c) que corre pairwise con pendientes a cero
   (0,59° contra el objetivo real en los instantes que discriminan). Lo ÚNICO
   que sigue siendo una suposición es el TÉRMINO DE PENDIENTE: qué hace el
   firmware con 41098/41100/41102/41104 cuando no están a cero. Se verifica
   escribiéndolos en UN seguidor y leyendo su `Objetivo`: si el firmware hace
   lo que el modelo cree, su objetivo se separará del de sus vecinas
   exactamente como aquí se predice; si no, la desviación dirá cómo interpreta
   los registros realmente. Un seguidor, no 754 — y con vuelta atrás trivial.

   POR QUÉ ESTE SEGUIDOR. Se elige el de MÁS pendiente transversal de la NCU
   del volcado (efecto más visible sobre el ruido de ±0,1° del registro), con
   sus dos vanos normales. En NCU12 de Ayora: TCU 26 (TK 026-08), oeste
   −6,91 % / este +7,82 % — separación prevista de HASTA ~4° contra sus
   vecinas en las ventanas de backtracking, 40 veces la resolución.

   QUÉ NO ES. No es una mejora de producción (en Ayora el término vale
   +0,15 % neto): es una VERIFICACIÓN del modelo de firmware, que es lo que
   permite firmar fichas de configuración para plantas donde SÍ valga.       */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PLANTA = arg('planta', 'ayora');
const NCU = +arg('ncu', 12);
const TCU = +arg('tcu', 26);
const FECHA = arg('fecha', '2026-08-30');

const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
             + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(_sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) +
  ';return {solarPos,clearskyIneichen,policyAngles,plantFromCotas,slewLimit};')();

// ficha del seguidor: los registros que hay que escribir
const L = fs.readFileSync(path.join(ROOT, 'config_tcu_' + PLANTA + '.csv'), 'utf-8').trim().split('\n');
const H = L[0].split(','); const ix = n => H.indexOf(n);
let R = null;
for (let i = 1; i < L.length; i++) {
  const c = L[i].split(',');
  if (+c[ix('ncu')] === NCU && +c[ix('tcu')] === TCU) {
    R = { id: c[ix('tracker')], linea: +c[ix('linea')],
      r41098: c[ix('r41098_west_grade_rad')], r41100: c[ix('r41100_west_grade_azimuth_rad')],
      r41102: c[ix('r41102_east_grade_rad')], r41104: c[ix('r41104_east_grade_azimuth_rad')],
      vo: c[ix('r41033_west_pitch_m')], ve: c[ix('r41106_east_pitch_m')],
      po: parseFloat(c[ix('oeste_transv_pct')]), pe: parseFloat(c[ix('este_transv_pct')]) };
    break;
  }
}
if (!R) { console.error('no encuentro NCU ' + NCU + ' TCU ' + TCU + ' en la ficha'); process.exit(2); }

// predicción: objetivo del seguidor CON pendiente vs SIN, y el de una vecina
const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_layout.json'), 'utf-8'));
const LAT = +lay.clat, LON = +lay.clon, ALT = +cotas.base || 0;
// el término de pendiente del TCU es POR SEGUIDOR: se modela con una planta de
// dos parejas (vecina O — seguidor — vecina E) con SUS pendientes de la ficha
const mkT = (con) => ({
  pairs: [
    { slope: con ? Math.atan(R.po / 100) * 180 / Math.PI : 0, pitch: +R.vo || 6, axisTilt: 0 },
    { slope: con ? -Math.atan(R.pe / 100) * 180 / Math.PI : 0, pitch: +R.ve || 6, axisTilt: 0 },
  ],
  cw: +cotas.cuerda || 2.382, axisAz: 0, maxAngle: +cotas.limite || 55,
  gcr: (+cotas.cuerda || 2.382) / (+cotas.pitch || 6), z0: 0.17, nBypass: 2, iam: 0.05,
});
const Tcon = mkT(true), Tsin = mkT(false);
const [Y, M, D] = FECHA.split('-').map(Number);
const day0 = Date.UTC(Y, M - 1, D), doy = Math.round((day0 - Date.UTC(Y, 0, 1)) / 86400000) + 1;

const filas = [];
const prev = { c: null, s: null };
for (let m = 0; m < 1440; m += 10) {
  const g = F.solarPos(day0 + m * 60000, LAT, LON);
  if (g.elev <= 0) continue;
  const irr = F.clearskyIneichen(g.zen, doy, ALT, 3.5);
  const oc = F.policyAngles('pairwise', g.zen, g.az, Tcon, irr, doy, 0.20).angles;
  const os = F.policyAngles('pairwise', g.zen, g.az, Tsin, irr, doy, 0.20).angles;
  prev.c = F.slewLimit(prev.c, oc, 600); prev.s = F.slewLimit(prev.s, os, 600);
  // fila central (índice 1) = el seguidor; θ en convenio TCU (θ<0 = este)
  filas.push({ m, elev: g.elev, con: -prev.c[1], sin: -prev.s[1] });
}
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

console.log('PROTOCOLO · PRUEBA DEL TÉRMINO DE PENDIENTE EN UN SEGUIDOR');
console.log('  planta ' + PLANTA.toUpperCase() + ' · NCU ' + NCU + ' · TCU ' + TCU + ' (' + R.id + ') · día previsto ' + FECHA + ' (horas en UTC, como el volcado)');
console.log('');
console.log('PASO 1 · ANTES DE TOCAR NADA (línea base)');
console.log('  Volcado del día anterior completo de la NCU ' + NCU + ' (como el del 7-ago). Confirmar');
console.log('  con tools/cruce_ncu_dia.mjs que la apertura sigue en el suelo (~0,1°).');
console.log('');
console.log('PASO 2 · ESCRIBIR (solo en TCU ' + TCU + '; anotar hora exacta)');
console.log('  41098 (west grade slope)   = ' + R.r41098 + '   rad   (= ' + R.po.toFixed(2) + ' % transversal oeste)');
console.log('  41100 (west grade azimuth) = ' + R.r41100 + '   rad');
console.log('  41102 (east grade slope)   = ' + R.r41102 + '   rad   (= ' + R.pe.toFixed(2) + ' % transversal este)');
console.log('  41104 (east grade azimuth) = ' + R.r41104 + '   rad');
console.log('  NO tocar 41033/41106 (vanos: ya verificados, ' + R.vo + ' / ' + R.ve + ' m) ni 41014.');
console.log('  Guardar/aplicar según procedimiento del fabricante y dejar el seguidor en AUTO.');
console.log('');
console.log('PASO 3 · OBSERVAR (un día completo con las dos ventanas de backtracking)');
console.log('  La firma que confirma el modelo: el Objetivo del TCU ' + TCU + ' se separa del de sus');
console.log('  vecinas (25 y 27) SOLO en las ventanas de backtracking, así:');
console.log('');
console.log('  hora UTC  elev    Objetivo SIN pendiente   Objetivo CON pendiente   separación prevista');
let enBT = 0;
for (const f of filas) {
  const d = f.con - f.sin;
  if (Math.abs(d) < 0.15) continue;
  enBT++;
  if (f.m % 30) continue;
  console.log('  ' + hhmm(f.m) + '   ' + f.elev.toFixed(1).padStart(5) + '°' +
    (f.sin.toFixed(2) + '°').padStart(18) + (f.con.toFixed(2) + '°').padStart(24) +
    ((d >= 0 ? '+' : '') + d.toFixed(2) + '°').padStart(16));
}
const dmax = Math.max(...filas.map(f => Math.abs(f.con - f.sin)));
console.log('');
console.log('  separación máxima prevista: ' + dmax.toFixed(2) + '° · pasos de 10 min con separación >0,15°: ' + enBT);
console.log('  (la resolución del registro es 0,1°: la firma es ~' + Math.round(dmax / 0.1) + ' veces el ruido)');
console.log('');
console.log('PASO 4 · VEREDICTO');
console.log('  Cruzar el volcado con tools/cruce_ncu_dia.mjs. El TCU ' + TCU + ' debe seguir la columna');
console.log('  «CON pendiente» a <0,6° (la fidelidad ya medida del modelo) mientras las vecinas');
console.log('  siguen la «SIN». Si sigue otra cosa, la desviación dice cómo interpreta el firmware');
console.log('  los registros — que es exactamente lo que se quiere aprender.');
console.log('');
console.log('PASO 5 · VUELTA ATRÁS');
console.log('  Reescribir 41098=0, 41100=0, 41102=0, 41104=0. El seguidor vuelve al estado de toda');
console.log('  la planta. Riesgo mecánico: NINGUNO en ningún caso — el término de pendiente solo');
console.log('  mueve el objetivo dentro de ±' + (+cotas.limite || 55) + '°, los topes duros no se tocan.');
