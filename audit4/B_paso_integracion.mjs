/* R4 · ENCARGO B — EL PASO DE INTEGRACIÓN, NO LA LEY.
 *
 *   node audit4/B_paso_integracion.mjs [--json=RUTA]
 *
 * La fase 3 midió que los dos lazos de la casa son LA MISMA LEY: con un ciclo
 * por tramo coinciden en los cien pasos, |Δ| máx 0,000000°. Los 1,996° eran la
 * DISCRETIZACIÓN. Así que la pregunta deja de ser «cuál de los dos lazos» y
 * pasa a ser «a qué paso se integra», y eso lo fija el ciclo de control de la
 * TCU, no el simulador.
 *
 * B.2 pide el barrido: 1, 5, 10, 30, 60 y 300 s. ¿A partir de qué paso deja de
 * importar? Se mide en θ y en energía anual por política.
 *
 * POR QUÉ SE BARRE EL CICLO DEL NÚCLEO Y NO EL PASO DE LA REJILLA. Son dos
 * cosas distintas y confundirlas era fácil: el paso de la REJILLA es cada
 * cuánto se le pide una consigna nueva a la política (y cambiarlo cambia la
 * consigna, no solo su ejecución); el CICLO es cada cuánto el lazo decide
 * dentro de ese tramo. B pregunta por el segundo — «a qué paso se INTEGRA» —,
 * así que la rejilla se deja fija y se mueve el ciclo. El paso de rejilla se
 * barre aparte, al final, para que se vea que son ejes distintos.
 *
 * NO arregla nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf8');
const f0 = html.indexOf('FÍSICA PURA'), f1 = html.lastIndexOf('/* FIN-FÍSICA');
const fis = html.slice(html.lastIndexOf('/*', f0), f1);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf8');
const P = new Function(sol + fis + `return { crearLazo, DEADBAND_DEG, TRACKER_SLEW, policyAngles, poaPlant,
  solarPos, clearskyIneichen, doyOf };`).call(globalThis);
new Function(fs.readFileSync(path.join(ROOT, 'js/control_core.js'), 'utf8')).call(globalThis);
const C = globalThis.CTRLCORE;
if (!C) throw new Error('CTRLCORE no ha cargado');

/* B.2 pide 1, 5, 10, 30, 60 y 300 s. Se añade **600 s**, que no estaba en la
   lista y es el que más importa: el bucle anual de la página da UN paso por
   tramo de 10 min, o sea que integra con ciclo = 600 s. Sin esa columna el
   barrido diría a qué paso deja de importar sin decir en cuál estamos. */
const CICLOS = [1, 5, 10, 30, 60, 300, 600];
const DB = P.DEADBAND_DEG, SLEW = P.TRACKER_SLEW;

/* ── B.2a · EFECTO EN θ, sobre la misma rampa que usó la fase 3 ────────────*/
const DT = 600;
const cmds = [];
for (let k = 0; k < 40; k++) cmds.push(-50 + 2.5 * k);
for (let k = 0; k < 20; k++) cmds.push(50 - 0.4 * k);
for (let k = 0; k < 40; k++) cmds.push(42 - 2.5 * k);

function serie(ciclo) {
  const loop = { deadbandDeg: DB, slewDegS: SLEW, cicloSeg: ciclo, maxAngle: 90 };
  let th = null, d = 0, pk = null, du = 0, ant = null;
  const out = [];
  for (const c of cmds) {
    if (th == null) { th = c; ant = c; out.push(th); continue; }
    const r = C.execTramo(th, ant, c, DT / 60, loop, false, d, pk, du);
    th = r.theta; d = r.dir; pk = r.park; du = r.dirUlt; ant = c;
    out.push(th);
  }
  return out;
}

console.log('R4 · B — EL PASO DE INTEGRACIÓN\n');
console.log(`  banda ${DB}° · slew ${SLEW}°/s · tramo de rejilla ${DT / 60} min · ${cmds.length} pasos`);
console.log(`  canónico del núcleo: cicloSeg = ${C.CANON.cicloSeg} s (js/control_core.js:51)\n`);

/* TEST NULO: el ciclo = el tramo entero tiene que dar EXACTAMENTE lo mismo que
   el lazo de la página, porque la fase 3 midió que son la misma ley. Si no lo
   diera, este barrido estaría midiendo otra cosa. */
{
  const LZ = P.crearLazo(DB, SLEW);
  const pag = cmds.map(c => LZ.paso([c], DT)[0]);
  const nuc = serie(DT);
  let m = 0; for (let i = 0; i < pag.length; i++) m = Math.max(m, Math.abs(pag[i] - nuc[i]));
  console.log(`TEST NULO · ciclo = tramo entero contra el lazo de la página: |Δ| máx ${m.toExponential(2)}°`);
  if (m !== 0) throw new Error('el barrido no parte de la equivalencia que la fase 3 midió');
  console.log('  (la fase 3 ya lo midió; se re-comprueba aquí porque es la base de todo lo demás)\n');
}

