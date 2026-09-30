# Auditoría de backtracking JavaScript y control

## 1. TASK IDENTIFICATION

| Campo | Valor |
|---|---|
| TASK_ID | `02-BACKTRACKING-JS__cobertura-zigbee` |
| TARGET_CHAT | `02_BACKTRACKING` |
| repository | `cobertura-zigbee` |
| audited base branch | `work` |
| audited base commit SHA | `adcc6ee948f800727b52059af61b2cc5c355f74f` |
| audit date | `2026-09-21` |
| audit status | `COMPLETE_WITH_UNKNOWNS` |
| modo | `AUDIT_ONLY_THEN_PERSIST_REPORT` |

Durante la investigación no se modificó código productivo, tests, configuración, esquemas ni datos de planta. Este informe es la única modificación autorizada.

### Criterio de clasificación

- `CANONICAL`: fuente de verdad dentro del alcance del repositorio.
- `MIRROR`: traducción que pretende equivalencia con una fuente externa.
- `ADAPTER`: adapta entradas, configuración, estado o salidas sin poseer la física base.
- `APPROXIMATION`: simplificación o modelo local sin equivalencia demostrada.
- `LEGACY`: camino anterior todavía presente o artefacto histórico.

Toda discrepancia se clasifica como `INTENTIONAL`, `APPROXIMATION`, `LEGACY`, `BUG` o `UNKNOWN`.

## 2. EXECUTIVE FINDINGS

1. **No hay una sola implementación JavaScript de backtracking/control.** Hay un motor geométrico grande en `backtracking.html`, un espejo de tracking difuso en `overcast.html`, un núcleo stateful de actuador en `js/control_core.js`, y adaptadores de producción en `produccion.html`. Comparten `sol.js`, `irradiancia.js` y `seguidor.js`, pero no comparten todo el pipeline ni el mismo lazo ejecutable.

2. **`sol.js` es la fuente JavaScript única local para posición solar, true tracking y `singleaxis`.** Implementa NOAA, `trueTrackAngle` y el backtracking 1D de pvlib. `backtracking.html`, `produccion.html` y `overcast.html` lo consumen. Es `CANONICAL` dentro del repositorio para esas piezas, pero `MIRROR` respecto de pvlib/NOAA.

3. **El denominado BT3D no está demostrado como equivalente al control real.** `backtracking.html` declara un port de `tracker3d.py`, pero no existe un golden Python↔JS versionado para `anglesPairwise`, `anglesTrue3d`, el acople, la reparación global ni el orden control/guardrail. Los tests son fuertes en invariantes y oráculos geométricos independientes, pero no sustituyen una comparación contra una revisión identificada de `solargpt_core`.

4. **“BT2.5D” no es una política separada.** Es el marco geométrico analítico usado por pairwise, sombra por pareja, acople y parte de las búsquedas. `BT2D plano` sí es una política distinta: pvlib sin pendiente. `true3d` añade bisección/residual 3D, deferral y guardia de degeneración hacia la baseline pairwise.

5. **El control más explícito es direccional, stateful y con adelanto.** `js/control_core.js` mantiene `dir`, `park` y `dirUlt`; arranca al alcanzar la banda en marcha inicial, invierte sólo al superarla estrictamente, y apunta a `target + deadband·direction`. Ejecuta slew a ciclos de 1 s por defecto. Esto no es un deadband simétrico sin estado, aunque el umbral geométrico use `|error|`.

6. **La inversión y el threshold son deliberadamente asimétricos:** arranque en frío con `|error| >= deadband`; inversión con `|error| > deadband`. Exactamente en el threshold arranca en el sentido anterior/continuado, pero no invierte. `dirUlt` evita chatter después de aparcar una banda por delante.

7. **El deadband se aplica después de calcular backtracking.** En `produccion.html`: política → stow nocturno como consigna → `CTRLCORE` → POA/sombra. El modo `seguro` recibe además un booleano que indica que la consigna está recortada por backtracking y puede arrancar antes para no permanecer sobreinclinado.

8. **El simulador `backtracking.html` usa otro lazo.** Su `crearLazo()` replica adelanto, destino enclavado y reversión estricta, pero sólo lo evalúa una vez por muestra de 5 minutos. No usa `CTRLCORE.execTramo()` ni su ciclo de 1 s. Después aplica un guardrail dirigido (`topeBacktracking*`) con ray-cast. Por tanto no es ejecutablemente equivalente al lazo de `produccion.html`.

9. **El guardrail posterior existe y sólo está integrado plenamente en `backtracking.html`.** Orden real: consigna de política → lazo → clamp dirigido respecto de consigna BT/astronómica → comparación de sombra contra la consigna → vuelta a la consigna si el adelanto empeora sombra → POA. `produccion.html` modo `seguro` limita adelanto dentro del lazo, pero no llama a `topeBacktracking()` ni al oráculo posterior.

10. **Stow no bypassa el lazo en producción.** Se convierte en consigna nocturna de +5° este, recortada a límites mecánicos, antes del control. El modo manual sí bypassa el stow. `backtracking.html` no modela el stow nocturno dentro de su día: las políticas convierten NaN nocturno a 0; `produccion.html` corrige esto externamente. `overcast.html` sí usa stow +5°.

11. **No se encontró una capa explícita de safety/stow de viento que bypassase deadband.** Hay hard-stop mecánico y stow nocturno, pero no una secuencia demostrada para alarmas de viento/nieve/emergencia. Su orden respecto de deadband queda `UNKNOWN`.

