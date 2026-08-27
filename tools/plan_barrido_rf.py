#!/usr/bin/env python3
"""
plan_barrido_rf.py — la HOJA DE CAMPO del barrido de cobertura.

POR QUÉ
Las 49 medidas de El Burgo no calibran nada: son las parejas padre-hijo que la
MALLA ELIGIÓ, o sea los enlaces que funcionan, y su RSSI ni siquiera depende de
la distancia (r = +0,16 sobre un recorrido de x14). Para calibrar hace falta lo
contrario: pares elegidos por GEOMETRÍA, y anotando también los que NO llegan.

Esto elige esos pares. No mide: prepara la lista que se lleva al campo.

EL TRUCO, Y ES TODO EL VALOR DE ESTA HERRAMIENTA. En una planta fotovoltaica la
distancia y el número de mesas van de la mano —más lejos es más filas cruzadas—,
y con dos variables pegadas un ajuste no puede separarlas: sale un número que
vale para las dos cosas y no describe ninguna. Se rompe eligiendo a propósito
pares de las tres clases:

    a lo largo del eje   distancia grande, CERO mesas de por medio
    a través de filas    pocos metros, muchas mesas
    en diagonal          las dos cosas a la vez

Con las tres, distancia y obstrucción dejan de ir juntas y el ajuste puede
repartir la culpa. Ese reparto es exactamente lo que hoy no se puede hacer.

QUÉ SALE
Un CSV con el formato que ya come `tools/malla_medida.py`, con las columnas de
medida VACÍAS y dos nuevas que son las que hacen que la campaña valga:

    llega          1 si hubo enlace, 0 si no. LOS CEROS SON LA MITAD DEL DATO.
    beta_grados    ángulo del seguidor al medir.

Y, para el que va a campo, lo que necesita para navegar y para saber qué
esperar: lat/lon de los dos extremos, esclavo Modbus, distancia, mesas cruzadas
y el margen que predice el modelo con las palas planas y de canto. Los pares que
el modelo da por perdidos son los MÁS valiosos: si llegan, el modelo sobra.

    python3 tools/plan_barrido_rf.py ayora
    python3 tools/plan_barrido_rf.py ayora --ncu 13 --pares 80
"""
from __future__ import annotations
import csv, json, math, os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NUCLEO = os.path.join(os.path.dirname(RAIZ), "cobertura-rf-fv", "python")
if os.path.isdir(NUCLEO):
    sys.path.insert(0, NUCLEO)
try:
    import zigbee_pv_model as Z
except ImportError:                                   # sin el núcleo se elige igual
    Z = None

HTUBE, DROP, H_NCU = 1.5, 0.725, 3.15                 # cotas de antena de catálogo
H_TCU = HTUBE - DROP


def carga(planta):
    lay = json.load(open(os.path.join(RAIZ, "%s_layout.json" % planta), encoding="utf-8"))
    coords = {}
    fc = os.path.join(RAIZ, "cobertura_coords", planta, "coords_%s.csv" % planta)
    for r in csv.DictReader(open(fc, encoding="utf-8")):
        coords[r["etiqueta"]] = r
    return lay, coords


def cotas(planta):
    """Cota de suelo por fila, si la planta tiene levantamiento."""
    f = os.path.join(RAIZ, "%s_cotas.json" % planta)
    if not os.path.exists(f):
        return None
    d = json.load(open(f, encoding="utf-8"))
    filas = []
    for t in d.get("t", []):
        for q in t.get("f", []):
            if q.get("y") and q.get("n"):
                filas.append((q["x"], (q["n"][0] + q["n"][1]) / 2,
                              sum(q["y"]) / len(q["y"])))
    return filas or None


def cota_en(filas, x, n):
    if not filas:
        return 0.0
    best, bd = 0.0, 1e18
    for fx, fn, fy in filas:
        d = (fx - x) ** 2 + 0.06 * (fn - n) ** 2
        if d < bd:
            bd, best = d, fy
    return best


