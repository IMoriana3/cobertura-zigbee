/* Banco de relieve SINTÉTICO para cualquier planta.
   El modo sin conexión del visor deja el terreno PLANO, así que los fallos que solo aparecen con
   pendiente (el CT flotando de Fayón) no se reproducían. Aquí se interceptan las teselas del DEM
   y se sirve un terrarium generado (tools/dem_sintetico.mjs): ondulado CONTINUO entre teselas, así que
   el relieve es real, medible y sin costuras falsas.
   Uso:  node tools/test_relieve_plantas.mjs <planta> [<planta> ...]                                */
import pw from '/home/user/cobertura-zigbee/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { teselaTerrarium, relieve, zxy } from './dem_sintetico.mjs';

const COTA = relieve(25, 800, 300);          // ondulado continuo, pendiente máxima 20%
const CACHE = new Map();
const PLANTAS = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.route('**/elevation-tiles-prod/**', r => {
  const t = zxy(r.request().url());
  if (!t) return r.abort();
  const k = t.z + '/' + t.x + '/' + t.y;
  if (!CACHE.has(k)) CACHE.set(k, teselaTerrarium(t.z, t.x, t.y, COTA));
  r.fulfill({ status: 200, contentType: 'image/png', body: CACHE.get(k) });
});
await ctx.route('**/server.arcgisonline.com/**', r => r.abort());
await ctx.route('**/pnoa**', r => r.abort());

for (const planta of PLANTAS) {
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8123/terreno.html?planta=' + planta, { waitUntil: 'load', timeout: 150000 });
  try { await p.waitForFunction(() => window.TRK && window.TRK.length > 0, { timeout: 120000 }); } catch (e) {}
  await p.waitForTimeout(9000);
  const r = await p.evaluate(() => {
    const out = { planta: PLANT, seguidores: TRK.length, baseElev: +baseElev.toFixed(1), vex,
      relieve_trk: [+Math.min(...TRK.map(t => t.rel)).toFixed(2), +Math.max(...TRK.map(t => t.rel)).toFixed(2)] };
    // ¿el DEM ha llegado de verdad? (en plano todos los rel salen 0)
    out.dem_ok = out.relieve_trk[1] - out.relieve_trk[0] > 1;
    // POSTES: cuánto sobresale o se hunde cada pilote respecto a la malla que se ve
    const m = new THREE.Matrix4(), hue = [];
    if (typeof imPost !== 'undefined' && imPost && TC && TC.np) {
      for (let i = 0; i < imPost.count; i++) {
        imPost.getMatrixAt(i, m);
        if (Math.abs(m.elements[0]) < 0.01) continue;
        const x = m.elements[12], z = m.elements[14];
        const yBot = m.elements[13] - m.elements[5] * TC.postH / 2;
        hue.push(+(yBot - terrainMeshY(x, -z)).toFixed(2));
      }
    }
    hue.sort((a, b) => a - b);
    out.postes = { n: hue.length, min: hue[0], max: hue[hue.length - 1], mediana: hue[hue.length >> 1] };
    // NCUs / HSUs: altura del mástil sobre la malla
    out.ncus = (typeof gwMasts !== 'undefined' && gwMasts ? gwMasts : []).map(g =>
      +(g.position.y - terrainMeshY(g.position.x, -g.position.z)).toFixed(2));
    // CT: hueco bajo cada esquina del polígono (negativo = enterrado, positivo = flota)
    out.cts = [];
    ((LAYOUT.cts) || []).forEach(ct0 => {
      const ct = ct0.slice();
      if (ct.length > 2 && Math.hypot(ct[0][0] - ct[ct.length - 1][0], ct[0][1] - ct[ct.length - 1][1]) < 1e-6) ct.pop();
      if (ct.length < 3) { out.cts.push('punto sin contorno: no se levanta'); return; }
      const cx = ct.reduce((s, q) => s + q[0], 0) / ct.length, cn = ct.reduce((s, q) => s + q[1], 0) / ct.length;
      let mu = null;
      (bosGroup ? bosGroup.children : []).forEach(o => {
        if (!o.geometry || o.geometry.type !== 'ExtrudeGeometry') return;
        const bb = new THREE.Box3().setFromObject(o);
        if (Math.hypot((bb.min.x + bb.max.x) / 2 - cx, -(bb.min.z + bb.max.z) / 2 - cn) < 6 && bb.max.y - bb.min.y > 1)
          mu = +bb.min.y.toFixed(2);
      });
      out.cts.push(mu == null ? 'no se ha encontrado la caseta' :
        { hueco_esquinas: ct.map(q => +(mu - terrainMeshY(q[0], q[1])).toFixed(2)) });
    });
    // ¿hay algo dibujado? bounding box de la escena y nº de mallas visibles
    let vis = 0; scene.traverse(o => { if (o.isMesh && o.visible) vis++; });
    out.mallas_visibles = vis;
    const bb = new THREE.Box3().setFromObject(scene);
    out.escena = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(v => +v.toFixed(0));
    out.camara = [+camera.position.x.toFixed(0), +camera.position.y.toFixed(0), +camera.position.z.toFixed(0)];
    return out;
  });
  r.errores = errs.length ? errs.slice(0, 3) : 'ninguno';
  console.log(JSON.stringify(r));
  await p.close();
}
await b.close();
