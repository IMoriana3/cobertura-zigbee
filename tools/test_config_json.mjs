/* EXPORTAR → CARGAR → EXPORTAR DA EL MISMO HASH, Y UN CAMPO CAMBIADO LO CAMBIA.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_config_json.mjs
 *
 * Para qué (titular, 2026-09-24): «hoy una anomalía se comunica con capturas y
 * nadie puede reproducir el estado. Esto es reproducibilidad, no comodidad».
 * El botón ⤓ de la cabecera baja la configuración con su hash; el ⤒ la carga
 * (backtracking.html, bloque «EXPORTAR / IMPORTAR CONFIGURACIÓN»).
 *
 *   A · el SHA-256 propio de la página (síncrono, para que funcione en file://)
 *       da el vector conocido de «abc» y el mismo hash que el `crypto` de Node
 *       sobre el JSON canónico exportado: el hash no depende de una sola
 *       implementación.
 *   B · IDA Y VUELTA en una página NUEVA: se lleva la página a un estado que no
 *       es el de fábrica (el de la «mancha en el aire» del titular: bifila
 *       rígida, ondulado 1,2 m, 21:05, fila 5…), se exporta, se abre otra
 *       pestaña limpia, se carga, se vuelve a exportar: MISMO hash y MISMA
 *       configuración campo a campo. Y la escena lo confirma con una magnitud
 *       CALCULADA, no con los mandos: el θ de la fila del HUD y la sombra de
 *       planta en ese instante salen iguales en las dos pestañas.
 *   C · CONTROL NEGATIVO del hash: cambiar UN campo —uno de cada bloque de la
 *       configuración, y una sola cota del terreno en 1 mm— cambia el hash.
 *   D · CONTROL NEGATIVO de la carga: un fichero con un campo alterado y el
 *       hash VIEJO tiene que salir `ok: false` y nombrar el campo. Si la
 *       comprobación de la carga dijera siempre que sí, este lo caza.
 *   E · COBERTURA: todo `input`/`select` con id de la página está en la
 *       configuración, en la vista o en la lista de EXCLUIDOS declarada abajo
 *       con su motivo. Un mando nuevo que no se exporte pone esto rojo —la
 *       lección del sexto caso del patrón: un banco tiene que demostrar que su
 *       corte cubre todo lo que dice vigilar—.
 *   F · PLANTA REAL: ida y vuelta con una planta de layout (Fayón) y, con
 *       CFG_COTAS=1, otra de cotas (San José, bloque 0): se reconstruyen con su
 *       cargador. San José va aparte por COSTE, no por duda: pasó (32/32 el
 *       2026-09-24) pero su carga desde el JSON tardó 437 s con la máquina
 *       ocupada —medida no válida como tiempo, declarada— y el CI no la paga en
 *       cada empuje. Fayón ejerce el mismo camino (`planta_real` → cargador →
 *       cotas → hash).
 */
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { EXE } from './pw_navegador.mjs';

const PUERTO = process.env.PUERTO || 8124;
const URL = `http://127.0.0.1:${PUERTO}/backtracking.html?limpio`;
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

