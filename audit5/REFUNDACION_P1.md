# Refundación del BT · PASO 1 — La ruta anual pasa a la rama por mesa (P1 → c)

**Encargo «REFUNDACIÓN DEL BT» (titular, 2026-09-24), paso 1.** Rama
`claude/refundacion-p1-6th1im`, apilada sobre la fase A (#757). Simulador
**v1.81.0**. La física no cambia: solo cambian las dos rutas anuales de la
página, que están fuera del bloque FÍSICA PURA
(`tools/test_caras_bajo_demanda.mjs`, 9/9: la física es la declarada de v1.80.0).

**El porqué, en una frase.** La «línea» agrupa hasta 35 filas bajo un ángulo
cuando cada seguidor lleva su TCU. El anual decidía por línea y acoplaba las
DOS LÍNEAS ENTERAS de cada grupo, cuando el motor real mueve cuatro mesas.

## 1.1 · Antes de tocar nada: ¿qué parte del hueco es acoplar líneas enteras y qué parte un ángulo por línea?

`audit5/P1_1_separa_acople.mjs` → `audit5/out/P1_1_separa_acople.{txt,json}`.

**Variante:**

- `pairwise` con la física de `origin/main` (v1.78.1), la del +16 % del P1;
- Ayora, banda de la página: 79 líneas, 1.600 mesas, 400 motores
  (`T.segDrive`) y 40 grupos de línea (`T.groups`);
- 12 días (el 21 de cada mes), cada 10 min, cielo claro Ineichen, CON lazo;
- huso +1 y lat/lon de `ayora_layout.json`, el mismo montaje que
  `audit4/G_ablacion_anual.mjs` (rama `r4-correccion-bt-extremos`).

**La ablación del P1 mezclaba métrica y política.** Medía la línea con
`crearLazo → poaPlant` y la mesa con `crearLazoSeg → poaPlantSeg`
(`audit4/D_anual_ayora.mjs:13-14`, «línea: policyAngles → crearLazo →
poaPlant» y «mesa: policyAnglesSeg → crearLazoSeg → poaPlantSeg»). Aquí las
cuatro variantes se miden con la MISMA métrica por mesa, la del día.

| variante | qué es | anual (métrica por mesa) | vs L |
|---|---|---|---|
| **L** | ruta por línea publicada: `repairNoShade(driveCoupleSafe(anglesPairwise))`, que acopla las 2 líneas enteras de cada grupo y aplana el grupo emisor en 2.5D | 2.253,6664 | 0 |
| L0 | θ de línea SIN acople (la fila «sin `driveCoupleSafe`» del P1) | 2.685,2794 | +19,152 % |
| **LM** | θ de línea acoplado POR MOTOR: `applyDriveSeg(segsBroadcast(anglesPairwise), segDrive)` | 2.683,0381 | +19,052 % |
| **M** | rama por mesa publicada: `applyDriveSeg(anglesPairwiseSeg, segDrive)` | 2.705,1154 | **+20,032 %** |

**Hueco L → M en la misma métrica: 451,449 kWh/m² (+20,032 %).**

- **Acoplar LÍNEAS ENTERAS** (LM − L): 429,372 kWh/m², el **95,1 %** del
  hueco.
- **Un ángulo por línea** (M − LM): 22,077 kWh/m², el **4,9 %** del hueco.
- **Métrica sola:** la misma ruta L vale 2.307,0294 con la métrica de línea y
  2.253,6664 con la de mesa, un **−2,313 %**. La métrica de línea infla la ruta
  por línea en Ayora.
- El +16,067 % del P1 (L → L0, métrica de línea) es +19,152 % en la de mesa.

**La cifra del P1, reescrita (lo pide el titular).** El hueco que el P1
publicó, 2.307,0294 (ruta por línea medida con `poaPlant`) → 2.705,1154 (rama
por mesa medida con `poaPlantSeg`), es de +398,086 kWh/m², un **+17,26 %**. Se
descompone en:

| parte | de → a | kWh/m² | del hueco del P1 |
|---|---|---|---|
| **ruta** (misma métrica por mesa) | L 2.253,6664 → M 2.705,1154 | **+451,449** | **113,4 %** |
| **métrica** (la misma ruta L, de línea a mesa) | 2.307,0294 → 2.253,6664 | **−53,363** | **−13,4 %** |

- La métrica de línea **tapaba** parte del defecto: la ruta por línea parecía
  mejor de lo que es.
- **P1 → (c) sigue siendo correcta por arquitectura y la medida la refuerza.**
  Su cifra se reescribe: en la misma métrica el hueco es **+20,03 %**, no
  +17,26 %.
- El «93,1 % del hueco lo produce `driveCoupleSafe`» del P1
  (`audit4/P1_ALCANCE_PAIRDZ.md:259`) es, en la misma métrica, el **95,6 %**
  (L → L0: 431,613 de 451,449).
- **No contradice la premisa del paso** (P1 → c): la confirma. No hay
  refutación que publicar.

**Controles, antes de contar:**

1. **Fidelidad.** L con la métrica de línea da **2.307,0294** y M con la de mesa
   **2.705,1154**. Son las cifras de `audit4/out/D_anual_ayora_pairwise.json`,
   exactas.
2. **Test nulo** (21-jun y 21-dic, cada 10 min, 232.000 mesas×instante). Las
   dos variantes tienen que dar θ distintos: LM ≠ L en el **56,4 %** (mayor
   |Δθ| 57,0°) y LM ≠ M en el **87,6 %** (mayor 28,4°). Las dos mitades de la
   descomposición informan.
   **Control negativo del detector:** LM contra sí misma da 0 diferencias.

**Grado de evidencia:** medido, en una planta (Ayora), una política
(`pairwise`) y la física de main. San José y las otras ocho políticas no están
descompuestas.

**Lectura.** El defecto es la unidad del acople, no el ángulo de línea. Acoplar
por motor el mismo θ de línea ya recupera el 95 % del hueco. Eso anticipa el
paso 3: retirar `driveCoupleSafe` donde la unidad ya es el motor.

## 1.2 · Las rutas anuales consumen la rama por mesa

Con mesas (`segOn(T)`), las DOS rutas anuales de la página hacen lo que el día:
`segCmd` → lazo por mesa → `poaPlantSeg`.

- **Botón del año** (`backtracking.html:7813-7839`):
  `const a=segA?segCmd(P.key,g.zen,g.az,Tcfg,T,irr,doy,c.albedo):policyAngles(…)`,
  `LZ[P.key]=segA?crearLazoSeg():crearLazo()` y
  `(segA?poaPlantSeg(…):poaPlant(…)).plant`.
- **Informe gráfico** (`grAnualGen`, `:9805-9819`): lo mismo, sin lazo (el
  paso 2 unifica las rutas).
- **Alcance, el de `POL_POR_MESA`.** `segCmd` (`:5610-5619`) manda por mesa solo
  a `pairwise`, `astro`, `optimal` y `optfree` (`:5600`,
  `const POL_POR_MESA={pairwise:1,astro:1,optimal:1,optfree:1};`). El resto
  reparte a sus mesas el ángulo de su línea. **`global` y `bt2d` NO migran**:
  en ellas el colapso a un ángulo ES la política. Cambia dónde se miden (por
  mesa), no qué deciden.
- **Condición.** Solo con la TCU al corriente del levantamiento
  (`Tcfg === T`). Si no, `segCmd` manda por línea por diseño.
- **Sin mesas, todo sigue como antes**, bit a bit (test nulo del 1.4).

**Banco** `tools/test_anual_lazo.mjs`, 16/16. Se añaden tres comprobaciones:

- las dos rutas usan `segCmd → crearLazoSeg → poaPlantSeg`;
- el corte de `grAnualGen` no está vacío;
- **control negativo:** con el anual por línea de antes, las dos se ponen rojas.

Las dos comprobaciones viejas que exigían literales (`policyAngles(` y un solo
`,lim,`) se reescribieron para seguir al dato por las dos ramas.

## 1.3 · Se elige por CORRECCIÓN, no por coste

Queda escrito en el código (`backtracking.html:7814-7825`) y aquí. La rama por
mesa **solo ahorra tiempo en `pairwise`**: 0,45× la de línea, 409 s frente a
910 s con la máquina libre. En **`optfree` cuesta 1,41×**, con cota de 4 meses
y la máquina compartida (R4 P1, `audit4/P1_ALCANCE_PAIRDZ.md:230-236`). Se
migra porque la ruta por línea mide otra planta, no porque sea más barata.

## 1.4 · Efecto antes/después en las nueve

**ANTES** = `backtracking.html` de la fase A (v1.80.0). **DESPUÉS** = esta rama
(v1.81.0). `audit5/P1_4_efecto_anual.mjs` ejecuta el **código real** de las
rutas anuales. `audit5/lib_anual_pagina.mjs` corta de la página el bucle del
botón y `grAnualGen`, más `segOn`, `POL_POR_MESA` y `segCmd`, y los corre con
su física. No es una reimplementación.

- **Día: sin cambio, por construcción.** El diff de este paso solo toca
  `$('yearbtn').onclick`, `grAnualGen`, `VER`, el banco y el documento; la
  serie del día no se toca.
- **TEST NULO, preset senoidal sin mesas:** las nueve políticas, antes y
  después, **idénticas bit a bit** (`audit5/out/P1_4_senoidal_boton.json`):
  astro 2.509,4136 · global 2.463,6024 · row 2.463,3784 · bt2d 2.465,7726 ·
  pairwise 2.225,6266 · true3d 2.214,7684 · mgl 2.225,8037 · optimal
  2.509,9272 · optfree 2.510,6756 kWh/m²·año.
- **Ayora, las nueve, ruta del botón: EN CURSO.** Una corrida por política.
  Su control negativo es que, con mesas, antes y después tienen que diferir.

## Errores propios (E-X1)

- **E-X1-R1-1.** El script del 1.1 se escribió y lanzó desde el worktree de la
  fase A (`cz-fa`) y no desde el de este paso. Se vio antes del commit de la
  fase A: se excluyó allí y se trajo aquí al terminar la corrida. No llegó a
  ningún PR equivocado.
