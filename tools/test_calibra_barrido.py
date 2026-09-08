#!/usr/bin/env python3
"""
El ajuste censurado (`calibra_barrido.py`), probado con datos SINTÉTICOS.

POR QUÉ ASÍ. El día del barrido no hay segunda oportunidad: si el ajuste está mal
escrito, se descubre con las medidas ya en la mano y la planta a 400 km. Así que
se le dan medidas generadas con unos parámetros CONOCIDOS —sobre la geometría
real de Ayora y sobre la hoja real que sale del planificador—, se les mete ruido
y censura, y se comprueba que los recupera. Si no recupera un `l_mod_db` que uno
mismo ha puesto, no va a recuperar el de la planta.

Y se comprueba lo que justifica todo el aparato: que TIRAR LOS PARES QUE NO
LLEGAN sesga el resultado. Si tirarlos diera lo mismo, esta herramienta sobra.

    python3 tools/test_calibra_barrido.py
"""
import csv, math, os, random, statistics, subprocess, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "tools"))
sys.dont_write_bytecode = True          # el .pyc invalida por (mtime, tamaño):
import shutil                           # una mutación del mismo tamaño se colaba
shutil.rmtree(os.path.join(RAIZ, "tools", "__pycache__"), ignore_errors=True)
import calibra_barrido as C             # noqa: E402

ok = ko = 0
TMP = tempfile.mkdtemp()


def check(n, cond, extra=None):
    global ok, ko
    if cond:
        ok += 1; print("OK   " + n)
    else:
        ko += 1; print("FAIL " + n + ("" if extra is None else " -> %s" % (extra,)))


# ── la hoja real del planificador sobre la planta real ──────────────────────
PLAN = os.path.join(TMP, "plan.csv")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "plan_barrido_rf.py"),
                    "ayora", "--salida", PLAN], capture_output=True, text=True, cwd=RAIZ)
check("el planificador deja una hoja que el ajuste sabe leer", r.returncode == 0, r.stderr[-200:])

LP = C.Z.LinkParams()
UMBRAL = LP.rx_sens_dbm
CEN, FILAS, FX = C.censo("ayora")
VERDAD = [4.5, 2.0, -3.0, 5.0]           # l_mod, l_roce, offset, sigma
BETAS = [0, 0, 30, 55, 55]


def escribe(ruta, filas):
    # CERRAR el fichero. Sin el `with`, el CSV se lee a medio escribir y faltan
    # las ultimas filas: el banco fallaba culpando a la herramienta.
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
        w.writeheader(); w.writerows(filas)


def hoja_simulada(verdad, semilla, betas=BETAS, umbral=UMBRAL, extra=None):
    """Medidas generadas por el modelo, con censura y ruido. `extra(pre)` añade
    una pérdida que el modelo NO sabe expresar: sirve para probar que el
    diagnóstico de residuo la detecta en vez de tragársela."""
    rnd = random.Random(semilla)
    fs = []
    for i, q in enumerate(csv.DictReader(open(PLAN, encoding="utf-8-sig"))):
        a, b = CEN.get(q["et_origen"]), CEN.get(q["et_destino"])
        if not a or not b:
            continue
        beta = betas[i % len(betas)]
        pre = C.prepara(a, b, beta, FILAS, FX, LP)
        v = C.mu(pre, verdad) + rnd.gauss(0, verdad[3]) + (extra(pre) if extra else 0.0)
        q = dict(q)
        q["beta_grados"] = "%.0f" % beta
        q["llega"] = "1" if v >= umbral else "0"
        q["rssi_medido_dbm"] = ("%.1f" % v) if v >= umbral else ""
        fs.append(q)
    p = os.path.join(TMP, "sim_%s_%s.csv" % (semilla, id(betas) % 97))
    escribe(p, fs)
    return p


def mu_de(q, th):
    return C.mu(q["pre"], th)


def datos_de(ruta, umbral=UMBRAL):
    return C.carga_hoja(ruta, CEN, FILAS, FX, LP, avisa=lambda *a: None)


