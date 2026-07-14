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
// FUENTE DEFINITIVA (confirmada por el usuario: "Esos son los viales" / "Capa 0"): el bloque "Viales"
// del propio layout — 21 polilíneas de EJE con ancho, insertado a escala 1 (los intentos anteriores con
// la capa "Caminos Internos" de la zona de trabajo desplazada quedan retirados).
const BR = (db.tables && db.tables.BLOCK_RECORD) || [];
const recs = Array.isArray(BR) ? BR : (BR.entries || []);
const blk = recs.find(r => /^viales$/i.test(r.name || ''));
if (!blk || !blk.entities || !blk.entities.length) { console.error('Bloque "Viales" no encontrado'); process.exit(1); }
const ins = (db.entities || []).find(e => e.type === 'INSERT' && /^viales$/i.test(e.name || ''));
const bp = blk.basePoint || { x: 0, y: 0 };
const ip = ins ? ins.insertionPoint : { x: 0, y: 0 };
const sx = ins && ins.xScale != null ? ins.xScale : 1, sy = ins && ins.yScale != null ? ins.yScale : 1;
const rot = ins && ins.rotation ? ins.rotation : 0, cr = Math.cos(rot), sr = Math.sin(rot);
function T(v) {
  const vx = ((v.x != null ? v.x : v[0]) - bp.x) * sx, vy = ((v.y != null ? v.y : v[1]) - bp.y) * sy;
  const wx = vx * cr - vy * sr + ip.x, wy = vx * sr + vy * cr + ip.y;
  return [Math.round((wx - cE) * 100) / 100, Math.round((wy - cN) * 100) / 100];
}
const roads = [], roadWidths = [];
for (const e of blk.entities) {
  if (!e.vertices || e.vertices.length < 2) continue;
  const pl = e.vertices.map(T);
  let L2 = 0; for (let i = 0; i + 1 < pl.length; i++) L2 += Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]);
  if (L2 < 10) continue;
  roads.push(pl); roadWidths.push(e.constantWidth && e.constantWidth > 0.5 ? Math.round(e.constantWidth * 10) / 10 : 4);
}
// DEDUPE de ejes paralelos: el bloque trae algún vial con DOS ejes casi solapados (p. ej. eje + cuneta)
// — si ≥70% de los puntos del corto están a <6 m del largo con dirección paralela, se descarta el corto.
function ptSegDist(px, pn, pl) { let bd = 1e9;
  for (let i = 0; i + 1 < pl.length; i++) { const a = pl[i], b = pl[i + 1], dx = b[0] - a[0], dn = b[1] - a[1], L2 = dx * dx + dn * dn || 1e-9;
    let t = ((px - a[0]) * dx + (pn - a[1]) * dn) / L2; t = Math.max(0, Math.min(1, t));
    bd = Math.min(bd, Math.hypot(px - (a[0] + t * dx), pn - (a[1] + t * dn))); } return bd; }
function rlen(pl) { let l = 0; for (let i = 0; i + 1 < pl.length; i++) l += Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]); return l; }
const drop = new Set();
for (let i = 0; i < roads.length; i++) for (let j = 0; j < roads.length; j++) {
  if (i === j || drop.has(i) || drop.has(j)) continue;
  if (rlen(roads[i]) > rlen(roads[j])) continue;                     // i = el corto
  let near = 0, tot = 0;
  for (const p of roads[i]) { tot++; if (ptSegDist(p[0], p[1], roads[j]) < 6) near++; }
  if (tot && near / tot >= 0.7) drop.add(i);
}
const roads2 = roads.filter((_, i) => !drop.has(i)), widths2 = roadWidths.filter((_, i) => !drop.has(i));
roads.length = 0; roads.push(...roads2); roadWidths.length = 0; roadWidths.push(...widths2);
// PLAZAS de unión ("explanada triangular" donde confluyen viales): donde un EXTREMO de un vial queda a
// <12 m de otro vial, se emite un pad circular drapeable que funde el nudo.
const pads = [];
for (let i = 0; i < roads.length; i++) for (const ep of [roads[i][0], roads[i][roads[i].length - 1]]) {
  for (let j = 0; j < roads.length; j++) { if (i === j) continue;
    if (ptSegDist(ep[0], ep[1], roads[j]) < 12) { 
      if (!pads.some(p => Math.hypot(p[0] - ep[0], p[1] - ep[1]) < 10)) pads.push([Math.round(ep[0] * 10) / 10, Math.round(ep[1] * 10) / 10, 9]);
      break; } }
}
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
LAY.roads = roads; LAY.roadWidths = roadWidths; LAY.roadW = 4; LAY.roadPads = pads;
writeFileSync(LAYP, JSON.stringify(LAY));
let len = 0; roads.forEach(pl => { for (let i = 0; i + 1 < pl.length; i++) len += Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]); });
console.log('viales del bloque:', roads.length, '· longitud:', len.toFixed(0), 'm · descartados paralelos:', drop.size, '· plazas:', pads.length);
