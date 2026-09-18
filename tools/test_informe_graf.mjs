/* EL INFORME GRÁFICO, MEDIDO EN EL NAVEGADOR.
 *
 * Tres reglas del bloque son comprobables desde fuera, y son las que este banco
 * comprueba. Ninguna se da por buena leyendo el código: se abre la página, se
 * calcula el informe y se mira lo que ha quedado pintado.
 *
 *   1. EL PIE DE CADA GRÁFICA TRAE LOS SEIS CAMPOS. VER, fecha de cálculo, nb,
 *      MV efectivo, cielo (Linke, albedo y nubosidad) y el tamaño del
 *      emplazamiento (filas y mesas). Se comprueban los seis, gráfica a
 *      gráfica, en el objeto que publica el bloque Y en el texto que de verdad
 *      se lee debajo del lienzo — porque una captura viaja con lo que está
 *      escrito, no con lo que el objeto decía.
 *   2. NINGÚN PORCENTAJE SIN DENOMINADOR. El bloque registra TODO «%» que emite
 *      junto al texto de su denominador; aquí se exige que no haya ni uno con el
 *      denominador vacío, y además se barre el texto visible del bloque con una
 *      expresión regular, por si algún número se hubiera pintado por fuera del
 *      único emisor.
 *   3. LA MARCA ÁMBAR SALTA CUANDO LA SEPARACIÓN ESTÁ BAJO EL UMBRAL, y NO
 *      salta cuando no lo está. Las dos mitades, porque una sola no dice nada:
 *      un predicado que siempre valga «sí» pasaría la primera y sería inútil.
 *      · caso positivo — terreno UNIFORME: `global` y `row` son la misma
 *        política por construcción (lo dice la propia nota del simulador), así
 *        que su separación es cero y el modelo no la resuelve;
 *        · caso negativo — terreno en pendiente: `astro` (que se auto-sombrea)
 *        contra `pairwise` separa muy por encima del ancho de banda.
 *
 * Y de propina, lo que hace falta para que lo anterior signifique algo: que la
 * página no suelte errores, que las cinco gráficas pinten píxeles de verdad y
 * que cada una se exporte a PNG.
 *
 *     node tools/test_informe_graf.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8400 + (process.pid % 400);
let ok = 0, ko = 0;
const check = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { ko++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
};

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });

  /* Configura el emplazamiento y calcula el informe. Todo desde dentro de la
     página con `evaluate`: los `click`/`waitForSelector` de Playwright se han
     colgado en este repo con el elemento ya visible (ver test_panel_plegable). */
  const configura = async (c) => {
    await pg.evaluate((c) => {
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
      set('lat', c.lat); set('lon', c.lon); set('alt', c.alt); set('tl', c.tl); set('albedo', c.albedo);
      set('nrows', c.nrows); set('drive', c.drive); set('nspreset', c.nspreset); set('axtilt', c.axtilt);
      set('nbp', c.nbp); set('nsl', 'alineadas'); set('ntrk', '1');
      document.getElementById('date').value = c.date; document.getElementById('date').dispatchEvent(new Event('change'));
      document.getElementById('tpreset').value = c.tpreset; document.getElementById('tpreset').dispatchEvent(new Event('change'));
      document.getElementById('tparam').value = c.tparam; document.getElementById('tapply').click();
    }, c);
    await pg.waitForFunction(() => DAY && DAY.pol, null, { timeout: 120000 });
    await pg.waitForTimeout(1200);
  };
  const informe = async (A, B) => {
    await pg.evaluate(({ A, B }) => {
      const s = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
      s('grA', A); s('grB', B);
      window.__GRAF.listo = false;
      document.getElementById('grbtn').click();
    }, { A, B });
    await pg.waitForFunction(() => window.__GRAF && window.__GRAF.listo, null, { timeout: 300000 });
    await pg.waitForTimeout(300);
  };

  /* ── caso 1: terreno EN PENDIENTE, par que sí separa ───────────────────── */
  const pend = { lat: '41.57634', lon: '-0.79814', alt: '739', tl: '3.5', albedo: '0.20',
                 nrows: '6', drive: 'mono', nspreset: 'constante', axtilt: '0', nbp: '2',
                 date: '2026-06-21', tpreset: 'pendiente', tparam: '8' };
  await configura(pend);
  await informe('astro', 'pairwise');

  /* ── 1. los seis campos del pie, en las cinco gráficas ─────────────────── */
  const CAMPOS = ['ver', 'fecha', 'nb', 'mv', 'cielo', 'geom'];
  const pies = await pg.evaluate(() => {
    const o = {};
    for (const g of ['g1', 'g2', 'g3', 'g4', 'g5']) {
      const p = window.__GRAF.pies[g] || null;
      const n = g.slice(1);
      o[g] = { obj: p, txt: (document.getElementById('grp' + n) || {}).textContent || '' };
    }
    return o;
  });
  for (const g of ['g1', 'g2', 'g3', 'g4', 'g5']) {
    const p = pies[g].obj;
    const faltan = !p ? CAMPOS : CAMPOS.filter(k => !p[k] || !String(p[k]).trim());
    check(`${g.toUpperCase()}: el pie trae los seis campos`, faltan.length === 0, 'faltan: ' + faltan.join(', '));
    // y el texto que de verdad se lee: las etiquetas y los valores
    const t = pies[g].txt;
    const etiquetas = ['VER ', 'fecha ', 'nb ', 'MV efectivo ', 'cielo ', 'filas'];
    const sinEtiqueta = etiquetas.filter(e => !t.includes(e));
    check(`${g.toUpperCase()}: el pie escrito bajo el lienzo lleva las seis etiquetas`,
          sinEtiqueta.length === 0, 'faltan: ' + sinEtiqueta.join(', ') + ' · pie: ' + t.slice(0, 200));
    if (p) {
      check(`${g.toUpperCase()}: el pie lleva Linke, albedo y nubosidad`,
            /Linke TL/.test(p.cielo) && /albedo/.test(p.cielo) && /nubosidad/.test(p.cielo), p.cielo);
      check(`${g.toUpperCase()}: la fecha de cálculo es una fecha`, /\d{4}-\d{2}-\d{2}/.test(p.fecha), p.fecha);
    }
  }

  /* ── 0. el informe consume el pipeline del día, no una copia suya ───────
     Cazó un defecto real: el informe corre a trozos y `recompute` también, así
     que un recálculo entrando a mitad dejaba media tabla con las series del
     terreno llano de arranque y media con las del configurado —11,08 kWh/m²·d
     frente a los 8,67 de la tabla del día— sin error y sin aviso. La igualdad
     es EXACTA a propósito: son los mismos objetos pasando por la misma
     integral, así que cualquier diferencia es una mezcla de datos. */
  const careo = await pg.evaluate(() => {
    const out = [];
    for (const k in DAY.pol) {
      const a = window.__GRAF.kp[k] ? window.__GRAF.kp[k].kwh : null;
      const b = dayKpis(k).kwh;
      if (a === null || Math.abs(a - b) > 1e-12) out.push({ k, informe: a, escena: b });
    }
    return { mal: out, n: Object.keys(DAY.pol).length };
  });
  check('la escena tiene políticas calculadas contra las que carear', careo.n >= 2, 'n = ' + careo.n);
  check('el informe da EXACTAMENTE la misma energía del día que la tabla del día',
        careo.mal.length === 0,
        careo.mal.map(e => `${e.k}: informe ${e.informe} · escena ${e.escena}`).join(' | '));

  /* ── 2. ningún porcentaje sin denominador ──────────────────────────────── */
  const pct = await pg.evaluate(() => window.__GRAF.pct.map(e => ({ txt: e.txt, de: e.de })));
  const huerfanos = pct.filter(e => !e.de || !e.de.trim());
  check('se han publicado porcentajes (si no, la comprobación no diría nada)', pct.length > 5, 'n = ' + pct.length);
  check('ningún porcentaje se ha pintado sin denominador', huerfanos.length === 0,
        huerfanos.map(e => e.txt).join(' · '));

  /* El registro sólo ve lo que pasa por el emisor único. Este barrido mira el
     texto que se LEE en el bloque: todo «%» tiene que llevar detrás su
     denominador — «frente a …», «de …», «del …» o «de cielo cubierto». */
  const sueltos = await pg.evaluate(() => {
    const raiz = document.getElementById('grafcard');
    const t = (raiz.innerText || '').replace(/\s+/g, ' ');
    const out = [];
    const re = /[-+]?\d+(?:[.,]\d+)?\s?%/g;
    let m;
    while ((m = re.exec(t))) {
      const cola = t.slice(m.index + m[0].length, m.index + m[0].length + 60);
      if (!/^\s*(frente a|de |del |de cielo)/.test(cola)) out.push(m[0] + ' →' + cola.slice(0, 40));
    }
    return out;
  });
  check('en el texto visible del bloque tampoco hay un «%» suelto', sueltos.length === 0,
        sueltos.slice(0, 6).join(' | '));

  /* ── 3b. caso NEGATIVO de la marca ámbar ───────────────────────────────── */
  const sep = await pg.evaluate(() => ({ ambar: !!window.__GRAF.ambar.g2,
                                        pie: (window.__GRAF.pies.g2.extra || []).join(' · ') }));
  const pieG2Pendiente = sep.pie;
  check('en pendiente, astro vs pairwise NO levanta la marca ámbar (el predicado no es constante)',
        sep.ambar === false);

  /* ── las cinco gráficas pintan de verdad, y se exportan ────────────────── */
  const pintadas = await pg.evaluate(() => {
    const o = {};
    for (const n of [1, 2, 3, 4, 5]) {
      const cv = document.getElementById('gr' + n);
      const c = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const vistos = new Set();
      for (let i = 0; i < c.length; i += 4 * 97) vistos.add(c[i] + ',' + c[i + 1] + ',' + c[i + 2]);
      o['g' + n] = { w: cv.width, h: cv.height, colores: vistos.size };
    }
    return o;
  });
  for (const n of [1, 2, 3, 5]) {
    check(`G${n} pinta contenido (más de un color)`, pintadas['g' + n].colores > 4,
          JSON.stringify(pintadas['g' + n]));
  }
  // G4 sin anual calculado es, a propósito, un aviso: basta con que no esté en blanco
  check('G4 sin anual dice que está sin calcular, y lo dice en ámbar',
        await pg.evaluate(() => /sin calcular/i.test(document.getElementById('grt4').textContent) &&
                                /SIN CALCULAR/.test((window.__GRAF.pies.g4.extra || []).join(' '))));

  const exportadas = await pg.evaluate(async () => {
    const out = {};
    for (const n of [1, 2, 3, 4, 5]) {
      const cv = document.getElementById('gr' + n);
      out['g' + n] = await new Promise(res => cv.toBlob(b => res(b ? b.size : 0)));
    }
    return out;
  });
  for (const n of [1, 2, 3, 4, 5])
    check(`G${n} se exporta a PNG`, exportadas['g' + n] > 2000, 'bytes: ' + exportadas['g' + n]);

  /* ── 3a. caso POSITIVO de la marca ámbar ───────────────────────────────── */
  const llano = Object.assign({}, pend, { tpreset: 'llano', tparam: '0' });
  await configura(llano);
  await informe('global', 'row');
  const uni = await pg.evaluate(() => ({
    ambar: !!window.__GRAF.ambar.g2,
    titulo: document.getElementById('grt2').textContent,
    pie: (window.__GRAF.pies.g2.extra || []).join(' · '),
    // y en la tabla de apoyo: alguna fila tiene que decir que NO se separa
    tablaAmbar: document.querySelectorAll('#grtab .amb').length,
    uniforme: terrainIsUniform(DAY.T),
  }));
  check('el terreno del caso positivo es de verdad uniforme', uni.uniforme === true);
  check('en terreno uniforme, global vs row levanta la marca ámbar', uni.ambar === true,
        'título: ' + uni.titulo);
  check('y dice POR QUÉ no se declara ganador', /NO se declara ganador/.test(uni.pie) &&
        /(no llega a la resoluci[óo]n del modelo|CRUZA EL CERO)/.test(uni.pie), uni.pie.slice(0, 260));
  /* y el control de que la frase no está SIEMPRE: en el caso en pendiente, el
     pie de G2 publica la resolución pero NO dice que no haya ganador */
  check('esa frase NO aparece cuando sí hay ganador', pieG2Pendiente.indexOf('NO se declara ganador') < 0,
        pieG2Pendiente.slice(0, 200));
  check('la tabla de apoyo marca en ámbar las filas que no se separan de la anterior',
        uni.tablaAmbar > 0, 'marcas: ' + uni.tablaAmbar);

  check('la página no ha soltado errores', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${ok} bien · ${ko} mal`);
process.exit(ko ? 1 : 0);
