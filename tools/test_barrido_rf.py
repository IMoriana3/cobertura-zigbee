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


# EL NUCLEO RF NO ES OPCIONAL PARA ESTE BANCO.
# `plan_barrido_rf.py` importa la fisica de un directorio HERMANO
# (`../cobertura-rf-fv/python`) y, si no esta, se lo traga en silencio (`Z =
# None`) y emite la hoja igual: sin margenes previstos y, por tanto, sin pasada
# de canto. La hoja sigue siendo una hoja, pero HUECA.
#
# Eso reventaba aqui en un checkout limpio con un `ZeroDivisionError` a pelo —
# todas las parejas con 0 mesas, desviacion tipica cero— que no decia nada. Y lo
# peor no era el traceback: es que la mitad de las comprobaciones de este banco
# (la correlacion, y sobre todo «las palas de canto tapan mas») no comprueban
# NADA sin el nucleo, y habrian pasado en verde el dia que dejaran de reventar.
#
# Asi que se exige, y se dice donde se busca.
NUCLEO = os.path.join(os.path.dirname(RAIZ), "cobertura-rf-fv", "python")
if not os.path.isfile(os.path.join(NUCLEO, "zigbee_pv_model.py")):
    print("FAIL falta el nucleo RF: sin el, el planificador no calcula margenes "
          "ni pasada de canto y este banco no comprueba lo que dice comprobar.")
    print("     se busca en: %s" % NUCLEO)
    print("     hace falta el repo `cobertura-rf-fv` como directorio HERMANO de este.")
    sys.exit(1)

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
# Una desviación típica de cero es un dato, no una excepción: significa que la
# hoja no varía en algo que el ajuste necesita que varíe. Se dice, no se revienta.
if sd == 0 or sm == 0:
    check("distancia y mesas quedan SEPARADAS (VIF < 5)", False,
          "la hoja no varía: %d parejas, todas con %d mesas y distancias %s"
          % (n, M[0], "iguales" if sd == 0 else "distintas"))
else:
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

# ── LA PASADA DE CANTO ──────────────────────────────────────────────────────
# Con las palas planas el rayo nunca entra en la mesa, asi que `l_mod_db` no
# esta en los datos y el ajuste lo declara no identificado. Unos 20 pares se
# miden dos veces, la segunda de canto: mismo par, distinta obstruccion.
canto = [q for q in filas if q["pasada"] == "canto"]
planos = [q for q in filas if q["pasada"] == "plano"]
check("la hoja lleva una segunda pasada DE CANTO de 20 pares", len(canto) == 20, len(canto))
check("que son pares de la primera pasada, no pares nuevos",
      all((q["origen"], q["destino"]) in {(r["origen"], r["destino"]) for r in planos} for q in canto))
check("todos cruzan mesas: sin mesas de por medio el angulo no cambia nada",
      all(int(q["mesas"]) >= 1 for q in canto), sorted({q["mesas"] for q in canto}))
check("y son los pares donde el angulo mas cambia la prediccion",
      min(float(q["margen_previsto_planas_db"]) - float(q["margen_previsto_canto_db"]) for q in canto) > 5,
      min(float(q["margen_previsto_planas_db"]) - float(q["margen_previsto_canto_db"]) for q in canto))
check("repartidos entre clases, no todos de una", len({q["clase"] for q in canto}) >= 2,
      sorted({q["clase"] for q in canto}))
check("van al FINAL de la hoja: es otra vuelta a la planta",
      all(q["pasada"] == "plano" for q in filas[:len(planos)]))
check("y la hora va vacia tambien en ellas: se mide de nuevo",
      all(q["hora_utc"] == "" and q["llega"] == "" for q in canto))
r0 = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "plan_barrido_rf.py"),
                     "ayora", "--salida", sal + ".sin", "--canto", "0"], capture_output=True, text=True, cwd=RAIZ)
check("sin pasada de canto el planificador AVISA de que l_mod_db quedara sin identificar",
      "SIN IDENTIFICAR" in r0.stdout, r0.stdout[-300:])
check("y con ella lo dice en el informe", "DOS veces" in r.stdout, r.stdout[:400])

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

# ── LAS DIEZ PLANTAS, no solo Ayora ─────────────────────────────────────────
# La herramienta moria en cuatro de las diez, y en silencio para quien no mirara
# la consola: San Jose por los 107 seguidores que el levantamiento no midio (van
# como `null` en el fichero de cotas), y Fayon, Tunez y Bagnarelli porque ninguna
# de sus NCU llega a 25 seguidores y no se elegia ninguna. Una planta sin hoja de
# barrido es una planta que no se puede calibrar.
print("\n· la hoja sale para TODAS las plantas, no solo para las grandes")
import subprocess
PLANTAS = ["elburgo", "ayora", "sanjose", "fayon", "bagnarelli", "tunez",
           "paramo", "benante", "panbianco", "polvorin"]
malas = []
for pl in PLANTAS:
    r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "plan_barrido_rf.py"), pl],
                       capture_output=True, text=True, cwd=RAIZ)
    if r.returncode != 0 or "escrito:" not in r.stdout:
        malas.append((pl, (r.stderr or r.stdout).strip().splitlines()[-1:] or [""]))
check("las diez plantas producen su hoja", not malas, malas)

# y las pequeñas la producen DICIENDOLO, no callando que van con menos nodos
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "plan_barrido_rf.py"), "bagnarelli"],
                   capture_output=True, text=True, cwd=RAIZ)
check("una planta pequeña avisa de que se barre la NCU mayor",
      "ninguna NCU llega a 25" in r.stdout, r.stdout[:200])
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "plan_barrido_rf.py"), "ayora"],
                   capture_output=True, text=True, cwd=RAIZ)
check("y una grande no avisa de nada", "ninguna NCU llega a 25" not in r.stdout, r.stdout[:200])

# el levantamiento incompleto no puede tirar la planta
sys.path.insert(0, os.path.join(RAIZ, "tools"))
from plan_barrido_rf import cotas                                      # noqa: E402
cot = cotas("sanjose")
check("San José tiene cotas pese a los 107 seguidores sin levantar", bool(cot), cot)

print("\n%d OK, %d FAIL" % (ok, ko))
sys.exit(1 if ko else 0)
