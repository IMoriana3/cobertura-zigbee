#!/usr/bin/env node
/* 1 — CARACTERIZACIÓN DE LAS DIVERGENCIAS JS↔tracker3d.py, sin compute nuevo.
   Descartados los tres candidatos (E-G3, E-G4), este ítem DESCRIBE la
   divergencia lo bastante para que otro pueda buscarla. No propone causa.
   Lee audit2/out/G1_js.json y G1_py.json, y recalcula la columna «¿se movió al
   desactivar repairNoShade?» con el mismo parche declarado en E-G4.
   Ejecutable:  node audit2/G5_caracteriza.mjs
   Salida: audit2/out/G5.txt (stdout) + audit2/out/G5.csv                     */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { CANON, caso } from './lib_motor.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const JS = JSON.parse(fs.readFileSync(path.join(OUT, 'G1_js.json'), 'utf-8'));
const PY = JSON.parse(fs.readFileSync(path.join(OUT, 'G1_py.json'), 'utf-8'));

/* motor original y motor con repairNoShadeCore anulado — el parche de E-G4 */
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const FIRMA = 'function repairNoShadeCore(zen,az,T,ang,irr,doy,albedo){';
let src = html.slice(j0, i1);
const p0 = src.indexOf(FIRMA), pAbre = p0 + FIRMA.length - 1;
let d = 0, pCierra = -1;
for (let k = pAbre; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) { pCierra = k; break; } } }
const srcP = src.slice(0, pAbre) + '{ return ang; }' + src.slice(pCierra + 1);
const EXP = ['policyAngles','poaPlant','solarPos','clearskyIneichen','pairsFromElev','mulberry32','VER'];
const mk = t => { const dev = EXP.map(n => `typeof ${n}!=='undefined'?${n}:undefined`).join(',');
  const a = new Function(sol + '\n' + t + `return [${dev}];`)(); const o = {}; EXP.forEach((n, i) => { o[n] = a[i]; }); return o; };
const FO = mk(src), FP = mk(srcP);

console.log('═'.repeat(104));
console.log(`E-G5 · caracterización de las divergencias JS ↔ tracker3d.py · commit ${SHA} · node ${process.version}`);
console.log(`fuente: audit2/out/G1_js.json y G1_py.json (rejilla de E-G1) · columna del parche recalculada como en E-G4`);
console.log('═'.repeat(104));

/* ── construir la rejilla completa con todo lo que hace falta ───────────── */
const TODO = [];
for (const cual of ['A', 'B']) {
  const cj = JS.casos[cual], cp = PY.casos[cual];
  const T = caso(FO, cual), Tp = caso(FP, cual);
  const tors = Math.max(...cj.rowTilt.slice(1).map((v, i) => Math.abs(v - cj.rowTilt[i])));
  for (let i = 0; i < cj.instantes.length; i++) {
    const I = cj.instantes[i], irr = { ghi: I.ghi, dni: I.dni, dhi: I.dhi };
    for (const k of JS.politicas) {
      const B = cp.instantes[i].ang[k]; if (!B) continue;
      const A = I.ang[k];
      const AP = FP.policyAngles(k, I.zen, I.az, Tp, irr, CANON.doy, CANON.albedo).angles;
      // por FILA, no por política: E-G4 lo reporta por fila y las dos tablas tienen que decir lo mismo
      const poaJ = I.poa[k], poaP = cp.instantes[i].poa[k];
      for (let r = 0; r < A.length; r++)
        TODO.push({ cual, hora: I.hora, elev: I.elev, az: I.az, tors, k, r,
                    js: A[r], py: B[r], d: A[r] - B[r], ad: Math.abs(A[r] - B[r]),
                    dpoa: (poaJ != null && poaP != null) ? poaJ - poaP : null,
                    movio: Math.abs(A[r] - AP[r]) > 1e-9,
                    movioPol: A.some((v, q) => Math.abs(v - AP[q]) > 1e-9) });
    }
  }
}
const ORD = TODO.slice().sort((x, y) => y.ad - x.ad);
const T14 = ORD.slice(0, 14);

