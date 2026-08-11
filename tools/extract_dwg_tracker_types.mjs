/* Extrae la TAXONOMÍA REAL de seguidores del DWG de implantación y la inyecta en <planta>_layout.json.
 *
 * El DWG es la autoridad: cada seguidor es un INSERT cuyo NOMBRE DE BLOQUE da la longitud
 * (4x32 = largo/completo · 2x32 = corto/medio) y cuya CAPA da posición e articulación:
 *     IntLargo_ART  ->  Interior · largo · ARTICULADO (con rótula = "tracker quebrado")
 *     ExtCorto      ->  Exterior · corto · sin rótula
 * El sufijo _ART es lo que marca la rótula en el actuador; sin él la viga es rígida.
 * Los bloques "intCortoMasCalibrado*" son cortos con instrumentación (celda de calibración /
 * sensor de suciedad); se clasifican como corto interior y se anota su instrumentación.
 *
 * Emparejamiento con el layout: por POSICIÓN (el layout se generó del mismo DWG, así que la
 * distancia es ~0). Se exige 1:1 y se aborta si algún seguidor queda sin pareja: nada de adivinar.
 *
 * Uso:  node tools/extract_dwg_tracker_types.mjs <archivo.dwg> <planta>_layout.json [--write]
 */
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';

const [dwgPath, jsonPath, ...rest] = process.argv.slice(2);
const WRITE = rest.includes('--write');
if (!dwgPath || !jsonPath) { console.error('uso: node tools/extract_dwg_tracker_types.mjs <archivo.dwg> <layout.json> [--write]'); process.exit(2); }

const lib = await LibreDwg.create();
if (typeof lib.dwg_bmp === 'function') lib.dwg_bmp = () => null;   // la miniatura BMP revienta el WASM en algunos DWG y no se usa
const db = lib.convert(lib.dwg_read_data(readFileSync(dwgPath).buffer, 0));   // flag 0: entidades del modelo
const inserts = (db.entities || []).filter(e => e.type === 'INSERT');
if (!inserts.length) { console.error('El DWG no trae bloques INSERT de seguidor.'); process.exit(1); }

/* --- clasificación: capa (Int/Ext, Largo/Corto, _ART) con el nombre del bloque como respaldo --- */
function clasifica(layer, blk) {
  const L = String(layer || ''), B = String(blk || '');
  const largoL = /largo/i.test(L), cortoL = /corto/i.test(L);
  const largoB = /4x32/i.test(B),  cortoB = /2x32/i.test(B) || /corto/i.test(B);
  const largo = largoL || (!cortoL && largoB);
  const ext = /^ext/i.test(L) || (!/^int/i.test(L) && /_E$/.test(B));
  return {
    artic: /_ART\b|_ART_|ART$/i.test(L),                       // rótula en el actuador ("quebrado")
    tp: (ext ? 'Exterior' : 'Interior') + ' ' + (largo ? 'largo' : 'corto'),
    t: largo ? 'completo' : 'medio',                            // clave que ya consume el visor
    cal: /_CAL|Calibrado/i.test(L + B) || undefined,            // celda de calibración
    suc: /_SUC|suciedad/i.test(L + B) || undefined              // sensor de suciedad (soiling)
  };
}

const layout = JSON.parse(readFileSync(jsonPath, 'utf8'));
const { cE, cN } = layout;
if (!isFinite(cE) || !isFinite(cN)) { console.error('El layout no trae cE/cN (origen UTM).'); process.exit(1); }

const pts = inserts.map(e => ({
  x: +(e.insertionPoint.x - cE).toFixed(2),
  n: +(e.insertionPoint.y - cN).toFixed(2),
  ...clasifica(e.layer, e.name)
}));

/* --- emparejamiento 1:1 por proximidad (rejilla de 1 m) --- */
const grid = {};
pts.forEach((p, i) => { const k = Math.round(p.x) + '_' + Math.round(p.n); (grid[k] = grid[k] || []).push(i); });
const used = new Set();
let peor = 0, sinPareja = 0, cambios = { artic: 0, tp: 0, t: 0 };

for (const trk of layout.trackers) {
  let best = -1, bd = Infinity;
  for (let dx = -2; dx <= 2; dx++) for (let dn = -2; dn <= 2; dn++) {
    const arr = grid[(Math.round(trk.x) + dx) + '_' + (Math.round(trk.n) + dn)];
    if (!arr) continue;
    for (const i of arr) { if (used.has(i)) continue; const d = Math.hypot(pts[i].x - trk.x, pts[i].n - trk.n); if (d < bd) { bd = d; best = i; } }
  }
  if (best < 0 || bd > 1.5) { sinPareja++; continue; }
  used.add(best); if (bd > peor) peor = bd;
  const p = pts[best];
  if (trk.artic !== p.artic) cambios.artic++;
  if (trk.tp !== p.tp) cambios.tp++;
  if (trk.t !== p.t) cambios.t++;
  trk.artic = p.artic; trk.tp = p.tp; trk.t = p.t;
  if (p.cal) trk.cal = true; if (p.suc) trk.suc = true;
}

/* --- informe --- */
const cuenta = k => layout.trackers.reduce((m, t) => (m[t[k]] = (m[t[k]] || 0) + 1, m), {});
console.log('INSERT en el DWG:', inserts.length, '| seguidores en el layout:', layout.trackers.length);
console.log('sin pareja:', sinPareja, '| peor distancia:', peor.toFixed(3), 'm');
console.log('tipos (tp):', JSON.stringify(cuenta('tp')));
console.log('longitud (t):', JSON.stringify(cuenta('t')));
console.log('articulados:', layout.trackers.filter(t => t.artic).length, '/', layout.trackers.length);
console.log('con calibración:', layout.trackers.filter(t => t.cal).length, '| con sensor de suciedad:', layout.trackers.filter(t => t.suc).length);
console.log('campos modificados:', JSON.stringify(cambios));

if (sinPareja) { console.error('\nABORTA: hay seguidores sin pareja en el DWG; no se escribe nada.'); process.exit(1); }
if (WRITE) { writeFileSync(jsonPath, JSON.stringify(layout)); console.log('\nescrito:', jsonPath); }
else console.log('\n(dry-run: pasa --write para guardar)');
