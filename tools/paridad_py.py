#!/usr/bin/env python3
"""Paso 4.4 (p2) · lado Python de la paridad JS ↔ `tracker3d.py`, SIN torsión.

    SOLARGPT_ROOT=<raíz de SolarGPTfull> python3 tools/paridad_py.py ENTRADA.json SALIDA.json [--control]

Lee la rejilla que escribe `tools/test_paridad_py.mjs` (terreno, sol e
irradiancia del lado JS) y llama a `tracker3d.py` TAL CUAL con el mismo sol y la
misma irradiancia, para que la comparación aísle el motor y no el modelo de
cielo. No se modifica nada de SolarGPTfull.

SIN TORSIÓN, y se exige: con tilt N-S ≠ 0 los dos lados no reciben el mismo
terreno (el JS convierte el tilt con `pvTilt`, backtracking.html:610, y el 3D de
`tracker3d.py` lo leía con el signo contrario al que declara — hallazgo 4.0 de
`audit5/REFUNDACION_P4.md`). Esa parte queda fuera hasta que entre (p1).

`--control`: invierte el signo de la pendiente transversal que se le pasa a
Python. Es el control negativo del banco: tiene que ROMPER la paridad donde hay
pendiente; si no la rompe, el banco no distingue.
"""
import json, os, sys

RAIZ = os.environ.get("SOLARGPT_ROOT", "")
if not RAIZ or not os.path.isdir(os.path.join(RAIZ, "solargpt", "solargpt_core")):
    print(f"NO COMPROBADO: SOLARGPT_ROOT no apunta a un checkout de SolarGPTfull ({RAIZ!r})")
    sys.exit(3)
sys.path.insert(0, os.path.join(RAIZ, "solargpt"))
import numpy as np, pandas as pd, pvlib  # noqa: E402
from solargpt_core import tracker3d as t3  # noqa: E402

entrada, salida = sys.argv[1], sys.argv[2]
control = "--control" in sys.argv
J = json.load(open(entrada))
MAPA = {
    "astro":    ("compute_theta_full_tracking",        "zen_azi"),
    "global":   ("compute_bt_angles_global",           "zen_azi"),
    "row":      ("compute_bt_angles_rowwise",          "zen_azi"),
    "pairwise": ("compute_bt_angles",                  "zen_azi"),
    "true3d":   ("compute_bt_angles_3d",               "zen_azi"),
    "mgl":      ("compute_bt_angles_min_ground_light", "zen_azi"),
    "optimal":  ("compute_bt_angles_energy_optimal",   "sp_weather"),
    "bt2d":     (None, None),
    "optfree":  (None, None),
}
out = {"python": sys.version.split()[0], "numpy": np.__version__, "pvlib": pvlib.__version__,
       "tracker3d": os.path.relpath(t3.__file__, RAIZ), "control": control, "casos": {}}
for nombre, C in J["casos"].items():
    tilts = [p["axisTilt"] for p in C["pairs"]]
    if any(abs(t) > 0 for t in tilts) or any(abs(t) > 0 for t in C["rowTilt"]):
        print(f"RECHAZADO {nombre}: la paridad (p2) es SIN torsión y este caso trae tilt N-S {tilts}")
        sys.exit(4)
    s = -1.0 if control else 1.0
    terrain = t3.build_terrain_from_profile(
        [s * p["slope"] for p in C["pairs"]],
        pitches_m=[p["pitch"] for p in C["pairs"]],
        axis_tilts_deg=[0.0] * len(C["pairs"]),
        collector_width_m=C["cw"], axis_azimuth_deg=C["axisAz"], max_angle_deg=C["maxAngle"],
        gcr=C["gcr"], surface_to_axis_offset_m=C["z0"], n_bypass_diodes=C["nBypass"])
    res = []
    for I in C["instantes"]:
        idx = pd.DatetimeIndex([pd.Timestamp(I["utc"])])
        sp = pd.DataFrame({"apparent_zenith": [I["zen"]], "azimuth": [I["az"]]}, index=idx)
        wx = pd.DataFrame({"GHI": [I["ghi"]], "DNI": [I["dni"]], "DHI": [I["dhi"]]}, index=idx)
        zen, azi = np.array([I["zen"]]), np.array([I["az"]])
        ang, err = {}, {}
        for k, (fn, modo) in MAPA.items():
            if fn is None:
                err[k] = "NO EXISTE en tracker3d.py"
                continue
            try:
                a = getattr(t3, fn)(sp, wx, terrain) if modo == "sp_weather" else getattr(t3, fn)(zen, azi, terrain)
                if isinstance(a, tuple):          # mgl y energy_optimal devuelven (ángulos, detalle)
                    a = a[0]
                ang[k] = [round(float(v), 8) for v in np.asarray(a, dtype=float).reshape(1, -1)[0]]
            except Exception as e:  # se publica, no se esconde
                err[k] = f"{type(e).__name__}: {e}"
        res.append({"utc": I["utc"], "ang": ang, "error": err})
    out["casos"][nombre] = res
json.dump(out, open(salida, "w"))
print(f"paridad_py: {sum(len(v) for v in out['casos'].values())} instantes · tracker3d {out['tracker3d']} · pvlib {out['pvlib']}{' · CONTROL (pendiente invertida)' if control else ''}")
