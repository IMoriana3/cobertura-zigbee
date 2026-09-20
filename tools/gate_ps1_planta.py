#!/usr/bin/env python3
"""
gate_ps1_planta.py — lo que rompe un .ps1 en el PC de una planta.

Los recolectores corren en Windows PowerShell 5.1, sin instalar nada y sin
admin. Las dos reglas de aquí salen de fallos REALES, encontrados por el job de
Windows la primera vez que alguien ejecutó esos ficheros en la versión en la que
van a correr. Las dos fallaban SOLO en 5.1: bajo `pwsh` 7 todo salía verde.

REGLA 1 — un .ps1 con caracteres no ASCII TIENE que llevar BOM.

  5.1 lee un .ps1 SIN BOM como ANSI (Windows-1252), no como UTF-8. La raya «—»
  son los bytes E2 80 94, y el 94 en Windows-1252 es «”», la comilla tipográfica
  de cierre, que PowerShell acepta como delimitador de cadena. O sea que una
  raya DENTRO de una cadena cierra la cadena antes de tiempo y el fichero deja
  de compilar.

  `zigbee_inventario.ps1` estaba así y NO ARRANCABA:

      zigbee_inventario.ps1:162 char:87
      The string is missing the terminator: ".

  El error salía en la línea 162 y el problema estaba en la 83, que es lo que
  hacía imposible verlo leyendo el fichero.

REGLA 2 — `Invoke-WebRequest` TIENE que llevar `-UseBasicParsing`.

  Sin él, 5.1 parsea la respuesta con el MOTOR DE INTERNET EXPLORER. En una
  máquina sin IE —Windows 11 ya no lo trae— eso revienta con «Object reference
  not set to an instance of an object».

  Y lo grave es cómo falla: en `zigbee_inventario.ps1` esa llamada estaba dentro
  del mismo `try` que la consulta al nodo, así que la excepción se llevaba por
  delante también esa y CADA NODO salía con `estado_ok = 0`. La planta entera
  aparecía como nodos que no contestan: un fallo del programa disfrazado de
  problema de radio.

  En PowerShell 7 el parámetro se acepta y se ignora, así que ponerlo vale para
  las dos versiones.

Corre en cualquier sitio: no necesita PowerShell, así que el aviso llega en
segundos y sin esperar al runner de Windows.

    python3 tools/gate_ps1_planta.py            el repo
    python3 tools/gate_ps1_planta.py <carpeta>  otra carpeta (así se prueba en rojo)
"""
import os
import re
import sys

BOM = b"\xef\xbb\xbf"
# En Windows-1252 estos bytes son comillas tipograficas, y PowerShell las acepta
# como delimitador: son las que rompen el parseo al caer dentro de una cadena.
COMILLAS = "‘’“”"

raiz = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
quejas, vistos = [], 0

for nombre in sorted(f for f in os.listdir(raiz) if f.lower().endswith(".ps1")):
    crudo = open(os.path.join(raiz, nombre), "rb").read()
    vistos += 1

    # ── regla 1: BOM ─────────────────────────────────────────────────────────
    if crudo[:3] != BOM and any(b > 127 for b in crudo):
        rompe = sum(1 for c in crudo.decode("cp1252", "replace") if c in COMILLAS)
        extra = ("  ← y PowerShell 5.1 vería %d comillas tipográficas donde no las hay: si "
                 "alguna cae dentro de una cadena, el fichero NO COMPILA" % rompe) if rompe else ""
        quejas.append("%s: trae no-ASCII y NO lleva BOM.%s" % (nombre, extra))

    # ── regla 2: UseBasicParsing ─────────────────────────────────────────────
    # Heuristica, y se dice: si la llamada va con parametros pegados (`-Uri ...`)
    # se mira la propia linea; si va con splat (`@p`), se mira el fichero entero,
    # porque el hash puede armarse varias lineas antes. Para lo que hay en este
    # repo basta, y un falso verde aqui lo caza el job de Windows.
    texto = crudo.decode("utf-8-sig", "replace")
    # LOS COMENTARIOS FUERA, y no es un detalle: la primera version de esta
    # puerta se senalaba a SI MISMA — el comentario que explica por que hace
    # falta -UseBasicParsing nombra `Invoke-WebRequest`, y la puerta lo conto
    # como una llamada. Se borran los bloques <# #> y las lineas que empiezan
    # por #, dejando las lineas en blanco para no mover la numeracion.
    sin_com = re.sub(r"<#.*?#>", lambda m: "\n" * m.group(0).count("\n"), texto, flags=re.S)
    lineas = ["" if l.lstrip().startswith("#") else l for l in sin_com.splitlines()]
    # y el splat se busca TAMBIEN sin comentarios. Con el texto entero, un
    # fichero cuyo comentario nombrase UseBasicParsing pasaba aunque el codigo
    # no lo pusiera: se vio probando la puerta en rojo, que para eso se prueba.
    codigo = "\n".join(lineas)
    for i, linea in enumerate(lineas, 1):
        if "Invoke-WebRequest" not in linea:
            continue
        if "UseBasicParsing" in linea:
            continue
        if re.search(r"@\w+", linea) and "UseBasicParsing" in codigo:
            continue
        quejas.append("%s:%d: Invoke-WebRequest sin -UseBasicParsing. En PowerShell 5.1 "
                      "parsearía la respuesta con el motor de Internet Explorer, y sin IE "
                      "revienta con «Object reference not set to an instance of an object»."
                      % (nombre, i))

print("%d ficheros .ps1 en %s" % (vistos, raiz))
if not quejas:
    print("ninguno se rompería en el PC de una planta por estas dos causas")
    sys.exit(0)

print("\nESTO SE ROMPE EN WINDOWS PowerShell 5.1:")
for q in quejas:
    print("  " + q)
print("\nLas dos causas están explicadas en la cabecera de este fichero.")
sys.exit(1)
