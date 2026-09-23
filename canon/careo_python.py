#!/usr/bin/env python3
"""R4 · FASE 4.4 — EL LADO PYTHON DEL CAREO.

Lee `canon/vectores.json` y produce, para cada geometria e instante, el theta
de cada politica que `tracker3d.py` SI tiene. Las que no tiene se publican con
su nombre y el motivo, en vez de desaparecer de la tabla.

TRES COSAS QUE ESTE GUION NO HACE, y las tres son parte del hallazgo:

1. NO inventa una geometria por mesa. El modelo de `tracker3d.py` es
   `PlantTerrain3D` = lista de `RowPairTerrain` con UN `axis_tilt_deg` por
   pareja; «mesa» no aparece en sus 2.186 lineas. Cuando el vector trae
   torsion POR MESA se declara `PROYECCION_NECESARIA`, se dice que se ha
   usado el unico dato de nivel pareja que el vector trae, y se listan las
   proyecciones posibles SIN ELEGIR NINGUNA. Elegirla es la decision 4.5 del
   titular: una proyeccion mal elegida convierte «los motores discrepan» en
   «les hemos hecho preguntas distintas», que es justo lo que el careo tiene
   que evitar.

2. NO recalcula la posicion solar. Usa el zen/az que el vector congela. Si
   cada motor calculara el suyo, el careo mediria la diferencia entre dos
   modelos de efemerides ademas de la de backtracking, y no habria forma de
   saber cual de las dos ve.  El indice temporal que se construye aqui SOLO
   lo consume `pvlib.irradiance.get_extra_radiation`, que depende del dia del
   ano y nada mas; el dia del ano es el del vector.

3. NO decide quien tiene razon. Publica dos columnas.

    python3 canon/careo_python.py > canon/out/careo_py.json
"""
import json, os, sys, hashlib

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(os.path.dirname(RAIZ), 'SolarGPTfull', 'solargpt'))

import numpy as np
import pandas as pd
from solargpt_core import tracker3d as t3d

VEC = os.path.join(AQUI, 'vectores.json')
crudo = open(VEC, 'rb').read()
sha = hashlib.sha256(crudo).hexdigest()
esperado = open(os.path.join(AQUI, 'vectores.sha256')).read().split()[0]
if sha != esperado:
    sys.exit(f'los vectores no son los sellados: {sha} != {esperado}')
V = json.loads(crudo)

INST = [i for i in V['instantes'] if not i.get('NO_EXISTE')]
ZEN = np.array([float(i['sol']['zen']) for i in INST])
AZI = np.array([float(i['sol']['az']) for i in INST])
IDX = pd.DatetimeIndex([pd.Timestamp('2025-01-01', tz='UTC')
                        + pd.Timedelta(days=int(i['doy']) - 1, minutes=int(i['minuto']))
                        for i in INST])
SOLPOS = pd.DataFrame({'apparent_zenith': ZEN, 'azimuth': AZI}, index=IDX)
METEO = pd.DataFrame({'GHI': [float(i['cielo']['ghi']) for i in INST],
                      'DNI': [float(i['cielo']['dni']) for i in INST],
                      'DHI': [float(i['cielo']['dhi']) for i in INST]}, index=IDX)

# Cada politica del JS: como se llama en el Python, o por que no esta.
# El segundo campo es la aridad — `mgl`, `true3d` y `optimal` devuelven
# (angulos, detalle) y tomar el par entero como array fue el primer fallo de
# este guion: salia `inhomogeneous shape` y parecia un hallazgo del motor.
MAPA = {
    'astro':    dict(fn='compute_theta_full_tracking', tupla=False),
    'pairwise': dict(fn='compute_bt_angles',           tupla=False),
    'row':      dict(fn='compute_bt_angles_rowwise',   tupla=False),
    'global':   dict(fn='compute_bt_angles_global',    tupla=False),
    'true3d':   dict(fn='compute_bt_angles_3d',        tupla=False),
    'mgl':      dict(fn='compute_bt_angles_min_ground_light', tupla=True),
    'optimal':  dict(fn='compute_bt_angles_energy_optimal',   tupla=True, meteo=True),
    'bt2d':     dict(fn=None, no='NO EXISTE en tracker3d.py'),
    'optfree':  dict(fn=None, no='NO EXISTE en tracker3d.py'),
}


