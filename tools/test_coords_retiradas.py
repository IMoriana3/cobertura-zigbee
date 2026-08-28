#!/usr/bin/env python3
"""
test_coords_retiradas.py — TCUs retiradas, y que el paquete de campo cuadre con el SCADA.

POR QUE EXISTE. El layout es el PLANO: trae el seguidor aunque le hayan quitado la TCU.
El paquete que se lleva al PC de la planta se genera del layout, asi que seguia
sondeando esas. Y eso no falla de forma visible: un esclavo sin TCU da TIMEOUT, y un
timeout en el mapa de cobertura se lee como «aqui no llega la senal». Se mide mal una
zona que esta perfectamente cubierta.

Paso en Ayora: se retiraron tres TCUs de la NCU7 —los esclavos 14, 24 y 25— y el
paquete seguia llevando 25 nodos donde hay 22.

QUE SE COMPRUEBA, con pasadas de verdad sobre layouts de mentira:

  · que un seguidor declarado sin TCU no se sondea;
  · que los demas NO se renumeran al quitarlo: queda el HUECO, que es lo que pasa en la
    planta y lo que dice la hoja (1-13 y 15-23, no 1-22);
  · que el seguidor sigue en el plano (esto quita la TCU, no el seguidor);
  · y que si lo que se va a sondear no es lo que el SCADA declara, se CANTA por consola
    —sobre y falta— en vez de descubrirlo en campo.

    python3 tools/test_coords_retiradas.py
"""
import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stdout

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gen_coords_cobertura as G                                       # noqa: E402

fallos = []
n = 0


def di(ok, texto, extra=None):
    global n
    n += 1
    if not ok:
        fallos.append(texto)
    print("  %s %s%s" % ("OK   " if ok else "FALLO", texto,
                         "" if ok or extra is None else "  -> %s" % (extra,)))


def corre(trackers, esclavos_scada, sin_tcu=None, ncu=7):
    """Monta un layout y un plantas/ de mentira y hace una pasada de verdad."""
    tmp = tempfile.mkdtemp()
    L = {"plant": "prueba", "title": "Prueba", "crs": "EPSG:25830",
         "georef": {"origen_utm": [700000.0, 4300000.0]},
         "cE": 700000.0, "cN": 4300000.0, "clon": -0.5, "clat": 39.0,
         "trackers": trackers, "ncus": [{"x": 0.0, "n": 0.0}],
         # una HSU y un repetidor con el MISMO numero que una TCU retirada: retirar una
         # TCU no puede llevarselos por delante. El esclavo solo es unico entre TCUs.
         "meteo": [{"x": 5.0, "n": 5.0, "ncu": ncu, "gw": 1, "esclavo": 14}],
         "reps": [{"x": 7.0, "n": 7.0, "ncu": ncu, "gw": 1, "esclavo": 24}]}
    if sin_tcu:
        L["sin_tcu"] = sin_tcu
    open(os.path.join(tmp, "prueba_layout.json"), "w").write(json.dumps(L))
    plantas = os.path.join(tmp, "plantas")
    os.makedirs(plantas)
    open(os.path.join(plantas, "prueba.json"), "w").write(json.dumps({"version": 1, "plantas": [
        {"nombre": "Prueba NCU%d" % ncu, "ip": "10.0.0.1", "puerto": 503,
         "tcu_ini": a, "tcu_fin": b} for a, b in esclavos_scada]}))
    viejo = (G.RAIZ, G.SAL, G.SCADA, dict(G.TOOLBOX))
    G.RAIZ, G.SAL, G.SCADA = tmp, os.path.join(tmp, "out"), plantas
    G.TOOLBOX["prueba"] = "prueba.json"
    cap = io.StringIO()
    try:
        with redirect_stdout(cap):
            man = G.genera("prueba", True)
        return man, cap.getvalue(), tmp
    finally:
        G.RAIZ, G.SAL, G.SCADA = viejo[0], viejo[1], viejo[2]
        G.TOOLBOX.clear()
        G.TOOLBOX.update(viejo[3])


def esclavos(tmp, ncu=7):
    import csv
    import glob
    f = glob.glob(os.path.join(tmp, "out", "prueba", "coords_prueba_NCU%02d.csv" % ncu))
    return sorted(int(r["esclavo"]) for r in csv.DictReader(open(f[0])) if r["rol"] == "TCU")


