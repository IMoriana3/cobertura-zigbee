#!/usr/bin/env python3
"""
calibra_barrido.py — el AJUSTE de la hoja de barrido, con los pares que no llegan.

POR QUÉ CENSURADO
Un par que no enlaza no es una medida ausente: es la medida de que el RSSI está
POR DEBAJO del umbral. Tirarlos —que es lo que hace un mínimos cuadrados sobre
las filas rellenas— deja solo los enlaces que sobrevivieron, y el ajuste sale
sesgado hacia arriba en todo lo que estorba: exactamente el defecto de las 49
medidas de El Burgo (r = +0,16 con log(distancia) sobre un recorrido de x14).
Aquí cada `llega=0` entra por su probabilidad de estar bajo el umbral, que es
lo que un modelo Tobit hace y unos mínimos cuadrados no saben hacer.

QUÉ SE AJUSTA — cuatro números con significado físico, ningún bias de relleno:

    l_mod_db     pérdida extra por cada mesa que el rayo ATRAVIESA (por dentro
                 de la banda de placas). Hoy vale 0.0 en el núcleo, «calibrar».
    l_roce_db    pérdida por cada mesa que el rayo cruza POR DEBAJO: tubo de
                 torsión, pilotes y el canto inferior de la placa. El núcleo hoy
                 no la tiene, y es la que más veces actúa en un enlace TCU-TCU.
    offset_db    lo que quede sin explicar (cables, conectores, ganancia real).
                 Se ajusta el último y se mira: si se come todo, el modelo falla.
    sigma_db     el desvanecimiento, ESTIMADO a la vez y no supuesto. Con
                 censura no es un residuo a posteriori: entra en la verosimilitud.

DE DÓNDE SALE LA SEPARACIÓN. Distancia y mesas van pegadas en una fotovoltaica;
la hoja de `plan_barrido_rf.py` las separa a propósito con las tres clases (eje ·
filas · diagonal). Y `l_mod` frente a `l_roce` los separa EL ÁNGULO: con las
palas planas la mesa es una placa a la altura del tubo y el rayo siempre pasa por
debajo (solo actúa `l_roce`); de canto la banda se abre dos metros y el rayo
entra dentro (actúa `l_mod`). Por eso hay que medir unos cuantos pares dos veces,
con el seguidor plano y de canto. Si no, este programa lo dice y no se inventa el
número: lo declara NO IDENTIFICADO.

LA PREDICCIÓN SE RECALCULA al `beta_grados` anotado en cada fila, no se
interpola entre las dos columnas de la hoja. Y la geometría es la MISMA que usó
el planificador —se importa de él, no se reescribe— para que ajuste y hoja
hablen de la misma planta.

    python3 tools/calibra_barrido.py ayora --hoja cobertura_coords/ayora/barrido.csv
    python3 tools/calibra_barrido.py ayora --simula 4.5,2.0,-3,5 --salida /tmp/s.csv
"""
from __future__ import annotations
import csv, json, math, os, random, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "tools"))
import plan_barrido_rf as P                                            # noqa: E402
Z = P.Z

CUERDA = 2.384
NOMBRES = ["l_mod_db", "l_roce_db", "offset_db", "sigma_db"]
CHI2_95 = 3.841                       # 1 grado de libertad, perfil de verosimilitud


# --------------------------------------------------------------------------
# Normal: densidad y cola, sin desbordar
# --------------------------------------------------------------------------
LOG_2PI = math.log(2 * math.pi)


def log_phi_cola(z):
    """log Φ(z), sin llanuras ni infinitos.

    `erfc` da el valor exacto hasta que se queda sin exponente: por debajo de
    z ≈ −38 devuelve 0.0 redondeando, y log(0) es −inf, que convierte la
    verosimilitud entera en NaN y el ajuste en basura. No es un caso de
    laboratorio: el optimizador prueba sigmas pequeñas, y con sigma 0,5 un par
    que no llegó y que el modelo pone 20 dB por encima del umbral ya está ahí.
    Así que por debajo de ese punto se usa la asintótica, que sigue creciendo y
    sigue empujando; taparlo con una constante sería lo mismo que perder el par.
    """
    if z > -37.0:
        return math.log(0.5 * math.erfc(-z / math.sqrt(2)))
    return -0.5 * z * z - math.log(-z) - 0.5 * LOG_2PI


