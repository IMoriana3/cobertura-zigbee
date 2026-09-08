#!/usr/bin/env python3
"""Golden de la cadena AC del Notebook para el QA de produccion.html.

Los numeros salen del CORE MISMO (solargpt_core.electrical, el que ejecutan
notebook y streamlit): apply_dc_losses (perdidas DC multiplicativas),
inverter_efficiency_curve (modelo pvwatts legacy con clipping a Pnom, el
default de todas las superficies) y apply_grid_limit. La pagina porta esas
formulas a JS; este golden impide que la portacion se separe del core ni un
decimal (el test exige == a 1e-9 relativo).

El barrido del inversor cruza a proposito los limites del codigo bajo prueba
(regla de la casa): p_ratio 0, cerca de 0 (donde muerde el clip de eta a 0),
carga parcial, Pnom exacto, la zona de CLIPPING (pdc*eta > pnom) y el tope del
ratio (1.5). Sin esos casos el careo daria verde con el clip quitado.

Requiere el checkout de SolarGPTfull al lado de este repo:
    python3 tools/gen_golden_ac_notebook.py > tools/golden_ac_notebook.json
"""
import json, sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "SolarGPTfull" / "solargpt"))
from solargpt_core.electrical import (apply_dc_losses, inverter_efficiency_curve,
                                      apply_grid_limit)                       # noqa: E402

inv = []
for pnom in (100000.0, 250000.0, 330000.0):
    for eta_max in (0.985, 0.97):
        for ratio in (0.0, 0.001, 0.02, 0.1, 0.3, 0.6, 0.9, 1.0, 1.05, 1.2, 1.5, 1.8, 2.5):
            pdc = pnom * ratio
            pac, eta = inverter_efficiency_curve(pdc, pnom, eta_max=eta_max)
            inv.append({"p_dc_w": pdc, "p_ac_nom_w": pnom, "eta_max": eta_max,
                        "p_ac_w": float(pac), "eta": float(eta)})

dc = []
for combo in ((2.0, 2.0, 1.5, 1.5), (0.0, 0.0, 0.0, 0.0), (3.5, 1.0, 2.0, 0.5),
              (2.0, 2.0, 1.5, 0.0), (5.0, 3.0, 2.5, 2.0)):
    s, m, w, lid = combo
    p, eta = apply_dc_losses(1000000.0, soiling_pct=s, mismatch_pct=m,
                             wiring_pct=w, lid_pct=lid)
    dc.append({"soiling": s, "mismatch": m, "wiring": w, "lid": lid,
               "eta": float(eta), "p_out_w": float(p)})

grid = []
for pac, pmax in ((500000.0, 400000.0), (500000.0, 600000.0), (500000.0, None),
                  (0.0, 400000.0), (399999.999, 400000.0)):
    out = apply_grid_limit(pac, pmax)
    grid.append({"p_ac_w": pac, "p_max_w": pmax, "p_out_w": float(out)})

json.dump({"fuente": "solargpt_core.electrical apply_dc_losses + inverter_efficiency_curve(pvwatts) + apply_grid_limit",
           "inversor": inv, "perdidas_dc": dc, "limite_red": grid},
          sys.stdout, indent=1)
print()
