/* R4 · CAREO TÉRMINO A TÉRMINO del peor caso de la rama MESA con sol ≥ 10°.
 *
 *   node audit4/G_careo_609.mjs
 *
 * F_sombra_extremos dice que la rama MESA (`anglesPairwiseSeg`, que SÍ comprueba
 * la sombra en estaciones que incluyen los extremos, `backtracking.html:2704`)
 * deja hasta 609 mm de intrusión con el sol a ≥ 10°. O es un defecto real, o
 * mi modelo 3D y la comprobación 2.5D del simulador no miden lo mismo. Aquí se
 * pone, en el MISMO instante y el MISMO extremo, qué usa cada uno:
 * inclinación de emisor y receptor, punto de evaluación, separación, altura de
 * eje, θ, sol — y cuánta sombra ve cada uno. Luego se cambia UN término cada
 * vez del modelo 3D al del simulador para ver cuál explica la diferencia.
 *
 * El caso se toma del JSON de F_sombra_extremos (no se escribe a mano): el de
 * mayor intrusión en la rama mesa con elevación ≥ 10°.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineasDesdeCotas, intrusion, tauDe } from './lib_sombra_geo.mjs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_publicado.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const D = Math.PI / 180, Z0 = 0.17;
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, CW = datos.cuerda;

const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit4/out/F_sombra_extremos_antes.json'), 'utf-8'));
/* --caso=solapa: el peor de los que SÍ solapan en norte (la otra población) */
const SOLO_SOLAPA = process.argv.includes('--caso=solapa');
const LIN0 = lineasDesdeCotas(datos, 0);
const solapan = h => { const a = LIN0[h.emisor].mesas[h.mesaE], b = LIN0[h.receptor].mesas[h.mesaR];
  return Math.min(a.n[1], b.n[1]) > Math.max(a.n[0], b.n[0]); };
/* --caso=residuo: el peor de los que solapan Y SIGUEN con las mesas en la x de
   LÍNEA (F_sombra_extremos_xlinea.json): lo que la diferencia de x no explica */
const RESIDUO = process.argv.includes('--caso=residuo');
const clave = h => `${h.dia}|${h.utc}|${h.emisor}|${h.mesaE}|${h.extremo}|${h.par}`;
const enX = RESIDUO ? new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'audit4/out/F_sombra_extremos_xlinea.json'), 'utf-8'))
  .ramas.mesa.hallazgos.filter(h => h.evitable).map(clave)) : null;
const C = J.ramas.mesa.hallazgos.filter(h => h.elev >= 10 && h.evitable && (!(SOLO_SOLAPA || RESIDUO) || solapan(h)) && (!RESIDUO || enX.has(clave(h))))
  .sort((a, b) => b.intr_m - a.intr_m)[0];
if (RESIDUO) console.log('CASO · --caso=residuo: el peor que SOLAPA y SIGUE con las mesas en la x de línea');
console.log(`CASO · el peor de la rama MESA con sol ≥ 10°${SOLO_SOLAPA ? ' ENTRE LOS QUE SOLAPAN en norte' : ''} en F_sombra_extremos_antes.json`);
console.log(`  ${C.dia} ${C.local} (UTC ${C.utc}) elev ${C.elev}° · emisor línea ${C.emisor} mesa ${C.mesaE} → receptor línea ${C.receptor} mesa ${C.mesaR} (${C.filaR}) · extremo ${C.extremo} n=${C.n} · ${1000 * C.intr_m} mm`);

const { F, VER } = cargaSimulador(ROOT, ['singleaxis', 'trueTrackAngle', 'shadeFracPair', 'segZAt', 'segTiltAt',
  'rangoHaz', 'pvTilt', 'PASO_BUSQ', 'anglesPairwiseSeg', 'nan0', 'shadeRows']);
const { P, T } = terrenoComoLaPagina(F, datos, 500, 0);
const LIN = lineasDesdeCotas(datos, 0);
const nMid = LIN[0].mesas[0].n[0] - P.segs[0][0][0];
const eMean = LIN[0].mesas[0].z[0] - P.segZ[0][0][0];

