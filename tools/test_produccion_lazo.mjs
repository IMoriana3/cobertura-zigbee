/* La UI del lazo de control y del selector de política, EN CHROMIUM (produccion.html).
   Uso:  PUERTO=8127 node tools/test_produccion_lazo.mjs   (levanta su propio servidor si no hay)

   Los bancos Node de LÓGICA PURA ya comprueban la física del lazo; esto comprueba lo que solo se
   ve en la página: que el selector se pueble con las nueve políticas, que el interruptor cambie de
   verdad el θ pintado, que el CURSOR del lazo dé lo mismo que recorrer el día en orden —si no, la
   escena y la energía estarían contando dos físicas distintas— y lo que cuesta en tiempo mover el
   reloj hacia atrás, que es el precio declarado de que la banda muerta tenga memoria. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// La ruta del navegador va en UN solo sitio. Este banco nació con ella clavada
// —'/opt/pw-browsers/chromium_headless_shell-1194/...'— y en CI no existe: el
// job murió con «Failed to launch chromium», que se lee como banco roto y era
// banco mal instalado. Es exactamente el fallo por el que pw_navegador.mjs
// existe (once bancos antes que este), y aquí se hacía el doce. En CI devuelve
// undefined, que es como se le dice a Playwright «usa el que te instalaste».
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUERTO = process.env.PUERTO || 8127;
const BASE = `http://127.0.0.1:${PUERTO}`;

let ok = 0, ko = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); }
                      catch (e) { ko++; console.error('  ✗ ' + n + ' — ' + e.message); } };

// servidor propio si el puerto está libre (como test_produccion_3d)
let srv = null;
async function vivo() {
  try { const r = await fetch(BASE + '/produccion.html'); return r.ok; } catch { return false; }
}
if (!(await vivo())) {
  srv = spawn('python3', ['-m', 'http.server', String(PUERTO)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await vivo()); i++) await new Promise(r => setTimeout(r, 250));
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(String(e)));
await pg.goto(BASE + '/produccion.html', { waitUntil: 'load', timeout: 120000 });
const t0 = Date.now();
while (!(await pg.evaluate(() => typeof instant === 'function' && typeof ctrlDe === 'function' && !!T))) {
  if (Date.now() - t0 > 180000) throw new Error('la página no expuso instant/ctrlDe/T');
  await pg.waitForTimeout(400);
}

console.log('produccion.html — el lazo de control y las políticas, en el navegador');

t('la página carga sin errores', () => {
  if (errs.length) throw new Error(errs.slice(0, 2).join(' | '));
});

const ui = await pg.evaluate(() => ({
  pols: [...document.getElementById('pol').options].map(o => o.value),
  nombres: [...document.getElementById('pol').options].map(o => o.textContent),
  titulos: [...document.getElementById('pol').options].filter(o => o.title).length,
  valor: document.getElementById('pol').value,
  campos: ['ctrlOn','ctrlDb','ctrlSlew','ctrlCiclo','ctrlModo'].filter(i => !!document.getElementById(i)),
  db: document.getElementById('ctrlDb').value,
  slew: document.getElementById('ctrlSlew').value,
  on: document.getElementById('ctrlOn').checked,
  pill: document.getElementById('modepill').textContent,
  nucleo: typeof CTRLCORE !== 'undefined' && !!CTRLCORE,
}));

t('el núcleo del lazo ha cargado en la página (js/control_core.js)', () => {
  if (!ui.nucleo) throw new Error('CTRLCORE no está: el <script src> no ha entrado');
});
t('el selector trae las NUEVE políticas del bt3d, con su descripción', () => {
  if (ui.pols.length !== 9) throw new Error(`${ui.pols.length} políticas: ${ui.pols.join(',')}`);
  if (ui.titulos !== 9) throw new Error(`${ui.titulos} de 9 opciones llevan descripción`);
  for (const k of ['pairwise','true3d','row','global','bt2d','mgl','optimal','optfree','astro'])
    if (!ui.pols.includes(k)) throw new Error(`falta la política ${k}`);
});
t('arranca en PAIRWISE y con el lazo APAGADO (quien no toque nada ve la página de antes)', () => {
  if (ui.valor !== 'pairwise') throw new Error(`arranca en ${ui.valor}`);
  if (ui.on) throw new Error('el lazo arranca encendido');
  if (!/Pairwise/.test(ui.pill)) throw new Error(`el pill no dice la política: «${ui.pill}»`);
});
t('la tarjeta del lazo tiene sus cinco campos, con los canónicos de la casa', () => {
  if (ui.campos.length !== 5) throw new Error('faltan campos: ' + ui.campos.join(','));
  if (ui.db !== '1.0') throw new Error(`banda por defecto ${ui.db}`);
  if (ui.slew !== '0.17') throw new Error(`velocidad por defecto ${ui.slew}`);
});

/* EL CURSOR. Es la pieza que solo existe en la página: el instante pintado sale de avanzar un
   cursor, y tiene que dar EXACTAMENTE lo mismo que recorrer el día en orden con instant(). Si no,
   la escena y la energía cuentan dos físicas distintas — el pecado que esta casa ya conoce. */
