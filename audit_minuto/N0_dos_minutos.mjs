/* LA SOMBRA CAMBIA EN UN MINUTO Y EL HUD NO · sonda (2026-09-24).
 *   node audit_minuto/N0_dos_minutos.mjs
 * Estado: audit_mancha/estado_mancha.json (el de la mancha), 21-jun-2026, `pairwise`,
 * fila 5, a las 12:40 y a las 12:41 (hora local, UTC+2). Se vuelca TODO lo
 * calculado —no la pantalla—: el instante que usa la escena (`sceneInstant()`:
 * null = la malla del día), el θ por fila y por mesa, la sombra por fila y por
 * mesa, la POA por fila y de planta, la luz al suelo, el rótulo del haz, el
 * texto del HUD y las mallas rojas de la escena (silueta `ovM_sil` y haz
 * `ovM_haz`) con su fila y su área.
 * TEST NULO primero: ¿los dos minutos producen estados DISTINTOS?
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
pg.on('pageerror', e => console.log('  [pageerror] ' + e.message));
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function' && TD, null, { timeout: 180000 });
const r0 = await pg.evaluate(d => cargaConfig(d), est);
console.log(`estado ${est.hash.slice(0, 16)} · carga ok ${r0.ok} · ${est.ver}`);
const R = {};
for (const hm of ['12:40', '12:41']) {
  const [h, m] = hm.split(':').map(Number);
  R[hm] = await pg.evaluate(async min => {
    const s = $('hour'); s.value = min; s.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const inst = sceneInstant(), tIdx = timeIndex(), key = $('polview').value;
    const p = inst ? inst.pv : DAY.pol[key], g = inst ? inst.g : DAY.sun[tIdx];
    const sh = p.shade[tIdx];
    const redondea = x => x == null ? null : Array.isArray(x) ? x.map(redondea) : (typeof x === 'number' ? +x.toFixed(6) : x);
    const rojos = [];
    TD.scene.updateMatrixWorld(true);
    TD.rows.forEach((row, rr) => row.ovls.forEach((ov, k) => { if (ov.g) ov.g.children.forEach(mm => { if (mm.isMesh && mm.material && mm.material.color && mm.material.color.getHex() === 0xe34948 && mm.material.opacity > 0.5) rojos.push({ capa: 'silueta', fila: rr + 1, mesa: k + 1, tri: mm.geometry.attributes.position.count / 3 }); }); }));
    if (TD.hazGrp) TD.hazGrp.children.forEach(mm => rojos.push({ capa: 'haz', tri: mm.geometry.attributes.position.count / 3, caja: new THREE.Box3().setFromObject(mm).min.toArray().concat(new THREE.Box3().setFromObject(mm).max.toArray()).map(v => +v.toFixed(2)) }));
    const hud = [...document.querySelectorAll('#hud > div')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
    const lbl = TD.rayGrp ? (TD.rayGrp.children.filter(o => o.isSprite || (o.material && o.material.map)).map(o => o.userData && o.userData.txt).filter(Boolean)) : [];
    return { minuto: min, instante: inst ? 'MINUTO (sceneInstant calcula)' : 'MALLA de 5 min (sceneInstant = null)', tIdx, malla_min: DAY.times[tIdx],
      sol: { elev: +g.elev.toFixed(4), az: +g.az.toFixed(4) }, irr: inst ? { ghi: +inst.irr.ghi.toFixed(2), dni: +inst.irr.dni.toFixed(2) } : (DAY.irr ? { ghi: +DAY.irr[tIdx].ghi.toFixed(2), dni: +DAY.irr[tIdx].dni.toFixed(2) } : null),
      theta_fila: redondea(p.ang[tIdx]), theta_mesa: redondea(p.segAng ? p.segAng[tIdx] : null), sombra_fila: redondea([...(sh || [])]), sombra_mesa: redondea(sh && sh.seg),
      poa_fila: redondea(p.poaR[tIdx]), poa_planta: +(+p.poaP[tIdx]).toFixed(4), rayo: TD.lastRay ? { borde: TD.lastRay.edge.toArray().map(v => +v.toFixed(3)), impacto: TD.lastRay.hit.toArray().map(v => +v.toFixed(3)) } : null,
      hud, rojos, bt: $('btflag').textContent };
  }, h * 60 + m);
}
const A = R['12:40'], B = R['12:41'];
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log(`TEST NULO · ¿los dos minutos dan estados distintos? sol ${igual(A.sol, B.sol) ? 'IGUAL' : 'distinto'} · θ por fila ${igual(A.theta_fila, B.theta_fila) ? 'IGUAL' : 'distinto'} · sombra ${igual(A.sombra_fila, B.sombra_fila) ? 'IGUAL' : 'distinta'} · POA planta ${igual(A.poa_planta, B.poa_planta) ? 'IGUAL' : 'distinta'}`);
for (const k of ['instante', 'tIdx', 'malla_min', 'sol', 'irr', 'theta_fila', 'sombra_fila', 'poa_planta', 'rayo', 'bt'])
  console.log(`  ${k.padEnd(12)} 12:40 ${JSON.stringify(A[k])}\n  ${''.padEnd(12)} 12:41 ${JSON.stringify(B[k])}${igual(A[k], B[k]) ? '   ← IGUAL' : ''}`);
console.log('  HUD 12:40: ' + A.hud.join(' | ') + '\n  HUD 12:41: ' + B.hud.join(' | '));
console.log('  HUD tarjetas iguales: ' + A.hud.filter((x, i) => x === B.hud[i]).length + ' de ' + A.hud.length);
console.log('  ROJOS 12:40: ' + JSON.stringify(A.rojos) + '\n  ROJOS 12:41: ' + JSON.stringify(B.rojos));
fs.writeFileSync(path.join(ROOT, 'audit_minuto/out/N0_dos_minutos.json'), JSON.stringify(R, null, 1));
await b.close();
