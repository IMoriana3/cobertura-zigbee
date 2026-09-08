#!/usr/bin/env python3
"""Hornea el TMY (año meteorológico típico) de cada planta real para
produccion.html: <planta>_tmy.json con 8760 horas UTC de
[GHI W/m², DNI W/m², DHI W/m², Tamb °C, viento m/s].

Fuente: la API TMY de PVGIS (v5_2) — la misma que la tarjeta intenta desde el
navegador si el fichero no está desplegado. Este script existe porque hornear
el dato lo hace determinista (el QA y la página leen lo MISMO) y porque hay
redes donde re.jrc.ec.europa.eu no es alcanzable desde el navegador.

Ejecutar CON red, desde la raíz del repo:
    python3 tools/gen_tmy_pvgis.py
"""
import json, math, sys, time, urllib.request

PLANTAS = {
    "elburgo": (41.5763, -0.7981),
    "ayora":   (39.1182, -1.1599),
    "sanjose": (-16.5958, -71.8064),   # Perú: PVGIS sirve América vía NSRDB
}

def tmy(lat, lon):
    url = (f"https://re.jrc.ec.europa.eu/api/v5_2/tmy?lat={lat:.4f}&lon={lon:.4f}"
           "&outputformat=json")
    with urllib.request.urlopen(url, timeout=120) as r:
        j = json.load(r)
    rows = j["outputs"]["tmy_hourly"]
    if len(rows) != 8760:
        raise SystemExit(f"TMY de {len(rows)} horas (esperaba 8760)")
    h = [[round(r["G(h)"], 1), round(r["Gb(n)"], 1), round(r["Gd(h)"], 1),
          round(r["T2m"], 1), round(r["WS10m"], 1)] for r in rows]
    return {"fuente": "PVGIS TMY (api v5_2)", "lat": lat, "lon": lon,
            "horneado": time.strftime("%Y-%m-%d"), "h": h}

if __name__ == "__main__":
    for k, (lat, lon) in PLANTAS.items():
        print(f"{k}: pidiendo TMY a PVGIS ({lat}, {lon})…", file=sys.stderr)
        d = tmy(lat, lon)
        ghi_anual = sum(r[0] for r in d["h"]) / 1000.0
        print(f"  GHI anual {ghi_anual:.0f} kWh/m² — "
              f"{'plausible' if 900 < ghi_anual < 2800 else 'REVISAR'}", file=sys.stderr)
        with open(f"{k}_tmy.json", "w") as f:
            json.dump(d, f, separators=(",", ":"))
        print(f"  → {k}_tmy.json", file=sys.stderr)
