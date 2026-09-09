#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audita la ASIGNACION punto->tracker del levantamiento, contra el CSV crudo.

    python3 tools/audita_asignacion.py <lev_crudo.csv> <asignacion.xlsx> [planta]

QUE AUDITA, Y POR QUE ESTO VA APARTE DEL CONTROL DE COTAS. El control de cotas
(cotas_asbuilt.py) mira si una COTA es creible. Esto mira algo anterior: si el
punto esta colgado del tracker que le toca. Son fallos distintos y se ven de
formas distintas — una cota mala canta contra sus vecinas, una asignacion mala
no canta en ningun sitio, porque la cota es perfectamente normal: lo que esta
mal es de quien se dice que es.

LA PRUEBA QUE LO DESTAPA ES LA DISPERSION. Los puntos de un mismo tracker
tienen que caber en su huella: una bifila son ~6,2 m en X (las dos vigas) y
~75 m en Y (el tubo). Si los puntos de un tracker se reparten cientos de
metros, no hay geometria que lo explique. En San Jose habia 93 trackers asi,
uno de ellos con 44 puntos repartidos 1.082 m en Y y solo 0,5 m en X — una
COLUMNA entera de un eje colgada de un solo tracker.

LO QUE ESTA AUDITORIA NO DICE. No dice cuanto dano hace: eso depende de lo que
haga la cadena despues. En San Jose, el relabelado posterior filtra los puntos
sueltos y al modelo NO le llegan cotas malas — el precio son filas perdidas.
Por eso el veredicto separa las dos cosas: cuantos trackers estan mal asignados
(el defecto) y cuantas filas medidas se pierden por ello (el coste).
"""
import collections
import csv
import json
import math
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# huella de una bifila: las dos vigas en X, el tubo en Y. Con margen generoso —
# esto busca imposibles, no milimetros.
EXT_X, EXT_Y = 15.0, 120.0


def lee_crudo(f):
    P = {}
    for r in csv.reader(open(f, encoding='utf-8-sig')):
        if not r or not r[0].strip():
            continue
        try:
            P[int(float(r[0]))] = (float(r[1]), float(r[2]), float(r[3]))
        except (ValueError, IndexError):
            continue                                  # cabecera o fila suelta
    return P


def lee_asignacion(f):
    import openpyxl
    w = openpyxl.load_workbook(f, read_only=True, data_only=True)
    s = w[w.sheetnames[0]]
    it = s.iter_rows(values_only=True)
    cab = [str(c or '').strip() for c in next(it)]
    ix = {n: cab.index(n) for n in cab}
    cid = ix.get('ID_punto', 0); cx = ix.get('X_punto', 1); cy = ix.get('Y_punto', 2)
    cz = ix.get('Z_punto', 3); ctk = ix.get('Tracker', 4)
    P, dup = {}, 0
    for row in it:
        if row[cid] is None:
            continue
        pid = int(float(row[cid]))
        if pid in P:
            dup += 1
        P[pid] = (float(row[cx]), float(row[cy]), float(row[cz]), str(row[ctk] or '').strip())
    return P, dup


def audita(fCrudo, fAsig, planta='sanjose'):
    C = lee_crudo(fCrudo)
    E, dup = lee_asignacion(fAsig)
    print('AUDITORIA DE LA ASIGNACION PUNTO->TRACKER · ' + planta.upper())
    print('')
    print('1 · EL DATO EN SI (¿se ha copiado bien?)')
    print('    levantamiento crudo : %d puntos' % len(C))
    print('    asignacion          : %d puntos · %d duplicados · %d sin tracker'
          % (len(E), dup, sum(1 for v in E.values() if not v[3])))
    perd = set(C) - set(E); inv = set(E) - set(C)
    print('    puntos del crudo que se pierden : %d' % len(perd))
    print('    puntos que NO estan en el crudo : %d %s'
          % (len(inv), '<- INVENTADOS' if inv else ''))
    com = set(C) & set(E)
    dz = max((abs(C[p][2] - E[p][2]) for p in com), default=0)
    dxy = max((max(abs(C[p][0] - E[p][0]), abs(C[p][1] - E[p][1])) for p in com), default=0)
    print('    |dZ| maximo crudo vs asignacion : %.6f m' % dz)
    print('    |dXY| maximo                    : %.6f m' % dxy)

    porTk = collections.defaultdict(list)
    for pid, (x, y, z, tk) in E.items():
        if tk:
            porTk[tk].append((pid, x, y, z))
    print('')
    print('2 · LA ASIGNACION (¿cada punto cuelga de quien debe?)')
    c = collections.Counter(len(v) for v in porTk.values())
    n8 = c.get(8, 0)
    print('    trackers con puntos : %d' % len(porTk))
    print('    con los 8 esperados (2 vigas x 2 mesas x 2 extremos): %d (%.1f%%)'
          % (n8, 100.0 * n8 / max(1, len(porTk))))
    print('    reparto de puntos por tracker: %s' % dict(sorted(c.items())))

    rotos = []
    for tk, v in porTk.items():
        xs = [p[1] for p in v]; ys = [p[2] for p in v]
        ex, ey = max(xs) - min(xs), max(ys) - min(ys)
        if ex > EXT_X or ey > EXT_Y:
            rotos.append({'tracker': tk, 'puntos': len(v), 'ext_x': round(ex, 1),
                          'ext_y': round(ey, 1),
                          'ids': ' '.join(str(p[0]) for p in sorted(v))})
    rotos.sort(key=lambda r: -r['ext_y'])
    nP = sum(r['puntos'] for r in rotos)
    print('')
    print('    IMPOSIBLES (puntos del mismo tracker a mas de %.0f m en X o %.0f m en Y): %d trackers, %d puntos (%.1f%%)'
          % (EXT_X, EXT_Y, len(rotos), nP, 100.0 * nP / max(1, len(E))))
    for r in rotos[:8]:
        print('      %-16s %2d puntos · X %7.1f m · Y %8.1f m' % (r['tracker'], r['puntos'], r['ext_x'], r['ext_y']))
    if rotos:
        sec = collections.Counter(r['tracker'].split('_')[0] for r in rotos)
        print('      por sector: %s' % dict(sorted(sec.items())))
        dst = os.path.join(RAIZ, 'auditoria_asignacion_' + planta + '.csv')
        with open(dst, 'w', newline='', encoding='utf-8-sig') as fh:
            wr = csv.DictWriter(fh, fieldnames=['tracker', 'puntos', 'ext_x', 'ext_y', 'ids'], delimiter=';')
            wr.writeheader()
            for r in rotos:
                wr.writerow(r)
        print('      -> %s' % os.path.basename(dst))

    # 3 · el COSTE: que pasa con esos trackers aguas abajo
    asb = os.path.join(RAIZ, planta + '_asbuilt.json')
    if os.path.exists(rotos and asb or ''):
        A = json.load(open(asb))
        filas = collections.Counter(f['tk'] for f in A['f'])
        rn = {r['tracker'] for r in rotos}
        sanos = [k for k in filas if k not in rn]
        def perfil(ks):
            return collections.Counter(filas.get(k, 0) for k in ks)
        pierden = [k for k in rn if filas.get(k, 0) < 2]
        totalPerd = sum(2 - filas.get(k, 0) for k in filas if filas.get(k, 0) < 2)
        deRotos = sum(2 - filas.get(k, 0) for k in pierden)
        print('')
        print('3 · EL COSTE AGUAS ABAJO (contra %s)' % os.path.basename(asb))
        print('    filas que sobreviven · rotos : %s' % dict(sorted(perfil(list(rn)).items())))
        print('    filas que sobreviven · sanos : %s' % dict(sorted(perfil(sanos).items())))
        print('    trackers rotos que pierden fila: %d · filas medidas perdidas por ello: %d'
              % (len(pierden), deRotos))
        print('    (de las %d filas perdidas en toda la planta, %d vienen de aqui: %.0f%%)'
              % (totalPerd, deRotos, 100.0 * deRotos / max(1, totalPerd)))

    print('')
    if inv or dz > 1e-6 or dxy > 1e-6:
        print('  VEREDICTO: EL DATO ESTA TOCADO — no solo la asignacion. Parar y mirar eso primero.')
        return 1
    if rotos:
        print('  VEREDICTO: DATO INTACTO, ASIGNACION CON %d TRACKERS IMPOSIBLES.' % len(rotos))
        print('  El levantamiento se ha copiado bit a bit; lo que falla es de quien se dice')
        print('  que es cada punto. Reclamable y arreglable sin volver a campo.')
        return 1
    print('  VEREDICTO: APTA — dato intacto y ningun tracker con puntos imposibles.')
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(audita(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'sanjose'))
