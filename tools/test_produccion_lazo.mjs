/* La UI del lazo de control y del selector de política, EN CHROMIUM (produccion.html).
   Uso:  PUERTO=8127 node tools/test_produccion_lazo.mjs   (levanta su propio servidor si no hay)

   Los bancos Node de LÓGICA PURA ya comprueban la física del lazo; esto comprueba lo que solo se
   ve en la página: que el selector se pueble con las nueve políticas, que el interruptor cambie de
   verdad el θ pintado, que el CURSOR del lazo dé lo mismo que recorrer el día en orden —si no, la
   escena y la energía estarían contando dos físicas distintas— y lo que cuesta en tiempo mover el
   reloj hacia atrás, que es el precio declarado de que la banda muerta tenga memoria. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUERTO = process.env.PUERTO || 8127;
const EXE = process.env.PW_EXE ||
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const BASE = `http://127.0.0.1:${PUERTO}`;

let ok = 0, ko = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); }
                      catch (e) { ko++; console.error('  ✗ ' + n + ' — ' + e.message); } };

// servidor propio si el puerto está libre (como test_produccion_3d)
let srv = null;
async function vivo() {
  try { const r = await fetch(BASE + '/produccion.html'); return r.ok; } catch { return false; }
}
if (!(await vivo())) {
  srv = spawn('python3', ['-m', 'http.server', String(PUERTO)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await vivo()); i++) await new Promise(r => setTimeout(r, 250));
}

const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(BASE + '/produccion.html', { waitUntil: 'load', timeout: 120000 });
const t0 = Date.now();
while (!(await pg.evaluate(() => typeof instant === 'function' && typeof ctrlDe === 'function' && !!T))) {
  if (Date.now() - t0 > 180000) throw new Error('la página no expuso instant/ctrlDe/T');
  await pg.waitForTimeout(400);
}

console.log('produccion.html — el lazo de control y las políticas, en el navegador');

t('la página carga sin errores', () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
});

const ui = await pg.evaluate(() => ({
  pols: [...document.getElementById('pol').options].map(o => o.value),
  nombres: [...document.getElementById('pol').options].map(o => o.textContent),
  titulos: [...document.getElementById('pol').options].filter(o => o.title).length,
  valor: document.getElementById('pol').value,
  campos: ['ctrlOn','ctrlDb','ctrlSlew','ctrlCiclo','ctrlModo'].filter(i => !!document.getElementById(i)),
  db: document.getElementById('ctrlDb').value,
  slew: document.getElementById('ctrlSlew').value,
  on: document.getElementById('ctrlOn').checked,
  pill: document.getElementById('modepill').textContent,
  nucleo: typeof CTRLCORE !== 'undefined' && !!CTRLCORE,
}));

t('el núcleo del lazo ha cargado en la página (js/control_core.js)', () => {
  if (!ui.nucleo) throw new Error('CTRLCORE no está: el <script src> no ha entrado');
});
t('el selector trae las NUEVE políticas del bt3d, con su descripción', () => {
  if (ui.pols.length !== 9) throw new Error(`${ui.pols.length} políticas: ${ui.pols.join(',')}`);
  if (ui.titulos !== 9) throw new Error(`${ui.titulos} de 9 opciones llevan descripción`);
  for (const k of ['pairwise','true3d','row','global','bt2d','mgl','optimal','optfree','astro'])
    if (!ui.pols.includes(k)) throw new Error(`falta la política ${k}`);
});
t('arranca en PAIRWISE y con el lazo APAGADO (quien no toque nada ve la página de antes)', () => {
  if (ui.valor !== 'pairwise') throw new Error(`arranca en ${ui.valor}`);
  if (ui.on) throw new Error('el lazo arranca encendido');
  if (!/Pairwise/.test(ui.pill)) throw new Error(`el pill no dice la política: «${ui.pill}»`);
});
t('la tarjeta del lazo tiene sus cinco campos, con los canónicos de la casa', () => {
  if (ui.campos.length !== 5) throw new Error('faltan campos: ' + ui.campos.join(','));
  if (ui.db !== '1.0') throw new Error(`banda por defecto ${ui.db}`);
  if (ui.slew !== '0.17') throw new Error(`velocidad por defecto ${ui.slew}`);
});

/* EL CURSOR. Es la pieza que solo existe en la página: el instante pintado sale de avanzar un
   cursor, y tiene que dar EXACTAMENTE lo mismo que recorrer el día en orden con instant(). Si no,
   la escena y la energía cuentan dos físicas distintas — el pecado que esta casa ya conoce. */
