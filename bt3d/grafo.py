"""Estructura del grafo de UNIDADES: quién puede sombrear a quién, componentes
y su ANCHURA (anchura de árbol, treewidth).

La anchura no se calcula exacta: se da un intervalo [inferior, superior].
  · superior: el mejor de dos órdenes de eliminación voraces (grado mínimo y
    relleno mínimo). Cualquier orden de eliminación da una descomposición en
    árbol de esa anchura, así que es una cota superior VÁLIDA, y es la que
    usaría la programación dinámica.
  · inferior: MMD+ (anchura mínima de menores, contrayendo con el vecino de grado
    mínimo). La anchura de árbol no baja al tomar menores y es ≥ el grado
    mínimo de cualquier menor, así que es una cota inferior VÁLIDA.
Cuando coinciden, la anchura es exacta. Los conjuntos van como enteros-bitset.
"""


def moral(hiperaristas):
    """aristas del grafo MORAL: cada hiperarista (el alcance de un término de la
    función objetivo) se vuelve un clique. La pérdida de una mesa receptora
    depende a la vez de su unidad y de TODAS las unidades que la pueden
    sombrear (unión de sombras, no suma), y una descomposición en árbol válida
    para la programación dinámica tiene que meter ese alcance entero en una
    bolsa: la anchura que decide es la del grafo moral, no la del de pares."""
    ar = set()
    for h in hiperaristas:
        h = sorted(set(h))
        for i in range(len(h)):
            for j in range(i + 1, len(h)):
                ar.add((h[i], h[j]))
    return ar


def a_bitsets(n, aristas):
    adj = [0] * n
    for a, b in aristas:
        if a != b:
            adj[a] |= 1 << b
            adj[b] |= 1 << a
    return adj


def componentes(n, adj):
    visto, comps = 0, []
    for v in range(n):
        if visto >> v & 1:
            continue
        comp, frente = 1 << v, 1 << v
        while frente:
            nuevo = 0
            f = frente
            while f:
                low = f & -f
                nuevo |= adj[low.bit_length() - 1]
                f ^= low
            frente = nuevo & ~comp
            comp |= frente
        visto |= comp
        comps.append(comp)
    return comps


def _bits(x):
    while x:
        low = x & -x
        yield low.bit_length() - 1
        x ^= low


def _sub(adj, comp):
    idx = list(_bits(comp))
    pos = {v: k for k, v in enumerate(idx)}
    out = []
    for v in idx:
        m = 0
        for u in _bits(adj[v] & comp):
            m |= 1 << pos[u]
        out.append(m)
    return out


def _relleno(adj, v):
    N = adj[v]
    f = 0
    for u in _bits(N):
        f += bin(N & ~adj[u] & ~(1 << u)).count('1')
    return f // 2


def cota_superior(adj0, criterio):
    """anchura del orden voraz ('grado' o 'relleno'); adj0 es de UNA componente"""
    adj = list(adj0)
    vivos = (1 << len(adj)) - 1
    ancho = 0
    fill = [_relleno(adj, v) for v in range(len(adj))] if criterio == 'relleno' else None
    while vivos:
        if criterio == 'grado':
            v = min(_bits(vivos), key=lambda x: bin(adj[x]).count('1'))
        else:
            v = min(_bits(vivos), key=lambda x: (fill[x], bin(adj[x]).count('1')))
        N = adj[v]
        ancho = max(ancho, bin(N).count('1'))
        for u in _bits(N):
            adj[u] = (adj[u] | N) & ~(1 << u) & ~(1 << v)
        adj[v] = 0
        vivos &= ~(1 << v)
        if fill is not None:
            toca = N
            for u in _bits(N):
                toca |= adj[u]
            for u in _bits(toca & vivos):
                fill[u] = _relleno(adj, u)
    return ancho


def cota_inferior(adj0):
    """MMD+ con contracción al vecino de grado mínimo"""
    adj = list(adj0)
    vivos = (1 << len(adj)) - 1
    lb = 0
    while bin(vivos).count('1') >= 2:
        v = min(_bits(vivos), key=lambda x: bin(adj[x]).count('1'))
        dv = bin(adj[v]).count('1')
        lb = max(lb, dv)
        if dv == 0:
            vivos &= ~(1 << v)
            continue
        u = min(_bits(adj[v]), key=lambda x: bin(adj[x]).count('1'))
        Nv = adj[v] & ~(1 << u)
        adj[u] = (adj[u] | Nv) & ~(1 << v) & ~(1 << u)
        for w in _bits(Nv):
            adj[w] = (adj[w] & ~(1 << v)) | (1 << u)
        for w in _bits(adj[u]):
            adj[w] &= ~(1 << v)
        adj[v] = 0
        vivos &= ~(1 << v)
    return lb


def anchura(adj_comp, relleno=True):
    """(inferior, superior) de la anchura de árbol de una componente"""
    if len(adj_comp) <= 1:
        return 0, 0
    sup = cota_superior(adj_comp, 'grado')
    if relleno:
        sup = min(sup, cota_superior(adj_comp, 'relleno'))
    return cota_inferior(adj_comp), sup


def estructura(n, aristas, relleno=True):
    """componentes (≥2 unidades) con su tamaño y su intervalo de anchura"""
    adj = a_bitsets(n, aristas)
    out = []
    for c in componentes(n, adj):
        k = bin(c).count('1')
        if k < 2:
            continue
        lo, hi = anchura(_sub(adj, c), relleno)
        out.append({'unidades': k, 'anchura_inf': lo, 'anchura_sup': hi})
    return out
