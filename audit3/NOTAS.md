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
| **4.1** | el indicador «BT ON» que se encendía sin backtracking | **HECHA** — PR #697 |
| **1** | `policyAnglesSeg` — medir ANTES de arreglar | **MEDIDA · PARADA** por la cláusula 1.3 |
| 2 | el anual por el lazo | pendiente |
| 3 | calibración y transposición | pendiente |
| 4.2 - 4.5 | texto, gate de CI, docs, señal | pendiente |

---

## FASE 0 · el paquete sellado, mergeado a `main`

**Qué se ejecutó.** Merge del PR #687 (`claude/backtracking-6th1im` → `main`),
commit de merge `a1bd80e`. Rama en `c948ed7`, `main` antes del merge en
`b7918b9`, base común `91a9a3b`.

**Antes de mergear.** `main` no había tocado `audit2/` en ningún momento desde la
base común — `git diff --name-only 91a9a3b origin/main -- audit2/` devuelve vacío
—, así que el merge no tenía por dónde alterar el paquete. Lo único que la rama
aporta fuera de `audit2/` es `ANATOMIA_BT.md`.

**Después del merge, comprobado y no supuesto.**

| comprobación | resultado |
|---|---|
| sha256 del árbol `audit2/` (97 ficheros, hash de la lista objeto+ruta) antes | `8f72a074e7f0e180…` |
| el mismo, en `main` tras el merge | `8f72a074e7f0e180…` — **idéntico** |
| `git diff origin/claude/backtracking-6th1im origin/main -- audit2/` | **vacío** |
| entradas del `MANIFEST.txt` verificadas | **92 de 92 casan**, 0 no casan |

El verificador es `audit3/verifica_manifiesto.mjs`, ejecutable tal cual. Lleva
**control negativo automático**: antes de dar por buena ninguna comprobación,
cambia un byte de la primera entrada en memoria y exige que el verificador la
marque como NO CASA; si el control no salta, sale con error en vez de publicar un
verde. En la corrida de esta fase el control saltó (`A1.txt` → DETECTADO).

### El defecto del sellado que declaré, y que NO se materializó

`audit2/R3_NOTAS.md` § 1 declara un defecto del propio sellado: la línea 43 del
`MANIFEST` sella `D2mv32.txt` con 1 294 bytes y su sha256, y esos 1 294 bytes son
sólo la cabecera — el productor (E-D8) seguía corriendo al sellar, y el hash
dejaría de casar en cuanto la corrida terminase.

**La corrida no terminó.** Murió con el reinicio del contenedor tras 13 h 48 min
de reloj sin haber escrito ninguna línea de resultado, así que el fichero nunca
cambió:

```
sha256  d43d273924ae64710898bd4c7725966121887537f41eaa47b50a01fb967c7bbc  out/D2mv32.txt
MANIFEST  D2mv32.txt   1294   d43d273924ae64710898bd4c7725966121887537f41eaa47b50a01fb967c7bbc
```

Lo que se anotó como defecto era **de método** —sellar un directorio con un
proceso escribiendo dentro— y sigue siéndolo; la **consecuencia** anunciada no se
produjo. Se deja dicho aquí, y `audit2/R3_NOTAS.md` no se edita.

### Lo que la fase 0 NO comprueba

Que el contenido del paquete sea correcto. Comprueba que es **el mismo**. Son
cosas distintas y el manifiesto sólo puede responder a la segunda.

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

## FASE 1 · LA MÉTRICA POR LÍNEA CONTRA LA MÉTRICA POR MESA

**MEDIDO, NO ARREGLADO.** La cláusula 1.3 del encargo dice: *«Si falla también
sin torsión, el problema es mayor: dilo y para.»* Falla también sin torsión. Este
apartado es la medida; el arreglo **no se ha hecho**.

### El defecto, citado

