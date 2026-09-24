# P1 · `pairDz` es UN escalar por pareja de LÍNEAS enteras; la línea no es una unidad de control

**Evidencia y opciones. No se arregla nada en este paso; P2 espera la decisión
del titular.** Sonda: `audit4/P1_alcance_pairdz.mjs` →
`audit4/out/P1_alcance_pairdz.txt` (las citas se imprimen leyendo el fichero).

## Qué es el backtracking, para que el enunciado sea correcto

Retrocede desde el ángulo astronómico hasta la **tangencia**: el ángulo al que la
sombra del borde alto de la fila emisora roza el borde bajo de la receptora sin
entrar. Depende de tres cosas: el ángulo solar proyectado en el plano
perpendicular al eje, el GCR y la pendiente transversal **entre las dos filas de
esa pareja**. De ahí:

- la tangencia es **por pareja de filas vecinas**, no por línea;
- la pendiente transversal de una pareja **no es un escalar**: Δz varía a lo largo
  del eje, porque cada tracker está a su cota y con su propia inclinación N-S;
- **retroceder cuesta haz**: un θ más cerrado de lo necesario es pérdida neta, tan
  defecto como uno que sombrea.

La unidad que puede **ejecutar** un ángulo distinto es el accionamiento: cada
tracker tiene su TCU; el acople real existe solo dentro de un motor (bifila,
hasta cuatro mesas). **La «línea» del simulador no es una unidad de control: es
una agrupación geométrica del código.**

## P1.1 · El hallazgo, con su alcance

### Las dos citas enfrentadas

```
1729│   // Δz por PAREJA medido en el SOLAPE norte de las dos líneas — la cota media
1730│   // de línea engaña cuando las líneas van escalonadas y no comparten norte
1731│   // (fabricaba pendientes absurdas y sombras del 85% en pairwise); sin solape,
1732│   // Δz=0: esas líneas no interactúan (la cobertura axial ya lo pone a cero)
```
```
1737│     for(let ai=0;ai<A.length;ai++)for(let bi=0;bi<B.length;bi++){
1738│       const lo=Math.max(A[ai][0],B[bi][0]),hi=Math.min(A[ai][1],B[bi][1]);
1739│       if(hi<=lo)continue;
   …
1743│       acc+=(za-zb)*len;w+=len;
1744│     }
1745│     pairDz.push(w>0?acc/w:0);
```

El comentario dice «SOLAPE norte»; el bucle recorre **todas** las mesas de la
línea i contra **todas** las de la i+1 y promedia por longitud de solape. **El
código y su descripción llevan tiempo discrepando**, y es lo que hizo que nadie
mirara `pairDz`: se leía el comentario.

### Medido (Ayora, banda del encargo, 106 parejas)

| | valor |
|---|---|
| filas distintas que entran en el **único** Δz de cada pareja | mín **2** · mediana **14** · máx **35** |
| parejas en que `pairDz` = Δz del solape norte (lo que dice el comentario) | **0 de 106** (peor diferencia **0,2523 m**) |
| parejas con dzMin ≠ dzMax (Δz no es un escalar a lo largo del eje) | **106 de 106** |

### El contrato de la ruta por línea: UN θ por línea

```
1185│ function anglesPairwiseRaw(zen,az,T){
1187│   const nR=T.pairs.length+1, out=new Array(nR);
3763│   return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false),irr,doy,albedo),f:undefined};
```

Nota de vocabulario, porque decide la tabla: en el código **«fila» = índice de
línea** (`:1186` «filas interiores adoptan min(|θ|) de sus dos parejas», con `r`
recorriendo líneas; `:1236` «por fila INDEPENDIENTE»). En los presets una línea
es una fila; en una planta con levantamiento, una línea agrupa hasta 35 filas
(trackers) de Ayora. Los enunciados se escribieron con la primera acepción.

### Las nueve políticas: ¿el colapso por línea es fiel a su definición?

Enunciados: `POLICIES`, `backtracking.html:4449-4457`. Mando por mesa en el día:
`POL_POR_MESA`, `:5408` («el resto sigue repartiendo el ángulo de su línea, que es
lo declarado», `:5404-5407`).

