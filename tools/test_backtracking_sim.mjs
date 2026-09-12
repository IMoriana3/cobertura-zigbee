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
import os from 'node:os';
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
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
            + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');

const sandbox = new Function(sol + '\n' + src + `
  return { runPhysicsQA, singleaxis, trueTrackAngle, shadeFracPair, shadeBrute,
           anglesPairwise, anglesTrue3d, anglesOptimal, anglesAstro, anglesGlobal, anglesRow,
           shadeRows, tangentResidualMm, elecLoss, clearskyIneichen, poaPlant, poaRow,
           pairsFromElev, elevFromPairs, solarPos, bt3dPairMaxMag, nsSegments, plantFromCotas,
           shadeBand3DAll, anglesOptimalFree, policyAngles, iamAshrae, PEREZ_BINS, PEREZ_F,
           airmassKY, dniExtra, surfaceOrient, skyWithClouds, anglesManual, prodColor,
           anglesPairwiseSeg, anglesAstroSeg, applyDriveSeg, policyAnglesSeg, poaPlantSeg,
           segTiltAt, segZAt, pairsFromElevX, segsBroadcast, segLineMean, slewLimitSeg, slewLimit, mvPara, rangoHaz, rangosFila, rangosUnidad, repairNoShade, mulberry32, driveCoupleSafe, certifica,
           westPorMesa, ejesPorMesa, pvTilt, shadePair3DBand, driveGroups, effRowTilts, rotulaMesas };`);
const F = sandbox();

console.log('nubosidad · manual · colores (v1.40)');
t('nubosidad a 0 es NO-OP EXACTO (mismo objeto, ===)', () => {
  // mutante previsto: enrutar SIEMPRE por cloudToIrr (la DHI se recalcularía
  // por cierre y ya no sería el objeto del cielo claro) — esto se pone rojo
  const c = F.clearskyIneichen(30, 172, 300, 3.5);
  if (F.skyWithClouds(c, 0, 30) !== c) throw new Error('cc=0 ya no devuelve el MISMO objeto del cielo claro');
});
t('con nubes, el haz muere antes que el global (cc=0,5)', () => {
  const c = F.clearskyIneichen(30, 172, 300, 3.5);
  const n = F.skyWithClouds(c, 0.5, 30);
  const rG = n.ghi / c.ghi, rB = n.dni / c.dni;
  if (Math.abs(rG - 0.65) > 1e-9) throw new Error(`GHI·(1−0,70·cc): esperaba 0,65 y salió ${rG}`);
  if (Math.abs(rB - 0.125) > 1e-9) throw new Error(`DNI·(1−cc)³: esperaba 0,125 y salió ${rB}`);
  if (n.dhi < 0) throw new Error('la difusa de cierre salió negativa');
});
t('anglesManual: θ común y recortado al tope mecánico', () => {
  const a = F.anglesManual(6, 80, 55);
  if (a.length !== 6) throw new Error('no da un θ por fila');
  if (!a.every(v => v === 55)) throw new Error(`80° con tope 55 debe recortar a 55, salió ${a[0]}`);
  const b = F.anglesManual(3, -80, 55);
  if (!b.every(v => v === -55)) throw new Error('el recorte no funciona hacia el este');
});
t('prodColor: rampa válida y con extremos distintos', () => {
  const lo = F.prodColor(0), hi = F.prodColor(1), mid = F.prodColor(0.5);
  for (const v of [lo, hi, mid]) if (!/^rgb\(\d+,\d+,\d+\)$/.test(v)) throw new Error('color no rgb(): ' + v);
  if (lo === hi) throw new Error('mínimo y máximo con el mismo color: la escala no escala');
  if (F.prodColor(-5) !== lo || F.prodColor(9) !== hi) throw new Error('fuera de [0,1] no se recorta');
});

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


/* ── el cielo claro, de `irradiancia.js` y de ningún otro sitio ─────────────
   `dniExtra`, `airmassKY`, `clearskyIneichen` y `surfaceOrient` estaban en las
   DOS páginas, y no era solo duplicación: overcast había corregido `dniExtra` a
   Spencer/pvlib y backtracking se quedó con la fórmula simple. Esto exige que no
   vuelva a haber una copia local que se separe. */
t('TODO el que extrae el bloque de física antepone los módulos', () => {
  /* El bloque ya no se basta solo: necesita `sol.js` e `irradiancia.js`, que la
     página carga aparte. Cada vez que alguien escribe una herramienta nueva que
     lo extrae —han llegado tres de golpe con la v1.38— se queda sin ellos y
     revienta. En vez de ir arreglándolas de una en una, esto las cuenta. */
  const dir = path.join(ROOT, 'tools');
  const malas = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.mjs')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (!/FIN-FÍSICA/.test(src)) continue;                 // no extrae el bloque
    const falta = ['sol.js', 'irradiancia.js'].filter(m2 => !src.includes(m2));
    if (falta.length) malas.push(f + ' (sin ' + falta.join(' ni ') + ')');
  }
  if (malas.length) throw new Error(malas.join(', '));
});
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

console.log('v1.57 · auditoría externa (H1 estaciones · H2 semiespacio · H3 veto · H4 Ineichen · H7 oráculo independiente)');
/* El caso B del documento: Zaragoza 21-jun 07:30, pendiente 8°, 6 filas de 64,7 m, tilt N-S «aleatorio 4°» */
function casoB(nR, conTorsion) {
  const RAD = Math.PI / 180, pitch = 6, cw = 2.382, L = 2 * 28 * 1.146 + 0.55;
  const r = F.mulberry32(1234); const tilts = []; for (let i = 0; i < nR; i++) tilts.push(conTorsion ? (r() * 2 - 1) * 4 : 0);
  const ELEV = []; for (let i = 0; i < nR; i++) ELEV.push(-i * pitch * Math.tan(8 * RAD));
  const segs = []; for (let i = 0; i < nR; i++) segs.push([[-L / 2, L / 2]]);
  return { pairs: F.pairsFromElev(ELEV, pitch, tilts), cw, axisAz: 0, maxAngle: 55, gcr: cw / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilts, groups: null, drive: 'mono', segs };
}
const gB = F.solarPos(Date.UTC(2026, 5, 21, 5, 30), 41.5763, -0.7981);

t('H1: las estaciones son adaptativas — 8 en planta medida, cada ≤4 m sin torsión, cada ≤2 m con torsión, tope 64', () => {
  if (F.mvPara({ real: {}, segs: [[[-32, 32]]], rowTilt: [3, -3] }) !== 8) throw new Error('la planta medida debe quedarse en 8 (medido ≤0,7 pp, tope de 3 s)');
  if (F.mvPara(casoB(6, false)) !== 17) throw new Error('sin torsión, 64,7 m ⇒ 17 estaciones (cada ≤4 m): ' + F.mvPara(casoB(6, false)));
  if (F.mvPara(casoB(6, true)) !== 33) throw new Error('con torsión, 64,7 m ⇒ 33 estaciones (cada ≤2 m): ' + F.mvPara(casoB(6, true)));
  if (F.mvPara({ segs: [[[-100, 100]]], rowTilt: [4, -4] }) !== 64) throw new Error('tope 64');
});
t('H1: CONVERGENCIA con torsión — el contador publicado no pierde la mancha del extremo (la auditoría vio 0 % donde había 6,6 %)', () => {
  const T = casoB(6, true), nR = 6;
  for (const th of [0, -20, 25, 55]) {
    const ang = new Array(nR).fill(th);
    const pub = F.shadeBand3DAll(gB.zen, gB.az, T, ang, { noStruct: true });
    const ref = F.shadeBand3DAll(gB.zen, gB.az, T, ang, { noStruct: true, MV: 256 });
    for (let r = 0; r < nR; r++) {
      if (ref[r] > 0.02 && pub[r] < 0.5 * ref[r]) throw new Error(`θ ${th} fila ${r}: publicado ${(pub[r] * 100).toFixed(1)} % con ${(ref[r] * 100).toFixed(1)} % convergido`);
      if (Math.abs(pub[r] - ref[r]) > 0.015) throw new Error(`θ ${th} fila ${r}: |Δ| ${(Math.abs(pub[r] - ref[r]) * 100).toFixed(2)} pp > 1,5 pp`);
    }
  }
  // y el MUTANTE de la auditoría: con 8 estaciones fijas la fila 3 a −20° sale 0 % con 4,5 % real
  const m8 = F.shadeBand3DAll(gB.zen, gB.az, T, new Array(nR).fill(-20), { noStruct: true, MV: 8 });
  const m256 = F.shadeBand3DAll(gB.zen, gB.az, T, new Array(nR).fill(-20), { noStruct: true, MV: 256 });
  if (!(m8[3] < 0.005 && m256[3] > 0.04)) throw new Error('el caso que motivó el cambio ya no reproduce el defecto de MV 8: ' + m8[3] + ' / ' + m256[3]);
});
t('H7: ORÁCULO INDEPENDIENTE — rectángulos con rotación exacta sobre el eje inclinado y muestreo denso ≡ contador convergido (≤0,5 pp)', () => {
  // c = (cos θ, sin θ·sin τ, −sin θ·cos τ), a = (0, cos τ, sin τ): base ortonormal de la pala; 200×400 muestras; sin código del contador
  const RAD = Math.PI / 180;
  const oracleRot = (zen, az, T, ang, NU, NV) => {
    const nR = T.pairs.length + 1, hw = T.cw / 2, z0 = T.z0 || 0;
    const azR = (az - T.axisAz) * RAD, el = (90 - zen) * RAD, sv = [Math.sin(azR) * Math.cos(el), Math.cos(azR) * Math.cos(el), Math.sin(el)];
    const xs = [0], zch = [0]; for (let i = 0; i < T.pairs.length; i++) { xs.push(xs[i] + T.pairs[i].pitch); zch.push(zch[i] - T.pairs[i].pitch * Math.tan(T.pairs[i].slope * RAD)); }
    const segsOf = r => (T.segs && T.segs[r]) ? T.segs[r] : [[-30, 30]];
    const G = []; for (let r = 0; r < nR; r++) { const th = ang[r] * RAD, tau = ((T.rowTilt ? T.rowTilt[r] : 0) || 0) * RAD;
      const a = [0, Math.cos(tau), Math.sin(tau)], c = [Math.cos(th), Math.sin(th) * Math.sin(tau), -Math.sin(th) * Math.cos(tau)];
      G.push({ a, c, n: [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]], O: [xs[r], 0, zch[r]] }); }
    const P = (g, u, v) => [g.O[0] + u * g.c[0] + v * g.a[0] + z0 * g.n[0], g.O[1] + u * g.c[1] + v * g.a[1] + z0 * g.n[1], g.O[2] + u * g.c[2] + v * g.a[2] + z0 * g.n[2]];
    const out = [];
    for (let r = 0; r < nR; r++) { let hit = 0, N = 0;
      for (const sg of segsOf(r)) { const v0 = Math.min(sg[0], sg[1]), v1 = Math.max(sg[0], sg[1]);
        for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const Pt = P(G[r], -hw + T.cw * (i + 0.5) / NU, v0 + (v1 - v0) * (j + 0.5) / NV); N++; let blocked = false;
          for (let e = 0; e < nR && !blocked; e++) { if (e === r) continue; const ge = G[e], E0 = P(ge, 0, 0);
            const den = ge.n[0] * sv[0] + ge.n[1] * sv[1] + ge.n[2] * sv[2]; if (Math.abs(den) < 1e-12) continue;
            const s = ((E0[0] - Pt[0]) * ge.n[0] + (E0[1] - Pt[1]) * ge.n[1] + (E0[2] - Pt[2]) * ge.n[2]) / den; if (s <= 1e-9) continue;
            const Q = [Pt[0] + s * sv[0] - E0[0], Pt[1] + s * sv[1] - E0[1], Pt[2] + s * sv[2] - E0[2]];
            const ue = Q[0] * ge.c[0] + Q[1] * ge.c[1] + Q[2] * ge.c[2], ve = Q[0] * ge.a[0] + Q[1] * ge.a[1] + Q[2] * ge.a[2];
            if (Math.abs(ue) <= hw) for (const se of segsOf(e)) if (ve >= Math.min(se[0], se[1]) && ve <= Math.max(se[0], se[1])) { blocked = true; break; } }
          if (blocked) hit++; } }
      out.push(N ? hit / N : 0); }
    return out;
  };
  for (const [nm, T] of [['A', casoB(6, false)], ['B', casoB(6, true)]]) for (const th of [-20, 0, 25, 55]) {
    const ang = new Array(6).fill(th);
    const o = oracleRot(gB.zen, gB.az, T, ang, 200, 400), c = F.shadeBand3DAll(gB.zen, gB.az, T, ang, { noStruct: true, MV: 128 });
    for (let r = 0; r < 6; r++) if (Math.abs(o[r] - c[r]) > 0.005) throw new Error(`caso ${nm} θ ${th} fila ${r}: oráculo ${(o[r] * 100).toFixed(2)} % vs contador ${(c[r] * 100).toFixed(2)} %`);
  }
});
t('H2: NUNCA DE CANTO — las políticas sin sombra se quedan entre el seguimiento verdadero y la paralela al terreno (la horizontal dentro) todo el día del caso B', () => {
  // la auditoría midió mesas a AOI 90–91° con el sol a 23° y 36°: giradas más allá de la horizontal en contra del sol
  const T = casoB(6, true), doy = 172; let n = 0, peorAOI = 0;
  const RAD = Math.PI / 180, sMax = Math.max(...T.pairs.map(p => Math.abs(p.slope)));
  for (let mm = 5 * 60; mm <= 19 * 60; mm += 20) {
    const g = F.solarPos(Date.UTC(2026, 5, 21, 0, mm), 41.5763, -0.7981); if (!(g.zen < 89)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5);
    for (const key of ['pairwise', 'true3d', 'mgl']) { const ang = F.policyAngles(key, g.zen, g.az, T, irr, doy, 0.2).angles; n++;
      for (let r = 0; r < 6; r++) {
        const psz = F.trueTrackAngle(g.zen, g.az, F.pvTilt(T.rowTilt[r]), 0);
        // nunca más allá de la paralela al terreno en contra del sol (2° de margen)
        if (psz > 0 && ang[r] < -sMax - 2.01) throw new Error(`${key} minuto ${mm} fila ${r}: θ ${ang[r].toFixed(1)} en contra del sol (ψ ${psz.toFixed(1)})`);
        if (psz < 0 && ang[r] > sMax + 2.01) throw new Error(`${key} minuto ${mm} fila ${r}: θ ${ang[r].toFixed(1)} en contra del sol (ψ ${psz.toFixed(1)})`);
        const o = F.surfaceOrient(ang[r], F.pvTilt(T.rowTilt[r]), 0), b = o.tilt * RAD, z = g.zen * RAD;
        const aoi = Math.acos(Math.max(-1, Math.min(1, Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((g.az - o.az) * RAD)))) / RAD;
        if (g.elev > 15) peorAOI = Math.max(peorAOI, aoi);
      } }
  }
  if (!(n > 30)) throw new Error('pocos instantes');
  if (peorAOI > 88) throw new Error(`con el sol por encima de 15° hay filas a AOI ${peorAOI.toFixed(1)}° (de canto)`);   // el AOI lleva también la componente AXIAL del sol (a primera hora es grande aun en horizontal); lo transversal ya está acotado arriba
  // el rango legítimo, ejecutado: a las 08:50 (sol 23,5°, ψ ≈ 66°, pendiente 8°) va de −2° a ψ+2°
  const g = F.solarPos(Date.UTC(2026, 5, 21, 6, 50), 41.5763, -0.7981);
  const [lo, hi] = F.rangoHaz(g.zen, g.az, T, 0, 8);
  if (!(Math.abs(lo + 2) < 1e-9 && Math.abs(hi - 55) < 1e-9)) throw new Error('rangoHaz: ' + lo + '…' + hi + ' (esperaba −2…55: la paralela al terreno con margen y el tope mecánico)');
  // y con el sol a 4° por el oeste (ψ ≈ −86°) la horizontal sigue dentro (el primer intento con ±85° la dejaba fuera y el barrido lo cazó)
  const g2 = F.solarPos(Date.UTC(2026, 5, 21, 17, 50), 41.5763, -0.7981);
  const [lo2, hi2] = F.rangoHaz(g2.zen, g2.az, T, 0, 0);
  if (!(lo2 <= -50 && hi2 >= 2 - 1e-9)) throw new Error('rangoHaz a sol rasante: ' + lo2 + '…' + hi2);
});
t('H2 (reauditoría): ninguna política sin sombra manda la mesa DE ESPALDAS al sol — AOI ≤ 90° todo el día con DNI > 50', () => {
  // la reauditoría midió 27 instantes con AOI > 90° en true-3D (y 19 en pairwise, 30 en mgl) sobre un solo día
  const T = casoB(6, true), doy = 172, RAD = Math.PI / 180;
  let n = 0, peor = 0, caso = null;
  for (let mm = 0; mm < 1440; mm += 10) {
    const g = F.solarPos(Date.UTC(2026, 5, 21, 0, mm), 41.5763, -0.7981); if (!(g.zen < 90)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5); if (irr.dni <= 50) continue;
    n++;
    for (const key of ['pairwise', 'true3d', 'mgl']) {
      const ang = F.policyAngles(key, g.zen, g.az, T, irr, doy, 0.2).angles;
      for (let r = 0; r < 6; r++) {
        const o = F.surfaceOrient(ang[r], F.pvTilt(T.rowTilt[r]), 0), b2 = o.tilt * RAD, z = g.zen * RAD;
        const aoi = Math.acos(Math.max(-1, Math.min(1, Math.cos(z) * Math.cos(b2) + Math.sin(z) * Math.sin(b2) * Math.cos((g.az - o.az) * RAD)))) / RAD;
        if (aoi > peor) { peor = aoi; caso = `${key} ${(mm / 60).toFixed(2)}h sol ${g.elev.toFixed(1)}° fila ${r} θ ${ang[r].toFixed(1)} AOI ${aoi.toFixed(1)}°`; }
      }
    }
  }
  if (!(n > 60)) throw new Error('pocos instantes: ' + n);
  if (peor > 90) throw new Error('hay filas de espaldas al sol: ' + caso);
  // y la regla, en cerrado: cos AOI = cos(θ−ψ)·cos λ ⇒ el rango se recorta a |θ−ψ| ≤ acos(cos 88° / cos λ)
  const g2 = F.solarPos(Date.UTC(2026, 5, 21, 18, 40), 41.5763, -0.7981);          // sol a 9,3°, ψ = −83,4°: ahí la paralela al terreno YA está de espaldas
  const [lo, hi] = F.rangoHaz(g2.zen, g2.az, { maxAngle: 55, axisAz: 0 }, 8, 8);
  const psz = F.trueTrackAngle(g2.zen, g2.az, F.pvTilt(8), 0);
  if (!(hi <= psz + 88.01 && lo >= psz - 88.01)) throw new Error(`el rango ${lo.toFixed(1)}…${hi.toFixed(1)} se sale de ψ ${psz.toFixed(1)} ± 88°`);
  const aoiTope = (th) => { const o = F.surfaceOrient(th, F.pvTilt(8), 0), b = o.tilt * RAD, z = g2.zen * RAD;
    return Math.acos(Math.max(-1, Math.min(1, Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((g2.az - o.az) * RAD)))) / RAD; };
  if (!(aoiTope(10) > 90)) throw new Error('el caso ya no es el que era: la paralela al terreno ahí debería estar de espaldas');
  if (!(hi < 10)) throw new Error('el tope sigue en la paralela al terreno (+10), que ahí está de espaldas: ' + hi.toFixed(1));
  if (!(aoiTope(hi) < 89)) throw new Error('el tope recortado sigue sin recibir haz: AOI ' + aoiTope(hi).toFixed(1));
});

t('sin cielo, la consigna sale MARCADA como no reparada (el guardarraíl no es silencioso)', () => {
  /* El recorte al rango lo arbitra la energía; sin irradiancia no hay nada que
     comparar, así que no se recorta. Pero quien llame a las políticas sin cielo
     tiene que saber que lo que recibe no está reparado: sale con `sinReparar`.
     La página, el barrido y el export siempre traen cielo. */
  const T = casoB(6, true);
  const g = F.solarPos(Date.UTC(2026, 5, 21, 7, 30), 41.5763, -0.7981);
  const sinCielo = F.policyAngles('pairwise', g.zen, g.az, T).angles;
  if (sinCielo.sinReparar !== true) throw new Error('sin cielo, la consigna sale sin marcar: nadie sabría que no está reparada');
  const irr = F.clearskyIneichen(g.zen, 172, 300, 3.5);
  const conCielo = F.policyAngles('pairwise', g.zen, g.az, T, irr, 172, 0.2).angles;
  if (conCielo.sinReparar) throw new Error('con cielo la consigna se marca como no reparada, y sí lo está');
});

t('H2 (reauditoría): la ENERGÍA del día no se hunde — ninguna política sin sombra baja del 80 % del astronómico en el caso B', () => {
  // la reauditoría midió true-3D en 7,37 Wh/m² frente a 10,73 del astronómico: un 31 % del día perdido
  const T = casoB(6, true), doy = 172; const E = {};
  for (const k of ['astro', 'pairwise', 'true3d', 'mgl']) E[k] = 0;
  for (let mm = 0; mm < 1440; mm += 10) {
    const g = F.solarPos(Date.UTC(2026, 5, 21, 0, mm), 41.5763, -0.7981); if (!(g.zen < 90)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5); if (irr.dni <= 50) continue;
    for (const k of ['astro', 'pairwise', 'true3d', 'mgl'])
      E[k] += F.poaPlant(g.zen, g.az, T, F.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles, irr, doy, 0.2).plant / 6;
  }
  for (const k of ['pairwise', 'true3d', 'mgl'])
    if (E[k] < 0.8 * E.astro) throw new Error(`${k} ${(E[k] / 1000).toFixed(2)} Wh/m² frente a astro ${(E.astro / 1000).toFixed(2)}: ${(100 - 100 * E[k] / E.astro).toFixed(0)} % del día perdido`);
});

