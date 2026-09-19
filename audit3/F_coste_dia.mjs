/* R3 · CUÁNTO TARDA EL DÍA CON PLANTA REAL, Y CUÁNTO DE ESO ES EL TOPE
 *
 * Mide el reloj de `computeDay()` con Ayora real cargada por el MISMO botón que
 * pulsa el usuario (`⛰ Ayora real`), una vez que la carga ha terminado y la
 * página está quieta: así el número es el del cálculo, no el de la carga.
 *
 * COMPARACIÓN ENTRE COMMITS. El guion no cambia de rama por su cuenta —hacerlo
 * bajo una medida en curso ya rompió una corrida esta noche—. Se le dice dónde
 * mirar con `RAIZ`, y quien compare prepara dos árboles:
 *
 *     git worktree add -f --detach /tmp/antes <commit-antes>
 *     RAIZ=/tmp/antes            node audit3/F_coste_dia.mjs
 *     RAIZ=$(git rev-parse --show-toplevel) node audit3/F_coste_dia.mjs
 *
 * CONTROL, impreso siempre y antes del número: si la geometría no es la real
 * —sin `segTilt`, o sin las 79 líneas— no se está midiendo el caso caro y el
 * tiempo no dice nada. El guion lo declara en su salida (`porMesa`, `lineas`)
 * en vez de dar un milisegundaje suelto.
 */
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = process.env.RAIZ || AQUI;
const { EXE } = await import(path.join(AQUI, 'tools', 'pw_navegador.mjs'));
const PORT = 8810 + (process.pid % 60);
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('PAGEERROR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 300000 });
  /* el día arranca solo al cargar la planta y BLOQUEA el hilo: hay que esperar a
     que termine antes de cronometrar, o se cronometraría la cola */
  await pg.waitForFunction(() => { const x = document.getElementById('calcbusy');
    return !x || getComputedStyle(x).display === 'none'; }, null, { timeout: 1200000 });
  const r = await pg.evaluate(() => { const t = performance.now(); const d = computeDay();
    return { ms: +(performance.now() - t).toFixed(0), lineas: d.T.segs ? d.T.segs.length : null,
             instantes: d.times.length, politicas: Object.keys(d.pol).length,
             porMesa: !!(d.T.segTilt && d.T.segs) }; });
  if (!r.porMesa) console.error('CONTROL · la geometría NO es por mesa: este tiempo no mide el caso caro');
  console.log(JSON.stringify(Object.assign({ commit: sha, raiz: ROOT }, r)));
} finally { await b.close(); srv.kill(); }
