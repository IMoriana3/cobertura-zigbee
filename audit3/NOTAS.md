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
| **sinTorsion** | 22 de 86 (**22 de 29** informativos) | **15 de 86** (**15 de 29** informativos) | **0 de 86** | **−0,3482 %** | +13,7221 % |
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
instantes — y el denominador que informa ahí es **29, no 86**, porque en los
otros 57 las dos métricas coinciden y no pueden discrepar. O sea **15 de 29**, el
**51,7 %** de los instantes en que la pregunta tiene sentido. El día sale
**−0,3482 %**.

Se repite aquí el denominador y no se deja sólo en el test nulo a propósito:
«15 de 86» leído suelto da el **17,4 %** y es una proporción falsa. Tres veces
menor que la real.

La torsión **agrava** el efecto —de 15 a 58 instantes, de −0,35 % a −0,51 %—
pero **no lo causa**.

**EL ENUNCIADO DEL HALLAZGO, CORREGIDO POR ESTE CONTROL.** La hipótesis del
encargo era que el defecto vivía en el reparto por línea **con geometría
quebrada**. Es falsa. El defecto es que **el veto puntúa con una métrica distinta
de la que decide, SIEMPRE**, y la torsión sólo **amplía la brecha**. Sin el
control se habría publicado una causa acotada donde no lo está — que es
exactamente para lo que la cláusula 1.3 exigía el control. Las dos métricas son **agregaciones
distintas** —`poaPlantSeg` pondera por largo de mesa dentro de la línea y luego
promedia líneas; `poaPlant` promedia filas sin ponderar— y `optimal` maximiza una
mientras la página publica la otra siempre que haya `segTilt`.

**`tilt0` no es un control limpio y no se usa como tal.** Poner todas las mesas a
0 no sólo quita la torsión: aleja el tilt de mesa del tilt de línea, así que
introduce un desajuste **distinto** entre las dos métricas — se ve en su test
nulo, que salta a 9,2949 W/m² frente a los 2,14 de los otros dos. Se publica su
fila por completitud y se declara confundida.

### 1.4 · LA CAUSA, LOCALIZADA EN EL CÓDIGO Y CONTADA POR PROGRAMA

El recuento de arriba dice **qué** pasa. Esto dice **por qué**, y no es una
interpretación: es un recuento de llamadas.

> **Esto NO es una receta.** Que cambiar estas seis llamadas a `poaPlantSeg`
> arregle el defecto **es otra medida, y no está hecha**: `NO MEDIDO`. Y cuál de
> las dos métricas debe usar el optimizador no lo decide un recuento — es decidir
> qué se quiere maximizar. Va aquí arriba y no al final para que nadie lea la
> tabla como una lista de líneas que tocar.

`anglesOptimal` ocupa las líneas **2925-3071** de `backtracking.html` (147
líneas, commit `0a38ddc`). Dentro de ese cuerpo:

| línea | llamada |
|---|---|
| `backtracking.html:2946` | `const p=poaPlant(zen,az,T,ang,irr,doy,albedo).plant;` |
| `backtracking.html:2961` | `const p2=poaPlant(zen,az,T,ang2,irr,doy,albedo).plant;` |
| `backtracking.html:2975` | `best=poaPlant(zen,az,T,bestAng,irr,doy,albedo).plant;` |
| `backtracking.html:2987` | `const pP=poaPlant(zen,az,T,angP,irr,doy,albedo).plant;` |
| `backtracking.html:3045` | `let eBest=poaPlant(zen,az,T,bestAng,irr,doy,albedo).plant;` |
| `backtracking.html:3050` | `const e2=poaPlant(zen,az,T,ang2,irr,doy,albedo).plant;` |

**`poaPlant`: 6 llamadas. `poaPlantSeg`: 0.**

El recuento se hace **por programa**, no a ojo: se recorta el cuerpo entre
`function anglesOptimal(zen` y `function anglesOptimalFree(` y se cuentan las
apariciones de `\bpoaPlant\(` y `\bpoaPlantSeg\(`. Reproducible con

```
node -e 'const L=require("fs").readFileSync("backtracking.html","utf8").split("\n");
 const a=L.findIndex(l=>l.startsWith("function anglesOptimal(zen")),
       b=L.findIndex((l,i)=>i>a&&l.startsWith("function anglesOptimalFree("));
 let p=0,s=0; for(let i=a;i<b;i++){p+=(L[i].match(/\bpoaPlant\(/g)||[]).length;
 s+=(L[i].match(/\bpoaPlantSeg\(/g)||[]).length;} console.log(p,s);'
```

**Control del recorte:** el cuerpo mide **147 líneas**, no cero. Un recorte
vacío daría «0 y 0» y parecería confirmar cualquier cosa — es el fallo que este
cuaderno ya cometió dos veces (errores 4 y el de los controles sobre cadena
vacía), y por eso la longitud va publicada al lado del recuento.

**Qué explica, exactamente.** `optimal` busca su máximo con `poaPlant` —y con
ella lo encuentra: por eso **no pierde nunca por línea, 0 de 86**— y la página lo
puntúa con `poaPlantSeg` siempre que la planta traiga `segTilt`, que es el caso de
Ayora y de todas las reales. Es decir: **la regla con la que se busca no es la
regla con la que se publica**, y el 58 de 86 de la tabla 1.1 es la consecuencia
mecánica de estas seis líneas.

**Y se repite, porque es lo que más fácil se olvida:** el recuento localiza la
causa, no prescribe el arreglo. Ver arriba.

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

## FASE 4 · CERRAR LOS DEFECTOS DE PRESENTACIÓN Y DE PUERTA

### 4.3 · La puerta de CI daba rojo por cancelación

**Qué medía antes.** El gate `bancos en verde` corría con `if: always()` y exigía
`result == 'success'` de los cinco jobs. Con `concurrency: cancel-in-progress:
true` arriba, un empujón nuevo cancela la ejecución anterior — y un job
`cancelled` no es `success`, así que la puerta lo publicaba como **fallo**. El
rojo no decía «algo está mal», decía «alguien empujó otra vez».

**Cuánto de ese rojo era eso.** Sobre las **40 ejecuciones completadas más
recientes** del flujo: **30 `success` · 10 `cancelled` · 0 `failure`**. Es decir,
**las diez veces** que la puerta dio rojo en esa ventana fue por cancelación, y
**ninguna** por un banco roto. Un rojo que en el 100 % de los casos medidos
significa otra cosa deja de leerse.

**Qué mide ahora.** `if: always() && !cancelled()` (`bancos.yml:396`): la puerta
no se ejecuta cuando la corrida se cancela, y sigue ejecutándose cuando un job
falla — que es lo único que tiene que cazar.

**Qué lo protege.** Nada automático, y se dice: es una línea de YAML y no hay
banco que corra GitHub Actions en local. Lo que hay es el recuento medido escrito
al lado, en el comentario, con su fecha y su denominador.

**Y la objeción que había que descartar MIDIENDO, no razonando.** Otra sesión, en
el PR #702, midió en el runner de este repo que **un job cortado por
`timeout-minutes` concluye `cancelled`**, y por eso rechazó relajar el agregador:
un banco colgado y uno cancelado por un empujón posterior son indistinguibles en
`needs.<job>.result`. Su medida es correcta y mi cambio no es el suyo —el suyo
tocaba lo que la puerta ACEPTA, el mío cuándo la puerta CORRE— pero la pregunta
que abre es la buena: **¿se salta la puerta cuando un banco se cuelga?**

Experimento propio, rama desechable, un job con `timeout-minutes: 1` haciendo
`sleep 150`, un job sano y una puerta con exactamente mi condición. Del log
(`actions/runs/35437926102`):

```
lento.result = cancelled     ← cortado a los 72 s por su tope
sano.result  = success
LA PUERTA HA CORRIDO
```

**`cancelled()` es función del WORKFLOW**, y un job muerto por su propio tope no
la pone cierta. La puerta corre, lee `cancelled` y su `== success` la deja en
rojo. Lo que se salta es sólo la corrida que alguien canceló de verdad empujando
encima. El arreglo no abre el agujero contrario, y ahora eso está medido en vez
de argumentado.

