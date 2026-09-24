/* CUANTO CUESTA UN FRAME DE `terreno.html`, Y DONDE SE VA.
 * ---------------------------------------------------------------------------
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/perfil_frames.mjs elburgo 4
 *
 * POR QUE EXISTE. `test_suelo.mjs` pasaba de 600 s con El Burgo y de 84 s con
 * Tunez, y eso se habia declarado sin explicar, con El Burgo fuera de la CI y
 * el numero escrito al lado. La explicacion que yo daba -- recompilacion de
 * shaders bajo SwiftShader -- era una HIPOTESIS SIN MEDIR, y result FALSA:
 *
 *   · los programas GL no se mueven: 29, con las MISMAS claves de cache frame
 *     a frame. No se recompila nada.
 *   · no es el mapa de sombras: congelarlo (`SIN_SOMBRA=si`) deja el frame casi
 *     igual, 6,67 -> 6,47 s en Tunez.
 *   · no es JS: el hilo principal esta ~84 % OCIOSO. Lo que hay es espera al
 *     proceso grafico.
 *   · y no es de El Burgo: Tunez y Fayon, que son plantas chicas, ya cuestan
 *     6,5 s por frame.
 *
 * LO QUE SI SE MIDIO, con 4 frames por planta:
 *
 *       planta      instancias   s/frame
 *       Tunez          236.829      6,67
 *       Fayon          246.525      6,52
 *       El Burgo       440.097     51,83
 *       Paramo         545.867     66,79
 *
 * Hay un ESCALON entre 250.000 y 440.000 instancias: 1,8 veces las instancias
 * cuestan 7,9 veces el tiempo. Por encima vuelve a ser casi lineal (El Burgo a
 * Paramo: 1,24 veces las instancias, 1,29 el tiempo). O sea que el coste no
 * crece con el tamaño: SALTA, y despues crece.
 *
 * CUANTO SE FIA UNO DE ESTOS NUMEROS. Poco, uno a uno: la misma Fayon dio 6,52
 * y 13,29 s por frame en dos pasadas de la misma maquina, segun lo cargada que
 * estuviera. Lo que SI aguanta es el escalon, porque es de 8 a 10 veces y la
 * dispersion es de 2: entre plantas por debajo y por encima no hay solape. Asi
 * que uselo para ORDENAR plantas, no para citar un numero.
 *
 * LO QUE NO SE SABE. Por que hay escalon. Cae del lado del proceso grafico, que
 * este perfilador no ve -- solo ve el hilo de JS esperandolo -- asi que la causa
 * (memoria de SwiftShader, un buffer que deja de caber) se queda SIN MEDIR y
 * escrita como tal, no adivinada.
 *
 * PARA QUE SIRVE ESTO HOY: decidir que plantas caben en un banco de CI. Las dos
 * que lleva `test_suelo` -- Tunez y Fayon -- son justo las que quedan por debajo
 * del escalon, cosa que se habia acertado por medida y sin saber por que.
 * Y ojo: PARAMO ES PEOR QUE EL BURGO, y Paramo si esta en la matriz de otros
 * bancos.
 * ---------------------------------------------------------------------------*/
import { chromium } from 'playwright-core';
import { EXE, navegador } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
const PLANTA = process.argv[2] || 'elburgo';
const N = +(process.argv[3] || 4);

const b = await navegador(chromium, { executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) { } });
const pg = await ctx.newPage();

const t0 = Date.now();
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${PLANTA}`,
              { waitUntil: 'domcontentloaded', timeout: 120000 });
while (!(await pg.evaluate(() => typeof bosGroup !== 'undefined' && bosGroup && bosGroup.children.length > 0))) {
  if (Date.now() - t0 > 300000) { console.log('BOS no llego en 300 s'); break; }
  await pg.waitForTimeout(400);
}
console.log(`${PLANTA}: BOS listo a los ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const censo = await pg.evaluate(() => {
  let inst = 0, mallas = 0; const geoms = new Set(), mats = new Set();
  scene.traverse(o => {
    if (o.isInstancedMesh) { inst += o.count; mallas++; } else if (o.isMesh) mallas++;
    if (o.geometry) geoms.add(o.geometry.uuid);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m.uuid));
  });
  return { inst, mallas, geoms: geoms.size, mats: mats.size,
           programas: renderer.info.programs ? renderer.info.programs.length : -1 };
});
console.log(`  censo: ${censo.inst} instancias · ${censo.mallas} mallas · ${censo.geoms} geometrias · ` +
            `${censo.mats} materiales · ${censo.programas} programas GL`);

/* Los dos controles que descartaron las dos hipotesis faciles. */
if (process.env.SIN_SOMBRA === 'si') {
  await pg.evaluate(() => { renderer.shadowMap.autoUpdate = false; });
  console.log('  (shadowMap.autoUpdate APAGADO)');
}
if (process.env.SIN_CHECK === 'si') {
  await pg.evaluate(() => { renderer.debug.checkShaderErrors = false; });
  console.log('  (checkShaderErrors APAGADO)');
}

/* Que los programas NO se muevan es la prueba de que no hay recompilacion: se
   compara la lista de claves de cache entre frames, no solo su numero. */
const claves = await pg.evaluate(async () => {
  const unFrame = () => new Promise(res => requestAnimationFrame(res));
  const foto = () => renderer.info.programs.map(p => p.cacheKey).sort().join('\u0001');
  const f = []; for (let k = 0; k < 3; k++) { await unFrame(); f.push(foto()); }
  return { n: renderer.info.programs.length, estables: f[0] === f[1] && f[1] === f[2] };
});
console.log(`  programas: ${claves.n}, claves de cache ${claves.estables ? 'ESTABLES entre frames (no se recompila)' : 'CAMBIAN entre frames'}`);

/* El reparto, con el perfilador de Chrome y no envolviendo funciones: las del
   lazo NO estan en `window` -- el script va dentro de un ambito -- asi que
   envolverlas desde fuera no las alcanza. El perfilador las ve por pila. */
const cdp = await pg.context().newCDPSession(pg);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
await cdp.send('Profiler.start');
await pg.evaluate(async (n) => {
  const unFrame = () => new Promise(res => requestAnimationFrame(res));
  for (let k = 0; k < n; k++) await unFrame();
}, N);
const { profile } = await cdp.send('Profiler.stop');

const dur = (profile.endTime - profile.startTime) / 1e6;
const propio = new Map();
for (const nd of profile.nodes) {
  const cf = nd.callFrame;
  const clave = (cf.functionName || '(anonima)') +
                (cf.url ? '  ' + cf.url.split('/').pop() + ':' + (cf.lineNumber + 1) : '');
  propio.set(clave, (propio.get(clave) || 0) + (nd.hitCount || 0));
}
const golpes = [...propio.values()].reduce((a, c) => a + c, 0) || 1;
console.log(`  ${N} frames en ${dur.toFixed(1)} s (${(dur / N).toFixed(2)} s por frame)`);
console.log('  tiempo PROPIO por muestreo a 1 ms (el hilo de JS, no el proceso grafico):');
for (const [nom, h] of [...propio].sort((a, c) => c[1] - a[1]).slice(0, 10)) {
  const pct = 100 * h / golpes;
  if (pct < 0.8) break;
  console.log(`    ${pct.toFixed(1).padStart(5)} %  ${(dur * h / golpes / N * 1000).toFixed(0).padStart(6)} ms/frame  ${nom}`);
}
console.log('  («(idle)» alto = el hilo NO trabaja: espera al proceso grafico, que esto no ve)');
await b.close();
