/* LA SOMBRA CAMBIA EN UN MINUTO · ¿qué capa del render cambia entre 12:40 y 12:41?
 *   node audit_minuto/N1_pixeles.mjs
 * Mismo estado (estado_mancha.json), cámara fija sobre la fila 5, dos minutos.
 * Se lee el framebuffer de los dos y se cuentan los píxeles que cambian de brillo
 * (> 25 niveles) sobre las PALAS (el rayo de cada píxel toca el vidrio 0x16305e).
 * Luego lo mismo con el MAPA DE SOMBRAS de WebGL apagado (renderer.shadowMap):
 * si la diferencia desaparece, la «sombra que cambia» es la del shadow-map
 * —la del render, no la del contador— y no la silueta ni el haz.
 * CONTROL: dos renders del MISMO minuto dan 0 píxeles distintos (el render es
 * determinista; si no, la comparación no vale).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUERTO = process.env.PUERTO || 8124;
const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8'));
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function' && TD, null, { timeout: 180000 });
await pg.evaluate(d => cargaConfig(d), est);
const CAMS = { general: null, fila5: [[30, 9, 18], [24, 2.5, 0]], fila5_cerca: [[27, 5, 8], [24, 2.6, 0]] };
const res = {};
for (const [nc, cam] of Object.entries(CAMS)) {
  res[nc] = await pg.evaluate(async cam => {
    if (cam) { TD.camera.position.fromArray(cam[0]); TD.controls.target.fromArray(cam[1]); TD.controls.update(); }
    const pon = async (min) => { const s = $('hour'); s.value = min; s.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 300)); update3D(); TD.renderer.render(TD.scene, TD.camera); };
    const lee = () => { const gl = TD.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return { W, H, px }; };
    const sobrePala = (W, H, x, y) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(2 * x / W - 1, 2 * y / H - 1), TD.camera);
      const h = rc.intersectObject(TD.scene, true).find(q => q.object.visible && q.object.isMesh); return h && h.object.material && h.object.material.color && h.object.material.color.getHex() === 0x16305e; };
    const compara = (A, B) => { let n = 0, nPala = 0, muestras = 0;
      for (let y = 0; y < A.H; y += 2) for (let x = 0; x < A.W; x += 2) { const i = 4 * (y * A.W + x);
        const la = A.px[i] + A.px[i + 1] + A.px[i + 2], lb = B.px[i] + B.px[i + 1] + B.px[i + 2];
        if (Math.abs(la - lb) > 75) { n++; if (muestras < 400) { muestras++; if (sobrePala(A.W, A.H, x, y)) nPala++; } } }
      return { distintos: n, de_ellos_sobre_pala_en_400_muestras: nPala }; };
    const out = {};
    for (const sm of [true, false]) {
      TD.renderer.shadowMap.enabled = sm; TD.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      await pon(760); const A = lee(); await pon(760); const A2 = lee(); await pon(761); const B = lee();
      out[sm ? 'con_shadowmap' : 'sin_shadowmap'] = { control_mismo_minuto: compara(A, A2).distintos, entre_1240_y_1241: compara(A, B) };
    }
    TD.renderer.shadowMap.enabled = true; TD.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    return out;
  }, cam);
  for (const min of [760, 761]) {
    await pg.evaluate(async ([cam, min]) => { if (cam) { TD.camera.position.fromArray(cam[0]); TD.controls.target.fromArray(cam[1]); TD.controls.update(); }
      const s = $('hour'); s.value = min; s.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 300)); update3D(); }, [cam, min]);
    await pg.waitForTimeout(600);
    await pg.locator('#view3d').screenshot({ path: path.join(ROOT, `audit_minuto/out/N1_${nc}_${min === 760 ? '1240' : '1241'}.png`) });
  }
  console.log(`${nc}: ${JSON.stringify(res[nc])}`);
}
fs.writeFileSync(path.join(ROOT, 'audit_minuto/out/N1_pixeles.json'), JSON.stringify(res, null, 1));
await b.close();