# ── 1. RECUPERA LOS PARÁMETROS QUE UNO MISMO HA PUESTO ──────────────────────
SEMILLAS = list(range(1, 9))
ajustes, ingenuos = [], []
for s in SEMILLAS:
    d = datos_de(hoja_simulada(VERDAD, s))
    th, _ = C.ajusta(d, UMBRAL)
    ajustes.append(th)
    # el ajuste "de toda la vida": tirar los pares que no llegaron
    thi, _ = C.ajusta([q for q in d if q["llega"]], UMBRAL)
    ingenuos.append(thi)

for i, nb in enumerate(C.NOMBRES):
    m = statistics.mean(t[i] for t in ajustes)
    sd = statistics.stdev(t[i] for t in ajustes)
    tol = max(1.0, 1.6 * sd)
    check("recupera %-10s (verdad %5.1f, sale %.2f ±%.2f sobre %d muestras)" %
          (nb, VERDAD[i], m, sd, len(SEMILLAS)), abs(m - VERDAD[i]) < tol,
          "sesgo %.2f dB, tolerancia %.2f" % (m - VERDAD[i], tol))

# ── 2. EL INTERVALO DE CONFIANZA DICE LA VERDAD ─────────────────────────────
# Un IC que no cubre el valor real es peor que no dar IC: da confianza falsa.
d1 = datos_de(hoja_simulada(VERDAD, 11))
th1, fv1 = C.ajusta(d1, UMBRAL)
ics = [C.perfil(d1, UMBRAL, th1, fv1, i) for i in range(4)]
cubre = []
for i, (lo, hi) in enumerate(ics):
    cubre.append((lo is None or lo <= VERDAD[i]) and (hi is None or hi >= VERDAD[i]))
check("el IC95 de perfil cubre el valor real en los cuatro parámetros",
      all(cubre), [(C.NOMBRES[i], ics[i], VERDAD[i]) for i, c in enumerate(cubre) if not c])
check("y no es un intervalo de adorno: `l_roce_db` queda acotado por los dos lados",
      ics[1][0] is not None and ics[1][1] is not None and ics[1][1] - ics[1][0] < 4,
      ics[1])

# ── 3. LO QUE JUSTIFICA TODO: TIRAR LOS CEROS SESGA ─────────────────────────
mt = statistics.mean(t[0] for t in ajustes)
mi = statistics.mean(t[0] for t in ingenuos)
check("tirar los pares que no llegan INFRAVALORA la pérdida por mesa "
      "(censurado %.2f vs ingenuo %.2f, verdad %.1f)" % (mt, mi, VERDAD[0]),
      mi < VERDAD[0] - 0.3 and mi < mt - 0.3, "sesgo del ingenuo %.2f dB" % (mi - VERDAD[0]))
peor = sum(1 for a, b in zip(ajustes, ingenuos) if abs(b[0] - VERDAD[0]) > abs(a[0] - VERDAD[0]))
check("y falla más veces que el censurado (%d de %d muestras)" % (peor, len(SEMILLAS)),
      peor >= len(SEMILLAS) * 0.6, peor)

# ── 4. LOS CEROS SE USAN, NO SE CUENTAN ─────────────────────────────────────
cens = [q for q in d1 if not q["llega"]]
check("la hoja simulada trae pares SIN enlace, que son la mitad del dato",
      len(cens) >= 10, len(cens))
mus = [C.mu(q["pre"], th1) for q in cens]
check("y el ajuste los deja por debajo del umbral, que es lo que dicen",
      sum(1 for m in mus if m < UMBRAL) >= 0.9 * len(mus),
      "%d de %d" % (sum(1 for m in mus if m < UMBRAL), len(mus)))
# UN CERO INFORMA POR LO CERCA QUE ESTÁ DEL UMBRAL. Un par que se pierde por 40
# dB no dice más que "se pierde"; el que se queda a 2 dB dice dónde está la
# frontera. Con el umbral metido en el grueso de las medidas —que es el caso
# real, porque la malla corta bastante antes de la sensibilidad del chip— los
# ceros mandan, y quitarlos tiene que cambiar el resultado a lo bruto.
UM_ALTO = -88.0
d_alto = datos_de(hoja_simulada(VERDAD, 12, umbral=UM_ALTO), umbral=UM_ALTO)
th_a, _ = C.ajusta(d_alto, UM_ALTO)
th_sin, _ = C.ajusta([q for q in d_alto if q["llega"]], UM_ALTO)
check("con el umbral metido en el grueso, quitar los ceros mueve el ajuste (%.2f -> %.2f)" %
      (th_a[0], th_sin[0]), abs(th_sin[0] - th_a[0]) > 0.8, (th_a[0], th_sin[0]))
