#!/usr/bin/env python3
"""
gen_coords_cobertura.py — ficheros de entrada para LANZAR la medida de cobertura.

Generaliza a las seis plantas lo que en El Burgo era un fichero suelto escrito a mano
(coords_ElBurgo_NCU1.csv), y permite acotar la medida por PLANTA, por NCU o por GW.

    python3 tools/gen_coords_cobertura.py                 # todas las plantas
    python3 tools/gen_coords_cobertura.py fayon paramo    # solo esas
    python3 tools/gen_coords_cobertura.py --en-eje         # ver "dónde cae el punto"

Salida en cobertura_coords/<planta>/:
    coords_<planta>.csv            planta entera
    coords_<planta>_NCU<nn>.csv    una por NCU
    coords_<planta>_NCU<nn>_GW<n>.csv   una por gateway: ES LA UNIDAD QUE SE LANZA,
                                        porque cada (NCU,GW) es una IP:puerto del SCADA
    coords_<planta>_GW<n>.csv     una por GW agregando todas las NCU
    ncus_<planta>.csv              solo las NCU (el coordinador, que no se sondea: es quien sondea)
    manifiesto_<planta>.json       los ámbitos que hay, con recuentos: qué se puede lanzar

Y uno para todas, en cobertura_coords/:

    indice.json                    QUÉ PLANTAS HAY y qué se puede bajar de cada una. Es lo que
                                   lee la tarjeta del panel para armar el paquete de campo sin
                                   llevar dentro una lista de plantas que se queda vieja sola.

Columnas del CSV, las mismas que ya come el driver (diagnostico_elburgo.py autodetecta
id/lat/lon) más dos de contexto:

    node_id,lat,lon,etiqueta,rol,enlace,ncu,gw,esclavo

GEORREFERENCIA — el detalle que hay que hacer bien. Las coordenadas del layout son metros
de CUADRÍCULA UTM sobre el origen de la planta, no metros sobre el norte geográfico. Pasar
de ahí a lat/lon con la fórmula esférica de toda la vida mete el error de la convergencia
de meridianos: en El Burgo son 1,46°, que sobre ±300 m desplaza hasta 7,7 m. Así que se
proyecta de verdad, con el CRS que declara cada layout.

ENLACE — 'radio' o 'cable'. La HSU que se monta SOBRE la NCU no habla por radio: va cableada, así
que no hay enlace que medirle. Se deduce de la geometría, que no deja lugar a dudas: Bagnarelli
HSU 1 a 0,0 m de su NCU, Túnez a 2,7 y Fayón a 6,5, mientras que la siguiente más próxima de
cualquier planta está a 89 m. Sigue en el fichero —hay que saber que está y que se lee—, pero
marcada, para no apuntarle un fallo de cobertura que no existe.

QUÉ NODOS ENTRAN — TCU, HSU y REPETIDORES. Los tres hablan por la misma malla, así que los
tres se sondean. Antes las HSU y los repetidores iban a un fichero aparte y se quedaban fuera de
la medida, que es tanto como no medir media red: el repetidor está puesto justo para sostenerla.
Desde 2026-08-26 las HSU y los repetidores SÍ llevan su NCU en el layout —la escribe
tools/meteo_ncu.mjs, con su procedencia en `ncu_origen`, y tools/reps_ncu.mjs— así que esa rama es
hoy la que se aplica casi siempre. Donde falte se sigue asignando la NCU más cercana, y el GW, el
del TCU más próximo DE esa NCU (un repetidor se planta para alargar el alcance de un gateway
concreto); pero eso ya solo pasa en la HSU 2 de El Polvorín y en tres de San José, y el manifiesto
las NOMBRA una a una para que nadie se las crea. Las NCU siguen en su fichero aparte: son quien
sondea, no lo sondeado.

DÓNDE CAE EL PUNTO — por defecto, donde está la TCU de verdad: atornillada a la viga del
MOTOR, la fila OESTE, a filaZ del eje (3 m). Es donde está la antena, que es lo que importa
para medir cobertura. Con --en-eje se emite en el eje del seguidor, que es lo que traen el
DWG y los listados del cliente y lo que hay en el coords_ElBurgo_NCU1.csv antiguo. Son 3 m
sobre radios de cientos: ruido para la cobertura, pero conviene saber cuál se usó al
comparar dos campañas. En plantas de una fila (filaZ 0) las dos opciones coinciden.

NUMERACIÓN Y ESCLAVO — los TCU se numeran 1..N DENTRO DE SU NCU, por orden natural de
etiqueta, que es como los numera el SCADA, y ese número ES el unit id Modbus con el que la
NCU habla con cada TCU: va en la columna `esclavo`. Comprobado contra El Burgo: ese orden
reproduce exactamente los node_id 001..108 del fichero que ya existía, y los rangos de la
toolbox lo parten en 56 + 52. Comprobado por segunda vía en las plantas cuyo id del plano
lleva el número dentro (Ayora `TK <n>-<sector>`, San José `TR-<z>_<g>-<n>`): la numeración
del plano es continua a lo largo del sector y reinicia en cada NCU, así que
`n − n del primero de su NCU + 1` da lo mismo que el orden natural — 754/754 en Ayora y
1.685 de los 1.686 declarados en San José (el que falla es el hueco del propio fichero del
SCADA: NCU9 GW1 llega a 48 y GW2 arranca en 50). El GW sale de esos rangos
(tools/tcu-toolbox/plantas del repo scada), no del layout: es quien declara los gateways, y
para El Burgo el layout ni los trae.

DE QUÉ NCU CUELGA CADA HSU — por este orden, y el manifiesto dice cuál se aplicó
(`hsus_asignadas_por`):

  1. EL LAYOUT, si lo declara. Es lo normal desde que meteo_ncu.mjs lo escribe, y trae también el
     gateway y el esclavo donde se saben (Ayora entera; El Burgo por campo).
  2. EL CUPO DEL SCADA (`hsus` por NCU) repartido con distancia total mínima. La cercanía a secas
     NO vale: en Ayora la HSU 2 está a 194 m de la NCU 6 y a 204 de la 3, y el SCADA dice que la 6
     no tiene ninguna.
  3. LA NCU MÁS CERCANA, que es la regla débil —falla 3 de los 24 casos conocidos— y por eso el
     manifiesto nombra una a una las HSU que salieron así.
"""
import json, csv, sys, math, os, re

