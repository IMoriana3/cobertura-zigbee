// Extrae los VIALES como SUPERFICIES desde el bloque "Viales" (capa 02-CIV-Viales-Ext-Sombreados)
// del DWG que pasó el usuario (Viales_El_Burgo.dwg; el mismo bloque vive en el layout v05C).
// El bloque NO trae ejes con ancho: trae 7 HATCH = superficies reales del firme (con vértices bulge
// en los acuerdos y un hueco interior) + contornos LWPOLYLINE auxiliares. La v2 dibujaba cada BORDE
// como si fuera un eje → "dos caminos en paralelo donde hay uno" y plazas inventadas.
// Escribe LAYOUT.roadSurfaces = [{o:[[x,n]...], h:[[[x,n]...]...]}] (anillo exterior + huecos) y vacía
// LAYOUT.roadAreas (queda superseded). LAYOUT.roads (ejes finos) se conserva para plano.html.
// Uso: node tools/extract_roads.mjs [ruta.dwg]
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';
const DWG = process.argv[2] || '/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/6f4e3655-Viales_El_Burgo.dwg';
const LAYP = new URL('../elburgo_layout.json', import.meta.url).pathname;
const cE = 683562.922059555, cN = 4605080.984298119;
const lib = await LibreDwg.create();
const db = lib.convert(lib.dwg_read_data(readFileSync(DWG).buffer, 0));
const BR = (db.tables && db.tables.BLOCK_RECORD) || [];
const recs = Array.isArray(BR) ? BR : (BR.entries || []);
const blk = recs.find(r => /^viales$/i.test(r.name || ''));
if (!blk || !blk.entities || !blk.entities.length) { console.error('Bloque "Viales" no encontrado'); process.exit(1); }
// el INSERT del bloque puede estar en db.entities o dentro del BLOCK_RECORD *Model_Space
let ins = (db.entities || []).find(e => e.type === 'INSERT' && /^viales$/i.test(e.name || ''));
if (!ins) { const ms = recs.find(r => /model_space/i.test(r.name || '')); ins = ((ms && ms.entities) || []).find(e => e.type === 'INSERT' && /^viales$/i.test(e.name || '')); }
const bp = blk.basePoint || { x: 0, y: 0 };
const ip = ins ? ins.insertionPoint : { x: 683170.77, y: 4605119.42 };   // fallback: IP verificado del layout v05C
const sx = ins && ins.xScale != null ? ins.xScale : 1, sy = ins && ins.yScale != null ? ins.yScale : 1;
const rot = ins && ins.rotation ? ins.rotation : 0, cr = Math.cos(rot), sr = Math.sin(rot);
function T(x, y) {
  const vx = (x - bp.x) * sx, vy = (y - bp.y) * sy;
  const wx = vx * cr - vy * sr + ip.x, wy = vx * sr + vy * cr + ip.y;
  return [Math.round((wx - cE) * 100) / 100, Math.round((wy - cN) * 100) / 100];
}
// expande un boundaryPath de HATCH: vértices con bulge → arco teselado (θ=4·atan(b), muestreo ~12°/1,5 m)
function expand(vs) {
  const out = [];
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i], w = vs[(i + 1) % vs.length];
    out.push([v.x, v.y]);
    const b = v.bulge || 0;
    if (Math.abs(b) > 1e-6) {
      const th = 4 * Math.atan(b), c = Math.hypot(w.x - v.x, w.y - v.y);
      if (c > 1e-6) {
        const r = c / (2 * Math.sin(Math.abs(th) / 2)), mx = (v.x + w.x) / 2, my = (v.y + w.y) / 2;
        const d = r * Math.cos(th / 2) * Math.sign(b);                       // distancia del centro a la cuerda (lado según signo)
        const nx = -(w.y - v.y) / c, ny = (w.x - v.x) / c;                   // normal a la cuerda
        const cx = mx - nx * d, cy = my - ny * d;
        const a0 = Math.atan2(v.y - cy, v.x - cx);
        const N = Math.max(2, Math.ceil(Math.abs(th) / 0.21), Math.ceil(Math.abs(th) * r / 1.5));
        for (let s = 1; s < N; s++) { const a = a0 + th * s / N; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      }
    }
  }
  return out;
}
function simplify(pl) {                                                      // quita duplicados (<5 cm) y colineales (desvío <3 cm)
  const a = pl.filter((p, i) => i === 0 || Math.hypot(p[0] - pl[i - 1][0], p[1] - pl[i - 1][1]) > 0.05);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[(i - 1 + a.length) % a.length], q = a[i], r = a[(i + 1) % a.length];
    const dx = r[0] - p[0], dn = r[1] - p[1], L = Math.hypot(dx, dn) || 1e-9;
    const dev = Math.abs((q[0] - p[0]) * dn - (q[1] - p[1]) * dx) / L;
    if (dev > 0.03) out.push(q);
  }
  return out.length >= 3 ? out : a;
}
const area = pl => { let s = 0; for (let i = 0; i < pl.length; i++) { const p = pl[i], q = pl[(i + 1) % pl.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
// Los contornos HATCH del CAD se AUTOINTERSECAN en los empalmes y AutoCAD los pinta con la regla
// PAR-IMPAR; earcut, ante un anillo autointersecado, rellena bolsas enteras ("has hecho un camino muy
// ancho": la cuña del empalme junto a HSU3 no existe en el plano). Ninguna partición vectorial simple
// reproduce esa semántica, así que: MÁSCARA GLOBAL par-impar a 40 cm (unión de todos los hatches: sin
// solapes coplanarios que hacían "damero" por z-fighting) + cierre morfológico 1,6 m (suelda las juntas
// que el plano deja a 1-3 m: "por qué está tan mal la unión") + puente derivado diagonal SE→calle CT Sur
// ("aquí hay que unir los dos caminos": el bloque deja 38 m sin sombrear) + recorte bajo seguidores (el
// lazo "Ext" del DWG pasa bajo dos filas del layout v05C: "¿de dónde sale ese semicírculo?") + filtro de
// componentes <150 m² (muñones huérfanos) → marching squares → Douglas-Peucker → anidamiento por paridad.
const RES = 0.4, DPTOL = 0.34;
function traceMask(M, W, H, x0, n0) {
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : M[j * W + i];
  const segs = new Map(), key = (x, y) => x + '|' + y;                       // marching squares binario: segmentos por celda del retículo de esquinas
  for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
    const c = at(i, j) | (at(i + 1, j) << 1) | (at(i + 1, j + 1) << 2) | (at(i, j + 1) << 3);
    if (c === 0 || c === 15) continue;
    const T_ = [i + 0.5, j], B_ = [i + 0.5, j + 1], L_ = [i, j + 0.5], R_ = [i + 1, j + 0.5];
    const add = (a, b) => { const k1 = key(a[0], a[1]); (segs.get(k1) || segs.set(k1, []).get(k1)).push(b); };
    const pairs = { 1: [[L_, T_]], 2: [[T_, R_]], 3: [[L_, R_]], 4: [[R_, B_]], 5: [[L_, T_], [R_, B_]], 6: [[T_, B_]], 7: [[L_, B_]],
      8: [[B_, L_]], 9: [[B_, T_]], 10: [[T_, R_], [B_, L_]], 11: [[B_, R_]], 12: [[R_, L_]], 13: [[R_, T_]], 14: [[T_, L_]] }[c];
    pairs.forEach(([a, b]) => add(a, b));
  }
  const loops = [], used = new Set();
  for (const [k0] of segs) {
    if (used.has(k0)) continue;
    const loop = []; let cur = k0;
    while (cur && !used.has(cur)) {
      used.add(cur);
      const [cx, cy] = cur.split('|').map(Number); loop.push([cx, cy]);
      const nx = (segs.get(cur) || []).find(p => !used.has(key(p[0], p[1])) || (key(p[0], p[1]) === k0 && loop.length > 2));
      cur = nx ? key(nx[0], nx[1]) : null;
      if (cur === k0) break;
    }
    if (loop.length >= 4) loops.push(loop.map(([gi, gj]) => [Math.round((x0 + (gi + 0.5) * RES) * 100) / 100, Math.round((n0 + (gj + 0.5) * RES) * 100) / 100]));
  }
  function dp(pts) {                                                          // Douglas-Peucker cerrado (ancla en los 2 puntos más alejados)
    let bi = 0, bj = 1, bd = -1;
    for (let i = 0; i < pts.length; i += 3) for (let j = i + 1; j < pts.length; j += 3) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2; if (d > bd) { bd = d; bi = i; bj = j; } }
    const seg = (a, b) => {
      const src = a < b ? pts.slice(a, b + 1) : pts.slice(a).concat(pts.slice(0, b + 1));
      const out = [], rec = (i0, i1) => {
        let bm = -1, bk = -1;
        const A = src[i0], B = src[i1], dx = B[0] - A[0], dn = B[1] - A[1], L = Math.hypot(dx, dn) || 1e-9;
        for (let k = i0 + 1; k < i1; k++) { const d = Math.abs((src[k][0] - A[0]) * dn - (src[k][1] - A[1]) * dx) / L; if (d > bm) { bm = d; bk = k; } }
        if (bm > DPTOL) { rec(i0, bk); rec(bk, i1); } else out.push(src[i1]);
      };
      out.push(src[0]); if (src.length > 1) rec(0, src.length - 1);
      return out;
    };
    const h1 = seg(bi, bj), h2 = seg(bj, bi);
    return h1.slice(0, -1).concat(h2.slice(0, -1));
  }
  return loops.map(dp).filter(l => l.length >= 3 && Math.abs(area(l)) > 12);
}
// ===== máscara global =====
const HATCH_RINGS = [];                                                       // [ [anillos de un hatch], ... ]
for (const e of blk.entities) {
  if (e.type !== 'HATCH' || !e.boundaryPaths) continue;
  const rings = e.boundaryPaths
    .filter(p => p.vertices && p.vertices.length >= 3)
    .map(p => expand(p.vertices).map(([x, y]) => T(x, y)))
    .filter(r => Math.abs(area(r)) > 5);
  if (rings.length) HATCH_RINGS.push(rings);
}
let xa = 1e9, xb = -1e9, na = 1e9, nb = -1e9;
HATCH_RINGS.forEach(rs => rs.forEach(r => r.forEach(p => { xa = Math.min(xa, p[0]); xb = Math.max(xb, p[0]); na = Math.min(na, p[1]); nb = Math.max(nb, p[1]); })));
const x0 = xa - 8 * RES, n0 = na - 8 * RES, W = Math.ceil((xb - xa) / RES) + 16, H = Math.ceil((nb - na) / RES) + 16;
const M = new Uint8Array(W * H);
for (const rings of HATCH_RINGS) {                                            // par-impar POR HATCH, unión al global
  for (let j = 0; j < H; j++) {
    const n = n0 + (j + 0.5) * RES, xs = [];
    rings.forEach(r => { for (let i = 0; i < r.length; i++) { const A = r[i], B = r[(i + 1) % r.length];
      if ((A[1] > n) !== (B[1] > n)) xs.push(A[0] + (B[0] - A[0]) * (n - A[1]) / (B[1] - A[1])); } });
    if (!xs.length) continue;
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let i0 = Math.max(0, Math.ceil((xs[k] - x0) / RES - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / RES - 0.5));
      for (let i = i0; i <= i1; i++) M[j * W + i] = 1;
    }
  }
}
// PUENTES DERIVADOS ("aquí hay que unir los dos caminos"): el bloque deja tramos sin sombrear entre
// hatches. Genérico: se trazan los lazos preliminares, se detectan PUNTAS MUERTAS (giro ≥123° en un
// vértice) y desde cada punta se avanza por su bisectriz exterior: si reaparece firme a ≤48 m, se pinta
// un rectángulo de 3,6 m de ancho que los une. Puntas hacia el campo/valla no encuentran nada y quedan.
(function bridges() {
  function paintQuad(quad) {
    for (let j = 0; j < H; j++) {
      const n = n0 + (j + 0.5) * RES, xs = [];
      for (let i = 0; i < 4; i++) { const P = quad[i], Q = quad[(i + 1) % 4];
        if ((P[1] > n) !== (Q[1] > n)) xs.push(P[0] + (Q[0] - P[0]) * (n - P[1]) / (Q[1] - P[1])); }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        let i0 = Math.max(0, Math.ceil((xs[k] - x0) / RES - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / RES - 0.5));
        for (let i = i0; i <= i1; i++) M[j * W + i] = 1;
      }
    }
  }
  const filled = (x, n) => { const gi = Math.round((x - x0) / RES - 0.5), gj = Math.round((n - n0) / RES - 0.5);
    return gi >= 0 && gj >= 0 && gi < W && gj < H && M[gj * W + gi]; };
  const pre = traceMask(M, W, H, x0, n0);
  let made = 0;
  function tryBridge(qx, qn, bx, bn2, tag) {
    const bl = Math.hypot(bx, bn2) || 1e-9; bx /= bl; bn2 /= bl;
    let reach = 0;
    for (let t = 4; t <= 48; t += RES) { if (filled(qx + bx * t, qn + bn2 * t)) { reach = t + 2; break; } }
    if (!reach) return;
    const px = -bn2 * 1.8, pn = bx * 1.8;                                     // medio ancho 1,8 m
    paintQuad([[qx + px - bx * 2, qn + pn - bn2 * 2], [qx - px - bx * 2, qn - pn - bn2 * 2],
               [qx - px + bx * reach, qn - pn + bn2 * reach], [qx + px + bx * reach, qn + pn + bn2 * reach]]);
    made++;
    console.log('puente ' + tag + ' en (' + qx.toFixed(1) + ',' + qn.toFixed(1) + ') rumbo (' + bx.toFixed(2) + ',' + bn2.toFixed(2) + ') · largo ' + reach.toFixed(1) + ' m');
  }
  pre.forEach(r => {
    for (let i = 0; i < r.length; i++) {
      const P = r[(i - 1 + r.length) % r.length], Q = r[i], S = r[(i + 1) % r.length];
      const u1x = Q[0] - P[0], u1n = Q[1] - P[1], l1 = Math.hypot(u1x, u1n) || 1e-9;
      const u2x = S[0] - Q[0], u2n = S[1] - Q[1], l2 = Math.hypot(u2x, u2n) || 1e-9;
      // punta AGUDA: giro ≥123° en un vértice
      if ((u1x * u2x + u1n * u2n) / (l1 * l2) < -0.55)
        tryBridge(Q[0], Q[1], u1x / l1 - u2x / l2, u1n / l1 - u2n / l2, 'agudo');
      // tapa CUADRADA: arista corta (≤7 m) cuyo rumbo de entrada y salida son casi antiparalelos (giro en U)
      if (l2 <= 7) {
        const S2 = r[(i + 2) % r.length], u3x = S2[0] - S[0], u3n = S2[1] - S[1], l3 = Math.hypot(u3x, u3n) || 1e-9;
        if ((u1x * u3x + u1n * u3n) / (l1 * l3) < -0.75)
          tryBridge((Q[0] + S[0]) / 2, (Q[1] + S[1]) / 2, u1x / l1 - u3x / l3, u1n / l1 - u3n / l3, 'tapa');
      }
    }
  });
  console.log('puentes derivados:', made);
})();
// cierre morfológico r=4 celdas (1,6 m) con imagen integral: suelda juntas ≤3 m sin engordar bordes
function boxPass(src, test) {
  const I = new Float64Array((W + 1) * (H + 1));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++)
    I[(j + 1) * (W + 1) + i + 1] = src[j * W + i] + I[j * (W + 1) + i + 1] + I[(j + 1) * (W + 1) + i] - I[j * (W + 1) + i];
  const dst = new Uint8Array(W * H), R = 4;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const i0 = Math.max(0, i - R), i1 = Math.min(W - 1, i + R), j0 = Math.max(0, j - R), j1 = Math.min(H - 1, j + R);
    const s = I[(j1 + 1) * (W + 1) + i1 + 1] - I[j0 * (W + 1) + i1 + 1] - I[(j1 + 1) * (W + 1) + i0] + I[j0 * (W + 1) + i0];
    dst[j * W + i] = test(s, (i1 - i0 + 1) * (j1 - j0 + 1)) ? 1 : 0;
  }
  return dst;
}
let MM = boxPass(boxPass(M, s => s > 0), (s, n2) => s >= n2);                 // dilate → erode
// recorte bajo seguidores (+0,8 m): el lazo del DWG "Viales-Ext" atraviesa dos filas del layout actual
const LAYpre = JSON.parse(readFileSync(LAYP, 'utf8'));
(LAYpre.trackers || []).forEach(t => {
  const hl = (/medio/i.test(t.t || '') ? 16.3 : 32.3) + 0.8;
  const i0 = Math.max(0, Math.floor((t.x - 6.0 - x0) / RES)), i1 = Math.min(W - 1, Math.ceil((t.x + 6.0 - x0) / RES));   // ±6 (pitch 12): también los pasillos entre columnas — sin muñones del lazo conectados
  const j0 = Math.max(0, Math.floor((t.n - hl - n0) / RES)), j1 = Math.min(H - 1, Math.ceil((t.n + hl - n0) / RES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) MM[j * W + i] = 0;
});
// componentes conexas: fuera muñones <150 m² (restos del lazo entre filas)
{
  const lbl = new Int32Array(W * H); let nl = 0; const sizes = [0];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!MM[s] || lbl[s]) continue;
    nl++; sizes.push(0); stack.push(s); lbl[s] = nl;
    while (stack.length) { const c = stack.pop(); sizes[nl]++;
      const ci = c % W, cj = (c / W) | 0;
      [[ci - 1, cj], [ci + 1, cj], [ci, cj - 1], [ci, cj + 1]].forEach(([ii, jj]) => {
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) return; const q = jj * W + ii;
        if (MM[q] && !lbl[q]) { lbl[q] = nl; stack.push(q); } }); }
  }
  const minCells = 150 / (RES * RES); let dropped = 0;
  for (let s = 0; s < W * H; s++) if (MM[s] && sizes[lbl[s]] < minCells) { MM[s] = 0; dropped++; }
  console.log('componentes:', nl, '· celdas de muñón eliminadas:', dropped);
}
const surfaces = []; let totA = 0, totV = 0, nHoles = 0;
{
  const loops = traceMask(MM, W, H, x0, n0).map(l => simplify(l));
  // anidamiento por paridad de contención: profundidad par = exterior, impar = hueco del exterior más pequeño que lo contiene
  const inL = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const A = r[i], B = r[j];
    if ((A[1] > p[1]) !== (B[1] > p[1]) && p[0] < (B[0] - A[0]) * (p[1] - A[1]) / (B[1] - A[1]) + A[0]) c = !c; } return c; };
  const meta = loops.map((l, li) => { let depth = 0;
    for (let lj = 0; lj < loops.length; lj++) if (lj !== li && inL(l[0], loops[lj])) depth++;
    return { l, li, depth, A: Math.abs(area(l)) }; });
  meta.filter(m => m.depth % 2 === 0).forEach(m => {
    const hs = meta.filter(m2 => m2.depth === m.depth + 1 && inL(m2.l[0], m.l)).map(m2 => m2.l);
    totA += m.A - hs.reduce((s, r) => s + Math.abs(area(r)), 0);
    totV += m.l.length + hs.reduce((s, r) => s + r.length, 0); nHoles += hs.length;
    surfaces.push(hs.length ? { o: m.l, h: hs } : { o: m.l });
  });
}
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
LAY.roadSurfaces = surfaces; LAY.roadAreas = [];                             // las superficies sustituyen a cintas+abanicos en el visor
writeFileSync(LAYP, JSON.stringify(LAY));
console.log('superficies:', surfaces.length, '· huecos:', nHoles, '· área total:', totA.toFixed(0), 'm² · vértices:', totV,
  '· INSERT:', ins ? ('sí (' + ip.x.toFixed(2) + ',' + ip.y.toFixed(2) + ')') : 'fallback layout');
