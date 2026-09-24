/* SELECCIONAR UN SEGUIDOR: EL CLIC COGE EL QUE SE PULSA.
 *
 * «En Fayón selecciono el rojo y me coge aquel de arriba, sin sentido.» El clic
 * no pregunta a los paneles dibujados sino a unas cajas invisibles, una por
 * seguidor (buildPickBoxes), que iban RECTAS y a la cota del centro: no se
 * inclinaban con el terreno ni giraban con el rumbo de las filas. El render sí
 * (trackerBase). Con los tubos al 20 % del DEM de Fayón, las puntas quedan
 * ±4,6 m por encima y por debajo de su caja, y el rayo acaba en la del vecino;
 * en Bagnarelli, girado 23,7°, las cajas ni siquiera siguen a las filas.
 *
 * Para cada seguidor se toman puntos de sus filas DIBUJADAS (t.fb, la base de
 * cada fila sobre su tubo): el centro y cerca de las dos puntas. Se pone la
 * cámara mirando a cada punto desde ocho direcciones oblicuas, a 25 m, y el
 * clic en el centro de la pantalla tiene que devolver ESE seguidor, salvo que
 * el panel de otro seguidor se interponga de verdad (esos casos no se puntúan).
 * Fayón con un relieve empinado sintético (sin red el DEM sale plano).
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_seleccion.mjs
 */
import { chromium } from 'playwright-core';
import { EXE, navegador } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra != null ? ' -> ' + extra : '')); } };
const b = await navegador(chromium, { executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const errores = [];

async function mide(planta, empinado) {
  const ctx = await b.newContext({ viewport: { width: 640, height: 480 } });
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errores.push(planta + ': ' + e)); const t0 = Date.now();
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${planta}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  while (!(await pg.evaluate(() => typeof pickAt === 'function' && TRK.length > 0 && PICK.length === TRK.length))) {
    if (Date.now() - t0 > 300000) throw new Error(planta + ': la página no cargó'); await pg.waitForTimeout(500); }
  const r = await pg.evaluate((empinado) => {
    if (empinado) {                  // relieve sintético empinado, como el DEM de Fayón (≈20 % a lo largo, ≈15 % de través)
      const f = (x, z) => 0.15 * x - 0.20 * z + 1.5 * Math.sin(x / 23);
      for (const t of TRK) { const h = (t.span || TC.span) / 2, e = t.dE || 1;
        t.rel = f(t.gx, t.gz); t.relN = f(t.gx, t.gz - h); t.relS = f(t.gx, t.gz + h); t.relE = f(t.gx + e, t.gz); t.relW = f(t.gx - e, t.gz); }
      layoutTrackers(); scene.updateMatrixWorld(true); }   // sin un render de por medio las cajas no rehacen su matriz de mundo
    const V = THREE.Vector3, bien = [], mal = []; let tapados = 0;
    /* ¿Tapa OTRO seguidor el punto de verdad? Cada fila de cada seguidor como una losa del tamaño de su
       panel en su propio marco (t.fb): media cuerda a cada lado del tubo, ±1,1 m de alto (cuerda·sen 55°
       + holgura) y su largo. Si el rayo de la cámara al punto entra antes en la losa de otro, coger a ese
       otro es lo correcto: el caso no se puntúa. */
    const c = TC.modH, inv = new THREE.Matrix4(), ray = new THREE.Ray(), box = new THREE.Box3(), hit = new V();
    const losas = TRK.map(t => { const s = (t.medio ? (t.mr || 0.5) : 1) * (t.span || TC.span);
      return [0, 1].map(f => ({ inv: t.fb[f].clone().invert(), box: new THREE.Box3(new V(-c / 2, -1.1, -s / 2), new V(c / 2, 1.1, s / 2)) })); });
    function tapado(i, O, P) { const d = P.distanceTo(O), D = P.clone().sub(O).normalize();
      for (let j = 0; j < TRK.length; j++) { if (j === i) continue;
        for (const L of losas[j]) { ray.origin.copy(O).applyMatrix4(L.inv); ray.direction.copy(D).transformDirection(L.inv);
          const q = ray.intersectBox(L.box, hit); if (!q) continue;
          const w = hit.clone().applyMatrix4(L.inv.clone().invert()); if (w.distanceTo(O) < d - 0.05) return true; } }
      return false; }
    const dirs = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; dirs.push(new V(Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8).normalize()); }
    const cam0 = { p: camera.position.clone(), q: camera.quaternion.clone() };
    for (let i = 0; i < TRK.length; i++) { const t = TRK[i], s = (t.medio ? (t.mr || 0.5) : 1) * (t.span || TC.span);
      for (let f = 0; f < 2; f++) for (const z of [-0.42 * s, 0, 0.42 * s]) {
        const P = new V(0, 0.15, z).applyMatrix4(t.fb[f]);                         // sobre el tubo de esa fila, a esa altura del eje
        for (const d of dirs) { camera.position.copy(P).addScaledVector(d, 25); camera.lookAt(P); camera.updateMatrixWorld(true);
          if (tapado(i, camera.position, P)) { tapados++; continue; }
          const j = pickAt({ clientX: innerWidth / 2, clientY: innerHeight / 2 });
          (j === i ? bien : mal).push(j === i ? 1 : { tk: t.id, cogio: j >= 0 ? TRK[j].id : null }); } } }
    camera.position.copy(cam0.p); camera.quaternion.copy(cam0.q); camera.updateMatrixWorld(true);
    return { n: bien.length + mal.length, bien: bien.length, tapados, ej: mal.slice(0, 4) };
  }, empinado);
  await ctx.close();
  return r;
}
const F = await mide('fayon', true);
console.log(`Fayón (relieve empinado): ${F.bien}/${F.n} clics cogen el seguidor pulsado (${F.tapados} descartados: otro lo tapa de verdad)` + (F.ej.length ? ' · p. ej. ' + JSON.stringify(F.ej) : ''));
check('Fayón empinado: el clic coge el seguidor pulsado (≥ 98 %: una caja no abraza al milímetro un panel que gira)', F.bien >= 0.98 * F.n, `${(100 * F.bien / F.n).toFixed(1)} %`);
const B = await mide('bagnarelli', false);
console.log(`Bagnarelli (filas giradas): ${B.bien}/${B.n}` + (B.ej.length ? ' · p. ej. ' + JSON.stringify(B.ej) : ''));
check('Bagnarelli girado: el clic coge el seguidor pulsado (≥ 99 %)', B.bien >= 0.99 * B.n, `${(100 * B.bien / B.n).toFixed(1)} %`);
const E = await mide('elburgo', false);
console.log(`El Burgo (llano, N-S): ${E.bien}/${E.n}`);
check('El Burgo: sigue cogiendo el seguidor pulsado (≥ 99 %)', E.bien >= 0.99 * E.n, `${(100 * E.bien / E.n).toFixed(1)} %`);
check('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`\n${ok} OK · ${ko} FAIL`);
await b.close();
process.exit(ko ? 1 : 0);