const cur = await pg.evaluate(() => {
  const c = cfg();
  c.ctrl = { on:true, db:1.0, slew:0.17, cicloMin:1, modo:'libre' };
  document.getElementById('ctrlOn').checked = true;
  const paso = PASO_LAZO, M = 615;
  // a mano, recorriendo el día en orden
  let prev = null, aMano = null;
  for (let m = 0; m <= Math.floor(M / paso) * paso; m += paso) {
    prev = instant(F, c, T.obj, m, prev);
    aMano = prev;
  }
  const fin = instant(F, c, T.obj, M, aMano);
  // por el cursor (el camino de repaint)
  CTRLCUR = null;
  const t1 = performance.now();
  const porCursor = instantConLazo(c, M);
  const msFrio = performance.now() - t1;
  const t2 = performance.now();
  const seguido = instantConLazo(c, M + 5);      // avanzar hacia DELANTE
  const msTibio = performance.now() - t2;
  const t3 = performance.now();
  instantConLazo(c, 400);                        // ir hacia ATRÁS: rehace la mañana
  const msAtras = performance.now() - t3;
  // y el instante SIN lazo, para ver que el interruptor hace algo
  const sin = instant(F, Object.assign({}, c, { ctrl:{ on:false } }), T.obj, M);
  return { mano: fin.ang.slice(), cursor: porCursor.ang.slice(), cons: fin.angT.slice(),
           sin: sin.ang.slice(), msFrio, msTibio, msAtras, seguido: seguido.ang.slice() };
});

t('el CURSOR da el mismo θ que recorrer el día en orden (una sola física en pantalla)', () => {
  if (JSON.stringify(cur.mano) !== JSON.stringify(cur.cursor))
    throw new Error(`cursor ≠ día en orden:\n  mano:   ${cur.mano.slice(0,4).map(v=>v.toFixed(4))}\n  cursor: ${cur.cursor.slice(0,4).map(v=>v.toFixed(4))}`);
});
t('con el lazo el θ pintado NO es la consigna, y se separa menos de una banda', () => {
  const d = cur.mano.map((v, i) => Math.abs(v - cur.cons[i]));
  const peor = Math.max(...d);
  if (!(peor > 1e-6)) throw new Error('el lazo no desalinea nada: el interruptor no hace nada');
  if (peor > 1.0 + 1e-6) throw new Error(`desalineo mayor que la banda: ${peor.toFixed(4)}°`);
});
t('y el θ con lazo es distinto del θ sin lazo (el interruptor se nota en la escena)', () => {
  if (JSON.stringify(cur.mano) === JSON.stringify(cur.sin))
    throw new Error('con y sin lazo pintan el mismo θ');
});
t('avanzar el reloj hacia DELANTE es barato; hacia atrás se paga y va declarado', () => {
  if (!(cur.msTibio < cur.msFrio)) throw new Error(`avanzar (${cur.msTibio.toFixed(0)} ms) no es más barato que arrancar en frío (${cur.msFrio.toFixed(0)} ms)`);
  console.log(`    (cursor: frío ${cur.msFrio.toFixed(0)} ms · un paso ${cur.msTibio.toFixed(0)} ms · hacia atrás ${cur.msAtras.toFixed(0)} ms)`);
  if (cur.msAtras > 20000) throw new Error(`ir hacia atrás cuesta ${(cur.msAtras/1000).toFixed(1)} s: inusable`);
});

