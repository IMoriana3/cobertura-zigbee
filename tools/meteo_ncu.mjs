/* DE QUÉ NCU CUELGA CADA HSU, y con qué autoridad lo sabemos.

   El careo de `plants.yml` del SCADA (tools/test_plants_yml.py, en el repo SCADA) compara el
   `hsu_count` declarado contra `meteo[].ncu` del layout. Es lo que cazó un `hsu_count` corto en El
   Burgo que dejaba TRES DE CUATRO estaciones sin leer. Para que ese careo sirva en más plantas hace
   falta el campo, y para que no MIENTA hace falta saber de dónde sale cada valor. Por eso cada HSU
   escrita lleva también `ncu_origen`.

   PROCEDENCIAS, de más a menos autoridad:

     toolbox   Lo que la casa ya tiene transcrito del Excel de coordenadas, en
               SCADA/tools/tcu-toolbox/plantas/. Cuando trae el índice de HSU (`rsu`), da la NCU, el
               esclavo Modbus y el gateway de cada estación. Hoy: Ayora, entera.
     campo     El Burgo. De los .bat de Sunner y del registro real de la malla, comprobado.
     nombre    Benante y Panbianco. El DWG las llama «HSU 03-02», «HSU 12-06»…, y ese primer número
               es la NCU. Se corrobora con la geometría antes de escribir.
     única     Bagnarelli, Fayón, Túnez. Una sola NCU en la planta: la estación cuelga de ella porque
               no hay otra. No se deduce, se constata.
     dos       Cuando la toolbox dice que una NCU tiene HSU y la geometría encuentra UNA sola
               candidata cerca, con margen. Dos fuentes independientes diciendo lo mismo.
     derivado  Lo que queda: se infiere por cercanía, y con cuentas. Sigue leyendo.

   ── POR QUÉ LA REGLA ES «EL SEGUIDOR MÁS CERCANO» Y NO «LA NCU MÁS CERCANA» ────────────────────

   Lo obvio sería asignar cada HSU a la NCU que tenga más cerca. Se probó contra los casos que ya
   conocemos y FALLA UNO: la HSU 3 de El Burgo está a 280 m de la NCU 1 y a 357 m de la NCU 2, y
   cuelga de la 2. La regla que los acierta todos es la NCU del SEGUIDOR más cercano, que además es
   la que tiene sentido físico: la estación se asocia a la malla que la rodea, no al armario que le
   queda a tiro de regla. Se vuelve a medir con `--calibra`.

   ── Y POR QUÉ NO SE ESCRIBE SIEMPRE ───────────────────────────────────────────────────────────

   Acertar todos los conocidos no autoriza a escribirla en cualquier sitio: autoriza a escribirla
   DONDE SE PARECE a los casos con los que se validó. El margen es a cuánto queda el seguidor de la
   segunda NCU candidata respecto al de la primera; por debajo de MARGEN_MIN no se escribe y se dice
   cuál queda pendiente.

   OJO CON BAJAR ESE UMBRAL. Ayora lo tienta: allí la toolbox confirmó las diez, incluida la HSU 1
   con margen x1,04 —71 m contra 74 m— que este fichero se negó a escribir y que era correcta. Un
   acierto a x1,04 no prueba que la regla funcione a x1,04; prueba que esa vez salió. El umbral se
   mueve cuando haya casos que lo sostengan, no cuando apetezca.

       node tools/meteo_ncu.mjs                  informe con los márgenes
       node tools/meteo_ncu.mjs --write          escribe meteo[].ncu, .gw, .esclavo y sus procedencias
       node tools/meteo_ncu.mjs --calibra        vuelve a medir las reglas contra los casos conocidos

   `gw` Y `esclavo` NO SE DERIVAN NUNCA. Nada en el plano distingue gateway, y sin gateway el esclavo
   sería inventarse el direccionamiento de la malla. Entran solo de la toolbox o de lo que diga la
   casa. Y ojo, porque el patrón de El Burgo NO generaliza: allí las dos HSU de una NCU van una por
   gateway (230 y 231) y en la NCU 15 de Ayora las dos cuelgan del MISMO gateway, el GW1, con esas
   dos mismas direcciones. Lo constante es el par 230/231 por NCU; el reparto entre gateways, no.  */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');
const CALIBRA = process.argv.includes('--calibra');
const PLANTAS = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* El margen del caso más justo de los que validan la regla. Ver la cabecera: no es un número
   redondo elegido a ojo, es el punto hasta donde está comprobada. */
