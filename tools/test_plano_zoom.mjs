/* AMPLIAR EN EL LAYOUT 2D. La página se declara `user-scalable=no` y el lienzo `touch-action:none`
   —necesario para que el gesto no mueva la interfaz entera—, pero solo tenía escrita la RUEDA: en
   tableta o móvil no había NINGUNA forma de ampliar. El 3D no lo sufría (OrbitControls trae pinza).
   Aquí se comprueba con TÁCTIL DE VERDAD (Input.dispatchTouchEvent de CDP, no eventos inventados),
   y de paso que la pestaña de la escena 3D no lleve a otra planta.
     node tools/test_plano_zoom.mjs        (necesita el repo servido; puerto 8124 por convenio) */
import { chromium } from 'playwright';
import { resuelve } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
const BASE = `http://localhost:${PUERTO}`;
let ok = 0, ko = 0;
const check = (n, c, e) => { if (c) { ok++; console.log('  ok    ' + n); }
  else { ko++; console.log('  FALLA ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); } };

const b = await chromium.launch({ executablePath: resuelve() });
const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const cdp = await ctx.newCDPSession(p);

const escala = () => p.evaluate(() => view.scale);
const vista  = () => p.evaluate(() => ({ s: view.scale, x: view.x, n: view.n }));
const dedos  = (type, pts) => cdp.send('Input.dispatchTouchEvent',
  { type, touchPoints: pts.map(q => ({ x: q[0], y: q[1], id: q[2] })) });

async function abre(planta) {
  await p.goto(`${BASE}/plano.html?planta=${planta}`);
  await p.waitForFunction(() => window.L && window.L.trackers && window.L.trackers.length, null, { timeout: 30000 });
  await p.waitForTimeout(700);
}

await abre('catania');

// ── la rueda, que ya estaba: el paso por zoomA() no puede habérsela llevado por delante
const s0 = await escala();
await p.mouse.move(600, 400); await p.mouse.wheel(0, -400); await p.waitForTimeout(200);
const sRueda = await escala();
check('la rueda sigue ampliando', sRueda > s0 * 1.2, { s0, sRueda });

// ── la pinza abriendo (dos dedos separándose) amplía
await p.evaluate(() => document.getElementById('fit').click()); await p.waitForTimeout(200);
const sFit = await escala();
await dedos('touchStart', [[500, 400, 1], [700, 400, 2]]);
await dedos('touchMove',  [[400, 400, 1], [800, 400, 2]]);
await p.waitForTimeout(150);
const sAbre = await escala();
await dedos('touchEnd', []);
check('la pinza abriendo AMPLÍA', sAbre > sFit * 1.5, { sFit, sAbre });
check('y amplía en la proporción del gesto (200 px → 400 px = ×2)', Math.abs(sAbre / sFit - 2) < 0.06, sAbre / sFit);

// ── la pinza cerrando aleja
await dedos('touchStart', [[400, 400, 1], [800, 400, 2]]);
await dedos('touchMove',  [[550, 400, 1], [650, 400, 2]]);
await p.waitForTimeout(150);
const sCierra = await escala();
await dedos('touchEnd', []);
check('la pinza cerrando ALEJA', sCierra < sAbre * 0.6, { sAbre, sCierra });

// ── el punto entre los dedos se queda quieto (si no, el plano se escapa al ampliar)
await p.evaluate(() => document.getElementById('fit').click()); await p.waitForTimeout(200);
const antesMundo = await p.evaluate(() => ({ x: s2wx(600), n: s2wn(400) }));
await dedos('touchStart', [[500, 400, 1], [700, 400, 2]]);
await dedos('touchMove',  [[450, 400, 1], [750, 400, 2]]);
await p.waitForTimeout(150);
const despMundo = await p.evaluate(() => ({ x: s2wx(600), n: s2wn(400) }));
await dedos('touchEnd', []);
check('el punto entre los dedos no se mueve del sitio',
  Math.abs(despMundo.x - antesMundo.x) < 0.5 && Math.abs(despMundo.n - antesMundo.n) < 0.5,
  { antesMundo, despMundo });

// ── al levantar UN dedo de la pinza, el que queda arrastra SIN salto
await p.evaluate(() => document.getElementById('fit').click()); await p.waitForTimeout(200);
await dedos('touchStart', [[500, 400, 1], [700, 400, 2]]);
await dedos('touchMove',  [[450, 400, 1], [750, 400, 2]]);
await p.waitForTimeout(120);
/* OJO con el gesto: en CDP el `touchEnd` lista los dedos que SE LEVANTAN, no los que quedan. Con la
   lista al revés no se prueba nada —se suelta el otro dedo y el siguiente `touchMove` crea un dedo
   nuevo—, y el banco daba un fallo que no existía. */
await dedos('touchEnd',   [[450, 400, 1]]);          // se levanta el dedo 1 (el de 450), queda el 2 en 750
const vAntes = await vista();
await dedos('touchMove',  [[650, 400, 2]]);          // el que queda se mueve 100 px a la izquierda
await p.waitForTimeout(120);
const vDesp = await vista();
const esperado = vAntes.x + 100 / vAntes.s;          // arrastrar a la izquierda mueve la vista al este
check('tras soltar un dedo, el arrastre no pega un salto',
  Math.abs(vDesp.x - esperado) < 1, { esperado, real: vDesp.x, salto: vDesp.x - esperado });
await dedos('touchEnd', []);

// ── los botones
await p.evaluate(() => document.getElementById('fit').click()); await p.waitForTimeout(200);
const sB0 = await escala();
await p.click('#zIn'); await p.waitForTimeout(120);
const sMas = await escala();
await p.click('#zOut'); await p.click('#zOut'); await p.waitForTimeout(120);
const sMenos = await escala();
check('el botón ＋ amplía', sMas > sB0 * 1.3, { sB0, sMas });
check('el botón − aleja', sMenos < sB0, { sB0, sMenos });

// ── los topes siguen puestos: 40 clics no dejan la escala fuera de [0,02 · 20]
for (let i = 0; i < 40; i++) await p.evaluate(() => document.getElementById('zIn').click());
const sTope = await escala();
for (let i = 0; i < 80; i++) await p.evaluate(() => document.getElementById('zOut').click());
const sTopeAb = await escala();
check('la escala no se sale de los topes', sTope <= 20.0001 && sTopeAb >= 0.0199, { sTope, sTopeAb });

// ── la pestaña de la escena 3D no puede llevar a OTRA planta
const t3 = () => p.evaluate(() => {
  const e = [...document.querySelectorAll('header .cobsel a, header .cobsel span')]
    .find(x => /Escena 3D/.test(x.textContent));
  return e ? { tag: e.tagName, href: e.getAttribute('href'), title: e.title } : null;
});
const cat = await t3();
check('en Catania la pestaña «Escena 3D» está apagada (no es enlace)', cat && cat.tag === 'SPAN' && !cat.href, cat);
check('y dice por qué', cat && /no tiene escena 3D/i.test(cat.title || ''), cat && cat.title);

await abre('elburgo');
const eb = await t3();
check('en El Burgo sigue viva y va a su 3D', eb && eb.tag === 'A' && /^terreno\.html/.test(eb.href || ''), eb);

await abre('panbianco');
const pb = await t3();
check('y en otra planta con 3D, también', pb && pb.tag === 'A' && /terreno\.html\?planta=panbianco/.test(pb.href || ''), pb);

await b.close();
console.log(errs.length ? '\nerrores JS: ' + errs.join(' | ') : '\nsin errores JS');
console.log(ko ? `\n${ko} FALLAN de ${ok + ko}` : `\nOK — ${ok}/${ok} comprobaciones`);
process.exit(ko || errs.length ? 1 : 0);
