/* R4 · FASE 1.1 (re-baselinado) — ¿ES #707 LA CAUSA DE QUE LA PUERTA NO REPRODUZCA?
 *
 * Misma sonda que `audit3/F1_seg_metrica.mjs`, con UN añadido: por instante se
 * apunta también la POA de planta con la agregación VIEJA —`plantLinMedia`,
 * media sin ponderar de las medias de línea—, que la v1.75 sigue publicando al
 * lado de la nueva para exactamente este tipo de pregunta. `poaPlantSeg` ya
 * devuelve las dos, así que no cuesta una evaluación más: cuesta leer otro
 * campo del mismo objeto.
 *
 * CRITERIO, fijado por el auditor ANTES de mirar: si con la agregación vieja
 * reaparecen los **58 de 86** de `medida` y los **29** informativos de
 * `sinTorsion`, la causa (#707, la ponderación por largo de mesa) queda
 * COMPROBADA y la puerta 1.1 se re-baselina. Si no reaparecen, hay algo más y
 * la fase 1 para entera.
 *
 * TEST NULO delante: las dos agregaciones tienen que diferir entre sí en esta
 * planta. Si dieran lo mismo, la comparación no distinguiría nada.
 *
 * La espera a que la pagina cierre su primer calculo del dia va a 1.800 s y no
 * a los 300 s del original: con la maquina compartida —el banco de fisica al
 * 100 % de un nucleo— hasta `main` tarda mas de 300 s en cerrarlo, y la sonda
 * murio ahi la primera vez. Es un PLAZO, no una medida: no entra en ninguna
 * cifra que esta sonda publique.
 *
 *     node audit4/F1_causa_reagregacion.mjs
 */
/* R3 · FASE 1 — LA MÉTRICA POR LÍNEA Y LA MÉTRICA POR MESA, ANTES DE ARREGLAR NADA
 *
 * `policyAnglesSeg` sólo tiene política POR MESA para `astro` y `pairwise`; todas
 * las demás reparten el ángulo de LÍNEA a todas las mesas:
 *
 *     return segsBroadcast(T,policyAngles(key,zen,az,T,irr,doy,albedo).angles);
 *
 * Así que `optimal` busca su máximo con `poaPlant` —por línea— y después se le
 * puntúa con `poaPlantSeg` —por mesa—. Este guion mide qué hace eso ANTES de
 * tocar el código: un defecto arreglado ya no se puede medir.
 *
 * Qué imprime:
 *   1.1  por instante, θ de `optimal` y de `pairwise` evaluados con LAS DOS
 *        métricas, y el recuento de instantes donde el ORDEN entre las dos
 *        políticas se invierte al cambiar de métrica
 *   1.2  TEST NULO: en el dominio medido las dos métricas tienen que DIFERIR. Si
 *        coincidieran, el recuento no informaría de nada y habría que decirlo
 *        antes que la cifra
 *   1.3  CONTROL: lo mismo sin torsión (cada mesa al tilt de SU línea) y con
 *        tilt 0. La sustitución se aplica a las DOS geometrías —la que puntúa y
 *        la que manda—, porque `anglesPairwiseSeg` decide el θ de cada mesa con
 *        la segunda
 *
 * UN INSTANTE POR LLAMADA, no un `evaluate` gigante. E-D8 estuvo 13 h sin decir
 * por dónde iba porque su anual era un único `evaluate` síncrono que bloquea la
 * página entera; la nota para R3 dejó escrito que eso no se repite. Así se ve
 * avanzar, se puede parar en cuanto la respuesta esté clara y el coste restante
 * se estima con una medida en vez de con una extrapolación.
 *
 *     node audit3/F1_seg_metrica.mjs            (el progreso va por stderr)
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* REANUDABLE. Cada instante se escribe a disco en cuanto sale, y al arrancar se
   leen los que ya estén. E-D8 perdió 13 h 48 min de máquina por no ser
   reanudable, y esta misma sonda perdió 80 instantes en un reinicio del
   contenedor. El diario va FUERA del repositorio: si git cambia de rama bajo los
   pies, se lleva el inodo al que estaba escribiendo el proceso — también medido
   hoy, con el fichero marcado `(deleted)` en /proc. */