const MARGEN_MIN = 2.51;
/* Cuánto más cerca tiene que estar la candidata única para que valga como corroboración de la
   toolbox. Los casos reales van de x9 a x22, así que x3 es holgado y deja fuera los empates. */
const MARGEN_UNICA = 3;

/* Plantas cuya NCU por HSU viene de fuera de este fichero. Escrito a la vista, como el mapa de
   códigos de indice_plantas.mjs: es una DECISIÓN sobre la procedencia, no un dato del layout. */
const ORIGEN_EXTERNO = {
  elburgo: 'campo · .bat de Sunner y registro real de la malla, comprobado. Cada NCU tiene DOS HSU, una por gateway (230/231)',
};

/* Qué fichero de la toolbox del SCADA es cada planta. Emparejado a mano y revisado. */
const TOOLBOX = {
  ayora: '24025-ayora.json', sanjose: '24019-san-jose.json', fayon: '24007-fayon.json',
  tunez: '24021-tunez.json', bagnarelli: '24030-bagnarelli.json', elburgo: 'elburgo.json',
};
/* Lo que hay que saber de las HSU de una planta y no cabe por estación. */
const NOTA_PLANTA = {
  ayora: 'La NCU 15 tiene DOS HSU, las dos en el GATEWAY 1, con esclavos 230 y 231 (toolbox, del '
       + 'Excel de coordenadas; el GW1 confirmado además por la casa el 2026-08-26). NO es el patrón '
       + 'de El Burgo, donde las dos HSU de una NCU van una por gateway. Lo que se repite en las dos '
       + 'plantas es el PAR 230/231 por NCU; cómo se reparte entre gateways, no. Las otras ocho NCU '
       + 'con HSU llevan una y esclavo 230.',
  polvorin: 'La HSU 2 se queda SIN NCU a propósito, y no por falta de mirar: cae justo en la COSTURA '
       + 'de los dos campos. De los 3 seguidores más cercanos, dos son de la NCU 1 y uno de la 2; de '
       + 'los 10, cinco y cinco; de los 20, diez y diez. El seguidor más cercano es de la NCU 2 a 24 m '
       + 'y el de la 1 está a 27 m: tres metros. La HSU 1 en cambio es limpia —sus 5 más cercanos son '
       + 'todos de la NCU 1—. Esta planta no tiene fichero en la toolbox del SCADA ni CSV de cobertura, '
       + 'y su «GZ» del listado dice 1 y 2, que es indistinguible de un contador (en Bagnarelli ese '
       + 'mismo campo da 1 y 2 con UNA sola NCU). Lo resolvería un export de la toolbox para 25082 o el '
       + 'listado del cliente con su columna de NCU. Con la geometría no se puede, y no es opinable.',

  sanjose: 'Son OCHO HSU, las que dibuja el DWG y las que dice la cartera. El fichero del SCADA '
       + '(24019-san-jose.json) solo declara CINCO —NCU 1, 6, 8, 11 y 21, una en cada una— y eso NO es '
       + 'un desacuerdo, es un export viejo: se generó antes de arreglar `rangos()`, que solo entendía '
       + 'UN tramo por NCU, así que toda NCU con varios tramos se cayó entera y en silencio. Se '
       + 'comprueba: las cinco que faltan —7, 12, 16, 17 y 19— son EXACTAMENTE las cinco de San José '
       + 'con varios tramos (de 4 a 7 por gateway), y las dieciséis que sí están son exactamente las de '
       + 'un tramo. Sin excepciones. Está apuntado en el CONTRATO del SCADA (10/08): hay que '
       + 're-exportarlo desde IPs. Mientras tanto, las tres HSU sin NCU caen justo en esa zona. '
       + 'OJO con los CSV de cobertura_coords: ahí las ocho traen NCU, pero esas tres están puestas por '
       + '«NCU más cercana» —lo dice su manifiesto—, que es la regla que se equivoca. No son dato.',
};

const DIR_TOOLBOX = ['/home/user/SCADA/tools/tcu-toolbox/plantas/',
  new URL('../../SCADA/tools/tcu-toolbox/plantas/', import.meta.url).pathname,
  new URL('../../scada/tools/tcu-toolbox/plantas/', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });

