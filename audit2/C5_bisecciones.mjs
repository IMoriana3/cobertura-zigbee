#!/usr/bin/env node
/* C.5 — bisección frente a barrido fino del MISMO predicado, sobre la muestra de C.2.
   (1) bt3dPairMaxMag  (36 pasos, backtracking.html:2222-2224 del cuerpo citado)
   (2) anglesMinGroundLight (14 pasos, backtracking.html:2379-2383)
   (3) penetración de terreno (3 refinos, backtracking.html:2246-2249) — NO EJECUTADA:
       su predicado `terrBlocked` es local a shadeBand3DAll y no está exportado.
   Ejecutable:  node audit2/C5_bisecciones.mjs [nCfg=40] [semilla=1] [nMuestra=200]
   Salida: audit2/out/C5.csv + resumen                                          */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { shadeRows, shadeBand3DAll, pairsFromElev, nsSegments, solarPos, clearskyIneichen,
  mulberry32, driveGroups, effRowTilts, rotulaMesas, mvPara, bt3dPairMaxMag, anglesPairwise, driveCoupleSafe, rangosUnidad, anglesMinGroundLight, groundLightFrac };`)();
const FIS = crypto.createHash('sha256').update(html.slice(j0, i1)).digest('hex').slice(0, 12);
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const A = process.argv.slice(2); const NCFG = +(A[0] || 40), SEED = +(A[1] || 1), NMUE = +(A[2] || 200);
const SEED_MUESTRA = 20260917, RAD = Math.PI / 180, PASO_FINO = 0.05;

/* ── VERBATIM del generador (tools/barrido_terrenos.mjs:66-104) ──────────── */
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

/* ── (1) el predicado `shades(mag)` de bt3dPairMaxMag, EXTRAÍDO DEL FICHERO ──
   No se reescribe a mano: se toma el texto de la función tal cual está en
   backtracking.html y se le sustituye SOLO el bucle de bisección por un
   `return {shades,sgn}`, de modo que el predicado es byte a byte el del motor. */
const _src = html.slice(html.indexOf('function bt3dPairMaxMag('));
const _fin = _src.indexOf('\n}\n') + 2;
let _cuerpo = _src.slice(0, _fin);
const _BUCLE = `  let lo=0, hi=maxAngle;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2; if(shades(mid))hi=mid; else lo=mid;}
  return {mag:lo,sgn:sgn};`;
if (_cuerpo.split(_BUCLE).length - 1 !== 1) throw new Error('el bucle de bisección no aparece exactamente una vez');
_cuerpo = _cuerpo.replace(_BUCLE, '  return {shades:shades,sgn:sgn};');
const _pred = new Function('RAD', _cuerpo + '\nreturn bt3dPairMaxMag;')(RAD);
function shadesDe(zen, az, slope, axisTilt, pitch, cw, axisAz, maxAngle) {
  return _pred(zen, az, slope, axisTilt, pitch, cw, axisAz, maxAngle).shades;
}

console.log('═'.repeat(88));
console.log(`E-C5 · bisección frente a barrido fino · commit ${SHA} · física ${FIS} · node ${process.version}`);
console.log(`muestra: la de C.2 (${NMUE} instantes, mulberry32(${SEED_MUESTRA}) sobre los que tienen θ uniforme de sombra 0, C1_instantes.csv)`);
console.log(`barrido fino: paso ${PASO_FINO}° sobre el MISMO predicado · nb 2 · b0 0,05 · albedo 0,20 · TL 3,5 · MV = mvPara(T,zen)`);
console.log('═'.repeat(88));

const csv = fs.readFileSync(path.join(OUT, 'C1_instantes.csv'), 'utf-8').trim().split('\n').slice(1);
const hay0 = new Set();
for (const l of csv) { const f = l.split(','); if (f[f.length-1].trim() === '1') hay0.add(f[0] + '|' + f[f.length-9] + '|' + f[f.length-8]); }
const inst = [];
for (let ci = 0; ci < NCFG; ci++) { const c = randomCfg(), T = mkT(c), nm = nombre(c);
  for (const [dnm, dia, doy] of DIAS) for (let m = 0; m < 1440; m += 20) {
    const g = F.solarPos(dia + m*60000, c.sitio.lat, c.sitio.lon);
    if (g.elev <= 2 || !hay0.has(ci + '|' + dnm + '|' + m)) continue;
    inst.push({ ci, c, T, nm, dnm, doy, m, ...g }); } }
const r2 = F.mulberry32(SEED_MUESTRA);
const idx = inst.map((_, i) => i); for (let i = idx.length-1; i > 0; i--) { const j = Math.floor(r2()*(i+1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
const mues = idx.slice(0, Math.min(NMUE, idx.length)).sort((a,b)=>a-b).map(i => inst[i]);
console.log(`\nmuestra reconstruida: ${mues.length} instantes`);

/* ── (1) bt3dPairMaxMag ─────────────────────────────────────────────────── */
const d1 = [], multi1 = [];
for (const x of mues) for (let p = 0; p < x.T.pairs.length; p++) {
  const pr = x.T.pairs[p];
  const bis = F.bt3dPairMaxMag(x.zen, x.az, pr.slope, pr.axisTilt, pr.pitch, x.T.cw, x.T.axisAz, x.T.maxAngle);
  const sh = shadesDe(x.zen, x.az, pr.slope, pr.axisTilt, pr.pitch, x.T.cw, x.T.axisAz, x.T.maxAngle);
  const s0 = sh(0);
  let cruces = 0, prev = s0, primero = null;
  for (let mg = 0; mg <= x.T.maxAngle + 1e-9; mg += PASO_FINO) { const v = sh(+mg.toFixed(4));
    if (v !== prev) { cruces++; if (primero === null && v) primero = +mg.toFixed(4); prev = v; } }
  // el barrido fino devuelve el MAYOR mag con el predicado aún en falso desde 0.
  // Si ya es verdadero en mag = 0, la respuesta del barrido fino es 0.
  const fino = s0 ? 0 : (primero === null ? x.T.maxAngle : Math.max(0, primero - PASO_FINO));
  const cteV = s0 && cruces === 0, cteF = !s0 && cruces === 0;
  const d = Math.abs(bis.mag - fino);
  d1.push({ d, bis: bis.mag, fino, cruces, cteV, cteF, x, p, slope: pr.slope, tilt: pr.axisTilt });
  if (cruces > 1) multi1.push({ cruces, x, p });
}
const q = (arr, f) => { const s = arr.slice().sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(f*s.length))]; };
const dd1 = d1.map(o => o.d);
console.log(`\n── (1) bt3dPairMaxMag · 36 pasos de bisección sobre [0, θmáx] ──`);
console.log(`  parejas-instante evaluadas: ${d1.length}  (denominador)`);
console.log(`  |Δθ| bisección − barrido fino (0,05°):  p50 ${q(dd1,0.5).toFixed(5)}°  p90 ${q(dd1,0.9).toFixed(5)}°  p99 ${q(dd1,0.99).toFixed(5)}°  máx ${Math.max(...dd1).toFixed(5)}°`);
console.log(`  |Δθ| > 0,05° (un paso del fino): ${dd1.filter(v=>v>0.05).length} de ${dd1.length}  ·  > 0,5°: ${dd1.filter(v=>v>0.5).length}`);
console.log(`  casos con MÁS DE UN cruce del predicado (raíz NO única en la rejilla fina): ${multi1.length} de ${d1.length}`);
console.log(`  predicado CONSTANTE VERDADERO desde mag=0 (sombrea a cualquier θ, no hay raíz): ${d1.filter(o=>o.cteV).length} de ${d1.length}`);
console.log(`  predicado CONSTANTE FALSO hasta θmáx (nunca sombrea):                         ${d1.filter(o=>o.cteF).length} de ${d1.length}`);
console.log(`  con raíz interior (exactamente 1 cruce):                                      ${d1.filter(o=>o.cruces===1).length} de ${d1.length}`);
if (!multi1.length) console.log(`  TEST NULO: el nº de cruces es CONSTANTE (0 o 1) en todo el dominio medido ⇒ la hipótesis de raíz única no se viola aquí.`);
d1.sort((a,b)=>b.d-a.d);
console.log(`\n  los 10 peores:`);
console.log(`   #   Δθ        bisección   barrido fino   cruces   pendiente  tiltNS   sol°   configuración · instante`);
for (let i = 0; i < Math.min(10, d1.length); i++) { const o = d1[i];
  console.log(`  ${String(i+1).padStart(2)}  ${o.d.toFixed(5).padStart(8)}°  ${o.bis.toFixed(4).padStart(9)}°  ${o.fino.toFixed(4).padStart(12)}°  ${String(o.cruces).padStart(6)}   ${o.slope.toFixed(2).padStart(8)}°  ${o.tilt.toFixed(2).padStart(6)}°  ${o.x.elev.toFixed(1).padStart(5)}  ${o.x.nm} · ${o.x.dnm} ${String(Math.floor(o.x.m/60)).padStart(2,'0')}:${String(o.x.m%60).padStart(2,'0')}Z`); }