check("y el que se queda con los ceros es el que acierta (verdad %.1f)" % VERDAD[0],
      abs(th_a[0] - VERDAD[0]) < abs(th_sin[0] - VERDAD[0]),
      (th_a[0], th_sin[0], VERDAD[0]))

# ── 4ter. LA COLA, DONDE `erfc` SE QUEDA SIN EXPONENTE ──────────────────────
# Por debajo de z ~ -38 la normal vale 0.0 en coma flotante y su log es -inf:
# una sola evaluación así deja el ajuste en NaN. Y taparlo con una constante no
# vale: la cola tiene que SEGUIR bajando, o el par deja de tirar del ajuste.
tail = [C.log_phi_cola(z) for z in (-10, -20, -37.5, -50, -80, -200)]
check("la cola sigue siendo finita donde `erfc` ya vale cero",
      all(math.isfinite(v) for v in tail), tail)
check("y sigue bajando: no se aplana en una constante",
      all(tail[i] > tail[i + 1] + 100 for i in range(2, len(tail) - 1)), tail)
# En el punto de cambio las dos formas tienen que dar LO MISMO: si la asintótica
# entrara antes de tiempo, el ajuste vería un escalón donde no lo hay.
# Y donde `erfc` SÍ llega, el valor tiene que ser el exacto, no una aproximación
# cómoda: ahí es donde caen los pares que no llegan por poco, que son los que
# dicen dónde está la frontera del enlace.
_err = max(abs(C.log_phi_cola(z) - math.log(0.5 * math.erfc(-z / math.sqrt(2))))
           for z in (-0.5, -1, -2, -3, -5, -8, -12, -20, -30))
check("y donde `erfc` llega, da el valor EXACTO (error %.1e)" % _err, _err < 1e-9, _err)
_exacto = math.log(0.5 * math.erfc(37.0 / math.sqrt(2)))
check("y en el punto de cambio la asintótica vale lo que la exacta (%.1e)" %
      abs(C.log_phi_cola(-37.0) - _exacto),
      abs(C.log_phi_cola(-37.0) - _exacto) < 5e-3, (C.log_phi_cola(-37.0), _exacto))

# ── 4bis. UN PAR QUE CONTRADICE AL MODELO TIENE QUE PESAR, Y VERSE ─────────
# Un enlace que el modelo daba por segurísimo y NO llegó suele ser un equipo
# apagado, no propagación. Si la verosimilitud se aplana ahí, ese par deja de
# tirar del ajuste y nadie se entera; si tira, hay que poder verlo antes de
# creerse el resultado. Las dos cosas, o el ajuste calla lo que más ruido mete.
mejor = max(d1, key=lambda q: mu_de(q, th1))
falso = [dict(q) for q in d1]
falso[d1.index(mejor)] = dict(mejor, llega=False, rssi=None)
th_f, fv_f = C.ajusta(falso, UMBRAL)
check("un par que el modelo daba por seguro y no llegó MUEVE el ajuste (%.2f -> %.2f)" %
      (th1[0], th_f[0]), abs(th_f[0] - th1[0]) > 0.2 or abs(th_f[2] - th1[2]) > 0.5,
      (th1, th_f))
txt_f = C.informe(th_f, fv_f, [(None, None)] * 4, falso, UMBRAL, {}, {}, {})
check("y el informe lo señala para que se mire el equipo antes que el modelo",
      "daba por seguros" in txt_f, txt_f[-400:])

# ── 5. EL ÁNGULO MEDIDO SE USA, NO SE SUPONE ────────────────────────────────
a = CEN[list(CEN)[0]]
pares = [(x["et_origen"], x["et_destino"]) for x in csv.DictReader(open(PLAN, encoding="utf-8-sig"))]
p0 = [C.prepara(CEN[u], CEN[v], 0, FILAS, FX, LP) for u, v in pares if CEN.get(u) and CEN.get(v)]
p55 = [C.prepara(CEN[u], CEN[v], 55, FILAS, FX, LP) for u, v in pares if CEN.get(u) and CEN.get(v)]
check("con las palas PLANAS el rayo pasa por debajo de la mesa, nunca por dentro",
      sum(q["tapa"] for q in p0) == 0 and sum(q["roce"] for q in p0) > 50,
      (sum(q["tapa"] for q in p0), sum(q["roce"] for q in p0)))
