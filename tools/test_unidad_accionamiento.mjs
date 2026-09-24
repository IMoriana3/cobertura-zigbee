/* LA UNIDAD ES EL ACCIONAMIENTO (refundación del BT, paso 3, v1.83.0)
 *
 *   node tools/test_unidad_accionamiento.mjs
 *
 * En planta real con los motores medidos (`T.segDrive`), las políticas que
 * deciden por línea (`row`, `true3d`, `mgl`) ya no acoplan las DOS LÍNEAS
 * ENTERAS de cada grupo (`T.groups`): reparten su ángulo de línea a sus mesas y
 * lo acoplan POR MOTOR. Medido en el paso 1: acoplar líneas enteras era el
 * 95,1 % del hueco con la rama por mesa (audit5/REFUNDACION_P1.md).
 *
 *   1 · cada motor, un θ: en Ayora, las cuatro mesas de cada `segDrive` publican
 *       el MISMO ángulo en `row`, `true3d` y `mgl`;
 *   2 · y ya no se acoplan líneas enteras: en algún grupo de `T.groups` las dos
 *       líneas publican θ distintos en la misma x (con el acople viejo, jamás);
 *       TEST NULO: las tres difieren de `origin/main` en algún instante;
 *   3 · lo demás no cambia: las otras seis políticas por mesa en Ayora, y las
 *       nueve por línea en los presets (donde el grupo bifila ES el motor), bit a
 *       bit iguales a `origin/main`;
 *   4 · CONTROL NEGATIVO: con el cambio DESARMADO (`LINEA_SIN_ACOPLE` vacía), la 2
 *       se pone roja;
 *   5 · la FUENTE DE MANDO de la página (`segCmd`, día y anual) pasa por ahí:
 *       cortada de la página, da lo mismo que la rama por mesa; el `segCmd` de
 *       antes, no (control). La primera versión del paso 3 cambiaba
 *       `policyAnglesSegF` y no `segCmd`: la página no habría cambiado nada y las
 *       comprobaciones 1-4 habrían pasado igual (E-X1-R3-1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from '../audit5/lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, ko = 0;
const t = (n, f) => { try { const m = f(); ok++; console.log('  ✓ ' + n + (m ? ' — ' + m : '')); } catch (e) { ko++; console.log('  ✗ ' + n + ' — ' + e.message); } };
const EXTRA = ['applyDriveSeg', 'segsBroadcast', 'segLineMean', 'tangentResidualPairMm'];
const HOY = cargaSimulador(ROOT, EXTRA).F;
let MAIN = null;
try { const h = execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); MAIN = cargaSimulador(ROOT, EXTRA, () => h).F; }
catch (e) { console.log('  · sin origin/main: las comparaciones con main no corren'); }
const DESARMADO = cargaSimulador(ROOT, EXTRA, h => {
  const a = 'const LINEA_SIN_ACOPLE={';
  if (!h.includes(a)) throw new Error('no encuentro LINEA_SIN_ACOPLE para desarmarla');
  return h.replace(a, 'const LINEA_SIN_ACOPLE={};const _LSA_VIEJA={');
}).F;
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const Tay = terrenoComoLaPagina(HOY, datos, 80, 0).T;
const SOLES = [[5, 30], [7, 0], [11, 0], [17, 30], [18, 30]];   // UTC, 21-jun
const inst = SOLES.map(([h, m]) => { const g = HOY.solarPos(Date.UTC(2026, 5, 21, h, m), lay.clat, lay.clon); return { g, doy: HOY.doyOf('2026-06-21'), irr: HOY.clearskyIneichen(g.zen, 172, datos.base, 3.5) }; });
const LINEA = ['row', 'true3d', 'mgl'];
/* `mgl` cuesta 40-90 s por instante en Ayora: cada (motor de física, política,
   instante) se calcula UNA vez y las comprobaciones leen de aquí. Mismos
   argumentos, mismo resultado: la memoria no cambia lo que se compara. */
const _memo = new Map();
function pas(F, k, i) {
  let m = _memo.get(F); if (!m) _memo.set(F, m = new Map());
  const key = k + '|' + i;
  if (!m.has(key)) { const { g, irr, doy } = inst[i]; m.set(key, F.policyAnglesSeg(k, g.zen, g.az, Tay, irr, doy, 0.2)); }
  return m.get(key);
}

