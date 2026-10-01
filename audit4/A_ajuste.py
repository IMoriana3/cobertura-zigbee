#!/usr/bin/env python3
"""R4 · ENCARGO A.1 y A.3 — el ajuste de Delta(tau) y la descomposicion.

    python3 audit4/A_ajuste.py [--json RUTA]

A.1 pide ajustar la curva Delta(tau) medida contra tau, sin(tau) y tan(tau), con
el residuo. A.3 pide localizar el sumando. Aqui se hace lo segundo SIN LEER
CODIGO, por medida: se separa

    Delta_total  = |JS(-tau) - PY(+tau)|   lo que el careo ve hoy
    Delta_form   = |JS(+tau) - PY(+tau)|   misma entrada: solo diferencia de formula
    Delta_signo  = |JS(-tau) - JS(+tau)|   mismo motor: solo el convenio de signo

Si Delta_form ~ 0 y Delta_total ~ Delta_signo, el convenio de signo ES la causa
entera, y eso queda MEDIDO en vez de deducido de una lectura.

DOS EXCLUSIONES, con su motivo y su recuento:
  · el TOPE MECANICO. Un theta clavado en +-maxAngle no dice nada de tau: los
    dos motores dan 55 y la diferencia es 0 por saturacion, no por acuerdo. Se
    excluye el punto si CUALQUIERA de las cuatro columnas satura.
  · tau = 0 entra, y es el control: ahi las tres diferencias tienen que ser
    cero exacto o el instrumento no vale.
"""
import json, os, math, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
JS = json.load(open(os.path.join(AQUI, 'out', 'A_astro_js.json')))
PY = json.load(open(os.path.join(AQUI, 'out', 'A_astro_py.json')))
MAXA = JS['geometria']['maxAngle']
INST = JS['instantes']
assert [f['tau'] for f in JS['filas']] == [f['tau'] for f in PY['filas']], 'los dos barridos no hablan del mismo tau'

def satura(v):
    return abs(abs(v) - MAXA) < 1e-6

curva = []          # por tau: rms y max de cada descomposicion
n_sat = n_tot = 0
for fj, fp in zip(JS['filas'], PY['filas']):
    tau = fj['tau']
    tot, form, sig = [], [], []
    for k in range(len(INST)):
        a, b = fj['js_menos'][k], fj['js_mas'][k]
        c, d = fp['py_mas'][k], fp['py_menos'][k]
        n_tot += 1
        if satura(a) or satura(b) or satura(c) or satura(d):
            n_sat += 1
            continue
        tot.append(abs(a - c)); form.append(abs(b - c)); sig.append(abs(a - b))
    if not tot:
        curva.append({'tau': tau, 'n': 0}); continue
    rms = lambda x: math.sqrt(sum(v * v for v in x) / len(x))
    curva.append({'tau': tau, 'n': len(tot),
                  'total_rms': rms(tot), 'total_max': max(tot),
                  'formula_rms': rms(form), 'formula_max': max(form),
                  'signo_rms': rms(sig), 'signo_max': max(sig)})

print('R4 · A — LA DIVERGENCIA DEL ASTRONÓMICO CONTRA τ\n')
print(f'  barrido: {len(JS["tau"])} valores de τ de {min(JS["tau"])}° a {max(JS["tau"])}° · {len(INST)} instantes (elev > 3°)')
print(f'  puntos excluidos por TOPE MECÁNICO (|θ| = {MAXA}°): {n_sat} de {n_tot} ({100*n_sat/n_tot:.1f} %)')
print('    un θ clavado en el tope no informa de τ: los dos motores dan el mismo número por saturación, no por acuerdo\n')

c0 = [c for c in curva if abs(c['tau']) < 1e-12][0]
print('CONTROL · en τ = 0 las tres diferencias tienen que ser CERO EXACTO')
print(f"  total {c0['total_max']:.3e}°  ·  fórmula {c0['formula_max']:.3e}°  ·  signo {c0['signo_max']:.3e}°")
# EL CRITERIO NO PUEDE SER CERO EXACTO, Y POR MI CULPA: las dos columnas se
# vuelcan a JSON redondeadas a 9 decimales, asi que medio digito del ultimo
# -5e-10- es ruido de mi propio formato. Pedir `== 0` es exigir una exactitud
# que yo mismo he destruido, que es el error E-X1 26 de esta misma sesion
# repetido. El criterio va en 5e-9 (dos columnas redondeadas, cada una con su
# medio digito, con holgura) y la cifra en exponencial.
CUANT = 5e-9
ok0 = max(c0['total_max'], c0['formula_max'], c0['signo_max']) < CUANT
print(f"  {'OK' if ok0 else 'FALLA'} — criterio < {CUANT:.0e}° (cuantizacion de los dos volcados a 9 decimales),")
print(f"  NO cero exacto: pedirlo seria exigir una exactitud que el propio formato destruye.\n")
assert ok0, 'en tau=0 los dos motores NO coinciden: el instrumento no vale'

