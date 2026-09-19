/* CONTRATO DE DATOS v2 — el visor lee las dos versiones, y la hora no se inventa.
 *
 * Lo que vigila, y por qué existe cada comprobación:
 *
 *   1. Que v2 (UTC con Z) pase tal cual. Es el formato al que van los recolectores.
 *   2. Que v1 (hora local sin zona) se lea, pero interpretándola como Europe/Madrid Y DICIÉNDOLO.
 *      Un fichero v1 no es ilegible; lo que no se puede es convertirlo en silencio, porque la
 *      conversión es una decisión nuestra sobre el dato de otro.
 *   3. EL CAMBIO DE HORA, que es el motivo de fondo del contrato. Dos noches al año la conversión
 *      local->UTC no tiene una respuesta:
 *        · 2026-03-29 02:30 local NO EXISTIÓ (el reloj salta de 02:00 a 03:00)
 *        · 2026-10-25 02:30 local ocurrió DOS VECES (00:30Z en CEST y 01:30Z en CET)
 *      Comprobado contra la base de zonas horarias del propio motor, no contra una tabla escrita
 *      a mano. La inexistente se descarta; la ambigua se resuelve a la primera y se marca. Las dos
 *      se cuentan en un aviso VISIBLE, no en la consola: en planta nadie abre la consola.
 *   4. Que RSSI y rutas pasen por el MISMO conversor. Si una se convirtiera y la otra no, la línea
 *      de tiempo —que es la unión de las dos— quedaría con las capturas desplazadas una o dos
 *      horas, y no se vería: saldrían simplemente como instantes distintos.
 *
 *   node tools/test_contrato_datos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let N = 0, FAIL = 0;
const t = (nm, ok, extra = '') => { N++; if (ok) console.log('  ✓ ' + nm);
  else { FAIL++; console.error('  ✗ ' + nm + (extra ? ' — ' + extra : '')); } };

/* ── el documento del contrato existe y dice lo que tiene que decir ──────── */
console.log('contrato');
const doc = fs.readFileSync(path.join(ROOT, 'docs/contrato_datos_zigbee.md'), 'utf-8');
t('el contrato declara schema_version = 2', /schema_version\D{0,4}=\D{0,4}2/.test(doc));
t('y exige UTC ISO 8601 con Z', /ISO 8601/.test(doc) && /\bZ\b/.test(doc) && /UTC/.test(doc));
t('deja escrito el decimal con punto (es-ES escribiría coma)',
  /InvariantCulture/.test(doc) && /punto/.test(doc));
/* Export-Csv -Append rechaza columnas nuevas contra un fichero ya empezado. Sin regla de
   rotación, el primer recolector v2 que arranque sobre un CSV v1 muere en la planta. */
t('y la regla de rotación al cambiar de esquema', /Export-Csv -Append/.test(doc) && /renombra/.test(doc));
t('declara la clave del nodo: ext_addr, y que node_id no vale solo',
  /ext_addr/.test(doc) && /node_id/.test(doc) && /no es única|NO es única|por sí solo no vale/.test(doc));
t('y trata el cambio de hora por los dos casos', /inexistente/.test(doc) && /ambigua/.test(doc));