check("y DE CANTO hay rayos que van por dentro de las placas",
      sum(q["tapa"] for q in p55) > 20, sum(q["tapa"] for q in p55))
check("la pérdida base tampoco es la misma a 0° que a 55°",
      sum(1 for x, y in zip(p0, p55) if abs(x["base"] - y["base"]) > 1) > 10)

# ── 6. UNA CAMPAÑA A UN SOLO ÁNGULO NO IDENTIFICA `l_mod_db`, Y SE DICE ─────
# Este es el aviso que evita el viaje inútil: si todo se mide con el seguidor
# plano, el término de penetración no está en los datos y no se puede inventar.
d0 = datos_de(hoja_simulada(VERDAD, 21, betas=[0]))
th0, fv0 = C.ajusta(d0, UMBRAL)
ic0 = [C.perfil(d0, UMBRAL, th0, fv0, i) for i in range(4)]
txt0 = C.informe(th0, fv0, ic0, d0, UMBRAL, {}, {}, C.diagnostico(d0, th0))
check("midiendo todo con las palas planas, el informe declara `l_mod_db` NO IDENTIFICADO",
      "l_mod_db` NO ESTÁ IDENTIFICADO" in txt0, txt0[:400])
check("y su intervalo sale abierto, no un número con dos decimales",
      ic0[0][0] is None or ic0[0][1] is None, ic0[0])
check("pero `l_roce_db` sí se identifica con las palas planas, que es lo que actúa",
      ic0[1][0] is not None and ic0[1][1] is not None and abs(th0[1] - VERDAD[1]) < 1.2,
      (th0[1], ic0[1]))
d55 = datos_de(hoja_simulada(VERDAD, 21, betas=BETAS))
th55, fv55 = C.ajusta(d55, UMBRAL)
ic55 = [C.perfil(d55, UMBRAL, th55, fv55, 0)]
check("midiendo a varios ángulos, el mismo par de datos SÍ acota `l_mod_db`",
      ic55[0][0] is not None and ic55[0][1] is not None, ic55[0])

# ── 7. SI FALTA UN TÉRMINO, EL RESIDUO LO CANTA ─────────────────────────────
# Se genera con una pérdida proporcional a la distancia que el modelo no tiene.
dext = datos_de(hoja_simulada(VERDAD, 31, extra=lambda pre: -0.06 * pre["d"]))
thx, fvx = C.ajusta(dext, UMBRAL)
dg = C.diagnostico(dext, thx)
check("una pérdida con la distancia que el modelo no tiene deja huella en el residuo",
      abs(dg["vs_log_distancia"]) > 0.35, dg)
txtx = C.informe(thx, fvx, [(None, None)] * 4, dext, UMBRAL, {}, {}, dg)
check("y el informe lo dice en vez de dar el ajuste por bueno",
      "AÚN depende de" in txtx, txtx[-300:])
dgb = C.diagnostico(d1, th1)
check("con el modelo correcto el residuo no tiene esa estructura",
      max(abs(v) for v in dgb.values()) < 0.35, dgb)

# ── 8. VALIDACIÓN FUERA DE MUESTRA ──────────────────────────────────────────
vc = C.valida_por_clase(d1, UMBRAL)
check("valida dejando fuera cada clase geométrica entera", len(vc) >= 3, sorted(vc))
rms = [v["rms_db"] for v in vc.values() if v["rms_db"]]
check("y el error fuera de muestra no se dispara respecto al sigma ajustado",
      rms and max(rms) < 2.2 * VERDAD[3], (rms, VERDAD[3]))
check("y el ajuste de cada pliegue NO ve la clase que va a probar",
      all(v["n_ajuste"] == v["n_total"] - v["n_prueba"] and v["n_prueba"] > 0
          for v in vc.values()),
      {c: (v["n_ajuste"], v["n_prueba"], v["n_total"]) for c, v in vc.items()})
