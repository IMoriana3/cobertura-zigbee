/* BT3D · LA ESCENA: mesas, unidades de accionamiento e instantes de sol.
 *
 * Lado JS, que es donde vive el simulador. Produce un JSON que el paquete
 * Python lee tal cual (`bt3d/escena.py`): la geometría no se reconstruye dos
 * veces, y así el careo JS↔Python es de enumerador y de grafo, no de lectura
 * de ficheros.
 *
 * AYORA · el levantamiento (`lineasDesdeCotas`, bloque 0 entero): cada mesa en
 *   la x de SU FILA, sus dos cotas medidas, rótula en el morro. Unidad = el
 *   tracker (`tk`): dos filas × dos mesas, un motor (`backtracking.html:1778-1788`).
 * FAYÓN · EL PLANO, NO LA MEDIDA: x/n del DWG, filas a ±filaZ del centro, cada
 *   fila partida en el centro con el hueco de motor, y la cota de cada punta de
 *   fila leída del DEM (bilineal). La fila es recta entre sus dos puntas: el tubo
 *   no copia el terreno bajo él. Declarado en `bt3d_parametros.json`.
 *
 * Por unidad: tilt = media de los τ de sus mesas; pendiente transversal = la del
 * plano de sus dos filas, atan2(z_oeste − z_este, x_este − x_oeste), con la z en
 * el centro de cada fila. Signo: el de `backtracking.html:4665-4667`.
 * RANGO por unidad e instante: `rangoHaz` DEL SIMULADOR, llamado, no copiado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { lineasDesdeCotas, tauDe } from './lib_mesas.mjs';
import { resolver } from './lib_parametros.mjs';

const DEG = 180 / Math.PI;

export function mesasAyora(ROOT) {
  const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const LIN = lineasDesdeCotas(datos, 0), mesas = [];
  LIN.forEach((L, r) => L.mesas.forEach(m => mesas.push({ x: m.x, n: m.n.slice(), z: m.z.slice(), uid: String(m.tk), fila: String(m.fila), linea: r })));
  return { mesas, lineas: LIN.length };
}

export function mesasFayon(ROOT, P) {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'fayon_layout.json'), 'utf-8'));
  const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'fayon_relieve.json'), 'utf-8'));
  const pl = P.plantas.fayon, off = pl.fila_offset_m, g = pl.hueco_motor_m / 2;
  const dem = (x, n) => {
    const fx = (x - R.x0) / R.paso, fy = (n - R.n0) / R.paso, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    if (i < 0 || j < 0 || i + 1 >= R.nx || j + 1 >= R.nn) throw new Error(`fuera del DEM: ${x}, ${n}`);
    const z = (a, b) => R.z[b * R.nx + a];
    return (z(i, j) * (1 - tx) + z(i + 1, j) * tx) * (1 - ty) + (z(i, j + 1) * (1 - tx) + z(i + 1, j + 1) * tx) * ty;
  };
  const mesas = [];
  for (const t of L.trackers) {
    const tp = L.mesa.tipos[t.blk]; if (!tp) throw new Error(`tipo sin medida: ${t.blk}`);
    if (t.rot) throw new Error(`Fayón con rot ≠ 0 en ${t.id}: esta escena solo sabe ejes N-S`);
    for (const [lado, dx] of [['O', -off], ['E', off]]) {
      const x = t.x + dx, nS = t.n + tp.desde, nN = t.n + tp.hasta, zS = dem(x, nS), zN = dem(x, nN);
      const zEn = n => zS + (zN - zS) * (n - nS) / (nN - nS);
      mesas.push({ x, n: [nS, t.n - g], z: [zS, zEn(t.n - g)], uid: t.id, fila: t.id + lado });
      mesas.push({ x, n: [t.n + g, nN], z: [zEn(t.n + g), zN], uid: t.id, fila: t.id + lado });
    }
  }
  return { mesas, lineas: new Set(mesas.map(m => m.x.toFixed(2))).size };
}

export function unidadesDe(mesas) {
  const por = new Map();
  mesas.forEach((m, i) => { if (!por.has(m.uid)) por.set(m.uid, []); por.get(m.uid).push(i); });
  return [...por.entries()].map(([id, idx]) => {
    const tilt = idx.reduce((s, i) => s + tauDe(mesas[i]) * DEG, 0) / idx.length;
    const filas = new Map();
    for (const i of idx) { const m = mesas[i]; if (!filas.has(m.fila)) filas.set(m.fila, { x: m.x, z: 0, k: 0 }); const f = filas.get(m.fila); f.z += (m.z[0] + m.z[1]) / 2; f.k++; }
    const F = [...filas.values()].map(f => ({ x: f.x, z: f.z / f.k })).sort((a, b) => a.x - b.x);
    /* una sola fila (monofila): sin plano de dos filas, pendiente 0 — declarado */
    const pendiente = F.length >= 2 ? Math.atan2(F[0].z - F[F.length - 1].z, F[F.length - 1].x - F[0].x) * DEG : 0;
    return { id, mesas: idx, tilt, pendiente, filas: F.length };
  });
}

/* instantes de los días declarados, con el rango de cada unidad */
export function instantes(F, P, planta, clat, clon, unidades) {
  const par = resolver(P, planta, unidades.map(u => u.id)), out = [];
  for (const [Y, M, D] of P.dias) {
    const fecha = `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`, doy = F.doyOf(fecha);
    for (let min = 0; min < 1440; min += P.paso_min) {
      const g = F.solarPos(Date.UTC(Y, M - 1, D, 0, min), clat, clon);
      if (!(g.elev > P.elev_min_deg)) continue;
      const az = g.az - par[0].convergencia;
      const rangos = unidades.map((u, k) => F.rangoHaz(g.zen, az, { maxAngle: par[k].theta_max, axisAz: par[k].axis_az }, u.tilt, u.pendiente));
      out.push({ fecha, doy, min, zen: g.zen, az, elev: g.elev, rangos });
    }
  }
  return out;
}

export function escena(ROOT, F, VER, P, planta) {
  const lay = JSON.parse(fs.readFileSync(path.join(ROOT, `${planta}_layout.json`), 'utf-8'));
  const { mesas, lineas } = planta === 'ayora' ? mesasAyora(ROOT) : mesasFayon(ROOT, P);
  const unidades = unidadesDe(mesas);
  const uDe = new Map(unidades.map((u, k) => [u.id, k]));
  return { planta, ver: VER, lineas, clat: lay.clat, clon: lay.clon,
    mesas: mesas.map(m => ({ x: m.x, n: m.n, z: m.z, u: uDe.get(m.uid) })),
    unidades: unidades.map(u => ({ id: u.id, mesas: u.mesas, tilt: u.tilt, pendiente: u.pendiente, filas: u.filas })),
    instantes: instantes(F, P, planta, lay.clat, lay.clon, unidades) };
}
