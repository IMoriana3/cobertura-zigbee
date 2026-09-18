/* R3 · ¿POR QUÉ EL INDICADOR DICE «BT ON» CON EL SOL A 70° Y SOMBRA CERO?
 *
 * MATERIAL POSTERIOR AL SELLADO de R2. No forma parte del paquete sellado.
 *
 * LA PREGUNTA. En pantalla, 21-jun a las 14:00, sol a 70,5°, GCR 0,340: el
 * indicador dice BT ON y la sombra de planta es 0,0 %. A esa altura de sol y con
 * ese GCR no hay auto-sombra posible, así que el indicador no puede estar
 * diciendo lo que su nombre dice.
 *
 * QUÉ SEPARA ESTA MEDIDA. El predicado del indicador compara las SALIDAS DEL
 * LAZO de la política y de la referencia astronómica. Si los MANDOS CRUDOS
 * (`policyAngles` y `anglesAstro`, antes del lazo) son iguales y lo único que
 * difiere son las salidas, entonces «BT ON» no es backtracking: es la deriva
 * entre dos lazos independientes, cada uno con su memoria y con una banda muerta
 * de 1°, que es el DOBLE del umbral de 0,5° que enciende el indicador.
 *
 * Se imprimen las dos diferencias —de mando y de publicado— para que la
 * distinción no dependa de ninguna interpretación.
 *
 *     node audit2/R3_bt_indicador.mjs
 */
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8811 + (process.pid % 80);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.log('ERR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  // la configuración de la pantalla que planteó la pregunta
  await pg.evaluate(() => {
    const s = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
    s('lat', '42.32059'); s('lon', '-5.59981'); s('tz', '2'); s('alt', '1563');
    s('albedo', '0.20'); s('tl', '3.5'); s('cloud', '0');
    s('pitch', '7.00'); s('cw', '2.382'); s('maxang', '55'); s('nrows', '65');
    s('axaz', '0'); s('z0', '0.17');
    document.getElementById('date').value = '2026-06-21';
    document.getElementById('date').dispatchEvent(new Event('change'));
  });
  await pg.waitForFunction(() => DAY && DAY.pol, null, { timeout: 180000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; },
                           null, { timeout: 300000 });
  await pg.waitForTimeout(500);
  const r = await pg.evaluate(() => {
    const t = Math.round(14 * 60 / STEP_MIN);      // 14:00
    const g = DAY.sun[t], fila = 4;                // «fila 5» de la interfaz
    const c = DAY.c, T = DAY.T, Tcfg = DAY.Tcfg, doy = DAY.doy, irr = DAY.irr[t];
    const cmdPair = policyAngles('pairwise', g.zen, g.az, Tcfg, irr, doy, c.albedo).angles;  // MANDO, sin lazo
    const cmdAstro = anglesAstro(g.zen, g.az, Tcfg);                                          // MANDO, sin lazo
    const pub = DAY.pol.pairwise.ang[t], ref = DAY.astroAng[t];                               // tras el lazo
    let maxCmd = 0, maxPub = 0, nBT = 0;
    for (let i = 0; i < pub.length; i++) {
      maxCmd = Math.max(maxCmd, Math.abs(cmdPair[i] - cmdAstro[i]));
      maxPub = Math.max(maxPub, Math.abs(pub[i] - ref[i]));
      if (Math.abs(pub[i] - ref[i]) > 0.5) nBT++;
    }
    return {
      hora: hhmm(DAY.times[t]), sol: { elev: +g.elev.toFixed(2), az: +g.az.toFixed(1) },
      deadband: DEADBAND_DEG, slew: TRACKER_SLEW, umbralBT: 0.5,
      filas: pub.length, gcr: +T.gcr.toFixed(3),
      fila5: { mandoPairwise: +cmdPair[fila].toFixed(4), mandoAstro: +cmdAstro[fila].toFixed(4),
               difMando: +Math.abs(cmdPair[fila] - cmdAstro[fila]).toFixed(4),
               publicado: +pub[fila].toFixed(4), refAstro: +ref[fila].toFixed(4),
               difPublicado: +Math.abs(pub[fila] - ref[fila]).toFixed(4) },
      planta: { difMandoMax: +maxCmd.toFixed(4), difPublicadoMax: +maxPub.toFixed(4),
                filasPorEncimaDelUmbral: nBT },
      sombraMax: +Math.max(...DAY.pol.pairwise.shade[t]).toFixed(6),
      btIndicador: btActiveAt(t),
    };
  });
  r.commit = sha;
  console.log(JSON.stringify(r, null, 1));
} finally {
  await browser.close();
  srv.kill();
}
