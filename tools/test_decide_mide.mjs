/* R5 FASE A.3 · EL QUE DECIDE Y EL QUE MIDE VEN LA MISMA SOMBRA.
 *
 *   node tools/test_decide_mide.mjs
 *
 * La política `coordinada` (la décima, cerebro NCU) decide desde v1.80.0 con el
 * contador (`decideProyeccion`, backtracking.html), por línea y por mesa. Por la
 * decisión (iii) del titular, `pairwise` y `true3d` siguen siendo LOCALES: la
 * decisión coordinada no cabe bajo contratos escritos para una decisión local.
 * Este banco se pone ROJO si decidir y medir vuelven a separarse:
 *
 *   1 · lo que VE el que decide (`info.sombraDecision`) es, bit a bit, lo que
 *       CUENTA el contador en una llamada aparte con la consigna publicada
 *       (solo planos, sin terreno: lo evitable);
 *   2 · ninguna mesa queda con sombra evitable (> 1e-3) sin que la decisión la
 *       declare irreducible (`info.irreducibles`): la política no publica 0 %
 *       donde el contador ve sombra;
 *   3 · CONTROL NEGATIVO: la decisión VIEJA (vecindad y gemelo, la de v1.78.1:
 *       `applyDriveSeg(anglesPairwiseSeg(...))`) tiene que SUSPENDER la 2 en
 *       Ayora —si no, la 2 no distingue nada—;
 *   4 · las NUEVE políticas de siempre —`pairwise` y `true3d` incluidas— y el
 *       contador por defecto siguen BIT A BIT iguales a los de `origin/main`:
 *       la fase A solo AÑADE la décima;
 *   5 · TEST NULO de la 4: comparar `coordinada` con el `pairwise` de main SÍ
 *       tiene que dar diferencias (si no, la comparación no mira).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, ko = 0;
const t = (n, f) => { try { const m = f(); ok++; console.log('  ✓ ' + n + (m ? ' — ' + m : '')); } catch (e) { ko++; console.log('  ✗ ' + n + ' — ' + e.message); } };
const NOMBRES = ['plantFromCotas', 'policyAngles', 'policyAnglesSeg', 'solarPos', 'clearskyIneichen', 'doyOf', 'shadeBand3DAll', 'mvPara'];
function carga(html, extra = []) {
  const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA');
  const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
  return new Function(sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) + `return {${[...NOMBRES, ...extra].join(',')}};`)();
}
const HOY = carga(fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8'), ['decideProyeccion', 'anglesPairwiseSeg', 'anglesPairwiseRaw', 'anglesTrue3d', 'applyDriveSeg']);
let MAIN = null;
try { MAIN = carga(execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })); }
catch (e) { console.log('  (no se puede leer origin/main: la 4 y la 5 no se hacen) ' + e.message); }

/* ── casos: presets (llano, ondulado bifila, senoidal con torsión) y Ayora real ── */
function preset(n, pitch, elev, tilt, groups) {
  const pairs = []; for (let i = 0; i < n - 1; i++) pairs.push({ slope: Math.atan2(elev[i] - elev[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: (tilt[i] + tilt[i + 1]) / 2 });
  return { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilt, groups, drive: groups ? 'bifila' : 'mono' };
}
const N = 8, G2 = [[0, 1], [2, 3], [4, 5], [6, 7]];
const casos = [
  ['llano monofila', preset(N, 6, new Array(N).fill(0), new Array(N).fill(0), null)],
  ['ondulado 1,2 m bifila', preset(N, 6, [...Array(N)].map((_, i) => 1.2 * Math.sin(2 * Math.PI * i / 4)), new Array(N).fill(1.5), G2)],
  ['senoidal N-S 3° + pendiente 5°', preset(N, 6, [...Array(N)].map((_, i) => -i * 6 * Math.tan(5 * Math.PI / 180)), [...Array(N)].map((_, i) => 3 * Math.sin(2 * Math.PI * i / 4)), null)],
];
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
function terrenoReal(F) {
  const P = F.plantFromCotas(datos, 80, 0), pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) { const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]); pairs.push({ slope: Math.atan2(P.pairDz ? P.pairDz[i] : 0, dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 }); }
  return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: P.tilt, groups: P.drive === 'mono' ? null : P.groups, drive: P.drive, lineX: P.lineX,
    segs: P.segs, segTilt: P.segTilt, segPairs: P.segPairs, segDrive: P.segDrive, segZ: P.segZ, segSide: P.segSide, segMorro: P.segMorro, filaLen: 2 * 28 * 1.146 + 0.55, real: P };
}
const Tay = terrenoReal(HOY);
const SOLES = [[5, 30], [7, 0], [11, 0], [17, 30], [18, 30]];   // UTC, 21-jun, Ayora
const inst = SOLES.map(([h, m]) => { const g = HOY.solarPos(Date.UTC(2026, 5, 21, h, m), lay.clat, lay.clon); return { g, doy: HOY.doyOf('2026-06-21'), irr: HOY.clearskyIneichen(g.zen, 172, datos.base, 3.5) }; });
const sombra = (F, T, zen, az, ang) => F.shadeBand3DAll(zen, az, T, ang, { noStruct: true, noTerr: true, MV: F.mvPara(T, zen) }).seg;
const noPublicaCero = (seg, irreducibles) => { let n = 0; seg.forEach(l => l.forEach(v => { if (v > 1e-3) n++; })); return n <= irreducibles ? null : n; };

