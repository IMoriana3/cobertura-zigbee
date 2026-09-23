/* AFECCIÓN BT E/O ≡ TRAZADO DE RAYOS.
 *
 * La capa «Afección BT» dice cuántos grados de recorte le impone a un seguidor
 * la fila de al lado. Lo calcula en 2D (perfil E-U, `afbtDeficit`) con la cota
 * de las dos filas; aquí se contrasta con un trazado de rayos 3D independiente
 * sobre las filas tal cual están: cada fila un rectángulo con SUS dos puntas
 * medidas (pendiente y alabeo incluidos), el rayo desde puntos del módulo hasta
 * el panel vecino, y el recorte mínimo que lo libra por bisección.
 *
 * Lo que destapó, en Ayora (cotas medidas, tubos al 1,4 %): error medio de
 * 15,7° contra los rayos. Tres causas, cada una aislada aplanando la anterior:
 *   · el sol se tomaba en el plano vertical y no en el perpendicular al TUBO;
 *   · el giro a ese marco, copiado de bt3dAng, llevaba el signo de la
 *     pendiente cambiado (y bt3dAng también);
 *   · el desnivel de la pareja era el MEDIO, y las filas se alabean: el
 *     backtracking tiene que librar el peor punto.
 * Con las tres corregidas: 0,4° en Ayora, 1,0° en San José, 0,2° en El Burgo.
 *
 * La geometría es LA DEL 3D: cotas medidas en modo levantamiento (Ayora, San
 * José) y, si no, el seguidor apoyado en el DEM como trackerBase (tubo en
 * pendiente, fila este filaZ·gE más alta). En El Burgo no hay cotas: sin red el
 * DEM sale plano, así que se le pone un relieve SINTÉTICO determinista (hasta
 * ~5 % de pendiente) para ejercitar ese camino; con ONLINE=1 se usa el DEM real
 * (las teselas se bajan con curl, que pasa por el proxy con su certificado).
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_afbt_rayos.mjs ayora        (levantamiento)
 *     node tools/test_afbt_rayos.mjs elburgo      (DEM sintético; ONLINE=1 → real)
 */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';
import { execFileSync } from 'node:child_process';
const PUERTO = process.env.PUERTO || 8124;
const planta = process.argv[2] || 'ayora';
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra != null ? ' -> ' + extra : '')); } };

