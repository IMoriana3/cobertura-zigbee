/* Genera el bloque DEV de modbus.html a partir de los TRES documentos de fabricante.
 *
 * Antes el mapa estaba escrito a mano y le faltaban 225 direcciones; la pestaña de TCU, además, no
 * era el mapa de Sunner sino un modelo del gemelo digital, con direcciones que en el equipo real
 * significan otra cosa. Esto lo genera del documento, así que no se puede volver a desviar.
 *
 *   tools/modbus_src/ncu_r7_hsu_r23.json   <- extract_modbus_xlsx.py  (NCU_Modbus_Map_R7.xlsx + HSU R23)
 *   tools/modbus_src/ncu_r8.json           <- extract_modbus_xlsx.py  (NCU_Modbus_Map_R8.xlsx)
 *   tools/modbus_src/tcu_v6.json           <- extract_modbus_pdf.py   (SUNNER_TCU_ModbusMap_v6.pdf)
 *
 * LAS DOS REVISIONES DE LA NCU SE GUARDAN Y SE PUBLICAN LAS DOS. La tabla de la NCU es la
 * UNION de R7 y R8, y cada registro lleva de que revision es: sin marca = esta en las dos,
 * 'R8' = nuevo en el R8, 'R7' = estaba en el R7 y el R8 ya no lo trae, y ademas la lista de
 * lo que cambia cuando la misma direccion dice cosas distintas en cada una. La pagina filtra
 * por revision con un selector. No se sustituye una por otra porque en planta conviven: hay
 * NCUs con firmware R7 —y El Burgo va incluso por debajo—, y un registro que solo existe en
 * el R8 escrito contra una NCU R7 responde ilegal.
 *
 * Lo que el documento NO trae y sí aporta la herramienta (conversiones de unidad, escalas de
 * ingeniería) se conserva: CURADO[] lleva las que ya estaban validadas y se aplican por dirección.
 *
 * uso:  node tools/gen_modbus_map.mjs            (dry-run: informe)
 *       node tools/gen_modbus_map.mjs --write    (escribe modbus.html entre los marcadores)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const XL = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/ncu_r7_hsu_r23.json', 'utf8'));
const XL8 = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/ncu_r8.json', 'utf8'));
const PDF = JSON.parse(readFileSync(RAIZ + 'tools/modbus_src/tcu_v6.json', 'utf8'));
const WRITE = process.argv.includes('--write');

/* ---------- tipos y unidades ---------- */
const TIPO = t => {
  const T = String(t || '').trim().toUpperCase();
  if (T === 'TEXT') return 'text';
  if (T === 'BITSET') return 'u16';
  if (T === 'F32') return 'f32';
  if (T === 'U32') return 'u32';
  if (T === 'S32' || T === 'I32') return 's32';
  if (T === 'S16' || T === 'I16') return 's16';
  if (/^U(8|4|3|2|15|1)$/.test(T) || T === 'B' || T === 'BIT') return 'u16';
  return 'u16';
};
/* Unidad -> la cadena que ya entiende el decodificador de modbus.html (mV, mA, K×10, rad…).
   Lo que no case se muestra tal cual: mejor la unidad del documento que ninguna. */
const UNI = (u, esc) => {
  const U = String(u || '').trim();
  const E = String(esc || '').trim();
  const m = { 'Radians': 'rad', 'radians': 'rad', 'mV': 'mV', 'mA': 'mA', 'Joules': 'J', 'Pulses': 'pulsos',
    'ms': 'ms', 'seconds': 's', 'Seconds': 's', 'Minutes': 'min', 'Hours': 'h', 'days': 'días', 'Days': 'días',
    'Months': 'meses', 'Years': 'años', 'Meters': 'm', 'meters': 'm', '%': '%', 'B': 'bit', 'bit': 'bit',
    'Degrees/sec': '°/s', 'mdeg/sec': 'm°/s', '%/sec': '%/s', 'degrees': '°' };
  let s = m[U] !== undefined ? m[U] : U;
  if (/kelvin\s*x\s*10/i.test(U)) s = 'K×10';
  else if (/^kelvin$/i.test(U)) s = 'K';
  else if (/celsius/i.test(U)) s = '°C';
  else if (/Wm2x100/i.test(U)) s = 'W/m²×100';
  else if (/%\s*x\s*10/i.test(U)) s = '%×10';
  if (E && !/^x?1$/i.test(E)) s = (s ? s + ' ' : '') + '(escala ' + E + ')';
  return s;
};
/* Escala numérica SOLO cuando el documento la da sin ambigüedad (xN -> se divide por N).
   Las raras del PDF de la TCU (100/255, x0.816, 256/100) se dejan a 1 y su texto se ve en la
   unidad: inventar el sentido de una escala en un registro de mando es exactamente lo que no toca. */
const ESC = esc => { const m = String(esc || '').match(/^x\s*([\d.]+)$/i); return m ? 1 / parseFloat(m[1]) : 1; };

const bitsXL = s => { const m = String(s || '').match(/\((\d+)\.\.(\d+)\)/); return m ? [+m[2], +m[1]] : null; };
const bitsPDF = s => { const t = String(s || '').trim(); let m = t.match(/^(\d+):(\d+)$/); if (m) return [+m[2], +m[1]];
  m = t.match(/^(\d+)$/); return m ? [+m[1], +m[1]] : null; };
