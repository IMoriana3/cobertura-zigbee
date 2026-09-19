#!/usr/bin/env python3
"""G.1 (lado Python) — mismo caso, mismo sol, misma irradiancia, motor tracker3d.py.

Lee audit2/out/G1_js.json (lo escribe audit2/G1_js.mjs) y escribe
audit2/out/G1_py.json.  No se modifica nada de SolarGPTfull.

Ejecutable:
    PYTHONPATH=/home/user/SolarGPTfull/solargpt python3 audit2/G1_py.py
"""
import json, os, sys, traceback
sys.path.insert(0, "/home/user/SolarGPTfull/solargpt")
import numpy as np, pandas as pd
from solargpt_core import tracker3d as t3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = json.load(open(os.path.join(ROOT, "audit2", "out", "G1_js.json")))

# ── mapa política JS → función de tracker3d.py ───────────────────────────────
MAPA = {
    "astro":    ("compute_theta_full_tracking",          "zen_azi"),
    "global":   ("compute_bt_angles_global",             "zen_azi"),
    "row":      ("compute_bt_angles_rowwise",            "zen_azi"),
    "pairwise": ("compute_bt_angles",                    "zen_azi"),
    "true3d":   ("compute_bt_angles_3d",                 "zen_azi"),
    "mgl":      ("compute_bt_angles_min_ground_light",   "zen_azi"),      # devuelve (angles, info)
    "optimal":  ("compute_bt_angles_energy_optimal",     "sp_weather"),   # devuelve (angles, detail)
    "bt2d":     (None, None),      # sin contraparte declarada en tracker3d.py
    "optfree":  (None, None),      # sin contraparte: no existe el óptimo libre
}

out = {"python": sys.version.split()[0], "numpy": np.__version__,
       "tracker3d": os.path.abspath(t3.__file__), "mapa": {k: v[0] for k, v in MAPA.items()},
       "casos": {}}

for cual, C in JS["casos"].items():
    terrain = t3.build_terrain_from_profile(
        [p["slope"]    for p in C["pairs"]],
        pitches_m     =[p["pitch"]    for p in C["pairs"]],
        axis_tilts_deg=[p["axisTilt"] for p in C["pairs"]],
        collector_width_m=C["cw"], axis_azimuth_deg=C["axisAz"],
        max_angle_deg=C["maxAngle"], gcr=C["gcr"],
        surface_to_axis_offset_m=C["z0"], n_bypass_diodes=C["nBypass"])
    res = {"n_rows": terrain.n_rows, "instantes": []}
    for I in C["instantes"]:
        idx = pd.DatetimeIndex([pd.Timestamp(I["utc"])])
        sp = pd.DataFrame({"apparent_zenith": [I["zen"]], "azimuth": [I["az"]]}, index=idx)
        wx = pd.DataFrame({"GHI": [I["ghi"]], "DNI": [I["dni"]], "DHI": [I["dhi"]]}, index=idx)
        zen = np.array([I["zen"]]); azi = np.array([I["az"]])
        ang, poa, err = {}, {}, {}
        for k, (fn, modo) in MAPA.items():
            if fn is None:
                err[k] = "NO EXISTE en tracker3d.py"; continue
            try:
                f = getattr(t3, fn)
                a = f(sp, wx, terrain) if modo == "sp_weather" else f(zen, azi, terrain)
                # `compute_bt_angles_min_ground_light` y `compute_bt_angles_energy_optimal`
                # devuelven una TUPLA (angles, info/detail): se toma el primer elemento.
                if isinstance(a, tuple):
                    a = a[0]
                a = np.asarray(a, dtype=float).reshape(1, -1)
                ang[k] = [round(float(v), 8) for v in a[0]]
                try:
                    sh = t3.compute_shade(zen, azi, a, terrain)
                    se = t3.electrical_shade_loss(np.asarray(sh, dtype=float), terrain.n_bypass_diodes)
                except Exception:
                    se = None
                pr, pp = t3.compute_bt3d_poa_per_row(sp, wx, terrain, a, shade_elec=se,
                                                     albedo=JS["canon"]["albedo"])
                poa[k] = round(float(np.asarray(pp).reshape(-1)[0]), 8)
            except Exception as e:
                err[k] = f"{type(e).__name__}: {e}"
        res["instantes"].append({"hora": I["hora"], "ang": ang, "poa": poa, "error": err})
    out["casos"][cual] = res

json.dump(out, open(os.path.join(ROOT, "audit2", "out", "G1_py.json"), "w"), indent=1)
print("G1_py.json escrito · python", out["python"], "· numpy", out["numpy"])
print("tracker3d:", out["tracker3d"])
for cual, R in out["casos"].items():
    print(f"\ncaso {cual}: n_rows {R['n_rows']}")
    for I in R["instantes"]:
        ok = ", ".join(sorted(I["ang"])); ko = "; ".join(f"{k}: {v}" for k, v in I["error"].items())
        print(f"  {I['hora']}  OK[{ok}]")
        if ko: print(f"          fallo/ausente → {ko}")
