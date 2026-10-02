# Auditoría del backtracking — Informe R3

**Ámbito.** `optimal` (Energy-optimal / Deeptrack) frente a `pairwise` en planta
medida, el lazo de control de la TCU, y la geometría de sombra entre filas.

**Árbol auditado.** Las mediciones de los §1.2, §1.3 y §5.1 se hicieron sobre
`ebb5dc0` (`backtracking.html` v1.68.0). Los §1.5, §5.2 y §5.3 vuelven a medir
sobre **v1.78.0** con el mismo protocolo. Las citas de código están
**re-verificadas sobre `d686640`** (v1.78.0) salvo donde se cite un commit
explícito. Entre ambos árboles hay 115 commits y algunas líneas se movieron;
cuando el código ha cambiado, se dice.

**Formato.** Toda afirmación lleva `archivo:línea` y fragmento. Todo recuento
lleva denominador. Todo recuento va precedido de su test nulo. Donde no hay
medida se escribe `NO VERIFICADO`, no una reconstrucción plausible.

---

## §1 · Asimetría de resolución — **CERRADO, corregido en v1.76**

### 1.1 El mecanismo

En el árbol auditado, `policyAnglesSeg` daba a `pairwise` y `astro` una
implementación **por mesa** y difundía el resto **por línea**
(`ebb5dc0:backtracking.html:2689-2694`):

```js
function policyAnglesSeg(key,zen,az,T,irr,doy,albedo){
  const drv=(T.segDrive&&T.segDrive.length)?T.segDrive:(T.segPairs||null);
  if(key==='astro')return applyDriveSeg(anglesAstroSeg(zen,az,T),drv);
  if(key==='pairwise'||key==null)return applyDriveSeg(anglesPairwiseSeg(zen,az,T),drv);
  return segsBroadcast(T,policyAngles(key,zen,az,T,irr,doy,albedo).angles);   // el resto sigue por línea
}
```

`optimal` elegía su ángulo con la métrica de línea y luego se le cobraba con la
de mesa. No es que apuntase peor: se le medía con una regla distinta de la que
usó para decidir.

La diferencia entre ambas resoluciones está medida: sobre las 1.600 mesas de
Ayora, `|segTiltAt − rowTiltAt|` da **1,0049° de media y 3,7143° de máximo**
(`backtracking.html:1227` `rowTiltAt`, `:2635` `segTiltAt`).

### 1.2 La cifra

Ayora real (79 líneas, bifila, 1.600 mesas, 400 grupos de motor), lazo apagado:

| ruta | muestra | `optimal` vs `pairwise` |
|---|---|---|
| anual completa (`dayEnergy`) | 24 días, horario | **−0,556 %** |
| reconstrucción independiente, métrica de energía | mismos 24 días | **−0,556 %** · 289 instantes · C≥B 106/289 |
| muestra disjunta, métrica POA | 36 días (5/15/25) | **−0,595 %** · 434 instantes · C≥B 162/434 |

Tres caminos con **cero solape de días** en los dos últimos, y coinciden mes a
mes en la segunda cifra decimal (ene −0,65/−0,653/−0,652 · feb −0,56/−0,564/−0,572
· mar −0,61/−0,610/−0,610 · dic −1,29/−1,292/−1,319). No es artefacto de ruta,
métrica ni muestreo.

### 1.3 Dónde vive la pérdida

Descomposición aditiva por banda de elevación solar (434 instantes, suma
Σ B = 250.765,2 → Σ C = 249.272,6 W/m²):

| banda | n | peso POA | C/B−1 | aporta | C≥B |
|---|---|---|---|---|---|
| 0,5–10° | 69 | 1,25 % | **+17,623 %** | +0,220 pp | **69/69** |
| 10–20° | 76 | 10,86 % | −5,208 % | −0,566 pp | 26/76 |
| 20–35° | 126 | 31,96 % | −0,780 % | −0,249 pp | 41/126 |
| 35–50° | 88 | 28,89 % | −0,001 % | −0,000 pp | 8/88 |
| 50–90° | 75 | 27,04 % | −0,000 % | −0,000 pp | 18/75 |
| | | 100,00 % | | **suma −0,595 pp** | |

Medido directo: −0,595 %. **La descomposición cierra.**

`optimal` gana mucho y siempre (69 de 69) con el sol rasante, donde hay el
**1,25 %** del POA; y pierde donde está la energía. Por encima de 35° las dos
políticas son numéricamente idénticas: sin sombra no hay nada que optimizar.

### 1.4 Corrección ya aplicada por el proyecto

`backtracking.html:2767`, `policyAnglesSegF`:

```js
// v1.76 (R4 fase 1): `optimal` y `optfree` también mandan por MESA, y con la
// métrica que se cobra. Antes repartían a las mesas un ángulo de línea que
// habían elegido con `poaPlant` — medido: perdían por mesa en 58 de 86.
if(key==='optimal'){const r=anglesOptimalSeg(zen,az,T,irr,doy,albedo);return {angles:r.angles,f:r.f,linea:null};}
if(key==='optfree'){const r=anglesOptimalFreeSeg(zen,az,T,irr,doy,albedo);return {angles:r.angles,f:r.f,linea:null};}
```

