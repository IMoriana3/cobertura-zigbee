# Traspaso — estado de las plantas y qué falta

Nota para la siguiente sesión (o para otra persona). Lo que sabía una sesión y no estaba en ningún
sitio se pierde al cerrarla; esto lo pasa al repositorio. **Quien avance algo, lo tacha aquí.**

Contexto de coordinación: en el repo `proyectos` hay un `CONTRATO.md` entre las sesiones que editan
el Panel. Este fichero es lo equivalente para las **plantas**.

---

## ⚠ UNA PUERTA VERDE AFIRMA DOS COSAS (2026-09-23)

**«He mirado» y «está bien». Hasta hoy sólo comprobábamos la segunda.**

Esto no es una idea: es lo que ha aparecido **cuatro veces en un día**, y las
cuatro habrían pasado la prueba clásica de «rompe la puerta y mira si salta».

| dónde | miraba | de cuántos |
|---|---|---|
| la regex de la HSU | se paraba en el paréntesis de `projX(glon)` | — |
| `auditoria_verdes.mjs` | 3 ficheros | de 17 pasos |
| `careo_terreno_3d.mjs` | 1 planta | de 11 |
| `gate_ps1_planta.py` | **0 ficheros `.ps1`** y decía «ninguno se rompería» | de 6 |

Las cuatro **funcionaban** sobre lo que miraban. Romperles el dato de dentro las
ponía rojas, como debe ser. Lo que ninguna decía es **cuánto había mirado**.

### La regla que sale de aquí

> Cada puerta publica su **ALCANCE** —cuántos ficheros, casos, plantas o líneas
> examina, **de cuántos existen**— y cuando el alcance es parcial o cero sale
> con **rc = 2** o en rojo, nunca en verde.

