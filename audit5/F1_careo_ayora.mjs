/* R5 · 1.8 — CAREO DEL MOTOR CONTRA EL CONTADOR 3D DEL SIMULADOR, EN AYORA.
 *
 *   node audit5/F1_careo_ayora.mjs [--json=RUTA]
 *
 * Mismo instante, mismos θ (los que publica `pairwise` por mesa), mismas
 * estaciones: el contador `shadeBand3DAll` (`backtracking.html:1938`) con
 * `noStruct` (solo planos de módulo, como el motor) y MV = 64 por mesa (vía
 * `T.mv`, que `mvPara` lee antes que nada, `:916`), contra el motor evaluado en
 * las mismas 64 estaciones (j+½)/64 de cada mesa.
 *
 * Tres variantes del motor:
 *   · x de LÍNEA — la geometría del simulador (`:1946-1948`): así se carea el
 *     MOTOR, en igualdad de condiciones;
 *   · x de FILA  — la del levantamiento: la diferencia con la anterior es C6;
 *   · x de LÍNEA + la cuerda del SIMULADOR (plano vertical E-O, `:2101`, `:2312`)
 *     — CONTROL de la explicación de la discrepancia residual: si con ella el
 *     careo cuadra, la diferencia que queda en la primera es esa cizalla.
 *
 * Lo que el contador tiene y el motor no, declarado: el TERRENO
 * (`:2048`, `const doTerr=true;`, no se puede apagar). Por eso solo instantes con
 * sol ≥ 5°, y la discrepancia que quede se explica con el rayo, no se ajusta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vectorSol, caraMesa, relaciones, fraccionEstacion, sombraSobre } from './lib_proyeccion.mjs';
import { lineasDesdeCotas } from './lib_mesas.mjs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { F, VER } = cargaSimulador(ROOT, ['shadeBand3DAll']);
const { T } = terrenoComoLaPagina(F, datos, 500, 0);
const LIN = lineasDesdeCotas(datos, 0);
const MV = 64, Z0 = 0.17, CW = datos.cuerda;
const Tm = { ...T, mv: MV };
const INST = [['21-jun', 5, 21, 5, 0], ['21-jun', 5, 21, 6, 30], ['21-jun', 5, 21, 17, 30], ['21-jun', 5, 21, 18, 30],
              ['21-dic', 11, 21, 8, 30], ['21-dic', 11, 21, 14, 30], ['21-dic', 11, 21, 15, 30]];   // UTC
console.log(`R5 · 1.8 · careo motor ↔ shadeBand3DAll (${VER}) · Ayora ${LIN.length} líneas · MV ${MV} · noStruct`);
const res = [];
for (const [dia, mo, d, h, mi] of INST) {
  const g = F.solarPos(Date.UTC(2026, mo, d, h, mi), lay.clat, lay.clon);
  if (g.elev < 5) { console.log(`  ${dia} ${h}:${mi} UTC · sol ${g.elev.toFixed(1)}° < 5°: fuera (terreno)`); continue; }
  const doy = F.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-${d}`);
  const ang = F.policyAnglesSeg('pairwise', g.zen, g.az, T, F.clearskyIneichen(g.zen, doy, datos.base, 3.5), doy, 0.2);
  const sim = F.shadeBand3DAll(g.zen, g.az, Tm, ang, { noStruct: true, MV });
  const s = vectorSol(g.zen, g.az);
  const fila = { dia, utc: `${h}:${String(mi).padStart(2, '0')}`, elev: g.elev };
  for (const variante of ['linea', 'fila', 'linea+cuerda del simulador']) {
    const C = [], idx = [];
    LIN.forEach((L, r) => L.mesas.forEach((m, k) => { C.push(caraMesa(variante === 'fila' ? m : { ...m, x: L.x }, ang[r][k], Z0, CW, { cuerdaSimulador: variante.includes('cuerda') })); idx.push([r, k]); }));
    const rel = relaciones(C, s);
    let peor = { d: 0 }, n1 = 0, nSim = 0, nMot = 0, sumAbs = 0;
    C.forEach((R, i) => {
      const [r, k] = idx[i], polys = rel[i].map(x => x.poly);
      let f = 0; for (let j = 0; j < MV; j++) f += fraccionEstacion(R, polys, R.L * (j + 0.5) / MV); f /= MV;
      const fs2 = sim.seg[r][k], dd = f - fs2;
      if (fs2 > 1e-6) nSim++; if (f > 1e-6) nMot++;
      if (Math.abs(dd) > 0.01) n1++; sumAbs += Math.abs(dd);
      if (Math.abs(dd) > Math.abs(peor.d)) peor = { d: dd, r, k, motor: f, sim: fs2, emisores: rel[i].map(x => { const [re, ke] = idx[x.e]; return `L${re}m${ke}`; }) };
    });
    fila[variante] = { mesas: C.length, conSombraSim: nSim, conSombraMotor: nMot, masDe1pp: n1, mediaAbs: sumAbs / C.length, peor };
    console.log(`  ${dia} ${fila.utc} UTC (sol ${g.elev.toFixed(1)}°) · x de ${variante} · con sombra: simulador ${nSim}, motor ${nMot} · |Δ|>1 pp en ${n1} de ${C.length} mesas · media |Δ| ${(100 * sumAbs / C.length).toFixed(3)} pp · peor L${peor.r}m${peor.k}: motor ${(100 * peor.motor).toFixed(2)} % / sim ${(100 * peor.sim).toFixed(2)} % (emisores ${peor.emisores.join(',') || '—'})`);
  }
  res.push(fila);
}
const dest = arg('json', '');
if (dest) { fs.writeFileSync(path.join(ROOT, dest), JSON.stringify({ ver: VER, MV, z0: Z0, instantes: res }, null, 1)); console.log(`JSON en ${dest}`); }

/* ── LOS DOS RESIDUOS QUE LA CUERDA NO EXPLICA, rayo a rayo ─────────────────
   (1) el contador del simulador no considera emisores de la MISMA línea
       (`if(pl.e===r)continue;` al armar candidatos): se quita ese emisor del
       motor y se mira si cuadra;
   (2) el contador suma TERRENO (`:2048`): se lee su propia atribución `out.de`. */
