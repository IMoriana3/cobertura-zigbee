/* BT3D · FASE 0 (decisión 2 del titular) — CUÁNTO CUESTA EN EL ANUAL EL DEFECTO DE `conoHaz`.
 *
 *   node audit5/F0_conohaz_anual.mjs --pol=pairwise [--json=RUTA]
 *
 * La página NO se toca. Se cargan DOS simuladores del mismo texto: el de la
 * página tal cual y el mismo con la línea de `conoHaz` puesta como dice su
 * comentario (`lib_conohaz.mjs`). El bucle es el anual de la página, `yearbtn`
 * (réplica de audit4/D_anual_ayora.mjs, ruta por línea): días 21 de cada mes,
 * paso 10 min, un lazo por día, `policyAngles → crearLazo → poaPlant`, peso
 * DIM/1000, banda de la página (`plantFromCotas(datos, 80, 0)`), UTC+1 fijo.
 *
 * TEST NULO / ATAJO EXACTO: se cuentan las llamadas a `conoHaz` del simulador de
 * la página en cada instante. Mientras las dos cadenas hayan dado hasta ese
 * momento ángulos idénticos y la de la página NO haya llamado a `conoHaz` en el
 * instante, la corregida sigue el MISMO camino con las MISMAS entradas y da lo
 * mismo: no se recalcula (se cuenta como «idéntico por construcción»). En cuanto
 * difieren una vez, se calculan las dos en todos los instantes que siguen del día.
 * CONTROL: `--sin-atajo` calcula siempre las dos; en un mes de muestra tiene que
 * dar lo mismo que con el atajo.
 * Punto de control por mes (un reinicio del contenedor no se lleva lo corrido).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { parcheCorrecto, parcheContador } from './lib_conohaz.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const POL = arg('pol', 'pairwise'), SIN_ATAJO = process.argv.includes('--sin-atajo');
const MESES = arg('meses', '1-12').split('-').map(Number);
const DEST = arg('json', `audit5/out/F0_conohaz_anual_${POL}${SIN_ATAJO ? '_sinatajo' : ''}.json`);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const EXTRA = ['poaPlant', 'crearLazo'];
const A = cargaSimulador(ROOT, EXTRA, parcheContador);                          // la página (con contador)
const B = cargaSimulador(ROOT, EXTRA, h => parcheContador(parcheCorrecto(h)));  // la de su comentario
const TA = terrenoComoLaPagina(A.F, datos, 80, 0).T, TB = terrenoComoLaPagina(B.F, datos, 80, 0).T;
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, ALB = 0.2, TZ = 1, PASO = 10;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let prev = null; try { prev = JSON.parse(fs.readFileSync(path.resolve(ROOT, DEST), 'utf-8')); } catch (e) {}
const R = (prev && prev.pol === POL && prev.ver === A.VER) ? prev : { pol: POL, ver: A.VER, sin_atajo: SIN_ATAJO, meses: [], paso_min: PASO, banda: `${TA.pairs.length + 1} líneas · ${TA.segs.reduce((s, l) => s + l.length, 0)} mesas`,
  maquina: { cpu: os.cpus().length, carga_al_empezar: os.loadavg() } };
console.error(`${A.VER} · ${POL} · ${R.banda} · ${SIN_ATAJO ? 'SIN atajo' : 'con atajo'} · carga ${os.loadavg().map(v => v.toFixed(2)).join('/')} · ya hechos ${R.meses.length} meses`);
for (let mo = MESES[0] - 1; mo < MESES[1]; mo++) {
  if (R.meses.some(m => m.mes === mo + 1)) continue;
  const t0 = Date.now(), ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = A.F.doyOf(ds), dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  const LA = A.F.crearLazo(), LB = B.F.crearLazo();
  let eA = 0, eB = 0, inst = 0, conLlamada = 0, llamadas = 0, calcB = 0, dthMax = 0, iguales = true;
  for (let m = 0; m < 1440; m += PASO) {
    const g = A.F.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    inst++;
    const irr = A.F.clearskyIneichen(g.zen, doy, ALT, TL), w = (PASO / 60) / 1000 * DIM[mo];
    globalThis.__conoHaz = 0;
    const mandoA = A.F.policyAngles(POL, g.zen, g.az, TA, irr, doy, ALB).angles;
    const limA = LA.paso(mandoA, PASO * 60);
    const pA = A.F.poaPlant(g.zen, g.az, TA, limA, irr, doy, ALB).plant;
    const n = globalThis.__conoHaz; llamadas += n; if (n) conLlamada++;
    eA += pA * w;
    if (!SIN_ATAJO && iguales && n === 0) { LB.paso(mandoA.slice(), PASO * 60); eB += pA * w; continue; }   // mismo camino, mismas entradas
    calcB++;
    const limB = LB.paso(B.F.policyAngles(POL, g.zen, g.az, TB, irr, doy, ALB).angles, PASO * 60);
    const pB = B.F.poaPlant(g.zen, g.az, TB, limB, irr, doy, ALB).plant;
    eB += pB * w;
    for (let i = 0; i < limA.length; i++) { const d = Math.abs(limA[i] - limB[i]); dthMax = Math.max(dthMax, d); if (d > 0) iguales = false; }
  }
  R.meses.push({ mes: mo + 1, instantes: inst, instantes_con_llamada: conLlamada, llamadas, instantes_B_calculados: calcB, pagina: eA, corregida: eB, dth_max: dthMax, s: (Date.now() - t0) / 1000 });
  R.meses.sort((a, b) => a.mes - b.mes);
  fs.writeFileSync(path.resolve(ROOT, DEST), JSON.stringify(R, null, 1));
  console.error(`  mes ${mo + 1}: página ${eA.toFixed(4)} · corregida ${eB.toFixed(4)} · Δ ${(100 * (eB - eA) / eA).toFixed(4)} % · |Δθ| máx ${dthMax.toFixed(3)}° · ${conLlamada}/${inst} instantes llaman a conoHaz · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const tot = k => R.meses.reduce((s, m) => s + m[k], 0);
console.log(`${POL.padEnd(9)} meses ${R.meses.length}/12 · anual página ${tot('pagina').toFixed(4)} · corregida ${tot('corregida').toFixed(4)} kWh/m² · Δ ${(100 * (tot('corregida') - tot('pagina')) / tot('pagina')).toFixed(4)} % · |Δθ| máx ${Math.max(...R.meses.map(m => m.dth_max)).toFixed(3)}° · instantes que llaman a conoHaz ${tot('instantes_con_llamada')} de ${tot('instantes')} · ${tot('s').toFixed(0)} s`);
