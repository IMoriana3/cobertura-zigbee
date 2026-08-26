/* QA de telemetria.html — la página que dice si una planta corrige el relieve.
   Uso:  node tools/test_telemetria.mjs

   Se prueba con datos SINTÉTICOS en las dos direcciones, que es lo único que
   demuestra que la página sirve: una planta que manda un ángulo único tiene
   que salir «no corrige», y una que abre los ángulos, «sí corrige». Una
   página que solo se hubiera probado con el caso bueno no distinguiría nada.

   La respuesta de Supabase se sustituye por un stub en el propio navegador:
   así se prueba el remuestreo, la apertura y el veredicto sin red y sin
   depender de que haya datos cargados.                                      */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let N = 0, FAIL = 0;
const t = (nm, ok, extra = '') => { N++; if (ok) console.log('  ✓ ' + nm);
  else { FAIL++; console.error('  ✗ ' + nm + (extra ? ' — ' + extra : '')); } };

/* ── estáticos ───────────────────────────────────────────────────────────── */
const html = fs.readFileSync(path.join(ROOT, 'telemetria.html'), 'utf-8');
console.log('estático');
t('sin cargas remotas (la casa es offline salvo la propia consulta)',
  !/<(script|link)[^>]+(src|href)=["']https?:/.test(html));
t('la apertura es ROBUSTA (p95−p5), no máx−mín: un seguidor en tope no puede mandar',
  /0\.95\)\]\s*-\s*v\[Math\.floor\(v\.length \* 0\.05\)\]/.test(html));
t('el eje declara el huso del DATO, no un «local» inventado',
  /el huso que declara el propio dato/.test(html));
t('la apertura se mide SOLO dentro del seguimiento, no en las maniobras',
  /mejor\[1\] - mejor\[0\]/.test(html) && /Fuera del seguimiento/.test(html));
t('con apertura cero avisa de que en terreno PLANO eso no prueba nada',
  /en terreno ` \+\s*`PLANO un backtracking correcto/.test(html) || /PLANO un backtracking correcto/.test(html));
t('el veredicto se juzga por los EXTREMOS, no por el día entero',
  /Math\.abs\(x\.med\) > 35/.test(html) && /no distingue/.test(html));
t('el remuestreo descarta la muestra si cae fuera de media malla',
  /<= paso \/ 2/.test(html));
t('se excluyen los seguidores en tope del cálculo de apertura',
  /Math\.abs\(e\.obj\[i\]\) < 54\.9/.test(html));
// la RLS es «for select to authenticated»: sin sesión la consulta responde 200
// con CERO filas, que no parece un fallo. Pasó en la primera prueba real.
t('hay login: sin sesión la tabla devuelve 200 y cero filas, y eso despista',
  /grant_type=password/.test(html) && /access_token/.test(html));
t('la contraseña no se guarda ni se queda en el DOM',
  /sessionStorage\.setItem\('tele_ses'/.test(html) && /\$\('pass'\)\.value = ''/.test(html)
  && !/sessionStorage\.setItem\([^)]*pass(word)?\b/i.test(html));
t('las consultas usan el token de sesión cuando lo hay',
  /Bearer ' \+ \(\(s && s\.token\) \|\| key\)/.test(html));
t('cero filas se explica distinto con sesión y sin ella',
  /cero filas SIN sesión/.test(html) && /cero filas CON sesión/.test(html));
t('una sesión caducada (401) se dice, no se arrastra',
  /r\.status === 401/.test(html));
t('magic link: se pide a /auth/v1/otp y vuelve a ESTA página',
  /auth\/v1\/otp\?redirect_to=/.test(html) && /location\.origin \+ location\.pathname/.test(html));
t('el enlace no da de alta a nadie (create_user:false)',
  /create_user: false/.test(html));
t('el token del fragmento se limpia del historial',
  /history\.replaceState/.test(html));
t('reutiliza la sesión que la página hermana dejó en el MISMO origen',
  /\^sb-\.\+-auth-token\$/.test(html) && /currentSession/.test(html));
t('si esa sesión heredada ha caducado, la renueva con su refresh_token',
  /grant_type=refresh_token/.test(html));
t('hay entrada por GitHub, que es como se autentica la casa',
  /provider=github/.test(html) && /auth\/v1\/authorize/.test(html));
// cuando la sesión no es viable (proveedor deshabilitado, RLS que no alcanza)
// la página tiene que servir igual desde un fichero: si no, un problema de
// permisos deja sin respuesta una pregunta que no depende de permisos
t('se puede analizar SIN conexión, desde fichero o pegando',
  /id="fich"/.test(html) && /id="pegado"/.test(html) && /function normaliza/.test(html));
// el alias de la subconsulta NO puede ser «t»: hay una columna «t» y Postgres
// resuelve esa, con «row_to_json(jsonb) does not exist». Pasó en el primer uso.
t('la consulta de ejemplo no colisiona el alias con la columna «t»',
  /\)\s*q;/.test(html) && !/\)\s*t;/.test(html));
