/* GIRO MÁXIMO (v1.79.0) · CUÁNTO MUEVE EL ARREGLO EL ANUAL DE LA PÁGINA, EN AYORA.
 *
 *   node audit_giro/G2_energia_anual.mjs --pol=pairwise
 *
 * El anual de la página (`yearbtn`) es `policyAngles → crearLazo → poaPlant`, sin
 * `topeBacktracking`: de los tres arreglos solo le llega el TOPE MECÁNICO del lazo.
 * Por eso la versión vieja y la nueva salen de la MISMA pasada: una sola
 * evaluación de la política por instante y DOS lazos, `crearLazo()` (v1.78.1,
 * sin tope) y `crearLazo(null,null,null,T.maxAngle)` (v1.79.0).
 * CONTROL: el lazo sin tope de esta rama ES el de v1.78.1 salvo la línea del
 * tope; `tools/test_backtracking_sim.mjs` (sus casos de lazo) lo cubre.
 * Réplica del bucle de la página (días 21, paso 10 min, un lazo por día, peso
 * DIM/1000), terreno como `terrain(c)` con planta real (banda de la página,
 * `plantFromCotas(datos, 80, 0)`), UTC+1 fijo. Punto de control por mes.
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const POL = arg('pol', 'pairwise'), DEST = path.join(ROOT, `audit_giro/out/G2_anual_ayora_${POL}.json`);
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, crearLazo, solarPos, clearskyIneichen, plantFromCotas, doyOf };`)();
const VER = /const VER='([^']+)'/.exec(html)[1];
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const P = F.plantFromCotas(datos, 80, 0), pairs = [];
for (let i = 0; i < P.lineX.length - 1; i++) { const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
  pairs.push({ slope: Math.atan2(P.pairDz ? P.pairDz[i] : 0, dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 }); }
const T = { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / +P.pitch.toFixed(2), z0: 0.17, nBypass: 2, iam: 0.05,
  rowTilt: P.tilt, groups: P.drive === 'mono' ? null : P.groups, drive: P.drive, lineX: P.lineX, segs: P.segs, segTilt: P.segTilt, segPairs: P.segPairs,
  segDrive: P.segDrive, segZ: P.segZ, segSide: P.segSide, segMorro: P.segMorro, filaLen: 2 * 28 * 1.146 + 0.55, real: P };
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, ALB = 0.2, TZ = 1, PASO = 10, DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let R = null; try { R = JSON.parse(fs.readFileSync(DEST, 'utf-8')); } catch (e) {}
if (!R || R.ver !== VER || R.pol !== POL) R = { pol: POL, ver: VER, banda: `${pairs.length + 1} líneas`, maxAngle: T.maxAngle, maquina: { cpu: os.cpus().length, carga: os.loadavg() }, meses: [] };
for (let mo = 0; mo < 12; mo++) {
  if (R.meses.some(m => m.mes === mo + 1)) continue;
  const t0 = Date.now(), ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = F.doyOf(ds), dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  const LV = F.crearLazo(), LN = F.crearLazo(null, null, null, T.maxAngle);
  let eV = 0, eN = 0, dth = 0, sobre = 0, inst = 0;
  for (let m = 0; m < 1440; m += PASO) {
    const g = F.solarPos(dia + m * 60000, LAT, LON); if (g.elev <= 0) continue; inst++;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL), w = (PASO / 60) / 1000 * DIM[mo];
    const a = F.policyAngles(POL, g.zen, g.az, T, irr, doy, ALB).angles;
    const lv = LV.paso(a.slice(), PASO * 60), ln = LN.paso(a.slice(), PASO * 60);
    for (let i = 0; i < lv.length; i++) { dth = Math.max(dth, Math.abs(lv[i] - ln[i])); if (Math.abs(lv[i]) > T.maxAngle + 1e-9) sobre++; }
    const pV = F.poaPlant(g.zen, g.az, T, lv, irr, doy, ALB).plant;
    const pN = lv.every((v, i) => v === ln[i]) ? pV : F.poaPlant(g.zen, g.az, T, ln, irr, doy, ALB).plant;   // mismos θ ⇒ misma POA
    eV += pV * w; eN += pN * w;
  }
  R.meses.push({ mes: mo + 1, instantes: inst, vieja: eV, nueva: eN, dth_max: dth, muestras_fila_sobre_tope_vieja: sobre, s: (Date.now() - t0) / 1000 });
  R.meses.sort((x, y) => x.mes - y.mes); fs.writeFileSync(DEST, JSON.stringify(R, null, 1));
  console.error(`${POL} mes ${mo + 1}: ${eV.toFixed(4)} → ${eN.toFixed(4)} (${(100 * (eN / eV - 1)).toFixed(4)} %) · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const s = k => R.meses.reduce((a, m) => a + m[k], 0);
console.log(`${POL.padEnd(9)} ${R.banda} · anual ${s('vieja').toFixed(4)} → ${s('nueva').toFixed(4)} kWh/m² · Δ ${(100 * (s('nueva') / s('vieja') - 1)).toFixed(4)} % · |Δθ| máx ${Math.max(...R.meses.map(m => m.dth_max)).toFixed(3)}° · muestras·fila sobre el tope (vieja) ${s('muestras_fila_sobre_tope_vieja')} · ${s('s').toFixed(0)} s`);
