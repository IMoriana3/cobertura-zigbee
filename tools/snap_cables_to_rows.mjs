// Imanta el cableado DC (cable_pos/cable_neg) a SU VIGA DE TORSIÓN. v4
// El seguidor es BÍFILO: cada unidad tiene DOS vigas a ±filaZ (±3 m) de su eje. La v3 imantaba al eje
// de la unidad = el pasillo interior entre las dos filas (error señalado por el usuario). Ahora:
//   1) cada cable se casa con SU string por proximidad de su extremo a la etiqueta Strings_numeración
//      (elburgo_strings.json; las etiquetas están SOBRE su fila),
//   2) sus tramos N-S largos (≥8 m) se imantan a la x de esa etiqueta (= la viga), con desdoble de
//      patas de bucle (±0,15 m) y pos/neg intercalados,
//   3) sin etiqueta cercana (≤10 m): a la viga más cercana (t.x±filaZ) con solape en N,
//   4) diagonales residuales que tocan un vértice imantado → esquina en L,
//   5) los vértices imantados se marcan con un 3er elemento ([x,n,1]) → el visor los dibuja a ALTURA
//      DE VIGA (el arnés cuelga del tubo); giros y colectores E-W quedan en zanja (suelo).
// Uso: node tools/snap_cables_to_rows.mjs   (parte de elburgo_networks_raw.json)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const NETP = new URL('../elburgo_networks.json', import.meta.url).pathname;
const RAWP = new URL('../elburgo_networks_raw.json', import.meta.url).pathname;
const LAYP = new URL('../elburgo_layout.json', import.meta.url).pathname;
const STRP = new URL('../elburgo_strings.json', import.meta.url).pathname;
const NET = JSON.parse(readFileSync(existsSync(RAWP) ? RAWP : NETP, 'utf8'));
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
const STR = existsSync(STRP) ? JSON.parse(readFileSync(STRP, 'utf8')) : null;
const FILAZ = 3.0;                                        // seguidor.js DIMS.filaZ (bífilo: vigas a ±3 m del eje de unidad)
const ROWS = LAY.trackers.map(t => ({ x: t.x, n: t.n, hl: /medio/i.test(t.t || '') ? 16 : 31 }));

function nearestFila(x, n0, n1) {                          // viga más cercana con solape en N (fallback sin etiqueta)
  let best = null, bd = 7;
  for (const r of ROWS) {
    if (n1 < r.n - r.hl - 4 || n0 > r.n + r.hl + 4) continue;
    for (const fx of [r.x - FILAZ, r.x + FILAZ]) { const d = Math.abs(x - fx); if (d < bd) { bd = d; best = fx; } }
  }
  return best;
}
function runsOf(pl) {
  const out = []; let i = 0;
  while (i < pl.length - 1) {
    let j = i;
    while (j < pl.length - 1 && Math.abs(pl[j + 1][0] - pl[j][0]) < 1.5) j++;
    if (j > i) {
      const xs = [], ns = [];
      for (let k = i; k <= j; k++) { xs.push(pl[k][0]); ns.push(pl[k][1]); }
      const n0 = Math.min(...ns), n1 = Math.max(...ns);
      if (n1 - n0 >= 8) out.push({ i, j, x: xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)], n0, n1 });
      i = j;
    } else i++;
  }
  return out;
}
let matched = 0, fallback = 0, snapped = 0, corners = 0;
for (const key of ['cable_pos', 'cable_neg']) {
  const pol = key === 'cable_pos' ? +0.10 : -0.10;         // + al este de la viga, − al oeste (mazo pegado al tubo)
  NET.layers[key] = (NET.layers[key] || []).map(pl => {
    const runs = runsOf(pl);
    if (!runs.length) return pl;
    let filaX = null;
    if (STR) {                                             // 1) casa el cable con SU string (extremo ↔ etiqueta)
      let bd = 10, bs = null;
      for (const ep of [pl[0], pl[pl.length - 1]]) for (const s of STR.strings) {
        const d = Math.hypot(ep[0] - s.x, ep[1] - s.n); if (d < bd) { bd = d; bs = s; }
      }
      if (bs) { filaX = bs.x; matched++; }
    }
    if (filaX == null) { const r0 = runs[0]; filaX = nearestFila(r0.x, r0.n0, r0.n1); if (filaX != null) fallback++; }
    if (filaX == null) return pl;
    runs.sort((a, b) => a.x - b.x);
    const snaps = new Set();
    runs.forEach((r, ri) => {                              // 2) patas del bucle desdobladas ±0,15 alrededor de la viga
      const leg = runs.length > 1 ? (ri === 0 ? -0.15 : +0.15) : 0;
      const nx = Math.round((filaX + pol + leg) * 100) / 100;
      for (let k = r.i; k <= r.j; k++) { pl[k] = [nx, pl[k][1], 1]; snaps.add(k); snapped++; }
    });
    const out = [];                                        // 4) ortogonaliza diagonales que tocan un vértice imantado
    for (let k = 0; k < pl.length; k++) {
      out.push(pl[k]);
      if (k + 1 < pl.length) {
        const a = pl[k], b = pl[k + 1], dx = Math.abs(b[0] - a[0]), dn = Math.abs(b[1] - a[1]);
        if (dx > 1.2 && dn > 1.2 && (snaps.has(k) || snaps.has(k + 1))) { out.push(snaps.has(k) ? [a[0], b[1]] : [b[0], a[1]]); corners++; }
      }
    }
    return out;
  });
}
writeFileSync(NETP, JSON.stringify(NET));
console.log('cables casados con su string:', matched, '· por viga más cercana:', fallback, '· vértices imantados:', snapped, '· esquinas L:', corners);
