/* Comprueba que modbus.html contiene TODO lo que dicen los tres documentos de fabricante.
 * Sin navegador. Falla si falta una sola dirección, un solo bit o una sola descripción.
 * uso: node tools/test_modbus_map.mjs
 */
import { readFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const XL = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/ncu_r7_hsu_r23.json', 'utf8'));
const XL8 = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/ncu_r8.json', 'utf8'));
const PDF = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/tcu_v6.json', 'utf8'));
const P4Q = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/p4q_ncu_revT.json', 'utf8'));
const h = readFileSync(RAIZ + 'modbus.html', 'utf8');
/* El bloque generado trae ya MAPAS (un mapa entero por fabricante) y BLOQUES_FAB. DEV es el del
   fabricante que la página abre por defecto; el de P4Q se comprueba aparte, más abajo. */
const MAPA_JS = h.slice(h.indexOf('var BLOQUES_FAB='), h.indexOf('/* @@MAPA_FIN@@ */'));
const { MAPAS, BLOQUES_FAB } = (new Function(MAPA_JS + '; return {MAPAS, BLOQUES_FAB};'))();
const DEV = MAPAS.sunner;

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FALLO') + ' ' + m); if (!c) fallos++; };

/* QUE SE COMPARA CON QUE. El extractor v2 conserva filas que la v1 tiraba, y son de dos clases:
     · con contenido real (cuatro subvariables descritas del MSR y de FlagsA) → la tabla LAS DEBE
       publicar, y hay comprobaciones abajo que lo exigen una por una;
     · «Reserved» → se quedan en el JSON como transcripción fiel y NO se publican: un chip
       «reservado» por bit llenaría los registros de banderas sin decir nada.
   Ademas, el R7 esta extraido con la v1: comparar sus filas contra las de la v2 diria que el R8
   «añade» cosas que en realidad añadio nuestro extractor. Asi que lo que se compara entre
   revisiones son las filas que las DOS extracciones tienen: las que el documento bautiza. */
const esEpigrafe = f => !!f.epigrafe;
const esReservado = f => f.nombre_doc === false && /^reserved$/i.test(String(f.desc || '').trim());
const publicable = f => !esEpigrafe(f) && !esReservado(f);
const comparable = f => publicable(f) && f.nombre_doc !== false;

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
  const set = new Set(filas.filter(f => publicable(f) && f[campo] !== null && f[campo] !== '' && !isNaN(+f[campo]))
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
    if (!publicable(f)) continue;                          // epígrafe o bit «Reserved»: no va a la tabla
    const ou = String(f.nombre).match(/_(?:s|hsu)(\d+)$/i);                 // _s22 es el ejemplo de OTRA unidad;
    if (ou && +ou[1] >= 2 && (f.addr === null || f.addr === '')) continue;  // _s0 es errata por _s1 y sí cuenta
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
    if (comparable(f) && f.addr !== null && f.addr !== '' && !isNaN(+f.addr)) t.add(+f.addr);
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
  const a = idx((XL.ncu_r7[hj] || []).filter(comparable)), b = idx((XL8.ncu_r8[hj] || []).filter(comparable));
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

/* ---------- NADA CON CONTENIDO SE QUEDA POR EL CAMINO ----------
   La v1 del extractor tiraba toda fila sin «Variable name» y se llevó por delante cuatro
   subvariables que el fabricante SÍ describe. No se vio en años porque ningún banco miraba el
   .xlsx: miraban el JSON, que ya salía sin ellas. Esto compara contra el documento extraído con
   la v2 y exige que cada fila con contenido esté publicada — como registro o como bit de su
   padre. Es la comprobación que habría cantado aquel fallo el primer día. */
console.log('\n=== ninguna fila con contenido del documento se pierde ===');
{
  const nombresBit = new Set();
  for (const sc of DEV.ncu.secs) for (const r of (sc.f || []))
    for (const k of Object.keys(r[4] || {})) nombresBit.add(k);
  const descsBit = new Set();
  for (const sc of DEV.ncu.secs) for (const r of (sc.f || []))
    for (const d of Object.values(r[9] || {})) descsBit.add(String(d).toLowerCase());
  const descsReg = new Set();
  for (const sc of DEV.ncu.secs) for (const r of (sc.f || [])) if (r[7]) descsReg.add(String(r[7]).toLowerCase());
  const perdidas = [];
  let recuperadas = 0;
  for (const hj of HOJAS_NCU) for (const f of (XL8.ncu_r8[hj] || [])) {
    if (!publicable(f) || !f.desc) continue;
    /* El ejemplo de OTRA unidad (StateOfCharge_s22) no es una fila que publicar: es el mismo
       campo de la unidad 22 puesto para enseñar el paso del bloque. Su contenido sí está, en el
       registro de la unidad 1. */
    const ou = String(f.nombre).match(/_(?:s|hsu)(\d+)$/i);
    if (ou && +ou[1] >= 2 && (f.addr === null || f.addr === '')) continue;
    if (f.nombre_doc === false) recuperadas++;
    const tieneDir = f.addr !== null && f.addr !== '' && !isNaN(+f.addr);
    const trozo = String(f.desc).toLowerCase().slice(0, 40);
    const ok2 = tieneDir ? dirs.ncu.has(+f.addr)
      : [...descsBit, ...descsReg].some(d => d.startsWith(trozo));
    if (!ok2) perdidas.push(hj + ' «' + String(f.desc).slice(0, 48) + '»');
  }
  ok(perdidas.length === 0, `todas las filas con contenido del R8 están en la tabla` +
     (perdidas.length ? ` — faltan ${perdidas.length}: ` + perdidas.slice(0, 6).join(' · ') : ''));
  /* TEST NULO: si el filtro `publicable` se volviera a comer las filas sin nombre, la de arriba
     pasaría sin comprobar nada. Esto exige que esas filas EXISTAN y estén contadas. */
  ok(recuperadas >= 4, `${recuperadas} filas sin «Variable name» con contenido real llegan del documento (la v1 del extractor las tiraba)`);
  const b501 = (() => { for (const sc of DEV.ncu.secs) for (const r of (sc.f || []))
      if ((sc.stride ? sc.base + r[0] : r[0]) === 30501) return r[4] || {}; return {}; })();
  ok(JSON.stringify(b501.SafePositionState) === '[13,15]',
     'publicada SafePositionState (bits 15..13 del MSR): el filtro de «otra unidad» se la comía por llamarse _s0');
  for (const t of ['Magnet Presence', 'BLE Enabled', 'battery life preservation', 'battery Soc is not enough'])
    ok([...descsBit].some(d => d.includes(t.toLowerCase())), `publicada la subvariable «${t}», que el documento describe sin bautizar`);
  ok((XL8.extractor || 1) >= 2, `el JSON del R8 viene del extractor v${XL8.extractor || 1} (el que conserva las filas sin nombre)`);
}

/* ---------- donde el documento se contradice, la tabla lo DICE ----------
   Ni copiarlo tal cual (bits que se pisan) ni arreglarlo en silencio (la herramienta afirmando
   lo que su documento no dice). Las dos salidas honradas están en el generador y esto las ata. */
console.log('\n=== contradicciones del documento ===');
{
  const secDe = a => DEV.ncu.secs.find(sc => (sc.f || []).some(r => (sc.stride ? sc.base + r[0] : r[0]) === a));
  const regDe = a => { const sc = secDe(a); return sc && (sc.f || []).find(r => (sc.stride ? sc.base + r[0] : r[0]) === a); };
  const s01 = secDe(30501), s04 = secDe(30504);
  ok(!!s01 && /30501/.test(s01.sn) && /⚠/.test(s01.sn), 'la sección de 30501 avisa de la contradicción del MSR en su subtítulo');
  ok(!!s04 && /30504/.test(s04.sn) && /⚠/.test(s04.sn), 'la sección de 30504 avisa de que el bit 10 está declarado dos veces');
  const b01 = (regDe(30501) || [])[4] || {};
  ok(JSON.stringify(b01.magnet_presence) === '[11,11]' && JSON.stringify(b01.ble_enabled) === '[12,12]',
     'en 30501 se publica la lectura coherente: imán bit 11, BLE bit 12');
  const b04 = (regDe(30504) || [])[4] || {};
  ok(JSON.stringify(b04.FlagBatteryHeaterEnabled) === '[9,9]' && JSON.stringify(b04.ChargeBlockMotor) === '[10,10]',
     'en 30504 el calentador va al bit 9 y la relajación al 10, como los sitúa el PDF v6 de la TCU (su 30006)');
  const d04 = (regDe(30504) || [])[9] || {};
  ok(/bit 10/.test(d04.FlagBatteryHeaterEnabled || '') && /PDF v6/.test(d04.FlagBatteryHeaterEnabled || ''),
     'y la etiqueta sigue diciendo lo que el Excel de la NCU declaraba, con de dónde sale la corrección');
  /* Cruce entre los dos documentos del fabricante: si no coincidieran en estos cinco bits, la
     resolución de arriba no se sostendría y habría que volver a dejar el conflicto a la vista. */
  const pdf30006 = new Map(PDF.filter(f => f.addr === 30006 && /^\d+$/.test(String(f.bits || '').trim()))
                              .map(f => [+String(f.bits).trim(), String(f.desc || '').toLowerCase()]));
  const cruce = [[0, 'west tilt limit'], [1, 'east tilt limit'], [6, 'soc is not enough'], [11, 'motor alarm is locked'], [15, 'system ok']];
  ok(cruce.every(([b, t]) => (pdf30006.get(b) || '').includes(t)),
     `el 30006 del PDF de la TCU coincide con el 30504 de la NCU en los ${cruce.length} bits que los dos nombran`);
  ok((pdf30006.get(9) || '').includes('heater') && (pdf30006.get(10) || '').includes('relaxation'),
     'y es ese PDF el que pone el calentador en el bit 9 y la relajación en el 10');
  /* Invariante general: dentro de un registro, dos subvariables no pueden compartir bit. La única
     excepción es la de arriba, que es del documento y está marcada. Es lo que habría cantado el
     (12..11)/(13..12) del MSR en cuanto se publicó. */
  const solapes = [], ajenos = [];
  for (const k of Object.keys(DEV)) for (const sc of DEV[k].secs) for (const r of (sc.f || [])) {
    const bits = r[4]; if (!bits || typeof bits === 'string' || r[6] === 'ENUM') continue;
    const usados = new Map();
    for (const [n, b] of Object.entries(bits)) { if (!Array.isArray(b)) continue;
      for (let i = b[0]; i <= b[1]; i++) { if (usados.has(i)) (k === 'ncu' ? solapes : ajenos).push(`${k} · ${sc.t} · ${r[1]} bit ${i}: ${usados.get(i)} / ${n}`); usados.set(i, n); } }
  }
  ok(solapes.length === 0, 'ningún registro de la NCU publica dos subvariables sobre el mismo bit' +
     (solapes.length ? ': ' + solapes.slice(0, 4).join(' · ') : ''));
  /* Los otros dos mapas salen de otros documentos y no son de este cambio, pero que se vean:
     el PDF de la TCU declara su 30001 con «backtracking» en el bit 1 y «low capacity» en 2:1. */
  if (ajenos.length) console.log(`  (aviso, fuera de este mapa) ${ajenos.length} solapes de bits en TCU/HSU: ` +
    ajenos.slice(0, 5).join(' · '));
}

/* ---------- los epígrafes del documento son las secciones ---------- */
{
  const titulos = DEV.ncu.secs.map(sc => sc.t).join(' | ');
  const eps = (XL8.ncu_r8['NCU RW registers'] || []).filter(esEpigrafe).map(f => f.epigrafe);
  ok(eps.length >= 4, `la hoja «NCU RW» trae ${eps.length} epígrafes de sección y ya no se tiran`);
  ok(eps.every(e => titulos.includes(e)), 'cada epígrafe del documento es una sección de la tabla' +
     (eps.every(e => titulos.includes(e)) ? '' : ' — falta ' + eps.find(e => !titulos.includes(e))));
  ok(titulos.includes('Change Safe Position 7 (Custom) target angle'),
     'los 10 registros nuevos del R8 salen bajo el epígrafe del fabricante que los explica');
}

console.log('\n=== espacio de direcciones ===');
const BLOQUES = BLOQUES_FAB.sunner;
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
/* ================= P4Q · NCU revT =================
   Otro fabricante, otro documento. Dos cosas hay que probar y ninguna es cosmética:

   1. QUE ESTÉ ENTERO. Cada dirección del Excel tiene que salir en la tabla — y como la tabla
      publica los bloques por unidad UNA vez (base + paso), «salir» significa que la fórmula
      reproduce la dirección del documento, no que esté escrita.
   2. QUE LOS BLOQUES QUE SE COLAPSAN NO MIENTAN. La hoja «RW variables» trae 861 filas, de las
      que 800 son el mismo registro repetido para 200 grupos. Publicarlas todas es un muro
      ilegible; colapsarlas es lo correcto SIEMPRE QUE la fórmula devuelva exactamente esas 800
      direcciones. Eso se comprueba aquí fila a fila, que es la única forma de que el atajo no
      se convierta en una invención. */
console.log('\n=== P4Q · NCU revT ===');
{
  const P = MAPAS.p4q.ncu;
  const dirP4Q = new Set(), tramos = [];
  for (const sc of P.secs) for (const r of (sc.f || [])) {
    if (sc.stride) { for (let u = 1; u <= (sc.max || 1); u++) dirP4Q.add(sc.base + (u - 1) * sc.stride + r[0]); }
    else dirP4Q.add(r[0]);
  }
  for (const sc of P.secs) if (sc.stride) tramos.push({ t: sc.t, base: sc.base, paso: sc.stride, max: sc.max });

  /* --- 1 · las hojas de registros --- */
  const hojas = Object.keys(P4Q.p4q_revT);
  let faltan = [], total = 0;
  for (const hj of hojas) for (const f of (P4Q.p4q_revT[hj].filas || [])) {
    total++; if (!dirP4Q.has(f.addr)) faltan.push(`${hj} ${f.addr} ${f.nombre}`);
  }
  ok(faltan.length === 0, `las ${total} filas de las ${hojas.length} hojas de registros de P4Q están en la tabla` +
     (faltan.length ? ` — faltan ${faltan.length}: ` + faltan.slice(0, 6).join(' · ') : ''));

  /* --- 2 · la hoja «RW variables», fila a fila contra la fórmula --- */
  const rw = P4Q.rw || [];
  const malRW = [];
  for (const f of rw) if (!dirP4Q.has(f.addr)) malRW.push(f.addr + ' «' + String(f.etiqueta).slice(0, 40) + '»');
  ok(malRW.length === 0, `las ${rw.length} filas de «RW variables» (${rw.filter(x => x.matriz).length} matrices de bits) salen de la tabla` +
     (malRW.length ? ` — faltan ${malRW.length}: ` + malRW.slice(0, 6).join(' · ') : ''));

  /* El colapso por grupo, comprobado con el número de grupo que dice el propio documento:
     «Send Off Request to Group 137» tiene que caer justo en base + 136·paso. */
  /* TRAMPA DEL DOCUMENTO: los dos bloques de ángulo de la SP7 traen EXACTAMENTE la misma
     etiqueta fila a fila («Safe Position 7 angle (rads) for Group 1»), uno para los 10 grupos de
     limpieza (40030) y otro para los 200 grupos custom (40116). Lo único que los separa es el
     título de su sección, así que es por ahí por donde hay que distinguirlos — y por eso la
     tabla los publica con nombres de sección distintos y no como un bloque de 210. */
  const porGrupo = [
    { re: /^Force WindLevel Request for Group (\d+)/i, base: 40008, paso: 1 },
    { re: /^Safe Position 7 angle \(rads\) for Group (\d+)/i, sec: /^(?!.*Custom)/i, base: 40030, paso: 2 },
    { re: /^Safe Position 7 angle \(rads\) for Group (\d+)/i, sec: /Custom/i, base: 40116, paso: 2 },
    { re: /^Send (?:Off|Manual|Auto) Request to Group (\d+)/i, base: 40517, paso: 1 },
  ];
  let comprobadas = 0; const desviadas = [];
  for (const f of rw) for (const g of porGrupo) {
    const m = String(f.etiqueta || '').match(g.re); if (!m) continue;
    if (g.sec && !g.sec.test(String(f.seccion || ''))) continue;
    const n = +m[1];
    const esperada = g.base + (n - 1) * g.paso;
    comprobadas++;
    if (esperada !== f.addr) desviadas.push(`grupo ${n}: documento ${f.addr}, fórmula ${esperada}`);
  }
  ok(desviadas.length === 0 && comprobadas >= 800,
     `${comprobadas} filas por grupo del documento caen exactamente donde las pone la fórmula base + (grupo−1)·paso` +
     (desviadas.length ? ' — se desvían ' + desviadas.length + ': ' + desviadas.slice(0, 4).join(' · ') : ''));

  /* --- 3 · las bases y los pasos son los del documento, no los que nos apetezca --- */
  const par = (hj, re) => { const x = ((P4Q.p4q_revT[hj] || {}).params || []).find(y => re.test(y.clave)); return x && x.valor; };
  const esperados = [
    ['Bloque TCU (republicado)', par('TCUs', /TCUs Data start/), par('TCUs', /TCU registers qty/)],
    ['TCU · último contacto', par('TCUs', /TCUs LastCom start/), 2],
    ['TCU · cadena de módulos (SPP)', par('TCUs', /SPP start/), par('TCUs', /SPP register qty/)],
    ['Bloque TMU', par('TMUs', /TMUs Data start/), par('TMUs', /TMU registers qty/)],
    ['Repetidores Zigbee', par('Repeaters', /Data start/), par('Repeaters', /registers qty/)],
    ['Bloque RSU (republicado)', par('RSUs + Local Sensors', /RSUs data start/), par('RSUs + Local Sensors', /RSU registers qty/)],
    ['Bloque RSU extendido', par('RSUs + Local Sensors (Extended)', /RSUs data start/), par('RSUs + Local Sensors (Extended)', /RSU registers qty/)],
    ['RSU externas', par('External RSUs', /RSUs data start/), par('External RSUs', /RSU registers qty/)],
  ];
  const mal = esperados.filter(([t, b, q]) => { const sc = P.secs.find(x => x.t === t);
    return !sc || sc.base !== b || sc.stride !== q; });
  ok(mal.length === 0, `las bases y los pasos de los ${esperados.length} bloques por unidad son los que declara el documento` +
     (mal.length ? ': ' + mal.map(x => x[0]).join(', ') : ''));

  /* --- 4 · el espacio de direcciones de P4Q es suyo, no el de Sunner --- */
  const BP = BLOQUES_FAB.p4q;
  ok(Array.isArray(BP) && BP.length > 0 && JSON.stringify(BP) !== JSON.stringify(BLOQUES_FAB.sunner),
     `P4Q tiene su propio reparto del espacio de direcciones (${(BP || []).length} bloques), distinto del de Sunner`);
  const fueraP4Q = [...dirP4Q].filter(a => !BP.some(b => a >= b.de && a <= b.a));
  ok(fueraP4Q.length === 0, 'todas las direcciones de P4Q caen dentro de un bloque declarado' +
     (fueraP4Q.length ? ': ' + fueraP4Q.slice(0, 6).join(' ') : ''));

  /* --- 5 · los dos mapas NO se mezclan ---
     La 40030 existe en los dos y NO es lo mismo: I16 en centésimas de grado en Sunner R8, F32 en
     radianes en P4Q. Si algún día la página buscara en los dos a la vez, contestaría dos cosas
     incompatibles para la misma dirección; esto vigila que sigan separados y que el aviso esté. */
  const sun40030 = (() => { for (const k of Object.keys(MAPAS.sunner)) for (const sc of MAPAS.sunner[k].secs)
      for (const r of (sc.f || [])) if ((sc.stride ? sc.base + r[0] : r[0]) === 40030) return r; })();
  const p4q40030 = (() => { for (const sc of P.secs) for (const r of (sc.f || []))
      if ((sc.stride ? sc.base + r[0] : r[0]) === 40030) return r; })();
  ok(!!sun40030 && !!p4q40030 && sun40030[2] === 's16' && p4q40030[2] === 'f32',
     'la 40030 existe en los dos fabricantes y significa cosas distintas (Sunner I16 deg×100, P4Q F32 radianes)');
  ok(/40030/.test(P.nota) && /P4Q|radianes/.test(P.nota),
     'la pestaña de P4Q avisa de que una misma dirección no significa lo mismo en cada fabricante');
  ok(/function ponFabricante\(/.test(h) && /BLOQUES=BLOQUES_FAB\[f\]/.test(h),
     'la página cambia el mapa Y el reparto de direcciones al cambiar de fabricante');
  ok((P4Q.changelog || []).length >= 5 && /CAMBIOS_P4Q=/.test(h) && /changelogP4QHTML/.test(h),
     `el historial del documento de P4Q (${(P4Q.changelog || []).length} revisiones) se publica en «Versiones»`);
}

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
