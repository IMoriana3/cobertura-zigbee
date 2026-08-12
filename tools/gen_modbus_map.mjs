/* Genera el bloque DEV de modbus.html a partir de los TRES documentos de fabricante.
 *
 * Antes el mapa estaba escrito a mano y le faltaban 225 direcciones; la pestaña de TCU, además, no
 * era el mapa de Sunner sino un modelo del gemelo digital, con direcciones que en el equipo real
 * significan otra cosa. Esto lo genera del documento, así que no se puede volver a desviar.
 *
 *   tools/modbus_src/ncu_r7_hsu_r23.json   <- extract_modbus_xlsx.py  (NCU_Modbus_Map_R7.xlsx + HSU R23)
 *   tools/modbus_src/tcu_v6.json           <- extract_modbus_pdf.py   (SUNNER_TCU_ModbusMap_v6.pdf)
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
function agrupaXL(filas, { quitaSufijo = true } = {}) {
  const out = []; let cur = null;
  for (const f of filas) {
    /* La hoja «TCU Compat» repite un campo con sufijo de OTRA unidad (StateOfCharge_s22) para
       enseñar el paso del bloque. No es una subvariable: si se cuela, sale como un bit fantasma. */
    if (/_(s|hsu)\d+$/i.test(String(f.nombre)) && !/_(s|hsu)1$/i.test(String(f.nombre))
        && (f.addr === null || f.addr === '')) continue;
    const tieneAddr = f.addr !== null && f.addr !== '' && !isNaN(+f.addr);
    const nom = quitaSufijo ? String(f.nombre).replace(/_(s|hsu)\d+$/i, '') : String(f.nombre);
    if (tieneAddr) { cur = { addr: +f.addr, nombre: nom, tipo: f.tipo, bits: f.bits, desc: f.desc,
        acc: f.acc, unidad: f.unidad, escala: '', rango: f.rango, defecto: f.defecto, hijos: [] };
      out.push(cur); continue; }
    if (!cur) continue;
    cur.hijos.push({ nombre: nom, bits: bitsXL(f.bits), desc: f.desc, tipo: f.tipo, unidad: f.unidad, rango: f.rango, defecto: f.defecto });
  }
  return out;
}
function agrupaPDF(filas) {
  const out = []; const porAddr = new Map(), usados = new Map();
  for (const f of filas) {
    const b = bitsPDF(f.bits);
    let cur = porAddr.get(f.addr);
    if (!cur) { cur = { addr: f.addr, nombre: null, tipo: f.tipo, bits: f.bits, desc: '', acc: '',
        unidad: f.unidad, escala: f.escala, rango: f.rango, defecto: f.defecto, cat: f.cat, hijos: [] };
      porAddr.set(f.addr, cur); out.push(cur); usados.set(f.addr, new Set()); }
    if (cur.nombre === null && esCompleto(b)) {              // fila padre: la que ocupa el registro entero
      cur.nombre = slug(f.desc, 4); cur.desc = f.desc; cur.tipo = f.tipo; cur.unidad = f.unidad;
      cur.escala = f.escala; cur.defecto = f.defecto; cur.rango = f.rango; cur.cat = f.cat;
    } else {
      const lo = b ? b[0] : '?';
      cur.hijos.push({ nombre: unico(slug(f.desc), usados.get(f.addr), lo), bits: b, desc: f.desc,
        tipo: f.tipo, unidad: f.unidad, rango: f.rango, defecto: f.defecto });
    }
  }
  for (const r of out) if (r.nombre === null) {              // sin fila de registro entero: se usa el primer hijo
    const h = r.hijos.shift(); r.nombre = h ? h.nombre : 'reg_' + r.addr; r.desc = h ? h.desc : '';
  }
  return out;
}

/* ---------- conversiones ya validadas en la herramienta, por dirección ---------- */
/* Son las que el documento no da y sí estaban comprobadas contra registros reales. Se aplican
   ENCIMA de lo generado; si el documento trae unidad, gana la del documento salvo aquí. */
const CURADO = {
  ncu: { 30506: { un: 'rad → °' }, 30510: { un: 'rad → °' } },
  hsu: {}, tcu: {}
};

/* ---------- construcción de una sección ---------- */
function seccion(t, sn, rw, regs, { base = null, stride = null, offsetDe = null, max = null } = {}) {
  const f = regs.map(r => {
    const bits = {}, bdesc = {};
    for (const h of r.hijos) if (h.bits) { bits[h.nombre] = h.bits; if (h.desc) bdesc[h.nombre] = h.desc; }
    const cur = (CURADO.ncu[r.addr] || CURADO.hsu[r.addr] || CURADO.tcu[r.addr] || {});
    const un = cur.un || UNI(r.unidad, r.escala);
    let desc = r.desc || '';
    const extra = [];
    if (r.rango && r.rango !== 'None') extra.push('rango ' + r.rango);
    if (r.defecto && r.defecto !== 'None') extra.push('por defecto ' + r.defecto);
    if (extra.length) desc = (desc ? desc + ' · ' : '') + extra.join(' · ');
    const dir = (offsetDe !== null) ? (r.addr - offsetDe) : r.addr;
    return [dir, r.nombre, TIPO(r.tipo), un, Object.keys(bits).length ? bits : null,
            ESC(r.escala), null, desc, (r.acc || '').toUpperCase() || null,
            Object.keys(bdesc).length ? bdesc : null];
  });
  const s = { t, sn, rw, f };
  if (base !== null) { s.base = base; s.stride = stride; s.max = max; }   // max = cuántas unidades tiene el bloque, del R7 (hoja Overview)
  return s;
}
const entre = (regs, a, b) => regs.filter(r => r.addr >= a && r.addr <= b);

