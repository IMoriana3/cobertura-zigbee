# R3 · ABRIR Y CERRAR LOS DEFECTOS

Cuaderno de la tercera ronda. **El paquete R2 (`audit2/`) está SELLADO y no se
toca**: nada de lo que hay aquí se incorpora a él. Cuando algo de R3 corrija o
contradiga un ítem de R2, se anota aquí con puntero al ítem, y el ítem de R2 se
queda como está.

Reglas en vigor, las mismas de R2: prohibido opinar · `archivo:línea` + fragmento
en toda afirmación · test nulo antes de todo recuento · control negativo antes de
creerse una comprobación que pasa · ninguna cifra sin denominador y sin variante ·
`NO VERIFICADO` en vez de reconstrucciones · coste medido o declarado
desconocido, nunca extrapolado.

| fase | qué cierra | estado |
|---|---|---|
| **0** | mergear el paquete sellado a `main` | **HECHA** — PR #694 |
| **4.1** | el indicador «BT ON» que se encendía sin backtracking | **HECHA** — adelantada a petición del auditor |
| 1 | `policyAnglesSeg:2689` — medir ANTES de arreglar | pendiente |
| 2 | el anual por el lazo | pendiente |
| 3 | calibración y transposición | pendiente |
| 4.2 - 4.5 | texto, gate de CI, docs, señal | pendiente |

---

## 4.1 · EL INDICADOR «BT ON»

### Qué medía antes

`btActivoSerie` comparaba **posiciones**: la salida del lazo de la política
contra la salida del lazo de la referencia astronómica, con umbral 0,5°.

`a1bd80e:backtracking.html:7665-7671`
```js
function btActivoSerie(p,t){
  if(!DAY||!DAY.astroAng||!p)return false;
  if(DAY.sun[t].elev<=0)return false;
  const a=p.ang[t], ref=DAY.astroAng[t];
  for(let r=0;r<a.length;r++)if(Math.abs(a[r]-ref[r])>0.5)return true;
  return false;
}
```

Los dos lazos son independientes y cada uno tiene su memoria —posición anterior,
sentido de la marcha, destino enclavado—, y la banda muerta vale **1,0°**
(`a1bd80e:backtracking.html:3130`), el **doble** del umbral. Dentro de la banda el
motor no arranca, así que dos lazos alimentados con el mismo mando se quedan
parados en puntos distintos según su historia, y el indicador se encendía por esa
deriva.

### Qué mide ahora

**Mandos**: lo que cada política PIDE, antes del lazo, contra lo que pediría el
seguimiento astronómico, construido por **la misma maquinaria** —
`policyAngles('astro',…)` por línea y `segCmd('astro',…)` por mesa — para que el
acoplamiento de accionamiento sea idéntico a los dos lados.

### El antes y el después, sobre la MISMA corrida

`audit3/F41_indicador.mjs` calcula los dos predicados sobre los mismos arrays, así
que la comparación no depende de dos ejecuciones distintas. Salida cruda en
`audit3/out/F41_indicador.json`. Configuración: la de la captura que abrió el
hallazgo — lat 42,32059, lon −5,59981, UTC+2, alt 1563 m, pitch 7,00, cuerda
2,382, ±55°, 65 filas pedidas (24 de planta), azimut de eje 0, z0 0,17,
21-jun-2026, paso 5 min, **183 instantes diurnos**, 4 políticas encendidas.

**El instante de la captura:**

| magnitud | valor |
|---|---|
| hora · elevación | 14:00 · **70,46°** |
| sombra máxima de planta | **0,000000** |
| diferencia de **MANDO** frente al astronómico | **0,0000°** |
| diferencia de **POSICIÓN** tras los dos lazos | **1,2055°** |
| indicador **antes** | **encendido** |
| indicador **después** | **apagado** |

**El día entero, horas de backtracking por política** (denominador: 15 h 15 min de
sol sobre el horizonte en ese día y emplazamiento):

