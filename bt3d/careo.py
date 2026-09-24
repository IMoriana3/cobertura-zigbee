"""Salidas para el careo con el lado JS (audit5/test_parametros.mjs).

    python3 -m bt3d.careo rangos <planta> [signo] [pagina|bt3d]
        → máx |Δ| contra los rangos de la escena: 'pagina' (defecto) contra los del
          simulador tal cual con la copia exacta; 'bt3d' contra los del BT3D (cono
          de la fórmula del comentario, acimut en el marco de la planta)
    python3 -m bt3d.careo pares <planta>            → por instante: nº de pares y huella sha1 de la lista ordenada
"""
import hashlib
import sys

from . import envolvente, escena, parametros, sol


def rangos(planta, signo=-1, cual='pagina'):
    P, E = parametros.cargar(), escena.cargar(planta)
    par = parametros.resolver(P, planta, [u['id'] for u in E['unidades']])
    peor, n = 0.0, 0
    for q in E['instantes']:
        az = q['az'] if cual == 'pagina' else q['az_malla']
        clave = 'rangos_pagina' if cual == 'pagina' else 'rangos'
        formula = 'pagina' if cual == 'pagina' else par[0]['cono_haz']
        for k, u in enumerate(E['unidades']):
            p = par[k]
            r = sol.rango_haz(q['zen'], az, p['theta_max'], p['axis_az'], u['tilt'], u['pendiente'],
                              p['aoi_haz'], p['margen_rango'], signo, formula)
            peor = max(peor, abs(r[0] - q[clave][k][0]), abs(r[1] - q[clave][k][1]))
            n += 1
    return peor, n


def huella(pares):
    txt = ';'.join('%d,%d' % p for p in sorted(pares))
    return hashlib.sha1(txt.encode()).hexdigest()[:16]


def pares(planta):
    P, E = parametros.cargar(), escena.cargar(planta)
    rho = parametros.rho(P, planta)
    for i, q in enumerate(E['instantes']):
        pm = envolvente.pares(E['mesas'], sol.vector_sol(q['zen'], q['az_malla']), rho)
        print('%d %d %s' % (i, len(pm), huella(pm)))


if __name__ == '__main__':
    if sys.argv[1] == 'rangos':
        peor, n = rangos(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else -1, sys.argv[4] if len(sys.argv) > 4 else 'pagina')
        print('%.3e %d' % (peor, n))
    else:
        pares(sys.argv[2])
