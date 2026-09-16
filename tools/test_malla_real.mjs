/* LA MALLA REAL: de los tres CSV al GeoJSON, sin navegador.
 *
 * Este es el PASO DE VUELTA del viaje a la planta, y hasta ahora no existia: el
 * leeme mandaba correr `python3 adaptador_elburgo.py`, un fichero que no esta en
 * el repo ni viaja en el ZIP. El Burgo tiene su malla porque alguien corrio ese
 * script en su casa; ninguna otra planta podia tenerla.
 *
 * NO SE COMPRUEBA CONTRA MI PROPIA IMPLEMENTACION. La red de prueba es minuscula
 * a proposito —cuatro nodos, dos capturas— para que cada numero esperado se pueda
 * sacar a mano y escribirlo aqui. Un banco que llama a la funcion y compara con lo
 * que la funcion devolvio no comprueba nada.
 *
 *   node tools/test_malla_real.mjs
 *   MUTA=<clave> node tools/test_malla_real.mjs     (prueba de mutacion: TIENE que salir rojo)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const i0 = html.indexOf('/* MALLA-INI');
const i1 = html.indexOf('/* MALLA-FIN');
if (i0 < 0 || i1 < 0) { console.error('no encuentro MALLA-INI / MALLA-FIN'); process.exit(1); }
let bloque = html.slice(i0, html.indexOf('*/', i1) + 2);

/* MUTACIONES. Cada una rompe UNA cosa concreta del calculo; si el banco sigue verde
   con una de ellas puesta, esa comprobacion no estaba comprobando nada. */
const MUTACIONES = {
  mediana:    [/return b\.length%2 \? b\[m\] : Math\.round\(\(b\[m-1\]\+b\[m\]\)\/2\);/, 'return b[0];'],
  distancia:  [/Math\.round\(Math\.hypot\(dla,dlo\*Math\.cos\(la\)\)\*R\)/, 'Math.round(Math.hypot(dla,dlo)*R)'],
  dominante:  [/if\(a\.padres\[p\]>mx\)\{mx=a\.padres\[p\];dom=p;\}/, 'if(a.padres[p]<mx){mx=a.padres[p];dom=p;}'],
  descend:    [/par\(n\)\.pasan\.add\(dest\);/, 'par(n).pasan.add(n);'],
  spof:       [/is_spof:\(apc\[id\]\|\|0\)\/N>=UMBRAL/, 'is_spof:false'],
  ackUltimo:  [/if\(r\.ack!=null\)e\.ack=r\.ack;/, 'if(r.ack!=null&&e.ack==null)e.ack=r.ack;'],
  freq:       [/freq:aristas\[p\.padre_dominante\+'>'\+p\.id\]\|\|0/, 'freq:0'],
  sinCoord:   [/if\(!c\)\{ sinCoord\.push\(id\); continue; \}/, 'if(!c){ continue; }'],
  hops:       [/a\.rutas\+\+; a\.hops\.push\(ids\.length-1\);/, 'a.rutas++; a.hops.push(1);'],
};
const MUTA = process.env.MUTA;
if (MUTA) {
  const m = MUTACIONES[MUTA];
  if (!m) { console.error('mutacion desconocida. Hay: ' + Object.keys(MUTACIONES).join(', ')); process.exit(2); }
  const antes = bloque;
  bloque = bloque.replace(m[0], m[1]);
  if (bloque === antes) { console.error('la mutacion «' + MUTA + '» no caso con el codigo (¿cambio el fuente?)'); process.exit(2); }
  console.log('### MUTACION «' + MUTA + '» PUESTA: este banco TIENE que salir rojo\n');
}
const F = new Function(bloque + ';return {parseCSV,objs,digits,medianaDe,distM,articulationPoints,' +
                       'filasDeLog,coordsDe,snapsDeRutas,mallaReal};')();

/* ── LA RED DE PRUEBA ────────────────────────────────────────────────────────
     COORD ──► A ──┬─► B        A es punto de articulacion: si cae, B y D se quedan
       │           └─► D        sin ruta. B, C y D son hojas.
       └───► C

   DOS descendientes detras de A, y no uno, por una razon concreta: con un solo
   nodo detras, «contar nodos DISTINTOS» y «contar VECES» dan los dos 1 y la
   prueba no distingue una de otra. Lo encontro la mutacion `descend`, que pasaba
   desapercibida con la red pequeña.

   Dos capturas identicas (t1, t2), cuatro filas de ruta cada una:
     COORD>A     COORD>A>B     COORD>A>D     COORD>C
   ───────────────────────────────────────────────────────────────────────────── */
