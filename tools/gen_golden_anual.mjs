/* Golden de LA CIFRA: la energía por string que estima produccion.html.

   QUÉ ES Y QUÉ NO ES. Los otros dos goldens de esta carpeta
   (golden_energia_notebook.json, golden_ac_notebook.json) son VALIDACIÓN: sus
   números salen de solargpt_core, una autoridad de fuera, y lo que prueban es
   que la portación a JS no se separa del core ni un decimal. Este NO. La cifra
   anual —Σ año por string— no la produce nadie más que esta página: la sacan
   `dayEnergy` × `mapStringW` recorriendo el año día a día, y no hay un segundo
   implementador contra el que carearla. Así que este fichero es un CANARIO, no
   un juez: detecta CAMBIO, no error. Si se pone rojo, la cifra que la página
   le da al usuario ha cambiado, y hay exactamente dos salidas honradas:
     · era un fallo → se arregla, y el canario se queda como estaba;
     · era a propósito → se regenera ESTE fichero y el commit dice CUÁNTO se
       movió la cifra y POR QUÉ. Regenerarlo sin decirlo vacía el canario.

   POR QUÉ HACE FALTA, SIENDO SOLO UN CANARIO. La cifra anual es el número que
   califica un P90, y es el ÚLTIMO de la cadena: cuelga de la geometría, del
   motor de backtracking, del cielo, del lazo de la TCU, del modelo térmico, de
   la bifacialidad y de la degradación. Cualquier toque en cualquiera de esas
   piezas la mueve, y hoy no hay nada que lo cuente: los bancos comprueban
   PROPIEDADES (que la POA es finita, que el BT no sombrea, que el paso del
   tracker es la banda), y una cifra puede moverse un 3 % con todas las
   propiedades intactas.

   POR STRING Y NO SOLO EL TOTAL: un total esconde dos errores que se compensan
   —una fila de más y una de menos—, y la dispersión entre strings es justo lo
   que mide la sombra. El golden guarda el VECTOR. En los casos con backtracking
   pairwise el vector sale casi PLANO (1e-5 kWh de separación en 10 filas), que
   es exactamente lo que promete esa política: sombra de planos cero. Los casos
   que SÍ separan filas son el astro (sin BT: 163,5 contra 172,9 kWh el mismo
   día) y el del lazo libre (166,0 contra 168,3): ahí el vector es el que caza
   una fila que se mueve sin que se mueva el total.

   QUÉ PLANTAS, Y POR QUÉ NO TODAS. La genérica (geometría sintética, no se
   mueve) y El Burgo (x del plano, tampoco). Ayora y San José cuelgan de sus
   ficheros de cotas, que se regeneran a menudo: un golden sobre ellas se
   pondría rojo en PRs ajenos por algo que no es un fallo.

   LA CONFIGURACIÓN VA DENTRO. Cada caso lleva su `cfg` completo en el JSON, el
   mismo objeto que arma `cfg()` en la página con sus valores de arranque, para
   que el número sea reproducible sin leer este generador. El banco recomputa
   desde ESE cfg, no desde uno suyo.

       node tools/gen_golden_anual.mjs > tools/golden_anual.json
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(AQUI);

/* La MISMA extracción en caliente que hacen los bancos: la lógica de la página
   sale de produccion.html y la física de backtracking.html, por sus
   delimitadores-contrato. Cero copias: si esto deja de extraer, es que alguien
   rompió el contrato, y se entera aquí igual que en test_produccion.mjs. */
