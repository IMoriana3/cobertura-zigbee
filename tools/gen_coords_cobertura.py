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

Columnas del CSV, las mismas que ya come el driver (diagnostico_elburgo.py autodetecta
id/lat/lon) más dos de contexto:

    node_id,lat,lon,etiqueta,rol,enlace,ncu,gw

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
Ni HSU ni repetidores llevan NCU en el layout salvo en Ayora, donde sale del GZ del listado del
cliente; donde no la hay se asigna la NCU más cercana, y el GW, el del TCU más próximo DE esa NCU
(un repetidor se planta para alargar el alcance de un gateway concreto). Las NCU siguen en su
fichero aparte: son quien sondea, no lo sondeado.

DÓNDE CAE EL PUNTO — por defecto, donde está la TCU de verdad: atornillada a la viga del
MOTOR, la fila OESTE, a filaZ del eje (3 m). Es donde está la antena, que es lo que importa
para medir cobertura. Con --en-eje se emite en el eje del seguidor, que es lo que traen el
DWG y los listados del cliente y lo que hay en el coords_ElBurgo_NCU1.csv antiguo. Son 3 m
sobre radios de cientos: ruido para la cobertura, pero conviene saber cuál se usó al
comparar dos campañas. En plantas de una fila (filaZ 0) las dos opciones coinciden.

NUMERACIÓN — los TCU se numeran 1..N DENTRO DE SU NCU, por orden natural de etiqueta, que
es como los numera el SCADA. Comprobado contra El Burgo: ese orden reproduce exactamente
los node_id 001..108 del fichero que ya existía, y los rangos de la toolbox lo parten en
56 + 52. El GW sale de esos rangos (tools/tcu-toolbox/plantas del repo scada), no del
layout: es quien declara los gateways, y para El Burgo el layout ni los trae.
"""
import json, csv, sys, math, os, re

PLANTAS = ["elburgo", "ayora", "sanjose", "fayon", "bagnarelli", "paramo", "tunez"]
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAL = os.path.join(RAIZ, "cobertura_coords")
TOOLBOX = {"elburgo": "elburgo.json", "ayora": "24025-ayora.json", "sanjose": "24019-san-jose.json",
           "fayon": "24007-fayon.json", "bagnarelli": "24030-bagnarelli.json", "tunez": "24021-tunez.json"}   # Páramo aún no está declarada
SCADA = os.path.join(os.path.dirname(RAIZ), "scada", "tools", "tcu-toolbox", "plantas")


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
            {"ini": p.get("tcu_ini"), "fin": p.get("tcu_fin"), "ip": p.get("ip"), "puerto": p.get("puerto")})
    return out


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
    CABLE_M = 20.0   # HSU pegada a la NCU -> va por cable, no por radio
    for clave, rol in (("meteo", "HSU"), ("reps", "REP")):
        for j, o in enumerate(L.get(clave) or [], 1):
            n = o.get("ncu") if o.get("ncu") is not None else cerca_ncu(o)
            dncu = min([math.hypot(c["x"] - o["x"], c["n"] - o["n"]) for c in (L.get("ncus") or [])] or [1e9])
            enlace = "cable" if (rol == "HSU" and dncu <= CABLE_M) else "radio"
            lon, lat = aWGS.transform(E0 + o["x"], N0 + o["n"])
            filas.append({"node_id": "%s_%02d" % (rol, j), "lat": round(lat, 6), "lon": round(lon, 6),
                          "etiqueta": o.get("name") or ("%s%d" % (rol, j)), "rol": rol, "enlace": enlace,
                          "ncu": n, "gw": gw_cerca(o, n), "idx": 900 + j, "x": o["x"], "n_": o["n"]})

    filas.sort(key=lambda r: ((r["ncu"] is None, r["ncu"]), r["idx"]))
    ncus = []
    for j, o in enumerate(L.get("ncus") or [], 1):
        lon, lat = aWGS.transform(E0 + o["x"], N0 + o["n"])
        ncus.append({"tipo": "NCU", "nombre": o.get("name") or ("NCU%d" % j),
                     "lat": round(lat, 6), "lon": round(lon, 6)})
    return L, filas, ncus, gws


def escribe(ruta, filas, cols):
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for r in filas: w.writerow({c: r[c] for c in cols})


def genera(planta, en_viga):
    L, filas, otros, gws = puntos(planta, en_viga)
    d = os.path.join(SAL, planta); os.makedirs(d, exist_ok=True)
    COLS = ["node_id", "lat", "lon", "etiqueta", "rol", "enlace", "ncu", "gw"]
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
           "ncus_sin_declarar_en_scada": sin_tb,
           "ambitos": ambitos,
           "siguiente_paso": "python3 diagnostico_elburgo.py <coords>.csv <rssi>.csv %s_real.geojson" % planta}
    with open(os.path.join(d, "manifiesto_%s.json" % planta), "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
    return man


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    en_viga = "--en-eje" not in sys.argv
    for p in (args or PLANTAS):
        m = genera(p, en_viga)
        aviso = ""
        if not m["gateways_declarados_en_scada"]: aviso = "  · sin gateways en el SCADA"
        elif m["ncus_sin_declarar_en_scada"]: aviso = "  · NCU sin declarar en el SCADA: %s" % m["ncus_sin_declarar_en_scada"]
        print("%-11s %4d nodos (%d TCU + %d HSU + %d REP) · %2d NCU · %d GW · %2d ámbitos%s%s" %
              (p, m["nodos"], m["tcus"], m["hsus"], m["reps"], m["ncus"], m["gws"], len(m["ambitos"]),
               ("  (una fila)" if m["una_fila"] else "") + (("  · %d por cable" % m["cableados"]) if m["cableados"] else ""), aviso))