Con `anglesOptimalSeg` en `:3211` y `anglesOptimalFreeSeg` en `:3267`. La
medición de R4 («perdían por mesa en 58 de 86») es **independiente de esta
auditoría** y coincide en el diagnóstico.

### 1.5 Verificación de la corrección sobre v1.78 — **el signo se invierte**

Mismo protocolo que el §1.2: Ayora real, los 24 días (el 7 y el 21 de cada
mes), paso horario, lazo apagado, ambas rutas puntuadas con `poaPlantSeg`.
Lo único que cambia entre las dos columnas es la versión.

| | v1.68 (`optimal` por línea) | **v1.78 (`optimal` por mesa)** |
|---|---|---|
| M1 · POA media de planta | −0,589 % | **+0,385 %** |
| M3 · energía DC por string | **−0,556 %** | **+0,402 %** |
| instantes con `optimal` ≥ `pairwise` (M3) | 106/289 | **288/289** |

**Control previo al recuento.** Que `policyAnglesSeg('optimal')` mande por
mesa no se da por supuesto: medido, devuelve **θ distinto entre mesas de la
misma línea en 37 de 79 líneas**, con `|θ_mesa − θ_línea|` de hasta
**3,5985°**. No es difusión con otro nombre.

**Coste, contra la intuición.** Pasar de 79 líneas a 1.600 mesas **abarata** el
cálculo: 3,81 s por llamada frente a 7,87 s de la ruta por línea.

**La pérdida desaparece justo donde vivía:**

| banda | v1.68 | v1.78 | C≥B (v1.78) |
|---|---|---|---|
| 0,5–10° | +17,285 % | **+20,137 %** | 46/46 |
| 10–20° | **−4,823 %** | **+1,161 %** | 48/49 |
| 20–35° | **−0,841 %** | **+0,004 %** | 84/84 |
| 35–50° | −0,001 % | +0,001 % | 60/60 |
| 50–90° | −0,000 % | +0,001 % | 50/50 |

Las dos bandas que sangraban —la de 10–20°, que aportaba −0,566 pp, y la de
20–35°— pasan a positiva y a cero. Confirma que la pérdida no estaba repartida:
vivía exactamente donde el ángulo por mesa se separa del de línea.

Mes a mes (M3) sale positivo los doce, con la estacionalidad **invertida**
respecto al árbol anterior: ahora gana más en invierno (ene **+0,965 %**, nov
+0,775 %, dic +0,770 %) y menos en verano (jun +0,194 %). Antes diciembre era
el peor mes, con −1,292 %.

**Alcance.** Esto es Ayora: planta con cotas medidas y torsión real. En El
Burgo `porMesa` es falso (§4.2), así que allí `optimal` sigue yendo por línea y
la corrección **no cambia nada**.

**Cómo citar el −0,556 %.** Describe el árbol anterior a v1.76 y **no debe
citarse como estado actual**. El estado actual es **+0,402 %**.

---

## §2 · Dependencia del paso con el lazo encendido — **ABIERTO**

Planta genérica, 12 días (el 15 de cada mes), kWh/fila:

| paso | lazo | pairwise | optimal | astro |
|---|---|---|---|---|
| 60 m | OFF | 1325,0 | +0,460 % | −2,522 % |
| 30 m | OFF | 1325,3 | +0,435 % | −2,381 % |
| 15 m | OFF | 1324,9 | +0,464 % | −2,435 % |
| 10 m | OFF | 1324,8 | +0,457 % | −2,621 % |
| 5 m | OFF | 1324,8 | +0,460 % | −2,561 % |
| 1 m | OFF | 1324,8 | +0,449 % | −2,558 % |
| 60 m | **ON** | 1291,1 | **+1,057 %** | **+0,036 %** |
| 30 m | **ON** | 1288,8 | +0,762 % | **+0,378 %** |
| 15 m | **ON** | 1291,8 | +0,727 % | +0,067 % |
| 10 m | **ON** | 1292,0 | +0,784 % | −0,154 % |
| 5 m | **ON** | 1291,7 | +0,650 % | −0,066 % |
| 1 m | **ON** | 1294,5 | +0,840 % | −0,283 % |

Con el lazo apagado converge: dispersión **±0,015 pp**, da igual el paso.
Con el lazo encendido **no converge y no es monótono**: racimo de **0,407 pp**
en `optimal`, y el astronómico **cambia de signo** (+0,378 % a 30 min,
−0,283 % a 1 min).

**Por debajo del minuto sí converge:**

| paso | pairwise | optimal | astro |
|---|---|---|---|
| 60 s | 1294,5 | +0,840 % | −0,283 % |
| 30 s | 1294,6 | +0,773 % | −0,283 % |
| 15 s | 1294,6 | +0,800 % | −0,280 % |

