#!/usr/bin/env node
/* 2.2 — HIPÓTESIS DEL AUDITOR sobre el escalón de MV = 33.
   Enunciado a poner a prueba: MV=33 es IMPAR y los demás valores probados
   (8/16/32/64/128) son PARES. El muestreo es de punto medio
   (`backtracking.html:2173`), así que existe una estación exactamente en el
   centro de la mesa si y solo si MV es impar; y el centro es donde discrimina
   el reparto por alas (`backtracking.html:2267`).

   Se ejecuta tanto si la hipótesis parece correcta como si no, y se entregan
   los números. La cuenta por estación NO la publica el motor: se obtiene con
   una COPIA INSTRUMENTADA en memoria del bloque FÍSICA PURA, validada contra
   el motor original. El fichero del repo no se toca.

   Ejecutable:  node audit2/E4_mv_impar.mjs
   Salida: audit2/out/E4.txt (stdout) + audit2/out/E4_estaciones.csv         */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const F = motorDe('HEAD'), T = caso(F, 'B');
console.log(echo('E-E4 · el escalón de MV = 33: la hipótesis del muestreo impar', F, T).texto);
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);

/* ── la aritmética de la hipótesis, antes de medir nada ─────────────────── */
console.log(`\n── LA HIPÓTESIS, EN ARITMÉTICA ─────────────────────────────────────`);
console.log(`backtracking.html:2173 — el muestreo axial:`);
console.log(`        const v=v0+(v1-v0)*(j+0.5)/MV;`);
console.log(`backtracking.html:2267 — el reparto por alas:`);
console.log(`        {const wg=v<(v0+v1)/2?0:1;hitW[wg]+=fCol;NW[wg]++;elecW[wg]+=elecLoss(fCol,T.nBypass);}`);
console.log(`\nUna estación cae EXACTAMENTE en el centro cuando (j+0.5)/MV = 0.5, o sea j = (MV-1)/2.`);
console.log(`Eso es entero si y sólo si MV es IMPAR. Y en el centro v == (v0+v1)/2, así que`);
console.log(`\`v < (v0+v1)/2\` es FALSO y la estación central cae en el ala 1.`);
console.log(`\n   MV   ¿j=(MV-1)/2 entero?   estaciones ala 0   ala 1   reparto`);
for (const mv of [8, 16, 32, 33, 34, 64, 65, 66, 128]) {
  const impar = mv % 2 === 1;
  const a0 = impar ? (mv - 1) / 2 : mv / 2, a1 = mv - a0;
  console.log(`  ${String(mv).padStart(4)}   ${(impar ? 'SÍ, j=' + (mv-1)/2 : 'no').padEnd(19)}   ${String(a0).padStart(15)}   ${String(a1).padStart(5)}   ${a0 === a1 ? 'simétrico' : 'ASIMÉTRICO (' + (a1-a0) + ' estación de más en el ala 1)'}`);
}

/* ── copia instrumentada: fracción por estación y reparto por alas ──────── */
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const ANCLA = '{const wg=v<(v0+v1)/2?0:1;hitW[wg]+=fCol;NW[wg]++;elecW[wg]+=elecLoss(fCol,T.nBypass);}';
let src = html.slice(j0, i1);
if (src.split(ANCLA).length - 1 !== 1) throw new Error('el ancla de la sonda no aparece exactamente una vez');
src = src.replace(ANCLA, ANCLA + 'if(globalThis.__EST)globalThis.__EST(r,j,v,v0,v1,fCol,(v<(v0+v1)/2?0:1));');
const FI = new Function(sol + '\n' + src + `return { shadeBand3DAll, poaPlant };`)();
console.log(`\nsonda insertada tras la ÚNICA aparición del reparto por alas (backtracking.html:2267).`);

const fsPl = (Fx, ang) => { const sh = Fx.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true }); let p = 0;
  for (let r = 0; r < 6; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : [];
    p = Math.max(p, Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); } return p; };

/* validación de la copia */
let dmax = 0;
for (const mv of [32, 33, 34]) { T.mv = mv;
  for (let th = 21.85; th <= 22.0 + 1e-9; th += 0.01) { const a = new Array(6).fill(+th.toFixed(4));
    dmax = Math.max(dmax, Math.abs(fsPl(F, a) - fsPl(FI, a))); } }
