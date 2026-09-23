/* R4 · P1.3 — EL HUECO ENTRE LA RUTA ANUAL POR LÍNEA Y LA RAMA POR MESA, EN AYORA.
 *
 *   node audit4/D_anual_ayora.mjs [--pols=pairwise,astro,optimal,optfree] [--tope=SEG] [--json=RUTA]
 *
 * `D_anual_por_mesa.mjs` (rama r4-d-anual-por-mesa) lo midió sobre una geometría
 * SINTÉTICA y dejó Ayora como NO MEDIDO. Aquí, Ayora: la banda que carga la
 * página (`plantFromCotas(data, 80, bloque)`, `backtracking.html:4810`) armada
 * como `terrain(c)`, con la TCU al corriente del levantamiento (Tcfg === T).
 *
 * El bucle es el de `yearbtn` (`:7621-7634`): días 21 de cada mes, paso 10 min,
 * un lazo por política y por día, peso DIM/1000. Las DOS cadenas corren en la
 * MISMA pasada sobre los MISMOS instantes:
 *   línea: policyAngles → crearLazo → poaPlant       (lo que publica el anual)
 *   mesa:  policyAnglesSeg → crearLazoSeg → poaPlantSeg (lo que publica el día)
 * Y se CRONOMETRA cada cadena por separado: es el coste de la opción (c).
 *
 * PRESUPUESTO (A5/A6): `--tope` segundos por política. Si se agota, se publica
 * lo que cupo —meses completos— con la cota y el presupuesto, y la política
 * queda marcada como INCOMPLETA. Nada se extrapola.
 *
 * Huso: UTC+1 fijo, como D_anual_por_mesa. No sesga la comparación (las dos
 * cadenas ven los mismos instantes); sí desplaza el anual absoluto respecto a
 * la página si ésta usa otro, y se dice.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_publicado.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const POL_POR_MESA = { pairwise: 1, astro: 1, optimal: 1, optfree: 1 };     // backtracking.html:5408
const POLS = arg('pols', 'pairwise,astro,optimal,optfree').split(',');
for (const k of POLS) if (!POL_POR_MESA[k]) throw new Error(`${k} no manda por mesa (POL_POR_MESA, :5408)`);
const TOPE = +arg('tope', '3600');

const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { F, VER } = cargaSimulador(ROOT, ['poaPlant', 'poaPlantSeg', 'crearLazo', 'crearLazoSeg', 'segLineMean', 'segTiltAt']);
const { P, T } = terrenoComoLaPagina(F, datos, 80, 0);
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, ALB = 0.2, TZ = 1, PASO = 10;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

console.log(`R4 · P1.3 · ANUAL POR LÍNEA vs POR MESA EN AYORA (${VER})`);
console.log(`  banda de la página: ${T.pairs.length + 1} líneas · ${T.segs.reduce((s, l) => s + l.length, 0)} mesas · paso ${PASO} min · días 21 · UTC+${TZ}`);
console.log(`  máquina: ${os.cpus().length} CPU · carga al empezar ${os.loadavg().map(v => v.toFixed(2)).join(' / ')} · tope ${TOPE} s por política`);

/* TEST NULO: segmentación activa y torsión por mesa real, o las dos ramas coinciden por construcción */
let tor = 0; for (let r = 0; r < T.segTilt.length; r++) for (const v of T.segTilt[r]) tor = Math.max(tor, Math.abs(v - T.rowTilt[r]));
console.log(`  TEST NULO · segTilt presente: ${!!T.segTilt} · torsión máx de una mesa respecto a su línea: ${tor.toFixed(4)}°`);
if (!T.segTilt || !(tor > 1e-9)) throw new Error('sin mesas con tilt propio las dos ramas coinciden: la medida no informa');

const RES = {};
for (const k of POLS) {
  const r = RES[k] = { meses: [], lin: 0, mesa: 0, dthMax: 0, sLin: 0, sMesa: 0, pasos: 0, completa: true };
  const t0 = Date.now();
  for (let mo = 0; mo < 12; mo++) {
    if ((Date.now() - t0) / 1000 > TOPE) { r.completa = false; break; }
    const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = F.doyOf(ds);
    const dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
    const LZ = F.crearLazo(), LZS = F.crearLazoSeg();
    let eL = 0, eM = 0;
    for (let m = 0; m < 1440; m += PASO) {
      const g = F.solarPos(dia + m * 60000, LAT, LON);
      if (g.elev <= 0) continue;
      const irr = F.clearskyIneichen(g.zen, doy, ALT, TL), w = (PASO / 60) / 1000 * DIM[mo];
      let a = Date.now();
      const limL = LZ.paso(F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles, PASO * 60);
      eL += F.poaPlant(g.zen, g.az, T, limL, irr, doy, ALB).plant * w;
      r.sLin += (Date.now() - a) / 1000; a = Date.now();
      const limS = LZS.paso(F.policyAnglesSeg(k, g.zen, g.az, T, irr, doy, ALB), PASO * 60);
      eM += F.poaPlantSeg(g.zen, g.az, T, limS, irr, doy, ALB).plant * w;
      r.sMesa += (Date.now() - a) / 1000;
      const mL = F.segLineMean(T, limS);
      for (let i = 0; i < limL.length; i++) r.dthMax = Math.max(r.dthMax, Math.abs(limL[i] - mL[i]));
      r.pasos++;
    }
    r.meses.push({ mes: mo + 1, lin: eL, mesa: eM }); r.lin += eL; r.mesa += eM;
    /* PUNTO DE CONTROL: cada mes cerrado se escribe ya. Un reinicio del contenedor
       mató la primera corrida en el mes 5 y se llevó lo corrido; esto no se repite. */
    const dest0 = arg('json', '');
    if (dest0) fs.writeFileSync(path.join(ROOT, dest0), JSON.stringify({ ver: VER, parcial: true, paso_min: PASO, tope_s: TOPE, resultados: RES }, null, 1));
    console.error(`  ${k} · mes ${mo + 1} · ${((Date.now() - t0) / 1000).toFixed(0)} s · línea ${eL.toFixed(4)} · mesa ${eM.toFixed(4)}`);
  }
}
console.log(`\n  política   meses  POR LÍNEA (publicado)  POR MESA        Δ %      |Δθ| máx   s línea   s mesa   mesa/línea`);
for (const k of POLS) {
  const r = RES[k], d = 100 * (r.mesa / r.lin - 1);
  console.log(`  ${k.padEnd(9)} ${String(r.meses.length).padStart(3)}/12 ${r.lin.toFixed(4).padStart(18)} ${r.mesa.toFixed(4).padStart(12)} ${d.toFixed(4).padStart(9)} % ${r.dthMax.toFixed(4).padStart(9)}° ${r.sLin.toFixed(0).padStart(8)} ${r.sMesa.toFixed(0).padStart(8)} ${(r.sMesa / r.sLin).toFixed(2).padStart(8)}×` +
    (r.completa ? '' : `   INCOMPLETA: tope de ${TOPE} s agotado — es una COTA, no el anual`));
}
console.log(`  carga al acabar ${os.loadavg().map(v => v.toFixed(2)).join(' / ')}`);
const dest = arg('json', '');
if (dest) { fs.writeFileSync(path.join(ROOT, dest), JSON.stringify({ ver: VER, banda: { lineas: T.pairs.length + 1 }, paso_min: PASO, tope_s: TOPE,
  cpus: os.cpus().length, resultados: RES }, null, 1)); console.log(`JSON en ${dest}`); }
