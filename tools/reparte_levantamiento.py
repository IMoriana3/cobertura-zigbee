#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparte el levantamiento CRUDO entre las filas del plano y emite el as-built.

    python3 tools/reparte_levantamiento.py [planta]        (por defecto sanjose)

    entra:  <planta>_levantamiento.csv   (id,X,Y,Z del topografo, sin tocar)
            <planta>_layout.json         (el plano: x, n e id de cada tracker)
    sale:   <planta>_asbuilt.json

POR QUE SE REHACE. La asignacion que veniamos usando venia de fuera y tenia 93
trackers con puntos IMPOSIBLES: hasta 1.575 m de dispersion, y uno con 44
puntos repartidos un kilometro en Y con solo 0,5 m en X — una COLUMNA entera de
un eje colgada de un solo tracker (ver tools/audita_asignacion.py). El dato del
topografo estaba intacto; lo que fallaba era de quien se decia que era cada
punto.

LA GEOMETRIA NO SE SUPONE, SE MIDE. Sobre los trackers cuya asignacion vieja SI
era sana sale, muy apretada:

    fila E : en la x del tracker            (mediana -0,004 m, p5/p95 +-0,11)
    fila W : 6,174 m al ESTE en San Jose    (el LADO no es fijo: ver abajo)
    centro de la fila = n del tracker       (mediana -0,038 m)
    largo de fila                           74,43 m (p5 74,30 · p95 74,63)

EL LADO DE LA SEGUNDA VIGA ERA UNA SUPOSICION, Y ESTABA AL REVES. Iba fija al
oeste, y en San Jose la x del plano es la viga OESTE del bifila: la pareja cae
al ESTE. Buscarla al otro lado no da con un hueco vacio —hay una linea cada
6,2 m—, da con los puntos del tubo de al lado, asi que cada fila -W se armaba
con la linea del vecino. Se veia en los bordes de cada bloque, que es donde la
cadena desplazada deja de cerrar: 535 puntos que nadie reclamaba y 29 filas de
largo imposible (37,5 m declarando 32 modulos; TR-09_2-036-W media 0,80 m, que
son los dos lados de una junta tomados por los dos extremos de una viga).

Ahora lo deciden los MORROS, que es el rasgo que distingue una linea de su
vecina: las dos vigas de un tubo lo tienen a la misma n, la que el plano
declara como centro, asi que se cuenta a cuantos centros les corresponde un
morro a cada lado. Y se decide PARA LA PLANTA ENTERA, porque el lado esta
encadenado —la linea que un eje deja libre es la que necesita su vecino—: las
dos respuestas coherentes son todas al este o todas al oeste, y mezclar es
peor que cualquiera de las dos. Medido en San Jose:

                              lado fijo al oeste   por eje    todas al ESTE
    filas emitidas                     4.449         4.059         4.572
    puntos sin repartir                  535         2.174             3
    trackers con las dos vigas         2.162         1.771         2.285
    filas fuera por largo                 29             5             0

    4.572 es exactamente 18.289/4: cada fila se lleva sus cuatro puntas y
    quedan tres puntos sueltos en toda la planta.

REPARTO POR NODOS, y hubo que llegar hasta ahi. Tres intentos, medidos:

  · tracker mas cercano al punto -> 33 % de filas completas. Un tracker mide
    74 m: su CENTRO no es buen juez, y un punto de la punta cae mas cerca del
    centro del de al lado.
  · centro de FILA mas cercano   -> 90 %. Los puntos de punta se van a la fila
    vecina cuando el paso entre tubos no es exacto: 222 filas con 5 puntos y
    217 con 3, y en 176 casos la de 5 tenia pegada la de 3 en el mismo eje.
  · cupo de 4 por distancia      -> 98,7 %, pero encoge 17 filas SANAS a 38 m:
    coge los DOS puntos del tope norte y deja fuera el sur.
  · POR NODOS                    -> 99,4 %, y de las 4.143 filas que ya
    existian solo UNA cambia de extremo.

La clave es que los puntos no estan sueltos: van en NODOS de dos, y el tipo de
nodo se ve en su separacion (junta ~0,9 m dentro del tubo, tope ~0,2 m entre
tubos). El nodo de junta cae en la n declarada del tracker y da la FASE.

