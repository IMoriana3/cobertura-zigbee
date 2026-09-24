# R5 · FASE A — Decidir con lo que se mide

**Encargo R5 «el backtracking, enfocado», fase A (2026-09-24).** Rama
`claude/r5-fase-a-6th1im`, simulador **v1.80.0**. La física de `pairwise` y de
`true3d` cambia y está declarada; las otras siete políticas y el contador por
defecto siguen **bit a bit** iguales a `origin/main` (banco, A.3).

## El defecto de fondo

El que DECIDE el ángulo y el que CUENTA la energía no miraban lo mismo.

- **El contador** (`shadeBand3DAll`, `backtracking.html:1938`) enumera emisores
  por PROYECCIÓN con el sol del instante.
- **`pairwise` y `true3d`** preguntaban por VECINDAD —fila de al lado, solape en
  norte— y evaluaban al vecino como GEMELO:
  - `viol=(t)=>pv(p,t,t)`;
  - `shadeFracPair(psz,t,t,…)`;
  - `bt3dPairMaxMag` con una sola cuerda para emisor y receptor.

---

## A.2 · Auditoría del contador, antes de apoyarse en él

Medido sobre **v1.78.1**, antes de tocar nada. Ninguna de las opciones que
añade la fase A cambia la cuenta por defecto; el banco lo comprueba bit a bit.

### (a) La poda contra fuerza bruta, dentro de lo que la página carga

Guion: `audit5/A2_contador_poda.mjs` → `audit5/out/A2_contador_poda_{ayora,sanjose}.txt`.

El contador se carea contra sí mismo **sin poda** (`audit5/lib_contador_bf.mjs`):

- la misma aritmética por estación;
- sin el alcance (`:2191`) ni la ventana axial (`:2202`, `:2217`);
- con y sin la propia línea (`:2189`).

Solo planos de módulo, sin terreno. Consigna: `pairwise` por mesa publicado.
Fechas: 21-jun y 21-dic, cada 10 min.

| planta (banda de la página) | instantes | mesas×instante | relaciones de sombra | **perdidas por la poda** | lo que añade la propia línea |
|---|---|---|---|---|---|
| Ayora (79 líneas, 1.600 mesas) | 144 | 230.400 | 3.115 | **0** | 0 |
| San José (80 líneas, 964 mesas) | 144 | 138.816 | 4.440 | **0** | 0 |

- **Test nulo.** El contador parcheado con la poda puesta da BIT A BIT lo mismo
  que la página.
- **Control negativo.** Encogiendo el alcance, la poda **sí** pierde:
  - en Ayora hace falta ×0,03 (1 mesa, sol 13,4°);
  - en San José, ×0,1 (23 mesas, sol 0,7°).

  El margen de la poda es muy holgado. El control muerde, pero poco, y se
  declara.
- **La propia línea añade 0 con la geometría del contador.** Todas las mesas de
  una línea van en la x de LÍNEA, son colineales y ninguna tapa a otra de
  canto. La exclusión `pl.e===r` no pierde nada **en esa geometría**. Con la x
  de FILA sí pierde: ver (b).

### (b) Lo que el contador no puede ver, por construcción

Guion: `audit5/A2_fuera_de_dominio.mjs` → `audit5/out/A2_fuera_de_dominio_{ayora,sanjose}.txt`.

La página carga **una banda de ≤ 79-80 líneas de UN bloque**
(`plantFromCotas(data,80,blockIdx)`), con un solo `T.axisAz`, y el contador usa
la x de LÍNEA. Aquí se mide con el motor de proyección de la fase 1, que usa la
enumeración por cono validada contra fuerza bruta:

- sobre la **planta entera**: dos bloques en cada planta;
- en la x de FILA;
- **solo en las mesas que la página simula**. Las relaciones con receptor fuera
  de la banda se cuentan aparte, porque la página no las calcula.

| | sol < 3° | 3-10° | ≥ 10° |
|---|---|---|---|
| **Ayora** · relaciones: otro bloque / fuera de banda / misma línea / dentro | 0 / 140 / 1.000 / 15.923 | 0 / 30 / 954 / 4.610 | 0 / 36 / 230 / 7.123 |
| Ayora · mesas×inst. con sombra que el contador no ve (> 0 / > 1 pp, peor) | 511 / 59, 65,37 pp | 284 / 17, 41,95 pp | 37 / 11, 1,62 pp |
| Ayora · haz tapado que no ve | 0,6 % | 1,4 % | 0,7 % |
| **San José** · relaciones: otro bloque / fuera de banda / misma línea / dentro | **9.182** / 49.801 / 147 / 66.461 | 0 / 79 / 720 / 4.869 | 0 / 81 / 147 / 5.279 |
| San José · mesas×inst. con sombra que el contador no ve | 2.452 / 2.205, 100 pp | 211 / 25, 74,25 pp | 77 / 13, 1,56 pp |
| San José · haz tapado que no ve | 17,4 % | 1,2 % | 4,0 % |

**Otro azimut de eje.** Ninguna planta del repositorio lo tiene: los 12
layouts traen un solo `rot` cada uno (Bagnarelli 23,7°, Dicayagua 90°, el resto
0°). El contador no puede representarlo, porque usa un solo `T.axisAz`, y el
motor de la fase 1 tampoco lo admite todavía (`marcoMesa` supone el eje al norte,
`audit5/lib_proyeccion.mjs:53-54`). Queda para **B.2**, que construye esa
geometría a propósito. Aquí se declara: **no medido**.

**Conclusión A.2.** La poda es segura: no descarta ningún emisor real dentro de
su dominio. Lo que el contador no ve está **fuera de su dominio**:

- la sombra de la propia línea en la x de fila;
- las líneas fuera de la banda;
- otros bloques a sol rasante.

Esas tres cosas son un cambio del **contador**, no de la decisión, y mueven la
energía de las nueve políticas. Además, el bloque 4.3 del complemento pide medir
la propia línea y **no arreglarla todavía**. Van a la decisión del titular.

---

## A.1 · La decisión, con el mismo contador