Criterio pre-registrado (escrito antes de ver los números): converge si al
partir el paso el salto decrece y el último queda bajo 0,05 pp.
`|30s−60s| = 0,067 pp`, `|15s−30s| = **0,027 pp**`. Se cumple. Límite
`optimal` ≈ **+0,79 % ± 0,035**, `astro` ≈ **−0,28 %**. El paso de 1 min queda
a ~0,05 pp del límite: es honrado.

**Dónde muerde.** Los agregados de mes y año van a paso **horario**
(`produccion.html:3069`):

```js
const d=dayEnergy(F,c,T.obj,fechas[i],60,mapStringW(F,c,T.obj));
```

A ese paso y con el lazo puesto, el astronómico puro saldría **igual o mejor**
que el backtracking (+0,036 %), lo que leído literalmente dice *el backtracking
no hace falta*. Al paso convergido dice lo contrario. **El artefacto no mueve un
decimal: invierte una conclusión de diseño.**

**Lo que acota la gravedad:** el lazo viene **apagado por defecto**
(`tools/gen_golden_anual.mjs:100`, traducción literal de los `value=` de la
página): `ctrl: { on: false, db: 1.0, slew: 0.17, cicloSeg: 1, modo: 'libre' }`.
Las cifras publicadas hoy no están afectadas. El defecto aparece si alguien
enciende el lazo y pide un mes o un año.

**Causa: descartada una, candidatas dos.** No es el slew:
`js/control_core.js:32` declara que el lazo corre a `cicloSeg` por dentro
(`C.CANON={deadbandDeg:1.0, slewDegS:0.17, cicloSeg:1}`, `:51`) y que «la
integración solo lee el θ al final del tramo» — los 612° están arreglados ahí a
propósito. Quedan la **interpolación lineal de la consigna dentro del tramo** y
la **cuadratura por extremo derecho**. `NO VERIFICADO`: encaja con que converja
al afinar, pero no se ha medido cuál de las dos domina.

**Sin vigilancia.** No hay banco que fije esta convergencia. Recomendación:
mismo día a 60/5/1 min con lazo, y romper si la dispersión pasa de un umbral.

---

## §3 · Corte duro a 89,9° en la sombra entre filas — **ABIERTO**

`backtracking.html:624`, en `shadeFracPair`:

```js
if(!isFinite(pszDeg)||Math.abs(pszDeg)>=89.9)return 0;
```

`psz` es el cenit solar **proyectado** sobre el plano perpendicular al eje, y es
lo que decide la sombra. Por encima de 89,9° la función devuelve cero sin
transición.

**El llano trabaja a 0,207° de ese corte.** El Burgo (llano por construcción,
§4) en su instante de más sombra —21-dic 09:30, fila 47, elevación **0,261°**—
opera a **psz = 89,693°**.

**Apalancamiento.** La sombra va con `tan(psz)`, y ahí estamos en el polo:

| eje N-S | psz | tan(psz) | sombra de un borde a 0,17 m | pitch |
|---|---|---|---|---|
| 0° | 89,693° | **186,6** | **31,73 m** | 6,00 m |
| 0,25° | 89,537° | 123,7 | 21,04 m | 6,00 m |
| 0,5° | 89,382° | 92,7 | 15,76 m | 6,00 m |
| 1° | 89,072° | 61,7 | 10,50 m | 6,00 m |
| 2° | 88,451° | 37,0 | 6,29 m | 6,00 m |

A 0° la sombra de un borde alcanza **cinco vanos**; a 2°, justo uno.

**Control que aísla la causa.** Fijando θ a los valores del llano (1,69°/1,69°)
y moviendo **solo** `psz`, con los paneles en la misma posición:

| eje | psz | θ fijos | sombra de la pareja |
|---|---|---|---|
| 0° | 89,693° | 1,69 / 1,69 | **61,29 %** |
| 0,5° | 89,382° | 1,69 / 1,69 | 32,63 % |
| 1° | 89,072° | 1,69 / 1,69 | 10,76 % |
| 2° | 88,451° | 1,69 / 1,69 | **0,00 %** |

No es que las mesas tapen menos: **cambia el marco en el que se calcula la
sombra**. Y no es una discontinuidad del código — el barrido fino
(0 / 0,1 / 0,25 / 0,5 / 1 / 2°) da 34,82 → 23,83 → 41,39 → 72,57 → 99,13 →
100,00 % de máximo, crecimiento continuo; lo que salta es **qué instante es el
peor** (de las 09:30 a las 18:30).

**Riesgo.** Cualquier cosa que empuje `psz` dos décimas —otra latitud, otro
azimut de eje, otro paso de integración— pasa de ~35 % de sombra a cero de
golpe. Es un sitio frágil para apoyar un modelo.

**Lo que le quita gravedad:** el instante está a 0,261° de elevación, donde no
hay energía. Por eso el anual apenas se mueve (§4).

**`NO VERIFICADO`:** no se ha medido si con otras latitudes o `axisAz≠0` el
llano cruza el corte.

---

## §4 · El Burgo sin cotas — **ABIERTO (dato ausente, no defecto)**

### 4.1 Se modela llano, y está declarado

`produccion.html:1657`, en `tElburgo`:

```js
const z=new Array(xs.length).fill(0);
```

y `buildTX` convierte el `tilt=null` en ceros (`produccion.html:584`):

```js
const tilts=tilt||new Array(n).fill(0);
```

Medido sobre la planta levantada: **90 líneas, 430 mesas, 45 grupos bifila,
pitch 6,00 m uniforme, pendiente 0,0000° en todos los vanos**.

**No hay dato que ignorar.** Existen `ayora_cotas.json` y `sanjose_cotas.json`;
**no existe `elburgo_cotas.json`**. Los 215 trackers del layout traen las claves
`x, n, rot, t, id, idPrevio, desig, ncu, gw` — ninguna `z`, `cota`, `elev` ni
`alt`. Está declarado en la interfaz (`produccion.html:149`):
«El Burgo I (strings del plano; **terreno plano, declarado**)».

### 4.2 Consecuencia sobre el §1

`buildTX` **no pone** `segTilt`, `segPairs` ni `segDrive` — solo los pone
`buildTReal`, que come cotas. Y `produccion.html:1444`:

```js
const porMesa=!!(T.segTilt&&T.segs&&F.poaPlantSeg);
```

Sin `segTilt`, `porMesa` es falso: **en El Burgo todo va por línea y la
asimetría del §1 no puede aparecer**. El hallazgo es específico de plantas
levantadas con cotas (Ayora, San José).

### 4.3 Cuánto cuesta modelarlo llano

Pendiente sintética, 12 días (el 15 de cada mes), paso horario, sin lazo.
**Test nulo:** la reconstrucción a 0°/0° con `buildTX` es **idéntica**
(`JSON.stringify` byte a byte) a la que produce `tElburgo`, así que lo medido es
atribuible a la pendiente y no al andamiaje.

`pairsFromElevX` trata dos pendientes por separado y no dan lo mismo:

| grados | **terreno E-O** kWh/fila | vs llano | **eje N-S** kWh/fila | vs llano |
|---|---|---|---|---|
| 0° | 1331,608 | — | 1331,608 | — |
| 1° | 1331,294 | **−0,024 %** | 1341,687 | **+0,757 %** |
| 2° | 1330,309 | **−0,098 %** | 1351,576 | **+1,500 %** |
| 4° | 1324,965 | **−0,499 %** | 1370,422 | **+2,915 %** |

**El relieve del terreno cuesta poco** (0,02–0,10 % a 1–2°). **La inclinación
N-S de las mesas es 30× más sensible** — pero eso no es topografía, es
**montaje**: si las mesas van a nivel, da igual el terreno debajo.

### 4.4 El signo importa tanto como la magnitud

Convenio declarado en `backtracking.html` (comentario previo a `:606`): el tilt
es positivo cuando el extremo que apunta al azimut del eje (el norte, con
`axisAz=0`) está **más alto**. pvlib lo define al revés y la conversión se
aplica en `:606`: `const pvTilt=t=>-(t||0);`

Verificado por dos vías independientes:

**(a) Geométrica** — azimut de la normal con θ=0 (0=N, 180=S):
tilt −4° → **0,0° (norte)** · tilt +4° → **180,0° (sur)**.

**(b) Estacional** — kWh/fila en El Burgo:

| tilt | 21-dic | 21-jun |
|---|---|---|
| −4° | 38,008 (**−13,33 %**) | 168,760 (+0,03 %) |
| −1° | 42,404 (−3,31 %) | 168,765 (+0,03 %) |
| 0° | 43,855 | 168,712 |
| +1° | 45,306 (**+3,31 %**) | 168,634 (−0,05 %) |
| +4° | 49,580 (**+13,06 %**) | 168,240 (−0,28 %) |

Firma inequívoca de inclinación hacia el ecuador. Si el terreno cayera al
**norte** y las mesas lo siguieran, el modelo estaría **sobreestimando hasta un
13 % los días de invierno**.

**La pregunta útil para El Burgo no es «¿es llano el campo?» sino «¿están las
mesas a nivel, y si no, con qué signo?».** El §4.5 le añade un tercer término,
que resulta ser el dominante: **y con cuánta dispersión entre vecinas.** Todas
las cifras de este §4.4 son de tilt **uniforme**, y esa es precisamente la forma
que menos cuesta.

---

### 4.5 El DEM de #742 no cierra el §4, y corrige mi propio barrido

Desde que se escribió el §4, main ha ganado `elburgo_relieve.json` (PR #742,
`3f8a681`). Hay que decir tres cosas sobre él, y la tercera obliga a corregir el
§4.3.

**(a) El modelo de producción no lo lee.** `produccion.html` no abre ningún
`*_relieve.json`: las coincidencias de `grep relieve` en ese fichero son prosa y
comentarios. El consumidor es `terreno.html:908` (`relAt`, bilineal). Así que El
Burgo **sigue modelándose llano** en producción, exactamente como dice el §4.1.

