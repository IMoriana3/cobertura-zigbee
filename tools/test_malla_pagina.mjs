/* EL BOTON, EN LA PAGINA DE VERDAD.
 *
 * `test_malla_real.mjs` prueba el calculo sin navegador. Esto prueba lo otro: que
 * los tres cargadores dejen el estado como el exportador lo espera, que el boton
 * se encienda solo cuando estan los tres, y —lo importante— que lo que sale se
 * pueda VOLVER A LEER por el mismo camino con el que la pagina dibuja la malla al
 * abrirse. Un GeoJSON que la propia pagina no sabe leer no sirve de nada.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_malla_pagina.mjs
 */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const b = await chromium.launch({ executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage();
const errores = [];
pg.on('pageerror', e => errores.push(String(e).slice(0, 140)));
await pg.goto(`http://localhost:${PUERTO}/index.html?planta=elburgo`,
              { waitUntil: 'domcontentloaded', timeout: 120000 });
const t0 = Date.now();
while (!(await pg.evaluate(() => typeof mallaReal === 'function' && document.getElementById('mallaBtn')))) {
  if (Date.now() - t0 > 120000) throw new Error('la página no expuso mallaReal / el botón');
  await pg.waitForTimeout(300);
}

const CSV = {
  rutas: 'timestamp,path_ids\n2026-09-01 10:00:00,COORD>A\n2026-09-01 10:00:00,COORD>A>B\n' +
         '2026-09-01 10:10:00,COORD>A\n2026-09-01 10:10:00,COORD>A>B\n',
  log:   'timestamp,gateway,node_id,role,ext_addr,online,rssi_dbm,ack_failures\n' +
         '2026-09-01 10:00:00,GW-01,A,TCU,0013A200,1,-60,10\n' +
         '2026-09-01 10:10:00,GW-01,A,TCU,0013A200,1,-70,25\n' +
         '2026-09-01 10:00:00,GW-01,B,TCU,0013A201,1,-80,3\n',
  coords:'node_id,lat,lon\nCOORD,41.500000,-0.800000\nA,41.501000,-0.800000\nB,41.501000,-0.799000\n',
};

/* EL BOTON SE ENCIENDE SOLO CON LOS TRES, y mientras tanto DICE cual falta: un
   boton gris sin motivo se lee como una pagina rota. */
const paso = await pg.evaluate((C) => {
  const b = document.getElementById('mallaBtn'), k = document.getElementById('mallaK');
  const foto = () => ({ off: b.disabled, pista: k.textContent });
  const s = [];
  s.push({ cuando: 'nada cargado', ...foto() });
  loadLog(C.log);       sincronizaMalla(); s.push({ cuando: 'solo registro', ...foto() });
  loadCoords(C.coords); sincronizaMalla(); s.push({ cuando: '+ coordenadas', ...foto() });
  loadRoutes(C.rutas);  sincronizaMalla(); s.push({ cuando: '+ rutas', ...foto() });
  return s;
}, CSV);
check('con nada cargado el botón está apagado y dice que faltan los tres',
      paso[0].off && /registro/.test(paso[0].pista) && /coordenadas/.test(paso[0].pista) &&
      /rutas/.test(paso[0].pista), JSON.stringify(paso[0]));
check('con dos de tres sigue apagado, y dice cuál falta (no un gris mudo)',
      paso[2].off && /rutas/.test(paso[2].pista) && !/coordenadas/.test(paso[2].pista),
      JSON.stringify(paso[2]));
check('con los tres se enciende y anuncia el nombre del fichero',
      !paso[3].off && /elburgo_real\.geojson/.test(paso[3].pista), JSON.stringify(paso[3]));

/* LA IDA Y LA VUELTA. Se exporta y se vuelve a leer con el MISMO codigo con el que
   la pagina monta PRED al abrirse (index.html, dentro de cargaPred). Si esto casa,
   el fichero que se suba al repo se va a dibujar. */
const ida = await pg.evaluate(() => {
  const g = mallaReal(S.rows, S.rutas, S.coords, { planta: 'elburgo' });
  const PR = { nodes: [], edges: [] };
  for (const f of g.features) { const gm = f.geometry, p = f.properties;
    if (gm.type === 'Point') { const [lo, la] = gm.coordinates; PR.nodes.push({ lat: la, lon: lo, p }); }
    else if (gm.type === 'LineString') PR.edges.push({ ll: gm.coordinates.map(c => [c[1], c[0]]), p }); }
  const A = PR.nodes.find(n => n.p.id === 'A');
  return { nodos: PR.nodes.length, enlaces: PR.edges.length,
           latA: A && A.lat, lonA: A && A.lon, spofA: A && A.p.is_spof, descA: A && A.p.descendientes,
           bien: PR.nodes.every(n => isFinite(n.lat) && isFinite(n.lon) &&
                                     typeof n.p.is_spof === 'boolean' && n.p.descendientes >= 0),
           json: JSON.stringify(g).length };
});
check('lo exportado se relee por el camino de la página: 3 nodos y 2 enlaces',
      ida.nodos === 3 && ida.enlaces === 2, ida.nodos + ' / ' + ida.enlaces);
/* GeoJSON va [lon,lat] y Leaflet [lat,lon]. Cambiarlos de orden pone la planta en
   el mar y no da ningun error: por eso se comprueba el VALOR, no que haya dos. */
check('y con lat y lon en su sitio, no del revés',
      Math.abs(ida.latA - 41.501) < 1e-6 && Math.abs(ida.lonA + 0.8) < 1e-6,
      ida.latA + ' , ' + ida.lonA);
check('con los campos que la página pinta ya utilizables (SPOF y descendientes)',
      ida.bien && ida.spofA === true && ida.descA === 1,
      'spof=' + ida.spofA + ' desc=' + ida.descA);

/* Y el boton, pulsado de verdad: `page.click` negocia dentro de la pagina —lo que
   ya nos costo dos arreglos en este repo—, asi que se pulsa con un click del DOM
   en la misma tarea encolada. */
const tras = await pg.evaluate(() => {
  document.getElementById('mallaBtn').click();
  return document.getElementById('mallaK').textContent;
});
check('al pulsarlo, la pista cuenta lo que ha escrito', /3 nodos · 2 enlaces · 2 capturas/.test(tras), tras);
check('y la página no ha soltado ni un error', errores.length === 0, errores[0]);

/* ───────────────────────────────────────────────────────────────────────────────
   LA MAQUINA DEL TIEMPO SIGUE VIVA.

   Para poder exportar hubo que sacar el parseo de los tres CSV a funciones puras
   —`filasDeLog`, `coordsDe`, `snapsDeRutas`— y dejar los cargadores llamandolas.
   Eso es exactamente el codigo del que cuelga la maquina del tiempo, y NADA en
   este repo la vigilaba: cero bancos abrian index.html antes de esta tanda. Un
   refactor a ciegas sobre codigo sin red es como se rompen las cosas en silencio.
   ─────────────────────────────────────────────────────────────────────────────── */
{
  const d = await pg.evaluate(() => {
    demo();
    const o = { frames: S.frames.length, filas: S.rows.length, nodos: (S.allIds || []).length,
                snaps: (S.routeSnaps || []).length, persist: Object.keys(S.spofPersist || {}).length,
                coords: Object.keys(S.coords || {}).length, modos: {} };
    /* los siete modos de color, pintados de verdad y a mitad de la linea de tiempo:
       varios leen de `S.routeSnaps` y de `S.spofPersist`, que es lo que se movio */
    for (const m of ['rssi','estado','ack','saltos','crit','spof','spofp']) {
      try { setMode(m); S.idx = Math.min(3, S.frames.length - 1); render(); o.modos[m] = 'ok'; }
      catch (e) { o.modos[m] = String(e).slice(0, 80); }
    }
    o.marcadores = Object.keys(S.markers || {}).length;
    return o;
  });
  check('los datos de ejemplo siguen montando la línea de tiempo y sus nodos',
        d.frames === 24 && d.snaps === 24 && d.nodos === 219 && d.filas > 5000,
        [d.frames + ' instantes', d.snaps + ' capturas', d.nodos + ' nodos', d.filas + ' filas'].join(' · '));
  check('la persistencia del SPOF se sigue calculando (51 nodos con historial)',
        d.persist === 51, d.persist);
  check('y los siete modos de color pintan sin romperse',
        Object.values(d.modos).every(v => v === 'ok'),
        Object.entries(d.modos).filter(([, v]) => v !== 'ok').map(([k, v]) => k + ': ' + v).join(' | '));
  /* 221 y no 219: los marcadores se ACUMULAN entre cargas (`ensureMarkers` no
     recrea los que ya estan), asi que quedan los 219 del ejemplo mas la A y la B
     que este mismo banco cargo arriba. Se escribe asi, con la suma a la vista, en
     vez de poner 221 a secas: el dia que ese comportamiento cambie, que el numero
     diga por que. */
  check('hay un marcador por nodo: los 219 del ejemplo + los 2 del CSV de antes',
        d.marcadores === 219 + 2, d.marcadores);
  check('y sin un solo error de página en todo el recorrido', errores.length === 0, errores[0]);
}

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
await b.close();
process.exit(ko ? 1 : 0);