**Lo que NO está resuelto:** el PR #702 también toca `bancos.yml`, así que los
dos cambios van a chocar cuando uno de los dos entre. No lo edito ni lo toco:
queda dicho aquí con puntero.

**Pendiente de mano ajena:** la rama `probe-cancelled-tope` del experimento
**no se pudo borrar** desde este contenedor —el proxy de git corta el push de
borrado, `the remote end hung up unexpectedly`— y sigue en el remoto. Lleva sólo
el fichero del experimento, no tiene PR y no dispara `bancos`. Hay que borrarla a
mano.

### 4.4 · El documento iba diecisiete versiones por detrás

**Qué medía antes.** `docs/algoritmos_backtracking.html` declaraba describir la
**v1.57.2**; `backtracking.html:531` iba por la **v1.74.0**. Diecisiete versiones.
**Ningún banco miraba `docs/`** — comprobado con `grep -rln algoritmos_backtracking
tools/ .github/`: cero aciertos. No había señal posible.

**Regenerar no es una operación que exista.** Son 81 kB de prosa escrita a mano,
con derivaciones, casos numéricos y el relato de cuatro vueltas de auditoría. No
sale del código. Decir que lo he regenerado sería inventarlo, así que **está
marcado**, que es la otra mitad del encargo.

**Qué afirmaba que hoy es falso, medido y no reconstruido:**

| afirmación del documento | medido hoy |
|---|---|
| «192 comprobaciones» (§6) | el banco da **211** |
| «*n*<sub>b</sub> = 2 por mesa» (§2) | desde la 3.3 sale de la ficha del módulo si la planta la trae — `backtracking.html:4416` |
| ruta anual (§5) | pasa por el lazo y su paso es de **10 min** — `backtracking.html:7313` |
| una sola métrica de POA | la planta publica **dos** — `backtracking.html:5256` y el ramal por mesa |

**Qué mide ahora.** El documento lleva sello legible por máquina
(`data-describe-ver`, `data-contrastado-con`, `data-contrastado-el`) y una banda
visible con la lista de arriba, cada punto con su `archivo:línea`. Y dice lo que
no sabe: **§3 y §4 no están reverificados contra la v1.74.0**; no se afirma que
estén mal, se afirma que no se ha comprobado.

**Qué lo protege.** `tools/test_doc_version.mjs` (11 comprobaciones, en CI). La
que importa es la 2: `data-contrastado-con` tiene que ser la `VER` de la página.
En cuanto `VER` se mueva, rojo.

**El coste de esa puerta, dicho y no escondido:** cada subida de `VER` obliga a
tocar el documento. Las dos salidas honradas son actualizarlo o volver a
contrastarlo anotando qué ha cambiado; la segunda cuesta **un minuto**. Está
puesto a propósito: el mecanismo que falló fue precisamente que nadie tenía que
mirar.

**Y lo que NO tiene:** no hay cláusula «...o que lleve el aviso puesto». El aviso
está puesto siempre, así que esa comprobación habría pasado sin poder fallar
nunca — que es el vicio que este cuaderno lleva cinco entradas persiguiendo.

### 4.5 · Las dos herramientas de campo, y el signo escrito dos veces

**La constante duplicada.** `TH_DISP = -1` —el signo con el que sale la consigna
que se manda al campo— vivía **dos veces** como dos constantes independientes:
`backtracking.html:4245` y `tools/export_consignas.mjs:177`, esta segunda
enterrada en `const ALT = 739, TL = 3.5, ALB = 0.20, TH_DISP = -1;`. Es
literalmente el vicio que el propio código tiene documentado en
`backtracking.html:521` para `VER`: «vivía DOS VECES y las dos se quedaron
atrás». **Qué mide ahora:** el exportador lo **lee** de la página por expresión
regular y revienta con motivo si no lo encuentra. **Qué lo protege:**
`tools/test_signo_unico.mjs` (7 comprobaciones, en CI), con control negativo que
se pone rojo si alguien vuelve a copiar el literal.

**Las dos herramientas no estaban en CI.** Y aquí está el hallazgo de la fase:
**ninguna de las dos llama a `process.exit`**. `careo_produccion.mjs` imprime
`veredicto: IDÉNTICOS` o su contrario y **sale 0 en los dos casos**. Meterlas en
`bancos.yml` como un `run:` pelado —que es lo obvio— habría sido verde
garantizado mientras el careo publica que las dos plantas discrepan: la **sexta**
comprobación que pasa sin poder fallar, y me la habría puesto yo mismo.

**Qué mide ahora.** `tools/test_herramientas_campo.mjs` (11 comprobaciones, en
CI) **no mira el código de salida**: lee lo que publican. Del exportador, que las
filas que anuncia son las que escribe, y que la versión que sella el CSV es la
`const VER` de la página. Del careo, `sin casar: 0`, `sol distinto entre páginas:
0`, peor |Δθ| y |ΔPOA| interiores **exactamente 0**, y el veredicto. Con control
negativo sobre una salida adulterada a `sin casar: 3` y `|Δθ| 4,2°`.

**Coste MEDIDO en esta máquina** (no extrapolado, que es donde llevo tres
fallos):

| guion | tiempo |
|---|---|
| `export_consignas --paso 5` (el de campo) | **280,6 s** |
| `export_consignas --paso 30` (el que corre en CI) | **50,3 s** / 48,6 s en el banco |
| `careo_produccion` | **105,0 s** / 95,5 s en el banco |

En CI van los dos: **144 s** medidos aquí. El job `datos` tiene el tope en 30 min
contra los **5 min 29 s** medidos en el runner, así que hay holgura — pero **el
factor del runner para esta clase de trabajo es desconocido** y no lo extrapolo
del ×5 medido para los bancos de navegador. Si no cabe, lo dirá la CI.

**Y la cifra de CI no es la publicable, dicho en el banco:** con paso 30 la
sombra media de planta sale **1,48 %** y con paso 5 sale **0,63 %**, porque el
lazo tiene seis veces más tiempo para alcanzar la consigna. Lo que se vigila en
CI es que las herramientas corren y que lo que publican cuadra, no el número.

## FASE 3.2 · EL DELTA ANUAL, Y POR QUÉ NO ES EL DEL DÍA

### Lo primero, porque cambia la pregunta

**La ruta anual de la página NO usa la métrica por mesa.** En el bucle anual,
`backtracking.html:7388`:

```js
tot[P.key]+=poaPlant(g.zen,g.az,T,lim,irr,doy,c.albedo).plant*(PASO_ANUAL_MIN/60)/1000*DIM[mo];
```

Es `poaPlant`, la de **línea**. Así que el delta A-vs-B **no existe hoy en el
anual publicado**: la agregación que cambia la 3.2 no interviene en él. Lo que
sigue mide lo que ese delta **sería** si el anual puntuara por mesa, y va
etiquetado **`HIPOTÉTICO`**.

### Qué se mantuvo fijo

El mando es **exactamente** el de la ruta anual de la página: `policyAngles` por
línea, pasado por `crearLazo()`, un lazo por política y por día, paso 10 min,
doce días representativos con su peso `DIM[mo]`. Lo único que cambia es cómo se
agrega el POA de las mesas. Cambiar también el mando habría medido dos cosas a la
vez.

### Resultado · Ayora, 12 días, paso 10 min

| política | anual A (kWh/m²) | anual B (kWh/m²) | B vs A | ¿retrocede? |
|---|---|---|---|---|
| `astro` | 2 653,204837 | 2 659,273739 | **+0,2287 %** | no |
| `row` | 2 670,928887 | 2 677,475253 | **+0,2451 %** | no |
| `optfree` | 2 690,060817 | 2 698,438189 | **+0,3114 %** | no |
| `global` | 2 664,911076 | 2 673,277961 | **+0,3140 %** | no |
| `bt2d` | 2 662,889516 | 2 671,534520 | **+0,3246 %** | no |
| `optimal` | 2 688,314455 | 2 697,616905 | **+0,3460 %** | no |
| `true3d` | 2 287,588537 | 2 239,490363 | **−2,1026 %** | **sí** |
| `pairwise` | 2 306,817752 | 2 253,628446 | **−2,3057 %** | **sí** |
| `mgl` | 2 340,216471 | 2 289,460732 | **−2,1688 %** | **sí** |

