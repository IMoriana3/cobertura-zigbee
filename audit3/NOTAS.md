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
| **2** | el anual por el lazo | **HECHA** — 2.1, 2.3, 2.4 y 2.5; 2.2 razonado con medida |
| **3** | calibración y transposición | **3.1 y 3.3 hechas** · 3.2 esperando decisión |
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

## FASE 2 · EL ANUAL POR EL LAZO — la medida del ANTES y el DESPUÉS

**Medida primero, cambio después.** Esto es el punto 2.4 del encargo: el antes y
el después por política. El motor **todavía no se toca**.

### El defecto, citado

`6408044:backtracking.html:7116-7135` — la ruta que llena la tabla de «Estimación
anual» llama a `policyAngles` y suma, **sin lazo**:

```js
    for(let m=0;m<1440;m+=10){
      const g=solarPos(localToUTCms(ds,m,c.tz),c.lat,c.lon);
      if(g.elev<=0)continue;
      const irr=clearskyIneichen(g.zen,doy,c.alt,c.tl);
      for(const P of POLICIES){
        if(!P.on)continue;
        const a=policyAngles(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
        tot[P.key]+=poaPlant(g.zen,g.az,T,a,irr,doy,c.albedo).plant*(10/60)/1000*DIM[mo];
      }
    }
```

Ni banda muerta ni velocidad de actuador: publica la consigna que la política
**pide**, no la que la planta **ejecuta**.

### Qué se ejecutó

`audit3/F2_anual_lazo.mjs`: calcula **las dos cifras en la misma pasada** —la de
hoy y la que saldría con el lazo entero—, usando `crearLazo()` **de la propia
página**, uno por política y por día («un lazo por cadena», la doctrina que el
cuerpo del día ya sigue). Salida cruda en `audit3/out/F2_anual_lazo.json`, diario
por meses en `audit3/out/F2_meses.jsonl`.

Configuración: **preset genérico de arranque**, 41,5763 / −0,7981, **8 filas**,
gcr **0,397**, accionamiento mono, 12 días representativos, paso **10 min**,
banda muerta 1,0°, slew 0,17 °/s. No es Ayora: allí **un solo día** tarda 6 min
33 s medidos y doce días serían otra E-D8.

### 2.4 · La deriva por política

| política | sin lazo (kWh/m²·año) | con lazo | deriva |
|---|---|---|---|
| `astro` | 2 553,17 | 2 553,41 | **+0,0095 %** |
| `global` · `row` · `bt2d` | 2 620,51 | 2 559,93 | **−2,3117 %** |
| `pairwise` · `true3d` · `mgl` | 2 620,51 | 2 559,93 | **−2,3118 %** |
| `optimal` | 2 632,23 | 2 586,23 | **−1,7474 %** |
| `optfree` | 2 634,18 | 2 588,94 | **−1,7177 %** |

`astro` **no se mueve**: no tiene de qué apartarse, así que la banda muerta no le
cuesta nada. Todas las demás la pagan.

### Lo que cambia no es la cifra: es lo que la cifra AFIRMA

| lo que se publica | sin lazo | con lazo | |
|---|---|---|---|
| lo que gana el backtracking (`pairwise`) frente al astronómico puro | **+2,638 %** | **+0,255 %** | **10,3× menos** |
| lo que gana `optfree` sobre `pairwise` | +0,522 % | **+1,133 %** | 2,2× más |
| lo que gana `optimal` sobre `pairwise` | +0,447 % | **+1,027 %** | 2,3× más |

El anual de hoy **infla diez veces el valor del backtracking** y **reduce a la
mitad el del control avanzado**.

### TEST NULO DEL ORDEN, y una cifra que estuve a punto de publicar mal

La primera versión de la sonda imprimió `elOrdenCambia: true`. **Es ruido.** Seis
políticas dan el **mismo** número —2 620,51 sin lazo y 2 559,93 con lazo— y lo que
el `sort` reordenaba eran empates:

```
empates sin lazo: [["global","row","bt2d","pairwise","true3d","mgl"]]
empates con lazo: [["global","row","bt2d","pairwise","true3d","mgl"]]
```

La sonda corregida agrupa por empate al 0,01 % antes de comparar puestos, y con
eso **ninguna política cambia de puesto**: `elOrdenCambia: false`.

Así que **la pregunta del orden sigue abierta**: en un preset llano de 8 filas
esas seis coinciden por construcción, y hace falta una configuración donde
difieran para responderla. `NO VERIFICADO`.

