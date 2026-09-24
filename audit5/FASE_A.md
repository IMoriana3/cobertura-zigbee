# R5 · FASE A — Decidir con lo que se mide

**Encargo R5 «el backtracking, enfocado», fase A (2026-09-24).** Rama
`claude/r5-fase-a-6th1im`, simulador **v1.80.0**. La física de `pairwise` y de
`true3d` cambia y está declarada; las otras siete políticas y el contador por
defecto siguen **bit a bit** iguales a `origin/main` (banco, A.3).

## El defecto de fondo

El que DECIDE el ángulo y el que CUENTA la energía no miraban lo mismo.

- **El contador** (`shadeBand3DAll`, `backtracking.html:1938`) enumera emisores
  por PROYECCIÓN con el sol del instante.
- **`pairwise` y `true3d`** preguntaban por VECINDAD —fila de al lado, solape en
  norte— y evaluaban al vecino como GEMELO:
  - `viol=(t)=>pv(p,t,t)`;
  - `shadeFracPair(psz,t,t,…)`;
  - `bt3dPairMaxMag` con una sola cuerda para emisor y receptor.

---

## A.2 · Auditoría del contador, antes de apoyarse en él

Medido sobre **v1.78.1**, antes de tocar nada. Ninguna de las opciones que
añade la fase A cambia la cuenta por defecto; el banco lo comprueba bit a bit.

### (a) La poda contra fuerza bruta, dentro de lo que la página carga

Guion: `audit5/A2_contador_poda.mjs` → `audit5/out/A2_contador_poda_{ayora,sanjose}.txt`.

El contador se carea contra sí mismo **sin poda** (`audit5/lib_contador_bf.mjs`):

- la misma aritmética por estación;
- sin el alcance (`:2191`) ni la ventana axial (`:2202`, `:2217`);
- con y sin la propia línea (`:2189`).

Solo planos de módulo, sin terreno. Consigna: `pairwise` por mesa publicado.
Fechas: 21-jun y 21-dic, cada 10 min.

| planta (banda de la página) | instantes | mesas×instante | relaciones de sombra | **perdidas por la poda** | lo que añade la propia línea |
|---|---|---|---|---|---|
| Ayora (79 líneas, 1.600 mesas) | 144 | 230.400 | 3.115 | **0** | 0 |
| San José (80 líneas, 964 mesas) | 144 | 138.816 | 4.440 | **0** | 0 |

- **Test nulo.** El contador parcheado con la poda puesta da BIT A BIT lo mismo
  que la página.
- **Control negativo.** Encogiendo el alcance, la poda **sí** pierde:
  - en Ayora hace falta ×0,03 (1 mesa, sol 13,4°);
  - en San José, ×0,1 (23 mesas, sol 0,7°).

  El margen de la poda es muy holgado. El control muerde, pero poco, y se
  declara.
- **La propia línea añade 0 con la geometría del contador.** Todas las mesas de
  una línea van en la x de LÍNEA, son colineales y ninguna tapa a otra de
  canto. La exclusión `pl.e===r` no pierde nada **en esa geometría**. Con la x
  de FILA sí pierde: ver (b).

### (b) Lo que el contador no puede ver, por construcción

Guion: `audit5/A2_fuera_de_dominio.mjs` → `audit5/out/A2_fuera_de_dominio_{ayora,sanjose}.txt`.

La página carga **una banda de ≤ 79-80 líneas de UN bloque**
(`plantFromCotas(data,80,blockIdx)`), con un solo `T.axisAz`, y el contador usa
la x de LÍNEA. Aquí se mide con el motor de proyección de la fase 1, que usa la
enumeración por cono validada contra fuerza bruta:

- sobre la **planta entera**: dos bloques en cada planta;
- en la x de FILA;
- **solo en las mesas que la página simula**. Las relaciones con receptor fuera
  de la banda se cuentan aparte, porque la página no las calcula.

| | sol < 3° | 3-10° | ≥ 10° |
|---|---|---|---|
| **Ayora** · relaciones: otro bloque / fuera de banda / misma línea / dentro | 0 / 140 / 1.000 / 15.923 | 0 / 30 / 954 / 4.610 | 0 / 36 / 230 / 7.123 |
| Ayora · mesas×inst. con sombra que el contador no ve (> 0 / > 1 pp, peor) | 511 / 59, 65,37 pp | 284 / 17, 41,95 pp | 37 / 11, 1,62 pp |
| Ayora · haz tapado que no ve | 0,6 % | 1,4 % | 0,7 % |
| **San José** · relaciones: otro bloque / fuera de banda / misma línea / dentro | **9.182** / 49.801 / 147 / 66.461 | 0 / 79 / 720 / 4.869 | 0 / 81 / 147 / 5.279 |
| San José · mesas×inst. con sombra que el contador no ve | 2.452 / 2.205, 100 pp | 211 / 25, 74,25 pp | 77 / 13, 1,56 pp |
| San José · haz tapado que no ve | 17,4 % | 1,2 % | 4,0 % |

