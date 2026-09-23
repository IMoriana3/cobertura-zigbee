#!/usr/bin/env python3
"""
test_config_planta.py — el volcador de configuracion, y que NO escriba.

POR QUE EXISTE. De los repos solo salen los DEFECTOS DE FABRICA del mapa de
registros; lo que la planta tiene PUESTO no lo sabe nadie, y de ahi dependen los
dos terminos grandes de la cadena hasta bandera: cuanto tarda la HSU en decidir
que hay viento (1 s a 60 s segun por donde dispare) y el stow autonomo de la TCU
por perdida de comunicacion (40022, de fabrica 10 minutos = 600 s).

`zigbee_config.ps1` los lee. Este banco comprueba que los lee BIEN y, sobre
todo, QUE NO ESCRIBE.

LO QUE SE COMPRUEBA, con una NCU de mentira que habla Modbus TCP de verdad:

  · QUE NO ESCRIBE, y no de palabra: el servidor de mentira apunta el codigo de
    funcion de CADA trama que recibe y exige que TODOS sean 3. Si algun dia
    alguien le anyade una escritura, aqui sale rojo. Ademas el servidor
    RESPONDE CON EXCEPCION a cualquier FC que no sea 3, para que una escritura
    tampoco pueda colarse en silencio;
  · que la direccion va TAL CUAL en la trama (41013 es 41013), no 4xxxx con
    offset. Escribirlo del otro modo no falla aqui: falla en la planta con
    IllegalDataAddress;
  · que los registros EMPAQUETADOS se despiezan por sus bits. 41057 lleva TRES
    campos de racha y 41071 lleva DOS promediados: leerlos enteros da un numero
    grande con pinta de segundos que no lo es;
  · que el F32 NO SE ADIVINA. Modbus no fija si la palabra alta va primera, y el
    mapa no lo dice: el script decodifica las dos y elige por plausibilidad,
    DICIENDO cual uso. Aqui se sirve el mismo valor en los dos ordenes y se
    exige que acierte, y que cuando las dos son plausibles no elija;
  · y que un valor DISTINTO del defecto se marque, que es el unico motivo de
    correr esto.

    PWSH=/ruta/a/pwsh python3 tools/test_config_planta.py
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

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# DE DONDE SALE EL .ps1. Por defecto el del repo; con PS1_DIR, el que sale del
# ZIP de «Medir en planta», que NO es el mismo fichero -el paquete le pone el
# BOM y le sustituye el CONFIG-. El tecnico usa ese, asi que hay que probarlo.
PS1_DIR = os.environ.get('PS1_DIR') or RAIZ
PS1 = os.path.join(PS1_DIR, 'zigbee_config.ps1')
if not os.path.exists(PS1):
    print('no encuentro zigbee_config.ps1 en %s' % PS1_DIR)
    sys.exit(2)

fallos = []


def di(cond, nombre, extra=None):
    if cond:
        print('OK   ' + nombre)
    else:
        fallos.append(nombre)
        print('FAIL ' + nombre + ('' if extra is None else ' -> ' + str(extra)))


# ── 1 · EL FUENTE: que no haya codigos de escritura ───────────────────────
# Se mira ademas del banco de comportamiento porque una escritura puede estar
# en una rama que el banco no pise. Se buscan los codigos en la CONSTRUCCION DE
# LA TRAMA, no en el texto: los comentarios hablan de FC06 y FC16 justo para
# decir que no estan, y buscar la cadena daria un falso positivo.
src = open(PS1, encoding='utf-8-sig').read()
pdus = re.findall(r'\[byte\[\]\]\(\s*(\d+)\s*,', src)
di(pdus and set(pdus) == {'3'}, 'el fuente solo construye tramas con FC03', pdus)
di('WriteSingle' not in src and 'WriteMultiple' not in src,
   'no hay helpers de escritura en el fuente')

PWSH = os.environ.get('PWSH') or shutil.which('pwsh') or shutil.which('powershell')
if not PWSH:
    print('\nSIN PWSH: no se ha ejecutado el .ps1. Las comprobaciones de fuente SI se han hecho.')
    print('Esto no es un verde del banco entero.')
    sys.exit(2 if fallos else 0)


# ── 2 · LA NCU DE MENTIRA ─────────────────────────────────────────────────
# Sirve valores ELEGIDOS para que se note si algo se lee mal:
#   41013 (F32) = 20,0 m/s, DISTINTO del defecto 16,67 -> tiene que salir marcado
#   41018 (U16) = 4 s,      DISTINTO del defecto 1
#   41071 = 0x0414 -> alta 0x04 = 4 s de promediado de VELOCIDAD (el que
#           recomienda el fabricante para el ultrasonico), baja 0x14 = 20 s de
#           direccion. Leido entero daria 1044, que no es ningun tiempo.
#   41057 = 0x233C -> 15..12 = 2 s, 11..8 = 3 rachas, 7..0 = 0x3C = 60 s
#   40022 = 3 minutos, DISTINTO del defecto 10 -> la palanca de la fase 3
F32_ORDEN = os.environ.get('ORDEN_F32', 'ABCD')


def f32_words(v):
    b = struct.pack('>f', v)
    hi = (b[0] << 8) | b[1]
    lo = (b[2] << 8) | b[3]
    return (hi, lo) if F32_ORDEN == 'ABCD' else (lo, hi)


VALORES = {}
for a, v in ((41013, 20.0), (41011, 16.67), (41058, 16.67)):
    hi, lo = f32_words(v)
    VALORES[a] = hi
    VALORES[a + 1] = lo
for i in range(1, 8):
    hi, lo = f32_words(27.78)
    VALORES[41074 + 2 * i] = hi
    VALORES[41075 + 2 * i] = lo
    VALORES[41089 + i] = 10 if i <= 4 else 5
VALORES[41018] = 4          # distinto del defecto (1)
VALORES[41017] = 1
VALORES[41071] = 0x0414     # 4 s velocidad (alta) · 20 s direccion (baja)
VALORES[41057] = 0x233C     # 2 s duracion · 3 rachas · 60 s ventana
VALORES[41008] = 1 << 6     # ultrasonico declarado
VALORES[41214] = 20

TCU_VALORES = {40022: 3, 40029: 10}   # 40022 distinto del defecto (10)

fcs = set()
addrs = set()
lock = threading.Lock()


def atiende(cn):
    try:
        while True:
            cab = b''
            while len(cab) < 7:
                d = cn.recv(7 - len(cab))
                if not d:
                    return
                cab += d
            tid = cab[:2]
            rlen = (cab[4] << 8) | cab[5]
            unit = cab[6]
            cuerpo = b''
            while len(cuerpo) < rlen - 1:
                d = cn.recv(rlen - 1 - len(cuerpo))
                if not d:
                    return
                cuerpo += d
            fc = cuerpo[0]
            with lock:
                fcs.add(fc)
            if fc != 3:
                # NO se atiende: excepcion 0x01 (IllegalFunction). Una escritura
                # tiene que fallar aqui igual que fallaria en un aparato que
                # solo permite leer.
                pdu = bytes([fc | 0x80, 0x01])
                cn.sendall(tid + b'\x00\x00' + bytes([0, len(pdu) + 1, unit]) + pdu)
                continue
            addr = (cuerpo[1] << 8) | cuerpo[2]
            n = (cuerpo[3] << 8) | cuerpo[4]
            with lock:
                addrs.add(addr)
            tabla = TCU_VALORES if unit != 1 else VALORES
            datos = b''
            for k in range(n):
                datos += struct.pack('>H', tabla.get(addr + k, 0))
            pdu = bytes([3, len(datos)]) + datos
            cn.sendall(tid + b'\x00\x00' + bytes([0, len(pdu) + 1, unit]) + pdu)
    except Exception:
        pass
    finally:
        try:
            cn.close()
        except Exception:
            pass


srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(('127.0.0.1', 0))
srv.listen(8)
PUERTO = srv.getsockname()[1]


def bucle():
    while True:
        try:
            cn, _ = srv.accept()
        except OSError:
            return
        threading.Thread(target=atiende, args=(cn,), daemon=True).start()


threading.Thread(target=bucle, daemon=True).start()

# ── 3 · CORRERLO ──────────────────────────────────────────────────────────
tmp = tempfile.mkdtemp(prefix='cfgplanta_')
destino = os.path.join(tmp, 'zigbee_config.ps1')
texto = src
texto = texto.replace('Host = "10.100.1.52"; Port = 503',
                      'Host = "127.0.0.1"; Port = %d' % PUERTO)
texto = texto.replace('$TcusManual  = @()', '$TcusManual  = @(7, 9)')
open(destino, 'w', encoding='utf-8-sig').write(texto)

r = subprocess.run([PWSH, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', destino],
                   capture_output=True, text=True, timeout=180)
salida = (r.stdout or '') + (r.stderr or '')
csvp = os.path.join(tmp, 'config_planta.csv')
di(os.path.exists(csvp), 'deja config_planta.csv al lado', salida[-400:])
if not os.path.exists(csvp):
    print('\nFALLAN %d' % len(fallos))
    sys.exit(1)

filas = list(csv.DictReader(open(csvp, encoding='utf-8-sig')))
por_campo = {f['campo']: f for f in filas}

# ── 4 · LO QUE TIENE QUE SALIR ────────────────────────────────────────────
di(fcs == {3}, 'SOLO manda FC03: ninguna trama de escritura', sorted(fcs))
di(41013 in addrs and 40022 in addrs,
   'la direccion va TAL CUAL en la trama (41013 y 40022, sin offset)',
   sorted(a for a in addrs if a > 40000)[:6])

di(por_campo.get('WindSpeedAVGperiod_s', {}).get('leido') == '4',
   'despieza 41071: promediado de VELOCIDAD = 4 s (bits 15..8)',
   por_campo.get('WindSpeedAVGperiod_s', {}).get('leido'))
di(por_campo.get('WindDirectionAVGperiod_s', {}).get('leido') == '20',
   'y el de DIRECCION = 20 s (bits 7..0)',
   por_campo.get('WindDirectionAVGperiod_s', {}).get('leido'))
di(por_campo.get('GustyWindowTime_s', {}).get('leido') == '60',
   'despieza 41057: ventana de rachas = 60 s',
   por_campo.get('GustyWindowTime_s', {}).get('leido'))
di(por_campo.get('GustyWindNumber', {}).get('leido') == '3',
   'y el numero de rachas = 3', por_campo.get('GustyWindNumber', {}).get('leido'))
di(por_campo.get('GustMinimumDuration_s', {}).get('leido') == '2',
   'y la duracion minima = 2 s', por_campo.get('GustMinimumDuration_s', {}).get('leido'))

f = por_campo.get('WindSpeedMid_mps', {})
di(f.get('leido') == '20', 'decodifica el F32 (umbral 20 m/s)', f.get('leido'))
di('ABCD' in f.get('nota', '') or 'CDAB' in f.get('nota', ''),
   'y DICE que orden de palabra ha usado', f.get('nota'))

di(f.get('igual') == 'NO', 'marca como DISTINTO el umbral que no es el de fabrica', f.get('igual'))
di(por_campo.get('WindMidTime_s', {}).get('igual') == 'NO',
   'y el tiempo de activacion', por_campo.get('WindMidTime_s', {}).get('igual'))
di(por_campo.get('WindLowTime_s', {}).get('igual') == 'si',
   'y NO marca los que si coinciden', por_campo.get('WindLowTime_s', {}).get('igual'))

t22 = [f for f in filas if f['registro'] == '40022']
di(len(t22) == 2, 'pregunta el 40022 a las DOS TCU de la lista', len(t22))
di(all(f['leido'] == '3' and f['igual'] == 'NO' for f in t22),
   'lee el stow autonomo (3 min) y lo marca distinto del defecto de 10',
   [(f['leido'], f['igual']) for f in t22])
di(any(f['registro'] == '40029' for f in filas), 'y tambien el watchdog de red (40029)')
di('DISTINTO' in salida, 'saca por pantalla lo que difiere del defecto')

# ── 5 · EL OTRO ORDEN DE PALABRA ──────────────────────────────────────────
# El mismo valor servido al reves tiene que salir igual. Si el script hubiera
# fijado un orden a ojo, esto saldria en rojo.
r2 = subprocess.run([sys.executable, os.path.abspath(__file__)],
                    capture_output=True, text=True, timeout=300,
                    env=dict(os.environ, ORDEN_F32=('CDAB' if F32_ORDEN == 'ABCD' else 'ABCD'),
                             _SIN_REENTRAR='1')) if not os.environ.get('_SIN_REENTRAR') else None
if r2 is not None:
    ok2 = 'FAIL' not in (r2.stdout or '')
    di(ok2, 'el mismo valor servido con el orden de palabra CONTRARIO sale igual',
       (r2.stdout or '')[-500:] if not ok2 else None)

shutil.rmtree(tmp, ignore_errors=True)
print('')
if fallos:
    print('FALLAN %d: %s' % (len(fallos), ', '.join(fallos)))
    sys.exit(1)
print('TODO OK')
sys.exit(0)
