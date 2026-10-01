#!/usr/bin/env python3
"""R4 · ENCARGO A — el lado pvlib del astronomico, sobre el mismo barrido de tau.

    python3 audit4/A_astro_py.py > audit4/out/A_astro_py.json

Lee `audit4/out/A_astro_js.json` para tomar EXACTAMENTE los mismos instantes y
los mismos tau, y llama a `pvlib.tracking.singleaxis` con axis_tilt = +tau y
con -tau. Dos columnas, por el mismo motivo que en el lado JS: separar lo que
es diferencia de FORMULA de lo que es diferencia de CONVENIO DE SIGNO.

Se llama a pvlib DIRECTAMENTE y no a `compute_theta_full_tracking`, y se dice
por que: esa funcion pasa `pair.axis_tilt_deg` tal cual
(`tracker3d.py:1119-1126`), asi que llamarla equivale a la columna +tau. Ir a
pvlib directo deja ver las dos y no obliga a creerse esa equivalencia.
"""
import json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(os.path.dirname(RAIZ), 'SolarGPTfull', 'solargpt'))

import numpy as np
import pvlib
from solargpt_core import tracker3d as t3d

JS = json.load(open(os.path.join(AQUI, 'out', 'A_astro_js.json')))
zen = np.array([i['zen'] for i in JS['instantes']])
azi = np.array([i['az'] for i in JS['instantes']])
G = JS['geometria']

# CONTROL de que la equivalencia que se afirma arriba es cierta: para un tau se
# corre TAMBIEN `compute_theta_full_tracking` y se compara con la columna +tau.
TAU_CTRL = 6.0
T = t3d.PlantTerrain3D(
    pairs=[t3d.RowPairTerrain(cross_axis_slope_deg=G['slope'], pitch_m=6.0, axis_tilt_deg=TAU_CTRL)],
    collector_width_m=2.382, axis_azimuth_deg=G['axisAz'], max_angle_deg=G['maxAngle'],
    gcr=G['gcr'], surface_to_axis_offset_m=0.17, n_bypass_diodes=2)
ctrl = np.asarray(t3d.compute_theta_full_tracking(zen, azi, T))[:, 0]

def sa(tau):
    r = pvlib.tracking.singleaxis(apparent_zenith=zen, solar_azimuth=azi,
                                  axis_tilt=tau, axis_azimuth=G['axisAz'],
                                  max_angle=G['maxAngle'], backtrack=False, gcr=G['gcr'])
    return np.nan_to_num(np.asarray(r['tracker_theta'], dtype=float), nan=0.0)

filas = []
for tau in JS['tau']:
    filas.append({'tau': tau,
                  'py_mas': [round(float(x), 9) for x in sa(tau)],
                  'py_menos': [round(float(x), 9) for x in sa(-tau)]})

mas6 = np.array([f for f in filas if abs(f['tau'] - TAU_CTRL) < 1e-9][0]['py_mas'])
print(json.dumps({
    'que': 'pvlib.tracking.singleaxis (backtrack=False) sobre los MISMOS instantes y tau que el lado JS',
    'pvlib': pvlib.__version__,
    'control_equivalencia': {
        'tau': TAU_CTRL,
        'por_que': 'compute_theta_full_tracking pasa pair.axis_tilt_deg tal cual: tiene que dar la columna +tau',
        'max_abs_dif': float(np.max(np.abs(ctrl - mas6))),
    },
    'filas': filas,
}, ensure_ascii=False))
