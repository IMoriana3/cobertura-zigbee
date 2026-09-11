#!/usr/bin/env node
/* barrido_terrenos.mjs — «un millón de pruebas»: terrenos × perfiles N-S × accionamientos ×
   implantaciones × latitudes × fechas × políticas, con los invariantes que tienen que
   cumplirse SIEMPRE, y la lista de los peores casos para ir a mirarlos.

     node tools/barrido_terrenos.mjs [nConfigs=200] [semilla=1] [--oraculo=40] [--json=ruta]

   Invariantes:
     A  contador ≡ oráculo independiente (test_backtracking_sim.mjs), |Δ| ≤ 1e-3 (subconjunto)
     B  políticas que GARANTIZAN no-sombra (pairwise, true3d, mgl): sombra de PLANOS por
        filas (sin estructura, sin terreno) ≤ 2 % con sol ≥ 10° · ≤ 5 % con sol ≥ 5°
     C  energía bajo el contador: optimal ≥ pairwise − 0,1 % · optfree ≥ optimal − 0,1 %
     D  acople: las filas de un mismo accionamiento llevan el MISMO θ (bifila/quebrado)
     E  todos los θ finitos y dentro de ±θmáx
   Sale el resumen por invariante y los 15 peores casos de B con su configuración. */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'); const j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, shadeRows, shadeBand3DAll, pairsFromElev, nsSegments,
  solarPos, clearskyIneichen, mulberry32, driveGroups, effRowTilts, anglesPairwise, elecLoss };`)();
const test = fs.readFileSync(path.join(ROOT, 'tools', 'test_backtracking_sim.mjs'), 'utf-8');
const o0 = test.indexOf('function oracleGeom'), o1 = test.indexOf('function ayoraPlantT');
const ORA = new Function('F', test.slice(o0, o1) + '\nreturn { oracleExact };')(F);

const args = process.argv.slice(2);
const NCFG = +(args.find(a => /^\d+$/.test(a)) || 200), SEED = +(args.filter(a => /^\d+$/.test(a))[1] || 1);
const NORA = +((args.find(a => a.startsWith('--oraculo=')) || '--oraculo=40').split('=')[1]);
const JSONOUT = (args.find(a => a.startsWith('--json=')) || '').split('=')[1];
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const rnd = F.mulberry32(SEED);
const pick = (a) => a[Math.floor(rnd() * a.length)];

/* ── igual que terrain()/applyPreset()/nsProfile() de la página, para presets ── */
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
  return out;
}
function mkT(c) {
  const ELEV = elevPreset(c.tpreset, c.tparam, c.nrows, c.pitch);
  const groups = F.driveGroups(c.nrows, c.drive);
  const eff = F.effRowTilts(nsProfile(c.nspreset, c.axtilt, c.nrows), c.drive, groups);
  const filaLen = 2 * c.mods * 1.146 + 0.55;
  const segs = F.nsSegments(c.nrows, c.nsl, c.ntrk, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
  return { pairs: F.pairsFromElev(ELEV, c.pitch, eff), cw: c.cw, axisAz: c.axaz, maxAngle: c.maxang, gcr: c.cw / c.pitch, z0: c.z0,
           nBypass: c.nbp, iam: c.iam, rowTilt: eff, groups, drive: c.drive, segs, filaLen };
}
function randomCfg() {
  const tp = pick(['llano', 'pendiente', 'pendiente', 'ondulado', 'valle', 'cresta', 'aleatorio']);
  const tparam = tp === 'pendiente' ? pick([-10, -6, -3, 3, 6, 10]) : tp === 'ondulado' ? pick([0.6, 1.2, 2]) : (tp === 'valle' || tp === 'cresta') ? pick([1, 2, 3]) : tp === 'aleatorio' ? pick([7, 13, 42]) : 0;
  const nsp = pick(['constante', 'constante', 'quebrado', 'senoidal', 'aleatorio']);
  const axtilt = nsp === 'constante' ? pick([0, 0, 3, -3, 6, -6]) : pick([2, 3, 4, 6]);
  const sitio = pick([{ nm: 'Zaragoza', lat: 41.5763, lon: -0.7981, alt: 300 }, { nm: 'Arequipa', lat: -16.59577, lon: -71.80644, alt: 1563 }]);
  return { tpreset: tp, tparam, nspreset: nsp, axtilt, drive: pick(['mono', 'bifila', 'quebrado']), nsl: pick(['alineadas', 'alineadas', 'tresbolillo', 'medios', 'bagnarelli']),
           ntrk: pick([1, 1, 2]), nrows: pick([6, 8, 10]), pitch: 6, cw: 2.382, maxang: 55, z0: 0.17, nbp: 2, iam: 0.05, mods: 28, axaz: pick([0, 0, 0, 15, -20]), sitio };
}
const nombre = (c) => `${c.sitio.nm} · ${c.tpreset}${c.tparam ? ' ' + c.tparam : ''} · N-S ${c.nspreset} ${c.axtilt}° · ${c.drive} · ${c.nsl} ×${c.ntrk} · ${c.nrows} filas · az ${c.axaz}°`;
const DIAS = [['21-jun', Date.UTC(2026, 5, 21), 172], ['21-mar', Date.UTC(2026, 2, 21), 80], ['21-dic', Date.UTC(2026, 11, 21), 355]];

const res = { A: { n: 0, peor: 0, casos: [] }, B: { n: 0, casos: [], fisica: [] }, C: { n: 0, casos: [] }, D: { n: 0, casos: [] }, E: { n: 0, casos: [] } };
const t0 = Date.now();
for (let ci = 0; ci < NCFG; ci++) {
  const c = randomCfg(), T = mkT(c), nm = nombre(c), nR = c.nrows;
  const hazOra = ci < NORA;
  for (const [dnm, dia, doy] of DIAS) {
    for (let m = 0; m < 1440; m += 20) {
      const g = F.solarPos(dia + m * 60000, c.sitio.lat, c.sitio.lon);
      if (g.elev <= 2) continue;
      const irr = F.clearskyIneichen(g.zen, doy, c.sitio.alt, 3.5);
      const tag = `${nm} · ${dnm} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}Z sol ${g.elev.toFixed(1)}° az ${g.az.toFixed(0)}°`;
      const ang = {};
      for (const key of ['pairwise', 'true3d', 'mgl', 'optimal', 'optfree']) {
        ang[key] = F.policyAngles(key, g.zen, g.az, T, irr, doy, 0.2).angles;
        // E: finitos y dentro del tope
        res.E.n++;
        if (ang[key].some(a => !isFinite(a) || Math.abs(a) > c.maxang + 1e-6)) res.E.casos.push({ tag, key, ang: ang[key].map(a => +a.toFixed(1)) });
        // D: acople
        if (T.groups) { res.D.n++; for (const gr of T.groups) if (gr.length === 2 && Math.abs(ang[key][gr[0]] - ang[key][gr[1]]) > 1e-9) { res.D.casos.push({ tag, key, gr, a: [ang[key][gr[0]], ang[key][gr[1]]] }); break; } }
      }
      // B: sombra de planos por FILAS (sin estructura, sin terreno) en las políticas sin-sombra
      for (const key of ['pairwise', 'true3d', 'mgl']) {
        const sh = F.shadeBand3DAll(g.zen, g.az, T, ang[key], { noStruct: true, MV: 16 });
        let peor = 0, fila = -1;
        for (let r = 0; r < nR; r++) {
          const de = sh.de && sh.de[r] ? sh.de[r] : [];
          const filas = Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0));   // lo que NO es loma
          if (filas > peor) { peor = filas; fila = r; }
        }
        res.B.n++;
        const tope = g.elev >= 10 ? 0.02 : 0.05;
        if (peor > tope) {
          // ¿era ALCANZABLE? la mejor sombra de filas con un θ uniforme (barrido de
          // 2,5°): si ningún θ baja de la mitad de lo que dejó la política, es física
          // (terreno, geometría), no política — se apunta pero no cuenta como fallo
          let alc = 1;
          for (let th = -c.maxang; th <= c.maxang; th += 2.5) {
            const s2 = F.shadeBand3DAll(g.zen, g.az, T, new Array(nR).fill(th), { noStruct: true, MV: 8 });
            let mx = 0;
            for (let r = 0; r < nR; r++) { const de = s2.de && s2.de[r] ? s2.de[r] : []; mx = Math.max(mx, Math.min(s2[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); }
            if (mx < alc) alc = mx;
          }
          const fallo = alc <= Math.max(0.01, 0.5 * peor);
          (fallo ? res.B.casos : res.B.fisica).push({ tag, key, fila, sombra: +(peor * 100).toFixed(1), alcanzable: +(alc * 100).toFixed(1), elev: +g.elev.toFixed(1), ang: ang[key].map(a => +a.toFixed(1)), de: sh.de[fila].map(q => [q[0], +(q[1] * 100).toFixed(1)]), c });
        }
      }
      // C: energía
      if (irr.ghi > 5) {
        const P = {}; for (const key of ['pairwise', 'optimal', 'optfree']) P[key] = F.poaPlant(g.zen, g.az, T, ang[key], irr, doy, 0.2).plant;
        res.C.n++;
        if (P.optimal < P.pairwise * (1 - 1e-3) - 1e-6) res.C.casos.push({ tag, que: 'optimal < pairwise', v: [P.optimal, P.pairwise] });
        if (P.optfree < P.optimal * (1 - 1e-3) - 1e-6) res.C.casos.push({ tag, que: 'optfree < optimal', v: [P.optfree, P.optimal] });
      }
      // A: oráculo (subconjunto: cada 60 min)
      if (hazOra && m % 60 === 0) {
        const sh = F.shadeRows(g.zen, g.az, T, ang.pairwise), ora = ORA.oracleExact(F, g.zen, g.az, T, ang.pairwise);
        let d = 0, rd = -1; for (let r = 0; r < nR; r++) { const e = Math.abs(sh[r] - ora[r]); if (e > d) { d = e; rd = r; } }
        res.A.n++; if (d > res.A.peor) { res.A.peor = d; res.A.peorCaso = { tag, fila: rd, contador: +(sh[rd] * 100).toFixed(3), oraculo: +(ora[rd] * 100).toFixed(3) }; }
        if (d > 1e-3) res.A.casos.push({ tag, d: +(d * 100).toFixed(2), c });
      }
    }
  }
  if ((ci + 1) % 20 === 0) console.error(`… ${ci + 1}/${NCFG} configuraciones, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const seg = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`barrido: ${NCFG} configuraciones × 3 fechas × cada 20 min · ${seg} s`);