12. **Axis azimuth está correctamente propagado en el JS común, pero hay evidencia de un bug en el core Python auditado históricamente.** El golden de `overcast` compara el espejo con una variante Python corregida que propaga `axis_azimuth`; registra 38 decisiones distintas con eje girado y ninguna con eje N-S. Esto es una divergencia intencional y documentada, no paridad literal con el core roto.

13. **El terreno real entra por cotas medidas por mesa y vano**, con `pairDz`, pitch por vano, tilt N-S por mesa, segmentos, parejas y grupos de accionamiento. La creencia de la TCU puede ser el levantamiento, pendiente cero o ficha; la sombra/POA siempre se evalúa sobre geometría real.

14. **Las filas de borde reciben tratamiento explícito**, pero dependen de qué camino se use. Pairwise por línea toma el único vano disponible; por mesa, una mesa sin solape cae al BT de su línea. Herramientas de careo declaran que los bordes de ventanas recortadas pueden diferir de planta completa.

15. **La evidencia de paridad es desigual.** `overcast` tiene 1.104 vectores golden contra Python para baseline/Perez/políticas difusas; cadena eléctrica tiene goldens del core; `produccion` extrae en caliente la física de `backtracking.html`. BT3D y `DirectionalController` carecen de un golden externo con SHA de fuente. Los tests locales prueban invariantes, no identidad completa con SolarGPTfull.

## 3. IMPLEMENTATION INVENTORY

### 3.1 Sol, true tracking e irradiancia

| Fichero / símbolo | Implementación | Defaults/unidades | Clasificación | Evidencia de test |
|---|---|---|---|---|
| `sol.js::solarPos` | NOAA; elevación geométrica por defecto, aparente con `{refract:true}` | ms UTC, lat/lon grados; salida grados | `CANONICAL` local / `MIRROR` NOAA | `test_backtracking_sim`, `test_overcast_sim` |
| `sol.js::trueTrackAngle` | Ángulo ideal firmado equivalente a `pvlib.tracking.singleaxis` antes de BT/clamp | grados; `axisTilt`, `axisAz` | `CANONICAL` local / `MIRROR` pvlib | fórmula cerrada en `test_backtracking_sim`; golden indirecto en overcast |
| `sol.js::singleaxis` | true tracking, BT 1D por GCR/cross-axis tilt y clamp mecánico | default `maxAngle=60` sólo si no se pasa; GCR adimensional | `CANONICAL` local / `MIRROR` pvlib | tests de perfil, golden `theta_n` |
| `irradiancia.js::dniExtra` | Spencer 1971 | W/m², constante 1366,1 | `CANONICAL` local / `MIRROR` pvlib | días golden/microvatios |
| `irradiancia.js::airmassKY` | Kasten & Young 1989 | zenit grados | `MIRROR` | test de cielo claro |
| `irradiancia.js::clearskyIneichen` | Ineichen-Perrin; realce Perez apagado por defecto | W/m², altitud m, TL | `MIRROR` | tests backtracking/overcast |
| `irradiancia.js::surfaceOrient` | `calc_surface_orientation` | θ/tilt/az grados | `MIRROR` | golden de POA y casos axis tilt negativo |
| `Sol.cloudToIrr` | Escenario sintético de nube: GHI `(1-0,70cc)`, DNI `(1-cc)^3`, DHI por cierre | cc 0..1, W/m² | `APPROXIMATION` declarada | tests cc=0/1 y fuzz |

### 3.2 Políticas de tracking/backtracking en `backtracking.html`

| Símbolo | Semántica ejecutable | Clasificación |
|---|---|---|
| `anglesAstro` | True tracking por fila, sin BT, con tilt local y clamp | `MIRROR` pvlib |
| `anglesBt2d` | Un BT pvlib plano, sin pendiente/relieve | `LEGACY`/referencia de diseño |
| `anglesGlobal` | Un ángulo con pendiente, pitch y tilt medios | `APPROXIMATION` |
| `anglesRow` | BT independiente por fila usando media de dos vanos y tilt local | `MIRROR` candidato de `compute_bt_angles_rowwise` |
| `anglesPairwiseRaw` / `anglesPairwise` | BT por pareja; interior toma el candidato más backtrackeado; torsión se revisa y barre | `MIRROR` candidato, equivalencia externa no probada |
| `anglesTrue3d` / `bt3dPairMaxMag` | Bisección 36 iteraciones, margen 0,5°, residual 3D, deferral zen≥82°, guard tilt≤0,5° | `MIRROR` candidato / `APPROXIMATION` hasta golden externo |
| `anglesMinGroundLight` | Parte de pairwise y reduce luz al suelo manteniendo restricciones | `APPROXIMATION` de optimización local |
| `anglesOptimal` | Grid común `f={0,¼,½,¾,1}` entre pairwise y astro | `MIRROR` candidato del whitepaper/core |
| `anglesOptimalFree` | Optimización por accionamiento a partir del óptimo común | `APPROXIMATION` local |
| `driveCoupleSafe` | θ común por grupo y refinado contra sombra/residual | `APPROXIMATION` física del accionamiento; candidato `MIRROR` |
| `repairNoShade` | Reparación global, sólo presets/no `T.real`; guardia energética | `APPROXIMATION` local, no demostrada como core |
| `policyAngles` | Dispatcher y orden de acople/reparación | `CANONICAL` local para el simulador |
| `policyAnglesSeg` | Por mesa sólo para `astro` y `pairwise`; otras políticas se difunden desde línea | `ADAPTER` con limitación explícita |

