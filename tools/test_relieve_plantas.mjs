/* BANCO DE RELIEVE: LAS PLANTAS SOBRE TERRENO SINTETICO, Y CON VEREDICTO.
 *
 *   node tools/test_relieve_plantas.mjs <planta> [<planta> ...]
 *   node tools/test_relieve_plantas.mjs            -> ABORTA (ver abajo)
 *   RELIEVE_PLANO=si node tools/test_relieve_plantas.mjs tunez   (mutacion: rojo)
 *
 * EL MODO SIN CONEXION del visor deja el terreno PLANO, asi que los fallos que
 * solo aparecen con pendiente (el CT flotando de Fayon) no se reproducian. Aqui
 * se interceptan las teselas del DEM y se sirve un terrarium generado
 * (tools/dem_sintetico.mjs): ondulado CONTINUO entre teselas, asi que el relieve
 * es real, medible y sin costuras falsas.
 *
 * ESTE BANCO NO JUZGABA NADA, Y ADEMAS NO MIRABA NADA. Imprimia un JSON por
 * planta y salia con 0 pasara lo que pasara: no podia ponerse rojo. Peor: en CI
 * entraba SIN ARGUMENTOS (`- { banco: test_relieve_plantas.mjs }`), o sea con
 * CERO plantas, asi que el bucle no daba ni una vuelta. Desde el 9 de
 * septiembre habia un tick verde en cada PR por no haber hecho nada. Ahora
 * aborta si no le dan plantas —el fallo mas caro es el banco que no mira— y
 * cada planta trae sus comprobaciones.
 *
 * LOS TOPES SALEN DE LA MEDIDA, y hay que leerlos sabiendo contra que terreno:
 * el sintetico tiene pendientes de hasta el 20 %, MUY por encima de cualquier
 * planta de la cartera (El Burgo, la mas brava, ronda el 3 %). Medido aqui:
 *
 *     planta        postes    p50   |p95|   |p99|   gruesos(>1 m)
 *     tunez            152   0,05    0,14    0,18      0,00 %
 *     paramo         3.168   0,09    0,56    0,82      0,00 %
 *     elburgo        3.368   0,12    0,53    0,70      0,00 %
 *     fayon            192   0,23    1,47    1,59     18,23 %
 *     bagnarelli       136   0,13    3,37    3,88     13,24 %
 *     polvorin         952   0,05    3,13    6,65     18,49 %
 *
 * Y LA COLA GRUESA NO ES UN DEFECTO DE LA PAGINA — se investigo antes de poner
 * el tope, que es lo que evita un numero elegido a ojo. Los postes malos salen
 * EN RAMPA a lo largo de una fila (Polvorin, cuatro consecutivos: -3,63 · -1,01
 * · +1,13 · +2,86) y sus escalas van de 3,8 (poste de 7,6 m) a 0,47, que es el
 * tope `Math.max(0.3, ...)` mordiendo. Es lo que tiene que pasar: el tubo es
 * RECTO y sobre un 20 % de pendiente transversal el suelo se le va 13 m en 64,
 * asi que por un extremo el poste se estira y por el otro toca su minimo y
 * flota. Sobre el DEM REAL de estas plantas la medida del usuario dio CERO
 * enterrados. Por eso se juzga el CENTRO de la distribucion (que es estable:
 * 0,05-0,23 en las seis) y se ACOTA la cola aparte en vez de fingir que no
 * existe: declararla es lo unico honesto mientras el terreno de prueba sea mas
 * bravo que el real.                                                        */
import pw from 'playwright-core';
const { chromium } = pw;
import { teselaTerrarium, relieve, zxy } from './dem_sintetico.mjs';
import { EXE } from './pw_navegador.mjs';   // la ruta del navegador, en un solo sitio
const PUERTO = process.env.PUERTO || 8123;   // mismo convenio que el resto de bancos: un solo servidor sirve a todos


const COTA = relieve(25, 800, 300);          // ondulado continuo, pendiente máxima 20%
const CACHE = new Map();
const PLANTAS = process.argv.slice(2);
/* EL FALLO MAS CARO ES EL BANCO QUE NO MIRA. Sin plantas no hay nada que
   comprobar, y salir en verde seria mentir en cada PR — que es justo lo que
   llevaba haciendo. */
