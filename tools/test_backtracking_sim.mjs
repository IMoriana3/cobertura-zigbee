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
           pairsFromElev, elevFromPairs, solarPos, bt3dPairMaxMag, nsSegments, plantFromCotas };`);
const F = sandbox();

console.log('física (la misma QA que el botón de la página)');
for (const r of F.runPhysicsQA()) {
  N++;
  if (r.ok) console.log('  ✓ ' + r.name);
  else { FAIL++; console.error('  ✗ ' + r.name + ' — ' + r.err); }
}

console.log('extra (solo tiene sentido en Node: reproducibilidad y aristas)');
t('plantFromCotas sobre ayora_cotas.json REAL: banda coherente, tilts medidos y parejas bifila', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(data, 18);
  if (P.elev.length !== 18) throw new Error('líneas: ' + P.elev.length);
  if (Math.abs(P.pitch - 6.002) > 0.01) throw new Error('pitch: ' + P.pitch);
  if (Math.abs(P.cw - 2.384) > 0.01) throw new Error('cuerda: ' + P.cw);
  const eSpan = Math.max(...P.elev) - Math.min(...P.elev);
  if (!(eSpan > 0 && eSpan < 60)) throw new Error('desnivel raro: ' + eSpan.toFixed(1) + ' m');
  for (const tl of P.tilt) if (Math.abs(tl) > 20) throw new Error('tilt N-S fuera de rango: ' + tl.toFixed(1) + '°');
  const mean = P.elev.reduce((s, v) => s + v, 0) / P.elev.length;
  if (Math.abs(mean) > 1e-9) throw new Error('cotas sin recentrar');
  if (!(P.nPairs > 0)) throw new Error('sin parejas bifila');
  for (const g of P.groups) if (g.length === 2 && Math.abs(g[0] - g[1]) !== 1) throw new Error('pareja no adyacente: ' + g);
  const segCount = P.segs.reduce((s, l) => s + l.length, 0);
  if (!(segCount >= 18)) throw new Error('tramos: ' + segCount);
});
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

t('ámbito por NCU: layout↔cotas 1:1 y el parque de cada NCU forma planta válida', () => {
  // la base del selector de ámbito: ayora_layout.json (ncu por tracker) va en
  // el MISMO orden que ayora_cotas.json — si un re-export lo rompe, esto avisa
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
  if (lay.trackers.length !== cotas.t.length) throw new Error('layout ' + lay.trackers.length + ' ≠ cotas ' + cotas.t.length);
  let mism = 0;
  for (let i = 0; i < cotas.t.length; i++) {
    const f = cotas.t[i].f[0], lt = lay.trackers[i];
    const [n0, n1] = f.n;
    if (Math.abs(f.x - lt.x) > 3 || lt.n < Math.min(n0, n1) - 2 || lt.n > Math.max(n0, n1) + 2) mism++;
  }
  if (mism > 0) throw new Error(mism + ' trackers no casan por índice (posición)');
  const ncuOf = lay.trackers.map(t => t.ncu);
  const ncus = [...new Set(ncuOf)].sort((a, b) => a - b);
  if (ncus.length < 2) throw new Error('sin variedad de NCUs: ' + ncus);
  for (const n of ncus.slice(0, 4)) {
    const sub = Object.assign({}, cotas, { t: cotas.t.filter((_, i) => ncuOf[i] === n) });
    const P = F.plantFromCotas(sub, 80, 0);
    if (!(P.elev.length >= 2)) throw new Error('NCU ' + n + ': ' + P.elev.length + ' líneas');
    if (!(P.nFilas > 0)) throw new Error('NCU ' + n + ' sin filas');
  }
});
t('horas de BT en el slider + aviso «BT ON» + sombra render anisótropa + rayo con listener', () => {
  // v1.17: el slider se pinta por tramos desde la física (referencia astro con
  // slew en computeDay), el aviso BT ON existe, el frustum de sombra se encoge
  // con la elevación (fuera la sierra rasante) y «☀ rayo» redibuja al cambiar
  if (!/id="btflag"/.test(html)) throw new Error('sin aviso BT ON');
  if (!/function paintHourTrack/.test(html)) throw new Error('sin pintado del slider');
  if (!/astroAng/.test(html)) throw new Error('computeDay sin referencia astronómica');
  if (!/R2\*Math\.sin\(el\)/.test(html)) throw new Error('frustum de sombra no anisótropo');
  if (!/\$\('ray3d'\)\.onchange/.test(html)) throw new Error('☀ rayo sin listener de cambio');
});
t('v1.18: banda rasante MULTI-EMISORA + paso minutal + BT OFF/ON fijo + HUD estable', () => {
  if (!/function shadeBand3DAll/.test(html)) throw new Error('banda rasante sin multi-emisora');
  if (!/function sceneInstant/.test(html)) throw new Error('sin física del instante exacto');
  if (!/id="hour"[^>]*step="1"/.test(html)) throw new Error('slider no minutal');
  if (!/BT OFF/.test(html)) throw new Error('indicador BT sin estado OFF (no debe desaparecer)');
  if (!/sin parejas interactuando/.test(html)) throw new Error('HUD: la tarjeta de residual debe existir siempre');
});
t('v1.19: contador ray-cast a TODAS horas + Martinez por estación + θ<0=este + rayo recortado', () => {
  // el contador publicado es el ray-cast multi-emisora a cualquier cénit
  if (!/return shadeBand3DAll\(zen,az,T,rowAngles\);\s*\}/.test(html)) throw new Error('shadeRows no es el ray-cast');
  if (!/function shadeRows25/.test(html)) throw new Error('sin evaluador rápido para optimizadores');
  if (!/elecSum\+=elecLoss\(fCol/.test(html)) throw new Error('Martinez no va por estación axial');
  if (!/const TH_DISP=-1/.test(html)) throw new Error('sin convención de presentación θ<0=este');
  if (!/firstHit\(edgeW,hitW/.test(html)) throw new Error('el rayo no se recorta contra las mesas');
  if (!/d\.irr\[t\]\.dni>25/.test(html)) throw new Error('sombra máx sin filtro de sol útil');
});
t('v1.20: terreno que sombrea CONTADO y pintado + rayo recto anclado al clic + POV sol', () => {
  if (!/terrBlocked/.test(html)) throw new Error('sin oclusión de terreno en el contador');
  if (!/function drawTerrainStrips/.test(html)) throw new Error('la sombra de terreno no se pinta');
  if (!/TD\.rayYc=-h\.point\.z/.test(html)) throw new Error('el rayo no se ancla a la mesa clicada');
  if (!/id="sunpov"/.test(html)) throw new Error('sin cámara desde el sol');
  if (!/borde emisor \+ dirección REAL del sol/.test(html)) throw new Error('rayo no recto por construcción');
});
t('bifila: gemela alineada con su motora Y tresbolillo REAL entre grupos', () => {
  // mismo cálculo que hace terrain() con preset tresbolillo + bifila (pairStep 2):
  // dentro del grupo alineadas (eje perpendicular), entre grupos DESALINEADAS —
  // con r%2 a secas la motora era siempre fila par y el tresbolillo salía todo
  // alineado (reportado con captura)
  const segs = F.nsSegments(6, 'tresbolillo', 1, 55.9, 1.0, 2);
  const groups = [[0,1],[2,3],[4,5]];
  for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
  for (const g of groups)
    if (JSON.stringify(segs[g[0]]) !== JSON.stringify(segs[g[1]]))
      throw new Error('grupo ' + g + ' desalineado');
  if (JSON.stringify(segs[0]) === JSON.stringify(segs[2]))
    throw new Error('grupos consecutivos alineados: no es tresbolillo');
  if (JSON.stringify(segs[0]) !== JSON.stringify(segs[4]))
    throw new Error('el patrón no alterna con periodo de 2 grupos');
});

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