**`mgl`, COMPLETA.** Los doce meses, **−2,1688 %**, del lado negativo como las
otras dos que retroceden. Deja de ser `NO MEDIDA`. Sus doce meses, uno a uno:

| mes | delta | | mes | delta |
|---|---|---|---|---|
| enero | −1,9197 % | | julio | −2,2083 % |
| febrero | −2,1520 % | | agosto | −2,2455 % |
| marzo | −2,1961 % | | septiembre | −2,1671 % |
| abril | −2,1736 % | | octubre | −2,0952 % |
| mayo | −2,2328 % | | noviembre | −2,0351 % |
| junio | −2,2112 % | | diciembre | −1,9023 % |

**Ninguno cambia de signo**, y el rango entero cabe en **0,34 puntos** (−1,90 a
−2,25), con los extremos en los dos meses de sol más bajo. El corte por retroceso
queda cerrado con las nueve políticas: seis positivas entre +0,2287 % y
+0,3460 %, tres negativas entre −2,1026 % y −2,3057 %.

**Su coste, y por qué se publica como COTA y no como total.** Nueve de los doce
meses tienen tramo medible —mes a mes dentro de un mismo lanzamiento—:

```
7 499 · 7 341 · 7 355 · 7 518 · 7 718 · 7 396 · 7 508 · 8 188 · 8 481 s
suma de lo medido: 69 004 s = 19 h 10 min
```

Los otros tres abrieron lanzamiento y su tiempo **incluye el cálculo del día**,
así que no son comparables. **No se multiplica la media por doce**: lo que se
publica es la **suma de lo medido, como cota inferior**. Y se ve que el coste por
mes **no es constante** —de 7 341 a 8 481 s, un 16 % de recorrido—, que es
exactamente la razón por la que no se extrapoló en su momento.

**El recorrido de esta cifra es el ejemplo de la trampa, y queda escrito entero:**
primero publiqué «más de 57 min», luego «más de 91 min». Las dos veces era **el
reloj en el momento de escribirlo**, con el mes corriendo. De las dos saqué
totales —«más de 11 h», «más de 18 h»— que eran extrapolaciones de una cota
creciente. El primer mes acabó costando **7 974 s** y el total medido es
**19 h 10 min**. La cota de 18 h no era falsa; era una cota presentada como
estimación. Se declara `NO MEDIDA` con el mismo criterio que el auditor fijó
en la 3.1, y no se extrapola su total: su coste por instante ya se midió como **no
constante** (tramos a 28, 92 y 68,5 s en la sonda diaria).

### EL ANUAL Y EL DÍA NO SON COMPARABLES, y hay que decirlo antes que las cifras

Las dos tablas de esta fase **no miden lo mismo**, y ponerlas juntas sin esto
invitaría a restarlas:

| | el día | el anual |
|---|---|---|
| mando | **por mesa** (`policyAnglesSeg`) | **por línea** (`policyAngles`) |
| lazo de control | **no** | **sí**, uno por política y día |
| cuándo | 21 de junio | **doce** días representativos |

Con sol bajo es donde las dos agregaciones más se separan, y doce días pesan eso
mucho más que un solsticio de verano solo. Así que el cambio de signo y de orden
de magnitud entre las dos tablas **no es una contradicción: es que son dos
medidas distintas**, y la diferencia entre ellas no se ha desglosado —cuánto
viene del mando, cuánto del lazo y cuánto del calendario sigue **`NO MEDIDO`**.

### Lo que sí dice el anual

**1 · El corte es si la política RETROCEDE.** Las seis que no retroceden: entre
**+0,2287 % y +0,3460 %**. Las dos que sí: **−2,1026 %** y **−2,3057 %**. Limpio,
con signo opuesto entre los dos grupos y sin solape.

**2 · El peso paga del mismo orden que la granularidad.** `optimal` da
**+0,3460 %** contra el **+0,3524 %** de E-F2, que es el careo que el encargo
pedía. En el día el peso valía treinta y dos veces menos que la granularidad; en
el año, lo mismo. **Esto corrige la conclusión de la sección anterior.**

**3 · Y refuta la agrupación que salió del día.** Allí las dos que se salían eran
`true3d` y `mgl`, y se explicó por «buscar una forma». En el anual son `true3d` y
`pairwise`, y `pairwise` en el día era despreciable. La única que aguanta en las
dos medidas es `true3d`. **Por qué el retroceso invierte el signo: `NO MEDIDO`.**

**Salida cruda** en `audit3/out/F32_anual.json` y los 96 meses medidos en
`audit3/out/F32_anual_meses.jsonl`.

### Cómo se cita M-5 en el informe, acordado con el auditor

M-5 sube de «indicio dimensionado, un día» a **medido en el anual**. El ascenso
es legítimo **sólo con la limitación dentro de la frase que lo concede**, no en
la línea de al lado: una tabla de casillas se lee por la casilla, y quien la lea
así se llevaría la categoría sin la salvedad. La redacción que aguanta lo que el
dato da:

> **M-5 · medido en el anual, sobre un anual que la página no publica.** La ruta
> anual publicada puntúa con `poaPlant`, por línea (`backtracking.html:7388`), y
> por eso la sonda tuvo que **replicar su mando** para aislar la agregación. El
> corte por retroceso —seis políticas entre **+0,2287 %** y **+0,3460 %**, dos en
> **−2,1026 %** y **−2,3057 %**— está medido sobre esa réplica, no sobre lo que
> el simulador enseña hoy.

Así la casilla **arrastra su propia limitación** y no se puede citar más fuerte
de lo que aguanta.

**Y una advertencia sobre el recuento del expediente:** el ascenso de M-5 y el
refuerzo del hallazgo del anual sin lazo **salen de la MISMA medida**. No son dos
confirmaciones independientes, y contarlas como dos inflaría el expediente. La
sonda tuvo que replicar el mando de la página precisamente **porque** el anual no
pasa por la métrica por mesa: ese hecho es la premisa de una y el contenido de la
otra.

### Lo que este resultado NO autoriza

No autoriza a cambiar el anual para que puntúe por mesa. Eso movería una cifra
publicada entre **−2,3 % y +0,35 %** según la política, y es una decisión de
auditoría que no se ha tomado. Queda propuesto y medido, nada más.

## BLOQUEADO A PROPÓSITO · lo que NO se toca y por qué

No son cabos sueltos: son tres cosas que el auditor ha dejado paradas a
sabiendas. Cada una con lo que está medido y lo que falta para desbloquearla.

### El arreglo de la fase 1 (`policyAnglesSeg`)

Parado por su **cláusula 1.3**. `policyAnglesSeg` sólo tiene política por mesa
para `astro` y `pairwise`; las demás reparten el ángulo de LÍNEA a todas las
mesas y después se les puntúa por mesa. Está **medido** —`optimal` gana por línea
en 86 de 86 instantes y pierde por mesa en 58 de 86— y la causa mecánica está
localizada: el veto de `anglesOptimal` llama **seis veces** a `poaPlant` y
**ninguna** a `poaPlantSeg`. Lo que falta no es medida, es la decisión de cuál
métrica es la verdad de la planta.

### Los dos lazos de control que difieren hasta 1,996°

En la casa hay **dos** lazos independientes: `crearLazo` (dentro de la FÍSICA
PURA de `backtracking.html`) y `CTRLCORE.execTramo` (`js/control_core.js`, el que
usan produccion.html y `tools/anual_motor.mjs`). Careados paso a paso, difieren
hasta **1,996°**.

