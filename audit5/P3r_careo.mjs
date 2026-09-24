/* PASO 3 REFORMULADO · el careo contra `optimal`, desde las salidas de
 * audit5/P3r_criterio.mjs.
 *
 *   node audit5/P3r_careo.mjs
 *
 * Para cada política y día: Δ = E(pol) − E(optimal), partido en
 *   · SOMBRA: −(pérdida por sombra de pol − la de optimal);
 *   · ÁNGULO: POA₀(pol) − POA₀(optimal) (haz, circunsolar y cielo+suelo).
 * `optimal` decide con la misma función con que se cobra, así que su distancia a
 * cada política dice cuánto cuesta decidir con otro criterio, y por qué vía: por
 * lo que el criterio mira (sombra) o por lo que no mira (ángulo).
 * TEST NULO: optimal contra sí mismo, Δ = 0 exacto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit5', 'out');
const lee = (p, m) => { const f = path.join(OUT, `P3r_criterio_${p}_${m}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null; };
const POLS = ['optimal', 'optfree', 'pairwise', 'true3d', 'row', 'global', 'bt2d', 'astro', 'mgl'];
const filas = [];
for (const m of [6, 12]) {
  const ref = lee('optimal', m); if (!ref) { console.log(`21-${m === 6 ? 'jun' : 'dic'}: falta optimal`); continue; }
  const P0 = x => x.beam + x.circ + x.skygnd, S = x => x.perdB + x.perdC;
  console.log(`\n21-${m === 6 ? 'jun' : 'dic'} · referencia optimal ${ref.E.toFixed(6)} kWh/m² (sombra ${S(ref).toFixed(6)})`);
  console.log('política   ΔE vs optimal          = ÁNGULO (haz · circ · cielo+suelo)                    + SOMBRA          · sombra propia');
  for (const p of POLS) {
    const x = lee(p, m); if (!x) { console.log(`${p.padEnd(9)}  NO MEDIDO`); continue; }
    const dE = x.E - ref.E, dA = P0(x) - P0(ref), dS = -(S(x) - S(ref)), pc = v => (100 * v / ref.E).toFixed(3) + ' %';
    const f = { pol: p, mes: m, E: x.E, dE, dAngulo: dA, dHaz: x.beam - ref.beam, dCirc: x.circ - ref.circ, dSkyGnd: x.skygnd - ref.skygnd, dSombra: dS, sombra: S(x), cierre: dE - dA - dS };
    filas.push(f);
    console.log(`${p.padEnd(9)} ${dE.toFixed(6).padStart(10)} (${pc(dE).padStart(9)}) = ${dA.toFixed(6).padStart(10)} (${pc(dA).padStart(9)}: ${f.dHaz.toFixed(5)} · ${f.dCirc.toFixed(5)} · ${f.dSkyGnd.toFixed(5)}) + ${dS.toFixed(6).padStart(10)} (${pc(dS).padStart(8)}) · ${S(x).toFixed(6)}${Math.abs(f.cierre) > 1e-9 ? ' · CIERRE ' + f.cierre.toExponential(1) : ''}`);
  }
}
const nulo = filas.filter(f => f.pol === 'optimal');
console.log('\nTEST NULO · optimal contra sí mismo: ' + (nulo.length && nulo.every(f => f.dE === 0 && f.dAngulo === 0 && f.dSombra === 0) ? 'Δ = 0 exacto' : 'NO DA CERO'));
fs.writeFileSync(path.join(OUT, 'P3r_careo.json'), JSON.stringify(filas, null, 1));