TK = [{"x": 10.0 * i, "n": 0.0, "rot": 0, "id": "TK %03d-05" % i, "ncu": 7, "gw": 1,
       "mods": 28, "t": "completo"} for i in range(1, 26)]

# ── el caso de Ayora ─────────────────────────────────────────────────────────
print("\n· una TCU retirada no se sondea, y no renumera a las demas")
man, log, tmp = corre(TK, [(1, 13), (15, 23)], sin_tcu={"7": [14, 24, 25]})
esc = esclavos(tmp)
di(esc == list(range(1, 14)) + list(range(15, 24)),
   "quedan 1-13 y 15-23, con el hueco en el 14", esc)
di(len(esc) == 22, "22 nodos, no 25", len(esc))
di(24 not in esc and 25 not in esc, "las dos del final fuera")
di(15 in esc, "y la 15 SIGUE siendo la 15, no pasa a ser la 14")
di("no cuadra" not in log, "cuadra con el SCADA y no se queja", log)
# el numero de esclavo solo es unico entre TCUs: la HSU 14 y el repetidor 24 de esta
# misma NCU no tienen nada que ver con las TCU 14 y 24 que se retiraron
import csv as _csv
import glob as _glob
_f = _glob.glob(os.path.join(tmp, "out", "prueba", "coords_prueba_NCU07.csv"))[0]
_filas = list(_csv.DictReader(open(_f)))
di(sorted(r["rol"] for r in _filas if r["rol"] != "TCU") == ["HSU", "REP"],
   "la HSU y el repetidor siguen ahi", [r["rol"] for r in _filas if r["rol"] != "TCU"])
di([r["esclavo"] for r in _filas if r["rol"] == "HSU"] == ["14"],
   "la HSU 14 no se va porque se retirara la TCU 14",
   [r["esclavo"] for r in _filas if r["rol"] == "HSU"])
di([r["esclavo"] for r in _filas if r["rol"] == "REP"] == ["24"],
   "ni el repetidor 24", [r["esclavo"] for r in _filas if r["rol"] == "REP"])

print("\n· sin declararlo, sigue saliendo todo (y se canta)")
man, log, tmp = corre(TK, [(1, 13), (15, 23)])
esc = esclavos(tmp)
di(esc == list(range(1, 26)), "el layout manda si no se declara nada", len(esc))
di("no cuadra" in log and "se sondearían y no existen [14, 24, 25]" in log,
   "pero se canta cuales sobran", log)

# ── el aviso, en los dos sentidos ────────────────────────────────────────────
print("\n· el aviso distingue lo que sobra de lo que falta")
man, log, tmp = corre(TK[:20], [(1, 25)])
di("existen y no se sondearían [21, 22, 23, 24, 25]" in log,
   "el SCADA declara mas de las que hay en el plano", log)
di("se sondearían y no existen" not in log, "y no dice que sobre nada", log)

man, log, tmp = corre(TK, [(1, 20)])
di("se sondearían y no existen [21, 22, 23, 24, 25]" in log,
   "y al reves cuando el plano trae de mas", log)

print("\n· cuando todo cuadra, no se dice nada")
man, log, tmp = corre(TK, [(1, 25)])
di("no cuadra" not in log, "sin ruido", log)
di(esclavos(tmp) == list(range(1, 26)), "y salen las 25")

print("\n· retirar la TCU no borra el seguidor del plano")
man, log, tmp = corre(TK, [(1, 24)], sin_tcu={"7": [25]})
L = json.load(open(os.path.join(tmp, "prueba_layout.json")))
di(len(L["trackers"]) == 25, "el layout sigue con sus 25 seguidores", len(L["trackers"]))
di(esclavos(tmp) == list(range(1, 25)), "pero solo se sondean 24", len(esclavos(tmp)))

# ── el layout de verdad ──────────────────────────────────────────────────────
print("\n· y en el layout de Ayora esta declarado")
A = json.load(open(os.path.join(os.path.dirname(AQUI), "ayora_layout.json")))
di(A.get("sin_tcu") == {"7": [14, 24, 25]}, "NCU7: esclavos 14, 24 y 25", A.get("sin_tcu"))
di("_nota_sin_tcu" in A and "TK 040-05" in A["_nota_sin_tcu"],
   "con nota de que seguidores son hoy, para poder corregirlo")

print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
sys.exit(1 if fallos else 0)