# Benante, Panbianco y El Polvorin se anaden el 2026-08-26: tienen layout con NCU y gateway por
# seguidor, que es todo lo que hace falta. NO tienen fichero en la toolbox del SCADA, asi que van sin
# cupos ni esclavos —lo dice su manifiesto— pero medir su cobertura no depende de eso.
# Dicayagua se queda fuera a proposito: es de mesas FIJAS y su layout no trae NCU ninguna, asi que no
# hay malla que medir.
PLANTAS = ["elburgo", "ayora", "sanjose", "fayon", "bagnarelli", "paramo", "tunez",
           "benante", "panbianco", "polvorin"]
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAL = os.path.join(RAIZ, "cobertura_coords")
TOOLBOX = {"elburgo": "elburgo.json", "ayora": "24025-ayora.json", "sanjose": "24019-san-jose.json",
           "fayon": "24007-fayon.json", "bagnarelli": "24030-bagnarelli.json", "tunez": "24021-tunez.json"}   # Páramo aún no está declarada
# El repo del SCADA se clona unas veces como "scada" y otras como "SCADA", y en Linux eso importa:
# con el nombre que no era, esto no encontraba nada y se saltaba en silencio lo que declara el
# SCADA (cupos de HSU, esclavos, IP y puerto de cada gateway). Se prueban los dos.
SCADA = next((p for p in (os.path.join(os.path.dirname(RAIZ), d, "tools", "tcu-toolbox", "plantas")
                          for d in ("scada", "SCADA")) if os.path.isdir(p)),
             os.path.join(os.path.dirname(RAIZ), "scada", "tools", "tcu-toolbox", "plantas"))