| política | enunciado (cita) | ruta por línea (cita) | ¿usa `pairDz`? | **¿colapso por línea fiel a su definición?** | ¿por mesa en el día? |
|---|---|---|---|---|---|
| `global` | «un motor, un ángulo: pendiente media de la planta» `:4450` | `anglesGlobal` `:1246`: un θ para todas (`fill(th)`) | sí, vía `meanPair` | **SÍ** — un θ común ES la política | no (no hace falta) |
| `bt2d` | «ignora el relieve (pvlib sin pendiente) — un tracker sin configurar» `:4452` | `anglesBt2d` `:2410`: un θ, tilt 0, pendiente 0 | no | **SÍ** — ignorar el relieve ES la política | no (no hace falta) |
| `astro` | «sin backtracking — el que auto-sombrea (referencia)» `:4449`, cerebro `tcu` | `anglesAstro` `:1253`: tilt medio de la línea (`rowTiltAt`) | no (sin BT, pvlib ignora la pendiente) | **NO** — cada TCU sigue al sol con SU tilt; la línea promedia hasta 35 | sí |
| `row` | «cada fila con su terreno local, sin acoplar (A&M 2020)» `:4451` | `anglesRow` `:1235`: media de las dos parejas de la LÍNEA | sí | **NO** — «terreno local» de cada fila ≠ media de línea | no |
| `pairwise` | «por pareja; interiores min(\|θ\|)» `:4453` | `anglesPairwiseRaw` `:1185` | sí | **NO** — la pareja física es de filas vecinas; aquí es de líneas | sí |
| `true3d` | «bisección 3D: azimut + tilt N-S» `:4454` | `anglesTrue3d` `:1292`, parte de `anglesPairwise` `:1296` | sí (hereda) | **NO** — su tilt N-S es el de cada tracker | no |
| `mgl` | «pairwise + décimas por los bordes, con su misma guardia» `:4455` | `anglesMinGroundLight` `:2431`, parte de `anglesPairwise` `:2436-2437` | sí (hereda) | **NO** — hereda la pareja de líneas | no |
| `optimal` | «Deeptrack … (argmax POA neto)» `:4456` | `anglesOptimal` `:2940`, base `anglesPairwise` `:2944` | sí (hereda) | **NO** — la casa ya decidió por mesa en v1.77 porque por línea perdía por su propia métrica en 58 de 86 instantes (`docs/algoritmos_backtracking.html`, banda de cambios) | sí |
| `optfree` | «cada accionamiento con SU fracción» `:4457` | `anglesOptimalFree` `:3088`, base `anglesPairwise` `:3089` | sí (hereda) | **NO** — su enunciado nombra el accionamiento | sí |

**Lectura:** el colapso por línea es fiel en **2 de 9** (`global`, `bt2d`), que
mandan un ángulo común por definición. En las otras **7** contradice su propio
enunciado. `pairDz` entra en **7 de 9** (todas menos `astro` y `bt2d`); cinco de
ellas lo heredan a través de `anglesPairwise`.

## P1.2 · La contradicción del encargo, con sus opciones (sin recomendar)

El encargo manda pasar `pairDz` a por fila; `policyAngles` devuelve un valor por
línea (`:1187`, `:3763`). Ningún cálculo de Δz da grados de libertad que el
contrato de esa ruta no tiene.

Lo que ya está medido y pesa en las tres opciones (medida (c), autorizada
rompiendo R1; `audit4/out/F_sombra_extremos_p2.txt`, controles en
`audit4/out/H_p2_controles.txt`):

| clase (ruta por línea, pairwise) | hoy | P2 reproducido en el arnés | cambio |
|---|---|---|---|
| **T5a** · evitable en rango, solapa, resoluble con un θ por línea | 6.829 extremos · 781 mesas | 5.566 · 736 | **−18,5 %** |
| T5a con sol ≥ 10° | 3.394 · 254 | 2.445 · 197 | −28,0 % |
| T5b · no solapa | 2.914 · 465 | 2.801 · 452 | −3,9 % |
| T5b · exigiría θ distintos dentro de la línea | 282 · 119 | 282 · 119 | 0 |
| puerta P0 (pareja 2, norte, 21-jun) | 135,3 mm | **0 mm** | cerrada |

Controles antes del recuento: la media reconstruida es `pairDz` con diferencia
**0 exacto** en las 106 parejas; el arnés en modo «media» reproduce
`policyAngles('pairwise')` con **0 exacto** en 193 instantes × 107 líneas; y los
candidatos de P2 difieren de los de hoy en **10.621 de 20.458** pareja×instante
(θ final distinto en 3.706 de 20.651 línea×instante, hasta 14,99°). Supuesto
declarado del arnés: las etapas después del candidato (reparación por torsión,
`driveCoupleSafe`, `repairNoShade`) ven la pendiente media, como hoy.

