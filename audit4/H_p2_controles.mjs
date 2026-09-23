/* R4 · MEDIDA (c) — CONTROLES ANTES DE CONTAR NADA.
 *   node audit4/H_p2_controles.mjs
 * 3.2a · fidelidad de Δz: la media reconstruida = `pairDz` del simulador, en las 106 parejas.
 * 3.2b · fidelidad de la cadena: en modo 'media' el arnés da EXACTAMENTE los θ de
 *        policyAngles('pairwise'), en todas las líneas de todos los instantes.
 * 3.1  · test nulo: en modo 'extremos' los candidatos son DISTINTOS de los de hoy
 *        en el conjunto medido. Si coincidieran, la medida no informaría.
 * Mismos instantes que F_sombra_extremos (cada 5 min, sol 0,5°–40°, BT activo).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_publicado.mjs';
import { dzPorPareja, anglesLineaP2 } from './lib_p2_arnes.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { F, VER } = cargaSimulador(ROOT, ['pairEval3D', 'pairThetaTorsion', 'pairStations', 'driveCoupleSafe', 'repairNoShade',
  'singleaxis', 'trueTrackAngle', 'rangoHaz', 'pvTilt', 'nan0', 'PASO_BUSQ']);
const { P, T } = terrenoComoLaPagina(F, datos, 500, 0);
const DZ = dzPorPareja(P);
let dMax = 0; for (let i = 0; i < DZ.length; i++) dMax = Math.max(dMax, Math.abs(DZ[i].media - P.pairDz[i]));
console.log(`3.2a · FIDELIDAD DE Δz (${VER}) · ${DZ.length} parejas · peor |media reconstruida − pairDz| = ${dMax.toExponential(3)} m ${dMax === 0 ? '✓ (0 exacto)' : '✗'}`);
if (dMax !== 0) throw new Error('la media reconstruida no es pairDz');
const ext = DZ.filter(d => d.dzMax - d.dzMin > 1e-9).length;
console.log(`      parejas con dzMin ≠ dzMax: ${ext} de ${DZ.length} · Σlen = 0: ${DZ.filter(d => d.sumLen === 0).length}`);

const [LAT, LON, ALT, TL] = [lay.clat, lay.clon, datos.base, 3.5];
let n = 0, dAng = 0, lineasDistintas = 0, instDistintos = 0, maxP2 = 0; const diag = { pares: 0, distintos: 0 };
for (const [Y, Mo, Dd] of [[2026, 5, 21], [2026, 11, 21]]) {
  const doy = F.doyOf(`${Y}-${String(Mo + 1).padStart(2, '0')}-${Dd}`);
  for (let min = 0; min < 1440; min += 5) {
    const g = F.solarPos(Date.UTC(Y, Mo, Dd, 0, min), LAT, LON);
    if (!(g.elev > 0.5 && g.elev <= 40)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    const lin = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, 0.2).angles;
    const ast = F.policyAngles('astro', g.zen, g.az, T, irr, doy, 0.2).angles;
    let bt = false; for (let r = 0; r < lin.length; r++) if (Math.abs(lin[r] - ast[r]) > 0.1) { bt = true; break; }
    if (!bt) continue;
    n++;
    const med = anglesLineaP2(F, T, DZ, g.zen, g.az, irr, doy, 0.2, 'media');
    for (let r = 0; r < lin.length; r++) dAng = Math.max(dAng, Math.abs(med[r] - lin[r]));
    const p2 = anglesLineaP2(F, T, DZ, g.zen, g.az, irr, doy, 0.2, 'extremos', diag);
    let dist = 0; for (let r = 0; r < lin.length; r++) { const d = Math.abs(p2[r] - lin[r]); if (d > 1e-9) dist++; maxP2 = Math.max(maxP2, d); }
    lineasDistintas += dist; if (dist) instDistintos++;
  }
}
console.log(`\n3.2b · FIDELIDAD DE LA CADENA · ${n} instantes × ${T.pairs.length + 1} líneas · peor |θ arnés('media') − policyAngles| = ${dAng.toExponential(3)}° ${dAng === 0 ? '✓ (0 exacto)' : '✗'}`);
if (dAng !== 0) throw new Error('el arnés en modo media no reproduce la cadena publicada');
console.log(`\n3.1 · TEST NULO · candidatos de P2 distintos del de hoy: ${diag.distintos} de ${diag.pares} (pareja × instante)`);
console.log(`      θ final de línea distinto: ${lineasDistintas} de ${n * (T.pairs.length + 1)} (línea × instante) · en ${instDistintos} de ${n} instantes · mayor cambio ${maxP2.toFixed(4)}°`);
if (!diag.distintos || !lineasDistintas) console.log('      ⚠ P2 NO CAMBIA NADA en el conjunto medido: la medida no informa');
