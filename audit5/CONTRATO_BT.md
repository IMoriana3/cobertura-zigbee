# CONTRATO DE LA FÍSICA DEL BT (lado JS) · paso 4.1

**Alcance.**
- **Qué cubre:** el bloque `FÍSICA PURA` de `backtracking.html` (línea 505)
  hasta `/* FIN-FÍSICA` (línea 4453), más `sol.js` e `irradiancia.js`.
- **Versión y rama:** v1.83.0, rama `claude/refundacion-p3a-6th1im`.
- **Esquema:** `audit5/contrato_bt.schema.json`.
- **Líneas:** son de `backtracking.html` salvo que se diga otro fichero. Las
  ha comprobado quien escribe (R-1: se cita lo que se ejecuta).

**Qué es y qué no.**
- **Es:** lo que la física HACE hoy, escrito para que se pueda verificar.
- **No es:** lo que debería hacer.
- Donde el código y su propio comentario discrepan, se escriben los dos en
  **Huecos declarados**.

## 1 · Entradas

### 1.1 · El terreno `T`

La cabecera de `:712` declara `T = {pairs:[{slope,pitch,axisTilt}], cw, axisAz,
maxAngle, gcr, z0, nBypass}` y **se queda corta**: la física lee además los
campos de la tabla de abajo.

| campo | unidad | significado | dónde se lee |
|---|---|---|---|
| `pairs[p].slope` | ° | pendiente transversal entre las filas p y p+1; signo en §2 | `:714`, `:1278` |
| `pairs[p].pitch` | m | separación entre ejes de la pareja (en planta real, el Δx medido) | `:4686` |
| `pairs[p].axisTilt` | ° (convenio app) | tilt N-S de la pareja = media de sus dos filas | `:719`, `:4687` |
| `cw` | m | cuerda del colector; el GCR de backtracking por pareja es `T.cw/p.pitch` | `:629`, `:1196` |
| `axisAz` | ° brújula | azimut del eje; toda la geometría 3D usa `az-T.axisAz` | `:1826`, `:1947` |
| `maxAngle` | ° | límite simétrico ±maxAngle | `sol.js:124-125`, `:1343` |
| `gcr` | — | `cw/pitch` NOMINAL; solo lo usan astro (sin efecto, `backtrack:false`), mgl (`groundLightFrac`) y `sigT` | `:1265`, `:2450` |
| `z0` | m | altura de la cara sobre el eje; por defecto `REC_OFF` = 0,17 | `:2094` |
| `nBypass` | entero 0..6 | subcadenas que cruza la sombra (escalón de Martinez) | `elecLoss` `:694-709` |
| `iam` | — | b₀ ASHRAE; 0 lo apaga | `:2493-2498` |
| `rowTilt[r]` | ° (convenio app) | tilt N-S por línea; si falta, media de sus parejas | `rowTiltAt` `:1233-1240` |
| `groups` | — | grupos de LÍNEAS para el acople de línea; `null` en mono | `:738-743` |
| `segs[r][k]` | m | tramo `[y0,y1]` a lo largo del eje (y = +norte); sin él, `[[-30,30]]` | `:1412`, `:2017` |
| `segTilt[r][k]` | ° (convenio app) | tilt por mesa; su presencia ENCIENDE la ruta por mesa | `:1700`, `:2641-2643` |
| `segZ[r][k]` | m | `[z_sur, z_norte]` del eje, relativo a la media de planta | `:1724`, `:1836` |
| `segDrive` | — | mesas de un MOTOR (4 en bifila, 2 en mono): mismo θ | `:1784-1799`, `:2775` |
| `segPairs` | — | mesas gemelas; reserva del agrupado si `segDrive` está vacío | `:1797`, `:2775` |
| `real` | objeto | **no es booleano**: es el objeto entero de `plantFromCotas` | `:4695`; efectos en `:924` y `:3510` |
| `mv` | entero | fuerza el número de estaciones axiales | `:919-923` |

**Campos que `T` lleva y la física NO lee a través de `T`:**
- `segSide`, `segMorro`, `lineX`, `filaLen` y `rotula`: dentro del bloque no
  aparece ningún `T.segSide`, `T.segMorro`, `T.lineX`, `T.filaLen` ni
  `T.rotula` (0 coincidencias en `:505-4453`).
- `segSide`, `segMorro` y `lineX` se leen a través del objeto de planta `P`
  (`:2596`, `:2613`, `:2621`).
- `tools/test_esquema_contrato.py` los lista aparte para que no queden fuera en
  silencio.

