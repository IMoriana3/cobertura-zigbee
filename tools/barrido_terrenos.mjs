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
import crypto from 'crypto'; import { execFileSync } from 'child_process';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'); const j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { policyAngles, poaPlant, shadeRows, shadeBand3DAll, pairsFromElev, nsSegments,
  solarPos, clearskyIneichen, mulberry32, driveGroups, effRowTilts, anglesPairwise, elecLoss, rotulaMesas, mvPara, trueTrackAngle, pvTilt, rangosFila, rangosUnidad, surfaceOrient, shadeFracPair, driveCoupleSafe, anglesPairwise, anglesAstro, applyDrive, OPT_FRACTIONS };`)();
const test = fs.readFileSync(path.join(ROOT, 'tools', 'test_backtracking_sim.mjs'), 'utf-8');
const o0 = test.indexOf('function oracleGeom'), o1 = test.indexOf('function ayoraPlantT');
const ORA = new Function('F', test.slice(o0, o1) + '\nreturn { oracleExact };')(F);

/* v1.57.2: el log dice SOBRE QUÉ FÍSICA se obtuvo. Esta sesión ha tenido dos
   reinicios de contenedor, un merge de la versión equivocada y una atribución
   errónea entre dos commits; con el hash del bloque extraído y el SHA del árbol
   en la primera línea, «¿sigue valiendo esta corrida?» se responde mirando el
   log en vez de comparando a mano. Un cambio de interfaz no mueve el hash: eso
   es lo que permite no relanzar los barridos por una tarjeta del HUD. */
const FIS_SHA = crypto.createHash('sha256').update(html.slice(j0, i1)).digest('hex').slice(0, 12);
let TREE_SHA = '?';
try { TREE_SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch (e) { }
let TREE_SUCIO = '';
try { if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim()) TREE_SUCIO = ' + cambios sin commitear'; } catch (e) { }
console.log(`barrido de terrenos · física ${FIS_SHA} · árbol ${TREE_SHA}${TREE_SUCIO}`);

const args = process.argv.slice(2);
const NCFG = +(args.find(a => /^\d+$/.test(a)) || 200), SEED = +(args.filter(a => /^\d+$/.test(a))[1] || 1);
const NORA = +((args.find(a => a.startsWith('--oraculo=')) || '--oraculo=40').split('=')[1]);
const JSONOUT = (args.find(a => a.startsWith('--json=')) || '').split('=')[1];
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
/* DOS constantes, no una, aunque hoy valgan lo mismo. Significan cosas
   distintas y pueden moverse por separado:
     H_GRATIS  — «recortar al rango no CUESTA energía», y por eso H bloquea. Es
                 un umbral de DECISIÓN: por debajo de él, el arreglo es gratis y
                 no hay excusa para no cogerlo.
     E_EMPATE  — «dos candidatos EMPATAN en energía», y por eso B no puede
                 declarar fallo. Es un umbral de COMPARACIÓN entre alternativas.
   Si algún día se afina el primero (bloquear con menos holgura) o se relaja el
   segundo (considerar empate un margen mayor), el otro no tiene por qué
   seguirle. Unificarlas «porque están duplicadas» se llevaría por delante uno
   de los dos criterios. */
const H_GRATIS = 0.05;   // W/m² de planta: por debajo de esto, recortar es GRATIS (métrica H)
const E_EMPATE = 0.05;   // W/m² de planta: empate técnico en energía (métricas B y B2). Con 662 frente
                         // a 298 no hay duda, pero el signo de una diferencia de 0,1 W/m² no puede
                         // decidir si algo es fallo
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
  else if (preset === 'rotula') out.fill(0);   // v1.54: el quiebro va por mesa (rotulaMesas)
  return out;
}
function mkT(c) {
  const ELEV = elevPreset(c.tpreset, c.tparam, c.nrows, c.pitch);
  const groups = F.driveGroups(c.nrows, c.drive);
  const eff = F.effRowTilts(nsProfile(c.nspreset, c.axtilt, c.nrows), c.drive, groups);
  const filaLen = 2 * c.mods * 1.146 + 0.55;
  const segs = F.nsSegments(c.nrows, c.nsl, c.ntrk, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(sg => sg.slice());
  const RM = F.rotulaMesas(c.nspreset, c.axtilt, c.drive, segs, ELEV, groups, 0.55);   // v1.54: quiebro en la rótula (solo la quebrada lo sigue)
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

const res = { A: { n: 0, peor: 0, casos: [] }, B: { n: 0, casos: [], fisica: [], mejoresEnSombra: 0 }, B2: { n: 0, casos: [], fisica: [] }, C: { n: 0, casos: [] }, D: { n: 0, casos: [] }, E: { n: 0, casos: [] }, F: { n: 0, peor: 0, perdidas: [], casos: [] }, G: { n: 0, casos: [] }, H: { n: 0, peor: 0, espaldas: [], espaldas10: [], gratis: [], peorCoste: 0, casos: [] },
  I: { n: 0, rompe: [], peor: 0, compra: 0, total: 0 },
  J: { n: 0, casos: [], peor: 0 } };
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
        const sh = F.shadeBand3DAll(g.zen, g.az, T, ang[key], { noStruct: true });   // v1.57: la resolución publicada (mvPara), antes 16
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
          /* v1.57.2 (cuarta auditoría): FALLO sólo si el θ uniforme baja la
             sombra SIN perder energía de planta. Comparar sólo sombra óptica es
             el mismo vicio que esta auditoría persiguió en cuatro sitios del
             motor, metido en la métrica que juzga: medido, un θ uniforme que
             baja la sombra del 32,9 % al 15,2 % publica 298,7 W/m² frente a
             662,1. `alc` se sigue informando como cota (optimista, declarada). */
          let alc = 1, mejorReal = null;
          const pPub = F.poaPlant(g.zen, g.az, T, ang[key], irr, doy, 0.2).plant;
          const RF = F.rangosUnidad(g.zen, g.az, T);   // v1.57: lo alcanzable dentro del rango legítimo de cada unidad de accionamiento
          for (let th = -c.maxang; th <= c.maxang; th += 2.5) {
            const cand = RF.map(q => Math.max(q[0], Math.min(q[1], th)));
            const s2 = F.shadeBand3DAll(g.zen, g.az, T, cand, { noStruct: true });   // v1.57: misma resolución que la política (antes 8 frente a 16: mezclaba dos mallas)
            let mx = 0;
            for (let r = 0; r < nR; r++) { const de = s2.de && s2.de[r] ? s2.de[r] : []; mx = Math.max(mx, Math.min(s2[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); }
            if (mx < alc) alc = mx;
            if (mx <= Math.max(0.01, 0.5 * peor)) { res.B.mejoresEnSombra++;
              if (F.poaPlant(g.zen, g.az, T, cand, irr, doy, 0.2).plant >= pPub - E_EMPATE
                  && (mejorReal === null || mx < mejorReal)) mejorReal = mx; }
          }
          const fallo = mejorReal !== null;
          (fallo ? res.B.casos : res.B.fisica).push({ tag, key, fila, sombra: +(peor * 100).toFixed(1), alcanzable: +(alc * 100).toFixed(1), elev: +g.elev.toFixed(1), ang: ang[key].map(a => +a.toFixed(1)), de: sh.de[fila].map(q => [q[0], +(q[1] * 100).toFixed(1)]), c });
        }
      }
      // F (v1.57, auditoría H1): CONVERGENCIA de la malla publicada — cada hora en
      // punto, |sh(mvPara) − sh(128)| por fila con la política pairwise, y las
      // «pérdidas»: filas con >2 % convergido y menos de la mitad publicado
      if (m % 60 === 0) {
        const pubS = F.shadeBand3DAll(g.zen, g.az, T, ang.pairwise, { noStruct: true });
        const refS = F.shadeBand3DAll(g.zen, g.az, T, ang.pairwise, { noStruct: true, MV: 128 });
        res.F.n++;
        for (let r = 0; r < nR; r++) {
          const d = Math.abs(pubS[r] - refS[r]);
          if (d > res.F.peor) { res.F.peor = d; res.F.casos = [{ tag, fila: r, pub: +(pubS[r] * 100).toFixed(1), ref: +(refS[r] * 100).toFixed(1), mv: F.mvPara(T) }]; }
          if (refS[r] > 0.02 && pubS[r] < 0.5 * refS[r]) res.F.perdidas.push({ tag, fila: r, pub: +(pubS[r] * 100).toFixed(1), ref: +(refS[r] * 100).toFixed(1) });
        }
      }
      // G (v1.57, auditoría H2): NUNCA DE CANTO — ningún θ más allá de la paralela
      // al terreno en contra del sol (el rango legítimo de su unidad de
      // accionamiento). Medir |θ−ψ| a secas marcaba la HORIZONTAL a sol de 5°,
      // que no es estar de canto: es donde converge el propio backtracking
      // el rango de la FILA (no el de su accionamiento, que es la intersección y
      // puede ser más estrecho que el propio candidato de pvlib), con 5° de
      // holgura: lo que se busca es la postura de CANTO, que se sale decenas de
      // grados, no las décimas que separan dos vanos vecinos
      const RG = F.rangosFila(g.zen, g.az, T);
      for (const key of ['pairwise', 'true3d', 'mgl']) {
        res.G.n++;
        for (let r = 0; r < nR; r++) {
          if (ang[key][r] < RG[r][0] - 5 || ang[key][r] > RG[r][1] + 5) { res.G.casos.push({ tag, key, fila: r, th: +ang[key][r].toFixed(1), rango: [+RG[r][0].toFixed(1), +RG[r][1].toFixed(1)], elev: +g.elev.toFixed(1) }); break; }
        }
      }
      // H (v1.57.1, reauditoría): NINGUNA MESA DE ESPALDAS AL SOL — el ángulo de
      // incidencia del haz sobre la pala publicada, que es el invariante FÍSICO
      // detrás de G: un θ fuera del rango legítimo sólo importa si deja de
      // recibir haz. Se mide con el sol por encima de 5°, donde el haz cuenta
      for (const key of ['pairwise', 'true3d', 'mgl']) {
        if (g.elev < 5) break;
        res.H.n++;
        for (let r = 0; r < nR; r++) {
          const o = F.surfaceOrient(ang[key][r], F.pvTilt(T.rowTilt[r]), T.axisAz), b = o.tilt * RAD, z = g.zen * RAD;
          const aoi = Math.acos(Math.max(-1, Math.min(1, Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((g.az - o.az) * RAD)))) * DEG;
          if (aoi > res.H.peor) { res.H.peor = aoi; res.H.casos = [{ tag, key, fila: r, th: +ang[key][r].toFixed(1), aoi: +aoi.toFixed(1), elev: +g.elev.toFixed(1) }]; }
          if (aoi > 90) {
            /* v1.57.2: el AOI a secas NO puede bloquear. Recortar una fila al
               cono le da haz a ELLA y se lo quita a su vecina, así que a veces
               la planta pierde: medido, 0,29 W/m² en el caso de sol a 11° que
               reportó el auditor. Bloquear por el ángulo sería el árbitro
               óptico mandando otra vez sobre la energía — el vicio de R1. Lo
               que SÍ es defecto es dejar el arreglo GRATIS sin coger: se mide
               el coste de recortar y bloquea sólo cuando no cuesta nada. */
            const RU = F.rangosUnidad(g.zen, g.az, T);
            const rec = ang[key].map((v, i) => Math.max(RU[i][0], Math.min(RU[i][1], v)));
            const pAng = F.poaPlant(g.zen, g.az, T, ang[key], irr, doy, 0.2).plant;
            const dP = F.poaPlant(g.zen, g.az, T, rec, irr, doy, 0.2).plant - pAng;
            const dPct = pAng > 1e-6 ? 100 * dP / pAng : 0;   // el coste RELATIVO: un 1 % a sol bajo no es un 1 % a mediodía
            const q = { tag, key, fila: r, th: +ang[key][r].toFixed(1), aoi: +aoi.toFixed(1), elev: +g.elev.toFixed(1), dP: +dP.toFixed(3), dPct: +dPct.toFixed(2), poa: +pAng.toFixed(1) };
            res.H.espaldas.push(q);
            if (-dP > res.H.peorCoste) res.H.peorCoste = -dP;
            if (g.elev > 10) res.H.espaldas10.push(q);
            /* «GRATIS» con tolerancia ESCRITA: a escala de 0,3 W/m², el signo de
               una diferencia de punto flotante no puede decidir si algo bloquea.
               Gratis = recortar no cuesta más de 0,05 W/m² de planta. */
            if (dP >= -H_GRATIS) res.H.gratis.push(q);
            break; }
        }
      }
      /* J (v1.57.2, cuarta auditoría): el ÓPTIMO PUBLICADO ES EL MEJOR DE SU
         PROPIA REJILLA bajo el contador exacto. Hasta v1.57.1 esto era un
         resultado negativo sobre una muestra («0 instantes, caso B, semilla
         1234»), no una garantía: la búsqueda iba con el guía 2.5D, que lee cero
         donde la mesa mira de canto, y el veto sólo repescaba los extremos. Con
         la búsqueda exacta y el veto sobre la rejilla entera es por
         construcción — y esto lo vigila, con las dos semillas de la CI. Cada
         hora en punto, que son 5 evaluaciones exactas de más. */
      if (m % 60 === 0) {
        const base = F.driveCoupleSafe(g.zen, g.az, T, F.anglesPairwise(g.zen, g.az, T), false);
        const full = F.applyDrive(F.anglesAstro(g.zen, g.az, T), T.groups || null);
        let mejor = -Infinity, fMejor = null;
        for (const f of F.OPT_FRACTIONS) {
          const cand = base.map((b, i) => b + f * (full[i] - b));
          const v = F.poaPlant(g.zen, g.az, T, cand, irr, doy, 0.2).plant;
          if (v > mejor) { mejor = v; fMejor = f; }
        }
        const pPub = F.poaPlant(g.zen, g.az, T, ang.optimal, irr, doy, 0.2).plant;
        res.J.n++;
        if (mejor > pPub + 1e-6) {
          const d = mejor - pPub;
          if (d > res.J.peor) res.J.peor = d;
          res.J.casos.push({ tag, f: fMejor, mejor: +mejor.toFixed(1), pub: +pPub.toFixed(1), d: +d.toFixed(2) });
        }
      }
      /* I (v1.57.2, cuarta auditoría): ¿CUÁNTO deja de ser el pairwise publicado
         una política de «sombra 2.5D cero», y qué compra a cambio? El evaluador
         2.5D marca cero donde la mesa mira casi de canto mientras el contador
         exacto ve un tercio tapado, así que la garantía vive en la FÓRMULA
         acoplada, no en lo publicado. Esto mide la excepción: instantes en que
         lo publicado pasa del 2 % de 2.5D, con su elevación solar y la energía
         que compra frente a la fórmula. Se INFORMA, no bloquea. */
      {
        const acop = F.driveCoupleSafe(g.zen, g.az, T, F.anglesPairwise(g.zen, g.az, T), false);
        const p25 = (a) => { let m = 0; for (let p = 0; p < T.pairs.length; p++) { const pr = T.pairs[p];
            const psz = F.trueTrackAngle(g.zen, g.az, F.pvTilt(pr.axisTilt), T.axisAz);
            m = Math.max(m, F.shadeFracPair(psz, a[p], a[p + 1], pr.pitch, T.cw, pr.slope, T.z0)); } return m; };
        res.I.n++;
        const m25 = p25(ang.pairwise);
        if (m25 > 0.02) {
          const pP = F.poaPlant(g.zen, g.az, T, ang.pairwise, irr, doy, 0.2).plant;
          const pC = F.poaPlant(g.zen, g.az, T, acop, irr, doy, 0.2).plant;
          res.I.rompe.push({ tag, m25: +(100 * m25).toFixed(1), elev: +g.elev.toFixed(1), compra: +(pP - pC).toFixed(1), poa: +pP.toFixed(1) });
          res.I.compra += pP - pC; res.I.total += pP;
          if (m25 > res.I.peor) res.I.peor = m25;
        }
      }
      // B2 (v1.55.1): lo mismo con la sombra PUBLICADA (estructura incluida, 32
      // estaciones): ¿había un θ uniforme que dejara menos sombra de la que se
      // publica? Es el objetivo de la reparación desde v1.55.1
      for (const key of ['pairwise', 'true3d', 'mgl']) {
        const sh = F.shadeBand3DAll(g.zen, g.az, T, ang[key], { MV: 32 });
        let peor = 0, fila = -1;
        for (let r = 0; r < nR; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : []; const filas = Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0)); if (filas > peor) { peor = filas; fila = r; } }
        res.B2.n++;
        const tope = g.elev >= 10 ? 0.02 : 0.05;
        if (peor > tope) {
          let alc = 1;
          const RF2 = F.rangosUnidad(g.zen, g.az, T);
          for (let th = -c.maxang; th <= c.maxang; th += 2.5) {
            const s2 = F.shadeBand3DAll(g.zen, g.az, T, RF2.map(q => Math.max(q[0], Math.min(q[1], th))), { MV: 32 });
            let mx = 0;
            for (let r = 0; r < nR; r++) { const de = s2.de && s2.de[r] ? s2.de[r] : []; mx = Math.max(mx, Math.min(s2[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); }
            if (mx < alc) alc = mx;
          }
          const fallo = alc <= Math.max(0.01, 0.5 * peor);
          (fallo ? res.B2.casos : res.B2.fisica).push({ tag, key, fila, sombra: +(peor * 100).toFixed(1), alcanzable: +(alc * 100).toFixed(1), elev: +g.elev.toFixed(1) });
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
console.log(`B  poder de discriminación: candidatos alternativos MEJORES EN SOMBRA hallados: ${res.B.mejoresEnSombra} · de ellos, los que además NO PIERDEN energía (= fallo): ${res.B.casos.length}. Si el primero es grande y el segundo 0, el filtro está trabajando; si los dos son 0, B ya no discrimina y hay que rehacerla.`);
console.log(`B  sombra de planos con pairwise/true3d/mgl: ${res.B.n} instantes-política · FALLOS de política (había un θ mejor): ${res.B.casos.length} · sombra física (ningún θ la evita): ${res.B.fisica.length}`);
console.log(`B2 sombra PUBLICADA (estructura, 32 estaciones): ${res.B2.n} instantes-política · FALLOS (había un θ uniforme mejor): ${res.B2.casos.length} · física (ningún θ la evita): ${res.B2.fisica.length}`);
if (res.B2.casos.length) { const w = res.B2.casos.slice().sort((a, b) => b.sombra - a.sombra)[0]; console.log(`   B2 peor: ${w.sombra} % (alcanzable ${w.alcanzable} %) fila ${w.fila} ${w.key} sol ${w.elev}° · ${w.tag}`); }
console.log(`C  energía optimal ≥ pairwise, optfree ≥ optimal: ${res.C.n} instantes · violaciones: ${res.C.casos.length}`);
console.log(`D  acople por accionamiento: ${res.D.n} · violaciones: ${res.D.casos.length}`);
console.log(`E  θ finitos y en rango: ${res.E.n} · violaciones: ${res.E.casos.length}`);
console.log(`F  convergencia de la malla publicada (pairwise, cada hora): ${res.F.n} instantes · peor |Δ| frente a MV 128: ${(res.F.peor * 100).toFixed(2)} pp · filas con >2 % convergido y menos de la mitad publicado: ${res.F.perdidas.length}`);
if (res.F.casos.length) { const w = res.F.casos[0]; console.log(`   F peor: fila ${w.fila} publicado ${w.pub} % (MV ${w.mv}) frente a ${w.ref} % · ${w.tag}`); }
if (res.F.perdidas.length) console.log('   F pérdidas: ' + res.F.perdidas.slice(0, 5).map(q => `${q.tag} fila ${q.fila} ${q.pub} % vs ${q.ref} %`).join(' · '));
console.log(`G  nunca de canto (θ dentro del rango legítimo de su accionamiento): ${res.G.n} instantes-política · violaciones: ${res.G.casos.length}`);
console.log(`H  ninguna mesa de espaldas al sol (AOI del haz sobre la pala publicada, sol > 5°): ${res.H.n} instantes-política · peor AOI ${res.H.peor.toFixed(1)}° · con AOI > 90°: ${res.H.espaldas.length} (con sol > 10°: ${res.H.espaldas10.length}) · de esas, con arreglo GRATIS (recortar no cuesta energía de planta), que es lo que BLOQUEA: ${res.H.gratis.length} · lo que costaría recortar la peor: ${res.H.peorCoste.toFixed(2)} W/m² de planta · umbral de «gratis»: ${H_GRATIS} W/m²`);
if (res.H.casos.length) console.log(`   H peor: ${res.H.casos[0].key} fila ${res.H.casos[0].fila} θ ${res.H.casos[0].th} AOI ${res.H.casos[0].aoi}° sol ${res.H.casos[0].elev}° · ${res.H.casos[0].tag}`);
if (res.H.gratis.length) console.log('   H GRATIS (bloquea): ' + res.H.gratis.slice(0, 5).map(q => `${q.key} fila ${q.fila} θ ${q.th} AOI ${q.aoi}° sol ${q.elev}° ΔPOA ${q.dP} (${q.dPct} % de ${q.poa}) · ${q.tag}`).join(' · '));
if (res.H.espaldas.length) console.log('   H de espaldas: ' + res.H.espaldas.slice(0, 5).map(q => `${q.key} fila ${q.fila} θ ${q.th} AOI ${q.aoi}° sol ${q.elev}° ΔPOA ${q.dP} (${q.dPct} % de ${q.poa}) · ${q.tag}`).join(' · '));
console.log(`J  el óptimo publicado es el MEJOR de su rejilla con el contador exacto (cada hora): ${res.J.n} instantes · violaciones: ${res.J.casos.length}${res.J.casos.length ? ` · peor ${res.J.peor.toFixed(2)} W/m²` : ''}`);
if (res.J.casos.length) console.log('   J casos: ' + res.J.casos.slice(0, 5).map(q => `mejor f=${q.f} da ${q.mejor} y se publicó ${q.pub} (−${q.d}) · ${q.tag}`).join(' · '));
{
  const alt = res.I.rompe.filter(q => q.elev >= 20).length, baj = res.I.rompe.length - alt;
  console.log(`I  el pairwise PUBLICADO frente a su garantía 2.5D: ${res.I.n} instantes · pasa del 2 %: ${res.I.rompe.length} (${res.I.n ? (100 * res.I.rompe.length / res.I.n).toFixed(1) : 0} %) · de ellos con sol ≥ 20°: ${alt}, con sol < 20°: ${baj} · peor ${(100 * res.I.peor).toFixed(1)} % · energía que compra la excepción: ${res.I.compra.toFixed(0)} de ${res.I.total.toFixed(0)} W/m² (${res.I.total > 0 ? (100 * res.I.compra / res.I.total).toFixed(1) : 0} %)`);
  if (res.I.rompe.length) { const peores = res.I.rompe.slice().sort((a, b) => b.m25 - a.m25).slice(0, 3);
    console.log('   I peores: ' + peores.map(q => `2.5D ${q.m25} % · sol ${q.elev}° · compra ${q.compra} W/m² de ${q.poa} · ${q.tag}`).join(' · ')); }
}
if (res.G.casos.length) console.log('   G casos: ' + res.G.casos.slice(0, 5).map(q => `${q.key} fila ${q.fila} θ ${q.th} fuera de ${q.rango[0]}…${q.rango[1]} sol ${q.elev}° · ${q.tag}`).join(' · '));
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

/* v1.57.1: el barrido BLOQUEA. Hasta aquí imprimía las violaciones y salía con
   0, así que un invariante roto llegaba a publicarse con el gate en verde (el
   tercer auditor lo dijo con estas palabras: «G no es un gate, es un informe»).
   Los que rompen son los que tienen que valer SIEMPRE: A (contador ≡ oráculo),
   C (garantía de los optimizadores), D (acople), E (θ finitos y en rango),
   B (había un θ mejor y la política no lo cogió) y G (θ fuera del rango
   legítimo de su accionamiento) y H cuando la fila de espaldas tenía arreglo
   GRATIS (recortarla al cono no le costaba energía a la planta); cuando el
   arreglo cuesta, H informa con su cifra, porque bloquear por el ángulo a
   secas sería el árbitro óptico mandando sobre la energía — el vicio de R1. B2 y F se INFORMAN con su
   cifra. Y de B2 conviene saber POR QUÉ es cota optimista: mide contra el mejor
   θ uniforme sin exigirle recibir haz, así que hereda el mismo sesgo que
   destapó R1 — un árbitro que mide sombra ÓPTICA premia estructuralmente no
   recibir luz, porque lo que no recibe haz no se puede sombrear. */
const duros = [['A', res.A.casos.length], ['B', res.B.casos.length], ['C', res.C.casos.length],
               ['D', res.D.casos.length], ['E', res.E.casos.length], ['G', res.G.casos.length],
               ['H(de espaldas con arreglo gratis)', res.H.gratis.length],
               ['J(óptimo por debajo de su rejilla)', res.J.casos.length]];
const rotos = duros.filter(q => q[1] > 0);
if (rotos.length) { console.log('\nINVARIANTES ROTOS: ' + rotos.map(q => `${q[0]} (${q[1]})`).join(' · ')); process.exit(1); }
console.log('\ninvariantes duros (A, B, C, D, E, G) en verde');
