/* Mide en el DWG las cotas REALES de la mesa y las mete en <planta>_layout.json.
 *
 * POR QUÉ
 * Las cuatro herramientas (3D, Layout 2D, Cobertura y siting) dibujaban la mesa con las constantes
 * de El Burgo para todas las plantas: módulo 1,134 m, hueco entre módulos 12 mm y hueco de motor
 * 0,55 m. En Ayora eso da 64,73 m de fila y el DWG dibuja 74,76 — DIEZ METROS de menos, un 13,5 %,
 * en sus 754 seguidores— porque su módulo no es el de El Burgo sino un Risen de 1,303 m. Y el hueco
 * entre módulos son 15 mm, no 12, en las dos plantas medidas.
 *
 * QUÉ MIDE, y no deduce:
 *   · el rectángulo del módulo (cuerda x ancho a lo largo del tubo)
 *   · el hueco entre módulos consecutivos, uno a uno
 *   · el hueco del motor, que es el único grande de la columna
 *   · el paso entre las dos filas del bífilo
 *   · los módulos por ala
 *
 * MODELO, que sale de la propia medida y cuadra al milímetro en las dos plantas:
 *   largo_fila = 2 x (mods_ala x modW + (mods_ala - 1) x gapMod) + gapDrive
 *   N-1 huecos por ala, no N: 62 huecos para 64 módulos en San José, 54 para 56 en Ayora.
 *
 * LÍMITE: algunos bloques están dibujados como 3DSOLID y este lector no da su geometría. En ese
 * caso las constantes se toman del bloque hermano que SÍ es polilínea (mismo tipo de mesa) y el
 * largo de cada tipo se calcula con el modelo. No es un invento: se COMPRUEBA contra las distancias
 * entre seguidores contiguos del propio layout, que solo cuadran con el largo bueno.
 *
 *   npm install --no-save @mlightcad/libredwg-web     (12 MB de WASM, NO va commiteado: esto se
 *                                                      corre una vez por revisión de DWG y lo que se
 *                                                      versiona es el resultado, el campo "mesa")
 *   node tools/extract_dwg_cotas.mjs <archivo.dwg> <planta> [--write]
 */
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';

const [dwgPath, planta, ...rest] = process.argv.slice(2);
const WRITE = rest.includes('--write');
if (!dwgPath || !planta) { console.error('uso: node tools/extract_dwg_cotas.mjs <archivo.dwg> <planta> [--write]'); process.exit(2); }

const RAIZ = new URL('..', import.meta.url).pathname;
const lib = await LibreDwg.create();
if (typeof lib.dwg_bmp === 'function') lib.dwg_bmp = () => null;   // la miniatura BMP revienta el WASM y no se usa
const db = lib.convert(lib.dwg_read_data(readFileSync(dwgPath).buffer, 0));

const inserts = (db.entities || []).filter(e => e.type === 'INSERT');
const usados = {};
for (const e of inserts) usados[e.name] = (usados[e.name] || 0) + 1;
const escalas = new Set(inserts.map(e => `${+(e.xScale ?? 1)}/${+(e.yScale ?? 1)}`));

const r3 = v => +v.toFixed(3);
const cajas = b => (b.entities || []).filter(e => e.type === 'LWPOLYLINE').map(p => {
  const v = p.vertices || []; if (v.length < 4) return null;
  const xs = v.map(a => a.x), ys = v.map(a => a.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, x1, y0, y1, w: r3(x1 - x0), h: r3(y1 - y0) };
}).filter(Boolean);

