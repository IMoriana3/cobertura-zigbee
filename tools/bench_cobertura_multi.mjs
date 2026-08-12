/* Banco: comprueba que la Cobertura Zigbee funciona en TODAS las plantas.
 * Mide de verdad (no "parece que va"): que el layout cargó, que la capa del mapa de planta pinta
 * píxeles, que el aviso de "sin datos" sale solo donde toca, y que El Burgo NO ha cambiado.
 * uso: node tools/bench_cobertura_multi.mjs
 */
import { chromium } from 'playwright-core';

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const BASE = 'http://127.0.0.1:8123';
const PLANTAS = ['elburgo', 'ayora', 'sanjose', 'fayon', 'bagnarelli', 'paramo'];

const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('cobertura_offline', '1'); } catch (e) {} });   // sin teselas: determinista y sin red

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FALLO') + ' ' + m); if (!c) fallos++; };
const TDIM_COB = {};   // cotas que usa la Cobertura, para exigir luego que el Layout 2D dibuje IGUAL

for (const p of PLANTAS) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/index.html?planta=${p}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas.plant-canvas');
    let pintados = 0;
    if (c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) pintados++; }
    const t = id => { const e = document.getElementById(id); return e ? e.textContent.trim() : null; };
    const b = map ? map.getBounds() : null;
    return {
      plant: PLANT, titulo: PMETA.title, trk: LAY && LAY.trackers ? LAY.trackers.length : 0,
      ncus: LAY && LAY.ncus ? LAY.ncus.length : 0, tdim: TDIM,
      canvas: !!c, pintados, nodos: PRED ? PRED.nodes.length : -1, enlaces: PRED ? PRED.edges.length : -1,
      aviso: document.getElementById('nodata').classList.contains('show'),
      avisoTxt: (document.getElementById('nodata').textContent || '').slice(0, 90),
      sTot: t('sTot'), m1: t('m1'), m2: t('m2'),
      modos: document.querySelectorAll('.mode').length,
      centro: b ? [(b.getNorth() + b.getSouth()) / 2, (b.getEast() + b.getWest()) / 2] : null,
      clat: LAY ? LAY.clat : null, clon: LAY ? LAY.clon : null,
      docTitle: document.title, opciones: document.getElementById('plantSel').options.length
    };
  });

  TDIM_COB[p] = r.tdim;
  console.log(`\n=== ${p} · ${r.titulo} ===`);
  console.log(`   seguidores ${r.trk} · NCUs ${r.ncus} · TDIM halfL ${r.tdim.halfL} filaZ ${r.tdim.filaZ} cuerda ${r.tdim.cuerda}`);
  console.log(`   malla: ${r.nodos} nodos / ${r.enlaces} enlaces · contadores TCU=${r.sTot} m1=${r.m1} m2=${r.m2}`);
  ok(errs.length === 0, `sin errores de JS ${errs.length ? '→ ' + errs[0].slice(0, 160) : ''}`);
  ok(r.plant === p, `?planta= resuelve a ${r.plant}`);
  ok(r.trk > 0, `layout cargado (${r.trk} seguidores)`);
  ok(r.canvas && r.pintados > 3000, `la capa del mapa de planta pinta (${r.pintados} px)`);
  ok(r.modos === 8, `los 8 modos de coloreado siguen ahí (${r.modos})`);
  ok(r.opciones === 6, `el selector lista las 6 plantas (${r.opciones})`);
  ok(r.docTitle.includes(r.titulo), `título de página con la planta: "${r.docTitle}"`);
  // el mapa tiene que estar SOBRE la planta, no sobre El Burgo
  const dLat = Math.abs(r.centro[0] - r.clat), dLon = Math.abs(r.centro[1] - r.clon);
  ok(dLat < 0.02 && dLon < 0.02, `encuadre sobre la planta (Δ ${dLat.toFixed(4)}°, ${dLon.toFixed(4)}°)`);

  if (p === 'elburgo') {
    ok(r.nodos > 0 && r.enlaces > 0, `El Burgo conserva su malla medida (${r.nodos} nodos, ${r.enlaces} enlaces)`);
    ok(!r.aviso, 'El Burgo NO muestra aviso de "sin datos"');
    ok(r.sTot === String(r.nodos), `contador TCU = nodos de la malla (${r.sTot})`);
    /* Georreferencia cruzada: la NCU1 dibujada por la capa (sale del DWG, vía clat/clon del layout)
       contra la posición de la NCU1 en la plantilla SCADA (UTM30N, fuente independiente). Si el
       mapa de planta estuviese mal anclado, esto se dispararía. */
    const g = await page.evaluate(() => {
      const a = layLL(LAY.ncus[0].x, LAY.ncus[0].n), b = PMETA.ncu;
      return Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(b[0] * Math.PI / 180));
    });
    ok(g < 3, `NCU1 del layout vs NCU1 del SCADA: ${g.toFixed(2)} m de diferencia`);
  } else {
    ok(r.nodos === 0, 'sin malla medida (lo esperado hoy)');
    ok(r.aviso, `avisa de la carencia: "${r.avisoTxt}…"`);
    ok(r.sTot === '—', `contadores a "—" y no a 0 (TCU=${r.sTot})`);
  }
  await page.screenshot({ path: `/tmp/cob_${p}.png` });
  await page.close();
}

