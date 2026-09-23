/* AFECCIÓN BT: QUIÉN ES VECINO Y CUÁNTO SUMA.
 *
 * Páramo es de UNA fila por tracker con las filas a 7 m. El radio de búsqueda
 * (2,6 × paso, con el paso de 6 m por defecto cuando filaZ es 0) llegaba a
 * 15,6 m y metía la fila de 14 m: 1.414 parejas que son la fila de DETRÁS, cuya
 * sombra cae sobre la de delante. Y la cifra «recorte total» sumaba la media de
 * cada vecino, cuando el backtracking solo tiene que librar al que más obliga en
 * cada instante: en Páramo salía un 36 % por encima.
 *
 * Se comprueba:
 *   · Páramo: la fila de detrás, tapada entera por la de delante, ya no entra;
 *   · El Burgo: ningún vecino de la fila contigua se pierde por el filtro;
 *   · el total de afbtAgg es la media del MAYOR recorte por instante, calculada
 *     aquí aparte, y no pasa de la suma.
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_afbt_vecinos.mjs
 */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra != null ? ' -> ' + extra : '')); } };
const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const errores = [];
async function abre(planta) {
  const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errores.push(planta + ': ' + e)); const t0 = Date.now();
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${planta}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  while (!(await pg.evaluate(() => typeof afbtAgg === 'function' && TRK.length > 0))) {
    if (Date.now() - t0 > 300000) throw new Error(planta + ': la página no cargó'); await pg.waitForTimeout(500); }
  return { ctx, pg };
}

const P = await abre('paramo');
const p = await P.pg.evaluate(() => {
  const h = {}; let tapados = 0;
  for (let i = 0; i < TRK.length; i++) { const A = TRK[i], vs = afbtVecinos(i);
    for (const v of vs) { const k = Math.round(Math.abs(v.dx)); h[k] = (h[k] || 0) + 1; } }
  /* total = media del mayor por instante, calculado aquí aparte */
  const doys = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349], d0 = simDoy, m0 = afbtMode; afbtMode = 'ano';
  const tot = [];
  for (let i = 0; i < TRK.length; i += Math.floor(TRK.length / 8)) { const A = TRK[i], vs = afbtVecinos(i);
    let s = 0, n = 0;
    for (const doy of doys) { simDoy = doy; for (let m = 270; m <= 1290; m += 15) { const sv = sunVec(m); if (sv.U <= 0.02) continue; n++;
      let mx = 0; for (const v of vs) { const f = afbtSolape(v, sv, 'me'); if (f > 0) mx = Math.max(mx, afbtDeficit(A, TRK[v.j], v.lado, sv, v.gap) * f); } s += mx; } }
    simDoy = d0; const r = afbtAgg(i); tot.push({ nuestro: s / n, capa: r.totMe, suma: r.reduce((a, v) => a + v.me, 0) }); }
  simDoy = d0; afbtMode = m0;
  return { h, tot };
});
const a7 = (p.h[7] || 0), a14 = (p.h[14] || 0);
console.log(`Páramo: vecinos a 7 m ${a7}, a 14 m ${a14}`);
check('Páramo: la fila de detrás (14 m) ya casi no entra (< 10 % de la de 7 m; antes 1.414 contra 1.452)', a14 < 0.1 * a7, a14);
check('Páramo: la fila contigua (7 m) sigue entrando', a7 > 1000, a7);
check('el total de la capa es la media del mayor por instante', p.tot.every(t => Math.abs(t.nuestro - t.capa) < 1e-6),
      JSON.stringify(p.tot.map(t => [+t.nuestro.toFixed(3), +t.capa.toFixed(3)])));
check('y no pasa de la suma de vecinos', p.tot.every(t => t.capa <= t.suma + 1e-9));
await P.ctx.close();

const E = await abre('elburgo');
const e = await E.pg.evaluate(() => { let n = 0, lejos = 0; for (let i = 0; i < TRK.length; i++) for (const v of afbtVecinos(i)) { n++; if (Math.abs(Math.abs(v.dx) - 12) > 1) lejos++; } return { n, lejos }; });
check('El Burgo: ningún vecino de la fila contigua se pierde (1.070)', e.n === 1070, e.n);
await E.ctx.close();

check('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`\n${ok} OK · ${ko} FAIL`);
await b.close();
process.exit(ko ? 1 : 0);
