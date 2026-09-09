#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Las vigas que el topografo LEVANTO y el reparto no engancha a ningun tracker.

    python3 tools/vigas_sin_enganchar.py [planta]   -> vigas_sin_enganchar_<planta>.csv

DE DONDE SALE LA PREGUNTA. El levantamiento mide DOS PUNTOS POR MESA: van en
parejas a 0,4-0,9 m —cada una es una junta— separadas 18,4 o 36,8 m, que son
los largos de mesa de los dos tipos del plano. Cada viga se lleva cuatro (una
punta en cada extremo y las dos del morro), asi que los 18.289 puntos de San
Jose dan para 4.572 filas y se emiten 4.449: faltan 123.

Y NO FALTAN POR EL REPARTO. Los 535 puntos que se quedan sin asignar son, casi
punto por punto, las segundas vigas de los 132 trackers que acaban con una sola
viga medida (132 x 4 = 528). Esas vigas ESTAN levantadas; lo que pasa es que el
plano no las reconoce:

  · unas caen donde el layout no tiene ningun tracker —dentro del parque, en
    huecos, tipicamente a 6,2 m en x (una linea) y ~37 m en n (media viga) del
    tracker mas cercano—;
  · otras si tienen tracker, pero el TIPO no cuadra: el plano declara
    «completo» (mesas de 36,7 m) y lo medido son mesas de 18,4 m. Las dos vigas
    de un mismo tubo no pueden tener mesas de distinto largo, asi que esa linea
    no es la viga que el plano dice. TR-04_1-066 es el caso de manual: su linea
    E mide 74,47 m y cuadra, y la de al lado trae mesas de 18,35 y 19,49.