`decideProyeccion` (`backtracking.html`, bloque «R5 FASE A · DECIDIR CON LO QUE
SE MIDE»):

1. **Semilla.** El candidato de pvlib de la política, **sin** sus barridos de
   gemelo (`opt.candidato` en `anglesPairwiseRaw` y `anglesPairwiseSeg`), con el
   mínimo |θ| de cada unidad de accionamiento. En `true3d`, su tope 3D de
   siempre. Es solo el punto de partida.
2. **Retroceso.** Mientras el contador vea una mesa sombreada por otra
   (planos, sin terreno, > 1e-3), las DOS unidades —emisora y receptora—
   retroceden hacia la paralela al terreno, dentro del rango legítimo
   (`rangosFila`). Primero a 1° y después se afina a 0,1° devolviendo el
   exceso. Solo retrocede, así que termina.
3. **Irreducible.** Lo que no se va ni en el tope del rango se declara
   (`info.irreducibles`), no se maquilla.
4. **Guardia de energía en la ruta por línea** (el contrato de v1.57 que la QA
   exige). Si quitar la sombra cuesta energía frente a lo que la política
   publicaba ANTES (fórmula acoplada **más** `repairNoShade`, que recorta al rango
   legítimo), se publica eso **marcado** `aceptadaPorEnergia`: la sombra queda
   declarada, no escondida. Sin cielo, sale marcada `sinReparar`, como siempre.

### Lo que se decidió y por qué (para el titular)

- **El enumerador es el del CONTADOR, no el motor de la fase 1 en la x de
  fila.** El encargo pide dos cosas que aquí chocan:
  - A.1: «x de FILA real»;
  - A.3: «la sombra que ve el que decide y la que cuenta el que mide tienen que
    coincidir».

  El que mide en la página es el contador, en la x de LÍNEA y sin la propia
  línea. Decidir con el motor de la fase 1 habría vuelto a separar decidir y
  medir. Por eso se decide con el contador, y la A.3 se cumple por
  construcción. Llevar el contador a la x de fila y a la propia línea es un
  cambio del contador que mueve la energía de las nueve; lo mide la A.2 y lo
  decide el titular. **No se ha reducido el alcance en silencio: se dice aquí.**
- **La semilla sigue siendo de pvlib**, que supone filas paralelas: eso es
  vecindad en el PUNTO DE PARTIDA. La **aceptación** ya no pregunta por
  vecindad ni por gemelo. Un retroceso de más que venga del propio pvlib (una
  vecina más corta, por ejemplo) no se deshace aquí: eso es optimizar, fase D.
- **La ruta por mesa, la de las plantas reales, no tiene guardia de energía.**
  No la tenía antes (`repairNoShade` se salta en `T.real`, en `repairNoShadeCore`, `backtracking.html:3680`, `if(T.real)return ang;`) y cada
  evaluación de energía cuesta una pasada completa del contador. Queda
  declarado.
- **`true3d` en planta real sigue por línea**, como antes: la difusión a mesas
  es la misma. Solo cambia cómo se acepta.
- **`pairwise` y `true3d` con el motor nuevo son políticas de NCU, no de TCU.**
  Es un hallazgo, no un banco arreglado: ver «HALLAZGO · la etiqueta TCU/NCU es
  una restricción de información», abajo.
- **Coste: DESCONOCIDO en tiempo.** Lo que sí se cuenta es el trabajo: la
  decisión hace entre 1 y 8 pasadas completas del contador por instante en
  Ayora (`info.evals`), frente a ninguna de antes. Los segundos no se publican:
  la máquina no ha estado libre en toda la fase (carga 8-9 en 4 núcleos, por las
  medidas largas de conoHaz y del giro) y dos corridas así no son comparables.

## CAMBIO DE ALCANCE DEL TITULAR (2026-09-24): el optimizador trabaja con CONTROL IDEAL

Cada unidad va a su ángulo al instante: sin banda muerta, sin límite de
velocidad y sin latencia de reparto. Afecta a la fase D y al MODO DEGRADADO; a
la fase A, solo en cómo se etiqueta el A.4.

1. **Consecuencia buena.** Con mando instantáneo, cada instante es
   independiente del anterior y desaparece la dimensión temporal del solver
   (D.5). El óptimo del día es la suma de los óptimos por instante, sin
   acoplamiento. También deja de tener sentido la histéresis de `optimal` y
   `optfree` (su argumento `prev`).
2. **Cómo se publica, no negociable.** El resultado es una **COTA SUPERIOR**: lo
   máximo alcanzable si el control fuera perfecto. Cada cifra lleva la etiqueta
   «control ideal, cota superior». No se compara con las nueve políticas
   medidas CON lazo sin decir que no son comparables.