**Dónde se construye:**
- **Presets:** `terrain(c)`, `:4697-4714`.
- **Planta real:** `plantFromCotas` (`:1567-1809`), montada en `:4675-4695`.
- **Lo que cree la TCU:** `terrainTCU(c,T)` (`:4579-4588`). La política decide
  con `Tcfg`; la sombra y el POA van siempre con `T`.

### 1.2 · Sol, cielo y tiempo

- **Ángulos: grados en TODA interfaz.** Los radianes son internos
  (`const RAD=Math.PI/180`, `:537`).
- **`zen` es APARENTE**, con refracción: `solarPos(ms,lat,lon,{refract:true})`,
  `:546-549`.
  - La sombra se clava a elevación `EL_MIN_FIS` = 0,5° (`:964`,
    `shadeRows`).
- **`az`:** brújula en °, 0 = N, 90 = E (`sol.js:87-93`).
- **`irr = {ghi, dni, dhi}`** en W/m² (`irradiancia.js:42-43`). `poaRow` no lee
  otros campos (`:2509-2529`).
- **`doy`** empieza en 1 (`doyOf`, `:559-562`).
- **`albedo`** es una fracción entre 0 y 1.

## 2 · Signos y marcos

- **Marco:** x = derecha del eje (ESTE con `axisAz` = 0), y = a lo largo del
  eje (NORTE), z = arriba. Sol: `sv=[sin(azR)cos(el), cos(azR)cos(el),
  sin(el)]` con `azR=az-axisAz`, en `:1826-1827`.
- **θ es el `tracker_theta` de pvlib:** θ > 0 mira al ESTE (mañana), con el
  borde este abajo (`:633`, `:992`; `sol.js:103-109`).
  - Con `axisAz` ≠ 0, «derecha» = 90° horario desde `axisAz`. Está deducido de
    la fórmula: no hay comentario que lo diga.
- **`slope` > 0: la fila p+1 (la del este) está MÁS BAJA,** es decir, el
  terreno cae hacia el este. `z[p+1] = z[p] − pitch·tan(slope)` (`:714`,
  `:620-622`); es el mismo convenio que el `cross_axis_tilt` de pvlib.
- **`psz` firmado:** > 0 ⇒ sol a la derecha, y la emisora es la p+1 (`:622-623`,
  `:831`, `:1825`).
- **Tilt N-S (`axisTilt`, `rowTilt`, `segTilt`), CONVENIO APP:** positivo = el
  extremo hacia `axisAz` MÁS ALTO.
  - pvlib, y `sol.js`/`irradiancia.js`, que son su port, lo definen al revés.
  - **La frontera es una sola función:** `const pvTilt=t=>-(t||0);` (`:610`).
    Se aplica en cada llamada a `singleaxis`, `trueTrackAngle` y
    `surfaceOrient`, y en ningún otro sitio (`:596-610`).
  - La geometría 3D propia usa el valor de la app EN CRUDO (`:1273-1274`,
    `:1035`, `:1837`).
  - **Medido:** el 3D y pvlib(−t) casan a 1e-4° (`audit5/P4_signo_tilt.py`,
    con el 3D de `tracker3d.py`, que usa el mismo `a=[0,ca,sa]`).

## 3 · Qué publica cada política

**Por línea: `policyAngles(key,zen,az,T,irr,doy,albedo,prev)`** (`:3745-3783`).
- Devuelve `{angles, f}`, con `angles` de longitud `pairs.length+1`.
- `optimal` añade `retenida` y `frenada`.
- `optfree` añade `fRow`, y su `f` es un número o `{min,max,n}`.

**Por mesa: `policyAnglesSegF(key,…)`** (`:2774-2785`).
- Devuelve `{angles[r][k], f, linea}`, alineado con `T.segs`.
- `astro`, `pairwise`, `optimal` y `optfree` se calculan por mesa y se acoplan
  por motor (`applyDriveSeg` con `segDrive`).
- **El resto** calcula por LÍNEA y la reparte a sus mesas:
  `segsBroadcast(T,o.angles)`, con `linea` = los θ de línea.
- **Sin histéresis:** `prev` no se pasa por esta ruta.

**Qué ruta EJECUTA la página:** `segCmd` (`:5437-5446`).
- Va por mesa solo si `segOn(T)&&Tcfg===T&&POL_POR_MESA[key]`, con
  `POL_POR_MESA={pairwise:1,astro:1,optimal:1,optfree:1}`.
- Si no, va por línea.

**Límites y noche:**
- Todo θ publicado queda en [−maxAngle, maxAngle]:
  - `singleaxis` recorta (`sol.js:124-125`);
  - `true3d` y `optfree` recortan explícitamente (`:1343`, `:3110`);
  - `optimal` es una combinación convexa de dos conjuntos dentro del rango
    (`:2954-2960`).
