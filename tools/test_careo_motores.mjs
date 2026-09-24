/* R4 · FASE 4.4 — BANCO DE PARIDAD JS ↔ tracker3d.py CONTRA LOS VECTORES SELLADOS.
 *
 * ESTE BANCO SALE EN ROJO Y ESO ES LO CORRECTO. Los dos motores divergen; el
 * encargo pide MEDIR cuánto, publicarlo con el caso peor, y que el trinquete
 * falle SOLO si la divergencia EMPEORA. Nunca al revés: bajar la tolerancia
 * para verlo verde convertiría el instrumento en decoración.
 *
 * Por eso va en CI como JOB PROPIO FUERA DE LA PUERTA `bancos en verde`: su
 * rojo informa, no bloquea. Lo que sí bloquea es el empeoramiento.
 *
 * ── DE DÓNDE SALE CADA COLUMNA ──────────────────────────────────────────────
 * JS      : se ejecuta AQUÍ, del bloque FÍSICA PURA de `backtracking.html`.
 * Python  : se LEE de `canon/out/careo_py.json`, que produce
 *           `canon/careo_python.py` a mano. En CI no está clonado
 *           `SolarGPTfull`, así que la columna Python está CONGELADA. Para que
 *           una columna vieja no pase por actual, el fichero lleva el commit
 *           del motor y el sha256 de los vectores, y este banco comprueba los
 *           dos. Si el motor Python se mueve y nadie regenera, el careo mide
 *           una versión que ya no existe — y el único aviso posible es ese
 *           commit impreso en cada ejecución. NO es una comprobación de
 *           frescura: es una etiqueta. Se dice para que nadie la confunda.
 *
 * ── LO QUE NO SE COMPARA, Y POR QUÉ ─────────────────────────────────────────
 * `bt2d` y `optfree`: NO EXISTEN en `tracker3d.py`. Sin contraparte no hay
 * careo; ponerles un 0 de diferencia sería inventar un acuerdo. El careo
 * congelado de R2 ya las declara así (`audit2/out/G1.txt:108` y `:113`).
 *
 * Las 22 geometrías con torsión POR MESA: el modelo del Python es
 * `PlantTerrain3D` = lista de `RowPairTerrain` con UN tilt por pareja. La
 * entrada del JS no cabe ahí. Se carean igualmente EN LA RAMA POR LÍNEA —
 * donde los dos reciben lo mismo — y la rama por mesa del JS se publica como
 * NO CAREABLE. Elegir una proyección (media, peor caso) es la decisión 4.5 del
 * titular, no de este banco.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA');
const i1 = html.lastIndexOf('/* FIN-FÍSICA');
if (i0 < 0 || i1 < 0) { console.error('no encuentro los delimitadores FÍSICA PURA / FIN-FÍSICA'); process.exit(1); }
const src = html.slice(html.lastIndexOf('/*', i0), i1);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n'
          + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + src + '\nreturn { policyAngles, policyAnglesSeg, segLineMean };')();

const crudoVec = fs.readFileSync(path.join(ROOT, 'canon/vectores.json'));
const shaVec = crypto.createHash('sha256').update(crudoVec).digest('hex');
const shaSellado = fs.readFileSync(path.join(ROOT, 'canon/vectores.sha256'), 'utf-8').split(/\s+/)[0];
const V = JSON.parse(crudoVec);
const PY = JSON.parse(fs.readFileSync(path.join(ROOT, 'canon/out/careo_py.json'), 'utf-8'));

let fallos = 0, n = 0;
const ok = (c, t) => { n++; console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos++; };

/* ── TEST NULO ANTES DE TODO RECUENTO ────────────────────────────────────────
   Si este banco compara dos columnas que en realidad son la misma —porque una
   se leyó mal y quedó vacía, o porque las dos salen del mismo motor— saldría
   una divergencia de 0,0000° y parecería una paridad perfecta. El test nulo
   comprueba lo contrario: que las dos columnas EXISTEN, son distintas entre sí
   en algún punto, y hablan de los mismos vectores. */