Este listado las saca EN UTM para poder cotejarlas contra el plano. No decide
nada ni cambia el reparto: un reparto no puede inventarse donde esta una viga.
"""
import csv, json, os, sys
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DX_FILA = 6.174
TOL_X = 3.0            # m; margen amplio, el eje del plano trae jitter
TOL_N = 40.0           # m; media viga: mas alla ya es otro tubo
CORTE_TIPO = 50.0      # m; por debajo, la viga es de las cortas («medio»)


def grupos_huerfanos(planta):
    A = json.load(open(os.path.join(RAIZ, planta + '_asbuilt.json')))
    cE, cN = A['meta']['cE'], A['meta']['cN']
    usados = set(json.load(open(os.path.join(RAIZ, planta + '_puntos.json')))['id'])
    P = []
    for r in csv.reader(open(os.path.join(RAIZ, planta + '_levantamiento.csv'), encoding='utf-8-sig')):
        if not r or not r[0].strip():
            continue
        pid = int(float(r[0]))
        if pid in usados:
            continue
        P.append((pid, float(r[1]) - cE, float(r[2]) - cN, float(r[3])))
    lin = defaultdict(list)
    for pid, x, n, z in P:
        lin[round(x / 1.5)].append((n, pid, x, z))
    out = []
    for v in lin.values():
        v.sort()
        # una viga son CUATRO puntas: tope, las dos del morro y tope. Un salto
        # de mas de 45 m ya es otro tubo (la mesa mas larga mide 36,8), pero
        # dentro de una tira de vigas huerfanas CONTIGUAS no hay tal salto: se
        # tocan en la junta, a 0,7 m. Si no se parte, dos vigas seguidas salen
        # como una de 149 m y tres como una de 224, y el listado dice que «no
        # cuadran con su tipo» cuando lo que pasa es que son varias.
        g, cur = [], [v[0]]
        for p in v[1:]:
            if p[0] - cur[-1][0] < 45:
                cur.append(p)
            else:
                g.append(cur); cur = [p]
        g.append(cur)
        for gg in g:
            for k in range(0, len(gg) - 3, 4):     # de cuatro en cuatro
                out.append(gg[k:k + 4])
    return out, cE, cN


def emite(planta='sanjose'):
    G, cE, cN = grupos_huerfanos(planta)
    TK = json.load(open(os.path.join(RAIZ, planta + '_layout.json')))['trackers']
    A = json.load(open(os.path.join(RAIZ, planta + '_asbuilt.json')))
    emit = defaultdict(list)
    for f in A['f']:
        if f.get('zs') is not None:
            emit[f.get('tk')].append(f['id'])
    filas = []
    for gg in G:
        xm = sum(p[2] for p in gg) / len(gg)
        n0, n1 = gg[0][0], gg[-1][0]
        nm, largo = (n0 + n1) / 2, n1 - n0
        medido = 'medio' if largo < CORTE_TIPO else 'completo'
        # QUIEN LA RECLAMA no es «el tracker mas cercano»: es aquel para el que
        # esa linea seria su viga E (su propia x) o su viga W (6,174 m al
        # oeste). Buscarlo por distancia mezclando x y n lleva al vecino de al
        # lado y hace pensar que el tipo no cuadra cuando lo que pasa es otra
        # cosa.
        due = [(t, 'E') for t in TK if abs(t['x'] - xm) <= TOL_X] + \
              [(t, 'W') for t in TK if abs(t['x'] - DX_FILA - xm) <= TOL_X]
        due = [(t, l) for t, l in due if abs(t['n'] - nm) <= TOL_N]
        if not due:
            t, lado, caso, plano = None, '', 'SIN TRACKER QUE LA RECLAME', ''
        else:
            t, lado = min(due, key=lambda p: abs(p[0]['n'] - nm))
            plano = t.get('t')
            if plano != medido:
                caso = 'EL PLANO LA DECLARA %s Y MIDE %s' % (plano.upper(), medido.upper())
            elif len(emit.get(t['id'], [])) >= 2:
                caso = 'su tracker ya tiene sus dos vigas'
            else:
                caso = 'cuadra con su tracker'
        # SU PAREJA: la viga que hay a 6,174 m a un lado u otro, a su misma
        # altura. Si ya esta asignada, el bifila real puede estar desplazado una
        # linea respecto del plano: el plano empareja (A,B) y el campo (B,C).
        par = ''
        for g in A['f']:
            if g.get('zs') is None or g.get('x') is None:
                continue
            if abs(abs(g['x'] - xm) - DX_FILA) < 1.5 and abs((-g['zs'] + -g['zn']) / 2 - nm) < 6:
                par = g['id']
                break
        # y donde cae respecto de los trackers que el plano SI pone en su linea
        enl = [t['n'] for t in TK if abs(t['x'] - xm) < 1.5 or abs(t['x'] - DX_FILA - xm) < 1.5]
        if not enl:
            sitio = 'su linea no existe en el plano'
        elif nm < min(enl) - TOL_N:
            sitio = 'mas al SUR del ultimo del plano'
        elif nm > max(enl) + TOL_N:
            sitio = 'mas al NORTE del ultimo del plano'
        else:
            sitio = 'en un hueco de su linea'
        filas.append({
            'caso': caso,
            'X_utm': '%.3f' % (xm + cE),
            'Y_utm_centro': '%.3f' % (nm + cN),
            'Y_utm_sur': '%.3f' % (n0 + cN),
            'Y_utm_norte': '%.3f' % (n1 + cN),
            'largo_m': '%.2f' % largo,
            'n_puntos': len(gg),
            'tipo_medido': medido,
            'tracker_que_la_reclama': t['id'] if t else '',
            'seria_su_viga': lado,
            'tipo_en_el_plano': plano,
            'filas_que_ya_tiene': len(emit.get(t['id'], [])) if t else 0,
            'dx_m': '%.2f' % ((xm - t['x']) if t else 0),
            'dn_m': '%.2f' % ((nm - t['n']) if t else 0),
            'pareja_a_6m_ya_asignada': par,
            'sitio_en_su_linea': sitio,
            'puntos': ' '.join(str(p[1]) for p in gg),
        })
    filas.sort(key=lambda f: (f['caso'], f['X_utm']))
    dst = os.path.join(RAIZ, 'vigas_sin_enganchar_' + planta + '.csv')
    with open(dst, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()), delimiter=';')
        w.writeheader()
        for f in filas:
            w.writerow(f)
    from collections import Counter
    c = Counter(f['caso'] for f in filas)
    print('%-8s %d viga(s) levantada(s) que el reparto no engancha:' % (planta, len(filas)))
    for k, v in c.most_common():
        print('           %-26s %3d' % (k, v))
    print('         -> %s' % os.path.basename(dst))
    return 0


if __name__ == '__main__':
    for p in (sys.argv[1:] or ['sanjose']):
        emite(p)
