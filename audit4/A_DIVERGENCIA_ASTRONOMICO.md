# R4 · A — LA DIVERGENCIA JS↔PYTHON ES EL SIGNO DEL TILT N-S

**Acota, no arregla.** Cuál de los dos convenios es el correcto es decisión del
titular, y A.2 va delante para que se decida mirando las dos implementaciones.

Sondas: `audit4/A_astro_tau.mjs` (lado JS), `audit4/A_astro_py.py` (lado
pvlib), `audit4/A_ajuste.py` (A.1 y A.3), `audit4/A_amplificacion.mjs` (A.4 y
A.5). Salidas en `audit4/out/A_*.json`.

---

## A.3 primero, porque es el que cierra: **el sumando está localizado**

Se identifica **por medida, sin leer una línea**, separando tres diferencias
sobre los **mismos** instantes y el **mismo** τ:

| | qué compara |
|---|---|
| **Δ_total** | `JS(−τ)` contra `PY(+τ)` — lo que el careo ve hoy |
| **Δ_fórmula** | `JS(+τ)` contra `PY(+τ)` — misma entrada: solo la fórmula |
| **Δ_signo** | `JS(−τ)` contra `JS(+τ)` — mismo motor: solo el convenio |

| τ | n | Δ_total (RMS) | Δ_fórmula | Δ_signo (RMS) |
|---|---|---|---|---|
| 0,0° | 26 | 0,0000° | 5,88·10⁻¹⁰° | 0,0000° |
| 0,5° | 25 | 0,5190° | 6,00·10⁻¹⁰° | 0,5190° |
| 1,0° | 25 | 1,0384° | 6,63·10⁻¹⁰° | 1,0384° |
| 2,0° | 24 | 1,8907° | 5,77·10⁻¹⁰° | 1,8907° |
| 3,0° | 24 | 2,8462° | 5,00·10⁻¹⁰° | 2,8462° |
| 4,0° | 24 | 3,8139° | 5,77·10⁻¹⁰° | 3,8139° |
| 5,0° | 24 | 4,7981° | 6,12·10⁻¹⁰° | 4,7981° |
| 6,0° | 24 | 5,8032° | 5,77·10⁻¹⁰° | 5,8032° |

* peor Δ_fórmula en los **129 valores de τ**: **1,70·10⁻⁸°** → la
  reimplementación JS de `singleaxis` y `pvlib.tracking.singleaxis` **dan lo
  mismo** con la misma entrada.
* peor `|Δ_total − Δ_signo|`: **2,58·10⁻⁹°** → **Δ_total ES Δ_signo.**

> **EL CONVENIO DE SIGNO DEL TILT N-S ES LA CAUSA ENTERA.** No hay ningún otro
> sumando que buscar.

**Exclusión, con su recuento**: 3.264 de 5.934 valores (**55,0 %**) se
descartan porque θ está clavado en el tope mecánico de ±55°. Un θ saturado no
informa de τ — los dos motores dan el mismo número **por saturación, no por
acuerdo**. Sin esta exclusión la mitad de la muestra sería un falso acuerdo.

**Control en τ = 0**: las tres diferencias caen por debajo de **5·10⁻⁹°**, que
es la cuantización de los dos volcados a 9 decimales. **No se pide cero
exacto**, porque eso sería exigir una exactitud que el propio formato destruye
— el error E-X1 26 de esta misma sesión, que volví a cometer y esta vez corregí
al escribir el criterio.

---

## A.2 · Las dos implementaciones del ASTRONÓMICO, una al lado de otra

### JS — `backtracking.html:1253-1262`

```js
function anglesAstro(zen,az,T){
  // seguimiento astronómico pleno, sin backtracking (el que auto-sombrea)
  const nR=T.pairs.length+1, nP=Math.max(T.pairs.length,1), out=new Array(nR);
  for(let r=0;r<nR;r++){
    const p=T.pairs[Math.min(r,nP-1)];
    out[r]=nan0(singleaxis(zen,az,{axisTilt:pvTilt(rowTiltAt(T,r)),axisAz:T.axisAz,maxAngle:T.maxAngle,
      backtrack:false,gcr:T.gcr,crossAxisTilt:p.slope}));
  }
  return out;
}
```

y la conversión, en **`backtracking.html:606`**:

```js
const pvTilt=t=>-(t||0);
```

### Python — `tracker3d.py:346-371` (la línea del signo, `:366`)

```python
def compute_theta_full_tracking(zen, azi, terrain):
    ...
    for r in range(n_rows):
        pair = terrain.pairs[min(r, n_pairs_eff - 1)]
        key = round(pair.axis_tilt_deg, 9)
        if key not in cache:
            sa = pvlib.tracking.singleaxis(
                apparent_zenith=zen, solar_azimuth=azi,
                axis_tilt=pair.axis_tilt_deg,      # ← +τ, tal cual
                axis_azimuth=terrain.axis_azimuth_deg,
                max_angle=terrain.max_angle_deg,
                backtrack=False, gcr=terrain.gcr)
```