LA FASE SE RESUELVE POR LINEA, NO TRACKER A TRACKER. Anclando cada tracker a su
nodo mas cercano con una ventana de 5 m se caian 125 filas enteras, y con ellas
153 trackers se quedaban con una sola viga. No era que faltara el levantamiento:
es que HAY LINEAS DESPLAZADAS respecto de lo que el plano declara para ese
tracker. Medido en el bloque norte de x 1162-1206:

    linea x=1186,95   nodos -1052,1 -1014,6 -977,1 -939,5 ...
    linea x=1193,15   nodos -1045,2 -1007,6 -970,0 -932,6 ...   (7,0 m al norte)

Las ocho lineas de ese bloque cuadran con las vigas del plano en X hasta 2 cm
(paso 6,20 medido contra 6,174 nominal), asi que el emparejamiento E/W es bueno;
lo que cambia es donde empiezan los tubos. La frontera del subbloque cae en
campo entre las lineas 1186,95 y 1193,15, y en el plano entre los trackers
1180,7 y 1193,1: una viga de diferencia. La viga W del tracker 1193,1 esta,
fisicamente, con los tubos del subbloque de al lado.

Asi que el desfase se estima POR LINEA y en local: la mediana del desvio
nodo-centro de las filas del plano que caen a menos de 150 m sobre esa misma
linea. Una fila sola no puede decidirlo —si le falta su nodo de junta, su nodo
mas cercano es un tope y miente en 18,7 o 37,5 m—; el vecindario si.

Y EL SEMIPASO LO DA EL PLANO, NO LA LINEA. Un intento anterior ajustaba una
reticula unica por linea (paso 37,5) y hundia el resultado a 4.228 filas: San
Jose tiene 98 seguidores «medio», de 37,2 m, cuyos topes estan a 18,6 m del
centro y no a 37,2. El tipo del tracker ya dice cuanto mide, asi que los topes
se buscan donde tienen que estar: en centro +- L/2 del tipo declarado.

Y UN TOPE CON UN SOLO PUNTO ES DE LOS DOS TUBOS. Con la fase ya resuelta se
caian 18 filas SANAS de 74,4 m: en su tope solo se habia medido UN punto, y la
exclusividad se lo daba al primero que pasara, dejando al vecino con 3 puntas y
37 m. Ese punto es la FRONTERA entre los dos tubos, o sea el extremo de los dos.
Se comparte solo en ese caso (1 punto de 17.755 en San Jose).

    filas del as-built              4.415 -> 4.449
    trackers con las dos vigas      2.128 -> 2.162
    trackers con una sola viga        159 ->   125
    filas preexistentes que cambian           0 de 4.415

Tres filas que el control de largo tiraba por medir la mitad vuelven enteras:
TR-05_2-060-W de 37,74 m a 74,61, TR-08_1-094-W de 37,65 a 75,17 y
TR-10_2-002-W de 55,93 a 75,06 — el «los trackers no llegan a sus extremos».

BARRIDO DE LAS CUATRO VENTANAS (D_MAX 8/12/16, radio 80/150/300 m, TOL_J/TOL_T
4-6/5-6/6-8, 27 combinaciones): el as-built sale entre 4.444 y 4.460 filas, un
0,4 % de recorrido, y las tres filas que cambian son las mismas en todas. D_MAX
se deja en 12 y no en 16 —que da 8 filas mas— porque 18,7 m es media mesa: por
encima de eso un TOPE puede hacerse pasar por junta y envenenar la mediana de la
linea, y a 20 m el resultado ya se da la vuelta (4.451). El limite se pone
dentro de la banda donde el discriminante no puede equivocarse, no donde sale el
numero mas alto.

