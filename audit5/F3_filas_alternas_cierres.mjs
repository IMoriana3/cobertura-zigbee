/* R5 · LOS TRES CIERRES DEL HALLAZGO DE LAS FILAS ALTERNAS (decisión del titular:
 * no se publicaba hasta cerrar difusa enmascarada, mismatch y albedo; cerrados
 * y publicado el 2026-09-24).
 *
 *   node audit5/F3_filas_alternas_cierres.mjs
 *
 * El caso es el de la refutación de 2.6 (audit5/F2_refutacion_26.mjs): 7 filas
 * planas, paso 6, cuerda 2,384, z0 0,17, irradiancia 900/800/100, albedo 0,2, y
 * las configuraciones que encontró la política frente a la tangencia uniforme.
 * Eje a H = 2,0 m del suelo (seguidor.js:41, «del suelo al EJE DEL TUBO»).
 *
 * Se recalcula la POA de planta de las dos configuraciones cuatro veces:
 *   0 · la métrica de la página (`poaRow`), que es la que dio +6-7 %;
 *   1 · + DIFUSA ENMASCARADA: el cielo isótropo con el factor de vista real de
 *       cada cara (las vecinas en su θ), y la banda de horizonte con la fracción
 *       visible (lib_vista2d.mjs);
 *   2 · + ALBEDO CON SUELO SOMBREADO: el suelo que ve cada cara, con su propia
 *       sombra de las filas y su propio cielo tapado;
 *   3 · + MISMATCH: cada string va en un ala de una fila («un string por ala»,
 *       v1.43), así que no hay mismatch en SERIE entre filas; queda el de strings
 *       de filas distintas EN PARALELO en un mismo MPPT. Peor caso: todas las
 *       filas en un MPPT. Módulo GENÉRICO declarado (no hay ficha en el repo):
 *       Isc 13,9 A · Voc 49,6 V · Imp 13,1 A · Vmp 41,2 V, modelo explícito
 *       I(V) = Isc(1 − C1(e^{V/(C2·Voc)} − 1)), corriente ∝ POA, tensión con
 *       ΔV = 2,22 V por módulo y por unidad de ln(POA/1000), 28 módulos por
 *       string, 25 °C.
 * TEST NULO: una fila sola (sin vecinas, suelo sin sombra) reproduce `poaRow`.
 * CONTROL: con las vecinas, el factor de vista al cielo de una fila interior de
 * la configuración uniforme BAJA respecto a (1+cos β)/2 (si no, no enmascara).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador } from './lib_simulador.mjs';
import { caraFila, vistaCara, suelo, solPerfil } from './lib_vista2d.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { F, VER } = cargaSimulador(ROOT, ['poaRow', 'singleaxis', 'PEREZ_F', 'PEREZ_BINS', 'airmassKY', 'dniExtra', 'iamSkyEq', 'iamGndEq']);
const NR = 7, P = 6, CW = 2.384, Z0 = 0.17, H = 2.0, ALB = 0.2, IAM = 0.05, DOY = 172, D = Math.PI / 180;
const irr = { ghi: 900, dni: 800, dhi: 100 };
const CASOS = [[78, 105, [41.7, 0, 41.7, 0, 41.7, 0, 55]], [70, 265, [-55, -33.8, -43.8, -37.4, -41.1, -38.8, -40.2]], [80, 250, [-42.3, 0, -34.1, -4.4, -29.2, -7.6, -25.8]], [72, 95, [55, 13.5, 55, 13.5, 55, 13.5, 55]]];

/* Perez de la página (backtracking.html:2502-2521), para partir el cielo en isótropo y horizonte */
function perez(zen) {
  const z = zen * D, kap = 1.041, z3 = z * z * z;
  const eps = ((irr.dhi + irr.dni) / irr.dhi + kap * z3) / (1 + kap * z3);
  let bin = 7; for (let i = 0; i < 7; i++) if (eps < F.PEREZ_BINS[i]) { bin = i; break; }
  const f = F.PEREZ_F[bin], delta = irr.dhi * F.airmassKY(zen) / F.dniExtra(DOY);
  return { F1: Math.max(0, f[0] + f[1] * delta + z * f[2]), F2: f[3] + f[4] * delta + z * f[5] };
}

