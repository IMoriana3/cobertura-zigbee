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
    fila W : 6,174 m al oeste               (mediana -6,174, p5/p95 +-0,08)
    centro de la fila = n del tracker       (mediana -0,038 m)
    largo de fila                           74,43 m (p5 74,30 · p95 74,63)

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
import collections
import csv
import json
import os
import statistics
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DX_FILA = 6.174        # m; la fila W va al oeste de la x del tracker
TOL_X = 1.5            # m; ruido de campo contra un eje (las filas van a 6,17)
TOL_N = 45.0           # m; medio tubo (37,2) con margen
CUPO = 4               # puntas por fila: 2 mesas x 2 extremos
LARGO_MIN = 30.0       # m; por debajo de eso no es una fila, es un fragmento
LARGO_AVISO = 1.5      # m; se aparta de su tipo mas de esto: se avisa
# Mas de DOS MODULOS de mas o de menos y esa fila ya no describe a su tracker:
# emitirla mete en el modelo una mesa estirada o encogida —el render le cuelga
# 32 modulos en 33 m, y el string sale con otro largo—, y para eso ya esta la
# reconstruccion del plano, que es geometria correcta y va MARCADA (est=1).
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
    filas = []
    for t in TK:
        filas.append({'x': t['x'], 'n': t['n'], 'tk': t['id'], 'lado': 'E', 't': t.get('t')})
        filas.append({'x': t['x'] - DX_FILA, 'n': t['n'], 'tk': t['id'], 'lado': 'W', 't': t.get('t')})
    G = collections.defaultdict(list)
    for i, f in enumerate(filas):
        G[int(f['x'] // 5)].append(i)

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
    ejes = collections.defaultdict(list)                # x redondeado -> filas
    for i, f in enumerate(filas):
        ejes[round(f['x'] / TOL_X)].append(i)
    porEje = collections.defaultdict(list)              # mismo bucket -> puntos
    for k, (pid, x, n, y) in enumerate(P):
        porEje[round(x / TOL_X)].append(k)

    pts = collections.defaultdict(list)
    usados = set()
    for b, ifilas in ejes.items():
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
        for i in ifilas:
            c = filas[i]['n']
            j = min(range(len(nodos)), key=lambda j: abs(cn[j] - c))
            if abs(cn[j] - c) > 5.0:
                continue                               # sin nodo de junta: no es su fila
            toma = list(nodos[j])                      # la junta entera
            for j2 in (j - 1, j + 1):                  # de cada tope, el mas cercano
                if 0 <= j2 < len(nodos):
                    if abs(cn[j2] - c) > 50:
                        continue
                    toma.append(min(nodos[j2], key=lambda k: abs(P[k][2] - c)))
            for k in toma:
                if k in usados:
                    continue
                usados.add(k)
                pts[i].append(P[k])
    sinRepartir = len(P) - len(usados)

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
            if L < LARGO_MIN:
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
        # LARGO MINIMO. San Jose solo tiene dos tamanos reales: 74,4 m
        # («completo», 32 modulos por string) y 37,5 m («medio», 16). Salian 20
        # filas de 18,3 m con solo dos puntas: son FRAGMENTOS —media mesa—, no
        # seguidores, y aguas abajo el accionamiento les colocaba el eje en
        # mitad de la mesa en vez de en su morro. Mejor un punto sin repartir
        # que una fila que no existe.
        if v[-1][2] - v[0][2] < LARGO_MIN:
            continue
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

    sin = sinRepartir
    M['n_filas'] = len(out)
    M['n_trk'] = len({r['tk'] for r in out})
    M['descartadas'] = sin
    M['fuente'] = planta + '_levantamiento.csv (' + str(len(P)) + ' puntos del topografo)'
    M['reparto'] = ('tools/reparte_levantamiento.py · cupo de %d puntas por fila, fila E en la x '
                    'del tracker y W a %.3f m al oeste' % (CUPO, DX_FILA))
    M['nota_tcu'] = ('cse/cso/ase/aso NO se derivan aqui: se heredan del as-built anterior por id '
                     'de fila y van a null en las filas recuperadas (%d de %d). Su regla de '
                     'calculo no esta en este repositorio.' % (nulos, len(out)))

    dst = os.path.join(RAIZ, planta + '_asbuilt.json')
    json.dump({'meta': M, 'f': out}, open(dst, 'w'), separators=(',', ':'))

    # La NUBE sale del mismo reparto, no de otro. Si el as-built dice que un
    # punto es de una fila y <planta>_puntos.json dice que es de otra, el
    # control de referencia vertical condena la fila equivocada. Un reparto,
    # dos ficheros.
    idFila = {i: r['id'] for i, r in zip(sorted(pts), out)} if len(pts) == len(out) else None
    orden = [i for i in sorted(pts, key=lambda i: (filas[i]['tk'], filas[i]['lado']))]
    idDe = {}
    for r in out:
        idDe[r['id']] = r['id']
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
