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


# ── lo MEDIDO por version mayor de PowerShell ────────────────────────────────
# append_falla   : `-Append` con columnas que no cuadran lanza error
# append_escribe : ...y aun asi, ¿acaba la fila en el fichero?
# forzado_falla  : lo mismo con `-Force`
# forzado_escribe: con `-Force`, la fila acaba en el fichero
# bom            : `-Encoding UTF8` deja BOM al crear el fichero
#
# `None` = SIN MEDIR. No se exige, se mide y se ensena, y de ahi sale el valor
# que se escribe aqui. Esto no es prudencia de mas: la primera version de esta
# tabla decia que en PowerShell 7 `-Append` con una columna de mas FALLA, porque
# es lo que dice la documentacion de 5.1 y lo di por bueno para las dos. La
# primera ejecucion (run 35472054575, PowerShell 7.6.5) lo desmintio: NO falla.
# Asi que lo que no se haya medido se queda en None hasta que se mida.
DESCONOCIDO = None
ESPERADO = {
    # Windows PowerShell 5.1, medido en los runs 35474112229 y 35475714525
    5: {"append_falla": False, "append_escribe": True, "forzado_falla": False,
        "forzado_escribe": True, "bom": True,
        "menos_falla": True, "menos_escribe": False,
        "otras_falla": True, "otras_escribe": False},
    # PowerShell 7.6.5, medido en los runs 35472054575 y 35475714525
    7: {"append_falla": False, "append_escribe": True, "forzado_falla": False,
        "forzado_escribe": True, "bom": False,
        "menos_falla": True, "menos_escribe": False,
        "otras_falla": True, "otras_escribe": False},
}
# LAS DOS VERSIONES COINCIDEN EN TODO MENOS EN EL BOM. Y lo que coinciden no es
# «rechaza cuando las columnas no cuadran», que es lo que decia el contrato:
#
#   columnas de MAS  -> NO falla, escribe la fila, y se come las nuevas callando
#   columnas de MENOS-> FALLA y no escribe
#   columnas OTRAS   -> FALLA y no escribe
#
# O sea que rechaza en dos de los tres casos, y NO en el unico que le importa al
# bloque 2, que es anadir columnas. De ahi que rotar el fichero no sea una
# precaucion sino la unica forma de no perder ciclo_id y latencia_ms.

