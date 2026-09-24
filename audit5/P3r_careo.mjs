/* PASO 3 REFORMULADO · el careo contra `optimal` EN TRES COLUMNAS, desde el
 * detalle por mesa·instante de audit5/P3r_criterio.mjs.
 *
 *   node audit5/P3r_careo.mjs
 *
 * «Pierde frente a optimal» mezcla tres cosas, y solo una es el defecto buscado
 * (apunte del titular). Cada mesa·instante se clasifica por su diferencia de
 * pérdida por sombra con optimal, ds = pérdida(pol) − pérdida(optimal):
 *   · SOMBRA   (ds > ε): la política sombrea MÁS que optimal → su trabajo de
 *     no-sombra no se hace;
 *   · AOI      (|ds| ≤ ε): las dos sombrean igual; lo que falta es ángulo de
 *     incidencia → el DESAJUSTE DE CRITERIO;
 *   · OBJETIVO (ds < −ε): optimal ACEPTA más sombra a propósito para ganar haz →
 *     diferencia de objetivo, NO defecto: se DESCUENTA.
 * En cada columna va la diferencia NETA de esas mesas·instante (Δneta = ΔPOA₀ −
 * ds), y además su parte de ángulo y de sombra. Las tres columnas suman el Δ
 * total exacto (cierre publicado). ε = 1e-12 kWh/m² por mesa·instante.
 * TEST NULO: optimal contra sí mismo → todo en AOI con Δ = 0 exacto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit5', 'out');
const SUF = (process.argv.find(a => a.startsWith('--sufijo=')) || '').slice(9);   // otra página: careo contra SU optimal
const bin = (p, m) => { const f = path.join(OUT, `P3r_mesa_${p}_${m}${SUF}.bin`); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); return new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8); };
const POLS = ['optimal', 'optfree', 'pairwise', 'true3d', 'row', 'global', 'bt2d', 'astro', 'mgl', 'coordinada'];
const EPS = 1e-12, filas = [];
const pc = (v, ref) => (100 * v / ref).toFixed(3) + ' %';
for (const m of [6, 12]) {
  const R = bin('optimal', m); if (!R) { console.log(`21-${m === 6 ? 'jun' : 'dic'}: falta optimal`); continue; }
  let Eref = 0; for (let i = 0; i < R.length; i += 3) Eref += R[i];
  console.log(`\n21-${m === 6 ? 'jun' : 'dic'} · optimal ${Eref.toFixed(6)} kWh/m² · Δ frente a optimal, en tres columnas (neta; entre paréntesis ángulo / sombra)`);
  console.log('política     Δ total            SOMBRA (su no-sombra falla)        AOI (desajuste de criterio)        OBJETIVO (optimal acepta sombra: se descuenta)   mesas·inst S/A/O');
  for (const p of POLS) {
    const X = bin(p, m); if (!X) { console.log(`${p.padEnd(9)}   NO MEDIDO`); continue; }
    if (X.length !== R.length) { console.log(`${p.padEnd(9)}   distinto número de mesas·instante (${X.length / 3} frente a ${R.length / 3})`); continue; }
    const col = { S: [0, 0, 0, 0], A: [0, 0, 0, 0], O: [0, 0, 0, 0] };   // [neta, ángulo, sombra, n]
    let tot = 0;
    for (let i = 0; i < X.length; i += 3) {
      const dv = X[i] - R[i], dA = X[i + 1] - R[i + 1], ds = X[i + 2] - R[i + 2];
      const k = ds > EPS ? 'S' : ds < -EPS ? 'O' : 'A';
      col[k][0] += dv; col[k][1] += dA; col[k][2] += -ds; col[k][3]++; tot += dv;
    }
    const cierre = tot - (col.S[0] + col.A[0] + col.O[0]);
    const f = { pol: p, mes: m, Eref, dTotal: tot, sombra: col.S, aoi: col.A, objetivo: col.O, cierre };
    filas.push(f);
    const c = x => `${x[0].toFixed(5).padStart(9)} (${pc(x[0], Eref).padStart(8)}; ${x[1].toFixed(5)} / ${x[2].toFixed(5)})`;
    console.log(`${p.padEnd(9)} ${tot.toFixed(5).padStart(9)} (${pc(tot, Eref).padStart(8)})  ${c(col.S)}  ${c(col.A)}  ${c(col.O)}  ${col.S[3]}/${col.A[3]}/${col.O[3]}${Math.abs(cierre) > 1e-9 ? ' · CIERRE ' + cierre.toExponential(1) : ''}`);
  }
}
const nulo = filas.filter(f => f.pol === 'optimal');
console.log('\nTEST NULO · optimal contra sí mismo: ' + (nulo.length && nulo.every(f => f.dTotal === 0 && f.sombra[3] === 0 && f.objetivo[3] === 0) ? 'Δ = 0 exacto, todo en AOI con 0' : 'NO DA CERO'));
fs.writeFileSync(path.join(OUT, `P3r_careo${SUF}.json`), JSON.stringify(filas, null, 1));