**No es decisión de auditoría cuál es el bueno**, y por eso queda declarado y no
arreglado: elegir uno cambia lo que se manda al campo. Lo que hay medido es la
diferencia; lo que falta es quién decide.

Junto a ello, el coste del tope de backtracking del #696: **169 s**, y lo que
abriría quitárselo donde no hay retroceso sigue `NO MEDIDO`.

### La rama `probe-cancelled-tope`

La del experimento del `cancelled()`. **No se pudo borrar desde este contenedor**
—el proxy de git corta el push de borrado: `the remote end hung up
unexpectedly`—. Lleva sólo el fichero del experimento, no tiene PR y no dispara
`bancos`. **Hay que borrarla a mano.**

## FASE 3.2 · LA PONDERACIÓN DE PLANTA, MEDIDA ANTES DE ELEGIR

### Qué se agregaba mal, y dónde

`poaPlantSeg` hace dos pasos y sólo el primero pondera:

1. dentro de cada línea, las mesas pesan por su **largo** (`acc/wt`, `backtracking.html:2786`)
2. entre líneas, **media sin ponderar** (`sum/n`, `backtracking.html:2792`)

El paso 2 es el mismo vicio que el paso 1 arregla, una capa más arriba: trata
igual una línea de 147,74 m y una de 1 185,51 m — un factor **8** en el dominio
medido, con líneas de **4 a 36 mesas**. Así que «ponderar por mesa» no estaba
hecho a nivel de planta, sólo dentro de cada línea.

### Las tres agregaciones, sobre el MISMO θ y el MISMO POA por mesa

Una sola llamada a `poaPlantSeg` devuelve `segs` —el POA de cada mesa— así que
cambiar el peso no vuelve a tocar la física. Lo único que cambia entre las tres
cifras es el peso:

- **A** · media sin ponderar de las medias de línea (lo que se publica hoy)
- **B** · todas las mesas de la planta, peso = **largo**
- **C** · todas las mesas de la planta, peso = **módulos** (`md` del levantamiento)

**Test nulo, antes de ningún recuento:** los tres pesos tienen que diferir en el
dominio medido. **385 largos distintos**, **3 valores de `md`** (14/21/28), líneas
de 4 a 36 mesas. Difieren, así que las cifras informan.

### Resultado · Ayora, 2026-06-21, paso 10 min, 86 instantes por política

| política | B vs A (día) | C vs B (día) | peor instante | instantes con \|Δ\| > 1 % |
|---|---|---|---|---|
| `astro` | −0,0363 % | −0,0002 % | −10,233 % (20:40, sol 8,58°) | 13/86 |
| `global` | −0,0258 % | 0,0000 % | −4,600 % (21:10, sol 3,45°) | 21/86 |
| `row` | −0,0205 % | −0,0000 % | −7,733 % (21:10) | 13/86 |
| `bt2d` | −0,0047 % | −0,0001 % | −3,636 % (21:10) | 18/86 |
| `pairwise` | **+0,0109 %** | −0,0001 % | −9,623 % (21:10) | 10/86 |
| `true3d` | **−2,0714 %** | +0,0028 % | −17,254 % (21:10) | **49/86** |
| `mgl` | **−2,1344 %** | +0,0030 % | −11,460 % (07:10, sol 4,62°) | **53/86** |
| `optimal` | **+0,0775 %** | −0,0003 % | −9,019 % (21:10) | 10/86 |
| `optfree` | **+0,0509 %** | −0,0003 % | −5,620 % (21:10) | 7/86 |

**Las nueve, completas.** Coste medido: **8 672 s** de instantes (2 h 25 min) más
**429,2 s** de cálculo del día. `mgl` sola se llevó unos 5 000 s, con un coste por
instante que **no es constante** —tramos medidos a 28, 92 y 68,5 s— razón por la
cual su total no se estimó, se midió.

**Cuidado con la columna «peor instante»**, que tiene dos lecturas y no son la
misma: aquí va el peor en términos **relativos**. La salida cruda de la sonda
elige el peor por diferencia **absoluta**, y da otros números (p. ej. `true3d`
−8,697 % en vez de −17,254 %). Los dos son ciertos y responden a preguntas
distintas; se publica el relativo porque la pregunta es cuánto puede desviarse la
cifra, no cuántos W/m² se mueven.

### Lo que dicen los números

**1 · La salvedad del encargo es real y vale ≤ 0,003 %.** El auditor dictó que se
escribiera junto a la cifra que «el largo no es el área cuando las mesas difieren
en número de módulos». Difieren de verdad —14, 21 y 28— y la diferencia entre
ponderar por largo y por módulos, en el día, va de **−0,0002 % a +0,0028 %**. La
salvedad deja de ser una precaución abstracta y pasa a ser una cifra: existe y no
mueve nada. **Ponderar por largo queda avalado por medida, no por argumento.**

**2 · La ponderación de planta casi no importa EN EL DÍA, salvo en dos
políticas.** Siete se mueven entre −0,036 % y +0,078 %. **`true3d` se mueve
−2,0714 % y `mgl` −2,1344 %**, unas treinta veces más.

> ⚠️ **La explicación que se dio aquí está REFUTADA por la medida anual de más
> abajo.** Se escribió que las dos que se salen «son las que buscan una FORMA en
> vez de maximizar energía». En el anual las que se salen son **`true3d` y
> `pairwise`** —y `pairwise` en el día vale **+0,0109 %**, despreciable—, así que
> esa agrupación no sobrevive. La única que se sale en las DOS medidas es
> `true3d`. La agrupación buena, la del anual, es otra: **si la política
> retrocede o no**. Se deja escrito el error en vez de borrarlo, porque el
> patrón es el de siempre: una explicación construida sobre una sola medida.

Y no es un instante raro. La última columna lo dice: la discrepancia pasa del 1 %
en **49 de 86** instantes para `true3d` y **53 de 86** para `mgl`, frente a 7–21
de las otras siete. Para esas dos políticas, las dos agregaciones discrepan más de
medio día; para el resto, son cuatro ratos sueltos que se compensan.

**3 · Y NO es lo mismo que el +0,3524 % de E-F2.** Aquel mide cambiar la
**granularidad de la física** —tilt de línea a tilt de mesa— en `pairwise`. Esto
mide cambiar el **peso de la agregación** dejando la física igual: **+0,0109 %**
en `pairwise` **en el día**, treinta y dos veces menor.

> ⚠️ **«La granularidad paga y el peso casi no» está CORREGIDO por la medida
> anual.** En el anual el peso paga **del mismo orden** que la granularidad:
> `optimal` da **+0,3460 %** contra el +0,3524 % de E-F2, casi idéntico. La frase
> valía para un día de junio y se publicó como si valiera en general. Un día no
> es un año, y el error fue tratar la conclusión de una medida como si fuera la
> conclusión del fenómeno.

**4 · Por instante sí importa siempre.** De −3,6 % a −17,3 %, y el peor caso de
cinco de las seis cae en el **mismo instante**: las 21:10 con el sol a **3,45°**.
A sol rasante la media sin ponderar y la ponderada se separan mucho; en el total
del día se compensa. Publicar sólo el día escondería eso, así que va la columna.

### El dato de módulos existe, y dónde se cae por el camino

El encargo daba por hecho que el área «no está en los datos». Medido:

- `ayora_cotas.json` trae `md` en **1 502 de 1 502 mesas, el 100 %** (14/21/28).
- `plantFromCotas` lo construye bien en `P.segMods` (`backtracking.html:1695`).
- **`terrain()` NO lo copia a `T`**: el literal de `backtracking.html:4443-4445`
  pasa `segs`, `segTilt`, `segPairs`, `segDrive`, `segZ`, `segSide` y `segMorro`,
  y **deja `segMods` fuera**.
- El dato **no se pierde**: sigue en `T.real`, porque esa misma rama guarda
  `real:P`. La sonda lo lee de ahí.

Es **un campo en un literal**, no un trabajo de fontanería. No se toca el código:
cuál es la ponderación buena es decisión de auditoría, y la decisión ya está
tomada a favor del largo — que además es la que los números avalan.

