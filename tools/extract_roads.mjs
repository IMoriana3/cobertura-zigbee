// Extrae los CAMINOS del DWG de layout (capa "Caminos Internos": 333 LINE + 247 ARC = los DOS BORDES
// de cada vial con esquinas en arco) y los convierte en EJES con ancho real:
//   1) tesela cada borde (las líneas tal cual; los arcos cada ~12°/1,5 m),
//   2) EMPAREJA bordes antiparalelos a 2,5-7 m → punto de eje = punto medio, ancho = separación,
//   3) encadena los puntos de eje en polilíneas (tolerancia 1,6 m) y simplifica.
// Escribe LAYOUT.roads (ejes [x,n]) + LAYOUT.roadW (ancho mediano) en elburgo_layout.json.
// Uso: node tools/extract_roads.mjs [ruta.dwg]
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';
const DWG = process.argv[2] || '/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/65f8c3da-XG23003EL_BURGOLayout_proyecto_v05C.dwg';
const LAYP = new URL('../elburgo_layout.json', import.meta.url).pathname;
const cE = 683562.922059555, cN = 4605080.984298119;
// La capa "Caminos Internos" está dibujada en una ZONA DE TRABAJO desplazada del plano (y 56 entidades
// vienen ESPEJADAS por extrusión −Z). Traslación autoajustada por correlación: dn barriendo los tramos
// E-W contra los ejes de calle reales (20/46 clavados) y dx contra los lados N-S de la valla (14/23).
const DX = -15515.5, DN = 2154.5;
const lib = await LibreDwg.create();
const db = lib.convert(lib.dwg_read_data(readFileSync(DWG).buffer, 0));
const ENTS = (db.entities || []).filter(e => (e.layer || '') === 'Caminos Internos');
const L = (p, m) => [Math.round((m * p.x - cE + DX) * 100) / 100, Math.round((p.y - cN + DN) * 100) / 100];

// 1) teselado de bordes → lista de segmentos [ax,an,bx,bn]
const segs = [];
for (const e of ENTS) {
  const m = (e.extrusionDirection && e.extrusionDirection.z < 0) ? -1 : 1;   // entidades espejadas (extrusión −Z)
  const sp = e.startPoint || e.start, ep = e.endPoint || e.end;
  if (e.type === 'LINE' && sp && ep && sp.x != null) {
    segs.push([...L(sp, m), ...L(ep, m)]);
  } else if (e.type === 'ARC' && e.center != null) {
    const r = e.radius, a0 = e.startAngle, a1raw = e.endAngle;
    if (!(r > 0.05)) continue;
    let a1 = a1raw; while (a1 <= a0) a1 += Math.PI * 2;                 // CCW convención DWG
    const n = Math.max(2, Math.ceil((a1 - a0) / (12 * Math.PI / 180)));
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * k / n;
      const p = L({ x: e.center.x + r * Math.cos(a), y: e.center.y + r * Math.sin(a) }, m);
      if (prev) segs.push([prev[0], prev[1], p[0], p[1]]);
      prev = p;
    }
  }
}
// descarta segmentos con coordenadas fuera de la planta (bloques/leyendas del DWG)
const S = segs.filter(s => Math.abs(s[0]) < 800 && Math.abs(s[1]) < 700 && Math.abs(s[2]) < 800 && Math.abs(s[3]) < 700);

