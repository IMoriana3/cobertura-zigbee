# R4 · CIERRE

Qué se hizo en cada fase, en qué PR, cómo quedó CI, y **qué queda abierto y por
qué**. Los errores propios van en `audit4/NOTAS.md`, sección E-X1.

`audit2/` **no se ha tocado**: 0 ficheros cambiados respecto al sello
`6bcb688`, comprobado con el recuento y no con una etiqueta que se imprime
sola. Todo lo nuevo está en `audit4/` y en `canon/`.

---

## FASE 1 · El veto de `optimal`

**PR #716 · MERGEADO (`bf539b6`) · CI verde.**

La puerta 1.1 **no reprodujo** la medida de #710 sobre `main`, y la fase paró
ahí como mandaba el encargo. La causa se **midió**, no se supuso:
`audit4/F1_causa_reagregacion.mjs` lee `plantLinMedia` —la agregación anterior
al #707, que la página sigue publicando— del **mismo objeto**, sin evaluación
extra, y con ella reaparecen **los siete números de #710 al cuarto decimal**:
58/86 y −0,5103 %; 29/86 en el test nulo; 15/86 → 15/29 y −0,3482 %; 18/86 y
−0,3060 %. Causa = **#707 y nada más**.

Re-baselinado por decisión del auditor: sobre `main` (`687382e`), 79 líneas ·
1.600 mesas · máx 3,7143° de torsión → **61/86** por mesa, 0/86 por línea,
test nulo 86/86.

**1.4 pasó por encima del criterio**: 61→**0**, 16→**0**, 19→**0** de 86, en
las tres geometrías, y la rama por línea **verificada intacta** (+13,7221 % en
las seis celdas). El banco `tools/test_veto_por_mesa.mjs` entró en CI con su
control negativo: reconstruye el veto roto desde la fuente con **una**
sustitución y le ve perder −0,6880 W/m².

**Advertencia pegada a la cifra**: sobre `main` el control `sinTorsion` ya no
aísla la torsión —las longitudes de línea las separan aunque ninguna mesa se
desvíe—, así que **«16 de 86» no es comparable con «15 de 29»**, y el control
limpio de #710 ya no existe en `main`.

**Abierto**: nada. 1.6 cierra abajo.

---

## FASE 2 · Las tres políticas caras, sólo bajo demanda

**PR #725 · MERGEADO (`521910c`) · CI verde.**

El criterio de «política cara» pasó a ser el **coste MEDIDO**, no el cerebro:
`POL_CARAS` con `POL_CARAS_FUENTE` apuntando a la medida del #711 (el 71,0–99,7 %
del coste del día en los 22 puntos del barrido de tilt N-S). El filtro anterior
—`brain==='ncu' && P.on && P.key!=='mgl'`— **estaba escrito en el banco de
física**, que exigía esa ortografía exacta: el banco **imponía el defecto y
prohibía el arreglo**. Sustituido por comprobaciones de propiedad.

FÍSICA PURA: **idéntica línea a línea salvo `const VER`**, que vive **dentro**
de los delimitadores, así que «0 hunks dentro» es literalmente imposible para
cualquier subida de versión. La excepción se **publica** en vez de esconderse
tras un hash, y lleva su propio control negativo para que no sea una puerta
trasera.

**Abierto y por qué**: **2.3** (el coste medido de la indicación «sin
calcular») y **2.6** (el tiempo de generar el terreno con pendiente N-S, antes
y después). La sonda está escrita —`audit4/F2_coste_informe.mjs`, con la carga
del sistema impresa al empezar y al acabar— pero **un tiempo medido con la
máquina cargada no es un tiempo**, y la máquina ha estado ocupada con la
corrida de 1.6. Queda como **NO MEDIDO**, no como estimación.

---

## FASE 3 · Los dos lazos — preparar la decisión, no tomarla

**PR #731 · abierto · solo documento.** Página:
`audit4/FASE3_LOS_DOS_LAZOS.md`.

**No son dos leyes: es una ley muestreada a dos ritmos.** Con un ciclo por
tramo los dos lazos coinciden en **0 de 100** pasos con diferencia, `|Δ|` máx
**0,000000°**. El troceo en ciclos de 1 s con la consigna rampada explica el
**100,0 %** de los 1,996° que R3 dejó abiertos.

**3.4 no adjudica, y el control es quien lo dice**: contra el eje medido de
seis TCU reales (2.213 pasos), núcleo RMS 0,6847° y página 0,9215° — pero **la
consigna cruda, sin lazo ninguno, saca 0,4867°**. Un predictor trivial gana a
los dos modelos. Lo único que sí dice: el núcleo queda más cerca en **6 de 6**
TCU.

**3.5**: el lazo del núcleo produce menos en **8 de 9** políticas, entre
−0,096 % y −1,164 % anual. Y el control destapa un tercer número: **el lazo,
cualquiera de los dos, cuesta hasta −2,43 %** frente al mando crudo.

