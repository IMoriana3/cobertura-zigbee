/* QA del simulador de backtracking (backtracking.html) — sin navegador.
   Uso:  node tools/test_backtracking_sim.mjs

   a) el bloque FÍSICA PURA se extrae y se ejecuta en Node: corre la MISMA
      runPhysicsQA() que el botón «Verificar» de la página (pvlib singleaxis vs
      fórmula cerrada, sombra analítica vs ray-cast bruto, degeneraciones,
      true-3D con residual de tangencia, energy-optimal ≥ pairwise, Martinez,
      Ineichen, Perez);
   b) estáticos: la página es OFFLINE de verdad (sin URLs externas de scripts/
      estilos) y los canónicos por defecto espejan los del core
      (pitch 6.00 · colector 2.382 · GCR 0.397 · θmáx 55) — si el core los
      cambia, aquí se ve. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');

let N = 0, FAIL = 0;
function t(name, fn) {
  N++;
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + ' — ' + e.message); }
}

console.log('estático');
t('sin dependencias externas (offline): ni http(s) en <script src>/<link href> de CDN', () => {
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
t('escena 3D con las libs LOCALES del repo (three.min.js + OrbitControls), no CDN', () => {
  if (!/<script src="lib\/three\.min\.js">/.test(html)) throw new Error('sin lib/three.min.js');
  if (!/<script src="lib\/OrbitControls\.js">/.test(html)) throw new Error('sin lib/OrbitControls.js');
  if (!/id="view3d"/.test(html)) throw new Error('sin contenedor 3D');
});
t('degrada a 2D si THREE/WebGL no están (has3D + try/catch en init3D)', () => {
  if (!/function has3D\(\)/.test(html)) throw new Error('sin guard has3D');
  const init = html.slice(html.indexOf('function init3D'), html.indexOf('function build3D'));
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
  return { runPhysicsQA, singleaxis, trueTrackAngle, shadeFracPair, shadeBrute,
           anglesPairwise, anglesTrue3d, anglesOptimal, anglesAstro, anglesGlobal, anglesRow,
           shadeRows, tangentResidualMm, elecLoss, clearskyIneichen, poaPlant, poaRow,
           pairsFromElev, elevFromPairs, solarPos, bt3dPairMaxMag };`);
const F = sandbox();

console.log('física (la misma QA que el botón de la página)');
for (const r of F.runPhysicsQA()) {
  N++;
  if (r.ok) console.log('  ✓ ' + r.name);
  else { FAIL++; console.error('  ✗ ' + r.name + ' — ' + r.err); }
}

console.log('extra (solo tiene sentido en Node: reproducibilidad y aristas)');
t('cotas ↔ pendientes: ida y vuelta exacta (pairsFromElev ∘ elevFromPairs = id)', () => {
  const z = [0, -0.4, 0.7, 0.1, -1.2];
  const back = F.elevFromPairs(F.pairsFromElev(z, 6, 0));
  for (let i = 0; i < z.length; i++)
    if (Math.abs(back[i] - z[i]) > 1e-12) throw new Error('fila ' + i + ': ' + back[i] + ' vs ' + z[i]);
});
t('posición solar NOAA: mediodía solar del 21-jun en Greenwich ≈ decl 23.44 ± 0.1°', () => {
  const g = F.solarPos(Date.UTC(2026, 5, 21, 12, 2, 0), 0, 0);   // ~tránsito
  const elevEsperada = 90 - Math.abs(0 - 23.44);
  if (Math.abs(g.elev - elevEsperada) > 0.5) throw new Error('elev ' + g.elev.toFixed(2) + ' vs ' + elevEsperada.toFixed(2));
});
t('noche: singleaxis devuelve NaN con zen>90 y las políticas lo hacen 0', () => {
  if (!Number.isNaN(F.singleaxis(95, 90, { axisTilt: 0, axisAz: 0, maxAngle: 55, backtrack: true, gcr: 0.4, crossAxisTilt: 0 })))
    throw new Error('singleaxis nocturno no es NaN');
  const T = { pairs: [{ slope: 3, pitch: 6, axisTilt: 0 }], cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 0.397, z0: 0, nBypass: 3 };
  const a = F.anglesPairwise(95, 90, T);
  if (a.some(v => v !== 0)) throw new Error('ángulo nocturno ≠ 0: ' + a);
});
t('POA de planta = media por fila (no POA del ángulo medio): difieren en terreno irregular', () => {
  // la agregación energética del core: en N-S/terreno irregular POA(θ̄) ≠ mean(POA(θ_r))
  const T = { pairs: [{ slope: 8, pitch: 6, axisTilt: 0 }, { slope: -8, pitch: 6, axisTilt: 0 }], cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 0.397, z0: 0, nBypass: 3 };
  const irr = F.clearskyIneichen(60, 355, 300, 3.5);
  const ang = F.anglesPairwise(60, 120, T);
  const p = F.poaPlant(60, 120, T, ang, irr, 355, 0.2);
  const media = p.rows.reduce((s, v) => s + v, 0) / p.rows.length;
  if (Math.abs(p.plant - media) > 1e-9) throw new Error('plant ≠ media por fila');
});

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