// 2) emparejado: por cada muestra de un borde, busca el borde ANTIPARALELO más cercano (2,5-7 m)
const pieces = S.map(s => { const dx = s[2] - s[0], dn = s[3] - s[1], l = Math.hypot(dx, dn) || 1e-9; return { s, l, ux: dx / l, un: dn / l }; });
function oppDist(px, pn, ux, un) {                        // distancia ⟂ al borde antiparalelo más próximo
  let best = null;
  for (const q of pieces) {
    if (Math.abs(q.ux * ux + q.un * un) < 0.9) continue;  // no paralelo
    const t = ((px - q.s[0]) * q.ux + (pn - q.s[1]) * q.un);
    if (t < -0.5 || t > q.l + 0.5) continue;              // sin solape longitudinal
    const qx = q.s[0] + q.ux * t, qn = q.s[1] + q.un * t;
    const d = Math.hypot(px - qx, pn - qn);
    if (d > 2.5 && d < 7 && (!best || d < best.d)) best = { d, mx: (px + qx) / 2, mn: (pn + qn) / 2 };
  }
  return best;
}
const mids = [], widths = [];
for (const p of pieces) {
  const nSamp = Math.max(1, Math.round(p.l / 1.5));
  for (let k = 0; k <= nSamp; k++) {
    const px = p.s[0] + p.ux * (p.l * k / nSamp), pn = p.s[1] + p.un * (p.l * k / nSamp);
    const b = oppDist(px, pn, p.ux, p.un);
    if (b) { mids.push([Math.round(b.mx * 100) / 100, Math.round(b.mn * 100) / 100]); widths.push(b.d); }
  }
}
// 3) encadenado de puntos de eje (greedy por cercanía) + simplificación por colinealidad
const used = new Array(mids.length).fill(false);
function nearest(x, n, tol) { let bi = -1, bd = tol; for (let i = 0; i < mids.length; i++) { if (used[i]) continue; const d = Math.hypot(mids[i][0] - x, mids[i][1] - n); if (d < bd) { bd = d; bi = i; } } return bi; }
const chains = [];
for (let i = 0; i < mids.length; i++) {
  if (used[i]) continue; used[i] = true;
  const ch = [mids[i]];
  for (const dirEnd of [true, false]) {                    // crece por los dos extremos
    for (;;) {
      const tip = dirEnd ? ch[ch.length - 1] : ch[0];
      const j = nearest(tip[0], tip[1], 1.6);
      if (j < 0) break; used[j] = true;
      if (dirEnd) ch.push(mids[j]); else ch.unshift(mids[j]);
    }
  }
  if (ch.length >= 4) chains.push(ch);
}
function simplify(ch) {                                     // quita puntos colineales (tolerancia 0,25 m)
  const out = [ch[0]];
  for (let i = 1; i + 1 < ch.length; i++) {
    const a = out[out.length - 1], b = ch[i], c = ch[i + 1];
    const ux = c[0] - a[0], un = c[1] - a[1], l = Math.hypot(ux, un) || 1e-9;
    const d = Math.abs((b[0] - a[0]) * (-un / l) + (b[1] - a[1]) * (ux / l));
    if (d > 0.25) out.push(b);
  }
  out.push(ch[ch.length - 1]);
  return out;
}
// SUAVIZADO: el encadenado por vecindad zigzaguea ±0,3 m entre muestras de bordes opuestos → en 3D salía
// una cinta en dientes de sierra. Remuestreo a 3 m por longitud de arco + media móvil (ventana 5) + simplificado.
function resample(ch, step) {
  const out = [ch[0]]; let acc = 0;
  for (let i = 0; i + 1 < ch.length; i++) {
    const a = ch[i], b = ch[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - acc;
    while (d <= l) { const t = d / l; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
    acc = (acc + l) % step;
  }
  out.push(ch[ch.length - 1]);
  return out;
}
function movAvg(ch, w) {
  return ch.map((p, i) => {
    let sx = 0, sn = 0, c = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < ch.length) { sx += ch[j][0]; sn += ch[j][1]; c++; } }
    return [Math.round(sx / c * 100) / 100, Math.round(sn / c * 100) / 100];
  });
}
function chlen(cs){let L=0;cs.forEach(ch=>{for(let i=0;i+1<ch.length;i++)L+=Math.hypot(ch[i+1][0]-ch[i][0],ch[i+1][1]-ch[i][1]);});return L.toFixed(0);}
if(process.env.RDBG)console.log('DBG chains:',chains.length,'len',chlen(chains));
let roads = chains.map(ch => simplify(movAvg(resample(ch, 3), 2)));
if(process.env.RDBG)console.log('DBG smoothed:',roads.length,'len',chlen(roads));
// FILTRO por valla: la capa "Caminos Internos" incluye viales de OTRO sector que, trasladados, caen
// fuera de El Burgo. Se queda cada camino solo si ≥40% de su longitud está dentro del anillo de la
// valla (+8 m de margen, para conservar el acceso que la cruza).
const LAYF = JSON.parse(readFileSync(LAYP, 'utf8'));
const fpl = (LAYF.fence || []).map(pl => pl.slice());
let ring = fpl.sort((a, b) => b.length - a.length)[0] || [];
const merged = ring.slice(); let moved = true;                    // suelda el anillo con el resto de tramos de valla
const usedR = fpl.map(pl => pl === ring);
while (moved) { moved = false;                                     // soldadura por AMBOS extremos (solo-cola dejaba el anillo a medias → pip cerraba en diagonal y media planta quedaba "fuera")
  for (let i = 0; i < fpl.length; i++) { if (usedR[i]) continue; const q = fpl[i];
    const h = merged[0], t = merged[merged.length - 1], qh = q[0], qt = q[q.length - 1];
    if (Math.hypot(t[0] - qh[0], t[1] - qh[1]) < 3) { merged.push(...q.slice(1)); usedR[i] = true; moved = true; }
    else if (Math.hypot(t[0] - qt[0], t[1] - qt[1]) < 3) { merged.push(...q.slice(0, -1).reverse()); usedR[i] = true; moved = true; }
    else if (Math.hypot(h[0] - qt[0], h[1] - qt[1]) < 3) { merged.unshift(...q.slice(0, -1)); usedR[i] = true; moved = true; }
    else if (Math.hypot(h[0] - qh[0], h[1] - qh[1]) < 3) { merged.unshift(...q.slice(1).reverse()); usedR[i] = true; moved = true; } } }
