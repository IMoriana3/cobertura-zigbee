#!/usr/bin/env python3
"""
El planificador del barrido (`plan_barrido_rf.py`), sobre Ayora.

No hay medidas de campo que contrastar —ese es justo el problema que la campaña
viene a resolver—, así que lo que se comprueba es el DISEÑO del experimento, que
es donde está el valor: que los pares rompan la correlación entre distancia y
número de mesas, que las tres clases estén representadas, y que el modelo
distinga las palas planas de las de canto (si no distingue, la campaña no puede
contrastar el término de mesas y la hoja de campo engaña al que la lleva).

    python3 tools/test_barrido_rf.py
"""
import csv, math, os, subprocess, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ok = ko = 0


def check(n, cond, extra=None):
    global ok, ko
    if cond:
        ok += 1; print("OK   " + n)
    else:
        ko += 1; print("FAIL " + n + ("" if extra is None else " -> %s" % (extra,)))


sal = os.path.join(tempfile.mkdtemp(), "barrido.csv")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "plan_barrido_rf.py"),
                    "ayora", "--salida", sal],
                   capture_output=True, text=True, cwd=RAIZ)
check("el planificador corre sobre Ayora", r.returncode == 0, r.stderr[-300:])
filas = list(csv.DictReader(open(sal, encoding="utf-8")))
check("y saca una hoja con pares suficientes", len(filas) >= 40, len(filas))

clases = {q["clase"] for q in filas}
check("con las TRES clases geométricas (eje · filas · diagonal)",
      clases == {"eje", "filas", "diagonal"}, clases)

# a lo largo del eje: metros sin mesas. Es lo que rompe la correlación.
eje = [q for q in filas if q["clase"] == "eje"]
check("los pares 'a lo largo del eje' llegan lejos SIN cruzar mesas",
      max(float(q["distancia_m"]) for q in eje) > 100 and
      all(int(q["mesas"]) <= 1 for q in eje),
      "max %s m, mesas %s" % (max(float(q["distancia_m"]) for q in eje),
                              sorted({q["mesas"] for q in eje})))

D = [float(q["distancia_m"]) for q in filas]
M = [int(q["mesas"]) for q in filas]
n = len(D); md, mm = sum(D) / n, sum(M) / n
cov = sum((a - md) * (b - mm) for a, b in zip(D, M)) / n
sd = math.sqrt(sum((a - md) ** 2 for a in D) / n)
sm = math.sqrt(sum((b - mm) ** 2 for b in M) / n)
rr = cov / (sd * sm)
vif = 1 / (1 - rr * rr)
# El dato de hoy no separa nada; una hoja que tampoco separase no serviría.
check("distancia y mesas quedan SEPARADAS (VIF < 5)", vif < 5, "r=%+.2f VIF=%.1f" % (rr, vif))

check("ningún par pasa de 500 m: más allá no es un enlace, es un hueco",
      max(D) <= 500, max(D))
check("y ninguno baja de 10 m", min(D) >= 10, min(D))

# El fallo que tuvo esta herramienta: pasar la semianchura donde va el
# desplazamiento subía la banda y salían los MISMOS dB con las palas planas y de
# canto, que es imposible. Sin esta comprobación no se habría visto.
dif = [float(q["margen_previsto_canto_db"]) - float(q["margen_previsto_planas_db"])
       for q in filas if int(q["mesas"]) >= 3]
check("con mesas de por medio, las palas de canto tapan MUCHO más que las planas",
      len(dif) >= 10 and sorted(dif)[len(dif) // 2] < -8,
      "mediana %.1f dB sobre %d pares" % (sorted(dif)[len(dif) // 2], len(dif)) if dif else "sin pares")
sin = [abs(float(q["margen_previsto_canto_db"]) - float(q["margen_previsto_planas_db"]))
       for q in filas if int(q["mesas"]) == 0]
check("y sin mesas de por medio el ángulo NO cambia nada",
      sin and max(sin) < 0.05, max(sin) if sin else "sin pares")

# LA GEOMETRÍA DE LA BANDA, y no solo su efecto. El fallo que tuvo esta
# herramienta fue pasar la semianchura donde va el DESPLAZAMIENTO: eso sube la
# mesa media cuerda y deja de tapar. Comprobarlo por el efecto no basta —el
# mutante sigue dando diferencia entre ángulos—, así que se comprueba la cota:
# con las palas planas la mesa es una placa a la altura del TUBO, ni un cm más.
sys.path.insert(0, os.path.join(RAIZ, "tools"))
import plan_barrido_rf as P                                          # noqa: E402
A = {"x": 0.0, "n": 0.0}
B = {"x": 60.0, "n": 0.0}
b0, _ = P.mesas_entre(A, B, [30.0], 2.384, 0, None)
b55, _ = P.mesas_entre(A, B, [30.0], 2.384, 55, None)
check("con las palas planas la mesa es una placa a la altura del tubo",
      b0 and abs(b0[0].bot - P.HTUBE) < 1e-9 and abs(b0[0].top - P.HTUBE) < 1e-9,
      (b0[0].bot, b0[0].top) if b0 else None)
check("y de canto se abre SIMÉTRICA sobre esa misma altura",
      b55 and abs((b55[0].bot + b55[0].top) / 2 - P.HTUBE) < 1e-9 and
      b55[0].top - b55[0].bot > 1.9,
      (b55[0].bot, b55[0].top) if b55 else None)

decide = [q for q in filas
          if float(q["margen_previsto_planas_db"]) >= 8 > float(q["margen_previsto_canto_db"])]
check("hay pares donde el ángulo decide si hay enlace: son los que contrastan el modelo",
      len(decide) >= 3, len(decide))

# la hoja tiene que poder rellenarse, y los ceros son la mitad del dato
cols = set(filas[0].keys())
check("la hoja trae las columnas de medida vacías, `llega` incluida",
      {"llega", "beta_grados", "rssi_medido_dbm", "hora_utc"} <= cols and
      all(q["llega"] == "" and q["rssi_medido_dbm"] == "" for q in filas), sorted(cols))
check("y lo que hace falta para ir al campo: esclavo y coordenadas de los dos extremos",
      {"esclavo_origen", "esclavo_destino", "lat_origen", "lon_destino"} <= cols and
      all(q["lat_origen"] and q["lon_destino"] for q in filas))

censo = {r2["node_id"] for r2 in csv.DictReader(
    open(os.path.join(RAIZ, "cobertura_coords", "ayora", "coords_ayora.csv"), encoding="utf-8"))}
falta = {q["destino"] for q in filas} - censo
check("todo destino existe en el censo de la planta", not falta, sorted(falta)[:3])

print("\n%d OK, %d FAIL" % (ok, ko))
sys.exit(1 if ko else 0)
