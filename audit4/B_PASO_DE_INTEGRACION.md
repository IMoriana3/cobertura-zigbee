# R4 · B — LOS 1,996° ERAN EL PASO DE INTEGRACIÓN

**Acota, no arregla.** Sonda: `audit4/B_paso_integracion.mjs` →
`audit4/out/B_paso.json`.

---

## B.1 · La pregunta cambia, y el hallazgo viejo se retira

### Lo que se retira

R3 dejó escrito: **«dos lazos de control que difieren hasta 1,996°»**
(`audit3/NOTAS.md:1135-1144`), con la lectura de que había que decidir **cuál de
los dos es el bueno**.

**Esa lectura queda retirada.** No como diferencia de ley.

### La medida que lo retira

`audit4/F3_lazos.mjs` (fase 3, PR #731 — la página completa en
`audit4/FASE3_LOS_DOS_LAZOS.md`):

| variante | pasos con Δ | \|Δ\| máx |
|---|---|---|
| tal como corren hoy | 99/100 | 1,995833° |
| **ciclo = el tramo entero** | **0/100** | **0,000000°** |
| banda muerta 0 en **los dos** | **0/100** | **0,000000°** |

Con un ciclo por tramo los dos lazos coinciden **exactamente**, paso a paso, en
los cien. Re-comprobado aquí como **test nulo** de este barrido: `|Δ| máx
0,00·10⁰°`.

**No son dos leyes. Es la discretización.** Banda muerta y límite de velocidad
**no conmutan** con el troceo: cerca del umbral, el paso entero y el troceado
toman decisiones distintas, y esa decisión se arrastra por el enclavamiento.

### La pregunta que queda

> No es **«cuál de los dos lazos»**. Es **«a qué paso se integra»**.
>
> Y eso **no lo fija el simulador**: lo fija el **ciclo de control de la TCU**,
> que es un dato de la máquina.

Esto retira también la opción A/B de la fase 3 tal como estaba planteada: no
hay que elegir implementación, hay que **fijar un paso y justificarlo**. La
página de la fase 3 sigue siendo la evidencia; su marco se corrige aquí.

---

## B.2 · El barrido del paso de integración

**Qué se barre, y qué no.** El **paso de la rejilla** (cada cuánto se le pide
una consigna nueva a la política) se deja **fijo en 10 min**; lo que se mueve
es el **ciclo** (cada cuánto el lazo decide dentro de ese tramo). Son dos ejes
distintos y confundirlos era fácil: cambiar la rejilla cambia **la consigna**,
no solo su ejecución.

**Se añade una columna que B.2 no pedía y es la que más importa: 600 s.** El
bucle anual de la página da **un paso por tramo de 10 min**, o sea integra con
ciclo = 600 s. Sin esa columna, el barrido diría a qué paso deja de importar
sin decir **en cuál estamos**.

### B.2a · Efecto en θ

Sobre la misma rampa de la fase 3 (sube, se mantiene, invierte), banda 1,0°,
slew 0,17 °/s, tramo 10 min:

| ciclo | \|Δθ\| máx vs 1 s | vs el ciclo anterior | pasos que cambian |
|---|---|---|---|
| 1 s | 0,000000° | — | 0/100 |
| 5 s | 0,680000° | 0,680000° | 67/100 |
| 10 s | 1,530000° | 0,850000° | 67/100 |
| 30 s | 1,830000° | 0,300000° | 67/100 |
| 60 s | 1,830000° | 0,125000° | 67/100 |
| 300 s | 1,995833° | 1,790000° | 99/100 |
| **600 s** (el de la página) | **1,995833°** | 1,250000° | **99/100** |

A **1,9958°** se llega ya a 300 s, y ahí se queda: es **el techo**, dos bandas
muertas. Y **99 de 100 pasos** cambian en el régimen de la página.

### B.2b · Efecto en la energía anual

12 líneas sintéticas, cuesta E-O 6°, Zaragoza, **12 de 12 meses**, paso de
rejilla 10 min. Cada celda es kWh/m² y, debajo, el **% contra el ciclo de 1 s**
—el canónico del núcleo, `js/control_core.js:51`—.