**Y el test nulo hizo aquí su trabajo por primera vez ANTES y no DESPUÉS.** La
primera corrida leía `T.segMods` y el test nulo saltó: «1600 mesas sin md: C no se
puede calcular entera». Paró la publicación de una columna hueca en vez de
publicar ceros. Las veces anteriores de esta ronda, un test nulo cazó el fallo
después de escrito; éste lo cazó antes de escribirlo.

## MÉTODO · CUANDO UN FALLO DEL INSTRUMENTO PRODUCE EL RESULTADO QUE ESPERAS

Dictada por el auditor a partir del control del recorte de la 1.4, y es la más
peligrosa de las que lleva este cuaderno, porque no se nota.

**El caso.** Para localizar la causa de la fase 1 hay que contar, dentro del
cuerpo de `anglesOptimal`, cuántas veces llama a `poaPlant` y cuántas a
`poaPlantSeg`. La tesis es «muchas y ninguna». El recuento se hace sobre un
recorte del fichero entre dos anclas de texto.

**Si el recorte sale vacío** —porque un ancla cambió de nombre, porque el
fichero se reordenó— el recuento da **«0 y 0»**. Y ahí está la trampa: **la mitad
que importa coincide con la tesis.** Cero llamadas a `poaPlantSeg` es
exactamente lo que se quería demostrar. Un revisor rápido lee el cero, le cuadra,
y sigue.

**La regla.** Cuando el modo de fallo del instrumento produce un resultado
**indistinguible del esperado**, o parcialmente compatible con él, el instrumento
necesita **su propio control**, independiente de la medida. Aquí: publicar la
**longitud del recorte** (147 líneas) junto al recuento. Un recorte roto mide
cero y se delata solo.

**Cómo se reconoce el caso.** Preguntarse: *si mi instrumento se rompiera del
modo más probable, ¿qué número daría?* Si la respuesta se parece al número que
espero, hace falta un control. Si daría algo absurdo —un `NaN`, un negativo, un
error— el propio resultado avisa y el control es menos urgente.

**Hermana de las anteriores, y no la misma.** El test nulo pregunta *¿puede esta
comprobación fallar?*; el control negativo, *¿falla cuando debe?*. Ésta pregunta
*¿el resultado que veo podría venir de que el instrumento no funcione?* — y es la
que faltaba en los errores 4 y en los dos controles negativos que pasaron sobre
una cadena vacía: en los tres, el instrumento roto **producía el verde**.

## MÉTODO · DIAGNOSTICAR POR ELIMINACIÓN CUANDO NO SE PUEDE OBSERVAR

Vale fuera de este repositorio, así que va escrito entero.

### El problema

`audit3/F32_anual.mjs` se murió **tres veces sin dejar nada**. Ni traza, ni
código de salida útil, ni línea en `stderr`. Un proceso que se va en silencio no
da por dónde empezar: no hay nada que leer, y la tentación es relanzarlo a ver si
esta vez sale — que es repetir el mismo experimento esperando otro resultado.

### Lo que se hizo, y por qué funcionó

**No se buscó la causa: se instrumentó para descartarlas todas.** Se pusieron
siete manejadores, uno por cada forma de morir que un proceso Node con navegador
*puede* notar:

| manejador | qué descartaría si callara |
|---|---|
| `pg.on('crash')` | caída del renderizador |
| `pg.on('close')` | cierre de la página |
| `browser.on('disconnected')` | el navegador se fue |
| `SIGTERM` · `SIGINT` · `SIGHUP` | alguien lo mató con una señal capturable |
| `uncaughtException` | error de programa |
| `unhandledRejection` | promesa sin `catch` |

más un **latido cada 60 s con el RSS**, que convierte «no hay salida nueva» —que
puede ser un proceso lento o un proceso muerto, y el fichero no los distingue— en
dos estados distinguibles.

La cuarta muerte **no disparó ninguno**, y el RSS estaba **plano en 135 MB** en
los tres últimos latidos, con 29 GB de disco libres.

**La instrumentación no dijo de qué murió. Dijo de qué NO murió, y eso bastó:**
descartadas todas las formas capturables, lo único que queda es una señal que no
se puede capturar — `SIGKILL`. Y el RSS plano descarta además la única causa
externa que habría sido cosa nuestra, la memoria.

### La condición que hace válido el argumento

**El conjunto de manejadores tiene que ser exhaustivo sobre lo capturable.** Si
falta uno, el silencio no prueba nada: prueba que no miramos ahí. El argumento
por eliminación es tan fuerte como completa sea la lista, y por eso la lista va
escrita arriba y no resumida — para que quien la lea pueda decir «te falta
éste».

### Y la confirmación, que es otra cosa

Descartar no confirma. La hipótesis —«el entorno siega los procesos desprendidos
cuando la sesión queda ociosa»— se confirmó por una variable **manipulable**: el
canal de lanzamiento.

| lanzamiento | resultado |
|---|---|
| desprendido (`nohup`, `setsid`) | **3 de 3 muertes**, todas a los pocos minutos de acabar el turno |
| como tarea del arnés | vivo **31 min** y pasando de largo el mes 4, donde las tres murieron; luego **más de 5 h sin una caída** |

**El mecanismo sigue `NO VERIFICADO`** y así se dice: no se puede ver quién manda
la señal desde dentro del contenedor. Lo que hay es una correlación de 4 de 4 con
una variable que se controla, y una regla operativa que funciona. Eso no es
saber la causa; es saber qué hacer.

### Un límite inferior que sigue creciendo no es una medida

Va aquí y no sólo junto a la cifra, porque es la trampa más fácil de pasar por
alto de las tres de esta tanda. La nota de `mgl` dijo primero «más de 57 minutos
en su primer mes» y después «más de 91». Ninguna de las dos era el coste del mes:
las dos eran **el reloj en el instante de escribirlas**, con el mes todavía
corriendo. Y de cada una saqué un total —«más de 11 h», «más de 18 h»— que era
una extrapolación de una cota creciente.

**El mes acabó costando 7 974 s: 2 h 13 min.** Ninguna de mis dos frases era
falsa, y las dos inducían a error, que es peor: un «más de X» sobre algo que no
ha terminado envejece **hacia arriba** mientras se lee, y se cita después como si
fuera el valor.

Si se publica, se publica **con el reloj al lado** —*más de 91 min medidos a las
06:20, sin terminar*— y se declara como **cota**, no como coste. Y el total de
doce meses **sigue sin saberse**, porque multiplicar el mes medido por doce sería
la misma extrapolación otra vez.

### LA CONTRAPRUEBA, que llegó sola y cierra el argumento

El argumento por eliminación tenía un punto débil que no se podía cerrar desde
dentro: **¿y si los manejadores simplemente no funcionaran?** Silencio y
manejadores rotos producen lo mismo.

Lo cerró el uso. A lo largo de la corrida completa de `mgl` —casi **20 h de
máquina**— el fichero de progreso acumuló **cinco** líneas `MUERTE`:

| línea | qué era |
|---|---|
| `MUERTE · recibida SIGTERM` | primer reinicio del contenedor |
| `MUERTE · recibida SIGTERM` | parada deliberada, para medir el coste del terreno con la máquina en silencio |
| `MUERTE · recibida SIGTERM` | segundo reinicio del contenedor |
| `MUERTE · la página se ha cerrado` | **cierre normal** al terminar |
| `MUERTE · el NAVEGADOR se ha desconectado` | **cierre normal** al terminar |

**Los manejadores funcionan.** Cazaron tres señales reales y dos cierres
ordenados. Luego los **tres silencios iniciales** —sin una sola línea, con el RSS
plano— no eran manejadores mudos: eran `SIGKILL`, que no se puede capturar. El
argumento queda cerrado por el lado que le faltaba.

**Y un matiz que las dos últimas líneas obligan a hacer, porque si no la
instrumentación engaña en la otra dirección:** `MUERTE` **no significa fallo**.
Dos de las cinco son el apagado normal del navegador al acabar bien. Lo que
informa no es que haya una línea, es **cuál**. Un contador de «cuántas MUERTE hay»
habría dicho que la corrida buena falló dos veces.

