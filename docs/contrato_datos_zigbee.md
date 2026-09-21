# Contrato de datos — recolectores Zigbee

Qué escribe cada recolector, con qué tipo y en qué unidad. Es el documento que manda: si el
código y esto no coinciden, es un fallo, y hay un banco que lo vigila.

**Estado**: `schema_version = 2`. La v1 es todo lo escrito antes de este contrato; se sigue
leyendo, con las reglas de la última sección.

---

## Reglas que valen para todos los CSV

| | |
|---|---|
| Codificación | UTF-8 |
| Separador | coma; `Export-Csv -NoTypeInformation` (comillas cuando hacen falta) |
| Decimal | **punto**, siempre — el PC de planta es Windows en español y `ToString()` escribiría coma |
| Vacío | celda vacía, nunca `NA`, `null`, `-` ni `0` |
| Tiempo | **UTC, ISO 8601 con `Z`**: `2026-09-19T14:03:07Z` |
| Versión | columna `schema_version`, valor `2`, en **todas** las filas |

### Por qué el decimal se escribe a mano

En `es-ES`, `(1.5).ToString()` da `1,5` y rompe el CSV en silencio. Todo número con decimales se
escribe con `[System.Globalization.CultureInfo]::InvariantCulture`. Los bancos corren en `es-ES`
a propósito, justo para que esto no vuelva a pasar desapercibido.

### Por qué el tiempo va en UTC

Un `yyyy-MM-dd HH:mm:ss` local sin zona es ambiguo dos veces al año y no se puede cruzar con nada.
En octubre hay **dos** horas que se llaman igual y en marzo hay una que **no existe**. Una campaña
de medida que cruce esa noche queda sin ordenar, y el visor lo único que puede hacer es adivinar.

### `tz_pc_min`: el reloj del PC puede no ser el de la planta

El PC de campo puede estar configurado en otra zona que la planta — un portátil traído de España a
Perú, por ejemplo. Escribiendo en UTC eso ya no corrompe el dato, pero **sí conviene poder
auditarlo**: `tz_pc_min` guarda el desfase UTC del reloj del PC en el momento de escribir la fila.

Si a mitad de campaña ese número cambia, alguien tocó la hora del equipo, y eso explica saltos que
si no parecerían de red. Es un dato de diagnóstico: **no se usa para convertir nada**.

### La zona horaria es la de la PLANTA, y no hay una por defecto

Para leer un CSV **v1** (hora local sin zona) hace falta saber en qué zona se escribió. Esa zona
sale de **`plantas_indice.json`, campo `tz_iana`**, que es la fuente declarada del huso. No se
copia en ningún otro sitio.

| planta | zona | huso |
|---|---|---|
| El Burgo, Fayón, Ayora, Páramo, El Polvorín | `Europe/Madrid` | cambia con la estación |
| Bagnarelli, Benante, Catania, Panbianco | `Europe/Rome` | cambia con la estación |
| Dicayagua | `America/Santo_Domingo` | UTC−4 fijo |
| San José | `America/Lima` | UTC−5 fijo |
| Túnez | `Africa/Tunis` | UTC+1 fijo |

**`tz_regla` no vale para convertir.** La cadena «UTC+2 del día 88 al 298» es una aproximación de
la regla peninsular; el cambio cae en el último domingo de marzo y de octubre, que no son días
fijos del año. Y `tz_fijo_min` solo dice el desfase, no la zona: un desfase no sabe si ese país
cambia la hora.

Medido, por si hace falta justificarlo: con una zona fija de Madrid, un v1 de **San José salía
siete horas desplazado** en verano y el visor decía que estaba bien leído. Y como los candidatos
de desfase se tomaban de Madrid (+1/+2), en Perú no cuadraba ninguno: las filas se descartaban
como «hora inexistente», 2.289 TCU en silencio.

**Si no se sabe la zona, no se asume ninguna.** El visor lo dice y ofrece elegirla; las filas no
entran en la serie hasta que se elige.

