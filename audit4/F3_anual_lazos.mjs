/* R4 · FASE 3.5 — LA ENERGÍA ANUAL DE CADA POLÍTICA CON UN LAZO Y CON EL OTRO.
 *
 *   node audit4/F3_anual_lazos.mjs [--pols=…] [--meses=todos] [--json=RUTA]
 *
 * Réplica del bucle anual de la página (`backtracking.html:7596`: policyAngles
 * por línea → lazo → poaPlant), corriendo LAS DOS CADENAS DE LAZO EN LA MISMA
 * PASADA sobre el MISMO mando. Así la diferencia no puede venir de otra cosa:
 * misma geometría, mismos instantes, mismo cielo, mismo `poaPlant`.
 *
 * NO SE TOCA NINGÚN LAZO: el del núcleo se llama con sus propios parámetros,
 * que ya admite.
 *
 * LA GEOMETRÍA NO ES AYORA. Con las 107 líneas de la planta real y las nueve
 * políticas, un solo mes no cierra en 23 minutos (medido en 1.6), y 3.5
 * pregunta por la DIFERENCIA entre dos lazos, no por la cifra absoluta de una
 * planta concreta. Se usa una geometría sintética en cuesta, y el denominador
 * va en la salida para que nadie lea «Ayora» donde pone «sintética».
 */
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, crearLazo, solarPos,
  clearskyIneichen, doyOf, DEADBAND_DEG, TRACKER_SLEW };`)();
new Function(fs.readFileSync(path.join(ROOT, 'js/control_core.js'), 'utf-8')).call(globalThis);
const C = globalThis.CTRLCORE;
if (!C) throw new Error('CTRLCORE no ha cargado');
const VER = /const VER='([^']+)'/.exec(html)[1];
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();

/* geometría sintética: 12 líneas en cuesta E-O de 6°, eje N-S horizontal */
const NR = 12, PITCH = 6.0, CW = 2.382, SLOPE = 6;
const pairs = []; for (let i = 0; i < NR - 1; i++) pairs.push({ slope: SLOPE, pitch: PITCH, axisTilt: 0 });
const T = { pairs, cw: CW, axisAz: 0, maxAngle: 55, gcr: CW / PITCH, z0: 0.17, nBypass: 2,
            rowTilt: new Array(NR).fill(0), groups: null, drive: 'mono' };
const LAT = 41.5763, LON = -0.7981, ALT = 300, TL = 3.5, ALB = 0.2, TZ = 1;
const PASO_ANUAL_MIN = 10;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const POLS = arg('pols', 'astro,global,row,bt2d,pairwise,true3d,mgl,optimal,optfree').split(',');
const MESES = arg('meses', 'todos') === 'todos' ? [0,1,2,3,4,5,6,7,8,9,10,11] : arg('meses', 'todos').split(',').map(Number);

const LOOP = { deadbandDeg: F.DEADBAND_DEG, slewDegS: F.TRACKER_SLEW, cicloSeg: 1, maxAngle: 90 };
const t0 = Date.now();
const totP = {}, totN = {}, totSin = {}, difMax = {};
for (const k of POLS) { totP[k] = 0; totN[k] = 0; totSin[k] = 0; difMax[k] = 0; }

for (const mo of MESES) {
  const doy = F.doyOf('2026-' + String(mo + 1).padStart(2, '0') + '-21');
  const dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  /* un lazo por cadena y por día, como la página */
  const LZ = {}, EST = {};
  for (const k of POLS) { LZ[k] = F.crearLazo(); EST[k] = { th: null, dir: 0, park: null, dirUlt: 0, cmdAnt: null }; }
  for (let m = 0; m < 1440; m += PASO_ANUAL_MIN) {
    const g = F.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    const w = (PASO_ANUAL_MIN / 60) / 1000 * DIM[mo];
    for (const k of POLS) {
      const a = F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles;
      const pag = LZ[k].paso(a, PASO_ANUAL_MIN * 60);
      const S = EST[k];
      let nuc;
      if (S.th == null) { nuc = pag.slice(); }     // misma siembra que la página
      else {
        nuc = a.map((c, r) => {
          const R = C.execTramo(S.th[r], S.cmdAnt[r], c, PASO_ANUAL_MIN, LOOP, false, S.dir[r], S.park[r], S.dirUlt[r]);
          S.dir[r] = R.dir; S.park[r] = R.park; S.dirUlt[r] = R.dirUlt; return R.theta;
        });
      }
      if (S.th == null) { S.dir = a.map(() => 0); S.park = a.map(() => null); S.dirUlt = a.map(() => 0); }
      S.th = nuc; S.cmdAnt = a.slice();
      totP[k] += F.poaPlant(g.zen, g.az, T, pag, irr, doy, ALB).plant * w;
      totN[k] += F.poaPlant(g.zen, g.az, T, nuc, irr, doy, ALB).plant * w;
      totSin[k] += F.poaPlant(g.zen, g.az, T, a, irr, doy, ALB).plant * w;   // control: sin lazo
      for (let r = 0; r < pag.length; r++) difMax[k] = Math.max(difMax[k], Math.abs(pag[r] - nuc[r]));
    }
  }
  console.error(`  mes ${mo + 1} hecho (${MESES.indexOf(mo) + 1}/${MESES.length}) · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

