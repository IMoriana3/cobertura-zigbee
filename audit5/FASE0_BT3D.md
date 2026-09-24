# BT3D de conjunto · FASE 0 — estructura antes de código

Simulador `v1.78.1` (`backtracking.html:532`). Rama `claude/r5-bt3d-f0-6th1im`,
apilada sobre `claude/r5-proyeccion-6th1im` (PR #748, el motor de proyección),
que no está en `main`. `audit2/` intacto; las nueve políticas de
`backtracking.html` no se tocan: esta fase no cambia ni una línea de la página.

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
| rango por unidad | `rangoHaz` del simulador (`:983-1000`, cono `:1026-1036`), por unidad e instante, con el tilt de la unidad (media de τ de sus mesas) y la pendiente transversal del plano de sus dos filas | se llama al simulador, no se copia; la copia Python se carea (banco C) |
| signo | θ>0 = la cara mira al ESTE; τ>0 = el norte más alto; a pvlib va −τ | `sol.js:102-108`, `pvTilt` (`:606`), `lib_proyeccion.mjs:8-9`; precedente −τ/+τ de R4-A |
| x de fila | Ayora: levantamiento (x de SU fila); Fayón: plano (x del DWG ± filaZ) | `lib_mesas.mjs`; `fayon_layout.json` `mesa.filaZ` |
| nb | 2 en las dos plantas, **configurado a mano** | `backtracking.html:189` (`nbp` value=2); `nbFicha()` no encuentra ficha (`:4638-4650`) |
| z0 | 0,17 m | `backtracking.html:186` |
| cuerda | Ayora 2,384 m; Fayón 2,411 m | `ayora_cotas.json` `cuerda`; `fayon_layout.json` `mesa.modH` × 1V |
| techo de haz / margen de rango | 88° / 2° | `AOI_HAZ` (`:950`), `rangoHaz` (`:987`) |
| penumbra | **fuera del modelo**, declarado: el sol es puntual | — |
| convergencia de meridianos | no se aplica (como el simulador); Fayón −1,764° declarada; Ayora no declarada | `fayon_layout.json` `georef.nota` |
| días | 21-jun y 21-dic de 2026, cada 5 min, sol > 0,5° | el criterio de `audit5/F0_dimension.mjs` |

**Banco** `audit5/test_parametros.mjs` (12/12 en verde, 48 s). Cae si:

- **A** · el texto canónico que resuelven JS y Python para cada unidad difiere en
  un carácter (427 unidades de Ayora, 24 de Fayón). *Control negativo*: una
  copia del fichero con la banda muerta a 0,2, leída solo por Python → cae.
- **B** · lo declarado se aparta de lo que usa el simulador (se lee de
  `backtracking.html` y de los ficheros de planta: `PASO_BUSQ`, `AOI_HAZ`, el
  margen de `rangoHaz`, el signo de `pvTilt`, los `value` de `z0` y `nbp`,
  θmáx y cuerda). *Control negativo*: 8 mutaciones de uno en uno, las 8 vistas.
  Y el signo contra el motor: a θ = +30° la normal tiene x = +0,500 (a −30°, −0,500).
- **C** · el rango Python (copia de `rangoHaz`) y el del simulador se apartan
  más de 1e-9°. Medido: máx |Δ| = 2,8·10⁻¹⁴° en 122.976 (Ayora) y 6.888
  (Fayón) unidad×instante. *Control*: con +τ a pvlib se aparta 9,24° (Ayora) y
  28,63° (Fayón).
- **D** · los dos enumeradores por envolvente (JS y Python) dan pares distintos
  en algún instante. Medido: 0 diferencias en 288 + 287 instantes (1.804.683 y
  85.587 pares mesa→mesa). *Control*: con ρ·0,99 en JS cambian 10 de 24
  instantes muestreados en cada planta.
- **E** · falta en la envolvente algún par con sombra del motor. Motor a θ
  aleatorio en [−55°, 55°] por mesa, fuerza bruta todos contra todos en una
  ventana de 120 mesas (Ayora; en Fayón las 96), dos sorteos por instante:
  5.034 y 10.065 pares con sombra real, **faltan 0**. *Control*: con ρ·0,7
  faltan 92 de 4.861 y 197 de 9.987.

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

**Veredicto: no se reutiliza. Queda documentado como TERCER MOTOR**, junto al
contador del simulador (`shadeBand3DAll`) y al de proyección (`lib_proyeccion`).
Es un buen motor 2D del gemelo, porque pasa la tangencia y el espejo. Pero no
puede representar vecinos en θ distintos, que es justo lo que el BT3D de
conjunto decide, y enumera menos de un par de cada cinco.

---

## 0.2 · Estructura del grafo, Ayora y Fayón, dos días

**Escenas** (`audit5/F0_escenas.mjs` → `audit5/out/escenas/`, sin versionar, se regeneran):

- **Ayora**: levantamiento, bloque 0 entero. 107 líneas, 1.708 mesas, **427
  unidades** (un tracker = 2 filas × 2 mesas, un motor), 288 instantes.
- **Fayón**: **el plano, no la medida**. x/n del DWG, filas a ±3 m, cota de cada
  punta de fila del DEM de 10 m. El propio relieve dice `validado: false`; el
  error de ese producto donde sí hubo levantamiento fue p50 0,83/1,29 m. 28
  líneas, 96 mesas, **24 unidades**, 287 instantes.

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
  motor con θ de una rejilla de 24 valores **dentro del rango del simulador**
  de cada unidad en ese instante, que es el dominio del problema. Es un
  subgrafo del verdadero, así que su anchura es ≤ la del problema.
- Las dos anchuras son intervalos [MMD+, mejor de grado mínimo / relleno mínimo].
- Comprobado en cada instante: inferior ≤ superior (si no, el script aborta).

### Ayora — 427 unidades

| elevación | inst. | emisores por unidad receptora p50 · máx | emisores por **mesa** receptora p90 · máx | mayor componente (moral) | anchura MORAL del problema, peor instante [inf, sup] | p50 [inf, sup] | anchura de PARES, peor [inf, sup] |
|---|---|---|---|---|---|---|---|
| 0,5-1° | 2 | 13 · 41 | 21 · 34 | 267 | **[33, 43]** | [33, 43] | [22, 29] |
| 1-2° | 7 | 10 · 52 | 26 · 40 | 267 | **[38, 43]** | [32, 37] | [29, 30] |
| 2-3° | 5 | 7 · 38 | 14 · 32 | 243 | **[34, 39]** | [14, 24] | [28, 31] |
| 3-5° | 9 | 6 · 25 | 11 · 22 | 243 | **[20, 28]** | [11, 21] | [16, 26] |
| 5-10° | 25 | 3 · 15 | 7 · 12 | 158 | **[9, 22]** | [5, 13] | [8, 16] |
| 10-15° | 26 | 3 · 6 | 4 · 5 | 72 | **[5, 9]** | [4, 5] | [4, 4] |
| 15-20° | 28 | 3 · 6 | 3 · 3 | 72 | **[5, 5]** | [4, 5] | [4, 4] |
| 20-30° | 75 | 1 · 6 | 3 · 3 | 72 | **[4, 5]** | [1, 1] | [4, 4] |
| 30-45° | 31 | 1 · 2 | 1 · 1 | 4 | **[1, 1]** | [0, 1] | [1, 1] |
| 45-91° | 80 | 1 · 2 | 1 · 1 | 4 | **[1, 1]** | [1, 1] | [1, 1] |

### Fayón — 24 unidades (el plano)

| elevación | inst. | emisores por unidad receptora p50 · máx | emisores por mesa receptora p90 · máx | anchura MORAL, peor [inf, sup] | p50 [inf, sup] | anchura de PARES, peor |
|---|---|---|---|---|---|---|
| 0,5-1° | 1 | 3 · 5 | 3 · 5 | [3, 5] | [3, 5] | [2, 3] |
| 1-2° | 7 | 5 · 19 | 12 · 17 | **[16, 20]** | [7, 9] | [12, 12] |
| 2-3° | 5 | 4 · 21 | 13 · 17 | **[17, 19]** | [5, 7] | [11, 11] |
| 3-5° | 10 | 4 · 19 | 14 · 18 | **[17, 19]** | [6, 9] | [11, 12] |
| 5-10° | 26 | 4 · 14 | 10 · 12 | **[12, 14]** | [4, 6] | [9, 10] |
| 10-15° | 27 | 3 · 16 | 10 · 12 | **[11, 14]** | [2, 3] | [9, 10] |
| 15-20° | 32 | 1 · 15 | 10 · 12 | **[11, 12]** | [2, 3] | [8, 8] |
| 20-30° | 67 | 1 · 8 | 5 · 7 | [6, 7] | [0, 1] | [5, 5] |
| 30-45° | 32 | 1 · 4 | 2 · 3 | [2, 3] | [0, 1] | [2, 2] |
| 45-91° | 80 | 1 · 1 | 1 · 1 | [0, 1] | [0, 1] | [0, 1] |

**Cómo crece la anchura con la elevación.** Con el sol alto el problema se
descompone en trozos de 1 a 4 unidades (anchura 1). Ayora sigue así hasta 30°;
por debajo salta a 4-5 con componentes de 72 unidades (hasta 15°), luego a
[9, 22] entre 5° y 10° y a 33-43 con el sol rasante, con componentes de 243-267
unidades. Fayón es pequeña (24 unidades) pero más enredada a sol medio: los
seguidores tienen largos distintos y van escalonados en norte, y con el sol
oblicuo una fila larga cruza en la vista del sol a muchos vecinos. Su peor
instante llega a [11, 14] ya entre 10° y 20°.

Test nulo del 0.2: el grafo no es vacío en ninguna banda por debajo de 30°, ni
completo en ninguna (la mayor componente de Ayora nunca pasa de 267 de 427).
La envolvente no está hinchada sin remedio: entre 0,5° y 30° el motor confirma
dentro del rango del 35 al 71 % de sus pares unidad→mesa en Ayora, y del 33 al
63 % en Fayón. Por encima de 30° en Ayora no confirma casi ninguno (0,0-0,1 %):
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
| < 5° | 21-28 (peor 43) | 60,8-80,1 / 121 | ≤ 2,3 |

Con número:

1. **Por encima de 30°** (en Ayora, 111 de 288 instantes), la programación
   dinámica exacta sobre el dominio entero de 0,1° es inmediata: componentes de
   ≤ 4 unidades y anchura 1.
2. **Entre 10° y 30°**, la anchura es 4-5 (peor 9). La programación dinámica
   exacta es viable solo si la reducción del dominio por dominancia (fase 2)
   deja ~20 valores por unidad (6 en el peor instante). Si no los deja, toca
   ramificación y acotación con cota y brecha.
3. **Por debajo de 10°**, la anchura del problema es ≥ 9 y llega a 33-43 (Ayora)
   o 16-17 (Fayón). Ninguna reducción razonable del dominio hace exacta la
   programación dinámica. El peldaño es **ramificación y acotación con brecha
   publicada**. Según el encargo, nada con brecha > 0 se publica como óptimo.

Coste de esta medida (CPU, un proceso): envolvente + los dos grafos + cotas de
anchura, 0,137 s/instante en Ayora (39,4 s los 288) y 0,005 s en Fayón. Grafo
realizado con el motor (JS, rejilla de 24): 174,9 s en Ayora (0,61 s/instante)
y 6,7 s en Fayón.

---

## Hallazgo lateral, que no se toca: `conoHaz` no hace lo que dice su comentario

`conoHaz` (`backtracking.html:1026-1036`) dice «cos AOI = cos(θ − ψ)·cos λ, con
sin λ = s·a», pero calcula `sa = sin Z·cos ΔA·sin τ + cos Z·cos τ` (`:1030`).
Para el eje a = (sin A·cos τ, cos A·cos τ, sin τ), s·a = sin Z·cos ΔA·cos τ +
cos Z·sin τ: el código lleva el seno y el coseno de τ cambiados. Medido contra
el cono de AOI ≤ 88° de la normal del motor (barrido de θ cada 0,01°,
`audit5/F0_conohaz.mjs`):

- **Ayora**: extremo del cono con error p50 0,91°, p90 3,51°, máx 8,06° (sol
  alto: [−79,46°, 80,17°] contra [−87,51°, 88,22°]).
- **Fayón**: p50 0,78°, máx 3,20°.
- **Control positivo**: con s·a como en el comentario, el error baja a 0,010°, el
  paso del barrido.

Efecto en `rangoHaz` por unidad, que es lo que leen simulador y optimizador:

- **Ayora**: cambia ≥ 0,1° en 7.901 de 122.976 unidad×instante (6,42 %),
  todos con sol < 10°, máx 0,55°.
- **Fayón**: 662 de 6.888 (9,61 %), máx 0,52°; 27 casos por encima de 10°.

El error cae en el extremo trasero del rango, más allá de la horizontal.
**No se corrige**: es la página y la decisión es tuya. El banco C obliga a que
la copia Python siga a la del simulador, así que, si se corrige allí, el banco
cae hasta que se actualice aquí.

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
- Convergencia de meridianos no aplicada (como el simulador): la sensibilidad es
  de la fase 5.
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

## Lo que queda para ti

1. **Peldaño del solver**: los números de arriba. Mi lectura es programación
   dinámica exacta por encima de 30°; entre 10° y 30°, programación dinámica
   solo si la dominancia deja ~20 valores por unidad; por debajo de 10°,
   ramificación y acotación con brecha publicada.
2. **`conoHaz`**: ¿se corrige la fórmula en la página, que cambia `rangoHaz`
   hasta 0,55° con sol < 10°, o se deja y se declara?
3. **Convergencia de meridianos**: ¿se sigue sin aplicar, como el simulador?

## Reproducir

```
node audit5/F0_escenas.mjs                       # escenas (no se versionan)
node audit5/test_parametros.mjs                  # banco A-E
python3 -m bt3d.test_grafo                       # banco de las cotas de anchura
node audit5/F0_afbt.mjs                          # 0.1
node audit5/F0_realizable.mjs --cada=1 --k=24    # grafo realizado (3 min; su JSON, 3 MB, no se versiona)
python3 -m bt3d.f0_estructura --json=audit5/out/F0_estructura.json   # 0.2
node audit5/F0_conohaz.mjs                       # el hallazgo de conoHaz
```

## Ficheros

`audit5/bt3d_parametros.json` · `audit5/lib_parametros.mjs` ·
`audit5/lib_escena.mjs` · `audit5/lib_envolvente.mjs` ·
`audit5/F0_escenas.mjs` · `audit5/test_parametros.mjs` ·
`audit5/F0_afbt.mjs` · `audit5/F0_realizable.mjs` · `audit5/F0_conohaz.mjs` ·
`bt3d/` (`parametros.py`, `sol.py`, `escena.py`, `envolvente.py`,
`grafo.py`, `careo.py`, `f0_estructura.py`, `test_grafo.py`) · salidas en
`audit5/out/F0_*.txt|json`.
