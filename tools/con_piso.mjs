/* EL ENVOLTORIO DEL PISO — «verde» tiene que traer un RECUENTO, no sólo un 0.
 *
 * ═══ POR QUÉ ═══
 *
 * Este repo ya pagó las dos formas de salir verde sin mirar:
 *
 *   · `test_relieve_plantas.mjs` entraba en CI SIN ARGUMENTOS y su bucle
 *     recorría `argv.slice(2)`: cero plantas, cero vueltas, salida 0. Un tick
 *     verde en cada PR por no haber hecho nada, desde el 9 de septiembre (#741);
 *   · `test_hsus_gw.mjs` decía en su propio nombre «se salta sin la toolbox de
 *     scada» y salía con 0 igual, así que en la página de checks se veía igual
 *     que un careo hecho.
 *
 * Los dos se arreglaron uno a uno. Esto es la regla, para que no haga falta
 * arreglarlos de uno en uno: un banco está verde si SALE con 0 **y** publica al
 * menos su PISO de comprobaciones. El vacío es ERROR, no PASS.
 *
 * La regla no es nuestra: está en `factiun-cartera/tests/correr.sh` desde antes,
 * con su tabla de pisos medidos y su guardia de bancos sin piso. Aquí va como
 * ENVOLTORIO y no como corredor porque los bancos de este repo son cada uno su
 * propio paso de CI —algunos necesitan pwsh, otros navegador, otros van en una
 * matriz— y meterlos todos en un bucle perdería esa granularidad, que sirve.
 *
 * ═══ USO ═══
 *
 *     node tools/con_piso.mjs tools/test_x.mjs [args...]
 *     node tools/con_piso.mjs --tabla        # comprueba la tabla y sale
 *
 * Códigos de salida, la convención de #738:
 *     0  el banco ha corrido y publica al menos su piso
 *     1  el banco ha fallado, o publica MENOS de su piso
 *     2  el banco no se ha podido comprobar (él mismo salió con 2)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── EL PISO DE CADA BANCO ────────────────────────────────────────────────
   MEDIDOS el 2026-09-23, y EXACTOS: crecer no rompe nada —el piso es un
   mínimo— y así el día que un banco pierda una comprobación se entera
   alguien. Sólo se BAJAN a propósito, con el motivo escrito, y el cambio se
   ve en el diff. */
