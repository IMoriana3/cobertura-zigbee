/* EL ACOPLE, DECLARADO — Y LO QUE HAY QUE CONSERVAR (refundación del BT, paso 3
 * reformulado, v1.83.0)
 *
 *   node tools/test_unidad_accionamiento.mjs
 *
 * El paso 3 empezó retirando el acople de las dos LÍNEAS ENTERAS de cada grupo en
 * planta real, y la medida lo refutó dos veces (audit5/REFUNDACION_P3.md). Retirar
 * el acople se llevaba una reparación de sombra (53 → 119 parejas en contacto 3D).
 * Y aun reparando, `true3d` perdía un −0,38/−0,55 % del día, NO por sombra (sin
 * acople sombrea menos) sino por ÁNGULO DE INCIDENCIA. En relieve genérico,
 * retirarlo gana hasta un 4,8 %. El acople es una casualidad favorable de Ayora,
 * y lo que falla es el CRITERIO con el que deciden estas políticas. Decisión del
 * titular: el acople se queda como está, DECLARADO junto al código, y el paso 3
 * pasa a revisar los criterios de decisión de las nueve.
 *
 * Así que este banco vigila lo que el paso 3 deja, que no es una forma sino
 * PROPIEDADES (regla R-4):
 *   1 · cada motor, un θ: en Ayora, las cuatro mesas de cada `segDrive` publican el
 *       MISMO ángulo en `row`, `true3d` y `mgl`;
 *   2 · ninguna política cambia de ángulo: las NUEVE por mesa en Ayora y por línea
 *       en presets mono y bifila, bit a bit como `origin/main`, y la FUENTE DE
 *       MANDO de la página (`segCmd`, cortada tal cual) también. CONTROL NEGATIVO:
 *       un desacople inyectado en la física sale señalado;
 *   3 · PROPIEDAD: lo que `true3d` publica no tiene MÁS parejas en contacto 3D que
 *       main. CONTROL NEGATIVO: sin la reparación, roja (medido: 119 frente a 53).
 *       LÍMITE CONOCIDO: verifica que no empeora respecto a main, no que la
 *       reparación funcione; si se rompe de otra forma que deje 53 o menos,
 *       pasaría;
 *   4 · la declaración del acople está escrita junto al código que acopla, para
 *       que nadie lo lea como acierto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from '../audit5/lib_simulador.mjs';
import { rutasAnuales } from '../audit5/lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, ko = 0;
const t = (n, f) => { try { const m = f(); ok++; console.log('  ✓ ' + n + (m ? ' — ' + m : '')); } catch (e) { ko++; console.log('  ✗ ' + n + ' — ' + e.message); } };
const EXTRA = ['applyDriveSeg', 'segsBroadcast', 'segLineMean', 'tangentResidualPairMm'];
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const HOY = cargaSimulador(ROOT, EXTRA).F;
let MAIN = null, hMain = null;
try { hMain = execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); MAIN = cargaSimulador(ROOT, EXTRA, () => hMain).F; }
catch (e) { console.log('  · sin origin/main: las comparaciones con main no corren'); }
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const Tay = terrenoComoLaPagina(HOY, datos, 80, 0).T;
const SOLES = [[5, 30], [7, 0], [11, 0], [17, 30], [18, 30]];   // UTC, 21-jun
const inst = SOLES.map(([h, m]) => { const g = HOY.solarPos(Date.UTC(2026, 5, 21, h, m), lay.clat, lay.clon); return { g, doy: HOY.doyOf('2026-06-21'), irr: HOY.clearskyIneichen(g.zen, 172, datos.base, 3.5) }; });
const NUEVE = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
/* `mgl` cuesta 40-90 s por instante en Ayora: cada (física, política, instante) se
   calcula UNA vez. Mismos argumentos, mismo resultado. */
