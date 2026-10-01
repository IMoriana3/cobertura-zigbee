/* `nb` DICE DE DÓNDE SALE, Y NO SE INVENTA
 *
 * `nb` —subcadenas de diodo que la sombra cruza al subir por la cuerda— decide
 * el escalón de la pérdida de Martinez y con él la POA publicada. Debería salir
 * de la ficha del módulo de cada planta. NO ESTÁ en ninguna: buscado sobre todos
 * los .json/.csv/.geojson con trece patrones. Así que se queda configurable —y
 * la página lo DICE en vez de presentarlo como dato de planta.
 *
 * Este banco vigila las dos mitades: que la procedencia se declare, y que el día
 * que una ficha traiga el dato se USE. La segunda con planta sintética, porque
 * hoy no hay ninguna real que lo traiga: sin eso, la rama de la ficha sería
 * código que nadie ha visto ejecutarse.
 *
 *     node tools/test_nb_procedencia.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
let ok = 0, fail = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n + (d ? '   ' + d : '')); }
                         else { fail++; console.log('  ✗ ' + n + (d ? '   ' + d : '')); } };

/* ── el dato, de verdad, no está ────────────────────────────────────────── */
const PATRONES = ['bypass','by-pass','subcaden','sub-caden','diodo','diode',
                  'modulo_v','mod_v','n_bp','nbp','celul','half-cell','media celda'];
const datos = [], canon = [];
/* `canon/` NO ES DATO DE PLANTA, y por eso sale del barrido — con su motivo y
   con su propio control tres líneas más abajo. Ahí viven el contrato del
   backtracking (R4 4.2) y los vectores de referencia congelados (4.3): el
   contrato ESTÁ OBLIGADO a nombrar `nb` y su procedencia, que es justo lo que
   este banco existe para que se declare, y los vectores llevan `nBypass` como
   parámetro del motor. Encontrar «bypass» ahí no es que una ficha de planta
   traiga el recuento de subcadenas: es el contrato haciendo su trabajo.
   Sin esta separación el banco se ponía rojo por el PR que AÑADE la
   declaración que el banco pide. */
(function anda(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (e.name === '.git' || e.name === 'node_modules' || e.name === 'out') continue;
  const f = path.join(d, e.name);
  if (e.isDirectory()) anda(f);
  else if (/\.(json|csv|geojson)$/i.test(e.name)) (path.relative(ROOT, f).startsWith('canon' + path.sep) ? canon : datos).push(f);
} })(ROOT);
/* TEST NULO del barrido: si no encontrara ficheros, el «no está» no diría nada */
T('el barrido encuentra ficheros de datos que mirar', datos.length > 20, datos.length + ' ficheros');
const aciertos = {};
for (const f of datos) { let t; try { t = fs.readFileSync(f, 'utf-8').toLowerCase(); } catch { continue; }
  for (const p of PATRONES) if (t.includes(p)) (aciertos[p] = aciertos[p] || []).push(path.relative(ROOT, f)); }
/* CONTROL del barrido: un patrón que SÍ existe tiene que aparecer, o la búsqueda
   estaría ciega y su cero no valdría nada */
const control = datos.filter(f => { try { return fs.readFileSync(f, 'utf-8').toLowerCase().includes('panelwidth'); } catch { return false; } });
T('CONTROL · el barrido no está ciego: «panelwidth» sí aparece', control.length > 0,
  control.length + ' fichero(s)');
