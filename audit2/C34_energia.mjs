#!/usr/bin/env node
/* 2.1 — COLUMNA DE POA en los contraejemplos de C.3 y C.4, con la población
   PARTIDA en dos según el despachador llame o no a `repairNoShade`.
   Reutiliza la MISMA muestra de E-C2/E-C4 leyendo audit2/out/C1_instantes.csv.
   Ejecutable:  node audit2/C34_energia.mjs [nCfg=40] [semilla=1] [nMuestra=200]
   Salida: audit2/out/C34.txt (stdout) + C34_c3.csv + C34_c4.csv               */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, shadeBand3DAll, pairsFromElev, nsSegments,
  solarPos, clearskyIneichen, mulberry32, driveGroups, effRowTilts, rotulaMesas, mvPara, applyDrive };`)();
const FIS = crypto.createHash('sha256').update(html.slice(j0, i1)).digest('hex').slice(0, 12);
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const A = process.argv.slice(2); const NCFG = +(A[0] || 40), SEED = +(A[1] || 1), NMUE = +(A[2] || 200);
const SEED_MUESTRA = 20260917, TOL0 = 1e-9, PASO = 0.25, RAD = Math.PI / 180;

/* ── VERBATIM de tools/barrido_terrenos.mjs:66-104 ──────────────────────── */
const rnd = F.mulberry32(SEED); const pick = a => a[Math.floor(rnd() * a.length)];
function elevPreset(P, v, n, pitch) { const z = new Array(n).fill(0);
  if (P === 'pendiente') for (let i = 0; i < n; i++) z[i] = -i * pitch * Math.tan(v * RAD);
  else if (P === 'ondulado') for (let i = 0; i < n; i++) z[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
  else if (P === 'valle') for (let i = 0; i < n; i++) z[i] = v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
  else if (P === 'cresta') for (let i = 0; i < n; i++) z[i] = -v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2) + v;
  else if (P === 'aleatorio') { const r = F.mulberry32(Math.round(v) || 1); let acc = 0; for (let i = 0; i < n; i++) { z[i] = acc; acc += (r() - 0.5) * 2 * 0.12 * pitch; } }
  for (let i = 1; i < n; i++) { const dz = z[i-1] - z[i], lim = pitch * Math.tan(30 * RAD); if (dz > lim) z[i] = z[i-1] - lim; if (dz < -lim) z[i] = z[i-1] + lim; } return z; }
function nsProfile(preset, v, n) { const out = new Array(n).fill(v);
  if (preset === 'quebrado') for (let i = 0; i < n; i++) out[i] = i < n/2 ? v : -v;
  else if (preset === 'senoidal') for (let i = 0; i < n; i++) out[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n/2)));
  else if (preset === 'aleatorio') { const r = F.mulberry32(1234); for (let i = 0; i < n; i++) out[i] = (r()*2-1)*v; }
  else if (preset === 'rotula') out.fill(0); return out; }
function mkT(c) { const ELEV = elevPreset(c.tpreset, c.tparam, c.nrows, c.pitch);
  const groups = F.driveGroups(c.nrows, c.drive);
  const eff = F.effRowTilts(nsProfile(c.nspreset, c.axtilt, c.nrows), c.drive, groups);
  const filaLen = 2*c.mods*1.146+0.55;
  const segs = F.nsSegments(c.nrows, c.nsl, c.ntrk, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(x => x.slice());
  const RM = F.rotulaMesas(c.nspreset, c.axtilt, c.drive, segs, ELEV, groups, 0.55);
  const T = { pairs: F.pairsFromElev(ELEV, c.pitch, eff), cw: c.cw, axisAz: c.axaz, maxAngle: c.maxang, gcr: c.cw/c.pitch, z0: c.z0,
              nBypass: c.nbp, iam: c.iam, rowTilt: eff, groups, drive: c.drive, segs: RM ? RM.segs : segs, filaLen };
  if (RM) Object.assign(T, { segTilt: RM.segTilt, segZ: RM.segZ, segSide: RM.segSide, segMorro: RM.segMorro, segPairs: RM.segPairs, segDrive: RM.segDrive });
  return T; }
function randomCfg() { const tp = pick(['llano','pendiente','pendiente','ondulado','valle','cresta','aleatorio']);
  const tparam = tp==='pendiente'?pick([-10,-6,-3,3,6,10]):tp==='ondulado'?pick([0.6,1.2,2]):(tp==='valle'||tp==='cresta')?pick([1,2,3]):tp==='aleatorio'?pick([7,13,42]):0;
  const nsp = pick(['constante','constante','quebrado','senoidal','aleatorio','rotula']);
  const axtilt = nsp==='constante'?pick([0,0,3,-3,6,-6]):pick([2,3,4,6]);
  const sitio = pick([{nm:'Zaragoza',lat:41.5763,lon:-0.7981,alt:300},{nm:'Arequipa',lat:-16.59577,lon:-71.80644,alt:1563}]);
  return { tpreset:tp, tparam, nspreset:nsp, axtilt, drive:pick(['mono','bifila','quebrado']), nsl:pick(['alineadas','alineadas','tresbolillo','medios','bagnarelli']),
           ntrk:pick([1,1,2]), nrows:pick([6,8,10]), pitch:6, cw:2.382, maxang:55, z0:0.17, nbp:2, iam:0.05, mods:28, axaz:pick([0,0,0,15,-20]), sitio }; }
const nombre = c => `${c.sitio.nm} · ${c.tpreset}${c.tparam?' '+c.tparam:''} · N-S ${c.nspreset} ${c.axtilt}° · ${c.drive} · ${c.nsl} ×${c.ntrk} · ${c.nrows} filas · az ${c.axaz}°`;
const DIAS = [['21-jun',Date.UTC(2026,5,21),172],['21-mar',Date.UTC(2026,2,21),80],['21-dic',Date.UTC(2026,11,21),355]];
function fsPlanos(zen, az, T, ang, nR) { const sh = F.shadeBand3DAll(zen, az, T, ang, { noStruct: true }); let p = 0;
  for (let r = 0; r < nR; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : [];
    p = Math.max(p, Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); } return p; }

/* ── quién lleva guardia, leído del despachador ──────────────────────────── */
const DESPACHADOR = html.split('\n').slice(3362, 3369).join('\n');
const CON_GUARDIA = ['pairwise', 'true3d', 'mgl'], SIN_GUARDIA = ['astro', 'row'];
console.log('═'.repeat(96));
console.log(`E-C6/E-C7 · columna de POA en los contraejemplos · commit ${SHA} · física ${FIS} · node ${process.version}`);
console.log(`muestra: la MISMA de E-C2/E-C4 · ${NCFG} configuraciones · semilla ${SEED} · mulberry32(${SEED_MUESTRA})`);
console.log(`sombra: de PLANOS (noStruct, sin 'terreno') · POA: poaPlant(...).plant · nb 2 · b0 0,05 · albedo 0,20 · TL 3,5 · MV = mvPara(T,zen)`);
console.log('═'.repeat(96));
console.log(`\nVERIFICACIÓN PEDIDA — ¿llama el despachador a repairNoShade para astro y para row?`);
console.log(`backtracking.html:3363-3369:\n`);
console.log(DESPACHADOR);
console.log(`\n⇒ astro (3363) y row (3366): SOLO applyDrive, SIN repairNoShade  ⇒ población (i), SIN GUARDIA`);
console.log(`⇒ true3d (3367), mgl (3368) y pairwise (3369, el return final): CON repairNoShade ⇒ población (ii), CON GUARDIA`);
console.log(`⇒ global (3364) y bt2d (3365) tampoco llaman a repairNoShade, pero publican UN ángulo para todas las filas:`);
console.log(`   applyDrive es un no-op y no hay elección de min(|θ|) que medir. Quedan fuera de las dos poblaciones.`);

/* ── reconstrucción de la muestra ────────────────────────────────────────── */
const csv = fs.readFileSync(path.join(OUT, 'C1_instantes.csv'), 'utf-8').trim().split('\n').slice(1);
const hay0 = new Set();
for (const l of csv) { const f = l.split(','); if (f[f.length-1].trim() === '1') hay0.add(f[0] + '|' + f[f.length-9] + '|' + f[f.length-8]); }
const inst = [];
for (let ci = 0; ci < NCFG; ci++) { const c = randomCfg(), T = mkT(c), nm = nombre(c);
  for (const [dnm, dia, doy] of DIAS) for (let m = 0; m < 1440; m += 20) {
    const g = F.solarPos(dia + m*60000, c.sitio.lat, c.sitio.lon);
    if (g.elev <= 2 || !hay0.has(ci + '|' + dnm + '|' + m)) continue;
    inst.push({ ci, c, T, nR: c.nrows, nm, dnm, doy, m, ...g }); } }
const r2 = F.mulberry32(SEED_MUESTRA);
const idx = inst.map((_, i) => i); for (let i = idx.length-1; i > 0; i--) { const j = Math.floor(r2()*(i+1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const mues = idx.slice(0, Math.min(NMUE, idx.length)).sort((a,b)=>a-b).map(i => inst[i]);
console.log(`\nmuestra reconstruida: ${mues.length} instantes`);

/* ══ C.3 con POA: barrido de θ UNIFORME ══════════════════════════════════ */
const TH = []; for (let t = -55; t <= 55 + 1e-9; t += PASO) TH.push(+t.toFixed(4));
const c3 = []; let eTot = 0, eContra = 0, tGana = 0, tPierde = 0;
let t0 = Date.now();
for (let q = 0; q < mues.length; q++) {
  const x = mues[q], irr = F.clearskyIneichen(x.zen, x.doy, x.c.sitio.alt, 3.5);
  const fsv = TH.map(th => fsPlanos(x.zen, x.az, x.T, new Array(x.nR).fill(th), x.nR));
  const poa = TH.map(th => F.poaPlant(x.zen, x.az, x.T, new Array(x.nR).fill(th), irr, x.doy, 0.2).plant);
  const aP = F.policyAngles('pairwise', x.zen, x.az, x.T, irr, x.doy, 0.2).angles;
  const eInst = F.poaPlant(x.zen, x.az, x.T, aP, irr, x.doy, 0.2).plant * (20/60);
  eTot += eInst;
  const cer = []; for (let i = 0; i < fsv.length; i++) if (fsv[i] <= TOL0) cer.push(i);
  if (!cer.length) continue;
  let i1 = cer[0]; for (const i of cer) if (Math.abs(TH[i]) > Math.abs(TH[i1])) i1 = i;   // θ1: sombra 0 de mayor |θ|
  const absMax = Math.abs(TH[i1]);
  let peor = null;
  for (let j = 0; j < fsv.length; j++) {
    if (fsv[j] <= TOL0 || Math.abs(TH[j]) >= absMax) continue;
    if (!peor || fsv[j] > peor.fs2) peor = { th2: TH[j], fs2: fsv[j], poa2: poa[j] };
  }
  if (!peor) continue;
  eContra += eInst;
  // el θ que ELEGIRÍA la regla del min(|θ|) entre los que sombrean por debajo de |θ1|
  let jm = -1; for (let j = 0; j < fsv.length; j++) { if (fsv[j] <= TOL0 || Math.abs(TH[j]) >= absMax) continue;
    if (jm < 0 || Math.abs(TH[j]) < Math.abs(TH[jm])) jm = j; }
  const dPOA = poa[jm] - poa[i1];
  if (dPOA > 0) tGana++; else tPierde++;
  c3.push({ x, th1: TH[i1], fs1: fsv[i1], poa1: poa[i1], thMin: TH[jm], fsMin: fsv[jm], poaMin: poa[jm], dPOA,
            th2: peor.th2, fs2: peor.fs2, poa2: peor.poa2, eInst });
  if ((q+1) % 25 === 0) console.error(`  …C.3 ${q+1}/${mues.length} · ${((Date.now()-t0)/1000).toFixed(0)} s`);
}
console.log(`\n── E-C6 · C.3 con POA · barrido de θ UNIFORME ──────────────────────────`);
console.log(`Este barrido NO es de ninguna política: θ uniforme no pasa por el despachador, así que no hay`);
console.log(`guardia que separar. La partición (i)/(ii) se aplica en E-C7, que sí usa policyAngles.`);
console.log(`instantes con contraejemplo: ${c3.length} / ${mues.length}  (${(100*c3.length/mues.length).toFixed(2)} %)`);
console.log(`peso energético: ${eContra.toFixed(3)} de ${eTot.toFixed(3)} Wh/m² = ${(100*eContra/eTot).toFixed(2)} %`);
console.log(`ΔPOA = POA(θ del min|θ|) − POA(θ sin sombra):`);
console.log(`   el θ del min(|θ|) GANA energía en ${tGana} de ${c3.length} instantes  (${(100*tGana/Math.max(1,c3.length)).toFixed(2)} %)`);
console.log(`   y PIERDE en ${tPierde}  (${(100*tPierde/Math.max(1,c3.length)).toFixed(2)} %)`);
const ds = c3.map(o => o.dPOA).sort((a,b)=>a-b);
const qf = f => ds.length ? ds[Math.min(ds.length-1, Math.floor(f*ds.length))] : null;
if (ds.length) console.log(`   ΔPOA: mín ${ds[0].toFixed(4)} · p25 ${qf(0.25).toFixed(4)} · mediana ${qf(0.5).toFixed(4)} · p75 ${qf(0.75).toFixed(4)} · máx ${ds[ds.length-1].toFixed(4)} W/m²`);
c3.sort((a,b)=>a.dPOA-b.dPOA);
console.log(`\n   los 10 de ΔPOA más NEGATIVO (el min|θ| pierde más):`);
console.log(`    #   θ sin sombra  POA      θ del min|θ|  fs       POA       ΔPOA       sol°  configuración · instante`);
for (let i = 0; i < Math.min(10, c3.length); i++) { const o = c3[i];
  console.log(`   ${String(i+1).padStart(2)}  ${String(o.th1).padStart(8)}°  ${o.poa1.toFixed(2).padStart(8)}  ${String(o.thMin).padStart(8)}°  ${(100*o.fsMin).toFixed(2).padStart(6)} %  ${o.poaMin.toFixed(2).padStart(8)}  ${o.dPOA.toFixed(3).padStart(9)}  ${o.x.elev.toFixed(1).padStart(5)}  ${o.x.nm} · ${o.x.dnm} ${String(Math.floor(o.x.m/60)).padStart(2,'0')}:${String(o.x.m%60).padStart(2,'0')}Z`); }
