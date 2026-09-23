/* R5 · 1.8 — BANCO DEL MOTOR DE PROYECCIÓN. Sale 1 si falla cualquier comprobación.
 *
 *   node audit5/test_motor.mjs [--rapido]      (--rapido: sin la fuerza bruta de Ayora)
 *
 * Cada comprobación lleva su control: un caso con respuesta conocida, o una
 * mutación que TIENE que ponerla roja. Una comprobación que pasa sin control
 * no se cree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vectorSol, caraMesa, marcoMesa, sombraSobre, relaciones, relacionesFuerzaBruta, fraccionArea, areaPoligono } from './lib_proyeccion.mjs';
import { lineasDesdeCotas } from './lib_mesas.mjs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAPIDO = process.argv.includes('--rapido');
const D = Math.PI / 180;
let N = 0, FAIL = 0;
const t = (nombre, f) => { N++; try { const m = f(); console.log('  ✓ ' + nombre + (m ? ' — ' + m : '')); } catch (e) { FAIL++; console.log('  ✗ ' + nombre + ' — ' + e.message); } };
const debe = (c, m) => { if (!c) throw new Error(m); };
const { F, VER } = cargaSimulador(ROOT, ['singleaxis', 'trueTrackAngle', 'pvTilt']);
console.log(`R5 · banco del motor de proyección (simulador ${VER})`);

const fila = (x, n0, n1, z0, z1) => ({ x, n: [n0, n1], z: [z0, z1] });
const CW = 2.384;

/* ── 1 · CONVENIO DE SIGNO (1.3) ──────────────────────────────────────────── */
/* El θ que maximiza el haz sobre la cara (normal ⟂ ... ) es θ* = atan2(B, A) con
   nr·ŝ = A cosθ + B sinθ; tiene que ser el `trueTrackAngle` del simulador con
   `pvTilt(τ)`. Control negativo: sin `pvTilt` (τ con el signo cambiado) falla. */
const tauMax = (tauDeg, zen, az) => {
  const m = fila(0, 0, 10, 0, 10 * Math.tan(tauDeg * D)), s = vectorSol(zen, az);
  const A = marcoMesa(m, 0).nr, B = marcoMesa(m, 90).nr;
  return Math.atan2(B[0] * s[0] + B[1] * s[1] + B[2] * s[2], A[0] * s[0] + A[1] * s[1] + A[2] * s[2]) / D;
};
const casosSigno = [];
for (const tau of [-6, -2.5, 0, 1, 4]) for (const [zen, az] of [[70, 95], [50, 130], [30, 200], [65, 265], [80, 290]]) casosSigno.push([tau, zen, az]);
t('convenio de signo: θ de máximo haz del motor = trueTrackAngle(…, pvTilt(τ)) del simulador', () => {
  let peor = 0;
  for (const [tau, zen, az] of casosSigno) peor = Math.max(peor, Math.abs(tauMax(tau, zen, az) - F.trueTrackAngle(zen, az, F.pvTilt(tau), 0)));
  debe(peor < 1e-9, `peor |Δ| ${peor.toExponential(2)}°`);
  return `${casosSigno.length} casos, peor |Δ| ${peor.toExponential(2)}°`;
});
t('CONTROL NEGATIVO del signo: con τ sin convertir (sin pvTilt) la comprobación anterior CAE', () => {
  let peor = 0;
  for (const [tau, zen, az] of casosSigno) if (tau !== 0) peor = Math.max(peor, Math.abs(tauMax(tau, zen, az) - F.trueTrackAngle(zen, az, tau, 0)));
  debe(peor > 1e-3, `con el signo invertido no se nota (${peor}°): el test de signo no protege nada`);
  return `con el signo invertido se aparta ${peor.toFixed(4)}°`;
});

/* ── 2 · TANGENCIA: filas infinitas, plano uniforme, MISMO θ (el único caso en que
   el gemelo es correcto) ⇒ la frontera de sombra del motor es la raíz analítica
   de pvlib. z0 = 0, porque pvlib no tiene offset cara-eje. ───────────────── */