def log_phi_dens(z, sigma):
    return -0.5 * z * z - 0.5 * LOG_2PI - math.log(sigma)


def log1m_exp(a):
    """log(1 - exp(a)) con a <= 0, sin perder cifras cuando a ~ 0."""
    if a >= -1e-12:
        return -700.0
    return math.log1p(-math.exp(a)) if a < -0.693 else math.log(-math.expm1(a))


# --------------------------------------------------------------------------
# Geometría: la del planificador, reconstruida para la hoja ya medida
# --------------------------------------------------------------------------
def censo(planta):
    """{etiqueta: punto} de toda la planta, más las filas y las x de las filas."""
    lay, coords = P.carga(planta)
    filas = P.cotas(planta)
    porncu = P.nodos_por_ncu(lay, coords, filas)
    cen = {}
    for v in porncu.values():
        for p in v:
            cen[p["et"]] = p
    for k, v in porncu.items():
        g = P.geo_ncu(lay, coords, filas, k, v)
        cen.setdefault(g["et"], g)
    filas_x = sorted({round(t["x"], 1) for t in lay["trackers"]})
    return cen, filas, filas_x


def prepara(a, b, beta, filas, filas_x, lp):
    """Todo lo que NO depende de los parámetros a ajustar, una sola vez por par.

    Devuelve la pérdida base (dos rayos + difracción por las mesas al ángulo
    MEDIDO), la ganancia de antena según la elevación, y las dos cuentas que
    multiplican a los parámetros: mesas atravesadas y mesas cruzadas por debajo.
    """
    d = math.dist((a["x"], a["n"]), (b["x"], b["n"]))
    tabs, n = P.mesas_entre(a, b, filas_x, CUERDA, beta, filas)
    ea, eb = a["y"] + a["h"], b["y"] + b["h"]
    pl2 = Z.two_ray_pl_db(d, a["h"], b["h"], lp.f_hz, lp.eps_r, lp.sigma_ground, lp.pol)
    pld = Z.diffraction_loss_tables_db(d, ea, eb, tabs, lp.f_hz) if tabs else 0.0
    g_el = 0.0 if lp.ant_patron == "iso" else Z.dipole_gain_db(math.atan2(eb - ea, d))
    tapa = roce = 0
    for t in tabs:
        los = ea + (eb - ea) * (t.x / d)
        if t.bot <= los <= t.top:
            tapa += 1                      # el rayo va POR DENTRO de las placas
        elif los < t.bot and los > t.ground:
            roce += 1                      # pasa por debajo: tubo, pilotes, canto
    base = lp.ptx_dbm + 2 * lp.gtx_dbi + 2 * g_el - pl2 - pld
    return {"d": d, "mesas": n, "tapa": tapa, "roce": roce, "base": base}


def mu(pre, th):
    return pre["base"] - th[0] * pre["tapa"] - th[1] * pre["roce"] + th[2]


# --------------------------------------------------------------------------
# Verosimilitud censurada (Tobit)
# --------------------------------------------------------------------------
def nll(datos, th, umbral):
    """-log verosimilitud. Los que llegan aportan densidad; los que no, la cola."""
    s = max(th[3], 1e-3)
    tot = 0.0
    for q in datos:
        m = mu(q["pre"], th)
        if q["llega"] and q["rssi"] is not None:
            tot -= log_phi_dens((q["rssi"] - m) / s, s)
        elif q["llega"]:
            tot -= log1m_exp(log_phi_cola((umbral - m) / s))   # llega, sin RSSI
        else:
            tot -= log_phi_cola((umbral - m) / s)              # NO llega: censurado
    if th[3] <= 1e-3:
        tot += 1e6 * (1e-3 - th[3])
    return tot