t('R1 (tercera auditoría): el rango legítimo sobrevive al accionamiento QUEBRADO — su caso de Arequipa, y el barrido entero de los cuatro accionamientos', () => {
  /* Su reproducción exacta: Arequipa · valle 2 · N-S senoidal 2° · quebrado ·
     alineadas ×1 · 6 filas · az −20° · 21-jun 20:40Z, sol 20,9°. La fila 3
     recibía θ = +9,5° con su rango en [−55, +2]: 7,5° pasada la paralela, con
     la cara colectora al lado contrario del sol. El test H2 de la batería no
     lo veía porque el caso B es monofila. */
  const RAD = Math.PI / 180, pitch = 6, cw = 2.382, nR = 6;
  const mkT = (drive) => {
    const ELEV = []; for (let i = 0; i < nR; i++) ELEV.push(2 * Math.abs(i - (nR - 1) / 2) / ((nR - 1) / 2));
    const groups = F.driveGroups(nR, drive);
    const perfil = []; for (let i = 0; i < nR; i++) perfil.push(2 * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(nR / 2))));
    const eff = F.effRowTilts(perfil, drive, groups);
    const filaLen = 2 * 28 * 1.146 + 0.55;
    const segs = F.nsSegments(nR, 'alineadas', 1, filaLen, 1.0, drive === 'mono' ? 1 : 2);
    if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(q => q.slice());
    const RM = F.rotulaMesas('senoidal', 2, drive, segs, ELEV, groups, 0.55);
    const T = { pairs: F.pairsFromElev(ELEV, pitch, eff), cw, axisAz: -20, maxAngle: 55, gcr: cw / pitch, z0: 0.17,
                nBypass: 2, iam: 0.05, rowTilt: eff, groups, drive, segs: RM ? RM.segs : segs, filaLen };
    if (RM) Object.assign(T, { segTilt: RM.segTilt, segZ: RM.segZ, segSide: RM.segSide, segMorro: RM.segMorro, segPairs: RM.segPairs, segDrive: RM.segDrive });
    return T;
  };
  // 1) su instante, en el accionamiento donde falla
  {
    const T = mkT('quebrado'), g = F.solarPos(Date.UTC(2026, 5, 21, 20, 40), -16.59577, -71.80644);
    const irr = F.clearskyIneichen(g.zen, 172, 1563, 3.5);
    const RU = F.rangosUnidad(g.zen, g.az, T);
    for (const key of ['pairwise', 'true3d', 'mgl']) {
      const ang = F.policyAngles(key, g.zen, g.az, T, irr, 172, 0.2).angles;
      for (let r = 0; r < nR; r++)
        if (ang[r] < RU[r][0] - 1e-6 || ang[r] > RU[r][1] + 1e-6)
          throw new Error(`${key} fila ${r} θ ${ang[r].toFixed(1)} fuera de ${RU[r][0].toFixed(1)}…${RU[r][1].toFixed(1)} con el sol a ${g.elev.toFixed(1)}°`);
    }
  }
  // 2) y el día entero en los CUATRO accionamientos, que es donde se escapó
  for (const drive of ['mono', 'bifila', 'quebrado']) {
    const T = mkT(drive);
    for (let mm = 0; mm < 1440; mm += 20) {
      const g = F.solarPos(Date.UTC(2026, 5, 21, 0, mm), -16.59577, -71.80644);
      if (!(g.elev > 5)) continue;
      const irr = F.clearskyIneichen(g.zen, 172, 1563, 3.5); if (irr.dni <= 50) continue;
      const RU = F.rangosUnidad(g.zen, g.az, T);
      const sombraMax = (a) => { const sh = F.shadeBand3DAll(g.zen, g.az, T, a, { noStruct: true }); let m = 0; for (let r = 0; r < nR; r++) m = Math.max(m, sh[r]); return m; };
      for (const key of ['pairwise', 'true3d', 'mgl']) {
        const ang = F.policyAngles(key, g.zen, g.az, T, irr, 172, 0.2).angles;
        const fuera = [];
        for (let r = 0; r < nR; r++) if (ang[r] < RU[r][0] - 1 || ang[r] > RU[r][1] + 1) fuera.push(r);
        if (!fuera.length) continue;
        /* salirse más de 1° sólo está permitido por la ÚNICA puerta que deja la
           regla: que recortar empeore la sombra o pierda energía de planta. Se
           comprueba midiéndolo, no se tolera por umbral. */
        const rec = ang.map((v, r) => Math.max(RU[r][0], Math.min(RU[r][1], v)));
        const peorSombra = sombraMax(rec) > sombraMax(ang) + 1e-9;
        const peorEnergia = F.poaPlant(g.zen, g.az, T, rec, irr, 172, 0.2).plant < F.poaPlant(g.zen, g.az, T, ang, irr, 172, 0.2).plant - 1e-9;
        if (!peorSombra && !peorEnergia)
          throw new Error(`${drive}/${key} filas ${fuera.join(',')} fuera de su rango y recortarlas NO cuesta nada (sombra ${(100 * sombraMax(ang)).toFixed(1)} → ${(100 * sombraMax(rec)).toFixed(1)} %) · ${(mm / 60).toFixed(1)}h sol ${g.elev.toFixed(1)}° · θ ${ang.map(v => v.toFixed(1)).join('/')}`);
      }
    }
  }
});

t('H (ancla del extremo): la postura que hundía la POA en v1.56 —fila de espaldas al sol a las 09:30— sigue clasificada como BLOQUEANTE por la regla de coste', () => {
  /* Un invariante basado en coste necesita un ancla en el extremo, o dentro de
     seis versiones nadie sabrá dónde estaba la línea. Ésta es la que lo fija:
     en v1.56, true-3D publicaba a las 09:30 del caso B una fila de espaldas al
     sol con POA de planta 65 W/m² cuando recortarla al rango daba 716. Aquel
     desastre NO era un recorte «que cuesta energía»: era +651 W/m² regalados.
     La regla nueva (H bloquea cuando recortar no cuesta) lo habría parado, y
     este test lo exige con su número. */
  const T = casoB(6, true), doy = 172, RAD = Math.PI / 180;
  const g = F.solarPos(Date.UTC(2026, 5, 21, 7, 30), 41.5763, -0.7981);     // 09:30 local
  const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5);
  if (!(g.elev > 20)) throw new Error('el instante ya no es el de las 09:30: sol ' + g.elev.toFixed(1));
  const RU = F.rangosUnidad(g.zen, g.az, T);
  // la consigna MALA de v1.56: la fila 2 mandada al lado contrario del sol
  const malo = F.policyAngles('true3d', g.zen, g.az, T, irr, doy, 0.2).angles.slice();
  malo[2] = -45;
  const o = F.surfaceOrient(malo[2], F.pvTilt(T.rowTilt[2]), T.axisAz), b = o.tilt * RAD, z = g.zen * RAD;
  const aoi = Math.acos(Math.max(-1, Math.min(1, Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((g.az - o.az) * RAD)))) / RAD;
  if (!(aoi > 90)) throw new Error('el ancla ya no es una fila de espaldas: AOI ' + aoi.toFixed(1));
  const rec = malo.map((v, r) => Math.max(RU[r][0], Math.min(RU[r][1], v)));
  const dP = F.poaPlant(g.zen, g.az, T, rec, irr, doy, 0.2).plant - F.poaPlant(g.zen, g.az, T, malo, irr, doy, 0.2).plant;
  if (!(dP >= -0.05)) throw new Error(`la regla de coste ya NO bloquearía aquel desastre: recortar cuesta ${(-dP).toFixed(2)} W/m²`);
  /* el +651 de v1.56 era sobre SU vector publicado, que ya no existe; aquí el
     ancla se construye metiendo la fila 2 de espaldas en el vector de hoy y lo
     que se exige es lo que importa: que recortarla siga siendo una GANANCIA
     grande, no un empate que la tolerancia de «gratis» pudiera tragarse. */
  if (!(dP > 20)) throw new Error(`el ancla ha perdido su extremo: recortar sólo gana ${dP.toFixed(1)} W/m² (v1.56, sobre su propio vector, eran +651)`);
});

t('v1.57.3 · sol RASANTE: el render dibuja con el MISMO sol que ve la física (reportado: «esa sombra es sospechosa»)', () => {
  /* Captura de Ignacio: El Burgo, 21-jun, 06:33 local, sol 0,28°, DNI 2 W/m².
     El contador se clava en EL_MIN_FIS = 0,5° desde v1.36 porque por debajo el
     ray-cast no es fiable; la silueta roja del 3D, la luz que proyecta el
     sombreado gris y el rayo crítico seguían usando la elevación CRUDA. A 0,28°
     la sombra de una fila mide 1.213 m en vez de 688: 1,76 veces más larga, y
     aparecía rojo en filas que el contador da al 2,5 %. No era un fallo de la
     física ni del render: es que no compartían el mismo sol. */
  if (!/const EL_MIN_FIS=0\.5;/.test(html)) throw new Error('el suelo de validez del contador ya no es una constante con nombre');
  if (!/if\(zen>90-EL_MIN_FIS\)zen=90-EL_MIN_FIS;/.test(html)) throw new Error('el contador no se clava con EL_MIN_FIS');
  if (!/function elFisica\(g\)\{return Math\.max\(EL_MIN_FIS,g\.elev\);\}/.test(html)) throw new Error('sin el helper que da el sol de la física');
  /* lo que importa no es CUÁNTOS sitios lo usan —la autoauditoría de v1.57.3
     encontró tres más: el corte 2D, la cámara del sol y el barrido gemelo—,
     sino que NINGUNO dibuje con el sol crudo. La cuenta sube cuando se añade
     una vista; el cero de abajo es el invariante. */
  const usos = (html.match(/elFisica\(g\)/g) || []).length;
  if (!(usos >= 4)) throw new Error(`sólo ${usos} sitios del render usan el sol de la física: la luz, la silueta, el rayo crítico y la cámara del sol son cuatro`);
  if (/el=g\.elev\*RAD/.test(html)) throw new Error('queda algún sitio del render dibujando con la elevación CRUDA');
  if (/const psz=trueTrackAngle\(g\.zen,/.test(html)) throw new Error('el corte 2D vuelve a calcular su rayo con el zen CRUDO');
  if (/const EL_MIN=0\.5;/.test(html)) throw new Error('la cámara del sol tiene otra vez su propia copia del suelo de validez');
  // y que la diferencia sea real, para que el test no pase por vacío
  /* la configuración de la captura: cresta de 3 m y ejes a 25°, que es donde el
     efecto es grande. Con el caso B la diferencia es de 0,3 pp y el test no
     probaría nada — lo dijo su propia guarda. */
  const nR = 8, pitch = 6, RADl = Math.PI / 180, filaLen = 2 * 28 * 1.146 + 0.55;
  const ELEV = new Array(nR).fill(0).map((_, i) => -3 * Math.abs(i - (nR - 1) / 2) / ((nR - 1) / 2) + 3);
  const T = { pairs: F.pairsFromElev(ELEV, pitch, new Array(nR).fill(0)), cw: 2.382, axisAz: 25, maxAngle: 55,
              gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: new Array(nR).fill(0),
              groups: null, drive: 'mono', segs: F.nsSegments(nR, 'alineadas', 1, filaLen, 1.0, 1), filaLen };
  const g = F.solarPos(Date.UTC(2026, 5, 21, 4, 33), 41.57634, -0.79814);
  if (!(g.elev > 0 && g.elev < 0.5)) throw new Error('el instante ya no es rasante: sol ' + g.elev.toFixed(2));
  const irr = F.clearskyIneichen(g.zen, 172, 1563, 3.5);
  const ang = F.policyAngles('pairwise', g.zen, g.az, T, irr, 172, 0.2).angles;
  const clav = F.shadeBand3DAll(89.5, g.az, T, ang, { noStruct: true });
  const crudo = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
  let dmax = 0; for (let r = 0; r < nR; r++) dmax = Math.max(dmax, Math.abs(crudo[r] - clav[r]));
  if (!(dmax > 0.05)) throw new Error(`dibujar con el sol crudo ya no cambia nada (${(100 * dmax).toFixed(2)} pp): el test no prueba lo que dice`);
});

t('v1.58 · EL PROBADOR: certifica sin usar la búsqueda de la política, puede decir que NO, y da los DOS números', () => {
  /* Las tres condiciones que el auditor marcó como invalidantes. Si alguna se
     pierde, el probador deja de valer aunque siga compilando. */
  const fis = html.slice(html.lastIndexOf('/*', html.indexOf('FÍSICA PURA')), html.indexOf('/* FIN-FÍSICA'));
  const cuerpo = fis.slice(fis.indexOf('function certifica('), fis.indexOf('\n}', fis.indexOf('function certifica(')));
  // 1) NO comparte la búsqueda: no puede llamar a las que deciden
  for (const prohibida of ['anglesPairwise', 'anglesTrue3d', 'anglesMinGroundLight', 'anglesOptimal', 'repairNoShade', 'driveCoupleSafe'])
    if (new RegExp('[^A-Za-z]' + prohibida + '\\s*\\(').test(cuerpo))
      throw new Error(`el probador llama a ${prohibida}: sería el juez y el juzgado, como el oráculo de podas`);
  if (!/policyAngles\(key,zen,az,T,irr,doy,albedo\)\.angles/.test(cuerpo)) throw new Error('el probador no pide la consigna PUBLICADA');
  // 2) puede decir que no
  if (!/'mejorable'/.test(cuerpo)) throw new Error('el probador no tiene veredicto «mejorable»: uno que siempre dice óptimo no vale');
  // 3) dos números con estatus de no dominado, nunca una puntuación única
  if (!/sombraPct/.test(cuerpo) || !/poa:/.test(cuerpo)) throw new Error('el certificado no lleva los DOS números');
  if (!/costeDeLaEleccion/.test(cuerpo)) throw new Error('sin el precio de la elección, un canje mal hecho pasa desapercibido');
  if (!/alcance:/.test(cuerpo)) throw new Error('el probador no declara su discretización: certifica «el mejor de su barrido», no «el óptimo»');

  // y que funcione: en el caso A, pairwise a mediodía debe salir óptimo o empatado
  const T = casoB(6, false), doy = 172;
  const g = F.solarPos(Date.UTC(2026, 5, 21, 10, 0), 41.5763, -0.7981);
  const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5);
  const ce = F.certifica('pairwise', g.zen, g.az, T, irr, doy, 0.2);
  if (['óptimo', 'empatado'].indexOf(ce.veredicto) < 0)
    throw new Error(`en llano a mediodía pairwise sale «${ce.veredicto}»: publica ${ce.elegido.sombraPct.toFixed(1)} % y hay ${ce.mejorHallado ? ce.mejorHallado.sombraPct.toFixed(1) : '—'} %`);
  if (!(ce.candidatos.evaluados > 50)) throw new Error('el probador apenas mide candidatos: ' + ce.candidatos.evaluados);
  if (!(ce.sellos.mv > 0) || !(ce.sellos.paso > 0)) throw new Error('el certificado no sella con qué malla y qué paso se obtuvo');
});