| política | antes | después | lo que sobraba |
|---|---|---|---|
| `pairwise` | 15,25 h | **3,83 h** | 11,42 h |
| `true3d`   | 15,25 h | **3,83 h** | 11,42 h |
| `optimal`  | 14,00 h | **2,58 h** | 11,42 h |
| `optfree`  | 14,17 h | **2,67 h** | 11,50 h |

Las 15,25 h de `pairwise` son **el día entero de sol**: el criterio viejo decía
que hubo backtracking en todos y cada uno de los instantes diurnos.

**Falsos positivos del criterio viejo**, con el filtro más exigente que se puede
poner —mando idéntico en todas las filas **y** sombra exactamente cero—:
**548 instantes-política de 549** discrepancias entre los dos criterios.

### Test nulo y controles

- **TEST NULO**, antes de cualquier recuento: los dos predicados toman los dos
  valores (`false/true`) en los 183 instantes diurnos. Si alguno fuera constante,
  el recuento no informaría de nada.
- **CONTROL del buscador**: llamado con el **mismo** predicado dos veces devuelve
  **0** discrepancias. Sin esto, las 549 podrían ser ruido del propio buscador.
- **CONTROL de identidad**: la política `astro` contra su propia referencia da
  `|Δmando| = 0,000000°` exacto — y no «casi cero», que es lo que se obtendría si
  las dos rutas no compartieran maquinaria.

  **Este control NO distingue el antes del después**: en posición también daba 0,
  porque el lazo de `astro` y el de la referencia reciben el mismo mando y arrancan
  con el mismo estado. Se deja escrito para que nadie lo lea como prueba del
  arreglo: lo que prueba el arreglo es la tabla de arriba.

### Qué banco lo protege

`tools/test_indicador_bt.mjs`, **12 comprobaciones**, en la matriz `navegador`.
Cinco sobre el fuente y siete sobre la página.

**Se ha comprobado que puede fallar.** Revertido el predicado a comparar
posiciones, el banco se pone rojo con **3 de 12**, y una de las tres es de
comportamiento, no de texto: `btActiveAt` vuelve a decir `true` a las 08:45 con el
mando idéntico y la sombra en cero.

```
mutación (predicado sobre posiciones)
  ✗ compara MANDOS: usa .cmd y astroCmd
  ✗ NO compara posiciones: ni .ang[ ni astroAng
  ✗ y la página ya NO se enciende en uno de ellos   08:45, sol 19.3° → btActiveAt=true
  9 OK · 3 FAIL
```

### Lo que este arreglo NO toca

La consigna, la sombra y la POA: no cambian. El defecto era de lo que la interfaz
**afirma**. Los tres consumidores del predicado —el semáforo `btflag`, las horas
ámbar de la barra de tiempo y las marcas verticales de G2 en el informe gráfico—
pasan a decir lo mismo porque todos llaman a la misma función.

Y **FÍSICA PURA no se toca**: bloque `backtracking.html:497-4138`, cortando por la
**última** aparición de `FIN-FÍSICA`, **12 hunks** en el diff, **0 dentro**. Con su
control: el trozo cortado mide 3 642 líneas y contiene `function poaPlant(`, así
que el corte no está midiendo una ventana vacía.

### Una decisión de colocación, dicha por si alguien la deshace

`BT_UMBRAL_DEG` está en la capa de interfaz, junto a su único consumidor, y **no**
junto a `DEADBAND_DEG` dentro de FÍSICA PURA. El indicador es una afirmación de la
pantalla, no una magnitud del modelo, y nada del cálculo lo lee. La primera
versión de este parche lo puso junto a `DEADBAND_DEG` y caía dentro del bloque.

### Corrige a R2 sin editarlo

`audit2/R3_NOTAS.md` §4 dejó el alcance en `NO VERIFICADO`: «no se ha medido
cuántas horas del día ni cuántas configuraciones lo levantan». **Ahora está
medido para un día y una configuración**: las 15,25 h de `pairwise` —el día entero
de sol—, y 548 de 549 discrepancias con mando idéntico y sombra cero. Cuántas
**configuraciones** lo levantan sigue `NO VERIFICADO`. `audit2/` no se edita.

### Dos comprobaciones del banco de física que se pusieron rojas sin defecto