/* ── el «GZ» del listado del cliente, embebido en SCADA/index.html ─────────────────────────────
   Cada planta lleva allí sus `hsus` como [id, gz, x, y, idnum]. El `gz` es la etiqueta del listado
   del cliente y NO SIEMPRE ES LA NCU: en Ayora lo es, en Páramo también, pero en Benante dice
   1,2,3,4 cuando sus NCU son la 3, la 1, la 6 y la 4 —es un simple contador— y en Bagnarelli dice
   «1» y «2» cuando esa planta tiene UNA sola NCU. Fiarse del campo sin mirar es meter tres errores.

   Se acepta como NCU solo si pasa las dos pruebas:

     · todos sus valores son NCU que existen en la planta, y
     · la secuencia NO es 1,2,3…n en el orden del array, que es indistinguible de un contador.

   Con eso entra Páramo —dice 1, 2 y 4, y el 4 es justo lo que un contador no diría— y se quedan
   fuera Benante, Panbianco, Bagnarelli, Túnez y El Polvorín. Los tres primeros porque SABEMOS que
   se equivocan; los dos últimos porque no hay forma de distinguirlo, y en la duda no se escribe. */
const SCADA_HTML = ['/home/user/SCADA/index.html', '/home/user/scada/index.html',
  new URL('../../SCADA/index.html', import.meta.url).pathname,
  new URL('../../scada/index.html', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });
const NOMBRE_SCADA = { ayora: 'AYORA', paramo: 'PARAMO', sanjose: 'SANJOSE', bagnarelli: 'BAGNARELLI',
  tunez: 'TUNEZ', benante: 'BENANTE', panbianco: 'PANBIANCO', polvorin: 'POLVORIN', elburgo: 'BURGO', fayon: 'FAYON' };
let _html = null;
function leeGZ(planta, L) {
  if (!SCADA_HTML || !NOMBRE_SCADA[planta]) return null;
  if (_html === null) _html = readFileSync(SCADA_HTML, 'utf8');
  const i = _html.indexOf('const ' + NOMBRE_SCADA[planta] + '={');
  if (i < 0) return null;
  let j = _html.indexOf('{', i), p = 0, o = null;
  for (let k = j; k < _html.length; k++) {
    if (_html[k] === '{') p++;
    else if (_html[k] === '}' && !--p) { try { o = JSON.parse(_html.slice(j, k + 1)); } catch (e) { } break; }
  }
  const H = o && o.hsus;
  if (!H || H.length !== (L.meteo || []).length) return null;
  const v = H.map(x => String(x[1] ?? '').trim());
  if (v.some(x => !/^\d+$/.test(x))) return null;                 // vacíos o etiquetas de centros: aquí no
  const nums = v.map(Number);
  const existen = new Set((L.trackers || []).map(t => t.ncu));
  if (!nums.every(x => existen.has(x))) return null;              // prueba 1
  if (nums.every((x, k) => x === k + 1)) return null;             // prueba 2: es un contador
  return nums;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.n - b.n);
/* «HSU 03-02» -> 3. También traga «HSU3-2». Lo que no lleve los dos números se queda fuera. */
const ncuDelNombre = s => { const m = /(\d+)\s*-\s*(\d+)/.exec(String(s || '')); return m ? +m[1] : null; };
/* El índice de la estación dentro de la planta: «HSU 7 (US, snow)» -> 7. Es el que empareja con la
   columna `rsu` de la toolbox. */
const indiceHSU = s => { const m = /(\d+)/.exec(String(s || '')); return m ? +m[1] : null; };

/* QUÉ NÚMERO DE NCU ES CADA ARMARIO DEL PLANO. No se saca del rótulo: en Ayora y San José el DWG los
   llama «NCU MU-01_1-21», «NCU 15-10»…, que es la SEGUNDA numeración del proyecto —la de los
   centros— y no el número de NCU. Leer un número de ahí acierta 4 de 16 en Ayora y 3 de 21 en San
   José. Se saca de los seguidores que lo rodean, que sí traen `ncu`, y con eso siempre es el bueno. */
function numNCU(c, L) {
  const t = (L.trackers || []).filter(x => x.ncu != null)
    .map(x => ({ n: x.ncu, d: dist(c, x) })).sort((a, b) => a.d - b.d)[0];
  if (t) return t.n;
  const m = /(\d+)/.exec(String(c.name || ''));      // sin seguidores con NCU, el rótulo es lo que hay
  return m ? +m[1] : null;
}

