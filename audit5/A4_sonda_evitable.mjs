/* R5 · A.4 · SONDA: por qué la sombra evitable media de `pairwise` en Ayora SUBE
 * con la decisión nueva (0,3138 → 0,5492 %, audit5/out/A4_efecto_ayora_dia.txt)
 * mientras el error «no» baja a 0. Por instante (21-jun y 21-dic, cada 30 min):
 *   · mesas con sombra evitable (planos, sin terreno, > 1e-3) ANTES y DESPUÉS;
 *   · de las unidades implicadas DESPUÉS, cuántas están en el TOPE de su rango
 *     legítimo (`rangosFila`) — irreducibles de verdad — y cuántas no;
 *   · si la decisión agotó sus iteraciones (80 a 1°, 120 a 0,1°);
 *   · de las mesas ANTES, cuántas quedaban FUERA del rango legítimo;
 *   · la POA de planta antes y después (`poaPlantSeg`, contador completo).
 * `--pol=pairwise` (ruta por mesa) o `--pol=true3d` (ruta por línea: unidad =
 * línea de `T.groups`, guardia de energía, marca `aceptadaPorEnergia`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POL = (process.argv.find(a => a.startsWith('--pol=')) || '--pol=pairwise').slice(6), porMesa = POL === 'pairwise';
const EXTRA = ['poaPlantSeg', 'anglesTrue3d', 'shadeBand3DAll', 'mvPara', 'decideProyeccion', 'anglesPairwiseSeg', 'unidadesDecision', 'rangosFila', 'trueTrackAngle', 'PASO_BUSQ'];
const { F: N } = cargaSimulador(ROOT, EXTRA);
const htmlMain = execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const { F: V } = cargaSimulador(ROOT, ['shadeBand3DAll', 'mvPara'], () => htmlMain);
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const T = terrenoComoLaPagina(N, d, 80, 0).T, ALT = d.base, lat = 39.1182081, lon = -1.1598527;
const nR = T.pairs.length + 1;
const ev = (F, zen, az, A) => N.shadeBand3DAll(zen, az, T, A, { noStruct: true, noTerr: true, MV: N.mvPara(T, zen), atrMesa: true });
const malas = C => { let n = 0; C.seg.forEach(l => l.forEach(v => { if (v > 1e-3) n++; })); return n; };
const bc = a => a.map((v, r) => ((T.segs && T.segs[r]) || [[-30, 30]]).map(() => v));
const tot = { kwhV: 0, kwhN: 0, aceptadas: 0, inst: 0, malasV: 0, malasN: 0, implic: 0, enTope: 0, fueraTope: 0, agotadas: 0, fueraRangoV: 0, mesas: 0 };
for (const [mo, dd] of [[5, 21], [11, 21]]) {
  const doy = N.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-${dd}`);
  for (let min = 0; min < 1440; min += 30) {
    const g = N.solarPos(Date.UTC(2026, mo, dd) + min * 60000, lat, lon);
    if (!(g.elev > 0.5)) continue;
    const irr = N.clearskyIneichen(g.zen, doy, ALT, 3.5);
    const AV = porMesa ? V.policyAnglesSeg(POL, g.zen, g.az, T, irr, doy, 0.2) : bc(V.policyAngles(POL, g.zen, g.az, T, irr, doy, 0.2).angles);
    const aN = N.policyAngles(POL, g.zen, g.az, T, irr, doy, 0.2).angles;
    const AN = porMesa ? N.policyAnglesSeg(POL, g.zen, g.az, T, irr, doy, 0.2) : bc(aN);
    const acept = !porMesa && !!aN.aceptadaPorEnergia;
    const semilla = porMesa ? N.anglesPairwiseSeg(g.zen, g.az, T, { candidato: true }) : N.anglesTrue3d(g.zen, g.az, T);
    const D = N.decideProyeccion(g.zen, g.az, T, semilla, porMesa);
    const igual = acept || (porMesa ? D.ang.every((l, r) => l.every((v, k) => v === AN[r][k])) : D.ang.every((v, r) => v === aN[r]));
    const pV = N.poaPlantSeg(g.zen, g.az, T, AV, irr, doy, 0.2).plant, pN = N.poaPlantSeg(g.zen, g.az, T, AN, irr, doy, 0.2).plant;
    const CV = ev(V, g.zen, g.az, AV), CN = ev(N, g.zen, g.az, AN);
    const RF = N.rangosFila(g.zen, g.az, T);
    const { U, de } = N.unidadesDecision(T, porMesa);
    const sg = N.trueTrackAngle(g.zen, g.az, 0, T.axisAz) >= 0 ? 1 : -1;
    // unidades implicadas después: receptoras y emisoras con sombra > 1e-3
    const S = new Set();
    CN.seg.forEach((l, r) => l.forEach((v, k) => { if (!(v > 1e-3)) return; S.add(de.get(r + '|' + k));
      const at = CN.atrMesa[r][k] || {}; for (const q in at) if (at[q] > 1e-4) { const u = de.get(q); if (u !== undefined) S.add(u); } }));
    let enTope = 0;
    for (const u of S) { const t = U[u]; let lo = -Infinity, hi = Infinity; for (const [r] of t) { lo = Math.max(lo, RF[r][0]); hi = Math.min(hi, RF[r][1]); }
      const v = AN[t[0][0]][t[0][1]]; if (Math.abs(v - (sg > 0 ? lo : hi)) < 1e-9) enTope++; }
    let fuera = 0, mesas = 0; AV.forEach((l, r) => l.forEach(v => { mesas++; if (v < RF[r][0] - 1e-9 || v > RF[r][1] + 1e-9) fuera++; }));
    const agotada = D.info.iter >= 80;
    tot.kwhV += pV / 1000 / 2; tot.kwhN += pN / 1000 / 2; tot.aceptadas += acept ? 1 : 0; tot.inst++; tot.malasV += malas(CV); tot.malasN += malas(CN); tot.implic += S.size; tot.enTope += enTope; tot.fueraTope += S.size - enTope; tot.agotadas += agotada ? 1 : 0; tot.fueraRangoV += fuera; tot.mesas += mesas;
    console.log(`${mo + 1}-${dd} ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')} UTC sol ${g.elev.toFixed(1)}° · mesas con sombra evitable ${malas(CV)} → ${malas(CN)} · implicadas después ${S.size} (en tope ${enTope}) · iter ${D.info.iter} irred ${D.info.irreducibles}${agotada ? ' AGOTADA' : ''} · antes fuera de rango ${fuera}/${mesas} · POA ${pV.toFixed(1)} → ${pN.toFixed(1)} W/m²${acept ? ' · ACEPTADA POR ENERGÍA' : ''}${igual ? '' : ' · ¡DECISIÓN ≠ PUBLICADA!'}`);
  }
}
console.log('TOTAL', JSON.stringify(tot));