/* Y que al mover el interruptor en la UI la página REPINTE con lo nuevo, que es el cableado de los
   listeners (invalidar el día, el cursor y el carril de horas). */
const tras = await pg.evaluate(async () => {
  const antes = document.getElementById('modepill').textContent;
  document.getElementById('ctrlDb').value = '4';
  document.getElementById('ctrlOn').checked = true;
  document.getElementById('ctrlOn').dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 300));
  const pill = document.getElementById('modepill').textContent;
  document.getElementById('pol').value = 'astro';
  document.getElementById('pol').dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 300));
  return { antes, pill, pill2: document.getElementById('modepill').textContent, cursor: !!CTRLCUR };
});

t('encender el lazo en la UI repinta y el pill dice el PASO', () => {
  if (!/paso 4°/.test(tras.pill)) throw new Error(`el pill no lleva el paso: «${tras.pill}»`);
});
t('cambiar de política repinta y el pill dice cuál', () => {
  if (!/Astronómico/.test(tras.pill2)) throw new Error(`el pill no dice la política: «${tras.pill2}»`);
});
/* LA TABLA POR MINUTO. Lo que solo se ve en la página: que el botón calcule, que la tabla se pinte
   con sus filas y que el CSV aparezca. El cuadre con «E string Σ día» lo exige el banco Node. */
const tabla = await pg.evaluate(async () => {
  document.getElementById('ctrlOn').checked = true;
  document.getElementById('ctrlDb').value = '2';
  document.getElementById('ctrlOn').dispatchEvent(new Event('change'));
  document.getElementById('minpaso').value = '5';           // 5 min para que el banco no tarde
  document.getElementById('minbtn').click();
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (MINT) break;
  }
  const out = document.getElementById('minout');
  return { hecha: !!MINT, filas: MINT ? MINT.filas.length : 0, paso: MINT ? MINT.paso : null,
           lazo: MINT ? MINT.lazo : null, trs: out.querySelectorAll('tbody tr').length,
           cab: [...out.querySelectorAll('thead th')].map(t => t.textContent),
           txt: out.textContent.slice(0, 160),
           csvVisible: document.getElementById('mincsv').style.display !== 'none' };
});

t('la tabla por minuto se calcula y se pinta', () => {
  if (!tabla.hecha) throw new Error('MINT vacío: la tabla no llegó a calcularse');
  if (tabla.filas !== 288) throw new Error(`${tabla.filas} filas a paso de 5 min (esperadas 288)`);
  if (!(tabla.trs > 50)) throw new Error(`solo ${tabla.trs} filas pintadas: la tabla sale vacía`);
  if (tabla.trs >= tabla.filas) throw new Error('se pintan también las filas de noche: la tabla no filtra');
  if (!tabla.lazo) throw new Error('la tabla no se ha enterado de que el lazo está encendido');
});
t('la tabla lleva las columnas que dice llevar, con el θ ejecutado y el desalineo', () => {
  for (const h of ['hora', 'θ* °', 'θ °', 'desal. °', 'sombra %', 'POA W/m²', 'P DC W', 'E acum Wh'])
    if (!tabla.cab.includes(h)) throw new Error(`falta la columna «${h}»: ${tabla.cab.join(' · ')}`);
  if (!/con lazo de control/.test(tabla.txt)) throw new Error('la cabecera no declara el lazo');
  if (!tabla.csvVisible) throw new Error('el botón de CSV no ha aparecido');
});

const tras2 = await pg.evaluate(async () => {
  document.getElementById('ctrlDb').value = '3';
  document.getElementById('ctrlDb').dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 300));
  return { mint: !!MINT, txt: document.getElementById('minout').textContent,
           csv: document.getElementById('mincsv').style.display };
});
t('cambiar la configuración TIRA la tabla en vez de dejarla mintiendo', () => {
  if (tras2.mint) throw new Error('la tabla sigue viva tras cambiar la banda');
  if (!/vuelve a calcular/.test(tras2.txt)) throw new Error(`no avisa: «${tras2.txt.slice(0,80)}»`);
  if (tras2.csv === '') throw new Error('el botón de CSV sigue ofreciendo una tabla que ya no existe');
});