const RUTAS_CSV = [
  'timestamp,path_ids',
  '2026-09-01 10:00:00,COORD>A',
  '2026-09-01 10:00:00,COORD>A>B',
  '2026-09-01 10:00:00,COORD>A>D',
  '2026-09-01 10:00:00,COORD>C',
  '2026-09-01 10:10:00,COORD>A',
  '2026-09-01 10:10:00,COORD>A>B',
  '2026-09-01 10:10:00,COORD>A>D',
  '2026-09-01 10:10:00,COORD>C',
].join('\n') + '\n';

/* A: dos lecturas, -60 y -70 -> mediana PAR = -65 (es el caso que se redondea)
   B: una sola, -80.   C: sin RSSI (nunca respondio) -> null, no cero
   ACK del XBee es ACUMULATIVO: vale el ULTIMO, no el primero ni la suma */
const LOG_CSV = [
  'timestamp,gateway,node_id,role,ext_addr,online,rssi_dbm,ack_failures',
  '2026-09-01 10:00:00,GW-01,A,TCU,0013A200,1,-60,10',
  '2026-09-01 10:10:00,GW-01,A,TCU,0013A200,1,-70,25',
  '2026-09-01 10:00:00,GW-01,B,TCU,0013A201,1,-80,3',
  '2026-09-01 10:10:00,GW-01,C,TCU,0013A202,0,,',
  '2026-09-01 10:00:00,GW-01,D,TCU,0013A203,1,-90,7',
].join('\n') + '\n';

/* 0,001 grados de latitud = 0,001·(pi/180)·6371000 = 111,19 m -> 111
   0,001 grados de longitud a 41,5 N = 111,19·cos(41,5) = 83,28 m -> 83
   (calculado aparte, no con la funcion que se esta probando) */
const COORDS_CSV = [
  'node_id,lat,lon',
  'COORD,41.500000,-0.800000',
  'A,41.501000,-0.800000',
  'B,41.501000,-0.799000',
  'C,41.500000,-0.801000',
  'D,41.502000,-0.800000',
].join('\n') + '\n';

const rows   = F.filasDeLog(LOG_CSV);
const rutas  = F.snapsDeRutas(RUTAS_CSV);
const coords = F.coordsDe(COORDS_CSV);
const g      = F.mallaReal(rows, rutas, coords, { planta: 'prueba' });

const P = {}, L = {};
for (const f of g.features) {
  if (f.geometry.type === 'Point') P[f.properties.id] = f.properties;
  else L[f.properties.origen + '>' + f.properties.destino] = f.properties;
}
/* SIN VOLCADO DE PILA. Con `padre_dominante` roto no sale ni un enlace, y el banco
   moria leyendo `ln('A>B').freq` — rojo, si, pero sin decir que pasaba. Lo encontro
   la mutacion `dominante`. Un banco que se cae no esta informando: esta fallando.
   Se devuelve un hueco vacio y cada comprobacion dice lo suyo. */
const HUECO = new Proxy({}, { get: () => undefined });
const pt = id => P[id] || HUECO;
const ln = k => L[k] || HUECO;

/* ---- el periodo ---- */
check('cuenta las filas de ruta del periodo (8) y las capturas (2)',
      g.periodo_filas_routes === 8 && g.snapshots === 2,
      g.periodo_filas_routes + ' filas / ' + g.snapshots + ' capturas');
check('saca cinco nodos y cuatro enlaces (un arbol: un enlace por nodo con padre)',
      Object.keys(P).length === 5 && Object.keys(L).length === 4,
      Object.keys(P).length + ' nodos / ' + Object.keys(L).length + ' enlaces');
/* El coordinador no es destino de ninguna ruta NI sale en el registro: entra por el
   unico camino que queda, que es ser origen de un salto. Si se pierde, la malla se
   dibuja sin el nodo del que cuelga todo. */
check('el COORD entra aunque no sea destino de ninguna ruta ni salga en el registro',
      pt('COORD').role === 'COORD', pt('COORD').role || 'no esta');

/* ---- lo que se calcula por nodo, a mano ---- */
check('A sale en 2 rutas propias y a 1 salto',
      pt('A').rutas === 2 && pt('A').hop_tipico === 1, pt('A').rutas + ' rutas / ' + pt('A').hop_tipico + ' saltos');
check('B esta a 2 saltos, que es por donde se ve la profundidad',
      pt('B').hop_tipico === 2, pt('B').hop_tipico);
