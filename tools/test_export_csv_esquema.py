#!/usr/bin/env python3
"""
test_export_csv_esquema.py — qué hace ESTA versión de PowerShell al añadir filas
con otra cabecera, y con qué codificación escribe.

POR QUE EXISTE. La regla de rotación del contrato —comprobar la cabecera al
arrancar y renombrar el CSV viejo a `<nombre>.v1.<AAAAMMDDTHHMMSSZ>.csv`— existe
porque `Export-Csv -Append` RECHAZA filas cuyas columnas no cuadren con el
fichero que ya existe. Eso estaba ESCRITO en el contrato y en el comentario del
propio logger, pero no MEDIDO. Y medirlo solo vale si se mide donde corre: en
planta es Windows PowerShell 5.1, no pwsh 7.

ESTE BANCO NO PRUEBA CODIGO DEL REPO. Es una SONDA del entorno: mide qué hace el
PowerShell que tenga delante con las tres cosas de las que depende el bloque 2.
Por eso el .ps1 que corre se escribe aquí y no viaja a ninguna planta.

LO QUE MIDE

  A. `-Append` con una columna de mas  ->  ¿da error?
  B. `-Append -Force` con una de mas   ->  ¿la escribe, o se la come en silencio?
  C. `-Encoding UTF8`                  ->  ¿lleva BOM el fichero?

Lo de B es lo que hace que esto importe. Si `-Force` escribiera la fila
DESCARTANDO la columna nueva y sin decir nada, «arreglar» el rechazo con -Force
perdería el dato del bloque 2 sin un solo error en pantalla — y por eso la regla
es rotar el fichero, no forzar la escritura.

LA TABLA DE ABAJO SE MIDE, NO SE SUPONE. Una version de PowerShell que no este
en ella no se da por buena ni por mala: el banco sale con rc=2 y ensena lo
observado para que se anada. Un «pues sera como la 7» es justo lo que este banco
existe para no hacer.

    python3 tools/test_export_csv_esquema.py
    PWSH=powershell python3 tools/test_export_csv_esquema.py   (Windows PS 5.1)
"""
import csv
import os
import shutil
import subprocess
import sys
import tempfile

PWSH = os.environ.get("PWSH", "pwsh")
fallos, n = [], 0


def di(ok, texto, extra=None):
    global n
    n += 1
    if not ok:
        fallos.append(texto)
    print("  %s %s%s" % ("OK   " if ok else "FALLO", texto,
                         "" if ok or extra is None else "  -> %s" % (extra,)))


# ── lo esperado por version mayor de PowerShell ──────────────────────────────
# append_falla   : `-Append` con columnas que no cuadran lanza error
# forzado_falla  : lo mismo con `-Force`
# forzado_escribe: con `-Force`, la fila acaba en el fichero
# bom            : `-Encoding UTF8` deja BOM al crear el fichero
ESPERADO = {
    5: {"append_falla": True, "forzado_falla": False, "forzado_escribe": True, "bom": True},
    7: {"append_falla": True, "forzado_falla": False, "forzado_escribe": True, "bom": False},
}

SONDA = r"""
param([string]$Dir)
$ErrorActionPreference = 'Continue'
$inf = New-Object System.Collections.Generic.List[string]
$inf.Add("version=" + $PSVersionTable.PSVersion.ToString())

function Prueba([string]$nombre, [bool]$forzar) {
  $ruta = Join-Path $Dir "$nombre.csv"
  $v1 = [pscustomobject][ordered]@{ timestamp='2026-01-01 00:00:00'; node_id='TCU_01'; rssi_dbm=-61 }
  $v1 | Export-Csv -Path $ruta -NoTypeInformation -Encoding UTF8
  # la fila del bloque 2: la misma mas ciclo_id y latencia_ms
  $v2 = [pscustomobject][ordered]@{ timestamp='2026-01-01T00:00:10Z'; node_id='TCU_02'; rssi_dbm=-62
                                    ciclo_id=7; latencia_ms=143 }
  $err = ''
  try {
    if ($forzar) { $v2 | Export-Csv -Path $ruta -Append -Force -NoTypeInformation -Encoding UTF8 -ErrorAction Stop }
    else         { $v2 | Export-Csv -Path $ruta -Append        -NoTypeInformation -Encoding UTF8 -ErrorAction Stop }
  } catch { $err = ($_.Exception.Message -replace "`r?`n", ' ') }
  $inf.Add("$nombre.error=" + $err)
}

Prueba 'simple'  $false
Prueba 'forzado' $true

# la cabecera que ve PowerShell al releer el fichero: si el BOM se pegara al
# nombre de la primera columna, Import-Csv devolveria una clave con basura
$col = (Import-Csv (Join-Path $Dir 'simple.csv') | Select-Object -First 1).PSObject.Properties.Name
$inf.Add("simple.columnas_ps=" + ($col -join '|'))

# ASCII a proposito: el informe no puede depender de la codificacion que este
# banco esta midiendo, ni de la pagina de codigos de la consola
Set-Content -Path (Join-Path $Dir 'informe.txt') -Value $inf -Encoding ASCII
"""