**Abierto y por qué**: esa última cifra **no se puede leer** contra la de
`backtracking.html:3313` («no cuesta energía»), porque las dos medidas no son
comparables —5 min y un día allí, 10 min y doce meses aquí— y cuál es la
condición de la planta **NO ESTÁ MEDIDO**. Y **sin recomendación**, que era el
encargo.

---

## FASE 4 · Canon del backtracking

**PR #730 · abierto · MERGE: NO**, como mandaba el encargo. El canon congela un
acuerdo, y de las seis cuestiones de 4.5 todavía no hay ninguno.

**4.1** · inventario en los once repos. Dos hallazgos: **tres GCR y dos θmáx**
conviviendo, y el estructural — `tracker3d.py` **no puede expresar geometría
por mesa** (`segment|mesa|seg_|per_seg`: **0 apariciones en 2.186 líneas**).

**4.2** · `canon/backtracking.contrato.json` v1.0.0, doce umbrales con su
línea, con `quien_se_aparta` **en blanco a propósito**.

**4.3** · 121 geometrías × 6 instantes, sha256 `2a9780bb…`. **Su test nulo me
cazó**: la primera versión tenía 2 valores distintos de torsión por mesa —
cobertura cero sobre lo que la fase 1 acababa de arreglar.

**4.4** · el careo sale **ROJO, y ese es el resultado**. Job propio `careo`
**fuera de la puerta**, verde en 66 s, con trinquete que falla solo si la
divergencia empeora. **El hallazgo**: con eje N-S horizontal los dos motores
coinciden hasta el ruido del fichero (**4,26·10⁻⁷°** contra los 5·10⁻⁷° del
redondeo); en cuanto se inclina aparece una diferencia **monótona**, hasta
**0,8157°** a 6°. El desacuerdo **no es sobre backtracking**: es el término de
inclinación N-S del seguimiento astronómico, y los 62,07° de `true3d` lo llevan
dentro.

**Abierto y por qué**: las **seis decisiones de 4.5**, que son del titular. Y
una que el propio banco declara: la columna Python va **congelada**, con el
commit del motor impreso pero **no comprobado** — es una **etiqueta, no una
guardia** (decisión D6).

---

## FASE 5 · Campo

**PR #732 · abierto · solo documento.** Página: `audit4/FASE5_CAMPO.md`.

**El número**: error de seguimiento del accionamiento, El Burgo/NCU12,
2026-08-07, seis TCU — **MAE 0,3831° · RMSE 0,4861° · P95 0,9000° · máx
1,6000°** sobre **2.219 muestras utilizables de 3.320**. Control de la
exclusión: las apartadas por posición de seguridad dan MAE **6,5241°**.

**Grado: solo acotado.** El encoder mide el **accionamiento, no la mesa** — la
misma geometría por mesa que la fase 4 encontró que el motor Python ni siquiera
puede expresar.

**Abierto y por qué**: **5.2, 5.3 y 5.4** caen los tres por lo mismo — no hay
corriente por string en ningún dato registrado, **medido** con 257 ficheros
barridos, ocho patrones, cero aciertos y control. La ruta que falta **no pasa
por la NCU**: no es una descarga más, es una fuente nueva. **5.5** no está en
el repo; lo único que se aporta sin inventar rutas es la aritmética
`215 − 4 = 211` y `211 × 18 = 3.798` exacto, como criterio para reconocerlo.

---

## EXTRA · La rejilla terreno × política

**PR #733 · abierto.** El formato que pediste, y re-medida sobre `main` porque
las cifras eran de `v1.77.0`. **Las 30 celdas × 3 días salen idénticas**, con
explicación comprobada: la rejilla usa la rama por línea, la fase 1 tocó solo
la de mesa, y el #727 no tocó `backtracking.html`. **Mi hipótesis sobre la
pendiente E-O era falsa** y la medida la desmontó: el motor de la ganancia es
la fluctuación N-S. Y a 3° aparece una columna que 10° escondía: `true3d`
**negativa en siete celdas**, hasta −3,44 %.

---

## LO QUE SIGUE ABIERTO, EN UNA LISTA

| qué | por qué | de quién es |
|---|---|---|
| 2.3 y 2.6 · coste medido y tiempo del terreno | la máquina no ha estado libre; **NO MEDIDO**, no estimado | mío, en cuanto haya máquina |
| las seis decisiones de 4.5 | son decisiones, no hechos | **del titular** |
| 5.2 / 5.3 / 5.4 · corriente por string | fuente nueva, no pasa por la NCU | pedirla al SCADA del inversor |
| 5.5 · el CSV de 3.798 puntos | no está en el repo | pedirlo a Factiun |
| la rama `probe-cancelled-tope` | el proxy de git de este contenedor **rechaza el push de borrado** | hay que borrarla a mano |
| `audit2/`: el manifiesto cubre 92 de 94 | la comprobación es **unidireccional** — verifica que lo listado no cambió, no que todo lo presente esté listado. **Contenido intacto** (diff contra `6bcb688` vacío de verdad) | **reportado, no tocado**: es del titular |
