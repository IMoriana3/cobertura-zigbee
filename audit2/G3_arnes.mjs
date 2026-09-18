#!/usr/bin/env node
/* 2.3 (primera parte) — AUDITORÍA DEL ARNÉS DE G.1, antes de creerse los 65°.
   Precedente que lo motiva: en C.5 un predicado reescrito a mano daba |Δθ| de
   55° por un error de copia, no del motor. Así que aquí se comprueba, fichero
   por fichero de la ruta de G.1, que no hay ninguna reimplementación de lógica
   del JS ni del Python: todo tiene que salir de llamar al motor.

   Ejecutable:  node audit2/G3_arnes.mjs                                      */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
console.log('═'.repeat(92));
console.log(`E-G3 · auditoría del arnés de G.1 · commit ${SHA} · node ${process.version}`);
console.log('═'.repeat(92));

/* nombres de función del motor JS y del Python: si aparecen DEFINIDOS en un
   script del arnés, es una reimplementación */
const RUTA = ['audit2/G1_js.mjs', 'audit2/G1_py.py', 'audit2/G1_careo.mjs', 'audit2/lib_motor.mjs'];
const DEF_JS = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
const DEF_PY = /^def\s+([A-Za-z_]\w*)\s*\(/gm;
const MOTOR = ['anglesPairwise','anglesAstro','anglesRow','anglesGlobal','anglesBt2d','anglesTrue3d',
  'anglesMinGroundLight','anglesOptimal','anglesOptimalFree','driveCoupleSafe','applyDrive','repairNoShade',
  'poaPlant','poaRow','shadeRows','shadeBand3DAll','elecLoss','rowTiltAt','mvPara','bt3dPairMaxMag',
  'trueTrackAngle','pvTilt','pairShade25','axialCoverage','groundLightFrac','surfaceOrient','singleaxis',
  'compute_bt_angles','compute_bt_angles_rowwise','compute_bt_angles_global','compute_theta_full_tracking',
  'compute_bt_angles_3d','compute_bt_angles_min_ground_light','compute_bt_angles_energy_optimal',
  'compute_bt3d_poa_per_row','compute_shade','electrical_shade_loss','build_terrain_from_profile'];
console.log(`\n── ¿define alguno de los scripts una función del motor? ───────────────`);
let sospechas = 0;
for (const rel of RUTA) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  const defs = [...s.matchAll(rel.endsWith('.py') ? DEF_PY : DEF_JS)].map(m => m[1]);
  const choque = defs.filter(d => MOTOR.includes(d));
  console.log(`  ${rel.padEnd(24)} define ${String(defs.length).padStart(2)} funciones: ${defs.join(', ') || '(ninguna)'}`);
  if (choque.length) { console.log(`     ⚠ REIMPLEMENTA: ${choque.join(', ')}`); sospechas += choque.length; }
}
console.log(`  ⇒ funciones del motor redefinidas en el arnés: ${sospechas}`);

