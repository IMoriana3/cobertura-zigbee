#!/usr/bin/env python3
"""Reproducción mínima de un BUG DEL CORE, para llevárselo a quien lo mantenga.

Este fichero no es del simulador: está aquí porque fue el golden del espejo
(tools/gen_golden_core.py) el que destapó el fallo, y quien lo arregle necesita
poder reproducirlo en dos minutos sin montar nada.

EL FALLO: las políticas de difusa no propagan axis_azimuth.

Solo run_tracker pasa axis_azimuth a compute_poa_perez. Las cuatro políticas
lo dejan en su valor por defecto (0.0), así que en una planta con el eje
girado DECIDEN con la transposición de otra orientación.

POR QUÉ SOLO AFECTA A DOS DE LAS CUATRO: flat y poa_switch solo evalúan la POA
en θ = 0, y a 0° la superficie es horizontal independientemente del azimut del
eje — la transposición sale igual y quedan inmunes. limited y continuous
evalúan candidatos INCLINADOS, y ahí el azimut sí cambia la orientación de la
superficie. continuous es el peor porque barre cinco candidatos y se queda el
argmax: una transposición equivocada elige el candidato equivocado.

Medido en una planta a 23,7° (Bagnarelli) un día de frentes:

    diffuse_flat            0 pasos    0,00°    +0,000 %
    diffuse_limited        17 pasos   18,24°    -0,027 %
    diffuse_continuous     10 pasos   16,20°    -0,762 %   <-- POA DEL DIA
    diffuse_poa_switch      0 pasos    0,00°    +0,000 %

El -0,762 % de continuous es mas de la mitad de la ganancia anual de difusa
(0,4-1,5 %/ano), perdida en un solo dia, y precisamente en la politica que se
supone que es el techo matematico.

ARREGLARLO MUEVE LOS GOLDEN del core en plantas con eje girado. No es un
parche de una linea: hay que pasar axis_azimuth/axis_tilt desde run_tracker a
las cuatro politicas y re-snapshotar. Por eso esto es una reproduccion y no un
PR: la decision es de quien mantiene el core.

Uso:  python3 tools/repro_bug_eje_core.py [ruta_a_solargpt]
"""
import functools
import sys

import numpy as np
import pandas as pd
import pvlib

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else "/home/user/SolarGPTfull/solargpt")
from solargpt_core import tracker as T

EJE = 23.7          # Bagnarelli
LAT, LON, TZ = 45.4, 9.1, "Etc/GMT-2"
FECHA = "2026-09-15"

idx = pd.date_range(f"{FECHA} 00:00", f"{FECHA} 23:59", freq="10min", tz=TZ)
sp = pvlib.solarposition.get_solarposition(idx, LAT, LON, altitude=300.0)
am = pvlib.atmosphere.get_relative_airmass(sp["apparent_zenith"])
ama = pvlib.atmosphere.get_absolute_airmass(am, pvlib.atmosphere.alt2pres(300.0))
cs = pvlib.clearsky.ineichen(sp["apparent_zenith"], ama, 3.5, altitude=300.0,
                             perez_enhancement=False)

# cielo con frentes: 15 % de fondo y cuatro tramos cubiertos
mins = np.arange(len(idx)) * 10
cc = np.full(len(idx), 0.15)
for a, b in ((540, 610), (650, 680), (780, 900), (960, 1050)):
    cc[(mins >= a) & (mins < b)] = 0.95
cosz = np.cos(np.radians(sp["apparent_zenith"].values)).clip(0, None)
ghi = cs["ghi"].values * (1 - 0.70 * cc)
dni = cs["dni"].values * (1 - cc) ** 3
w = pd.DataFrame({"GHI": ghi, "DNI": dni,
                  "DHI": np.fmax(ghi - dni * cosz, 0.0)}, index=idx)

cfg = T.TrackerConfig(axis_azimuth=EJE, gcr=0.397, max_angle=55.0)
th_n = T.get_baseline_theta(sp, cfg)
poa_n = T.compute_poa_perez(th_n, sp, w, axis_azimuth=EJE)   # run_tracker SÍ lo pasa

POL = {"diffuse_flat": T.policy_diffuse_flat,
       "diffuse_limited": T.policy_diffuse_limited,
       "diffuse_continuous": T.policy_diffuse_continuous,
       "diffuse_poa_switch": T.policy_diffuse_poa_switch}


def corre():
    return {k: fn(th_n, poa_n, ghi, sp, w, T.DEFAULT_DIFFUSE_CONFIG)
            for k, fn in POL.items()}


actual = corre()
_orig = T.compute_poa_perez
try:                                        # cómo quedaría propagando el eje
    T.compute_poa_perez = functools.partial(_orig, axis_azimuth=EJE)
    esperado = corre()
finally:
    T.compute_poa_perez = _orig

print(f"eje {EJE}° · {FECHA} · {len(idx)} pasos de 10 min\n")
print(f"{'política':22s} {'pasos con θ distinta':>21s} {'|Δθ| máx':>10s} "
      f"{'Δ POA día':>12s}")
for k in POL:
    th_a, _ = actual[k]
    th_e, _ = esperado[k]
    d = np.abs(th_a - th_e)
    poa_a = T.compute_poa_perez(th_a, sp, w, axis_azimuth=EJE).sum() / 6
    poa_e = T.compute_poa_perez(th_e, sp, w, axis_azimuth=EJE).sum() / 6
    print(f"{k:22s} {int((d > 1e-6).sum()):21d} {d.max():9.2f}° "
          f"{poa_a - poa_e:+9.1f} Wh/m²  ({100*(poa_a/poa_e - 1):+.3f} %)")

print("\nCon eje N-S (axis_azimuth=0) no se nota: la transposición por defecto")
print("coincide con la del eje. El fallo solo aparece en plantas giradas.")