if(process.env.RDBG){const xs=merged.map(p=>p[0]),ns=merged.map(p=>p[1]);
  console.log('DBG ring:',merged.length,'vtx · bbox x',Math.min(...xs).toFixed(0),'..',Math.max(...xs).toFixed(0),'· n',Math.min(...ns).toFixed(0),'..',Math.max(...ns).toFixed(0));}
function pip(x, n) { let ins = false; for (let i = 0, j = merged.length - 1; i < merged.length; j = i++) {
  const xi = merged[i][0], yi = merged[i][1], xj = merged[j][0], yj = merged[j][1];
  if (((yi > n) !== (yj > n)) && (x < (xj - xi) * (n - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
function nearRing(x, n) { for (let i = 0; i + 1 < merged.length; i++) { const a = merged[i], b = merged[i + 1];
  const dx = b[0] - a[0], dn = b[1] - a[1], L2 = dx * dx + dn * dn || 1e-9; let t = ((x - a[0]) * dx + (n - a[1]) * dn) / L2; t = Math.max(0, Math.min(1, t));
  if (Math.hypot(x - (a[0] + t * dx), n - (a[1] + t * dn)) < 8) return true; } return false; }
// SIN filtro de valla por ahora: el encaje de la zona de trabajo desplazada no es concluyente (la
// correlacion con calles cada 6 m da falsos positivos). Se publican TODOS los candidatos suavizados
// (>=30 m) para validarlos visualmente contra el layout; el filtro volvera cuando el encaje este confirmado.
roads = roads.filter(ch => { let l = 0; for (let i = 0; i + 1 < ch.length; i++) l += Math.hypot(ch[i + 1][0] - ch[i][0], ch[i + 1][1] - ch[i][1]); return l >= 30; });
widths.sort((a, b) => a - b);
const W = widths.length ? Math.round(widths[Math.floor(widths.length / 2)] * 10) / 10 : 4;
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
LAY.roads = roads; LAY.roadW = W;
writeFileSync(LAYP, JSON.stringify(LAY));
let len = 0; roads.forEach(pl => { for (let i = 0; i + 1 < pl.length; i++) len += Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]); });
console.log('bordes teselados:', S.length, '· puntos de eje:', mids.length, '· caminos:', roads.length, '· longitud:', len.toFixed(0), 'm · ancho mediano:', W, 'm');