def nelder_mead(f, x0, paso=None, tol=1e-10, maxit=6000):
    n = len(x0)
    paso = paso or [max(0.5, abs(v) * 0.15) for v in x0]
    sim = [list(x0)] + [[x0[j] + (paso[i] if i == j else 0) for j in range(n)] for i in range(n)]
    val = [f(p) for p in sim]
    for _ in range(maxit):
        o = sorted(range(n + 1), key=lambda i: val[i])
        sim = [sim[i] for i in o]; val = [val[i] for i in o]
        if abs(val[-1] - val[0]) < tol * (abs(val[0]) + tol):
            break
        cen = [sum(p[i] for p in sim[:-1]) / n for i in range(n)]
        xr = [cen[i] + (cen[i] - sim[-1][i]) for i in range(n)]; fr = f(xr)
        if fr < val[0]:
            xe = [cen[i] + 2 * (cen[i] - sim[-1][i]) for i in range(n)]; fe = f(xe)
            sim[-1], val[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < val[-2]:
            sim[-1], val[-1] = xr, fr
        else:
            xc = [cen[i] + 0.5 * (sim[-1][i] - cen[i]) for i in range(n)]; fc = f(xc)
            if fc < val[-1]:
                sim[-1], val[-1] = xc, fc
            else:
                for i in range(1, n + 1):
                    sim[i] = [(sim[i][j] + sim[0][j]) / 2 for j in range(n)]
                    val[i] = f(sim[i])
    i = min(range(n + 1), key=lambda i: val[i])
    return sim[i], val[i]


def ajusta(datos, umbral, fijo=None):
    """MLE de (l_mod, l_roce, offset, sigma). `fijo` = {indice: valor}."""
    fijo = fijo or {}
    libres = [i for i in range(4) if i not in fijo]

    def arma(v):
        th = [0.0] * 4
        for k, x in fijo.items():
            th[k] = x
        for j, i in enumerate(libres):
            th[i] = v[j]
        return th

    def f(v):
        return nll(datos, arma(v), umbral)

    arranque = [0.0, 1.0, 0.0, 6.0]
    x0 = [arranque[i] for i in libres]
    mejor, fv = nelder_mead(f, x0)
    for _ in range(3):                    # reinicio: Nelder-Mead colapsa a veces
        mejor, fv = nelder_mead(f, mejor)
    return arma(mejor), fv


def perfil(datos, umbral, th, fv, i, tope=60.0):
    """Intervalo de confianza por PERFIL de verosimilitud (chi2 1 gl, 95%).

    No se invierte ningún hessiano: se fija el parámetro, se reajustan los otros
    y se busca dónde la desviación sube 3,84. Si no sube en todo el recorrido, el
    intervalo es ABIERTO y hay que decirlo: significa que estos datos no acotan
    ese parámetro, que es un resultado, no un fallo.
    """
    out = []
    for signo in (-1, 1):
        v, lim = th[i], None
        paso = max(0.25, abs(th[i]) * 0.1)
        while abs(v - th[i]) < tope:
            v += signo * paso
            if i == 3 and v <= 0.05:
                break
            _, f2 = ajusta(datos, umbral, fijo={i: v})
            if 2 * (f2 - fv) > CHI2_95:
                lim = v
                break
            paso = min(paso * 1.6, 8.0)
        out.append(lim)
    return tuple(out)


# --------------------------------------------------------------------------
# Lectura de la hoja
# --------------------------------------------------------------------------
def num(x):
    x = str(x or "").strip().replace(",", ".")     # Windows español escribe 15,5
    try:
        return float(x)
    except ValueError:
        return None


def carga_hoja(ruta, cen, filas, filas_x, lp, avisa=print):
    datos, malas = [], []
    for r in csv.DictReader(open(ruta, encoding="utf-8-sig")):
        a, b = cen.get(r.get("et_origen", "")), cen.get(r.get("et_destino", ""))
        if not a or not b:
            malas.append((r.get("et_origen"), r.get("et_destino")))
            continue
        lle = str(r.get("llega", "")).strip()
        if lle == "":
            continue                                # fila sin medir: no es dato
        beta = num(r.get("beta_grados"))
        if beta is None:
            malas.append(("sin beta", r.get("et_origen")))
            continue
        datos.append({"a": a, "b": b, "beta": beta, "llega": lle not in ("0", "no", "NO"),
                      "rssi": num(r.get("rssi_medido_dbm")), "clase": r.get("clase", ""),
                      "pre": prepara(a, b, beta, filas, filas_x, lp)})
    if malas:
        avisa("aviso: %d filas descartadas (nodo desconocido o sin beta): %s" %
              (len(malas), malas[:3]))
    return datos


# --------------------------------------------------------------------------
# Validación y diagnóstico
# --------------------------------------------------------------------------
def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sx = math.sqrt(sum((a - mx) ** 2 for a in xs))
    sy = math.sqrt(sum((b - my) ** 2 for b in ys))
    return cov / (sx * sy) if sx and sy else 0.0


def evalua(datos, th, umbral):
    """Fuera de muestra: error en los que llegan y acierto en los que no."""
    res = [q["rssi"] - mu(q["pre"], th) for q in datos if q["llega"] and q["rssi"] is not None]
    cens = [q for q in datos if not q["llega"]]
    bien = sum(1 for q in cens if mu(q["pre"], th) < umbral)
    rms = math.sqrt(sum(v * v for v in res) / len(res)) if res else None
    return {"n_enlace": len(res), "rms_db": rms, "n_censurados": len(cens),
            "acierto_censurados": (bien / len(cens)) if cens else None}


def diagnostico(datos, th):
    """Estructura que quede en el residuo. Si la hay, falta un término."""
    q = [x for x in datos if x["llega"] and x["rssi"] is not None]
    if len(q) < 5:
        return {}
    r = [x["rssi"] - mu(x["pre"], th) for x in q]
    return {"vs_log_distancia": pearson([math.log10(x["pre"]["d"]) for x in q], r),
            "vs_mesas": pearson([float(x["pre"]["mesas"]) for x in q], r),
            "vs_beta": pearson([x["beta"] for x in q], r)}


def valida_por_clase(datos, umbral):
    out = {}
    clases = sorted({q["clase"] for q in datos if q["clase"]})
    for c in clases:
        tr = [q for q in datos if q["clase"] != c]
        te = [q for q in datos if q["clase"] == c]
        if len(tr) < 8 or not te:
            continue
        th, _ = ajusta(tr, umbral)
        out[c] = {"parametros": dict(zip(NOMBRES, [round(v, 2) for v in th])),
                  "n_ajuste": len(tr), "n_prueba": len(te), "n_total": len(datos),
                  **evalua(te, th, umbral)}
    return out


def valida_kfold(datos, umbral, k=5, semilla=7):
    idx = list(range(len(datos)))
    random.Random(semilla).shuffle(idx)
    rms, ths = [], []
    for f in range(k):
        te = [datos[i] for j, i in enumerate(idx) if j % k == f]
        tr = [datos[i] for j, i in enumerate(idx) if j % k != f]
        if len(tr) < 8 or not te:
            continue
        th, _ = ajusta(tr, umbral)
        ths.append(th)
        e = evalua(te, th, umbral)
        if e["rms_db"] is not None:
            rms.append(e["rms_db"])
    disp = {}
    if len(ths) > 1:
        for i, nb in enumerate(NOMBRES):
            v = [t[i] for t in ths]
            m = sum(v) / len(v)
            disp[nb] = math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))
    return {"rms_db": (sum(rms) / len(rms)) if rms else None, "pliegues": len(ths),
            "dispersion_parametros": disp}


