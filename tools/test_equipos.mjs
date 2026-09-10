// La NCU y la HSU de Cobertura 3D, después de sacarlas a `equipos.js`.
//
// El modelo de los dos equipos dejó de estar escrito dentro de `terreno.html` y
// pasó al módulo que comparte con el simulador de cobertura RF. Un cambio así
// tiene dos maneras de salir mal, y las dos pasan calladas:
//
//   1. que la geometría se MUEVA. Aquí se comprueban las cotas que importan
//      contra el plano: el poste de la NCU (2,95 m, DR_NCU_v0) con su armario
//      415×515×230 a la altura de servicio y el látigo en la CABEZA; la torre de
//      la HSU (8 m, FTR.24.00145_5_C) con su ultrasónico, sus dos látigos —que
//      van en su BRAZO a 6,50 m, no en la cabeza— y —si la planta lo lleva— su
//      módulo FV. Y que haya UNA por cada NCU/HSU del
//      layout, ni una más;
//
//   2. que al llevarse el bloque se lleve por delante algo de lo que dependía
//      OTRO. Pasó: el ayudante `mP` lo definía el bloque de meteo y lo usaba el
//      de CCTV, de más arriba, por hoisting. Al mover la meteo, `buildBOS`
//      reventaba antes de llegar a las estaciones — y SOLO en las plantas con
//      PTZ, así que una planta sin cámaras habría dado el visto bueno. Por eso
//      este banco corre DOS plantas con perfiles distintos y exige que el bosque
//      llegue entero hasta el final.
//
// CONTAR HIJOS DEL GRUPO NO VALE. `instanciaBOS()` junta las mallas repetidas de
// las instalaciones y las sustituye por InstancedMesh, SACÁNDOLAS de su grupo:
// en El Burgo pasa de 2.837 mallas a 405, con 2.469 retiradas en 37 lotes. Una
// HSU entera parecía entonces tener 17 piezas de 123 y este banco cantó una
// regresión que no existía —la celosía estaba, instanciada—. Aquí se cuenta por
// GEOMETRÍA en TODO el bosque sumando `count` cuando la malla es instanciada,
// que es lo que de verdad se dibuja, y las cotas se miden sobre un modelo recién
// construido, que es el contrato de `equipos.js` y no lo toca el instanciado.
//
//   python3 -m http.server 8100        (en otra terminal)
//   node tools/test_equipos.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PUERTO = process.env.PUERTO || 8100;   // mismo convenio que el resto de bancos: un solo servidor sirve a todos

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const BASE = process.env.BASE || `http://127.0.0.1:${PUERTO}`;
import { EXEC } from './pw_navegador.mjs';   // la ruta del navegador, en un solo sitio
let ok = 0, ko = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

/* Dos perfiles distintos a propósito: El Burgo lleva PTZ y módulo FV en la HSU;
   Ayora no lleva módulo (`hsu.pv:false` en su layout) y trae 10 estaciones. */
/* UNA PLANTA POR EJECUCION, si se pide por argumento.
   Este banco monta DOS escenas 3D pesadas y en los runners compartidos su
   tiempo es una loteria: 11 min 54 s en una ejecucion y mas de 44 en la
   siguiente, con el mismo codigo. La variacion no esta aqui, esta en que
   maquina toque — y con las dos plantas en un solo job, un runner malo se
   lleva por delante la comprobacion de las dos.
   Partido, cada planta corre en su propio runner: la mala suerte de una no
   tumba a la otra, y el rojo dice cual. Sin argumento corre las dos, que es lo
   que uno quiere en su maquina. Un nombre que no existe aborta, en vez de
   pasar en verde sin comprobar nada. */
const TODAS = [
  /* `rejilla`: si esa planta TIENE retícula de apoyos medida en su layout. El
     Burgo la tiene (Tierras.dwg); Ayora no. Va aquí y no se deduce de la página:
     preguntándole a la página, quitarle la retícula a El Burgo pasaba en verde
     —el banco se conformaba con que cayera en la genérica— y esa es justo la
     regresión que hay que cazar. */
  { q: 'planta=elburgo',                       nom: 'El Burgo', pv: true,  ptz: true,  rejilla: true },
  { q: 'planta=ayora&cotas=levantamiento',     nom: 'Ayora',    pv: false, ptz: false, rejilla: false },
];
const SOLO = process.argv[2];
if (SOLO && !TODAS.some(p => p.nom.toLowerCase().replace(/\s+/g, '') === SOLO.toLowerCase())) {
  console.error(`planta desconocida: ${JSON.stringify(SOLO)}\nlas que hay: ${TODAS.map(p => p.nom).join(' · ')} (o nada para las dos)`);
  process.exit(2);
}
const PLANTAS = SOLO ? TODAS.filter(p => p.nom.toLowerCase().replace(/\s+/g, '') === SOLO.toLowerCase()) : TODAS;