/* La NCU del seguidor más cercano, y a qué distancia queda el seguidor de la siguiente candidata. */
function porSeguidor(m, L) {
  const mejor = {};
  for (const t of L.trackers || []) {
    if (t.ncu == null) continue;
    const x = dist(m, t);
    if (mejor[t.ncu] == null || x < mejor[t.ncu]) mejor[t.ncu] = x;
  }
  const o = Object.keys(mejor).map(k => ({ n: +k, d: mejor[k] })).sort((a, b) => a.d - b.d);
  if (!o.length) return null;
  return { gana: o[0].n, d1: o[0].d, seg: o[1] ? o[1].n : null, d2: o[1] ? o[1].d : null,
           margen: o[1] ? o[1].d / o[0].d : Infinity };
}

/* ── la toolbox del SCADA ──────────────────────────────────────────────────────────────────────
   Sus entradas son POR GATEWAY —lo dice El Burgo, donde cada NCU tiene una fila por gateway con
   `hsus: 1` y su esclavo—, así que las HSU de una NCU son la suma de sus filas. `rsu` es el índice
   de la estación dentro de la planta, el mismo que numera «HSU 7 (US)»; solo Ayora lo trae, y es lo
   que permite escribir NCU, esclavo y gateway de cada una sin deducir nada.                      */
function leeToolbox(planta) {
  if (!DIR_TOOLBOX || !TOOLBOX[planta]) return null;
  const ruta = DIR_TOOLBOX + TOOLBOX[planta];
  if (!existsSync(ruta)) return null;
  const d = JSON.parse(readFileSync(ruta, 'utf8'));
  const porIndice = {}, maxNCU = {}, escNCU = {}, gwNCU = {}, sinDeclarar = new Set();
  for (const p of d.plantas || []) {
    const mm = /NCU\s*(\d+)/.exec(String(p.nombre || ''));
    if (!mm) continue;
    const ncu = +mm[1], gw = p.puerto === 503 ? 1 : 2;
    sinDeclarar.add(ncu);                                   // luego se resta: aquí «declarada en el fichero»
    if (!p.hsus) continue;
    /* CUÁNTAS HSU TIENE UNA NCU, que no es sumar. `make_plantas.py` escribe el MISMO `hsus` en las
       DOS filas de gateway de una NCU —la estación cuelga de un gateway, pero el Excel no dice de
       cuál—, así que sumando salen el doble: San José daba 9 cuando son 5. Lo dice y lo resuelve ya
       `gen_coords_cobertura.py`, y aquí se hace igual, con una vuelta más: si las filas traen
       ESCLAVOS DISTINTOS, entonces sí son estaciones distintas y se cuentan todas. Es lo que
       distingue El Burgo —GW1 con el 230 y GW2 con el 231, cuatro HSU de verdad— de San José, que no
       trae esclavos y cuyas dos filas son la misma estación contada dos veces. */
    maxNCU[ncu] = Math.max(maxNCU[ncu] || 0, p.hsus);
    /* `hsus_gw` dice cuántas van EN ESE gateway, que es lo que la columna de la hoja sabe y hasta
       ahora se tiraba (SCADA/tools/tcu-toolbox/make_plantas.py, arreglado el 2026-08-26). Todavía no
       aparece en ningún fichero —hace falta una pasada con --excel— así que esto se queda inerte
       hasta que la haya, y entonces entra solo. */
    if (p.hsus_gw) gwNCU[ncu] = (gwNCU[ncu] || []).concat([{ gw, n: p.hsus_gw }]);
    for (const e of p.hsu_esclavos || []) {
      if (!(escNCU[ncu] || []).includes(e)) (escNCU[ncu] = escNCU[ncu] || []).push(e);
    }
    (p.rsu || []).forEach((idx, i) => {
      porIndice[idx] = { ncu, gw, esclavo: (p.hsu_esclavos || [])[i] };
    });
  }
  const porNCU = {};
  for (const k of Object.keys(maxNCU)) porNCU[k] = Math.max(maxNCU[k], (escNCU[k] || []).length);
  const total = Object.values(porNCU).reduce((a, b) => a + b, 0);
  /* EL GATEWAY DE UNA NCU, cuando no hay duda: si de sus dos filas SOLO UNA declara estaciones, la
     estación cuelga de ese gateway y punto. Si las declaran las dos —El Burgo, una por gateway— el
     recuento no basta para decir cuál es cuál, y aquí no se elige: eso lo dice el índice `rsu` o el
     dato de campo. Mejor sin gateway que con el que no es. */
  const gwUnico = {};
  for (const k of Object.keys(gwNCU)) {
    const con = gwNCU[k].filter(x => x.n > 0);
    if (con.length === 1 && con[0].n === 1) gwUnico[k] = con[0].gw;
  }
  return { fichero: TOOLBOX[planta], porIndice, porNCU, total, gwUnico, declaradas: sinDeclarar };
}