console.log('TEST NULO — ¿hay dos columnas de verdad?');
ok(shaVec === shaSellado, `los vectores son los sellados (${shaVec.slice(0, 12)}…)`);
ok(PY.vectores_sha256 === shaSellado, `la columna Python se hizo sobre ESOS vectores (${String(PY.vectores_sha256).slice(0, 12)}…)`);
ok(PY.casos.length === V.geometrias.length, `mismo nº de geometrías en las dos columnas: ${PY.casos.length} = ${V.geometrias.length}`);
console.log(`     motor Python: commit ${String(PY.motor_python_commit).slice(0, 12)} · ${PY.entorno.tracker3d}`);

const INST = V.instantes.filter(i => !i.NO_EXISTE);
const irrDe = i => ({ ghi: i.cielo.ghi, dni: i.cielo.dni, dhi: i.cielo.dhi });

/* la geometría tal como la espera el JS, SIN las mesas: es la rama que el
   Python puede recibir */
const Tlinea = g => ({
  pairs: g.pairs, cw: g.cw, axisAz: g.axisAz, maxAngle: g.maxAngle, gcr: g.gcr,
  z0: g.z0, nBypass: g.nBypass, iam: g.iam, rowTilt: g.rowTilt, groups: g.groups, drive: g.drive,
});

const POL = ['astro', 'pairwise', 'row', 'global', 'true3d', 'mgl', 'optimal'];
const SIN_CONTRAPARTE = ['bt2d', 'optfree'];

/* control negativo del test nulo: dos políticas distintas del MISMO motor
   tienen que diferir; si el comparador diera 0 entre `astro` y `pairwise` es
   que no compara nada. */
{
  const g = V.geometrias.find(x => x.cfg && x.cfg.pendienteEO >= 8) || V.geometrias[0];
  const T = Tlinea(g); const i = INST[0];
  const a = F.policyAngles('astro', i.sol.zen, i.sol.az, T, irrDe(i), i.doy, 0.2).angles;
  const b = F.policyAngles('pairwise', i.sol.zen, i.sol.az, T, irrDe(i), i.doy, 0.2).angles;
  let d = 0; for (let r = 0; r < a.length; r++) d = Math.max(d, Math.abs(a[r] - b[r]));
  ok(d > 1e-6, `control negativo: dos políticas del mismo motor difieren (astro vs pairwise: ${d.toFixed(4)}°)`);
}

/* ── EL CAREO ───────────────────────────────────────────────────────────────*/
const peor = {};                       // política -> {d, geom, inst, fila, js, py}
const porClase = {};                   // clase de geometría -> peor d
const noCareable = [];
POL.forEach(k => { peor[k] = { d: -1 }; });

for (let gi = 0; gi < V.geometrias.length; gi++) {
  const g = V.geometrias[gi], caso = PY.casos[gi];
  if (caso.id !== g.id) { console.error(`desalineadas: ${caso.id} != ${g.id}`); process.exit(1); }
  const T = Tlinea(g);
  if (caso.proyeccion) noCareable.push({ id: g.id, torsion: caso.proyeccion.torsion_max_deg, mesas: caso.proyeccion.mesas });
  const clase = g.tipo + (caso.proyeccion ? '/torsión-por-mesa' : '');
  for (const k of POL) {
    const py = caso.theta[k];
    if (!Array.isArray(py)) continue;                       // ERROR o SIN_CONTRAPARTE: ya se cuenta aparte
    for (let ti = 0; ti < INST.length; ti++) {
      const i = INST[ti];
      let js;
      try { js = F.policyAngles(k, i.sol.zen, i.sol.az, T, irrDe(i), i.doy, 0.2).angles; }
      catch (e) { js = null; }
      if (!js) continue;
      for (let r = 0; r < js.length; r++) {
        const d = Math.abs(js[r] - py[ti][r]);
        if (!(d >= 0)) continue;
        if (d > peor[k].d) peor[k] = { d, geom: g.id, inst: `${i.dia} elev≈${i.elev_objetivo}°`, fila: r, js: js[r], py: py[ti][r] };
        const c = clase + '|' + k;
        if (!(c in porClase) || d > porClase[c]) porClase[c] = d;
      }
    }
  }
}

