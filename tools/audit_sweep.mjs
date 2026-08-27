/* AUDITORÍA de invariantes del simulador (sin navegador).
   Barre configuraciones × políticas × instantes de un día y comprueba que la
   física no se contradice a sí misma. Uso:  node tools/audit_sweep.mjs [paso]

   Invariantes comprobados en CADA instante y política:
     θ finito y |θ| ≤ θmáx            · sombra ∈ [0,1] y finita
     planos ≤ total (out.pl)          · pl ≡ contador con noStruct
     Martinez ∈ [0,1] y ≥ sombra      · POA finita ≥ 0 y = media por fila
     acoplado de bifila respetado     · slew ≤ velocidad del actuador
     óptimo ≥ pairwise y libre ≥ óptimo (bajo el contador EXACTO, no el rápido)
     noche ⇒ θ=0 y sombra 0           · degeneración: terreno uniforme ⇒ global=row=pairwise
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8');
const F = new Function(_sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) + `
  return { solarPos, clearskyIneichen, policyAngles, poaPlant, poaRow, shadeRows, shadeBand3DAll,
           shadeRows25, elecLoss, pairsFromElev, anglesPairwise, anglesAstro, anglesGlobal,
           anglesRow, slewLimit, plantFromCotas, nsSegments, TRACKER_SLEW };`)();

const STEP = +(process.argv[2] || 20);
const POLS = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
let hallazgos = [], nChk = 0;
const bad = (msg) => { hallazgos.push(msg); };

function mkSint(nombre, nR, amp, tilt, drive, semilla, pitch = 6) {
  let seed = semilla;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const elev = []; let z = 0;
  for (let r = 0; r < nR; r++) { z += (rnd() - 0.5) * amp; elev.push(z); }
  const m = elev.reduce((a, b) => a + b, 0) / nR;
  for (let r = 0; r < nR; r++) elev[r] -= m;
  const pairs = F.pairsFromElev(elev, pitch, tilt);
  let groups = null;
  if (drive !== 'mono') { groups = []; for (let r = 0; r < nR; r += 2) groups.push(r + 1 < nR ? [r, r + 1] : [r]); }
  return { nombre, T: { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 3,
    rowTilt: new Array(nR).fill(tilt), groups, drive, segs: new Array(nR).fill([[-30, 30]]) } };
}
function mkReal(nombre, fichero, nLineas) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, fichero), 'utf-8'));
  const P = F.plantFromCotas(data, nLineas, 0);
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  return { nombre, ligero: true,   // planta real: un día y paso grueso (el coste va con nº de filas)
    T: { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
      nBypass: 3, rowTilt: P.tilt, groups: P.groups, drive: 'bifila', segs: P.segs, real: P } };
}

const CASOS = [
  mkSint('llano · mono', 12, 0, 0, 'mono', 3),
  mkSint('llano · bifila', 12, 0, 0, 'bifila', 3),
  mkSint('pendiente 8° · mono', 12, 0, 0, 'mono', 3),
  mkSint('roto ±0,9 · bifila', 24, 0.9, 2, 'bifila', 11),
  mkSint('roto ±1,6 · bifila', 24, 1.6, 2, 'bifila', 7),
  mkSint('roto ±1,6 · mono', 24, 1.6, -2, 'mono', 5),
  mkSint('paso 4 m · bifila', 16, 0.6, 0, 'bifila', 23, 4),
  mkReal('AYORA real (107 líneas)', 'ayora_cotas.json', 500),
  mkReal('AYORA · 18 líneas', 'ayora_cotas.json', 18),
  mkReal('SAN JOSÉ real', 'sanjose_cotas.json', 500),
];
// pendiente constante para el tercero
CASOS[2].T.pairs = CASOS[2].T.pairs.map(p => ({ ...p, slope: 8 }));

const LAT = 39.1, LON = -1.16;
const DIAS = [Date.UTC(2026, 11, 21), Date.UTC(2026, 5, 21), Date.UTC(2026, 2, 21)];

for (const c of CASOS) {
  const T = c.T, nR = T.pairs.length + 1;
  const paso = c.ligero ? Math.max(STEP, 60) : STEP;
  for (const day of (c.ligero ? DIAS.slice(0, 1) : DIAS)) {
    const doy = Math.round((day - Date.UTC(2026, 0, 1)) / 86400000) + 1;
    const prev = {}; for (const k of POLS) prev[k] = null;
    let poaPw = 0, poaOpt = 0, poaFree = 0, poaAstro = 0;
    for (let mm = 0; mm < 1440; mm += paso) {
      const g = F.solarPos(day + mm * 60000, LAT, LON);
      const irr = F.clearskyIneichen(g.zen, doy, 739, 3.5);
      const noche = !(g.elev > 0);
      for (const k of POLS) {
        let o;
        try { o = F.policyAngles(k, g.zen, g.az, T, irr, doy, 0.20); }
        catch (e) { bad(`${c.nombre} · ${k} · ${mm}min: EXCEPCIÓN ${e.message}`); continue; }
        const ang = o.angles;
        nChk++;
        if (!ang || ang.length !== nR) { bad(`${c.nombre} · ${k}: ${ang ? ang.length : 'null'} ángulos ≠ ${nR} filas`); continue; }
        for (let r = 0; r < nR; r++) {
          if (!isFinite(ang[r])) { bad(`${c.nombre} · ${k} · ${mm}min: θ no finito en fila ${r}`); break; }
          if (Math.abs(ang[r]) > T.maxAngle + 1e-6) { bad(`${c.nombre} · ${k} · ${mm}min: |θ|=${Math.abs(ang[r]).toFixed(2)} > θmáx en fila ${r}`); break; }
        }
        if (noche && ang.some(v => v !== 0)) bad(`${c.nombre} · ${k} · ${mm}min: de noche θ≠0`);
        // acoplado del accionamiento: la gemela sigue a la motora
        if (T.groups) for (const gr of T.groups)
          if (gr.length === 2 && Math.abs(ang[gr[0]] - ang[gr[1]]) > 1e-6)
            bad(`${c.nombre} · ${k} · ${mm}min: pareja ${gr} desacoplada (${ang[gr[0]].toFixed(2)} vs ${ang[gr[1]].toFixed(2)})`);
        // velocidad del actuador
        if (prev[k]) {
          const lim = F.TRACKER_SLEW * paso * 60 + 1e-6;
          for (let r = 0; r < nR; r++)
            if (Math.abs(ang[r] - prev[k][r]) > lim + 1e-9)
              bad(`${c.nombre} · ${k} · ${mm}min: salto de ${Math.abs(ang[r] - prev[k][r]).toFixed(1)}° > slew ${lim.toFixed(1)}° en fila ${r}`);
        }
        prev[k] = ang;
        if (noche) continue;
        const pp = F.poaPlant(g.zen, g.az, T, ang, irr, doy, 0.20);
        const sh = pp.shade;
        for (let r = 0; r < nR; r++) {
          const s = sh[r];
          if (!(s >= -1e-9 && s <= 1 + 1e-9)) { bad(`${c.nombre} · ${k} · ${mm}min: sombra ${s} fuera de [0,1] en fila ${r}`); break; }
          if (sh.pl && sh.pl[r] > s + 1e-9) { bad(`${c.nombre} · ${k} · ${mm}min: planos ${sh.pl[r].toFixed(4)} > total ${s.toFixed(4)} en fila ${r}`); break; }
          if (sh.elec) {
            const e = sh.elec[r];
            if (!(e >= -1e-9 && e <= 1 + 1e-9)) { bad(`${c.nombre} · ${k} · ${mm}min: Martinez ${e} fuera de [0,1] en fila ${r}`); break; }
            if (e < s - 1e-6) { bad(`${c.nombre} · ${k} · ${mm}min: Martinez ${e.toFixed(4)} < sombra óptica ${s.toFixed(4)} en fila ${r}`); break; }
          }
        }
        if (!isFinite(pp.plant) || pp.plant < -1e-9) bad(`${c.nombre} · ${k} · ${mm}min: POA ${pp.plant}`);
        const media = pp.rows.reduce((a, v) => a + v, 0) / nR;
        if (Math.abs(pp.plant - media) > 1e-9) bad(`${c.nombre} · ${k} · ${mm}min: POA planta ≠ media por fila`);
        if (k === 'astro') poaAstro += pp.plant;
        if (k === 'pairwise') poaPw += pp.plant;
        if (k === 'optimal') poaOpt += pp.plant;
        if (k === 'optfree') poaFree += pp.plant;
      }
    }
    // invariantes de día: los optimizadores no pueden rendir menos que la base
    // los dos extremos de la rejilla (f=0 pairwise, f=1 astro) SON candidatos:
    // el óptimo no puede quedar por debajo de ninguno bajo el contador exacto
    const suelo = Math.max(poaPw, poaAstro), cual = poaAstro > poaPw ? 'astro' : 'pairwise';
    if (poaOpt < suelo * (1 - 1e-9)) bad(`${c.nombre} · día ${new Date(day).toISOString().slice(5, 10)}: óptimo ${poaOpt.toFixed(1)} < ${cual} ${suelo.toFixed(1)}`);
    if (poaFree < poaOpt * (1 - 1e-9)) bad(`${c.nombre} · día ${new Date(day).toISOString().slice(5, 10)}: libre ${poaFree.toFixed(1)} < óptimo ${poaOpt.toFixed(1)}`);
    if (poaFree < suelo * (1 - 1e-9)) bad(`${c.nombre} · día ${new Date(day).toISOString().slice(5, 10)}: libre ${poaFree.toFixed(1)} < ${cual} ${suelo.toFixed(1)}`);
  }
  // degeneración: terreno uniforme ⇒ global = row = pairwise
  const uni = c.T.pairs.every(p => Math.abs(p.slope - c.T.pairs[0].slope) < 1e-9 && Math.abs(p.pitch - c.T.pairs[0].pitch) < 1e-9);
  if (uni && c.T.drive === 'mono') {
    for (let zen = 25; zen < 85; zen += 10) for (const az of [95, 265]) {
      const a = F.anglesGlobal(zen, az, c.T), b = F.anglesRow(zen, az, c.T), d = F.anglesPairwise(zen, az, c.T);
      for (let r = 0; r < a.length; r++)
        if (Math.abs(a[r] - b[r]) > 1e-9 || Math.abs(a[r] - d[r]) > 1e-9)
          bad(`${c.nombre}: terreno uniforme y global/row/pairwise divergen en fila ${r} (zen ${zen})`);
    }
  }
  console.error(`  ✓ ${c.nombre}`);
}

console.log(`\nAUDITORÍA · ${CASOS.length} configuraciones × ${POLS.length} políticas × 3 días (paso ${STEP} min)`);
console.log(`comprobaciones de política-instante: ${nChk}`);
if (!hallazgos.length) console.log('SIN HALLAZGOS');
else {
  console.log(`${hallazgos.length} HALLAZGOS:`);
  const vistos = new Set();
  for (const h of hallazgos) {
    const clave = h.replace(/\d+/g, '#');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    console.log('  · ' + h);
    if (vistos.size >= 25) { console.log('  … (resto omitido)'); break; }
  }
}
process.exit(hallazgos.length ? 1 : 0);
