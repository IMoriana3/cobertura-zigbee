/* CAREO DE <planta>_cotas.json CONTRA LA NUBE CRUDA DEL LEVANTAMIENTO.
 *
 *   node tools/careo_cotas_nube.mjs --planta sanjose
 *
 * POR QUE HACE FALTA. <planta>_cotas.json no es el levantamiento: es el
 * levantamiento ENGANCHADO al plano, saneado y RELLENADO donde faltaba. Entre
 * la nube y ese fichero hay tres cosas que no son medida:
 *
 *   · la hermana duplicada (inc=1) — el tracker se midió por un lado y la otra
 *     viga se copia, colocada en su x real;
 *   · los trackers reconstruidos (est=1) — no se levantaron y su geometría sale
 *     del plano con la cota del terreno de al lado;
 *   · las filas descartadas por referencia vertical.
 *
 * Cada una es legítima y va declarada, pero las tres son SUPOSICIONES, y una
 * suposición que nadie mide acaba pareciendo un dato. Esto las mide: compara
 * contra la nube lo que sí es medida, y ACOTA el error de lo que no lo es
 * usando los trackers donde sí tenemos las dos vigas.
 *
 * El careo es ciego al modelo: no simula nada, solo cruza geometría.          */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PLANTA = arg('planta', 'sanjose');

const C = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_cotas.json'), 'utf-8'));
const N = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_puntos.json'), 'utf-8'));
const A = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_asbuilt.json'), 'utf-8'));
const cE = A.meta.cE, cN = A.meta.cN, base = C.base;

const q = (a, f) => { const v = a.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))]; };
const fmt = (a) => a.length ? `mediana ${q(a, .5).toFixed(3)} · p95 ${q(a, .95).toFixed(3)} · máx ${q(a, 1).toFixed(3)}` : '—';

/* Los puntos CONTAMINADOS no cuentan como «medida disponible»: si una fila se
   descarta por referencia vertical, su tracker se reconstruye con razon y sus
   puntos no son una medida que nos hayamos dejado. Se leen de la reclamacion,
   que es donde viven. */
const fRec = path.join(ROOT, 'reclamacion_' + PLANTA + '.csv');
const MALOS = new Set();
if (fs.existsSync(fRec))
  for (const l of fs.readFileSync(fRec, 'utf-8').replace(/^\uFEFF/, '').trim().split('\n').slice(1))
    MALOS.add(+l.split(';')[1]);

/* nube indexada en rejilla de 10 m, en el sistema LOCAL de las cotas */
const P = { x: [], n: [], z: [], mal: [] };
for (let i = 0; i < N.n; i++) {
  P.x.push(N.x[i] - cE); P.n.push(N.y[i] - cN); P.z.push(N.z[i] - base);
  P.mal.push(MALOS.has(N.id[i]));
}
const G = new Map();
for (let i = 0; i < P.x.length; i++) {
  const k = Math.floor(P.x[i] / 10) + ':' + Math.floor(P.n[i] / 10);
  if (!G.has(k)) G.set(k, []); G.get(k).push(i);
}
function cerca(x, n, r = 3) {
  const out = [];
  for (let a = Math.floor((x - r) / 10); a <= Math.floor((x + r) / 10); a++)
    for (let b = Math.floor((n - r) / 10); b <= Math.floor((n + r) / 10); b++)
      for (const i of (G.get(a + ':' + b) || []))
        if (Math.abs(P.x[i] - x) <= r && Math.abs(P.n[i] - n) <= r) out.push(i);
  return out;
}

