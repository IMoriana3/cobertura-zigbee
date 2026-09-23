/* EL SOPORTE DEL SLEW SE ENTERRABA EN LAS CUESTAS.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_apoyo_soporte.mjs [planta]
 *   APOYO_SOPORTE=viejo node tools/test_apoyo_soporte.mjs   (mutacion: TIENE que salir rojo)
 *
 * QUE PASABA. El `soporte` —el poste robusto que baja de la corona al suelo— es la
 * unica pieza del modelo marcada `terrainScaled`: la app la ESTIRA hasta el terreno.
 * Para saber hasta donde estirar usaba `t.rel`, la cota bajo el EJE del seguidor,
 * cuando el soporte esta a ±filaZ de ese eje (3,1 m en Tunez, 3,0 en el canonico).
 * Con pendiente transversal eso entierra el de la cuesta arriba y deja flotando el de
 * abajo. En Tunez, con el DEM real, eran 0,23 m bajo tierra en 11 de los 38.
 *
 * Los pilotes ya lo hacian bien: usan `postRel[pi]`, la cota bajo CADA uno. Esta pieza
 * se habia quedado con la del centro.
 *
 * POR QUE HACE FALTA ESTE BANCO Y NO BASTABA EL QUE HAY. `test_relieve_plantas.mjs`
 * mide los PILOTES (`imPost`) y no las piezas de `SEG`, asi que el soporte nunca
 * entraba. Y ademas informa en JSON sin veredicto: no puede ponerse rojo.
 *
 * SIN RED. Las teselas se sirven de `dem_sintetico.mjs` —ondulado CONTINUO, pendiente
 * maxima 20 %—, que es mas bravo que cualquier planta de la cartera y no depende de
 * que conteste un CDN.
 *
 * EL TOPE, MEDIDO Y NO ELEGIDO. Con ese relieve, el peor pie de cada planta
 * (negativo = enterrado):
 *
 *     planta       desnivel   soportes    ahora    antes
 *     Tunez          15,4 m       38     +0,022   -0,449  (16 enterrados)
 *     Fayon          33,7 m       48     +0,129
 *     Bagnarelli     42,9 m       34     +0,097
 *     Polvorin       62,0 m      238     +0,009
 *
 * Arreglado NUNCA baja de cero: 358 soportes en cuatro plantas y ni uno bajo
 * tierra. El tope se pone en -0,20, que deja 0,21 m de holgura por arriba y
 * caza por 0,25 la regla vieja. No se aprieta mas porque las otras siete
 * plantas de la cartera no se han medido aqui.
 */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';
import { teselaTerrarium, relieve, zxy } from './dem_sintetico.mjs';

const PUERTO = process.env.PUERTO || 8124;
const PLANTA = process.argv[2] || 'tunez';
const MUT = process.env.APOYO_SOPORTE === 'viejo';
const TOPE = +process.env.TOPE_SOP || 0.20;   // ver la tabla de arriba: medido, no elegido

let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const COTA = relieve(25, 800, 300);
const CACHE = new Map();
const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });

/* El relieve, del generador del repo. Sin esto la pagina se queda PLANA y el banco
   saldria verde sin haber mirado nada: en plano no hay pendiente que enterrar nada. */
await ctx.route('**/elevation-tiles-prod/**', r => {
  const t = zxy(r.request().url());
  if (!t) return r.abort();
  const k = `${t.z}/${t.x}/${t.y}`;
  if (!CACHE.has(k)) CACHE.set(k, teselaTerrarium(t.z, t.x, t.y, COTA));
  r.fulfill({ status: 200, contentType: 'image/png', body: CACHE.get(k) });
});
await ctx.route('**/server.arcgisonline.com/**', r => r.abort());
await ctx.route('**/pnoa**', r => r.abort());

const URL = `http://127.0.0.1:${PUERTO}/terreno.html?planta=${PLANTA}`;

/* LA MUTACION devuelve la regla vieja reescribiendo ESA expresion de la pagina al
   vuelo. Se rompe el codigo, no se apaga la comprobacion: una mutacion que desactive
   el cheque no prueba que el cheque sirva. */
if (MUT) await ctx.route(URL, async r => {
  const res = await r.fetch(); const antes = await res.text();
  const html = antes.replace('(t.relSop?t.relSop[sf]:t.rel)', '(t.rel)');
  if (html === antes) { console.log('FAIL la mutación no encontró la expresión que debía romper'); process.exit(2); }
  r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
});

const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route('**/tcu.glb', r => r.abort());   // 4,4 MB que aqui no pintan nada
await pg.goto(URL, { waitUntil: 'load', timeout: 150000 });
await pg.waitForFunction(() => window.TRK && window.TRK.length > 0, { timeout: 120000 });
await pg.waitForTimeout(9000);

const r = await pg.evaluate(() => {
  const s = SEG.find(q => q.key === 'soporte');
  if (!s || !s.im) return { hay: false };
  const m = new THREE.Matrix4(), d = [];
  for (let i = 0; i < s.im.count; i++) {
    s.im.getMatrixAt(i, m);
    if (Math.abs(m.elements[0]) < 0.01) continue;              // hueco a escala 0
    const x = m.elements[12], z = m.elements[14];
    /* El soporte es un Box de alto 1 centrado en su origen y la app le mete la
       escala en Y, asi que el PIE es el centro menos media altura escalada. */
    const pie = m.elements[13] - m.elements[5] / 2;
    d.push(+(pie - terrainMeshY(x, -z)).toFixed(3));           // <0 = enterrado
  }
  d.sort((a, b) => a - b);
  const rel = TRK.map(t => t.rel);
  return { hay: true, n: d.length, peor: d[0], mejor: d[d.length - 1],
           enterrados: d.filter(v => v < -0.02).length,
           desnivel: +(Math.max(...rel) - Math.min(...rel)).toFixed(1),
           vex, filaZ: TC.filaZ };
});

console.log(JSON.stringify(r));
check(`la planta ${PLANTA} trae sus soportes`, r.hay && r.n > 0, JSON.stringify(r));

/* SIN RELIEVE ESTE BANCO NO VALE. En plano todos los pies caen donde sea y el
   cheque de abajo pasaria solo. Se exige la pendiente antes de creerse nada. */
check('y el relieve sintético ha llegado (si no, no hay cuesta que enterrar nada)',
      r.hay && r.desnivel > 3, `desnivel ${r.hay ? r.desnivel : '—'} m`);

check('ningún soporte se entierra en el terreno',
      r.hay && r.peor > -TOPE,
      `peor ${r.hay ? r.peor : '—'} m · enterrados ${r.hay ? r.enterrados : '—'}/${r.hay ? r.n : '—'} (tope ${-TOPE})`);

check('sin errores de JS', errs.length === 0, errs.slice(0, 3).join(' · '));

await b.close();
if (MUT) { console.log(ko ? `\nMUTACIÓN OK: el banco la caza (${ko} rojo)` : '\nMUTACIÓN NO CAZADA: el banco no vale');
           process.exit(ko ? 0 : 1); }
if (ko) { console.log(`\n${ko} FALLOS (${ok} OK)`); process.exit(1); }
console.log(`\nTODAS OK (${ok} comprobaciones)`);