if shutil.which(PWSH) is None:
    print("No hay pwsh (%s): esta sonda ejecuta PowerShell y lo necesita." % PWSH)
    print("  PWSH=/ruta/a/pwsh python3 tools/test_export_csv_esquema.py")
    sys.exit(2)

tmp = tempfile.mkdtemp()
sonda = os.path.join(tmp, "sonda.ps1")
open(sonda, "w", encoding="utf-8").write(SONDA)

print("\n· se le pregunta a PowerShell, no a la documentación")
p = subprocess.run([PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", sonda, tmp],
                   capture_output=True, text=True, errors="replace", timeout=180)
inf_p = os.path.join(tmp, "informe.txt")
if not os.path.exists(inf_p):
    print("la sonda no dejó informe. Salida:\n" + (p.stdout + p.stderr)[-1500:])
    sys.exit(1)
inf = {}
for linea in open(inf_p, encoding="ascii", errors="replace").read().splitlines():
    if "=" in linea:
        k, v = linea.split("=", 1)
        inf[k.strip()] = v.strip()

version = inf.get("version", "?")
mayor = int(version.split(".")[0]) if version[:1].isdigit() else 0
print("  PowerShell %s  (mayor %d)" % (version, mayor))

bytes_simple = open(os.path.join(tmp, "simple.csv"), "rb").read()
bytes_forz = open(os.path.join(tmp, "forzado.csv"), "rb").read()
obs = {
    "append_falla": inf.get("simple.error", "") != "",
    "forzado_falla": inf.get("forzado.error", "") != "",
    "forzado_escribe": len([l for l in bytes_forz.decode("utf-8-sig", "replace").splitlines() if l.strip()]) > 2,
    "bom": bytes_simple[:3] == b"\xef\xbb\xbf",
}
print("  observado: " + ", ".join("%s=%s" % (k, obs[k]) for k in sorted(obs)))
if inf.get("simple.error"):
    print("  el error de -Append: " + inf["simple.error"][:160])

# ── lo que vale en CUALQUIER version: los invariantes de los que depende la regla
print("\n· la cabecera de un fichero ya empezado NO cambia, pase lo que pase")
for nombre, crudo in (("simple", bytes_simple), ("forzado", bytes_forz)):
    cab = crudo.decode("utf-8-sig", "replace").splitlines()[0].strip()
    di(cab == '"timestamp","node_id","rssi_dbm"',
       "%s.csv conserva la cabecera de v1" % nombre, cab)
    di("ciclo_id" not in cab and "latencia_ms" not in cab,
       "%s.csv no ha ganado las columnas nuevas" % nombre, cab)

print("\n· y el visor lo sigue leyendo, lleve BOM o no")
filas = list(csv.DictReader(open(os.path.join(tmp, "simple.csv"), encoding="utf-8-sig")))
di(bool(filas) and list(filas[0])[0] == "timestamp",
   "la primera columna se llama «timestamp», sin el BOM pegado delante",
   list(filas[0]) if filas else None)
di(inf.get("simple.columnas_ps", "").split("|")[:1] == ["timestamp"],
   "y lo mismo desde PowerShell, con Import-Csv", inf.get("simple.columnas_ps"))

# ── lo que depende de la version: se compara con la tabla medida ─────────────
print("\n· lo propio de esta versión")
if mayor not in ESPERADO:
    print("\nPowerShell %s no está en la tabla de este banco." % version)
    print("Observado: " + ", ".join("%s=%s" % (k, obs[k]) for k in sorted(obs)))
    print("Añádelo a ESPERADO en tools/test_export_csv_esquema.py con estos valores,")
    print("después de mirar si son los que esa versión debería dar.")
    sys.exit(2)
esp = ESPERADO[mayor]
di(obs["append_falla"] == esp["append_falla"],
   "«-Append» con una columna de más %s" % ("falla" if esp["append_falla"] else "pasa"),
   obs["append_falla"])
di(obs["forzado_falla"] == esp["forzado_falla"],
   "«-Append -Force» %s" % ("falla" if esp["forzado_falla"] else "no falla"),
   obs["forzado_falla"])
di(obs["forzado_escribe"] == esp["forzado_escribe"],
   "y con «-Force» la fila %s" % ("SÍ se escribe — con la columna nueva perdida en silencio"
                                  if esp["forzado_escribe"] else "no se escribe"),
   obs["forzado_escribe"])
di(obs["bom"] == esp["bom"],
   "«-Encoding UTF8» escribe %s BOM en esta versión" % ("CON" if esp["bom"] else "SIN"),
   obs["bom"])

print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
sys.exit(1 if fallos else 0)