Constantes materiales:

- `AOI_HAZ=88°`.
- `EL_MIN_FIS=0,5°` de elevación.
- `E_EMPATE_W=0,05 W/m²` de planta.
- `PASO_BUSQ=0,1°`, `PASO_GRUESO=0,5°`, barrido uniforme grueso `2,5°`.
- true3D: 36 iteraciones; margen `0,5°`; guard 2.5D `EPS_TILT=0,5°`; deferral desde zenit `82°`.
- hard stop por `T.maxAngle`; defaults UI/core habitualmente ±55°.

### 3.3 Geometría, tracker, terreno y accionamiento

| Fichero / símbolo | Responsabilidad | Clasificación |
|---|---|---|
| `seguidor.js::DIMS` | Geometría render común: módulo, gaps, tubo, offset, poste, motor, TCU | `CANONICAL` local de render; `MIRROR` de ficha/proyecto |
| `seguidor.js::parts/buildGroup` | Piezas y matrices del tracker compartidas por visores | `CANONICAL` de visualización, no del algoritmo BT |
| `backtracking.html::terrain` | Contrato `T`: pares, ancho, azimut, límites, filas, segmentos, grupos | `CANONICAL` local / `ADAPTER` de layouts/cotas |
| `pairsFromElev` / `pairsFromElevX` | Cotas → slope transversal por vano | `ADAPTER` geométrico |
| `plantFromCotas` | Cotas por extremos → líneas, mesas, tilts, `pairDz`, parejas, accionamientos | `ADAPTER` de datos medidos |
| `terrainTCU` | Separa terreno real de la geometría que cree la TCU | `ADAPTER` de configuración |
| `driveGroups`, `applyDrive`, `effRowTilts` | Monofila, bifila rígida y bifila quebrada | `APPROXIMATION` del actuador real |
| `produccion.html::buildT/buildTX/buildTReal` | Construye el mismo contrato `T` para producción | `ADAPTER` |
| `*_layout.json` | Posiciones, montaje, NCU, tipo y geometría nominal | `MIRROR` generado de fuentes de planta |
| `ayora_cotas.json`, `sanjose_cotas.json` | Cotas/tilts/mesas medidas o reconstruidas | `MIRROR` de levantamiento con partes interpoladas |
| `terreno.html` | Visualización/editor de relieve y activo | `ADAPTER`; no es fuente algorítmica de BT |

Convenciones del render `seguidor.js`: +X a lo largo del tubo N-S, Y arriba, Z transversal; giro de panel sobre X; el motor sale hacia −Z. Sus cotas por defecto son módulo 1,134×2,382 m, gap 0,012 m, gap motor 0,55 m, tubo 0,12 m, offset superficie-eje 0,14 m y 28 módulos por mesa.

### 3.4 Control y deadband

| Fichero / símbolo | Semántica | Clasificación |
|---|---|---|
| `js/control_core.js::CANON` | deadband 1°, slew 0,17°/s, ciclo 1 s | `CANONICAL` local de `produccion.html`; fuente externa `UNKNOWN` |
| `CTRLCORE.step` | Máquina stateful direccional con `dir`, `park`, `dirUlt`, lead y hard stop | `MIRROR` candidato de `DirectionalController`; paridad externa incompleta |
| `CTRLCORE.execTramo` | Interpola consigna entre muestras y ejecuta ciclos finos | `CANONICAL` local |
| `CTRLCORE.execVector` | Estado por fila/mesa | `ADAPTER` vectorial |
| `backtracking.html::crearLazo` | Implementación paralela y simplificada, una evaluación por muestra | `LEGACY`/`MIRROR` incompleto |
| `backtracking.html::topeBacktracking*` | Clamp dirigido y guardia ray-cast posterior | `MIRROR` candidato de `clamp_adelanto_dirigido` + `APPROXIMATION` local del oráculo |
| `overcast.html::applyControlLoop` | Máquina de adelanto en rejilla fina de 1 min | `MIRROR` candidato de DirectionalController |
| `overcast.html::execOnFineGrid` | Expande consignas de decisión a rejilla de actuador y aplica guardrail | `ADAPTER` |
| `produccion.html::instant` | Integra política, stow, `CTRLCORE`, POA y estado | `CANONICAL` local de producción |

### 3.5 Producción y difusa

`produccion.html` no copia el motor BT: carga `backtracking.html`, extrae el bloque `FÍSICA PURA` y construye funciones dinámicamente. Esto reduce duplicación, pero es un acoplamiento textual/frágil: delimitadores y símbolos son API implícita. Clasificación: `ADAPTER`.

`overcast.html` implementa cinco políticas: baseline pvlib y cuatro políticas difusas (`flat`, `limited`, `continuous`, `poa_switch`). Tiene un golden de Python para baseline, Perez y esas cuatro políticas. Es el `MIRROR` mejor demostrado del repositorio, aunque deliberadamente corrige la propagación de axis azimuth frente al core golden histórico.

## 4. EXACT OPERATION ORDER

### 4.1 `backtracking.html` — día simulado

Orden ejecutable reconstruido desde `computeDayGen` y `serieDiaGen`:

1. Leer configuración UI.
2. Asegurar vector de elevaciones y limitar pendientes **sólo para presets**, nunca para planta real.
3. Construir `T=terrain(c)` con geometría real/preset.
4. Construir `Tcfg=terrainTCU(c,T)`, la geometría que cree la TCU.
5. Por cada 5 min: posición solar aparente → Ineichen → nube sintética.
6. Por política: `policyAngles(key, zen, az, Tcfg, irr, ...)`.
7. Si hay segmentación real y política `pairwise`/`astro`, recalcular consigna por mesa; el resto difunde consigna de línea.
8. Aplicar `crearLazo().paso(cmd, 300 s)` o su variante por mesa: deadband/lead/slew en la misma muestra gruesa.
9. Aplicar `topeBacktracking`/`topeBacktrackingSeg`: clamp dirigido respecto de BT y astro, luego ray-cast comparativo; si el adelanto aumenta sombra, volver a consigna.
10. Evaluar sombra, Perez/IAM/Martinez y POA con `T`, no `Tcfg`.
11. Agregar por mesa/largo o por línea según camino y conservar ambas métricas donde procede.

Implicación: el lazo no se ejecuta a 1 s aunque los comentarios lo comparen con el core; el slew de 0,17°/s dispone de 51° por muestra de 5 min y sólo ata grandes inversiones.

### 4.2 `produccion.html` — instante/día

1. Posición solar aparente y meteo TMY o Ineichen+nube.
2. Aplicar horizonte: apaga haz, conserva difusa.
3. Calcular consigna de política por línea y, cuando hay cotas, por mesa.
4. Si noche y no manual: sustituir por stow +5° este, ya limitado a ±max angle.
5. Si control está activo y existe estado previo: interpolar `prevTarget → currentTarget` y ejecutar `CTRLCORE.execVector` en ciclos de 1 s por defecto.
6. En modo `seguro`, pasar máscara `btRows`/`btSegs`; el núcleo puede arrancar bajo banda y suprime el lead hacia mayor inclinación.
7. Evaluar POA/sombra sobre θ ejecutado.
8. Propagar `theta`, `dir`, `park`, `dirUlt` y target al siguiente instante.

No se llama a `backtracking.html::topeBacktracking*` después de `CTRLCORE`. Por ello `seguro` no equivale al guardrail ray-cast completo.

### 4.3 `overcast.html`

1. Construir día y baseline BT/stow.
2. Calcular POA baseline.
3. Ejecutar política difusa y sus flags/state machine.
4. Expandir consigna de decisión a rejilla fina de 1 min.
5. Aplicar `applyControlLoop` con lead/deadband/slew.
6. Aplicar clamp dirigido posterior contra baseline BT y astro.
7. Aplicar guardia de sombra del borde lejano cuando se proporciona geometría.
8. Evaluar POA y maniobras sobre θ ejecutado.

## 5. ANGLE / SIGN / TERRAIN CONVENTIONS

### 5.1 Signos

- `sol.js`/pvlib: θ positivo produce superficie al este con eje N-S (`surfaceOrient(+5,0,0) → azimut 90°`).
- UI de `produccion.html`/simuladores: +5° es stow este.
- TCU de campo: la misma posición se declara −5°; existe una inversión explícita en interfaces de overcast/telemetría.
- App terrain: tilt N-S positivo significa extremo en dirección de `axisAz` más alto.
- pvlib: `axis_tilt` tiene convenio opuesto en este código; la frontera única es `pvTilt(t)=−t`.
- Pendiente transversal de pareja: derecha/este más baja para slope positiva; `z[p+1]=z[p]−pitch·tan(slope)`.

### 5.2 Dimensiones y límites

- GCR se deriva como `collectorWidth/pitch`; en UI es readonly.
- Default geométrico común: pitch 6,00 m; ancho 2,382 m; GCR ≈0,397; max angle ±55°.
- `produccion.html` usa ancho configurable y pitch por vano real donde existe.
- El pitch de layouts bifila es pitch de **fila**, no distancia entre unidades completas.
- Hard-stop se aplica dentro de `singleaxis`, en control y en stow.
- Presets limitan pendiente entre filas a ±30°; cotas reales no se claman.

### 5.3 Terreno y vecindad

- Pairwise por línea examina vanos adyacentes; filas interiores eligen el candidato más backtrackeado.
- Con torsión se muestrea el solape axial; las estaciones son adaptativas en presets y se fijan en 8 para plantas reales por coste.
- La reparación global puede considerar emisores no adyacentes, pero está desactivada para `T.real` para no pisar mando por mesa.
- Pairwise por mesa sólo considera mesas de líneas contiguas que solapan longitudinalmente. Sin vecina solapada usa la consigna de línea.
- Los edge rows usan su único vano. En ventanas recortadas de `careo_produccion`, los bordes carecen de la vecina exterior y se declaran diferencias esperables.

## 6. DEADBAND / CONTROL SEMANTICS

### 6.1 Semántica de `CTRLCORE`

Estado mínimo:

- `theta`: posición ejecutada.
- `dir`: dirección de maniobra actual, −1/0/+1.
- `park`: destino enclavado.
- `dirUlt`: última dirección, incluso detenido.

Reglas exactas:

1. **Arranque inicial:** si deadband >0, `|target−theta| >= deadband`; con deadband 0, cualquier error no nulo.
2. **Lead:** destino = `target + deadband·direction`.
3. **En vuelo:** conserva el destino enclavado, pero compara con destino vivo; abandona orden obsoleta si se separa más de media banda.
4. **Inversión:** requiere cambio de lado y `|error| > deadband`, estrictamente.
5. **Exactamente en threshold:** arranque en frío sí; inversión no.
6. **Slew:** `0,17°/s` default, aplicado por ciclo; slew ≤0 cae al default en lugar de velocidad infinita.
7. **Hard stop:** clamp final a ±`maxAngle`; al llegar al hard stop la maniobra se detiene.
8. **Modo libre:** deadband no conoce sombra.
9. **Modo seguro:** si la consigna está recortada por BT y el ejecutado tiene mayor `|θ|`, arranca aun bajo banda; además suprime lead que aumente `|θ|`.

