/* R4 · ¿CUÁNTO CAMBIARÍA EL ANUAL SI FUERA POR MESA?
 *
 *   node audit4/D_anual_por_mesa.mjs [--meses=todos] [--pols=…] [--json=RUTA]
 *
 * 1.6 cerró con CERO: el arreglo del veto no mueve la cifra anual, porque la
 * ruta anual va POR LÍNEA. Verificado en la fuente: el bucle de `yearbtn`
 * (`backtracking.html:7602-7605`) llama a `policyAngles(...,Tcfg,...)` y a
 * `poaPlant(...)`, las dos de línea, mientras el cuerpo del día pasa por
 * `segCmd` y `poaPlantSeg`.
 *
 * O sea que la cifra que la página publica como anual NO lleva dentro el
 * arreglo de la fase 1. Proponer «llevar el anual por la rama por mesa» sin
 * una cifra sería una propuesta sin tamaño, así que aquí se mide el tamaño.
 *
 * SE MIDE, NO SE ARREGLA. Las dos cadenas corren en la MISMA pasada sobre la
 * MISMA geometría y los MISMOS instantes, así que la diferencia no puede venir
 * de otra cosa.
 *
 * LA GEOMETRÍA LLEVA TORSIÓN POR MESA DE VERDAD (rótula), porque sin torsión
 * las dos ramas coinciden por construcción y la medida sería cero por una
 * razón que no es la que se pregunta. El test nulo lo comprueba.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, policyAnglesSeg, poaPlant, poaPlantSeg,
  crearLazo, crearLazoSeg, segLineMean, solarPos, clearskyIneichen, doyOf, nsSegments, driveGroups,
  effRowTilts, segTiltAt, policyAnglesSeg, rotulaMesas };`)();
/* `segCmd` vive FUERA de FÍSICA PURA (`backtracking.html:5418`), así que aquí
   no se puede extraer con el bloque. Se usa `policyAnglesSeg` directamente,
   que es lo que `segCmd` llama para las cuatro políticas de `POL_POR_MESA`
   (`:5408`: pairwise, astro, optimal, optfree) cuando la segmentación está
   activa. Por eso esta sonda SOLO mide esas cuatro: para las otras cinco
   `segCmd` reparte la respuesta de línea a las mesas, y «por mesa» no
   significaría lo mismo. Se dice en vez de medirlas y llamarlo igual. */
const POL_POR_MESA = { pairwise: 1, astro: 1, optimal: 1, optfree: 1 };
/* `segOn` también vive fuera del bloque (`:5403`). Es una línea y se copia
   TAL CUAL, con su cita, en vez de reescribirla: si algún día cambia allí y
   no aquí, el test nulo de abajo dejaría de comprobar lo que cree. */
const segOn = T => !!(T && T.segTilt && T.segs);       // backtracking.html:5403
const VER = /const VER='([^']+)'/.exec(html)[1];
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();

/* ── la geometría: 8 líneas en cuesta, con TORSIÓN POR MESA ───────────────── */
const NR = 8, PITCH = 6.0, CW = 2.382, SLOPE = 6, NSEG = 4, LARGO = 90;
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const TORS = +arg('torsion', '3');                 // amplitud de la rótula, en grados

/* La geometría se arma EXACTAMENTE como la arma la página
   (`backtracking.html:4688-4695`): `nsSegments` para las mesas y `rotulaMesas`
   para la torsión por mesa. No se construye a mano ningún `segDrive` ni
   ningún `segPairs`: eso ya me salió mal una vez en esta sonda —un `segDrive`
   inventado con la forma equivocada reventó `applyDriveSeg`— y reescribir a
   mano lo que el motor ya sabe armar es cómo se acaba midiendo otra cosa. */
const rowTilt = new Array(NR).fill(0);
const groups = F.driveGroups(NR, 'quebrado');
const segs0 = F.nsSegments(NR, 'alineadas', NSEG, LARGO, 0.55, 2);
const ELEV = new Array(NR).fill(0).map((_, r) => -r * PITCH * Math.tan(SLOPE * Math.PI / 180));
const RM = F.rotulaMesas('rotula', TORS, 'quebrado', segs0, ELEV, groups, 0.55);
if (!RM) throw new Error('rotulaMesas no ha devuelto geometría: sin torsión por mesa esta sonda no mide nada');
const pairs = []; for (let i = 0; i < NR - 1; i++) pairs.push({ slope: SLOPE, pitch: PITCH, axisTilt: 0 });
const segs = RM.segs, segTilt = RM.segTilt;
const T = { pairs, cw: CW, axisAz: 0, maxAngle: 55, gcr: CW / PITCH, z0: 0.17, nBypass: 2, iam: 0.05,
            rowTilt, groups, drive: 'quebrado', segs, filaLen: LARGO,
            segTilt: RM.segTilt, segZ: RM.segZ, segSide: RM.segSide, segMorro: RM.segMorro,
            segPairs: RM.segPairs, segDrive: RM.segDrive };

const LAT = 41.5763, LON = -0.7981, ALT = 300, TL = 3.5, ALB = 0.2, TZ = 1;
const PASO = 10, DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const POLS = arg('pols', 'pairwise,optimal,optfree').split(',');
for (const k of POLS) if (!POL_POR_MESA[k])
  throw new Error(`\`${k}\` no está en POL_POR_MESA: para ella la rama por mesa reparte la de línea, y medirla aquí diría otra cosa`);
