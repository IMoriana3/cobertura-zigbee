/* LA MANCHA EN EL AIRE · ¿QUÉ OBJETO HAY DETRÁS DE CADA PÍXEL ROJO?
 *   node audit_mancha/M4_pixeles.mjs [--drive=bifila|mono] [--luz=real|plana]
 * No por el material (la luz «real» del ocaso tiñe de rojo lo que no lo es):
 * se lee el framebuffer, se toman los píxeles rojizos (R > 150, R > 1,8·G,
 * R > 1,8·B) y por cada uno se lanza un rayo desde la cámara
 * (THREE.Raycaster sobre TODA la escena) y se anota el PRIMER objeto que toca:
 * a qué grupo pertenece, su material y su altura sobre el terreno en ese punto.
 * Cinco cámaras; la de la página y cuatro a ras del vano.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const PUERTO = process.env.PUERTO || 8124, DRIVE = arg('drive', 'bifila'), LUZ = arg('luz', 'real');
const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8'));
est.config.accionamiento = DRIVE; est.vista.capas.luz = LUZ;
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function' && TD, null, { timeout: 180000 });
est.hash = await pg.evaluate(C => hashConfig(C), est.config);
await pg.evaluate(d => cargaConfig(d), est);
const CAMS = { general: null, sur_bajo: [[21, 3.0, 45], [21, 2.0, 0]], oeste_bajo: [[-14, 3.5, 6], [21, 2.0, 0]], este_bajo: [[58, 3.5, 6], [21, 2.0, 0]], vano45: [[22, 4.5, 16], [22, 2.0, 0]] };
const tot = {};
for (const [n, c] of Object.entries(CAMS)) {
  const r = await pg.evaluate(c => {
    if (c) { TD.camera.position.fromArray(c[0]); TD.controls.target.fromArray(c[1]); TD.controls.update(); }
    update3D(); TD.renderer.render(TD.scene, TD.camera);
    const gl = TD.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const etiqueta = o => {
      for (let q = o; q; q = q.parent) {
        if (q === TD.hazGrp) return 'hazGrp · HAZ DE SOMBRA';
        if (q === TD.rayGrp) return 'rayGrp · RAYO CRÍTICO / HAZ AL SUELO';
        for (let rr = 0; rr < TD.rows.length; rr++) { const row = TD.rows[rr];
          for (let k = 0; k < row.ovls.length; k++) if (row.ovls[k].g === q) return `fila ${rr + 1} · SILUETA (pegatina)`;
          for (let k = 0; k < row.spins.length; k++) if (row.spins[k] === q) return `fila ${rr + 1} · pala (spin)`; }
      }
      if (o.geometry && o.geometry.type === 'CylinderGeometry') return 'poste/eje';
      if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.parent === TD.world) return 'TERRENO';
      return 'otro:' + o.type + ':' + (o.geometry ? o.geometry.type : '');
    };
    const rc = new THREE.Raycaster(), cuenta = {}, ejemplos = {};
    let rojos = 0;
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
      const i = 4 * (y * W + x), R = px[i], G = px[i + 1], B = px[i + 2];
      if (!(R > 150 && R > 1.8 * G && R > 1.8 * B)) continue;
      rojos++;
      rc.setFromCamera(new THREE.Vector2(2 * x / W - 1, 2 * y / H - 1), TD.camera);
      const hit = rc.intersectObject(TD.scene, true).find(h => h.object.visible && h.object.isMesh);
      const et = hit ? etiqueta(hit.object) + (hit.object.material && hit.object.material.color ? ' #' + hit.object.material.color.getHexString() : '') : 'NADA (cielo)';
      cuenta[et] = (cuenta[et] || 0) + 1;
      if (hit && !ejemplos[et]) ejemplos[et] = { p: hit.point.toArray().map(v => +v.toFixed(2)), sobre_terreno: +(hit.point.y - TD.terrY(hit.point.x, -hit.point.z)).toFixed(2) };
    }
    return { rojos, cuenta, ejemplos };
  }, c);
  console.log(`${n}: ${r.rojos} píxeles rojizos (muestreo 1 de cada 9)`);
  for (const [k, v] of Object.entries(r.cuenta).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(6)}  ${k}  ej. ${JSON.stringify(r.ejemplos[k] || null)}`);
  for (const [k, v] of Object.entries(r.cuenta)) tot[k] = (tot[k] || 0) + v;
}
fs.writeFileSync(path.join(ROOT, `audit_mancha/out/M4_${DRIVE}_${LUZ}.json`), JSON.stringify(tot, null, 1));
await b.close();
