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

await browser.close(); srv.close();
console.log('');
console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