### (a) Cambiar el contrato de la ruta por línea a un θ por fila

- **Arregla:** las 7 políticas cuyo enunciado no es un ángulo común, **si** cada una
  se reescribe por fila. Hoy ninguna de las siete tiene versión por fila en la
  ruta por línea; `row`, `true3d` y `mgl` tampoco la tienen por mesa.
- **Deja fuera:** nada por definición; en la práctica, todo lo que no se reescriba.
- **Cuesta:** cambiar la forma de lo que devuelve `policyAngles`, que consumen
  `yearbtn`, `grAnualGen`, `poaPlant`, `crearLazo`, las curvas y la tabla, **y
  las otras tres cabezas de la casa** —overcast, el gemelo y el core— según el
  propio comentario de `:3739-3743`. Coste en tiempo de ingeniería y en energía
  publicada: **NO MEDIDO**. Para medirlo haría falta primero la versión por fila
  de cada política; no existe.

### (b) Dejarla por línea y que P2 solo mejore el candidato

- **Arregla:** el candidato de las **7** que usan `pairDz` (todas menos `astro` y
  `bt2d`). Medido para `pairwise`: cierra P0 y quita el **18,5 %** de T5a.
- **Deja fuera:** el **81,5 %** de T5a, T5b entero y todo lo que pide más de un θ
  por línea. Techo estructural: un escalar para hasta 35 filas. Y **empuja hacia
  el θ conservador**: el candidato extremo cierra el ángulo para toda la línea
  aunque solo lo necesite una pareja de filas, y eso es haz perdido que nadie
  compensa.
- **Cuesta:** diff mínimo (un bucle y dos candidatos por pareja). Energía: **NO
  MEDIDA** —el arnés da θ, no el anual—; medirla es correr `D_anual_ayora.mjs`
  con la cadena del arnés en vez de `policyAngles` (≈ el mismo tiempo que la
  corrida de línea de P1.3).

### (c) Que las rutas anuales consuman la rama por mesa

> **`global` y `bt2d` NO deben migrar a la rama por mesa.** En esas dos el
> colapso a un ángulo común **es la política** (`:4450` «un motor, un ángulo»;
> `:4452` «ignora el relieve … un tracker sin configurar»; su código devuelve un
> único θ para todas, `:1246` y `:2410`). Aplicar (c) a las nueve sin distinguir
> rompería las dos que están bien. El alcance de (c) es `POL_POR_MESA` (`:5408`),
> que ya las deja fuera.

- **Arregla:** las **4** de `POL_POR_MESA` (`pairwise`, `astro`, `optimal`,
  `optfree`, `:5408`) en el anual, que pasaría a publicar lo mismo que el día.
- **Deja fuera:** `row`, `true3d` y `mgl`, que tampoco van por mesa en el día
  (`:5404-5407`), y hereda los dos defectos de la rama por mesa medidos en P0: la
  sombra sobre mesas que no solapan (C5) y la x de línea en vez de la de fila (C6).
- **Cuesta:** ver P1.3 — energía y tiempo medidos en Ayora, con la banda de la
  página.

## P1.4 · Lo que decide P2

- **P3 no cambia nada en Ayora**: 0 de 106 parejas con Σlen = 0. Eso **no** es que
  P3 sobre: el defecto D2 existe en el código (`:1745`, `w>0?acc/w:0`) y no se
  manifiesta en esta banda. Por eso T3 va sobre el caso sintético.
- **Las dos rutas tienen defectos distintos y no intercambiables.** En la ruta por
  línea la x de fila no explica casi nada (persiste el 97-99 % con la x de línea):
  el defecto es el promediado. En la ruta por mesa, la x de línea se lleva el
  92,6 %. Un solo arreglo no sirve para las dos.

## P1.3 · El anual publicado deja a `pairwise` un 13,1 % por DEBAJO del astronómico en Ayora; por mesa queda un 1,7 % por encima

