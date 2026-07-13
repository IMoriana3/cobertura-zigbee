// Imanta el cableado DC (cable_pos/cable_neg) al EJE de su fila de seguidores. v3
// El DWG dibuja los strings como MAZOS A MEDIA CALLE (~6 m de cada eje, calle de 12 m): convención CAD.
// Reglas v3 (corrige diagonales de v2):
//   1) tramos N-S largos (≥8 m) detectados por polilínea,
//   2) agrupados por CALLE (par de ejes vecinos con solape en N),
//   3) el mazo se parte por x **POR CABLE COMPLETO** (todas las patas de un mismo cable al mismo lado:
//      los bucles +/− subían por una fila y bajaban por la vecina → diagonal cruzando el pasillo),
//   4) apilado junto a su eje (0,15–0,50 m hacia su calle),
//   5) cualquier segmento diagonal residual que toque un vértice imantado se ORTOGONALIZA (esquina en L).
// Colectores E-W intactos (zanjas reales).
// Uso: node tools/snap_cables_to_rows.mjs  (parte del extract ORIGINAL si existe networks_raw.json; si no, del actual)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const NETP = new URL('../elburgo_networks.json', import.meta.url).pathname;
const RAWP = new URL('../elburgo_networks_raw.json', import.meta.url).pathname;
const LAYP = new URL('../elburgo_layout.json', import.meta.url).pathname;
const NET = JSON.parse(readFileSync(existsSync(RAWP) ? RAWP : NETP, 'utf8'));
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
const ROWS = LAY.trackers.map(t => ({ x: t.x, n: t.n, hl: /medio/i.test(t.t || '') ? 16 : 31 }));

function sideAxes(x, n0, n1) {
  let L = null, R = null, bl = 9, br = 9;
  for (const r of ROWS) {
    if (n1 < r.n - r.hl - 4 || n0 > r.n + r.hl + 4) continue;
    const d = r.x - x;
    if (d >= 0 && d < br) { br = d; R = r.x; }
    if (d < 0 && -d < bl) { bl = -d; L = r.x; }
  }
  return { L, R };
}
// 1) tramos N-S largos por polilínea
const runs = [];
for (const key of ['cable_pos', 'cable_neg']) {
  (NET.layers[key] || []).forEach((pl, pi) => {
    let i = 0;
    while (i < pl.length - 1) {
      let j = i;
      while (j < pl.length - 1 && Math.abs(pl[j + 1][0] - pl[j][0]) < 1.5) j++;
      if (j > i) {
        const xs = [], ns = [];
        for (let k = i; k <= j; k++) { xs.push(pl[k][0]); ns.push(pl[k][1]); }
        const n0 = Math.min(...ns), n1 = Math.max(...ns);
        if (n1 - n0 >= 8) runs.push({ key, pi, i, j, x: xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)], n0, n1 });
        i = j;
      } else i++;
    }
  });
}
// 2-3) calles → cables completos → mitad izquierda/derecha
const streets = new Map();
for (const r of runs) {
  const ax = sideAxes(r.x, r.n0, r.n1);
  if (ax.L == null && ax.R == null) continue;
  r.ax = ax;
  const k = (ax.L == null ? 'x' : ax.L.toFixed(1)) + '|' + (ax.R == null ? 'x' : ax.R.toFixed(1));
  if (!streets.has(k)) streets.set(k, []);
  streets.get(k).push(r);
}
const snappedIdx = new Map();   // "key|pi" -> Set(índices de vértice imantados)
function markSnap(key, pi, k) { const id = key + '|' + pi; if (!snappedIdx.has(id)) snappedIdx.set(id, new Set()); snappedIdx.get(id).add(k); }
let snapped = 0;
for (const [, grp] of streets) {
  const polys = new Map();                                   // agrupa tramos por cable
  for (const r of grp) { const id = r.key + '|' + r.pi; if (!polys.has(id)) polys.set(id, []); polys.get(id).push(r); }
  const list = [...polys.values()].map(rs => ({ rs, mx: rs.reduce((s, r) => s + r.x, 0) / rs.length }));
  list.sort((a, b) => a.mx - b.mx);
  const half = Math.ceil(list.length / 2);
  list.forEach((pg, idx) => {
    const r0 = pg.rs[0];
    let axis, side;
    if (r0.ax.L != null && r0.ax.R != null) { const left = idx < half; axis = left ? r0.ax.L : r0.ax.R; side = left ? 1 : -1; }
    else if (r0.ax.L != null) { axis = r0.ax.L; side = 1; } else { axis = r0.ax.R; side = -1; }
    const rank = (r0.ax.L != null && r0.ax.R != null) ? (idx < half ? idx : list.length - 1 - idx) : idx;
    const off = Math.min(0.50, 0.15 + 0.12 * rank) * side;
    for (const r of pg.rs) {
      const pl = NET.layers[r.key][r.pi];
      for (let k = r.i; k <= r.j; k++) { pl[k][0] = Math.round((axis + off) * 100) / 100; markSnap(r.key, r.pi, k); snapped++; }
    }
  });
}
// 5) ortogonaliza diagonales que tocan un vértice imantado: inserta esquina en L (primero recto N-S desde el lado imantado)
let corners = 0;
for (const key of ['cable_pos', 'cable_neg']) {
  NET.layers[key] = NET.layers[key].map((pl, pi) => {
    const snaps = snappedIdx.get(key + '|' + pi) || new Set();
    const out = [];
    for (let k = 0; k < pl.length; k++) {
      out.push(pl[k]);
      if (k + 1 < pl.length) {
        const a = pl[k], b = pl[k + 1], dx = Math.abs(b[0] - a[0]), dn = Math.abs(b[1] - a[1]);
        if (dx > 1.2 && dn > 1.2 && (snaps.has(k) || snaps.has(k + 1))) {
          const sA = snaps.has(k);                                            // esquina pegada al extremo imantado
          out.push(sA ? [a[0], b[1]] : [b[0], a[1]]);
          corners++;
        }
      }
    }
    return out;
  });
}
writeFileSync(NETP, JSON.stringify(NET));
console.log('calles:', streets.size, '· tramos:', runs.length, '· vértices imantados:', snapped, '· esquinas L añadidas:', corners);