vc_ac = [v["acierto_censurados"] for v in vc.values() if v["acierto_censurados"] is not None]
check("y los pares que no llegan se predicen como perdidos SIN haberlos usado para ajustar",
      vc_ac and min(vc_ac) >= 0.8, vc_ac)
kf = C.valida_kfold(d1, UMBRAL)
check("la validación cruzada da parámetros estables entre pliegues",
      kf["pliegues"] >= 4 and kf["dispersion_parametros"]["l_roce_db"] < 1.0,
      kf["dispersion_parametros"])

# ── 9. LA HOJA REAL, TAL COMO VUELVE DEL CAMPO ──────────────────────────────
# Windows español escribe 15,5 — y `float("15,5")` revienta. Ya pasó una vez y
# se perdieron todas las filas en silencio.
p = hoja_simulada(VERDAD, 41)
fs = list(csv.DictReader(open(p, encoding="utf-8-sig")))
for q in fs:
    if q["rssi_medido_dbm"]:
        q["rssi_medido_dbm"] = q["rssi_medido_dbm"].replace(".", ",")
    q["beta_grados"] = q["beta_grados"] + ",0"
pc = os.path.join(TMP, "coma.csv")
escribe(pc, fs)
dc = datos_de(pc)
check("lee la hoja con coma decimal (Windows español) sin perder una sola fila",
      len(dc) == len(datos_de(p)), (len(dc), len(datos_de(p))))
# filas a medio rellenar: sin `llega` no son un cero, son una fila sin medir
fs2 = [dict(q) for q in fs]
for q in fs2[:10]:
    q["llega"] = ""; q["rssi_medido_dbm"] = ""
pv = os.path.join(TMP, "vacias.csv")
escribe(pv, fs2)
dv = datos_de(pv)
check("una fila sin rellenar NO se cuenta como 'no llega': se descarta",
      len(dv) == len(dc) - 10, (len(dv), len(dc)))

# ── 10. DE PUNTA A PUNTA POR LÍNEA DE ÓRDENES ───────────────────────────────
sal = os.path.join(TMP, "cli.csv")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "calibra_barrido.py"), "ayora",
                    "--simula", "4.5,2.0,-3.0,5.0", "--hoja", PLAN, "--salida", sal],
                   capture_output=True, text=True, cwd=RAIZ)
check("la simulación corre por línea de órdenes", r.returncode == 0 and os.path.exists(sal),
      r.stderr[-300:])
js = os.path.join(TMP, "cal.json")
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "calibra_barrido.py"), "ayora",
                    "--hoja", sal, "--json", js], capture_output=True, text=True, cwd=RAIZ)
check("y el ajuste también, dejando el JSON con los cuatro parámetros",
      r.returncode == 0 and os.path.exists(js) and "l_mod_db" in open(js, encoding="utf-8").read(),
      (r.returncode, r.stdout[-300:], r.stderr[-300:]))
check("el informe dice cuántos pares NO llegaron, que es lo que nadie mira",
      "SIN enlace (censurados)" in r.stdout, r.stdout[:200])

# una hoja sin ningún cero es un mínimos cuadrados disfrazado, y hay que avisar
solo1 = [q for q in csv.DictReader(open(sal, encoding="utf-8-sig")) if q["llega"] == "1"]
ps = os.path.join(TMP, "solo1.csv")
escribe(ps, solo1)
r = subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "calibra_barrido.py"), "ayora",
                    "--hoja", ps, "--rapido"], capture_output=True, text=True, cwd=RAIZ)
check("una hoja SIN ningún par perdido se marca como sesgada, no se ajusta y calla",
      "NO hay ningún par sin enlace" in r.stdout, r.stdout[-300:])

# ── 11. QUE SE PUEDA USAR EL DÍA DEL BARRIDO ────────────────────────────────
import time
t0 = time.time()
th, fv = C.ajusta(d1, UMBRAL)
_ = [C.perfil(d1, UMBRAL, th, fv, i) for i in range(4)]
dt = time.time() - t0
check("ajuste + intervalos en menos de 20 s (se usa con la gente en la planta)",
      dt < 20, "%.1f s" % dt)

print("\n%d OK, %d FAIL" % (ok, ko))
sys.exit(1 if ko else 0)