3. **La distancia, que vale por sí sola.** El mismo óptimo se evalúa (a) con
   control ideal y (b) con el lazo real: banda muerta, 0,17 °/s y el ciclo de
   30 s de la TCU. La diferencia es **EL COSTE DEL CONTROL**: cuánto de la
   ganancia teórica se cobra de verdad. Se mide al menos en un día por estación.
   - El lazo de la página NO avanza cada 30 s: avanza con el paso de la malla,
     `STEP_MIN=5` (`backtracking.html:5575`) en el día y `PASO_ANUAL_MIN=10`
     (`:7813`) en el anual. Usa `DEADBAND_DEG=1.0` (`:3493`) y
     `TRACKER_SLEW=0.17` (`:3476`). Para (b) hay que construir un lazo que
     avance cada 30 s.
   - El ciclo de 30 s lo da el titular. El dato de firmware: **NO
     DISPONIBLE** en el repo; hay que preguntarlo a SUNNER (TCU FW v1.4.3,
     mapa v6.1).
   - **No cruzar dos números iguales que son cosas distintas.** En el repo, 30 s
     solo aparece como cadencia de **TELEMETRÍA**: un script de campo que lee
     el ángulo (registro 30111) de las TCU cada 30 s contra el MODBUS de la NCU
     (`index.html:1206`, «Lee el registro 30111 de los TCU de la hoja cada
     30 s»). **30 s de cadencia de telemetría NO es 30 s de ciclo de CONTROL.**
     Que coincida el número es lo que hace peligrosa la confusión: ese
     `index.html:1206` no confirma el ciclo de control.
   - **LA FAMILIA DE LA HISTÉRESIS: parámetros que existen SOLO por el control,
     no por la física.** Con mando ideal, ir y venir entre candidatos empatados
     no cuesta nada, así que sobran. Inventario en `backtracking.html` (v1.80.0):

     | parámetro | dónde | qué hace | con control ideal |
     |---|---|---|---|
     | `OPT_HISTERESIS=0.01` y el argumento `prev` | `:3096`; uso en `:3180` y `:3415` | `optimal` y `optfree` no cambian de pico si el otro no gana ≥ 1 % | sobra |
     | `OPT_DF_MAX=null` | `:3116` | freno de la velocidad de `f` (desactivado: cuesta 1,9-2,4 %, medido en su comentario) | sobra, ya apagado |
     | `TRACKER_SLEW=0.17` °/s, `slewLimit`, `slewLimitSeg` | `:3476`, `:3645`, `:2677` | límite de giro del actuador | sobra |
     | `DEADBAND_DEG=1.0` | `:3493`; lazo en `crearLazo` `:3596-3598` | banda muerta: no se mueve por menos de 1° | sobra |
     | umbral de llegada `lleg=0.5·db` | `:3599` | el lazo da por llegado a media banda | sobra |
     | aparcamiento en consigna + banda (`S.park`) | `:3627` | el lazo se pasa una banda en la dirección del movimiento | sobra |
     | `topeBacktracking(Seg)` con margen `DEADBAND_DEG` y `clampAdelantoDirigido` | `:3533`, `:3554`, `:3523` | limita el adelanto del lazo en backtracking | sobra: sin lazo no hay adelanto |
     | cadencia del lazo `STEP_MIN=5` y `PASO_ANUAL_MIN=10` | `:5575`, `:7813` | cada cuánto actúa el lazo | solo muestrea la energía (punto 4) |
     | ciclo de control de la TCU (30 s) y latencia de reparto de la NCU | **no existen en el código** | — | hay que AÑADIRLOS para (b) |

     - **No es de esta familia** el tope mecánico ±θmáx: es física del
       actuador y vale en los dos regímenes. En #751, sin fusionar, `crearLazo`
       gana `tope` y `fija`: `tope` es física y `fija` es de la familia.
     - **Cuando se mida el coste del control (b), se encienden TODOS a la vez,
       no uno a uno.** Si se encienden por separado, el coste sale repartido y
       no se ve. Una descomposición por parámetro, si se hace, va aparte y dice
       que no suma.
4. **El paso de integración** importa para (b) y no para (a). En control ideal
   solo afecta al muestreo de la energía, no a la decisión: se usa el que sea y
   se dice cuál.
5. **El MODO DEGRADADO cambia de forma.** Con mando instantáneo y
   realimentación, un seguidor fuera de plan se corrige en el siguiente
   instante. Se mide igual, porque la pregunta pasa a ser cuánta sombra hay
   DURANTE ese instante y cuántas unidades la sufren. Una unidad aparcada o en
   stow no se corrige; lo que cambia es que las demás replanifican a su
   alrededor.

**El A.4 de esta fase ya está medido con control ideal.** Evalúa la consigna
sin lazo ni giro. Sus cifras comparan la decisión vieja con la nueva en esas
mismas condiciones. **No son comparables con el anual de la página, que va con
lazo**, y así se etiquetan. Tampoco son una cota superior de nada: son dos
políticas evaluadas con el mismo control perfecto.

**QUÉ NO SE COMPARA CON QUÉ: son tres regímenes distintos.**

| régimen | qué mide | ejemplos |
|---|---|---|
| **A.4 de la fase A** | consigna **sin lazo ni giro** (control ideal) | `audit5/A4_efecto.mjs`, todas las tablas A.4 |
| **anual de la página** | consigna **con lazo** (banda muerta y aparcamiento) | la columna del año, `grAnualGen` |
| **#751** | **el efecto del giro** (tope tras el lazo, giro máximo, tope mecánico) | `audit_giro/G1-G3` |

- Una cifra de A.4 no se resta ni se suma a una del anual ni a una de #751.
- Tampoco se usa para «confirmar» ninguna de las otras dos.

## REFUTACIÓN (CI de #757, 2026-09-24): la premisa «las otras siete no cambian y ningún contrato se rompe» no se sostiene

**Dos bancos del CI se ponen rojos, y NO se encajan.** Los dos dicen lo mismo:
una decisión COORDINADA no es local, y eso choca con dos contratos que la
página daba por ciertos.

**1 · Invariante C del barrido de terrenos, «energía `optimal` ≥ `pairwise`».**

- **Medido en el CI** (40 configuraciones por semilla):
  - semilla 1: **2 violaciones** en 4.152 instantes;
  - semilla 7: **6 violaciones**, la peor 677,1 frente a 717,4 W/m², en
    «Zaragoza · aleatorio 13 · N-S rótula 3° · quebrado · medios ×2 · 8 filas ·
    az −20° · 21-jun 17:00Z · sol 27,2°».
- **Causa, en el código:** la garantía de `optimal` se construye contra
  `pairwiseLocal`, no contra el `pairwise` publicado:
  - `backtracking.html:3121`: `const base=driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false);`
  - `:3217`: `const pub=repairNoShade(zen,az,T,base,irr,doy,albedo);`
  - `optfree` hace lo mismo en `:3266`.

  Desde la fase A, `guardaEnergia` publica lo MEJOR entre la decisión y esa
  referencia, así que `pairwise` puede superar a `optimal`.
- **Grado:** medido en el CI, dos semillas.

**2 · Careo simulador ↔ producción, «las mesas interiores son idénticas bit a bit».**

- **Medido en el CI** (`tools/test_herramientas_campo.mjs`, careo sobre
  Ayora): peor |Δθ| interior **1,3954°**; el veredicto pasa a «DIFIEREN».
