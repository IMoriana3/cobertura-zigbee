#!/usr/bin/env python3
"""PASO 4.1 · el esquema del contrato, validado contra terrenos que la página CONSTRUYE.

    node audit5/P4_dump_T.mjs audit5/out/P4_T.json && python3 audit5/P4_valida_esquema.py

· Ayora tal como la monta la página (`terrenoComoLaPagina`, banda 80, bloque 0);
  `real` se sustituye por {} (es el objeto entero de la planta, no cabe en JSON
  razonable; el esquema solo exige que sea objeto).
· Un preset genérico con la forma de `terrain(c)` (audit5/P3_3c_preset.mjs:24-29).
CONTROLES NEGATIVOS: cada mutación tiene que SUSPENDER; si alguna pasa, el
esquema no distingue esa forma y se dice.
"""
import json, os, copy
import jsonschema
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, "audit5", "contrato_bt.schema.json")))
V = jsonschema.Draft202012Validator({**S["$defs"]["T"], "$defs": S["$defs"]})
ay = json.load(open(os.path.join(ROOT, "audit5", "out", "P4_T.json")))["ayora"]
preset = {"pairs": [{"slope": 0, "pitch": 6, "axisTilt": 0}] * 9, "cw": 2.382, "axisAz": 0, "maxAngle": 55,
          "gcr": 2.382 / 6, "z0": 0.17, "nBypass": 2, "iam": 0.05, "rowTilt": [0] * 10,
          "groups": [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]], "drive": "bifila"}
fallos = 0
for nombre, T in [("Ayora (página)", ay), ("preset genérico", preset)]:
    e = list(V.iter_errors(T))
    print(f"{nombre:18s} {'VÁLIDO' if not e else 'INVÁLIDO: ' + '; '.join(x.message[:80] for x in e[:3])}")
    fallos += bool(e)
fuera = sorted(set(ay) - set(S["$defs"]["T"]["properties"]))
print("campos de Ayora que el esquema NO describe (la física no los lee por T; CONTRATO_BT.md §1.1): " + (", ".join(fuera) or "ninguno"))
def muta(f):
    T = copy.deepcopy(ay); f(T); return T
NEG = [
    ("real booleano", lambda T: T.__setitem__("real", True)),
    ("drive desconocido", lambda T: T.__setitem__("drive", "triple")),
    ("segTilt sin segs", lambda T: T.pop("segs")),
    ("pareja sin axisTilt", lambda T: T["pairs"][0].pop("axisTilt")),
    ("nBypass 7", lambda T: T.__setitem__("nBypass", 7)),
    ("motor con mesa mal formada", lambda T: T["segDrive"][0].__setitem__(0, [0])),
]
for nombre, f in NEG:
    ok = not list(V.iter_errors(muta(f)))
    print(f"control «{nombre}»: {'PASA — el esquema NO lo distingue' if ok else 'suspende (bien)'}")
    fallos += ok
print("\nTODO OK" if not fallos else f"\n{fallos} FALLO(S)")
raise SystemExit(1 if fallos else 0)
