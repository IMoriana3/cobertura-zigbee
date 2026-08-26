/* FICHA DE CONFIGURACIÓN BT POR SEGUIDOR — qué lleva cada TCU, con su registro.
   Uso:  node tools/export_config_tcu.mjs [planta]

   El hermano ESTÁTICO de `export_consignas.mjs`: aquél dice qué ángulo mandar
   cada minuto, éste dice qué hay que tener CONFIGURADO para que el
   backtracking salga bien sin que nadie mande nada.

   ── Esto NO calcula pendientes: las UNE ───────────────────────────────────
   La configuración por TCU del levantamiento **ya existe** y está publicada
   como descarga en `modbus.html`: `config_tcu_sunner_<planta>.csv`. Trae lo
   difícil —la vecina crítica de cada lado y el VECTOR de pendiente con su
   azimut—, pero viene en su propio orden y con su propia identidad de zona
   («HD-1»), así que no se puede cruzar con el diagnóstico del SCADA ni dice a
   qué registro va cada número.

   Esto lo une: le pega la identidad NCU/TCU del layout, el vano MEDIDO a cada
   vecina, y el número de registro del mapa R7. Ni una pendiente recalculada.

   ── Cómo se unen, y por qué se puede ──────────────────────────────────────
   Los dos ficheros describen la MISMA planta con distinto orden: comprobado
   que las distribuciones de `pend_long_pct` y `sl` coinciden a 0,000 pp. La
   unión va por la terna medida (pendiente longitudinal, transversal este,
   transversal oeste), que en Ayora resuelve **754 de 754 sin un solo empate**.
   Si algún día deja de ser unívoca, esto ABORTA en vez de emparejar a ojo.

   ── Qué es cada columna del fichero de origen (verificado, no supuesto) ────
   `pend_vector` es el MÓDULO del vector de pendiente hacia esa vecina y
   `azimut_deg` su dirección; `pend_transv` es su componente perpendicular al
   eje. Comprobado aritméticamente sobre las 1.508 parejas de la planta:
   |transv| = |vector·cos(az−90°)| con un peor desvío de 0,007 pp. Por eso el
   par (vector, azimut) es justo lo que quieren 41098/41100 y 41102/41104, que
   piden un vector de pendiente y no un escalar.

   ── Lo que sigue SIN derivar, a propósito ─────────────────────────────────
   · 41037/41038 van en PULSOS de motor y aquí hay GRADOS: la constante
     pulsos/grado es del accionamiento y no vive en estos ficheros.
   · 41014 (azimut del eje): el simulador usa ≈0 como aproximación DECLARADA;
     el valor real es de replanteo, no de aquí.

   ── El 41106: la errata NO es nuestra, es del documento ───────────────────
   `41106` (East pitch) aparece en RADIANES mientras su gemelo `41033` (West
   pitch) está en METROS. Comprobado contra la extracción del documento de
   fabricante (`tools/modbus_src/tcu_v6.json`, de SUNNER_TCU_ModbusMap v6): el
   volcado es FIEL — el error viene de origen. Y se ve de dónde:

     41098  Radians  def 0         0..π/4   West grade slope angle
     41100  Radians  def 0         0..2π    West grade azimuth angle
     41102  Radians  def 0         0..π/4   East grade slope angle
     41104  Radians  def 0         0..2π    East grade azimuth angle
     41106  Radians  def 0         0..π/4   East pitch (separation between axes)
     ————— frente a su gemelo —————
     41033  Meters   def 9         (sin rango)  West pitch (separation between axes)

   El 41106 hereda unidad, defecto y rango IDÉNTICOS a los del 41102, cuatro
   direcciones más arriba: es un arrastre de celdas al añadir la fila. Y el
   contenido lo confirma — un pitch por defecto de 0 y un máximo de π/4 ≈ 0,79
   no son una separación entre ejes (su gemelo trae 9 m).

   Pero esto NO se puede cerrar desde el papel: dice qué hay escrito, no qué
   lee el firmware. Se cierra con UNA lectura Modbus de 41106 en una TCU ya
   comisionada con pitch este configurado — si vale ~6 son metros, si vale ~0,1
   son radianes. Hasta entonces la ficha emite METROS (que es lo que mide) y lo
   deja dicho, sin corregir el mapa: `modbus.html` reproduce el documento, y
   ahí tiene que seguir tal cual está publicado.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLANTA = (process.argv[2] || 'ayora').toLowerCase();
const leer = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf-8'));

const cotas = leer(`${PLANTA}_cotas.json`);
let lay = null;
try { lay = leer(`${PLANTA}_layout.json`); } catch { lay = null; }
const SRC = `config_tcu_sunner_${PLANTA}.csv`;
if (!fs.existsSync(path.join(ROOT, SRC))) {
  console.error(`falta ${SRC} — la configuración por TCU del levantamiento. ` +
                `Esto UNE ese fichero con la identidad y los registros; no recalcula pendientes.`);
  process.exit(1);
}
const L = fs.readFileSync(path.join(ROOT, SRC), 'utf-8').trim().split('\n');
const cabSrc = L[0].split(';');
const col = (n) => { const i = cabSrc.indexOf(n); if (i < 0) { console.error(`${SRC} sin columna ${n}`); process.exit(1); } return i; };
const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; };

const T = cotas.t || [];

/* ── unión por la terna medida ───────────────────────────────────────────── */
const clave = (a, b, c) => [a, b, c].map(v => v == null ? 'x' : (Math.round(v * 1000) / 1000).toFixed(3)).join('|');
const porTerna = new Map();
T.forEach((t, i) => {
  if (!t) return;
  const k = clave(t.sl, t.cse, t.cso);
  if (!porTerna.has(k)) porTerna.set(k, []);
  porTerna.get(k).push(i);
});
const iLong = col('pend_long_pct'), iTE = col('este_pend_transv_pct'), iTO = col('oeste_pend_transv_pct');
const par = new Array(L.length - 1).fill(-1);
let amb = 0, sin = 0;
for (let r = 1; r < L.length; r++) {
  const f = L[r].split(';');
  const v = porTerna.get(clave(num(f[iLong]), num(f[iTE]), num(f[iTO])));
  if (!v) sin++;
  else if (v.length > 1) amb++;
  else par[r - 1] = v[0];
}
if (amb || sin) {
  console.error(`la unión dejó de ser unívoca: ${amb} empates y ${sin} sin pareja de ${L.length - 1}. ` +
                `Emparejar a ojo escribiría la pendiente de un seguidor en otro: se aborta.`);
  process.exit(1);
}

