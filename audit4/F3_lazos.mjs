/* R4 · FASE 3 — LOS DOS LAZOS: DE DÓNDE SALEN LOS 1,996°.
 *
 *   node audit4/F3_lazos.mjs
 *
 * R3 midió que los dos lazos de la casa difieren hasta 1,996° en 99 de 100
 * pasos (`audit3/F2_careo_lazos.mjs`). Lo que R3 NO dijo es POR QUÉ, y sin eso
 * la decisión del titular es entre dos cajas negras.
 *
 * Esta sonda DESCOMPONE la diferencia apagando una a una las asimetrías de
 * lógica que el diff de las dos implementaciones enseña, y midiendo cuánto
 * queda. No propone ninguna: medir cuál causa cuánto es exactamente lo que
 * hace falta para decidir, y decidir no es de esta fase.
 *
 * NO SE TOCA NINGÚN LAZO. Las variantes se construyen pasando parámetros
 * distintos al núcleo, que ya los admite. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bt = fs.readFileSync(ROOT + '/backtracking.html', 'utf8');
const f0 = bt.indexOf('FÍSICA PURA'), f1 = bt.lastIndexOf('/* FIN-FÍSICA');
const fis = bt.slice(bt.lastIndexOf('/*', f0), f1);
const sol = fs.readFileSync(ROOT + '/sol.js', 'utf8') + '\n' + fs.readFileSync(ROOT + '/irradiancia.js', 'utf8');
const P = new Function(sol + fis + '\nreturn {crearLazo,DEADBAND_DEG,TRACKER_SLEW};').call(globalThis);
new Function(fs.readFileSync(ROOT + '/js/control_core.js', 'utf8')).call(globalThis);
const C = globalThis.CTRLCORE;
if (!C) throw new Error('CTRLCORE no ha cargado');

const DT = 600;                                   // 10 min, el paso del anual
const cmds = [];
for (let k = 0; k < 40; k++) cmds.push(-50 + 2.5 * k);
for (let k = 0; k < 20; k++) cmds.push(50 - 0.4 * k);
for (let k = 0; k < 40; k++) cmds.push(42 - 2.5 * k);

/* corre los dos lazos contra el MISMO mando y devuelve el careo */
function careo(loop) {
  /* LA BANDA Y EL SLEW VAN A LOS DOS LAZOS. `cicloSeg` y `maxAngle` solo
     existen en el núcleo —son precisamente las asimetrías que se quieren
     medir—, pero la banda muerta la tienen los dos, y dársela a uno solo
     mediría «el núcleo sin banda contra la página con banda», que no es
     ninguna pregunta. Se cazó al leer el peor paso de esa variante: la página
     daba −46,5 con una consigna de −47,5, o sea seguía con su banda puesta. */
  const LZ = P.crearLazo(loop.deadbandDeg, loop.slewDegS);
  let prevN = null, dirN = 0, parkN = null, duN = 0, cmdAnt = null;
  let maxDif = 0, difs = 0, n = 0, peor = null;
  const serie = [];
  for (const c of cmds) {
    const pag = LZ.paso([c], DT)[0];
    let nuc;
    if (prevN == null) { nuc = pag; }
    else {
      const r = C.execTramo(prevN, cmdAnt, c, DT / 60, loop, null, dirN, parkN, duN);
      nuc = r.theta; dirN = r.dir; parkN = r.park; duN = r.dirUlt;
    }
    if (!Number.isFinite(pag) || !Number.isFinite(nuc))
      throw new Error(`careo INVÁLIDO en el paso ${n}: página=${pag} núcleo=${nuc}`);
    prevN = nuc; cmdAnt = c; n++;
    const d = Math.abs(pag - nuc);
    serie.push({ n, cmd: c, pag, nuc, d });
    if (d > 1e-9) { difs++; if (!peor || d > peor.d) peor = { paso: n, cmd: c, pag, nuc, d }; }
    maxDif = Math.max(maxDif, d);
  }
  return { n, difs, maxDif, peor, serie };
}

const CANON = { deadbandDeg: P.DEADBAND_DEG, slewDegS: P.TRACKER_SLEW, cicloSeg: 1, maxAngle: 90 };

console.log('R4 · FASE 3 — DESCOMPOSICIÓN DE LOS 1,996°\n');
console.log(`banda ${P.DEADBAND_DEG}° · slew ${P.TRACKER_SLEW}°/s · dt ${DT / 60} min · ${cmds.length} pasos`);
console.log(`núcleo CANON: ${JSON.stringify(C.CANON)}\n`);

/* ── TEST NULO ─────────────────────────────────────────────────────────────
   Si el careo comparase el lazo de la página CONSIGO MISMO daría 0 y parecería
   que los dos coinciden. Antes de cualquier recuento hay que ver que el
   instrumento sabe dar distinto de cero y sabe dar cero. */
