/* PASO 3 · (c) ampliado, punto 2 del titular: ¿el acople de líneas enteras gana
 * por una propiedad general o por CASUALIDAD de la geometría de Ayora?
 *
 *   node audit5/P3_3c_preset.mjs [--json=RUTA]
 *
 * El mismo careo que en Ayora —`true3d` con el acople de líneas enteras
 * (`driveCoupleSafe` con los grupos bifila) frente a la reparación por línea
 * (`porLinea`)— en presets genéricos UNIFORMES, donde no hay nada de la planta
 * que explicar: 10 filas, paso 6 m, cuerda 2,382 m, θmáx 55°, bifila, sin
 * torsión; LLANO y pendiente UNIFORME de 4° E-O. Ruta de línea con lazo
 * (`crearLazo` → `topeBacktracking` → `poaPlant`), cielo claro, lat/lon de la
 * genérica (tools/gen_golden_anual.mjs:83), 21-jun y 21-dic cada 5 min.
 * TEST NULO: `astro` idéntico en las dos variantes (no pasa por el acople).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dest = path.resolve(ROOT, (process.argv.find(a => a.startsWith('--json=')) || '--json=audit5/out/P3_3c_preset.json').slice(7));
const F = cargaSimulador(ROOT, ['crearLazo', 'topeBacktracking', 'poaPlant', 'driveCoupleSafe', 'anglesTrue3d', 'anglesAstro', 'repairNoShade', 'porLinea']).F;
const LAT = 41.5763, LON = -0.7981, TZ = 2, ALT = 300, ALB = 0.2, STEP = 5;
// z por fila y tilt N-S por fila: uniformes (el nulo) o con relieve genérico
function preset(z, tilt) {
  const nR = z.length, pitch = 6;
  const pairs = []; for (let i = 0; i < nR - 1; i++) pairs.push({ slope: Math.atan2(z[i] - z[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: (tilt[i] + tilt[i + 1]) / 2 });
  return { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: tilt,
           groups: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]], drive: 'bifila' };
}
const N = 10, P = 6, rad = Math.PI / 180;
let sem = 7; const azar = () => (sem = (sem * 16807) % 2147483647) / 2147483647;   // semilla fija: reproducible
const aleatorio = () => { const z = [0]; for (let i = 1; i < N; i++) z.push(z[i - 1] + (azar() - 0.5) * 2 * P * Math.tan(8 * rad)); return [z, [...Array(N)].map(() => (azar() - 0.5) * 6)]; };
const PRESETS = [
  ['llano (nulo)', [...Array(N)].fill(0), [...Array(N)].fill(0)],
  ['pendiente 4° (nulo)', [...Array(N)].map((_, i) => -i * P * Math.tan(4 * rad)), [...Array(N)].fill(0)],
  ['ondulado ±1,5 m', [...Array(N)].map((_, i) => 1.5 * Math.sin(2 * Math.PI * i / 5)), [...Array(N)].fill(0)],
  ['pendiente 5° + torsión N-S ±3°', [...Array(N)].map((_, i) => -i * P * Math.tan(5 * rad)), [...Array(N)].map((_, i) => 3 * Math.sin(2 * Math.PI * i / 4))],
  ...[1, 2, 3].map(k => { const [z, t] = aleatorio(); return ['aleatorio ' + k + ' (semilla 7)', z, t]; }),
];
const VAR = {
  acople: (zen, az, T, irr, doy) => F.repairNoShade(zen, az, T, F.driveCoupleSafe(zen, az, T, F.anglesTrue3d(zen, az, T), true), irr, doy, ALB),
  porLinea: (zen, az, T, irr, doy) => F.repairNoShade(zen, az, T, F.driveCoupleSafe(zen, az, F.porLinea(T), F.anglesTrue3d(zen, az, T), true), irr, doy, ALB),
  astro_nulo_a: (zen, az, T) => F.anglesAstro(zen, az, T),
  astro_nulo_b: (zen, az, T) => F.anglesAstro(zen, az, F.porLinea(T)),
};
const R = { dias: {} };
for (const [nombre, z, tilt] of PRESETS) {
  const T = preset(z, tilt); R.dias[nombre] = {};
  for (const mo of [5, 11]) {
    const doy = F.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-21`), d0 = Date.UTC(2026, mo, 21) - TZ * 3600000, fila = {};
    for (const [k, fn] of Object.entries(VAR)) {
      const LZ = F.crearLazo(); let kwh = 0;
      for (let m = 0; m < 1440; m += STEP) {
        const g = F.solarPos(d0 + m * 60000, LAT, LON); if (!(g.elev > 0)) continue;
        const irr = F.clearskyIneichen(g.zen, doy, ALT, 3.5);
        const th = fn(g.zen, g.az, T, irr, doy);
        const l = F.topeBacktracking(g.zen, g.az, T, th, LZ.paso(th, STEP * 60));
        kwh += F.poaPlant(g.zen, g.az, T, l, irr, doy, ALB).plant * STEP / 60 / 1000;
      }
      fila[k] = kwh;
    }
    R.dias[nombre][mo + 1] = fila;
    const d = 100 * (fila.porLinea / fila.acople - 1);
    console.log(`${nombre.padEnd(32)} 21-${mo === 5 ? 'jun' : 'dic'}: acople ${fila.acople.toFixed(6)} · por línea ${fila.porLinea.toFixed(6)} kWh/m² · Δ (por línea − acople) ${d.toFixed(4)} %${fila.acople === fila.porLinea ? ' · idéntico bit a bit' : ''} · TEST NULO astro ${fila.astro_nulo_a === fila.astro_nulo_b ? 'idéntico' : 'DIFIERE'}`);
  }
}
fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, JSON.stringify(R, null, 1));