/* ── DESCOMPOSICIÓN: ¿DÓNDE EMPIEZA LA DIVERGENCIA? ──────────────────────────
   Antes de contar los 62° de `true3d` conviene saber si los dos motores
   coinciden siquiera en el seguimiento astronómico, que no lleva backtracking
   ninguno. Aquí está el hallazgo: NO coinciden en cuanto el eje tiene
   inclinación N-S, y la diferencia CRECE con ella. Todo lo de abajo se
   construye sobre una base que ya difiere.

   Su propio control: con tilt N-S = 0 la diferencia tiene que ser CERO exacto.
   Si no lo fuera, el careo estaría midiendo dos posiciones solares distintas y
   ninguna cifra de la tabla significaría lo que dice. */
{
  const conTilt = [], sinTilt = [];
  for (let gi = 0; gi < V.geometrias.length; gi++) {
    const g = V.geometrias[gi], py = PY.casos[gi].theta.astro;
    if (!Array.isArray(py)) continue;
    const T = Tlinea(g);
    let p = 0;
    for (let ti = 0; ti < INST.length; ti++) {
      const js = F.policyAngles('astro', INST[ti].sol.zen, INST[ti].sol.az, T, irrDe(INST[ti]), INST[ti].doy, 0.2).angles;
      for (let r = 0; r < js.length; r++) p = Math.max(p, Math.abs(js[r] - py[ti][r]));
    }
    (Math.max(...g.rowTilt.map(Math.abs)) < 1e-9 ? sinTilt : conTilt).push({ id: g.id, p, t: Math.max(...g.rowTilt.map(Math.abs)) });
  }
  const mx = a => a.length ? Math.max(...a.map(x => x.p)) : NaN;
  console.log('\nDESCOMPOSICIÓN — la divergencia empieza ANTES del backtracking');
  /* EL CRITERIO NO ES CERO EXACTO, Y NO PUEDE SERLO: la columna Python se
     congela redondeada a 6 decimales, así que media unidad del último dígito
     —5e-7°— es ruido del propio fichero, no desacuerdo de los motores. Pedir
     `=== 0` hacía fallar este control con un residuo de 4,26e-7°, y `toFixed(6)`
     lo imprimía como «0.000000» — o sea, un rojo que la cifra de al lado
     desmentía. Va en notación exponencial para que la cifra pueda decir lo que
     afirma (R4, error E-X1 26). */
  const CUANT = 5e-7;
  ok(mx(sinTilt) < CUANT, `control: con eje N-S horizontal los dos motores dan el MISMO astro — ${sinTilt.length} geometrías, peor |Δθ| ${mx(sinTilt).toExponential(3)}° < ${CUANT.toExponential(0)}° (cuantización de la columna congelada)`);
  const peorCT = conTilt.reduce((a, b) => b.p > a.p ? b : a, conTilt[0]);
  console.log(`  con eje N-S inclinado: ${conTilt.length} geometrías, peor |Δθ| ${mx(conTilt).toFixed(4)}° (${peorCT.id}, |tilt| ${peorCT.t.toFixed(3)}°)`);
  console.log('  → el desacuerdo NO es sobre backtracking: es el término de inclinación N-S del');
  console.log('    seguimiento astronómico. Las cifras de la tabla siguiente lo llevan dentro.');
}

console.log('\nCAREO — peor |Δθ| por política (JS contra tracker3d.py, misma entrada)');
console.log('  política   peor |Δθ|   geometría                       instante          fila   JS        Python');
for (const k of POL) {
  const p = peor[k];
  if (p.d < 0) { console.log(`  ${k.padEnd(10)} SIN DATO`); continue; }
  console.log(`  ${k.padEnd(10)} ${p.d.toFixed(4).padStart(9)}°  ${p.geom.padEnd(30)} ${p.inst.padEnd(17)} ${String(p.fila).padStart(4)}   ${p.js.toFixed(3).padStart(8)}  ${p.py.toFixed(3).padStart(8)}`);
}
for (const k of SIN_CONTRAPARTE) console.log(`  ${k.padEnd(10)} NO COMPARABLE: NO EXISTE en tracker3d.py (careo R2 congelado: audit2/out/G1.txt)`);
console.log(`\n  NO CAREABLE por mesa: ${noCareable.length} de ${V.geometrias.length} geometrías llevan torsión por mesa que`);
console.log('  `PlantTerrain3D` no puede recibir. Se han careado en su rama POR LÍNEA, que es la');
console.log('  única entrada que los dos motores aceptan igual. La proyección la decide 4.5.');

