/* NADIE PIDE UN MAPA DE SOMBRA MAYOR DEL QUE DECLARA LA GPU.
 *
 * `renderer.capabilities.maxTextureSize` es el tope real del aparato. Por encima de
 * el se esta pidiendo una textura que no existe, y lo que se lleva por delante no es
 * un detalle: es la sombra entera. Las cuatro paginas pedian mapas a pelo —4096 en
 * backtracking y produccion, 8192 en el selector de calidad y en el boton de foto de
 * terreno— sin preguntar. En un movil que declare 2048, eso es todo.
 *
 * NO SE PUEDE MEDIR CON UN MOVIL DE VERDAD desde aqui, asi que se MIENTE A LA PAGINA:
 * se parchea `getParameter(MAX_TEXTURE_SIZE)` antes de que three.js lea las
 * capacidades, y se le hace declarar 2048. La pagina que consulta el tope pedira
 * 2048; la que no, seguira pidiendo 4096 u 8192 y esto se pone rojo. Lo que se mide
 * es si el codigo PREGUNTA, que es justo el defecto — y por eso vale aunque el
 * navegador de pruebas aguante 8192 sin despeinarse.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_tope_mapa.mjs
 *   TOPE_MAPA=viejo node tools/test_tope_mapa.mjs   (mutacion: TIENE que salir rojo)
 *
 * La MUTACION no apaga la mentira —eso seria apagar la prueba, no romper el codigo—:
 * mantiene la GPU en 2048 y devuelve a cada pagina el numero que pedia ANTES de esto
 * (8192 terreno, 4096 backtracking y produccion, 2048 overcast, que ya estaba bien).
 */
import { chromium } from 'playwright-core';
import { EXE, navegador } from './pw_navegador.mjs';

const PUERTO = process.env.PUERTO || 8124;
const VIEJO = process.env.TOPE_MAPA === 'viejo';
const TOPE = 2048;                       // lo que fingimos que declara la GPU
const MAX_TEXTURE_SIZE = 0x0D33;

let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

/* Cada pagina monta su escena a su manera y guarda la luz en otro sitio. `abre` es lo
   que hay que ejecutar para que exista el 3D (las dos de pestaña no lo montan solas). */
const PAGS = [
  { id:'terreno',      url:'terreno.html?planta=elburgo', luz:'SUN',     rend:'renderer',    antes:8192 },
  { id:'backtracking', url:'backtracking.html', abre:'setTab(true)', luz:'TD.sun',  rend:'TD.renderer', antes:4096 },
  { id:'overcast',     url:'overcast.html',     abre:'setTab(true)', luz:'TD.sun',  rend:'TD.renderer', antes:2048 },
  { id:'produccion',   url:'produccion.html',                        luz:'R3.sun',  rend:'R3.renderer', antes:4096 },
];

/* UN NAVEGADOR POR PÁGINA PESADA (regla R-5, tools/pw_navegador.mjs): el
   proceso de GPU es de todo el navegador, y con la escena anterior aún en él la
   siguiente puede no arrancar (medido: 7 de 12 lentas o colgadas en el mismo
   navegador; 12 de 12 bien con uno nuevo). `navegador()` ya no deja cargar la
   segunda. */
const LANZA = { executablePath: EXE,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--no-sandbox','--disable-dev-shm-usage'] };

const filas = [];
for (const p of PAGS) {
  const b = await navegador(chromium, LANZA);
  const ctx = await b.newContext({ viewport:{ width:900, height:520 } });
  await ctx.addInitScript(({ TOPE, MTS, VIEJO }) => {
    try { localStorage.cobertura_offline = '1'; } catch (e) {}
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      const orig = C.prototype.getParameter;
      C.prototype.getParameter = function (q) {
        return q === MTS ? TOPE : orig.call(this, q);
      };
    }
  }, { TOPE, MTS: MAX_TEXTURE_SIZE });

  const pg = await ctx.newPage();
  const errores = [];
  pg.on('pageerror', e => errores.push(String(e).slice(0, 110)));
  await pg.route('**/tcu.glb', r => r.abort());
  let f;
  try {
    await pg.goto(`http://localhost:${PUERTO}/${p.url}`, { waitUntil:'load', timeout:180000 });
    await pg.waitForTimeout(2500);
    if (p.abre) await pg.evaluate(a => { try { eval(a); } catch (e) {} }, p.abre);
    /* se espera a que la escena EXISTA en vez de dormir a ojo: terreno tarda lo que
       tarde en cargar su planta y dormir un numero fijo lo hacia inestable */
    await pg.waitForFunction(({ luz, rend }) => {
      try { return !!(eval(luz) && eval(rend)); } catch (e) { return false; }
    }, p, { timeout: 180000 });
    f = await pg.evaluate(({ luz, rend, antes, VIEJO }) => {
      const S = eval(luz), R = eval(rend);
      /* MUTACION: se le devuelve el numero que pedia antes del tope, que es
         exactamente lo que hacia el codigo sin consultar `maxTextureSize`. */
      if (VIEJO) S.shadow.mapSize.set(antes, antes);
      return { pide: S.shadow.mapSize.x, cap: R.capabilities.maxTextureSize };
    }, { ...p, VIEJO });
  } catch (e) { f = { error: String(e).slice(0, 110) }; }
  filas.push({ id: p.id, ...f, errores });
  await b.close();
}

if (VIEJO) console.log('### SIN TOPE (la mutación): la GPU sigue declarando 2048 y se le devuelve a cada página el mapa que pedía antes. Este banco TIENE que salir rojo\n');
console.log('página          pide mapa   declara la GPU');
for (const f of filas) console.log(
  f.id.padEnd(16) + (f.error ? 'ERROR ' + f.error
    : String(f.pide).padStart(9) + String(f.cap).padStart(17)));
console.log('');

/* LA COMPROBACION. No es «pide 2048» —una pagina podria pedir menos por otras
   razones— sino «no pide MAS de lo que declara la GPU», que es la regla de verdad. */
check('ninguna página pide más mapa del que declara la GPU',
      filas.every(f => !f.error && f.pide <= f.cap),
      filas.map(f => f.id + ':' + (f.error ? 'ERROR' : f.pide + '/' + f.cap)).join(' '));
/* QUE LA MENTIRA HAYA LLEGADO. Sin esto la comprobacion de arriba seria vacua: si el
   parche de `getParameter` no se aplicara, la GPU de pruebas declara 8192 y ninguna
   pagina podria pasarse aunque no mirase el tope. Se exige que las cuatro vean 2048. */
check('la GPU declara 2048 en las cuatro páginas (si no, lo de arriba no mide nada)',
      filas.every(f => !f.error && f.cap === TOPE),
      filas.map(f => f.id + ':' + (f.error ? 'ERROR' : f.cap)).join(' '));
check('las cuatro páginas montan su escena 3D',
      filas.every(f => !f.error), filas.filter(f => f.error).map(f => f.id + ':' + f.error).join(' '));
check('ninguna suelta errores mientras tanto',
      filas.every(f => f.errores.length === 0),
      filas.flatMap(f => f.errores.map(e => f.id + ':' + e))[0]);

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
if (VIEJO) {
  console.log(ko ? '\n### bien: sin el tope sale rojo' : '\n### MAL: la falta de tope pasa desapercibida');
  process.exit(ko ? 0 : 1);
}
process.exit(ko ? 1 : 0);