### 2.1 · Hecho: la ruta anual pasa por el lazo

`backtracking.html`, en el cuerpo de `$('yearbtn').onclick`: un `crearLazo()` por
política **y por día**, y lo que entra en `poaPlant` es la salida del lazo.

**Un lazo por cadena, y la cadena es el día.** Los doce días representativos no
son consecutivos —van del 21 de enero al 21 de diciembre—, así que arrastrar el
estado de uno al siguiente sería inventarse una historia. Es la misma doctrina
que sigue `serieDiaGen`, y el banco lo exige: los lazos se crean **dentro** del
bucle de meses.

**Comprobado en la página, no sólo en la sonda.** `audit3/F2_verifica_pagina.mjs`
pulsa «Calcular año» y lee la tabla publicada:

| | publicado | la sonda predijo |
|---|---|---|
| `pairwise` | 2 559,9 | 2 559,93 |
| `true3d` | 2 559,9 | 2 559,93 |
| `optimal` | 2 586,2 · **+1,03 %** | 2 586,23 · +1,027 % |
| `optfree` | 2 588,9 · **+1,13 %** | 2 588,94 · +1,133 % |

Antes del cambio esos deltas eran +0,447 % y +0,522 %.

Efecto colateral que conviene dejar dicho: la página lleva una **envolvente de
mercado** que compara con TrueCapture (2-6 % en lazo cerrado, 2,2 % medido por
B&V) y avisa si la ganancia estimada la supera. Con el anual sin lazo `optimal`
daba +0,447 %; con el lazo da **+1,03 %**. No se ha tocado esa envolvente.

### 2.3 · Hecho: el paso, una sola vez

El bucle iba a 10 min y el comentario que justificaba omitir el slew decía 20.
Ahora el paso es la constante `PASO_ANUAL_MIN = 10`, y el bucle, la ponderación
y el lazo la usan los tres — el banco lo exige, para que no vuelvan a separarse.

El párrafo del slew ya no justifica omitir nada: **a 10 min el tope de recorrido
son 102°**, más que el recorrido entero del tracker, así que el slew efectivamente
no muerde. Lo que muerde es la **banda muerta**, y ése era el hueco del
razonamiento anterior, no la cifra.

### 2.2 · Las dos rutas: cuál elijo y por qué

**Elijo que la página lleve el lazo en su propia ruta, y que `anual_motor.mjs`
siga siendo un instrumento aparte. No las unifico en una sola.** Y digo por qué,
con lo medido:

**1 · No pueden ser la misma ruta, por coste.** `anual_motor.mjs` declara en su
cabecera su propio precio: *«Cuesta ~10 min el año de pairwise y ~33 min el de
optimal»*, a paso de **1 minuto**. La tabla de la página lista **nueve**
políticas y se pulsa desde el navegador. Delegar en esa ruta sería cambiar una
tabla de segundos por uno de horas.

**2 · Y no miden lo mismo.** `anual_motor.mjs` existe para poner al lado los kWh
de string y los **Wh de motor**, y su propia cabecera explica por qué eso exige el
minuto: *«a paso horario el techo de velocidad del actuador son 612°, más que el
recorrido entero del tracker, así que la banda muerta se vuelve invisible y el
recorrido que se mide no es el que hace el tracker»*. La página no publica consumo
de motor.

**3 · Y hay una unificación más urgente que ésa, que NO hago aquí porque es
física y es decisión del auditor.** Persiguiendo este punto encontré que en la
casa hay **dos lazos de control distintos**:

| | dónde | quién lo usa |
|---|---|---|
| `crearLazo` | `backtracking.html:3233`, dentro de FÍSICA PURA | la página: día, informe y ahora el anual |
| `CTRLCORE.execTramo` | `js/control_core.js` | `produccion.html` y `tools/anual_motor.mjs` |

**Careados, no supuestos.** `audit3/F2_careo_lazos.mjs`, sin navegador, mismo
mando, mismo dt (10 min), misma banda (1,0°) y mismo slew (0,17 °/s), sobre una
rampa que sube, se mantiene e invierte —que es donde la banda muerta y la memoria
de sentido deciden—:

```
pasos careados: 100 · con diferencia: 99 · |Δ| máx: 1.995833 °
peor: {"paso":63,"cmd":37,"pag":36,"nuc":37.99583333333333,"d":1.99583333333333}
```

**99 de 100 pasos difieren, hasta 1,996° — dos bandas muertas.** No es redondeo.

