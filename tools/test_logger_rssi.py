#!/usr/bin/env python3
"""
test_logger_rssi.py — el recolector de RSSI, contra un ConnectPort falso.

POR QUE EXISTE, Y POR QUE AHORA. `zigbee_logger.ps1` es el que recoge la medida
que sostiene todo lo demas —el RSSI de cada TCU— y es el UNICO de los cuatro
recolectores que nunca se ha ejecutado en ninguna prueba. El inventario y los
angulos si (test_inventario_zb.py, test_angulos_barrido.py); este no.

Eso importa ahora porque el bloque 2 va a cambiarle la cabecera del CSV: un
sello por fila, `ciclo_id` y `latencia_ms`. Cambiar a ciegas un .ps1 que corre
en el PC de una planta, sin admin y sin que nadie sepa PowerShell, es como se
rompen las campanias. Asi que primero el arnes, y luego el cambio.

LO QUE SE DEJA MEDIDO AQUI ES EL COMPORTAMIENTO DE v1, a proposito. Varias de
estas comprobaciones —sobre todo la del sello unico por ciclo— describen lo que
hoy hace y lo que el bloque 2 va a cambiar. Cuando se cambie, ESTE BANCO TIENE
QUE PONERSE ROJO: esa es la prueba de que el cambio ocurrio de verdad y no solo
en el mensaje del commit.

NO SE TOCA EL .ps1 PARA PROBARLO. Se le hace la MISMA sustitucion de CONFIG que
hace el paquete de medida al prepararlo para una planta (la de `preparaLogger`
en index.html), y se corre tal cual con pwsh.

    python3 tools/test_logger_rssi.py
    MUTA=<clave> python3 tools/test_logger_rssi.py   (mutacion: TIENE que salir rojo)
"""
import csv
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
PWSH = os.environ.get("PWSH", "pwsh")

# DE DONDE SALE EL .ps1. Por defecto, el del repo. Con PS1_DIR, el que sale del
# ZIP que se descarga en planta — que NO es el mismo fichero: el paquete le pone
# el BOM y le sustituye el CONFIG. Correr solo el del repo dejaba fuera todas
# esas transformaciones, y por ahi se colo que el BOM no llegaba a la planta.
PS1_DIR = os.environ.get("PS1_DIR") or RAIZ


def fuente(nombre):
    ruta = os.path.join(PS1_DIR, nombre)
    if not os.path.exists(ruta):
        print("no encuentro %s en %s" % (nombre, PS1_DIR))
        sys.exit(2)
    return ruta


fallos, n = [], 0


def di(ok, texto, extra=None):
    global n
    n += 1
    if not ok:
        fallos.append(texto)
    print("  %s %s%s" % ("OK   " if ok else "FALLO", texto,
                         "" if ok or extra is None else "  -> %s" % (extra,)))


# ── el ConnectPort de mentira ────────────────────────────────────────────────
# Cuatro aparatos en el censo, y el cuarto NO es un router: `type` 0 es el
# propio coordinador. El logger filtra por `type -eq "1"`, asi que no debe
# salir en el CSV; sin ese filtro se mediria el RSSI del gateway consigo mismo.
CENSO = """<rci_reply version="1.1"><do_command target="zigbee"><discover>
 <device><ext_addr>00:13:a2:00:41:5c:9e:01!</ext_addr><node_id>TCU_01</node_id>
  <net_addr>0x1a2b</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:02!</ext_addr><node_id>TCU_02</node_id>
  <net_addr>0x3c4d</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:03!</ext_addr><node_id>HSU_01</node_id>
  <net_addr>0x5e6f</net_addr><device_type>0x120000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:00!</ext_addr><node_id>COORD</node_id>
  <net_addr>0x0000</net_addr><device_type>0x100000</device_type><type>0</type></device>
</discover></do_command></rci_reply>"""

RADIO_01 = """<rci_reply version="1.1"><do_command target="zigbee"><query_state>
  <radio><rssi>61</rssi><ack_failures>3</ack_failures><supply_voltage>3280</supply_voltage>
  <temperature>41</temperature><net_addr>0x1a2b</net_addr></radio></query_state></do_command></rci_reply>"""

