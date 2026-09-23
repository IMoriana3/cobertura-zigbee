# R4 · FASE 5 — CAMPO: DE VERIFICADO A VALIDADO, SIN CAMPAÑA

**Solo con datos que ya se registran.** Lo que no está a mi alcance sale como
`NO DISPONIBLE`, con qué haría falta y a quién pedirlo. **No se inventa ninguna
ruta.**

Sonda: `audit4/F5_campo.mjs` → `audit4/out/F5_campo.json`.

**La fuente, y es una sola.** `tools/fixture_ncu12/` — 2026-08-07, seis TCU,
con consigna (`target_angle`) **y** posición medida (`angle`) en la misma fila.
Es lo **único** que este repo registra con las dos cosas a la vez. Todo lo
demás de abajo se apoya en eso o no se apoya en nada.

| ítem | grado |
|---|---|
| 5.1 exactitud de seguimiento | **solo acotado** |
| 5.2 pérdida por sombra medida | **NO DISPONIBLE** |
| 5.3 `nb` medido | **NO DISPONIBLE** |
| 5.4 eventos de alto contraste | **solo acotado** |
| 5.5 el CSV de 3.798 puntos de El Burgo | **NO DISPONIBLE** (con pista aritmética) |

---

## 5.1 · Exactitud de seguimiento — **solo acotado**

`error = angle − target_angle`, **con signo**, que es la misma definición de
`tracking_error` (`solargpt_core/plant_feedback.py:179`, allí
`tilt_angle − target_angle`) y con **sus mismas exclusiones**: fuera lo que no
está siguiendo por decisión propia, y la alarma aparte porque es otra
conversación.

**El denominador, entero:** 3.320 filas · 6 corruptas · 879 no-AUTO · 216 en
posición de seguridad · 0 en alarma → **2.219 utilizables**.

| TCU | n | MAE | RMSE | P95 | máx | sesgo |
|---|---|---|---|---|---|---|
| 001 | 371 | 0,4038° | 0,4694° | 0,8000° | 1,5000° | −0,2162° |
| 002 | 370 | 0,4819° | 0,5501° | 0,8000° | 1,4000° | −0,2949° |
| 003 | 371 | 0,3884° | 0,4641° | 0,9000° | 1,1000° | −0,1631° |
| 004 | 371 | 0,2989° | 0,4485° | 1,1000° | 1,3000° | −0,0822° |
| 005 | 370 | 0,4176° | 0,5363° | 1,0000° | 1,6000° | −0,1646° |
| 006 | 366 | 0,3077° | 0,4360° | 0,9000° | 1,6000° | −0,1765° |
| **FLOTA** | **2.219** | **0,3831°** | **0,4861°** | **0,9000°** | **1,6000°** | **−0,1829°** |

**Control de la exclusión**, y no es decorativo: las 216 filas apartadas por
posición de seguridad dan **MAE 6,5241° y máx 95,9000°**, frente a los 0,3831°
de las que quedan. Si salieran parecidas, la exclusión no estaría excluyendo
nada y el P95 estaría contaminado.

**Dos cosas que la cifra dice sola.** El máximo de flota, **1,6000°**, cabe
justo en banda muerta (1,0°) más adelanto (1,0°): el eje se comporta como la ley
que los dos lazos de la fase 3 dicen implementar. Y el **sesgo es negativo en
las seis TCU** (−0,08° a −0,29°): el eje se queda sistemáticamente de un lado.
Eso puede ser holgura mecánica o retardo del lazo —el signo distingue las dos,
dice `plant_feedback.py`—, pero con un solo día **no se separa**, y no se
atribuye.

**Por qué solo acotado, y no VALIDADO.** El encoder mide el **accionamiento**,
no la mesa: con rótula o con bifila rota la mesa puede estar en otro ángulo y
esto no lo ve — que es, exactamente, la geometría por mesa que la fase 4
descubrió que el motor Python ni siquiera puede expresar. Y es **un día de una
planta**. Lo que hay es una **cota superior medida** del error de seguimiento
del accionamiento, no una validación del seguimiento de la mesa.

**Qué haría falta para subirlo a VALIDADO:** inclinómetro en la mesa (no en el
tubo) en una muestra de trackers, o al menos historiales de varios días y
varias plantas. **A quién pedirlo:** a Factiun, de la NCU — los datos se
registran, lo que falta es la descarga.

---

## 5.2 · Pérdida por sombra medida — **NO DISPONIBLE**

Pide el cociente de corriente de string interior/borde en la rampa de
backtracking. **No hay corriente por string en ningún dato registrado de este
repo**, y eso está **medido, no supuesto**: barrido de 257 ficheros de dato con
ocho patrones (`string_current`, `i_string`, `idc_`…), **cero aciertos**, y con
su control — `motor_current` sí aparece, en 7 ficheros, así que el barrido no
está ciego.

> El barrido salió mal dos veces antes de decir esto, y las dos las cazó su
> propio control: primero miró **cero** ficheros (un `return` donde iba un
> `continue`) y publicó «ningún patrón» como si fuera una medida; después se
> encontró **a sí mismo**, porque su JSON de salida guarda la lista de patrones
> que busca. Van a E-X1 29 y 30.