const cur = await pg.evaluate(() => {
  const c = cfg();
  c.ctrl = { on:true, db:1.0, slew:0.17, cicloMin:1, modo:'libre' };
  document.getElementById('ctrlOn').checked = true;
  const paso = PASO_LAZO, M = 615;
  // a mano, recorriendo el día en orden
  let prev = null, aMano = null;
  for (let m = 0; m <= Math.floor(M / paso) * paso; m += paso) {
    prev = instant(F, c, T.obj, m, prev);
    aMano = prev;
  }
  const fin = instant(F, c, T.obj, M, aMano);
  // por el cursor (el camino de repaint)
  CTRLCUR = null;
  const t1 = performance.now();
  const porCursor = instantConLazo(c, M);
  const msFrio = performance.now() - t1;
  const t2 = performance.now();
  const seguido = instantConLazo(c, M + 5);      // avanzar hacia DELANTE
  const msTibio = performance.now() - t2;
  const t3 = performance.now();
  instantConLazo(c, 400);                        // ir hacia ATRÁS: rehace la mañana
  const msAtras = performance.now() - t3;
  // y el instante SIN lazo, para ver que el interruptor hace algo
  const sin = instant(F, Object.assign({}, c, { ctrl:{ on:false } }), T.obj, M);
  return { mano: fin.ang.slice(), cursor: porCursor.ang.slice(), cons: fin.angT.slice(),
           sin: sin.ang.slice(), msFrio, msTibio, msAtras, seguido: seguido.ang.slice() };
});

t('el CURSOR da el mismo θ que recorrer el día en orden (una sola física en pantalla)', () => {
  if (JSON.stringify(cur.mano) !== JSON.stringify(cur.cursor))
    throw new Error(`cursor ≠ día en orden:\n  mano:   ${cur.mano.slice(0,4).map(v=>v.toFixed(4))}\n  cursor: ${cur.cursor.slice(0,4).map(v=>v.toFixed(4))}`);
});
t('con el lazo el θ pintado NO es la consigna, y se separa menos de una banda', () => {
  const d = cur.mano.map((v, i) => Math.abs(v - cur.cons[i]));
  const peor = Math.max(...d);
  if (!(peor > 1e-6)) throw new Error('el lazo no desalinea nada: el interruptor no hace nada');
  if (peor > 1.0 + 1e-6) throw new Error(`desalineo mayor que la banda: ${peor.toFixed(4)}°`);
});
t('y el θ con lazo es distinto del θ sin lazo (el interruptor se nota en la escena)', () => {
  if (JSON.stringify(cur.mano) === JSON.stringify(cur.sin))
    throw new Error('con y sin lazo pintan el mismo θ');
});
t('avanzar el reloj hacia DELANTE es barato; hacia atrás se paga y va declarado', () => {
  if (!(cur.msTibio < cur.msFrio)) throw new Error(`avanzar (${cur.msTibio.toFixed(0)} ms) no es más barato que arrancar en frío (${cur.msFrio.toFixed(0)} ms)`);
  console.log(`    (cursor: frío ${cur.msFrio.toFixed(0)} ms · un paso ${cur.msTibio.toFixed(0)} ms · hacia atrás ${cur.msAtras.toFixed(0)} ms)`);
  if (cur.msAtras > 20000) throw new Error(`ir hacia atrás cuesta ${(cur.msAtras/1000).toFixed(1)} s: inusable`);
});

/* Y que al mover el interruptor en la UI la página REPINTE con lo nuevo, que es el cableado de los
   listeners (invalidar el día, el cursor y el carril de horas). */
const tras = await pg.evaluate(async () => {
  const antes = document.getElementById('modepill').textContent;
  document.getElementById('ctrlDb').value = '4';
  document.getElementById('ctrlOn').checked = true;
  document.getElementById('ctrlOn').dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 300));
  const pill = document.getElementById('modepill').textContent;
  document.getElementById('pol').value = 'astro';
  document.getElementById('pol').dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 300));
  return { antes, pill, pill2: document.getElementById('modepill').textContent, cursor: !!CTRLCUR };
});

t('encender el lazo en la UI repinta y el pill dice el PASO', () => {
  if (!/paso 4°/.test(tras.pill)) throw new Error(`el pill no lleva el paso: «${tras.pill}»`);
});
t('cambiar de política repinta y el pill dice cuál', () => {
  if (!/Astronómico/.test(tras.pill2)) throw new Error(`el pill no dice la política: «${tras.pill2}»`);
});
t('no han aparecido errores de página en todo el recorrido', () => {
  if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
});

await b.close();
if (srv) srv.kill();
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