/* EL BURGO EN LA PÁGINA, CONTRA EL CANARIO. La rama de El Burgo de produccion.html
   —cargar los dos ficheros del plano, fundir las columnas, armar la T— no la tocaba
   ningún banco de navegador, y es la que arma la planta REAL. Ahora que su geometría
   vive en LÓGICA PURA (tGenerica/tElburgo/ebDe/cfgEB) y el canario de la cifra la
   estima llamando a esas mismas funciones desde Node, esto cierra el círculo: la
   PÁGINA, con sus fetch de verdad y su cfg() leyendo el DOM, tiene que dar el mismo
   número que hay en tools/golden_anual.json. Si alguien cambia el cargador y el
   generador no se entera —o al revés—, salta aquí. */
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'golden_anual.json'), 'utf-8'));
const CEB = GOLDEN.casos.find(k => k.id === 'elburgo_21jun_horario');
const eb = await pg.evaluate(async (esp) => {
  document.getElementById('ctrlOn').checked = false;
  document.getElementById('ctrlOn').dispatchEvent(new Event('change'));
  document.getElementById('pol').value = 'pairwise';
  document.getElementById('pol').dispatchEvent(new Event('change'));
  document.getElementById('date').value = esp.cfg.date;
  document.getElementById('date').dispatchEvent(new Event('change'));
  document.getElementById('plant').value = 'elburgo';
  document.getElementById('plant').dispatchEvent(new Event('change'));
  // la planta se carga con fetch: se espera a que la T tenga las filas del plano
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 200));
    const c0 = cfg();
    if (c0.plant === 'elburgo' && T && T.obj && T.xs && T.xs.length === esp.cfg.nrows) break;
  }
  const c = cfg();
  // alt no lo impone la planta: el caso del golden lo pone a 180 (El Burgo)
  document.getElementById('alt').value = String(esp.cfg.alt);
  const c2 = cfg();
  const v = dayEnergy(F, c2, T.obj, c2.date, esp.paso_min, mapStringW(F, c2, T.obj));
  return { nrows: c2.nrows, cw: c2.cw, maxang: c2.maxang, lat: c2.lat, lon: c2.lon,
           kwh: v, total: v.reduce((a, b) => a + b, 0) };
}, CEB);

t('El Burgo se levanta del plano en la PÁGINA con la geometría que dice el golden', () => {
  for (const [k, esp] of [['nrows', CEB.cfg.nrows], ['cw', CEB.cfg.cw], ['maxang', CEB.cfg.maxang],
                          ['lat', CEB.cfg.lat], ['lon', CEB.cfg.lon]])
    if (Math.abs(eb[k] - esp) > 1e-12)
      throw new Error(`${k}: la página dice ${eb[k]} y el golden ${esp}`);
});

t('y su cifra por string es EXACTAMENTE la del canario (la página y Node, una sola planta)', () => {
  if (eb.kwh.length !== CEB.kwh.length)
    throw new Error(`${eb.kwh.length} strings contra los ${CEB.kwh.length} del golden`);
  for (let k = 0; k < CEB.kwh.length; k++) {
    const d = Math.abs(eb.kwh[k] - CEB.kwh[k]) / Math.max(1e-12, Math.abs(CEB.kwh[k]));
    if (d > 1e-9)
      throw new Error(`string ${k}: la página ${eb.kwh[k].toFixed(6)} kWh contra ${CEB.kwh[k].toFixed(6)} ` +
                      `del golden (${(d * 100).toFixed(6)} %)`);
  }
});

/* ── LA CONFIGURACIÓN, IDA Y VUELTA DE VERDAD ────────────────────────────────
   El banco Node ya comprueba que la lista CAMPOS esté completa y que confDe /
   confAplica sean inversas. Lo que solo se puede comprobar aquí es el camino
   entero: pulsar ⬇ config y que baje un fichero, mover la página a OTRA planta
   y otros valores, cargar el fichero con ⬆ config y que vuelva TODO — y, lo que
   de verdad importa, que la estimación vuelva a dar el MISMO número. Una
   configuración que se restaura «casi» es peor que ninguna: el informe sale con
   una cifra que no se puede volver a montar. */