**Qué haría falta:** telemetría de string del inversor (o de las cajas) con
sello de tiempo, a resolución de minutos, del mismo día y planta que la
telemetría de TCU. **A quién pedirlo:** al SCADA del inversor — no pasa por la
NCU, así que no llega por la ruta que ya existe.

Lo que sí hay y no sustituye a eso: `elburgo_strings.json` (823 strings) dice
**cómo está cableada** la planta, no cuánta corriente da cada string.

---

## 5.3 · `nb` medido — **NO DISPONIBLE**

Misma causa que 5.2: los escalones de corriente cuando la sombra cruza cada
subcadena **necesitan la corriente**. Sin ella, un `nb` «medido» sería
inventado, y el banco `tools/test_nb_procedencia.mjs` existe precisamente para
que `nb` vaya siempre con su procedencia declarada.

**Qué haría falta:** lo mismo que 5.2, más la ficha del módulo de la planta
—número de diodos de bypass— para tener contra qué comparar.

---

## 5.4 · Eventos de alto contraste — **solo acotado**

**24 transiciones** en los seis ficheros: 6 cambios de `main_state` y 18 de
posición de seguridad. Cero transiciones de alarma en el día. Más el registro
de la NCU, `NCU_EVENT_LOG_2026-08-07.csv`, **208 líneas**.

Los primeros de cada tipo, con el ángulo y la consigna del instante:

| tipo | cuándo | TCU | transición | θ (consigna) |
|---|---|---|---|---|
| cambio de `main_state` | 2026-08-07T06:30:03Z | 001 | OFF → AUTO | 54,5 (55) |
| posición de seguridad | 2026-08-07T06:30:03Z | 001 | 0 → 7 | 54,5 (55) |

La lista completa va en `audit4/out/F5_campo.json`.

**Por qué solo acotado.** Los eventos existen y están fechados, pero un ensayo
de alto contraste necesita **algo que contrastar**: la señal que debería cambiar
cuando un tracker se aparca es la corriente de los strings de sus vecinos, y esa
es justo la que no existe (5.2). Sin ella, la lista es un inventario, no un
ensayo.

**Nota**: **cero** eventos de encoder inválido junto a vecinos correctos en este
día — que era el caso de más contraste de los que 5.4 pedía. Cero no es señal
de que no ocurran: es un día.

---

## 5.5 · El CSV de 3.798 puntos de El Burgo — **NO DISPONIBLE, con una pista**

**No está en este repo.** Barridos los ficheros de El Burgo, ninguno lleva ese
recuento:

| fichero | contenido |
|---|---|
| `elburgo_layout.json` | **215 trackers**, y `tcuSinMesa` con **4** |
| `elburgo_tcu.json` | 219 TCU con coordenada |
| `elburgo_strings.json` | 823 strings |
| `elburgo_activo.geojson` / `elburgo_real.geojson` | 229 / 105 elementos |
| `diagnostico_elburgo.geojson` | 674 elementos |
| `coords_ElBurgo_NCU1.csv` | 108 TCU |

Y **no hay `elburgo_cotas.json`**: de las tres plantas con cotas medidas en el
repo (`ayora_cotas.json`, `sanjose_cotas.json`), El Burgo **no es una**.

**La pista aritmética, que es lo único que puedo aportar sin inventar rutas:**

```
trackers (215) − tcuSinMesa (4) = 211
211 × 18 = 3.798        ← exacto
```

El número cuadra con **18 puntos por tracker con mesa**. Una lectura posible
—y **solo una hipótesis**, no un hecho— es 2 líneas × 4 mesas × 2 extremos = 16,
más los 2 extremos del propio tracker. Quien vaya a buscar el fichero tiene ahí
un criterio para reconocerlo: **211 grupos de 18**, no 3.798 puntos sueltos.

**Qué haría falta:** el CSV tal cual se entregó. **A quién pedirlo:** a
Factiun, que es quien lo entregó según el informe del proveedor de control; en
segundo lugar, al propio proveedor, que lo declara recibido en ese informe.
**No se reconstruye**: unas cotas reconstruidas a partir del layout serían el
plano, no la medida, y esta auditoría ya tiene un `ye` en `sanjose_cotas.json`
que existe justamente para no confundir las dos.

---

## LO QUE LA FASE 5 DEJA

**Un número nuevo y validado dentro de su alcance:** el error de seguimiento del
accionamiento en El Burgo/NCU12, 2026-08-07, **MAE 0,3831° · RMSE 0,4861° ·
P95 0,9000° · máx 1,6000°** sobre 2.219 muestras utilizables de 3.320.

**Y tres cosas que no se pueden cerrar desde aquí**, las tres por la misma
causa —no hay corriente por string en la ruta que ya existe—: la pérdida por
sombra medida, el `nb` medido, y los eventos como ensayo. La ruta que falta no
pasa por la NCU, así que **no es una descarga más: es una fuente nueva**.
