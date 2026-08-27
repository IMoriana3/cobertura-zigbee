/* Saca del DWG la RETÍCULA DE APOYOS por tipo de seguidor y la inyecta en
 * <planta>_layout.json bajo la clave `pilotes`.
 *
 * POR QUÉ
 * La retícula de El Burgo —los círculos de los bloques del Tierras.dwg: Interior 8
 * apoyos por tubo, Exterior 10, Medio 4— se transcribió A MANO y vivió como
 * literal dentro de `terreno.html`, con el nombre de la planta en un `if`. Ya está
 * en el layout de su planta, que es donde va, pero la siguiente planta que traiga
 * su DWG no debería volver a transcribirse a mano. Esto lo saca.
 *
 * QUÉ HACE
 *   1. lee los CIRCLE del DWG (los apoyos son círculos en el plano de tierras);
 *   2. asigna cada uno a su seguidor más cercano del layout;
 *   3. lo proyecta sobre el EJE DEL TUBO de ese seguidor (0 en su punto de
 *      inserción, + hacia el rumbo `rot`), que es el marco en el que la usan
 *      Cobertura 3D y el simulador de cobertura RF;
 *   4. agrupa por TIPO de seguidor y saca las X de la retícula de cada tipo.
 *
 * NO ADIVINA QUÉ CÍRCULO ES UN APOYO. Un DWG trae círculos de todo: arquetas,
 * picas, hitos. Sin `--capa` o `--radio` la herramienta NO extrae nada: enseña el
 * inventario de capas y radios y te deja elegir. Adivinar aquí es meter apoyos
 * fantasma en el render de una planta.
 *
 * Uso:
 *   node tools/extract_dwg_pilotes.mjs <archivo.dwg> <planta>_layout.json
 *        [--capa <regex>] [--radio <min>,<max>] [--tol <m>] [--write]
 *
 *   node tools/extract_dwg_pilotes.mjs tierras.dwg elburgo_layout.json
 *        --capa 'SOPORTE|APOYO' --write
 *
 * Como las demás herramientas de DWG del repo, el lector nativo va aparte:
 *   npm i @mlightcad/libredwg-web
 * Se importa solo al leer un DWG, así que el banco (`test_pilotes_dwg.mjs`)
 * corre sin él.
 *
 * SIN DWG NO HAY PRUEBA DE PUNTA A PUNTA. No hay ninguno en el repo. Lo que sí
 * está probado es el núcleo, que es puro: el banco le da círculos sintéticos
 * construidos desde la retícula publicada de El Burgo y sus 215 seguidores
 * reales, y exige que devuelva esa misma retícula — con dispersión de replanteo,
 * con el eje girado y con un círculo que no es un apoyo. El día que aparezca un
 * DWG, lo que quede por comprobar es cómo se leen los CIRCLE, no la geometría.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/* Rumbo del eje -> vector unitario a lo largo del tubo, en el marco (x, n) del
   layout. `rot` es el rumbo en GRADOS al este del norte de cuadrícula (rot 0 =
   eje norte-sur), la misma convención que el layout y que `locXN` del visor. */
export function ejeDe(rotGrados) {
  const r = (rotGrados || 0) * Math.PI / 180;
  return { ux: Math.sin(r), un: Math.cos(r) };
}

/* Agrupa valores en posiciones, con tolerancia. Devuelve la MEDIANA de cada
   grupo: un apoyo replanteado tiene dispersión de centímetros entre seguidores y
   la media se la lleva un valor suelto. */
export function agrupa(vals, tol) {
  const s = [...vals].sort((a, b) => a - b), grupos = [];
  let act = [];
  for (const v of s) {
    if (act.length && v - act[act.length - 1] > tol) { grupos.push(act); act = []; }
    act.push(v);
  }
  if (act.length) grupos.push(act);
  return grupos.map(g => ({ x: +g[Math.floor(g.length / 2)].toFixed(2), n: g.length }));
}

/* EL NÚCLEO, y es puro a propósito: sin DWG ni ficheros, para poder probarlo.
   `trackers` = [{x, n, rot, tp}], `circulos` = [{x, n}] en el marco del layout.
   Devuelve {porTipo, informe}. */