### La hora repetida se desambigua por el ORDEN del fichero

Tomar siempre la primera de las dos lleva las **dos pasadas reales** por 02:00–02:59 al mismo UTC,
y el visor las funde sin decir nada: dos vueltas del recolector se convierten en una.

Los recolectores escriben en orden cronológico, así que dentro de la franja ambigua:

- si la hora local **retrocede** respecto a la fila anterior → lo que sigue es la **segunda** pasada (UTC+1);
- si ya se vio una hora **≥ 03:00** de esa fecha → también;
- y una vez que una fecha entra en segunda pasada, **se queda**: 02:00 CET y luego 02:10 CET no
  retroceden entre sí, pero siguen siendo la segunda.

El orden solo resuelve si se viene siguiendo **esa misma noche**: una fila anterior de otra fecha
no dice nada, porque el fichero podría empezar ya en la segunda pasada. Lo que el orden no
resuelve —típicamente la primera fila del fichero, si cae dentro de la franja— queda marcado
`ambigua` y se cuenta en el aviso.

### Rotación del fichero al cambiar de esquema

Este documento decía que `Export-Csv -Append` **rechaza** filas cuyas columnas no cuadren con la
cabecera del fichero que ya existe. **Medido, eso es cierto en dos casos de tres — y falso
justamente en el que le importa al bloque 2.**

`tools/test_export_csv_esquema.py` le pregunta a PowerShell en vez de a la documentación:

| la fila que se añade… | ¿falla? | ¿se escribe? | ¿entran sus columnas? |
|---|---|---|---|
| trae columnas **de más** ← el caso del bloque 2 | **no** | **sí** | **no** |
| trae columnas **de menos** | sí | no | — |
| trae las columnas **renombradas** | sí | no | — |

**Windows PowerShell 5.1 y PowerShell 7.6.5 dan lo mismo en las tres.** La única diferencia medida
entre versiones es el BOM: `-Encoding UTF8` lo deja en 5.1 y no lo deja en 7.

Medido en el runner de este repo: 5.1 → runs 35474112229 y 35475714525; 7.6.5 → runs 35472054575 y
35475714525.

**Lo que esto significa.** Añadir las columnas de v2 sobre un fichero de v1 **no da ningún error**:
la fila entra, `ciclo_id` y `latencia_ms` se caen por el camino y no aparece nada en pantalla. Es
**peor** que el fallo ruidoso que este documento suponía, y hace que la rotación no sea una
precaución sino la única forma de no perder columnas.

Y al revés —un recolector de v1 escribiendo sobre un fichero ya rotado a v2— **sí falla, y no
escribe nada**. Eso es ruidoso, que es mejor, pero significa que ese recolector deja de registrar
hasta que se actualice.

Por eso, al arrancar, cada recolector **comprueba la cabecera** del CSV que va a ampliar:

- cabecera igual a la de v2 → sigue añadiendo;
- cabecera distinta (v1, o v2 anterior) → **renombra** el existente a
  `<nombre>.v1.<AAAAMMDDTHHMMSSZ>.csv` y empieza uno nuevo;
- no existe → lo crea.

Nunca se mezclan dos esquemas en un fichero, y **nunca se borra** el anterior.

---

## `zigbee_log.csv` — RSSI y estado por nodo

Lo escribe `zigbee_logger.ps1`. Una fila **por nodo y por ciclo**.