Sonda: `audit4/D_anual_ayora.mjs` → `audit4/out/D_anual_ayora_<política>.json`.
Ayora con la banda que **carga la página** (`plantFromCotas(data, 80, 0)`,
`backtracking.html:4810`: 79 líneas, 1.600 mesas), armada como `terrain(c)` y con
la TCU al corriente del levantamiento. El bucle es el de `yearbtn` (días 21, paso
10 min, un lazo por día). Las dos cadenas corren en la **misma pasada** sobre los
mismos instantes, y se cronometra cada una por separado. Las corridas van
**seguidas y en la misma máquina** (4 CPU, carga ≈ 1,0 durante todas ellas, que es
la propia corrida). Es una **réplica** del bucle de la página, no la página, y va
en UTC+1 fijo.

Test nulo: la banda lleva tilt propio por mesa (torsión máxima 3,7143° respecto a
su línea), o las dos ramas coincidirían por construcción.

Control (A3), que va **delante** del titular: `astro` no hace backtracking, así
que por línea y por mesa solo difieren en la métrica y en promediar tilts. Si
diera un hueco parecido al de `pairwise`, el hueco sería del instrumento.

| política | meses | **por línea** (lo que publica el anual) | **por mesa** (lo que publica el día) | **Δ %** | \|Δθ\| máx | s línea | s mesa | mesa/línea |
|---|---|---|---|---|---|---|---|---|
| `astro` (control) | 12/12 | 2654.9656 | 2659.3533 | **+0.1653 %** | 1.7618° | 418 | 421 | 1.01× |
| `pairwise` | 12/12 | 2307.0294 | 2705.1154 | **+17.2554 %** | 59.0000° | 910 | 409 | 0.45× |
| `optimal` | **8/12 · COTA** (tope de 7.200 s agotado) | 2092.3610 | 2111.1432 | **+0.8977 %** | 46.2785° | 5307* | 2390* | 0.45×* |
| `optfree` | (en curso) | | | | | | | |

\* `optimal` se cronometró con la ablación corriendo en la misma máquina (carga 2,0 al acabar): sus segundos absolutos no son comparables con los de `pairwise`/`astro`; el cociente mesa/línea sí, porque las dos cadenas se miden en la misma pasada y paso a paso. Y es una **cota**: 8 de 12 meses (ene-ago), sin extrapolar.

kWh/m² de planta. Mes a mes (el hueco no es de un mes raro: está en los doce):

| mes | pairwise línea | pairwise mesa | Δ | astro línea | astro mesa | Δ |
|---|---|---|---|---|---|---|
| 1 | 94.3427 | 115.8701 | +22.82 % | 112.9879 | 113.7644 | +0.69 % |
| 2 | 130.5014 | 157.1278 | +20.40 % | 153.6760 | 154.3710 | +0.45 % |
| 3 | 201.7068 | 238.3257 | +18.15 % | 233.0148 | 233.4932 | +0.21 % |
| 4 | 249.4253 | 289.8802 | +16.22 % | 284.5395 | 284.7133 | +0.06 % |
| 5 | 292.4163 | 335.9684 | +14.89 % | 331.0711 | 330.8848 | -0.06 % |
| 6 | 293.7591 | 336.1529 | +14.43 % | 331.8750 | 331.5924 | -0.09 % |
| 7 | 290.7571 | 333.9908 | +14.87 % | 329.1793 | 328.9867 | -0.06 % |
| 8 | 254.2996 | 295.6710 | +16.27 % | 290.2511 | 290.4439 | +0.07 % |
| 9 | 193.3304 | 228.3003 | +18.09 % | 223.3661 | 223.8222 | +0.20 % |
| 10 | 140.8964 | 169.4482 | +20.26 % | 165.7278 | 166.4947 | +0.46 % |
| 11 | 89.8097 | 110.4288 | +22.96 % | 107.6772 | 108.4303 | +0.70 % |
| 12 | 75.7847 | 93.9513 | +23.97 % | 91.5999 | 92.3562 | +0.83 % |

**Lecturas, cada una con su cifra:**

- El control sale a **+0.17 %**: la métrica no fabrica el hueco.
- `pairwise` por línea queda un **13.1 % por debajo de `astro` por línea**
  (2307.0 frente a 2655.0). Por mesa queda un **1.7 % por encima**
  (2705.1 frente a 2659.4). El backtracking por línea no solo sombrea: **retrocede
  mucho más de lo necesario**, y esa es pérdida de haz neta. Es el «θ demasiado
  conservador» del enunciado de P1, medido.
