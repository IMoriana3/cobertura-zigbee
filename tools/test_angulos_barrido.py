#!/usr/bin/env python3
"""
test_angulos_barrido.py — el angulo del barrido, leido del Modbus en vez de a mano.

POR QUE EXISTE. `beta_grados` se apuntaba a mano mientras el seguidor se mueve:
lento, se desincroniza de la medida y se equivoca. El angulo esta en el Modbus
(registro 30111) y se lee solo. Pero leerlo mal no da error, da un numero: y un
angulo equivocado entra en el ajuste de calibracion sin que nadie lo note.

LO QUE SE COMPRUEBA, con una NCU de mentira que habla Modbus TCP de verdad:

  · que la trama va como la manda la TCU Toolbox: FC03 y la direccion 30111 TAL
    CUAL, no 3xxxx con offset y FC04. Escribirlo del otro modo no falla aqui:
    falla en la planta, con IllegalDataAddress y una tarde perdida;
  · que un angulo NEGATIVO sale negativo (s16). Sin el signo, un seguidor a -30
    sale a 6528 grados;
  · que solo se sondean los TCU DE LA HOJA, no la NCU entera, que compite con el
    SCADA por la misma conexion;
  · que un TCU que no contesta no cuela un cero: se queda sin angulo y se dice;
  · y que al cruzar, un angulo lejos en el tiempo NO se usa — el seguidor ya se
    ha movido.

    PWSH=/ruta/a/pwsh python3 tools/test_angulos_barrido.py
"""
import csv
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading

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


# ── la NCU de mentira ────────────────────────────────────────────────────────
# TCU 30: tilt -30,0 (el caso del signo) · TCU 31: tilt +15,5 · TCU 40: MANUAL
# TCU 41: no contesta (excepcion 0x0B, GatewayTargetNoResponse, la que da la NCU
# cuando el TCU no llega a tiempo)
REGS = {(30, 30111): [65236, 65236], (30, 30001): [0x0200],     # -30,0 y AUTO
        (31, 30111): [155, 460],     (31, 30001): [0x0200],     # 15,5 / 46,0 AUTO
        (40, 30111): [1000, 1000],   (40, 30001): [0x0100]}     # 100,0 MANUAL
PEDIDAS = []


def ncu_falsa(sock):
    while True:
        try:
            c, _ = sock.accept()
        except OSError:
            return
        threading.Thread(target=atiende, args=(c,), daemon=True).start()


def atiende(c):
    try:
        while True:
            cab = c.recv(7)
            if len(cab) < 7:
                return
            tid, _, ln, unit = struct.unpack(">HHHB", cab)
            pdu = c.recv(ln - 1)
            fc, addr, cant = struct.unpack(">BHH", pdu[:5])
            PEDIDAS.append((unit, fc, addr, cant))
            vals = REGS.get((unit, addr))
            if fc != 3 or vals is None:
                # FC mala o direccion que no existe: excepcion, como la de verdad
                cuerpo = struct.pack(">BB", fc | 0x80, 0x02 if fc == 3 else 0x01)
            else:
                v = vals[:cant]
                cuerpo = struct.pack(">BB", 3, 2 * len(v)) + b"".join(struct.pack(">H", x) for x in v)
            c.sendall(struct.pack(">HHHB", tid, 0, len(cuerpo) + 1, unit) + cuerpo)
    except Exception:
        pass
    finally:
        c.close()


if shutil.which(PWSH) is None:
    print("No hay pwsh (%s): esta prueba corre el .ps1 de verdad y lo necesita." % PWSH)
    sys.exit(2)

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 0))
srv.listen(8)
puerto = srv.getsockname()[1]
threading.Thread(target=ncu_falsa, args=(srv,), daemon=True).start()

tmp = tempfile.mkdtemp()
# una hoja de barrido con tres pares; el 41 no contesta
with open(os.path.join(tmp, "barrido_prueba_NCU01.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["origen", "destino", "rssi_medido_dbm", "llega", "beta_grados", "hora_utc",
                "distancia_m", "mesas", "clase", "esclavo_origen", "esclavo_destino"])
    w.writerow(["A", "B", "", "", "", "", "40", "0", "eje", "30", "31"])
    w.writerow(["C", "D", "", "", "", "", "18", "9", "filas", "40", "41"])
    w.writerow(["E", "F", "", "", "", "", "25", "3", "diagonal", "31", "30"])

txt = open(os.path.join(RAIZ, "zigbee_angulos.ps1"), encoding="utf-8").read()
txt = re.sub(r'\$Ncus = @\([\s\S]*?\n\)',
             '$Ncus = @(\n  @{ Name = "NCU01-GW1"; Host = "127.0.0.1"; Port = %d }\n)' % puerto,
             txt, count=1)
