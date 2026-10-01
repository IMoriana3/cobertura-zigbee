# R4 · FASE 3 — LOS DOS LAZOS DE CONTROL

**Preparar la decisión, no tomarla.** Aquí no hay recomendación, y el código no
se toca: `crearLazo` vive dentro de FÍSICA PURA y moverlo cambiaría a la vez la
curva del día, el informe y el anual.

Sondas: `audit4/F3_lazos.mjs` (descomposición) y `audit4/F3_lazos_campo.mjs`
(careo contra el eje medido). Salidas crudas en `audit4/out/F3_lazos.json` y
`audit4/out/F3_lazos_campo.json`.

---

## 3.1 · Las dos implementaciones

| | **página** | **núcleo** |
|---|---|---|
| función | `crearLazo(deadband,rate,desde)` | `CTRLCORE.execTramo(prev,tPrev,tNow,dtMin,loop,…)` |
| fichero | `backtracking.html:3419` (**dentro** de FÍSICA PURA) | `js/control_core.js:171`, sobre `C.step` (`:94`) |
| canónicos | `DEADBAND_DEG=1.0` (`:3316`), `TRACKER_SLEW=0.17` (`:3299`) | `C.CANON={deadbandDeg:1.0, slewDegS:0.17, cicloSeg:1}` (`:51`) |
| estado | objeto con `prev` y, por fila, `{dir,park}` | devuelto y re-inyectado: `{theta,dir,park,dirUlt}` |

### El diff de la lógica

Las dos implementan **la misma ley**, y la enuncian casi con las mismas
palabras: el motor no arranca por debajo de la banda; el destino es la consigna
**más un margen** en el sentido de la marcha; el destino se **enclava** y no se
persigue; invertir pide **estrictamente** más que el margen; el sentido se
recuerda al parar. Lo que las separa son **tres asimetrías**, y solo una pesa:

1. **El troceo del tramo.** `execTramo` parte el paso en ciclos de `cicloSeg`
   (canónico **1 s**) y **rampa la consigna** dentro del tramo
   (`tPrev+(tNow−tPrev)·i/n`, `js/control_core.js:174-177`). `crearLazo.paso`
   da **un** paso con la consigna final. **Esta es la que explica todo.**
2. **El tope mecánico.** El núcleo recorta a `±loop.maxAngle` (`:160`); la
   página no lo hace dentro del lazo.
3. **El modo `seguro`.** El núcleo trae `btLimita` y la regla de no adelantar
   hacia el lado que sombrea (`:130-147`). La página resuelve lo mismo fuera
   del lazo, en `topeBacktracking` (`backtracking.html:3356`).

---

## 3.2 · Dónde difieren: instantes, magnitud, patrón

R3 midió **99 de 100 pasos, hasta 1,995833°**, con la rampa que sube, se
mantiene e invierte, a `dt` 10 min, banda 1,0° y slew 0,17 °/s. Esta fase
**descompone** esa cifra.

**Test nulo primero.** El lazo de la página contra sí mismo: `|Δ|` máx
**0,000e+0°**. Y el control que hace falta para poder leer un cero más abajo:
en la variante que sale a cero los dos lazos **recorren 107,500°** cada uno —
dos lazos congelados también darían `|Δ|=0`, y eso no sería acuerdo sino
parálisis.

| variante | pasos con Δ | \|Δ\| máx |
|---|---|---|
| **tal como corren hoy** | 99/100 | **1,995833°** |
| **ciclo = el tramo entero** (apaga troceo y rampa) | **0/100** | **0,000000°** |
| ciclo 60 s | 89/100 | 1,750000° |
| sin tope mecánico (`maxAngle` 1e9) | 99/100 | 1,995833° |
| banda muerta 0 en **los dos** | **0/100** | **0,000000°** |

**El troceo con la consigna rampada explica el 100,0 % de la diferencia.** Con
un solo ciclo por tramo los dos lazos coinciden **exactamente**, paso a paso,
en los cien. Con banda 0 también, porque sin banda no hay adelanto ni
enclavamiento y el troceo no tiene sobre qué morder.

