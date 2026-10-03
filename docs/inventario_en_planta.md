# Correr `zigbee_inventario.ps1` en planta — hoja de campo

> **Para qué**: San José **NCU 18** tiene dos gateways y uno va mal. El volcado
> del stow del 2026-09-24 lo demostró —**los 13 fallos de orden caen todos en
> GW1 (TCU 1–38) y los 75 stows medidos todos en GW2 (TCU 39–122)**— pero **no
> dice por qué**, porque la exportación de TCU **no trae ni una magnitud de
> radio**. Este script sí: **RSSI y LQI por nodo**, y de paso el **canal**.
>
> Dos cosas se cierran con una ejecución:
>
> 1. **radio contra equipo en GW1** — si el RSSI del bloque 1–38 está en el
>    suelo, es cobertura; si es normal, es el equipo;
> 2. **el canal** (`CH`) y el PAN (`ID`), que hoy están a `null` en
>    `Siting/radio_params.json` y bloquean la fila de legalidad del comparador.
>    A canal 26 la potencia máxima del XBee-PRO cae de +19 a **+3 dBm**: son
>    **16 dB** de margen, más que cualquier otra cosa que ese fichero discuta.

---

## 1 · ANTES DE SALIR: el script apunta a OTRA PLANTA

Comprobado el 2026-10-03. La configuración viene cableada así:

```powershell
$Gateways = @(
  @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = "" }
)
```

**`10.100.1.54` es el gateway de EL BURGO I, NCU1 GW2.** Está en
`SCADA/tools/tcu-toolbox/plantas/elburgo.json` con ese nombre. Si el script se
corre tal cual en San José, consulta una dirección de otra red.

### Y lo peor es CÓMO falla, que lo dice el propio script

El comentario de `Invoke-RCIRaw` lo deja escrito: una excepción en esa llamada
está **dentro del mismo `try`** que la consulta real al nodo, así que se lleva
las dos por delante y el nodo sale en el censo con **`estado_ok = 0`**. Es
decir: **una planta entera apareciendo como nodos que no contestan**, que se lee
como un problema de radio y no del programa.

> **Un fallo que se disfraza de dato.** Por eso el paso 2 va antes del paso 3.

---

## 2 · LA DIRECCIÓN DEL GATEWAY DE NCU 18 NO ESTÁ EN NINGÚN REPO

Medido el 2026-10-03 sobre la toolbox:

| planta | entradas | con `ip_gw` |
|---|---|---|
| El Burgo | 5 | **5** |
| San José | 82 | **0** |

Lo que San José **sí** tiene para NCU 18:

```
San Jose NCU18 GW1   ip 10.21.236.86   puerto 503   TCU  1 – 38
San Jose NCU18 GW2   ip 10.21.236.86   puerto 504   TCU 39 – 122
```

Pero esa `ip` es la de la **NCU por Modbus** (misma IP, dos puertos). Este
script no habla Modbus: habla **HTTP/RCI contra el servidor web del propio
gateway** (`http://<host>/UE/rci`), que es otra dirección.

### El patrón de El Burgo, que es una PISTA y no una respuesta

Medido, 5 de 5 sin excepción:

| | NCU | gateway | salto |
|---|---|---|---|
| NCU1 GW1 | 10.100.1.52 | 10.100.1.53 | **+1** |
| NCU1 GW2 | 10.100.1.52 | 10.100.1.54 | **+2** |
| NCU2 GW1 | 10.100.1.56 | 10.100.1.57 | **+1** |
| NCU2 GW2 | 10.100.1.56 | 10.100.1.58 | **+2** |

Si San José siguiera el mismo esquema, los candidatos para NCU 18
(`10.21.236.86`) serían **`.87` para GW1 y `.88` para GW2**.

> **ESO NO SE ESCRIBE EN EL SCRIPT SIN COMPROBARLO.** Es un patrón de **otra
> planta**, con otro rango de direcciones y otra instalación. Una dirección
> adivinada que resulta estar ocupada por otro equipo no da un error claro: da
> un censo vacío que se lee como avería de radio, que es exactamente lo de
> arriba.

### Cómo comprobarlo en la planta, en diez segundos

Cualquiera de estas tres, antes de tocar el script:

```powershell
# 1. ¿hay algo escuchando?
Test-NetConnection 10.21.236.87 -Port 80

# 2. ¿es un gateway Digi? (su web propia contesta)
#    en el navegador del PC:  http://10.21.236.87/

# 3. ¿quién hay en ese tramo de red?
arp -a | findstr 10.21.236
```

Y si no es ninguno de los candidatos, el dato está en uno de estos sitios:
la configuración del propio SCADA, la etiqueta física del Digi, o la
documentación de red de la planta.

