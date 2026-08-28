#!/usr/bin/env python3
"""
test_inventario_zb.py — el recolector de INVENTARIO, contra un ConnectPort falso.

POR QUE EXISTE. Un .ps1 que se copia en el PC de la planta y falla alli no lo
arregla nadie: el que esta delante no sabe PowerShell y el gateway no esta aqui.
Asi que se levanta un ConnectPort de mentira que contesta RCI y se corre el
script DE VERDAD contra el, con pwsh.

LO QUE DE VERDAD SE COMPRUEBA, que es lo que se puede perder sin enterarse:

  · que el NUMERO DE SERIE de cada modulo (su direccion de 64 bits, la de la
    etiqueta) sale entero y sin recortar;
  · que NO se pierde un campo que solo trae UN nodo. Export-Csv coge las
    columnas del primer objeto: si el nodo 3 contesta algo que el 1 no traia
    —justo el caso interesante, un firmware distinto— se caia en silencio;
  · que un nodo que no contesta sale igual, con `ok = 0` y el motivo, en vez de
    desaparecer del censo;
  · y que el volcado en bruto se escribe, que es de donde saldra saber que mas
    sabe decir ese gateway.

    python3 tools/test_inventario_zb.py
"""
import csv
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
PWSH = os.environ.get("PWSH", "pwsh")

fallos, n = [], 0


def di(ok, texto, extra=None):
    global n
    n += 1
    if not ok:
        fallos.append(texto)
    print("  %s %s%s" % ("OK   " if ok else "FALLO", texto,
                         "" if ok or extra is None else "  -> %s" % (extra,)))


# ── el ConnectPort de mentira ────────────────────────────────────────────────
# Tres nodos: uno normal, uno con un campo que los demas NO traen (otro
# firmware), y uno que no contesta (nodo caido).
CENSO = """<rci_reply version="1.1"><do_command target="zigbee"><discover>
 <device><ext_addr>00:13:a2:00:41:5c:9e:01!</ext_addr><node_id>TCU_01</node_id>
  <net_addr>0x1a2b</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:02!</ext_addr><node_id>TCU_02</node_id>
  <net_addr>0x3c4d</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:03!</ext_addr><node_id>HSU_01</node_id>
  <net_addr>0x5e6f</net_addr><device_type>0x120000</device_type><type>1</type></device>
</discover></do_command></rci_reply>"""

ESTADO = {
    "00:13:a2:00:41:5c:9e:01!": """<rci_reply version="1.1"><do_command target="zigbee"><query_state>
      <radio><rssi>61</rssi><ack_failures>3</ack_failures><supply_voltage>3280</supply_voltage>
      <temperature>41</temperature><net_addr>0x1a2b</net_addr></radio></query_state></do_command></rci_reply>""",
    # este trae DOS campos que el primero no tiene: el firmware y el hardware
    "00:13:a2:00:41:5c:9e:02!": """<rci_reply version="1.1"><do_command target="zigbee"><query_state>
      <radio><rssi>78</rssi><ack_failures>11</ack_failures><supply_voltage>3190</supply_voltage>
      <temperature>44</temperature><net_addr>0x3c4d</net_addr>
      <firmware_version>4060</firmware_version><hardware_version>0x2e46</hardware_version></radio>
      </query_state></do_command></rci_reply>""",
}
AJUSTE = {
    "00:13:a2:00:41:5c:9e:01!": """<rci_reply version="1.1"><do_command target="zigbee"><query_setting>
      <radio><power_level>4</power_level><channel>0x0f</channel><pan_id>0x1234</pan_id>
      </radio></query_setting></do_command></rci_reply>""",
}


