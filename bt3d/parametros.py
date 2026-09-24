"""Los parámetros declarados, lado Python. Gemelo de audit5/lib_parametros.mjs.

Ningún valor está escrito aquí: todo sale de audit5/bt3d_parametros.json. El
banco audit5/test_parametros.mjs compara el texto canónico de los dos lados y
cae si difieren en un carácter.

    python3 -m bt3d.parametros <planta> <id> [<id> ...]   → texto canónico
"""
import json
import math
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'audit5', 'bt3d_parametros.json')


def cargar(ruta=RUTA):
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def rho(P, planta):
    pl, e = P['plantas'][planta], P['envolvente']
    return math.hypot(pl['cuerda_m'] / 2, pl['z0_m'] + e['canto_m']) + e['margen_m']


def resolver(P, planta, ids):
    if planta not in P['plantas']:
        raise KeyError('planta no declarada: %s' % planta)
    pl, r = P['plantas'][planta], rho(P, planta)
    por = pl.get('theta_max_por_unidad') or {}
    conv = (pl.get('convergencia_deg') or 0) if P['aplicar_convergencia'] else 0
    return [{
        'id': str(i),
        'theta_max': por[str(i)] if por.get(str(i)) is not None else pl['theta_max_deg'],
        'cuerda': pl['cuerda_m'], 'z0': pl['z0_m'], 'nb': pl['nb'], 'axis_az': pl['axis_az_deg'],
        'rejilla': P['rejilla_deg'], 'banda_muerta': P['banda_muerta_deg'], 'aoi_haz': P['aoi_haz_deg'],
        'margen_rango': P['margen_rango_deg'], 'rho': r, 'tau_a_pvlib': P['convencion_signo']['tau_a_pvlib_signo'],
        'convergencia': conv,
        'cono_haz': P['cono_haz'],
    } for i in ids]


def _num(v):
    if v is None:
        return 'null'
    if float(v).is_integer():
        return str(int(v))
    return '%.9f' % v


def canon(tabla):
    lineas = []
    for u in tabla:
        partes = []
        for k in sorted(u):
            v = u[k]
            partes.append('%s=%s' % (k, _num(v) if (v is None or isinstance(v, (int, float))) else v))
        lineas.append(';'.join(partes))
    return '\n'.join(lineas)


if __name__ == '__main__':
    P = cargar(os.environ.get('BT3D_PARAMETROS', RUTA))
    sys.stdout.write(canon(resolver(P, sys.argv[1], sys.argv[2:])))
