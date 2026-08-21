/* Vuelca lo que el core Python necesita para reproducir `banda_astro_bt.mjs`
   SIN re-derivar nada: geometría de Ayora, eje de tiempos, sol e irradiancia.

   Por qué se transporta en vez de recalcularse en Python: dos derivaciones
   distintas del mismo fichero de cotas —o dos implementaciones de Ineichen—
   difieren por sus propios redondeos, y entonces el careo mide la diferencia
   entre las derivaciones en vez de la física que se quiere comparar. Con el
   sol, el cielo y el terreno IDÉNTICOS, lo que quede es la cadena
   transposición → sombra → efecto eléctrico, que es lo que la §1.3 pregunta.

       node tools/dump_ayora_cruce.mjs [meses] > ayora_cruce.json             */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
const src = html.slice(html.lastIndexOf('/*', i0), i1);
if (src.length < 5000) throw new Error(`bloque FÍSICA PURA sospechoso: ${src.length} car.`);
const F = new Function(src + ';return {solarPos,clearskyIneichen,plantFromCotas};')();

// MISMAS constantes que banda_astro_bt.mjs — si allí cambian, aquí también.
const LAT = 39.1182081, LON = -1.1598527, ALT = 739, TL = 3.5, STEP = 20;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MESES = +(process.argv[2] || 12);

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const P = F.plantFromCotas(data, 500, 0);
const pairs = [];
for (let i = 0; i < P.lineX.length - 1; i++) {
  const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
  pairs.push({
    slope_deg: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI,
    pitch_m: dx,
    axis_tilt_deg: (P.tilt[i] + P.tilt[i + 1]) / 2,
  });
}

const t = [], zen = [], az = [], ghi = [], dni = [], dhi = [], peso = [];
for (let mo = 0; mo < MESES; mo++) {
  const day = Date.UTC(2026, mo, 21);
  const doy = Math.round((day - Date.UTC(2026, 0, 1)) / 86400000) + 1;
  for (let m = 0; m < 1440; m += STEP) {
    const g = F.solarPos(day + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;                 // MISMO filtro que la banda
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    t.push(new Date(day + m * 60000).toISOString());
    zen.push(g.zen); az.push(g.az);
    ghi.push(irr.ghi); dni.push(irr.dni); dhi.push(irr.dhi);
    // peso horario de la banda: STEP/60 h por muestra × días del mes / 1000
    peso.push(STEP / 60 / 1000 * DIM[mo]);
  }
}

process.stdout.write(JSON.stringify({
  fuente: 'cobertura-zigbee/backtracking.html · bloque FÍSICA PURA (mismo que banda_astro_bt.mjs)',
  sitio: { lat: LAT, lon: LON, alt_m: ALT, linke: TL, paso_min: STEP, meses: MESES },
  terreno: {
    collector_width_m: P.cw, axis_azimuth_deg: 0, max_angle_deg: P.maxAngle,
    gcr: P.cw / P.pitch, pitch_nominal_m: P.pitch, pairs,
  },
  serie: { t, zen, az, ghi, dni, dhi, peso_kwh_por_wm2: peso },
}) + '\n');
