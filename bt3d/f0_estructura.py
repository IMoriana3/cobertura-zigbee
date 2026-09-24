"""BT3D · FASE 0.2 — LA ESTRUCTURA DEL GRAFO DE UNIDADES, por instante.

    python3 -m bt3d.f0_estructura [ayora fayon] [--json=RUTA]

Para cada planta y cada instante de los dos días declarados (21-jun y 21-dic,
cada 5 min, sol > 0,5°; bt3d_parametros.json):
  · unidades: las de la planta, y las que tienen al menos un vecino en el grafo;
  · emisores por receptor: nº de UNIDADES distintas que pueden sombrear a cada
    unidad (grado de entrada del grafo dirigido; la unidad propia no cuenta:
    es la misma variable);
  · componentes conexas (≥ 2 unidades) del grafo no dirigido, y su tamaño;
  · ANCHURA de árbol de cada componente, como intervalo [inf, sup]
    (bt3d/grafo.py). Se publica la de la componente más ancha del instante;
  · dominio: nº de valores de θ de cada unidad en la rejilla de 0,1° dentro de
    su rango del simulador; el tamaño de la mayor tabla de una programación
    dinámica sobre la descomposición es D^(w+1) — se da su log10 como TAMAÑO,
    no como tiempo, que no se ha medido;
  · coste de esta medida por instante (CPU, time.process_time).
El grafo sale del enumerador por ENVOLVENTE de rotación: es un superconjunto
del verdadero, así que la anchura publicada es una COTA SUPERIOR de la del
problema (la anchura no crece al quitar aristas).
"""
import json
import math
import sys
import time

from . import envolvente, escena, grafo, parametros, sol

import os
REALIZABLE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'audit5', 'out', 'F0_realizable.json')
BANDAS = [(0.5, 1), (1, 2), (2, 3), (3, 5), (5, 10), (10, 15), (15, 20), (20, 30), (30, 45), (45, 91)]


def pct(a, p):
    if not a:
        return 0
    s = sorted(a)
    return s[min(len(s) - 1, int(p * len(s)))]


def por_instante(E, P, planta):
    rho = parametros.rho(P, planta)
    par = parametros.resolver(P, planta, [u['id'] for u in E['unidades']])
    nU = len(E['unidades'])
    filas = []
    for q in E['instantes']:
        t0 = time.process_time()
        s = sol.vector_sol(q['zen'], q['az_malla'])   # el sol en el marco de la planta (convergencia aplicada)
        pm = envolvente.pares(E['mesas'], s, rho)
        ua = escena.aristas_unidades(E, pm)
        est = grafo.estructura(nU, list(ua))
        alc = escena.alcances(E, pm)
        estM = grafo.estructura(nU, list(grafo.moral(alc)))
        cpu = time.process_time() - t0
        tam = [len(h) - 1 for h in alc]
        ent = {}
        for e, r in ua:
            ent[r] = ent.get(r, 0) + 1
        conv = set()
        for e, r in ua:
            conv.add(e)
            conv.add(r)
        D = [int(math.floor((hi - lo) / par[k]['rejilla'] + 1e-9)) + 1 for k, (lo, hi) in enumerate(q['rangos'])]
        ancha = max(est, key=lambda c: (c['anchura_sup'], c['unidades'])) if est else None
        mayor = max((c['unidades'] for c in est), default=0)
        wsup = ancha['anchura_sup'] if ancha else 0
        winf = max((c['anchura_inf'] for c in est), default=0)
        filas.append({
            'fecha': q['fecha'], 'min': q['min'], 'elev': q['elev'], 'az': q['az'],
            'unidades': nU, 'unidades_en_grafo': len(conv), 'aristas': len(ua), 'pares_mesa': len(pm),
            'emisores_por_receptor': {'receptores': len(ent), 'media': (sum(ent.values()) / len(ent)) if ent else 0,
                                      'p50': pct(list(ent.values()), 0.5), 'p90': pct(list(ent.values()), 0.9),
                                      'max': max(ent.values(), default=0)},
            'componentes': len(est), 'mayor_componente': mayor,
            'anchura_inf': winf, 'anchura_sup': wsup,
            'anchura_exacta': bool(est) and all(c['anchura_inf'] == c['anchura_sup'] for c in est),
            'dominio_p50': pct(D, 0.5), 'dominio_max': max(D),
            'log10_tabla_max': (wsup + 1) * math.log10(max(D)) if est else 0,
            'emisores_por_mesa_receptora': {'receptoras': len(tam), 'p50': pct(tam, 0.5), 'p90': pct(tam, 0.9), 'max': max(tam, default=0)},
            'moral_mayor_componente': max((c['unidades'] for c in estM), default=0),
            'moral_anchura_inf': max((c['anchura_inf'] for c in estM), default=0),
            'moral_anchura_sup': max((c['anchura_sup'] for c in estM), default=0),
            'moral_log10_tabla_max': (max((c['anchura_sup'] for c in estM), default=0) + 1) * math.log10(max(D)) if estM else 0,
            'cpu_s': cpu,
        })
    return filas


