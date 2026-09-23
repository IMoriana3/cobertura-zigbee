# Revisión externa: cómo se calcula la posición de cada seguidor en función del terreno

> **Para pegar tal cual a un revisor externo (Claude, ChatGPT u otro).** Es
> autocontenido: no hace falta el repositorio. Todas las cifras que aparecen
> están **medidas**, y se dice con qué.

---

## Qué se pide

Revisar el **convenio de signos y la geometría** con que calculamos el ángulo
de cada seguidor a partir del terreno, en los tres modelos de backtracking que
convivimos. Concretamente: si las conversiones entre marcos son correctas, si
falta alguna, y si sobra alguna.

**No** se pide opinión sobre qué política es mejor, ni sobre rendimiento.

---

## 0 · De dónde sale este documento

Existe un informe previo, más estrecho, que audita **solo el signo de la
pendiente transversal en el modelo C** y cuya corrección ya está en producción.
Este documento lo **incluye** (§5.3 y §6 bis reproducen sus datos y su tabla de
efecto) y añade lo que aquel no cubría:

* los **otros dos modelos** de backtracking, que no usan los vectores del
  as-built sino las cotas medidas (§5.1 y §5.2);
* la **asimetría de las dos conversiones** hacia pvlib —una se convierte y la
  otra no— con la evidencia de por qué (§3);
* una **reserva sobre la premisa** de aquel informe: enunciaba «βc > 0 si la
  línea sube hacia el este» como convenio de pvlib sin condicionarlo al azimut
  del eje, y **el signo de `cross_axis_tilt` en pvlib depende de ese azimut**
  (§3.3). No invalida su conclusión —este código fija su propio marco con
  `R = −atan2(E, y)`, donde R<0 = este, igual que el ejemplo de pvlib con azimut
  180—, pero la pregunta, tal como estaba redactada, admite un «no» de un
  revisor que piense en azimut 0;
* la comprobación de que **la descomposición (transversal, longitudinal) no
  pierde el azimut de la pendiente**, con su control negativo (§4).

Las cifras del §5.3 difieren de las del informe previo (allí 0,27/2,60 y
0,11/3,00 pp sobre 482 seguidores; aquí 0,804/3,535 y 0,839/4,147 sobre ~680
parejas) porque el emparejamiento de vecinos es distinto: allí por seguidor,
aquí exigiendo solape en norte > 20 m y hueco en x entre 3 y 9 m. **La
dirección y el orden de magnitud coinciden**, que es lo que sostiene la
conclusión; los valores exactos, no, y se dice.

---

## 1 · La máquina

Seguidores de **un eje horizontal norte-sur**, dos filas por seguidor
(«bifila»: un motor mueve las dos). Planta de referencia, **Ayora**:

| | |
|---|---|
| seguidores | 751 |
| pitch (separación entre ejes) | 6,002 m |
| cuerda (anchura del colector) | 2,384 m |
| GCR | 0,3972 |
| θ máximo | ±55° |
| azimut del eje | **0° declarado** (ver §6) |

El terreno **no es plano**: cada pareja de filas tiene su propia pendiente
transversal y cada fila su propia inclinación longitudinal, medidas en el
levantamiento.

---

## 2 · Las entradas de terreno, y de dónde salen

El terreno entra como **dos números por pareja de filas** más **uno por fila**
(y, en la rama fina, uno por *mesa* — cada fila se divide en 2 o 4 mesas):

### 2.1 · Pendiente transversal, `slope` (una por pareja)

```
dz_i    = cota media de la línea i  −  cota media de la línea i+1
          medida SOLO sobre el solape en norte de las dos, ponderada por
          la longitud de ese solape
dx_i    = x(línea i+1) − x(línea i)          (x creciente hacia el ESTE)
slope_i = atan2(dz_i, dx_i)                  [grados]
pitch_i = dx_i                               (pitch REAL por vano, no uniforme)
```

**Convenio:** `slope > 0` ⟺ la fila del **este** está **más baja** ⟺ el
terreno **sube hacia el oeste**.

Las líneas sin solape en norte reciben `dz = 0`: no interactúan.

### 2.2 · Inclinación longitudinal, `axisTilt` / `rowTilt` / `segTilt`

```
rowTilt_r  = atan2(Δcota, Δnorte) de la fila r, ponderado por longitud
segTilt_rk = atan2(z_norte − z_sur, n_norte − n_sur) de la mesa k de la fila r
axisTilt_i = ( rowTilt_i + rowTilt_{i+1} ) / 2        ← la pareja toma la MEDIA
```

**Convenio de la casa:** el tilt es **positivo cuando el extremo que apunta al
azimut del eje (el norte, con azimut 0) está MÁS ALTO.**

---

## 3 · El punto crítico: los dos marcos y las dos conversiones

