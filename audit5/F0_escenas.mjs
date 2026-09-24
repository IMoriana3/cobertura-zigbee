/* BT3D · FASE 0 — escribe las escenas que lee el paquete Python.
 *
 *   node audit5/F0_escenas.mjs [ayora|fayon ...]
 *
 * Salida: audit5/out/escenas/<planta>.json (no se versiona: se regenera; pesa
 * varios MB). Imprime el denominador de cada planta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador } from './lib_simulador.mjs';
import { cargar } from './lib_parametros.mjs';
import { escena } from './lib_escena.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { F, VER } = cargaSimulador(ROOT, ['rangoHaz']);
const P = cargar();
const plantas = process.argv.slice(2).length ? process.argv.slice(2) : ['ayora', 'fayon'];
fs.mkdirSync(path.join(ROOT, 'audit5/out/escenas'), { recursive: true });
for (const pl of plantas) {
  const E = escena(ROOT, F, VER, P, pl);
  fs.writeFileSync(path.join(ROOT, `audit5/out/escenas/${pl}.json`), JSON.stringify(E));
  const fil = E.unidades.reduce((a, u) => { a[u.filas] = (a[u.filas] || 0) + 1; return a; }, {});
  console.log(`${VER} · ${pl}: ${E.lineas} líneas · ${E.mesas.length} mesas · ${E.unidades.length} unidades (filas por unidad ${JSON.stringify(fil)}) · ${E.instantes.length} instantes con sol > ${P.elev_min_deg}° en ${P.dias.length} días`);
}