export function reticulaDesdeCirculos(trackers, circulos, opts = {}) {
  const tol = opts.tol || 0.6;          // tolerancia de agrupado [m]
  const maxTrans = opts.maxTrans || 8;  // un apoyo no se aleja del eje más que media fila
  const span = opts.span || 64.7;       // largo del seguidor completo [m]
  /* Holgura al final del tubo, y va CORTA a propósito: los seguidores de una
     misma línea van casi pegados —en El Burgo 65 m de eje a eje para 64,7 de
     tubo—, así que una holgura generosa se traga los apoyos de puntera del
     vecino colineal y los mete como posiciones nuevas de la retícula (salían
     ±34,5 en un tipo que llega a ±30,5). */
  const margen = opts.margen !== undefined ? opts.margen : 0.5;
  const porTipo = {}, huerfanos = [];

  /* A QUÉ SEGUIDOR PERTENECE UN APOYO. Por la distancia PERPENDICULAR a su tubo,
     no por el punto más cercano: un apoyo de puntera está a 30 m del centro de su
     propio seguidor y a 12 del centro del de al lado, así que «el más cercano» se
     lo lleva el vecino y la retícula sale inventada. Perpendicularmente no hay
     duda: el apoyo está bajo su viga (±filaZ del eje) y a un paso entero del eje
     vecino. Con el largo del tubo como límite por si el plano trae apoyos de otra
     cosa alineados con la fila. */
  /* El largo de cada seguidor. Si el layout no trae `mr` —El Burgo no lo trae—,
     sale del TIPO, con el mismo factor de medio que usa el visor: sin esto un
     medio se mide con el largo del completo y se traga los apoyos del vecino
     colineal (salían ±32,7 en un tipo que llega a ±13,6). */
  const medioF = opts.medioFactor || 0.504;
  const largoDe = t => t.mr || (/medio|corto/i.test(String(t.t || t.tp || '')) ? medioF : 1);
  const ejes = trackers.map(t => ({ t, ...ejeDe(t.rot), half: largoDe(t) * span / 2 + margen }));
  for (const c of circulos) {
    let best = null, bt = Infinity, ba = 0;
    for (const e of ejes) {
      const dx = c.x - e.t.x, dn = c.n - e.t.n;
      const along = dx * e.ux + dn * e.un;        // a lo largo del tubo
      const trans = dx * e.un - dn * e.ux;        // perpendicular (la otra viga del bifilo)
      const at = Math.abs(trans);
      if (at > maxTrans || Math.abs(along) > e.half) continue;
      if (at < bt) { bt = at; best = e.t; ba = along; }
    }
    if (!best) { huerfanos.push(c); continue; }
    const tp = familia(best.tp || best.t);
    (porTipo[tp] = porTipo[tp] || []).push(ba);
  }

  const salida = {}, informe = { huerfanos: huerfanos.length, tipos: {} };
  for (const [tp, vals] of Object.entries(porTipo)) {
    const g = agrupa(vals, tol);
    const nSeg = trackers.filter(t => familia(t.tp || t.t) === tp).length;
    salida[tp] = g.map(q => q.x);
    informe.tipos[tp] = {
      seguidores: nSeg, apoyos: g.length, circulos: vals.length,
      // cuántos círculos cayeron en cada posición: si no es parejo, el replanteo
      // no es regular o la selección de círculos se ha traído algo que no es apoyo
      porPosicion: g.map(q => q.n),
      dispares: g.some(q => q.n !== g[0].n)
    };
  }
  return { porTipo: salida, informe };
}

/* La familia que decide la retícula: interior / exterior / medio. Es la que usan
   `zPfor` en Cobertura 3D y `pilotesDe` en el simulador RF. */
export function familia(tp) {
  const s = String(tp || '');
  if (/exterior/i.test(s)) return 'exterior';
  if (/medio/i.test(s)) return 'medio';
  if (/interior/i.test(s)) return 'interior';
  return 'interior';                     // sin clasificar: la familia más común
}

