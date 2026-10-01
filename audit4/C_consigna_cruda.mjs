/* R4 · ENCARGO C — POR QUÉ LA CONSIGNA CRUDA GANA A LOS DOS MODELOS DE LAZO.
 *
 *   node audit4/C_consigna_cruda.mjs [--json=RUTA]
 *
 * La fase 3 midió, contra el eje de seis TCU reales: página RMS 0,9215°,
 * núcleo 0,6847° y **la consigna cruda, sin lazo ninguno, 0,4867°**. Añadir
 * física EMPEORA la predicción. Eso hay que explicarlo, no taparlo.
 *
 * Tres hipótesis, las tres comprobables y baratas:
 *   C.1  SINCRONÍA — un desfase entre consigna y encoder. Se barre ±5 pasos y
 *        se mira dónde cae el RMS mínimo de cada modelo.
 *   C.2  BANDA MUERTA — se ajusta como parámetro libre. Y la conversión
 *        pulsos→grados NO se da por 1,0°: se busca.
 *   C.3  lo que quede, declarado como residuo no modelable.
 *   C.4  TEST NULO delante: ¿dan los tres modelos predicciones DISTINTAS?
 *
 * NO arregla nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf8');
const f0 = html.indexOf('FÍSICA PURA'), f1 = html.lastIndexOf('/* FIN-FÍSICA');
const fis = html.slice(html.lastIndexOf('/*', f0), f1);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf8');
const P = new Function(sol + fis + 'return { crearLazo, DEADBAND_DEG, TRACKER_SLEW };').call(globalThis);
new Function(fs.readFileSync(path.join(ROOT, 'js/control_core.js'), 'utf8')).call(globalThis);
const C = globalThis.CTRLCORE;

const DIR = path.join(ROOT, 'tools/fixture_ncu12');
const FICH = fs.readdirSync(DIR).filter(f => /^TCU_\d+_.*\.csv$/.test(f)).sort();

function lee(f) {
  const lineas = fs.readFileSync(path.join(DIR, f)).toString('latin1').split('\n');
  const cab = lineas[0].trim().split(';');
  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    const L = lineas[i];
    if (!L.trim() || L.includes('\u0000')) continue;
    const c = L.trim().split(';');
    if (c.length !== cab.length) continue;
    const o = {}; cab.forEach((k, j) => o[k] = c[j]);
    const t = Date.parse(o.datetime.replace(' ', 'T') + 'Z');
    const a = parseFloat(o.angle), g = parseFloat(o.target_angle);
    if (!Number.isFinite(t) || !Number.isFinite(a) || !Number.isFinite(g)) continue;
    filas.push({ t, a, g, e: o.main_state, seg: o.active_security_position, bt: o.backtracking === 'true' });
  }
  return filas;
}
const TOPE_HUECO = 20 * 60 * 1000;
function tramos(filas) {
  const out = []; let cur = [];
  for (const f of filas) {
    const vale = f.e === 'AUTO' && f.seg === '0';
    if (!vale) { if (cur.length > 2) out.push(cur); cur = []; continue; }
    if (cur.length && f.t - cur[cur.length - 1].t > TOPE_HUECO) { if (cur.length > 2) out.push(cur); cur = []; }
    cur.push(f);
  }
  if (cur.length > 2) out.push(cur);
  return out;
}
const TRAMOS = [];
for (const f of FICH) for (const tr of tramos(lee(f))) TRAMOS.push({ tcu: f, tr });

/* ── los tres modelos, con DESFASE y BANDA como parámetros ────────────────
   `desf` es cuántos pasos se adelanta (o atrasa) la CONSIGNA respecto al
   encoder: `desf = +1` significa que al instante k se le atribuye la consigna
   del k+1, o sea que el encoder va RETRASADO respecto al mando. */
function corre(tr, desf, db) {
  const g = i => tr[Math.max(0, Math.min(tr.length - 1, i + desf))].g;
  const LZ = P.crearLazo(db, P.TRACKER_SLEW, [tr[0].a]);
  const loop = { deadbandDeg: db, slewDegS: P.TRACKER_SLEW, cicloSeg: 1, maxAngle: 90 };
  let pN = tr[0].a, dN = 0, kN = null, uN = 0;
  const out = [];
  for (let i = 1; i < tr.length; i++) {
    const dt = (tr[i].t - tr[i - 1].t) / 1000;
    const pag = LZ.paso([g(i)], dt)[0];
    const r = C.execTramo(pN, g(i - 1), g(i), dt / 60, loop, tr[i].bt, dN, kN, uN);
    pN = r.theta; dN = r.dir; kN = r.park; uN = r.dirUlt;
    out.push({ real: tr[i].a, mando: g(i), pag, nuc: pN });
  }
  return out;
}
const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
function evalua(desf, db) {
  const e = { pagina: [], nucleo: [], mando: [] };
  for (const { tr } of TRAMOS) for (const r of corre(tr, desf, db)) {
    e.pagina.push(r.pag - r.real); e.nucleo.push(r.nuc - r.real); e.mando.push(r.mando - r.real);
  }
  return { n: e.pagina.length, pagina: rms(e.pagina), nucleo: rms(e.nucleo), mando: rms(e.mando), crudo: e };
}

