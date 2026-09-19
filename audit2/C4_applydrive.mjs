#!/usr/bin/env node
/* C.4 — contraejemplo sobre el ACOPLE REAL: instantes donde el θ de grupo que
   elige `applyDrive` (min|θ|) deja sombra de planos > 0 existiendo otro θ de
   grupo con sombra 0.  Reutiliza la misma muestra de C.2 leyendo
   audit2/out/C1_instantes.csv (hay que haber corrido antes C_monotonia.mjs).
   Ejecutable:  node audit2/C4_applydrive.mjs [nCfg=40] [semilla=1] [nMuestra=200]
   Salida: audit2/out/C4.csv + resumen por stdout                              */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, shadeBand3DAll, pairsFromElev, nsSegments,
  solarPos, clearskyIneichen, mulberry32, driveGroups, effRowTilts, rotulaMesas, mvPara, applyDrive, anglesAstro, anglesRow };`)();
const FIS = crypto.createHash('sha256').update(html.slice(j0, i1)).digest('hex').slice(0, 12);
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const A = process.argv.slice(2);
const NCFG = +(A[0] || 40), SEED = +(A[1] || 1), NMUE = +(A[2] || 200);
const SEED_MUESTRA = 20260917, TOL0 = 1e-9, PASO = 0.25, RAD = Math.PI / 180;

/* ── VERBATIM de tools/barrido_terrenos.mjs:66-104 (idéntico a C_monotonia.mjs) ── */
const rnd = F.mulberry32(SEED); const pick = a => a[Math.floor(rnd() * a.length)];
function elevPreset(P, v, n, pitch) { const z = new Array(n).fill(0);
  if (P === 'pendiente') for (let i = 0; i < n; i++) z[i] = -i * pitch * Math.tan(v * RAD);
  else if (P === 'ondulado') for (let i = 0; i < n; i++) z[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
  else if (P === 'valle') for (let i = 0; i < n; i++) z[i] = v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
  else if (P === 'cresta') for (let i = 0; i < n; i++) z[i] = -v * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2) + v;
  else if (P === 'aleatorio') { const r = F.mulberry32(Math.round(v) || 1); let acc = 0; for (let i = 0; i < n; i++) { z[i] = acc; acc += (r() - 0.5) * 2 * 0.12 * pitch; } }
  for (let i = 1; i < n; i++) { const dz = z[i - 1] - z[i], lim = pitch * Math.tan(30 * RAD); if (dz > lim) z[i] = z[i - 1] - lim; if (dz < -lim) z[i] = z[i - 1] + lim; } return z; }
function nsProfile(preset, v, n) { const out = new Array(n).fill(v);
  if (preset === 'quebrado') for (let i = 0; i < n; i++) out[i] = i < n / 2 ? v : -v;
  else if (preset === 'senoidal') for (let i = 0; i < n; i++) out[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
  else if (preset === 'aleatorio') { const r = F.mulberry32(1234); for (let i = 0; i < n; i++) out[i] = (r() * 2 - 1) * v; }
  else if (preset === 'rotula') out.fill(0); return out; }
function mkT(c) { const ELEV = elevPreset(c.tpreset, c.tparam, c.nrows, c.pitch);
  const groups = F.driveGroups(c.nrows, c.drive);
  const eff = F.effRowTilts(nsProfile(c.nspreset, c.axtilt, c.nrows), c.drive, groups);
  const filaLen = 2 * c.mods * 1.146 + 0.55;
  const segs = F.nsSegments(c.nrows, c.nsl, c.ntrk, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
  const RM = F.rotulaMesas(c.nspreset, c.axtilt, c.drive, segs, ELEV, groups, 0.55);
  const T = { pairs: F.pairsFromElev(ELEV, c.pitch, eff), cw: c.cw, axisAz: c.axaz, maxAngle: c.maxang, gcr: c.cw / c.pitch, z0: c.z0,
              nBypass: c.nbp, iam: c.iam, rowTilt: eff, groups, drive: c.drive, segs: RM ? RM.segs : segs, filaLen };
  if (RM) Object.assign(T, { segTilt: RM.segTilt, segZ: RM.segZ, segSide: RM.segSide, segMorro: RM.segMorro, segPairs: RM.segPairs, segDrive: RM.segDrive });
  return T; }
function randomCfg() { const tp = pick(['llano','pendiente','pendiente','ondulado','valle','cresta','aleatorio']);
  const tparam = tp === 'pendiente' ? pick([-10,-6,-3,3,6,10]) : tp === 'ondulado' ? pick([0.6,1.2,2]) : (tp === 'valle' || tp === 'cresta') ? pick([1,2,3]) : tp === 'aleatorio' ? pick([7,13,42]) : 0;
  const nsp = pick(['constante','constante','quebrado','senoidal','aleatorio','rotula']);
  const axtilt = nsp === 'constante' ? pick([0,0,3,-3,6,-6]) : pick([2,3,4,6]);
  const sitio = pick([{nm:'Zaragoza',lat:41.5763,lon:-0.7981,alt:300},{nm:'Arequipa',lat:-16.59577,lon:-71.80644,alt:1563}]);
  return { tpreset: tp, tparam, nspreset: nsp, axtilt, drive: pick(['mono','bifila','quebrado']), nsl: pick(['alineadas','alineadas','tresbolillo','medios','bagnarelli']),
           ntrk: pick([1,1,2]), nrows: pick([6,8,10]), pitch: 6, cw: 2.382, maxang: 55, z0: 0.17, nbp: 2, iam: 0.05, mods: 28, axaz: pick([0,0,0,15,-20]), sitio }; }
const nombre = c => `${c.sitio.nm} · ${c.tpreset}${c.tparam ? ' ' + c.tparam : ''} · N-S ${c.nspreset} ${c.axtilt}° · ${c.drive} · ${c.nsl} ×${c.ntrk} · ${c.nrows} filas · az ${c.axaz}°`;
const DIAS = [['21-jun', Date.UTC(2026,5,21), 172], ['21-mar', Date.UTC(2026,2,21), 80], ['21-dic', Date.UTC(2026,11,21), 355]];

function fsPlanos(zen, az, T, ang, nR) { const sh = F.shadeBand3DAll(zen, az, T, ang, { noStruct: true }); let p = 0;
  for (let r = 0; r < nR; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : [];
    p = Math.max(p, Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); } return p; }

/* la marca hay_cero de C.1, leída del CSV para no repetir la criba */
const csv = fs.readFileSync(path.join(OUT, 'C1_instantes.csv'), 'utf-8').trim().split('\n').slice(1);
const hay0 = new Set();
for (const l of csv) { const f = l.split(','); const ci = f[0], dia = f[f.length - 9], min = f[f.length - 8], hz = f[f.length - 1];
  if (hz.trim() === '1') hay0.add(ci + '|' + dia + '|' + min); }

console.log('═'.repeat(84));
console.log(`E-C4 · contraejemplo del min(|θ|) sobre el ACOPLE REAL · commit ${SHA} · física ${FIS} · node ${process.version}`);
console.log(`barrido replicado: ${NCFG} configuraciones · semilla ${SEED} · días ${DIAS.map(d=>d[0]).join(', ')} · paso 20 min · sol > 2°`);
console.log(`muestra: la MISMA de C.2 (mulberry32(${SEED_MUESTRA}) sobre los instantes con θ uniforme de sombra 0 leídos de C1_instantes.csv)`);
console.log(`sombra: de PLANOS (noStruct, sin la parte 'terreno') · nb 2 · b0 0,05 · albedo 0,20 · TL 3,5 · MV = mvPara(T,zen)`);
console.log('═'.repeat(84));
console.log(`\nNOTA FACTUAL PEDIDA — el despachador, backtracking.html:3362-3370:\n`);
console.log(html.split('\n').slice(3361, 3370).join('\n'));
console.log(`\n⇒ \`astro\` (3362) y \`row\` (3365) pasan SOLO por applyDrive: NO llaman a repairNoShade.`);