t('un CSV sin desenvolver da una pista útil, no solo «token inesperado»',
  /parece el CSV del SQL Editor/.test(html) && /Ctrl\+F5/.test(html));
t('la plantilla NO trae valores inventados que parezcan buenos',
  /PON_AQUI_LA_PLANTA/.test(html) && /AAAA-MM-DD/.test(html));
t('se explica que json_agg NULL es «cero filas», no un error',
  /json_agg<\/code> da NULL cuando/.test(html));
t('la consulta de ejemplo avisa del límite de 100 filas del editor',
  /No limit/.test(html));
t('el fichero se NORMALIZA en vez de exigir un formato',
  /Array\.isArray\(j\.equipos\)/.test(html) && /x\.series \|\| \{ t: x\.t/.test(html));

/* ── navegador, con la respuesta de Supabase sustituida ──────────────────── */
const serie = (paso, fn) => {
  const t2 = [], v = [];
  for (let s = 0; s < 86400; s += paso) { t2.push(s); v.push(fn(s)); }
  return { t: t2, v: { target_angle: v, angle: v } };
};
// θ astronómico de juguete: −55 al alba, 0 al mediodía, +55 al ocaso
const astro = (s) => Math.max(-55, Math.min(55, (s - 43200) / 43200 * 90));

/* La planta sintética incluye POSICIÓN NOCTURNA y MANIOBRAS de entrada y
   salida, porque es lo que trae la planta real: cada seguidor sale de la noche
   en un instante distinto y durante ese tránsito los ángulos difieren
   muchísimo. Sin eso, el test no probaría el fallo que costó un veredicto
   equivocado (19° de «apertura» que eran maniobra). */
function planta(abre, ncu = '1') {
  const filas = [];
  const T0 = 7 * 3600, T1 = 17 * 3600;               // ventana de seguimiento
  for (let i = 1; i <= 40; i++) {
    const pend = (i - 20) / 20;                       // −1 … +1
    const arranque = T0 + (i % 10) * 600;             // cada uno sale cuando le toca
    filas.push({ ncu, equipo: 'TCU ' + i, tz: 'UTC', paso_s: 300, cobertura: 99,
      series: serie(300, (s) => {
        // La noche se pasa al OESTE (+40, como quien viene de un stow) y el
        // seguimiento arranca al ESTE (−50): así la maniobra hace CAER la
        // mediana, igual que en El Burgo real (−30 → −54 al arrancar, +55 → −5
        // al acabar). Sin esa caída el tramo de seguimiento no se distingue.
        if (s < arranque) return 40;
        if (s > T1 + (i % 10) * 600) return -5;
        const a = astro(s);
        return a + (abre ? pend * 6 * Math.abs(a) / 55 : 0);
      }) });
  }
  return filas;
}

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const port = srv.address().port;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await browser.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://localhost:${port}/`, { waitUntil: 'load' });

console.log('navegador');
t('la página carga sin errores de consola', errs.length === 0, errs.join(' · '));

/* ── el caso REAL, que es mejor test que cualquier planta de juguete ──────
   El Burgo I, NCU2, 5-ago-2026: 51 de sus 102 seguidores, a malla de 15 min.
   Trae lo que una planta trae de verdad —posición nocturna, maniobras de
   entrada y salida escalonadas, huecos de radio— y por eso caza el fallo que
   una planta sintética no cazó: medir la apertura EN LAS MANIOBRAS daba 19° en
   una planta que durante las nueve horas de seguimiento manda un ángulo único.
   El caso positivo se construye MUTANDO el real: mismo día, mismas maniobras,
   pero abriendo los ángulos en proporción a un índice, como haría el relieve. */
const REAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixture_elburgo_20260805.json'), 'utf-8'));
const abriendo = (grados) => REAL.map((f, k) => ({
  ...f, target_angle: f.target_angle.map(v => {
    if (v == null) return v;
    // solo se abre lo que está EN SEGUIMIENTO (|θ|<54,5 y fuera del reposo)
    const pend = (k - REAL.length / 2) / (REAL.length / 2);
    return Math.abs(v) < 54.5 ? v + pend * grados * Math.abs(v) / 55 : v;
  }),
}));

for (const [nombre, filas, espera] of [['El Burgo REAL', REAL, 'err'],
                                       ['el mismo día, abriendo 12°', abriendo(12), 'ok']]) {
  const pgR = await browser.newPage();
  const eR = []; pgR.on('pageerror', e => eR.push(e.message));
  await pgR.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await pgR.fill('#pegado', JSON.stringify(filas));
  await pgR.click('#bPegar');
  await pgR.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'));
  const rR = await pgR.evaluate(() => ({
    clase: (document.querySelector('#ver .ver') || {}).className || '',
    txt: document.getElementById('ver').textContent }));
  t(`${nombre}: el veredicto acierta`, rR.clase.includes(espera),
    `clase «${rR.clase}» · ${rR.txt.slice(0, 130)}`);
  t(`${nombre}: sin errores de consola`, eR.length === 0, eR.join(' · '));
  if (filas === REAL)
    t('el REAL no cuela las maniobras como apertura (el fallo que costó el veredicto)',
      /0[.,]\d\d°/.test(rR.txt.split('—')[0]), rR.txt.slice(0, 90));
  await pgR.close();
}

/* ALCANCE: una sola NCU no es la planta, y el informe tiene que decirlo */
{
  const pg7 = await browser.newPage();
  await pg7.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  const una = planta(true, '2').map(f => ({ ncu: f.ncu, equipo: f.equipo, tz: f.tz,
    paso_s: f.paso_s, t: f.series.t, target_angle: f.series.v.target_angle }));
  await pg7.fill('#pegado', JSON.stringify(una));
  await pg7.click('#bPegar');
  await pg7.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'));
  const t7 = await pg7.evaluate(() => document.getElementById('ver').textContent);
  t('con UNA NCU avisa de que eso no es la planta entera',
    /NO es la planta entera/.test(t7) && /NCU2/.test(t7), t7.slice(0, 140));

  // dos NCUs, una que abre y otra que no: tiene que desglosar
  const mez = [...planta(true, '2'), ...planta(false, '3')].map(f => ({ ncu: f.ncu,
    equipo: f.ncu + '-' + f.equipo, tz: f.tz, paso_s: f.paso_s,
    t: f.series.t, target_angle: f.series.v.target_angle }));
  await pg7.evaluate(() => { document.getElementById('ver').innerHTML = ''; });
  await pg7.fill('#pegado', JSON.stringify(mez));
  await pg7.click('#bPegar');
  await pg7.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'));
  const t8 = await pg7.evaluate(() => document.getElementById('ver').textContent);
  t('con VARIAS NCUs desglosa la apertura de cada una',
    /NCU2 \(40 seg\)/.test(t8) && /NCU3 \(40 seg\)/.test(t8), t8.slice(0, 200));
  await pg7.close();
}

/* el CSV que da «Download CSV» del SQL Editor: cabecera + celda entrecomillada */
{
  const pg6 = await browser.newPage();
  const e6 = []; pg6.on('pageerror', e => e6.push(e.message));
  await pg6.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  const filas = planta(true).map(f => ({ ncu: f.ncu, equipo: f.equipo, tz: f.tz, paso_s: f.paso_s,
    t: f.series.t, target_angle: f.series.v.target_angle }));
  const csv = 'json_agg\n"' + JSON.stringify(filas).replace(/"/g, '""') + '"\n';
  await pg6.fill('#pegado', csv);
  await pg6.click('#bPegar');
  await pg6.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'));
  const r6 = await pg6.evaluate(() => (document.querySelector('#ver .ver') || {}).className || '');
  t('traga el CSV del SQL Editor tal cual, sin convertirlo a mano', r6.includes('ok'), `clase «${r6}»`);
  // variantes reales: BOM, cabecera entrecomillada, CRLF
  for (const [nm, mk] of [
    ['con BOM', (c) => '\uFEFF' + c],
    ['cabecera entrecomillada', (c) => c.replace(/^json_agg/, '"json_agg"')],
    ['con CRLF', (c) => c.replace(/\n/g, '\r\n')],
  ]) {
    await pg6.evaluate(() => { document.getElementById('ver').innerHTML = ''; });
    await pg6.fill('#pegado', mk(csv));
    await pg6.click('#bPegar');
    await pg6.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'), null, { timeout: 8000 });
    const rr = await pg6.evaluate(() => (document.querySelector('#ver .ver') || {}).className || '');
    t(`CSV ${nm}: también entra`, rr.includes('ok'), `clase «${rr}»`);
  }
  t('sin errores de consola con el CSV', e6.length === 0, e6.join(' · '));
  await pg6.close();
}

/* GitHub: es una NAVEGACIÓN al authorize de Supabase, no un fetch */
{
  const pg4 = await browser.newPage();
  await pg4.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  // la navegación se intercepta y se aborta: interesa A DÓNDE iba, no llegar
  let ido = null;
  await pg4.route('**/auth/v1/authorize*', r => { ido = r.request().url(); r.abort(); });
  await pg4.click('#bGithub');
  await pg4.waitForTimeout(600);
  t('«Entrar con GitHub» va al authorize con el proveedor y la vuelta',
    /\/auth\/v1\/authorize\?provider=github&redirect_to=/.test(ido || ''), String(ido));
  t('la vuelta apunta a ESTA página, no a otra',
    decodeURIComponent(String(ido)).includes(`localhost:${port}/`), String(ido));
  await pg4.close();
}

/* sesión heredada: la que supabase-js dejó en localStorage vale, sin teclear */
{
  const pg3 = await browser.newPage();
  const e3 = []; pg3.on('pageerror', e => e3.push(e.message));
  await pg3.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await pg3.evaluate(() => {
    localStorage.setItem('sb-abc123-auth-token', JSON.stringify({
      access_token: 'TOKEN_HEREDADO', refresh_token: 'R',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'quien@factiun.com' } }));
    window.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  });
  await pg3.click('#bSondeo');
  await pg3.waitForFunction(() => document.getElementById('log').textContent.includes('sondeando'));
  const r3 = await pg3.evaluate(() => ({
    ses: JSON.parse(sessionStorage.getItem('tele_ses') || 'null'),
    log: document.getElementById('log').textContent }));
  t('adopta la sesión de la página hermana sin pedir credenciales',
    !!(r3.ses && r3.ses.token === 'TOKEN_HEREDADO'), JSON.stringify(r3.ses));
  t('y lo dice en el registro, en vez de entrar en silencio',
    /reutilizada/.test(r3.log), r3.log.slice(-120));
  t('sin errores de consola al heredar', e3.length === 0, e3.join(' · '));
  await pg3.close();
}

/* vuelta del enlace: token en el fragmento ⇒ sesión activa y barra limpia */
{
  const pg2 = await browser.newPage();
  const e2 = []; pg2.on('pageerror', e => e2.push(e.message));
  await pg2.goto(`http://localhost:${port}/#access_token=TOKEN_DE_PRUEBA&token_type=bearer&expires_in=3600`,
                 { waitUntil: 'load' });
  const r = await pg2.evaluate(() => ({
    ses: JSON.parse(sessionStorage.getItem('tele_ses') || 'null'),
    hash: location.hash, txt: document.getElementById('sesion').textContent,
  }));
  t('volver con el token en el fragmento deja sesión iniciada',
    !!(r.ses && r.ses.token === 'TOKEN_DE_PRUEBA') && /activa/.test(r.txt), JSON.stringify(r));
  t('y el token NO se queda en la barra de direcciones', r.hash === '', `hash «${r.hash}»`);
  t('sin errores de consola al volver del enlace', e2.length === 0, e2.join(' · '));
  await pg2.close();
}

await browser.close(); srv.close();
console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
