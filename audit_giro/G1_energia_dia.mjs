/* GIRO MÁXIMO (v1.79.0) · CUÁNTO MUEVE EL ARREGLO LA ENERGÍA DEL DÍA.
 *
 *   node audit_giro/G1_energia_dia.mjs [defecto|ayora] [--fechas=2026-06-21,2026-12-21]
 *
 * Dos pestañas del mismo Chromium: la página de `main` (v1.78.1, copiada a
 * `_giro_v1781.html`, sin versionar) y la de esta rama (v1.79.0), con la misma
 * planta, la misma fecha y las nueve políticas encendidas. Se lee lo que cada
 * una PUBLICA: `DAY.pol[k].poaP` (POA de planta, W/m² por paso de 5 min) → kWh/m²
 * del día, y la otra métrica (`poaLin`) si la hay. Δ % = nueva/vieja − 1.
 * TEST NULO: una política cuya malla no cambia (mismo θ en todos los pasos) tiene
 * que dar Δ = 0 exacto; si las dos pestañas no calcularan lo mismo salvo el
 * arreglo, esto lo delata.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLANTA = process.argv[2] || 'defecto';
const FECHAS = ((process.argv.find(a => a.startsWith('--fechas=')) || '--fechas=2026-06-21,2026-12-21').slice(9)).split(',');
const PORT = 8140 + (PLANTA === 'ayora' ? 1 : 0);
if (!fs.existsSync(path.join(ROOT, '_giro_v1781.html'))) throw new Error('falta _giro_v1781.html: git show origin/main:backtracking.html > _giro_v1781.html');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const quieto = pg => pg.waitForFunction(() => { const e = document.getElementById('calcbusy'); return DAY && DAY.pol && (!e || e.style.display === 'none'); }, null, { timeout: 7200000 });
async function abre(pagina) {
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error(pagina, 'pageerror', e.message));
  await pg.goto(`http://localhost:${PORT}/${pagina}?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  if (PLANTA === 'ayora') { await pg.evaluate(() => document.getElementById('ayorabtn').click()); await pg.waitForFunction(() => PLANT_REAL, null, { timeout: 120000 }); await quieto(pg); }
  return pg;
}
const leer = async (pg, fecha) => {
  await pg.evaluate(f => { POLICIES.forEach(P => { P.on = true; }); const d = document.getElementById('date'); d.value = f; d.dispatchEvent(new Event('change')); }, fecha);
  await pg.waitForFunction(f => DAY && DAY.c && DAY.c.date === f && Object.keys(DAY.pol).length === POLICIES.length, fecha, { timeout: 7200000 });
  await quieto(pg);
  return pg.evaluate(() => { const o = { ver: VER, filas: DAY.T.pairs.length + 1, pol: {} };
    for (const k of Object.keys(DAY.pol)) { const P = DAY.pol[k], kwh = s => s ? s.reduce((a, v) => a + (+v || 0), 0) * STEP_MIN / 60 / 1000 : null;
      o.pol[k] = { poaP: kwh(P.poaP), poaLin: kwh(P.poaLin), ang: P.ang.map(a => a ? a.map(v => +v.toFixed(9)) : null) }; }
    return o; });
};
const out = { planta: PLANTA, maquina: { cpu: os.cpus().length, carga: os.loadavg() }, dias: {} };
try {
  const [V, N] = [await abre('_giro_v1781.html'), await abre('backtracking.html')];
  for (const f of FECHAS) {
    const t0 = Date.now(); const [a, n] = [await leer(V, f), await leer(N, f)];
    out.dias[f] = { vieja: a.ver, nueva: n.ver, filas: n.filas, s: (Date.now() - t0) / 1000, pol: {} };
    console.log(`\n${PLANTA} · ${f} · ${n.filas} filas · ${a.ver} → ${n.ver}`);
    console.log('  política    kWh/m² día vieja   nueva        Δ %        pasos de malla con θ distinto   |Δθ| máx');
    for (const k of Object.keys(n.pol)) {
      const x = a.pol[k], y = n.pol[k]; let dif = 0, dmax = 0;
      y.ang.forEach((r, t) => { if (!r || !x.ang[t]) return; let d = 0; r.forEach((v, i) => d = Math.max(d, Math.abs(v - x.ang[t][i]))); if (d > 1e-9) dif++; dmax = Math.max(dmax, d); });
      const dp = 100 * (y.poaP / x.poaP - 1);
      out.dias[f].pol[k] = { vieja: x.poaP, nueva: y.poaP, delta_pct: dp, vieja_lin: x.poaLin, nueva_lin: y.poaLin, pasos_distintos: dif, dth_max: dmax };
      console.log(`  ${k.padEnd(9)} ${x.poaP.toFixed(6).padStart(12)} ${y.poaP.toFixed(6).padStart(12)} ${dp.toFixed(4).padStart(9)} %   ${String(dif).padStart(5)} de ${y.ang.length}   ${dmax.toFixed(3)}°${dif === 0 && dp !== 0 ? '   ⚠ TEST NULO: θ iguales y energía distinta' : ''}`);
    }
  }
} finally { await b.close(); srv.kill(); }
fs.writeFileSync(path.join(ROOT, `audit_giro/out/G1_energia_dia_${PLANTA}.json`), JSON.stringify(out, null, 1));