delete T.mv;
console.log(`validación de la copia instrumentada: |Δ fs PLANOS| máximo = ${dmax.toExponential(3)} ⇒ ${dmax === 0 ? 'IDÉNTICA bit a bit' : 'DIFIERE'}`);

/* ── (1) el tramo con MV 32, 33, 34, 65, 66 ─────────────────────────────── */
console.log(`\n── (1) TRAMO θ 21,85° → 22,00° paso 0,01°, sombra de PLANOS ───────────`);
const TH = []; for (let t = 21.85; t <= 22.0 + 1e-9; t += 0.01) TH.push(+t.toFixed(4));
const MVS = [32, 33, 34, 65, 66];
console.log(`   θ      ` + MVS.map(v => ('MV ' + v).padStart(11)).join(' '));
const serie = {};
for (const mv of MVS) { T.mv = mv; serie[mv] = TH.map(th => fsPl(F, new Array(6).fill(th))); }
delete T.mv;
for (let i = 0; i < TH.length; i++)
  console.log(`  ${TH[i].toFixed(2)}°  ` + MVS.map(v => (100*serie[v][i]).toFixed(4).padStart(9) + ' %').join(' '));
console.log(`\n   salto máximo entre θ consecutivos, por MV:`);
for (const mv of MVS) { let d = 0, k = -1;
  for (let i = 1; i < TH.length; i++) { const q = serie[mv][i] - serie[mv][i-1]; if (Math.abs(q) > Math.abs(d)) { d = q; k = i; } }
  console.log(`     MV ${String(mv).padStart(3)} ${mv % 2 ? '(IMPAR)' : '(par)  '} : ${(100*d).toFixed(4).padStart(9)} pp  entre ${TH[k-1].toFixed(2)}° y ${TH[k].toFixed(2)}°`); }

/* ── (2) fracción por estación con MV = 33 en los θ del escalón ─────────── */
console.log(`\n── (2) FRACCIÓN POR ESTACIÓN con MV = 33, fila del máximo, en el escalón ──`);
const filas = [];
for (const th of [21.91, 21.92]) {
  T.mv = 33;
  const est = [];
  globalThis.__EST = (r, j, v, v0, v1, fCol, wg) => { if (r === 0) est.push({ j, v, fCol, wg, centro: Math.abs(v - (v0+v1)/2) < 1e-9 }); };
  fsPl(FI, new Array(6).fill(th));
  globalThis.__EST = null; delete T.mv;
  const sol33 = est.filter(e => e.j !== undefined);
  console.log(`\n  θ = ${th}°  ·  fila receptora 0  ·  ${sol33.length} estaciones`);
  console.log(`     j   v (m)        fracción    ala  ¿centro?`);
  for (const e of sol33) console.log(`   ${String(e.j).padStart(3)}  ${e.v.toFixed(4).padStart(10)}  ${(100*e.fCol).toFixed(4).padStart(9)} %   ${e.wg}   ${e.centro ? '← CENTRO EXACTO' : ''}`);
  for (const e of sol33) filas.push([th, e.j, e.v.toFixed(6), e.fCol.toFixed(8), e.wg, e.centro ? 1 : 0].join(','));
}
/* diferencia estación a estación entre los dos θ */
console.log(`\n  ¿qué estación aporta la discontinuidad? diferencia de fracción entre 21,92° y 21,91°:`);
{
  const lee = th => { T.mv = 33; const e = [];
    globalThis.__EST = (r, j, v, v0, v1, fCol, wg) => { if (r === 0) e.push({ j, v, fCol, wg, centro: Math.abs(v-(v0+v1)/2) < 1e-9 }); };
    fsPl(FI, new Array(6).fill(th)); globalThis.__EST = null; delete T.mv; return e; };
  const A = lee(21.91), B = lee(21.92);
  const n = Math.min(A.length, B.length); const dif = [];
  for (let k = 0; k < n; k++) dif.push({ j: A[k].j, d: B[k].fCol - A[k].fCol, centro: A[k].centro, wg: A[k].wg });
  dif.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  console.log(`     j    Δfracción     ala   ¿centro?`);
  for (const d of dif.slice(0, 8)) console.log(`   ${String(d.j).padStart(3)}  ${(100*d.d).toFixed(4).padStart(10)} pp   ${d.wg}   ${d.centro ? '← CENTRO EXACTO' : ''}`);
  const sum = dif.reduce((a, b) => a + b.d, 0);
  console.log(`     suma de las diferencias / nº estaciones = ${(100*sum/n).toFixed(4)} pp   (el promedio es la fracción de la fila)`);
}