const PISO = {
  // ── núcleo (python) ──
  'test_barrido_rf.py': 28,
  'test_calibra_barrido.py': 44,
  'test_coords_retiradas.py': 24,
  // MEDIDO hoy al fusionar esta rama con main: `test_orto.mjs` entró en main
  // DESPUÉS de que esta tabla se escribiera, así que al envolverlo se quedaba
  // sin piso y `con_piso` lo ponía en rojo — el aviso funcionó. 24 publicadas.
  'test_orto.mjs': 20,
  // ── los .ps1 de campo. Sin PowerShell salen con 2 y eso NO es un fallo:
  //    el envoltorio lo respeta y devuelve 2 también.
  'test_angulos_barrido.py': 1,
  'test_config_planta.py': 1,
  'test_inventario_zb.py': 1,
  'test_logger_rssi.py': 1,
  'test_rutas_telnet.py': 1,
  'test_export_csv_esquema.py': 1,
  // ── datos y física (node) ──
  'test_pw_navegador.mjs': 6,
  'test_dem_cobertura.mjs': 10,
  'test_anual_lazo.mjs': 25,   // paso 2: cada comprobación de fuente en su línea (antes 12)
  'test_ponderacion_planta.mjs': 10,
  'test_caras_bajo_demanda.mjs': 9,
  'test_signo_unico.mjs': 7,
  'test_doc_version.mjs': 12,
  'test_herramientas_campo.mjs': 11,
  'test_cableado_core.mjs': 40,
  'test_control_core.mjs': 40,
  // EL PISO QUE DEPENDE DE DÓNDE CORRE. Lo medí en mi máquina, donde está
  // `SolarGPTfull` clonado al lado, y en CI falló: 14 publicadas contra un piso
  // de 19. No es un defecto del banco, es que su tercera sección —el CANARIO
  // CRUZADO, las cinco comprobaciones que carean las constantes del motor
  // contra el fuente de `solargpt_core`— no se puede correr sin el hermano, y
  // el hermano es PRIVADO y ocupa 820 MB: clonarlo en CI no es una opción.
  //
  // Lo de fondo no es el número: es que en CI las 14 que SÍ corren verifican
  // la aritmética con un modelo INVENTADO de números redondos escrito en el
  // propio banco (k=0,05 e0=1,0 …), y la única sección que ata esos números
  // al modelo REAL medido es justo la que se salta. Un piso de 14 a secas lo
  // habría tapado; por eso el alcance se DECLARA y se ve.
  'test_anual_motor.mjs': { piso: 19, alcances: { 'sin-hermano': 14 } },
  'test_cloud_shadows.mjs': 13,
  'test_overcast_sim.mjs': 111,
  'test_modbus_map.mjs': 26,
  'test_paquete_medida.mjs': 65,
  'test_malla_real.mjs': 30,
  'test_pilotes_dwg.mjs': 12,
  'test_hsus_gw.mjs': 33,
  'test_pares_observados.mjs': 28,
  // los tres lentos, MEDIDOS en una corrida completa (tardan 3-9 min cada uno,
  // por eso estuvieron un rato declarados sin piso en vez de con un numero a ojo)
  'test_veto_por_mesa.mjs': 8,   // paso 3 (R-1): + la puerta segCmd con dos controles
  'test_unidad_accionamiento.mjs': 8,   // paso 3 reformulado: motor, las nueve como main (+segCmd, +control), contacto (+control), declaración
  'test_backtracking_sim.mjs': 215,
  'test_produccion.mjs': 93,
};

/* ── LO QUE NO LLEVA PISO, CON MOTIVO ────────────────────────────────────
   Una exención escrita es lo contrario de un banco sin vigilar: se ve en el
   diff y tiene dueño. Aquí sólo caben los que NO PUBLICAN un recuento; la
   solución de verdad es que lo publiquen, y queda dicho. */
const SIN_PISO = {
  'test_nb_procedencia.mjs': 'no publica recuento: imprime la procedencia de cada cuaderno y un veredicto en prosa. Debería publicar cuántos cuadernos ha mirado.',
  'test_dos_metricas.mjs': 'no publica recuento: imprime dos tablas y un veredicto. Debería publicar cuántas comparaciones hace.',
  'test_meteo_csv.mjs': 'no publica recuento: dice «41 HSU: el CSV dice lo mismo que el layout» y ese 41 es el dato, no el número de comprobaciones.',
};

/* ── EL ALCANCE: UN BANCO QUE MIDE MENOS TIENE QUE DECIRLO ────────────────
   Un banco cuyo alcance encoge según lo que haya en la máquina no puede tener
   UN piso: el de mi portátil tapa lo que falta en CI, y el de CI tapa lo que
   falta en el portátil. Así que el banco DECLARA en qué alcance ha corrido
   —una línea `[alcance] <nombre>`— y la tabla dice qué piso le toca a cada uno.

   El reparto es a propósito: la CONDICIÓN vive en el banco, que es el único que
   sabe qué le falta, y los NÚMEROS viven en la tabla, que es donde se ven en el
   diff. Una segunda copia de la condición aquí se quedaría vieja el día que el
   banco cambie, que es el defecto que este repo acaba de pagar con el 0,125
   escrito a mano en `terreno.html`.

   Y LO IMPORTANTE, que es lo que casi se me escapa: un alcance que la tabla NO
   conozca sale con rc = 2, no con el piso base. Si mañana el banco aprende a
   correr recortado de otra manera, eso es un entorno que nadie ha medido, y un
   entorno sin medir no puede pasar por verde por defecto. */