console.log('\nRESIDUOS · x de línea + cuerda del simulador');
for (const [dia, mo, d, h, mi, r0, k0] of [['21-dic', 11, 21, 15, 30, 61, 4], ['21-jun', 5, 21, 18, 30, 61, 1]]) {
  const g = F.solarPos(Date.UTC(2026, mo, d, h, mi), lay.clat, lay.clon), doy = F.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-${d}`);
  const ang = F.policyAnglesSeg('pairwise', g.zen, g.az, T, F.clearskyIneichen(g.zen, doy, datos.base, 3.5), doy, 0.2);
  const sim = F.shadeBand3DAll(g.zen, g.az, Tm, ang, { noStruct: true, MV }), s = vectorSol(g.zen, g.az);
  const C = [], idx = [];
  LIN.forEach((L, r) => L.mesas.forEach((m, k) => { C.push(caraMesa({ ...m, x: L.x }, ang[r][k], Z0, CW, { cuerdaSimulador: true })); idx.push([r, k]); }));
  const i = idx.findIndex(([r, k]) => r === r0 && k === k0), rel = relaciones(C, s)[i];
  const fr = polys => { let f = 0; for (let j = 0; j < MV; j++) f += fraccionEstacion(C[i], polys, C[i].L * (j + 0.5) / MV); return f / MV; };
  const todos = fr(rel.map(x => x.poly)), sinMisma = fr(rel.filter(x => idx[x.e][0] !== r0).map(x => x.poly));
  const de = (sim.de[r0] || []).map(([e, v]) => `${e === 'terreno' ? 'terreno' : 'línea ' + e} ${(100 * v).toFixed(3)} %`).join(' · ');
  console.log(`  ${dia} ${h}:${mi} UTC L${r0}m${k0}: simulador ${(100 * sim.seg[r0][k0]).toFixed(3)} % · motor con todos ${(100 * todos).toFixed(3)} % · motor SIN emisores de su línea ${(100 * sinMisma).toFixed(3)} % · emisores ${rel.map(x => 'L' + idx[x.e].join('m')).join(',')} · atribución del simulador (línea entera): ${de || '—'}`);
}

/* ── RESIDUO 2, a fondo: 21-jun 18:30 UTC, L61m1 ───────────────────────────
   (a) ¿de dónde viene la sombra que ve el simulador? se hunden 100 m el
       emisor L60m2, y luego todas las demás líneas: si baja a 0 no es terreno;
   (b) estación a estación, motor contra la RÉPLICA de la fórmula de estación
       del simulador (`:2256-2284`) con la misma geometría;
   (c) dónde acaba la cara del emisor en cada modelo. */
{
const g = F.solarPos(Date.UTC(2026, 5, 21, 18, 30), lay.clat, lay.clon), doy = F.doyOf('2026-06-21');
const ang = F.policyAnglesSeg('pairwise', g.zen, g.az, T, F.clearskyIneichen(g.zen, doy, datos.base, 3.5), doy, 0.2);
const sim = F.shadeBand3DAll(g.zen, g.az, { ...T, mv: 64 }, ang, { noStruct: true, MV: 64 });
console.log('\nRESIDUO 2 · 21-jun 18:30 UTC · L61m1');
const segZ2 = T.segZ.map((l, r) => l.map((z, k) => (r === 60 && k === 2) ? [z[0] - 100, z[1] - 100] : z.slice()));
const sim2 = F.shadeBand3DAll(g.zen, g.az, { ...T, mv: 64, segZ: segZ2 }, ang, { noStruct: true, MV: 64 });
console.log('  (a) con L60m2 hundida 100 m → simulador L61m1', sim2.seg[61][1]);
const segZ3 = T.segZ.map((l, r) => l.map((z, k) => (r !== 61) ? [z[0] - 100, z[1] - 100] : z.slice()));
const sim3 = F.shadeBand3DAll(g.zen, g.az, { ...T, mv: 64, segZ: segZ3 }, ang, { noStruct: true, MV: 64 });
console.log('  (a) con TODAS las demás líneas hundidas 100 m → simulador L61m1', sim3.seg[61][1]);
const s = vectorSol(g.zen, g.az);
const R = caraMesa({ ...LIN[61].mesas[1], x: LIN[61].x }, ang[61][1], 0.17, datos.cuerda, { cuerdaSimulador: true });
const E = caraMesa({ ...LIN[60].mesas[2], x: LIN[60].x }, ang[60][2], 0.17, datos.cuerda, { cuerdaSimulador: true });
const sh = sombraSobre(E, R, s);
console.log('sol', g.elev.toFixed(2), g.az.toFixed(2), '· θ R', ang[61][1].toFixed(3), 'θ E', ang[60][2].toFixed(3), '· E n', LIN[60].mesas[2].n.map(v => v.toFixed(2)).join('..'), 'R n', LIN[61].mesas[1].n.map(v => v.toFixed(2)).join('..'));
console.log('polígono de sombra (u,v):', sh.poly.map(q => q.map(w => w.toFixed(3)).join(',')).join(' | '));
const est = []; for (let j = 0; j < 64; j++) { const f = fraccionEstacion(R, [sh.poly], R.L * (j + 0.5) / 64); if (f > 0) est.push(`${j}:${(100 * f).toFixed(2)}%`); }
console.log('motor por estación (j:fracción):', est.join(' '));
console.log('simulador por ala [sur, norte]:', sim.wing[61][1].map(v => (100 * v).toFixed(4) + '%').join(' '), '· motor por ala:', [0, 1].map(w => { let f = 0; for (let j = w * 32; j < w * 32 + 32; j++) f += fraccionEstacion(R, [sh.poly], R.L * (j + 0.5) / 64); return (100 * f / 32).toFixed(4) + '%'; }).join(' '));
/* réplica de la fórmula de estación del simulador (:2256-2284) con la geometría del motor */
const Dg = Math.PI / 180, hw = datos.cuerda / 2, zOff = 0.17;
const me = LIN[60].mesas[2], mr = LIN[61].mesas[1];
const thE = ang[60][2] * Dg, sE = (me.z[1] - me.z[0]) / (me.n[1] - me.n[0]);
const uD = [Math.cos(thE), 0, -Math.sin(thE)], vD = [0, 1, sE];
const nE = [uD[1] * vD[2] - uD[2] * vD[1], uD[2] * vD[0] - uD[0] * vD[2], uD[0] * vD[1] - uD[1] * vD[0]], lnE = Math.hypot(...nE), nu = nE.map(v => v / lnE);
const axC = [LIN[60].x, (me.n[0] + me.n[1]) / 2, (me.z[0] + me.z[1]) / 2];
const pl = { C: axC.map((v, i) => v + zOff * nu[i]), nE, uD, vD, w0: me.n[0], w1: me.n[1], kuv: uD[0] * vD[0] + uD[1] * vD[1] + uD[2] * vD[2] };
const sv = s; pl.den = nE[0] * sv[0] + nE[1] * sv[1] + nE[2] * sv[2];
const thR = ang[61][1] * Dg, cR = Math.cos(thR), s2 = -Math.sin(thR), sRr = (mr.z[1] - mr.z[0]) / (mr.n[1] - mr.n[0]);
const nrv = [Math.sin(thR), -cR * sRr, cR], lnr = Math.hypot(...nrv), of = nrv.map(v => zOff * v / lnr);
const replica = j => {
  const v = mr.n[0] + (mr.n[1] - mr.n[0]) * (j + 0.5) / 64, zR = mr.z[0] + sRr * (v - mr.n[0]);
  const px0 = LIN[61].x + of[0], py0 = v + of[1], pz0 = zR + of[2];
  const t0 = (pl.C[0] - px0) * pl.nE[0] + (pl.C[1] - py0) * pl.nE[1] + (pl.C[2] - pz0) * pl.nE[2], tc = cR * pl.nE[0] + s2 * pl.nE[2];
  let lo = -hw, hi = hw, ok = true;
  const lin = (A, B) => { if (A > 1e-12) { const x = B / A; if (x < hi) hi = x; } else if (A < -1e-12) { const x = B / A; if (x > lo) lo = x; } else if (B < -1e-12) ok = false; };
  if (pl.den > 0) lin(tc, t0 - 1e-6 * pl.den); else lin(-tc, 1e-6 * pl.den - t0);
  const q = sv[1] / pl.den; lin(q * tc, py0 + q * t0 - pl.w0); lin(-q * tc, pl.w1 - py0 - q * t0);
  const a0 = (px0 - pl.C[0]) * pl.uD[0] + (py0 - pl.C[1]) * pl.uD[1] + (pz0 - pl.C[2]) * pl.uD[2], a1 = cR * pl.uD[0] + s2 * pl.uD[2], a2 = sv[0] * pl.uD[0] + sv[1] * pl.uD[1] + sv[2] * pl.uD[2];
  let d0 = a0 + a2 * t0 / pl.den, dc = a1 - a2 * tc / pl.den; const wq = py0 - pl.C[1] + q * t0; d0 -= pl.kuv * wq; dc += pl.kuv * q * tc;
  lin(dc, hw - d0); lin(-dc, hw + d0);
  return ok && hi - lo > 1e-12 ? (hi - lo) / (2 * hw) : 0;
};
const rj = []; let sumR = 0; for (let j = 0; j < 64; j++) { const f = replica(j); sumR += f; if (f > 0) rj.push(`${j}:${(100 * f).toFixed(2)}%`); }
console.log('réplica de la fórmula del simulador por estación:', rj.join(' '), '· ala norte', (100 * sumR / 32).toFixed(4) + '%');
console.log(`extremo sur de la CARA del emisor · motor (eje + z0·normal): y = ${E.F0[1].toFixed(4)} · simulador (acota H1 ≥ w0, el extremo del EJE): y = ${pl.w0.toFixed(4)} · diferencia ${(1000 * (E.F0[1] - pl.w0)).toFixed(2)} mm (= z0·n_y, τE ${(Math.atan(sE) * 180 / Math.PI).toFixed(3)}°)`);
console.log(`estación 60 del receptor en v = ${(R.L * 60.5 / 64).toFixed(4)} m; el motor cierra el triángulo en v = ${Math.min(...sh.poly.map(q => q[1])).toFixed(4)} m`);
}