Usamos `pvlib.tracking.singleaxis` (Anderson & Mikofski 2020) como núcleo del
backtracking. **pvlib define los signos al revés que nosotros en uno de los dos
parámetros, y no en el otro.** Así queda hoy:

| cantidad | convenio de la casa | ¿se convierte al llamar a pvlib? |
|---|---|---|
| inclinación longitudinal del eje | +: el extremo **norte** más alto | **SÍ**: se pasa `axis_tilt = −τ` |
| pendiente transversal | +: la fila del **este** más baja | **NO**: se pasa `cross_axis_tilt = slope` tal cual |

**Por qué son distintas.** pvlib define `axis_tilt` como *«inclina el eje HACIA
ABAJO en la dirección de `axis_azimuth`»* — o sea el contrario del nuestro. Y
define `cross_axis_tilt` por una regla dextrógira alrededor del eje que, **con
azimut de eje 0**, resulta coincidir con el nuestro.

### 3.1 · Evidencia de que la conversión del tilt hace falta

Sin ella, la política calculaba el backtracking para el **terreno espejo**: con
tilt +5° y sol del noreste decidía como si la fila vecina estuviese más baja
cuando estaba más alta, y **una planta llana de este a oeste amanecía con un
64 % de sombra real** que el contador 3D sí veía. Con −5° salía bien por
casualidad.

### 3.2 · Evidencia de que la pendiente transversal NO hay que convertirla

Careo del `singleaxis` de pvlib contra un **trazado de rayos 3D independiente**
(bisección sobre la geometría exacta de los dos paneles), eje horizontal,
GCR 0,397, sol a 80° de cenit:

| `slope` | mañana (sol al este) | | tarde (sol al oeste) | |
|---|---|---|---|---|
| | trazado 3D | pvlib | trazado 3D | pvlib |
| −6° | 0,235° | 0,235° | 34,367° | 34,367° |
| −3° | 7,963° | 7,963° | 24,644° | 24,644° |
| 0° | 16,004° | 16,004° | 16,004° | 16,004° |
| +3° | 24,644° | 24,644° | 7,963° | 7,963° |
| +6° | 34,367° | 34,367° | 0,235° | 0,235° |

Coinciden al dígito, y el sentido es el físico: con `slope > 0` (el este más
bajo) por la mañana el vecino del este estorba menos y se puede seguir más;
por la tarde el vecino del oeste está más alto y hay que recortar casi todo.

### 3.3 · El aviso que hay que revisar

**El signo de `cross_axis_tilt` en pvlib depende del azimut del eje.** Medido
con la propia `pvlib.tracking.calc_cross_axis_tilt`, para la **misma** pendiente
física de 5°:

| `axis_azimuth` | terreno que sube al ESTE | que sube al OESTE |
|---|---|---|
| **0** | **−5,0000°** | **+5,0000°** |
| 180 | +5,0000° | −5,0000° |

Nuestro `slope` se define en el marco del **levantamiento** (x creciente al
este), **no** en el marco del eje. Con azimut 0 coinciden. **Con azimut 180 —o
cualquier otro— dejarían de coincidir, y nadie convierte nada.**

---

## 4 · Cómo se comprueba que el terreno está completo

Un plano inclinado tiene **dos grados de libertad** (su vector gradiente). Los
damos como (`slope`, `axisTilt`) en vez de (magnitud, azimut). **Si la
descomposición es correcta, no se pierde el azimut de la pendiente.**

Comprobado: para un plano de magnitud *S* y azimut *φ* **medido desde el eje**,
se calculan las dos componentes y se compara el ángulo sin sombra que da
nuestro trazado 3D contra una cuenta 3D **independiente** (otro método, por
muestreo del borde emisor). Sol a 80° de cenit, pitch 6 m, cuerda 2,382 m:

| *S* | *φ* | `slope` | `axisTilt` | nuestro | independiente |
|---|---|---|---|---|---|
| 10° | 0° | 10,0000° | 0,0000° | 51,1703° | 51,1703° |
| 10° | 30° | 8,6822° | −5,0384° | 43,2422° | 43,2422° |
| 10° | 45° | 7,1071° | −7,1071° | 36,4586° | 36,4586° |
| 10° | 60° | 5,0384° | −8,6822° | 29,0509° | 29,0509° |
| 10° | 90° | 0,0000° | −10,0000° | 14,2764° | 14,2764° |

Peor diferencia en 84 casos (3 magnitudes × 7 azimutes × 4 soles): **7,5·10⁻¹⁰°**.

**Control negativo**, imprescindible para que ese cero signifique algo: un
modelo que **ignorase** el azimut (metiendo la magnitud entera como pendiente
transversal y 0 de tilt) se aparta **hasta 38,5113°**. O sea que el careo
distingue perfectamente entre tener y no tener el azimut.