def mesas_entre(a, b, filas_x, cuerda, beta, filas=None):
    """Bandas de mesa que cruza el salto. Eje N-S: las filas se separan en x.

    `table_band(x, ground, axis_h, chord, tilt, off)` calcula ella misma la
    semianchura; el sexto argumento es un DESPLAZAMIENTO sobre la cuerda. Pasarle
    ahí la semianchura sube la banda medio metro y la mesa deja de tapar: salían
    los mismos dB con las palas planas y de canto, que es imposible."""
    if Z is None:
        return [], 0
    lo, hi = sorted([a["x"], b["x"]])
    d = math.dist((a["x"], a["n"]), (b["x"], b["n"]))
    out = []
    for fx in filas_x:
        if lo + 0.5 < fx < hi - 0.5:
            frac = abs(fx - a["x"]) / max(1e-6, abs(b["x"] - a["x"]))
            nn = a["n"] + (b["n"] - a["n"]) * frac
            out.append(Z.table_band(frac * d, cota_en(filas, fx, nn), HTUBE, cuerda, beta))
    return out, len(out)


def margen(a, b, tabs):
    if Z is None:
        return None
    d = math.dist((a["x"], a["n"]), (b["x"], b["n"]))
    r = Z.predict_link({"x": 0, "y": 0, "ground": a["y"], "h": a["h"]},
                       {"x": d, "y": 0, "ground": b["y"], "h": b["h"]},
                       Z.LinkParams(), tables=tabs or None)
    return r["margin_db"]


def clase(a, b):
    """A lo largo del eje, a través de las filas, o diagonal."""
    dx, dn = abs(b["x"] - a["x"]), abs(b["n"] - a["n"])
    if dx < 8:
        return "eje"
    if dn < 25:
        return "filas"
    return "diagonal"