const [Y, Mo, Dd] = C.dia === '21-jun' ? [2026, 5, 21] : [2026, 11, 21];
const [hh, mi] = C.utc.split(':').map(Number);
const g = F.solarPos(Date.UTC(Y, Mo, Dd, hh, mi), LAT, LON);
const doy = F.doyOf(`${Y}-${String(Mo + 1).padStart(2, '0')}-${Dd}`);
const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
const s = [Math.sin(g.zen * D) * Math.sin(g.az * D), Math.sin(g.zen * D) * Math.cos(g.az * D), Math.cos(g.zen * D)];
console.log(`  sol: zen ${g.zen.toFixed(4)}° az ${g.az.toFixed(4)}° elev ${g.elev.toFixed(4)}° · simulador ${VER}`);

/* ── 1 · LO QUE PUBLICA EL SIMULADOR, y la réplica de su bucle ──────────────
   Se replica el bucle de `anglesPairwiseSeg` (`backtracking.html:2675-2745`)
   con SUS funciones, para sacar lo que dentro no se ve: el candidato de cada
   solape, las estaciones y la sombra 2.5D en cada una. CONTROL: el min|θ| de
   la réplica tiene que ser el θ que la función devuelve, mesa a mesa. */
const pub = F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, 0.2);
const raw = F.anglesPairwiseSeg(g.zen, g.az, T);
function candidatos(r, k) {
  const sg = T.segs[r][k], tk = F.segTiltAt(T, r, k), out = [];
  const nR = T.pairs.length + 1;
  for (const [rn, p] of [[r - 1, r - 1], [r + 1, r]]) {
    if (rn < 0 || rn >= nR || !T.segs[rn] || !T.pairs[p]) continue;
    const pr = T.pairs[p];
    for (let kn = 0; kn < T.segs[rn].length; kn++) {
      const sn = T.segs[rn][kn];
      const lo = Math.max(sg[0], sn[0]), hi = Math.min(sg[1], sn[1]);
      if (hi <= lo) continue;
      const tkn = F.segTiltAt(T, rn, kn), mid = (lo + hi) / 2;
      const slopeAt = (vv) => { const za = F.segZAt(T, r, k, vv), zb = F.segZAt(T, rn, kn, vv);
        return (za != null && zb != null) ? Math.atan2(rn > r ? za - zb : zb - za, pr.pitch) / D : pr.slope; };
      const th0 = F.nan0(F.singleaxis(g.zen, g.az, { axisTilt: F.pvTilt((tk + tkn) / 2), axisAz: T.axisAz,
        maxAngle: T.maxAngle, backtrack: true, gcr: T.cw / pr.pitch, crossAxisTilt: slopeAt(mid) }));
      let th = th0, st = null, psz = null, v0 = null, vf = null;
      if (Math.abs(tk - tkn) > 1e-9) {
        psz = F.trueTrackAngle(g.zen, g.az, F.pvTilt((tk + tkn) / 2), T.axisAz); const sgn = psz >= 0 ? 1 : -1;
        const nSt = Math.max(3, Math.ceil((hi - lo) / 8) + 1); st = [];
        for (let i2 = 0; i2 < nSt; i2++) st.push({ v: lo + (hi - lo) * i2 / (nSt - 1), sl: slopeAt(lo + (hi - lo) * i2 / (nSt - 1)) });
        const viol = (t) => { let m = 0; for (const q of st) m = Math.max(m, F.shadeFracPair(psz, t, t, pr.pitch, T.cw, q.sl, T.z0)); return m; };
        const [hLo2, hHi2] = F.rangoHaz(g.zen, g.az, T, (tk + tkn) / 2, slopeAt((lo + hi) / 2));
        let bv = viol(th); v0 = bv;
        if (bv > 1e-3) { let bt = th;
          for (let t = th - sgn * F.PASO_BUSQ; sgn * t >= -T.maxAngle - 1e-9 && t >= hLo2 - 1e-9 && t <= hHi2 + 1e-9; t -= sgn * F.PASO_BUSQ) {
            const v = viol(t); if (v <= 1e-3) { bt = t; bv = 0; break; } if (v < bv) { bv = v; bt = t; } }
          th = bt; }
        vf = bv;
      }
      out.push({ rn, kn, lo, hi, tk, tkn, pitch: pr.pitch, slopeMid: slopeAt(mid), th0, th, psz, st, v0, vf, slopeAt });
    }
  }
  return out;
}
const rE = C.emisor, kE = C.mesaE, rR = C.receptor, kR = C.mesaR;
const cE = candidatos(rE, kE), cR = candidatos(rR, kR);
const minAbs = L => L.reduce((b, c) => (b === null || Math.abs(c.th) < Math.abs(b)) ? c.th : b, null);
const okE = Math.abs(minAbs(cE) - raw[rE][kE]) < 1e-9, okR = Math.abs(minAbs(cR) - raw[rR][kR]) < 1e-9;
console.log(`\nCONTROL DE RÉPLICA · min|θ| de la réplica = anglesPairwiseSeg: emisor ${minAbs(cE).toFixed(6)} vs ${raw[rE][kE].toFixed(6)} ${okE ? '✓' : '✗'} · receptor ${minAbs(cR).toFixed(6)} vs ${raw[rR][kR].toFixed(6)} ${okR ? '✓' : '✗'}`);
if (!okE || !okR) throw new Error('la réplica no reproduce anglesPairwiseSeg: el careo no valdría');