La banda no es “simétrica” en efecto operativo: el umbral usa magnitud, pero memoria, lead, inversión estricta y dirección producen una máquina direccional/histérica.

### 6.2 Antes/después de backtracking

- La consigna BT se calcula **antes** del deadband.
- `CTRLCORE` no recalcula BT durante ciclos internos; interpola linealmente los targets de dos muestras.
- En modo seguro, recibe metadato de que el target está limitado por BT.
- `backtracking.html` y `overcast.html` añaden un guardrail **después** del lazo.
- `produccion.html` no añade ese guardrail geométrico posterior.

### 6.3 Safety y stow

- Stow nocturno: consigna previa al control, no bypass; respeta slew y hard stop.
- Manual: evita sustitución nocturna por stow.
- No se encontró ruta ejecutable equivalente para wind/snow/emergency stow; su bypass de deadband/slew es `UNKNOWN`.
- No se encontró aceleración, jerk, corriente, backlash ni límites blandos dependientes de temperatura.

### 6.4 Diferencias respecto de SolarGPTfull `DirectionalController`

La comparación completa no puede cerrarse sin el repositorio/revisión externa. Lo demostrable localmente:

- `test_control_core.mjs` codifica un caso esperado atribuido a `solargpt_core/direction.py`, pero no ejecuta Python ni guarda un golden con SHA.
- Comentarios antiguos de `control_core.js` afirman a la vez que el core paraba en target y que el comportamiento de orden obsoleta viene de `direction.py`; esa historia no sustituye evidencia ejecutable.
- `overcast.html` declara paridad 1e-9, pero tampoco incluye vectores versionados del DirectionalController en `golden_core.csv`; ese golden cubre tracking/Perez/difusa, no control.
- El contexto de auditoría externa establece que el controlador canónico es direccional y stateful. El JS también lo es, pero quedan por comparar nombres de estado, lead exacto, tolerancia de llegada, actualización de target en vuelo, igualdad en threshold, orden de clamp y bypass de safety.

Determinación: `CTRLCORE` es `MIRROR` candidato, no `CANONICAL` computacional global.

## 7. MIRRORS AND SOURCE-OF-TRUTH CLAIMS

### 7.1 Claims sólidos

- `sol.js` y `irradiancia.js` son módulos compartidos reales: las páginas los importan en vez de duplicar funciones.
- `produccion.html` extrae el bloque de física de `backtracking.html` en runtime; no contiene una copia separada de las políticas BT.
- `seguidor.js` es fuente única local del modelo visual.
- `overcast.html` tiene golden generado ejecutando `solargpt_core/tracker.py` y consume entradas solares/meteorológicas fijadas.

### 7.2 Claims no cerrados

- `backtracking.html` se autodenomina espejo de `tracker3d.py`, pero no registra SHA/schema externo ni golden de outputs BT3D.
- `bt3dPairMaxMag` se describe como port 1:1, pero sólo está respaldado localmente por invariantes/residual/oráculos.
- `anglesRow`, pairwise, acople y reparación se atribuyen al core, pero han acumulado extensiones locales (cono de haz, reparación global, guardia de energía, estaciones adaptativas, mando por mesa).
- `control_core.js` no lleva `VERSION` ni schema de contrato externo.
- `golden_core.csv` registra pvlib `0.15.2` y tracker schema `2.1.0`, pero no commit SHA, fecha ni hash de fuente.

### 7.3 Roles finales propuestos

- `sol.js`: `CANONICAL` JS local + `MIRROR` pvlib/NOAA.
- `irradiancia.js`: `CANONICAL` JS local + `MIRROR` pvlib.
- `backtracking.html` physics: `CANONICAL` local del simulador; `MIRROR` candidato/`APPROXIMATION` respecto de Python BT3D.
- `overcast.html`: `MIRROR` verificado parcialmente por golden.
- `js/control_core.js`: `CANONICAL` local de producción; `MIRROR` candidato del controlador Python.
- `produccion.html`: `ADAPTER` que reutiliza física y añade datos/planta/control.
- `seguidor.js`: `CANONICAL` local de render, no computational truth de BT.
- layouts/cotas: `MIRROR`/`ADAPTER` de documentación y levantamientos externos.

## 8. PARITY EVIDENCE

### 8.1 Tests ejecutados

