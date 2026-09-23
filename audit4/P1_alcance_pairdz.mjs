/* R4 · P1 — ¿`pairDz` es POR FILA o POR LÍNEA ENTERA?
 *   node audit4/P1_alcance_pairdz.mjs
 * Las citas se imprimen LEYENDO el fichero (E-X1-C3: una cita sin mirar viaja).
 * El volcado usa la reconstrucción del verificador, cuya correspondencia con
 * el simulador es exacta (control de F_sombra_extremos: Δx = Δn = Δz = 0).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_publicado.mjs';
import { lineasDesdeCotas } from './lib_sombra_geo.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8').split('\n');
const cita = (a, b) => { for (let i = a; i <= b; i++) console.log(`  ${String(i).padStart(5)}│ ${SRC[i - 1]}`); };
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const { F, VER } = cargaSimulador(ROOT);
const { P } = terrenoComoLaPagina(F, datos, 500, 0);
const LIN = lineasDesdeCotas(datos, 0);

console.log(`P1 · ALCANCE DE pairDz (${VER})\n\nEL COMENTARIO que describe el cálculo:`);
cita(1729, 1732);
console.log(`\nEL BUCLE y su acumulador (acc, w): recorre TODAS las mesas A de la línea i contra TODAS las B de la i+1:`);
cita(1733, 1745);
console.log(`\nEL CONTRATO DE SALIDA de la ruta por línea: un θ por LÍNEA`);
cita(1185, 1187);
cita(3763, 3763);

/* volcado: por pareja, cuántos solapes y cuántas FILAS distintas de cada línea
   entran en su único Δz, y si ese Δz es el del solape norte (lo que dice el
   comentario) */
const zAt = (S, Z, v) => Z[0] + (Z[1] - Z[0]) * ((v - S[0]) / ((S[1] - S[0]) || 1));
let difNorte = 0, maxDif = 0; const filasPorPar = [];
const detalle = {};
for (let i = 0; i < P.segs.length - 1; i++) {
  const A = P.segs[i], B = P.segs[i + 1], ZA = P.segZ[i], ZB = P.segZ[i + 1];
  const sol = [];
  for (let a = 0; a < A.length; a++) for (let b = 0; b < B.length; b++) {
    const lo = Math.max(A[a][0], B[b][0]), hi = Math.min(A[a][1], B[b][1]);
    if (hi <= lo) continue;
    const mid = (lo + hi) / 2;
    sol.push({ a, b, lo, hi, len: hi - lo, dz: zAt(A[a], ZA[a], mid) - zAt(B[b], ZB[b], mid), fa: LIN[i].mesas[a].fila, fb: LIN[i + 1].mesas[b].fila });
  }
  const w = sol.reduce((s, x) => s + x.len, 0), m = sol.reduce((s, x) => s + x.dz * x.len, 0) / (w || 1);
  const norte = sol.reduce((q, x) => (!q || x.hi > q.hi) ? x : q, null);
  const d = Math.abs(norte.dz - P.pairDz[i]); if (d > 1e-9) difNorte++; maxDif = Math.max(maxDif, d);
  const fA = new Set(sol.map(x => x.fa)), fB = new Set(sol.map(x => x.fb));
  filasPorPar.push(fA.size + fB.size);
  if (i === 2 || i === 3) detalle[i] = { sol, m, w, fA, fB, norte };
  if (Math.abs(m - P.pairDz[i]) > 1e-12) throw new Error(`pareja ${i}: el volcado no reproduce pairDz`);
}
filasPorPar.sort((a, b) => a - b);
console.log(`\nVOLCADO · ${P.segs.length - 1} parejas`);
console.log(`  filas distintas (de las dos líneas) que entran en el ÚNICO Δz de cada pareja: mín ${filasPorPar[0]} · mediana ${filasPorPar[Math.floor(filasPorPar.length / 2)]} · máx ${filasPorPar[filasPorPar.length - 1]}`);
console.log(`  ¿pairDz = Δz del solape NORTE, como dice el comentario? difiere en ${difNorte} de ${P.segs.length - 1} parejas (peor ${maxDif.toFixed(4)} m)`);
for (const i of [2, 3]) {
  const D = detalle[i];
  console.log(`\n  pareja ${i} (líneas ${i}/${i + 1}): ${D.sol.length} solapes · ${D.fA.size} filas de la línea ${i} + ${D.fB.size} de la ${i + 1} · Σlen ${D.w.toFixed(3)} m · pairDz ${P.pairDz[i].toFixed(6)} m · solape norte ${D.norte.dz.toFixed(6)} m`);
  console.log(`    ${'fila a'.padEnd(10)} ${'fila b'.padEnd(10)} ${'n desde'.padStart(10)} ${'n hasta'.padStart(10)} ${'len'.padStart(8)} ${'Δz medio'.padStart(9)} ${'peso'.padStart(7)}`);
  for (const x of D.sol) console.log(`    ${String(x.fa).padEnd(10)} ${String(x.fb).padEnd(10)} ${x.lo.toFixed(3).padStart(10)} ${x.hi.toFixed(3).padStart(10)} ${x.len.toFixed(3).padStart(8)} ${x.dz.toFixed(4).padStart(9)} ${(x.len / D.w).toFixed(4).padStart(7)}`);
}