- **Causa:** las dos páginas comen la MISMA física
  (`tools/careo_produccion.mjs:4-5`, «produccion.html extrae el bloque FÍSICA
  PURA de backtracking.html»). Pero el simulador coordina una ventana de 80
  líneas y `produccion.html` la planta entera. `decideProyeccion` retrocede
  JUNTAS las unidades que ve, así que el θ de una mesa INTERIOR depende de
  hasta dónde llega el conjunto coordinado. Antes no dependía, porque la
  decisión por pareja era local.
- **Grado:** medido en el CI, un día (21-jun) y paso 30 min.

**Qué refuta.** La premisa de la fase A era que solo cambiaba cómo deciden
`pairwise` y `true3d` y que las otras siete y los contratos seguían. No es
así:

- el contrato «`optimal` ≥ `pairwise`» depende de que `pairwise` sea local;
- el contrato «interior idéntico a cualquier ventana» también.

Es la misma propiedad que el HALLAZGO de abajo, vista desde otro lado: la
decisión nueva COORDINA la planta y su resultado depende de QUÉ planta
coordina.

**Opciones, con su coste. NO se elige aquí: es del titular.**

| opción | qué hace | coste |
|---|---|---|
| (i) el veto de `optimal`/`optfree` incluye el `pairwise` PUBLICADO como candidato | restaura C por construcción | cambia `optimal` y `optfree` (dejan de ser bit a bit); una decisión coordinada más por instante (1-8 pasadas del contador), sin medir con la máquina libre. El careo sigue rojo: hay que redefinirlo o hacer que la ventana coordine lo mismo que la planta entera |
| (ii) C se reenuncia como «`optimal` ≥ `pairwiseLocal`» y se declara que la política de NCU puede superarlo | ninguna política cambia | un banco se RELAJA: su enunciado protegía otra cosa. «Energy-optimal» deja de ser la mejor de la casa. El careo sigue rojo por la misma razón |
| (iii) `pairwise` publicado vuelve a `pairwiseLocal`; la decisión por proyección sale como política NCU nueva | los dos contratos vuelven solos | es la opción (b) del defecto de la casa, más abajo: la decisión nueva deja de ser el defecto |

Con esto, #757 **no puede ponerse en verde sin una decisión**. Los pasos de la
refundación apilados sobre la fase A heredan los dos rojos.

## HALLAZGO · la etiqueta TCU/NCU es una restricción de información

**Qué pasó.** Al conectar `pairwise` al motor de proyección, la política pasa a
necesitar el θ REAL de todas las mesas emisoras. `decideProyeccion`
(`backtracking.html:2878`) retrocede JUNTAS la receptora y sus emisoras hasta
que el contador no ve sombra, y para eso evalúa la planta entera en cada vuelta
(`shadeBand3DAll(zen,az,T,A,{noStruct:true,noTerr:true,MV:MV,atrMesa:true})`).
Una TCU no puede saberlo: ve su encoder y lo que la NCU le manda, no el ángulo
de una mesa dos filas más allá.

- **Cómo salió.** El cruce con la telemetría real de Ayora
  (`tools/cruce_ncu_dia.mjs`) modela lo que hace el FIRMWARE de la TCU con sus
  registros. Con la `pairwise` nueva el veredicto pasó de «cero» (registros a
  cero) a «cfg»: 1 de 215 en `tools/test_backtracking_sim.mjs`.
- **Qué se cambió.** El cruce usa ahora `pairwiseLocal`
  (`backtracking.html:2859`, `return repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false),irr,doy,albedo);`
  y `tools/cruce_ncu_dia.mjs:316`, `cero: F.pairwiseLocal(g.zen, g.az, T0, irr, doy, 0.20),`).
  Con ella vuelve a votar «cero»: 215/215. El rojo con la `pairwise` nueva es el
  control negativo, y se vio antes del cambio.
- **Qué queda dicho:**
  - `pairwise` con el motor nuevo es una política de **NCU**, no de TCU;
  - `pairwiseLocal` es lo que una TCU puede ejecutar de verdad. En planta real
    `repairNoShade` no entra (`backtracking.html:3680`, `if(T.real)return ang;`),
    así que queda pvlib por pareja más el acople del propio motor;
  - `true3d` corre la misma suerte: su decisión también pasa por
    `decideProyeccion` y por `guardaEnergia`, que compara la POA de TODA la
    planta (`backtracking.html:2845`).

**EL NOMBRE CORRECTO DEL PROBLEMA (lo fija el titular): la decisión nueva no
necesita LEER la planta, necesita COORDINARLA.** Con el plan precargado
funciona mientras todos lo sigan. El día que una unidad no lo sigue, las demás
calculan contra un fantasma. Es exactamente lo que hace el proveedor de control
con sus tablas subidas a la NCU, así que la pregunta no es teórica: es la de su
modo degradado. La medida que separa (b) de (c) es el MODO DEGRADADO (abajo) y
va en su propio PR, después de este.

**Precisión que importa para las opciones.** En el simulador, el θ de las
emisoras que usa la decisión no es una lectura de encoder: es el que la propia
decisión les asigna. Una TCU que llevara precargado el modelo de toda la planta
podría recalcularlo, suponiendo que las demás obedecen. «El θ REAL» es la
condición de campo: decidir = medir solo se cumple fuera del simulador si las
demás están donde el plan dice, y eso solo lo sabe quien lee sus encoders.

### El defecto de la casa: opciones, con su coste. NO se elige aquí: es del titular

Hoy el defecto es `pairwise` (`on:true`, «canónica», `backtracking.html:4645`).
Tal como queda, **no es implementable en una TCU**.