/* ── EL TRINQUETE ───────────────────────────────────────────────────────────*/
const RUTA = path.join(ROOT, 'canon/trinquete_careo.json');
const MARGEN = 1e-6;   // ruido de redondeo de la columna congelada (6 decimales)
let previo = null;
try { previo = JSON.parse(fs.readFileSync(RUTA, 'utf-8')); } catch (e) { previo = null; }

const actual = { vectores_sha256: shaVec, motor_python_commit: PY.motor_python_commit, peor: {} };
for (const k of POL) if (peor[k].d >= 0) actual.peor[k] = { d: +peor[k].d.toFixed(6), geom: peor[k].geom, inst: peor[k].inst, fila: peor[k].fila };

console.log('\nTRINQUETE — falla SOLO si la divergencia EMPEORA');
/* UN BANCO NO ESCRIBE EN EL REPO — la regla está en el propio CI de esta casa
   (`.github/workflows/bancos.yml`, «UN BANCO NO ESCRIBE EN EL REPO»), y un
   trinquete que se reescribe solo al correr no es un trinquete: cada corrida
   bendeciría lo que acaba de medir. Se registra solo con `--registra`, a mano,
   y entonces el commit enseña qué se movió y por qué. */
const REGISTRA = process.argv.includes('--registra');
if (!previo) {
  if (REGISTRA) {
    fs.writeFileSync(RUTA, JSON.stringify(actual, null, 1) + '\n');
    console.log(`  registrado el rojo de partida en ${path.relative(ROOT, RUTA)}`);
    console.log('  NO es un aprobado — es la línea de la que ya no se puede bajar.');
  } else {
    ok(false, `no hay trinquete en ${path.relative(ROOT, RUTA)}: córrelo con --registra para fijar la línea de partida`);
  }
} else {
  for (const k of POL) {
    const a = actual.peor[k], b = previo.peor && previo.peor[k];
    if (!a) continue;
    if (!b) { console.log(`  · ${k}: nuevo en el trinquete (${a.d.toFixed(4)}°)`); continue; }
    if (a.d > b.d + MARGEN) { ok(false, `${k}: la divergencia EMPEORA — ${b.d.toFixed(4)}° → ${a.d.toFixed(4)}° en ${a.geom}, ${a.inst}`); }
    else if (a.d < b.d - MARGEN) console.log(`  ↓ ${k}: mejora ${b.d.toFixed(4)}° → ${a.d.toFixed(4)}° (el trinquete NO se aprieta solo: para bajarlo hay que reescribirlo a mano y decir por qué)`);
    else console.log(`  = ${k}: ${a.d.toFixed(4)}° sin cambio`);
  }
}

/* control negativo DEL TRINQUETE: un empeoramiento fabricado tiene que
   dispararlo. Si no, el trinquete es un adorno. */
{
  const falso = JSON.parse(JSON.stringify(previo || actual));
  const k = POL.find(x => actual.peor[x]);
  if (k) {
    falso.peor[k].d = Math.max(0, actual.peor[k].d - 1);
    ok(actual.peor[k].d > falso.peor[k].d + MARGEN,
       `control negativo del trinquete: con un registro 1° mejor, ${k} se declararía empeoramiento`);
  }
}

console.log(`\ntest_careo_motores  ${n - fallos}/${n} comprobaciones en verde`);
console.log('EL CAREO SIGUE EN ROJO POR DISEÑO: las cifras de arriba son la medida, no el aprobado.');
process.exit(fallos ? 1 : 0);
