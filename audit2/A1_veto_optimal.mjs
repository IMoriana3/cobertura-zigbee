#!/usr/bin/env node
/* A.1 — lista de candidatas que llega al VETO de `anglesOptimal` en el caso B,
   con su f, su POA de BÚSQUEDA y su POA de VETO.
   La construcción de candidatas se replica VERBATIM de backtracking.html:
     búsqueda gruesa  2814-2825   ·  refinado  2879-2888(finas)  ·  veto 2914-2922
   Ejecutable:  node audit2/A1_veto_optimal.mjs [A|B]                          */
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const CUAL = (process.argv[2] || 'B').toUpperCase();
const F = motorDe('HEAD'), T = caso(F, CUAL);
console.log(echo(`E-A1 · candidatas del veto de anglesOptimal · caso ${CUAL}`, F, T).texto);

const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const zen = g.zen, az = g.az, doy = CANON.doy, alb = CANON.albedo;
const P  = (ang, fast) => F.poaPlant(zen, az, T, ang, irr, doy, alb, fast).plant;

// ── réplica literal de la construcción de candidatas ──────────────────────
const base = F.driveCoupleSafe(zen, az, T, F.anglesPairwise(zen, az, T), false);
const full = F.applyDrive(F.anglesAstro(zen, az, T), T.groups || null);
const angDe = f => base.map((b, i) => b + f * (full[i] - b));
const paso = (F.OPT_FRACTIONS.length > 1) ? (F.OPT_FRACTIONS[1] - F.OPT_FRACTIONS[0]) : 0.25;
let best = -Infinity, bestF = 0, bestAng = base;
for (const f of F.OPT_FRACTIONS) { const a = angDe(f), p = P(a); if (p > best + 1e-12) { best = p; bestAng = a; bestF = f; } }
const finas = [];
for (let j = 1; j <= F.OPT_REFINA; j++) { const d = paso * j / (F.OPT_REFINA + 1);
  for (const f2 of [bestF - d, bestF + d]) if (f2 > 0 && f2 < 1 && finas.indexOf(f2) < 0) finas.push(f2); }
for (const f2 of finas) { const a = angDe(f2), p = P(a); if (p > best + 1e-12) { best = p; bestAng = a; bestF = f2; } }
const pub = F.repairNoShade(zen, az, T, base, irr, doy, alb);

console.log(`ganadora de la BÚSQUEDA : f = ${bestF}   POA = ${best.toFixed(4)} W/m²`);
console.log(`prev = undefined (instante aislado) ⇒ retenida = false, retenidaDF = false ⇒ el veto CORRE ENTERO (backtracking.html:2913)`);
console.log(`OPT_FRACTIONS = [${F.OPT_FRACTIONS.join(', ')}]  ·  OPT_REFINA = ${F.OPT_REFINA}  ·  paso = ${paso}  ·  finas = [${finas.join(', ')}]`);
console.log(`\nCANDIDATAS QUE LLEGAN AL VETO (backtracking.html:2915-2917: OPT_FRACTIONS + [0,pub] + finas)`);
console.log(`  #  origen              f        θ por fila (°)                                       POA_busqueda   POA_veto     Δ`);
const cands = F.OPT_FRACTIONS.map(f2 => ['rejilla gruesa', f2, base.map((b, i) => b + f2 * (full[i] - b))]);
cands.push(['repairNoShade (pub)', 0, pub]);
for (const f2 of finas) cands.push(['refinado (finas)', f2, angDe(f2)]);
let eBest = P(bestAng), ganador = null;
const busq = new Map();
for (const f of F.OPT_FRACTIONS) busq.set('g' + f, P(angDe(f)));
for (const f of finas) busq.set('f' + f, P(angDe(f)));
let i = 0;
for (const [org, f2, ang2] of cands) {
  const veto = P(ang2);
  const b = org.startsWith('rejilla') ? busq.get('g' + f2) : org.startsWith('refinado') ? busq.get('f' + f2) : null;
  console.log(`  ${String(++i).padStart(2)}  ${org.padEnd(19)} ${String(f2).padStart(6)}  ${ang2.map(a => a.toFixed(2).padStart(7)).join(' ')}  ` +
              `${b === null ? '  no evaluada' : b.toFixed(4).padStart(12)}  ${veto.toFixed(4).padStart(10)}  ${b === null ? '   —' : (veto - b).toExponential(1)}`);
  if (veto > eBest + 1e-9) { eBest = veto; ganador = [org, f2, ang2]; }
}
console.log(`\nPOA de la ganadora de la búsqueda, reevaluada por el veto : ${P(bestAng).toFixed(4)} W/m²`);
console.log(`¿el veto CAMBIA la ganadora? ${ganador ? 'SÍ → ' + ganador[0] + ' f=' + ganador[1] + '  POA ' + eBest.toFixed(4) : 'NO (ninguna candidata supera a la de búsqueda por más de 1e-9)'}`);
const r = F.anglesOptimal(zen, az, T, irr, doy, alb);
console.log(`\nanglesOptimal() publicado : f = ${JSON.stringify(r.f)} · retenida ${r.retenida} · frenada ${r.frenada}`);
console.log(`  θ = ${r.angles.map(a => a.toFixed(3)).join('  ')}`);
console.log(`  POA = ${P(r.angles).toFixed(4)} W/m²  ·  sombra publicada por fila = ${F.poaPlant(zen,az,T,r.angles,irr,doy,alb).shade.map(v=>(100*v).toFixed(3)+'%').join(' ')}`);
console.log(`\nPOA con el evaluador RÁPIDO 2.5D (poaPlant(...,fast=true), backtracking.html:2457) para las mismas candidatas —`);
console.log(`  no interviene ya en la búsqueda de anglesOptimal desde v1.57.2 (2820-2828); se da como referencia:`);
for (const f of F.OPT_FRACTIONS) console.log(`    f=${String(f).padStart(5)}  exacto ${P(angDe(f)).toFixed(4)}   rápido ${P(angDe(f), true).toFixed(4)}   Δ ${(P(angDe(f))-P(angDe(f),true)).toFixed(4)}`);
