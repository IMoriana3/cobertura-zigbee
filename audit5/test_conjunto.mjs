/* R5 · FASE 2 — BANCO DE LA POLÍTICA «CONJUNTO SIN SOMBRA EVITABLE». Sale 1 si falla algo.
 *   node audit5/test_conjunto.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vectorSol } from './lib_proyeccion.mjs';
import { crearPlanta, conjuntoSinSombraEvitable, optimoComun, TOL_EVIT, PASO_F } from './lib_conjunto.mjs';
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
/* 2.6 REESCRITO — decisión del titular (2026-09-24): opción 1 de
   audit5/FASE2_PARADA.md. La premisa vieja («en terreno uniforme coincide con
   pairwise») está REFUTADA: la política encuentra configuraciones no uniformes
   y sin sombra que producen más (filas alternas). Lo que SÍ tiene que cumplir en
   terreno uniforme son tres cosas, y cada una con su control negativo: */
const tbtDe = (zen, az) => F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: CW / P, crossAxisTilt: 0 });
const ganador = (zen, az, opt) => { const { P: pl } = planta(zen, az, opt), tbt = tbtDe(zen, az);
  return { pl, tbt, r: conjuntoSinSombraEvitable(pl, [['pairwise', new Array(NR).fill(tbt)], ['uniforme 0°', new Array(NR).fill(0)]]) }; };
t('2.6a · NUNCA POR DEBAJO de pairwise: POA del ganador ≥ POA de pairwise − E_EMPATE_W', () => {
  const filas = [];
  for (const [zen, az] of SOLES) { const { pl, tbt, r } = ganador(zen, az); const pw = pl.poaPlanta(new Array(NR).fill(tbt));
    filas.push(`${zen}/${az}: ${(r.ganador.poa - pw).toFixed(3)}`);
    debe(r.ganador.poa >= pw - F.E_EMPATE_W, `a sol ${zen}/${az} queda ${(pw - r.ganador.poa).toFixed(4)} W/m² por debajo de pairwise`); }
  return `ganador − pairwise (W/m²): ${filas.join(' · ')}`;
});
t('CONTROL NEGATIVO de 2.6a: una «política» que deja todo plano (0°) SÍ cae por debajo de pairwise', () => {
  let cae = 0;
  for (const [zen, az] of SOLES) { const { P: pl } = planta(zen, az); const tbt = tbtDe(zen, az);
    if (pl.poaPlanta(new Array(NR).fill(0)) < pl.poaPlanta(new Array(NR).fill(tbt)) - F.E_EMPATE_W) cae++; }
  debe(cae > 0, 'el plano no queda por debajo en ningún sol: la comprobación no podría fallar');
  return `el plano queda por debajo en ${cae} de ${SOLES.length} soles`;
});
t('2.6b · SOMBRA EVITABLE CERO en el ganador', () => {
  for (const [zen, az] of SOLES) { const { r } = ganador(zen, az);
    debe(r.ganador.mesasConEvitable === 0, `a sol ${zen}/${az} deja sombra evitable en ${r.ganador.mesasConEvitable} mesas (máx ${r.ganador.evitMax})`); }
  return `${SOLES.length} soles, 0 mesas con sombra evitable`;
});
t('CONTROL NEGATIVO de 2.6b: el ganador SIN la restricción, evaluado con ella, SÍ deja sombra evitable', () => {
  let con = 0;
  for (const [zen, az] of SOLES) { const { r: libre } = ganador(zen, az, { sinRestriccion: true });
    const { P: pl } = planta(zen, az); pl.fijar(libre.ganador.th); if (pl.pasadaFinal().mesasConEvitable > 0) con++; }
  debe(con > 0, 'sin la restricción tampoco queda sombra evitable: la comprobación no podría fallar');
  return `sin restricción queda sombra evitable en ${con} de ${SOLES.length} soles`;
});
/* pairwise en la MISMA rejilla que la política: puntos lo + k·PASO_F del rango,
   el más cercano a la tangencia por el lado sin sombra (|θ| ≤ |θ_bt|) */
const pairwiseEnRejilla = (lo, tbt) => { const k = (tbt - lo) / PASO_F, e = Math.abs(k - Math.round(k)) < 1e-6 ? Math.round(k) : (tbt >= 0 ? Math.floor(k) : Math.ceil(k)); return lo + e * PASO_F; };
t('2.6c · RESTRINGIDA A UN θ COMÚN, coincide con pairwise: mismo θ en la rejilla de 0,1° y POA dentro de E_EMPATE_W', () => {
  const filas = [];
  for (const [zen, az] of SOLES) { const { P: pl } = planta(zen, az), tbt = tbtDe(zen, az), [lo, hi] = F.rangoHaz(zen, az, Tsint, 0, 0);
    const c = optimoComun(pl, lo, hi), tg = pairwiseEnRejilla(lo, tbt), pw = pl.poaPlanta(new Array(NR).fill(tg));
    debe(c, `a sol ${zen}/${az} no hay ningún θ común sin sombra evitable`);
    filas.push(`${zen}/${az}: θ ${c.t.toFixed(2)} vs ${tg.toFixed(2)} (θ_bt ${tbt.toFixed(3)})`);
    debe(Math.abs(c.t - tg) <= 1e-6, `a sol ${zen}/${az} el θ común óptimo es ${c.t.toFixed(3)}° y pairwise en la rejilla ${tg.toFixed(3)}°`);
    debe(Math.abs(c.poa - pw) <= F.E_EMPATE_W, `a sol ${zen}/${az} |ΔPOA| ${Math.abs(c.poa - pw).toFixed(4)} W/m²`); }
  return filas.join(' · ');
});
t('CONTROL NEGATIVO de 2.6c: el θ común SIN la restricción de sombra NO coincide con pairwise', () => {
  let dif = 0, peor = 0;
  for (const [zen, az] of SOLES) { const { P: pl } = planta(zen, az, { sinRestriccion: true }), tbt = tbtDe(zen, az), [lo, hi] = F.rangoHaz(zen, az, Tsint, 0, 0);
    const c = optimoComun(pl, lo, hi), tg = pairwiseEnRejilla(lo, tbt); if (Math.abs(c.t - tg) > 1e-6) dif++; peor = Math.max(peor, Math.abs(c.t - tg)); }
  debe(dif > 0, 'sin la restricción el θ común sigue siendo el de pairwise: 2.6c no probaría la restricción');
  return `sin restricción se aparta en ${dif} de ${SOLES.length} soles (hasta ${peor.toFixed(1)}°)`;
});
t('la ganancia sin sombra sobre pairwise, a la vista (el hallazgo de las filas alternas, SIN PUBLICAR hasta cerrar difusa enmascarada, mismatch y albedo)', () => {
  const filas = [];
  for (const [zen, az] of SOLES) { const { pl, tbt, r } = ganador(zen, az); const pw = pl.poaPlanta(new Array(NR).fill(tbt));
    filas.push(`${zen}/${az}: ${(100 * (r.ganador.poa / pw - 1)).toFixed(2)} % (${r.ganador.th.map(v => v.toFixed(1)).join('/')})`); }
  return filas.join(' · ');
});
console.log(`\n${N - FAIL}/${N} comprobaciones en verde`);
process.exit(FAIL ? 1 : 0);
