/* CAREO simulador ↔ producción por string (produccion.html), sobre Ayora.
   «Carea con el programa de generación por string que calculáis igual».

   Las dos páginas comen la MISMA física (produccion.html extrae el bloque
   FÍSICA PURA de backtracking.html) pero construyen la planta por caminos
   distintos: el simulador carga una ventana de 80 líneas del bloque con más
   mesas (plantFromCotas(cotas, 80)) y produccion.html la planta ENTERA
   (plantFromCotas(cotas, Infinity, 'all')). Aquí se casan las líneas por su x
   MEDIDA (lineXAbs) y las mesas por su tramo, y se comparan, instante a
   instante, el θ y la POA de cada mesa que las dos calculan para el mismo
   sol. Lo que produccion.html multiplica después (pStringW: cadena DC del
   Notebook, careada dígito a dígito contra su golden) no se repite aquí: si
   la POA por mesa es la misma, la energía por string es la misma.

   Lo que se espera: mesas INTERIORES de la ventana idénticas (θ y POA bit a
   bit); las dos líneas de BORDE de la ventana pueden diferir, porque en el
   simulador no tienen vecina por un lado y en la planta entera sí — se
   listan aparte, no se esconden.

     node tools/careo_produccion.mjs [fecha=2026-06-21] [paso=30] */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bt = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const pg = fs.readFileSync(path.join(ROOT, 'produccion.html'), 'utf-8');
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const f0 = bt.indexOf('FÍSICA PURA'), f1 = bt.indexOf('/* FIN-FÍSICA');
const fis = bt.slice(bt.lastIndexOf('/*', f0), f1);
const l0 = pg.indexOf('LÓGICA PURA'), l1 = pg.indexOf('/* FIN-LÓGICA');
const log = pg.slice(pg.lastIndexOf('/*', l0), l1);
const S = new Function(sol + fis + log + `
  return {F:{policyAngles, policyAnglesSeg, poaPlantSeg, poaPlant, plantFromCotas, solarPos, clearskyIneichen, skyWithClouds, anglesManual},
          buildTReal, plantaCotas, instant, localToUTCms, doyOf, pStringW};`).call(globalThis);
const F = S.F;
const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const args = process.argv.slice(2);
const FECHA = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-06-21';
const PASO = +(args.find(a => /^\d+$/.test(a)) || 30);

// ── la planta como la carga cada página ─────────────────────────────────────
const Pp = S.plantaCotas(F, cotas);                       // producción: entera
const Ps = F.plantFromCotas(cotas, 80, null);             // simulador: ventana de 80 líneas
const C = { lat: lay.clat, lon: lay.clon, date: FECHA, tz: 2, alt: Math.round(cotas.base), albedo: 0.20, cc: 0, tl: 3.5,
            pitch: Pp.pitch, cw: Pp.cw, maxang: Pp.maxAngle, nrows: Pp.elev.length, manual: false, manth: 0,
            elec: { mods: 28, wp: 590, gamma: -0.34, tamb: 20, wind: 1, uc: 29, uv: 0 } };
const Tp = S.buildTReal(F, C, Pp);
// el simulador (terrain() con planta real): pendiente por pareja desde el Δz del solape, tilts medidos,
// accionamiento de las cotas, z0 0,17, 2 subcadenas, IAM 0,05, eje a azimut 0 — los defaults de la página
const pairsS = [];
for (let i = 0; i < Ps.lineX.length - 1; i++) {
  const dx = Math.max(0.5, Ps.lineX[i + 1] - Ps.lineX[i]);
  pairsS.push({ slope: Math.atan2(Ps.pairDz ? Ps.pairDz[i] : 0, dx) * 180 / Math.PI, pitch: dx, axisTilt: (Ps.tilt[i] + Ps.tilt[i + 1]) / 2 });
}
const Ts = { pairs: pairsS, cw: Ps.cw, axisAz: 0, maxAngle: Ps.maxAngle, gcr: Ps.cw / Ps.pitch, z0: 0.17, nBypass: 2, iam: 0.05,
             rowTilt: Ps.tilt, groups: Ps.groups, drive: Ps.drive, segs: Ps.segs, segTilt: Ps.segTilt, segPairs: Ps.segPairs,
             segDrive: Ps.segDrive, filaLen: 2 * 28 * 1.146 + 0.55, real: Ps };