`b8396e9:backtracking.html:2758-2763`
```js
function policyAnglesSeg(key,zen,az,T,irr,doy,albedo){
  const drv=(T.segDrive&&T.segDrive.length)?T.segDrive:(T.segPairs||null);
  if(key==='astro')return applyDriveSeg(anglesAstroSeg(zen,az,T),drv);
  if(key==='pairwise'||key==null)return applyDriveSeg(anglesPairwiseSeg(zen,az,T),drv);
  return segsBroadcast(T,policyAngles(key,zen,az,T,irr,doy,albedo).angles);   // el resto sigue por línea
}
```

Sólo `astro` y `pairwise` tienen política **por mesa**. Las otras siete reciben el
ángulo de **línea** repartido a todas sus mesas. Y cuando la planta trae `segTilt`,
lo que la página puntúa es `poaPlantSeg` — **por mesa**.

### Qué se ejecutó

`audit3/F1_seg_metrica.mjs` sobre `570654f`, planta **Ayora real** (botón `⛰ Ayora
real`), 21-jun-2026, paso 10 min, **86 instantes** con `dni > 25`. Salida cruda en
`audit3/out/F1_seg_metrica.json`; el diario instante a instante, en
`audit3/out/F1_instantes.jsonl` (258 líneas = 86 × 3 geometrías).

Geometría: **79 líneas · 1 600 mesas · torsión en 1 600 de 1 600 mesas**, máximo
**3,7143°**.

### 1.2 · TEST NULO, antes de ningún recuento

| geometría | instantes donde las DOS métricas difieren | dif. máxima |
|---|---|---|
| **medida** (Ayora) | **86 de 86** | 2,1652 W/m² |
| **sinTorsion** | **29 de 86** | 2,1373 W/m² |
| tilt0 | 86 de 86 | 9,2949 W/m² |

En `sinTorsion` las métricas coinciden en 57 de los 86 instantes, así que los
recuentos de esa fila van sobre **29**, no sobre 86. Se dice aquí y no después.

### 1.1 · El recuento

| geometría | inversiones de orden | `optimal` pierde **por mesa** | `optimal` pierde **por línea** | Δ día por mesa | Δ día por línea |
|---|---|---|---|---|---|
| **medida** (Ayora real) | **65 de 86** | **58 de 86** | **0 de 86** | **−0,5103 %** | **+13,7221 %** |
| **sinTorsion** | 22 de 86 (**22 de 29** informativos) | **15 de 86** | **0 de 86** | **−0,3482 %** | +13,7221 % |
| tilt0 | 26 de 86 | 18 de 86 | 0 de 86 | −0,3060 % | +13,7221 % |

Denominador de los porcentajes: la POA del día de `pairwise` con **la misma
métrica con la que se resta**, integrada sobre los mismos instantes —
**67 337,7 W/m²** en la geometría medida.

**Por su propia métrica `optimal` no pierde nunca** (0 de 86 en las tres filas),
que es lo que tiene que pasar si el optimizador funciona. Por la métrica con la
que se le puntúa, pierde en **58 de 86** instantes y el día entero sale
**−0,5103 %**.

El peor instante es el mismo en las tres geometrías — **08:30**: `optimal` gana
**+136,16 W/m²** por línea y pierde **−63,53 W/m²** por mesa. Doscientos vatios
por metro cuadrado de diferencia según con qué regla se mire el mismo ángulo.

### 1.3 · EL CONTROL, y por qué obliga a parar

El control limpio es **`sinTorsion`**: cada mesa al tilt de SU línea, con todo lo
demás igual —cotas, solapes, parejas—, y con la sustitución aplicada a las **dos**
geometrías, la que puntúa y la que manda.

**Sin torsión sigue fallando**: `optimal` pierde por mesa en **15 de 86**
instantes y el día sale **−0,3482 %**. La torsión **agrava** el efecto —de 15 a 58
instantes, de −0,35 % a −0,51 %— pero **no lo causa**.