def origen_utm(L):
    """Origen de la planta en UTM. Explícito si el layout lo trae; si no, proyectando su centro."""
    g = L.get("georef")
    if isinstance(g, dict) and g.get("origen_utm"):
        return tuple(g["origen_utm"])
    from pyproj import Transformer
    t = Transformer.from_crs("EPSG:4326", L["crs"], always_xy=True)
    return t.transform(L["clon"], L["clat"])


def gateways(planta):
    """(NCU, GW) -> rango de índices de TCU, más su IP y puerto, del repo scada.
       Es lo que se marca para lanzar la medida; si no está declarada, se devuelve vacío."""
    f = TOOLBOX.get(planta)
    if not f: return {}
    ruta = os.path.join(SCADA, f)
    if not os.path.exists(ruta): return {}
    out = {}
    for p in json.load(open(ruta, encoding="utf-8"))["plantas"]:
        m = re.search(r"NCU\s*(\d+)", p["nombre"] or "")
        if not m: continue
        g = re.search(r"GW\s*(\d+)", p["nombre"] or "")
        out.setdefault((int(m.group(1)), int(g.group(1)) if g else 1), []).append(
            {"ini": p.get("tcu_ini"), "fin": p.get("tcu_fin"), "ip": p.get("ip"), "puerto": p.get("puerto"),
             "hsus": p.get("hsus") or 0, "hsu_esclavos": p.get("hsu_esclavos") or []})
    return out


def reparte_hsus(met, ncus, cupo):
    """Reparte las HSU del layout entre las NCU respetando el nº de HSU que declara el SCADA,
       con la distancia total mínima. La cercanía a secas NO vale: en Ayora se equivoca en dos
       (HSU 2 cae a 194 m de la NCU 6 y a 204 de la 3, y el SCADA dice que la 6 no tiene ninguna
       y la 3 sí). Devuelve [ncu por cada HSU] o None si los recuentos no cuadran."""
    plazas = [n for n, c in sorted(cupo.items()) for _ in range(c)]
    if not plazas or len(plazas) != len(met):
        return None
    d = [[math.hypot(m["x"] - ncus[n - 1]["x"], m["n"] - ncus[n - 1]["n"]) if n <= len(ncus) else 1e9
          for n in plazas] for m in met]
    mejor = {"coste": float("inf"), "sol": None}

    def rec(i, usadas, coste, sol):
        if coste >= mejor["coste"]:
            return
        if i == len(met):
            mejor["coste"], mejor["sol"] = coste, list(sol)
            return
        for j in range(len(plazas)):
            if usadas >> j & 1:
                continue
            sol.append(plazas[j])
            rec(i + 1, usadas | 1 << j, coste + d[i][j], sol)
            sol.pop()
    rec(0, 0, 0.0, [])
    return mejor["sol"]


def orden_natural(s):
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", str(s))]


def ncu_gw(t, planta):
    """NCU y GW de cada seguidor. El Burgo no los trae como campo: van en el primer
       tramo del id ('1.10.3' -> NCU 1), que es como está numerada la planta."""
    n, g = t.get("ncu"), t.get("gw")
    if n is None and planta == "elburgo":
        try: n = int(str(t["id"]).split(".")[0])
        except Exception: n = None
    return n, (g if g is not None else 1)