**(b) La pendiente entre filas que daría es sub-malla, es decir, inventada.**
El paso de la malla es **10 m** y el pitch de El Burgo es **6,00 m exacto en los
89 pares** (medido: `dx` único = 6). Muestrear a 6 m en una malla de 10 m no da
terreno, da la dirección de la interpolación bilineal. Y #742 midió justamente
eso: «por debajo de 100 m el relieve verdadero es cero exacto mientras el DEM
solo se inventa hasta 8,07 dB — ahí no es impreciso, cobra relieve que no hay».
El propio fichero se rotula `calidad.validado: false`, con el motivo escrito:
«sin levantamiento: el layout no trae cotas de seguidor, así que no hay verdad
de campo contra la que validar esta planta». Careo de origen antes de muestrear:
el layout y el relieve declaran el **mismo** `cE`/`cN` (683562.922059555 /
4605080.984298119), y **0 de 90** líneas caen fuera de la malla.

**(c) La inclinación del eje no es una pregunta de terreno.** `montaje.axis_tilt`
vale **0** y `montaje_origen.axis_tilt` declara la convención: «canon · el eje se
genera horizontal; el terreno se aplica aparte (bt3d)». Los pilotes nivelan el
tubo. Y `pilotes.porTipo` da **posiciones** a lo largo del tubo
(`interior`/`exterior`/`medio`), **no alturas**, así que no hay dato con el que
derivar una torsión real: el relieve se rotula `eje_medido: false`. Lo que el
DEM sugiere es, por tanto, una **cota de lo que el terreno podría imponer si los
pilotes no nivelaran**, no una medida del seguidor.

Con el tramo correcto —la mesa declarada en `tipos_largo`, **64,6 m**
(32,6 la «Medio»)— la torsión que sugiere el DEM en las 215 mesas es:

| | valor |
|---|---|
| media **con signo** | +0,0660° (103 al norte / 112 al sur) |
| \|media\| | **0,5982°** |
| p50 · p95 · máx | 0,4796° · 1,5698° · **3,5141°** |

Media casi nula con dispersión: **no es una pendiente, es torsión mesa a mesa.**

**Y el canal que el modelo tiene no la puede llevar.** En El Burgo `porMesa` es
falso (§4.2), así que `buildTX` solo admite **un** valor por línea. Promediada a
línea, la señal queda en \|media\| **0,2144°** (máx 0,7088°) — el promediado se
come el **64 %**. La dispersión **dentro** de cada línea, que es la señal
dominante, no tiene dónde entrar: recorrido máx−mín de \|media\| **1,8497°**,
p95 3,9288°, máx **4,8160°** sobre las 82 líneas con más de una mesa.

#### La corrección al §4.3: mi barrido midió la forma equivocada

El §4.3 barrió pendientes **uniformes** (1°, 2°, 4°) y salieron **ganancias**
(+0,757 / +1,500 / +2,915 %). Metido el array real por línea, sale una
**pérdida** de **−3,094 %** con \|media\| de solo 0,2144°. Eso es una afirmación
de mecanismo, así que va con su control: tres arrays con la **misma** \|media\|
0,2144° y distinta forma.

| forma de la perturbación | kWh/fila | vs llano |
|---|---|---|
| llano (test nulo) | **1331,608** | reproduce el §4.3 clavado |
| A · uniforme +0,2144° | 1333,783 | **+0,163 %** |
| B · magnitudes reales, **sin** mezcla de signo | 1300,006 | **−2,373 %** |
| C · real, con signo | 1290,407 | **−3,094 %** |

Descomposición: la **magnitud** aporta **+0,163 %**; la **dispersión** de esa
magnitud, **−2,536 pp**; la **mezcla de signo** encima, **−0,721 pp**. La forma
pesa **19×** la magnitud y con el signo contrario. El mecanismo es
`pairsFromElevX`: `axisTilt = media(tilt[i], tilt[i+1])`, así que dos vecinas
desalineadas se sombrean, y eso no depende de cuánto valga el tilt sino de
cuánto se **diferencien**.

**Qué es sólido y qué es indicativo.** El **mecanismo** es sólido: es una
propiedad del modelo, controlada tres veces, y vale venga de donde venga el
array. El **−3,094 % de El Burgo** es indicativo, no una medida de la planta:
además del `validado: false`, la variación **entre líneas** —que es la que cobra—
se muestrea a 6 m en una malla de 10 m, o sea parcialmente interpolación. Da el
orden y el signo, no la cifra.

**Consecuencia sobre la recomendación del §4.** Cablear `*_relieve.json` a
`produccion.html` **no** es la acción que cierra esto, y podría empeorarlo: lo
que entraría por el canal E-O sería artefacto de malla. Lo que falta es
**levantamiento de cotas de seguidor** —lo que el propio `calidad.motivo` dice
que no hay— y, para que la señal dominante quepa, que El Burgo tenga `segTilt`
(hoy `porMesa` es falso).

---

## §5 · El lazo en planta medida — **CERRADO en los dos solsticios**

### 5.1 Medida sobre v1.68

Predicciones escritas **antes** de medir, para que una fallase:

- **(a)** el lazo mueve **+0,34 pp**, extrapolando la genérica (+0,449 % → +0,79 %).
- **(b)** mueve **menos de +0,15 pp**, porque el pago de `pairwise` al lazo en
  planta medida es 15–26× menor que en la genérica.