console.log(`\n── 1.1 · LAS 14 DIVERGENCIAS MAYORES ─────────────────────────────────`);
console.log(` #  caso hora   política  fila  elev°   azimut°  torsión°   θ_JS      θ_PY     Δθ con signo   ΔPOA      ¿se movió sin repair?  (fila / política)`);
for (let i = 0; i < T14.length; i++) { const o = T14[i];
  console.log(` ${String(i+1).padStart(2)}  ${o.cual}   ${o.hora}  ${o.k.padEnd(8)}  ${String(o.r).padStart(3)}  ${o.elev.toFixed(2).padStart(6)}  ${o.az.toFixed(2).padStart(8)}  ${o.tors.toFixed(3).padStart(8)}  ${o.js.toFixed(2).padStart(7)}  ${o.py.toFixed(2).padStart(7)}  ${(o.d>=0?'+':'')+o.d.toFixed(3).padStart(9)}  ${o.dpoa==null?'—':((o.dpoa>=0?'+':'')+o.dpoa.toFixed(3)).padStart(9)}  ${(o.movio ? 'SÍ' : 'no').padEnd(3)} / ${o.movioPol ? 'SÍ' : 'no'}`); }

console.log(`\n── 1.2 · COMPARACIONES NUMÉRICAS ─────────────────────────────────────`);
const sig = a => ({ pos: a.filter(o => o.d > 1e-9).length, neg: a.filter(o => o.d < -1e-9).length, cero: a.filter(o => Math.abs(o.d) <= 1e-9).length });
const media = a => a.reduce((s, o) => s + o.d, 0) / (a.length || 1);
const div = TODO.filter(o => o.ad > 1e-9);
console.log(`\n  (a) ¿el JS va más EMPINADO o más PLANO que el Python?`);
console.log(`      Δθ = θ_JS − θ_PY. Nota: θ>0 y θ<0 son lados distintos del eje, así que el SIGNO de Δθ`);
console.log(`      no es «más empinado»: se dan los dos, el signo de Δθ y el de |θ_JS| − |θ_PY|.`);
for (const [nm, a] of [['las 14 mayores', T14], ['toda la rejilla con Δθ ≠ 0', div], ['la rejilla completa', TODO]]) {
  const s = sig(a);
  const mag = a.map(o => Math.abs(o.js) - Math.abs(o.py));
  const mp = mag.filter(v => v > 1e-9).length, mn = mag.filter(v => v < -1e-9).length;
  console.log(`      ${nm.padEnd(28)} n=${String(a.length).padStart(3)} · Δθ>0 ${String(s.pos).padStart(3)} · Δθ<0 ${String(s.neg).padStart(3)} · Δθ=0 ${String(s.cero).padStart(3)} · media con signo ${media(a).toFixed(4).padStart(9)}°`);
  console.log(`      ${' '.repeat(28)} |θ_JS|>|θ_PY| ${String(mp).padStart(3)} · |θ_JS|<|θ_PY| ${String(mn).padStart(3)}  ⇒ ${mn > mp ? 'el JS va MÁS PLANO' : mp > mn ? 'el JS va MÁS EMPINADO' : 'alterna'}`);
}
console.log(`\n  (b) ¿se concentran en alguna política?`);
console.log(`      política    en las 14   en la rejilla (Δθ≠0 / total)   |Δθ| máx`);
for (const k of JS.politicas) {
  const en14 = T14.filter(o => o.k === k).length;
  const tod = TODO.filter(o => o.k === k), dd = tod.filter(o => o.ad > 1e-9);
  if (!tod.length) { console.log(`      ${k.padEnd(10)} ${String(en14).padStart(9)}   NO COMPARABLE (sin contraparte en tracker3d.py)`); continue; }
  console.log(`      ${k.padEnd(10)} ${String(en14).padStart(9)}   ${String(dd.length).padStart(14)} / ${String(tod.length).padStart(3)}            ${Math.max(...tod.map(o => o.ad)).toFixed(4).padStart(8)}°`);
}
console.log(`\n  (c) ¿relación con la torsión máxima entre vecinas?`);
const tset = [...new Set(TODO.map(o => +o.tors.toFixed(3)))].sort((a, b) => a - b);
console.log(`      valores de torsión presentes en la rejilla: ${tset.join(', ')}°   (sólo ${tset.length}: caso A y caso B)`);
for (const t of tset) { const a = TODO.filter(o => +o.tors.toFixed(3) === t);   // agrupar por la MISMA clave redondeada con la que se construyó tset
  if (!a.length) { console.log(`      torsión ${t.toFixed(3).padStart(6)}° : sin valores`); continue; }
  console.log(`      torsión ${t.toFixed(3).padStart(6)}° : n=${String(a.length).padStart(3)} · Δθ≠0 en ${String(a.filter(o => o.ad > 1e-9).length).padStart(3)} · |Δθ| máx ${Math.max(...a.map(o => o.ad)).toFixed(4).padStart(8)}° · mediana ${(o=>o[Math.min(o.length-1,Math.floor(o.length/2))])(a.map(q=>q.ad).sort((x,y)=>x-y)).toFixed(4)}°`); }
