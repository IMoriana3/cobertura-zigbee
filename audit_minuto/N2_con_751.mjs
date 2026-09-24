/* ¿Desaparece el salto de θ entre 12:40 y 12:41 con la escena de #751 (interpMalla)?
 *   PUERTO_751=… node audit_minuto/N2_con_751.mjs
 * La página de #751 no tiene cargaConfig (B.1 está en #753): el estado se escribe en
 * los mandos con los mismos valores de audit_mancha/estado_mancha.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8')).config;
const out = {};
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
for (const [nom, puerto] of [['v1.80.0 (#753, escena de main)', process.env.PUERTO || 8131], ['v1.79.0 (#751, interpMalla)', process.env.PUERTO_751 || 8132]]) {
  const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  await pg.goto(`http://127.0.0.1:${puerto}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 180000 });
  out[nom] = await pg.evaluate(async C => {
    const set = (id, v) => { $(id).value = v; }, E = C.emplazamiento, G = C.geometria;
    set('lat', E.lat); set('lon', E.lon); set('date', E.fecha); set('tz', E.utc); set('alt', E.altitud); set('albedo', E.albedo); set('tl', E.linke); set('cloud', E.nubosidad);
    set('pitch', G.pitch); set('cw', G.cuerda); set('maxang', G.theta_max); set('nrows', G.filas); set('axaz', G.azimut_eje); set('z0', G.cara_sup_eje); set('nbp', G.nb); set('iam', G.iam_b0);
    set('tcucfg', C.tcu); set('drive', C.accionamiento); set('nspreset', C.perfil_ns.preset); set('axtilt', C.perfil_ns.valor);
    set('nsl', C.implantacion.preset); set('ntrk', C.implantacion.filas_por_linea); set('mods', C.implantacion.modulos_por_ala);
    set('tpreset', C.terreno.preset); set('tparam', C.terreno.parametro); ELEV = C.terreno.cotas.slice();
    recompute();
    await new Promise(r => { const t = setInterval(() => { const e = document.getElementById('calcbusy'); if (DAY && DAY.c && DAY.c.date === E.fecha && (!e || e.style.display === 'none')) { clearInterval(t); r(); } }, 200); });
    await new Promise(r => setTimeout(r, 800));
    set('polview', 'pairwise'); set('rowsel', 4);
    const res = {};
    for (const min of [760, 761, 762, 763, 764, 765]) {
      const s = $('hour'); s.value = min; s.dispatchEvent(new Event('input'));
      const inst = sceneInstant(), tIdx = timeIndex(), p = inst ? inst.pv : DAY.pol.pairwise;
      res[hhmm(min)] = { theta_fila5: +p.ang[tIdx][4].toFixed(3), theta_todas: p.ang[tIdx].map(v => +v.toFixed(2)), cotas_ok: JSON.stringify(ELEV.map(v => +v.toFixed(4))) === JSON.stringify(C.terreno.cotas.map(v => +v.toFixed(4))) };
    }
    return { ver: VER, res };
  }, est);
  await pg.close();
}
for (const [nom, o] of Object.entries(out)) { console.log(`${nom} (${o.ver}):`); for (const [h, r] of Object.entries(o.res)) console.log(`  ${h} · θ fila 5 ${r.theta_fila5}° · todas ${r.theta_todas.join(' ')}${r.cotas_ok ? '' : ' ⚠ cotas'}`); }
fs.writeFileSync(path.join(ROOT, 'audit_minuto/out/N2_con_751.json'), JSON.stringify(out, null, 1));
await b.close();
