/* REFUNDACIÓN · PASO 2.1 — ¿CUÁNTO SE APARTAN LAS TRES RUTAS ANUALES, Y POR QUÉ?
 *
 *   node audit5/P2_1_tres_rutas.mjs [--motor=astro,pairwise] [--json=RUTA]
 *
 * Las tres rutas (v1.81.0, ya con el paso 1):
 *   · BOTÓN del año (`backtracking.html`, `$('yearbtn').onclick`): CON lazo,
 *     cielo claro SIEMPRE, 12 días (el 21), cada 10 min, ponderado por días.
 *   · INFORME (`grAnualGen`): SIN lazo, con el cielo del deslizador de nubes
 *     (`cloudCC`), los mismos 12 días y paso.
 *   · `tools/anual_motor.mjs` (`anoDe`): OTRO MOTOR (`produccion.html` vía
 *     `gen_golden_anual.mjs`), OTRA MAGNITUD (potencia de string, no POA/m²), los
 *     365 días a paso de 1 min, lazo de `control_core` con ciclo de 1 s. No la
 *     llama nadie. Sus kWh no se comparan en valor con los de la página: se
 *     compara la GANANCIA de cada política sobre `astro` dentro de cada ruta.
 * Las dos rutas de la página se ejecutan TAL CUAL (audit5/lib_anual_pagina.mjs).
 *
 * Separar las dos causas:
 *   · LAZO  = botón − informe(cc=0)     (mismo cielo claro, con y sin lazo);
 *   · CIELO = informe(cc) − informe(0)  (mismo «sin lazo», con y sin nubes),
 *     con cc = 0,3 y 0,6 (declarado: el deslizador va de 0 a 1).
 *   La interacción lazo×cielo no se puede medir con el código de hoy: ninguna
 *   ruta tiene lazo Y nubes. Se dice, no se inventa.
 * Planta: la GENÉRICA de `gen_golden_anual.mjs:83-101` (10 filas, paso 6 m,
 * cuerda 2,382 m, θmáx 55°, pendiente 4°, lat 41,5763, lon −0,7981, huso +2,
 * alt 300, albedo 0,20), montada para la página como en `backtracking.html:4898`
 * (`z[i]=-i*c.pitch*Math.tan(v*RAD)`): monofila, tilt N-S 0, z0 0,17, nb 2, IAM 0,05.
 * TEST NULO: el informe con cc = 0 no toca el cielo (`cloudCC` 0 = bypass exacto),
 * así que informe(0) tiene que ser distinto del botón SOLO por el lazo: se
 * comprueba que con el lazo desarmado (paso() = identidad) el botón da el
 * informe(0) bit a bit.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rutasAnuales } from './lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const MOTOR = arg('motor', 'astro,pairwise').split(',').filter(Boolean);
const dest = path.resolve(ROOT, arg('json', 'audit5/out/P2_1_tres_rutas.json'));
// Se mide el estado ANTES de unificar (el del paso 1, v1.81.0): sobre la página
// de hoy las dos rutas ya son una. `--base=` para otro ref.
const BASE = arg('base', 'origin/claude/refundacion-p1-6th1im');
const html = execFileSync('git', ['show', BASE + ':backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const { F } = rutasAnuales(ROOT, html);
// el lazo DESARMADO para el test nulo: crearLazo/crearLazoSeg devuelven la consigna tal cual
const htmlSinLazo = html.replace('function crearLazo(deadband,rate,desde){', 'function crearLazo(deadband,rate,desde){return {paso:(c)=>c.slice()};')
                        .replace('function crearLazoSeg(deadband,rate){', 'function crearLazoSeg(deadband,rate){return {paso:(c)=>c.map(l=>l.slice())};');
if (htmlSinLazo === html) throw new Error('no se pudo desarmar el lazo');
const F0 = rutasAnuales(ROOT, htmlSinLazo).F;

const n = 10, pitch = 6, v = 4, RAD = Math.PI / 180;
const z = [...Array(n)].map((_, i) => -i * pitch * Math.tan(v * RAD));
const pairs = []; for (let i = 0; i < n - 1; i++) pairs.push({ slope: Math.atan2(z[i] - z[i + 1], pitch) / RAD, pitch, axisTilt: 0 });
const T = { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: new Array(n).fill(0), groups: null, drive: 'mono' };
const c = { lat: 41.5763, lon: -0.7981, tz: 2, alt: 300, tl: 3.5, albedo: 0.2, date: '2026-06-21' };
const POLS = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
const POLICIES = POLS.map(k => ({ key: k, on: true }));
const days = ['01-21', '02-21', '03-21', '04-21', '05-21', '06-21', '07-21', '08-21', '09-21', '10-21', '11-21', '12-21'];
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const R = { ver: F.VER, planta: 'genérica (gen_golden_anual CFG0), montada para la página', maquina: { cpu: os.cpus().length, carga_inicio: os.loadavg() } };
const guarda = () => fs.writeFileSync(dest, JSON.stringify(R, null, 1));
const t0 = Date.now();
R.boton = F.boton(c, T, T, POLICIES, '2026', days, DIM);
R.botonSinLazo = F0.boton(c, T, T, POLICIES, '2026', days, DIM);
R.informe = {}; for (const cc of [0, 0.3, 0.6]) R.informe[cc] = F.informe({ c, T, Tcfg: T }, POLICIES, () => false, () => cc).tot;
R.sPagina = (Date.now() - t0) / 1000; guarda();

console.log(`REFUNDACIÓN · 2.1 · las tres rutas anuales · ${F.VER} · genérica 10 filas, pendiente 4° · kWh/m²·año (páginas) · 12 días × 10 min`);
let nulo = 0;
for (const k of POLS) if (Math.abs(R.botonSinLazo[k] / R.informe[0][k] - 1) > 1e-12) nulo++;   // el botón suma por paso y el informe por día: otro orden de suma, tolerancia relativa 1e-12
console.log(`TEST NULO: botón con el lazo DESARMADO = informe(cc=0) (|rel| ≤ 1e-12) en ${POLS.length - nulo} de ${POLS.length} políticas ${nulo ? '✗ — las rutas difieren en algo más que el lazo' : '✓ (la única diferencia entre las dos es el lazo)'}`);
console.log(`\n política   botón (lazo, claro)  informe cc=0   LAZO (botón−inf0)   informe cc=0,3   CIELO 0,3   informe cc=0,6   CIELO 0,6`);
for (const k of POLS) {
  const b = R.boton[k], i0 = R.informe[0][k], i3 = R.informe[0.3][k], i6 = R.informe[0.6][k];
  console.log(`  ${k.padEnd(9)} ${b.toFixed(4).padStart(12)}  ${i0.toFixed(4).padStart(12)}  ${(100 * (b / i0 - 1)).toFixed(3).padStart(8)} %  ${i3.toFixed(4).padStart(12)}  ${(100 * (i3 / i0 - 1)).toFixed(2).padStart(8)} %  ${i6.toFixed(4).padStart(12)}  ${(100 * (i6 / i0 - 1)).toFixed(2).padStart(8)} %`);
}
console.log(`\nGANANCIA sobre astro, por ruta (lo único comparable con anual_motor):`);
for (const k of POLS.slice(1)) console.log(`  ${k.padEnd(9)} botón ${(100 * (R.boton[k] / R.boton.astro - 1)).toFixed(3)} % · informe(0) ${(100 * (R.informe[0][k] / R.informe[0].astro - 1)).toFixed(3)} % · informe(0,6) ${(100 * (R.informe[0.6][k] / R.informe[0.6].astro - 1)).toFixed(3)} %`);

/* anual_motor: otro motor, otra magnitud; solo la ganancia relativa */
if (MOTOR.length) {
  const { carga } = await import('../tools/gen_golden_anual.mjs');
  const { anoDe } = await import('../tools/anual_motor.mjs');
  const S = carga(ROOT); R.motor = {};
  for (const p of MOTOR) {
    const t1 = Date.now();
    const r = anoDe(S, p, { ano: '2026', cada: 1, filas: 0, eps: 0.05 });
    R.motor[p] = { kwh: r.kwh.reduce((a, b) => a + b, 0), dias: r.dias, s: (Date.now() - t1) / 1000 };
    guarda();
    console.error(`  anual_motor ${p}: ${R.motor[p].s.toFixed(0)} s`);
  }
  console.log(`\nanual_motor (produccion.html, potencia de string, 365 días × 1 min, lazo control_core ciclo 1 s):`);
  for (const p of MOTOR) console.log(`  ${p.padEnd(9)} ${R.motor[p].kwh.toFixed(2)} kWh (suma de strings, NO kWh/m²) · ${R.motor[p].dias} días` +
    (p !== 'astro' && R.motor.astro ? ` · ganancia sobre astro ${(100 * (R.motor[p].kwh / R.motor.astro.kwh - 1)).toFixed(3)} % (botón: ${(100 * (R.boton[p] / R.boton.astro - 1)).toFixed(3)} %)` : ''));
}
R.maquina.carga_fin = os.loadavg(); guarda();
console.log(`coste páginas ${R.sPagina.toFixed(0)} s · carga ${R.maquina.carga_inicio.map(x => x.toFixed(1)).join('/')} (${R.maquina.carga_inicio[0] > 0.5 ? 'máquina OCUPADA: no es una medida de tiempo' : 'máquina libre'})`);
