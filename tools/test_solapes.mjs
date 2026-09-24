/* NINGÚN SEGUIDOR SE PISA CON EL SIGUIENTE DE SU TUBO.
 *
 * En Ayora los 106 seguidores de bloque anónimo del DWG (*U9 = 1V21, *U10 = 1V14)
 * no traen mods ni mr: su largo sale de LAYOUT.mesa.tipos[blk]. Pero el blk no se
 * copiaba a los nodos, así que se dibujaban de 74,8 m (1V28) y se solapaban 9-18 m
 * con el siguiente del tubo: dos caras en el mismo sitio, y la capa de afección BT
 * (un color por seguidor) salía a rayas rojas y naranjas dentro de un mismo seguidor.
 *
 * Se comprueba, por planta:
 *   · que dos seguidores en la misma línea de tubo no se solapan (> 0,3 m);
 *   · en Ayora, que los *U9/*U10 miden el largo de su bloque;
 *   · que los módulos visibles de cada seguidor caen dentro de su largo.
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_solapes.mjs
 */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';
const PUERTO = process.env.PUERTO || 8124;
const PLANTAS = (process.env.PLANTAS || 'ayora,elburgo,fayon,tunez,bagnarelli,paramo').split(',');
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra != null ? ' -> ' + extra : '')); } };
const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const errores = [];
for (const planta of PLANTAS) {
  const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
  await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errores.push(planta + ': ' + e)); const t0 = Date.now();
  await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${planta}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  while (!(await pg.evaluate(() => typeof updateSpin === 'function' && TRK.length > 0 && PICK.length === TRK.length && SEG))) {
    if (Date.now() - t0 > 300000) throw new Error(planta + ': la página no cargó'); await pg.waitForTimeout(500); }
  const r = await pg.evaluate(() => {
    const span = TC.span, L = t => t.mr * span;
    /* ejes en el marco del tubo (u = a lo largo, v = transversal), por seguidor */
    const P = TRK.map(t => { const c = Math.cos(t.rot || 0), s = Math.sin(t.rot || 0);
      return { u: -t.gz * c + t.gx * s, v: t.gx * c + t.gz * s, L: L(t), id: t.id, rot: t.rot || 0 }; });
    let solapes = 0, peor = 0, ej = '';
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], c = P[j]; if (Math.abs(a.rot - c.rot) > 0.02 || Math.abs(a.v - c.v) > 1.5) continue;
      const sol = (a.L + c.L) / 2 - Math.abs(a.u - c.u); if (sol > 0.3) { solapes++; if (sol > peor) { peor = sol; ej = a.id + ' / ' + c.id; } } }
    /* largo de los de bloque */
    let blkMal = 0, blkN = 0, blkEj = '';
    if (LAYOUT && LAYOUT.mesa) LAYOUT.trackers.forEach((lt, i) => { const tp = lt.blk && LAYOUT.mesa.tipos[lt.blk]; if (!tp) return;
      const t = TRK.find(x => x.id === lt.id); if (!t) return; blkN++;
      if (Math.abs(L(t) - Math.min(span, tp.largo)) > 0.05) { blkMal++; blkEj = t.id + ' ' + L(t).toFixed(2) + ' m vs ' + tp.largo; } });
    /* módulos visibles dentro del largo del seguidor (en su marco: la posición local del instancia) */
    updateSpin(0); const sm = SEG.find(s => s.spin && s.key === 'glass') || SEG.find(s => s.spin && s.key === 'mesa');
    let fuera = 0, chk = 0;
    if (sm) { const M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), p = new THREE.Vector3();
      TRK.forEach((t, i) => { for (let f = 0; f < 2; f++) { Mi.copy(t.fb[f]).invert();
        for (let l = 0; l < sm.n; l++) { sm.im.getMatrixAt((i * 2 + f) * sm.n + l, M); if (Math.abs(M.determinant()) < 1e-12) continue;
          p.setFromMatrixPosition(M).applyMatrix4(Mi); chk++;
          const lon = Math.max(Math.abs(p.x), Math.abs(p.z));      // a lo largo del tubo en el marco de la fila
          if (lon > t.mr * span / 2 + 1.5) fuera++; } } }); }
    return { n: TRK.length, solapes, peor, ej, blkN, blkMal, blkEj, fuera, chk, modKey: sm && sm.key };
  });
  console.log(`${planta.padEnd(10)} ${r.n} seg · solapes ${r.solapes} (peor ${r.peor.toFixed(2)} m ${r.ej}) · de bloque ${r.blkN} (mal ${r.blkMal}) · módulos fuera ${r.fuera}/${r.chk} [${r.modKey}]`);
  check(`${planta}: ningún seguidor se pisa con el siguiente de su tubo`, r.solapes === 0, `${r.solapes}, peor ${r.peor.toFixed(2)} m (${r.ej})`);
  if (r.blkN) check(`${planta}: los de bloque del DWG miden el largo de su bloque`, r.blkMal === 0, r.blkEj);
  check(`${planta}: los módulos visibles caen dentro de su seguidor`, r.chk > 0 && r.fuera === 0, `${r.fuera}/${r.chk}`);
  await ctx.close();
}
check('sin errores de página', errores.length === 0, errores.join(' | '));
await b.close();
console.log(`\n${ok} OK, ${ko} FAIL`); process.exit(ko ? 1 : 0);