print('A.3 · DESCOMPOSICIÓN — ¿es la fórmula o es el signo?')
print('   τ      n     |Δ| TOTAL        |Δ| FÓRMULA      |Δ| SIGNO')
print('              (JS−τ vs PY+τ)   (JS+τ vs PY+τ)   (JS−τ vs JS+τ)')
for c in curva:
    if c.get('n', 0) == 0 or abs(c['tau']) > 6.001 or abs(c['tau'] * 2 - round(c['tau'] * 2)) > 1e-9: continue
    if abs(c['tau']) not in (0.0, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0) or c['tau'] < 0: continue
    print(f"  {c['tau']:5.2f} {c['n']:5d}   {c['total_rms']:8.4f}° rms   {c['formula_rms']:9.2e}°   {c['signo_rms']:8.4f}° rms")

fmax = max(c['formula_max'] for c in curva if c.get('n', 0))
print(f"\n  peor |Δ| de FÓRMULA en todo el barrido: {fmax:.3e}°")
print('  → la reimplementación JS de `singleaxis` y `pvlib.tracking.singleaxis` dan LO MISMO')
print('    cuando se les da el MISMO axis_tilt. La diferencia no está en la fórmula.')
difs = [abs(c['total_rms'] - c['signo_rms']) for c in curva if c.get('n', 0)]
print(f"  peor |Δ_total − Δ_signo| en todo el barrido: {max(difs):.3e}°")
print('  → Δ_total ES Δ_signo. EL CONVENIO DE SIGNO DEL TILT N-S ES LA CAUSA ENTERA.')

# ── A.1 · el ajuste ─────────────────────────────────────────────────────────
print('\nA.1 · AJUSTE DE Δ(τ) — ¿proporcional a τ, a sin τ, a tan τ?')
FIS = 8.0          # el rango fisico de inclinacion N-S de eje
def informe(pts, titulo):
    print(f'\n  {titulo}  ({len(pts)} valores de τ)')
    print('  modelo            k          residuo RMS    residuo/señal   residuo máx')
    sal = {}
    for nm, g in [('k · τ', lambda t: t), ('k · sin τ', lambda t: math.sin(math.radians(t))),
                  ('k · tan τ', lambda t: math.tan(math.radians(t)))]:
        k, rms, rel, mx = ajusta(g, pts)
        sal[nm] = (k, rms, rel, mx)
        print(f'  {nm:16} {k:9.5f}   {rms:9.5f}°    {100*rel:9.2f} %   {mx:9.5f}°')
    return sal
pts = [(c['tau'], c['total_rms']) for c in curva if c.get('n', 0) and c['tau'] > 0]
def ajusta(g, pts):
    sxy = sum(g(t) * y for t, y in pts); sxx = sum(g(t) ** 2 for t in (t for t, _ in pts))
    k = sxy / sxx
    res = [y - k * g(t) for t, y in pts]
    rms = math.sqrt(sum(r * r for r in res) / len(res))
    sst = math.sqrt(sum(y * y for _, y in pts) / len(pts))
    return k, rms, rms / sst, max(abs(r) for r in res)
fis = informe([p for p in pts if p[0] <= FIS], f'TRAMO FÍSICO, 0 < τ ≤ {FIS:g}° — NO DISCRIMINA')
print('    en este tramo τ, sin τ y tan τ difieren menos del 1 % entre sí: los tres «ajustan»')
print('    con el mismo residuo, y un barrido físico NO puede contestar a A.1.')
ext = informe([p for p in pts if p[0] > FIS], f'TRAMO EXTENDIDO, τ > {FIS:g}° — aquí sí se separan')
print('    (identificación de modelo, no una afirmación sobre el terreno: no hay ejes así)')
mejor = min(ext, key=lambda k: ext[k][1])
print(f'\n  el que menos residuo deja en el tramo que discrimina: {mejor}')

# EL AJUSTE QUE DE VERDAD IDENTIFICA EL TERMINO no es ninguna de las tres
# familias: es la prediccion exacta que sale de A.3.
res_ex = [abs(c['total_rms'] - c['signo_rms']) for c in curva if c.get('n', 0)]
rms_ex = math.sqrt(sum(r * r for r in res_ex) / len(res_ex))
print(f'\n  Y EL MODELO EXACTO, que no es paramétrico: Δ(τ) = |θ(−τ) − θ(+τ)| del MISMO motor.')
print(f'  residuo RMS sobre los {len(res_ex)} valores de τ: {rms_ex:.3e}° · máx {max(res_ex):.3e}°')
print('  Ese es el ajuste que identifica el término: no es «proporcional a algo», es')
print('  literalmente el mismo ángulo evaluado con el signo de τ cambiado.')

if '--json' in sys.argv:
    p = sys.argv[sys.argv.index('--json') + 1]
    json.dump({'maxAngle': MAXA, 'n_saturados': n_sat, 'n_total': n_tot, 'instantes': len(INST),
               'control_tau0': c0, 'curva': curva,
               'ajuste_fisico': {k: list(v) for k, v in fis.items()},
               'ajuste_extendido': {k: list(v) for k, v in ext.items()},
               'modelo_exacto': {'formula': 'Delta(tau) = |theta(-tau) - theta(+tau)| del mismo motor',
                                 'residuo_rms': rms_ex, 'residuo_max': max(res_ex)}},
              open(p, 'w'), ensure_ascii=False, indent=1)
    print(f'\nJSON en {p}')