export function carga(root = ROOT) {
  const bt = fs.readFileSync(path.join(root, 'backtracking.html'), 'utf-8');
  const pg = fs.readFileSync(path.join(root, 'produccion.html'), 'utf-8');
  const sol = fs.readFileSync(path.join(root, 'sol.js'), 'utf-8')
            + '\n' + fs.readFileSync(path.join(root, 'irradiancia.js'), 'utf-8');
  const f0 = bt.indexOf('FÍSICA PURA'), f1 = bt.indexOf('/* FIN-FÍSICA');
  const fis = bt.slice(bt.lastIndexOf('/*', f0), f1);
  const l0 = pg.indexOf('LÓGICA PURA'), l1 = pg.indexOf('/* FIN-LÓGICA');
  if (l0 < 0 || l1 < 0) throw new Error('produccion.html sin delimitadores LÓGICA PURA / FIN-LÓGICA');
  const log = pg.slice(pg.lastIndexOf('/*', l0), l1);
  const ctrl = fs.readFileSync(path.join(root, 'js', 'control_core.js'), 'utf-8');
  return new Function(ctrl + sol + fis + log + `
    return {F:{poaPlant,anglesPairwise,anglesManual,skyWithClouds,pairsFromElevX,nsSegments,
               policyAngles,policyAnglesSeg,poaPlantSeg,anglesAstro,anglesAstroSeg,
               westPorMesa,ejesPorMesa,clearskyIneichen},
            elevPreset, buildT, buildTX, westDeGroups, elburgoRows, elburgoSegs, elburgoGroups,
            tGenerica, tElburgo, ebDe, cfgEB,
            dayEnergy, dayTotals, fechasPeriodo, mapStringW, instant, ctrlDe};`).call(globalThis);
}

/* EL CFG DE ARRANQUE DE LA PÁGINA, a mano. cfg() lee el DOM y aquí no hay DOM,
   así que esto es la traducción literal de sus `value=` — la comprobación de
   que no se ha separado la hace el banco de Chromium (test_produccion_lazo.mjs
   lee la tarjeta de verdad); aquí lo que importa es que el JSON diga con qué
   configuración salió cada número. `tl` NO va: cfg() no lo pone y la página cae
   al 3,5 de dentro de instant(); ponerlo aquí sería estimar otra cosa. */
export const CFG0 = {
  plant: 'generica', ncu: '',
  lat: 41.5763, lon: -0.7981, date: '2026-06-21', tz: 2,
  alt: 300, albedo: 0.20, cc: 0,
  pitch: 6.0, cw: 2.382, maxang: 55, nrows: 10,
  stowNoche: 5,          // dónde duerme la mesa: 5° al este (−5 en la TCU)
  manual: false, manth: 0,
  tpreset: 'pendiente', tparam: 4,
  meteo: 'cielo', tmy: null,
  elec: { mods: 28, wp: 590, gamma: -0.34, tamb: 20, wind: 1, uc: 29, uv: 0 },
  ac: { loss: { soiling: 2.0, mismatch: 2.0, wiring: 1.5, lid: 1.5 },
        ninv: 1, pnomW: 140000, etaMax: 0.985, gridW: 0,
        planta: { trafo: 0, acWire: 0, aux: 0, dispo: 100, degrada: 0, anio: 1, soilMes: null } },
  iamb0: 0.05, horizonte: null,
  incert: { meteo: 4.0, modelo: 3.5, soiling: 1.0, dispo: 0.5, degrada: 0.15 },
  bif: { bifa: 0, perdTras: 10 },
  pol: 'pairwise',
  ctrl: { on: false, db: 1.0, slew: 0.17, cicloSeg: 1, modo: 'libre' },
};

function con(extra) { return JSON.parse(JSON.stringify(Object.assign({}, CFG0, extra))); }

/* LOS CASOS. Uno por camino que puede mover la cifra, y el año completo solo de
   la genérica: a paso horario son ~5 s, que es lo que un banco puede pagar. */
