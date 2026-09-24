"""El rango de mando por unidad: COPIA de `rangoHaz` / `conoHaz` / `trueTrackAngle`
del simulador (backtracking.html:983-1000, :1026-1036; sol.js:102-108).

Se copia tal cual, incluida la cuenta de `s·a` de conoHaz (backtracking.html:1030),
porque el encargo es que simulador y optimizador lean EL MISMO rango; el banco
(audit5/test_parametros.mjs) carea este contra el del simulador en todos los
instantes y unidades de las dos escenas. Si la cuenta del simulador cambia, el
banco cae y esto se actualiza con él, no antes.
"""
import math

RAD = math.pi / 180
DEG = 180 / math.pi


def pv_tilt(t, signo=-1):
    """backtracking.html:606 — a pvlib se le pasa −τ."""
    return signo * (t or 0)


def true_track_angle(zen, az, axis_tilt, axis_az):
    sz = math.sin(zen * RAD)
    x, y, z = sz * math.sin(az * RAD), sz * math.cos(az * RAD), math.cos(zen * RAD)
    ca, sa = math.cos(axis_az * RAD), math.sin(axis_az * RAD)
    ct, st = math.cos(axis_tilt * RAD), math.sin(axis_tilt * RAD)
    return math.atan2(x * ca - y * sa, x * sa * st + y * ca * st + z * ct) * DEG


def cono_haz(zen, az, axis_az, axis_tilt, aoi_haz, signo=-1):
    psz = true_track_angle(zen, az, pv_tilt(axis_tilt, signo), axis_az)
    if not math.isfinite(psz):
        return None
    atr, dA, Z = (axis_tilt or 0) * RAD, (az - axis_az) * RAD, zen * RAD
    sa = math.sin(Z) * math.cos(dA) * math.sin(atr) + math.cos(Z) * math.cos(atr)
    cosL = math.sqrt(max(0.0, 1 - sa * sa))
    if not cosL > 1e-9:
        return None
    q = math.cos(aoi_haz * RAD) / cosL
    if not q < 1:
        return None
    d = math.acos(max(-1.0, q)) * DEG
    return [psz - d, psz + d]


def rango_haz(zen, az, theta_max, axis_az, axis_tilt, slope, aoi_haz, margen, signo=-1):
    psz = true_track_angle(zen, az, pv_tilt(axis_tilt, signo), axis_az)
    if not math.isfinite(psz):
        return [-theta_max, theta_max]
    tt = 0 if slope is None else slope
    lo = max(-theta_max, min(psz, tt, 0) - margen)
    hi = min(theta_max, max(psz, tt, 0) + margen)
    co = cono_haz(zen, az, axis_az, axis_tilt, aoi_haz, signo)
    if co:
        lo, hi = max(lo, co[0]), min(hi, co[1])
        if hi < lo:
            m = max(-theta_max, min(theta_max, psz))
            lo = hi = m
    return [lo, hi]


def vector_sol(zen, az):
    z, a = zen * RAD, az * RAD
    return (math.sin(z) * math.sin(a), math.sin(z) * math.cos(a), math.cos(z))