const DB0 = P.DEADBAND_DEG;
console.log('R4 · C — POR QUÉ LA CONSIGNA CRUDA GANA\n');
console.log(`  fuente: tools/fixture_ncu12/ · ${FICH.length} TCU · ${TRAMOS.length} tramos · banda canónica ${DB0}°\n`);

/* ── C.4 · TEST NULO, ANTES DE CUALQUIER RECUENTO ────────────────────────── */
const base = evalua(0, DB0);
console.log('C.4 · TEST NULO — ¿dan los tres modelos predicciones DISTINTAS?');
{
  const ref = evalua(0, DB0);
  let igPN = 0, igPM = 0, igNM = 0, n = 0;
  for (const { tr } of TRAMOS) for (const r of corre(tr, 0, DB0)) {
    n++;
    if (Math.abs(r.pag - r.nuc) < 1e-9) igPN++;
    if (Math.abs(r.pag - r.mando) < 1e-9) igPM++;
    if (Math.abs(r.nuc - r.mando) < 1e-9) igNM++;
  }
  console.log(`  instantes: ${n}`);
  console.log(`  página == núcleo   en ${igPN} (${(100 * igPN / n).toFixed(1)} %)`);
  console.log(`  página == mando    en ${igPM} (${(100 * igPM / n).toFixed(1)} %)`);
  console.log(`  núcleo == mando    en ${igNM} (${(100 * igNM / n).toFixed(1)} %)`);
  const peor = Math.max(igPN, igPM, igNM) / n;
  if (peor > 0.5) {
    console.log(`  ⚠ MÁS DE LA MITAD DE LOS INSTANTES COINCIDEN. El RMS no discrimina bien,`);
    console.log('    y eso va DELANTE de cualquier lectura de las cifras de abajo.');
  } else {
    console.log('  → los tres discrepan en la mayoría de los instantes: el RMS sí discrimina.');
  }
}
console.log(`\n  punto de partida (desfase 0, banda ${DB0}°): página ${base.pagina.toFixed(4)}° · núcleo ${base.nucleo.toFixed(4)}° · MANDO ${base.mando.toFixed(4)}°`);

/* ── C.1 · SINCRONÍA ─────────────────────────────────────────────────────── */
console.log('\nC.1 · SINCRONÍA — barrido del desfase consigna↔encoder, ±5 pasos');
console.log('  desfase   página      núcleo      mando (control)');
const barr = [];
for (let d = -5; d <= 5; d++) {
  const e = evalua(d, DB0);
  barr.push({ desf: d, ...e, crudo: undefined });
  console.log(`  ${String(d).padStart(5)}   ${e.pagina.toFixed(4).padStart(8)}°  ${e.nucleo.toFixed(4).padStart(8)}°  ${e.mando.toFixed(4).padStart(8)}°`);
}
const min = k => barr.reduce((a, b) => b[k] < a[k] ? b : a);
console.log(`\n  RMS mínimo · página: desfase ${min('pagina').desf} (${min('pagina').pagina.toFixed(4)}°)`);
console.log(`  RMS mínimo · núcleo: desfase ${min('nucleo').desf} (${min('nucleo').nucleo.toFixed(4)}°)`);
console.log(`  RMS mínimo · mando : desfase ${min('mando').desf} (${min('mando').mando.toFixed(4)}°)`);

