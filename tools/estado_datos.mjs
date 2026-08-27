/* QUÉ TIENE Y QUÉ LE FALTA A CADA PLANTA, en una tabla.

   Lo que sabemos de cada planta está repartido entre once layouts, seis ficheros de la toolbox del
   SCADA, los CSV de cobertura y unas cuantas notas. Saber si a Páramo le falta el vallado o si a San
   José le falta el gateway de sus HSU exige abrir cuatro sitios, y por eso se olvida.

   Esto no calcula nada nuevo: LEE lo que hay y dice qué hueco queda y QUIÉN puede taparlo, que es la
   parte que se pierde. Un hueco sin dueño se queda para siempre.

       node tools/estado_datos.mjs                tabla y lista de huecos
       node tools/estado_datos.mjs --pendientes   solo los huecos, para pegar en un parte

   NO FALLA NUNCA. No es un banco: es un inventario. Que a una planta le falte el vallado no es un
   error que arreglar aquí, es un dato que no tenemos — y decirlo en voz alta es justo el trabajo. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const SOLO = process.argv.includes('--pendientes');

const TOOLBOX = ['/home/user/SCADA/tools/tcu-toolbox/plantas/',
  new URL('../../SCADA/tools/tcu-toolbox/plantas/', import.meta.url).pathname,
  new URL('../../scada/tools/tcu-toolbox/plantas/', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });
const FICHERO_TB = { ayora: '24025-ayora.json', sanjose: '24019-san-jose.json', fayon: '24007-fayon.json',
  tunez: '24021-tunez.json', bagnarelli: '24030-bagnarelli.json', elburgo: 'elburgo.json' };

/* QUIÉN PUEDE CERRAR CADA HUECO. Escrito a la vista, como el mapa de códigos de indice_plantas.mjs:
   es una decisión sobre el reparto de trabajo, no algo que se deduzca de los ficheros. */
const DUENO = {
  fence: 'el DWG · hace falta el plano, aquí no hay ninguno',
  roads: 'el DWG · idem, y tools/extract_roads.mjs los saca cuando lo haya',
  hsu_ncu: 'la toolbox o el campo · ver la nota de la planta, que dice cuál de las dos',
  hsu_gw: 'una pasada de make_plantas.py --excel · la hoja lo dice en su columna RSU y hoy se pierde',
  hsu_esclavo: 'campo o la hoja · el Excel todavía no trae columna de esclavo de HSU salvo en Ayora',
  rep_ncu: 'el DWG o el listado del cliente',
  rep_gw: 'campo o el Excel de comunicaciones',
  toolbox: 'ips.html → ⬇ JSON toolbox · esa planta no tiene fichero de topología',
  cobertura: 'nada: se genera con tools/gen_coords_cobertura.py',
};

const num = (v, w) => String(v).padStart(w);
const filas = [], huecos = [];

for (const f of readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort()) {
  const n = f.replace('_layout.json', '');
  const L = JSON.parse(readFileSync(RAIZ + f, 'utf8'));
  const M = L.meteo || [], R = L.reps || [], C = L.ncus || [];
  const T = L.trackers || [], F = L.fijas || [];
  const cuenta = (a, k) => a.filter(x => x[k] != null).length;

  const r = {
    planta: n,
    /* Túnez es las DOS cosas —19 seguidores y 14 mesas fijas— y Dicayagua repite las mismas mesas
       en los dos arrays. Sumar a ciegas contaba a Dicayagua dos veces: 10.986 en vez de 5.493. */
    unidades: L.fija ? F.length : T.length + F.length,
    ncus: C.length,
    fence: (L.fence || []).length,
    roads: (L.roads || []).length,
    montaje: L.montaje ? (L.montaje.tipo || '').replace('Mount', '') : '—',
    hsu: M.length, hsu_ncu: cuenta(M, 'ncu'), hsu_gw: cuenta(M, 'gw'), hsu_esc: cuenta(M, 'esclavo'),
    rep: R.length, rep_ncu: cuenta(R, 'ncu'), rep_gw: cuenta(R, 'gw'), rep_esc: cuenta(R, 'esclavo'),
    tb: !!(TOOLBOX && FICHERO_TB[n] && existsSync(TOOLBOX + FICHERO_TB[n])),
    cob: existsSync(`${RAIZ}cobertura_coords/${n}/coords_${n}.csv`),
    act: existsSync(`${RAIZ}${n}_activo.geojson`),
    nota: !!(L.meteo_nota || L.reps_nota),
  };
  filas.push(r);

  const falta = (que, txt) => huecos.push({ planta: n, que, txt, dueno: DUENO[que] || '—' });
  if (!r.fence) falta('fence', 'sin vallado: el GeoJSON de activo sale sin parcela');
  if (!r.roads && r.unidades > 100) falta('roads', 'sin caminos');
  if (r.hsu && r.hsu_ncu < r.hsu) falta('hsu_ncu', `${r.hsu - r.hsu_ncu} de ${r.hsu} HSU sin NCU`);
  if (r.hsu && r.hsu_gw < r.hsu) falta('hsu_gw', `${r.hsu - r.hsu_gw} de ${r.hsu} HSU sin gateway`);
  if (r.hsu && r.hsu_esc < r.hsu) falta('hsu_esclavo', `${r.hsu - r.hsu_esc} de ${r.hsu} HSU sin esclavo Modbus`);
  if (r.rep && r.rep_gw < r.rep) falta('rep_gw', `${r.rep - r.rep_gw} de ${r.rep} repetidores sin gateway`);
  if (!r.tb && FICHERO_TB[n] === undefined && r.ncus) falta('toolbox', 'sin fichero de topología en la toolbox');
  if (!r.cob && r.ncus) falta('cobertura', 'sin CSV de cobertura');
}

if (!SOLO) {
  console.log('planta       unid  NCU  parc  cam  montaje             HSU ncu/gw/esc   REP ncu/gw/esc   tbox  cob  act  nota');
  for (const r of filas) {
    console.log('  ' + r.planta.padEnd(11) + num(r.unidades, 5) + num(r.ncus, 5) + num(r.fence, 6) + num(r.roads, 5) +
      '  ' + String(r.montaje).padEnd(18) +
      num(r.hsu, 4) + ' ' + `${r.hsu_ncu}/${r.hsu_gw}/${r.hsu_esc}`.padEnd(11) +
      num(r.rep, 5) + ' ' + `${r.rep_ncu}/${r.rep_gw}/${r.rep_esc}`.padEnd(11) +
      (r.tb ? ' sí ' : ' —  ') + (r.cob ? '  sí ' : '  —  ') + (r.act ? ' sí ' : ' —  ') + (r.nota ? ' sí' : ' —'));
  }
  console.log('\nHSU y REP se leen «cuántas tienen el dato / cuántas hay». `nota` es que la planta trae un aviso escrito');
  console.log('en el layout (meteo_nota o reps_nota) que conviene leer antes de configurar nada.\n');
}

console.log(`huecos (${huecos.length}), y quién los cierra:\n`);
const porDueno = {};
for (const h of huecos) (porDueno[h.dueno] = porDueno[h.dueno] || []).push(h);
for (const d of Object.keys(porDueno).sort()) {
  console.log('· ' + d);
  for (const h of porDueno[d]) console.log('    ' + h.planta.padEnd(11) + h.txt);
}
console.log('\n(inventario: esto no falla nunca. Un hueco es un dato que no tenemos, no un error que arreglar aquí)');
