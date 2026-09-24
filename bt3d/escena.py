"""La escena que escribe el lado JS (audit5/F0_escenas.mjs): mesas, unidades e
instantes con el rango del simulador por unidad. Se lee, no se reconstruye."""
import json
import os

DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'audit5', 'out', 'escenas')


def cargar(planta, dir_=DIR):
    with open(os.path.join(dir_, planta + '.json'), encoding='utf-8') as f:
        return json.load(f)


def aristas_unidades(escena, pares_mesa):
    """aristas dirigidas (emisor, receptor) entre UNIDADES distintas"""
    u = [m['u'] for m in escena['mesas']]
    return {(u[e], u[r]) for e, r in pares_mesa if u[e] != u[r]}


def alcances(escena, pares_mesa):
    """por mesa receptora: {su unidad} ∪ {unidades que la pueden sombrear}; solo
    las que tienen algún emisor de OTRA unidad"""
    u = [m['u'] for m in escena['mesas']]
    por = {}
    for e, r in pares_mesa:
        if u[e] != u[r]:
            por.setdefault(r, {u[r]}).add(u[e])
    return list(por.values())
