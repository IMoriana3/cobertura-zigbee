/* LA MANCHA EN EL AIRE · sonda de la escena (B.2 del encargo del 2026-09-24).
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node audit_mancha/M0_sonda.mjs [--drive=bifila|mono] [--json=RUTA]
 *
 * Reproduce el estado del titular CON EL JSON de configuración (B.1:
 * audit_mancha/estado_mancha.json, cargado con `cargaConfig`), comprueba que el
 * HUD dice lo que decía su captura y RECORRE LA ESCENA 3D: cada malla visible,
 * su material, a qué grupo cuelga (fila/mesa, haz, rayo, terreno…), su caja en
 * el mundo y —para las piezas planas— la normal del plano y el ángulo con el
 * rayo solar. No se clasifica nada por el aspecto: por el objeto y su origen.
 *
 * Salida: tabla de las mallas ROJAS (r ≥ 0,7, g ≤ 0,45: los rojos de la
 * página son 0xe34948 silueta/haz/lomo y 0xf87272 postes irrealizables) y
 * capturas en audit_mancha/out/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const PUERTO = process.env.PUERTO || 8124, DRIVE = arg('drive', 'bifila');
const OUT = path.join(ROOT, 'audit_mancha/out'); fs.mkdirSync(OUT, { recursive: true });
const estado = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8'));
if (DRIVE !== estado.config.accionamiento) {           // 2.5: el mismo estado con otro accionamiento
  estado.config.accionamiento = DRIVE;
}

const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.route('**/server.arcgisonline.com/**', r => r.abort());
const pg = await ctx.newPage();
pg.on('pageerror', e => console.log('  [pageerror] ' + e.message));
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function' && typeof TD !== 'undefined' && TD, null, { timeout: 180000 });
if (DRIVE === estado.config.accionamiento) estado.hash = await pg.evaluate(C => hashConfig(C), estado.config);
const r = await pg.evaluate(d => cargaConfig(d), estado);
console.log(`estado ${estado.hash.slice(0, 16)} · accionamiento ${DRIVE} · carga ok ${r.ok}${r.ok ? '' : ' · difieren ' + r.difieren.join(',')}`);
await pg.waitForTimeout(1500);

const res = await pg.evaluate(() => {
  const hud = [...document.querySelectorAll('#hud .card, #hud > div')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
  const inst = sceneInstant(), tIdx = timeIndex(), g = inst ? inst.g : DAY.sun[tIdx];
  /* el rayo solar en el marco de la ESCENA (x = +x filas, y = arriba, z = −norte) */
  const azR = (g.az - DAY.c.axaz) * Math.PI / 180, el = elFisica(g) * Math.PI / 180;
  const sol = new THREE.Vector3(Math.sin(azR) * Math.cos(el), Math.sin(el), -Math.cos(azR) * Math.cos(el));
  /* etiqueta de pertenencia: sube por los padres hasta un grupo conocido */
  const etiquetas = new Map();
  if (TD.hazGrp) etiquetas.set(TD.hazGrp, 'hazGrp (HAZ DE SOMBRA de la fila elegida)');
  if (TD.rayGrp) etiquetas.set(TD.rayGrp, 'rayGrp (RAYO CRÍTICO)');
  TD.rows.forEach((row, rr) => row.ovls.forEach((ov, k) => { if (ov.g) etiquetas.set(ov.g, `fila ${rr + 1} · mesa ${k + 1} · pegatina (ovls[${k}].g)`); }));
  TD.rows.forEach((row, rr) => row.spins.forEach((sp, k) => { if (!etiquetas.has(sp)) etiquetas.set(sp, `fila ${rr + 1} · mesa ${k + 1} · pala (spin)`); }));
  const quien = o => { const cad = []; for (let q = o; q; q = q.parent) { if (etiquetas.has(q)) return etiquetas.get(q); cad.push(q.type + (q.name ? ':' + q.name : '')); } return 'sin grupo conocido · ' + cad.slice(0, 4).join(' < '); };
  const rojas = [];
  TD.scene.updateMatrixWorld(true);
  TD.scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    for (let q = o.parent; q; q = q.parent) if (!q.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || !m.color) return;
    const c = m.color;
    if (!(c.r >= 0.7 && c.g <= 0.45 && c.b <= 0.5)) return;
    const bb = new THREE.Box3().setFromObject(o);
    /* plano de la pieza: normal por la cara de mayor área (tres vértices del primer triángulo en el mundo) */
    let normal = null, angRayo = null;
    const pos = o.geometry && o.geometry.attributes.position;
    if (pos && pos.count >= 3) {
      const v = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
      const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
      if (n.length() > 1e-9) { n.normalize(); normal = n.toArray().map(x => +x.toFixed(3)); angRayo = +(Math.acos(Math.min(1, Math.abs(n.dot(sol)))) * 180 / Math.PI).toFixed(1); }
    }
    rojas.push({ quien: quien(o), color: '#' + c.getHexString(), opacidad: m.opacity, tri: pos ? pos.count / 3 : 0,
      min: bb.min.toArray().map(x => +x.toFixed(2)), max: bb.max.toArray().map(x => +x.toFixed(2)), normal, ang_normal_rayo: angRayo });
  });
  return { hud, sol: { elev: g.elev, az: g.az, vec: sol.toArray() }, hora: hhmm(+$('hour').value), rojas,
    residual: (() => { const p = DAY.pol[$('polview').value]; return tangentResidualMm(g.zen, g.az, DAY.T, p.ang[tIdx]).map((v, pi) => ({ pareja: pi + 1, mm: +v.toFixed(0), cobertura: axialCoverage(g.zen, g.az, DAY.T, pi) })); })() };
});
console.log(`hora ${res.hora} · sol elev ${res.sol.elev.toFixed(2)}° az ${res.sol.az.toFixed(1)}°`);
console.log('HUD: ' + res.hud.join(' | '));
console.log(`MALLAS ROJAS VISIBLES: ${res.rojas.length}`);
for (const q of res.rojas) console.log(`  ${q.quien} · ${q.color} α${q.opacidad} · ${q.tri} tri · caja [${q.min}]→[${q.max}] · normal ${q.normal} · normal∠rayo ${q.ang_normal_rayo}°`);
console.log('RESIDUAL por pareja (mm, cobertura axial): ' + res.residual.map(x => `${x.pareja}:${x.mm}(${x.cobertura.toFixed(2)})`).join(' '));
await pg.screenshot({ path: path.join(OUT, `M0_${DRIVE}_vista.png`) });
fs.writeFileSync(arg('json', path.join(OUT, `M0_${DRIVE}.json`)), JSON.stringify(res, null, 1));
await b.close();