/* Un bloque de seguidor: se le sacan las cotas midiendo una COLUMNA de módulos. */
function mide(b) {
  const c = cajas(b);
  if (c.length < 8) return null;
  /* el módulo es el rectángulo que más se repite y tiene pinta de módulo */
  const cuenta = {};
  for (const z of c) if (z.w > 0.5 && z.h > 0.5) { const k = z.w + 'x' + z.h; (cuenta[k] = cuenta[k] || []).push(z); }
  const mods = Object.values(cuenta).sort((a, b2) => b2.length - a.length)[0];
  if (!mods || mods.length < 8) return null;
  const mw = mods[0].w, mh = mods[0].h;
  /* el tubo corre por el eje en el que los módulos se apilan: el de mayor dispersión */
  const spanX = Math.max(...mods.map(m => m.x1)) - Math.min(...mods.map(m => m.x0));
  const spanY = Math.max(...mods.map(m => m.y1)) - Math.min(...mods.map(m => m.y0));
  const ejeY = spanY > spanX;
  const a0 = m => ejeY ? m.y0 : m.x0, a1 = m => ejeY ? m.y1 : m.x1;   // a lo largo del tubo
  const t0 = m => ejeY ? m.x0 : m.y0;                                  // a lo ancho (columna)
  const largoMod = ejeY ? mh : mw, cuerda = ejeY ? mw : mh;
  /* columnas = filas del bífilo */
  const cols = {};
  for (const m of mods) { const k = t0(m).toFixed(4); (cols[k] = cols[k] || []).push(m); }
  const claves = Object.keys(cols).sort((a, b2) => +a - +b2);
  const col = cols[claves[0]].sort((p, q) => a0(p) - a0(q));
  /* huecos entre módulos consecutivos de esa columna */
  const huecos = [];
  for (let i = 1; i < col.length; i++) huecos.push(+(a0(col[i]) - a1(col[i - 1])).toFixed(4));
  const orden = [...huecos].sort((a, b2) => a - b2);
  const gapMod = orden.length ? orden[Math.floor(orden.length / 2)] : null;          // la mediana: el hueco normal
  const grandes = huecos.filter(h => gapMod != null && h > gapMod * 3);
  const gapDrive = grandes.length === 1 ? grandes[0] : null;
  const pasoFila = claves.length >= 2 ? +(+claves[1] - +claves[0]).toFixed(3) : null;
  return {
    modsColumna: col.length,
    modsAla: gapDrive != null ? col.length / 2 : col.length,
    modW: largoMod, modH: cuerda, gapMod, gapDrive, pasoFila,
    filas: claves.length,
    largoMedido: +(a1(col[col.length - 1]) - a0(col[0])).toFixed(3),
    /* Envolvente RESPECTO AL PUNTO DE INSERCIÓN del bloque, que no siempre es su centro: los tres
       bloques de calibración de San José crecen solo hacia un lado (mismo arranque, uno o dos
       módulos más arriba), así que su centro queda 0,574 / 1,149 m desplazado. Tomándolos como
       centrados, uno salía pisando a su vecino 27 cm; con la envolvente real la holgura es la
       normal de la planta, 0,88 m. Y el dibujo también los necesita descentrados. */
    desde: +a0(col[0]).toFixed(3), hasta: +a1(col[col.length - 1]).toFixed(3),
    nHuecosNormales: huecos.filter(h => h === gapMod).length,
    huecosRaros: huecos.filter(h => h !== gapMod && h !== gapDrive),
  };
}

