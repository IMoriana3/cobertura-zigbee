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
t('careo: apagado por defecto y sin física nueva (usa bt2d y true3d, que ya existían)', () => {
  if (!/type="checkbox" id="careo"/.test(html)) throw new Error('sin casilla de careo');
  if (/id="careo"[^>]*checked/.test(html)) throw new Error('el careo arranca encendido');
  if (!/id="careolibro" disabled/.test(html)) throw new Error('el modelo de libro no arranca deshabilitado');
  if (!/const CAREO_A='bt2d', CAREO_B='true3d'/.test(html)) throw new Error('el careo no compara las políticas existentes');
  // el careo no puede traerse una integral del día propia: una sola maquinaria
  const n = (html.match(/function kpisSerie\(/g) || []).length;
  if (n !== 1) throw new Error('kpisSerie duplicada (' + n + ')');
  if (!/function dayKpis\(key\)\{[\s\S]{0,200}kpisSerie\(/.test(html)) throw new Error('dayKpis no delega en kpisSerie');
});
t('careo: el «modelo de libro» es un DATO (terreno sin pendiente y sin segs), no una física nueva', () => {
  const f = html.slice(html.indexOf('function careoTerreno'), html.indexOf('/* La banda de un'));
  if (!/slope:0/.test(f) || !/V\.segs=null/.test(f)) throw new Error('careoTerreno no aplana ni quita los tramos');
  if (/Math\.(sin|cos|tan|asin|acos|atan)/.test(f)) throw new Error('careoTerreno hace trigonometría: eso es física');
});
t('careo: publica la BANDA del circunsolar con la misma convención que la tabla', () => {
  const f = html.slice(html.indexOf('function careoBanda('), html.indexOf('function careoCompute'));
  // misma cota arriba y abajo en los dos lados del cociente, como en fillDayTable
  if (!/kwhLo\/a\.kwhLo/.test(f) || !/kwhHi\/a\.kwhHi/.test(f))
    throw new Error('la banda del careo no usa la misma cota en política y referencia');
  if (!/cruza:bl<-1e-9&&bh>1e-9/.test(f)) throw new Error('el careo no marca el cruce del cero');
  if (!/careoBandaHtml\(b\)/.test(html)) throw new Error('la cajita no pinta la banda');
});
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
           pairsFromElev, elevFromPairs, solarPos, bt3dPairMaxMag, nsSegments, plantFromCotas,
           shadeBand3DAll, anglesOptimalFree, policyAngles, iamAshrae, PEREZ_BINS, PEREZ_F,
           airmassKY, dniExtra, surfaceOrient };`);
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
t('v1.25: cuerda ANALÍTICA en el contador (sin MU) — la auditoría midió +0,52% de sesgo', () => {
  // puntos 1 y 5 de la auditoría: el muestreo de cuerda MU=6 cuantizaba la
  // penetración (sesgo +0,52% POA anual medido en Ayora); ahora la sombra por
  // estación es unión de intervalos en cerrado y solo queda MV como
  // discretización (convergencia documentada en docs/backtracking-sim.md)
  if (!/CUERDA ANALÍTICA/.test(html)) throw new Error('el contador no declara cuerda analítica');
  const band = html.slice(html.indexOf('function shadeBand3DAll'), html.indexOf('function shadeRows('));
  if (/const MU=/.test(band)) throw new Error('shadeBand3DAll aún muestrea la cuerda con MU');
  if (!/const unir=\(iv\)=>/.test(band) || !/iv\.sort/.test(band))
    throw new Error('sin unión de intervalos en el contador');
  if (!/function oracleExact/.test(fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8')))
    throw new Error('la batería perdió el oráculo de podas');
});

t('v1.28: la ESTRUCTURA real entra en el contador con las cotas de seguidor.js', () => {
  // viga cuadrada de 120 mm y laminado de 6 cm con su cara colectora a 0,17 m
  // del eje — los mismos números que el modelo de la casa, no inventados
  const mod = fs.readFileSync(path.join(ROOT, 'seguidor.js'), 'utf-8');
  const mt = mod.match(/tube:\s*([0-9.]+)/), mo = mod.match(/off:\s*([0-9.]+)/);
  if (!mt || !mo) throw new Error('no encuentro tube/off en seguidor.js');
  const ht = html.match(/const MOD_OFF=([0-9.]+),\s*TUBE=([0-9.]+),\s*GLASS=([0-9.]+)/);
  if (!ht) throw new Error('el contador no declara la geometría de la mesa');
  if (Math.abs(+ht[1] - +mo[1]) > 1e-9) throw new Error(`MOD_OFF ${ht[1]} ≠ seguidor.js off ${mo[1]}`);
  if (Math.abs(+ht[2] - +mt[1]) > 1e-9) throw new Error(`TUBE ${ht[2]} ≠ seguidor.js tube ${mt[1]}`);
  if (!/const REC_OFF=MOD_OFF\+GLASS\/2/.test(html)) throw new Error('la cara colectora no es el vidrio');
  if (!/function boxChordIv/.test(html)) throw new Error('sin intervalo de cuerda por caja convexa');
  if (!/pl\.tb/.test(html) || !/pl\.sl/.test(html)) throw new Error('faltan viga o laminado como emisores');
});
t('KPI del día: la sombra se pondera por ENERGÍA y los minutos por sombra RELEVANTE', () => {
  // el máximo por fila saturaba al 100% en las 9 políticas (terreno roto) y no
  // distinguía nada: se sustituyó por media de planta pesada por DNI
  if (/shMax/.test(html)) throw new Error('la tabla sigue con el máximo por fila');
  if (!/shW\+=med\*w/.test(html)) throw new Error('la sombra no va ponderada por energía');
  if (!/med>0\.01&&d\.irr\[t\]\.dni>25/.test(html)) throw new Error('los minutos no usan sombra relevante');
  if (!/elecStr/.test(html)) throw new Error('la tabla no separa la pérdida estructural');
});
t('v1.29: energy-optimal ≥ pairwise BAJO EL CONTADOR EXACTO (lo cazó el barrido en llano)', () => {
  // el evaluador de búsqueda es 2.5D y ciego a la estructura: en llano elegía
  // f>0 que bajo el contador publicado rendía MENOS que la base (−0,27% el
  // 21-jun). El core garantiza optimal ≥ pairwise porque f=0 ES pairwise.
  if (!/VETO con el contador EXACTO/.test(html)) throw new Error('energy-optimal sin veto exacto');
  if (!/\[\[0,base\],\[1,full\]\]/.test(html)) throw new Error('el veto no mira los DOS extremos de la rejilla');
  const T = { pairs: [0, 0, 0, 0].map(s => ({ slope: s, pitch: 6, axisTilt: 0 })),
              cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / 6, z0: 0.17, nBypass: 3 };
  for (const [zen, az] of [[80, 100], [75, 260], [70, 95], [65, 265], [60, 100]]) {
    const irr = F.clearskyIneichen(zen, 172, 739, 3.5);
    const pw = F.poaPlant(zen, az, T, F.anglesPairwise(zen, az, T), irr, 172, 0.20).plant;
    const as = F.poaPlant(zen, az, T, F.anglesAstro(zen, az, T), irr, 172, 0.20).plant;
    const op = F.poaPlant(zen, az, T, F.anglesOptimal(zen, az, T, irr, 172, 0.20).angles, irr, 172, 0.20).plant;
    // f=0 (pairwise) y f=1 (astro) son candidatos de su rejilla: el óptimo no
    // puede quedar por debajo de NINGUNO bajo el contador que se publica
    if (op < pw - 1e-9) throw new Error(`zen ${zen} az ${az}: óptimo ${op.toFixed(3)} < pairwise ${pw.toFixed(3)}`);
    if (op < as - 1e-9) throw new Error(`zen ${zen} az ${az}: óptimo ${op.toFixed(3)} < astro ${as.toFixed(3)}`);
  }
});
t('v1.29: UNA fuente para la cara colectora (campo «cara sup–eje» = T.z0) y barrido de auditoría', () => {
  // la v1.28 metió 0,17 a fuego en el contador 3D mientras el corte 2D, el
  // rayo y el vano seguían con el campo z0 (que valía 0): dos verdades para el
  // mismo número. Ahora el contador lee T.z0 y el campo trae el valor real.
  if (!/id="z0"[^>]*value="0\.17"/.test(html)) throw new Error('el campo «cara sup–eje» no trae 0,17');
  if (!/const zOff=\(T\.z0!=null&&isFinite\(T\.z0\)\)\?T\.z0:REC_OFF/.test(html))
    throw new Error('el contador no lee la cara colectora de T.z0');
  if (!/nOf\*Math\.sin\(thK\)/.test(html)) throw new Error('el visor del vano no sube el borde a la cara del módulo');
  if (!fs.existsSync(path.join(ROOT, 'tools', 'audit_sweep.mjs'))) throw new Error('sin barrido de auditoría');
});
t('EXPORT de consignas: claves del CONTRATO de scada y marco de coordenadas correcto', () => {
  const ep = path.join(ROOT, 'tools', 'export_consignas.mjs');
  if (!fs.existsSync(ep)) throw new Error('sin tools/export_consignas.mjs');
  const e = fs.readFileSync(ep, 'utf-8');
  for (const k of ['ncu', 'tcu', 'theta_sim_deg', 'theta_tcu_deg', 'asesoria'])
    if (!e.includes(k)) throw new Error('la cabecera del CSV pierde la clave ' + k);
  // el fallo que costó 500 seguidores: lineX va RECENTRADO por bloque y la x
  // cruda es xFrom + lineX. Si alguien vuelve a comparar lineX con la x del
  // layout, el 70% de la planta se queda sin consigna y en silencio.
  if (!/B\.P\.xFrom \+ B\.P\.lineX\[r\]/.test(e))
    throw new Error('el emparejamiento seguidor→línea no usa xFrom + lineX');
  // los optimizadores dependen del evaluador provisional: salen como asesoría
  if (!/GEOMETRICAS/.test(e) || !/asesoria/.test(e))
    throw new Error('el export no separa consigna de asesoría');
  // y la identidad tiene que existir en el layout
  const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
  const conNcu = lay.trackers.filter(t => t.ncu != null).length;
  if (conNcu !== lay.trackers.length) throw new Error(`${lay.trackers.length - conNcu} seguidores sin NCU en el layout`);
  const conId = lay.trackers.filter(t => /(\d+)/.test(String(t.id || ''))).length;
  if (conId !== lay.trackers.length) throw new Error('hay seguidores sin nº de TCU en el id');
});
t('v1.26.1: existe el GATE de pre-release con sus 5 pasos (auditoría, punto 6)', () => {
  const gp = path.join(ROOT, 'tools', 'release_gate.mjs');
  if (!fs.existsSync(gp)) throw new Error('sin tools/release_gate.mjs');
  const g = fs.readFileSync(gp, 'utf-8');
  for (const paso of ['SINTAXIS', 'BATERÍA', 'SMOKE', 'INVARIANTES', 'VISUAL', 'PACTO DEL ROJO'])
    if (!g.includes(paso)) throw new Error('el gate perdió el paso ' + paso);
});
t('v1.26: terreno a TODA elevación (el gate de 25° costaba −0,34% anual medido)', () => {
  // punto 3 de la auditoría: umbrales con dato, no con fe — podas 0,0000%,
  // reparación <40° 0,0000%, marcha 4 m ≤0,03% (declarado), y el único
  // material (gate de terreno) RETIRADO
  if (!/const doTerr=true;/.test(html)) throw new Error('el contador aún tiene gate de elevación en el terreno');
  if (!/TERRENO a TODA elevación/.test(html)) throw new Error('sin la justificación medida del cambio');
});

/* ── ORÁCULOS independientes del contador (auditoría, punto 5) ──────────────
   Dos niveles, con implementación SEPARADA de la del contador publicado:

   a) ORÁCULO DE PODAS — misma matemática (cuerda analítica: unión de
      intervalos en u por estación) pero SIN NINGUNA poda: todos los planos
      emisores de todas las filas, sin límite de alcance, sin filtro por
      desplazamiento axial, sin candidatos ordenados ni denominadores
      precalculados. Si una poda del contador pierde sombra real, esto falla.
      Tolerancia 0,1 pp (coincidencia numérica).

   b) ORÁCULO DE MÉTODO — discretización INDEPENDIENTE de la matemática de
      intervalos: muestreo bruto de la cuerda con MU=192 puntos por estación.
      Si la unión de intervalos estuviera mal derivada (una desigualdad con
      el signo cambiado, un término perdido), esto falla. Tolerancia 0,3 pp
      (cuantización propia del bruto ≈ 1/192 por estación). Se limita a un
      subconjunto de filas receptoras para mantener la batería rápida; las
      EMISORAS son siempre todas.

   Ambos replican la física declarada: planos por tramo con cotas reales,
   estaciones axiales MV=8, terreno con marcha de 4 m + bisección de 3
   refinos, a TODA elevación — el gate de 25° se retiró en v1.26 tras medir
   que costaba −0,34% anual). */
function oracleGeom(T, rowAngles) {
  const RAD = Math.PI / 180;
  const zOff = (T.z0 != null && isFinite(T.z0)) ? T.z0 : O_REC;
  const nR = T.pairs.length + 1;
  const PRr = T.real, xs = [0], zch = [0];
  for (let i = 0; i < T.pairs.length; i++) {
    xs.push(xs[i] + T.pairs[i].pitch);
    zch.push(zch[i] - T.pairs[i].pitch * Math.tan(T.pairs[i].slope * RAD));
  }
  const cot = (row, v) => {
    if (PRr && PRr.segZ && PRr.segZ[row]) {
      const segs = PRr.segs[row], zz = PRr.segZ[row];
      let bi = -1, bd = Infinity;
      for (let k = 0; k < segs.length; k++) {
        const lo = Math.min(segs[k][0], segs[k][1]), hi = Math.max(segs[k][0], segs[k][1]);
        const d = v < lo ? lo - v : (v > hi ? v - hi : 0);
        if (d < bd) { bd = d; bi = k; }
      }
      const [a, b] = segs[bi], t2 = Math.max(0, Math.min(1, (v - a) / ((b - a) || 1)));
      return zz[bi][0] + t2 * (zz[bi][1] - zz[bi][0]);
    }
    return zch[row] + v * Math.tan(((T.rowTilt ? T.rowTilt[row] : 0)) * RAD);
  };
  const segsOf = row => (T.segs && T.segs[row]) ? T.segs[row] : [[-30, 30]];
  const planes = [];
  for (let e = 0; e < nR; e++) {
    const thE = rowAngles[e] * RAD;
    for (const sg of segsOf(e)) {
      const w0 = Math.min(sg[0], sg[1]), w1 = Math.max(sg[0], sg[1]);
      const z0e = cot(e, w0), z1e = cot(e, w1);
      const sE = (z1e - z0e) / ((w1 - w0) || 1);
      const uD = [Math.cos(thE), 0, -Math.sin(thE)], vD = [0, 1, sE];
      const nE = [uD[1] * vD[2] - uD[2] * vD[1], uD[2] * vD[0] - uD[0] * vD[2], uD[0] * vD[1] - uD[1] * vD[0]];
      const ln = Math.hypot(nE[0], nE[1], nE[2]) || 1;
      const nu = [nE[0] / ln, nE[1] / ln, nE[2] / ln];
      const axC = [xs[e], (w0 + w1) / 2, (z0e + z1e) / 2];
      const lv = Math.hypot(vD[0], vD[1], vD[2]) || 1;
      // MISMO modelo declarado que el contador (v1.28): cara del módulo a
      // MOD_OFF sobre el eje y VIGA de torsión (sección cuadrada PERPENDICULAR
      // al eje: base ortonormal) como emisor propio
      const e3 = [vD[0] / lv, vD[1] / lv, vD[2] / lv];
      const pr = uD[0] * e3[0] + uD[1] * e3[1] + uD[2] * e3[2];
      const e1r = [uD[0] - pr * e3[0], uD[1] - pr * e3[1], uD[2] - pr * e3[2]];
      const l1 = Math.hypot(e1r[0], e1r[1], e1r[2]) || 1;
      const e1 = [e1r[0] / l1, e1r[1] / l1, e1r[2] / l1];
      const e2 = [e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]];
      planes.push({ e, w0, w1, nE, uD,
        C: [axC[0] + zOff * nu[0], axC[1] + zOff * nu[1], axC[2] + zOff * nu[2]],
        tb: { C: axC, ax: [e1, e2, e3], hf: [O_TUBE / 2, O_TUBE / 2, Math.abs(w1 - w0) * lv / 2] },
        sl: { C: [axC[0] + (zOff - O_GLASS / 2) * nu[0], axC[1] + (zOff - O_GLASS / 2) * nu[1], axC[2] + (zOff - O_GLASS / 2) * nu[2]],
              ax: [e1, e2, e3], hf: [T.cw / 2, O_GLASS / 2, Math.abs(w1 - w0) * lv / 2] } });
    }
  }
  return { nR, xs, cot, segsOf, planes };
}
// geometría real de la mesa (seguidor.js): cara del módulo sobre el eje y viga
const O_OFF = 0.14, O_TUBE = 0.12, O_GLASS = 0.06, O_REC = 0.14 + 0.03;
// ¿el rayo P+t·s corta la CAJA (viga)? Método de lonjas, escalar (el oráculo no
// necesita el intervalo analítico: comprueba punto a punto)
function oracleHitsBox(P, s, box) {
  let t0 = 1e-6, t1 = 1e9;
  for (let k = 0; k < 3; k++) {
    const a = box.ax[k], h = box.hf[k];
    const A = (P[0] - box.C[0]) * a[0] + (P[1] - box.C[1]) * a[1] + (P[2] - box.C[2]) * a[2];
    const S = s[0] * a[0] + s[1] * a[1] + s[2] * a[2];
    if (Math.abs(S) < 1e-9) { if (Math.abs(A) > h) return false; continue; }
    let ta = (-h - A) / S, tb = (h - A) / S;
    if (ta > tb) { const w = ta; ta = tb; tb = w; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}
/* intervalo de cuerda bloqueado por la CAJA, por una vía DISTINTA a la del
   contador (que lo resuelve con álgebra de lonjas): aquí se corta la caja con
   el PLANO que barren los rayos {P0+u·c+t·s} — la sección es un polígono
   convexo cuyos vértices salen de las 12 aristas — y se proyecta sobre u.
   Exacto y algorítmicamente independiente. */
function oracleBoxIv(P0, c, s, box, hw) {
  const n = [c[1] * s[2] - c[2] * s[1], c[2] * s[0] - c[0] * s[2], c[0] * s[1] - c[1] * s[0]];
  if (Math.hypot(n[0], n[1], n[2]) < 1e-12) return null;
  const cor = [];
  for (let i = 0; i < 8; i++) {
    const s0 = (i & 1) ? 1 : -1, s1 = (i & 2) ? 1 : -1, s2 = (i & 4) ? 1 : -1;
    cor.push([0, 1, 2].map(k =>
      box.C[k] + s0 * box.hf[0] * box.ax[0][k] + s1 * box.hf[1] * box.ax[1][k] + s2 * box.hf[2] * box.ax[2][k]));
  }
  const ar = [];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) { const j = i ^ bit; if (j > i) ar.push([i, j]); }
  const cc = c[0] * c[0] + c[1] * c[1] + c[2] * c[2], ss = s[0] * s[0] + s[1] * s[1] + s[2] * s[2];
  const cs = c[0] * s[0] + c[1] * s[1] + c[2] * s[2], det = cc * ss - cs * cs;
  if (Math.abs(det) < 1e-12) return null;
  const pts = [];
  const f = X => (X[0] - P0[0]) * n[0] + (X[1] - P0[1]) * n[1] + (X[2] - P0[2]) * n[2];
  for (const [i, j] of ar) {
    const A = cor[i], B = cor[j], fA = f(A), fB = f(B);
    if ((fA > 0 && fB > 0) || (fA < 0 && fB < 0)) continue;
    const w = Math.abs(fA - fB) < 1e-15 ? 0 : fA / (fA - fB);
    const X = [A[0] + w * (B[0] - A[0]), A[1] + w * (B[1] - A[1]), A[2] + w * (B[2] - A[2])];
    const d = [X[0] - P0[0], X[1] - P0[1], X[2] - P0[2]];
    const dc = d[0] * c[0] + d[1] * c[1] + d[2] * c[2], ds = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
    pts.push({ u: (ss * dc - cs * ds) / det, t: (cc * ds - cs * dc) / det });
  }
  if (pts.length < 2) return null;
  // la sección es CONVEXA: envolvente en (u,t) y recorte por t≥0 — quedarse
  // solo con los vértices de t>0 truncaría el intervalo (subestimaba sombra)
  pts.sort((a, b) => a.u - b.u || a.t - b.t);
  const cr = (o, a, b) => (a.u - o.u) * (b.t - o.t) - (a.t - o.t) * (b.u - o.u);
  const low = [], up = [];
  for (const p of pts) { while (low.length >= 2 && cr(low[low.length - 2], low[low.length - 1], p) <= 0) low.pop(); low.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const poly = low.slice(0, -1).concat(up.slice(0, -1));
  if (poly.length < 2) return null;
  const EPS = 1e-6, keep = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const inA = A.t >= EPS, inB = B.t >= EPS;
    if (inA) keep.push(A);
    if (inA !== inB) { const w = (EPS - A.t) / ((B.t - A.t) || 1); keep.push({ u: A.u + w * (B.u - A.u), t: EPS }); }
  }
  if (keep.length < 2) return null;
  let lo = Math.min(...keep.map(p => p.u)), hi = Math.max(...keep.map(p => p.u));
  lo = Math.max(lo, -hw); hi = Math.min(hi, hw);
  return hi - lo > 1e-12 ? [lo, hi] : null;
}
// desplazamiento del receptor: su cara también está a O_OFF sobre el eje
function oracleOff(G, r, v0, v1, thR, T) {
  const cR = Math.cos(thR);
  const zOff = (T && T.z0 != null && isFinite(T.z0)) ? T.z0 : O_REC;
  const sRr = (G.cot(r, v1) - G.cot(r, v0)) / ((v1 - v0) || 1);
  const n = [Math.sin(thR), -cR * sRr, cR], l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [zOff * n[0] / l, zOff * n[1] / l, zOff * n[2] / l];
}
// terreno declarado: suelo = cota del eje interpolada − 2 m de buje;
// marcha de 4 m; bisección de 3 refinos desde el borde bajo. Sol < 25°.
function oracleTerr(G, sv, zen) {
  const HUB = 2.0, nR = G.nR, xs = G.xs;
  const gzOf = (x, v) => {
    if (x <= xs[0]) return G.cot(0, v) - HUB;
    if (x >= xs[nR - 1]) return G.cot(nR - 1, v) - HUB;
    let i = 0; while (i < nR - 2 && xs[i + 1] < x) i++;
    const f2 = (x - xs[i]) / ((xs[i + 1] - xs[i]) || 1);
    return (G.cot(i, v) * (1 - f2) + G.cot(i + 1, v) * f2) - HUB;
  };
  const zSky = (G.planes.length ? Math.max(...G.planes.map(p => p.C[2])) : 0) + 4;
  const doTerr = true;
  const blocked = (P0, P1, P2) => {
    const stepH = 4, horizC = Math.hypot(sv[0], sv[1]);
    if (horizC < 1e-6) return false;
    const dt = stepH / horizC, tMax = Math.min(650 / horizC, (xs[nR - 1] - xs[0] + 40) / Math.max(1e-6, Math.abs(sv[0])));
    for (let t2 = dt; t2 < tMax; t2 += dt) {
      const z = P2 + t2 * sv[2];
      if (z > zSky) return false;
      if (z < gzOf(P0 + t2 * sv[0], P1 + t2 * sv[1])) return true;
    }
    return false;
  };
  return { doTerr, blocked };
}
function oracleTerrFCol(G, terr, T, r, thR, v, fCol, off) {
  if (!terr.doTerr || fCol >= 1) return fCol;
  const hw = T.cw / 2;
  const uLo = Math.sin(thR) >= 0 ? hw : -hw, uHi = -uLo;
  // la cara receptora está O_OFF sobre el eje también aquí: con sol rasante
  // 14 cm cambian qué loma tapa y qué loma no
  const o = off || [0, 0, 0];
  const pt = (u2) => [G.xs[r] + u2 * Math.cos(thR) + o[0], v + o[1], G.cot(r, v) - u2 * Math.sin(thR) + o[2]];
  const pLo = pt(uLo);
  if (!terr.blocked(pLo[0], pLo[1], pLo[2])) return fCol;
  const pHi = pt(uHi);
  let tf = 1;
  if (!terr.blocked(pHi[0], pHi[1], pHi[2])) {
    let a = 0, b = 1;
    for (let it = 0; it < 3; it++) {
      const m = (a + b) / 2, um = uLo + (uHi - uLo) * m, pm = pt(um);
      if (terr.blocked(pm[0], pm[1], pm[2])) a = m; else b = m;
    }
    tf = (a + b) / 2;
  }
  return Math.max(fCol, tf);
}
// (a) cuerda analítica SIN podas
function oracleExact(F2, zen, az, T, rowAngles) {
  const RAD = Math.PI / 180;
  const G = oracleGeom(T, rowAngles);
  const azR = (az - T.axisAz) * RAD, el = (90 - zen) * RAD;
  const sv = [Math.sin(azR) * Math.cos(el), Math.cos(azR) * Math.cos(el), Math.sin(el)];
  const out = new Array(G.nR).fill(0);
  if (sv[2] <= 0) return out;
  const terr = oracleTerr(G, sv, zen);
  const hw = T.cw / 2, MV = 8;
  const elec = new Array(G.nR).fill(0);
  for (let r = 0; r < G.nR; r++) {
    const thR = rowAngles[r] * RAD, cR = Math.cos(thR), s2 = -Math.sin(thR);
    let acc = 0, n = 0, elecSum = 0;
    for (const sg of G.segsOf(r)) {
      const v0 = Math.min(sg[0], sg[1]), v1 = Math.max(sg[0], sg[1]);
      const off = oracleOff(G, r, v0, v1, thR, T);
      for (let j = 0; j < MV; j++) {
        const v = v0 + (v1 - v0) * (j + 0.5) / MV, zR = G.cot(r, v);
        const px0 = G.xs[r] + off[0], py0 = v + off[1], pz0 = zR + off[2];
        const ivs = [];
        for (const pl of G.planes) {
          if (pl.e === r) continue;
          const den = pl.nE[0] * sv[0] + pl.nE[1] * sv[1] + pl.nE[2] * sv[2];
          if (Math.abs(den) < 1e-9) continue;
          const t0 = (pl.C[0] - px0) * pl.nE[0] + (pl.C[1] - py0) * pl.nE[1] + (pl.C[2] - pz0) * pl.nE[2];
          const tc = cR * pl.nE[0] + s2 * pl.nE[2];
          let lo = -hw, hi = hw, ok = true;
          const lin = (A, B) => {
            if (A > 1e-12) { const x = B / A; if (x < hi) hi = x; }
            else if (A < -1e-12) { const x = B / A; if (x > lo) lo = x; }
            else if (B < -1e-12) ok = false;
          };
          if (den > 0) lin(tc, t0 - 1e-6 * den); else lin(-tc, 1e-6 * den - t0);
          const q = sv[1] / den;
          lin(q * tc, py0 + q * t0 - pl.w0);
          lin(-q * tc, pl.w1 - py0 - q * t0);
          const a0 = (px0 - pl.C[0]) * pl.uD[0] + (py0 - pl.C[1]) * pl.uD[1] + (pz0 - pl.C[2]) * pl.uD[2];
          const a1 = cR * pl.uD[0] + s2 * pl.uD[2];
          const a2 = sv[0] * pl.uD[0] + sv[1] * pl.uD[1] + sv[2] * pl.uD[2];
          const d0 = a0 + a2 * t0 / den, dc = a1 - a2 * tc / den;
          lin(dc, hw - d0); lin(-dc, hw + d0);
          if (ok && hi - lo > 1e-12) ivs.push([lo, hi]);
          // VIGA por MÉTODO DISTINTO al del contador (sección de la caja
          // con el plano de los rayos, exacta — ver oracleBoxIv)
          const ivT = oracleBoxIv([px0, py0, pz0], [cR, 0, s2], sv, pl.tb, hw);
          if (ivT) ivs.push(ivT);
          const ivS = oracleBoxIv([px0, py0, pz0], [cR, 0, s2], sv, pl.sl, hw);   // CANTO
          if (ivS) ivs.push(ivS);
        }
        let fCol = 0;
        if (ivs.length) {
          ivs.sort((a, b) => a[0] - b[0]);
          let len = 0, cl = ivs[0][0], ch = ivs[0][1];
          for (let k = 1; k < ivs.length; k++) {
            if (ivs[k][0] > ch) { len += ch - cl; cl = ivs[k][0]; ch = ivs[k][1]; }
            else if (ivs[k][1] > ch) ch = ivs[k][1];
          }
          fCol = Math.min(1, (len + ch - cl) / T.cw);
        }
        fCol = oracleTerrFCol(G, terr, T, r, thR, v, fCol, off);
        acc += fCol; n++;
        elecSum += F2.elecLoss(fCol, T.nBypass);
      }
    }
    out[r] = n ? acc / n : 0;
    elec[r] = n ? elecSum / n : 0;
  }
  out.elec = elec;
  return out;
}
// (b) muestreo bruto de la cuerda (MU puntos) — filas receptoras rowSet
function oracleBrute(F2, zen, az, T, rowAngles, MU, rowSet) {
  const RAD = Math.PI / 180;
  const G = oracleGeom(T, rowAngles);
  const azR = (az - T.axisAz) * RAD, el = (90 - zen) * RAD;
  const sv = [Math.sin(azR) * Math.cos(el), Math.cos(azR) * Math.cos(el), Math.sin(el)];
  const out = {};
  if (sv[2] <= 0) { for (const r of rowSet) out[r] = 0; return out; }
  const terr = oracleTerr(G, sv, zen);
  const hw = T.cw / 2, MV = 8;
  for (const pl of G.planes) pl.den = pl.nE[0] * sv[0] + pl.nE[1] * sv[1] + pl.nE[2] * sv[2];
  for (const r of rowSet) {
    const thR = rowAngles[r] * RAD;
    let acc = 0, n = 0;
    for (const sg of G.segsOf(r)) {
      const v0 = Math.min(sg[0], sg[1]), v1 = Math.max(sg[0], sg[1]);
      const off = oracleOff(G, r, v0, v1, thR, T);
      for (let j = 0; j < MV; j++) {
        const v = v0 + (v1 - v0) * (j + 0.5) / MV, zR = G.cot(r, v);
        let colHit = 0;
        for (let i = 0; i < MU; i++) {
          const u = -hw + T.cw * (i + 0.5) / MU;
          const P0 = G.xs[r] + u * Math.cos(thR) + off[0], P1 = v + off[1], P2 = zR - u * Math.sin(thR) + off[2];
          let sh = false;
          for (const pl of G.planes) {
            if (pl.e === r || Math.abs(pl.den) < 1e-9) continue;
            if (oracleHitsBox([P0, P1, P2], sv, pl.tb)) { sh = true; break; }   // VIGA
            if (oracleHitsBox([P0, P1, P2], sv, pl.sl)) { sh = true; break; }   // CANTO
            const t2 = ((pl.C[0] - P0) * pl.nE[0] + (pl.C[1] - P1) * pl.nE[1] + (pl.C[2] - P2) * pl.nE[2]) / pl.den;
            if (t2 <= 1e-6) continue;
            const H1 = P1 + t2 * sv[1];
            if (H1 < pl.w0 || H1 > pl.w1) continue;
            const H0 = P0 + t2 * sv[0], H2 = P2 + t2 * sv[2];
            const du = (H0 - pl.C[0]) * pl.uD[0] + (H1 - pl.C[1]) * pl.uD[1] + (H2 - pl.C[2]) * pl.uD[2];
            if (Math.abs(du) <= hw) { sh = true; break; }
          }
          if (sh) colHit++;
        }
        let fCol = colHit / MU;
        fCol = oracleTerrFCol(G, terr, T, r, thR, v, fCol, off);
        acc += fCol; n++;
      }
    }
    out[r] = n ? acc / n : 0;
  }
  return out;
}
function ayoraPlantT() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(data, 500, 0);
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
           nBypass: 3, rowTilt: P.tilt, groups: P.groups, drive: 'bifila', segs: P.segs, real: P };
}
const AYORA_LL = [39.1182081, -1.1598527];
function findElevCase(day, lo, hi) {
  for (let m = 0; m < 720; m += 5) {
    const g = F.solarPos(day + m * 60000, AYORA_LL[0], AYORA_LL[1]);
    if (g.elev >= lo && g.elev <= hi) return g;
  }
  return null;
}
t('ORÁCULO de podas: contador ≡ cuerda analítica SIN podas (Ayora, 4 regímenes, ≤0,1 pp)', () => {
  const T = ayoraPlantT();
  const cases = [];
  for (const [lo, hi, tag] of [[1.5, 4, 'rasante'], [10, 14, 'terreno'], [20, 24.9, 'torsión']])
    cases.push({ tag: 'dic-' + tag, g: findElevCase(Date.UTC(2026, 11, 21), lo, hi) });
  cases.push({ tag: 'jun-rasante', g: findElevCase(Date.UTC(2026, 5, 21), 1.5, 4) });
  for (const c of cases) {
    if (!c.g) throw new Error(c.tag + ': sin instante');
    const ang = F.anglesPairwise(c.g.zen, c.g.az, T);
    const pub = F.shadeRows(c.g.zen, c.g.az, T, ang);
    const ora = oracleExact(F, c.g.zen, c.g.az, T, ang);
    for (let r = 0; r < pub.length; r++) {
      if (Math.abs(pub[r] - ora[r]) > 1e-3)
        throw new Error(`${c.tag} fila ${r}: pub ${pub[r].toFixed(4)} vs oráculo ${ora[r].toFixed(4)} — una poda pierde sombra`);
      if (Math.abs(pub.elec[r] - ora.elec[r]) > 1e-3)
        throw new Error(`${c.tag} fila ${r}: elec pub ${pub.elec[r].toFixed(4)} vs oráculo ${ora.elec[r].toFixed(4)}`);
    }
  }
});
t('CONVERGENCIA: MV=8 vs MV=32 en rasante ≤0,7 pp de media de planta (estudio: anual +0,007%)', () => {
  // punto 1 de la auditoría: con la cuerda analítica solo queda MV como
  // discretización; el estudio (Ayora, 12 días) midió MV=8 a +0,007% del
  // refinado MV=64 en el anual y ≤0,52 pp de media de planta en el peor
  // instante rasante. Esta guarda evita que una regresión lo empeore.
  const T = ayoraPlantT();
  const g = findElevCase(Date.UTC(2026, 11, 21), 1.5, 4);
  const ang = F.anglesPairwise(g.zen, g.az, T);
  const f8 = F.shadeBand3DAll(g.zen, g.az, T, ang);
  const f32 = F.shadeBand3DAll(g.zen, g.az, T, ang, { MV: 32 });
  const m8 = f8.reduce((s, v) => s + v, 0) / f8.length;
  const m32 = f32.reduce((s, v) => s + v, 0) / f32.length;
  if (Math.abs(m8 - m32) > 7e-3)
    throw new Error(`media de planta MV=8 ${(m8 * 100).toFixed(2)}% vs MV=32 ${(m32 * 100).toFixed(2)}% — la malla axial por defecto ya no converge`);
});
t('ORÁCULO de método: cuerda analítica ≡ muestreo bruto MU=192 (Ayora, ≤0,3 pp)', () => {
  const T = ayoraPlantT();
  const nR = T.pairs.length + 1;
  const rowSet = []; for (let r = 0; r < Math.min(16, nR); r++) rowSet.push(r);
  const cases = [
    { tag: 'dic-rasante', g: findElevCase(Date.UTC(2026, 11, 21), 1.5, 4) },
    { tag: 'jun-torsión', g: findElevCase(Date.UTC(2026, 5, 21), 20, 24.9) },
  ];
  for (const c of cases) {
    if (!c.g) throw new Error(c.tag + ': sin instante');
    const ang = F.anglesPairwise(c.g.zen, c.g.az, T);
    const pub = F.shadeRows(c.g.zen, c.g.az, T, ang);
    const bru = oracleBrute(F, c.g.zen, c.g.az, T, ang, 192, rowSet);
    for (const r of rowSet)
      if (Math.abs(pub[r] - bru[r]) > 3e-3)
        throw new Error(`${c.tag} fila ${r}: pub ${pub[r].toFixed(4)} vs bruto192 ${bru[r].toFixed(4)} — la unión de intervalos discrepa del muestreo`);
  }
});

t('v1.27: óptimo libre ≥ óptimo común BAJO EL CONTADOR EXACTO (elección por instante)', () => {
  // punto 4 de la auditoría: el buscador rápido es ciego a la torsión y el
  // libre podía rendir menos que el común bajo la métrica publicada; ahora
  // elige entre ambos con el ray-cast — invariante por construcción
  if (!/ELECCIÓN EXACTA/.test(html)) throw new Error('sin elección exacta en el óptimo libre');
  const T = ayoraPlantT();
  for (const [lo, hi] of [[1.5, 4], [20, 24.9]]) {
    const g = findElevCase(Date.UTC(2026, 11, 21), lo, hi);
    const irr = F.clearskyIneichen(g.zen, 355, 739, 3.5);
    const aC = F.anglesOptimal(g.zen, g.az, T, irr, 355, 0.20).angles;
    const aF = policyFree(g, T, irr);
    const pC = F.poaPlant(g.zen, g.az, T, aC, irr, 355, 0.20).plant;
    const pF = F.poaPlant(g.zen, g.az, T, aF, irr, 355, 0.20).plant;
    if (pF < pC - 1e-9)
      throw new Error(`elev ${g.elev.toFixed(1)}°: libre ${pF.toFixed(2)} < común ${pC.toFixed(2)} bajo el contador exacto`);
  }
  function policyFree(g, T, irr) {
    return F.anglesOptimalFree(g.zen, g.az, T, irr, 355, 0.20).angles;
  }
});
t('eléctrico: pérdida por fila ≥ sombra óptica (elecLoss amplifica, nunca regala)', () => {
  // punto 2 de la auditoría (cota inferior del sándwich): el Martinez por
  // estación siempre carga al menos el área sombreada — medido en el año:
  // óptica sola 2806,0 · publicado 2760,3 (−1,63% de amplificación) ·
  // banda uniforme 2582,0 (−7,98%, el modelo del −8% espurio)
  const T = ayoraPlantT();
  const g = findElevCase(Date.UTC(2026, 11, 21), 1.5, 4);
  const ang = F.anglesPairwise(g.zen, g.az, T);
  const sh = F.shadeRows(g.zen, g.az, T, ang);
  for (let r = 0; r < sh.length; r++)
    if (sh.elec[r] < sh[r] - 1e-9)
      throw new Error(`fila ${r}: elec ${sh.elec[r].toFixed(4)} < sombra ${sh[r].toFixed(4)}`);
});
t('v1.29: el contador separa PLANOS de estructura y el desglose es coherente', () => {
  // out.pl = sombra sin la estructura de la mesa (terreno incluido, como en
  // out): 0 ≤ pl ≤ total, y con noStruct el total coincide con pl
  const T = ayoraPlantT();
  for (const [lo, hi] of [[1.5, 4], [10, 14], [20, 24.9]]) {
    const g = findElevCase(Date.UTC(2026, 11, 21), lo, hi);
    const ang = F.anglesPairwise(g.zen, g.az, T);
    const sh = F.shadeRows(g.zen, g.az, T, ang);
    if (!sh.pl) throw new Error('el contador no expone la sombra de planos');
    const ns = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
    for (let r = 0; r < sh.length; r++) {
      if (sh.pl[r] > sh[r] + 1e-9) throw new Error(`fila ${r}: planos ${sh.pl[r].toFixed(4)} > total ${sh[r].toFixed(4)}`);
      if (sh.pl[r] < -1e-9) throw new Error(`fila ${r}: planos negativo`);
      if (Math.abs(sh.pl[r] - ns[r]) > 1e-9)
        throw new Error(`fila ${r}: pl ${sh.pl[r].toFixed(6)} ≠ noStruct ${ns[r].toFixed(6)}`);
    }
  }
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

t('v1.31.1: el veto exacto vale A TODAS LAS HORAS (pendiente 8° · mono · 21-jun)', () => {
  // el barrido de invariantes cazó que con el veto limitado a zen>65 el óptimo
  // salía −0,47% POR DEBAJO de pairwise con sol alto: el evaluador rápido es
  // ciego a la estructura (v1.28) y al circunsolar tapado (v1.31), así que
  // «con sol alto más beam siempre gana» dejó de ser cierto
  const n = 12, pitch = 6.0, cw = 2.382;
  const T = {
    pairs: Array.from({ length: n - 1 }, () => ({ slope: 8, pitch, axisTilt: 0 })),
    cw, axisAz: 0, maxAngle: 55, gcr: cw / pitch, z0: 0.17, nBypass: 3, iam: 0.05,
    rowTilt: new Array(n).fill(0), groups: null, drive: 'mono',
    segs: Array.from({ length: n }, () => [[-30, 30]]),
  };
  const day = Date.UTC(2026, 5, 21), doy = 172;
  const acc = { pairwise: 0, optimal: 0, optfree: 0, astro: 0 };
  for (let m = 0; m < 1440; m += 20) {
    const g = F.solarPos(day + m * 60000, 39.1, -1.16);
    if (g.elev <= 0) continue;
    const irr = F.clearskyIneichen(g.zen, doy, 700, 3.5);
    for (const k of Object.keys(acc)) {
      const ang = F.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles;
      acc[k] += F.poaPlant(g.zen, g.az, T, ang, irr, doy, 0.2).plant;
    }
  }
  for (const k of ['optimal', 'optfree'])
    if (acc[k] < acc.pairwise - 1e-6)
      throw new Error(`${k} ${(100 * (acc[k] / acc.pairwise - 1)).toFixed(3)}% por DEBAJO de pairwise con sol alto`);
  if (acc.optimal < acc.astro - 1e-6) throw new Error('óptimo por debajo de astro');
  if (acc.optfree < acc.optimal - 1e-6) throw new Error('libre por debajo del óptimo común');
});
t('v1.31.1 estático: el veto NO está condicionado al cenit', () => {
  if (/if\(zen>\d+&&\(bestF>0\|\|bestF<1\)\)/.test(html))
    throw new Error('el veto exacto volvió a quedar limitado a una banda de cenit');
});
t('v1.31 estático: el IAM está en la página, cableado, y NINGÚN camino lo pierde', () => {
  if (!/id="iam"[^>]*value="0\.05"/.test(html)) throw new Error('falta el campo IAM b₀ con 0,05');
  if (!/iam:\+\$\('iam'\)\.value/.test(html)) throw new Error('cfg() no lee el campo IAM');
  if ((html.match(/iam:c\.iam/g) || []).length < 2) throw new Error('el IAM no llega a los DOS ensamblados de T');
  if (!/INPUT_IDS=\[[^\]]*'iam'/.test(html)) throw new Error('el IAM no se persiste con los demás campos');
  // el bug que esto veta: un poaRow() sin b₀ calcula SIN IAM y contradice al
  // contador publicado en la misma pantalla (pasó en dayKpis, v1.31)
  const qa = html.indexOf('function runPhysicsQA'), finQa = html.indexOf('/* FIN-FÍSICA');
  const decl = html.indexOf('function poaRow(') + 'function '.length;
  let vistos = 0;
  for (let i = html.indexOf('poaRow('); i >= 0; i = html.indexOf('poaRow(', i + 1)) {
    if (i === decl) continue;                                  // la declaración
    if (qa > 0 && i > qa && i < finQa) continue;               // la QA prueba b₀ ausente a propósito
    vistos++;
    let d = 0, j = i + 6, args = '';                           // scanner de paréntesis balanceados
    for (; j < html.length; j++) {
      const ch = html[j];
      if (ch === '(') d++;
      else if (ch === ')') { d--; if (d === 0) break; }
      args += ch;
    }
    const nArgs = args.slice(1).split(/,(?![^(\[]*[)\]])/).length;
    if (nArgs < 9) throw new Error(`poaRow con ${nArgs} argumentos (falta el IAM): ` + args.slice(0, 80));
  }
  if (vistos < 3) throw new Error('el escáner solo vio ' + vistos + ' llamadas a poaRow: no está mirando donde debe');
});
t('v1.31 estático: la tabla del día PUBLICA la banda y avisa si cruza el cero', () => {
  if (!/Δ vs pairwise \(banda\)/.test(html)) throw new Error('la cabecera no anuncia la banda');
  if (!/const cruza=bl<-1e-9&&bh>1e-9/.test(html)) throw new Error('no se detecta el cruce por cero');
  if (!/td \.cruza\{color:var\(--warn\)\}/.test(html)) throw new Error('el cruce no se marca en ámbar');
  if (!/poaHi:poaHi,poaLo:poaLo/.test(html)) throw new Error('el día no guarda las cotas por paso');
});
t('v1.31 IAM: b₀=0 es transparente, ASHRAE es decreciente y 60° vale 0,95', () => {
  for (const aoi of [0, 15, 30, 45, 60, 75, 89])
    if (F.iamAshrae(aoi, 0) !== 1) throw new Error('b₀=0 no es transparente en AOI ' + aoi);
  if (Math.abs(F.iamAshrae(0, 0.05) - 1) > 1e-12) throw new Error('AOI 0 ≠ 1');
  // 1 − b₀·(1/cos 60 − 1) = 1 − 0,05·(2−1) = 0,95, valor de libro
  if (Math.abs(F.iamAshrae(60, 0.05) - 0.95) > 1e-12) throw new Error('AOI 60 ≠ 0,95');
  let prev = 1.000001;
  for (let a = 0; a <= 89; a += 1) {
    const k = F.iamAshrae(a, 0.05);
    if (k > prev + 1e-12) throw new Error('IAM no decreciente en AOI ' + a);
    if (k < 0 || k > 1) throw new Error('IAM fuera de [0,1] en AOI ' + a);
    prev = k;
  }
  if (F.iamAshrae(90, 0.05) !== 0) throw new Error('AOI 90 ≠ 0 (rasante debe anular)');
  if (F.iamAshrae(120, 0.05) !== 0) throw new Error('AOI > 90 ≠ 0');
});

t('v1.31 IAM: el sesgo va A FAVOR de astro — es el término que empuja al otro lado', () => {
  // el astronómico apunta al sol (AOI≈0, IAM≈1) y el backtracking se gira
  // fuera (AOI grande, IAM<1): activar el IAM tiene que MEJORAR la razón
  // astro/pairwise. Si algún día sale al revés, el IAM está mal aplicado.
  const T0 = ayoraPlantT();
  const g = findElevCase(Date.UTC(2026, 11, 21), 8, 12);   // sol bajo: horas de BT
  const irr = F.clearskyIneichen(g.zen, 355, 700, 3.5);
  const ratio = (b0) => {
    const T = Object.assign({}, T0, { iam: b0 });
    const pw = F.poaPlant(g.zen, g.az, T, F.anglesPairwise(g.zen, g.az, T), irr, 355, 0.2).plant;
    const as = F.poaPlant(g.zen, g.az, T, F.anglesAstro(g.zen, g.az, T), irr, 355, 0.2).plant;
    return as / pw;
  };
  const sin = ratio(0), con = ratio(0.05);
  if (!(con > sin + 1e-9))
    throw new Error(`el IAM no favorece a astro: sin ${sin.toFixed(5)} → con ${con.toFixed(5)}`);
});

t('v1.31 circunsolar: la sombra lo tapa, y la BANDA es un sándwich lo ≤ pub ≤ hi', () => {
  const T = Object.assign({}, ayoraPlantT(), { iam: 0.05 });
  let visto = 0;
  // sol bajo y medio en diciembre, y sol ALTO en junio (en diciembre a esta
  // latitud no se llega a 40° de elevación: no existe el caso)
  for (const [ms, doy, lo, hi] of [[Date.UTC(2026, 11, 21), 355, 1.5, 4],
                                   [Date.UTC(2026, 11, 21), 355, 8, 12],
                                   [Date.UTC(2026, 11, 21), 355, 20, 24.9],
                                   [Date.UTC(2026, 5, 21), 172, 60, 70]]) {
    const g = findElevCase(ms, lo, hi);
    if (!g) throw new Error(`no hay instante con elevación ${lo}-${hi}`);
    const irr = F.clearskyIneichen(g.zen, doy, 700, 3.5);
    for (const pol of ['anglesPairwise', 'anglesAstro']) {
      const ang = F[pol](g.zen, g.az, T);
      const p = F.poaPlant(g.zen, g.az, T, ang, irr, doy, 0.2);
      if (!(p.plantLo <= p.plant + 1e-9 && p.plant <= p.plantHi + 1e-9))
        throw new Error(`banda rota (${pol}, elev ${lo}-${hi}): ${p.plantLo} / ${p.plant} / ${p.plantHi}`);
      const sombra = p.shade.reduce((s, v) => Math.max(s, v), 0);
      if (sombra > 1e-3 && p.plantHi > p.plant + 1e-9) visto++;
      // sin sombra no hay nada que tapar: la banda COLAPSA
      if (sombra <= 1e-12 && Math.abs(p.plantHi - p.plant) > 1e-9)
        throw new Error(`sin sombra la banda no colapsa (${pol}, elev ${lo}-${hi})`);
    }
  }
  if (visto === 0) throw new Error('ningún caso con sombra movió el circunsolar: ¿se está sombreando?');
});

t('v1.31 banda: plantHi reproduce el circunsolar SIN sombrear (lo de ≤v1.30)', () => {
  // reconstruido desde poaRow, independiente del acumulador de poaPlant
  const T = Object.assign({}, ayoraPlantT(), { iam: 0.05 });
  const g = findElevCase(Date.UTC(2026, 11, 21), 8, 12);
  const irr = F.clearskyIneichen(g.zen, 355, 700, 3.5);
  const ang = F.anglesPairwise(g.zen, g.az, T);
  const p = F.poaPlant(g.zen, g.az, T, ang, irr, 355, 0.2);
  let extra = 0;
  for (let r = 0; r < ang.length; r++) {
    const tilt = (T.rowTilt && T.rowTilt[r] != null) ? T.rowTilt[r] : 0;
    const pr = F.poaRow(ang[r], tilt, T.axisAz, g.zen, g.az, irr, 355, 0.2, T.iam);
    extra += pr.circ * Math.max(0, Math.min(1, p.shade[r] || 0));
  }
  extra /= ang.length;
  if (Math.abs((p.plant + extra) - p.plantHi) > 1e-9)
    throw new Error(`plantHi ${p.plantHi.toFixed(6)} ≠ plant+extra ${(p.plant + extra).toFixed(6)}`);
});

t('v1.31 Perez: el desglose SUMA lo mismo que la fórmula agregada (clamp por componente)', () => {
  // al separar el circunsolar el recorte a ≥0 pasa a ser por componente: solo
  // puede diferir cuando isótropa+horizonte sola sale negativa. Se ACOTA aquí.
  let peor = 0;
  for (const zen of [10, 35, 55, 70, 80, 86]) {
    const irr = F.clearskyIneichen(zen, 172, 700, 3.5);
    if (!(irr.ghi > 0)) continue;
    for (const th of [-55, -30, 0, 30, 55]) {
      const p = F.poaRow(th, 0, 0, zen, 150, irr, 172, 0.2, 0);
      for (const [k, v] of Object.entries(p)) if (v < -1e-12) throw new Error('componente negativa: ' + k);
      // fórmula agregada de ≤v1.30, recortada UNA vez sobre el total del cielo
      const o = F.surfaceOrient(th, 0, 0), b = o.tilt * Math.PI / 180, z = zen * Math.PI / 180;
      const cosAoi = Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((150 - o.az) * Math.PI / 180);
      const kap = 1.041, z3 = z * z * z;
      const eps = ((irr.dhi + irr.dni) / irr.dhi + kap * z3) / (1 + kap * z3);
      let bin = 7; for (let i = 0; i < 7; i++) { if (eps < F.PEREZ_BINS[i]) { bin = i; break; } }
      const Fc = F.PEREZ_F[bin];
      const delta = irr.dhi * F.airmassKY(zen) / F.dniExtra(172);
      const F1 = Math.max(0, Fc[0] + Fc[1] * delta + z * Fc[2]);
      const F2 = Fc[3] + Fc[4] * delta + z * Fc[5];
      const A = Math.max(0, cosAoi), B = Math.max(Math.cos(85 * Math.PI / 180), Math.cos(z));
      const skyOld = Math.max(0, irr.dhi * ((1 - F1) * (1 + Math.cos(b)) / 2 + F1 * A / B + F2 * Math.sin(b)));
      const oldTot = irr.dni * Math.max(0, cosAoi) + skyOld + irr.ghi * 0.2 * (1 - Math.cos(b)) / 2;
      peor = Math.max(peor, Math.abs(p.total - oldTot) / Math.max(1, oldTot));
    }
  }
  if (peor > 2e-3) throw new Error('el clamp por componente desvía ' + (100 * peor).toFixed(3) + '% (>0,2%)');
});

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