SONDA = r"""
param([string]$Dir)
$ErrorActionPreference = 'Continue'
$inf = New-Object System.Collections.Generic.List[string]
$inf.Add("version=" + $PSVersionTable.PSVersion.ToString())

# la fila de v1 (3 columnas) y la del bloque 2 (las mismas mas dos)
function FilaV1 { [pscustomobject][ordered]@{ timestamp='2026-01-01 00:00:00'; node_id='TCU_01'; rssi_dbm=-61 } }
function FilaV2 { [pscustomobject][ordered]@{ timestamp='2026-01-01T00:00:10Z'; node_id='TCU_02'; rssi_dbm=-62
                                              ciclo_id=7; latencia_ms=143 } }
# y una con el MISMO numero de columnas pero otros nombres
function FilaOtras { [pscustomobject][ordered]@{ sello='2026-01-01T00:00:10Z'; nodo='TCU_02'; senal=-62 } }

function Prueba([string]$nombre, [bool]$forzar, $base, $anadida) {
  $ruta = Join-Path $Dir "$nombre.csv"
  $base | Export-Csv -Path $ruta -NoTypeInformation -Encoding UTF8
  $err = ''
  try {
    if ($forzar) { $anadida | Export-Csv -Path $ruta -Append -Force -NoTypeInformation -Encoding UTF8 -ErrorAction Stop }
    else         { $anadida | Export-Csv -Path $ruta -Append        -NoTypeInformation -Encoding UTF8 -ErrorAction Stop }
  } catch { $err = ($_.Exception.Message -replace "`r?`n", ' ') }
  $inf.Add("$nombre.error=" + $err)
}

# el caso del bloque 2: al fichero de v1 se le anade una fila con DOS columnas de mas
Prueba 'simple'  $false (FilaV1) (FilaV2)
Prueba 'forzado' $true  (FilaV1) (FilaV2)
# el caso contrario, que es el que se daria si un recolector VIEJO escribiera sobre
# un fichero ya rotado a v2: una fila con dos columnas de MENOS
Prueba 'menos'   $false (FilaV2) (FilaV1)
# y columnas renombradas, mismo numero: ni sobran ni faltan, pero no son las mismas
Prueba 'otras'   $false (FilaV1) (FilaOtras)

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

CRUDO = {n: open(os.path.join(tmp, n + ".csv"), "rb").read()
         for n in ("simple", "forzado", "menos", "otras")}


def hay_dos_filas(crudo):
    """cabecera + 2 filas de datos = la segunda se escribio"""
    return len([l for l in crudo.decode("utf-8-sig", "replace").splitlines() if l.strip()]) > 2


obs = {
    "append_falla": inf.get("simple.error", "") != "",
    "append_escribe": hay_dos_filas(CRUDO["simple"]),
    "forzado_falla": inf.get("forzado.error", "") != "",
    "forzado_escribe": hay_dos_filas(CRUDO["forzado"]),
    "menos_falla": inf.get("menos.error", "") != "",
    "menos_escribe": hay_dos_filas(CRUDO["menos"]),
    "otras_falla": inf.get("otras.error", "") != "",
    "otras_escribe": hay_dos_filas(CRUDO["otras"]),
    "bom": CRUDO["simple"][:3] == b"\xef\xbb\xbf",
}
bytes_simple = CRUDO["simple"]
print("  observado: " + ", ".join("%s=%s" % (k, obs[k]) for k in sorted(obs)))
if inf.get("simple.error"):
    print("  el error de -Append: " + inf["simple.error"][:160])
# EL CASO FEO, y por eso se dice aparte: ni error ni columna. La fila entra y el
# dato nuevo se pierde sin que nadie se entere — que es peor que un error.
if not obs["append_falla"] and obs["append_escribe"]:
    print("  OJO: «-Append» NI falla NI guarda la columna nueva. La fila entra y el dato")
    print("       se pierde EN SILENCIO. La rotación del CSV no es opcional en esta versión.")

# ── lo que vale en CUALQUIER version: los invariantes de los que depende la regla
print("\n· la cabecera de un fichero ya empezado NO cambia, pase lo que pase")
CAB_V1 = '"timestamp","node_id","rssi_dbm"'
CAB_V2 = '"timestamp","node_id","rssi_dbm","ciclo_id","latencia_ms"'
for nombre, esperada in (("simple", CAB_V1), ("forzado", CAB_V1),
                         ("menos", CAB_V2), ("otras", CAB_V1)):
    cab = CRUDO[nombre].decode("utf-8-sig", "replace").splitlines()[0].strip()
    di(cab == esperada, "%s.csv conserva la cabecera con la que nació" % nombre, cab)
# y la de v1 no gana columnas por mucho que se le empuje una fila que las trae
for nombre in ("simple", "forzado"):
    cab = CRUDO[nombre].decode("utf-8-sig", "replace").splitlines()[0].strip()
    di("ciclo_id" not in cab and "latencia_ms" not in cab,
       "%s.csv no ha ganado las columnas nuevas" % nombre, cab)
# ni la de v2 gana las de otro nombre
cab_otras = CRUDO["otras"].decode("utf-8-sig", "replace").splitlines()[0].strip()
di("sello" not in cab_otras and "senal" not in cab_otras,
   "otras.csv no ha ganado las columnas renombradas", cab_otras)

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
COMO = {
    "append_falla": ("«-Append» con una columna de más FALLA",
                     "«-Append» con una columna de más NO falla"),
    "append_escribe": ("«-Append» escribe la fila igual",
                       "«-Append» no escribe la fila"),
    "forzado_falla": ("«-Append -Force» falla", "«-Append -Force» no falla"),
    "forzado_escribe": ("con «-Force» la fila SÍ se escribe — y la columna nueva se pierde callando",
                        "con «-Force» la fila no se escribe"),
    "menos_falla": ("una fila con columnas de MENOS falla", "una fila con columnas de MENOS no falla"),
    "menos_escribe": ("y aun asi se escribe", "y no se escribe"),
    "otras_falla": ("una fila con las columnas RENOMBRADAS falla",
                    "una fila con las columnas RENOMBRADAS no falla"),
    "otras_escribe": ("y aun asi se escribe", "y no se escribe"),
    "bom": ("«-Encoding UTF8» escribe CON BOM", "«-Encoding UTF8» escribe SIN BOM"),
}
sin_medir = []
for clave in ("append_falla", "append_escribe", "forzado_falla", "forzado_escribe",
              "menos_falla", "menos_escribe", "otras_falla", "otras_escribe", "bom"):
    if esp[clave] is None:
        sin_medir.append("%s=%s" % (clave, obs[clave]))
        continue
    di(obs[clave] == esp[clave], COMO[clave][0 if esp[clave] else 1], obs[clave])

if sin_medir:
    # NO es un fallo y NO es un verde: es lo que hay que ir a escribir en la
    # tabla. Se dice fuerte para que no se quede ahi para siempre.
    print("\n  SIN MEDIR todavía en PowerShell %d — llévalo a ESPERADO[%d]:" % (mayor, mayor))
    for s in sin_medir:
        print("      " + s)

print("\n%d comprobaciones, %d fallos%s"
      % (n, len(fallos), ", %d sin medir" % len(sin_medir) if sin_medir else ""))
sys.exit(1 if fallos else 0)
