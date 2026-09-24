# Refundación del BT · PASO 3 — Retirar el acople por línea

**Encargo «REFUNDACIÓN DEL BT» (titular, 2026-09-24), paso 3.** Rama
`claude/refundacion-p3-6th1im`, apilada sobre el paso 2. Simulador **v1.83.0**.
**La física CAMBIA** y está declarada con su sha256 en `FISICA_DECLARADA`
(`tools/test_caras_bajo_demanda.mjs`, portado de la fase A a esta rama porque
en `main` el banco solo admitía la etiqueta de versión).

## 3.1 · La unidad pasa a ser el ACCIONAMIENTO

**Dónde la unidad ya es el motor.** En planta real, con los motores medidos
(`T.segDrive`: las cuatro mesas de un tracker, un motor, un θ; Ayora, banda de
la página: 400 motores, 1.600 mesas). Ahí, el acople de las DOS LÍNEAS ENTERAS
de cada grupo (`T.groups`, 40 grupos, vía `applyDrive`/`driveCoupleSafe`) no
tiene objeto: acopla lo que no mueve ningún motor. Medido en el paso 1, era el
**95,1 %** del hueco con la rama por mesa (`audit5/REFUNDACION_P1.md`).

**Qué se retira y dónde:**

- **`policyAnglesSegF`** (bloque de física): en planta real con `segDrive`,
  `row`, `true3d` y `mgl` calculan su ángulo de línea SIN acople de grupo
  (`LINEA_SIN_ACOPLE`: `anglesRow`, `anglesTrue3d` y `anglesMinGroundLight`
  con los grupos quitados), lo reparten a sus mesas y lo acoplan POR MOTOR
  (`applyDriveSeg(…, T.segDrive)`).
- **`segCmd`**, la fuente de mando del día y del anual: en planta real con
  `segDrive` también manda esas tres por la rama por mesa (`porMotor`).
- **Lo que NO cambia:**
  - `pairwise`, `astro`, `optimal` y `optfree` ya iban por mesa, acopladas por
    motor;
  - `global` y `bt2d` dan un solo ángulo, y el acople no les hace nada;
  - en los **presets** el grupo bifila ES el motor (un motor mueve dos filas),
    así que su acople, `driveCoupleSafe` con su refinado, se queda.
- **La regla del min(|θ|) del grupo** sigue siendo cómo `applyDriveSeg` elige
  el θ común del MOTOR (el más retrocedido de sus mesas). Deja de justificarse
  con «reducir |θ| nunca crea sombra» (3.2). Elegir el θ del motor con el
  contador es trabajo del optimizador (paso 5), no de este paso.

**Banco** `tools/test_unidad_accionamiento.mjs`:

1. cada motor, un θ, en `row`, `true3d` y `mgl` (Ayora, 5 soles);
2. ya no se acoplan líneas enteras: hay grupos cuyas dos líneas publican θ
   distintos. Test nulo: las tres difieren de `origin/main`;
3. las otras seis por mesa en Ayora, y las nueve por línea en presets mono y
   bifila, bit a bit como `origin/main`;
4. **control negativo:** con `LINEA_SIN_ACOPLE` vacía, la 2 se pone roja;
5. la **fuente de mando de la página** (`segCmd`, cortada tal cual) da lo mismo
   que la rama por mesa. Control: el `segCmd` de antes, no.

## HALLAZGO · «el banco que comprueba lo que no se usa» (`segCmd`)

**Qué pasó.**

- La primera versión del paso 3 cambió `policyAnglesSegF`, pero la página
  publica por `segCmd` (`backtracking.html:5446-5460`; la serie del día en
  `:5525`, `const ls=topeBacktrackingSeg(g.zen,g.az,T,segN,LZS.paso(segN,STEP_MIN*60));`,
  y `anualGen`).
- Para `row`, `true3d` y `mgl`, `segCmd` hacía `policyAngles` + `segsBroadcast`:
  el cambio **no llegaba a lo que se publica**.
- Y el banco nuevo, en sus comprobaciones 1-4, lo habría dado por bueno,
  porque miraba `policyAnglesSeg`.

**Por qué es el caso más peligroso de la serie.** No es un banco que no puede
fallar: es un banco que comprueba lo que NO se usa. Pasa en verde sobre un
cambio que no ha llegado.

