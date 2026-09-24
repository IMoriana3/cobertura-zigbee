/* BT3D · LOS PARÁMETROS DECLARADOS, lado JS.
 *
 * Lee `audit5/bt3d_parametros.json` y NADA MÁS: ningún valor de este módulo
 * está escrito aquí. El gemelo Python es `bt3d/parametros.py`; el banco
 * `audit5/test_parametros.mjs` hace que los dos resuelvan la misma tabla y cae
 * si difieren en un solo carácter.
 *
 * `resolver(P, planta, ids)` devuelve, por unidad, lo que el simulador y el
 * optimizador necesitan: θmáx (el de la planta salvo que el fichero declare uno
 * propio para ese id), cuerda, z0, nb, rejilla, banda muerta, techo de haz,
 * margen de rango y el radio de la envolvente. El formato canónico (`canon`)
 * fija el redondeo para que el careo sea de texto.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bt3d_parametros.json');

export function cargar(ruta = RUTA) { return JSON.parse(fs.readFileSync(ruta, 'utf-8')); }

export function rho(P, planta) {
  const pl = P.plantas[planta], e = P.envolvente;
  return Math.hypot(pl.cuerda_m / 2, pl.z0_m + e.canto_m) + e.margen_m;
}

export function resolver(P, planta, ids) {
  const pl = P.plantas[planta];
  if (!pl) throw new Error(`planta no declarada: ${planta}`);
  const r = rho(P, planta);
  return ids.map(id => ({
    id: String(id),
    theta_max: (pl.theta_max_por_unidad && pl.theta_max_por_unidad[id] != null) ? pl.theta_max_por_unidad[id] : pl.theta_max_deg,
    cuerda: pl.cuerda_m, z0: pl.z0_m, nb: pl.nb, axis_az: pl.axis_az_deg,
    rejilla: P.rejilla_deg, banda_muerta: P.banda_muerta_deg, aoi_haz: P.aoi_haz_deg, margen_rango: P.margen_rango_deg,
    rho: r, tau_a_pvlib: P.convencion_signo.tau_a_pvlib_signo,
    convergencia: P.aplicar_convergencia ? (pl.convergencia_deg ?? 0) : 0,
    cono_haz: P.cono_haz,
  }));
}

/* texto canónico: claves en orden, números a 9 decimales significativos fijos */
const num = v => (v == null ? 'null' : (Number.isInteger(v) ? String(v) : v.toFixed(9)));
export function canon(tabla) {
  return tabla.map(u => Object.keys(u).sort().map(k => `${k}=${typeof u[k] === 'number' || u[k] == null ? num(u[k]) : u[k]}`).join(';')).join('\n');
}
