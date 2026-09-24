/* R4 · FASE 3.4 — LOS DOS LAZOS CONTRA EL EJE DE VERDAD.
 *
 *   node audit4/F3_lazos_campo.mjs [--json=RUTA]
 *
 * 3.4 pide cuál de los dos lazos se parece más a la TCU, y «si hay encoder,
 * careo contra lo real». LO HAY: `tools/fixture_ncu12/TCU_00*.csv` trae, para
 * el 2026-08-07 y seis TCU, la consigna (`target_angle`) Y LA POSICIÓN MEDIDA
 * (`angle`) de la misma máquina. Así que el careo no tiene que ser entre los
 * dos simuladores: puede ser de cada uno contra el eje.
 *
 * SE ALIMENTAN LOS DOS CON LA CONSIGNA DE CAMPO y se mide cuánto se aparta
 * cada uno de la posición que el eje tuvo de verdad. Mismo mando, mismo dt
 * —el real, irregular—, misma semilla.
 *
 * LO QUE ESTE CAREO NO ES. No es una validación del modelo de tracker: la TCU
 * hace cosas que ninguno de los dos lazos modela (posición de seguridad,
 * viento, OFF nocturno), así que esas muestras se EXCLUYEN y el denominador se
 * publica. Tampoco es un día representativo: es UN día, UNA planta, SEIS TCU.
 * Y no decide nada: 3 es preparar la decisión, no tomarla. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bt = fs.readFileSync(ROOT + '/backtracking.html', 'utf8');
const f0 = bt.indexOf('FÍSICA PURA'), f1 = bt.lastIndexOf('/* FIN-FÍSICA');
const fis = bt.slice(bt.lastIndexOf('/*', f0), f1);
const sol = fs.readFileSync(ROOT + '/sol.js', 'utf8') + '\n' + fs.readFileSync(ROOT + '/irradiancia.js', 'utf8');
const P = new Function(sol + fis + '\nreturn {crearLazo,DEADBAND_DEG,TRACKER_SLEW};').call(globalThis);
new Function(fs.readFileSync(ROOT + '/js/control_core.js', 'utf8')).call(globalThis);
const C = globalThis.CTRLCORE;

const DIR = path.join(ROOT, 'tools/fixture_ncu12');
const FICH = fs.readdirSync(DIR).filter(f => /^TCU_\d+_.*\.csv$/.test(f)).sort();

/* ── LECTURA, CON LO QUE SE TIRA CONTADO ────────────────────────────────── */
function lee(f) {
  const crudo = fs.readFileSync(path.join(DIR, f));
  const nul = crudo.filter(b => b === 0).length;
  const lineas = crudo.toString('latin1').split('\n');
  const cab = lineas[0].trim().split(';');
  const filas = [], rotas = [];
  for (let i = 1; i < lineas.length; i++) {
    const L = lineas[i];
    if (!L.trim()) continue;
    if (L.includes('\u0000')) { rotas.push(i); continue; }
    const c = L.trim().split(';');
    if (c.length !== cab.length) { rotas.push(i); continue; }
    const o = {}; cab.forEach((k, j) => o[k] = c[j]);
    const t = Date.parse(o.datetime.replace(' ', 'T') + 'Z');
    const a = parseFloat(o.angle), g = parseFloat(o.target_angle);
    if (!Number.isFinite(t) || !Number.isFinite(a) || !Number.isFinite(g)) { rotas.push(i); continue; }
    filas.push({ t, a, g, estado: o.main_state, seg: o.active_security_position, bt: o.backtracking === 'true' });
  }
  return { filas, rotas, nul, total: lineas.length - 1 };
}

/* ── LOS TRAMOS CAREABLES ───────────────────────────────────────────────────
   Un tramo es una racha seguida de muestras en AUTO y sin posición de
   seguridad, con hueco menor que TOPE_HUECO. Se corta en cuanto la TCU hace
   algo que el lazo no modela, y cada tramo se SIEMBRA con la posición medida:
   arrastrar el error a través de un apagado nocturno mediría el apagado. */
