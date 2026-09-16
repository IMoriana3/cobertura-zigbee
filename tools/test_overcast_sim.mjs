/* QA del simulador de overcast (overcast.html) — sin navegador.
   Uso:  node tools/test_overcast_sim.mjs

   a) el bloque FÍSICA PURA se extrae y se ejecuta en Node: corre la MISMA
      runPhysicsQA() que el botón «Verificar» de la página (los contratos de
      test_diffuse_policies.py del core: flat entra en overcast, continuous
      es techo paso a paso, confirm/dwell del poa_switch, invarianza de
      resolución 5/10/15 min, gobierno de DiffuseConfig, huecos de meteo,
      lazo deadband+slew, día claro sin pérdidas, omInterp);
   b) estáticos: la física es OFFLINE de verdad (sin scripts/estilos de CDN —
      Open-Meteo es un fetch de DATOS opcional, no una dependencia de código)
      y los canónicos por defecto espejan los del core (pitch 6.00 ·
      colector 2.382 · GCR 0.397 · θmáx 55 · deadband 1.0 · slew 0.17 ·
      confirm 30 · dwell 90 · ratios 1.02) — si el core los cambia, aquí se ve. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'overcast.html'), 'utf-8');

let N = 0, FAIL = 0;
function t(name, fn) {
  N++;
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + ' — ' + e.message); }
}

console.log('estático');
t('sin dependencias externas de código: ni http(s) en <script src>/<link href>', () => {
  const m = html.match(/<script[^>]+src=["']https?:|<link[^>]+href=["']https?:/g);
  if (m) throw new Error('carga remota: ' + m.join(' · '));
});
t('canónicos del core en los defaults: pitch 6.00 · colector 2.382 · GCR 0.397 · θmáx 55', () => {
  if (!/id="pitch"[^>]*value="6\.00"/.test(html)) throw new Error('pitch ≠ 6.00');
  if (!/id="cw"[^>]*value="2\.382"/.test(html)) throw new Error('colector ≠ 2.382');
  if (!/id="gcr"[^>]*value="0\.397"/.test(html)) throw new Error('GCR ≠ 0.397');
  if (!/id="maxang"[^>]*value="55"/.test(html)) throw new Error('θmáx ≠ 55');
});
t('el coste de maniobra está en la tabla del día, con sus tres columnas y la batería', () => {
  for (const col of ['movimientos', 'recorrido °', '°/mov', 'motor Wh/día', '% batería gastada'])
    if (!html.includes('>' + col + '<')) throw new Error('falta la columna «' + col + '» en la tabla del día');
  // «% batería» a secas no decía si se gasta o se ahorra, y «% difusa activa»
  // contaba cosas distintas en cada fila sin avisar: las dos cabeceras llevan
  // ahora el sentido dentro, y esto impide que vuelvan a quedarse a medias
  if (/>% batería<|>% difusa activa</.test(html))
    throw new Error('cabecera ambigua: hay que decir si el % se gasta o se ahorra, y qué se cuenta como «activa»');
  // el selector por defecto es el AJUSTE DE FLOTA, el único de los tres que cobra
  // cada arranque: con las bandas (escalón) o con la curva (sin término fijo), la
  // columna de movimientos podría doblarse sin mover la factura
  if (!/id="motmod"[\s\S]{0,120}value="ajuste" selected/.test(html))
    throw new Error('el modelo de motor por defecto no es el ajuste de flota');
  if (!/id="battwh"[\s\S]{0,120}value="153\.6" selected/.test(html))
    throw new Error('la batería por defecto no es 153,6 Wh (6 Ah × 25,6 V)');
  // y el CSV tiene que bajar lo mismo que enseña la pantalla, o no es auditable
  for (const c of ['movimientos', 'motor_wh', 'motor_min', 'pct_bateria'])
    if (!html.includes(c)) throw new Error('el CSV no exporta ' + c);
});
t('INFORME DEL EMPLAZAMIENTO: existe, sale de lo ya calculado y termina en los límites declarados', () => {
  /* Mismo patrón que el informe de backtracking.html. Lo que esto fija no es el
     texto sino la ESTRUCTURA y, sobre todo, que el documento siga llevando sus
     límites: un informe que se enseña a un tercero sin decir dónde deja de valer
     es peor que no tener informe. Y que no invente física: todo sale de SIM. */
  if (!/id="informebtn"/.test(html)) throw new Error('falta el botón del informe');
  if (!/function informeHTML\(\)/.test(html)) throw new Error('falta informeHTML()');
  const inf = html.slice(html.indexOf('function informeHTML'), html.indexOf('function abrirInforme'));
  for (const sec of ['Emplazamiento, planta y configuración', 'El cielo del día',
                     'Resumen del día, política a política', 'Cada política: cómo decide',
                     'Coste de maniobra', 'Diario de decisiones', 'Validación',
                     'Método y límites declarados'])
    if (!inf.includes(sec)) throw new Error('el informe no lleva la sección «' + sec + '»');
  // los límites que la auditoría obligó a declarar, y que no pueden caerse
  for (const [lim, porque] of [['cota superior', 'los Wh absolutos no están calibrados'],
                               ['no es comparable entre filas', 'el % activa cuenta cosas distintas'],
                               ['desgaste', 'no hay modelo que lo convierta en intervalo de servicio'],
                               ['no es el motor bancable', 'la POA no es energía AC']])
    if (!new RegExp(lim, 'i').test(inf)) throw new Error('el informe ya no declara: ' + porque);
  // y las cinco políticas más la cota tienen que tener ficha propia
  const ex = html.slice(html.indexOf('const EXPLICA_POL'), html.indexOf('function informeHTML'));
  for (const k of ['pvlib', 'diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch', '__aniso'])
    if (!new RegExp('\\b' + k + '\\s*:\\s*\\{').test(ex)) throw new Error('EXPLICA_POL sin ficha para ' + k);
  for (const campo of ['como:', 'optimiza:', 'criterio:'])
    if ((ex.match(new RegExp(campo, 'g')) || []).length < 6)
      throw new Error('alguna ficha de EXPLICA_POL no declara «' + campo + '»');
  // el diario del informe y el de pantalla salen de la MISMA pieza
  if (!/function diarioRows\(/.test(html)) throw new Error('el diario no está factorizado: pantalla e informe pueden divergir');
  if ((html.match(/diarioRows\(/g) || []).length < 3)
    throw new Error('diarioRows no lo usan las dos vistas');
});
t('el GCR es readonly (derivado = ancho/pitch, regla del core: no es un input)', () => {
  if (!/id="gcr"[^>]*readonly/.test(html)) throw new Error('GCR editable');
});
t('DiffuseConfig del core en los defaults: ratios 1.02/1.00 · confirm 30 · dwell 90 · GHI mín 50', () => {
  if (!/id="fratio"[^>]*value="1\.02"/.test(html)) throw new Error('flat_enter_ratio ≠ 1.02');
  if (!/id="senter"[^>]*value="1\.02"/.test(html)) throw new Error('poa_switch_enter ≠ 1.02');
  if (!/id="sexit"[^>]*value="1\.00"/.test(html)) throw new Error('poa_switch_exit ≠ 1.00');
  if (!/id="confirm"[^>]*value="30"/.test(html)) throw new Error('confirm ≠ 30 min');
  if (!/id="dwell"[^>]*value="90"/.test(html)) throw new Error('dwell ≠ 90 min');
  if (!/id="ghimin"[^>]*value="50"/.test(html)) throw new Error('ghi_min ≠ 50');
});
t('lazo de control canónico: deadband 1.0° · slew 0.17°/s', () => {
  if (!/id="deadband"[^>]*value="1\.0"/.test(html)) throw new Error('deadband ≠ 1.0');
  if (!/id="slew"[^>]*value="0\.17"/.test(html)) throw new Error('slew ≠ 0.17');
});
t('stow nocturno del proyecto en convención TCU: −5° (5° al este; la UI entera va con − = este)', () => {
  if (!/id="stow"[^>]*value="-5"/.test(html)) throw new Error('stow default ≠ −5');
  if (!/function tcuDeg\(/.test(html)) throw new Error('sin conversor de convención tcuDeg');
});
t('plantas reales: selector con TODA la cartera con layout, carga por fetch y vuelta a sintética', () => {
  if (!/id="realplant"/.test(html)) throw new Error('falta el selector de planta real');
  for (const p of ['ayora', 'sanjose', 'elburgo', 'fayon', 'paramo', 'tunez', 'bagnarelli'])
    if (!html.includes('value="' + p + '"')) throw new Error('falta la planta ' + p);
  if (!/_layout\.json/.test(html)) throw new Error('no carga el layout real');
  if (!/function buildReal3D/.test(html)) throw new Error('sin escena de planta real');
  if (!/Seguidor\.instancePlan/.test(html)) throw new Error('la planta real no usa el instanciado de los cobertura 3D');
});
t('EL ACCIONAMIENTO LO DICE EL LAYOUT, no REALMETA: bifila careado contra geometria.bifila', () => {
  /* Bagnarelli figuraba `bifila:false` —y esta prueba lo EXIGÍA, fijando el valor
     malo— porque el dato se copió del sim de BT, que lo dedujo de un `filaZ 0`
     que el propio layout ya había corregido: «las mesas forman 8 líneas a 5,50 m,
     agrupadas de dos en dos por seguidor … la cartera lo dice también: trk_bi 17,
     trk_mono 0». Dos piezas mirando a fuentes distintas, con una prueba clavando
     la equivocada. Ahora no se fija ningún literal: se lee el layout y se exige
     que REALMETA lo siga. Si mañana se remide otra planta, esto lo caza. */
  const meta = html.slice(html.indexOf('const REALMETA'), html.indexOf('const REALMETA') + 800);
  let careadas = 0;
  for (const p of ['ayora', 'sanjose', 'elburgo', 'fayon', 'paramo', 'tunez', 'bagnarelli']) {
    const f = path.join(ROOT, p + '_layout.json');
    if (!fs.existsSync(f)) continue;
    const decl = JSON.parse(fs.readFileSync(f, 'utf-8')).geometria?.bifila;
    if (decl === undefined) continue;                 // planta sin remedir: nada que carear
    const esperado = (decl === true) || /^s[ií]/i.test(String(decl));
    const m = new RegExp(p + '\\s*:\\s*\\{\\s*bifila\\s*:\\s*(true|false)').exec(meta);
    if (!m) throw new Error('REALMETA no declara bifila para ' + p);
    if ((m[1] === 'true') !== esperado)
      throw new Error(p + ': el layout dice bifila=' + esperado + ' y REALMETA dice ' + m[1]);
    careadas++;
  }
  if (careadas < 3) throw new Error('solo ' + careadas + ' plantas careadas: el careo dejó de tener alcance');
});
t('la UI NO rotula «FLAT» lo que no es plano: cada política declara su propio estado', () => {
  const meta = html.slice(html.indexOf('const POL_META'), html.indexOf('const POL_ORDER'));
  for (const [pol, mode] of [['diffuse_flat', 'PLANO'], ['diffuse_limited', 'RETENIDO'],
                             ['diffuse_continuous', 'DIFUSA'], ['diffuse_poa_switch', 'PLANO']]) {
    const i = meta.indexOf(pol + ':');
    if (i < 0) throw new Error('POL_META sin ' + pol);
    const linea = meta.slice(i, meta.indexOf('\n', meta.indexOf('ds:', i)));
    if (!linea.includes("mode:'" + mode + "'")) throw new Error(pol + ' debería declarar mode ' + mode);
  }
  // solo las de plano de verdad pueden llevar flat0:true
  if (!/diffuse_limited:[\s\S]{0,120}flat0:false/.test(meta)) throw new Error('limited no puede ser flat0');
  if (!/diffuse_continuous:[\s\S]{0,160}flat0:false/.test(meta)) throw new Error('continuous no puede ser flat0');
  if (!/function stateLabel\(/.test(html)) throw new Error('sin stateLabel: la etiqueta volvería a ser genérica');
});
t('las 5 políticas del core con sus nombres exactos en el panel', () => {
  for (const nm of ['pvlib', 'diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch'])
    if (!html.includes("'" + nm + "'") && !html.includes('"' + nm + '"'))
      throw new Error('falta la política ' + nm);
});
t('escena 3D con las libs LOCALES del repo (three.min.js + OrbitControls + seguidor.js), no CDN', () => {
  if (!/<script src="lib\/three\.min\.js">/.test(html)) throw new Error('sin lib/three.min.js');
  if (!/<script src="lib\/OrbitControls\.js">/.test(html)) throw new Error('sin lib/OrbitControls.js');
  if (!/<script src="seguidor\.js/.test(html)) throw new Error('sin seguidor.js (fuente única del modelo)');
  if (!/id="view3d"/.test(html)) throw new Error('sin contenedor 3D');
});
t('degrada a 2D si THREE/WebGL no están (has3D + try/catch en init3D)', () => {
  if (!/function has3D\(\)/.test(html)) throw new Error('sin guard has3D');
  const init = html.slice(html.indexOf('function init3D'), html.indexOf('function makeLabel'));
  if (!/catch\s*\(/.test(init)) throw new Error('init3D sin try/catch de WebGL');
  if (!/setTab\(false\)/.test(init)) throw new Error('el fallo de WebGL no cae al corte 2D');
});

// ── bloque de física, ejecutado de verdad ────────────────────────────────────
t('cielo por NCU: el modo está en la UI, es no-op por defecto y no finge meteo real por zona', () => {
  if (!/id="zskymode"/.test(html)) throw new Error('falta el selector de modo de cielo zonal');
  if (!/value="frente" selected/.test(html)) throw new Error('el modo por defecto debe seguir siendo el frente');
  if (!/ZSKY\.every\(v => v === null\)|ZSKY\.every\(v=>v===null\)/.test(html))
    throw new Error('activar el modo sin tocar nada tiene que ser un no-op exacto');
  if (!/ccz\?o\.om:shiftOM/.test(html))
    throw new Error('con cielo por zona la meteo real NO puede retardarse: un punto no trae información espacial');
});

t('pintar por NCU: la tira escribe en el DESTINO elegido, nunca directamente en el cielo de planta', () => {
  if (!/function skyTarget\(\)/.test(html)) throw new Error('falta skyTarget(): sin ámbito, la tira solo pinta la planta');
  if (!/id="skyscope"/.test(html)) throw new Error('falta el selector de a quién se pinta');
  if (/\bCC\[b\]\s*=/.test(html)) throw new Error('el pincel sigue escribiendo en CC directamente: pintaría la planta estando en una NCU');
  if (!/for \(const T of skyTargets\(\)\)|for\(const T of skyTargets\(\)\)/.test(html))
    throw new Error('el pincel no recorre los destinos seleccionados');
  if (!/T\.set\(ser\)/.test(html)) throw new Error('el pincel no pasa por el destino');
  if (!/v\.cc\?v\.cc\.slice\(\)/.test(html)) throw new Error('zskySeries no sabe leer una zona pintada a mano');
  // «aplicar preset» y «despejar» tienen que respetar el mismo destino
  const apply = html.slice(html.indexOf("$('skyapply').onclick"), html.indexOf("$('skyclear').onclick"));
  if (!/skyTargets\(\)/.test(apply)) throw new Error('«aplicar preset» ignora el ámbito y toca siempre la planta');
  const clear = html.slice(html.indexOf("$('skyclear').onclick"), html.indexOf("$('skyclear').onclick") + 400);
  if (!/skyTargets\(\)/.test(clear) || !/new Array\(288\)/.test(clear)) throw new Error('«despejar» ignora el ámbito');
});

t('el nombre de la app es UNO: <title> y <h1> dicen lo mismo', () => {
  // en una semana se renombró tres veces y el panel acabó llamándola de una
  // manera y la página de otra; esto lo fija dentro del fichero
  // sin comentarios: la propia nota de arriba menciona <title> y <h1>
  const limpio = html.replace(/<!--[\s\S]*?-->/g, '');
  const t1 = (limpio.match(/<title>([^<—]+)/) || [])[1];
  const h1 = (limpio.match(/<h1>([^<]+)/) || [])[1];
  if (!t1 || !h1) throw new Error('no encuentro el título o el h1');
  const norm = x => x.trim().replace(/\s+/g, ' ');
  if (norm(t1) !== norm(h1))
    throw new Error('la pestaña dice «' + norm(t1) + '» y la página «' + norm(h1) + '»');
  if (!/NOMBRE CANÓNICO DE LA APP/.test(html))
    throw new Error('falta la nota que declara el nombre canónico y dónde más vive');
});

t('el CSV de auditoría es reproducible: lleva la configuración entera y saca la POA del θ EJECUTADO', () => {
  const i = html.indexOf('function buildDayCSV()');
  if (i < 0) throw new Error('no hay export CSV');
  const fn = html.slice(i, html.indexOf('function descargar(', i));
  // sin estos bloques, el que recibe el fichero no puede recalcular nada
  for (const blq of ['[EMPLAZAMIENTO]', '[GEOMETRÍA]', '[LAZO DE CONTROL]',
                     '[DIFFUSE CONFIG', '[METEO]', '[RESUMEN DEL DÍA'])
    if (!fn.includes(blq)) throw new Error('la cabecera no declara ' + blq);
  for (const k of ['slew_deg_s', 'deadband_deg', 'resolucion_decision_min', 'resolucion_actuador_min',
                   'confirm_min', 'dwell_min', 'ghi_min_w_m2', 'gcr', 'theta_max_deg'])
    if (!fn.includes(k)) throw new Error('falta el parámetro ' + k + ': el fichero no sería reproducible');
  // la POA tiene que salir del EJECUTADO (poaF), no de la consigna
  if (!/r\.poaF\[i\]/.test(fn)) throw new Error('la POA del CSV no sale del θ ejecutado');
  // y los ángulos, en convención TCU, como todo lo que ve el usuario
  if (!/tcuDeg\(r\.execF\[i\]\)/.test(fn) || !/tcuDeg\(r\.consF\[i\]\)/.test(fn))
    throw new Error('los ángulos del CSV no van en convención TCU');
  if (!/NEGATIVO = ESTE/.test(fn)) throw new Error('el CSV no declara la convención de signos');
  // la rejilla exportada es la FINA: al minuto, no la de decisión
  if (!/dayF\.n/.test(fn)) throw new Error('el CSV no se exporta en la rejilla del actuador');
});

t('la cota anisótropa paga el actuador como las demás: decide en su ciclo y ejecuta con el lazo', () => {
  const i = html.indexOf("if($('anisoOn').checked)");
  if (i < 0) throw new Error('no hay cota anisótropa en la UI');
  const blq = html.slice(i, i + 900);
  if (!/optimoAniso\(day,\s*thN/.test(blq))
    throw new Error('la cota decide en la rejilla FINA: sería un techo con actuador instantáneo, no comparable');
  if (!/execOnFineGrid\(o\.theta[^)]*loop\)/.test(blq))
    throw new Error('la cota no pasa por el lazo: su POA no sería comparable con las políticas');
  if (!/poaSeries\(dayF,\s*execF\)/.test(blq))
    throw new Error('la POA de la cota no sale del θ ejecutado');
  if (!/NO es del core/.test(html))
    throw new Error('la cota tiene que declarar que NO es una política del core');
});

const i0 = html.indexOf('FÍSICA PURA');
const i1 = html.indexOf('/* FIN-FÍSICA');
if (i0 < 0 || i1 < 0) { console.error('no encuentro los delimitadores FÍSICA PURA / FIN-FÍSICA'); process.exit(1); }
const j0 = html.lastIndexOf('/*', i0);
const src = html.slice(j0, i1);

/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
            + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');

const sandbox = new Function(sol + '\n' + src + `
  return { runPhysicsQA, solarPos, singleaxis, trueTrackAngle, clearskyIneichen, cloudToIrr,
           poaTracker, omInterp, buildDay, thetaBaselineDay, clampBT, poaSeries, POLICIES,
           applyControlLoop, dayMetrics, canonScenario, canonCC, CANON, DCFG_DEFAULT,
           shiftCC, shiftOM, zonalRun, execOnFineGrid, EXPLAIN, slewLimit1,
           skyPresetSeries, skyNubeCorta, optimoAniso,
           motorMetrics, motorW, whPorGrado, MOTOR_BANDAS, AJUSTE_FLOTA, MOTOR_MA, MOTOR_ANG,
           TCU_IDLE_W, BATT_WH_DEF, MOVE_EPS };`);
const F = sandbox();

console.log('física (la misma QA que el botón de la página)');
for (const r of F.runPhysicsQA()) {
  N++;
  if (r.ok) console.log('  ✓ ' + r.name);
  else { FAIL++; console.error('  ✗ ' + r.name + ' — ' + r.err); }
}


/* ── el sol, de `sol.js` y de ningún otro sitio ─────────────────────────────
   Había TRES copias de la posición NOAA y del `singleaxis`: aquí, en la otra
   página y en el módulo. Esto exige que no vuelva a haber una cuarta. */
t('el sol se carga del módulo, no está escrito en la página', () => {
  if (!/<script src="sol\.js/.test(html)) throw new Error('la página no carga sol.js');
  const propias = (html.match(/\nfunction (solarPos|singleaxis|trueTrackAngle|refraction)\s*\(/g) || []);
  if (propias.length) throw new Error('copia propia de: ' + propias.join(' ').replace(/\n/g, ''));
});
t('y da lo mismo que el módulo, con la refracción que esta página necesita', () => {
  const S = new Function(fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + ';return Sol;').call({});
  for (const [lat, lon] of [[41.58, -0.80], [-34.6, -58.4]])
    for (const h of [4, 6, 12, 18, 21]) {
      const ms = Date.UTC(2026, 5, 21, h, 0, 0);
      const a = F.solarPos(ms, lat, lon), b = S.solarPos(ms, lat, lon, { refract: true });
      if (Math.abs(a.elev - b.elev) > 1e-12 || Math.abs(a.az - b.az) > 1e-12 || Math.abs(a.zen - b.zen) > 1e-12)
        throw new Error(lat + ' ' + h + 'h: ' + JSON.stringify([a.elev, b.elev]));
      const p = { axisTilt: 2, axisAz: 180, maxAngle: 55, backtrack: true, gcr: 0.397, crossAxisTilt: 1.5 };
      const x = F.singleaxis(a.zen, a.az, p), y = S.singleaxis(b.zen, b.az, p);
      if (!(isNaN(x) && isNaN(y)) && Math.abs(x - y) > 1e-12) throw new Error('singleaxis ' + x + ' vs ' + y);
    }
});


/* ── el cielo claro, de `irradiancia.js` y de ningún otro sitio ─────────────
   `dniExtra`, `airmassKY`, `clearskyIneichen` y `surfaceOrient` estaban en las
   DOS páginas, y no era solo duplicación: overcast había corregido `dniExtra` a
   Spencer/pvlib y backtracking se quedó con la fórmula simple. Esto exige que no
   vuelva a haber una copia local que se separe. */
t('el cielo claro se carga del módulo, no está escrito en la página', () => {
  if (!/<script src="irradiancia\.js/.test(html)) throw new Error('la página no carga irradiancia.js');
  const propias = (html.match(/\nfunction (dniExtra|airmassKY|clearskyIneichen|surfaceOrient)\s*\(/g) || []);
  if (propias.length) throw new Error('copia propia de: ' + propias.join(' ').replace(/\n/g, ''));
});
t('y `dniExtra` es Spencer con 1366,1, que es lo que usa pvlib', () => {
  const I = new Function(fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8') + ';return Irr;').call({});
  /* Los tres días con los que se verificó contra pvlib al microvatio. La fórmula
     simple que había en backtracking se desvía ~1 W/m², y eso entra en Perez por
     delta = DHI·airmass/dni_extra. */
  const esperado = { 1: 1413.981805, 172: 1321.623593, 355: 1412.708564 };
  for (const [doy, v] of Object.entries(esperado)) {
    const q = I.dniExtra(+doy);
    if (Math.abs(q - v) > 1e-5) throw new Error('doy ' + doy + ': ' + q.toFixed(6) + ' vs ' + v);
    const simple = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * doy / 365));
    if (Math.abs(q - simple) < 0.2) throw new Error('doy ' + doy + ': coincide con la fórmula SIMPLE');
  }
  if (typeof F.dniExtra === 'function' && Math.abs(F.dniExtra(172) - I.dniExtra(172)) > 1e-9)
    throw new Error('la página no usa la del módulo');
});
t('y la masa de aire es ABSOLUTA: lleva la presión de la altitud', () => {
  const I = new Function(fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8') + ';return Irr;').call({});
  /* Sin el factor de presión el GHI se va casi medio por ciento — se cayó al
     transcribir el módulo y lo cazó la huella antes de entrar. */
  const a = I.clearskyIneichen(30, 172, 0, 3.5).ghi, b = I.clearskyIneichen(30, 172, 1500, 3.5).ghi;
  if (!(b > a)) throw new Error('la altitud no cambia el GHI: falta la presión');
  const q = I.clearskyIneichen(30, 172, 300, 3.5).ghi;
  // v1.57 (auditoría H4): sin el realce de Perez, como pvlib por defecto — antes 867,977998 con el realce siempre activo
  if (Math.abs(q - 857.508108) > 1e-4) throw new Error('GHI(30°, doy 172, 300 m) = ' + q.toFixed(6));
});

console.log('extra (solo tiene sentido en Node: coherencia con el core y aristas)');
t('CANON espeja las constantes canónicas de tracker.py (salvo stow: dato de proyecto)', () => {
  const C = F.CANON;
  if (C.pitch !== 6.00 || C.cw !== 2.382 || C.gcr !== 0.397) throw new Error('geometría');
  if (C.maxAngle !== 55 || C.slewDegS !== 0.17 || C.deadbandDeg !== 1.0) throw new Error('mecánica');
  // el core aún dice CANONICAL_NIGHT_STOW_DEG=0; el proyecto duerme a 5° ESTE
  // (usuario 2026-08, en la TCU se escribe −5). Si el core adopta el dato,
  // este test debe seguirle.
  if (C.nightStowDeg !== 5) throw new Error('night stow ≠ 5° este: ' + C.nightStowDeg);
});
t('DCFG_DEFAULT espeja DiffuseConfig del core (schema 2.1.0)', () => {
  const D = F.DCFG_DEFAULT;
  if (D.ghiMin !== 50 || D.flatEnterRatio !== 1.02 || D.limitedHoldRatio !== 1.0) throw new Error('ratios');
  if (D.swEnterRatio !== 1.02 || D.swExitRatio !== 1.00) throw new Error('switch ratios');
  if (D.confirmMin !== 30 || D.dwellMin !== 90) throw new Error('ventanas');
  if (D.alphas.join(',') !== '0,0.25,0.5,0.75,1') throw new Error('alphas');
});
t('el escenario canónico reproduce los tramos del test del core (múltiplos de 15 min)', () => {
  const cc = F.canonCC();
  const on = [];
  for (let i = 0; i < 288; i++) if (cc[i] === 1) on.push(i * 5);
  const spans = [[360, 375], [420, 570], [600, 660], [840, 1020]];
  let n = 0;
  for (const [a, b] of spans) n += (b - a) / 5;
  if (on.length !== n) throw new Error('bines overcast: ' + on.length + ' ≠ ' + n);
  for (const m of on)
    if (!spans.some(([a, b]) => m >= a && m < b)) throw new Error('bin fuera de tramo: ' + m);
});
t('determinismo: dos pasadas del pipeline dan bit a bit lo mismo', () => {
  const mk = () => {
    const day = F.canonScenario(10);
    const thN = F.thetaBaselineDay(day);
    const poaN = F.poaSeries(day, thN);
    const r = F.POLICIES.diffuse_poa_switch(day, thN, poaN, F.DCFG_DEFAULT);
    return JSON.stringify([r.theta, r.flag]);
  };
  if (mk() !== mk()) throw new Error('no determinista');
});
t('métricas: un día overcast total tiene menos recorrido con poa_switch que la baseline', () => {
  const day = F.buildDay({ lat: 40.4, lon: -3.7, dateStr: '2024-06-21', tz: 0, altM: 600, TL: 2.5,
    dtMin: 10, albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, cc: new Array(288).fill(0.95) });
  const thN = F.thetaBaselineDay(day);
  const poaN = F.poaSeries(day, thN);
  const r = F.POLICIES.diffuse_poa_switch(day, thN, poaN, F.DCFG_DEFAULT);
  const mB = F.dayMetrics(day, thN, new Array(day.n).fill(false), poaN);
  const mS = F.dayMetrics(day, r.theta, r.flag, F.poaSeries(day, r.theta));
  if (!(mS.travelDeg < mB.travelDeg)) throw new Error('flat no ahorra maniobra: ' + mS.travelDeg + ' vs ' + mB.travelDeg);
  if (!(mS.poaWh > mB.poaWh)) throw new Error('flat no gana POA en overcast total');
});

// ── COSTE DE MANIOBRA: movimientos, grados y batería ────────────────────────
// El modelo de motor NO se inventa en el simulador: es medida de campo espejada
// de solargpt_core/motor_energy.py y de gemelo-digital/sim/fisica.js. Estas
// pruebas fijan las constantes (si el core las mueve, aquí se ve) y los dos
// invariantes que hacen que la columna signifique algo: qué cuenta como UN
// movimiento, y que trocear el mismo recorrido salga MÁS caro.
console.log('coste de maniobra (motor y batería)');
t('constantes del motor: espejan la medida de campo, no un número redondeado', () => {
  const b = F.MOTOR_BANDAS.map(x => x.whDeg);
  const esp = [0.2262, 0.0880, 0.0701, 0.0653];      // 14.759 maniobras, El Burgo
  if (b.length !== 4) throw new Error('bandas: ' + b.length + ' ≠ 4');
  b.forEach((v, i) => { if (Math.abs(v - esp[i]) > 1e-9) throw new Error('banda ' + i + ': ' + v + ' ≠ ' + esp[i]); });
  // la curva I(θ) del ensayo, en sus dos extremos, y su tensión
  if (F.MOTOR_MA[0] !== 1500 || F.MOTOR_MA[F.MOTOR_MA.length - 1] !== 2800)
    throw new Error('curva I(θ): extremos ' + F.MOTOR_MA[0] + '/' + F.MOTOR_MA[F.MOTOR_MA.length - 1] + ' ≠ 1500/2800 mA');
  if (F.MOTOR_ANG.length !== F.MOTOR_MA.length) throw new Error('curva I(θ): ángulos y corrientes descuadran');
  if (Math.abs(F.motorW(55) - 2.8 * 24) > 1e-9) throw new Error('motorW(55°) ≠ 2800 mA × 24 V');
  if (Math.abs(F.motorW(0) - 1.5 * 24) > 1e-9) throw new Error('motorW(0°) ≠ 1500 mA × 24 V');
  // reposo medido (tcu.py: ni los 5 W viejos ni los 0,45 del otro módulo)
  if (F.TCU_IDLE_W !== 0.64) throw new Error('reposo ' + F.TCU_IDLE_W + ' ≠ 0,64 W');
  if (Math.abs(F.BATT_WH_DEF - 153.6) > 1e-9) throw new Error('batería ≠ 6 Ah × 25,6 V');
  if (F.MOVE_EPS !== 0.05) throw new Error('ε de movimiento ' + F.MOVE_EPS + ' ≠ 0,05° (el _EPS_DEG del core)');
});
t('UNA RAMPA CONTIGUA ES UN MOVIMIENTO, no uno por paso de rejilla', () => {
  // 55° a 1°/paso: el core lo dice explícito — «una rampa de 55° en pasos de 1°
  // es UNA maniobra de 55°, no 55 maniobras de 1°». Contarlo paso a paso metería
  // toda rampa larga en la banda cara y triplicaría la factura.
  const th = [];
  for (let i = 0; i <= 55; i++) th.push(i);
  const m = F.motorMetrics(th, { slewDegS: 0.17, modelo: 'bandas' });
  if (m.moves !== 1) throw new Error('rampa de 55°: ' + m.moves + ' movimientos, debía ser 1');
  if (Math.abs(m.travelDeg - 55) > 1e-9) throw new Error('recorrido ' + m.travelDeg + ' ≠ 55°');
  // y al ser UNA maniobra de 55° cae en la banda ancha, la barata
  if (Math.abs(m.motorWh - 55 * 0.0653) > 1e-9)
    throw new Error('no cobró la banda >5°: ' + m.motorWh + ' ≠ ' + (55 * 0.0653));
});
t('parar entre medias SÍ separa movimientos, y el hueco no inventa recorrido', () => {
  const th = [0, 10, 10, 10, 20, 20, 30];      // tres tramos, dos paradas
  const m = F.motorMetrics(th, { slewDegS: 0.17, modelo: 'bandas' });
  if (m.moves !== 3) throw new Error('tres tramos → ' + m.moves + ' movimientos');
  if (Math.abs(m.travelDeg - 30) > 1e-9) throw new Error('recorrido ' + m.travelDeg + ' ≠ 30°');
});
t('por debajo de ε (0,05°) es ruido de encoder, no una maniobra', () => {
  const th = [0];
  for (let i = 0; i < 200; i++) th.push(th[th.length - 1] + 0.04);   // deriva bajo ε
  const m = F.motorMetrics(th, { slewDegS: 0.17, modelo: 'bandas' });
  if (m.moves !== 0) throw new Error('el ruido cuenta como ' + m.moves + ' maniobras');
  if (m.motorWh !== 0) throw new Error('el ruido consume ' + m.motorWh + ' Wh');
});
// Construye una trayectoria de `n` maniobras de amplitud `amp`, separadas por
// una parada (un paso quieto), para un recorrido total de n·amp.
function tramos(n, amp) {
  const th = [0];
  for (let i = 0; i < n; i++) { th.push(th[th.length - 1] + amp); th.push(th[th.length - 1]); }
  return th;
}
t('TROCEAR EL MISMO RECORRIDO CUESTA MÁS — y SIEMPRE, no solo al cruzar un escalón', () => {
  // ESTA PRUEBA NACIÓ MAL Y POR ESO ESTÁ ESCRITA ASÍ. La primera versión comparaba
  // maniobras de 1° contra 0,5°, que caen en BANDAS DISTINTAS: pasaba en verde con
  // un modelo de bandas que, DENTRO de una banda, no cobra nada por trocear (240°
  // en maniobras de 20° y de 10° daban 15,67 Wh los dos). O sea que confirmaba lo
  // que yo quería en vez de sondear el modelo. Ahora barre amplitudes que caen
  // DENTRO de la misma banda —que es donde el escalón fallaba— y exige monotonía
  // estricta en todo el barrido.
  const REC = 240;                       // todas las amplitudes lo dividen EXACTO,
  const amps = [20, 10, 6, 4, 3, 2.5, 2, 1.5, 1.2, 0.8, 0.6, 0.5];   // o el barrido
  let prev = null;                       // compararía recorridos distintos
  for (const amp of amps) {
    if (Math.abs(REC / amp - Math.round(REC / amp)) > 1e-9)
      throw new Error('amp ' + amp + ' no divide ' + REC + ': el barrido sería injusto');
    const m = F.motorMetrics(tramos(Math.round(REC / amp), amp), { slewDegS: 0.17 });
    if (Math.abs(m.travelDeg - REC) > 1e-6)
      throw new Error('amp ' + amp + ': el barrido no compara el mismo recorrido (' + m.travelDeg + ')');
    if (prev && !(m.motorWh > prev.wh * 1.0001))
      throw new Error('trocear de ' + prev.amp + '° a ' + amp + '° NO encarece: ' +
                      prev.wh.toFixed(2) + ' → ' + m.motorWh.toFixed(2) + ' Wh con ' +
                      prev.moves + ' → ' + m.moves + ' arranques');
    prev = { amp: amp, wh: m.motorWh, moves: m.moves };
  }
  // y el caso que destapó el fallo, explícito: DOBLE de arranques dentro de la
  // misma banda tiene que costar ~un intercepto más por arranque
  const a = F.motorMetrics(tramos(12, 20), { slewDegS: 0.17 });
  const b = F.motorMetrics(tramos(24, 10), { slewDegS: 0.17 });
  if (b.moves !== 2 * a.moves) throw new Error('el caso no dobla los arranques');
  const esperado = (b.moves - a.moves) * 0.0901;
  if (Math.abs((b.motorWh - a.motorWh) - esperado) > 1e-9)
    throw new Error('doblar arranques debía costar ' + esperado.toFixed(3) + ' Wh y cuesta ' +
                    (b.motorWh - a.motorWh).toFixed(3));
});
t('las BANDAS son escalón y por eso no son el modelo por defecto — queda medido, no escondido', () => {
  // No es un fallo del modelo de bandas: es lo que es, la medida en bruto agrupada.
  // Se fija aquí para que nadie lo vuelva a poner por defecto sin enterarse.
  const a = F.motorMetrics(tramos(12, 20), { slewDegS: 0.17, modelo: 'bandas' });
  const b = F.motorMetrics(tramos(24, 10), { slewDegS: 0.17, modelo: 'bandas' });
  if (Math.abs(a.motorWh - b.motorWh) > 1e-9)
    throw new Error('las bandas ya distinguen trocear dentro de una banda: revisar cuál manda');
  if (!/value="ajuste" selected/.test(html))
    throw new Error('el modelo por defecto no es el ajuste de flota, y el escalón volvería a mandar');
});
t('el reparto arranque/giro cuadra con el total, y solo lo publica el modelo que lo tiene', () => {
  const m = F.motorMetrics(tramos(30, 3), { slewDegS: 0.17 });
  if (Math.abs(m.arranqueWh + m.giroWh - m.motorWh) > 1e-12)
    throw new Error('arranque + giro ≠ total');
  if (Math.abs(m.arranqueWh - 30 * 0.0901) > 1e-12) throw new Error('el arranque no son 30 × 0,0901');
  if (Math.abs(m.giroWh - 90 * 0.0447) > 1e-12) throw new Error('el giro no son 90° × 0,0447');
  // los otros dos modelos NO tienen ese reparto: declararlo sería inventarlo
  for (const modelo of ['bandas', 'curva']) {
    const o = F.motorMetrics(tramos(30, 3), { slewDegS: 0.17, modelo: modelo });
    if (o.arranqueWh !== null || o.giroWh !== null)
      throw new Error(modelo + ' publica un reparto arranque/giro que no tiene');
  }
});
t('DIRECTA Y DIFUSA NO VAN SUELTAS: GHI = DNI·cos z + DHI se cierra, y la difusa SUBE al nublarse', () => {
  /* Reportado como «directa (DNI) y difusa (DHI) desacopladas» leyendo el HUD:
     850 + 117 ≠ 855. No lo están — lo que falta al leerlo es el coseno, porque el
     haz llega inclinado y solo aporta su proyección horizontal. Esto fija las dos
     mitades: que el cierre se cumple a precisión de máquina, y que al meter nube
     la difusa CRECE mientras la directa cae (si no creciera, el modelo de nubes
     estaría perdiendo energía por el camino en vez de dispersarla). */
  const mk = cc => F.buildDay({ lat: 41.5763, lon: -0.7981, dateStr: '2026-06-21', tz: 2, altM: 250,
    TL: 3.5, dtMin: 1, albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5, cc: cc });
  const day = mk(new Array(288).fill(0).map((_, b) => b < 150 ? 0 : 0.95));
  let peor = 0;
  for (let i = 0; i < day.n; i++) {
    const r = day.irr[i], cz = Math.max(0, Math.cos(day.zen[i] * Math.PI / 180));
    peor = Math.max(peor, Math.abs(r.ghi - (r.dni * cz + r.dhi)));
    if (r.dhi < -1e-9 || r.dni < -1e-9) throw new Error('irradiancia negativa en el paso ' + i);
  }
  if (!(peor < 1e-9)) throw new Error('el cierre GHI = DNI·cos z + DHI falla por ' + peor.toExponential(2) + ' W/m²');
  // al mismo instante, subir la nubosidad tiene que MOVER las dos a la vez
  let prevDni = Infinity, subioDifusa = false;
  const base = mk(new Array(288).fill(0)).irr[720].dhi;
  for (const c of [0.2, 0.4, 0.6, 0.8, 0.95]) {
    const r = mk(new Array(288).fill(c)).irr[720];
    if (!(r.dni <= prevDni + 1e-9)) throw new Error('la directa no cae al nublarse (cc ' + c + ')');
    prevDni = r.dni;
    if (r.dhi > base) subioDifusa = true;
  }
  if (!subioDifusa) throw new Error('la difusa nunca sube al nublarse: el modelo pierde energía en vez de dispersarla');
  if (prevDni > 1) throw new Error('a cc 0,95 la directa debería estar prácticamente extinguida');
});
t('SUELO GEOMÉTRICO: el recorrido del día no puede bajar del barrido + las dos idas al stow', () => {
  /* La comprobación que faltaba, y la que destapó que los 112,9°/día del careo
     de flota NO son el recorrido del seguidor: están por DEBAJO de este suelo.
     No depende de ningún modelo de motor ni de cómo se defina una maniobra —
     es geometría: si el seguidor llega a θmín y a θmáx y aparca en el stow,
     tiene que recorrer al menos (θmáx−θmín) + |stow−θmáx| + |θmín−stow|.
     Sirve de red contra cualquier regresión que silenciosamente parta el
     recorrido por la mitad, que es el error más caro de esta tabla. */
  const B = { lat: 41.57634, lon: -0.79814, dateStr: '2026-08-16', tz: 2, altM: 250, TL: 3.5,
    albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5, dtMin: 1,
    cc: new Array(288).fill(0) };
  const day = F.buildDay(B);
  const th = F.execOnFineGrid(F.thetaBaselineDay(day), 1, day.n, 1,
                              { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55 });
  const dia = th.filter((v, i) => day.zen[i] < 90);
  const min = Math.min(...dia), max = Math.max(...dia), stow = 5;
  const suelo = (max - min) + Math.abs(stow - max) + Math.abs(min - stow);
  const rec = F.motorMetrics(th, { slewDegS: 0.17 }).travelDeg;
  if (!(rec >= suelo - 1e-6))
    throw new Error('recorrido ' + rec.toFixed(1) + '° por debajo del suelo geométrico ' +
                    suelo.toFixed(1) + '° (θ de ' + min.toFixed(1) + ' a ' + max.toFixed(1) + ', stow ' + stow + ')');
  if (!(suelo > 200)) throw new Error('el suelo salió ' + suelo.toFixed(1) + '°: el día no es de seguimiento pleno');
});
t('careo contra el día de flota POR EL TOTAL, que es lo único no enmascarado', () => {
  /* El careo bueno es contra los 19,2 Wh/día: en careo_motor_flota.py la energía
     se integra sobre TODO el día (V·I·dt sin máscara), mientras que el recorrido
     va enmascarado por motor_state — y por eso 112,9° cae bajo el suelo de
     arriba. Comparar Wh/° contra el campo sería comparar contra un cociente con
     el denominador incompleto. El total, mismo sitio y misma fecha, sí vale.

     EL EXTREMO FINO DEL ABANICO ES 1 MINUTO, y antes era 5. No es una holgura:
     el 5-30 min con el que se escribió este careo era una CONJETURA sobre cada
     cuánto decide la TCU, y la máquina ya está medida — decide cada SEGUNDO
     (dato de campo). Así que el extremo fino tiene que ser lo más fino que
     sostiene esta rejilla, que es el minuto.
     Lo que movió el corte fue portar el ADELANTO AL SOL (la TCU aparca una banda
     más allá de la consigna, así que el paso son dos bandas y hay la mitad de
     arranques). Medido en este mismo día, banda de 1°:

       paso    ley vieja (parar en la consigna)   con adelanto
       30′     12,36 Wh ·  27 arranques           12,49 Wh ·  27
       10′     16,71 Wh ·  73                     17,05 Wh ·  73
        5′     23,13 Wh · 143                     17,94 Wh ·  82
        1′     26,09 Wh · 177                     19,50 Wh · 101

     O sea que el campo (19,2 Wh) lo explicaban DOS combinaciones: la ley vieja
     con un ciclo de 5 min, o el adelanto con el ciclo real. La segunda es la que
     además cuadra con lo que hace la máquina, y al minuto se queda a un 1,6 %.
     El giro apenas se mueve (10,1-10,6 Wh): lo que cambia es el arranque, que es
     donde el número de maniobras se paga. */
  const B = { lat: 41.57634, lon: -0.79814, dateStr: '2026-08-16', tz: 2, altM: 250, TL: 3.5,
    albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5, cc: new Array(288).fill(0) };
  const dayF = F.buildDay({ ...B, dtMin: 1 });
  const wh = dt => {
    const day = F.buildDay({ ...B, dtMin: dt });
    const ex = F.execOnFineGrid(F.thetaBaselineDay(day), dt, dayF.n, 1,
                                { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55 });
    return F.motorMetrics(ex, { slewDegS: 0.17 }).motorWh;
  };
  // el día medido tiene que quedar DENTRO del abanico de rejillas de decisión,
  // del ciclo grueso (30 min) al real (el minuto). Si el modelo se saliera por
  // completo del abanico, dejaría de describir la máquina y habría que ir a
  // buscarlo.
  const lo = wh(30), hi = wh(1);
  if (!(lo < 19.2 && 19.2 < hi))
    throw new Error('19,2 Wh/día de campo fuera del abanico del modelo: ' +
                    lo.toFixed(2) + ' (30′) … ' + hi.toFixed(2) + ' (1′)');
  // y en el extremo REAL la exigencia es más dura que un abanico: el modelo
  // tiene que acertar el día medido, no solo abrazarlo
  if (!(Math.abs(hi / 19.2 - 1) < 0.10))
    throw new Error('al minuto —el ciclo real— el modelo se va un ' +
                    (100 * Math.abs(hi / 19.2 - 1)).toFixed(1) + ' % del día medido (' + hi.toFixed(2) + ' Wh)');
  if (!(Math.abs(wh(10) / 19.2 - 1) < 0.25))
    throw new Error('a 10′ el modelo se va un ' + (100 * Math.abs(wh(10) / 19.2 - 1)).toFixed(0) + ' % del día medido');
});
t('las tres columnas cuadran entre sí: la energía se cobra sobre ESOS grados y ESOS arranques', () => {
  const day = F.buildDay({ lat: 41.5763, lon: -0.7981, dateStr: '2026-06-21', tz: 2, altM: 300, TL: 3.5,
    dtMin: 10, albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5,
    cc: new Array(288).fill(0.95) });
  const dayF = F.buildDay({ lat: 41.5763, lon: -0.7981, dateStr: '2026-06-21', tz: 2, altM: 300, TL: 3.5,
    dtMin: 1, albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5,
    cc: new Array(288).fill(0.95) });
  const thN = F.thetaBaselineDay(day), poaN = F.poaSeries(day, thN);
  const mp = { slewDegS: 0.17, modelo: 'bandas' };
  for (const k of ['diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch']) {
    const r = F.POLICIES[k](day, thN, poaN, F.DCFG_DEFAULT);
    const ex = F.execOnFineGrid(r.theta, day.dtMin, dayF.n, 1, { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55 });
    const met = F.dayMetrics(dayF, ex, r.flag.map(v => !!v), F.poaSeries(dayF, ex), mp);
    const mm = F.motorMetrics(ex, mp);
    // dayMetrics no puede llevar su propio bucle: si divergiera, la tabla
    // enseñaría unos grados y cobraría otros
    if (met.moves !== mm.moves || Math.abs(met.travelDeg - mm.travelDeg) > 1e-12 ||
        Math.abs(met.motorWh - mm.motorWh) > 1e-12)
      throw new Error(k + ': dayMetrics y motorMetrics discrepan');
    // el tiempo de motor es el recorrido a la velocidad del actuador, no otra cosa
    if (Math.abs(met.runMin - met.travelDeg / 0.17 / 60) > 1e-9)
      throw new Error(k + ': los minutos de motor no salen del recorrido y el slew');
    if (!(met.motorWh > 0) || !Number.isFinite(met.motorWh))
      throw new Error(k + ': energía de motor ' + met.motorWh);
  }
});
t('día despejado: ninguna política toca el motor (la primera comprobación que exige el gemelo)', () => {
  const base = { lat: 42.82, lon: -1.60, dateStr: '2026-06-21', tz: 2, altM: 450, TL: 3.5,
    albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5, cc: new Array(288).fill(0) };
  const day = F.buildDay({ ...base, dtMin: 10 }), dayF = F.buildDay({ ...base, dtMin: 1 });
  const thN = F.thetaBaselineDay(day), poaN = F.poaSeries(day, thN);
  const mp = { slewDegS: 0.17, modelo: 'bandas' }, loop = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55 };
  const ref = F.motorMetrics(F.execOnFineGrid(thN, day.dtMin, dayF.n, 1, loop), mp);
  for (const k of ['diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch']) {
    const r = F.POLICIES[k](day, thN, poaN, F.DCFG_DEFAULT);
    const m = F.motorMetrics(F.execOnFineGrid(r.theta, day.dtMin, dayF.n, 1, loop), mp);
    if (m.moves !== ref.moves || Math.abs(m.motorWh - ref.motorWh) > 1e-9)
      throw new Error(k + ' mueve el motor con el cielo limpio: ' + m.moves + '/' + m.motorWh.toFixed(2) +
                      ' vs ' + ref.moves + '/' + ref.motorWh.toFixed(2));
  }
});
t('overcast total: TODAS las políticas de difusa ahorran motor frente a la baseline', () => {
  const base = { lat: 42.82, lon: -1.60, dateStr: '2026-06-21', tz: 2, altM: 450, TL: 3.5,
    albedo: 0.2, axisAz: 0, maxAngle: 55, gcr: 0.397, nightStowDeg: 5, cc: new Array(288).fill(0.95) };
  const day = F.buildDay({ ...base, dtMin: 10 }), dayF = F.buildDay({ ...base, dtMin: 1 });
  const thN = F.thetaBaselineDay(day), poaN = F.poaSeries(day, thN);
  const mp = { slewDegS: 0.17, modelo: 'bandas' }, loop = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55 };
  const ref = F.motorMetrics(F.execOnFineGrid(thN, day.dtMin, dayF.n, 1, loop), mp);
  for (const k of ['diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch']) {
    const r = F.POLICIES[k](day, thN, poaN, F.DCFG_DEFAULT);
    const m = F.motorMetrics(F.execOnFineGrid(r.theta, day.dtMin, dayF.n, 1, loop), mp);
    if (!(m.motorWh < ref.motorWh))
      throw new Error(k + ' gasta MÁS que no hacer nada: ' + m.motorWh.toFixed(2) + ' vs ' + ref.motorWh.toFixed(2));
    if (!(m.travelDeg < ref.travelDeg)) throw new Error(k + ' no ahorra recorrido');
  }
});
t('el modelo del ENSAYO (E₀+k·|Δθ|) no se ha copiado: aquí sería NaN, no un número', () => {
  // solargpt_core/motor_energy.py lanza por debajo de |Δθ| = 20° y
  // daily_motor_energy_wh devuelve NaN, porque extrapolar su término fijo a
  // micro-maniobras se equivoca ×27. Las maniobras de este simulador son de
  // 1-2°: si alguien trae esas constantes «para completar», esto lo caza.
  const fis = html.slice(html.indexOf('FÍSICA PURA'), html.indexOf('/* FIN-FÍSICA'));
  for (const c of ['2.425', '1.222', '0.0615', '0.0489']) {
    const re = new RegExp('[^\\d.]' + c.replace('.', '\\.') + '[^\\d]');
    if (re.test(fis)) throw new Error('constante del ensayo ' + c + ' dentro de la física: su dominio es |Δθ| ≥ 20°');
  }
  if (!/DOMINIO|dominio es \|Δθ\| ≥ 20°|NaN/.test(fis))
    throw new Error('la física no declara por qué NO usa el modelo del ensayo');
});

// ── fuzz determinista: 400 configuraciones del planeta entero ───────────────
// Semilla fija (reproducible). Cada configuración exige TODOS los invariantes a
// la vez. Así se cazó que el stow no obedecía al hard-stop mecánico.
// ── GOLDEN DEL NÚCLEO ────────────────────────────────────────────────────────
// La batería comprobaba que el espejo cumple el contrato TAL COMO SE TRANSCRIBIÓ.
// Esto lo comprueba contra la FUENTE: tools/golden_core.csv sale de ejecutar
// solargpt_core/tracker.py de verdad (ver tools/gen_golden_core.py).
// Las columnas de entrada (zenit, azimut, GHI/DNI/DHI) se CONSUMEN, no se
// regeneran: si el JS rehiciera su meteo, la prueba compararía dos modelos de
// cielo y un fallo en cualquiera enmascararía al otro.
console.log('golden del núcleo (solargpt_core/tracker.py ejecutado de verdad)');
{
  const gp = path.join(ROOT, 'tools', 'golden_core.csv');
  if (!fs.existsSync(gp)) {
    N++; FAIL++;
    console.error('  ✗ falta tools/golden_core.csv — regenéralo con tools/gen_golden_core.py');
  } else {
    // csv.DictWriter escribe \r\n: sin el trim, el ÚLTIMO nombre de columna se
    // queda con un \r pegado y esa columna sale undefined en todas las filas
    const bruto = fs.readFileSync(gp, 'utf-8').split('\n')
      .map(l => l.replace(/\r$/, '')).filter(l => l && !l.startsWith('#'));
    const cab = bruto[0].split(',').map(c => c.trim());
    const filas = bruto.slice(1).map(l => {
      const v = l.split(','), o = {};
      cab.forEach((c, i) => { o[c] = c === 'escenario' ? v[i].trim() : parseFloat(v[i]); });
      return o;
    });
    for (const c of cab) if (filas.some(f => f[c] === undefined || (c !== 'escenario' && Number.isNaN(f[c]))))
      throw new Error('columna ilegible en el golden: ' + JSON.stringify(c));
    // el golden se generó con el albedo POR DEFECTO de pvlib, que es el que el
    // core usa porque no lo expone; el espejo sí lo expone y por eso hay que
    // fijarlo aquí para comparar contra el core tal cual es
    const ALBEDO = 0.25;
    const escenarios = [...new Set(filas.map(f => f.escenario))];

    // un `day` construido con las ENTRADAS del golden, saltándose buildDay
    const dayDe = fs2 => {
      const irr = fs2.map(f => ({ ghi: f.ghi, dni: f.dni, dhi: f.dhi }));
      return {
        n: fs2.length, dtMin: fs2[0].dt_min, tmin: fs2.map(f => f.minuto_local),
        zen: fs2.map(f => f.zenit), az: fs2.map(f => f.azimut),
        clear: irr, irr, ghi: fs2.map(f => f.ghi),
        doy: fs2[0].doy, albedo: ALBEDO, axisAz: fs2[0].axis_azimuth,
        axisTilt: 0, maxAngle: fs2[0].theta_max, gcr: fs2[0].gcr,
        cc: new Array(288).fill(0), nightStow: 0,
      };
    };

    const peor = { poa: 0, th: 0, pol: {} };
    const fallos = [];
    for (const nm of escenarios) {
      const fs2 = filas.filter(f => f.escenario === nm);
      const day = dayDe(fs2);
      const thN = F.thetaBaselineDay(day);
      const poaN = F.poaSeries(day, thN);
      for (let i = 0; i < day.n; i++) {
        const dth = Math.abs(thN[i] - fs2[i].theta_n);
        const dpoa = Math.abs(poaN[i] - fs2[i].poa_n);
        if (dth > peor.th) peor.th = dth;
        if (dpoa > peor.poa) peor.poa = dpoa;
        if (dth > 1e-6) fallos.push(nm + ' paso ' + i + ': θ_n JS ' + thN[i].toFixed(6) + ' vs core ' + fs2[i].theta_n.toFixed(6));
        if (dpoa > 0.05) fallos.push(nm + ' paso ' + i + ': POA_n JS ' + poaN[i].toFixed(3) + ' vs core ' + fs2[i].poa_n.toFixed(3));
      }
      // Se compara contra las columnas *_fix_*: el core CON el azimut del eje
      // propagado a la transposición. Las cuatro políticas del core NO lo
      // propagan (solo run_tracker), así que con eje girado deciden con otra
      // orientación — bug del core, medido aparte abajo. El espejo sí lo
      // propaga, y tiene que reproducir al core corregido, no al core roto.
      for (const k of ['diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch']) {
        const r = F.POLICIES[k](day, thN, poaN, F.DCFG_DEFAULT);
        peor.pol[k] = peor.pol[k] || { th: 0, flag: 0 };
        for (let i = 0; i < day.n; i++) {
          const dth = Math.abs(r.theta[i] - fs2[i][k + '_fix_theta']);
          if (dth > peor.pol[k].th) peor.pol[k].th = dth;
          if (dth > 1e-4) fallos.push(nm + ' ' + k + ' paso ' + i + ': θ JS ' + r.theta[i].toFixed(4) + ' vs core ' + fs2[i][k + '_fix_theta'].toFixed(4));
          if ((r.flag[i] ? 1 : 0) !== fs2[i][k + '_fix_flag']) { peor.pol[k].flag++; fallos.push(nm + ' ' + k + ' paso ' + i + ': flag JS ' + (r.flag[i] ? 1 : 0) + ' vs core ' + fs2[i][k + '_fix_flag']); }
        }
      }
    }
    t('BUG DEL CORE, medido y fijado: las políticas no propagan el azimut del eje a la transposición', () => {
      // Solo run_tracker pasa axis_azimuth a compute_poa_perez; las cuatro
      // políticas lo dejan en 0. Con eje N-S da igual, pero con eje girado
      // —Bagnarelli va a 23,7°— DECIDEN con la transposición de otra
      // orientación. Esta prueba no lo arregla: lo deja medido, para que si el
      // core lo corrige salte y haya que regenerar el golden.
      let girado = 0, recto = 0;
      for (const f of filas) {
        let dif = 0;
        for (const k of ['diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch'])
          if (Math.abs(f[k + '_theta'] - f[k + '_fix_theta']) > 1e-6 || f[k + '_flag'] !== f[k + '_fix_flag']) dif = 1;
        if (f.axis_azimuth === 0) recto += dif; else girado += dif;
      }
      if (recto !== 0) throw new Error('con eje N-S el bug no debería notarse y afecta a ' + recto + ' pasos');
      if (girado === 0) throw new Error('el core ya no tiene el bug del azimut del eje: regenera el golden y compara contra las columnas normales');
      console.log('    · con eje girado el bug del core cambia la decisión en ' + girado + ' pasos; con eje N-S, en 0');
    });
    t('el espejo reproduce al CORE ejecutado: θ_n, POA de Perez y las 4 políticas, ' +
      escenarios.length + ' escenarios · ' + filas.length + ' pasos', () => {
      if (fallos.length) throw new Error(fallos.length + ' discrepancias · ' + fallos.slice(0, 4).join(' | '));
    });
    console.log('    peor desvío · θ_n ' + peor.th.toExponential(2) + '° · POA ' + peor.poa.toExponential(2) + ' W/m²');
    for (const k in peor.pol)
      console.log('      ' + k.padEnd(20) + ' θ ' + peor.pol[k].th.toExponential(2) + '° · flags distintos ' + peor.pol[k].flag);
  }
}

console.log('fuzz (400 configuraciones deterministas, todos los invariantes a la vez)');
t('400 configuraciones aleatorias: ni NaN, ni POA negativa, ni clamp roto, ni slew violado, ni diario discrepante', () => {
  let s = 20260814;
  const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t2 = Math.imul(s ^ s >>> 15, 1 | s); t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2; return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const fallos = [];
  for (let it = 0; it < 400; it++) {
    const dtMin = pick([5, 10, 15, 30]);
    const cc = new Array(288).fill(0);
    const modo = pick(['claro', 'ovc', 'frentes', 'ruido']);
    if (modo === 'ovc') cc.fill(0.6 + 0.4 * rnd());
    else if (modo === 'frentes') { for (let k = 0; k < 1 + Math.floor(rnd() * 6); k++) { const a = Math.floor(rnd() * 280); for (let j = a; j < Math.min(288, a + Math.floor(rnd() * 40)); j++) cc[j] = rnd(); } }
    else if (modo === 'ruido') for (let j = 0; j < 288; j++) cc[j] = rnd();
    const o = { lat: -60 + 120 * rnd(), lon: -180 + 360 * rnd(), tz: Math.round(-12 + 24 * rnd()),
      dateStr: pick(['2024-02-29', '2025-01-01', '2025-06-21', '2025-12-31', '2025-09-15']),
      altM: Math.round(3000 * rnd()), TL: 2 + 5 * rnd(), dtMin, albedo: rnd(),
      axisAz: pick([0, 23.7, 90, 180]), maxAngle: 5 + 55 * rnd(), gcr: 0.1 + 0.8 * rnd(),
      nightStow: -10 + 20 * rnd(), cc, om: null };
    const loop = { deadbandDeg: 2 * rnd(), slewDegS: 0.05 + 0.4 * rnd(), maxAngle: o.maxAngle };
    try {
      const day = F.buildDay(o), dayF = F.buildDay(Object.assign({}, o, { dtMin: 5 }));
      const thN = F.thetaBaselineDay(day), poaN = F.poaSeries(day, thN);
      if (!thN.every(Number.isFinite)) throw new Error('θ_n NaN');
      for (const k of ['diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch']) {
        const r = F.POLICIES[k](day, thN, poaN, F.DCFG_DEFAULT);
        if (!r.theta.every(Number.isFinite)) throw new Error(k + ': θ NaN');
        for (let i = 0; i < day.n; i++) {
          if (Math.abs(r.theta[i]) > Math.abs(thN[i]) + 1e-6) throw new Error(k + ': clamp de backtracking roto');
          if (Math.abs(r.theta[i]) > o.maxAngle + 1e-6) throw new Error(k + ': supera el tope mecánico');
        }
        const ex = F.execOnFineGrid(r.theta, dtMin, dayF.n, 5, loop);
        for (let i = 1; i < ex.length; i++)
          if (Math.abs(ex[i] - ex[i - 1]) > loop.slewDegS * 300 + 1e-6) throw new Error(k + ': slew violado');
        if (!F.poaSeries(dayF, ex).every(v => Number.isFinite(v) && v >= 0)) throw new Error(k + ': POA NaN o negativa');
        const e = F.EXPLAIN[k](day, thN, poaN, F.DCFG_DEFAULT);
        if (!e.flag.every((v, i) => !!v === !!r.flag[i])) throw new Error(k + ': el diario discrepa de la política');
      }
      const rc = F.POLICIES.diffuse_continuous(day, thN, poaN, F.DCFG_DEFAULT);
      const pc = F.poaSeries(day, rc.theta);
      for (let i = 0; i < day.n; i++)
        if (day.ghi[i] > F.DCFG_DEFAULT.ghiMin && pc[i] < poaN[i] - 1e-6) throw new Error('continuous < pvlib');
    } catch (e) {
      fallos.push('#' + it + ' ' + e.message + ' · lat ' + o.lat.toFixed(1) + ' θmáx ' + o.maxAngle.toFixed(1) +
                  ' dt ' + dtMin + ' ' + modo);
    }
  }
  if (fallos.length) throw new Error(fallos.length + '/400 · ' + fallos.slice(0, 3).join(' | '));
});

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
