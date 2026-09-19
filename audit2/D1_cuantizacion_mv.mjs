#!/usr/bin/env node
/* D.1 — barrido de θ uniforme del caso B (paso 0,25°) con MV = 8, 16, 32, 64, 128.
   MV se fuerza con `T.mv`, que en `mvPara` gana a TODO lo demás:
     backtracking.html:842-845   if(!T)return 8; if(T.mv)return T.mv; if(T.real)return 8;
   Ejecutable:  node audit2/D1_cuantizacion_mv.mjs [A|B]
   Salida: audit2/out/D1_barrido.csv  +  resumen por stdout                     */
import fs from 'node:fs'; import path from 'node:path';
import { motorDe, CANON, caso, echo, ROOT } from './lib_motor.mjs';
const CUAL = (process.argv[2] || 'B').toUpperCase();
const F = motorDe('HEAD'), T = caso(F, CUAL);
console.log(echo(`E-D1 · cuantización axial · caso ${CUAL} · barrido de θ paso 0,25°`, F, T).texto);
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const MVS = [8, 16, 32, 64, 128];
const TH = []; for (let t = -55; t <= 55 + 1e-9; t += 0.25) TH.push(+t.toFixed(4));
console.log(`MV adaptativo que publicaría el motor sin forzar: mvPara(T,zen) = ${F.mvPara(T, g.zen)}`);
console.log(`MV forzados: ${MVS.join(', ')}  ·  vía T.mv  ·  ${TH.length} ángulos de -55° a +55°\n`);

/* oscilación local no monótona: sobre la serie POA(θ), se localizan los extremos
   locales estrictos; para cada mínimo local encajonado entre dos máximos locales
   la amplitud pico-pico es min(máx.izq, máx.der) − mínimo (y simétrico para un
   máximo local encajonado). Es la definición que se usa abajo; se declara. */
function oscilaciones(y) {
  const ext = []; // [i, 'max'|'min']
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] > y[i + 1]) ext.push([i, 'max']);
    else if (y[i] < y[i - 1] && y[i] < y[i + 1]) ext.push([i, 'min']);
  }
  const pp = [];
  for (let j = 1; j < ext.length - 1; j++) {
    const [i0, t0] = ext[j - 1], [i1, t1] = ext[j], [i2, t2] = ext[j + 1];
    if (t1 === 'min' && t0 === 'max' && t2 === 'max') pp.push([Math.min(y[i0], y[i2]) - y[i1], i1]);
    if (t1 === 'max' && t0 === 'min' && t2 === 'min') pp.push([y[i1] - Math.max(y[i0], y[i2]), i1]);
  }
  return { nExt: ext.length, pp };
}
const filas = [], res = {};
for (const mv of MVS) {
  T.mv = mv;
  const y = TH.map(th => F.poaPlant(g.zen, g.az, T, new Array(6).fill(th), irr, CANON.doy, CANON.albedo).plant);
  const fsp = TH.map(th => { const sh = F.shadeBand3DAll(g.zen, g.az, T, new Array(6).fill(th), { noStruct: true }); let m = 0;
    for (let r = 0; r < 6; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : []; m = Math.max(m, Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); } return m; });
  let bi = 0; for (let i = 1; i < y.length; i++) if (y[i] > y[bi]) bi = i;
  const o = oscilaciones(y);
  const ppOrd = o.pp.slice().sort((a, b) => b[0] - a[0]);
  res[mv] = { y, argmax: TH[bi], max: y[bi], nExt: o.nExt, nPP: o.pp.length,
              ppMax: ppOrd.length ? ppOrd[0][0] : 0, ppMaxTh: ppOrd.length ? TH[ppOrd[0][1]] : null,
              ppSum: o.pp.reduce((a, q) => a + q[0], 0), fsArg: fsp[bi] };
  for (let i = 0; i < TH.length; i++) filas.push([mv, TH[i], y[i].toFixed(6), fsp[i].toExponential(8)].join(','));
}
delete T.mv;
fs.writeFileSync(path.join(ROOT, 'audit2', 'out', 'D1_barrido.csv'), 'MV,theta_deg,poa_planta_Wm2,fs_planos\n' + filas.join('\n') + '\n');
console.log(` MV   θ de POA máx   POA máx      fs PLANOS en ese θ   extremos locales   nº oscilaciones   pico-pico MAYOR (θ)        suma pp`);
for (const mv of MVS) { const r = res[mv];
  console.log(` ${String(mv).padStart(3)}  ${String(r.argmax).padStart(11)}°  ${r.max.toFixed(4).padStart(9)}  ${(100*r.fsArg).toFixed(4).padStart(17)} %  ${String(r.nExt).padStart(16)}  ${String(r.nPP).padStart(15)}  ${r.ppMax.toFixed(6).padStart(10)} (${r.ppMaxTh}°)  ${r.ppSum.toFixed(4).padStart(9)}`); }
const args = MVS.map(mv => res[mv].argmax);
console.log(`\n¿se mueve el argmax con MV?  ${new Set(args).size === 1 ? `NO — θ = ${args[0]}° en los 5 valores de MV` : 'SÍ — ' + MVS.map((mv, i) => `MV ${mv}: ${args[i]}°`).join(' · ')}`);
console.log(`dispersión de la POA máxima entre MV: ${(Math.max(...MVS.map(mv=>res[mv].max))-Math.min(...MVS.map(mv=>res[mv].max))).toFixed(6)} W/m²`);
console.log(`\ndiferencia máxima de POA(θ) frente a MV=128, por MV:`);
for (const mv of MVS) { let d = 0, dth = null;
  for (let i = 0; i < TH.length; i++) { const q = Math.abs(res[mv].y[i] - res[128].y[i]); if (q > d) { d = q; dth = TH[i]; } }
  console.log(`   MV ${String(mv).padStart(3)} : ${d.toFixed(6)} W/m² en θ = ${dth}°`); }
console.log(`\nCSV: audit2/out/D1_barrido.csv (${filas.length} filas)`);