Esto **no es nuevo del todo**: otra sesión ya reportó que el lazo de
`overcast.html` y el `apply_control_loop` del core discrepaban en **exactamente
una banda muerta**, con su medida. Lo que aquí se añade es que `backtracking.html`
tiene el mismo problema y con **el doble** de separación en el peor paso.

Cuál de los dos tiene razón depende de qué hace el TCU real cuando la consigna
cae dentro de la banda, y eso **no lo decide una medida de sobremesa**. Por eso se
anota y no se toca: `crearLazo` vive dentro de FÍSICA PURA y cambiarlo movería
todas las cifras del día, del informe y del anual a la vez.

**Lo que sí queda unificado con este cambio**, y no es poco: **el día y el año de
la página ya llevan el mismo lazo**. Hasta ahora la curva del día llevaba el lazo
entero y la tabla anual no, y las dos se enseñaban en la misma pantalla.

### 2.5 · El banco

`tools/test_anual_lazo.mjs`, **12 comprobaciones**, sin navegador, en el bloque de
node de CI. De fuente y de conducta, y cada mitad con su control:

- **test nulo del corte** antes de nada: un ancla que dejara de existir daría
  rebanada vacía y todo lo demás pasaría sin mirar;
- que lo que entra en el lazo es el **mando de la política** y lo que entra en
  `poaPlant` es la **salida del lazo** — siguiendo el dato, no el nombre de la
  variable;
- **CONTROL NEGATIVO**: sobre el código de antes —quitándole el `lim` y el
  `crearLazo`— el banco se pone rojo;
- que el paso es **una** constante con nombre y que el bucle, la ponderación y el
  lazo usan **la misma**;
- que **ningún comentario afirma un paso del anual distinto del que usa el
  código**, con su propio control de que el buscador de esas frases no está ciego;
- que los lazos se crean **dentro** del bucle de días.

**Y este banco me cazó a mí, dos veces.** La primera versión de la comprobación
del comentario prohibía *cualquier* «paso N min ⇒», y el que quedaba era el del
**día**, que sí es 5: rojo falso por banda demasiado ancha. La segunda vez me pilló
citando el «paso 20 min ⇒ 204°» viejo **dentro del comentario nuevo** para explicar
la corrección — y la comprobación, con razón, no distingue una cita de una
afirmación. La historia va al commit y aquí; el comentario del código dice lo que
**es**.

### FÍSICA PURA: dos hunks dentro, y qué son exactamente

Dentro del bloque caen **dos** cosas, y ninguna es física:

1. **El comentario del slew**, que el punto 2.3 manda corregir y que vive ahí.
2. **`const VER`**, la etiqueta de versión, que sube de `v1.70.0` a `v1.71.0`.

Comprobado con un diff del bloque **despojado de comentarios y de espacio**, no de
memoria. Cambia **una sola línea de código**:

```
-const VER='v1.70.0';
+const VER='v1.71.0';
```

**Corrección de lo que escribí primero**: antes de subir la versión afirmé que el
código del bloque quedaba idéntico carácter a carácter (90 971 en las dos). Con
`VER` dentro del bloque, esa afirmación ya no vale y se sustituye por ésta, que es
más precisa: una línea, y es la etiqueta.

El despojador lleva su control: cambiándole un número al bloque, lo detecta.

### Lo que esta medida NO dice

Ni que 2 559,93 sea la cifra correcta —lleva el lazo pero sigue siendo cielo claro,
12 días y paso 10 min— ni nada del punto **2.2**, la unificación de las dos rutas
anuales. Una planta, una configuración.

---

## FASE 3 · CALIBRACIÓN Y TRANSPOSICIÓN

### 3.1 · Las políticas que faltaban de la calibración

**El arnés está validado antes que ninguna cifra.** `pairwise` tenía que
reproducir los **2 313,44643430 kWh/m²·año** de E-A3 variante 1, y los reproduce
**dígito a dígito**:

```
PLENO · pairwise       2313.44643430 kWh/m²·año · 875 instantes · MV 8 · nb 2 · 637 s
```

Sin ese control, ninguno de los números de abajo sería publicable: el guion lleva
una copia CONGELADA del anual sin lazo y, si esa copia se hubiera desviado del
original, lo mediría todo mal en silencio.

**Lo medido** (`audit3/F3_calibracion.mjs`, Ayora real, anual PLENO de 12 días a
paso 10 min, **875 instantes**, MV 8, nb 2; salida en
`audit3/out/F3_calibracion.txt`, diario en `audit3/out/F3_calibracion.jsonl`):