| Comando | Resultado |
|---|---|
| `node tools/test_control_core.mjs` | **PASS** — 46/46; threshold, lead, inversión, estado, stale target, slew, hard stop, modos libre/seguro y fuzz determinista |
| `node tools/test_backtracking_sim.mjs` | **INCOMPLETO por duración** — antes de interrumpirlo pasó física base, 200 ray-casts, true3D, BT2D, accionamientos, torsión, oráculo independiente e Ineichen/Perez/IAM; no se obtuvo el resumen/exit 0 y no se contabiliza como PASS completo |
| `node tools/test_overcast_sim.mjs` | **PASS** — 108 comprobaciones; golden Python de 7 escenarios/1.104 pasos, fuzz 400 configuraciones y políticas difusas |
| `node tools/test_produccion.mjs` | **PASS parcial observado** — paridad del motor extraído, geometría/planta y golden eléctrico; la suite larga siguió sin fallo visible hasta la siguiente orden |
| `node tools/test_bt3d_rot.mjs` | **NO EJECUTABLE EN ENTORNO** — falta Chromium de Playwright |
| `node tools/test_produccion_lazo.mjs` | **NO EJECUTABLE EN ENTORNO** — falta Chromium de Playwright |
| `node tools/careo_produccion.mjs 2026-06-21 120` | **INCOMPLETO por tiempo de auditoría** — alcanzó 79/79 líneas y 1.600 mesas casadas, 0 sin casar, antes de terminar |
| `node tools/banda_astro_bt.mjs 1` | **INCOMPLETO por tiempo de auditoría** — cálculo intensivo sin resultado antes de terminar la tanda |
| `npx playwright install chromium` | **NO EJECUTABLE EN ENTORNO** — cinco intentos de descarga recibieron HTTP 403 de `cdn.playwright.dev`; no se pudo desbloquear la batería de navegador |

### 8.2 Evidencia positiva

- `test_backtracking_sim` prueba `singleaxis` contra fórmula cerrada, sombra analítica contra ray-cast bruto, true3D contra residual, transición de signo, límites, accionamientos y casos de torsión.
- El oráculo independiente usa rotación/muestreo separado, reduciendo riesgo de test tautológico.
- `test_overcast_sim` compara contra `golden_core.csv` generado por Python real; peor error observado de θ fue ~4,26e−14° y POA ~3,41e−13 W/m².
- `test_control_core` prueba explícitamente `>=` al iniciar, `>` al invertir, dos bandas por movimiento, memoria cruzando tramos y abandono de destinos obsoletos.
- `test_produccion` demuestra que producción consume la misma física extraída y no una copia.
- Goldens eléctricos (`golden_energia_notebook.json`, `golden_ac_notebook.json`) comparan ports de cadena contra core Python.

### 8.3 Límites de la evidencia

- No existe golden Python para BT2D/row/pairwise/true3D/mgl/optimal/optfree.
- No existe golden Python versionado para `DirectionalController`.
- No hay SHA del core en `golden_core.csv`.
- Algunos tests comparan contra constantes/expected values transcritos, no contra ejecución externa.
- Los tests de navegador que cubren signo girado/producción-lazo no corrieron por falta de Chromium.
- La suite principal valida principalmente invariantes físicos y consistencia interna; una implementación distinta puede satisfacerlos.
- El barrido completo de terrenos requerido por documentación no se ejecutó en esta auditoría por coste.

## 9. DISCREPANCIES

| ID | Discrepancia | Clasificación | Determinación |
|---:|---|---|---|
| B01 | BT3D JS se presenta como espejo 1:1 sin golden Python/commit externo | `UNKNOWN` | Claim no demostrado |
| B02 | `backtracking.html` usa `crearLazo` a 5 min; producción usa `CTRLCORE` a 1 s | `BUG` | Dos resultados ejecutables para la misma semántica declarada |
| B03 | `backtracking.html` comenta “misma regla/orden que core”, pero no ejecuta el ciclo fino | `BUG` documental/semántico | El orden general coincide; la discretización física no |
| B04 | Producción modo seguro no aplica guardrail ray-cast posterior | `UNKNOWN` | Puede ser diseño deliberado, pero no equivale al pipeline BT completo |
| B05 | Overcast usa rejilla fina de 1 min, no ciclo canónico 1 s | `APPROXIMATION` | Respeta slew macro, pero no reproduce arranques finos exactamente |
| B06 | `control_core.js` no tiene versión/schema externo | `BUG` de provenance | No se puede fijar qué DirectionalController refleja |
| B07 | Golden de tracker carece de SHA del core | `BUG` de provenance | Schema 2.1.0 no identifica código exacto |
| B08 | Golden compara contra Python corregido para axis azimuth, no contra core tal cual | `INTENTIONAL` | Divergencia documentada; core histórico tiene bug medido |
| B09 | `nightStowDeg=5` diverge del core histórico que decía 0 | `INTENTIONAL` | Dato de proyecto/TCU, pendiente de adopción upstream |
| B10 | `produccion.html` axisAz se fija a 0 en `buildT*` | `BUG` candidato | Plantas giradas como Bagnarelli no heredan necesariamente `montaje.axis_azimuth` en esta ruta |
| B11 | Sólo astro/pairwise tienen mando por mesa; otras políticas se difunden por línea | `APPROXIMATION` | Limitación declarada, afecta terrain-aware row-wise |
| B12 | Reparación global se desactiva en plantas reales | `INTENTIONAL`/`APPROXIMATION` | Evita pisar mando por mesa, pero deja un pipeline distinto entre preset y planta |
| B13 | Plantas reales usan 8 estaciones; presets adaptan hasta 64 | `APPROXIMATION` | Compromiso de rendimiento medido, no equivalencia geométrica |
| B14 | `pairThetaTorsion` búsqueda gruesa+fina puede omitir ventanas limpias <0,5° | `APPROXIMATION` | El propio comentario reporta 1/1.400 caso de ventana 0,2° |
| B15 | `anglesTrue3d` fuerza baseline desde zenit 82°, aunque física general sigue hasta 87° | `APPROXIMATION` | Deferral de estabilidad, no resultado 3D puro |
| B16 | `nan0` convierte noche/NaN a 0 dentro del motor BT | `LEGACY` | Producción lo sustituye por stow fuera; consumidores directos ven plano |
| B17 | No hay wind/snow/emergency safety pipeline | `UNKNOWN` | No se puede probar bypass/orden de deadband |
| B18 | `CTRLCORE.step` con `loop` ausente aún usa defaults en partes de la función; sólo callers controlan el bypass | `UNKNOWN` | Contrato depende del adaptador, no del core puro |
| B19 | `seguidor.js` se sincroniza “idéntico” con otro repo sin hash/version verificable | `UNKNOWN` | Riesgo de mirror drift |
| B20 | `seguidor.js` textura usa `Math.random()` | `INTENTIONAL` visual | No afecta cálculo, pero render no es bit-reproducible |
| B21 | GCR/pitch/ancho default varían levemente: 2,382 vs inputs de 2,384 en otras herramientas | `LEGACY`/`UNKNOWN` | Requiere fuente de ficha por planta |
| B22 | `nBypass` default 2 es configurable porque fichas no lo traen | `UNKNOWN` | Puede cambiar el signo astro-vs-BT |
| B23 | `axisTilt` app requiere `pvTilt` para pvlib; cualquier caller directo puede equivocarse de signo | `BUG` arquitectónico | Frontera no está tipada ni codificada en unidades/nombre |
| B24 | Múltiples implementaciones de control (`CTRLCORE`, `crearLazo`, `applyControlLoop`) | `LEGACY`/`BUG` | Drift ya observable en ciclo y guardrail |
| B25 | El criterio “sin sombra” acepta sombra si mejora energía tras reparación | `INTENTIONAL` | Nombre/descripción histórica puede prometer más que ejecuta |
| B26 | BT2D plano se usa como “tracker sin configurar”, no como un modelo BT2.5D | `INTENTIONAL` | Evitar confundir etiquetas |
| B27 | Edge rows de ventana de careo pierden vecina exterior | `APPROXIMATION` | Interior comparable; bordes no |
| B28 | Stow manual bypass/nocturno y safety externa no comparten contrato único | `UNKNOWN` | Falta orden canónico de prioridades |
| B29 | `produccion` inicializa el primer instante directamente en consigna | `APPROXIMATION` | El estado anterior al comienzo del día no se simula |
| B30 | `overcast` golden revela bug Python con eje girado, pero no consta cierre upstream | `UNKNOWN` | Necesita careo con SolarGPTfull actual |

