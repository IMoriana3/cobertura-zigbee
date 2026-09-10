/* EL VISOR 2D CONTANDO BÍFILAS. En una bífila el plano coloca UNA ENTRADA POR TUBO, así que
   `trackers.length` NO son los seguidores: son las filas. Catania se anunciaba con 3.314
   seguidores donde hay 1.657, el doble, y ese número es el que la gente apunta.
   Y lo que el plano NO empareja (el 19 % de Catania) se pinta aparte: verlo en el campo dice
   DÓNDE está el hueco, que es lo que no cabe en un número.
     node tools/test_plano_bifila.mjs        (necesita el repo servido; puerto 8124 por convenio) */
import { chromium } from 'playwright';
import { resuelve } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;      // el convenio de los demás bancos de navegador
const BASE = `http://localhost:${PUERTO}`;
let ok = 0, ko = 0;
const check = (n, c, e) => { if (c) { ok++; console.log('  ok    ' + n); }
  else { ko++; console.log('  FALLA ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); } };

const b = await chromium.launch({ executablePath: resuelve() });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '/plano.html?planta=catania');
await p.waitForFunction(() => window.L && window.L.trackers && window.L.trackers.length, null, { timeout: 30000 });
await p.waitForTimeout(1500);

const d = await p.evaluate(() => ({ filas: L.trackers.length, bif: L.bifila && L.bifila.filas,
  conPar: L.trackers.filter(t => t.par).length, emp: !!L.emparejado, txt: cuentaUnidades() }));
check('el layout trae las filas y se declara bífila', d.filas === 3314 && d.bif === 2, d);
check('y el emparejamiento del plano', d.emp && d.conPar === 2680, d.conPar);
check('el visor cuenta SEGUIDORES, no filas', /<b>1657<\/b> seguidores/.test(d.txt), d.txt);
check('y dice cuántas filas son, que es lo que dibuja', /\(3314 filas\)/.test(d.txt), d.txt);

const est = await p.evaluate(() => document.getElementById('status').textContent);
check('el estado de la página lleva ese mismo número', /1657 seguidores/.test(est.replace(/\s+/g, ' ')), est.slice(0, 80));

// las filas sin pareja se pintan en otro color: se cuenta el píxel, no la intención
const col = await p.evaluate(() => {
  const c = document.querySelector('canvas'), g = c.getContext('2d');
  const im = g.getImageData(0, 0, c.width, c.height).data;
  let azul = 0, ocre = 0;
  for (let i = 0; i < im.length; i += 4) {
    const r = im[i], v = im[i + 1], a = im[i + 2];
    if (Math.abs(r - 0x3a) < 12 && Math.abs(v - 0x78) < 12 && Math.abs(a - 0xd6) < 12) azul++;
    if (Math.abs(r - 0x8a) < 12 && Math.abs(v - 0x6d) < 12 && Math.abs(a - 0x3b) < 12) ocre++;
  }
  return { azul, ocre };
});
check('se pintan las filas emparejadas', col.azul > 500, col);
check('y las que el plano no empareja, en otro color', col.ocre > 200, col);
check('las sin pareja son MINORÍA, como dice el dato (634 de 3314)', col.ocre < col.azul, col);

// una planta que no es bífila no cambia de cuenta
await p.goto(BASE + '/plano.html?planta=panbianco');
await p.waitForFunction(() => window.L && window.L.trackers && window.L.trackers.length, null, { timeout: 30000 });
const pb = await p.evaluate(() => ({ n: L.trackers.length, bif: !!(L.bifila && L.bifila.filas > 1), txt: cuentaUnidades() }));
check('en una planta sin `bifila` declarada, la cuenta no se toca',
  !pb.bif && pb.txt === '<b>' + pb.n + '</b> seguidores', pb);

await b.close();
console.log(errs.length ? '\nerrores JS: ' + errs.join(' | ') : '\nsin errores JS');
console.log(ko ? `\n${ko} FALLAN de ${ok + ko}` : `\nOK — ${ok}/${ok} comprobaciones`);
process.exit(ko || errs.length ? 1 : 0);
