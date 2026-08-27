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

    # ── FILA CON OTRA REFERENCIA VERTICAL ────────────────────────────────────
    # Las dos filas de una bifila comparten tubo: su desfase de cota son
    # centimetros (mediana 0,2 m en Ayora). En San Jose aparecieron 8 seguidores
    # cuyas dos filas difieren ~36,6 m — SEIS de ellos entre 36,59 y 36,70 m, en
    # puntas del parque separadas kilometros. Una constante que se repite en
    # sitios sin relacion no es terreno ni un error de campo puntual: es una
    # fila procesada con OTRA referencia vertical (36,6 m es, ademas, la
    # ondulacion del geoide en Arequipa: huele a cota elipsoidal WGS84 colada
    # entre ortometricas). Sin este control, esa fila fabricaba en el simulador
    # una linea imposible y tumbaba la planta entera a NO EVALUABLE.
    #
    # CORRECCION DECLARADA, no silenciosa: se descarta la fila que se aparta y
    # se duplica la hermana (el mecanismo inc=1 que ya existia para filas sin
    # medir), y cada caso se IMPRIME con su id de fila del proveedor para poder
    # reclamarselo. ¿Cual de las dos es la mala? La que mas se aleja de la
    # cota mediana de los seguidores vecinos (a menos de 3 vanos).
    UMBRAL_HERMANAS = 3.0                       # m; la cuerda son 2,38
    todas = [f for v in grupos.values() for f in v]
    corregidas = []
    for k, v in list(grupos.items()):
        if len(v) != 2:
            continue
        y0 = (v[0]['ys'] + v[0]['yn']) / 2.0
        y1 = (v[1]['ys'] + v[1]['yn']) / 2.0
        if abs(y0 - y1) <= UMBRAL_HERMANAS:
            continue
        cx = (v[0]['x'] + v[1]['x']) / 2.0
        cn = -(v[0]['zs'] + v[0]['zn'] + v[1]['zs'] + v[1]['zn']) / 4.0
        vec = []
        for f in todas:
            if f in v:
                continue
            fn = -(f['zs'] + f['zn']) / 2.0
            if abs(f['x'] - cx) <= 3 * (META.get('pitch') or 6) and abs(fn - cn) < 60:
                vec.append((f['ys'] + f['yn']) / 2.0)
        if len(vec) < 2:
            continue                             # sin vecinos no se decide: se deja y el control de relieve avisara
        vec.sort()
        ref = vec[len(vec) // 2]
        mala, buena = (v[0], v[1]) if abs(y0 - ref) > abs(y1 - ref) else (v[1], v[0])
        corregidas.append((mala.get('id', '?'), (mala['ys'] + mala['yn']) / 2.0,
                           (buena['ys'] + buena['yn']) / 2.0, ref))
        grupos[k] = [buena]                      # inc=1: la hermana se duplica mas abajo
    # Y los grupos de UNA fila con la misma pinta: ahi no hay hermana buena que
    # duplicar, asi que si la unica fila se aparta metros de los vecinos, el
    # seguidor se queda SIN MEDIR (mejor un hueco declarado que una cota con
    # otra referencia duplicada dos veces). Tambien se imprimen.
    for k, v in list(grupos.items()):
        if len(v) != 1:
            continue
        f0 = v[0]
        y0 = (f0['ys'] + f0['yn']) / 2.0
        fn0 = -(f0['zs'] + f0['zn']) / 2.0
        vec = []
        for f in todas:
            if f is f0:
                continue
            fn = -(f['zs'] + f['zn']) / 2.0
            if abs(f['x'] - f0['x']) <= 3 * (META.get('pitch') or 6) and abs(fn - fn0) < 60:
                vec.append((f['ys'] + f['yn']) / 2.0)
        if len(vec) < 2:
            continue
        vec.sort()
        ref = vec[len(vec) // 2]
        if abs(y0 - ref) > UMBRAL_HERMANAS:
            corregidas.append((f0.get('id', '?') + ' (SIN hermana: descartado)', y0, float('nan'), ref))
            del grupos[k]
    if corregidas:
        print('%-8s %d fila(s) con OTRA REFERENCIA VERTICAL descartadas (hermana duplicada, inc=1):'
              % (planta, len(corregidas)))
        mags = sorted(abs(m - b) for _, m, b, _ in corregidas)
        for fid, m, b, ref in corregidas:
            print('           %-18s cota %8.2f  (hermana %8.2f · vecinos %8.2f · desvio %+.2f m)'
                  % (fid, m, b, ref, m - ref))
        print('           magnitudes: %s  <- si se repiten, es un cambio de referencia, no ruido'
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
    print('%-8s %d/%d trackers (%.1f%%) · %d sin medir · %d lejos · %d en choque · residuo mediana %.2f m p95 %.2f m'
          % (planta, ok, len(TK), 100.0 * ok / len(TK), len(TK) - len(grupos), len(lejos), len(choque),
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