console.log(`A  contador ≡ oráculo: ${res.A.n} instantes · peor |Δ| ${(res.A.peor * 100).toFixed(3)} pp · fuera de 0,1 pp: ${res.A.casos.length}`);
if (res.A.peorCaso) console.log(`   A peor: fila ${res.A.peorCaso.fila} contador ${res.A.peorCaso.contador} % · oráculo ${res.A.peorCaso.oraculo} % · ${res.A.peorCaso.tag}`);
console.log(`B  sombra de planos con pairwise/true3d/mgl: ${res.B.n} instantes-política · FALLOS de política (había un θ mejor): ${res.B.casos.length} · sombra física (ningún θ la evita): ${res.B.fisica.length}`);
console.log(`C  energía optimal ≥ pairwise, optfree ≥ optimal: ${res.C.n} instantes · violaciones: ${res.C.casos.length}`);
console.log(`D  acople por accionamiento: ${res.D.n} · violaciones: ${res.D.casos.length}`);
console.log(`E  θ finitos y en rango: ${res.E.n} · violaciones: ${res.E.casos.length}`);
const porPol = {}; for (const k of res.B.casos) porPol[k.key] = (porPol[k.key] || 0) + 1; console.log('   B por política:', JSON.stringify(porPol));
const porTerr = {}; for (const k of res.B.casos) { const t = k.c.tpreset + '/' + k.c.nspreset + (k.c.nspreset === 'constante' && k.c.axtilt === 0 ? '0' : ''); porTerr[t] = (porTerr[t] || 0) + 1; } console.log('   B por terreno/perfil:', JSON.stringify(porTerr));
res.B.casos.sort((a, b) => b.sombra - a.sombra);
console.log('   los 15 peores de B:');
for (const k of res.B.casos.slice(0, 15)) console.log(`   ${k.sombra.toString().padStart(5)} % (alcanzable ${k.alcanzable} %) fila ${k.fila} ${k.key.padEnd(8)} ${k.tag} · θ ${k.ang.join('/')} · de ${JSON.stringify(k.de)}`);
for (const k of res.A.casos.slice(0, 5)) console.log('   A:', k.d, 'pp', k.tag);
for (const k of res.C.casos.slice(0, 5)) console.log('   C:', k.que, k.v.map(v => v.toFixed(1)).join(' vs '), k.tag);
for (const k of res.D.casos.slice(0, 3)) console.log('   D:', k.key, k.gr, k.a, k.tag);
for (const k of res.E.casos.slice(0, 3)) console.log('   E:', k.key, k.ang, k.tag);
if (JSONOUT) fs.writeFileSync(JSONOUT, JSON.stringify(res, null, 1));
