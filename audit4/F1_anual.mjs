/* R4 · FASE 1.6 — LA ENERGÍA ANUAL DE `optimal` Y `optfree`, ANTES Y DESPUÉS
 *
 * La ruta anual de la página (`backtracking.html:7494-7508`) es ÍNTEGRAMENTE
 * POR LÍNEA:
 *
 *     const a=policyAngles(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
 *     const lim=LZ[P.key].paso(a,PASO_ANUAL_MIN*60);
 *     tot[P.key]+=poaPlant(g.zen,g.az,T,lim,irr,doy,c.albedo).plant*...
 *
 * `policyAngles` (línea) · `crearLazo` (línea) · `poaPlant` (línea). No pasa
 * por `policyAnglesSeg` ni por `segCmd`, que es donde vive el arreglo de la
 * fase 1. La LECTURA del código dice que el anual no puede cambiar. Esta sonda
 * no se fía de la lectura: corre el anual de la página tal cual, sobre la
 * planta real, y publica los doce totales para poder restarlos entre las dos
 * versiones. Si salen iguales, el resultado de 1.6 es «cero, y ése es el
 * hallazgo»; si salen distintos, la lectura estaba mal y hay que mirar dónde.
 *
 *     node audit4/F1_anual.mjs        (progreso por stderr, resultado por stdout)
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8901 + (process.pid % 37);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const LAT = setInterval(() => console.error(`  ·latido· ${new Date().toISOString().slice(11, 19)} · rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`), 60000);
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('ERR ' + e.message));
  pg.on('crash', () => console.error('MUERTE · la PÁGINA se ha caído'));
  for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { console.error('MUERTE · ' + s); process.exit(9); });
  const t0 = Date.now();
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  console.error(`  página cargada · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const t1 = Date.now();
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 600000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 1800000 });
  /* EL COSTE DEL DÍA, medido: cuánto tarda la planta real en cerrar su primer
     cálculo. Es la cifra que 1.6 necesita al lado de la energía, porque el
     arreglo no cambia el anual pero SÍ cambia esto. */
  const sDia = (Date.now() - t1) / 1000;
  console.error(`  Ayora cargada y primer día cerrado · ${sDia.toFixed(1)} s`);
  const t2 = Date.now();
  await pg.evaluate(() => document.getElementById('yearbtn').click());
  await pg.waitForFunction(() => { const t = document.getElementById('yeartab'); return t && t.innerHTML.trim().length > 0; }, null, { timeout: 3600000 });
  const sAnual = (Date.now() - t2) / 1000;
  const tab = await pg.evaluate(() => {
    const out = [];
    for (const tr of document.getElementById('yeartab').querySelectorAll('tr')) {
      const c = [...tr.children].map(td => td.textContent.trim());
      if (c.length === 3) out.push(c);
    }
    return { filas: out, ver: VER, pasoAnual: 10 };
  });
  console.error(`  anual · ${sAnual.toFixed(1)} s`);
  console.log(JSON.stringify({ commit: sha, ver: tab.ver, segundos: { primerDia: +sDia.toFixed(1), anual: +sAnual.toFixed(1) },
    nota: 'los tiempos se midieron con la máquina compartida salvo que el cuaderno diga lo contrario',
    tabla: tab.filas }, null, 1));
} finally { clearInterval(LAT); await browser.close(); srv.kill(); }
