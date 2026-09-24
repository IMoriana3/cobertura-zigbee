/* REFUNDACIÓN · PASO 1.1 — ¿QUÉ PARTE DEL HUECO LÍNEA→MESA ES ACOPLAR LÍNEAS
 * ENTERAS Y QUÉ PARTE ES UN ÁNGULO POR LÍNEA?
 *
 *   node audit5/P1_1_separa_acople.mjs [--meses=12] [--json=RUTA]
 *
 * La ablación del P1 (rama r4-correccion-bt-extremos, audit4/P1_ALCANCE_PAIRDZ.md:259)
 * dejó «sin `driveCoupleSafe` | 2.677,6999 | +16,067 % | 93,1 %» y la pregunta
 * abierta de la línea 269: «qué parte del +16 % es ese acople entre líneas
 * enteras y qué parte es acoplar bien pero con θ de línea NO está separado».
 *
 * Y además aquel hueco MEZCLABA MÉTRICA: la línea se medía con
 * crearLazo → poaPlant y la mesa con crearLazoSeg → poaPlantSeg
 * (audit4/D_anual_ayora.mjs:13-14). Aquí las cuatro variantes se miden con la
 * MISMA métrica por mesa (crearLazoSeg → poaPlantSeg, la del día), y la ruta por
 * línea también con la suya, para separar lo que es solo métrica.
 *
 * Variantes de `pairwise` (física de `origin/main`, v1.78.1, la del +16 %):
 *   L   ruta por línea publicada: policyAngles = repairNoShade(driveCoupleSafe(anglesPairwise))
 *       → acopla las DOS LÍNEAS ENTERAS de cada grupo (T.groups) y aplana el grupo
 *         emisor mientras algún par de líneas sombree (2.5D, peor estación);
 *   L0  θ de línea SIN acople: anglesPairwise (la fila «sin drive» de la ablación);
 *   LM  θ de línea, acoplado POR MOTOR: applyDriveSeg(segsBroadcast(anglesPairwise), segDrive)
 *       → el mismo acople que la rama por mesa, sobre el θ de línea;
 *   M   rama por mesa publicada: policyAnglesSeg = applyDriveSeg(anglesPairwiseSeg, segDrive).
 * Descomposición del hueco L → M (misma métrica):
 *   «acoplar líneas enteras» = LM − L    (mismo θ de línea, cambia la unidad del acople)
 *   «un ángulo por línea»    = M − LM    (mismo acople por motor, cambia θ de línea → θ de mesa)
 *
 * Controles, antes de contar:
 *   1 · FIDELIDAD: L con su métrica de línea da 2.307,0294 y M con la de mesa
 *       2.705,1154 (audit4/out/D_anual_ayora_pairwise.json) — solo con --meses=12.
 *   2 · TEST NULO (21-jun y 21-dic): LM tiene que dar θ DISTINTOS de L y de M; si
 *       coincide con uno de los dos, esa mitad de la descomposición no informa.
 *       CONTROL NEGATIVO del detector: comparar una variante consigo misma da 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const NMESES = +arg('meses', 12), dest = path.resolve(ROOT, arg('json', 'audit5/out/P1_1_separa_acople.json'));
const htmlMain = execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const { F, VER } = cargaSimulador(ROOT, ['poaPlant', 'poaPlantSeg', 'crearLazo', 'crearLazoSeg', 'anglesPairwise',
  'anglesPairwiseSeg', 'applyDriveSeg', 'segsBroadcast'], () => htmlMain);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { T } = terrenoComoLaPagina(F, datos, 80, 0);
const drv = (T.segDrive && T.segDrive.length) ? T.segDrive : (T.segPairs || null);
// el mismo montaje que audit4/G_ablacion_anual.mjs y D_anual_ayora.mjs
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, ALB = 0.2, TZ = 1, PASO = 10;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const REF_LIN = 2307.0294, REF_MESA = 2705.1154;
const V = ['L', 'L0', 'LM', 'M'];

const variantes = (g, irr, doy) => {
  const lin = F.anglesPairwise(g.zen, g.az, T);
  const L = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, ALB).angles;
  return {
    linea: { L, L0: lin },
    mesa: {
      L: F.segsBroadcast(T, L), L0: F.segsBroadcast(T, lin),
      LM: F.applyDriveSeg(F.segsBroadcast(T, lin), drv),
      M: F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, ALB),
    },
  };
};
const instantes = function* (mo) {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = F.doyOf(ds), dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  for (let m = 0; m < 1440; m += PASO) {
    const g = F.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    yield { g, doy, irr: F.clearskyIneichen(g.zen, doy, ALT, TL) };
  }
};
const distintas = (A, B) => { let n = 0, tot = 0, mx = 0; A.forEach((l, r) => l.forEach((v, k) => { tot++; const d = Math.abs(v - B[r][k]); if (d > 1e-9) n++; mx = Math.max(mx, d); })); return { n, tot, mx }; };
const R = { ver: VER, fisica: 'origin/main', planta: 'ayora, banda de la página (80 líneas pedidas)', lineas: T.pairs.length + 1,
  mesas: T.segs.reduce((a, l) => a + l.length, 0), motores: drv ? drv.length : 0, grupos_linea: T.groups ? T.groups.length : 0,
  paso_min: PASO, maquina: { cpu: os.cpus().length, carga_inicio: os.loadavg() } };
const guarda = () => fs.writeFileSync(dest, JSON.stringify(R, null, 1));

console.log(`REFUNDACIÓN · 1.1 · separar el acople · física ${VER} (origin/main) · Ayora, ${R.lineas} líneas, ${R.mesas} mesas, ${R.motores} motores, ${R.grupos_linea} grupos de línea`);

/* 2 · TEST NULO, primero, con su control negativo */
const tn = { LM_vs_L: { n: 0, tot: 0, mx: 0 }, LM_vs_M: { n: 0, tot: 0, mx: 0 }, L_vs_M: { n: 0, tot: 0, mx: 0 }, control_mismo: { n: 0, tot: 0, mx: 0 } };
const suma = (a, b) => { a.n += b.n; a.tot += b.tot; a.mx = Math.max(a.mx, b.mx); };
for (const mo of [5, 11]) for (const { g, doy, irr } of instantes(mo)) {
  const X = variantes(g, irr, doy).mesa;
  suma(tn.LM_vs_L, distintas(X.LM, X.L)); suma(tn.LM_vs_M, distintas(X.LM, X.M)); suma(tn.L_vs_M, distintas(X.L, X.M));
  suma(tn.control_mismo, distintas(X.LM, X.LM.map(l => l.slice())));
}
R.test_nulo = tn; guarda();
const pc = o => `${o.n} de ${o.tot} mesas×instante (${(100 * o.n / o.tot).toFixed(1)} %), mayor |Δθ| ${o.mx.toFixed(3)}°`;
console.log(`\n2 · TEST NULO (21-jun y 21-dic, cada ${PASO} min)`);
console.log(`  control negativo del detector (LM contra sí misma): ${pc(tn.control_mismo)} ${tn.control_mismo.n === 0 ? '✓' : '✗ EL DETECTOR INVENTA DIFERENCIAS'}`);
console.log(`  LM ≠ L : ${pc(tn.LM_vs_L)}${tn.LM_vs_L.n ? '' : '   ⚠ «acoplar líneas enteras» NO INFORMA'}`);
console.log(`  LM ≠ M : ${pc(tn.LM_vs_M)}${tn.LM_vs_M.n ? '' : '   ⚠ «un ángulo por línea» NO INFORMA'}`);
console.log(`  L  ≠ M : ${pc(tn.L_vs_M)}`);
if (tn.control_mismo.n) throw new Error('el detector de diferencias no es fiable');