# --------------------------------------------------------------------------
# Simulación: medidas sintéticas con parámetros CONOCIDOS
# --------------------------------------------------------------------------
def simula(hoja, cen, filas, filas_x, lp, verdad, umbral, betas, semilla=1):
    """Rellena una hoja planificada con medidas generadas por el propio modelo.

    Para eso está: para saber ANTES de ir a campo si la hoja que se lleva puede
    recuperar los parámetros, o si se va a volver con datos que no separan nada.
    """
    rnd = random.Random(semilla)
    out = []
    for i, r in enumerate(csv.DictReader(open(hoja, encoding="utf-8-sig"))):
        a, b = cen.get(r.get("et_origen", "")), cen.get(r.get("et_destino", ""))
        if not a or not b:
            continue
        # Si la hoja trae la pasada, se simula la CAMPAÑA tal como se planeó:
        # plano a 0 y de canto a 55. Así se comprueba antes de ir si ese diseño
        # identifica los parámetros, que es para lo que existe esta opción.
        pas = (r.get("pasada") or "").strip().lower()
        beta = 55.0 if pas == "canto" else 0.0 if pas == "plano" else betas[i % len(betas)]
        pre = prepara(a, b, beta, filas, filas_x, lp)
        v = mu(pre, verdad) + rnd.gauss(0, verdad[3])
        r = dict(r)
        r["beta_grados"] = "%.0f" % beta
        r["llega"] = "1" if v >= umbral else "0"
        r["rssi_medido_dbm"] = ("%.1f" % v) if v >= umbral else ""
        out.append(r)
    return out