| columna | tipo | unidad | notas |
|---|---|---|---|
| `schema_version` | entero | — | `2` |
| `timestamp` | ISO 8601 Z | UTC | **el instante de ESTA fila**, no el del ciclo |
| `ciclo_id` | entero | — | número de vuelta desde que arrancó el recolector, empezando en 0 |
| `latencia_ms` | entero | ms | lo que tardó la consulta de ESTE nodo |
| `tz_pc_min` | entero | min | desfase UTC del **reloj del PC** al escribir la fila. Ver abajo |
| `gateway` | texto | — | nombre del CONFIG, no la IP |
| `ext_addr` | texto | — | dirección de 64 bits. **Es la clave del nodo** |
| `node_id` | texto | — | etiqueta del módulo. **NO es única entre NCUs** |
| `net_addr` | texto | — | dirección de 16 bits, cambia con la malla |
| `role` | texto | — | `TCU`, `HSU`, o el `device_type` en crudo si no se reconoce |
| `online` | 0/1 | — | 1 = contestó con RSSI |
| `motivo` | texto | — | ver tabla abajo |
| `rssi_dbm` | entero | dBm | negativo. Vacío si no contestó |
| `ack_failures` | entero | — | contador del módulo, acumulativo |
| `reinicio` | 0/1 | — | 1 = el contador de ACK bajó respecto a la lectura anterior |
| `supply_mv` | entero | mV | |
| `temp_c` | entero | °C | |

### `motivo`

Clasifica el fallo en vez de dejar `online=0` a secas. Un nodo sin TCU y un gateway caído no son
lo mismo, y hoy se leen igual.

| valor | qué pasó |
|---|---|
| `ok` | contestó |
| `timeout_nodo` | el gateway respondió, el nodo no |
| `sin_radio` | contestó sin bloque `radio` |
| `http_error` | el gateway devolvió 5xx u otro error HTTP |
| `auth` | 401/403: credenciales |
| `gw_caido` | el gateway no responde o encadenó K errores. **Ningún nodo cuenta como offline por esto** |

### `reinicio`

`ack_failures` es un contador acumulativo del módulo. Si baja, el módulo se ha reiniciado. Antes
eso daba un Δ negativo que el visor mostraba como 0 sin decir nada — un reinicio es justo el
evento que interesa.

---

## `gateway_stats.csv` — carga del propio gateway

Lo escribe `zigbee_logger.ps1`. Una fila **por gateway y por ciclo**. Va a su propio fichero
porque el visor lee `zigbee_log.csv` por fila de nodo.

| columna | tipo | unidad | notas |
|---|---|---|---|
| `schema_version` | entero | — | `2` |
| `timestamp` | ISO 8601 Z | UTC | |
| `ciclo_id` | entero | — | el mismo de `zigbee_log.csv` |
| `gateway` | texto | — | |
| `host` | texto | — | IP |
| `ok` | 0/1 | — | 1 = se reconoció la CPU |
| `cpu_pct` | entero | % | 0–100 |
| `mem_total_b` | entero | **bytes** | El Burgo: 16.777.216 = 16 MB |
| `mem_usada_b` | entero | bytes | |
| `mem_libre_b` | entero | bytes | |
| `uptime_s` | entero | s | |

> La memoria va en **bytes** porque es como la da el Digi. La referencia de Digi dice KB y no es
> verdad: 16.777.216 en KB serían 16 GB en un ConnectPort X2.

---

## `zigbee_routes.csv` — rutas y saltos

Lo escribe `zigbee_routes_logger.ps1`. Una fila **por nodo consultado y por vuelta**, incluidos
los que fallan.

| columna | tipo | unidad | notas |
|---|---|---|---|
| `schema_version` | entero | — | `2` |
| `timestamp` | ISO 8601 Z | UTC | instante de esta consulta |
| `ciclo_id` | entero | — | |
| `latencia_ms` | entero | ms | |
| `gateway` | texto | — | |
| `target_ext` | texto | — | **clave del nodo consultado** |
| `ok` | 0/1 | — | 1 = se leyó una ruta |
| `motivo` | texto | — | mismos valores, más `telnet_caido` y `sin_ruta` |
| `hop_count` | entero | — | saltos = nodos − 1. Vacío si `ok=0` |
| `path_ids` | texto | — | `node_id` separados por `>`, del coordinador al destino |
| `path_addrs` | texto | — | `net_addr` (16 bits), mismo orden |
| `path_ext` | texto | — | `ext_addr`, mismo orden. **Vacío si no se pudo resolver** |

