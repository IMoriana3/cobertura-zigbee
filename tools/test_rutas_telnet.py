#!/usr/bin/env python3
"""Prueba el zigbee_routes_logger.ps1 v2 contra HTTP+telnet falsos."""
import csv, os, re, shutil, socket, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer

AQUI=os.path.dirname(os.path.abspath(__file__))
RAIZ=os.path.dirname(AQUI)
PWSH=os.environ.get("PWSH","pwsh")
PS1_DIR=os.environ.get("PS1_DIR") or RAIZ
fallos=[]; n=0; visto={"usuario":None,"clave":None,"iac":[]}

def di(ok,texto,extra=None):
    global n
    n+=1
    if not ok: fallos.append(texto)
    print("  %s %s%s"%("OK   " if ok else "FALLO",texto,
          "" if ok or extra is None else " -> %s"%(extra,)))

CENSO="""<rci_reply version="1.1"><do_command target="zigbee"><discover>
 <device><ext_addr>00:13:a2:00:41:5c:9e:01!</ext_addr><node_id>TCU_01</node_id><net_addr>0x1a2b</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:02!</ext_addr><node_id>TCU_02</node_id><net_addr>0x3c4d</net_addr><device_type>0x170000</device_type><type>1</type></device>
 <device><ext_addr>00:13:a2:00:41:5c:9e:03!</ext_addr><node_id>HSU_01</node_id><net_addr>0x5e6f</net_addr><device_type>0x120000</device_type><type>1</type></device>
</discover></do_command></rci_reply>"""

class GW(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length",0)))
        b=CENSO.encode()
        self.send_response(200); self.send_header("Content-Type","text/xml")
        self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)

def recv_line(c):
    out=bytearray()
    while True:
        b=c.recv(1)
        if not b: return bytes(out)
        if b==b"\xff":
            rest=c.recv(2)
            if len(rest)==2: visto["iac"].append((255,rest[0],rest[1]))
            continue
        out+=b
        if b==b"\n": return bytes(out)

def telnetd(sock):
    c,_=sock.accept()
    c.settimeout(20)
    try:
        c.sendall(bytes([255,253,1])+b"login: ")
        visto["usuario"]=recv_line(c).decode(errors="replace").strip()
        c.sendall(b"password: ")
        visto["clave"]=recv_line(c).decode(errors="replace").strip()
        c.sendall(b"#>")
        for _ in range(3):
            cmd=recv_line(c).decode(errors="replace").strip()
            time.sleep(1.05)
            if cmd.endswith("9e:01!"):
                body="    [0000]!\r\nTCU_01 [1a2b]!\r\n#>"
            elif cmd.endswith("9e:02!"):
                body="    [0000]!\r\nTCU_01 [1a2b]!\r\nTCU_02 [3c4d]!\r\n#>"
            else:
                body="No source route\r\n#>"
            c.sendall(body.encode())
    except (OSError,socket.timeout):
        pass
    finally:
        try: c.close()
        except OSError: pass

MUTACIONES={
 "saltos":(r"\$hop\s*=\s*\$p\.addrs\.Count - 1","$hop = $p.addrs.Count"),
 "coord":(r'\$nid = "COORD"','$nid = "?"'),
 "iac":(r"if \(\$b -eq 255\) \{","if ($false) {"),
 "separador":(r'\$ids = \$p\.ids -join ">"','$ids = $p.ids -join ","'),
 "puerto":(r'\$hostOnly = \("\$\(\$GW\.Host\)" -split ':'\)\[0\]',
           '$hostOnly = "$($GW.Host)"'),
}
MUTA=os.environ.get("MUTA")
if MUTA and MUTA not in MUTACIONES:
    print("mutacion desconocida: "+", ".join(MUTACIONES)); sys.exit(2)
if shutil.which(PWSH) is None:
    print("No hay pwsh: no se puede comprobar el .ps1 real"); sys.exit(2)

srv=HTTPServer(("127.0.0.1",0),GW)
threading.Thread(target=srv.serve_forever,daemon=True).start()
p_http=srv.server_address[1]
tel=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
tel.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
tel.bind(("127.0.0.1",0)); tel.listen(1)
p_tel=tel.getsockname()[1]
threading.Thread(target=telnetd,args=(tel,),daemon=True).start()

