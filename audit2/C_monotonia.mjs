#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   BLOQUE C — C.1 / C.2 / C.3 sobre el barrido de terrenos de CI.
   El generador de configuraciones y el armado de T se copian VERBATIM de
   tools/barrido_terrenos.mjs (líneas 66-104) para reproducir exactamente la
   misma secuencia pseudoaleatoria; no se modifica ese fichero.

   Ejecutable por un tercero:
     node audit2/C_monotonia.mjs [nCfg=40] [semilla=1] [pasoCriba=0.5] [nMuestra=200]
   Salidas: audit2/out/C1_instantes.csv, C2_muestra.csv, C2_barridos.csv,
            C3_contraejemplos.csv  (+ resumen por stdout)
   ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT  = path.join(ROOT, 'audit2', 'out'); fs.mkdirSync(OUT, { recursive: true });
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, shadeBand3DAll, pairsFromElev,
  nsSegments, solarPos, clearskyIneichen, mulberry32, driveGroups, effRowTilts, rotulaMesas, mvPara, rangosUnidad };`)();

const FIS = crypto.createHash('sha256').update(html.slice(j0, i1)).digest('hex').slice(0, 12);
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const SUCIO = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().split('\n')
  .filter(l => l.trim() && !/ANATOMIA_BT\.md|audit2\//.test(l));

const A = process.argv.slice(2);
const NCFG = +(A[0] || 40), SEED = +(A[1] || 1), PASO_CRIBA = +(A[2] || 0.5), NMUE = +(A[3] || 200);
const PASO_FINO = 0.25, SEED_MUESTRA = 20260917;
const TOL0 = 1e-9;            // "sombra de planos = 0" = fs <= TOL0
const TOL0B = 1e-4;           // variante declarada (fs <= 1e-4 = 0,01 % de una fila)
const RAD = Math.PI / 180;

/* ── VERBATIM de tools/barrido_terrenos.mjs:66-104 ───────────────────────── */
const rnd = F.mulberry32(SEED);
const pick = (a) => a[Math.floor(rnd() * a.length)];
function elevPreset(P, v, n, pitch) {
  const z = new Array(n).fill(0);
  if (P === 'pendiente') for (let i = 0; i < n; i++) z[i] = -i * pitch * Math.tan(v * RAD);
  else if (P === 'ondulado') for (let i = 0; i < n; i++) z[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
  else if (P === 'valle') for (let i = 0; i < n; i++) z[i] = v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
  else if (P === 'cresta') for (let i = 0; i < n; i++) z[i] = -v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2) + v;
  else if (P === 'aleatorio') { const r = F.mulberry32(Math.round(v) || 1); let acc = 0; for (let i = 0; i < n; i++) { z[i] = acc; acc += (r() - 0.5) * 2 * 0.12 * pitch; } }
  for (let i = 1; i < n; i++) { const dz = z[i - 1] - z[i], lim = pitch * Math.tan(30 * RAD); if (dz > lim) z[i] = z[i - 1] - lim; if (dz < -lim) z[i] = z[i - 1] + lim; }
  return z;
}
function nsProfile(preset, v, n) {
  const out = new Array(n).fill(v);
  if (preset === 'quebrado') for (let i = 0; i < n; i++) out[i] = i < n / 2 ? v : -v;
  else if (preset === 'senoidal') for (let i = 0; i < n; i++) out[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
  else if (preset === 'aleatorio') { const r = F.mulberry32(1234); for (let i = 0; i < n; i++) out[i] = (r() * 2 - 1) * v; }
  else if (preset === 'rotula') out.fill(0);
  return out;
}
function mkT(c) {
  const ELEV = elevPreset(c.tpreset, c.tparam, c.nrows, c.pitch);
  const groups = F.driveGroups(c.nrows, c.drive);
  const eff = F.effRowTilts(nsProfile(c.nspreset, c.axtilt, c.nrows), c.drive, groups);
  const filaLen = 2 * c.mods * 1.146 + 0.55;
  const segs = F.nsSegments(c.nrows, c.nsl, c.ntrk, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
  const RM = F.rotulaMesas(c.nspreset, c.axtilt, c.drive, segs, ELEV, groups, 0.55);
  const T = { pairs: F.pairsFromElev(ELEV, c.pitch, eff), cw: c.cw, axisAz: c.axaz, maxAngle: c.maxang, gcr: c.cw / c.pitch, z0: c.z0,
              nBypass: c.nbp, iam: c.iam, rowTilt: eff, groups, drive: c.drive, segs: RM ? RM.segs : segs, filaLen };
  if (RM) Object.assign(T, { segTilt: RM.segTilt, segZ: RM.segZ, segSide: RM.segSide, segMorro: RM.segMorro, segPairs: RM.segPairs, segDrive: RM.segDrive });
  return T;
}
function randomCfg() {
  const tp = pick(['llano', 'pendiente', 'pendiente', 'ondulado', 'valle', 'cresta', 'aleatorio']);
  const tparam = tp === 'pendiente' ? pick([-10, -6, -3, 3, 6, 10]) : tp === 'ondulado' ? pick([0.6, 1.2, 2]) : (tp === 'valle' || tp === 'cresta') ? pick([1, 2, 3]) : tp === 'aleatorio' ? pick([7, 13, 42]) : 0;
  const nsp = pick(['constante', 'constante', 'quebrado', 'senoidal', 'aleatorio', 'rotula']);
  const axtilt = nsp === 'constante' ? pick([0, 0, 3, -3, 6, -6]) : pick([2, 3, 4, 6]);
  const sitio = pick([{ nm: 'Zaragoza', lat: 41.5763, lon: -0.7981, alt: 300 }, { nm: 'Arequipa', lat: -16.59577, lon: -71.80644, alt: 1563 }]);
  return { tpreset: tp, tparam, nspreset: nsp, axtilt, drive: pick(['mono', 'bifila', 'quebrado']), nsl: pick(['alineadas', 'alineadas', 'tresbolillo', 'medios', 'bagnarelli']),
           ntrk: pick([1, 1, 2]), nrows: pick([6, 8, 10]), pitch: 6, cw: 2.382, maxang: 55, z0: 0.17, nbp: 2, iam: 0.05, mods: 28, axaz: pick([0, 0, 0, 15, -20]), sitio };
}
const nombre = (c) => `${c.sitio.nm} · ${c.tpreset}${c.tparam ? ' ' + c.tparam : ''} · N-S ${c.nspreset} ${c.axtilt}° · ${c.drive} · ${c.nsl} ×${c.ntrk} · ${c.nrows} filas · az ${c.axaz}°`;
const DIAS = [['21-jun', Date.UTC(2026, 5, 21), 172], ['21-mar', Date.UTC(2026, 2, 21), 80], ['21-dic', Date.UTC(2026, 11, 21), 355]];
/* ── fin del VERBATIM ────────────────────────────────────────────────────── */

/* sombra de PLANOS por filas, exactamente como la mide el invariante B del
   barrido (tools/barrido_terrenos.mjs:143-150): shadeBand3DAll con noStruct y
   descontando lo que el desglose atribuye a 'terreno'. */
function fsPlanos(zen, az, T, ang, nR) {
  const sh = F.shadeBand3DAll(zen, az, T, ang, { noStruct: true });
  let peor = 0;
  for (let r = 0; r < nR; r++) {
    const de = sh.de && sh.de[r] ? sh.de[r] : [];
    const filas = Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0));
    if (filas > peor) peor = filas;
  }
  return peor;
}

console.log('═'.repeat(84));
console.log(`BLOQUE C · monotonía · commit ${SHA}`);
console.log(`física (sha256 del bloque FÍSICA PURA, 12 hex) ${FIS} · árbol ${SUCIO.length ? 'SUCIO: ' + SUCIO.join(' | ') : 'limpio'}`);
console.log(`node ${process.version}`);
console.log(`barrido replicado: ${NCFG} configuraciones · semilla ${SEED} (semilla de CI, .github/workflows/bancos.yml:201)`);
console.log(`días ${DIAS.map(d => d[0]).join(', ')} · paso 20 min · umbral de sol elev > 2° (igual que el barrido)`);
console.log(`criba C.1: θ uniforme de -55° a +55° paso ${PASO_CRIBA}° · "sombra 0" = fs <= ${TOL0} (variante declarada fs <= ${TOL0B})`);
console.log(`muestra C.2: ${NMUE} instantes, mulberry32(${SEED_MUESTRA}) · barrido fino paso ${PASO_FINO}°`);
console.log(`sombra reportada: de PLANOS (noStruct, sin la parte 'terreno' del desglose). POA: poaPlant, albedo 0.2, TL 3.5, nb 2, b0 0.05, altitud del sitio, MV = mvPara(T,zen) publicado`);
console.log('═'.repeat(84));

/* ══ C.1 ══════════════════════════════════════════════════════════════════ */
const TH_CRIBA = []; for (let t = -55; t <= 55 + 1e-9; t += PASO_CRIBA) TH_CRIBA.push(+t.toFixed(4));
const inst = [];           // todos los instantes-configuración con sol > 2°
let t0 = Date.now(), nEval = 0;
for (let ci = 0; ci < NCFG; ci++) {
  const c = randomCfg(), T = mkT(c), nm = nombre(c), nR = c.nrows;
  const tors = Math.max(...T.rowTilt.slice(1).map((v, i) => Math.abs(v - T.rowTilt[i])));
  for (const [dnm, dia, doy] of DIAS) {
    for (let m = 0; m < 1440; m += 20) {
      const g = F.solarPos(dia + m * 60000, c.sitio.lat, c.sitio.lon);
      if (g.elev <= 2) continue;
      let min = Infinity, thMin = null;
      for (const th of TH_CRIBA) { const f = fsPlanos(g.zen, g.az, T, new Array(nR).fill(th), nR); nEval++; if (f < min) { min = f; thMin = th; } if (min <= TOL0) break; }
      inst.push({ ci, c, T, nR, tors, dnm, doy, dia, m, elev: g.elev, az: g.az, zen: g.zen, min, thMin,
                  mv: F.mvPara(T, g.zen), hay0: min <= TOL0, hay0b: min <= TOL0B, nm });
    }
  }
  if ((ci + 1) % 10 === 0) console.error(`  …${ci + 1}/${NCFG} configuraciones · ${inst.length} instantes · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const con0 = inst.filter(x => x.hay0), con0b = inst.filter(x => x.hay0b);
