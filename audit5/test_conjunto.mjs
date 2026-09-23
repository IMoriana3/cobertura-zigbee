/* R5 · FASE 2 — BANCO DE LA POLÍTICA «CONJUNTO SIN SOMBRA EVITABLE». Sale 1 si falla algo.
 *   node audit5/test_conjunto.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vectorSol } from './lib_proyeccion.mjs';
import { crearPlanta, conjuntoSinSombraEvitable, TOL_EVIT } from './lib_conjunto.mjs';
import { cargaSimulador } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { F, VER } = cargaSimulador(ROOT, ['poaRow', 'elecLoss', 'rangoHaz', 'singleaxis', 'E_EMPATE_W']);
let N = 0, FAIL = 0;
const t = (nombre, f) => { N++; try { const m = f(); console.log('  ✓ ' + nombre + (m ? ' — ' + m : '')); } catch (e) { FAIL++; console.log('  ✗ ' + nombre + ' — ' + e.message); } };
const debe = (c, m) => { if (!c) throw new Error(m); };
console.log(`R5 · banco de la política conjunto sin sombra evitable (simulador ${VER}) · E_EMPATE_W = ${F.E_EMPATE_W} W/m² (:967)`);

/* planta sintética: NR filas paralelas, planas, largas; una unidad por fila (monofila) */
const CW = 2.384, P = 6, Z0 = 0.17, NR = 7, L = 300;
const sintetica = () => { const mesas = [], unidades = [];
  for (let r = 0; r < NR; r++) { const U = []; for (const [a, b] of [[0, L], [L + 0.55, 2 * L + 0.55]]) { U.push(mesas.length); mesas.push({ x: r * P, n: [a, b], z: [0, 0] }); } unidades.push(U); }
  return { mesas, unidades }; };
const Tsint = { maxAngle: 55, axisAz: 0 };
const planta = (zen, az, opt = {}) => {
  const { mesas, unidades } = sintetica(), s = vectorSol(zen, az), doy = 172;
  const irr = F.clearskyIneichen ? null : null;
  return { s, mesas, unidades, P: crearPlanta({ mesas, unidades, rangos: unidades.map(() => F.rangoHaz(zen, az, Tsint, 0, 0)), s, zen, az,
    irr: { ghi: 900, dni: 800, dhi: 100 }, doy, alb: 0.2, iam: 0.05, z0: Z0, cw: CW, nb: 2, NST: 16, poaRow: F.poaRow, elecLoss: F.elecLoss, ...opt }) };
};
const SOLES = [[72, 95], [78, 105], [70, 265], [80, 250]];
t('2.6 DEGENERACIÓN: filas paralelas, planas y sin torsión ⇒ coincide con pairwise dentro de E_EMPATE_W', () => {
  let peorW = 0, peorTh = 0;
  for (const [zen, az] of SOLES) {
    const { P: pl } = planta(zen, az);
    const tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: CW / P, crossAxisTilt: 0 });
    const r = conjuntoSinSombraEvitable(pl, [['pairwise', new Array(NR).fill(tbt)], ['uniforme 0°', new Array(NR).fill(0)]]);
    const poaPw = pl.poaPlanta(new Array(NR).fill(tbt));
    debe(r.ganador.mesasConEvitable === 0, `el ganador deja sombra evitable en ${r.ganador.mesasConEvitable} mesas`);
    peorW = Math.max(peorW, Math.abs(r.ganador.poa - poaPw)); for (const v of r.ganador.th) peorTh = Math.max(peorTh, Math.abs(v - tbt));
  }
  debe(peorW <= F.E_EMPATE_W, `se aparta ${peorW.toFixed(4)} W/m²`);
  return `${SOLES.length} soles · peor |ΔPOA| ${peorW.toFixed(4)} W/m² · peor |Δθ| ${peorTh.toFixed(3)}°`;
});
t('CONTROL NEGATIVO de la degeneración: SIN la restricción de sombra evitable, deja de coincidir con pairwise', () => {
  let peorW = 0;
  for (const [zen, az] of SOLES) {
    const { P: pl } = planta(zen, az, { sinRestriccion: true });
    const tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: CW / P, crossAxisTilt: 0 });
    const r = conjuntoSinSombraEvitable(pl, [['pairwise', new Array(NR).fill(tbt)]]);
    peorW = Math.max(peorW, Math.abs(r.ganador.poa - pl.poaPlanta(new Array(NR).fill(tbt))), Math.max(...r.ganador.th.map(v => Math.abs(v - tbt))));
  }
  debe(peorW > F.E_EMPATE_W, `sin restricción sigue coincidiendo (${peorW}): la degeneración no probaría la restricción`);
  return `sin restricción se aparta ${peorW.toFixed(3)} (W/m² o °)`;
});
t('la política no retrocede de más: en la degeneración ninguna fila queda más de 0,1° por DENTRO de la tangencia', () => {
  let peor = 0;
  for (const [zen, az] of SOLES) { const { P: pl } = planta(zen, az);
    const tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: CW / P, crossAxisTilt: 0 });
    const r = conjuntoSinSombraEvitable(pl, [['uniforme 0°', new Array(NR).fill(0)]]);
    for (const v of r.ganador.th) peor = Math.max(peor, Math.abs(tbt) - Math.abs(v)); }
  debe(peor <= 0.1 + 1e-9, `una fila queda ${peor.toFixed(3)}° por dentro`);
  return `arrancando desde 0°, la fila más retrocedida queda a ${peor.toFixed(3)}° de la tangencia`;
});
console.log(`\n${N - FAIL}/${N} comprobaciones en verde`);
process.exit(FAIL ? 1 : 0);