def main(argv):
    planta = argv[0] if argv else "ayora"
    def opt(k, dflt=None):
        return argv[argv.index("--" + k) + 1] if "--" + k in argv else dflt
    n_obj = int(opt("pares", 72))
    ncu_sel = opt("ncu")

    lay, coords = carga(planta)
    filas = cotas(planta)
    cuerda = 2.384
    filas_x = sorted({round(t["x"], 1) for t in lay["trackers"]})

    # --- nodos de la NCU elegida, con su cota y su altura de antena ---
    def punto(x, n, h, et, rol):
        c = coords.get(et, {})
        return {"x": x, "n": n, "h": h, "y": cota_en(filas, x, n), "et": et, "rol": rol,
                "id": c.get("node_id", ""), "lat": c.get("lat", ""), "lon": c.get("lon", ""),
                "esclavo": c.get("esclavo", ""), "ncu": c.get("ncu", ""), "gw": c.get("gw", "")}

    porncu = {}
    for t in lay["trackers"]:
        porncu.setdefault(str(t.get("ncu", 1)), []).append(
            punto(t["x"], t["n"], H_TCU, t["id"], "TCU"))

    # ¿qué NCU da el mejor reparto? La que más recorrido de distancia ofrece.
    if not ncu_sel:
        mejor, bs = None, -1
        for k, v in porncu.items():
            if len(v) < 25:
                continue
            xs = [p["x"] for p in v]; ns = [p["n"] for p in v]
            s = (max(xs) - min(xs)) * (max(ns) - min(ns))
            if s > bs:
                bs, mejor = s, k
        ncu_sel = mejor
    nodos = porncu[str(ncu_sel)]

    ncu_geo = None
    for c in lay.get("ncus", []):
        if c.get("name", "").replace("NCU ", "").strip().lstrip("0") == str(ncu_sel):
            ncu_geo = punto(c["x"], c["n"], H_NCU, c["name"], "COORD")
    if ncu_geo is None:                                   # sin coordenada declarada: el centroide
        ncu_geo = punto(sum(p["x"] for p in nodos) / len(nodos),
                        sum(p["n"] for p in nodos) / len(nodos), H_NCU, "NCU %s" % ncu_sel, "COORD")

    # --- candidatos: cada TCU contra la NCU, y TCU contra TCU ---
    cand = []
    for i, a in enumerate(nodos):
        cand.append((ncu_geo, a))
        for b in nodos[i + 1:]:
            cand.append((a, b))

    # --- rejilla (clase x tramo de distancia): se reparte para romper la
    #     correlación entre distancia y mesas, que es todo el objetivo ---
    # Tope de distancia: más allá no hay enlace que medir, hay un hueco. Las 49
    # medidas de El Burgo llegan a 338 m, así que 500 cubre el recorrido útil y
    # deja sitio para unos cuantos que no lleguen — que son los que hacen falta.
    DMAX = float(opt("dmax", 500))
    TRAMOS = [(0, 40), (40, 90), (90, 160), (160, 260), (260, 360), (360, DMAX)]
    rej = {}
    for a, b in cand:
        d = math.dist((a["x"], a["n"]), (b["x"], b["n"]))
        if d < 10 or d >= DMAX:
            continue
        tr = next(i for i, (lo, hi) in enumerate(TRAMOS) if lo <= d < hi)
        rej.setdefault((clase(a, b), tr), []).append((d, a, b))

    celdas = sorted(rej.keys())
    por_celda = max(1, n_obj // max(1, len(celdas)))
    sel = []
    for c in celdas:
        lote = sorted(rej[c], key=lambda q: q[0])
        paso = max(1, len(lote) // por_celda)
        sel += [q for q in lote[::paso][:por_celda]]
    sel = sel[:n_obj]

    # --- ficha de cada par ---
    filasout, resumen = [], {}
    for d, a, b in sorted(sel, key=lambda q: q[0]):
        tabs0, n0 = mesas_entre(a, b, filas_x, cuerda, 0, filas)
        tabs55, n55 = mesas_entre(a, b, filas_x, cuerda, 55, filas)
        m0, m55 = margen(a, b, tabs0), margen(a, b, tabs55)
        cl = clase(a, b)
        resumen[cl] = resumen.get(cl, 0) + 1
        filasout.append({
            "origen": a["id"] or a["et"], "destino": b["id"] or b["et"],
            "rssi_medido_dbm": "", "llega": "", "beta_grados": "", "hora_utc": "",
            "distancia_m": round(d, 1), "mesas": n0, "clase": cl,
            "et_origen": a["et"], "et_destino": b["et"],
            "esclavo_origen": a["esclavo"], "esclavo_destino": b["esclavo"],
            "lat_origen": a["lat"], "lon_origen": a["lon"],
            "lat_destino": b["lat"], "lon_destino": b["lon"],
            "margen_previsto_planas_db": "" if m0 is None else round(m0, 1),
            "margen_previsto_canto_db": "" if m55 is None else round(m55, 1),
        })

    sal = opt("salida", os.path.join(RAIZ, "cobertura_coords", planta,
                                     "barrido_%s_NCU%02d.csv" % (planta, int(ncu_sel))))
    with open(sal, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filasout[0].keys()))
        w.writeheader(); w.writerows(filasout)

    # --- informe: lo que hay que mirar ANTES de ir a campo ---
    ds = [q["distancia_m"] for q in filasout]
    ms = [q["mesas"] for q in filasout]
    print("PLANTA %s · NCU %s · %d nodos" % (planta, ncu_sel, len(nodos)))
    print("pares elegidos: %d   %s" % (len(filasout), resumen))
    print("distancia: %.0f a %.0f m   mesas cruzadas: %d a %d" % (min(ds), max(ds), min(ms), max(ms)))
    if len(ds) > 2:
        mdd = sum(ds) / len(ds); mmm = sum(ms) / len(ms)
        cov = sum((a - mdd) * (b - mmm) for a, b in zip(ds, ms)) / len(ds)
        sd = math.sqrt(sum((a - mdd) ** 2 for a in ds) / len(ds))
        sm = math.sqrt(sum((b - mmm) ** 2 for b in ms) / len(ms))
        r = cov / (sd * sm) if sd and sm else 0
        # VIF = 1/(1-r^2): cuanto se hincha la varianza de los coeficientes por
        # llevar las dos variables pegadas. Por debajo de 5 se reparte bien; el
        # dato de hoy (todo pares que la malla eligio) no llega ni a intentarlo.
        vif = 1 / (1 - r * r) if abs(r) < 0.999 else float("inf")
        print("distancia vs mesas: r = %+.2f · VIF %.1f  %s" % (
            r, vif, "(separadas: el ajuste puede repartir la culpa)" if vif < 5
                    else "(PEGADAS: el ajuste no podra separarlas)"))
    if Z is not None:
        prev = [q["margen_previsto_planas_db"] for q in filasout]
        caen = sum(1 for v in prev if v < 8)
        print("el modelo da por perdidos %d de %d con las palas planas — si llegan, el modelo sobra" %
              (caen, len(prev)))
    print("\nescrito: %s" % sal)
    print("Rellenar `llega` (1/0) y `beta_grados`. Los CEROS son la mitad del dato.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
