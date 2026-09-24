/* PASO 3 · R-1 — EFECTO DE CORREGIR EL θ DE LÍNEA DE `produccion.html` CON MESAS
 *
 * Con mesas, `produccion.html` sacaba su θ de LÍNEA de `policyAngles` (que acopla
 * las dos líneas enteras de cada grupo) y no de las mesas que manda la página.
 * Ese θ de línea entra en la energía por UN camino: la ganancia BIFACIAL por
 * string (`tiltRow`, `produccion.html:1275` → `mapStringW`, `:1585`).
 *
 * Se mide con la MISMA física (la de esta rama) y dos `produccion.html`: el de
 * BASE (sin la corrección) y el de hoy. Así lo que cambia es solo la tarjeta.
 *   · TEST NULO: con φ = 0 (monofacial, el valor de arranque) la energía tiene
 *     que salir IDÉNTICA — si no, el θ de línea entra por otro camino.
 *   · MEDIDA: φ = 75 %, albedo 0,25, Ayora real (cotas), 21-jun, paso 15 min,
 *     pairwise y row (lazo apagado, como el arranque de la página).
 *
 *     node audit5/P3_prod_bifacial.mjs [--base=origin/claude/refundacion-p2-6th1im]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CFG0 } from '../tools/gen_golden_anual.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=origin/claude/refundacion-p2-6th1im').slice(7);
const leer = f => fs.readFileSync(path.join(ROOT, f), 'utf-8');
const bt = leer('backtracking.html');
const sol = leer('sol.js') + '\n' + leer('irradiancia.js');
const ctrl = leer(path.join('js', 'control_core.js'));
const fis = bt.slice(bt.lastIndexOf('/*', bt.indexOf('FÍSICA PURA')), bt.indexOf('/* FIN-FÍSICA'));

function carga(pg) {
  const l0 = pg.indexOf('LÓGICA PURA'), l1 = pg.indexOf('/* FIN-LÓGICA');
  const log = pg.slice(pg.lastIndexOf('/*', l0), l1);
  return new Function(ctrl + sol + fis + log + `
    return {F:{poaPlant,anglesPairwise,anglesManual,skyWithClouds,pairsFromElevX,nsSegments,plantFromCotas,
               policyAngles,policyAnglesSeg,poaPlantSeg,anglesAstro,anglesAstroSeg,
               westPorMesa,ejesPorMesa,surfaceOrient,segLineMean,clearskyIneichen},
            buildTReal, dayEnergy, mapStringW};`).call(globalThis);
}
const HOY = carga(leer('produccion.html'));
const VIEJO = carga(execFileSync('git', ['show', BASE + ':produccion.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }));

const cot = JSON.parse(leer('ayora_cotas.json')), lay = JSON.parse(leer('ayora_layout.json'));
function dia(S, pol, bifa) {
  const P = S.F.plantFromCotas(cot, 80, null);
  const c = JSON.parse(JSON.stringify({ ...CFG0, plant: 'ayora', lat: lay.clat, lon: lay.clon, alt: Math.round(cot.base),
    nrows: P.elev.length, cw: P.cw, maxang: P.maxAngle, pitch: P.pitch, albedo: 0.25, pol,
    bif: { bifa, perdTras: 10 }, ac: { ...CFG0.ac, planta: {} } }));
  const T = S.buildTReal(S.F, c, P);
  const map = S.mapStringW(S.F, c, T);
  const v = S.dayEnergy(S.F, c, T, c.date, 15, map);
  return { tot: v.reduce((a, b) => a + b, 0), v };
}
const out = { base: BASE, fecha: CFG0.date, paso_min: 15, planta: 'ayora (cotas)', filas: [] };
for (const pol of ['pairwise', 'row']) {
  for (const bifa of [0, 75]) {
    const a = dia(VIEJO, pol, bifa), b = dia(HOY, pol, bifa);
    let peor = 0; for (let k = 0; k < a.v.length; k++) peor = Math.max(peor, Math.abs(b.v[k] - a.v[k]) / Math.max(1e-12, Math.abs(a.v[k])));
    const f = { pol, bifa, strings: a.v.length, base_kWh: a.tot, hoy_kWh: b.tot, delta_pct: 100 * (b.tot - a.tot) / a.tot, peor_string_pct: 100 * peor, identico: a.v.every((x, k) => x === b.v[k]) };
    out.filas.push(f);
    console.log(`${pol.padEnd(9)} φ=${String(bifa).padStart(2)} %  base ${a.tot.toFixed(4)} kWh · hoy ${b.tot.toFixed(4)} kWh · Δ ${f.delta_pct.toFixed(4)} % · peor string ${f.peor_string_pct.toFixed(4)} % · ${f.identico ? 'IDÉNTICO bit a bit' : 'distinto'} (${a.v.length} strings)`);
  }
}
const nulo = out.filas.filter(f => f.bifa === 0);
console.log(nulo.every(f => f.identico) ? 'TEST NULO: con φ=0 idéntico bit a bit — el θ de línea solo entra por la bifacial'
                                        : 'TEST NULO ROJO: con φ=0 la energía cambia — el θ de línea entra por otro camino');
const dst = process.argv.find(a => a.startsWith('--json='));
if (dst) fs.writeFileSync(path.join(ROOT, dst.slice(7)), JSON.stringify(out, null, 1));