**Y el azimut importa mucho**: con *S* = 10°, pasar de *φ* = 0° a *φ* = 90°
mueve el ángulo sin sombra de **51,17° a 14,28°** — 37 grados.

---

## 5 · Los tres modelos, y qué hace cada uno

### 5.1 · Modelo A — por pareja, 2.5D (`pairwise`, el canónico)

Para cada pareja *i*, con sus propios `slope_i`, `pitch_i`, `axisTilt_i`:

```
θ_i = singleaxis(zen, az,
                 axis_tilt       = −axisTilt_i,      ← convertido
                 axis_azimuth    = axisAz,
                 max_angle       = 55,
                 backtrack       = true,
                 gcr             = cuerda / pitch_i,
                 cross_axis_tilt = slope_i)          ← sin convertir
```

Luego, **fila interior = la más backtrackeada de sus dos parejas**:

```
sg = signo del lado del sol
θ_r = min sobre sus dos parejas de (sg · θ), NO min|θ|
```

(con torsión un candidato puede haber cruzado el cero: −5° backtrackea más que
+3°, y `min|θ|` lo habría descartado).

### 5.2 · Modelo B — trazado 3D por pareja (`true3d`)

No usa la fórmula cerrada: **biseca sobre el trazado de rayos**. Marco:

```
eje          a  = (0, cos τ, sin τ)        y = norte, z = arriba, τ = axisTilt
fila vecina  C  = (pitch, 0, −pitch·tan(slope))
sol          s  = (sin Z·sin ΔA, sin Z·cos ΔA, cos Z)    ΔA = az − axisAz
cuerda       cd = (cos θ, sin θ·sin τ, −sin θ·cos τ)
```

Condición: la **arista más alta** del panel del lado del sol no debe proyectar
su sombra dentro del panel receptor. Se biseca `|θ|` hasta el máximo que no
sombrea. Es la implementación que se ha careado en §4.

**Nota:** aquí `τ` entra **sin convertir** — este trazado usa el convenio de la
casa, no el de pvlib.

### 5.3 · Modelo C — el visor de afección, Anderson & Mikofski a pelo

Trabaja con los **vectores de pendiente del as-built** (`cse`, `cso`, `ase`,
`aso` en %, y `sl` la longitudinal), no con las cotas:

```
b   = atan(pendiente longitudinal)           + = el tubo sube al norte
y   = U·cos b − N·sin b                      componentes del sol en el marco del tubo
R   = −atan2(E, y)                           R < 0 = mirando al ESTE (mañana)

sx  = (sol al este) ? cse : cso              ← la pendiente del lado que sombrea
bc  = atan(sx / 100)
dist= 1 / (GCR · cos bc)
temp= min( dist · cos(R − bc), 1 )
R_bt= R − signo(R) · acos(temp)
```

**Aquí hubo un defecto, ya corregido y en producción** (mergeado hoy), y es
parte de lo que se somete a revisión: se pide confirmar que la corrección es la
buena, no encontrarla. Medido sobre las cotas de Ayora, emparejando vecinos por
solape en norte (n ≈ 680 parejas), mediana de |as-built − pendiente medida entre
ejes|:

| | tal cual | con el signo cambiado |
|---|---|---|
| `cse` | **0,804 pp** | 3,535 pp |
| `cso` | **0,839 pp** | 4,147 pp |

O sea: **`cse` > 0 cuando el vecino ESTE está más alto, y `cso` > 0 cuando el
vecino OESTE está más alto.** Cada campo apunta hacia **su propio** vecino: son
referencias de signo **opuestas**.

Y la fórmula responde así (GCR 0,397, R = ±75°):

| `bc` | recorte por la mañana | recorte por la tarde |
|---|---|---|
| −3 % | 43,54° | **54,62°** |
| 0 % | 49,31° | 49,31° |
| +3 % | **54,62°** | 43,54° |

Por la **mañana** sombrea el vecino **este**, y `bc` positivo da **más**
recorte: con `cse` (positivo = este más alto) **el signo es correcto**.

Por la **tarde** sombrea el vecino **oeste**, y `bc` positivo da **menos**
recorte, cuando hace falta **más**: con `cso` (positivo = oeste más alto) **el
signo iba al revés**. La corrección aplicada es:

```js
sx = (sol al este) ? cse : −cso        // ídem ase / −aso en modo agresivo
```

Junto con ella se corrigió el marco del tubo inclinado: la normal del plano es
`(0, −sen b, cos b)` y por tanto `R = −atan2(E, U·cos b − N·sen b)`; el código
anterior sumaba `+N·sen b`.

**Efecto declarado por quien hizo la corrección** (lado oeste, modo
conservador; 80 seguidores, 12 días tipo, cada 15 min; contra un modelo 2D
validado con trazado de rayos, error medio 0,2-0,3°):

