# R4 · LA REJILLA DE DOS EJES — TERRENO × POLÍTICA

El formato que pediste, copiado de la diapositiva de Solargik: **una tabla por
día, el terreno en filas y la política en columnas**, con la baseline a 0 y
todo lo demás en porcentaje sobre ella.

Sonda: `audit4/F_rejilla_energia.mjs` → `audit4/out/rejilla_eo3.json` y
`audit4/out/rejilla_eo10.json`.

## Qué mide exactamente cada celda

**POA de planta NETA** (el modelo eléctrico Martinez ya dentro) del día,
integrada sobre los instantes con sol, con el ángulo **pasado por el lazo de
control** (banda muerta + velocidad del actuador) **y por el tope del
backtracking**. O sea: lo que la planta ejecuta, no lo que la política pide.

**El denominador va en cada tabla**: el porcentaje es contra `pairwise` **de la
misma fila**, y la POA absoluta de esa baseline está en la última columna, para
que ningún porcentaje viaje sin su base.

**La geometría**: 8 líneas, pitch 6,00 m, cuerda 2,382 m, θmáx 55°, bifila,
28 módulos, 2 diodos de bypass, Zaragoza, paso de 20 min. La **fluctuación N-S**
de las filas es un perfil senoidal de la amplitud indicada.

**Test nulo, en las dos rejillas**: ninguna fila deja de distinguir políticas y
ninguna columna deja de separarse de la baseline. Sin eso, una tabla de ceros
se leería como «da igual el terreno».

## La pendiente E-O es un parámetro, y se publican las dos

Con **10°** el caso sale extremo: `pairwise` se aplana para evitar una sombra
que en buena parte es irreducible, y las ganancias se salen de la envolvente de
mercado que la propia página vigila (>8 % = «sospecha de bug del evaluador, no
ventaja»). Con **3°** el terreno es realista. **Cuál representa una planta es
una decisión tuya, y no se toma escondiendo la otra.**

### Pendiente E-O 3° — el terreno realista

**21-mar**

| fluctuación N-S | Pairwise<br><sub>baseline</sub> | True-3D | Min ground<br>light | Energy-<br>optimal | Óptimo<br>libre | Astronómico<br><sub>sin BT</sub> | POA base (W/m²) |
|---|---|---|---|---|---|---|---|
| **±0.5°** | — | +1.32 % | +1.12 % | +2.57 % | +2.65 % | +0.61 % | 21.442.8 |
| **±1°** | — | +1.99 % | +1.68 % | +5.82 % | +6.09 % | +4.12 % | 20.705.8 |
| **±2°** | — | +0.70 % | +2.76 % | +12.49 % | +12.64 % | +11.41 % | 19.375.3 |
| **±3°** | — | -0.39 % | +2.85 % | +17.35 % | +17.50 % | +16.31 % | 18.485.2 |
| **±4°** | — | -2.65 % | +2.14 % | +19.39 % | +19.41 % | +18.88 % | 17.986.7 |

**21-jun**

| fluctuación N-S | Pairwise<br><sub>baseline</sub> | True-3D | Min ground<br>light | Energy-<br>optimal | Óptimo<br>libre | Astronómico<br><sub>sin BT</sub> | POA base (W/m²) |
|---|---|---|---|---|---|---|---|
| **±0.5°** | — | +1.09 % | +0.88 % | +1.89 % | +1.95 % | +0.56 % | 32.273.0 |
| **±1°** | — | +1.45 % | +1.15 % | +4.17 % | +4.27 % | +3.12 % | 31.499.8 |
| **±2°** | — | +0.52 % | +1.86 % | +9.40 % | +9.44 % | +8.43 % | 29.878.4 |
| **±3°** | — | -0.30 % | +1.69 % | +13.39 % | +13.43 % | +12.55 % | 28.669.3 |
| **±4°** | — | -1.86 % | +1.37 % | +15.26 % | +15.27 % | +14.74 % | 27.973.0 |

**21-dic**

| fluctuación N-S | Pairwise<br><sub>baseline</sub> | True-3D | Min ground<br>light | Energy-<br>optimal | Óptimo<br>libre | Astronómico<br><sub>sin BT</sub> | POA base (W/m²) |
|---|---|---|---|---|---|---|---|
| **±0.5°** | — | +1.91 % | +1.51 % | +4.11 % | +4.18 % | +2.29 % | 7.771.1 |
| **±1°** | — | +3.60 % | +3.08 % | +9.17 % | +9.61 % | +7.73 % | 7.379.5 |
| **±2°** | — | -0.24 % | +3.26 % | +16.09 % | +16.54 % | +15.49 % | 6.881.6 |
| **±3°** | — | -0.84 % | +3.89 % | +23.41 % | +23.66 % | +22.73 % | 6.458.2 |
| **±4°** | — | -3.44 % | +2.82 % | +26.32 % | +26.37 % | +26.32 % | 6.285.6 |

### Pendiente E-O 10° — el caso extremo

**21-mar**

| fluctuación N-S | Pairwise<br><sub>baseline</sub> | True-3D | Min ground<br>light | Energy-<br>optimal | Óptimo<br>libre | Astronómico<br><sub>sin BT</sub> | POA base (W/m²) |
|---|---|---|---|---|---|---|---|
| **±0.5°** | — | +1.80 % | +0.89 % | +3.10 % | +3.15 % | +1.92 % | 20.902.4 |
| **±1°** | — | +2.22 % | +0.92 % | +5.46 % | +5.66 % | +4.55 % | 20.384.3 |
| **±2°** | — | +2.05 % | +2.27 % | +10.51 % | +10.89 % | +9.92 % | 19.346.4 |
| **±3°** | — | +1.87 % | +2.01 % | +16.14 % | +16.30 % | +15.50 % | 18.349.1 |
| **±4°** | — | +0.58 % | +1.36 % | +19.81 % | +19.84 % | +19.38 % | 17.679.6 |

