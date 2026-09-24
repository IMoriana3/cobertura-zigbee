"""Extrae un Excel de mapa Modbus del fabricante a JSON, para tools/gen_modbus_map.mjs.

Las rutas van por ARGUMENTOS: el documento no vive en el repo (llega por correo o por
la carpeta de subidas de la sesion) y cada revision es un fichero distinto. Antes
estaban escritas dentro, apuntando a la carpeta temporal de la sesion en que se hizo
la del R7: nadie podia repetir la extraccion, que es justo lo que hizo falta al llegar
el R8.

uso:
  # NCU R8 (solo el Excel de la NCU)
  python3 tools/extract_modbus_xlsx.py --ncu NCU_Modbus_Map_R8.xlsx \
      --clave ncu_r8 --out tools/modbus_src/ncu_r8.json

  # NCU R7 + HSU R23 en un mismo JSON (como se genero el fichero historico)
  python3 tools/extract_modbus_xlsx.py --ncu NCU_Modbus_Map_R7.xlsx --clave ncu_r7 \
      --hsu 250506_HSU_Modbus_Map_R23.xlsx --clave-hsu hsu_r23 \
      --out tools/modbus_src/ncu_r7_hsu_r23.json

El reparto del espacio de direcciones (hoja «Overview») sale aparte, con la clave
bloques_<revision>: no es una tabla de registros.
"""
import argparse, openpyxl, json, re, sys

def norm(s):
    return re.sub(r'\s+',' ',str(s)).strip().lower() if s is not None else ''

EXTRACTOR = 2   # v2: deja de tirar las filas sin «Variable name» (ver extrae)

def extrae(ws):
    """Localiza la fila de cabecera por la celda 'Variable name' y mapea columnas por su rótulo.
       Las hojas del R7 tienen distinto número de columnas de relleno a la izquierda, así que
       fijar índices a mano se rompe en cuanto cambia una.

       v2 — LAS FILAS SIN NOMBRE YA NO SE TIRAN. La v1 saltaba toda fila cuya celda «Variable
       name» estuviera vacía, y el documento las usa para tres cosas distintas:

         · subvariables que el fabricante dejó sin bautizar pero SÍ describe. En el R8 son
           cuatro, todas en «TCU Compat»: «Magnet Presence» y «BLE Enabled» del MSR (30501), y
           la preservación de batería y el «SoC insuficiente para mover el motor» de FlagsA
           (30504). Cuatro banderas de estado reales que no llegaban a la herramienta;
         · bits marcados «Reserved», que también son dato: dicen que ese bit está declarado y
           vacío, no que nadie lo haya mirado;
         · epígrafes de sección, filas fusionadas con el título del bloque que viene debajo
           («Change Safe Position 7 (Custom) target angle»). Son el contexto de los registros
           que los siguen.

       Nada de esto se inventa: a la subvariable sin nombre se le sintetiza uno a partir del
       registro padre y su bit (MSR_s1.b11), y va marcada con `nombre_doc: false` para que
       nadie lo confunda con un nombre del fabricante. El epígrafe sale como `{'epigrafe': …}`.
    """
    hdr=None
    for r in range(1, min(ws.max_row,15)+1):
        for c in range(1, min(ws.max_column,20)+1):
            if norm(ws.cell(r,c).value)=='variable name':
                hdr=r; break
        if hdr: break
    if not hdr: return None,None
    cols={}
    for c in range(1, min(ws.max_column,20)+1):
        k=norm(ws.cell(hdr,c).value)
        if k: cols[k]=c
    filas=[]
    padre=None                      # último registro con nombre: del que cuelgan los bits sin nombre
    for r in range(hdr+1, ws.max_row+1):
        g=lambda k: ws.cell(r,cols[k]).value if k in cols else None
        txt=lambda k: re.sub(r'\s+',' ',str(g(k))).strip() if g(k) is not None else ''
        nombre=g('variable name')
        bits=txt('(msb..lsb)')
        desc=txt('variable description')
        addr=g('register address')
        sin_nombre = nombre is None or str(nombre).strip()==''
        if sin_nombre:
            """Una fila con TEXTO en la columna de dirección y nada más es un epígrafe de
               sección (celda fusionada), no un registro: se guarda como tal."""
            if isinstance(addr,str) and addr.strip() and not bits and not desc:
                filas.append({'epigrafe': re.sub(r'\s+',' ',addr).strip()})
                continue
            if not bits and not desc and (addr is None or str(addr).strip()==''):
                continue                                  # fila de relleno: no hay nada que guardar
            tieneDir = addr is not None and str(addr).strip()!='' and not isinstance(addr,str)
            if tieneDir:
                """Fila con DIRECCION propia y sin nombre: es un registro entero que el documento
                   declara y deja vacío (30515, 30517, 50034 en el R8, los tres «Reserved»). No es
                   un bit del registro de arriba, y colgárselo como tal sería inventar."""
                nombre=(re.sub(r'[^A-Za-z0-9]+','_',desc).strip('_') or 'reg')+'_'+str(int(addr))
            else:
                m=re.match(r'\((\d+)\.\.(\d+)\)', bits or '')
                if m: suf='.b'+m.group(2) if m.group(1)==m.group(2) else '.b'+m.group(2)+'_'+m.group(1)
                else: suf='.r'+str(r)
                nombre=((padre+suf) if padre else ('reg'+suf))
        else:
            nombre=str(nombre).strip()
            if addr is not None and str(addr).strip()!='' and not isinstance(addr,str):
                padre=nombre                              # solo un registro con dirección hace de padre
        f={
            'addr':   addr,
            'offset': g('offset'),
            'acc':    (str(g('register access')).strip() if g('register access') is not None else ''),
            'bits':   bits,
            'tipo':   (str(g('type')).strip() if g('type') is not None else ''),
            'nombre': nombre,
            'desc':   desc,
            'rango':  str(g('range')).strip() if g('range') is not None else '',
            'unidad': str(g('unit')).strip() if g('unit') is not None else '',
            'defecto':str(g('default value')).strip() if g('default value') is not None else '',
        }
        if sin_nombre: f['nombre_doc']=False              # el nombre lo ponemos nosotros, no el documento
        filas.append(f)
    return cols, filas

