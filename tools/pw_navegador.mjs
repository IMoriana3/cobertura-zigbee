/* DONDE ESTA EL CHROMIUM, EN UN SOLO SITIO.

   Once bancos llevaban la ruta a pelo —'/opt/pw-browsers/chromium', o el
   '/opt/pw-browsers/chromium_headless_shell-1194/...' con la version dentro—
   y ademas dos importaban playwright por '/home/user/cobertura-zigbee/...'.
   Aqui pasan porque la maquina se llama asi. En cualquier otra —un runner de
   CI, el portatil de otro— no existe ninguna de las dos rutas y el banco muere
   con «Failed to launch chromium», que se lee como si el banco estuviera roto.

   Orden: lo que diga PW_CHROMIUM, luego las rutas conocidas de esta maquina y,
   si no hay ninguna, `undefined` — que NO es un fallo: es como se le dice a
   Playwright «usa el navegador que te instalaste tu», que es lo que pasa en CI
   tras `npx playwright install chromium`. */
import { existsSync } from 'node:fs';

const CANDIDATOS = [
  process.env.PW_CHROMIUM,
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
].filter(Boolean);

export const EXE = CANDIDATOS.find(p => existsSync(p));
export const EXEC = EXE;            // los bancos lo llaman de las dos maneras