Resultado, Ayora real, 21-jun (kWh/fila; lazo ON a paso de 1 min, OFF a 5 min,
que converge):

| | pairwise | optimal | |
|---|---|---|---|
| sin lazo | 167,5956 | 166,7933 | **−0,479 %** |
| con lazo | 167,4501 | 166,7285 | **−0,431 %** |

**El lazo mueve +0,048 pp.** La predicción (a) **falla por 0,292 pp**; la (b)
**acierta**.

**Mecanismo, confirmado por los pagos propios:**

| planta | pago de `pairwise` al lazo |
|---|---|
| genérica | **−2,29 %** (1324,8 → 1294,5) |
| Ayora 21-dic | −0,1477 % (40,67 → 40,6140) |
| Ayora 21-jun | **−0,0869 %** (167,5956 → 167,4501) |

La ventaja de `optimal` en la genérica **no venía de apuntar mejor**, sino de
que `pairwise` paga por tener un actuador finito. En planta medida ese pago es
26× menor, así que el lazo no puede rescatarla: `optimal` **sigue perdiendo
−0,431 %** con el lazo puesto. **Ese −0,431 % es del árbol anterior**; sobre
v1.78 la misma celda da **+0,249 %** (§5.2).

### 5.2 Remedida sobre v1.78 — el delta del lazo se reduce y cambia de signo

El §5.1 mide el árbol anterior a la corrección de v1.76. Repetida la medida
sobre **v1.78.0** (`d686640`), mismo día, mismo protocolo, mismas cuatro celdas
(Ayora real, 21-jun, kWh/fila):

| | pairwise | optimal | optimal vs pairwise |
|---|---|---|---|
| sin lazo (paso 5 min) | 167,5956360715477 | 168,03748884670094 | **+0,264 %** |
| con lazo (paso 1 min) | 167,4500763198696 | 167,867664512096 | **+0,249 %** |

**El lazo mueve −0,014 pp**, frente a **+0,048 pp** en v1.68: en magnitud es
**3,5× más pequeño**, y **cambia de signo**. Con la corrección puesta, el lazo
ya no rescata nada — recorta, muy poco.

**Test nulo implícito.** Las dos celdas de `pairwise` salen **idénticas al
último dígito** en los dos árboles (167,5956360715477 y 167,4500763198696).
Confirma dos cosas a la vez: que v1.76 tocó **solo** `optimal`/`optfree`, y que
el banco mide lo mismo en ambos árboles. Sin esto, el careo no valdría.

**Dónde está el cambio: en el pago propio de `optimal`, no en el de `pairwise`.**

| política | pago al lazo, v1.68 | pago al lazo, v1.78 |
|---|---|---|
| `pairwise` | −0,0869 % | **−0,0869 %** (idéntico) |
| `optimal` | −0,0389 % | **−0,1011 %** (×2,6) |

Al mandar **por mesa**, `optimal` elige ángulos más agresivos y más dispersos
entre mesas, y un actuador con banda muerta de 1,0° y velocidad finita se los
recorta más. En v1.68 `optimal` era la política que **menos** sufría el lazo, y
eso le maquillaba la desventaja; en v1.78 es la que **más** sufre, y eso le come
una parte pequeña de su ventaja nueva. Sigue ganando con el lazo puesto.

**Coste de la medida, por si alguien la repite.** Lo caro es el **crepúsculo
rasante**, no la noche: de m=1282 a m=1299 fueron 17 pasos en 17 min de reloj
(~60 s/paso), y los 141 pasos restantes hasta m=1440 cayeron en menos de 45 s.
La celda completa necesita checkpoint **por paso**; con checkpoint cada 10
min de simulación entra en *livelock* porque un solo paso rasante dura más que
el contenedor (§8).

Junio es un test **menos afilado** que diciembre, porque la banda rasante
(0,5–10°), donde `optimal` gana +17,6 % y 69 de 69, pesa menos en verano. Esa
advertencia estuvo abierta hasta el §5.3, que mide el solsticio de invierno.

### 5.3 El solsticio de invierno, el test afilado — **CERRADO**

Mientras el §5 solo tenía junio, quedaba la duda de si el día afilado podía
**darle la vuelta** al resultado. Medidas las cuatro celdas también en
**21-dic**, mismo árbol (v1.78.0), mismo protocolo (Ayora real, kWh/fila):

| | pairwise | optimal | optimal vs pairwise |
|---|---|---|---|
| sin lazo (paso 5 min) | 40,66629735290969 | 41,034817933438916 | **+0,906 %** |
| con lazo (paso 1 min) | 40,61401843840256 | 40,96667316421885 | **+0,868 %** |

**El lazo mueve −0,038 pp.** No le da la vuelta a nada: **mismo signo** que en
junio y **2,7× más grande** en magnitud.

**Careo de los dos solsticios, mismo árbol y mismo protocolo:**

