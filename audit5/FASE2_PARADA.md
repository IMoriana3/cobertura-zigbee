# R5 · Fase 2 — (era) PARADA: en terreno uniforme, el backtracking uniforme NO es el óptimo sin sombra (+6,15 % y +7,08 % a sol de 10-12°, sombra 0)

**Refutación de la premisa del control 2.6, y parada (A10).** No se ha tocado el
control para que pase (R3).

## Lo que pide 2.6

> Terreno uniforme, filas paralelas e infinitas, sin torsión ⇒ coincide con
> `pairwise` dentro de `E_EMPATE_W` (0,05 W/m², `backtracking.html:967`).

## Lo que da

El banco de la política (`audit5/test_conjunto.mjs` → `audit5/out/test_conjunto.txt`)
cae en esa comprobación: la política encuentra configuraciones **no uniformes y
sin sombra** que producen más que la tangencia uniforme.

**Comprobado con los instrumentos del propio simulador, sin el motor de R5**
(`audit5/F2_refutacion_26.mjs` → `audit5/out/F2_refutacion_26.txt`): 7 filas
planas, pitch 6, cuerda 2,384, z0 0,17, filas de 600 m; mismas irradiancias.

| sol (zen/az) | θ_bt | `poaPlant` uniforme | `poaPlant` no uniforme | Δ | sombra 3D (`shadeRows`) | 2.5D (`shadeFracPair`) |
|---|---|---|---|---|---|---|
| 78/105 | 20,33° | 518,216 | 550,076 (41,7/0/41,7/0/41,7/0/55) | **+6,15 %** | 0 en las 7 | 0 en las 6 parejas |
| 70/265 | −39,66° | 856,035 | 867,118 | **+1,29 %** | 0 | 0 |
| 80/250 | −17,03° | 428,855 | 459,214 | **+7,08 %** | 0 | 0 |
| 72/95 | 33,23° | 772,762 | 769,227 | −0,46 % (gana la uniforme) | 0 | 0 |

**Por qué, con la geometría** (sol a 12°, az 105°): con la fila de detrás
**plana**, la de delante puede subir a 41,7°. Su borde alto queda en x = 5,111 m
y z = 0,793 m; con la pendiente de perfil del sol (tan 12,4° = 0,22) su sombra
baja 0,793 m en 3,6 m y cae en x = 1,51 m, y el borde de la fila plana está en
1,192 m: no la toca. La mitad de las filas coge el haz casi de frente, la otra
mitad lo coge plano, y el total supera al de todas a 20,33°.

## Lo que esto dice, y lo que NO

- Dice que, **en la métrica de la casa** (`poaPlant`: haz, circunsolar, cielo y
  suelo por fila, sin enmascarar la difusa por las filas vecinas), el máximo de
  energía sin sombra **no es uniforme** a sol bajo, ni en terreno uniforme.
- **No** dice que eso ocurra en campo: la métrica no descuenta la difusa que la
  fila empinada quita a la plana. Es una cota del modelo, no una medida.
- Y dice que la política **no puede degenerar a `pairwise`** si hace lo que el
  encargo le pide (máxima POA sujeta a sombra evitable cero): cuando la
  configuración no uniforme gana, la política la encuentra.

## Un segundo hallazgo del mismo banco

El ascenso coordinado **se queda en óptimos locales**: arrancando de 0° acaba en
una escalera (55/13,5 alternas a sol 72/95, −0,46 % frente a la uniforme). Por
eso el multiarranque no es opcional, y el ganador sale del arranque `pairwise`
en ese sol.

## Decisión que hace falta (del titular)

1. **Reescribir 2.6** para que controle lo que la política sí debe cumplir en
   terreno uniforme. Propuesta: nunca por debajo de `pairwise` (dentro de
   `E_EMPATE_W`), sombra evitable cero, y coincidencia con `pairwise`
   **restringida a un θ común** (el subespacio donde la uniforme es el óptimo).
2. **O restringir la política** —p. ej., a θ común por línea— para que degenere,
   sabiendo que entonces renuncia a la ganancia medida arriba.
3. Y aparte: si el +6-7 % a sol bajo es real en campo es una pregunta de medida
   (difusa enmascarada, `infinite_sheds`), no de modelo.

Estado de la rama `claude/r5-f2-conjunto-6th1im`: la política
(`audit5/lib_conjunto.mjs`), su banco (en rojo en 2.6, por lo de arriba) y esta
evidencia. **No hay PR de fase 2** hasta que se decida.


---

## 2.6 reescrito — decisión del titular (2026-09-24): opción 1

La premisa vieja queda refutada y no se fuerza. `audit5/test_conjunto.mjs`
(7/7 → `audit5/out/test_conjunto.txt`) controla lo que la política SÍ tiene que
cumplir en terreno uniforme (7 filas planas, paso 6, cuerda 2,384, cuatro soles
de 10-20°):

| comprobación | resultado | control negativo |
|---|---|---|
| **2.6a · nunca por debajo de `pairwise`** (POA ganador ≥ POA `pairwise` − `E_EMPATE_W`) | ganador − pairwise: 0,000 / +31,860 / +11,084 / +30,359 W/m² | una «política» que deja todo plano cae por debajo en 4 de 4 soles |
| **2.6b · sombra evitable cero** en el ganador | 0 mesas en los 4 soles | el ganador SIN la restricción, evaluado con ella, deja sombra evitable en 2 de 4 |
| **2.6c · restringida a un θ COMÚN, coincide con `pairwise`** (`optimoComun`, misma rejilla de 0,1° y misma restricción) | mismo θ en los 4 soles (33,2 / 20,3 / −39,6 / −17,0°) y POA dentro de `E_EMPATE_W` | sin la restricción, el θ común se aparta en 2 de 4 soles (hasta 38,0°) |

Lo que se compara en 2.6c es `pairwise` **en la misma rejilla** que la política
(puntos lo + k·0,1° del rango, el más cercano a la tangencia por el lado sin
sombra), no la tangencia exacta de pvlib: la diferencia entre las dos es menor
que un paso de mando (θ_bt 33,234° frente a 33,20°) y es de rejilla, no de
política. Declarado.

La comprobación vieja «la política no retrocede de más» desaparece: con filas
alternas es LEGÍTIMO que una fila quede plana, dentro de la tangencia. Su
contenido sobrevive en 2.6c (en θ común, el óptimo es la tangencia).

**El hallazgo de las filas alternas** (+6,15 % y +7,08 % a sol de 10-12°, sombra
cero) **sigue sin publicarse** hasta cerrar la difusa enmascarada, el mismatch y
el albedo (decisión del titular). El banco lo enseña con esa etiqueta.

Estado: **la fase 2 queda desbloqueada**.