| opción | qué se publica por defecto | coste |
|---|---|---|
| **(a)** `pairwise` = decisión por proyección, y su rótulo pasa a `ncu` | la fase A tal cual | Exige una NCU que lea el encoder de todas las mesas y pase 1-8 veces el contador de planta por instante; el tiempo no se ha medido con la máquina libre. En una planta solo con TCU, como la del cruce de Ayora, el defecto no se puede ejecutar, y el simulador deja de predecir lo que hace su firmware (el cruce ya usa `pairwiseLocal`). Gana lo medido en A.4. |
| **(b)** el defecto vuelve a `pairwiseLocal` (TCU); la decisión por proyección sale como política NUEVA de cerebro NCU | la fórmula de siempre | El defecto vuelve a decir «0 %» donde el contador ve sombra, así que A.3 (decidir = medir) deja de cumplirse en el defecto, salvo que esa sombra se DECLARE. Una política más en el catálogo, con sus bancos, su columna del anual y su sitio en la lista de caras. La ganancia de A.4 queda solo para plantas con NCU. |
| **(c)** `pairwise` = proyección ejecutada EN la TCU, con el modelo de planta precargado (o solo el de su alcance), suponiendo que las demás obedecen | la fase A tal cual | Memoria y cómputo embarcados: la geometría del alcance más 1-8 pasadas del contador por instante; coste en TCU DESCONOCIDO, no medido. Ciega a la realidad: con una vecina en fallo, en defensa, en manual o en banda muerta, lo decidido deja de ser lo medido en campo sin que nadie lo vea. Exige un protocolo de firmware que hoy no existe. |

### Lo que falta para decidir: el MODO DEGRADADO (siguiente PR, no este)

Encargado por el titular y ampliado antes de medirlo. Se mide con **DOS
arquitecturas**, porque la NCU sí puede calcular y repartir: es lo que hace el
proveedor de control en El Burgo.

- **(i) PLAN ABIERTO.** La NCU calcula una vez y reparte, y nadie relee. Es lo
  que se rompe cuando un seguidor no sigue el plan.
- **(ii) LAZO CERRADO.** La NCU lee el encoder de todos, recalcula con las
  posiciones REALES y vuelve a repartir en cada ciclo.

Para cada una, con UNA unidad fuera de plan (aparcada, en stow, con encoder
inválido):

- sombra real resultante en sus vecinas;
- cuántas unidades se ven afectadas por una sola que falle;
- lo mismo con `pairwiseLocal`, que no depende de nadie: es la referencia.

**Medida nueva, la que decide si (ii) es viable:** cuánto tarda la NCU en leer
a todas sus TCU y repartir, con el número real de unidades de Ayora y de San
José, y si eso cabe en el paso de control. Se usa lo que el repo sepa del
enlace de radio de las TCU. Lo que no sepa sale `NO DISPONIBLE`, con a quién
preguntar.

**Qué hace el sistema mientras el lazo no ha cerrado:** se declara, y el
fallback **nunca** puede ser el caso optimista.

Criterio del titular:

- si una unidad fuera de plan degrada a muchas, (c) es frágil y el defecto
  tiene que ser local;
- si el daño se queda en las contiguas, (c) es viable.

**La decisión del defecto la toma el titular con esa medida delante.**

### Las nueve, revisadas con ese criterio

Niveles de información:

- **L0**: el sol y la configuración propia.
- **L1**: registros estáticos de los vecinos (pendiente, paso, tilt del vano).
  Es lo que tiene una TCU; el cruce de Ayora careaba justo eso, registros «cero»
  frente a «cfg».
- **L2**: un cálculo conjunto sobre el modelo de TODA la planta (POA de planta,
  contador de todas las filas).
- **L3**: el θ real, en tiempo de ejecución, de otras mesas.

TCU = L0-L1. NCU = L2-L3.

| política | rótulo en main (hoy `:4630-4649`) | lo que consume su código | familia por información | ¿cambia? |
|---|---|---|---|---|
| `astro` | tcu | L0: `anglesAstro`, su tilt y su pendiente | TCU | no |
| `row` | tcu | L1: `anglesRow` (`:1236`), la media de sus dos vanos | TCU | no |
| `bt2d` | tcu | L0: `anglesBt2d` (`:2427`), sin pendiente | TCU | no |
| `global` | ncu | L1 de PLANTA: `anglesGlobal` (`:1247`) usa `meanPair(T)` (`:880`), tres escalares estáticos de la planta, y da un solo ángulo | TCU si esos tres escalares se cargan como registros | **sí, BAJA a TCU: corregido en este PR** (`:4642`). El `ncu` respondía a «un motor, un ángulo», no a la información |
| `pairwise` | tcu | ANTES, en planta real: L1 (pvlib por pareja con el gemelo estático, más el acople). En los presets ya era L2 desde v1.57: `repairNoShade` evalúa todas las filas y la POA de planta. AHORA: L2 en el simulador y L3 en campo (`decideProyeccion`) | NCU | **sí, SUBE a NCU** |
| `true3d` | tcu | igual que `pairwise`: su semilla `anglesTrue3d` (`:1293`) es L1, y la decisión y la guardia son L2/L3 | NCU | **sí, SUBE a NCU** |
| `mgl` | ncu | L2: `glSum` suma la luz al suelo de TODAS las unidades (`:2461`), más `repairNoShade` | NCU | no |
| `optimal` | ncu | L2: argmax de la POA neta de planta | NCU | no |
| `optfree` | ncu | L2: ascenso coordinado con vista de planta | NCU | no |

**Lectura.**

- Con el criterio de información cambian de familia **tres**: `pairwise` y
  `true3d` suben a NCU y `global` podría bajar a TCU.
- De la familia TCU quedan `astro`, `row`, `bt2d` y `pairwiseLocal`; esta
  última no está en el catálogo.
- El rótulo `tcu` de `pairwise` y `true3d` **ya era inexacto en los presets
  desde v1.57**, por `repairNoShade`, que evalúa la planta entera. Solo en
  planta real, donde esa reparación no entra, eran de TCU de verdad. **El rótulo
  llevaba tiempo mintiendo; no lo ha roto la fase A.**
- **Corregido en este PR: `global` pasa de `ncu` a `tcu`**
  (`backtracking.html:4642`). Su justificación va escrita junto a la lista de
  políticas (`:4631-4641`): tres escalares fijos de planta, `meanPair(T)`, y
  ninguna información de las vecinas. El documento de algoritmos, en su §3.3,
  dice lo mismo. `pairwise` y `true3d` NO se reetiquetan aquí: van con la
  decisión del defecto. En §3.5 y §3.6 llevan la nota «rótulo inexacto,
  pendiente del titular».
