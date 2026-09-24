/* Comprueba que modbus.html contiene TODO lo que dicen los tres documentos de fabricante.
 * Sin navegador. Falla si falta una sola dirección, un solo bit o una sola descripción.
 * uso: node tools/test_modbus_map.mjs
 */
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const XL = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/ncu_r7_hsu_r23.json', 'utf8'));
const XL8 = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/ncu_r8.json', 'utf8'));
const PDF = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/tcu_v6.json', 'utf8'));
const h = readFileSync(RAIZ + 'modbus.html', 'utf8');
const DEV = (new Function(h.slice(h.indexOf('var DEV={'), h.indexOf('/* @@MAPA_FIN@@ */')) + '; return DEV;'))();

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FALLO') + ' ' + m); if (!c) fallos++; };

/* direcciones y bits que la herramienta publica, por pestaña (unidad 1 en los bloques por unidad) */
const dirs = {}, bitsDe = {}, descDe = {};
for (const k of Object.keys(DEV)) {
  dirs[k] = new Set(); bitsDe[k] = new Map(); descDe[k] = new Map();
  for (const s of DEV[k].secs) for (const r of (s.f || [])) {
    const a = s.stride ? s.base + r[0] : r[0];
    dirs[k].add(a);
    bitsDe[k].set(a, new Set(Object.keys(r[4] || {})));
    descDe[k].set(a, r[7] || '');
  }
}

/* ---------- direcciones ---------- */
function compruebaDirs(nom, filas, tab, campo = 'addr') {
  const set = new Set(filas.filter(f => f[campo] !== null && f[campo] !== '' && !isNaN(+f[campo]))
                           .map(f => +f[campo]));   // addr vacío es una fila de subvariable, no la dirección 0
  const falta = [...set].filter(a => !dirs[tab].has(a)).sort((x, y) => x - y);
  ok(falta.length === 0, `${nom}: ${set.size} direcciones del documento, faltan ${falta.length}` +
     (falta.length ? ' → ' + falta.slice(0, 25).join(' ') : ''));
  return set;
}
/* LAS DOS REVISIONES DE LA NCU, las dos enteras. La tabla es la union del R7 y del R8, asi que
   ninguna de las dos puede perder una direccion por el camino: si el R8 se publicara «encima»
   del R7, las NCU desplegadas —que van por R7— se quedarian sin su documento en la herramienta,
   y al reves un registro del R8 que faltara no se echaria de menos hasta tener la NCU delante. */
const HOJAS_NCU = ['NCU Info', 'NCU RW registers', 'TCU Compat', 'TCU', 'HSU', 'HSU EXT'];
console.log('\n=== NCU_Modbus_Map_R7.xlsx ===');
compruebaDirs('NCU Info', XL.ncu_r7['NCU Info'], 'ncu');
compruebaDirs('NCU RW registers', XL.ncu_r7['NCU RW registers'], 'ncu');
compruebaDirs('TCU Compat', XL.ncu_r7['TCU Compat'], 'ncu');
compruebaDirs('TCU (bloque 50000)', XL.ncu_r7['TCU'], 'ncu');
compruebaDirs('HSU vía NCU', XL.ncu_r7['HSU'], 'ncu');
compruebaDirs('HSU EXT', XL.ncu_r7['HSU EXT'], 'ncu');
console.log('\n=== NCU_Modbus_Map_R8.xlsx ===');
for (const hj of HOJAS_NCU) compruebaDirs(hj, XL8.ncu_r8[hj], 'ncu');
console.log('\n=== HSU_Modbus_Map_R23.xlsx ===');
compruebaDirs('HSU mapa propio', XL.hsu_r23['Sheet1'], 'hsu');
compruebaDirs('HSU vía NCU (republicado en la pestaña HSU)', XL.ncu_r7['HSU'], 'hsu');
compruebaDirs('HSU EXT (republicado en la pestaña HSU)', XL.ncu_r7['HSU EXT'], 'hsu');
console.log('\n=== SUNNER_TCU_ModbusMap_v6.pdf ===');
compruebaDirs('TCU v6', PDF, 'tcu');

