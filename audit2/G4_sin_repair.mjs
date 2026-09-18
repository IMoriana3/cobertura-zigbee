#!/usr/bin/env node
/* 2 — CIERRE DEL HUECO (d): la rejilla de G.1 con `repairNoShade` DESACTIVADO
   en el lado JS, para medir si esa etapa es la que produce la divergencia con
   `tracker3d.py`.

   EL PARCHE, declarado. Sobre el texto de la FÍSICA PURA extraído del fichero
   (no sobre el fichero) se sustituye el CUERPO de `repairNoShadeCore`
   (backtracking.html:3103) por la identidad `return ang;`, dejando intacta la
   envoltura `repairNoShade` (3098-3102) para que la marca `sinReparar` y el
   tipo de retorno no cambien. Se sustituye el núcleo y no la envoltura porque
   la envoltura la llaman otros sitios y su contrato de retorno forma parte de
   lo que se está comparando.

   CONTROLES, los dos obligatorios:
     · TEST NULO — antes de comparar nada, se verifica que desactivar la etapa
       CAMBIA el θ del JS en los instantes de interés. Si no cambia, la
       comparación no informa y se dice ANTES del resultado.
     · IDENTIDAD — en los instantes/políticas donde la etapa no actuaría
       (astro, global, bt2d, row: el despachador no la llama), el resultado con
       parche tiene que ser IDÉNTICO dígito a dígito al de G.1.

   Ejecutable:  node audit2/G4_sin_repair.mjs   (antes: G1_js.mjs y G1_py.py)
   Salida: audit2/out/G4.txt (stdout) + audit2/out/G4.csv                     */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { CANON, caso, motorDe } from './lib_motor.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

/* ── motor con parche, construido sobre el MISMO texto que usa lib_motor ─── */
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const FIRMA = 'function repairNoShadeCore(zen,az,T,ang,irr,doy,albedo){';
let src = html.slice(j0, i1);
if (src.split(FIRMA).length - 1 !== 1) throw new Error('la firma de repairNoShadeCore no aparece exactamente una vez');
/* se localiza el cuerpo completo contando llaves desde la firma */
const p0 = src.indexOf(FIRMA), pAbre = p0 + FIRMA.length - 1;
let d = 0, pCierra = -1;
for (let k = pAbre; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) { pCierra = k; break; } } }
if (pCierra < 0) throw new Error('no se ha podido delimitar el cuerpo de repairNoShadeCore');
const CUERPO_ORIG = src.slice(pAbre, pCierra + 1);
const srcP = src.slice(0, pAbre) + '{ return ang; }' + src.slice(pCierra + 1);
const EXPORTA = ['policyAngles','poaPlant','solarPos','clearskyIneichen','pairsFromElev','mulberry32','repairNoShadeCore','VER'];
const mk = (texto) => { const dev = EXPORTA.map(n => `typeof ${n}!=='undefined'?${n}:undefined`).join(',');
  const a = new Function(sol + '\n' + texto + `return [${dev}];`)(); const o = {}; EXPORTA.forEach((n, i) => { o[n] = a[i]; }); return o; };
const FO = mk(src), FP = mk(srcP);

console.log('═'.repeat(96));
console.log(`E-G4 · la rejilla de G.1 con repairNoShade DESACTIVADO · commit ${SHA} · node ${process.version}`);
console.log(`VER del fichero: ${FO.VER}`);
console.log('═'.repeat(96));
console.log(`\n── EL PARCHE, exacto ────────────────────────────────────────────────`);
console.log(`se sustituye el cuerpo de  backtracking.html:3103  \`${FIRMA}\``);
console.log(`(${CUERPO_ORIG.split('\n').length} líneas, ${CUERPO_ORIG.length} caracteres) por la identidad  { return ang; }`);
console.log(`La envoltura repairNoShade (3098-3102) queda INTACTA, así que la marca \`sinReparar\` y el`);
console.log(`tipo de retorno no cambian. Se parchea el TEXTO extraído, en memoria; el fichero no se toca.`);
console.log(`primeras 3 líneas del cuerpo original, para que se vea qué se anula:`);
for (const l of CUERPO_ORIG.split('\n').slice(1, 4)) console.log(`     ${l.trim().slice(0, 90)}`);
console.log(`\ncomprobación del parche: repairNoShadeCore con parche devuelve el mismo array que recibe:`);
{ const a = [1, 2, 3]; const r = FP.repairNoShadeCore(45, 90, { real: false, pairs: [{}], axisAz: 0 }, a, { ghi: 500 }, 172, 0.2);
  console.log(`     ¿mismo objeto? ${r === a ? 'SÍ (identidad estricta)' : 'NO'}`); }