RADIO_03 = """<rci_reply version="1.1"><do_command target="zigbee"><query_state>
  <radio><rssi>84</rssi><ack_failures>12</ack_failures><supply_voltage>3190</supply_voltage>
  <temperature>44</temperature><net_addr>0x5e6f</net_addr></radio></query_state></do_command></rci_reply>"""

# La carga del propio Digi. La memoria va en BYTES, que es como la da el de El
# Burgo (16777216 = los 16 MB del ConnectPort), no en KB como dice su manual.
CARGA = """<rci_reply version="1.1"><query_state><device_stats>
  <cpu>37</cpu><total_memory>16777216</total_memory><used_memory>9437184</used_memory>
  <uptime>259200</uptime></device_stats></query_state></rci_reply>"""

# EL PRIMER NODO TARDA, y tiene que ser el PRIMERO. El recolector arma la fila
# —sello incluido— ANTES de preguntarle a ese nodo, asi que lo que separa los
# sellos de dos filas es lo que tarda la consulta de la fila ANTERIOR. Con la
# espera puesta en el ultimo nodo, las tres filas seguian cayendo en el mismo
# segundo de reloj y la mutacion `sello` pasaba desapercibida: lo dijo la propia
# CI en la primera ejecucion (rc=0 donde se esperaba 1).
#
# Con la espera en el primero, las filas 2 y 3 toman su sello >= 1 s despues que
# la 1: el segundo truncado avanza siempre, sin depender de donde caiga el
# instante dentro del segundo. Asi «llevan el mismo sello» se distingue de «ha
# ido tan rapido que ha coincidido», que es lo unico que hace util esa
# comprobacion — y es la que el bloque 2 tiene que poner en rojo.
RETRASO_01_S = 1.4