const RARA = { plant:'generica', lat:'40.1234', lon:'-3.4321', date:'2026-09-13', tz:'1',
               alt:'555', albedo:'0.33', cloud:'15', pitch:'5.5', cw:'2.1', maxang:'45',
               nrows:'7', tpreset:'valle', tparam:'2.5', mods:'26', wp:'615', gamma:'-0.29',
               tamb:'24', wind:'2.5', iamb0:'0.08', bifa:'40', bperd:'12', lsoil:'3',
               lmis:'1.2', lwir:'2.1', llid:'0.8', ninv:'2', pnom:'90', etamax:'0.982',
               gridkw:'120', ltrafo:'1.1', lacw:'0.4', laux:'0.6', ldispo:'98',
               ldeg:'0.45', lanio:'12', lsoilv:'1;1;1;2;2;3;3;3;2;2;1;1',
               horv:'0:3; 90:1; 180:0; 270:2', umeteo:'5', umodelo:'3', usoil:'1.5',
               udisp:'0.8', udeg:'0.2', pol:'row', ctrlDb:'2.5', ctrlSlew:'0.12',
               ctrlCiclo:'2', ctrlModo:'seguro', medidas:'I-1.1 123,4' };
const RARACHK = { manual:false, ctrlOn:true, horon:true, lsoilmes:true };
const RARAVISTA = { cmode:'pday', cscale:'rel', hour:'505', minpaso:'5', speed:'150' };

const antes = await pg.evaluate(async (r) => {
  document.getElementById('plant').value = 'generica';
  document.getElementById('plant').dispatchEvent(new Event('change'));
  await new Promise(res => setTimeout(res, 600));
  for (const [id, v] of Object.entries({ ...r.RARA, ...r.RARAVISTA })) {
    const e = document.getElementById(id); e.value = v;
  }
  for (const [id, v] of Object.entries(r.RARACHK)) document.getElementById(id).checked = v;
  document.getElementById('meteo').dispatchEvent(new Event('change'));
  await new Promise(res => setTimeout(res, 400));
  // la T se reconstruye A MANO porque aquí los campos se han puesto a pelo, sin
  // sus eventos: sin esto la medida «antes» iría con una c de 7 filas contra una
  // T de 10 —el pitch y el terreno de la configuración anterior—, y el careo
  // contra la vuelta acusaría a la importación de un 1,95 % que era del test
  rebuildT();
  await new Promise(res => setTimeout(res, 200));
  const c = cfg();
  const v = dayEnergy(F, c, T.obj, c.date, 60, mapStringW(F, c, T.obj));
  return { total: v.reduce((a, b) => a + b, 0), kwh: v, nrows: c.nrows };
}, { RARA, RARACHK, RARAVISTA });

const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#cfgexp')]);
const fich = await dl.path();
const guardado = JSON.parse(fs.readFileSync(fich, 'utf-8'));

t('⬇ config baja un fichero que se marca, con la configuración y la vista aparte', () => {
  if (!/^config_generica_2026-09-13\.json$/.test(dl.suggestedFilename()))
    throw new Error('el fichero se llama «' + dl.suggestedFilename() + '»');
  if (guardado.app !== 'produccion.html') throw new Error('el fichero no dice de qué página es');
  if (!guardado.v || !guardado.guardado) throw new Error('sin versión o sin fecha de guardado');
  for (const [id, v] of Object.entries(RARA))
    if (guardado.campos[id] !== v) throw new Error(`campos.${id} = ${guardado.campos[id]} y era ${v}`);
  for (const [id, v] of Object.entries(RARACHK))
    if (guardado.campos[id] !== v) throw new Error(`campos.${id} = ${guardado.campos[id]} y era ${v}`);
  for (const [id, v] of Object.entries(RARAVISTA))
    if (guardado.vista[id] !== v) throw new Error(`vista.${id} = ${guardado.vista[id]} y era ${v}`);
  if ('cmode' in guardado.campos) throw new Error('la vista se ha colado en los campos');
});