/* EL ANUAL, todas las cadenas en la MISMA pasada */
const E = { linea: { L: 0, L0: 0 }, mesa: Object.fromEntries(V.map(k => [k, 0])) };
R.meses = []; const t0 = Date.now();
for (let mo = 0; mo < NMESES; mo++) {
  const LZ = { L: F.crearLazo(), L0: F.crearLazo() }, LZS = Object.fromEntries(V.map(k => [k, F.crearLazoSeg()]));
  const eM = { linea: { L: 0, L0: 0 }, mesa: Object.fromEntries(V.map(k => [k, 0])) };
  for (const { g, doy, irr } of instantes(mo)) {
    const w = (PASO / 60) / 1000 * DIM[mo], X = variantes(g, irr, doy);
    for (const k of ['L', 'L0']) eM.linea[k] += F.poaPlant(g.zen, g.az, T, LZ[k].paso(X.linea[k], PASO * 60), irr, doy, ALB).plant * w;
    for (const k of V) eM.mesa[k] += F.poaPlantSeg(g.zen, g.az, T, LZS[k].paso(X.mesa[k], PASO * 60), irr, doy, ALB).plant * w;
  }
  for (const k of ['L', 'L0']) E.linea[k] += eM.linea[k];
  for (const k of V) E.mesa[k] += eM.mesa[k];
  R.meses.push({ mes: mo + 1, ...eM }); R.anual = E; R.parcial = mo < NMESES - 1; R.s = (Date.now() - t0) / 1000; guarda();
  console.error(`  mes ${mo + 1} · ${R.s.toFixed(0)} s`);
}
R.maquina.carga_fin = os.loadavg(); guarda();
const f4 = x => x.toFixed(4);
console.log(`\n3 · ANUAL de pairwise, ${NMESES}/12 meses (días 21, cada ${PASO} min, cielo claro, CON lazo), kWh/m²`);
if (NMESES === 12) {
  const okL = Math.abs(E.linea.L - REF_LIN) < 5e-5, okM = Math.abs(E.mesa.M - REF_MESA) < 5e-5;
  console.log(`  1 · FIDELIDAD: L con métrica de línea ${f4(E.linea.L)} (ref ${REF_LIN}) ${okL ? '✓' : '✗'} · M con métrica de mesa ${f4(E.mesa.M)} (ref ${REF_MESA}) ${okM ? '✓' : '✗'}`);
}
console.log(`  métrica de LÍNEA (crearLazo → poaPlant): L ${f4(E.linea.L)} · L0 ${f4(E.linea.L0)} (${(100 * (E.linea.L0 / E.linea.L - 1)).toFixed(3)} %)`);
console.log(`  métrica de MESA (crearLazoSeg → poaPlantSeg):`);
for (const k of V) console.log(`    ${k.padEnd(3)} ${f4(E.mesa[k]).padStart(10)}  ${(100 * (E.mesa[k] / E.mesa.L - 1)).toFixed(3).padStart(8)} % vs L`);
const hueco = E.mesa.M - E.mesa.L;
console.log(`  hueco L → M en la MISMA métrica: ${f4(hueco)} kWh/m² (${(100 * hueco / E.mesa.L).toFixed(3)} %)`);
console.log(`    «acoplar líneas enteras» (LM − L): ${f4(E.mesa.LM - E.mesa.L)} = ${(100 * (E.mesa.LM - E.mesa.L) / hueco).toFixed(1)} % del hueco`);
console.log(`    «un ángulo por línea»    (M − LM): ${f4(E.mesa.M - E.mesa.LM)} = ${(100 * (E.mesa.M - E.mesa.LM) / hueco).toFixed(1)} % del hueco`);
console.log(`  solo MÉTRICA (L por mesa − L por línea): ${f4(E.mesa.L - E.linea.L)} kWh/m² (${(100 * (E.mesa.L / E.linea.L - 1)).toFixed(3)} %)`);
console.log(`  coste ${R.s.toFixed(0)} s · carga ${R.maquina.carga_inicio.map(x => x.toFixed(1)).join('/')} → ${R.maquina.carga_fin.map(x => x.toFixed(1)).join('/')} (${R.maquina.carga_inicio[0] > 0.5 ? 'máquina OCUPADA: no es una medida de tiempo' : 'máquina libre'})`);