const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
const ONLINE = process.env.ONLINE === '1';
await ctx.addInitScript(on => { try { localStorage.cobertura_offline = on ? '0' : '1'; } catch (e) {} }, ONLINE);
if (ONLINE) {                        // solo las teselas de relieve, bajadas con curl; lo demás de fuera, abortado
  const cache = new Map();
  await ctx.route(/elevation-tiles-prod/, async route => { const u = route.request().url();
    try { let body = cache.get(u); if (!body) { body = execFileSync('curl', ['-sf', '--max-time', '30', u]); cache.set(u, body); }
          await route.fulfill({ status: 200, contentType: 'image/png', body, headers: { 'access-control-allow-origin': '*' } }); }
    catch (e) { await route.abort(); } });
  await ctx.route(/^https?:\/\/(?!localhost)(?!.*elevation-tiles-prod)/, route => route.abort());
}
const pg = await ctx.newPage(); const t0 = Date.now(), errores = [];
pg.on('pageerror', e => errores.push(String(e)));
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${planta}`,
              { waitUntil: 'domcontentloaded', timeout: 120000 });
while (!(await pg.evaluate(() => typeof afbtVecinos === 'function' && TRK.length > 0 &&
                                 (cotasFile() == null || (COTAS && TRK.some(t => t.mc)))))) {
  if (Date.now() - t0 > 300000) throw new Error('la página no cargó los seguidores / las cotas');
  await pg.waitForTimeout(500);
}
/* La geometría activa: con cotas, el modo levantamiento (el que las dibuja); sin ellas, el DEM —real
   con ONLINE=1, o un relieve sintético si no hay red y el DEM ha salido plano. */
const geo = await pg.evaluate(async (online) => {
  if (cotasFile()) { const s = $('geosrc'); s.value = 'levantamiento'; s.onchange();
    for (let k = 0; k < 200 && !(GEO === 'levantamiento' && TRK.some(t => usaCotas(t))); k++) await new Promise(r => setTimeout(r, 100));
    return 'levantamiento'; }
  if (online) { for (let k = 0; k < 600 && !TRK.some(t => t.relN !== t.relS); k++) await new Promise(r => setTimeout(r, 100));
    return TRK.some(t => t.relN !== t.relS) ? 'DEM real' : 'DEM plano (no llegó el relieve)'; }
  const f = (x, z) => 2.2 * Math.sin(x / 37) + 1.6 * Math.cos(z / 53) + 0.012 * x - 0.008 * z;   // hasta ~5 %
  for (const t of TRK) { const h = (t.span || TC.span) / 2, e = t.dE || 1;
    t.rel = f(t.gx, t.gz); t.relN = f(t.gx, t.gz - h); t.relS = f(t.gx, t.gz + h); t.relE = f(t.gx + e, t.gz); t.relW = f(t.gx - e, t.gz); }
  return 'DEM sintético';
}, ONLINE);
console.log('geometría: ' + geo);

/* 1 · bt3dAng con el tubo INCLINADO: el panel tiene que mirar al sol. Se busca a
   fuerza bruta el ángulo que maximiza sol·normal, con la normal del tubo
   inclinado n(θ) = −sen θ·Este + cos θ·(0, −sen b, cos b), y se compara. Con el
   signo antiguo salía 5° desviado en este caso. */
const ang = await pg.evaluate(() => {
  const DEG = Math.PI / 180, antes = { SUN: window.SUN, bt: btOn }, out = [];
  for (const gN of [0.1, -0.1]) for (const sv of [{ E: 0.3, N: 0.5, U: 0.5 }, { E: -0.4, N: -0.6, U: 0.45 }]) {
    const n = Math.hypot(sv.E, sv.N, sv.U), s = { E: sv.E / n, N: sv.N / n, U: sv.U / n };
    window.SUN = { _dir: s }; btOn = false;
    const th = bt3dAng({ rot: 0, mc: { gN, ase: 0, cse: 0, aso: 0, cso: 0 } });
    const bb = Math.atan(gN); let best = 0, bv = -9;
    for (let t = -55; t <= 55; t += 0.05) { const r = t * DEG;
      const v = -Math.sin(r) * s.E + Math.cos(r) * (-Math.sin(bb) * s.N + Math.cos(bb) * s.U);
      if (v > bv) { bv = v; best = t; } }
    out.push({ gN, th, best });
  }
  window.SUN = antes.SUN; btOn = antes.bt; return out;
});
for (const a of ang) check(`bt3dAng mira al sol con el tubo inclinado (gN ${a.gN}): ${a.th.toFixed(2)}° vs ${a.best.toFixed(2)}°`,
                           Math.abs(a.th - a.best) < 0.2);

/* 2 · afbtDeficit contra los rayos, pareja a pareja, 12 días tipo cada 15 min. */
const r = await pg.evaluate(() => {
  const DEG = Math.PI / 180, lim = ((COTAS && COTAS.limite) || 55) * DEG;
  const c = (COTAS && COTAS.cuerda) || (((COTAS && COTAS.gcr) || SIM_GCR) * (TC.filaZ ? 2 * TC.filaZ : 6));
  const fz = TC.filaZ || 0, HOFF = TC.off || 0;
  function ejes(t, lado) {            // cota del EJE en las puntas [sur, norte], coordenadas de escena, como las dibuja el 3D
    if (usaCotas(t) && t.mc.f) { const f = t.mc.f[lado]; const cv = y => (COTAS.base + y - baseElev) - COTAOFF - HOFF; return [cv(f.y[0]), cv(f.y[1])]; }
    const gN = (t.relN - t.relS) / (t.span || TC.span), gE = (t.relE - t.relW) / (2 * (t.dE || 1));    // el drapeado de trackerBase
    const s = (t.medio ? (t.mr || 0.5) : 1) * (t.span || TC.span), h = t.rel + TC.postH + (lado ? 1 : -1) * fz * gE;
    return [h - gN * s / 2, h + gN * s / 2]; }
  const pend = t => usaCotas(t) ? t.mc.gN : (t.relN - t.relS) / (t.span || TC.span);
  function fila(t, lado, u0, a0) {    // rectángulo de la fila: u perpendicular al tubo, a a lo largo (positivo al SUR)
    const s = (t.medio ? (t.mr || 0.5) : 1) * (t.span || TC.span), e = ejes(t, lado);
    return { u: u0 + (lado ? fz : -fz), a0: a0 - s / 2, a1: a0 + s / 2, g: (e[0] - e[1]) / s, h0: e[1] }; }
  function sombreado(FA, FB, sv, beta) {   // ¿algún punto de FA a la sombra de FB, las dos a beta?
    const su = sv.E, sa = -sv.N, sz = sv.U, cb = Math.cos(beta), sb = Math.sin(beta), tb = Math.tan(beta);
    const den = sz - FB.g * sa - su * tb; if (Math.abs(den) < 1e-9) return false;
    for (let ia = 0; ia <= 24; ia++) { const Pa = FA.a0 + (FA.a1 - FA.a0) * ia / 24;
      for (let it = -5; it <= 5; it++) { const t = it / 10;
        const Pu = FA.u + t * c * cb, Pz = FA.h0 + FA.g * (Pa - FA.a0) + t * c * sb;
        const k = (FB.h0 + FB.g * (Pa - FB.a0) + (Pu - FB.u) * tb - Pz) / den; if (k <= 1e-6) continue;
        const qa = Pa + k * sa, tq = (Pu + k * su - FB.u) / (c * cb);
        if (Math.abs(tq) <= 0.5 && qa >= FB.a0 && qa <= FB.a1) return true; } }
    return false; }
  const o = { pares: 0, ambos: 0, soloF: 0, soloR: 0, dif: [] };
  const doys = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349], d0 = simDoy;
  const idx = []; for (let i = 0; i < TRK.length; i += Math.max(1, Math.floor(TRK.length / 40))) idx.push(i);
  for (const i of idx) { const A = TRK[i];
    for (const v of afbtVecinos(i)) { const B = TRK[v.j]; o.pares++;
      const lc = afbtLoc(A, B), ladoA = v.lado === 'E' ? 1 : 0;
      const FA = fila(A, ladoA, 0, 0), FB = fila(B, 1 - ladoA, lc[0], lc[1]);
      const bA = Math.atan(pend(A));
      for (const doy of doys) { simDoy = doy;
        for (let m = 270; m <= 1290; m += 15) { const sv0 = sunVec(m); if (sv0.U <= 0.02) continue;
          const sv = afbtSol(sv0, A.rot || 0), s = v.lado === 'E' ? 1 : -1; if (s * sv.E <= 0) continue;
          const suT = sv.U * Math.cos(bA) - sv.N * Math.sin(bA); if (suT <= 0.02) continue;
          if (afbtSolape(v, sv0, 'me') <= 0.02) continue;            // sin solape la capa pondera 0: no se compara
          const beta = Math.max(-lim, Math.min(lim, -Math.atan2(sv.E, suT)));
          const F = afbtDeficit(A, B, v.lado, sv0, v.gap);
          let R = 0; if (sombreado(FA, FB, sv, beta)) {
            if (sombreado(FA, FB, sv, 0)) R = Math.abs(beta) / DEG;
            else { let lo = 0, hi = 1; for (let k = 0; k < 18; k++) { const mm = (lo + hi) / 2; sombreado(FA, FB, sv, beta * (1 - mm)) ? lo = mm : hi = mm; } R = Math.abs(beta) * hi / DEG; } }
          const f = F > 0.3, rr = R > 0.3;
          if (f && rr) o.ambos++; else if (f) o.soloF++; else if (rr) o.soloR++;
          if (f || rr) o.dif.push(F - R); } } } }
  simDoy = d0;
  const d = o.dif.map(Math.abs); o.mae = d.length ? d.reduce((a, x) => a + x, 0) / d.length : 0;
  o.sesgo = o.dif.length ? o.dif.reduce((a, x) => a + x, 0) / o.dif.length : 0; delete o.dif;
  return o; });
console.log(`\n${planta} (${geo}): ${r.pares} parejas · con recorte en los dos ${r.ambos} · solo fórmula ${r.soloF} · solo rayos ${r.soloR} · error medio ${r.mae.toFixed(2)}° · sesgo ${r.sesgo.toFixed(2)}°`);
check('hay parejas con recorte que comparar', r.ambos > 200, r.ambos);
check('error medio contra los rayos < 1,5°', r.mae < 1.5, r.mae.toFixed(2) + '°');
check('la fórmula no se deja recortes que los rayos ven (< 2 %)', r.soloR <= 0.02 * r.ambos, r.soloR);
check('ni se inventa recortes que los rayos no ven (< 3 %)', r.soloF <= 0.03 * r.ambos, r.soloF);
check('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`\n${ok} OK · ${ko} FAIL`);
await b.close();
process.exit(ko ? 1 : 0);
