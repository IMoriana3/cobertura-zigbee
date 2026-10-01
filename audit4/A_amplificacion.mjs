/* R4 · ENCARGO A.4 y A.5 — CÓMO 0,8° DE ENTRADA SE VUELVEN 62° DE SALIDA.
 *
 *   node audit4/A_amplificacion.mjs [--json=RUTA]
 *
 * A.3 midió que la divergencia del ASTRONÓMICO es, entera, el convenio de
 * signo del tilt N-S: `pvTilt` (`backtracking.html:606`) le pasa −τ a
 * `singleaxis` y `tracker3d.py` le pasa +τ.
 *
 * A.4 pregunta cuánto de los 62,07° del careo viene de amplificar esa entrada,
 * y por dónde. Se mide **dentro del motor JS**, perturbando SOLO el signo de τ
 * y dejando todo lo demás igual. Es lo que permite atribuir: si se carearan los
 * dos motores, cualquier otra diferencia entre ellos entraría en la cuenta.
 *
 * La cadena de `pairwise` tiene TRES etapas (`policyAngles`,
 * `backtracking.html:3738`), y se mide la salida de cada una:
 *   1  `anglesPairwise`      la fórmula del backtracking, con su arccos
 *   2  `driveCoupleSafe`     el acople por accionamiento (min|θ| del grupo)
 *   3  `repairNoShade`       la guardia de energía
 * Así la amplificación se reparte, no se atribuye entera a la primera.
 *
 * A.5 mira si el signo explica que los dos motores manden el tracker a LADOS
 * OPUESTOS (`audit2/EVIDENCIA_BT_R2.md:2740`: `10/−55` ×8 y `−2/55` ×6 en las
 * 14 mayores).
 *
 * NO arregla nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA');
const src = html.slice(html.lastIndexOf('/*', i0), i1);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n'
          + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + src + `return { anglesAstro, anglesPairwise, driveCoupleSafe,
  repairNoShade, applyDrive, policyAngles, solarPos, clearskyIneichen, pvTilt, driveGroups };`)();

/* La geometría del caso B del careo congelado de R2, que es donde salieron los
   65°: seis filas, pendiente 8°, torsión N-S por fila. */
const TILTS = [-3.41, 1.63, 3.22, 3.76, -3.67, -3.06];
const PITCH = 6.0, CW = 2.382, SLOPE = 8.0;
const mkT = (tilts, conGrupos) => ({
  pairs: tilts.slice(0, -1).map((_, i) => ({ slope: SLOPE, pitch: PITCH, axisTilt: (tilts[i] + tilts[i + 1]) / 2 })),
  cw: CW, axisAz: 0, maxAngle: 55, gcr: CW / PITCH, z0: 0.17, nBypass: 2, iam: 0.05,
  rowTilt: tilts.slice(), groups: conGrupos ? F.driveGroups(tilts.length, 'bifila') : null, drive: conGrupos ? 'bifila' : 'mono',
});

const LAT = 41.5763, LON = -0.7981, ALT = 300, TL = 3.5, ALB = 0.2;
const INST = [];
for (const [nm, dia, doy] of [['21-jun', Date.UTC(2026, 5, 21), 172], ['21-dic', Date.UTC(2026, 11, 21), 355], ['21-mar', Date.UTC(2026, 2, 21), 80]]) {
  for (let m = 0; m < 1440; m += 15) {
    const g = F.solarPos(dia + m * 60000 - 3600000, LAT, LON);
    if (!(g.elev > 3)) continue;
    INST.push({ nm, doy, m, ...g, irr: F.clearskyIneichen(g.zen, doy, ALT, TL) });
  }
}

/* la perturbación: MISMA geometría con el signo de la torsión cambiado. Es
   exactamente lo que separa a los dos motores según A.3. */
const T_mas = mkT(TILTS.map(t => -t), true);        // lo que el JS le da a singleaxis
const T_men = mkT(TILTS, true);                     // lo que el Python le da
const T_mas0 = mkT(TILTS.map(t => -t), false);      // sin acople
const T_men0 = mkT(TILTS, false);