/* los mandos que NO forman parte del estado, cada uno con su porqué */
const EXCLUIDOS = {
  date2: 'es el MISMO campo que `date` (fecha de la barra de tiempo); se escribe al cargar',
  speed: 'velocidad de la animación: no cambia ningún estado calculado ni el instante',
  blksel: 'lo crea el cargador de la planta real; su valor va en planta_real.bloque',
  ncusel: 'lo crea el cargador de la planta real; su valor va en planta_real.ncu',
  grA: 'mando del INFORME GRÁFICO (su propio cálculo, no el estado de la escena)',
  grB: 'mando del INFORME GRÁFICO', grN: 'mando del INFORME GRÁFICO',
  grcrit: 'mando del INFORME GRÁFICO', grhora: 'mando del INFORME GRÁFICO',
  cfgimp: 'el propio selector de fichero de la carga',
};
/* dónde va cada mando en el JSON (config.* entra en el hash; vista.* no) */
const EN_JSON = {
  plant: 'emplazamiento.planta_cartera', lat: 'emplazamiento.lat', lon: 'emplazamiento.lon', date: 'emplazamiento.fecha',
  tz: 'emplazamiento.utc', alt: 'emplazamiento.altitud', albedo: 'emplazamiento.albedo', tl: 'emplazamiento.linke',
  cloud: 'emplazamiento.nubosidad', pitch: 'geometria.pitch', cw: 'geometria.cuerda', gcr: 'geometria.gcr',
  maxang: 'geometria.theta_max', nrows: 'geometria.filas', axaz: 'geometria.azimut_eje', z0: 'geometria.cara_sup_eje',
  nbp: 'geometria.nb', iam: 'geometria.iam_b0', tcucfg: 'tcu', drive: 'accionamiento', nspreset: 'perfil_ns.preset',
  axtilt: 'perfil_ns.valor', tpreset: 'terreno.preset', tparam: 'terreno.parametro', nsl: 'implantacion.preset',
  ntrk: 'implantacion.filas_por_linea', mods: 'implantacion.modulos_por_ala', brainsel: 'politicas.inteligencia',
  polview: 'politicas.escena', careo: 'careo.on', careolibro: 'careo.libro', hour: 'instante.minuto', rowsel: 'instante.fila',
  manual: 'manual.on', manrow: 'manual.por_fila', manth: 'manual.theta',
  lbl3d: 'vista.capas.etiquetas', colprod: 'vista.capas.produccion', colscale: 'vista.capas.escala',
  ray3d: 'vista.capas.rayo', haz3d: 'vista.capas.haz', light3d: 'vista.capas.luz',
};

const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
await ctx.route('**/server.arcgisonline.com/**', r => r.abort());
const t0 = Date.now();
async function pagina() {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('  [pageerror] ' + e.message));
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof exportaConfig === 'function', null, { timeout: 120000 });
  return pg;
}
/* lo que la escena CALCULA en el instante: θ de la fila del HUD y sombra de planta */
const calculado = pg => pg.evaluate(() => {
  const k = $('polview').value, p = DAY.pol[k], t = Math.round(+$('hour').value / STEP_MIN), r = +$('rowsel').value;
  const sh = p.shade[t] || [];
  return { pol: k, theta: p.ang[t][r], sombra: sh.reduce((a, v) => a + (v || 0), 0) / (sh.length || 1), filas: DAY.T.pairs.length + 1 };
});

