"""El enumerador por ENVOLVENTE DE ROTACIÓN. Gemelo de audit5/lib_envolvente.mjs.

Una mesa, gire lo que gire, queda dentro del cilindro de radio ρ alrededor de su
eje (ρ = hypot(cuerda/2, z0 + canto) + margen, declarado en
bt3d_parametros.json). La proyección ortogonal en la vista del sol (el plano
⟂ ŝ) no alarga distancias, así que el cilindro proyectado queda dentro del
«estadio» = eje proyectado ⊕ disco ρ. CONDICIÓN NECESARIA de que E pueda
sombrear a R con ALGÚN par de θ:
  1. los estadios se tocan: distancia entre los ejes proyectados ≤ 2ρ;
  2. E tiene algún punto más cerca del sol que algún punto de R:
     max(ŝ·p_E) + ρ > min(ŝ·p_R) − ρ.
No es suficiente: da un SUPERCONJUNTO del grafo verdadero. Un grafo mayor
tiene anchura mayor o igual (la anchura es monótona por subgrafos), así que la
anchura que sale de aquí es una COTA SUPERIOR de la del problema.
El banco lo carea contra el motor a θ aleatorios (ningún par real puede faltar)
y con ρ encogido (tienen que empezar a faltar).
"""
import math

G = 4.0  # m: celda de la rejilla de la vista del sol (solo índice; no cambia el resultado)


def base_vista(s):
    ref = (0.0, 0.0, 1.0) if abs(s[2]) < 0.99 else (1.0, 0.0, 0.0)
    c = (s[1] * ref[2] - s[2] * ref[1], s[2] * ref[0] - s[0] * ref[2], s[0] * ref[1] - s[1] * ref[0])
    l = math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2])
    e1 = (c[0] / l, c[1] / l, c[2] / l)
    e2 = (s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0])
    return e1, e2


def _dist_pt_seg2(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 <= 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + t * dx - px, ay + t * dy - py
    return qx * qx + qy * qy


def _cruzan(a, b, c, d):
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return (o(a, b, c) > 0) != (o(a, b, d) > 0) and (o(c, d, a) > 0) != (o(c, d, b) > 0)


def dist_seg2(a, b, c, d):
    """distancia² entre los segmentos 2D ab y cd"""
    if _cruzan(a, b, c, d):
        return 0.0
    return min(_dist_pt_seg2(a[0], a[1], c[0], c[1], d[0], d[1]), _dist_pt_seg2(b[0], b[1], c[0], c[1], d[0], d[1]),
               _dist_pt_seg2(c[0], c[1], a[0], a[1], b[0], b[1]), _dist_pt_seg2(d[0], d[1], a[0], a[1], b[0], b[1]))


def proyectar(mesas, s):
    e1, e2 = base_vista(s)
    K = []
    for m in mesas:
        P = ((m['x'], m['n'][0], m['z'][0]), (m['x'], m['n'][1], m['z'][1]))
        uv = [(p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]) for p in P]
        d = [p[0] * s[0] + p[1] * s[1] + p[2] * s[2] for p in P]
        K.append((uv[0], uv[1], min(d), max(d)))
    return K


def pares(mesas, s, rho):
    """lista de (emisor, receptor) de mesas que PUEDEN tener sombra, a cualquier θ"""
    K = proyectar(mesas, s)
    celdas = {}
    cajas = []
    for i, (a, b, _, _) in enumerate(K):
        bx = (min(a[0], b[0]) - rho, max(a[0], b[0]) + rho, min(a[1], b[1]) - rho, max(a[1], b[1]) + rho)
        cajas.append(bx)
        for ca in range(math.floor(bx[0] / G), math.floor(bx[1] / G) + 1):
            for cb in range(math.floor(bx[2] / G), math.floor(bx[3] / G) + 1):
                celdas.setdefault((ca, cb), []).append(i)
    lim2 = (2 * rho) ** 2
    out = []
    for r, (ar, br, dminr, _) in enumerate(K):
        bx = cajas[r]
        vistos = set()
        for ca in range(math.floor(bx[0] / G), math.floor(bx[1] / G) + 1):
            for cb in range(math.floor(bx[2] / G), math.floor(bx[3] / G) + 1):
                for e in celdas.get((ca, cb), ()):
                    if e == r or e in vistos:
                        continue
                    vistos.add(e)
                    ae, be, _, dmaxe = K[e]
                    if not (dmaxe + rho > dminr - rho):
                        continue
                    if dist_seg2(ae, be, ar, br) <= lim2:
                        out.append((e, r))
    return out
