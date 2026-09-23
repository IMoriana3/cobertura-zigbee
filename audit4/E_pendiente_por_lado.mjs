/* R4 · CÓMO SE OBTIENE LA PENDIENTE A CADA LADO DE CADA FILA.
 *
 *   node audit4/E_pendiente_por_lado.mjs [--linea=N] [--json=RUTA]
 *
 * Vuelca la derivación PASO A PASO para una línea concreta de la planta real,
 * con todos los números intermedios, para que se pueda auditar sin leer el
 * código: de las cotas medidas del levantamiento al `slope` que entra en la
 * fórmula de backtracking.
 *
 * No calcula nada nuevo: llama a `plantFromCotas`, que es la misma función que
 * usa la página, y enseña lo que sale. Lo único que reconstruye es el DETALLE
 * del solape, para poder enseñar mesa a mesa lo que la función agrega.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA');
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n'
          + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1)
  + 'return { plantFromCotas, singleaxis, pvTilt, anglesPairwise, solarPos };')();

const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const P = F.plantFromCotas(datos, 500, 0);
const LI = Math.min(Math.max(1, +arg('linea', '3')), P.lineX.length - 2);

console.log('CÓMO SE OBTIENE LA PENDIENTE A CADA LADO DE UNA FILA\n');
console.log(`  planta: Ayora · pitch de proyecto ${datos.pitch} m · cuerda ${datos.cuerda} m · GCR ${datos.gcr}`);
console.log(`  líneas en la banda cargada: ${P.lineX.length} · seguidores en el fichero: ${datos.n_trk}\n`);

console.log('PASO 1 · DE SEGUIDORES A LÍNEAS');
console.log('  Cada seguidor del levantamiento trae 1 o 2 FILAS. De cada fila se miden:');
console.log('    x       posición este-oeste del eje (m)');
console.log('    n[0,1]  las dos puntas, en coordenada norte (m)');
console.log('    y[0,1]  las dos COTAS DEL MÓDULO en esas puntas (m, relativas a la base)');
console.log('  Las filas se agrupan en LÍNEAS por x, con tolerancia medio pitch: una línea');
console.log('  es la sucesión de filas alineadas en la misma x, una detrás de otra en norte.');
console.log('  Luego la planta se parte en BLOQUES por los huecos de x mayores que 2,5·pitch.\n');

console.log('PASO 2 · CADA FILA SON DOS MESAS, separadas por el morro del accionamiento');
console.log('  Si el levantamiento midió el punto del accionamiento (nm/ym) y la fila está');
console.log('  ARTICULADA, el corte va ahí; si no, en el punto medio interpolado. Cada mesa');
console.log('  guarda sus DOS extremos en norte y sus DOS cotas.\n');

/* el detalle del solape, reconstruido para poder enseñarlo */
function detalle(i) {
  const A = P.segs[i], ZA = P.segZ[i], B = P.segs[i + 1], ZB = P.segZ[i + 1];
  const filas = [];
  let acc = 0, w = 0;
  for (let ai = 0; ai < A.length; ai++) for (let bi = 0; bi < B.length; bi++) {
    const lo = Math.max(A[ai][0], B[bi][0]), hi = Math.min(A[ai][1], B[bi][1]);
    if (hi <= lo) continue;
    const mid = (lo + hi) / 2, len = hi - lo;
    const za = ZA[ai][0] + (ZA[ai][1] - ZA[ai][0]) * ((mid - A[ai][0]) / ((A[ai][1] - A[ai][0]) || 1));
    const zb = ZB[bi][0] + (ZB[bi][1] - ZB[bi][0]) * ((mid - B[bi][0]) / ((B[bi][1] - B[bi][0]) || 1));
    acc += (za - zb) * len; w += len;
    filas.push({ ai, bi, lo, hi, len, mid, za, zb, dz: za - zb });
  }
  return { filas, dz: w > 0 ? acc / w : 0, w };
}

/* CONTROL · mi reconstrucción del solape tiene que dar EXACTAMENTE el `pairDz`
   que guarda `plantFromCotas`. Si no, este volcado enseña otra cosa que la que
   usa la página, y no sirve para auditar nada. */
{
  let peor = 0, donde = -1;
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const d = Math.abs(detalle(i).dz - P.pairDz[i]);
    if (d > peor) { peor = d; donde = i; }
  }
  console.log('CONTROL DEL VOLCADO · mi reconstrucción del solape contra el `pairDz` de la función real');
  console.log(`  peor |Δ| en las ${P.lineX.length - 1} parejas: ${peor.toExponential(3)} m` + (donde >= 0 ? ` (pareja ${donde})` : ''));
  if (!(peor < 1e-9)) throw new Error('el volcado NO reproduce lo que la página calcula: no sirve para auditar');
  console.log('  → reproduce lo que la página calcula, así que lo de abajo es auditable.\n');
}