/* ── vanos MEDIDOS a cada vecina (el fichero de origen no los trae) ───────
   Una «línea» as-built es una BANDA, no una recta: las x de una misma línea se
   desplazan a lo largo del parque. Se agrupa por saltos y se asigna por
   CONTENCIÓN — con cercanía al centroide se caían 27 de 754 en silencio. */
const PITCH_NOM = +cotas.pitch || 6;
const TOL = PITCH_NOM / 4, HUECO = 2.5 * PITCH_NOM;
const xs = [];
for (const t of T) if (t) for (const f of (t.f || [])) if (isFinite(f.x)) xs.push(f.x);
xs.sort((a, b) => a - b);
const lineas = [];
for (const x of xs) {
  const u = lineas[lineas.length - 1];
  if (u && x - u.x1 <= TOL) { u.x1 = x; u.n++; u.sum += x; } else lineas.push({ x0: x, x1: x, n: 1, sum: x });
}
for (const Ln of lineas) Ln.x = Ln.sum / Ln.n;
const vanoO = lineas.map((Ln, i) => i === 0 ? null : Ln.x - lineas[i - 1].x);
const vanoE = lineas.map((Ln, i) => i === lineas.length - 1 ? null : lineas[i + 1].x - Ln.x);
const lineaDe = (x) => {
  for (let i = 0; i < lineas.length; i++) if (x >= lineas[i].x0 - 1e-9 && x <= lineas[i].x1 + 1e-9) return i;
  let mejor = -1, d = Infinity;
  for (let i = 0; i < lineas.length; i++) { const e = Math.abs(lineas[i].x - x); if (e < d) { d = e; mejor = i; } }
  return d <= TOL ? mejor : -1;
};

