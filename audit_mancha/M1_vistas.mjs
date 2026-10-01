/* LA MANCHA EN EL AIRE · capturas del 3D desde varias cámaras, con el estado
 * del titular cargado desde audit_mancha/estado_mancha.json.
 *   node audit_mancha/M1_vistas.mjs [--drive=bifila|mono] [--capas=fabrica|sin_haz|sin_rayo|nada]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const PUERTO = process.env.PUERTO || 8124, DRIVE = arg('drive', 'bifila'), CAPAS = arg('capas', 'fabrica');
const OUT = path.join(ROOT, 'audit_mancha/out'); fs.mkdirSync(OUT, { recursive: true });
const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8'));
est.config.accionamiento = DRIVE;
if (CAPAS === 'sin_haz' || CAPAS === 'nada') est.vista.capas.haz = false;
if (CAPAS === 'sin_rayo' || CAPAS === 'nada') est.vista.capas.rayo = false;
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function' && TD, null, { timeout: 180000 });
est.hash = await pg.evaluate(C => hashConfig(C), est.config);
const r = await pg.evaluate(d => cargaConfig(d), est);
console.log(`carga ok ${r.ok} · ${DRIVE} · capas ${CAPAS}`);
const CAMS = {
  general: null,                                             // la de la página
  sur_bajo: { pos: [21, 3.0, 45], obj: [21, 2.0, 0] },       // desde el sur, a ras, mirando al norte a lo largo de las filas
  oeste_bajo: { pos: [-14, 3.5, 6], obj: [21, 2.0, 0] },     // desde el oeste (el sol está al oeste: 294°)
  este_bajo: { pos: [58, 3.5, 6], obj: [21, 2.0, 0] },
  vano45: { pos: [22, 4.5, 16], obj: [22, 2.0, 0] },        // encima del vano entre filas 4 y 5
};
await pg.evaluate(() => document.getElementById('view3d').scrollIntoView());
for (const [n, c] of Object.entries(CAMS)) {
  if (c) await pg.evaluate(c => { TD.camera.position.fromArray(c.pos); TD.controls.target.fromArray(c.obj); TD.controls.update(); update3D(); }, c);
  await pg.waitForTimeout(1200);
  await pg.locator('#view3d').screenshot({ path: path.join(OUT, `M1_${DRIVE}_${CAPAS}_${n}.png`) });
}
console.log('capturas en audit_mancha/out/M1_' + DRIVE + '_' + CAPAS + '_*.png');
await b.close();