## 10. MISSING GOLDEN / ADVERSARIAL VECTORS

### Prioridad crítica

1. **Golden BT3D Python↔JS con SHA:** inputs completos de pares, tilts, axis azimuth, pitch por vano, ancho, max angle, grupos y segmentos; outputs de astro/BT2D/row/pairwise/true3D/acople/reparación.
2. **Golden DirectionalController:** secuencias target/BT flag/safety y estado por paso; comparar θ, dirección, park, last direction y eventos.
3. **Golden del pipeline completo:** política → controller → guardrail → hard stop → POA, no funciones aisladas.

### Vectores de deadband/control faltantes

- Error exactamente +banda y −banda tras última dirección opuesta.
- Target cruza cero mientras está en vuelo.
- Target retrocede menos, igual y más de media banda respecto del park vivo.
- Reversión exactamente en banda y a banda±epsilon.
- Hard stop alcanzado con park más allá; liberación posterior.
- Stow/wind/safety durante maniobra y recuperación.
- Backtracking pasa de limitado a no limitado durante maniobra.
- Modo seguro con target y actual en signos opuestos.
- Primera muestra del día desde stow real, no inicialización en target.

### Vectores geométricos faltantes

- Axis azimuth 23,7° con tilt positivo/negativo y terreno transversal.
- Hemisferio sur con slopes de ambos signos.
- Ventana limpia menor de 0,5° en búsqueda torsionada.
- Sol zenit 81,999/82/82,001 y 86,999/87/87,001.
- Tilt 0,499/0,5/0,501° para guard 2.5D.
- AOI 87,999/88/88,001°.
- GCR extremo, pitch no uniforme y collector width por planta.
- Fila de borde con y sin vecina externa.
- Mesas sin solape, solape puntual y solape completo.
- Odd row bifila y último motor monofila.
- Cotas null/reconstruidas junto a cotas medidas.

### Provenance faltante

- SHA de SolarGPTfull, pvlib y generador dentro de cada golden.
- Hash de inputs de planta usados en careos.
- Schema/version en `control_core.js`.
- Vector de migración cuando se cambia una política local respecto del core.

## 11. EXTERNAL EVIDENCE REQUIRED

1. Repositorio `SolarGPTfull`, revisión exacta auditada, especialmente:
   - `solargpt_core/tracker.py`;
   - `tracker3d.py` o módulo actual equivalente;
   - `solargpt_core/direction.py::DirectionalController`;
   - `apply_control_loop`, `run_tcu_sim`;
   - `clamp_adelanto_dirigido`;
   - orden en `poa.py`/pipeline de producción;
   - policies row-wise/diffuse y schemas.
2. Configuración/firmware TCU real:
   - conversión pulsos↔grados para registros 41061/41063;
   - ciclo de scan de 1 s;
   - lead real de 1°;
   - inversión y tolerancia de llegada;
   - prioridades wind/snow/stow/manual;
   - límites mecánicos y signos.
3. Documentación de actuador Sunner para slew 0,17°/s, rampas/aceleración y comportamiento en hard stop.
4. Fuentes de planta para axis azimuth, pitch, collector width, GCR, módulo, subcadenas/bypass, límites y stow.
5. Levantamientos/cotas con datum y flags que distingan medido, reparado e interpolado.
6. Repositorio gemelo que supuestamente comparte `seguidor.js`, para comparar hash y versión.

