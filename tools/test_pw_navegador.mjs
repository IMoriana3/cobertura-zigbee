/* De este modulo depende que ARRANQUEN los diez bancos de navegador del CI.
   Si se equivoca no falla uno: fallan todos, y con un «Failed to launch» que
   no señala aqui. Asi que se prueba, con el sistema de ficheros inyectado. */
import { resuelve } from './pw_navegador.mjs';

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

console.log('\n' + ok + ' OK, ' + ko + ' FALL');
process.exit(ko ? 1 : 0);
