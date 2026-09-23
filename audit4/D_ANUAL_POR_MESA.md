# ¿Cuánto se aparta el anual publicado de la rama que la fase 1 arregló?

**Acota, no arregla.** Sonda: `audit4/D_anual_por_mesa.mjs` →
`audit4/out/D_anual_por_mesa.json`.

---

## Por qué hacía falta esta cifra

**1.6 cerró con CERO**: el arreglo del veto de `optimal` no mueve la cifra
anual. Verificado en la fuente — el bucle de `yearbtn`
(`backtracking.html:7602-7605`) llama a `policyAngles(...,Tcfg,...)` y a
`poaPlant(...)`, **las dos de línea**, mientras el cuerpo del día pasa por
`segCmd` y `poaPlantSeg`, **por mesa**.

O sea que **la cifra que la página publica como anual no lleva dentro el
arreglo de la fase 1**, y el día y el anual publican por caminos distintos en
la misma pantalla.

Proponer «llevar el anual por la rama por mesa» sin una cifra sería una
propuesta sin tamaño. Esto mide el tamaño.

---

## Cómo se mide

Las **dos cadenas completas** —línea y mesa, de punta a punta— corren en la
**misma pasada** sobre la **misma geometría** y los **mismos instantes**:

| | rama publicada (línea) | rama del día (mesa) |
|---|---|---|
| ángulo | `policyAngles` | `policyAnglesSeg` |
| lazo | `crearLazo` | `crearLazoSeg` |
| energía | `poaPlant` | `poaPlantSeg` |

La diferencia no puede venir de otra cosa.

**Geometría SINTÉTICA, no Ayora, y se dice**: 8 líneas × 4 mesas = 64 mesas,
cuesta E-O 6°, **torsión por mesa de ±3° generada con la rótula real**
(`rotulaMesas`, la misma función que usa la página), Zaragoza, paso 10 min,
**12 de 12 meses**.

**Solo las cuatro políticas de `POL_POR_MESA`** (`pairwise`, `astro`,
`optimal`, `optfree`). Para las otras cinco `segCmd` reparte la respuesta de
línea entre las mesas, y «por mesa» no significaría lo mismo; la sonda **falla**
si se le piden.

**Test nulo doble, antes del recuento:** que la segmentación esté activa de
verdad (`segOn`), y que **haya** torsión por mesa — sin ella las dos ramas
coinciden por construcción y el cero sería trivial. Medido: **64 mesas,
torsión máxima 3,0000°** respecto a su línea.

---

## El resultado

| política | **por línea** (lo publicado) | **por mesa** | Δ | **Δ %** | **\|Δθ\| máx** |
|---|---|---|---|---|---|
| `pairwise` | 2 539,691551 | 2 549,645251 | +9,953700 | **+0,3919 %** | **10,5385°** |
| `astro` | 2 530,593085 | 2 528,414088 | −2,178998 | **−0,0861 %** | 4,7868° |
| `optimal` | 2 559,140399 | 2 569,832665 | +10,692266 | **+0,4178 %** | **46,9708°** |
| `optfree` | 2 562,270842 | 2 571,103335 | +8,832493 | **+0,3447 %** | **57,0304°** |

kWh/m² de planta, 12 de 12 meses.

### Las dos mitades dicen cosas distintas, y hay que leerlas juntas

**En ENERGÍA el hueco es modesto: 0,34-0,42 %.** La ruta publicada se queda
por **debajo** de la arreglada en las tres políticas con backtracking.

**En ÁNGULO el hueco es enorme: hasta 57,03°.** La consigna que sale por una
rama y la que sale por la otra difieren, en el peor paso, en más de la mitad
del recorrido del tracker.

> **La energía promedia; la consigna no.** Un 0,4 % anual puede parecer
> despreciable y convivir con consignas que se apartan 57° en instantes
> concretos. Lo que se manda al campo es la consigna.

### `astro` va al revés, y tiene sentido

Es la única con Δ negativo (−0,0861 %). No lleva backtracking: la rama por mesa
simplemente apunta cada mesa con su propio tilt, y promediarlas a línea pierde
un poco. Sirve de control de que el signo del resto no es un artefacto.

### Un mes no valía

La primera medida de esta sonda, con **un solo mes** (junio) y solo `pairwise`,
dio **+0,8122 %**. Sobre los doce meses sale **+0,3919 %**: **el mes era más
del doble del año.** Se anota porque la cifra parcial llegó a publicarse como
avance, y un mes representativo no lo es.

---

## Lo que esta cifra NO es

- **No es el efecto del arreglo de la fase 1.** Es el tamaño del hueco **entre
  las dos rutas**, que es otra cosa: el arreglo vive dentro de la rama por
  mesa, y la cuestión es que el anual no pasa por ahí.
- **No es Ayora.** Es una geometría sintética con torsión de rótula. Con las
  107 líneas y 1.600 mesas de la planta real la corrida no cabe en el plazo de
  una sonda: **NO MEDIDO**, y no se extrapola.
- **No es una recomendación.** Cuánto vale cerrar ese hueco, y si merece el
  coste de llevar el anual por la rama por mesa, es decisión del titular.