**Corrección:**

- `segCmd` pasa también por la rama por mesa (`porMotor`);
- el banco extrae `segCmd` de la página, tal cual
  (`audit5/lib_anual_pagina.mjs`), y carea contra él (comprobación 5), con el
  `segCmd` de antes como control negativo.

**Regla R-1** (`audit5/REGLAS.md`): un banco verifica la ruta que la página
EJECUTA, no la función que uno cree que ejecuta. Se extrae de la página, no se
importa la que suena bien.

### Revisión de los otros bancos (R-1)

Se buscaron los bancos que afirman algo de lo que la página PUBLICA y lo
comprueban importando una función de física en vez de la que la página llama.
Salieron tres, y uno destapó un defecto real.

**B1 · `tools/test_produccion.mjs`, «MISMO BT que el simulador».**

- *Antes:* comparaba el θ de LÍNEA de la tarjeta con
  `policyAngles('pairwise')`, en Ayora real. Era tautológico: la tarjeta
  sacaba ese θ de la misma función (`angT0` de `F.policyAngles`). Y en planta
  con mesas la página no publica eso, publica por `segCmd`.
- *Ahora:* sin mesas sigue igual. Con mesas (Ayora real, `pairwise` y `row`,
  día a paso de 30 min) exige, bit a bit:
  - por mesa, `r.segAng` igual a `segCmd(pol, …, T, T, …)`, CORTADO de la
    página (`segOn`, `POL_POR_MESA` y `segCmd`, `tools/test_produccion.mjs:42-56`);
  - por línea, `r.ang` igual a `segLineMean(T, segCmd(…))`.
- *Una consecuencia:* el test de la planta PLANA («misma consigna astro en todas
  las filas») exige ahora la igualdad exacta en las mesas, que es donde está la
  consigna. La línea queda a 1e-9°: la media ponderada de mesas iguales redondea
  4,26e-14°.

**B2 · `tools/test_veto_por_mesa.mjs`: encaminamiento de `optimal`/`optfree`.**

- *Antes:* comprobaba `policyAnglesSeg`, no la puerta `segCmd`.
- *Ahora:* hay una comprobación nueva sobre `segCmd`, cortado de la página, con
  dos controles:
  - (a) con una `Tcfg` que no es la T, la puerta tiene que repartir la línea;
  - (b) con `optimal`/`optfree` quitadas de `POL_POR_MESA` en la fuente, la
    comprobación tiene que ponerse roja.
- *Resultado:* 8/8 en verde, v1.83.0.

**B3 · `tools/test_backtracking_sim.mjs`, «el ÁNGULO sale de lo que la TCU cree».**

- *Antes:* en los caminos de instante solo exigía el literal de la rama por
  línea. La rama por mesa de `sceneInstant` (`backtracking.html:8252`,
  `segCmd(key,g.zen,g.az,DAY.Tcfg||DAY.T,DAY.T,…`), que es la que corre con
  mesas, quedaba sin vigilar.
- *Ahora:* exige también ese literal. Control: con la creencia quitada de esa
  llamada, la comprobación se pone roja.

### DEFECTO que destapó B1 · el θ de línea de `produccion.html` con mesas

**Qué hacía.** Con mesas, `produccion.html` calculaba el θ por mesa con
`policyAnglesSeg`, que es lo que manda la página. Pero su θ de LÍNEA lo sacaba
aparte, de `policyAngles`, que acopla las dos líneas enteras de cada grupo y
no es lo que manda ninguna mesa.

**Dónde se usaba ese θ.**

- En la tabla por minuto y en el barrido.
- En la ganancia BIFACIAL por string: `tiltRow` (`produccion.html:1275`,
  `tiltRow:r.ang.map((th,rr)=>so(th,rr,null))`), que lee `mapStringW`
  (`:1585`, `const b=r._bif, t=(b&&b.tiltRow&&b.tiltRow[k]!=null)?b.tiltRow[k]:0;`).

**Corrección.** Con mesas, el θ de línea es la media de sus mesas
(`segLineMean`), como en la página:

- la consigna, en `produccion.html:1456`
  (`const angT0=c.manual?angMan`, rama `porMesa?F.segLineMean(T,segAngT0)`);