const intrusionFirmada = (E, R, s) => {
  const sh = sombraSobre(E, R, s, true); if (!sh || sh.sinHaz) return NaN;
  const us = sh.poly.map(q => q[0]);
  return (E.F0[0] > R.F0[0]) ? R.h - Math.min(...us) : Math.max(...us) + R.h;   // > 0 ⇒ entra en la cuerda
};
const raizTangencia = (P, beta, zen, az, t0) => {
  const L = 4000, s = vectorSol(zen, az), tb = Math.tan(beta * D);
  const f = th => {
    const este = s[0] > 0, xe = este ? P : -P;
    const R = caraMesa(fila(0, -L / 2, L / 2, 0, 0), th, 0, CW);
    const E = caraMesa(fila(xe, -L / 2, L / 2, -xe * tb, -xe * tb), th, 0, CW);
    return intrusionFirmada(E, R, s);
  };
  let a = t0 - 0.3, b = t0 + 0.3, fa = f(a), fb = f(b);
  for (let i = 0; i < 60 && Math.abs(b - a) > 1e-13; i++) { const c = b - fb * (b - a) / (fb - fa); a = b; fa = fb; b = c; fb = f(b); }
  return { raiz: b, f };
};
t('tangencia con filas infinitas y mismo θ = raíz analítica de pvlib (singleaxis con backtracking)', () => {
  let peor = 0, n = 0; const P = 6.0;
  for (const beta of [0, 3, -5]) for (const [zen, az] of [[62, 100], [75, 115], [80, 250], [70, 280], [84, 95]]) {
    const tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 90, backtrack: true, gcr: CW / P, crossAxisTilt: beta });
    const wid = F.trueTrackAngle(zen, az, 0, 0);
    if (Math.abs(tbt - wid) < 1e-9) continue;                          // sin backtracking no hay tangencia que carear
    const { raiz } = raizTangencia(P, beta, zen, az, tbt);
    peor = Math.max(peor, Math.abs(raiz - tbt)); n++;
  }
  debe(n >= 10 && peor < 1e-9, `${n} casos, peor |Δ| ${peor.toExponential(2)}°`);
  return `${n} casos con backtracking, peor |raíz del motor − pvlib| ${peor.toExponential(2)}°`;
});
/* Control negativo: si la pendiente transversal entrara con el signo cambiado
   (z = +x·tanβ en vez de −x·tanβ, o sea β>0 = ESTE MÁS ALTO), la raíz del motor
   ya no sería la de pvlib. (Primera versión de este control: z0 = 0,17. No se
   mueve nada, y es correcto: con las dos filas al MISMO θ el offset cara-eje es
   la misma traslación para las dos. Error de diseño mío, anotado.) */
t('CONTROL NEGATIVO de la tangencia: con la pendiente transversal de signo cambiado la raíz SE APARTA de pvlib', () => {
  const P = 6, zen = 75, az = 115, beta = 3, tbt = F.singleaxis(zen, az, { axisTilt: 0, axisAz: 0, maxAngle: 90, backtrack: true, gcr: CW / P, crossAxisTilt: beta });
  const { raiz } = raizTangencia(P, -beta, zen, az, tbt);
  debe(Math.abs(raiz - tbt) > 0.1, `con el signo de β cambiado la raíz se aparta solo ${Math.abs(raiz - tbt)}°`);
  return `con β de signo cambiado la raíz se aparta ${Math.abs(raiz - tbt).toFixed(4)}°`;
});
/* ── 3 · SOL PERPENDICULAR AL EJE: sombra finita = infinita truncada ─────── */
t('sol perpendicular al eje (az 90°): sombra de la fila finita = la infinita truncada, por metro', () => {
  const s = vectorSol(78, 90), th = 20, P = 6;
  const por = L => { const R = caraMesa(fila(0, 0, L, 0, 0), th, 0.17, CW), E = caraMesa(fila(P, 0, L, 0.3, 0.3), th, 0.17, CW);
    const sh = sombraSobre(E, R, s); return sh ? sh.area / L : 0; };
  const a = por(40), b = por(4000);
  debe(a > 0 && Math.abs(a - b) < 1e-12 * b, `finita ${a} infinita ${b}`);
  return `${(1000 * a).toFixed(4)} mm²/m·1000 en las dos (|Δ| ${Math.abs(a - b).toExponential(1)})`;
});
/* ── 4 · SOL EN EL PLANO DEL EJE: sombra transversal 0 ───────────────────── */
t('sol en el plano del eje (az 180°): las filas de al lado no se sombrean', () => {
  const s = vectorSol(50, 180); let tot = 0;
  for (const th of [0, 20, -35]) { const R = caraMesa(fila(0, 0, 40, 0, 0), th, 0.17, CW);
    for (const x of [6, -6, 5]) { const sh = sombraSobre(caraMesa(fila(x, 0, 40, 0, 0), th, 0.17, CW), R, s); tot += sh && sh.area ? sh.area : 0; } }
  debe(tot === 0, `área transversal ${tot}`);
  const E = caraMesa(fila(0, -40, -1, 4, 4), 0, 0.17, CW), R = caraMesa(fila(0, 0, 40, 0, 0), 0, 0.17, CW), sh = sombraSobre(E, R, vectorSol(50, 180));
  debe(sh && sh.area > 0, 'el control axial (una mesa 4 m más alta al sur, con sol del sur) no da sombra: el caso anterior no probaría nada');
  return `0 exacto en 9 casos; control axial con sombra ${sh.area.toFixed(3)} m²`;
});