// ── casar líneas por x medida y mesas por tramo ──────────────────────────────
const mapL = new Map();   // línea del simulador → línea de producción
for (let i = 0; i < Ps.lineXAbs.length; i++) {
  let best = -1, bd = 0.05;
  for (let j = 0; j < Pp.lineXAbs.length; j++) { const d = Math.abs(Pp.lineXAbs[j] - Ps.lineXAbs[i]); if (d < bd) { bd = d; best = j; } }
  if (best >= 0) mapL.set(i, best);
}
let mesasCasadas = 0, mesasSinCasar = 0;
const mesaMap = [];   // [iS, kS, jP, kP]
for (const [i, j] of mapL) {
  // el norte de cada planta va referido a SU centro (ventana o planta entera):
  // las mesas se casan por orden y largo dentro de la línea, y se comprueba que
  // el desplazamiento de referencia es el MISMO para todas las mesas de la línea
  const nS = Ps.segs[i], nP = Pp.segs[j];
  if (nS.length !== nP.length) { mesasSinCasar += nS.length; continue; }
  const off = nP[0][0] - nS[0][0];
  for (let k = 0; k < nS.length; k++) {
    const a = nS[k], b = nP[k];
    if (Math.abs((b[0] - a[0]) - off) < 0.05 && Math.abs((b[1] - a[1]) - off) < 0.05) { mesaMap.push([i, k, j, k]); mesasCasadas++; } else mesasSinCasar++;
  }
}
// BORDE de la ventana: las dos líneas extremas Y sus compañeras de accionamiento
// (en bifila la gemela copia el θ de la motora: el borde se propaga por el eje
// de transmisión, no por la sombra)
const borde = new Set([0, Ps.lineX.length - 1]);
for (const g of (Ps.groups || [])) if (g.some(r => borde.has(r))) g.forEach(r => borde.add(r));
console.log(`careo simulador ↔ producción · Ayora · ${FECHA} · cada ${PASO} min`);
console.log(`  producción: ${Pp.elev.length} líneas, ${Pp.segs.reduce((s, l) => s + l.length, 0)} mesas · simulador (ventana): ${Ps.elev.length} líneas, ${Ps.segs.reduce((s, l) => s + l.length, 0)} mesas`);
console.log(`  líneas casadas por x medida: ${mapL.size}/${Ps.lineX.length} · mesas casadas por tramo: ${mesasCasadas} · sin casar: ${mesasSinCasar}`);
// tilt y pareja de cada mesa casada: tienen que ser LA MISMA medida
let tiltDif = 0;
for (const [i, k, j, kk] of mesaMap) if (Math.abs(Ps.segTilt[i][k] - Pp.segTilt[j][kk]) > 1e-9) tiltDif++;
console.log(`  tilt N-S por mesa distinto entre las dos plantas: ${tiltDif}`);
// ── instante a instante ─────────────────────────────────────────────────────
const doy = S.doyOf(FECHA);
let n = 0, peorTh = { v: 0 }, peorPoa = { v: 0 }, peorThB = { v: 0 }, peorPoaB = { v: 0 }, nIdent = 0, nInst = 0;
const ES = new Map(), EP = new Map();   // energía POA del día por mesa (Wh/m²), simulador / producción
let sunDif = 0;
for (let m = 0; m < 1440; m += PASO) {
  const r = S.instant(F, C, Tp, m);                       // producción, tal cual lo hace la página
  if (r.g.elev <= 0) continue;
  nInst++;
  const g = F.solarPos(S.localToUTCms(FECHA, m, C.tz), C.lat, C.lon);
  if (Math.abs(g.elev - r.g.elev) > 1e-9 || Math.abs(g.az - r.g.az) > 1e-9) sunDif++;
  const irr = F.skyWithClouds(F.clearskyIneichen(g.zen, doy, C.alt, C.tl), 0, g.zen);
  const segAng = F.policyAnglesSeg('pairwise', g.zen, g.az, Ts, irr, doy, C.albedo);
  const ps = F.poaPlantSeg(g.zen, g.az, Ts, segAng, irr, doy, C.albedo);
  let ident = true;
  for (const [i, k, j, kk] of mesaMap) {
    const dth = Math.abs(segAng[i][k] - r.segAng[j][kk]), dpoa = Math.abs(ps.segs[i][k] - r.segs[j][kk]);
    const key = i + '|' + k;
    ES.set(key, (ES.get(key) || 0) + ps.segs[i][k] * PASO / 60); EP.set(key, (EP.get(key) || 0) + r.segs[j][kk] * PASO / 60);
    const tgt = borde.has(i) ? [peorThB, peorPoaB] : [peorTh, peorPoa];
    if (dth > tgt[0].v) Object.assign(tgt[0], { v: dth, m, i, k, sim: segAng[i][k], prod: r.segAng[j][kk], elev: g.elev });
    if (dpoa > tgt[1].v) Object.assign(tgt[1], { v: dpoa, m, i, k, sim: ps.segs[i][k], prod: r.segs[j][kk], elev: g.elev });
    if (!borde.has(i) && (dth > 1e-9 || dpoa > 1e-9)) ident = false;
    n++;
  }
  if (ident) nIdent++;
}
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
console.log(`  instantes con sol: ${nInst} · comparaciones mesa-instante: ${n} · sol distinto entre páginas: ${sunDif}`);
console.log(`  líneas de borde (extremos de la ventana y sus gemelas de accionamiento): ${[...borde].sort((a, b) => a - b).join(', ')}`);
console.log(`  mesas INTERIORES idénticas (θ y POA bit a bit) en ${nIdent}/${nInst} instantes`);
console.log(`    peor |Δθ| interior: ${peorTh.v.toFixed(4)}°` + (peorTh.v > 0 ? ` (${hhmm(peorTh.m)} sol ${peorTh.elev.toFixed(1)}° línea ${peorTh.i} mesa ${peorTh.k}: sim ${peorTh.sim.toFixed(2)} · prod ${peorTh.prod.toFixed(2)})` : ''));
console.log(`    peor |ΔPOA| interior: ${peorPoa.v.toFixed(4)} W/m²` + (peorPoa.v > 0 ? ` (${hhmm(peorPoa.m)} sol ${peorPoa.elev.toFixed(1)}° línea ${peorPoa.i} mesa ${peorPoa.k}: sim ${peorPoa.sim.toFixed(1)} · prod ${peorPoa.prod.toFixed(1)})` : ''));
console.log(`  líneas de BORDE de la ventana (sin vecina por un lado en el simulador): peor |Δθ| ${peorThB.v.toFixed(2)}°` + (peorThB.v > 0 ? ` a las ${hhmm(peorThB.m)} (sol ${peorThB.elev.toFixed(1)}°)` : '') + ` · peor |ΔPOA| ${peorPoaB.v.toFixed(1)} W/m²`);
// energía del día por mesa
let eMax = 0, eMaxB = 0, eTotS = 0, eTotP = 0;
for (const [key, es] of ES) { const ep = EP.get(key); const i = +key.split('|')[0]; const d = Math.abs(es - ep) / Math.max(1, ep); if (borde.has(i)) eMaxB = Math.max(eMaxB, d); else { eMax = Math.max(eMax, d); eTotS += es; eTotP += ep; } }
console.log(`  energía POA del día por mesa (interior): simulador ${(eTotS / 1000 / (mesaMap.length || 1)).toFixed(3)} kWh/m² de media · producción ${(eTotP / 1000 / (mesaMap.length || 1)).toFixed(3)} · peor desviación relativa ${(eMax * 100).toFixed(4)} % · en el borde ${(eMaxB * 100).toFixed(2)} %`);
// y lo que produccion.html hace después: la POA por mesa × la cadena DC del Notebook
const ejemplo = mesaMap.find(([i]) => !borde.has(i));
if (ejemplo) {
  const [i, k] = ejemplo; const es = ES.get(i + '|' + k);
  console.log(`  ejemplo, línea ${i} mesa ${k}: POA día ${(es / 1000).toFixed(3)} kWh/m² → string de ${C.elec.mods}×${C.elec.wp} Wp a 20 °C: ${(S.pStringW(es / nInst * (1440 / PASO) / (1440 / PASO), C.elec.tamb, C.elec.wind, C.elec) / 1000).toFixed(2)} kW de media en horas de sol (pStringW del Notebook, golden ≤1e-9)`);
}
const veredicto = mesasCasadas === 0 ? 'NO SE PUDO CAREAR: ninguna mesa casada' : (peorTh.v <= 1e-9 && peorPoa.v <= 1e-9) ? 'IDÉNTICOS en las mesas interiores: el simulador y la producción por string calculan lo mismo'
  : (peorTh.v < 0.5 && peorPoa.v < 5) ? 'coinciden salvo diferencias pequeñas en las mesas interiores (ver arriba): revisar' : 'DIFIEREN en las mesas interiores: hay que explicarlo';
console.log('  veredicto: ' + veredicto);