- **De noche, 0°:** `singleaxis` devuelve NaN y todo sitio que lo llama lo
  envuelve en `nan0` (`:893`).

## 4 · Con qué se COBRA la energía

- **Planta con mesas** (`segTilt` presente): `poaPlantSeg(...).plant`
  (`:2792`), en W/m².
  - Es la media POR MESA ponderada por su largo (`:2859-2860`).
  - Por mesa: `v = beam·(1−se) + circ·(1−fo) + sky + gnd` (`:2805`).
  - `fo` es la fracción óptica de `shadeRows` → `shadeBand3DAll`, el ray-cast
    3D con estructura y terreno.
  - `se` es la pérdida eléctrica de Martinez.
- **Planta sin mesas:** `poaPlant(...).plant` (`:2532`), la media SIN
  ponderar por fila.
  - `fast=true` usa el 2.5D `shadeRows25`, y SOLO para buscar.
- **Es irradiancia instantánea, no energía:** el día y el año la integran
  (`:5512`, `:7683`).

## 5 · Acople de accionamiento

- **`applyDrive(angles, groups)`** (`:752-761`): el par de LÍNEAS toma el θ de
  menor |θ|; en empate, la primera.
- **`applyDriveSeg(segAngles, grupos)`** (`:2755-2768`): lo mismo sobre las
  mesas de un motor.
- **`driveCoupleSafe(zen,az,T,angles,crit3d)`** (`:794-874`): aplica
  `applyDrive` y, si con `zen` < 87° quedan parejas en sombra, barre el grupo
  EMISOR dentro de `rangoHaz`.
  - Paso: 1° con más de 30 parejas, 0,25° si no. Hasta 6 iteraciones.
  - Elige el candidato sin sombra más CERCANO al original.
  - **Es una reparación de sombra, no solo un acople**
    (`audit5/REFUNDACION_P3.md`, REFUTACIÓN 1).
- **Declarado junto al código** (`:3767-3778`): en planta real, el acople de
  LÍNEAS enteras de `row`, `true3d` y `mgl` NO es una restricción del
  accionamiento, porque ningún motor mueve dos líneas. La unidad real es
  `segDrive`.

## 6 · INVARIANTES

**INVARIANTE 1 · decidir con lo que se cobra** (decisión del titular,
`audit5/REFUNDACION_P4.md`).
- El criterio con el que una política DECIDE y la función con la que se COBRA
  tienen que ser LA MISMA.
- Hoy solo `optimal` la cumple. La revisión con citas está en
  `audit5/REFUNDACION_P3.md`, «La revisión de las nueve».
- Toda política que no la cumpla lleva su desajuste MEDIDO en el contrato
  (tres columnas: SOMBRA / AOI / OBJETIVO). Ningún optimizador nuevo entra
  sin cumplirla.

**INVARIANTE 2 · una sola frontera de signo con pvlib.**
- El tilt N-S cambia de signo SOLO en `pvTilt` (`:610`), y en toda llamada a
  una función de convenio pvlib.
- Toda la geometría propia usa el convenio de la app.
- **Verificación:** la prueba de `audit5/P4_signo_tilt.py`, llevada al JS.
  Tiene que casar con −t y fallar con +t (control negativo).

**INVARIANTE 3 · rango.** Todo θ publicado está en [−maxAngle, maxAngle], y de
noche es 0.

**INVARIANTE 4 · unidad de mando.**
- Con `segDrive` presente y ruta por mesa, todas las mesas de un motor
  reciben el MISMO θ (`tools/test_unidad_accionamiento.mjs`, comprobación 1).
- Por línea (`row`, `true3d`, `mgl`) la unidad es el par de líneas. Está
  declarado y contado; no puede empeorar respecto de `main`.

**INVARIANTE 5 · un solo delimitador de cierre.**
- La física se consume CORTÁNDOLA, y los consumidores cortan de forma distinta:
  - `produccion.html:1914` usa `indexOf('/* FIN-FÍSICA')`, la PRIMERA
    aparición;
  - los bancos usan `lastIndexOf`, la ÚLTIMA (`tools/test_caras_bajo_demanda.mjs:46`,
    `audit5/lib_simulador.mjs`).
- Hoy hay UN marcador (`:4453`) y cortan lo mismo. Con un segundo marcador,
  cortarían bloques distintos sin avisar.
- **Verificación:** `tools/test_vectores_bt.mjs` exige exactamente un
  `/* FIN-FÍSICA` y un `FÍSICA PURA —` de apertura.