/* ---------- bits: ninguna subvariable puede perderse ---------- */
console.log('\n=== subvariables (bits) ===');
function bitsDoc(filas, bitsFn) {
  const m = new Map(); let cur = null;
  for (const f of filas) {
    if (/_(s|hsu)\d+$/i.test(String(f.nombre)) && !/_(s|hsu)1$/i.test(String(f.nombre))
        && (f.addr === null || f.addr === '')) continue;   // ejemplo de otra unidad, no subvariable
    const tiene = f.addr !== null && f.addr !== '' && !isNaN(+f.addr);
    if (tiene) { cur = +f.addr; if (!m.has(cur)) m.set(cur, 0); continue; }
    if (cur !== null && bitsFn(f.bits)) m.set(cur, m.get(cur) + 1);
  }
  return m;
}
const bXL = s => /\(\d+\.\.\d+\)/.test(String(s || ''));
function compruebaBits(nom, filas, tab) {
  const doc = bitsDoc(filas, bXL); let mal = [], tot = 0;
  for (const [a, n] of doc) { tot += n; const t = (bitsDe[tab].get(a) || new Set()).size;
    if (n > 0 && t < n) mal.push(`${a} (doc ${n}, tabla ${t})`); }
  ok(mal.length === 0, `${nom}: ${tot} subvariables en el documento` + (mal.length ? ` — cortas en ${mal.length}: ${mal.slice(0, 8).join(', ')}` : ''));
}
compruebaBits('NCU Info', XL.ncu_r7['NCU Info'], 'ncu');
compruebaBits('NCU RW registers', XL.ncu_r7['NCU RW registers'], 'ncu');
compruebaBits('TCU Compat', XL.ncu_r7['TCU Compat'], 'ncu');
compruebaBits('TCU 50000', XL.ncu_r7['TCU'], 'ncu');
compruebaBits('HSU EXT', XL.ncu_r7['HSU EXT'], 'ncu');
for (const hj of HOJAS_NCU) compruebaBits('R8 · ' + hj, XL8.ncu_r8[hj], 'ncu');
compruebaBits('HSU R23', XL.hsu_r23['Sheet1'], 'hsu');
// TCU (PDF): cada fila con bits parciales es una subvariable
{
  const doc = new Map();
  for (const f of PDF) { const t = String(f.bits || '').trim();
    if (/^\d+:\d+$/.test(t) || /^\d+$/.test(t)) {
      const [hi, lo] = t.includes(':') ? t.split(':').map(Number) : [+t, +t];
      const completo = (lo === 0 && (hi === 15 || hi === 31 || hi === 7));
      if (!completo) doc.set(f.addr, (doc.get(f.addr) || 0) + 1);
    } }
  let mal = [], tot = 0;
  for (const [a, n] of doc) { tot += n; const t = (bitsDe.tcu.get(a) || new Set()).size;
    if (t < n) mal.push(`${a} (doc ${n}, tabla ${t})`); }
  ok(mal.length === 0, `TCU v6: ${tot} subvariables en el documento` + (mal.length ? ` — cortas en ${mal.length}: ${mal.slice(0, 8).join(', ')}` : ''));
}

/* ---------- descripciones ---------- */
console.log('\n=== descripciones ===');
let sinDesc = [];
for (const k of Object.keys(DEV)) for (const s of DEV[k].secs) for (const r of (s.f || []))
  if (!r[7]) sinDesc.push(k + ':' + r[1]);
const total = Object.keys(DEV).reduce((n, k) => n + DEV[k].secs.reduce((m, s) => m + (s.f || []).length, 0), 0);
/* 12 registros tienen la celda de descripción VACÍA en el documento de origen (8 del PDF de la TCU
   y 4 del Excel de la HSU). No se inventan: la tabla dice «sin descripción en el documento». Lo que
   sí se exige es que no crezcan y que cada uno tenga nombre propio — llegaron a llamarse todos
   'reg', ocho registros distintos indistinguibles entre sí. */
ok(sinDesc.length <= 12, `${total - sinDesc.length}/${total} registros con descripción del documento` +
   (sinDesc.length ? ` — vacía en el documento: ${sinDesc.length}` : ''));
ok(new Set(sinDesc).size === sinDesc.length,
   `los ${sinDesc.length} sin descripción tienen nombre propio y no colisionan`);