def resumen(filas):
    out = []
    for a, b in BANDAS:
        F = [f for f in filas if a <= f['elev'] < b]
        if not F:
            continue
        out.append({'banda': '%g-%g°' % (a, b), 'instantes': len(F),
                    'anchura_sup_p50': pct([f['anchura_sup'] for f in F], 0.5), 'anchura_sup_max': max(f['anchura_sup'] for f in F),
                    'anchura_inf_max': max(f['anchura_inf'] for f in F),
                    'exactos': sum(f['anchura_exacta'] for f in F),
                    'mayor_comp_p50': pct([f['mayor_componente'] for f in F], 0.5), 'mayor_comp_max': max(f['mayor_componente'] for f in F),
                    'componentes_p50': pct([f['componentes'] for f in F], 0.5),
                    'emisores_p50_de_p50': pct([f['emisores_por_receptor']['p50'] for f in F], 0.5),
                    'emisores_max': max(f['emisores_por_receptor']['max'] for f in F),
                    'unidades_en_grafo_p50': pct([f['unidades_en_grafo'] for f in F], 0.5),
                    'dominio_p50': pct([f['dominio_p50'] for f in F], 0.5), 'dominio_max': max(f['dominio_max'] for f in F),
                    'log10_tabla_max': max(f['log10_tabla_max'] for f in F),
                    'moral_sup_p50': pct([f['moral_anchura_sup'] for f in F], 0.5), 'moral_sup_max': max(f['moral_anchura_sup'] for f in F),
                    'moral_inf_max': max(f['moral_anchura_inf'] for f in F), 'moral_mayor_comp_max': max(f['moral_mayor_componente'] for f in F),
                    'emisores_mesa_p90_max': max(f['emisores_por_mesa_receptora']['p90'] for f in F),
                    'emisores_mesa_max': max(f['emisores_por_mesa_receptora']['max'] for f in F),
                    'moral_log10_tabla_max': max(f['moral_log10_tabla_max'] for f in F),
                    'cpu_s_p50': pct([f['cpu_s'] for f in F], 0.5), 'cpu_s_max': max(f['cpu_s'] for f in F)})
    return out


def horquilla(pl, E, filas, nU, ruta):
    """anchura del PROBLEMA ∈ [inf del grafo realizado, sup de la envolvente], en los
    instantes muestreados por audit5/F0_realizable.mjs"""
    try:
        with open(ruta, encoding='utf-8') as f:
            R = json.load(f)
    except FileNotFoundError:
        return None
    por = {(f['fecha'], f['min']): f for f in filas}
    uM = [m['u'] for m in E['mesas']]
    out = []
    for q in R['plantas'][pl]['instantes']:
        f = por[(q['fecha'], q['min'])]
        pares_u = {(ue, uM[rr]) for ue, rr in q['aristas_realizadas']}
        alc = {}
        for ue, rr in q['aristas_realizadas']:
            alc.setdefault(rr, {uM[rr]}).add(ue)
        est = grafo.estructura(nU, list(pares_u))
        estM = grafo.estructura(nU, list(grafo.moral(alc.values())))
        mx = lambda L, k: max((c[k] for c in L), default=0)
        out.append({'fecha': q['fecha'], 'min': q['min'], 'elev': q['elev'], 'pares_unidad_mesa_envolvente': q['aristas_envolvente'],
                    'pares_unidad_mesa_realizados': len(q['aristas_realizadas']),
                    'realizado_inf': mx(est, 'anchura_inf'), 'realizado_sup': mx(est, 'anchura_sup'), 'mayor_comp_realizado': mx(est, 'unidades'),
                    'moral_realizado_inf': mx(estM, 'anchura_inf'), 'moral_realizado_sup': mx(estM, 'anchura_sup'), 'moral_mayor_comp_realizado': mx(estM, 'unidades'),
                    'envolvente_sup': f['anchura_sup'], 'moral_envolvente_sup': f['moral_anchura_sup'], 'ms_js': q['ms']})
        if out[-1]['realizado_inf'] > f['anchura_sup'] or out[-1]['moral_realizado_inf'] > f['moral_anchura_sup']:
            raise AssertionError('cota inferior > cota superior en %s %s: el realizado no es subgrafo de la envolvente' % (q['fecha'], q['min']))
    res = []
    for a, b in BANDAS:
        F = [h for h in out if a <= h['elev'] < b]
        if F:
            res.append({'banda': '%g-%g°' % (a, b), 'instantes': len(F),
                        'realizados_sobre_envolvente': sum(h['pares_unidad_mesa_realizados'] for h in F) / max(1, sum(h['pares_unidad_mesa_envolvente'] for h in F)),
                        'pares_inf_max': max(h['realizado_inf'] for h in F), 'pares_sup_max': max(h['envolvente_sup'] for h in F),
                        'moral_inf_max': max(h['moral_realizado_inf'] for h in F), 'moral_sup_max': max(h['moral_envolvente_sup'] for h in F),
                        'moral_inf_p50': pct([h['moral_realizado_inf'] for h in F], 0.5), 'moral_sup_p50': pct([h['moral_envolvente_sup'] for h in F], 0.5),
                        'moral_mayor_comp_realizado_max': max(h['moral_mayor_comp_realizado'] for h in F)})
    return {'k': R['k'], 'cada': R['cada'], 'por_instante': out, 'por_banda': res}