LO QUE ESTE GENERADOR NO SABE HACER, Y NO FINGE. Los vectores transversales
cse/cso/ase/aso del as-built vienen de una derivacion que no esta en este
repositorio: ni la pendiente a la fila de al lado a un vano, ni a dos, ni el
so/se que publica el visor los reproducen (error mediano de 0,2 a 4,8 pp). Asi
que NO se inventan: se ARRASTRAN por id de fila desde el as-built anterior, y
las filas recuperadas los llevan a null — que es un estado que la cadena ya
maneja (el as-built viejo ya tenia 247 filas asi). Queda declarado en el meta.
Emitir esos cuatro numeros con una regla adivinada cambiaria en silencio la
ficha de registros TCU, que es lo que se le entrega al cliente.
"""
import bisect
import collections
import csv
import json
import os
import statistics
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DX_FILA = 6.174        # m; la fila W va al oeste de la x del tracker
TOL_X = 1.5            # m; ruido de campo contra un eje (las filas van a 6,17)
D_MAX = 12.0           # m; desvio nodo-centro que aun puede ser desfase de linea
R_VEC = 150.0          # m; vecindario sobre la linea que vota el desfase (~2 tubos)
TOL_J = 5.0            # m; ventana del nodo de junta, ya en el marco corregido
TOL_T = 6.0            # m; ventana de cada tope alrededor de centro +- L/2
LARGO_AVISO = 1.5      # m; se aparta de su tipo mas de esto: se avisa
# Mas de DOS MODULOS de mas o de menos y esa fila ya no describe a su tracker:
# emitirla mete en el modelo una mesa estirada o encogida —el render le cuelga
# 32 modulos en 33 m, y el string sale con otro largo—, y para eso ya esta la
# reconstruccion del plano, que es geometria correcta y va MARCADA (est=1).
# Este control sustituye al corte por FRACCION del largo nominal: es el mismo
# criterio, mas fino y con nombre y apellidos de cada fila que se cae.
LARGO_FUERA = 3.0


def lee_puntos(planta, cE, cN, base):
    f = os.path.join(RAIZ, planta + '_levantamiento.csv')
    P = []
    for r in csv.reader(open(f, encoding='utf-8-sig')):
        if not r or not r[0].strip():
            continue
        try:
            P.append((int(float(r[0])), float(r[1]) - cE, float(r[2]) - cN, float(r[3]) - base))
        except (ValueError, IndexError):
            continue
    return P


def lado_de_la_hermana(P, TK, dx=DX_FILA):
    """A que lado del eje del plano esta la SEGUNDA viga de cada tubo.

    Iba fija al oeste (`t['x'] - DX_FILA`), y en San Jose eso es falso en 90 de
    los 307 ejes: alli la x del plano es la viga OESTE del bifila y su pareja
    esta al ESTE. Buscarla en la linea equivocada no encuentra un hueco vacio
    —la implantacion tiene una linea cada 6,2 m—, encuentra los puntos de OTROS
    tubos, y de ahi salen las filas imposibles que luego tira el control de
    largo: 37,5 m declarando 32 modulos (media fila), o los 0,80 m de
    TR-09_2-036-W, que son los dos lados de una junta tomados por los dos
    extremos de una viga. Con la fila se va su tracker a reconstruido.

    LO QUE LO DELATA, Y POR QUE SE VOTA POR EJE. El MORRO: las dos vigas de un
    tubo lo tienen a la misma n, la que el plano declara como centro. Asi que la
    linea hermana es la que trae un nodo de dos puntos en la n de cada tracker.
    Tracker a tracker eso no decide —en una linea de tubos alineados las dos
    vecinas tienen nodos en esas mismas n—, pero un EJE lleva varios tubos y la
    pregunta se contesta a la vez para todos: se cuenta en cada lado a cuantos
    de sus centros les corresponde un morro, y gana el que mas acierte. Con 4 o
    20 tubos votando, la respuesta es firme donde la hay.

    Ejemplo medido: la linea x=-360,03 tiene 16 puntos cuyos morros caen en
    779,57 · 854,62 · 929,68 · 1004,87, que son los cuatro centros que el plano
    declara en x=-366,20 (779,50 · 854,60 · 929,70 · 1004,80). Es su viga este,
    y el reparto no la miraba: 16 puntos sin dueño y 4 tubos a medias.

    EL EMPATE SE QUEDA COMO ESTA. Donde los dos lados aciertan lo mismo (213
    ejes) no hay evidencia para mover nada, y la convencion de la planta es el
    oeste: esto solo mueve al eje que tiene una razon medida para moverse.
    """
    lin = agrupa_lineas([(x, n) for _, x, n, _ in P])
    LX = [sum(q[0] for q in g) / len(g) for g in lin]
    MOR = []
    for g in lin:
        v, nd, j = sorted(q[1] for q in g), [], 0
        while j < len(v):
            if j + 1 < len(v) and v[j + 1] - v[j] <= 1.5:
                nd.append((v[j] + v[j + 1]) / 2); j += 2
            else:
                j += 1
        MOR.append(nd)

    def linea_de(x):
        j = bisect.bisect_left(LX, x)
        c = [k for k in (j - 1, j) if 0 <= k < len(LX) and abs(LX[k] - x) <= TOL_X]
        return min(c, key=lambda k: abs(LX[k] - x)) if c else None

    def aciertos(li, ns):
        if li is None or not MOR[li]:
            return 0
        v, c = MOR[li], 0
        for n0 in ns:
            j = bisect.bisect_left(v, n0 - 1.5)
            if j < len(v) and v[j] <= n0 + 1.5:
                c += 1
        return c

    ejes = collections.defaultdict(list)
    for t in TK:
        ejes[round(t['x'], 2)].append(t)
    ks = sorted(ejes)
    grupos, cur = [], [ks[0]]
    for k in ks[1:]:
        if k - cur[-1] <= TOL_X:
            cur.append(k)
        else:
            grupos.append(cur); cur = [k]
    grupos.append(cur)

    # Y LA DECISION ES DE LA PLANTA ENTERA, no de cada eje. El lado esta
    # ENCADENADO: si un eje se lleva su hermana al este, la linea que deja
    # libre al oeste es justo la que su vecino necesita, asi que las dos
    # respuestas coherentes son «todas al oeste» o «todas al este», y mezclar
    # es lo peor de los dos mundos. Medido en San Jose, decidiendo eje a eje:
    # 4.059 filas y 2.174 puntos sin repartir, contra 4.449 dejandolo como
    # estaba. Con la planta entera al este: 4.572 filas y 3 puntos sin
    # repartir. Asi que se suman los votos de todos los ejes y se elige un
    # solo lado, y el empate se queda al oeste, que es como estaba.
    vo = ve = 0
    for g in grupos:
        ts = [t for k in g for t in ejes[k]]
        x0 = statistics.fmean([t['x'] for t in ts])
        ns = [t['n'] for t in ts]
        vo += aciertos(linea_de(x0 - dx), ns)
        ve += aciertos(linea_de(x0 + dx), ns)
    al_este = ve > vo
    lado = {t['id']: (+dx if al_este else -dx) for t in TK}
    return lado, (vo, ve)


def agrupa_lineas(pts, tol=TOL_X):
    """Los puntos, en LINEAS: cada eje de viga de la implantacion."""
    v = sorted(pts)
    out, cur = [], [v[0]]
    for p in v[1:]:
        if p[0] - cur[-1][0] <= tol:
            cur.append(p)
        else:
            out.append(cur); cur = [p]
    out.append(cur)
    return out


def reparte(planta='sanjose'):
    lay = json.load(open(os.path.join(RAIZ, planta + '_layout.json')))
    viejo = os.path.join(RAIZ, planta + '_asbuilt.json')
    if not os.path.exists(viejo):
        print('hace falta %s_asbuilt.json para heredar meta y vectores TCU' % planta)
        return 1
    A = json.load(open(viejo))
    M = dict(A['meta'])
    cE, cN, base = M['cE'], M['cN'], M['base']
    P = lee_puntos(planta, cE, cN, base)
    TK = lay['trackers']

    # ── ejes de fila, del plano ──────────────────────────────────────────────
    # El LARGO NOMINAL sale del tipo declarado, con la misma formula que usa
    # cotas_asbuilt.py. Es lo que dice donde tienen que estar los topes: a L/2
    # del centro. Sin el, los 98 seguidores «medio» (37,2 m) se buscan los topes
    # a 37 m y no los encuentran.
    w, gm, gd = M.get('modW') or 0.0, M.get('gapMod', 0.0), M.get('gapDrive', 0.0)
    nom = lambda m: 2 * m * w + (2 * m - 2) * gm + gd
    LARGO = {'completo': nom(32), 'medio': nom(16)} if w else {}
    LARGO_DEF = LARGO.get('completo', 74.4)
    # EL LADO DE LA SEGUNDA VIGA LO DICEN LOS PUNTOS, no una constante. El
    # sufijo -E/-W del id de fila NO cambia de significado ni de sitio: es la
    # CLAVE con la que se heredan los vectores TCU del as-built anterior, no una
    # brujula. Lo que cambia es donde se van a buscar sus puntos.
    dxLado, (_vo, _ve) = lado_de_la_hermana(P, TK)
    alEste = [t['id'] for t in TK if dxLado[t['id']] > 0]
    filas = []
    for t in TK:
        L0 = LARGO.get(t.get('t'), LARGO_DEF)
        for lado, x in (('E', t['x']), ('W', t['x'] + dxLado[t['id']])):
            filas.append({'x': x, 'n': t['n'], 'tk': t['id'], 'lado': lado,
                          't': t.get('t'), 'L0': L0})
    print('%-8s la segunda viga va al %s (morros que casan: %d al este contra %d al oeste)'
          % (planta, 'ESTE — el eje del plano es la viga OESTE del bifila' if alEste else 'oeste',
             _ve, _vo))

    # ── reparto POR NODOS ────────────────────────────────────────────────────
    # Los puntos no estan sueltos: van en NODOS de dos, y el tipo de nodo se ve
    # en su separacion. Dentro de un tubo, las dos mesas dejan una junta de
    # ~0,9 m; entre dos tubos contiguos el hueco es de ~0,2 m. Asi que:
    #
    #   ...  [tope]  --36,8 m--  [junta]  --36,8 m--  [tope]  ...
    #          ^                    ^                   ^
    #     lo comparten           es el CENTRO      lo comparten
    #     dos tubos:             del tubo:         dos tubos
    #     un punto cada uno      los dos puntos
    #
    # El nodo de junta cae en la n declarada del tracker (0,2 m en el caso
    # medido), y eso da la FASE: identificado el nodo de junta de una fila, sus
    # cuatro puntas son ese par mas, de cada nodo contiguo, el punto MAS CERCANO
    # al centro. Ese es el que le toca; el otro es del tubo de al lado.
    #
    # Hacia falta llegar hasta aqui. Un cupo de 4 por distancia al centro coge
    # los DOS puntos del tope norte y deja fuera el tope sur, y la fila sale de
    # 38 m en vez de 74,8 (paso en 17 filas sanas). Y una particion de Voronoi
    # entre centros tampoco vale: la frontera cae a 0,2 m del par del tope y no
    # sabe cual de los dos puntos es de quien.
    #
    # Y la fase es de la LINEA (ver cabecera): antes de anclar nada se mide el
    # desfase de cada linea contra el plano, votado por el vecindario.
    ejes = collections.defaultdict(list)                # x redondeado -> filas
    for i, f in enumerate(filas):
        ejes[round(f['x'] / TOL_X)].append(i)
    porEje = collections.defaultdict(list)              # mismo bucket -> puntos
    for k, (pid, x, n, y) in enumerate(P):
        porEje[round(x / TOL_X)].append(k)

    pts = collections.defaultdict(list)
    usados = set()
    desfase = {}
    for b, ifilas in sorted(ejes.items()):
        cand = []
        for c in (b - 1, b, b + 1):
            cand += porEje.get(c, [])
        cand = [k for k in cand if abs(P[k][1] - filas[ifilas[0]]['x']) <= TOL_X]
        if not cand:
            continue
        cand.sort(key=lambda k: P[k][2])
        # nodos: puntos consecutivos a menos de 2 m
        nodos, act = [], [cand[0]]
        for k in cand[1:]:
            if P[k][2] - P[act[-1]][2] <= 2.0:
                act.append(k)
            else:
                nodos.append(act); act = [k]
        nodos.append(act)
        cn = [statistics.fmean(P[k][2] for k in nd) for nd in nodos]
        cerca = lambda v: min(range(len(nodos)), key=lambda j: abs(cn[j] - v))

        # (a) DESFASE DE LA LINEA. De cada fila del plano, el desvio a su nodo
        # mas cercano; los que pasan de D_MAX no son desfase, son otro tubo.
        ifilas = sorted(ifilas, key=lambda i: filas[i]['n'])
        cs = [filas[i]['n'] for i in ifilas]
        d0 = []
        for c in cs:
            d = cn[cerca(c)] - c
            d0.append(d if abs(d) <= D_MAX else None)

        # (b) ANCLAJE, ya en el marco corregido de la linea
        for a, i in enumerate(ifilas):
            c, L0 = filas[i]['n'], filas[i]['L0']
            v = [d0[q] for q in range(len(cs)) if d0[q] is not None and abs(cs[q] - c) <= R_VEC]
            if not v:                                  # linea sin ningun ancla fiable
                v = [d for d in d0 if d is not None]
            dl = statistics.median(v) if v else 0.0
            desfase[i] = dl
            cc = c + dl
            toma, comparte = [], set()
            j = cerca(cc)
            if abs(cn[j] - cc) <= TOL_J:
                toma += nodos[j]                       # la junta entera
            for s in (-1, 1):                          # cada tope, donde dice el tipo
                j2 = cerca(cc + s * L0 / 2.0)
                if abs(cn[j2] - (cc + s * L0 / 2.0)) <= TOL_T:
                    k = min(nodos[j2], key=lambda k: abs(P[k][2] - cc))
                    toma.append(k)
                    # UN TOPE CON UN SOLO PUNTO ES DE LOS DOS TUBOS. Lo normal
                    # es que el tope tenga dos puntos y cada tubo se lleve el
                    # suyo. Cuando solo se midio uno, la exclusividad se lo daba
                    # al primero que pasara y al vecino le quedaban 3 puntas y
                    # 37 m: 18 filas SANAS de 74,4 m se caian por «fragmento».
                    # Pero ese punto es la FRONTERA, y la frontera es de los
                    # dos: es el extremo de uno y el del otro a la vez.
                    if len(nodos[j2]) == 1:
                        comparte.add(k)
            for k in toma:
                if k in usados and k not in comparte:
                    continue
                usados.add(k)
                pts[i].append(P[k])
    sinRepartir = len(P) - len(usados)
    conDesf = sum(1 for d in desfase.values() if abs(d) > 1.0)

    # ── emision ──────────────────────────────────────────────────────────────
    ant = {r['id']: r for r in A['f']}
    tpDe = {r['tk']: (r['tp'], r['mods']) for r in A['f']}
    # LARGO NOMINAL de m modulos por string (la misma formula que usa
    # cotas_asbuilt.py para reconstruir): L = 2*m*modW + (2m-2)*gapMod + gapDrive
    _w, _gm, _gd = M.get('modW') or 0, M.get('gapMod', 0.0), M.get('gapDrive', 0.0)
    nomL = lambda m: 2 * m * _w + (2 * m - 2) * _gm + _gd
    # consenso de tamano POR TIPO del plano: la mediana de lo que da el largo
    # medido en TODAS las filas de ese tipo
    _pt = collections.defaultdict(list)
    if _w:
        for i, f in pts.items():
            v = sorted(f, key=lambda p: p[2])
            if len(v) < 2:
                continue
            L = v[-1][2] - v[0][2]
            if L < 0.5 * filas[i]['L0']:      # media fila: no vota el tamano de su tipo
                continue
            m = int(round((L - _gd + 2 * _gm) / (2 * (_w + _gm))))
            if m >= 4:
                _pt[filas[i]['t']].append(m)
    md_tipo = {}
    for _t, _v in _pt.items():
        _v.sort()
        md_tipo[_t] = _v[len(_v) // 2]
    fuera, avisos = [], []
    tpMayor = collections.Counter((r['tp'], r['mods']) for r in A['f']).most_common(1)[0][0]
    num = lambda v, d=3: None if v is None else round(v, d)
    out, heredados, nulos = [], 0, 0
    for i, f in sorted(pts.items(), key=lambda t: (filas[t[0]]['tk'], filas[t[0]]['lado'])):
        v = sorted(f, key=lambda p: p[1 + 1])              # por n
        if len(v) < 2:
            continue                                       # una punta sola no es una fila
        # El corte por largo va mas abajo, contra el nominal de SU TIPO
        # (LARGO_FUERA): un numero fijo no vale, porque 30 m deja pasar un
        # «completo» medido a medias (37 m de 74,4) y a la vez roza a los
        # «medio», que miden 37,2 de verdad.
        fid = filas[i]['tk'] + '-' + filas[i]['lado']
        ns = [p[2] for p in v]
        ys = [p[3] for p in v]
        L = ns[-1] - ns[0]
        # el punto medio es la JUNTA entre las dos mesas: los dos centrales
        if len(v) == 4:
            nm = (ns[1] + ns[2]) / 2.0
            ym = (ys[1] + ys[2]) / 2.0
        elif len(v) == 3:
            nm, ym = ns[1], ys[1]
        else:
            nm = ym = None
        pa = []
        if nm is not None:
            Ls, Ln = nm - ns[0], ns[-1] - nm
            if Ls > 5:
                pa.append(round((ym - ys[0]) / Ls * 100, 3))
            if Ln > 5:
                pa.append(round((ys[-1] - ym) / Ln * 100, 3))
        a = ant.get(fid)
        # MODULOS DEL TIPO DECLARADO, con el largo medido de ARBITRO. San Jose
        # tiene 98 seguidores «corto» de ~37,5 m entre 2.191 de ~74,4: heredar
        # el tipo del fichero viejo (o el mayoritario) le colgaba 32 modulos a
        # una fila de media longitud. Pero invertir la formula del largo FILA A
        # FILA tampoco vale: donde el reparto deja la fila 1-2 m larga (una
        # punta de la vecina) o 18 m corta (le faltan puntos), el redondeo se
        # inventa un tamano que la planta no tiene — salieron 11 filas de 17
        # modulos, 2 de 33 y 1 de 24, y ninguno de esos tres es un tipo del
        # DWG. El tamano se decide POR TIPO del plano ('completo' / 'medio'),
        # con la MEDIANA de lo que mide cada tipo: 4.353 filas dicen 32 y 179
        # dicen 16, y un pufo suelto no mueve una mediana.
        mods = md_tipo.get(filas[i]['t'])
        if mods is None:
            tp, mods = tpDe.get(filas[i]['tk'], tpMayor)
        else:
            tp = '2TTx%d' % (2 * mods)
        # y el LARGO es ahora un control, no la fuente: si se aparta de lo que
        # mide su tipo, esa fila esta mal repartida y se dice
        if M.get('modW'):
            dif = L - nomL(mods)
            if abs(dif) > LARGO_FUERA:
                fuera.append((fid, round(L, 2), mods, round(dif, 2)))
                continue                      # se cae: la reconstruye cotas_asbuilt del plano
            if abs(dif) > LARGO_AVISO:
                avisos.append((fid, round(L, 2), mods, round(dif, 2)))
        # se cuenta cuando la fila ENTRA de verdad, no antes del control
        if a:
            heredados += 1
        else:
            nulos += 1
        out.append({
            'id': fid, 'zo': 'SJ', 'tk': filas[i]['tk'], 'fl': 0, 'tp': tp, 'mods': mods,
            'x': num(statistics.fmean(p[1] for p in v)),
            'zs': num(-ns[0]), 'zn': num(-ns[-1]),          # el eje z del as-built apunta al SUR
            'ys': num(ys[0]), 'yn': num(ys[-1]),
            'zm': num(-nm) if nm is not None else None, 'ym': num(ym) if ym is not None else None,
            'art': 1, 'pa': pa,
            'sl': num((ys[-1] - ys[0]) / L * 100, 3) if L > 5 else None,
            # los cuatro que NO se saben derivar: se heredan o van a null (ver cabecera)
            'cse': a['cse'] if a else None, 'cso': a['cso'] if a else None,
            'ase': a['ase'] if a else None, 'aso': a['aso'] if a else None,
            'npt': len(v),
        })

    # Un punto asignado a una fila que luego NO se emite (fragmento, punta
    # suelta) tampoco esta repartido: no tiene fila donde vivir. Antes se
    # contaba como repartido y ademas viajaba a la nube, que salia con 64 filas
    # que el as-built no tiene. Un reparto, dos ficheros.
    emitidas = {r['id'] for r in out}
    pts = {i: v for i, v in pts.items()
           if filas[i]['tk'] + '-' + filas[i]['lado'] in emitidas}
    sin = len(P) - len({p[0] for v in pts.values() for p in v})   # el tope compartido cuenta 1
    M['n_filas'] = len(out)
    M['n_trk'] = len({r['tk'] for r in out})
    M['descartadas'] = sin
    M['fuente'] = planta + '_levantamiento.csv (' + str(len(P)) + ' puntos del topografo)'
    # EL LADO DE LA SEGUNDA VIGA VIAJA CON EL FICHERO. Lo decide el reparto
    # mirando los puntos, asi que quien reconstruya un tracker sin levantar
    # (cotas_asbuilt.del_plano) tiene que colocarlo del mismo lado o lo pone
    # encima de la linea del vecino.
    M['dx_hermana'] = round(dxLado[TK[0]['id']], 3)
    M['reparto'] = ('tools/reparte_levantamiento.py · fila E en la x del tracker y W a %.3f m al '
                    '%s (el lado lo deciden los MORROS del levantamiento: %d casan a ese lado '
                    'contra %d al otro); fase resuelta POR LINEA (desfase = mediana del desvio '
                    'nodo-centro de las filas del plano a menos de %.0f m sobre la misma linea; '
                    '%d filas con desfase > 1 m) y topes buscados a L/2 del tipo declarado'
                    % (DX_FILA, 'este' if alEste else 'oeste',
                       max(_vo, _ve), min(_vo, _ve), R_VEC, conDesf))
    M['nota_tcu'] = ('cse/cso/ase/aso NO se derivan aqui: se heredan del as-built anterior por id '
                     'de fila y van a null en las filas recuperadas (%d de %d). Su regla de '
                     'calculo no esta en este repositorio.' % (nulos, len(out)))

    dst = os.path.join(RAIZ, planta + '_asbuilt.json')
    json.dump({'meta': M, 'f': out}, open(dst, 'w'), separators=(',', ':'))

    # La NUBE sale del mismo reparto, no de otro. Si el as-built dice que un
    # punto es de una fila y <planta>_puntos.json dice que es de otra, el
    # control de referencia vertical condena la fila equivocada. Un reparto,
    # dos ficheros.
    orden = [i for i in sorted(pts, key=lambda i: (filas[i]['tk'], filas[i]['lado']))]
    nube = {'planta': planta, 'origen': planta + '_levantamiento.csv (topografo) · reparto de '
            'tools/reparte_levantamiento.py',
            'nota': ('Nube CRUDA del levantamiento con el reparto de este repositorio. x/y son UTM '
                     'absolutas; z es la cota ABSOLUTA medida.'),
            'filas': [], 'id': [], 'x': [], 'y': [], 'z': [], 'fi': []}
    ix = {}
    for i in orden:
        fid = filas[i]['tk'] + '-' + filas[i]['lado']
        if fid not in ix:
            ix[fid] = len(nube['filas']); nube['filas'].append(fid)
        for pid, x, n, y in sorted(pts[i], key=lambda p: p[2]):
            nube['id'].append(pid)
            nube['x'].append(round(x + cE, 3)); nube['y'].append(round(n + cN, 3))
            nube['z'].append(round(y + base, 3)); nube['fi'].append(ix[fid])
    nube['n'] = len(nube['id'])
    dn = os.path.join(RAIZ, planta + '_puntos.json')
    json.dump(nube, open(dn, 'w'), separators=(',', ':'))
    print('         -> %s (%d puntos, %d filas)' % (os.path.basename(dn), nube['n'], len(nube['filas'])))
    c = collections.Counter(r['npt'] for r in out)
    print('%-8s %d puntos -> %d filas (%d sin repartir, %.1f%%)'
          % (planta, len(P), len(out), sin, 100.0 * sin / len(P)))
    print('         puntas por fila: %s · completas (4) %d (%.1f%%)'
          % (dict(sorted(c.items())), c[4], 100.0 * c[4] / len(out)))
    print('         trackers con las dos filas: %d de %d'
          % (sum(1 for v in collections.Counter(r['tk'] for r in out).values() if v == 2), len(TK)))
    print('         vectores TCU: %d heredados · %d a null (filas nuevas)' % (heredados, nulos))
    print('         modulos por string, del TIPO del plano: %s'
          % ' · '.join('%s %d' % (k, v) for k, v in sorted(md_tipo.items(), key=lambda kv: -kv[1])))
    if avisos:
        print('         AVISO · %d filas se apartan mas de %.1f m del largo de su tipo:' % (len(avisos), LARGO_AVISO))
        for fid, L, m, d in sorted(avisos, key=lambda r: -abs(r[3]))[:12]:
            print('           %-16s %6.2f m con %d modulos (%+.2f m)' % (fid, L, m, d))
    if fuera:
        print('         FUERA · %d filas descartadas por apartarse mas de %.1f m (su tracker se reconstruye del plano):' % (len(fuera), LARGO_FUERA))
        for fid, L, m, d in fuera:
            print('           %-16s %6.2f m con %d modulos (%+.2f m)' % (fid, L, m, d))
    return A, out


def carea(A, out):
    """Las filas que ya existian tienen que salir IGUAL en lo que se deriva.

    Lo que importa no es el desvio MAXIMO —un solo caso raro lo dispara— sino
    CUANTAS filas cambian. Si el reparto nuevo estuviera mal, cambiarian a
    cientos."""
    ant = {r['id']: r for r in A['f']}
    campos = ['x', 'zs', 'zn', 'ys', 'yn', 'zm', 'ym', 'sl']
    TOL = 0.02
    n, dif = 0, collections.Counter()
    peor = collections.defaultdict(float)
    culpables = collections.Counter()
    for r in out:
        a = ant.get(r['id'])
        if not a:
            continue
        n += 1
        for c in campos:
            if a.get(c) is None or r.get(c) is None:
                continue
            d = abs(a[c] - r[c])
            peor[c] = max(peor[c], d)
            if d > TOL:
                dif[c] += 1
                culpables[r['id']] += 1
    print('')
    print('  CAREO con el as-built anterior (%d filas comunes de %d):' % (n, len(out)))
    print('    %-4s %8s %10s' % ('', 'filas', 'desvio max'))
    for c in campos:
        print('    %-4s %8d %10.4f' % (c, dif[c], peor[c]))
    print('    filas que cambian en algo: %d de %d (%.2f %%)'
          % (len(culpables), n, 100.0 * len(culpables) / max(1, n)))
    for fid, k in culpables.most_common(5):
        print('      %s' % fid)
    ok = len(culpables) <= max(5, n // 500)
    print('    %s' % ('CUADRA: lo que ya estaba sale igual salvo un puñado, que se nombra.'
                      if ok else 'DISCREPA: demasiadas filas cambian, revisar el reparto.'))
    return ok


if __name__ == '__main__':
    pl = sys.argv[1] if len(sys.argv) > 1 else 'sanjose'
    r = reparte(pl)
    if isinstance(r, int):
        sys.exit(r)
    sys.exit(0 if carea(*r) else 1)