export const CASOS = [
  { id: 'generica_ano_2026_horario',
    ds: 'LA CIFRA: Σ año 2026 por string, genérica de arranque, paso horario — el mismo camino que computePeriod',
    periodo: 'ano', paso: 60, cfg: con({ date: '2026-06-21' }) },
  // POR dayTotals y no por dayEnergy con un paso escrito aquí: el paso del día
  // (5 min) lo elige LA PÁGINA dentro de dayTotals, y si alguien lo afloja a 15
  // para que la vista vaya más suelta, la cifra del día se mueve y esto tiene
  // que cantarlo. Con el paso puesto a mano el mutante «dayTotals a 15 min»
  // sobrevivía: medido.
  { id: 'generica_21jun_dayTotals',
    ds: 'el número que pinta «E string Σ día», por dayTotals y con el paso que elige la página',
    via: 'dayTotals', dias: ['2026-06-21'], paso: null, cfg: con({ date: '2026-06-21' }) },
  { id: 'generica_21dic_5min',
    ds: 'solsticio de INVIERNO: sombra larga todo el día, el caso donde el backtracking manda',
    dias: ['2026-12-21'], paso: 5, cfg: con({ date: '2026-12-21' }) },
  { id: 'generica_21jun_5min_lazo_libre',
    ds: 'con el lazo de la TCU puesto (banda 1°, 0,17°/s, ciclo de 1 s como la TCU real, modo libre): θ ejecutado, no ideal',
    dias: ['2026-06-21'], paso: 5,
    cfg: con({ date: '2026-06-21', ctrl: { on: true, db: 1.0, slew: 0.17, cicloSeg: 1, modo: 'libre' } }) },
  { id: 'generica_21jun_5min_lazo_seguro',
    ds: 'el mismo lazo en modo seguro (arranca contra la sombra aunque no llegue a la banda)',
    dias: ['2026-06-21'], paso: 5,
    cfg: con({ date: '2026-06-21', ctrl: { on: true, db: 2.0, slew: 0.17, cicloSeg: 1, modo: 'seguro' } }) },
  // BANDA ANCHA Y CICLO LARGO. Con el ciclo de la TCU en 1 s el enclavamiento ata
  // SIEMPRE (a 0,17°/s un paso de 1° son seis ciclos), así que el caso que hace
  // falta ahora es el de al lado: un ciclo LARGO, de 60 s, donde el actuador
  // recorre 10,2° por ciclo y cualquier paso cabe en uno. Con los dos, el canario
  // ve los dos regímenes del lazo. (Este caso nació al revés —banda 2,5° y ciclo
  // de 6 s— cuando el canónico era de 1 min y era ESE el régimen raro.)
  { id: 'generica_21jun_5min_lazo_ciclo60s',
    ds: 'banda 2,5° con ciclo de 60 s: el paso cabe en un ciclo y el enclavamiento no llega a atar',
    dias: ['2026-06-21'], paso: 5,
    cfg: con({ date: '2026-06-21', ctrl: { on: true, db: 2.5, slew: 0.17, cicloSeg: 60, modo: 'libre' } }) },
  { id: 'generica_21jun_5min_bifacial_a25',
    ds: 'cara de atrás al 75 % y año 25 con 0,5 %/año: los dos caminos que mapStringW añadió a la cifra',
    dias: ['2026-06-21'], paso: 5,
    cfg: con({ date: '2026-06-21', albedo: 0.25, bif: { bifa: 75, perdTras: 10 },
               ac: Object.assign({}, CFG0.ac, { planta: Object.assign({}, CFG0.ac.planta, { degrada: 0.5, anio: 25 }) }) }) },
  { id: 'generica_21jun_5min_astro',
    ds: 'SIN backtracking (política astro): la referencia contra la que se mide lo que el BT salva',
    dias: ['2026-06-21'], paso: 5, cfg: con({ date: '2026-06-21', pol: 'astro' }) },
  // El Burgo a paso HORARIO y no de 5 min a propósito: son 90 filas, y la sombra
  // por parejas es lo caro del instante — el día entero a 5 min cuesta 65 s, y
  // horario 5,4 s con las mismas 90 filas de geometría del plano puestas a
  // prueba. Un banco que tarda un minuto se acaba desactivando.
  { id: 'elburgo_21jun_horario',
    ds: 'El Burgo entero (x del plano, 823 strings fundidos en columnas) a paso horario: LA CIFRA de la planta real',
    dias: ['2026-06-21'], paso: 60, cfg: con({ plant: 'elburgo', date: '2026-06-21', alt: 180 }) },
  // EL BURGO CON ASTRO, Y ESTE ES EL QUE VIGILA LA GEOMETRÍA. El de arriba, con
  // pairwise, da 90 filas EXACTAMENTE iguales (168,036999040 kWh las noventa):
  // el terreno del plano está a cota 0, y sobre plano el backtracking por
  // parejas promete sombra cero, así que el θ es el mismo en todas y la x de
  // cada columna deja de entrar en el resultado — se midió desplazando las x
  // impares un metro y el canario no se enteró. Sin backtracking sí entra: 52
  // valores distintos entre 164,5 y 170,8 kWh, y ahí un vano que se mueva canta.
  { id: 'elburgo_21jun_horario_astro',
    ds: 'El Burgo SIN backtracking: la sombra entre columnas separa las filas y la x del plano entra en la cifra',
    dias: ['2026-06-21'], paso: 60,
    cfg: con({ plant: 'elburgo', date: '2026-06-21', alt: 180, pol: 'astro' }) },
];

