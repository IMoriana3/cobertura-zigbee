#!/usr/bin/env python3
"""Zanjas de Fayón a partir del P07 (TRAZADO Y SECCIÓN DE ZANJAS), clasificadas POR COLOR.

El P07 SÍ trae leyenda; lo que pasa es que su texto va vectorizado (contornos, no glifos), así
que buscarla con extracción de texto no devuelve nada.  Está en la esquina inferior izquierda de
la hoja, en x_pt 150..168, y son cinco filas:

    azul     (0,0,1)       ZANJA DE BAJA TENSIÓN C.C.
    amarillo (1,1,0)       ZANJA DE BAJA TENSIÓN A.C.
    naranja  (1,.247,0)    ZANJA DE BAJA TENSIÓN C.C. + A.C.
    magenta  (1,0,.749)    ZANJA DE ALTA TENSIÓN
    magenta relleno        ARQUETA PREFABRICADA DE HORMIGÓN 600x600 mm CON TAPA METÁLICA

GEORREFERENCIA — semejanza pura pt→m (sin rotación) heredada del ajuste sobre los 24 seguidores
dibujados en el propio PDF (0,74 m de residuo medio).  Sus dos anclajes son los trazos de la
leyenda, que caen en coordenadas exactas conocidas.  Se comprueba contra el layout:
  · la espina naranja pasa a 1,2-3,0 m de los CUATRO inversores del DWG
  · las 27 zanjas azules van a 0,0-5,4 m del eje de un seguidor (paso entre filas: 12,0 m)

CONFLICTO CON EL DWG — el P07 dibuja el CT en (53,74 . -39,77), alineado con los ejes y de
5,99 x 3,02 m; el DWG de layout lo pone en (51,25 . -47,52) girado 34 grados, y ahí no hay nada
en el P07 ni al revés.  Son 8,14 m.  El P07 es de NOV 23 rev. 0 y el DWG es de 14-02-2025: el CT
se movió y las zanjas no se redibujaron.  NO se estiran ni se desplazan para que casen.

El símbolo de arqueta se dibuja en el plano a ~0,87 m de lado, pero la leyenda dice 600x600 mm:
se emite el cuadrado REAL de 0,60 m centrado en el símbolo, igual que en El Burgo.
"""
import json, math, sys
import pymupdf

PDF = sys.argv[1] if len(sys.argv) > 1 else 'P07__TRAZADO_Y_SECCI_N_DE_ZANJAS.pdf'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'fayon_networks.json'

S, U, V = 0.249417, -141.285, 154.400          # x_m = S*x_pt + U ; n_m = -S*y_pt + V
T = lambda q: [round(S * q[0] + U, 2), round(-S * q[1] + V, 2)]

# color -> (capa del visor, qué es según la leyenda)
COLORES = [
    ((0.0, 0.0, 1.0),     'trench_string', 'baja tensión C.C. (string → inversor)'),
    ((1.0, 0.247, 0.0),   'trench_inv',    'baja tensión C.C. + A.C. (espina que recorre los inversores)'),
    ((1.0, 1.0, 0.0),     'trench_n3',     'baja tensión A.C. (inversor → CT)'),
    ((1.0, 0.0, 0.749),   'trench_mt',     'alta tensión (salida del CT)'),
]
X_DIBUJO = 1000.0      # a la derecha están las secciones y el cajetín, no la planta
X_LEYENDA = -95.0      # en metros: los trazos de la leyenda caen en x ≈ -104..-99


def polilineas(items):
    """Encadena los operadores 'l' consecutivos en polilíneas."""
    out, cur = [], []
    for o in items:
        if o[0] != 'l':
            if len(cur) > 1:
                out.append(cur)
            cur = []
            continue
        a, b = o[1], o[2]
        if cur and abs(cur[-1][0] - a.x) < 1e-6 and abs(cur[-1][1] - a.y) < 1e-6:
            cur.append([b.x, b.y])
        else:
            if len(cur) > 1:
                out.append(cur)
            cur = [[a.x, a.y], [b.x, b.y]]
    if len(cur) > 1:
        out.append(cur)
    return out