console.log(`\n── C.1 ────────────────────────────────────────────────────────────`);
console.log(`instantes-configuración con sol > 2°           : ${inst.length}   (denominador)`);
console.log(`  · con ALGÚN θ uniforme de sombra de planos 0 : ${con0.length}  (${(100*con0.length/inst.length).toFixed(2)} %)  [fs <= ${TOL0}]`);
console.log(`  · ídem con la variante fs <= ${TOL0B}          : ${con0b.length}  (${(100*con0b.length/inst.length).toFixed(2)} %)`);
console.log(`evaluaciones de shadeBand3DAll en la criba     : ${nEval} · ${((Date.now()-t0)/1000).toFixed(0)} s`);
if (con0.length === 0 || con0.length === inst.length)
  console.log(`TEST NULO: el predicado "existe θ con sombra de planos 0" es CONSTANTE (${con0.length ? 'siempre verdadero' : 'siempre falso'}) en el dominio medido = el recuento no informa.`);
else console.log(`TEST NULO: el predicado NO es constante (${con0.length} de ${inst.length}) = el recuento informa.`);

const bandas = [[2,5],[5,10],[10,20],[20,30],[30,45],[45,90]];
console.log(`\ndistribución por elevación solar (numerador con θ de sombra 0 / denominador de instantes):`);
for (const [a, b] of bandas) {
  const d = inst.filter(x => x.elev > a && x.elev <= b), n0 = d.filter(x => x.hay0).length;
  if (d.length) console.log(`   sol ${String(a).padStart(2)}–${String(b).padStart(2)}° : ${String(n0).padStart(5)} / ${String(d.length).padStart(5)}  (${(100*n0/d.length).toFixed(1)} %)`);
}
console.log(`\ndistribución por torsión máxima entre filas vecinas |rowTilt[i]-rowTilt[i+1]| (T.rowTilt tras effRowTilts):`);
for (const [a, b] of [[-0.001,0.001],[0.001,1],[1,3],[3,6],[6,100]]) {
  const d = inst.filter(x => x.tors > a && x.tors <= b), n0 = d.filter(x => x.hay0).length;
  if (d.length) console.log(`   torsión ${a<=0?'= 0':'> '+a+'° ≤ '+b+'°'} : ${String(n0).padStart(5)} / ${String(d.length).padStart(5)}  (${(100*n0/d.length).toFixed(1)} %)`);
}
fs.writeFileSync(path.join(OUT, 'C1_instantes.csv'),
  'cfg,nombre,dia,minZ,elev,az,torsion_max,mv,fs_min_criba,theta_fs_min,hay_cero\n' +
  inst.map(x => [x.ci, JSON.stringify(x.nm), x.dnm, x.m, x.elev.toFixed(4), x.az.toFixed(4), x.tors.toFixed(4), x.mv,
                 x.min.toExponential(6), x.thMin, x.hay0 ? 1 : 0].join(',')).join('\n') + '\n');