**Patrón**: el peor paso es el **#63**, el de la inversión — consigna 37°,
página 36,0000°, núcleo 37,9958°. **Dos bandas muertas de separación**, que es
exactamente lo que la memoria de sentido decide. La diferencia **escala con el
número de ciclos**: 1,750° a 60 s, 1,996° a 1 s.

> **Esto cambia la pregunta.** R3 dejó «dos lazos que discrepan hasta 1,996° y
> alguien tiene que decidir cuál es el bueno». Medido: **no son dos leyes, es
> una ley muestreada a dos ritmos.** Lo que hay que decidir no es qué lazo,
> sino **a qué ritmo se simula el lazo**.

Un apunte de instrumento: la variante «banda muerta 0» salió primero a
**1,000°** porque la sonda le daba la banda al núcleo y **no a la página**, que
seguía con la suya. Se cazó leyendo el peor paso —la página daba −46,5 con una
consigna de −47,5, o sea con su banda puesta—. Corregido: la banda y el slew
van a los dos.

---

## 3.3 · Qué herramientas usa cada uno

| lazo | quién lo llama |
|---|---|
| **`crearLazo`** | `backtracking.html:5469` (el día, junto a `crearLazoSeg`), `:5553` (la referencia astronómica), `:7596` (**el anual**), `:7999` (el fotograma interpolado del careo). Y `tools/export_consignas.mjs:233` vía `crearLazoSeg` |
| **`CTRLCORE`** | `produccion.html:1476` y `:1484` (vía `execVector`), cargado en `:549`. Y `tools/anual_motor.mjs`, **indirectamente**: su motor es `tools/gen_golden_anual.mjs`, que carga `js/control_core.js` en `:67` y lo declara en `:219` |
| **bancos** | `tools/test_control_core.mjs` (núcleo), `tools/test_anual_lazo.mjs` y `tools/test_produccion_lazo.mjs` |

R3 escribió que `anual_motor.mjs` usa `execTramo`; es cierto, pero **por la
cadena de arriba**, no directamente — en el fichero no aparece la palabra
`CTRLCORE`. Se anota aquí y **no se edita `audit3/`**.

---

## 3.4 · Cuál se parece más a la TCU — **hay encoder, y el careo NO es concluyente**

**Lo que la TCU dice de sí misma.** La banda muerta vive en el registro
**41061** (`tools/modbus_src/tcu_v6.json:3039`), 45 pulsos por defecto; la
constante pulsos/grado es del accionamiento y **no vive en este repo**, así que
1,0° es el canónico de la casa, no una lectura. El **periodo de cálculo** de la
TCU no está publicado en el mapa Modbus: que calcula **cada segundo** es
autoridad de campo (Iñaki, recogido en `js/control_core.js:32-45`). Es el único
apoyo que tiene el `cicloSeg:1` del núcleo, y por tanto el único apoyo del
100 % de la diferencia de 3.2.

**Y hay encoder.** `tools/fixture_ncu12/TCU_00*.csv` trae, del 2026-08-07 y
seis TCU, la consigna (`target_angle`) **y la posición medida** (`angle`). Así
que se puede carear cada lazo contra el eje de verdad.

**Lo que se tira, contado:**

| | |
|---|---|
| filas en los ficheros | 3.326 |
| descartadas por corrupción | **6** (1.693 bytes NUL; **una línea por fichero**, siempre hacia el mismo punto del día — parece un corte del registrador, no del eje) |
| excluidas: OFF o posición de seguridad | **1.095** (ninguno de los dos lazos modela eso) |
| **pasos careados** | **2.213** en 6 tramos |

**Los controles, antes del resultado:**

| control | RMS | máx |
|---|---|---|
| un «lazo» que NO se mueve (θ = la semilla) | 65,5755° | 110,3000° |
| **la consigna CRUDA, sin lazo ninguno** | **0,4867°** | **1,6000°** |

**El careo:**

