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

def extrae(ws):
    """Localiza la fila de cabecera por la celda 'Variable name' y mapea columnas por su rótulo.
       Las hojas del R7 tienen distinto número de columnas de relleno a la izquierda, así que
       fijar índices a mano se rompe en cuanto cambia una."""
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
    for r in range(hdr+1, ws.max_row+1):
        g=lambda k: ws.cell(r,cols[k]).value if k in cols else None
        nombre=g('variable name')
        if nombre is None or str(nombre).strip()=='': continue
        filas.append({
            'addr':   g('register address'),
            'offset': g('offset'),
            'acc':    (str(g('register access')).strip() if g('register access') is not None else ''),
            'bits':   (str(g('(msb..lsb)')).strip() if g('(msb..lsb)') is not None else ''),
            'tipo':   (str(g('type')).strip() if g('type') is not None else ''),
            'nombre': str(nombre).strip(),
            'desc':   re.sub(r'\s+',' ',str(g('variable description'))).strip() if g('variable description') is not None else '',
            'rango':  str(g('range')).strip() if g('range') is not None else '',
            'unidad': str(g('unit')).strip() if g('unit') is not None else '',
            'defecto':str(g('default value')).strip() if g('default value') is not None else '',
        })
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

    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print('\nescrito ' + a.out)

if __name__ == '__main__':
    arranca()