**Y lo que evitó perder las 20 h:** el diario vive **fuera del repositorio** y se
escribe mes a mes. Los dos reinicios del contenedor se llevaron el proceso y
**ninguna medida** — se reanudó desde el mes 4 y desde el 9. Esa decisión salió
del error 5, donde git se llevó el inodo de un fichero que un proceso estaba
escribiendo. Es la primera vez que esa lección paga, y pagó dos veces.

### La regla, para llevársela

1. Un proceso que muere en silencio **no se relanza igual**. Se instrumenta.
2. Se instrumenta **por eliminación**: un manejador por cada causa capturable, y
   la lista escrita **entera** para que se pueda auditar su completitud. El
   silencio de los manejadores sólo prueba algo si el conjunto es **exhaustivo
   sobre lo capturable**; si falta uno, el silencio prueba que no se miró ahí.
   Publicar la lista es lo que convierte la inferencia en **falsable**.
3. Un **latido** convierte «sin salida» en «vivo y lento» o «muerto».
4. Descartar lo capturable **acota** la causa; no la demuestra.
5. La confirmación viene de mover una variable que se controla y ver si el
   fenómeno la sigue.
6. Lo que no se ha visto se declara `NO VERIFICADO`, aunque la regla operativa ya
   funcione: **eso no es saber la causa, es saber qué hacer.**
7. Y un **límite inferior que sigue creciendo no es una medida**: se publica con
   su reloj, y como cota.

## DIAGNÓSTICO · POR QUÉ CUESTA EL TERRENO CON PENDIENTE N-S

**Sólo medido. No se ha tocado `mvPara`, ni `anglesPairwiseRaw`, ni
`anglesTrue3d`, ni ningún umbral.** Guion en `audit3/F5_coste_tilt.mjs`, salida
cruda en `audit3/out/F5_coste_tilt.json`, commit `8dc2115`.

Barrido de tilt N-S en 0,0 / 0,2 / 0,4 / 0,45 / 0,49 / 0,51 / 0,55 / 0,6 / 1,0 /
2,0 / 4,0°, todo lo demás idéntico: 8 filas, 29 instantes con DNI > 25, paso
30 min. **Dos presets, no uno** — el encargo pedía uno, pero el síntoma dice
«quebrado o constante da igual» y eso sólo se confirma o se refuta midiendo los
dos, y los tres guardas se reparten distinto entre ellos.

### TEST NULO, antes de interpretar

El tiempo total **sí varía**: de **673,7 ms** a **6 430,9 ms**, un factor **9,5**.
El experimento informa.

### CONTROL DEL INSTRUMENTO

Las iteraciones del bucle de reparación se cuentan con una **réplica** escrita en
la sonda, no tocando el original. La réplica lleva su control: su resultado tiene
que coincidir con `anglesPairwiseRaw` ángulo a ángulo. **Coincide en los 22
puntos × 29 instantes.** Una réplica desviada contaría las iteraciones de otro
bucle, y el recuento parecería igual de creíble.

### La tabla

| preset | tilt | ms | MV | atajo true3d | guarda repar. | iteraciones | agota el tope |
|---|---|---|---|---|---|---|---|
| constante | 0,0 | 811,9 | 17 | 7/7 | 0/29 | 0 | 0 |
| constante | 0,2 | 1 247,7 | 17 | 7/7 | 0/29 | 0 | 0 |
| constante | 0,4 | 1 209,7 | 17 | 7/7 | 0/29 | 0 | 0 |
| constante | 0,45 | 1 200,4 | 17 | 7/7 | 0/29 | 0 | 0 |
| constante | 0,49 | 1 262,1 | 17 | 7/7 | 0/29 | 0 | 0 |
| constante | **0,51** | 1 204,9 | 17 | **0/7** | 0/29 | 0 | 0 |
| constante | 0,55 | 1 187,8 | 17 | 0/7 | 0/29 | 0 | 0 |
| constante | 0,6 | 1 214,5 | 17 | 0/7 | 0/29 | 0 | 0 |
| constante | 1,0 | 1 207,3 | 17 | 0/7 | 0/29 | 0 | 0 |
| constante | 2,0 | 1 148,2 | 17 | 0/7 | 0/29 | 0 | 0 |
| constante | 4,0 | 1 197,2 | 17 | 0/7 | 0/29 | 0 | 0 |
| quebrado | 0,0 | 673,7 | 17 | 7/7 | 0/29 | 0 | 0 |
| quebrado | 0,2 | 731,0 | 17 | 7/7 | **29/29** | 29 | 0 |
| quebrado | **0,4** | 1 381,6 | **33** | 7/7 | 29/29 | 34 | 0 |
| quebrado | 0,45 | 1 557,1 | 33 | 7/7 | 29/29 | 34 | 0 |
| quebrado | 0,49 | 1 491,3 | 33 | 7/7 | 29/29 | 37 | 0 |
| quebrado | **0,51** | 1 544,9 | 33 | **1/7** | 29/29 | 37 | 0 |
| quebrado | 0,55 | 1 803,9 | 33 | 1/7 | 29/29 | 37 | 0 |
| quebrado | 0,6 | 1 828,9 | 33 | 1/7 | 29/29 | 37 | 0 |
| quebrado | 1,0 | 2 260,8 | 33 | 1/7 | 29/29 | 46 | 0 |
| quebrado | 2,0 | 3 582,2 | 33 | 1/7 | 29/29 | 111 | 0 |
| quebrado | 4,0 | 6 430,9 | 33 | 1/7 | 29/29 | **226** | 0 |

### LA RESPUESTA, Y NO ES LA HIPÓTESIS

**1 · El 71 % al 99,7 % del coste son TRES políticas.** `mgl`, `optimal` y
`optfree`, en **los 22 puntos del barrido**. Las cuatro baratas —`astro`,
`global`, `row`, `bt2d`— suman entre **0,0 y 0,7 ms** en todo el experimento.
`mgl` sola va de 457 a 1 569 ms.

**Si el usuario ve las nueve dibujadas, lo que está pagando no es el terreno: son
ellas.** Ésta es la respuesta a la pregunta 4 del encargo y, por tamaño, la
respuesta a la pregunta entera.

**2 · El guarda de `anglesTrue3d` se dispara donde se predijo y NO CUESTA NADA.**
El atajo pasa de 7/7 a 0/7 parejas entre 0,49 y 0,51 —exactamente en
`EPS_TILT`— y el tiempo **no salta**: constante −4,53 %, quebrado +3,59 %. Las
dos dentro del ruido del barrido. La hipótesis acierta el mecanismo y **falla en
que sea una causa del coste**.

**3 · El guarda de `mvPara` sí cuesta, y no salta en 0,5 sino donde de verdad
está su umbral.** En `quebrado` el tilt de filas vecinas se lleva **2·v**, así
que el umbral de torsión ≥ 0,5° se cruza en **v ≥ 0,25**: MV pasa de 17 a 33
entre 0,2 y 0,4, y el tiempo de 731 a 1 382 ms. **+651 ms de escalón.** Buscar el
salto en 0,49-0,51 lo habría dado por inexistente: estaba dos puntos antes.

**4 · El bucle de reparación se enciende por umbral pero CUESTA POR MAGNITUD.**
En `quebrado` el guarda está activo en 29 de 29 instantes desde 0,2°, pero sus
iteraciones crecen **29 → 34 → 37 → 46 → 111 → 226**. Eso no es insensible al
valor: es lo contrario.

**5 · En `constante` el bucle NO se enciende nunca**, y estaba predicho por el
código: `pairStations:1074` devuelve **una** estación cuando las filas vecinas
tienen el mismo tilt, así que `length>1` es falso siempre. Por eso `constante` y
`quebrado` **no** cuestan igual — 1 197 contra 6 431 ms a 4°, un factor **5,4**.

### Salto o gradual, con la proporción

