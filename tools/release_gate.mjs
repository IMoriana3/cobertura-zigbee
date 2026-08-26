/* GATE de pre-release del simulador de backtracking (auditoría, punto 6).
   Correr ANTES de mergear cualquier versión:

       node tools/release_gate.mjs

   Pasos (todos obligatorios; el primero que falla corta con exit≠0):
     1. SINTAXIS   — node --check de cada bloque <script> (la lección del
                     paréntesis suelto que tumbó la página).
     2. BATERÍA    — tools/test_backtracking_sim.mjs completa (física + QA +
                     oráculos + convergencia).
     3. SMOKE      — Chromium real: carga sin errores de consola, Ayora real,
                     día computado (288 pasos), BT OFF/ON presente.
     4. INVARIANTES— sobre el DAY computado: θ finito y |θ|≤θmáx, sombra∈[0,1],
                     POA finita, en 3 políticas (pairwise/true3d/optfree).
     5. VISUAL     — el pacto del rojo como tripwire: en un instante de alba
                     con sombra >2%, la escena debe tener píxeles rojos de
                     silueta; y la escena debe tener paneles y cielo (canvas
                     no en blanco). Umbrales generosos: caza catástrofes
                     (canvas vacío, rojo desaparecido, geometría colapsada),
                     no matices.                                              */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
let step = 0;
const ok = m => console.log(`  ✓ ${m}`);
const die = m => { console.error(`  ✗ ${m}`); process.exit(1); };
const hdr = m => console.log(`\n[${++step}] ${m}`);

hdr('SINTAXIS de cada bloque <script>');
{
  let i = 0;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const p = path.join(os.tmpdir(), `gate_blk${i}.js`);
    fs.writeFileSync(p, m[1]);
    const r = spawnSync('node', ['--check', p], { encoding: 'utf-8' });
    fs.unlinkSync(p);
    if (r.status !== 0) die(`bloque ${i}: ${r.stderr.slice(0, 300)}`);
    i++;
  }
  ok(`${i} bloques compilan`);
}

hdr('BATERÍA completa');
{
  const r = spawnSync('node', [path.join(ROOT, 'tools', 'test_backtracking_sim.mjs')], { encoding: 'utf-8' });
  if (r.status !== 0) die('batería en rojo:\n' + (r.stdout + r.stderr).split('\n').filter(l => l.includes('✗') || l.includes('FALLOS')).join('\n'));
  ok((r.stdout.trim().split('\n').pop() || 'OK'));
}

