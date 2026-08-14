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
           pairsFromElev, elevFromPairs, solarPos, bt3dPairMaxMag, nsSegments, plantFromCotas,
           shadeBand3DAll };`);
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
  if (!/ivs\.sort/.test(band)) throw new Error('sin unión de intervalos en el contador');
  if (!/function oracleExact/.test(fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8')))
    throw new Error('la batería perdió el oráculo de podas');
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
      planes.push({ e, w0, w1, C: [xs[e], (w0 + w1) / 2, (z0e + z1e) / 2], nE, uD });
    }
  }
  return { nR, xs, cot, segsOf, planes };
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
function oracleTerrFCol(G, terr, T, r, thR, v, fCol) {
  if (!terr.doTerr || fCol >= 1) return fCol;
  const hw = T.cw / 2;
  const uLo = Math.sin(thR) >= 0 ? hw : -hw, uHi = -uLo;
  const pt = (u2) => [G.xs[r] + u2 * Math.cos(thR), v, G.cot(r, v) - u2 * Math.sin(thR)];
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
      for (let j = 0; j < MV; j++) {
        const v = v0 + (v1 - v0) * (j + 0.5) / MV, zR = G.cot(r, v);
        const ivs = [];
        for (const pl of G.planes) {
          if (pl.e === r) continue;
          const den = pl.nE[0] * sv[0] + pl.nE[1] * sv[1] + pl.nE[2] * sv[2];
          if (Math.abs(den) < 1e-9) continue;
          const t0 = (pl.C[0] - G.xs[r]) * pl.nE[0] + (pl.C[1] - v) * pl.nE[1] + (pl.C[2] - zR) * pl.nE[2];
          const tc = cR * pl.nE[0] + s2 * pl.nE[2];
          let lo = -hw, hi = hw, ok = true;
          const lin = (A, B) => {
            if (A > 1e-12) { const x = B / A; if (x < hi) hi = x; }
            else if (A < -1e-12) { const x = B / A; if (x > lo) lo = x; }
            else if (B < -1e-12) ok = false;
          };
          if (den > 0) lin(tc, t0 - 1e-6 * den); else lin(-tc, 1e-6 * den - t0);
          const q = sv[1] / den;
          lin(q * tc, v + q * t0 - pl.w0);
          lin(-q * tc, pl.w1 - v - q * t0);
          const a0 = (G.xs[r] - pl.C[0]) * pl.uD[0] + (v - pl.C[1]) * pl.uD[1] + (zR - pl.C[2]) * pl.uD[2];
          const a1 = cR * pl.uD[0] + s2 * pl.uD[2];
          const a2 = sv[0] * pl.uD[0] + sv[1] * pl.uD[1] + sv[2] * pl.uD[2];
          const d0 = a0 + a2 * t0 / den, dc = a1 - a2 * tc / den;
          lin(dc, hw - d0); lin(-dc, hw + d0);
          if (ok && hi - lo > 1e-12) ivs.push([lo, hi]);
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
        fCol = oracleTerrFCol(G, terr, T, r, thR, v, fCol);
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
      for (let j = 0; j < MV; j++) {
        const v = v0 + (v1 - v0) * (j + 0.5) / MV, zR = G.cot(r, v);
        let colHit = 0;
        for (let i = 0; i < MU; i++) {
          const u = -hw + T.cw * (i + 0.5) / MU;
          const P0 = G.xs[r] + u * Math.cos(thR), P1 = v, P2 = zR - u * Math.sin(thR);
          let sh = false;
          for (const pl of G.planes) {
            if (pl.e === r || Math.abs(pl.den) < 1e-9) continue;
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
        fCol = oracleTerrFCol(G, terr, T, r, thR, v, fCol);
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
  return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0,
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
