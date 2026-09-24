/* De este modulo depende que ARRANQUEN los diez bancos de navegador del CI.
   Si se equivoca no falla uno: fallan todos, y con un «Failed to launch» que
   no señala aqui. Asi que se prueba, con el sistema de ficheros inyectado. */
import { resuelve, navegador, PESADA } from './pw_navegador.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ok = 0, ko = 0;
const check = (n, c, e) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FALL ' + n + (e !== undefined ? ' -> ' + JSON.stringify(e) : '')); } };

const hay = (...v) => (p => v.includes(p));
const A = '/opt/pw-browsers/chromium', B = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

check('PW_CHROMIUM manda por encima de todo',
      resuelve('/mio/chromium', [A, B], hay('/mio/chromium', A, B)) === '/mio/chromium',
      resuelve('/mio/chromium', [A, B], hay('/mio/chromium', A, B)));

check('un PW_CHROMIUM que no existe NO tapa las rutas conocidas',
      resuelve('/no/existe', [A, B], hay(A)) === A);

check('sin PW_CHROMIUM cae en la primera ruta que exista, por orden',
      resuelve(undefined, [A, B], hay(B)) === B);

/* EL CASO DEL RUNNER, que es el que aqui no se puede ensayar de verdad: no hay
   ninguna ruta conocida. Tiene que salir `undefined` —no null, no la cadena
   'undefined', no un fallo—, porque eso es lo que Playwright entiende como
   «usa el tuyo». Un null tambien colaria, pero `undefined` es lo documentado. */
check('sin ninguna ruta conocida devuelve undefined (que Playwright lee como «el mio»)',
      resuelve(undefined, [A, B], () => false) === undefined,
      resuelve(undefined, [A, B], () => false));

check('y no devuelve la CADENA "undefined", que Playwright tomaria por una ruta',
      typeof resuelve(undefined, [A, B], () => false) !== 'string');

check('una cadena vacia en PW_CHROMIUM no cuenta como ruta',
      resuelve('', [A, B], hay(A)) === A);

/* ── UNA PÁGINA PESADA POR NAVEGADOR (regla R-5) ────────────────────────────
   La conducta, con un chromium de mentira (sin navegador de verdad): la
   PRIMERA carga pesada pasa, la SEGUNDA en el mismo navegador lanza —en otra
   pestaña o en otro contexto—, las no pesadas pasan, y otro `navegador()`
   empieza de cero. */
const falso = () => { const pag = () => ({ goto: async u => u }); return { launch: async o => ({ o, newPage: async () => pag(), newContext: async () => ({ newPage: async () => pag() }) }) }; };
const U = 'http://localhost:8124/terreno.html?planta=elburgo';
const lanza = async f => { try { await f(); return null; } catch (e) { return e.message; } };
{
  const b = await navegador(falso(), { args: ['x'] });
  const p1 = await b.newPage(); const c = await b.newContext(); const p2 = await c.newPage();
  const e1 = await lanza(() => p1.goto(U)), e0 = await lanza(() => p1.goto('http://localhost:8124/plano.html')), e2 = await lanza(() => p2.goto(U));
  check('navegador(): la primera página pesada carga', e1 === null, e1);
  check('navegador(): una página NO pesada carga siempre', e0 === null, e0);
  check('navegador(): la SEGUNDA pesada en el mismo navegador (otro contexto) LANZA y dice por qué', !!e2 && /R-5/.test(e2), e2);
  const b2 = await navegador(falso()); const e3 = await lanza(async () => (await b2.newPage()).goto(U));
  /* EL CAMINO REAL de Playwright: `browser.newPage()` crea por dentro un contexto
     y su página con `this.newContext()` → `ctx.newPage()`, que también están
     vigilados. La primera carga NO puede contar doble (le pasó a la primera
     versión: test_terreno_plantas saltaba R-5 en su primera planta). */
  const realista = () => { const pag = () => ({ goto: async u => u });
    return { launch: async o => { const br = { o, newContext: async () => ({ newPage: async () => pag() }) };
      br.newPage = async function () { const c = await this.newContext(); return c.newPage(); }; return br; } }; };
  const b3 = await navegador(realista()); const p3 = await b3.newPage();
  const e4 = await lanza(() => p3.goto(U)), e5 = await lanza(() => p3.goto(U));
  check('navegador(): con el camino REAL de newPage (contexto por dentro), la primera carga no cuenta doble', e4 === null, e4);
  check('navegador(): y la segunda, en ese mismo navegador, sí lanza', !!e5 && /R-5/.test(e5), e5);
  check('navegador(): otro navegador empieza de cero', e3 === null, e3);
  check('navegador(): respeta las opciones y pone la ruta del ejecutable', b.o.args[0] === 'x' && 'executablePath' in b.o);
  check('PESADA reconoce terreno.html con y sin consulta, y no otras', PESADA.test(U) && PESADA.test('/terreno.html') && !PESADA.test('/terrenos.html') && !PESADA.test('/plano.html'));
}

/* EL GUARDIA: la regla solo protege si nadie la esquiva. Todo fichero de tools/
   que cargue terreno.html lanza el navegador con `navegador()`, nunca con
   `chromium.launch(` a pelo. CONTROL NEGATIVO: un fichero que lo haga sale
   señalado. */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esquiva = txt => /terreno\.html/.test(txt) && /chromium\.launch\(/.test(txt);
const culpables = fs.readdirSync(path.join(RAIZ, 'tools')).filter(f => f.endsWith('.mjs') && f !== 'pw_navegador.mjs' && f !== 'test_pw_navegador.mjs')
  .filter(f => esquiva(fs.readFileSync(path.join(RAIZ, 'tools', f), 'utf8')));
check('ningún fichero de tools/ que cargue terreno.html lanza el navegador por su cuenta', culpables.length === 0, culpables);
check('CONTROL · el guardia señala un fichero que lo haga',
      esquiva("const b = await chromium.launch({}); await pg.goto('http://x/terreno.html?planta=a');") &&
      !esquiva("const b = await navegador(chromium, {}); await pg.goto('http://x/terreno.html');"));

console.log('\n' + ok + ' OK, ' + ko + ' FALL');
process.exit(ko ? 1 : 0);