const TOPE_HUECO = 20 * 60 * 1000;                 // 20 min
function tramos(filas) {
  const out = []; let cur = [];
  for (const f of filas) {
    const vale = f.estado === 'AUTO' && f.seg === '0';
    if (!vale) { if (cur.length > 2) out.push(cur); cur = []; continue; }
    if (cur.length && f.t - cur[cur.length - 1].t > TOPE_HUECO) { if (cur.length > 2) out.push(cur); cur = []; }
    cur.push(f);
  }
  if (cur.length > 2) out.push(cur);
  return out;
}

/* ── LOS DOS LAZOS SOBRE UN TRAMO ──────────────────────────────────────────*/
const LOOP = { deadbandDeg: P.DEADBAND_DEG, slewDegS: P.TRACKER_SLEW, cicloSeg: 1, maxAngle: 90 };
function corre(tr) {
  const LZ = P.crearLazo(P.DEADBAND_DEG, P.TRACKER_SLEW, [tr[0].a]);
  let pN = tr[0].a, dN = 0, kN = null, uN = 0;
  const res = [];
  for (let i = 1; i < tr.length; i++) {
    const dt = (tr[i].t - tr[i - 1].t) / 1000;
    const pag = LZ.paso([tr[i].g], dt)[0];
    const r = C.execTramo(pN, tr[i - 1].g, tr[i].g, dt / 60, LOOP, tr[i].bt, dN, kN, uN);
    pN = r.theta; dN = r.dir; kN = r.park; uN = r.dirUlt;
    res.push({ t: tr[i].t, dt, cmd: tr[i].g, real: tr[i].a, pag, nuc: pN });
  }
  return res;
}

/* EL HUECO ENTRE MUESTRAS MANDA, Y HAY QUE PARTIR POR ÉL. Medido en este
   fichero: la mediana del hueco es 10 s, pero 570 de 3.308 huecos pasan de
   300 s (hasta 882 s) — son los saltos de los periodos apagados. Mezclarlos
   con los pasos de 10 s hace que un puñado de saltos largos domine el RMS y
   que la cifra no hable ni de una cosa ni de otra: con el hueco grande el eje
   ya ha llegado hace rato y CUALQUIER lazo acierta, así que el careo se queda
   sin poder de separación justo donde más muestras hay. Se publican las dos
   poblaciones por separado, con su denominador. */
const CORTE_HUECO = 15;                            // s
const nuevo = () => ({ pag: [], nuc: [], quieto: [], mando: [] });
const acum = nuevo(), fino = nuevo(), grueso = nuevo();
let nFilas = 0, nRotas = 0, nNul = 0, nTot = 0, nTramos = 0, nUsadas = 0, nExcl = 0;
const porTcu = [];
for (const f of FICH) {
  const { filas, rotas, nul, total } = lee(f);
  nFilas += filas.length; nRotas += rotas.length; nNul += nul; nTot += total;
  const trs = tramos(filas);
  nTramos += trs.length;
  nExcl += filas.length - trs.reduce((a, t) => a + t.length, 0);
  const mias = { tcu: f, tramos: trs.length, pasos: 0, pag: [], nuc: [] };
  for (const tr of trs) for (const r of corre(tr)) {
    nUsadas++; mias.pasos++;
    const dP = Math.abs(r.pag - r.real), dN = Math.abs(r.nuc - r.real);
    const dQ = Math.abs(tr[0].a - r.real);             // control: un «lazo» que no se mueve
    const dM = Math.abs(r.cmd - r.real);               // control: la consigna cruda, sin lazo
    for (const A of [acum, r.dt <= CORTE_HUECO ? fino : grueso]) {
      A.pag.push(dP); A.nuc.push(dN); A.quieto.push(dQ); A.mando.push(dM);
    }
    mias.pag.push(dP); mias.nuc.push(dN);
  }
  porTcu.push(mias);
}
const rms = a => a.length ? Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length) : NaN;
const mx = a => a.length ? Math.max(...a) : NaN;
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };

console.log('R4 · FASE 3.4 — LOS DOS LAZOS CONTRA EL EJE MEDIDO\n');
console.log(`fuente: tools/fixture_ncu12/ · ${FICH.length} TCU · 2026-08-07`);
console.log('\nLO QUE SE TIRA, Y POR QUÉ');
console.log(`  filas en los ficheros            ${nTot}`);
console.log(`  descartadas por corrupción       ${nRotas}  (${nNul} bytes NUL; UNA línea por fichero, siempre hacia el mismo punto del día — parece un corte del registrador, no del eje)`);
console.log(`  filas legibles                   ${nFilas}`);
console.log(`  excluidas: OFF o posición de seguridad  ${nExcl}  (ninguno de los dos lazos modela eso)`);
console.log(`  pasos careados                   ${nUsadas} en ${nTramos} tramos`);