/* ── C.2 · BANDA MUERTA COMO PARÁMETRO LIBRE ─────────────────────────────── */
console.log('\nC.2 · BANDA MUERTA como parámetro libre (al desfase que minimiza cada uno)');
console.log('  banda    página      núcleo');
const DBS = [0, 0.1, 0.25, 0.5, 0.75, 1.0, 1.296, 1.5, 2.0, 2.5, 3.0];
const dP = min('pagina').desf, dN = min('nucleo').desf;
const barrDB = [];
for (const db of DBS) {
  const eP = evalua(dP, db), eN = evalua(dN, db);
  barrDB.push({ db, pagina: eP.pagina, nucleo: eN.nucleo });
  console.log(`  ${db.toFixed(3).padStart(6)}°  ${eP.pagina.toFixed(4).padStart(8)}°  ${eN.nucleo.toFixed(4).padStart(8)}°`);
}
const mejorP = barrDB.reduce((a, b) => b.pagina < a.pagina ? b : a);
const mejorN = barrDB.reduce((a, b) => b.nucleo < a.nucleo ? b : a);
console.log(`\n  banda que minimiza · página: ${mejorP.db}° (${mejorP.pagina.toFixed(4)}°)`);
console.log(`  banda que minimiza · núcleo: ${mejorN.db}° (${mejorN.nucleo.toFixed(4)}°)`);
console.log(`  el canónico de la casa es ${DB0}°, y el control (mando crudo) está en ${base.mando.toFixed(4)}°`);

/* ── C.2b · LA PARTICIÓN QUE EL PROPIO REGISTRO PIDE ───────────────────────
   El 41061 se llama, literalmente, «Deadband when backtracking **is active**»
   (`tools/modbus_src/tcu_v6.json`), y en el mapa NO HAY ningún registro para la
   banda fuera del backtracking. O sea que el canónico de 1,0° de la casa sale
   de un registro que, por su propia descripción, solo manda durante el BT.
   Si la TCU usa una banda distinta fuera, ajustar UNA banda a TODA la muestra
   mezcla dos regímenes. Se parte por la señal `backtracking` del propio
   fichero y se ajusta cada mitad por separado. */
function evaluaSub(desf, db, filtro) {
  const e = { pagina: [], nucleo: [], mando: [] };
  for (const { tr } of TRAMOS) {
    const r = corre(tr, desf, db);
    for (let i = 1; i < tr.length; i++) {
      if (!filtro(tr[i])) continue;
      const x = r[i - 1];
      e.pagina.push(x.pag - x.real); e.nucleo.push(x.nuc - x.real); e.mando.push(x.mando - x.real);
    }
  }
  if (!e.pagina.length) return null;
  return { n: e.pagina.length, pagina: rms(e.pagina), nucleo: rms(e.nucleo), mando: rms(e.mando) };
}
console.log('\nC.2b · PARTIDO POR LA SEÑAL `backtracking` DEL PROPIO FICHERO');
console.log('  (el 41061 se llama «Deadband when backtracking IS ACTIVE», y en el mapa no hay');
console.log('   ningún registro para la banda fuera del BT)');
const SUB = [['BT activo', f => f.bt], ['BT inactivo', f => !f.bt]];
const subRes = {};
for (const [nm, filtro] of SUB) {
  const n0 = evaluaSub(0, DB0, filtro);
  if (!n0) { console.log(`  ${nm}: SIN MUESTRAS`); continue; }
  console.log(`\n  ${nm} — ${n0.n} instantes · mando crudo ${n0.mando.toFixed(4)}°`);
  console.log('    banda    página      núcleo');
  const fila = [];
  for (const db of DBS) {
    const e = evaluaSub(0, db, filtro);
    fila.push({ db, pagina: e.pagina, nucleo: e.nucleo });
    console.log(`    ${db.toFixed(3).padStart(6)}°  ${e.pagina.toFixed(4).padStart(8)}°  ${e.nucleo.toFixed(4).padStart(8)}°`);
  }
  const mP = fila.reduce((a, b) => b.pagina < a.pagina ? b : a), mN = fila.reduce((a, b) => b.nucleo < a.nucleo ? b : a);
  console.log(`    → banda que minimiza: página ${mP.db}° (${mP.pagina.toFixed(4)}°) · núcleo ${mN.db}° (${mN.nucleo.toFixed(4)}°)`);
  subRes[nm] = { n: n0.n, mando: n0.mando, barrido: fila, mejor_pagina: mP, mejor_nucleo: mN };
}

const dest = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ficheros: FICH, tramos: TRAMOS.length, banda_canonica: DB0,
    base: { n: base.n, pagina: base.pagina, nucleo: base.nucleo, mando: base.mando },
    barrido_desfase: barr.map(b => ({ desf: b.desf, n: b.n, pagina: b.pagina, nucleo: b.nucleo, mando: b.mando })),
    barrido_banda: barrDB, mejor: { pagina: mejorP, nucleo: mejorN }, por_backtracking: subRes }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