const MESES = arg('meses', 'todos') === 'todos' ? [0,1,2,3,4,5,6,7,8,9,10,11] : arg('meses', 'todos').split(',').map(Number);

console.log('R4 · ¿CUÁNTO CAMBIARÍA EL ANUAL POR MESA?\n');
console.log(`  commit ${sha} · ${VER}`);
console.log(`  geometría: ${NR} líneas × ${NSEG} mesas · cuesta E-O ${SLOPE}° · torsión por mesa ±${TORS}° (rótula)`);
console.log(`  ${MESES.length} de 12 meses · paso ${PASO} min · políticas: ${POLS.join(', ')}\n`);

/* ── TEST NULO ANTES DEL RECUENTO ──────────────────────────────────────────
   Dos cosas, y sin las dos la cifra de abajo no significa nada:
   1 · que la segmentación esté ENCENDIDA de verdad (`segOn`), o la rama por
       mesa sería la de línea con otro nombre;
   2 · que HAYA torsión por mesa, o las dos ramas coincidirían por construcción
       y el cero sería trivial. */
console.log('TEST NULO');
console.log(`  segmentación activa (segOn): ${segOn(T)}`);
if (!segOn(T)) throw new Error('sin segmentación la rama por mesa no existe: la medida no significa nada');
let tmax = 0, nmesas = 0;
for (let r = 0; r < segTilt.length; r++) for (const v of segTilt[r]) { nmesas++; tmax = Math.max(tmax, Math.abs(v - rowTilt[r])); }
console.log(`  mesas: ${nmesas} · torsión máx respecto a su línea: ${tmax.toFixed(4)}°`);
if (!(tmax > 1e-9)) throw new Error('sin torsión las dos ramas coinciden por construcción: el cero sería trivial');

const totLin = {}, totSeg = {}, difMax = {};
for (const k of POLS) { totLin[k] = 0; totSeg[k] = 0; difMax[k] = 0; }
const t0 = Date.now();
for (const mo of MESES) {
  const doy = F.doyOf('2026-' + String(mo + 1).padStart(2, '0') + '-21');
  const dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  const LZ = {}, LZS = {};
  for (const k of POLS) { LZ[k] = F.crearLazo(); LZS[k] = F.crearLazoSeg(); }
  for (let m = 0; m < 1440; m += PASO) {
    const g = F.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    const w = (PASO / 60) / 1000 * DIM[mo];
    for (const k of POLS) {
      /* la cadena que la página PUBLICA como anual: por línea, de punta a punta */
      const aL = F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles;
      const limL = LZ[k].paso(aL, PASO * 60);
      totLin[k] += F.poaPlant(g.zen, g.az, T, limL, irr, doy, ALB).plant * w;
      /* la cadena del DÍA: por mesa, de punta a punta */
      const aS = F.policyAnglesSeg(k, g.zen, g.az, T, irr, doy, ALB);
      const limS = LZS[k].paso(aS, PASO * 60);
      totSeg[k] += F.poaPlantSeg(g.zen, g.az, T, limS, irr, doy, ALB).plant * w;
      const mL = F.segLineMean(T, limS);
      for (let r = 0; r < limL.length; r++) difMax[k] = Math.max(difMax[k], Math.abs(limL[r] - mL[r]));
    }
  }
  console.error(`  mes ${mo + 1} (${MESES.indexOf(mo) + 1}/${MESES.length}) · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

console.log('\n  política     POR LÍNEA (lo publicado)   POR MESA        Δ            Δ %      |Δθ| máx');
for (const k of POLS) {
  const d = totSeg[k] - totLin[k];
  console.log(`  ${k.padEnd(10)} ${totLin[k].toFixed(6).padStart(22)}  ${totSeg[k].toFixed(6).padStart(14)}  ${d.toFixed(6).padStart(11)}  ${(100 * d / totLin[k]).toFixed(4).padStart(9)} %  ${difMax[k].toFixed(4).padStart(8)}°`);
}
console.log('\n  El Δ es lo que la cifra publicada se aparta de la que sale por la rama que la');
console.log('  fase 1 arregló. NO es el efecto del arreglo: es el tamaño del hueco entre las');
console.log('  dos rutas, que es lo que hay que conocer para decidir si merece cerrarlo.');
console.log(`\n  kWh/m² de planta · ${MESES.length} de 12 meses · geometría SINTÉTICA, no Ayora.`);

const dest = arg('json', '');
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ commit: sha, ver: VER,
    geometria: { nrows: NR, mesas_por_linea: NSEG, pitch: PITCH, cw: CW, slope_eo: SLOPE, torsion_max: tmax, n_mesas: nmesas },
    meses: MESES.map(m => m + 1), ES_EL_ANUAL_COMPLETO: MESES.length === 12, paso_min: PASO,
    kwh_m2: Object.fromEntries(POLS.map(k => [k, { por_linea: totLin[k], por_mesa: totSeg[k],
      delta: totSeg[k] - totLin[k], delta_pct: 100 * (totSeg[k] / totLin[k] - 1), dtheta_max: difMax[k] }])) }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