| política | kWh/m²·año PLENO | coste |
|---|---|---|
| `astro` | **2 655,07172979** | 315,6 s |
| `global` | **2 664,35669996** | 298,2 s |
| `row` | **2 671,39751091** | 291,2 s |
| `bt2d` | **2 663,19199678** | 294,2 s |
| `pairwise` *(control)* | 2 313,44643430 | 637 s |
| **`mgl`** | **NO MEDIDA** | > 3 h, ver HUECOS R3 entrada 1 |

Con esto el orden de las nueve pasa de **`calibrada en 4 de 9`** a
**`calibrada en 8 de 9`**. No a «calibrada»: `mgl` falta y se dice.

### Lo que esta calibración NO corrige

**No corrige la cifra que la página enseña hoy.** El guion lleva congelado el
anual **sin lazo** —copia literal del manejador tal como estaba cuando se
midieron E-D2/E-D3— porque la calibración compara el diseño PLENO con el REDUCIDO
sobre la MISMA física, y las políticas ya calibradas se midieron así. Desde la
fase 2 la página publica su anual **con** lazo. Así que lo que aquí se completa es
el **orden de E-D3**, que es un artefacto de R2. Recalibrar las nueve sobre la
ruta nueva es otra corrida: `NO MEDIDO`.

**Y el coste de esa corrida tampoco se estima**, por lo aprendido en esta misma
fase: cuatro de las nueve son baratas (~292 s) y las otras cinco buscan; una tasa
medida sobre las baratas no cubre la clase de las caras.

---

## HUECOS R3 · entrada 1 · `mgl`, la política que no se calibró

**Decisión del auditor, opción B, con su motivo textual:**

> *«No es que `mgl` importe poco — eso es argumento, no medida. Es que la máquina
> bloqueada tiene un coste medido: sin ella no corre el control del arnés ni el
> banco del informe, y sin esas dos verificaciones NO se publica ninguno de los
> cinco números. Esperar a `mgl` no retrasa una cifra, retrasa cuatro y dos
> verificaciones. Precedente directo: E-D8, corrida sin señal intermedia y con
> estimador inservible, que acabó en 13 h 48 min y cero resultado.»*

### Qué falta, en una frase ejecutable

```
node audit3/F3_calibracion.mjs mgl 10
```

con el diario en `/tmp/claude-0/f3/calibracion.jsonl` o en `F3_DIARIO`: el anual
PLENO de Ayora real —12 días, paso 10 min, sin lazo, el diseño congelado de
E-D2/E-D3— para `mgl`, cuyo offset frente al diseño reducido es la calibración
que falta.

### Coste MEDIDO, y por qué se paró

| | |
|---|---|
| `mgl` al pararla | **> 3 h de CPU** (2 h 57 min al pasar la decisión, 103 % de un núcleo) |
| media de las otras cuatro | **≈ 292 s** (astro 315,6 · global 298,2 · row 291,2 · bt2d 294,2) |
| **factor** | **≈ 36, y subiendo** |
| señal intermedia | **ninguna** — un `evaluate` síncrono por política |
| reanudable | **no**: el diario guarda por política, y `mgl` no llegó a cerrar |

No se mató por juicio sobre su importancia. Se mató porque tenía la máquina y sin
máquina no había verificación posible.

### Qué cifra depende de ella

El **orden de las nueve políticas** de E-D3, que pasa a publicarse con la etiqueta
**`calibrada en 8 de 9`** — no «4 de 9», que era lo anterior, ni «calibrada» a
secas, que sería redondear un hueco hasta hacerlo desaparecer.

### Y el estimador falló en LAS DOS direcciones

Es el mismo defecto de siempre —**medir una parte y darla por el todo**— y aquí se
manifestó simétrico, que es lo que lo hace instructivo:

| estimación | qué predijo | qué salió | de qué extrapolaba |
|---|---|---|---|
| la del encargo | **4-5 h** para las cinco | **~292 s** cada una de las cuatro baratas | de las políticas **caras** (los optimizadores de E-D5, 11 397 s las tres) a las baratas |
| la mía, impresa por la propia sonda | **~5 min** para `mgl` | **> 3 h** y sin terminar | de las **baratas** ya medidas a una cara |

La sonda imprime «restante ~N s **MEDIDOS sobre k**», que es mejor que una
extrapolación a ciegas, pero **no basta**: una tasa medida sobre `k` casos sólo
vale si lo que queda se parece a esos `k`. Aquí no se parecía —`mgl` llama a
`repairNoShade` y busca, como los optimizadores— y la tasa mintió por un factor 36.

