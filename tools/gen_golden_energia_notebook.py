#!/usr/bin/env python3
"""Golden de la cadena DC del Notebook para el QA de produccion.html.

Los numeros salen del CORE MISMO (solargpt_core, el que ejecutan notebook y
streamlit): _t_cell_pvsyst_full (full_chain.py) y dc_power_pvwatts
(electrical.py), con los defaults canonicos del Notebook —
alpha=0.9, eta=0 (Faiman puro), u_c=29 free-standing, u_v=0, gamma=-0.34 %/C.
La pagina porta esas DOS formulas a JS; este golden es lo que impide que la
portacion se separe del core ni un decimal (el test exige == a 1e-9 relativo).

Requiere el checkout de SolarGPTfull al lado de este repo:
    python3 tools/gen_golden_energia_notebook.py > tools/golden_energia_notebook.json
"""
import json, sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "SolarGPTfull" / "solargpt"))
from solargpt_core.full_chain import _t_cell_pvsyst_full          # noqa: E402
from solargpt_core.electrical import dc_power_pvwatts             # noqa: E402

MODS, WP, GAMMA, UC, UV = 28, 590.0, -0.34, 29.0, 0.0
casos = []
for poa in (0.0, 12.5, 87.0, 250.0, 613.7, 941.2, 1123.0):
    for tair in (-5.0, 8.5, 20.0, 33.0, 41.0):
        for wind in (0.0, 1.0, 4.7):
            tc = float(_t_cell_pvsyst_full(poa, tair, wind, u_c=UC, u_v=UV, eta=0.0, alpha=0.9))
            pw = float(dc_power_pvwatts(poa, tc, p_dc_stc_w=MODS * WP, gamma_pdc_pct_per_c=GAMMA))
            casos.append({"poa": poa, "tair": tair, "wind": wind, "t_cell": tc, "p_string_w": pw})

# casos extra con u_c/u_v NO canonicos (Fleming PVSyst 20/0 y un caso con
# viento activo 25/1.2): clavan la rama u_v*wind de la MISMA funcion del core.
extra = []
for uc, uv in ((20.0, 0.0), (25.0, 1.2)):
    for poa, tair, wind in ((613.7, 20.0, 0.0), (613.7, 20.0, 4.7), (941.2, 33.0, 2.3)):
        tc = float(_t_cell_pvsyst_full(poa, tair, wind, u_c=uc, u_v=uv, eta=0.0, alpha=0.9))
        pw = float(dc_power_pvwatts(poa, tc, p_dc_stc_w=MODS * WP, gamma_pdc_pct_per_c=GAMMA))
        extra.append({"poa": poa, "tair": tair, "wind": wind, "u_c": uc, "u_v": uv,
                      "t_cell": tc, "p_string_w": pw})

json.dump({"fuente": "solargpt_core full_chain._t_cell_pvsyst_full + electrical.dc_power_pvwatts",
           "constantes": {"mods": MODS, "wp": WP, "gamma": GAMMA, "u_c": UC, "u_v": UV,
                          "alpha": 0.9, "eta": 0.0},
           "casos": casos, "casos_uc_uv": extra}, sys.stdout, indent=1)
print()
