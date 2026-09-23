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

(opciones y costes: ver la sección que sigue, completada con las medidas)