| preset | escalón | gradual |
|---|---|---|
| **constante** | **+436 ms** de 0,0 a 0,2, y después **plano** (1 248 → 1 197, −50 ms) | **ninguno** |
| **quebrado** | **+651 ms** de 0,2 a 0,4 (el MV) · **11 %** | **+5 049 ms** de 0,4 a 4,0 · **89 %** |

**En `constante` es todo escalón, y está en CERO, no en 0,5.** El coste sube al
pasar de plano a no-plano y ahí se queda, insensible al valor — que es el síntoma
descrito. Pero el escalón **no lo produce ninguno de los tres guardas**: MV no se
mueve (17), el bucle no se enciende (0 iteraciones) y el atajo de `true3d` sigue
puesto (7/7) a 0,2. Lo que sube es **`mgl`**, de 531 a 969 ms. **Qué hace `mgl`
distinto al pasar de tilt 0 a tilt 0,2: `NO MEDIDO`.**

**En `quebrado` son las dos cosas, y el gradual domina 89 a 11.**

### Nadie agota el tope de 60

En los 22 puntos, **cero instantes** llegan al tope de iteraciones. El máximo
observado es 226 iteraciones repartidas en 29 instantes — una media de 7,8 sobre
un tope de 60. El tope **no está limitando nada** en este barrido.

### Lo que esta medida NO dice

- **No dice nada de Ayora ni de ninguna planta real:** son 8 filas sintéticas.
  Con 79 líneas y 1 600 mesas el reparto puede ser otro. `NO VERIFICADO`.
- **Un confundido declarado:** el primer punto del barrido (`constante` 0,0)
  muestra `pairwise` 17 ms y `true3d` 24 ms frente a 2-3 ms en el resto del
  preset. Huele a calentamiento del JIT, no a física. No se ha aislado repitiendo
  el punto, así que **la cifra de `constante` 0,0 se lee con reserva** — y da la
  casualidad de que es el punto contra el que se mide el escalón.
- **No propone arreglo.** El encargo era diagnosticar.

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

### Error 14 · el mismo `mkdir` que ya me había roto un lanzamiento

Lancé el cronometraje de las dos herramientas redirigiendo a `/tmp/claude-0/f4/`,
un directorio que no existía. La redirección murió antes de arrancar `node` y el
lanzamiento se perdió entero. **Ya me había pasado con `/tmp/claude-0/f2/` en
esta misma sesión.** Lo escribí como riesgo conocido en la nota de la sonda y aun
así lo repetí. La repetición es el dato: saber dónde está el agujero no basta si
lo que se hace a continuación no lo cierra — el `mkdir -p` va **en la misma
orden** que la redirección, no en la anterior.

### Error 15 · mi propia banda incumplió la regla que yo acababa de escribir

El banco 4.4 exige que toda cifra de «N comprobaciones» lleve su versión al lado,
porque «192 comprobaciones» estuvo publicado con el banco en 211. La primera
ejecución del banco dio **2 rojos**, y uno era **mi propio texto**: la banda de
desfase que acababa de escribir decía «va por 211 comprobaciones» sin versión.

Lo caza el banco, no yo, y eso es exactamente para lo que sirve — pero el patrón
tiene nombre y ya lleva repeticiones: **escribo la regla y la incumplo en la
misma tanda**. Es el hermano del error 9, donde el comentario nuevo del paso
anual citaba el «paso 20 min» viejo que la comprobación prohibía. La regla no se
cumple por haberla escrito.

### Error 18 · confundir el rastro con la cosa, en las dos direcciones el mismo día

> **Origen de M.6 · «el rastro no es la cosa».** El auditor eleva este error a
> regla del método, junto a M.1, M.4 y M.5, porque comparte con ellas la raíz:
> **una identidad supuesta entre lo que se observa y lo que se afirma.** Allí era
> medir una parte y darla por el todo; aquí es tomar la huella de un proceso —una
> línea de órdenes que lo menciona, un fichero que escribió— por el proceso
> mismo.

Es **un** error, no dos, y por eso va en una entrada: en los dos casos tomé un
**rastro** de un proceso por el **proceso** mismo.

**Dirección A · el rastro de más.** Usé `pkill -f F32_ponderacion` para parar una
sonda. El patrón casaba también con **mi propia línea de órdenes**, que contenía
esa cadena, así que maté el `python3` que estaba aplicando un parche a mitad. Más
tarde, `pgrep -f "wt-f32/audit3"` me dijo «sonda aún viva» cuando llevaba rato
terminada: lo que encontraba era, otra vez, mi propio intérprete. Estuve a punto
de no recoger un *worktree* por esa lectura falsa.

**Dirección B · el rastro de menos.** Leí `/tmp/claude-0/f32a/progreso.txt`, vi
las líneas de siempre y le dije al auditor que la sonda «arrancó bien y va por 4
de 108». Llevaba **27 minutos muerta**. Un fichero que no crece no distingue un
proceso lento de un proceso muerto, y yo no pregunté por el proceso.

**La misma confusión.** En A, un texto que casa con un patrón se tomó por un
proceso que existe. En B, un fichero que existe se tomó por un proceso que corre.
El rastro no es la cosa: la línea de órdenes que menciona un guion no es el guion
corriendo, y el fichero que un guion escribió no es el guion escribiendo.

**Lo que se hace en su lugar:** preguntar por el proceso, no por su rastro —
`ps -eo comm` filtrando por el ejecutable, o la CPU del renderizador cuando lo
que importa es si trabaja, que es la lección de E-D8—, y no usar nunca un patrón
que la propia orden contiene. Y el latido del apartado anterior existe justo para
esto: para que el rastro **sí** distinga los dos estados.


## LA REGLA DE NO EXTRAPOLAR EL COSTE, COBRADA POR PRIMERA VEZ

Las tres veces anteriores esta regla se aprendió **después** de fallar: el
encargo predijo 4-5 h para la calibración extrapolando de las políticas caras a
las baratas (salieron ~292 s), yo predije ~5 min para `mgl` extrapolando de las
baratas a una cara (pasó de 3 h), y lo repetí una tercera vez en la frase misma
en que escribía la corrección. **Ésta es la primera vez que evita un error ANTES
de cometerlo.**

Al meter las dos herramientas de campo en CI había un factor medido a mano: los
bancos de navegador tardan **×5** en el runner (`bancos.yml:22`, «aqui esos
mismos tardan ~5 min, o sea que el runner iba 5 veces mas lento»). Aplicarlo a
los 144 s medidos aquí habría dado **~12 min** de CI, que es la clase de cifra
con la que se descarta meter algo. Lo que escribí en su lugar fue que el factor
para esta clase de trabajo era **DESCONOCIDO**.

Medido en el runner, corrida 257: `test_herramientas_campo` tarda **109 s**
contra los **144 s** de aquí. El factor es **0,76×** — el runner es *más rápido*
para node sin navegador, no cinco veces más lento. La extrapolación no habría
fallado por poco: habría fallado **en la dirección contraria**, y por un factor
de 6,6 sobre lo real.

**Lo que la regla dice, ya con las cuatro veces:** un factor de coste sólo vale
dentro de la clase en que se midió. El ×5 es cierto — para bancos de navegador.
Aquí no había medida de node sin navegador, y lo correcto era decir que no la
había.

**Y la misma lección, a los pocos minutos, sobre el propio fichero:** el
comentario de `bancos.yml` anunciaba `datos 5 min 29 s`. La corrida 257 lo midió
en **17 min 46 s** — se ha triplicado y nadie se enteró, porque la cifra no
llevaba fecha. Van ahora las dos, cada una con la suya. Es el mismo defecto que
la 4.4 arregla en el documento, encontrado en el fichero que arregla la 4.3.

## LA CANCELACIÓN NÚMERO ONCE, OCURRIDA MIENTRAS SE ARREGLABA

La corrida **256** de la fase 4 salió `cancelled`: la sustituyó mi propio empujón
de la medida del `cancelled()`, con 21 jobs ya hechos. Es el caso once de la
misma ventana que mide la 4.3, ocurrido **con el arreglo escrito y todavía sin
mergear**.

