/* ¿IMPORTA QUE EL EJE NO APUNTE EXACTAMENTE AL NORTE?

   Uso:
     node tools/sensib_azimut.mjs --planta ayora
     node tools/sensib_azimut.mjs --planta ayora --dias 4 --paso 10

   LA PREGUNTA. El registro 41014 lleva el azimut del eje y en muchas plantas
   está a 0. Pero las filas casi nunca están a cero exacto respecto al norte
   VERDADERO, y hay una razón sistemática que se cuela en todos los proyectos:
   los planos van en UTM, y **el norte de la cuadrícula UTM no es el norte
   verdadero**. La diferencia es la CONVERGENCIA DE MERIDIANOS, que crece con
   la distancia al meridiano central del huso y con la latitud:

       γ = atan( tan(λ − λ₀) · sin φ )

   En Ayora (EPSG:25830, huso 30N, meridiano central −3°, longitud −1,16°)
   salen **1,16°**. Y como los 754 seguidores del layout llevan `rot = 0`,
   están replanteados paralelos al norte de CUADRÍCULA: su azimut verdadero es
   ≈1,16°, no 0. La TCU tiene 0.

   LA RESPUESTA, MEDIDA: **no importa**. En Ayora ese 1,16° cuesta 0,025 % de
   energía. Ni a 5° de desvío se llega al 0,2 %.

   Y el motivo NO es el que parece. La explicación cómoda —«entra por un
   coseno, así que va con el cuadrado del desvío»— la desmienten los propios
   números: de 1° a 5° la pérdida pasa de 0,024 % a 0,183 %, o sea ×7,6
   cuando el ángulo se multiplica por 5. Eso es un exponente de ~1,26: **casi
   lineal**, no cuadrático. La razón de que sea pequeño es más simple: un
   desvío de un grado en un eje que barre ±55° es una perturbación del 2 % de
   la geometría, y el seguidor la absorbe girando un pelo distinto. Se deja
   escrita la corrección porque la versión cuadrática se coló primero en un
   documento de cliente, contradiciendo la tabla que tenía justo encima.

   POR QUÉ SE DEJA ESCRITO IGUAL. Porque la pregunta la va a hacer todo
   cliente al que se le enseñe una ficha de registros, y la alternativa a
   tener el número es mandar a alguien a comprobar el replanteo con GPS por un
   0,02 %. Un resultado negativo medido vale tanto como uno positivo, y este
   además AHORRA trabajo.

   CÓMO SE MIDE. Dos plantas idénticas salvo el azimut del eje:
     · la TCU calcula el ángulo creyendo que el eje está a 0;
     · la planta lo EJECUTA con su eje real, girado γ;
   y se compara contra la misma planta con la TCU sabiendo su azimut. La
   diferencia es lo que cuesta el desconocimiento, que es lo que se paga.

   El caso γ=0 tiene que dar exactamente 0,000 %: es el control del método.  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PLANTA = arg('planta', 'ayora');
const PASO = Math.max(1, +arg('paso', 15));
const NDIAS = Math.max(1, +arg('dias', 2));

const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
             + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(_sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) +
  ';return {solarPos,clearskyIneichen,policyAngles,poaPlant,plantFromCotas,slewLimit};')();

const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_layout.json'), 'utf-8'));
const P = F.plantFromCotas(cotas, 500, null);
const LAT = +lay.clat, LON = +lay.clon, ALT = +cotas.base || 0;

// meridiano central del huso, deducido del EPSG cuando se puede
const epsg = String(lay.crs || '');
let CM = null, huso = null;
let m = epsg.match(/EPSG:(?:258|326|327)(\d\d)/);
if (m) { huso = +m[1]; CM = 6 * huso - 183; }
const gamma = CM == null ? null :
  Math.atan(Math.tan((LON - CM) * Math.PI / 180) * Math.sin(LAT * Math.PI / 180)) * 180 / Math.PI;

console.log('SENSIBILIDAD AL AZIMUT DEL EJE · ' + PLANTA.toUpperCase());
console.log('  CRS del layout: ' + (epsg || '(sin declarar)'));
if (gamma != null) {
  console.log('  huso ' + huso + ', meridiano central ' + CM + '° · la planta está a ' +
    (LON - CM).toFixed(4) + '° de él');
  console.log('  CONVERGENCIA DE MERIDIANOS γ = ' + gamma.toFixed(3) + '°');
} else {
  console.log('  no deduzco el huso del CRS: se barre igual, sin marcar el caso real');
}
const rots = new Set((lay.trackers || []).map(t => t.rot || 0));
if (rots.size === 1 && rots.has(0))
  console.log('  los ' + (lay.trackers || []).length + ' seguidores llevan rot=0 → filas paralelas al ' +
    'norte de CUADRÍCULA, luego su azimut VERDADERO ≈ ' + (gamma != null ? gamma.toFixed(2) + '°' : 'γ'));
else
  console.log('  ATENCIÓN: el layout trae ' + rots.size + ' rotaciones distintas — el azimut no es único');
console.log('');

function planta(axisAz) {
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: 0, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  return { pairs, cw: P.cw, axisAz, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
           nBypass: 2, iam: 0.05, rowTilt: P.tilt, groups: P.groups, drive: 'bifila',
           segs: P.segs, real: P };
}
const Tcree = planta(0);                     // lo que la TCU cree
const TODOS = [[5, 21, '21-jun'], [11, 21, '21-dic'], [2, 21, '21-mar'], [8, 21, '21-sep']];
const DIAS = TODOS.slice(0, NDIAS);

const CASOS = [0, 0.5, 1, 2, 3, 5];
if (gamma != null && !CASOS.some(v => Math.abs(v - Math.abs(gamma)) < 1e-6))
  CASOS.push(+Math.abs(gamma).toFixed(3));
CASOS.sort((a, b) => a - b);

console.log('  desvío    energía (kWh/m²·día)   pérdida por NO saberlo');
for (const err of CASOS) {
  const Treal = planta(err);
  let mal = 0, bien = 0;
  for (const [mo, dd] of DIAS) {
    const day = Date.UTC(2026, mo, dd);
    const doy = Math.round((day - Date.UTC(2026, 0, 1)) / 86400000) + 1;
    let pA = null, pB = null;
    for (let mm = 0; mm < 1440; mm += PASO) {
      const g = F.solarPos(day + mm * 60000, LAT, LON);
      if (g.elev <= 0) continue;
      const irr = F.clearskyIneichen(g.zen, doy, ALT, 3.5);
      // la TCU manda el ángulo de un eje a 0; la planta lo ejecuta con el suyo
      pA = F.slewLimit(pA, F.policyAngles('pairwise', g.zen, g.az, Tcree, irr, doy, 0.20).angles, PASO * 60);
      mal += F.poaPlant(g.zen, g.az, Treal, pA, irr, doy, 0.20).plant * (PASO / 60) / 1000;
      // la TCU sabe su azimut
      pB = F.slewLimit(pB, F.policyAngles('pairwise', g.zen, g.az, Treal, irr, doy, 0.20).angles, PASO * 60);
      bien += F.poaPlant(g.zen, g.az, Treal, pB, irr, doy, 0.20).plant * (PASO / 60) / 1000;
    }
  }
  const perd = 100 * (mal / bien - 1);
  const marca = (gamma != null && Math.abs(err - Math.abs(gamma)) < 5e-4)
    ? '   ← convergencia real de esta planta' : (err === 0 ? '   ← control: tiene que ser 0,000' : '');
  console.log('  ' + (err.toFixed(3) + '°').padStart(8) + '   ' + (mal / DIAS.length).toFixed(4).padStart(12) +
    '        ' + (perd >= 0 ? '+' : '') + perd.toFixed(3) + ' %' + marca);
}
console.log('');
console.log('  Crece CASI LINEAL con el desvío (exponente ≈1,26 en el ajuste), no con el cuadrado.');
console.log('  Es pequeño porque un grado sobre un eje que barre ±55° perturba la geometría un 2 %.');
console.log('  No compensa ir a campo a comprobar el replanteo por esto.');