const SONDA = `(() => {
  /* La sonda se cronometra a si misma. Hace falta porque en CI tardo 261,7 s y
     AQUI su trabajo propio son 1 y 5 milisegundos (careado en las dos plantas
     recontando pieza por pieza). Con un solo numero desde fuera no se distingue
     "la sonda es cara" de "la sonda hace cola detras de una pagina ocupada", y
     esa diferencia decide donde hay que mirar. Aqui dentro no puede haber
     acentos graves: esto es una plantilla. */
  const _t0 = performance.now();
  const D = Equipos.DIMS;
  /* Caja envolvente SOLO de mallas: la etiqueta del equipo es un sprite y
     setFromObject la mete dentro, así que el alto salía con 1,7 m de aire. */
  const bb = o => { const b = new THREE.Box3();
    o.traverse(n => { if (n.isMesh) b.expandByObject(n); });
    return { min: b.min.toArray(), max: b.max.toArray() }; };
  const eq = (a, b2) => Math.abs(a - b2) < 1e-9;
  /* Cuántas veces se DIBUJA una geometría en todo el bosque. Una InstancedMesh
     vale por su "count": es lo que hace que esto sobreviva a "instanciaBOS". */
  const cuenta = (raiz, pred) => { let n = 0;
    raiz.traverse(o => { if (!o.isMesh) return;
      const q = o.geometry && o.geometry.parameters;
      if (q && pred(q)) n += (o.isInstancedMesh ? o.count : 1); });
    return n; };
  const cil = (rt, rb, h, seg) => q => q.radiusTop !== undefined && eq(q.radiusTop, rt) &&
        eq(q.radiusBottom, rb) && (h === null || eq(q.height, h)) && (seg === null || q.radialSegments === seg);
  const caja = (w, h, d) => q => q.width !== undefined && eq(q.width, w) && eq(q.height, h) && eq(q.depth, d);
  const ncu = pred => gwMasts.reduce((n, g) => n + cuenta(g, pred), 0);
  const W = D.hsuLegR * 1.732, dgl = Math.sqrt(W * W + Math.pow(D.hsuTowerH / D.hsuLevels, 2));
  const piezas = {
    // HSU
    piranometro: cuenta(bosGroup, q => q.tube !== undefined && eq(q.radius, 0.16) && eq(q.tube, 0.025)),
    patas:       cuenta(bosGroup, cil(0.014, 0.016, D.hsuTowerH, 8)),
    travesanos:  cuenta(bosGroup, cil(0.006, 0.006, W, 6)),
    diagonales:  cuenta(bosGroup, cil(0.005, 0.005, dgl, 6)),
    sondas:      cuenta(bosGroup, cil(0.004, 0.004, 0.09, 5)),
    brazoAnt:    cuenta(bosGroup, caja(D.hsuAntArmL, 0.03, 0.03)),   // + el de la garita, mismo perfil
    brazoPira:   cuenta(bosGroup, caja(0.7, 0.03, 0.03)),
    latigoHsu:   cuenta(bosGroup, cil(0.005, 0.005, 0.34, 5)),       // el corto: el largo lo comparte con la NCU
    pv:          cuenta(bosGroup, caja(D.hsuPvW + 0.02, D.hsuPvH + 0.02, 0.030)),
    /* NCU: cuelgan de gwMasts, no de bosGroup, así que el instanciado ni las
       roza; se cuentan igual por geometría para que valga el mismo criterio. */
    armario:     ncu(caja(D.ncuCabW, D.ncuCabH, D.ncuCabD)),
    carril:      ncu(caja(0.34, 0.05, 0.04)),
    corrugado:   ncu(cil(0.024, 0.024, 1.05, 8)),
  };
  /* Las cotas, sobre un modelo recién construido: es el contrato de equipos.js,
     no lo toca el instanciado, y no depende de qué planta se esté mirando. */
  const modelo = tipo => {
    const M = Equipos.materials(THREE);
    const r = tipo === 'hsu'
      ? Equipos.buildHSU(THREE, { materials: M, pv: true, giro: 0,
          panelMaterial: new THREE.MeshStandardMaterial() })
      : Equipos.buildNCU(THREE, { materials: M });
    let n = 0; r.group.traverse(o => { if (o.isMesh) n++; });
    return { mallas: n, bb: bb(r.group) };
  };
  return {
    _ms: Math.round(performance.now() - _t0),
    equipos: Equipos.VERSION, piezas,
    hsu: modelo('hsu'), ncu: modelo('ncu'),
    /* La retícula de apoyos vivía escrita AQUÍ y el simulador de cobertura RF,
       que no la tenía, se inventaba la suya. Ahora es de "seguidor.js" y la
       comparten los dos: que esta página la lea de allí, y no vuelva a tener
       una copia propia que se separe. */
    zP: TC.zP, zPref: Seguidor.pilotesX(Seguidor.DIMS.modsPerStr),
    mods: Seguidor.DIMS.modsPerStr,
    /* La retícula MEDIDA por tipo: tiene que venir del layout de la planta, no
       de un literal con el nombre de la planta dentro de un "if". */
    zPT: TC.zPT, np: TC.np,
    pilLayout: (LAYOUT && LAYOUT.pilotes && LAYOUT.pilotes.porTipo) || null,
    /* Lo que la página USA de verdad, no la aritmética rehecha aquí: con una X
       inventada el banco pasaba en verde porque comprobaba la regla, no el uso. */
    dampInt: TC.dampX || null, dampMed: TC.dampXM || null,
    dampIntRegla: TC.zPT ? Seguidor.damperPostX(TC.zPT.int) : null,
    dampMedRegla: TC.zPT ? Seguidor.damperPostX(TC.zPT.med) : null,
    /* Reserva del InstancedMesh de postes (N x np) contra los apoyos que dicta la
       retícula de cada tipo. "count" es la RESERVA, no lo dibujado: lo que hay
       que exigir es que alcance — si "np" se queda corto, hay apoyos que no se
       dibujan y nadie se entera. */
    reservaPostes: (typeof imPost !== "undefined" && imPost) ? imPost.count : null,
    postesDebidos: NODES.reduce(function (a, t) { return a + 2 * zPfor(t).length; }, 0),
    nMeteo: (LAYOUT.meteo || []).length,
    nNcu: gwMasts.length, nGw: GWS.length,
    antNcu: D.ncuAntY, antHsu: D.hsuAntY, mastNcu: D.ncuMastH, torreHsu: D.hsuTowerH,
    // el bosque tiene que llegar ENTERO: si buildBOS revienta a medias, esto se queda corto
    hijosBos: bosGroup.children.length,
  };
})()`;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64');