txt = txt.replace("$IntervalSec = 30", "$IntervalSec = 1")
ruta = os.path.join(tmp, "zigbee_angulos.ps1")
open(ruta, "w", encoding="utf-8").write(txt)

# TODO ESTO CORRE EN es-ES a proposito: el PC de la planta es Windows en español
# y allí PowerShell escribe «15,5» y no «15.5». Bajo en-US no se prueba nada de
# eso, y lo que se rompe es la lectura del CSV — en silencio, sin un solo ángulo.
print("\n· se corre el recolector de ángulos contra una NCU Modbus de mentira (en es-ES)")
ES = "[Globalization.CultureInfo]::CurrentCulture=[Globalization.CultureInfo]::new('es-ES'); "
p = subprocess.Popen([PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass",
                      "-Command", ES + "& '%s'" % ruta],
                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=tmp)
csvp = os.path.join(tmp, "angulos.csv")
import time
for _ in range(120):                                  # espera a la primera pasada
    if os.path.exists(csvp) and len(open(csvp, encoding="utf-8-sig").readlines()) >= 5:
        break
    time.sleep(0.5)
p.terminate()
try:
    salida = p.communicate(timeout=20)[0]
except Exception:
    p.kill()
    salida = ""

di(os.path.exists(csvp), "escribe angulos.csv", salida[-300:])
angs = list(csv.DictReader(open(csvp, encoding="utf-8-sig"))) if os.path.exists(csvp) else []
di(any("," in (a.get("tilt_deg") or "") for a in angs),
   "el CSV sale con COMA decimal, como en el PC de la planta",
   [a.get("tilt_deg") for a in angs][:3])
di(any((a.get("tilt_deg") or "") != "" for a in angs),
   "y con algún ángulo leído de verdad (si no, la trama no llegó a la NCU)",
   salida[-300:] or [a.get("error") for a in angs][:2])
if not angs:
    srv.close()
    print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
    sys.exit(1)
prim = {}
for a in angs:
    prim.setdefault(a["esclavo"], a)

print("\n· la trama, como la manda la Toolbox")
fcs = {p2[1] for p2 in PEDIDAS}
dirs = {p2[2] for p2 in PEDIDAS}
di(fcs == {3}, "usa FC03, no FC04", fcs)
di(30111 in dirs and 30001 in dirs,
   "y la dirección documentada TAL CUAL (30111), no un offset", sorted(dirs))
di(not ({110, 111, 0, 1} & dirs), "sin restarle 30001 ni 30000", sorted(dirs))

print("\n· el signo, que es donde se rompe callando")
di((prim.get("30", {}).get("tilt_deg") or "") == "-30", "un seguidor a -30° sale a -30, no a 6528",
   prim.get("30", {}).get("tilt_deg"))
di((prim.get("31", {}).get("tilt_deg") or "").replace(".", ",") == "15,5",
   "y uno positivo, con su décima", prim.get("31", {}).get("tilt_deg"))

print("\n· solo los TCU de la hoja, y el modo de cada uno")
di(sorted(prim.keys(), key=int) == [30, 31, 40, 41] or
   sorted(int(k) for k in prim) == [30, 31, 40, 41],
   "los cuatro esclavos de la hoja, ni uno más", sorted(prim.keys()))
di(all(u in (30, 31, 40, 41) for u, _f, _a, _c in PEDIDAS),
   "no se sondea ningún TCU que no esté en la hoja",
   sorted({u for u, _f, _a, _c in PEDIDAS}))
di(prim.get("30", {}).get("modo") == "AUTO", "el que sigue, en AUTO", prim.get("30", {}).get("modo"))
di(prim.get("40", {}).get("modo") == "MANUAL", "y el que no, en MANUAL",
   prim.get("40", {}).get("modo"))

print("\n· un TCU que no contesta no cuela un cero")
di((prim.get("41", {}).get("tilt_deg") or "") == "", "se queda sin ángulo",
   prim.get("41", {}).get("tilt_deg"))
di(bool(prim.get("41", {}).get("error")), "y con el motivo apuntado",
   prim.get("41", {}).get("error"))