// se mueve la página TODO lo que se puede: otra planta (que además bloquea la
// geometría), otro día, otra política, el lazo apagado y la meteo al cielo
await pg.evaluate(async () => {
  document.getElementById('plant').value = 'elburgo';
  document.getElementById('plant').dispatchEvent(new Event('change'));
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (cfg().plant === 'elburgo' && T && T.xs && T.xs.length > 50) break;
  }
  for (const [id, v] of [['date', '2026-01-15'], ['pol', 'global'], ['albedo', '0.1'],
                         ['mods', '20'], ['lanio', '1'], ['medidas', ''], ['cmode', 'pinst'],
                         ['hour', '900'], ['ctrlDb', '9'], ['horv', '0:0']]) {
    const e = document.getElementById(id); e.value = v;
  }
  for (const id of ['ctrlOn', 'horon', 'lsoilmes']) document.getElementById(id).checked = false;
});

await pg.setInputFiles('#cfgfile', fich);
const parte = await pg.evaluate(async () => {
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 200));
    const a = document.getElementById('aviso');
    if (a && /Configuración cargada|No puedo cargar/.test(a.textContent)) break;
  }
  const c = cfg();
  const v = dayEnergy(F, c, T.obj, c.date, 60, mapStringW(F, c, T.obj));
  const lee = id => { const e = document.getElementById(id);
                      return e.type === 'checkbox' ? e.checked : String(e.value); };
  const estado = {};
  for (const [id] of [...CAMPOS, ...CAMPOS_VISTA]) estado[id] = lee(id);
  return { aviso: document.getElementById('aviso').textContent,
           estado, plant: c.plant, nrows: c.nrows,
           total: v.reduce((a, b) => a + b, 0), kwh: v };
});

t('⬆ config vuelve a poner la planta, los 54 campos y la vista', () => {
  if (!/Configuración cargada/.test(parte.aviso))
    throw new Error('el parte no dice que se cargó: «' + parte.aviso.slice(0, 140) + '»');
  if (parte.plant !== 'generica') throw new Error('la planta no ha vuelto: ' + parte.plant);
  const mal = [];
  for (const [id, v] of Object.entries({ ...RARA, ...RARACHK, ...RARAVISTA }))
    if (parte.estado[id] !== v) mal.push(`${id}=${parte.estado[id]}≠${v}`);
  if (mal.length) throw new Error(mal.slice(0, 6).join(' · '));
});

t('y la cifra por string vuelve a ser EXACTAMENTE la de antes de guardar', () => {
  if (parte.nrows !== antes.nrows) throw new Error(`${parte.nrows} filas contra ${antes.nrows}`);
  for (let k = 0; k < antes.kwh.length; k++) {
    const d = Math.abs(parte.kwh[k] - antes.kwh[k]) / Math.max(1e-12, Math.abs(antes.kwh[k]));
    if (d > 1e-12)
      throw new Error(`string ${k}: ${parte.kwh[k]} tras la vuelta contra ${antes.kwh[k]} antes ` +
                      `(${(d * 100).toExponential(2)} %) — la configuración no se restaura entera`);
  }
  if (parte.total !== antes.total)
    throw new Error(`Σ ${parte.total} contra ${antes.total}: algo no volvió`);
});

// un fichero que NO es una configuración de esta página: por el mismo botón
const ajeno = path.join(os.tmpdir(), 'no_es_una_config_' + process.pid + '.json');
fs.writeFileSync(ajeno, JSON.stringify({ app: 'otra_pagina.html', campos: { albedo: '0.99' } }));
await pg.setInputFiles('#cfgfile', ajeno);
const rechazo = await pg.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (/No puedo cargar/.test(document.getElementById('aviso').textContent)) break;
  }
  return { aviso: document.getElementById('aviso').textContent,
           albedo: document.getElementById('albedo').value };
});
fs.unlinkSync(ajeno);

t('un fichero que no es de esta página se rechaza DICIÉNDOLO, y no toca nada', () => {
  if (!/No puedo cargar/.test(rechazo.aviso))
    throw new Error('lo ha aceptado o no avisa: «' + rechazo.aviso.slice(0, 140) + '»');
  if (!/otra_pagina\.html/.test(rechazo.aviso))
    throw new Error('el aviso no dice de qué era el fichero: «' + rechazo.aviso.slice(0, 140) + '»');
  if (rechazo.albedo !== '0.33')
    throw new Error(`ha tocado el albedo (${rechazo.albedo}) con un fichero que rechazó`);
});

t('no han aparecido errores de página en todo el recorrido', () => {
  if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
});

await b.close();
if (srv) srv.kill();
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