Al guardar el mando crudo en el camino por mesa hubo que sacar `segCmd(...)` a
una variable, para no calcular la política **dos veces** en modo por mesa. Dos
comprobaciones distintas del banco de física exigían la anidación escrita
**literalmente**:

`a1bd80e:tools/test_backtracking_sim.mjs:711-712`
```js
  if (!/LZS\.paso\(segCmd\(/.test(app))
    throw new Error('el camino por mesa sigue sin el deadband');
```

y la lista de literales de `a1bd80e:tools/test_backtracking_sim.mjs:3079`, que
incluye `'LZS.paso(segCmd('`. Las dos se pusieron rojas sin que el código hiciera
nada distinto.

El comentario que acompaña a la segunda ya tenía escrita la lección, tres líneas
más arriba: *«los que se atan al NOMBRE de una función caducan cada vez que la
pieza mejora; el que se ata a lo que la pieza HACE, no»*. Estaba justo encima de
una comprobación atada a la sintaxis.

**Qué se hizo.** Una sola definición a nivel de módulo, `mandoPorMesaVieneDeSegCmd`,
que sigue el **dato**: el argumento de `LZS.paso` tiene que venir de `segCmd`,
inline o por una variable asignada en el mismo cuerpo. Los dos sitios la llaman.
Y `controlMandoPorMesa`, su **control negativo**, que sustituye el mando por otra
cosa y exige que el criterio lo rechace.

**No se afloja.** Antes se aceptaba una sola forma de escribirlo y la
comprobación no se verificaba a sí misma. Ahora se comprueba la procedencia del
dato y además se verifica. El banco del informe gráfico (59 comprobaciones) pasó
en verde sin tocarlo, con el mismo cambio de `serieDiaGen`.

---

## E-X1 · mis propios errores en esta ronda

**1 · Puse la constante del umbral dentro de FÍSICA PURA.** `BT_UMBRAL_DEG` quedó
junto a `DEADBAND_DEG`, en la línea ~3130, dentro del bloque 497-4138. Lo destapó
la comprobación de hunks, no yo. Corregido antes de commitear: la constante vive
ahora en la capa de interfaz. La comprobación existía porque en #689 falló una
equivalente por cortar por la **primera** aparición del marcador.

**2 · El control de la fase 1 medía otra cosa.** La primera versión de
`F1_seg_metrica.mjs` aplicaba la sustitución de tilts sólo a la geometría que
**puntúa** (`T`), no a la que **manda** (`Tcfg`) — y es `Tcfg` la que usa
`anglesPairwiseSeg` para decidir el θ de cada mesa. El control habría dado los
mismos ángulos con distinta puntuación, que no es «una planta sin torsión».
Corregido antes de ejecutarlo: la sustitución llega a las dos geometrías.

**3 · Di por cerrado el arreglo antes de pasar los bancos.** Conté aquí el antes
y el después del indicador mientras el banco de física seguía corriendo, y ese
banco trajo dos rojos. Eran suyos, no del arreglo, pero eso no lo sabía al
escribirlo. Es el mismo error que E-X1 de R2 registra: dar por buena una corrida
que aún no ha cerrado.

**4 · Mi propia comprobación no miraba nada, y su test nulo la cazó.** Al
reescribir la comprobación del camino por mesa la anclé en
`const LZS=crearLazoSeg()`. El fuente declara los dos lazos en una sola línea:

`backtracking.html:5091`
```js
  const LZ=crearLazo(), LZS=crearLazoSeg();
```

así que `indexOf` devolvía −1, el corte salía **vacío** y la comprobación habría
pasado sobre 0 caracteres. No la cazó una revisión: la cazó el **test nulo** que
había escrito una línea antes —«el corte mide 0 caracteres: no está mirando
nada»— y que puse ahí precisamente porque en #689 tres comprobaciones pasaron
sin poder fallar.

Corregido: el corte va de `function* serieDiaGen` a `dest.s={ang:ang`, mide
**2 287 caracteres** y contiene `crearLazoSeg` y `LZS.paso`. El test nulo exige
ahora las dos cosas, longitud **y** contenido, no sólo la longitud.
