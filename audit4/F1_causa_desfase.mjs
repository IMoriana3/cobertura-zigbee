/* R4 · FASE 1.1 — POR QUÉ LA MEDIDA DE #710 NO REPRODUCE SOBRE `main`
 *
 * #710 se midió en v1.69.0 (570654f). `main` va por v1.75.0, y entre medias
 * entró #707: `poaPlantSeg.plant` pasó de ser la media SIN PONDERAR de las
 * medias de línea a pesar CADA MESA por su largo en toda la planta. Con líneas
 * de 147,74 a 1.185,51 m eso mueve la métrica por mesa en todos los instantes,
 * también sin torsión — y ahí está la sospecha de por qué el denominador de 29
 * del control `sinTorsion` desapareció.
 *
 * ESO ES UNA HIPÓTESIS, Y AQUÍ SE MIDE. La v1.75 sigue publicando la
 * agregación vieja al lado de la nueva, en `plantLinMedia`, precisamente para
 * un ciclo de transición. Así que la pregunta tiene respuesta directa:
 *
 *   · ¿en cuántos instantes de `sinTorsion` difiere `poaPlant` de `plant`?
 *     (la nueva — se espera 86, que es lo medido)
 *   · ¿y de `plantLinMedia`?  (la vieja — si la hipótesis es cierta, ~29)
 *
 * Si `plantLinMedia` devuelve los 29, la causa queda COMPROBADA y no deducida.
 * Si no los devuelve, la hipótesis es falsa y hay que buscar en otro sitio.
 *
 * TEST NULO delante: las dos agregaciones tienen que diferir entre sí en esta
 * planta. Si `plant` y `plantLinMedia` dieran lo mismo, la comparación de
 * abajo no distinguiría nada y el resultado no informaría.
 *
 *     node audit4/F1_causa_desfase.mjs
 */
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8830 + (process.pid % 41);
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
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 600000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 1800000 });
  await pg.waitForTimeout(400);

  const r = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T), doy = doyOf(c.date);
    /* LA MISMA construcción de geometrías que `audit3/F1_seg_metrica.mjs`:
       la sustitución de tilts se aplica a las DOS, la que puntúa y la que manda */
    const clonar = (B, f) => { if (!B || !B.segTilt) return B;
      const X = Object.assign({}, B);
      X.segTilt = B.segTilt.map((fila, rr) => fila.map((v, kk) => f(v, rr, kk)));
      return X; };
    const par = f => ({ T: clonar(T, f), Tcfg: (Tcfg === T) ? clonar(T, f) : clonar(Tcfg, f) });
    const G = { medida: { T: T, Tcfg: Tcfg }, sinTorsion: par((v, rr) => rowTiltAt(T, rr)), tilt0: par(() => 0) };

    /* los LARGOS de línea, que son lo que la ponderación de la v1.75 mete en
       juego. Sin desigualdad de largos la hipótesis no tendría por dónde. */
    const largos = T.segs.map(l => l.reduce((a, m) => a + Math.abs(m[1] - m[0]), 0));
    const minutos = [];
    for (let m = 0; m < 1440; m += 10) {
      const g = solarPos(localToUTCms(c.date, m, c.tz), c.lat, c.lon);
      if (!(g.elev > 0)) continue;
      const irr = skyWithClouds(clearskyIneichen(g.zen, doy, c.alt, c.tl), cloudCC(), g.zen);
      if (!(irr.dni > 25)) continue;
      minutos.push(m);
    }
    const out = { ver: VER, lineas: T.segs.length,
      largoLinea: { min: +Math.min(...largos).toFixed(2), max: +Math.max(...largos).toFixed(2) },
      instantes: minutos.length, res: {} };
    for (const nom of Object.keys(G)) {
      const TT = G[nom].T, TC = G[nom].Tcfg;
      let difNueva = 0, difVieja = 0, difEntreAgregaciones = 0;
      let mxNueva = 0, mxVieja = 0, mxEntre = 0;
      for (const m of minutos) {
        const g = solarPos(localToUTCms(c.date, m, c.tz), c.lat, c.lon);
        const irr = skyWithClouds(clearskyIneichen(g.zen, doy, c.alt, c.tl), cloudCC(), g.zen);
        /* pairwise, que es barato y basta: la pregunta es sobre la AGREGACIÓN,
           no sobre la política */
        const seg = policyAnglesSeg('pairwise', g.zen, g.az, TC, irr, doy, c.albedo);
        const P = poaPlantSeg(g.zen, g.az, TT, seg, irr, doy, c.albedo);
        const lin = poaPlant(g.zen, g.az, TT, segLineMean(TT, seg), irr, doy, c.albedo).plant;
        const dN = Math.abs(P.plant - lin), dV = Math.abs(P.plantLinMedia - lin), dE = Math.abs(P.plant - P.plantLinMedia);
        if (dN > 1e-9) difNueva++;  mxNueva = Math.max(mxNueva, dN);
        if (dV > 1e-9) difVieja++;  mxVieja = Math.max(mxVieja, dV);
        if (dE > 1e-9) difEntreAgregaciones++; mxEntre = Math.max(mxEntre, dE);
      }
      out.res[nom] = {
        testNulo_lasDosAgregacionesDifieren: difEntreAgregaciones, testNulo_max_Wm2: +mxEntre.toFixed(4),
        difiere_de_poaPlant_conLaNUEVA_v175: difNueva, max_nueva_Wm2: +mxNueva.toFixed(4),
        difiere_de_poaPlant_conLaVIEJA_plantLinMedia: difVieja, max_vieja_Wm2: +mxVieja.toFixed(4),
      };
    }
    return out;
  });
  console.log(JSON.stringify(Object.assign({ commit: sha }, r), null, 1));
} finally { await browser.close(); srv.kill(); }
