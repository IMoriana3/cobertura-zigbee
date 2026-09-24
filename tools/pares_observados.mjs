/* LOS PARES OBSERVADOS, DEL CRUDO DEL RECOLECTOR.
 *
 * `zigbee_routes.csv` trae una fila por sondeo de ruta:
 *
 *     timestamp, target, hop_count, path_ids, path_addrs
 *
 * y `path_ids` es la RUTA ENTERA unida por «>». Así que cada par consecutivo es
 * un salto OBSERVADO, y de ahí sale la lista de pares que de verdad existen —no
 * los 52 del árbol que dibuja `<planta>_real.geojson`, que son un padre por TCU.
 *
 * ═══ POR QUÉ HACE FALTA ═══
 *
 * `medido_vs_predicho.mjs` juzgaba el modelo contra 52 enlaces: los MEJORES de
 * cada vecindario, los que la malla eligió. Acertar ahí es lo esperable aunque
 * el modelo fuera flojo. Los pares observados traen también los enlaces malos,
 * que es donde un modelo flojo se separa de uno bueno.
 *
 * ═══ EL CRUDO NO VA AL REPO ═══
 *
 * Son 248 MB. Lo que va al repo es ESTE útil, su banco, y el fichero de pares
 * con el MANIFIESTO de la exportación de la que salió: sha256, ventana, filas e
 * instantáneas. Sin eso, dentro de tres meses nadie sabe de qué export salió
 * cada número — y ya sabemos que hay al menos dos exportaciones distintas.
 *
 * ═══ `hop_count` DEL CRUDO NO ES `hop_tipico` DEL GEOJSON ═══
 *
 * Y no por una razón, sino por DOS A LA VEZ:
 *
 *   · son MAGNITUDES distintas — `hop_count` es la longitud de CADA sondeo, y
 *     `hop_tipico` del geojson es un estadístico POR NODO;
 *   · y son VENTANAS distintas — el crudo de junio de 2026 (1.302.763 filas,
 *     25.766 instantáneas) frente a la exportación del geojson (406.457 y
 *     8.053), que además no declara su fecha.
 *
 * Por eso el crudo da mediana 6, p95 10 y máximo 11, y el geojson dice 2–6.
 * NINGUNO de los dos arbitra al otro. Medido por Ignacio sobre el fichero de
 * verdad, no deducido aquí.
 *
 * ═══ LA SUCIEDAD: SE DECIDE, SE DICE Y SE CUENTA ═══
 *
 *   · SALTO A SÍ MISMO (a>a): se descarta ESE SALTO, no la ruta. Un nodo no se
 *     alcanza a sí mismo; es un artefacto del volcado. La ruta puede ser buena
 *     en el resto de sus saltos.
 *   · RUTA CON UN NODO REPETIDO: se descarta la RUTA ENTERA. Una ruta que pasa
 *     dos veces por el mismo nodo no es un camino, y sus pares podrían INVENTAR
 *     adyacencias que el bucle crea pero la radio no.
 *
 * Las dos cuentas salen en el manifiesto y en la salida.
 *
 *     node tools/pares_observados.mjs <planta> <zigbee_routes.csv> [--salida f.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
if (args.length < 2) {
  console.log('uso: node tools/pares_observados.mjs <planta> <zigbee_routes.csv> [--salida f.json]');
  process.exit(1);
}
const [PLANTA, CSV] = args;
if (!fs.existsSync(CSV)) {
  console.log('SIN PARES: no encuentro ' + CSV + '.');
  console.log('El crudo NO está en el repo a propósito (248 MB): hay que traerlo del PC de la planta.');
  console.log('No se ha leído nada. Esto no es un verde.');
  process.exit(2);   // 2 = no comprobado, no 0
}

/* ── EL SHA DE LA EXPORTACIÓN, que es lo que ata cada número a su fuente ── */
function sha256(f) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(f, 'r'), buf = Buffer.alloc(1 << 20);
  let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd); return h.digest('hex');
}

/* ── LECTURA EN STREAM: 248 MB no caben de una ─────────────────────────── */
const pares = new Map();          // "a\0b" (no dirigido, a<b) -> {a,b,n,ab,ba}
const nodos = new Set();
let filas = 0, rutas = 0, saltos = 0, cab = null;
const inst = new Set();
let tsMin = null, tsMax = null;
const sucio = { saltoASiMismo: 0, rutasConNodoRepetido: 0, rutasVacias: 0, filasCortas: 0 };