def terreno_de(g):
    """PlantTerrain3D desde un vector. Devuelve (terreno, aviso_de_proyeccion)."""
    pares = [t3d.RowPairTerrain(cross_axis_slope_deg=float(p['slope']),
                                pitch_m=float(p['pitch']),
                                axis_tilt_deg=float(p['axisTilt'])) for p in g['pairs']]
    T = t3d.PlantTerrain3D(pairs=pares, collector_width_m=float(g['cw']),
                           axis_azimuth_deg=float(g['axisAz']), max_angle_deg=float(g['maxAngle']),
                           gcr=float(g['gcr']), surface_to_axis_offset_m=float(g['z0']),
                           n_bypass_diodes=int(g['nBypass']))
    aviso = None
    if g.get('segTilt'):
        mx, nmesas = 0.0, 0
        for r, fila in enumerate(g['segTilt']):
            base = float(g['rowTilt'][r]) if r < len(g['rowTilt']) else 0.0
            nmesas += len(fila)
            for v in fila:
                mx = max(mx, abs(float(v) - base))
        if mx > 1e-9:
            aviso = {
                'PROYECCION_NECESARIA': True,
                'torsion_max_deg': round(mx, 6),
                'mesas': nmesas,
                'por_que': ('el vector trae un tilt POR MESA y PlantTerrain3D solo admite uno POR '
                            'PAREJA: la entrada del JS no se puede expresar en el modelo Python'),
                'lo_que_se_ha_usado': ('`pairs[].axisTilt`, el tilt de LINEA que el propio vector trae '
                                       'a nivel de pareja — NO es una proyeccion elegida, es el unico '
                                       'dato de ese nivel que existe'),
                'opciones_para_4.5': ['media de las mesas de la pareja',
                                      'peor caso (max |tilt|)',
                                      'no proyectar: declarar el caso NO CAREABLE hasta que el motor '
                                      'Python tenga geometria por mesa'],
            }
    return T, aviso


def commit_motor():
    """El commit del repo del que sale `tracker3d.py`.

    Va en la salida porque la columna Python de este careo se CONGELA en
    `canon/out/careo_py.json` y se lee desde CI, donde `SolarGPTfull` no esta
    clonado. Sin este campo, una columna vieja pasaria por actual sin que nadie
    lo notara — que es exactamente el vicio que el careo persigue."""
    import subprocess
    try:
        return subprocess.run(['git', '-C', os.path.dirname(os.path.dirname(os.path.dirname(t3d.__file__))),
                               'rev-parse', 'HEAD'], capture_output=True, text=True, timeout=10).stdout.strip() or 'NO DISPONIBLE'
    except Exception as e:
        return f'NO DISPONIBLE: {type(e).__name__}'


salida = {'vectores_sha256': sha, 'contrato_version': V['contrato_version'],
          'motor_python_commit': commit_motor(),
          'instantes': [{'dia': i['dia'], 'elev': i['elev_objetivo']} for i in INST],
          'entorno': {'numpy': np.__version__, 'pandas': pd.__version__,
                      'tracker3d': os.path.relpath(t3d.__file__, os.path.dirname(RAIZ))},
          'casos': []}

for g in V['geometrias']:
    T, aviso = terreno_de(g)
    caso = {'id': g['id'], 'proyeccion': aviso, 'theta': {}}
    for pol, m in MAPA.items():
        if m['fn'] is None:
            caso['theta'][pol] = {'SIN_CONTRAPARTE': m['no']}
            continue
        try:
            f = getattr(t3d, m['fn'])
            r = (f(SOLPOS, METEO, T) if m.get('meteo') else f(ZEN, AZI, T))
            th = r[0] if m['tupla'] else r
            caso['theta'][pol] = np.asarray(th, dtype=float).round(6).tolist()
        except Exception as e:                       # se DICE, no se calla
            caso['theta'][pol] = {'ERROR': f'{type(e).__name__}: {e}'}
    salida['casos'].append(caso)

print(json.dumps(salida, ensure_ascii=False))