const inst = [];
for (let ci = 0; ci < NCFG; ci++) {
  const c = randomCfg(), T = mkT(c), nm = nombre(c), nR = c.nrows;
  for (const [dnm, dia, doy] of DIAS) for (let m = 0; m < 1440; m += 20) {
    const g = F.solarPos(dia + m * 60000, c.sitio.lat, c.sitio.lon);
    if (g.elev <= 2) continue;
    if (!hay0.has(ci + '|' + dnm + '|' + m)) continue;
    inst.push({ ci, c, T, nR, nm, dnm, doy, m, ...g });
  }
}
const r2 = F.mulberry32(SEED_MUESTRA);
const idx = inst.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r2() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const mues = idx.slice(0, Math.min(NMUE, idx.length)).sort((a, b) => a - b).map(i => inst[i]);
const conGrupos = mues.filter(x => x.T.groups && x.T.groups.length);
console.log(`\nmuestra reconstruida: ${mues.length} instantes  ·  con accionamiento agrupado (bifila/quebrado): ${conGrupos.length}  ·  monofila (applyDrive es no-op): ${mues.length - conGrupos.length}`);
if (!conGrupos.length) { console.log('TEST NULO: ningún instante de la muestra tiene grupos ⇒ applyDrive no actúa y la métrica no informa.'); process.exit(0); }