- **Efecto del cambio en la página.** Con el selector de cerebro en «TCU»,
  `global` deja de apagarse (`backtracking.html:8465`, `if(bs2.value==='tcu')POLICIES.forEach(P=>{if(P.brain==='ncu')P.on=false;});`).
  En los bancos: las de cerebro NCU pasan a ser, POR COINCIDENCIA, las mismas
  tres que las caras (`mgl`, `optimal`, `optfree`). El test nulo
  «la lista por coste no es la de cerebro NCU» dejaría de discriminar, así que
  ahora compara con los rótulos de `origin/main`, de cuando se cambió el
  criterio (`tools/test_caras_bajo_demanda.mjs`). Que el filtro de caras no
  pregunte por el cerebro lo sigue vigilando la comprobación siguiente del mismo
  banco.
- Si el rótulo pasa a ser una restricción, lo coherente es que un banco la haga
  cumplir. Eso ya es parte del Canon del BT (complemento, bloque 6).

## Las mesas residuales de A.4: ¿tope o iteraciones? — CERRADO por el titular — `audit5/A4_sonda_evitable.mjs`, `audit5/A4_nulo_rango.mjs`

Ayora, `pairwise` por mesa, 21-jun y 21-dic cada 30 min (48 instantes).
Salidas: `audit5/out/A4_sonda_evitable_{pairwise,true3d}.txt`,
`audit5/out/A4_nulo_rango.{txt,json}`.

**1 · No se quedaron sin iteraciones.**

- Las **647** unidades implicadas en sombra residual, sumadas sobre los 48
  instantes, están **todas en el tope** de su rango legítimo: 647 de 647.
- Ninguna decisión agotó el retroceso: `iter` máximo 11, con un tope de 80.
- Las 7 de las 5:00 UTC del 21-jun (sol 3,0°) son 7 unidades, y las 7 están en
  el tope.

**Resultado legítimo:** la política quiere retroceder más y el rango no se lo
permite.

**2 · Por qué SUBE la media de la sombra de planos:** bajan los casos y suben
los residuos.

- Mesas×instante con sombra > 1e-3: **1.342 → 1.450**. La subida entera está en
  dos instantes de sol rasante del 21-dic:
  - 07:30, sol 1,2°: 534 → 689;
  - 16:30, sol 2,0°: 639 → 746.

  En los otros 46 instantes bajan: 169 → 15.
- En esos dos instantes la decisión **vieja** tenía **1.080 y 1.072 de 1.600
  mesas FUERA del rango legítimo**, más allá del cono del haz
  (`AOI_HAZ=88`, `backtracking.html:950`). Quitaba sombra apuntando a donde ya
  no llega el haz, y eso no es ganar: la POA de planta es **la misma**, 0,4 →
  0,4 y 1,2 → 1,2 W/m². Es el mismo vicio que cerró v1.57.1 en
  `repairNoShade`.
- Energía de los 48 instantes: 14,2606 → 14,2611 kWh/m².
- **Dos instantes CUESTAN**: 09:00 y 15:00 del 21-dic, con −1,0 y −0,7 W/m².
  Es la ruta por mesa sin guardia de energía, ya declarada arriba.

**3 · TEST NULO: el rango ¿acota de verdad?** Las unidades implicadas se sacan
del rango: retroceden juntas d grados más allá del tope, sin pasar de
±`T.maxAngle`.

| instante (UTC) | sol | mesas con sombra | en el tope | +1° fuera | +2° | +5° | +10° | +40° |
|---|---|---|---|---|---|---|---|---|
| 21-jun 05:00 | 2,97° | **7** | 7 de 7 | **2** siguen | 3 | 7 (+1 nueva) | 7 (+16) | 7 (+31) |
| 21-jun 19:00 | 5,12° | 1 | 2 de 2 | **0** | 0 | 0 | 1 (+2) | 1 (+7) |
| 21-dic 07:30 | 1,18° | 689 | 317 de 317 | 484 | 436 (+12) | 660 (+215) | 689 (+544) | 689 (+648) |
| 21-dic 08:00 | 5,76° | 6 | 4 de 4 | 5 | 3 | 6 | 6 (+3) | 6 (+12) |
| 21-dic 16:00 | 6,59° | 1 | 1 de 1 | **0** | 0 | 0 | 1 | 1 (+4) |
| 21-dic 16:30 | 2,00° | 746 | 316 de 316 | 487 | 402 (+6) | 713 (+233) | 746 (+496) | 746 (+583) |

**Lectura.**

- **El rango acota.** Un θ 1-2° fuera del rango arregla parte de lo residual:
  - de las 7 del 21-jun a las 5:00, 5 se arreglan y **2 siguen**;
  - la del 21-jun 19:00 y la del 21-dic 16:00 se arreglan enteras.

  Por eso la decisión no llega a 0: el rango se lo impide, y eso es lo que se
  quería.
- **Lo que sigue ni fuera del rango** es irreducible por geometría, **dentro de
  esta familia de pruebas**:
  - 2 mesas a las 5:00 del 21-jun;
  - 3 a las 08:00 del 21-dic;
  - unas 400-490 en cada instante de sol < 2,1°.

  Pasado el tope, la pala se inclina hacia el otro lado y crea sombra nueva.
  El empuje es UNIFORME; una combinación no uniforme no se ha probado. Por eso
  se llaman **irreducibles de la prueba, no demostrados**: solo se probó un
  empuje uniforme.
- **Los 30 de Ayora.** No se pueden sumar a esta lista:
  - la lista congelada de «los 30 irreducibles» no está en ningún archivo del
    repo; se buscó con `git grep irreducib` en todas las ramas remotas;
  - aquellos eran EXTREMOS de fila con sombra > 1 mm, medidos con el motor;
    estos son MESAS del contador con fracción > 1e-3;
  - sin la lista, el cruce entre las dos queda **NO MEDIDO**. Es lo correcto,
    lo confirma el titular: listas de métricas distintas no se cruzan.