/* ¿alguna pareja de líneas de un grupo publica θ distintos en la misma x? */
function lineasDesacopladas(A, T) {
  let n = 0;
  for (const gr of T.groups || []) {
    if (gr.length < 2) continue;
    const [r1, r2] = gr;
    for (let k = 0; k < Math.min(A[r1].length, A[r2].length); k++) if (Math.abs(A[r1][k] - A[r2][k]) > 1e-9) { n++; break; }
  }
  return n;
}

console.log('la unidad es el accionamiento');
t('1 · cada motor, un θ: las mesas de cada segDrive publican el MISMO ángulo (row, true3d, mgl · Ayora · 5 soles)', () => {
  let n = 0;
  for (const k of LINEA) for (let i = 0; i < inst.length; i++) {
    const A = pas(HOY, k, i), g = inst[i].g;
    for (const mot of Tay.segDrive) { const v = mot.map(([r, j]) => A[r][j]); if (v.some(x => x !== v[0])) throw new Error(`${k} sol ${g.elev.toFixed(1)}°: un motor con θ distintos`); n++; }
  }
  return `${n} motor×instante`;
});
const desacopladas = F => { let n = 0; for (const k of LINEA) for (let i = 0; i < inst.length; i++) n += lineasDesacopladas(pas(F, k, i), Tay); return n; };
t('2 · ya no se acoplan LÍNEAS ENTERAS: hay grupos cuyas dos líneas publican θ distintos', () => {
  const n = desacopladas(HOY);
  if (!n) throw new Error('todas las parejas de líneas publican el mismo θ: el acople de líneas enteras sigue ahí');
  return `${n} grupo×política×instante con las dos líneas distintas`;
});
t('4 · CONTROL NEGATIVO: con el cambio desarmado, la 2 se pone roja', () => {
  const n = desacopladas(DESARMADO);
  if (n) throw new Error(`con LINEA_SIN_ACOPLE vacía siguen saliendo ${n} grupos desacoplados: la 2 no distingue`);
  return 'con el acople de líneas enteras, 0 grupos desacoplados';
});
if (MAIN) {
  t('2 · TEST NULO: row, true3d y mgl difieren de origin/main en Ayora', () => {
    const out = [];
    for (const k of LINEA) { let d = 0; for (let i = 0; i < inst.length; i++) if (JSON.stringify(pas(HOY, k, i)) !== JSON.stringify(pas(MAIN, k, i))) d++;
      if (!d) throw new Error(`${k} sale igual que en main`); out.push(`${k} ${d}/${inst.length}`); }
    return out.join(' · ');
  });
  t('3 · las otras SEIS por mesa en Ayora, bit a bit como origin/main', () => {
    let n = 0;
    for (const k of ['astro', 'global', 'bt2d', 'pairwise', 'optimal', 'optfree']) for (const { g, irr, doy } of inst) {
      if (JSON.stringify(HOY.policyAnglesSeg(k, g.zen, g.az, Tay, irr, doy, 0.2)) !== JSON.stringify(MAIN.policyAnglesSeg(k, g.zen, g.az, Tay, irr, doy, 0.2))) throw new Error(`${k} sol ${g.elev.toFixed(1)}° cambia`);
      n++;
    }
    return `${n} comparaciones`;
  });
  t('3 · y las NUEVE por línea en presets con bifila (el grupo ES el motor), bit a bit como origin/main', () => {
    let n = 0;
    const casos = [];
    for (const drive of ['mono', 'bifila']) {
      const nR = 8, pitch = 6, z = [...Array(nR)].map((_, i) => -i * pitch * Math.tan(5 * Math.PI / 180)), tilt = [...Array(nR)].map((_, i) => 3 * Math.sin(2 * Math.PI * i / 4));
      const pairs = []; for (let i = 0; i < nR - 1; i++) pairs.push({ slope: Math.atan2(z[i] - z[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: (tilt[i] + tilt[i + 1]) / 2 });
      casos.push({ pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilt,
        groups: drive === 'bifila' ? [[0, 1], [2, 3], [4, 5], [6, 7]] : null, drive });
    }
    for (const T of casos) for (const { g, irr, doy } of inst) for (const k of ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree']) {
      if (JSON.stringify(HOY.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles) !== JSON.stringify(MAIN.policyAngles(k, g.zen, g.az, T, irr, doy, 0.2).angles)) throw new Error(`${k} ${T.drive} sol ${g.elev.toFixed(1)}° cambia`);
      n++;
    }
    return `${n} comparaciones`;
  });
}
/* 5 · la FUENTE DE MANDO de la página es `segCmd` (día y anual), no
   `policyAnglesSeg`: se corta de la página tal cual y tiene que dar lo mismo.
   CONTROL NEGATIVO: el `segCmd` de antes (solo POL_POR_MESA por mesa) NO. */
{
  const { rutasAnuales } = await import('../audit5/lib_anual_pagina.mjs');
  const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
  const P = rutasAnuales(ROOT, html).F;
  const viejo = html.replace('if(segOn(T)&&Tcfg===T&&(POL_POR_MESA[key]||porMotor)){', 'if(segOn(T)&&Tcfg===T&&POL_POR_MESA[key]){');
  t('5 · la fuente de mando de la página (segCmd) acopla por motor: da lo mismo que la rama por mesa (row, true3d, mgl · Ayora)', () => {
    if (viejo === html) throw new Error('no encuentro la condición de segCmd: el control no se puede construir');
    let n = 0, difViejo = 0;
    const PV = rutasAnuales(ROOT, viejo).F;
    for (const k of LINEA) for (let i = 0; i < inst.length; i++) {
      const { g, irr, doy } = inst[i];
      const a = P.segCmd(k, g.zen, g.az, Tay, Tay, irr, doy, 0.2), b = pas(HOY, k, i);
      if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${k} sol ${g.elev.toFixed(1)}°: segCmd no da la rama por mesa`);
      if (JSON.stringify(PV.segCmd(k, g.zen, g.az, Tay, Tay, irr, doy, 0.2)) !== JSON.stringify(b)) difViejo++;
      n++;
    }
    if (!difViejo) throw new Error('CONTROL: el segCmd de antes da lo mismo: la comprobación no distingue');
    return `${n} comparaciones · el segCmd de antes difiere en ${difViejo} (control)`;
  });
}
/* 6 · LA PROPIEDAD, no la forma (regla R-4, audit5/REGLAS.md). Las 1-5 miran la
   FORMA del cambio —un motor, un θ; líneas desacopladas; la puerta de la página—
   y estuvieron en verde 7/7 mientras el paso 3 se llevaba la REPARACIÓN de
   sombra que iba dentro de `driveCoupleSafe` (E-X1-R3-3). Lo que hay que
   conservar es que no aparezca contacto que el código sabía evitar: las parejas
   de líneas en contacto 3D (residuo < −1 mm) de lo que `true3d` PUBLICA (la
   media de línea de sus mesas) no pueden aumentar respecto a main.
   CONTROL NEGATIVO: sin la reparación tiene que ponerse roja (medido: 119 frente
   a 53). `mgl` no entra: 40-90 s por instante en Ayora; su contacto se mide en
   audit5/, no aquí, y queda dicho. */
if (MAIN) {
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
    const a = 'true3d:(zen,az,T)=>driveCoupleSafe(zen,az,porLinea(T),anglesTrue3d(zen,az,T),true),';
    if (!h.includes(a)) throw new Error('no encuentro la reparación de true3d para quitarla');
    return h.replace(a, 'true3d:(zen,az,T)=>anglesTrue3d(zen,az,T),');
  }).F;
  const nHoy = contacto(HOY), nMain = contacto(MAIN), nSin = contacto(SIN_REP);
  t(`6 · PROPIEDAD: true3d no publica MÁS parejas en contacto 3D que main (${INST48.length} instantes × ${Tay.pairs.length} parejas)`, () => {
    if (nHoy > nMain) throw new Error(`hoy ${nHoy} parejas en contacto, main ${nMain}: el cambio deja contacto que el código sabía reparar`);
    return `hoy ${nHoy} · main ${nMain}`;
  });
  t('6 · CONTROL NEGATIVO: sin la reparación, la 6 se pone roja', () => {
    if (!(nSin > nMain)) throw new Error(`sin la reparación salen ${nSin} parejas y main ${nMain}: la 6 no distingue`);
    return `sin la reparación ${nSin} parejas en contacto (main ${nMain}): roja`;
  });
}
console.log(ko ? `${ko} FALLOS de ${ok + ko}` : `OK — ${ok} comprobaciones`);
process.exit(ko ? 1 : 0);
