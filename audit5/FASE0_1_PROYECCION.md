# R5 · Fases 0 y 1 — Con sol ≥ 10°, la ruta por mesa no ve el 27,7 % de las sombras reales, y el gemelo se equivoca en los dos sentidos

**Mide y construye; no cambia nada del simulador.** Ni las nueve políticas, ni el
defecto de la casa, ni el texto de `:898`/`:2747`. Todo lo nuevo, en `audit5/`.

| pieza | fichero |
|---|---|
| motor de proyección (geometría pura, 0 imports) | `audit5/lib_proyeccion.mjs` |
| mesas reales desde las cotas (copia verificada de R4) | `audit5/lib_mesas.mjs` |
| banco del motor, en CI | `audit5/test_motor.mjs` → `audit5/out/test_motor.txt` |
| careo con el contador del simulador | `audit5/F1_careo_ayora.mjs` → `audit5/out/F1_careo_ayora.txt` |
| fase 0 | `audit5/F0_dimension.mjs` → `audit5/out/F0_dimension.txt` |

## El problema, con las citas enfrentadas

**1 · Vecindad en vez de proyección.** La ruta por mesa solo compara mesas de las
líneas vecinas que solapan en norte (`backtracking.html:2690`, `if(hi<=lo)continue;`).
La sombra se produce por proyección: un receptor puede tener varios emisores,
en cualquier dirección, sobre trozos distintos de su cuerda.

**2 · El vecino se supone gemelo.** Candidato con los dos al mismo θ
(`:1188-1190`, `:1129` `viol=(t)=>pv(p,t,t)`, `:2705` `shadeFracPair(psz,t,t,…)`,
`:1266`/`:1272`/`:1275` en `true3d`), y después se retrocede al más retrocedido
apoyándose en una regla que el propio fichero afirma y desmiente:

```
 897│   las estaciones del solape (extremos y centro: la pendiente es lineal en
 898│   v) y gana el menor |θ|: reducir |θ| desde un backtracking nunca crea
 899│   sombra. Con vigas paralelas es UNA estación y sale lo de siempre, bit a
2746│   un bifila, dos por viga a cada lado del morro— van al MISMO θ, el min|θ| del
2747│   grupo (reducir |θ| desde un backtracking nunca crea sombra) */
```
```
 219│      LLANO: <b>reducir |θ| desde un ángulo de backtracking SÍ puede crear sombra en cuesta</b>, y
 220│      está medido — el contraejemplo aparece en <b>75 de 200</b> instantes del barrido de terrenos
 221│      (semilla 1) y en <b>68 de 200</b> con la semilla 7, con el 22,79 % y el 22,03 % del peso
```

No se arregla aquí: se documenta y se evita en todo lo nuevo.

## Fase 1 · El motor

- **Mesa real (1.1):** rectángulo plano; eje recto entre sus dos cotas (la cota,
  como en el simulador, es el EJE), su τ propio, la **x de su FILA** —no la de su
  línea—, su cuerda y la cara a z0 = 0,17 m por su normal.
- **θ por mesa (1.2):** cada mesa gira sobre SU eje con SU θ. Emisor y receptor
  nunca comparten cuerda ni tilt. Ningún atajo de gemelo.
- **Signo (1.3):** θ > 0 = cara al este; τ > 0 = norte más alto; test contra
  `trueTrackAngle(…, pvTilt(τ))` con control negativo.
- **Enumeración por cono (1.4):** solape en la **vista del sol** (plano ⟂ ŝ) y un
  punto del emisor más cerca del sol que uno del receptor. Es condición necesaria
  y exacta, no una heurística de vecindad.
- **Sombra exacta (1.5):** el emisor se recorta al semiespacio delante de la cara
  receptora, se proyecta a lo largo de −ŝ y se recorta contra el receptor
  (Sutherland-Hodgman).
- **Unión (1.6):** por estación axial, unión de intervalos de cuerda.
- **Salida (1.7):** por receptor, sus emisores con su polígono y su área; fracción
  por estación para `elecLoss`; «a quién sombrea» es la misma lista invertida.
- **Declarado:** solo planos de módulo (sin viga ni canto) y sin terreno.