def extrae_overview(ws):
    """Hoja «Overview» del R7: el reparto COMPLETO del espacio de direcciones, con los bloques
       reservados y los huecos libres. Es lo que permite decir «esta direccion es un hueco
       reservado del bloque» en vez de un «no existe» a secas."""
    bloques=[]
    for r in range(2, ws.max_row+1):
        nom=ws.cell(r,2).value
        a1,a2=ws.cell(r,3).value, ws.cell(r,4).value
        if nom is None or not isinstance(a1,(int,float)) or not isinstance(a2,(int,float)): continue
        if a2 < a1: continue
        b={'nombre':re.sub(r'\s+',' ',str(nom)).strip(),'de':int(a1),'a':int(a2),
           'tam':ws.cell(r,5).value,'unidades':ws.cell(r,6).value}
        l1,l2=ws.cell(r,10).value, ws.cell(r,11).value
        if isinstance(l1,(int,float)) and isinstance(l2,(int,float)) and l2>=l1:
            b['libre']=[int(l1),int(l2)]
        bloques.append(b)
    return bloques

def arranca(argv=None):
    ap = argparse.ArgumentParser(description='Extrae un Excel de mapa Modbus a JSON.')
    ap.add_argument('--ncu', required=True, help='Excel de la NCU (NCU_Modbus_Map_R8.xlsx…)')
    ap.add_argument('--clave', required=True, help='clave del documento en el JSON (ncu_r7, ncu_r8…)')
    ap.add_argument('--hsu', help='Excel del mapa propio de la HSU (opcional)')
    ap.add_argument('--clave-hsu', default='hsu_r23', help='clave del mapa de la HSU en el JSON')
    ap.add_argument('--out', required=True, help='JSON de salida (tools/modbus_src/…)')
    a = ap.parse_args(argv)

    out = {}
    fuentes = [(a.ncu, a.clave)] + ([(a.hsu, a.clave_hsu)] if a.hsu else [])
    for f, lab in fuentes:
        wb = openpyxl.load_workbook(f, data_only=True)
        out[lab] = {}
        for ws in wb.worksheets:
            cols, filas = extrae(ws)
            if filas is None:
                print(f'  {lab}/{ws.title}: SIN cabecera "Variable name" (no es hoja de registros)')
                continue
            out[lab][ws.title] = filas
            print(f'  {lab}/{ws.title}: {len(filas)} filas · columnas {sorted(cols.keys())}')

    # el reparto del espacio de direcciones va aparte: no es una tabla de registros
    wb = openpyxl.load_workbook(a.ncu, data_only=True)
    if 'Overview' in wb.sheetnames:
        # bloques_ncu_r8 -> bloques_r8: la clave lleva la REVISION, no el dispositivo
        rev = a.clave.split('_')[-1]
        out['bloques_' + rev] = extrae_overview(wb['Overview'])
        print(f"  bloques del espacio de direcciones (hoja Overview): {len(out['bloques_' + rev])}")
    else:
        print('  sin hoja «Overview»: este documento no trae el reparto del espacio de direcciones')

    # Version del extractor: el R7 se extrajo con la v1, que tiraba las filas sin nombre. Quien
    # compare dos extracciones tiene que saber si son comparables bit a bit o no.
    out['extractor'] = EXTRACTOR
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print('\nescrito ' + a.out)

if __name__ == '__main__':
    arranca()