const DIARIO = process.env.F1_DIARIO || '/tmp/claude-0/f1reag/instantes.jsonl';
fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
const hechosYa = new Map();
if (fs.existsSync(DIARIO)) for (const l of fs.readFileSync(DIARIO, 'utf8').split('\n')) {
  if (!l.trim()) continue;
  try { const o = JSON.parse(l); hechosYa.set(o.geom + '|' + o.min, o); }
  catch (e) { /* última línea a medio escribir: se descarta y se recalcula */ }
}
if (hechosYa.size) console.error(`reanudando: ${hechosYa.size} instantes ya medidos en ${DIARIO}`);
const PORT = 8971 + (process.pid % 25);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('ERR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => document.getElementById('ayorabtn').click());   // cotas reales, torsión medida
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 180000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 1800000 });
  await pg.waitForTimeout(400);

  /* ── preparación, una sola vez ────────────────────────────────────────── */
  const prep = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T), doy = doyOf(c.date);

    /* la sustitución de tilts se aplica a LAS DOS geometrías: la que puntúa (T)
       y la que la TCU cree (Tcfg). Cambiar sólo la de puntuar daría los mismos
       ángulos con distinta nota, que no es «una planta sin torsión». */
    const clonar = (B, f) => { if (!B || !B.segTilt) return B;
      const X = Object.assign({}, B);
      X.segTilt = B.segTilt.map((fila, rr) => fila.map((v, kk) => f(v, rr, kk)));
      return X; };
    const par = f => ({ T: clonar(T, f), Tcfg: (Tcfg === T) ? clonar(T, f) : clonar(Tcfg, f) });

    window.__F1 = { c: c, doy: doy, G: {
      medida:     { T: T, Tcfg: Tcfg },
      sinTorsion: par((v, rr) => rowTiltAt(T, rr)),
      tilt0:      par(() => 0) } };

    /* cuánta torsión hay: sin esto el control podría estar comparando una planta
       consigo misma y «pasar» sin medir nada */
    let torMax = 0, torN = 0, nMesas = 0;
    for (let rr = 0; rr < T.segTilt.length; rr++) {
      const fila = T.segTilt[rr]; nMesas += fila.length;
      for (const v of fila) { const d = Math.abs(v - rowTiltAt(T, rr));
        if (d > 1e-9) torN++; torMax = Math.max(torMax, d); }
    }

    const minutos = [];
    for (let m = 0; m < 1440; m += 10) {
      const g = solarPos(localToUTCms(c.date, m, c.tz), c.lat, c.lon);
      if (!(g.elev > 0)) continue;
      const irr = skyWithClouds(clearskyIneichen(g.zen, doy, c.alt, c.tl), cloudCC(), g.zen);
      if (!(irr.dni > 25)) continue;            // sin haz directo no hay nada que sombrear
      minutos.push(m);
    }
    return { fecha: c.date, lat: c.lat, lon: c.lon, lineas: T.segs.length, mesas: nMesas,
             torsion: { mesasConTorsion: torN, torsionMax_deg: +torMax.toFixed(4) },
             geometrias: Object.keys(window.__F1.G), minutos: minutos };
  });

  console.error(`preparado · ${prep.lineas} líneas · ${prep.mesas} mesas · torsión en ` +
    `${prep.torsion.mesasConTorsion} mesas, máx ${prep.torsion.torsionMax_deg}° · ` +
    `${prep.minutos.length} instantes × ${prep.geometrias.length} geometrías`);
  if (prep.torsion.mesasConTorsion === 0)
    console.error('AVISO · sin torsión medida: el control no distingue nada y el resultado no informa');

  /* ── un instante por llamada ──────────────────────────────────────────── */
  const porGeom = {}; const t0 = Date.now();
  let hechos = 0; const total = prep.minutos.length * prep.geometrias.length;
  for (const nombre of prep.geometrias) {
    porGeom[nombre] = [];
    for (const m of prep.minutos) {
      const yaEsta = hechosYa.get(nombre + '|' + m);
      if (yaEsta) { porGeom[nombre].push(yaEsta); hechos++; continue; }
      porGeom[nombre].push(await pg.evaluate(([nom, mm]) => {
        const S = window.__F1, c = S.c, GG = S.G[nom], TT = GG.T, TC = GG.Tcfg;
        const g = solarPos(localToUTCms(c.date, mm, c.tz), c.lat, c.lon);
        const irr = skyWithClouds(clearskyIneichen(g.zen, S.doy, c.alt, c.tl), cloudCC(), g.zen);
        const o = {};
        for (const k of ['optimal', 'pairwise']) {
          const lin = policyAngles(k, g.zen, g.az, TC, irr, S.doy, c.albedo).angles;
          const seg = policyAnglesSeg(k, g.zen, g.az, TC, irr, S.doy, c.albedo);
          const P = poaPlantSeg(g.zen, g.az, TT, seg, irr, S.doy, c.albedo);
          o[k] = { linea: poaPlant(g.zen, g.az, TT, lin, irr, S.doy, c.albedo).plant,
                   mesa:  P.plant,                 // B · v1.75, cada mesa por su largo
                   mesaVieja: P.plantLinMedia };   // A · la de antes de #707
        }
        return { min: mm, hora: hhmm(mm),
                 dLinea: o.optimal.linea - o.pairwise.linea,   // >0 ⇒ optimal gana por línea
                 dMesa:  o.optimal.mesa  - o.pairwise.mesa,    // >0 ⇒ optimal gana por mesa
                 dMesaVieja: o.optimal.mesaVieja - o.pairwise.mesaVieja,
                 pwMesa: o.pairwise.mesa, pwLinea: o.pairwise.linea,
                 pwMesaVieja: o.pairwise.mesaVieja,            // los DENOMINADORES
                 difMetrica: Math.abs(o.optimal.linea - o.optimal.mesa),
                 difMetricaVieja: Math.abs(o.optimal.linea - o.optimal.mesaVieja),
                 difEntreAgregaciones: Math.abs(o.optimal.mesa - o.optimal.mesaVieja) };
      }, [nombre, m]));
      /* a disco AHORA, no al final: un reinicio no puede llevarse lo ya medido */
      fs.appendFileSync(DIARIO, JSON.stringify(Object.assign({ geom: nombre },
        porGeom[nombre][porGeom[nombre].length - 1])) + '\n');
      if (++hechos % 10 === 0 || hechos === total) {
        const s = (Date.now() - t0) / 1000;
        console.error(`  ${nombre} · ${hechos}/${total} · ${s.toFixed(0)} s · restante ~${(s / hechos * (total - hechos)).toFixed(0)} s`);
      }
    }
  }

  /* ── recuentos, ya fuera de la página ─────────────────────────────────── */
  const sum = a => a.reduce((x, y) => x + y, 0);
  const res = {};
  for (const [nombre, filas] of Object.entries(porGeom)) {
    const inv = filas.filter(f => Math.sign(f.dLinea) !== Math.sign(f.dMesa));
    const invV = filas.filter(f => Math.sign(f.dLinea) !== Math.sign(f.dMesaVieja));
    res[nombre] = {
      instantes: filas.length,
      /* EL TEST NULO DE ESTA SONDA: las dos AGREGACIONES tienen que diferir
         entre sí, o la comparación de abajo no distingue nada */
      testNulo_lasDosAgregacionesDifieren: filas.filter(f => f.difEntreAgregaciones > 1e-9).length,
      testNulo_difEntreAgregacionesMax_Wm2: +Math.max(...filas.map(f => f.difEntreAgregaciones)).toFixed(4),
      /* ── con la agregación VIEJA (A, la de antes de #707) ── */
      VIEJA_testNulo_instantesDondeLasMetricasDifieren: filas.filter(f => f.difMetricaVieja > 1e-9).length,
      VIEJA_testNulo_difMetricaMax_Wm2: +Math.max(...filas.map(f => f.difMetricaVieja)).toFixed(4),
      VIEJA_inversionesDeOrden: invV.length,
      VIEJA_optimal_pierde_por_mesa: filas.filter(f => f.dMesaVieja < 0).length,
      VIEJA_delta_dia_porMesa_pct: +(100 * sum(filas.map(f => f.dMesaVieja)) / sum(filas.map(f => f.pwMesaVieja))).toFixed(4),
      /* ── con la agregación NUEVA (B, la de la v1.75) ── */
      /* el test nulo va PRIMERO: si las dos métricas coincidieran, nada de lo de
         abajo informaría de nada */
      testNulo_instantesDondeLasMetricasDifieren: filas.filter(f => f.difMetrica > 1e-9).length,
      testNulo_difMetricaMax_Wm2: +Math.max(...filas.map(f => f.difMetrica)).toFixed(4),
      inversionesDeOrden: inv.length,
      optimal_pierde_por_mesa: filas.filter(f => f.dMesa < 0).length,
      optimal_pierde_por_linea: filas.filter(f => f.dLinea < 0).length,
      delta_dia_porMesa_pct:  +(100 * sum(filas.map(f => f.dMesa))  / sum(filas.map(f => f.pwMesa))).toFixed(4),
      delta_dia_porLinea_pct: +(100 * sum(filas.map(f => f.dLinea)) / sum(filas.map(f => f.pwLinea))).toFixed(4),
      denominador_poaDia_pairwise_porMesa: +sum(filas.map(f => f.pwMesa)).toFixed(1),
      peor: inv.length ? inv.reduce((a, b) => (b.dMesa < a.dMesa ? b : a)) : null,
    };
  }
  console.log(JSON.stringify({ commit: sha, fecha: prep.fecha, lat: prep.lat, lon: prep.lon,
    lineas: prep.lineas, mesas: prep.mesas, torsion: prep.torsion, paso_min: 10, res: res }, null, 1));
} finally { await browser.close(); srv.kill(); }