## A.3 · Decidir = medir — `tools/test_decide_mide.mjs`

| comprobación | resultado |
|---|---|
| 1-2 · presets (llano, ondulado bifila, senoidal con torsión) × 5 soles, `pairwise` y `true3d` | lo que ve el que decide = lo que cuenta el contador, bit a bit; ninguna mesa con sombra evitable sin declarar (23 decisiones sin sombra salvo lo irreducible; 7 en que la guardia publicó la fórmula, marcada) |
| 1-2 · Ayora real, 79 líneas, por mesa, 5 soles | igual, bit a bit; 0 irreducibles |
| 3 · **control negativo**: la decisión vieja (vecindad y gemelo) | **suspende** la 2: publica sombra que el contador ve en 2 de 5 instantes (4 y 3 mesas) |
| 4 · las otras 7 políticas y el contador por defecto | **bit a bit** iguales a `origin/main` (105 + 20 comparaciones) |
| 5 · test nulo de la 4 | `pairwise` sí difiere de main en 4 de 5 instantes: la comparación mira |

## A.4 · Efecto medido — `audit5/A4_efecto.mjs`

ANTES = la física de `origin/main` (v1.78.1). DESPUÉS = esta rama (v1.80.0).
Las dos consignas se miden con el mismo contador, que por defecto es bit a bit
el de main. Se mide la consigna, **sin lazo ni giro**, igual antes y después.
Las cifras de «error» son mesas×instante (o unidades×instante) y, en el anual,
van ponderadas por los días del mes.

- **Sombra de planos**: la del contador sin terreno, media de mesa ponderada
  por largo. Se parte en:
  - **irreducible**: mesas cuya unidad y todas sus emisoras están en el tope
    del rango legítimo; nada puede retroceder más;
  - **evitable de verdad**: el resto.
- **Fuera del haz**: mesas×instante con θ fuera de su rango legítimo. A sol
  rasante, quitar sombra así no es ganar.
- **Error «no»**, el 631 de la fase 0 pasado a la decisión: mesas×instante con
  sombra de planos > 1e-3 que la política no declara. «Declarada» se
  COMPRUEBA sobre los ángulos: la unidad y todas sus emisoras en el tope, o la
  marca `aceptadaPorEnergia` de la guardia. No se lee del informe de la propia
  decisión (E-X1-A-5).
- **Error «sí»**, el 1.660: unidades retrocedidas desde su candidato que podrían
  volver a él sin sombra. Se mira 1 de cada 3 pasos.

Salidas: `audit5/out/A4_efecto_{senoidal,ayora}_{dia,anual}.{txt,json}`. En las
cuatro corridas la máquina estaba OCUPADA (carga 8-9 en 4 núcleos): no hay
medida de tiempo.

### Preset senoidal (8 filas, N-S ±3°, pendiente 5°, monofila: ruta por línea con guardia)

| | energía | sombra de planos | irreducible | evitable de verdad | fuera del haz | error «no» | error «sí» |
|---|---|---|---|---|---|---|---|
| `pairwise` · día (21-jun y 21-dic, cada 10 min) | 11,8790 → 11,8794 kWh/m² (**+0,003 %**) | 1,5003 → 1,4988 % | 1,0159 → 1,0871 | 0,4843 → 0,4118 | 2 → 2 | 433 → **0** | 0 → 0 |
| `true3d` · día | 11,8019 → 11,8019 (**0,000 %**) | 2,0427 → 2,0413 % | 0,4270 → 0,4981 | 1,6157 → 1,5431 | 2 → 2 | 302 → **0** | 0 → 0 |
| `pairwise` · anual (21 de cada mes, ponderado) | 2.226,2820 → 2.226,3079 kWh/m² (**+0,001 %**) | 1,4893 → 1,4887 % | 1,0763 → 1,1346 | 0,4131 → 0,3541 | 62 → 62 | 79.961 → **0** | 0 → 0 |
| `true3d` · anual | 2.214,3336 → 2.214,3336 (**0,000 %**) | 2,1647 → 2,1641 % | 0,4200 → 0,4783 | 1,7447 → 1,6858 | 62 → 62 | 55.802 → **0** | 0 → 0 |
| `astro` (TEST NULO), día y anual | Δ **0** exacto | = | 0 → 0 | = | 0 → 0 | — | — |

**Lectura.** En la ruta por línea el efecto es de **declaración**, no de energía.
Donde evitar la sombra cuesta más de lo que vale, la guardia publica lo de
siempre y lo MARCA. El error «no» cae a 0 porque la política ya no dice «0 %»
donde el contador ve sombra. La «evitable de verdad» que queda (0,35-1,69 %) es
la aceptada por energía: la guardia la marca, así que está declarada, pero una
consigna podría quitarla.

### Ayora real (banda de la página, 79 líneas, 1.600 mesas; `pairwise` por mesa SIN guardia, `true3d` por línea CON guardia)

