#!/usr/bin/env python3
"""
test_rutas_telnet.py — el recolector de RUTAS, contra un gateway falso que habla
telnet de verdad.

POR QUE EXISTE. `zigbee_routes_logger.ps1` trae un cliente telnet ESCRITO A MANO
—negociacion IAC incluida, byte a byte— porque en el PC de la planta no se puede
instalar PuTTY ni plink. Ese codigo no lo habia ejecutado nunca nada: ni una
prueba, ni este contenedor, que no tiene pwsh. Vivia solo en las plantas.

Y de ahi sale la otra mitad de la malla: los SALTOS. El RSSI dice cuanto se oye
un nodo; las rutas dicen por donde pasa. El visor cruza los dos.

Asi que se levanta un gateway de mentira que contesta HTTP para el
autodescubrimiento y TELNET —socket crudo, con su negociacion IAC— para las
rutas, y se corre el .ps1 tal cual contra el.

LO QUE SE DEJA MEDIDO ES v1, incluido su agujero: un nodo al que no le sale
ruta NO APARECE en el CSV, asi que su ausencia no se distingue de un fallo del
recolector. Eso ya esta escrito en el contrato de datos como defecto conocido y
es lo que el bloque 2 tiene que cerrar. La comprobacion de abajo lo fija: el
dia que se arregle, este banco se pone rojo y hay que darle la vuelta.

    python3 tools/test_rutas_telnet.py
    MUTA=<clave> python3 tools/test_rutas_telnet.py   (mutacion: TIENE que salir rojo)
"""
import csv
import os
import re
import shutil
import socket
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


# ── el censo, por HTTP (el mismo RCI que el logger de RSSI) ──────────────────
CENSO = """<rci_reply version="1.1"><do_command target="zigbee"><discover>
 <device><ext_addr>00:13:a2:00:41:5c:9e:01!</ext_addr><node_id>TCU_01</node_id>
  <net_addr>0x1a2b</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:02!</ext_addr><node_id>TCU_02</node_id>
  <net_addr>0x3c4d</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:03!</ext_addr><node_id>HSU_01</node_id>
  <net_addr>0x5e6f</net_addr><device_type>0x120000</device_type><type>1</type></device>
</discover></do_command></rci_reply>"""