const A = await pagina();
/* ── A · el hash ── */
{
  const r = await A.evaluate(() => ({ abc: sha256Hex('abc'), vacio: sha256Hex(''), largo: sha256Hex('a'.repeat(1000)),
    canon: canonJSON(configEstado()), h: exportaConfig().hash }));
  const ref = s => createHash('sha256').update(s).digest('hex');
  check('A · SHA-256 de «abc» = vector conocido', r.abc === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', r.abc);
  check('A · SHA-256 de «» y de 1000 «a» = crypto de Node', r.vacio === ref('') && r.largo === ref('a'.repeat(1000)));
  check('A · hash de la configuración = crypto de Node sobre el JSON canónico', r.h === ref(r.canon), r.h + ' vs ' + ref(r.canon));
}
/* ── B · ida y vuelta con el estado de la mancha ── */
await A.evaluate(async () => {
  const set = (id, v) => { $(id).value = v; };
  set('lat', 42.32059); set('lon', -5.59981); set('date', '2026-06-21'); set('tz', 2); set('alt', 1563);
  set('albedo', 0.2); set('tl', 3.5); set('cloud', 0);
  set('pitch', 6); set('cw', 2.382); set('maxang', 55); set('nrows', 8); set('axaz', 0); set('z0', 0.17); set('nbp', 2); set('iam', 0.05);
  set('tcucfg', 'levantamiento'); set('drive', 'bifila'); set('nspreset', 'constante'); set('axtilt', 1.5);
  set('nsl', 'alineadas'); set('ntrk', 1); set('mods', 28);
  set('tpreset', 'ondulado'); set('tparam', 1.2); applyPreset();
  const p = esperaCalculo(); recompute(); await p;
  set('polview', 'pairwise'); set('hour', 21 * 60 + 5); set('rowsel', 4);
  drawScene(); update3D();
});
const dA = await A.evaluate(() => exportaConfig());
const cA = await calculado(A);
console.log(`  estado de prueba: hash ${dA.hash.slice(0, 16)} · ${cA.filas} filas · θ fila 5 ${cA.theta.toFixed(3)}° · sombra media ${(100 * cA.sombra).toFixed(2)} %`);
check('B · el estado de prueba NO es el de fábrica (si no, la ida y vuelta no probaría nada)',
  dA.config.accionamiento === 'bifila' && dA.config.terreno.cotas.some(z => Math.abs(z) > 0.1) && dA.config.instante.minuto === 1265);
const B = await pagina();
const hFabrica = await B.evaluate(() => exportaConfig().hash);
check('B · la pestaña nueva arranca en OTRO estado (control: el hash de fábrica difiere)', hFabrica !== dA.hash);
const rB = await B.evaluate(d => cargaConfig(d), dA);
const dB = await B.evaluate(() => exportaConfig());
check('B · cargar dice ok (hash de la página = el del fichero)', rB.ok, JSON.stringify(rB.difieren));
check('B · exportar → cargar → exportar: MISMO hash', dB.hash === dA.hash, dB.hash + ' vs ' + dA.hash);
check('B · y la misma configuración campo a campo', JSON.stringify(dB.config) === JSON.stringify(dA.config));
const cB = await calculado(B);
check('B · la escena CALCULA lo mismo: θ de la fila 5 y sombra media de planta en el instante',
  cB.pol === cA.pol && cB.theta === cA.theta && cB.sombra === cA.sombra, JSON.stringify([cA, cB]));
/* ── C · control negativo: un campo cambia el hash ── */
{
  const r = await A.evaluate(d => {
    const muta = [
      ['emplazamiento.albedo', C => { C.emplazamiento.albedo = 0.21; }],
      ['emplazamiento.fecha', C => { C.emplazamiento.fecha = '2026-06-22'; }],
      ['geometria.theta_max', C => { C.geometria.theta_max = 54; }],
      ['geometria.nb', C => { C.geometria.nb = 3; }],
      ['tcu', C => { C.tcu = 'cero'; }],
      ['accionamiento', C => { C.accionamiento = 'mono'; }],
      ['perfil_ns.valor', C => { C.perfil_ns.valor = 1.0; }],
      ['terreno.cotas[3] + 1 mm', C => { C.terreno.cotas[3] += 0.001; }],
      ['implantacion.modulos_por_ala', C => { C.implantacion.modulos_por_ala = 27; }],
      ['politicas.activas', C => { C.politicas.activas = C.politicas.activas.slice(1); }],
      ['instante.minuto', C => { C.instante.minuto += 1; }],
      ['manual.on', C => { C.manual.on = !C.manual.on; }],
    ];
    return muta.map(([n, f]) => { const C = JSON.parse(JSON.stringify(d.config)); f(C); return [n, hashConfig(C) !== d.hash]; });
  }, dA);
  for (const [n, cambia] of r) check('C · cambiar ' + n + ' cambia el hash', cambia);
  const viaMando = await A.evaluate(() => { const h0 = exportaConfig().hash; $('albedo').value = 0.21; const h1 = exportaConfig().hash; $('albedo').value = 0.2; return [h0 !== h1, exportaConfig().hash === h0]; });
  check('C · y por el MANDO: albedo 0,20 → 0,21 cambia el hash, y volver a 0,20 lo devuelve', viaMando[0] && viaMando[1]);
  const vista = await A.evaluate(() => { const h0 = exportaConfig().hash; $('lbl3d').checked = !$('lbl3d').checked; const h1 = exportaConfig().hash; $('lbl3d').checked = !$('lbl3d').checked; return h0 === h1; });
  check('C · la VISTA (capas, cámara) no entra en el hash, como está declarado', vista);
}
/* ── D · control negativo de la carga ── */
{
  const malo = JSON.parse(JSON.stringify(dA)); malo.config.emplazamiento.albedo = 0.3;
  const r = await B.evaluate(d => cargaConfig(d), malo);
  check('D · un fichero editado a mano con el hash viejo NO carga «ok» y se declara no íntegro', !r.ok && r.integro === false, JSON.stringify(r));
  /* y uno ÍNTEGRO que la página no puede reproducir: una planta de la cartera
     que no está en el localStorage de este navegador. Tiene que nombrar el campo. */
  const ajeno = JSON.parse(JSON.stringify(dA)); ajeno.config.emplazamiento.planta_cartera = 'NO-EXISTE-999';
  ajeno.hash = await B.evaluate(C => hashConfig(C), ajeno.config);
  const r3 = await B.evaluate(d => cargaConfig(d), ajeno);
  check('D · un fichero íntegro que no se puede reproducir NO carga «ok» y nombra el campo que no casa',
    !r3.ok && r3.integro && r3.difieren.length === 1 && r3.difieren[0] === 'emplazamiento.planta_cartera', JSON.stringify(r3));
  const r2 = await B.evaluate(d => cargaConfig(d), dA);
  check('D · y el bueno vuelve a cargar ok en la misma pestaña', r2.ok);
}
/* ── E · cobertura ── */
{
  const ids = await A.evaluate(() => [...document.querySelectorAll('input[id],select[id]')].map(e => e.id));
  const faltan = ids.filter(id => !(id in EN_JSON) && !(id in EXCLUIDOS));
  check(`E · los ${ids.length} mandos con id están en el JSON o excluidos con motivo`, faltan.length === 0, faltan.join(', '));
  const fantasmas = Object.keys(EN_JSON).filter(id => !ids.includes(id) && !['blksel', 'ncusel'].includes(id));
  check('E · y el mapa del banco no nombra mandos que ya no existen', fantasmas.length === 0, fantasmas.join(', '));
  const rutas = await A.evaluate(m => {
    const d = exportaConfig(), get = (o, p) => p.split('.').reduce((x, k) => x == null ? undefined : x[k], o);
    return Object.entries(m).filter(([, p]) => get(p.startsWith('vista.') ? d : d.config, p) === undefined).map(([id]) => id);
  }, EN_JSON);
  check('E · cada mando del mapa tiene su campo en el JSON exportado', rutas.length === 0, rutas.join(', '));
  /* el control de E: quitar un mando del mapa TIENE que salir en `faltan` */
  const sinLat = ids.filter(id => !(id in Object.fromEntries(Object.entries(EN_JSON).filter(([k]) => k !== 'lat'))) && !(id in EXCLUIDOS));
  check('E · control: si el banco olvidara `lat`, la cobertura lo detecta', sinLat.includes('lat'));
}
/* ── F · plantas reales ── */
const REALES = [['Fayón (layout)', () => loadLayoutPlant('fayon')]];
if (process.env.CFG_COTAS) REALES.push(['San José (cotas, bloque 0)', () => loadRealPlant('sanjose', 0)]);
for (const [nom, cargar] of REALES) {
  const P = await pagina();
  const t1 = Date.now();
  await P.evaluate(async f => { const p = esperaCalculo(); await (new Function('return (' + f + ')()'))(); await p; }, cargar.toString());
  await P.evaluate(async () => { $('hour').value = 17 * 60; $('rowsel').value = 2; });
  const d = await P.evaluate(() => exportaConfig());
  const Q = await pagina();
  const t2 = Date.now();
  const r = await Q.evaluate(x => cargaConfig(x), d);
  const tc = (Date.now() - t2) / 1000;
  const d2 = await Q.evaluate(() => exportaConfig());
  check(`F · ${nom}: planta_real en el JSON, carga ok y mismo hash`, d.config.planta_real && r.ok && d2.hash === d.hash,
    JSON.stringify({ pr: d.config.planta_real, dif: r.difieren }));
  console.log(`  ${nom}: ${d.config.geometria.filas} líneas · carga desde el JSON ${tc.toFixed(0)} s · total ${((Date.now() - t1) / 1000).toFixed(0)} s (máquina ocupada: declarado, no es una medida de tiempo)`);
  await P.close(); await Q.close();
}
await b.close();
console.log(`\n${ok} OK · ${ko} FALLOS · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(ko ? 1 : 0);