/* ── 1 · lo que SÍ es medida: extremos y cota contra la nube ─────────────── */
// Se carea contra el punto SANO más cercano, y aparte se comprueba que ninguna
// cota emitida venga de uno contaminado. No es lo mismo: donde el punto que
// tocaba vino con otra referencia, el saneador toma el punto sano que hay a
// menos de 1 m (el tope del tracker contiguo), así que ahí el punto MÁS
// cercano sigue siendo el malo aunque el fichero esté bien. Si esa sustitución
// se cayera, la cota emitida volvería a casar con el punto malo: eso es lo que
// caza `deLoMalo`, y con ello el máximo de la fila de arriba pasa de 1,19 m a
// los 36,7 de la contaminación.
const dN = [], dZ = [], sinPunto = [], deLoMalo = [];
let filasMedidas = 0;
for (const t of C.t) {
  if (!t || t.est) continue;
  for (const f of t.f) {
    filasMedidas++;
    for (const k of [0, 1]) {
      const v = cerca(f.x, f.n[k]);
      const estimada = f.ey && f.ey[k];           // esa cota no es medida, va marcada
      const malCerca = v.filter(i => P.mal[i]);
      if (!estimada && malCerca.length &&
          malCerca.some(i => Math.abs(P.z[i] - f.y[k]) < 0.05))
        deLoMalo.push(f.x.toFixed(1) + '/' + f.n[k].toFixed(0));
      const w = v.filter(i => !P.mal[i]);
      if (!w.length) { if (!estimada) sinPunto.push([f.x, f.n[k]]); continue; }
      if (estimada) continue;                     // estimada: no hay nada que carear
      let mej = w[0];
      for (const i of w) if (Math.abs(P.n[i] - f.n[k]) < Math.abs(P.n[mej] - f.n[k])) mej = i;
      dN.push(Math.abs(P.n[mej] - f.n[k]));
      dZ.push(Math.abs(P.z[mej] - f.y[k]));
    }
  }
}

/* ── 2 · la hermana duplicada: cuánto se paga por copiarla ───────────────── */
// Se acota con los trackers donde SÍ tenemos las dos vigas medidas: ahí se sabe
// exactamente en cuánto se equivoca quien copie una en la otra.
const dHermana = [], dHermanaPend = [];
for (const t of C.t) {
  if (!t || t.est || t.inc || t.f.length !== 2) continue;
  const [a, b] = t.f;
  dHermana.push(Math.abs((a.y[0] + a.y[1]) / 2 - (b.y[0] + b.y[1]) / 2));
  const L = (f) => Math.abs(f.n[1] - f.n[0]) || 1;
  dHermanaPend.push(Math.abs((a.y[1] - a.y[0]) / L(a) - (b.y[1] - b.y[0]) / L(b)) * 100);
}

/* ── 3 · los reconstruidos: ¿caen dentro de lo medido, o se inventan sitio? ─ */
const est = C.t.filter(t => t && t.est);
const zsMed = [];
for (const t of C.t) if (t && !t.est) for (const f of t.f) zsMed.push(...f.y);
const loZ = Math.min(...zsMed), hiZ = Math.max(...zsMed);
const fueraZ = [], conPuntos = [];
for (const t of est) for (const f of t.f) {
  for (const y of f.y) if (y < loZ || y > hiZ) fueraZ.push(y);
  // un reconstruido NO debería tener nube justo encima: si la tiene, es que se
  // pudo medir y no se enganchó
  const v = cerca(f.x, (f.n[0] + f.n[1]) / 2, 4).filter(i => !P.mal[i]);
  if (v.length) conPuntos.push(f.x.toFixed(1));
}

/* ── 4 · el paso entre las dos vigas del tracker ─────────────────────────── */
const pasoMed = [], pasoInc = [], pasoEst = [];
for (const t of C.t) {
  if (!t || t.f.length !== 2) continue;
  const d = Math.abs(t.f[0].x - t.f[1].x);
  (t.est ? pasoEst : t.inc ? pasoInc : pasoMed).push(d);
}

/* ── 5 · el largo de fila contra los módulos declarados ──────────────────── */
const M = C.mod || {};
const dLargo = [];
if (M.modW) for (const t of C.t) {
  if (!t) continue;
  for (const f of t.f) {
    if (!f.md) continue;
    const esp = 2 * f.md * M.modW + (2 * f.md - 2) * M.gapMod + M.gapDrive;
    dLargo.push(Math.abs(Math.abs(f.n[1] - f.n[0]) - esp));
  }
}

