"""BT3D · fase 0.2 — tamaño de la mayor tabla de una programación dinámica sobre
la descomposición del grafo MORAL, D^(w+1), por banda de elevación. Es TAMAÑO,
no tiempo (el tiempo no está medido). d* = dominio por unidad que haría falta
para que la mayor tabla quepa en 10^8 celdas: presupuesto DECLARADO.

    python3 -m bt3d.f0_peldano   (lee audit5/out/F0_estructura.json)
"""
import json
import math
import os

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'audit5', 'out', 'F0_estructura.json')
B = [(0.5, 3), (3, 5), (5, 10), (10, 15), (15, 20), (20, 30), (30, 45), (45, 91)]


def pct(L, p):
    s = sorted(L)
    return s[min(len(s) - 1, int(p * len(s)))]


def main():
    J = json.load(open(RUTA))
    print('PELDAÑO · mayor tabla D^(w+1) del grafo MORAL · w = cota superior de la envolvente · D = θ de la rejilla de 0,1° en el rango del BT3D')
    print('d* = dominio por unidad para que la mayor tabla quepa en 10^8 celdas (presupuesto DECLARADO, no medido)')
    for pl in ['ayora', 'fayon']:
        H = {(h['fecha'], h['min']): h for h in J[pl]['horquilla']['por_instante']}
        print('\n%s' % pl.upper())
        print('  elevación  inst   w problema p50 [inf,sup]   w sup máx   D p50   log10 tabla p50 / máx    d* (p50 / peor)')
        for a, b in B:
            F = [f for f in J[pl]['por_instante'] if a <= f['elev'] < b]
            if not F:
                continue
            ws = [f['moral_anchura_sup'] for f in F]
            wi = [H[(f['fecha'], f['min'])]['moral_realizado_inf'] for f in F]
            lt = [(f['moral_anchura_sup'] + 1) * math.log10(f['dominio_max']) for f in F]
            w50, wmax = pct(ws, .5), max(ws)
            print('  %-9s %4d   %14s            %4d   %5d   %10.1f / %-6.1f   %6.1f / %.1f' % (
                '%g-%g°' % (a, b), len(F), '[%d, %d]' % (pct(wi, .5), w50), wmax, pct([f['dominio_p50'] for f in F], .5),
                pct(lt, .5), max(lt), 10 ** (8 / (w50 + 1)), 10 ** (8 / (wmax + 1))))


if __name__ == '__main__':
    main()