function celda(linea) {
  /* CSV de Export-Csv: comillas dobles y separador coma. Los ids no llevan
     comas, pero el parser no lo da por supuesto. */
  const out = []; let cur = '', q = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (q) { if (c === '"') { if (linea[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

const rl = readline.createInterface({ input: fs.createReadStream(CSV), crlfDelay: Infinity });
for await (const linea of rl) {
  if (!linea.trim()) continue;
  const c = celda(linea);
  if (!cab) { cab = c.map(x => x.trim().toLowerCase()); continue; }
  filas++;
  const g = n => { const i = cab.indexOf(n); return i >= 0 ? c[i] : ''; };
  const ts = g('timestamp'), ids = g('path_ids');
  if (!ids) { sucio.filasCortas++; continue; }
  if (ts) { inst.add(ts); if (tsMin === null || ts < tsMin) tsMin = ts; if (tsMax === null || ts > tsMax) tsMax = ts; }
  const bruta = ids.split('>').map(s => s.trim()).filter(Boolean);
  if (bruta.length < 2) { sucio.rutasVacias++; continue; }
  /* EL ORDEN DE LAS DOS POLITICAS IMPORTA, y la primera version lo tenia al
     reves. `A>A>B>COORD` tiene un nodo repetido —la A— asi que la regla del
     bucle se llevaba la ruta ENTERA y la del salto a si mismo no llegaba a
     aplicarse nunca: contaba 0 saltos a si mismo y 1 ruta con bucle.
     Lo correcto es QUITAR PRIMERO los saltos a si mismo y mirar el bucle en lo
     que queda: `A>A>B>COORD` sin su repeticion es `A>B>COORD`, una ruta
     perfectamente buena. Un bucle de verdad —`A>B>A>C`— sigue cayendo.
     Lo cazo el banco; a ojo las dos reglas parecian independientes. */
  const ruta = [];
  for (const x of bruta) { if (ruta.length && ruta[ruta.length - 1] === x) sucio.saltoASiMismo++; else ruta.push(x); }
  if (ruta.length < 2) { sucio.rutasVacias++; continue; }
  if (new Set(ruta).size !== ruta.length) { sucio.rutasConNodoRepetido++; continue; }
  rutas++;
  for (const x of ruta) nodos.add(x);
  for (let i = 0; i + 1 < ruta.length; i++) {
    const a = ruta[i], b = ruta[i + 1];
    saltos++;
    const k = a < b ? a + '\u0000' + b : b + '\u0000' + a;
    let p = pares.get(k);
    if (!p) { p = { a: a < b ? a : b, b: a < b ? b : a, n: 0, ab: 0, ba: 0 }; pares.set(k, p); }
    p.n++; if (a === p.a) p.ab++; else p.ba++;
  }
}

const lista = [...pares.values()].sort((x, y) => y.n - x.n);
const conInverso = lista.filter(p => p.ab > 0 && p.ba > 0).length;
const dirigidos = lista.reduce((s, p) => s + (p.ab > 0 ? 1 : 0) + (p.ba > 0 ? 1 : 0), 0);
const q = u => lista.filter(p => p.n >= u).length;

const manifiesto = {
  planta: PLANTA,
  fuente: {
    fichero: path.basename(CSV),
    sha256: sha256(CSV),
    bytes: fs.statSync(CSV).size,
    filas, instantaneas: inst.size,
    ventana: { desde: tsMin, hasta: tsMax },
    /* SIN ZONA HORARIA, y no se inventa: el esquema v1 del recolector escribe
       hora local sin declararla. Lo resuelve el contrato de datos, no esto. */
    esquema: 'v1 · hora local SIN zona declarada (ver docs/contrato_datos_zigbee.md)',
  },
  suciedad: {
    ...sucio,
    politica: {
      saltoASiMismo: 'se descarta el SALTO, no la ruta: un nodo no se alcanza a sí mismo',
      rutasConNodoRepetido: 'se descarta la RUTA ENTERA: sus pares inventarían adyacencias del bucle',
    },
  },
  recuento: {
    nodos: nodos.size, saltosUsados: saltos, rutasUsadas: rutas,
    paresNoDirigidos: lista.length, paresDirigidos: dirigidos, conInversoObservado: conInverso,
    porFrecuencia: { vistos1: lista.filter(p => p.n === 1).length, ge10: q(10), ge100: q(100), ge1000: q(1000) },
  },
  pares: lista,
};

/* ── LA TABLA DE EXPORTACIONES CONOCIDAS ────────────────────────────────
   Ya hay DOS exportaciones distintas de este recolector y sus números no se
   mezclan. Pero una exportación NUEVA y legítima de la misma planta no puede
   dejar este útil inservible hasta que alguien edite código — ni entrar en
   silencio. Así que:

     · el sha casa con una declarada  → se dice CUÁL y se sigue (rc 0)
     · el sha casa y el resto NO      → ROJO: la declaración miente
     · el sha no casa con ninguna     → rc = 2, «procedencia sin declarar»:
                                        el útil FUNCIONA y escribe sus pares,
                                        pero nadie los pinta de verde hasta
                                        que la exportación se declare aquí

   Esa última es la distinción de siempre: no es que esté mal, es que no se ha
   comprobado de dónde sale. El mensaje trae la línea ya escrita para pegar. */
const EXPORTACIONES = [
  { planta: 'elburgo', sha256: '57ca7f317c7a', filas: 1302763, instantaneas: 25766, nodos: 53,
    desde: '2026-06-16 13:50:38', hasta: '2026-06-22 13:43:26',
    traida: '2026-09-23, Ignacio — medida por él antes de pasarla' },
];
let PROCEDENCIA = null;
{
  const dePlanta = EXPORTACIONES.filter(e => e.planta === PLANTA);
  const casa = dePlanta.find(e => manifiesto.fuente.sha256.startsWith(e.sha256));
  console.log('  ═══ PROCEDENCIA ═══');
  console.log('    exportaciones declaradas  ' + EXPORTACIONES.length
            + ' en total · ' + dePlanta.length + ' de ' + PLANTA);
  if (casa) {
    const d = [];
    if (filas !== casa.filas) d.push('filas ' + filas + ' ≠ ' + casa.filas);
    if (inst.size !== casa.instantaneas) d.push('instantáneas ' + inst.size + ' ≠ ' + casa.instantaneas);
    if (nodos.size !== casa.nodos) d.push('nodos ' + nodos.size + ' ≠ ' + casa.nodos);
    if (tsMin !== casa.desde || tsMax !== casa.hasta) d.push('ventana ' + tsMin + '–' + tsMax);
    if (d.length) {
      console.log('    ROJO · el sha ' + casa.sha256 + ' casa pero el contenido NO:');
      for (const x of d) console.log('        ' + x);
      console.log('    El mismo fichero no puede tener dos contenidos: la declaración miente.');
      process.exit(1);
    }
    PROCEDENCIA = casa;
    console.log('    ha casado                 ' + casa.sha256 + ' · ' + casa.traida);
    console.log('    ventana                   ' + casa.desde + '  a  ' + casa.hasta + '\n');
  } else {
    console.log('    ha casado                 NINGUNA');
    console.log('');
    console.log('    PROCEDENCIA SIN DECLARAR. Los pares se escriben igual —este fichero');
    console.log('    puede ser perfectamente bueno— pero de dónde sale NO está comprobado,');
    console.log('    y ya hay dos exportaciones de este recolector cuyos números no se');
    console.log('    mezclan. Para declararla, añade a EXPORTACIONES de este fichero:');
    console.log('');
    console.log("      { planta: '" + PLANTA + "', sha256: '" + manifiesto.fuente.sha256.slice(0, 12) + "', filas: " + filas
              + ', instantaneas: ' + inst.size + ', nodos: ' + nodos.size + ',');
    console.log("        desde: '" + tsMin + "', hasta: '" + tsMax + "',");
    console.log("        traida: '<fecha>, <quién> — <cómo se midió>' },");
    console.log('');
  }
}
manifiesto.fuente.procedencia = PROCEDENCIA
  ? { declarada: true, sha: PROCEDENCIA.sha256, traida: PROCEDENCIA.traida }
  : { declarada: false, aviso: 'exportación sin declarar en EXPORTACIONES: procedencia no comprobada' };

const salida = opt('salida', path.join(RAIZ, PLANTA + '_pares.json'));
fs.writeFileSync(salida, JSON.stringify(manifiesto, null, 1));

const R = manifiesto.recuento;
console.log('PARES OBSERVADOS · ' + PLANTA + '\n');
console.log('  ═══ LA EXPORTACIÓN ═══');
console.log('    sha256          ' + manifiesto.fuente.sha256);
console.log('    filas / instant ' + filas.toLocaleString('es') + ' / ' + inst.size.toLocaleString('es'));
console.log('    ventana         ' + tsMin + '  a  ' + tsMax);
console.log('    esquema         ' + manifiesto.fuente.esquema + '\n');
console.log('  ═══ LO QUE SALE ═══');
console.log('    nodos                     ' + R.nodos);
console.log('    pares NO dirigidos        ' + R.paresNoDirigidos);
console.log('    pares dirigidos           ' + R.paresDirigidos + '  (con inverso observado: ' + R.conInversoObservado + ')');
console.log('    saltos usados             ' + R.saltosUsados.toLocaleString('es'));
console.log('    por frecuencia            vistos 1 vez: ' + R.porFrecuencia.vistos1
          + ' · ≥10: ' + R.porFrecuencia.ge10 + ' · ≥100: ' + R.porFrecuencia.ge100
          + ' · ≥1000: ' + R.porFrecuencia.ge1000 + '\n');
console.log('  ═══ LA SUCIEDAD, DECIDIDA Y CONTADA ═══');
console.log('    saltos a sí mismo         ' + sucio.saltoASiMismo + '  → se descarta el SALTO, la ruta sigue');
console.log('    rutas con nodo repetido   ' + sucio.rutasConNodoRepetido + '  → se descarta la RUTA ENTERA');
console.log('    rutas de menos de 2 nodos ' + sucio.rutasVacias);
console.log('    filas sin path_ids        ' + sucio.filasCortas);
console.log('    total descartado          ' + (sucio.saltoASiMismo + sucio.rutasConNodoRepetido + sucio.rutasVacias + sucio.filasCortas)
          + ' de ' + filas.toLocaleString('es') + ' filas\n');
console.log('  escrito en ' + path.relative(RAIZ, salida));
if (!PROCEDENCIA) {
  console.log('');
  console.log('  rc = 2: los pares están, la procedencia no. «No comprobado» no es un verde.');
  process.exit(2);
}
