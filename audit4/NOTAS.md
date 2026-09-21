# R4 · CUADERNO

`audit2/` no se toca: es el paquete sellado de la auditoría anterior y su
verificación (diff vacío contra `6bcb688` y manifiesto 92/92 con su control
negativo) se repite después de cada merge. Todo lo nuevo vive aquí.

Reglas en vigor, las mismas de R3: `archivo:línea` y fragmento en toda
afirmación · test nulo antes de todo recuento · control negativo antes de creer
una comprobación que pasa · ninguna cifra sin denominador y variante · coste
MEDIDO o declarado desconocido, nunca extrapolado · tiempos sólo con la máquina
libre · `NO VERIFICADO` / `NO DISPONIBLE` antes que reconstruir.

---

## FASE 1 · EL VETO DE `optimal`

### 1.1 · Reproducción de la medida de #710 sobre `main`

*(pendiente de la corrida — se escribe con el número delante)*

### 1.2 · `optfree`: recuento por programa de sus llamadas

Instrumento: `/tmp/claude-0/cuenta.js`, que corta la función contando llaves
—saltándose las que viven dentro de comentarios— y cuenta las llamadas sobre el
código **sin comentarios**.

| función | tramo | líneas | `poaPlant` | `poaPlantSeg` |
|---|---|---|---|---|
| `anglesOptimal` | `backtracking.html:2925-3055` | 131 | **6** — 2946, 2961, 2975, 2987, 3045, 3050 | **0** |
| `anglesOptimalFree` | `backtracking.html:3072-3170` | 99 | **6** — 3112, 3137, 3144, 3145, 3148, 3167 | **0** |
| `anglesPairwiseSeg` | `backtracking.html:2674-2743` | 70 | 0 | 0 |
| `anglesAstroSeg` | `backtracking.html:2662-2667` | 6 | 0 | 0 |

**Respuesta a 1.2: sí, `optfree` puntúa con `poaPlant` — seis veces y ninguna
con `poaPlantSeg`.** Entra en el arreglo. Las dos citas que lo deciden:

```
3112:    const s=poaPlant(zen,az,T,angK,irr,doy,albedo,true).plant;      // el ARRANQUE
3167:    if(poaPlant(zen,az,T,alt,irr,doy,albedo).plant>ev.plant+1e-9)cand=alt;   // la REPARACIÓN
```

y la elección exacta, que es la que decide qué se publica:

```
3144:  const co=anglesOptimal(zen,az,T,irr,doy,albedo), com=co.angles;
3145:  let ev=poaPlant(zen,az,T,cand,irr,doy,albedo);
3148:  if(evc.plant>ev.plant+1e-9){cand=com;ev=evc;}
```

`anglesPairwiseSeg` y `anglesAstroSeg` no puntúan con nada: son geométricas, no
optimizan. Por eso no tenían el defecto.

#### EL INSTRUMENTO NECESITÓ SU PROPIO CONTROL, y lo suspendió a la primera

La primera versión contaba **menciones**, no llamadas, y dio **8** `poaPlant` y
**2** `poaPlantSeg` en `anglesOptimal`, contra las 6 y 0 de #710. Las de más
—2998, 2999, 3001— son el **comentario** que yo mismo escribí en #710
documentando el defecto: nombra las dos funciones. Un recuento que se cree sus
propios comentarios habría publicado que el arreglo ya estaba hecho.

Tres controles del instrumento, y **el tercero falló**:

| control | esperado | salió |
|---|---|---|
| 1 · líneas con `poaPlant` en crudo vs sin comentarios | distintos | 8 vs 6 ✔ |
| 2 · `terrainTCU` (existe en el fichero, no en la función) dentro del corte | 0 | 0 ✔ |
| 3 · `E_EMPATE_W` dentro del corte | >0 | **0** ✘ |

El 3 se escribió dando por supuesto que el veto del óptimo usaba la banda de
empate. **No la usa.** Sobre `main` (687382e), el veto compara con `1e-9`:

```
3050:      const e2=poaPlant(zen,az,T,ang2,irr,doy,albedo).plant;
3051:      if(e2>eBest+1e-9){eBest=e2;bestAng=ang2;bestF=f2;}
```

`E_EMPATE_W` se declara en `backtracking.html:966` y ninguna de sus once
apariciones está dentro de `anglesOptimal`: las del motor son 3452 y 3617, y
el resto son del certificador y de la interfaz. Lo falso era mi suposición, no
el corte — pero sin el control, la frase «el veto usa la banda de empate»
habría entrado en el informe sin que nada la parara. Es lo que el cuaderno de
R3 llama darle al instrumento su propio control: **el control 3 no falló por
el instrumento, falló por mí, y por eso valía la pena ponerlo.**

---

## E-X1 · MIS ERRORES

**19 · Conté menciones y las llamé llamadas.** El recuento programático de 1.2
dio 8 `poaPlant` donde hay 6, porque contó las apariciones dentro del
comentario que documenta el defecto. Es el mismo patrón que M.6 —el rastro no
es la cosa— en una variante nueva: aquí el rastro era **mi propia descripción
del defecto**, y el instrumento la leyó como si fuera el defecto. Corregido
quitando comentarios antes de contar, y la diferencia (8 vs 6) se publica como
control 1 del propio instrumento en vez de esconderse.