/* --- mide todos los bloques que están insertados --- */
const BR = (db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || [];
const medidos = {}, soloSolido = [];
for (const b of BR) {
  if (!usados[b.name]) continue;
  const m = mide(b);
  if (m) medidos[b.name] = m;
  else if ((b.entities || []).some(e => e.type === '3DSOLID')) soloSolido.push(b.name);
}

console.log(`DWG: ${dwgPath.split('/').pop()}`);
console.log(`  ${inserts.length} INSERT · escalas ${[...escalas].join(' ')}`);
if (escalas.size > 1) console.log('  ⚠ hay INSERT a escala distinta de 1: las cotas de un bloque escalado NO son las del dibujo');

console.log('\n=== bloques medidos ===');
for (const [n, m] of Object.entries(medidos)) {
  console.log(`  ${n}  (x${usados[n]})`);
  console.log(`     módulo ${m.modW} x ${m.modH} m · ${m.modsColumna} por columna (${m.modsAla}/ala) · ${m.filas} fila(s)` +
              (m.pasoFila ? ` a ${m.pasoFila} m` : ''));
  console.log(`     hueco entre módulos ${m.gapMod} m (x${m.nHuecosNormales}) · hueco de motor ${m.gapDrive} · largo medido ${m.largoMedido} m`);
  if (m.huecosRaros.length) console.log(`     ⚠ huecos que no encajan: ${m.huecosRaros.join(' ')}`);
  const teor = m.gapDrive != null ? 2 * (m.modsAla * m.modW + (m.modsAla - 1) * m.gapMod) + m.gapDrive : null;
  if (teor != null) console.log(`     modelo 2·(n·modW+(n−1)·gap)+motor = ${teor.toFixed(3)} m  →  ${Math.abs(teor - m.largoMedido) < 0.002 ? 'CUADRA' : 'NO cuadra (' + (teor - m.largoMedido).toFixed(3) + ' m)'}`);
}
if (soloSolido.length) console.log(`\n  bloques dibujados en 3DSOLID, sin geometría legible: ${soloSolido.join(' ')}`);

/* --- constantes de la planta: de los bloques medidos, exigiendo que coincidan --- */
const arr = Object.values(medidos).filter(m => m.gapDrive != null);
if (!arr.length) { console.error('\n✗ ningún bloque da la cota completa; no se escribe nada'); process.exit(1); }
const uni = (k) => { const v = [...new Set(arr.map(m => m[k]))]; return v.length === 1 ? v[0] : v; };
const mesa = { modW: uni('modW'), modH: uni('modH'), gapMod: uni('gapMod'), gapDrive: uni('gapDrive'), pasoFila: uni('pasoFila') };
console.log('\n=== cotas de la planta ===');
for (const [k, v] of Object.entries(mesa)) console.log(`  ${k.padEnd(10)} ${Array.isArray(v) ? '⚠ NO COINCIDEN: ' + v.join(' / ') : v}`);
if (Object.values(mesa).some(Array.isArray)) { console.error('\n✗ los bloques no dicen lo mismo: no se escribe nada hasta entender por qué'); process.exit(1); }

const largoDe = n => +(2 * (n * mesa.modW + (n - 1) * mesa.gapMod) + mesa.gapDrive).toFixed(3);

/* --- QUÉ BLOQUE ES CADA SEGUIDOR: por POSICIÓN, no por el nombre del tipo ---
   Es el convenio que ya usa extract_dwg_tracker_types.mjs, y aquí hace falta porque Ayora tiene
   107 seguidores en bloques ANÓNIMOS (*U9, *U10): el layout los dejó como "completo" a secas y por
   el nombre no hay manera. Emparejar por posición los resuelve uno a uno. */
const L = JSON.parse(readFileSync(RAIZ + planta + '_layout.json', 'utf8'));
const trk = L.trackers || [];
const insSeg = inserts.filter(e => medidos[e.name] || soloSolido.includes(e.name));
if (insSeg.length !== trk.length)
  console.log(`  ⚠ el DWG trae ${insSeg.length} INSERT de seguidor y el layout ${trk.length}`);
/* El desplazamiento entre los dos sistemas NO se saca del centroide: basta con que el DWG traiga
   un INSERT de más —Fayón trae 28 para 24 seguidores, cuatro son de la leyenda— para que el
   centroide se mueva y no empareje ni uno. Se prueban las traslaciones que llevan el primer
   seguidor a cada INSERT y se queda la que empareja más. */
function alinea() {
  let mejor = { dx: 0, dy: 0, n: -1 };
  const muestra = trk.slice(0, Math.min(8, trk.length));
  for (const t0 of muestra) for (const e0 of insSeg) {
    const dx = t0.x - e0.insertionPoint.x, dy = t0.n - e0.insertionPoint.y;
    let n = 0;
    for (const t of trk) {
      for (const e of insSeg) if (Math.abs(e.insertionPoint.x + dx - t.x) < 1 && Math.abs(e.insertionPoint.y + dy - t.n) < 1) { n++; break; }
    }
    if (n > mejor.n) mejor = { dx, dy, n };
    if (n === trk.length) return mejor;
  }
  return mejor;
}
const { dx, dy, n: nAlin } = alinea();
console.log(`  traslación DWG→layout ${dx.toFixed(3)} / ${dy.toFixed(3)}  (empareja ${nAlin}/${trk.length})`);
let peorEmp = 0, sinPareja = 0;
for (const t of trk) {
  let mejor = null, d = Infinity;
  for (const e of insSeg) { const q = Math.hypot(e.insertionPoint.x + dx - t.x, e.insertionPoint.y + dy - t.n); if (q < d) { d = q; mejor = e; } }
  if (d > 1) { sinPareja++; continue; }
  if (d > peorEmp) peorEmp = d;
  t.__blk = mejor.name;
}
console.log(`\n=== cada seguidor con su bloque (emparejado por posición) ===`);
console.log(`  ${trk.length - sinPareja}/${trk.length} emparejados · peor ${peorEmp.toFixed(3)} m` + (sinPareja ? ` · ${sinPareja} SIN PAREJA` : ''));
if (sinPareja) { console.error('  ✗ hay seguidores sin bloque: no se escribe nada'); process.exit(1); }

/* mods por ala de cada BLOQUE:
     1) medido, si el bloque es polilínea;
     2) del nombre (1Vnn / 4x32 / 2x32);
     3) por GEMELO: un bloque en 3DSOLID con exactamente el mismo número de entidades que otro ya
        resuelto es el mismo tipo de mesa. Es lo único que identifica a *U9 y *U10 de Ayora, y va
        marcado como derivado para que no pase por medido. */
const entDe = {}; for (const b of BR) if (usados[b.name]) entDe[b.name] = (b.entities || []).length;
const alaBloque = {}, comoSale = {};
for (const n of Object.keys(usados)) {
  if (medidos[n] && medidos[n].gapDrive != null) { alaBloque[n] = medidos[n].modsAla; comoSale[n] = 'medido'; continue; }
  const m1 = /1V(\d+)/i.exec(n); if (m1) { alaBloque[n] = +m1[1]; comoSale[n] = 'del nombre'; continue; }
  const m2 = /(\d+)x(\d+)/i.exec(n); if (m2) { alaBloque[n] = +m2[2] * (+m2[1] / 4); comoSale[n] = 'del nombre'; continue; }
}
for (const n of Object.keys(usados)) {
  if (alaBloque[n] != null) continue;
  const gemelo = Object.keys(alaBloque).find(k => entDe[k] === entDe[n]);
  if (gemelo) { alaBloque[n] = alaBloque[gemelo]; comoSale[n] = `DERIVADO: mismas ${entDe[n]} entidades que ${gemelo}`; }
}
console.log('\n=== módulos por ala de cada bloque ===');
const usadosSeg = [...new Set(trk.map(t => t.__blk))].sort();
for (const n of usadosSeg) {
  const a = alaBloque[n];
  console.log(`  ${n.padEnd(24)} x${String(trk.filter(t => t.__blk === n).length).padStart(4)}  ${a == null ? '⚠ SIN RESOLVER' : a + ' mód/ala → ' + largoDe(a) + ' m   (' + comoSale[n] + ')'}`);
}
if (usadosSeg.some(n => alaBloque[n] == null)) { console.error('  ✗ hay bloques sin resolver: no se escribe nada'); process.exit(1); }

const tipos = {};
for (const n of usadosSeg) {
  const m = medidos[n];
  const L2 = largoDe(alaBloque[n]);
  tipos[n] = { modsAla: alaBloque[n], largo: m ? m.largoMedido : L2, origen: comoSale[n],
               /* si el bloque no es medible se toma centrado, que es lo que son todos los medidos
                  salvo los de calibración */
               desde: m ? m.desde : -L2 / 2, hasta: m ? m.hasta : L2 / 2 };
}

/* --- COMPROBACIÓN 1: los largos tienen que caber en el layout --- */
console.log('\n=== comprobación contra el propio layout ===');
/* Columna = misma X con 0,5 m de tolerancia. Con la X exacta, San José no formaba ni una pareja
   (sus filas no caen clavadas en la misma abscisa) y la comprobación se saltaba entera. */
const col = {};
for (const t of trk) { const k = (Math.round(t.x * 2) / 2).toFixed(1); (col[k] = col[k] || []).push(t); }
let solapes = 0, pares = 0, peor = 0; const holguras = [];
for (const k of Object.keys(col)) {
  const v = col[k].sort((a, b2) => a.n - b2.n);
  for (let i = 1; i < v.length; i++) {
    const la = tipos[v[i - 1].__blk], lb = tipos[v[i].__blk];
    if (!la || !lb) continue;
    pares++;
    /* borde superior del de abajo vs borde inferior del de arriba, cada uno con SU envolvente */
    const hueco = +((v[i].n + lb.desde) - (v[i - 1].n + la.hasta)).toFixed(2);
    holguras.push(hueco);
    if (hueco < -0.02) { solapes++; if (-hueco > peor) peor = -hueco;
      console.log(`     · ${v[i-1].id} (${v[i-1].__blk}, ${la.largo} m) y ${v[i].id} (${v[i].__blk}, ${lb.largo} m): separados ${(v[i].n-v[i-1].n).toFixed(2)} m, se pisan ${(-hueco).toFixed(2)} m`); }
  }
}
console.log(`  ${pares} parejas de seguidores contiguos en la misma columna`);
/* Sin parejas no hay comprobación, y decir "no se solapa ninguna" habiendo mirado cero es un verde
   mentiroso: pasó en San José, cuyas columnas no caen en la misma X exacta. */
if (!pares) { console.error('  ✗ NO se ha podido comprobar: ninguna pareja de contiguos comparte columna (¿campo girado?)'); process.exit(1); }
console.log(`  ${solapes === 0 ? '✓ ninguna se solapa' : '✗ ' + solapes + ' se solapan, la peor ' + peor.toFixed(2) + ' m'}`);
if (solapes) { console.error('  con estas cotas las mesas se pisan: NO se escribe nada'); process.exit(1); }
/* COMPROBACIÓN 2: no basta con que no se pisen —unas mesas cortas tampoco se pisarían—. La holgura
   entre mesas contiguas tiene que ser la de diseño y repetirse; si los largos fueran cortos, la
   holgura más frecuente saldría inflada justo en lo que falta. */
const hc = {}; holguras.forEach(h => hc[h] = (hc[h] || 0) + 1);
const top = Object.entries(hc).sort((a, b2) => b2[1] - a[1]).slice(0, 4);
console.log(`  holgura entre mesas contiguas (m): ${top.map(([k, v]) => k + ' x' + v).join(' · ')}`);
console.log(`  la más repetida es ${top[0][0]} m en ${top[0][1]} de ${pares} parejas`);

/* COMPROBACIÓN 3, la más independiente de todas: contar los módulos que salen de esta taxonomía y
   comparar con el `cantidad` de la cartera, que viene de otro sitio. En Ayora esto es lo que fija
   qué son *U9 y *U10: con 21 y 14 por ala salen 73.976 módulos, que es EXACTAMENTE lo que dice la
   cartera; con cualquier otra combinación no sale. */
const filas = mesa.pasoFila ? 2 : 1;
let totMods = 0;
for (const t of trk) totMods += tipos[t.__blk].modsAla * 2 * filas;
console.log(`  módulos que salen de esta taxonomía: ${totMods.toLocaleString('es')}  (${filas} fila(s) x 2 alas por seguidor)`);

if (!WRITE) { console.log('\n(dry-run: pasa --write para escribirlo en ' + planta + '_layout.json)'); process.exit(0); }

L.trackers.forEach(t => { delete t.__blk; });
L.mesa = { ...mesa, filaZ: mesa.pasoFila != null ? +(mesa.pasoFila / 2).toFixed(4) : null, tipos,
           fuente: `medido en ${dwgPath.split('/').pop()} (bloques ${Object.keys(medidos).join(', ')})` };
writeFileSync(RAIZ + planta + '_layout.json', JSON.stringify(L));
console.log(`\nescrito ${planta}_layout.json → campo "mesa"`);