const _memo = new Map();
function pas(F, k, i) {
  let m = _memo.get(F); if (!m) _memo.set(F, m = new Map());
  const key = k + '|' + i;
  if (!m.has(key)) { const { g, irr, doy } = inst[i]; m.set(key, F.policyAnglesSeg(k, g.zen, g.az, Tay, irr, doy, 0.2)); }
  return m.get(key);
}
const igualJ = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('el acople, declarado, y lo que hay que conservar');
t('1 · cada motor, un θ: las mesas de cada segDrive publican el MISMO ángulo (row, true3d, mgl · Ayora · 5 soles)', () => {
  let n = 0;
  for (const k of ['row', 'true3d', 'mgl']) for (let i = 0; i < inst.length; i++) {
    const A = pas(HOY, k, i), g = inst[i].g;
    for (const mot of Tay.segDrive) { const v = mot.map(([r, j]) => A[r][j]); if (v.some(x => x !== v[0])) throw new Error(`${k} sol ${g.elev.toFixed(1)}°: un motor con θ distintos`); n++; }
  }
  return `${n} motor×instante`;
});
if (MAIN) {
  t('2 · las NUEVE por mesa en Ayora, bit a bit como origin/main (ninguna política cambia de ángulo)', () => {
    let n = 0;
    for (const k of NUEVE) for (let i = 0; i < inst.length; i++) {
      if (!igualJ(pas(HOY, k, i), pas(MAIN, k, i))) throw new Error(`${k} sol ${inst[i].g.elev.toFixed(1)}° cambia respecto a main`);
      n++;
    }
    return `${n} comparaciones`;
  });
  t('2 · y las NUEVE por línea en presets mono y bifila, bit a bit como origin/main', () => {
    let n = 0; const casos = [];
    for (const drive of ['mono', 'bifila']) {
      const nR = 8, pitch = 6, z = [...Array(nR)].map((_, i) => -i * pitch * Math.tan(5 * Math.PI / 180)), tilt = [...Array(nR)].map((_, i) => 3 * Math.sin(2 * Math.PI * i / 4));
      const pairs = []; for (let i = 0; i < nR - 1; i++) pairs.push({ slope: Math.atan2(z[i] - z[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: (tilt[i] + tilt[i + 1]) / 2 });
      casos.push({ pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilt,
        groups: drive === 'bifila' ? [[0, 1], [2, 3], [4, 5], [6, 7]] : null, drive });
    }
    for (const T of casos) for (const { g, irr, doy } of inst) for (const k of NUEVE) {
      if (!igualJ(HOY.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles, MAIN.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles)) throw new Error(`${k} ${T.drive} sol ${g.elev.toFixed(1)}° cambia`);
      n++;
    }
    return `${n} comparaciones`;
  });
  t('2 · y la FUENTE DE MANDO de la página (segCmd, cortada tal cual) da lo mismo que la de main (row, true3d, mgl, pairwise · Ayora)', () => {
    const P = rutasAnuales(ROOT, html).F, PM = rutasAnuales(ROOT, hMain).F; let n = 0;
    for (const k of ['row', 'true3d', 'mgl', 'pairwise']) for (const { g, irr, doy } of inst) {
      if (!igualJ(P.segCmd(k, g.zen, g.az, Tay, Tay, irr, doy, 0.2), PM.segCmd(k, g.zen, g.az, Tay, Tay, irr, doy, 0.2))) throw new Error(`segCmd de ${k} cambia respecto a main`);
      n++;
    }
    return `${n} comparaciones`;
  });
  t('2 · CONTROL NEGATIVO: un desacople inyectado en la física (true3d sin el acople de grupo) sale señalado', () => {
    const a = "if(key==='true3d')return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesTrue3d(zen,az,T),true),irr,doy,albedo),f:undefined};";
    if (!html.includes(a)) throw new Error('no encuentro el despacho de true3d para construir el control');
    const MUT = cargaSimulador(ROOT, EXTRA, h => h.replace(a, "if(key==='true3d')return {angles:anglesTrue3d(zen,az,T),f:undefined};")).F;
    const d = inst.filter((_, i) => !igualJ(MUT.policyAnglesSeg('true3d', inst[i].g.zen, inst[i].g.az, Tay, inst[i].irr, inst[i].doy, 0.2), pas(MAIN, 'true3d', i))).length;
    if (!d) throw new Error('con el desacople inyectado la comparación con main no ve nada: la 2 no distingue');
    return `el desacople difiere de main en ${d} de ${inst.length} instantes`;
  });

  /* 3 · LA PROPIEDAD (regla R-4). */
  const INST48 = [];
  for (const d of [172, 355]) for (let hh = 5; hh <= 19; hh++) for (const mm of [0, 30]) {
    const g = HOY.solarPos(Date.UTC(2026, 0, 1) + (d - 1) * 864e5 + (hh * 60 + mm) * 6e4, lay.clat, lay.clon);
    if (g.elev > 1) INST48.push({ g, doy: d, irr: HOY.clearskyIneichen(g.zen, d, datos.base, 3.5) });
  }
  const contacto = F => { let n = 0;
    for (const { g, irr, doy } of INST48) {
      const lin = F.segLineMean(Tay, F.policyAnglesSeg('true3d', g.zen, g.az, Tay, irr, doy, 0.2));
      for (let p = 0; p < Tay.pairs.length; p++) { const r = F.tangentResidualPairMm(g.zen, g.az, Tay, lin, p); if (isFinite(r) && r < -1) n++; }
    }
    return n; };
  const SIN_REP = cargaSimulador(ROOT, EXTRA, h => {
    const a = 'driveCoupleSafe(zen,az,T,anglesTrue3d(zen,az,T),true)';
    if (!h.includes(a)) throw new Error('no encuentro la reparación de true3d para quitarla');
    return h.replace(a, 'anglesTrue3d(zen,az,T)');
  }).F;
  const nHoy = contacto(HOY), nMain = contacto(MAIN), nSin = contacto(SIN_REP);
  t(`3 · PROPIEDAD: true3d no publica MÁS parejas en contacto 3D que main (${INST48.length} instantes × ${Tay.pairs.length} parejas)`, () => {
    if (nHoy > nMain) throw new Error(`hoy ${nHoy} parejas en contacto, main ${nMain}`);
    return `hoy ${nHoy} · main ${nMain}`;
  });
  t('3 · CONTROL NEGATIVO: sin la reparación, la 3 se pone roja', () => {
    if (!(nSin > nMain)) throw new Error(`sin la reparación salen ${nSin} parejas y main ${nMain}: la 3 no distingue`);
    return `sin la reparación ${nSin} parejas en contacto (main ${nMain}): roja`;
  });
}
t('4 · la declaración del acople está escrita junto al código que acopla (row, true3d, mgl)', () => {
  const i = html.indexOf("if(key==='row')return {angles:applyDrive(anglesRow(zen,az,T),T.groups||null)");
  if (i < 0) throw new Error('no encuentro el despacho de row');
  const antes = html.slice(Math.max(0, i - 1600), i);
  for (const w of ['CASUALIDAD FAVORABLE', 'CRITERIO', 'NO es una restricción del accionamiento'])
    if (!antes.includes(w)) throw new Error('la declaración junto al acople no dice «' + w + '»');
  return 'escrita';
});
console.log(ko ? `${ko} FALLOS de ${ok + ko}` : `OK — ${ok} comprobaciones`);
process.exit(ko ? 1 : 0);
