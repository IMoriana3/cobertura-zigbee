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
const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const BASE = process.env.BASE || 'http://127.0.0.1:8100';
const EXEC = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
let ok = 0, ko = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

/* Dos perfiles distintos a propósito: El Burgo lleva PTZ y módulo FV en la HSU;
   Ayora no lleva módulo (`hsu.pv:false` en su layout) y trae 10 estaciones. */
const PLANTAS = [
  /* `rejilla`: si esa planta TIENE retícula de apoyos medida en su layout. El
     Burgo la tiene (Tierras.dwg); Ayora no. Va aquí y no se deduce de la página:
     preguntándole a la página, quitarle la retícula a El Burgo pasaba en verde
     —el banco se conformaba con que cayera en la genérica— y esa es justo la
     regresión que hay que cazar. */
  { q: 'planta=elburgo',                       nom: 'El Burgo', pv: true,  ptz: true,  rejilla: true },
  { q: 'planta=ayora&cotas=levantamiento',     nom: 'Ayora',    pv: false, ptz: false, rejilla: false },
];

const SONDA = `(() => {
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
for (const pl of PLANTAS) {
  /* Una pestaña NUEVA por planta: la escena anterior sigue renderizando y con
     una sola pestaña la segunda carga se queda sin tiempo. */
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  page.setDefaultTimeout(120000);
  /* Las teselas de satélite salen a internet; en CI no hay salida y el cargador
     se quedaría esperando. Se sirven en blanco: no entran en ninguna comprobación. */
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => {
    const u = route.request().url();
    if (/\.(png|jpg|jpeg|webp)|GetTile|MapServer|wmts/i.test(u))
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/terreno.html?' + pl.q, { waitUntil: 'load', timeout: 120000 });
  let listo = false;
  for (let i = 0; i < 90 && !listo; i++) {
    listo = await page.evaluate(() => typeof gwMasts !== 'undefined' && gwMasts && gwMasts.length > 0 && !!bosGroup);
    if (!listo) await page.waitForTimeout(1000);
  }
  if (!listo) { check(pl.nom + ': la escena se monta', false, 'no llegó a montarse'); await page.close(); continue; }
  await page.waitForTimeout(1200);
  const s = await page.evaluate(SONDA);

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
  await page.close();
}

await browser.close();
console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
