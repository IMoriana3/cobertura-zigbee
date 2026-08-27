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
import { execFileSync } from 'node:child_process';
const require_child = () => ({ execFileSync });

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');

/* El cuerpo EXACTO de una función del HTML, contando llaves. Buscar «hasta el
   siguiente `function`» ya ha fallado dos veces: primero se tragaba terrain()
   entera y saltaba por un `pitch:` ajeno, y luego el comentario de aplicaFicha.
   Un test que analiza el trozo equivocado no protege nada. */
function cuerpoFn(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}

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

/* El bloque de FÍSICA PURA ya no lleva dentro el sol: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Aquí se antepone,
   igual que hace el navegador, o el bloque extraído se quedaría sin `Sol`. */
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8');

const sandbox = new Function(sol + '\n' + src + `
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


/* ── el sol, de `sol.js` y de ningún otro sitio ─────────────────────────────
   Había TRES copias de la posición NOAA y del `singleaxis`: aquí, en la otra
   página y en el módulo. Esto exige que no vuelva a haber una cuarta. */
t('el sol se carga del módulo, no está escrito en la página', () => {
  if (!/<script src="sol\.js/.test(html)) throw new Error('la página no carga sol.js');
  const propias = (html.match(/\nfunction (solarPos|singleaxis|trueTrackAngle|refraction)\s*\(/g) || []);
  if (propias.length) throw new Error('copia propia de: ' + propias.join(' ').replace(/\n/g, ''));
});
t('y la estética del 3D es la receta de la casa, con el cénit abriendo a elev/35', () => {
  /* Al portar la receta al módulo se coló un `elev/60`: el cénit aclaraba más
     despacio que en los 3D de la casa. Aquí se fija contra los coeficientes
     literales que llevaba esta página, que son el original. */
  const S = new Function(fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + ';return Sol;').call({});
  for (const e of [40, 12, 4, 0.5, -2, -9]) {
    const up = Math.min(1, Math.max(0, e / 35)), w = Math.max(0, Math.min(1, (12 - e) / 12));
    const tw = Math.max(0, (e + 8) / 8);
    const top = e > 0 ? [0.04 + 0.09 * up, 0.07 + 0.12 * up, 0.14 + 0.22 * up] : [0.028, 0.038, 0.065];
    const hor = e > 0 ? [0.20 + 0.25 * up + 0.62 * w * (1 - 0.5 * up),
                         0.28 + 0.30 * up + 0.20 * w * (1 - 0.5 * up), 0.42 + 0.35 * up - 0.20 * w]
                      : [0.05 + 0.55 * tw, 0.055 + 0.19 * tw, 0.08 + 0.03 * tw];
    const K = S.skyColors(e), L = S.sunLook(e);
    const casa = (a2, b2) => a2.every((v, i) => Math.abs(v - b2[i]) < 1e-12);
    if (!casa(K.top, top) || !casa(K.hor, hor)) throw new Error('cielo a ' + e + '°: ' + JSON.stringify([K.top, K.hor]));
    if (Math.abs(L.color[1] - (0.93 - 0.38 * w)) > 1e-12 || Math.abs(L.intensity - (1.45 - 0.25 * w)) > 1e-12
        || Math.abs(L.hemi - (0.55 + 0.15 * w)) > 1e-12) throw new Error('luz a ' + e + '°');
  }
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

t('v1.33: al cargar planta real las políticas de ASESORÍA se apagan, y se DICE', () => {
  // medido: a 80 líneas optimal+optfree son 4,6 s de los 5,5 s del día. Son
  // justo las que la página marca como asesoría (evaluador provisional), así
  // que con planta real arrancan apagadas — pero apagarlas en silencio sería
  // peor que la lentitud: el usuario tiene que saber qué le falta y por qué
  if (!/const caros=POLICIES\.filter\(P=>P\.brain==='ncu'&&P\.on&&P\.key!=='mgl'\)/.test(html))
    throw new Error('no se seleccionan las políticas caras al cargar planta real');
  if (!/OPT_AVISADO=true;/.test(html)) throw new Error('falta el testigo: las apagaría en CADA carga');
  // se comprueba la PROPIEDAD —que el aviso acabe DENTRO de la nota— y no el
  // texto que tiene al lado: fijar el vecino hacía fallar el test cada vez que
  // se insertaba otro aviso, que es ruido, no una regresión
  if (!/avisoCaras=/.test(html)) throw new Error('no se arma el aviso');
  {
    const i0n = html.indexOf("note.innerHTML='<b>'+name+'</b> (cotas reales");
    const stmt = html.slice(i0n, html.indexOf(';', html.indexOf('avisoCaras', i0n)) + 1);
    if (!/\+avisoCaras/.test(stmt))
      throw new Error('se apagan sin decirlo en la nota de la planta');
  }
  // el aviso se arma ANTES de la nota: si no, la nota se pinta sin él
  const iAviso = html.indexOf('avisoCaras=' + "'" + ' <b>');
  const iNota = html.indexOf("note.innerHTML='<b>'+name+'</b> (cotas reales");
  if (!(iAviso > 0 && iNota > 0 && iAviso < iNota))
    throw new Error('el aviso se calcula DESPUÉS de pintar la nota: no se vería');
  // y nunca puede dejar el día sin ninguna política
  if (!/if\(!POLICIES\.some\(P=>P\.on\)\)POL\['pairwise'\]\.on=true;[\s\S]{0,80}buildPolicyBox\(\);/.test(html))
    throw new Error('podría dejar CERO políticas encendidas');
});
t('v1.33: el GATE declara su precondición en vez de heredar el default de la UI', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'tools', 'release_gate.mjs'), 'utf-8');
  if (!/for \(const k of \['optimal', 'optfree'\]\)/.test(gate))
    throw new Error('el gate no reenciende las políticas que valida');
  if (!/i\.checked = true; i\.onchange\(\);/.test(gate))
    throw new Error('el gate marca la casilla pero no dispara el recálculo');
});

t('v1.33 ficha TCU: UNE el levantamiento con la identidad, y aborta si deja de casar', () => {
  const ep = path.join(ROOT, 'tools', 'export_config_tcu.mjs');
  if (!fs.existsSync(ep)) throw new Error('sin tools/export_config_tcu.mjs');
  const src = fs.readFileSync(ep, 'utf-8');
  // no debe RECALCULAR pendientes: la configuración por TCU ya existe publicada
  if (!/NO recalcula pendientes/.test(src))
    throw new Error('el exportador no declara que une en vez de recalcular');
  const { execFileSync } = require_child();
  execFileSync(process.execPath, [ep, 'ayora'], { cwd: ROOT, stdio: 'pipe' });
  const csv = fs.readFileSync(path.join(ROOT, 'config_tcu_ayora.csv'), 'utf-8').trim().split('\n');
  const cab = csv[0].split(',');
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  if (csv.length - 1 !== cotas.t.length)
    throw new Error(`${csv.length - 1} filas para ${cotas.t.length} seguidores`);
  const iV = cab.indexOf('este_vector_pct'), iR = cab.indexOf('r41102_east_grade_rad');
  const iA = cab.indexOf('este_azimut_deg'), iRA = cab.indexOf('r41104_east_grade_azimuth_rad');
  const iNcu = cab.indexOf('ncu'), iTcu = cab.indexOf('tcu');
  for (const k of [iV, iR, iA, iRA, iNcu, iTcu]) if (k < 0) throw new Error('la cabecera perdió una columna');
  let n = 0, sinId = 0;
  for (let r = 1; r < csv.length; r++) {
    const f = csv[r].split(',');
    if (f[iNcu] === '' || f[iTcu] === '') sinId++;
    if (f[iV] === '' || f[iR] === '') continue;
    // % → rad del registro: atan(p/100). Y grados → rad para el azimut.
    if (Math.abs(parseFloat(f[iR]) - Math.atan(parseFloat(f[iV]) / 100)) > 1e-6)
      throw new Error(`fila ${r}: la pendiente no va en rad del registro`);
    if (f[iA] !== '' && Math.abs(parseFloat(f[iRA]) - parseFloat(f[iA]) * Math.PI / 180) > 1e-6)
      throw new Error(`fila ${r}: el azimut no va en rad del registro`);
    n++;
  }
  if (sinId) throw new Error(`${sinId} seguidores sin NCU/TCU: no se podrían cruzar con el diagnóstico`);
  if (n < cotas.t.length * 0.9) throw new Error('casi ninguna fila trae registro: ¿se está emitiendo?');
  // el guard que importa: San José NO casa con su levantamiento (máximo 25,0%
  // frente a 49,6%), y el exportador tiene que ABORTAR en vez de emparejar a ojo
  let abortó = false;
  try { execFileSync(process.execPath, [ep, 'sanjose'], { cwd: ROOT, stdio: 'pipe' }); }
  catch (e) { abortó = true; }
  if (!abortó) throw new Error('San José no casa con su levantamiento y el exportador NO abortó');
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'config_tcu_ayora.meta.json'), 'utf-8'));
  if (!meta.NO_DERIVADO || !meta.AVISO_41106 || !meta.autocomprobacion)
    throw new Error('el .meta.json no declara lo que no deriva, el 41106 o la autocomprobación');
  if (!/tcu_v6\.json/.test(JSON.stringify(meta.AVISO_41106)))
    throw new Error('el aviso del 41106 dejó de citar el documento: vuelve a ser una corazonada');
  if (meta.autocomprobacion.peor_desvio_pp > 0.05)
    throw new Error('la relación vector/azimut ya no reproduce la transversal');
});
t('v1.34 cruce: el diagnóstico REAL casa con el simulador, y lo dudoso se marca', () => {
  const ep = path.join(ROOT, 'tools', 'cruce_diagnostico.mjs');
  if (!fs.existsSync(ep)) throw new Error('sin tools/cruce_diagnostico.mjs');
  const src = fs.readFileSync(ep, 'utf-8');
  // el emparejado por el número del id apareaba 591 de 748 y NO se notaba con
  // sol alto: el TCU del diagnóstico es el RANGO dentro de su NCU
  if (!/v\.sort\(\(a, b\) => a\.nnn - b\.nnn\)/.test(src) || !/SEG\.set\(`\$\{ncu\}\|\$\{i \+ 1\}`/.test(src))
    throw new Error('el cruce no aparea por rango dentro de la NCU');
  // una NCU cuyo recuento no casa NO se aparea a ojo: se marca
  if (!/SIN_VERIFICAR/.test(src)) throw new Error('no se marcan las NCUs cuyo recuento no casa');
  // y el estado de batería se mira ANTES que el modo, o el peor caso se pierde
  const iSeg = src.indexOf('if (enSeguro(x)) { seguro.push(x); continue; }');
  const iAuto = src.indexOf("if (x.Modo !== 'AUTO' || x.Objetivo == null) { noAuto++; continue; }");
  if (!(iSeg > 0 && iAuto > 0 && iSeg < iAuto))
    throw new Error('el filtro de AUTO va antes que el de batería: un seguidor muerto en OFF desaparece del informe');
  // un volcado de sol alto no puede venderse como prueba de política
  if (!/NO DISCRIMINA la política/.test(src))
    throw new Error('el informe no avisa de cuándo el volcado no discrimina');
  // la x cruda es xFrom + lineX (el fallo que costó 500 seguidores en el export)
  if (!/B\.P\.xFrom \+ B\.P\.lineX\[r\]/.test(src))
    throw new Error('el cruce no usa xFrom + lineX para situar la línea');
});

t('v1.35: las consignas van al TCU REAL (rango en su NCU), no al número del id', () => {
  const ep = path.join(ROOT, 'tools', 'export_consignas.mjs');
  const src = fs.readFileSync(ep, 'utf-8');
  // el id NO codifica la NCU y su número no reinicia en 1: tomarlo del id
  // mandaba la consigna de 157 seguidores de Ayora a OTRO seguidor
  if (!/v\.sort\(\(a, b\) => a\.nnn - b\.nnn\)/.test(src) || !/s2\.tcu = i \+ 1/.test(src))
    throw new Error('el export no numera el TCU por rango dentro de su NCU');
  const out = path.join(ROOT, '.tmp_consignas_test.csv');
  const { execFileSync } = require_child();
  try {
    execFileSync(process.execPath, [ep, '--planta', 'ayora', '--fecha', '2026-06-21',
                                    '--pol', 'pairwise', '--paso', '120', '--salida', out],
                 { cwd: ROOT, stdio: 'pipe' });
    const L = fs.readFileSync(out, 'utf-8').trim().split('\n');
    const cab = L[0].split(','), iN = cab.indexOf('ncu'), iT = cab.indexOf('tcu');
    if (iN < 0 || iT < 0) throw new Error('el CSV perdió ncu/tcu');
    const por = new Map();
    for (let r = 1; r < L.length; r++) {
      const f = L[r].split(',');
      if (!por.has(f[iN])) por.set(f[iN], new Set());
      por.get(f[iN]).add(+f[iT]);
    }
    // dentro de cada NCU los TCU tienen que ser 1..n sin huecos ni repeticiones
    for (const [ncu, st] of por) {
      const v = [...st].sort((a, b) => a - b);
      if (v[0] !== 1) throw new Error(`NCU${ncu}: el TCU no empieza en 1 (empieza en ${v[0]})`);
      if (v[v.length - 1] !== v.length)
        throw new Error(`NCU${ncu}: ${v.length} seguidores pero el TCU llega a ${v[v.length - 1]}: hay huecos`);
    }
    if (por.size < 10) throw new Error('salieron muy pocas NCUs: ¿se exportó la planta entera?');
  } finally {
    // el exportador escribe TAMBIÉN un .meta.json al lado: si solo se borra el
    // CSV, el temporal se cuela en el commit siguiente (pasó)
    for (const f of [out, out.replace(/\.csv$/, '.meta.json')])
      try { fs.unlinkSync(f); } catch { /* nada */ }
  }
});

t('v1.36: la sombra al ocaso es MONÓTONA — cero solo cuando el sol se pone', () => {
  // El contador 3D devolvía shade=0 en toda la banda zen≥89,5°, o sea que
  // afirmaba «no hay sombra» con la planta tapada entera. En la tabla de
  // Ayora del 21-jun salía un salto de 76,6 % a 0,00 % en un paso de 10 min.
  if (!/if\(zen>89\.5\)zen=89\.5;/.test(html)) throw new Error('ya no se clava al borde de validez');
  if (/if\(!\(isFinite\(zen\)&&zen<89\.5\)\)return out;/.test(html)) throw new Error('vuelve el cero falso');
  const P = F.plantFromCotas(JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')), 500, null);
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx,
                 axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  const T = { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
              nBypass: 2, iam: 0.05, rowTilt: P.tilt, groups: P.groups, drive: 'bifila',
              segs: P.segs, real: P };
  const day0 = Date.UTC(2026, 5, 21), doy = 172;
  let prevMed = -1;
  for (let mm = 21 * 60; mm <= 21 * 60 + 30; mm += 5) {
    const g = F.solarPos(day0 + (mm - 120) * 60000, 39.1182081, -1.1598527);
    if (g.elev <= 0) break;                              // pasado el ocaso ya no aplica
    const irr = F.clearskyIneichen(g.zen, doy, 739, 3.5);
    const ang = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, 0.20).angles;
    const sh = F.poaPlant(g.zen, g.az, T, ang, irr, doy, 0.20).shade;
    const a = [];
    for (let i = 0; i < pairs.length + 1; i++) if (typeof sh[i] === 'number') a.push(sh[i]);
    const med = a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    if (med + 1e-9 < prevMed)
      throw new Error(`la sombra BAJA con el sol cayendo (min ${mm}, elev ${g.elev.toFixed(2)}°): ` +
        `${(100 * prevMed).toFixed(2)} % → ${(100 * med).toFixed(2)} %`);
    prevMed = med;
  }
  if (prevMed < 0.5) throw new Error('al ocaso la planta debería estar mayormente tapada, y sale ' +
    (100 * prevMed).toFixed(1) + ' %');
});

t('v1.37: el mando «configuración de la TCU» existe y arranca en levantamiento', () => {
  if (!/<select id="tcucfg"/.test(html)) throw new Error('no está el selector');
  if (!/value="levantamiento"/.test(html) || !/value="cero"/.test(html))
    throw new Error('faltan las dos opciones');
  // la etiqueta NO puede prometer «según levantamiento»: esa opción usa la
  // pendiente que el simulador deduce por PAREJA DE LÍNEAS, que no es la ficha
  // que se escribe en la TCU (por seguidor, a su vecina crítica: ~1,8x mayor)
  if (/>Según levantamiento/.test(html))
    throw new Error('la etiqueta promete la ficha de la TCU y entrega otra pendiente distinta');
  const sel = html.slice(html.indexOf('<select id="tcucfg"'), html.indexOf('</select>', html.indexOf('<select id="tcucfg"')));
  if (/value="cero"[^>]*selected/.test(sel))
    throw new Error('arranca «sin configurar»: cambiaría el resultado por defecto de todo el mundo');
  if (!/tcucfg:\(\$\('tcucfg'\)\?\$\('tcucfg'\)\.value:'levantamiento'\)/.test(html))
    throw new Error('cfg() no lee el mando (o no tiene defecto seguro)');
});
t('v1.37: cambiar el registro NO cambia el terreno — solo la creencia de la TCU', () => {
  // SOLO el cuerpo de terrainTCU: hasta aquí la rebanada llegaba a ensureElev y
  // se tragaba terrain() entera, así que el guard saltaba por el «pitch:» de otra
  const f = cuerpoFn(html, 'terrainTCU');
  if (!f) throw new Error('no encuentro terrainTCU');
  // la propiedad: con la planta configurada por cotas devuelve el MISMO objeto,
  // sin copiar ni recalcular nada (así «levantamiento» es exactamente lo de antes)
  if (!/return T;\s*\}$/.test(f.trim()))
    throw new Error('no devuelve la MISMA planta cuando está configurada por cotas');
  // y la rama de la ficha sólo puede LEER un dato ya resuelto en carga
  if (/lineXAbs|Math\.abs\(/.test(f))
    throw new Error('terrainTCU empareja: eso se hace una vez al cargar, en aplicaFicha');
  // solo puede tocar `slope`: si tocara pitch, tilt o segs estaría inventando terreno
  for (const campo of ['pitch', 'axisTilt', 'segs', 'rowTilt', 'cw', 'maxAngle'])
    if (new RegExp(campo + '\\s*:').test(f))
      throw new Error('terrainTCU toca «' + campo + '»: eso es cambiar el terreno, no el registro');
  if (!/slope:0/.test(f)) throw new Error('no pone la pendiente a cero');
  // es un DATO, no física: nada de trigonometría aquí (misma regla que careoTerreno)
  if (/Math\.(sin|cos|tan|asin|acos|atan)/.test(f))
    throw new Error('terrainTCU hace trigonometría: eso es física, y la física ya existe');
});
t('v1.37: el ÁNGULO sale de lo que la TCU cree; la SOMBRA, de la geometría real', () => {
  const f = html.slice(html.indexOf('function computeDay()'), html.indexOf('function kpisSerie('));
  if (!/const Tcfg=terrainTCU\(c,T\);/.test(f)) throw new Error('computeDay no construye Tcfg');
  if (!/policyAngles\(P\.key,g\.zen,g\.az,Tcfg,/.test(f))
    throw new Error('el ángulo no usa la creencia de la TCU');
  if (!/poaPlant\(g\.zen,g\.az,T,lim,/.test(f))
    throw new Error('el contador no mide la geometría REAL: con el registro a 0 la sombra saldría por magia');
  // y los caminos de instante (el slider entre pasos de malla) no pueden usar
  // otra creencia que la del día, o el arrastre saltaría entre dos políticas
  for (const sitio of ['CAREO_A,g.zen,g.az,DAY.Tcfg||DAY.T', 'key,g.zen,g.az,DAY.Tcfg||DAY.T'])
    if (!html.includes('policyAngles(' + sitio))
      throw new Error('un camino de instante sigue calculando el ángulo con la geometría real');
  if (!/const c=cfg\(\), T=terrain\(c\), Tcfg=terrainTCU\(c,T\);/.test(html))
    throw new Error('la tabla anual no separa creencia de geometría');
});

t('v1.38: la FICHA de la TCU se empareja por la x MEDIDA, nunca por el índice', () => {
  const f = cuerpoFn(html, 'aplicaFicha');
  if (!f) throw new Error('no existe aplicaFicha');
  if (!/P\.lineXAbs/.test(f))
    throw new Error('no usa la x absoluta: sin ancla física sólo queda el índice');
  if (!/ficha\.lineas\[i\]|lineas\[i\]/.test(f) === false)
    throw new Error('empareja por índice: es el fallo que costó 157 consignas');
  if (!/<=TOL/.test(f)) throw new Error('empareja sin tolerancia declarada');
  // las parejas sin ficha NO pueden rellenarse con cero: eso fabrica un llano
  if (!/out\.push\(null\);continue;/.test(f))
    throw new Error('las parejas sin ficha no se dejan como «sin dato»');
  if (!/<option value="ficha"/.test(html)) throw new Error('falta la opción en el selector');
  if (!/opt\.disabled=!hay;/.test(html))
    throw new Error('la opción no se deshabilita cuando la planta no tiene ficha publicada');
});
t('v1.38: sobre Ayora la ficha casa, conserva el signo y declara su cobertura', () => {
  const fFicha = path.join(ROOT, 'ayora_ficha.json');
  if (!fs.existsSync(fFicha)) throw new Error('falta ayora_ficha.json (lo emite export_config_tcu.mjs)');
  const src = cuerpoFn(html, 'aplicaFicha');
  const aplicaFicha = new Function('DEG', 'return ' + src)(180 / Math.PI);
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, 80, null);
  if (!P.lineXAbs) throw new Error('plantFromCotas ya no devuelve lineXAbs');
  aplicaFicha(P, JSON.parse(fs.readFileSync(fFicha, 'utf-8')), cotas.pitch);
  const C = P.fichaCobertura;
  if (!C || !C.con) throw new Error('la ficha no casó con ninguna pareja');
  if (C.lineas < 0.6 * C.de)
    throw new Error(`sólo casan ${C.lineas} de ${C.de} líneas: el emparejamiento por x se rompió`);
  // el SIGNO: se eligió el convenio que gana con margen (oeste de la i+1).
  // Si baja del 85 % es que la ficha cambió de convenio y hay que re-decidirlo,
  // no seguir dibujando pendientes al revés.
  let ok = 0, tot = 0;
  for (let i = 0; i < P.lineX.length - 1; i++) {
    if (P.fichaSlope[i] == null) continue;
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    const nuestro = Math.atan2(P.pairDz[i], dx) * 180 / Math.PI;
    if (Math.abs(nuestro) < 0.05) continue;
    tot++; if (Math.sign(P.fichaSlope[i]) === Math.sign(nuestro)) ok++;
  }
  if (tot < 20) throw new Error('muestra insuficiente para juzgar el signo');
  if (ok / tot < 0.85)
    throw new Error(`el signo de la ficha sólo coincide en ${(100 * ok / tot).toFixed(0)} %: ` +
      'se eligió el convenio por margen y ese margen se ha perdido');
  // y tiene que ser OTRA pendiente que la de las cotas, o la opción no aporta
  const mag = a => { const v = a.filter(x => x != null).map(Math.abs).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const nues = [];
  for (let i = 0; i < P.lineX.length - 1; i++)
    nues.push(Math.atan2(P.pairDz[i], Math.max(0.5, P.lineX[i + 1] - P.lineX[i])) * 180 / Math.PI);
  if (Math.abs(mag(P.fichaSlope) - mag(nues)) < 0.05)
    throw new Error('la ficha da la MISMA pendiente que las cotas: o no se cargó, o se está leyendo la columna equivocada');
});

console.log('');
console.log('cruce de un día de NCU real (tools/cruce_ncu_dia.mjs)');

const FIXNCU = path.join(ROOT, 'tools', 'fixture_ncu12');
function correCruce(dir, extra) {
  try { return { s: require_child().execFileSync('node',
    [path.join(ROOT, 'tools', 'cruce_ncu_dia.mjs'), dir, '--planta', 'ayora', '--ncu', '12',
     ...(extra || [])], { encoding: 'utf-8' }), c: 0 }; }
  catch (e) { return { s: (e.stdout || '') + (e.stderr || ''), c: e.status }; }
}
t('cruce NCU: el huso se DEDUCE del volcado y gana con margen', () => {
  const r = correCruce(FIXNCU);
  if (r.c !== 0) throw new Error('el cruce aborta:\n' + r.s.slice(-400));
  // el volcado de Ayora viene en UTC: el objetivo cruza cero al mediodía solar
  if (!/HUSO deducido: UTC\+0/.test(r.s)) throw new Error('ya no deduce UTC:\n' + r.s.slice(0, 400));
  const m = r.s.match(/gana por (\d+) min/);
  if (!m || +m[1] < 30) throw new Error('el huso no gana con margen suficiente');
});
t('cruce NCU: LEE EL LOG DE EVENTOS y aparta lo que hizo una persona', () => {
  // sin esto se le achaca a la planta lo que hizo un operario: la mañana del
  // 7-ago los seguidores miraban al oeste con el sol saliendo por el este, y
  // era «admin» ejerciendo las posiciones de seguridad desde la web
  const r = correCruce(FIXNCU);
  if (!/LOG DE EVENTOS: \d+ intervenciones HUMANAS/.test(r.s))
    throw new Error('no lee el log de eventos:\n' + r.s.slice(0, 600));
  if (!/posiciones de seguridad .* activadas a mano/.test(r.s))
    throw new Error('no destaca las posiciones de seguridad manuales');
  // y las muestras en posición de seguridad no pueden contar en la firma
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'cruce_ncu_dia.mjs'), 'utf-8');
  if (!/if \(s\.seg\) \{ nSeg\+\+; continue; \}/.test(src))
    throw new Error('la firma ya no aparta las muestras en posición de seguridad');
});
t('cruce NCU: sin log de eventos, lo DICE en vez de callarse', () => {
  const tmp = path.join(ROOT, 'tools', 'zz_fixncu_sinlog');
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const f of fs.readdirSync(FIXNCU)) if (!/EVENT_LOG/.test(f))
      fs.copyFileSync(path.join(FIXNCU, f), path.join(tmp, f));
    const r = correCruce(tmp);
    if (!/SIN log de eventos/.test(r.s))
      throw new Error('no avisa de que falta el log:\n' + r.s.slice(0, 500));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
t('cruce NCU: la rejilla toma la muestra MÁS CERCANA, no la última del tramo', () => {
  // Quedarse con la última muestra del bin desplaza cada lectura hasta PASO
  // minutos, y eso se disfraza de física: apareció como un «desfase de reloj
  // de 4 minutos» de la planta (1,15° de sesgo constante, casi idéntico a la
  // convergencia de meridianos de Ayora, 1,161°) que era enteramente del bin.
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'cruce_ncu_dia.mjs'), 'utf-8');
  if (/const k = Math\.floor\(\(hh \* 60 \+ mi\) \/ PASO\) \* PASO;/.test(src))
    throw new Error('vuelve el bin por truncamiento: desplaza cada lectura hasta PASO minutos');
  if (!/if \(ya && ya\.d <= d\) continue;/.test(src))
    throw new Error('la rejilla ya no se queda con la muestra más cercana');
  // y el careo tiene que salir sin sesgo: al mediodía el modelo clava el dato
  const r = correCruce(FIXNCU);
  const m = r.s.match(/^\s+12:00\s+[\d.]+°\s+(-?[\d.]+)°\s+(-?[\d.]+)/m);
  if (!m) throw new Error('no encuentro la fila de las 12:00 en el careo');
  const d = Math.abs(+m[1] - +m[2]);
  if (d > 0.5) throw new Error('a mediodía planta y modelo difieren ' + d.toFixed(2) + '°: vuelve el sesgo');
});
t('cruce NCU: el veredicto sólo vota en los instantes que DISCRIMINAN', () => {
  // con sol alto todas las políticas mandan el mismo ángulo: meter esas horas
  // en la media entierra la diferencia y el veredicto sale «no discrimina»
  // aunque el dato sí decida. Es el mismo error que el informe lleva
  // advirtiendo desde el primer volcado, aplicado a sí mismo.
  const r = correCruce(FIXNCU);
  if (!/instantes DISCRIMINAN \(abanico entre políticas ≥ 1°\)/.test(r.s))
    throw new Error('el veredicto vuelve a votar con todas las horas:\n' + r.s.slice(-700));
  const m = r.s.match(/mejor explica lo que hace la planta es «(\w+)»/);
  if (!m) throw new Error('no hay veredicto (b):\n' + r.s.slice(-700));
  if (m[1] !== 'cero')
    throw new Error('la política que explica Ayora cambió a «' + m[1] + '»: ¿se configuró la planta?');
});
t('cruce NCU: Ayora backtrackea PLANO — la apertura no separa los dos regímenes', () => {
  // el hallazgo del volcado real: la bandera de backtracking se levanta y los
  // ángulos se aplanan (o sea la TCU SÍ backtrackea), pero todos los
  // seguidores reciben el MISMO ángulo. Con los registros de pendiente a cero
  // no puede ser de otra manera. Si algún día se configuran, esto falla y hay
  // que revisar el informe al cliente.
  const r = correCruce(FIXNCU);
  if (!/backtrackea PLANO/.test(r.s))
    throw new Error('ya no concluye que backtrackea plano:\n' + r.s.slice(-900));
  const m = r.s.match(/la apertura durante el backtracking es de ([\d.]+)°/);
  if (!m) throw new Error('no publica la apertura medida:\n' + r.s.slice(-600));
  if (+m[1] > 1) throw new Error('la apertura ahora despega del suelo (' + m[1] + '°): ¿se configuraron las pendientes?');
  // y el veredicto NO puede apoyarse en una razón entre ruidos de cuantización
  if (!/ruido de/.test(r.s)) throw new Error('no declara que la razón es ruido/ruido');
});

console.log('');
console.log('careo por sombra (tools/careo_sombra.mjs)');

const CAREO = fs.readFileSync(path.join(ROOT, 'tools', 'careo_sombra.mjs'), 'utf-8');
t('careo sombra: A y B corren LA MISMA política — sólo cambia el registro', () => {
  // El error que costó una conclusión al revés: usar bt2d como «configuración
  // A» y pairwise como B mide DOS cosas a la vez (política + registro), y el
  // 21-dic salía que configurar el levantamiento empeora la sombra.
  const m = CAREO.match(/const CFG = \[([\s\S]*?)\];/);
  if (!m) throw new Error('no encuentro CFG');
  const filas = m[1].split('\n').filter(l => l.includes('pol:'));
  const a = filas.find(l => l.includes("k: 'plana'")), b = filas.find(l => l.includes("k: 'levanta'"));
  if (!a || !b) throw new Error('faltan las configuraciones A y B');
  const pol = l => (l.match(/pol: '([a-z0-9]+)'/) || [])[1];
  if (pol(a) !== pol(b))
    throw new Error(`A usa «${pol(a)}» y B usa «${pol(b)}»: el careo mide política + registro, no el registro`);
  if (!/T: T0/.test(a) || !/T: T,/.test(b))
    throw new Error('A tiene que correr con la planta de pendiente CERO y B con la real');
  if (!/planta\(true\), T0 = planta\(false\)/.test(CAREO))
    throw new Error('las dos plantas ya no se construyen de la misma función');
});
t('careo sombra: el contador mide siempre la geometría REAL', () => {
  // la planta tiene la pendiente que tiene, la crea o no la crea su TCU: si el
  // contador usara T0 para A, la configuración A saldría sin sombra por magia
  if (!/const sh = F\.poaPlant\(g\.zen, g\.az, T, ang, irr, doy, ALB\)\.shade;/.test(CAREO))
    throw new Error('el contador no está atado a la geometría real');
});
t('careo sombra: configurar el registro nunca EMPEORA la sombra del día', () => {
  let out;
  try {
    out = require_child().execFileSync('node',
      [path.join(ROOT, 'tools', 'careo_sombra.mjs'), '--planta', 'ayora',
       '--dia', '2026-12-21', '--paso', '20'], { encoding: 'utf-8' });
  } catch (e) { throw new Error('el careo aborta: ' + ((e.stdout || '') + (e.stderr || '')).slice(-300)); }
  const g = k => {
    const re = new RegExp(k + '[^\\n]*sombra media\\s+([\\d.]+) %[^\\n]*irradiancia ([\\d.]+) %');
    const m = out.match(re);
    if (!m) throw new Error('no encuentro la línea de ' + k);
    return { med: +m[1], pond: +m[2] };
  };
  const A = g('A · SIN CONFIGURAR'), B = g('B · CONFIGURADA');
  if (B.med > A.med + 1e-9)
    throw new Error(`configurar empeora la sombra media: ${A.med} % → ${B.med} %`);
  if (B.pond > A.pond + 1e-9)
    throw new Error(`configurar empeora la sombra ponderada: ${A.pond} % → ${B.pond} %`);
  // y la descomposición tiene que ser exhaustiva, o las columnas mienten
  const suma = out.match(/evitable ([\d.]+) \+ inevitable \(tope\) ([\d.]+) \+ residual ([\d.]+) = ([\d.]+)/g);
  if (!suma || suma.length < 2) throw new Error('no se publica la descomposición');
  for (const s of suma) {
    const n = s.match(/([\d.]+)/g).map(Number);
    if (Math.abs(n[0] + n[1] + n[2] - n[3]) > 0.015)
      throw new Error('evitable+inevitable+residual no suma la media: ' + s);
  }
});

console.log('');
console.log('control de entrada del relieve (tools/valida_relieve.mjs)');

// Cotas SINTÉTICAS: la única forma de probar que el control distingue un bancal
// (legítimo) de una línea suelta (imposible) es fabricar los dos casos. El
// formato es el de <planta>_cotas.json: y = cota medida sobre el módulo.
function cotasSinteticas(perfilZ, pitch = 6.0) {
  const t = [];
  perfilZ.forEach((z, i) => {
    // 8 filas por línea, todas con el mismo tramo de norte para que solapen
    for (let k = 0; k < 8; k++)
      t.push({ f: [{ x: i * pitch, n: [k * 80, k * 80 + 74], y: [z, z], art: 0, pa: [0], nm: null, ym: null }] });
  });
  return { planta: 'zzsintetica', base: 0, gcr: 0.397, limite: 55, pitch, cuerda: 2.382,
    n_trk: t.length, n_con: t.length, n_art: 0, n_inc: 0, nota: 'sintética de prueba', t };
}
function corrigeRelieve(perfilZ) {
  const f = path.join(ROOT, 'zzsintetica_cotas.json');
  fs.writeFileSync(f, JSON.stringify(cotasSinteticas(perfilZ)));
  try {
    const r = require_child().execFileSync('node',
      [path.join(ROOT, 'tools', 'valida_relieve.mjs'), '--planta', 'zzsintetica'],
      { encoding: 'utf-8' });
    return { salida: r, codigo: 0 };
  } catch (e) {
    return { salida: (e.stdout || '') + (e.stderr || ''), codigo: e.status };
  } finally { try { fs.unlinkSync(f); } catch { /* nada */ } }
}

t('bancal: un escalón que BAJA Y SE QUEDA no se rechaza (es terreno real)', () => {
  // 12 líneas llanas, escalón de −2,5 m en la 6ª que persiste hasta el final.
  // Esto se rompió una vez al revés: se rechazaba por «pendiente imposible»,
  // y así se descartaban justo las plantas donde corregir el relieve más vale.
  const z = [0, -.1, -.2, -.3, -.4, -.5, -3.0, -3.1, -3.2, -3.3, -3.4, -3.5];
  const r = corrigeRelieve(z);
  if (r.codigo !== 0) throw new Error('rechaza un bancal legítimo:\n' + r.salida);
  if (!/VEREDICTO: APTA/.test(r.salida)) throw new Error('veredicto inesperado:\n' + r.salida);
  // y aun así lo INFORMA: el desnivel grande tiene que verse en el resumen
  if (!/pareja\(s\) por encima de 8\.5°/.test(r.salida)) throw new Error('no informa del desnivel');
});
t('línea suelta: hundida de sus DOS vecinas más de medio vano → NO EVALUABLE', () => {
  const z = [0, -.1, -.2, -.3, -.4, -4.9, -.6, -.7, -.8, -.9, -1.0, -1.1];
  const r = corrigeRelieve(z);
  if (r.codigo !== 1) throw new Error('no rechaza una línea imposible (código ' + r.codigo + '):\n' + r.salida);
  if (!/VEREDICTO: NO EVALUABLE/.test(r.salida)) throw new Error('veredicto inesperado:\n' + r.salida);
  if (!/línea 5 /.test(r.salida)) throw new Error('no señala CUÁL es la línea:\n' + r.salida);
});
t('línea suelta pequeña (vaguada posible) → reserva, no rechazo', () => {
  const z = [0, -.1, -.2, -.3, -.4, -2.0, -.6, -.7, -.8, -.9, -1.0, -1.1];
  const r = corrigeRelieve(z);
  if (r.codigo !== 0) throw new Error('rechaza lo que solo merece reserva:\n' + r.salida);
  if (!/VEREDICTO: APTA CON RESERVAS/.test(r.salida)) throw new Error('veredicto inesperado:\n' + r.salida);
});
t('llano perfecto → APTA sin hallazgos', () => {
  const r = corrigeRelieve([0, -.1, -.2, -.3, -.4, -.5, -.6, -.7, -.8, -.9]);
  if (r.codigo !== 0 || !/sin hallazgos/.test(r.salida)) throw new Error('el llano no sale limpio:\n' + r.salida);
});
t('fila anómala: una cota mala DENTRO de una línea buena no se escapa', () => {
  // el control de línea la absorbía en la mediana: 4 casos cazados de 20 reales
  const z = [0, -.1, -.2, -.3, -.4, -.5, -.6, -.7, -.8, -.9];
  const c = cotasSinteticas(z);
  // una línea de 8 filas con UNA fila 36,6 m arriba: la mediana de la línea ni
  // se entera, pero la geometría de esa fila es imposible
  c.t[5 * 8 + 3].f[0].y = [z[5] + 36.6, z[5] + 36.6];
  const f = path.join(ROOT, 'zzsintetica_cotas.json');
  fs.writeFileSync(f, JSON.stringify(c));
  let r;
  try {
    r = { s: require_child().execFileSync('node',
      [path.join(ROOT, 'tools', 'valida_relieve.mjs'), '--planta', 'zzsintetica'],
      { encoding: 'utf-8' }), c: 0 };
  } catch (e) { r = { s: (e.stdout || '') + (e.stderr || ''), c: e.status }; }
  finally { try { fs.unlinkSync(f); } catch { /* nada */ } }
  if (r.c !== 1) throw new Error('la fila anómala se escapa (código ' + r.c + '):\n' + r.s);
  if (!/fila anómala/.test(r.s)) throw new Error('no la nombra:\n' + r.s);
  if (!/VEREDICTO: NO EVALUABLE/.test(r.s)) throw new Error('veredicto inesperado:\n' + r.s);
});
t('San José: el desvío repetido se declara SISTEMÁTICO, no ruido', () => {
  if (!fs.existsSync(path.join(ROOT, 'sanjose_cotas.json'))) return;
  let r;
  try { r = require_child().execFileSync('node',
    [path.join(ROOT, 'tools', 'valida_relieve.mjs'), '--planta', 'sanjose'], { encoding: 'utf-8' }); }
  catch (e) { r = (e.stdout || '') + (e.stderr || ''); }
  if (!/error SISTEMÁTICO/.test(r))
    throw new Error('ya no detecta que el desvío se repite: ¿se corrigió el levantamiento?');
  const m = r.match(/repiten LA MISMA magnitud \(≈([\d.]+) m\)/);
  if (!m) throw new Error('no publica la magnitud repetida');
  if (Math.abs(+m[1] - 36.65) > 1)
    throw new Error('la magnitud repetida cambió a ' + m[1] + ' m: revisar el informe al cliente');
});
t('plantas reales: Ayora pasa, San José (bloque 0) no', () => {
  const corre = a => {
    try { return { s: require_child().execFileSync('node',
      [path.join(ROOT, 'tools', 'valida_relieve.mjs'), ...a], { encoding: 'utf-8' }), c: 0 }; }
    catch (e) { return { s: (e.stdout || '') + (e.stderr || ''), c: e.status }; }
  };
  if (fs.existsSync(path.join(ROOT, 'ayora_cotas.json'))) {
    const r = corre(['--planta', 'ayora']);
    if (r.c !== 0 || !/VEREDICTO: APTA/.test(r.s)) throw new Error('Ayora ya no pasa el control:\n' + r.s);
  }
  if (fs.existsSync(path.join(ROOT, 'sanjose_cotas.json'))) {
    const r = corre(['--planta', 'sanjose', '--bloque', '0']);
    if (r.c !== 1) throw new Error('San José bloque 0 debería salir NO EVALUABLE');
    // las tres líneas imposibles, nombradas: si el levantamiento se corrige,
    // esta comprobación avisa de que hay que revisar el informe al cliente
    for (const l of ['línea 129', 'línea 146', 'línea 159'])
      if (!r.s.includes(l)) throw new Error('ya no señala la ' + l + ': ¿se corrigió el levantamiento?');
  }
});

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