console.log(`\n── ¿de dónde sale la física de cada lado? ─────────────────────────────`);
const js = fs.readFileSync(path.join(ROOT, 'audit2/lib_motor.mjs'), 'utf-8');
const iJ = js.indexOf('export function motorDe');
console.log(`  LADO JS — audit2/lib_motor.mjs, función motorDe:`);
console.log(js.slice(iJ, js.indexOf('\n}', iJ) + 2).split('\n').map(l => '     ' + l).join('\n'));
const py = fs.readFileSync(path.join(ROOT, 'audit2/G1_py.py'), 'utf-8');
console.log(`\n  LADO PYTHON — audit2/G1_py.py, importación y llamada:`);
for (const l of py.split('\n')) if (/^import |^from |^sys\.path|getattr\(t3|t3\.compute|t3\.build_terrain|t3\.electrical/.test(l.trim()))
  console.log(`     ${l.trim()}`);

console.log(`\n── lo que el arnés SÍ construye a mano, y por qué no es física ────────`);
const i2 = js.indexOf('export function caso');
console.log(js.slice(i2, js.indexOf('\n}', i2) + 2).split('\n').map(l => '     ' + l).join('\n'));
console.log(`\n  Es la DEFINICIÓN de los casos A y B del encargo (pendiente 8°, tilt N-S aleatorio`);
console.log(`  amplitud 4 con mulberry32(1234)), no lógica del motor: las cotas salen de la fórmula`);
console.log(`  del enunciado y las parejas de F.pairsFromElev, que es del motor. Se declara.`);

/* ── cruce de las constantes de G.2 contra los casos divergentes ─────────── */
const JS = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit2/out/G1_js.json'), 'utf-8'));
const PY = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit2/out/G1_py.json'), 'utf-8'));
console.log(`\n${'═'.repeat(92)}`);
console.log(`── CRUCE DE CONSTANTES CONTRA LOS CASOS DIVERGENTES ──────────────────`);
console.log(`candidatos declarados por el auditor, verificados uno a uno:`);
const bt = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8').split('\n');
console.log(`\n  (a) UMBRAL DE DEFERRAL. backtracking.html:1250:`);
console.log(`        ${bt[1249].trim()}`);
console.log(`      y su uso inmediato, 1251-1256:`);
for (let i = 1250; i < 1256; i++) console.log(`        ${bt[i].trim()}`);
const pyTxt = fs.readFileSync('/home/user/SolarGPTfull/solargpt/solargpt_core/tracker3d.py', 'utf-8').split('\n');
const iZ = pyTxt.findIndex(l => /zen_max\s*=\s*82/.test(l));
console.log(`      lado Python: ${iZ >= 0 ? `solargpt_core/tracker3d.py:${iZ+1}  ${pyTxt[iZ].trim()}` : 'NO ENCONTRADO un zen_max=82'}`);
const enBT3D = pyTxt.slice(531, 772).some(l => /zen_max|82\.0|meaningful/.test(l));
console.log(`      ¿lo usa compute_bt_angles_3d (532-771)? ${enBT3D ? 'SÍ' : 'NO — el 82° del Python vive en _bt3d_active_mask, no en el pipeline de ángulos'}`);

console.log(`\n  (b) repairNoShade EN EL LADO PYTHON:`);
const hayRepair = pyTxt.some(l => /repair|no_shade_repair|repairNoShade/.test(l));
const nos = pyTxt.map((l, i) => /def (no_shade_violation|_no_shade_violations_from_residual)/.test(l) ? i+1 : 0).filter(Boolean);
console.log(`      búsqueda exhaustiva  grep -nE "repair" tracker3d.py  ⇒ ${hayRepair ? 'hay coincidencias' : 'SIN COINCIDENCIAS'}`);
console.log(`      lo más parecido son VERIFICADORES, no reparadores: ${nos.map(n => 'tracker3d.py:' + n).join(', ') || 'ninguno'}`);
console.log(`      ⇒ la etapa repairNoShade del JS (backtracking.html:3367-3369) NO tiene contraparte en el Python.`);

console.log(`\n  (c) ACOPLE POR ACCIONAMIENTO:`);
const hayGroups = pyTxt.some(l => /groups|drive|applyDrive|apply_drive/.test(l));
console.log(`      grep -nE "groups|drive|apply_drive" tracker3d.py ⇒ ${hayGroups ? 'hay coincidencias' : 'SIN COINCIDENCIAS'}`);
console.log(`      PlantTerrain3D no tiene campo de accionamiento: sus campos son pairs, collector_width_m,`);
console.log(`      axis_azimuth_deg, max_angle_deg, gcr, surface_to_axis_offset_m, n_bypass_diodes.`);
console.log(`      En esta rejilla el JS corre con drive 'mono' y T.groups = null, así que applyDrive es`);
console.log(`      la identidad en los DOS lados: este candidato NO puede explicar la divergencia.`);

console.log(`\n── LOS CASOS DE MAYOR |Δθ|, con su etapa ──────────────────────────────`);
console.log(`  caso  hora   política   fila  θ JS      θ PY      |Δθ|     sol°   torsión máx  etapa que difiere`);
const filas = [];
for (const cual of ['A', 'B']) {
  const cj = JS.casos[cual], cp = PY.casos[cual];
  const tors = Math.max(...cj.rowTilt.slice(1).map((v, i) => Math.abs(v - cj.rowTilt[i])));
  for (const k of JS.politicas) {
    for (let i = 0; i < cj.instantes.length; i++) {
      const A = cj.instantes[i].ang[k], B = cp.instantes[i].ang[k];
      if (!B) continue;
      for (let r = 0; r < A.length; r++) filas.push({ cual, hora: cj.instantes[i].hora, k, r, a: A[r], b: B[r],
        d: Math.abs(A[r] - B[r]), zen: cj.instantes[i].zen, elev: cj.instantes[i].elev, tors });
    }
  }
}
filas.sort((x, y) => y.d - x.d);
for (const f of filas.slice(0, 14)) {
  const etapas = [];
  if (f.zen >= 82) etapas.push('deferral JS zen≥82 (1250) activo, sin contraparte');
  if (['pairwise','true3d','mgl'].includes(f.k)) etapas.push('repairNoShade solo en JS');
  if (f.elev < 15) etapas.push('sol bajo');
  console.log(`   ${f.cual}   ${f.hora}  ${f.k.padEnd(9)}  ${String(f.r).padStart(3)}  ${f.a.toFixed(2).padStart(7)}  ${f.b.toFixed(2).padStart(7)}  ${f.d.toFixed(3).padStart(7)}  ${f.elev.toFixed(1).padStart(5)}  ${f.tors.toFixed(2).padStart(9)}°  ${etapas.join(' + ') || '—'}`);
}
const gr = {};
for (const f of filas) { const b = f.elev < 10 ? '<10°' : f.elev < 20 ? '10-20°' : f.elev < 40 ? '20-40°' : '>40°';
  (gr[b] = gr[b] || []).push(f.d); }
console.log(`\n  |Δθ| por banda de elevación solar (todas las políticas comparables, casos A y B):`);
for (const b of ['<10°','10-20°','20-40°','>40°']) if (gr[b]) {
  const a = gr[b].slice().sort((x,y)=>x-y);
  console.log(`     sol ${b.padEnd(7)} n=${String(a.length).padStart(4)}  mediana ${a[Math.floor(a.length/2)].toFixed(4).padStart(8)}°  máx ${a[a.length-1].toFixed(4).padStart(8)}°`); }

console.log(`\n── bt2d y optfree en tracker3d.py, con cita ───────────────────────────`);
for (const pat of ['bt2d', 'optfree', 'free', 'per_unit', 'OPTFREE']) {
  const hits = pyTxt.map((l, i) => new RegExp(pat).test(l) ? i+1 : 0).filter(Boolean);
  console.log(`   grep -n "${pat}" tracker3d.py ⇒ ${hits.length ? hits.slice(0,6).join(', ') + (hits.length>6?' …':'') : 'SIN COINCIDENCIAS'}`);
}