const htmlPath = path.join(ROOT, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
t('el visor no se inventa la zona: la declara', /Europe\/Madrid/.test(html));
t('la demo ya va en v2 (si no, el aviso saltaría sobre datos nuestros)',
  /schema_version","timestamp"/.test(html) && /T' \+ String\(12/.test(html));

/* ── el conversor, aislado ────────────────────────────────────────────────── */
const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const port = srv.address().port;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: EXE });
const pg = await browser.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${port}/`, { waitUntil: 'load' });

console.log('normalizaTs');
t('la página carga sin errores', errs.length === 0, errs.join(' · '));

const conv = await pg.evaluate(() => {
  const casos = ['2026-06-16T10:00:00Z', '2026-06-16 10:00:00Z', '2026-06-16T10:00:00.250Z',
                 '2026-06-16 12:00:00', '2026-01-15 12:00:00',
                 '2026-03-29 02:30:00', '2026-10-25 02:30:00',
                 '16/06/2026 12:00', 'ayer', ''];
  const r = {}; for (const c of casos) r[c] = normalizaTs(c, 'Europe/Madrid');
  return r;
});
const c = k => conv[k] || {};
t('v2 con Z pasa tal cual y se marca como v2',
  c('2026-06-16T10:00:00Z').ts === '2026-06-16T10:00:00Z' && c('2026-06-16T10:00:00Z').v === 2);
t('v2 con espacio en vez de T también', c('2026-06-16 10:00:00Z').ts === '2026-06-16T10:00:00Z');
t('v2 con milésimas se normaliza al segundo', c('2026-06-16T10:00:00.250Z').ts === '2026-06-16T10:00:00Z');
/* Verano UTC+2, invierno UTC+1: si el conversor usara un desfase fijo, uno de los dos fallaría. */
t('v1 de VERANO -> UTC+2 (12:00 local = 10:00Z)',
  c('2026-06-16 12:00:00').ts === '2026-06-16T10:00:00Z' && c('2026-06-16 12:00:00').v === 1,
  JSON.stringify(c('2026-06-16 12:00:00')));
t('v1 de INVIERNO -> UTC+1 (12:00 local = 11:00Z)',
  c('2026-01-15 12:00:00').ts === '2026-01-15T11:00:00Z',
  JSON.stringify(c('2026-01-15 12:00:00')));
t('ninguna de las dos normales queda marcada como dudosa',
  !c('2026-06-16 12:00:00').dudosa && !c('2026-01-15 12:00:00').dudosa);
/* EL NÚCLEO DEL BLOQUE. Las dos noches del año. */
t('la hora que NO existió (29-mar 02:30) se marca inexistente y NO se convierte',
  c('2026-03-29 02:30:00').dudosa === 'inexistente' && c('2026-03-29 02:30:00').ts === null,
  JSON.stringify(c('2026-03-29 02:30:00')));
t('la hora AMBIGUA (25-oct 02:30) se marca y se resuelve a la PRIMERA (CEST, 00:30Z)',
  c('2026-10-25 02:30:00').dudosa === 'ambigua' && c('2026-10-25 02:30:00').ts === '2026-10-25T00:30:00Z',
  JSON.stringify(c('2026-10-25 02:30:00')));
/* Ojo con el atajo `c()`: devuelve {} cuando el valor es null, así que estos tres se miran
   contra el objeto crudo. Una fecha ilegible tiene que dar null — no una fecha por defecto. */
t('una fecha que no se sabe leer devuelve null, no una fecha inventada',
  conv['16/06/2026 12:00'] === null && conv['ayer'] === null && conv[''] === null,
  JSON.stringify([conv['16/06/2026 12:00'], conv['ayer'], conv['']]));

const CAB2 = '"schema_version","timestamp","gateway","node_id","role","ext_addr","online","rssi_dbm","ack_failures","supply_mv","temp_c"\n';

/* ── LA ZONA ES LA DE LA PLANTA, no una fija ──────────────────────────────── */
/* Con Madrid fijo, un v1 de San José (Perú, UTC−5) salía siete horas desplazado en verano; y como
   solo se probaban los desfases de Madrid (+1/+2), ninguno cuadraba y las filas se descartaban
   como «hora inexistente». Las tres plantas de abajo son las tres reglas distintas que hay en la
   cartera: una con cambio de hora y dos con huso fijo. */
console.log('zona por planta');
const IDX = JSON.parse(fs.readFileSync(path.join(ROOT, 'plantas_indice.json'), 'utf-8'));
const tzDe = p => (IDX.plantas.find(x => x.planta === p) || {}).tz_iana;
t('el índice declara tz_iana en las 12 plantas',
  IDX.plantas.length === 12 && IDX.plantas.every(p => !!p.tz_iana),
  IDX.plantas.filter(p => !p.tz_iana).map(p => p.planta).join(','));
t('y son las que tocan', tzDe('elburgo') === 'Europe/Madrid' && tzDe('sanjose') === 'America/Lima'
  && tzDe('tunez') === 'Africa/Tunis' && tzDe('dicayagua') === 'America/Santo_Domingo'
  && tzDe('catania') === 'Europe/Rome',
  JSON.stringify([tzDe('elburgo'), tzDe('sanjose'), tzDe('tunez'), tzDe('dicayagua'), tzDe('catania')]));
/* El huso fijo que declara el layout y la zona IANA tienen que decir lo mismo. Si alguien pone un
   nombre IANA equivocado —America/Bogota en vez de America/Lima, por ejemplo— esto lo caza. */
const coherencia = await pg.evaluate(zs => zs.map(z => {
  const off = (tz, iso) => {
    const d = new Date(iso), f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {}; for (const x of f.formatToParts(d)) p[x.type] = x.value;
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute, +p.second) - d.getTime()) / 60000;
  };
  return { ...z, inv: off(z.tz, '2026-01-15T12:00:00Z'), ver: off(z.tz, '2026-07-15T12:00:00Z') };
}), IDX.plantas.map(p => ({ planta: p.planta, tz: p.tz_iana, fijo: p.tz_fijo_min })));
const malas = coherencia.filter(z => z.fijo == null ? z.inv === z.ver : (z.inv !== z.fijo || z.ver !== z.fijo));
t('la zona IANA cuadra con el tz_fijo_min que declara el layout', malas.length === 0,
  JSON.stringify(malas));

const filaTz = (ts) => `"${ts}","GW-01","TCU_01","TCU","00:13:a2:00:41:0a!","1","-70","3","3300","21"\n`;
const CABT = '"timestamp","gateway","node_id","role","ext_addr","online","rssi_dbm","ack_failures","supply_mv","temp_c"\n';
const porZona = await pg.evaluate(async ({ cab, fila, casos }) => {
  const out = [];
  for (const c of casos) {
    S.tzPlanta = c.tz; S.tzOrigen = 'banco';
    loadLog(cab + fila.replace('__TS__', c.local));
    out.push({ planta: c.planta, tz: c.tz, local: c.local, ts: S.rows[0] && S.rows[0].ts, esq: S.rows.esquema });
  }
  return out;
}, { cab: CABT, fila: filaTz('__TS__'), casos: [
  { planta: 'elburgo', tz: tzDe('elburgo'), local: '2026-07-15 12:00:00' },   // Madrid en verano: UTC+2
  { planta: 'sanjose', tz: tzDe('sanjose'), local: '2026-07-15 12:00:00' },   // Perú: UTC−5 todo el año
  { planta: 'tunez',   tz: tzDe('tunez'),   local: '2026-07-15 12:00:00' },   // Túnez: UTC+1 todo el año
] });
const pz = n => porZona.find(x => x.planta === n) || {};
t('El Burgo, 15-jul 12:00 local -> 10:00Z (UTC+2)', pz('elburgo').ts === '2026-07-15T10:00:00Z', JSON.stringify(pz('elburgo')));
t('San José, 15-jul 12:00 local -> 17:00Z (UTC−5)', pz('sanjose').ts === '2026-07-15T17:00:00Z', JSON.stringify(pz('sanjose')));
t('Túnez, 15-jul 12:00 local -> 11:00Z (UTC+1)', pz('tunez').ts === '2026-07-15T11:00:00Z', JSON.stringify(pz('tunez')));
/* Los siete de diferencia entre El Burgo y San José son exactamente el fallo que esto arregla. */
t('y entre El Burgo y San José hay 7 h, que era el desfase que se colaba',
  (Date.parse(pz('sanjose').ts) - Date.parse(pz('elburgo').ts)) / 3600000 === 7);
t('ninguna de las tres sale como hora inexistente',
  porZona.every(x => x.esq.inexistente === 0), JSON.stringify(porZona.map(x => x.esq.inexistente)));

/* SIN ZONA: no se asume ninguna. */
const sinZona = await pg.evaluate(({ cab, fila }) => {
  S.tzPlanta = null; S.tzOrigen = '';
  loadLog(cab + fila.replace('__TS__', '2026-07-15 12:00:00'));
  const el = document.getElementById('avisoEsquema');
  return { n: S.rows.length, esq: S.rows.esquema, txt: el.textContent, hay: !!document.getElementById('tzSel') };
}, { cab: CABT, fila: filaTz('__TS__') });
t('sin zona conocida NO se inventa Madrid: la fila no entra', sinZona.n === 0 && sinZona.esq.sin_zona === 1,
  JSON.stringify(sinZona.esq));
t('se dice que falta la zona', /No se sabe la zona horaria/.test(sinZona.txt), sinZona.txt.slice(0, 120));
t('y se ofrece un selector para elegirla', sinZona.hay === true);
const trasElegir = await pg.evaluate(() => { eligeZona('America/Lima');
  return { n: S.rows.length, ts: S.rows[0] && S.rows[0].ts }; });
t('al elegirla, el mismo CSV se reconvierte desde el texto original',
  trasElegir.n === 1 && trasElegir.ts === '2026-07-15T17:00:00Z', JSON.stringify(trasElegir));

/* ── el fichero entero: recuento y aviso VISIBLE ──────────────────────────── */
console.log('carga y aviso');
const CAB = '"timestamp","gateway","node_id","role","ext_addr","online","rssi_dbm","ack_failures","supply_mv","temp_c"\n';
const fila = (ts, id, rssi) => `"${ts}","GW-01","${id}","TCU","00:13:a2:00:41:${id.slice(-2)}!","1","${rssi}","3","3300","21"\n`;

const v1 = CAB + fila('2026-06-16 12:00:00', 'TCU_01', -70) + fila('2026-06-16 12:10:00', 'TCU_01', -72);
const res1 = await pg.evaluate(txt => { S.tzPlanta = 'Europe/Madrid'; S.tzOrigen = 'banco'; loadLog(txt);
  const el = document.getElementById('avisoEsquema');
  return { esq: S.rows.esquema, ts: S.rows.map(r => r.ts), visible: !el.hidden, txt: el.textContent };
}, v1);
t('un fichero v1 se lee entero', res1.ts.length === 2, JSON.stringify(res1.ts));
t('y sus horas salen convertidas a UTC',
  res1.ts[0] === '2026-06-16T10:00:00Z', JSON.stringify(res1.ts));
t('el recuento dice que son v1', res1.esq.v1 === 2 && res1.esq.v2 === 0, JSON.stringify(res1.esq));
t('EL AVISO SE VE', res1.visible === true);
t('y nombra la zona que se ha supuesto', /Europe\/Madrid/.test(res1.txt), res1.txt);

const fila2 = (ts, id, rssi) => `"2","${ts}","GW-01","${id}","TCU","00:13:a2:00:41:0a!","1","${rssi}","3","3300","21"\n`;
const res2 = await pg.evaluate(txt => { S.tzPlanta = 'Europe/Madrid'; loadLog(txt);
  const el = document.getElementById('avisoEsquema');
  return { esq: S.rows.esquema, ts: S.rows.map(r => r.ts), visible: !el.hidden };
}, CAB2 + fila2('2026-06-16T10:00:00Z', 'TCU_01', -70));
t('un fichero v2 se lee y NO saca aviso', res2.esq.v2 === 1 && res2.visible === false,
  JSON.stringify(res2));
t('y su hora no se toca', res2.ts[0] === '2026-06-16T10:00:00Z');

/* Las dos noches, dentro de un fichero de verdad. */
const raro = CAB + fila('2026-03-29 02:30:00', 'TCU_01', -70)      // no existió
                 + fila('2026-10-25 02:30:00', 'TCU_02', -71)      // ocurrió dos veces
                 + fila('2026-06-16 12:00:00', 'TCU_03', -72);     // normal
const res3 = await pg.evaluate(txt => { S.tzPlanta = 'Europe/Madrid'; loadLog(txt);
  const el = document.getElementById('avisoEsquema');
  return { esq: S.rows.esquema, n: S.rows.length, txt: el.textContent };
}, raro);
t('la fila de la hora inexistente NO entra en la serie', res3.n === 2, 'filas=' + res3.n);
/* Aqui las dos noches van sueltas, con fechas distintas: el orden NO puede resolver la de
   octubre (la fila anterior es de marzo, otra noche), asi que sigue marcada ambigua. */
t('pero se cuenta', res3.esq.inexistente === 1 && res3.esq.ambigua === 1, JSON.stringify(res3.esq));
t('y el aviso lo dice con sus números',
  /1<\/b> en la hora que se repite|1 en la hora que se repite/.test(res3.txt.replace(/\s+/g, ' ')) &&
  /descartadas/.test(res3.txt), res3.txt.replace(/\s+/g, ' ').slice(0, 220));

/* ── LA NOCHE DE OCTUBRE, ENTERA ──────────────────────────────────────────
   Este es el caso por el que existe el lector con memoria. Tomando siempre la primera, las DOS
   pasadas reales por 02:00–02:59 caen en el mismo UTC y `buildFrames` las funde sin decir nada:
   dos vueltas del recolector se convierten en una. El fichero de abajo cruza la noche con dos
   filas por hora local, en el orden en que las escribe el recolector, y NINGÚN UTC puede
   repetirse. */
console.log('noche de octubre');
const NOCHE = [   // hora local tal como la escribiría el recolector, en orden
  '2026-10-25 01:30:00',                       // antes del cambio, CEST
  '2026-10-25 02:00:00', '2026-10-25 02:30:00',// primera pasada por las 02 (CEST, UTC+2)
  '2026-10-25 02:00:00', '2026-10-25 02:30:00',// el reloj retrocede: segunda pasada (CET, UTC+1)
  '2026-10-25 03:00:00', '2026-10-25 03:30:00',// ya en CET
];
const csvNoche = CABT + NOCHE.map(x => filaTz(x)).join('');
const noche = await pg.evaluate(txt => {
  S.tzPlanta = 'Europe/Madrid'; S.tzOrigen = 'banco';
  loadLog(txt);
  return { ts: S.rows.map(r => r.ts), esq: S.rows.esquema, instantes: S.frames.length };
}, csvNoche);
t('las 7 filas de la noche se leen todas', noche.ts.length === 7, JSON.stringify(noche.ts));
t('NINGÚN UTC se repite: las dos pasadas no colapsan',
  new Set(noche.ts).size === 7, JSON.stringify(noche.ts));
t('y la línea de tiempo tiene los 7 instantes, no 5',
  noche.instantes === 7, 'instantes=' + noche.instantes);
/* Los UTC exactos: 01:30 CEST = 23:30Z del día anterior; luego 00:00Z, 00:30Z (primera pasada),
   01:00Z, 01:30Z (segunda), 02:00Z, 02:30Z. */
t('y salen en su UTC exacto, primera y segunda pasada donde toca',
  JSON.stringify(noche.ts) === JSON.stringify([
    '2026-10-24T23:30:00Z', '2026-10-25T00:00:00Z', '2026-10-25T00:30:00Z',
    '2026-10-25T01:00:00Z', '2026-10-25T01:30:00Z', '2026-10-25T02:00:00Z', '2026-10-25T02:30:00Z']),
  JSON.stringify(noche.ts));
t('y están en orden creciente, como se escribieron',
  noche.ts.every((x, i) => i === 0 || x > noche.ts[i - 1]));
/* Resueltas por el orden -> ya NO son «ambiguas». Solo lo sería una que empezara el fichero. */
t('el orden las resuelve, así que ninguna queda marcada ambigua',
  noche.esq.ambigua === 0, JSON.stringify(noche.esq));
/* Y el caso que el orden NO puede resolver: el fichero empieza dentro de la franja. */
const soloAmbigua = await pg.evaluate(({ cab, fila }) => {
  S.tzPlanta = 'Europe/Madrid';
  loadLog(cab + fila.replace('__TS__', '2026-10-25 02:30:00'));
  return { esq: S.rows.esquema, ts: S.rows[0] && S.rows[0].ts };
}, { cab: CABT, fila: filaTz('__TS__') });
t('si el fichero EMPIEZA dentro de la franja, eso sí queda ambiguo y se dice',
  soloAmbigua.esq.ambigua === 1 && soloAmbigua.ts === '2026-10-25T00:30:00Z',
  JSON.stringify(soloAmbigua));

/* ── schema_version manda: v2 sin Z es un fichero roto, no un v1 ──────────── */
console.log('schema_version');
const rotoV2 = await pg.evaluate(txt => { S.tzPlanta = 'Europe/Madrid'; loadLog(txt);
  const el = document.getElementById('avisoEsquema');
  return { n: S.rows.length, esq: S.rows.esquema, txt: el.textContent }; },
  CAB2 + '"2","2026-07-15 12:00:00","GW-01","TCU_01","TCU","00:13:a2:00:41:0a!","1","-70","3","3300","21"\n');
t('una fila que dice schema_version=2 y no trae Z NO se lee como v1',
  rotoV2.esq.v2_sin_z === 1 && rotoV2.esq.v1 === 0, JSON.stringify(rotoV2.esq));
t('no entra en la serie', rotoV2.n === 0);
t('y se dice que es un fichero mal escrito', /mal escrito/.test(rotoV2.txt), rotoV2.txt.slice(0, 160));

/* ── rutas: el MISMO conversor, o la línea de tiempo se desalinea ─────────── */
console.log('rutas');
const rutas = '"timestamp","target","hop_count","path_ids","path_addrs"\n'
  + '"2026-06-16 12:00:00","TCU_01","2","COORD>TCU_09>TCU_01","x"\n';
const res4 = await pg.evaluate(txt => { S.tzPlanta = 'Europe/Madrid'; const r = snapsDeRutas(txt);
  return { esq: r.esquema, ts: r.snaps.map(s => s.ts) }; }, rutas);
t('las rutas v1 se convierten igual que el RSSI',
  res4.ts[0] === '2026-06-16T10:00:00Z', JSON.stringify(res4.ts));
t('y su recuento también sale', res4.esq.v1 === 1, JSON.stringify(res4.esq));

/* EL GUARDIA DE ALINEAMIENTO. Un RSSI y una ruta apuntados a la MISMA hora local tienen que caer
   en el MISMO instante de la línea de tiempo. Si un lado se convirtiera y el otro no, aquí
   saldrían dos instantes separados por dos horas. */
const res5 = await pg.evaluate(({ l, r }) => { S.tzPlanta = 'Europe/Madrid'; loadLog(l); loadRoutes(r);
  return { rssi: S.rssiTs, rutas: S.routeSnaps.map(s => s.ts), linea: S.frames.length }; },
  { l: v1, r: rutas });
t('RSSI y rutas de la misma hora local caen en el mismo instante',
  res5.rssi[0] === res5.rutas[0], JSON.stringify({ rssi: res5.rssi[0], rutas: res5.rutas[0] }));
t('y la línea de tiempo no se duplica por el desfase', res5.linea === 2, 'instantes=' + res5.linea);

await browser.close();
srv.close();

console.log('');
if (FAIL) { console.error(FAIL + ' FALLOS de ' + N); process.exit(1); }
console.log('TODO OK — ' + N + ' comprobaciones');