fs.writeFileSync(path.join(OUT, 'C34_c3.csv'), 'cfg,nombre,dia,minZ,elev,theta_sin_sombra,fs1,poa1,theta_min_abs,fs_min,poa_min,dPOA,theta_peor_fs,fs_peor,poa_peor,energia_instante_Wh\n' +
  c3.map(o => [o.x.ci, JSON.stringify(o.x.nm), o.x.dnm, o.x.m, o.x.elev.toFixed(3), o.th1, o.fs1.toExponential(6), o.poa1.toFixed(6), o.thMin, o.fsMin.toExponential(6), o.poaMin.toFixed(6), o.dPOA.toFixed(6), o.th2, o.fs2.toExponential(6), o.poa2.toFixed(6), o.eInst.toFixed(6)].join(',')).join('\n') + '\n');

/* ══ C.4 con POA: acople real, partido por guardia ═══════════════════════ */
const conG = mues.filter(x => x.T.groups && x.T.groups.length);
console.log(`\n── E-C7 · C.4 con POA · acople real (applyDrive) ───────────────────────`);
console.log(`denominador: ${conG.length} instantes con accionamiento agrupado (de ${mues.length}; en ${mues.length-conG.length} monofila applyDrive es la identidad)`);
const c4 = []; const acc = {};
for (const k of [...SIN_GUARDIA, ...CON_GUARDIA]) acc[k] = { n: 0, hits: 0, gana: 0, pierde: 0, eTot: 0, eHit: 0, ds: [] };
t0 = Date.now();
for (let q = 0; q < conG.length; q++) {
  const x = conG[q], irr = F.clearskyIneichen(x.zen, x.doy, x.c.sitio.alt, 3.5);
  for (const key of [...SIN_GUARDIA, ...CON_GUARDIA]) {
    const ang = F.policyAngles(key, x.zen, x.az, x.T, irr, x.doy, 0.2).angles;
    const fs0 = fsPlanos(x.zen, x.az, x.T, ang, x.nR);
    const p0 = F.poaPlant(x.zen, x.az, x.T, ang, irr, x.doy, 0.2).plant;
    acc[key].n++; acc[key].eTot += p0 * (20/60);
    if (fs0 <= TOL0) continue;
    for (let gi = 0; gi < x.T.groups.length; gi++) {
      const gr = x.T.groups[gi]; if (gr.length < 2) continue;
      let mejor = null, pMejor = null;
      for (const th of TH) { const a2 = ang.slice(); for (const r of gr) a2[r] = th;
        if (fsPlanos(x.zen, x.az, x.T, a2, x.nR) <= TOL0) {
          const pp = F.poaPlant(x.zen, x.az, x.T, a2, irr, x.doy, 0.2).plant;
          if (mejor === null || Math.abs(th) < Math.abs(mejor)) { mejor = th; pMejor = pp; } } }
      if (mejor !== null) {
        const d = p0 - pMejor;           // >0: lo publicado GANA energía frente a la postura sin sombra
        acc[key].hits++; acc[key].eHit += p0 * (20/60); acc[key].ds.push(d);
        if (d > 0) acc[key].gana++; else acc[key].pierde++;
        c4.push({ x, key, grupo: gr, thPub: ang[gr[0]], fs0, poaPub: p0, thCero: mejor, poaCero: pMejor, dPOA: d,
                  guardia: CON_GUARDIA.includes(key) });
        break;
      }
    }
  }
  if ((q+1) % 10 === 0) console.error(`  …C.4 ${q+1}/${conG.length} · ${((Date.now()-t0)/1000).toFixed(0)} s`);
}
const med = a => { if (!a.length) return null; const s = a.slice().sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
for (const [tit, lista, etiqueta] of [
  ['(i) POLÍTICAS SIN GUARDIA — el despachador NO llama a repairNoShade', SIN_GUARDIA, 'CONTRAEJEMPLO: pérdida neta si ΔPOA < 0'],
  ['(ii) POLÍTICAS CON GUARDIA — el despachador SÍ llama a repairNoShade', CON_GUARDIA, 'DECISIÓN DE LA GUARDIA v1.57.2']]) {
  console.log(`\n  ${tit}`);
  console.log(`  etiqueta: ${etiqueta}`);
  console.log(`  política   instantes  con caso   %      peso energético   ΔPOA>0 (lo publicado gana)  ΔPOA<=0 (pierde)  ΔPOA mediana   ΔPOA peor`);
  for (const k of lista) { const a = acc[k];
    console.log(`  ${k.padEnd(10)} ${String(a.n).padStart(9)}  ${String(a.hits).padStart(8)}  ${(100*a.hits/Math.max(1,a.n)).toFixed(2).padStart(5)}  ${(100*a.eHit/Math.max(1e-9,a.eTot)).toFixed(2).padStart(14)} %  ${String(a.gana).padStart(25)}  ${String(a.pierde).padStart(16)}  ${a.ds.length?med(a.ds).toFixed(4).padStart(12):'—'.padStart(12)}  ${a.ds.length?Math.min(...a.ds).toFixed(4).padStart(10):'—'}`);
  }
}
console.log(`\n  los 12 casos de ΔPOA más NEGATIVO (lo publicado pierde más energía que la postura sin sombra):`);
c4.sort((a,b)=>a.dPOA-b.dPOA);
console.log(`   #  política  guardia  grupo    θ publicado  fs       POA pub   θ sombra0   POA      ΔPOA      sol°  configuración · instante`);
for (let i = 0; i < Math.min(12, c4.length); i++) { const o = c4[i];
  console.log(`  ${String(i+1).padStart(2)}  ${o.key.padEnd(8)}  ${(o.guardia?'SÍ':'NO').padEnd(7)}  [${o.grupo.join(',')}]`.padEnd(42) +
    `${o.thPub.toFixed(2).padStart(8)}°  ${(100*o.fs0).toFixed(2).padStart(6)} %  ${o.poaPub.toFixed(2).padStart(8)}  ${String(o.thCero).padStart(8)}°  ${o.poaCero.toFixed(2).padStart(8)}  ${o.dPOA.toFixed(3).padStart(9)}  ${o.x.elev.toFixed(1).padStart(5)}  ${o.x.nm} · ${o.x.dnm} ${String(Math.floor(o.x.m/60)).padStart(2,'0')}:${String(o.x.m%60).padStart(2,'0')}Z`); }
fs.writeFileSync(path.join(OUT, 'C34_c4.csv'), 'politica,lleva_guardia,cfg,nombre,dia,minZ,elev,grupo,theta_publicado,fs_publicada,poa_publicada,theta_sombra0,poa_sombra0,dPOA\n' +
  c4.map(o => [o.key, o.guardia?1:0, o.x.ci, JSON.stringify(o.x.nm), o.x.dnm, o.x.m, o.x.elev.toFixed(3), '"['+o.grupo.join(',')+']"', o.thPub.toFixed(4), o.fs0.toExponential(6), o.poaPub.toFixed(6), o.thCero, o.poaCero.toFixed(6), o.dPOA.toFixed(6)].join(',')).join('\n') + '\n');
console.log(`\nCSV: audit2/out/C34_c3.csv (${c3.length} filas) · audit2/out/C34_c4.csv (${c4.length} filas)`);
