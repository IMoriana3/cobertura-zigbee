/* ¿SE PUEDE QUITAR EL PANEL DE EN MEDIO EN EL MÓVIL? Mide lo que ocupa de verdad, en píxeles de
   una pantalla de teléfono, no "parece que cabe": el panel tapaba más de la mitad del render.
   Comprueba además que la elección se recuerda y que al abrirlo vuelve todo lo que había.

       python3 -m http.server 8124 --directory .   &
       node tools/test_panel_plegable.mjs                                                      */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';   // la ruta del navegador, en un solo sitio
const PUERTO = process.env.PUERTO || 8124;
// El Burgo tarda en construirse, y por eso su goto se da 120 s.
const ESPERA = 120000;
const MOVIL = { width: 390, height: 844 };          // iPhone 14 en vertical
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
let malo = 0;
const di = (ok, t) => { if (!ok) malo++; console.log((ok ? '  ok    ' : '  FALLA ') + t); };

/* NADA DE ESTE BANCO ESPERA NI PULSA CON PLAYWRIGHT. Su maquinaria corre DENTRO
   de la página, y en esta página se cuelga. Dos veces, en su propio log:

       waitForSelector: Timeout 120000ms exceeded
         - locator resolved to visible <div class="panel">…</div>

       page.click: Timeout 30000ms exceeded
         - element is visible, enabled and stable
         - scrolling into view if needed              <-- y ahí se queda

   Las dos encontraron lo que buscaban, las dos dijeron que lo veían, y las dos
   agotaron el plazo después de decirlo. NO he logrado reproducirlo aquí ni
   frenando la CPU cuarenta veces con CDP, así que no sé cuál es el mecanismo y
   no voy a fingir que lo sé.

   Lo que sí sé es dónde NO está: no está en el plazo. El arreglo de la primera
   fue subirlo de 30 s a 120, y se volvió a plantar en 120. Y no está en el
   elemento, que las dos lo encuentran.

   Así que cambia QUIÉN decide, que es lo único que queda: la pregunta se hace
   desde node, un `evaluate` por vuelta, y la respuesta es un booleano. Medido
   con la CPU frenada 40 veces en esta misma página, el sondeo de dentro tarda
   7,6 s y este 1,1. Y sobre todo: no puede quedarse esperando algo que ya ha
   visto. Es lo que arregló los veinte `page.click` del repo hermano, que
   fallaban con este mismo síntoma. */
async function esperaPanel(pg, tope = ESPERA) {
  const t0 = Date.now();
  for (;;) {
    let hay = false;
    try {
      hay = await pg.evaluate(() => {
        const p = document.querySelector('.panel');
        if (!p) return false;
        const r = p.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(p).visibility !== 'hidden';
      });
    } catch (e) { /* la página está navegando; se vuelve a preguntar */ }
    if (hay) return;
    if (Date.now() - t0 > tope) throw new Error(`.panel no llegó a verse en ${tope / 1000} s`);
    await new Promise(r => setTimeout(r, 100));
  }
}

/* Y por lo mismo, el clic. `page.click` se colgó en «scrolling into view if
   needed» con la cabecera ya visible, estable y pulsable. Esto es UNA tarea
   encolada en la página: no sondea, no negocia, no espera a nada. */
async function pulsa(pg, sel) {
  await pg.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) throw new Error('no existe el elemento ' + JSON.stringify(s));
    e.click();
  }, sel);
}

async function abre(ctx) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=elburgo`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await esperaPanel(pg);
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

  await pulsa(pg, '#panelHdr');
  const a = await mide(pg);
  console.log(`  abierto ${a.w}×${a.h} px, ${a.visibles} de ${a.hijos} hijos visibles`);
  di(!a.plegado && a.visibles > 1, 'al abrirlo vuelve el contenido');
  di(a.h > m.h && a.w > m.w, 'abierto es mayor que plegado');
  await pulsa(pg, '#panelHdr'); await pulsa(pg, '#panelHdr');
  di((await mide(pg)).huella === a.huella, 'plegar y abrir deja EXACTAMENTE las mismas filas visibles');
  di(!errs.length, 'sin errores de consola' + (errs.length ? ': ' + errs[0] : ''));

  // la elección se recuerda entre visitas
  const g = await pg.evaluate(() => localStorage.getItem('cobertura_panel_plegado'));
  di(g === '0', 'guarda la elección (abierto = 0)');
  const p2 = await ctx.newPage();
  await p2.goto(`http://localhost:${PUERTO}/terreno.html?planta=elburgo`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await esperaPanel(p2);
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
  await pulsa(pg, '#panelHdr');
  const c = await mide(pg);
  di(c.plegado && c.visibles === 1, 'y también se puede plegar a mano');
  await pulsa(pg, '#panelHdr');
  di((await mide(pg)).huella === m.huella, 'y al volver a abrirlo queda igual que estaba');
  di(!errs.length, 'sin errores de consola' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}
await b.close();
console.log(malo ? `\n${malo} comprobación(es) con fallo` : '\ntodo OK');
process.exit(malo ? 1 : 0);