/* ══ C.2 y C.3 ════════════════════════════════════════════════════════════ */
const pool = con0.length ? con0 : inst;
const poolNota = con0.length ? 'instantes con θ de sombra 0' : 'TODOS los instantes (el filtro de C.1 dejó 0)';
const r2 = F.mulberry32(SEED_MUESTRA);
const idx = pool.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const mues = idx.slice(0, Math.min(NMUE, idx.length)).sort((a, b) => a - b).map(i => pool[i]);
console.log(`\n── C.2 ────────────────────────────────────────────────────────────`);
console.log(`muestra: ${mues.length} de ${pool.length} (${poolNota}) · barajado Fisher-Yates con mulberry32(${SEED_MUESTRA})`);

const TH_F = []; for (let t = -55; t <= 55 + 1e-9; t += PASO_FINO) TH_F.push(+t.toFixed(4));
const filasB = [], filasSw = [], contra = [];
let hist = {}, energiaTot = 0, energiaContra = 0;
t0 = Date.now();
for (let k = 0; k < mues.length; k++) {
  const x = mues[k], irr = F.clearskyIneichen(x.zen, x.doy, x.c.sitio.alt, 3.5);
  const fsv = [], poav = [];
  for (const th of TH_F) {
    const ang = new Array(x.nR).fill(th);
    fsv.push(fsPlanos(x.zen, x.az, x.T, ang, x.nR));
    poav.push(F.poaPlant(x.zen, x.az, x.T, ang, irr, x.doy, 0.2).plant);
  }
  // intervalos de sombra 0 y cruces del predicado "sombrea" (fs > TOL0)
  const pred = fsv.map(f => f > TOL0 ? 1 : 0);
  let cruces = 0; for (let i = 1; i < pred.length; i++) if (pred[i] !== pred[i - 1]) cruces++;
  const iv = []; let ini = null;
  for (let i = 0; i < pred.length; i++) { if (!pred[i] && ini === null) ini = TH_F[i]; if ((pred[i] || i === pred.length - 1) && ini !== null) { iv.push([ini, TH_F[pred[i] ? i - 1 : i]]); ini = null; } }
  let bi = 0; for (let i = 1; i < poav.length; i++) if (poav[i] > poav[bi]) bi = i;
  hist[cruces] = (hist[cruces] || 0) + 1;
  // energía del instante: POA de planta de la política publicada pairwise × 20/60 h
  const aP = F.policyAngles('pairwise', x.zen, x.az, x.T, irr, x.doy, 0.2).angles;
  const eInst = F.poaPlant(x.zen, x.az, x.T, aP, irr, x.doy, 0.2).plant * (20 / 60);
  energiaTot += eInst;
  // C.3: pares (θ1,θ2) con |θ2| < |θ1|, fs(θ1)=0, fs(θ2)>0
  const cer = []; for (let i = 0; i < fsv.length; i++) if (fsv[i] <= TOL0) cer.push(i);
  let peor = null, nPares = 0;
  if (cer.length) {
    const absMax = Math.max(...cer.map(i => Math.abs(TH_F[i])));
    for (let j = 0; j < fsv.length; j++) {
      if (fsv[j] <= TOL0) continue;
      if (Math.abs(TH_F[j]) >= absMax) continue;         // no existe θ1 de sombra 0 con |θ1| mayor
      nPares++;
      if (!peor || fsv[j] > peor.fs2) { let i1 = cer[0]; for (const i of cer) if (Math.abs(TH_F[i]) > Math.abs(TH_F[i1])) i1 = i;
        peor = { th1: TH_F[i1], fs1: fsv[i1], th2: TH_F[j], fs2: fsv[j] }; }
    }
  }
  if (peor) { energiaContra += eInst; contra.push({ x, ...peor, nPares }); }
  filasB.push([x.ci, JSON.stringify(x.nm), x.dnm, x.m, x.elev.toFixed(3), x.mv, JSON.stringify(iv.map(v => v.map(q => +q.toFixed(2)).join('…')).join(' ')),
               cruces, TH_F[bi], fsv[bi].toExponential(6), poav[bi].toFixed(4), nPares].join(','));
  for (let i = 0; i < TH_F.length; i++) filasSw.push([x.ci, x.dnm, x.m, TH_F[i], fsv[i].toExponential(8), poav[i].toFixed(6)].join(','));
  if ((k + 1) % 25 === 0) console.error(`  …C.2 ${k + 1}/${mues.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
fs.writeFileSync(path.join(OUT, 'C2_muestra.csv'), 'cfg,nombre,dia,minZ,elev,mv,intervalos_fs0,n_cruces,theta_poa_max,fs_en_theta_max,poa_max_Wm2,n_pares_contraejemplo\n' + filasB.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'C2_barridos.csv'), 'cfg,dia,minZ,theta_deg,fs_planos,poa_planta_Wm2\n' + filasSw.join('\n') + '\n');

console.log(`\nhistograma de nº de cambios de signo del predicado "sombrea" (fs > ${TOL0}), paso ${PASO_FINO}°:`);
for (const k of Object.keys(hist).map(Number).sort((a, b) => a - b))
  console.log(`   ${String(k).padStart(2)} cruces : ${String(hist[k]).padStart(4)} / ${mues.length}  (${(100*hist[k]/mues.length).toFixed(1)} %)`);
const multi = Object.entries(hist).filter(([k]) => +k > 1).reduce((a, [, v]) => a + v, 0);
console.log(`instantes con MÁS DE UN cruce: ${multi} / ${mues.length}  (${(100*multi/mues.length).toFixed(2)} %)`);
const setC = new Set(Object.keys(hist));
if (setC.size === 1) console.log(`TEST NULO: el nº de cruces es CONSTANTE (=${[...setC][0]}) en la muestra = el histograma no informa.`);

console.log(`\n── C.3 ────────────────────────────────────────────────────────────`);
console.log(`instantes de la muestra con contraejemplo del min(|θ|): ${contra.length} / ${mues.length}  (${(100*contra.length/mues.length).toFixed(2)} %)`);
console.log(`pares (θ1,θ2) contraejemplo, total sobre la rejilla de ${PASO_FINO}°: ${contra.reduce((a, c) => a + c.nPares, 0)}`);
console.log(`peso energético: ${energiaContra.toFixed(3)} de ${energiaTot.toFixed(3)} Wh/m² de la muestra = ${(100*energiaContra/energiaTot).toFixed(2)} %`);
console.log(`  (energía del instante = poaPlant con los θ PUBLICADOS de pairwise × 20/60 h; misma malla MV y mismos nb/b0/albedo)`);
if (contra.length === 0) console.log(`TEST NULO: el predicado "existe contraejemplo" es CONSTANTE FALSO en la muestra.`);
else if (contra.length === mues.length) console.log(`TEST NULO: el predicado "existe contraejemplo" es CONSTANTE VERDADERO en la muestra.`);
contra.sort((a, b) => b.fs2 - a.fs2);
console.log(`\nlos 20 de mayor fs(θ2):`);
console.log(`  #  θ1(fs=0)   fs1       θ2        fs2        sol°   MV  configuración · instante`);
for (let i = 0; i < Math.min(20, contra.length); i++) { const q = contra[i];
  console.log(`  ${String(i+1).padStart(2)} ${String(q.th1).padStart(7)}°  ${q.fs1.toExponential(2)}  ${String(q.th2).padStart(7)}°  ${(100*q.fs2).toFixed(4)} %  ${q.x.elev.toFixed(1).padStart(5)}  ${String(q.x.mv).padStart(3)}  ${q.x.nm} · ${q.x.dnm} ${String(Math.floor(q.x.m/60)).padStart(2,'0')}:${String(q.x.m%60).padStart(2,'0')}Z`); }
fs.writeFileSync(path.join(OUT, 'C3_contraejemplos.csv'),
  'cfg,nombre,dia,minZ,elev,mv,theta1_fs0,fs1,theta2,fs2,n_pares\n' +
  contra.map(q => [q.x.ci, JSON.stringify(q.x.nm), q.x.dnm, q.x.m, q.x.elev.toFixed(3), q.x.mv, q.th1, q.fs1.toExponential(6), q.th2, q.fs2.toExponential(6), q.nPares].join(',')).join('\n') + '\n');
console.log(`\nCSV escritos en audit2/out/: C1_instantes.csv C2_muestra.csv C2_barridos.csv C3_contraejemplos.csv`);
