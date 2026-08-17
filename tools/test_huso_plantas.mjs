/* BANCO DEL HUSO LOCAL, PLANTA A PLANTA.
   El visor dibujaba el sol con la hora de Madrid en las plantas de fuera: Túnez una hora
   adelantado, San José siete y Dicayagua seis. El huso es del layout (`tzFijo`, minutos y sin
   cambio de hora); si no lo trae, se aplica la regla peninsular, que vale para España e Italia.

   Se comprueba contra un ORÁCULO independiente: el MEDIODÍA SOLAR verdadero, que es cuando el sol
   cruza el meridiano del sitio. Se busca a un minuto de paso sobre el propio `sunVec` del visor,
   así que no se repite aquí ninguna fórmula: se mide lo que el visor dibuja.

   NO construye el 3D. `tzOffMin` y `sunVec` existen en cuanto la página se parsea; lo único que
   necesitan es `LAYOUT`, `lat0` y `lon0`, que se les da desde el propio fichero de la planta.
   Levantar los 5.493 tableros de Dicayagua para leer una función costaba minutos por planta.

       python3 -m http.server 8124 &
       node tools/test_huso_plantas.mjs                                                          */
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PUERTO = process.env.PUERTO || 8124;
/* Huso REAL de cada emplazamiento en el solsticio de junio, en minutos sobre UTC. Escritos aquí a
   propósito: son el oráculo, y vienen de la zona horaria del país, no del código que se prueba. */
const ESPERADO = {
  elburgo: 120, ayora: 120, fayon: 120, paramo: 120,   // España peninsular, CEST en junio
  bagnarelli: 120,                                     // Italia, CEST en junio
  tunez: 60,                                           // Tunicia, UTC+1 todo el año, sin cambio de hora
  sanjose: -300,                                       // Perú, UTC−5 todo el año
  dicayagua: -240,                                     // República Dominicana, UTC−4 todo el año
};
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await b.newPage({ viewport: { width: 500, height: 300 } });
/* Se corta `build()` antes de que empiece: la página se queda parseada, con sus funciones y sin
   una sola malla. Sin esto el banco tardaba minutos por planta construyendo geometría que no mira. */
await pg.addInitScript(() => {
  localStorage.cobertura_offline = '1';
  Object.defineProperty(window, '__soloHuso', { value: true });
  const _rAF = window.requestAnimationFrame; window.requestAnimationFrame = function () { return 0; };
  window.__rAF = _rAF;
});
await pg.route('**/terreno.html*', async r => {
  const res = await r.fetch();
  let h = await res.text();
  h = h.replace('build().catch(', 'if(!window.__soloHuso)build().catch(');   // única intervención: no arrancar la construcción
  await r.fulfill({ response: res, body: h, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
});
await pg.goto(`http://localhost:${PUERTO}/terreno.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await pg.waitForFunction(() => typeof tzOffMin === 'function' && typeof sunVec === 'function', { timeout: 60000 });
let malo = 0;
for (const p of Object.keys(ESPERADO)) {
  const r = await pg.evaluate(async (planta) => {
    LAYOUT = await (await fetch(planta + '_layout.json', { cache: 'no-store' })).json();
    PLANT = planta; lat0 = LAYOUT.clat; lon0 = LAYOUT.clon;
    simDoy = 172;                                    // solsticio de junio
    const tz = tzOffMin(simDoy);
    let mejor = -1, alt = -9;
    for (let m = 0; m <= 1439; m++) { const u = sunVec(m).U; if (u > alt) { alt = u; mejor = m; } }
    return { tz, mediodia: mejor, altMax: +(Math.asin(alt) * 180 / Math.PI).toFixed(1), lon: +lon0.toFixed(3) };
  }, p);
  const hh = String(Math.floor(r.mediodia / 60)).padStart(2, '0') + ':' + String(r.mediodia % 60).padStart(2, '0');
  const okTz = r.tz === ESPERADO[p];
  /* El mediodía solar de un sitio que usa su huso oficial cae en una franja estrecha alrededor de
     las 12:00 de reloj. La ventana es ancha a propósito: España va en CEST estando en el meridiano
     de Greenwich y su mediodía solar de junio ES a las 14:05, no es un fallo. Aun así atrapa lo
     que se busca: con el huso de Madrid, Dicayagua culminaría pasadas las 18:00. */
  const okSol = r.mediodia >= 10 * 60 && r.mediodia <= 14 * 60 + 30;
  const ok = okTz && okSol;
  if (!ok) malo++;
  console.log((ok ? '✓ ' : '✗ ') + p.padEnd(11) + 'huso=' + String(r.tz).padStart(5) + ' min (esperado ' + String(ESPERADO[p]).padStart(5) + ')'
    + ' · mediodía solar ' + hh + ' · sol a ' + r.altMax + '° · lon ' + r.lon
    + (okTz ? '' : '  ← HUSO MAL') + (okSol ? '' : '  ← el sol no culmina a mediodía local'));
}
await b.close();
console.log(malo ? `\n${malo} planta(s) con el huso mal` : '\ntodas las plantas en su hora local');
process.exit(malo ? 1 : 0);