- lo ejecutado, la media de lo que ejecutan sus mesas
  (`if(porMesa&&segAng&&!c.manual)ang=F.segLineMean(T,segAng);`).

La franja horaria de «backtracking activo» también mira ahora las mesas.
`segLineMean` entra en la lista de exportación de la página y en las de los
tres arneses (`tools/careo_produccion.mjs`, `tools/gen_golden_anual.mjs` y
`tools/test_produccion.mjs`).

**Efecto medido** (`audit5/P3_prod_bifacial.mjs`,
`audit5/out/P3_prod_bifacial.json`):

- *Condiciones:* misma física (v1.83.0), dos `produccion.html`: base, el del
  paso 2, frente al de hoy. Ayora real con cotas, 21-jun, paso 15 min, lazo
  apagado, albedo 0,25, 79 valores por string.
- *Resultados:*

| política | φ bifacial | base (kWh) | hoy (kWh) | Δ día | peor string |
|---|---|---|---|---|---|
| pairwise | 0 % | 13.524,2548 | 13.524,2548 | idéntico bit a bit | — |
| pairwise | 75 % | 14.436,7303 | 14.441,5424 | **+0,0333 %** | 0,0579 % |
| row | 0 % | 13.394,2389 | 13.394,2389 | idéntico bit a bit | — |
| row | 75 % | 14.313,3082 | 14.313,3085 | +0,0000 % | 0,0013 % |

- *Test nulo:* con φ = 0, que es el valor de arranque de la página, la
  energía sale idéntica bit a bit. El θ de línea solo entraba por la bifacial.
  Con el valor de arranque, la cifra publicada no cambia.
- *Alcance:* grado de evidencia, un día (21-jun) de una planta. El año no está
  medido.

**Golden y careo.** El canario de la cifra anual (`tools/golden_anual.json`)
no se mueve, porque sus casos son genérica y El Burgo, sin cotas por mesa.
El careo de campo (`tools/test_herramientas_campo.mjs`) sale 11/11.

## 3.2 · La regla «reducir |θ| nunca crea sombra» sale de la interfaz y de los comentarios

Está medida como FALSA: el contraejemplo aparece en 75 de 200 instantes del
barrido de terrenos (semilla 1) y en 68 de 200 (semilla 7), con el 22,79 % y
el 22,03 % del peso energético; el peor llega al 91,4 % de fracción sombreada
con |θ| MENOR (nota de la interfaz). Se reescribieron las cuatro afirmaciones:

- **la nota de la interfaz** del accionamiento: ahora dice qué se hace (un
  motor, un ángulo; el menor |θ| en los presets, con refinado; el motor medido
  en planta real) y que el menor |θ| **no** garantiza que no haya sombra, con
  las cifras;
- **el comentario del accionamiento** (`accionamiento: monofila / bifila…`);
- **el comentario de las estaciones del solape**, que ahora remite a la
  REPARACIÓN con torsión de `anglesPairwiseRaw`, que existe;
- **el comentario de `applyDriveSeg`**.

`grep -i "nunca crea sombra" backtracking.html` → 0. Ningún banco dependía del
texto.

## REFUTACIÓN (3.3, día) · el acople que se retiró llevaba dentro una REPARACIÓN de sombra — PARADA

**La premisa que no se sostiene.** En 3.1 escribí que el acople de las dos
líneas enteras de cada grupo «no tiene objeto» en planta real, porque acopla lo
que no mueve ningún motor. La medida del día dice que sí tenía objeto: dentro de
la misma función iba una reparación de sombra, y el paso 3 la retiró con el
acople.

**La medida.** `audit5/P3_3_efecto_dia.mjs`, salida en
`audit5/out/P3_3_dia_baratas.{txt,json}`:

- página del paso 2 (v1.82.0) → página del paso 3 (v1.83.0);
- Ayora, banda de la página; 21-jun y 21-dic, cada 5 min;
- cielo claro, con lazo y tope; `segCmd` cortado de la página.

| política | 21-jun (kWh/m²) | Δ | 21-dic (kWh/m²) | Δ |
|---|---|---|---|---|
| astro · pairwise · global · bt2d (TEST NULO) | = | idéntico bit a bit | = | idéntico bit a bit |
| row | 11,1234 → 11,1230 | −0,0039 % | 2,9933 → 2,9936 | +0,0091 % |
| **true3d** | 9,5158 → 9,4756 | **−0,4232 %** | 2,3729 → 2,3594 | **−0,5669 %** |
| mgl | NO MEDIDO | | NO MEDIDO | |

