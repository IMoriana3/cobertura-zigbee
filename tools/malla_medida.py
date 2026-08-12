#!/usr/bin/env python3
"""Genera <planta>_real.geojson — la MALLA MEDIDA que dibuja la casilla "📈 Malla medida" del 3D.

Es la verdad de campo contra la que se juzga el mapa simulado, así que aquí no se inventa nada:
lo que no venga en los CSV no se escribe.

    python3 tools/malla_medida.py <planta> nodos.csv enlaces.csv

NODOS.CSV — una fila por equipo que haya reportado:
    id                identificador del equipo (p.ej. TCU_SUNNER_ID_057)
    etiqueta          su nombre en el layout (1.10.4, TK012, NCU 1…)
    role              TCU o COORD (la NCU/coordinador va como COORD)
    ncu, esclavo      NCU y nº de esclavo Modbus                ── con esto basta,
    x, n              o la posición en metros locales de la planta,
    lat, lon          o bien la posición geográfica
    rssi_med_dbm      RSSI medio del nodo, en dBm (negativo)
    padre_dominante   id del equipo por el que enruta casi siempre
    padres_distintos  cuántos padres distintos ha usado
    hop_tipico        saltos hasta el coordinador
    rutas             nº de rutas observadas
    ack_failures      fallos de ACK acumulados
    descendientes     cuántos nodos cuelgan de él
    is_spof           1 si es punto único de fallo (si se cae, deja a otros sin ruta)
    gw                gateway/NCU al que pertenece

ENLACES.CSV — una fila por enlace medido:
    origen, destino   ids de los dos extremos (deben existir en nodos.csv)
    rssi_medido_dbm   RSSI de ESE enlace, en dBm
    distancia_m       distancia entre extremos (opcional: si falta, se calcula)
    freq              canal/frecuencia (opcional)
    nota              lo que haga falta anotar (opcional)

Un volcado del SCADA no habla de nombres del plano: habla de "el esclavo 57 de la NCU 3". Por eso
basta con `ncu` y `esclavo` (y `id`, para poder referirlo en los enlaces): la posición y el nombre
salen del CENSO que ya está en el repo, `cobertura_coords/<planta>/coords_<planta>.csv`, generado
por tools/gen_coords_cobertura.py cruzando el layout con la topología del SCADA. Esas coordenadas
además vienen PROYECTADAS con el CRS de la planta, así que son mejores que convertir x/n aquí.

El script comprueba que cada nodo casa con un equipo del layout y avisa de los que no.
Sin `lat/lon` los convierte desde x/n con el mismo origen que usa el visor.
"""
import csv, json, math, sys, os

MPERLAT = 111320.0
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leer(ruta):
    with open(ruta, newline='', encoding='utf-8-sig') as f:
        return [{k.strip(): (v or '').strip() for k, v in fila.items()} for fila in csv.DictReader(f)]


