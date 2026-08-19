/* ¿SE PUEDE QUITAR EL PANEL DE EN MEDIO EN EL MÓVIL? Mide lo que ocupa de verdad, en píxeles de
   una pantalla de teléfono, no "parece que cabe": el panel tapaba más de la mitad del render.
   Comprueba además que la elección se recuerda y que al abrirlo vuelve todo lo que había.

       python3 -m http.server 8124 --directory .   &
       node tools/test_panel_plegable.mjs                                                      */
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PUERTO = process.env.PUERTO || 8124;
const MOVIL = { width: 390, height: 844 };          // iPhone 14 en vertical
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
let malo = 0;
const di = (ok, t) => { if (!ok) malo++; console.log((ok ? '  ok    ' : '  FALLA ') + t); };

async function abre(ctx) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=elburgo`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pg.waitForSelector('.panel', { timeout: 30000 });
  return { pg, errs };
}
const mide = pg => pg.evaluate(() => {
  const p = document.querySelector('.panel'), r = p.getBoundingClientRect();
  /* La huella es QUÉ hijos se ven, no cuántos: ajustaPanelPlanta esconde las filas que no
     aplican a la planta, así que "los 47" nunca se ven ni antes ni después. */
  const huella = [...p.children].map((e, i) => getComputedStyle(e).display !== 'none' ? (e.id || i) : null)
                                .filter(x => x !== null).join(',');
  return { w: Math.round(r.width), h: Math.round(r.height), plegado: p.classList.contains('plegado'),
    hijos: p.children.length, visibles: huella ? huella.split(',').length : 0, huella,
    pantalla: innerWidth * innerHeight, tgl: (document.getElementById('panelTgl') || {}).textContent };
});

console.log('=== móvil 390×844, primera visita (sin nada guardado) ===');
{
  const ctx = await b.newContext({ viewport: MOVIL });
  const { pg, errs } = await abre(ctx);
  const m = await mide(pg);
  const tapa = (m.w * m.h) / m.pantalla;
  console.log(`  panel ${m.w}×${m.h} px, ${(tapa * 100).toFixed(0)} % de la pantalla, ${m.visibles} de ${m.hijos} hijos visibles`);
  di(m.plegado, 'arranca plegado en pantalla estrecha');
  di(tapa < 0.10, 'plegado ocupa menos del 10 % de la pantalla');
  di(m.visibles === 1, 'plegado solo deja la cabecera');
  di(m.tgl === '☰', 'el botón invita a abrir (☰)');

  await pg.click('#panelHdr');
  const a = await mide(pg);
  console.log(`  abierto ${a.w}×${a.h} px, ${a.visibles} de ${a.hijos} hijos visibles`);
  di(!a.plegado && a.visibles > 1, 'al abrirlo vuelve el contenido');
  di(a.h > m.h && a.w > m.w, 'abierto es mayor que plegado');
  await pg.click('#panelHdr'); await pg.click('#panelHdr');
  di((await mide(pg)).huella === a.huella, 'plegar y abrir deja EXACTAMENTE las mismas filas visibles');
  di(!errs.length, 'sin errores de consola' + (errs.length ? ': ' + errs[0] : ''));

  // la elección se recuerda entre visitas
  const g = await pg.evaluate(() => localStorage.getItem('cobertura_panel_plegado'));
  di(g === '0', 'guarda la elección (abierto = 0)');
  const p2 = await ctx.newPage();
  await p2.goto(`http://localhost:${PUERTO}/terreno.html?planta=elburgo`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p2.waitForSelector('.panel');
  di(!(await mide(p2)).plegado, 'al volver sigue abierto, como se dejó');
  await ctx.close();
}

console.log('=== escritorio 1440×900, primera visita ===');
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const { pg, errs } = await abre(ctx);
  const m = await mide(pg);
  console.log(`  panel ${m.w}×${m.h} px, ${m.visibles} de ${m.hijos} hijos visibles`);
  di(!m.plegado, 'en escritorio arranca abierto, como siempre');
  di(m.visibles > 20, 'con su contenido dentro (' + m.visibles + ' filas)');
  await pg.click('#panelHdr');
  const c = await mide(pg);
  di(c.plegado && c.visibles === 1, 'y también se puede plegar a mano');
  await pg.click('#panelHdr');
  di((await mide(pg)).huella === m.huella, 'y al volver a abrirlo queda igual que estaba');
  di(!errs.length, 'sin errores de consola' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}
await b.close();
console.log(malo ? `\n${malo} comprobación(es) con fallo` : '\ntodo OK');
process.exit(malo ? 1 : 0);
