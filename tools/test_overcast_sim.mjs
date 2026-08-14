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
  if (!/bifila:false/.test(html.slice(html.indexOf('REALMETA')))) throw new Error('Bagnarelli debe ser monofila en REALMETA');
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
t('el viento se pide MEDIDO a Open-Meteo (m/s) en las DOS descargas: día suelto y año de 365', () => {
  // la URL va troceada en concatenaciones: se mira una ventana tras el hourly=
  const urls = html.match(/hourly=shortwave_radiation[\s\S]{0,220}/g) || [];
  if (urls.length < 2) throw new Error('esperaba 2 peticiones de meteo, veo ' + urls.length);
  for (const u of urls) {
    if (!/wind_speed_10m/.test(u)) throw new Error('una descarga no pide viento: ' + u.slice(0, 60));
    if (!/wind_speed_unit=ms/.test(u)) throw new Error('el viento vendría en km/h y el stow compara m/s');
  }
});
t('el ÁRBITRO manda en TODAS las vistas: día, anual y escena pasan por arbitrate()', () => {
  const n = (html.match(/=\s*arbitrate\(/g) || []).length;
  if (n < 2) throw new Error('arbitrate() solo se usa en ' + n + ' sitio(s): una vista quedaría con otra física');
  if (!/wlev\[i\]===0/.test(html)) throw new Error('el flag de difusa no se enmascara bajo stow');
  if (!/windEvents\(SIM\.day/.test(html)) throw new Error('el diario no narra el viento');
});

const i0 = html.indexOf('FÍSICA PURA');
const i1 = html.indexOf('/* FIN-FÍSICA');
if (i0 < 0 || i1 < 0) { console.error('no encuentro los delimitadores FÍSICA PURA / FIN-FÍSICA'); process.exit(1); }
const j0 = html.lastIndexOf('/*', i0);
const src = html.slice(j0, i1);

const sandbox = new Function(src + `
  return { runPhysicsQA, solarPos, singleaxis, trueTrackAngle, clearskyIneichen, cloudToIrr,
           poaTracker, omInterp, buildDay, thetaBaselineDay, clampBT, poaSeries, POLICIES,
           applyControlLoop, dayMetrics, canonScenario, canonCC, CANON, DCFG_DEFAULT,
           shiftCC, shiftOM, zonalRun, execOnFineGrid, EXPLAIN, slewLimit1,
           WIND, MANDO, windStowLevel, arbitrate, windEvents, thetaTrueDay };`);
const F = sandbox();

console.log('física (la misma QA que el botón de la página)');
for (const r of F.runPhysicsQA()) {
  N++;
  if (r.ok) console.log('  ✓ ' + r.name);
  else { FAIL++; console.error('  ✗ ' + r.name + ' — ' + r.err); }
}

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

// ── fuzz determinista: 400 configuraciones del planeta entero ───────────────
// Semilla fija (reproducible). Cada configuración exige TODOS los invariantes a
// la vez. Así se cazó que el stow no obedecía al hard-stop mecánico.
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
    // viento sintético: calma, temporal o rachas — el árbitro tiene que
    // aguantar cualquiera de los tres sin sacar al tracker del hierro
    const modoW = pick(['calma', 'temporal', 'rachas']);
    o.ws = new Array(288).fill(0).map((_, j) =>
      modoW === 'calma' ? 3 * rnd() : modoW === 'temporal' ? 12 + 8 * rnd() :
      (rnd() < 0.25 ? 10 + 12 * rnd() : 4 * rnd()));
    const wc = { T1_MS: 40 / 3.6, T2_MS: 60 / 3.6, HOLD_MIN: pick([0, 15, 30, 60]),
                 STOW_DEG: pick([0, 0, 0, 30 * rnd()]), PARTIAL_MAX_DEG: 10 + 40 * rnd() };
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
      // ── jerarquía de mando con viento: la seguridad no se negocia ──
      const wlev = F.windStowLevel(day.wind, dtMin, wc);
      const thT = F.thetaTrueDay(day);
      for (let i = 0; i < day.n; i++)
        if (day.zen[i] < 90 && Math.abs(thN[i]) > Math.abs(thT[i]) + 1e-6)
          throw new Error('la baseline abre más que el seguimiento verdadero');
      if (!wlev.every(v => v === 0 || v === 1 || v === 2)) throw new Error('nivel de stow fuera de {0,1,2}');
      for (const k of ['pvlib', 'diffuse_flat', 'diffuse_limited', 'diffuse_continuous', 'diffuse_poa_switch']) {
        const r = F.POLICIES[k](day, thN, poaN, F.DCFG_DEFAULT);
        const a = F.arbitrate(r.theta, thN, wlev, o.maxAngle, wc, thT);
        if (!a.theta.every(Number.isFinite)) throw new Error(k + ': θ arbitrada NaN');
        const refugio = Math.max(-o.maxAngle, Math.min(o.maxAngle, wc.STOW_DEG));
        for (let i = 0; i < day.n; i++) {
          if (Math.abs(a.theta[i]) > o.maxAngle + 1e-6) throw new Error(k + ': el stow rebasó el tope mecánico');
          if (wlev[i] === 2 && Math.abs(a.theta[i] - refugio) > 1e-6)
            throw new Error(k + ': la difusa se salió del stow TOTAL');
          if (wlev[i] === 1 && Math.abs(a.theta[i]) > Math.min(o.maxAngle, wc.PARTIAL_MAX_DEG) + 1e-6)
            throw new Error(k + ': stow PARCIAL rebasado');
          if (wlev[i] === 0 && Math.abs(a.theta[i]) > Math.abs(thN[i]) + 1e-6)
            throw new Error(k + ': sin viento el árbitro dejó pasar sombra');
        }
        const exW = F.execOnFineGrid(a.theta, dtMin, dayF.n, 5, loop);
        for (let i = 1; i < exW.length; i++)
          if (Math.abs(exW[i] - exW[i - 1]) > loop.slewDegS * 300 + 1e-6)
            throw new Error(k + ': el stow teletransporta (slew violado al ir al refugio)');
        const cambios = F.windEvents(day, wlev, wc, []).length;
        // el día que AMANECE ya en stow también es una maniobra que narrar
        let n2 = wlev[0] !== 0 ? 1 : 0;
        for (let i = 1; i < day.n; i++) if (wlev[i] !== wlev[i - 1]) n2++;
        if (cambios !== n2) throw new Error('el diario narra ' + cambios + ' maniobras de viento y hubo ' + n2);
      }
      const rc = F.POLICIES.diffuse_continuous(day, thN, poaN, F.DCFG_DEFAULT);
      const pc = F.poaSeries(day, rc.theta);
      for (let i = 0; i < day.n; i++)
        if (day.ghi[i] > F.DCFG_DEFAULT.ghiMin && pc[i] < poaN[i] - 1e-6) throw new Error('continuous < pvlib');
    } catch (e) {
      fallos.push('#' + it + ' ' + e.message + ' · lat ' + o.lat.toFixed(1) + ' θmáx ' + o.maxAngle.toFixed(1) +
                  ' dt ' + dtMin + ' ' + modo + '/' + modoW);
    }
  }
  if (fallos.length) throw new Error(fallos.length + '/400 · ' + fallos.slice(0, 3).join(' | '));
});

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