/* ── (2) anglesMinGroundLight: 14 pasos sobre max(shadeRows) <= 2e-3 ─────── */
console.log(`\n── (2) anglesMinGroundLight · 14 pasos de bisección sobre max(shadeRows) ≤ 2e-3 (backtracking.html:2379-2383) ──`);
const d2 = [], multi2 = [];
let hechos = 0;
for (const x of mues) {
  const T = x.T, maxA = T.maxAngle;
  const base = T.groups ? F.driveCoupleSafe(x.zen, x.az, T, F.anglesPairwise(x.zen, x.az, T), false) : F.anglesPairwise(x.zen, x.az, T);
  if (!(isFinite(x.zen) && x.zen < 87)) continue;
  const a = base.slice(), RG = F.rangosUnidad(x.zen, x.az, T), units = T.groups ? T.groups : a.map((_, r) => [r]);
  for (const u of units) {
    const r0 = u[0], sgn = Math.sign(a[r0]) || 1;
    const lo0 = Math.abs(a[r0]), hi0 = Math.min(maxA, sgn > 0 ? RG[r0][1] : -RG[r0][0]);
    if (hi0 - lo0 < 0.25) continue;
    hechos++;
    const ok = mag => { const t = a.slice(); for (const r of u) t[r] = sgn*mag; return Math.max(...F.shadeRows(x.zen, x.az, T, t)) <= 2e-3; };
    let lo = lo0, hi = hi0; for (let b = 0; b < 14; b++) { const mid = (lo+hi)/2; if (ok(mid)) lo = mid; else hi = mid; }
    const o0 = ok(lo0);
    let cruces = 0, prev = o0, ultimoOk = o0 ? lo0 : null;
    for (let mg = lo0; mg <= hi0 + 1e-9; mg += PASO_FINO) { const v = ok(+mg.toFixed(4));
      if (v) ultimoOk = +mg.toFixed(4);
      if (v !== prev) { cruces++; prev = v; } }
    if (ultimoOk === null) ultimoOk = lo0;   // ni el arranque cumple: el fino no puede empinar
    d2.push({ d: Math.abs(lo - ultimoOk), bis: lo, fino: ultimoOk, cruces, x, u });
    if (cruces > 1) multi2.push({ cruces, x, u });
  }
  if (d2.length > 600) break;                   // tope de coste, declarado
}
const dd2 = d2.map(o => o.d);
console.log(`  unidades-instante evaluadas: ${d2.length} (de ${hechos} que superan el corte hi-lo ≥ 0,25°; tope de coste 600, declarado)`);
if (dd2.length) {
  console.log(`  |Δθ| bisección − barrido fino (0,05°):  p50 ${q(dd2,0.5).toFixed(5)}°  p90 ${q(dd2,0.9).toFixed(5)}°  p99 ${q(dd2,0.99).toFixed(5)}°  máx ${Math.max(...dd2).toFixed(5)}°`);
  console.log(`  |Δθ| > 0,05°: ${dd2.filter(v=>v>0.05).length} de ${dd2.length}  ·  > 0,5°: ${dd2.filter(v=>v>0.5).length}`);
  console.log(`  casos con MÁS DE UN cruce (raíz NO única): ${multi2.length} de ${d2.length}`);
  d2.sort((a,b)=>b.d-a.d);
  console.log(`\n  los 10 peores:`);
  console.log(`   #   Δθ        bisección   barrido fino   cruces   unidad     sol°   configuración · instante`);
  for (let i = 0; i < Math.min(10, d2.length); i++) { const o = d2[i];
    console.log(`  ${String(i+1).padStart(2)}  ${o.d.toFixed(5).padStart(8)}°  ${o.bis.toFixed(4).padStart(9)}°  ${o.fino.toFixed(4).padStart(12)}°  ${String(o.cruces).padStart(6)}   [${o.u.join(',')}]`.padEnd(66) +
      `${o.x.elev.toFixed(1).padStart(5)}  ${o.x.nm} · ${o.x.dnm} ${String(Math.floor(o.x.m/60)).padStart(2,'0')}:${String(o.x.m%60).padStart(2,'0')}Z`); }
} else console.log(`  TEST NULO: ninguna unidad supera el corte hi-lo ≥ 0,25° ⇒ la bisección no llega a ejecutarse y la métrica no informa.`);