class GW(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        b = CENSO.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


# ── las rutas, por telnet ────────────────────────────────────────────────────
# Tal como las escupe el `xbee source_route` del ConnectPort: una linea por
# salto, del coordinador al destino, y el coordinador SIN nombre (de ahi el
# "COORD" que pone el recolector).
#
# El HSU no devuelve ninguna linea: es un nodo al que el coordinador no le tiene
# ruta guardada. Hoy eso lo deja FUERA del CSV — ver la cabecera.
RUTAS = {
    "00:13:a2:00:41:5c:9e:01!": "  [0000]!\r\n  TCU_01 [1a2b]!\r\n",
    "00:13:a2:00:41:5c:9e:02!": "  [0000]!\r\n  TCU_01 [1a2b]!\r\n  TCU_02 [3c4d]!\r\n",
    "00:13:a2:00:41:5c:9e:03!": "",
}

IAC, WILL, WONT, DO, DONT = 255, 251, 252, 253, 254
OPT_ECHO = 1

visto = {"iac": [], "comandos": [], "usuario": None, "clave": None}


def sin_iac(datos, buzon):
    """Quita las secuencias IAC del flujo y las apunta. Lo que el cliente
       CONTESTA a la negociacion es justo lo que hay que comprobar."""
    fuera, i = bytearray(), 0
    while i < len(datos):
        b = datos[i]
        if b == IAC and i + 1 < len(datos):
            cmd = datos[i + 1]
            if cmd == 250:                                  # SB ... SE
                i += 2
                while i < len(datos) and datos[i] != 240:
                    i += 1
                i += 1
                continue
            if WILL <= cmd <= DONT:
                opt = datos[i + 2] if i + 2 < len(datos) else 0
                buzon.append((cmd, opt))
                i += 3
                continue
            i += 2
            continue
        fuera.append(b)
        i += 1
    return bytes(fuera)


def telnetd(sock):
    cli, _ = sock.accept()
    cli.settimeout(30)
    pendiente = b""

    def linea():
        nonlocal pendiente
        while b"\n" not in pendiente:
            trozo = cli.recv(4096)
            if not trozo:
                return None
            pendiente += sin_iac(trozo, visto["iac"])
        l, pendiente = pendiente.split(b"\n", 1)
        return l.strip().decode("ascii", "replace")

    try:
        # negociacion ANTES del prompt, que es lo que hace un ConnectPort de
        # verdad: si el cliente no sabe contestar a esto, se come los 0xFF como
        # si fueran texto y el login se le desmonta.
        cli.sendall(bytes([IAC, DO, OPT_ECHO]) + b"\r\nConnectPort X4\r\nlogin: ")
        visto["usuario"] = linea()
        cli.sendall(b"password: ")
        visto["clave"] = linea()
        cli.sendall(b"\r\n#>")
        while True:
            cmd = linea()
            if cmd is None:
                return
            visto["comandos"].append(cmd)
            m = re.match(r"xbee source_route (\S+)", cmd)
            cuerpo = RUTAS.get(m.group(1), "") if m else ""
            cli.sendall(cmd.encode() + b"\r\n" + cuerpo.encode() + b"#>")
    except (OSError, socket.timeout):
        return


# ── mutaciones ───────────────────────────────────────────────────────────────
MUTACIONES = {
    # los saltos son los nodos del camino MENOS UNO: un camino COORD->TCU es 1 salto
    "saltos":     (r"\$hops = \$p\.addrs\.Count - 1", "$hops = $p.addrs.Count"),
    # el coordinador viene sin nombre y el recolector se lo pone
    "coord":      (r'\$nid = "COORD"', '$nid = "?"'),
    # sin manejar IAC, los 0xFF de la negociacion entran como texto y no se contesta
    "iac":        (r"if \(\$b -eq 255\) \{", "if ($false) {"),
    # el separador del camino: el visor parte por '>'
    "separador":  (r"\(\$p\.ids -join '>'\)", "($p.ids -join ',')"),
    # y el arreglo de esta PR: sin quitarle el puerto a $GwHost, telnet no conecta
    "puerto":     (r"\$client\.Connect\(\$TelnetHost, \$TelnetPort\)",
                   "$client.Connect($GwHost, $TelnetPort)"),
}
MUTA = os.environ.get("MUTA")
if MUTA and MUTA not in MUTACIONES:
    print("mutacion desconocida. Hay: " + ", ".join(MUTACIONES))
    sys.exit(2)

if shutil.which(PWSH) is None:
    print("No hay pwsh (%s): esta prueba corre el .ps1 de verdad y lo necesita." % PWSH)
    print("  PWSH=/ruta/a/pwsh python3 tools/test_rutas_telnet.py")
    sys.exit(2)

srv = HTTPServer(("127.0.0.1", 0), GW)
threading.Thread(target=srv.serve_forever, daemon=True).start()
p_http = srv.server_address[1]

tel = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
tel.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
tel.bind(("127.0.0.1", 0))
tel.listen(1)
p_tel = tel.getsockname()[1]
threading.Thread(target=telnetd, args=(tel,), daemon=True).start()

tmp = tempfile.mkdtemp()
txt = open(fuente("zigbee_routes_logger.ps1"), encoding="utf-8").read()
# LA MISMA sustitucion que hace el paquete de medida (preparaRutas, index.html).
txt, cuantas = re.subn(r'\$GwHost\s*=\s*"[^"]*"', '$GwHost     = "127.0.0.1:%d"' % p_http, txt, count=1)
if cuantas != 1:
    print("la sustitucion de $GwHost no caso: el paquete de medida tampoco funcionaria")
    sys.exit(2)
# el puerto de telnet no lo toca el paquete (en planta es siempre el 23); aqui
# hace falta porque un banco no puede abrir un puerto por debajo del 1024.
txt, cuantas = re.subn(r"\$TelnetPort = 23", "$TelnetPort = %d" % p_tel, txt, count=1)
if cuantas != 1:
    print("no encuentro $TelnetPort en el CONFIG")
    sys.exit(2)

if MUTA:
    pat, rep = MUTACIONES[MUTA]
    txt, c = re.subn(pat, rep.replace("\\", "\\\\"), txt, count=1)
    if c != 1:
        print("la mutacion «%s» no caso con el codigo (¿cambio el .ps1?)" % MUTA)
        sys.exit(2)
    print("### MUTACION «%s» PUESTA: este banco TIENE que salir rojo\n" % MUTA)

ruta = os.path.join(tmp, "zigbee_routes_logger.ps1")
open(ruta, "w", encoding="utf-8").write(txt)
csvp = os.path.join(tmp, "zigbee_routes.csv")


def filas_de(p):
    if not os.path.exists(p):
        return []
    try:
        return list(csv.DictReader(open(p, encoding="utf-8-sig")))
    except Exception:
        return []


# ── se corre el recolector de verdad, UN ciclo ───────────────────────────────
# Igual que el de RSSI: bucle infinito, se le deja hacer una pasada y se le
# corta durante la espera. No se le toca el bucle.
print("\n· se corre el recolector de verdad contra un gateway de mentira")
salida_p = os.path.join(tmp, "salida.txt")
with open(salida_p, "wb") as fsal:
    p = subprocess.Popen([PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ruta],
                         stdout=fsal, stderr=subprocess.STDOUT, cwd=tmp)
    limite = time.time() + 90
    while time.time() < limite:
        if p.poll() is not None:
            break
        if len(filas_de(csvp)) >= 2:
            time.sleep(0.4)
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

print("\n· entra por telnet como entraria en planta")
di("Conectado" in salida, "conecta y pasa el login", salida[-400:])
di(visto["usuario"] == "root" and visto["clave"] == "dbps",
   "manda usuario y clave del CONFIG", (visto["usuario"], visto["clave"]))
di((WONT, OPT_ECHO) in visto["iac"],
   "y contesta a la negociacion telnet: IAC DO ECHO -> IAC WONT ECHO", visto["iac"])

print("\n· pregunta por cada nodo del censo, uno a uno")
di(len(visto["comandos"]) == 3, "tres comandos, uno por nodo descubierto", visto["comandos"])
di(all(c.startswith("xbee source_route 00:13:a2:00:41:5c:9e:0") for c in visto["comandos"]),
   "con la direccion de 64 bits entera, con su '!'", visto["comandos"])

filas = filas_de(csvp)
print("\n· el camino, tal cual lo deja el recolector")
di(os.path.exists(csvp), "escribe zigbee_routes.csv", salida[-400:])
por_t = {f.get("target"): f for f in filas}
a = por_t.get("00:13:a2:00:41:5c:9e:01!", {})
b = por_t.get("00:13:a2:00:41:5c:9e:02!", {})
di(a.get("hop_count") == "1", "COORD -> TCU_01 es UN salto, no dos nodos", a.get("hop_count"))
di(b.get("hop_count") == "2", "COORD -> TCU_01 -> TCU_02 son DOS", b.get("hop_count"))
di(a.get("path_ids") == "COORD>TCU_01", "el camino por nombre, separado por '>'", a.get("path_ids"))
di(b.get("path_ids") == "COORD>TCU_01>TCU_02", "y el de dos saltos", b.get("path_ids"))
di(a.get("path_addrs") == "0000>1a2b", "el mismo camino por direccion de red", a.get("path_addrs"))
di(b.get("path_addrs") == "0000>1a2b>3c4d", "y el de dos saltos", b.get("path_addrs"))
di(a.get("path_ids", "").startswith("COORD"),
   "el coordinador viene sin nombre del gateway y se le pone COORD", a.get("path_ids"))

print("\n· UN NODO SIN RUTA NO APARECE  (defecto conocido de v1; lo cierra el bloque 2)")
di(len(filas) == 2, "dos filas, no tres: el HSU se queda fuera del CSV", len(filas))
di("00:13:a2:00:41:5c:9e:03!" not in por_t,
   "su direccion no sale por ningun lado, asi que «sin ruta» y «no preguntado» se confunden",
   sorted(por_t))
di("2/3 rutas" in salida, "y solo se entera el que mira la consola: «2/3 rutas»",
   [l for l in salida.splitlines() if "rutas" in l][-1:])

print("\n· EL SELLO ES DEL CICLO, no de la fila  (esto lo cambia el bloque 2)")
sellos = sorted(set(f.get("timestamp") for f in filas))
di(len(sellos) == 1, "las dos filas del ciclo llevan el MISMO sello", sellos)
di(bool(re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", sellos[0] if sellos else "")),
   "en hora LOCAL sin zona, que es el v1 que el contrato manda sustituir", sellos[:1])

srv.shutdown()
print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
if MUTA:
    print("### %s: la mutacion «%s» %s" % (("bien" if fallos else "MAL"), MUTA,
          "sale roja" if fallos else "pasa desapercibida"))
sys.exit(1 if fallos else 0)
