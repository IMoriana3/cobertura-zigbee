/* REFUNDACIÓN · PASO 1.4 — EFECTO DE QUE EL ANUAL CONSUMA LA RAMA POR MESA.
 *
 *   node audit5/P1_4_efecto_anual.mjs <ayora|senoidal> <boton|informe> <pol[,pol…]> [--json=RUTA]
 *
 * ANTES = `backtracking.html` de la base de este PR (`origin/main`, v1.78.1).
 * DESPUÉS = el de esta rama (v1.81.0). Se ejecuta el CÓDIGO REAL de cada ruta
 * anual (`audit5/lib_anual_pagina.mjs`: el bucle del botón y `grAnualGen`,
 * cortados de la página), no una reimplementación.
 *
 * Montaje (declarado):
 *   · Ayora: la banda de la página (80 líneas pedidas, bloque 0), ayora_cotas.json;
 *     lat/lon de ayora_layout.json; huso +1; altitud la base del levantamiento;
 *     Linke 3,5; albedo 0,20; año 2026. `Tcfg === T` (la TCU al corriente del
 *     levantamiento): si no, `segCmd` manda por línea por diseño.
 *   · senoidal: el preset sintético de A.4, SIN mesas → TEST NULO: antes y
 *     después tienen que dar lo mismo BIT A BIT (el cambio solo actúa con mesas).
 *   · informe: `cloudCC` = 0, el valor por defecto de la página («a 0 no toca
 *     nada»); `grDiferida` = nunca (se calculan también las caras).
 * El DÍA no se mide aquí: el diff de este paso no toca la serie del día.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { rutasAnuales } from './lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [PL, RUTA, POLS] = [process.argv[2] || 'senoidal', process.argv[3] || 'boton', (process.argv[4] || 'astro').split(',')];
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const BASE = arg('base', 'origin/main');
const dest = path.resolve(ROOT, arg('json', `audit5/out/P1_4_${PL}_${RUTA}_${POLS.join('-')}.json`));
const htmlAntes = execFileSync('git', ['show', BASE + ':backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const htmlAhora = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const A = rutasAnuales(ROOT, htmlAntes).F, D = rutasAnuales(ROOT, htmlAhora).F;
const { F } = cargaSimulador(ROOT, []);
let T, c;
if (PL === 'ayora') {
  const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
  T = terrenoComoLaPagina(F, datos, 80, 0).T;
  c = { lat: lay.clat, lon: lay.clon, tz: 1, alt: datos.base, tl: 3.5, albedo: 0.2, date: '2026-06-21' };
} else {
  const n = 8, pitch = 6, elev = [...Array(n)].map((_, i) => -i * 6 * Math.tan(5 * Math.PI / 180));
  const tilt = [...Array(n)].map((_, i) => 3 * Math.sin(2 * Math.PI * i / 4));
  const pairs = []; for (let i = 0; i < n - 1; i++) pairs.push({ slope: Math.atan2(elev[i] - elev[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: (tilt[i] + tilt[i + 1]) / 2 });
  T = { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilt, groups: null, drive: 'mono' };
  c = { lat: 41.5763, lon: -0.7981, tz: 1, alt: 300, tl: 3.5, albedo: 0.2, date: '2026-06-21' };
}
const POLICIES = POLS.map(k => ({ key: k, on: true }));
const days = ['01-21', '02-21', '03-21', '04-21', '05-21', '06-21', '07-21', '08-21', '09-21', '10-21', '11-21', '12-21'];
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const corre = X => RUTA === 'boton' ? X.boton(c, T, T, POLICIES, '2026', days, DIM) : X.informe({ c, T, Tcfg: T }, POLICIES, () => false, () => 0).tot;
const R = { planta: PL, ruta: RUTA, base: BASE, antes: A.VER, ahora: D.VER, conMesas: !!D.segOn(T), maquina: { cpu: os.cpus().length, carga_inicio: os.loadavg() } };
const t0 = Date.now();
R.totAntes = corre(A); R.sAntes = (Date.now() - t0) / 1000;
R.totAhora = corre(D); R.sAhora = (Date.now() - t0) / 1000 - R.sAntes;
R.maquina.carga_fin = os.loadavg();
fs.writeFileSync(dest, JSON.stringify(R, null, 1));
console.log(`REFUNDACIÓN · 1.4 · ${PL} · ruta ${RUTA} · ${A.VER} → ${D.VER} · con mesas: ${R.conMesas ? 'sí' : 'NO (test nulo: tiene que dar lo mismo bit a bit)'}`);
for (const k of POLS) {
  const a = R.totAntes[k], b = R.totAhora[k];
  console.log(`  ${k.padEnd(9)} ${a.toFixed(4)} → ${b.toFixed(4)} kWh/m²·año · Δ ${(100 * (b / a - 1)).toFixed(4)} %${a === b ? ' · idéntico bit a bit' : ''}`);
}
console.log(`  coste ${R.sAntes.toFixed(0)} s (antes) + ${R.sAhora.toFixed(0)} s (después) · carga ${R.maquina.carga_inicio.map(x => x.toFixed(1)).join('/')} (${R.maquina.carga_inicio[0] > 0.5 ? 'máquina OCUPADA: no es una medida de tiempo' : 'máquina libre'})`);
