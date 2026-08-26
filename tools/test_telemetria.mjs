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

function planta(abre) {
  const filas = [];
  for (let i = 1; i <= 40; i++) {
    // «abre»: cada seguidor se desvía en proporción a su pendiente, y el
    // desvío CRECE con |θ|, que es como se comporta el backtracking real
    const pend = (i - 20) / 20;                       // −1 … +1
    filas.push({ ncu: '1', equipo: 'TCU ' + i, tz: 'UTC', paso_s: 300, cobertura: 99,
      series: serie(300, (s) => { const a = astro(s);
        return a + (abre ? pend * 6 * Math.abs(a) / 55 : 0); }) });
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

for (const [nombre, abre, espera] of [['ángulo único', false, 'err'], ['ángulos abiertos', true, 'ok']]) {
  await pg.evaluate((filas) => {
    // stub del índice y de la consulta del día
    window.fetch = async (u) => ({ ok: true, status: 200, json: async () =>
      String(u).includes('series')
        ? filas
        : [{ planta: 'P', ncu: '1', clase: 'tcu', dia: '2026-08-20', equipo: 'TCU 1', cobertura: 99, paso_s: 300 }] });
  }, planta(abre));
  await pg.click('#bSondeo');
  await pg.waitForFunction(() => document.getElementById('cDia').style.display === '');
  await pg.click('#bAnalizar');
  await pg.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'));
  const r = await pg.evaluate(() => ({
    html: document.getElementById('ver').innerHTML,
    clase: (document.querySelector('#ver .ver') || {}).className || '',
  }));
  t(`${nombre}: el veredicto acierta`, r.clase.includes(espera),
    `clase «${r.clase}» · ${r.html.replace(/<[^>]+>/g, ' ').slice(0, 110)}`);
}

/* fichero: la misma respuesta sin tocar la red ni los permisos */
for (const [nombre, abre, espera] of [['fichero · ángulo único', false, 'err'],
                                      ['fichero · ángulos abiertos', true, 'ok']]) {
  const pg5 = await browser.newPage();
  const e5 = []; pg5.on('pageerror', e => e5.push(e.message));
  await pg5.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  // lo que saldría del SQL Editor: arrays sueltos, sin `series`
  const filas = planta(abre).map(f => ({ ncu: f.ncu, equipo: f.equipo, tz: f.tz, paso_s: f.paso_s,
    t: f.series.t, target_angle: f.series.v.target_angle, angle: f.series.v.angle }));
  await pg5.fill('#pegado', JSON.stringify(filas));
  await pg5.click('#bPegar');
  await pg5.waitForFunction(() => document.getElementById('ver').innerHTML.includes('Apertura'));
  const r5 = await pg5.evaluate(() => (document.querySelector('#ver .ver') || {}).className || '');
  t(`${nombre}: acierta sin tocar la red`, r5.includes(espera), `clase «${r5}»`);
  t(`${nombre}: sin errores de consola`, e5.length === 0, e5.join(' · '));
  await pg5.close();
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
