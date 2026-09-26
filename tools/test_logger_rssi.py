#!/usr/bin/env python3
"""Prueba el zigbee_logger.ps1 canónico (schema v2) contra un ConnectPort falso."""
import csv, os, re, shutil, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer

AQUI=os.path.dirname(os.path.abspath(__file__))
RAIZ=os.path.dirname(AQUI)
PWSH=os.environ.get("PWSH","pwsh")
PS1_DIR=os.environ.get("PS1_DIR") or RAIZ
fallos=[]; n=0

def di(ok, texto, extra=None):
    global n
    n+=1
    if not ok: fallos.append(texto)
    print("  %s %s%s" % ("OK   " if ok else "FALLO", texto,
          "" if ok or extra is None else " -> %s" % (extra,)))

CENSO="""<rci_reply version="1.1"><do_command target="zigbee"><discover>
 <device><ext_addr>00:13:a2:00:41:5c:9e:01!</ext_addr><node_id>TCU_01</node_id><net_addr>0x1a2b</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:02!</ext_addr><node_id>TCU_02</node_id><net_addr>0x3c4d</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:03!</ext_addr><node_id>HSU_01</node_id><net_addr>0x5e6f</net_addr><device_type>0x120000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:00!</ext_addr><node_id>COORD</node_id><net_addr>0x0000</net_addr><device_type>0x100000</device_type><type>0</type></device>
</discover></do_command></rci_reply>"""
RADIO_01="""<rci_reply version="1.1"><do_command target="zigbee"><query_state><radio><rssi>61</rssi><ack_failures>3</ack_failures><supply_voltage>3280</supply_voltage><temperature>41</temperature><net_addr>0x1a2b</net_addr></radio></query_state></do_command></rci_reply>"""
RADIO_03="""<rci_reply version="1.1"><do_command target="zigbee"><query_state><radio><rssi>84</rssi><ack_failures>12</ack_failures><supply_voltage>3190</supply_voltage><temperature>44</temperature><net_addr>0x5e6f</net_addr></radio></query_state></do_command></rci_reply>"""
CARGA="""<rci_reply version="1.1"><query_state><device_stats><cpu>37</cpu><total_memory>16777216</total_memory><used_memory>9437184</used_memory><uptime>259200</uptime></device_stats></query_state></rci_reply>"""

class GW(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get("Content-Length",0))).decode("utf-8","replace")
        m=re.search(r'addr="([^"]+)"',body)
        if "discover" in body: out=CENSO
        elif "device_stats" in body or ("query_state" in body and not m): out=CARGA
        elif m:
            a=m.group(1)
            time.sleep(1.15)  # separa sellos y hace visible la latencia por fila
            if a.endswith(":01!"): out=RADIO_01
            elif a.endswith(":03!"): out=RADIO_03
            else:
                self.send_error(500,"node did not answer")
                return
        else:
            self.send_error(500); return
        b=out.encode()
        self.send_response(200); self.send_header("Content-Type","text/xml")
        self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)

MUTACIONES={
 "signo":(r"\$rssi\s*=\s*-\[int\]\$radio\.rssi","$rssi = [int]$radio.rssi"),
 "rol":(r'"0x120000" \{ return "HSU" \}', '"0x120000" { return "TCU" }'),
 "filtro":(r'Where-Object \{ \$_\.type -eq "1" \}', 'Where-Object { $true }'),
 "caido":(r'\$online = 0; \$motivo = "timeout_nodo"', '$online = 1; $motivo = "timeout_nodo"'),
 "carga":(r'\$gwrow\.cpu_pct = \$c\.cpu', '$gwrow.cpu_pct = $null'),
 "sello":(r'function Utc-Now \\{\\s*return \\[DateTime\\]::UtcNow\\.ToString\\("yyyy-MM-ddTHH:mm:ssZ", \\$Invariant\\)\\s*\\}',
          'function Utc-Now { return "2026-01-01T00:00:00Z" }'),
}
MUTA=os.environ.get("MUTA")
if MUTA and MUTA not in MUTACIONES:
    print("mutacion desconocida: "+", ".join(MUTACIONES)); sys.exit(2)
if shutil.which(PWSH) is None:
    print("No hay pwsh: no se puede comprobar el .ps1 real"); sys.exit(2)

srv=HTTPServer(("127.0.0.1",0),GW)
threading.Thread(target=srv.serve_forever,daemon=True).start()
port=srv.server_address[1]

src=os.path.join(PS1_DIR,"zigbee_logger.ps1")
txt=open(src,encoding="utf-8").read()
txt,c=re.subn(r"\$Gateways = @\([\s\S]*?\n\)",
              '$Gateways = @(\n  @{ Name = "GW-01"; Host = "127.0.0.1:%d"; User = ""; Pass = "" }\n)'%port,
              txt,count=1)
