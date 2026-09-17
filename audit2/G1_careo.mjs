#!/usr/bin/env node
/* G.1 (careo) — |Δθ| por fila y |ΔPOA| por política entre G1_js.json y G1_py.json.
   El signo de θ NO tiene por qué coincidir (el JS declara θ>0 = este internamente,
   backtracking.html:4012-4016): se prueban las DOS convenciones y se informa de cuál
   deja el |Δ| menor, por política; no se elige en silencio.
   Ejecutable:  node audit2/G1_careo.mjs      (antes: G1_js.mjs y G1_py.py)     */
import fs from 'node:fs'; import path from 'node:path'; import { ROOT } from './lib_motor.mjs';
const OUT = path.join(ROOT, 'audit2', 'out');
const JS = JSON.parse(fs.readFileSync(path.join(OUT, 'G1_js.json'), 'utf-8'));
const PY = JSON.parse(fs.readFileSync(path.join(OUT, 'G1_py.json'), 'utf-8'));
console.log('═'.repeat(96));
console.log(`E-G1 · careo JS ↔ tracker3d.py`);
console.log(`JS     commit ${JS.commit} · VER ${JS.VER} · node ${JS.node}`);
console.log(`Python ${PY.python} · numpy ${PY.numpy} · ${PY.tracker3d}`);
console.log(`rejilla: casos {A, B} × 9 políticas × horas {${JS.horas.join(', ')}} locales del 21-jun-2026 (tz +2)`);
console.log(`parámetros canónicos: lat ${JS.canon.lat} lon ${JS.canon.lon} alt ${JS.canon.alt} m · TL ${JS.canon.tl} · albedo ${JS.canon.albedo}`);
console.log(`                      6 filas · pitch ${JS.canon.pitch} · cuerda ${JS.canon.cw} · z0 ${JS.canon.z0} · ±${JS.canon.maxAngle}° · axisAz ${JS.canon.axisAz} · nb ${JS.canon.nBypass}`);
console.log(`el sol (zen, az) y la irradiancia (GHI/DNI/DHI) se pasan IDÉNTICOS al Python: la comparación aísla el motor.`);
console.log(`MV del lado JS: el adaptativo publicado. El Python no tiene malla axial (contador 2.5D): declarado.`);
console.log('═'.repeat(96));
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };
const filas = [];
for (const cual of ['A', 'B']) {
  const cj = JS.casos[cual], cp = PY.casos[cual];
  console.log(`\n══ CASO ${cual} ══ tilt N-S ${cj.rowTilt.map(v => v.toFixed(2)).join(' ')} · pendiente ${cj.pairs[0].slope.toFixed(2)}°`);
  console.log(` política   conv.  |Δθ| máx    |Δθ| mediana   POA JS (media)  POA PY (media)  |ΔPOA| máx  |ΔPOA| mediana  n`);
  for (const k of JS.politicas) {
    const dPos = [], dNeg = [], dP = [], pj = [], pp = [];
    for (let i = 0; i < cj.instantes.length; i++) {
      const A = cj.instantes[i].ang[k], B = cp.instantes[i].ang[k];
      if (!B) continue;
      for (let r = 0; r < A.length; r++) { dPos.push(Math.abs(A[r] - B[r])); dNeg.push(Math.abs(A[r] + B[r])); }
      const a = cj.instantes[i].poa[k], b = cp.instantes[i].poa[k];
      if (b != null) { dP.push(Math.abs(a - b)); pj.push(a); pp.push(b); }
    }
    if (!dPos.length) { console.log(` ${k.padEnd(10)} —      NO COMPARABLE: ${cp.instantes[0].error[k]}`); continue; }
    const usaNeg = med(dNeg) < med(dPos);
    const d = usaNeg ? dNeg : dPos;
    console.log(` ${k.padEnd(10)} ${(usaNeg ? 'θpy=−θjs' : 'θpy=+θjs').padEnd(9)} ${Math.max(...d).toFixed(4).padStart(8)}°  ${med(d).toFixed(4).padStart(11)}°  ` +
      `${(pj.reduce((a,b)=>a+b,0)/pj.length).toFixed(4).padStart(14)}  ${(pp.reduce((a,b)=>a+b,0)/pp.length).toFixed(4).padStart(14)}  ` +
      `${Math.max(...dP).toFixed(4).padStart(10)}  ${med(dP).toFixed(4).padStart(13)}  ${String(d.length).padStart(3)}`);
    filas.push([cual, k, usaNeg ? 'neg' : 'pos', Math.max(...d).toFixed(6), med(d).toFixed(6), Math.max(...dP).toFixed(6), med(dP).toFixed(6), d.length].join(','));
  }
  console.log(`\n  detalle por instante y fila (|Δθ| con la convención elegida arriba):`);
  for (const k of JS.politicas) {
    if (!cp.instantes[0].ang[k]) continue;
    const usaNeg = (() => { const p = [], n = [];
      for (let i = 0; i < cj.instantes.length; i++) { const A = cj.instantes[i].ang[k], B = cp.instantes[i].ang[k];
        for (let r = 0; r < A.length; r++) { p.push(Math.abs(A[r]-B[r])); n.push(Math.abs(A[r]+B[r])); } } return med(n) < med(p); })();
    console.log(`   ${k}:`);
    for (let i = 0; i < cj.instantes.length; i++) { const A = cj.instantes[i].ang[k], B = cp.instantes[i].ang[k];
      const dd = A.map((v, r) => Math.abs(usaNeg ? v + B[r] : v - B[r]));
      console.log(`     ${cj.instantes[i].hora}  JS ${A.map(v=>v.toFixed(2).padStart(7)).join(' ')}`);
      console.log(`            PY ${B.map(v=>v.toFixed(2).padStart(7)).join(' ')}   |Δ| ${dd.map(v=>v.toFixed(3).padStart(7)).join(' ')}`); }
  }
}
fs.writeFileSync(path.join(OUT, 'G1_careo.csv'), 'caso,politica,convencion_signo,dtheta_max_deg,dtheta_mediana_deg,dpoa_max_Wm2,dpoa_mediana_Wm2,n_filas_instante\n' + filas.join('\n') + '\n');
console.log(`\nCSV: audit2/out/G1_careo.csv`);