# ── el cruce ─────────────────────────────────────────────────────────────────
print("\n· al cruzar, la hora manda")
hoja = os.path.join(tmp, "barrido_prueba_NCU01.csv")
h0 = angs[0]["hora_utc"]
filas = list(csv.DictReader(open(hoja, encoding="utf-8-sig")))
filas[0]["llega"], filas[0]["hora_utc"] = "1", h0                    # medida a la hora buena
# medida buena, pero su DESTINO es el TCU que no contesta: el origen se llena y
# el destino se queda vacío. Un cero ahí sería un seguidor plano que no existe.
filas[1]["llega"], filas[1]["hora_utc"] = "0", h0
filas[2]["llega"], filas[2]["hora_utc"] = "0", "2020-01-01 03:00:00"  # medida de otro día
with open(hoja, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
    w.writeheader()
    w.writerows(filas)

r = subprocess.run([sys.executable, os.path.join(AQUI, "rellena_barrido.py"), hoja, csvp],
                   capture_output=True, text=True)
di(r.returncode == 0, "el cruce termina bien", r.stderr[-300:])
out = list(csv.DictReader(open(hoja, encoding="utf-8-sig")))
if len(out) < 3:
    out = out + [{}] * (3 - len(out))
di(out[0].get("beta_grados") == "-30.0", "la medida a su hora se lleva el ángulo del origen",
   out[0].get("beta_grados"))
di(out[0].get("beta_destino") == "15.5", "y el del destino, que puede ser otro",
   out[0].get("beta_destino"))
di(out[0].get("modo_origen") == "AUTO", "con el modo", out[0].get("modo_origen"))
di(out[1].get("beta_grados") == "100.0", "el par con destino mudo llena el origen igual",
   out[1].get("beta_grados"))
di((out[1].get("beta_destino") or "") == "",
   "pero el destino mudo se queda VACÍO, no a 0° (un seguidor plano que no existe)",
   out[1].get("beta_destino"))
di(out[1].get("modo_origen") == "MANUAL", "y se ve que ese no estaba siguiendo",
   out[1].get("modo_origen"))
di("fuera de AUTO" in r.stdout, "cosa que además se canta", r.stdout)
di((out[2].get("beta_grados") or "") == "", "la medida de otro día NO se lleva un ángulo inventado",
   out[2].get("beta_grados"))
di("no se inventan" in r.stdout, "y se dice cuántas se han quedado sin él", r.stdout)
di("2 de 3 medidas con angulo" in r.stdout, "con la cuenta",
   (r.stdout.splitlines() or [""])[0] + " | " + r.stderr[-160:])

# ── LAS DOS VERSIONES DEL CRUCE TIENEN QUE DAR LO MISMO ─────────────────────
# El de la planta es el .ps1 (alli hay PowerShell y no hay Python); el .py es
# para trabajar aqui. Dos implementaciones de lo mismo se separan solas, y la
# que se separa es la que nadie corre hasta que hace falta. Se comparan sobre la
# MISMA entrada, celda a celda.
print("\n· el cruce en PowerShell da exactamente lo mismo que el de Python")
import shutil as _sh
hoja2 = os.path.join(tmp, "ps", "barrido_prueba_NCU01.csv")
os.makedirs(os.path.join(tmp, "ps"), exist_ok=True)
# la hoja SIN cruzar, tal y como la dejo el de campo, y los mismos angulos
with open(hoja2, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
    w.writeheader()
    w.writerows(filas)
_sh.copy(csvp, os.path.join(tmp, "ps", "angulos.csv"))
_sh.copy(os.path.join(RAIZ, "rellena_barrido.ps1"), os.path.join(tmp, "ps", "rellena_barrido.ps1"))
rp = subprocess.run([PWSH, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                     ES + "& '%s'" % os.path.join(tmp, "ps", "rellena_barrido.ps1")],
                    capture_output=True, text=True, cwd=os.path.join(tmp, "ps"), timeout=180)
di(rp.returncode == 0, "el cruce en PowerShell termina bien", (rp.stdout + rp.stderr)[-300:])
outps = list(csv.DictReader(open(hoja2, encoding="utf-8-sig")))
di(len(outps) == len(out), "mismas filas", (len(outps), len(out)))
difs = []
for a1, b1 in zip(out, outps):
    for c in ("beta_grados", "beta_destino", "modo_origen", "llega", "hora_utc",
              "esclavo_origen", "esclavo_destino"):
        if (a1.get(c) or "") != (b1.get(c) or ""):
            difs.append("%s: py=%r ps=%r" % (c, a1.get(c), b1.get(c)))
di(not difs, "y el mismo valor en cada celda que importa", difs[:4])
di("2 de 3 medidas con angulo" in rp.stdout, "y dice la misma cuenta",
   (rp.stdout.splitlines() or [""])[0])
di("fuera de AUTO" in rp.stdout, "y canta igual el seguidor que no seguia", rp.stdout)

srv.close()
print("\n%d comprobaciones, %d fallos" % (n, len(fallos)))
sys.exit(1 if fallos else 0)
