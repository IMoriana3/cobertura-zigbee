"""Banco de las cotas de anchura (bt3d/grafo.py). Sale 1 si falla.

    python3 -m bt3d.test_grafo

1 · grafos de anchura conocida: el intervalo la contiene y, donde se sabe que
    las heurísticas la alcanzan, es exacto.
2 · fuerza bruta: en 300 grafos aleatorios de 4 a 7 vértices, la anchura exacta
    (mínimo sobre TODOS los órdenes de eliminación) cae dentro de [inf, sup].
3 · CONTROL NEGATIVO: una «cota inferior» mutada (+1) tiene que salirse del
    intervalo en algún grafo de la fuerza bruta; si no, la comprobación 2 no
    protege.
"""
import itertools
import random
import sys

from . import grafo

ok = ko = 0


def t(nombre, cond, extra=''):
    global ok, ko
    if cond:
        ok += 1
        print('OK   ' + nombre + (' · ' + extra if extra else ''))
    else:
        ko += 1
        print('FAIL ' + nombre + (' -> ' + extra if extra else ''))


def exacta(n, aristas):
    adj0 = grafo.a_bitsets(n, aristas)
    mejor = n
    for orden in itertools.permutations(range(n)):
        adj, w = list(adj0), 0
        for v in orden:
            N = adj[v]
            w = max(w, bin(N).count('1'))
            if w >= mejor:
                break
            for u in grafo._bits(N):
                adj[u] = (adj[u] | N) & ~(1 << u) & ~(1 << v)
            adj[v] = 0
        mejor = min(mejor, w)
    return mejor


def intervalo(n, aristas):
    e = grafo.estructura(n, aristas)
    return (max([c['anchura_inf'] for c in e] or [0]), max([c['anchura_sup'] for c in e] or [0]))


conocidos = [
    ('camino de 10', 10, [(i, i + 1) for i in range(9)], 1, True),
    ('ciclo de 10', 10, [(i, (i + 1) % 10) for i in range(10)], 2, True),
    ('K6', 6, list(itertools.combinations(range(6), 2)), 5, True),
    ('estrella de 12', 12, [(0, i) for i in range(1, 12)], 1, True),
    ('rejilla 5×5', 25, [(r * 5 + c, r * 5 + c + 1) for r in range(5) for c in range(4)] + [(r * 5 + c, (r + 1) * 5 + c) for r in range(4) for c in range(5)], 5, False),
    ('K3,3', 6, [(a, b) for a in range(3) for b in range(3, 6)], 3, True),
]
for nombre, n, ar, tw, exacto in conocidos:
    lo, hi = intervalo(n, ar)
    t('1 · %s: anchura %d dentro de [%d, %d]%s' % (nombre, tw, lo, hi, ' y exacta' if exacto else ''),
      lo <= tw <= hi and (not exacto or lo == hi == tw))

random.seed(20260924)
casos, dentro, exactos, mutada_fuera = 0, 0, 0, 0
for _ in range(300):
    n = random.randint(4, 7)
    p = random.random()
    ar = [(a, b) for a, b in itertools.combinations(range(n), 2) if random.random() < p]
    tw = exacta(n, ar)
    lo, hi = intervalo(n, ar)
    casos += 1
    dentro += lo <= tw <= hi
    exactos += lo == hi
    mutada_fuera += not (lo + 1 <= tw)
t('2 · fuerza bruta: la anchura exacta cae en [inf, sup] en %d de %d grafos' % (dentro, casos), dentro == casos,
  '%d con intervalo cerrado (inf = sup)' % exactos)
t('3 · CONTROL NEGATIVO: con la cota inferior +1 se sale en %d grafos' % mutada_fuera, mutada_fuera > 0)
print('\n%d OK · %d FAIL' % (ok, ko))
sys.exit(1 if ko else 0)
