/* BT3D · EL ENUMERADOR POR ENVOLVENTE DE ROTACIÓN, lado JS.
 * Gemelo línea a línea de `bt3d/envolvente.py` (mismas cuentas, mismo orden,
 * para que el careo sea de igualdad y no de tolerancia). La justificación está
 * allí: estadio = eje proyectado en la vista del sol ⊕ disco ρ; condición
 * NECESARIA de sombra con algún par de θ = estadios que se tocan y emisor con
 * algún punto más cerca del sol que algún punto del receptor.
 *
 * Diferencia con `vecinosPotenciales` (rama r5-f2, lib_conjunto.mjs): aquel usaba
 * la CAJA alineada del estadio y ρ = cuerda/2 + z0; esto usa la distancia
 * exacta entre ejes proyectados y ρ = hypot(cuerda/2, z0 + canto) + margen, que
 * es el radio verdadero del sólido que barre la cara (más el canto).
 */
const G = 4;

export function baseVista(s) {
  const ref = Math.abs(s[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
  const c = [s[1] * ref[2] - s[2] * ref[1], s[2] * ref[0] - s[0] * ref[2], s[0] * ref[1] - s[1] * ref[0]];
  const l = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
  const e1 = [c[0] / l, c[1] / l, c[2] / l];
  const e2 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  return [e1, e2];
}

function distPtSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 <= 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}
const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const cruzan = (a, b, c, d) => ((o(a, b, c) > 0) !== (o(a, b, d) > 0)) && ((o(c, d, a) > 0) !== (o(c, d, b) > 0));

export function distSeg2(a, b, c, d) {
  if (cruzan(a, b, c, d)) return 0;
  return Math.min(distPtSeg2(a[0], a[1], c[0], c[1], d[0], d[1]), distPtSeg2(b[0], b[1], c[0], c[1], d[0], d[1]),
                  distPtSeg2(c[0], c[1], a[0], a[1], b[0], b[1]), distPtSeg2(d[0], d[1], a[0], a[1], b[0], b[1]));
}

export function proyectar(mesas, s) {
  const [e1, e2] = baseVista(s);
  return mesas.map(m => {
    const P = [[m.x, m.n[0], m.z[0]], [m.x, m.n[1], m.z[1]]];
    const uv = P.map(p => [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]]);
    const d = P.map(p => p[0] * s[0] + p[1] * s[1] + p[2] * s[2]);
    return [uv[0], uv[1], Math.min(...d), Math.max(...d)];
  });
}

/* pares (emisor, receptor) de mesas que PUEDEN tener sombra a cualquier θ */
export function pares(mesas, s, rho) {
  const K = proyectar(mesas, s), celdas = new Map(), cajas = [], cl = (a, b) => a * 1000003 + b;
  K.forEach(([a, b], i) => {
    const bx = [Math.min(a[0], b[0]) - rho, Math.max(a[0], b[0]) + rho, Math.min(a[1], b[1]) - rho, Math.max(a[1], b[1]) + rho];
    cajas.push(bx);
    for (let ca = Math.floor(bx[0] / G); ca <= Math.floor(bx[1] / G); ca++) for (let cb = Math.floor(bx[2] / G); cb <= Math.floor(bx[3] / G); cb++) {
      const k = cl(ca, cb); if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(i); }
  });
  const lim2 = (2 * rho) ** 2, out = [];
  K.forEach(([ar, br, dminr], r) => {
    const bx = cajas[r], vistos = new Set();
    for (let ca = Math.floor(bx[0] / G); ca <= Math.floor(bx[1] / G); ca++) for (let cb = Math.floor(bx[2] / G); cb <= Math.floor(bx[3] / G); cb++)
      for (const e of (celdas.get(cl(ca, cb)) || [])) {
        if (e === r || vistos.has(e)) continue; vistos.add(e);
        const [ae, be, , dmaxe] = K[e];
        if (!(dmaxe + rho > dminr - rho)) continue;
        if (distSeg2(ae, be, ar, br) <= lim2) out.push([e, r]);
      }
  });
  return out;
}