| | 21-dic | 21-jun | factor |
|---|---|---|---|
| sin lazo | **+0,906 %** | +0,264 % | **3,44×** |
| con lazo | **+0,868 %** | +0,249 % | **3,48×** |
| delta del lazo | **−0,038 pp** | −0,014 pp | 2,7× |
| pago de `pairwise` | −0,1286 % | −0,0869 % | 1,48× |
| pago de `optimal` | **−0,1661 %** | −0,1011 % | 1,64× |

Las dos preguntas que el §5.2 dejó abiertas quedan contestadas. **(1)** El delta
del lazo **mantiene el signo negativo** en el día afilado: el lazo recorta algo
de la ventaja de `optimal` en los dos solsticios, y recorta más en invierno.
**(2)** `optimal` **paga más** al lazo con el sol bajo (−0,166 % contra
−0,101 %), pero `pairwise` también paga más, y **el orden no cambia**: `optimal`
sigue siendo la política que más sufre el actuador finito, en los dos días. Es
lo que predice el mecanismo del §5.2 —ángulos más dispersos, banda muerta de
1,0°— y no hace falta nada más para explicarlo.

**Segundo test nulo, ahora en diciembre.** `pairwise` con lazo da
**40,61401843840256**, idéntico al último dígito al valor medido sobre v1.68.
Es el mismo control del §5.2 repetido en el otro solsticio: dos de dos.

#### Lo que esto obliga a decir sobre el +0,402 % anual

El factor **3,44** entre los dos solsticios es el resultado con más consecuencias
de este §5. **El +0,402 % anual del §1.5 es una media de doce meses, no un
techo:** el día de invierno da **+0,906 %** sin lazo y el de verano **+0,264 %**.

Citar el anual como «lo que vale la corrección de v1.76» es citar el promedio de
un efecto que varía por un factor 3,4 a lo largo del año, y que se concentra
justo en los meses en que la planta produce menos. No es lo mismo decir
«+0,4 %» que decir «+0,9 % en invierno, +0,26 % en verano».

**Nota de infraestructura.** El contenedor se reinició con la celda a cuatro
pasos de la puesta. El proceso sobrevivió porque iba desacoplado, y el cerrojo
lo verificó leyendo `/proc/<pid>/cmdline` en vez de fiarse de que el PID
existiese — que es exactamente el fallo del §8 que costó 40 min de parón en
silencio. La defensa funcionó.

---

## §6 · Tests nulos

Ninguno de los recuentos de este informe se presenta sin su test nulo delante.

| test | resultado | consecuencia |
|---|---|---|
| ¿difieren las dos métricas sobre el mismo θ? | **8 de 8**, separación relativa máx **3,126 %** | el recuento de inversiones informa |
| `plant` vs media sin pesar de `rows` | 958,3115 = 958,3115, separación **0,0000 %** | métrica M2 **declarada no informativa**, no se usa |
| ¿cambia el orden entre POA y energía? | **0 de 289** | la no linealidad térmica no invierte nada |
| control sin quiebro (genérica) | las métricas **coinciden** (0 de 8) | el recuento **no informaría ahí**; se paró |
| reconstrucción de El Burgo a 0°/0° | **idéntica** a `tElburgo` | lo medido es de la pendiente |
| máquina de checkpoints | 40,61401843840256 reanudado = 40,6140 de un tirón | el arrastre de estado del lazo es exacto |
| `pairwise` medido en v1.68 y en v1.78 | **idéntico al último dígito**, en 21-jun **y** en 21-dic | v1.76 tocó solo `optimal`/`optfree`; el careo de los §5.2 y §5.3 vale |
| origen del layout vs origen del relieve | `cE`/`cN` **iguales**; 0 de 90 líneas fuera de la malla | el muestreo del DEM del §4.5 está en el sistema correcto |
| El Burgo llano reconstruido en el §4.5 | **1331,608** = 1331,608 del §4.3 | lo medido es de la torsión, no del arnés nuevo |
| uniforme a la misma \|media\| que el array real | **+0,163 %** contra −3,094 % | la pérdida es de la **forma**, no de la magnitud |

---

## §7 · Correcciones — hipótesis de esta auditoría que resultaron falsas

Se registran todas, con lo que las refutó.

1. **«El desacuerdo de signo es un desajuste de métrica.»** Refutada: **0 de 8**
   inversiones al cambiar de métrica.
2. **«Lo explica la escalera eléctrica.»** Refutada: `elecLoss` ya está dentro de
   `poaPlantSeg` (`backtracking.html:2797`), así que la métrica de instante
   siempre la llevó. (`elecLoss` en `:701`, `nBypass:2` en `produccion.html:587`.)
3. **«Lo explica la bifacialidad.»** Refutada: `bif: { bifa: 0, perdTras: 10 }`
   (`tools/gen_golden_anual.mjs:98`).
4. **«Lo explica el pesado línea/planta.»** Refutada por test nulo (§6).
5. **«Lo explica la no linealidad térmica de `pStringW`.»** Refutada: 0 de 289.
6. **«El +0,362 % de la sonda de 8 instantes contradice el año.»** Falso: era
   **sesgo de muestreo**. La banda rasante pesa **1,25 %** del POA y en aquella
   sonda era el **25 %** — sobrerrepresentación **20×**.