console.log('\nTEST NULO Y CONTROLES — ¿sabe este careo distinguir algo?');
console.log(`  la posición medida contra sí misma           RMS ${rms(acum.pag.map(() => 0)).toFixed(4)}°  (0 por construcción)`);
console.log(`  un «lazo» que NO se mueve (θ = la semilla)   RMS ${rms(acum.quieto).toFixed(4)}°  máx ${mx(acum.quieto).toFixed(4)}°`);
console.log(`  la consigna CRUDA, sin lazo ninguno          RMS ${rms(acum.mando).toFixed(4)}°  máx ${mx(acum.mando).toFixed(4)}°`);
console.log('  → si los dos lazos no bajan de la consigna cruda, no están aportando nada que medir.');

console.log('\nEL CAREO — |θ del lazo − θ MEDIDO|, partido por el hueco entre muestras');
const bloques = [['TODO', acum], [`hueco ≤ ${CORTE_HUECO} s`, fino], [`hueco > ${CORTE_HUECO} s`, grueso]];
for (const [nm, A] of bloques) {
  console.log(`\n  ${nm}  —  ${A.pag.length} pasos`);
  console.log('    lazo                        RMS        mediana      máx');
  console.log(`    página (crearLazo)      ${rms(A.pag).toFixed(4).padStart(8)}°  ${med(A.pag).toFixed(4).padStart(9)}°  ${mx(A.pag).toFixed(4).padStart(8)}°`);
  console.log(`    núcleo (execTramo, 1 s) ${rms(A.nuc).toFixed(4).padStart(8)}°  ${med(A.nuc).toFixed(4).padStart(9)}°  ${mx(A.nuc).toFixed(4).padStart(8)}°`);
  console.log(`    (control) consigna cruda${rms(A.mando).toFixed(4).padStart(8)}°  ${med(A.mando).toFixed(4).padStart(9)}°  ${mx(A.mando).toFixed(4).padStart(8)}°`);
}

console.log('\n  por TCU (RMS)');
console.log('  fichero                         pasos    página     núcleo');
for (const m of porTcu)
  console.log(`  ${m.tcu.padEnd(30)} ${String(m.pasos).padStart(5)}  ${rms(m.pag).toFixed(4).padStart(8)}°  ${rms(m.nuc).toFixed(4).padStart(8)}°`);

console.log('\nLÍMITES DE ESTA CIFRA, pegados a ella');
console.log('  · UN día, UNA planta, SEIS TCU. No es una validación del modelo.');
console.log('  · El muestreo es IRREGULAR (la mediana del hueco no es el paso de control).');
console.log('  · La TCU adelanta a la consigna, y eso se ve en el dato: hay |ángulo| por');
console.log('    encima del tope de consigna. Es la ley que los dos lazos dicen implementar.');
console.log('  · NO se decide nada aquí. La fase 3 prepara la decisión.');

const dest = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    fuente: 'tools/fixture_ncu12', ficheros: FICH, filas_total: nTot, filas_rotas: nRotas, bytes_nul: nNul,
    filas_legibles: nFilas, excluidas_off_o_seguridad: nExcl, pasos: nUsadas, tramos: nTramos,
    corte_hueco_s: CORTE_HUECO,
    bloques: Object.fromEntries(bloques.map(([nm, A]) => [nm, {
      pasos: A.pag.length,
      rms: { pagina: rms(A.pag), nucleo: rms(A.nuc), quieto: rms(A.quieto), mando_crudo: rms(A.mando) },
      max: { pagina: mx(A.pag), nucleo: mx(A.nuc), quieto: mx(A.quieto), mando_crudo: mx(A.mando) },
    }])),
    por_tcu: porTcu.map(m => ({ tcu: m.tcu, tramos: m.tramos, pasos: m.pasos, rms_pagina: rms(m.pag), rms_nucleo: rms(m.nuc) })),
  }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