check('A tiene UN padre distinto (COORD) y es su dominante',
      pt('A').padres_distintos === 1 && pt('A').padre_dominante === 'COORD',
      pt('A').padres_distintos + ' / ' + pt('A').padre_dominante);
check('B cuelga de A', pt('B').padre_dominante === 'A', pt('B').padre_dominante);
/* DESCENDIENTES SON NODOS DISTINTOS, no veces. B pasa por A en las dos capturas y
   sigue siendo UN nodo el que depende de A: contar veces diria 2 y solo estaria
   midiendo cuanto se sondeo. */
/* DOS, no cuatro: B y D pasan por A en las DOS capturas. Contar veces daria 4 y
   solo estaria midiendo cuanto se sondeo, no a cuantos deja sin ruta si cae. */
check('de A dependen 2 nodos (B y D), contados una vez y no una por captura',
      pt('A').descendientes === 2, pt('A').descendientes);
check('y de las hojas no depende nadie',
      pt('B').descendientes === 0 && pt('C').descendientes === 0 && pt('D').descendientes === 0,
      [pt('B').descendientes, pt('C').descendientes, pt('D').descendientes].join(' / '));
/* A es punto de articulacion en las DOS capturas -> cronico. Ese es justo el nodo
   que hay que reforzar, y el que la pagina pinta en rojo. */
check('A es SPOF cronico (articulacion en el 100 % de las capturas)',
      pt('A').is_spof === true && pt('A').spof_frac === 1, pt('A').is_spof + ' / ' + pt('A').spof_frac);
check('y ni B ni C ni D lo son',
      pt('B').is_spof === false && pt('C').is_spof === false && pt('D').is_spof === false);

/* ---- lo que viene del registro ---- */
check('el RSSI es la MEDIANA del periodo, redondeada con lecturas pares (-60,-70 -> -65)',
      pt('A').rssi_med_dbm === -65, pt('A').rssi_med_dbm);
check('con una sola lectura, esa (-80)', pt('B').rssi_med_dbm === -80, pt('B').rssi_med_dbm);
/* Un nodo que no respondio nunca tiene RSSI DESCONOCIDO. Un cero ahi se pinta como
   la mejor cobertura de la planta. */
check('un nodo sin RSSI sale a null, NO a cero', pt('C').rssi_med_dbm === null, pt('C').rssi_med_dbm);
check('el ACK acumulado es el ULTIMO valor del periodo (25), no el primero ni la suma',
      pt('A').ack_failures === 25, pt('A').ack_failures);
check('y el gateway sale del propio registro', pt('A').gw === 'GW-01', pt('A').gw);

/* ---- los enlaces ---- */
check('0,001 grados de latitud son 111 m', ln('COORD>A').distancia_m === 111, ln('COORD>A').distancia_m);
/* Si no se encoge la longitud por el coseno de la latitud, esto sale 111 y no 83:
   es el fallo clasico de tratar grados como si fueran cuadrados. */
check('y 0,001 de longitud a 41,5 N son 83 m, no 111 (coseno de la latitud)',
      ln('A>B').distancia_m === 83, ln('A>B').distancia_m);
/* `freq` cuenta FILAS DE RUTA que contienen ese salto: COORD>A aparece en «COORD>A»
   y tambien dentro de «COORD>A>B», dos por captura y dos capturas = 4. Es lo que
   dice si un vano esta cargado, y por eso no es lo mismo que las rutas del nodo. */
check('COORD>A va en 6 filas de ruta (3 por captura), mas que las 2 rutas propias de A',
      ln('COORD>A').freq === 6 && pt('A').rutas === 2, ln('COORD>A').freq);
check('A>B va en 2', ln('A>B').freq === 2, ln('A>B').freq);
/* El recolector da UN RSSI POR NODO (el de su ultimo salto), no uno por vano: se
   cuelga del enlace al padre dominante y en ningun otro. */
check('el RSSI del enlace es el del nodo de destino', ln('A>B').rssi_medido_dbm === -80, ln('A>B').rssi_medido_dbm);

/* ---- lo que NO se inventa ---- */
check('la calibracion va a null: sale del ajuste del barrido, no de estos CSV',
      g.calibracion === null && /MALLA/.test('MALLA'), g.calibracion);
check('deja dicho de donde salio y con que umbral',
      g.generado && g.generado.planta === 'prueba' && g.generado.umbral_spof === 0.5 &&
      /index\.html/.test(g.generado.por), JSON.stringify(g.generado));