t('H3: energy-optimal y óptimo libre ≥ pairwise PUBLICADO (reparado), por construcción — en los instantes donde base ≠ publicado', () => {
  const T = casoB(6, true), doy = 172; let dif = 0;
  for (let mm = 5 * 60; mm <= 19 * 60; mm += 10) {
    const g = F.solarPos(Date.UTC(2026, 5, 21, 0, mm), 41.5763, -0.7981); if (!(g.zen < 90)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5);
    const pub = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, 0.2).angles;
    const base = F.driveCoupleSafe(g.zen, g.az, T, F.anglesPairwise(g.zen, g.az, T), false);
    if (pub.some((v, i) => Math.abs(v - base[i]) > 1e-9)) dif++;
    const pp = F.poaPlant(g.zen, g.az, T, pub, irr, doy, 0.2).plant;
    for (const key of ['optimal', 'optfree']) { const po = F.poaPlant(g.zen, g.az, T, F.policyAngles(key, g.zen, g.az, T, irr, doy, 0.2).angles, irr, doy, 0.2).plant;
      if (po < pp - 1e-6) throw new Error(`${key} ${po.toFixed(2)} < pairwise publicado ${pp.toFixed(2)} (minuto ${mm})`); }
  }
  if (!(dif >= 5)) throw new Error('el caso no discrimina: base = publicado en casi todos los instantes (' + dif + ')');
  // y el veto lo lleva escrito: el pairwise reparado es candidato
  // v1.57.2: el veto ya no repesca sólo los extremos — mide la REJILLA ENTERA
  // con el contador exacto, más el pairwise publicado. Es estrictamente más
  // fuerte que lo que este test pedía, y lo que lo vigila de verdad es el
  // invariante J del barrido (el óptimo publicado es el mejor de su rejilla).
  if (!/cands\.push\(\[0,pub\]\)/.test(html)) throw new Error('el veto de energy-optimal no incluye el pairwise publicado');
  if (!/OPT_FRACTIONS\.map\(f2=>\[f2,base\.map/.test(html)) throw new Error('el veto ya no mide la rejilla entera con el contador exacto');
});
t('H4: cielo claro Ineichen ≡ pvlib por defecto (sin realce de Perez) — Zaragoza 21-jun 07:30, TL 3,5, 300 m: 80,1 / 300,2 / 31,7 W/m²', () => {
  const c = F.clearskyIneichen(gB.zen, 172, 300, 3.5);
  const ok = (v, ref) => Math.abs(v - ref) <= 0.5;
  if (!(ok(c.ghi, 80.1) && ok(c.dni, 300.2) && ok(c.dhi, 31.7))) throw new Error(`sale ${c.ghi.toFixed(1)} / ${c.dni.toFixed(1)} / ${c.dhi.toFixed(1)} (pvlib 0.15, perez_enhancement=False: 80,1 / 300,2 / 31,7)`);
  const e = F.clearskyIneichen(gB.zen, 172, 300, 3.5, { perezEnhancement: true });
  if (!(ok(e.ghi, 101.4) && ok(e.dhi, 53.0))) throw new Error('con el realce pedido a sabiendas debe dar lo de pvlib con perez_enhancement=True (101,4 / 53,0): ' + e.ghi.toFixed(1) + ' / ' + e.dhi.toFixed(1));
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
  if (!/OPT_FRACTIONS\.map\(f2=>\[f2,base\.map/.test(html) || !/cands\.push\(\[0,pub\]\)/.test(html))
    throw new Error('el veto no mide la rejilla entera con el contador exacto (v1.57.2) más el pairwise publicado');
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
  for (const k of ['ncu', 'tcu', 'theta_sim_deg', 'theta_tcu_deg', 'asesoria', 'sacrificada'])
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
  const PRr = T.real, SZ = T.segZ || (PRr && PRr.segZ) || null, xs = [0], zch = [0];   // v1.54: cota por mesa en T (medida o del quiebro en la rótula)
  for (let i = 0; i < T.pairs.length; i++) {
    xs.push(xs[i] + T.pairs[i].pitch);
    zch.push(zch[i] - T.pairs[i].pitch * Math.tan(T.pairs[i].slope * RAD));
  }
  /* v1.39: el oráculo llevaba SU PROPIA COPIA del mismo fallo, y por eso no lo
     cazó nunca: un oráculo que duplica el defecto no puede detectarlo.
     Preguntar por un norte donde esa fila no tiene mesa devolvía la cota del
     extremo del tramo más cercano —hasta 376 m— y fabricaba suelo por encima
     de los módulos. Aquí se arregla igual, pero escrito aparte: lo que tiene
     que coincidir es el RESULTADO, no el código. */
  const cotD = (row, v) => {
    if (SZ && SZ[row]) {
      const segs = T.segs[row], zz = SZ[row];
      let bi = -1, bd = Infinity;
      for (let k = 0; k < segs.length; k++) {
        const lo = Math.min(segs[k][0], segs[k][1]), hi = Math.max(segs[k][0], segs[k][1]);
        const d = v < lo ? lo - v : (v > hi ? v - hi : 0);
        if (d < bd) { bd = d; bi = k; }
      }
      const [a, b] = segs[bi], t2 = Math.max(0, Math.min(1, (v - a) / ((b - a) || 1)));
      return { z: zz[bi][0] + t2 * (zz[bi][1] - zz[bi][0]), d: bd };
    }
    return { z: zch[row] + v * Math.tan(((T.rowTilt ? T.rowTilt[row] : 0)) * RAD), d: 0 };
  };
  const cot = (row, v) => cotD(row, v).z;
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
      planes.push({ e, w0, w1, nE, uD, vD,
        C: [axC[0] + zOff * nu[0], axC[1] + zOff * nu[1], axC[2] + zOff * nu[2]],
        tb: { C: axC, ax: [e1, e2, e3], hf: [O_TUBE / 2, O_TUBE / 2, Math.abs(w1 - w0) * lv / 2] },
        sl: { C: [axC[0] + (zOff - O_GLASS / 2) * nu[0], axC[1] + (zOff - O_GLASS / 2) * nu[1], axC[2] + (zOff - O_GLASS / 2) * nu[2]],
              ax: [e1, e2, e3], hf: [T.cw / 2, O_GLASS / 2, Math.abs(w1 - w0) * lv / 2] } });
    }
  }
  return { nR, xs, cot, cotD, segsOf, planes };
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
function oracleTerr(G, sv, zen, T) {
  const HUB = 2.0, nR = G.nR, xs = G.xs;
  const TOL = 5;                       // m: más allá, esa fila no mide ese norte
  /* v1.49: y una línea solo vota el suelo de un punto si está CERCA en x. Es
     otra decisión de MODELO del contador —con plantas de varios bloques, la
     línea de índice contiguo puede estar a cientos de metros y fabricaba un
     escarpe— y el oráculo la comparte, como comparte el límite de 4 filas. */
  const XMAX = Math.max(12, 3 * ((T && T.pitch) || (xs.length > 1 ? xs[1] - xs[0] : 6)));
  // el rango de norte que mide la planta (decisión de modelo compartida con el
  // contador): fuera de él, más allá de TOL, no hay suelo que se invente. En
  // los presets `cotD` devuelve d=0 siempre (la cota es analítica), así que sin
  // esta puerta el oráculo extendía el suelo hasta el infinito y el contador no
  const _sg = (T && T.real && T.real.segs) ? T.real.segs : (T && T.segs) || null;
  let nMin = Infinity, nMax = -Infinity;
  if (_sg) for (const line of _sg) if (line) for (const s2 of line) {
    nMin = Math.min(nMin, s2[0], s2[1]); nMax = Math.max(nMax, s2[0], s2[1]);
  }
  if (!(nMin <= nMax)) { nMin = -Infinity; nMax = Infinity; }
  const gzOf = (x, v) => {
    if (v < nMin - TOL || v > nMax + TOL) return -Infinity;
    let i = 0;
    if (x <= xs[0]) i = 0; else if (x >= xs[nR - 1]) i = nR - 2;
    else { while (i < nR - 2 && xs[i + 1] < x) i++; }
    const a = G.cotD(i, v), b = G.cotD(Math.min(nR - 1, i + 1), v);
    const okA = a.d <= TOL, okB = b.d <= TOL;
    if (okA && okB) {
      const f2 = Math.max(0, Math.min(1, (x - xs[i]) / ((xs[i + 1] - xs[i]) || 1)));
      return (a.z * (1 - f2) + b.z * f2) - HUB;
    }
    if (okA && Math.abs(x - xs[i]) <= XMAX) return a.z - HUB;
    if (okB && Math.abs(x - xs[Math.min(nR - 1, i + 1)]) <= XMAX) return b.z - HUB;
    /* La búsqueda hacia fuera se limita a 4 filas, IGUAL que el contador: es
       una decisión de MODELO declarada (más allá, la cota de esa banda de
       norte no la mide nadie cercano y estimarla sería inventar), no una
       poda. El oráculo comparte las decisiones de modelo y vigila las podas;
       cuando este límite difería (oráculo sin límite), divergían 0,47 pp en
       un rasante de diciembre — y eso era el TEST detectando la diferencia,
       exactamente su trabajo. */
    for (let k = 1; k <= 4; k++) for (const j of [i - k, i + 1 + k]) {
      if (j < 0 || j >= nR) continue;
      if (Math.abs(x - xs[j]) > XMAX) continue;      // esa línea está en otro sitio
      const c = G.cotD(j, v); if (c.d <= TOL) return c.z - HUB;
    }
    return -Infinity;                  // nadie mide ese norte: sin terreno
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
  const terr = oracleTerr(G, sv, zen, T);
  const hw = T.cw / 2, MV = F2.mvPara(T, zen);   // v1.57: las MISMAS estaciones que publica el contador (adaptativas, con el sol)
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
          /* la base (uD, vD) de la pala es OBLICUA con el eje inclinado
             (uD·vD = −sin θE·sE): la coordenada de cuerda del impacto es
             (H−C)·uD − w·(uD·vD), con w = H1 − C1. Aquí se resuelve el 2×2
             (uE, w) por eliminación, distinto del contador, que corrige en
             cerrado el término lineal. Tenía el MISMO defecto que el
             contador (proyección oblicua tomada por ortogonal) y por eso
             nunca lo cazó: 19 % de sombra en un plano uniforme a 5°. */
          const kuv = pl.uD[0] * pl.vD[0] + pl.uD[1] * pl.vD[1] + pl.uD[2] * pl.vD[2];
          const wAt = (u) => (py0 - pl.C[1]) + q * (t0 - tc * u);           // w del impacto, lineal en u
          const uE = (u) => (d0 + dc * u) - kuv * wAt(u);                    // cuerda real del impacto
          const dcE = uE(1) - uE(0), d0E = uE(0);
          lin(dcE, hw - d0E); lin(-dcE, hw + d0E);
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
  const terr = oracleTerr(G, sv, zen, T);
  const hw = T.cw / 2, MV = F2.mvPara(T, zen);
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
            const kuv = pl.uD[0] * pl.vD[0] + pl.uD[1] * pl.vD[1] + pl.uD[2] * pl.vD[2];
            const du = (H0 - pl.C[0]) * pl.uD[0] + (H1 - pl.C[1]) * pl.uD[1] + (H2 - pl.C[2]) * pl.uD[2]
                     - (H1 - pl.C[1]) * kuv;                                   // base oblicua: ver oracleExact
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
t('CONVERGENCIA en la PLANTA MEDIDA (Ayora, MV=8 por diseño): MV=8 vs MV=32 en rasante ≤0,7 pp de MEDIA DE PLANTA (estudio: anual +0,007%)', () => {
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
t('CONVERGENCIA POR FILA en PRESETS con torsión: |publicado − MV 128| ≤ 3 pp, y ninguna mancha de más del 2 % publicada por debajo de su mitad', () => {
  /* la cota de arriba es de Ayora, media de planta y vigas casi paralelas; NO
     describe el error por fila de un preset con torsión, que es lo que el
     tercer auditor midió (2,03 pp en el caso A y 2,63 pp en el B) y lo que la
     métrica F del barrido publica (peor 2,5 pp en 40 configuraciones). Esta
     guarda fija esa cota donde se mide, para que el título de la de arriba no
     se lea como una promesa que no da. */
  const casos = [['A', casoB(6, false)], ['B', casoB(6, true)]];
  let peor = 0, quien = null;
  for (const [nm, T] of casos)
    for (let mm = 0; mm < 1440; mm += 30) {
      const g = F.solarPos(Date.UTC(2026, 5, 21, 0, mm), 41.5763, -0.7981); if (!(g.zen < 89)) continue;
      const ang = F.anglesPairwise(g.zen, g.az, T);
      const pub = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
      const ref = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true, MV: 128 });
      for (let r = 0; r < 6; r++) {
        const d = Math.abs(pub[r] - ref[r]);
        if (d > peor) { peor = d; quien = `${nm} ${(mm / 60).toFixed(1)}h sol ${g.elev.toFixed(1)}° fila ${r}: ${(100 * pub[r]).toFixed(1)} % frente a ${(100 * ref[r]).toFixed(1)} %`; }
        if (ref[r] > 0.02 && pub[r] < 0.5 * ref[r]) throw new Error(`mancha perdida: ${nm} fila ${r} publica ${(100 * pub[r]).toFixed(1)} % con ${(100 * ref[r]).toFixed(1)} % convergido`);
      }
    }
  if (peor > 0.03) throw new Error(`la malla publicada se separa ${(100 * peor).toFixed(2)} pp de MV 128 — ${quien}`);
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
  /* A UN TEMPORAL: un banco no reescribe la ficha del SCADA. */
  const dOut = fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-'));
  execFileSync(process.execPath, [ep, 'ayora', '--dir', dOut], { cwd: ROOT, stdio: 'pipe' });
  const csv = fs.readFileSync(path.join(dOut, 'config_tcu_ayora.csv'), 'utf-8').trim().split('\n');
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
  // Este guard exigía que San José ABORTARA («no casa con su levantamiento»),
  // y cumplió su función: al investigar el no-casar aparecieron la unión por
  // IDENTIDAD (id = tk, que Ayora no tiene) y la ficha del fabricante
  // CONTAMINADA por la referencia vertical. Ahora San José tiene que CASAR por
  // identidad, y el veto de rango tiene que estar vetando esas pendientes
  // imposibles en vez de dejarlas pasar a los registros.
  let sjOut = '';
  try { sjOut = execFileSync(process.execPath, [ep, 'sanjose', '--dir', fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-'))], { cwd: ROOT, encoding: 'utf-8' }); }
  catch (e) { throw new Error('San José dejó de casar: ' + ((e.stdout || '') + (e.stderr || '')).slice(-300)); }
  if (!/unión por IDENTIDAD/.test(sjOut)) throw new Error('San José ya no une por identidad (id = tk)');
  if (!/VETO DE RANGO: \d+ pendiente/.test(sjOut))
    throw new Error('el veto de rango no está vetando las pendientes contaminadas de la ficha del fabricante');
  const sjCsv = fs.readFileSync(path.join(ROOT, 'config_tcu_sanjose.csv'), 'utf-8');
  const cab2 = sjCsv.slice(0, sjCsv.indexOf('\n')).split(',');
  const i98 = cab2.indexOf('r41098_west_grade_rad'), i102 = cab2.indexOf('r41102_east_grade_rad');
  for (const ln of sjCsv.split('\n').slice(1)) {
    if (!ln) continue;
    const c2 = ln.split(',');
    for (const ii of [i98, i102]) {
      const v = parseFloat(c2[ii]);
      if (isFinite(v) && v > Math.PI / 4 + 1e-9)
        throw new Error('un registro fuera de 0..π/4 llegó al CSV: ' + ln.slice(0, 60));
    }
  }
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
    // v1.42: la consigna es la de la MESA del seguidor (segTrk, identidad):
    // columna mesa en todas las filas, y en el mundo real de Ayora las mesas
    // de una misma línea NO comparten θ en la mayoría de los pasos diurnos
    const iM = cab.indexOf('mesa'), iH = cab.indexOf('hora_local'), iB = cab.indexOf('bloque'),
          iL = cab.indexOf('linea'), iTh = cab.indexOf('theta_sim_deg');
    if (iM < 0) throw new Error('el CSV no lleva la columna mesa');
    const grp = new Map();
    let sinMesa = 0;
    const por = new Map();
    for (let r = 1; r < L.length; r++) {
      const f = L[r].split(',');
      if (!por.has(f[iN])) por.set(f[iN], new Set());
      por.get(f[iN]).add(+f[iT]);
      if (f[iM] === '') sinMesa++;
      const k = f[iH] + '|' + f[iB] + '|' + f[iL];
      if (!grp.has(k)) grp.set(k, new Set());
      grp.get(k).add(f[iTh]);
    }
    if (sinMesa) throw new Error(sinMesa + ' filas sin mesa: seguidores casados por x en vez de por identidad (segTrk)');
    let dist = 0;
    for (const v of grp.values()) if (v.size > 1) dist++;
    if (!(dist > grp.size * 0.5)) throw new Error('solo ' + dist + '/' + grp.size + ' (hora,bloque,línea) con θ distinto entre mesas: la consigna sigue siendo la de la línea');
    const meta = JSON.parse(fs.readFileSync(out.replace(/\.csv$/, '.meta.json'), 'utf-8'));
    if (meta.seguidores_por_identidad !== meta.seguidores) throw new Error(meta.seguidores_por_identidad + '/' + meta.seguidores + ' por identidad');
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
  /* v1.57.3: el clavado se escribe con la constante única que comparten la
     física y el render (antes era el literal 89,5 aquí y un 0,5 suelto allí). */
  if (!/const EL_MIN_FIS=0\.5;/.test(html)) throw new Error('sin la constante del suelo de validez');
  if (!/if\(zen>90-EL_MIN_FIS\)zen=90-EL_MIN_FIS;/.test(html)) throw new Error('ya no se clava al borde de validez');
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
  // v1.39: el umbral estaba en 50 % y se calibró contra el contador que
  // fabricaba suelo. Quitado el suelo fantasma la cifra real es ~41 %, que
  // sigue siendo «mayormente tapada» pero ya no es 50. Lo que este test
  // vigila es la MONOTONÍA; el suelo sólo es un mínimo de cordura.
  if (prevMed < 0.25) throw new Error('al ocaso la planta debería estar muy tapada, y sale ' +
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

t('v1.53.3: los optimizadores enseñan la FÍSICA del minuto pedido con la consigna de la malla', () => {
  // «¿Cómo puede ser que energy-optimal tenga una posición diferente a true3d
  // sin BT?» — dos capturas a las 15:23, θ 55° en ambas, pero sol 24,2° en una
  // y 24,8° en la otra. sceneInstant devolvía null para optimal/optfree (su
  // búsqueda por instante haría lento el slider) y la escena y el HUD enseñaban
  // la muestra ENTERA de la malla de 5 min: sol, cielo, sombra y POA de las
  // 15:20 bajo el rótulo «15:23». Ahora mantienen la consigna de la malla (lo
  // que hace un TCU con consigna cada 5 min) y la física es la del minuto.
  if (/if\(key==='optimal'\|\|key==='optfree'\)return null;/.test(html))
    throw new Error('sceneInstant vuelve a devolver null para los optimizadores: el HUD miente la hora');
  if (!/held:held\?DAY\.times\[tIdx\]:null/.test(html))
    throw new Error('el instante no declara la consigna mantenida (held)');
  if (!/consigna de las '\+hhmm\(INSTANT\.held\)/.test(html))
    throw new Error('el HUD ya no dice de qué muestra de la malla es la consigna');
});

t('v1.39: si falta sol.js la página lo DICE, no muere en blanco', () => {
  // «No me deja entrar al html, no carga» — y era una pantalla en blanco sin
  // un solo mensaje. Un visor que muere mudo cuando le falta una dependencia
  // no se puede diagnosticar desde el otro lado del teléfono.
  if (!/typeof Sol==='undefined'/.test(html))
    throw new Error('la página ya no comprueba que sol.js haya llegado');
  if (!/No se pudo cargar/.test(html))
    throw new Error('el aviso de dependencia perdida ya no está');
  // `typeof VER` NO es seguro dentro del aviso: `const VER` vive en el ámbito
  // léxico global, y si el script principal muere antes de inicializarlo la
  // variable queda en zona muerta temporal y hasta `typeof` lanza. La primera
  // versión del aviso se mataba a sí misma justo así.
  if (/typeof VER!=='undefined'\?VER/.test(html))
    throw new Error('el aviso vuelve a usar typeof VER: se mata solo por la zona muerta temporal');
  if (!/try\{ ver=VER; \}catch/.test(html))
    throw new Error('el aviso ya no lee VER a prueba de zona muerta');
  // y las dos páginas que comparten sol.js tienen que pedir la MISMA versión,
  // o una está corriendo contra un fichero para el que no se escribió
  const oc = fs.readFileSync(path.join(ROOT, 'overcast.html'), 'utf-8');
  const vb = (html.match(/src="sol\.js\?v=([^"]+)"/) || [])[1];
  const vo = (oc.match(/src="sol\.js\?v=([^"]+)"/) || [])[1];
  if (!vb || !vo) throw new Error('alguna página no declara la versión de sol.js');
  if (vb !== vo) throw new Error(`backtracking pide sol.js?v=${vb} y overcast ?v=${vo}: es el MISMO fichero`);
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

t('protocolo de prueba de UN seguidor: registros de la ficha y firma inconfundible', () => {
  // la ultima verificacion pendiente del firmware (el termino de pendiente) se
  // cierra en campo con este protocolo; si la ficha cambia o la prediccion se
  // encoge hasta el ruido, el protocolo deja de servir y hay que regenerarlo
  let r;
  try { r = require_child().execFileSync('node',
    [path.join(ROOT, 'tools', 'protocolo_prueba_pendiente.mjs'),
     '--planta', 'ayora', '--ncu', '12', '--tcu', '26', '--fecha', '2026-08-30'],
    { encoding: 'utf-8' }); }
  catch (e) { throw new Error('el protocolo aborta: ' + ((e.stdout || '') + (e.stderr || '')).slice(-300)); }
  for (const reg of ['41098', '41100', '41102', '41104'])
    if (!new RegExp(reg + ' \\(').test(r)) throw new Error('no imprime el registro ' + reg);
  const m = r.match(/separación máxima prevista: ([\d.]+)°/);
  if (!m) throw new Error('no publica la separación prevista');
  if (+m[1] < 5) throw new Error('la firma prevista (' + m[1] + '°) se acerca al ruido: elegir otro TCU');
  if (!/VUELTA ATRÁS/.test(r)) throw new Error('sin plan de vuelta atrás no hay protocolo');
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
t('San José SANEADA: sin filas con otra referencia vertical, y APTA CON RESERVAS', () => {
  // Este test tenía la forma opuesta: exigía que el desvío sistemático de
  // ~36,6 m SIGUIERA ahí, para forzar la revisión del informe al corregirlo.
  // Ese momento llegó: cotas_asbuilt.py descarta las filas con otra
  // referencia vertical (declarándolas con su id del proveedor), y ahora lo
  // que se vigila es que la corrección NO se deshaga.
  if (!fs.existsSync(path.join(ROOT, 'sanjose_cotas.json'))) return;
  const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_cotas.json'), 'utf-8'));
  // (a) ninguna bifila con sus dos filas (mismo tubo) a más de 3 m
  for (const t2 of C.t) {
    if (!t2 || !t2.f || t2.f.length !== 2 || t2.inc) continue;
    const y0 = (t2.f[0].y[0] + t2.f[0].y[1]) / 2, y1 = (t2.f[1].y[0] + t2.f[1].y[1]) / 2;
    if (Math.abs(y0 - y1) > 3)
      throw new Error('vuelve una bifila con filas a ' + Math.abs(y0 - y1).toFixed(1) +
        ' m (x=' + t2.f[0].x + '): ¿se regeneró sin la regla de referencia vertical?');
  }
  // (b) el control de entrada la da por evaluable
  let r, code = 0;
  try { r = require_child().execFileSync('node',
    [path.join(ROOT, 'tools', 'valida_relieve.mjs'), '--planta', 'sanjose'], { encoding: 'utf-8' }); }
  catch (e) { r = (e.stdout || '') + (e.stderr || ''); code = e.status; }
  // Desde v1.46 el veredicto es APTA a secas: al colocar en su x la viga
  // duplicada de los 231 trackers con una sola fila medida desaparecieron los
  // vanos de 0 m que las reservas señalaban. Se acepta APTA o APTA CON
  // RESERVAS — lo que no vale es que deje de ser evaluable.
  if (code !== 0 || !/VEREDICTO: APTA/.test(r))
    throw new Error('San José ya no es evaluable (código ' + code + '):\n' + r.slice(-500));
  if (/fila anómala/.test(r))
    throw new Error('reaparecen filas anómalas:\n' + r.slice(-500));
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
    // desde el saneado de la referencia vertical, San José pasa el control
    // (con reservas: el vano-vial y la cobertura). El aviso que esta rama
    // daba antes ya cumplió su función: el informe se revisó al corregir.
    const r = corre(['--planta', 'sanjose', '--bloque', '0']);
    if (r.c !== 0) throw new Error('San José bloque 0 dejó de ser evaluable:\n' + r.s.slice(-400));
  }
});

// ── v1.41: el tilt POR MESA (fila medida), no por línea ─────────────────────
console.log('v1.41 · tilt por mesa');
{
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, 30, null);
  const mkT = (P) => {
    const pairs = [];
    for (let i = 0; i < P.lineX.length - 1; i++) {
      const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
      pairs.push({ slope: Math.atan2(P.pairDz ? P.pairDz[i] || 0 : 0, dx) * (180 / Math.PI), pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
    }
    return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17, nBypass: 2, iam: 0.05,
             rowTilt: P.tilt, groups: P.groups, drive: P.drive, segs: P.segs, segTilt: P.segTilt, segPairs: P.segPairs, real: P };
  };
  const T = mkT(P);
  const sol = F.solarPos(Date.UTC(2026, 5, 21, 10, 0), 39.1182, -1.1599);   // 12:00 local
  const zen = 90 - sol.elev, az = sol.az, doy = 172;
  const irr = F.clearskyIneichen(zen, doy, 739, 3.5);

  t('plantFromCotas publica el tilt de CADA mesa (de sus dos cotas) y sus parejas bifila exactas', () => {
    if (!P.segTilt || P.segTilt.length !== P.segs.length) throw new Error('sin segTilt por línea');
    let n = 0, distintos = 0;
    P.segs.forEach((l, r) => l.forEach((sg, k) => {
      const z = P.segZ[r][k], esp = Math.atan2(z[1] - z[0], (sg[1] - sg[0]) || 1) * (180 / Math.PI);   // *DEG, la op exacta de plantFromCotas
      // el tilt se mide ANTES de recentrar las cotas (z−eMean cambia el último bit): 1e-9° de tolerancia, declarada
      if (Math.abs(P.segTilt[r][k] - esp) > 1e-9) throw new Error(`tilt de la mesa ${r}/${k}: ${P.segTilt[r][k]} ≠ ${esp} (sus cotas)`);
      if (Math.abs(P.segTilt[r][k] - P.tilt[r]) > 0.05) distintos++;
      n++;
    }));
    if (!(distintos > n * 0.2)) throw new Error('las mesas apenas se separan del tilt de su línea (' + distintos + '/' + n + '): el careo no distingue');
    if (!(P.segPairs.length >= P.nPairs * 0.9)) throw new Error(P.segPairs.length + ' parejas por mesa vs ' + P.nPairs + ' trackers bifila');
    for (const [[r1, k1], [r2, k2]] of P.segPairs) {
      if (Math.abs(r1 - r2) !== 1) throw new Error('pareja de mesas en líneas no contiguas: ' + r1 + '/' + r2);
      const a = P.segs[r1][k1], b = P.segs[r2][k2];
      if (Math.min(a[1], b[1]) - Math.max(a[0], b[0]) < 5) throw new Error('las dos mesas de un tracker no solapan en N');
    }
  });

  t('IDENTIDAD: sin segTilt, el camino por mesa es el de la línea, bit a bit (θ y POA)', () => {
    const T0 = Object.assign({}, T, { segTilt: null, segPairs: null });
    const rows = F.policyAngles('pairwise', zen, az, T0, irr, doy, 0.2).angles;
    const segA = F.policyAnglesSeg('pairwise', zen, az, T0, irr, doy, 0.2);
    // OJO: policyAngles lleva el refinado driveCoupleSafe por línea; el camino
    // por mesa sin segTilt difunde el pairwise puro. Se carea contra ESE.
    const raw = F.anglesPairwise(zen, az, T0);
    segA.forEach((l, r) => l.forEach(v => { if (v !== raw[r]) throw new Error(`fila ${r}: θ por mesa ${v} ≠ pairwise de la línea ${raw[r]}`); }));
    if (rows.length !== segA.length) throw new Error('líneas');
  });

  t('IDENTIDAD: el contador 3D con θ escalar no ha movido ni un bit (fila) y su suma por tramos es la fila', () => {
    const rows = F.policyAngles('pairwise', zen, az, T, irr, doy, 0.2).angles;
    const a = F.shadeBand3DAll(zen, az, T, rows);
    const asArrays = rows.map((v, r) => T.segs[r].map(() => v));
    const b = F.shadeBand3DAll(zen, az, T, asArrays);
    for (let r = 0; r < rows.length; r++) {
      if (a[r] !== b[r] || a.elec[r] !== b.elec[r]) throw new Error(`fila ${r}: escalar ${a[r]} ≠ array del mismo θ ${b[r]}`);
      if (!a.seg || !a.seg[r] || a.seg[r].length !== T.segs[r].length) throw new Error('sin sombra por tramo');
      // media por tramo ponderada por estaciones (MV fijo por tramo) == fila
      const m = a.seg[r].reduce((s, v) => s + v, 0) / a.seg[r].length;
      if (Math.abs(m - a[r]) > 1e-9) throw new Error(`fila ${r}: media de tramos ${m} ≠ fila ${a[r]}`);
    }
  });

  t('sin segTilt, poaPlantSeg reproduce poaPlant bit a bit (rows y plant)', () => {
    const T0 = Object.assign({}, T, { segTilt: null, segPairs: null });
    const rows = F.anglesPairwise(zen, az, T0);
    const pl = F.poaPlant(zen, az, T0, rows, irr, doy, 0.2);
    const ps = F.poaPlantSeg(zen, az, T0, rows.map((v, r) => T0.segs[r].map(() => v)), irr, doy, 0.2);
    // fila = media ponderada por largo de tramos IGUALES entre sí sólo si la
    // sombra por tramo es uniforme; por eso se carea el POA SIN sombra (noche
    // no vale: cielo despejado a mediodía con el ray-cast dando cero en llano
    // no está garantizado) → se carea tramo a tramo contra poaRow+su sombra
    for (let r = 0; r < rows.length; r++) {
      for (let k = 0; k < ps.segs[r].length; k++) {
        const p = F.poaRow(rows[r], T0.rowTilt[r], 0, zen, az, irr, doy, 0.2, T0.iam);
        const fo = ps.shade.seg[r][k], se = ps.shade.segElec[r][k];
        const esp = p.beam * (1 - se) + p.circ * (1 - fo) + p.sky + p.gnd;
        if (ps.segs[r][k] !== esp) throw new Error(`tramo ${r}/${k}: ${ps.segs[r][k]} ≠ ${esp}`);
      }
    }
    if (ps.rows.length !== pl.rows.length) throw new Error('filas');
  });

  t('CON segTilt: θ y POA cambian MESA A MESA dentro de una línea, y las parejas bifila comparten θ exacto', () => {
    const seg = F.policyAnglesSeg('pairwise', zen, az, T, irr, doy, 0.2);
    let lineasConDispersion = 0, n = 0;
    seg.forEach((l, r) => { n++; if (l.length > 1 && Math.max(...l) - Math.min(...l) > 0.02) lineasConDispersion++; });
    if (!(lineasConDispersion > n * 0.3)) throw new Error('solo ' + lineasConDispersion + '/' + n + ' líneas con θ distinto por mesa: el tilt por mesa no entra');
    for (const [[r1, k1], [r2, k2]] of T.segPairs)
      if (seg[r1][k1] !== seg[r2][k2]) throw new Error(`pareja ${r1}/${k1}-${r2}/${k2}: ${seg[r1][k1]} ≠ ${seg[r2][k2]} — el acople por mesa no manda`);
    const ps = F.poaPlantSeg(zen, az, T, seg, irr, doy, 0.2);
    for (const l of ps.segs) for (const v of l) if (!Number.isFinite(v) || v < 0) throw new Error('POA por mesa no finita');
    if (!(ps.plant > 300)) throw new Error('mediodía de junio con ' + ps.plant);
    // el astro por mesa sigue al tilt de la mesa: corr(tilt, θ_astro) alta
    const ast = F.anglesAstroSeg(zen, az, T);
    const xs = [], ys = [];
    T.segTilt.forEach((l, r) => l.forEach((tl, k) => { xs.push(tl); ys.push(ast[r][k]); }));
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const corr = sxy / Math.sqrt(sxx * syy);
    if (!(Math.abs(corr) > 0.9)) throw new Error('corr(tilt de mesa, θ astro de mesa) = ' + corr.toFixed(3));
  });

  t('el acople por mesa es un mutante vivo: sin segPairs, alguna pareja se separa', () => {
    const raw = F.anglesPairwiseSeg(zen, az, T);
    let sep = 0;
    for (const [[r1, k1], [r2, k2]] of T.segPairs) if (raw[r1][k1] !== raw[r2][k2]) sep++;
    if (!(sep > 0)) throw new Error('sin acoplar ya coinciden todas: el careo del acople es vacío');
  });
}

console.log('v1.42 · el mando por mesa en la UI y en las consignas');
{
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, 30, null);
  const mkT = (P, conSeg) => {
    const pairs = [];
    for (let i = 0; i < P.lineX.length - 1; i++) {
      const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
      pairs.push({ slope: Math.atan2(P.pairDz ? P.pairDz[i] || 0 : 0, dx) * (180 / Math.PI), pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
    }
    return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17, nBypass: 2, iam: 0.05,
             rowTilt: P.tilt, groups: P.groups, drive: P.drive, segs: P.segs,
             segTilt: conSeg ? P.segTilt : null, segPairs: conSeg ? P.segPairs : null, real: P };
  };
  const T = mkT(P, true), T0 = mkT(P, false);
  const sol = F.solarPos(Date.UTC(2026, 5, 21, 10, 0), 39.1182, -1.1599);
  const zen = 90 - sol.elev, az = sol.az, doy = 172;
  const irr = F.clearskyIneichen(zen, doy, 739, 3.5);

  t('segTrk: cada mesa sabe de qué seguidor de cotas.t es (identidad), y las parejas bifila son las dos mesas de UN seguidor', () => {
    if (!P.segTrk) throw new Error('plantFromCotas no publica segTrk');
    const enCotas = new Set(cotas.t);
    let n = 0;
    P.segTrk.forEach(l => l.forEach(tk => { if (!enCotas.has(tk)) throw new Error('segTrk apunta a un objeto que no es de cotas.t'); n++; }));
    // v1.48: cada fila levantada son DOS mesas (sur y norte del morro)
    if (n !== 2 * P.nFilas) throw new Error(n + ' mesas con segTrk para ' + P.nFilas + ' filas (esperadas ' + 2 * P.nFilas + ')');
    if (P.nMesas !== n) throw new Error('nMesas (' + P.nMesas + ') no cuadra con segTrk (' + n + ')');
    for (const [[r1, k1], [r2, k2]] of P.segPairs)
      if (P.segTrk[r1][k1] !== P.segTrk[r2][k2]) throw new Error('una pareja bifila junta mesas de seguidores distintos');
    // y el seguidor de una pareja tiene exactamente CUATRO mesas: dos por viga
    const [[r1, k1]] = P.segPairs[0];
    const cnt = P.segTrk.flat().filter(tk => tk === P.segTrk[r1][k1]).length;
    if (cnt !== 4) throw new Error('el seguidor de la primera pareja aparece en ' + cnt + ' mesas (un bifila son cuatro)');
  });

  t('segLineMean y slewLimitSeg son la IDENTIDAD del camino por línea cuando todas las mesas llevan el valor de su línea', () => {
    const rows = F.policyAngles('pairwise', zen, az, T0, irr, doy, 0.2).angles;
    const bc = F.segsBroadcast(T0, rows);
    const mean = F.segLineMean(T0, bc);
    for (let r = 0; r < rows.length; r++) if (Math.abs(mean[r] - rows[r]) > 1e-12) throw new Error('línea ' + r + ': media ' + mean[r] + ' ≠ ' + rows[r]);
    const prev = rows.map(v => v - 3), prevS = F.segsBroadcast(T0, prev);
    const a = F.slewLimit(prev, rows, 5), b = F.slewLimitSeg(prevS, bc, 5);
    for (let r = 0; r < rows.length; r++) for (let k = 0; k < bc[r].length; k++) if (b[r][k] !== a[r]) throw new Error('slew por mesa ≠ slew por línea en ' + r + '/' + k);
    // y el slew de verdad limita mesa a mesa: 5 s a 0,17 °/s son 0,85° como mucho
    for (let r = 0; r < rows.length; r++) for (let k = 0; k < bc[r].length; k++) if (Math.abs(b[r][k] - prevS[r][k]) > 0.85 + 1e-9) throw new Error('el actuador de una mesa saltó ' + (b[r][k] - prevS[r][k]) + '°');
  });

  t('poaPlantSeg publica la banda plantHi/plantLo: sin segTilt es la de poaPlant, con segTilt encierra a plant', () => {
    const rows = F.policyAngles('pairwise', zen, az, T0, irr, doy, 0.2).angles;
    const a = F.poaPlant(zen, az, T0, rows, irr, doy, 0.2), b = F.poaPlantSeg(zen, az, T0, F.segsBroadcast(T0, rows), irr, doy, 0.2);
    // sin segTilt cada mesa es su línea; la diferencia con poaPlant es SOLO la
    // sombra por tramo (sh.seg) frente a la de fila — la banda se mueve con
    // ella dentro del mismo orden de magnitud que plant
    if (!(Math.abs(b.plant - a.plant) < 5) || !(Math.abs(b.plantHi - a.plantHi) < 5) || !(Math.abs(b.plantLo - a.plantLo) < 5))
      throw new Error('banda por mesa lejos de la de poaPlant: ' + [a.plant, b.plant, a.plantHi, b.plantHi, a.plantLo, b.plantLo].map(v => v.toFixed(1)));
    if (!(b.plantHi >= b.plant - 1e-9 && b.plantLo <= b.plant + 1e-9)) throw new Error('plantLo ≤ plant ≤ plantHi roto sin segTilt');
    const s = F.policyAnglesSeg('pairwise', zen, az, T, irr, doy, 0.2), c = F.poaPlantSeg(zen, az, T, s, irr, doy, 0.2);
    if (!(c.plantHi >= c.plant - 1e-9 && c.plantLo <= c.plant + 1e-9)) throw new Error('plantLo ≤ plant ≤ plantHi roto con segTilt');
    if (!isFinite(c.plantHi) || !isFinite(c.plantLo)) throw new Error('banda no finita');
  });

  t('la UI manda por mesa: computeDayGen y sceneInstant van por policyAnglesSeg/poaPlantSeg cuando hay segTilt (y solo entonces)', () => {
    // el camino de la página no corre en Node: se vigila su TEXTO, igual que
    // el careo v1.19 vigila el literal de elecLoss. Lo que se exige es que el
    // día y el instante pasen por segCmd + slewLimitSeg + poaPlantSeg y que
    // la ficha (Tcfg) siga mandando por línea cuando la TCU no conoce el
    // levantamiento
    const ui = html.slice(html.indexOf('/* FIN-FÍSICA'));
    const dayFn = ui.slice(ui.indexOf('function* computeDayGen'), ui.indexOf('function kpisSerie'));
    for (const lit of ['segOn(T)', 'segCmd(P.key', 'slewLimitSeg(prevS', 'poaPlantSeg(g.zen,g.az,T,ls', 'segLineMean(T,ls)', 'segAng:segAng,poaS:poaS'])
      if (!dayFn.includes(lit)) throw new Error('computeDayGen sin «' + lit + '»');
    const inst = ui.slice(ui.indexOf('function sceneInstant'), ui.indexOf('function btActiveAt'));
    for (const lit of ['segOn(DAY.T)&&PK.segAng', 'slewLimitSeg(PK.segAng[tIdx]', 'poaPlantSeg(g.zen,g.az,DAY.T,ls'])
      if (!inst.includes(lit)) throw new Error('sceneInstant sin «' + lit + '»');
    const cmd = ui.slice(ui.indexOf('function segCmd'), ui.indexOf('function angAt'));
    if (!cmd.includes("Tcfg===T&&(key==='pairwise'||key==='astro')")) throw new Error('segCmd no reserva el mando por mesa a la TCU que conoce el levantamiento');
    // el 3D gira cada mesa con SU θ, la silueta y el rayo también
    const u3 = ui.slice(ui.indexOf('function update3D'), ui.indexOf('function clipPoly'));
    if (!u3.includes('angAt(p,tIdx,r,k)')) throw new Error('update3D no gira cada mesa con su θ');
    const sil = ui.slice(ui.indexOf('function drawShadowSilhouette'), ui.indexOf('function drawTerrainStrips'));
    if (!sil.includes('angAt(p,tIdx,r,kR)') || !sil.includes('angAt(p,tIdx,e,kE)')) throw new Error('la silueta no usa el θ de cada mesa (receptora y emisora)');
    const ray = ui.slice(ui.indexOf('function drawCriticalRay'), ui.indexOf('function pinta3D'));
    if (!ray.includes('angAtN(p,tIdx,pi,yc),angAtN(p,tIdx,pi+1,yc)')) throw new Error('el rayo crítico no corta con el θ de las mesas de la banda');
  });
}

console.log('v1.43 · sombra y POA por ALA (un string por ala en la mesa larga)');
{
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, 30, null);
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: Math.atan2(P.pairDz ? P.pairDz[i] || 0 : 0, dx) * (180 / Math.PI), pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  const T = { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17, nBypass: 2, iam: 0.05,
              rowTilt: P.tilt, groups: P.groups, drive: P.drive, segs: P.segs, segTilt: P.segTilt, segPairs: P.segPairs, real: P };
  const sol = F.solarPos(Date.UTC(2026, 5, 21, 5, 30), 39.1182, -1.1599);   // 07:30 local: sol bajo del este (a las 06:40 aún no ha salido)
  const zen = 90 - sol.elev, az = sol.az, doy = 172;
  const irr = F.clearskyIneichen(zen, doy, 739, 3.5);

  t('shadeBand3DAll publica la sombra por ALA de cada tramo y la media de las dos alas ES el tramo (8 estaciones, 4 por ala)', () => {
    // con ASTRO: el pairwise con torsión (v1.53) ya evita al alba la sombra de
    // ala que este test usaba de testigo, y el testigo tiene que ser algo que
    // sombree seguro
    const seg = F.policyAnglesSeg('astro', zen, az, T, irr, doy, 0.2);
    const sh = F.shadeRows(zen, az, T, seg);
    if (!sh.wing || !sh.wingElec) throw new Error('sin out.wing / out.wingElec');
    let n = 0, dist = 0;
    sh.seg.forEach((l, r) => l.forEach((v, k) => {
      const w = sh.wing[r][k], we = sh.wingElec[r][k];
      if (!w || w.length !== 2 || !we || we.length !== 2) throw new Error(`tramo ${r}/${k} sin sus dos alas`);
      if (Math.abs((w[0] + w[1]) / 2 - v) > 1e-12) throw new Error(`tramo ${r}/${k}: alas ${w} ≠ tramo ${v}`);
      if (Math.abs((we[0] + we[1]) / 2 - sh.segElec[r][k]) > 1e-12) throw new Error(`tramo ${r}/${k}: Martinez por ala ≠ tramo`);
      for (const f of w) if (!(f >= 0 && f <= 1)) throw new Error('fracción por ala fuera de [0,1]');
      n++; if (Math.abs(w[0] - w[1]) > 0.01) dist++;
    }));
    if (!(dist > 0)) throw new Error('al alba ninguna mesa tiene alas con sombra distinta (' + n + ' tramos): la cuenta por ala es vacía');
  });

  t('el ala 0 es el SUR (n bajo): un emisor que solo tapa el extremo sur de la receptora carga el ala 0', () => {
    // dos líneas cortas y llanas; la emisora (oeste) SOLO existe en la mitad sur
    // de la receptora, con el sol en el ESTE y bajo la sombra va hacia el oeste…
    // así que se pone la emisora al ESTE de la receptora (sol del este ⇒ la
    // sombra viaja al oeste, del emisor al receptor)
    const T2 = { pairs: [{ slope: 0, pitch: 5, axisTilt: 0 }], cw: 2.38, axisAz: 0, maxAngle: 55, gcr: 2.38 / 5, z0: 0.17,
                 nBypass: 2, iam: 0.05, rowTilt: [0, 0], groups: null, drive: 'mono',
                 segs: [[[-30, 30]], [[-30, 0]]] };   // receptora = línea 0 (oeste, entera); emisora = línea 1 (este), solo en n<0 (SUR)
    const g2 = F.solarPos(Date.UTC(2026, 5, 21, 5, 30), 39.1182, -1.1599);   // sol del este, bajo (07:30 local)
    const z2 = 90 - g2.elev;
    if (!(g2.az > 45 && g2.az < 135)) throw new Error('el sol no está en el este: az ' + g2.az);
    // las dos filas SIGUEN al sol (astro: de cara al este, sin backtracking):
    // horizontales no se sombrean nunca — la sombra de un plano a la altura h
    // sobre otro a la misma h es el propio borde
    const ang = F.anglesAstro(z2, g2.az, T2);
    if (!(Math.abs(ang[0]) > 20)) throw new Error('el astro no inclina las filas al alba: ' + ang);
    const sh = F.shadeRows(z2, g2.az, T2, ang);
    const w = sh.wing[0][0];
    if (!(sh.seg[0][0] > 0.02)) throw new Error('la receptora no se sombrea: ' + sh.seg[0][0]);
    if (!(w[0] > w[1] + 0.02)) throw new Error('el ala SUR (0) no es la sombreada: ' + w);
  });

  t('poaPlant y poaPlantSeg publican la POA por ala y la media de las alas es la POA de la mesa', () => {
    const seg = F.policyAnglesSeg('pairwise', zen, az, T, irr, doy, 0.2);
    const ps = F.poaPlantSeg(zen, az, T, seg, irr, doy, 0.2);
    if (!ps.wings) throw new Error('poaPlantSeg sin wings');
    ps.segs.forEach((l, r) => l.forEach((v, k) => {
      const w = ps.wings[r][k];
      if (!w) throw new Error('mesa sin alas');
      if (Math.abs((w[0] + w[1]) / 2 - v) > 1e-9 * Math.max(1, v)) throw new Error(`mesa ${r}/${k}: ${w} ≠ ${v}`);
    }));
    const rows = F.policyAngles('pairwise', zen, az, T, irr, doy, 0.2).angles;
    const pp = F.poaPlant(zen, az, T, rows, irr, doy, 0.2);
    if (!pp.wings || pp.wings.length !== rows.length) throw new Error('poaPlant sin wings por fila');
    pp.wings.forEach((l, r) => { if (l.length !== T.segs[r].length) throw new Error('fila ' + r + ': alas para ' + l.length + ' mesas de ' + T.segs[r].length); });
  });
}

console.log('v1.44 · la ventana no parte trackers · la planta entera');
{
  const cotasA = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const cotasS = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_cotas.json'), 'utf-8'));
  const filasDe = (tk) => (tk.f || []).filter(g => g && g.n && g.y && g.n.length >= 2 && g.y.length >= 2).length;
  // v1.48: cada fila levantada entra como DOS mesas (sur y norte del morro),
  // así que un tracker con sus dos vigas completas trae 2 × filas tramos
  const monos = (P) => {
    const cnt = new Map();
    P.segTrk.forEach(l => l.forEach(tk => cnt.set(tk, (cnt.get(tk) || 0) + 1)));
    let m = 0; for (const [tk, n] of cnt) if (n !== 2 * filasDe(tk)) m++;
    return { m, trk: cnt.size };
  };
  t('la ventana de maxLines NUNCA deja un tracker con una sola fila (Ayora 80/30, San José 80) — antes 2 y 10 monofilas', () => {
    for (const [cotas, ml, nombre] of [[cotasA, 80, 'Ayora 80'], [cotasA, 30, 'Ayora 30'], [cotasS, 80, 'San José 80'], [cotasS, 40, 'San José 40']]) {
      const P = F.plantFromCotas(cotas, ml, null);
      const r = monos(P);
      if (r.m) throw new Error(nombre + ': ' + r.m + ' trackers partidos por la ventana (' + r.trk + ' trackers, ' + P.elev.length + ' líneas, huérfanas ' + P.huerfanas + ')');
      // el contrato «hasta N líneas» se mantiene: la ventana limpia tiene N, y si
      // no la hay se encoge (nunca amplía); lo que quede huérfano se quita y se cuenta
      if (!(P.elev.length <= ml && P.elev.length >= ml - 4)) throw new Error(nombre + ': la ventana se fue a ' + P.elev.length + ' líneas');
      if (P.huerfanas > 4) throw new Error(nombre + ': ' + P.huerfanas + ' filas huérfanas quitadas');
    }
  });
  t("blockIdx 'all' es la PLANTA ENTERA: todas las líneas y todas las filas, sin ventana, y cada tracker con sus dos filas", () => {
    const P = F.plantFromCotas(cotasA, Infinity, 'all');
    const nT = cotasA.t.filter(Boolean).length, nF = cotasA.t.filter(Boolean).reduce((a, tk) => a + filasDe(tk), 0);
    if (P.block !== 'all') throw new Error('block = ' + P.block);
    if (P.nFilas !== nF) throw new Error(P.nFilas + ' filas de ' + nF);
    const r = monos(P);
    if (r.trk !== nT || r.m) throw new Error(r.trk + ' trackers de ' + nT + ', ' + r.m + ' partidos');
    const total = P.blocks.reduce((a, b) => a + b.lines, 0);
    if (P.elev.length !== total) throw new Error(P.elev.length + ' líneas ≠ Σ bloques ' + total);
    // los huecos entre bloques quedan como VANOS grandes (sin solape ⇒ Δz 0), y el resto de vanos son el pitch
    const grandes = P.pairs ? 0 : 0;
    let big = 0; for (let i = 0; i < P.lineX.length - 1; i++) if (P.lineX[i + 1] - P.lineX[i] > 2.5 * P.pitch) big++;
    if (big !== P.blocks.length - 1) throw new Error(big + ' vanos grandes para ' + P.blocks.length + ' bloques');
    // y la ventana de 80 del simulador sigue siendo un SUBCONJUNTO exacto de la planta entera (misma geometría por línea)
    const W = F.plantFromCotas(cotasA, 80, null);
    const xs = new Set(P.lineXAbs.map(v => v.toFixed(3)));
    for (const x of W.lineXAbs) if (!xs.has(x.toFixed(3))) throw new Error('la ventana tiene una línea que la planta entera no: x=' + x);
    void grandes;
  });
}

t('el censo de relieve cubre TODAS las plantas del índice, sin inventar veredictos', () => {
  // El censo es el sitio donde es tentador rellenar el hueco: nueve plantas sin
  // cotas y un DEM global a mano. Este test vigila las dos mitades — que no se
  // deje ninguna planta fuera, y que no dé un veredicto donde no hay dato.
  let r;
  try { r = require_child().execFileSync('node',
    [path.join(ROOT, 'tools', 'gate_relieve_cartera.mjs')], { encoding: 'utf-8' }); }
  catch (e) { throw new Error('el censo falla:\n' + ((e.stdout || '') + (e.stderr || '')).slice(-500)); }
  const IDX = JSON.parse(fs.readFileSync(path.join(ROOT, 'plantas_indice.json'), 'utf-8')).plantas;
  for (const p of IDX)
    if (!new RegExp('^  ' + p.planta + ' ', 'm').test(r))
      throw new Error('el censo se deja fuera a ' + p.planta);
  // una planta sin cotas NO puede salir con veredicto de la puerta
  for (const p of IDX) {
    if (fs.existsSync(path.join(ROOT, p.planta + '_cotas.json'))) continue;
    const l = (r.match(new RegExp('^  ' + p.planta + ' .*$', 'm')) || [''])[0];
    if (/APTA|NO EVALUABLE/.test(l))
      throw new Error(p.planta + ' no tiene cotas y el censo le da veredicto: «' + l.trim() + '»');
  }
  // y las dos que sí las tienen deben salir evaluadas
  for (const pl of ['ayora', 'sanjose']) {
    if (!fs.existsSync(path.join(ROOT, pl + '_cotas.json'))) continue;
    if (!new RegExp('^  ' + pl + ' .*APTA', 'm').test(r))
      throw new Error(pl + ' tiene cotas y el censo no la evalúa');
  }
});

console.log('');
console.log('referencia vertical POR PUNTO (tools/cotas_asbuilt.py)');

// ORÁCULO INDEPENDIENTE del detector. No comparte una línea con la versión de
// Python: allí se indexa por cubos en x, aquí se recorre una ventana sobre los
// puntos ordenados por y. La lección del terreno fantasma fue justo esta — el
// oráculo no cazó el fallo porque llevaba dentro una copia del código malo.
function oraculoRefVertical(P, umbral = 3, dy = 10, dx = 30, minv = 3) {
  const n = P.id.length;
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => P.y[a] - P.y[b]);
  const malos = new Map();                       // id de fila -> [[id de punto, desvío]]
  for (let k = 0; k < n; k++) {
    const i = ord[k], z = [];
    for (let d = -1; d <= 1; d += 2)             // hacia atrás y hacia delante en y
      for (let m = k + d; m >= 0 && m < n; m += d) {
        const j = ord[m];
        if (Math.abs(P.y[j] - P.y[i]) > dy) break;
        if (Math.abs(P.x[j] - P.x[i]) <= dx) z.push(P.z[j]);
      }
    if (z.length < minv) continue;
    z.sort((a, b) => a - b);
    const r = P.z[i] - z[(z.length / 2) | 0];
    if (Math.abs(r) > umbral) {
      const f = P.filas[P.fi[i]];
      if (!malos.has(f)) malos.set(f, []);
      malos.get(f).push([P.id[i], r]);
    }
  }
  return malos;
}
// nube sintética: LIN líneas de seguidores, EST estaciones de medida por línea
function nubeSintetica(zDe, LIN = 12, EST = 6, pitch = 6) {
  const P = { id: [], x: [], y: [], z: [], fi: [], filas: [] };
  for (let l = 0; l < LIN; l++)
    for (let e = 0; e < EST; e++) {
      P.filas.push('L' + l + '-E' + e);
      for (const off of [0, 0.9]) {              // los puntos van en pareja (junta entre mesas)
        P.id.push(P.id.length + 1); P.x.push(l * pitch); P.y.push(e * 37 + off);
        P.z.push(zDe(l, e)); P.fi.push(P.filas.length - 1);
      }
    }
  return P;
}

t('relieve solidario (un talud) NO se marca: es terreno, no referencia', () => {
  // Un escalón de −3,5 m a partir de la estación 2, IGUAL en todas las líneas.
  // Con una bola de radio fijo la mediana mezcla los dos niveles y marca
  // terreno bueno: en San José daba 7 falsos positivos en el borde de TR-07.
  const P = nubeSintetica((l, e) => 100 + 0.1 * l + (e >= 2 ? -3.5 : 0));
  const m = oraculoRefVertical(P);
  if (m.size) throw new Error('marca un talud real como referencia vertical: ' + [...m.keys()].join(', '));
});
t('punto aislado con otra referencia SÍ se marca, y solo él', () => {
  const P = nubeSintetica((l, e) => 100 + 0.1 * l + (e >= 2 ? -3.5 : 0));
  const i = P.filas.indexOf('L5-E3') * 2;        // un solo punto de una sola fila
  P.z[i] += 36.6;
  const m = oraculoRefVertical(P);
  if (m.size !== 1 || !m.has('L5-E3')) throw new Error('esperaba solo L5-E3, salió: ' + [...m.keys()].join(', '));
  if (m.get('L5-E3').length !== 1) throw new Error('marca más puntos de la fila de los que están mal');
});
t('el umbral no es delicado: de 3 a 20 m marca lo mismo en San José', () => {
  const f = path.join(ROOT, 'sanjose_puntos.json');
  if (!fs.existsSync(f)) return;
  const P = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const n = u => [...oraculoRefVertical(P, u).values()].reduce((a, v) => a + v.length, 0);
  const a = n(3), b = n(20);
  if (a !== b) throw new Error('la banda vacía entre familias se cerró: umbral 3 marca ' + a + ' y umbral 20 marca ' + b +
    ' — hay algo entre 3 y 20 m que ya no es ni ruido ni geoide, mirarlo antes de tocar el umbral');
  if (a < 50) throw new Error('el detector dejó de ver la familia del geoide (' + a + ' puntos)');
});
t('la ventana está elegida por medida, y 30 m es el último dx seguro', () => {
  // Documenta POR QUÉ la ventana es la que es, y falla si alguien la «mejora».
  // dy y el cuórum se sueltan sin mover el veredicto (eso sube la cobertura de
  // Ayora del 76,9 % al 96,5 % sin comprar nada). dx es el que tiene dos bordes:
  // ampliarlo alcanza el otro nivel de un talud —a 100 m salen falsos positivos
  // en TR-07, que es terreno real— y estrecharlo por debajo de 30 m empieza a
  // perder contaminación de verdad (91 puntos en vez de 98).
  const f = path.join(ROOT, 'sanjose_puntos.json');
  if (!fs.existsSync(f)) return;
  const P = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const filas = (dy, dx, mv) => new Set(oraculoRefVertical(P, 3, dy, dx, mv).keys());
  const base = filas(10, 30, 3);
  const igual = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  // La ventana ancha NO puede ver contaminación que la buena no vea. Lo que sí
  // puede es marcar de más cerca del umbral: son los falsos positivos de ladera
  // que motivaron estrechar dx (con el levantamiento completo, TR-08_1-068-W y
  // TR-08_1-097-W dan +3,2 m con dx=60 y +0,8 m con dx=30). Así que lo que se
  // exige no es igualdad —eso era una casualidad del muestreo viejo— sino que
  // NO SE ESCAPE NADA de la familia del geoide.
  const vieja = oraculoRefVertical(P, 3, 3, 60, 6);
  for (const [fid, v] of vieja) {
    const pico = Math.max(...v.map(t => Math.abs(t[1])));
    if (pico > 20 && !base.has(fid))
      throw new Error('la ventana buena se deja ' + fid + ' con ' + pico.toFixed(1) +
        ' m: eso es la familia del geoide, no ruido de ladera');
  }
  // y 30 es el ÚLTIMO valor seguro de dx: estrechar más sí pierde puntos
  if (igual(filas(10, 24, 3), base))
    throw new Error('estrechar dx a 24 m ya no pierde puntos: si de verdad da igual, 30 deja de estar justificado');
  const ancha = oraculoRefVertical(P, 3, 10, 100, 3);
  const t7 = [...ancha.keys()].filter(id => id.startsWith('TR-07')).length;
  if (t7 === 0)
    throw new Error('ampliar dx a 100 m ya no mete falsos positivos del talud de TR-07: ' +
      'o cambió el dato o cambió el detector — si de verdad da igual, dx deja de estar justificado en 60');
  if ([...base].some(id => id.startsWith('TR-07')))
    throw new Error('la ventana buena marca el talud de TR-07, que es terreno real');
});
t('Python y el oráculo señalan EXACTAMENTE las mismas filas', () => {
  // Señalar no es lo mismo que tirar: una fila con UNA punta contaminada se
  // REPARA (se le repone esa cota y conserva posición, largo y la otra punta) y
  // solo se descarta la que pierde las dos puntas. Lo que este careo exige es
  // que las dos implementaciones vean lo mismo, no qué se hace después.
  const f = path.join(ROOT, 'sanjose_puntos.json');
  if (!fs.existsSync(f)) return;
  const P = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const esp = new Set([...oraculoRefVertical(P).keys()].filter(id =>
    JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_asbuilt.json'), 'utf-8')).f.some(r => r.id === id)));
  let r;
  try { r = require_child().execFileSync('python3',
    [path.join(ROOT, 'tools', 'cotas_asbuilt.py'), 'sanjose'], { encoding: 'utf-8' }); }
  catch (e) { throw new Error('cotas_asbuilt.py falla:\n' + ((e.stdout || '') + (e.stderr || '')).slice(-600)); }
  const dicho = new Set([...r.matchAll(/^\s+(\S+)\s+cota .*\[(?:reparada|descartada)\]/gm)].map(m => m[1]));
  const falta = [...esp].filter(x => !dicho.has(x)), sobra = [...dicho].filter(x => !esp.has(x));
  if (falta.length || sobra.length)
    throw new Error('discrepan: Python no señala ' + (falta.join(', ') || '—') +
                    ' · señala de más ' + (sobra.join(', ') || '—'));
  if (!esp.size) throw new Error('el oráculo no señala nada: el test se quedó sin dientes');
});
t('una punta contaminada se REPONE y no se lleva por delante la fila entera', () => {
  // La contaminación es de la COTA: la X,Y del punto sigue donde el topógrafo
  // la puso. Tirar la fila entera por una punta se llevaba su posición, su
  // largo y las cotas SANAS que tuviera, y su tracker acababa reconstruido del
  // plano con TODO estimado en vez de una sola cota.
  const fc = path.join(ROOT, 'sanjose_cotas.json'), fa = path.join(ROOT, 'sanjose_asbuilt.json');
  if (!fs.existsSync(fc) || !fs.existsSync(fa)) return;
  const C = JSON.parse(fs.readFileSync(fc, 'utf-8'));
  const A = JSON.parse(fs.readFileSync(fa, 'utf-8'));
  const AB = new Map(A.f.map(r => [r.id, r]));
  let rep = 0;
  for (const t of C.t) {
    if (!t || t.est) continue;
    for (const g of t.f) {
      if (!g.ye || g.ye === 3) continue;
      rep++;
      // la geometría tiene que seguir siendo la MEDIDA, al centímetro
      const cand = A.f.filter(r => Math.abs(r.x - g.x) < 0.05 &&
        Math.abs(-r.zs - g.n[0]) < 0.05 && Math.abs(-r.zn - g.n[1]) < 0.05);
      if (!cand.length) {
        // la única fila que puede no estar en el as-built es la HERMANA
        // DUPLICADA de un tracker inc=1: no se midió, se copia de su gemela
        // —y por eso hereda su marca—, pero su tracker tiene que decirlo.
        if (!t.inc)
          throw new Error('una fila reparada no cuadra con ninguna del as-built ' +
            'y su tracker no es inc=1: x=' + g.x + ' n=' + g.n);
        const gem = t.f.find(o => o !== g);
        if (!gem || Math.abs(gem.y[0] - g.y[0]) > 1e-9 || Math.abs(gem.y[1] - g.y[1]) > 1e-9)
          throw new Error('hermana duplicada de una fila reparada que NO copia a su gemela: x=' + g.x);
        rep--;                                   // no cuenta como fila reparada medida
        continue;
      }
      // y la punta repuesta NO puede ser la que traía el as-built contaminado
      const y = g.ye === 1 ? g.y[0] : g.y[1];
      const orig = g.ye === 1 ? cand[0].ys : cand[0].yn;
      if (Math.abs(y - orig) < 1e-9)
        throw new Error('la punta marcada como repuesta conserva la cota contaminada: ' + cand[0].id);
      // la otra punta, en cambio, tiene que seguir siendo la medida
      const otra = g.ye === 1 ? g.y[1] : g.y[0];
      const otraOrig = g.ye === 1 ? cand[0].yn : cand[0].ys;
      if (Math.abs(otra - otraOrig) > 1e-6)
        throw new Error('la punta SANA de una fila reparada se ha tocado: ' + cand[0].id);
      // y la repuesta tiene que caer en la banda de lo medido, no en el limbo
      if (Math.abs(y - otra) > 40)
        throw new Error('la cota repuesta de ' + cand[0].id + ' sigue a ' +
          Math.abs(y - otra).toFixed(1) + ' m de la otra punta: eso es la otra referencia otra vez');
    }
  }
  // Y LO DERIVADO TIENE QUE CUADRAR CON LO EMITIDO. pa son las dos medias
  // pendientes de la fila y salen de sus propias cotas: si una punta se
  // repone y pa se queda como estaba, entra al modelo una pendiente de la
  // referencia vieja — pasó, y valía 196,8 %.
  for (const t of C.t) {
    if (!t) continue;
    for (const g of t.f) {
      if (!g.pa || !g.pa.length || g.nm === null || g.ym === null) continue;
      const Ls = g.nm - g.n[0], Ln = g.n[1] - g.nm;
      const esp = [];
      if (Ls > 5) esp.push((g.ym - g.y[0]) / Ls * 100);
      if (Ln > 5) esp.push((g.y[1] - g.ym) / Ln * 100);
      if (esp.length !== g.pa.length)
        throw new Error('pa tiene ' + g.pa.length + ' valores y sus cotas dan ' + esp.length + ' (x=' + g.x + ')');
      for (let i = 0; i < esp.length; i++)
        if (Math.abs(esp[i] - g.pa[i]) > 0.01)
          throw new Error('pa[' + i + '] = ' + g.pa[i].toFixed(3) + ' % no sale de las cotas de su fila (' +
            esp[i].toFixed(3) + ' %) en x=' + g.x + ': un derivado se quedó sin rehacer');
    }
  }
  if (rep < 10) throw new Error('apenas ' + rep + ' filas reparadas: el test se quedó sin dientes');
  if ((C.n_ye || 0) < rep) throw new Error('el meta no declara todas las cotas no medidas (n_ye)');
  // y el reconstruido del plano lleva las DOS puntas marcadas
  for (const t of C.t) if (t && t.est) for (const g of t.f)
    if (g.ye !== 3) throw new Error('un tracker reconstruido no declara ye=3');
});
t('media MESA contaminada: entera por punto, a la MITAD por la media de la fila', () => {
  // Este es el motivo de todo el cambio, y el dato dice algo más preciso de lo
  // que parecía: lo que cambia de referencia no es un punto suelto, es una
  // MESA ENTERA (una sesión de campo). En TR-09_1-044-E la mesa sur está a
  // 1531,7 m y la norte a 1568,7 — 36,7 m de salto EN EL MISMO TUBO, que es
  // imposible; su hermana -W tiene las cuatro cotas a 1531,x. Como el as-built
  // se queda con un extremo de cada mesa, la media de la fila sale a MITAD de
  // camino (+18,2 m) y pasaba el umbral de 3 m por suerte, no por diseño.
  const fp = path.join(ROOT, 'sanjose_puntos.json'), fa = path.join(ROOT, 'sanjose_asbuilt.json');
  if (!fs.existsSync(fp) || !fs.existsSync(fa)) return;
  // EL CASO SE BUSCA POR EL FENÓMENO, NO POR SU NOMBRE. Este test llevaba el
  // id TR-09_1-044-E a pelo y se rompió cuando el emparejamiento E/W pasó a
  // decidirse por el borde del bloque: la viga es la MISMA (misma x, mismos
  // extremos) pero ahora se llama -W. Un careo que se cae por un renombre no
  // está comprobando lo que dice comprobar.
  const P = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  const A = JSON.parse(fs.readFileSync(fa, 'utf-8')).f;
  const porId = new Map(A.map(r => [r.id, r]));
  const marc = oraculoRefVertical(P);
  let caso = null;
  for (const [fid, m] of marc) {
    if (m.length !== 2) continue;                       // la MESA entera, no un punto suelto
    if (Math.min(...m.map(v => Math.abs(v[1]))) < 30) continue;
    const ys = m.map(v => P.y[P.id.indexOf(v[0])]).sort((a, b) => a - b);
    if (ys[1] - ys[0] > 40) continue;                   // los dos puntos, de la misma mesa
    // Y LA MESA TIENE QUE SER UNA PUNTA, no la junta: el as-built guarda las
    // dos PUNTAS de la fila, así que si lo contaminado son los dos puntos
    // centrales los extremos salen limpios y no hay dilución ninguna que medir
    // (pasa: son 6 filas en San José). El ejemplo del test necesita una punta.
    const suyos = [];
    for (let i = 0; i < P.n; i++) if (P.filas[P.fi[i]] === fid) suyos.push(P.y[i]);
    if (suyos.length < 3) continue;
    suyos.sort((a, b) => a - b);
    const punta = ys.some(y => Math.abs(y - suyos[0]) < 0.5 || Math.abs(y - suyos[suyos.length - 1]) < 0.5);
    if (!punta) continue;
    const R = porId.get(fid);
    const S = porId.get(fid.replace(/-([EW])$/, (_, s) => '-' + (s === 'E' ? 'W' : 'E')));
    if (!R || !S) continue;
    caso = { fid, m, R, S };
    break;
  }
  if (!caso)
    throw new Error('ya no hay ninguna fila con una MESA entera de otra referencia y su hermana sana: ' +
      'o cambió el dato o el detector dejó de verlo por punto');
  // y por fila el salto se ve a la MITAD: ésa es la dilución que justifica el cambio
  const dPunto = Math.min(...caso.m.map(v => Math.abs(v[1])));
  const dFila = Math.abs((caso.R.ys + caso.R.yn) / 2 - (caso.S.ys + caso.S.yn) / 2);
  if (!(dFila > dPunto * 0.35 && dFila < dPunto * 0.75))
    throw new Error('en ' + caso.fid + ' el salto por punto es ' + dPunto.toFixed(1) +
      ' m y por fila ' + dFila.toFixed(1) + ' m: ya no se diluye a la mitad, revisar el ejemplo');
});
t('una fila condenada NO vota como vecina, y la que se queda entra REPUESTA', () => {
  // TR-08_1-002-E es buena (cero puntos marcados) y se descartaba porque la
  // mediana de su vecindario se apoyaba en su hermana TR-08_1-002-W, condenada
  // dos líneas antes: ése tiene que entrar.
  //
  // TR-08_1-001 tiene sus DOS filas contaminadas (las cuatro puntas, +36,6 m).
  // Antes se tiraba entero y acababa RECONSTRUIDO DEL PLANO — perdiendo su
  // posición y su largo, que son medida, para acabar colocado donde dice el
  // layout y no donde está. Ahora se queda con su geometría MEDIDA y las dos
  // cotas repuestas del terreno vecino, marcado ye=3. Lo que no puede pasar,
  // ni antes ni ahora, es que entre con la cota contaminada: eso se comprueba
  // contra la nube, no de palabra.
  const f = path.join(ROOT, 'sanjose_cotas.json');
  if (!fs.existsSync(f)) return;
  const C = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const de = id => C.t.find(x => x && x.tk === id);
  if (!de('TR-08_1-002')) throw new Error('TR-08_1-002 vuelve a perderse: tiene una fila buena (E), no puede quedarse sin medir');
  const t1 = de('TR-08_1-001');
  if (!t1) throw new Error('TR-08_1-001 se cae: su posición y su largo son MEDIDA, solo la cota se repone');
  if (t1.est) throw new Error('TR-08_1-001 sale reconstruido del plano teniendo su geometría medida');
  for (const g of t1.f) {
    if (g.ye !== 3) throw new Error('TR-08_1-001 entra con una cota que no se declara repuesta (ye ' + g.ye + ')');
    // y la cota repuesta es la del terreno de al lado, no la contaminada: sus
    // vecinas de la misma línea están a menos de 5 m, no a +36,6
    const cerca = C.t.filter(x => x && x !== t1).flatMap(x => x.f)
      .filter(g2 => Math.abs(g2.x - g.x) < 20 && Math.abs((g2.n[0] + g2.n[1]) / 2 - (g.n[0] + g.n[1]) / 2) < 120)
      .map(g2 => (g2.y[0] + g2.y[1]) / 2).sort((a, b) => a - b);
    if (!cerca.length) continue;
    const d = Math.abs((g.y[0] + g.y[1]) / 2 - cerca[cerca.length >> 1]);
    if (d > 5) throw new Error('la cota repuesta de ' + (g.id || 'TR-08_1-001') + ' se aparta ' + d.toFixed(1) + ' m de su vecindario: eso es la contaminada');
  }
});
t('la reclamación dice EXACTAMENTE lo mismo que el detector', () => {
  // reclama_referencia.py nació con su propia copia de la ventana (dy=3, dx=60)
  // y se la pasaba al detector, pisando la buena. Salían los mismos 98 puntos
  // pero con OTROS desvíos: el CSV decía min +35,01 m donde el visor decía
  // +35,20 — dos entregables míos contradiciéndose por un valor por defecto
  // duplicado. Aquí se vigila que sigan siendo el mismo número.
  const f = path.join(ROOT, 'reclamacion_sanjose.csv'), fp = path.join(ROOT, 'sanjose_puntos.json');
  if (!fs.existsSync(f) || !fs.existsSync(fp)) return;
  const P = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  const esp = new Map();
  for (const [, v] of oraculoRefVertical(P)) for (const [pid, r] of v) esp.set(pid, r);
  const filas = fs.readFileSync(f, 'utf-8').replace(/^\uFEFF/, '').trim().split('\n').slice(1);
  if (filas.length !== esp.size)
    throw new Error('la reclamación trae ' + filas.length + ' puntos y el detector ve ' + esp.size);
  for (const l of filas) {
    const c = l.split(';'), pid = +c[1], d = parseFloat(c[6]);
    if (!esp.has(pid)) throw new Error('la reclamación trae el punto ' + pid + ', que el detector no marca');
    if (Math.abs(esp.get(pid) - d) > 0.02)
      throw new Error('el punto ' + pid + ' vale ' + d.toFixed(2) + ' m en la reclamación y ' +
        esp.get(pid).toFixed(2) + ' m en el detector: ¿ventana duplicada otra vez?');
  }
});
t('Ayora limpia, y con MARGEN: el suelo de ruido no se acerca al umbral', () => {
  // No basta con «no se marca nada»: importa cuánto sobra. El suelo de ruido de
  // este control es el relieve real — en una ladera, la propia pendiente lateral
  // se lee como desvío. En Ayora el peor punto limpio está en 1,38 m contra un
  // umbral de 3 m. Si ese suelo sube, el umbral empieza a estar en riesgo aunque
  // todavía no marque nada, y eso hay que verlo ANTES del primer falso positivo.
  const f = path.join(ROOT, 'ayora_puntos.json');
  if (!fs.existsSync(f)) return;
  const P = JSON.parse(fs.readFileSync(f, 'utf-8'));
  if (oraculoRefVertical(P, 3).size)
    throw new Error('aparece referencia vertical en Ayora: ' + [...oraculoRefVertical(P, 3).keys()].slice(0, 5).join(', '));
  const suelo = oraculoRefVertical(P, 0).size ? Math.max(...[...oraculoRefVertical(P, 0).values()].flat().map(v => Math.abs(v[1]))) : 0;
  if (suelo > 2)
    throw new Error('el suelo de ruido de Ayora subió a ' + suelo.toFixed(2) + ' m, con el umbral en 3: ' +
      'queda menos de 1,5× de margen — revisar la ventana antes de que aparezca un falso positivo');
});
t('la nube casa con el as-built: mesas enteras y z absoluta coherente', () => {
  // Cuántos puntos toca por fila NO es el mismo número en las dos plantas, y
  // eso es geometría, no un fallo: en Ayora la fila es UNA mesa (2 extremos) y
  // en San José son DOS mesas por tubo (4 extremos). Lo que se vigila es que
  // sea 2 ó 4 y que la planta sea consistente consigo misma.
  for (const pl of ['ayora', 'sanjose']) {
    const fp = path.join(ROOT, pl + '_puntos.json'), fa = path.join(ROOT, pl + '_asbuilt.json');
    if (!fs.existsSync(fp) || !fs.existsSync(fa)) continue;
    const P = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const A = JSON.parse(fs.readFileSync(fa, 'utf-8'));
    const cnt = new Map();
    for (const i of P.fi) cnt.set(i, (cnt.get(i) || 0) + 1);
    const v = [...cnt.values()].sort((a, b) => a - b), med = v[(v.length / 2) | 0];
    if (med !== 2 && med !== 4)
      throw new Error(pl + ': la mediana de puntos por fila es ' + med + ', ni 2 (una mesa) ni 4 (dos mesas)');
    const raros = v.filter(x => x !== med).length;
    if (raros > v.length * 0.05)
      throw new Error(pl + ': ' + raros + ' de ' + v.length + ' filas no traen ' + med + ' puntos (>5 %)');
    const ids = new Set(A.f.map(r => r.id));
    const casan = P.filas.filter(x => ids.has(x)).length;
    if (casan < A.f.length * 0.95)
      throw new Error(pl + ': solo ' + casan + ' de ' + A.f.length + ' filas del as-built tienen puntos');
    const b = A.meta.base;
    if (Math.min(...P.z) < b - 200 || Math.max(...P.z) > b + 200)
      throw new Error(pl + ': z fuera de banda respecto a base=' + b + ' (¿se coló una cota relativa?)');
  }
});
console.log('v1.47 · los trackers sin levantar, reconstruidos del plano y declarados');
{
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_cotas.json'), 'utf-8'));
  const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_layout.json'), 'utf-8'));
  t('San José: la planta entera son los 2.289 trackers del plano, y los 107 sin levantar van MARCADOS', () => {
    const dentro = cotas.t.filter(Boolean);
    if (dentro.length !== lay.trackers.length) throw new Error(`${dentro.length} trackers de ${lay.trackers.length} del plano`);
    const est = dentro.filter(t2 => t2.est);
    if (!(est.length > 0 && est.length < dentro.length * 0.1))
      throw new Error(`${est.length} estimados de ${dentro.length}: o no hay marca o son demasiados`);
    if (cotas.n_est !== est.length) throw new Error('el meta no declara los estimados: ' + cotas.n_est);
    // su geometría es la MEDIDA de la planta, no una invención: paso entre
    // vigas, largo de uno de los tipos que existen, y módulos coherentes
    const M = cotas.mod;
    // solo los que tienen SUS DOS vigas: el seguidor al que no le cabe la
    // hermana sin pisar una viga medida se emite con una sola, y no da paso
    const pasos = dentro.filter(t2 => !t2.est && t2.f.length === 2)
      .map(t2 => Math.abs(t2.f[0].x - t2.f[1].x)).sort((a, b) => a - b);
    const paso = pasos[pasos.length >> 1];
    // el módulo es el de la planta y el largo cuadra con sus módulos; el número
    // de módulos NO tiene por qué ser uno de los levantados (en San José los
    // «medio» no se levantaron: son justo estos), pero sí uno de los pocos
    // tamaños que la geometría resuelve, y las dos filas iguales
    const tallas = new Set(est.flatMap(t2 => t2.f.map(f => f.md)));
    if (tallas.size > 3) throw new Error('los estimados usan ' + tallas.size + ' tamaños distintos: eso no es resolver por tipo');
    for (const t2 of est) {
      if (Math.abs(Math.abs(t2.f[0].x - t2.f[1].x) - paso) > 0.1) throw new Error('un estimado con las vigas a otro paso');
      if (t2.f[0].md !== t2.f[1].md) throw new Error('un estimado con sus dos vigas de distinto tamaño');
      if (Math.abs((t2.f[0].y[0] + t2.f[0].y[1]) / 2 - (t2.f[1].y[0] + t2.f[1].y[1]) / 2) > 0.5)
        throw new Error('un estimado con sus dos vigas a distinta cota: comparten tubo');
      for (const f of t2.f) {
        const L = Math.abs(f.n[1] - f.n[0]);
        const esp = 2 * f.md * M.modW + (2 * f.md - 2) * M.gapMod + M.gapDrive;
        if (Math.abs(L - esp) > 1.5) throw new Error(`un estimado de ${L.toFixed(2)} m para ${f.md} módulos (${esp.toFixed(2)} m)`);
      }
      // la cota sale del terreno vecino: dentro del rango de la planta medida
      const zs = dentro.filter(x => !x.est).flatMap(x => x.f.flatMap(f => f.y));
      const lo = Math.min(...zs), hi = Math.max(...zs);
      for (const f of t2.f) for (const y of f.y)
        if (y < lo - 5 || y > hi + 5) throw new Error(`cota estimada ${y} fuera del terreno medido [${lo.toFixed(0)}, ${hi.toFixed(0)}]`);
    }
  });
  t('a un tracker sin levantar NO se le manda consigna', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'export_consignas.mjs'), 'utf-8');
    if (!/cotas\.t\[i\]\.est\)\s*\{\s*estimados\+\+;\s*continue;/.test(src))
      throw new Error('export_consignas no excluye los trackers con cota estimada');
    const out = path.join(ROOT, '.tmp_est_test.csv');
    try {
      require_child().execFileSync(process.execPath, [path.join(ROOT, 'tools', 'export_consignas.mjs'),
        '--planta', 'sanjose', '--fecha', '2026-06-21', '--pol', 'pairwise', '--paso', '360', '--salida', out], { stdio: 'pipe' });
      const meta = JSON.parse(fs.readFileSync(out.replace(/\.csv$/, '.meta.json'), 'utf-8'));
      const est = cotas.t.filter(t2 => t2 && t2.est).length;
      if (meta.seguidores_sin_levantar !== est) throw new Error(`el meta dice ${meta.seguidores_sin_levantar} sin levantar, hay ${est}`);
      if (meta.seguidores !== cotas.t.filter(Boolean).length - est)
        throw new Error(`${meta.seguidores} seguidores con consigna: deberían ser los levantados`);
    } finally {
      for (const f of [out, out.replace(/\.csv$/, '.meta.json')]) try { fs.unlinkSync(f); } catch { /* nada */ }
    }
  });
}

console.log('v1.46 · el DATO: cada tracker levantado es un bifila de dos vigas separadas');
{
  // Este careo NO mira nuestra propia salida: mide el fichero de cotas contra
  // el LAYOUT (fuente independiente) y contra la geometría del bifila. Es el
  // que faltaba: `cotas_asbuilt.py` duplicaba la hermana de un tracker con una
  // sola fila medida CON LA MISMA x, así que 231 trackers de San José salían
  // como dos vigas superpuestas — el clúster las metía en una línea, no eran
  // pareja, y el 3D las pintaba como monofilas sueltas. Los careos de entonces
  // no lo cazaron porque comprobaban que los ejes casaran con segPairs, y
  // segPairs venía de esas mismas cotas.
  for (const pl of ['ayora', 'sanjose']) {
    const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, pl + '_cotas.json'), 'utf-8'));
    const lay = JSON.parse(fs.readFileSync(path.join(ROOT, pl + '_layout.json'), 'utf-8'));
    const filasDe = tk => (tk && tk.f ? tk.f : []).filter(g => g && g.n && g.y && g.n.length >= 2 && g.y.length >= 2);
    t(`${pl}: las dos vigas de cada tracker están separadas un paso y casan con el layout`, () => {
      if (lay.trackers.length !== cotas.t.length) throw new Error('layout y cotas no van 1:1');
      // el PASO entre las dos vigas se mide de los trackers levantados ENTEROS
      const ds = cotas.t.filter(tk => tk && !tk.inc && filasDe(tk).length === 2)
                        .map(tk => Math.abs(tk.f[0].x - tk.f[1].x)).sort((a, b) => a - b);
      if (ds.length < 20) throw new Error('muy pocos trackers con las dos filas medidas: ' + ds.length);
      const paso = ds[ds.length >> 1];
      if (!(paso > 3 && paso < 12)) throw new Error('paso entre vigas irreal: ' + paso.toFixed(2) + ' m');
      let n = 0, juntas = 0, pasoMal = 0, fueraLayout = 0;
      cotas.t.forEach((tk, i) => {
        const f = filasDe(tk);
        if (f.length !== 2) return;
        n++;
        const dx = Math.abs(f[0].x - f[1].x);
        if (dx < 1) juntas++;                                   // dos vigas SUPERPUESTAS: el fallo de v1.45
        // el montaje real dispersa: en San José el vano medido va de 5,54 a
        // 7,58 m (dos trackers levantados tienen sus vigas a 7,3). Lo que NO
        // puede pasar es que estén superpuestas o a dos pasos
        else if (Math.abs(dx - paso) > 0.25 * paso) pasoMal++;
        const xl = lay.trackers[i].x;
        if (Math.min(Math.abs(xl - f[0].x), Math.abs(xl - f[1].x), Math.abs(xl - (f[0].x + f[1].x) / 2)) > 0.4) fueraLayout++;
        void tk;
      });
      if (juntas) throw new Error(`${juntas} de ${n} trackers con sus DOS vigas en la misma x (hermana duplicada sin recolocar)`);
      if (pasoMal) throw new Error(`${pasoMal} de ${n} trackers con las vigas a una distancia que no es el paso (${paso.toFixed(2)} m)`);
      if (fueraLayout) throw new Error(`${fueraLayout} de ${n} trackers cuyas vigas no casan con la x del layout`);
    });
    t(`${pl}: el cizallado E/W viene medido de las dos vigas y la planta declara cuántas van corridas`, () => {
      // el cizallado es el corrimiento del centro de una viga respecto del de
      // su hermana a lo largo del eje: tiene que salir de las MISMAS puntas
      // que se dibujan, y solo en los seguidores de dos vigas
      let n = 0, mal = 0, corr = 0;
      for (const tk of cotas.t) {
        if (!tk) continue;
        const f = filasDe(tk);
        if (f.length !== 2) { if (tk.sh != null) mal++; continue; }
        n++;
        const c = f.map(x => (x.n[0] + x.n[1]) / 2);
        if (tk.sh == null || Math.abs(tk.sh - Math.abs(c[0] - c[1])) > 0.002) mal++;
        if (tk.sh > 0.5) corr++;
      }
      if (!n) throw new Error('ningún tracker de dos vigas');
      if (mal) throw new Error(`${mal} de ${n} trackers con un cizallado que no sale de sus puntas`);
      if ((cotas.n_sh || 0) !== corr) throw new Error(`la planta declara ${cotas.n_sh} seguidores con vigas corridas y hay ${corr}`);
      if (!(cotas.sh_max >= 0) || cotas.sh_max < (cotas.sh_p50 || 0)) throw new Error('reparto del cizallado incoherente: ' + JSON.stringify([cotas.sh_p50, cotas.sh_p95, cotas.sh_max]));
      // San José: los mismos 10 que el visor 2D mide de la geometría dibujada
      if (pl === 'sanjose' && corr !== 10) throw new Error(`San José: ${corr} seguidores con vigas corridas (el mapa mide 10)`);
      if (pl === 'ayora' && corr !== 0) throw new Error(`Ayora: ${corr} seguidores con vigas corridas (el mapa no mide ninguno)`);
    });
    t(`${pl}: plantFromCotas los reconoce a TODOS como pareja, en líneas contiguas`, () => {
      const P = F.plantFromCotas(cotas, Infinity, 'all');
      const linea = new Map();
      P.segTrk.forEach((l, r) => l.forEach(tk => { if (!linea.has(tk)) linea.set(tk, new Set()); linea.get(tk).add(r); }));
      let n = 0, sinPareja = 0, noContiguas = 0;
      for (const tk of cotas.t) {
        if (!tk || filasDe(tk).length !== 2) continue;
        n++;
        const v = [...(linea.get(tk) || [])].sort((a, b) => a - b);
        if (v.length !== 2) { sinPareja++; continue; }
        if (Math.abs(v[0] - v[1]) !== 1) noContiguas++;
      }
      if (sinPareja) throw new Error(`${sinPareja} de ${n} trackers sin pareja (sus dos vigas caen en la misma línea)`);
      if (noContiguas) throw new Error(`${noContiguas} de ${n} trackers con sus vigas en líneas NO contiguas`);
      // v1.48: la pareja es de MESAS GEMELAS (la misma mitad en las dos vigas),
      // así que un tracker trae DOS: la del sur del morro y la del norte
      if (P.segPairs.length !== 2 * n) throw new Error(`${P.segPairs.length} parejas gemelas para ${n} trackers levantados (esperadas ${2 * n})`);
      // los seguidores de UNA sola viga (su hermana no cabe sin pisar una viga
      // medida de otro seguidor) tambien se dibujan: dos mesas, sin eje. La
      // planta los declara, asi que el numero no puede moverse en silencio.
      const solo = cotas.n_solo || 0;
      if (P.segDrive.length !== n + solo) throw new Error(`${P.segDrive.length} accionamientos para ${n} trackers de dos vigas y ${solo} de una`);
      const de4 = P.segDrive.filter(g => g.length === 4).length;
      const de2 = P.segDrive.filter(g => g.length === 2).length;
      if (de4 !== n) throw new Error(`${de4} accionamientos de 4 mesas de ${n} (un bifila son cuatro mesas)`);
      if (de2 !== solo) throw new Error(`${de2} accionamientos de 2 mesas para ${solo} seguidores de una viga`);
    });
  }
}

console.log('v1.49 · el suelo no se inventa con una línea de otro bloque');
{
  /* Una planta de VARIOS BLOQUES tiene saltos de índice enormes en x: en Ayora,
     entre la línea 107 y la 108 hay 721 m de hueco y 12,8 m de desnivel. El
     resolutor de cota del terreno tiraba de la línea de índice contiguo sin
     mirar dónde está, así que fabricaba un escarpe de 7 m pegado a la primera
     línea del segundo bloque y el contador lo veía tapar el sol al ocaso. */
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, Infinity, 'all');
  const mkT = (Pp) => {
    const pairs = [];
    for (let i = 0; i < Pp.lineX.length - 1; i++) {
      const dx = Math.max(0.5, Pp.lineX[i + 1] - Pp.lineX[i]);
      pairs.push({ slope: Math.atan2(Pp.pairDz[i], dx) * 180 / Math.PI, pitch: dx,
                   axisTilt: (Pp.tilt[i] + Pp.tilt[i + 1]) / 2 });
    }
    return { pairs, cw: Pp.cw, axisAz: 0, maxAngle: Pp.maxAngle, gcr: Pp.cw / Pp.pitch, z0: 0.17,
             nBypass: 3, rowTilt: Pp.tilt, groups: Pp.groups, drive: Pp.drive, segs: Pp.segs,
             segTilt: Pp.segTilt, segPairs: Pp.segPairs, segDrive: Pp.segDrive, pitch: Pp.pitch, real: Pp };
  };
  const T = mkT(P);
  // 21-jun a las 19:20 locales de Ayora: sol al oeste y a 23° de elevación
  const ZEN = 66.7, AZ = 282.1;
  const ang = F.policyAnglesSeg('pairwise', ZEN, AZ, T);
  const sh = F.shadeRows(ZEN, AZ, T, ang);
  const peor = () => { let m = 0, d = null;
    for (let r = 0; r < sh.seg.length; r++) for (let k = 0; k < sh.seg[r].length; k++)
      if (sh.seg[r][k] > m) { m = sh.seg[r][k]; d = `línea ${r + 1} mesa ${k + 1}`; }
    return { m, d }; };
  const p0 = peor();
  t('el suelo NO se inventa con la cota de una línea lejana (Ayora, dos bloques a 721 m)', () => {
    if (!(p0.m < 0.25)) throw new Error(`${p0.d} con ${(100 * p0.m).toFixed(1)} % de sombra al ocaso: huele a escarpe inventado`);
  });
  t('MUTANTE: sin el límite de distancia, la línea del otro bloque fabrica el escarpe y la sombra vuelve', () => {
    const mut = src.replace('if(Math.abs(x-xs[j])>COT_XMAX)continue;      // esa línea está en otro sitio', '')
                   .replace('if(okA&&Math.abs(x-xs[i])<=COT_XMAX)return a.z-HUB;', 'if(okA)return a.z-HUB;')
                   .replace('if(okB&&Math.abs(x-xs[Math.min(nR-1,i+1)])<=COT_XMAX)return b.z-HUB;', 'if(okB)return b.z-HUB;');
    if (mut === src) throw new Error('el mutante no cambió nada: el límite ya no está donde se cree');
    const G = new Function(sol + '\n' + mut + '; return { plantFromCotas, policyAnglesSeg, shadeRows };')();
    const P2 = G.plantFromCotas(cotas, Infinity, 'all');
    const T2 = mkT(P2);
    const sh2 = G.shadeRows(ZEN, AZ, T2, G.policyAnglesSeg('pairwise', ZEN, AZ, T2));
    let m2 = 0; for (const l of sh2.seg) for (const v of l) if (v > m2) m2 = v;
    if (!(m2 > 0.4)) throw new Error(`sin el límite la peor sombra es ${(100 * m2).toFixed(1)} %: el careo no distingue`);
  });
}

console.log('v1.45 · el accionamiento se dibuja por TRACKER, no por línea');
{
  const filasDe = (tk) => (tk.f || []).filter(g => g && g.n && g.y && g.n.length >= 2 && g.y.length >= 2).length;
  for (const pl of ['ayora', 'sanjose']) {
    const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, pl + '_cotas.json'), 'utf-8'));
    const P = F.plantFromCotas(cotas, Infinity, 'all');
    t(`${pl}: un eje por tracker entre SUS dos mesas, motor en la oeste, y ninguna mesa emparejada sin eje`, () => {
      const ejes = F.ejesPorMesa(P), west = F.westPorMesa(P);
      // v1.48: UN eje por TRACKER (no por pareja de mesas gemelas), y cruza por
      // el MORRO — el punto donde está el motor y donde la viga se articula
      // un eje une las DOS vigas de un seguidor: el que solo tiene una no
      // lleva eje, y eso es lo que hay que ver — no un eje inventado hasta la
      // viga del seguidor de al lado
      const conPar = P.segDrive.filter(g => g.length === 4).length;
      if (ejes.length !== conPar) throw new Error(ejes.length + ' ejes para ' + conPar + ' trackers de dos vigas (' + (P.segDrive.length - conPar) + ' de una viga, sin eje)');
      const real = new Set(P.segPairs.map(([[r1, k1], [r2, k2]]) => [r1, k1, r2, k2].join('|')));
      const conEje = new Set();
      for (const e of ejes) {
        if (!real.has([e.r1, e.k1, e.r2, e.k2].join('|'))) throw new Error('un eje une mesas de trackers distintos');
        conEje.add(e.r1 + '|' + e.k1); conEje.add(e.r2 + '|' + e.k2);
        const a = P.segs[e.r1][e.k1], b = P.segs[e.r2][e.k2];
        // el eje cruza por el MORRO: el punto medio de los morros de las dos
        // vigas (que el tresbolillo real desplaza una de otra hasta ~4 m), y
        // NUNCA por el centro de la mesa, que es donde caía antes
        const mA = P.segMorro[e.r1][e.k1][0], mB = P.segMorro[e.r2][e.k2][0];
        if (Math.abs(e.n - (mA + mB) / 2) > 1e-9)
          throw new Error('el eje no cruza por el morro (n ' + e.n.toFixed(2) + ' vs ' + mA.toFixed(2) + ' / ' + mB.toFixed(2) + ')');
        if (Math.abs(e.n - (a[0] + a[1]) / 2) < (a[1] - a[0]) / 4)
          throw new Error('el eje cae en mitad de la mesa, no en su morro');
        if (P.segSide[e.r1][e.k1] !== 0 || P.segSide[e.r2][e.k2] !== 0)
          throw new Error('el eje no arranca de las mesas del sur del morro');
      }
      const trkConEje = new Set(ejes.map(e => P.segTrk[e.r1][e.k1]));
      let sinEje = 0;
      // un accionamiento de 2 mesas es un seguidor de UNA viga: no lleva eje,
      // y exigirselo seria pedir un eje que une una viga consigo misma
      for (const g of P.segDrive) if (g.length === 4 && !trkConEje.has(P.segTrk[g[0][0]][g[0][1]])) sinEje++;
      if (sinEje) throw new Error(sinEje + ' trackers con dos vigas pero sin eje');
      // y todas las mesas del tracker van al MISMO θ: el motor es uno
      for (const g of P.segDrive) {
        const trks = new Set(g.map(([r, k]) => P.segTrk[r][k]));
        if (trks.size !== 1) throw new Error('un accionamiento mueve mesas de trackers distintos');
      }
      let sin = 0;
      P.segPairs.forEach(([[r1, k1], [r2, k2]]) => { if (!conEje.has(r1 + '|' + k1) && P.segSide[r1][k1] === 0) sin++; });
      if (sin) throw new Error(sin + ' mesas del sur con gemela pero sin eje');
      for (const [[r1, k1], [r2, k2]] of P.segPairs) {
        if (west[r1][k1] === west[r2][k2]) throw new Error('un tracker con dos motores o ninguno');
        const o = P.lineX[r1] <= P.lineX[r2] ? [r1, k1] : [r2, k2];
        if (!west[o[0]][o[1]]) throw new Error('el motor no va en la viga oeste');
      }
      const enPareja = new Set(); P.segPairs.forEach(([[r1, k1], [r2, k2]]) => { enPareja.add(r1 + '|' + k1); enPareja.add(r2 + '|' + k2); });
      let motores = 0; west.forEach((l, r) => l.forEach((w, k) => { if (w) motores++; else if (!enPareja.has(r + '|' + k)) throw new Error('mesa suelta sin motor'); }));
      const sueltas = P.segs.reduce((a, l) => a + l.length, 0) - enPareja.size;
      // westSeg marca la VIGA del motor: sus DOS mesas. El motor sigue siendo
      // uno por tracker — va en el morro de esa viga, y quien dibuja lo pone
      // una sola vez (las piezas del accionamiento caen en x≈0 del modelo).
      if (motores !== P.segPairs.length + sueltas) throw new Error(motores + ' mesas de viga oeste para ' + P.segPairs.length + ' parejas y ' + sueltas + ' sueltas');
      void filasDe;
    });
  }
  t('MUTANTE: el camino por LÍNEA (groups + «el tramo más próximo») sí une trackers distintos y deja mesas sin eje', () => {
    const P = F.plantFromCotas(JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')), Infinity, 'all');
    const real = new Set(P.segPairs.map(([[r1, k1], [r2, k2]]) => [r1, k1, r2, k2].join('|')));
    let mal = 0; const conEje = new Set();
    for (const [a, b] of P.groups.filter(g => g.length === 2))
      for (let ka = 0; ka < P.segs[a].length; ka++) {
        const ca = (P.segs[a][ka][0] + P.segs[a][ka][1]) / 2;
        const kb = P.segs[b].findIndex(s2 => ca >= s2[0] - 2 && ca <= s2[1] + 2);
        if (kb < 0) continue;
        if (real.has([a, ka, b, kb].join('|'))) { conEje.add(a + '|' + ka); conEje.add(b + '|' + kb); } else mal++;
      }
    let sin = 0;
    P.segPairs.forEach(([[r1, k1], [r2, k2]]) => { if (!conEje.has(r1 + '|' + k1) || !conEje.has(r2 + '|' + k2)) sin++; });
    if (!(mal > 0 && sin > 0)) throw new Error(`el camino por línea ya no falla (${mal} ejes mal, ${sin} mesas sin eje): el careo no distingue`);
  });
  t('la UI del simulador dibuja el accionamiento con westPorMesa / ejesPorMesa cuando la planta es medida', () => {
    const ui = html.slice(html.indexOf('/* FIN-FÍSICA'));
    const b3 = ui.slice(ui.indexOf('function build3D'), ui.indexOf('function setSky'));
    // v1.54: PM es «la planta con mesas» — la medida (PR) o el preset con quiebro en la rótula (T)
    for (const lit of ['westPorMesa(PM)', 'ejesPorMesa(PM)', 'west:westAt(r,si)', '(PR&&PR.segPairs)?PR:null'])
      if (!b3.includes(lit)) throw new Error('build3D sin «' + lit + '»');
  });
}

console.log('el globo dice QUÉ puntos: id y desvío de la cota repuesta o copiada');
{
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, Infinity, 'all');
  t('sanjose: toda fila con cota repuesta trae sus puntos [id, desvío]; ninguna limpia los trae', () => {
    let con = 0, sin = 0, limpiasCon = 0, fuera = 0;
    for (const tk of cotas.t) if (tk && !tk.est) for (const f of tk.f) {
      const rp = f.rp || [];
      // la copia (hm) de una viga que el topógrafo NO midió no tiene puntos que
      // reclamar: solo se exige en las repuestas (ye) y en las copias de una
      // fila descartada por contaminación
      if (f.ye) { if (rp.length) con++; else sin++; }
      else if (!f.hm && rp.length) limpiasCon++;
      for (const [id, d] of rp) if (!(Number.isInteger(id) && Math.abs(d) > 3)) fuera++;
    }
    if (!con) throw new Error('ninguna fila repuesta trae sus puntos');
    if (sin) throw new Error(sin + ' filas repuestas sin sus puntos');
    if (limpiasCon) throw new Error(limpiasCon + ' filas limpias con puntos de reclamación');
    if (fuera) throw new Error(fuera + ' puntos con desvío <= 3 m o id no entero');
    // y llegan a la mesa: segRp alineado con segOrig
    let mesas = 0;
    for (let r = 0; r < P.segRp.length; r++) for (let k = 0; k < P.segRp[r].length; k++)
      if (P.segRp[r][k].length) { mesas++; if (!P.segOrig[r][k]) throw new Error('mesa con puntos de reclamación y origen «medida»'); }
    if (!mesas) throw new Error('segRp vacío');
  });
}

console.log('origen por mesa · «del plano» es del tracker, no de la cota repuesta');
{
  // segOrig 4 (reconstruido del plano) solo puede salir en mesas de un tracker
  // est=1. La marca por tope (eyS/eyN) que deja segEst en la mesa reparada NO
  // es «del plano»: es una cota repuesta con geometria medida. Se mezclaron
  // en un merge y el 3D pintaba naranja 39 filas levantadas.
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, Infinity, 'all');
  t('sanjose: las mesas con origen «del plano» son exactamente las de los trackers est', () => {
    let del = 0, mal = 0, estSinMarca = 0;
    for (let r = 0; r < P.segOrig.length; r++) for (let k = 0; k < P.segOrig[r].length; k++) {
      const o = P.segOrig[r][k], e = !!(P.segTrk[r][k] && P.segTrk[r][k].est);
      if (o === 4) { del++; if (!e) mal++; }
      else if (e) estSinMarca++;
    }
    const esperadas = cotas.t.filter(x => x && x.est).reduce((a, x) => a + 2 * x.f.length, 0);
    if (mal) throw new Error(mal + ' mesas marcadas «del plano» en trackers levantados');
    if (estSinMarca) throw new Error(estSinMarca + ' mesas de trackers est sin la marca');
    if (del !== esperadas) throw new Error(del + ' mesas «del plano» para ' + esperadas + ' esperadas');
    // y las reparadas siguen siendo lo que son: 1 (una cota), 2 (las dos) o 3 (copia)
    const c = {}; for (const l of P.segOrig) for (const v of l) c[v] = (c[v] || 0) + 1;
    if (!(c[1] > 0 && c[2] > 0 && c[3] > 0)) throw new Error('faltan categorias de cota repuesta: ' + JSON.stringify(c));
  });
}

console.log('v1.50 · la cota repuesta marca la MESA, no la fila');
{
  // El saneador de cotas salva la mitad limpia de una fila contaminada y deja
  // marcado en `ey` QUE TOPE no es medida. Ese detalle tiene que llegar hasta
  // la mesa: marcar la fila entera devolvería a la tarjeta el mismo bulto que
  // se quería quitar —la mesa buena declarada como no medida— y marcar nada
  // sería peor todavía.
  const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'sanjose_cotas.json'), 'utf-8'));
  const P = F.plantFromCotas(cotas, Infinity, 'all');
  t('sanjose: un tope estimado (ey) marca SOLO su mesa; la otra mitad sigue siendo medida', () => {
    const conEy = [], dosEy = [];
    for (const tk of cotas.t) if (tk && !tk.est) for (const f of tk.f) {
      if (f.ye === 1 || f.ye === 2) conEy.push(f);
      // ye=3 en un tracker MEDIDO: sus cuatro puntas vinieron en otra
      // referencia, se reponen las dos cotas del terreno vecino y se conserva
      // la geometría medida. Esa fila marca sus DOS mesas, no una — y no es lo
      // mismo que un tracker reconstruido del plano, que no tiene geometría.
      else if (f.ye === 3) dosEy.push(f);
    }
    if (conEy.length < 5) throw new Error('sin filas con punta repuesta (ye) en el fichero: el careo no prueba nada');
    let mesasEst = 0;
    for (let r = 0; r < P.segEst.length; r++) for (let k = 0; k < P.segEst[r].length; k++)
      if (P.segEst[r][k]) mesasEst++;
    // las mesas de los trackers reconstruidos del plano van marcadas enteras;
    // lo que se comprueba aquí es que una punta repuesta marca UNA mesa y no dos
    const trkEst = new Set();
    for (const tk of cotas.t) if (tk && tk.est) trkEst.add(tk);
    let mesasDeTrkEst = 0;
    for (let r = 0; r < P.segEst.length; r++) for (let k = 0; k < P.segEst[r].length; k++)
      if (P.segEst[r][k] && trkEst.has(P.segTrk[r][k])) mesasDeTrkEst++;
    const soloEy = mesasEst - mesasDeTrkEst;
    const esperadas = conEy.length + 2 * dosEy.length;
    if (soloEy !== esperadas)
      throw new Error(`${conEy.length} filas con UNA punta repuesta y ${dosEy.length} con las dos, ` +
        `pero ${soloEy} mesas marcadas (esperadas ${esperadas}: una por punta repuesta)`);
  });
  t('MUTANTE: marcar la fila entera (o no marcar nada) rompe el careo', () => {
    const conEy = [];
    for (const tk of cotas.t) if (tk && !tk.est) for (const f of tk.f)
      if (f.ye === 1 || f.ye === 2) conEy.push(f);
    const cuenta = (Q) => { let c = 0; for (const fila of Q.segEst) for (const b of fila) if (b) c++; return c; };
    // (a) sin ye en el fichero, plantFromCotas no marca ninguna de esas mesas
    const sinEy = JSON.parse(JSON.stringify(cotas));
    for (const tk of sinEy.t) if (tk && !tk.est) for (const f of tk.f) f.ye = 0;
    if (cuenta(F.plantFromCotas(sinEy, Infinity, 'all')) >= cuenta(P))
      throw new Error('quitar ye no cambia el marcado: no se está leyendo');
    // (b) marcando la fila entera (ye=3) salen DOS mesas por fila en vez de una
    const doble = JSON.parse(JSON.stringify(cotas));
    for (const tk of doble.t) if (tk && !tk.est) for (const f of tk.f) if (f.ye === 1 || f.ye === 2) f.ye = 3;
    if (cuenta(F.plantFromCotas(doble, Infinity, 'all')) !== cuenta(P) + conEy.length)
      throw new Error('marcar la fila entera no dobla las mesas marcadas: el lado no se está respetando');
  });
}

// RETIRADO el careo «cada fila cae donde el PROVEEDOR la midió» (y su fixture
// sanjose_asbuilt_proveedor_x.json). Era CIRCULAR: la x de cada fila -W en ese
// as-built es exactamente x_tracker − 6,174 (mediana −6,174, no una medida),
// o sea que ya traía dentro la convención «la hermana va al oeste» que se
// quería comprobar. Lo que sí decide es el BORDE de cada tirada de trackers
// contiguos, con la nube cruda y sin ningún reparto: con la hermana al oeste
// tiene que haber una viga en x_primero−6,17 y ninguna en x_último+6,17; al
// este, al revés. Medido en San José: 97 tiradas al ESTE, 6 al oeste, y en
// todas las largas 0 puntos en x_primero−6,17 y 5-6 en x_último+6,17. Ese
// careo, y el reparto que lo aplica, van en #626.

console.log('v1.52 · el tilt N-S entra en pvlib con el signo de pvlib, y la pala se mide en su base oblicua');
{
  /* Reportado con una planta sintética (onda senoidal E-O + pendiente
     constante N-S): «me ponía en la posición del sol y veía sombras». Dos
     fallos, los dos con tilt N-S y ninguno con tilt 0:
     (1) la app mide el tilt norte-arriba-positivo y pvlib al revés (axis_tilt
         positivo baja hacia axis_azimuth): la política backtrackeaba para el
         terreno ESPEJO. Plano LLANO E-O a +5°: 64 % de sombra real al alba.
     (2) el contador —y su oráculo, que copiaba el mismo álgebra— proyectaba
         el impacto sobre la cuerda con una base oblicua (uD·vD = −sin θ·sE):
         a 32 m del centro y θ=44° son 1,9 m de error. Plano uniforme a 5°,
         donde pvlib es exacto: 19 % de sombra a 22° de sol, creciendo con θ.
     Y de propina, el terreno en presets: nMin se quedaba en +∞ (solo miraba
     PRr.segs) y el suelo era −∞ siempre; y la fila sin emisoras se saltaba
     el marchador de terreno. */
  const LL = [41.5763, -0.7981], DIA = Date.UTC(2026, 5, 21);
  const mkPlano = (n, amp, tilt) => {
    const ELEV = []; for (let i = 0; i < n; i++) ELEV.push(amp * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2))));
    const rowTilt = new Array(n).fill(tilt), filaLen = 2 * 28 * 1.146 + 0.55;
    return { pairs: F.pairsFromElev(ELEV, 6, rowTilt), cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / 6, z0: 0.17,
             nBypass: 2, iam: 0, rowTilt, groups: null, drive: 'mono', segs: F.nsSegments(n, 'alineadas', 1, filaLen, 1.0, 1), filaLen };
  };
  t('pvlib recibe el tilt con SU signo: toda llamada a singleaxis/trueTrackAngle pasa por pvTilt', () => {
    if (typeof F.pvTilt !== 'function' || F.pvTilt(5) !== -5) throw new Error('pvTilt no es la negación');
    const fis = html.slice(html.indexOf('FÍSICA PURA'), html.indexOf('/* FIN-FÍSICA'));
    const malos = [];
    for (const m of fis.matchAll(/singleaxis\([^;]*?axisTilt:([^,}]+)/g)) if (!/^(pvTilt\(|0\b)/.test(m[1].trim())) malos.push(m[0].slice(0, 80));
    for (const m of fis.matchAll(/trueTrackAngle\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
      const args = m[1].split(',').map(x => x.trim());
      if (args.length >= 3 && !/^(pvTilt\(|0$)/.test(args[2])) malos.push(m[0].slice(0, 80));
    }
    if (malos.length) throw new Error('llamadas a pvlib sin convertir el tilt: ' + malos.join(' | '));
    // el mismo signo en irradiancia: la pala a θ=0 sobre eje norte-arriba mira al SUR
    const az = F.surfaceOrient(0, F.pvTilt(5), 0).az;
    if (Math.abs(az - 180) > 1e-6) throw new Error('pala a θ=0 con el norte arriba mira al ' + az.toFixed(1) + '°, no al sur');
    if (Math.abs(F.surfaceOrient(0, F.pvTilt(-5), 0).az) > 1e-6) throw new Error('con el norte abajo debería mirar al norte');
    if (Math.abs(F.surfaceOrient(30, 0, 0).az - 90) > 1e-6) throw new Error('sin tilt, θ=30 mira al este: ' + F.surfaceOrient(30, 0, 0).az);
    // y el POA lo nota: a mediodía en el hemisferio norte la pala norte-arriba (mira al sur) recibe MÁS haz
    const g = F.solarPos(DIA + 12 * 3600000, LL[0], LL[1]);
    const irr = F.clearskyIneichen(g.zen, 172, 300, 3.5);
    const bN = F.poaRow(0, 5, 0, g.zen, g.az, irr, 172, 0.2, 0.05).beam, bS = F.poaRow(0, -5, 0, g.zen, g.az, irr, 172, 0.2, 0.05).beam;
    if (!(bN > bS * 1.02)) throw new Error(`haz a mediodía: norte-arriba ${bN.toFixed(0)} vs norte-abajo ${bS.toFixed(0)} W/m² — el signo del tilt no llega al POA`);
  });
  t('plano UNIFORME con tilt N-S ±5°: el backtracking de pvlib es exacto y el contador lo confirma (0 sombra, ≡ oráculo)', () => {
    for (const tilt of [5, -5, 8]) {
      const T = mkPlano(8, 0, tilt);
      let n = 0;
      for (let m = 270; m < 1440; m += 20) {
        const g = F.solarPos(DIA + m * 60000, LL[0], LL[1]);
        if (g.elev < 3 || g.elev > 60) continue;
        const ang = F.anglesPairwise(g.zen, g.az, T);
        const sh = F.shadeRows(g.zen, g.az, T, ang), ora = oracleExact(F, g.zen, g.az, T, ang);
        for (let r = 0; r < 8; r++) {
          if (sh[r] > 1e-3) throw new Error(`tilt ${tilt}: sombra ${(sh[r] * 100).toFixed(1)} % en la fila ${r} a ${g.elev.toFixed(1)}° de sol (θ ${ang[r].toFixed(1)}°) — pvlib es exacto aquí`);
          if (Math.abs(sh[r] - ora[r]) > 1e-3) throw new Error(`tilt ${tilt}: contador ${sh[r]} ≠ oráculo ${ora[r]} (fila ${r}, ${g.elev.toFixed(1)}°)`);
        }
        n++;
      }
      if (n < 20) throw new Error('pocos instantes: ' + n);
    }
    // y el signo va en la dirección física: con el sol en el NE, el plano que
    // SUBE hacia el norte (+5) ve el sol más bajo y backtrackea MÁS que el llano
    const g = F.solarPos(DIA + 330 * 60000, LL[0], LL[1]);          // 05:30 UTC, sol NE a ~9°
    const th = tl => Math.abs(F.anglesPairwise(g.zen, g.az, mkPlano(8, 0, tl))[3]);
    if (!(th(5) < th(0) && th(0) < th(-5))) throw new Error(`θ(+5)=${th(5).toFixed(1)} θ(0)=${th(0).toFixed(1)} θ(−5)=${th(-5).toFixed(1)}: el tilt entra con el signo cambiado`);
  });
  t('base OBLICUA de la pala: a θ=44° sobre tilt 5° el impacto se mide bien (contador ≡ bruto MU=64 ≡ 0)', () => {
    const T = mkPlano(8, 0, 5);
    const g = F.solarPos(DIA + 400 * 60000, LL[0], LL[1]);          // ~21,7° de sol, az 77°
    const ang = F.anglesPairwise(g.zen, g.az, T);
    if (!(Math.abs(ang[3]) > 35)) throw new Error('el caso quería θ grande: ' + ang[3].toFixed(1));
    const sh = F.shadeRows(g.zen, g.az, T, ang), br = oracleBrute(F, g.zen, g.az, T, ang, 64, [3]);
    if (sh[3] > 1e-3 || br[3] > 1e-3) throw new Error(`fila 3: contador ${(sh[3] * 100).toFixed(1)} % · bruto ${(br[3] * 100).toFixed(1)} % (era 19 % con la proyección oblicua)`);
    if (!/d0-=pl\.kuv\*wq/.test(html)) throw new Error('el contador perdió la corrección oblicua');
    if (!/uH\[0\]\*vHp\[0\]\+uH\[1\]\*vHp\[1\]\+uH\[2\]\*vHp\[2\]/.test(html)) throw new Error('la silueta roja perdió la corrección oblicua');
  });
  t('preset senoidal E-O + tilt N-S 5°: contador ≡ oráculo TODO el día, terreno y filas de borde incluidos', () => {
    for (const [amp, tilt] of [[1.2, 5], [1.2, -5], [0.6, 3]]) {
      const T = mkPlano(8, amp, tilt);
      let peor = 0, borde = 0;
      for (let m = 270; m < 1440; m += 10) {
        const g = F.solarPos(DIA + m * 60000, LL[0], LL[1]);
        if (g.elev <= 0.5) continue;
        const ang = F.anglesPairwise(g.zen, g.az, T);
        const sh = F.shadeRows(g.zen, g.az, T, ang), ora = oracleExact(F, g.zen, g.az, T, ang);
        for (let r = 0; r < 8; r++) peor = Math.max(peor, Math.abs(sh[r] - ora[r]));
        if (g.elev < 2 && tilt > 0) borde = Math.max(borde, sh[7], sh[0]);   // la fila de borde, tapada por la loma
      }
      if (peor > 1e-3) throw new Error(`amp ${amp} tilt ${tilt}: contador y oráculo difieren ${(peor * 100).toFixed(2)} pp`);
      if (tilt > 0 && borde < 0.05) throw new Error(`amp ${amp} tilt ${tilt}: la fila de borde al alba no ve el terreno (${(borde * 100).toFixed(1)} %)`);
    }
  });
}

console.log('v1.53 · torsión entre vigas vecinas: el backtracking mira toda la mesa, y la sombra dice de quién viene');
{
  /* Ignacio, Arequipa (−16,6°, UTC −5), 21-jun, bifila quebrada, perfil N-S
     senoidal de 3° y pendiente constante 5,14°: «los algoritmos funcionan mal,
     ¿qué sentido tiene que el primer tracker no se tumbe?». Con tilts 0°/3°
     alternos las vigas vecinas NO son paralelas: la vecina está 1,7 m más
     alta en un extremo que en el centro y el pairwise, que decidía con la
     pendiente del centro y un tilt medio, dejaba un 22-30 % de sombra a
     07:00-07:20. Ahora el candidato de pvlib se comprueba con el ray-cast 3D
     de la pareja y, si sombrea, se barre el ángulo con signo (pasando de
     cero) hasta el primer θ sin sombra, con una pasada de reparación entre
     parejas. Sin torsión no cambia ni un bit. */
  const LL = [-16.59577, -71.80644], DIA = Date.UTC(2026, 5, 21);
  const mkAreq = (amp, drive) => {
    const n = 8, pitch = 6, cw = 2.382, pend = 5.14;
    const ELEV = []; for (let i = 0; i < n; i++) ELEV.push(-i * pitch * Math.tan(pend * Math.PI / 180));
    const rowTilt = []; for (let i = 0; i < n; i++) rowTilt.push(amp * Math.sin(2 * Math.PI * i / 4));
    const groups = drive === 'mono' ? null : [[0, 1], [2, 3], [4, 5], [6, 7]], filaLen = 2 * 28 * 1.146 + 0.55;
    return { pairs: F.pairsFromElev(ELEV, pitch, rowTilt), cw, axisAz: 0, maxAngle: 55, gcr: cw / pitch, z0: 0.17, nBypass: 2, iam: 0.05,
             rowTilt, groups, drive, segs: F.nsSegments(n, 'alineadas', 1, filaLen, 1.0, drive === 'mono' ? 1 : 2), filaLen };
  };
  const sol = (hLoc) => F.solarPos(DIA + (hLoc * 60 + 300) * 60000, LL[0], LL[1]);
  t('sin torsión, pairwise es bit a bit el de siempre (pvlib en el centro y min|θ| entre parejas)', () => {
    const T = mkAreq(0, 'quebrado');
    for (const h of [7, 8, 10, 14, 17]) {
      const g = sol(h);
      const a = F.anglesPairwise(g.zen, g.az, T);
      const th = T.pairs.map(p => F.singleaxis(g.zen, g.az, { axisTilt: F.pvTilt(p.axisTilt), axisAz: 0, maxAngle: 55, backtrack: true, gcr: T.cw / p.pitch, crossAxisTilt: p.slope }));
      const esp = [th[0]]; for (let r = 1; r < 7; r++) esp.push(Math.abs(th[r - 1]) < Math.abs(th[r]) ? th[r - 1] : th[r]); esp.push(th[6]);
      for (let r = 0; r < 8; r++) if (a[r] !== esp[r]) throw new Error(`${h}h fila ${r}: ${a[r]} ≠ ${esp[r]} — sin torsión el pairwise ha cambiado`);
    }
  });
  t('Arequipa con torsión (senoidal 3°): el pairwise se tumba y la sombra de planos baja del 22-30 % a ≤ 3 %', () => {
    for (const drive of ['quebrado', 'mono']) {
      const T = mkAreq(3, drive);
      // v1.57 (auditoría H2): el pairwise ya no pasa de la paralela al terreno en
      // contra del sol (antes bajaba a −6° para dejar 2–3 %); ahora se queda en
      // −2° y lo que no puede evitar dentro del rango legítimo se publica. La
      // cota: nunca más de lo que el mejor θ UNIFORME del rango deja +1 pp
      for (const h of [7, 7 + 20 / 60, 7 + 40 / 60, 8, 8.5]) {
        const g = sol(h);
        const ang = F.policyAngles('pairwise', g.zen, g.az, T, { ghi: 500, dni: 600, dhi: 80 }, 172, 0.2).angles;
        const sh = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true, MV: 32 });
        const mx = Math.max(...sh);
        const [lo, hi] = F.rangoHaz(g.zen, g.az, T, 0, 0);
        let alc = 1; for (let th = Math.ceil(lo); th <= hi; th += 1) alc = Math.min(alc, Math.max(...F.shadeBand3DAll(g.zen, g.az, T, new Array(8).fill(th), { noStruct: true, MV: 32 })));
        if (mx > Math.max(0.03, alc + 0.01)) throw new Error(`${drive} ${h.toFixed(2)}h (sol ${g.elev.toFixed(1)}°): sombra de planos ${(mx * 100).toFixed(1)} % con θ ${ang.map(a => a.toFixed(0)).join('/')} — el mejor uniforme del rango deja ${(alc * 100).toFixed(1)} %`);
        for (const a of ang) if (a < lo - 1e-9 || a > hi + 1e-9) throw new Error(`${drive} ${h.toFixed(2)}h: θ ${a.toFixed(1)} fuera del rango legítimo ${lo.toFixed(1)}…${hi.toFixed(1)}`);
      }
      // y a las 07:20 se tumba de verdad: antes 43° con 22 %, ahora cerca de 0
      const g = sol(7 + 20 / 60);
      const ang = F.anglesPairwise(g.zen, g.az, T);
      if (Math.max(...ang.map(Math.abs)) > 25) throw new Error(`${drive} 07:20: sigue sin tumbarse: θ ${ang.map(a => a.toFixed(0)).join('/')}`);
    }
  });
  t('el evaluador 3D por pareja (shadePair3DBand) cuenta como el contador: cara a zOff y base oblicua', () => {
    const T = mkAreq(3, 'mono'), g = sol(7);
    const ang = new Array(8).fill(40);
    const ct = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true, MV: 32 });
    for (let p = 0; p < 7; p++) {
      const b = F.shadePair3DBand(g.zen, g.az, T, ang, p, { MU: 32, MV: 32 });
      const r = b.recv;
      if (Math.abs(b.f - ct[r]) > 0.03) throw new Error(`pareja ${p}: evaluador ${(b.f * 100).toFixed(1)} % vs contador ${(ct[r] * 100).toFixed(1)} % en la fila ${r}`);
    }
  });
  t('el contador dice DE QUIÉN viene la sombra de cada fila (out.de): emisoras y terreno, y cubre lo que cobra', () => {
    const T = mkAreq(3, 'quebrado'), g = sol(16 + 55 / 60);           // ocaso: sol a 5° del WNW, el terreno sube al oeste
    const ang = F.policyAngles('global', g.zen, g.az, T, { ghi: 60, dni: 200, dhi: 30 }, 172, 0.2).angles;
    const sh = F.shadeRows(g.zen, g.az, T, ang);
    if (!sh.de || sh.de.length !== 8) throw new Error('sin out.de');
    let conTerreno = 0;
    sh.de.forEach((l, r) => {
      const suma = l.reduce((a, q) => a + q[1], 0);
      if (sh[r] > 1e-3 && !(suma >= sh[r] - 1e-6)) throw new Error(`fila ${r}: las contribuciones (${(suma * 100).toFixed(1)} %) no cubren la sombra (${(sh[r] * 100).toFixed(1)} %)`);
      if (sh[r] <= 1e-3 && l.length) throw new Error(`fila ${r}: atribución sin sombra`);
      for (let i = 1; i < l.length; i++) if (l[i][1] > l[i - 1][1]) throw new Error('no va de mayor a menor');
      for (const q of l) { if (q[0] === 'terreno') conTerreno++; else if (!(Number.isInteger(q[0]) && q[0] !== r)) throw new Error('emisora rara: ' + q[0]); }
    });
    if (!conTerreno) throw new Error('al ocaso con la loma al oeste ninguna fila atribuye sombra al terreno');
  });
}