/* ── autocomprobación: el vector y su azimut tienen que dar la transversal ── */
const iVE = col('este_pend_vector_pct'), iVO = col('oeste_pend_vector_pct');
const iAE = col('este_azimut_deg'), iAO = col('oeste_azimut_deg');
let peorTrig = 0;
for (let r = 1; r < L.length; r++) {
  const f = L[r].split(';');
  for (const [it, iv, ia] of [[iTE, iVE, iAE], [iTO, iVO, iAO]]) {
    const tr = num(f[it]), ve = num(f[iv]), az = num(f[ia]);
    if (tr == null || ve == null || az == null) continue;
    peorTrig = Math.max(peorTrig, Math.abs(Math.abs(ve * Math.cos((az - 90) * Math.PI / 180)) - Math.abs(tr)));
  }
}
if (peorTrig > 0.05) {
  console.error(`el vector y su azimut ya no reproducen la transversal (peor ${peorTrig.toFixed(3)} pp). ` +
                `O cambió el convenio del fichero de origen o se está leyendo mal: se aborta.`);
  process.exit(1);
}

const pctARad = (p) => p == null ? null : Math.atan(p / 100);
const degARad = (d) => d == null ? null : d * Math.PI / 180;
const r6 = (v) => v == null ? '' : Math.round(v * 1e6) / 1e6;
const r3 = (v) => v == null ? '' : Math.round(v * 1e3) / 1e3;

const iZona = col('zona'), iId = col('id'), iTipo = col('tipo');
const iVCE = col('este_vecina_critica'), iVCO = col('oeste_vecina_critica');
const filas = [];
let bordeO = 0, bordeE = 0;
for (let r = 1; r < L.length; r++) {
  const f = L[r].split(';');
  const i = par[r - 1], t = T[i];
  const tk = (lay && lay.trackers && lay.trackers[i]) || null;
  const xr = (t.f || []).map(a => a.x).filter(v => isFinite(v));
  const li = xr.length ? lineaDe(Math.min(...xr)) : -1;
  let vo = li >= 0 ? vanoO[li] : null, ve = li >= 0 ? vanoE[li] : null;
  if (vo != null && vo > HUECO) vo = null;
  if (ve != null && ve > HUECO) ve = null;
  if (vo == null) bordeO++;
  if (ve == null) bordeE++;
  const m = String((tk && tk.id) || '').match(/(\d+)/);
  filas.push([
    PLANTA, tk ? (tk.ncu ?? '') : '', m ? +m[1] : '', tk ? (tk.id || '') : '',
    f[iZona], f[iId], f[iTipo], li >= 0 ? li + 1 : '',
    r3(vo), r3(ve),                                               // 41033 / 41106
    r3(+cotas.cuerda), r3(+cotas.limite), r3(+cotas.limite),      // 41035 / 41037 / 41038
    r6(pctARad(num(f[iVO]))), r6(degARad(num(f[iAO]))),           // 41098 / 41100
    r6(pctARad(num(f[iVE]))), r6(degARad(num(f[iAE]))),           // 41102 / 41104
    r3(num(f[iVO])), r3(num(f[iAO])), r3(num(f[iVE])), r3(num(f[iAE])),
    r3(num(f[iTO])), r3(num(f[iTE])), r3(num(f[iLong])),
    f[iVCO], f[iVCE],
  ]);
}

const cab = ['planta', 'ncu', 'tcu', 'tracker', 'zona', 'id_levantamiento', 'tipo', 'linea',
  'r41033_west_pitch_m', 'r41106_east_pitch_m',
  'r41035_panel_width_m', 'r41037_max_west_deg', 'r41038_max_east_deg',
  'r41098_west_grade_rad', 'r41100_west_grade_azimuth_rad',
  'r41102_east_grade_rad', 'r41104_east_grade_azimuth_rad',
  'oeste_vector_pct', 'oeste_azimut_deg', 'este_vector_pct', 'este_azimut_deg',
  'oeste_transv_pct', 'este_transv_pct', 'pendiente_longitudinal_pct',
  'oeste_vecina_critica', 'este_vecina_critica'].join(',');

