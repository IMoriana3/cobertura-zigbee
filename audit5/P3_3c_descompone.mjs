/* PASO 3 · (c) AMPLIADO (decisión del titular): ¿de dónde sale la energía que
 * `true3d` pierde al retirar el acople de líneas enteras? SOMBRA o HAZ.
 *
 *   node audit5/P3_3c_descompone.mjs <mes 6|12> [--base=REF] [--json=RUTA]
 *
 * Dos páginas: BASE (el paso 2, con el acople) y el ÁRBOL de trabajo (la opción
 * (a): reparación por línea, sin acople). Para cada una, la serie del día TAL
 * CUAL la ejecuta la página (`segCmd` cortado de la página → lazo por mesa →
 * tope → ángulo ejecutado), y ese ángulo se evalúa con UNA sola física (la del
 * árbol; `poaPlantSeg` no cambia entre las dos) descompuesto por mesa como lo
 * suma `poaPlantSeg`:
 *     v = beam·(1−se) + circ·(1−fo) + sky + gnd
 *   · término de ÁNGULO (sin sombra): POA₀ = beam + circ + sky + gnd — el coseno
 *     de incidencia y el IAM viven en beam y circ; los factores de vista en sky
 *     y gnd;
 *   · término de SOMBRA: pérdida = beam·se + circ·fo (fo fracción sombreada,
 *     se su pérdida eléctrica).
 *   ΔE = ΔPOA₀ − Δpérdida, y ΔPOA₀ se parte en haz, circunsolar y sky+gnd.
 * CONTROL: la suma de los términos reproduce `poaPlantSeg(...).plant` (error
 * máximo publicado). TEST NULO: los dos términos difieren entre las páginas.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { rutasAnuales } from './lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mo = (+process.argv[2]) - 1;
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const BASE = arg('base', 'origin/claude/refundacion-p2-6th1im');
const dest = path.resolve(ROOT, arg('json', `audit5/out/P3_3c_descompone_${mo + 1}.json`));
const EXTRA = ['crearLazoSeg', 'topeBacktrackingSeg', 'poaPlantSeg', 'shadeRows', 'poaRow', 'segTiltAt', 'elecLoss'];
const hB = execFileSync('git', ['show', BASE + ':backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const hA = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const lado = h => ({ F: cargaSimulador(ROOT, EXTRA, () => h).F, P: rutasAnuales(ROOT, h).F, VER: /const VER='([^']+)'/.exec(h)[1] });
const LB = lado(hB), LA = lado(hA), E = LA.F;          // E: la física que EVALÚA los dos ángulos
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const T = terrenoComoLaPagina(E, datos, 80, 0).T;
const STEP = 5, TZ = 1, ALB = 0.2, dt = STEP / 60 / 1000;
const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = E.doyOf(ds), d0 = Date.UTC(2026, mo, 21) - TZ * 3600000;

function descompone(zen, az, seg, irr) {
  const sh = E.shadeRows(zen, az, T, seg);
  let wt = 0, beam = 0, circ = 0, skygnd = 0, perdB = 0, perdC = 0;
  for (let r = 0; r < seg.length; r++) {
    const line = T.segs ? T.segs[r] : null;
    for (let k = 0; k < seg[r].length; k++) {
      const p = E.poaRow(seg[r][k], E.segTiltAt(T, r, k), T.axisAz, zen, az, irr, doy, ALB, T.iam);
      const fo = Math.max(0, Math.min(1, (sh.seg && sh.seg[r] && sh.seg[r][k] != null) ? sh.seg[r][k] : (sh[r] || 0)));
      const se = (sh.segElec && sh.segElec[r] && sh.segElec[r][k] != null) ? sh.segElec[r][k] : E.elecLoss(fo, T.nBypass);
      const len = line && line[k] ? Math.max(1e-6, line[k][1] - line[k][0]) : 1;
      wt += len; beam += p.beam * len; circ += p.circ * len; skygnd += (p.sky + p.gnd) * len;
      perdB += p.beam * se * len; perdC += p.circ * fo * len;
    }
  }
  return { beam: beam / wt, circ: circ / wt, skygnd: skygnd / wt, perdB: perdB / wt, perdC: perdC / wt };
}
const R = { mes: mo + 1, base: BASE, versiones: { base: LB.VER, arbol: LA.VER }, paso_min: STEP, maquina: { cpu: os.cpus().length }, lados: {} };
let peorRecon = 0;
for (const [nombre, L] of [['paso2', LB], ['a', LA]]) {
  const LZS = L.F.crearLazoSeg();
  const acc = { E: 0, beam: 0, circ: 0, skygnd: 0, perdB: 0, perdC: 0, n: 0 };
  const t0 = Date.now();
  for (let m = 0; m < 1440; m += STEP) {
    const g = L.F.solarPos(d0 + m * 60000, lay.clat, lay.clon);
    if (!(g.elev > 0)) continue;
    const irr = L.F.clearskyIneichen(g.zen, doy, datos.base, 3.5);
    const segN = L.P.segCmd('true3d', g.zen, g.az, T, T, irr, doy, ALB);
    const ls = L.F.topeBacktrackingSeg(g.zen, g.az, T, segN, LZS.paso(segN, STEP * 60));
    const d = descompone(g.zen, g.az, ls, irr);
    const plant = E.poaPlantSeg(g.zen, g.az, T, ls, irr, doy, ALB).plant;
    const recon = d.beam + d.circ + d.skygnd - d.perdB - d.perdC;
    peorRecon = Math.max(peorRecon, Math.abs(recon - plant));
    acc.E += plant * dt; acc.beam += d.beam * dt; acc.circ += d.circ * dt; acc.skygnd += d.skygnd * dt;
    acc.perdB += d.perdB * dt; acc.perdC += d.perdC * dt; acc.n++;
  }
  acc.s = Math.round((Date.now() - t0) / 1000);
  R.lados[nombre] = acc;
  console.log(`${nombre.padEnd(6)} 21-${mo === 5 ? 'jun' : 'dic'}: E ${acc.E.toFixed(6)} · haz ${acc.beam.toFixed(6)} · circ ${acc.circ.toFixed(6)} · sky+gnd ${acc.skygnd.toFixed(6)} · pérdida sombra ${(acc.perdB + acc.perdC).toFixed(6)} (haz ${acc.perdB.toFixed(6)}, circ ${acc.perdC.toFixed(6)}) kWh/m² · ${acc.n} pasos · ${acc.s} s`);
}
const b = R.lados.paso2, a = R.lados.a, dE = a.E - b.E;
const dAng = (a.beam + a.circ + a.skygnd) - (b.beam + b.circ + b.skygnd), dSom = -((a.perdB + a.perdC) - (b.perdB + b.perdC));
R.delta = { E: dE, angulo: dAng, angulo_haz: a.beam - b.beam, angulo_circ: a.circ - b.circ, angulo_skygnd: a.skygnd - b.skygnd, sombra: dSom, cierre: dE - (dAng + dSom), peor_reconstruccion_Wm2: peorRecon };
fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, JSON.stringify(R, null, 1));
const pct = x => (100 * x / b.E).toFixed(4) + ' %';
console.log(`ΔE (a − paso 2) = ${dE.toFixed(6)} kWh/m² (${pct(dE)})`);
console.log(`  · término de ÁNGULO (sin sombra): ${dAng.toFixed(6)} (${pct(dAng)}) = haz ${(a.beam - b.beam).toFixed(6)} + circ ${(a.circ - b.circ).toFixed(6)} + sky+gnd ${(a.skygnd - b.skygnd).toFixed(6)}`);
console.log(`  · término de SOMBRA: ${dSom.toFixed(6)} (${pct(dSom)})`);
console.log(`  · cierre ΔE − (ángulo + sombra): ${(dE - dAng - dSom).toExponential(2)} · reconstrucción por instante, peor ${peorRecon.toExponential(2)} W/m²`);
console.log(`  · TEST NULO: ángulo ${Math.abs(dAng) > 1e-9 ? 'DIFIERE' : 'IGUAL'} · sombra ${Math.abs(dSom) > 1e-9 ? 'DIFIERE' : 'IGUAL'}`);
