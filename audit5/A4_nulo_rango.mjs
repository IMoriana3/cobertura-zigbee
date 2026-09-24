/* R5 · A.4 · TEST NULO DEL RANGO: ¿el rango legítimo es lo que ACOTA a las mesas
 * que la decisión nueva deja con sombra (las «irreducibles»)?
 * En cada instante de Ayora (21-jun y 21-dic, cada 30 min) con sombra residual
 * tras `decideProyeccion` (ruta por mesa, `pairwise`):
 *   · se toman las unidades implicadas (receptoras y emisoras, > 1e-3 / 1e-4);
 *   · se comprueba que están en el tope de su rango y que la decisión NO agotó
 *     sus iteraciones;
 *   · se las saca del rango: retroceden JUNTAS d grados más allá del tope
 *     (d = 1, 2, 5, 10, 20, 40), sin pasar del tope mecánico ±T.maxAngle;
 *   · se cuenta con el contador (planos, sin terreno) cuántas de las mesas
 *     residuales siguen con sombra.
 * Si fuera del rango se arreglan, el rango ACOTA: resultado legítimo. Si no se
 * arreglan ni fuera del rango, son irreducibles de geometría.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { F: N } = cargaSimulador(ROOT, ['shadeBand3DAll', 'mvPara', 'decideProyeccion', 'anglesPairwiseSeg', 'unidadesDecision', 'rangosFila', 'trueTrackAngle']);
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const T = terrenoComoLaPagina(N, d, 80, 0).T, ALT = d.base, lat = 39.1182081, lon = -1.1598527;
const ev = (zen, az, A) => N.shadeBand3DAll(zen, az, T, A, { noStruct: true, noTerr: true, MV: N.mvPara(T, zen), atrMesa: true });
const DS = [1, 2, 5, 10, 20, 40];
const res = [];
for (const [mo, dd] of [[5, 21], [11, 21]]) {
  const doy = N.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-${dd}`);
  for (let min = 0; min < 1440; min += 30) {
    const g = N.solarPos(Date.UTC(2026, mo, dd) + min * 60000, lat, lon);
    if (!(g.elev > 0.5)) continue;
    const D = N.decideProyeccion(g.zen, g.az, T, N.anglesPairwiseSeg(g.zen, g.az, T, { candidato: true }), true);
    const A = D.ang, C = ev(g.zen, g.az, A);
    const malas = []; C.seg.forEach((l, r) => l.forEach((v, k) => { if (v > 1e-3) malas.push([r, k]); }));
    if (!malas.length) continue;
    const RF = N.rangosFila(g.zen, g.az, T), { U, de } = N.unidadesDecision(T, true);
    const sg = N.trueTrackAngle(g.zen, g.az, 0, T.axisAz) >= 0 ? 1 : -1;
    const S = new Set();
    for (const [r, k] of malas) { S.add(de.get(r + '|' + k)); const at = C.atrMesa[r][k] || {}; for (const q in at) if (at[q] > 1e-4) { const u = de.get(q); if (u !== undefined) S.add(u); } }
    const tope = u => { let lo = -Infinity, hi = Infinity; for (const [r] of U[u]) { lo = Math.max(lo, RF[r][0]); hi = Math.min(hi, RF[r][1]); } return sg > 0 ? lo : hi; };
    let enTope = 0; for (const u of S) if (Math.abs(A[U[u][0][0]][U[u][0][1]] - tope(u)) < 1e-9) enTope++;
    const fila = { t: `${mo + 1}-${dd} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} UTC`, sol: +g.elev.toFixed(2), mesas: malas.length, unidades: S.size, enTope, iter: D.info.iter, fuera: {} };
    for (const dg of DS) {
      const B = A.map(l => l.slice());
      for (const u of S) { const v = tope(u) - sg * dg, w = Math.max(-T.maxAngle, Math.min(T.maxAngle, v)); for (const [r, k] of U[u]) B[r][k] = w; }
      const CB = ev(g.zen, g.az, B);
      let siguen = 0, nuevas = 0; const esMala = new Set(malas.map(([r, k]) => r + '|' + k));
      CB.seg.forEach((l, r) => l.forEach((v, k) => { if (v > 1e-3) { if (esMala.has(r + '|' + k)) siguen++; else nuevas++; } }));
      fila.fuera[dg] = { siguen, nuevas };
    }
    res.push(fila);
    console.log(`${fila.t} sol ${fila.sol}° · ${fila.mesas} mesas con sombra, ${fila.unidades} unidades implicadas, ${fila.enTope} en el tope, iter ${fila.iter} · fuera del rango, siguen con sombra: ` +
      DS.map(dg => `+${dg}° → ${fila.fuera[dg].siguen}${fila.fuera[dg].nuevas ? ` (+${fila.fuera[dg].nuevas} nuevas)` : ''}`).join(' · '));
  }
}
fs.writeFileSync(path.join(ROOT, 'audit5/out/A4_nulo_rango.json'), JSON.stringify(res, null, 1));
