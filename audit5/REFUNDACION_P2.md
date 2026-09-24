# Refundación del BT · PASO 2 — Una sola ruta anual

**Encargo «REFUNDACIÓN DEL BT» (titular, 2026-09-24), paso 2.** Rama
`claude/refundacion-p2-6th1im`, apilada sobre el paso 1 (#758). Simulador
**v1.82.0**. La física no cambia (`tools/test_caras_bajo_demanda.mjs`, 9/9).

## 2.1 · Cuánto se apartan las tres rutas, separando el lazo y el cielo

`audit5/P2_1_tres_rutas.mjs`. Mide el estado ANTES de unificar: la página del
paso 1, v1.81.0. Las dos rutas de la página se ejecutan tal cual
(`audit5/lib_anual_pagina.mjs`). Salidas:
`audit5/out/P2_1_tres_rutas_paginas.{txt,json}` y, para `anual_motor`,
`audit5/out/P2_1_tres_rutas_motor.{txt,json}`.

**Las tres rutas:**

- **Botón del año:** CON lazo; cielo claro siempre; 12 días (el 21), cada
  10 min, ponderado por días.
- **Informe (`grAnualGen`):** SIN lazo; con el cielo del deslizador de nubes
  (`cloudCC`); los mismos días y paso.
- **`tools/anual_motor.mjs`:** OTRO motor (`produccion.html`, vía
  `gen_golden_anual.mjs`, `tools/anual_motor.mjs:77`) y otra magnitud
  (potencia de string, no POA/m²). Los 365 días a 1 min, con el lazo de
  `control_core` a ciclo de 1 s (`tools/anual_motor.mjs:168`,
  `c.ctrl = { on: true, db: 1.0, slew: 0.17, cicloSeg: 1, modo: 'libre' };`).
  No la llama nadie.

**Variante:**

- la GENÉRICA de `tools/gen_golden_anual.mjs:83-101`: 10 filas, paso 6 m,
  cuerda 2,382 m, θmáx 55°, pendiente 4°, lat 41,5763, lon −0,7981, huso +2,
  alt 300 m, albedo 0,20;
- montada para la página como en `backtracking.html:4898`
  (`z[i]=-i*c.pitch*Math.tan(v*RAD)`): monofila, tilt N-S 0, z0 0,17, nb 2,
  IAM 0,05;
- las nueve políticas.

**TEST NULO, primero.** Con el lazo DESARMADO (`paso()` = identidad), el botón da
lo mismo que el informe con nubes 0 en **9 de 9 políticas** (|error relativo|
≤ 1e-12; las dos rutas suman en distinto orden). **La única diferencia entre
las dos rutas de la página era el lazo** (y el cielo, si el deslizador no está
a 0).

| política | botón (lazo, claro) | informe cc = 0 | **LAZO** (botón − informe 0) | informe cc = 0,3 | **CIELO 0,3** | informe cc = 0,6 | **CIELO 0,6** |
|---|---|---|---|---|---|---|---|
| astro | 2.543,2827 | 2.543,9374 | −0,026 % | 1.748,4720 | −31,27 % | 1.115,1367 | −56,16 % |
| global | 2.561,0775 | 2.606,6096 | −1,747 % | 1.774,0299 | −31,94 % | 1.127,5733 | −56,74 % |
| row | 2.561,0775 | 2.606,6096 | −1,747 % | 1.774,0299 | −31,94 % | 1.127,5733 | −56,74 % |
| bt2d | 2.525,6557 | 2.524,1392 | +0,060 % | 1.742,6896 | −30,96 % | 1.120,3839 | −55,61 % |
| pairwise | 2.561,0767 | 2.606,6089 | −1,747 % | 1.774,0293 | −31,94 % | 1.127,5737 | −56,74 % |
| true3d | 2.561,0767 | 2.606,6089 | −1,747 % | 1.774,0293 | −31,94 % | 1.127,5737 | −56,74 % |
| mgl | 2.561,5503 | 2.537,8763 | +0,933 % | 1.750,4380 | −31,03 % | 1.123,1480 | −55,74 % |
| optimal | 2.580,9887 | 2.618,1172 | −1,418 % | 1.777,4177 | −32,11 % | 1.127,5955 | −56,93 % |
| optfree | 2.582,1731 | 2.620,3465 | −1,457 % | 1.778,3871 | −32,13 % | 1.127,7732 | −56,96 % |

kWh/m²·año. Máquina OCUPADA: el coste no es medida de tiempo.

**Lo que dice, por la ganancia sobre `astro`** (lo único comparable entre rutas):

| política | botón | informe cc = 0 | informe cc = 0,6 |
|---|---|---|---|
| pairwise (y global, row, true3d) | **+0,700 %** | **+2,464 %** | +1,115 % |
| mgl | +0,718 % | −0,238 % | +0,718 % |
| optimal | +1,483 % | +2,916 % | +1,117 % |
| optfree | +1,529 % | +3,004 % | +1,133 % |
| bt2d | −0,693 % | −0,778 % | +0,471 % |

- **El informe publicaba para el backtracking una ganancia 3,5 veces la del
  botón** (+2,46 % frente a +0,70 % en `pairwise`). Es el mismo sesgo que v1.71
  había cerrado en el botón («el backtracking gana +2,638 % … cuando con el
  lazo gana +0,255 %», `tools/test_anual_lazo.mjs:6-9`), vivo en la otra ruta.
- Con nubes, el informe cambia el orden de las políticas (`mgl` pasa de
  −0,24 % a +0,72 %). Y las nubes contradicen al propio deslizador, cuya ayuda
  declara: «Cobertura nubosa del DÍA simulado… La tabla ANUAL sigue siendo cielo
  claro y lo declara» (`backtracking.html:169`).
- **Es otro caso del patrón «el código y su descripción dejaron de coincidir»**
  (`audit5/PATRON_CODIGO_Y_DESCRIPCION.md`, rama de #749, que ya registra
  siete). La ayuda del deslizador promete un anual de cielo claro y el informe
  le aplicaba nubes. Se registra como octavo candidato cuando ese registro se
  integre; aquí queda la cita.
- **La interacción lazo × cielo no se puede medir con el código de hoy:**
  ninguna ruta tenía lazo Y nubes. Se dice, no se inventa.
- **`anual_motor`** (`astro` y `pairwise`, 365 días a 1 min, lazo de
  `control_core` a ciclo de 1 s; `audit5/out/P2_1_tres_rutas_motor.txt`):
  ganancia de `pairwise` sobre `astro` **+0,288 %**. Sus kWh son suma de
  strings (392.881,89 → 394.015,34), no POA/m², y no se comparan en valor.
  **Las tres rutas daban TRES cifras para la misma ganancia:**

  | ruta | ganancia de `pairwise` sobre `astro` |
  |---|---|
  | `anual_motor` | +0,288 % |
  | botón | +0,700 % |
  | informe | +2,464 % |

  Entre `anual_motor` y el botón cambian a la vez cinco cosas, y **no se han
  separado**:
  - 365 días frente a 12 representativos;
  - 1 min frente a 10 min;
  - el lazo de `control_core` (ciclo de 1 s, modo libre) frente a `crearLazo`;
  - la cadena eléctrica de string frente a la POA;
  - el motor de `produccion.html` (la planta genérica montada por
    `gen_golden_anual`) frente al de la página.

  Se declara así, sin atribuir la diferencia a ninguna de ellas.

## 2.2 · Unificadas en una: sobrevive la del BOTÓN

`function* anualGen(c,T,Tcfg,POLS)` (`backtracking.html`, antes del botón del
año). Hace:

- el lazo por política y por día;
- el paso único `PASO_ANUAL_MIN=10`;
- **cielo CLARO**;
- la rama por mesa con mesas (paso 1).

Devuelve la energía de cada día representativo (kWh/m² y W/m² medios, lo que
pintan las curvas del informe) y el total del año ponderado por días.

**Por qué sobrevive esa:**

- CON lazo es la doctrina de v1.71: se publica lo que la planta EJECUTA, no lo
  que pide.
- Cielo claro es lo que el deslizador declara del anual.
- La otra ruta de la página solo se diferenciaba en eso (test nulo del 2.1).

**Las vistas pasan a ser consumidoras:**

- el **botón** la drena de una vez: `const tot=drenaGen(anualGen(c,T,Tcfg,POLICIES.filter(P=>P.on))).tot;`;
- el **informe** la consume con `yield*`, para que la página siga viva mientras
  calcula: `const r=yield* anualGen(DAY.c,DAY.T,DAY.Tcfg,POLS);`;
- ninguna de las dos calcula por su cuenta;
- la nota de la tabla del informe, que decía que la columna del año iba «sin
  lazo», se ha corregido.

**`tools/anual_motor.mjs` NO se funde.** Mide otra magnitud (kWh de string y
consumo de motor), en otro motor (`produccion.html`) y a 1 min con ciclo de
1 s, porque su pregunta —cuánto come el motor— solo tiene sentido con el lazo
real sobre una rejilla que el actuador no pueda saltarse
(`tools/anual_motor.mjs:13-19`). No es una vista de la cifra anual de la
página y no la publica ninguna vista. Queda como herramienta de medida, y el
banco exige que su lazo real esté encendido.

**Efecto:**

- **El botón no cambia de cálculo.** Solo cambia el orden de la suma (por día y
  luego × días del mes, en vez de paso a paso × días del mes).
- **El informe pasa a publicar lo del botón:** para `pairwise`, en la genérica,
  de +2,464 % a +0,700 % sobre `astro` (tabla del 2.1).
- **Comprobado con el arnés** (`tools/test_anual_lazo.mjs`, CONDUCTA): el botón
  y el informe dan el MISMO total bit a bit, con el deslizador de nubes a 0,6.

## 2.3 · El banco cubre TODAS las rutas

`tools/test_anual_lazo.mjs`, **10/10**. Antes cortaba su fuente en el `onclick`
del botón y no veía `grAnualGen` (sexto caso del registro del patrón). Ahora
cubre:

- **la ruta única:** lazo por día y por política, lo que se suma es la salida
  del lazo, paso único y coherente, cielo claro y rama por mesa;
- **los dos consumidores:** consumen y no calculan (sin `policyAngles`,
  `poaPlant`, `clearskyIneichen` ni lazos propios);
- **`tools/anual_motor.mjs`:** con su lazo real encendido;
- **la conducta:** la página cortada tal cual; botón = informe, bit a bit.

**Control negativo, ruta por ruta.** Cada mutante pone el banco ROJO y dice por
qué:

| mutante | lo que dice el banco |
|---|---|
| lazo desarmado en la ruta única | «lo que se suma no sale del lazo» y «el lazo no recibe el paso del bucle» |
| el botón calcula por su cuenta, sin lazo | «el botón del año calcula por su cuenta en vez de consumir la ruta» |
| el informe calcula por su cuenta, sin lazo y con nubes | «el informe (grAnualGen) calcula por su cuenta en vez de consumir la ruta» |
| nubes dentro de la ruta única | «la ruta anual no es de cielo claro» |
| lazo desarmado en `tools/anual_motor.mjs` | «tools/anual_motor.mjs no enciende el lazo real» |
| (conducta) lazo desarmado | el anual cambia: 2.568,5089 → 2.606,7332 kWh/m² en `pairwise`, 4 filas |

Y el banco nuevo contra la página del paso 1, que tenía dos rutas, sale ROJO.
