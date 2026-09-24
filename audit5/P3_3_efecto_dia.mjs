/* REFUNDACIÓN · PASO 3.3 — EFECTO DEL ACOPLE POR MOTOR EN EL DÍA.
 *
 *   node audit5/P3_3_efecto_dia.mjs <pol[,pol…]> [--base=REF] [--json=RUTA]
 *
 * ANTES = la página del paso 2 (v1.82.0); DESPUÉS = la de esta rama (v1.83.0).
 * La cadena es la de la serie del día con mesas (`backtracking.html`, cuerpo de
 * la serie: `segCmd` → `LZS.paso(segN, STEP_MIN*60)` → `topeBacktrackingSeg` →
 * `poaPlantSeg`), con `segCmd` CORTADO DE LA PÁGINA (audit5/lib_anual_pagina.mjs)
 * —es la fuente de mando que el paso 3 tuvo que tocar (E-X1-R3-1)—.
 * Ayora, banda de la página; 21-jun y 21-dic; paso 5 min (STEP_MIN); cielo claro.
 * TEST NULO: `astro`, `pairwise`, `global` y `bt2d` no cambian.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { rutasAnuales } from './lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const POLS = (process.argv[2] || 'row,true3d,mgl,astro').split(',');
const BASE = arg('base', 'origin/claude/refundacion-p2-6th1im');
const dest = path.resolve(ROOT, arg('json', `audit5/out/P3_3_dia_${POLS.join('-')}.json`));
const hA = execFileSync('git', ['show', BASE + ':backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const hD = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const EXTRA = ['crearLazoSeg', 'topeBacktrackingSeg', 'poaPlantSeg'];
const lado = h => ({ F: cargaSimulador(ROOT, EXTRA, () => h).F, P: rutasAnuales(ROOT, h).F, VER: /const VER='([^']+)'/.exec(h)[1] });
const A = lado(hA), D = lado(hD);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const T = terrenoComoLaPagina(D.F, datos, 80, 0).T;
const STEP = 5, TZ = 1;
const R = { antes: A.VER, despues: D.VER, base: BASE, planta: 'ayora, banda de la página', paso_min: STEP, maquina: { cpu: os.cpus().length, carga_inicio: os.loadavg() }, dias: {} };
const dia = (L, key, mo) => {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = L.F.doyOf(ds), d0 = Date.UTC(2026, mo, 21) - TZ * 3600000;
  const LZS = L.F.crearLazoSeg(); let kwh = 0, n = 0;
  for (let m = 0; m < 1440; m += STEP) {
    const g = L.F.solarPos(d0 + m * 60000, lay.clat, lay.clon);
    if (!(g.elev > 0)) continue;
    const irr = L.F.clearskyIneichen(g.zen, doy, datos.base, 3.5);
    const segN = L.P.segCmd(key, g.zen, g.az, T, T, irr, doy, 0.2);
    const ls = L.F.topeBacktrackingSeg(g.zen, g.az, T, segN, LZS.paso(segN, STEP * 60));
    kwh += L.F.poaPlantSeg(g.zen, g.az, T, ls, irr, doy, 0.2).plant * STEP / 60 / 1000; n++;
  }
  return { kwh, n };
};
console.log(`REFUNDACIÓN · 3.3 · efecto en el DÍA · ${A.VER} → ${D.VER} · Ayora · 21-jun y 21-dic · cada ${STEP} min · con lazo y tope`);
for (const k of POLS) {
  R.dias[k] = {};
  for (const mo of [5, 11]) {
    const a = dia(A, k, mo), b = dia(D, k, mo);
    R.dias[k][mo + 1] = { antes: a.kwh, despues: b.kwh, pasos: a.n };
    fs.writeFileSync(dest, JSON.stringify(R, null, 1));
    console.log(`  ${k.padEnd(8)} 21-${mo === 5 ? 'jun' : 'dic'} ${a.kwh.toFixed(4)} → ${b.kwh.toFixed(4)} kWh/m² · Δ ${(100 * (b.kwh / a.kwh - 1)).toFixed(4)} %${a.kwh === b.kwh ? ' · idéntico bit a bit' : ''} · ${a.n} pasos`);
  }
}
R.maquina.carga_fin = os.loadavg(); fs.writeFileSync(dest, JSON.stringify(R, null, 1));