const TH = []; for (let t = -55; t <= 55 + 1e-9; t += PASO) TH.push(+t.toFixed(4));
const POL = ['astro', 'row', 'pairwise', 'true3d'];
const casos = [], porPol = {}; POL.forEach(p => porPol[p] = { n: 0, hits: 0, peor: 0 });
let t0 = Date.now();
for (let q = 0; q < conGrupos.length; q++) {
  const x = conGrupos[q], irr = F.clearskyIneichen(x.zen, x.doy, x.c.sitio.alt, 3.5);
  for (const key of POL) {
    const ang = F.policyAngles(key, x.zen, x.az, x.T, irr, x.doy, 0.2).angles;
    const fs0 = fsPlanos(x.zen, x.az, x.T, ang, x.nR);
    porPol[key].n++;
    if (fs0 <= TOL0) continue;                       // el publicado ya no sombrea
    // ¿existe OTRO θ para algún grupo, con los demás quietos, que deje sombra 0?
    for (let gi = 0; gi < x.T.groups.length; gi++) {
      const gr = x.T.groups[gi]; if (gr.length < 2) continue;
      let mejor = null;
      for (const th of TH) {
        const a2 = ang.slice(); for (const r of gr) a2[r] = th;
        const f2 = fsPlanos(x.zen, x.az, x.T, a2, x.nR);
        if (f2 <= TOL0) { if (mejor === null || Math.abs(th) < Math.abs(mejor)) mejor = th; }
      }
      if (mejor !== null) {
        porPol[key].hits++; if (fs0 > porPol[key].peor) porPol[key].peor = fs0;
        casos.push({ x, key, grupo: gr, thPub: ang[gr[0]], fs0, thCero: mejor });
        break;
      }
    }
  }
  if ((q + 1) % 10 === 0) console.error(`  …C.4 ${q + 1}/${conGrupos.length} · ${((Date.now()-t0)/1000).toFixed(0)} s`);
}
console.log(`\n── recuento por política (denominador = instantes con grupos de la muestra) ──`);
console.log(`  política   instantes   con contraejemplo   %        peor fs PLANOS publicada`);
for (const k of POL) { const p = porPol[k];
  console.log(`  ${k.padEnd(10)} ${String(p.n).padStart(9)}   ${String(p.hits).padStart(17)}   ${(100*p.hits/Math.max(1,p.n)).toFixed(2).padStart(6)}   ${(100*p.peor).toFixed(4).padStart(22)} %`); }
const tot = POL.reduce((a, k) => a + porPol[k].hits, 0);
if (tot === 0) console.log(`\nTEST NULO: el predicado "existe θ de grupo con sombra 0 mejor que el publicado" es CONSTANTE FALSO en el dominio medido.`);
else if (POL.every(k => porPol[k].hits === porPol[k].n)) console.log(`\nTEST NULO: el predicado es CONSTANTE VERDADERO en el dominio medido.`);
casos.sort((a, b) => b.fs0 - a.fs0);
console.log(`\nlos 15 peores casos:`);
console.log(`   #  política  grupo      θ publicado   fs PLANOS    θ de sombra 0   sol°   configuración · instante`);
for (let i = 0; i < Math.min(15, casos.length); i++) { const c = casos[i];
  console.log(`  ${String(i+1).padStart(2)}  ${c.key.padEnd(8)}  [${c.grupo.join(',')}]`.padEnd(30) +
    `${c.thPub.toFixed(3).padStart(10)}°  ${(100*c.fs0).toFixed(4).padStart(9)} %  ${String(c.thCero).padStart(13)}°  ${c.x.elev.toFixed(1).padStart(5)}  ${c.x.nm} · ${c.x.dnm} ${String(Math.floor(c.x.m/60)).padStart(2,'0')}:${String(c.x.m%60).padStart(2,'0')}Z`); }
fs.writeFileSync(path.join(OUT, 'C4.csv'), 'politica,cfg,nombre,dia,minZ,elev,grupo,theta_publicado,fs_planos_publicada,theta_sombra0\n' +
  casos.map(c => [c.key, c.x.ci, JSON.stringify(c.x.nm), c.x.dnm, c.x.m, c.x.elev.toFixed(3), '"[' + c.grupo.join(',') + ']"', c.thPub.toFixed(4), c.fs0.toExponential(6), c.thCero].join(',')).join('\n') + '\n');
console.log(`\nCSV: audit2/out/C4.csv (${casos.length} filas)`);
