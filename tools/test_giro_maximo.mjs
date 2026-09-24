/* EL MOTOR NO GIRA MÁS DE LO QUE PUEDE (v1.79.0), EN CHROMIUM (backtracking.html).
 *
 *   node tools/test_giro_maximo.mjs            (levanta su propio servidor)
 *
 * Reportado por el titular: con «Óptimo libre», a las 22:04 la fila 5 estaba a
 * 56,0° («consigna de las 22:00») y a las 22:05 a 5,0°. Son 51° en un minuto
 * con un actuador de 0,17 °/s (10,2°/min), y 56° con un tope de 55°. Medido en
 * la planta por defecto, 21/06 y 21/12, las nueve políticas, había TRES causas:
 *   1 · la ESCENA: optimal/optfree mantenían la muestra de 5 min y saltaban en el
 *       último minuto; las demás iban hacia la consigna del MINUTO mientras la
 *       malla llega a la del final del paso, y al ponerse el sol eso da −55 → −4,45°
 *       en un minuto. El comentario de `consignaEscena` decía que la escena
 *       interpolaba; `sceneInstant` no la usaba;
 *   2 · la MALLA: `topeBacktracking`, aplicado DESPUÉS del lazo, podía devolver el
 *       mando crudo de la política (optfree: 69,3° en 5 min, 3 pasos al día);
 *   3 · el LAZO aparcaba en consigna + banda muerta sin tope mecánico: 56° con
 *       θmáx 55° en las nueve (136-640 muestras·fila al día).
 *
 * Comprobaciones, por día y por política, en la MALLA publicada (por línea y,
 * si hay, por mesa) y en la ESCENA minuto a minuto (la que se dibuja y la que
 * alimenta el HUD):
 *   · ningún paso de 5 min gira más de TRACKER_SLEW·300 s;
 *   · ningún minuto de la escena gira más de TRACKER_SLEW·60 s;
 *   · ningún ángulo pasa de ±θmáx.
 * CONTROL: el detector se prueba contra una serie fabricada con un salto de 11°
 * en un minuto y otra con 55,5°; si no las ve, el banco no protege nada.
 * El código anterior a v1.79.0 lo pone rojo (medido: ver el PR).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PUERTO || 8133;
const FECHAS = ['2026-06-21', '2026-12-21'];
let ok = 0, ko = 0;
const t = (n, c, extra) => { if (c) { ok++; console.log('  ✓ ' + n + (extra ? '   ' + extra : '')); } else { ko++; console.error('  ✗ ' + n + (extra ? ' — ' + extra : '')); } };

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const quieto = pg => pg.waitForFunction(() => { const e = document.getElementById('calcbusy'); return DAY && DAY.pol && (!e || e.style.display === 'none'); }, null, { timeout: 1800000 });
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });

  /* el detector, en la página, para que mida con la misma aritmética */
  await pg.evaluate(() => {
    window.__giro = (series, lim) => {           // series: [[θ por fila] | null, …] → {n, saltos, peor, i}
      let n = 0, saltos = 0, peor = 0, i = -1, prev = null;
      series.forEach((a, k) => { if (!a) { prev = null; return; }
        if (prev) { n++; let d = 0; a.forEach((v, r) => { d = Math.max(d, Math.abs(v - prev[r])); }); if (d > lim + 1e-6) saltos++; if (d > peor) { peor = d; i = k; } }
        prev = a; });
      return { n, saltos, peor, i };
    };
    window.__tope = (series, mx) => { let n = 0, peor = 0; for (const a of series) if (a) for (const v of a) { const x = Math.abs(v) - mx; if (x > 1e-9) { n++; peor = Math.max(peor, x); } } return { n, peor }; };
  });
  const ctl = await pg.evaluate(() => ({ salto: __giro([[0], [5], [16]], TRACKER_SLEW * 60), tope: __tope([[55], [55.5]], 55) }));
  t('CONTROL · el detector ve un salto de 11° en un minuto', ctl.salto.saltos === 1 && Math.abs(ctl.salto.peor - 11) < 1e-9, JSON.stringify(ctl.salto));
  t('CONTROL · y un ángulo 0,5° por encima del tope', ctl.tope.n === 1 && Math.abs(ctl.tope.peor - 0.5) < 1e-9, JSON.stringify(ctl.tope));

  for (const fecha of FECHAS) {
    await pg.evaluate(f => { POLICIES.forEach(P => { P.on = true; }); const d = document.getElementById('date'); d.value = f; d.dispatchEvent(new Event('change')); }, fecha);
    await pg.waitForFunction(f => DAY && DAY.c && DAY.c.date === f && Object.keys(DAY.pol).length === POLICIES.length, fecha, { timeout: 1800000 });
    await quieto(pg);
    const R = await pg.evaluate(() => {
      const L5 = TRACKER_SLEW * STEP_MIN * 60, L1 = TRACKER_SLEW * 60, MX = +DAY.c.maxang, out = {};
      const h = document.getElementById('hour'), pv = document.getElementById('polview'), h0 = h.value, pv0 = pv.value;
      const plano = s => s ? s.flat() : null;
      for (const k of Object.keys(DAY.pol)) {
        const P = DAY.pol[k], esc = [], escS = [];
        pv.value = k;
        for (let m = 0; m < 1440; m++) {
          h.value = String(m); INSTANT = null;
          const inst = sceneInstant(), ti = timeIndex();
          esc.push(inst ? inst.pv.ang[ti] : P.ang[ti]);
          if (P.segAng) escS.push(plano(inst ? (inst.pv.segAng && inst.pv.segAng[ti]) : P.segAng[ti]));
        }
        out[k] = { malla: __giro(P.ang, L5), mallaSeg: P.segAng ? __giro(P.segAng.map(plano), L5) : null,
                   escena: __giro(esc, L1), escenaSeg: P.segAng ? __giro(escS, L1) : null,
                   tope: __tope(P.ang, MX), topeSeg: P.segAng ? __tope(P.segAng.map(plano), MX) : null, topeEsc: __tope(esc, MX) };
      }
      h.value = h0; pv.value = pv0; INSTANT = null;
      return { filas: DAY.T.pairs.length + 1, mx: MX, L5, L1, out };
    });
    console.log(`\n${fecha} · planta por defecto · ${R.filas} filas · θmáx ${R.mx}° · ${R.L5.toFixed(1)}°/5 min · ${R.L1.toFixed(1)}°/min`);
    for (const [k, r] of Object.entries(R.out)) {
      t(`${fecha} · ${k}: la malla no gira más de ${R.L5.toFixed(1)}° en un paso`, r.malla.saltos === 0 && (!r.mallaSeg || r.mallaSeg.saltos === 0),
        `peor ${r.malla.peor.toFixed(2)}° en ${r.malla.n} pasos${r.mallaSeg ? ` · por mesa ${r.mallaSeg.peor.toFixed(2)}°` : ''}`);
      t(`${fecha} · ${k}: la escena no gira más de ${R.L1.toFixed(1)}° en un minuto`, r.escena.saltos === 0 && (!r.escenaSeg || r.escenaSeg.saltos === 0),
        `peor ${r.escena.peor.toFixed(2)}° en ${r.escena.n} minutos${r.escenaSeg ? ` · por mesa ${r.escenaSeg.peor.toFixed(2)}°` : ''}`);
      t(`${fecha} · ${k}: ningún ángulo pasa de ±${R.mx}°`, r.tope.n === 0 && r.topeEsc.n === 0 && (!r.topeSeg || r.topeSeg.n === 0),
        `malla ${r.tope.n} (exceso ${r.tope.peor.toFixed(2)}°) · escena ${r.topeEsc.n}${r.topeSeg ? ` · por mesa ${r.topeSeg.n}` : ''}`);
    }
  }
  t('sin errores de página', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally { await b.close(); srv.kill(); }
console.log(`\n${ok} OK · ${ko} FAIL`);
process.exit(ko ? 1 : 0);
