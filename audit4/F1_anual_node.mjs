/* R4 · FASE 1.6 — LA ENERGÍA ANUAL, ANTES Y DESPUÉS, SIN NAVEGADOR
 *
 * POR QUÉ CAMBIA EL INSTRUMENTO. `audit4/F1_anual.mjs` pulsaba el botón del
 * anual en la página y esperaba a que se llenara la tabla. Estuvo 1 h 46 min
 * con el navegador al 1,8 % de CPU —o sea SIN calcular— y el nodo latiendo:
 * bloqueada esperando, no midiendo. Un límite inferior que sigue creciendo no
 * es una medida, así que se para y se cambia de instrumento en vez de dejarla
 * correr «a ver si sale». Por qué no calculaba queda NO DIAGNOSTICADO.
 *
 * QUÉ MIDE ESTE. La ruta anual de la página (`backtracking.html`, el bucle de
 * `yearbtn`) es íntegramente POR LÍNEA:
 *
 *     const a=policyAngles(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
 *     const lim=LZ[P.key].paso(a,PASO_ANUAL_MIN*60);
 *     tot[P.key]+=poaPlant(g.zen,g.az,T,lim,irr,doy,c.albedo).plant*...
 *
 * Aquí se corre ESE MISMO bucle, con esas mismas tres funciones sacadas del
 * bloque FÍSICA PURA del commit que se le pase, sobre la planta real de Ayora.
 *
 * NO ES LA PÁGINA, ES UNA RÉPLICA, y eso hay que decirlo: lo que se compara no
 * es «la réplica contra la página» sino «la réplica contra SÍ MISMA en dos
 * versiones del código». Para eso sirve, y para eso basta: si las tres
 * funciones no han cambiado, el anual no puede cambiar, y si han cambiado, se
 * ve aquí. El bucle se copia del fuente y se publica su cita.
 *
 * TEST NULO delante: las políticas tienen que dar totales DISTINTOS entre sí.
 * Si `optimal` y `pairwise` dieran el mismo número, la comparación antes/después
 * no distinguiría nada.
 *
 *     node audit4/F1_anual_node.mjs [--json=audit4/out/anual.json]
 */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, crearLazo, solarPos,
  clearskyIneichen, plantFromCotas, doyOf };`)();
const VER = /const VER='([^']+)'/.exec(html)[1];
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();

/* la planta REAL, la misma que usa el banco de física */
const P = F.plantFromCotas(JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')), 500, 0);
const pairs = [];
for (let i = 0; i < P.lineX.length - 1; i++) {
  const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
  pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
}
const T = { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
            nBypass: 3, rowTilt: P.tilt, groups: P.groups, drive: P.drive, segs: P.segs,
            segTilt: P.segTilt, segPairs: P.segPairs, segDrive: P.segDrive, segZ: P.segZ,
            segSide: P.segSide, segMorro: P.segMorro, real: P };
const LAT = 39.1182081, LON = -1.1598527, ALT = 500, TL = 3.5, ALB = 0.2, TZ = 1;
const PASO_ANUAL_MIN = 10;                       // el mismo que el bucle de la página
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const POLS = (process.argv.find(a => a.startsWith('--pols=')) || '--pols=pairwise,optimal,optfree').slice(7).split(',');

const t0 = Date.now();
const tot = {}; for (const k of POLS) tot[k] = 0;
for (let mo = 0; mo < 12; mo++) {
  const doy = F.doyOf('2026-' + String(mo + 1).padStart(2, '0') + '-21');
  const dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  /* UN LAZO POR CADENA Y POR DÍA, como la página: los doce días no son
     consecutivos y arrastrar el estado sería inventarse una historia */
  const LZ = {}; for (const k of POLS) LZ[k] = F.crearLazo();
  for (let m = 0; m < 1440; m += PASO_ANUAL_MIN) {
    const g = F.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    for (const k of POLS) {
      const a = F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles;
      const lim = LZ[k].paso(a, PASO_ANUAL_MIN * 60);
      tot[k] += F.poaPlant(g.zen, g.az, T, lim, irr, doy, ALB).plant * (PASO_ANUAL_MIN / 60) / 1000 * DIM[mo];
    }
  }
  console.error(`  mes ${mo + 1}/12 · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
/* TEST NULO: las políticas tienen que dar totales distintos */
const vals = POLS.map(k => tot[k]);
const distintas = new Set(vals.map(v => v.toFixed(9))).size;
const salida = {
  commit: sha, ver: VER, politicas: POLS, paso_min: PASO_ANUAL_MIN,
  planta: 'Ayora real (ayora_cotas.json), ' + T.segs.length + ' líneas',
  replica_de: 'el bucle de `yearbtn` de backtracking.html: policyAngles (línea) + crearLazo (línea) + poaPlant (línea)',
  advertencia: 'ES UNA RÉPLICA, no la página. Sirve para comparar la réplica contra SÍ MISMA en dos versiones del código, no para validar la página.',
  test_nulo_politicas_con_total_distinto: distintas + ' de ' + POLS.length,
  segundos: +((Date.now() - t0) / 1000).toFixed(1),
  kwh_m2_ano: Object.fromEntries(POLS.map(k => [k, +tot[k].toFixed(6)])),
  delta_vs_pairwise_pct: Object.fromEntries(POLS.map(k => [k, +(100 * (tot[k] / tot.pairwise - 1)).toFixed(6)])),
};
const dest = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7) || 'audit4/out/anual.json';
fs.mkdirSync(path.dirname(path.join(ROOT, dest)), { recursive: true });
fs.writeFileSync(path.join(ROOT, dest), JSON.stringify(salida, null, 1));
console.log(JSON.stringify(salida, null, 1));
