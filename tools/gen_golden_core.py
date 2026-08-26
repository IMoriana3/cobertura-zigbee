#!/usr/bin/env python3
"""Genera el GOLDEN del núcleo de cálculo para el simulador de radiación difusa.

overcast.html es un ESPEJO en JavaScript de solargpt_core/tracker.py. Hasta
ahora su batería comprobaba que el espejo cumple el contrato *tal como se
transcribió* —constantes canónicas, tramos del escenario del test— pero nunca
ejecutaba Python. Un error al transcribir, por ejemplo, la tabla de
coeficientes de Perez habría pasado en verde.

Esto lo cierra: corre el core DE VERDAD sobre N escenarios y vuelca un CSV con
las entradas y las salidas. `tools/test_overcast_sim.mjs` lo lee y exige que el
JS lo reproduzca. Deja de ser «me creo mi transcripción» y pasa a ser «lo
comprueba la fuente».

QUÉ SE AÍSLA. El golden lleva la posición solar y la irradiancia como
ENTRADAS, no como algo a recalcular. Si el JS regenerase su meteo, la prueba
compararía dos modelos de cielo en vez de las políticas, y un fallo en
cualquiera de los dos enmascararía al otro. Con las entradas fijadas, lo que
queda bajo prueba es exactamente lo que importa: singleaxis + backtracking,
la transposición de Perez, el clamp y las cuatro políticas con su histéresis.

ALBEDO. El core NO pasa `albedo` a pvlib, así que se queda con el 0.25 por
defecto de la librería; el espejo lo expone como entrada de usuario. El golden
se genera con 0.25 para que la comparación sea contra el core tal cual es, y
el CSV lo declara en la cabecera. (Que el core no lo exponga es una limitación
suya, anotada en la doc del simulador.)

USO
    python3 tools/gen_golden_core.py [--core RUTA] [--out FICHERO]

Re-generar SOLO cuando cambie el core. El CSV se versiona en el repo para que
la batería corra offline, sin Python ni pvlib.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import functools

import numpy as np
import pandas as pd

# ── escenarios ────────────────────────────────────────────────────────────────
# Deterministas y elegidos para tocar lo que de verdad puede romperse: dos
# hemisferios, solsticios y equinoccio, GCR y θmáx distintos del canónico, eje
# girado (donde pvlib invierte el signo de θ) y los cuatro cielos que cambian
# la decisión de las políticas.
ESCENARIOS = [
    # nombre,          lat,     lon,    tz,        fecha,        dt,  gcr,   θmáx, eje,  cielo
    ("ebro_verano",    41.5763, -0.7981, "Etc/GMT-2", "2026-06-21", 10, 0.397, 55.0,   0.0, "tarde"),
    ("ebro_invierno",  41.5763, -0.7981, "Etc/GMT-1", "2026-12-21", 10, 0.397, 55.0,   0.0, "overcast"),
    ("ebro_equinoccio",41.5763, -0.7981, "Etc/GMT-1", "2026-03-21", 15, 0.397, 55.0,   0.0, "frentes"),
    ("gcr_alto",       40.4000, -3.7000, "UTC",       "2026-06-21",  5, 0.600, 45.0,   0.0, "canonico"),
    ("eje_girado",     45.4000,  9.1000, "Etc/GMT-2", "2026-09-15", 10, 0.397, 55.0,  23.7, "frentes"),
    ("hemisferio_sur", -16.4000, -71.5000,"Etc/GMT+5","2026-06-21", 10, 0.350, 60.0,   0.0, "overcast"),
    ("despejado",      41.5763, -0.7981, "Etc/GMT-2", "2026-06-21", 10, 0.397, 55.0,   0.0, "despejado"),
]

ALBEDO_CORE = 0.25          # el que usa pvlib por defecto y el core no cambia
TL = 3.5                    # turbidez Linke
ALT_M = 300.0

# tramos del escenario canónico del test del core (minutos locales)
TEST_SPANS = [(360, 375), (420, 570), (600, 660), (840, 1020)]


def serie_cc(nombre: str, n: int, dt: int) -> np.ndarray:
    """Cobertura nubosa por paso. Mismas recetas que los presets del espejo."""
    cc = np.zeros(n)
    mins = np.arange(n) * dt

    def span(a, b, v):
        cc[(mins >= a) & (mins < b)] = v

    if nombre == "overcast":
        cc[:] = 0.95
    elif nombre == "tarde":
        span(780, 870, 0.4)
        span(870, 1440, 0.9)
    elif nombre == "frentes":
        cc[:] = 0.15
        for a, b in ((540, 610), (650, 680), (780, 900), (960, 1050)):
            span(a, b, 0.95)
    elif nombre == "canonico":
        for a, b in TEST_SPANS:
            span(a, b, 1.0)
    elif nombre != "despejado":
        raise SystemExit(f"cielo desconocido: {nombre}")
    return cc


def construye(esc, tracker_mod):
    """Devuelve (solpos, weather, cc) con la meteo del escenario."""
    import pvlib

    nombre, lat, lon, tz, fecha, dt, gcr, thmax, eje, cielo = esc
    idx = pd.date_range(f"{fecha} 00:00", f"{fecha} 23:59", freq=f"{dt}min", tz=tz)
    solpos = pvlib.solarposition.get_solarposition(idx, lat, lon, altitude=ALT_M)

    # cielo claro Ineichen-Perrin, el mismo modelo que el espejo
    am = pvlib.atmosphere.get_relative_airmass(solpos["apparent_zenith"])
    press = pvlib.atmosphere.alt2pres(ALT_M)
    ama = pvlib.atmosphere.get_absolute_airmass(am, press)
    cs = pvlib.clearsky.ineichen(solpos["apparent_zenith"], ama, TL,
                                 altitude=ALT_M, perez_enhancement=False)

    cc = serie_cc(cielo, len(idx), dt)
    cosz = np.cos(np.radians(solpos["apparent_zenith"].values)).clip(0, None)
    ghi = cs["ghi"].values * (1.0 - 0.70 * cc)
    dni = cs["dni"].values * (1.0 - cc) ** 3
    dhi = np.fmax(ghi - dni * cosz, 0.0)

    weather = pd.DataFrame({"GHI": ghi, "DNI": dni, "DHI": dhi}, index=idx)
    return solpos, weather, cc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", default="/home/user/SolarGPTfull/solargpt",
                    help="carpeta que contiene el paquete solargpt_core")
    ap.add_argument("--out", default=str(Path(__file__).with_name("golden_core.csv")))
    args = ap.parse_args()

    sys.path.insert(0, args.core)
    from solargpt_core import tracker as T  # noqa: E402
    import pvlib  # noqa: E402

    filas = []
    for esc in ESCENARIOS:
        nombre, lat, lon, tz, fecha, dt, gcr, thmax, eje, cielo = esc
        solpos, weather, cc = construye(esc, T)

        tcfg = T.TrackerConfig(max_angle=thmax, gcr=gcr, backtrack=True,
                               axis_azimuth=eje, axis_tilt=0.0, night_stow_deg=0.0)
        dcfg = T.DEFAULT_DIFFUSE_CONFIG

        th_n = T.get_baseline_theta(solpos, tcfg)
        poa_n = T.compute_poa_perez(th_n, solpos, weather,
                                    axis_azimuth=eje, axis_tilt=0.0)
        ghi = weather["GHI"].values

        POLS = (("diffuse_flat", "policy_diffuse_flat"),
                ("diffuse_limited", "policy_diffuse_limited"),
                ("diffuse_continuous", "policy_diffuse_continuous"),
                ("diffuse_poa_switch", "policy_diffuse_poa_switch"))

        def corre():
            out = {}
            for k, nombre in POLS:
                th, flag = getattr(T, nombre)(th_n, poa_n, ghi, solpos, weather, dcfg)
                out[k] = (np.asarray(th, float), np.asarray(flag, bool))
            return out

        # (a) el core TAL CUAL
        pol = corre()

        # (b) el core CON EL EJE PROPAGADO. Ninguna de las cuatro políticas pasa
        #     axis_azimuth a compute_poa_perez —solo run_tracker lo hace—, así que
        #     con eje girado DECIDEN con la transposición de otra orientación.
        #     Es un bug del core, no del espejo: el espejo sí propaga el eje. Se
        #     vuelca la variante corregida para poder comparar contra lo que el
        #     core DEBERÍA dar, y que la diferencia quede medida en vez de oculta.
        orig = T.compute_poa_perez
        try:
            T.compute_poa_perez = functools.partial(orig, axis_azimuth=eje, axis_tilt=0.0)
            pol_fix = corre()
        finally:
            T.compute_poa_perez = orig

        for i in range(len(solpos)):
            f = {
                "escenario": nombre, "paso": i, "dt_min": dt,
                "minuto_local": int(solpos.index[i].hour * 60 + solpos.index[i].minute),
                "gcr": gcr, "theta_max": thmax, "axis_azimuth": eje,
                "doy": int(solpos.index[i].dayofyear),
                # ENTRADAS (el JS las consume, no las recalcula)
                "zenit": float(solpos["apparent_zenith"].values[i]),
                "azimut": float(solpos["azimuth"].values[i]),
                "ghi": float(weather["GHI"].values[i]),
                "dni": float(weather["DNI"].values[i]),
                "dhi": float(weather["DHI"].values[i]),
                # SALIDAS del core
                "theta_n": float(th_n[i]),
                "poa_n": float(poa_n[i]),
            }
            for k, (th, flag) in pol.items():
                f[f"{k}_theta"] = float(th[i])
                f[f"{k}_flag"] = int(bool(flag[i]))
            for k, (th, flag) in pol_fix.items():
                f[f"{k}_fix_theta"] = float(th[i])
                f[f"{k}_fix_flag"] = int(bool(flag[i]))
            filas.append(f)

    cols = list(filas[0].keys())
    out = Path(args.out)
    with out.open("w", newline="", encoding="utf-8") as fh:
        fh.write(f"# GOLDEN del núcleo — generado por tools/gen_golden_core.py\n")
        fh.write(f"# pvlib {pvlib.__version__} · tracker schema {T.TRACKER_SCHEMA_VERSION}\n")
        fh.write(f"# albedo {ALBEDO_CORE} (por defecto de pvlib: el core NO lo expone) · "
                 f"Linke {TL} · altitud {ALT_M} m\n")
        fh.write(f"# Perez allsitescomposite1990 · {len(ESCENARIOS)} escenarios · {len(filas)} filas\n")
        fh.write("# Las columnas zenit..dhi son ENTRADAS: el espejo debe consumirlas, no regenerarlas.\n")
        fh.write("# *_theta/*_flag = el core TAL CUAL. *_fix_theta/*_fix_flag = el core con el azimut\n")
        fh.write("# del eje propagado a la transposicion: las 4 politicas NO lo pasan (solo run_tracker),\n")
        fh.write("# asi que con eje girado deciden con otra orientacion. Bug del core, no del espejo.\n")
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(filas)

    print(f"{out} · {len(filas)} filas · {len(ESCENARIOS)} escenarios")
    for esc in ESCENARIOS:
        print(f"  · {esc[0]:16s} {esc[4]}  dt={esc[5]:2d}min  gcr={esc[6]}  θmáx={esc[7]}  eje={esc[8]}  {esc[9]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