/* LA RETÍCULA NO PUEDE VOLVER A LA PÁGINA. Las comprobaciones de abajo miran lo
   que la página HACE, y con las coordenadas escritas a mano hace exactamente lo
   mismo —son los mismos números—: por eso devolverlas pasaba en verde. Esto mira
   la FUENTE. El dato del levantamiento de una planta vive en su layout. */
{
  const src = fs.readFileSync(path.join(RAIZ, 'terreno.html'), 'utf-8');
  const cotas = ['-30.5', '-22.9', '-15.5', '-7.7', '-30.8', '-24.7', '-17.8', '-13.6', '-6.5'];
  const dentro = cotas.filter(c => src.includes(c + ',') || src.includes('[' + c));
  check('la retícula de El Burgo NO está escrita en terreno.html',
        dentro.length === 0, 'cotas encontradas: ' + dentro.join(' '));
  const lay = JSON.parse(fs.readFileSync(path.join(RAIZ, 'elburgo_layout.json'), 'utf-8'));
  check('y sí está en el layout de la planta, con su procedencia',
        !!(lay.pilotes && lay.pilotes.porTipo && lay.pilotes.fuente &&
           /Tierras/i.test(lay.pilotes.fuente)),
        JSON.stringify(lay.pilotes && lay.pilotes.fuente));
}

