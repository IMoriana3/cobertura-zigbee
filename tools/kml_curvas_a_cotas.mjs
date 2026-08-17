/* Convierte las CURVAS DE NIVEL de un KMZ/KML en una malla de cotas regular para el 3D.
 *
 * Dicayagua trae levantamiento propio: 3.843 curvas de nivel con su altitud en el nombre («170 m»,
 * «174 m»…) y 359.527 vértices. Eso es mejor que el DEM global que usa terreno.html —teselas
 * Terrarium de ~30 m— pero el 3D necesita una MALLA, no curvas.
 *
 * CÓMO SE RELLENA, y por qué así:
 *   Cada nodo de la malla toma la cota por ponderación inversa a la distancia (IDW, potencia 2)
 *   de los vértices de curva que caen dentro de un radio. Es el método clásico para curvas de
 *   nivel y tiene una propiedad que aquí importa: es EXACTO sobre la propia curva y no inventa
 *   máximos ni mínimos entre curvas, que es lo que hace una interpolación polinómica y lo que
 *   produce esos «huevos» en el terreno.
 *   Los nodos sin ningún vértice a tiro se dejan a null: el 3D usa el DEM ahí. Mejor un hueco
 *   declarado que una cota inventada por extrapolación.
 *
 * Salida: {planta, crs, cE, cN, x0, n0, paso, nx, nn, z:[...]} con z en metros sobre el nivel del
 * mar y en el MISMO sistema local que el layout (x este, n norte, respecto al centro del campo).
 *
 *   node tools/kml_curvas_a_cotas.mjs <curvas.kml> <planta> [paso_m] [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [kmlPath, planta, ...rest] = process.argv.slice(2);
const PASO = +(rest.find(a => /^\d+$/.test(a)) || 10);
const WRITE = rest.includes('--write');
if (!kmlPath || !planta) { console.error('uso: node tools/kml_curvas_a_cotas.mjs <curvas.kml> <planta> [paso_m] [--write]'); process.exit(2); }
const RAIZ = new URL('..', import.meta.url).pathname;

function utm(lat, lon, zona, sur) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const lam0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180, phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - 2 * Math.sqrt(n) / (1 + n) * Math.atanh(2 * Math.sqrt(n) / (1 + n) * Math.sin(phi)));
  const xi = Math.atan(t / Math.cos(lam - lam0)), eta = Math.atanh(Math.sin(lam - lam0) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + k0 * A * E, (sur ? 10000000 : 0) + k0 * A * N];
}

/* El origen y el sistema local salen del LAYOUT de la planta: la malla tiene que caer sobre el
   campo, no sobre un centro propio, o el relieve saldría desplazado respecto a las mesas. */
const LAY = JSON.parse(readFileSync(RAIZ + planta + '_layout.json', 'utf8'));
const zona = +LAY.crs.slice(-2), sur = LAY.crs.includes('327');
const cE = LAY.cE, cN = LAY.cN;

/* ---------- vértices con cota ---------- */
const xml = readFileSync(kmlPath, 'utf8');
const pts = [];            // [x, n, z]
let sinCota = 0, conCota = 0;
for (const m of xml.matchAll(/<Placemark[\s\S]*?<\/Placemark>/g)) {
  const pm = m[0];
  /* La cota está en el NOMBRE de la curva («170 m»), no en la Z de las coordenadas: el KML las
     trae todas a 0 salvo en los puntos sueltos. Si el nombre no la trae, se usa la Z si la hay. */
  const nom = (/<name>([^<]*)<\/name>/.exec(pm) || [, ''])[1].trim();
  const mz = /(-?\d+(?:[.,]\d+)?)\s*m\b/i.exec(nom);
  const zNom = mz ? parseFloat(mz[1].replace(',', '.')) : null;
  /* Lo que de verdad trae cota en este KML: 164 curvas con su altitud en el nombre («170 m») y 672
     puntos sueltos con la cota en la Z. Las otras 3.678 líneas están planas y sin nombre: son
     linderos de propiedad, no relieve, y meterlas a cota 0 hundiría el terreno. */
  const c = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm);
  if (!c) continue;
  for (const tok of c[1].trim().split(/\s+/)) {
    const p = tok.split(',');
    if (p.length < 2) continue;
    const lon = +p[0], lat = +p[1], zc = p.length > 2 ? +p[2] : 0;
    const z = (zNom != null) ? zNom : (zc > 0 ? zc : null);
    if (z == null) { sinCota++; continue; }
    const [e, n] = utm(lat, lon, zona, sur);
    pts.push([e - cE, n - cN, z]); conCota++;
  }
}
if (!pts.length) { console.error('no hay vértices con cota'); process.exit(1); }
const zs = pts.map(p => p[2]);
console.log(`${conCota.toLocaleString('es')} vértices con cota (${sinCota.toLocaleString('es')} sin ella)`);
console.log(`cota ${Math.min(...zs).toFixed(1)} .. ${Math.max(...zs).toFixed(1)} m`);