const est = a => ({ n: a.length, rms: Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length), max: Math.max(...a) });
const dif = (A, B) => A.map((v, r) => Math.abs(v - B[r]));

const et = { astro: [], pairwise: [], acoplado: [], reparado: [], pairwise_sin_acople: [] };
const opuestos = [];
for (const i of INST) {
  const aA = F.anglesAstro(i.zen, i.az, T_mas), aB = F.anglesAstro(i.zen, i.az, T_men);
  et.astro.push(...dif(aA, aB));

  const pA = F.anglesPairwise(i.zen, i.az, T_mas), pB = F.anglesPairwise(i.zen, i.az, T_men);
  et.pairwise.push(...dif(pA, pB));

  const cA = F.driveCoupleSafe(i.zen, i.az, T_mas, pA, false), cB = F.driveCoupleSafe(i.zen, i.az, T_men, pB, false);
  et.acoplado.push(...dif(cA, cB));

  const rA = F.repairNoShade(i.zen, i.az, T_mas, cA, i.irr, i.doy, ALB);
  const rB = F.repairNoShade(i.zen, i.az, T_men, cB, i.irr, i.doy, ALB);
  et.reparado.push(...dif(rA, rB));

  /* la MISMA cadena sin grupos de accionamiento: separa el acople del resto */
  const qA = F.anglesPairwise(i.zen, i.az, T_mas0), qB = F.anglesPairwise(i.zen, i.az, T_men0);
  const sA = F.repairNoShade(i.zen, i.az, T_mas0, F.driveCoupleSafe(i.zen, i.az, T_mas0, qA, false), i.irr, i.doy, ALB);
  const sB = F.repairNoShade(i.zen, i.az, T_men0, F.driveCoupleSafe(i.zen, i.az, T_men0, qB, false), i.irr, i.doy, ALB);
  et.pairwise_sin_acople.push(...dif(sA, sB));

  for (let r = 0; r < rA.length; r++)
    if (rA[r] * rB[r] < 0 && Math.abs(rA[r] - rB[r]) > 1)
      opuestos.push({ dia: i.nm, min: i.m, fila: r, a: +rA[r].toFixed(3), b: +rB[r].toFixed(3) });
}

console.log('R4 · A.4 y A.5 — LA AMPLIFICACIÓN, MEDIDA\n');
console.log(`  geometría: caso B del careo congelado de R2 · 6 filas · pendiente ${SLOPE}° · torsión ${TILTS.join(' ')}`);
console.log(`  perturbación: SOLO el signo de la torsión N-S. Todo lo demás, idéntico.`);
console.log(`  ${INST.length} instantes (elev > 3°, tres días) × 6 filas = ${INST.length * 6} valores por etapa\n`);

/* TEST NULO: con torsión CERO la perturbación no existe, y todas las etapas
   tienen que dar 0. Si no, la sonda mide otra cosa. */
{
  const Z = mkT([0, 0, 0, 0, 0, 0], true);
  let m = 0;
  for (const i of INST) {
    const a = F.repairNoShade(i.zen, i.az, Z, F.driveCoupleSafe(i.zen, i.az, Z, F.anglesPairwise(i.zen, i.az, Z), false), i.irr, i.doy, ALB);
    for (const v of dif(a, a)) m = Math.max(m, v);
  }
  console.log(`TEST NULO · con torsión 0 la perturbación no existe: |Δ| máx ${m.toExponential(2)}° (tiene que ser 0)`);
  if (m !== 0) throw new Error('la sonda mide algo que no es la perturbación');
}