function planta(zen, az, th, { soloFila = null } = {}) {
  const pz = perez(zen), sp = solPerfil(zen, az), cosZ = Math.cos(zen * D);
  const todas = th.map((t, r) => caraFila(r * P, t, Z0, CW));
  const cacheSuelo = new Map();
  const G = (caras, xg) => { const k = Math.round(xg * 20); if (!cacheSuelo.has(k)) { const s = suelo(k / 20, caras, H, sp); cacheSuelo.set(k, irr.dhi * s.vf + (s.alSol ? irr.dni * cosZ : 0)); } return cacheSuelo.get(k); };
  const filas = [];
  const idx = soloFila == null ? th.map((_, r) => r) : [soloFila];
  for (const r of idx) {
    const caras = soloFila == null ? todas : [todas[r]], k = soloFila == null ? r : 0;
    const pg = F.poaRow(th[r], 0, 0, zen, az, irr, DOY, ALB, IAM), b = Math.abs(th[r]) * D, bDeg = Math.abs(th[r]);
    const v = vistaCara(k, caras, H);
    const ks = F.iamSkyEq(bDeg, IAM), kg = F.iamGndEq(bDeg, IAM);
    const skyIso0 = irr.dhi * (1 - pz.F1) * (1 + Math.cos(b)) / 2, skyHz0 = irr.dhi * pz.F2 * Math.sin(b);
    const sky1 = Math.max(0, irr.dhi * (1 - pz.F1) * v.vfC + skyHz0 * v.horizonte) * ks;
    const gndSinSombra = ALB * v.sue.reduce((a, [, w]) => a + w, 0) * irr.ghi * kg;          // solo el tapado del suelo por las filas en la VISTA
    const gnd2 = ALB * v.sue.reduce((a, [xg, w]) => a + G(caras, xg) * w, 0) * kg;
    filas.push({ r, pagina: pg.total, beam: pg.beam, circ: pg.circ, sky0: pg.sky, gnd0: pg.gnd, sky1, gndVista: gndSinSombra, gnd2,
      vfC: v.vfC, vfC0: (1 + Math.cos(b)) / 2, horizonte: v.horizonte, skyIsoCheck: Math.max(0, skyIso0 + skyHz0) * ks });
  }
  return filas;
}

/* mismatch en paralelo: strings de todas las filas en un MPPT */
const MOD = { isc: 13.9, voc: 49.6, imp: 13.1, vmp: 41.2, dv: 2.22, n: 28 };
const C2 = (MOD.vmp / MOD.voc - 1) / Math.log(1 - MOD.imp / MOD.isc), C1 = (1 - MOD.imp / MOD.isc) * Math.exp(-MOD.vmp / (C2 * MOD.voc));
const Imod = (V, g) => { const dV = MOD.dv * Math.log(g / 1000); const i = MOD.isc * (g / 1000) * (1 - C1 * (Math.exp((V - dV) / (C2 * MOD.voc)) - 1)); return Math.max(0, i); };
const pmpp = gs => { let best = 0; for (let v = 0; v <= MOD.voc * 1.2 * MOD.n; v += 0.05) { const V = v / MOD.n; const p = gs.reduce((a, g) => a + Imod(V, g), 0) * v; if (p > best) best = p; } return best; };
const perdidaMismatch = pos => { const juntos = pmpp(pos), sueltos = pos.reduce((a, g) => a + pmpp([g]), 0); return 1 - juntos / sueltos; };