### El banco (1.8) — `node audit5/test_motor.mjs`: 12/12, en CI

| comprobación | resultado | su control |
|---|---|---|
| convenio de signo | 25 casos, peor \|Δ\| **1,42·10⁻¹⁴°** | sin `pvTilt` se aparta **4,60°** |
| filas infinitas, mismo θ = raíz analítica de pvlib | 11 casos, peor \|Δ\| **5,68·10⁻¹⁴°** | con β de signo cambiado se aparta **21,20°** |
| sol ⟂ al eje: finita = infinita truncada | \|Δ\| 0 exacto por metro | — |
| sol en el plano del eje: 0 transversal | 0 exacto en 9 casos | una mesa 4 m más alta al sur, con sol del sur, sí sombrea (8,98 m²) |
| espejo y traslación | peor \|Δ\| **4,5·10⁻¹⁶** | sobre una sombra total de 0,223 |
| unión, no suma | duplicar un emisor no cambia nada | la suma ingenua pasaría de 15,80 a 31,59 m² |
| receptor de borde con dos emisores parciales | los dos, en tramos axiales distintos | — |
| correspondencia de mesas con el simulador | 1.708 mesas, Δ = 0 | — |
| la poda no pierde emisores (contra fuerza bruta) | **607 pares con sombra, 0 perdidos** (3 instantes) | con las cajas encogidas un 30 % pierde **262** |

### Careo con el contador del simulador (`shadeBand3DAll`, `noStruct`, 64 estaciones), en Ayora

Seis instantes con sol ≥ 5° (el contador suma terreno, `:2048`, y no se puede apagar).

| variante del motor | mesas con \|Δ\| > 1 pp | media \|Δ\| | peor \|Δ\| |
|---|---|---|---|
| **x de línea** (la geometría del simulador) | **0 de 1.708** en los 6 | 0,000 pp | 0,17 pp |
| x de línea + **cuerda del simulador** | 0 de 1.708 | 0,000 pp | ≤ 0,17 pp; el recuento de mesas con sombra cuadra (44=44, 81=81, 63=63, 66=66, 2=2) |
| **x de fila** (el levantamiento) | 17-45 por instante | 0,03-0,06 pp | 4,57 pp |

**Las diferencias, explicadas con el rayo y sin ajustar nada:**

1. **La cuerda del simulador no es perpendicular al eje.** La construye en el plano
   vertical E-O —`:2101` `uD=[Math.cos(thE),0,-Math.sin(thE)], vD=[0,1,sE]` y
   `:2312` `pt=(u2)=>[px0+u2*cR,py0,pz0+u2*s2]`—: su mesa es un **paralelogramo
   cizallado**. Un módulo va montado perpendicular a su tubo y gira con él, que es
   lo que hace el motor. Con la cuerda del simulador el recuento cuadra.
2. **El simulador no cuenta la sombra de las mesas de la propia línea**
   (`:2189`, `if(pl.e===r)continue;`). 21-dic 15:30 UTC, L61m4: simulador
   0,114 %, motor 0,275 %, y motor **sin** el emisor de su línea (L61m3), **0,114 %**.
   Esa sombra axial existe; el motor tiene razón.
3. **La cara del emisor acaba donde acaba el eje, en el simulador.** 21-jun 18:30
   UTC, L61m1: simulador 0,174 %, motor 0,097 %. Ni terreno ni otro emisor
   (hundiendo 100 m el emisor L60m2, o todas las demás líneas, el simulador da 0).
   Réplica de su fórmula de estación (`:2256-2284`): coincide al centésimo en las
   estaciones 61-63 y añade **una**, la 60 (4,88 %). La cara real del emisor acaba
   en y = −1259,7184 (eje + z0·normal); el simulador la acota con el extremo del
   EJE, `H1∈[w0,w1]` (`:2266-2268`), en −1259,7290: **10,64 mm** más al sur, y la
   estación 60 (v = 17,5593 m) cae justo antes de donde empieza el triángulo real
   (17,5661 m). Tiene razón el motor; es 1 cm amplificado por el muestreo.