**21-jun**

| fluctuación N-S | Pairwise<br><sub>baseline</sub> | True-3D | Min ground<br>light | Energy-<br>optimal | Óptimo<br>libre | Astronómico<br><sub>sin BT</sub> | POA base (W/m²) |
|---|---|---|---|---|---|---|---|
| **±0.5°** | — | +1.32 % | +0.71 % | +2.27 % | +2.37 % | +1.10 % | 31.545.5 |
| **±1°** | — | +1.58 % | +0.74 % | +4.09 % | +4.21 % | +3.09 % | 30.920.9 |
| **±2°** | — | +1.71 % | +1.38 % | +7.89 % | +8.02 % | +7.20 % | 29.685.1 |
| **±3°** | — | +1.79 % | +1.29 % | +12.40 % | +12.43 % | +11.64 % | 28.419.9 |
| **±4°** | — | +1.33 % | +1.66 % | +15.91 % | +15.94 % | +15.55 % | 27.338.0 |

**21-dic**

| fluctuación N-S | Pairwise<br><sub>baseline</sub> | True-3D | Min ground<br>light | Energy-<br>optimal | Óptimo<br>libre | Astronómico<br><sub>sin BT</sub> | POA base (W/m²) |
|---|---|---|---|---|---|---|---|
| **±0.5°** | — | +2.13 % | +0.92 % | +4.58 % | +4.61 % | +3.01 % | 7.610.3 |
| **±1°** | — | +4.13 % | +1.75 % | +8.53 % | +8.80 % | +7.38 % | 7.296.2 |
| **±2°** | — | +3.58 % | +2.86 % | +15.00 % | +15.34 % | +14.34 % | 6.847.1 |
| **±3°** | — | +3.46 % | +2.61 % | +23.45 % | +23.45 % | +22.74 % | 6.379.0 |
| **±4°** | — | +1.02 % | +3.12 % | +28.20 % | +28.28 % | +27.89 % | 6.128.5 |


---

## Lo que la rejilla dice, y lo que desmintió

### El motor de la ganancia es la fluctuación N-S, no la pendiente E-O

Yo había dicho que las ganancias enormes venían de la pendiente de 10°.
**Medido a 3°, son casi las mismas**: `optimal` el 21-dic da **+28,20 %** a 10°
y **+26,32 %** a 3°. Quien manda es la **amplitud de la fluctuación N-S**: en
las dos rejillas, la columna de `optimal` va de ~+2 % a ±0,5° hasta ~+20-28 % a
±4°. Mi hipótesis era falsa y la medida la desmontó.

### A 3° aparece una columna que 10° escondía: `true3d` se vuelve NEGATIVA

| día | fluctuación | `true3d` a 3° |
|---|---|---|
| 21-dic | ±2° | **−0,24 %** |
| 21-mar | ±3° | **−0,39 %** |
| 21-jun | ±3° | **−0,31 %** |
| 21-dic | ±3° | **−0,84 %** |
| 21-jun | ±4° | **−1,86 %** |
| 21-mar | ±4° | **−2,65 %** |
| 21-dic | ±4° | **−3,44 %** |

Siete celdas en que la bisección 3D produce **menos** que `pairwise`. A 10° eso
no se ve en ninguna. No es un hallazgo sobre `true3d` que esta página pueda
cerrar —hace falta saber por qué—, pero **sí es la razón de publicar las dos
pendientes**: la rejilla del caso extremo habría enseñado nueve columnas
positivas y la conclusión habría sido otra.

## Las cifras son de `v1.78.0`, y no han cambiado

La primera versión de esta rejilla se corrió sobre `v1.77.0` (`a46d33b`), antes
de que entrara la fase 1 y el #727. Re-medida entera sobre `main` actual
(`v1.78.0`, `01bec48`): **las 30 celdas × 3 días salen idénticas, cambio máximo
0,0000 puntos porcentuales**.

Y eso tiene explicación comprobada, no es casualidad:

* la rejilla llama a `policyAngles` y `poaPlant`, la rama **POR LÍNEA** — nunca
  la rama por mesa;
* el arreglo de la fase 1 tocó **solo** la rama por mesa, y su ítem 1.4 verificó
  que la de línea quedaba intacta (+13,7221 % en las seis celdas de control);
* el #727 **no tocó `backtracking.html`**: cambió `terreno.html`,
  `tools/test_afbt_rayos.mjs` y el CI.

Así que el cero de esta re-medida es una **confirmación independiente** del
control por línea de 1.4, desde otra sonda y otra geometría.

## Lo que esta rejilla NO dice

* **No son nueve políticas, son seis.** `global`, `row` y `bt2d` no están en la
  tabla. En la geometría de la rejilla no aportan una columna distinta que
  merezca el coste, y no se rellena una casilla por simetría.
* **Son tres días, no un año.** 21-mar, 21-jun y 21-dic. La cifra anual es otra
  cosa y no se finge a partir de ésta.
* **Es un terreno sintético.** La fluctuación senoidal no es el relieve de
  ninguna planta real; es un barrido paramétrico para ver la forma de la
  respuesta.