const LOO = [];
console.log(`R5 · cierres de las filas alternas · simulador ${VER} · ${NR} filas, paso ${P}, cuerda ${CW}, z0 ${Z0}, eje a ${H} m del suelo, ρ ${ALB}`);
/* TEST NULO */
{
  let peor = 0, peorVF = 0;
  for (const t of [0, 20.33, 41.7, 55, -39.66]) { const [f] = planta(78, 105, [t], { soloFila: 0 });
    /* sin vecinas y con el suelo SIN sombra (G = GHI en todo el suelo visto): la
       sombra que la propia fila hace en el suelo que ve es física real y se mide
       en el cierre 2; aquí no entra (primera versión del test la metía: E-X1) */
    const tot = f.beam + f.circ + f.sky1 + f.gndVista; peor = Math.max(peor, Math.abs(tot - f.pagina) / f.pagina); peorVF = Math.max(peorVF, Math.abs(f.vfC - f.vfC0)); }
  console.log(`TEST NULO · una fila sola, suelo sin sombra: |POA − poaRow| / poaRow máx ${peor.toExponential(2)} · |VF_cielo − (1+cos β)/2| máx ${peorVF.toExponential(2)} (5 θ entre −39,7° y 55°) ${peor < 2e-3 ? 'PASA' : 'NO PASA'}`);
}
for (const [zen, az, alt] of CASOS) {
  const tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: CW / P, crossAxisTilt: 0 });
  const U = planta(zen, az, new Array(NR).fill(tbt)), A = planta(zen, az, alt);
  const m = (F, k) => F.reduce((a, f) => a + k(f), 0) / F.length;
  const e0 = f => f.pagina, e1 = f => f.beam + f.circ + f.sky1 + f.gnd0, e2 = f => f.beam + f.circ + f.sky1 + f.gnd2;
  const g = k => 100 * (m(A, k) / m(U, k) - 1);
  const mmU = perdidaMismatch(U.map(e2)), mmA = perdidaMismatch(A.map(e2));
  const g3 = 100 * ((m(A, e2) * (1 - mmA)) / (m(U, e2) * (1 - mmU)) - 1);
  console.log(`\nsol ${zen}/${az} · θbt ${tbt.toFixed(2)} · alterna [${alt.join('/')}]`);
  console.log(`  POA de planta (W/m²)          uniforme    alterna     ganancia`);
  console.log(`  0 · métrica de la página    ${m(U, e0).toFixed(3).padStart(9)}  ${m(A, e0).toFixed(3).padStart(9)}   ${g(e0).toFixed(2)} %`);
  console.log(`  1 · + difusa enmascarada    ${m(U, e1).toFixed(3).padStart(9)}  ${m(A, e1).toFixed(3).padStart(9)}   ${g(e1).toFixed(2)} %`);
  console.log(`  2 · + albedo con suelo real ${m(U, e2).toFixed(3).padStart(9)}  ${m(A, e2).toFixed(3).padStart(9)}   ${g(e2).toFixed(2)} %`);
  console.log(`  3 · + mismatch (peor caso)  pérdida ${(100 * mmU).toFixed(3)} % / ${(100 * mmA).toFixed(3)} %          ${g3.toFixed(2)} %`);
  console.log(`  factor de vista al cielo (fila → [real / sin vecinas]): uniforme ${U.map(f => (f.vfC / f.vfC0).toFixed(3)).join(' ')} · alterna ${A.map(f => (f.vfC / f.vfC0).toFixed(3)).join(' ')}`);
  console.log(`  cielo por fila (W/m², página → enmascarado): alterna ${A.map(f => f.sky0.toFixed(1) + '→' + f.sky1.toFixed(1)).join(' ')}`);
  console.log(`  suelo por fila (W/m², página → real): alterna ${A.map(f => f.gnd0.toFixed(1) + '→' + f.gnd2.toFixed(1)).join(' ')}`);
  /* CON Y SIN CADA UNO (pedido del titular, 2026-09-24): la cifra final con los
     tres cierres, y quitando UNO cada vez con los otros dos puestos. La
     secuencia de arriba es acumulativa y su orden reparte las interacciones; esto
     no depende del orden. */
  const conMM = (k, mmOn) => { const a = m(A, k), u = m(U, k); if (!mmOn) return 100 * (a / u - 1);
    return 100 * ((a * (1 - perdidaMismatch(A.map(k)))) / (u * (1 - perdidaMismatch(U.map(k)))) - 1); };
  const e3sinDif = f => f.beam + f.circ + f.sky0 + f.gnd2, e3sinAlb = f => f.beam + f.circ + f.sky1 + f.gnd0;
  const L = { tres: conMM(e2, true), sin_difusa: conMM(e3sinDif, true), sin_albedo: conMM(e3sinAlb, true), sin_mismatch: conMM(e2, false) };
  LOO.push({ sol: `${zen}/${az}`, pagina: g(e0), ...L });
  console.log(`  CON Y SIN CADA UNO: los tres ${L.tres.toFixed(2)} % · sin difusa enmascarada ${L.sin_difusa.toFixed(2)} % · sin albedo real ${L.sin_albedo.toFixed(2)} % · sin mismatch ${L.sin_mismatch.toFixed(2)} % · (página ${g(e0).toFixed(2)} %)`);
  if (zen === 78) { const fi = U[3]; console.log(`  CONTROL · fila interior uniforme: VF cielo ${fi.vfC.toFixed(4)} frente a (1+cos β)/2 ${fi.vfC0.toFixed(4)} ${fi.vfC < fi.vfC0 - 1e-3 ? '(enmascara: el control protege)' : '⚠ NO enmascara'}`); }
}
console.log('\nCIFRA FINAL, CON Y SIN CADA CIERRE (ganancia de la alterna sobre la tangencia uniforme):');
console.log('  sol       página   los tres   sin difusa enm.   sin albedo real   sin mismatch');
for (const r of LOO) console.log(`  ${r.sol.padEnd(8)} ${r.pagina.toFixed(2).padStart(6)} %  ${r.tres.toFixed(2).padStart(6)} %  ${r.sin_difusa.toFixed(2).padStart(12)} %  ${r.sin_albedo.toFixed(2).padStart(14)} %  ${r.sin_mismatch.toFixed(2).padStart(11)} %`);
