# BT3D de conjunto · FASE 0 — estructura antes de código

Simulador `v1.78.1` (`backtracking.html:532`). Rama `claude/r5-bt3d-f0-6th1im`,
apilada sobre `claude/r5-proyeccion-6th1im` (PR #748, el motor de proyección),
que no está en `main`. `audit2/` intacto; las nueve políticas de
`backtracking.html` no se tocan: esta fase no cambia ni una línea de la página.

**Enmienda del 2026-09-24, tras las decisiones del titular** (sección «Decisiones
del titular» al final): el BT3D aplica la convergencia de meridianos y la
fórmula CORRECTA de `conoHaz`; la escena lleva los dos rangos (el del simulador,
para el careo, y el del BT3D); 0.2 se ha vuelto a medir con el sol en el marco
de la planta y el rango del BT3D (las tablas de abajo son las nuevas; la
anchura apenas se mueve). La página sigue sin tocarse.

Máquina: 4 núcleos. Los procesos se lanzaron **de uno en uno, en la misma
máquina, uno detrás de otro**, sin otra carga que la de esta sesión (carga media
0,12 antes de la primera medida y 1,07 justo después del proceso anterior, que
ya había terminado). Los tiempos son de CPU de un proceso (`time.process_time`
en Python, `hrtime` en JS). Una sola pasada: no hay repeticiones con las que
dar una dispersión.

---

## Parámetros declarados — un solo sitio

**Fichero**: `audit5/bt3d_parametros.json`. Lo leen `audit5/lib_parametros.mjs`
(JS, lado simulador) y `bt3d/parametros.py` (el paquete Python nuevo, lado
optimizador). Ninguno de los dos lleva escrito ningún valor.

| parámetro | valor | procedencia |
|---|---|---|
| rejilla de mando | 0,1° | `PASO_BUSQ=0.1` (`backtracking.html:980`) |
| banda muerta | 0,1° | declarada por el encargo, igual a la rejilla |
| θmáx por unidad | 55° en las dos plantas; mapa `theta_max_por_unidad` vacío | Ayora `ayora_cotas.json` `limite` → `data.limite\|\|55` (`:1796`); Fayón `montaje.max_angle` |
| rango por unidad | `rangoHaz` (`:983-1000`) por unidad e instante, con el tilt de la unidad (media de τ de sus mesas) y la pendiente transversal del plano de sus dos filas, **con el cono de la fórmula del comentario** (`:992-994`), no el de `:1030`, y el acimut en el marco de la planta | decisión del titular; se llama al simulador cargado con esa línea cambiada (`audit5/lib_conohaz.mjs`), no se copia; la copia Python se carea (banco C) |
| signo | θ>0 = la cara mira al ESTE; τ>0 = el norte más alto; a pvlib va −τ | `sol.js:102-108`, `pvTilt` (`:606`), `lib_proyeccion.mjs:8-9`; precedente −τ/+τ de R4-A |
| x de fila | Ayora: levantamiento (x de SU fila); Fayón: plano (x del DWG ± filaZ) | `lib_mesas.mjs`; `fayon_layout.json` `mesa.filaZ` |
| nb | 2 en las dos plantas, **configurado a mano** | `backtracking.html:189` (`nbp` value=2); `nbFicha()` no encuentra ficha (`:4638-4650`) |
| z0 | 0,17 m | `backtracking.html:186` |
| cuerda | Ayora 2,384 m; Fayón 2,411 m | `ayora_cotas.json` `cuerda`; `fayon_layout.json` `mesa.modH` × 1V |
| techo de haz / margen de rango | 88° / 2° | `AOI_HAZ` (`:950`), `rangoHaz` (`:987`) |
| penumbra | **fuera del modelo**, declarado: el sol es puntual | — |
| convergencia de meridianos | **se aplica en el BT3D** (el simulador no): az_malla = az − γ, Ayora **+1,161°**, Fayón **−1,764°** | Fayón: `fayon_layout.json` `georef.nota`. Ayora: calculada, (λ − λ0)·sen φ en UTM 30N; el marco de `ayora_cotas.json` ES ese UTM: ajuste de los 751 seguidores cotas↔layout (EPSG:25830), rotación −0,0003°, residuo p50 0,06 m |
| cono de haz | la fórmula del comentario (`cono_haz: "comentario"`) | decisión del titular; la página conserva la suya |
| días | 21-jun y 21-dic de 2026, cada 5 min, sol > 0,5° | el criterio de `audit5/F0_dimension.mjs` |

**Banco** `audit5/test_parametros.mjs` (14/14 en verde). Cae si:

- **A** · el texto canónico que resuelven JS y Python para cada unidad difiere en
  un carácter (427 unidades de Ayora, 24 de Fayón). *Control negativo*: una
  copia del fichero con la banda muerta a 0,2, leída solo por Python → cae.
- **B** · lo declarado se aparta de lo que usa el simulador (se lee de
  `backtracking.html` y de los ficheros de planta: `PASO_BUSQ`, `AOI_HAZ`, el
  margen de `rangoHaz`, el signo de `pvTilt`, los `value` de `z0` y `nbp`,
  θmáx y cuerda). *Control negativo*: 8 mutaciones de uno en uno, las 8 vistas.
  Y el signo contra el motor: a θ = +30° la normal tiene x = +0,500 (a −30°, −0,500).
- **C** · en dos mitades. (1) La copia Python de `rangoHaz` tal cual (cono de
  `:1030`, sin convergencia) se aparta del simulador más de 1e-9°: medido
  2,8·10⁻¹⁴° en 122.976 (Ayora) y 6.888 (Fayón) unidad×instante; *control* con
  +τ a pvlib, 9,24° y 28,63°. (2) El rango del BT3D (cono del comentario,
  acimut en el marco de la planta) se aparta de su fórmula declarada más de
  1e-9°: medido 2,8·10⁻¹⁴° y 1,4·10⁻¹⁴°. *Control*: tiene que diferir de verdad
  del de la página, o la decisión no estaría aplicada; difiere ≥ 0,1° en 57.069
  de 122.976 (máx 2,61°) en Ayora y en 4.158 de 6.888 (máx 3,18°) en Fayón.
- **D** · los dos enumeradores por envolvente (JS y Python) dan pares distintos
  en algún instante. Medido: 0 diferencias en 288 + 287 instantes (1.805.328 y
  84.926 pares mesa→mesa, sol en el marco de la planta). *Control*: con ρ·0,99
  en JS cambian 9 y 8 de 24 instantes muestreados.
- **E** · falta en la envolvente algún par con sombra del motor. Motor a θ
  aleatorio en [−55°, 55°] por mesa, fuerza bruta todos contra todos en una
  ventana de 120 mesas (Ayora; en Fayón las 96), dos sorteos por instante:
  5.030 y 10.011 pares con sombra real, **faltan 0**. *Control*: con ρ·0,7
  faltan 89 de 4.834 y 202 de 9.964.

`bt3d/test_grafo.py` (8/8): las cotas de anchura contienen la anchura
conocida (camino, ciclo, K6, estrella, K3,3, rejilla 5×5 → [4, 5] con 5
verdadero) y la exacta por fuerza bruta en 300 grafos aleatorios; *control*:
una cota inferior +1 se sale.

Los dos bancos están en CI (`bancos.yml`, trabajo `datos`), detrás de la
generación de las escenas. Python solo con biblioteca estándar.

---

## 0.1 · «Afección BT» (`terreno.html:1606-1762`) contra los controles del motor

Se **ejecuta el código publicado**: `afbtLoc`, `afbtSol`, `afbtVecinos` y
`afbtDeficit` se recortan del texto de `terreno.html`. Solo se sustituyen sus
dos lectores de escena, `afbtPendTubo` y `afbtPuntas` (`:1697-1709`).
`audit5/F0_afbt.mjs` → `audit5/out/F0_afbt.txt`.

| control del motor | resultado |
|---|---|
| **C1 · tangencia** contra pvlib (filas de 2 km, planas, paso 6, sol ⟂ eje, 2-60°, Δh ∈ {0, ±0,3, ±0,8} m, sol E y O; 300 casos, 106 con recorte) | **PASA en su dominio**: máx \|θ_afbt − θ_bt\| = 0,0048° en 290 casos. *Control* con la pendiente de signo cambiado: 52,55°. **Fuera de su dominio, 10 casos**: pvlib libra la sombra pasando la horizontal (de 0,75° a 6,97° al otro lado) y Afección BT da recorte TOTAL, porque su bisección solo busca entre seguimiento y plano (`:1757-1759`, «ni en plano se libra») |
| **C2 · espejo E↔O** con cotas irregulares (400 casos, 147 con recorte) | **PASA**: máx \|Δ\| = 0. *Control*, espejo sin cambiar el lado: 55° |
| **C3 · θ por mesa** (requisito 1.2 del motor) | **NO PASA, por construcción**. La firma `afbtDeficit(A,B,ladoB,sv0,gap)` no recibe el θ del vecino y la sombra se evalúa con «ambas filas a tilt phi» (`:1749`). Consecuencia medida con el motor (filas planas de 50 m, paso 6, sol del este; A en el θ que Afección BT da por libre, B fila delantera en su θ astronómico): sombra sobre A **100 % a 5°, 45,9 % a 10°, 17,6 % a 15°, 4,0 % a 20°**, donde el gemelo dice 0 % |
| **C4 · enumeración** contra el motor, Ayora, 2 días, cada unidad en su θ astronómico, par = sombra > 1 cm² | **Cubre el 17,7 %** de 682.380 pares reales: 5,6 % con sol < 3°, 18,4 % entre 3° y 10°, 46,6 % entre 10° y 30° (por encima de 30° no hay pares). No los ve: **intra-unidad** (las dos filas del mismo bifila; `afbtVecinos` solo recorre otros seguidores) 17.934 + 43.554 + 57.979; el **mismo tubo** (`adx<3`, `:1651`) 15.286; **más allá de 2,6·paso** (`:1652`) 278.760, casi todos con sol < 10°; **la fila trasera** del vecino 148.210. El filtro de segunda fila (`:1665-1672`) no quitó ninguno |
| unión (6), sol en el plano del eje (4) | no aplican tal cual: agrega por MÁXIMO de grados entre vecinos (`afbtAgg`, `:1763-1787`) y con \|sv.E\| pequeño devuelve 0 por construcción (`:1714`) |

**Veredicto (confirmado por el titular): no se reutiliza, y no se arregla: se
documenta como TERCER MOTOR**, junto al contador del simulador
(`shadeBand3DAll`) y al de proyección (`lib_proyeccion`). Las dos cifras que lo
cierran: **ve el 17,7 % de los 682.380 pares con sombra real**, y **declara nula
una sombra que es del 45,9 % a 10° de sol y del 100 % a 5°**. Es una
herramienta de afección que no ve la afección: no ve las dos filas del mismo
motor, ni el mismo tubo, ni más allá de 15,6 m, ni la fila trasera del vecino.
Pasa la tangencia y el espejo porque es un buen motor 2D del gemelo, y por eso
mismo no puede representar vecinos en θ distintos, que es justo lo que el BT3D
de conjunto decide.

La auditoría de 0.1 se midió con el convenio del simulador (sol sin
convergencia): es una auditoría de lo que la página ve.

---

## 0.2 · Estructura del grafo, Ayora y Fayón, dos días

**Escenas** (`audit5/F0_escenas.mjs` → `audit5/out/escenas/`, sin versionar, se regeneran):

- **Ayora**: levantamiento, bloque 0 entero. 107 líneas, 1.708 mesas, **427
  unidades** (un tracker = 2 filas × 2 mesas, un motor), 288 instantes.
- **Fayón**: **el plano, no la medida**. x/n del DWG, filas a ±3 m, cota de cada
  punta de fila del DEM de 10 m. El propio relieve dice `validado: false`; el
  error de ese producto donde sí hubo levantamiento fue p50 0,83/1,29 m. 28
  líneas, 96 mesas, **24 unidades**, 287 instantes. **Vale para medir el grafo,
  no para publicar energía**: toda cifra de Fayón en este documento es
  estructura o diferencia relativa, y ninguna se compara en absoluto con Ayora.

**Enumerador por envolvente de rotación** (`bt3d/envolvente.py`, gemelo
`audit5/lib_envolvente.mjs`). Cada mesa, gire lo que gire, queda en el cilindro
de radio ρ = hypot(cuerda/2, z0 + canto) + margen alrededor de su eje: 1,230 m
en Ayora y 1,244 m en Fayón. Hay par posible si los ejes proyectados en la vista
del sol distan ≤ 2ρ y el emisor tiene algún punto más cerca del sol. Es una
condición **necesaria**: da un superconjunto del grafo verdadero.

**Dos grafos, y manda el segundo.**

- **Pares**: arista U–V si alguna mesa de U puede sombrear a alguna de V.
- **Moral**: la pérdida de una mesa receptora depende de la UNIÓN de las sombras
  de todos sus emisores (unión, no suma, y `elecLoss` en escalones). El término
  de la función objetivo tiene por alcance {su unidad} ∪ {todas las que la
  pueden sombrear}, y una descomposición en árbol válida para la programación
  dinámica tiene que meter ese alcance entero en una bolsa. La anchura que
  decide el solver es la del grafo **moral**.

**Anchura del PROBLEMA, acotada por los dos lados** (`bt3d/f0_estructura.py`,
`audit5/F0_realizable.mjs`):

- **Superior**: la del grafo de la envolvente (superconjunto → anchura ≥ la del problema).
- **Inferior**: la del grafo **realizado**, con cada arista confirmada por el
  motor con θ de una rejilla de 24 valores **dentro del rango del BT3D** de
  cada unidad en ese instante (cono del comentario, convergencia aplicada), que
  es el dominio del problema; el sol, en el marco de la planta. Es un
  subgrafo del verdadero, así que su anchura es ≤ la del problema.
- Las dos anchuras son intervalos [MMD+, mejor de grado mínimo / relleno mínimo].
- Comprobado en cada instante: inferior ≤ superior (si no, el script aborta).

### Ayora — 427 unidades

| elevación | inst. | emisores por unidad receptora p50 · máx | emisores por **mesa** receptora p90 · máx | mayor componente (moral) | anchura MORAL del problema, peor instante [inf, sup] | p50 [inf, sup] | anchura de PARES, peor [inf, sup] |
|---|---|---|---|---|---|---|---|
| 0,5-1° | 2 | 13 · 40 | 21 · 34 | 267 | **[31, 43]** | [31, 43] | [22, 33] |
| 1-2° | 7 | 9 · 53 | 26 · 43 | 267 | **[40, 43]** | [32, 35] | [27, 32] |
| 2-3° | 5 | 7 · 38 | 14 · 33 | 243 | **[34, 39]** | [14, 24] | [27, 29] |
| 3-5° | 9 | 6 · 26 | 11 · 22 | 243 | **[20, 29]** | [11, 20] | [17, 25] |
| 5-10° | 25 | 3 · 15 | 7 · 12 | 158 | **[9, 22]** | [5, 13] | [8, 16] |
| 10-15° | 26 | 3 · 6 | 3 · 5 | 72 | **[5, 9]** | [4, 5] | [4, 4] |
| 15-20° | 28 | 3 · 6 | 3 · 3 | 72 | **[5, 5]** | [4, 5] | [4, 4] |
| 20-30° | 75 | 1 · 6 | 3 · 3 | 72 | **[4, 5]** | [1, 1] | [4, 4] |
| 30-45° | 31 | 1 · 2 | 1 · 1 | 4 | **[1, 1]** | [0, 1] | [1, 1] |
| 45-91° | 80 | 1 · 2 | 1 · 1 | 4 | **[1, 1]** | [1, 1] | [1, 1] |

### Fayón — 24 unidades (el plano)

| elevación | inst. | emisores por unidad receptora p50 · máx | emisores por mesa receptora p90 · máx | mayor componente (moral) | anchura MORAL, peor [inf, sup] | p50 [inf, sup] | anchura de PARES, peor |
|---|---|---|---|---|---|---|---|
| 0,5-1° | 1 | 3 · 6 | 3 · 5 | 24 | [3, 5] | [3, 5] | [2, 3] |
| 1-2° | 7 | 5 · 20 | 13 · 16 | 24 | **[15, 19]** | [7, 9] | [11, 12] |
| 2-3° | 5 | 4 · 20 | 12 · 16 | 24 | **[16, 19]** | [5, 7] | [11, 12] |
| 3-5° | 10 | 4 · 19 | 13 · 17 | 24 | **[16, 18]** | [7, 9] | [11, 11] |
| 5-10° | 26 | 3 · 14 | 10 · 13 | 24 | **[11, 14]** | [4, 6] | [9, 10] |
| 10-15° | 27 | 3 · 17 | 10 · 13 | 24 | **[12, 14]** | [2, 3] | [9, 10] |
| 15-20° | 32 | 1 · 15 | 10 · 13 | 24 | **[11, 13]** | [1, 2] | [8, 8] |
| 20-30° | 67 | 1 · 8 | 5 · 7 | 24 | [6, 7] | [0, 1] | [5, 5] |
| 30-45° | 32 | 1 · 4 | 2 · 3 | 21 | [2, 3] | [0, 1] | [2, 2] |
| 45-91° | 80 | 1 · 1 | 1 · 1 | 2 | [0, 1] | [0, 1] | [0, 1] |

**Cómo crece la anchura con la elevación.** Con el sol alto el problema se
descompone en trozos de 1 a 4 unidades (anchura 1). Ayora sigue así hasta 30°;
por debajo salta a 4-5 con componentes de 72 unidades (hasta 15°), luego a
[9, 22] entre 5° y 10° y a 31-43 con el sol rasante, con componentes de 243-267
unidades. Fayón es pequeña (24 unidades) pero más enredada a sol medio: los
seguidores tienen largos distintos y van escalonados en norte, y con el sol
oblicuo una fila larga cruza en la vista del sol a muchos vecinos. Su peor
instante llega a [12, 14] ya entre 10° y 15°.

Test nulo del 0.2: el grafo no es vacío en ninguna banda por debajo de 30°, ni
completo en ninguna (la mayor componente de Ayora nunca pasa de 267 de 427).
La envolvente no está hinchada sin remedio: entre 0,5° y 30° el motor confirma
dentro del rango del 35 al 71 % de sus pares unidad→mesa en Ayora, y del 33 al
61 % en Fayón. Por encima de 30° en Ayora no confirma casi ninguno (0,0-0,2 %):
ahí las aristas de envolvente son solo cota.

### Lo que esto dice del peldaño del solver

Tamaño de la mayor tabla de una programación dinámica sobre la descomposición
del grafo moral, D^(w+1). D = θ de la rejilla de 0,1° dentro del rango: p50 de
~280 a ~575 según la hora. Es TAMAÑO, no tiempo: el tiempo no se ha medido.
(`audit5/out/F0_peldano.txt`)

| Ayora | w (p50 del sup) | log10 tabla p50 / peor | dominio por unidad que haría falta para 10⁸ celdas (presupuesto declarado) p50 / peor |
|---|---|---|---|
| ≥ 30° | 1 | 5,0-5,6 | sin reducir |
| 20-30° | 1 (peor 5) | 5,5 / 16,7 | sin reducir / 21 |
| 10-20° | 5 (peor 9) | 16,7 / 27,8 | 21 / 6 |
| 5-10° | 13 (peor 22) | 38,9 / 63,7 | 3,7 / 2,2 |
| < 5° | 20-28 (peor 43) | 58,1-80,0 / 121 | ≤ 2,4 |

Con número:

1. **Por encima de 30°** (en Ayora, 111 de 288 instantes), la programación
   dinámica exacta sobre el dominio entero de 0,1° es inmediata: componentes de
   ≤ 4 unidades y anchura 1.
2. **Entre 10° y 30°**, la anchura es 4-5 (peor 9). La programación dinámica
   exacta es viable solo si la reducción del dominio por dominancia (fase 2)
   deja ~20 valores por unidad (6 en el peor instante). Si no los deja, toca
   ramificación y acotación con cota y brecha.
3. **Por debajo de 10°**, la anchura del problema es ≥ 9 y llega a 40-43 (Ayora)
   o 15-19 (Fayón). Ninguna reducción razonable del dominio hace exacta la
   programación dinámica. El peldaño es **ramificación y acotación con brecha
   publicada**. Según el encargo, nada con brecha > 0 se publica como óptimo.

Coste de esta medida (CPU, un proceso), primera pasada, con la máquina sin
otra carga: envolvente + los dos grafos + cotas de anchura, 0,137 s/instante en
Ayora (39,4 s los 288) y 0,005 s en Fayón; grafo realizado con el motor (JS,
rejilla de 24): 174,9 s en Ayora (0,61 s/instante) y 6,7 s en Fayón. La
segunda pasada (la de las tablas) corrió con la máquina COMPARTIDA con otras
medidas (carga 7-10 en 4 CPU): 291,5 s y 8,5 s en el grafo realizado. Sus
tiempos no se usan.

---

## `conoHaz`: el comentario tiene razón y el código no (decisión 2)

**Las dos citas, enfrentadas.**

- El comentario (`backtracking.html:992-994`, en `rangoHaz`): «Para un seguidor
  de un eje el AOI se separa en la desviación transversal y la componente axial:
  cos AOI = cos(θ − ψ)·cos λ, con sin λ = s·a.»
- El código (`backtracking.html:1030`, en `conoHaz`):
  `const sa=Math.sin(Z)*Math.cos(dA)*Math.sin(atr)+Math.cos(Z)*Math.cos(atr);   // s·a (eje inclinado)`

Para el eje a = (sin A·cos τ, cos A·cos τ, sin τ), s·a = sin Z·cos ΔA·**cos** τ +
cos Z·**sin** τ: el código lleva el seno y el coseno de τ cambiados. Con τ = 0,
lo que calcula es s·ẑ (el coseno del cenit), no la componente del sol a lo largo
del eje.

**Medido contra el motor** (`audit5/F0_conohaz.mjs`): cono de AOI ≤ 88° con la
normal del motor, barrido de θ cada 0,01°.

- **Ayora**: extremo del cono con error p50 0,91°, p90 3,51°, máx 8,06° (sol
  alto: [−79,46°, 80,17°] contra [−87,51°, 88,22°]).
- **Fayón**: p50 0,78°, máx 3,20°.
- **Control positivo**: con s·a como en el comentario, el error baja a 0,010°, el
  paso del barrido.

**Efecto en `rangoHaz`**:

- **Ayora**: cambia ≥ 0,1° en 7.901 de 122.976 unidad×instante (6,42 %), todos
  con sol < 10°, máx 0,55°.
- **Fayón**: 662 de 6.888 (9,61 %), máx 0,52°; 27 por encima de 10°.

**Efecto en el ANUAL de las nueve** (`audit5/F0_conohaz_anual.mjs`, réplica
del bucle de `yearbtn`: días 21, paso 10 min, lazo, banda de la página, 79
líneas). Se cargan dos simuladores del mismo texto, la página y la página con la
línea de `:1030` como dice su comentario, y corren sobre los mismos instantes.
Atajo exacto con su control: mientras las dos cadenas vayan iguales y la de la
página no llame a `conoHaz` en el instante, la corregida da lo mismo por
construcción y no se recalcula. *Control*: `pairwise`, 21-dic, con y sin atajo:
energía y θ idénticos bit a bit.

<!-- conohaz-anual:inicio (regenerar con node audit5/F0_conohaz_resumen.mjs) -->
**EN CURSO** a la hora de este commit: las políticas sin 12 meses no tienen anual todavía. `optimal` y `optfree` llevan horas por variante (medido en R4: ~2,2 y ~2,5 h por variante en esta banda).

| política | meses | anual página kWh/m² | anual corregida | Δ % | \|Δθ\| máx | instantes que llaman a conoHaz |
|---|---|---|---|---|---|---|
| astro | 12/12 | 2654,9656 | 2654,9656 | 0,0000 % | 0,000° | 0 de 875 |
| global | 4/12 **PARCIAL** | 788,5000 | 788,5000 | 0,0000 % | 0,000° | 0 de 278 |
| row | — | en curso | | | | |
| bt2d | — | en curso | | | | |
| pairwise | — | en curso | | | | |
| true3d | — | en curso | | | | |
| mgl | — | en curso | | | | |
| optimal | — | en curso | | | | |
| optfree | — | en curso | | | | |
<!-- conohaz-anual:fin -->

**Qué se hace (decisión del titular):**

- La página **no se toca**: cambiarla mueve ángulos publicados en las nueve
  políticas, y hay comparaciones de R4/R5 corriendo sobre esa base.
- El BT3D usa la fórmula **correcta** (`bt3d_parametros.json`, `cono_haz:
  "comentario"`). Queda escrito como **diferencia conocida** entre el motor
  nuevo y la página. El banco C vigila las dos: la copia de la página tiene que
  seguir siendo la página, y el rango del BT3D tiene que ser el de su fórmula y
  diferir de verdad del de la página.
- Es el **cuarto caso** del patrón «el código y su descripción dejaron de
  coincidir»: registrado en `audit5/PATRON_CODIGO_Y_DESCRIPCION.md` con los
  otros tres (y con un quinto, encontrado después: la escena y el giro máximo).

---

## Convergencia de meridianos (decisión 3)

Las mesas de las dos plantas están en norte de **cuadrícula** UTM:

- **Ayora** (30N): comprobado, porque las cotas y el layout EPSG:25830 coinciden
  con una rotación de −0,0003°.
- **Fayón** (31N): lo dice su layout.

El simulador usa el acimut del sol tal cual, contra el eje n. **El BT3D lo
corrige**: az_malla = az − γ, con Ayora **+1,161°** y Fayón **−1,764°**. Efecto
de la omisión (`audit5/F0_convergencia.mjs`). La medida:

- θ de backtracking pvlib **por unidad**, con el acimut del simulador y con el
  verdadero.
- Energía de las dos series con el **sol verdadero**: sombra del motor (unión,
  16 estaciones), `poaRow` y `elecLoss` del simulador, ponderada por largo.
- 12 días (el 21 de cada mes), paso 10 min, cielo claro. Sin lazo: se mide la
  geometría de la omisión, no el actuador.

| planta | γ | \|Δθ\| backtracking p50 / p90 / p99 / máx | Δθ medio con signo | \|Δθ\| astronómico p50 / máx | energía, con γ frente a sin γ |
|---|---|---|---|---|---|
| Ayora | +1,161° | 0,253° / 1,253° / 2,189° / 5,249° | +0,327° | 0,054° / 2,612° | **+0,018 %** |
| Fayón (el plano, solo relativo) | −1,764° | 0,698° / 1,931° / 3,656° / 16,223° | −0,420° | 0,384° / 3,186° | **−0,082 %** |

- **Test nulo** (γ = 0): Δθ = 0 exacto (es la identidad del cálculo, y se dice).
- **Control** en un instante del 21-jun sin unidades contra el tope: el Δθ
  medio cambia de signo con −γ (Ayora +0,093° / −0,089°; Fayón −1,075° /
  +1,080°). La primera versión del control cayó en un instante con todas las
  unidades en el tope y dio 0,0000° con los dos signos: E-X1-BT0-4.
- **Lectura**: la omisión sesga θ todo el día en la misma dirección, como decía
  el titular (Δθ medio con signo +0,33° en Ayora y −0,42° en Fayón). En energía
  el efecto es pequeño y **no tiene signo fijo**: el backtracking de pvlib no
  busca energía, así que apuntarlo bien no garantiza más. Ayora gana un 0,018 %
  y Fayón pierde un 0,082 %, y lo de Fayón es sobre el plano.

---

## Declarado, no modelado

- Sin terreno ni estructura en el motor. Con el sol rasante, el relieve taparía
  sombras de cientos de metros que aquí cuentan: la anchura con sol < 5° es cota
  del modelo sin terreno.
- La envolvente usa el giro completo, no el rango del instante. Por eso es solo
  la cota superior; la inferior sí usa el rango.
- La inferior sale de una rejilla de 24 θ por rango: una arista que solo exista
  entre dos puntos de la rejilla no se cuenta, y eso solo la hace más baja.
  Sigue siendo cota inferior.
- Fayón es el plano: la cota de cada punta de fila es del DEM, y la fila es
  recta entre sus dos puntas.
- Convergencia de meridianos: aplicada en el BT3D, no en el simulador;
  diferencia declarada y medida (arriba).
- Penumbra fuera del modelo.

## Errores propios de esta fase (formato E-X1)

- **E-X1-BT0-1** · Primera medida de la anchura sobre el grafo de PARES. Con la
  pérdida de cada receptora por unión de todos sus emisores, el alcance de cada
  término es un hiperarco y la anchura que decide es la del grafo MORAL. Con
  pares, el peor instante de Ayora salía [29, 31] en vez de [38, 43]. Se vio
  antes de publicar; las dos van en las tablas.
- **E-X1-BT0-2** · C1 de la auditoría comparaba recortes, |ψ| − |θ_bt|, y marcó
  «NO PASA, 6,97°». La métrica estaba mal cuando pvlib pasa la horizontal. Se
  cambió a comparar ángulos de mando y a contar aparte lo que queda fuera del
  dominio de Afección BT (10 casos): en su dominio pasa con 0,0048°.
- **E-X1-BT0-3** · La primera ventana de fuerza bruta del banco E cogía 35
  mesas de Ayora (una caja alrededor de la media, que en Ayora cae en un
  hueco). Pasó a las 120 más cercanas a la mediana.

El titular ha subrayado el primero, y con razón. El motivo —la pérdida de una
mesa depende de la UNIÓN de sus emisores, así que quedan acoplados entre sí— es
exactamente por lo que este problema no es de pares.

- **E-X1-BT0-4** · El control de la convergencia eligió el primer instante del
  21-jun con sol cerca de 30°. En Ayora, ahí todas las unidades estaban contra
  el tope de 55° y el Δθ salía 0,0000° con +γ y con −γ: un control que no podía
  fallar. Ahora se elige un instante sin unidades en el tope.
- **E-X1-BT0-5** · El script del anual de `conoHaz` unía con `path.join` una
  ruta absoluta de salida a la raíz del repo, y el primer control murió con
  ENOENT. Ahora usa `path.resolve`.

## Decisiones del titular (2026-09-24)

1. **Solver**: por tramos, pero el método lo elige la **ANCHURA MEDIDA de cada
   instante**, no su elevación. La elevación es un proxy para planificar; la
   anchura es el criterio. Si un instante a 25° tiene anchura 9, cae al método
   de 9. Se publica, por instante, la anchura, el método usado, el tiempo y la
   brecha. **Brecha 0 o no se llama óptimo**: los instantes que no cierren se
   listan con su brecha y quedan fuera de la afirmación de optimalidad. Y la
   reducción de dominio de la fase 2 hay que **demostrarla EXACTA** antes de
   fiarse de ella: un θ se elimina solo si está dominado para TODA configuración
   de sus emisores, con control de fuerza bruta en casos pequeños.
2. **`conoHaz`**: la página no se toca; se declara, se mide el anual y el BT3D
   usa la fórmula correcta (sección de arriba).
3. **Convergencia**: se aplica en el BT3D y se declara como diferencia con el
   simulador, medida en θ y en energía (sección de arriba).
4. **Afección BT**: tercer motor, no se reutiliza ni se arregla; documentado
   con sus dos cifras (sección 0.1).
5. **Fayón**: sin cotas medidas, solo DEM a 10 m. Vale para el grafo, no para
   publicar energía; limitación declarada en todo lo que sale de Fayón, y sin
   comparaciones absolutas con Ayora.
6. **Errores**: los de esta fase van en E-X1 (arriba).
7. **Siguen en pie** las decisiones anteriores: P1 → opción (c); control 2.6 →
   opción 1 reescrito; el hallazgo de las filas alternas no se publica hasta
   cerrar difusa enmascarada, mismatch y albedo.

## Reproducir

```
node audit5/F0_escenas.mjs                       # escenas (no se versionan)
node audit5/test_parametros.mjs                  # banco A-E
python3 -m bt3d.test_grafo                       # banco de las cotas de anchura
node audit5/F0_afbt.mjs                          # 0.1
node audit5/F0_realizable.mjs --cada=1 --k=24    # grafo realizado (3 min; su JSON, 3 MB, no se versiona)
python3 -m bt3d.f0_estructura --json=audit5/out/F0_estructura.json   # 0.2
node audit5/F0_conohaz.mjs                       # el cono de conoHaz contra el del motor
node audit5/F0_conohaz_anual.mjs --pol=pairwise  # el anual con y sin la corrección (una política por llamada)
node audit5/F0_convergencia.mjs ayora            # la convergencia en θ y energía (y fayon)
python3 -m bt3d.f0_peldano                       # la tabla del peldaño
```

## Ficheros

`audit5/bt3d_parametros.json` · `audit5/lib_parametros.mjs` ·
`audit5/lib_escena.mjs` · `audit5/lib_envolvente.mjs` ·
`audit5/F0_escenas.mjs` · `audit5/test_parametros.mjs` ·
`audit5/F0_afbt.mjs` · `audit5/F0_realizable.mjs` · `audit5/F0_conohaz.mjs` ·
`audit5/lib_conohaz.mjs` · `audit5/F0_conohaz_anual.mjs` · `audit5/F0_convergencia.mjs` ·
`audit5/PATRON_CODIGO_Y_DESCRIPCION.md` ·
`bt3d/` (`parametros.py`, `sol.py`, `escena.py`, `envolvente.py`,
`grafo.py`, `careo.py`, `f0_estructura.py`, `f0_peldano.py`, `test_grafo.py`) · salidas en
`audit5/out/F0_*.txt|json`.
