/* R3 · 3.2 — LAS TRES AGREGACIONES DE PLANTA, MEDIDAS ANTES DE ELEGIR
 *
 * La planta publica hoy `poaPlantSeg`, que hace DOS pasos:
 *   1 · dentro de cada línea, las mesas se ponderan por su LARGO   (`acc/wt`)
 *   2 · entre líneas, media SIN PONDERAR                            (`sum/n`)
 * El paso 2 es el mismo vicio que el paso 1 arregla: trata igual una línea de
 * 20 m y una de 500 m. Así que «ponderar por mesa» no está hecho a nivel de
 * PLANTA, sólo dentro de cada línea.
 *
 * Este guion mide TRES agregaciones sobre EXACTAMENTE el mismo θ ejecutado y
 * el mismo POA por mesa —lo único que cambia es el peso—:
 *
 *   A · actual      media sin ponderar de las medias de línea  (lo que se publica)
 *   B · por largo   todas las mesas de la planta, peso = largo
 *   C · por módulos todas las mesas de la planta, peso = `md` del levantamiento
 *
 * POR QUÉ ESTÁ C. El encargo dio por hecho que el área «no está en los datos».
 * Medido sobre `ayora_cotas.json`: las 1502 mesas traen `md` —14, 21 o 28—, el
 * 100 %. No es área literal (la ficha del módulo da ancho y no alto), pero el
 * número de módulos es proporcional al área con un solo modelo de módulo, y
 * Ayora tiene uno solo. Así que la tercera opción EXISTE y se mide, en vez de
 * decidir sobre una premisa falsa.
 *
 * Una sola llamada a `poaPlantSeg` por instante da las tres: devuelve `segs`,
 * el POA de cada mesa. Cambiar el peso no vuelve a tocar la física.
 *
 *     node audit3/F32_ponderacion.mjs            (el progreso va por stderr)
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* REANUDABLE y FUERA del repositorio, por lo de siempre: si git cambia de rama
   bajo los pies se lleva el inodo al que escribe el proceso. */
const DIARIO = process.env.F32_DIARIO || '/tmp/claude-0/f32/instantes.jsonl';
fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
const hechosYa = new Map();
if (fs.existsSync(DIARIO)) for (const l of fs.readFileSync(DIARIO, 'utf8').split('\n')) {
  if (!l.trim()) continue;
  try { const o = JSON.parse(l); hechosYa.set(o.pol + '|' + o.min, o); } catch (e) { /* línea a medias */ }
}
if (hechosYa.size) console.error(`reanudando: ${hechosYa.size} instantes ya medidos`);

