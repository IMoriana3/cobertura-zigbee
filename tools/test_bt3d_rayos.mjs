/* BT3D CON COTAS MEDIDAS: EL LADO OESTE.
 *
 * El modo BT3D recorta el seguimiento con la fórmula de Anderson & Mikofski
 * (la de pvlib) y los vectores del as-built (cse/cso conservador, ase/aso
 * agresivo). La fórmula quiere la pendiente de la línea de ejes SUBIENDO
 * HACIA EL ESTE a los dos lados. Los vectores no vienen así:
 *   · cse/ase > 0  ⇔ el vecino ESTE está más alto;
 *   · cso/aso > 0  ⇔ el vecino OESTE está más alto.
 * bt3dAng metía cso tal cual, y por la tarde el signo iba al revés: en Ayora,
 * donde el oeste suele estar más alto, faltaba backtracking (sesgo −1,65°);
 * en San José, donde está más bajo, sobraba (+1,35°, 18,5 % de instantes con
 * más de 1° de recorte de más).
 *
 * Se comprueba:
 *   1 · el convenio de los vectores contra las cotas medidas de la pareja;
 *   2 · que el recorte BT3D por la tarde no va sesgado contra el que de verdad
 *       hace falta —el de `afbtDeficit`, contrastado con rayos en
 *       test_afbt_rayos.mjs—, y que se equivoca como mucho lo que la mañana.
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_bt3d_rayos.mjs ayora      (o sanjose)
 */
import { chromium } from 'playwright-core';
import { EXE, navegador } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
const planta = process.argv[2] || 'ayora';
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra != null ? ' -> ' + extra : '')); } };

const b = await navegador(chromium, { executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage(); const t0 = Date.now(), errores = [];
pg.on('pageerror', e => errores.push(String(e)));
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${planta}`,
              { waitUntil: 'domcontentloaded', timeout: 120000 });
while (!(await pg.evaluate(() => typeof bt3dAng === 'function' && TRK.length > 0 && COTAS && TRK.some(t => t.mc)))) {
  if (Date.now() - t0 > 300000) throw new Error('la página no cargó las cotas (¿planta sin levantamiento?)');
  await pg.waitForTimeout(500);
}
/* BT3D solo existe en modo levantamiento (bt3dOn), y es el modo en que la pareja se mide con cotas. */
await pg.evaluate(async () => { const s = $('geosrc'); s.value = 'levantamiento'; s.onchange();
  for (let k = 0; k < 200 && !(GEO === 'levantamiento' && TRK.some(t => usaCotas(t))); k++) await new Promise(r => setTimeout(r, 100)); });

const r = await pg.evaluate(() => {
  const DEG = Math.PI / 180;
  /* 1 · convenio: pendiente medida de la pareja, en %, SUBIENDO HACIA EL VECINO */
  const conv = { e: [], o: [] };
  for (let i = 0; i < TRK.length; i++) { const A = TRK[i]; if (!A.mc) continue;
    for (const v of afbtVecinos(i)) { const B = TRK[v.j]; if (!B.mc || Math.abs(afbtLoc(A, B)[1]) > 5) continue;
      const s = (afbtAlturaFila(B, v.lado === 'E' ? 'O' : 'E') - afbtAlturaFila(A, v.lado)) / v.gap * 100;
      if (v.lado === 'E' && A.mc.cse != null) conv.e.push([A.mc.cse, s]);
      if (v.lado === 'O' && A.mc.cso != null) conv.o.push([A.mc.cso, s]); } }
  const med = (p, f) => { const d = p.map(f).sort((a, b) => a - b); return d[d.length >> 1]; };
  const c = { n: conv.o.length,
    eDir: med(conv.e, x => Math.abs(x[0] - x[1])), eInv: med(conv.e, x => Math.abs(x[0] + x[1])),
    oDir: med(conv.o, x => Math.abs(x[0] - x[1])), oInv: med(conv.o, x => Math.abs(x[0] + x[1])) };

  /* 2 · recorte BT3D (conservador) contra el que hace falta con el vecino del lado del sol */
  const ant = { SUN: window.SUN, bt: btOn, m: BT3D }; BT3D = 'cons';
  const doys = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349], d0 = simDoy;
  const idx = []; for (let i = 0; i < TRK.length; i += Math.max(1, Math.floor(TRK.length / 80))) if (TRK[i].mc) idx.push(i);
  const st = { E: { n: 0, d: 0, ad: 0 }, O: { n: 0, d: 0, ad: 0 } };
  for (const i of idx) { const A = TRK[i], vs = afbtVecinos(i);
    for (const doy of doys) { simDoy = doy;
      for (let m = 300; m <= 1260; m += 15) { const sv0 = sunVec(m); if (sv0.U <= 0.05) continue;
        window.SUN = { _dir: sv0 }; btOn = false; const R = bt3dAng(A); btOn = true; const bt = bt3dAng(A);
        const lado = R < 0 ? 'E' : 'O';
        let req = 0; for (const v of vs) { if (v.lado !== lado || afbtSolape(v, sv0, 'me') <= 0.02) continue;
          req = Math.max(req, afbtDeficit(A, TRK[v.j], v.lado, sv0, v.gap)); }
        const d = (Math.abs(R) - Math.abs(bt)) - req, s = st[lado]; s.n++; s.d += d; s.ad += Math.abs(d); } } }
  simDoy = d0; window.SUN = ant.SUN; btOn = ant.bt; BT3D = ant.m;
  const f = s => ({ sesgo: s.d / s.n, mae: s.ad / s.n });
  return { c, E: f(st.E), O: f(st.O) };
});
const { c, E, O } = r;
console.log(`\n${planta}: convenio (diferencia mediana, pp) · cse contra subida al E ${c.eDir.toFixed(2)} (con signo cambiado ${c.eInv.toFixed(2)})` +
            ` · cso contra subida al O ${c.oDir.toFixed(2)} (con signo cambiado ${c.oInv.toFixed(2)})`);
console.log(`recorte BT3D − necesario · mañana: sesgo ${E.sesgo.toFixed(2)}°, error medio ${E.mae.toFixed(2)}°` +
            ` · tarde: sesgo ${O.sesgo.toFixed(2)}°, error medio ${O.mae.toFixed(2)}°\n`);
check('hay parejas medidas para comprobar el convenio', c.n > 50, c.n);
check('cse/ase > 0 = vecino ESTE más alto', c.eDir < c.eInv);
check('cso/aso > 0 = vecino OESTE más alto', c.oDir < c.oInv);
check('por la tarde el recorte BT3D no va sesgado (|sesgo| < 1°)', Math.abs(O.sesgo) < 1, O.sesgo.toFixed(2) + '°');
check('por la tarde no se equivoca mucho más que por la mañana', O.mae < E.mae + 1.2, `${O.mae.toFixed(2)}° vs ${E.mae.toFixed(2)}°`);
check('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`${ok} OK · ${ko} FAIL`);
await b.close();
process.exit(ko ? 1 : 0);
