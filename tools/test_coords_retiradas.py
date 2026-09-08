#!/usr/bin/env python3
"""
test_coords_retiradas.py — TCUs retiradas, huecos de esclavo, y que el paquete cuadre con el SCADA.

POR QUE EXISTE. En Ayora se desmontaron ENTERAS tres unidades de la NCU7 —seguidor incluido,
confirmado por la casa el 2026-09-08—: los esclavos 14, 24 y 25. El layout as-built ya no las
trae, pero en la planta al quitar una unidad las demas NO se renumeran: queda el HUECO, que es
lo que dice la hoja (1-13 y 15-23, no 1-22). `sin_tcu` declara esos numeros y la numeracion los
SALTA.

LA REGRESION QUE MOTIVO EL CAMBIO: la primera version quitaba la fila DESPUES de numerar, con el
seguidor aun dibujado en el plano. Cuando el as-built (c12411b) borro los seguidores del layout,
aquel filtro se quedo huerfano y paso a comerse al VECINO: la numeracion ya sin hueco ponia el 14
en TK 041-05 y el filtro la tiraba. El paquete de campo salia con los esclavos corridos — un
timeout alli se lee como «aqui no llega la señal» en una zona perfectamente cubierta.

Y DE PROPINA, EL SOLAPE DE TRAMOS: la hoja escribe los bordes con descuido (San Jose NCU3 dice
GW1 1-46 y GW2 46-120) y el esclavo del borde caia en el gateway que tocara por orden de
diccionario — una moneda al aire que ya movio una TCU de fichero entre regeneraciones. Ahora va
al GW mas bajo, SE CANTA por consola, y no es dato.

QUE SE COMPRUEBA, con pasadas de verdad sobre layouts de mentira:

  · que los esclavos de `sin_tcu` se saltan al numerar: queda el hueco y el vecino CONSERVA su
    numero de siempre (la 15 sigue siendo la 15);
  · que no se pierde ninguna fila por el camino (la regresion de arriba);
  · que la HSU o el repetidor con ese mismo numero no se van: el esclavo solo es unico ENTRE TCUs;
  · que un esclavo en DOS tramos va al GW mas bajo y se canta el solape;
  · y que si lo sondeable no es lo que el SCADA declara, se CANTA —sobre y falta— en vez de
    descubrirlo en campo.

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
    """Monta un layout y un plantas/ de mentira y hace una pasada de verdad.
    Cada tramo del SCADA es (ini, fin) —puerto 503, GW1— o (ini, fin, puerto)."""
    tmp = tempfile.mkdtemp()
    L = {"plant": "prueba", "title": "Prueba", "crs": "EPSG:25830",
         "georef": {"origen_utm": [700000.0, 4300000.0]},
         "cE": 700000.0, "cN": 4300000.0, "clon": -0.5, "clat": 39.0,
         "trackers": trackers, "ncus": [{"x": 0.0, "n": 0.0}],
         # una HSU y un repetidor con el MISMO numero que una TCU retirada: el hueco no
         # puede llevarselos por delante. El esclavo solo es unico entre TCUs.
         "meteo": [{"x": 5.0, "n": 5.0, "ncu": ncu, "gw": 1, "esclavo": 14}],
         "reps": [{"x": 7.0, "n": 7.0, "ncu": ncu, "gw": 1, "esclavo": 24}]}
    if sin_tcu:
        L["sin_tcu"] = sin_tcu
    open(os.path.join(tmp, "prueba_layout.json"), "w").write(json.dumps(L))
    plantas = os.path.join(tmp, "plantas")
    os.makedirs(plantas)
    open(os.path.join(plantas, "prueba.json"), "w").write(json.dumps({"version": 1, "plantas": [
        {"nombre": "Prueba NCU%d GW%d" % (ncu, 1 if (t[2] if len(t) > 2 else 503) == 503 else 2),
         "ip": "10.0.0.1", "puerto": (t[2] if len(t) > 2 else 503),
         "tcu_ini": t[0], "tcu_fin": t[1]} for t in esclavos_scada]}))
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


def filas_csv(tmp, ncu=7):
    import csv
    import glob
    f = glob.glob(os.path.join(tmp, "out", "prueba", "coords_prueba_NCU%02d.csv" % ncu))
    return list(csv.DictReader(open(f[0])))


def esclavos(tmp, ncu=7):
    return sorted(int(r["esclavo"]) for r in filas_csv(tmp, ncu) if r["rol"] == "TCU")


TK = [{"x": 10.0 * i, "n": 0.0, "rot": 0, "id": "TK %03d-05" % i, "ncu": 7, "gw": 1,
       "mods": 28, "t": "completo"} for i in range(1, 26)]
# el as-built de Ayora: las tres desmontadas YA NO estan en el plano
TKA = [t for t in TK if t["id"] not in ("TK 014-05", "TK 024-05", "TK 025-05")]

# ── el caso de Ayora, as-built ───────────────────────────────────────────────
print("\n· la retirada desmontada no esta en el plano, y su esclavo queda de HUECO")
man, log, tmp = corre(TKA, [(1, 13), (15, 23)], sin_tcu={"7": [14, 24, 25]})
esc = esclavos(tmp)
di(esc == list(range(1, 14)) + list(range(15, 24)),
   "quedan 1-13 y 15-23, con el hueco en el 14", esc)
di(len(esc) == 22, "22 nodos, los 22 del plano", len(esc))
f15 = [r for r in filas_csv(tmp) if r["etiqueta"] == "TK 015-05"]
di(f15 and f15[0]["esclavo"] == "15", "y la 15 SIGUE siendo la 15, no pasa a ser la 14",
   f15 and f15[0]["esclavo"])
# LA REGRESION: el filtro viejo, sin hueco en la numeracion, se comia a la vecina
f16 = [r for r in filas_csv(tmp) if r["etiqueta"] == "TK 016-05"]
di(bool(f16), "la vecina de la retirada NO desaparece (la regresion del filtro viejo)")
di("no cuadra" not in log, "cuadra con el SCADA y no se queja", log)
di(sorted(r["rol"] for r in filas_csv(tmp) if r["rol"] != "TCU") == ["HSU", "REP"],
   "la HSU y el repetidor siguen ahi")
di([r["esclavo"] for r in filas_csv(tmp) if r["rol"] == "HSU"] == ["14"],
   "la HSU 14 no se va porque se desmontara la TCU 14")
di([r["esclavo"] for r in filas_csv(tmp) if r["rol"] == "REP"] == ["24"],
   "ni el repetidor 24")

print("\n· sin declararlo, sigue saliendo todo seguido (y se canta el descuadre)")
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

print("\n· si la hoja aun declara una desmontada, se dice ESO — no que «exista y no se sondee»")
man, log, tmp = corre(TKA, [(1, 23)], sin_tcu={"7": [14, 24, 25]})
di("aún declara las DESMONTADAS [14]" in log, "la hoja va atrasada y se le dice", log)
di("existen y no se sondearían" not in log,
   "sin llamar «existente» a lo que ya no esta en la planta", log)

print("\n· cuando todo cuadra, no se dice nada")
man, log, tmp = corre(TK, [(1, 25)])
di("no cuadra" not in log, "sin ruido", log)
di(esclavos(tmp) == list(range(1, 26)), "y salen las 25")

# ── el solape de tramos (San Jose NCU3: GW1 1-46 y GW2 46-120) ──────────────
print("\n· un esclavo en DOS tramos va al GW mas bajo, y se canta")
man, log, tmp = corre(TK[:6], [(1, 4, 503), (4, 6, 504)])
gw_de = {r["etiqueta"]: r["gw"] for r in filas_csv(tmp) if r["rol"] == "TCU"}
di(gw_de.get("TK 004-05") == "1", "el del borde se queda en el GW1", gw_de.get("TK 004-05"))
di(gw_de.get("TK 005-05") == "2", "y el siguiente ya es del GW2", gw_de.get("TK 005-05"))
di("esclavo 4 cae en 2 tramos" in log and "NO es dato" in log,
   "el solape se canta y queda claro que no es dato", log)
di("esclavo 3 cae" not in log and "esclavo 5 cae" not in log,
   "y solo se canta el del borde")

# ── el layout de verdad ──────────────────────────────────────────────────────
print("\n· y en el layout de Ayora esta declarado, as-built")
A = json.load(open(os.path.join(os.path.dirname(AQUI), "ayora_layout.json")))
di(A.get("sin_tcu") == {"7": [14, 24, 25]}, "NCU7: esclavos 14, 24 y 25", A.get("sin_tcu"))
di("_nota_sin_tcu" in A and "TK 040-05" in A["_nota_sin_tcu"],
   "con nota de que seguidores fueron, para poder rastrearlo")
ids = {t.get("id") for t in A["trackers"]}
di(not ids & {"TK 040-05", "TK 050-05", "TK 051-05"},
   "y los tres desmontados NO estan en el plano (as-built, la casa 2026-09-08)")

print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
sys.exit(1 if fallos else 0)