/* ---------- valores por defecto y rangos: el dato que antes se aplanaba en el texto ---------- */
console.log('\n=== valores por defecto y rangos ===');
let cDef = 0, cRan = 0;
for (const k of Object.keys(DEV)) for (const s of DEV[k].secs) for (const r of (s.f || [])) {
  if (r[10]) cDef++; if (r[11]) cRan++;
}
ok(cDef >= 190, `${cDef} registros con valor por defecto como CAMPO (no dentro de la descripción)`);
ok(cRan >= 240, `${cRan} registros con rango declarado como CAMPO`);
const enDesc = [];
for (const k of Object.keys(DEV)) for (const s of DEV[k].secs) for (const r of (s.f || []))
  if (/·\s*(rango|por defecto)\s/.test(r[7] || '')) enDesc.push(k + ':' + r[1]);
ok(enDesc.length === 0, `ninguna descripción arrastra ya el rango ni el valor por defecto pegados${enDesc.length ? ': ' + enDesc.slice(0,4).join(', ') : ''}`);

/* ---------- reparto del espacio de direcciones (hoja Overview) ---------- */
/* ---------- las marcas de revisión dicen la VERDAD ----------
   La tabla de la NCU es la unión del R7 y del R8, y lo unico que distingue a una revision de la
   otra es la marca r[12] de cada fila. Si la marca fuera decorativa, el selector de revision
   mentiria: enseñaria como «R7» registros que esa NCU no tiene —y al que los escriba en planta
   le responderan excepcion— sin que nada fallara aqui. Asi que se comprueba contra los dos
   documentos, dirección a dirección, en vez de contra un numero escrito a mano. */
console.log('\n=== revisiones R7 y R8 de la NCU ===');
const dirsDoc = doc => { const t = new Set();
  for (const hj of HOJAS_NCU) for (const f of (doc[hj] || []))
    if (f.addr !== null && f.addr !== '' && !isNaN(+f.addr)) t.add(+f.addr);
  return t; };
const D7 = dirsDoc(XL.ncu_r7), D8 = dirsDoc(XL8.ncu_r8);
const marcadas = { R7: new Set(), R8: new Set(), sin: new Set() };
let conCambio = 0;
for (const sc of DEV.ncu.secs) for (const r of (sc.f || [])) {
  const a = sc.stride ? sc.base + r[0] : r[0];
  marcadas[r[12] === 'R7' ? 'R7' : r[12] === 'R8' ? 'R8' : 'sin'].add(a);
  if (r[13]) conCambio++;
}
const soloR8 = [...D8].filter(a => !D7.has(a)).sort((x, y) => x - y);
const soloR7 = [...D7].filter(a => !D8.has(a)).sort((x, y) => x - y);
ok(soloR8.every(a => marcadas.R8.has(a)) && [...marcadas.R8].every(a => !D7.has(a) && D8.has(a)),
   `las ${marcadas.R8.size} marcadas «nuevo en R8» son exactamente las ${soloR8.length} direcciones que el R8 añade` +
   (soloR8.length ? ' → ' + soloR8.slice(0, 14).join(' ') : ''));
ok(soloR7.every(a => marcadas.R7.has(a)) && [...marcadas.R7].every(a => D7.has(a) && !D8.has(a)),
   `las ${marcadas.R7.size} marcadas «solo R7» son exactamente las ${soloR7.length} que el R8 ya no trae`);
ok([...marcadas.sin].every(a => D7.has(a) && D8.has(a)),
   `los ${marcadas.sin.size} registros sin marca están en las DOS revisiones`);
ok(D7.size > 0 && [...D7].every(a => marcadas.sin.has(a) || marcadas.R7.has(a)),
   `el R7 se sigue publicando ENTERO: sus ${D7.size} direcciones siguen en la tabla`);
ok(D8.size > 0 && [...D8].every(a => marcadas.sin.has(a) || marcadas.R8.has(a)),
   `el R8 se publica entero: sus ${D8.size} direcciones están en la tabla`);
/* TEST NULO: si el generador dejara de marcar, los tres conjuntos de arriba se cumplirían solos
   (vacío ⊆ cualquier cosa). Esto exige que las marcas EXISTAN mientras los documentos difieran. */
ok((soloR8.length + soloR7.length === 0) || (marcadas.R8.size + marcadas.R7.size > 0),
   `los documentos difieren en ${soloR8.length + soloR7.length} direcciones y la tabla lo dice (${marcadas.R8.size + marcadas.R7.size} marcadas)`);