console.log(`\nDE DÓNDE SALE CADA θ PUBLICADO (candidatos de cada solape; manda el de menor |θ|; luego el acople de accionamiento)`);
for (const [nom, r, k, L] of [['emisor', rE, kE, cE], ['receptor', rR, kR, cR]]) {
  console.log(`  ${nom} línea ${r} mesa ${k}: publicado ${pub[r][k].toFixed(4)}° · sin acople ${raw[r][k].toFixed(4)}°`);
  for (const c of L) console.log(`    vecino línea ${c.rn} mesa ${c.kn} · solape [${(c.lo + nMid).toFixed(3)}, ${(c.hi + nMid).toFixed(3)}] · tilts ${c.tk.toFixed(4)}°/${c.tkn.toFixed(4)}° · pendiente en el medio ${c.slopeMid.toFixed(4)}° · singleaxis ${c.th0.toFixed(4)}° → candidato ${c.th.toFixed(4)}°` +
    (c.st ? ` · estaciones ${c.st.length}, sombra 2.5D antes ${c.v0.toFixed(4)} después ${c.vf.toFixed(4)}` : ' · SIN comprobación (tilts iguales)'));
}

/* ── 2 · ¿SOLAPAN EN NORTE el emisor y el receptor del caso? ───────────────
   La política por mesa solo compara mesas que SOLAPAN en n
   (`backtracking.html:2687-2688`: `if(hi<=lo)continue;`). El rayo 3D, con sol
   de componente norte, puede caer en una mesa vecina que NO solapa. */
const em = LIN[rE].mesas[kE], re = LIN[rR].mesas[kR];
const loER = Math.max(em.n[0], re.n[0]), hiER = Math.min(em.n[1], re.n[1]);
const thE = pub[rE][kE], thR = pub[rR][kR];
const m3 = intrusion(em, re, C.n, thE, thR, s, CW, Z0);
const f = (v, d = 4) => (v == null ? '—' : (+v).toFixed(d));
console.log(`\nSOLAPE EN NORTE del emisor y el receptor del caso`);
console.log(`  emisor   línea ${rE} mesa ${kE}: n [${f(em.n[0], 3)}, ${f(em.n[1], 3)}]`);
console.log(`  receptor línea ${rR} mesa ${kR}: n [${f(re.n[0], 3)}, ${f(re.n[1], 3)}]`);
console.log(`  solape: ${hiER > loER ? f(hiER - loER, 3) + ' m' : 'NINGUNO — hueco de ' + f(loER - hiER, 3) + ' m'} · el rayo sale del emisor en n=${f(C.n, 3)} y cae en n=${f(m3.nImpacto, 3)} (${f(m3.nImpacto - C.n, 3)} m)`);
const pareja = cE.find(c => c.rn === rR && c.kn === kR);
console.log(`  ¿la política evalúa esta pareja? ${pareja ? 'SÍ' : 'NO: no está entre los candidatos de ninguna de las dos mesas'}`);

/* ── 3 · EL ÁRBITRO: el contador 3D DEL PROPIO SIMULADOR ────────────────────
   `shadeRows` → `shadeBand3DAll` (`backtracking.html:2362-2376`) es el
   ray-cast multi-emisora con el que el simulador cobra la energía. Si ÉL ve
   sombra en el receptor con el θ publicado, la sombra es real en los términos
   del propio simulador y no una diferencia de modelo mía. Control: se repite
   con el θ común que mi verificador da como limpio para ese extremo. */