/* ================= NCU ================= */
const nInfo = agrupaXL(XL.ncu_r7['NCU Info']);
const nRW = agrupaXL(XL.ncu_r7['NCU RW registers']);
const nTCUc = agrupaXL(XL.ncu_r7['TCU Compat']);
const nTCU = agrupaXL(XL.ncu_r7['TCU']);
const nHSU = agrupaXL(XL.ncu_r7['HSU']);
const nHSUx = agrupaXL(XL.ncu_r7['HSU EXT']);

const NCU = [
  seccion('Identidad', 'hoja «NCU Info» · el documento numera estas tres SIN el prefijo 3xxxx', 'ro', entre(nInfo, 0, 999)),
  seccion('Registros propios', 'hoja «NCU Info» · direcciones absolutas · una NCU por planta', 'ro', entre(nInfo, 30000, 30199)),
  seccion('Comandos y forzados', 'hoja «NCU RW registers» · ESCRITURA sobre la planta entera: fuerza posiciones seguras y limpieza por grupo', 'w', nRW),
  seccion('Bloque TCU (republicado)', 'hoja «TCU Compat» · base 30500 · 22 registros/TCU · hasta 200 TCU · lastComm 29500+(id−1)·2', 'ro',
    entre(nTCUc, 30500, 30599), { base: 30500, stride: 22, offsetDe: 30500, max: 200 }),
  seccion('TCU · último contacto', 'hoja «TCU Compat» · base 29500 · 2 registros/TCU', 'ro',
    entre(nTCUc, 29500, 29599), { base: 29500, stride: 2, offsetDe: 29500, max: 200 }),
  seccion('Bloque TCU completo', 'hoja «TCU» · base 50000 · 50 registros/TCU · el mapa entero de cada seguidor a través de la NCU', 'ro',
    nTCU, { base: 50000, stride: 50, offsetDe: 50000, max: 200 }),
  seccion('Bloque HSU básico (republicado)', 'hoja «HSU» · base 30200 · 10 registros/HSU', 'ro',
    entre(nHSU, 30200, 30299), { base: 30200, stride: 10, offsetDe: 30200, max: 10 }),
  seccion('HSU · marcas de tiempo', 'hoja «HSU» · lastValidSnow 29320 · lastValidWind 29380 · lastComm 29440 · 2 registros/HSU', 'ro',
    entre(nHSU, 29000, 29499)),
  seccion('Bloque HSU extendido (republicado)', 'hoja «HSU EXT» · base 28000 · 100 registros/HSU · solo con hsu_extended', 'ro',
    nHSUx, { base: 28000, stride: 100, offsetDe: 28000, max: 10 }),
];

/* ================= TCU (PDF v6, FW 1.4.3) ================= */
const t = agrupaPDF(PDF);
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
  seccion('Bloque extendido vía NCU (piranómetros)', 'en la NCU · base 28000 · 100 registros/HSU · solo con hsu_extended', 'ro',
    nHSUx, { base: 28000, stride: 100, offsetDe: 28000, max: 10 }),
];

/* ---------- salida ---------- */
const cuenta = secs => secs.reduce((n, s) => n + s.f.length, 0);
const js = o => JSON.stringify(o).replace(/"([A-Za-z_$][A-Za-z0-9_$]*)":/g, '$1:');

const bloque =
`/* ==================================================================================
   MAPA GENERADO — no editar a mano. Sale de tools/gen_modbus_map.mjs a partir de los
   documentos del fabricante:
     NCU  NCU_Modbus_Map_R7.xlsx      (hojas NCU Info · NCU RW registers · TCU Compat · TCU · HSU · HSU EXT)
     TCU  SUNNER_TCU_ModbusMap_v6.pdf (FW v1.4.3)
     HSU  250506_HSU_Modbus_Map_R23.xlsx
   Para regenerar:  node tools/gen_modbus_map.mjs --write
   La pestaña de TCU llevaba un mapa que NO era el de Sunner (venía del modelo del gemelo
   digital): sus direcciones significan otra cosa en el equipo real. Ver TRASPASO_MODBUS.md.
   Los nombres de registro de la TCU se derivan de su descripción porque el PDF de Sunner
   no trae columna de nombre de variable; la descripción va literal en su columna.
   ================================================================================== */
var DEV={
 ncu:{tab:'NCU',eti:'controlador de red',max:0,
  nota:'El servidor Modbus de la planta (NCU_Modbus_Map_R7): sus registros propios, los forzados de posición segura y los bloques donde republica cada TCU y cada HSU que gestiona.',
  secs:${js(NCU)}},

 tcu:{tab:'TCU',eti:'seguidor',max:0,idlab:'Nº TCU',
  nota:'El mapa <b>propio del seguidor</b> (SUNNER_TCU_ModbusMap v6, FW v1.4.3), por RTU a 19200 8E1, ID de fábrica 245. Funciones admitidas: 03/04 lectura, 06 escritura simple, 16 múltiple, 22 máscara — <b>no hay coils ni entradas discretas</b>. Las secciones de ESCRITURA mueven el seguidor: cuidado en planta.',
  secs:${js(TCU)}},

 hsu:{tab:'HSU',eti:'estación meteo',max:10,idlab:'Nº HSU',
  nota:'El mapa <b>propio del dispositivo</b> (HSU_Modbus_Map_R23): identidad, estado, medidas, comandos, configuración y calibración. Al final, los dos bloques donde la NCU lo republica (con el selector de unidad). Las secciones de ESCRITURA cambian la estación: cuidado en planta.',
  secs:${js(HSU)}}
};`;

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
