/* BT3D · FASE 0 — ¿EL CONO DE HAZ DE `conoHaz` ES EL DE SU COMENTARIO?
 *
 *   node audit5/F0_conohaz.mjs
 *
 * `conoHaz` (backtracking.html:1026-1036) dice: «cos AOI = cos(θ − ψ)·cos λ, con
 * sin λ = s·a» y calcula `sa = sin Z·cos ΔA·sin τ + cos Z·cos τ` (:1030). Con el
 * eje a = (sin A·cos τ, cos A·cos τ, sin τ) (eje hacia el norte, que sube con
 * τ), s·a = sin Z·cos ΔA·cos τ + cos Z·sin τ: el código lleva seno y coseno de τ
 * cambiados. Aquí no se discute la fórmula: se MIDE el cono verdadero —los θ
 * con AOI ≤ AOI_HAZ, AOI calculado con la normal del MOTOR, `marcoMesa`— y se
 * compara con el de `conoHaz`, unidad a unidad e instante a instante, en las dos
 * escenas. Control positivo: con el seno y el coseno puestos como en el
 * comentario, la diferencia tiene que irse a cero.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador } from './lib_simulador.mjs';
import { cargar } from './lib_parametros.mjs';
import { vectorSol, marcoMesa } from './lib_proyeccion.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { F, VER } = cargaSimulador(ROOT, ['conoHaz', 'trueTrackAngle']);
const P = cargar(), D = Math.PI / 180, AOI = P.aoi_haz_deg;
/* cono verdadero por barrido fino: θ en [−90, 90] cada 0,01°, AOI con la normal del motor */
function conoMotor(zen, az, tau) {
  const s = vectorSol(zen, az), m = { x: 0, n: [0, Math.cos(tau * D)], z: [0, Math.sin(tau * D)] };
  let lo = null, hi = null;
  for (let t = -90; t <= 90 + 1e-9; t += 0.01) { const nr = marcoMesa(m, t).nr; if (s[0] * nr[0] + s[1] * nr[1] + s[2] * nr[2] >= Math.cos(AOI * D)) { if (lo == null) lo = t; hi = t; } }
  return lo == null ? null : [lo, hi];
}
/* control positivo: el cono con s·a como dice el comentario */
function conoComentario(zen, az, tau) {
  const psz = F.trueTrackAngle(zen, az, -tau, 0), Z = zen * D, dA = az * D, t = tau * D;
  const sa = Math.sin(Z) * Math.cos(dA) * Math.cos(t) + Math.cos(Z) * Math.sin(t), cosL = Math.sqrt(Math.max(0, 1 - sa * sa));
  const q = Math.cos(AOI * D) / cosL; if (!(q < 1)) return null; const d = Math.acos(q) / D; return [psz - d, psz + d];
}
console.log(`BT3D · F0 · conoHaz contra el cono del motor · ${VER} · AOI_HAZ ${AOI}° · barrido de θ cada 0,01°`);
for (const pl of ['ayora', 'fayon']) {
  const E = JSON.parse(fs.readFileSync(path.join(ROOT, `audit5/out/escenas/${pl}.json`), 'utf-8'));
  const taus = [...new Set(E.unidades.map(u => +u.tilt.toFixed(2)))];
  let n = 0, peor = 0, peorC = 0, m01 = 0, m1 = 0, nulos = 0, dist = [], peorCaso = null;
  for (const q of E.instantes) for (const tau of taus) {
    const V = conoMotor(q.zen, q.az, tau), C = F.conoHaz(q.zen, q.az, { axisAz: 0 }, tau), K = conoComentario(q.zen, q.az, tau);
    if (!V || !C) { if (!!V !== !!C) nulos++; continue; }
    const vv = [Math.max(-90, V[0]), Math.min(90, V[1])], cc = [Math.max(-90, C[0]), Math.min(90, C[1])], kk = K ? [Math.max(-90, K[0]), Math.min(90, K[1])] : [NaN, NaN];
    const d = Math.max(Math.abs(vv[0] - cc[0]), Math.abs(vv[1] - cc[1])), dk = Math.max(Math.abs(vv[0] - kk[0]), Math.abs(vv[1] - kk[1]));
    n++; dist.push(d); if (d > peor) { peor = d; peorCaso = { fecha: q.fecha, min: q.min, elev: +q.elev.toFixed(2), az: +q.az.toFixed(1), tau, motor: vv.map(v => +v.toFixed(2)), conoHaz: cc.map(v => +v.toFixed(2)) }; }
    peorC = Math.max(peorC, dk); if (d > 0.1) m01++; if (d > 1) m1++;
  }
  dist.sort((a, b) => a - b);
  console.log(`\n${pl}: ${n} instante × τ de unidad (${taus.length} τ distintos) · |Δ extremo| entre conoHaz y el cono del motor: p50 ${dist[n >> 1].toFixed(3)}° · p90 ${dist[Math.floor(0.9 * n)].toFixed(3)}° · máx ${peor.toFixed(3)}° · > 0,1°: ${m01} · > 1°: ${m1} · uno nulo y el otro no: ${nulos}`);
  console.log(`   peor caso: ${JSON.stringify(peorCaso)}`);
  console.log(`   CONTROL POSITIVO (s·a como en el comentario): máx |Δ| ${peorC.toFixed(3)}° ${peorC <= 0.02 ? '— se va al paso del barrido: la diferencia es la de la fórmula' : '— ⚠ NO se va a cero: la diferencia no es solo la fórmula'}`);
}
