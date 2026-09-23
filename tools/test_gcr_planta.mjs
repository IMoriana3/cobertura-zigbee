/* EL GCR DE CADA PLANTA: longitud del módulo / pitch.
 *
 * El backtracking de la animación (simBtAngle, la que se ve con «BT» activo)
 * usaba GCR 0,40 en todas las plantas: El Burgo redondeado (2,382 / 6 = 0,397).
 * En Bagnarelli (pitch 5,5 m, GCR 0,433) aplanaba de menos y se veía sombra
 * entre filas; en Túnez (6,25 m, 0,376) y Páramo (7 m, 0,340), de más.
 *
 * Se comprueba, por planta:
 *   · que el GCR sale de módulo / pitch (y en Ayora y San José casa con el gcr
 *     de su levantamiento);
 *   · que, donde el terreno sale llano, el recorte de la animación es el que hace falta:
 *     el de afbtDeficit con el vecino del lado del sol, validado con rayos en
 *     test_afbt_rayos.mjs. Sin sesgo (< 0,5°).
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_gcr_planta.mjs
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
/* módulo / pitch medidos en el layout (pitch = distancia entre ejes de filas contiguas) */
const ESPERA = { elburgo: 2.382 / 6.0, fayon: 2.411 / 6.0, ayora: 2.384 / 6.0, sanjose: 2.382 / 6.2,
                 tunez: 2.35 / 6.25, bagnarelli: 2.382 / 5.5, paramo: 2.382 / 7.0 };
for (const [planta, esp] of Object.entries(ESPERA)) {
  const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errores.push(planta + ': ' + e)); const t0 = Date.now();
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${planta}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  while (!(await pg.evaluate(() => typeof simBtAngle === 'function' && TRK.length > 0 && PICK.length === TRK.length))) {
    if (Date.now() - t0 > 300000) throw new Error(planta + ': la página no cargó'); await pg.waitForTimeout(500); }
  const r = await pg.evaluate(() => {
    const doys = [15, 105, 196, 288], d0 = simDoy, DEG = Math.PI / 180; let s = 0, a = 0, n = 0;
    const idx = []; for (let i = 0; i < TRK.length; i += Math.max(1, Math.floor(TRK.length / 25))) idx.push(i);
    for (const i of idx) { const A = TRK[i], vs = afbtVecinos(i);
      for (const doy of doys) { simDoy = doy; for (let m = 300; m <= 1260; m += 15) { const sv = sunVec(m); if (sv.U <= 0.05) continue;
        const R = trueTrack(m, A.rot || 0), lado = R < 0 ? 'E' : 'O';
        let req = 0, hay = false; for (const v of vs) { if (v.lado !== lado || afbtSolape(v, sv, 'me') <= 0.5) continue; hay = true;
          req = Math.max(req, afbtDeficit(A, TRK[v.j], v.lado, sv, v.gap)); }
        if (!hay) continue;                                     // sin vecino enfrentado de ese lado (borde): no hay nada que comparar
        const rec = Math.abs(Math.max(-55, Math.min(55, R / DEG))) - Math.abs(simBtAngle(m, A.rot || 0));
        s += rec - req; a += Math.abs(rec - req); n++; } } }
    simDoy = d0;
    const llano = TRK.every(t => t.relN === t.relS && t.relE === t.relW);
    return { llano, gcr: SIM_GCR, cotas: (typeof COTAS !== 'undefined' && COTAS && COTAS.gcr) || null, sesgo: s / n, mae: a / n, n };
  });
  console.log(`${planta.padEnd(10)} GCR ${r.gcr.toFixed(3)} (módulo/pitch ${esp.toFixed(3)}${r.cotas ? ', levantamiento ' + r.cotas : ''}) · recorte BT de la animación − necesario: sesgo ${r.sesgo.toFixed(2)}°, error medio ${r.mae.toFixed(2)}° (${r.n})`);
  check(`${planta}: GCR = módulo / pitch`, Math.abs(r.gcr - esp) < 0.004, r.gcr.toFixed(4));
  if (r.cotas) check(`${planta}: casa con el gcr del levantamiento`, Math.abs(r.gcr - r.cotas) < 0.005, `${r.gcr.toFixed(4)} vs ${r.cotas}`);
  /* El BT de la animación es el de terreno llano: solo se le puede exigir donde el terreno sale llano
     (sin red, las plantas sin relieve propio). Ayora y San José traen el suyo; con relieve manda BT3D. */
  if (r.llano) check(`${planta}: el BT de la animación aplana lo que hace falta (|sesgo| < 0,5°)`, Math.abs(r.sesgo) < 0.5, r.sesgo.toFixed(2) + '°');
  await ctx.close();
}
check('sin errores de página', errores.length === 0, errores.join(' | '));
console.log(`\n${ok} OK · ${ko} FAIL`);
await b.close();
process.exit(ko ? 1 : 0);