**Otro azimut de eje.** Ninguna planta del repositorio lo tiene: los 12
layouts traen un solo `rot` cada uno (Bagnarelli 23,7°, Dicayagua 90°, el resto
0°). El contador no puede representarlo, porque usa un solo `T.axisAz`, y el
motor de la fase 1 tampoco lo admite todavía (`marcoMesa` supone el eje al norte,
`audit5/lib_proyeccion.mjs:53-54`). Queda para **B.2**, que construye esa
geometría a propósito. Aquí se declara: **no medido**.

**Conclusión A.2.** La poda es segura: no descarta ningún emisor real dentro de
su dominio. Lo que el contador no ve está **fuera de su dominio**:

- la sombra de la propia línea en la x de fila;
- las líneas fuera de la banda;
- otros bloques a sol rasante.

Esas tres cosas son un cambio del **contador**, no de la decisión, y mueven la
energía de las nueve políticas. Además, el bloque 4.3 del complemento pide medir
la propia línea y **no arreglarla todavía**. Van a la decisión del titular.

---

## A.1 · La decisión, con el mismo contador

`decideProyeccion` (`backtracking.html`, bloque «R5 FASE A · DECIDIR CON LO QUE
SE MIDE»):

1. **Semilla.** El candidato de pvlib de la política, **sin** sus barridos de
   gemelo (`opt.candidato` en `anglesPairwiseRaw` y `anglesPairwiseSeg`), con el
   mínimo |θ| de cada unidad de accionamiento. En `true3d`, su tope 3D de
   siempre. Es solo el punto de partida.
2. **Retroceso.** Mientras el contador vea una mesa sombreada por otra
   (planos, sin terreno, > 1e-3), las DOS unidades —emisora y receptora—
   retroceden hacia la paralela al terreno, dentro del rango legítimo
   (`rangosFila`). Primero a 1° y después se afina a 0,1° devolviendo el
   exceso. Solo retrocede, así que termina.
3. **Irreducible.** Lo que no se va ni en el tope del rango se declara
   (`info.irreducibles`), no se maquilla.
4. **Guardia de energía en la ruta por línea** (el contrato de v1.57 que la QA
   exige). Si quitar la sombra cuesta energía frente a lo que la política
   publicaba ANTES (fórmula acoplada **más** `repairNoShade`, que recorta al rango
   legítimo), se publica eso **marcado** `aceptadaPorEnergia`: la sombra queda
   declarada, no escondida. Sin cielo, sale marcada `sinReparar`, como siempre.

### Lo que se decidió y por qué (para el titular)

- **El enumerador es el del CONTADOR, no el motor de la fase 1 en la x de
  fila.** El encargo pide dos cosas que aquí chocan:
  - A.1: «x de FILA real»;
  - A.3: «la sombra que ve el que decide y la que cuenta el que mide tienen que
    coincidir».

  El que mide en la página es el contador, en la x de LÍNEA y sin la propia
  línea. Decidir con el motor de la fase 1 habría vuelto a separar decidir y
  medir. Por eso se decide con el contador, y la A.3 se cumple por
  construcción. Llevar el contador a la x de fila y a la propia línea es un
  cambio del contador que mueve la energía de las nueve; lo mide la A.2 y lo
  decide el titular. **No se ha reducido el alcance en silencio: se dice aquí.**
- **La semilla sigue siendo de pvlib**, que supone filas paralelas: eso es
  vecindad en el PUNTO DE PARTIDA. La **aceptación** ya no pregunta por
  vecindad ni por gemelo. Un retroceso de más que venga del propio pvlib (una
  vecina más corta, por ejemplo) no se deshace aquí: eso es optimizar, fase D.
- **La ruta por mesa, la de las plantas reales, no tiene guardia de energía.**
  No la tenía antes (`repairNoShade` se salta en `T.real`, `:3507`) y cada
  evaluación de energía cuesta una pasada completa del contador. Queda
  declarado.
- **`true3d` en planta real sigue por línea**, como antes: la difusión a mesas
  es la misma. Solo cambia cómo se acepta.
- **Coste:** `pairwise` por mesa en Ayora pasa de 0,2-3 s a 0,15-5 s por
  instante (1-8 pasadas completas del contador). **No medido con la máquina
  libre**; se medirá antes del PR.