console.log('R5 fase A.3 · decidir = medir');
t('1-2 · presets: coordinada por línea — lo que ve el que decide = lo que cuenta el contador, y ninguna mesa con sombra evitable sin declarar', () => {
  let n = 0, aceptadas = 0;
  for (const [nom, T] of casos) for (const { g, irr, doy } of inst) {
    if (!(g.elev > 1)) continue;
    for (const key of ['coordinada']) {
      const semilla = HOY.anglesPairwiseRaw(g.zen, g.az, T, { candidato: true });
      const d = HOY.decideProyeccion(g.zen, g.az, T, semilla, false);
      const pub = HOY.policyAngles(key, g.zen, g.az, T, irr, doy, 0.2).angles;
      /* la guardia de energía de la ruta por línea puede publicar la fórmula de
         siempre si quitar la sombra cuesta energía: entonces sale MARCADA y su
         sombra está DECLARADA (aceptada), no escondida */
      if (pub.aceptadaPorEnergia) { aceptadas++; continue; }
      if (JSON.stringify(pub) !== JSON.stringify(d.ang)) throw new Error(`${nom} ${key} sol ${g.elev.toFixed(1)}°: lo publicado no es lo que decide decideProyeccion`);
      const seg = sombra(HOY, T, g.zen, g.az, pub.map((v, r) => ((T.segs && T.segs[r]) || [[-30, 30]]).map(() => v)));
      if (JSON.stringify(seg) !== JSON.stringify(d.info.sombraDecision)) throw new Error(`${nom} ${key} sol ${g.elev.toFixed(1)}°: el que decide y el contador ven sombras distintas`);
      const mal = noPublicaCero(seg, d.info.irreducibles);
      if (mal) throw new Error(`${nom} ${key} sol ${g.elev.toFixed(1)}°: ${mal} mesas con sombra evitable y solo ${d.info.irreducibles} declaradas irreducibles`);
      n++;
    }
  }
  return `${n} decisiones con sombra evitable cero salvo lo irreducible · ${aceptadas} en que la guardia de energía publicó la fórmula de siempre, MARCADA`;
});
const semAy = inst.map(({ g }) => HOY.anglesPairwiseSeg(g.zen, g.az, Tay, { candidato: true }));
t('1-2 · Ayora real (79 líneas, por mesa): coordinada decide con lo que el contador cuenta, bit a bit, y no deja sombra evitable sin declarar', () => {
  const out = [];
  inst.forEach(({ g, irr, doy }, i) => {
    const d = HOY.decideProyeccion(g.zen, g.az, Tay, semAy[i], true);
    const pub = HOY.policyAnglesSeg('coordinada', g.zen, g.az, Tay, irr, doy, 0.2);
    if (JSON.stringify(pub) !== JSON.stringify(d.ang)) throw new Error(`sol ${g.elev.toFixed(1)}°: lo publicado no es lo que decide`);
    const seg = sombra(HOY, Tay, g.zen, g.az, pub);
    if (JSON.stringify(seg) !== JSON.stringify(d.info.sombraDecision)) throw new Error(`sol ${g.elev.toFixed(1)}°: decide ≠ mide`);
    const mal = noPublicaCero(seg, d.info.irreducibles);
    if (mal) throw new Error(`sol ${g.elev.toFixed(1)}°: ${mal} mesas con sombra evitable sin declarar`);
    out.push(`${g.elev.toFixed(1)}°: ${d.info.movidas} unidades corregidas, ${d.info.irreducibles} irreducibles`);
  });
  return out.join(' · ');
});
t('3 · CONTROL NEGATIVO: la decisión LOCAL (vecindad y gemelo: la de `pairwise`) suspende la 2 en Ayora', () => {
  let malas = 0; const det = [];
  inst.forEach(({ g }, i) => {
    const vieja = HOY.applyDriveSeg(HOY.anglesPairwiseSeg(g.zen, g.az, Tay), (Tay.segDrive && Tay.segDrive.length) ? Tay.segDrive : Tay.segPairs);
    const seg = sombra(HOY, Tay, g.zen, g.az, vieja);
    let n = 0; seg.forEach(l => l.forEach(v => { if (v > 1e-3) n++; }));
    if (n) { malas++; det.push(`${g.elev.toFixed(1)}°: ${n} mesas`); }
  });
  if (!malas) throw new Error('la decisión vieja no deja ninguna mesa con sombra evitable: el criterio 2 no distingue');
  return `la vieja publica sombra que el contador ve en ${malas} de ${inst.length} instantes (${det.join(', ')})`;
});
if (MAIN) {
  const OTRAS = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
  t('4 · las NUEVE políticas de siempre, por línea, BIT A BIT iguales a origin/main (tres presets × 5 soles)', () => {
    let n = 0;
    for (const [nom, T] of casos) for (const { g, irr, doy } of inst) for (const k of OTRAS) {
      const a = HOY.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles, b = MAIN.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles;
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${k} · ${nom} · sol ${g.elev.toFixed(1)}° cambia`);
      n++;
    }
    return `${n} comparaciones`;
  });
  t('4 · y por mesa (astro, pairwise, optimal, optfree) en Ayora, y el contador por defecto', () => {
    let n = 0;
    inst.forEach(({ g, irr, doy }) => {
      for (const k of ['astro', 'pairwise', 'optimal', 'optfree']) {
        const a = HOY.policyAnglesSeg(k, g.zen, g.az, Tay, irr, doy, 0.2), b = MAIN.policyAnglesSeg(k, g.zen, g.az, Tay, irr, doy, 0.2);
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${k} por mesa · sol ${g.elev.toFixed(1)}° cambia`); n++;
      }
      const ang = MAIN.policyAnglesSeg('astro', g.zen, g.az, Tay, irr, doy, 0.2);
      const a = HOY.shadeBand3DAll(g.zen, g.az, Tay, ang, {}), b = MAIN.shadeBand3DAll(g.zen, g.az, Tay, ang, {});
      for (const campo of ['seg', 'segElec', 'wing', 'wingElec', 'de', 'pl', 'elec']) if (JSON.stringify(a[campo]) !== JSON.stringify(b[campo])) throw new Error(`el contador por defecto cambia en «${campo}» · sol ${g.elev.toFixed(1)}°`);
      if (JSON.stringify([...a]) !== JSON.stringify([...b])) throw new Error('el contador por defecto cambia (por fila)');
      n++;
    });
    return `${n} comparaciones`;
  });
  t('5 · TEST NULO de la 4: coordinada SÍ difiere del pairwise de origin/main (la comparación mira)', () => {
    let dif = 0;
    inst.forEach(({ g, irr, doy }) => { if (JSON.stringify(HOY.policyAnglesSeg('coordinada', g.zen, g.az, Tay, irr, doy, 0.2)) !== JSON.stringify(MAIN.policyAnglesSeg('pairwise', g.zen, g.az, Tay, irr, doy, 0.2))) dif++; });
    if (!dif) throw new Error('coordinada sale igual que el pairwise de main: o la decisión no hace nada o la comparación no compara');
    return `difiere en ${dif} de ${inst.length} instantes`;
  });
}
console.log(ko ? `${ko} FALLOS de ${ok + ko}` : `OK — ${ok} comprobaciones`);
process.exit(ko ? 1 : 0);
