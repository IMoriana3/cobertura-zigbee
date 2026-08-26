/* ¿SE PUEDE METER LA CÁMARA BAJO TIERRA? Empuja la cámara por debajo del terreno de tres formas
   —orbitando, con la tecla Q de la cámara de vuelo, y a lo bruto poniéndole una Y negativa— y
   comprueba que en el fotograma siguiente ha vuelto por encima del suelo.

       python3 -m http.server 8124 --directory .   &
       node tools/test_suelo.mjs elburgo dicayagua                                                */
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PUERTO = process.env.PUERTO || 8124;
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
let malo = 0;
for (const p of process.argv.slice(2)) {
  const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) { } });
  const pg = await ctx.newPage(); const t0 = Date.now();
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${p}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  while (!(await pg.evaluate(() => typeof bosGroup !== 'undefined' && bosGroup && bosGroup.children.length > 0))) {
    if (Date.now() - t0 > 300000) break; await pg.waitForTimeout(400);
  }
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(async () => {
    const espera = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const suelo = () => terrainMeshY(camera.position.x, -camera.position.z);
    const casos = [];
    /* 1. a lo bruto: 50 m bajo el terreno */
    camera.position.y = suelo() - 50; await espera();
    casos.push({ caso: 'y = suelo − 50 m', sobre: +(camera.position.y - suelo()).toFixed(2) });
    /* 2. orbitando por debajo: se fuerza el ángulo polar más allá del horizonte */
    if (typeof controls !== 'undefined' && controls) {
      const t = controls.target, R = camera.position.distanceTo(t);
      camera.position.set(t.x, t.y - R * 0.8, t.z + R * 0.6); await espera();
      casos.push({ caso: 'órbita por debajo del objetivo', sobre: +(camera.position.y - suelo()).toFixed(2) });
    }
    /* 3. la tecla Q de la cámara de vuelo. Pocos fotogramas a propósito: aquí se rasteriza por
          software y cada uno puede tardar decenas de segundos; flyStep limita dt a 0,05 s, así que
          con tres ya se ve si baja o si el suelo lo frena. Se parte de ras de suelo. */
    if (typeof KEYS !== 'undefined') {
      camera.position.y = suelo() + 2;
      KEYS['KeyQ'] = true; for (let i = 0; i < 3; i++) await espera(); KEYS['KeyQ'] = false; await espera();
      casos.push({ caso: 'tecla Q desde ras de suelo', sobre: +(camera.position.y - suelo()).toFixed(2) });
    }
    return { casos, objetivoSobreSuelo: +(controls.target.y - terrainMeshY(controls.target.x, -controls.target.z)).toFixed(2) };
  });
  console.log('· ' + p);
  r.casos.forEach(c => { const ok = c.sobre >= 1.5; if (!ok) malo++;
    console.log(`   ${ok ? 'ok   ' : 'FALLA'} ${c.caso.padEnd(32)} la cámara queda ${c.sobre} m sobre el suelo`); });
  const okT = r.objetivoSobreSuelo >= -0.01; if (!okT) malo++;
  console.log(`   ${okT ? 'ok   ' : 'FALLA'} el objetivo tampoco se entierra      ${r.objetivoSobreSuelo} m`);
  await ctx.close();
}
await b.close();
console.log(malo ? `\n${malo} caso(s) con fallo` : '\nno se puede ir bajo tierra');
process.exit(malo ? 1 : 0);
