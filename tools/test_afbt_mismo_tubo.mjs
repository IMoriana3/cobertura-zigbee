/* AFECCIÓN BT: EL DEL MISMO TUBO NO SOMBREA LOS MÓDULOS.
 *
 * El cliente eligió un tracker, la capa le dijo que el del NORTE (el de detrás
 * en el mismo tubo) le obligaba a recortar, y en el 3D no había sombra ni el
 * 21/6 ni el 21/12. Dos seguidores en el mismo eje, a la misma altura y con el
 * mismo ángulo son coplanares: la sombra de uno cae en el hueco y en el suelo,
 * nunca en los módulos del otro, y aplanarse no cambia nada. Se comprueba que
 * esos vecinos ya no entran, y que los de la fila de al lado siguen entrando.
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_afbt_mismo_tubo.mjs elburgo
 */
import { chromium } from 'playwright-core';
import { EXE, navegador } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const b = await navegador(chromium, { executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage(); const t0 = Date.now(), errores = [];
pg.on('pageerror', e => errores.push(String(e)));
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${process.argv[2] || 'elburgo'}`,
              { waitUntil: 'domcontentloaded', timeout: 120000 });
while (!(await pg.evaluate(() => typeof afbtVecinos === 'function' && TRK.length > 0))) {
  if (Date.now() - t0 > 300000) throw new Error('la página no cargó los seguidores');
  await pg.waitForTimeout(400);
}

const r = await pg.evaluate(() => {
  /* trackers que SÍ tienen a alguien delante o detrás en su mismo tubo */
  const conLinea = [];
  for (let i = 0; i < TRK.length && conLinea.length < 25; i++) {
    for (let j = 0; j < TRK.length; j++) { if (j === i) continue;
      const lc = afbtLoc(TRK[i], TRK[j]);
      const hu = Math.abs(lc[1]) - ((TRK[i].span || TC.span) + (TRK[j].span || TC.span)) / 2;
      if (Math.abs(lc[0]) < 3 && hu >= 0 && hu < 60) { conLinea.push(i); break; } } }
  let enTubo = 0, lados = 0, malos = 0;
  const ws = [], ano = [];
  for (const i of conLinea) {
    const vs = afbtVecinos(i);
    for (const v of vs) { if (Math.abs(afbtLoc(TRK[i], TRK[v.j])[0]) < 3) enTubo++; else lados++; }
    afbtMode = 'ano';
    for (const x of afbtAgg(i)) { if (!isFinite(x.me) || !isFinite(x.yo)) malos++; if (x.lado !== 'E' && x.lado !== 'O') ws.push(x.lado); ano.push(x.me); }
  }
  return { n: conLinea.length, enTubo, lados, malos, ws, maxAno: Math.max(0, ...ano) };
});
check('hay trackers con vecino en el mismo tubo para probar', r.n > 0, r.n);
check('ningún vecino del mismo tubo entra en la afección', r.enTubo === 0, r.enTubo);
check('los de la fila de al lado siguen entrando', r.lados > 0, r.lados);
check('solo lados E/O en el agregado', r.ws.length === 0, r.ws.join(','));
check('recortes finitos', r.malos === 0, r.malos);
check('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`\n${ok} OK · ${ko} FAIL  (${r.n} trackers, ${r.lados} vecinos laterales, máx. anual ${r.maxAno.toFixed(2)}°/med)`);
await b.close();
process.exit(ko ? 1 : 0);
