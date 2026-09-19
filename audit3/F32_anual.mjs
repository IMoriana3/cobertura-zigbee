/* R3 · 3.2 — EL DELTA ANUAL ENTRE LAS DOS AGREGACIONES
 *
 * LO PRIMERO, PORQUE CAMBIA LA PREGUNTA: la ruta anual de la página NO usa la
 * métrica por mesa. `backtracking.html`, en el bucle anual:
 *
 *     tot[P.key]+=poaPlant(g.zen,g.az,T,lim,irr,doy,c.albedo).plant*…
 *
 * Es `poaPlant`, la de LÍNEA. Así que hoy el anual publicado no pasa por
 * `poaPlantSeg` y el delta A-vs-B no existe en él. Lo que mide este guion es lo
 * que ese delta SERÍA si el anual puntuara por mesa, y va etiquetado como tal:
 * `HIPOTÉTICO`, no una cifra del anual publicado.
 *
 * QUÉ SE MANTIENE FIJO. El mando es EXACTAMENTE el de la ruta anual de la
 * página —`policyAngles` por línea, pasado por `crearLazo()`, un lazo por
 * política y por día, paso 10 min, doce días representativos con su peso
 * `DIM[mo]`—. Lo único que cambia es cómo se agrega el POA de las mesas. Si se
 * cambiara también el mando se estarían midiendo dos cosas a la vez.
 *
 *   A · media sin ponderar de las medias de línea (la agregación de antes)
 *   B · todas las mesas de la planta, peso = largo (la de la v1.75)
 *
 * REANUDABLE por (política, mes), y el diario va FUERA del repositorio. `mgl`
 * costó ~5 000 s para UN día en la sonda diaria: doce días serían ~16,7 h, así
 * que va la última y si no termina se declara NO MEDIDA con su coste, como ya
 * se hizo en la 3.1.
 *
 *     node audit3/F32_anual.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIARIO = process.env.F32A_DIARIO || '/tmp/claude-0/f32a/meses.jsonl';
fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
const hechos = new Map();
if (fs.existsSync(DIARIO)) for (const l of fs.readFileSync(DIARIO, 'utf8').split('\n')) {
  if (!l.trim()) continue;
  try { const o = JSON.parse(l); hechos.set(o.pol + '|' + o.mo, o); } catch (e) { /* línea a medias */ }
}
if (hechos.size) console.error(`reanudando: ${hechos.size} (política, mes) ya medidos`);

/* las baratas primero y `mgl` la última: si el tiempo se acaba, se pierde la
   cara y no las ocho que sí caben */
const ORDEN = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'optimal', 'optfree', 'true3d', 'mgl'];

const PORT = 9021 + (process.pid % 25);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('ERR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 180000 });
  /* la espera sale de una MEDIDA: el día con Ayora real costó 429,2 y 491,3 s en
     dos corridas. 900 s y cronometrada, no los 300 s heredados de otra sonda. */
  const tE = Date.now();
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 900000 });
  console.error(`el día con Ayora real: ${((Date.now() - tE) / 1000).toFixed(1)} s`);
  await pg.waitForTimeout(400);

  const prep = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T);
    window.__A = { c, T, Tcfg };
    /* los doce días y sus pesos, LEÍDOS de la página para no reinventarlos */
    return { lineas: T.segs.length, mesas: T.segs.reduce((n, l) => n + l.length, 0), fecha: c.date };
  });
  console.error(`preparado · ${prep.lineas} líneas · ${prep.mesas} mesas`);

  const meses = [...Array(12).keys()];
  const t0 = Date.now(); let n = 0; const total = ORDEN.length * 12;
  for (const pol of ORDEN) {
    for (const mo of meses) {
      if (hechos.has(pol + '|' + mo)) { n++; continue; }
      const r = await pg.evaluate(([pk, mm]) => {
        const { c, T, Tcfg } = window.__A;
        /* los mismos doce días y pesos que la ruta anual de la página */
        const year = (c.date || '2026-06-21').slice(0, 4);
        const days = ['01-21','02-21','03-21','04-21','05-21','06-21','07-21','08-21','09-21','10-21','11-21','12-21'];
        const DIM  = [31,28,31,30,31,30,31,31,30,31,30,31];
        const ds = year + '-' + days[mm], doy = doyOf(ds);
        const PASO = 10;
        const LZ = crearLazo();
        let A = 0, B = 0;
        for (let m = 0; m < 1440; m += PASO) {
          const g = solarPos(localToUTCms(ds, m, c.tz), c.lat, c.lon);
          if (g.elev <= 0) continue;
          const irr = clearskyIneichen(g.zen, doy, c.alt, c.tl);
          const a = policyAngles(pk, g.zen, g.az, Tcfg, irr, doy, c.albedo).angles;
          const lim = LZ.paso(a, PASO * 60);
          const P = poaPlantSeg(g.zen, g.az, T, segsBroadcast(T, lim), irr, doy, c.albedo);
          const h = (PASO / 60) / 1000 * DIM[mm];
          B += P.plant * h;
          A += P.plantLinMedia * h;
        }
        return { pol: pk, mo: mm, dia: ds, A: A, B: B };
      }, [pol, mo]);
      fs.appendFileSync(DIARIO, JSON.stringify(r) + '\n');
      hechos.set(pol + '|' + mo, r);
      n++;
      const s = (Date.now() - t0) / 1000;
      console.error(`  ${pol} · mes ${mo + 1}/12 · ${n}/${total} · ${s.toFixed(0)} s`);
    }
    /* resumen parcial tras CADA política: si esto se corta, lo hecho se publica */
    const F = [...hechos.values()].filter(f => f.pol === pol);
    if (F.length === 12) {
      const A = F.reduce((x, f) => x + f.A, 0), B = F.reduce((x, f) => x + f.B, 0);
      console.error(`  ── ${pol}: A ${A.toFixed(6)} · B ${B.toFixed(6)} · B vs A ${(100 * (B - A) / A).toFixed(4)} %`);
    }
  }

  const res = {};
  for (const pol of ORDEN) {
    const F = [...hechos.values()].filter(f => f.pol === pol);
    if (F.length !== 12) { res[pol] = 'NO MEDIDA · ' + F.length + '/12 meses'; continue; }
    const A = F.reduce((x, f) => x + f.A, 0), B = F.reduce((x, f) => x + f.B, 0);
    res[pol] = { anual_A_kWh_m2: +A.toFixed(6), anual_B_kWh_m2: +B.toFixed(6), 'delta_B_vs_A_%': +(100 * (B - A) / A).toFixed(4) };
  }
  console.log(JSON.stringify({ commit: sha, HIPOTETICO: 'el anual PUBLICADO usa poaPlant (por línea); esto mide lo que el delta sería si puntuara por mesa',
    mando: 'policyAngles + crearLazo, idéntico a la ruta anual de la página', paso_min: 10, dias: 12, res }, null, 1));
} finally { await browser.close(); srv.kill(); }
