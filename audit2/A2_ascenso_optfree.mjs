#!/usr/bin/env node
/* A.2 — instrumentación del ASCENSO de `anglesOptimalFree` (backtracking.html:2938-3040).
   Se replica el ascenso VERBATIM (mismas líneas, mismas funciones exportadas) y se
   anota barrido a barrido. No se modifica el motor: el original sigue intacto y al
   final se compara el resultado replicado con el que publica anglesOptimalFree().
   Ejecutable:  node audit2/A2_ascenso_optfree.mjs [A|B]                        */
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const CUAL = (process.argv[2] || 'B').toUpperCase();
const F = motorDe('HEAD'), T = caso(F, CUAL);
console.log(echo(`E-A2 · ascenso de anglesOptimalFree · caso ${CUAL}`, F, T).texto);

const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const zen = g.zen, az = g.az, doy = CANON.doy, alb = CANON.albedo;
const POA = ang => F.poaPlant(zen, az, T, ang, irr, doy, alb).plant;          // contador EXACTO (ray-cast 3D)
const POAF = ang => F.poaPlant(zen, az, T, ang, irr, doy, alb, true).plant;   // métrica del ARRANQUE (2.5D, fast=true)

/* ── réplica literal de backtracking.html:2939-3000 ─────────────────────── */
const base = F.driveCoupleSafe(zen, az, T, F.anglesPairwise(zen, az, T), false);
const full = F.applyDrive(F.anglesAstro(zen, az, T), T.groups || null);
const nR = T.pairs.length + 1;
const seen = new Set(); const units = [];
for (const gr of (T.groups || [])) { units.push(gr.slice().sort((a, b) => a - b)); gr.forEach(r => seen.add(r)); }
for (let r = 0; r < nR; r++) if (!seen.has(r)) units.push([r]);
units.sort((a, b) => a[0] - b[0]);
const unitOf = new Array(nR); units.forEach((u, i) => u.forEach(r => unitOf[r] = i));
const GRID = []; for (let i = 0; i < F.OPTFREE_NF; i++) GRID.push(F.OPTFREE_F0 + (1 - F.OPTFREE_F0) * i / (F.OPTFREE_NF - 1));
const angs = [];
for (let r = 0; r < nR; r++) angs.push(GRID.map(f => Math.max(-T.maxAngle, Math.min(T.maxAngle, base[r] + f * (full[r] - base[r])))));
const k = new Array(units.length).fill(0);
const angAt = r => angs[r][k[unitOf[r]]];
const juego = () => { const a = []; for (let r = 0; r < nR; r++) a.push(angAt(r)); return a; };

console.log(`\nVECINDAD Y TOPES (citas):`);
console.log(`  unidades de accionamiento : ${units.length}  ·  ${JSON.stringify(units)}   (drive '${T.drive}', T.groups = ${JSON.stringify(T.groups)})`);
console.log(`  rejilla de f por unidad   : OPTFREE_NF = ${F.OPTFREE_NF} puntos, OPTFREE_F0 = ${F.OPTFREE_F0} … 1`);
console.log(`                              [${GRID.map(v => v.toFixed(4)).join(', ')}]`);
console.log(`  vecindad que mira cada unidad (backtracking.html:2996-2999): sus filas + la inmediata anterior + la inmediata posterior`);
console.log(`  criterio                 : suma de rowVal(r) sobre esa vecindad (2984-2986) — beam·(1−elecLoss(f,nb)) + circ·(1−f) + sky + gnd,`);
console.log(`                             con la sombra del 2.5D acoplado pairShade25×axialCoverage (2978-2983). NO es el ray-cast.`);
console.log(`  tope de convergencia     : 8 barridos (2992) o un barrido sin cambio (3006: if(!changed)break)`);
console.log(`  orden                    : alterno — pares hacia delante, impares invertido (2994)`);

// arranque: mejor f COMÚN bajo la métrica del arranque (poaPlant fast=true, 2988)
let bestK = 0, bestS = -Infinity;
const arranque = [];
for (let kk = 0; kk < F.OPTFREE_NF; kk++) { k.fill(kk); const s = POAF(juego()); arranque.push(s); if (s > bestS + 1e-12) { bestS = s; bestK = kk; } }
k.fill(bestK);
const startAng = juego();
console.log(`\nARRANQUE (mejor f común bajo poaPlant(...,fast=true), backtracking.html:2986-2991):`);
console.log(`   f      POA_arranque(2.5D)   POA_exacta(ray-cast)`);
for (let kk = 0; kk < F.OPTFREE_NF; kk++) { k.fill(kk);
  console.log(`  ${GRID[kk].toFixed(4).padStart(7)}  ${arranque[kk].toFixed(4).padStart(14)}  ${POA(juego()).toFixed(4).padStart(18)}${kk === bestK ? '   ← bestK' : ''}`); }
k.fill(bestK);
console.log(`  bestK = ${bestK} (f = ${GRID[bestK].toFixed(4)})  ·  bestS = ${bestS.toFixed(4)} W/m² (métrica del arranque)`);