### Las tres diferencias que se ven, y cuál pesa

| | JS | Python | ¿pesa? |
|---|---|---|---|
| **el signo de τ** | `pvTilt(τ) = −τ` | `pair.axis_tilt_deg = +τ` | **SÍ. Es toda la divergencia** |
| de dónde sale τ | `rowTiltAt(T,r)` — el tilt **de la fila** | `pair.axis_tilt_deg` — el de la **pareja** | no en las geometrías medidas: con tilt uniforme coinciden |
| `cross_axis_tilt` | se le pasa `p.slope` | **no se le pasa** (queda 0) | **no**: pvlib solo lo usa con `backtrack=True`, y aquí es `False`. Por eso τ=0 da cero pese a tener pendiente 8° |

**Control de que la comparación es legítima**: `compute_theta_full_tracking`
coincide con llamar a pvlib directamente con `+τ` hasta **4,95·10⁻¹⁰°**, así que
comparar contra pvlib es comparar contra el motor.

**Qué NO dice esto.** No dice cuál es el correcto. `pvTilt` tiene un nombre que
declara intención —convertir del convenio de la página al de pvlib— y el
Python no convierte nada. Una de las dos casas se equivoca, o las dos usan
convenios distintos para τ y ninguna está mal en su marco. **Decidirlo es de
4.5, D2.**

---

## A.1 · El ajuste de Δ(τ)

**El barrido físico NO puede contestar a A.1, y esa es la primera respuesta.**
Entre 0 y 8°, τ, sin τ y tan τ difieren menos del 1 % entre sí:

| modelo | k | residuo RMS | residuo/señal |
|---|---|---|---|
| k · τ | 0,96022 | 0,13414° | **2,95 %** |
| k · sin τ | 55,12752 | 0,13385° | **2,95 %** |
| k · tan τ | 54,79477 | 0,13509° | **2,97 %** |

Los tres «ajustan» igual. Elegir uno aquí sería elegir por gusto.

Se extiende el barrido a **±40°** —identificación de modelo, **no** una
afirmación sobre el terreno: no hay ejes así— que es donde las tres familias sí
se separan:

| modelo | k | residuo RMS | residuo/señal |
|---|---|---|---|
| k · τ | 0,26710 | 4,03451° | 49,97 % |
| k · sin τ | 16,20544 | 3,95172° | **48,95 %** |
| k · tan τ | 13,45910 | 4,21900° | 52,26 % |

**Ninguna de las tres sirve**: las tres dejan ~50 % de residuo. La curva no es
de esa familia.

### El ajuste que sí identifica el término

```
Δ(τ) = | θ(−τ) − θ(+τ) |     del MISMO motor
```

residuo RMS sobre los 129 valores de τ: **2,86·10⁻¹⁰°**, máximo **2,58·10⁻⁹°**.

No es «proporcional a algo»: es **literalmente el mismo ángulo evaluado con el
signo de τ cambiado**. En el rango físico eso se parece a `0,960·τ` —de ahí que
el ajuste lineal funcione— pero la ley exacta es la de arriba.

---

## Corrección a mi propio careo de la fase 4

**El 0,8157° que el careo de 4.4 publica para `astro` es un SUELO, no el peor
caso**, y la causa está medida: de los seis instantes de los vectores sellados,
**cuatro saturan** en ±55° a τ=6° y dan Δ = 0 exacto por saturación.

| instante | JS(−6°) | PY(+6°) | \|Δ\| | ¿satura? |
|---|---|---|---|---|
| 21-jun elev 4,3° | 55,000 | 55,000 | 0,0000 | **sí** |
| 21-jun elev 9,3° | 55,000 | 55,000 | 0,0000 | **sí** |
| 21-jun elev 42,1° | 47,705 | 48,263 | 0,5586 | no |
| 21-jun elev 70,5° | 8,197 | 8,764 | 0,5670 | no |
| 21-dic elev 4,5° | 55,000 | 55,000 | 0,0000 | **sí** |
| 21-dic elev 8,8° | 55,000 | 55,000 | 0,0000 | **sí** |

Con un barrido denso de 24 instantes no saturados, el mismo τ=6° da **RMS
5,8032° y máximo 14,1398°** — unas **17 veces** el 0,8157° publicado.

**Consecuencia para 4.3 y 4.4**: los vectores eligen instantes por elevación
(5, 10, 45, 70°) precisamente para cubrir sol bajo y alto, y **el sol bajo es
justo donde el eje inclinado satura**. El trinquete sigue valiendo —es un
registro que solo debe no empeorar—, pero **la cifra de `astro` no se puede
leer como «lo que los dos motores discrepan»**. Queda anotado aquí y
**no se toca el trinquete**: moverlo para que refleje esto sería reescribir la
línea a la vista de un resultado, que es exactamente lo que el trinquete impide.

