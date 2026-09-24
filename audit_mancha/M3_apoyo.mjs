/* LA MANCHA EN EL AIRE · ¿cada pala se apoya en su estructura?
 *   node audit_mancha/M3_apoyo.mjs [--drive=bifila|mono]
 * Para cada pala (spin): la cota de su EJE (el origen del spin, que es el tubo)
 * en las posiciones axiales de SUS postes, contra la cabeza de esos postes
 * (mallas CylinderGeometry r = 0,06 m colgadas de `world` en x = xof(r)), y
 * contra el terreno. Y el tilt N-S de la pala dibujada contra el de la física
 * (`DAY.T.rowTilt`) y contra el terreno bajo la fila.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const PUERTO = process.env.PUERTO || 8124, DRIVE = arg('drive', 'bifila');
const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8'));
est.config.accionamiento = DRIVE;
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function' && TD, null, { timeout: 180000 });
est.hash = await pg.evaluate(C => hashConfig(C), est.config);
await pg.evaluate(d => cargaConfig(d), est);
const R = await pg.evaluate(() => {
  TD.scene.updateMatrixWorld(true);
  const T = DAY.T, raw = nsProfile(cfg());
  const posts = [];
  TD.world.children.forEach(m => { if (m.isMesh && m.geometry && m.geometry.type === 'CylinderGeometry' && Math.abs(m.geometry.parameters.radiusTop - 0.06) < 1e-9)
    posts.push({ x: m.position.x, z: m.position.z, top: m.position.y + 0.05 + m.geometry.parameters.height / 2, bot: m.position.y + 0.05 - m.geometry.parameters.height / 2 }); });
  const out = [];
  TD.rows.forEach((row, r) => row.spins.forEach((sp, k) => {
    const tg = sp.parent && sp.parent.parent && sp.parent.parent.parent;   // spin < yaw < tiltG (modelo)
    const eje = s => new THREE.Vector3(s, 0, 0).applyMatrix4(sp.matrixWorld);   // el tubo: +X local del spin
    const a = eje(-20), c = eje(20);
    const tiltDib = Math.atan2(c.y - a.y, Math.hypot(c.x - a.x, c.z - a.z)) * 180 / Math.PI;
    const mis = posts.filter(p => Math.abs(p.x - a.x) < 0.3);
    const apoyo = mis.map(p => {
      /* punto del eje con la misma z que el poste */
      const s = -20 + 40 * (p.z - a.z) / ((c.z - a.z) || 1), E = eje(s);
      return { norte: +(-p.z).toFixed(1), cabeza_poste: +p.top.toFixed(2), eje: +E.y.toFixed(2), eje_menos_cabeza: +(E.y - p.top).toFixed(2), terreno: +TD.terrY(p.x, -p.z).toFixed(2), pie: +p.bot.toFixed(2) };
    });
    out.push({ fila: r + 1, mesa: k + 1, tilt_dibujado: +tiltDib.toFixed(2), tilt_fisica: T.rowTilt ? +T.rowTilt[r].toFixed(2) : null, tilt_terreno: +raw[r].toFixed(2),
      cota_fisica: +ELEV[r].toFixed(2), tiltG_y: tg ? +tg.position.y.toFixed(2) : null, apoyo });
  }));
  return { out, segZ: !!T.segZ, rotula: !!T.rotula, grupos: T.groups };
});
console.log(`accionamiento ${DRIVE} · T.segZ ${R.segZ} · rótula ${R.rotula} · grupos ${JSON.stringify(R.grupos)}`);
for (const f of R.out) {
  console.log(`  fila ${f.fila}: cota ${f.cota_fisica} · tilt N-S dibujado ${f.tilt_dibujado}° · física ${f.tilt_fisica}° · terreno ${f.tilt_terreno}°`);
  for (const p of f.apoyo) console.log(`     poste norte ${p.norte}: pie ${p.pie} (terreno ${p.terreno}) · cabeza ${p.cabeza_poste} · eje ${p.eje} · eje−cabeza ${p.eje_menos_cabeza} m`);
}
fs.writeFileSync(path.join(ROOT, `audit_mancha/out/M3_${DRIVE}.json`), JSON.stringify(R, null, 1));
await b.close();