Con la convención de códigos de salida que ya usamos (#738):

```
0  ha mirado lo suficiente Y está bien
1  ha mirado y está MAL
2  no ha mirado lo suficiente — «no comprobado» ≠ «comprobado y pasa»
```

Y el piso del alcance se **mide**, no se pone a ojo, igual que los pisos de
comprobaciones de `factiun-cartera/tests/correr.sh`: se baja a propósito y con
el motivo escrito, para que el cambio se vea en el diff.

### Por qué el negativo solo no basta

Romper la puerta prueba que **reacciona a lo que mira**. No prueba que mire
donde debe. Son dos fallos distintos y el segundo es el caro, porque produce un
verde tranquilizador en vez de un rojo.

*(Y un aviso de dentro de la propia prueba: al mutar `-UseBasicParsing` con un
`sed` que buscaba el guion, la mutación NO casó —en el splat va
`UseBasicParsing = $true`, sin guion— y la puerta salió verde. Un segundo más y
lo habría apuntado como «regla dormida». Una mutación que no casa es rc = 2, no
«no cazada»; esa distinción ya está escrita en el corredor de mutaciones y vale
igual cuando la mutación la escribe uno a mano.)*

---

## Estado por planta

| Planta | Layout 3D | Layout 2D | Cobertura | Siting | Tipos reales del DWG | Georref. |
|---|---|---|---|---|---|---|
| El Burgo I 23003 | ✅ | ✅ | ✅ malla medida | ✅ | ✅ 5 tipos (int/ext/medio × rótula) | ✅ |
| Ayora 24025 | ✅ | ✅ | ⚠️ solo mapa | ✅ | ⚠️ 647 de 754 (ver abajo) | ✅ |
| San José 24019 | ✅ | ✅ | ⚠️ solo mapa | ✅ | ✅ 2289/2289 · 1723 articulados | ✅ |
| Fayón 24007 | ✅ | ✅ | ⚠️ solo mapa | ✅ | ✅ 24/24 (2 longitudes) | ✅ (UTM 31N, del listado del cliente) |
| Bagnarelli 24030 | ✅ | ✅ | ⚠️ solo mapa | ✅ | ✅ 17/17 · UNA fila | ✅ (UTM 33N, el DWG ya venía) |
| Páramo 25019 | ✅ | ✅ | ⚠️ solo mapa | ✅ | ✅ 396/396 · UNA fila | ✅ (UTM 30N) |
| Túnez 24021 | ✅ | ✅ | ⚠️ solo mapa | ✅ | ✅ 19/19 · 2V14 | ✅ (UTM 32N, el DWG ya venía) |

«⚠️ solo mapa» = la página abre entera, con su plano y sus NCUs, pero sin malla Zigbee medida.
Lo que falta y cómo se rellena, justo abajo.

---

## Las dos vistas 2D: Layout 2D y Cobertura (2026-08-12)

Compartían botón en el Panel bajo la clave `cobertura`, y eran cosas distintas: en El Burgo abría la
malla Zigbee y en el resto el plano 2D. Ya están separadas, y **las dos existen en las seis plantas**:

| | Página | Qué es |
|---|---|---|
| **Layout 2D** | `plano.html?planta=` | El plano sobre el satélite: seguidores a su largo real, NCUs, meteo, color eléctrico, pile reveal, inversores. |
| **Cobertura** | `index.html?planta=` | La malla Zigbee: enlaces con su RSSI, SPOF, dominadores y máquina del tiempo. |

`index.html` era **solo de El Burgo** y tenía sus ficheros escritos a mano. Ahora:

- El **mapa de la planta** (seguidores + NCUs + meteo del layout) se dibuja en las seis, en un canvas
  propio debajo de la malla, con las **mismas cotas** que el Layout 2D — `resuelveTDIM()` es copia de
  `calcTDIM()`, y el banco lo exige igualdad exacta. Si se toca una, hay que tocar la otra.
- La malla medida se busca **por convención**: `<planta>_real.geojson`. En cuanto exista el fichero,
  esa planta lo coge sola, sin tocar código.
- La telemetría de basculación (pestaña 24 h) va en `PLANTS[planta].ang`; hoy solo El Burgo.

### Lo que hace falta para que una planta tenga cobertura de verdad

Dos ficheros, ninguno de los cuales se puede inventar:

1. **`<planta>_real.geojson`** — la malla medida. Sale del volcado del coordinador con el driver
   `diagnostico_elburgo.py`: puntos = TCU (con `is_spof`, `descendientes`, `rutas`, `rssi_med_dbm`,
   `gw`, `hop_tipico`, `padres_distintos`, `ack_failures`) y líneas = enlaces (con
   `rssi_medido_dbm`, `distancia_m`, `freq`, `origen`, `destino`).

   **Las coordenadas de entrada ya están hechas para las seis**, en `cobertura_coords/<planta>/`, y
   se regeneran con `tools/gen_coords_cobertura.py`. Hay un fichero por ámbito —planta entera, por
   NCU, por **(NCU,GW)** y por GW— y el manifiesto de cada planta dice cuáles hay, con la IP y el
   puerto de cada gateway. El ámbito que se lanza es el **(NCU,GW)**, porque cada uno es una IP:puerto
   del SCADA. Lo que sigue faltando es el volcado del coordinador; eso no se puede generar.

   **Qué se lleva el paquete de campo.** Tres recolectores y la hoja de barrido:

   | | |
   |---|---|
   | `zigbee_logger.ps1` | RSSI, estado, ACK fallidos, tensión y temperatura de cada TCU, en bucle (HTTP/RCI, 80) |
   | `zigbee_routes_logger.ps1` | las rutas y los saltos, en bucle (telnet, 23) |
   | `zigbee_inventario.ps1` | **qué hay puesto**: una vez, una fila por módulo con su nº de serie, firmware, canal y PAN ID |
   | `zigbee_angulos.ps1` | el **ángulo** de cada seguidor del barrido, del Modbus de la NCU, en bucle |
   | `rellena_barrido.ps1` | cruza los ángulos con la hoja, allí mismo al acabar |
   | `barrido_<planta>_NCU<nn>.csv` | la hoja del barrido de calibración |

   **Todo lo que se copia allí es PowerShell.** En el PC de la planta hay PowerShell y no hay
   Python: un paso del léeme que pida `python3` es un paso que no se puede dar, y el que está allí
   no lo puede arreglar. `tools/rellena_barrido.py` hace lo mismo que el `.ps1` para trabajar aquí,
   y una prueba compara las dos salidas **celda a celda** — dos implementaciones de lo mismo se
   separan solas, y la que se separa es la que nadie corre hasta que hace falta.

   Los bancos corren en **es-ES** a propósito: el PC de la planta es Windows en español y allí
   PowerShell escribe «15,5», no «15.5». Bajo `en-US` no se prueba nada de eso — y lo que se rompía
   era la lectura del CSV, en silencio y sin un solo ángulo.

   El **número de serie** de un módulo XBee es su dirección de 64 bits, la misma que va impresa en
   la etiqueta: no hay otro número que leer, y ya viene en el `discover`. El inventario además deja
   `zigbee_inventario_crudo.xml` con las respuestas tal cual — cada firmware de ConnectPort contesta
   un juego de campos distinto y no se puede saber cuál sin preguntárselo al de la planta, así que
   recoge **todo lo que venga** y agrupa las columnas en la unión de lo que conteste cada nodo. Un
   campo que solo trae un módulo (otro firmware) es justo el interesante y no se puede perder.

   **Los recolectores no calibran, y por eso va la hoja de barrido.** Solo ven los enlaces que la
   malla *eligió* —los que funcionan—: una muestra censurada. Las 49 medidas de El Burgo dieron
   **r = +0,16** frente a log(distancia) sobre un recorrido de ×14. La hoja (`plan_barrido_rf.py`)
   trae pares elegidos por **geometría** —a lo largo del eje, a través de filas y en diagonal— para
   que distancia y mesas cruzadas dejen de ir pegadas y el ajuste pueda repartir la culpa. Se
   apunta `llega` (1/0) y la hora, y **los ceros son la mitad del dato**.

   **Y el ajuste ya está escrito y probado, antes del barrido.** `calibra_barrido.py` es un
   **Tobit**: los pares que llegan entran por su densidad y los que **no** llegan por la
   probabilidad de estar bajo el umbral — un cero no es una medida ausente, es la medida de que el
   RSSI está por debajo. Ajusta cuatro números con significado, sin ningún *bias* de relleno:
   `l_mod_db` (dB por mesa **atravesada**), `l_roce_db` (por mesa cruzada **por debajo**: tubo,
   pilotes, canto), `offset_db` y `sigma_db`, estimada a la vez. La predicción se **recalcula al
   `beta` anotado** en cada fila y la geometría se **importa** del planificador, no se reescribe.
   Trae validación fuera de muestra (dejando una clase entera fuera, y k-fold), intervalos por
   **perfil de verosimilitud** y diagnóstico de residuo; y dice en voz alta cuándo un número **no
   está sostenido**: sin ceros, sin cruces por dentro (`l_mod_db` no identificado, hay que medir
   también con las palas **de canto**), con el offset comiéndose el modelo, o con pares que no
   llegaron y el modelo daba por seguros — que suelen ser un equipo apagado, no propagación.

   Se prueba con **datos sintéticos sobre la hoja real de Ayora**: se generan medidas con un
   `l_mod_db` conocido, se les mete censura y ruido, y se comprueba que el ajuste lo recupera
   (`python3 tools/test_calibra_barrido.py`, 41 comprobaciones). Ahí se ve por qué hace falta:
   con el umbral metido en el grueso de las medidas, **tirar los ceros** deja la pérdida por mesa
   en 1,9 dB donde la verdad son 4,5. La hoja se puede simular antes de ir:
   `python3 tools/calibra_barrido.py ayora --simula 4.5,2.0,-3,5 --hoja <hoja> --salida sim.csv`.

   **El ángulo no se apunta a mano.** Está en el Modbus (registro `30111 tilt_angle`, s16 /10) y
   `zigbee_angulos.ps1` lo graba en bucle; al volver, `rellena_barrido.py` lo cruza con la hoja por
   la hora y rellena `beta_grados`, `beta_destino` y `modo_origen`. Dos avisos que valen la tarde:
   ese recolector es **el único que va contra el Modbus de la NCU** (503/504) y no contra el
   ConnectPort — al revés que los otros tres; y la dirección `30111` viaja **tal cual** en la trama,
   con **FC03**, como hace la TCU Toolbox: escribirla como `3xxxx` con offset y FC04 no falla aquí,
   falla en la planta con `IllegalDataAddress`. Lo que no case en el tiempo (±2 min) se deja
   **vacío**: un ángulo inventado entra en el ajuste sin que se note.

   **TCUs retiradas.** El layout es el plano: trae el seguidor aunque le hayan quitado la TCU.
   Sondearla no da un error claro, da un **timeout**, y un timeout en el mapa de cobertura se lee
   como «aquí no llega la señal» — se mide mal una zona que está perfectamente cubierta. Se declaran
   en el layout por número de esclavo (`"sin_tcu": {"7": [14, 24, 25]}` en Ayora, tres retiradas de
   la NCU7) y se quitan **después** de numerar: al quitar una TCU las demás no se renumeran, queda el
   hueco, igual que en la planta. Y en cada pasada el generador **compara lo que va a sondear con lo
   que declara el SCADA** y canta las diferencias en los dos sentidos, para no descubrirlas en campo.

   **El nº de esclavo y la NCU de cada equipo ya están en el repo, no hay que pedirlos.** Cada fila
   de esos CSV lleva `ncu`, `gw` y `esclavo` (el unit id Modbus con el que la NCU habla con ese
   equipo), y las HSU llevan además el suyo (230/231 en Ayora) y cuelgan de la NCU que declara el
   SCADA. Por eso `tools/malla_medida.py` acepta un volcado que solo traiga **`ncu` + `esclavo`**,
   que es como habla el SCADA: la posición y el nombre del plano los pone él desde ese censo.
   El único sitio donde el esclavo NO se puede comprobar contra el id del plano es **El Burgo**,
   cuyo id (`1.10.3`) trae la NCU pero no el número: allí vale el orden natural, que es el que
   reproduce el `coords_ElBurgo_NCU1.csv` original.
2. **`zigbee_log.csv`** — la serie temporal, para la máquina del tiempo. Se carga a mano desde el
   panel; no hace falta que esté en el repo.

Sin ellos la página **no se esconde**: abre entera, encaja sobre la planta y lo dice, con los
contadores en «—» y no en 0 — cero nodos y no haberlos medido no son lo mismo.

### Lo que NO está hecho

- ~~**`t.rot` en el 3D.**~~ **HECHO** en la PR #351, en el mismo empujón que lo escribió. `terreno.html`
  ya mete `rot` en `TRK` y lo aplica en `trackerBase` (`_Q.premultiply` del rumbo), y además muestrea
  el terreno **a lo largo del eje real** del seguidor, no siempre norte-sur. Comprobado desde fuera:
  el eje del tubo de Bagnarelli sale a −156,3° frente a los 180° de El Burgo, o sea sus 23,7° justos,
  en los 17. Es la única planta con `rot ≠ 0` de las seis, así que no afecta a nadie más.
  *(Se quedó marcado como pendiente porque la nota se escribió en la #350 y el arreglo entró en la
  #351. Ojo con eso: otra sesión llegó a rehacerlo por leer aquí que faltaba.)*

---

## Fayón — el siting no cuadra con su layout (2026-08-12) · SIN RESOLVER

Al generar el siting de Bagnarelli y Túnez del layout (`Siting/tools/gen_siting.mjs`, con el
convenio deducido reproduciendo Páramo a 12 mm), se probó el mismo generador contra Fayón para
verificar. **No cuadra**: 23,4 m de distancia media y 28,3 m en el peor caso entre los 24 TCU del
layout y los 24 que ya tiene el siting. No es una traslación —la diferencia varía por seguidor—,
así que las dos fuentes no son la misma.

Lo más probable es que el siting de Fayón se hiciera del **plano de proyecto P06** (de donde salen
sus cotas medidas: 55,16 de largo, 2,413 de cuerda, 6,012 entre filas) y el layout del DWG de
implantación. **No se ha tocado nada**: el 3D de Fayón está dado por bueno y el siting también.

Además, el siting de Fayón tiene **`ox:0, oy:0`** — sin origen UTM, así que no da coordenadas
absolutas. El origen bueno sí se conoce: **E 275719,936 · N 4567402,475** (UTM 31N), que sale tanto
de la ficha del 3D como de convertir su `clat/clon`, y las dos coinciden. Ponerlo requiere saber
antes cuál de las dos geometrías manda.

**Qué hace falta**: decir cuál es la buena. Si manda el P06, hay que corregir el layout del DWG (y
con él el 3D y el Layout 2D); si manda el DWG, hay que regenerar el siting.

---

## Pendientes, por orden de impacto

### 1. ~~Fayón — la georreferencia está desplazada~~ · **RESUELTO (2026-08-11)**
Se resolvió con el **listado de coordenadas del cliente** (`24007 · FAYÓN · Coordenadas_01C.xlsx`),
que trae los **24 TCU en UTM 31N** — mucho mejor que el punto suelto que se pedía aquí.

Lo que se hizo, y **por qué es fiable**: se ajustó una semejanza (escala + giro + traslación) entre
los 24 seguidores del DWG y los 24 TCU del listado. Sale **traslación pura**:

| | valor | lectura |
|---|---|---|
| escala | 1,0000016 | el DWG ya estaba en metros UTM (1,6 ppm = ruido) |
| rotación | −0,0008° | el norte del DWG **es** el norte de cuadrícula UTM |
| residuo | **RMS 3,1 mm**, máx 5,4 mm | sobre 24 puntos y un campo de 155 × 110 m |

Es decir: **las coordenadas locales del DWG son UTM 31N menos un offset constante**. El origen local
(0,0) → **E 275.719,936 · N 4.567.402,475** (EPSG:25831) → **41,2269358 N · 0,3241528 E**.

Corrección aplicada respecto al anclaje viejo del Plus Code: **60,3 m hacia el ESE** (dE +52,5 ·
dN −29,5). Cuadra con el síntoma descrito — el array caía al **noroeste** de su sitio.
Extra: el `id` `TKnnn` del DWG **coincide 1:1 con el número de TCU del cliente** en los 24.

**Dos avisos que quedan vivos:**
- **NCU, HSU y CT — resuelto a la cuarta, y esta es la lección que importa.** Se probaron cuatro
  posiciones y las tres primeras estaban mal **por la misma razón: no eran geometría del equipo**.
  1. El **punto de inserción de los textos** `NCU`/`HSU` del plano (51,18 · −43,93 y 47,27 · −53,62).
     Van **girados 54°**, así que marcan **dónde empieza la palabra**, no dónde está el equipo. De
     aquí salió la posición original del layout, y arrastró desde el principio.
  2. El **listado del cliente** (70,06 · −32,47 y 60,06 · −42,47): redondeado a 10 m.
  3. Los **dos círculos** de r 1,22 m del plano. **No son dos cimentaciones**: sus centros distan
     1,22 m, o sea **se solapan** — es el **símbolo IEC de transformador de dos devanados**.

  Lo bueno son dos **cuadros de 0,29 × 0,29 m** (tamaño de armario en planta), justo fuera de dos
  esquinas opuestas del CT: **NCU (50,49 · −44,25)** y **HSU (48,24 · −50,39)**, a 6,54 m entre sí.

  Y de paso: **Fayón SÍ tiene CT y SÍ tiene posición** — el rectángulo de **3,00 × 6,00 m girado
  ~34°** en **(51,25 · −47,53)**, que es lo que lleva el símbolo del trafo. Lo que decía antes esta
  ficha («el CT solo está como texto en la leyenda, sin posición») **era falso**. Está en `cts` del
  layout y el visor lo levanta con la planta real. Hay una **copia del símbolo en (149,7 · 30,4),
  fuera del vallado**: esa sí es la leyenda — mismo artefacto que los 4 seguidores fantasma.

  **Regla para el próximo**: en estos DWG, un rótulo no es una posición. Buscar la entidad dibujada.
- **Convergencia de meridianos −1,764°**: el eje `n` del layout es norte de **cuadrícula**, no norte
  geográfico, y el visor (`terreno.html:446`) proyecta `n` como si fuera norte geográfico. Queda por
  tanto un giro residual. **Medido** reproyectando los 24 TCU como los proyecta el visor y
  comparándolos con el replanteo del cliente:

  | | error medio | error máximo |
  |---|---|---|
  | antes (Plus Code) | 60,5 m | 61,6 m |
  | **ahora** | **1,49 m** | **2,46 m** (TK002, esquina NO) |

  Ese 1,5 m residual **es** la convergencia, no otro fallo de anclaje. Se deja **sin resolver a
  propósito**: corregirlo obliga a tocar el camino de proyección **común a todas las plantas**
  (El Burgo, Ayora y San José también son UTM y arrastran lo mismo), y no cabe en este cambio.

### 2. ~~Túnez 24021 — falta generar la planta~~ · **GENERADA** (PR #357)
Los 19 seguidores 2V14 salieron del DWG del topógrafo, ya en UTM 32N. Tiene layout 3D, Layout 2D,
cobertura (solo mapa) y, desde Siting#19, siting. Sigue abierto el **descuadre de módulos** contra
la cartera: ver el detalle en el propio PR y en la cartera, donde hay **dos Túnez** (24021 con
datos y 26322 vacío).

### 3. Ayora — 107 seguidores sin clasificar · BLOQUEADO
De los 754, hay **107** que son variantes **anónimas de bloque dinámico**: `*U9` (56) y `*U10` (51).
Se dejaron con su tipo intacto y su nombre de bloque anotado en `blk`. **No se inventó nada.**

Por qué no se pudo resolver, para no repetir el intento:
- Las definiciones de bloque **no son legibles**: el DWG abre con error 68 (lectura parcial) y la
  exportación a DXF de libredwg falla (error 2048).
- Se probó **inferir la longitud por la separación con los vecinos**. La firma parecía perfecta
  (74,9 / 65,7 / 56,5 m para 28/21/14 módulos, lineal). **Se descartó**: validada contra los
  bloques conocidos fallaba el **29 %**, porque el hueco depende también del vecino.

**Qué hace falta**: que alguien diga qué son `*U9`/`*U10`, o un reexport del DWG con los bloques
**explotados o con nombre** (o guardado como DXF desde el CAD).

### 4. Gráfica solar — falta la serie de sombra
En `proyectos/sim-solar.html`. `dayCurve()` guarda `{m, el, az}`; la sombra se calcula **solo para
la hora del deslizador** (tarjeta), nunca como serie, y el bucle de dibujo solo recorre `p.el`.
Para añadirla: **eje propio a la derecha en metros**, con **techo** (o escala log) y dibujada
**solo entre orto y ocaso** — `altura/tan(elevación)` se dispara (3 m de objeto a 1° de elevación
son 172 m y aplastan la curva del sol).

### 5. ~~`crear.html` genera claves de vista antiguas~~ · **RESUELTO** (PR #321, sesión Backtracking)
Ya emite `siting` / `topo3d` / `cobertura`, que sí están en `PLANT_VIEWS`. No emite `asbuilt` ni
`scada` **y está bien así**: son `core:true`, así que al faltar salen **en gris** en vez de
desaparecer, que es justo lo que hace visible la carencia en una planta recién creada.

---

## Geometría del seguidor — el error que ya ha caído TRES veces (2026-08-12)

Va aquí porque lo hemos vuelto a arreglar en sitios distintos y por separado. Si estás tocando
cualquier dibujo de seguidores, lee esto antes.

### La trampa

`t.mods` del layout **no significa lo mismo en todas las plantas**:

- **Ayora**: módulos por **ALA** (28 / 21 / 14)
- **Fayón**: módulos por **FILA** (40 / 48) — "2x1V48" son dos alas de 24

Quien lee el 48 de Fayón como si fuera por ala, le sale el seguidor al **DOBLE**: 110,6 m en vez de
55,16. Ha pasado en el 3D (corregido con `PLANTS.fayon mods:24`), en el siting (PR #18, deshecho) y
en el Plano 2D (PR #340, deshecho). **Usa `t.mr`**, que es la razón real del DWG y sí es unívoca:
Ayora 1 / 0,75 / 0,5 · Fayón 0,833 / 1.

### Las cotas buenas

El largo sale del modelo de `seguidor.js`: `span = 2 · mods_por_ALA · (modW + 0,012) + 0,55`.

| Planta | mód/ala | modW | Largo completo | Filas |
|---|---|---|---|---|
| El Burgo, Ayora | 28 | 1,134 | 64,73 m | 2 (±3,0) |
| San José | 32 | 1,134 | 73,89 m | 2 (±3,0) |
| Fayón | 24 | 1,134 | **55,16 / 46,02 m** (medido) | 2 (±3,006) |
| Bagnarelli | 21 | 1,303 (Risen) | 55,78 m | **1** (filaZ 0) |
| Páramo | 24 | 1,134 | 55,56 / 53,22 m | **1** (filaZ 0) |

Fayón va con cotas **medidas**, no derivadas: salen de la geometría vectorial del plano de proyecto
**P06** (LAYOUT PLANTA SOLAR), que dibuja las 48 bandas de módulos y las 24 bielas. Escala fijada
contra el listado del cliente (`Coordenadas_01C`, UTM 31N):

    cuerda de fila      2,413 m     idéntica en las 48 bandas
    entre filas         6,012 m     centro a centro
    envolvente          8,425 m
    largo 2x1V48       55,16 m      48 módulos a paso 1,149
    largo 2x1V40       46,02 m      40 módulos a paso 1,151

Y queda comprobado que **la mesa va CENTRADA en el punto del listado** (residuo transversal de 1 cm
en los 24). Longitudinalmente el plano la corre hasta 2,1 m (mediana 0,2); no se ha reproducido.

### Bífila y biela

Las plantas de dos filas se dibujan como **dos bandas de `cuerda` a ±filaZ**, no como una mesa
maciza: de la envolvente de 8,4 m solo hay módulos en 2 × 2,382 y el resto es el pasillo, que es por
donde pasa todo. Y **hace falta la biela**: en Fayón el pasillo interior mide 3,60 m y el hueco hasta
el seguidor vecino 3,58 m, o sea que las bandas forman un peine uniforme y sin la biela se leen como
mesas sueltas. La biela mide de **viga a viga** (6,01 m = `2·filaZ`, el `imShaft` del 3D); el plano
solo dibuja los 3,58 m que no tapa el módulo, pero esa no es la cota de la pieza.

Con `filaZ: 0` (Bagnarelli, Páramo) es UNA fila: una sola banda y sin biela.

### La TCU no está en el eje

El punto que guardan layout y listado es el **eje** del seguidor, donde va la biela. La TCU va
atornillada a la **viga del motor** (fila oeste, `terreno.html`: *"TCU, sus abarcones y chapas solo
en la fila OESTE"*), a ~3 m del eje. Importa porque el radio está dentro de la TCU. Ya aplicado en el
siting: marca y cobertura se calculan ahí. Falta el corrimiento a lo largo del tubo (`tcuX = 1,4 m`),
que no está confirmado de qué lado cae.

### Dónde está arreglado

- `siting/index.html` — ✅ cotas medidas, bífila, biela, punto de TCU, obstáculos RF por filas reales
- `cobertura-zigbee/plano.html` (Layout 2D) — ✅ v2.1, cotas derivadas del layout, giro del DWG, las 6 plantas
- `cobertura-zigbee/index.html` (Cobertura) — ✅ mapa de planta con las mismas cotas, las 6 plantas
- `cobertura-zigbee/terreno.html` (3D) — ✅ ya estaba bien

**Sin revisar**: cualquier otro visor que dibuje seguidores (`visores`, `visor-san-jose`,
`proyectos/layout.html`). Si alguno usa `t.mods` como si fuera por ala, tiene el mismo fallo.

### Pendiente de verdad: el modelo RF pinta casi todo en rojo

En el siting, con los obstáculos ya bien contados, la mediana del margen sale en −22 dB en Fayón y
−20 dB en El Burgo, y 208 de 215 TCU de El Burgo quedarían sin enlace. **El Burgo funciona en
campo**, así que el pesimismo está en el modelo de difracción, no en la geometría. Hay medidas reales
para calibrarlo: `elburgo_real_rssi.csv`.

---

## Contrato de datos v2 — UTC (2026-09-19, bloque 1 de 7)

`docs/contrato_datos_zigbee.md` es desde ahora **el documento que manda** sobre columnas, tipos y
unidades de cada CSV. Si el código y ese fichero no coinciden, es un fallo.

**Qué cambia.** Todo timestamp va en **UTC ISO 8601 con `Z`** y cada CSV lleva `schema_version=2`.
Este PR **solo toca el visor y el documento**: los recolectores siguen escribiendo v1 hasta el
bloque 2. El visor ya acepta los dos.

**La zona horaria es la de la PLANTA.** `plantas_indice.json` gana un campo `tz_iana` por planta,
que lo mantiene `tools/indice_plantas.mjs`. Es la fuente: el visor lo pide de ahí y no guarda copia.

| planta | zona |
|---|---|
| El Burgo, Fayón, Ayora, Páramo, El Polvorín | `Europe/Madrid` |
| Bagnarelli, Benante, Catania, Panbianco | `Europe/Rome` |
| Dicayagua | `America/Santo_Domingo` (UTC−4 fijo) |
| San José | `America/Lima` (UTC−5 fijo) |
| Túnez | `Africa/Tunis` (UTC+1 fijo) |

`tz_regla` **no sirve** para convertir: «UTC+2 del día 88 al 298» es una aproximación, y el cambio
cae en el último domingo de marzo y de octubre. `tz_fijo_min` solo da el desfase, no la zona.

Una planta nueva sin entrada en `TZ_IANA` **aborta el generador** sin escribir el índice. Es
deliberado: el fallo tiene que ser ruidoso y donde se arregla, no un silencioso «pues Madrid».

**Qué pasa con los datos ya recogidos.** Nada se pierde y nada se reescribe:

| dato anterior | cómo se reinterpreta |
|---|---|
| `zigbee_log.csv` y `zigbee_routes.csv` sin `schema_version` | hora local **de la zona de su planta** → UTC, con aviso visible en el visor |
| un CSV de una planta cuya zona no se sabe | **no se convierte**: el visor lo dice y ofrece elegir la zona. No se asume Madrid |
| una fila en la hora repetida de octubre | se desambigua **por el orden del fichero**; solo lo que el orden no resuelve se marca `ambigua` |
| una fila en la hora inexistente de marzo | **se descarta** y se cuenta. No se convierte |
| una fila con fecha ilegible | se descarta y se cuenta |
| `timestamp` de v1 | es el del **ciclo**, no el de la fila: todos los nodos de una vuelta comparten marca. No hay de dónde sacar el instante de cada nodo; se lee tal cual |
| `zigbee_routes.csv` de v1 | **solo trae las rutas que salieron bien**. La ausencia de un nodo no se puede distinguir de un fallo |

**Lo que hay que saber para el bloque 2.** `Export-Csv -Append` de PS 5.1 **rechaza** filas cuyas
columnas no cuadren con la cabecera del fichero existente. En cuanto los recolectores escriban las
columnas de v2, el primero que arranque sobre un `zigbee_log.csv` de v1 **muere en planta**. Por
eso el contrato exige comprobar la cabecera al arrancar y **renombrar** el viejo a
`<nombre>.v1.<AAAAMMDDTHHMMSSZ>.csv`. Nunca se borra.

### El agregador `bancos en verde` y los jobs cancelados — NO se relaja

Con `cancel-in-progress: true`, empujar dos veces seguidas deja la ejecución anterior con jobs
**cancelados**, y el agregador los cuenta como rojo. Parece ruido y se propuso tratar `cancelled`
como «no concluyente». **No se hace**, y hay una medida que lo cierra.

**Medido en el runner del repo** (19-09, rama desechable ya borrada): un job con
`timeout-minutes: 1` ejecutando `sleep 150` acaba con **`conclusion: cancelled`**, cortado a los
72 s, y su dependiente lee **`needs.<job>.result == "cancelled"`**.

Es decir: un banco **colgado y cortado por su tope** y uno **cancelado por un empujón posterior**
son **indistinguibles** en `needs.*.result`. Relajar el agregador dejaría pasar exactamente lo que
el tope existe para cazar.

El rojo solo aparece en SHAs sustituidos, que no se mergean. **Manda la ejecución de la cabeza.**

### Rojo que NO es de este bloque: `bench_cobertura_multi.mjs`

Está **rojo en main** (6bcb688), 6 fallos, y lo estaba antes de tocar nada — comprobado con el
árbol limpio. Todos son el mismo: `bench_cobertura_multi.mjs:56` espera **7** plantas en el
selector y hay **10**; el repo tiene ya 12 `*_layout.json` (benante, catania, dicayagua, panbianco
y polvorín se añadieron después). El banco **no está en `bancos.yml`**, que es justo por lo que se
pudrió sin que nadie se enterara. No se toca aquí: decidir si el número bueno es 10 o si sobra
alguna planta del selector no es parte del contrato de datos.

## Arnés de los recolectores (2026-09-19, antes del bloque 2)

Los cuatro `.ps1` corren en el PC de la planta, **con Windows PowerShell 5.1, sin instalar nada y
sin admin**. Dos de ellos ya se ejecutaban en una prueba (`zigbee_angulos.ps1`,
`zigbee_inventario.ps1`); los otros dos **no se habían ejecutado nunca fuera de las plantas**:

| recolector | banco | qué levanta |
|---|---|---|
| `zigbee_logger.ps1` (RSSI) | `tools/test_logger_rssi.py` | ConnectPort falso por HTTP/RCI |
| `zigbee_routes_logger.ps1` (rutas) | `tools/test_rutas_telnet.py` | HTTP para el censo **y telnet de verdad**, socket crudo con negociación IAC |

**No se les toca el bucle para probarlos.** Los dos son `while ($true)`: se les deja hacer **un
ciclo** y se les corta durante el `Start-Sleep`, que es cuando no tienen nada a medias
(`Export-Csv` cierra el fichero en cada llamada). Probar una versión con el bucle desactivado
sería probar otro programa.

La sustitución de CONFIG es **la misma que hace el paquete de medida** (`preparaLogger` y
`preparaRutas`, en `index.html`). Si esa expresión deja de casar, el banco aborta con rc = 2 y lo
dice: es la señal de que el paquete tampoco sabría preparar el recolector.

**Las mutaciones las corre la CI**, no la mano, y exige **rc = 1 exactamente**. `rc = 2` es «no hay
pwsh» o «la mutación ya no casa con el código»: contarlo como cazada sería el falso verde que esto
viene a evitar. Once mutaciones: seis del logger (signo del RSSI, rol HSU/TCU, filtro de routers,
nodo caído, carga del gateway, sello por ciclo) y cinco de las rutas (saltos, COORD, IAC,
separador, puerto).

**Lo que estos bancos dejan fijado es v1, a propósito**, incluidos sus dos agujeros:

- el sello de tiempo es **del ciclo**, no de la fila;
- un nodo **sin ruta no aparece** en `zigbee_routes.csv`, así que «sin ruta» y «no preguntado» se
  confunden.

El bloque 2 cambia las dos cosas. **Cuando se cambien, estos bancos tienen que ponerse rojos** y
hay que darles la vuelta: esa es la prueba de que el cambio ocurrió de verdad.

**Un arreglo real que salió de montar el arnés.** `$GwHost` está documentado como «la misma IP que
en el navegador», y en el navegador cabe un puerto. Con `10.100.1.54:8080` el autodescubrimiento
HTTP seguía funcionando y el telnet intentaba resolver `"10.100.1.54:8080"` como nombre de máquina.
Ahora se le quita el puerto al conectar (`$TelnetHost`); una IP a secas no cambia en nada.

### El arnés corre en las DOS versiones de PowerShell

`pwsh` (7) en `ubuntu-latest` y **Windows PowerShell 5.1** en `windows-latest`, que es la que hay en
el PC de la planta: allí no se instala nada ni hay admin. Probar solo en 7 es probar otro intérprete
y llamarlo el mismo.

`tools/test_export_csv_esquema.py` es una **sonda del entorno**, no un banco del repo: mide qué hace
la versión que tenga delante con las cosas de las que depende el bloque 2. Una versión que no esté
en su tabla sale con **rc = 2** y enseña lo observado, en vez de darse por buena.

### `Export-Csv -Append` NO rechaza: pierde el dato en silencio

El contrato decía —y el comentario del propio logger dice— que `Export-Csv -Append` **rechaza** filas
cuyas columnas no cuadren. Medido, eso es **cierto en dos casos de tres, y falso justamente en el
que le importa al bloque 2**:

| la fila que se añade… | ¿falla? | ¿se escribe? | ¿entran sus columnas? |
|---|---|---|---|
| trae columnas **de más** ← el caso del bloque 2 | **no** | **sí** | **no** |
| trae columnas **de menos** | sí | no | — |
| trae las columnas **renombradas** | sí | no | — |

**5.1 y 7.6.5 dan lo mismo en las tres.** La única diferencia medida entre versiones es el BOM:
`-Encoding UTF8` lo deja en 5.1 y no en 7. Runs 35472054575, 35474112229 y 35475714525.

Es decir: añadir las columnas de v2 sobre un fichero de v1 **no da ningún error** y se come
`ciclo_id` y `latencia_ms` en silencio. Peor que un fallo ruidoso, y convierte la rotación en la
única forma de no perder columnas. Y al revés —un recolector de v1 sobre un fichero ya rotado a v2—
sí falla y no escribe nada: ruidoso, pero deja de registrar hasta que se actualice.

Corregido en `docs/contrato_datos_zigbee.md`, que es el documento que manda.

**El camino hasta este número importa tanto como el número**: la primera versión de la tabla de la
sonda decía que en PowerShell 7 `-Append` falla, porque es lo que dice la documentación de 5.1 y se
dio por bueno para las dos. La CI lo desmintió. Después solo se había probado UNA dirección
—columnas de más—, y al probar las otras dos salió la asimetría, que es lo que explica de dónde
venía la creencia original. Por eso la tabla lleva `None` para lo que no está medido y el banco sale
con **rc = 2** ante una versión que no conoce.

Lo que hizo falta adaptar de los bancos que ya había, que asumían Linux:

- `text=True` sin `errors` decodifica en modo **estricto** con la codificación de la consola. En
  Windows eso puede reventar con `UnicodeDecodeError` en bytes que cp1252 no define. Lleva ya
  `errors="replace"` en los cuatro sitios.
- `test_angulos_barrido.py` abría el CSV **mientras PowerShell lo estaba escribiendo**. En Linux
  eso se tolera; en Windows lanza `PermissionError` y tumbaba el banco. Ahora se reintenta.

### `zigbee_inventario.ps1` NO ARRANCABA en el PC de una planta

Lo encontró la primera ejecución del job de Windows, y es un fallo de campo de verdad, no del
banco. De los cinco recolectores solo `zigbee_logger.ps1` llevaba BOM. Windows PowerShell 5.1 lee
un `.ps1` **sin BOM como Windows-1252**, no como UTF-8, y ahí está la trampa:

```
la raya «—» son los bytes  E2 80 94
el 94 en Windows-1252 es  «”»  — la comilla tipográfica de cierre
y PowerShell 5.1 la acepta como delimitador de cadena
```

Así que esta línea, la 83 de `zigbee_inventario.ps1`:

```powershell
[void]$crudo.AppendLine("<!-- zigbee_inventario.ps1 — respuestas en bruto, ... -->")
```

cerraba la cadena en medio. El error que sale es éste, **y apunta a la línea 162**:

```
zigbee_inventario.ps1:162 char:87
The string is missing the terminator: ".
ParserError ... MissingEndParenthesisInMethodCall
```

El error a 79 líneas del problema es justo lo que hace que esto no se vea leyendo el fichero. Y en
`pwsh` 7 no pasa nada, porque 7 asume UTF-8: por eso el job de Linux lo daba por bueno.

**Arreglado poniéndole BOM a los cuatro que no lo tenían**, que es lo que ya hacía
`zigbee_logger.ps1` — o sea, un camino ya probado, paquete de medida incluido (50 OK después).

### Y detrás salió el segundo, peor: `Invoke-WebRequest` sin `-UseBasicParsing`

Con el fichero ya compilando, el job de Windows enseñó lo siguiente: en 5.1 el `discover`
funcionaba y **todas** las consultas por nodo fallaban, con

```
Object reference not set to an instance of an object.
```

`Invoke-RCIRaw` usa `Invoke-WebRequest`, y **Windows PowerShell 5.1 parsea su respuesta con el
motor de Internet Explorer** si no se le pasa `-UseBasicParsing`. En una máquina sin IE —Windows 11
ya no lo trae, y el runner tampoco— eso revienta.

**Lo grave no es que falle, es cómo falla.** Esa llamada está dentro del mismo `try` que la consulta
de verdad al nodo (`zigbee_inventario.ps1:126` y `:129`), así que la excepción se llevaba por
delante también esa y **cada nodo salía con `estado_ok = 0`**. La planta entera aparecía como nodos
que no contestan: un fallo del programa **disfrazado de problema de radio**. Y el `.xml` en bruto
salía con las etiquetas `<nodo>` abiertas y vacías.

Arreglado con `UseBasicParsing = $true`. En PowerShell 7 el parámetro se acepta y se ignora, así que
vale para las dos versiones.

### EL BOM SE PERDÍA AL EMPAQUETAR — hay que regenerar los paquetes

**Ponerle el BOM a los `.ps1` del repo no bastaba, y por poco se queda así.** El técnico no usa el
fichero del repo: usa el que sale del ZIP de «Medir en planta». Y por ese camino el BOM desaparece:

```
EF BB BF 61 62  ->  Response.text()  ->  TextEncoder.encode()  ->  61 62
```

`.text()` decodifica UTF-8 y **quita el BOM** —lo manda el estándar de Fetch— y `TextEncoder` no lo
escribe nunca. Así que los cinco recolectores llegaban a planta **sin BOM** y
`zigbee_inventario.ps1` seguía sin compilar en 5.1 con el repo ya «arreglado».

Puesto en `preparaColector` (`index.html`), que es el embudo por el que pasan los cuatro, y solo
para `.ps1`.

> **ACCIÓN EN PLANTAS.** Todo paquete descargado **antes de este arreglo** lleva los `.ps1` sin BOM.
> Hay que **regenerarlo** —volver a pulsar «Medir en planta»— para cualquier planta, y **sobre todo
> antes de correr el inventario**, que es el que no arranca. Los otros cuatro sí arrancan; lo que
> tienen sin BOM es mojibake en lo que imprimen.

### Los bancos corren LO QUE SE DESCARGA, no el fichero del repo

Ésta es la lección de fondo: el arnés probaba el `.ps1` del repo, y entre ése y el que llega a
planta hay transformaciones —BOM, sustitución del CONFIG, fines de línea— que quedaban **enteras
fuera de la prueba**. Por eso el agujero del BOM pasó por un banco verde.

- `tools/paquete_planta.mjs` arma el ZIP con el **mismo bloque de `index.html`** que usa la página
  (`preparaColector`, `zipStore`, `leemeDe`): no reimplementa nada.
- Los dos jobs de PowerShell lo generan, lo abren con `zipfile` de Python —que lo lea otro programa
  es parte de la prueba— y **repiten los cuatro bancos** con `PS1_DIR` apuntando a lo extraído.
- Los bancos aceptan `PS1_DIR`; sin esa variable siguen usando el del repo.

### La puerta que vigila las dos

`tools/gate_ps1_planta.py`: un `.ps1` con no-ASCII tiene que llevar BOM, y un `Invoke-WebRequest`
tiene que llevar `-UseBasicParsing`. Corre en el job `nucleo`, no en el de Windows, porque no
necesita PowerShell: el aviso llega en segundos.

Probada en rojo, tres veces: sin BOM, con el `-UseBasicParsing` quitado del splat, y con una llamada
directa sin el parámetro. **Y la prueba en rojo encontró dos agujeros en la propia puerta**: se
señalaba a sí misma (su comentario nombra `Invoke-WebRequest`) y el splat buscaba `UseBasicParsing`
en el texto **con comentarios**, así que un fichero que solo lo mencionara en un comentario pasaba.
Las dos cosas arregladas mirando el código sin comentarios.

---

## Herramientas que quedan hechas

- **`tools/extract_dwg_tracker_types.mjs`** — saca la taxonomía real del DWG y la inyecta en el
  layout. Entiende **dos nomenclaturas**: ACCIONA/San José (manda la **capa**: `IntLargo_ART`) y
  G. Zaragozá/Ayora (manda el **bloque**: `INT_1V28`, `EXT_1V21`, `INT_1V28_ART`).
  Empareja por posición **exigiendo 1:1** y **aborta sin escribir** si algo queda sin pareja.
  Lleva una **guarda**: si no reconoce la nomenclatura devuelve vacío — sin ella, los bloques
  anónimos de Ayora caían en el patrón de San José y salían inventados como "Interior corto".
  ```bash
  npm i @mlightcad/libredwg-web
  node tools/extract_dwg_tracker_types.mjs <plano.dwg> <planta>_layout.json          # dry-run
  node tools/extract_dwg_tracker_types.mjs <plano.dwg> <planta>_layout.json --write
  ```
  Detalle: en varios DWG la miniatura BMP revienta el WASM — el script anula `dwg_bmp`, que no se usa.

- **`proyectos/tests/test_integridad.js`** — 6 comprobaciones del Panel en 2 s, sin navegador.

- **`Siting/tools/gen_siting.mjs`** — saca el conjunto de datos de una planta para el siting a
  partir de su `<planta>_layout.json`. El convenio de coordenadas no se adivinó: se dedujo
  reproduciendo Páramo, que está en los dos sitios (12 mm de media sobre sus 396 TCU). El origen
  UTM se calcula de `clat/clon` cuando el layout no trae `cE/cN`, con una conversión validada
  contra las tres plantas que sí lo traen (3 mm en el peor caso, tres zonas distintas).
  ```bash
  node tools/gen_siting.mjs paramo --verifica    # prueba del convenio contra el que ya existe
  node tools/gen_siting.mjs tunez --write
  ```
  **Guarda**: si el layout no trae `modW/mods/filaZ` NO inventa cotas de mesa — con el
  `|| 1.134` y el `|| 28` que llevaba al principio, Fayón salía con la mesa de El Burgo.

- **`tools/bench_cobertura_multi.mjs`** — banco headless de las dos vistas 2D en las seis plantas.
  Mide de verdad: píxeles pintados, encuadre sobre la planta, contadores, aviso de carencia, y dos
  comprobaciones geométricas que conviene no perder —
  la **georreferencia cruzada** de El Burgo (NCU1 del DWG contra NCU1 de la plantilla SCADA: 1,01 m)
  y el **giro de Bagnarelli** medido sobre los píxeles (eje principal de un seguidor aislado: 113,69°
  frente a 113,70°). Exige además que Cobertura y Layout 2D usen cotas idénticas.
  ```bash
  python3 -m http.server 8123 --bind 127.0.0.1 --directory . &
  node tools/bench_cobertura_multi.mjs
  ```

## Datos ya extraídos de Fayón (por si hay que rehacer el layout)

Coordenadas **locales** respecto al centro del campo de seguidores. Desde 2026-08-11 se sabe que
son **UTM 31N (EPSG:25831) menos un offset**: sumar E 275.719,936 · N 4.567.402,475 las devuelve a
UTM. Las de NCU y HSU son las **del DWG**, no las del listado del cliente (ver pendiente 1).

| Elemento | x | n |
|---|---|---|
| NCU 1 | 51,18 | −43,93 |
| HSU1 | 47,27 | −53,62 |
| Inversores I-1 … I-4 | −58,13 · −22,10 · 13,90 · 37,90 | 6,07 · −3,05 · −23,63 · −30,48 |

24 seguidores = 12 × `2x1V48` + 12 × `2x1V40` = **2.112 módulos**, que cuadra exacto con la cartera.
El DWG trae 28 INSERT: los **4 de más están fuera del vallado y girados 90°** — son la leyenda del
plano, no seguidores (mismo artefacto que los 4 fantasma que hubo en El Burgo).
Los 4 inversores son Sungrow SG350HX de 352 kVA; su planta (1,10 × 0,60 m) es **derivada**, no
acotada. Los largos de mesa del siting (55,4 y 46,2 m) también son **derivados** del paso de módulo
de El Burgo (1,154 m/mód), porque las definiciones de bloque de ese DWG no son legibles.

---

## Aviso de git — esto rompió el Panel dos veces

**No usar `git merge -s ours origin/main` para reconciliar** tras un squash-merge. Ese `-s ours`
marca main como fusionado pero **conserva la versión de la rama**: si la rama arrastra un fichero de
hace horas, el siguiente PR lo empuja encima y **borra en silencio** lo que hayan hecho otras
sesiones — y en el diff parece un simple reordenado.
Usar **`git rebase origin/main`** o un merge normal. En `proyectos`, además, correr
`node tests/test_integridad.js` antes de empujar.

---

## Las DOS cifras de sesgo, y por qué el motor nuevo no lleva ninguna (2026-09-20, fase 1)

Llegaron a convivir dos «calibraciones de El Burgo» que se llaman igual y valen cosas distintas:

| | `Siting/zigbee_pv_model.js:115` | `cobertura-rf-fv/python/zigbee_pv_model.py:300` |
|---|---|---|
| sesgo | **−33,6 dB** | **−16,58 dB** |
| sigma | 6,8 dB | 10,99 dB |
| altura de antena del ajuste | 1,5 m (`RF_ANT_H`, `index.html:2357`) | **0,775 m** (viga 1,50 − caída 0,725) |
| terreno del ajuste | **llano** (`ground: 0` en las llamadas de `index.html:2442`) | **real** |
| patrón de antena | isótropo (no hay `elev` ni dipolo en el fichero) | **dipolo** (`ant_patron`, `dipole_gain_db`) |
| enlaces | **49** (ver abajo) | 49, anotados en `EL_BURGO_AJUSTE` |

**Los dos ajustes son sobre LOS MISMOS 49 ENLACES.** La procedencia del −33,6 estaba a la vista y
no en el código: el bloque `calibracion` de `elburgo_real.geojson` dice
`{"bias_db": −33.63, "sigma_db": 6.82, "n_eff": 0.38, "n_enlaces": 49}` — que es exactamente el
−33,6 y el 6,8 de `defaultParamsElBurgo()`. Y los 49 son los mismos que anota `EL_BURGO_AJUSTE` en
el hermano Python. Eso **refuerza** la conclusión de abajo en vez de debilitarla: con los mismos
datos de entrada, dos modelos distintos dan −33,6 y −16,58. La diferencia está en el modelo, no en
la muestra.

Anótese también el `n_eff = 0,38` de ese bloque: el exponente de pérdida efectivo que sale del
ajuste. El espacio libre es 2,0. Un 0,38 no es un medio de propagación, es el ajuste diciendo que
la distancia casi no explica lo medido.

**No están reconciliadas, y esta nota no las reconcilia.** Lo que sí se puede afirmar mirando los
ficheros es que **no son dos ajustes del mismo modelo**: se hicieron con la antena a alturas que se
diferencian en 0,725 m, uno sobre terreno llano y otro sobre terreno real, y uno con ganancia plana
y otro con patrón de dipolo dependiente de la elevación. Con esas tres diferencias, que las dos
cifras no se reproduzcan no es una contradicción a resolver: es lo esperable. Reconciliarlas de
verdad exige rehacer un ajuste con las tres cosas fijadas, y eso no se ha hecho.

**Ninguna de las dos es una calibración de propagación.** Lo dice el propio comentario del hermano
Python, y conviene no perderlo: el residuo de un ajuste de un solo número «barre unos 35 dB entre
los tramos corto y largo: sobra offset y falta exponente», y sirve «para recentrar el modelo sobre
el nivel típico de un enlace que la malla USA. No para el nivel absoluto de un enlace cualquiera,
ni para decidir a qué distancia deja de haber enlace». Un sesgo global ajustado sobre los enlaces
que sobrevivieron está midiendo la supervivencia, no el medio: en El Burgo la correlación de esas
49 medidas con log(distancia) es r = +0,16 sobre un recorrido de ×14.

**El motor nuevo (`Siting/radio_pv_model.js` + `.py`) NO lleva sesgo global, y no lo va a llevar.**
Lo que en el modelo antiguo tapaba el sesgo —un filo de cuchillo que sube desde el suelo hasta el
borde superior del módulo, y por tanto da por tapado lo que pasa POR DEBAJO del seguidor— está
arreglado en la geometría, que es donde estaba el error. Medido en el banco, enlace de 100 m con
una fila en medio y antenas a 1,0 m: **3,29 dB el nuevo frente a 15,67 dB el antiguo, 12,38 dB de
diferencia**, y sin tocar una sola constante de potencia.

**El modelo antiguo sigue CONGELADO.** `Siting/zigbee_pv_model.js` no se toca ni como envoltorio:
`SolarGPTfull/siting/zigbee_pv_model.lock.json` lo pincha por sha256
(`ac06599f6343a41ac7286cb39d6f392a50a8dd7d1ee3b85a0fc0c5a717ca8d57`, comprobado hoy) y
`SolarGPTfull/tests/test_paridad_rf_zigbee.py` lo corre contra `factiun_core.rf` a 0,000000 dB.
Un envoltorio cambiaría el sha256 igual, y si además delegase en la física nueva rompería esa
paridad. En el visor se queda como **«modelo antiguo (A)»**, sólo para comparar, y rotulado.

**Lo que falta decir cuando Siting cambie de motor:** el PR de ese cambio tiene que enseñar cuánto
se mueven los números **planta por planta**, no en agregado. Hasta entonces, cualquier cifra de
cobertura que circule sigue siendo la del modelo antiguo con su sesgo dentro.

---

## El árbitro de El Burgo: qué dice de verdad, y qué NO dice (2026-09-20, antes de la fase 2)

`elburgo_real.geojson` es el árbitro contra el que se valida la predicción de malla. Antes de
usarlo conviene saber tres cosas, porque las tres se pueden leer mal.

**1. Las 52 líneas NO son la malla: son el árbol del padre dominante.** El exportador dibuja
**una línea por nodo**, de `padre_dominante` a `id`. 53 nodos y 52 aristas, conexo: es un árbol por
construcción. Calcular puntos de articulación sobre esas 52 líneas da 31 de 53 nodos, y no
significa nada — en un árbol todo nodo interno es articulación por definición. La conectividad real
está en `padres_distintos`, y ahí **ningún TCU tuvo un solo padre**: entre 6 y 30, mediana 18, 950
pares padre-hijo observados frente a 52 aristas dibujadas.

**2. El 062 es el nodo más crítico, pero el dato dice que NO es punto único de fallo.**

| | valor |
|---|---|
| descendientes que pasan por él | **47** de 52 |
| hijos directos | 3 |
| padres distintos observados | 9 |
| `hop_tipico` | 2 (cuelga directo del COORD) |
| `is_spof` | **False** |

El único `is_spof: True` de todo el fichero es `COORD`. Y no es que el umbral sea laxo: `UMBRAL`
son **0,5** —articulación en al menos la mitad de los 8.053 instantes— y el propio comentario de
`index.html:1659` explica por qué, «uno esporádico es la malla reconfigurándose, no un punto único
de fallo».

Así que la pregunta «¿identifica el modelo el 062 como punto único de fallo?» tiene la premisa
cambiada: **el árbitro no dice eso**. La pregunta que sí se puede arbitrar, y que es la útil, es si
el modelo lo identifica como **el relé más cargado** — 47 de 52 descendientes, a un salto del
coordinador. Eso sí está en el dato.

**3. El fichero guardado es una exportación VIEJA.** No trae `spof_frac`, ni `generado`
(planta/por/fecha/`umbral_spof`), ni `nodos_sin_coordenada`, que son campos que el exportador
actual de `index.html` sí escribe. Trae en cambio un `calibracion` que el exportador actual deja
deliberadamente a `null`. O sea: para validar la fase 2 **hay que regenerarlo con el recolector**,
como dice el encargo, y ponerlo al lado del viejo. Validar contra este sin regenerar sería medirse
contra una foto de fecha desconocida.

---

## Cuánto se equivoca el motor SIN calibrar, medido contra las 49 de El Burgo (2026-09-20)

> **CORREGIDO EL MISMO DÍA.** La primera versión de esta nota decía **+26,65 dB de optimismo** y
> estaba mal: las filas cruzadas eran una SUPOSICIÓN mía —cruce perpendicular con paso de 12 m— y
> contaba **de menos**. Con las filas reales son **+1,1 dB**. La herramienta que lo rehace es
> `Siting/tools/careo_elburgo.mjs`, con su banco. Se deja escrito el error porque el mecanismo
> vuelve: suponer geometría en vez de sacarla del layout es exactamente el defecto RF-01.

El motor nuevo (`Siting/radio_pv_model.js`) no lleva sesgo global, así que la pregunta obvia es
cuánto se equivoca. Careado contra las 49 medidas del árbitro, en modo TEÓRICO, con las **filas
cruzadas reales** de `rfRows()` contra los extremos reales de cada enlace:

| | REALES | supuestas (paso 12 m) |
|---|---|---|
| filas cruzadas, total | **192** | 146 |
| peor diferencia en un enlace | — | **11 filas** |
| enlaces donde no coinciden | — | **47 de 49** |

### UNA MEDIA NO ES UNA VALIDACIÓN

**Que nadie saque de aquí un número suelto.** Con σ ≈ 10 dB y un recorrido de −18 a +36 dB,
*cualquier* media es compatible con que el modelo acierte y con que falle en los dos sentidos
compensándose. Lo que hay que mirar es la dispersión y la estructura.

**EL ÁNGULO, CERRADO CON LO MEDIDO.** El barrido 0/30/55/90° se queda como **sensibilidad**, no
como resultado: el +1,1 dB que llegó a figurar aquí era un artefacto de haber elegido 30°. Con la
telemetría de basculación **medida** (`trackers_2026-06-17.json`, `field`, cada 5 min):

| | n | media | **σ** | p10 | p50 | p90 | recorrido |
|---|---|---|---|---|---|---|---|
| antena 0,775 m | 49 | **+10,33 dB** | **9,97** | 0,2 | 10,3 | 21,6 | −17,8 … +36,5 |
| antena 1,500 m | 49 | +10,96 dB | 9,61 | −0,5 | 11,2 | 22,2 | −7,5 … +37,3 |

**LA CORRELACIÓN PREDICHO-MEDIDO ES NULA:**

| | r | p | n |
|---|---|---|---|
| Pearson | **−0,009** | 0,95 | 49 |
| Spearman | **−0,014** | 0,93 | 49 |

El modelo **no ordena los enlaces como los ordena el árbitro**. Eso es lo que hay que decir, no
«la media es pequeña».

**Y EL RESIDUO TIENE ESTRUCTURA**, o sea que el modelo reparte mal la culpa:

| pendiente del residuo | dB por unidad | p | |
|---|---|---|---|
| distancia (m) | −0,1370 ± 0,0364 | 0,0005 | **significativa** |
| filas cruzadas reales | **−1,7466 ± 0,2701** | 5,3e-8 | **significativa** |
| `padres_distintos` del nodo | −0,0677 ± 0,2404 | 0,78 | no |

Cobra **1,75 dB de más por cada fila cruzada** y 0,137 dB/m de más con la distancia. Ningún sesgo
global arregla eso: es exactamente lo que la campaña de barrido viene a medir, y para lo que
`calibra_barrido.py` separa `l_mod_db` de `l_roce_db`.

**POR QUÉ LA TELEMETRÍA VA POR `field` Y NO POR SEGUIDOR** — y esto costó un resultado falso antes
de verlo. El preset de El Burgo tiene 215 seguidores y sólo **108 etiquetas distintas**; las dos
entradas de cada etiqueta están a 82–454 m, así que no son las mitades de la bifila: son seguidores
distintos. La clave única es **(NCU, etiqueta)**, 215 de 215, porque la renumeración fue «esclavo
corrido dentro de cada NCU». Y la telemetría va de 1 a **109**, que no cabe ni en NCU1 (1–108) ni
en NCU2 (1–107): es una **tercera numeración** sin correspondencia documentada. Cruzarla por
etiqueta da «202 de 215 coincidencias» y asigna la misma serie a seguidores separados 200 m.

Lo que se pierde al usar `field` está **acotado con el propio fichero**: la dispersión entre
seguidores es de **2,3° de mediana y 28,0° máxima**, y el máximo se concentra en la hora de
transición del backtracking (05:00–06:30). El resto del día la planta va dentro de 1–2°.

**LAS FECHAS DE LA CAMPAÑA NO ESTÁN EN EL GEOJSON.** `periodo_filas_routes` **no es un periodo**:
la línea que lo escribe es `periodo_filas_routes: rutas.filas||0` (`index.html:1700`), o sea el
número de filas del CSV de rutas. En todo el fichero no hay una sola fecha ISO. Comprobado.

**CORRECCIÓN sobre `padres_distintos`.** Esta nota llegó a decir que `r = −0,248` explicaba el
«RSSI del enlace» tanto como la distancia. Con su p-valor, **ninguna de las dos es significativa**
al 5 % con n = 49: p = 0,085 y p = 0,124. Lo que sostiene la conclusión del defecto de atribución
es la **observación directa** —29 dB de recorrido entre enlaces de 12,0 m—, que no necesita
estadística para leerse.

**Sensibilidad al ángulo y a la altura** (media, en dB; queda como sensibilidad, no como resultado):

| antena | tilt 0° | 30° | 55° | 90° |
|---|---|---|---|---|
| 0,775 m | +18,2 | +1,1 | −5,8 | −8,8 |
| 1,500 m | +18,8 | +1,7 | −5,1 | −8,1 |

**La altura casi no importa: 0,64 dB** entre las dos. Los 0,725 m de duda del montaje mueven el
careo menos de 1 dB, así que se puede decidir sin prisa. **El ángulo sí: 27 dB.**

Por régimen: los 5 enlaces **por pasillo** salen +15,2 dB (cruzan 0,80 filas de media) y los 44 de
**cruce**, −0,5 dB (4,27 filas).

La altura de 0,775 m sale de `EL_BURGO_AJUSTE` en el hermano Python; no está medida en campo por
esta sesión.

**EL ENLACE DE 12 m A −87 dBm NO ES UNA OBSTRUCCIÓN: ES EL DEFECTO DE ATRIBUCIÓN.** Lo escribí
primero como «una obstrucción concreta, una antena mal montada o un enlace mal atribuido», y la
tercera es la buena. Medido:

- a **12,0 m exactos** hay **10 enlaces, de −58 a −87 dBm**: veintinueve decibelios A LA MISMA
  DISTANCIA. A 24,0 m, doce enlaces con 20 dB de recorrido.
- `r(padres_distintos del nodo, RSSI) = −0,248` frente a `r(log distancia, RSSI) = −0,223`.
  **Cuántos padres tuvo el nodo explica el «RSSI del enlace» tanto como la distancia.**
- los nodos de esos enlaces de 12 m tienen entre **9 y 24 padres distintos**.

La causa es conocida y está en el punto 6 de la auditoría del recolector: el `rssi_medido_dbm` de
un LineString es la **mediana del NODO** sobre toda la campaña, atribuida a su padre dominante, así
que mezcla los enlaces a todos sus padres. Ningún modelo de propagación explica 29 dB a la misma
distancia ni debe intentarlo.

**Consecuencia para la fase 2:** el árbitro v1 puede acotar el orden de magnitud del desvío frente
a un ESTADÍSTICO DE NODO, pero no sirve para calibrar ni para validar enlace a enlace. Por eso todo
lo que salga de él va rotulado, y por eso hay que regenerarlo.

La herramienta que saca el careo planta por planta es `Siting/tools/malla_plantas.mjs`, y entra en
la CI de Siting con un arranque sobre El Burgo.

---

## Cómo se comprueba una comprobación

El estándar de puertas —piso por banco, alcance publicado, los tres estados
MIDE / NO COMPROBADO / ROJO— vive en un solo sitio:
**[`proyectos/docs/puertas-y-alcance.md`](https://github.com/IMoriana3/proyectos/blob/main/docs/puertas-y-alcance.md)**.

Un original y enlaces; dos copias divergen. `docs/enlace_guia.sh` comprueba en
CI que este enlace apunta a algo que existe — un enlace roto a la guía de
puertas sería el chiste final.