function declaraAlcance(txt) {
  const m = /^\s*\[alcance\]\s+(\S+)/m.exec(txt);
  return m ? m[1] : null;
}

/* ── LO QUE FALTA, DICHO ──────────────────────────────────────────────────
   Los 36 bancos del job `navegador` —los `visor · ...` de la matriz— NO
   llevan piso todavía. No es un olvido: necesitan Chromium y el repo servido,
   y varios tardan minutos (test_sombras.mjs con El Burgo tarda 12 en CI). Sus
   pisos hay que MEDIRLOS corriéndolos de verdad, y medir a ojo sería
   exactamente lo que esta tabla existe para impedir.
   Queda escrito aquí y no en una nota al pie porque es la mitad de los bancos
   del repo, y una lista de pisos que no dice qué NO cubre se lee como si lo
   cubriera todo. */
const MATRIZ_SIN_MEDIR = 36;

/* ── EL LECTOR DEL RECUENTO ──────────────────────────────────────────────
   Seis formatos, porque cada banco publica a su manera y unificarlos sería
   tocar treinta ficheros para no arreglar nada. Si aparece un séptimo el
   recuento sale 0 y el banco se pone rojo por el piso: se entera alguien, que
   es justo lo que se quiere. */
function leeCuenta(txt) {
  const ult = txt.split('\n').slice(-40).join('\n');
  let m;
  if ((m = /TODO OK[ —-]+(\d+) comprobaciones/.exec(ult))) return { n: +m[1], leido: true };
  if ((m = /OK[ —-]+(\d+)\/(\d+) tests?/.exec(ult))) return { n: +m[1], leido: true };
  if ((m = /(\d+) OK\s*·\s*\d+ FAIL/.exec(ult))) return { n: +m[1], leido: true };
  if ((m = /\((\d+) comprobaciones\)/.exec(ult))) return { n: +m[1], leido: true };
  if ((m = /(\d+) comprobaciones/.exec(ult))) return { n: +m[1], leido: true };
  const marcas = (txt.match(/^\s*(?:ok|OK|✓)\s/gm) || []).length;
  /* NO SÉ LEERLO ≠ ESTÁ MAL. Si ningún formato casó Y no hay ni una marca
     `ok`/`✓`, el recuento no es cero: es que no lo he sabido leer. Salía como
     ROJO —«el banco publica 0 y el piso son 40»— y eso manda a buscar un
     defecto en un banco sano, o peor, invita a BAJAR EL PISO para «arreglarlo»,
     que desactiva la guardia en silencio.
     Es la misma confusión que `gate_datos.mjs` tenía al revés, y la convención
     de #738 la resuelve igual: 1 es «está mal», 2 es «no se ha podido
     comprobar». */
  return { n: marcas, leido: marcas > 0 };
}

/* ── EL GUARDIA DE LA TABLA: un banco nuevo obliga a medir el suyo ───────
   Sin esto, un banco entra en el repo y no lo vigila nadie — que es
   exactamente cómo `test_relieve_plantas.mjs` pasó cuatro meses en verde. */
