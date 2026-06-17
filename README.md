# Cobertura Zigbee — El Burgo I

> Visor "máquina del tiempo" + recolectores para medir y reproducir la cobertura de la malla Zigbee de seguidores (TCU) de la PSFV El Burgo I sobre un mapa satélite.

## Qué es

Un paquete para medir la red Zigbee **ya desplegada** en planta (no instala nada nuevo en campo) y representarla sobre el satélite: nivel de señal, nodos sin respuesta, fiabilidad del enlace, **saltos** de cada paquete y **criticidad** de cada nodo. Dos recolectores PowerShell consultan el gateway Digi ConnectPort X2 (XBee ZB 2,4 GHz) y escriben CSV; el visor (un único HTML, `index.html`) los pinta y los reproduce sobre una línea de tiempo.

```
zigbee_logger.ps1 ──HTTP/RCI(80)──┐
                                  ├─► Digi ConnectPort X2 (coordinador + 52 TCU + HSU, malla)
zigbee_routes_logger.ps1 ─telnet(23)─┘
        │  zigbee_log.csv / zigbee_routes.csv
        ▼
   index.html  (mapa satélite + máquina del tiempo)
```

## Funcionalidades

- **Recolector RSSI/estado** (`zigbee_logger.ps1`, HTTP/RCI): RSSI, online/offline, fallos de ACK. Autodescubre nodos; vigila varios gateways a la vez.
- **Recolector de rutas** (`zigbee_routes_logger.ps1`, telnet): saltos y topología (`xbee source_route`). Autodescubre nodos.
- **Visor** (`index.html`): mapa satélite Leaflet + línea de tiempo (play, paso a paso, scrub, velocidad 1–8×, bucle, tira roja de incidencias).
- **Modos de color**: RSSI, Estado (cobertura real), ACK fallos, Saltos (profundidad al coordinador) y Criticidad (puntos únicos de fallo).
- **Rutas/topología**: clic en un TCU dibuja su cadena de saltos al gateway; opción de dibujar toda la malla; gateway reubicable sobre el mapa.

## Uso

1. Edita la **IP** y las **credenciales** del gateway al principio de cada `.ps1` (`$Gateways`/`$GwHost`, `$User`/`$Pass`).
2. Lanza los recolectores (en ventanas separadas), déjalos correr el periodo a medir (ideal: un día completo, incluido un *stow*):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\zigbee_logger.ps1
   powershell -ExecutionPolicy Bypass -File .\zigbee_routes_logger.ps1
   ```
3. Abre **`index.html`** y carga los tres CSV (registro RSSI, coordenadas, rutas). Para probar sin datos reales, pulsa **"Datos de ejemplo"**. Teclado: espacio = play, flechas = paso.

> Para ver saltos/criticidad *evolucionar* hace falta que `zigbee_routes.csv` tenga varias capturas dentro del mismo periodo que el log de RSSI (la línea de tiempo la marca el RSSI).

## Stack

- Visor: **HTML + JavaScript + Leaflet** (teselas satélite), un único fichero `index.html`, sin build.
- Recolectores: **PowerShell** (incluido en Windows; no requiere instalación ni administrador).
- Gateway: Digi **ConnectPort X2**, XBee ZB **2,4 GHz canal 14**; RSSI/estado por **RCI** (HTTP), rutas por **CLI telnet**.
- Datos: CSV (`zigbee_log.csv`, `zigbee_routes.csv`, `coords_ElBurgo_NCU1.csv` con `node_id, lat, lon`).

## Despliegue

Publicado como página estática en GitHub Pages: **https://imoriana3.github.io/cobertura-zigbee/**

`index.html` es autónomo; basta servir el fichero. El visor descarga las teselas del satélite por internet (sin conexión funciona igual, sin fondo de mapa).

## Notas

- **El RSSI no es el mapa de cobertura**: es el nivel del último salto al vecino, no la distancia al coordinador. La cobertura real la dan `Estado` (hay ruta o no) y `ACK fallos` (enlace que retransmite). La **criticidad** marca los relés de los que dependen otros nodos.
- Las **rutas son una foto** de cada captura; la malla se reorganiza sola entre rondas.
- El **mapeo de IDs** a coordenadas lleva una hipótesis (orden de strings de la nomenclatura `1.X.Y`); valídala con un TCU conocido antes de sacar conclusiones de posición exacta.
- No bajes mucho los intervalos en producción: cada ronda compite con el tráfico de control de la NCU (5–10 min está bien).

*Factiun · proyecto interno.*