- **El coste de (c) no es un coste: la cadena por mesa tarda 0.45× lo que la de
  línea** en `pairwise` (409 s frente a 910 s) y 1.01× en `astro`.
- Contra la sintética de `D_anual_por_mesa` (+0,39 %), Ayora da **44 veces más**: el
  relieve real es donde el promediado por línea hace daño.

## La ablación: el retroceso de más lo produce el ACOPLE DE ACCIONAMIENTO de la ruta por línea, no `pairDz`

Sonda: `audit4/G_ablacion_anual.mjs` → `audit4/out/G_ablacion_anual.txt`. La ruta por
línea de `pairwise`, con cada etapa apagable (`audit4/lib_p2_arnes.mjs`,
`anglesLineaAblacion`), el mismo anual de Ayora (banda de la página, días 21,
paso 10 min).

**Controles, antes de contar:**
- fidelidad: con todo encendido el arnés da los θ de `policyAngles` con diferencia
  **0** en 21-jun y 21-dic, y el anual **2.307,0294** de `D_anual_ayora` exacto;
- test nulo (11.455 línea×instante): apagar cada etapa cambia el θ en el 5,4 %
  (torsión), 48,9 % (regla del más retrocedido), 5,0 % (reparación) y 64,4 %
  (acople); **`repairNoShade` no cambia nada: 0 de 11.455**, y su fila no informa.

| variante | anual kWh/m² | vs todo encendido | **cierra del hueco línea→mesa** (2.307,03 → 2.705,12) |
|---|---|---|---|
| todo encendido | 2.307,0294 | 0 | 0 |
| sin `pairThetaTorsion` (`:1121`) | 2.308,1028 | +0,047 % | 0,3 % |
| sin la regla del más retrocedido (`:1197`) | 2.307,3045 | +0,012 % | 0,1 % |
| sin la reparación por torsión (`:1198-1224`) | 2.306,9509 | −0,003 % | −0,0 % |
| **sin `driveCoupleSafe`** (`:789`) | **2.677,6999** | **+16,067 %** | **93,1 %** |
| sin `repairNoShade` (`:3492`) | 2.307,0294 | 0 | no informa (test nulo) |

**Lectura, con la cifra:** el 93,1 % del hueco entre la ruta por línea y la rama
por mesa lo produce **una sola etapa, el acople de accionamiento de la ruta por
línea**. Las etapas que tocan el candidato de la pareja —donde vive `pairDz`—
suman menos del 0,4 % del hueco. En Ayora la banda va en **bifila** (`T.groups`,
54 grupos): en la ruta por línea un grupo acopla **líneas enteras** y las lleva a
un θ común —el de la más restrictiva—, cuando el acople real es de las cuatro
mesas de un motor.

**Consecuencia para la decisión:** la opción **(b)** —dejar la ruta por línea y
que P2 solo mejore el candidato— actúa sobre etapas que, apagadas enteras, mueven
el anual menos de un 0,05 %. **No puede cerrar el 17 % del hueco.** Esto sí es
una medida, no una hipótesis.

## Lo que P1 deja medido, y lo que NO

- **Dirección del defecto:** la ruta por línea no pierde por sombrear de más,
  **pierde por retroceder de más**: `pairwise` por línea queda un 13,1 % por
  debajo de `astro`, y por mesa un 1,7 % por encima.
- **Qué etapa causa el retroceso: MEDIDO**, en la sección anterior: el acople
  de accionamiento de la ruta por línea, el 93,1 % del hueco.
- **Techo de (b):** en sombra, −18,5 % de T5a; en energía, las etapas que (b)
  toca mueven el anual < 0,05 % apagadas enteras, así que (b) no llega al hueco
  del 17 % aunque mejore su candidato. La energía exacta de (b) no se ha corrido.

## Lectura del revisor (no es la decisión)

Lectura del revisor: **(c)**, con (a) como trabajo posterior si alguna vez hace
falta esa ruta por sí misma. **Motivo, corregido:** no que el promedio proteja a
la peor fila —eso era una explicación sin medida y se retiró—, sino que la ruta
por mesa da un **17,3 % más de energía** en `pairwise` con el control de `astro`
en **+0,17 %**, y **cuesta menos tiempo** (409 s frente a 910 s). La decisión es
del titular y P2 no empieza hasta que la tome. Si (b) queda descartada o no lo
dice la ablación, no esta lectura — y la ablación dice que (b) no llega.
