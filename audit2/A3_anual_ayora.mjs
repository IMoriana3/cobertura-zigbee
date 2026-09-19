/* ═══════════════════════════════════════════════════════════════════════════
   A.3 — ANUAL DE AYORA REAL, ejecutado TAL CUAL por la propia página.
   No se reimplementa nada: se pulsa ⛰ Ayora real y después Calcular año.
   Ejecutable por un tercero:   node audit2/A3_anual_ayora.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8800 + (process.pid % 300);
const sha  = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });

const P4 = `
  // amplía SOLO la precisión de impresión del POA (toFixed(1) del renderizador),
  // sin tocar ningún cálculo. Se restaura al terminar.
  window.__RAW = [];
  window.__TF = Number.prototype.toFixed;
  Number.prototype.toFixed = function(d){ if(d===1){ window.__RAW.push(this.valueOf()); return window.__TF.call(this,4); } return window.__TF.call(this,d); };`;

try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2500);

  // ── carga de Ayora real (camino de cotas) ───────────────────────────────
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => typeof PLANT_REAL !== 'undefined' && PLANT_REAL !== null, null, { timeout: 180000 });
  await pg.waitForTimeout(2000);

  const echo = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c);
    const mv = (typeof mvPara === 'function') ? [20, 45, 70, 85].map(z => z + '°:' + mvPara(T, z)).join(' ') : 'mvPara NO EXISTE';
    return { VER, c, nLin: PLANT_REAL.elev.length, nFilas: PLANT_REAL.nFilas, nMesas: PLANT_REAL.nMesas,
      nPairs: PLANT_REAL.nPairs, drive: PLANT_REAL.drive,
      tiltMin: Math.min(...PLANT_REAL.tilt), tiltMax: Math.max(...PLANT_REAL.tilt),
      cw: T.cw, z0: T.z0, nb: T.nBypass, b0: T.iam, maxAngle: T.maxAngle, real: !!T.real, mv,
      on: POLICIES.filter(P => P.on).map(P => P.key), off: POLICIES.filter(P => !P.on).map(P => P.key) };
  });

  console.log('═'.repeat(80));
  console.log(`E-A3 · ANUAL DE AYORA REAL · commit ${sha}`);
  console.log(`node ${process.version} · playwright chromium ${EXE.split('/').slice(-3)[0]}`);
  console.log(`VER de la página: ${echo.VER}`);
  console.log(`sitio   lat ${echo.c.lat} · lon ${echo.c.lon} · alt ${echo.c.alt} m · tz ${echo.c.tz} · año ${echo.c.date.slice(0,4)}`);
  console.log(`cielo   Linke TL ${echo.c.tl} · albedo ${echo.c.albedo} · nubosidad ${echo.c.cloud} · modelo Ineichen`);
  console.log(`planta  ${echo.nLin} líneas · ${echo.nFilas} filas · ${echo.nMesas} mesas · ${echo.nPairs} parejas · drive ${echo.drive}`);
  console.log(`        cuerda ${echo.cw} · z0 ${echo.z0} · nb ${echo.nb} · b0 ${echo.b0} · ±${echo.maxAngle}° · T.real ${echo.real}`);
  console.log(`        tilts N-S medidos ${echo.tiltMin.toFixed(2)}…${echo.tiltMax.toFixed(2)}°`);
  console.log(`MV      mvPara(T,zen) = ${echo.mv}   (el anual NO fuerza MV)`);
  console.log(`paso    10 min (backtracking.html:6911) · 12 días 21 de cada mes · pesos DIM · SIN lazo de control`);
  console.log('═'.repeat(80));

  // ── VARIANTE 1: TAL CUAL (las políticas que deja la carga de planta real) ──
  console.log(`\n── VARIANTE 1 · TAL CUAL ─────────────────────────────────────────`);
  console.log(`políticas ON  : ${echo.on.join(', ')}`);
  console.log(`políticas OFF : ${echo.off.join(', ')}   (la carga de planta real apaga los "caros": backtracking.html:4355-4358)`);
  let t0 = Date.now();
  await pg.evaluate(P4);
  await pg.evaluate(() => { document.getElementById('yeartab').innerHTML = ''; document.getElementById('yearbtn').click(); });
  await pg.waitForFunction(() => document.getElementById('yeartab').innerHTML.trim() !== '', null, { timeout: 3600000 });
  let r = await pg.evaluate(() => { const t = [...document.querySelectorAll('#yeartab tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
                                    const raw = window.__RAW.slice(); Number.prototype.toFixed = window.__TF; return { t, raw }; });
  console.log(`(${((Date.now()-t0)/1000).toFixed(1)} s)`);
  for (const f of r.t) console.log('   ' + f.join('  │  '));
  console.log('   POA sin redondear: ' + r.raw.map(v => v.toPrecision(12)).join('  '));

  // ── VARIANTE 2: TODAS las políticas encendidas ────────────────────────────
  console.log(`\n── VARIANTE 2 · LAS 9 POLÍTICAS ──────────────────────────────────`);
  const on2 = await pg.evaluate(() => { document.querySelectorAll('#polbox input[data-k]').forEach(i => { if (!i.checked) { i.checked = true; i.onchange(); } });
                                        return POLICIES.filter(P => P.on).map(P => P.key); });
  await pg.waitForTimeout(1500);
  console.log(`políticas ON  : ${on2.join(', ')}`);
  t0 = Date.now();
  await pg.evaluate(P4);
  await pg.evaluate(() => { document.getElementById('yeartab').innerHTML = ''; document.getElementById('yearbtn').click(); });
  await pg.waitForFunction(() => document.getElementById('yeartab').innerHTML.trim() !== '', null, { timeout: 7200000 });
  r = await pg.evaluate(() => { const t = [...document.querySelectorAll('#yeartab tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
                                const raw = window.__RAW.slice(); Number.prototype.toFixed = window.__TF; return { t, raw }; });
  console.log(`(${((Date.now()-t0)/1000).toFixed(1)} s)`);
  for (const f of r.t) console.log('   ' + f.join('  │  '));
  console.log('   POA sin redondear: ' + r.raw.map(v => v.toPrecision(12)).join('  '));

  console.log(`\nerrores de página: ${errs.length}${errs.length ? ' · ' + errs.slice(0,3).join(' | ') : ''}`);
  await browser.close();
} finally { try { srv.kill(); } catch { /* nada */ } }
