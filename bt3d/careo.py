"""Salidas para el careo con el lado JS (audit5/test_parametros.mjs).

    python3 -m bt3d.careo rangos <planta> [signo]   → máx |Δ| contra los rangos del simulador en la escena
    python3 -m bt3d.careo pares <planta>            → por instante: nº de pares y huella sha1 de la lista ordenada
"""
import hashlib
import sys

from . import envolvente, escena, parametros, sol


def rangos(planta, signo=-1):
    P, E = parametros.cargar(), escena.cargar(planta)
    par = parametros.resolver(P, planta, [u['id'] for u in E['unidades']])
    peor, n = 0.0, 0
    for q in E['instantes']:
        for k, u in enumerate(E['unidades']):
            p = par[k]
            r = sol.rango_haz(q['zen'], q['az'], p['theta_max'], p['axis_az'], u['tilt'], u['pendiente'],
                              p['aoi_haz'], p['margen_rango'], signo)
            peor = max(peor, abs(r[0] - q['rangos'][k][0]), abs(r[1] - q['rangos'][k][1]))
            n += 1
    return peor, n


def huella(pares):
    txt = ';'.join('%d,%d' % p for p in sorted(pares))
    return hashlib.sha1(txt.encode()).hexdigest()[:16]


def pares(planta):
    P, E = parametros.cargar(), escena.cargar(planta)
    rho = parametros.rho(P, planta)
    for i, q in enumerate(E['instantes']):
        pm = envolvente.pares(E['mesas'], sol.vector_sol(q['zen'], q['az']), rho)
        print('%d %d %s' % (i, len(pm), huella(pm)))


if __name__ == '__main__':
    if sys.argv[1] == 'rangos':
        peor, n = rangos(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else -1)
        print('%.3e %d' % (peor, n))
    else:
        pares(sys.argv[2])
