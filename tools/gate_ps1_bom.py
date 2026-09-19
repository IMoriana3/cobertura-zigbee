#!/usr/bin/env python3
"""
gate_ps1_bom.py — un .ps1 con caracteres no ASCII TIENE que llevar BOM.

POR QUE, Y NO ES UN CAPRICHO DE ESTILO. Windows PowerShell 5.1 —la version que
hay en el PC de la planta, donde no se instala nada ni hay admin— lee un .ps1
SIN BOM como ANSI (Windows-1252), no como UTF-8. Un caracter UTF-8 de varios
bytes se le convierte en varios caracteres, y ahi esta la trampa: la raya «—»
son los bytes E2 80 94, y el 94 en Windows-1252 es «”», la comilla tipografica
de cierre. PowerShell la acepta como delimitador de cadena.

O sea que una raya DENTRO DE UNA CADENA cierra la cadena antes de tiempo y el
fichero deja de compilar. No es teoria: `zigbee_inventario.ps1` estaba asi y
NO ARRANCABA en 5.1. Lo dijo la primera ejecucion del job de Windows:

    zigbee_inventario.ps1:162 char:87
    The string is missing the terminator: ".
    ParserError ... MissingEndParenthesisInMethodCall

El error sale en la linea 162 y el problema estaba en la 83, que es lo que hace
que esto sea tan dificil de ver leyendo el fichero.

Con BOM, 5.1 lo lee como UTF-8 y desaparece la clase entera de fallo — el de
parseo y el mojibake de lo que se imprime. Esta puerta lo exige, para que no
vuelva a colarse un fichero sin el.

Corre en cualquier sitio: no necesita PowerShell.

    python3 tools/gate_ps1_bom.py            el repo
    python3 tools/gate_ps1_bom.py <carpeta>  otra carpeta (asi se prueba en rojo)
"""
import os
import sys

BOM = b"\xef\xbb\xbf"
# En Windows-1252 estos bytes son comillas tipograficas, y PowerShell las acepta
# como delimitador: son las que rompen el parseo cuando caen dentro de una cadena.
COMILLAS = {0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”"}

raiz = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
malos, vistos = [], 0

for nombre in sorted(f for f in os.listdir(raiz) if f.lower().endswith(".ps1")):
    crudo = open(os.path.join(raiz, nombre), "rb").read()
    vistos += 1
    if crudo[:3] == BOM:
        continue
    if not any(b > 127 for b in crudo):
        continue                                   # ASCII puro: el BOM da igual
    # se dice TAMBIEN si ademas rompe el parseo, que es lo grave
    mal51 = crudo.decode("cp1252", "replace")
    rompe = [c for c in mal51 if c in COMILLAS.values()]
    malos.append((nombre, len(rompe)))

print("%d ficheros .ps1 en %s" % (vistos, raiz))
if not malos:
    print("todos los que traen no-ASCII llevan BOM: PowerShell 5.1 los leerá como UTF-8")
    sys.exit(0)

print("\nESTOS .ps1 TRAEN NO-ASCII Y NO LLEVAN BOM:")
for nombre, rompe in malos:
    extra = ("  ← y además PowerShell 5.1 vería %d comillas tipográficas donde no las hay: "
             "si alguna cae dentro de una cadena, el fichero NO COMPILA" % rompe) if rompe else ""
    print("  %s%s" % (nombre, extra))
print("\nWindows PowerShell 5.1 los leería como Windows-1252. Ponles el BOM (EF BB BF)")
print("al principio, que es lo que ya hacen los demás.")
sys.exit(1)