| lazo | RMS | mediana | máx |
|---|---|---|---|
| página (`crearLazo`) | 0,9215° | 0,8000° | 2,6000° |
| núcleo (`execTramo`, 1 s) | **0,6847°** | **0,3900°** | 2,4150° |

**Y aquí el control manda sobre el titular.** La consigna cruda —**sin lazo
ninguno**— se aparta del eje medido **menos que los dos lazos**: 0,4867° contra
0,6847° y 0,9215°. Partido por el hueco entre muestras (mediana 10 s; 411 pasos
por encima de 15 s) el orden **no cambia** en ninguna de las dos poblaciones.

> **Por tanto este careo NO adjudica 3.4.** Con estos datos, un predictor
> trivial gana a los dos modelos, así que la métrica no separa «modela bien la
> TCU» de «no modela nada». Lo único que sí dice, y con denominador: **el
> núcleo queda más cerca del eje medido que la página en 6 de 6 TCU**
> (RMS 0,6253°–0,7253° contra 0,7920°–1,0326°).

**Límites, pegados a la cifra:** UN día, UNA planta, SEIS TCU; muestreo
irregular; y la TCU adelanta a la consigna —se ve en el dato: hay `|angle|`
hasta 56,5° con el tope de consigna en 55,0°—, que es justo la ley que los dos
lazos dicen implementar.

---

## 3.5 · Efecto en la energía anual de cada política con uno y con otro

`audit4/F3_anual_lazos.mjs` → `audit4/out/F3_anual_lazos.json`. Réplica del
bucle anual de la página (`backtracking.html:7596`: `policyAngles` por línea →
lazo → `poaPlant`) con **las dos cadenas de lazo en la misma pasada** sobre el
**mismo mando**: misma geometría, mismos instantes, mismo cielo, mismo
`poaPlant`. La diferencia no puede venir de otra cosa.

**La geometría NO es Ayora**, y se dice: 12 líneas, cuesta E-O 6°, eje N-S
horizontal, Zaragoza, paso 10 min, **12 de 12 meses**. Con las 107 líneas de la
planta real un solo mes no cierra en 23 minutos (medido en 1.6), y 3.5 pregunta
por la **diferencia** entre dos lazos, no por la cifra absoluta de una planta.

**Test nulo**: `|Δθ|` máx entre las dos cadenas **1,999973°** en algún paso —si
las dos cadenas fueran la misma saldrían totales idénticos y parecería acuerdo.

| política | lazo página | lazo núcleo | Δ | **Δ %** | (control) sin lazo |
|---|---|---|---|---|---|
| `astro` | 2 562,810807 | 2 563,258835 | +0,448028 | **+0,017482 %** | 2 563,195042 |
| `global` | 2 594,365556 | 2 570,983588 | −23,381968 | **−0,901260 %** | 2 634,900790 |
| `row` | 2 594,365556 | 2 570,983588 | −23,381968 | **−0,901260 %** | 2 634,900790 |
| `bt2d` | 2 541,664603 | 2 539,229158 | −2,435445 | **−0,095821 %** | 2 538,626834 |
| `pairwise` | 2 594,376169 | 2 570,992134 | −23,384035 | **−0,901336 %** | 2 634,909852 |
| `true3d` | 2 594,376169 | 2 570,992134 | −23,384035 | **−0,901336 %** | 2 634,909852 |
| `mgl` | 2 594,823807 | 2 564,620445 | −30,203362 | **−1,163985 %** | 2 559,274078 |
| `optimal` | 2 603,018969 | 2 594,615548 | −8,403422 | **−0,322834 %** | 2 641,506460 |
| `optfree` | 2 606,121587 | 2 598,879451 | −7,242136 | **−0,277889 %** | 2 643,987515 |

kWh/m² de planta. Denominador: 12 líneas × 12 meses × 144 pasos/día.

**El lazo del núcleo produce MENOS en 8 de 9 políticas**, entre −0,096 % y
−1,164 %. La única que gana es `astro`, y por +0,017 %. El orden entre políticas
**no cambia** con el lazo.