const out = path.join(ROOT, `config_tcu_${PLANTA}.csv`);
fs.writeFileSync(out, cab + '\n' + filas.map(f => f.join(',')).join('\n') + '\n');
fs.writeFileSync(out.replace(/\.csv$/, '.meta.json'), JSON.stringify({
  planta: PLANTA,
  generado_por: 'tools/export_config_tcu.mjs',
  que_es: 'unión de la configuración por TCU del levantamiento con la identidad NCU/TCU y los ' +
          'números de registro del mapa R7. NO recalcula pendientes.',
  fuente_pendientes: SRC + ' (publicado como descarga en modbus.html)',
  fuente_identidad: lay ? `${PLANTA}_layout.json` : 'sin layout: identidad vacía',
  fuente_vanos: `${PLANTA}_cotas.json (x medidas, agrupadas en líneas por contención)`,
  union: { por: 'terna medida (pend_long, transv_este, transv_oeste) redondeada a 3 decimales',
           unívocos: filas.length, empates: amb, sin_pareja: sin,
           nota: 'si deja de ser unívoca el exportador ABORTA: emparejar a ojo escribiría la ' +
                 'pendiente de un seguidor en otro' },
  autocomprobacion: { relacion: '|transv| = |vector·cos(az−90°)|',
                      peor_desvio_pp: Math.round(peorTrig * 1e4) / 1e4,
                      nota: 'confirma que vector+azimut es el par que piden 41098/41100 y 41102/41104' },
  bordes_de_bloque: { oeste: bordeO, este: bordeE,
                      nota: 'vano vacío = no hay vecina a ese lado dentro del bloque' },
  NO_DERIVADO: {
    r41037_r41038_en_pulsos: 'los topes van en PULSOS de motor y aquí hay GRADOS; la constante ' +
      'pulsos/grado es del accionamiento y no está en estos ficheros.',
    r41014_axis_azimuth: 'el simulador usa azimut de eje ≈0 como aproximación DECLARADA; el valor ' +
      'real de cada planta sale del replanteo, no de aquí.',
  },
  AVISO_41106: {
    que_pasa: 'el 41106 (East pitch) está documentado en RADIANES y su gemelo 41033 (West pitch) ' +
      'en METROS.',
    de_quien_es: 'del DOCUMENTO, no del volcado: comprobado contra tools/modbus_src/tcu_v6.json ' +
      '(extracción de SUNNER_TCU_ModbusMap v6), que dice literalmente Radians / def 0 / 0..π/4.',
    causa_probable: 'arrastre de celdas: 41106 hereda unidad, defecto y rango IDÉNTICOS a los del ' +
      '41102 (East grade slope), cuatro direcciones más arriba. Su gemelo 41033 trae Meters y ' +
      'defecto 9; un pitch de 0 con máximo π/4≈0,79 no es una separación entre ejes.',
    como_se_cierra: 'UNA lectura Modbus de 41106 en una TCU comisionada con pitch este ' +
      'configurado: ~6 ⇒ metros, ~0,1 ⇒ radianes. El papel dice qué hay escrito, no qué lee el firmware.',
    mientras_tanto: 'esta ficha emite METROS (que es lo que mide) y no corrige el mapa: ' +
      'modbus.html reproduce el documento y ahí debe seguir tal cual.',
  },
  cruce: 'CONTRATO de scada · diagnostico_tcu: (planta, NCU, TCU) — los mismos que export_consignas.mjs',
}, null, 2) + '\n');

console.log(`${path.basename(out)} · ${filas.length} seguidores unidos 1:1 · ${lineas.length} líneas`);
console.log(`  autocomprobación vector/azimut: peor desvío ${peorTrig.toFixed(4)} pp`);
if (bordeO || bordeE) console.log(`  bordes de bloque: ${bordeO} al oeste · ${bordeE} al este`);
console.log('  pulsos (41037/41038) y azimut de eje (41014) van SIN derivar, por diseño — ver .meta.json');
