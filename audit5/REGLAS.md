# Reglas de trabajo que salieron de errores

Cada regla nace de un fallo que pasó, y se enuncia por el MECANISMO, no por la
forma en que se vio la primera vez: así cubre la siguiente variante antes de
que exista. Las reglas del encargo (citar `archivo:línea` con fragmento, test
nulo, control negativo, denominador y variante, etc.) están en el encargo; aquí
van las que se han añadido por el camino.

## R-1 · Un banco verifica la ruta que la página EJECUTA, no la función que uno cree que ejecuta

**Enunciado.** Lo que un banco afirma sobre lo que la página PUBLICA se
comprueba sobre el código que la página llama para publicarlo. Se EXTRAE de
la página (se corta tal cual, como `audit5/lib_anual_pagina.mjs`), no se
importa la función del bloque de física que suena bien. Si la página tiene
varias rutas para lo mismo, el banco cubre todas, o la página se queda con una.

**Nació de:** refundación del BT, paso 3 (`audit5/REFUNDACION_P3.md`,
«HALLAZGO · el banco que comprueba lo que no se usa»).

- El cambio se hizo en `policyAnglesSegF` y la página publica por `segCmd`, así
  que no llegaba a lo publicado.
- El banco nuevo miraba `policyAnglesSeg` y lo habría dado por bueno.

**Antecedente del mismo mecanismo:** el sexto caso del registro del patrón.
`tools/test_anual_lazo.mjs` cortaba su fuente en el botón del año y no veía
`grAnualGen`, que publicaba otra cifra.

**Aplicada a los bancos que ya había** (`audit5/REFUNDACION_P3.md`, «Revisión
de los otros bancos»): salieron tres, `test_produccion` (B1), `test_veto_por_mesa`
(B2) y `test_backtracking_sim` (B3), y B1 destapó un defecto real en
`produccion.html` (θ de línea con mesas; +0,0333 % en el día bifacial de Ayora
con pairwise, idéntico con φ = 0).

**Cómo se comprueba que un banco la cumple:** con un control negativo que deje
la función importada igual y cambie solo la ruta de la página (o al revés). Si
el banco no se entera, comprueba lo que no se usa.

## R-2 · Prohibido seleccionar procesos por patrón de texto; solo por PID leído aparte y verificado

**Enunciado.** No se seleccionan procesos por texto para actuar sobre ellos o
esperarlos. Se leen los PIDs en OTRA orden (`ps -eo pid,args | grep …`), se
mira la lista, se actúa sobre PIDs numéricos y se verifica con `ps -p`. Se
espera con `while kill -0 <PID>; do sleep N; done`.

**Nació de:** cuatro veces el mismo mecanismo con otra sintaxis. Un patrón que
casa con líneas de órdenes casa también con la shell que lo lanza, y la mata,
la para o la cuelga. Las tres ampliaciones por forma dejaban la siguiente
fuera.

**Barrera:** `~/.claude/barreras/no_pkill_f.py`. Detecta el mecanismo: selector
por texto (`pgrep`, `pidof`, `ps` filtrado, `/proc/*/cmdline`) y a la vez
acción o espera (`kill`, `xargs`, bucle, `wait`); `pkill` y `killall` son las
dos cosas. Su banco (`test_barrera.py`):

- 27 formas bloqueadas, entre ellas 6 variantes que aún no habían pasado;
- 11 legítimas que pasan;
- contra la barrera de la mañana, 22 fallos.

Detalle en `audit_mancha/MANCHA.md` (REGLA, #753).

## R-3 · Un banco no puede ENCOGER en silencio

**Enunciado.** Cada banco tiene un piso: el número de comprobaciones que
publica, medido y escrito en `tools/con_piso.mjs`. Cuando ese número baja, el
CI cae. La salida correcta es devolver las comprobaciones, no bajar el piso.
Bajarlo solo vale con el motivo escrito al lado. Es la misma idea que fijar en
el workflow el número de configuraciones del barrido, aplicada a los bancos.

**Nació de:** la reescritura de `tools/test_anual_lazo.mjs` en el paso 2. Juntó
16 comprobaciones de fuente en una sola línea («FUENTE · cumplen todas»), así
que el banco publicaba 10 y su piso eran 12. «datos y física (node)» cayó en
#759 (a0e4ab9 lo corrige):

- las 16 vuelven a su línea;
- una comprobación más exige que se hayan ejecutado las 16;
- el piso sube a lo que el banco publica, 25.

Un banco que junta comprobaciones sigue en verde con menos vigilancia, y sin
piso nadie lo habría visto.

**Corolario: el piso SUBE con el banco.** Cuando un banco gana comprobaciones,
su piso sube en el mismo commit (trinquete). Si no, el margen entre lo que
publica y su piso es espacio para encoger sin que nadie se entere. En el paso 3,
`test_veto_por_mesa` pasa de 7 a 8 y `test_unidad_accionamiento` entra con 7.

**La lección, corregida con el dato: no hace falta que entre nada nuevo para
que un contador manual mienta. Basta con escribirlo.** El contador de la matriz
`navegador` (`MATRIZ_SIN_MEDIR = 36`) no se quedó atrás: entró en 242f3aa (#755)
cuando la matriz ya tenía **39 entradas (33 ficheros distintos)**. El 36 no
casa con ninguna de las dos cuentas: era falso el día que se escribió. Medido
reconstruyendo el workflow de aquel commit: 39 entradas entonces y 39 hoy.

**Tres capas del mismo defecto:**

1. **Un banco que puede encoger.** `test_anual_lazo` pasó de 12 comprobaciones
   a 10 sin avisar, y solo lo paró su piso.
2. **Un contador que lo vigila con un número falso.** El 36 de la matriz, contado a
   mano.
3. **Una guardia de ese contador que nadie ejecuta.** `con_piso.mjs --tabla`
   existía y NO corría en ningún paso del CI.

Es la tercera vez que aparece en este proyecto la idea de que el vigilante
necesita su propio vigilante:

- el banco de la barrera de órdenes salía 0 sin comprobar nada, porque el hook
  terminaba al importarlo;
- el piso de `test_caras_bajo_demanda` estaba escrito y ningún paso lo aplicaba
  («EL ÚNICO DE LOS 32 PISOS…», `bancos.yml`);
- y este contador.

**LA SALIDA: que el vigilante se incluya a sí mismo.** Añadir capas de
vigilancia no corta la recursión: cada una podría volver a no ejecutarse o a
contar a mano. La corta que la guardia viva en el CI como un banco más y se
someta a la regla que aplica (#760):

- el contador deja de ser un número escrito a mano y pasa a ser la LISTA de
  entradas;
- esa lista se carea con el workflow en los dos sentidos: un banco que corre
  sin piso, o una entrada sin registrar; un piso que ningún paso aplica, o una
  entrada registrada que ya no está;
- el careo corre en CI como banco (`tools/test_piso_careo.mjs`), con cinco
  mutantes que exige ver en rojo;
- **ese banco tiene su propio piso, y el careo exige que esté registrado:** sin
  su piso, la tabla sale roja (comprobado).

Un vigilante que no se cuenta a sí mismo puede dejar de ejecutarse en silencio,
como `--tabla`. Uno que se cuenta, no.

**Bancos SIN piso:** las 39 entradas de la matriz `navegador`, más las tres
exenciones con motivo (`test_nb_procedencia`, `test_dos_metricas`,
`test_meteo_csv`, que no publican recuento). Lo que publica hoy cada entrada va
en «Bancos sin piso» cuando termine la medida (EN CURSO).