/* ---------- Layout 2D (plano.html) ---------- */
console.log('\n\n########## LAYOUT 2D ##########');
const ESPERADO = { elburgo: [32.37, 3], ayora: [32.37, 3], sanjose: [36.95, 3], fayon: [27.58, 3.006], bagnarelli: [27.89, 0], paramo: [27.78, 0] };
for (const p of PLANTAS) {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/plano.html?planta=${p}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const c = document.getElementById('cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let az = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] > 90 && d[i + 2] > 150) az++;   // píxeles del azul de seguidor
    return { plant: PLANT, tdim: TDIM, trk: L && L.trackers ? L.trackers.length : 0, azul: az, titulo: document.title };
  });
  console.log(`\n=== ${p} ===  ${r.trk} seguidores · halfL ${r.tdim.halfL} filaZ ${r.tdim.filaZ} · ${r.azul} px de seguidor`);
  ok(errs.length === 0, `sin errores de JS ${errs.length ? '→ ' + errs[0].slice(0, 140) : ''}`);
  ok(r.plant === p, `?planta= resuelve a ${r.plant} (antes bagnarelli/paramo caían a El Burgo)`);
  ok(Math.abs(r.tdim.halfL - ESPERADO[p][0]) < 0.02 && Math.abs(r.tdim.filaZ - ESPERADO[p][1]) < 0.01,
     `cotas del seguidor correctas (halfL ${r.tdim.halfL}, filaZ ${r.tdim.filaZ})`);
  ok(r.azul > 2000, `dibuja los seguidores (${r.azul} px)`);
  ok(r.titulo.includes('Layout 2D'), `se llama Layout 2D ("${r.titulo}")`);
  /* Lo que de verdad importa: las dos vistas dibujan el MISMO seguidor. Si divergen, el mapa de la
     planta de la Cobertura mentiría respecto al Layout 2D de esa misma planta. */
  const c = TDIM_COB[p];
  ok(Math.abs(c.halfL - r.tdim.halfL) < 1e-9 && Math.abs(c.filaZ - r.tdim.filaZ) < 1e-9 && Math.abs(c.cuerda - r.tdim.cuerda) < 1e-9,
     `Cobertura y Layout 2D con cotas idénticas (halfL ${r.tdim.halfL.toFixed(3)} · filaZ ${r.tdim.filaZ} · cuerda ${r.tdim.cuerda})`);

  if (p === 'bagnarelli') {
    /* GIRO REAL: se acerca a un seguidor suelto y se mide el ángulo del eje principal de la mancha
       pintada (momentos de segundo orden). Debe salir el -23,7° del DWG, no 0. */
    const ang = await page.evaluate(() => {
      const todos = L.trackers, t = todos[0];
      L.trackers = [t];                                   // UNO solo: con los 17 en pantalla el eje principal
      view.x = t.x; view.n = t.n; view.scale = 4; draw(); // que sale es el de la fila de seguidores, no el del seguidor
      const c = document.getElementById('cv'), W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0, sx = 0, sy = 0; const px = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
        if (d[i] < 90 && d[i + 1] > 90 && d[i + 2] > 150) { px.push([x, y]); sx += x; sy += y; n++; } }
      L.trackers = todos;
      if (n < 50) return null;
      const mx = sx / n, my = sy / n; let a = 0, b = 0, cc = 0;
      for (const [x, y] of px) { const u = x - mx, v = y - my; a += u * u; b += u * v; cc += v * v; }
      return { deg: 0.5 * Math.atan2(2 * b / n, (a - cc) / n) * 180 / Math.PI, n, rot: t.rot };
    });
    /* La banda va a lo largo del tubo (norte-sur = 90° en pantalla). `rot` es el ángulo del INSERT
       del DWG, antihorario y con el norte arriba; en pantalla (y hacia abajo) eso es un giro de
       signo contrario, así que el eje esperado queda en 90 − rot. */
    const esp = 90 - ang.rot, dif = Math.abs(((ang.deg - esp + 90) % 180 + 180) % 180 - 90);
    console.log(`   eje principal medido ${ang.deg.toFixed(2)}° · esperado ${esp.toFixed(2)}° (rot ${ang.rot}° del DWG) · ${ang.n} px`);
    ok(dif < 2.5, `los seguidores salen girados como en el DWG (error ${dif.toFixed(2)}°)`);
  }
  await page.screenshot({ path: `/tmp/pl_${p}.png` });
  await page.close();
}

console.log(`\n${fallos ? '✗ ' + fallos + ' FALLOS' : '✓ todo correcto'}`);
await browser.close();
process.exit(fallos ? 1 : 0);
