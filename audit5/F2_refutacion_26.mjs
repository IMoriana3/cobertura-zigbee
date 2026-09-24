/* R5 · FASE 2 · 2.6 — LA PREMISA DEL CONTROL DE DEGENERACIÓN, CONTRA LOS INSTRUMENTOS
 * DEL PROPIO SIMULADOR (sin el motor de R5).
 *
 *   node audit5/F2_refutacion_26.mjs
 *
 * 2.6 pide: terreno uniforme, filas paralelas e infinitas, sin torsión ⇒ la
 * política nueva coincide con `pairwise` dentro de E_EMPATE_W. El banco de la
 * política encontró configuraciones NO uniformes sin sombra con más energía. Aquí
 * se comprueban con el contador 3D del simulador (`shadeRows`), su 2.5D exacto
 * (`shadeFracPair`) y su `poaPlant`: 7 filas planas, pitch 6, cuerda 2,384,
 * z0 0,17, filas de 600 m, las configuraciones que dio la política.
 */
import { cargaSimulador } from './lib_simulador.mjs';
const { F } = cargaSimulador(new URL('..', import.meta.url).pathname, ['poaPlant', 'shadeRows', 'singleaxis', 'shadeFracPair', 'trueTrackAngle', 'pvTilt']);
const NR = 7, P = 6, CW = 2.384;
const T = { pairs: Array.from({ length: NR - 1 }, () => ({ slope: 0, pitch: P, axisTilt: 0 })), cw: CW, axisAz: 0, maxAngle: 55, gcr: CW / P, z0: 0.17, nBypass: 2, iam: 0.05, filaLen: 600 };
const irr = { ghi: 900, dni: 800, dhi: 100 };
for (const [zen, az, stair] of [[78, 105, [41.7, 0, 41.7, 0, 41.7, 0, 55]], [70, 265, [-55, -33.8, -43.8, -37.4, -41.1, -38.8, -40.2]], [80, 250, [-42.3, 0, -34.1, -4.4, -29.2, -7.6, -25.8]], [72, 95, [55, 13.5, 55, 13.5, 55, 13.5, 55]]]) {
  const tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: CW / P, crossAxisTilt: 0 });
  const uni = new Array(NR).fill(tbt);
  const sU = F.shadeRows(zen, az, T, uni), sS = F.shadeRows(zen, az, T, stair);
  const pU = F.poaPlant(zen, az, T, uni, irr, 172, 0.2), pS = F.poaPlant(zen, az, T, stair, irr, 172, 0.2);
  const psz = F.trueTrackAngle(zen, az, 0, 0);
  const fp = []; for (let r = 0; r + 1 < NR; r++) fp.push(F.shadeFracPair(psz, stair[r], stair[r + 1], P, CW, 0, 0.17).toFixed(4));
  console.log(`sol ${zen}/${az} · θbt ${tbt.toFixed(2)} · SIMULADOR poaPlant: uniforme ${pU.plant.toFixed(3)} · escalera ${pS.plant.toFixed(3)} (${(100 * (pS.plant / pU.plant - 1)).toFixed(2)} %) · sombra 3D por fila escalera [${Array.from(sS).slice(0, NR).map(v => v.toFixed(4)).join(' ')}] · uniforme máx ${Math.max(...Array.from(sU).slice(0, NR)).toFixed(4)} · shadeFracPair 2.5D pareja a pareja [${fp.join(' ')}]`);
}