---

## 3 · LOS DOS GATEWAYS, NO UNO

**GW1 es el sospechoso y GW2 es el control.** Un volcado de GW1 solo no decide
nada: «RSSI bajo» no significa nada sin saber cuánto da el gateway que funciona
en la misma planta, el mismo día y con la misma antena.

```powershell
$Gateways = @(
  @{ Name = "SJ-NCU18-GW1"; Host = "<la de GW1, comprobada>"; User = ""; Pass = "" }
  @{ Name = "SJ-NCU18-GW2"; Host = "<la de GW2, comprobada>"; User = ""; Pass = "" }
)
```

---

## 4 · CORRERLO

```powershell
cd <la carpeta del script>
powershell -ExecutionPolicy Bypass -File .\zigbee_inventario.ps1
```

Comprobado el 2026-10-03 **LEYENDO EL FUENTE, no ejecutándolo**: en el
contenedor donde se revisó no hay `pwsh` —el propio banco del repo,
`tools/test_inventario_zb.py`, lo dice y sale sin medir—, así que **nadie ha
visto correr esto desde el 2026-10-03**. Lo de abajo es lo que el código dice
que hace, no lo que se ha visto hacer; la primera ejecución de verdad es la de
mañana.

| | |
|---|---|
| **lo que sí está verificado** | que el fuente no usa sintaxis de PS 7, que `UseBasicParsing` está puesto, que no toca registro/servicios/firewall, y que sólo escribe en `$PSScriptRoot` |
| **lo que NO** | que arranque. Para eso hace falta correrlo |

| | |
|---|---|
| **Windows PowerShell 5.1** | **vale.** Ni `??`, ni `?.`, ni `-AsHashtable`, ni `ForEach-Object -Parallel`, ni nada de PS 7 |
| el tropiezo de IE en 5.1 | **ya resuelto**: `UseBasicParsing = $true` está puesto, con el porqué escrito al lado |
| **admin** | **no hace falta.** Ni registro, ni servicios, ni firewall, ni tareas programadas |
| **instalar algo** | **no.** Sólo cmdlets de serie |
| dónde escribe | **al lado del script** (`$PSScriptRoot`), así que basta que esa carpeta sea escribible |
| ¿puede tocar la planta? | **no escribe en los equipos**: son consultas RCI de lectura, una pasada y sale — no es un bucle |
| carga sobre la red | `Start-Sleep 150 ms` entre nodos, «no saturar el radio del coordinador». Con 122 TCU son ~20 s de espera repartida |

---

## 5 · QUÉ TRAER DE VUELTA

Los dos ficheros que deja al lado del script:

| fichero | qué lleva |
|---|---|
| `zigbee_inventario.csv` | una fila por nodo, con **RSSI y LQI** y todo lo que el nodo publique como `ajuste_*` / `estado_*` |
| `zigbee_inventario_crudo.xml` | la respuesta **entera** del gateway (ahí van `CH` y `ID`) más los **3 primeros nodos** completos |

El `CH` y el `ID` del gateway están en el **XML**, no en el CSV: el script manda
`query_setting` al coordinador y vuelca su respuesta en bruto. Si quieres más
nodos completos, sube `$CrudoNodos` antes de correrlo.

### DOS AVISOS SOBRE LO QUE VUELVE

1. **Si el webserver del gateway pide login**, hay que rellenar `User`/`Pass` en
   el script (en los Digi viejos suele ser `root` / `dbps`). **Ese script con la
   contraseña dentro NO se sube al repositorio.** Es la misma regla del Excel de
   direcciones: las credenciales no viajan en git. Déjalos vacíos antes de
   commitear, o pásame sólo los dos ficheros de salida.
2. El CSV y el XML son **datos de planta**. Antes de meterlos en el repo
   decidimos qué entra: lo que hace falta publicado son las **magnitudes de
   radio por nodo** y el **canal**, no necesariamente el volcado entero.

---

## 6 · Y SI ALGO SALE RARO, QUÉ MIRAR PRIMERO

| síntoma | lo más probable |
|---|---|
| **todos** los nodos con `estado_ok = 0` | la dirección del gateway. Volver al paso 2 — NO es un hallazgo de radio |
| 0 nodos en el censo | el `discover` no contestó: gateway correcto pero sin red Zigbee formada, o IP de otro equipo |
| sólo algunos nodos a 0 | **eso sí es dato**: son los que no contestan de verdad |
| «Object reference not set…» | un `Invoke-WebRequest` sin `UseBasicParsing`. No debería pasar; si pasa, el script se ha editado |
