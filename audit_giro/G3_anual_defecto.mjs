/* GIRO MÁXIMO (v1.79.0) · EL ANUAL DE LA PÁGINA EN LA PLANTA POR DEFECTO.
 *
 *   node audit_giro/G3_anual_defecto.mjs
 *
 * El mismo bucle que `yearbtn` (backtracking.html, `const PASO_ANUAL_MIN=10`),
 * ejecutado DENTRO de la página de esta rama con su `cfg()`/`terrain()` por
 * defecto y las nueve políticas: una sola evaluación de la política por instante
 * y DOS lazos, `crearLazo()` (el de v1.78.1: sin tope mecánico) y
 * `crearLazo(null,null,null,T.maxAngle)` (v1.79.0). Al anual solo le llega ese
 * arreglo: el bucle anual no pasa por `topeBacktracking`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), PORT = 8144;
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await b.newPage();
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  const r = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T), PASO = 10, DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const days = ['01-21', '02-21', '03-21', '04-21', '05-21', '06-21', '07-21', '08-21', '09-21', '10-21', '11-21', '12-21'], year = c.date.slice(0, 4);
    const out = {}, t0 = Date.now();
    for (const P of POLICIES) out[P.key] = { vieja: 0, nueva: 0, dth: 0, sobre: 0 };
    for (let mo = 0; mo < 12; mo++) {
      const ds = year + '-' + days[mo], doy = doyOf(ds);
      const LV = {}, LN = {}; for (const P of POLICIES) { LV[P.key] = crearLazo(); LN[P.key] = crearLazo(null, null, null, T.maxAngle); }
      for (let m = 0; m < 1440; m += PASO) {
        const g = solarPos(localToUTCms(ds, m, c.tz), c.lat, c.lon); if (g.elev <= 0) continue;
        const irr = clearskyIneichen(g.zen, doy, c.alt, c.tl), w = (PASO / 60) / 1000 * DIM[mo];
        for (const P of POLICIES) {
          const a = policyAngles(P.key, g.zen, g.az, Tcfg, irr, doy, c.albedo).angles, o = out[P.key];
          const lv = LV[P.key].paso(a.slice(), PASO * 60), ln = LN[P.key].paso(a.slice(), PASO * 60);
          lv.forEach((v, i) => { o.dth = Math.max(o.dth, Math.abs(v - ln[i])); if (Math.abs(v) > T.maxAngle + 1e-9) o.sobre++; });
          const pV = poaPlant(g.zen, g.az, T, lv, irr, doy, c.albedo).plant;
          const pN = lv.every((v, i) => v === ln[i]) ? pV : poaPlant(g.zen, g.az, T, ln, irr, doy, c.albedo).plant;
          o.vieja += pV * w; o.nueva += pN * w;
        }
      }
    }
    return { ver: VER, filas: T.pairs.length + 1, s: (Date.now() - t0) / 1000, out };
  });
  console.log(`planta por defecto · ${r.filas} filas · ${r.ver} · anual de la página (12 días, 10 min) · ${r.s.toFixed(0)} s`);
  console.log('  política    kWh/m²·año sin tope   con tope     Δ %      |Δθ| máx   muestras·fila sobre el tope (sin tope)');
  for (const [k, o] of Object.entries(r.out)) console.log(`  ${k.padEnd(9)} ${o.vieja.toFixed(4).padStart(14)} ${o.nueva.toFixed(4).padStart(12)} ${(100 * (o.nueva / o.vieja - 1)).toFixed(4).padStart(8)} %   ${o.dth.toFixed(3)}°   ${o.sobre}`);
  fs.writeFileSync(path.join(ROOT, 'audit_giro/out/G3_anual_defecto.json'), JSON.stringify(r, null, 1));
} finally { await b.close(); srv.kill(); }