def main():
    pag = pymupdf.open(PDF)[0]
    dib = [it for it in pag.get_drawings() if it.get('color') and it['rect'].x0 <= X_DIBUJO]
    capas, meta = {}, {}

    for rgb, capa, desc in COLORES:
        pls = []
        for it in dib:
            if tuple(round(v, 3) for v in it['color']) != rgb:
                continue
            if (it.get('width') or 0) < 1.0:      # los símbolos de arqueta van con grosor 0
                continue
            for pl in polilineas(it['items']):
                m = [T(q) for q in pl]
                if all(q[0] < X_LEYENDA for q in m):    # el trazo de muestra de la leyenda
                    continue
                pls.append(m)
        if pls:
            capas[capa] = pls
            largo = sum(math.dist(a, b) for pl in pls for a, b in zip(pl, pl[1:]))
            meta[capa] = '%s · %d polilíneas · %.0f m' % (desc, len(pls), largo)

    # arquetas: cuadrados magenta rellenos (cada uno viene partido en dos subtrazados)
    cen = []
    for it in dib:
        if tuple(round(v, 3) for v in it['color']) != (1.0, 0.0, 0.749):
            continue
        if (it.get('width') or 0) >= 1.0:
            continue
        r = it['rect']
        q = T(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
        for g in cen:
            if math.dist(q, g[0]) < 1.5:
                g.append(q)
                break
        else:
            cen.append([q])
    arq = []
    for g in cen:
        cx = sum(q[0] for q in g) / len(g)
        cn = sum(q[1] for q in g) / len(g)
        if cx < X_LEYENDA:                                  # el símbolo de muestra de la leyenda
            continue
        h = 0.30                                            # 600x600 mm reales, no el símbolo
        arq.append([[round(cx - h, 2), round(cn - h, 2)], [round(cx - h, 2), round(cn + h, 2)],
                    [round(cx + h, 2), round(cn + h, 2)], [round(cx + h, 2), round(cn - h, 2)],
                    [round(cx - h, 2), round(cn - h, 2)], [round(cx + h, 2), round(cn + h, 2)]])
    if arq:
        capas['arqueta'] = arq
        meta['arqueta'] = 'arqueta prefabricada de hormigón 600x600 mm con tapa metálica · %d ud' % len(arq)

    doc = {
        'planta': 'fayon',
        'fuente': 'P07 TRAZADO Y SECCION DE ZANJAS (PDF del proyecto)',
        'georreferencia': ('semejanza pura pt->m (sin rotacion): x = 0,249417*x_pt - 141,285 ; '
                           'n = -0,249417*y_pt + 154,400. Escala 0,249417 m/pt, del ajuste sobre los '
                           '24 seguidores dibujados en el propio PDF (residuo medio 0,74 m, max 1,89)'),
        'clasificacion': ('POR COLOR, leido de la leyenda del propio P07 (esquina inferior izquierda, '
                          'x_pt 150..168): azul = BT C.C., amarillo = BT A.C., naranja = BT C.C. + A.C., '
                          'magenta = alta tension, cuadrado magenta = arqueta 600x600'),
        'comprobacion': ('la espina naranja (C.C.+C.A.) pasa a 2,29 / 1,16 / 2,55 / 2,98 m de los cuatro '
                         'inversores del layout, y las zanjas azules van a 0,0-5,4 m del eje de un seguidor '
                         '(mediana 1,84 m) con un paso entre filas de 12,0 m'),
        'discrepancia_ct': ('OJO: el P07 dibuja el CT en (53,74 . -39,77), alineado con los ejes y de '
                            '5,99 x 3,02 m. El DWG de layout lo pone en (51,25 . -47,52), girado 34 deg '
                            '(rectangulo de 3 x 6 m) — comprobado con los 24 INSERT PFV-Seguidor del propio '
                            'DWG, residuo 0,003 m, y en el DWG NO hay nada en la posicion del P07. Son 8,14 m '
                            'de diferencia. El P07 es de NOV 23 revision 0 y el DWG es Layout_PFV_Fayon_140225 '
                            '(14-02-2025): el CT se movio entre una y otra y las zanjas no se redibujaron. Por '
                            'eso el tramo de A.C. (4,3 m) muere a 8 m del CT actual y la zanja de alta tension '
                            'arranca al norte de el en vez de salir de su puerta. Las zanjas se dejan DONDE LAS '
                            'DIBUJA SU PLANO: no se estiran ni se desplazan para que casen.'),
        'capas': meta,
        'layers': capas,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    for k, v in meta.items():
        print('%-14s %s' % (k, v))


if __name__ == '__main__':
    main()