**El mecanismo.** `driveCoupleSafe` (`backtracking.html` del paso 2, `:789`) hace
DOS cosas:

1. acopla los ángulos del grupo (`applyDrive`);
2. REPARA la sombra: para cada pareja de líneas en contacto, barre el ángulo del
   grupo y se queda con el candidato sin sombra más cercano. En `true3d` lo mide
   con el residuo de tangencia 3D.

El paso 3 sustituyó `driveCoupleSafe(anglesTrue3d(…),true)` por el ángulo crudo
(`LINEA_SIN_ACOPLE`), así que se llevó también la reparación.

`audit5/P3_3_reparacion.mjs` cuenta las parejas de líneas en contacto 3D
(residuo < −1 mm) de `true3d` sobre 48 instantes × 78 parejas = 3.744
pareja·instante (Ayora, 21-jun y 21-dic cada 30 min, sol > 1°):

| ángulo de línea de `true3d` | parejas en contacto 3D |
|---|---|
| crudo: lo que el paso 3 reparte a las mesas | **119** |
| solo el acople de líneas enteras, sin reparación | 101 |
| `driveCoupleSafe`: acople + reparación (paso 2) | **53** |
| reparación con CADA LÍNEA como su unidad, sin acople | **53** |

- El acople solo quita 18 contactos; la reparación, 48 más.
- La reparación NO necesita el acople de líneas enteras: tomando cada línea como
  su propia unidad deja los mismos 53 contactos.

**Alcance.**

- **`true3d`:** medido, arriba.
- **`mgl`:** pierde lo mismo por otro camino. Su base es
  `driveCoupleSafe(pairwise,false)` (`anglesMinGroundLight`, `:2436` del paso 2),
  y el paso 3 la llama con los grupos quitados (`sinGrupos`), así que su base
  queda en `pairwise` crudo. NO MEDIDO.
- **`row`:** solo usaba `applyDrive`, sin reparación. Para `row`, el paso 3
  quitó solo el acople, y el efecto es de −0,004 % y +0,009 %.

**E-X1-R3-3 (mío).**

- Traté `driveCoupleSafe` como «el acople» sin leer su cuerpo. El nombre ya
  decía «Safe».
- El banco del paso 3 (7/7) no lo podía ver: comprueba que cada motor tiene un
  θ y que ya no se acoplan líneas enteras, no que se mantenga la ausencia de
  contacto.
- Es el rastro que no es la cosa: el banco vigila la forma del cambio, no lo
  que el cambio rompe.

**Opciones, con su coste. Decide el titular:**

- **(a) Unidad = accionamiento Y reparación, por línea.**
  - Qué: `driveCoupleSafe` con cada línea como su propia unidad (grupos de una
    línea) para `true3d` y para la base de `mgl`; luego el acople por motor
    (`applyDriveSeg`).
  - A favor: deja los mismos 53 contactos que el paso 2, sin acoplar lo que no
    mueve ningún motor.
  - Coste: la energía no está medida; la física cambia otra vez (sha nuevo), y
    el banco del paso 3 tiene que ganar una comprobación de contacto con su
    control negativo.
- **(b) Revertir `true3d` y `mgl` al paso 2 y dejar solo `row` desacoplada.**
  - A favor: vuelve la energía medida y los 53 contactos.
  - Coste: `true3d` y `mgl` siguen acoplando las dos líneas enteras de cada
    grupo en planta real, que es lo que el paso 3 existe para retirar.
- **(c) Dejarlo como está.**
  - Coste: `true3d` pierde un 0,42-0,57 % del día y publica más del doble de
    parejas en contacto 3D (119 frente a 53).
  - No lo recomiendo: sería publicar sombra que el código sabía reparar.

**Recomendación: (a).** Es la única que cumple a la vez la premisa del paso
(«la unidad es el accionamiento») y lo que el código ya garantizaba (no dejar
contacto que sabe reparar). Antes de aplicarla hay que medir su energía en los
mismos dos días.

**PARO aquí**, como dice el encargo para una medida que contradice la premisa
de un paso. El PR del paso 3 no se abre hasta la decisión. `mgl` (día) y el
anual del 3.3 quedan sin lanzar.