| | energía | sombra de planos | irreducible | evitable de verdad | fuera del haz | publicada | error «no» | error «sí» |
|---|---|---|---|---|---|---|---|---|
| `pairwise` · día (21-jun y 21-dic, cada 10 min) | 14,2650 → 14,2659 kWh/m² (**+0,006 %**) | 0,3138 → 0,5492 % | 0,0000 → 0,5464 | 0,3138 → **0,0028** | 4.964 → **0** | 1,0642 → 1,1248 % | 3.079 → **0** | 1.215 → **91** (de 5.475 → 3.949 mirados) |
| `true3d` · día | 11,9533 → 11,9533 (**−0,000 %**) | 0,5625 → 0,5773 % | 0,0001 → 0,5109 | 0,5624 → 0,0664 | 4.978 → 1.120 | 1,1466 → 1,1527 % | 4.541 → **0** | 0 → 0 (de 33 → 33) |
| `astro` (TEST NULO) | Δ **0** exacto | = | 0 → 0 | = | 0 → 0 | = | — | — |
| `pairwise` · anual (21 de cada mes, cada 20 min, ponderado por días) | 2.711,5112 → 2.711,7360 kWh/m² (**+0,008 %**) | 0,3918 → 0,6260 % | 0,0000 → 0,6232 | 0,3918 → **0,0029** | 382.812 → **0** | 0,9016 → 0,9814 % | 270.239 → **0** | 150.802 → **4.725** (de 521.122 → 381.168 mirados) |
| `true3d` · anual | 2.251,6537 → 2.251,6578 (**+0,000 %**) | 0,6438 → 0,6508 % | 0,0000 → 0,4513 | 0,6437 → 0,1995 | 453.214 → 214.260 | 1,0035 → 1,0066 % | 424.825 → **0** | 0 → 0 (de 2.924 → 2.954) |
| `astro` (TEST NULO), anual | 2.659,5102 → 2.659,5102 (Δ **0** exacto) | = | 0 → 0 | = | 0 → 0 | = | — | — |

Las cuentas del anual (mesas×instante, unidades×instante) van ponderadas por
los días de cada mes. El anual es cada 20 min y el día cada 10 min: sus cifras
no se suman entre sí.

**Lectura (día y anual: dicen lo mismo).**

- **`pairwise`:** la sombra que una consigna podía quitar desaparece (0,3138 →
  0,0028 %) y ya no se apunta fuera del haz (4.964 → 0). La media de la
  sombra de planos SUBE porque pasa a irreducible lo que antes se «quitaba»
  apuntando de espaldas al haz a sol rasante. Está medido y cerrado en «Las
  mesas residuales», abajo: POA idéntica en esos instantes.
- **El error «sí» no llega a 0.** Quedan 91 unidades×instante, de 3.949
  mirados, que podrían volver a su candidato sin sombra. El afinado a 0,1° de
  la decisión es parcial. Eso ya es optimizar: fase D.
- **`true3d` en planta real:** el efecto es de declaración, como en el preset
  (Δ energía 0). Las 1.120 mesas×instante que siguen fuera del haz son las de
  la **referencia que publica la guardia**, y se ha medido, no deducido.
  `audit5/A4_sonda_evitable.mjs --pol=true3d`, cada 30 min: después del cambio
  hay 76 mesas×instante fuera del haz, **las 76 en instantes aceptados por
  energía y 0 en instantes en que publica la decisión** (`fueraN_aceptada: 76`,
  `fueraN_decision: 0`, `audit5/out/A4_sonda_evitable_true3d.txt`). En planta
  real la referencia no se recorta, porque `repairNoShade` no entra
  (`backtracking.html:3680`). Salen marcadas `aceptadaPorEnergia`.

**Planta por defecto (8 filas, llano):** Δ = 0 exacto en energía, sombra y
errores. Se midió con la primera versión de la sonda; energía y sombra no
dependen de la cuenta del error «no», y sin sombra ese error es 0 con
cualquiera de las dos cuentas. En llano, pvlib ya es exacto y la decisión no tiene nada que corregir.

## Errores propios (E-X1)

- **E-X1-A-1.** Primera clasificación de «fuera de dominio» mezclaba receptores
  que la página ni simula con sombra perdida en mesas que sí simula. Lo cazó la
  lectura de la primera tabla; se separó antes de dar cifras.
- **E-X1-A-2.** Se repitió `path.join` con una ruta absoluta (ya registrado como
  E-X1-BT0-5): el `--json` fuera del repo se escribía dentro. Se cambió a
  `path.resolve`. La prueba lo cazó al primer intento.
- **E-X1-A-3.** El primer control negativo de la poda (alcance ×0,3) no
  controlaba nada: 0 mesas perdidas. Se endureció a ×0,3, ×0,1 y ×0,03, y se
  exige que alguno pierda.
- **E-X1-A-5.** El primer `A4_efecto.mjs` contaba como DECLARADAS
  `irreducibles×4` mesas: «una unidad irreducible, hasta 4 mesas». En la ruta
  por línea la unidad es una línea entera, así que se quedaba corta. Además
  leía el informe de la propia decisión en vez de comprobar los ángulos (el
  rastro no es la cosa). Lo destapó el error «no» de `true3d` en Ayora, 4.541 →
  2.058, que no casaba con lo que la decisión hace. La primera tabla de Ayora
  (día) no se publica. Ahora «declarada» se comprueba sobre los ángulos: la
  unidad y todas sus emisoras en el tope, o la marca `aceptadaPorEnergia`. Se
  repitieron las cuatro corridas.
- **E-X1-A-6.** Esperé al banco del simulador con
  `until ! pgrep -f "tools/test_backtracking_sim.mjs"`. La línea de comando del
  propio bucle contiene ese texto, así que `pgrep -f` se encontraba a sí mismo y
  la espera no iba a terminar nunca. Dos bucles así quedaron colgados; se vio
  en `ps` y se pararon por PID (10966 y 11103), comprobado después.
  **Pasó DESPUÉS de instalar la barrera contra el mismo defecto, y no porque el
  registro no sirviera: la barrera estaba INCOMPLETA.** Cubría la forma de
  MATAR y dejaba pasar ESPERAR (esta) y SEÑALAR (el `kill -STOP` sobre la
  salida de `pgrep -f` que pausó las medidas largas esa misma mañana). Una
  barrera que cubre una forma del defecto y no las demás da falsa seguridad,
  que es peor que no tenerla. Se amplió a la familia entera, con banco propio y
  control negativo: 17 formas bloqueadas, 8 legítimas que pasan, y la barrera
  vieja deja pasar 12. La regla y su detalle están en `audit_mancha/MANCHA.md`,
  «REGLA · Ampliación» (#753). **Regla:** esperar con `kill -0` sobre un PID
  leído antes y verificado después.
- **E-X1-A-4.** La primera coincidencia de la banda de la página se hizo con
  `lineX`, que es relativa al origen de cada carga, y solo casaba 1 línea. Se
  cambió a `lineXAbs`, con una aserción que exige que casen todas.