# --------------------------------------------------------------------------
def informe(th, fv, ic, datos, umbral, vclase, vkfold, diag):
    tapa = sum(q["pre"]["tapa"] for q in datos)
    roce = sum(q["pre"]["roce"] for q in datos)
    cens = sum(1 for q in datos if not q["llega"])
    L = []
    L.append("pares: %d   con enlace: %d   SIN enlace (censurados): %d" %
             (len(datos), len(datos) - cens, cens))
    L.append("cruces contados: %d por dentro de las placas, %d por debajo" % (tapa, roce))
    L.append("umbral de censura: %.1f dBm   -logL = %.2f" % (umbral, fv))
    L.append("")
    for i, nb in enumerate(NOMBRES):
        lo, hi = ic[i]
        s = "  %-10s = %7.2f dB   IC95 [%s, %s]" % (
            nb, th[i], "abierto" if lo is None else "%.2f" % lo,
            "abierto" if hi is None else "%.2f" % hi)
        L.append(s)
    L.append("")
    # LO QUE HACE QUE ESTO NO MIENTA: decir cuándo un número no está sostenido.
    if cens == 0:
        L.append("!! NO hay ningún par sin enlace: sin censura esto es un mínimos cuadrados")
        L.append("   sobre los enlaces que sobrevivieron, y sale sesgado. Faltan los ceros.")
    if tapa == 0:
        L.append("!! ningún par cruza mesas POR DENTRO: `l_mod_db` NO ESTÁ IDENTIFICADO.")
        L.append("   Hay que repetir pares con el seguidor de canto (beta alto).")
    if roce == 0:
        L.append("!! ningún par cruza mesas por debajo: `l_roce_db` NO ESTÁ IDENTIFICADO.")
    for i, nb in enumerate(NOMBRES[:2]):
        if th[i] < -0.5:
            L.append("!! %s sale NEGATIVO (%.2f): cruzar una mesa no puede dar ganancia."
                     " El modelo o los datos fallan; no se usa este número." % (nb, th[i]))
    if abs(th[2]) > 12:
        L.append("!! el offset se come %.1f dB: eso no es un ajuste, es un bias tapando"
                 " lo que falta en el modelo." % th[2])
    imposibles = [q for q in datos
                  if not q["llega"] and mu(q["pre"], th) > umbral + 3 * max(th[3], 1e-3)]
    if imposibles:
        # Y HAY QUE MIRARLOS ANTES DE CREERSE EL AJUSTE. Un par que el modelo daba
        # por seguro y no llegó tira del ajuste con fuerza (entra por el cuadrado
        # de lo lejos que está), así que si lo que pasó es que el nodo estaba
        # apagado, un solo par se lleva por delante la calibración entera.
        L.append("!! %d par(es) que NO llegaron y el modelo daba por seguros (>3 sigma):"
                 " revisa el equipo antes de creerte el ajuste" % len(imposibles))
        for q in imposibles[:4]:
            L.append("   %s -> %s   a %.0f m, previsto %.0f dBm" % (
                q["a"]["et"], q["b"]["et"], q["pre"]["d"], mu(q["pre"], th)))
    if diag:
        L.append("residuo contra: log(distancia) r=%+.2f · mesas r=%+.2f · beta r=%+.2f" %
                 (diag["vs_log_distancia"], diag["vs_mesas"], diag["vs_beta"]))
        peor = max(diag.items(), key=lambda kv: abs(kv[1]))
        if abs(peor[1]) > 0.35:
            L.append("!! el residuo AÚN depende de %s (r=%+.2f): falta un término" %
                     (peor[0], peor[1]))
    if vclase:
        L.append("")
        L.append("fuera de muestra, dejando una clase entera fuera:")
        for c, v in vclase.items():
            L.append("  sin '%-8s' -> rms %s dB sobre %d enlaces, acierta %s de los censurados" % (
                c, "n/d" if v["rms_db"] is None else "%.1f" % v["rms_db"], v["n_enlace"],
                "n/d" if v["acierto_censurados"] is None else "%.0f%%" % (100 * v["acierto_censurados"])))
    if vkfold and vkfold["pliegues"]:
        L.append("validación cruzada (%d pliegues): rms %s dB" % (
            vkfold["pliegues"], "n/d" if vkfold["rms_db"] is None else "%.1f" % vkfold["rms_db"]))
        if vkfold["dispersion_parametros"]:
            L.append("  estabilidad entre pliegues: " + " · ".join(
                "%s ±%.2f" % (k, v) for k, v in vkfold["dispersion_parametros"].items()))
    return "\n".join(L)


