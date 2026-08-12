/* Compara dos extracciones del mapa Modbus y dice qué cambió entre versiones de documento.
 *
 * Cuando llegue el v7 de la TCU o el R8 de la NCU, esto contesta en un segundo la única pregunta
 * que importa: qué direcciones son nuevas, cuáles desaparecen, y —lo peligroso— cuáles siguen ahí
 * pero SIGNIFICAN OTRA COSA. Ese último caso es el que rompió la pestaña de TCU: direcciones que
 * existían en los dos mapas y no querían decir lo mismo.
 *
 *   # 1) guarda la extracción actual como referencia
 *   cp tools/modbus_src/tcu_v6.json tools/modbus_src/tcu_v6.ref.json
 *   # 2) mete el documento nuevo y vuelve a extraer
 *   python3 tools/extract_modbus_pdf.py && cp /tmp/tcu_pdf.json tools/modbus_src/tcu_v7.json
 *   # 3) compara
 *   node tools/diff_modbus_map.mjs tools/modbus_src/tcu_v6.ref.json tools/modbus_src/tcu_v7.json
 *
 * Vale para los dos formatos: el del PDF (lista plana) y el del Excel (objeto por hoja).
 */
import { readFileSync } from 'node:fs';

const [A, B, ...rest] = process.argv.slice(2);
if (!A || !B) {
  console.error('uso: node tools/diff_modbus_map.mjs <antes.json> <despues.json> [hoja]');
  process.exit(2);
}
const hoja = rest[0] || null;

function carga(ruta) {
  const j = JSON.parse(readFileSync(ruta, 'utf8'));
  let filas;
  if (Array.isArray(j)) filas = j;                                  // extracción del PDF
  else {                                                            // extracción del Excel: {doc: {hoja: [...]}}
    const doc = j.ncu_r7 || j.hsu_r23 || j;
    if (hoja) filas = doc[hoja] || [];
    else filas = Object.keys(doc).filter(k => Array.isArray(doc[k])).flatMap(k => doc[k]);
  }
  const m = new Map();
  let cur = null;
  for (const f of filas) {
    const tiene = f.addr !== null && f.addr !== '' && !isNaN(+f.addr);
    if (tiene) cur = +f.addr;
    if (cur === null) continue;
    const clave = cur + (tiene ? '' : '|' + String(f.bits || '').trim());
    if (!m.has(clave)) m.set(clave, { addr: cur, bits: String(f.bits || '').trim(),
      nombre: String(f.nombre || '').trim(), desc: String(f.desc || '').trim(),
      tipo: String(f.tipo || '').trim(), unidad: String(f.unidad || '').trim(),
      rango: String(f.rango || '').trim(), defecto: String(f.defecto || '').trim() });
  }
  return m;
}

const a = carga(A), b = carga(B);
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const nuevas = [], idas = [], cambiadas = [];
for (const [k, v] of b) if (!a.has(k)) nuevas.push(v);
for (const [k, v] of a) if (!b.has(k)) idas.push(v);
for (const [k, v] of a) {
  const w = b.get(k); if (!w) continue;
  const dif = [];
  if (norm(v.desc) !== norm(w.desc)) dif.push(['descripción', v.desc, w.desc]);
  if (norm(v.nombre) !== norm(w.nombre)) dif.push(['nombre', v.nombre, w.nombre]);
  if (norm(v.tipo) !== norm(w.tipo)) dif.push(['tipo', v.tipo, w.tipo]);
  if (norm(v.unidad) !== norm(w.unidad)) dif.push(['unidad', v.unidad, w.unidad]);
  if (norm(v.rango) !== norm(w.rango)) dif.push(['rango', v.rango, w.rango]);
  if (norm(v.defecto) !== norm(w.defecto)) dif.push(['por defecto', v.defecto, w.defecto]);
  if (dif.length) cambiadas.push({ v, w, dif });
}
const ord = (x, y) => x.addr - y.addr;
nuevas.sort(ord); idas.sort(ord); cambiadas.sort((x, y) => x.v.addr - y.v.addr);

const et = v => `${String(v.addr).padStart(6)} ${v.bits ? '[' + v.bits + ']' : '       '} ${v.nombre || v.desc.slice(0, 46)}`;
console.log(`antes:   ${A}  (${a.size} entradas)`);
console.log(`después: ${B}  (${b.size} entradas)\n`);

/* Lo que primero: una direccion que sigue estando y ha cambiado de SIGNIFICADO es lo que se lleva
   por delante a un maestro que ya estaba escrito. Lo nuevo y lo que desaparece se ve venir. */
const graves = cambiadas.filter(c => c.dif.some(d => d[0] === 'descripción' || d[0] === 'tipo' || d[0] === 'unidad'));
console.log(`⚠ CAMBIAN DE SIGNIFICADO: ${graves.length}  (misma dirección, distinto qué es)`);
for (const c of graves.slice(0, 60)) {
  console.log('  ' + et(c.v));
  for (const [q, x, y] of c.dif) console.log(`        ${q}:  «${x || '—'}»  ->  «${y || '—'}»`);
}
if (graves.length > 60) console.log(`  … y ${graves.length - 60} más`);

const leves = cambiadas.filter(c => !graves.includes(c));
console.log(`\ncambios menores (rango, valor de fábrica, nombre): ${leves.length}`);
for (const c of leves.slice(0, 40)) console.log('  ' + et(c.v) + '  ' + c.dif.map(d => `${d[0]} «${d[1] || '—'}»→«${d[2] || '—'}»`).join(' · '));
if (leves.length > 40) console.log(`  … y ${leves.length - 40} más`);

console.log(`\nNUEVAS: ${nuevas.length}`);
for (const v of nuevas.slice(0, 60)) console.log('  ' + et(v) + (v.desc ? '  ' + v.desc.slice(0, 60) : ''));
if (nuevas.length > 60) console.log(`  … y ${nuevas.length - 60} más`);

console.log(`\nDESAPARECEN: ${idas.length}`);
for (const v of idas.slice(0, 60)) console.log('  ' + et(v) + (v.desc ? '  ' + v.desc.slice(0, 60) : ''));
if (idas.length > 60) console.log(`  … y ${idas.length - 60} más`);

console.log(`\nresumen: ${graves.length} de significado · ${leves.length} menores · ${nuevas.length} nuevas · ${idas.length} fuera`);
if (graves.length) console.log('Revisa las de significado ANTES de regenerar: son las que rompen un maestro ya escrito.');
