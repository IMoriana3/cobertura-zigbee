/* R3 · FASE 1 — LA MÉTRICA POR LÍNEA Y LA MÉTRICA POR MESA, ANTES DE ARREGLAR NADA
 *
 * `policyAnglesSeg` sólo tiene política POR MESA para `astro` y `pairwise`; todas
 * las demás reparten el ángulo de LÍNEA a todas las mesas:
 *
 *     return segsBroadcast(T,policyAngles(key,zen,az,T,irr,doy,albedo).angles);
 *
 * Así que `optimal` busca su máximo con `poaPlant` —por línea— y después se le
 * puntúa con `poaPlantSeg` —por mesa—. Este guion mide qué hace eso, ANTES de
 * tocar el código: un defecto arreglado ya no se puede medir.
 *
 * Qué imprime:
 *   1.1  por instante: θ de optimal y de pairwise, y su POA con LAS DOS métricas;
 *        recuento de instantes donde el ORDEN entre las dos políticas se invierte
 *        al cambiar de métrica
 *   1.2  TEST NULO: en ese subconjunto las dos métricas tienen que DIFERIR. Si
 *        coincidieran, el recuento no informa de nada
 *   1.3  CONTROL: lo mismo sin torsión (cada mesa al tilt de su línea) y con
 *        tilt 0. Si sin torsión se cumple optimal ≥ pairwise y en Ayora no, la
 *        causa queda acotada al reparto por línea con torsión
 *
 *     node audit3/F1_seg_metrica.mjs
 */
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8971 + (process.pid % 25);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.log('ERR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => document.getElementById('ayorabtn').click());      // cotas reales, con torsión medida
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 180000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 300000 });
  await pg.waitForTimeout(400);

  const r = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T), doy = doyOf(c.date);

    /* las tres geometrías: la medida, la misma sin TORSIÓN (cada mesa al tilt de
       su línea) y la misma con tilt 0. Sólo cambia segTilt: todo lo demás —cotas,
       solapes, parejas— se conserva, para que el control aísle una cosa sola. */
    const clonar = (f) => { const X = Object.assign({}, T);
      X.segTilt = T.segTilt.map((fila, rr) => fila.map((v, kk) => f(v, rr, kk)));
      return X; };
    const G = { medida: T,
                sinTorsion: clonar((v, rr) => rowTiltAt(T, rr)),
                tilt0:      clonar(() => 0) };

    /* cuánta torsión hay, para que el control no sea una comprobación vacía */
    let torMax = 0, torN = 0, nMesas = 0;
    for (let rr = 0; rr < T.segTilt.length; rr++) {
      const fila = T.segTilt[rr]; nMesas += fila.length;
      for (const v of fila) { const d = Math.abs(v - rowTiltAt(T, rr));
        if (d > 1e-9) torN++; torMax = Math.max(torMax, d); }
    }

    const res = {};
    for (const [nombre, TT] of Object.entries(G)) {
      const filas = [];
      for (let m = 0; m < 1440; m += 10) {
        const g = solarPos(localToUTCms(c.date, m, c.tz), c.lat, c.lon);
        if (!(g.elev > 0)) continue;
        const irr = skyWithClouds(clearskyIneichen(g.zen, doy, c.alt, c.tl), cloudCC(), g.zen);
        if (!(irr.dni > 25)) continue;
        const o = {};
        for (const k of ['optimal', 'pairwise']) {
          const lin = policyAngles(k, g.zen, g.az, Tcfg, irr, doy, c.albedo).angles;
          const seg = policyAnglesSeg(k, g.zen, g.az, Tcfg, irr, doy, c.albedo);
          o[k] = { linea: poaPlant(g.zen, g.az, TT, lin, irr, doy, c.albedo).plant,
                   mesa:  poaPlantSeg(g.zen, g.az, TT, seg, irr, doy, c.albedo).plant,
                   th: +lin[0].toFixed(4) };
        }
        filas.push({ min: m, hora: hhmm(m),
          dLinea: o.optimal.linea - o.pairwise.linea,     // >0 ⇒ optimal gana por línea
          dMesa:  o.optimal.mesa  - o.pairwise.mesa,      // >0 ⇒ optimal gana por mesa
          pwMesa: o.pairwise.mesa,                        // el DENOMINADOR de los %
          pwLinea: o.pairwise.linea,
          difMetrica: Math.abs(o.optimal.linea - o.optimal.mesa) });
      }
      const inv = filas.filter(f => Math.sign(f.dLinea) !== Math.sign(f.dMesa));
      const optPierdePorMesa = filas.filter(f => f.dMesa < 0);
      const sum = a => a.reduce((s, x) => s + x, 0);
      res[nombre] = {
        instantes: filas.length,
        /* TEST NULO: si las dos métricas coincidieran, el recuento no diría nada */
        testNulo_metricasDifieren: filas.filter(f => f.difMetrica > 1e-9).length,
        testNulo_difMetricaMax: +Math.max(...filas.map(f => f.difMetrica)).toFixed(4),
        inversionesDeOrden: inv.length,
        optimal_pierde_por_mesa: optPierdePorMesa.length,
        /* el % lleva su denominador: la POA del día de `pairwise` con la MISMA
           métrica con la que se resta, integrada sobre los mismos instantes */
        delta_dia_porMesa_pct:  +(100 * sum(filas.map(f => f.dMesa))  / sum(filas.map(f => f.pwMesa))).toFixed(4),
        delta_dia_porLinea_pct: +(100 * sum(filas.map(f => f.dLinea)) / sum(filas.map(f => f.pwLinea))).toFixed(4),
        denominador_poa_pairwise_porMesa: +sum(filas.map(f => f.pwMesa)).toFixed(1),
        peor: inv.length ? inv.reduce((a, b) => (b.dMesa < a.dMesa ? b : a)) : null,
      };
    }
    return { fecha: c.date, lat: c.lat, lon: c.lon, filas: T.segs.length, mesas: nMesas,
             torsion: { mesasConTorsion: torN, torsionMax_deg: +torMax.toFixed(4) },
             res: res };
  });
  r.commit = sha;
  console.log(JSON.stringify(r, null, 1));
} finally { await browser.close(); srv.kill(); }
