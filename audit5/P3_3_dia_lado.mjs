/* PASO 3.3 · UN LADO de la medida del día, para repartirla en procesos.
 *
 *   node audit5/P3_3_dia_lado.mjs <pol> <mes 6|12> <ref|ARBOL> --json=RUTA
 *
 * La MISMA receta que audit5/P3_3_efecto_dia.mjs (la serie del día con mesas:
 * `segCmd` cortado de la página → `crearLazoSeg` → `topeBacktrackingSeg` →
 * `poaPlantSeg`), pero una sola página: la de `ref` (una rama o commit) o la del
 * árbol de trabajo (`ARBOL`). Así la política cara (`mgl`, 40-90 s por instante
 * en Ayora) se reparte en un proceso por (página, día) y cada página se calcula
 * una vez. El careo entre lados lo hace audit5/P3_3_careo_lados.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { rutasAnuales } from './lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [key, mesS, ref] = process.argv.slice(2);
const mo = (+mesS) - 1;
const dest = path.resolve(ROOT, (process.argv.find(a => a.startsWith('--json=')) || '').slice(7) || `audit5/out/P3_3_lado_${key}_${mesS}_${ref.replace(/[^\w.-]/g, '_')}.json`);
const h = ref === 'ARBOL' ? fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8')
  : execFileSync('git', ['show', ref + ':backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const F = cargaSimulador(ROOT, ['crearLazoSeg', 'topeBacktrackingSeg', 'poaPlantSeg'], () => h).F;
const P = rutasAnuales(ROOT, h).F;
const VER = /const VER='([^']+)'/.exec(h)[1];
const sha = ref === 'ARBOL' ? 'árbol de trabajo' : execFileSync('git', ['rev-parse', '--short', ref], { cwd: ROOT, encoding: 'utf8' }).trim();
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const T = terrenoComoLaPagina(F, datos, 80, 0).T;
const STEP = 5, TZ = 1, t0 = Date.now();
const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = F.doyOf(ds), d0 = Date.UTC(2026, mo, 21) - TZ * 3600000;
const LZS = F.crearLazoSeg(); let kwh = 0, n = 0;
for (let m = 0; m < 1440; m += STEP) {
  const g = F.solarPos(d0 + m * 60000, lay.clat, lay.clon);
  if (!(g.elev > 0)) continue;
  const irr = F.clearskyIneichen(g.zen, doy, datos.base, 3.5);
  const segN = P.segCmd(key, g.zen, g.az, T, T, irr, doy, 0.2);
  const ls = F.topeBacktrackingSeg(g.zen, g.az, T, segN, LZS.paso(segN, STEP * 60));
  kwh += F.poaPlantSeg(g.zen, g.az, T, ls, irr, doy, 0.2).plant * STEP / 60 / 1000; n++;
}
const R = { pol: key, mes: mo + 1, ref, sha, VER, kwh, pasos: n, paso_min: STEP, s: Math.round((Date.now() - t0) / 1000), maquina: { cpu: os.cpus().length, carga_fin: os.loadavg() } };
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(R, null, 1));
console.log(`${key} 21-${mo === 5 ? 'jun' : 'dic'} ${ref} (${VER}, ${sha}) ${kwh.toFixed(6)} kWh/m² · ${n} pasos · ${R.s} s`);