def puntos(planta, en_viga):
    L = json.load(open(os.path.join(RAIZ, planta + "_layout.json"), encoding="utf-8"))
    from pyproj import Transformer
    aWGS = Transformer.from_crs(L["crs"], "EPSG:4326", always_xy=True)
    E0, N0 = origen_utm(L)
    filaZ = L.get("filaZ", 3.0)
    gws = gateways(planta)
    filas = []
    for t in L["trackers"]:
        dx, dn = 0.0, 0.0
        if en_viga and filaZ:
            th = math.radians(t.get("rot") or 0.0)                  # eje transversal, girado con el seguidor
            dx, dn = -filaZ * math.cos(th), -filaZ * math.sin(th)   # a la viga del MOTOR (fila oeste)
        lon, lat = aWGS.transform(E0 + t["x"] + dx, N0 + t["n"] + dn)
        n, g = ncu_gw(t, planta)
        filas.append({"lat": round(lat, 6), "lon": round(lon, 6), "etiqueta": t["id"],
                      "rol": "TCU", "enlace": "radio", "ncu": n, "gw": g, "x": t["x"], "n_": t["n"]})
    # numeración 1..N DENTRO de cada NCU, por orden natural de etiqueta (así lo numera el SCADA)
    for n in {r["ncu"] for r in filas}:
        sub = sorted([r for r in filas if r["ncu"] == n], key=lambda r: orden_natural(r["etiqueta"]))
        for i, r in enumerate(sub, 1):
            r["idx"] = i
            r["esclavo"] = i                                        # unit id Modbus con el que la NCU le habla
            r["node_id"] = "TCU_SUNNER_ID_%03d" % i
            for (nn, gg), tramos in gws.items():                    # el GW manda el rango de la toolbox
                if nn == n and any(x["ini"] <= i <= x["fin"] for x in tramos if x["ini"] and x["fin"]):
                    r["gw"] = gg

    # HSU y REPETIDORES: también son nodos de la malla, así que también se sondean
    def cerca_ncu(o):
        cs = L.get("ncus") or []
        if not cs: return 1
        return min(range(len(cs)), key=lambda j: (cs[j]["x"] - o["x"]) ** 2 + (cs[j]["n"] - o["n"]) ** 2) + 1
    def gw_cerca(o, n):
        cand = [r for r in filas if r["ncu"] == n]
        if not cand: return 1
        return min(cand, key=lambda r: (r["x"] - o["x"]) ** 2 + (r["n_"] - o["n"]) ** 2)["gw"]
    # HSU: la NCU de la que cuelga cada una la DECLARA el SCADA (cuántas por NCU), no la cercanía
    met = L.get("meteo") or []
    # OJO: make_plantas.py escribe el MISMO `hsus` en las dos entradas (GW1 y GW2) de una NCU
    # —la HSU cuelga de un gateway, pero el Excel no dice de cual—, asi que aqui se toma el MAXIMO
    # por NCU, no la suma: sumando, San Jose salia con 9 HSU declaradas cuando son 5.
    cupo = {}
    for (nn, _gg), tr in gws.items():
        cupo[nn] = max([cupo.get(nn, 0)] + [x["hsus"] for x in tr])
    cupo = {k: v for k, v in cupo.items() if v}
    hsu_ncu = reparte_hsus(met, L.get("ncus") or [], cupo)
    hsu_esc = {}                                                    # esclavo Modbus de la HSU, si el SCADA lo trae
    for (nn, _gg), tr in gws.items():
        for x in tr:
            for e in x["hsu_esclavos"]:                             # repetidos por la misma razon
                if e not in hsu_esc.setdefault(nn, []):
                    hsu_esc[nn].append(e)

    CABLE_M = 20.0   # HSU pegada a la NCU -> va por cable, no por radio
    for clave, rol in (("meteo", "HSU"), ("reps", "REP")):
        for j, o in enumerate(L.get(clave) or [], 1):
            n = o.get("ncu")
            if n is None and rol == "HSU" and hsu_ncu:
                n = hsu_ncu[j - 1]
            if n is None:
                n = cerca_ncu(o)
            # El esclavo de la HSU, si el layout lo DECLARA, manda: en El Burgo lo dice el
            # gateway —230 en el GW1, 231 en el GW2— y repartir por "el primero libre de esta
            # NCU" dependía del orden en que salieran las HSU del layout.
            esc = o.get("esclavo") or ""
            if not esc and rol == "HSU" and hsu_esc.get(n):
                usados = [r.get("esclavo") for r in filas if r["rol"] == "HSU" and r["ncu"] == n]
                libres = [e for e in hsu_esc[n] if e not in usados]
                esc = libres[0] if libres else hsu_esc[n][0]
            dncu = min([math.hypot(c["x"] - o["x"], c["n"] - o["n"]) for c in (L.get("ncus") or [])] or [1e9])
            enlace = "cable" if (rol == "HSU" and dncu <= CABLE_M) else "radio"
            lon, lat = aWGS.transform(E0 + o["x"], N0 + o["n"])
            filas.append({"node_id": "%s_%02d" % (rol, j), "lat": round(lat, 6), "lon": round(lon, 6),
                          "etiqueta": o.get("name") or ("%s%d" % (rol, j)), "rol": rol, "enlace": enlace,
                          "ncu": n, "gw": o.get("gw") or gw_cerca(o, n), "esclavo": esc,
                          "idx": 900 + j, "x": o["x"], "n_": o["n"]})

    filas.sort(key=lambda r: ((r["ncu"] is None, r["ncu"]), r["idx"]))
    ncus = []
    for j, o in enumerate(L.get("ncus") or [], 1):
        lon, lat = aWGS.transform(E0 + o["x"], N0 + o["n"])
        ncus.append({"tipo": "NCU", "nombre": o.get("name") or ("NCU%d" % j),
                     "lat": round(lat, 6), "lon": round(lon, 6)})
    if not met:                                                     # de donde ha salido la NCU de cada HSU
        origen = "no hay HSU"
    elif all(o.get("ncu") is not None for o in met):
        # El layout MANDA cuando lo declara, y esta rama va la primera porque es la que se aplica
        # de verdad (`n = o.get("ncu")` se mira antes que el cupo del scada). En El Burgo la casa
        # dice que va 1 HSU por cada GW de cada NCU, y eso esta escrito en el layout: adivinarlo
        # por cercania colgaba la HSU 3 de la NCU 1 cuando sus mesas son de la NCU 2.
        origen = "layout (ncu%s declarada en `meteo`)" % (" y gw" if all(o.get("gw") for o in met) else "")
    elif hsu_ncu:
        origen = "scada (cupo de `hsus` por NCU) + distancia minima"
    elif any(o.get("ncu") is not None for o in met):
        # LO IMPORTANTE AQUI ES LO QUE **NO** VIENE DEL LAYOUT. Decir solo "layout (solo en algunas)"
        # deja al lector creyendo que el resto tambien, cuando el resto sale de la NCU mas cercana,
        # que es la regla que se equivoca. San Jose es el caso: 5 declaradas y 3 por cercania.
        # Se nombran las que caen fuera, porque son las que no hay que creerse.
        sin = [o.get("name") or ("HSU%d" % (k + 1)) for k, o in enumerate(met) if o.get("ncu") is None]
        origen = ("layout en %d de %d; las otras %d por NCU mas cercana, que NO es dato: %s"
                  % (len(met) - len(sin), len(met), len(sin), ", ".join(sin)))
    elif sum(cupo.values()):
        origen = ("NCU mas cercana: el scada declara %d HSU y el layout tiene %d, no cuadran"
                  % (sum(cupo.values()), len(met)))
    else:
        origen = "NCU mas cercana (el scada no declara ninguna HSU)"
    return L, filas, ncus, gws, origen