## 7 · Huecos declarados (el código y su propia descripción discrepan)

1. **Cabecera incompleta.** La de `T` (`:712`) omite 12 campos que la física
   lee: los 10 de la tabla que no declara (`iam` … `mv`), más `drive`
   (`:769`) y `pitch` (`:1998`).
2. **`real` no es un booleano.** Es el objeto de la planta, y su presencia
   apaga `repairNoShade` (`:3510`).
3. **`T.pitch` no se rellena nunca.** Se lee en `:1998`, pero `terrain()`
   nunca lo pone, así que siempre se usa el valor de reserva.
4. **`gcr` sale del pitch NOMINAL** de la interfaz, no del medido por pareja
   (`:4690`). `mgl` lo usa.
5. **La fila interior de `pairwise` toma `min(sg·θ)`, no `min|θ|`**
   (`:1198-1203`). `tracker3d.py` usa `min|θ|` (`tracker3d.py:248-250`).
6. **`driveCoupleSafe` no biseca: barre.** Su comentario dice «se aplana el
   grupo EMISOR por bisección» (`:784-793`), pero el código barre por pasos.

## 8 · Verificación del esquema

`tools/test_esquema_contrato.py`:
- **Válidos:** el `T` de Ayora tal como lo monta la página
  (`audit5/P4_dump_T.mjs`) y un preset con la forma de `terrain(c)`.
- **Seis controles negativos, y SUSPENDEN:** `real` booleano, `drive`
  desconocido, `segTilt` sin `segs`, pareja sin `axisTilt`, `nBypass` 7, y un
  motor con una mesa mal formada.
- **Dónde corre:** hoy, en local (`jsonschema` 4.26). Pasarlo a CI va con los
  vectores (4.2).

## 9 · Consumidores de la física (inventario, 2026-09-24)

Se busca quién nombra `backtracking.html` y, de esos, quién CORTA y EJECUTA el
bloque. Un consumidor que ejecuta es un sitio donde un cambio de física se nota;
uno que solo enlaza, no.

| consumidor | cómo | cita |
|---|---|---|
| `produccion.html` | EJECUTA: `fetch('backtracking.html')` y corta el bloque en caliente, sin copia | `:1910-1926` |
| `overcast.html` | enlaza y comparte `sol.js` / `irradiancia.js`; su propio bloque FÍSICA PURA es OTRO | `:148` |
| `terreno.html` | describe la misma operación que el botón «👁 sol»; no ejecuta el bloque | `:731` |
| `docs/algoritmos_backtracking.html` | documento de referencia; no ejecuta | `:49` |
| `sol.js`, `irradiancia.js` | la física los USA (van delante del bloque); declaran su procedencia | `sol.js:16`, `irradiancia.js:19` |
| `tools/` (23 bancos y herramientas) | EJECUTAN el bloque (cortado, o vía `cargaSimulador` / `rutasAnuales`) | p. ej. `tools/test_vectores_bt.mjs`, `tools/careo_produccion.mjs:25-30` |
| `SolarGPTfull/tools/parity_js_core.py` | EJECUTA el bloque cortado (arnés de paridad JS ↔ core) | `:133` |
| `SolarGPTfull/solargpt/scripts/cruce_circunsolar_js.py` | transporta sol, cielo y terreno desde la página | `:3` |
| `proyectos/sim-solar.html`, `gemelo-digital/sim/campo3d.js` | citan la página como origen de ajustes; no ejecutan | `sim-solar.html:986`, `campo3d.js:69` |

- **Método:** búsqueda de la cadena `backtracking.html` en `*.mjs`, `*.js`,
  `*.py` y `*.html`, más de «FÍSICA PURA» o de los cargadores. No se miró
  `audit*/`: son medidas, no consumidores.
- **Otros repos:** `proyectos` y `gemelo-digital` se leyeron de clones locales
  SIN `git fetch`, así que pueden estar atrasados.
- **Límite:** es un inventario por cadena, así que un consumidor que construya
  la ruta con variables no sale. Es la regla de la casa de `SolarGPTfull`:
  «buscar por consumidor y por AST, nunca solo por cadena». Declarado.

## 10 · Lo que NO está en este contrato

- **La paridad con `tracker3d.py`:** PARADA por el hallazgo 4.0
  (`audit5/REFUNDACION_P4.md`), pendiente de la decisión del titular.
- **Los vectores congelados (4.2)** están en `tools/vectores_bt/` (banco `tools/test_vectores_bt.mjs`, en CI con piso 17): son el CUÁNTO de este contrato.
