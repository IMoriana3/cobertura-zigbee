#!/usr/bin/env python3
"""
rellena_barrido.py — mete en la hoja de barrido el angulo que grabo el Modbus.

POR QUE. La hoja del barrido pide `beta_grados`: el angulo del seguidor en el
momento de la medida. Con las palas planas y de canto la obstruccion no es la
misma, y sin el angulo no se puede separar la distancia de las mesas cruzadas —
que es todo el motivo de hacer el barrido.

Apuntarlo a mano mientras el seguidor se mueve es lento y se equivoca. El
angulo esta en el Modbus (registro 30111) y `zigbee_angulos.ps1` lo graba en
bucle con marca de tiempo. Aqui se cruzan por la hora: quien anda el campo solo
apunta `llega` y la hora.

    python3 tools/rellena_barrido.py barrido_ayora_NCU11.csv angulos.csv

Escribe el mismo fichero con `beta_grados` (el origen), `beta_destino` y
`modo_origen` puestos. Lo que no case se deja VACIO y se dice: un angulo
inventado se cuela en el ajuste sin que se note.
"""
import csv
import sys
from datetime import datetime, timedelta

# Cuanto puede separarse la hora de la medida de la del angulo. Los angulos se
# graban cada 30 s; mas de un par de minutos y el seguidor ya se ha movido lo
# bastante como para que el numero no describa esa medida.
TOL = timedelta(minutes=2)
FMT = "%Y-%m-%d %H:%M:%S"


def hora(t):
    t = (t or "").strip().replace("T", " ").replace("Z", "")
    for f in (FMT, "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M"):
        try:
            d = datetime.strptime(t, f)
            return d
        except ValueError:
            pass
    return None


def carga_angulos(ruta):
    """(esclavo, hora) -> (tilt, modo), solo los que se leyeron bien."""
    out = []
    with open(ruta, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            h = hora(r.get("hora_utc"))
            e = (r.get("esclavo") or "").strip()
            if h is None or not e.isdigit():
                continue
            # Un TCU que no contesto deja `tilt_deg` vacio, y ahi se queda: sin
            # angulo, no con un cero. `float("")` ya lo tira, asi que no hace
            # falta un guard aparte que ademas nadie podria comprobar.
            try:
                out.append((int(e), h, float(r.get("tilt_deg") or ""),
                            (r.get("modo") or "").strip()))
            except ValueError:
                continue
    return out


def mas_cerca(angs, esclavo, h):
    cand = [a for a in angs if a[0] == esclavo and abs(a[1] - h) <= TOL]
    if not cand:
        return None
    return min(cand, key=lambda a: abs(a[1] - h))


def main(argv):
    if len(argv) < 2:
        sys.exit("uso: rellena_barrido.py <barrido_*.csv> <angulos.csv>")
    hoja, ang = argv[0], argv[1]
    angs = carga_angulos(ang)
    if not angs:
        sys.exit("%s no trae ningun angulo leido: revisa que zigbee_angulos.ps1 llegase a la NCU." % ang)

    with open(hoja, encoding="utf-8-sig") as f:
        filas = list(csv.DictReader(f))
        cols = list(filas[0].keys()) if filas else []
    for c in ("beta_destino", "modo_origen"):
        if c not in cols:
            cols.append(c)

    puestos = sin_hora = sin_angulo = 0
    no_auto = []
    for r in filas:
        # solo las filas medidas: `llega` vacio es un par que aun no se ha hecho
        if (r.get("llega") or "").strip() == "":
            continue
        h = hora(r.get("hora_utc"))
        if h is None:
            sin_hora += 1
            continue
        o = mas_cerca(angs, int(r["esclavo_origen"]), h) if (r.get("esclavo_origen") or "").isdigit() else None
        d = mas_cerca(angs, int(r["esclavo_destino"]), h) if (r.get("esclavo_destino") or "").isdigit() else None
        if o is None and d is None:
            sin_angulo += 1
            continue
        if o:
            r["beta_grados"] = "%.1f" % o[2]
            r["modo_origen"] = o[3]
            # un seguidor que no esta en AUTO no esta siguiendo: su angulo es
            # bueno, pero conviene saberlo antes de meterlo en el ajuste
            if o[3] and o[3] != "AUTO":
                no_auto.append((r["esclavo_origen"], o[3]))
        if d:
            r["beta_destino"] = "%.1f" % d[2]
        puestos += 1

    with open(hoja, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in filas:
            w.writerow({c: r.get(c, "") for c in cols})

    medidas = sum(1 for r in filas if (r.get("llega") or "").strip() != "")
    print("%s: %d de %d medidas con angulo" % (hoja, puestos, medidas))
    if sin_hora:
        print("  %d medidas SIN hora: sin ella no se puede cruzar nada" % sin_hora)
    if sin_angulo:
        print("  %d medidas sin angulo a menos de %d min: se dejan vacias, "
              "no se inventan" % (sin_angulo, TOL.seconds // 60))
    if no_auto:
        print("  %d medidas con el seguidor fuera de AUTO (%s): no estaba siguiendo"
              % (len(no_auto), ", ".join("%s=%s" % x for x in no_auto[:4])))
    if not medidas:
        print("  (la hoja aun no tiene ninguna medida: rellena `llega` y `hora_utc`)")


if __name__ == "__main__":
    main(sys.argv[1:])