---

## A.4 · La amplificación, medida

Se perturba **solo el signo de la torsión** dentro del motor JS y se mide la
salida de cada etapa de la cadena de `pairwise`. Geometría: el **caso B del
careo congelado de R2** (6 filas, pendiente 8°, torsión −3,41 1,63 3,22 3,76
−3,67 −3,06). 137 instantes × 6 filas = **822 valores por etapa**.

**Test nulo**: con torsión 0 la perturbación no existe y todas las etapas dan
**0,00·10⁰°**.

| etapa | RMS | máx | ×RMS vs entrada |
|---|---|---|---|
| 1 · `anglesAstro` (**la entrada**) | 2,1995° | 8,9485° | ×1,00 |
| 2 · `anglesPairwise` (el arccos) | 3,4563° | **29,9207°** | ×1,57 |
| 3 · + `driveCoupleSafe` (acople) | 3,8550° | 46,7500° | ×1,75 |
| 4 · + `repairNoShade` (guardia) | 4,3163° | **42,5000°** | ×1,96 |
| — la cadena entera **sin acople** | 6,2298° | **57,7243°** | ×2,83 |

### La descomposición que A.4 pide, con una sorpresa de signo

```
  entrada (astro)                     8,9485°
  tras el arccos del backtracking    29,9207°   (+20,9721°)
  tras el acople por accionamiento   46,7500°   (+16,8293°)
  tras la guardia de energía         42,5000°   (−4,2500°)

  la MISMA cadena SIN grupos          57,7243°
  → aportación del ACOPLE:           −15,2243°
```

**El encargo preguntaba cuánto de los 62,07° viene del acople. La respuesta
medida es que el acople no amplifica: ATENÚA.** Sin grupos de accionamiento el
peor caso es **57,72°**; con ellos, **42,50°**. El acople toma el `min|θ|` del
grupo y eso amortigua la divergencia en **15,22°**. La guardia de energía
también resta, otros 4,25°.

**Quien amplifica es el arccos del backtracking**: de 8,95° de entrada a 29,92°
en una sola etapa, ×3,3 en el peor caso. Es la derivada cerca de la tangencia,
como el encargo sospechaba — pero el resto de la cadena va en contra, no a
favor.

**Lo que esto NO cierra**: los 62,07° del careo salen de comparar **dos
motores**; aquí se mide un motor perturbado, que es lo que permite atribuir.
Las dos cifras no son la misma medida y **no se suman ni se restan**.

---

## A.5 · ¿Explica el signo los lados opuestos?

R2 registró que θ_JS y θ_PY apuntan a **lados opuestos del eje en 14 de 14**:
`10/−55` ×8 y `−2/55` ×6 (`audit2/EVIDENCIA_BT_R2.md:2740`).

Medido aquí, con solo el signo perturbado: **26 pares de 822** salen con θ de
signo contrario y más de 1° de separación. Los mayores:

| día | hora | fila | θ(−τ) | θ(+τ) |
|---|---|---|---|---|
| 21-dic | 16:15 | 4 | −14,75 | 5,00 |
| 21-dic | 16:15 | 5 | −14,75 | 5,00 |
| 21-dic | 10:45 | 4 | −2,00 | 12,50 |
| 21-dic | 16:00 | 0 | −2,50 | 10,00 |

**Pero la firma no cuadra del todo.** De esos 26, los que tienen **uno de los
dos en el tope mecánico**: **0**. Y las 14 de R2 tienen SIEMPRE uno en el tope.

> **Respuesta a A.5: el signo reproduce el FENÓMENO —lados opuestos— pero NO la
> firma de R2.** Para que uno de los dos acabe clavado en ±55° hace falta algo
> más, y con esta sonda **NO ESTÁ IDENTIFICADO**. No se rellena con una
> conjetura.

---

## LO QUE A DEJA

**Cerrado y medido**: la divergencia del astronómico es, entera, el convenio de
signo de τ (`pvTilt`, `backtracking.html:606`), con residuo 2,86·10⁻¹⁰°. Ni la
fórmula ni `cross_axis_tilt` intervienen.

**Cerrado y contraintuitivo**: el acople por accionamiento **atenúa** 15,22°;
quien amplifica es el arccos, ×3,3.

**Abierto**: por qué uno de los dos motores acaba en el tope en las 14 de R2
(A.5, **NO IDENTIFICADO**), y cuál de los dos convenios es el correcto —que es
**decisión del titular**, D2 de 4.5, y ahora tiene A.2 delante para tomarla.