for (const [lado, i] of [['OESTE (pareja ' + (LI - 1) + ')', LI - 1], ['ESTE  (pareja ' + LI + ')', LI]]) {
  const d = detalle(i);
  const dx = P.lineX[i + 1] - P.lineX[i];
  const slope = Math.atan2(d.dz, dx) * 180 / Math.PI;
  console.log(`\n═══ LADO ${lado} de la línea ${LI} ═══`);
  console.log(`  línea ${i} en x=${P.lineX[i].toFixed(3)} m   ·   línea ${i + 1} en x=${P.lineX[i + 1].toFixed(3)} m`);
  console.log(`  mesas: ${P.segs[i].length} en la línea ${i}, ${P.segs[i + 1].length} en la línea ${i + 1}`);
  console.log(`\n  PASO 3 · el Δz se mide SOLO donde las mesas se SOLAPAN en norte, ponderado por ese solape`);
  console.log(`  parejas de mesas con solape: ${d.filas.length}`);
  console.log('    mesa i  mesa i+1   solape n [m]        largo    z(i)      z(i+1)     Δz');
  for (const f of d.filas.slice(0, 8))
    console.log(`    ${String(f.ai).padStart(5)}  ${String(f.bi).padStart(7)}   ${f.lo.toFixed(1).padStart(8)}..${f.hi.toFixed(1).padStart(8)}  ${f.len.toFixed(2).padStart(7)}  ${f.za.toFixed(4).padStart(9)} ${f.zb.toFixed(4).padStart(10)} ${f.dz.toFixed(4).padStart(9)}`);
  if (d.filas.length > 8) console.log(`    … y ${d.filas.length - 8} más`);
  console.log(`\n    Δz ponderado = Σ(Δz·largo) / Σlargo = ${d.dz.toFixed(6)} m   (Σlargo = ${d.w.toFixed(2)} m)`);
  console.log(`\n  PASO 4 · la pendiente transversal de esta pareja`);
  console.log(`    dx = x(${i + 1}) − x(${i}) = ${dx.toFixed(4)} m        ← pitch REAL de este vano, no el de proyecto`);
  console.log(`    slope = atan2(Δz, dx) = ${slope.toFixed(6)}°   (${(100 * Math.tan(slope * Math.PI / 180)).toFixed(4)} %)`);
  console.log(`    CONVENIO: slope > 0  ⟺  la línea del ESTE está MÁS BAJA  ⟺  el terreno sube al OESTE`);
}

console.log(`\n═══ PASO 5 · LA FILA TIENE DOS LADOS, Y SE QUEDA CON EL PEOR ═══`);
const dOe = detalle(LI - 1), dEs = detalle(LI);
const dxO = P.lineX[LI] - P.lineX[LI - 1], dxE = P.lineX[LI + 1] - P.lineX[LI];
const sO = Math.atan2(dOe.dz, dxO) * 180 / Math.PI, sE = Math.atan2(dEs.dz, dxE) * 180 / Math.PI;
const tiltO = (P.tilt[LI - 1] + P.tilt[LI]) / 2, tiltE = (P.tilt[LI] + P.tilt[LI + 1]) / 2;
console.log(`  la línea ${LI} pertenece a DOS parejas: la ${LI - 1} (su lado oeste) y la ${LI} (su lado este).`);
console.log(`  cada pareja resuelve su propio θ con su slope, su pitch y su axisTilt:\n`);
console.log(`    pareja ${LI - 1}:  slope ${sO.toFixed(4)}°  pitch ${dxO.toFixed(3)} m  axisTilt ${tiltO.toFixed(4)}°`);
console.log(`    pareja ${LI}:  slope ${sE.toFixed(4)}°  pitch ${dxE.toFixed(3)} m  axisTilt ${tiltE.toFixed(4)}°`);
console.log(`\n  axisTilt de la pareja = MEDIA de los tilt N-S de sus dos líneas:`);
console.log(`    tilt(${LI - 1})=${P.tilt[LI - 1].toFixed(4)}°  tilt(${LI})=${P.tilt[LI].toFixed(4)}°  tilt(${LI + 1})=${P.tilt[LI + 1].toFixed(4)}°`);

const T = { pairs: [], cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / datos.pitch, z0: 0.17,
            nBypass: 3, rowTilt: P.tilt, groups: null, drive: 'mono' };
for (let i = 0; i < P.lineX.length - 1; i++) {
  const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
  const dd = detalle(i);
  T.pairs.push({ slope: Math.atan2(dd.dz, dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
}
console.log(`\n  y el θ de cada pareja en un instante concreto (21-jun, sol al este, cenit 80°, azimut 95°):`);
const pv = (p) => F.singleaxis(80, 95, { axisTilt: F.pvTilt(p.axisTilt), axisAz: 0, maxAngle: P.maxAngle,
  backtrack: true, gcr: P.cw / p.pitch, crossAxisTilt: p.slope });
const thO = pv(T.pairs[LI - 1]), thE = pv(T.pairs[LI]);
const sg = thO >= 0 ? 1 : -1;
const elegido = sg * thO < sg * thE ? thO : thE;
console.log(`    θ(pareja ${LI - 1}, lado oeste) = ${thO.toFixed(4)}°`);
console.log(`    θ(pareja ${LI}, lado este)  = ${thE.toFixed(4)}°`);
console.log(`    → la fila publica ${elegido.toFixed(4)}°, el MÁS backtrackeado de los dos`);
console.log(`\n    REGLA: no es min|θ|, es min(sg·θ) con sg el lado del sol. Con torsión un`);
console.log(`    candidato puede haber cruzado el cero —−5° backtrackea MÁS que +3°— y`);
console.log(`    min|θ| habría elegido el que sombrea.`);

const dest = arg('json', '');
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ planta: 'ayora', linea: LI, lineX: P.lineX,
    lado_oeste: { pareja: LI - 1, detalle: dOe, dx: dxO, slope: sO, axisTilt: tiltO },
    lado_este: { pareja: LI, detalle: dEs, dx: dxE, slope: sE, axisTilt: tiltE },
    tilts: P.tilt, theta: { oeste: thO, este: thE, publicado: elegido } }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