### `path_ext` no se adivina

`net_addr` es de 16 bits y **cambia** cuando la malla se reorganiza. Para pasarlo a `ext_addr`
hace falta la tabla del recolector de RSSI **vigente en ese instante**. Si no la hay, la celda
queda vacía. Rellenarla con la tabla de otro momento es inventarse la topología.

---

## `censo_campania.csv` — a quién se pregunta

Lo escribe `zigbee_logger.ps1` al arrancar, a partir del inventario y de
`cobertura_coords/<planta>/`. **No cambia durante la campaña**, salvo para añadir.

| columna | tipo | notas |
|---|---|---|
| `schema_version` | entero | `2` |
| `ext_addr` | texto | clave |
| `node_id` | texto | |
| `gateway` | texto | |
| `ncu` | entero | |
| `gw` | entero | |
| `esclavo` | entero | unit id Modbus |
| `etiqueta` | texto | el del plano |
| `lat`, `lon` | decimal | grados, WGS84 |
| `origen` | texto | `inventario`, `coords`, o `discover` si apareció en marcha |
| `visto_utc` | ISO 8601 Z | cuándo se vio por primera vez |

### Por qué existe

Hoy el censo es **lo que conteste el `discover`**, y se reemplaza entero cada hora. Un nodo que no
contesta en ese instante **desaparece de la lista** y deja de sondearse: justo el nodo que
interesa. El censo fijo invierte la regla — se pregunta siempre a todos, y el que no contesta
genera fila con `online=0` y su `motivo`.

Al censo **solo se añade**. Nunca se quita nada.

---

## `zigbee_inventario.csv` — qué hay puesto

Lo escribe `zigbee_inventario.ps1`, una vez. Columnas fijas más **la unión de todo lo que conteste
cada nodo**, con prefijo: `disc_` (del `discover`), `estado_` (`query_state`) y `ajuste_`
(`query_setting`).

| columna | tipo | notas |
|---|---|---|
| `schema_version` | entero | `2` |
| `gateway`, `gw_host` | texto | |
| `serie` | texto | = `ext_addr`, la dirección de 64 bits de la etiqueta |
| `node_id` | texto | |
| `disc_*`, `estado_*`, `ajuste_*` | texto | unión de campos, vacío donde ese nodo no lo trae |

Cada firmware de ConnectPort contesta un juego distinto. Un campo que solo trae un módulo es
justo el interesante: se recoge todo. La respuesta en bruto queda además en
`zigbee_inventario_crudo.xml`.

---

## `barrido_<planta>_NCU<nn>_angulos.csv` — ángulos del Modbus

Lo escribe `zigbee_angulos.ps1`. **Este no va contra el ConnectPort**, va contra el Modbus de la
NCU (503/504).

| columna | tipo | unidad | notas |
|---|---|---|---|
| `schema_version` | entero | — | `2` |
| `hora_utc` | ISO 8601 Z | UTC | ya era UTC en v1, pero sin `T` ni `Z` |
| `latencia_ms` | entero | ms | |
| `ncu`, `ip`, `puerto` | texto/entero | — | |
| `esclavo` | entero | — | unit id Modbus |
| `tilt_deg` | decimal | grados | registro 30111, s16 /10 |
| `target_deg` | decimal | grados | |
| `modo` | texto | — | del 30001, bits 9:8 |
| `error` | texto | — | vacío si fue bien |

> La dirección `30111` viaja **tal cual** en la trama, con **FC03**. Escribirla como `3xxxx` con
> offset y FC04 no falla aquí: falla en planta con `IllegalDataAddress`.

---

## `cobertura_coords/<planta>/coords_*.csv` — posiciones

No lo escribe ningún recolector; lo genera `tools/gen_coords_cobertura.py`. Se documenta aquí
porque es una entrada del censo.

`node_id, lat, lon, etiqueta, rol, enlace, ncu, gw, esclavo`

---

## La clave de un nodo

