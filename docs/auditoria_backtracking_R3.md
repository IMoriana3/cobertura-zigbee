# Auditoría del backtracking — Informe R3

**Ámbito.** `optimal` (Energy-optimal / Deeptrack) frente a `pairwise` en planta
medida, el lazo de control de la TCU, y la geometría de sombra entre filas.

**Árbol auditado.** Las mediciones de los §1.2, §1.3 y §5 se hicieron sobre
`ebb5dc0` (`backtracking.html` v1.68.0). El §1.5 vuelve a medir sobre
**v1.78.0** con el mismo protocolo. Las citas de código están
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
mesas a nivel, y si no, con qué signo?».**

---

## §5 · El lazo en planta medida — **CERRADO**

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
−0,431 %** con el lazo puesto.

**Advertencia de alcance:** junio es un test **menos afilado** que diciembre,
porque la banda rasante (0,5–10°), donde `optimal` gana +17,6 % y 69 de 69, pesa
menos en verano. La celda de 21-dic con lazo quedó **sin terminar** (pausada en
m=580 de 1440): `NO VERIFICADO`.

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
8. **«La frase del §5.1 *la fila honrada es la última* no está sostenida.»**
   Retirada **deshecha**: con los datos por debajo del minuto, 1 min queda a
   ~0,05 pp del límite. La frase era correcta y la retirada fue precipitada.

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
   protocolo, da **+0,402 %** (M3) y 288/289 instantes. Queda sin medir sobre
   v1.78 el **lazo** (el §5 es del árbol anterior).
2. **Cuál de las dos causas candidatas** domina la dependencia del paso con lazo
   (interpolación en el tramo o cuadratura por extremo derecho).
3. Si con **otra latitud o `axisAz≠0`** el llano cruza el corte de 89,9°.
4. El lazo en Ayora **21-dic** (pausado en m=580 de 1440). Junio es el test
   menos afilado de los dos.
5. **Por qué** el eje inclinado anula la sombra por completo más allá del efecto
   de `psz` ya medido (§3): el control aísla la causa, pero no se ha verificado
   que no haya un segundo término.
6. El **control que pedía el auditor** —una planta con mesas pero **sin**
   torsión— no existe entre los presets. No se ha podido hacer.