/* ── informe ─────────────────────────────────────────────────────────────── */
console.log('CAREO DE COTAS CONTRA LA NUBE · ' + PLANTA.toUpperCase());
console.log('  nube ' + N.n + ' puntos · cotas ' + C.t.filter(Boolean).length + '/' + C.n_trk +
  ' trackers (' + (C.n_est || 0) + ' reconstruidos · ' + C.n_inc + ' con una sola viga medida)');
console.log('');
console.log('1 · LO MEDIDO, CONTRA SU PROPIO PUNTO (' + filasMedidas + ' filas · ' + dN.length + ' extremos)');
console.log('    distancia al punto más cercano (m):  ' + fmt(dN));
console.log('    diferencia de cota (m):              ' + fmt(dZ));
console.log('    extremos sin ningún punto a 3 m:     ' + sinPunto.length);
console.log('    cotas emitidas que salen de un punto CONTAMINADO (deberían ser 0): ' + deLoMalo.length +
  (deLoMalo.length ? '  <- ' + deLoMalo.slice(0, 6).join(', ') : ''));
console.log('');
console.log('2 · LA HERMANA DUPLICADA — el error se ACOTA con los ' + dHermana.length + ' trackers de dos vigas medidas');
console.log('    desfase de cota entre las dos vigas del MISMO tubo (m): ' + fmt(dHermana));
console.log('    diferencia de pendiente longitudinal (pp):              ' + fmt(dHermanaPend));
console.log('    -> ese es el error que se asume en los ' + C.n_inc + ' trackers con inc=1');
console.log('');
console.log('3 · LOS ' + est.length + ' RECONSTRUIDOS (est=1)');
console.log('    banda de cota de lo medido: ' + loZ.toFixed(2) + ' a ' + hiZ.toFixed(2) + ' m');
console.log('    reconstruidos fuera de esa banda: ' + fueraZ.length);
console.log('    reconstruidos con nube SANA encima (deberían ser 0): ' + conPuntos.length +
  (conPuntos.length ? '  <- se pudieron medir y no se engancharon: ' + conPuntos.slice(0, 6).join(', ') : ''));
console.log('');
console.log('4 · PASO ENTRE LAS DOS VIGAS DEL TRACKER (m)');
console.log('    medidos      (' + String(pasoMed.length).padStart(4) + '): ' + fmt(pasoMed));
console.log('    hermana inc=1(' + String(pasoInc.length).padStart(4) + '): ' + fmt(pasoInc));
console.log('    reconstruidos(' + String(pasoEst.length).padStart(4) + '): ' + fmt(pasoEst));
if (dLargo.length) {
  console.log('');
  console.log('5 · LARGO DE FILA CONTRA SUS MÓDULOS DECLARADOS (' + dLargo.length + ' filas)');
  console.log('    |largo medido − largo por módulos| (m): ' + fmt(dLargo));
}

/* veredicto: solo sobre lo que este careo puede ver */
console.log('');
const fallos = [];
if (q(dN, .95) > 1.0) fallos.push('los extremos no caen sobre sus puntos (p95 ' + q(dN, .95).toFixed(2) + ' m)');
if (q(dZ, .95) > 0.1) fallos.push('las cotas no coinciden con la nube (p95 ' + q(dZ, .95).toFixed(3) + ' m)');
if (conPuntos.length) fallos.push(conPuntos.length + ' reconstruidos tienen nube encima');
if (fueraZ.length) fallos.push(fueraZ.length + ' cotas reconstruidas fuera de la banda medida');
console.log(fallos.length ? '  DISCREPA: ' + fallos.join(' · ') : '  CUADRA: lo medido sale del levantamiento sin retoque, y lo supuesto va acotado.');
process.exit(fallos.length ? 1 : 0);