Por tanto la causa **no** queda acotada al reparto por línea con torsión, que es
lo que el encargo daba como hipótesis. Las dos métricas son **agregaciones
distintas** —`poaPlantSeg` pondera por largo de mesa dentro de la línea y luego
promedia líneas; `poaPlant` promedia filas sin ponderar— y `optimal` maximiza una
mientras la página publica la otra siempre que haya `segTilt`.

**`tilt0` no es un control limpio y no se usa como tal.** Poner todas las mesas a
0 no sólo quita la torsión: aleja el tilt de mesa del tilt de línea, así que
introduce un desajuste **distinto** entre las dos métricas — se ve en su test
nulo, que salta a 9,2949 W/m² frente a los 2,14 de los otros dos. Se publica su
fila por completitud y se declara confundida.

### Lo que NO dice esta medida

Ni que `optimal` sea peor que `pairwise`, ni al revés: dice que **el orden entre
las dos depende de con qué regla se mida**, y que la regla con la que se busca no
es la regla con la que se publica. Cuál de las dos es la buena es una decisión de
qué se quiere maximizar, y no la toma una medida.

Tampoco dice nada del año: es **un día**, el 21 de junio, en **una planta**.
`NO VERIFICADO` para el resto.

### Comparación con el hallazgo previo

La otra sesión reportó **−0,556 %** en Ayora real. Aquí sale **−0,5103 %**. No es
la misma cifra —ni la fecha ni el paso tienen por qué coincidir— pero es el mismo
signo y el mismo orden de magnitud. Lo que esa nota **no** tenía y ésta sí: el
control sin torsión, que es el que cambia la conclusión.

### El objeto se ha movido, y la medida sigue en pie

Entre la corrida y este PR, `main` ha pasado por **#695**, **#696** (el tope del
backtracking, `VER` a **v1.70.0**) y **#697** (la fase 4.1). Comprobado, no
supuesto: `policyAnglesSeg` **no se ha tocado** —`git diff b8396e9 origin/main --
backtracking.html` no devuelve nada sobre esa función— y la línea del reparto
sigue en `backtracking.html:2762`. La medida se tomó sobre `570654f`, que lleva
la 4.1 pero no el tope; lo que el tope cambia son las **salidas del lazo**, y esta
medida compara **POA de mandos evaluados con dos métricas**, no salidas de lazo.
`NO VERIFICADO` si el tope mueve las cifras: no se ha vuelto a correr.

### Coste

**2 613 s medidos** (43 min 33 s) para 258 instantes, 10,1 s por instante,
con la máquina compartida. No extrapolado: es el reloj de la corrida.

---

---

## HALLAZGO · el día con planta real tarda 6 min 33 s, y el tope del #696 le añadió 169 s

**No es una fase del encargo.** Salió persiguiendo otra cosa —una captura del
auditor con el corte 2D en blanco— y se anota aquí con su medida, sin tocar el PR
que lo causó.

### Qué se ejecutó

`audit3/F_coste_dia.mjs`, que cronometra **`computeDay()`** con Ayora real cargada
por el mismo botón que pulsa el usuario, **después** de que la carga termine y la
página esté quieta — así el número es el del cálculo y no el de la cola. Salida
cruda en `audit3/out/F_coste_dia.jsonl`.