hdr('SMOKE + INVARIANTES + VISUAL (Chromium)');
const { chromium } = await import('playwright');
const port = 8765 + Math.floor(Math.random() * 200);
const srv = spawn('python3', ['-m', 'http.server', String(port), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
let browser;
try {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(`http://localhost:${port}/backtracking.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForTimeout(4500);
  // Desde v1.33 la página APAGA los optimizadores al cargar planta real (se
  // llevan el 84% del cálculo y son de asesoría). El gate los quiere igual:
  // aquí se validan invariantes, no se mira la pantalla, así que declara su
  // precondición en vez de depender del default de la UI.
  await pg.evaluate(() => {
    for (const k of ['optimal', 'optfree']) {
      const i = document.querySelector(`#polbox input[data-k="${k}"]`);
      if (i && !i.checked) { i.checked = true; i.onchange(); }
    }
  });
  await pg.waitForTimeout(9000);
  if (errs.length) die('errores de consola:\n' + errs.join('\n'));

  const inv = await pg.evaluate(() => {
    const out = { ver: VER, real: !!PLANT_REAL, pols: {}, bt: !!document.getElementById('btflag'), dawn: null };
    if (typeof DAY === 'undefined' || !DAY || !DAY.pol) { out.err = 'DAY sin computar'; return out; }
    const maxA = DAY.T.maxAngle + 1e-6;
    for (const k of Object.keys(DAY.pol)) {
      const P = DAY.pol[k];
      let bad = null, steps = 0;
      for (let t = 0; t < DAY.times.length; t++) {
        const ang = P.ang[t], sh = P.shade[t], poa = P.poaP[t];
        if (!ang) continue;
        steps++;
        for (const a of ang) if (!isFinite(a) || Math.abs(a) > maxA) { bad = `θ=${a} en t=${t}`; break; }
        if (!bad && sh != null) {
          const arr = Array.isArray(sh) ? sh : [sh];
          for (const s of arr) if (!(s >= -1e-9 && s <= 1 + 1e-9)) { bad = `sombra=${s} en t=${t}`; break; }
        }
        if (!bad && poa != null && !isFinite(poa)) bad = `POA=${poa} en t=${t}`;
        if (bad) break;
      }
      out.pols[k] = { steps, bad };
    }
    // instante de alba con sombra de planta >2% para el chequeo visual
    const k0 = Object.keys(DAY.pol)[0], P0 = DAY.pol[k0];
    for (let t = 0; t < DAY.times.length; t++) {
      const sh = P0.shade[t];
      if (!sh) continue;
      const arr = Array.isArray(sh) ? sh : [sh];
      const m = arr.reduce((a, v) => a + v, 0) / arr.length;
      if (m > 0.02) { out.dawn = { t, mean: m }; break; }
    }
    return out;
  });
  if (inv.err) die(inv.err);
  if (!inv.real) die('Ayora real no cargó');
  if (!inv.bt) die('sin indicador BT OFF/ON');
  const polKeys = Object.keys(inv.pols);
  for (const k of ['pairwise', 'true3d', 'optfree'])
    if (!polKeys.includes(k)) die(`política ${k} ausente del día (hay: ${polKeys})`);
  for (const [k, p] of Object.entries(inv.pols)) {
    if (p.bad) die(`invariante roto en ${k}: ${p.bad}`);
    if (!(p.steps > 100)) die(`${k}: solo ${p.steps} pasos de día`);
  }
  ok(`v=${inv.ver} · Ayora real · ${polKeys.length} políticas · invariantes limpios`);
  if (!inv.dawn) die('sin instante de alba con sombra >2% (¿contador roto?)');

  // VISUAL: mover el slider al alba con sombra y contar píxeles
  await pg.evaluate(t => {
    const s = document.getElementById('hour');
    const stp = (typeof STEP_MIN !== 'undefined') ? STEP_MIN : 5;
    s.value = String(t * stp);
    s.dispatchEvent(new Event('input'));
  }, inv.dawn.t);
  await pg.waitForTimeout(1500);
  const rect = await pg.evaluate(() => {
    const c = TD && TD.renderer ? TD.renderer.domElement.getBoundingClientRect() : null;
    return c ? { x: c.x, y: c.y, width: c.width, height: c.height } : null;
  });
  if (!rect || rect.width < 200) die('sin canvas 3D visible');
  const shot = (await pg.screenshot({ clip: rect })).toString('base64');
  const px = await pg.evaluate(async b64 => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let red = 0, panel = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r > 110 && r > 1.8 * g && r > 1.8 * b) red++;                    // silueta roja
      if (b > 60 && b > r && b > g * 0.9) panel++;                        // azul de módulo/cielo
      if (r + g + b > 90) lit++;                                          // no-negro
    }
    return { red, panel, lit, total: d.length / 4 };
  }, shot);
  if (px.lit / px.total < 0.15) die(`canvas casi negro (${(100 * px.lit / px.total).toFixed(1)}% iluminado)`);
  if (px.panel < 2000) die(`sin paneles/cielo visibles (${px.panel} px azules)`);
  if (px.red < 300) die(`PACTO DEL ROJO roto: sombra de planta ${(inv.dawn.mean * 100).toFixed(1)}% y solo ${px.red} px rojos en pantalla`);
  ok(`visual: ${px.red} px rojos con sombra ${(inv.dawn.mean * 100).toFixed(1)}% · ${px.panel} px de paneles · escena viva`);
} finally {
  if (browser) await browser.close();
  srv.kill();
}

console.log('\nGATE OK — apto para release');