7. **«El hallazgo del lazo queda obsoleto porque `crearLazo` ahora adelanta.»**
   Falso: `instant` usa **solo** `CTRLCORE.execVector` (`produccion.html:1476`),
   y `js/control_core.js` **no ha cambiado** (sha256 `90a10f02ff31d8af` idéntico
   entre `ebb5dc0` y `d686640`). `crearLazo` solo se usa dentro de
   `backtracking.html`. El hallazgo vale.
8. **«La frase *el paso de 1 min es honrado* (§2) no está sostenida.»**
   Retirada **deshecha**: con los datos por debajo del minuto, 1 min queda a
   ~0,05 pp del límite. La frase era correcta y la retirada fue precipitada.

**Un cuarto error de método, del §4.5.** Medí la torsión N-S sobre el **extremo
de línea** (284 m de tramo medio) cuando la mesa declarada son **64,6 m**:
subestimaba **2,91×**. Con ese tramo malo llegué a tener en pantalla un
−1,514 % y estuve a punto de publicarlo como el coste real del eje en El Burgo.
Lo que lo paró fue leer `tipos_largo` y `montaje_origen` **antes** de escribir,
no un test. El patrón es el mismo de los otros tres: tomar el denominador que
tenía a mano en vez del que declara el proyecto.

**Corrección a una cita recibida.** El parámetro que fija las subcadenas no es
`nb` sino **`nbp`**: `ebb5dc0:backtracking.html:179` (hoy `:189`),
`<input id="nbp" ... value="2">`.

---

## §8 · Errores de método de esta auditoría

Se registran porque afectaron a lo que se informó, aunque no a las cifras.

- **Presupuesto extrapolado tres veces.** Se calibró el coste en 21-jun y se
  aplicó a 21-dic (6× de error, `anglesOptimal` es mucho más caro con sol bajo);
  se repitió el error de coste medio al estimar junio; y se situó el ocaso a ojo
  en m=1170 cuando es **m=1294** (error de 124 pasos). El dato que lo delataba
  estaba a la vista: la corrida se encarecía justo en m=393, el amanecer.
- **Tres fallos de vigilancia, todos del mismo tipo:** fiarse de una señal
  indirecta en vez del avance real. Checkpoint cada 10 min de simulación
  (livelock: un paso costaba más que la vida del contenedor); `pkill -f` que se
  mataba a sí mismo por auto-coincidencia del patrón; y cerrojo por PID, que tras
  un reinicio del contenedor da falso positivo por reutilización de PID y bloqueó
  todos los relanzamientos durante 40 min mientras se informaba «avanzando».
- **Una corrida terminada pasó desapercibida** 2,5 h por no volver a mirar el
  fichero de resultado.

---

## §9 · Qué queda `NO VERIFICADO`

1. ~~`optimal` sobre v1.78~~ — **cerrado en el §1.5**: medido con el mismo
   protocolo, da **+0,402 %** (M3) y 288/289 instantes. ~~Queda sin medir sobre
   v1.78 el **lazo**~~ — **cerrado en el §5.2**: el delta del lazo pasa de
   +0,048 pp a **−0,014 pp**, y el §5.3 lo mide también en 21-dic: **−0,038 pp**.
2. **Cuál de las dos causas candidatas** domina la dependencia del paso con lazo
   (interpolación en el tramo o cuadratura por extremo derecho).
3. Si con **otra latitud o `axisAz≠0`** el llano cruza el corte de 89,9°.
4. ~~El lazo en Ayora **21-dic**~~ — **cerrado en el §5.3**: las cuatro celdas
   medidas sobre v1.78. El delta del lazo mantiene el signo (−0,038 pp) y
   `optimal` gana **+0,906 %** sin lazo, **3,44×** lo de junio. Queda sin medir
   el lazo en 21-dic sobre **v1.68**, que ya no interesa: el árbol está
   superado y `pairwise` da el mismo valor en ambos (dos tests nulos).
5. **Por qué** el eje inclinado anula la sombra por completo más allá del efecto
   de `psz` ya medido (§3): el control aísla la causa, pero no se ha verificado
   que no haya un segundo término.
6. El **control que pedía el auditor** —una planta con mesas pero **sin**
   torsión— no existe entre los presets. No se ha podido hacer.
7. La **torsión real de El Burgo**. El DEM de #742 da el orden y el signo
   (§4.5) pero se rotula `validado: false` y `eje_medido: false`, y la variación
   entre líneas que cobra se muestrea a 6 m en una malla de 10 m. Hace falta
   **levantamiento de cotas de seguidor**; `pilotes` da posiciones, no alturas.
8. El **coste de que El Burgo no tenga `segTilt`**. La señal dominante del §4.5
   es la dispersión **dentro** de la línea (recorrido \|media\| 1,8497°) y el
   modelo no tiene canal para ella, así que su coste no se ha medido: solo se ha
   medido el de la parte que **sí** cabe, promediada a línea.
