/* EL INDICADOR «BT ON» DICE BACKTRACKING, NO DERIVA DE LAZO
 *
 * Backtracking es que la política PIDA algo distinto de lo que pediría el
 * seguimiento astronómico. Dónde acabe el eje después del lazo es otra cosa: dos
 * lazos independientes alimentados con el MISMO mando se paran en puntos
 * distintos dentro de la banda muerta, según su historia. El predicado comparaba
 * posiciones y el umbral (0,5°) es la MITAD de la banda muerta (1,0°), así que
 * podía encenderse sin que hubiera backtracking ninguno.
 *
 * Este banco fija el criterio nuevo y, sobre todo, deja una comprobación que
 * SE PONE ROJA si alguien vuelve a comparar posiciones.
 *
 *     node tools/test_indicador_bt.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8951 + (process.pid % 40);
let ok = 0, fail = 0;
const T = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ✓ ' + nombre + (detalle ? '   ' + detalle : '')); }
  else { fail++; console.log('  ✗ ' + nombre + (detalle ? '   ' + detalle : '')); }
};

/* ══ A · SOBRE EL FUENTE ═══════════════════════════════════════════════════ */
console.log('\n── el predicado, en el fuente ──');
const html = readFileSync(path.join(ROOT, 'backtracking.html'), 'utf8');

/* el cuerpo de btActivoSerie, cortado por llaves — no por una ventana de N
   caracteres, que caduca en cuanto la función crece por arriba */
function cuerpo(fuente, firma) {
  const i = fuente.indexOf(firma);
  if (i < 0) return null;
  let j = fuente.indexOf('{', i), n = 0;
  for (let k = j; k < fuente.length; k++) {
    if (fuente[k] === '{') n++;
    else if (fuente[k] === '}') { n--; if (n === 0) return fuente.slice(i, k + 1); }
  }
  return null;
}
const cuerpoBT = cuerpo(html, 'function btActivoSerie(');
/* CONTROL del propio corte: si devolviera vacío o una línea, todo lo de abajo
   pasaría sin mirar nada */
T('el corte de btActivoSerie no está vacío', !!cuerpoBT && cuerpoBT.split('\n').length >= 4,
  cuerpoBT ? cuerpoBT.split('\n').length + ' líneas' : 'NO ENCONTRADA');