| commit | qué lleva | ms | |
|---|---|---|---|
| `b8396e9` | antes del tope del backtracking | **224 222** | 3 min 44 s |
| `0a589c5` | `main` con el tope (#696) | **393 042** | 6 min 33 s |

**+168 820 ms · +75,3 %.** Mismo diseño en las dos: **79 líneas**, 288 instantes,
2 políticas encendidas, camino **por mesa** (`porMesa: true` en las dos salidas —
si fuera `false` no se estaría midiendo el caso caro, y el guion lo dice antes del
número).

### Qué lo explica, citado

El tope pregunta a `shadeRows` —el trazado 3D con el terreno— por **instante** y
por **rama**, y se llama **siempre**, haya o no retroceso de backtracking:
`0a589c5:backtracking.html`, en el cuerpo del día,
```js
      lim=topeBacktracking(g.zen,g.az,T,o.angles,LZ.paso(o.angles,STEP_MIN*60));
```
y su gemela por mesa `topeBacktrackingSeg(g.zen,g.az,T,segN,LZS.paso(segN,STEP_MIN*60))`.

### Qué NO dice

No dice que el tope esté mal: el #696 mide lo que **gana** —hasta +1,4 % de POA y
la sombra de `pairwise` en llano de 591 pasos·fila a 31— y esa medida no se
discute aquí. Dice lo que **cuesta**, que su PR no midió.

Tampoco dice que 6 min 33 s sea la causa de la captura del auditor. Durante ese
rato **el hilo principal está bloqueado** —comprobado de rebote: Playwright no
consigue estabilizar el lienzo para capturarlo mientras dura—, y una interfaz
congelada enseña lo que hubiera en el lienzo. Pero la imagen exacta **no se ha
reproducido**: con el día terminado, el corte 2D pinta el 100 % de sus píxeles
tanto en el preset genérico (5 707 colores) como en Ayora real (11 625 colores,
con sol, rayos y las 79 mesas). Explicación compatible, **no** causa demostrada:
`NO VERIFICADO`.

### Lo que abre

El oráculo sólo hace falta **donde el backtracking retrocede** —lo dice el propio
enunciado del tope— y hoy se llama en todos los instantes. Cuánto ahorraría
saltárselo donde no hay retroceso: **NO MEDIDO**.

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

**5 · Cambié de rama en el árbol donde estaba corriendo una medida.** Es «el
objeto se movió bajo los pies», y por mi propia mano — lo mismo que E-Z4 registra
en R2. Consecuencia comprobada: el proceso siguió escribiendo a un inodo marcado
`(deleted)` en `/proc`, así que su resultado se habría perdido al final. La física
medida **no** quedó contaminada (`git diff` entre los dos commits, vacío sobre
`backtracking.html` y `tools/`), pero eso fue suerte, no diseño. Corregido: las
medidas corren en su propio árbol y escriben fuera del repositorio.

**6 · Al resolver el merge con `main` borré el apartado 4.1 entero.** La
resolución de `audit3/NOTAS.md` se quedó con la tabla de fases y el lado de
`main`, y tiró las 165 líneas del apartado del indicador. Lo destapó comparar los
encabezados de los dos lados —`git show HEAD:… | grep '^## '` contra el de
`origin/main`—, no releer el resultado. Reconstruido desde los dos originales.

---

## LA COMPROBACIÓN QUE SE ROMPE SIEMPRE, Y VA POR CINCO

`tools/test_backtracking_sim.mjs` lleva desde hace tiempo escrita su propia
lección, en el comentario de uno de estos casos:

> *«los que se atan al NOMBRE de una función caducan cada vez que la pieza mejora;
> el que se ata a lo que la pieza HACE, no»*

El recuento, hasta hoy: tres veces por exigir la anidación literal
`LZS.paso(segCmd(`, y dos más —el mismo día, en el PR #696, en el commit que se
titula *«el CUARTO test por cadena que caduca al mejorar la pieza»*— por exigir el
**nombre de la variable** `segN`. La quinta se escribió dentro del arreglo de la
cuarta.

En este merge las dos comprobaciones pasan a atarse al **dato**: de dónde viene lo
que entra en el lazo y de dónde viene lo que entra en el tope, con **test nulo** del
corte y **control negativo**. Los nombres de **función** sí se pinchan —son la
interfaz de la pieza—; los de **variable local**, no.

Y no se afloja nada del #696: sus dos exigencias nuevas —que la rama por línea y
la rama por mesa pasen por el tope del backtracking— se conservan, generalizadas
al nombre de la variable, **y se añaden también al cuerpo del día**, donde su
versión sólo las pedía por literal.