/* La T del motor. NO se arma aquí: se llama a las MISMAS funciones que llama
   `rebuildT()` en la página —`tGenerica` y `tElburgo`, que viven en LÓGICA PURA
   justo para esto—, y de El Burgo se levanta la geometría con `ebDe` y se
   aplican sus overrides con `cfgEB`, igual que hacen `cargaElburgo()` y
   `cfg()`. Con la T copiada aquí el canario NO vigilaba la geometría: se midió
   moviendo un metro las x impares de El Burgo en la página y el canario seguía
   verde, porque el generador usaba las suyas. El cfg que acaba en el golden es
   el RESUELTO, ya con lo que impone la planta levantada. */
export function arma(S, caso, root = ROOT) {
  const c = JSON.parse(JSON.stringify(caso.cfg));
  if (c.plant === 'elburgo') {
    const sj = JSON.parse(fs.readFileSync(path.join(root, 'elburgo_strings.json'), 'utf-8'));
    const lj = JSON.parse(fs.readFileSync(path.join(root, 'elburgo_layout.json'), 'utf-8'));
    const eb = S.ebDe(sj, lj);
    S.cfgEB(c, eb);
    return { c, T: S.tElburgo(S.F, c, eb.rows, eb.trk).obj };
  }
  return { c, T: S.tGenerica(S.F, c).obj };
}

/* El recorrido: los mismos días y el mismo paso que la UI, con mapStringW —el
   único map que debe usarse para energía por string. */
export function corre(S, caso, root = ROOT) {
  const { c, T } = arma(S, caso, root);
  const dias = caso.periodo ? S.fechasPeriodo(c.date, caso.periodo) : caso.dias;
  const map = S.mapStringW(S.F, c, T);
  // un paso que no es un número POSITIVO cuelga el proceso, no falla: dayEnergy
  // avanza `m+=stepMin`, y con null o 0 el bucle del día no termina nunca.
  // Pasado de verdad, reconstruyendo un caso del golden sin su `via`.
  if (caso.via !== 'dayTotals' && !(caso.paso > 0))
    throw new Error(`caso ${caso.id || '(sin id)'}: paso «${caso.paso}» — sin via:'dayTotals' hace falta un paso en minutos`);
  const acc = new Array(c.nrows).fill(0);
  for (const d of dias) {
    // via 'dayTotals': el paso lo pone la página, no el caso (y por eso se vigila)
    const v = caso.via === 'dayTotals'
      ? S.dayTotals(S.F, Object.assign({}, c, { date: d }), T, map)
      : S.dayEnergy(S.F, c, T, d, caso.paso, map);
    for (let k = 0; k < c.nrows; k++) acc[k] += v[k];
  }
  return { cfg: c, dias: dias.length, kwh: acc, total: acc.reduce((a, b) => a + b, 0) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = carga();
  const casos = CASOS.map(k => {
    const r = corre(S, k);
    return { id: k.id, ds: k.ds, periodo: k.periodo || null, dias_iso: k.dias || null,
             dias: r.dias, via: k.via || 'dayEnergy', paso_min: k.paso == null ? null : k.paso,
             cfg: r.cfg, kwh: r.kwh, total_kwh: r.total };
  });
  process.stdout.write(JSON.stringify({
    fuente: 'produccion.html LÓGICA PURA (dayEnergy × mapStringW) + backtracking.html FÍSICA PURA + js/control_core.js',
    tipo: 'canario',
    aviso: 'AUTOGENERADO POR LA PROPIA PÁGINA: detecta CAMBIO en la cifra, no error. Si se pone rojo, o es un fallo y se arregla, o es a propósito y el commit que regenera este fichero dice cuánto se movió la cifra y por qué.',
    genera: 'node tools/gen_golden_anual.mjs > tools/golden_anual.json',
    unidad: 'kWh DC por string (fila), acumulado sobre los días del caso',
    casos,
  }, null, 1) + '\n');
}
