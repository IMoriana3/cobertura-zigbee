#!/usr/bin/env python3
"""
geojson_activo.py — la planta como ACTIVO, en GeoJSON.

Ya publicamos GeoJSON de la malla de radio (`<planta>_real.geojson`: nodos, enlaces, RSSI). Esto es
otra cosa: el ACTIVO. La parcela, los seguidores con su montaje, las NCU, las HSU y los caminos, en
el formato que cualquiera abre —QGIS, GeoJSON.io— y con los nombres de pvlib que ya lleva el bloque
`montaje` de cada layout, que son los de `SingleAxisTrackerMount` / `FixedMount` de EnergyDataModel.

    python3 tools/geojson_activo.py                     todas las plantas con layout
    python3 tools/geojson_activo.py elburgo fayon       solo esas
    python3 tools/geojson_activo.py --write             las escribe en <planta>_activo.geojson

LA PROYECCIÓN NO SE IMPROVISA. Las coordenadas del layout son metros de CUADRÍCULA UTM sobre el
origen de la planta, no metros sobre el norte geográfico. Pasar de ahí a lat/lon con la fórmula
esférica mete el error de la convergencia de meridianos: en El Burgo son 1,46°, que sobre ±300 m
desplaza hasta 7,7 m. Se usa pyproj con el CRS que declara cada layout, exactamente igual que
`gen_coords_cobertura.py`, para que los dos ficheros caigan en el mismo sitio del mundo.

EL PUNTO DE CADA SEGUIDOR es su EJE DE UNIDAD, que es lo que trae el layout. No es el motor: el
motor va en la viga oeste, a `filaZ` metros. Los CSV de cobertura sí usan la viga porque ahí va la
TCU; aquí interesa el activo, así que va el eje, y queda dicho en las propiedades.
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITE = "--write" in sys.argv
PLANTAS = [a for a in sys.argv[1:] if not a.startswith("--")]


def origen_utm(L):
    """Origen de la planta en UTM. Explícito si el layout lo trae; si no, proyectando su centro."""
    if L.get("cE") is not None and L.get("cN") is not None:
        return float(L["cE"]), float(L["cN"])
    from pyproj import Transformer
    aUTM = Transformer.from_crs("EPSG:4326", L["crs"], always_xy=True)
    return aUTM.transform(float(L["clon"]), float(L["clat"]))


def feature(geom_tipo, coords, props):
    return {"type": "Feature", "geometry": {"type": geom_tipo, "coordinates": coords},
            "properties": props}


def activo(planta):
    ruta = os.path.join(RAIZ, planta + "_layout.json")
    L = json.load(open(ruta, encoding="utf-8"))
    from pyproj import Transformer
    aWGS = Transformer.from_crs(L["crs"], "EPSG:4326", always_xy=True)
    E0, N0 = origen_utm(L)

    def pt(x, n):
        lon, lat = aWGS.transform(E0 + x, N0 + n)
        return [round(lon, 7), round(lat, 7)]

    montaje = L.get("montaje") or {}
    feats = []

    # ── la parcela ────────────────────────────────────────────────────────────────────────────
    val = L.get("fence")
    if val:
        anillos = val if isinstance(val[0][0], (list, tuple)) else [val]
        for anillo in anillos:
            if len(anillo) < 3:
                continue
            ring = [pt(p[0], p[1]) for p in anillo]
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            feats.append(feature("Polygon", [ring], {"rol": "parcela", "origen": "vallado del DWG"}))

    # ── los seguidores (o las mesas fijas) ────────────────────────────────────────────────────
    if L.get("fija"):
        for i, f in enumerate(L.get("fijas") or []):
            feats.append(feature("Point", pt(f["x"], f["n"]), {
                "rol": "mesa_fija", "id": f.get("nombre") or ("M%04d" % (i + 1)),
                "surface_tilt": f.get("inclinacion"), "surface_azimuth": f.get("azimut"),
                "modulos": f.get("mods"), "filas": f.get("rows"), "columnas": f.get("cols"),
            }))
    else:
        for t in L.get("trackers") or []:
            p = {"rol": "seguidor", "id": t.get("id"), "tipo": t.get("t"),
                 "axis_azimuth": (t.get("rot") if t.get("rot") else montaje.get("axis_azimuth")),
                 "punto": "eje de unidad (no el motor)"}
            for k in ("ncu", "gw", "desig"):
                if t.get(k) is not None:
                    p[k] = t[k]
            for k in ("axis_tilt", "max_angle", "backtrack", "gcr", "cross_axis_tilt"):
                if montaje.get(k) is not None:
                    p[k] = montaje[k]
            feats.append(feature("Point", pt(t["x"], t["n"]), p))

    # ── NCU y HSU ─────────────────────────────────────────────────────────────────────────────
    for c in L.get("ncus") or []:
        feats.append(feature("Point", pt(c["x"], c["n"]),
                             {"rol": "NCU", "nombre": c.get("name")}))
    for m in L.get("meteo") or []:
        feats.append(feature("Point", pt(m["x"], m["n"]), {
            "rol": "HSU", "nombre": m.get("name"), "ncu": m.get("ncu"),
            # De dónde sale esa NCU. Va SIEMPRE que la haya: fuera de aquí, un `ncu` a secas se lee
            # como medido, y en cuatro plantas está derivado por cercanía (tools/meteo_ncu.mjs).
            "ncu_origen": m.get("ncu_origen"),
            "gw": m.get("gw"), "esclavo": m.get("esclavo"),
        }))

    # ── caminos ───────────────────────────────────────────────────────────────────────────────
    for r in L.get("roads") or []:
        if isinstance(r, list) and len(r) >= 2 and isinstance(r[0], (list, tuple)):
            feats.append(feature("LineString", [pt(p[0], p[1]) for p in r], {"rol": "camino"}))

    doc = {
        "type": "FeatureCollection",
        "name": planta,
        "crs_note": "EPSG:4326 (GeoJSON siempre en WGS84). El layout está en " + str(L.get("crs")),
        "generado_por": "tools/geojson_activo.py",
        "que_es": "La planta como ACTIVO: parcela, seguidores con su montaje, NCU, HSU y caminos. "
                  "No confundir con <planta>_real.geojson, que es la malla de radio medida.",
        "montaje": montaje or None,
        "montaje_origen": L.get("montaje_origen") or None,
        "features": feats,
    }
    return doc


nombres = PLANTAS or sorted(f[:-len("_layout.json")] for f in os.listdir(RAIZ)
                            if f.endswith("_layout.json"))
print("planta        elementos   parcela  unidades  NCU  HSU  caminos")
for n in nombres:
    try:
        doc = activo(n)
    except Exception as e:
        print("%-13s ERROR: %s" % (n, e))
        continue
    c = {}
    for f in doc["features"]:
        c[f["properties"]["rol"]] = c.get(f["properties"]["rol"], 0) + 1
    print("%-13s %9d %8d %9d %4d %4d %8d" % (
        n, len(doc["features"]), c.get("parcela", 0),
        c.get("seguidor", 0) + c.get("mesa_fija", 0), c.get("NCU", 0), c.get("HSU", 0),
        c.get("camino", 0)))
    if WRITE:
        with open(os.path.join(RAIZ, n + "_activo.geojson"), "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False)
print("\n%s" % ("escritos <planta>_activo.geojson" if WRITE
                else "(informe: nada escrito. Con --write se generan los ficheros)"))