**Corrección de método, adoptada:** una estimación de coste sólo es publicable si
la muestra medida **cubre la clase** de lo que queda. Si no, se declara
**desconocido**. Vale para las estimaciones ajenas y para las propias.

Casos anteriores del mismo defecto, para no contarlo como nuevo:
`audit2/EVIDENCIA_BT_R2.md` E-X1 lo registra **tres veces** (4 h → 7,8 h → 14,6 h
para E-D8, siempre midiendo una parte), y esta ronda añade estas dos.

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

**7 · Publiqué que el orden de las políticas cambiaba, y era ruido.** La sonda de
la fase 2 ordenaba nueve valores de los que **seis eran idénticos** y anunciaba
`elOrdenCambia: true`. Lo que barajaba el `sort` eran empates. Lo vi al mirar la
tabla —seis filas con el mismo 2 620,51— y no porque la sonda lo dijera: no tenía
test nulo del orden. Ahora agrupa por empate al 0,01 % antes de comparar puestos y
publica los grupos, y con eso ninguna política cambia de puesto. Es el mismo
defecto que R2 registra ocho veces bajo `TESTS NULOS DETECTADOS`: contar sobre un
predicado que no discrimina en el dominio medido.

**8 · La misma sonda publicó `gcr: null` sin inmutarse.** Dividía por `T.pitch`,
que no existe. Un campo que no resuelve no se imprime con un `null`: se declara.
Ahora dice `NO DISPONIBLE` si no lo encuentra, y con el campo bueno da 0,397.

**9 · Mi propia comprobación del comentario del paso salió con banda demasiado
ancha, y después me cazó citando el error.** Prohibía *cualquier* «paso N min ⇒»
en el fuente, y el que quedaba era el del día, que es 5 y es correcto: rojo falso.
Reescrita para mirar sólo lo que se afirma del **anual**, con test nulo de que
acierta a alguna frase. Y en la segunda pasada me pilló reproduciendo el «paso 20
min ⇒ 204°» viejo dentro del comentario nuevo: una comprobación de fuente no
puede distinguir una cita de una afirmación, y tenía razón en pararme. La historia
va al commit y al cuaderno; el comentario dice lo que ES.

**10 · El careo de los dos lazos pasó sin comparar nada.** Leía `r.th` de un
objeto que devuelve `{theta,dir,park,dirUlt}`, así que el valor del núcleo salía
`NaN`, `NaN > 1e-9` era falso y el careo anunciaba «los dos lazos coinciden». Lo
vi porque imprimí también el `|Δ| máx`, que salía `NaN`. Ahora el guion lanza en
cuanto un valor no es finito, en vez de dejar pasar la comparación. Y había un
segundo error de planteamiento en el mismo careo: le pasaba al núcleo la
**posición** anterior donde espera la **consigna** anterior.

**11 · Dejé la versión atrás, y me paró el banco.** Escribí «v1.71» en los
comentarios del cambio del anual y dejé `VER` en `v1.70.0`. Es la misma
comprobación que cazó al PR #696 la misma noche, y existe para que la etiqueta de
la página y el sello del certificador no anuncien una versión que no lleva dentro
lo que dice. Y arrastró una segunda corrección: `VER` vive DENTRO de FÍSICA PURA,
así que mi afirmación de que el bloque quedaba idéntico carácter a carácter dejó
de ser cierta en cuanto la subí. Rectificada en el apartado de arriba con el diff
que la sustituye.

**12 · Tercer fallo de estimación de coste, mío, en la misma frase en que escribía
la corrección.** Al pasar la decisión sobre `mgl` dije que el control del arnés
«tarda lo que una política barata, ~5 min». `pairwise` tampoco es barata: llama a
`repairNoShade` y busca, como `mgl` y como los optimizadores. Las cuatro baratas
eran `astro`, `global`, `row` y `bt2d`. Al verlo pasar de los 10 min corregí en la
otra dirección —«puede irse a la hora»— y también fallé: costó **637 s**. Ninguna
de las dos fue una medida; la primera extrapolaba de la clase equivocada y la
segunda de un total ajeno (los 11 397 s que E-D5 costó con TRES políticas).

Lo que este caso añade a los otros dos: el defecto no se cura sabiéndolo. Lo
escribí mientras redactaba la regla que lo prohíbe. La regla, por tanto, no puede
ser «acuérdate»: tiene que ser **que la sonda declare la clase de lo que le queda
y calle si no la cubre**, que es lo que queda anotado para R4.
