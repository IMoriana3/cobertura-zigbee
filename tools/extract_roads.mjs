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
const surfaces = []; let totA = 0, totV = 0, nHoles = 0;
for (const e of blk.entities) {
  if (e.type !== 'HATCH' || !e.boundaryPaths) continue;
  const rings = e.boundaryPaths
    .filter(p => p.vertices && p.vertices.length >= 3)
    .map(p => simplify(expand(p.vertices).map(([x, y]) => T(x, y))))
    .filter(r => Math.abs(area(r)) > 5);
  if (!rings.length) continue;
  rings.sort((r1, r2) => Math.abs(area(r2)) - Math.abs(area(r1)));           // el anillo mayor = exterior; el resto, huecos
  const o = rings[0], h = rings.slice(1);
  totA += Math.abs(area(o)) - h.reduce((s, r) => s + Math.abs(area(r)), 0);
  totV += o.length + h.reduce((s, r) => s + r.length, 0); nHoles += h.length;
  surfaces.push(h.length ? { o, h } : { o });
}
const LAY = JSON.parse(readFileSync(LAYP, 'utf8'));
LAY.roadSurfaces = surfaces; LAY.roadAreas = [];                             // las superficies sustituyen a cintas+abanicos en el visor
writeFileSync(LAYP, JSON.stringify(LAY));
console.log('superficies:', surfaces.length, '· huecos:', nHoles, '· área total:', totA.toFixed(0), 'm² · vértices:', totV,
  '· INSERT:', ins ? ('sí (' + ip.x.toFixed(2) + ',' + ip.y.toFixed(2) + ')') : 'fallback layout');
