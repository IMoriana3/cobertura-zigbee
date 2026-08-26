/* ¿VA FLUIDO EL 3D? Mide fotogramas de verdad, no sensaciones: cuenta los rAF durante una ventana
   con la cámara EN MOVIMIENTO, que es cuando se nota el tirón, y separa el coste de la escena
   (cuántos objetos, cuántas llamadas de dibujo) del coste por fotograma.

   OJO al medir: un headless_shell huérfano se come 3 de los 4 núcleos y falsea TODO. Comprobar
   antes con `ps -C headless_shell`.

       python3 -m http.server 8124 --directory .   &
       node tools/test_fps.mjs elburgo ayora fayon                                                */
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PUERTO = process.env.PUERTO || 8124;
const PLANTAS = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!PLANTAS.length) { console.error('uso: node tools/test_fps.mjs <planta…>'); process.exit(2); }

const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
console.log('planta        listo    objetos  mallas  instancias  triángulos   ms/frame   fps    ms/frame(cámara)  fps');
for (const p of PLANTAS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) { } });
  const pg = await ctx.newPage();
  const t0 = Date.now();
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${p}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  /* a mano, que waitForFunction se corta sola a los ~30 s en playwright-core 1.62.1 */
  while (!(await pg.evaluate(() => typeof bosGroup !== 'undefined' && bosGroup && bosGroup.children.length > 0))) {
    if (Date.now() - t0 > 300000) break;
    await pg.waitForTimeout(500);
  }
  const listo = ((Date.now() - t0) / 1000).toFixed(1);
  await pg.waitForTimeout(2500);
  const escena = await pg.evaluate(() => {
    let obj = 0, mallas = 0, inst = 0, tri = 0;
    scene.traverse(o => {
      obj++;
      if (o.isInstancedMesh) { mallas++; inst += o.count; if (o.geometry && o.geometry.index) tri += (o.geometry.index.count / 3) * o.count; }
      else if (o.isMesh) { mallas++; if (o.geometry && o.geometry.index) tri += o.geometry.index.count / 3; }
    });
    return { obj, mallas, inst, tri: Math.round(tri) };
  });
  const mide = (mover) => pg.evaluate((mv) => new Promise(res => {
    let n = 0; const t = performance.now(); let a = 0;
    const paso = () => {
      n++;
      if (mv && typeof controls !== 'undefined' && controls) {         // órbita continua
        a += 0.01; try { camera.position.x = Math.cos(a) * camera.position.length() * 0.999; camera.lookAt(controls.target || new THREE.Vector3()); } catch (e) { }
      }
      if (performance.now() - t < 3000) requestAnimationFrame(paso);
      else res({ ms: +((performance.now() - t) / n).toFixed(1), fps: +(n / ((performance.now() - t) / 1000)).toFixed(1) });
    };
    requestAnimationFrame(paso);
  }), mover);
  const quieto = await mide(false), movido = await mide(true);
  console.log(`${p.padEnd(13)} ${listo.padStart(5)}s ${String(escena.obj).padStart(8)} ${String(escena.mallas).padStart(7)} ${String(escena.inst).padStart(11)} ${String(escena.tri).padStart(11)} ${String(quieto.ms).padStart(10)} ${String(quieto.fps).padStart(6)} ${String(movido.ms).padStart(17)} ${String(movido.fps).padStart(6)}`);
  await ctx.close();
}
await b.close();
