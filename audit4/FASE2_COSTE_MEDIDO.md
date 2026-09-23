# R4 · FASE 2 — 2.3 y 2.6, los dos números que faltaban

Sonda: `audit4/F2_coste_informe.mjs` → `audit4/out/F2_coste_preset.json`.
Las dos corridas van **seguidas y en la misma máquina**, que es la lección del
error 24. Carga del sistema al empezar y al acabar, publicada en la salida.

---

## 2.3 · **La variante sin diferir NO CIERRA EN 1 h 53 min con la máquina libre**

Ese es el resultado del ítem, no la explicación de por qué falta un número.

Sobre la **planta real** (Ayora, 107 líneas, 1.600 mesas), la variante *sin
diferir* —la que calcula las nueve políticas, o sea lo que había antes de la
v1.77— se abandonó a los **6.800 s** sin terminar, con la máquina **dedicada**:
los latidos registran carga 1,00-1,09 durante toda la corrida, o sea un solo
proceso.

**Es una COTA, y va con su presupuesto declarado**: `> 6.800 s`. No es una
medida, y no se presenta como tal. Lo que la hace publicable es el presupuesto
al lado; un límite inferior que sigue creciendo en silencio no vale nada.

La sonda ahora lleva ese presupuesto dentro (`--tope23`, 45 min por defecto):
aborta y publica `> presupuesto` en vez de colgarse.

### Y el número completo, sobre el preset

Misma medida, geometría que **sí termina** (el preset, sin planta real). Se
publican las dos: la cota de la grande y el número de la pequeña, cada uno con
su geometría dicha.

| | tiempo | pasos | series calculadas |
|---|---|---|---|
| **con diferir** (v1.77+) | **324 ms** | 1.152 | 8 de 9 |
| **sin diferir** (lo de antes) | **3.224 ms** | 1.440 | 9 de 9 |

**El diferimiento ahorra 2.900 ms de 3.224: el 89,9 % del coste del informe.**

**Test nulo, delante del recuento**: con esta configuración se difiere
**UNA** política, `mgl`. Si no se difiriera ninguna, las dos medidas serían la
misma y el número no informaría de nada.

> Y esa es la lectura que importa: **una sola política, `mgl`, es el 89,9 % del
> coste del informe.** No es que nueve políticas cuesten nueve veces una: es que
> una de ellas cuesta como nueve.

Concuerda con lo que #711 midió por otra vía (el 71,0-99,7 % del coste del día
en los 22 puntos del barrido de tilt N-S) y es lo que sostiene el criterio de
«política cara por coste MEDIDO» de la fase 2.

---

## 2.6 · Generar el terreno con pendiente N-S **no es caro, y la premisa del
ítem es falsa**

`terrain(cfg())`, **2.000 llamadas** por caso, tras una pasada en vacío para
que el JIT no cuente:

| terreno | ms por llamada | total de las 2.000 |
|---|---|---|
| llano (tilt 0, `constante`) | **0,00475 ms** | 9,5 ms |
| **con pendiente N-S** (tilt 4, `quebrado`) | **0,00385 ms** | 7,7 ms |

**Generar el terreno cuesta unos 5 microsegundos, y con pendiente N-S es más
rápido, no más lento.**

**Por qué N = 2.000 y no 20.** Con N = 20 la cifra salía 0,02-0,05 ms, o sea
**uno o dos tics del reloj**: a esa escala el número no puede sostener lo que
aparenta. Con 2.000 el total va a decenas de ms y el por-llamada tiene tres
cifras de margen sobre la resolución. **La primera versión de esta medida no
valía, y se dice.**

**Consecuencia para el ítem**: 2.6 pedía el tiempo de generar el terreno con
pendiente N-S «antes y después», dando por supuesto que ahí estaba el coste.
No está. El coste que #711 señaló es el de **las políticas evaluadas encima**,
no el de la generación. La premisa del ítem era falsa y la medida lo dice.

### 2.6 bis · El primer día de la planta real

**502,5 s** sobre `main` con la fase 2 dentro, calculando en el día solo
`pairwise` y `true3d` — las otras se difieren o las apaga la carga de planta
real.

**Esta cifra NO se compara con los 516,6 / 518,5 s** medidos antes en otra
sesión y otro contenedor. Son la no-comparabilidad del error 24 exactamente:
dos medidas de tiempo en máquinas distintas no se restan. El «antes» en esta
misma máquina **NO ESTÁ MEDIDO**, y así queda.

---

## Lo que la fase 2 deja cerrado y lo que no

**Cerrado**: 2.3 con su cota declarada y su número completo; 2.6 con la premisa
del propio ítem refutada.

**Abierto y dicho**: el «antes» de 2.6 bis en esta máquina (**NO MEDIDO**), y el
coste de 2.3 sobre la planta real (**cota, no medida**).