/* ── (3) reparto por alas en esos θ con MV 32, 33 y 34 ──────────────────── */
console.log(`\n── (3) REPARTO POR ALAS (hitW/NW) en θ 21,91° y 21,92° ────────────────`);
console.log(`   MV    θ        estaciones ala 0   ala 1   fracción media ala 0   ala 1     diferencia`);
for (const mv of [32, 33, 34]) for (const th of [21.91, 21.92]) {
  T.mv = mv;
  const W = [[0,0],[0,0]];   // [ala][suma, n]
  globalThis.__EST = (r, j, v, v0, v1, fCol, wg) => { if (r === 0) { W[wg][0] += fCol; W[wg][1]++; } };
  fsPl(FI, new Array(6).fill(th));
  globalThis.__EST = null; delete T.mv;
  const m0 = W[0][1] ? W[0][0]/W[0][1] : 0, m1 = W[1][1] ? W[1][0]/W[1][1] : 0;
  console.log(`  ${String(mv).padStart(4)}  ${th}°  ${String(W[0][1]).padStart(15)}   ${String(W[1][1]).padStart(5)}   ${(100*m0).toFixed(4).padStart(19)} %  ${(100*m1).toFixed(4).padStart(7)} %  ${(100*(m1-m0)).toFixed(4).padStart(10)} pp`);
}

/* ── (4) ¿puede mvPara devolver impares? ────────────────────────────────── */
console.log(`\n── (4) ¿PUEDE mvPara DEVOLVER VALORES IMPARES? ────────────────────────`);
console.log(`backtracking.html:856 — la última línea de mvPara:`);
console.log(`        return Math.max(8,Math.min(64,Math.ceil(rasante*L/(tor>=0.5?2:4))));`);
console.log(`\nMath.ceil de un cociente NO tiene paridad garantizada: devuelve cualquier entero de 8 a 64.`);
console.log(`Barrido del dominio: largo de mesa L de 10 a 130 m paso 0,5 · torsión por encima y por debajo`);
console.log(`de 0,5° · rasante 1 y 2 (zen > 84°). Se cuenta cuántas combinaciones dan MV impar:`);
let impares = 0, total = 0; const ejemplos = [];
for (const rasante of [1, 2]) for (const div of [2, 4]) for (let L = 10; L <= 130; L += 0.5) {
  const mv = Math.max(8, Math.min(64, Math.ceil(rasante * L / div))); total++;
  if (mv % 2) { impares++; if (ejemplos.length < 8) ejemplos.push({ rasante, div, L, mv }); }
}
console.log(`   combinaciones probadas: ${total} · dan MV IMPAR: ${impares}  (${(100*impares/total).toFixed(1)} %)`);
console.log(`   primeros ejemplos: ` + ejemplos.map(e => `L=${e.L} tor${e.div===2?'≥':'<'}0,5 rasante=${e.rasante} ⇒ MV=${e.mv}`).join(' · '));
console.log(`   el caso B de esta auditoría: L = ${(2*28*1.146+0.55).toFixed(2)} m · torsión máx ${Math.max(...T.rowTilt.slice(1).map((v,i)=>Math.abs(v-T.rowTilt[i]))).toFixed(3)}° · zen ${g.zen.toFixed(2)}° ⇒ mvPara = ${F.mvPara(T, g.zen)}`);
fs.writeFileSync(path.join(OUT, 'E4_estaciones.csv'), 'theta_deg,j,v_m,fraccion,ala,centro_exacto\n' + filas.join('\n') + '\n');
console.log(`\nCSV: audit2/out/E4_estaciones.csv`);