def escribe(ruta, filas, cols):
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for r in filas: w.writerow({c: r[c] for c in cols})


def genera(planta, en_viga):
    L, filas, otros, gws, hsu_origen = puntos(planta, en_viga)
    d = os.path.join(SAL, planta); os.makedirs(d, exist_ok=True)
    COLS = ["node_id", "lat", "lon", "etiqueta", "rol", "enlace", "ncu", "gw", "esclavo"]
    ambitos = []

    def emite(nombre, sub, extra=None):
        escribe(os.path.join(d, nombre), sub, COLS)
        a = {"fichero": nombre, "tcus": len(sub)}; a.update(extra or {}); ambitos.append(a)

    emite("coords_%s.csv" % planta, filas, {"ambito": "planta"})
    ncus = sorted({r["ncu"] for r in filas if r["ncu"] is not None})
    for n in ncus:
        sub = [r for r in filas if r["ncu"] == n]
        emite("coords_%s_NCU%02d.csv" % (planta, n), sub, {"ambito": "ncu", "ncu": n})
        gsub = sorted({r["gw"] for r in sub if r["gw"] is not None})
        if len(gsub) > 1:                                   # cada (NCU,GW) es una IP:puerto: es lo que se lanza
            for g in gsub:
                s2 = [r for r in sub if r["gw"] == g]
                enl = next((x for (nn, gg), tr in gws.items() if nn == n and gg == g for x in tr), {})
                emite("coords_%s_NCU%02d_GW%d.csv" % (planta, n, g), s2,
                      {"ambito": "gateway", "ncu": n, "gw": g, "ip": enl.get("ip"), "puerto": enl.get("puerto")})
    todos_gw = sorted({r["gw"] for r in filas if r["gw"] is not None})
    for g in (todos_gw if len(todos_gw) > 1 else []):
        sub = [r for r in filas if r["gw"] == g]
        emite("coords_%s_GW%d.csv" % (planta, g), sub, {"ambito": "gw", "gw": g})
    escribe(os.path.join(d, "ncus_%s.csv" % planta), otros, ["tipo", "nombre", "lat", "lon"])   # el coordinador: no se sondea

    sin_tb = [n for n in ncus if not any(nn == n for (nn, _) in gws)]
    man = {"planta": planta, "titulo": L.get("title"), "crs": L["crs"],
           "punto": "viga del motor, fila oeste (donde está la TCU)" if en_viga else "eje del seguidor",
           "nodos": len(filas), "tcus": sum(1 for r in filas if r["rol"] == "TCU"),
           "hsus": sum(1 for r in filas if r["rol"] == "HSU"), "reps": sum(1 for r in filas if r["rol"] == "REP"),
           "cableados": sum(1 for r in filas if r["enlace"] == "cable"),
           "ncus": len(ncus), "gws": len(todos_gw),
           "una_fila": not L.get("filaZ", 3.0),
           "gateways_declarados_en_scada": bool(gws),
           "hsus_asignadas_por": hsu_origen,
           "ncus_sin_declarar_en_scada": sin_tb,
           "ambitos": ambitos,
           "siguiente_paso": "python3 diagnostico_elburgo.py <coords>.csv <rssi>.csv %s_real.geojson" % planta}
    """NO PISAR UN MANIFIESTO CON MENOS DE LO QUE YA TENÍA. La IP y el puerto de
       cada gateway salen del repo del SCADA, que se clona AL LADO de este. Sin
       ese clon la herramienta corre igual, sigue diciendo
       `gateways_declarados_en_scada: true` y se deja las IP a null: San José
       perdía 5 de sus 24 sin que nadie se enterara. Ahora se entera."""
    fman = os.path.join(d, "manifiesto_%s.json" % planta)
    if os.path.exists(fman):
        previo = json.load(open(fman, encoding="utf-8"))
        antes, ahora = ips_de(previo), ips_de(man)
        if ahora < antes:
            print("  !! %s: el manifiesto de disco trae %d gateways con IP y este solo %d — "
                  "¿está clonado el repo del SCADA al lado? NO se pisa (--force para pisarlo)."
                  % (planta, antes, ahora))
            if "--force" not in sys.argv:
                return previo
    with open(fman, "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
    return man


def indice_de_disco():
    """Los manifiestos que YA hay, sin regenerar nada."""
    out = []
    for p in PLANTAS:
        f = os.path.join(SAL, p, "manifiesto_%s.json" % p)
        if os.path.exists(f):
            out.append(json.load(open(f, encoding="utf-8")))
    return out


def ips_de(man):
    return sum(1 for a in man.get("ambitos", []) if a.get("ip"))


def escribe_indice(mans):
    """Índice de todo lo descargable. Sin esto, quien quiera ofrecer los ficheros
       —la tarjeta del panel— tiene que llevar dentro la lista de plantas, y esa
       lista se queda vieja el día que entre la siguiente."""
    idx = {"generado_por": "tools/gen_coords_cobertura.py",
           "que_es": "coordenadas de entrada para lanzar la medida de cobertura, por ámbito",
           "ambito_que_se_lanza": "(NCU,GW) cuando la planta declara gateways; si no, la NCU",
           "plantas": []}
    for m in sorted(mans, key=lambda q: q["planta"]):
        idx["plantas"].append({
            "planta": m["planta"], "titulo": m.get("titulo") or m["planta"],
            "nodos": m["nodos"], "tcus": m["tcus"], "hsus": m["hsus"], "reps": m["reps"],
            "ncus": m["ncus"], "gws": m["gws"],
            "gateways_declarados_en_scada": m["gateways_declarados_en_scada"],
            "manifiesto": "manifiesto_%s.json" % m["planta"],
            "ficheros": [{"fichero": a["fichero"], "ambito": a["ambito"],
                          "tcus": a.get("tcus"), "ncu": a.get("ncu"), "gw": a.get("gw"),
                          "ip": a.get("ip"), "puerto": a.get("puerto")}
                         for a in m["ambitos"]] +
                        [{"fichero": "ncus_%s.csv" % m["planta"], "ambito": "coordinadores",
                          "tcus": None}],
        })
    with open(os.path.join(SAL, "indice.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
    return idx


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    en_viga = "--en-eje" not in sys.argv
    if "--solo-indice" in sys.argv:
        # Rehace SOLO el índice, desde los manifiestos que ya hay. Sirve para
        # refrescarlo sin el repo del SCADA al lado, que es lo que hace falta
        # para regenerar las coordenadas de verdad.
        idx = escribe_indice(indice_de_disco())
        print("indice.json: %d plantas, %d ficheros (desde los manifiestos de disco)" %
              (len(idx["plantas"]), sum(len(q["ficheros"]) for q in idx["plantas"])))
        raise SystemExit(0)
    mans = []
    for p in (args or PLANTAS):
        m = genera(p, en_viga)
        mans.append(m)
        aviso = ""
        if not m["gateways_declarados_en_scada"]: aviso = "  · sin gateways en el SCADA"
        elif m["ncus_sin_declarar_en_scada"]: aviso = "  · NCU sin declarar en el SCADA: %s" % m["ncus_sin_declarar_en_scada"]
        print("%-11s %4d nodos (%d TCU + %d HSU + %d REP) · %2d NCU · %d GW · %2d ámbitos%s%s" %
              (p, m["nodos"], m["tcus"], m["hsus"], m["reps"], m["ncus"], m["gws"], len(m["ambitos"]),
               ("  (una fila)" if m["una_fila"] else "") + (("  · %d por cable" % m["cableados"]) if m["cableados"] else ""), aviso))
    # El índice solo se rehace cuando se han generado TODAS: con una planta suelta
    # se quedaría con esa sola y la tarjeta dejaría de ver las demás.
    if not args:
        idx = escribe_indice(mans)
        print("\nindice.json: %d plantas, %d ficheros" %
              (len(idx["plantas"]), sum(len(q["ficheros"]) for q in idx["plantas"])))