console.log('\nA.4 · DÓNDE SE AMPLIFICA — |Δθ| por etapa de la cadena de `pairwise`');
console.log('  etapa                                    n      RMS        máx     factor vs astro');
const base = est(et.astro);
for (const [nm, k] of [['1 · astro (la ENTRADA)', 'astro'], ['2 · anglesPairwise (el arccos)', 'pairwise'],
                       ['3 · + driveCoupleSafe (acople)', 'acoplado'], ['4 · + repairNoShade (guardia)', 'reparado'],
                       ['   la cadena ENTERA SIN acople', 'pairwise_sin_acople']]) {
  const e = est(et[k]);
  console.log(`  ${nm.padEnd(38)} ${String(e.n).padStart(5)} ${e.rms.toFixed(4).padStart(9)}° ${e.max.toFixed(4).padStart(10)}°  ×${(e.rms / base.rms).toFixed(2).padStart(7)}`);
}
const conA = est(et.reparado), sinA = est(et.pairwise_sin_acople), bt = est(et.pairwise);
console.log('\n  LA DESCOMPOSICIÓN QUE A.4 PIDE, en el peor caso:');
console.log('  (OJO CON EL SIGNO DE CADA APORTACIÓN: dos de las tres etapas RESTAN, no suman.');
console.log('   El encargo preguntaba cuánto viene del acople; la respuesta medida es que el');
console.log('   acople no amplifica, ATENÚA.)');
console.log(`    entrada (astro)                         ${base.max.toFixed(4)}°`);
console.log(`    tras el arccos del backtracking         ${bt.max.toFixed(4)}°   (+${(bt.max - base.max).toFixed(4)}°)`);
console.log(`    tras el acople por accionamiento        ${est(et.acoplado).max.toFixed(4)}°   (+${(est(et.acoplado).max - bt.max).toFixed(4)}°)`);
console.log(`    tras la guardia de energía              ${conA.max.toFixed(4)}°   (+${(conA.max - est(et.acoplado).max).toFixed(4)}°)`);
console.log(`\n    la MISMA cadena sin grupos de accionamiento: ${sinA.max.toFixed(4)}°`);
console.log(`    → aportación del ACOPLE al peor caso: ${(conA.max - sinA.max).toFixed(4)}°`);

console.log('\nA.5 · ¿EXPLICA EL SIGNO QUE LOS DOS MANDEN A LADOS OPUESTOS?');
console.log(`  pares con θ de signo contrario y separación > 1°: ${opuestos.length} de ${INST.length * 6}`);
if (opuestos.length) {
  const ej = opuestos.slice().sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 6);
  console.log('  los seis mayores:');
  for (const o of ej) console.log(`    ${o.dia} ${String(Math.floor(o.min / 60)).padStart(2, '0')}:${String(o.min % 60).padStart(2, '0')} fila ${o.fila} · ${o.a} / ${o.b}`);
  const enTope = opuestos.filter(o => Math.abs(Math.abs(o.a) - 55) < 1e-6 || Math.abs(Math.abs(o.b) - 55) < 1e-6);
  console.log(`\n  de esos ${opuestos.length}, con UNO DE LOS DOS en el tope mecánico (±55°): ${enTope.length}`);
  console.log('  R2 registró `10/−55` ×8 y `−2/55` ×6 en las 14 mayores (`audit2/EVIDENCIA_BT_R2.md:2740`),');
  console.log('  o sea SIEMPRE uno en el tope.');
  if (enTope.length === 0) {
    console.log('  → el signo REPRODUCE EL FENÓMENO (lados opuestos) pero NO la firma de R2: aquí');
    console.log('    ninguno de los pares tiene un motor en el tope. Para la firma exacta hace falta');
    console.log('    algo más, y con esta sonda NO ESTÁ IDENTIFICADO.');
  } else {
    console.log(`  → ${enTope.length} de ${opuestos.length} sí reproducen la firma de R2.`);
    for (const o of enTope.slice(0, 4)) console.log(`      ${o.dia} fila ${o.fila} · ${o.a} / ${o.b}`);
  }
} else {
  console.log('  NINGUNO. El signo, por sí solo, NO reproduce los lados opuestos: hace falta otra cosa.');
}

const dest = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ geometria: { tilts: TILTS, slope: SLOPE, pitch: PITCH, cw: CW },
    instantes: INST.length, etapas: Object.fromEntries(Object.entries(et).map(([k, v]) => [k, est(v)])),
    opuestos: { n: opuestos.length, de: INST.length * 6, muestra: opuestos.slice(0, 40) } }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