/* ---------- malla que cubre el campo de estructuras ---------- */
const xs = LAY.trackers.map(t => t.x), ns = LAY.trackers.map(t => t.n);
const MARGEN = 120;
const x0 = Math.floor((Math.min(...xs) - MARGEN) / PASO) * PASO, x1 = Math.ceil((Math.max(...xs) + MARGEN) / PASO) * PASO;
const n0 = Math.floor((Math.min(...ns) - MARGEN) / PASO) * PASO, n1 = Math.ceil((Math.max(...ns) + MARGEN) / PASO) * PASO;
const nx = Math.round((x1 - x0) / PASO) + 1, nn = Math.round((n1 - n0) / PASO) + 1;
console.log(`malla ${nx} x ${nn} nodos a ${PASO} m  (${((x1 - x0) / 1000).toFixed(2)} x ${((n1 - n0) / 1000).toFixed(2)} km)`);

/* Rejilla de cubos para no comparar cada nodo con los 359.527 vértices: sin esto son 1,3e10
   distancias y no termina. */
/* Radio 200 m y los 8 vecinos más próximos. Con 45 m solo se rellenaba el 20 % de la malla: las
   curvas van de 2 en 2 m de altura y a esta pendiente eso son decenas de metros de separación
   horizontal. Quedarse con los 8 más próximos evita que un radio grande promedie media ladera. */
const R = 200, KN = 8;
const CB = R;                                          // lado del cubo
const cubo = new Map();
const clave = (i, j) => i + ',' + j;
for (const p of pts) {
  const k = clave(Math.floor(p[0] / CB), Math.floor(p[1] / CB));
  let a = cubo.get(k); if (!a) cubo.set(k, a = []); a.push(p);
}

const z = new Array(nx * nn).fill(null);
let huecos = 0;
for (let j = 0; j < nn; j++) {
  const yy = n0 + j * PASO;
  for (let i = 0; i < nx; i++) {
    const xx = x0 + i * PASO;
    const ci = Math.floor(xx / CB), cj = Math.floor(yy / CB);
    const cand = [];
    const rad = Math.ceil(R / CB);
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
      const arr = cubo.get(clave(ci + a, cj + b)); if (!arr) continue;
      for (const p of arr) {
        const d2 = (p[0] - xx) ** 2 + (p[1] - yy) ** 2;
        if (d2 <= R * R) cand.push([d2, p[2]]);
      }
    }
    if (!cand.length) { huecos++; continue; }
    cand.sort((u, v) => u[0] - v[0]);
    if (cand[0][0] < 1e-6) { z[j * nx + i] = cand[0][1]; continue; }   // justo encima de la curva
    let num = 0, den = 0;
    for (let k = 0; k < Math.min(KN, cand.length); k++) { const w = 1 / cand[k][0]; num += w * cand[k][1]; den += w; }
    z[j * nx + i] = +(num / den).toFixed(2);
  }
}
console.log(`nodos con cota ${(nx * nn - huecos).toLocaleString('es')} de ${(nx * nn).toLocaleString('es')} (${huecos} sin dato, el 3D usa el DEM ahí)`);
const zz = z.filter(v => v != null);
console.log(`malla: ${Math.min(...zz).toFixed(1)} .. ${Math.max(...zz).toFixed(1)} m · media ${(zz.reduce((a, b) => a + b, 0) / zz.length).toFixed(1)}`);

/* CONTRASTE: la cota que sale bajo cada estructura, contra la altitud que declara el plano. */
const bajo = [];
for (const t of LAY.trackers) {
  const i = Math.round((t.x - x0) / PASO), j = Math.round((t.n - n0) / PASO);
  const v = (i >= 0 && i < nx && j >= 0 && j < nn) ? z[j * nx + i] : null;
  if (v != null) bajo.push(v);
}
bajo.sort((a, b) => a - b);
console.log(`bajo las ${bajo.length} estructuras: ${bajo[0].toFixed(1)} .. ${bajo[bajo.length - 1].toFixed(1)} m · mediana ${bajo[bajo.length >> 1].toFixed(1)}`);

const OUT = { planta, crs: LAY.crs, cE, cN, x0, n0, paso: PASO, nx, nn,
              nota: 'cota IDW sobre las curvas de nivel del levantamiento; null = sin dato, usar DEM',
              fuente: kmlPath.split('/').pop(), z };
if (!WRITE) { console.log('\n(dry-run: pasa --write)'); process.exit(0); }
writeFileSync(RAIZ + planta + '_relieve.json', JSON.stringify(OUT));
console.log(`\nescrito ${planta}_relieve.json`);
