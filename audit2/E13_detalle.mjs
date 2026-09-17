#!/usr/bin/env node
/* E.1 (detalle por fila del salto) y E.3 (tramo 54,25 vs 55,00 con MV alto).
   Ejecutable:  node audit2/E13_detalle.mjs                                     */
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const F = motorDe('HEAD'), T = caso(F, 'B');
console.log(echo('E-E1b / E-E3 · detalle por fila y tramo 54,25–55,00', F, T).texto);
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const filaFs = (ang, noStruct) => { const sh = F.shadeBand3DAll(g.zen, g.az, T, ang, noStruct ? { noStruct: true } : {});
  const out = []; for (let r = 0; r < 6; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : [];
    out.push(noStruct ? Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0)) : sh[r]); } return out; };

console.log(`\n── E.1b · el salto 21,91° → 21,92°, fila a fila (MV = mvPara(T,zen) = ${F.mvPara(T, g.zen)}) ──`);
console.log(`   θ       fs PLANOS por fila [0..5] (%)                                 máx   fila del máx`);
for (const th of [21.90, 21.91, 21.92, 21.93]) {
  const v = filaFs(new Array(6).fill(th), true);
  let bi = 0; for (let r = 1; r < 6; r++) if (v[r] > v[bi]) bi = r;
  console.log(`  ${th.toFixed(2)}°  ${v.map(q => (100*q).toFixed(4).padStart(9)).join(' ')}   ${(100*v[bi]).toFixed(4)} %   fila ${bi}`);
}
console.log(`\n   θ       fs PUBLICADA por fila [0..5] (%)                              máx   fila del máx`);
for (const th of [21.90, 21.91, 21.92, 21.93]) {
  const v = filaFs(new Array(6).fill(th), false);
  let bi = 0; for (let r = 1; r < 6; r++) if (v[r] > v[bi]) bi = r;
  console.log(`  ${th.toFixed(2)}°  ${v.map(q => (100*q).toFixed(4).padStart(9)).join(' ')}   ${(100*v[bi]).toFixed(4)} %   fila ${bi}`);
}
console.log(`\nel mismo salto con MV forzado (T.mv), para separar cuantización de geometría:`);
console.log(`   MV     fs PLANOS 21,91°   fs PLANOS 21,92°   salto`);
for (const mv of [8, 16, 32, 33, 64, 128, 256]) { T.mv = mv;
  const a = Math.max(...filaFs(new Array(6).fill(21.91), true)), b = Math.max(...filaFs(new Array(6).fill(21.92), true));
  console.log(`  ${String(mv).padStart(4)}   ${(100*a).toFixed(4).padStart(15)} %  ${(100*b).toFixed(4).padStart(15)} %  ${(100*(b-a)).toFixed(4).padStart(8)} pp`); }
delete T.mv;

console.log(`\n── E.3 · tramo 54,00…55,00 paso 0,25° con MV creciente ──`);
console.log(`   MV        54.00       54.25       54.50       54.75       55.00      argmax del tramo   argmax en -55…55`);
const THs = [54.00, 54.25, 54.50, 54.75, 55.00];
const TODOS = []; for (let t = -55; t <= 55 + 1e-9; t += 0.25) TODOS.push(+t.toFixed(4));
for (const mv of [8, 16, 32, 33, 64, 128, 256]) {
  T.mv = mv;
  const v = THs.map(th => F.poaPlant(g.zen, g.az, T, new Array(6).fill(th), irr, CANON.doy, CANON.albedo).plant);
  let bi = 0; for (let i = 1; i < v.length; i++) if (v[i] > v[bi]) bi = i;
  const y = TODOS.map(th => F.poaPlant(g.zen, g.az, T, new Array(6).fill(th), irr, CANON.doy, CANON.albedo).plant);
  let gj = 0; for (let i = 1; i < y.length; i++) if (y[i] > y[gj]) gj = i;
  console.log(`  ${String(mv).padStart(4)}  ${v.map(q => q.toFixed(4).padStart(10)).join('  ')}      ${String(THs[bi]).padStart(6)}°            ${String(TODOS[gj]).padStart(7)}°`);
}
delete T.mv;
console.log(`\n(sin forzar MV el motor usa mvPara(T,zen) = ${F.mvPara(T, g.zen)})`);