| política | 1 s | 5 s | 10 s | 30 s | 60 s | 300 s | **600 s** |
|---|---|---|---|---|---|---|---|
| `pairwise` | 2528,6362 | +0,0268 % | +0,2605 % | +0,6759 % | +0,4172 % | +1,1435 % | **+0,8649 %** |
| `true3d` | 2528,6362 | +0,0268 % | +0,2605 % | +0,6759 % | +0,4172 % | +1,1435 % | **+0,8649 %** |
| `mgl` | 2522,3979 | +0,0970 % | +0,1272 % | +0,5944 % | +0,4771 % | **+1,4122 %** | **+1,1329 %** |
| `optimal` | 2551,6783 | +0,1142 % | +0,2859 % | +0,0259 % | +0,1347 % | +0,6803 % | **+0,6119 %** |
| `optfree` | 2554,0824 | +0,1445 % | +0,1425 % | +0,1107 % | +0,1361 % | +0,6727 % | **+0,6079 %** |
| `astro` | 2528,2846 | −0,0315 % | +0,0374 % | −0,0007 % | −0,0104 % | −0,0509 % | **−0,0184 %** |

`pairwise` y `true3d` coinciden al dígito porque en una cuesta **uniforme** con
eje horizontal la bisección 3D no tiene tilt N-S sobre el que apartarse. Es lo
que tiene que pasar.

### ¿A partir de qué paso deja de importar?

**De ninguno, en este rango**, para las cinco políticas con backtracking:
ningún ciclo baja del 0,01 % frente al de 1 s. La única que se estabiliza es
**`astro`**, que se queda por debajo del 0,05 % en todo el barrido — y tiene
sentido: **no lleva backtracking**, así que la consigna es suave y la banda
muerta no tiene umbrales cerca que cruzar.

**El error no es ruido: tiene signo.** Engordar el paso **infla** la cifra
publicada, en las cinco políticas con BT y en todas las columnas menos una. Y
**no es monótono**: 300 s da más que 600 s, y 30 s más que 60 s. Así que no hay
una curva de convergencia que extrapolar, y **no se finge una**: lo afirmable
es el signo y la magnitud, no una ley.

### Lo que esto dice del número que la página publica

La página integra a **600 s**. Frente al canónico del núcleo de 1 s, eso son
**+0,86 %** en `pairwise` y `true3d`, **+1,13 %** en `mgl` y **+0,61 %** en los
dos optimizadores.

Esa cifra **NO se puede sumar ni restar** a la de la fase 3 (el lazo del núcleo
produce entre −0,096 % y −1,164 % menos que el de la página): son dos
comparaciones distintas —allí dos implementaciones al mismo paso, aquí una
implementación a dos pasos— y mezclarlas sería el error 24 en otro disfraz.

---

## B.3 · El ciclo de control de la TCU — **NO DISPONIBLE**

**Medido, no supuesto.** Barrido de los 325 registros de
`tools/modbus_src/tcu_v6.json` buscando periodo / ciclo / scan / muestreo:
**7 aciertos, y los siete son del PWM del motor**, no del lazo de control:

```
[85]  Motor's PWM duty cycle
[290] Duty cycle when approaching target
[292] Maximum duty cycle in automatic mode
[293] Initial duty cycle when the motor is started up
[295] Motor acceleration duty cycle ramp up
[296] Motor deceleration duty cycle ramp up
[103] Number of charging cycles
```

**Control de que el barrido no está ciego**: buscando «deadband» aparecen **2**
registros, el 41061 y el 41063, que es exactamente lo que tiene que haber.

> **El periodo de cálculo de la TCU NO está publicado en el mapa Modbus.**

Lo que hay hoy es **autoridad de campo**: «la TCU real CALCULA CADA SEGUNDO —lo
dice Iñaki, que las configura» (`js/control_core.js:37`). Es el único apoyo
del `cicloSeg: 1` del núcleo, y por tanto —según B.2— **el único apoyo de una
diferencia de hasta +1,13 % en la cifra anual publicada**.

**Qué haría falta**: el dato del fabricante (SUNNER) o una captura del tráfico
Modbus de una TCU en marcha, midiendo cada cuánto cambia `angle` cuando el
motor está en marcha — con el slew conocido (0,17 °/s), el escalón entre
lecturas consecutivas **da el periodo**. Eso es medible con la telemetría que
ya se registra si se descarga a la resolución nativa del TCU, no a la de 10 s
del fichero que hay.

**A quién pedirlo**: a SUNNER, la hoja de características del TCU v6; o a
Factiun, una descarga de telemetría a resolución nativa.

**No se inventa.** Mientras no esté, el `cicloSeg: 1` es una declaración de
campo, no una lectura, y así queda escrito.

---

## LO QUE B DEJA

**Retirado**: los 1,996° como «dos leyes que hay que arbitrar».

**Medido**: el paso de integración no deja de importar en ningún punto del
rango para las políticas con backtracking; engordarlo **infla** la cifra anual,
y la página está en el extremo grueso (**+0,86 % a +1,13 %** frente al ciclo de
1 s).

**Abierto**: el periodo real de la TCU, **NO DISPONIBLE** en el mapa Modbus —
y con él, cuál de las columnas de B.2b es la buena.