const JS = JSON.parse(fs.readFileSync(path.join(OUT, 'G1_js.json'), 'utf-8'));
const PY = JSON.parse(fs.readFileSync(path.join(OUT, 'G1_py.json'), 'utf-8'));
const CON_R = ['pairwise', 'true3d', 'mgl'], SIN_R = ['astro', 'global', 'bt2d', 'row'];
const POL = JS.politicas;

/* ── recalcular la rejilla con y sin parche ─────────────────────────────── */
const R = {};
for (const cual of ['A', 'B']) {
  const T = caso(FO, cual), Tp = caso(FP, cual);
  R[cual] = [];
  for (const I of JS.casos[cual].instantes) {
    const irr = { ghi: I.ghi, dni: I.dni, dhi: I.dhi };
    const fila = { hora: I.hora, zen: I.zen, elev: I.elev, ang0: {}, angP: {}, poa0: {}, poaP: {} };
    for (const k of POL) {
      fila.ang0[k] = FO.policyAngles(k, I.zen, I.az, T,  irr, CANON.doy, CANON.albedo).angles.map(v => +v.toFixed(8));
      fila.angP[k] = FP.policyAngles(k, I.zen, I.az, Tp, irr, CANON.doy, CANON.albedo).angles.map(v => +v.toFixed(8));
      fila.poa0[k] = +FO.poaPlant(I.zen, I.az, T,  fila.ang0[k], irr, CANON.doy, CANON.albedo).plant.toFixed(6);
      fila.poaP[k] = +FP.poaPlant(I.zen, I.az, Tp, fila.angP[k], irr, CANON.doy, CANON.albedo).plant.toFixed(6);
    }
    R[cual].push(fila);
  }
}

/* ── CONTROL 1: identidad con G1_js.json (sin parche) ───────────────────── */
console.log(`\n── CONTROL 1 · el motor SIN parche reproduce G1_js.json ──────────────`);
let dOrig = 0, n1 = 0;
for (const cual of ['A', 'B']) for (let i = 0; i < R[cual].length; i++) for (const k of POL) {
  const A = JS.casos[cual].instantes[i].ang[k], B = R[cual][i].ang0[k];
  for (let r = 0; r < A.length; r++) { dOrig = Math.max(dOrig, Math.abs(A[r] - B[r])); n1++; } }
console.log(`   |Δθ| máximo sobre ${n1} valores = ${dOrig.toExponential(3)}  ⇒ ${dOrig === 0 ? 'IDÉNTICO dígito a dígito' : 'DIFIERE'}`);

/* ── CONTROL 2: las políticas que NO llaman a repairNoShade no se mueven ── */
console.log(`\n── CONTROL 2 · las políticas que NO llaman a repairNoShade no cambian ─`);
console.log(`   (astro 3363, global 3364, bt2d 3365, row 3366: el despachador no la llama)`);
let dSin = 0, n2 = 0;
for (const cual of ['A', 'B']) for (const f of R[cual]) for (const k of SIN_R)
  for (let r = 0; r < f.ang0[k].length; r++) { dSin = Math.max(dSin, Math.abs(f.ang0[k][r] - f.angP[k][r])); n2++; }
console.log(`   |Δθ| máximo sobre ${n2} valores = ${dSin.toExponential(3)}  ⇒ ${dSin === 0 ? 'IDÉNTICO dígito a dígito' : 'DIFIERE — el parche toca de más'}`);

/* ── TEST NULO: ¿cambia algo el parche en las políticas que sí la llaman? ─ */
console.log(`\n── TEST NULO · ¿desactivar la etapa CAMBIA el θ del JS? ───────────────`);
let cambian = 0, total = 0, dMax = 0;
for (const cual of ['A', 'B']) for (const f of R[cual]) for (const k of CON_R) {
  let mov = 0; for (let r = 0; r < f.ang0[k].length; r++) mov = Math.max(mov, Math.abs(f.ang0[k][r] - f.angP[k][r]));
  total++; if (mov > 1e-9) cambian++; dMax = Math.max(dMax, mov); }
console.log(`   combinaciones (caso × instante × política con guardia): ${total}`);
console.log(`   en las que el parche MUEVE el θ: ${cambian}  (${(100*cambian/total).toFixed(1)} %) · |Δθ| máximo ${dMax.toFixed(4)}°`);
if (!cambian) { console.log(`\n   TEST NULO POSITIVO: el parche no cambia NADA ⇒ la comparación NO INFORMA.`);
  console.log(`   No se publica ningún resultado derivado.`); process.exit(0); }
console.log(`   ⇒ el predicado no es constante: la comparación informa.`);

