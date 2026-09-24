"""Extrae el Excel de mapa Modbus de la NCU de P4Q a JSON, para tools/gen_modbus_map.mjs.

P4Q entrega el mismo tipo de documento que Sunner pero con OTRA forma, y por eso no vale
tools/extract_modbus_xlsx.py:

  · cada hoja empieza con sus PARAMETROS DE BLOQUE en texto («TCUs Data start register 30500»,
    «TCU registers qty 22», «TCU slave address (1…200)»). Son la base, el paso y cuantas
    unidades tiene el bloque: lo que Sunner solo da en una hoja «Overview» aparte, aqui va
    pegado a la tabla que describe. Se extraen, porque son lo que permite calcular la
    direccion de la TCU 137 sin escribir nada a mano;
  · la columna de offset no lleva rotulo: es la que esta justo antes de «Register access»;
  · la cabecera no esta en la misma fila en todas las hojas (1, 4 o 7);
  · la hoja «RW variables» no tiene columna de nombre y ademas mezcla DOS formatos: tablas
    normales y MATRICES DE BITS, donde las columnas son los bits 15..0 y cada celda dice a que
    grupo manda ese bit. Se transcriben las dos: la matriz sale como registro padre + un bit
    por grupo, que es como lo enseña la herramienta;
  · trae una hoja «Changelog» con lo que cambio en cada revision del documento (revP..revT).
    Eso no se tira: es el equivalente a comparar dos revisiones, ya hecho por el fabricante.

Como en el extractor de Sunner, a lo que el documento describe sin bautizar se le sintetiza un
nombre y va marcado con `nombre_doc: false`. Nada se inventa y nada con contenido se tira.

uso:
  python3 tools/extract_modbus_p4q.py --xlsx AUX1-S20015_revT_NCU_Modbus_map.xlsx \
      --clave p4q_revT --out tools/modbus_src/p4q_ncu_revT.json
"""
import argparse, openpyxl, json, re

EXTRACTOR = 2

def norm(s):
    return re.sub(r'\s+', ' ', str(s)).strip().lower() if s is not None else ''

def txt(v):
    return re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''

def ultima_fila(ws, tope=5000):
    """openpyxl declara 1.048.546 filas en la hoja «(Extended)» porque alguien toco el formato
       de toda una columna. Recorrer eso es un minuto de reloj y cero datos."""
    ult = 0
    for r in range(1, min(ws.max_row, tope) + 1):
        if any(ws.cell(r, c).value not in (None, '') for c in range(1, min(ws.max_column, 20) + 1)):
            ult = r
    return ult

def cabecera(ws, tope=30):
    """Fila y columnas de la cabecera, localizada por la celda «Variable name» como en el
       extractor de Sunner. Devuelve tambien la columna de offset: la anterior a «Register
       access», que en este documento no lleva rotulo."""
    for r in range(1, min(ws.max_row, tope) + 1):
        for c in range(1, min(ws.max_column, 20) + 1):
            if norm(ws.cell(r, c).value) == 'variable name':
                cols = {}
                for c2 in range(1, min(ws.max_column, 20) + 1):
                    k = norm(ws.cell(r, c2).value)
                    if k: cols[k] = c2
                if 'register access' in cols and cols['register access'] > 1:
                    cols['offset'] = cols['register access'] - 1
                return r, cols
    return None, None

ACCESOS = {'r', 'rw', 'w', 'rwp'}

def params(ws, hasta):
    """Los parametros de bloque: «etiqueta | numero» en las dos primeras columnas. Se buscan en
       TODA la hoja y no solo por encima de la cabecera, porque «Local Sensors» trae un segundo
       bloque a media hoja con los suyos.

       Cuidado con la hoja «NCU info», que empieza directamente en la cabecera: alli las filas
       de registro son «R | 30002 | …», o sea tambien texto-mas-numero. Se distinguen por dos
       cosas: su primera celda es una clase de acceso, y llevan datos en las columnas de la
       derecha (tipo, nombre). Un parametro solo tiene etiqueta, numero y como mucho una nota."""
    out = []
    for r in range(1, hasta + 1):
        a, b = ws.cell(r, 1).value, ws.cell(r, 2).value
        if not (isinstance(a, str) and a.strip() and isinstance(b, (int, float))): continue
        if norm(a) in ACCESOS: continue
        if any(ws.cell(r, c).value not in (None, '') for c in range(5, min(ws.max_column, 20) + 1)): continue
        out.append({'clave': txt(a), 'valor': int(b), 'nota': txt(ws.cell(r, 4).value), 'fila': r})
    return out

def fila_registro(ws, r, cols):
    g = lambda k: ws.cell(r, cols[k]).value if k in cols else None
    return {
        'offset':  g('offset') if isinstance(g('offset'), (int, float)) else None,
        'addr':    g('register address'),
        'acc':     txt(g('register access')),
        'bits':    txt(g('(msb..lsb)')),
        'tipo':    txt(g('type')),
        'nombre':  txt(g('variable name')),
        'desc':    txt(g('variable description')),
        'rango':   txt(g('range')),
        'unidad':  txt(g('unit')),
    }

