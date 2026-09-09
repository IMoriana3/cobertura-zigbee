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
