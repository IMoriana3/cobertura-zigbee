/* PASO 3 REFORMULADO · ¿el criterio con el que DECIDE cada política gobierna lo
 * que se COBRA? Una política, un día.
 *
 *   node audit5/P3r_criterio.mjs <pol> <mes 6|12> [--json=RUTA]
 *
 * La serie del día TAL CUAL la ejecuta la página (`segCmd` cortado de la página
 * → lazo por mesa → tope → ángulo ejecutado; Ayora, banda de la página, cielo
 * claro, cada 5 min), y su energía descompuesta por mesa como la suma
 * `poaPlantSeg`: v = beam·(1−se) + circ·(1−fo) + sky + gnd.
 *
 * DETALLE POR MESA·INSTANTE (apunte del titular): el total no distingue si una
 * política pierde por SOMBRA, por AOI o porque `optimal` ACEPTA sombra a
 * propósito. Se guarda, para cada mesa e instante, su aportación al día en
 * kWh/m² (ponderada por largo y paso): [neta, sin sombra, pérdida por sombra],
 * en audit5/out/P3r_mesa_<pol>_<mes>.bin (Float64). El careo contra `optimal`
 * lo hace audit5/P3r_careo.mjs.
 * CONTROL: la suma de los términos reproduce `poaPlantSeg` en cada instante.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { rutasAnuales } from './lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [key, mesS] = process.argv.slice(2), mo = (+mesS) - 1;
const OUT = path.join(ROOT, 'audit5', 'out');
const dest = path.resolve(ROOT, (process.argv.find(a => a.startsWith('--json=')) || '').slice(7) || `audit5/out/P3r_criterio_${key}_${mo + 1}.json`);
const h = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const E = cargaSimulador(ROOT, ['crearLazoSeg', 'topeBacktrackingSeg', 'poaPlantSeg', 'shadeRows', 'poaRow', 'segTiltAt', 'elecLoss'], () => h).F;
const P = rutasAnuales(ROOT, h).F, VER = /const VER='([^']+)'/.exec(h)[1];
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const T = terrenoComoLaPagina(E, datos, 80, 0).T;
const STEP = 5, TZ = 1, ALB = 0.2, dt = STEP / 60 / 1000;
const doy = E.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-21`), d0 = Date.UTC(2026, mo, 21) - TZ * 3600000;
const acc = { E: 0, beam: 0, circ: 0, skygnd: 0, perdB: 0, perdC: 0, n: 0 };
const det = [];                                   // [neta, sin sombra, pérdida] por mesa·instante
let peorRecon = 0, mesasPorInstante = null; const t0 = Date.now(); const LZS = E.crearLazoSeg();
for (let m = 0; m < 1440; m += STEP) {
  const g = E.solarPos(d0 + m * 60000, lay.clat, lay.clon);
  if (!(g.elev > 0)) continue;
  const irr = E.clearskyIneichen(g.zen, doy, datos.base, 3.5);
  const segN = P.segCmd(key, g.zen, g.az, T, T, irr, doy, ALB);
  const ls = E.topeBacktrackingSeg(g.zen, g.az, T, segN, LZS.paso(segN, STEP * 60));
  const sh = E.shadeRows(g.zen, g.az, T, ls);
  let wt = 0, b = 0, c = 0, sg = 0, pb = 0, pc = 0; const fila = [];
  for (let r = 0; r < ls.length; r++) {
    const line = T.segs ? T.segs[r] : null;
    for (let k = 0; k < ls[r].length; k++) {
      const p = E.poaRow(ls[r][k], E.segTiltAt(T, r, k), T.axisAz, g.zen, g.az, irr, doy, ALB, T.iam);
      const fo = Math.max(0, Math.min(1, (sh.seg && sh.seg[r] && sh.seg[r][k] != null) ? sh.seg[r][k] : (sh[r] || 0)));
      const se = (sh.segElec && sh.segElec[r] && sh.segElec[r][k] != null) ? sh.segElec[r][k] : E.elecLoss(fo, T.nBypass);
      const len = line && line[k] ? Math.max(1e-6, line[k][1] - line[k][0]) : 1;
      const p0 = p.beam + p.circ + p.sky + p.gnd, loss = p.beam * se + p.circ * fo;
      wt += len; b += p.beam * len; c += p.circ * len; sg += (p.sky + p.gnd) * len; pb += p.beam * se * len; pc += p.circ * fo * len;
      fila.push([len, p0, loss]);
    }
  }
  if (mesasPorInstante === null) mesasPorInstante = fila.length;
  else if (fila.length !== mesasPorInstante) throw new Error('el número de mesas cambia entre instantes');
  for (const [len, p0, loss] of fila) { const w = len / wt * dt; det.push((p0 - loss) * w, p0 * w, loss * w); }
  const plant = E.poaPlantSeg(g.zen, g.az, T, ls, irr, doy, ALB).plant;
  peorRecon = Math.max(peorRecon, Math.abs((b + c + sg - pb - pc) / wt - plant));
  acc.E += plant * dt; acc.beam += b / wt * dt; acc.circ += c / wt * dt; acc.skygnd += sg / wt * dt; acc.perdB += pb / wt * dt; acc.perdC += pc / wt * dt; acc.n++;
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `P3r_mesa_${key}_${mo + 1}.bin`), Buffer.from(new Float64Array(det).buffer));
const R = { pol: key, mes: mo + 1, VER, paso_min: STEP, ...acc, mesas_por_instante: mesasPorInstante, peor_reconstruccion_Wm2: peorRecon, s: Math.round((Date.now() - t0) / 1000), cpu: os.cpus().length };
fs.writeFileSync(dest, JSON.stringify(R, null, 1));
console.log(`${key.padEnd(9)} 21-${mo === 5 ? 'jun' : 'dic'}: E ${acc.E.toFixed(6)} · haz ${acc.beam.toFixed(6)} · circ ${acc.circ.toFixed(6)} · sky+gnd ${acc.skygnd.toFixed(6)} · sombra ${(acc.perdB + acc.perdC).toFixed(6)} kWh/m² · reconstrucción ${peorRecon.toExponential(1)} · ${acc.n} pasos × ${mesasPorInstante} mesas · ${R.s} s`);