/* ------------------------------- CLI ------------------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const [dwgPath, jsonPath] = argv.filter(a => !a.startsWith('--'));
  const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
  const WRITE = argv.includes('--write');
  if (!dwgPath || !jsonPath) {
    console.error('uso: node tools/extract_dwg_pilotes.mjs <archivo.dwg> <layout.json> ' +
                  "[--capa <regex>] [--radio <min>,<max>] [--tol <m>] [--write]");
    process.exit(2);
  }
  const { LibreDwg } = await import('@mlightcad/libredwg-web');
  const lib = await LibreDwg.create();
  if (typeof lib.dwg_bmp === 'function') lib.dwg_bmp = () => null;   // la miniatura BMP revienta el WASM en algunos DWG
  const db = lib.convert(lib.dwg_read_data(readFileSync(dwgPath).buffer, 0));
  const todos = (db.entities || []).filter(e => e.type === 'CIRCLE' && e.center);

  if (!todos.length) { console.error('El DWG no trae CIRCLE.'); process.exit(1); }

  const capa = opt('capa'), radio = opt('radio');
  if (!capa && !radio) {
    /* Inventario y nada más: elegir por ti qué círculo es un apoyo es meter
       apoyos fantasma en el render de una planta. */
    const porCapa = {};
    todos.forEach(c => {
      const k = c.layer || '(sin capa)';
      (porCapa[k] = porCapa[k] || { n: 0, r: new Set() });
      porCapa[k].n++; porCapa[k].r.add(+(c.radius || 0).toFixed(3));
    });
    console.log('CIRCLE en el DWG:', todos.length, '— sin --capa ni --radio no extraigo nada.\n');
    console.log('capa'.padEnd(34), 'n'.padStart(6), '  radios (m)');
    Object.entries(porCapa).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => {
      const rs = [...v.r].sort((a, b) => a - b);
      console.log(String(k).padEnd(34), String(v.n).padStart(6), '  ' +
                  (rs.length > 6 ? rs.slice(0, 6).join(' ') + ` … (${rs.length})` : rs.join(' ')));
    });
    console.log('\nElige con --capa <regex> y/o --radio <min>,<max>.');
    process.exit(0);
  }

  const reCapa = capa ? new RegExp(capa, 'i') : null;
  const [rmin, rmax] = (radio || '0,1e9').split(',').map(Number);
  const sel = todos.filter(c => (!reCapa || reCapa.test(c.layer || '')) &&
                                (c.radius || 0) >= rmin && (c.radius || 0) <= rmax);
  console.log('CIRCLE:', todos.length, '| seleccionados:', sel.length);
  if (!sel.length) { console.error('El filtro no deja ningún círculo.'); process.exit(1); }

  const layout = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const { cE, cN } = layout;
  if (!isFinite(cE) || !isFinite(cN)) { console.error('El layout no trae cE/cN (origen UTM).'); process.exit(1); }
  const circulos = sel.map(c => ({ x: c.center.x - cE, n: c.center.y - cN }));

  const { porTipo, informe } = reticulaDesdeCirculos(layout.trackers, circulos,
                                                     { tol: +(opt('tol') || 0.6) });

  console.log('círculos sin seguidor cerca:', informe.huerfanos);
  for (const [tp, q] of Object.entries(informe.tipos))
    console.log(`  ${tp.padEnd(9)} ${String(q.seguidores).padStart(5)} seguidores · ` +
                `${q.apoyos} apoyos por tubo · ${q.circulos} círculos` +
                (q.dispares ? '  ¡DISPAR! círculos por posición: ' + q.porPosicion.join(',') : ''));
  console.log('\npilotes.porTipo =', JSON.stringify(porTipo));

  const dispar = Object.values(informe.tipos).some(q => q.dispares);
  if (dispar) { console.error('\nABORTA: hay posiciones con distinto número de círculos. ' +
                              'O el replanteo no es regular, o el filtro se ha traído algo que no es un apoyo. ' +
                              'No se escribe nada.'); process.exit(1); }
  /* SI LA PLANTA YA TIENE RETÍCULA, no se pisa: se COMPARA. La de El Burgo se
     transcribió a mano de un DWG procesado fuera, así que el día que aparezca ese
     DWG lo primero que hay que saber es si dice lo mismo — no sustituirla en
     silencio por lo que saque una herramienta que nadie ha podido probar contra
     un plano de verdad. */
  const previa = layout.pilotes && layout.pilotes.porTipo;
  if (previa) {
    const dif = [];
    for (const tp of new Set([...Object.keys(previa), ...Object.keys(porTipo)])) {
      const a2 = JSON.stringify(previa[tp] || null), b2 = JSON.stringify(porTipo[tp] || null);
      if (a2 !== b2) dif.push('  ' + tp + '\n    tenía  ' + a2 + '\n    el DWG ' + b2);
    }
    console.log('\nESTA PLANTA YA TENÍA RETÍCULA.',
                dif.length ? 'NO coincide con la del DWG:\n' + dif.join('\n') : 'Coincide con la del DWG.');
    if (dif.length && WRITE && !argv.includes('--force')) {
      console.error('\nABORTA: la retícula del DWG no coincide con la que ya había. ' +
                    'Mírala antes de pisarla; con --force se escribe igualmente.');
      process.exit(1);
    }
  }

  if (WRITE) {
    layout.pilotes = {
      fuente: `círculos del DWG ${dwgPath.split('/').pop()}` + (capa ? ` (capa ${capa})` : '') +
              (radio ? ` (radio ${radio} m)` : ''),
      eje: 'x a lo largo del tubo, 0 en el slew',
      porTipo
    };
    writeFileSync(jsonPath, JSON.stringify(layout));
    console.log('\nescrito:', jsonPath);
  } else console.log('\n(dry-run: pasa --write para guardar)');
}
