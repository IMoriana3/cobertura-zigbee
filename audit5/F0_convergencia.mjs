/* BT3D · FASE 0 (decisión 3 del titular) — LO QUE CUESTA NO APLICAR LA
 * CONVERGENCIA DE MERIDIANOS, EN θ Y EN ENERGÍA.
 *
 *   node audit5/F0_convergencia.mjs [ayora|fayon] [--json=RUTA]
 *
 * Las mesas de las dos plantas están en el norte de CUADRÍCULA UTM (Ayora 30N,
 * comprobado: rotación cotas↔layout −0,0003°; Fayón 31N, lo dice su layout). El
 * simulador usa el acimut del sol tal cual contra el eje n (axisAz 0): trata la
 * cuadrícula como norte geográfico. El sol, en el marco de la planta, está en
 * az_malla = az − γ (γ: Ayora +1,161°, Fayón −1,764°; bt3d_parametros.json).
 *
 * θ: backtracking de pvlib POR UNIDAD (su tilt, su pendiente transversal, gcr =
 * cuerda/paso), con el acimut que usa el simulador (az) y con el verdadero
 * (az_malla); y el astronómico igual. Se publica la distribución de |Δθ|.
 * ENERGÍA: las dos series de θ se evalúan con el sol VERDADERO (az_malla), mesa a
 * mesa: sombra del motor de proyección (unión de emisores, 16 estaciones
 * axiales), POA con `poaRow` y pérdida eléctrica con `elecLoss` del simulador (nb
 * declarado), ponderada por el largo de la mesa. Δ % = (con γ) / (sin γ) − 1: lo
 * que la omisión le quita a la planta.
 * Días: el 21 de cada mes, paso 10 min (el anual de la página), cielo claro
 * Ineichen con turbidez 3,5, albedo 0,2, IAM 0,05. Sin lazo: se mide la geometría
 * de la omisión, no el actuador (declarado).
 * TEST NULO: con γ = 0 las dos series coinciden y Δ = 0 exacto. CONTROL: con −γ el
 * |Δθ| medio sale del mismo tamaño y de signo opuesto.
 * FAYÓN ES EL PLANO (DEM de 10 m): su Δ % vale como diferencia relativa; su
 * energía absoluta no se publica ni se compara con la de Ayora.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador } from './lib_simulador.mjs';
import { cargar, resolver } from './lib_parametros.mjs';
import { vectorSol, caraMesa, relaciones, fraccionEstacion } from './lib_proyeccion.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PL = process.argv[2] || 'ayora';
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const { F, VER } = cargaSimulador(ROOT, ['singleaxis', 'trueTrackAngle', 'poaRow', 'elecLoss']);
const P = cargar(), E = JSON.parse(fs.readFileSync(path.join(ROOT, `audit5/out/escenas/${PL}.json`), 'utf-8'));
const par = resolver(P, PL, E.unidades.map(u => u.id)), G = E.convergencia;
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, `${PL}_layout.json`), 'utf-8'));
const PASO_FILA = PL === 'ayora' ? JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')).pitch : lay.montaje.pitch;
const ALT = PL === 'ayora' ? JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')).base : 0;
const NST = 16, TL = 3.5, ALB = 0.2, IAM = 0.05, PASO = 10, DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const len = E.mesas.map(m => Math.hypot(m.n[1] - m.n[0], m.z[1] - m.z[0])), sumLen = len.reduce((a, b) => a + b, 0);
const tau = E.mesas.map(m => Math.atan2(m.z[1] - m.z[0], m.n[1] - m.n[0]) * 180 / Math.PI);

function thetas(zen, az, bt) {
  return E.unidades.map((u, k) => F.singleaxis(zen, az, { axisTilt: -u.tilt, axisAz: 0, maxAngle: par[k].theta_max, backtrack: bt, gcr: par[k].cuerda / PASO_FILA, crossAxisTilt: u.pendiente }));
}
/* POA de planta (W/m², ponderada por largo) con θ por unidad, bajo el sol s/zen/azV */
function poaPlanta(th, zen, azV, irr, doy) {
  const s = vectorSol(zen, azV), C = E.mesas.map(m => caraMesa(m, th[m.u], par[0].z0, par[0].cuerda));
  const rel = relaciones(C, s);
  let p = 0;
  E.mesas.forEach((m, i) => {
    const R = C[i]; let f = 0, el = 0;
    const polys = rel[i].filter(x => x.area > 0).map(x => x.poly);
    if (polys.length && s[0] * R.nr[0] + s[1] * R.nr[1] + s[2] * R.nr[2] > 1e-12)
      for (let j = 0; j < NST; j++) { const q = fraccionEstacion(R, polys, R.L * (j + 0.5) / NST); f += q; el += F.elecLoss(q, par[0].nb); }
    f /= NST; el /= NST;
    const o = F.poaRow(th[m.u], tau[i], 0, zen, azV, irr, doy, ALB, IAM);
    p += (o.beam * (1 - el) + o.circ * (1 - f) + o.sky + o.gnd) * len[i];
  });
  return p / sumLen;
}
const R = { planta: PL, ver: VER, gamma: G, paso_fila: PASO_FILA, meses: [], nulo: null, control: null };
const dth = { bt: [], astro: [] };
let eSin = 0, eCon = 0; const t0 = Date.now();
for (let mo = 0; mo < 12; mo++) {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = F.doyOf(ds), dia = Date.UTC(2026, mo, 21) - 3600000;
  let mS = 0, mC = 0, n = 0;
  for (let min = 0; min < 1440; min += PASO) {
    const g = F.solarPos(dia + min * 60000, lay.clat, lay.clon); if (!(g.elev > 0.5)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL), azV = g.az - G, w = PASO / 60 / 1000 * DIM[mo];
    const thS = thetas(g.zen, g.az, true), thC = thetas(g.zen, azV, true);
    thS.forEach((v, k) => dth.bt.push(thC[k] - v));
    const aS = thetas(g.zen, g.az, false), aC = thetas(g.zen, azV, false); aS.forEach((v, k) => dth.astro.push(aC[k] - v));
    const pS = poaPlanta(thS, g.zen, azV, irr, doy), pC = poaPlanta(thC, g.zen, azV, irr, doy);
    mS += pS * w; mC += pC * w; n++;
    /* test nulo y control, en el primer instante de junio en que NINGUNA unidad
       está contra el tope (si todas lo están, Δθ = 0 con cualquier γ y el
       control no diría nada: le pasó a la primera versión en Ayora) */
    if (mo === 5 && R.nulo == null && thS.every((v, k) => Math.abs(v) < par[k].theta_max - 1)) {
      const t0s = thetas(g.zen, g.az, true), t0c = thetas(g.zen, g.az - 0, true);
      R.nulo = { max_abs_dtheta: Math.max(...t0s.map((v, k) => Math.abs(v - t0c[k]))) };
      const tm = thetas(g.zen, g.az + G, true), dp = thC.map((v, k) => v - thS[k]), dm = tm.map((v, k) => v - thS[k]);
      R.control = { hora_utc: min / 60 - 1, elev: g.elev, media_dtheta_con_gamma: dp.reduce((a, b) => a + b, 0) / dp.length, media_dtheta_con_menos_gamma: dm.reduce((a, b) => a + b, 0) / dm.length };
    }
  }
  R.meses.push({ mes: mo + 1, instantes: n, sin_gamma: mS, con_gamma: mC });
  eSin += mS; eCon += mC;
  console.error(`  ${PL} mes ${mo + 1}: ${n} instantes · Δ ${(100 * (mC / mS - 1)).toFixed(4)} % · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const q = (a, p) => { const s = a.map(Math.abs).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
R.dtheta = Object.fromEntries(Object.entries(dth).map(([k, a]) => [k, { n: a.length, p50: q(a, 0.5), p90: q(a, 0.9), p99: q(a, 0.99), max: q(a, 1), media_con_signo: a.reduce((x, y) => x + y, 0) / a.length }]));
R.energia = { sin_gamma: eSin, con_gamma: eCon, delta_pct: 100 * (eCon / eSin - 1) };
R.s = (Date.now() - t0) / 1000;
console.log(`BT3D · F0 · convergencia · ${VER} · ${PL.toUpperCase()}${PL === 'fayon' ? ' (EL PLANO: solo diferencia relativa)' : ''} · γ = ${G}° · ${E.unidades.length} unidades · 12 días × ${PASO} min`);
console.log(`  TEST NULO (γ = 0, identidad del cálculo): máx |Δθ| = ${R.nulo.max_abs_dtheta}° · CONTROL (21-jun, sol ${R.control.elev.toFixed(1)}°, ninguna unidad en el tope): Δθ medio con +γ ${R.control.media_dtheta_con_gamma.toFixed(4)}° y con −γ ${R.control.media_dtheta_con_menos_gamma.toFixed(4)}°`);
for (const [k, d] of Object.entries(R.dtheta)) console.log(`  θ ${k === 'bt' ? 'backtracking pvlib' : 'astronómico      '} por unidad · |Δθ| p50 ${d.p50.toFixed(3)}° · p90 ${d.p90.toFixed(3)}° · p99 ${d.p99.toFixed(3)}° · máx ${d.max.toFixed(3)}° · Δθ medio con signo ${d.media_con_signo.toFixed(4)}° (${d.n} unidad×instante)`);
console.log(`  ENERGÍA (sol verdadero, sombra del motor): ${PL === 'fayon' ? '' : `sin γ ${eSin.toFixed(4)} · con γ ${eCon.toFixed(4)} kWh/m²·(12 días ponderados) · `}Δ ${R.energia.delta_pct.toFixed(4)} % · ${R.s.toFixed(0)} s`);
fs.writeFileSync(path.join(ROOT, arg('json', `audit5/out/F0_convergencia_${PL}.json`)), JSON.stringify(R, null, 1));