def main(argv):
    if Z is None:
        sys.exit("falta el núcleo `zigbee_pv_model.py` (repo cobertura-rf-fv)")
    planta = argv[0] if argv and not argv[0].startswith("--") else "ayora"

    def opt(k, d=None):
        return argv[argv.index("--" + k) + 1] if "--" + k in argv else d

    lp = Z.LinkParams()
    umbral = float(opt("umbral", lp.rx_sens_dbm))
    cen, filas, filas_x = censo(planta)

    if opt("simula"):
        verdad = [float(v) for v in opt("simula").split(",")]
        hoja = opt("hoja", os.path.join(RAIZ, "cobertura_coords", planta,
                                        "barrido_%s.csv" % planta))
        betas = [float(v) for v in opt("betas", "0,0,30,55,55").split(",")]
        fs = simula(hoja, cen, filas, filas_x, lp, verdad, umbral, betas,
                    int(opt("semilla", 1)))
        sal = opt("salida", os.path.join(RAIZ, "cobertura_coords", planta, "barrido_sim.csv"))
        with open(sal, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(fs[0].keys()))
            w.writeheader(); w.writerows(fs)
        n0 = sum(1 for r in fs if r["llega"] == "0")
        print("simuladas %d medidas (%d sin enlace) con %s" %
              (len(fs), n0, dict(zip(NOMBRES, verdad))))
        print("escrito: %s" % sal)
        return 0

    hoja = opt("hoja")
    if not hoja:
        sys.exit("hace falta --hoja con el barrido RELLENO (columnas `llega` y `beta_grados`)")
    datos = carga_hoja(hoja, cen, filas, filas_x, lp)
    if len(datos) < 10:
        sys.exit("solo %d filas medidas: no hay con qué ajustar" % len(datos))

    th, fv = ajusta(datos, umbral)
    ic = [perfil(datos, umbral, th, fv, i) for i in range(4)]
    vclase = {} if "--rapido" in argv else valida_por_clase(datos, umbral)
    vkfold = {} if "--rapido" in argv else valida_kfold(datos, umbral)
    diag = diagnostico(datos, th)
    txt = informe(th, fv, ic, datos, umbral, vclase, vkfold, diag)
    print("PLANTA %s · ajuste censurado (Tobit)\n" % planta)
    print(txt)
    if opt("json"):
        json.dump({"planta": planta, "umbral_dbm": umbral, "n": len(datos),
                   "parametros": dict(zip(NOMBRES, th)),
                   "ic95": dict(zip(NOMBRES, ic)), "nll": fv,
                   "diagnostico": diag, "validacion_clase": vclase, "kfold": vkfold},
                  open(opt("json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print("\nescrito: %s" % opt("json"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