if c!=1: print("no casa el bloque $Gateways"); sys.exit(2)
# acelera el final de ciclo sin tocar la lógica de sondeo
txt=txt.replace("$IntervalSec       = 600","$IntervalSec       = 30")
if MUTA:
    pat,rep=MUTACIONES[MUTA]
    txt,c=re.subn(pat,lambda m:rep,txt,count=1)
    if c!=1: print("mutacion %s no casa"%MUTA); sys.exit(2)
    print("### MUTACION %s PUESTA"%MUTA)

tmp=tempfile.mkdtemp()
ruta=os.path.join(tmp,"zigbee_logger.ps1")
open(ruta,"w",encoding="utf-8").write(txt)
csvp=os.path.join(tmp,"zigbee_log.csv")
gwp=os.path.join(tmp,"gateway_stats.csv")
cen=os.path.join(tmp,"censo_campania.csv")

# un v1 vivo debe rotarse al primer write v2
open(csvp,"w",encoding="utf-8").write("timestamp,gateway,node_id,online,rssi_dbm\n2026-09-26 10:00:00,GW-01,X,1,-70\n")
# un fichero v2 de AYER debe rotarse por fecha
gw_header="schema_version,timestamp,ciclo_id,gateway,host,ok,cpu_pct,mem_total_b,mem_usada_b,mem_libre_b,uptime_s\n"
open(gwp,"w",encoding="utf-8").write(gw_header)
old=time.time()-86400*2
os.utime(gwp,(old,old))

def filas(p):
    if not os.path.exists(p): return []
    try: return list(csv.DictReader(open(p,encoding="utf-8-sig")))
    except Exception: return []

outp=os.path.join(tmp,"out.txt")
with open(outp,"wb") as fo:
    p=subprocess.Popen([PWSH,"-NoProfile","-ExecutionPolicy","Bypass","-File",ruta],
                       stdout=fo,stderr=subprocess.STDOUT,cwd=tmp)
    limit=time.time()+90
    while time.time()<limit:
        if p.poll() is not None: break
        if len(filas(csvp))>=3 and len(filas(gwp))>=1 and len(filas(cen))>=3:
            time.sleep(.3); break
        time.sleep(.15)
    if p.poll() is None:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill(); p.wait(timeout=5)
salida=open(outp,encoding="utf-8",errors="replace").read()

ff=filas(csvp); gg=filas(gwp); cc=filas(cen)
di(len(ff)==3,"una fila v2 por router, incluido el que falla",len(ff))
by={x.get("node_id"):x for x in ff}
di(sorted(by)==["HSU_01","TCU_01","TCU_02"],"filtra el coordinador",sorted(by))
di(all(x.get("schema_version")=="2" for x in ff),"schema_version=2")
di(all(re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$",x.get("timestamp","")) for x in ff),
   "UTC ISO-8601 Z por fila",[x.get("timestamp") for x in ff])
di(len({x["timestamp"] for x in ff})>=2,"el sello es por fila, no uno fijo por ciclo",[x["timestamp"] for x in ff])
di(all(x.get("ciclo_id")=="0" for x in ff),"ciclo_id compartido por la vuelta")
di(all(int(x.get("latencia_ms") or 0)>=1000 for x in ff),"latencia por nodo medida", [x.get("latencia_ms") for x in ff])
di(all(x.get("tz_pc_min") not in (None,"") for x in ff),"audita el offset del PC")

di(by["TCU_01"]["rssi_dbm"]=="-61","RSSI con signo correcto",by["TCU_01"]["rssi_dbm"])
di(by["HSU_01"]["role"]=="HSU","device_type HSU se conserva",by["HSU_01"]["role"])
di(by["TCU_01"]["motivo"]=="ok" and by["TCU_01"]["online"]=="1","nodo bueno: ok/online")
di(by["TCU_02"]["online"]=="0" and by["TCU_02"]["motivo"]=="http_error",
   "fallo de nodo no se confunde con gateway caído",(by["TCU_02"]["online"],by["TCU_02"]["motivo"]))
di(by["TCU_01"]["ack_failures"]=="3" and by["TCU_01"]["supply_mv"]=="3280","telemetría de radio")

di(len(gg)==1 and gg[0].get("schema_version")=="2","gateway_stats también v2",gg)
di(gg and gg[0].get("cpu_pct")=="37","CPU del gateway",gg[0].get("cpu_pct") if gg else None)
di(len(cc)==3 and all(x.get("origen")=="discover" for x in cc),"censo acumulativo escrito",len(cc))
di(any(".schema-old." in x and x.endswith(".csv") for x in os.listdir(tmp)),
   "rota automáticamente un CSV de esquema antiguo",os.listdir(tmp))
di(any(re.match(r"gateway_stats\.\d{8}\.csv$",x) for x in os.listdir(tmp)),
   "rota automáticamente el día anterior",os.listdir(tmp))

srv.shutdown()
print("\n%d comprobaciones, %d fallos"%(n,len(fallos)))
if MUTA: print("### %s: mutacion %s %s"%("bien" if fallos else "MAL",MUTA,"roja" if fallos else "paso"))
sys.exit(1 if fallos else 0)