def extrae_hoja(ws):
    hdr, cols = cabecera(ws)
    if not hdr: return None
    ult = ultima_fila(ws)
    filas = []
    for r in range(hdr + 1, ult + 1):
        # en «Local Sensors» hay un segundo bloque con su propia cabecera y sus parametros
        if norm(ws.cell(r, cols.get('register access', 1)).value) == 'register access': continue
        f = fila_registro(ws, r, cols)
        if not isinstance(f['addr'], (int, float)): continue
        f['addr'] = int(f['addr'])
        if not f['nombre']:
            f['nombre'] = (re.sub(r'[^A-Za-z0-9]+', '_', f['desc']).strip('_')[:40] or 'reg') + '_' + str(f['addr'])
            f['nombre_doc'] = False
        filas.append(f)
    return {'params': params(ws, ult), 'cabecera': hdr, 'filas': filas}

BIT_COL = re.compile(r'^(1[0-5]|[0-9])$')

def extrae_rw(ws):
    """«RW variables»: tablas normales y matrices de bits, con titulos de seccion por encima.
       La matriz se transcribe como registro padre (16 bits) + un bit por grupo."""
    ult = ultima_fila(ws)
    filas, titulo, modo, bitcols, cols = [], '', None, {}, {}
    for r in range(1, ult + 1):
        v = [ws.cell(r, c).value for c in range(1, 20)]
        llenas = [i for i, x in enumerate(v) if x not in (None, '')]
        if not llenas: continue
        if len(llenas) == 1 and llenas[0] == 0 and not norm(v[0]).startswith('register access'):
            titulo = txt(v[0]); continue                       # titulo de seccion
        if norm(v[0]) == 'register access':                    # cabecera: dice de que tipo es
            bitcols = {c: int(txt(v[c])) for c in range(3, 19) if BIT_COL.match(txt(v[c]))}
            modo = 'matriz' if bitcols else 'tabla'
            cols = {norm(x): i for i, x in enumerate(v) if x not in (None, '')}
            continue
        acc = txt(v[0])
        if acc not in ('R', 'RW', 'W'): continue
        addr = v[2] if isinstance(v[2], (int, float)) else None
        if addr is None: continue
        etiqueta = txt(v[1])
        if modo == 'matriz':
            """Cada celda de la matriz dice a QUE GRUPO manda ese bit. El registro entero es el
               padre; los bits, sus subvariables, con el nombre del grupo que el documento pone."""
            hijos = [{'bit': b, 'desc': txt(v[c])} for c, b in bitcols.items() if txt(v[c])]
            if not hijos: continue
            filas.append({'seccion': titulo, 'acc': acc, 'addr': int(addr), 'etiqueta': etiqueta,
                          'tipo': 'U16', 'bits': '(15..0)', 'matriz': hijos})
        else:
            filas.append({'seccion': titulo, 'acc': acc, 'addr': int(addr), 'etiqueta': etiqueta,
                          'bits': txt(v[cols.get('(msb..lsb)', 3)]), 'tipo': txt(v[cols.get('type', 4)]),
                          'rango': txt(v[cols.get('range', 5)]) if 'range' in cols else '',
                          'desc': txt(v[cols.get('description', 5)]) if 'description' in cols else ''})
    return filas

def extrae_changelog(ws):
    """Lo que el fabricante dice que cambio en cada revision. Es su propio diff entre versiones
       del documento: no hay que deducirlo."""
    ult = ultima_fila(ws)
    revs, cur = [], None
    for r in range(1, ult + 1):
        v = [txt(ws.cell(r, c).value) for c in range(1, 9)]
        if re.match(r'^rev[A-Z]$', v[0]):
            cur = {'rev': v[0], 'cambios': []}; revs.append(cur)
        if not cur: continue
        if v[1] in ('Added', 'Modified', 'Removed', 'Deleted'):
            cur['cambios'].append({'que': v[1], 'acc': v[2], 'addr': v[3], 'bits': v[4],
                                   'tipo': v[5], 'nombre': v[6], 'desc': v[7]})
    return revs

def arranca(argv=None):
    ap = argparse.ArgumentParser(description='Extrae el Excel de mapa Modbus de P4Q a JSON.')
    ap.add_argument('--xlsx', required=True)
    ap.add_argument('--clave', required=True, help='clave del documento en el JSON (p4q_revT…)')
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    wb = openpyxl.load_workbook(a.xlsx, data_only=True)
    doc, fuera = {}, {}
    for ws in wb.worksheets:
        if ws.title == 'Changelog':
            fuera['changelog'] = extrae_changelog(ws)
            print(f"  changelog: {len(fuera['changelog'])} revisiones")
            continue
        if ws.title == 'RW variables':
            fuera['rw'] = extrae_rw(ws)
            mat = sum(1 for f in fuera['rw'] if 'matriz' in f)
            print(f"  RW variables: {len(fuera['rw'])} registros ({mat} en matriz de bits)")
            continue
        h = extrae_hoja(ws)
        if not h:
            print(f"  {ws.title}: SIN cabecera «Variable name» (no es hoja de registros)"); continue
        doc[ws.title] = h
        print(f"  {ws.title}: {len(h['filas'])} filas · {len(h['params'])} parámetros de bloque")
    out = {a.clave: doc, 'extractor': EXTRACTOR}
    out.update(fuera)
    json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print('\nescrito ' + a.out)

if __name__ == '__main__':
    arranca()
