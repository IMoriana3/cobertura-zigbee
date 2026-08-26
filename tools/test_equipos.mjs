// La NCU y la HSU de Cobertura 3D, después de sacarlas a `equipos.js`.
//
// El modelo de los dos equipos dejó de estar escrito dentro de `terreno.html` y
// pasó al módulo que comparte con el simulador de cobertura RF. Un cambio así
// tiene dos maneras de salir mal, y las dos pasan calladas:
//
//   1. que la geometría se MUEVA. Aquí se comprueban las cotas que importan
//      contra el plano: el poste de la NCU (2,95 m, DR_NCU_v0) con su armario
//      415×515×230 a la altura de servicio y el látigo en la CABEZA; la torre de
//      la HSU (8 m, FTR.24.00145_5_C) con su ultrasónico, sus dos látigos y —si
//      la planta lo lleva— su módulo FV. Y que haya UNA por cada NCU/HSU del
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
//   python3 -m http.server 8100        (en otra terminal)
//   node tools/test_equipos.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8100';
const EXEC = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
let ok = 0, ko = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

/* Dos perfiles distintos a propósito: El Burgo lleva PTZ y módulo FV en la HSU;
   Ayora no lleva módulo (`hsu.pv:false` en su layout) y trae 10 estaciones. */
const PLANTAS = [
  { q: 'planta=elburgo',                       nom: 'El Burgo', pv: true,  ptz: true },
  { q: 'planta=ayora&cotas=levantamiento',     nom: 'Ayora',    pv: false, ptz: false },
];

const SONDA = `(() => {
  const D = Equipos.DIMS;
  /* Caja envolvente SOLO de mallas: la etiqueta del equipo es un sprite y
     setFromObject la mete dentro, así que el alto salía con 1,7 m de aire. */
  const bb = o => { const b = new THREE.Box3();
    o.traverse(n => { if (n.isMesh) b.expandByObject(n); });
    return { min: b.min.toArray(), max: b.max.toArray() }; };
  // las HSU son los grupos hijos de bosGroup con un toro (el aro del piranómetro)
  const hsus = [];
  bosGroup.children.forEach(c => {
    let toro = false, mallas = 0, pv = false;
    c.traverse(o => {
      if (o.geometry && o.geometry.type === 'TorusGeometry') toro = true;
      if (o.isMesh) mallas++;
      const p = o.geometry && o.geometry.parameters;
      if (p && p.width !== undefined && Math.abs(p.width - (D.hsuPvW + 0.02)) < 1e-9) pv = true;
    });
    if (toro && mallas > 50) hsus.push({ mallas, pv, bb: bb(c), y: c.position.y });
  });
  return {
    equipos: Equipos.VERSION,
    hsus, nMeteo: (LAYOUT.meteo || []).length,
    ncus: gwMasts.map(g => ({ mallas: (() => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; })(), bb: bb(g) })),
    nGw: GWS.length,
    antNcu: D.ncuAntY, antHsu: D.hsuAntY, mastNcu: D.ncuMastH, torreHsu: D.hsuTowerH,
    // el bosque tiene que llegar ENTERO: si buildBOS revienta a medias, esto se queda corto
    hijosBos: bosGroup.children.length,
  };
})()`;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64');

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
  check(pl.nom + ': buildBOS termina y planta TODAS las estaciones del layout',
        s.hsus.length === s.nMeteo, s.hsus.length + ' de ' + s.nMeteo);
  check(pl.nom + ': una NCU por cada una del layout', s.ncus.length === s.nGw,
        s.ncus.length + ' de ' + s.nGw);

  // --- NCU: cotas del plano DR_NCU_v0 ---
  if (s.ncus.length) {
    const n = s.ncus[0], alto = n.bb.max[1] - n.bb.min[1];
    check(pl.nom + ': la NCU son 17 piezas', n.mallas === 17, n.mallas);
    check(pl.nom + ': el poste de la NCU mide 2,95 m', near(s.mastNcu, 2.95, 1e-9), s.mastNcu);
    check(pl.nom + ': el látigo de la NCU corona el poste (3,15 m)',
          near(s.antNcu, 3.15, 1e-9) && alto > 3.3 && alto < 3.5, s.antNcu + ' / alto ' + alto.toFixed(3));
  }

  // --- HSU: cotas del plano FTR.24.00145_5_C ---
  if (s.hsus.length) {
    const h = s.hsus[0], alto = h.bb.max[1] - h.bb.min[1];
    check(pl.nom + ': la torre de la HSU mide 8 m', near(s.torreHsu, 8.0, 1e-9), s.torreHsu);
    check(pl.nom + ': la cabeza de la HSU queda sobre los 8 m', alto > 8.4 && alto < 8.7, alto.toFixed(3));
    check(pl.nom + ': los látigos de la HSU, a 8,33 m', near(s.antHsu, 8.33, 1e-9), s.antHsu);
    check(pl.nom + ': módulo FV ' + (pl.pv ? 'SÍ' : 'NO') + ' (lo dice el layout, no el nombre de la planta)',
          h.pv === pl.pv, 'pv=' + h.pv);
    check(pl.nom + ': la HSU son ' + (pl.pv ? 122 : 118) + ' piezas',
          h.mallas === (pl.pv ? 122 : 118), h.mallas);
    check(pl.nom + ': todas las estaciones se montan igual',
          s.hsus.every(x => x.mallas === h.mallas), s.hsus.map(x => x.mallas).join(','));
  }
  await page.close();
}

await browser.close();
console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