const sr = F.shadeRows(g.zen, g.az, T, pub);
const de = (sr.de[rR] || []).map(([e, v]) => `${e === 'terreno' ? 'terreno' : 'línea ' + e}: ${f(v, 4)}`).join(' · ');
console.log(`\nCONTADOR 3D DEL SIMULADOR con θ PUBLICADO (${VER})`);
console.log(`  fracción óptica de la mesa receptora (línea ${rR} mesa ${kR}): ${f(sr.seg[rR][kR], 4)}`);
console.log(`  su línea entera: ${f(sr[rR], 4)} · solo planos de módulo ${f(sr.pl[rR], 4)} · de quién: ${de || '—'}`);
const alt = pub.map(l => l.slice()); alt[rE][kE] = C.theta_limpio; alt[rR][kR] = C.theta_limpio;
const sr2 = F.shadeRows(g.zen, g.az, T, alt);
console.log(`  control · emisor y receptor al θ que mi verificador da como limpio (${C.theta_limpio}°): mesa receptora ${f(sr2.seg[rR][kR], 4)}`);
/* RESOLUCIÓN del contador: en planta real usa 8 estaciones por mesa
   (`backtracking.html:917`: `if(T.real)return 8;`), centradas en
   (j+0,5)/8 del largo (`:2245`). `mvPara` lee antes `T.mv` (`:916`), así que
   se puede pedir la MISMA cuenta más fina sin tocar el simulador. */
const L94 = re.n[1] - re.n[0];
console.log(`  estaciones del contador en esta mesa: 8 → paso ${f(L94 / 8, 3)} m; la más al norte en n=${f(re.n[1] - L94 / 16, 3)} · la franja sombreada (3D) va de n=${f(m3.nImpacto, 3)} al extremo n=${f(re.n[1], 3)}`);
for (const mv of [8, 16, 64, 256]) {
  const Tm = { ...T, mv };
  const a1 = F.shadeRows(g.zen, g.az, Tm, pub).seg[rR][kR], a2 = F.shadeRows(g.zen, g.az, Tm, alt).seg[rR][kR];
  console.log(`  MV=${String(mv).padStart(3)}: mesa receptora con θ publicado ${f(a1, 5)} (= ${f(a1 * L94, 3)} m·cuerda) · con θ limpio ${f(a2, 5)}`);
}
const m3b = intrusion(em, re, C.n, C.theta_limpio, C.theta_limpio, s, CW, Z0);
console.log(`           mi verificador con ese θ: ${f(m3b.intr * 1000, 1)} mm`);

/* ── 4 · TABLA TÉRMINO A TÉRMINO ─────────────────────────────────────────────
   Columna simulador = lo que usa la POLÍTICA (anglesPairwiseSeg) en el solape
   del emisor que contiene el extremo; columna 3D = mi verificador. */
const solE = cE.find(c => c.rn === rR && (Math.abs(c.lo + nMid - C.n) < 1e-6 || Math.abs(c.hi + nMid - C.n) < 1e-6));
const nSim = C.n - nMid;
/* sombra 2.5D del simulador en la estación del extremo, con θ dados (izquierda = línea de menor índice) */
const fs25 = (c, tE, tR) => { const psz = F.trueTrackAngle(g.zen, g.az, F.pvTilt((c.tk + c.tkn) / 2), T.axisAz);
  const [tl, tr] = rE < rR ? [tE, tR] : [tR, tE];
  return F.shadeFracPair(psz, tl, tr, c.pitch, T.cw, c.slopeAt(nSim), T.z0); };