def num(v, por_defecto=None):
    try:
        return float(v) if '.' in str(v) or 'e' in str(v).lower() else int(v)
    except (TypeError, ValueError):
        return por_defecto


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    planta, fnodos, fenlaces = sys.argv[1], sys.argv[2], sys.argv[3]
    lay = json.load(open(planta + '_layout.json', encoding='utf-8'))
    lat0, lon0 = lay['clat'], lay['clon']
    mperlon = MPERLAT * math.cos(math.radians(lat0))

    # nombres del layout, para avisar de los que no casan
    conocidos = {str(t.get('id')) for t in lay.get('trackers', [])}
    conocidos |= {str(c.get('name')) for c in lay.get('ncus', [])}
    conocidos |= {str(c.get('name')) for c in lay.get('meteo', [])}

    # censo del repo: (NCU, esclavo, rol) -> equipo, para los volcados que vienen por nº de esclavo
    censo, fcenso = {}, os.path.join(RAIZ, 'cobertura_coords', planta, 'coords_%s.csv' % planta)
    if os.path.exists(fcenso):
        for c in leer(fcenso):
            if c.get('ncu') and c.get('esclavo'):
                censo.setdefault((int(c['ncu']), int(c['esclavo']), c['rol']), c)

    feats, pos, sin_casar, sin_censo = [], {}, [], []
    for r in leer(fnodos):
        if r.get('ncu') and r.get('esclavo') and not (r.get('x') or r.get('lat')):
            rol = {'COORD': 'NCU', 'METEO': 'HSU'}.get((r.get('role') or 'TCU').upper(),
                                                       (r.get('role') or 'TCU').upper())
            eq = censo.get((int(r['ncu']), int(r['esclavo']), rol))
            if eq is None:
                sin_censo.append('NCU%s esclavo %s (%s)' % (r['ncu'], r['esclavo'], rol))
                continue
            r = dict(r, lat=eq['lat'], lon=eq['lon'], etiqueta=r.get('etiqueta') or eq['etiqueta'])
        if r.get('lat') and r.get('lon'):
            lat, lon = float(r['lat']), float(r['lon'])
        else:
            lat = lat0 + float(r['n']) / MPERLAT
            lon = lon0 + float(r['x']) / mperlon
        pos[r['id']] = (lon, lat)
        if r.get('etiqueta') and r['etiqueta'] not in conocidos:
            sin_casar.append(r['etiqueta'])
        props = {'id': r['id'], 'etiqueta': r.get('etiqueta', ''), 'role': r.get('role', 'TCU') or 'TCU',
                 'is_spof': str(r.get('is_spof', '')).lower() in ('1', 'true', 'si', 'sí')}
        for k in ('descendientes', 'rutas', 'rssi_med_dbm', 'ack_failures', 'hop_tipico', 'padres_distintos'):
            v = num(r.get(k))
            if v is not None:
                props[k] = v
        for k in ('padre_dominante', 'gw'):
            if r.get(k):
                props[k] = r[k]
        feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 6), round(lat, 6)]},
                      'properties': props})

    huerfanos = []
    for r in leer(fenlaces):
        a, b = r.get('origen'), r.get('destino')
        if a not in pos or b not in pos:
            huerfanos.append((a, b))
            continue
        props = {'origen': a, 'destino': b}
        for k in ('rssi_medido_dbm', 'distancia_m', 'freq'):
            v = num(r.get(k))
            if v is not None:
                props[k] = v
        if r.get('nota'):
            props['nota'] = r['nota']
        if 'distancia_m' not in props:                      # si no viene, se calcula de las dos posiciones
            (lo1, la1), (lo2, la2) = pos[a], pos[b]
            props['distancia_m'] = round(math.hypot((lo2 - lo1) * mperlon, (la2 - la1) * MPERLAT), 1)
        feats.append({'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': [list(pos[a]), list(pos[b])]},
                      'properties': props})

    salida = planta + '_real.geojson'
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(salida, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    nod = sum(1 for f in feats if f['geometry']['type'] == 'Point')
    enl = len(feats) - nod
    rs = [f['properties'].get('rssi_medido_dbm') for f in feats if f['geometry']['type'] == 'LineString']
    rs = [v for v in rs if v is not None]
    print('%s  ·  %d nodos  ·  %d enlaces%s' % (salida, nod, enl,
          ('  ·  RSSI %d a %d dBm' % (min(rs), max(rs))) if rs else ''))
    if sin_censo:
        print('AVISO: %d nodos con NCU+esclavo que no están en el censo y se han dejado fuera: %s' %
              (len(sin_censo), ', '.join(sin_censo[:8])))
    if sin_casar:
        print('AVISO: %d etiquetas no existen en %s_layout.json: %s' % (len(sin_casar), planta, ', '.join(sin_casar[:8])))
    if huerfanos:
        print('AVISO: %d enlaces con un extremo que no está en nodos.csv: %s' % (len(huerfanos), huerfanos[:4]))
    if not sin_casar and not huerfanos and not sin_censo:
        print('todas las etiquetas casan con el layout y todos los enlaces tienen sus dos extremos')


if __name__ == '__main__':
    main()