console.log('TEST NULO');
{
  const A = P.crearLazo(), B = P.crearLazo();
  let m = 0; for (const c of cmds) m = Math.max(m, Math.abs(A.paso([c], DT)[0] - B.paso([c], DT)[0]));
  console.log(`  el lazo de la página contra SÍ MISMO: |Δ| máx ${m.toExponential(3)}°  (tiene que ser 0)`);
  if (m !== 0) throw new Error('el instrumento no es determinista: el careo no significa nada');
}
/* Y el control que hace falta para poder leer un CERO: que los dos lazos se
   hayan MOVIDO. Dos lazos congelados también dan |Δ| = 0, y eso no sería
   acuerdo sino parálisis. */
{
  const r = careo({ ...CANON, cicloSeg: DT });
  const recP = Math.max(...r.serie.map(x => x.pag)) - Math.min(...r.serie.map(x => x.pag));
  const recN = Math.max(...r.serie.map(x => x.nuc)) - Math.min(...r.serie.map(x => x.nuc));
  console.log(`  recorrido de cada lazo en la variante que sale a 0: página ${recP.toFixed(3)}° · núcleo ${recN.toFixed(3)}°`);
  if (!(recP > 50 && recN > 50)) throw new Error('un lazo que no se mueve no puede estar de acuerdo con nada');
}
console.log('');

/* ── LAS VARIANTES ─────────────────────────────────────────────────────────
   Del diff de las dos implementaciones salen tres asimetrías de lógica. Cada
   línea de abajo apaga UNA en el núcleo y mide lo que queda. */
const VAR = [
  ['tal como corren hoy', { ...CANON },
   'el núcleo trocea el tramo en ciclos de 1 s y RAMPA la consigna dentro; la página da UN paso con la consigna final'],
  ['ciclo = el tramo entero', { ...CANON, cicloSeg: DT },
   'apaga el troceo Y la rampa a la vez: n=1 y el objetivo es tNow, igual que la página'],
  ['ciclo 60 s', { ...CANON, cicloSeg: 60 }, 'troceo intermedio, para ver si la diferencia escala con el nº de ciclos'],
  ['sin tope mecánico', { ...CANON, maxAngle: 1e9 }, 'la página no recorta a ±maxAngle; el núcleo sí'],
  ['banda muerta 0', { ...CANON, deadbandDeg: 0 }, 'sin banda no hay adelanto ni enclavamiento: queda solo el efecto del muestreo'],
];
console.log('VARIANTES — cada una apaga UNA asimetría del núcleo');
console.log('  variante                     pasos con Δ   |Δ| máx        peor paso');
const res = {};
for (const [nm, loop, por] of VAR) {
  const r = careo(loop);
  res[nm] = r;
  console.log(`  ${nm.padEnd(28)} ${String(r.difs + '/' + r.n).padStart(9)}   ${r.maxDif.toFixed(6).padStart(10)}°   ${r.peor ? `#${r.peor.paso} cmd ${r.peor.cmd} · pág ${r.peor.pag.toFixed(4)} · núc ${r.peor.nuc.toFixed(4)}` : '—'}`);
  console.log(`  ${''.padEnd(28)} ${por}`);
}

console.log('\nLO QUE LA DESCOMPOSICIÓN DICE');
const hoy = res['tal como corren hoy'], uno = res['ciclo = el tramo entero'];
console.log(`  hoy: ${hoy.difs}/${hoy.n} pasos, |Δ| máx ${hoy.maxDif.toFixed(6)}°`);
console.log(`  con el troceo y la rampa apagados: ${uno.difs}/${uno.n} pasos, |Δ| máx ${uno.maxDif.toFixed(6)}°`);
const expl = hoy.maxDif - uno.maxDif;
console.log(`  → el troceo en ciclos de 1 s con la consigna rampada explica ${expl.toFixed(6)}° de los ${hoy.maxDif.toFixed(6)}°`);
console.log(`    (${(100 * expl / hoy.maxDif).toFixed(1)} %). Lo que queda, ${uno.maxDif.toFixed(6)}°, es otra cosa.`);

const dest = process.argv.find(a => a.startsWith('--json=')) ;
if (dest) {
  const p = dest.slice(7);
  const salida = { dt_seg: DT, pasos: cmds.length, canon: CANON, nucleo_canon: C.CANON,
    variantes: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { difs: v.difs, n: v.n, maxDif: v.maxDif, peor: v.peor }])),
    serie_hoy: hoy.serie };
  fs.writeFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), JSON.stringify(salida, null, 1));
  console.log(`\nJSON en ${p}`);
}