## A.3 · Decidir = medir — `tools/test_decide_mide.mjs`

| comprobación | resultado |
|---|---|
| 1-2 · presets (llano, ondulado bifila, senoidal con torsión) × 5 soles, `pairwise` y `true3d` | lo que ve el que decide = lo que cuenta el contador, bit a bit; ninguna mesa con sombra evitable sin declarar (23 decisiones sin sombra salvo lo irreducible; 7 en que la guardia publicó la fórmula, marcada) |
| 1-2 · Ayora real, 79 líneas, por mesa, 5 soles | igual, bit a bit; 0 irreducibles |
| 3 · **control negativo**: la decisión vieja (vecindad y gemelo) | **suspende** la 2: publica sombra que el contador ve en 2 de 5 instantes (4 y 3 mesas) |
| 4 · las otras 7 políticas y el contador por defecto | **bit a bit** iguales a `origin/main` (105 + 20 comparaciones) |
| 5 · test nulo de la 4 | `pairwise` sí difiere de main en 4 de 5 instantes: la comparación mira |

## A.4 · Efecto medido — `audit5/A4_efecto.mjs`

ANTES = la física de `origin/main` (v1.78.1). DESPUÉS = esta rama (v1.80.0).
Las dos consignas se miden con el mismo contador, que por defecto es bit a bit
el de main. Se mide la consigna, **sin lazo ni giro**, igual antes y después.
Las cifras de «error» son mesas×instante (o unidades×instante) y, en el anual,
van ponderadas por los días del mes.

- **Error «no»**, el 631 de la fase 0 pasado a la decisión: sombra evitable
  que la política no declara.
- **Error «sí»**, el 1.660: unidades retrocedidas desde su candidato que podrían
  volver a él sin sombra. Se mira 1 de cada 3 pasos.

### Preset senoidal (8 filas, N-S ±3°, pendiente 5°, monofila: ruta por línea con guardia)

| | energía | sombra evitable media | publicada | error «no» | error «sí» |
|---|---|---|---|---|---|
| `pairwise` · día (21-jun y 21-dic) | 11,8790 → 11,8794 kWh/m² (**+0,003 %**) | 1,5003 → 1,4988 % | 3,5076 → 3,5102 % | 433 → **0** | 0 → 0 |
| `true3d` · día | 11,8019 → 11,8019 (**0,000 %**) | 2,0427 → 2,0413 % | 3,9626 → 3,9653 % | 302 → **0** | 0 → 0 |
| `pairwise` · anual | 2.226,2820 → 2.226,3079 kWh/m² (**+0,001 %**) | 1,4893 → 1,4887 % | 3,2795 → 3,2789 % | 79.961 → **0** | 0 → 0 |
| `true3d` · anual | 2.214,3336 → 2.214,3336 (**0,000 %**) | 2,1647 → 2,1641 % | 3,8309 → 3,8304 % | 55.802 → **0** | 0 → 0 |
| `astro` (TEST NULO) | Δ **0** exacto | = | = | — | — |

**Lectura.** En la ruta por línea el efecto es de **declaración**, no de energía.
Donde evitar la sombra cuesta más de lo que vale, la guardia publica lo de
siempre y lo MARCA. El error «no» cae a 0 porque la política ya no dice «0 %»
donde el contador ve sombra; la sombra evitable apenas baja porque esa sombra
se acepta a sabiendas.

### Ayora real (banda de la página, 79 líneas, 1.600 mesas: ruta por mesa, sin guardia)

**EN CURSO.**

**Planta por defecto (8 filas, llano):** Δ = 0 exacto en energía, sombra y
errores. En llano, pvlib ya es exacto y la decisión no tiene nada que corregir.

## Errores propios (E-X1)

- **E-X1-A-1.** Primera clasificación de «fuera de dominio» mezclaba receptores
  que la página ni simula con sombra perdida en mesas que sí simula. Lo cazó la
  lectura de la primera tabla; se separó antes de dar cifras.
- **E-X1-A-2.** Se repitió `path.join` con una ruta absoluta (ya registrado como
  E-X1-BT0-5): el `--json` fuera del repo se escribía dentro. Se cambió a
  `path.resolve`. La prueba lo cazó al primer intento.
- **E-X1-A-3.** El primer control negativo de la poda (alcance ×0,3) no
  controlaba nada: 0 mesas perdidas. Se endureció a ×0,3, ×0,1 y ×0,03, y se
  exige que alguno pierda.
- **E-X1-A-4.** La primera coincidencia de la banda de la página se hizo con
  `lineX`, que es relativa al origen de cada carga, y solo casaba 1 línea. Se
  cambió a `lineXAbs`, con una aserción que exige que casen todas.