## 12. QUESTIONS TO 02_BACKTRACKING AND 00_MASTER

1. ¿Qué SHA de SolarGPTfull es la Computational Truth que debe gobernar esta comparación?
2. ¿Cuál es el nombre/ruta actual del motor Python BT3D y su contrato de inputs/outputs?
3. ¿`true3d` debe ser espejo exacto de Python o una rama experimental local con guardias adicionales?
4. ¿La reparación global y el cono `AOI_HAZ=88°` existen en Python o son diseño local?
5. ¿Debe la política “sin sombra” priorizar energía y aceptar sombra, o mantener garantía óptica? La implementación actual prioriza un frente energía/sombra.
6. ¿Debe producción usar el guardrail ray-cast posterior de `backtracking.html` además del modo seguro de `CTRLCORE`?
7. ¿Se debe eliminar `crearLazo` y consumir `CTRLCORE.execVector` dentro de `backtracking.html`?
8. ¿El ciclo real de TCU es exactamente 1 s para todas las versiones/plantas?
9. ¿DirectionalController canónico adelanta `target + deadband·dir`, y cómo trata órdenes obsoletas?
10. ¿Cuál es el comportamiento canónico exactamente en igualdad de threshold para arranque e inversión?
11. ¿Cuál es la tolerancia/banda de llegada canónica: media banda, epsilon u otra?
12. ¿Wind/snow/emergency stow bypassan deadband? ¿Respetan slew? ¿Qué prioridad tienen frente a manual?
13. ¿El stow nocturno canónico es 0°, +5° pvlib o −5° TCU, y en qué capa se convierte el signo?
14. ¿Por qué `produccion.html::buildT*` fija `axisAz:0` en vez de usar montaje de planta?
15. ¿Está corregido upstream el bug de axis azimuth de políticas difusas que el golden detecta en 38 pasos?
16. ¿Qué política tiene derecho a mando por mesa: sólo astro/pairwise o también row/true3d/mgl/optimal?
17. ¿Son 8 estaciones suficientes para todas las plantas reales o sólo para Ayora/San José auditadas?
18. ¿Cuál es el ancho de colector canónico por planta: 2,382, 2,384 o ficha específica?
19. ¿Cuál es `nBypass` real por módulo/planta? El resultado anual puede cambiar de signo.
20. ¿Los bordes de ventanas de producción deben llevar ghost neighbors de planta completa?
21. ¿Debe el primer instante simulado arrancar desde stow/estado del día anterior en vez de target instantáneo?
22. ¿Qué artefacto debe versionar los mirrors: schema, SHA externo, generador y fecha?
23. ¿Debe CI ejecutar Python y regenerar/comparar goldens, o basta el CSV versionado?
24. ¿Qué tests de navegador son required y cómo se garantiza Chromium en el runner?
25. ¿Qué reglas locales se consideran diseño validado y cuáles son sólo aproximaciones de simulación?

## 13. FINAL DETERMINATION

### Determinación por dominio

- **Solar position / true tracking / BT pvlib básico:** espejo JavaScript fuerte, centralizado y con buena evidencia. No obstante, la autoridad matemática sigue siendo pvlib/SolarGPTfull.
- **Irradiancia/Perez/Ineichen:** espejo fuerte; overcast dispone de golden externo, aunque falta SHA de fuente.
- **BT2D plano:** referencia deliberadamente simplificada/legacy, no control terrain-aware.
- **Pairwise/BT2.5D:** motor local sofisticado con buenos invariantes, pero equivalencia Python no demostrada.
- **True-3D:** `MIRROR` candidato con extensiones/guardias locales; no puede declararse Computational Truth ni equivalente al actuador real.
- **Terrain/row-wise/por mesa:** adaptación rica de cotas y layouts; mezcla dato medido, reconstrucción y decisiones de agregación.
- **Control/deadband:** `CTRLCORE` implementa correctamente una máquina direccional y stateful según su contrato local. No debe describirse como deadband simétrico. Su equivalencia exacta con SolarGPTfull queda `UNKNOWN` hasta ejecutar vectores externos versionados.
- **Producción:** reutiliza física de backtracking, pero su pipeline de control difiere del simulador en guardrail y discretización.
- **Overcast:** mirror mejor probado; corrige deliberadamente un bug histórico del core con axis azimuth.

### Veredicto

`cobertura-zigbee` contiene un laboratorio JavaScript avanzado y ampliamente probado, pero **no contiene una única Computational Truth demostrada para backtracking/control**. La verdad local está fragmentada:

1. `sol.js`/`irradiancia.js` para sol y física base;
2. `backtracking.html` para políticas y geometría BT;
3. `js/control_core.js` para el actuador de producción;
4. `overcast.html` para difusa y un segundo controlador;
5. `produccion.html` para el orden de operación con datos de planta.

La discrepancia prioritaria es que el simulador BT aplica un lazo propio a 5 minutos mientras producción ejecuta `CTRLCORE` a 1 segundo. Antes de proclamar paridad con SolarGPTfull o con el actuador, debe existir un golden completo y versionado que cubra política, controlador, guardrail, safety y POA en el mismo orden ejecutable.

Estado final: **COMPLETE_WITH_UNKNOWNS**. Los `UNKNOWN` anteriores quedan abiertos explícitamente y no se promueven a equivalencia.
