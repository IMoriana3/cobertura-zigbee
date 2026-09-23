/* R4 · FASE 2 — QUÉ CUESTA EL INFORME, ANTES Y DESPUÉS DE DIFERIR LAS CARAS
 *
 * Mide las dos cifras que la fase 2 debe (2.3 y 2.6), sobre la PLANTA CARGADA
 * y no sobre una sintética:
 *
 *   2.3  el coste del informe gráfico con las caras diferidas y sin diferir,
 *        en la misma página y la misma planta, cronometrado dentro del
 *        navegador. La indicación de «sin calcular» no vale nada sin su coste
 *        al lado: si diferir no ahorrase, sería una molestia sin premio.
 *   2.6  el tiempo de GENERAR el terreno con pendiente N-S, que es lo que
 *        #711 señaló como caro. Se mide `terrain(cfg())` a secas, sin informe,
 *        con el tilt N-S a 0 y a 4°, para que se vea si el coste es del
 *        terreno o de lo que se hace con él.
 *
 * TEST NULO delante de 2.3: tiene que haber POLÍTICAS QUE DIFERIR. Si con la
 * configuración cargada no se difiriera ninguna, las dos medidas serían la
 * misma y el número no informaría de nada.
 *
 * LOS TIEMPOS SÓLO VALEN CON LA MÁQUINA LIBRE. Esta sonda imprime la carga del
 * sistema al empezar y al acabar; si no está ociosa, el cuaderno lo dice al
 * lado de la cifra en vez de publicarla a secas.
 *
 *     node audit4/F2_coste_informe.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8770 + (process.pid % 29);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const carga = () => fs.readFileSync('/proc/loadavg', 'utf8').trim().split(' ').slice(0, 3).join(' ');
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const LAT = setInterval(() => console.error(`  ·latido· ${new Date().toISOString().slice(11, 19)} · carga ${carga()}`), 60000);
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('ERR ' + e.message));
  const cargaIni = carga();
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });

  /* ── 2.6 · generar el terreno, con y sin pendiente N-S ──────────────────
     Sin planta real: es el preset, que es donde el barrido de #711 midió. */
  const t26 = await pg.evaluate(() => {
    const r = {};
    for (const tilt of [0, 4]) {
      document.getElementById('axtilt').value = String(tilt);
      document.getElementById('nspreset').value = tilt ? 'quebrado' : 'constante';
      const c = cfg();
      /* una pasada en vacío para que el JIT no cuente como coste del terreno */
      terrain(c);
      const N = 20, t0 = performance.now();
      for (let i = 0; i < N; i++) terrain(cfg());
      r['tilt' + tilt] = +((performance.now() - t0) / N).toFixed(2);
    }
    document.getElementById('axtilt').value = '0';
    document.getElementById('nspreset').value = 'constante';
    return r;
  });
  console.error(`  2.6 · terrain(): tilt 0 → ${t26.tilt0} ms · tilt 4 quebrado → ${t26.tilt4} ms`);

  /* ── 2.6 bis · EL PRIMER DÍA DE LA PLANTA REAL, cronometrado ─────────────
     Es la cifra que el auditor pidió leer en clave de fase 2: sobre `main` el
     apagado automático deja fuera a `optimal` y `optfree` pero NO a `mgl`, la
     más cara de las nueve medidas, así que parte de ese tiempo es `mgl`
     calculándose sin que nadie la haya pedido. La fase 2 la mete en la lista.
     LAS DOS CORRIDAS VAN SEGUIDAS Y EN LA MISMA MÁQUINA, que es la lección del
     error 24: dos medidas separadas por dos días y un contenedor no son
     comparables, y de ahí salió una atribución falsa. */
  /* `--sin-planta` mide 2.3 sobre el PRESET en vez de sobre Ayora. No es un
     atajo: es la medida que CIERRA. Con la planta real y las nueve políticas
     sin diferir, la variante «sin diferir» de 2.3 supera la hora en una
     máquina libre, o sea que ahí el ítem solo puede dar una COTA. Con el
     preset la medida termina y da un número entero. Se corren las dos y se
     publican las dos: la cota con su presupuesto declarado, y el número con
     su geometría declarada. Un número completo de una geometría pequeña y una
     cota de la grande dicen más que una sola cifra a medias. */
  const SIN_PLANTA = process.argv.includes('--sin-planta');
  const tDia0 = Date.now();
  if (!SIN_PLANTA) await pg.evaluate(() => document.getElementById('ayorabtn').click());
  if (!SIN_PLANTA) {
    await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 600000 });
    await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 1800000 });
  }
  const sPrimerDia = (Date.now() - tDia0) / 1000;
  const quienSeCalculo = await pg.evaluate(() => ({
    encendidas: POLICIES.filter(P => P.on).map(P => P.key),
    enElDia: Object.keys(DAY.pol || {}) }));
  console.error(`  2.6bis · primer día de Ayora · ${sPrimerDia.toFixed(1)} s · en el día: ${quienSeCalculo.enElDia.join(', ')}`);
  await pg.waitForTimeout(400);

  /* EL PRESUPUESTO DE 2.3 VA DECLARADO, y es un UMBRAL, no una medida. Si la
     variante sin diferir lo supera, la sonda NO se queda colgada ni inventa
     una cifra: aborta y publica «> presupuesto». Por defecto 45 min. */
  const PRES = +((process.argv.find(a => a.startsWith('--tope23=')) || '--tope23=2700').slice(9)) * 1000;
  const t23 = await Promise.race([
    pg.evaluate(async () => {
    const drena = (gen) => { const t0 = performance.now(); let n = 0;
      for (const _ of gen()) n++; return { ms: +(performance.now() - t0).toFixed(0), pasos: n }; };
    /* TEST NULO: con la configuración cargada, ¿hay algo que diferir? */
    const dif = POLICIES.filter(P => grDiferida(P.key)).map(P => P.key);
    const encendidas = POLICIES.filter(P => P.on).map(P => P.key);
    const out = { testNulo_politicasQueSeDifieren: dif, encendidas: encendidas,
                  A: GR.A, B: GR.B, total: POLICIES.length };
    if (!dif.length) { out.aviso = 'NO se difiere ninguna política: las dos medidas serían la misma y no informan de nada'; return out; }
    GR.ser = {}; GR.kp = {}; GR.sig = null;
    out.conDiferir = drena(grSeriesGen);
    out.conDiferir.calculadas = Object.keys(GR.ser).length;
    /* y ahora SIN diferir: se desarma la puerta en caliente, que es lo que
       había antes de la v1.77 — el informe calculaba las nueve siempre */
    const guarda = window.grDiferida;
    window.grDiferida = () => false;
    GR.ser = {}; GR.kp = {}; GR.sig = null;
    out.sinDiferir = drena(grSeriesGen);
    out.sinDiferir.calculadas = Object.keys(GR.ser).length;
    window.grDiferida = guarda;
    return out;
    }),
    new Promise(r => setTimeout(() => r({ ABORTADA: true, presupuesto_s: PRES / 1000 }), PRES)),
  ]);
  const cargaFin = carga();
  console.log(JSON.stringify({ commit: sha, ver: await pg.evaluate(() => VER),
    carga: { alEmpezar: cargaIni, alAcabar: cargaFin },
    '2.6_terrain_ms': t26,
    '2.6bis_primer_dia_ayora_s': +sPrimerDia.toFixed(1), '2.6bis_quien': quienSeCalculo,
    '2.3_informe': t23 }, null, 1));
} finally { clearInterval(LAT); await browser.close(); srv.kill(); }