## DECISIÓN (a) del titular, y su medida: los contactos vuelven, la energía NO — PARADA

**La decisión (titular, 2026-09-24).** Opción (a): se conserva la reparación de
`driveCoupleSafe` con cada línea como su unidad (`porLinea`) y se retira el
acople de líneas enteras. **Condición:** no se aplica hasta medir la energía; si
no vuelve al nivel del paso 2, se dice y se para. Candidata en la rama
`claude/refundacion-p3a-6th1im` (992f2d2); la rama del paso 3 no se ha tocado.

**La medida del día.** `audit5/P3_3_dia_lado.mjs`, un proceso por (política,
día, página):

- misma receta que la serie del día (`segCmd` cortado de la página, lazo por
  mesa, tope, `poaPlantSeg`);
- Ayora, banda de la página; cada 5 min; cielo claro;
- control del script: reproduce el `astro` del 21-dic del paso 2 (2,977626
  frente a 2,9776).

| `true3d` | paso 2 (a0e4ab9) | paso 3 actual (74ab678) | (a) | (a) frente al paso 2 | (a) frente al paso 3 | pérdida recuperada |
|---|---|---|---|---|---|---|
| 21-jun (kWh/m²) | 9,515829 | 9,475561 | 9,479541 | **−0,381 %** | +0,042 % | 9,9 % |
| 21-dic (kWh/m²) | 2,372900 | 2,359448 | 2,359886 | **−0,548 %** | +0,019 % | 3,3 % |

Salidas en `audit5/out/P3_3_lado_true3d_*.json`. Máquina muy cargada (carga
15-24 con 4 núcleos): el coste no es medida de tiempo.

**Lo que dice.** La reparación por línea devuelve los contactos (53 parejas,
medido antes), pero recupera solo el 3-10 % de la energía perdida. La pérdida
de `true3d` no venía de la reparación: venía, casi entera, de retirar el
**acople mismo**. La premisa de 3.1, «el acople de líneas enteras no tiene
objeto en planta real», queda refutada por segunda vez, ahora en energía.

**Hipótesis, NO verificada.** El acople de líneas enteras no es una restricción
mecánica: ningún motor lo impone. Funcionaba como una REGLA DE DECISIÓN que
manda a las dos líneas de cada grupo el mismo θ, y ese θ común sombrea menos
por mesa (métrica `poaPlantSeg`, 2.5D por mesa) de lo que mide el criterio de
contacto 3D por pareja. Si es así, el contacto 3D no es la propiedad que
gobierna la energía. Para verificarla: la fracción sombreada por mesa del paso 2
frente a (a) en los mismos instantes. No está medida.

**`mgl`.** Sus días siguen en medida: 6 procesos, 40-90 s por instante. El
anual de `mgl` no se lanza, y los días dirán si hace falta.

**Opciones para el titular:**