/* rowVal replicado (2978-2986) */
const psz = T.pairs.map(pr => F.trueTrackAngle(zen, az, F.pvTilt(pr.axisTilt), T.axisAz));
const axc = T.pairs.map((_, p) => F.axialCoverage(zen, az, T, p));
const noShade = !(isFinite(zen) && zen < 87);
const val = []; for (let r = 0; r < nR; r++) val.push(angs[r].map(a => F.poaRow(a, F.rowTiltAt(T, r), T.axisAz, zen, az, irr, doy, alb, T.iam)));
const pairContrib = p => noShade ? 0 : F.pairShade25(zen, az, T, p, angAt(p), angAt(p + 1)) * axc[p];
const shadeOf = r => { let s = 0; if (r > 0 && psz[r - 1] < 0) s = Math.max(s, pairContrib(r - 1)); if (r < nR - 1 && psz[r] >= 0) s = Math.max(s, pairContrib(r)); return s; };
const rowVal = r => { const v = val[r][k[unitOf[r]]], f = shadeOf(r); return v.beam * (1 - F.elecLoss(f, T.nBypass)) + v.circ * (1 - f) + v.sky + v.gnd; };

console.log(`\nASCENSO — un renglón por barrido:`);
console.log(`  bar  cambios  f por unidad                                            POA_arranque(2.5D)   POA_exacta`);
console.log(`   ${String(0).padStart(2)}    inicio  ${k.map(kk => GRID[kk].toFixed(3).padStart(7)).join(' ')}  ${POAF(juego()).toFixed(4).padStart(14)}  ${POA(juego()).toFixed(4).padStart(12)}`);
let sweeps = 0;
for (let sweep = 0; sweep < 8; sweep++) {
  sweeps = sweep + 1;
  let changed = 0;
  const order = [...units.keys()]; if (sweep % 2) order.reverse();
  for (const ui of order) {
    const u = units[ui], R = [...u];
    if (u[0] > 0) R.push(u[0] - 1);
    if (u[u.length - 1] < nR - 1) R.push(u[u.length - 1] + 1);
    const k0 = k[ui]; let bk = k0, bs = -Infinity;
    for (let kk = 0; kk < F.OPTFREE_NF; kk++) { k[ui] = kk; let s = 0; for (const r of R) s += rowVal(r); if (s > bs + 1e-12) { bs = s; bk = kk; } }
    k[ui] = bk; if (bk !== k0) changed++;
  }
  console.log(`   ${String(sweeps).padStart(2)}    ${String(changed).padStart(6)}  ${k.map(kk => GRID[kk].toFixed(3).padStart(7)).join(' ')}  ${POAF(juego()).toFixed(4).padStart(14)}  ${POA(juego()).toFixed(4).padStart(12)}`);
  if (!changed) break;
}
const ang = juego();
console.log(`\nbarridos hasta converger : ${sweeps} (el último sin cambios; tope 8)`);
console.log(`f final por unidad       : ${k.map((kk, i) => `u${i}[${units[i]}] = ${GRID[kk].toFixed(4)}`).join('  ·  ')}`);
console.log(`θ final del ascenso      : ${ang.map(a => a.toFixed(3)).join('  ')}`);

const saltaSalv = POAF(ang) < bestS - 1e-9;
console.log(`\nSALVAGUARDA (backtracking.html:3009-3010) «si bajo la MISMA métrica del arranque el ascenso no mejora, se queda el arranque»:`);
console.log(`   POA_arranque(2.5D) del ascenso ${POAF(ang).toFixed(4)}   vs   bestS ${bestS.toFixed(4)}   ⇒ ${saltaSalv ? 'SE QUEDA EL ARRANQUE' : 'se queda el ascenso'}`);
let cand = saltaSalv ? startAng : ang;
console.log(`   cand tras la salvaguarda : POA exacta ${POA(cand).toFixed(4)} W/m²`);
const co = F.anglesOptimal(zen, az, T, irr, doy, alb);
const ganaOpt = POA(co.angles) > POA(cand) + 1e-9;
console.log(`ELECCIÓN EXACTA contra energy-optimal (3015-3018): optimal POA ${POA(co.angles).toFixed(4)}  ⇒ ${ganaOpt ? 'GANA optimal' : 'se queda cand'}`);
if (ganaOpt) cand = co.angles;
const pub = F.repairNoShade(zen, az, T, base, irr, doy, alb);
const ganaPub = POA(pub) > POA(cand) + 1e-9;
console.log(`SUELO pairwise PUBLICADO (3020-3021): POA ${POA(pub).toFixed(4)}  ⇒ ${ganaPub ? 'GANA pairwise publicado' : 'no gana'}`);
if (ganaPub) cand = pub;
console.log(`REPARACIÓN final (3025-3035, sólo con sol < 40°; aquí sol ${(90-zen).toFixed(2)}°): ${(90-zen)>=40 ? 'NO se ejecuta (sol >= 40°)' : 'se ejecuta si el ray-cast ve sombra > 1e-3'}`);
console.log(`cand al final de la cadena replicada: POA ${POA(cand).toFixed(4)} W/m²  ·  θ ${cand.map(a=>a.toFixed(3)).join('  ')}`);

const r = F.anglesOptimalFree(zen, az, T, irr, doy, alb);
console.log(`\nanglesOptimalFree() PUBLICADO por el motor sin tocar:`);
console.log(`   f = ${JSON.stringify(r.f)}`);
console.log(`   θ = ${r.angles.map(a => a.toFixed(3)).join('  ')}`);
console.log(`   POA = ${POA(r.angles).toFixed(4)} W/m²`);
console.log(`   ¿coincide θ con la cadena replicada completa? ${r.angles.every((a, i) => Math.abs(a - cand[i]) < 1e-9) ? 'SÍ (|Δ| < 1e-9 en las 6 filas)' : 'NO — Δmax ' + Math.max(...r.angles.map((a, i) => Math.abs(a - cand[i]))).toExponential(3)}`);