/* EL CONTROL DE LA EXCLUSIÓN, para que no sea una puerta trasera. Una carpeta
   que se saca del barrido tiene que demostrar que es lo que dice ser: en
   `canon/` puede aparecer el PARÁMETRO del motor (`nBypass`) y la PROCEDENCIA
   declarada, pero NO un recuento de subcadenas de una planta — que es el dato
   cuya ausencia este banco certifica. Si algún día alguien mete una ficha de
   planta ahí para esquivar el barrido, esto se pone rojo. */
{
  const txt = canon.map(f => { try { return fs.readFileSync(f, 'utf-8').toLowerCase(); } catch { return ''; } });
  const conSub = canon.filter((f, i) => /subcaden|sub-caden/.test(txt[i])).map(f => path.relative(ROOT, f));
  T('CONTROL de la exclusión · `canon/` no esconde ningún recuento de subcadenas',
    conSub.length === 0, canon.length + ' ficheros mirados' + (conSub.length ? ' · ' + conSub.join(', ') : ''));
  const contrato = canon.findIndex(f => /backtracking\.contrato\.json$/.test(f));
  T('CONTROL de la exclusión · el contrato SÍ declara la procedencia de `nb`',
    contrato >= 0 && /"?nb"?/.test(txt[contrato]) && /procedencia|fuente|origen/.test(txt[contrato]),
    contrato >= 0 ? path.relative(ROOT, canon[contrato]) : 'NO ESTÁ el contrato');
}
const reales = Object.entries(aciertos).filter(([p, fs_]) => p !== 'subcaden' || fs_.some(x => !/elburgo_layout/.test(x)));
T('ninguna ficha de planta trae el recuento de subcadenas',
  reales.length === 0,
  Object.keys(aciertos).length ? 'aciertos: ' + JSON.stringify(aciertos).slice(0, 120) : 'cero en los 13 patrones');

/* ── la página lo declara ───────────────────────────────────────────────── */
T('existe `nbDe()` y devuelve valor Y procedencia',
  /function nbDe\(\)\{[\s\S]{0,400}?fuente:/.test(html));
T('`cfg()` toma nb de nbDe(), no del campo a pelo',
  /nbp:\s*nbDe\(\)\.n\b/.test(html) && !/nbp:\s*Math\.round\(\+\$\('nbp'\)\.value\)/.test(html));
T('el informe publica la procedencia donde publica el número',
  (html.match(/nbFuente/g) || []).length >= 3,
  (html.match(/nbFuente/g) || []).length + ' apariciones de nbFuente');

/* ── la rama de la ficha se EJECUTA, con planta sintética ───────────────── */
/* NO se extrae el bloque de física: lo que se evalúa es el cuerpo de `nbFicha`,
   que no depende de sol.js ni de irradiancia.js. La primera versión declaraba los
   índices del bloque y no los usaba —línea muerta— y el banco de física la tomó,
   con razón, por un extractor mal hecho. */
const cuerpo = html.slice(html.indexOf('function nbFicha()'), html.indexOf('function nbDe()'));
T('el corte de nbFicha no está vacío', cuerpo.length > 120, cuerpo.length + ' caracteres');
const nbFicha = new Function('PLANT_REAL', cuerpo + '\n return nbFicha();');
T('sin planta cargada, la ficha no da nada', nbFicha(null) === null);
T('con planta SIN el dato, tampoco', nbFicha({ segs: [], segTilt: [] }) === null);
for (const [obj, esperado, como] of [
  [{ nBypass: 3 }, 3, 'P.nBypass'],
  [{ nb: 1 }, 1, 'P.nb'],
  [{ modulo: { subcadenas: 4 } }, 4, 'P.modulo.subcadenas'],
  [{ ficha: { nBypass: 0 } }, 0, 'P.ficha.nBypass'],
]) T('con planta que SÍ lo trae, lo usa (' + como + ')', nbFicha(obj) === esperado,
     'devuelve ' + nbFicha(obj));
/* CONTROL NEGATIVO: un valor imposible NO se acepta — si lo aceptara, la rama
   de la ficha colaría cualquier cosa que apareciera en un JSON */
T('CONTROL · un valor fuera de rango se rechaza',
  nbFicha({ nBypass: 99 }) === null && nbFicha({ nBypass: -1 }) === null && nbFicha({ nBypass: 'dos' }) === null);

console.log('\n' + ok + ' OK · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