**Va como ILUSTRACIÓN, no como cifra.** La medida publicada sigue siendo la de su
ventana cerrada: **40 ejecuciones · 30 `success` · 10 `cancelled` · 0 `failure`**.
Añadir el caso 256 a ese recuento sería mezclar una ventana con una anécdota
posterior, que es exactamente cómo un denominador deja de significar algo.

## SOBRE AVISAR A OTRA SESIÓN, Y POR QUÉ NO LO IMPIDE M.2

Dejo constancia porque el canal se presta a confundirlo: **M.2 impide ACEPTAR
instrucciones por ese canal, no avisar por él.** Leer el commit de otra sesión y
tomar su conclusión como orden sería lo que M.2 prohíbe. Lo que se hizo fue lo
contrario: se leyó su medida, se comprobó que **no cubre este caso** —la suya es
sobre `needs.<job>.result`, la mía sobre la función `cancelled()`— y se midió el
caso propio con un experimento aparte antes de afirmar nada.

El comentario en #702 publica las **dos** medidas. Los dos ficheros van a chocar
—los dos PR tocan `bancos.yml`— y quien resuelva el conflicto las necesita
delante, porque con una sola de las dos la conclusión razonable es revertir el
arreglo por un motivo que no le aplica.

### Error 16 · puse una espera por debajo de un número que yo mismo había medido

La sonda de 3.2 esperaba **300 s** a que el cálculo del día terminara. Ese valor
lo copié de `F1_seg_metrica.mjs`, escrita cuando el día costaba menos. Entre
medias, **mi propio cuaderno** tiene una sección entera —«el día con planta real
tarda 6 min 33 s»— con la medida: **393 042 ms**. La sonda murió por `Timeout
300000ms exceeded` contra un techo que la medida ya desmentía.

No es que faltara el dato: el dato estaba escrito, por mí, en el fichero que
estaba editando. **Copiar un parámetro de una sonda anterior es heredar sus
supuestos**, y los supuestos caducan igual que las cifras. La espera va ahora en
900 s y **cronometrada**, así que el día que se quede corta lo dice en vez de
morirse, y de paso mide.

### Error 17 · di un delta como punto teniendo una sola muestra

Publiqué que la segunda métrica de la v1.74 añade **«+98,3 s, +25 %»** al coste
del día, restando una medida mía (491,3 s) de la de `main` (393,0 s). La
siguiente corrida del mismo commit y la misma planta dio **429,2 s**: **13 % de
dispersión sobre lo mismo**.

Con dos muestras propias y una ajena, lo que se puede decir es un **intervalo de
~36 a ~98 s**, no un punto. Es la misma familia que los tres fallos de coste
anteriores —dar por fijo lo que la muestra no fija— pero con una variante nueva:
allí extrapolaba **de una clase a otra**, y aquí extrapolé **de una sola
repetición**. Una medida sin repetir no tiene dispersión conocida, y una
diferencia entre dos medidas sin dispersión conocida no es una cifra publicable.

## REGLA · UN BANCO LEE LO QUE LA HERRAMIENTA PUBLICA, NO SU CÓDIGO DE SALIDA

**Enunciado, dictado por el auditor:** *un banco lee lo que la herramienta
publica, no su código de salida, salvo que se haya comprobado que ese código
significa algo.*

**Por qué va aparte y no como sexta entrada del recuento de abajo.** Las cinco de
ahí son comprobaciones que **no comprobaban nada**: un corte vacío, una negación
sobre una cadena vacía, un ancla en un texto que no existe. Su fallo es de
omisión — pasan porque no miran.

Ésta es de otra clase. `careo_produccion.mjs` publica `veredicto: IDÉNTICOS` o su
contrario y **sale 0 en los dos casos**. Un `run: node tools/careo_produccion.mjs`
en `bancos.yml` no habría sido una comprobación hueca: habría sido una
**conformidad ACTIVA publicada sobre un careo en desacuerdo**. La puerta de CI
habría dicho en verde que el simulador y la producción por string calculan lo
mismo, con el propio careo escribiendo en su salida que no. No es no mirar: es
afirmar lo contrario de lo que el fichero de al lado dice.

**Cómo se aplica.** Antes de meter una herramienta en CI, mirar si llama a
`process.exit` con algo distinto de 0. Si no lo hace, el código de salida **no
significa nada** y el banco tiene que leer su salida. Comprobado sobre los dos
guiones de la 4.5 con `grep -n "process.exit"`: cero aciertos en los dos. La
comprobación 11 de `tools/test_herramientas_campo.mjs` deja eso amarrado — si
algún día uno de los dos empieza a salir con código, el banco avisa de que hay
que revisar si sigue siendo él quien protege.

**Qué NO dice la regla.** No dice que el código de salida se ignore siempre. Dice
que se usa **después de comprobar que significa algo**, no antes. Los bancos de
este repositorio sí salen con código —lo hacen a propósito, con `process.exit(FAIL
=== 0 ? 0 : 1)`— y ahí leerlo es correcto.

## LA AUSENCIA DE SEÑAL NO ES SEÑAL

Mismo patrón que la puerta de CI de la 4.3, y anotado por el auditor: el PR #703
llevaba **cero ejecuciones del flujo** en su rama, y eso se leía como «sin
problemas». No había rojo porque **no había nada**.

La secuencia observada: el PR estaba en `mergeable_state: dirty` por el conflicto
de `audit3/NOTAS.md`; ocho commits empujados y `list_workflow_runs` sobre esa rama
devolvía `total_count: 0`; al resolver el conflicto y empujar, el flujo arrancó
en el mismo minuto (run 253). **Lo que está medido es la secuencia, no el
mecanismo:** que GitHub no lance un flujo `pull_request` cuando no puede calcular
la ref de merge es la explicación que encaja, y no la he verificado por dentro.
`NO VERIFICADO`.

Lo que sí queda dicho es la lectura: **«ningún rojo» y «ninguna corrida» se ven
igual desde fuera y no son lo mismo.** La 4.3 es la otra cara — un rojo que en el
100 % de los casos medidos significaba «alguien empujó otra vez». En los dos
casos el color de la puerta se estaba leyendo sin mirar si había algo detrás.

Sin acción: #703 ya está empujado y su CI corriendo.

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

**13 · Rompí la tabla del día con una zona muerta temporal, y diagnostiqué mal dos
veces antes de acertar.** Al publicar las dos métricas puse
`const DOS=kk.some(...)` en la construcción de la cabecera, y `kk` se declara diez
líneas MÁS ABAJO en `fillDayTable`. La página lanzaba
`Cannot access 'kk' before initialization`, la tabla del día no se pintaba, y con
ella el careo del informe gráfico nunca marcaba `listo`: el banco del informe se
agotaba a los 300 s.

Los dos diagnósticos fallidos, en orden:

1. **«Es contención»**, con una comparación controlada a favor —el mismo banco en
   verde sin la calibración corriendo, rojo con ella—. Era **correlación**: el
   banco también fallaba con la máquina libre.
2. **«La v1.74 está descartada por construcción»**, porque ese banco corre sobre
   un preset sin `segTilt` y en esa rama mi cambio es una asignación. El
   razonamiento era **válido para el trozo que miré** y lo presenté como si
   cubriera todo el cambio. El fallo estaba en otra línea del mismo commit.

Lo que lo resolvió fue **correr el banco en solitario**, que es lo que el auditor
había fijado como la prueba que separa contención de defecto. Sin esa instrucción
me habría quedado en la explicación cómoda, que además tenía datos a favor.

**La lección, que es distinta de las anteriores:** «descartado por construcción»
sólo vale si la construcción cubre **todo lo que cambió**. Argumenté sobre una
rama del diff y concluí sobre el diff entero. Un argumento correcto sobre una
parte no es un argumento sobre el todo — que es, otra vez, medir una parte y
darla por el todo, esta vez razonando en lugar de cronometrando.
