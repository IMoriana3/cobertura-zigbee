# Traspaso — estado de las plantas y qué falta

Nota para la siguiente sesión (o para otra persona). Lo que sabía una sesión y no estaba en ningún
sitio se pierde al cerrarla; esto lo pasa al repositorio. **Quien avance algo, lo tacha aquí.**

Contexto de coordinación: en el repo `proyectos` hay un `CONTRATO.md` entre las sesiones que editan
el Panel. Este fichero es lo equivalente para las **plantas**.

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

### Bífilo y biela

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

- `siting/index.html` — ✅ cotas medidas, bífilo, biela, punto de TCU, obstáculos RF por filas reales
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