def main(argv):
    plantas = [a for a in argv if not a.startswith('--')] or ['ayora', 'fayon']
    dest = next((a[7:] for a in argv if a.startswith('--json=')), '')
    P = parametros.cargar()
    todo = {}
    for pl in plantas:
        E = escena.cargar(pl)
        filas = por_instante(E, P, pl)
        R = resumen(filas)
        todo[pl] = {'ver': E['ver'], 'mesas': len(E['mesas']), 'unidades': len(E['unidades']), 'instantes': len(filas),
                    'rho_m': parametros.rho(P, pl), 'por_banda': R, 'por_instante': filas}
        print('\n═══ %s · %s · %d mesas · %d unidades · %d instantes (%s) · ρ = %.3f m ═══' % (
            pl.upper(), E['ver'], len(E['mesas']), len(E['unidades']), len(filas),
            ' y '.join(sorted({f['fecha'] for f in filas})), parametros.rho(P, pl)))
        print('  elevación  inst  anchura sup p50/máx  inf máx  exactos  mayor comp p50/máx  comps p50  emisores/receptor p50 · máx  en grafo p50  dominio p50/máx  log10 tabla máx  CPU p50/máx s')
        for r in R:
            print('  %-9s %5d  %8d / %-4d  %7d  %4d/%-4d %8d / %-5d %8d  %14d · %-4d %11d  %7d / %-5d %12.1f   %.3f / %.3f' % (
                r['banda'], r['instantes'], r['anchura_sup_p50'], r['anchura_sup_max'], r['anchura_inf_max'], r['exactos'], r['instantes'],
                r['mayor_comp_p50'], r['mayor_comp_max'], r['componentes_p50'], r['emisores_p50_de_p50'], r['emisores_max'],
                r['unidades_en_grafo_p50'], r['dominio_p50'], r['dominio_max'], r['log10_tabla_max'], r['cpu_s_p50'], r['cpu_s_max']))
        H = horquilla(pl, E, filas, len(E['unidades']), REALIZABLE)
        if H:
            todo[pl]['horquilla'] = H
            print('  ANCHURA DEL PROBLEMA (dominio = el rango del BT3D: cono del comentario, convergencia aplicada) · %d instantes (1 de cada %d) · rejilla de %d θ por rango para el realizado' % (len(H['por_instante']), H['cada'], H['k']))
            print('  elevación  inst  realizados/envolvente   PARES: anchura ∈ [inf real., sup env.]   MORAL: anchura máx ∈ [inf, sup] · p50 ∈ [inf, sup]   mayor comp. moral realizada')
            for r in H['por_banda']:
                print('  %-9s %5d  %18.1f %%   %30s   %18s · %-14s %12d' % (r['banda'], r['instantes'], 100 * r['realizados_sobre_envolvente'],
                      '[%d, %d]' % (r['pares_inf_max'], r['pares_sup_max']), '[%d, %d]' % (r['moral_inf_max'], r['moral_sup_max']),
                      '[%d, %d]' % (r['moral_inf_p50'], r['moral_sup_p50']), r['moral_mayor_comp_realizado_max']))
        print('  GRAFO MORAL de la envolvente (alcance de cada mesa receptora = su unidad + las que la pueden sombrear, en clique)')
        print('  elevación  inst  emisores por mesa receptora p90 máx · máx   anchura moral sup p50/máx  inf máx  mayor comp máx  log10 tabla máx')
        for r in R:
            print('  %-9s %5d  %25d · %-4d  %14d / %-4d  %7d  %14d  %15.1f' % (r['banda'], r['instantes'], r['emisores_mesa_p90_max'], r['emisores_mesa_max'],
                  r['moral_sup_p50'], r['moral_sup_max'], r['moral_inf_max'], r['moral_mayor_comp_max'], r['moral_log10_tabla_max']))
        tot = sum(f['cpu_s'] for f in filas)
        print('  CPU total de la medida: %.1f s (%.3f s/instante)' % (tot, tot / len(filas)))
    if dest:
        with open(dest, 'w', encoding='utf-8') as f:
            json.dump(todo, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
