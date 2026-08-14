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
t('plantas reales: botones Ayora/San José, carga por fetch del layout y vuelta a sintética', () => {
  if (!/id="ayorabtn"/.test(html) || !/id="sjbtn"/.test(html) || !/id="synbtn"/.test(html))
    throw new Error('faltan los botones de planta');
  if (!/_layout\.json/.test(html)) throw new Error('no carga el layout real');
  if (!/function buildReal3D/.test(html)) throw new Error('sin escena de planta real');
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
const i0 = html.indexOf('FÍSICA PURA');
const i1 = html.indexOf('/* FIN-FÍSICA');
if (i0 < 0 || i1 < 0) { console.error('no encuentro los delimitadores FÍSICA PURA / FIN-FÍSICA'); process.exit(1); }
const j0 = html.lastIndexOf('/*', i0);
const src = html.slice(j0, i1);

const sandbox = new Function(src + `
  return { runPhysicsQA, solarPos, singleaxis, trueTrackAngle, clearskyIneichen, cloudToIrr,
           poaTracker, omInterp, buildDay, thetaBaselineDay, clampBT, poaSeries, POLICIES,
           applyControlLoop, dayMetrics, canonScenario, canonCC, CANON, DCFG_DEFAULT,
           shiftCC, shiftOM, zonalRun };`);
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

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
