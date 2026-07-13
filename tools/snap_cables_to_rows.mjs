// Imanta el cableado DC (cable_pos/cable_neg) al EJE de su fila de seguidores.
// El DWG dibuja los strings como MAZOS A MEDIA CALLE (≈6 m de cada eje, calle de 12 m):
// convención CAD. Físicamente cada cable va con SU fila y sale de su centro. Regla:
//   1) se detectan los tramos N-S largos (≥8 m) de cada polilínea,
//   2) se agrupan por CALLE (par de ejes vecinos que solapan en N),
//   3) el mazo se PARTE por su x: mitad izquierda → fila izquierda, mitad derecha → fila derecha,
//   4) cada cable se apila junto a su eje (residuo 0,15–0,50 m hacia su calle).
// Giros y colectores E-W se conservan (siguen zanjas reales).
// Uso: node tools/snap_cables_to_rows.mjs   (reescribe elburgo_networks.json)
import { readFileSync, writeFileSync } from 'node:fs';
const NETP = new URL('../elburgo_networks.json', import.meta.url).pathname;
const LAYP = new URL('../elburgo_layout.json', import.meta.url).pathname;
const NET = JSON.parse(readFileSync(NETP, 'utf8'));
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
const ROWS = LAY.trackers.map(t => ({ x: t.x, n: t.n, hl: /medio/i.test(t.t || '') ? 16 : 31 }));

function sideAxes(x, n0, n1) {                       // eje más cercano a cada lado (con solape en N)
  let L = null, R = null, bl = 9, br = 9;
  for (const r of ROWS) {
    if (n1 < r.n - r.hl - 4 || n0 > r.n + r.hl + 4) continue;
    const d = r.x - x;
    if (d >= 0 && d < br) { br = d; R = r.x; }
    if (d < 0 && -d < bl) { bl = -d; L = r.x; }
  }
  return { L, R };
}
// 1) recolecta tramos N-S largos
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
        if (n1 - n0 >= 8) {
          const mx = xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
          runs.push({ key, pi, i, j, x: mx, n0, n1 });
        }
        i = j;
      } else i++;
    }
  });
}
// 2) agrupa por calle (par de ejes) y 3) parte el mazo por x
const streets = new Map();
for (const r of runs) {
  const ax = sideAxes(r.x, r.n0, r.n1);
  if (ax.L == null && ax.R == null) continue;
  r.ax = ax;
  const k = (ax.L == null ? 'x' : ax.L.toFixed(1)) + '|' + (ax.R == null ? 'x' : ax.R.toFixed(1));
  if (!streets.has(k)) streets.set(k, []);
  streets.get(k).push(r);
}
let snapped = 0;
for (const [, grp] of streets) {
  grp.sort((a, b) => a.x - b.x);
  const half = Math.ceil(grp.length / 2);
  grp.forEach((r, idx) => {
    let axis, side;                                          // side: hacia la calle (para no meter el mazo bajo la otra fila)
    if (r.ax.L != null && r.ax.R != null) { const left = idx < half; axis = left ? r.ax.L : r.ax.R; side = left ? 1 : -1; }
    else if (r.ax.L != null) { axis = r.ax.L; side = 1; } else { axis = r.ax.R; side = -1; }
    const rank = r.ax.L != null && r.ax.R != null ? (idx < half ? idx : grp.length - 1 - idx) : idx;   // orden dentro de su mitad
    const off = Math.min(0.50, 0.15 + 0.12 * rank) * side;
    const pl = NET.layers[r.key][r.pi];
    for (let k2 = r.i; k2 <= r.j; k2++) { pl[k2][0] = Math.round((axis + off) * 100) / 100; snapped++; }
  });
}
writeFileSync(NETP, JSON.stringify(NET));
console.log('calles:', streets.size, '· tramos N-S:', runs.length, '· vértices imantados:', snapped);
