/* PASO 3 REFORMULADO · `optfree` «a medias»: ¿cambiaría el candidato elegido si
 * la GUÍA usara la métrica que se cobra? (apunte del titular; el análogo de R2
 * con la rejilla de f).
 *
 *   node audit5/P3r_optfree_guia.mjs <mes 6|12> [horas UTC separadas por comas] [--json=RUTA]
 *
 * Hoy (`anglesOptimalFreeSeg`, backtracking.html:3274) la guía es el vector f
 * por línea que deja el ascenso de `anglesOptimalFree` (backtracking.html:3095),
 * y ese ascenso elige cada unidad con `rowVal` —sombra por pareja
 * `pairShade25`, por LÍNEA— (backtracking.html:3131); sólo la elección final
 * entre {pairwise por mesa, mezcla con la guía, optimal por mesa} usa
 * `poaPlantSeg`, lo que se cobra.
 *
 * VARIANTE: la MISMA guía —mismas unidades (T.groups y sueltas), misma rejilla
 * OPTFREE_F0/OPTFREE_NF, mismo arranque (la mejor f común), mismo orden de
 * barrido— pero cada elección evaluada con `poaPlantSeg(mez(f)).plant`, y
 * después la MISMA elección final. Se cuentan TRES cosas por separado: cambia la
 * ETIQUETA del ganador, cambian los ÁNGULOS, cambia LO COBRADO (> 1e-9 W/m²).
 * La etiqueta sola no basta: en la prueba de humo (21-jun 12 h UTC) cambió de
 * `optimal` a `guía` con Δ invisible a 4 decimales — un empate no es un cambio.
 *
 * COSTE MEDIDO (Ayora, 1600 mesas, 40 grupos + sueltas, carga ~19 en 4 CPU):
 * `poaPlantSeg` 0,68 s a las 8 h UTC del 21-jun (con sombra); a las 12 h UTC,
 * sin sombra, el instante entero (≈ 540 evaluaciones) tardó 47 s. Un barrido
 * son 13 × unidades evaluaciones: de ≈ 1 a ≈ 6 min por instante. Por eso: MUESTRA DECLARADA de instantes (horas en punto, sol > 5°)
 * y UN barrido (el de la página hace hasta 8). La variante es por tanto una
 * COTA INFERIOR de lo que encontraría una guía con la métrica final: un cambio
 * contado es real; cero cambios no probaría que no los haya.
 * Sin lazo ni tope: es la decisión del instante, la misma entrada para las dos.
 * TEST NULO: con la evaluación de la guía de la página reproducida
 * (`anglesOptimalFree(...).fRow` → `mez`) el ganador y su valor coinciden bit a
 * bit con `anglesOptimalFreeSeg`.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mo = (+process.argv[2]) - 1;
const horasArg = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3].split(',').map(Number) : null;
const dest = path.resolve(ROOT, (process.argv.find(a => a.startsWith('--json=')) || '').slice(7) || `audit5/out/P3r_optfree_guia_${mo + 1}${horasArg ? '_' + horasArg.join('-') : ''}.json`);
const E = cargaSimulador(ROOT, ['poaPlantSeg', 'anglesOptimalFreeSeg', 'anglesOptimalFree', 'anglesPairwiseSeg', 'anglesAstroSeg', 'applyDriveSeg', 'anglesOptimalSeg']).F;
const h = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const F0 = +/OPTFREE_F0=([-\d.]+)/.exec(h)[1], NF = +/OPTFREE_NF=(\d+)/.exec(h)[1];
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const T = terrenoComoLaPagina(E, datos, 80, 0).T;
const ALB = 0.2, doy = E.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-21`);
const nR = T.pairs.length + 1;
const seen = new Set(), units = [];
for (const g of (T.groups || [])) { units.push(g.slice().sort((a, b) => a - b)); g.forEach(r => seen.add(r)); }
for (let r = 0; r < nR; r++) if (!seen.has(r)) units.push([r]);
units.sort((a, b) => a[0] - b[0]);
const GRID = []; for (let i = 0; i < NF; i++) GRID.push(F0 + (1 - F0) * i / (NF - 1));
const drv = (T.segDrive && T.segDrive.length) ? T.segDrive : (T.segPairs || null);

// la elección final de anglesOptimalFreeSeg, copiada en su orden y con sus umbrales
function eleccion(zen, az, irr, fRow) {
  const base = E.applyDriveSeg(E.anglesPairwiseSeg(zen, az, T), drv);
  const full = E.applyDriveSeg(E.anglesAstroSeg(zen, az, T), drv);
  const poa = a => E.poaPlantSeg(zen, az, T, a, irr, doy, ALB).plant;
  const mez = fDe => E.applyDriveSeg(base.map((l, r) => l.map((b, k) =>
    Math.max(-T.maxAngle, Math.min(T.maxAngle, b + fDe(r) * (full[r][k] - b))))), drv);
  let cand = base, best = poa(base), quien = 'pairwise';
  const prueba = (a, q) => { const p = poa(a); if (p > best + 1e-9) { best = p; cand = a; quien = q; } };
  if (fRow) prueba(mez(r => (fRow[r] != null ? fRow[r] : 0)), 'guía');
  prueba(E.anglesOptimalSeg(zen, az, T, irr, doy, ALB).angles, 'optimal');
  return { quien, best, cand, poa, mez };
}

const t0 = Date.now(), filas = [];
const d0 = Date.UTC(2026, mo, 21);
for (let H = 0; H < 24; H++) {
  if (horasArg && !horasArg.includes(H)) continue;
  const g = E.solarPos(d0 + H * 3600000, lay.clat, lay.clon);
  if (!(g.elev > 5)) continue;
  const irr = E.clearskyIneichen(g.zen, doy, datos.base, 3.5);
  const ti = Date.now();
  // la página, tal cual
  const pag = E.anglesOptimalFreeSeg(g.zen, g.az, T, irr, doy, ALB);
  const Epag = E.poaPlantSeg(g.zen, g.az, T, pag.angles, irr, doy, ALB).plant;
  // TEST NULO: la guía de la página reproducida por este script
  const lib = E.anglesOptimalFree(g.zen, g.az, T, irr, doy, ALB);
  const A = eleccion(g.zen, g.az, irr, lib.fRow);
  const nulo = A.best === Epag;
  // VARIANTE: la guía elegida con lo que se cobra
  const k = new Array(units.length).fill(0), fDe = r => GRID[k[units.findIndex(u => u.includes(r))]];
  const ev = () => A.poa(A.mez(fDe));
  let bestK = 0, bestS = -Infinity, nev = 0;
  for (let kk = 0; kk < NF; kk++) { k.fill(kk); const s = ev(); nev++; if (s > bestS + 1e-12) { bestS = s; bestK = kk; } }
  k.fill(bestK);
  let cambiosGuia = 0;
  for (let ui = 0; ui < units.length; ui++) {      // UN barrido, en el orden del primero de la página
    const k0 = k[ui]; let bk = k0, bs = -Infinity;
    for (let kk = 0; kk < NF; kk++) { k[ui] = kk; const s = ev(); nev++; if (s > bs + 1e-12) { bs = s; bk = kk; } }
    k[ui] = bk; if (bk !== k0) cambiosGuia++;
  }
  const fVar = []; for (let r = 0; r < nR; r++) fVar.push(fDe(r));
  const B = eleccion(g.zen, g.az, irr, fVar);
  let dAng = 0; for (let r = 0; r < B.cand.length; r++) for (let q = 0; q < B.cand[r].length; q++) dAng = Math.max(dAng, Math.abs(B.cand[r][q] - pag.angles[r][q]));
  const fila = { hora_utc: H, elev: +g.elev.toFixed(2), pagina: A.quien, variante: B.quien, E_pagina: Epag, E_variante: B.best, dE_Wm2: B.best - Epag, max_dtheta_grados: dAng,
    dE_rel: B.best / Epag - 1, guia_pagina_en_metrica_final: A.poa(A.mez(r => lib.fRow[r])), guia_variante_en_metrica_final: bestS > -Infinity ? A.poa(A.mez(fDe)) : null,
    unidades_movidas_en_el_barrido: cambiosGuia, f_comun_arranque: GRID[bestK], nulo_bit_a_bit: nulo, evaluaciones: nev, s: Math.round((Date.now() - ti) / 1000) };
  filas.push(fila);
  console.log(`21-${mo === 5 ? 'jun' : 'dic'} ${String(H).padStart(2)}h UTC (sol ${fila.elev}°): gana ${A.quien.padEnd(8)} → con la guía en lo cobrado gana ${B.quien.padEnd(8)} · Δ ${fila.dE_Wm2.toExponential(2)} W/m² (${(100 * fila.dE_rel).toFixed(5)} %) · máx Δθ ${dAng.toFixed(3)}° · guía de la página ${fila.guia_pagina_en_metrica_final.toFixed(3)} / guía variante ${fila.guia_variante_en_metrica_final.toFixed(3)} W/m² · nulo ${nulo ? 'bit a bit' : 'DIFIERE'} · ${fila.s} s`);
}
const R = { mes: mo + 1, F0, NF, unidades: units.length, mesas: E.anglesPairwiseSeg(1, 0, T).flat().length, barridos: 1, filas,
  cambia_etiqueta: filas.filter(f => f.pagina !== f.variante).length,
  cambian_angulos: filas.filter(f => f.max_dtheta_grados > 0).length,
  cambia_lo_cobrado: filas.filter(f => Math.abs(f.dE_Wm2) > 1e-9).length, instantes: filas.length, s: Math.round((Date.now() - t0) / 1000), cpu: os.cpus().length };
fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, JSON.stringify(R, null, 1));
console.log(`\nde ${R.instantes} instantes: cambia la etiqueta del ganador en ${R.cambia_etiqueta}, cambian los ángulos en ${R.cambian_angulos}, cambia lo cobrado (> 1e-9 W/m²) en ${R.cambia_lo_cobrado} · nulo: ${filas.every(f => f.nulo_bit_a_bit) ? 'todos bit a bit' : 'ALGUNO DIFIERE'}`);