/* ── el resultado: |Δθ| contra el Python, con y sin la etapa ────────────── */
const med = a => { if (!a.length) return 0; const s = a.slice().sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
console.log(`\n── |Δθ| CONTRA tracker3d.py, con la etapa ACTIVA y DESACTIVADA ───────`);
console.log(`  caso  política   n   |Δθ| máx CON   |Δθ| máx SIN   mediana CON   mediana SIN   |ΔPOA| máx CON   SIN`);
const filas = [];
for (const cual of ['A', 'B']) for (const k of POL) {
  const cp = PY.casos[cual];
  const dC = [], dS = [], pC = [], pS = [];
  for (let i = 0; i < R[cual].length; i++) {
    const B = cp.instantes[i].ang[k]; if (!B) continue;
    const f = R[cual][i];
    for (let r = 0; r < B.length; r++) { dC.push(Math.abs(f.ang0[k][r] - B[r])); dS.push(Math.abs(f.angP[k][r] - B[r])); }
    const pb = cp.instantes[i].poa[k];
    if (pb != null) { pC.push(Math.abs(f.poa0[k] - pb)); pS.push(Math.abs(f.poaP[k] - pb)); }
  }
  if (!dC.length) { console.log(`   ${cual}   ${k.padEnd(9)}  —   NO COMPARABLE (sin contraparte en tracker3d.py)`); continue; }
  console.log(`   ${cual}   ${k.padEnd(9)} ${String(dC.length).padStart(3)}  ${Math.max(...dC).toFixed(4).padStart(12)}°  ${Math.max(...dS).toFixed(4).padStart(12)}°  ${med(dC).toFixed(4).padStart(11)}°  ${med(dS).toFixed(4).padStart(11)}°  ${Math.max(...pC).toFixed(3).padStart(14)}  ${Math.max(...pS).toFixed(3).padStart(8)}`);
  filas.push([cual, k, dC.length, Math.max(...dC).toFixed(6), Math.max(...dS).toFixed(6), med(dC).toFixed(6), med(dS).toFixed(6), Math.max(...pC).toFixed(6), Math.max(...pS).toFixed(6)].join(','));
}

/* ── las 14 divergencias mayores de G.1, una a una ──────────────────────── */
console.log(`\n── LAS 14 DIVERGENCIAS MAYORES DE E-G1, CON LA ETAPA DESACTIVADA ─────`);
const todas = [];
for (const cual of ['A', 'B']) for (const k of POL) { const cp = PY.casos[cual];
  for (let i = 0; i < R[cual].length; i++) { const B = cp.instantes[i].ang[k]; if (!B) continue; const f = R[cual][i];
    for (let r = 0; r < B.length; r++) todas.push({ cual, hora: f.hora, elev: f.elev, k, r,
      dC: Math.abs(f.ang0[k][r] - B[r]), dS: Math.abs(f.angP[k][r] - B[r]), js0: f.ang0[k][r], jsP: f.angP[k][r], py: B[r] }); } }
todas.sort((x, y) => y.dC - x.dC);
const TOL = 1.0;
console.log(`  tolerancia declarada para «cae»: |Δθ| < ${TOL.toFixed(1)}°`);
console.log(`   #  caso hora   política   fila  θ JS CON  θ JS SIN   θ PY     |Δθ| CON  |Δθ| SIN  ¿cae?`);
let caen = 0;
for (let i = 0; i < 14; i++) { const o = todas[i];
  const cae = o.dS < TOL; if (cae) caen++;
  console.log(`  ${String(i+1).padStart(2)}   ${o.cual}  ${o.hora}  ${o.k.padEnd(9)}  ${String(o.r).padStart(3)}  ${o.js0.toFixed(2).padStart(8)}  ${o.jsP.toFixed(2).padStart(8)}  ${o.py.toFixed(2).padStart(7)}  ${o.dC.toFixed(3).padStart(8)}  ${o.dS.toFixed(3).padStart(8)}  ${cae ? 'SÍ' : 'no'}`); }
console.log(`\n  de las 14 mayores, caen por debajo de ${TOL.toFixed(1)}° al desactivar la etapa: ${caen} de 14`);
const resid = todas.map(o => o.dS);
console.log(`  |Δθ| máximo RESIDUAL en toda la rejilla, con la etapa desactivada: ${Math.max(...resid).toFixed(4)}°`);
console.log(`  |Δθ| máximo con la etapa ACTIVA (E-G1):                            ${Math.max(...todas.map(o => o.dC)).toFixed(4)}°`);
fs.writeFileSync(path.join(OUT, 'G4.csv'), 'caso,politica,n,dtheta_max_CON,dtheta_max_SIN,dtheta_med_CON,dtheta_med_SIN,dpoa_max_CON,dpoa_max_SIN\n' + filas.join('\n') + '\n');
console.log(`\nCSV: audit2/out/G4.csv`);