/* ── 5 · ESPEJO Y TRASLACIÓN de una planta irregular ────────────────────── */
const planta = [fila(0, 0, 30, 1, 1.8), fila(5.7, 3, 31, 0.6, 1.2), fila(12.1, -4, 25, 0.2, 0.9), fila(6.4, 33, 60, 1.3, 2.4), fila(-5.9, 10, 38, 1.6, 1.1)];
const thP = [22, 18.5, 25, 12, 30];
const fr = (mesas, th, s) => { const C = mesas.map((m, i) => caraMesa(m, th[i], 0.17, CW)); const rel = relaciones(C, s);
  return C.map((R, r) => fraccionArea(R, rel[r].map(x => x.poly))); };
t('simetría espejo (x→−x, θ→−θ, az→360°−az) y traslación: misma sombra en cada mesa', () => {
  let peor = 0, algo = 0;
  for (const [zen, az] of [[72, 100], [80, 70], [66, 120]]) {
    const a = fr(planta, thP, vectorSol(zen, az));
    const b = fr(planta.map(m => ({ ...m, x: -m.x })), thP.map(v => -v), vectorSol(zen, 360 - az));
    const c = fr(planta.map(m => ({ x: m.x + 13.7, n: [m.n[0] - 250.1, m.n[1] - 250.1], z: [m.z[0] + 44.2, m.z[1] + 44.2] })), thP, vectorSol(zen, az));
    for (let i = 0; i < a.length; i++) { peor = Math.max(peor, Math.abs(a[i] - b[i]), Math.abs(a[i] - c[i])); algo += a[i]; }
  }
  debe(algo > 0.01 && peor < 1e-9, `peor ${peor}, sombra total ${algo}`);
  return `peor |Δ| ${peor.toExponential(2)} sobre una sombra total de ${algo.toFixed(3)} (fracción)`;
});
/* ── 6 · UNIÓN, NO SUMA ─────────────────────────────────────────────────── */
t('duplicar un emisor en la misma posición NO cambia la sombra (unión)', () => {
  const s = vectorSol(80, 100);
  const C = planta.map((m, i) => caraMesa(m, thP[i], 0.17, CW));
  const rel = relaciones(C, s); const r = rel.findIndex(l => l.length > 0); debe(r >= 0, 'ninguna mesa con sombra: el caso no prueba nada');
  const f1 = fraccionArea(C[r], rel[r].map(x => x.poly));
  const f2 = fraccionArea(C[r], [...rel[r].map(x => x.poly), ...rel[r].map(x => x.poly)]);
  const suma1 = rel[r].reduce((q, x) => q + x.area, 0);
  debe(f1 === f2 && f1 > 0, `unión ${f1} con duplicado ${f2}`);
  return `unión ${f1.toFixed(6)} = ${f2.toFixed(6)}; la SUMA ingenua de áreas pasaría de ${suma1.toFixed(4)} a ${(2 * suma1).toFixed(4)} m² (control)`;
});
/* un receptor con DOS emisores parciales (el caso del dibujo) */
t('receptor de borde con dos emisores parciales: los dos aparecen, en trozos distintos de la cuerda', () => {
  const s = vectorSol(78, 105);
  const C = [caraMesa(fila(0, 0, 30, 0, 0), 20, 0.17, CW), caraMesa(fila(5.8, -12, 12, 0.4, 0.4), 20, 0.17, CW), caraMesa(fila(6.1, 13, 40, 0.2, 0.2), 20, 0.17, CW)];
  const rel = relaciones(C, s)[0];
  debe(rel.length === 2, `emisores sobre el receptor: ${rel.map(x => x.e).join(',')}`);
  const v = rel.map(x => [Math.min(...x.poly.map(q => q[1])), Math.max(...x.poly.map(q => q[1]))]);
  return `emisores ${rel.map(x => x.e).join(' y ')} · tramos axiales [${v.map(q => q.map(w => w.toFixed(2)).join('–')).join('] y [')}] m`;
});

