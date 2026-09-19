#!/usr/bin/env node
/* A.4 — agregador de `poaPlantSeg`: ¿pondera por mesa, por área, por módulos, o
   promedia como `poaPlant`? Verificación numérica con mesas de LARGO DISTINTO.
   Ejecutable:  node audit2/A4_poaplantseg.mjs                                  */
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const F = motorDe('HEAD');
const T = caso(F, 'B');
/* se parte cada fila en DOS mesas de largo muy distinto (10 m y 50 m) para que
   una media simple y una media ponderada por largo NO puedan coincidir */
const L = 2 * 28 * 1.146 + 0.55;
T.segs = []; for (let r = 0; r < 6; r++) T.segs.push([[-L / 2, -L / 2 + 10], [-L / 2 + 10, L / 2]]);
console.log(echo('E-A4 · agregador de poaPlantSeg', F, T).texto);
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const ang = [-2, -2, 15.9, -2, -2, 38.1];
const seg = ang.map(a => [a, a]);                       // mismo θ en las dos mesas de cada fila
const ps = F.poaPlantSeg(g.zen, g.az, T, seg, irr, CANON.doy, CANON.albedo);
console.log(`largos de mesa por fila: ${T.segs[0].map(s => (s[1]-s[0]).toFixed(2) + ' m').join(' + ')}  (total ${L.toFixed(2)} m)`);
console.log(`\n  fila   POA mesa 0 (10 m)   POA mesa 1 (${(L-10).toFixed(1)} m)   media SIMPLE   media PONDERADA por largo   poaPlantSeg.rows[r]`);
let okPond = true, okSimple = true;
for (let r = 0; r < 6; r++) {
  const v = ps.segs[r], w = T.segs[r].map(s => s[1] - s[0]);
  const simple = (v[0] + v[1]) / 2;
  const pond = (v[0] * w[0] + v[1] * w[1]) / (w[0] + w[1]);
  if (Math.abs(ps.rows[r] - pond) > 1e-9) okPond = false;
  if (Math.abs(ps.rows[r] - simple) > 1e-9) okSimple = false;
  console.log(`   ${r}    ${v[0].toFixed(6).padStart(15)}   ${v[1].toFixed(6).padStart(18)}   ${simple.toFixed(6).padStart(12)}   ${pond.toFixed(6).padStart(24)}   ${ps.rows[r].toFixed(6).padStart(18)}`);
}
console.log(`\n¿rows[r] == media ponderada por LARGO de mesa?  ${okPond ? 'SÍ (|Δ| < 1e-9 en las 6 filas)' : 'NO'}`);
console.log(`¿rows[r] == media SIMPLE de las mesas?          ${okSimple ? 'SÍ' : 'NO'}`);
const n = seg.length;
console.log(`\nplanta = ${ps.plant.toFixed(6)}   ·   suma(rows)/nFilas = ${(ps.rows.reduce((a,b)=>a+b,0)/n).toFixed(6)}   ⇒ media por FILA sin ponderar: ${Math.abs(ps.plant - ps.rows.reduce((a,b)=>a+b,0)/n) < 1e-12 ? 'SÍ' : 'NO'}`);
console.log(`\nMÓDULOS / ÁREA: el peso es \`len = line[k][1]-line[k][0]\` (metros de mesa). No interviene`);
console.log(`ni el nº de módulos ni la cuerda: búsqueda exhaustiva con  grep -nE "mods|nModulos|area|cw\\\\b"  sobre`);
console.log(`backtracking.html:2698-2723 (cuerpo de poaPlantSeg) ⇒ sin coincidencias.`);