**`ext_addr`**, la dirección de 64 bits. En su defecto, el par **`gateway` + `node_id`**.

`node_id` **por sí solo no vale**: `TCU_SUNNER_ID_001` existe en cada NCU. Un fichero de dos
gateways cruzado por `node_id` mezcla nodos de plantas distintas de la misma planta, y el error no
se ve — sale un nodo con el doble de lecturas y ninguna alarma.

---

## Leer v1

El visor acepta las dos versiones. Detecta v1 porque **falta la columna `schema_version`**.

### Qué se hace con una hora v1

Se interpreta como **hora local de Europe/Madrid**, y el visor **lo dice en pantalla**. No es una
conversión segura: es la única interpretación posible de lo que hay, y el usuario tiene que saber
que se ha hecho.

### El cambio de hora, explícito

Convertir una hora local a UTC no siempre tiene una respuesta. Dos noches al año:

| caso | cuándo | qué pasa | qué se hace |
|---|---|---|---|
| **hora inexistente** | último domingo de marzo, 02:00–02:59 local | el reloj salta de 02:00 a 03:00: esa hora no existió | se marca `inexistente` y **no se convierte**; queda fuera de la línea de tiempo y se cuenta en el aviso |
| **hora ambigua** | último domingo de octubre, 02:00–02:59 local | ocurre **dos veces**, con dos UTC distintos | se resuelve **por el orden del fichero** (ver arriba). Lo que el orden no resuelve se marca `ambigua`, se toma la primera pasada y el aviso dice cuántas hay |

Ninguna de las dos se rellena en silencio. Un fichero v1 que no cruce esas dos noches no tiene
ninguna fila marcada, que es el caso normal.

### Cómo se resuelve el desfase, sin librerías

Los desfases NO se enumeran a mano: se le preguntan a la zona. Para una hora local `L` se toma el
desfase que esa zona tiene **el día anterior, en el instante tentativo y el día siguiente** — así
quedan cubiertos los dos lados de un cambio de hora. Para cada desfase distinto se calcula el
instante UTC y se vuelve a formatear en la zona con `Intl.DateTimeFormat`: si devuelve `L`, el
candidato es válido.

Con un solo paso esto falla **en silencio**: para las 02:30 del 25-oct el desfase en el instante
tentativo ya es el de invierno, así que solo aparece el candidato CET y la hora repetida no sale
como repetida.

- ningún candidato válido → hora **inexistente**
- dos candidatos válidos → hora **ambigua**, que el orden del fichero resuelve casi siempre
- uno → conversión exacta

No hace falta tabla de cambios de hora ni dependencia: el navegador ya trae la base de datos de
zonas horarias. Y vale igual para una zona sin cambio de hora (Perú, Túnez) que para una con él.

### Lo que NO se arregla leyendo v1

- `timestamp` de v1 es **el del ciclo**, no el de la fila: todos los nodos de una vuelta comparten
  marca. Con vueltas de minutos, eso es un error real de hasta el intervalo completo, y no hay de
  dónde sacar el instante de cada nodo. Se lee tal cual.
- v1 **no trae** `ciclo_id`, `latencia_ms`, `tz_pc_min`, `motivo` ni `reinicio`. Quedan vacías.
- v1 no dice **en qué zona** se escribió: la pone el visor desde `plantas_indice.json`, y lo avisa.
- Un `zigbee_routes.csv` de v1 **solo tiene filas de rutas que salieron bien**: las que fallaron no
  se escribían. La ausencia de un nodo en una vuelta v1 no se puede distinguir de un fallo.

---

## Ficheros de campaña ya recogidos

| fichero | versión | nota |
|---|---|---|
| `elburgo_real_v1.geojson` | v1 | la malla medida de El Burgo, congelada. Es la base del careo de `cobertura-siting-vs-3d.md` |

Cuando una campaña se reprocese con v2, el resultado se publica **al lado** del anterior, no
encima: los números publicados tienen que poder recalcularse contra el dato con el que se
sacaron.