/* ── TEST NULO ANTES DEL RECUENTO ──────────────────────────────────────────
   Si las dos cadenas fueran la misma —porque el estado del núcleo no se
   arrastrara, o porque `nuc` acabara siendo `pag`— los totales saldrían
   idénticos y parecería «los dos lazos dan lo mismo». Se comprueba que en
   ALGÚN paso los ángulos difieren de verdad. */
const difGlobal = Math.max(...POLS.map(k => difMax[k]));
console.log('\nTEST NULO');
console.log(`  |Δθ| máx entre las dos cadenas, en cualquier paso y fila: ${difGlobal.toFixed(6)}°`);
if (!(difGlobal > 1e-9)) throw new Error('las dos cadenas dan el MISMO ángulo siempre: el careo no mide nada');
const dist = new Set(POLS.map(k => totP[k].toFixed(9))).size;
console.log(`  políticas con total distinto (cadena página): ${dist} de ${POLS.length}`);

console.log(`\nENERGÍA ANUAL POR POLÍTICA · geometría sintética ${NR} líneas · cuesta E-O ${SLOPE}° · paso ${PASO_ANUAL_MIN} min · ${MESES.length} de 12 meses`);
console.log('  política     lazo página      lazo núcleo        Δ          Δ %     |Δθ| máx   (control: sin lazo)');
for (const k of POLS) {
  const d = totN[k] - totP[k];
  console.log(`  ${k.padEnd(10)} ${totP[k].toFixed(6).padStart(14)}  ${totN[k].toFixed(6).padStart(14)}  ${d.toFixed(6).padStart(10)}  ${(100 * d / totP[k]).toFixed(6).padStart(9)}  ${difMax[k].toFixed(4).padStart(8)}°  ${totSin[k].toFixed(6).padStart(14)}`);
}
console.log('\n  unidades: kWh/m² de planta. El control «sin lazo» es el mando crudo, sin deadband ni slew.');
if (MESES.length !== 12) console.log(`  OJO: ${MESES.length} de 12 meses. NO es el anual.`);

const dest = arg('json', '');
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ commit: sha, ver: VER, geometria: { nrows: NR, pitch: PITCH, cw: CW, slope_eo: SLOPE, axisTilt: 0 },
    sitio: { lat: LAT, lon: LON, alt: ALT, tl: TL }, paso_min: PASO_ANUAL_MIN,
    meses: MESES.map(m => m + 1), ES_EL_ANUAL_COMPLETO: MESES.length === 12,
    loop_nucleo: LOOP, politicas: POLS,
    kwh_m2: Object.fromEntries(POLS.map(k => [k, { pagina: totP[k], nucleo: totN[k], sin_lazo: totSin[k], dtheta_max: difMax[k] }])),
  }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