Y la variante x de fila mide **C6**: la x del levantamiento cambia la sombra hasta
4,57 pp de mesa en un instante, y 17-45 mesas pasan de 1 pp.

## Fase 0 · El tamaño de los dos defectos en Ayora

Ayora, banda del encargo (107 líneas, 1.708 mesas en la x de su fila), 21-jun y
21-dic cada 5 min con sol > 0,5° y backtracking activo: **264 instantes**,
**450.711** receptor×instante con haz. θ = los que publica `pairwise` por mesa.
Emisor efectivo = sombra > 1 cm² (umbral de detección, declarado; con 100 cm² las
proporciones apenas cambian: 59,1 % no enumeradas en vez de 57,4 %).

**Test nulo, antes de contar:** la ruta por mesa deja sin enumerar 23.733
relaciones de 41.311, y gemelo y real difieren en presencia de sombra en 4.832
casos. La fase 0 informa.

| sol | instantes | rec×inst | con ≥ 2 emisores (mesas) | relaciones | **no enumeradas, ruta por mesa** | no enumeradas, ruta por línea | **gemelo «no», real «sí»** | gemelo «sí», real «no» | real − gemelo p10 / p90 |
|---|---|---|---|---|---|---|---|---|---|
| < 3° | 14 | 23.711 | 3.842 (1.550) | 21.822 | 17.095 (78,3 %) | 15.569 (71,3 %) | 441 | 313 | −7,66 / +8,47 pp |
| 3-10° | 34 | 58.072 | 1.260 (345) | 7.735 | 3.384 (43,7 %) | 1.806 (23,3 %) | 634 | 1.153 | −0,42 / +0,07 pp |
| **≥ 10°** | **216** | **368.928** | **1.987 (196)** | **11.754** | **3.254 (27,7 %)** | 406 (3,5 %) | **631** | **1.660** | −0,27 / +0,02 pp |
| total | 264 | 450.711 | 7.089 (1.559) | 41.311 | 23.733 (57,4 %) | 17.781 (43,0 %) | 1.706 | 3.126 | −0,76 / +0,24 pp |

**0.3 · de dónde vienen** (sol ≥ 10°): las líneas vecinas que solapan (4.419 y
4.081), las vecinas que **no** solapan en norte (867 + 718 + 694 + 569) y la
**misma línea** (397 + 9). A sol < 3° dominan los emisores a tres o más líneas,
al sur: sombras de cientos de metros.

**Lectura:**
- **0.1-0.2 · proyección:** con sol ≥ 10°, 27,7 % de las relaciones de sombra caen
  fuera de lo que la ruta por mesa mira —vecinas que no solapan y sombra axial de
  la propia línea—. A sol rasante, casi todas.
- **0.4 · gemelo:** con sol ≥ 10°, en **631** receptor×instante el gemelo dice «sin
  sombra» y con los θ publicados de sus vecinas **sí** la hay; en **1.660** dice que
  sí y no la hay. Suponer al vecino en tu mismo θ no es conservador: falla en los
  dos sentidos, y más veces viendo sombra que no existe —que es retroceso de más—.

## Coste

**NO MEDIDO.** Mientras se hacía esta fase corrían en la misma máquina la ablación
de P1 y las cotas de `optimal`/`optfree`, y los tiempos no se toman con la
máquina ocupada. Se medirá por instante, con la máquina libre, antes de lanzar
nada largo en la fase 2.

## Errores propios (E-X1)

- **E-X1-R5-1 · El control negativo de la tangencia no controlaba nada.** Decía:
  con z0 = 0,17 (que pvlib no modela) la raíz se mueve. Dice ahora: con las dos
  filas al mismo θ el offset cara-eje es la misma traslación para las dos y la
  raíz no se mueve; el control es el signo de la pendiente transversal (se aparta
  21,20°). Lo destapó: el propio banco, en rojo en la primera corrida.
- **E-X1-R5-2 · El control axial miraba al norte.** Puse el sol a az 0° queriendo
  ponerlo al sur, y la mesa alta no llegaba a proyectar. Lo destapó: el banco, en
  rojo; corregido a az 180° y mesa 4 m más alta.