const nombres = PLANTAS.length ? PLANTAS
  : readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort().map(x => x.replace('_layout.json', ''));

/* ── los casos con los que se valida, que NO pueden salir de aquí ──────────────────────────────
   En cuanto este fichero escribe, TODAS las plantas tienen `ncu`, y calibrar contra ellas es
   preguntarle a la regla si está de acuerdo consigo misma: daba 34/34, que no significa nada.
   Valen los de la toolbox, los de campo y los que dice el nombre del DWG —que se reconocen sin
   mirar `ncu_origen`, así que siguen valiendo en un layout recién hecho—. Los de una sola NCU no:
   ahí cualquier regla acierta porque no hay dónde fallar.                                        */
function casosValidos() {
  const casos = [];
  for (const n of readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort().map(x => x.replace('_layout.json', ''))) {
    const L = JSON.parse(readFileSync(RAIZ + n + '_layout.json', 'utf8'));
    if ((L.ncus || []).length < 2) continue;
    const tb = leeToolbox(n);
    for (const m of L.meteo || []) {
      /* La toolbox va ANTES del `ncu == null`: conoce estaciones que el layout todavía no tiene
         escritas, y ésas son justo las que mejor prueban la regla. */
      const deTB = tb && tb.porIndice[indiceHSU(m.name)];
      if (deTB) { casos.push({ n, L, m, real: deTB.ncu }); continue; }
      if (m.ncu == null) continue;
      if (ORIGEN_EXTERNO[n] || ncuDelNombre(m.name) != null || /^(campo|nombre)/.test(String(m.ncu_origen || '')))
        casos.push({ n, L, m, real: m.ncu });
    }
  }
  return casos;
}
const CASOS = casosValidos();
const aciertos = CASOS.filter(c => { const s = porSeguidor(c.m, c.L); return s && s.gana === c.real; }).length;
const VALIDADA = `${aciertos}/${CASOS.length}`;

/* ── --calibra ─────────────────────────────────────────────────────────────────────────────────*/
if (CALIBRA) {
  const reglas = {
    'NCU más cercana': (m, L) => {
      const o = (L.ncus || []).map(c => ({ n: numNCU(c, L), d: dist(m, c) })).sort((a, b) => a.d - b.d);
      return o.length ? o[0].n : null;
    },
    'NCU del seguidor más cercano': (m, L) => (porSeguidor(m, L) || {}).gana ?? null,
  };
  console.log(`calibración contra ${CASOS.length} caso(s) de fuente independiente\n`);
  for (const [nom, f] of Object.entries(reglas)) {
    const mal = CASOS.filter(c => f(c.m, c.L) !== c.real);
    console.log(`  ${nom.padEnd(30)} ${CASOS.length - mal.length}/${CASOS.length}   ` +
      (mal.map(c => `${c.n} ${c.m.name}: dice ${f(c.m, c.L)} y es ${c.real}`).join('; ') || '—'));
  }
  const margenes = CASOS.map(c => (porSeguidor(c.m, c.L) || {}).margen).filter(x => isFinite(x));
  if (margenes.length) console.log(`\n  margen del caso más justo: x${Math.min(...margenes).toFixed(2)}` +
    `   ·   el umbral de este fichero está en x${MARGEN_MIN}` +
    `\n  (acertar el más justo NO baja el umbral: un acierto suelto no prueba que la regla aguante ahí)`);
  process.exit(0);
}

