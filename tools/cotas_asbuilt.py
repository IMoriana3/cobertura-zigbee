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


def puntos_con_otra_referencia(planta, umbral=3.0, dy=10.0, dx=30.0, minv=3):
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
    seguidores de al lado A SU MISMA COORDENADA NORTE (|dy| <= 10 m, |dx| <= 30 m),
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

    LA VENTANA ESTA MEDIDA, NO ELEGIDA A OJO — y hay que mirar tambien lo que NO
    se comprueba: con la primera version (dy=3, dx=60, minv=6) quedaba SIN
    DECIDIR el 23 % de los puntos de Ayora, demasiado hueco para una planta que
    luego se declara limpia. El barrido de los tres:

      · dy se suelta de 3 a 10 m sin que San Jose se mueva UN PUNTO: el escalon
        de TR-07 esta a 37 m —la distancia entre estaciones— y 10 m no lo
        cruzan. A partir de 15 m deriva (101 en vez de 98), y ahi se para.
      · minv de 6 a 3 tampoco lo mueve: un punto contaminado lo esta por +36 m,
        no hace falta cuorum para verlo.
      · dx fija el SUELO DE RUIDO, y lo quiere ESTRECHO, no ancho — al reves de
        lo que parecia. Con 60 m la ventana abarca tanta ladera que la propia
        pendiente lateral se lee como desvio: en Ayora habia tres puntos a
        2,1-2,4 m que son terreno puro, demasiado cerca del umbral de 3 m. A
        30 m el suelo baja a 1,38 m (Ayora) y 2,18 m (San Jose) sin mover el
        veredicto; por debajo de 24 m si se mueve (91 en vez de 98). Y ampliarlo
        a 100 m mete 11 falsos positivos del talud de TR-07.

    Con dy=10 / dx=30 / minv=3 el veredicto de San Jose es IDENTICO (98 puntos
    en 54 filas) y la cobertura sube: Ayora 76,9 % -> 96,5 %, San Jose 99,9 %.
    El umbral queda sin sitio donde equivocarse: el desvio mayor de un punto
    limpio es 2,18 m y el menor de uno contaminado, 35,01 m. Son los mismos
    parametros que el visor de as-built (IMoriana3/visores,
    asbuilt/tools/ref_vertical.py): la misma vara para las dos plantas.
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
    repone, pmal = {}, {}                        # filas a las que hay que reponer UNA cota

    # (a) por PUNTO, si hay nube cruda de la planta
    malos = puntos_con_otra_referencia(planta, UMBRAL_HERMANAS)
    if malos is not None:
        pmal, n_dec, n_pts, n_por_fila = malos
        print('%-8s nube del levantamiento: %d puntos, %d decidibles (%.1f%%) · %d con otra referencia en %d fila(s)'
              % (planta, n_pts, n_dec, 100.0 * n_dec / max(1, n_pts),
                 sum(len(v) for v in pmal.values()), len(pmal)))
        # DONDE cae lo contaminado dentro de la fila, que no es lo mismo tirar
        # media planta que una punta. La nube dice la n de cada punto: el
        # primero es la punta SUR, el ultimo la NORTE y el resto la junta.
        donde = {}
        nb = os.path.join(RAIZ, planta + '_puntos.json')
        if os.path.exists(nb):
            NB = json.load(open(nb))
            _p = defaultdict(list)
            for _i in range(NB['n']):
                _p[NB['filas'][NB['fi'][_i]]].append(_i)
            for _fid, _ks in _p.items():
                _ks.sort(key=lambda _k: NB['y'][_k])
                d = {'sur': set(), 'nor': set(), 'cen': set()}
                for _j, _k in enumerate(_ks):
                    d['sur' if _j == 0 else 'nor' if _j == len(_ks) - 1 else 'cen'].add(NB['id'][_k])
                donde[_fid] = d
        estado = {}                              # id de fila -> que hay que hacer con ella
        for _fid, _m in pmal.items():
            d = donde.get(_fid)
            ids = {t[0] for t in _m}
            if not d:
                estado[_fid] = 'fuera'; continue
            # Lo que decide es cuantas PUNTAS se pierden: con las dos, la fila
            # no tiene geometria de cota y se cae. La junta es aparte — vale por
            # la articulacion, no por los extremos — asi que si la toca la
            # contaminacion se pierde la junta, no la fila.
            ext = [e for e in ('sur', 'nor') if ids & d[e]]
            estado[_fid] = ('fuera' if len(ext) >= 2 else
                            (ext[0] if ext else 'ok')) + ('+junta' if ids & d['cen'] else '')

        for k, v in list(grupos.items()):
            for f in v:
                if f.get('id') in pmal:
                    m, n_t = pmal[f['id']], n_por_fila.get(f['id'], 0)
                    alcance = 'la fila entera' if len(m) >= n_t else ('%d de %d puntos (media fila: una mesa)' % (len(m), n_t))
                    corregidas.append((f['id'], (f['ys'] + f['yn']) / 2.0, float('nan'), float('nan'),
                                       alcance + ' · ' + ', '.join('pt %d %+.1f m' % t for t in m)))
            # LA X,Y NO SE CONTAMINA. Lo que cambia de referencia es la COTA: el
            # punto sigue estando donde el topografo lo puso. Tirar la fila
            # entera por una punta se llevaba por delante su posicion, su largo
            # y las cotas SANAS que tuviera — y su tracker acababa reconstruido
            # del plano, con todo estimado en vez de una sola cota. Asi que la
            # fila se repara si lo sano la determina, y solo se cae si no.
            #
            #   · «+junta»: se pierde la junta y con ella la articulacion —
            #     nm/ym a None y art a 0—, pero zs/zn/ys/yn siguen siendo suyos.
            #     NADA se estima.
            #   · una punta: la cota de ESA punta se repone mas abajo.
            #   · las dos puntas, teniendo hermana sana: la fila se cae y la
            #     hermana se duplica (0,167 m de error, la mejor fuente).
            #   · las dos puntas de las DOS vigas: NO se tira el seguidor. Su
            #     posicion y su largo SIGUEN SIENDO MEDIDA — lo que cambio de
            #     referencia es la cota— y tirarlo entero lo mandaba a
            #     reconstruirse del plano, con la geometria estimada tambien.
            #     En San Jose eran TR-06_1-005 y TR-08_1-001: dos seguidores
            #     levantados enteros, sus 8 puntos, que salian «reconstruidos
            #     del plano» y colocados donde el layout, no donde estan. Se
            #     reponen las dos cotas de cada punta del terreno vecino (ye=3)
            #     y se conserva todo lo demas.
            reparadas = [f for f in v if not estado.get(f.get('id'), '').startswith('fuera')]
            for f in reparadas:
                e = estado.get(f.get('id'), '')
                if e.endswith('+junta'):
                    f['zm'] = f['ym'] = None; f['pa'] = []; f['art'] = 0
                if e.split('+')[0] in ('sur', 'nor'):
                    repone[f['id']] = e.split('+')[0]
            if len(reparadas) != len(v):
                if reparadas:
                    grupos[k] = reparadas        # inc=1: la hermana se duplica mas abajo
                else:
                    for f in v:                  # ninguna hermana sana: al vecindario
                        if estado.get(f.get('id'), '').endswith('+junta'):
                            f['zm'] = f['ym'] = None; f['pa'] = []; f['art'] = 0
                        repone[f['id']] = 'amb'

    # (b) por FILA, sobre lo que ha sobrevivido. `todas` se reconstruye AQUI y
    #     se va purgando: una fila ya condenada no puede seguir votando como
    #     vecina. Sin esto el control se muerde la cola — en San Jose descartaba
    #     TR-08_1-002-E, que es buena, porque la mediana de su vecindario se
    #     apoyaba en su propia hermana TR-08_1-002-W, condenada dos lineas antes.
    todas = [f for v in grupos.values() for f in v]

    def cota_vecina(cx, cn, excluir):
        """Cota de referencia del entorno: la MEDIANA de las filas vecinas,
           ampliando el radio hasta reunir unas cuantas.

           Con dos vecinos la mediana no decide nada, y ahi se colaba un caso
           real: TR-08_1-001-E, con la referencia vertical cambiada (+36,9 m
           sobre su entorno), tenia a 3 vanos solo DOS vecinos y uno era la
           otra fila del mismo lote — la «mediana» daba su propia cota y el
           saneo lo dejaba pasar. A 6 vanos hay seis vecinos y el desvio salta.
           No se veia porque ese tracker emitia sus dos vigas superpuestas: al
           colocarlas en su sitio, el control de entrada del relieve lo caza."""
        paso = META.get('pitch') or 6
        for radio in (3, 6, 10):
            vec = []
            for f in todas:
                if f in excluir:
                    continue
                fn = -(f['zs'] + f['zn']) / 2.0
                if abs(f['x'] - cx) <= radio * paso and abs(fn - cn) < 60:
                    vec.append((f['ys'] + f['yn']) / 2.0)
            if len(vec) >= 5:
                vec.sort()
                return (vec[len(vec) // 2] if len(vec) % 2 else (vec[len(vec) // 2 - 1] + vec[len(vec) // 2]) / 2.0)
        return None

    # ── REPONER LA COTA DE LA PUNTA CONTAMINADA ─────────────────────────────
    # De donde sale, elegido MIDIENDO, no por gusto: prueba de dejar-uno-fuera
    # sobre las 4.375 filas sanas de cuatro puntos de San Jose — se tapa la cota
    # de cada punta y se estima con cada fuente posible (unos 8.400 casos cada
    # una) para compararla con la que el topografo midio de verdad:
    #
    #     la HERMANA, misma punta      mediana 0,167 m · p95 0,474 · max 1,65
    #     mediana del vecindario       mediana 0,418 m · p95 1,337 · max 2,76
    #     el propio tubo, extrapolado  mediana 0,446 m · p95 2,201 · max 5,66
    #
    # La hermana gana por el doble, y no por casualidad: las dos vigas de un
    # bifila comparten tubo. Extrapolar el propio tubo desde su junta es lo PEOR
    # de los tres, porque el tubo articula justo ahi. Asi que: la hermana si
    # tiene esa punta sana, y si no el vecindario; si tampoco hay vecinos, la
    # fila se cae como antes.
    sucias = [f for f in todas if f.get('id') in pmal]
    repuestas = []
    for k, v in list(grupos.items()):
        for f in list(v):
            e = repone.get(f.get('id'))
            if not e:
                continue
            if e == 'amb':
                # LAS DOS PUNTAS. Cada una con la cota del terreno en SU n, no
                # una sola para las dos: asi la pendiente sale del terreno
                # vecino y no de suponer la fila plana.
                zs = cota_vecina(f['x'], -f['zs'], sucias)
                zn = cota_vecina(f['x'], -f['zn'], sucias)
                if zs is None or zn is None:
                    v.remove(f)
                    if f in todas: todas.remove(f)
                    if not v: del grupos[k]
                    continue
                f['ys'], f['yn'] = round(zs, 3), round(zn, 3)
                campo, fuente = 'ys', 'vecindario (las dos puntas)'
            else:
              campo = 'ys' if e == 'sur' else 'yn'
              herm = next((g for g in v if g is not f and repone.get(g.get('id')) != e), None)
              if herm is not None:
                f[campo] = herm[campo]; fuente = 'hermana ' + herm['id']
              else:
                z = cota_vecina(f['x'], -(f['zs'] + f['zn']) / 2.0, sucias)
                if z is None:
                    v.remove(f)                  # sin hermana ni vecinos: no se repone nada
                    if f in todas: todas.remove(f)
                    if not v: del grupos[k]
                    continue
                f[campo] = round(z, 3)           # es la cifra que mide el careo: 0,418 m de mediana
                fuente = 'vecindario'
            f['rv1'] = e                         # queda dicho: una punta es estimada
            # Y LO DERIVADO SE REHACE. sl y pa salen de las dos cotas de la
            # fila, asi que con la punta contaminada valian cualquier cosa:
            # antes daba igual porque la fila se tiraba entera, pero ahora se
            # queda, y sl=98,8 % con pa=[0,83 · 196,8] entraria al modelo tal
            # cual. Se recalculan con la misma formula que usa el reparto.
            #
            # LA FILA REPARADA VA RIGIDA: UNA PENDIENTE PARA SUS DOS MESAS.
            # Ignacio: «deja la misma pendiente en esa mesa y en la otra de la
            # misma fila». Con una cota repuesta, el quiebro de la junta ya no
            # es medida —saldria de una punta estimada contra la junta medida,
            # y eso es inventar una articulacion—; se quita la junta (nm/ym) y
            # la fila entra como viga rigida: la pendiente entre sus dos puntas,
            # igual para la mesa sur y la norte.
            Lf = f['zs'] - f['zn']                                  # el eje z apunta al SUR
            f['sl'] = round((f['yn'] - f['ys']) / Lf * 100, 3) if Lf > 5 else None
            f['zm'] = f['ym'] = None; f['pa'] = []; f['art'] = 0
            repuestas.append((f['id'], e, fuente, f[campo]))
    if repuestas:
        _una = sum(1 for r in repuestas if r[1] != 'amb')
        _amb = len(repuestas) - _una
        print('%-8s %d fila(s) con la cota de otra referencia REPUESTA: %d de una punta (la otra punta, '
              'la posicion y el largo son MEDIDOS) y %d de las dos (posicion y largo MEDIDOS, las dos '
              'cotas del terreno vecino)' % (planta, len(repuestas), _una, _amb))
        for fid, e, fu, z in repuestas[:8]:
            print('           %-18s punta %-4s <- %-26s cota %8.2f' % (fid, e, fu, z))

    for k, v in list(grupos.items()):
        if len(v) != 2:
            continue
        y0 = (v[0]['ys'] + v[0]['yn']) / 2.0
        y1 = (v[1]['ys'] + v[1]['yn']) / 2.0
        if abs(y0 - y1) <= UMBRAL_HERMANAS:
            continue
        cx = (v[0]['x'] + v[1]['x']) / 2.0
        cn = -(v[0]['zs'] + v[0]['zn'] + v[1]['zs'] + v[1]['zn']) / 4.0
        ref = cota_vecina(cx, cn, v)
        if ref is None:
            continue                             # sin vecinos no se decide: se deja y el control de relieve avisara
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
        fn0 = -(f0['zs'] + f0['zn']) / 2.0
        ref = cota_vecina(f0['x'], fn0, [f0])
        if ref is None:
            continue
        if abs(y0 - ref) > UMBRAL_HERMANAS:
            corregidas.append((f0.get('id', '?') + ' (SIN hermana: descartado)', y0,
                               float('nan'), ref, 'por fila'))
            del grupos[k]
            todas.remove(f0)
    if corregidas:
        # Que se hizo con cada una, que no es lo mismo repararla que tirarla: la
        # linea decia «descartadas» de las 52 cuando la mayoria conserva su
        # posicion, su largo y al menos una cota medida.
        rep = {t[0] for t in repuestas}
        n_fuera = sum(1 for fid, _, _, _, d in corregidas if d != 'por fila' and fid not in rep)
        print('%-8s %d fila(s) con OTRA REFERENCIA VERTICAL: %d reparadas (una punta repuesta) · '
              '%d descartadas (la hermana se duplica, inc=1):'
              % (planta, len(corregidas), len(rep), len(corregidas) - len(rep)))
        for fid, m, b, ref, det in corregidas:
            if det == 'por fila':
                print('           %-18s cota %8.2f  (hermana %8.2f · vecinos %8.2f · desvio %+.2f m) [por fila]'
                      % (fid, m, b, ref, m - ref))
            else:
                print('           %-18s cota %8.2f  [%s] %s'
                      % (fid, m, 'reparada' if fid in rep else 'descartada', det))
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

    # ── LA VIGA QUE FALTA VA EN SU SITIO, NO ENCIMA DE SU HERMANA ────────────
    # Cuando de un tracker solo hay UNA fila medida (inc=1: sin levantar, o
    # descartada por venir con otra referencia vertical), se duplica la hermana
    # -- pero hasta ahora la copia se emitia con la MISMA x, asi que el bifila
    # salia como dos vigas SUPERPUESTAS: el simulador las metia en la misma
    # linea, no las reconocia como pareja y las pintaba como dos monofilas
    # sueltas. En San Jose eso son 231 trackers de 2.182 (el 11%).
    #
    # La posicion de la que falta no se inventa: se DEDUCE del layout, y solo
    # si el layout dice lo mismo en los trackers que SI tienen las dos filas.
    # Se mide (a) el paso entre las dos vigas de un tracker y (b) que papel
    # juega la x del layout: una de las dos vigas, o el eje de unidad (el
    # centro). En San Jose: paso 6,177 m y la x del layout ES la viga este en
    # los 1.951 completos (peor desvio 0,29 m). Si el layout no casa con
    # ninguno de los dos patrones, no se toca nada y se dice.
    MOD = {k: META[k] for k in ('modW', 'gapMod', 'gapDrive') if META.get(k) is not None}
    dobles = [g for g in asign.values() if len(g) == 2]
    paso_v, papel = None, 'ninguno'
    if len(dobles) >= 20:
        ds = sorted(abs(g[0]['x'] - g[1]['x']) for g in dobles)
        paso_v = ds[len(ds) // 2]
        if paso_v > 1:
            d_viga, d_centro = [], []
            for i, g in asign.items():
                if len(g) != 2: continue
                xs = sorted([g[0]['x'], g[1]['x']]); xl = TK[i]['x']
                d_viga.append(min(abs(xl - xs[0]), abs(xl - xs[1])))
                d_centro.append(abs(xl - (xs[0] + xs[1]) / 2))
            tol = 0.1 * paso_v
            if max(d_viga) < tol: papel = 'viga'
            elif max(d_centro) < tol: papel = 'centro'
    recolocadas, sin_regla, chocaban = 0, 0, 0
    # TODAS las vigas MEDIDAS de la planta, para que ninguna copia se ponga
    # encima de una. Ordenadas por x: la comprobacion es una ventana.
    medidas = sorted((f['x'], min(-f['zs'], -f['zn']), max(-f['zs'], -f['zn']), f.get('id'))
                     for v in grupos.values() for f in v)

    def libre(x, n0, n1, propia):
        """¿Cabe una viga en (x, n0..n1) sin pisar una MEDIDA que no sea la suya?"""
        for mx, m0, m1, mid in medidas:
            if mx < x - 3: continue
            if mx > x + 3: break
            if mid != propia and min(n1, m1) - max(n0, m0) > 1: return False
        return True

    def hermana(i, f):
        """La fila gemela de f: misma cota y mismo largo (no se midio), su x REAL."""
        nonlocal recolocadas, sin_regla, chocaban
        g = dict(f)
        g['hm'] = 1                       # ESTA es la copia, no la medida
        if paso_v and papel != 'ninguno':
            xl = TK[i]['x']
            if papel == 'centro':
                g['x'] = round(2 * xl - f['x'], 3); recolocadas += 1; return g
            # DE QUE LADO ESTA LA QUE FALTA: LO DICE LA QUE HAY. El id de la
            # fila medida trae su lado E/W, que el reparto decide por el BORDE
            # del bloque (donde se acaban las vigas), no por una regla fija; y
            # medido sobre las 2.284 bifilas completas de San Jose, x(E)-x(W)
            # es el paso siempre (mediana 6,22 m, min 5,93, max 6,60). Asi que
            # la gemela de una viga ESTE esta un paso al oeste, y al reves.
            #
            # ANTES se decidia comparando con la x del layout suponiendo que
            # marcaba la viga ESTE. Es al reves en casi toda San Jose, y eso
            # ponia la copia un paso fuera: en TR-03_2-003 la pareja real es
            # (490,8 · 497,0) y se emitia (490,8 · 484,6) — la copia encima de
            # la viga del tracker vecino y un hueco donde iba la suya.
            #
            # Y NUNCA ENCIMA DE OTRA VIGA. En 2 de los 11 casos de San Jose el
            # lado que dice el id lleva la copia justo sobre una viga MEDIDA
            # del tracker de al lado (misma linea, solapando 37 m en n): ahi el
            # id no puede ser la ultima palabra, se prueba el otro lado, y si
            # tampoco cabe NO SE DIBUJA — el seguidor se queda con una viga,
            # que es lo unico que se sabe de el.
            lado = f['id'].rsplit('-', 1)[1] if f.get('id') else None
            if lado in ('E', 'W'):
                n0, n1 = min(-f['zs'], -f['zn']), max(-f['zs'], -f['zn'])
                s0 = -paso_v if lado == 'E' else paso_v
                for s in (s0, -s0):
                    x = round(f['x'] + s, 3)
                    if not libre(x, n0, n1, f.get('id')): continue
                    if s != s0: chocaban += 1
                    g['x'] = x
                    g['id'] = f['id'][:-1] + ('W' if (s < 0) else 'E')
                    recolocadas += 1; return g
                chocaban += 1
                return None
        sin_regla += 1
        return g

    # ── LOS TRACKERS QUE EL LEVANTAMIENTO NO CUBRE ──────────────────────────
    # En San Jose son 107 de 2.289 (98 «medio» y 9 «completo»): ni una fila
    # medida. Dejarlos fuera hacia que «planta entera» fueran 2.182 trackers,
    # con huecos en el render y en la sombra. Se emiten con `est` = 1 y TODO lo
    # que se puede MEDIR del plano, nada inventado:
    #   · x de sus dos vigas: la del layout y su hermana a un paso (lo mismo
    #     que ya se hace con la hermana duplicada);
    #   · n: el centro que da el layout (verificado: es el centro de la fila,
    #     mediana 0,09 m) mas/menos el largo que RESUELVE la geometria — de la
    #     separacion a su vecino pegado de la misma columna, descontando el
    #     hueco medido entre trackers consecutivos (0,69 m). En San Jose da
    #     37,64 m para los «medio» y 74,40 para los «completo»: 16 y 32 modulos
    #     por string con el modulo del levantamiento (37,76 y 74,43 esperados);
    #   · cota: el PLANO del terreno ajustado por minimos cuadrados a los
    #     extremos de las filas levantadas mas cercanas.
    # La cota NO esta medida y por eso van marcados: la pagina lo declara y
    # `export_consignas.mjs` no les manda consigna.
    centros = [(TK[i]['x'], TK[i]['n'], i) for i in range(len(TK))]
    porcol = {}
    for x, n, i in centros:
        porcol.setdefault(round(x, 1), []).append((n, i))
    for v in porcol.values(): v.sort()
    largo_med = {}
    for i, v in asign.items():
        largo_med[i] = abs(v[0]['zn'] - v[0]['zs'])
    hue = []
    for v in porcol.values():
        for (na, ia), (nb, ib) in zip(v, v[1:]):
            if ia in largo_med and ib in largo_med:
                hue.append((nb - na) - (largo_med[ia] + largo_med[ib]) / 2)
    hueco = sorted(hue)[len(hue) // 2] if hue else 0.7
    # puntos del terreno levantado: (x, n, y) de cada extremo de cada fila
    suelo = []
    for i, v in asign.items():
        for f in v:
            suelo.append((f['x'], -f['zs'], f['ys'])); suelo.append((f['x'], -f['zn'], f['yn']))

    # DE QUE LADO DEL EJE DEL LAYOUT CAEN LAS DOS VIGAS. No es una regla fija
    # de planta —el reparto lo decide por el BORDE del bloque, donde se acaban
    # las vigas—, asi que aqui se LEE de los trackers levantados de alrededor:
    # cada bifila completa dice si la x del plano es su viga oeste o su este.
    lados_med = []                     # (x, n, +1 si el plano marca la OESTE)
    for i, v in asign.items():
        if len(v) != 2 or not paso_v: continue
        xl, xs = TK[i]['x'], sorted(f['x'] for f in v)
        if   abs(xs[0] - xl) < paso_v * 0.5: lados_med.append((xl, TK[i]['n'], +1))
        elif abs(xs[1] - xl) < paso_v * 0.5: lados_med.append((xl, TK[i]['n'], -1))

    def lado_layout(i, k=12):
        """+1 si la x del plano es la viga OESTE del tracker i (la gemela va un
           paso al ESTE), -1 si es la este. Voto de los levantados mas cercanos."""
        if not lados_med: return -1
        x0, n0 = TK[i]['x'], TK[i]['n']
        cer = sorted(lados_med, key=lambda q: (q[0] - x0) ** 2 + (q[1] - n0) ** 2)[:k]
        return 1 if sum(q[2] for q in cer) >= 0 else -1

    def largo_de(i):
        """Largo del tracker i resuelto por su vecino PEGADO de la misma columna."""
        v = porcol[round(TK[i]['x'], 1)]
        j = next(k for k, (nn, ii) in enumerate(v) if ii == i)
        cand = [2 * (abs(v[k][0] - v[j][0]) - hueco - largo_med[v[k][1]] / 2)
                for k in (j - 1, j + 1) if 0 <= k < len(v) and v[k][1] in largo_med]
        return min(cand) if cand else None

    def plano_en(px, pn, k=16):
        """Cota del terreno en (px,pn) desde los k puntos levantados mas
           cercanos: el plano ajustado por minimos cuadrados si cae DENTRO del
           rango de esos vecinos, y si no la media ponderada por distancia.

           El plano solo se acepta acotado porque, con los puntos casi
           alineados (un borde de la planta, una franja), esta mal condicionado
           y extrapola: daba cotas de -61 m donde el terreno medido llega a
           -52, y el control de entrada del relieve rechazaba el bloque entero
           por «fila anomala». Interpolar nunca puede salirse de lo que se
           interpola."""
        cer = sorted(suelo, key=lambda q: (q[0] - px) ** 2 + (q[1] - pn) ** 2)[:k]
        if len(cer) < 3: return sum(q[2] for q in cer) / len(cer) if cer else 0.0
        lo = min(q[2] for q in cer); hi = max(q[2] for q in cer)

        def idw():
            num = den = 0.0
            for q in cer:
                d2 = (q[0] - px) ** 2 + (q[1] - pn) ** 2
                if d2 < 1e-6: return q[2]
                wq = 1.0 / d2; num += wq * q[2]; den += wq
            return num / den
        n_ = len(cer)
        sx = sum(q[0] for q in cer); sn = sum(q[1] for q in cer); sy = sum(q[2] for q in cer)
        sxx = sum(q[0] * q[0] for q in cer); snn = sum(q[1] * q[1] for q in cer)
        sxn = sum(q[0] * q[1] for q in cer); sxy = sum(q[0] * q[2] for q in cer); sny = sum(q[1] * q[2] for q in cer)
        A = [[n_, sx, sn], [sx, sxx, sxn], [sn, sxn, snn]]; B = [sy, sxy, sny]
        for cidx in range(3):                      # Gauss con pivoteo parcial
            piv = max(range(cidx, 3), key=lambda r: abs(A[r][cidx]))
            if abs(A[piv][cidx]) < 1e-9: return idw()
            A[cidx], A[piv] = A[piv], A[cidx]; B[cidx], B[piv] = B[piv], B[cidx]
            for r in range(cidx + 1, 3):
                fct = A[r][cidx] / A[cidx][cidx]
                for cc in range(cidx, 3): A[r][cc] -= fct * A[cidx][cc]
                B[r] -= fct * B[cidx]
        z = [0.0] * 3
        for r in (2, 1, 0):
            if abs(A[r][r]) < 1e-9: return idw()
            z[r] = (B[r] - sum(A[r][cc] * z[cc] for cc in range(r + 1, 3))) / A[r][r]
        val = z[0] + z[1] * px + z[2] * pn
        return val if lo - 0.5 <= val <= hi + 0.5 else idw()

    # SESGO DE MONTAJE, fila a fila. Los largos medidos se apartan del nominal
    # lo mismo en toda la planta, pero el sesgo hay que sacarlo COMPARANDO CADA
    # FILA CON SU PROPIO NOMINAL. Antes se restaba el nominal de UN tipo (el
    # primero que apareciera) a la mediana de TODOS los largos, y eso solo
    # funciona si la planta tiene un unico tipo: en San Jose, con 2.191
    # seguidores «completo» de 74 m y 98 «medio» de 37, la mediana era la de
    # los largos y el nominal el de los cortos — un reconstruido salio de
    # 111,10 m para 32 modulos.
    sesgo_med = 0.0
    if MOD.get('modW'):
        _w, _gm, _gd = MOD['modW'], MOD.get('gapMod', 0.0), MOD.get('gapDrive', 0.0)
        _nom = lambda m: 2 * m * _w + (2 * m - 2) * _gm + _gd
        _d = [abs(f['zn'] - f['zs']) - _nom(int(f['mods']))
              for v in asign.values() for f in v if f.get('mods')]
        if _d:
            _d.sort()
            sesgo_med = _d[len(_d) // 2]
    estimados, sin_geom = 0, 0
    # LARGO TIPICO POR TIPO. Primero, de lo MEDIDO: cada fila del levantamiento
    # trae sus modulos por string, asi que el tipo del plano se resuelve
    # leyendolos, no estimando distancias. En San Jose sale unanime —«completo»
    # 32 modulos y «medio» 16, con p25 = p75 en los cuatro grupos—, y ademas
    # cubre los tipos raros: los 98 seguidores «medio» se quedaban sin largo
    # cuando apenas hay sin medir de los que aprender, y sus trackers caian a
    # None. Se exigen 3 casos y acuerdo, como abajo.
    md_tipo = {}
    _med = defaultdict(list)
    for i, v in asign.items():
        for f in v:
            if f.get('mods'):
                _med[TK[i].get('t')].append(int(f['mods']))
    for _t, _v in _med.items():
        _v.sort()
        if len(_v) >= 3 and _v[3 * len(_v) // 4] - _v[len(_v) // 4] <= 1:
            md_tipo[_t] = _v[len(_v) // 2]
    # y si algun tipo sigue sin resolver, la via anterior: la separacion a un
    # vecino entre los NO levantados
    if MOD.get('modW'):
        _w, _gm, _gd = MOD['modW'], MOD.get('gapMod', 0.0), MOD.get('gapDrive', 0.0)
        _acc = {}
        for i in range(len(TK)):
            if i in asign: continue
            _L = largo_de(i)
            if _L and 5 < _L < 200:
                _acc.setdefault(TK[i].get('t'), []).append(int(round((_L - _gd + 2 * _gm) / (2 * (_w + _gm)))))
        for _t, _v in _acc.items():
            _v.sort()
            # solo se acepta el tipo si sus casos CONCUERDAN (la mitad central
            # dentro de un modulo): si no, no hay largo tipico y no se emite
            if _t not in md_tipo and len(_v) >= 5 and _v[3 * len(_v) // 4] - _v[len(_v) // 4] <= 1:
                md_tipo[_t] = _v[len(_v) // 2]

    def del_plano(i):
        """Las dos filas de un tracker NO levantado, con la geometria del plano
           y la cota del terreno vecino. None si no se puede resolver."""
        nonlocal estimados, sin_geom
        # SIN FICHA DE MODULO (El Burgo), el largo sale del tipo del plano
        # (layout.tipos_largo, medido en el DWG) y no se cuentan modulos
        TL = L.get('tipos_largo') or {}
        if not (paso_v and papel == 'viga' and (MOD.get('modW') or TK[i].get('t') in TL)): return None
        if not MOD.get('modW'):
            L2 = float(TL[TK[i].get('t')]) + sesgo_med
            xc, nc = TK[i]['x'], TK[i]['n']
            ns, nn = nc - L2 / 2, nc + L2 / 2
            sg = lado_layout(i) * paso_v
            xm = xc + sg / 2
            ys, yn = plano_en(xm, ns), plano_en(xm, nn)
            estimados += 1
            return [{'x': xv, 'zs': -ns, 'zn': -nn, 'ys': ys, 'yn': yn, 'art': 0, 'pa': [],
                     'zm': None, 'ym': None, 'mods': None, 'tk': None} for xv in (xc, round(xc + sg, 3))]
        w, gm, gd = MOD['modW'], MOD.get('gapMod', 0.0), MOD.get('gapDrive', 0.0)
        # El largo se resuelve POR TIPO, no tracker a tracker: la separacion a
        # un vecino suelto lleva ruido (algun caso daba 25 o 36 modulos), pero
        # la mediana de las decenas de casos de cada tipo del layout es firme
        # -- en San Jose 16 modulos/string los «medio» y 32 los «completo».
        md = md_tipo.get(TK[i].get('t'))
        if md is None or md < 4: sin_geom += 1; return None
        # sesgo de montaje: los largos MEDIDOS se apartan del nominal lo mismo
        # en toda la planta (San Jose +0,56 m); se aplica para que las mesas
        # estimadas casen con sus vecinas en vez de dejar una junta falsa
        nom = lambda m: 2 * m * w + (2 * m - 2) * gm + gd
        L2 = nom(md) + sesgo_med
        xc, nc = TK[i]['x'], TK[i]['n']
        ns, nn = nc - L2 / 2, nc + L2 / 2
        # LAS DOS VIGAS DE UN BIFILA COMPARTEN TUBO: su desfase de cota son
        # centimetros (mediana 0,2 m en Ayora). Por eso la cota se evalua en el
        # EJE del tracker y se da igual a las dos, en vez de en la x de cada
        # viga: el plano local, ajustado con pocos puntos y terreno roto, podia
        # separarlas 4 m en los 6,18 m que hay entre ellas — una bifila
        # imposible que el propio control de entrada del relieve cazaba.
        sg = lado_layout(i) * paso_v
        xm = xc + sg / 2
        ys, yn = plano_en(xm, ns), plano_en(xm, nn)
        out = []
        for xv in (xc, round(xc + sg, 3)):
            out.append({'x': xv, 'zs': -ns, 'zn': -nn, 'ys': ys, 'yn': yn,
                        'art': 0, 'pa': [], 'zm': None, 'ym': None, 'mods': md, 'tk': None})
        estimados += 1
        return out

    T = []
    for i in range(len(TK)):
        v = asign.get(i)
        if not v:
            g = del_plano(i)
            if not g: T.append(None); continue
            T.append({'f': [{'id': None, 'x': num(f['x']), 'n': [num(-f['zs']), num(-f['zn'])],
                             'y': [num(f['ys']), num(f['yn'])], 'art': 0, 'pa': [],
                             'nm': None, 'ym': None, 'md': f['mods'], 'ye': 3, 'hm': 0} for f in g],
                      'inc': 0, 'est': 1, 'tk': None, 'zo': None,
                      'sl': None, 'cse': None, 'cso': None, 'ase': None, 'aso': None})
            continue
        filas, inc = [], 1 if len(v) == 1 else 0
        par = v if len(v) == 2 else [x for x in (v[0], hermana(i, v[0])) if x is not None]
        for f in par:
            # n = norte positivo (el asbuilt lo da hacia el sur); y = cota sobre la base
            filas.append({
                # el id de la fila del levantamiento, para poder seguirla hasta
                # el visor y hasta el topografo (la copia lleva el de su lado)
                'id': f.get('id'),
                'x':  num(f['x']),
                'n':  [num(-f['zs']), num(-f['zn'])],      # extremo sur, extremo norte
                'y':  [num(f['ys']),  num(f['yn'])],       # cota medida SOBRE MODULO en cada extremo
                'art': int(f.get('art') or 0),
                # MODULOS POR STRING de esta fila, del levantamiento. Cada fila
                # lleva DOS strings (un ala cada uno): en Ayora 28/21/14 segun
                # el tipo, en San Jose 32 en todas. Sin este dato la tarjeta
                # tenia que deducirlos del largo con un modulo SUPUESTO, y a
                # San Jose se le aplico el de Ayora (1,303 en vez de 1,134).
                'md': int(f['mods']) if f.get('mods') else None,
                'pa': [num(p) for p in (f.get('pa') or [])],
                'nm': num(-f['zm']) if f.get('zm') is not None else None,
                'ym': num(f['ym']) if f.get('ym') is not None else None,
                # QUE PUNTA NO ESTA MEDIDA. Una cota repuesta no puede viajar
                # sin decirlo: 0 = las dos medidas, 1 = la SUR es repuesta,
                # 2 = la NORTE. El error de esa cota va acotado en el meta.
                'ye': {'sur': 1, 'nor': 2, 'amb': 3}.get(f.get('rv1'), 0),
                # CUAL DE LAS DOS VIGAS ES LA COPIA. `inc` ya decia que el
                # tracker se levanto a medias, pero no cual de sus dos vigas
                # se midio: para pintarlas hay que saberlo por VIGA, porque la
                # copia no tiene ni una punta medida. 1 = duplicada de su
                # hermana (misma cota y mismo largo, x del layout).
                'hm': int(f.get('hm') or 0),
                # LOS PUNTOS QUE LO CAUSAN, CON SU DESVIO. Una cota repuesta o
                # copiada tiene detras puntos concretos del levantamiento con la
                # Z en otra referencia: [id, desvio_m] de cada uno, para que el
                # globo de la escena diga lo mismo que el mapa y que la
                # reclamacion. La copia (hm) lleva el id de la fila que se
                # descarto, que es donde estan sus puntos.
                'rp': [[int(q), float(d)] for q, d in pmal.get(f.get('id'), [])]
                      if (f.get('rv1') or f.get('hm')) else [],
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

    if estimados or sin_geom:
        print('%-8s %d tracker(s) sin levantar reconstruidos del plano (geometria medida + cota del terreno vecino, est=1)%s'
              % (planta, estimados, '' if not sin_geom else ', %d sin geometria resoluble' % sin_geom))
    if recolocadas or sin_regla:
        print('%-8s hermana duplicada: %d colocada(s) en su x real (layout = %s, paso %.3f m)%s%s'
              % (planta, recolocadas, papel, paso_v or 0,
                 '' if not sin_regla else ', %d SIN REGLA (se quedan sobre su hermana)' % sin_regla,
                 '' if not chocaban else ', %d chocaban con una viga medida' % chocaban))
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
        # ficha del MODULO, del propio levantamiento: con ella el largo de una
        # fila es 2*md modulos + huecos, y no hay nada que suponer
        'mod':    MOD or None,
        'n_est':  sum(1 for t in T if t and t.get('est')),
        'nota':   'y = cota MEDIDA sobre el modulo, relativa a base. El eje n es norte positivo. '
                  'f[].md = modulos por STRING (cada fila lleva dos, uno por ala). '
                  'f[].ye dice que cotas NO son medida: 0 las dos medidas, 1 la SUR repuesta, '
                  '2 la NORTE repuesta, 3 las dos del plano (tracker reconstruido, est=1). '
                  'f[].hm = 1 marca la viga DUPLICADA de su hermana (el tracker se levanto a '
                  'medias, inc=1): no tiene ninguna punta medida, se copia cota y largo de la '
                  'hermana y se coloca en la x que manda el layout. '
                  'Una punta se repone cuando su punto vino con otra referencia vertical: la '
                  'posicion, el largo y la otra punta siguen siendo medida. Sale de la hermana '
                  'si tiene esa punta sana (error 0,167 m de mediana, p95 0,474, max 1,65 en la '
                  'prueba de dejar-uno-fuera sobre 4.375 filas sanas de San Jose) y si no del '
                  'vecindario (0,418 / 1,337 / 2,76).',
        'n_ye':   sum(1 for t in T if t for f in t['f'] if f.get('ye')),
        'n_hm':   sum(1 for t in T if t for f in t['f'] if f.get('hm')),
        # seguidores emitidos con UNA SOLA viga: su hermana no cabe en ninguno
        # de los dos lados sin pisar una viga MEDIDA de otro seguidor. Un
        # seguidor con una viga no tiene eje de transmision, y asi se dibuja.
        'n_solo': sum(1 for t in T if t and len(t['f']) == 1),
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
