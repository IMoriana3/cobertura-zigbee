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

/* --- clasificación ---
 * Dos nomenclaturas reales, según quién dibujó el plano:
 *   ACCIONA / San José : la CAPA manda   -> IntLargo_ART, ExtCorto...      (largo 4x32 · corto 2x32)
 *   G. Zaragozá / Ayora: el BLOQUE manda -> INT_1V28, EXT_1V21, INT_1V14_ART  (mods en el nombre)
 * Ayora tiene TRES longitudes (28/21/14 módulos), así que además del par completo/medio se anota
 * 'mods' y la razón de longitud 'mr' (mods/28) para que el visor no tenga que asumir solo dos.
 */
function clasificaAyora(layer, blk) {
  const B = String(blk || ''), m = B.match(/^(INT|EXT)_1V(\d+)(_ART)?$/i);
  if (!m) return null;                                   // bloque anónimo (*U9/*U10) u otro: NO se inventa
  const mods = +m[2];
  return {
    artic: !!m[3], tp: (/^EXT/i.test(m[1]) ? 'Exterior' : 'Interior') + ' 1V' + mods,
    t: mods >= 28 ? 'completo' : 'medio', mods: mods, mr: +(mods / 28).toFixed(3)
  };
}
function clasifica(layer, blk) {
  const ay = clasificaAyora(layer, blk); if (ay) return ay;
  const L = String(layer || ''), B = String(blk || '');
  // GUARDA: si no reconozco la nomenclatura, devuelvo VACÍO. Sin esto, un bloque anónimo (*U9/*U10 de
  // Ayora) caía en el patrón de San José y salía inventado como "Interior corto".
  if (!/largo|corto/i.test(L) && !/\dx\d\d|corto|calibrado/i.test(B)) return {};
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

const pts = inserts.filter(e => e.insertionPoint).map(e => ({
  x: +(e.insertionPoint.x - cE).toFixed(2),
  n: +(e.insertionPoint.y - cN).toFixed(2),
  blk: e.name || '',
  ...clasifica(e.layer, e.name)
}));

/* --- emparejamiento 1:1 por proximidad (rejilla de 1 m) --- */
const grid = {};
pts.forEach((p, i) => { const k = Math.round(p.x) + '_' + Math.round(p.n); (grid[k] = grid[k] || []).push(i); });
const used = new Set();
let peor = 0, sinPareja = 0, sinTipo = 0, cambios = { artic: 0, tp: 0, t: 0 };

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
  if (p.tp === undefined) { trk.blk = p.blk; sinTipo++; continue; }   // bloque no clasificable (anónimo dinámico): se anota SU nombre y se deja el tipo como estaba — nada inventado
  if (trk.artic !== p.artic) cambios.artic++;
  if (trk.tp !== p.tp) cambios.tp++;
  if (trk.t !== p.t) cambios.t++;
  trk.artic = p.artic; trk.tp = p.tp; trk.t = p.t;
  if (p.mods) { trk.mods = p.mods; trk.mr = p.mr; }
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
console.log('SIN CLASIFICAR (bloque anónimo, tipo intacto):', sinTipo, sinTipo?JSON.stringify(layout.trackers.filter(t=>t.blk).reduce((m,t)=>(m[t.blk]=(m[t.blk]||0)+1,m),{})):'');
if(layout.trackers.some(t=>t.mods))console.log('longitudes (mods):', JSON.stringify(layout.trackers.reduce((m,t)=>(t.mods&&(m[t.mods]=(m[t.mods]||0)+1),m),{})));

if (sinPareja) { console.error('\nABORTA: hay seguidores sin pareja en el DWG; no se escribe nada.'); process.exit(1); }
if (WRITE) { writeFileSync(jsonPath, JSON.stringify(layout)); console.log('\nescrito:', jsonPath); }
else console.log('\n(dry-run: pasa --write para guardar)');
