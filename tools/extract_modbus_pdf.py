import pdfplumber, json, re, collections
p=pdfplumber.open('/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/54198316-SUNNER_TCU_ModbusMap_v6_1.pdf')
filas=[]; cols=None
def limpia(s):
    t=re.sub(r'\s+',' ',(s or '').replace('\n',' ')).strip()
    # pdfplumber separa la mayuscula inicial de algunas celdas: "A larm register 1", "M otor's PWM"
    return re.sub(r'\b([A-Z]) ([a-z]{2,})', lambda m: m.group(1)+m.group(2), t)
for pg in p.pages:
    for tb in pg.extract_tables():
        for row in tb:
            cel=[limpia(c) for c in row]
            if not any(cel): continue
            if cel and cel[0].lower()=='address':
                cols={}
                for i,c in enumerate(cel):
                    if c: cols[c.lower()]=i
                continue
            if not cols or not re.match(r'^\d{4,5}$', cel[0]): continue
            g=lambda k: (cel[cols[k]] if k in cols and cols[k]<len(cel) else '')
            filas.append({'addr':int(cel[0]),'cat':g('category'),'tipo':g('data type'),
                'nbits':g('bit quantity'),'bits':g('bits'),'desc':g('description'),
                'unidad':g('unit'),'escala':g('scale'),'defecto':g('default value'),'rango':g('range')})
json.dump(filas,open('/tmp/tcu_pdf.json','w'),ensure_ascii=False,indent=1)
print('filas:', len(filas), '| con unidad/escala:', len([f for f in filas if f['unidad'] or f['escala']]))
print()
print('-- 40000..40005 --')
for f in filas:
    if 40000 <= f['addr'] <= 40005:
        print('%5d %6s %4s | u=%-12s esc=%-6s def=%-6s | %s' % (f['addr'], f['bits'], f['tipo'], repr(f['unidad']), repr(f['escala']), repr(f['defecto']), f['desc'][:58]))
print()
print('-- escalas --', dict(collections.Counter(f['escala'] for f in filas if f['escala'])))
print('-- unidades --', dict(collections.Counter(f['unidad'] for f in filas if f['unidad'])))