console.log('v1.55 · informe del emplazamiento');
t('v1.55 estático: el informe existe, explica TODAS las políticas del inventario y publica sus cálculos del día', () => {
  // «Debemos generar un informe, del emplazamiento, donde aparezca cada
  // algoritmo, justificando su funcionamiento y lo que optimiza con cálculos»
  if (!/id="informebtn"/.test(html)) throw new Error('falta el botón «Informe»');
  if (!/function informeHTML\(\)/.test(html) || !/function abrirInforme\(\)/.test(html)) throw new Error('falta el generador del informe');
  const ui = html.slice(html.indexOf('/* FIN-FÍSICA'));
  const ex = ui.slice(ui.indexOf('const EXPLICA={'), ui.indexOf('function informeHTML'));
  const keys = [...html.matchAll(/\{key:'([a-z0-9]+)',\s*nm:/g)].map(m => m[1]);
  if (keys.length < 8) throw new Error('inventario de políticas no encontrado: ' + keys.join(','));
  for (const k of keys) if (!new RegExp('\\n\\s*' + k + ':\\{como:').test(ex)) throw new Error('la política «' + k + '» no tiene explicación en el informe');
  for (const k of keys) { const m = ex.match(new RegExp(k + ':\\{como:\'([^]*?)\',\\s*optimiza:\'([^]*?)\',')); if (!m || m[1].length < 80 || m[2].length < 40) throw new Error('explicación de «' + k + '» demasiado corta'); }
  for (const lit of ['POA de planta', 'Δ vs astronómico', 'Δ vs pairwise', 'Sombra ponderada por energía', 'Minutos con sombra relevante', 'Peor fila del día', 'Horas de backtracking', 'Pérdida eléctrica Martinez', 'Tabla horaria', 'Método y límites declarados'])
    if (!ui.includes(lit)) throw new Error('el informe no publica «' + lit + '»');
  // ni una física nueva: el informe come dayKpis (la MISMA integral que la tabla del día)
  const inf = ui.slice(ui.indexOf('function informeHTML'), ui.indexOf('function abrirInforme'));
  if (!/dayKpis\(P\.key\)/.test(inf)) throw new Error('el informe no usa dayKpis: estaría calculando por su cuenta');
  if (/poaPlant\(|shadeRows\(|policyAngles\(/.test(inf)) throw new Error('el informe recalcula física en vez de leer DAY');
});

t('v1.55 estático: el manual por FILA existe, arranca en la consigna de la escena y el slider escribe solo en la fila elegida', () => {
  // «Manual es para modificar la posición de todos a la vez, si queremos hacer row a row???»
  if (!/id="manrow"/.test(html)) throw new Error('falta la casilla «por fila»');
  if (!/function manualRowsInit\(\)/.test(html) || !/function manualRowsOn\(\)/.test(html)) throw new Error('falta el estado del manual por fila');
  if (!/manualRowSet\(\+\$\('rowsel'\)\.value\|\|0,\+\$\('manth'\)\.value\)/.test(html)) throw new Error('el slider no escribe en la fila elegida');   // v1.56: por manualRowSet (solidario con el accionamiento)
  if (!/porFila\?Array\.from\(\{length:nR\}/.test(html)) throw new Error('sceneInstant no usa los θ por fila');
  // v1.56: el slider habla en convención TCU (− = este) y la física al revés — se cruza por TH_DISP en los DOS sentidos
  if (!/MANUAL_ROWS=Array\.from\(\{length:nR\},\(_,r\)=>Math\.round\(TH_DISP\*\(a\[r\]/.test(html)) throw new Error('el manual por fila no arranca en la consigna de la política de la escena (con el signo del slider)');
});

t('v1.56: el θ MANUAL cruza el signo (slider «− = este» → física θ>0 = este) en el común y en el por fila', () => {
  // reportado con captura: slider −22°, HUD +22° y la mesa mirando al oeste
  const sc = cuerpoFn(html, 'sceneInstant');
  if (!sc) throw new Error('sin sceneInstant');
  if (!/anglesManual\(nR,TH_DISP\*th,mx\)/.test(sc)) throw new Error('el θ común del slider entra a la física sin cruzar el signo');
  if (!/TH_DISP\*\(\+\(MANUAL_ROWS\[r\]\|\|0\)\)/.test(sc)) throw new Error('el θ por fila entra a la física sin cruzar el signo');
  // y con el cruce, de ida y vuelta: slider s ⇒ física TH_DISP·s ⇒ HUD TH_DISP·(TH_DISP·s) = s
  const TH_DISP = -1;
  for (const s2 of [-22, 0, 60]) if (TH_DISP * (TH_DISP * s2) !== s2) throw new Error('el cruce no es involutivo');
});

t('v1.56 render≡física: la silueta 3D toma el largo de la mesa del VIDRIO, no de todo el spin (motor/TCU asomaban 2,6 m por el morro)', () => {
  // diagnóstico por ray-cast desde el sol: rojo visible en las mesas sur de las filas motoras, y la física decía LUZ ahí
  const b3 = cuerpoFn(html, 'build3D');
  if (!b3) throw new Error('sin build3D');
  if (!/mm\.isMesh&&mm\.material===glassM\)bbG\.expandByObject\(mm\)/.test(b3)) throw new Error('el bb de la silueta no se limita al vidrio');
  if (!/const bb=bbG\.isEmpty\(\)\?new THREE\.Box3\(\)\.setFromObject\(beam\.spin\):bbG;/.test(b3)) throw new Error('sin bb del vidrio con respaldo al spin');
});

t('v1.56 render≡física: en el corte 2D la sombra al suelo cae SOBRE el terreno y el borde de entrada lo decide la geometría', () => {
  // «Hay sombras en el aire» · «Esas sombras en los paneles son incoherentes con la del suelo y con la posición solar»
  const ds = cuerpoFn(html, 'drawScene');
  if (!ds) throw new Error('sin drawScene');
  if (!/const caeAlSuelo=\(x,z\)=>/.test(ds) || !/const sombraSuelo=\(ex,ez,col,off\)=>/.test(ds)) throw new Error('la sombra al suelo no busca el terreno');
  if (/fillRect\(Math\.min\(X\(gx\[0\]\)/.test(ds)) throw new Error('sigue la sombra a la cota del poste emisor');
  if (!/const bordeEntrada=\(i,angs\)=>/.test(ds)) throw new Error('sin regla geométrica del borde');
  if (/fromRight=psz>=0/.test(ds)) throw new Error('el borde sigue siendo «el lado del sol»');
  // la regla, ejecutada: mesa de ESPALDAS al sol (sol rasante al oeste, mesa mirando al este) ⇒ entra por el borde BAJO, que es el DERECHO
  const S = (psz) => (x, z) => x * Math.cos(psz * RAD) - z * Math.sin(psz * RAD);
  const RAD = Math.PI / 180, hw = 1.191, psz = -87, s = S(psz);
  const mesa = (cx, cz, th) => ({ ex: [cx - hw * Math.cos(th), cx + hw * Math.cos(th)], ez: [cz + hw * Math.sin(th), cz - hw * Math.sin(th)] });
  const E = mesa(0, 1.6, 55 * RAD), R = mesa(6, 1.6, 55 * RAD);          // θ>0 = borde derecho ABAJO = mira al este, sol al oeste
  const sE = [s(E.ex[0], E.ez[0]), s(E.ex[1], E.ez[1])], lo = Math.min(...sE), hi = Math.max(...sE);
  const inL = s(R.ex[0], R.ez[0]) >= lo && s(R.ex[0], R.ez[0]) <= hi, inR = s(R.ex[1], R.ez[1]) >= lo && s(R.ex[1], R.ez[1]) <= hi;
  if (!(inR && !inL)) throw new Error('de espaldas al sol la sombra debe entrar por el borde derecho (bajo), no por el de cara al sol');
  const E2 = mesa(0, 1.6, -55 * RAD), R2 = mesa(6, 1.6, -55 * RAD);      // de cara al sol: entra por el izquierdo (bajo)
  const sE2 = [s(E2.ex[0], E2.ez[0]), s(E2.ex[1], E2.ez[1])], lo2 = Math.min(...sE2), hi2 = Math.max(...sE2);
  const inL2 = s(R2.ex[0], R2.ez[0]) >= lo2 && s(R2.ex[0], R2.ez[0]) <= hi2;
  if (!inL2) throw new Error('de cara al sol la sombra debe entrar por el borde izquierdo (bajo)');
});

t('v1.56: el chip de pendientes avisa de la pendiente E-O en los EXTREMOS de fila que dispara el perfil N-S («las inclinaciones del 3D son exageradas»)', () => {
  const rt = cuerpoFn(html, 'recomputeTail');
  if (!rt || !/en extremos de fila hasta/.test(rt)) throw new Error('el chip sigue midiendo solo en el eje');
  // la cuña, con la fórmula del terreno 3D (cota + norte·tan(tilt) por línea, interpolado en x):
  // +6° y −6° a 97 m del centro con pitch 6 ⇒ Δz = 2·97·tan 6° = 20,4 m ⇒ 73,6° E-O
  const RAD = Math.PI / 180, dz = 97 * Math.tan(6 * RAD) - 97 * Math.tan(-6 * RAD);
  const pend = Math.atan2(dz, 6) / RAD;
  if (Math.abs(pend - 73.6) > 0.2) throw new Error('la cuña de los extremos no sale de la geometría declarada: ' + pend.toFixed(1));
});

t('v1.56: el manual por fila mueve las DOS filas del tracker en bifila y una sola en monofila', () => {
  const f = cuerpoFn(html, 'manualRowSet');
  if (!f) throw new Error('sin manualRowSet');
  if (!/manualRowSet\(\+\$\('rowsel'\)\.value\|\|0,\+\$\('manth'\)\.value\)/.test(html)) throw new Error('el slider no pasa por manualRowSet');
  // la regla, ejecutada con grupos de bifila y sin ellos
  const run = new Function('MANUAL_ROWS', 'DAY', f + '\nreturn function(r,v){manualRowSet(r,v);return MANUAL_ROWS;};');
  const bif = run([0, 0, 0, 0], { T: { groups: [[0, 1], [2, 3]] } })(1, 30);
  if (bif.join() !== '30,30,0,0') throw new Error('bifila: la gemela no gira con su motora: ' + bif.join());
  const mono = run([0, 0, 0, 0], { T: { groups: null } })(1, 30);
  if (mono.join() !== '0,30,0,0') throw new Error('monofila: se movió otra fila: ' + mono.join());
});

t('v1.56.1: al arrancar, el huso GUARDADO se corrige si no casa con el sitio guardado (Arequipa con tz 2 ⇒ −5)', () => {
  // «¿hora local? ¿12:51 amanecen los trackers?»: el guardado traía tz 2 de antes del huso por sitio
  const ui = html.slice(html.indexOf('/* FIN-FÍSICA'));
  const i = ui.indexOf("const tzSitio=husoPlanta(null,$('date').value,+$('lon').value,+$('lat').value);");
  if (i < 0) throw new Error('el arranque no compara el huso guardado con el del sitio');
  if (!/if\(Math\.abs\(\(\+\$\('tz'\)\.value\)-tzSitio\)>1\.5\)\{_huso=null;aplicaHuso\(null\);\}/.test(ui.slice(i, i + 400))) throw new Error('no manda el sitio cuando el huso guardado se aleja más de 1,5 h');
  // y la regla, ejecutada: Arequipa ⇒ −5 (estándar de la longitud), Zaragoza en junio ⇒ 2 (peninsular)
  const src2 = html.slice(html.indexOf('function tzDeLongitud'), html.indexOf('function tzDeLongitud') + 200).split('\n')[0] + '\n' + cuerpoFn(ui, 'husoPlanta');
  const H = new Function(src2 + '\nreturn husoPlanta;')();
  if (H(null, '2026-06-21', -71.80644, -16.59577) !== -5) throw new Error('Arequipa no da −5');
  if (H(null, '2026-06-21', -0.7981, 41.5763) !== 2) throw new Error('Zaragoza en junio no da +2');
  if (Math.abs(2 - H(null, '2026-06-21', -71.80644, -16.59577)) <= 1.5) throw new Error('el caso reportado no dispara la corrección');
});

t('v1.56 estático: la cámara desde el sol y el haz son del 3D — en el corte 2D se esconden', () => {
  const st = cuerpoFn(html, 'setTab');
  if (!st || !/\$\('sunpov'\)\.style\.display=VIEW3D\?'':'none'/.test(st)) throw new Error('el botón «sol» sigue visible en 2D');
});

t('v1.55: el huso sigue al sitio — regla peninsular en su sitio, estándar de la longitud fuera («debe estar en hora local»)', () => {
  // con Arequipa y 21-dic el cambio de fecha ponía +1 (la regla de Madrid) y a
  // las 10:56 el sol salía «bajo horizonte»: eran las 04:56 reales
  const ui = html.slice(html.indexOf('/* FIN-FÍSICA'));
  // tzDeLongitud vive junto a localToUTCms (bloque de física); husoPlanta, en la UI
  const src = html.slice(html.indexOf('function tzDeLongitud'), html.indexOf('function localToUTCms')) + ui.slice(ui.indexOf('function husoPlanta'), ui.indexOf('let _huso='));
  const H = new Function(src + 'return {tzDeLongitud, husoPlanta};')();
  if (H.tzDeLongitud(-71.80644) !== -5) throw new Error('Arequipa: ' + H.tzDeLongitud(-71.80644));
  if (H.tzDeLongitud(-0.7981) !== 0) throw new Error('Zaragoza estándar: ' + H.tzDeLongitud(-0.7981));
  if (H.husoPlanta(null, '2026-12-21', -71.80644, -16.6) !== -5) throw new Error('Arequipa en diciembre: ' + H.husoPlanta(null, '2026-12-21', -71.80644, -16.6));
  if (H.husoPlanta(null, '2026-06-21', -71.80644, -16.6) !== -5) throw new Error('Arequipa en junio: sin horario de verano');
  if (H.husoPlanta(null, '2026-06-21', -0.7981, 41.58) !== 2) throw new Error('Zaragoza en junio: CEST +2');
  if (H.husoPlanta(null, '2026-12-21', -0.7981, 41.58) !== 1) throw new Error('Zaragoza en diciembre: CET +1');
  if (H.husoPlanta(null, '2026-06-21', 9.6, 45.3) !== 2) throw new Error('Italia en junio: +2');
  if (H.husoPlanta({ tzFijo: -300 }, '2026-06-21', -71.8, -16.6) !== -5) throw new Error('tzFijo del layout manda');
  if (!/if\(id==='lon'\|\|id==='lat'\)\{_huso=null;aplicaHuso\(null\);\}/.test(ui)) throw new Error('cambiar lat/lon no arrastra el huso');
  /* v1.57.2: el aviso comparaba con la LONGITUD CRUDA y saltaba en el sitio por
     defecto —Zaragoza, −0,8°, España en UTC+2 en verano: «+2 no casa con
     ≈UTC+0»—. Lo que no casaba era el criterio del aviso con el que pone el
     huso. Ahora se compara con husoPlanta, y esto lo fija: mismo criterio en
     los dos sitios, y el aviso sigue existiendo para el caso que sí lo merece. */
  if (!/const tzEsp=husoPlanta\(_husoLay,c\.date,c\.lon,c\.lat\)/.test(ui)) throw new Error('el aviso del huso no usa el mismo criterio que lo asigna');
  if (!/aquí y en esta fecha toca UTC/.test(ui)) throw new Error('la tarjeta del sol no avisa del huso incoherente');
  // Zaragoza 21-jun con +2 NO debe avisar; con +2 en Arequipa, sí
  if (Math.abs(2 - H.husoPlanta(null, '2026-06-21', -0.7981, 41.58)) > 1.5) throw new Error('Zaragoza en verano con UTC+2 dispara el aviso, y es el huso correcto');
  if (Math.abs(2 - H.husoPlanta(null, '2026-06-21', -71.80644, -16.6)) <= 1.5) throw new Error('Arequipa con UTC+2 debería avisar');
});

console.log('v1.54 · quiebro en la rótula: el tracker quebrado se puede simular en presets');
{
  // «Debemos poder simular también tracker quebrado, que aparece en el
  // desplegable pero la realidad es que para poder simularlo necesitamos un
  // terreno donde las dos mesas tengan diferente inclinación». Los presets
  // daban un tilt por VIGA; ahora el perfil «rotula» parte cada viga en sus
  // dos mesas (sur +v, norte −v) con la misma estructura por mesa que una
  // planta medida, y solo la QUEBRADA lo sigue.
  const mkRot = (drive, v, nrows = 6, nsl = 'alineadas') => {
    const groups = F.driveGroups(nrows, drive);
    const filaLen = 2 * 28 * 1.146 + 0.55;
    const segs = F.nsSegments(nrows, nsl, 1, filaLen, 1.0, drive === 'mono' ? 1 : 2);
    if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
    const ELEV = new Array(nrows).fill(0);
    const RM = F.rotulaMesas('rotula', v, drive, segs, ELEV, groups, 0.55);
    const rowTilt = new Array(nrows).fill(0);
    const T = { pairs: F.pairsFromElev(ELEV, 6, rowTilt), cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / 6, z0: 0.17, nBypass: 2, iam: 0.05,
                rowTilt, groups, drive, segs: RM ? RM.segs : segs, filaLen };
    if (RM) Object.assign(T, { segTilt: RM.segTilt, segZ: RM.segZ, segSide: RM.segSide, segMorro: RM.segMorro, segPairs: RM.segPairs, segDrive: RM.segDrive });
    return { T, RM };
  };
  t('v1.54: con QUEBRADA cada viga son dos mesas a ±v, continuas en la rótula, con gemela y accionamiento; rígida, monofila y v=0 no cambian nada', () => {
    const { T, RM } = mkRot('quebrado', 4);
    if (!RM) throw new Error('la quebrada no recibe el perfil por mesa');
    for (let r = 0; r < 6; r++) {
      if (T.segs[r].length !== 2) throw new Error('la viga ' + r + ' no se parte en dos mesas: ' + T.segs[r].length);
      if (Math.abs(T.segTilt[r][0] - 4) > 1e-9 || Math.abs(T.segTilt[r][1] + 4) > 1e-9) throw new Error('tilts por mesa ' + T.segTilt[r]);
      // la cota de cada mesa es SU tilt (la misma regla que plantFromCotas: atan2(Δz, Δs))
      for (let k = 0; k < 2; k++) {
        const sg = T.segs[r][k], z = T.segZ[r][k], esp = Math.atan2(z[1] - z[0], sg[1] - sg[0]) * 180 / Math.PI;
        if (Math.abs(esp - T.segTilt[r][k]) > 1e-9) throw new Error(`mesa ${r}/${k}: tilt ${T.segTilt[r][k]} ≠ ${esp} de sus cotas`);
      }
      // continuidad en la rótula: los dos extremos interiores están a la misma cota (loma: por debajo de la rótula medio hueco)
      if (Math.abs(T.segZ[r][0][1] - T.segZ[r][1][0]) > 1e-9) throw new Error('la viga ' + r + ' no es continua en la rótula');
      if (!(T.segZ[r][0][1] < T.segMorro[r][0][1])) throw new Error('con v>0 la rótula tiene que ser el punto alto (loma)');
      if (T.segSide[r][0] !== 0 || T.segSide[r][1] !== 1) throw new Error('lados sur/norte mal');
    }
    // gemelas mesa a mesa y UN motor por tracker con sus cuatro mesas
    if (T.segPairs.length !== 3 * 2) throw new Error('parejas gemelas: ' + T.segPairs.length);
    if (T.segDrive.length !== 3 || T.segDrive.some(g => g.length !== 4)) throw new Error('accionamiento: ' + JSON.stringify(T.segDrive));
    for (const drive of ['bifila', 'mono']) if (mkRot(drive, 4).RM) throw new Error(drive + ' no puede seguir el quiebro (tubo recto)');
    if (mkRot('quebrado', 0).RM) throw new Error('con v=0 no hay quiebro que seguir');
    // vaguada: v<0 ⇒ la rótula es el punto bajo
    const { T: Tv } = mkRot('quebrado', -4);
    if (!(Tv.segZ[0][0][1] > Tv.segMorro[0][0][1])) throw new Error('con v<0 la rótula tiene que ser el punto bajo (vaguada)');
  });
  t('v1.54: con el quiebro, contador ≡ oráculo (planos y estructura) y las políticas por mesa dan θ COMÚN a las cuatro mesas del tracker', () => {
    const { T } = mkRot('quebrado', 4);
    const doy = 172, lat = 41.5763, lon = -0.7981;
    let peor = 0, nEval = 0;
    for (const m of [6 * 60 + 30, 8 * 60, 12 * 60, 16 * 60, 19 * 60]) {
      const g = F.solarPos(Date.UTC(2026, 5, 21) + (m - 120) * 60000, lat, lon);
      if (g.elev <= 0) continue;
      const irr = F.clearskyIneichen(g.zen, doy, 300, 3.5);
      const seg = F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, 0.2);
      for (const grp of T.segDrive) { const v0 = seg[grp[0][0]][grp[0][1]]; for (const [r, k] of grp) if (Math.abs(seg[r][k] - v0) > 1e-9) throw new Error('las mesas de un tracker no van al mismo θ a las ' + m); }
      // las mesas sur y norte tienen tilts opuestos: su θ ASTRO difiere (a mediodía, lejos del tope), el de accionamiento no
      const ast = F.anglesAstroSeg(g.zen, g.az, T);
      if (m === 12 * 60 && Math.abs(ast[0][0] - ast[0][1]) < 1e-6) throw new Error('astro por mesa no ve los tilts opuestos a mediodía: ' + ast[0]);
      const ang = F.segLineMean(T, seg);
      const sh = F.shadeRows(g.zen, g.az, T, seg), ora = oracleExact(F, g.zen, g.az, T, ang);
      for (let r = 0; r < 6; r++) { peor = Math.max(peor, Math.abs(sh[r] - ora[r])); nEval++; }
      // con sol alto la quebrada backtrackea sin sombra de planos
      if (g.elev > 25) { const ns = F.shadeBand3DAll(g.zen, g.az, T, seg, { noStruct: true }); if (Math.max(...ns) > 2e-3) throw new Error('sombra de planos con sol alto: ' + Math.max(...ns) + ' a las ' + m); }
    }
    if (!(nEval > 0)) throw new Error('sin instantes');
    if (peor > 1e-3) throw new Error('contador ≠ oráculo con el quiebro: ' + (peor * 100).toFixed(3) + ' pp');
  });
  t('v1.54 estático: el preset existe en la UI, terrain() lo reparte, y la página dice cuándo el tubo NO lo sigue', () => {
    if (!/<option value="rotula">/.test(html)) throw new Error('falta el preset «rotula» en el desplegable');
    if (!/rotulaMesas\(c\.nspreset,c\.axtilt,c\.drive,segs,ELEV,groups,0\.55\)/.test(html)) throw new Error('terrain() no reparte el quiebro por mesa');
    if (!/quiebro en la rótula NO seguido/.test(html)) throw new Error('el pill no avisa de que rígida/monofila no siguen el quiebro');
    if (/a los lados del morro/.test(html)) throw new Error('queda un «morro» visible: se llama rótula');
  });
}

console.log('v1.53 · barrido de terrenos REDUCIDO (el grande es tools/barrido_terrenos.mjs)');
{
  /* «Haz un millón de pruebas con los diferentes terrenos, trackers y algoritmos».
     El barrido grande (tools/barrido_terrenos.mjs, 40 configuraciones × 3 fechas ×
     cada 20 min) encontró: (A) el contador podaba emisoras por alcance con 9 m
     de altura útil a fuego y con torsión hay 13,6 m (5,5 pp contra el oráculo);
     (B) 2.520 instantes en que pairwise/true3d/mgl dejaban sombra que un θ
     uniforme evitaba —filas NO adyacentes (Bagnarelli, tresbolillo, ondulado) y
     torsión— y de ahí la reparación global `repairNoShade`. Aquí, seis
     configuraciones fijas que cubren esas familias, con los mismos invariantes. */
  const sitios = { Z: { lat: 41.5763, lon: -0.7981, alt: 300 }, A: { lat: -16.59577, lon: -71.80644, alt: 1563 } };
  const elevPreset = (P, v, n, pitch) => {
    const z = new Array(n).fill(0), RAD = Math.PI / 180;
    if (P === 'pendiente') for (let i = 0; i < n; i++) z[i] = -i * pitch * Math.tan(v * RAD);
    else if (P === 'ondulado') for (let i = 0; i < n; i++) z[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
    else if (P === 'valle') for (let i = 0; i < n; i++) z[i] = v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
    else if (P === 'cresta') for (let i = 0; i < n; i++) z[i] = -v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2) + v;
    return z;
  };
  const nsProfile = (preset, v, n) => { const out = new Array(n).fill(v);
    if (preset === 'quebrado') for (let i = 0; i < n; i++) out[i] = i < n / 2 ? v : -v;
    else if (preset === 'senoidal') for (let i = 0; i < n; i++) out[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
    return out; };
  const mk = (c) => {
    const ELEV = elevPreset(c.tp, c.tv, c.n, 6), groups = F.driveGroups(c.n, c.drive);
    const eff = F.effRowTilts(nsProfile(c.ns, c.nv, c.n), c.drive, groups), filaLen = 2 * 28 * 1.146 + 0.55;
    const segs = F.nsSegments(c.n, c.nsl, c.ntrk || 1, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
    if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
    return { pairs: F.pairsFromElev(ELEV, 6, eff), cw: 2.382, axisAz: c.az || 0, maxAngle: 55, gcr: 2.382 / 6, z0: 0.17, nBypass: 2, iam: 0.05,
             rowTilt: eff, groups, drive: c.drive, segs, filaLen };
  };
  const CFGS = [
    { nm: 'ondulado 2 · N-S 6 · bifila · alineadas · Arequipa', tp: 'ondulado', tv: 2, ns: 'constante', nv: 6, drive: 'bifila', nsl: 'alineadas', n: 8, s: 'A' },
    { nm: 'cresta 3 · llano N-S · mono · bagnarelli · az 15 · Arequipa', tp: 'cresta', tv: 3, ns: 'constante', nv: 0, drive: 'mono', nsl: 'bagnarelli', n: 10, az: 15, s: 'A' },
    { nm: 'pendiente 10 · senoidal 4 · mono · medios · az 15 · Zaragoza', tp: 'pendiente', tv: 10, ns: 'senoidal', nv: 4, drive: 'mono', nsl: 'medios', n: 6, az: 15, s: 'Z' },
    { nm: 'llano · quebrado 6 · quebrado · bagnarelli · az 15 · Zaragoza', tp: 'llano', tv: 0, ns: 'quebrado', nv: 6, drive: 'quebrado', nsl: 'bagnarelli', n: 6, az: 15, s: 'Z' },
    { nm: 'valle 1 · quebrado 6 · mono · medios ×2 · az −20 · Arequipa', tp: 'valle', tv: 1, ns: 'quebrado', nv: 6, drive: 'mono', nsl: 'medios', ntrk: 2, n: 8, az: -20, s: 'A' },
    { nm: 'ondulado 1.2 · N-S 3 · mono · tresbolillo · az 15 · Zaragoza', tp: 'ondulado', tv: 1.2, ns: 'constante', nv: 3, drive: 'mono', nsl: 'tresbolillo', n: 8, az: 15, s: 'Z' },
  ];
  const DIAS = [[Date.UTC(2026, 5, 21), 172], [Date.UTC(2026, 11, 21), 355]];
  const filasDe = (sh, r) => { const de = sh.de && sh.de[r] ? sh.de[r] : []; return Math.min(sh[r] || 0, de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0)); };
  for (const c of CFGS) {
    const T = mk(c), st = sitios[c.s];
    t(`barrido · ${c.nm}: contador ≡ oráculo, sin-sombra ≤ 5 % de filas (o lo que ningún θ evita SIN perder energía), energía y acople`, () => {
      let peorA = 0, peorB = null, nB = 0;
      for (const [dia, doy] of DIAS) for (let m = 0; m < 1440; m += 40) {
        const g = F.solarPos(dia + m * 60000, st.lat, st.lon);
        if (g.elev <= 3) continue;
        const irr = F.clearskyIneichen(g.zen, doy, st.alt, 3.5);
        const ang = {};
        for (const key of ['pairwise', 'true3d', 'mgl', 'optimal', 'optfree']) {
          ang[key] = F.policyAngles(key, g.zen, g.az, T, irr, doy, 0.2).angles;
          if (ang[key].some(a => !isFinite(a) || Math.abs(a) > 55 + 1e-6)) throw new Error(`${key}: θ fuera de rango ${ang[key]}`);
          if (T.groups) for (const gr of T.groups) if (gr.length === 2 && Math.abs(ang[key][gr[0]] - ang[key][gr[1]]) > 1e-9) throw new Error(`${key}: el accionamiento ${gr} no va acoplado`);
        }
        // A
        if (m % 120 === 0) { const sh = F.shadeRows(g.zen, g.az, T, ang.pairwise), ora = oracleExact(F, g.zen, g.az, T, ang.pairwise);
          for (let r = 0; r < c.n; r++) peorA = Math.max(peorA, Math.abs(sh[r] - ora[r])); }
        // B: sombra de filas con las políticas sin-sombra, contra lo alcanzable con θ uniforme
        for (const key of ['pairwise', 'true3d', 'mgl']) {
          const sh = F.shadeBand3DAll(g.zen, g.az, T, ang[key], { noStruct: true });
          let mx = 0; for (let r = 0; r < c.n; r++) mx = Math.max(mx, filasDe(sh, r));
          nB++;
          if (mx > 0.05) {
            /* v1.57.2 (cuarta auditoría): el candidato alternativo tiene que ser
               mejor en sombra Y NO PEOR EN ENERGÍA. Medir sólo sombra óptica es
               el vicio de toda esta auditoría metido en el banco que juzga: en
               «valle 1 · quebrado · sol 25°», el θ uniforme que baja la sombra
               del 32,9 % al 15,2 % publica 298,7 W/m² de planta frente a los
               662,1 de la consigna publicada. Un banco no puede pedir que se
               tire más de la mitad de la producción para enseñar menos sombra. */
            let alc = 1, mejorReal = null;
            const pPub = F.poaPlant(g.zen, g.az, T, ang[key], irr, doy, 0.2).plant;
            const RF = F.rangosUnidad(g.zen, g.az, T);   // v1.57: lo alcanzable, dentro del rango legítimo de cada unidad de accionamiento y con la malla publicada
            for (let th = -55; th <= 55; th += 5) {
              const cand = RF.map(q => Math.max(q[0], Math.min(q[1], th)));
              const s2 = F.shadeBand3DAll(g.zen, g.az, T, cand, { noStruct: true }); let m2 = 0;
              for (let r = 0; r < c.n; r++) m2 = Math.max(m2, filasDe(s2, r));
              alc = Math.min(alc, m2);
              if (m2 <= Math.max(0.01, 0.5 * mx) && F.poaPlant(g.zen, g.az, T, cand, irr, doy, 0.2).plant >= pPub - 0.05   // 0,05 W/m²: empate técnico, la misma tolerancia escrita que en H y en el barrido
                  && (mejorReal === null || m2 < mejorReal.m2)) mejorReal = { m2, th };
            }
            if (mejorReal && (!peorB || mx > peorB.mx)) peorB = { mx, alc: mejorReal.m2, key, elev: g.elev, m, ang: ang[key].map(a => +a.toFixed(0)) };
          }
        }
        // C
        if (irr.ghi > 5) { const P = {}; for (const key of ['pairwise', 'optimal', 'optfree']) P[key] = F.poaPlant(g.zen, g.az, T, ang[key], irr, doy, 0.2).plant;
          if (P.optimal < P.pairwise * (1 - 1e-3) - 1e-6) throw new Error(`optimal ${P.optimal.toFixed(1)} < pairwise ${P.pairwise.toFixed(1)} a ${m} min`);
          if (P.optfree < P.optimal * (1 - 1e-3) - 1e-6) throw new Error(`optfree ${P.optfree.toFixed(1)} < optimal ${P.optimal.toFixed(1)} a ${m} min`); }
      }
      if (peorA > 1e-3) throw new Error(`contador vs oráculo: ${(peorA * 100).toFixed(2)} pp`);
      if (peorB) throw new Error(`${peorB.key} deja ${(peorB.mx * 100).toFixed(1)} % de sombra de filas a ${peorB.elev.toFixed(1)}° (min ${peorB.m}) cuando un θ uniforme baja a ${(peorB.alc * 100).toFixed(1)} % · θ ${peorB.ang.join('/')}`);
      if (nB < 30) throw new Error('pocos instantes: ' + nB);
    });
  }
}

console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