console.log(`\n── (3) penetración de terreno · 3 refinos (backtracking.html:2246-2249) ──`);
console.log(`  NO EJECUTADA. Su predicado es \`terrBlocked(x,y,z)\`, definido dentro de \`shadeBand3DAll\` y no`);
console.log(`  exportado: búsqueda con  grep -n "terrBlocked" backtracking.html  ⇒ sólo apariciones locales a esa`);
console.log(`  función. Además el bucle no busca una RAÍZ EN θ sino la fracción de cuerda tapada, con 3 refinos`);
console.log(`  sobre [0,1] ⇒ resolución intrínseca 1/16 de la cuerda (${(2.382/16).toFixed(4)} m con cuerda 2,382),`);
console.log(`  que es una cota conocida por construcción, no una hipótesis de raíz única.`);
fs.writeFileSync(path.join(OUT, 'C5.csv'), 'bloque,cfg,nombre,dia,minZ,elev,unidad_o_pareja,bisection_deg,barrido_fino_deg,delta_deg,cruces\n' +
  d1.map(o => ['bt3dPairMaxMag', o.x.ci, JSON.stringify(o.x.nm), o.x.dnm, o.x.m, o.x.elev.toFixed(3), 'pareja ' + o.p, o.bis.toFixed(6), o.fino.toFixed(6), o.d.toFixed(8), o.cruces].join(',')).join('\n') + '\n' +
  d2.map(o => ['minGroundLight', o.x.ci, JSON.stringify(o.x.nm), o.x.dnm, o.x.m, o.x.elev.toFixed(3), '"[' + o.u.join(',') + ']"', o.bis.toFixed(6), o.fino.toFixed(6), o.d.toFixed(8), o.cruces].join(',')).join('\n') + '\n');
console.log(`\nCSV: audit2/out/C5.csv`);
