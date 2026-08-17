/* BANCO DEL 3D, PLANTA A PLANTA.
   Comprueba lo que se rompió con Dicayagua y no tenía red debajo:
     · que la planta LLEGA A CONSTRUIRSE (no se queda colgada montando geometría),
     · que los MATERIALES compartidos están puestos —panelTex/steelM/glassM los usa el BOS entero,
       no solo el seguidor; sin ellos la planta se pinta en blanco liso y nadie avisa,
     · que hay geometría instanciada en la escena,
     · que una planta de estructura FIJA (Dicayagua, Túnez) tiene piezas en su grupo de mesas,
     · y que la consola queda limpia (los 404 de ficheros opcionales no cuentan).

   Un navegador POR PLANTA a propósito: reusando uno solo, el proceso de render se quedaba ocupado
   con la planta anterior y la siguiente no arrancaba nunca.

   Necesita un servidor local sirviendo el repo:
       python3 -m http.server 8124 &
       node tools/test_terreno_plantas.mjs elburgo ayora sanjose fayon bagnarelli paramo tunez dicayagua

   Va en modo SIN CONEXIÓN (localStorage cobertura_offline=1): ni satélite ni DEM, cero llamadas
   externas. El levantamiento propio de la planta SÍ se carga, que es un fichero del repo.         */
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PUERTO = process.env.PUERTO || 8124;
let malo = 0;
for (const p of process.argv.slice(2)) {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await b.newPage({ viewport: { width: 640, height: 420 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 160)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('ERROR: ' + m.text().slice(0, 160)); });
  await pg.addInitScript(() => { localStorage.cobertura_offline = '1'; });
  let r = null;
  try {
    await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=` + p, { waitUntil: 'domcontentloaded', timeout: 120000 });
    /* Espera a que el BOS esté construido, no a un reloj: con swiftshader una planta grande tarda
       minutos y un waitForTimeout fijo daba falsos negativos. */
    await pg.waitForFunction(() => typeof LAYOUT !== 'undefined' && LAYOUT && typeof bosGroup !== 'undefined' && bosGroup && bosGroup.children.length > 0, { timeout: 300000 });
    r = await pg.evaluate(() => {
      let inst = 0, ins2 = 0, fij = 0; scene.traverse(o => { if (o.isInstancedMesh) { inst++; ins2 += o.count; } });
      if (fijGroup) fijGroup.traverse(o => { if (o.isInstancedMesh) fij += o.count; else if (o.isMesh) fij++; });
      return { trk: TRK.length, fijas: (LAYOUT.fijas || []).length, piezasFijas: fij, inst, ins2,
        mat: !!panelTex && !!steelM && !!glassM, enBos: bosGroup.children.length };
    });
  } catch (e) { errs.push('TIMEOUT/' + e.message.split('\n')[0].slice(0, 90)); }
  const ok = r && (r.trk > 0 || r.fijas > 0) && r.inst > 0 && r.mat && !errs.length && (r.fijas ? r.piezasFijas > 0 : true);
  if (!ok) malo++;
  console.log((ok ? '✓ ' : '✗ ') + p.padEnd(12) + JSON.stringify(r) + (errs.length ? '\n    ' + [...new Set(errs)].slice(0, 3).join('\n    ') : ''));
  await b.close();
}
console.log(malo ? `\n${malo} planta(s) con fallo` : '\ntodas las plantas OK');
process.exit(malo ? 1 : 0);
