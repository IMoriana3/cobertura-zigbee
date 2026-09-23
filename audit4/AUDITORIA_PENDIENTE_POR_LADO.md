# Auditoría: cómo se obtiene la pendiente a cada lado de cada fila

> **Para un revisor externo.** Autocontenido. Todos los números son de la planta
> **Ayora** y salen de correr `audit4/E_pendiente_por_lado.mjs`, que llama a la
> **misma función** que usa la aplicación y enseña lo que sale.
>
> **Control del propio volcado**: la reconstrucción del solape que se enseña
> abajo reproduce el `pairDz` que guarda la función real con diferencia
> **0,000·10⁰ m en las 106 parejas** de la banda. Sin eso, el trazado enseñaría
> otra cosa que la que se ejecuta.

---

## El problema

Un seguidor de un eje sombrea a su vecino, y cuánto depende de **la pendiente
del terreno entre los dos ejes**. Una fila del interior tiene **dos vecinos**,
uno a cada lado, y **dos pendientes distintas**. Hay que decidir con cuál se
calcula su ángulo.

Esto describe cómo se obtiene cada una de esas dos pendientes a partir del
levantamiento, y qué se hace con ellas.

---

## PASO 1 · De seguidores a líneas

El levantamiento trae, por cada **fila** de cada seguidor:

| campo | qué es |
|---|---|
| `x` | posición este-oeste del eje (m) |
| `n = [n₀, n₁]` | las dos puntas de la fila, en coordenada norte (m) |
| `y = [y₀, y₁]` | **las dos cotas del módulo** en esas puntas (m, relativas a una base) |
| `nm`, `ym` | el punto del **accionamiento** (el «morro»), si se midió |
| `art` | la fila está **articulada**: las dos mitades quiebran en el morro |

Las filas se agrupan en **LÍNEAS** por su `x`, con tolerancia **medio pitch**.
Una línea es la sucesión de filas alineadas en la misma `x`, una detrás de otra
en norte: en Ayora, líneas de varios cientos de metros.

Luego la planta se parte en **BLOQUES** por los huecos de `x` mayores que
**2,5 · pitch** — las calles. Se trabaja sobre un bloque, o sobre la planta
entera declarándolo.

> En Ayora: **751 seguidores** → **107 líneas** en la banda cargada.

---

## PASO 2 · Cada fila son DOS mesas

Un bifila son cuatro mesas: dos por fila, una al norte del morro y otra al sur.
El corte va en `nm` si el levantamiento midió el accionamiento y la fila está
articulada; si no, en el punto medio interpolado. **Cada mesa guarda sus dos
extremos en norte y sus dos cotas.**

Esto importa porque hasta la v1.47 la fila entraba como **una** mesa con la
pendiente media de la viga, y eso enseñaba «dos mesas de la misma fila con el
mismo tilt» donde el levantamiento dice que no lo tienen. Medido: en San José
hay **4.145 filas articuladas**, con pendiente sur frente a norte de **1,27 %
de mediana y hasta 15,4 %**. En Ayora son **34 de 1.508** (el resto es tubo
rígido, y ahí las dos mesas sí comparten pendiente).

---

## PASO 3 · El Δz se mide SOLO donde las mesas se solapan en norte

Para cada par de líneas consecutivas *i*, *i+1*:

```
para cada mesa a de la línea i, y cada mesa b de la línea i+1:
    solape = [ max(a.inicio, b.inicio) , min(a.fin, b.fin) ]
    si el solape está vacío  → esa pareja de mesas NO cuenta
    mid    = punto medio del solape
    len    = longitud del solape
    za     = cota de la mesa a interpolada linealmente en mid
    zb     = cota de la mesa b interpolada linealmente en mid
    acumula (za − zb) · len

pairDz_i = Σ (za−zb)·len  /  Σ len
```