/* ── el barrido ────────────────────────────────────────────────────────────────────────────────*/
let escritas = 0, pendientes = [], avisos = [];
for (const n of nombres) {
  const ruta = RAIZ + n + '_layout.json';
  const L = JSON.parse(readFileSync(ruta, 'utf8'));
  const M = L.meteo || [], C = L.ncus || [];
  if (!M.length || !C.length) continue;
  const tb = leeToolbox(n);

  console.log(`\n· ${n} — ${M.length} HSU, ${C.length} NCU` + (tb ? `   ·   toolbox: ${tb.fichero}` : ''));
  const pon = [];                       // {m, ncu, origen, gw, esclavo} a escribir si la planta cuadra
  let corta = false;

  /* La toolbox y el DWG no siempre cuentan lo mismo. Se dice y no se toca nada. */
  if (tb && tb.total && tb.total !== M.length) {
    const faltan = (L.trackers || []).reduce((s, t) => (t.ncu != null && !tb.declaradas.has(t.ncu) && !s.includes(t.ncu) ? s.concat(t.ncu) : s), []).sort((a, b) => a - b);
    avisos.push(`${n}: el SCADA declara ${tb.total} HSU (${Object.entries(tb.porNCU).map(([k, v]) => `NCU${k}${v > 1 ? '×' + v : ''}`).join(' ')})` +
      ` y el DWG dibuja ${M.length}` + (faltan.length ? `. Su fichero NO trae las NCU ${faltan.join(', ')}, así que puede ser un fichero incompleto y no un desacuerdo` : ''));
  }

  for (const m of M) {
    const nom = String(m.name).padEnd(16);
    const s = porSeguidor(m, L);
    const margen = s ? `margen x${s.margen === Infinity ? '∞' : s.margen.toFixed(2)}` : 'sin seguidores con NCU';

    /* 1 · la toolbox, con índice: NCU, esclavo y gateway sin deducir nada */
    const deTB = tb && tb.porIndice[indiceHSU(m.name)];
    if (deTB) {
      const cuadra = s && s.gana === deTB.ncu;
      console.log(`  ${cuadra ? 'ok   ' : 'ojo  '} ${nom} NCU ${String(deTB.ncu).padStart(2)} · GW ${deTB.gw}` +
        (deTB.esclavo != null ? ` · esclavo ${deTB.esclavo}` : ' · sin esclavo en la hoja') +
        `  ·  de la toolbox` + (s ? `, y el seguidor más cercano es de la ${s.gana}${cuadra ? '' : ' ← NO cuadra'}` : ''));
      pon.push({ m, ncu: deTB.ncu, gw: deTB.gw, esclavo: deTB.esclavo,
        origen: `toolbox · SCADA/tools/tcu-toolbox/plantas/${tb.fichero}, del Excel de coordenadas de la planta` });
      continue;
    }

    /* 2 · procedencia externa declarada: no se toca el valor, solo se etiqueta */
    if (ORIGEN_EXTERNO[n]) {
      if (m.ncu == null) { console.log(`  ??    ${nom} ${n} está declarada de procedencia externa y esta HSU no trae ncu`); continue; }
      console.log(`  ok    ${nom} NCU ${String(m.ncu).padStart(2)} de campo` + (s ? `  ·  el seguidor más cercano es de la ${s.gana}` : ''));
      pon.push({ m, ncu: m.ncu, origen: ORIGEN_EXTERNO[n] });
      continue;
    }

    /* 3 · el nombre lo dice, y la geometría lo corrobora */
    const delNombre = ncuDelNombre(m.name);
    if (delNombre != null) {
      const cerca = C.map(c => ({ n: numNCU(c, L), d: dist(m, c) })).sort((a, b) => a.d - b.d)[0];
      const ok = cerca && cerca.n === delNombre;
      console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${nom} el nombre dice NCU ${String(delNombre).padStart(2)}` +
        `  ·  la NCU más cercana es la ${cerca.n} a ${Math.round(cerca.d)} m`);
      if (!ok) { corta = true; continue; }
      pon.push({ m, ncu: delNombre, origen: `nombre del DWG «${m.name}», corroborado con la geometría: la NCU ${delNombre} es también la más cercana, a ${Math.round(cerca.d)} m` });
      continue;
    }

    /* 4 · una sola NCU en la planta: no hay de dónde elegir */
    if (C.length === 1) {
      const u = numNCU(C[0], L) ?? 1;
      console.log(`  ok    ${nom} NCU ${String(u).padStart(2)}  ·  es la única de la planta`);
      pon.push({ m, ncu: u, origen: `única NCU de la planta («${C[0].name}»): no se deduce, se constata` });
      continue;
    }

    if (!s) { console.log(`  ??    ${nom} el layout no trae NCU por seguidor: no se puede derivar`); continue; }

    /* 5 · el GZ del listado del cliente, cuando pasa las pruebas de arriba Y dice lo mismo que la
       geometría. Si dijera otra cosa NO se escribe: dos fuentes que discrepan no son una fuente
       mejor, son un motivo para mirarlo. */
    const gz = leeGZ(n, L);
    if (gz && gz[M.indexOf(m)] != null) {
      const g = gz[M.indexOf(m)];
      if (g === s.gana) {
        console.log(`  ok    ${nom} NCU ${String(g).padStart(2)}  ·  DOS FUENTES: el GZ del listado del cliente ` +
          `(SCADA/index.html) y el seguidor más cercano, a ${Math.round(s.d1)} m`);
        pon.push({ m, ncu: g, origen: `dos fuentes · el «GZ» del listado del cliente (SCADA/index.html) dice NCU ${g}, ` +
          `y el seguidor más cercano también, a ${Math.round(s.d1)} m (${margen}). El GZ solo se usa donde no puede ` +
          `confundirse con un contador; el esclavo no lo da esa fuente` });
        continue;
      }
      avisos.push(`${n} ${m.name}: el GZ del listado dice NCU ${g} y la geometría la ${s.gana} (${margen}). No se escribe ninguna`);
      continue;
    }

    /* 5 · DOS FUENTES. La toolbox dice que esa NCU tiene HSU y esta es la única candidata cerca, de
       largo. No es la regla del margen: es que las dos fuentes, independientes, dicen lo mismo. */
    const dosFuentes = tb && tb.porNCU[s.gana] && unicaCandidata(s.gana, m, L, M);
    if (dosFuentes) {
      console.log(`  ok    ${nom} NCU ${String(s.gana).padStart(2)}  ·  DOS FUENTES: la toolbox le pone HSU y ` +
        `es la única cerca (la siguiente, ${dosFuentes.otra}, a ${Math.round(dosFuentes.d2)} m contra ${Math.round(dosFuentes.d1)} m)`);
      const gwTB = tb.gwUnico && tb.gwUnico[s.gana];
      if (gwTB) console.log(`        ↳ y la columna RSU de la hoja dice que va en el GW ${gwTB}`);
      pon.push({ m, ncu: s.gana, gw: gwTB, origen: `dos fuentes · la toolbox (${tb.fichero}) dice que la NCU ${s.gana} tiene HSU, ` +
        `y de las ${M.length} del DWG ésta es la única cerca: a ${Math.round(dosFuentes.d1)} m, la siguiente a ${Math.round(dosFuentes.d2)} m. ` +
        (gwTB ? `El gateway (GW ${gwTB}) lo dice la columna RSU de la hoja: de las dos filas de esa NCU solo una declara estación. ` : '') +
        `El esclavo no lo da esa fuente` });
      continue;
    }

    /* 6 · derivado, y solo dentro del régimen donde la regla está validada */
    if (s.margen < MARGEN_MIN) {
      console.log(`  ··    ${nom} NCU ${String(s.gana).padStart(2)}? a ${Math.round(s.d1)} m, pero la ${s.seg} está a ${Math.round(s.d2)} m` +
        ` (${margen} < x${MARGEN_MIN}): NO se escribe, queda para confirmar en campo`);
      pendientes.push(`${n} ${m.name} (¿${s.gana} o ${s.seg}?, ${margen})`);
      continue;
    }
    console.log(`  ok    ${nom} NCU ${String(s.gana).padStart(2)}  ·  seguidor suyo a ${Math.round(s.d1)} m, ` +
      `el de la ${s.seg} a ${Math.round(s.d2)} m (${margen})`);
    pon.push({ m, ncu: s.gana, origen: `DERIVADO, no medido: NCU del seguidor más cercano (a ${Math.round(s.d1)} m; ` +
      `el de la ${s.seg}, a ${Math.round(s.d2)} m, ${margen}). Regla validada ${VALIDADA} contra fuentes ` +
      `independientes. Confirmar en campo` });
  }

  if (corta) { console.log(`  → el nombre y el plano no dicen lo mismo: NO se escribe nada de ${n}`); continue; }

  /* DOS HSU EN LA MISMA NCU no es un error —El Burgo tiene dos por NCU, una por gateway, y la 15 de
     Ayora también, ahí las dos en el mismo— pero puede ser señal de derivación torcida, y se dice.
     Salvo donde la fuente ya lo dice: un banco que grita por algo sabido se acaba ignorando entero. */
  const reparto = {}, sabido = new Set();
  for (const p of pon) {
    reparto[p.ncu] = (reparto[p.ncu] || 0) + 1;
    if (/^(toolbox|campo)/.test(p.origen)) sabido.add(String(p.ncu));
  }
  const repes = Object.keys(reparto).filter(k => reparto[k] > 1 && !sabido.has(k));
  const yaSabidos = Object.keys(reparto).filter(k => reparto[k] > 1 && sabido.has(k));
  if (yaSabidos.length && C.length > 1) console.log(`  ok    ${yaSabidos.map(k => `${reparto[k]} HSU en la NCU ${k}`).join('; ')}, y la fuente lo dice`);
  if (repes.length && C.length > 1) console.log(`  ojo   ${repes.map(k => `${reparto[k]} HSU salen de la NCU ${k}`).join('; ')}` +
    `. Puede ser bueno —pasa en El Burgo y en Ayora— pero conviene mirarlo`);

  console.log(`  → ${pon.length} de ${M.length}` + (pon.length < M.length ? `, el resto sin escribir` : ''));
  if (NOTA_PLANTA[n]) console.log(`  nota  ${NOTA_PLANTA[n].split('. ')[0]}.`);
  /* EL GATEWAY, CUANDO NO HAY OTRO. Si en toda la planta los seguidores solo usan UN gateway, la
     estación cuelga de ése porque no existe otro al que colgarse. No es una deducción por cercanía
     —eso aquí no se hace nunca con el gateway— es la misma constatación que la de la única NCU. Hoy
     toca en Bagnarelli, Fayón y Túnez; en Ayora COINCIDE con lo que dice la toolbox, que sale gratis
     de careo: los diez dan GW1 por las dos vías. */
  const gwsPlanta = [...new Set((L.trackers || []).map(t => t.gw).filter(g => g != null))];
  if (gwsPlanta.length === 1) {
    const g = gwsPlanta[0];
    const chocan = pon.filter(p => p.gw != null && p.gw !== g);
    if (chocan.length) console.log(`  ojo   la planta solo usa el GW ${g} y ${chocan.length} HSU traen otro: no se toca ninguna`);
    else {
      const nuevas = pon.filter(p => p.gw == null).length;
      if (nuevas) console.log(`  ok    las ${nuevas} sin gateway van al GW ${g}: es el único que usa la planta entera`);
      for (const p of pon) if (p.gw == null) {
        p.gw = g;
        p.gwOrigen = `único gateway de la planta: sus ${(L.trackers || []).length} seguidores usan el GW ${g} y no hay otro. No se deduce, se constata`;
      }
    }
  }

  if (WRITE && (pon.length || NOTA_PLANTA[n])) {
    if (NOTA_PLANTA[n]) L.meteo_nota = NOTA_PLANTA[n];
    for (const p of pon) {
      p.m.ncu = p.ncu; p.m.ncu_origen = p.origen;
      if (p.gw != null) { p.m.gw = p.gw; p.m.gw_origen = p.gwOrigen || p.origen; }
      if (p.esclavo != null) { p.m.esclavo = p.esclavo; p.m.esclavo_origen = p.origen; }
    }
    writeFileSync(ruta, JSON.stringify(L));
    escritas++;
  }
}

/* De las HSU del DWG, ¿hay UNA sola cerca de los seguidores de esa NCU, y de largo? */
function unicaCandidata(ncu, m, L, M) {
  const T = (L.trackers || []).filter(t => t.ncu === ncu);
  if (!T.length) return null;
  const o = M.map(h => ({ h, d: Math.min.apply(null, T.map(t => dist(h, t))) })).sort((a, b) => a.d - b.d);
  if (o[0].h !== m || !o[1] || o[1].d / o[0].d < MARGEN_UNICA) return null;
  return { d1: o[0].d, d2: o[1].d, otra: o[1].h.name };
}

if (avisos.length) console.log(`\ncuentas que no cuadran entre fuentes (${avisos.length}):\n  ` + avisos.join('\n  '));
if (pendientes.length) console.log(`\npor confirmar en campo (${pendientes.length}):\n  ` + pendientes.join('\n  '));
console.log(WRITE ? `\n→ ${escritas} layout(s) escritos` : '\n(informe: nada escrito. Con --write se escribe)');