- **(b')** El acople de líneas enteras vuelve a `true3d` y `mgl`, pero
  DECLARADO como lo que es: una regla de decisión («dos líneas, un θ»), no una
  restricción del accionamiento. La unidad mecánica sigue siendo el motor. La
  energía y los contactos del paso 2 vuelven, y `row` queda desacoplada.
  - Coste: el rótulo tiene que decir que es decisión y no mecánica; los datos
    de energía son los ya medidos del paso 2.
- **(a)** Aplicarla igualmente.
  - Coste: `true3d` pierde un 0,38-0,55 % del día frente al paso 2, por no
    alinear las líneas de cada grupo.
- **(c)** Verificar primero la hipótesis: fracción sombreada por mesa, paso 2
  frente a (a).
  - Coste: una medida más.
  - A favor: dice si el contacto 3D es el criterio equivocado para la
    reparación, y eso afecta a (a), a (b') y al optimizador del paso 5.

**Recomendación: (c) y después (b').** (c) es barata y decide si hay que
cambiar el criterio. (b') conserva lo que el paso 3 venía a corregir, que
nadie crea que una restricción mecánica acopla las líneas, sin tirar energía.

**PARO aquí**, como pide la condición.

## (c) AMPLIADO (decisión del titular) · 1: el acople en presets genéricos — la ventaja NO es general

**La pregunta.** ¿El acople de líneas enteras gana en Ayora por una propiedad
del problema, o por casualidad de esa geometría?

**La medida.** `audit5/P3_3c_preset.mjs`, salida en
`audit5/out/P3_3c_preset.{txt,json}`:

- `true3d` con el acople de líneas enteras (`driveCoupleSafe` con los grupos
  bifila) frente a la reparación por línea (`porLinea`);
- presets genéricos de 10 filas, paso 6 m, bifila;
- ruta de línea con lazo (`crearLazo` → `topeBacktracking` → `poaPlant`);
- cielo claro, lat/lon de la genérica, cada 5 min.

| preset | 21-jun: por línea frente a acople | 21-dic |
|---|---|---|
| llano | idéntico bit a bit | idéntico bit a bit |
| pendiente uniforme 4° | idéntico bit a bit | idéntico bit a bit |
| ondulado ±1,5 m | **+2,73 %** | **+4,76 %** |
| pendiente 5° + torsión N-S ±3° | +0,04 % | +0,72 % |
| aleatorio 1 (semilla 7) | +2,71 % | +4,34 % |
| aleatorio 2 | +3,00 % | +4,79 % |
| aleatorio 3 | +2,09 % | +3,12 % |

TEST NULO: `astro` sale idéntico en las dos variantes, en todos los presets.

**Lo que dice.**

- **La ventaja del acople no es una propiedad del problema.** En relieve
  genérico, el acople PIERDE entre un 0,04 % y un 4,8 % del día. En Ayora GANA
  un 0,38-0,55 %. La ventaja es de la geometría de Ayora o de la ruta por mesa
  en planta real, y no de «dos líneas, un θ».
- **El preset uniforme no es un control superado: no puede distinguir.** Sale
  idéntico bit a bit porque ahí `true3d` ya da el mismo θ a las dos líneas de
  cada grupo, y el acople no tiene nada que cambiar.
- **No es una comparación de igual a igual con Ayora.**
  - En los presets, ruta de línea con `repairNoShade` activo.
  - En Ayora, rama por mesa en planta real, con acople por motor y sin
    `repairNoShade`.

  Esto descarta la regla general, no explica Ayora.

**Consecuencia para las opciones.** (b') deja de ser «devolver el acople como
regla de decisión». Como mucho sería «el acople ayuda en Ayora y estorba en
otras plantas», y eso no es una regla, es un caso. La pregunta buena pasa a ser
**por qué Ayora es distinta**. La descomposición sombra/haz, en curso
(`audit5/P3_3c_descompone.mjs`), es la que lo dice.

No se decide nada hasta tenerla. Si la sombra explica la ventaja en Ayora y en
los presets se pierde, hay algo de la geometría real que el criterio de
contacto 3D no ve: mesas partidas, morros o longitudes distintas.

## (c) AMPLIADO · 2: la descomposición — el acople paga por HAZ, no por sombra. REFUTACIÓN — PARADA

**La medida.** `audit5/P3_3c_descompone.mjs`, salida en
`audit5/out/P3_3c_descompone_{6,12}.{txt,json}`.

- **Qué se compara:** el ángulo que EJECUTA la página, en el paso 2 y en (a).
  Sale de `segCmd` cortado de la página → lazo por mesa → tope, en Ayora, cada
  5 min.
- **Cómo se evalúa:** con una sola física, descompuesto por mesa como lo suma
  `poaPlantSeg`: `v = beam·(1−se) + circ·(1−fo) + sky + gnd`.
- **Controles:**
  - la suma de los términos reproduce `poaPlantSeg` (peor diferencia por
    instante, 4e-12 W/m²);
  - el cierre del día es de 1e-15 kWh/m²;
  - TEST NULO: los dos términos difieren entre el paso 2 y (a).

| `true3d`, (a) − paso 2 | 21-jun | 21-dic |
|---|---|---|
| ΔE total | −0,036288 kWh/m² (**−0,381 %**) | −0,013014 (**−0,548 %**) |
| término de **ÁNGULO** (sin sombra) | **−0,039688 (−0,417 %)**: haz −0,033554, circunsolar −0,003691, cielo+suelo −0,002443 | **−0,014796 (−0,624 %)**: haz −0,012041, circ −0,001763, cielo+suelo −0,000992 |
| término de **SOMBRA** | **+0,003400 (+0,036 %)**: pérdida por sombra 0,007709 → 0,004309 | **+0,001782 (+0,075 %)**: 0,004895 → 0,003113 |

**Lo que dice.**

- **La sombra NO explica la pérdida: va en contra.** Con (a) hay MENOS sombra
  (−44 % el 21-jun, −36 % el 21-dic). Toda la pérdida, y algo más, está en el
  ángulo de incidencia, y el 85 % de ella en el haz directo.
- **El acople de líneas enteras no ganaba sombreando menos.** Ganaba dando a las
  líneas un ángulo con mejor incidencia del haz.
- Encaja con los presets: si lo que mueve la energía es el AOI, imponer un
  ángulo común ayuda o estorba según cómo estén repartidos los tilts, y eso
  depende de la planta. En Ayora ayuda; en relieve genérico estorba hasta un
  4,8 %.

**REFUTACIÓN de la premisa del paso 3.** El problema no es el acople: es el
CRITERIO con el que decide `true3d`.

- **La premisa:** retirar el acople corrige el modelo sin coste, y lo que había
  que conservar era la ausencia de contacto.
- **Lo medido:** `true3d` decide con el contacto 3D, que no gobierna lo que se
  cobra. El contacto apenas mueve la energía (la sombra es del 0,03-0,08 % del
  día), y el ángulo de incidencia la mueve cuatro veces más.
- **Por qué el acople arreglaba algo:** alineaba las líneas y, en Ayora, por
  casualidad de su geometría, las acercaba a su óptimo de haz. `true3d` nunca
  lo buscó.
- **Es el mismo defecto que `optimal` tenía con `poaPlant`/`poaPlantSeg`**
  (R4 fase 1): la decisión optimiza una cosa y la energía la cobra otra, ahora
  en otra política y con otro par de criterios.
- **Consecuencia:** el paso 3 deja de ser «retirar el acople» y pasa a ser
  «revisar con qué criterio decide `true3d`». Toca también al paso 5: un
  optimizador de conjunto que decida por contacto repetiría el mismo defecto.

**Lo que NO se sabe todavía.**

- `mgl`: sus días están en pausa y no se han medido.
- Si hay otras políticas con el mismo desajuste entre criterio y cobro.
- Qué criterio debería usar `true3d`. Candidatos: ¿el POA por mesa, como
  `optimal` desde la v1.76?

**PARO aquí.** La decisión es del titular: (b'), (a) o reformular el paso 3.

## Incidencia · la primera corrida del banco del paso 3 murió en silencio

La corrida de `tools/test_unidad_accionamiento.mjs` (PID 17739) terminó tras la
comprobación 1, sin mensaje de error y sin la línea final. Causa: **no
encontrada** (después había 12,7 GB libres; `dmesg` no registra nada). No se da
por buena: se relanzó entera. Además, cada (física, política, instante) se
calcula ahora una sola vez (`pas()`), porque `mgl` cuesta de 40 a 90 s por
instante en Ayora y las comprobaciones 1, 2, 4 y 5 repetían las mismas llamadas.

## Errores propios (E-X1)

- **E-X1-R3-1.** La primera versión cambiaba `policyAnglesSegF` y no `segCmd`.
  La página NO habría cambiado nada, porque el día y el anual piden el mando a
  `segCmd`, que para las políticas de línea hacía `policyAngles` +
  `segsBroadcast`. Y las comprobaciones 1-4 del banco habrían pasado igual,
  porque miran `policyAnglesSeg`: el rastro no es la cosa. Se vio al preparar
  la medida del día, antes de medir nada. Se corrigió `segCmd` y el banco ganó
  la comprobación 5, con su control.
- **E-X1-R3-2.** Para parar la primera corrida del banco se seleccionaron los
  PIDs con `ps | awk '/patrón/'` en un `for` y se mataron: la familia que la
  regla prohíbe. Casó también con la shell envoltorio de la corrida, que era la
  que se quería parar, así que no hubo daño. La barrera no lo cubría y se amplió
  (`audit_mancha/MANCHA.md`, «Segunda ampliación», #753). Poco después la
  barrera ampliada paró otra orden mía que leía el PID con `ps | grep` dentro de
  un bucle de espera: se leyó el PID aparte y se esperó con `kill -0`.