class GW(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8", "replace")
        m = re.search(r'addr="([^"]+)"', cuerpo)
        if "discover" in cuerpo:
            r = CENSO
        elif "device_stats" in cuerpo or ("query_state" in cuerpo and not m):
            r = CARGA
        elif m:
            addr = m.group(1)
            if addr.endswith(":01!"):
                time.sleep(RETRASO_01_S)
                r = RADIO_01
            elif addr.endswith(":03!"):
                r = RADIO_03
            else:
                r = None                       # el 02 no contesta: enlace caido
        else:
            r = None
        if r is None:
            self.send_error(500, "no response from node")
            return
        b = r.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


# ── mutaciones ───────────────────────────────────────────────────────────────
# Cada una rompe UNA cosa del recolector. Si el banco sigue verde con una puesta,
# esa comprobacion no estaba comprobando nada. La CI las corre todas y exige que
# salgan rojas.
MUTACIONES = {
    # el RSSI del Digi viene positivo (61) y se guarda negativo (-61)
    "signo":   (r"-\[int\]\$radio\.rssi", "[int]$radio.rssi"),
    # una HSU marcada como TCU: el censo del visor deja de distinguirlas
    "rol":     (r'"0x120000" \{ "HSU" \}', '"0x120000" { "TCU" }'),
    # sin el filtro de routers, el coordinador entra como si fuera un nodo medido
    "filtro":  (r'Where-Object \{ \$_\.type -eq "1" \}', "Where-Object { $true }"),
    # un nodo que no contesta saldria como si hubiera contestado
    "caido":   (r"online = 0; rssi_dbm = \$null", "online = 1; rssi_dbm = $null"),
    # la carga del gateway deja de guardarse aunque se haya leido
    "carga":   (r"\$fila\.cpu_pct = \$c\.cpu", "$fila.cpu_pct = $null"),
    # UN SELLO POR FILA en vez de uno por ciclo. Es justo lo que el bloque 2 va a
    # hacer a proposito: hoy tiene que salir rojo, y cuando se haga, esta
    # comprobacion es la que hay que dar la vuelta.
    "sello":   (r"timestamp = \$stamp; gateway = \$gw\.Name; node_id",
                'timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"); gateway = $gw.Name; node_id'),
}
MUTA = os.environ.get("MUTA")
if MUTA and MUTA not in MUTACIONES:
    print("mutacion desconocida. Hay: " + ", ".join(MUTACIONES))
    sys.exit(2)

if shutil.which(PWSH) is None:
    print("No hay pwsh (%s): esta prueba corre el .ps1 de verdad y lo necesita." % PWSH)
    print("  PWSH=/ruta/a/pwsh python3 tools/test_logger_rssi.py")
    sys.exit(2)

srv = HTTPServer(("127.0.0.1", 0), GW)
threading.Thread(target=srv.serve_forever, daemon=True).start()
puerto = srv.server_address[1]

tmp = tempfile.mkdtemp()
txt = open(fuente("zigbee_logger.ps1"), encoding="utf-8").read()
# LA MISMA sustitucion que hace el paquete de medida (preparaLogger, index.html).
# Si esta expresion deja de casar, el paquete tampoco prepara el recolector.
txt, cuantas = re.subn(r"\$Gateways = @\([\s\S]*?\n\)",
                       '$Gateways = @(\n  @{ Name = "GW-01"; Host = "127.0.0.1:%d"; User = ""; Pass = "" }\n)' % puerto,
                       txt, count=1)
if cuantas != 1:
    print("la sustitucion de $Gateways no caso: el paquete de medida tampoco funcionaria")
    sys.exit(2)

if MUTA:
    pat, rep = MUTACIONES[MUTA]
    txt, c = re.subn(pat, rep.replace("\\", "\\\\"), txt, count=1)
    if c != 1:
        print("la mutacion «%s» no caso con el codigo (¿cambio el .ps1?)" % MUTA)
        sys.exit(2)
    print("### MUTACION «%s» PUESTA: este banco TIENE que salir rojo\n" % MUTA)

ruta = os.path.join(tmp, "zigbee_logger.ps1")
open(ruta, "w", encoding="utf-8").write(txt)
csvp = os.path.join(tmp, "zigbee_log.csv")
gwp = os.path.join(tmp, "gateway_stats.csv")


def filas_de(p):
    if not os.path.exists(p):
        return []
    try:
        return list(csv.DictReader(open(p, encoding="utf-8-sig")))
    except Exception:
        return []


# ── se corre el recolector de verdad, UN ciclo ───────────────────────────────
# El logger es un bucle infinito (`while ($true)` + Start-Sleep $IntervalSec):
# no termina solo. No se le toca el bucle para probarlo —eso seria probar otro
# programa—: se le deja hacer un ciclo y se le corta durante la espera, que es
# cuando no tiene nada a medias. Export-Csv cierra el fichero en cada llamada,
# asi que lo escrito esta escrito.
print("\n· se corre el recolector de verdad contra un ConnectPort de mentira")
salida_p = os.path.join(tmp, "salida.txt")
with open(salida_p, "wb") as fsal:
    p = subprocess.Popen([PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ruta],
                         stdout=fsal, stderr=subprocess.STDOUT, cwd=tmp)
    limite = time.time() + 90
    while time.time() < limite:
        if p.poll() is not None:
            break                                   # se murio solo: es un fallo, y se vera
        if len(filas_de(csvp)) >= 3 and len(filas_de(gwp)) >= 1:
            time.sleep(0.4)                         # que acabe de volcar la fila del gateway
            break
        time.sleep(0.2)
    if p.poll() is None:
        p.terminate()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait(timeout=10)
salida = open(salida_p, encoding="utf-8", errors="replace").read()

filas = filas_de(csvp)
di(os.path.exists(csvp), "escribe zigbee_log.csv", salida[-400:])
di("inventario 3 nodos" in salida, "el censo son los 3 routers, no los 4 aparatos",
   [l for l in salida.splitlines() if "inventario" in l])
di(len(filas) == 3, "una fila por nodo del censo, incluido el que no contesta", len(filas))

print("\n· la medida, tal cual la deja el recolector")
por_id = {f.get("node_id"): f for f in filas}
di(sorted(por_id) == ["HSU_01", "TCU_01", "TCU_02"], "los tres nodos, y solo esos", sorted(por_id))
di(por_id.get("TCU_01", {}).get("rssi_dbm") == "-61",
   "el RSSI se guarda NEGATIVO: el Digi da 61 y en el CSV va -61",
   por_id.get("TCU_01", {}).get("rssi_dbm"))
di(por_id.get("HSU_01", {}).get("rssi_dbm") == "-84", "y el del otro nodo igual (84 -> -84)",
   por_id.get("HSU_01", {}).get("rssi_dbm"))
di(por_id.get("TCU_01", {}).get("ack_failures") == "3", "los fallos de ACK",
   por_id.get("TCU_01", {}).get("ack_failures"))
di(por_id.get("TCU_01", {}).get("supply_mv") == "3280", "la tension en mV",
   por_id.get("TCU_01", {}).get("supply_mv"))
di(por_id.get("TCU_01", {}).get("temp_c") == "41", "la temperatura",
   por_id.get("TCU_01", {}).get("temp_c"))

print("\n· la direccion de 64 bits, que es la clave del contrato v2")
dirs = sorted(f.get("ext_addr") or "" for f in filas)
di(all(d.count(":") == 7 and d.endswith("!") for d in dirs),
   "sus ocho bytes y su '!', sin recortar", dirs)
di(por_id.get("TCU_01", {}).get("ext_addr") == "00:13:a2:00:41:5c:9e:01!",
   "y la del primero, tal cual la da el gateway", por_id.get("TCU_01", {}).get("ext_addr"))

print("\n· el papel de cada nodo sale del device_type, no del nombre")
di(por_id.get("TCU_01", {}).get("role") == "TCU", "0x170000 -> TCU", por_id.get("TCU_01", {}).get("role"))
di(por_id.get("HSU_01", {}).get("role") == "HSU", "0x120000 -> HSU", por_id.get("HSU_01", {}).get("role"))

print("\n· un nodo que no contesta es un DATO, no un hueco")
c = por_id.get("TCU_02", {})
di(c.get("online") == "0", "sale con online = 0", c.get("online"))
di((c.get("rssi_dbm") or "") == "", "y sin RSSI: vacio, no un cero que parezca una medida",
   c.get("rssi_dbm"))
di(por_id.get("TCU_01", {}).get("online") == "1", "y el que si contesta va marcado como tal")

print("\n· la carga del propio gateway, en su CSV aparte")
gfilas = filas_de(gwp)
di(len(gfilas) == 1, "una fila por ciclo", len(gfilas))
g = gfilas[0] if gfilas else {}
di(g.get("ok") == "1", "reconoce lo que contesta el Digi", g.get("ok"))
di(g.get("cpu_pct") == "37", "la CPU en %", g.get("cpu_pct"))
di(g.get("mem_total_b") == "16777216", "la memoria total en BYTES, como la da el Digi",
   g.get("mem_total_b"))
di(g.get("uptime_s") == "259200", "y el tiempo en marcha", g.get("uptime_s"))
di("CPU 37 %" in salida and "3 d 0 h en marcha" in salida,
   "y se le dice al que esta delante, en una linea",
   [l for l in salida.splitlines() if "CPU" in l][-1:])

print("\n· EL SELLO ES DEL CICLO, no de la fila  (esto lo cambia el bloque 2)")
sellos = sorted(set(f.get("timestamp") for f in filas))
di(len(sellos) == 1,
   "las tres filas llevan el MISMO sello, aunque el primer nodo tardase 1,4 s y las"
   " otras dos se midan despues", sellos)
di(len(sellos) == 1 and sellos[0] == (gfilas[0].get("timestamp") if gfilas else None),
   "y la fila del gateway lleva ese mismo sello",
   (sellos[:1], gfilas[0].get("timestamp") if gfilas else None))
di(bool(re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", sellos[0] if sellos else "")),
   "en hora LOCAL sin zona, que es el v1 que el contrato manda sustituir", sellos[:1])

srv.shutdown()
print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
if MUTA:
    print("### %s: la mutacion «%s» %s" % (("bien" if fallos else "MAL"), MUTA,
          "sale roja" if fallos else "pasa desapercibida"))
sys.exit(1 if fallos else 0)