class GW(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8", "replace")
        m = re.search(r'addr="([^"]+)"', cuerpo)
        if "discover" in cuerpo:
            r = CENSO
        elif m and "query_state" in cuerpo:
            r = ESTADO.get(m.group(1))
        elif m and "query_setting" in cuerpo:
            r = AJUSTE.get(m.group(1))
        else:                                      # el gateway hablando de si mismo
            r = '<rci_reply version="1.1"><query_setting><device><description>ConnectPort X4' \
                '</description><firmware>82002536_M</firmware></device></query_setting></rci_reply>'
        if r is None:                              # nodo caido: 500, como el de verdad
            self.send_error(500, "no response from node")
            return
        b = r.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


if shutil.which(PWSH) is None:
    print("No hay pwsh (%s): esta prueba corre el .ps1 de verdad y lo necesita." % PWSH)
    print("  PWSH=/ruta/a/pwsh python3 tools/test_inventario_zb.py")
    sys.exit(2)

srv = HTTPServer(("127.0.0.1", 0), GW)
threading.Thread(target=srv.serve_forever, daemon=True).start()
puerto = srv.server_address[1]

tmp = tempfile.mkdtemp()
txt = open(os.path.join(RAIZ, "zigbee_inventario.ps1"), encoding="utf-8").read()
# la misma sustitucion que hace el paquete al preparar el recolector
txt = re.sub(r'\$Gateways = @\([\s\S]*?\n\)',
             '$Gateways = @(\n  @{ Name = "GW-01"; Host = "127.0.0.1:%d"; User = ""; Pass = "" }\n)' % puerto,
             txt, count=1)
ruta = os.path.join(tmp, "zigbee_inventario.ps1")
open(ruta, "w", encoding="utf-8").write(txt)

print("\n· se corre el recolector de verdad contra un ConnectPort de mentira")
p = subprocess.run([PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ruta],
                   capture_output=True, text=True, timeout=180)
salida = p.stdout + p.stderr
di(p.returncode == 0, "termina sin error", salida[-400:])

csvp = os.path.join(tmp, "zigbee_inventario.csv")
di(os.path.exists(csvp), "escribe el CSV")
filas = list(csv.DictReader(open(csvp, encoding="utf-8-sig"))) if os.path.exists(csvp) else []
di(len(filas) == 3, "una fila por modulo, incluido el que no contesta", len(filas))

print("\n· el numero de serie, entero")
series = [f.get("serie") for f in filas]
di(series == ["00:13:a2:00:41:5c:9e:01!", "00:13:a2:00:41:5c:9e:02!", "00:13:a2:00:41:5c:9e:03!"],
   "los tres, tal cual los da el gateway", series)
di(all(s and s.count(":") == 7 for s in series), "con sus ocho bytes, sin recortar")
di([f.get("node_id") for f in filas] == ["TCU_01", "TCU_02", "HSU_01"], "y su node_id",
   [f.get("node_id") for f in filas])

print("\n· no se pierde el campo que solo trae UN nodo")
cols = filas[0].keys() if filas else []
di("estado_radio_firmware_version" in cols,
   "la columna del firmware esta en la cabecera aunque solo la traiga un nodo", list(cols))
di(filas[1].get("estado_radio_firmware_version") == "4060",
   "con su valor en el nodo que lo trae", filas[1].get("estado_radio_firmware_version"))
di((filas[0].get("estado_radio_firmware_version") or "") == "",
   "y vacia en el que no", filas[0].get("estado_radio_firmware_version"))
di(filas[1].get("estado_radio_hardware_version") == "0x2e46", "lo mismo con el hardware",
   filas[1].get("estado_radio_hardware_version"))

print("\n· lo que ya se medía sigue saliendo")
di(filas[0].get("estado_radio_rssi") == "61", "rssi", filas[0].get("estado_radio_rssi"))
di(filas[0].get("estado_radio_supply_voltage") == "3280", "tension", filas[0].get("estado_radio_supply_voltage"))
di(filas[0].get("disc_device_type") == "0x170000", "y el tipo de equipo del censo",
   filas[0].get("disc_device_type"))
di(filas[0].get("ajuste_radio_channel") == "0x0f", "mas el canal, que el logger no pedia",
   filas[0].get("ajuste_radio_channel"))

print("\n· un nodo que no contesta no desaparece")
di(filas[2].get("estado_ok") == "0", "sale marcado como sin respuesta", filas[2].get("estado_ok"))
di(bool(filas[2].get("estado_error")), "con el motivo", filas[2].get("estado_error"))
di(filas[2].get("serie") == "00:13:a2:00:41:5c:9e:03!", "y con su serie, que si la sabemos")
di(filas[0].get("estado_ok") == "1" and filas[0].get("ajuste_ok") == "1",
   "y el que si contesta va marcado como tal")
# `query_setting` solo lo soporta el primero: distingue «nodo caido» de «este
# firmware no tiene ese comando»
di(filas[1].get("estado_ok") == "1" and filas[1].get("ajuste_ok") == "0",
   "un nodo vivo cuyo firmware no soporta un comando se distingue del caido",
   (filas[1].get("estado_ok"), filas[1].get("ajuste_ok")))

print("\n· y el volcado en bruto, que es de donde saldrá lo siguiente")
xmlp = os.path.join(tmp, "zigbee_inventario_crudo.xml")
di(os.path.exists(xmlp), "se escribe el .xml")
crudo = open(xmlp, encoding="utf-8-sig").read() if os.path.exists(xmlp) else ""
di("ConnectPort X4" in crudo, "con lo que dice el gateway de si mismo")
di("firmware_version" in crudo, "y con las respuestas de los nodos tal cual")

srv.shutdown()
print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
sys.exit(1 if fallos else 0)