/* ---- un nodo sin coordenada no puede desaparecer en silencio ---- */
{
  const sinC = F.coordsDe('node_id,lat,lon\nA,41.501000,-0.800000\nCOORD,41.5,-0.8\n');
  const g2 = F.mallaReal(rows, rutas, sinC, {});
  const ids2 = g2.features.filter(f => f.geometry.type === 'Point').map(f => f.properties.id);
  check('los nodos sin coordenada se DECLARAN, no se caen sin avisar',
        g2.nodos_sin_coordenada.sort().join(',') === 'B,C,D' && ids2.sort().join(',') === 'A,COORD',
        JSON.stringify(g2.nodos_sin_coordenada) + ' / dibujados ' + JSON.stringify(ids2));
}
/* ---- casos vacios: se vuelve de la planta con un CSV a medias mas veces de lo que
        uno querria, y eso no puede reventar ---- */
{
  const vacio = F.mallaReal([], F.snapsDeRutas('timestamp,path_ids\n'), coords, {});
  check('sin rutas ni registro sale un GeoJSON valido y vacio, sin reventar',
        vacio.type === 'FeatureCollection' && vacio.features.length === 0 && vacio.snapshots === 0);
  const soloLog = F.mallaReal(rows, F.snapsDeRutas('timestamp,path_ids\n'), coords, {});
  check('solo con el registro salen los nodos, sin enlaces',
        soloLog.features.length === 4 && soloLog.features.every(f => f.geometry.type === 'Point'),
        soloLog.features.length);
}

/* ---- COMPATIBILIDAD CON LO QUE LA PAGINA YA DIBUJA ----
   La malla de El Burgo esta commiteada y la pagina la lee al abrirse. Lo que se
   exporte tiene que traer las mismas propiedades que ella, o la planta que mida
   manana se vera peor que El Burgo sin que nadie sepa por que. */
{
  const real = JSON.parse(fs.readFileSync(path.join(RAIZ, 'elburgo_real.geojson'), 'utf8'));
  /* Sin un feature de ese tipo no hay claves que mirar: se devuelve vacio y la
     comprobacion dice cual falta, en vez de morir aqui leyendo `.properties` de
     undefined. Es el mismo motivo que el HUECO de arriba. */
  const clavesDe = (col, tipo) => { const f = col.features.find(x => x.geometry.type === tipo);
    return new Set(f ? Object.keys(f.properties) : []); };
  /* Las que la PAGINA lee de verdad (buscadas en index.html: PRED.nodes / PRED.edges
     y el popup de la malla). Son estas las que no pueden faltar. */
  const LEE_NODO = ['id','etiqueta','role','is_spof','descendientes','rutas',
                    'rssi_med_dbm','ack_failures','hop_tipico','padres_distintos',
                    'padre_dominante','gw'];
  const mias = clavesDe(g, 'Point'), suyas = clavesDe(real, 'Point');
  check('exportamos todas las propiedades de nodo que la pagina lee',
        LEE_NODO.every(k => mias.has(k)), LEE_NODO.filter(k => !mias.has(k)).join(','));
  check('y el fichero de El Burgo tambien las traia (o sea: es el mismo formato)',
        LEE_NODO.every(k => suyas.has(k)), LEE_NODO.filter(k => !suyas.has(k)).join(','));
  const LEE_ENLACE = ['origen','destino','distancia_m','rssi_medido_dbm','freq','gw'];
  const miasL = clavesDe(g, 'LineString');
  check('y las del enlace', LEE_ENLACE.every(k => miasL.has(k)),
        LEE_ENLACE.filter(k => !miasL.has(k)).join(','));
  /* El Burgo: 53 puntos y 52 lineas. Ese «uno menos» es la firma de un arbol —un
     enlace por nodo, al padre dominante— y es lo que aqui se reproduce. */
  const pr = real.features.filter(f => f.geometry.type === 'Point').length;
  const lr = real.features.filter(f => f.geometry.type === 'LineString').length;
  check('El Burgo es un arbol (52 enlaces para 53 nodos) y lo exportado tambien',
        lr === pr - 1 && Object.keys(L).length === Object.keys(P).length - 1,
        'real ' + pr + '/' + lr + ' · nuestro ' + Object.keys(P).length + '/' + Object.keys(L).length);
}

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
if (MUTA) {
  console.log(ko ? '\n### bien: la mutacion «' + MUTA + '» sale roja'
                 : '\n### MAL: la mutacion «' + MUTA + '» pasa desapercibida');
  process.exit(ko ? 0 : 1);
}
process.exit(ko ? 1 : 0);
