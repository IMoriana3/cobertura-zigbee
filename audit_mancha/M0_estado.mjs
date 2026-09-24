/* LA MANCHA EN EL AIRE · el estado del titular, como FICHERO (B.1).
 *
 *   node audit_mancha/M0_estado.mjs      → audit_mancha/estado_mancha.json
 *
 * Los valores son los de su mensaje (2026-09-24), escritos en los mandos tal
 * cual; el preset de terreno se APLICA (las cotas salen de `applyPreset`, que
 * es lo que hace el botón) y el fichero es la exportación de la página. A
 * partir de aquí cualquiera reproduce el estado con «⤒ cargar».
 * Lo que su mensaje NO fijaba era el perfil N-S: el HUD decía «tilt N-S 1,5°,
 * rígida: medio del grupo», que es el MEDIO de la pareja de la fila 5. Se buscó
 * (audit_mancha/M0_busca.mjs): de los 5 perfiles × valores −6…6 en pasos de
 * 0,5, tres dan 1,5° en ese grupo (constante 1,5 · quebrado −1,5 · senoidal 3),
 * y con terreno aplicado o sin aplicar son 6 estados; UNO SOLO reproduce su HUD
 * entero (θ fila 5 −3,0° · máx planta 90,8 % · POA 33 · luz 76 % · residual
 * −2001 mm): «Senoidal», valor 3, terreno aplicado. Es el que se fija aquí.
 * El resto, de fábrica y declarado: inteligencia «sin filtro», políticas de
 * fábrica con `pairwise` en la escena, capas del 3D de fábrica (rayo y haz
 * ENCENDIDOS), sin manual.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUERTO = process.env.PUERTO || 8124;
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof exportaConfig === 'function', null, { timeout: 180000 });
const d = await pg.evaluate(async () => {
  const set = (id, v) => { $(id).value = v; };
  set('plant', ''); set('lat', 42.32059); set('lon', -5.59981); set('date', '2026-06-21'); set('date2', '2026-06-21'); set('tz', 2); set('alt', 1563);
  set('albedo', 0.2); set('tl', 3.5); set('cloud', 0);
  set('pitch', 6); set('cw', 2.382); set('maxang', 55); set('nrows', 8); set('axaz', 0); set('z0', 0.17); set('nbp', 2); set('iam', 0.05);
  set('tcucfg', 'levantamiento'); set('drive', 'bifila'); set('nspreset', 'senoidal'); set('axtilt', 3);
  set('nsl', 'alineadas'); set('ntrk', 1); set('mods', 28);
  set('tpreset', 'ondulado'); tparamLabel(); set('tparam', 1.2); applyPreset();
  const p = esperaCalculo(); recompute(); await p;
  set('polview', 'pairwise'); set('hour', 21 * 60 + 5); $('hourlbl').textContent = hhmm(21 * 60 + 5); set('rowsel', 4);
  drawScene(); update3D();
  return exportaConfig();
});
fs.writeFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), JSON.stringify(d, null, 1) + '\n');
console.log(`estado_mancha.json · ${d.ver} · hash ${d.hash}`);
await b.close();