| | sesgo | error medio |
|---|---|---|
| Ayora, antes | −1,65° | 3,64° |
| Ayora, después | +0,48° | 2,12° |
| San José, antes | +1,35° | 2,25° |
| San José, después | −0,56° | 1,33° |
| lado este (sin cambios) | — | 1,25° / 1,53° |

**Esta última tabla NO está verificada de forma independiente** por quien
escribe este documento: se reproduce tal como la entregó su autor. Todo lo
demás de arriba sí lo está, y se dice con qué.

---

## 6 · Lo que la TCU recibe, que no es lo mismo

La TCU **no** recibe esos cuatro números. Recibe **un vector por lado**:

| registro | contenido | unidad | rango |
|---|---|---|---|
| 41098 | West grade slope angle | radianes | **0 .. π/4** |
| 41100 | West grade azimuth angle | radianes | 0 .. 2π |
| 41102 | East grade slope angle | radianes | **0 .. π/4** |
| 41104 | East grade azimuth angle | radianes | 0 .. 2π |

**La magnitud es no negativa por rango**: todo el sentido vive en el azimut.
Y la banda muerta va en el 41061 en **pulsos** (45 por defecto), con la
constante pulsos/grado **fuera** de todos nuestros ficheros.

**El azimut del eje** se declara 0 en el simulador como **aproximación
declarada**; el valor real sale del replanteo. Efecto medido de ese
desconocimiento en Ayora: la convergencia de meridianos vale **1,16°** y cuesta
**0,025 %** de energía; ni a 5° de desvío se llega al 0,2 %.

---

## 6 bis · Casos que no encajan uno a uno

Emparejando cada seguidor con su vecino inmediato, la mayoría cuadra al
centésimo (tracker 105: `cse = −0,703` frente a −0,702 medida; `cso = +2,088`
frente a +2,085). Pero hay colas:

| tracker | as-built | medida al vecino inmediato |
|---|---|---|
| 103 | `cse = +0,089` | −1,028 |
| 108 | `cse = −1,415` · `cso = +1,415` | −2,346 · +0,702 |

**Hipótesis del autor de la corrección**, no verificada: el proveedor toma la
«vecina crítica» entre varias candidatas, y la versión conservadora se queda con
la peor, así que no siempre es el vecino inmediato.

---

## 7 · Preguntas concretas

1. **¿Es correcto convertir el signo del tilt longitudinal (`axis_tilt = −τ`) y
   NO el de la pendiente transversal (`cross_axis_tilt = slope`) al llamar a
   `pvlib.tracking.singleaxis`?** Con azimut de eje 0.

2. **¿Qué pasa con esa asimetría si el azimut del eje deja de ser 0?** Nuestro
   `slope` se define en el marco del levantamiento (x al este) y el
   `cross_axis_tilt` de pvlib en el marco del eje. ¿Hace falta una conversión
   que hoy no existe, y cuál?

3. **¿Es correcta la descomposición (`slope`, `axisTilt`) como descripción
   completa de un plano inclinado arbitrario**, tal como la valida §4? ¿Hay
   algún caso —terreno no plano, filas de distinta longitud, vanos desiguales—
   en que la descomposición por pareja pierda algo que importe?

4. **En el modelo C, ¿es correcta la corrección a `−cso` por la tarde**, dada la
   evidencia del §5.3? ¿Y es correcto dejar `cse` sin tocar por la mañana?

5. **¿Es correcta la normal `(0, −sen b, cos b)` y `R = −atan2(E, U·cos b −
   N·sen b)`** para un tubo que sube hacia el norte, con el convenio
   `R < 0` = mirando al este?

6. **La pareja toma `axisTilt = media de sus dos filas`.** Con torsión real
   entre las dos filas, ¿es esa media defendible, o hay que tratar la pareja
   como dos planos?

7. **En la configuración de la TCU (magnitud ≥ 0 + azimut), ¿hay ambigüedad de
   signo?** ¿El azimut debería indicar la dirección en que el terreno **sube** o
   en la que **baja**? Contestar según la documentación del fabricante si se
   conoce; si no, decir qué convenio es el habitual y por qué.

8. **¿Qué explicaría los casos del §6 bis** (trackers 103 y 108): la «vecina
   crítica», la versión conservadora, error de medida, u otra cosa?

---

## 8 · Cómo responder

Para cada pregunta: **correcto / incorrecto / no se puede determinar con esto**,
y **por qué**. Si algo es incorrecto, decir **qué signo concreto** hay que
cambiar y **en qué línea del razonamiento** está el fallo.

Si alguna cifra de las tablas parece imposible, **decirlo**: están medidas, pero
un instrumento mal montado también produce cifras.
