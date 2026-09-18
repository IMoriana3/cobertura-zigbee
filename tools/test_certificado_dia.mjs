/* EL CERTIFICADO NO SE EMITE CON DATOS DE DOS DÍAS, medido en el navegador.
 *
 * EL DEFECTO. `pintaCertificado` difiere el cálculo con `setTimeout`: captura el
 * instante (`g`), la configuración (`c`) y el índice horario ANTES, y leía el
 * terreno (`DAY.T`) DENTRO. Entre las dos lecturas el bucle de eventos corre, y
 * `recompute` recalcula el día POR FRAGMENTOS y al acabar SUSTITUYE `DAY`. Si
 * eso pasa en medio, el certificado sale con el instante y el cielo de un día y
 * el terreno de otro, sin error y sin aviso — y el certificado es el artefacto
 * que se enseña como prueba.
 *
 * LO QUE SE COMPRUEBA, y en este orden, porque el orden es el argumento:
 *
 *   1. CONTROL NEGATIVO PRIMERO. Con el guardián DESARMADO, el caso de prueba
 *      tiene que producir de verdad la mezcla: serie de captura distinta de
 *      serie de lectura, y certificado emitido igualmente. Sin esto, lo de
 *      abajo pasaría aunque el guardián no hiciera absolutamente nada, y una
 *      prueba que no puede fallar no comprueba nada.
 *   2. Con el guardián armado y UN cambio de día en medio: el certificado no
 *      sale mezclado. Reintenta y, si el segundo intento encuentra el día
 *      quieto, emite — con las dos series iguales.
 *   3. Con el día cambiando en CADA intento: no se emite nada, y el panel dice
 *      por qué. Un certificado que no sale es preferible a uno que sale mal.
 *   4. Y la invariante declarada: que sigue escrita donde vive `DAY`, y que los
 *      tres consumidores que dependen de ser síncronos lo siguen siendo.
 *
 *     node tools/test_certificado_dia.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8500 + (process.pid % 400);
let ok = 0, ko = 0;
const check = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { ko++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
};

/* ── 4. la invariante, sobre el fuente ─────────────────────────────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
  const iDay = src.indexOf('let DAY=null;');
  check('la invariante está declarada donde vive DAY', iDay > 0 &&
        /NO CEDE EL CONTROL/.test(src.slice(iDay, iDay + 2600)),
        'no aparece en el comentario de DAY');
  check('y nombra a los cuatro consumidores', ['fillDayTable', 'informeHTML', 'yearbtn', 'pintaCertificado']
        .every(n => src.slice(iDay, iDay + 2600).includes(n)));
  /* Los tres protegidos lo están PORQUE son síncronos. Si alguien los trocea,
     heredan el agujero: esto lo caza. El corte de cada función se hace contando
     llaves, y con su control de que no salió vacío. */
  const cuerpo = (nombre) => {
    const i = src.indexOf(nombre);
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return null;
  };
  for (const [nm, ancla] of [['fillDayTable', 'function fillDayTable()'], ['informeHTML', 'function informeHTML()']]) {
    const f = cuerpo(ancla);
    check(`el corte de ${nm} no sale vacío (control)`, !!f && f.length > 400, f ? f.length + ' car.' : 'null');
    check(`${nm} sigue siendo SÍNCRONA, que es lo que la protege`,
          !!f && !/\bawait\b|setTimeout\(|requestAnimationFrame\(|\byield\b/.test(f),
          'ha dejado de serlo: necesita el mismo guardián que el certificado');
  }
  // y el control por el otro lado: la que SÍ cede tiene que salir como que cede
  const cert = cuerpo('function pintaCertificado(');
  check('pintaCertificado SÍ cede el control (control del criterio)',
        !!cert && /setTimeout\(/.test(cert));
}

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
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => {
    const s = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
    s('lat', '41.57634'); s('lon', '-0.79814'); s('nrows', '6'); s('drive', 'mono');
    s('nspreset', 'constante'); s('axtilt', '0');
    document.getElementById('date').value = '2026-06-21'; document.getElementById('date').dispatchEvent(new Event('change'));
    document.getElementById('tpreset').value = 'pendiente'; document.getElementById('tpreset').dispatchEvent(new Event('change'));
    document.getElementById('tparam').value = '8'; document.getElementById('tapply').click();
    const h = document.getElementById('hour'); h.value = String(10 * 60); h.dispatchEvent(new Event('input'));
  });
  await pg.waitForFunction(() => DAY && DAY.pol, null, { timeout: 120000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; },
                           null, { timeout: 180000 });
  await pg.waitForTimeout(400);

  /* El caso de prueba: pulsar certificar y, en el MISMO turno, sustituir el día.
     `computeDay()` es síncrono, así que al volver del evaluate el día ya es otro
     y el `setTimeout` del certificado aún no ha corrido. Es exactamente la
     carrera que se quiere reproducir, y se reproduce a mano en vez de esperar a
     que ocurra sola. `veces` dice cuántos intentos se sabotean. */
  const carrera = async (veces, sinGuarda) => pg.evaluate(async ({ veces, sinGuarda }) => {
    CERT_SIN_GUARDA = !!sinGuarda;
    CERT_ULT = null;
    const p = document.getElementById('certpanel'); if (p) p.remove();
    let sabotajes = 0;
    // se sabotea en cada turno de macrotarea hasta agotar `veces`
    const sabotea = () => { if (sabotajes < veces) { sabotajes++; computeDay(); setTimeout(sabotea, 0); } };
    pintaCertificado(0);
    sabotea();
    for (let i = 0; i < 400 && (!CERT_ULT || CERT_ULT.motivo === 'dia-cambiado-reintento'); i++)
      await new Promise(r => setTimeout(r, 25));
    const panel = document.getElementById('certpanel');
    const out = { ...(CERT_ULT || {}), sabotajes, panel: panel ? panel.textContent.slice(0, 220) : '' };
    CERT_SIN_GUARDA = false;
    return out;
  }, { veces, sinGuarda });

  /* ── 1. CONTROL NEGATIVO: sin guardián, el caso SÍ mezcla ───────────────── */
  const sin = await carrera(1, true);
  check('CONTROL: con el guardián desarmado el caso de prueba SÍ produce la mezcla',
        sin.emitido === true && sin.mezclado === true && sin.serieCaptura !== sin.serieLectura,
        JSON.stringify(sin).slice(0, 220));

  /* ── 2. con guardián y UN cambio: reintenta y emite sin mezclar ──────────── */
  const uno = await carrera(1, false);
  check('con el guardián, un cambio de día en medio NO produce un certificado mezclado',
        uno.mezclado !== true, JSON.stringify(uno).slice(0, 220));
  check('y si el reintento encuentra el día quieto, se emite con las dos series iguales',
        uno.emitido === true && uno.serieCaptura === uno.serieLectura && uno.intento >= 1,
        JSON.stringify(uno).slice(0, 220));

  /* ── 3. cambiando en cada intento: no se emite y se dice por qué ─────────── */
  const siempre = await carrera(6, false);
  check('si el día cambia en cada intento, NO se emite certificado',
        siempre.emitido === false, JSON.stringify(siempre).slice(0, 220));
  check('y el panel dice por qué, sin fingir un resultado',
        /NO SE EMITE/.test(siempre.panel) && /d[ií]as distintos/.test(siempre.panel),
        siempre.panel.slice(0, 200));

  /* ── y sin carrera, el certificado normal sigue saliendo ─────────────────── */
  const limpio = await carrera(0, false);
  check('sin carrera, el certificado se emite con normalidad',
        limpio.emitido === true && limpio.intento === 0 && limpio.serieCaptura === limpio.serieLectura,
        JSON.stringify(limpio).slice(0, 220));
  check('y trae su veredicto', !!limpio.veredicto, JSON.stringify(limpio).slice(0, 160));

  check('la página no ha soltado errores', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${ok} bien · ${ko} mal`);
process.exit(ko ? 1 : 0);
