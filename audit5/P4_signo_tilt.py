#!/usr/bin/env python3
"""PASO 4 · el signo del tilt N-S dentro de tracker3d.py — ¿es coherente consigo mismo?

    python3 audit5/P4_signo_tilt.py

Qué hay (citas):
  · tracker3d.py:209-212 pasa a pvlib `axis_tilt=pair.axis_tilt_deg` TAL CUAL;
  · tracker3d.py:486-488, su geometría 3D (`_bt3d_pair_max_magnitude`), usa
    `a = np.array([0.0, ca, sa])` con y = norte: tilt POSITIVO ⇒ norte MÁS ALTO;
  · backtracking.html:596-610 afirma que pvlib lo define AL REVÉS y convierte con
    `pvTilt=t=>-(t||0)` antes de cada llamada.
Si el comentario del JS acierta, tracker3d.py alimenta a pvlib con el terreno
ESPEJO del que mide su propio 3D.

LA PRUEBA, sin el JS: una pareja sin pendiente E-O (cross 0) y con el MISMO
tilt en las dos filas es un plano; ahí el backtracking de pvlib es exacto, así
que su |θ| —cuando retrocede— tiene que coincidir con la magnitud sin sombra
del 3D con UNO de los dos signos. Se mide |θ_pvlib(s·t)| − mag3D(t) para
s = +1 (lo que hace tracker3d.py) y s = −1 (lo que hace el JS).
TEST NULO: t = 0 ⇒ los dos signos dan lo mismo.
CONTROL: si ninguno de los dos casa, la prueba no distingue y no se concluye.
No se modifica nada de SolarGPTfull.
"""
import json, os, sys
sys.path.insert(0, "/home/user/SolarGPTfull/solargpt")
import numpy as np, pandas as pd, pvlib
from solargpt_core import tracker3d as t3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PITCH, CW, MAXA, AXAZ = 6.0, 2.382, 55.0, 0.0
LAT, LON = 39.07, -1.05                     # Ayora aprox.; solo fija el recorrido del sol
idx = pd.date_range("2026-06-21 04:00", "2026-06-21 20:00", freq="5min", tz="UTC").append(
      pd.date_range("2026-12-21 07:00", "2026-12-21 17:00", freq="5min", tz="UTC"))
sp = pvlib.solarposition.get_solarposition(idx, LAT, LON)
ok = (sp.apparent_zenith < 85).values
zen, azi = sp.apparent_zenith.values[ok], sp.azimuth.values[ok]

res = {"pitch": PITCH, "cw": CW, "maxAngle": MAXA, "instantes": int(ok.sum()), "tilts": {}}
print(f"{int(ok.sum())} instantes con sol > 5° (21-jun y 21-dic, cada 5 min) · pareja plana E-O, pitch {PITCH} m, cuerda {CW} m")
print("tilt N-S   instantes en BT   máx | |θ_pvlib(+t)| − mag3D |   máx | |θ_pvlib(−t)| − mag3D |   casa")
for t in [0.0, 2.0, 5.0, -5.0, 8.0]:
    mag, side = t3._bt3d_pair_max_magnitude(zen, azi, 0.0, t, PITCH, CW, AXAZ, MAXA)
    mag = np.asarray(mag, float)
    fila = {}
    for s in (+1, -1):
        th = np.asarray(pvlib.tracking.singleaxis(zen, azi, axis_tilt=s * t, axis_azimuth=AXAZ, max_angle=MAXA,
                                       backtrack=True, gcr=CW / PITCH)["tracker_theta"], float)
        full = np.asarray(pvlib.tracking.singleaxis(zen, azi, axis_tilt=s * t, axis_azimuth=AXAZ, max_angle=MAXA,
                                         backtrack=False)["tracker_theta"], float)
        bt = np.isfinite(th) & (np.abs(th) < np.abs(full) - 1e-6) & (mag < MAXA - 1e-6)
        d = np.abs(np.abs(th[bt]) - mag[bt]) if bt.any() else np.array([np.nan])
        fila["+t" if s > 0 else "-t"] = {"n_bt": int(bt.sum()), "max_abs": float(np.nanmax(d)), "media": float(np.nanmean(d))}
    a, b = fila["+t"], fila["-t"]
    casa = ("los dos (nulo)" if t == 0 else
            "+t (tracker3d.py)" if a["max_abs"] < 0.05 <= b["max_abs"] else
            "−t (el JS)" if b["max_abs"] < 0.05 <= a["max_abs"] else "NO DISTINGUE")
    fila["casa"] = casa; res["tilts"][str(t)] = fila
    print(f"{t:+6.1f}°   {a['n_bt']:5d} / {b['n_bt']:5d}      {a['max_abs']:10.4f}°                  {b['max_abs']:10.4f}°                 {casa}")
nulo = res["tilts"]["0.0"]
print("\nTEST NULO (t = 0): " + ("idéntico en los dos signos" if nulo["+t"] == nulo["-t"] else "DIFIERE"))
os.makedirs(os.path.join(ROOT, "audit5", "out"), exist_ok=True)
json.dump(res, open(os.path.join(ROOT, "audit5", "out", "P4_signo_tilt.json"), "w"), indent=1)