/* ── 7 · AYORA: correspondencia con el simulador y poda contra fuerza bruta ─ */
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { F: G } = cargaSimulador(ROOT);
const { P, T } = terrenoComoLaPagina(G, datos, 500, 0);
const LIN = lineasDesdeCotas(datos, 0);
t('correspondencia de mesas con el simulador (1.708 mesas, 107 líneas)', () => {
  const nMid = LIN[0].mesas[0].n[0] - P.segs[0][0][0], eMean = LIN[0].mesas[0].z[0] - P.segZ[0][0][0];
  let dN = 0, dZ = 0, dX = 0, n = 0;
  for (let i = 0; i < LIN.length; i++) { dX = Math.max(dX, Math.abs(LIN[i].x - P.lineXAbs[i]));
    debe(LIN[i].mesas.length === P.segs[i].length, `línea ${i}: ${LIN[i].mesas.length} mesas frente a ${P.segs[i].length}`);
    LIN[i].mesas.forEach((m, k) => { n++; dN = Math.max(dN, Math.abs(m.n[0] - nMid - P.segs[i][k][0]), Math.abs(m.n[1] - nMid - P.segs[i][k][1]));
      dZ = Math.max(dZ, Math.abs(m.z[0] - eMean - P.segZ[i][k][0]), Math.abs(m.z[1] - eMean - P.segZ[i][k][1])); }); }
  debe(n === 1708 && dN < 1e-6 && dZ < 1e-6 && dX < 1e-6, `n ${n} Δn ${dN} Δz ${dZ} Δx ${dX}`);
  return `${n} mesas · Δx de línea ${dX.toExponential(1)} · Δn ${dN.toExponential(1)} · Δz ${dZ.toExponential(1)} (tras eMean ${eMean.toFixed(6)} m)`;
});
if (!RAPIDO) {
  const inst = [[5, 21, 5, 0], [5, 21, 18, 40], [11, 21, 8, 20]];     // UTC: 21-jun 05:00 y 18:40, 21-dic 08:20
  const casos = inst.map(([mo, d, h, mi]) => {
    const g = G.solarPos(Date.UTC(2026, mo, d, h, mi), lay.clat, lay.clon), doy = G.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-${d}`);
    const ang = G.policyAnglesSeg('pairwise', g.zen, g.az, T, G.clearskyIneichen(g.zen, doy, datos.base, 3.5), doy, 0.2);
    const C = []; LIN.forEach((L, r) => L.mesas.forEach((m, k) => C.push(caraMesa(m, ang[r][k], 0.17, datos.cuerda))));
    return { g, s: vectorSol(g.zen, g.az), C };
  });
  t('la poda por cono NO descarta ningún emisor con sombra (contra fuerza bruta, 3 instantes de Ayora)', () => {
    let pares = 0, perdidos = 0, cand = 0;
    for (const c of casos) {
      const bf = relacionesFuerzaBruta(c.C, c.s), rp = relaciones(c.C, c.s); cand += rp.candidatos;
      bf.forEach((l, r) => { const tiene = new Set(rp[r].map(x => x.e)); for (const x of l) { pares++; if (!tiene.has(x.e)) perdidos++; } });
    }
    debe(pares > 0 && perdidos === 0, `${perdidos} de ${pares} pares con sombra perdidos por la poda`);
    return `${pares} pares con sombra en ${casos.length} instantes (elev ${casos.map(c => c.g.elev.toFixed(1)).join(', ')}°), 0 perdidos · ${cand} candidatos de ${casos.length * 1708 * 1707} posibles`;
  });
  t('CONTROL NEGATIVO de la poda: con las cajas encogidas un 30 % la comprobación anterior CAE', () => {
    let perdidos = 0;
    for (const c of casos) { const bf = relacionesFuerzaBruta(c.C, c.s), rp = relaciones(c.C, c.s, { mutarPoda: true });
      bf.forEach((l, r) => { const tiene = new Set(rp[r].map(x => x.e)); for (const x of l) if (!tiene.has(x.e)) perdidos++; }); }
    debe(perdidos > 0, 'la poda mutada no pierde nada: el control de la poda no protege');
    return `la poda mutada pierde ${perdidos} pares`;
  });
}
console.log(`\n${N - FAIL}/${N} comprobaciones en verde`);
process.exit(FAIL ? 1 : 0);