`global`=`row` y `pairwise`=`true3d` al dígito: en una cuesta **uniforme** con
eje horizontal el terreno local de cada fila es la media de la planta y la
bisección 3D no tiene tilt N-S sobre el que apartarse. Es lo que tiene que
pasar, no un fallo del instrumento — y es también por qué el test nulo dice
«7 de 9 totales distintos» y no nueve.

### Y un tercer número que el control destapa

La columna «sin lazo» es el mando crudo, sin banda muerta ni slew. **El lazo
cuesta energía**, y bastante más que la diferencia entre los dos lazos:

| política | página vs sin lazo | núcleo vs sin lazo |
|---|---|---|
| `pairwise` | **−1,5383 %** | **−2,4258 %** |
| `optimal` | −1,4570 % | −1,7752 % |
| `optfree` | −1,4322 % | −1,7061 % |
| `astro` | −0,0150 % | +0,0025 % |

**Esto no se puede leer contra la cifra que `backtracking.html:3313` publica**
—«deadband 1,0°: POA 334.029 contra 333.984 con 0,0°; no cuesta energía»—
porque las dos medidas **no son comparables**: aquella va a paso de control de
5 min sobre un día y tres terrenos, ésta a 10 min sobre doce meses y una
cuesta. Cuál de las dos condiciones es la de la planta **NO ESTÁ MEDIDO**, y
atribuir la diferencia a una causa sin medirlo es exactamente el error que esta
auditoría lleva dos fases corrigiendo. Queda **abierto**.

### Nota de base

Estas cifras se tomaron dos veces, sobre `521910c` y sobre `01bec48` —con el
#727 de por medio— y salieron **idénticas byte a byte**. Las de 3.2 y 3.4,
también.

---

## LAS DOS OPCIONES, CON SU EVIDENCIA Y SU COSTE

Ninguna se recomienda.

### Opción A · Un solo lazo, el del núcleo, troceado a 1 s

**A favor.** Es la ley que el campo respalda (la TCU calcula cada segundo). Es
el que está más cerca del eje medido en 6 de 6 TCU. Deja **una** implementación
en la casa, con **un** banco.

**En contra.** `crearLazo` está **dentro de FÍSICA PURA**: cambiarlo mueve a la
vez la curva del día, el informe y el anual, y todas las cifras publicadas de
esta página con ellas. Y el coste de cómputo no es menor: a paso de 10 min,
trocear a 1 s son **600 ciclos por paso y política** donde hoy hay uno.

**Coste: NO MEDIDO en tiempo** —el factor de cómputo, ×600 por paso en el
anual, es un hecho aritmético del troceo, no una medida de tiempo, y medirlo
pide la máquina libre—. **En energía sí está medido**: adoptar el lazo del
núcleo baja la cifra anual entre **0,096 % y 1,164 %** según la política (3.5),
y eso son todas las cifras anuales publicadas de esta página moviéndose a la
vez.

### Opción B · Dejar los dos y declarar qué mide cada uno

**A favor.** No toca FÍSICA PURA ni mueve ninguna cifra publicada. Y tiene un
apoyo que antes no existía: **medido, son la misma ley** — con un ciclo por
tramo coinciden en los 100 pasos, exactamente. La diferencia es de
**resolución de simulación**, y una página que dibuja un día a paso de 10 min y
un motor que integra un año no tienen por qué usar la misma.

**En contra.** Deja dos números distintos para la misma pregunta en la misma
casa: hasta 1,996° aparte en el peor paso y, en la cifra que se publica, hasta
**1,164 % de energía anual** según la política (3.5). Y nada impide que vuelvan
a divergir de verdad: hoy coinciden **porque** la ley es la misma, y no hay
ningún banco que vigile que lo siga siendo.

**Coste: NO MEDIDO.** Lo que sí es medible y no está hecho: un banco que
compare los dos lazos con `cicloSeg` igualado y falle si dejan de coincidir
**exactamente**. Esa comprobación existe hoy como sonda
(`audit4/F3_lazos.mjs`), no como banco de CI.

---

**SIN RECOMENDACIÓN.** La fase 3 termina aquí.
