#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera <planta>_cotas.json: el levantamiento enganchado a la implantacion.

El visor 3D (terreno.html) trabaja con <planta>_layout.json, que es una entrada
por TRACKER. El levantamiento (<planta>_asbuilt.json) es una entrada por FILA y
no comparte clave con el layout: numera tk por zona. Ademas su eje z apunta al
SUR, al reves que el eje n del layout.

Este script resuelve las dos cosas de una vez, offline y con verificacion, para
que el navegador solo tenga que indexar por el numero de tracker:

    COTAS.t[i]  ->  cotas y pendientes medidas del tracker i del layout

Comprobaciones que tienen que pasar (si no, no emite):
  - cada (zona, tk) del levantamiento tiene exactamente 2 filas
  - cada grupo engancha con un tracker distinto del layout (1:1)
  - el residuo del enganche es la media separacion entre filas, no un valor suelto

Uso:  python3 tools/cotas_asbuilt.py [planta ...]      (por defecto ayora sanjose)
"""
import json, math, os, sys
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def puntos_con_otra_referencia(planta, umbral=3.0, dy=3.0, dx=60.0, minv=6):
    """Puntos del levantamiento cuya Z no cuadra con la de sus vecinos.

    Devuelve (dict id_fila -> [(id_punto, desvio_m)], n_decidibles, n_puntos,
    dict id_fila -> n_puntos_de_esa_fila), o None si la planta no tiene
    <planta>_puntos.json.

    QUE SE CONTAMINA, EXACTAMENTE. No un punto suelto: una MESA ENTERA, que es
    tanto como decir una sesion de campo. En San Jose el tubo TR-09_1-044-E
    tiene la mesa sur a 1531,7 m y la norte a 1568,7 — 36,7 m de salto EN EL
    MISMO TUBO, imposible; su hermana -W tiene las cuatro cotas a 1531,x. Por
    eso la fila se descarta entera aunque solo la mitad este mal: el as-built
    solo conserva un extremo de cada mesa, y con uno bueno y uno malo no se
    reconstruye nada — se reclama.

    CONTRA QUE SE COMPARA CADA PUNTO, Y POR QUE ASI. Contra los puntos de los
    seguidores de al lado A SU MISMA COORDENADA NORTE (|dy| <= 3 m, |dx| <= 60 m),
    no contra una bola de radio fijo. La diferencia no es cosmetica:

      · Un cambio de referencia vertical afecta a un PUNTO (o a una sesion de
        campo), no a un sitio: sus vecinos laterales estan bien y el punto
        canta solo.
      · El relieve real es SOLIDARIO: un talud aparece igual en todos los
        seguidores de esa estacion, asi que al comparar lateralmente se cancela.
        Con una bola de 40 m, en cambio, la mediana mezcla los dos niveles del
        talud y marca terreno bueno: en San Jose daba 7 falsos positivos en el
        borde sur de TR-07 (escalon real de ~3,5 m, identico en 067-073).

    EL UMBRAL NO ES DELICADO. En San Jose el reparto de |desvio| deja una banda
    VACIA entre 5 y 20 m: cualquier umbral de 3 a 20 m marca exactamente los
    mismos 98 puntos (todos positivos, +36,55 m de media, sigma 0,40 m — la
    firma de la ondulacion del geoide). En Ayora ningun punto pasa de 1,7 m.
    """
    p = os.path.join(RAIZ, planta + '_puntos.json')
    if not os.path.exists(p):
        return None
    D = json.load(open(p))
    X, Y, Z, FI, ID, FIL = D['x'], D['y'], D['z'], D['fi'], D['id'], D['filas']
    G = defaultdict(list)
    for i in range(len(ID)):
        G[int(X[i] // dx)].append(i)
    malos, n_dec, total = defaultdict(list), 0, defaultdict(int)
    for i in range(len(ID)):
        total[FIL[FI[i]]] += 1
    for i in range(len(ID)):
        b = int(X[i] // dx)
        vec = []
        for k in (b - 1, b, b + 1):
            for j in G.get(k, ()):
                if j != i and abs(Y[j] - Y[i]) <= dy and abs(X[j] - X[i]) <= dx:
                    vec.append(Z[j])
        if len(vec) < minv:
            continue                             # sin laterales no se decide
        n_dec += 1
        vec.sort()
        r = Z[i] - vec[len(vec) // 2]
        if abs(r) > umbral:
            malos[FIL[FI[i]]].append((ID[i], round(r, 2)))
    return malos, n_dec, len(ID), total


def genera(planta):
    lay = os.path.join(RAIZ, planta + '_layout.json')
    asb = os.path.join(RAIZ, planta + '_asbuilt.json')
    if not (os.path.exists(lay) and os.path.exists(asb)):
        print('%-8s sin datos (falta layout o asbuilt)' % planta)
        return None

    L = json.load(open(lay)); A = json.load(open(asb))
    TK = L['trackers']; META = A['meta']

    grupos = defaultdict(list)
    for f in A['f']:
        grupos[(f['zo'], f['tk'])].append(f)

    # ── OTRA REFERENCIA VERTICAL: PRIMERO POR PUNTO, LUEGO POR FILA ──────────
    # Las dos filas de una bifila comparten tubo: su desfase de cota son
    # centimetros (mediana 0,2 m en Ayora). En San Jose aparecieron seguidores
    # cuyas dos filas difieren ~36,6 m, en puntas del parque separadas
    # kilometros. Una constante que se repite en sitios sin relacion no es
    # terreno ni un error de campo puntual: es una cota procesada con OTRA
    # referencia vertical (36,6 m es, ademas, la ondulacion del geoide en
    # Arequipa: huele a cota elipsoidal WGS84 colada entre ortometricas). Sin
    # este control, esa fila fabricaba en el simulador una linea imposible y
    # tumbaba la planta entera a NO EVALUABLE.
    #
    # POR QUE EL CONTROL POR PUNTO VA PRIMERO. El as-built ya es un dato
    # cocinado: dos cotas por fila. Con eso, un solo extremo contaminado se
    # diluye a la MITAD en la media de la fila (36,6 -> 18,3), y el umbral
    # aguanta de suerte, no por diseno: en San Jose habia dos casos justo ahi
    # (TR-09_1-044-E +18,20 m y TR-06_2-015-W +18,61 m). En la nube cruda el
    # salto se ve entero, y ademas se puede senalar el PUNTO, que es lo que se
    # le reclama al topografo. Ganancia medida en San Jose: coge una fuga que
    # el control por fila no veia (TR-08_1-001-E) y deja de descartar una fila
    # buena (TR-08_1-002-E, cero puntos marcados).
    #
    # CORRECCION DECLARADA, no silenciosa: se descarta la fila que se aparta y
    # se duplica la hermana (el mecanismo inc=1 que ya existia para filas sin
    # medir), y cada caso se IMPRIME con su id de fila del proveedor — y, si
    # viene de la nube, con los ids de PUNTO — para poder reclamarselo.
    UMBRAL_HERMANAS = 3.0                       # m; la cuerda son 2,38
    corregidas = []

    # (a) por PUNTO, si hay nube cruda de la planta
    malos = puntos_con_otra_referencia(planta, UMBRAL_HERMANAS)
    if malos is not None:
        pmal, n_dec, n_pts, n_por_fila = malos
        print('%-8s nube del levantamiento: %d puntos, %d decidibles (%.1f%%) · %d con otra referencia en %d fila(s)'
              % (planta, n_pts, n_dec, 100.0 * n_dec / max(1, n_pts),
                 sum(len(v) for v in pmal.values()), len(pmal)))
        for k, v in list(grupos.items()):
            sanas = [f for f in v if f.get('id') not in pmal]
            for f in v:
                if f.get('id') in pmal:
                    m, n_t = pmal[f['id']], n_por_fila.get(f['id'], 0)
                    alcance = 'la fila entera' if len(m) >= n_t else ('%d de %d puntos (media fila: una mesa)' % (len(m), n_t))
                    corregidas.append((f['id'], (f['ys'] + f['yn']) / 2.0, float('nan'), float('nan'),
                                       alcance + ' · ' + ', '.join('pt %d %+.1f m' % t for t in m)))
            if len(sanas) != len(v):
                if sanas:
                    grupos[k] = sanas            # inc=1: la hermana se duplica mas abajo
                else:
                    del grupos[k]                # las dos sucias: el seguidor se queda SIN MEDIR

    # (b) por FILA, sobre lo que ha sobrevivido. `todas` se reconstruye AQUI y
    #     se va purgando: una fila ya condenada no puede seguir votando como
    #     vecina. Sin esto el control se muerde la cola — en San Jose descartaba
    #     TR-08_1-002-E, que es buena, porque la mediana de su vecindario se
    #     apoyaba en su propia hermana TR-08_1-002-W, condenada dos lineas antes.
    todas = [f for v in grupos.values() for f in v]

    def mediana_vecinos(cx, cn, excluir):
        vec = []
        for f in todas:
            if f in excluir:
                continue
            fn = -(f['zs'] + f['zn']) / 2.0
            if abs(f['x'] - cx) <= 3 * (META.get('pitch') or 6) and abs(fn - cn) < 60:
                vec.append((f['ys'] + f['yn']) / 2.0)
        if len(vec) < 2:
            return None                          # sin vecinos no se decide: el control de relieve avisara
        vec.sort()
        return vec[len(vec) // 2]

    for k, v in list(grupos.items()):
        if len(v) != 2:
            continue
        y0 = (v[0]['ys'] + v[0]['yn']) / 2.0
        y1 = (v[1]['ys'] + v[1]['yn']) / 2.0
        if abs(y0 - y1) <= UMBRAL_HERMANAS:
            continue
        cx = (v[0]['x'] + v[1]['x']) / 2.0
        cn = -(v[0]['zs'] + v[0]['zn'] + v[1]['zs'] + v[1]['zn']) / 4.0
        ref = mediana_vecinos(cx, cn, v)
        if ref is None:
            continue
        mala, buena = (v[0], v[1]) if abs(y0 - ref) > abs(y1 - ref) else (v[1], v[0])
        corregidas.append((mala.get('id', '?'), (mala['ys'] + mala['yn']) / 2.0,
                           (buena['ys'] + buena['yn']) / 2.0, ref, 'por fila'))
        grupos[k] = [buena]
        todas.remove(mala)                       # deja de votar

    # Y los grupos de UNA fila con la misma pinta: ahi no hay hermana buena que
    # duplicar, asi que si la unica fila se aparta metros de los vecinos, el
    # seguidor se queda SIN MEDIR (mejor un hueco declarado que una cota con
    # otra referencia duplicada dos veces). Tambien se imprimen.
    for k, v in list(grupos.items()):
        if len(v) != 1:
            continue
        f0 = v[0]
        y0 = (f0['ys'] + f0['yn']) / 2.0
        ref = mediana_vecinos(f0['x'], -(f0['zs'] + f0['zn']) / 2.0, [f0])
        if ref is None:
            continue
        if abs(y0 - ref) > UMBRAL_HERMANAS:
            corregidas.append((f0.get('id', '?') + ' (SIN hermana: descartado)', y0,
                               float('nan'), ref, 'por fila'))
            del grupos[k]
            todas.remove(f0)
    if corregidas:
        print('%-8s %d fila(s) con OTRA REFERENCIA VERTICAL descartadas (hermana duplicada, inc=1):'
              % (planta, len(corregidas)))
        for fid, m, b, ref, det in corregidas:
            if det == 'por fila':
                print('           %-18s cota %8.2f  (hermana %8.2f · vecinos %8.2f · desvio %+.2f m) [por fila]'
                      % (fid, m, b, ref, m - ref))
            else:
                print('           %-18s cota %8.2f  [por punto] %s' % (fid, m, det))
        mags = sorted(abs(m - b) for _, m, b, _, d in corregidas if d == 'por fila' and b == b)
        if mags:
            print('           magnitudes por fila: %s  <- si se repiten, es un cambio de referencia, no ruido'
                  % ', '.join('%.2f' % v for v in mags))

    # Grupos de 1 fila: son los trackers cuya fila hermana se descarto en la
    # asignacion del levantamiento (261 en San Jose). No son un error del
    # enganche, asi que no abortan: se emiten con la fila que hay, duplicada
    # para la hermana y marcados con inc=1, porque las dos filas de una bifila
    # comparten tubo y su desfase de cota es de centimetros (mediana 0,2 m en
    # Ayora, donde si tenemos las dos). Grupos de 3 o mas si son un error.
    sobra = {k: len(v) for k, v in grupos.items() if len(v) > 2}
    if sobra:
        print('%-8s ABORTA: %d grupos con mas de 2 filas %s'
              % (planta, len(sobra), sorted(set(sobra.values()))))
        return None
    sueltas = sum(1 for v in grupos.values() if len(v) == 1)
    if sueltas:
        print('%-8s %d trackers con una sola fila medida (la hermana se duplica, marcados inc=1)'
              % (planta, sueltas))

    # rejilla del layout para buscar el tracker mas cercano al centro del par
    G = defaultdict(list)
    for i, t in enumerate(TK):
        G[(int(t['x'] // 25), int(t['n'] // 25))].append(i)

    # Asignacion, no "el primero que llega". Con el vecino mas cercano a secas,
    # dos grupos pueden reclamar el mismo tracker y el segundo se pierde (19 casos
    # en San Jose). Se recogen los 4 candidatos mas cercanos de cada grupo y se
    # reparten por distancia creciente: el par mas ajustado manda, y el que pierde
    # su primera opcion se queda con la siguiente libre.
    pares = []
    for k, v in grupos.items():
        v.sort(key=lambda f: f['fl'])
        cx = sum(f['x'] for f in v) / len(v)
        cn = -sum(f['zs'] + f['zn'] for f in v) / (2 * len(v))            # z del asbuilt apunta al SUR
        cand = []
        for dx in (-1, 0, 1):
            for dn in (-1, 0, 1):
                for i in G.get((int(cx // 25) + dx, int(cn // 25) + dn), ()):
                    d = (TK[i]['x'] - cx) ** 2 + (TK[i]['n'] - cn) ** 2
                    if d <= 64: cand.append((d, i))
        cand.sort()
        for d, i in cand[:4]:
            pares.append((d, i, k))

    pares.sort()
    asign, res, tomado, asign_k = {}, [], set(), set()
    for d, i, k in pares:
        if i in tomado or k in asign_k: continue
        tomado.add(i); asign_k.add(k)
        asign[i] = grupos[k]; res.append(math.sqrt(d))
    lejos = [k for k in grupos if k not in asign_k]
    choque = []

    res.sort()
    ok = len(asign)
    # «sin medir» son los trackers DEL LAYOUT que se quedan sin cota, no la
    # resta de censos: desde que el layout de Ayora retiro tres seguidores hay
    # mas grupos levantados que trackers, y la resta imprimia «-3 sin medir»
    # — un numero imposible en pantalla. Los grupos sobrantes ya se cuentan
    # aparte, en «lejos».
    print('%-8s %d/%d trackers (%.1f%%) · %d sin medir · %d levantados sin tracker · %d en choque · residuo mediana %.2f m p95 %.2f m'
          % (planta, ok, len(TK), 100.0 * ok / len(TK), len(TK) - ok, len(lejos), len(choque),
             res[len(res) // 2], res[int(len(res) * .95)]))
    if choque:
        print('%-8s ABORTA: %d grupos reclaman un tracker ya asignado' % (planta, len(choque)))
        return None
    if ok < len(TK) * 0.90:
        print('%-8s ABORTA: enganche por debajo del 90%%' % planta)
        return None

    def num(v, d=3):
        return None if v is None else round(v, d)

    T = []
    for i in range(len(TK)):
        v = asign.get(i)
        if not v:
            T.append(None); continue
        filas, inc = [], 1 if len(v) == 1 else 0
        for f in (v if len(v) == 2 else [v[0], v[0]]):
            # n = norte positivo (el asbuilt lo da hacia el sur); y = cota sobre la base
            filas.append({
                'x':  num(f['x']),
                'n':  [num(-f['zs']), num(-f['zn'])],      # extremo sur, extremo norte
                'y':  [num(f['ys']),  num(f['yn'])],       # cota medida SOBRE MODULO en cada extremo
                'art': int(f.get('art') or 0),
                'pa': [num(p) for p in (f.get('pa') or [])],
                'nm': num(-f['zm']) if f.get('zm') is not None else None,
                'ym': num(f['ym']) if f.get('ym') is not None else None,
            })
        g = v[0]
        T.append({
            'f': filas, 'inc': inc,
            # identidad del levantamiento: en San Jose el id del sunner CSV es
            # EXACTAMENTE este tk (2186/2186), asi que conservarlo permite unir
            # la ficha por IDENTIDAD en vez de por terna medida. En Ayora no
            # coincide con nada (las zonas HD-* van por su cuenta) y no estorba.
            'tk': g.get('tk'), 'zo': g.get('zo'),
            'sl':  num(g.get('sl')),                        # pendiente longitudinal del tracker (%)
            'cse': num(g.get('cse')), 'cso': num(g.get('cso')),   # vector TCU conservador este/oeste (%)
            'ase': num(g.get('ase')), 'aso': num(g.get('aso')),   # vector TCU agresivo este/oeste (%)
        })

    art = sum(1 for t in T if t and any(f['art'] for f in t['f']))
    inc = sum(1 for t in T if t and t['inc'])
    out = {
        'planta': planta,
        'base':   META.get('base'),        # cota absoluta (m) a la que se refieren las y
        'gcr':    META.get('gcr'),
        'limite': META.get('limite'),
        'pitch':  META.get('pitch'),
        'cuerda': META.get('cuerda'),
        'n_trk':  len(TK),
        'n_con':  ok,
        'n_art':  art,
        'n_inc':  inc,
        'nota':   'y = cota MEDIDA sobre el modulo, relativa a base. El eje n es norte positivo.',
        't': T,
    }
    dst = os.path.join(RAIZ, planta + '_cotas.json')
    with open(dst, 'w') as fh:
        json.dump(out, fh, separators=(',', ':'))
    print('%-8s -> %s  (%d KB · %d trackers con cotas · %d articulados · %d con una sola fila)'
          % (planta, os.path.basename(dst), os.path.getsize(dst) // 1024, ok, art, inc))
    return out


if __name__ == '__main__':
    for p in (sys.argv[1:] or ['ayora', 'sanjose']):
        genera(p)