console.log('B.2a · EFECTO EN θ — cada ciclo contra el SIGUIENTE MÁS FINO');
console.log('  ciclo      |Δθ| vs 1 s        |Δθ| vs el ciclo anterior      pasos que cambian');
const ref = serie(1);
const filas = [];
let ant = null;
for (const cs of CICLOS) {
  const s = serie(cs);
  const d1 = s.map((v, i) => Math.abs(v - ref[i]));
  const dp = ant ? s.map((v, i) => Math.abs(v - ant[i])) : null;
  const mx = a => Math.max(...a), rms = a => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
  const cambian = d1.filter(x => x > 1e-9).length;
  filas.push({ ciclo: cs, max_vs_1: mx(d1), rms_vs_1: rms(d1), max_vs_ant: dp ? mx(dp) : 0, cambian });
  console.log(`  ${String(cs).padStart(4)} s   ${mx(d1).toFixed(6).padStart(10)}° máx   ${(dp ? mx(dp).toFixed(6) : '—').padStart(12)}°              ${String(cambian).padStart(4)}/${s.length}`);
  ant = s;
}

/* ── B.2b · EFECTO EN LA ENERGÍA ANUAL ────────────────────────────────────*/
const NR = 12, PITCH = 6.0, CW = 2.382, SLOPE = 6;
const pairs = []; for (let i = 0; i < NR - 1; i++) pairs.push({ slope: SLOPE, pitch: PITCH, axisTilt: 0 });
const T = { pairs, cw: CW, axisAz: 0, maxAngle: 55, gcr: CW / PITCH, z0: 0.17, nBypass: 2, iam: 0.05,
            rowTilt: new Array(NR).fill(0), groups: null, drive: 'mono' };
const LAT = 41.5763, LON = -0.7981, ALT = 300, TL = 3.5, ALB = 0.2, TZ = 1;
const PASO_MIN = 10, DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const POLS = arg('pols', 'pairwise,true3d,mgl,optimal,optfree,astro').split(',');
const MESES = arg('meses', 'todos') === 'todos' ? [0,1,2,3,4,5,6,7,8,9,10,11] : arg('meses', 'todos').split(',').map(Number);

console.log(`\nB.2b · EFECTO EN LA ENERGÍA ANUAL · ${NR} líneas sintéticas · cuesta E-O ${SLOPE}° · paso de rejilla ${PASO_MIN} min · ${MESES.length}/12 meses`);
const tot = {};
for (const cs of CICLOS) tot[cs] = Object.fromEntries(POLS.map(k => [k, 0]));
const t0 = Date.now();
for (const mo of MESES) {
  const doy = P.doyOf('2026-' + String(mo + 1).padStart(2, '0') + '-21');
  const dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  const EST = {};
  for (const cs of CICLOS) { EST[cs] = {}; for (const k of POLS) EST[cs][k] = { th: null, dir: null, park: null, du: null, ant: null }; }
  for (let m = 0; m < 1440; m += PASO_MIN) {
    const g = P.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    const irr = P.clearskyIneichen(g.zen, doy, ALT, TL);
    const w = (PASO_MIN / 60) / 1000 * DIM[mo];
    for (const k of POLS) {
      const a = P.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles;   // el MANDO, común a todos los ciclos
      for (const cs of CICLOS) {
        const S = EST[cs][k], loop = { deadbandDeg: DB, slewDegS: SLEW, cicloSeg: cs, maxAngle: 90 };
        let th;
        if (S.th == null) { th = a.slice(); S.dir = a.map(() => 0); S.park = a.map(() => null); S.du = a.map(() => 0); }
        else th = a.map((c, r) => {
          const R = C.execTramo(S.th[r], S.ant[r], c, PASO_MIN, loop, false, S.dir[r], S.park[r], S.du[r]);
          S.dir[r] = R.dir; S.park[r] = R.park; S.du[r] = R.dirUlt; return R.theta;
        });
        S.th = th; S.ant = a.slice();
        tot[cs][k] += P.poaPlant(g.zen, g.az, T, th, irr, doy, ALB).plant * w;
      }
    }
  }
  console.error(`  mes ${mo + 1} (${MESES.indexOf(mo) + 1}/${MESES.length}) · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log('\n  kWh/m² por política y ciclo, y el % contra el ciclo de 1 s (el canónico del núcleo)');
console.log('  política    ' + CICLOS.map(c => (c + ' s').padStart(13)).join(''));
for (const k of POLS) {
  console.log(`  ${k.padEnd(10)}  ` + CICLOS.map(c => tot[c][k].toFixed(4).padStart(13)).join(''));
  console.log(`  ${''.padEnd(10)}  ` + CICLOS.map(c => (c === 1 ? '—' : (100 * (tot[c][k] / tot[1][k] - 1)).toFixed(4) + ' %').padStart(13)).join(''));
}

console.log('\n  ¿A PARTIR DE QUÉ PASO DEJA DE IMPORTAR?');
for (const k of POLS) {
  const peor = CICLOS.filter(c => c > 1).map(c => ({ c, p: Math.abs(100 * (tot[c][k] / tot[1][k] - 1)) }));
  const bajo = peor.filter(x => x.p < 0.01).map(x => x.c);
  console.log(`  ${k.padEnd(10)} ciclos con |Δ| < 0,01 % frente a 1 s: ${bajo.length ? bajo.join(', ') + ' s' : 'NINGUNO'}`);
}

const dest = arg('json', '');
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ banda: DB, slew: SLEW, ciclos: CICLOS, tramo_seg: DT,
    theta: filas, geometria: { nrows: NR, pitch: PITCH, cw: CW, slope_eo: SLOPE }, paso_rejilla_min: PASO_MIN,
    meses: MESES.map(m => m + 1), ES_EL_ANUAL_COMPLETO: MESES.length === 12,
    kwh_m2: Object.fromEntries(CICLOS.map(c => [c, tot[c]])) }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
