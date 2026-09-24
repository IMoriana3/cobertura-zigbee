/* LA MANCHA EN EL AIRE · ¿dónde está cada pieza roja respecto a SU pala?
 *   node audit_mancha/M2_geometria.mjs [--drive=bifila|mono]
 * Para cada silueta (malla de `ovM_sil`, hija de la pegatina `ovls[k].g` de una
 * pala): sus vértices en el marco LOCAL de la pala (spin) contra la caja del
 * VIDRIO de esa misma pala en ese marco. Dentro = la sombra está sobre el
 * módulo; fuera = pintada donde no hay módulo. Y para cada pala: su vidrio en
 * el mundo contra el terreno bajo él y contra las palas vecinas.
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
  const out = { filas: [], siluetas: [] };
  TD.rows.forEach((row, r) => row.spins.forEach((sp, k) => {
    const inv = new THREE.Matrix4().copy(sp.matrixWorld).invert();
    const bbL = new THREE.Box3(), bbW = new THREE.Box3();
    sp.traverse(m => { if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0x16305e) {
      const pos = m.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i); bbW.expandByPoint(v.clone().applyMatrix4(m.matrixWorld)); bbL.expandByPoint(v.applyMatrix4(M)); }
    } });
    /* terreno bajo el vidrio: en 9 puntos a lo largo del eje, por el centro de la pala */
    const cW = bbW.getCenter(new THREE.Vector3());
    let gapMin = Infinity; for (let j = 0; j <= 8; j++) { const z = bbW.min.z + (bbW.max.z - bbW.min.z) * j / 8; const yT = TD.terrY(cW.x, -z); gapMin = Math.min(gapMin, bbW.min.y - yT); }
    out.filas.push({ fila: r + 1, mesa: k + 1, vidrio_local: [bbL.min.toArray(), bbL.max.toArray()].map(a => a.map(x => +x.toFixed(3))),
      vidrio_mundo: [bbW.min.toArray(), bbW.max.toArray()].map(a => a.map(x => +x.toFixed(2))), hueco_min_al_terreno: +gapMin.toFixed(2) });
    const ov = row.ovls[k];
    if (ov && ov.g) ov.g.children.forEach(m => {
      if (!m.isMesh || !m.material || m.material.color.getHex() !== 0xe34948 || m.material.opacity < 0.5) return;
      const pos = m.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      let fuera = 0, dmax = 0, n = pos.count, yRel = [];
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M);
        const dx = Math.max(bbL.min.x - v.x, 0, v.x - bbL.max.x), dz = Math.max(bbL.min.z - v.z, 0, v.z - bbL.max.z);
        const d = Math.hypot(dx, dz); if (d > 0.02) fuera++; dmax = Math.max(dmax, d); yRel.push(v.y - bbL.max.y);
      }
      out.siluetas.push({ fila: r + 1, mesa: k + 1, vertices: n, fuera_del_vidrio: fuera, dist_max_m: +dmax.toFixed(2), sobre_vidrio_m: +Math.max(...yRel).toFixed(3) });
    });
  }));
  return out;
});
console.log(`accionamiento ${DRIVE}`);
for (const f of R.filas) console.log(`  fila ${f.fila} mesa ${f.mesa} · vidrio local x[${f.vidrio_local[0][0]}, ${f.vidrio_local[1][0]}] z[${f.vidrio_local[0][2]}, ${f.vidrio_local[1][2]}] · mundo y[${f.vidrio_mundo[0][1]}, ${f.vidrio_mundo[1][1]}] · hueco mín al terreno ${f.hueco_min_al_terreno} m`);
const malas = R.siluetas.filter(s => s.fuera_del_vidrio > 0);
console.log(`SILUETAS: ${R.siluetas.length} · con vértices FUERA del vidrio de su pala (> 2 cm): ${malas.length}`);
for (const s of malas) console.log(`  fila ${s.fila} mesa ${s.mesa} · ${s.fuera_del_vidrio}/${s.vertices} vértices fuera · hasta ${s.dist_max_m} m`);
fs.writeFileSync(path.join(ROOT, `audit_mancha/out/M2_${DRIVE}.json`), JSON.stringify(R, null, 1));
await b.close();