console.log(`      rango de torsión de las 14 : ${Math.min(...T14.map(o=>o.tors)).toFixed(3)}…${Math.max(...T14.map(o=>o.tors)).toFixed(3)}°`);
console.log(`      rango de torsión de la rejilla: ${Math.min(...TODO.map(o=>o.tors)).toFixed(3)}…${Math.max(...TODO.map(o=>o.tors)).toFixed(3)}°`);
console.log(`      La rejilla sólo tiene DOS valores de torsión, así que no admite ajuste ni tendencia:`);
console.log(`      lo único que se puede afirmar es en cuál de los dos aparecen las divergencias.`);
console.log(`\n  (d) ¿coinciden los SIGNOS de θ_JS y θ_PY en las 14?`);
let opuestos = 0;
for (const o of T14) { const sj = Math.sign(o.js), sp = Math.sign(o.py); if (sj !== 0 && sp !== 0 && sj !== sp) opuestos++; }
console.log(`      apuntan a lados OPUESTOS del eje: ${opuestos} de 14`);
console.log(`      detalle: ` + T14.map(o => `${o.js.toFixed(0)}/${o.py.toFixed(0)}`).join(' · '));

console.log(`\n── 1.3 · ¿HAY DIVERGENCIA SIN TORSIÓN? ───────────────────────────────`);
const sinTor = TODO.filter(o => Math.abs(o.tors) < 1e-9 && o.ad > 1e-9);
const nTor0 = TODO.filter(o => Math.abs(o.tors) < 1e-9).length;
console.log(`      valores de la rejilla con torsión N-S = 0 : ${nTor0}  (el caso A entero: tilt N-S 0,00 en las 6 filas)`);
console.log(`      de ellos, con |Δθ| > 0 : ${sinTor.length}`);
if (!sinTor.length) console.log(`      ⇒ divergencia SIN torsión: NO EXISTE en la rejilla medida.`);
else { console.log(`      ⇒ SÍ existe. Los casos:`);
  for (const o of sinTor.slice(0, 10)) console.log(`         ${o.cual} ${o.hora} ${o.k} fila ${o.r}: JS ${o.js.toFixed(4)} · PY ${o.py.toFixed(4)} · Δθ ${o.d.toFixed(6)}`); }
console.log(`      cita del tilt del caso A, audit2/lib_motor.mjs (función caso):`);
console.log(`         for (let i = 0; i < nR; i++) tilts.push(cual === 'B' ? (r() * 2 - 1) * 4 : 0);`);
console.log(`      y el eco de la corrida (audit2/out/G1_js.json): caso A · tilt N-S 0.00 ×6.`);

fs.writeFileSync(path.join(OUT, 'G5.csv'), 'caso,hora,elev,azimut,torsion,politica,fila,theta_JS,theta_PY,dtheta_con_signo,dPOA,se_movio_fila,se_movio_politica\n' +
  ORD.map(o => [o.cual, o.hora, o.elev.toFixed(4), o.az.toFixed(4), o.tors.toFixed(4), o.k, o.r, o.js.toFixed(6), o.py.toFixed(6), o.d.toFixed(6), o.dpoa == null ? '' : o.dpoa.toFixed(6), o.movio ? 1 : 0, o.movioPol ? 1 : 0].join(',')).join('\n') + '\n');
console.log(`\nCSV: audit2/out/G5.csv (${ORD.length} filas, ordenadas por |Δθ|)`);
