# Traspaso — estado de las plantas y qué falta

Nota para la siguiente sesión (o para otra persona). Lo que sabía una sesión y no estaba en ningún
sitio se pierde al cerrarla; esto lo pasa al repositorio. **Quien avance algo, lo tacha aquí.**

Contexto de coordinación: en el repo `proyectos` hay un `CONTRATO.md` entre las sesiones que editan
el Panel. Este fichero es lo equivalente para las **plantas**.

---

## Estado por planta

| Planta | Layout 3D | Plano 2D | Siting | Tipos reales del DWG | Georref. |
|---|---|---|---|---|---|
| El Burgo I 23003 | ✅ | ✅ | ✅ | ✅ 5 tipos (int/ext/medio × rótula) | ✅ |
| Ayora 24025 | ✅ | ✅ | ✅ | ⚠️ 647 de 754 (ver abajo) | ✅ |
| San José 24019 | ✅ | ✅ | ✅ | ✅ 2289/2289 · 1723 articulados | ✅ |
| Fayón 24007 | ✅ | ✅ | ✅ | ✅ 24/24 (2 longitudes) | ✅ (UTM 31N, del listado del cliente) |
| Túnez 24021 | ❌ | ❌ | ❌ | — | (UTM 32N, sí) |

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
- **NCU y HSU del listado no valen**: vienen en números redondos (E 275.790/275.780 · N
  4.567.370/4.567.360) y quedan a **22,1 m** y **17,0 m** de donde los sitúa el DWG. Son nominales,
  no replanteo. Se ha **mantenido la posición del DWG**, que es la autoridad.
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

### 2. Túnez 24021 — falta generar la planta · BLOQUEADO
DWG: `IMPLENTATION_TOPOGRAPHE.dwg`. Georreferenciado en UTM 32N (≈578.000 / 3.747.900).
Los seguidores **no son bloques**: son 1.067 rectángulos de módulo (2,3 m) en la capa
`KTR Tracker STI-H250`, que agrupan en ~19 mesas de ~56 módulos → cuadra con el `trk_total` 19 de
la cartera. Hay además una **instalación fija** aparte: capa `mesas`, 72 módulos de 1,3 × 2,2 m en
un bloque de 8 × 4 m, 17 m al norte del campo (NO estaba contada en los 1.067).

**Descuadre sin resolver**: 1.067 + 72 = **1.139** módulos frente a los **1.344** de la cartera.
**Qué hace falta**: saber si ese plano topográfico está incompleto o si la cartera es de otra fase
— en la cartera hay **dos Túnez**, el 24021 (con datos) y el 26322 (vacío).

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