if (!PLANTAS.length) {
  console.error('sin plantas que mirar: `node tools/test_relieve_plantas.mjs <planta> [...]`\n' +
                'las del indice: tunez fayon bagnarelli polvorin paramo elburgo ayora sanjose');
  process.exit(2);
}
const PLANO = process.env.RELIEVE_PLANO === 'si';   // mutacion: se corta el DEM y el banco TIENE que notarlo
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
/* Topes, de la tabla de la cabecera y con holgura. El centro es lo que se juzga;
   la cola se acota aparte y se declara. */
const TOPE_P50 = 0.50, TOPE_GRUESOS = 25;
const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.route('**/elevation-tiles-prod/**', r => {
  if (PLANO) return r.abort();          // MUTACION: sin relieve. El banco tiene que cazarlo.
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
  await p.goto(`http://127.0.0.1:${PUERTO}/terreno.html?planta=` + planta, { waitUntil: 'load', timeout: 150000 });
  /* LA ESPERA IBA ROTA, y por eso un cuelgue no se veia. `waitForFunction(fn,
     {timeout})` mete las opciones en el hueco del ARGUMENTO: se quedaba en los
     30 s de siempre, el `catch` se lo tragaba y el banco seguia como si nada.
     Ahora la espera es de verdad y, si no llega, se DICE con la planta delante. */
  const _t0 = Date.now();
  try { await p.waitForFunction(() => window.TRK && window.TRK.length > 0, null, { timeout: 120000 }); }
  catch (e) { console.log(`   ${planta}: los seguidores no aparecieron en 120 s`); }
  await p.waitForTimeout(9000);
  /* Y SE DICE DONDE SE ESTA antes de la sonda. El Burgo se colgo 33 minutos en
     el runner —aqui tarda 40 s— y el log no traia NI UNA linea suya: el job
     salio cancelado por su tope sin decir en que planta. Un banco que se cuelga
     tiene que dejar dicho al menos donde. */
  console.log(`   ${planta}: cargada en ${((Date.now()-_t0)/1000).toFixed(0)} s, midiendo…`);
  /* LA SONDA, ACOTADA. Recorre 3.368 postes y hace un Box3 de la escena entera
     (440.097 instancias en El Burgo): si se atasca ahi, sin tope se lleva el job
     por delante sin contar nada. */
  const r = await Promise.race([
    p.evaluate(() => {
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
    /* ESTADISTICA ROBUSTA, y no por elegancia. El minimo y el maximo de 3.368
       postes los fija UN punto: en un terreno sintetico al 20 % basta que la
       malla dibujada y el muestreo del DEM discrepen en una celda para sacar
       metros. Con min/max no se puede poner un tope que signifique algo — o
       deja pasar todo o salta con un pixel—. Asi que se mira la DISTRIBUCION
       (p50/p95/p99) y se ACOTA aparte cuantos puntos gruesos hay, que es
       declararlos en vez de taparlos. Es el criterio que ya usa
       `tests/test_careo_dem.js` del simulador RF para el mismo problema. */
    const pc = q => hue.length ? hue[Math.min(hue.length - 1, Math.floor(q * hue.length))] : null;
    const abs = hue.map(Math.abs).sort((a, b) => a - b);
    const pcA = q => abs.length ? abs[Math.min(abs.length - 1, Math.floor(q * abs.length))] : null;
    out.postes = { n: hue.length, min: hue[0], max: hue[hue.length - 1], mediana: pc(0.5),
                   p05: pc(0.05), p95: pc(0.95),
                   absP95: pcA(0.95), absP99: pcA(0.99),
                   gruesos: +(100 * abs.filter(v => v > 1).length / (abs.length || 1)).toFixed(2) };
    // NCUs / HSUs: altura del mástil sobre la malla
    out.ncus = (typeof gwMasts !== 'undefined' && gwMasts ? gwMasts : []).map(g =>
      +(g.position.y - terrainMeshY(g.position.x, -g.position.z)).toFixed(2));
    // CT: hueco bajo cada esquina del polígono (negativo = enterrado, positivo = flota)
    out.cts = [];
    ((LAYOUT.cts) || []).forEach((ct0, idx) => {
      const ct = ct0.slice();
      if (ct.length > 2 && Math.hypot(ct[0][0] - ct[ct.length - 1][0], ct[0][1] - ct[ct.length - 1][1]) < 1e-6) ct.pop();
      if (ct.length < 3) { out.cts.push('punto sin contorno: no se levanta'); return; }
      const cx = ct.reduce((s, q) => s + q[0], 0) / ct.length, cn = ct.reduce((s, q) => s + q[1], 0) / ct.length;
      let mu = null;
      // por userData.caseta, NO por proximidad: El Burgo tiene naves en el recinto que también son
      // extrusiones y el banco las confundía con el CT (daba huecos falsos de +4 m)
      (bosGroup ? bosGroup.children : []).forEach(o => {
        if (o.userData.caseta !== idx) return;
        mu = +new THREE.Box3().setFromObject(o).min.y.toFixed(2);
      });
      out.cts.push(mu == null ? 'sin caseta levantada (polígono descartado por tamaño)' :
        { hueco_esquinas: ct.map(q => +(mu - terrainMeshY(q[0], q[1])).toFixed(2)) });
    });
    // ¿hay algo dibujado? bounding box de la escena y nº de mallas visibles
    let vis = 0; scene.traverse(o => { if (o.isMesh && o.visible) vis++; });
    out.mallas_visibles = vis;
    const bb = new THREE.Box3().setFromObject(scene);
    out.escena = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map(v => +v.toFixed(0));
    out.camara = [+camera.position.x.toFixed(0), +camera.position.y.toFixed(0), +camera.position.z.toFixed(0)];
    return out;
  }),
    new Promise(res => setTimeout(() => res({ planta: planta, colgada: true }), 240000)),
  ]);
  if (r.colgada) {
    console.log(`FAIL ${planta}: la sonda no terminó en 240 s — se cuelga al medir, no al cargar`);
    ko++; await p.close(); continue;
  }
  r.errores = errs.length ? errs.slice(0, 3) : 'ninguno';
  console.log(JSON.stringify(r));

  /* ── EL VEREDICTO ────────────────────────────────────────────────────────
     Lo primero, que HAYA relieve: sin el, todo lo demas pasaria solo y el banco
     volveria a ser un adorno. Es lo que caza la mutacion. */
  check(`${planta}: el relieve sintetico ha llegado`, r.dem_ok === true,
        `cotas de seguidor ${JSON.stringify(r.relieve_trk)}`);
  check(`${planta}: se dibuja la planta`, r.mallas_visibles > 50 && r.seguidores > 0,
        `${r.mallas_visibles} mallas · ${r.seguidores} seguidores`);

  const P = r.postes;
  check(`${planta}: los postes pisan el suelo que se VE (centro de la distribucion)`,
        P.n > 0 && Math.abs(P.mediana) < TOPE_P50,
        `n=${P.n} p50=${P.mediana} (tope ${TOPE_P50})`);
  /* La cola se ACOTA, no se ignora: si algun dia una planta pasa del 25 % ya no
     es la pendiente del terreno de prueba, es otra cosa y hay que mirarla. */
  check(`${planta}: y la cola gruesa no se dispara`, P.gruesos <= TOPE_GRUESOS,
        `${P.gruesos} % de postes a mas de 1 m (tope ${TOPE_GRUESOS} %) · |p95| ${P.absP95}`);

  /* LOS MASTILES NACEN EN EL SUELO. Su origen es el pie, asi que la diferencia
     con la malla tiene que ser ~0: si se va, el equipo flota o esta enterrado. */
  check(`${planta}: las NCU/HSU se apoyan en el terreno`,
        r.ncus.every(v => Math.abs(v) < 0.25), JSON.stringify(r.ncus));

  /* LAS CASETAS DE CT: su explanada las nivela, asi que las cuatro esquinas
     tienen que quedar al MISMO hueco y pequeno. Es el fallo que dio nombre a
     este banco ("el CT flotando de Fayon"). */
  const cts = r.cts.filter(c => c && c.hueco_esquinas);
  const ctMal = cts.filter(c => c.hueco_esquinas.some(v => Math.abs(v) > 1.2));
  check(`${planta}: las casetas de CT ni flotan ni se entierran (${cts.length} con contorno)`,
        ctMal.length === 0, JSON.stringify(ctMal.slice(0, 2)));

  check(`${planta}: sin errores de JS`, errs.length === 0, JSON.stringify(errs.slice(0, 2)));
  await p.close();
}
await b.close();

if (PLANO) { console.log(ko ? `\nMUTACION OK: el banco la caza (${ko} rojo)` : '\nMUTACION NO CAZADA: el banco no vale');
             process.exit(ko ? 0 : 1); }
if (ko) { console.log(`\n${ko} FALLOS (${ok} OK)`); process.exit(1); }
console.log(`\nTODAS OK (${ok} comprobaciones en ${PLANTAS.length} plantas)`);