ok(DEV.ncu.revs && DEV.ncu.revs.length === 2 && DEV.ncu.revAl === 'R8',
   `la pestaña NCU declara sus revisiones (${(DEV.ncu.revs || []).join(', ')}) y cuál es la vigente`);
/* Un registro con la misma dirección y distinto significado es lo que rompe un maestro ya escrito
   sin dar error. Mientras no lo haya, esto vigila que no aparezca uno sin que nadie lo marque. */
const chgDoc = [];
for (const hj of HOJAS_NCU) {
  const idx = filas => { const c = new Map(), m = new Map();
    for (const f of (filas || [])) { if (f.addr === null || f.addr === '' || isNaN(+f.addr)) continue;
      const n = (c.get(+f.addr) || 0) + 1; c.set(+f.addr, n); m.set(+f.addr + '#' + n, f); }
    return m; };
  const a = idx(XL.ncu_r7[hj]), b = idx(XL8.ncu_r8[hj]);
  const nr = x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
  for (const [k, v] of a) { const w = b.get(k); if (!w) continue;
    if (['nombre', 'desc', 'tipo', 'unidad', 'acc', 'rango', 'defecto'].some(c => nr(v[c]) !== nr(w[c])))
      chgDoc.push(hj + ' ' + v.addr + ' ' + v.nombre); }
}
ok(conCambio === chgDoc.length,
   `${chgDoc.length} direcciones dicen algo distinto en cada revisión y la tabla marca ${conCambio}` +
   (chgDoc.length ? ' → ' + chgDoc.slice(0, 6).join(', ') : ''));

/* ---------- la página deja ver cada revisión por separado ----------
   El mapa puede estar perfecto y la página seguir siendo una mentira si enseña la unión de las dos
   revisiones como si fuera un solo documento. Estas tres son la parte de interfaz del contrato. */
ok(/id="revsel"/.test(h) && /id="revbox"/.test(h), 'la página trae el selector de revisión');
ok(/function enRev\(/.test(h) && /if\(!enRev\(r\)\)return;/.test(h),
   'la tabla filtra por la revisión elegida (enRev)');
ok(/function difRevHTML\(/.test(h) && /difRevHTML\(\)/.test(h),
   'la pestaña Versiones enseña la comparación R7 ↔ R8 sacada del propio mapa');

console.log('\n=== espacio de direcciones ===');
const BLOQUES = (new Function(h.slice(h.indexOf('var BLOQUES='), h.indexOf('var DEV={')) + '; return BLOQUES;'))();
ok(BLOQUES.length === 17, `${BLOQUES.length} bloques (hoja Overview)`);
/* Si una revisión repartiera el espacio distinto que la otra, un «hueco reservado» de una sería
   un bloque con registros de la otra, y el localizador de direcciones contestaría lo que no es. */
const bl = l => JSON.stringify((l || []).map(b => [b.de, b.a, b.nombre, b.libre || null]));
ok(bl(XL.bloques_r7) === bl(XL8.bloques_r8),
   'R7 y R8 reparten el espacio de direcciones igual (hoja «Overview» idéntica)');
const dentro = a => BLOQUES.some(b => a >= b.de && a <= b.a);
const fuera = [...dirs.ncu].filter(a => !dentro(a));
ok(fuera.length === 0, `todas las direcciones de la NCU caen dentro de un bloque declarado${fuera.length ? ': ' + fuera.slice(0,6).join(' ') : ''}`);

/* ---------- lo que el mapa antiguo decía y el documento desmiente ---------- */
console.log('\n=== regresión: el mapa inventado de la TCU no puede volver ===');
const inventados = [[30003, 'tracker_id'], [30032, 'soc'], [30040, 'fault_word']];
const nombres = new Set();
for (const s of DEV.tcu.secs) for (const r of (s.f || [])) nombres.add(r[1]);
ok(!nombres.has('fault_word') && !nombres.has('tracker_id'),
   'no quedan nombres del mapa del gemelo (tracker_id / fault_word)');
const hayCoils = DEV.tcu.secs.some(s => (s.f || []).some(r => r[2] === 'coil' || r[2] === 'di'));
ok(!hayCoils, 'no hay coils ni entradas discretas: el PDF v6 solo admite FC 03/04/06/16/22');

console.log(`\n${fallos ? '✗ ' + fallos + ' FALLOS' : '✓ el mapa contiene todo lo que dicen los tres documentos'}`);
process.exit(fallos ? 1 : 0);