const browser = await chromium.launch({ executablePath: EXEC,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
/* CRONOMETRO GLOBAL. El de cada planta arrancaba y moria dentro del bucle, y
   por eso NO vio lo que se cuenta abajo: el tiempo no estaba en ningun tramo
   que midiera, estaba DESPUES del ultimo. */
const T0 = Date.now();
const desde = t => ((Date.now() - t) / 1000).toFixed(1);
/* Un cierre que tarda mas de la cuenta NO para el banco: se dice y se sigue. Si
   algun dia deja de tardar, el aviso desaparece solo y nadie tiene que acordarse
   de quitar nada. */
const conPrisa = (prom, ms, que) => Promise.race([
  prom.then(() => true).catch(() => true),
  new Promise(r => setTimeout(() => { console.log(`   (${que} no cerro en ${ms / 1000} s; se sigue)`); r(false); }, ms)),
]);

for (const pl of PLANTAS) {
  /* Una pestaña NUEVA por planta: la escena anterior sigue renderizando y con
     una sola pestaña la segunda carga se queda sin tiempo. */
  /* VENTANA PEQUEÑA. Este banco no mira PIXELES: mira posiciones, cuentas y
     procedencias, todas del grafo de escena. Pero renderiza las dos escenas mas
     pesadas del repo —El Burgo y Ayora con su levantamiento— y en CI eso lo
     rasteriza SwiftShader por software, donde el coste va con el area. 900x620
     son nueve veces mas pixeles que los 320x200 que usa test_suelo, que tarda
     28 s. Nada de lo que se comprueba aqui depende del tamaño de la ventana. */
  /* El cronometro arranca AQUI, no despues de montar el contexto. Montarlo no
     es gratis: con el contexto anterior todavia cerrandose por detras, abrir el
     siguiente costaba 75 s que NO caian dentro de ninguna marca. Un hueco entre
     marcas es justo lo que escondio media hora de cierre durante toda una
     noche; no se deja ninguno. */
  let t0 = Date.now(), tPrev = t0;
  const marca = (q) => { const d = desde(tPrev); tPrev = Date.now();
    console.log(`   [${pl.nom}] ${q}: +${d} s  (acumulado ${desde(t0)} s)`); };
  const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
  /* MODO OFFLINE, como los otros ocho bancos que tocan terreno.html.
     Cortar la red no bastaba: la pagina montaba igualmente los mosaicos de
     satelite y relieve —lienzos de cientos de teselas— y les pasaba
     `getImageData`. Este banco era el UNICO lento de la matriz por eso: 24 min
     en un runner, mas de 45 en otro. Con `cobertura_offline` la pagina no los
     construye siquiera («cero llamadas externas», dice su propio comentario), y
     lo que aqui se comprueba —equipos, estaciones, retícula de apoyos— no
     depende de la ortofoto ni del DEM. */
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) { } });
  /* QUIEN OCUPA EL HILO. Medido en CI, un `page.evaluate(() => 1)` —devolver el
     numero uno— tarda 211 s en Ayora. La pagina esta ocupada; falta saber en
     que. Esto lo pregunta desde dentro y no cuesta nada: un observador de
     tareas largas y un contador de frames.
     Aqui no se reproduce: ni frenando la CPU veinte veces con CDP paso de 8 s.
     Asi que lo contesta el runner, que es donde ocurre. */
  await ctx.addInitScript(() => {
    window.__largas = [];
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries())
        window.__largas.push([Math.round(e.startTime), Math.round(e.duration)]); })
        .observe({ entryTypes: ['longtask'] });
    } catch (e) { window.__obsErr = String(e).slice(0, 80); }
    window.__f = 0; window.__fTot = 0; window.__fMax = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => {
      const a = performance.now();
      try { cb(t); } finally { const d = performance.now() - a;
        window.__f++; window.__fTot += d; if (d > window.__fMax) window.__fMax = d; }
    });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  /* Las teselas de satélite salen a internet; en CI no hay salida y el cargador
     se quedaría esperando. Se sirven en blanco: no entran en ninguna comprobación. */
  /* EL MODELO DE LA TCU NO SE DESCARGA. `tcu.glb` son 4,4 MB y en el runner
     tardo 50,058 s el solo —lo dijo el parte de red de este mismo banco, y son
     casi todos los 50,5 s que costaba «montar la escena»—.
     Este banco no mira la TCU: ni la nombra. Cuenta la HSU y la NCU por
     GEOMETRIA (BoxGeometry, CylinderGeometry...), y las mallas que vienen de un
     .glb son BufferGeometry sin `parameters`, asi que nunca entraron en ninguna
     cuenta. Y la pagina sabe vivir sin el: `loadTCU` tiene su rama de error
     —`TCUGLB=null`— que es justo lo que ya hace hoy en San Jose, donde no se
     carga por peso. Se corta la peticion y se sigue; no se deja de comprobar
     nada. */
  await page.route('**/tcu.glb', route => route.abort());
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => {
    const u = route.request().url();
    if (/\.(png|jpg|jpeg|webp)|GetTile|MapServer|wmts/i.test(u))
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  /* CRONOMETRO POR TRAMO. Este banco tarda 103 s aqui y entre 24 y mas de 45
     MINUTOS en el runner — un factor 20, cuando los demas van a 5. Dos
     hipotesis mias (la red, el tamaño de ventana) no lo explican: ninguna se
     confirma midiendo en local. Asi que en vez de seguir adivinando, que lo
     diga el log: si el tiempo se va en `goto`, es la carga; si en la espera, es
     que la escena tarda en montarse; si en las comprobaciones, es el sondeo. */
  /* Se imprime el ACUMULADO y, sobre todo, LO QUE HA COSTADO ESTE TRAMO. El
     acumulado a solas fue lo que me despisto: un hueco de media hora entre dos
     marcas se lee de un vistazo en la columna de tramos, y en la de acumulados
     hay que restar a mano. */
  marca('contexto');
  /* `domcontentloaded`, NO `load`. Este banco ya tiene su propia condicion de
     listo —el bucle de abajo espera a que existan `gwMasts` y `bosGroup`—, asi
     que `load` era una segunda barrera, mas debil y mas lenta: espera a TODOS
     los recursos de una pagina 3D pesada. En `main` se paso de los 120 s
     cargando Ayora con su levantamiento y tumbo el CI.
     La condicion de verdad es la de abajo, que ademas dice QUE espera. */
  /* PERFILADOR DE CPU, siempre encendido y CALLADO salvo que haga falta. Se
     imprime solo si la cola pasa del umbral, que es justo el caso raro que hay
     que cazar y que aqui no se reproduce: en una maquina sana no dice nada y no
     estorba. Muestrea cada 10 ms, que para tareas de minutos sobra. */
  let perfil = null;
  try {
    perfil = await ctx.newCDPSession(page);
    await perfil.send('Profiler.enable');
    await perfil.send('Profiler.setSamplingInterval', { interval: 10000 });
    await perfil.send('Profiler.start');
  } catch (e) { perfil = null; }
  await page.goto(BASE + '/terreno.html?' + pl.q, { waitUntil: 'domcontentloaded', timeout: 120000 });
  marca('goto');
  let listo = false;
  for (let i = 0; i < 90 && !listo; i++) {
    listo = await page.evaluate(() => typeof gwMasts !== 'undefined' && gwMasts && gwMasts.length > 0 && !!bosGroup);
    if (!listo) await page.waitForTimeout(1000);
  }
  if (!listo) { check(pl.nom + ': la escena se monta', false, 'no llegó a montarse'); await page.close(); continue; }
  marca('escena montada');
  await page.waitForTimeout(1200);
  /* UN EVALUATE VACIO ANTES DE LA SONDA. No comprueba nada: mide la COLA. Si
     este tarda tanto como la sonda, el tiempo no es de la sonda sino de la
     pagina, que sigue ocupada; si tarda nada y la sonda tarda, es la sonda.
     Esa distincion es la que faltaba para saber donde mirar, y sale gratis. */
  const tVacio = Date.now();
  await page.evaluate(() => 1);
  const colaMs = Date.now() - tVacio;
  marca(`evaluate VACIO (la cola)`);
  const s = await page.evaluate(SONDA);
  marca(`sonda (de los cuales ${s._ms / 1000} s son suyos, el resto es cola)`);
  /* El parte de quien ocupaba el hilo. Se pide DESPUES de las medidas para no
     falsearlas, y se imprime aunque no haya nada raro: un banco que solo habla
     cuando falla no deja aprender nada del que pasa. */
  try {
    const h = await page.evaluate(() => ({
      n: window.__largas.length,
      suma: Math.round(window.__largas.reduce((a, e) => a + e[1], 0)),
      top: window.__largas.slice().sort((a, b2) => b2[1] - a[1]).slice(0, 6),
      f: window.__f, fMed: window.__f ? Math.round(window.__fTot / window.__f) : 0,
      fMax: Math.round(window.__fMax), reloj: Math.round(performance.now()), err: window.__obsErr || null,
      /* Y A QUE ESPERA, que es la pregunta que queda. En el runner, montar la
         escena de Ayora tarda 54 s y de esos solo 5,3 son tareas largas de JS:
         el hilo esta LIBRE —el evaluate vacio contesta en 1,3 s— asi que esos
         49 s no se calculan, se esperan. O es la red o son temporizadores, y
         esto lo distingue. */
      red: (() => { try {
        const r = performance.getEntriesByType('resource');
        const suma = Math.round(r.reduce((a2, e) => a2 + e.duration, 0));
        const top = r.slice().sort((a2, b2) => b2.duration - a2.duration).slice(0, 4)
          .map(e => [e.name.split('/').pop().split('?')[0].slice(0, 28), Math.round(e.duration)]);
        return { n: r.length, suma, top };
      } catch (e) { return null; } })(),
    }));
    console.log(`   [${pl.nom}] el hilo: ${h.n} tareas largas que suman ${(h.suma / 1000).toFixed(1)} s`
      + ` · ${h.f} frames (media ${h.fMed} ms, el peor ${h.fMax} ms) · reloj de la pagina ${(h.reloj / 1000).toFixed(1)} s`);
    console.log(`   [${pl.nom}] las mas largas [empieza s, dura ms]: `
      + JSON.stringify(h.top.map(([q, d]) => [+(q / 1000).toFixed(1), d])) + (h.err ? ` (observador: ${h.err})` : ''));
    if (h.red) console.log(`   [${pl.nom}] la red: ${h.red.n} peticiones que suman ${(h.red.suma / 1000).toFixed(1)} s`
      + ` · las mas lentas ${JSON.stringify(h.red.top)}`);
  } catch (e) { console.log(`   [${pl.nom}] el hilo: no se pudo preguntar (${String(e).split('\n')[0].slice(0, 80)})`); }
  const UMBRAL = Number(process.env.UMBRAL_PERFIL || 20) * 1000;
  if (perfil) try {
    const { profile } = await perfil.send('Profiler.stop');
    if (colaMs >= UMBRAL) {
      const cuenta = new Map();
      for (const id of profile.samples || []) cuenta.set(id, (cuenta.get(id) || 0) + 1);
      const total = (profile.samples || []).length || 1;
      const dur = (profile.endTime - profile.startTime) / 1e6;
      const nodos = new Map(profile.nodes.map(n => [n.id, n]));
      console.log(`   [${pl.nom}] la cola fueron ${(colaMs / 1000).toFixed(0)} s, asi que va el perfil`
        + ` (${dur.toFixed(0)} s, ${total} muestras). «(program)» es codigo NATIVO del navegador, no de la pagina:`);
      [...cuenta.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 8).forEach(([id, n]) => {
        const f = (nodos.get(id) || {}).callFrame || {};
        const u = (f.url || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
        console.log(`      ${(n / total * 100).toFixed(1).padStart(5)} %  ${(n / total * dur).toFixed(0).padStart(4)} s  `
          + `${f.functionName || '(anonima)'}  ${u ? u + ':' + (f.lineNumber + 1) : '(nativo)'}`);
      });
    }
  } catch (e) { }

  check(pl.nom + ': sin errores de página', errs.length === 0, errs.slice(0, 2).join(' | '));
  check(pl.nom + ': el modelo viene de equipos.js', !!s.equipos, s.equipos);

  // --- el bosque llega entero (el fallo de `mP`) ---
  const P = s.piezas, nH = s.nMeteo, nN = s.nNcu;
  check(pl.nom + ': buildBOS termina y planta TODAS las estaciones del layout',
        P.piranometro === nH, P.piranometro + ' de ' + nH);
  check(pl.nom + ': una NCU por cada una del layout', nN === s.nGw, nN + ' de ' + s.nGw);

  /* --- y cada estación está ENTERA. Se cuenta por geometría en todo el bosque
         (ver cabecera): dentro del grupo ya no están, las instancia el visor. */
  check(pl.nom + ': la celosía entera, 3 patas de 8 m por torre', P.patas === 3 * nH, P.patas + ' de ' + 3 * nH);
  check(pl.nom + ': sus 48 travesaños por torre', P.travesanos === 48 * nH, P.travesanos + ' de ' + 48 * nH);
  check(pl.nom + ': sus 48 diagonales por torre', P.diagonales === 48 * nH, P.diagonales + ' de ' + 48 * nH);
  check(pl.nom + ': las 3 sondas del ultrasónico', P.sondas === 3 * nH, P.sondas + ' de ' + 3 * nH);
  check(pl.nom + ': los 2 brazos de 45 cm (antenas y garita)', P.brazoAnt === 2 * nH, P.brazoAnt + ' de ' + 2 * nH);
  check(pl.nom + ': el brazo del piranómetro', P.brazoPira === nH, P.brazoPira + ' de ' + nH);
  check(pl.nom + ': los látigos en el brazo, uno corto por estación', P.latigoHsu === nH, P.latigoHsu + ' de ' + nH);
  check(pl.nom + ': módulo FV ' + (pl.pv ? 'SÍ' : 'NO') + ' (lo dice el layout, no el nombre de la planta)',
        P.pv === (pl.pv ? nH : 0), P.pv + ' de ' + (pl.pv ? nH : 0));
  check(pl.nom + ': el armario de cada NCU', P.armario === nN, P.armario + ' de ' + nN);
  check(pl.nom + ': sus 2 carriles y su corrugado',
        P.carril === 2 * nN && P.corrugado === nN, P.carril + ' carriles, ' + P.corrugado + ' corrugados');

  // --- la retícula MEDIDA, del layout de la planta y no de un literal ---
  check(pl.nom + ': retícula de apoyos medida ' + (pl.rejilla ? 'SÍ' : 'NO') + ', como dice su layout',
        !!s.zPT === pl.rejilla, 'zPT=' + (s.zPT ? Object.keys(s.zPT).join('/') : 'null'));
  if (s.zPT) {
    check(pl.nom + ': la retícula medida viene del LAYOUT, no escrita en la página',
          !!s.pilLayout, 'LAYOUT.pilotes ausente');
    check(pl.nom + ': y es la del Tierras.dwg (8 interior · 10 exterior · 4 medio)',
          JSON.stringify(s.zPT.int) === JSON.stringify(s.pilLayout.interior) &&
          JSON.stringify(s.zPT.ext) === JSON.stringify(s.pilLayout.exterior) &&
          JSON.stringify(s.zPT.med) === JSON.stringify(s.pilLayout.medio) &&
          s.zPT.int.length === 8 && s.zPT.ext.length === 10 && s.zPT.med.length === 4,
          JSON.stringify(s.zPT));
    /* `np` (tope de apoyos por seguidor) y la X del amortiguador colgaban de tres
       números escritos a mano —20, ±22,9 y ±6,5—. Salen de la propia retícula. */
    check(pl.nom + ': el tope de apoyos sale de la retícula, no de un 20 a mano',
          s.np === 2 * Math.max(s.zPT.int.length, s.zPT.ext.length, s.zPT.med.length), s.np);
    check(pl.nom + ': el pie del amortiguador, en el penúltimo poste REAL de su tipo',
          JSON.stringify(s.dampInt) === JSON.stringify(s.dampIntRegla) &&
          JSON.stringify(s.dampMed) === JSON.stringify(s.dampMedRegla) &&
          JSON.stringify(s.dampInt) === JSON.stringify([-22.9, 22.9]) &&
          JSON.stringify(s.dampMed) === JSON.stringify([-6.5, 6.5]),
          'usa ' + JSON.stringify(s.dampInt) + ' / ' + JSON.stringify(s.dampMed) +
          ', la regla dice ' + JSON.stringify(s.dampIntRegla) + ' / ' + JSON.stringify(s.dampMedRegla));
  } else {
    check(pl.nom + ': sin retícula medida, cae en la genérica de seguidor.js',
          !s.pilLayout && JSON.stringify(s.zP) === JSON.stringify(s.zPref), JSON.stringify(s.zP));
  }
  if (s.reservaPostes !== null)
    check(pl.nom + ': la reserva de postes alcanza para los apoyos de todos los tipos',
          s.reservaPostes >= s.postesDebidos,
          'reserva ' + s.reservaPostes + ' para ' + s.postesDebidos + ' apoyos');

  // --- la retícula genérica, de seguidor.js y no de una copia local ---
  check(pl.nom + ': la retícula de apoyos sale de seguidor.js',
        JSON.stringify(s.zP) === JSON.stringify(s.zPref),
        JSON.stringify(s.zP) + ' contra ' + JSON.stringify(s.zPref));
  check(pl.nom + ': y la genérica es proporcional a los ' + s.mods + ' módulos por ala',
        s.zP.length === 4 && Math.abs(s.zP[3] - 28 * s.mods / 28) < 1e-9, JSON.stringify(s.zP));

  // --- NCU: cotas del plano DR_NCU_v0, sobre el modelo recién construido ---
  {
    const alto = s.ncu.bb.max[1];
    check(pl.nom + ': la NCU son 17 piezas', s.ncu.mallas === 17, s.ncu.mallas);
    check(pl.nom + ': el poste de la NCU mide 2,95 m', near(s.mastNcu, 2.95, 1e-9), s.mastNcu);
    check(pl.nom + ': el látigo de la NCU corona el poste (3,15 m)',
          near(s.antNcu, 3.15, 1e-9) && alto > 3.3 && alto < 3.5, s.antNcu + ' / cabeza ' + alto.toFixed(3));
  }

  // --- HSU: cotas del plano FTR.24.00145_5_C ---
  {
    /* La cota que importa es la CABEZA sobre su suelo (max), no el alto de la
       caja: el modelo baja del cero (zapata y corrugado) y ese trozo enterrado
       engordaba el alto hasta 9,29 m. */
    const cabeza = s.hsu.bb.max[1];
    check(pl.nom + ': la HSU son 123 piezas', s.hsu.mallas === 123, s.hsu.mallas);
    check(pl.nom + ': la torre de la HSU mide 8 m', near(s.torreHsu, 8.0, 1e-9), s.torreHsu);
    check(pl.nom + ': la cabeza de la HSU corona los 8 m de torre',
          cabeza > 8.4 && cabeza < 8.7, cabeza.toFixed(3) + ' (base ' + s.hsu.bb.min[1].toFixed(3) + ')');
    check(pl.nom + ': los látigos de la HSU, en su brazo a 6,50 m', near(s.antHsu, 6.50, 1e-9), s.antHsu);
  }
  /* AQUI FALTABA LA MARCA, y aqui estaba todo el tiempo. En CI, con el banco ya
     terminado y sus comprobaciones impresas:

         El Burgo   ultima comprobacion 01:57:17 · fin del proceso 02:32:17
         Ayora      ultima comprobacion 05:58:15 · fin del proceso 06:13:47

     35 minutos y 15 minutos, CERRANDO. El trabajo entero —cargar, montar la
     escena, sondear y comprobar— cabe en menos de un minuto en los dos casos.
     El cronometro no lo vio porque su ultima marca era «escena montada»: medi
     los tres tramos donde yo suponia que estaba el tiempo, y estaba despues del
     ultimo que medi. */
  marca('comprobaciones');
  await page.close();
  marca('page.close');
  /* CERRAR LA PESTAÑA ANTES DE ABRIR LA SIGUIENTE.
     Esto es lo que hacia que el banco tardara CUARENTA MINUTOS en CI. El
     cronometro lo señalo sin lugar a dudas: entre la ultima comprobacion de El
     Burgo y el `goto` de Ayora pasaban 38 minutos, y Ayora entera —cargar,
     montar y sus 21 comprobaciones— son CINCO SEGUNDOS.
     No estaba ni en las comprobaciones ni en montar la escena: estaba en el
     HUECO. La pestaña de El Burgo no se cerraba nunca y seguia repintando su
     escena por software, ahogando al segundo contexto. Lo dice el comentario
     de arriba —«la escena anterior sigue renderizando»— y se resolvia abriendo
     otra pestaña en vez de cerrar la primera.
     Aqui apenas se nota (2 s de 98) porque esta maquina tiene aire de sobra;
     en un runner de dos nucleos con SwiftShader, es todo. */
  /* NO se espera a `ctx.close()`. Ahi estaba TODO el tiempo de este banco:

         El Burgo   ctx.close  96,0 s de 107 totales
         Ayora      ctx.close 157,9 s de 162

     El trabajo son 15 segundos entre las dos plantas; el resto es cerrar. Y no
     se arregla soltando el WebGL a mano: medido, `renderer.dispose()` mas
     `loseContext()` deja el `ctx.close` en 0,2 s... pero el propio `dispose`
     tarda 83 s y 172. El coste no desaparece, se mueve. La pagina sigue
     trabajando un par de minutos despues de que el banco la de por lista, y
     cualquier cosa que espere al hilo principal paga esa cuenta.

     Lo que hay que dejar de hacer es ESPERARLA. La pestaña si se cierra —eso es
     instantaneo y es lo que evita que una planta ahogue a la siguiente—, pero
     al contexto se le da un plazo corto y se sigue. Al terminar, el navegador
     se cierra con el mismo plazo y el proceso sale; Playwright se lleva por
     delante el Chromium hijo.

     Esto NO comprueba menos: las comprobaciones ya han terminado y estan
     impresas cuando se llega aqui. */
  await conPrisa(ctx.close(), 5000, `ctx.close de ${pl.nom}`);
  marca('ctx.close');
}

/* Y como no se espera al cierre, hay que llevarse el Chromium a mano: medido,
   sobrevive al proceso —seguia vivo 80 s despues de salir, y no iba a morirse—,
   asi que en una maquina de trabajo se acumularia uno por ejecucion. En CI no
   se notaba porque el runner limpia huerfanos al acabar el job.
   Se recorre /proc porque es donde corre esto (CI y contenedor Linux); en otro
   sistema no hay /proc, no se toca nada, y el peor caso es el de siempre. */
function criasDe(pid) {
  let padres;
  try { padres = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d)).map(d => {
    try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      /* `pid (comm) estado ppid ...`, y `comm` puede llevar espacios y parentesis:
         se corta por el ULTIMO `)`, que es el unico sitio fiable. */
      return [+d, +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]]; } catch (e) { return null; }
  }).filter(Boolean); } catch (e) { return []; }          // sin /proc no se hace nada
  const out = [], cola = [pid];
  while (cola.length) { const q = cola.shift();
    for (const [hijo, padre] of padres) if (padre === q && hijo !== pid) { out.push(hijo); cola.push(hijo); } }
  return out;
}

const tCierre = Date.now();
const crias = criasDe(process.pid);
await conPrisa(browser.close(), 5000, 'browser.close');
/* De dentro hacia fuera, para que nadie reparente a un huerfano por el camino. */
let matados = 0;
for (const pid of crias.reverse()) { try { process.kill(pid, 'SIGKILL'); matados++; } catch (e) { } }
console.log(`   browser.close: +${desde(tCierre)} s  (total ${desde(T0)} s)` +
            (matados ? `  [${matados} proceso(s) del navegador rematados]` : ''));
console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
