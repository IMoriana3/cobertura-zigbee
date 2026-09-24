/* R5 · FASE A.4 — EL EFECTO DE UNIFICAR EL ENUMERADOR, ANTES Y DESPUÉS.
 *
 *   node audit5/A4_efecto.mjs [ayora|defecto|senoidal] [--dias=dia|anual] [--paso=10] [--json=RUTA]
 *
 * ANTES = la física de `origin/main` (v1.78.1): pairwise y true3d deciden por
 * vecindad y gemelo. DESPUÉS = esta rama (v1.80.0): deciden con el contador
 * (`decideProyeccion`). Las dos consignas se MIDEN con el mismo contador, el de
 * esta rama, que por defecto es bit a bit el de main (tools/test_decide_mide.mjs, 4).
 *
 * Por instante (sol > 0,5°, cada `paso` min), para pairwise (por mesa en planta
 * real, por línea en preset) y true3d:
 *   · ENERGÍA: POA de planta publicada (`poaPlantSeg`, contador completo: planos,
 *     viga, canto y terreno, Martinez) → kWh/m²;
 *   · SOMBRA EVITABLE: la de planos, sin terreno (lo que una consigna puede
 *     quitar), media de mesa ponderada por largo;
 *   · SOMBRA PUBLICADA: la del contador completo (`shadeRows(...).seg`);
 *   · ERROR «NO» (el 631 de la fase 0, ahora de la DECISIÓN): mesas×instante
 *     con sombra evitable > 1e-3 que la política no declara (irreducible o
 *     aceptada por energía);
 *   · ERROR «SÍ» (el 1.660, retroceso pagado a cambio de nada): unidades
 *     retrocedidas más de PASO_BUSQ desde su candidato de pvlib que podrían
 *     VOLVER a él sin que el contador vea sombra en ninguna mesa. Se mide con
 *     `soloFilas` (sus filas ±3 y las que recibían de ella) y cada «sí» se
 *     confirma con el contador completo.
 * SIN LAZO NI GIRO: se mide la consigna, no el actuador (igual antes y después;
 * el anual de la página lo aplica y es otra ruta — bloque 1.4 del complemento).
 * TEST NULO: `astro` (no cambia en la fase A) da Δ energía = 0 exacto.
 * «anual» = el 21 de cada mes, ponderado por los días del mes (declarado).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PL = process.argv[2] || 'ayora';
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const MODO = arg('dias', 'dia'), PASO = +arg('paso', 10);
const EXTRA = ['shadeBand3DAll', 'shadeRows', 'mvPara', 'poaPlantSeg', 'poaPlant', 'decideProyeccion', 'anglesPairwiseSeg', 'anglesPairwiseRaw', 'anglesTrue3d', 'unidadesDecision', 'segsBroadcast'];
const { F: N, VER } = cargaSimulador(ROOT, EXTRA);
const htmlMain = execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const { F: V } = cargaSimulador(ROOT, [], () => htmlMain);
const lat = { ayora: 39.1182081, defecto: 41.5763, senoidal: 41.5763 }[PL], lon = { ayora: -1.1598527, defecto: -0.7981, senoidal: -0.7981 }[PL];
let T, ALT = 300, porMesa = false;
if (PL === 'ayora') { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')); T = terrenoComoLaPagina(N, d, 80, 0).T; ALT = d.base; porMesa = true; }
else {
  const n = 8, pitch = 6, elev = PL === 'senoidal' ? [...Array(n)].map((_, i) => -i * 6 * Math.tan(5 * Math.PI / 180)) : new Array(n).fill(0);
  const tilt = PL === 'senoidal' ? [...Array(n)].map((_, i) => 3 * Math.sin(2 * Math.PI * i / 4)) : new Array(n).fill(0);
  const pairs = []; for (let i = 0; i < n - 1; i++) pairs.push({ slope: Math.atan2(elev[i] - elev[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: (tilt[i] + tilt[i + 1]) / 2 });
  T = { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilt, groups: null, drive: 'mono' };
}
const segsOf = r => (T.segs && T.segs[r]) ? T.segs[r] : [[-30, 30]];
const nR = T.pairs.length + 1;
const largo = []; for (let r = 0; r < nR; r++) largo.push(segsOf(r).map(s => Math.abs(s[1] - s[0])));
const LT = largo.flat().reduce((a, b) => a + b, 0);
const media = seg => { let s = 0; seg.forEach((l, r) => l.forEach((v, k) => { s += (v || 0) * largo[r][k]; })); return s / LT; };
const aTramos = (F, key, zen, az, irr, doy) => {
  if (porMesa && key === 'pairwise') return F.policyAnglesSeg(key, zen, az, T, irr, doy, 0.2);
  const a = F.policyAngles(key, zen, az, T, irr, doy, 0.2).angles;
  const out = a.map((v, r) => segsOf(r).map(() => v));
  out.declarada = !!(a.aceptadaPorEnergia);
  return out;
};
const poa = (zen, az, A, irr, doy) => porMesa || T.segs ? N.poaPlantSeg(zen, az, T, A, irr, doy, 0.2).plant : N.poaPlant(zen, az, T, A.map(l => l[0]), irr, doy, 0.2).plant;
const evitable = (zen, az, A, extra = {}) => N.shadeBand3DAll(zen, az, T, A, { noStruct: true, noTerr: true, MV: N.mvPara(T, zen), ...extra });
/* ERROR «SÍ»: unidades retrocedidas desde su candidato que podrían volver a él sin sombra */
function errorSi(zen, az, A, key) {
  const semilla = key === 'pairwise' ? (porMesa ? N.anglesPairwiseSeg(zen, az, T, { candidato: true }) : N.anglesPairwiseRaw(zen, az, T, { candidato: true })) : N.anglesTrue3d(zen, az, T);
  const { U } = N.unidadesDecision(T, porMesa && key === 'pairwise');
  const sg = Math.sin((az - T.axisAz) * Math.PI / 180) >= 0 ? 1 : -1;
  const base = evitable(zen, az, A, { atrMesa: true });
  let n = 0, mirados = 0;
  U.forEach(t => {
    let cand = null; for (const [r, k] of t) { const v = porMesa && key === 'pairwise' ? semilla[r][k] : semilla[r]; if (cand === null || Math.abs(v) < Math.abs(cand)) cand = v; }
    const pub = A[t[0][0]][t[0][1]];
    if (!(sg * (cand - pub) > 0.1 + 1e-9)) return;               // no retrocedida más de PASO_BUSQ desde su candidato
    mirados++;
    const B = A.map(l => l.slice()); for (const [r, k] of t) B[r][k] = cand;
    const filas = new Set(); for (const [r] of t) for (let q = r - 3; q <= r + 3; q++) if (q >= 0 && q < nR) filas.add(q);
    base.atrMesa.forEach((l, r) => l.forEach(at => { for (const q in at) if (t.some(([a, b]) => q === a + '|' + b)) filas.add(r); }));
    const P = evitable(zen, az, B, { soloFilas: filas });
    let limpio = true; for (const r of filas) for (const v of P.seg[r]) if (v > 1e-3 + 1e-12) { limpio = false; break; }
    if (limpio) { const C = evitable(zen, az, B); limpio = C.seg.every((l, r) => l.every((v, k) => v <= Math.max(1e-3, base.seg[r][k]) + 1e-12)); }
    if (limpio) n++;
  });
  return { n, mirados };
}
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dias = MODO === 'anual' ? DIM.map((_, m) => [m, 21, DIM[m]]) : [[5, 21, 1], [11, 21, 1]];
const POLS = ['pairwise', 'true3d', 'astro'];
const R = { planta: PL, ver: VER, base: 'origin/main v1.78.1', modo: MODO, paso_min: PASO, maquina: { cpu: os.cpus().length, carga_inicio: os.loadavg() }, dias: [] };
const t0 = Date.now();
for (const [mo, dd, peso] of dias) {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-${dd}`, doy = N.doyOf(ds);
  const D = { dia: ds, peso, pol: {} };
  for (const k of POLS) D.pol[k] = { V: { kwh: 0, evit: 0, publ: 0, errNo: 0, errSi: 0, siMirados: 0 }, N: { kwh: 0, evit: 0, publ: 0, errNo: 0, errSi: 0, siMirados: 0 }, pasos: 0 };
  for (let min = 0; min < 1440; min += PASO) {
    const g = N.solarPos(Date.UTC(2026, mo, dd) + min * 60000, lat, lon);
    if (!(g.elev > 0.5)) continue;
    const irr = N.clearskyIneichen(g.zen, doy, ALT, 3.5), dt = PASO / 60 / 1000;
    for (const k of POLS) {
      const Dk = D.pol[k]; Dk.pasos++;
      for (const [lado, F] of [['V', V], ['N', N]]) {
        const A = aTramos(F, k, g.zen, g.az, irr, doy), S = Dk[lado];
        S.kwh += poa(g.zen, g.az, A, irr, doy) * dt;
        const ev = evitable(g.zen, g.az, A); S.evit += media(ev.seg);
        S.publ += media(N.shadeRows(g.zen, g.az, T, A).seg);
        if (k === 'astro') continue;
        let malas = 0; ev.seg.forEach(l => l.forEach(v => { if (v > 1e-3) malas++; }));
        let declaradas = 0;
        if (lado === 'N') {
          if (A.declarada) declaradas = malas;
          else { const semilla = k === 'pairwise' ? (porMesa ? N.anglesPairwiseSeg(g.zen, g.az, T, { candidato: true }) : N.anglesPairwiseRaw(g.zen, g.az, T, { candidato: true })) : N.anglesTrue3d(g.zen, g.az, T);
            declaradas = Math.min(malas, N.decideProyeccion(g.zen, g.az, T, semilla, porMesa && k === 'pairwise').info.irreducibles * 4); }   // una unidad irreducible = hasta 4 mesas (bifila)
        }
        S.errNo += Math.max(0, malas - declaradas);
        if (min % (3 * PASO) === 0) { const e = errorSi(g.zen, g.az, A, k); S.errSi += e.n; S.siMirados += e.mirados; }
      }
    }
  }
  R.dias.push(D);
  console.error(`  ${PL} ${ds}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
R.s = (Date.now() - t0) / 1000; R.maquina.carga_fin = os.loadavg();
const suma = (k, lado, c) => R.dias.reduce((a, d) => a + d.pol[k][lado][c] * d.peso, 0);
console.log(`R5 · A.4 · efecto de unificar el enumerador · ANTES ${R.base} → DESPUÉS ${VER} · ${PL} · ${MODO === 'anual' ? '21 de cada mes, ponderado por días del mes' : '21-jun y 21-dic'} · cada ${PASO} min · sin lazo`);
for (const k of POLS) {
  const e = c => [suma(k, 'V', c), suma(k, 'N', c)];
  const [kv, kn] = e('kwh'), pasos = R.dias.reduce((a, d) => a + d.pol[k].pasos * d.peso, 0);
  const [ev, en] = e('evit'), [pv, pn] = e('publ'), [nv, nn] = e('errNo'), [sv, sn] = e('errSi'), [mv, mn] = e('siMirados');
  console.log(`  ${k.padEnd(9)} energía ${kv.toFixed(4)} → ${kn.toFixed(4)} kWh/m² (${(100 * (kn / kv - 1)).toFixed(3)} %) · sombra evitable media ${(100 * ev / pasos).toFixed(4)} → ${(100 * en / pasos).toFixed(4)} % · publicada ${(100 * pv / pasos).toFixed(4)} → ${(100 * pn / pasos).toFixed(4)} %` +
    (k === 'astro' ? '   [TEST NULO: Δ energía tiene que ser 0]' : ` · error «no» ${nv} → ${nn} mesas×inst · error «sí» ${sv} → ${sn} unidades×inst (de ${mv} → ${mn} retrocedidas mirados, 1 de cada 3 pasos)`));
}
console.log(`  coste ${R.s.toFixed(0)} s · carga ${R.maquina.carga_inicio.map(x => x.toFixed(1)).join('/')} → ${R.maquina.carga_fin.map(x => x.toFixed(1)).join('/')} (máquina OCUPADA: no es una medida de tiempo)`);
fs.writeFileSync(path.resolve(ROOT, arg('json', `audit5/out/A4_efecto_${PL}_${MODO}.json`)), JSON.stringify(R));