T('compara MANDOS: usa .cmd y astroCmd', !!cuerpoBT && /\.cmd\[/.test(cuerpoBT) && /astroCmd/.test(cuerpoBT));
T('NO compara posiciones: ni .ang[ ni astroAng', !!cuerpoBT && !/\.ang\[/.test(cuerpoBT) && !/astroAng/.test(cuerpoBT));
T('el umbral es una constante con nombre, no un número suelto',
  !!cuerpoBT && /BT_UMBRAL_DEG/.test(cuerpoBT) && !/>\s*0\.5/.test(cuerpoBT));

/* una sola definición del periodo de BT: nadie más puede llevar su propia copia */
const copias = (html.match(/astroAng\[t[^\]]*\]/g) || []).length;
T('las horas de BT del informe no llevan su propia copia del predicado',
  /btH=\(key\)=>\{[^}]*btActivoSerie\(/.test(html.replace(/\n/g, '')),
  'referencias sueltas a astroAng[t…]: ' + copias);

/* ══ B · SOBRE LA PÁGINA ═══════════════════════════════════════════════════ */
console.log('\n── el predicado, sobre la página ──');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  pg.on('pageerror', e => console.log('    ERR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => {
    const s = (id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('change')); };
    s('lat','42.32059'); s('lon','-5.59981'); s('tz','2'); s('alt','1563');
    s('pitch','7.00'); s('cw','2.382'); s('maxang','55'); s('nrows','65'); s('axaz','0'); s('z0','0.17');
    const d = document.getElementById('date'); d.value = '2026-06-21'; d.dispatchEvent(new Event('change'));
  });
  await pg.waitForFunction(() => DAY && DAY.pol && DAY.astroCmd, null, { timeout: 180000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 300000 });
  await pg.waitForTimeout(300);

  const m = await pg.evaluate(() => {
    const U = 0.5, nT = DAY.times.length, keys = Object.keys(DAY.pol);
    const dif = (A, B) => { let x = 0; for (let i = 0; i < A.length; i++) x = Math.max(x, Math.abs(A[i] - B[i])); return x; };
    const pred = (campo, ref) => (p, t) => DAY.sun[t].elev > 0 && dif(p[campo][t], DAY[ref][t]) > U;
    const viejo = pred('ang', 'astroAng'), nuevo = pred('cmd', 'astroCmd');

    /* busca instantes donde DOS predicados discrepan; se le pasan los dos para
       poder llamarlo también con el MISMO dos veces (control) */
    const discrepan = (f, g) => { const r = [];
      for (const k of keys) for (let t = 0; t < nT; t++) if (f(DAY.pol[k], t) !== g(DAY.pol[k], t)) r.push({ k, t });
      return r; };

    const diurnos = []; for (let t = 0; t < nT; t++) if (DAY.sun[t].elev > 0) diurnos.push(t);
    const valores = f => { const s = new Set(); for (const k of keys) for (const t of diurnos) s.add(f(DAY.pol[k], t)); return [...s].sort().join('/'); };

    const dis = discrepan(viejo, nuevo);
    /* el peor caso: mando IDÉNTICO en todas las filas, sombra cero, y aun así el
       predicado viejo encendido */
    const falsos = dis.filter(({ k, t }) => viejo(DAY.pol[k], t) && !nuevo(DAY.pol[k], t)
      && dif(DAY.pol[k].cmd[t], DAY.astroCmd[t]) === 0
      && Math.max(...DAY.pol[k].shade[t]) === 0);

    const horas = f => keys.map(k => { let n = 0; for (let t = 0; t < nT; t++) if (f(DAY.pol[k], t)) n++;
      return { k, h: +(n * STEP_MIN / 60).toFixed(2) }; });

    const dA = {}; for (const _ of serieDiaGen('astro', DAY.D, dA));
    let astroM = 0; for (let t = 0; t < nT; t++) astroM = Math.max(astroM, dif(dA.s.cmd[t], DAY.astroCmd[t]));

    const t0 = falsos.length ? falsos[0].t : -1;
    return {
      filas: DAY.astroCmd[0].length, diurnos: diurnos.length, politicas: keys.length,
      valoresViejo: valores(viejo), valoresNuevo: valores(nuevo),
      discrepan: dis.length, falsosPositivos: falsos.length,
      controlMismoPredicado: discrepan(nuevo, nuevo).length,
      ejemplo: t0 < 0 ? null : { hora: hhmm(DAY.times[t0]), elev: +DAY.sun[t0].elev.toFixed(1),
        paginaDice: btActiveAt(t0) },
      horasViejo: horas(viejo), horasNuevo: horas(nuevo),
      astroDifMandoMax: +astroM.toFixed(6),
    };
  });

  /* TEST NULO antes de cualquier recuento */
  T('TEST NULO · el predicado nuevo no es constante en el dominio medido',
    m.valoresNuevo === 'false/true', m.diurnos + ' instantes diurnos · valores ' + m.valoresNuevo);
  T('TEST NULO · el viejo tampoco lo era (si no, no habría nada que comparar)',
    m.valoresViejo === 'false/true', 'valores ' + m.valoresViejo);

  /* CONTROL NEGATIVO del buscador: con el MISMO predicado dos veces no puede
     encontrar ni una discrepancia. Si encontrara alguna, el recuento de abajo
     estaría contando ruido */
  T('CONTROL · el buscador de discrepancias no inventa: mismo predicado ⇒ 0',
    m.controlMismoPredicado === 0, m.controlMismoPredicado + ' discrepancias consigo mismo');

  T('existen falsos positivos del criterio viejo: mando idéntico, sombra 0, y encendido',
    m.falsosPositivos > 0, m.falsosPositivos + ' de ' + m.discrepan + ' discrepancias');
  T('y la página ya NO se enciende en uno de ellos',
    !!m.ejemplo && m.ejemplo.paginaDice === false,
    m.ejemplo ? m.ejemplo.hora + ', sol ' + m.ejemplo.elev + '° → btActiveAt=' + m.ejemplo.paginaDice : 'sin ejemplo');

  const bajan = m.horasNuevo.filter((x, i) => x.h < m.horasViejo[i].h).length;
  T('las horas de BT bajan al dejar de contar deriva de lazo',
    bajan === m.horasNuevo.length,
    m.horasViejo.map((x, i) => x.k + ' ' + x.h + '→' + m.horasNuevo[i].h + ' h').join(' · '));

  /* identidad: astro contra su propia referencia, por la misma maquinaria */
  T('astro contra su propia referencia da 0 EXACTO en mando',
    m.astroDifMandoMax === 0, 'máx |Δmando| = ' + m.astroDifMandoMax + '°');

} finally { await browser.close(); srv.kill(); }

console.log('\n' + ok + ' OK · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
