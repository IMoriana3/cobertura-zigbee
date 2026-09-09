#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trae la NUBE DE PUNTOS del levantamiento a <planta>_puntos.json.

POR QUE HACE FALTA. Hasta ahora la cadena entraba por <planta>_asbuilt.json,
que ya es un dato COCINADO: una fila con dos cotas (ys, yn) por extremo. Con
eso, un punto de campo con otra referencia vertical solo se nota a medias: si
solo uno de los dos extremos esta contaminado, el salto de 36,6 m se diluye a
18,3 m en la media de la fila. El levantamiento crudo son 4 puntos por fila
(los dos extremos de cada una de sus dos mesas) CON SU Z ABSOLUTA, y ahi el
salto se ve entero y se puede senalar el PUNTO — que es lo que se le reclama
al topografo, no la fila.

ORIGEN. El visor de as-built (github.com/IMoriana3/visores, asbuilt/data/) es
quien publica esa nube ya casada con la fila. Este script la copia a un JSON
propio para que la cadena de cotas NO dependa de un repositorio externo en
tiempo de ejecucion: se importa una vez, se versiona, y queda el campo
`origen` diciendo de donde salio.

Uso:
    python3 tools/importa_puntos.py <ruta_al_repo_visores> [planta ...]
    python3 tools/importa_puntos.py ~/visores ayora sanjose
"""
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lee_visor(ruta, planta):
    """Lee asbuilt/data/<planta>.js del repo de visores (window.DATA = {...})."""
    f = os.path.join(ruta, 'asbuilt', 'data', planta + '.js')
    if not os.path.exists(f):
        f = os.path.join(ruta, 'data', planta + '.js')       # por si apuntan a asbuilt/
    if not os.path.exists(f):
        return None, None
    txt = open(f, encoding='utf-8').read()
    d = json.loads(txt[txt.index('=') + 1:].strip().rstrip(';'))
    return d, f


def importa(ruta, planta):
    d, orig = lee_visor(ruta, planta)
    if d is None:
        print('%-8s sin nube de puntos en %s' % (planta, ruta))
        return None
    P, F = d['p'], d['f']
    n = len(P['id'])

    # la fila se guarda por su ID de proveedor, no por indice: asi el fichero
    # se une con <planta>_asbuilt.json sin depender del orden del visor
    filas = F['id']
    idx = {}
    for i, fid in enumerate(filas):
        idx.setdefault(fid, i)

    out = {
        'planta': planta,
        'n': n,
        'origen': 'IMoriana3/visores · ' + os.path.relpath(orig, ruta),
        'nota': ('Nube CRUDA del levantamiento. x/y son UTM absolutas del huso de '
                 'la planta; z es la cota ABSOLUTA medida (no relativa a base). '
                 'Cada fila trae los extremos de sus dos mesas: 4 puntos por fila.'),
        'filas': filas,
        'id': P['id'],
        'x': [round(v, 3) for v in P['x']],
        'y': [round(v, 3) for v in P['y']],
        'z': [round(v, 3) for v in P['z']],
        'fi': P['f'],
    }
    dst = os.path.join(RAIZ, planta + '_puntos.json')
    with open(dst, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print('%-8s -> %s  (%d KB · %d puntos · %d filas · z %.1f a %.1f m)'
          % (planta, os.path.basename(dst), os.path.getsize(dst) // 1024, n, len(filas),
             min(out['z']), max(out['z'])))
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    ruta = os.path.expanduser(sys.argv[1])
    for p in (sys.argv[2:] or ['ayora', 'sanjose']):
        importa(ruta, p)