const PORT = 8991 + (process.pid % 25);
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
  await pg.waitForFunction(() => { const T = terrain(cfg()); return !!(T && T.segs && T.segTilt); }, null, { timeout: 180000 });
  /* LA ESPERA SALE DE UNA MEDIDA, NO DE UNA COSTUMBRE. Copiar los 300 s de una
     sonda anterior fue un error: el día con Ayora real está medido en 393 042 ms
     —6 min 33 s, `main` con el tope del #696— y eso es ANTES de la segunda
     métrica de la v1.74, cuyo coste seguía sin medir. 300 s estaba por debajo de
     un número que ya estaba escrito en el cuaderno.
     Se pone en 900 s y se CRONOMETRA: el día que tarde más, esto lo dice en vez
     de morirse, y de paso la espera mide lo que faltaba por medir. */
  const tEspera = Date.now();
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 900000 });
  const segEspera = (Date.now() - tEspera) / 1000;
  console.error(`el día con Ayora real ha tardado ${segEspera.toFixed(1)} s ` +
    `(medido en main con el tope del #696: 393,0 s; la diferencia es lo que añade la v1.74)`);
  await pg.waitForTimeout(400);

  const prep = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T), doy = doyOf(c.date);
    window.__F32 = { c, T, Tcfg, doy };

    /* DE DONDE SE LEE `md`, Y POR QUE NO DE DONDE PARECE. `plantFromCotas`
       construye `P.segMods` con los modulos del levantamiento —en Ayora las 1502
       mesas del fichero lo traen, el 100 %— pero `terrain()` NO lo copia a `T`:
       el literal de `backtracking.html:4443-4445` pasa segs, segTilt, segPairs,
       segDrive, segZ, segSide y segMorro, y se deja segMods fuera. El dato no se
       pierde: sigue en `T.real`, porque esa misma rama guarda `real:P`. Se lee de
       ahi, con respaldo en `T.segMods` por si algun dia se cablea. */
    window.__MODS = function (T, r, k) {
      var A = (T.segMods && T.segMods[r]) ? T.segMods[r][k] : null;
      if (A != null) return A;
      var B = (T.real && T.real.segMods && T.real.segMods[r]) ? T.real.segMods[r][k] : null;
      return B != null ? B : null;
    };

    /* LOS PESOS, y el test nulo de que no son todos iguales: si el largo fuera
       constante y `md` también, las tres agregaciones coincidirían y ninguna
       cifra de abajo informaría de nada. */
    const MODS = window.__MODS;
    let nMesas = 0, sinMd = 0, largos = [], mds = [], porLinea = [];
    for (let r = 0; r < T.segs.length; r++) {
      let L = 0, M = 0, n = 0;
      for (let k = 0; k < T.segs[r].length; k++) {
        const len = Math.max(1e-6, T.segs[r][k][1] - T.segs[r][k][0]);
        const md = MODS(T, r, k);
        if (md == null) sinMd++;
        largos.push(len); mds.push(md); L += len; M += (md || 0); n++; nMesas++;
      }
      porLinea.push({ mesas: n, largo: L, mods: M });
    }
    const uniq = a => new Set(a.map(x => x == null ? 'null' : (+x).toFixed(4))).size;
    return {
      fecha: c.date, lineas: T.segs.length, mesas: nMesas,
      mesasSinMd: sinMd,
      largosDistintos: uniq(largos), mdsDistintos: uniq(mds),
      largoLineaMin: +Math.min(...porLinea.map(o => o.largo)).toFixed(2),
      largoLineaMax: +Math.max(...porLinea.map(o => o.largo)).toFixed(2),
      mesasPorLineaMin: Math.min(...porLinea.map(o => o.mesas)),
      mesasPorLineaMax: Math.max(...porLinea.map(o => o.mesas)),
      politicas: POLICIES.map(p => p.key),
    };
  });

  console.error(`preparado · ${prep.lineas} líneas · ${prep.mesas} mesas · ${prep.mesasSinMd} sin md · ` +
    `largos distintos ${prep.largosDistintos} · md distintos ${prep.mdsDistintos} · ` +
    `largo de línea ${prep.largoLineaMin}–${prep.largoLineaMax} m · ` +
    `mesas por línea ${prep.mesasPorLineaMin}–${prep.mesasPorLineaMax}`);

  /* TEST NULO, antes de cualquier recuento */
  const nulo = [];
  if (prep.largosDistintos <= 1) nulo.push('todas las mesas miden lo mismo: B ≡ A por construcción');
  if (prep.mesasPorLineaMin === prep.mesasPorLineaMax && prep.largoLineaMin === prep.largoLineaMax)
    nulo.push('todas las líneas pesan lo mismo: la media sin ponderar YA es la ponderada');
  if (prep.mesasSinMd > 0) nulo.push(`${prep.mesasSinMd} mesas sin md: C no se puede calcular entera`);
  if (nulo.length) console.error('TEST NULO — ' + nulo.join(' · '));
  else console.error('TEST NULO — los tres pesos difieren en el dominio medido: las cifras informan');

  const minutos = await pg.evaluate(() => {
    const { c, doy } = window.__F32, out = [];
    for (let m = 0; m < 1440; m += 10) {
      const g = solarPos(localToUTCms(c.date, m, c.tz), c.lat, c.lon);
      if (!(g.elev > 0)) continue;
      const irr = skyWithClouds(clearskyIneichen(g.zen, doy, c.alt, c.tl), cloudCC(), g.zen);
      if (!(irr.dni > 25)) continue;
      out.push(m);
    }
    return out;
  });

  const POLS = prep.politicas;
  const total = POLS.length * minutos.length; let hechos = 0; const t0 = Date.now();
  const filas = [];
  for (const pol of POLS) {
    for (const m of minutos) {
      const ya = hechosYa.get(pol + '|' + m);
      if (ya) { filas.push(ya); hechos++; continue; }
      const f = await pg.evaluate(([pk, mm]) => {
        const { c, T, Tcfg, doy } = window.__F32, MODS = window.__MODS;
        const g = solarPos(localToUTCms(c.date, mm, c.tz), c.lat, c.lon);
        const irr = skyWithClouds(clearskyIneichen(g.zen, doy, c.alt, c.tl), cloudCC(), g.zen);
        const seg = policyAnglesSeg(pk, g.zen, g.az, Tcfg, irr, doy, c.albedo);
        const P = poaPlantSeg(g.zen, g.az, T, seg, irr, doy, c.albedo);
        /* MISMO θ, MISMO POA por mesa: sólo cambia el peso */
        let sL = 0, wL = 0, sM = 0, wM = 0;
        for (let r = 0; r < P.segs.length; r++) for (let k = 0; k < P.segs[r].length; k++) {
          const v = P.segs[r][k];
          const len = Math.max(1e-6, T.segs[r][k][1] - T.segs[r][k][0]);
          const md = MODS(T, r, k);
          sL += v * len; wL += len;
          if (md != null) { sM += v * md; wM += md; }
        }
        return { pol: pk, min: mm, hora: hhmm(mm), elev: +g.elev.toFixed(2),
                 A: P.plant, B: wL > 0 ? sL / wL : 0, C: wM > 0 ? sM / wM : null };
      }, [pol, m]);
      filas.push(f);
      fs.appendFileSync(DIARIO, JSON.stringify(f) + '\n');
      if (++hechos % 20 === 0 || hechos === total) {
        const s = (Date.now() - t0) / 1000;
        console.error(`  ${pol} · ${hechos}/${total} · ${s.toFixed(0)} s · restante ~${(s / hechos * (total - hechos)).toFixed(0)} s`);
      }
    }
  }

  /* recuentos, fuera de la página */
  const sum = a => a.reduce((x, y) => x + y, 0);
  const res = {};
  for (const pol of POLS) {
    const F = filas.filter(f => f.pol === pol);
    const sA = sum(F.map(f => f.A)), sB = sum(F.map(f => f.B)), sC = sum(F.map(f => f.C || 0));
    const rel = (x, y) => y ? +(100 * (x - y) / y).toFixed(4) : null;
    const peor = F.reduce((a, b) => (Math.abs(b.B - b.A) > Math.abs(a.B - a.A) ? b : a));
    res[pol] = {
      instantes: F.length,
      dia_A: +sA.toFixed(4), dia_B: +sB.toFixed(4), dia_C: +sC.toFixed(4),
      'delta_B_vs_A_%': rel(sB, sA),
      'delta_C_vs_B_%': rel(sC, sB),
      'peor_instante_B_vs_A_%': rel(peor.B, peor.A),
      peor_instante: { hora: peor.hora, elev: peor.elev, A: +peor.A.toFixed(3), B: +peor.B.toFixed(3) },
    };
  }
  console.log(JSON.stringify({ commit: sha, fecha: prep.fecha, paso_min: 10,
    coste_dia_s: +segEspera.toFixed(1),
    geometria: { lineas: prep.lineas, mesas: prep.mesas, mesasSinMd: prep.mesasSinMd,
                 largoLinea_m: [prep.largoLineaMin, prep.largoLineaMax],
                 mesasPorLinea: [prep.mesasPorLineaMin, prep.mesasPorLineaMax] },
    testNulo: nulo.length ? nulo : 'los tres pesos difieren', res }, null, 1));
} finally { await browser.close(); srv.kill(); }