const esCompleto = b => !b || (b[0] === 0 && (b[1] === 15 || b[1] === 31 || b[1] === 7));

/* Nombre de registro a partir de la descripción: el PDF de la TCU NO trae columna de nombre de
   variable, solo la descripción. Se quita el "Set if the…" de relleno, que es como empieza casi
   todo bit de alarma y hacía que "…motor voltage lower than 22V" y "…greater than 33V" cayeran en
   el mismo nombre y uno se comiera al otro. Lo que aun así choque se desempata con su bit. */
const slug = (d, n) => {
  let t = String(d || '').toLowerCase().replace(/[’'"]/g, '')
    .replace(/^set\s+if\s+(the|a|an|it\s+is)?\s*/i, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  t = t.split('_').filter(Boolean).slice(0, n || 5).join('_');
  return t || 'reg';
};
const unico = (base, usados, lo) => {            // desempate estable: el propio bit
  let k = base; if (usados.has(k)) k = base + '_b' + lo;
  let i = 2; while (usados.has(k)) k = base + '_b' + lo + '_' + (i++);
  usados.add(k); return k;
};

/* ---------- agrupar filas del documento en registro padre + sus bits ---------- */
/* El documento declara bits «Reserved» sin nombre: son dato (ese bit está declarado y vacío) y
   por eso el extractor v2 ya no los tira, pero no se publican como subvariable — llenarían de
   chips «reservado» los registros de banderas sin decirle nada a quien mira la tabla. Viven en
   tools/modbus_src/*.json, que es la transcripción fiel del documento. */
const esReservado = f => f.nombre_doc === false && /^reserved$/i.test(String(f.desc || '').trim());
let RESERVADOS = 0;

function agrupaXL(filas, { quitaSufijo = true } = {}) {
  const out = []; let cur = null;
  for (const f of filas) {
    if (f.epigrafe) { out.push({ epigrafe: f.epigrafe }); continue; }   // título de bloque de la hoja
    if (esReservado(f)) { RESERVADOS++; continue; }
    /* La hoja «TCU Compat» repite un campo con sufijo de OTRA unidad (StateOfCharge_s22) para
       enseñar el paso del bloque. No es una subvariable: si se cuela, sale como un bit fantasma.
       PERO las unidades se numeran desde 1, asi que _s0 no es «otra unidad»: es una errata del
       documento por _s1. Descartarlo tambien se llevaba por delante SafePositionState_s0, los
       bits 15..13 del MSR — la posicion segura activa de cada TCU, que es justo lo que se mira
       cuando la planta esta en viento. Solo se descarta de _s2 en adelante. */
    const otraUnidad = String(f.nombre).match(/_(?:s|hsu)(\d+)$/i);
    if (otraUnidad && +otraUnidad[1] >= 2 && (f.addr === null || f.addr === '')) continue;
    const tieneAddr = f.addr !== null && f.addr !== '' && !isNaN(+f.addr);
    const nom = quitaSufijo ? String(f.nombre).replace(/_(s|hsu)\d+$/i, '') : String(f.nombre);
    if (tieneAddr) { cur = { addr: +f.addr, nombre: nom, tipo: f.tipo, bits: f.bits, desc: f.desc,
        acc: f.acc, unidad: f.unidad, escala: '', rango: f.rango, defecto: f.defecto, hijos: [] };
      out.push(cur); continue; }
    if (!cur) continue;
    /* Subvariable que el fabricante describe pero deja SIN nombre (el extractor le puso
       MSR_s1.b11). Para la tabla se deriva del propio texto del documento —igual que se hace con
       todo el mapa de la TCU, cuyo PDF tampoco trae columna de nombre—, que es lo que sirve a
       quien lee: «magnet_presence [11]» y no «MSR_s1.b11». El nombre sintetizado sigue en el JSON. */
    const nomH = (f.nombre_doc === false && f.desc) ? slug(f.desc, 4) : nom;
    cur.hijos.push({ nombre: nomH, bits: bitsXL(f.bits), desc: f.desc, tipo: f.tipo, unidad: f.unidad,
                     rango: f.rango, defecto: f.defecto, sinNombre: f.nombre_doc === false });
  }
  return out;
}
/* ---------- fusion de dos revisiones del MISMO documento ----------
   Devuelve la UNION de los registros del R7 y del R8 en orden de direccion, cada uno con:
     _rev  null  el registro esta igual en las dos revisiones
           'R8'  nuevo en el R8 (no existia en el R7)
           'R7'  estaba en el R7 y el R8 ya no lo trae
     _chg  [[campo, valorR7, valorR8], …] cuando la MISMA direccion dice cosas distintas.
   Ese ultimo caso es el peligroso y por eso se marca registro a registro: una direccion que
   sigue existiendo y ha cambiado de significado se lleva por delante a un maestro ya escrito
   sin dar ningun error (es lo que paso con la pestaña de la TCU). El cuerpo que se publica es
   el del R8 salvo en los que solo trae el R7. */
const nrm = x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
const firmaBits = r => (r.hijos || []).map(h => h.nombre + (h.bits ? '[' + h.bits.join('..') + ']' : '') + '=' + nrm(h.desc)).join(' · ');
function comparaReg(a, b, { bits = true } = {}) {
  const dif = [];
  const campos = [['nombre', 'nombre'], ['descripción', 'desc'], ['tipo', 'tipo'], ['unidad', 'unidad'],
                  ['acceso', 'acc'], ['rango', 'rango'], ['por defecto', 'defecto']];
  for (const [et, k] of campos) if (nrm(a[k]) !== nrm(b[k])) dif.push([et, nrm(a[k]), nrm(b[k])]);
  if (bits && firmaBits(a) !== firmaBits(b)) dif.push(['subvariables', firmaBits(a) || '—', firmaBits(b) || '—']);
  return dif;
}
function fusiona(r7, r8, etiq, { bits = true } = {}) {
  /* La clave NO puede ser la direccion a secas: el documento repite direccion en el solape
     conocido de 30513 (StateOfCharge U8 y RemainingCapacity U16 declarados los dos ahi). Con la
     direccion sola, el segundo pisaba al primero y la fusion cantaba un cambio de significado
     donde las dos revisiones dicen exactamente lo mismo. La clave lleva ademas cuantas veces ha
     salido ya esa direccion en la hoja, asi el n-esimo registro de una direccion se compara con
     el n-esimo de la otra revision.
     Los EPIGRAFES no son registros: pasan de largo, en su sitio, sin compararse ni contarse. */
  const indexa = regs => { const cuenta = new Map(), m = new Map();
    for (const r of regs) { if (r.epigrafe) continue;
      const n = (cuenta.get(r.addr) || 0) + 1; cuenta.set(r.addr, n);
      r._k = r.addr + '#' + n; m.set(r._k, r); }
    return m; };
  const A = indexa(r7), B = indexa(r8);
  const out = [], pendientes = [...A.keys()].filter(k => !B.has(k));
  const suelta = (r, rev, chg) => { const c = Object.assign({}, r); c._rev = rev || null;
    if (chg && chg.length) c._chg = chg; out.push(c); };
  for (const r of r8) {
    if (r.epigrafe) { out.push(r); continue; }
    /* lo que el R7 traia por debajo de esta direccion y el R8 ya no trae, en su sitio */
    while (pendientes.length && A.get(pendientes[0]).addr < r.addr) suelta(A.get(pendientes.shift()), 'R7');
    const a = A.get(r._k);
    if (!a) suelta(r, 'R8'); else suelta(r, null, comparaReg(a, r, { bits }));
  }
  while (pendientes.length) suelta(A.get(pendientes.shift()), 'R7');
  const n8 = out.filter(r => r._rev === 'R8').length, n7 = out.filter(r => r._rev === 'R7').length,
        nc = out.filter(r => r._chg).length;
  INFORME.push(`  ${etiq}: ${out.filter(r => !r.epigrafe).length} registros · ${n8} nuevos en R8 · ${n7} solo en R7 · ${nc} con la misma dirección cambiada`);
  for (const r of out) if (r._chg) CAMBIOS.push({ hoja: etiq, addr: r.addr, nombre: r.nombre, dif: r._chg });
  return out;
}
const INFORME = [], CAMBIOS = [];

function agrupaPDF(filas) {
  const out = []; const porAddr = new Map(), usados = new Map();
  for (const f of filas) {
    const b = bitsPDF(f.bits);
    let cur = porAddr.get(f.addr);
    if (!cur) { cur = { addr: f.addr, nombre: null, tipo: f.tipo, bits: f.bits, desc: '', acc: '',
        unidad: f.unidad, escala: f.escala, rango: f.rango, defecto: f.defecto, cat: f.cat, hijos: [] };
      porAddr.set(f.addr, cur); out.push(cur); usados.set(f.addr, new Set()); }
    if (cur.nombre === null && esCompleto(b)) {              // fila padre: la que ocupa el registro entero
      /* Ocho registros del PDF traen la celda de descripción VACÍA (41060, 41062, 42005…). No se
         inventa nada, pero el nombre no puede ser 'reg' en los ocho: se distinguen por dirección. */
      cur.nombre = f.desc ? slug(f.desc, 4) : ('reg_' + f.addr);
      cur.desc = f.desc; cur.tipo = f.tipo; cur.unidad = f.unidad;
      cur.escala = f.escala; cur.defecto = f.defecto; cur.rango = f.rango; cur.cat = f.cat;
    } else {
      const lo = b ? b[0] : '?';
      cur.hijos.push({ nombre: unico(slug(f.desc), usados.get(f.addr), lo), bits: b, desc: f.desc,
        tipo: f.tipo, unidad: f.unidad, rango: f.rango, defecto: f.defecto });
    }
  }
  for (const r of out) if (r.nombre === null) {              // sin fila de registro entero: se usa el primer hijo
    const h = r.hijos.shift(); r.nombre = (h && h.desc) ? h.nombre : ('reg_' + r.addr); r.desc = h ? h.desc : '';
  }
  return out;
}

/* ---------- donde el DOCUMENTO se contradice a si mismo ----------
   Dos sitios del R8 (y del R7: son las mismas filas) no pueden ser verdad tal como estan escritos.
   Copiarlos tal cual mete en la tabla bits que se pisan; resolverlos en silencio es peor, porque
   entonces la herramienta afirma algo que su documento no dice. Se hace lo que ya se hizo con el
   41106 de la TCU: se publica la lectura coherente CUANDO la hay, se dice que es nuestra, y
   cuando no la hay se enseña el conflicto sin elegir.

   Esto NO es una correccion del documento: es la unica forma de que la tabla no mienta en
   ninguno de los dos sentidos. Si Sunner aclara cualquiera de las dos, se quita de aqui. */
const CONTRADICCIONES = {
  30501: {
    /* El Excel de la NCU pone «Magnet Presence» como U1 en (12..11) —dos bits para un tipo de
       UNO— y «BLE Enabled» como U2 en (13..12), que ademas pisa el bit 13, ya asignado a
       SafePositionState (15..13). No hay que adivinar: este registro es el MISMO que la TCU
       publica en su 30001 (Main status register) de su propio PDF v6, y alli esta sin ambiguedad
       —bit 11 imán (reed sensor), bit 12 BLE—, ademas de coincidir bit a bit en dia/noche (7),
       modo (9:8) y posicion segura (15:13). Se publica lo que dicen los dos documentos cuando
       se leen juntos, y se dice de donde sale. */
    bits: { magnet_presence: [11, 11], ble_enabled: [12, 12] },
    porBit: {
      magnet_presence: 'el Excel de la NCU lo declara U1 en (12..11), dos bits para un tipo de uno; el PDF v6 de la TCU lo sitúa en el bit 11 de su 30001 (mismo registro) — se publica el 11',
      ble_enabled: 'el Excel de la NCU lo declara U2 en (13..12), pisando el bit 13 de SafePositionState; el PDF v6 de la TCU lo sitúa en el bit 12 de su 30001 (mismo registro) — se publica el 12' },
    nota: '⚠ 30501 (MSR): el Excel de la NCU declara «Magnet Presence» U1 en (12..11) y «BLE Enabled» U2 en (13..12), que se pisan entre sí y con SafePositionState (15..13). Se publican en los bits 11 y 12 porque es donde los pone el PDF v6 de la TCU para este mismo registro (su 30001), que además coincide en día/noche, modo y posición segura. Aviso aparte: ese PDF sitúa «backtracking activo» en el bit 1 y el Excel de la NCU en el bit 0 — ahí los dos documentos NO concuerdan y se publica lo que dice el Excel de la NCU, que es el documento de esta tabla.'
  },
  30504: {
    /* El Excel de la NCU declara el bit 10 DOS VECES: FlagBatteryHeaterEnabled («battery heater
       is on») y ChargeBlockMotor («battery relaxation is active»). El mismo registro es el 30006
       del PDF v6 de la TCU —coinciden literalmente los bits 0, 1, 6, 11 y 15—, y alli el
       calentador esta en el bit 9 y la relajacion en el 10. Asi que el duplicado es del Excel:
       el calentador se publica en el 9, con la etiqueta diciendo lo que el Excel dice. */
    bits: { FlagBatteryHeaterEnabled: [9, 9] },
    porBit: {
      FlagBatteryHeaterEnabled: 'el Excel de la NCU lo declara en el bit 10, donde ya está ChargeBlockMotor; el PDF v6 de la TCU lo sitúa en el bit 9 de su 30006 (mismo registro) — se publica el 9',
      ChargeBlockMotor: 'bit 10 según los dos documentos (30006 del PDF v6 de la TCU); el Excel de la NCU declaraba aquí también el calentador, que va al bit 9' },
    nota: '⚠ 30504 (FlagsA): el Excel de la NCU declara el bit 10 dos veces — calentador de batería y relajación de batería. El PDF v6 de la TCU, que trae este mismo registro en su 30006 y coincide literalmente en los bits 0, 1, 6, 11 y 15, pone el calentador en el bit 9 y la relajación en el 10. Se publica así.'
  }
};
const AVISOS_DOC = new Map();      // dirección -> nota, para colgarla de la sección donde vive
function aplicaContradicciones(regs) {
  for (const r of regs) {
    const c = CONTRADICCIONES[r.addr]; if (!c) continue;
    AVISOS_DOC.set(r.addr, c.nota);
    for (const h of (r.hijos || [])) {
      if (c.bits && c.bits[h.nombre]) h.bits = c.bits[h.nombre];
      if (c.porBit && c.porBit[h.nombre]) h.desc = (h.desc ? h.desc + ' · ' : '') + c.porBit[h.nombre];
    }
  }
  return regs;
}

/* ---------- conversiones ya validadas en la herramienta, por dirección ---------- */
/* Son las que el documento no da y sí estaban comprobadas contra registros reales. Se aplican
   ENCIMA de lo generado; si el documento trae unidad, gana la del documento salvo aquí. */
const CURADO = {
  ncu: { 30506: { un: 'rad → °' }, 30510: { un: 'rad → °' } },
  hsu: {},
  // 41106: el manual v6.1 dice «Radians / def 0 / 0..π/4», pero es un ARRASTRE
  // de celdas de la fila 41102 (East grade slope), cuatro direcciones arriba:
  // su gemelo 41033 (West pitch) va en Meters con defecto 9, y un pitch de 0
  // con máximo π/4≈0,79 no es una separación entre ejes. CERRADO EN CAMPO:
  // Ayora lee 6 en ese registro y su levantamiento mide 6,002 m de pitch —
  // como radianes serían 344°, imposible en un campo cuyo máximo declarado es
  // 45°. La etiqueta lleva las DOS cosas: lo que el equipo usa y lo que el
  // documento dice, para no dejar de reproducir el documento ni dejar que
  // nadie escriba radianes en un seguidor.
  tcu: { 41106: { un: 'm (doc: rad, errata)' } }
};

/* Qué documento se está construyendo. CURADO se consulta SOLO en su cubo:
   ver la nota en `seccion`. */
let DEV = 'ncu';

/* ---------- construcción de una sección ---------- */
function seccion(t, sn, rw, regs, { base = null, stride = null, offsetDe = null, max = null } = {}) {
  const f = regs.filter(r => !r.epigrafe).map(r => {
    const bits = {}, bdesc = {};
    for (const h of r.hijos) if (h.bits) { bits[h.nombre] = h.bits; if (h.desc) bdesc[h.nombre] = h.desc; }
    // por DISPOSITIVO, no solo por dirección: los tres mapas comparten rangos
    // y consultar los tres cubos a la vez hacía que una curación de la TCU se
    // aplicara al registro que la HSU tiene en esa misma dirección (pasó con
    // el 41106: pisó el «meters/second» de la HSU)
    const cur = (CURADO[DEV] || {})[r.addr] || {};
    const un = cur.un || UNI(r.unidad, r.escala);
    /* El valor por defecto y el rango van como CAMPOS, no metidos dentro del texto. Antes se
       concatenaban a la descripcion y ahi no servian para nada: son 361 valores por defecto y 440
       rangos de los tres documentos, que es justo lo que hace falta para comparar una unidad contra
       fabrica y para avisar de que un valor compuesto se sale de lo que el documento admite. */
    const dir = (offsetDe !== null) ? (r.addr - offsetDe) : r.addr;
    const lim = (r.rango && r.rango !== 'None') ? String(r.rango).trim() : null;
    const def = (r.defecto && r.defecto !== 'None') ? String(r.defecto).trim() : null;
    const fila = [dir, r.nombre, TIPO(r.tipo), un, Object.keys(bits).length ? bits : null,
            ESC(r.escala), null, r.desc || '', (r.acc || '').toUpperCase() || null,
            Object.keys(bdesc).length ? bdesc : null, def, lim];
    /* 12 = revision, 13 = lo que cambia entre revisiones. Solo se escriben en los registros que
       NO estan igual en las dos: asi los mapas de un solo documento (TCU, HSU) salen tal cual
       estaban y el diff de modbus.html se queda en lo que de verdad ha cambiado. */
    if (r._rev || r._chg) { fila.push(r._rev || null); if (r._chg) fila.push(r._chg); }
    return fila;
  });
  /* Las contradicciones del documento se ven en el subtítulo de la sección, no solo en el
     «title» de un chip: quien mira la tabla tiene que tropezar con ellas sin pasar el ratón. */
  const avisos = regs.filter(r => AVISOS_DOC.has(r.addr)).map(r => AVISOS_DOC.get(r.addr));
  const s = { t, sn: sn + (avisos.length ? ' · ' + [...new Set(avisos)].join(' ') : ''), rw, f };
  if (base !== null) { s.base = base; s.stride = stride; s.max = max; }   // max = cuántas unidades tiene el bloque, del R7 (hoja Overview)
  return s;
}
const entre = (regs, a, b) => regs.filter(r => !r.epigrafe && r.addr >= a && r.addr <= b);

/* Los EPIGRAFES de la hoja son sus propios títulos de bloque («Change Safe Position 7 (Custom)
   target angle»), y son el contexto de los registros que los siguen: el R8 mete diez registros
   nuevos bajo uno de ellos. Partir la hoja por sus epígrafes deja que la tabla los enseñe como
   secciones con el título del fabricante, en vez de amontonarlo todo bajo un rótulo nuestro. */
function porEpigrafe(regs) {
  const grupos = []; let g = null;
  for (const r of regs) {
    if (r.epigrafe) { g = { t: r.epigrafe, regs: [] }; grupos.push(g); continue; }
    if (!g) { g = { t: null, regs: [] }; grupos.push(g); }
    g.regs.push(r);
  }
  return grupos.filter(x => x.regs.length);
}

/* Los `eti:` de los tres equipos son los NOMBRES DEL FABRICANTE, puestos por Ignacio (31-08,
   ediciones web sobre modbus.html): Network Control Unit, Tracker Control Unit y Hub Sensor Unit.
   Van AQUI y no solo en el html porque este bloque se regenera y una edicion a mano alli no
   sobrevive a la siguiente pasada — es justo lo que paso. */

/* ================= NCU ================= */
/* ¿SON COMPARABLES BIT A BIT LAS DOS EXTRACCIONES?
   El R7 se extrajo con la v1 del extractor, que tiraba las filas sin «Variable name» — entre
   ellas cuatro subvariables descritas del MSR y de FlagsA. El R8 va con la v2, que las conserva.
   Comparar los bits de las dos extracciones diria que el R8 «cambia» esos dos registros, y es
   MENTIRA: lo que cambio fue nuestro extractor, no el documento. Mientras no se vuelva a extraer
   el R7 con la v2 —hace falta el NCU_Modbus_Map_R7.xlsx, que no esta en el repo—, la fusion
   compara todo MENOS los bits, y lo dice en voz alta en vez de publicar un cambio inventado. */
const EXTRACTOR_R7 = XL.extractor || 1, EXTRACTOR_R8 = XL8.extractor || 1;
const BITS_COMPARABLES = EXTRACTOR_R7 === EXTRACTOR_R8;
const hojaNCU = (h, o) => aplicaContradicciones(
  fusiona(agrupaXL(XL.ncu_r7[h], o), agrupaXL(XL8.ncu_r8[h], o), h, { bits: BITS_COMPARABLES }));
const nInfo = hojaNCU('NCU Info');
const nRW = hojaNCU('NCU RW registers');
const nTCUc = hojaNCU('TCU Compat');
const nTCU = hojaNCU('TCU');
const nHSU = hojaNCU('HSU');
const nHSUx = hojaNCU('HSU EXT');

DEV = 'ncu';
const NCU = [
  seccion('Identidad', 'hoja «NCU Info» · el documento numera estas tres SIN el prefijo 3xxxx', 'ro', entre(nInfo, 0, 999)),
  seccion('Registros propios', 'hoja «NCU Info» · direcciones absolutas · una NCU por planta', 'ro', entre(nInfo, 30000, 30199)),
  ...porEpigrafe(nRW).map(g => seccion(
    g.t ? 'Comandos · ' + g.t : 'Comandos y forzados',
    'hoja «NCU RW registers»' + (g.t ? ' · epígrafe del propio documento' : '') + ' · ESCRITURA sobre la planta entera',
    'w', g.regs)),
  seccion('Bloque TCU (republicado)', 'hoja «TCU Compat» · base 30500 · 22 registros/TCU · hasta 200 TCU · lastComm 29500+(id−1)·2', 'ro',
    entre(nTCUc, 30500, 30599), { base: 30500, stride: 22, offsetDe: 30500, max: 200 }),
  seccion('TCU · último contacto', 'hoja «TCU Compat» · base 29500 · 2 registros/TCU', 'ro',
    entre(nTCUc, 29500, 29599), { base: 29500, stride: 2, offsetDe: 29500, max: 200 }),
  seccion('Bloque TCU completo', 'hoja «TCU» · base 50000 · 50 registros/TCU · 256 unidades (hoja Overview) · el mapa entero de cada seguidor a través de la NCU', 'ro',
    nTCU, { base: 50000, stride: 50, offsetDe: 50000, max: 256 }),
  seccion('Bloque HSU básico (republicado)', 'hoja «HSU» · base 30200 · 10 registros/HSU', 'ro',
    entre(nHSU, 30200, 30299), { base: 30200, stride: 10, offsetDe: 30200, max: 10 }),
  seccion('HSU · marcas de tiempo', 'hoja «HSU» · lastValidSnow 29320 · lastValidWind 29380 · lastComm 29440 · 2 registros/HSU', 'ro',
    entre(nHSU, 29000, 29499)),
  /* «EXT» = mapa EXTENDIDO, no «HSUs exteriores». Lo dice la propia hoja: repite los MISMOS
     registros de la misma estación que el bloque básico —ProductId_hsu1, MSR_hsu1, WindLevel_hsu1,
     Alarms1_hsu1…— en otra base y con MÁS campos (piranómetro, compensación de temperatura, racha,
     errores RS485 por sensor). Si fueran otra clase de estación no repetiría los campos de _hsu1. */
  seccion('Bloque HSU extendido (republicado)', 'hoja «HSU EXT» · mapa AMPLIADO de la misma estación, no otra clase de HSU: repite el básico y añade piranómetros · base 28000 · 100 registros/HSU · solo con hsu_extended', 'ro',
    nHSUx, { base: 28000, stride: 100, offsetDe: 28000, max: 10 }),
];

/* ================= TCU (PDF v6, FW 1.4.3) ================= */
const t = agrupaPDF(PDF);
DEV = 'tcu';
const TCU = [
  seccion('Estado, alarmas y tiempo', 'PDF v6 · 30000–30006 estado y alarmas · 30010–30031 movimiento y red', 'ro', entre(t, 30000, 30075)),
  seccion('Medidas', 'PDF v6 · motor, bus, panel, batería y temperaturas', 'ro', entre(t, 30076, 30109)),
  seccion('Calculados e información', 'PDF v6 · ángulos calculados, contadores y estado del sistema', 'ro', entre(t, 30110, 30299)),
  seccion('Información estática', 'PDF v6 · 30300+ · identidad, versiones y número de serie', 'ro', entre(t, 30300, 30399)),
  seccion('Comandos y puesta en hora', 'PDF v6 · 40000–40043 · ESCRITURA sobre el seguidor', 'w', entre(t, 40000, 40999)),
  seccion('Configuración', 'PDF v6 · 41004–41137 · ESCRITURA · parámetros de control, motor y comunicaciones', 'w', entre(t, 41000, 41999)),
  seccion('Mando y configuración extra', 'PDF v6 · 42000+ · ESCRITURA', 'w', entre(t, 42000, 42999)),
];

/* ================= HSU (mapa propio R23 + republicados del R7) ================= */
const hR23 = agrupaXL(XL.hsu_r23['Sheet1'], { quitaSufijo: false });
DEV = 'hsu';
const HSU = [
  seccion('Identidad, estado y medidas', 'R23 · registros de entrada — producto, MSR, alarmas, viento, nieve, batería', 'ro', entre(hR23, 30000, 30999)),
  seccion('Bloque 31000', 'R23', 'ro', entre(hR23, 31000, 35999)),
  seccion('Bloque 36760', 'R23', 'ro', entre(hR23, 36000, 39999)),
  seccion('Comandos', 'R23 · ESCRITURA: actúan sobre la estación', 'w', entre(hR23, 40000, 40999)),
  seccion('Configuración', 'R23 · ESCRITURA', 'w', entre(hR23, 41000, 49999)),
  seccion('Bloque 50026', 'R23', 'w', entre(hR23, 50000, 50999)),
  seccion('Calibración / fábrica', 'R23 · ESCRITURA: no tocar en planta sin instrucción del fabricante', 'w', entre(hR23, 51000, 99999)),
  seccion('Bloque básico vía NCU (republicado)', 'en la NCU · base 30200 · 10 registros/HSU', 'ro',
    entre(nHSU, 30200, 30299), { base: 30200, stride: 10, offsetDe: 30200, max: 10 }),
  seccion('Marcas de tiempo vía NCU', 'en la NCU · lastValidSnow 29320 · lastValidWind 29380 · lastComm 29440 · 2 registros/HSU', 'ro',
    entre(nHSU, 29000, 29499)),
  seccion('Bloque extendido vía NCU (piranómetros)', 'en la NCU · «HSU EXT»: mapa ampliado de la misma estación, no otra clase de HSU · base 28000 · 100 registros/HSU · solo con hsu_extended', 'ro',
    nHSUx, { base: 28000, stride: 100, offsetDe: 28000, max: 10 }),
];

/* ---------- reparto del espacio de direcciones (hoja «Overview») ----------
   Se publica el del R8, que es la revision vigente. Si alguna vez las dos no reparten igual el
   espacio, un hueco «reservado» de una seria un bloque con registros de la otra: eso NO puede
   pasar en silencio, asi que se avisa aqui y sale en el informe. */
const mapaBloques = l => (l || []).map(b => ({ de: b.de, a: b.a, n: b.nombre,
  res: /^reserved/i.test(b.nombre), lib: b.libre || null }));
const B7 = mapaBloques(XL.bloques_r7), B8 = mapaBloques(XL8.bloques_r8);
const BLOQUES = B8.length ? B8 : B7;
const bloquesIguales = JSON.stringify(B7) === JSON.stringify(B8);
if (!bloquesIguales) INFORME.push('  ⚠ la hoja «Overview» NO reparte igual el espacio en R7 y R8: ' +
  `R7 ${B7.length} bloques · R8 ${B8.length}. Se publica el del R8 — revisa los huecos reservados.`);

/* ---------- salida ---------- */
const cuenta = secs => secs.reduce((n, s) => n + s.f.length, 0);
const js = o => JSON.stringify(o).replace(/"([A-Za-z_$][A-Za-z0-9_$]*)":/g, '$1:');

const bloque =
`/* ==================================================================================
   MAPA GENERADO — no editar a mano. Sale de tools/gen_modbus_map.mjs a partir de los
   documentos del fabricante:
     NCU  NCU_Modbus_Map_R7.xlsx y NCU_Modbus_Map_R8.xlsx  — LAS DOS REVISIONES, fusionadas
          (hojas NCU Info · NCU RW registers · TCU Compat · TCU · HSU · HSU EXT)
     TCU  SUNNER_TCU_ModbusMap_v6.pdf (FW v1.4.3)
     HSU  250506_HSU_Modbus_Map_R23.xlsx
   Para regenerar:  node tools/gen_modbus_map.mjs --write
   La tabla de la NCU es la UNION del R7 y del R8. Campo 12 de cada fila = revisión: ausente o
   null si el registro está igual en las dos, 'R8' si es nuevo del R8, 'R7' si el R8 ya no lo
   trae. Campo 13 = qué cambia cuando la misma dirección dice cosas distintas en cada revisión.
   La página filtra por revisión (selector «revisión» de la pestaña NCU).
   La pestaña de TCU llevaba un mapa que NO era el de Sunner (venía del modelo del gemelo
   digital): sus direcciones significan otra cosa en el equipo real. Ver TRASPASO_MODBUS.md.
   Los nombres de registro de la TCU se derivan de su descripción porque el PDF de Sunner
   no trae columna de nombre de variable; la descripción va literal en su columna.
   ================================================================================== */
/* Reparto COMPLETO del espacio de direcciones, de la hoja «Overview» (R7 y R8 lo reparten igual;
   si dejaran de hacerlo, el generador avisa). Sirve para que una dirección que no cae en ningún
   registro diga QUE es (hueco reservado, rango libre, o de qué bloque) en vez de un «no existe». */
var BLOQUES=${js(BLOQUES)};
var DEV={
 ncu:{tab:'NCU',eti:'Network Control Unit',max:0,revs:['R8','R7'],revAl:'R8',
  nota:'El servidor Modbus de la planta (NCU_Modbus_Map_R7 y R8): sus registros propios, los forzados de posición segura y los bloques donde republica cada TCU y cada HSU que gestiona. Se guardan <b>las dos revisiones</b>: el selector de arriba elige cuál se ve, y en «ambas» los registros llevan de qué revisión son. En planta conviven, así que un registro que solo trae el R8 escrito contra una NCU R7 responde ilegal. <b>Cinco subvariables volvieron a la tabla</b> al arreglar el extractor: la posición segura activa del MSR y, sin bautizar en el documento, el imán y el BLE (MSR) y dos banderas de batería (FlagsA) — estaban en los dos documentos y no llegaban aquí.',
  secs:${js(NCU)}},

 tcu:{tab:'TCU',eti:'Tracker Control Unit',max:0,idlab:'Nº TCU',
  nota:'El mapa <b>propio del seguidor</b> (SUNNER_TCU_ModbusMap v6, FW v1.4.3), por RTU a 19200 8E1, ID de fábrica 245. Funciones admitidas: 03/04 lectura, 06 escritura simple, 16 múltiple, 22 máscara — <b>no hay coils ni entradas discretas</b>. Las secciones de ESCRITURA mueven el seguidor: cuidado en planta.',
  secs:${js(TCU)}},

 hsu:{tab:'HSU',eti:'Hub Sensor Unit',max:10,idlab:'Nº HSU',
  nota:'El mapa <b>propio del dispositivo</b> (HSU_Modbus_Map_R23): identidad, estado, medidas, comandos, configuración y calibración. Al final, los dos bloques donde la NCU lo republica (con el selector de unidad). Las secciones de ESCRITURA cambian la estación: cuidado en planta.',
  secs:${js(HSU)}}
};`;

console.log('\nNCU · fusión de revisiones R7 + R8');
if (!BITS_COMPARABLES) console.log(
  `  ⚠ el R7 está extraído con el extractor v${EXTRACTOR_R7} y el R8 con el v${EXTRACTOR_R8}: NO se comparan\n` +
  '    las subvariables (la v1 tiraba las filas sin «Variable name»). Las direcciones sí se comparan.\n' +
  '    Para cerrarlo hace falta volver a extraer el R7 con el extractor actual.');
if (RESERVADOS) console.log(`  ${RESERVADOS} bits/registros «Reserved» del documento quedan en el JSON y fuera de la tabla`);
for (const l of INFORME) console.log(l);
if (CAMBIOS.length) {
  console.log('  ⚠ MISMA DIRECCIÓN, DISTINTO QUÉ ES — revisar antes de publicar:');
  for (const c of CAMBIOS) console.log(`     ${c.hoja} ${c.addr} ${c.nombre}: ` +
    c.dif.map(d => `${d[0]} «${d[1] || '—'}» → «${d[2] || '—'}»`).join(' · '));
}
const cuentaRev = (secs, v) => secs.reduce((n, s) => n + s.f.filter(r => r[12] === v).length, 0);
console.log(`  publicado: ${cuenta(NCU)} registros · ${cuentaRev(NCU, 'R8')} marcados nuevos del R8 · ${cuentaRev(NCU, 'R7')} solo del R7\n`);
console.log('NCU  secciones', NCU.length, '· registros', cuenta(NCU));
console.log('TCU  secciones', TCU.length, '· registros', cuenta(TCU));
console.log('HSU  secciones', HSU.length, '· registros', cuenta(HSU));
console.log('TOTAL registros:', cuenta(NCU) + cuenta(TCU) + cuenta(HSU));
const conDesc = [...NCU, ...TCU, ...HSU].reduce((n, s) => n + s.f.filter(r => r[7]).length, 0);
console.log('con descripción del documento:', conDesc);

if (!WRITE) { console.log('\n(dry-run: pasa --write para escribir modbus.html)'); process.exit(0); }
const F = RAIZ + 'modbus.html';
let h = readFileSync(F, 'utf8');
const A = '/* @@MAPA_INICIO@@ */', B = '/* @@MAPA_FIN@@ */';
const i = h.indexOf(A), j = h.indexOf(B);
if (i < 0 || j < 0) { console.error('Faltan los marcadores @@MAPA_INICIO@@ / @@MAPA_FIN@@ en modbus.html'); process.exit(1); }
h = h.slice(0, i + A.length) + '\n' + bloque + '\n' + h.slice(j);
writeFileSync(F, h);
console.log('\nescrito modbus.html');