**Sin solape, Δz = 0**: esas dos líneas no interactúan, y la cobertura axial ya
lo pone a cero. La media de línea engañaba cuando las líneas van escalonadas y
no comparten norte — fabricaba pendientes absurdas y sombras del 85 % en
`pairwise`.

### El caso trabajado: la línea 3 de Ayora

**Su lado OESTE** (pareja 2: líneas 2 y 3):

| mesa de la 2 | mesa de la 3 | solape en norte (m) | largo | z(2) | z(3) | Δz |
|---|---|---|---|---|---|---|
| 0 | 0 | −832,3 … −804,5 | 27,76 | 15,0780 | 14,8561 | 0,2218 |
| 1 | 1 | −803,9 … −776,2 | 27,78 | 13,7578 | 13,6477 | 0,1101 |

**Δz ponderado = 0,165977 m** sobre Σlargo = 55,54 m.

**Su lado ESTE** (pareja 3: líneas 3 y 4):

| mesa de la 3 | mesa de la 4 | solape en norte (m) | largo | z(3) | z(4) | Δz |
|---|---|---|---|---|---|---|
| 0 | 0 | −832,3 … −811,0 | 21,36 | 14,9941 | 14,7451 | 0,2490 |
| 0 | 1 | −810,4 … −804,5 | 5,88 | 14,3897 | 14,1532 | 0,2365 |
| 1 | 1 | −804,0 … −776,2 | 27,80 | 13,6482 | 13,4269 | 0,2213 |

**Δz ponderado = 0,233665 m** sobre Σlargo = 55,05 m.

> Nótese que **las mesas no se corresponden una a una**: la mesa 0 de la línea 3
> solapa con las mesas 0 **y** 1 de la línea 4, porque los morros no están
> alineados. Por eso el cruce es todas contra todas y no por índice.

---

## PASO 4 · De Δz a pendiente transversal

```
dx_i    = x(línea i+1) − x(línea i)          ← pitch REAL de ese vano
slope_i = atan2( pairDz_i , dx_i )           [grados]
pitch_i = dx_i
```

**El pitch es el real de cada vano, no el de proyecto.** La planta trae huecos
y calles, y asumir pitch uniforme falsearía las pendientes.

Para la línea 3 de Ayora:

| lado | Δz (m) | dx (m) | `slope` | en % |
|---|---|---|---|---|
| **oeste** (pareja 2) | 0,165977 | **5,9910** | **1,586937°** | 2,7704 % |
| **este** (pareja 3) | 0,233665 | **6,0130** | **2,225397°** | 3,8860 % |

*(el pitch de proyecto es 6,002 m: ninguno de los dos vanos lo vale exactamente)*

**Convenio: `slope > 0` ⟺ la línea del ESTE está MÁS BAJA ⟺ el terreno sube
hacia el oeste.**

---

## PASO 5 · La inclinación longitudinal, que va aparte

Además de la pendiente transversal, cada línea tiene su **inclinación N-S**:

```
tilt_r     = atan2(Δcota, Δnorte) de cada fila, ponderado por su largo
axisTilt_i = ( tilt_i + tilt_{i+1} ) / 2        ← la PAREJA toma la MEDIA
```

Para la línea 3: `tilt(2) = −2,6668°`, `tilt(3) = −2,4415°`,
`tilt(4) = −2,3912°`, de donde `axisTilt(pareja 2) = −2,5541°` y
`axisTilt(pareja 3) = −2,4164°`.

**Convenio: el tilt es positivo cuando el extremo que apunta al azimut del eje
(el norte, con azimut 0) está MÁS ALTO.**

Y hay una capa más fina que ésta, que la rama por mesa sí usa: `segTilt`, la
inclinación N-S de **cada mesa**, de sus dos cotas sin promediar.

---

## PASO 6 · La fila tiene dos lados y se queda con el peor

Cada pareja resuelve **su propio θ**, con su `slope`, su `pitch` y su
`axisTilt`:

```
θ_pareja = singleaxis(zen, az,
                      axis_tilt       = −axisTilt,     ← convertido al convenio de pvlib
                      axis_azimuth    = axisAz,
                      max_angle       = 55,
                      backtrack       = true,
                      gcr             = cuerda / pitch_pareja,
                      cross_axis_tilt = slope)         ← sin convertir
```

Y la fila del interior toma **el más backtrackeado de sus dos**:

```
sg  = signo del lado del sol
θ_r = min sobre sus dos parejas de (sg · θ)
```

Las dos líneas de los extremos pertenecen a una sola pareja y toman la suya.

### El caso trabajado, en un instante

21-jun, sol al este, cenit 80°, azimut 95°:

| | `slope` | `pitch` | `axisTilt` | **θ** |
|---|---|---|---|---|
| pareja 2 (lado **oeste**) | 1,5869° | 5,991 m | −2,5541° | **19,9783°** |
| pareja 3 (lado **este**) | 2,2254° | 6,013 m | −2,4164° | 21,9732° |

**La fila publica 19,9783°**, el más backtrackeado.

> **Y no es `min|θ|`, es `min(sg·θ)`.** Con torsión un candidato puede haber
> cruzado el cero: −5° backtrackea **más** que +3°, y `min|θ|` habría elegido el
> que sombrea.

---

## Lo que está MEDIDO y lo que está SUPUESTO

**Medido:**
- Las cotas: **sobre el módulo**, en las dos puntas de cada fila, más el morro
  donde se midió.
- El pitch de cada vano: de las `x` del levantamiento.
- El Δz: solo sobre el solape real.

**Supuesto, y declarado:**
- **El azimut del eje se toma 0.** El valor real sale del replanteo. Efecto
  medido de ese desconocimiento en Ayora: la convergencia de meridianos vale
  **1,16°** y cuesta **0,025 %** de energía; ni a 5° se llega al 0,2 %.
- **La pareja toma la MEDIA de los tilt N-S de sus dos líneas.** Si las dos
  líneas están torsionadas entre sí, esa media pierde la torsión.
- **La interpolación de cota dentro de cada mesa es lineal.** Una mesa es una
  viga recta, así que es exacta salvo flecha.

---

## Preguntas para el auditor

1. **¿Es correcto medir el Δz solo sobre el solape en norte, ponderado por él?**
   ¿O habría que ponderar de otra forma —por área de módulo, por ejemplo— dado
   que lo que sombrea es el módulo y no el eje?

2. **¿Es correcto usar el pitch real de cada vano** en lugar del de proyecto,
   sabiendo que el GCR que entra en la fórmula (`cuerda / pitch_pareja`) cambia
   de una pareja a otra?

3. **¿Es defendible que la pareja tome la MEDIA de los tilt N-S de sus dos
   líneas?** En el caso trabajado son −2,6668° y −2,4415°, o sea 0,225° de
   torsión entre ellas. ¿Cuándo deja de ser aceptable esa media?

4. **¿Es correcta la regla de la fila interior, `min(sg·θ)` en vez de
   `min|θ|`?** ¿Hay algún caso en que elija mal?

5. **Cuando dos mesas de líneas vecinas no se corresponden una a una** —como en
   el lado este del ejemplo, donde una mesa solapa con dos— ¿es correcto tratar
   cada solape como una aportación independiente ponderada por su longitud?

6. **¿Es correcto que dos líneas sin solape en norte reciban Δz = 0** y por
   tanto pendiente cero, en vez de excluirlas del cálculo?

7. **La conversión de signos hacia pvlib es asimétrica**: el tilt longitudinal
   se convierte (`−axisTilt`) y la pendiente transversal no. ¿Es correcto con
   azimut de eje 0? ¿Y qué habría que cambiar si el azimut dejara de ser 0?

---

## Cómo reproducirlo

```
node audit4/E_pendiente_por_lado.mjs --linea=3 --json=audit4/out/E_pendiente_linea3.json
```

Cualquier línea de la 1 a la 105. El volcado imprime su propio control contra
la función real antes de enseñar nada.
