#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lista de RECLAMACION al topografo: los puntos con otra referencia vertical.

    python3 tools/reclama_referencia.py [planta ...]     -> reclamacion_<planta>.csv

QUE SE RECLAMA Y POR QUE ESTO ES UNA LISTA, NO UN INFORME. El control de
cotas descarta las filas contaminadas para poder seguir simulando, pero eso
es una tirita: el dato malo sigue en el levantamiento del proveedor y volvera
en la proxima entrega. Lo que cierra el asunto es devolverle los PUNTOS con
su id, su coordenada y la cota que deberian tener, para que los reprocese.

DOS COSAS QUE ESTA LISTA DICE Y EL CONTROL DE COTAS NO:

  · Sale TODO lo contaminado, no solo lo que llega al simulador. En San Jose
    hay 54 filas afectadas pero solo 12 sobreviven a la asignacion: las otras
    42 se cayeron antes por otros motivos. Que no nos estorben hoy no las hace
    buenas — al topografo hay que devolverselas igual.

  · Dice el ALCANCE. Lo que cambia de referencia es una MESA entera (una
    sesion de campo), no un punto suelto: en TR-09_1-044-E la mesa sur esta a
    1531,7 m y la norte a 1568,7, 36,7 m de salto en el mismo tubo. Con la
    mesa senalada, el proveedor sabe que reprocesar.

La cota esperada es la mediana de los puntos de los seguidores de al lado a
la MISMA coordenada norte — el mismo criterio que usa el control de cotas, y
por el mismo motivo: el relieve real es solidario entre vecinos y se cancela;
un cambio de referencia, no.
"""
import csv
import json
import os
import sys
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cotas_asbuilt import puntos_con_otra_referencia   # noqa: E402  (mismo criterio, una sola vez)


def reclama(planta, umbral=3.0, dy=3.0, dx=60.0):
    r = puntos_con_otra_referencia(planta, umbral, dy, dx)
    if r is None:
        print('%-8s sin nube de puntos (falta %s_puntos.json)' % (planta, planta))
        return
    pmal, _, _, n_por_fila = r
    if not pmal:
        print('%-8s nada que reclamar: ningun punto se aparta de sus laterales' % planta)
        return

    D = json.load(open(os.path.join(RAIZ, planta + '_puntos.json')))
    X, Y, Z, FI, ID, FIL = D['x'], D['y'], D['z'], D['fi'], D['id'], D['filas']
    pos = {ID[i]: i for i in range(len(ID))}

    # ¿que filas llegan de verdad al simulador?
    asb = os.path.join(RAIZ, planta + '_asbuilt.json')
    llegan = set()
    if os.path.exists(asb):
        llegan = {f['id'] for f in json.load(open(asb))['f']}

    filas = []
    for fid in sorted(pmal):
        m = pmal[fid]
        alcance = 'fila entera' if len(m) >= n_por_fila.get(fid, 0) else 'media fila (una mesa)'
        for pid, des in sorted(m):
            i = pos[pid]
            filas.append({
                'fila': fid,
                'punto': pid,
                'X': '%.3f' % X[i],
                'Y': '%.3f' % Y[i],
                'Z_entregada': '%.3f' % Z[i],
                'Z_esperada': '%.3f' % (Z[i] - des),
                'desvio_m': '%+.2f' % des,
                'alcance': alcance,
                'llega_al_modelo': 'si' if fid in llegan else 'no (descartada antes en la asignacion)',
            })

    dst = os.path.join(RAIZ, 'reclamacion_' + planta + '.csv')
    with open(dst, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()), delimiter=';')
        w.writeheader()
        for f in filas:
            w.writerow(f)

    des = [float(f['desvio_m']) for f in filas]
    med = sorted(des)[len(des) // 2]
    n_ll = len({f['fila'] for f in filas if f['llega_al_modelo'] == 'si'})
    print('%-8s -> %s' % (planta, os.path.basename(dst)))
    print('         %d puntos en %d filas · desvio mediana %+.2f m · min %+.2f / max %+.2f · %d positivos de %d'
          % (len(filas), len(pmal), med, min(des), max(des), sum(1 for d in des if d > 0), len(des)))
    print('         de esas filas, %d llegan al modelo hoy y %d se caian antes (hay que reclamarlas igual)'
          % (n_ll, len(pmal) - n_ll))
    if all(d > 0 for d in des) and (max(des) - min(des)) < 3:
        print('         TODOS del mismo signo y en una banda de %.2f m: es un CAMBIO DE REFERENCIA, no ruido de campo'
              % (max(des) - min(des)))


if __name__ == '__main__':
    for p in (sys.argv[1:] or ['ayora', 'sanjose']):
        reclama(p)