src=os.path.join(PS1_DIR,"zigbee_routes_logger.ps1")
txt=open(src,encoding="utf-8").read()
block='$Gateways = @(\n  @{ Name = "GW-BAD"; Host = "127.0.0.1:1"; User = "root"; Pass = "dbps"; TelnetPort = %d }\n  @{ Name = "GW-01"; Host = "127.0.0.1:%d"; User = "root"; Pass = "dbps"; TelnetPort = %d }\n)'%(p_tel,p_http,p_tel)
txt,c=re.subn(r"\$Gateways = @\([\s\S]*?\n\)",block,txt,count=1)
if c!=1: print("no casa el bloque $Gateways"); sys.exit(2)
txt=txt.replace("$IntervalSec        = 300","$IntervalSec        = 30")
if MUTA:
    pat,rep=MUTACIONES[MUTA]
    txt,c=re.subn(pat,lambda m:rep,txt,count=1)
    if c!=1: print("mutacion %s no casa"%MUTA); sys.exit(2)
    print("### MUTACION %s PUESTA"%MUTA)

tmp=tempfile.mkdtemp()
ruta=os.path.join(tmp,"zigbee_routes_logger.ps1")
open(ruta,"w",encoding="utf-8").write(txt)
csvp=os.path.join(tmp,"zigbee_routes.csv")

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
        if len(filas(csvp))>=3:
            time.sleep(.4); break
        time.sleep(.15)
    if p.poll() is None:
        p.terminate()
        try:p.wait(timeout=5)
        except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
salida=open(outp,encoding="utf-8",errors="replace").read()
ff=filas(csvp)

di("GW-BAD" in salida and "sin censo" in salida,
   "un gateway caído no impide llegar al siguiente",salida[-600:])
di(visto["usuario"]=="root" and visto["clave"]=="dbps","login telnet usa credenciales locales",(visto["usuario"],visto["clave"]))
di(any(x[1:]==(252,1) for x in visto["iac"]),"negociación IAC DO ECHO -> WONT",visto["iac"])

di(len(ff)==3,"una fila por nodo, incluida la ruta fallida",len(ff))
by={x.get("target_ext"):x for x in ff}
di(len(by)==3,"las tres ext_addr quedan trazadas",sorted(by))
di(all(x.get("schema_version")=="2" for x in ff),"schema_version=2")
di(all(re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$",x.get("timestamp","")) for x in ff),
   "UTC ISO-8601 Z por consulta",[x.get("timestamp") for x in ff])
di(all(x.get("ciclo_id")=="0" for x in ff),"ciclo_id compartido")
di(all(int(x.get("latencia_ms") or 0)>=900 for x in ff),"latencia por consulta", [x.get("latencia_ms") for x in ff])

a=by["00:13:a2:00:41:5c:9e:01!"]; b=by["00:13:a2:00:41:5c:9e:02!"]; c=by["00:13:a2:00:41:5c:9e:03!"]
di(a.get("ok")=="1" and a.get("hop_count")=="1","COORD->TCU son 1 salto",(a.get("ok"),a.get("hop_count")))
di(b.get("ok")=="1" and b.get("hop_count")=="2","ruta de tres nodos son 2 saltos",b.get("hop_count"))
di(a.get("path_ids")=="COORD>TCU_01","path_ids conserva COORD y separador >",a.get("path_ids"))
di(b.get("path_addrs")=="0000>1a2b>3c4d","path_addrs conserva la cadena",b.get("path_addrs"))
di(a.get("path_ext")=="COORD>00:13:a2:00:41:5c:9e:01!","resuelve path_ext con el discover",a.get("path_ext"))
di(b.get("path_ext")=="COORD>00:13:a2:00:41:5c:9e:01!>00:13:a2:00:41:5c:9e:02!",
   "path_ext completo en dos saltos",b.get("path_ext"))
di(c.get("ok")=="0" and c.get("motivo")=="sin_ruta","sin ruta deja fila explícita",(c.get("ok"),c.get("motivo")))

srv.shutdown()
try: tel.close()
except OSError: pass
print("\n%d comprobaciones, %d fallos"%(n,len(fallos)))
if MUTA: print("### %s: mutacion %s %s"%("bien" if fallos else "MAL",MUTA,"roja" if fallos else "paso"))
sys.exit(1 if fallos else 0)