function guardiaTabla() {
  let malo = 0;
  const hay = new Set();
  for (const d of ['tools', 'tests']) {
    const dir = path.join(RAIZ, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (/^test_.*\.(mjs|js|py)$/.test(f)) hay.add(f);
  }
  for (const f of Object.keys(SIN_PISO)) {
    if (!hay.has(f)) {
      console.log('ROJO · ' + f + ' está declarado SIN_PISO y el fichero NO existe');
      console.log('       si se borró a propósito, quita también su línea');
      malo++;
    }
  }
  for (const f of Object.keys(PISO)) {
    if (!hay.has(f)) { console.log('ROJO · ' + f + ' tiene piso y el fichero NO existe'); malo++; }
  }
  return malo;
}

/* ── MAIN ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
if (args[0] === '--tabla') {
  const malo = guardiaTabla();
  const n = Object.keys(PISO).length, s = Object.keys(SIN_PISO).length;
  console.log(malo ? malo + ' problema(s) en la tabla de pisos'
    : n + ' bancos con piso medido · ' + s + ' declarados sin piso, con motivo');
  if (!malo) console.log('  y ' + MATRIZ_SIN_MEDIR + ' del job `navegador` SIN MEDIR: necesitan Chromium y el repo servido.');
  process.exit(malo ? 1 : 0);
}
if (!args.length) { console.log('uso: node tools/con_piso.mjs tools/test_x.mjs [args...]'); process.exit(1); }

const rel = args[0], base = path.basename(rel);
if (SIN_PISO[base]) {
  console.log('(' + base + ' corre sin piso: ' + SIN_PISO[base] + ')');
}
if (!PISO[base] && !SIN_PISO[base]) {
  console.log('ROJO · ' + base + ' no tiene piso en tools/con_piso.mjs ni está declarado sin él');
  console.log('       córrelo, apunta cuántas comprobaciones publica, y añádelo');
  process.exit(1);
}

const cmd = rel.endsWith('.py') ? 'python3' : process.execPath;
const r = spawnSync(cmd, [path.join(RAIZ, rel), ...args.slice(1)],
  { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const salida = (r.stdout || '') + (r.stderr || '');
process.stdout.write(salida);

if (r.status === 2) {
  console.log('\n[piso] ' + base + ': el banco dice que NO ha podido comprobar (rc=2). No es un verde.');
  process.exit(2);
}
if (r.status !== 0) { console.log('\n[piso] ' + base + ': rc=' + r.status); process.exit(1); }
if (SIN_PISO[base]) process.exit(0);

const { n: cuenta, leido } = leeCuenta(salida);

/* EL PISO QUE TOCA, según el alcance que el banco haya declarado. */
const decl = PISO[base];
const tieneAlcances = decl && typeof decl === 'object';
const alcance = declaraAlcance(salida);
let piso = tieneAlcances ? decl.piso : decl, comoCorrio = '';
if (alcance) {
  if (!tieneAlcances || !(alcance in decl.alcances)) {
    console.log('\n[piso] ' + base + ': ha declarado el alcance «' + alcance + '» y la tabla no lo conoce.');
    console.log('[piso] Un alcance sin medir NO cae al piso base: eso sería dar por bueno un');
    console.log('[piso] entorno que nadie ha mirado. Mide cuántas publica ahí y añádelo.');
    process.exit(2);   // 2 = no comprobado, NO 1
  }
  piso = decl.alcances[alcance];
  comoCorrio = ' · alcance «' + alcance + '»';
}
if (!leido) {
  console.log('\n[piso] ' + base + ': no sé leer su recuento — ningún formato conocido casó');
  console.log('[piso] y no publica ni una línea `ok`/`✓`. El banco puede estar perfectamente;');
  console.log('[piso] lo que no se ha podido comprobar es su piso de ' + piso + '.');
  console.log('[piso] Que publique un recuento, o añade su formato a `leeCuenta`.');
  console.log('[piso] NO bajes el piso para esto: apagarías la guardia sin arreglar nada.');
  process.exit(2);   // 2 = no comprobado, NO 1
}
if (cuenta < piso) {
  console.log('\n[piso] ' + base + ': ha publicado ' + cuenta + ' comprobaciones y el piso son ' + piso + comoCorrio + '.');
  console.log('[piso] Un banco que publica menos que su piso NO es un verde, aunque salga con 0.');
  console.log('[piso] Mira su salida antes de bajar el piso, y si lo bajas, escribe por qué.');
  process.exit(1);
}
console.log('\n[piso] ' + base + ': ' + cuenta + ' comprobaciones (piso ' + piso + comoCorrio + ')');