const pszMedia = solE ? F.trueTrackAngle(g.zen, g.az, F.pvTilt((solE.tk + solE.tkn) / 2), T.axisAz) : null;
const filas = [
  ['instante', `${C.dia} ${C.utc} UTC`, `${C.dia} ${C.utc} UTC`],
  ['pareja que se mira', solE ? `línea ${rE} m${kE} con línea ${solE.rn} m${solE.kn} (la que SOLAPA)` : '—', `línea ${rE} m${kE} con línea ${rR} m${kR} (donde CAE el rayo)`],
  ['tilt emisor (+ = norte alto)', solE ? `${f(solE.tk)}° → usa la MEDIA ${f((solE.tk + solE.tkn) / 2)}°` : '—', `${f(tauDe(em) / D)}° (el suyo)`],
  ['tilt receptor', solE ? `${f(solE.tkn)}° (m${solE.kn}) → la MEDIA` : '—', `${f(tauDe(re) / D)}° (el suyo, m${kR})`],
  ['sol', solE ? `2D: ψ con el tilt medio = ${f(pszMedia)}°` : '—', `3D: ŝ = (${s.map(v => v.toFixed(4)).join(', ')})`],
  ['punto donde se evalúa', solE ? `estaciones del solape; la del extremo n=${f(C.n, 3)}; emisor y receptor en la MISMA n` : '—', `sale en n=${f(C.n, 3)}, cae en n=${f(m3.nImpacto, 3)}`],
  ['separación entre ejes', solE ? `pitch de LÍNEA ${f(solE.pitch)} m (x de línea: ${f(LIN[rE].x, 3)} / ${f(LIN[rR].x, 3)})` : '—', `x de FILA ${f(Math.abs(re.x - em.x))} m (x de fila: ${f(em.x, 3)} / ${f(re.x, 3)})`],
  ['altura de eje', `cota = EJE; cara a +z0 = ${T.z0} m por la normal`, `cota = CARA a θ=0 (supuesto); eje a −${Z0} m`],
  ['θ que comprueba la política', solE ? `${f(solE.th)}° común` : '—', '—'],
  ['θ publicado', `emisor ${f(thE)}° · receptor ${f(thR)}°`, `emisor ${f(thE)}° · receptor ${f(thR)}°`],
  ['sombra 2.5D en el extremo, θ común', solE ? `${f(fs25(solE, solE.th, solE.th) * 1000 * T.cw, 1)} mm (lo que comprueba)` : 'NO LO MIRA (no solapa)', `${f(intrusion(em, re, C.n, solE ? solE.th : thE, solE ? solE.th : thR, s, CW, Z0).intr * 1000, 1)} mm`],
  ['sombra en el extremo, θ PUBLICADO', solE ? `${f(fs25(solE, thE, pub[rR][solE.kn]) * 1000 * T.cw, 1)} mm (2.5D, receptor m${solE.kn} a ${f(pub[rR][solE.kn])}°) · contador 3D: ${f(sr.seg[rR][kR], 4)} de la mesa` : `NO LO MIRA · contador 3D: ${f(sr.seg[rR][kR], 4)} de la mesa`, `${f(m3.intr * 1000, 1)} mm`],
];
console.log(`\nTABLA · mismo instante, mismo extremo`);
console.log(`  ${'término'.padEnd(36)}| ${'POLÍTICA DEL SIMULADOR (anglesPairwiseSeg)'.padEnd(66)}| MI VERIFICADOR (3D)`);
for (const [a, b, c] of filas) console.log(`  ${a.padEnd(36)}| ${b.padEnd(66)}| ${c}`);

/* ── 5 · UN TÉRMINO CADA VEZ ────────────────────────────────────────────────
   Se parte del 3D con el θ publicado y se le cambia UN término por el que usa
   el simulador. Si uno solo se lleva la diferencia, ése es el que no miden
   igual. La mesa sustituida es una viga recta que pasa por la MISMA cota en
   el extremo. */
const conTilt = (m, tauDeg, nRef) => { const z = m.z[0] + (m.z[1] - m.z[0]) * ((nRef - m.n[0]) / (m.n[1] - m.n[0])), t = Math.tan(tauDeg * D);
  return { ...m, z: [z + t * (m.n[0] - nRef), z + t * (m.n[1] - nRef)] }; };
const tM = solE ? (solE.tk + solE.tkn) / 2 : (tauDe(em) + tauDe(re)) / 2 / D;
const xE = LIN[rE].x, xR = LIN[rR].x;
const thC = solE ? solE.th : null;
const casos = [
  ['3D con θ publicado (el hallazgo)', em, re, thE, thR],
  ['  x = la de LÍNEA (como el simulador)', { ...em, x: xE }, { ...re, x: xR }, thE, thR],
  ['  tilt = la MEDIA de la pareja', conTilt(em, tM, C.n), conTilt(re, tM, C.n), thE, thR],
  ...(thC != null ? [['  θ = el común que comprueba la política', em, re, thC, thC]] : []),
  ['  x de línea + tilt medio', conTilt({ ...em, x: xE }, tM, C.n), conTilt({ ...re, x: xR }, tM, C.n), thE, thR],
];
console.log(`\nSUSTITUCIÓN · un término del simulador cada vez, en el 3D (intrusión en el extremo, θ publicado salvo donde se dice)`);
for (const [nom, a, b, t1, t2] of casos) {
  const r = intrusion(a, b, C.n, t1, t2, s, CW, Z0);
  const dentro = r.nImpacto >= b.n[0] && r.nImpacto <= b.n[1];
  console.log(`  ${nom.padEnd(44)} ${f(r.intr * 1000, 1).padStart(7)} mm · impacto n=${f(r.nImpacto, 3)} ${dentro ? 'dentro' : 'FUERA'} de la mesa`);
}
