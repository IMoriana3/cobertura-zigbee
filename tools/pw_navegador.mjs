/* DONDE ESTA EL CHROMIUM, EN UN SOLO SITIO.

   Once bancos llevaban la ruta a pelo —'/opt/pw-browsers/chromium', o el
   '/opt/pw-browsers/chromium_headless_shell-1194/...' con la version dentro—
   y ademas dos importaban playwright por '/home/user/cobertura-zigbee/...'.
   En la maquina de desarrollo pasan porque se llama asi. En cualquier otra —un
   runner de CI, el portatil de otro— no existe ninguna de las dos rutas y el
   banco muere con «Failed to launch chromium», que se lee como si el banco
   estuviera roto en vez de mal instalado.

   Orden: lo que diga PW_CHROMIUM, luego las rutas conocidas de la maquina de
   desarrollo y, si no hay ninguna, `undefined` — que NO es un fallo: es como
   se le dice a Playwright «usa el navegador que te instalaste tu», que es lo
   que pasa en CI tras `playwright install chromium`.

   La resolucion va aparte y con el `existe` inyectado porque de esto dependen
   ahora diez jobs: si se equivoca, no falla un banco, fallan todos a la vez y
   con un error que no señala aqui. Su banco es tools/test_pw_navegador.mjs. */
import { existsSync } from 'node:fs';

export const CANDIDATOS = [
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
];

export function resuelve(env, candidatos = CANDIDATOS, existe = existsSync) {
  return [env, ...candidatos].filter(Boolean).find(p => existe(p));
}

export const EXE = resuelve(process.env.PW_CHROMIUM);
export const EXEC = EXE;            // los bancos lo llaman de las dos maneras

/* UNA PÁGINA PESADA POR NAVEGADOR — IMPUESTO, NO ACONSEJADO (regla R-5 de la
   refundación del BT: la protección va donde todos pasan).

   LA RAZÓN, que estuvo escrita en un solo sitio desde #479 (cabecera de
   test_terreno_plantas.mjs): «reusando uno solo, el proceso de render se quedaba
   ocupado con la planta anterior y la siguiente no arrancaba nunca». Los bancos
   vecinos no la leyeron y repitieron el patrón; test_bt3d_rot se colgó así en CI
   (#753, #759) y #741 lo rodeó otra vez con El Burgo sin conectarlo.

   MEDIDO (2026-09-24, diagnóstico de test_bt3d_rot): `terreno.html` renderiza
   con swiftshader y su proceso de GPU es COMPARTIDO por todo el navegador. Con
   la escena anterior aún en él (98-105 % de un núcleo en el momento del
   cuelgue), la página siguiente recibe su HTML del servidor (200) y no llega a
   procesarlo: su render espera a la GPU. Segunda carga en el mismo navegador
   con contexto nuevo, 12 pasadas: 5 bien, 5 a ~80 s, 2 agotadas a 120 s. Con
   NAVEGADOR NUEVO: 12 de 12 bien, 0,44-1,70 s. Subir el timeout solo movería el
   umbral: la espera depende de lo que tarde la GPU en soltarse.

   `navegador(chromium, opciones)` lanza como `chromium.launch` y vigila
   `goto`: la SEGUNDA carga de una página pesada en el mismo navegador —en
   cualquier pestaña o contexto, cerrada o no la primera— LANZA un error que
   dice por qué. Para cargar otra planta, otro `navegador()`. El guardia de
   tools/test_pw_navegador.mjs exige que todo banco que cargue `terreno.html`
   lance por aquí y no por su cuenta. */
export const PESADA = /\/terreno\.html(?:[?#]|$)/;
export async function navegador(chromium, opciones = {}) {
  const b = await chromium.launch({ executablePath: EXE, ...opciones });
  let pesadas = 0;
  /* UNA sola vigilancia por página. `browser.newPage()` de Playwright llama POR
     DENTRO a `browser.newContext()` y a `context.newPage()`, que también están
     vigilados: sin esta marca la página quedaba envuelta dos veces y la PRIMERA
     carga contaba doble (lo cazó test_terreno_plantas, que da un navegador por
     planta y aun así saltaba R-5 en la primera). */
  const vigiladas = new WeakSet();
  const vigila = pg => {
    if (vigiladas.has(pg)) return pg;
    vigiladas.add(pg);
    const ir = pg.goto.bind(pg);
    pg.goto = async (url, o) => {
      if (PESADA.test(String(url)) && pesadas++ >= 1)
        throw new Error('R-5 · segunda página pesada (' + url + ') en el MISMO navegador: su proceso de GPU sigue ocupado ' +
          'con la anterior y esta puede no arrancar (medido: 7 de 12 lentas o colgadas). Lanza otro `navegador()` por página pesada.');
      return ir(url, o);
    };
    return pg;
  };
  const nuevaPag = b.newPage.bind(b);
  b.newPage = async (...a) => vigila(await nuevaPag(...a));
  const nuevoCtx = b.newContext.bind(b);
  b.newContext = async (...a) => {
    const c = await nuevoCtx(...a), np = c.newPage.bind(c);
    c.newPage = async (...x) => vigila(await np(...x));
    return c;
  };
  return b;
}
