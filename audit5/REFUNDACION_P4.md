# Refundación del BT · PASO 4 — Contrato, vectores congelados y paridad JS ↔ tracker3d.py

**Encargo «REFUNDACIÓN DEL BT» (titular, 2026-09-24), paso 4.** En paralelo con
la revisión de criterios del paso 3 reformulado.

- **El contrato** en prosa y en esquema.
- **Vectores congelados** con su sha256.
- **Un banco de paridad** JS ↔ `tracker3d.py`, como job propio fuera de la
  puerta y con trinquete.
- **PARADA** cuando el banco de paridad diga quién manda entre el JS y
  `tracker3d.py`.

## INVARIANTE 1 · decidir con lo que se cobra (decisión del titular, 2026-09-24)

> **El criterio con el que una política DECIDE y la función con la que se
> COBRA su energía tienen que ser LA MISMA.** Es un invariante del contrato, no
> una recomendación. Una política que decida con otro criterio (contacto,
> tangencia, luz al suelo, métrica de línea) lo DECLARA en el contrato con su
> desajuste medido, y ningún optimizador nuevo (paso 5) puede entrar sin
> cumplirlo.

**De dónde sale:**

- **`optimal`** decidía con `poaPlant` (por línea) y se cobraba con
  `poaPlantSeg` (por mesa). Perdía por la métrica publicada en 58 de 86
  instantes (R4 fase 1, corregido en la v1.76).
- **`true3d`** decide por contacto 3D. En Ayora el contacto mueve entre el
  0,03 % y el 0,08 % del día, y lo que mueve la energía es el ángulo de
  incidencia, que no mira. Medido con la descomposición sombra/haz
  (`audit5/REFUNDACION_P3.md`).
- **La revisión de las nueve** (paso 3 reformulado) dirá cuántas más lo
  incumplen y cuánto les cuesta.

**Cómo se verifica:** un banco que, para cada política declarada «decide con lo
que se cobra», compruebe que su función de decisión llama a la de cobro y a
ninguna otra (conducta, no texto; R-1 y R-4). Control negativo: la decisión
vieja de `optimal` con `poaPlant` tiene que ponerlo rojo.

## Plan

1. **Contrato en prosa y en esquema:** entradas, unidades, signos, frames,
   qué publica cada política y con qué magnitud se cobra, y los invariantes.
2. **Vectores congelados:**
   - casos de geometría y sol con sus ángulos por política;
   - sha256 de cada fichero y de su manifiesto;
   - un banco que los recomputa y cae si cambian sin declaración.
3. **Banco de paridad JS ↔ `tracker3d.py`:**
   - `tracker3d.py` vive en el repo `SolarGPTfull` (`solargpt/solargpt_core/`);
   - job propio de CI, fuera de la puerta, con trinquete: el número de casos en
     paridad no puede bajar;
   - PARADA cuando diga quién manda.

## HALLAZGO 4.0 · el signo del tilt N-S: `tracker3d.py` no es coherente consigo mismo, y el arnés de audit2 mezclaba convenios — PARADA de la paridad

**Qué hay escrito (citas):**

- **El JS** convierte antes de cada llamada a pvlib: `backtracking.html:596-610`,
  «pvlib … lo definen AL REVÉS … Se convierte AQUÍ», `const pvTilt=t=>-(t||0);`.
  La app usa tilt POSITIVO = el extremo que apunta a `axisAz` MÁS ALTO.
- **`tracker3d.py` DECLARA el convenio de pvlib** para el campo
  (`SolarGPTfull/solargpt/solargpt_core/tracker3d.py:43-44`, «All slope angles
  follow the pvlib right-hand convention», commit 046022b).
- **Sus llamadas a pvlib cumplen lo declarado:** `:209-212`,
  `axis_tilt=pair.axis_tilt_deg`, en crudo (y `:297`, `:326`, `:364`, `:658`,
  `:935`, `:1336`).
- **Su geometría 3D NO:** `_bt3d_pair_max_magnitude`, `:486-488`,
  `a = np.array([0.0, ca, sa])` con y = norte, es decir, tilt positivo = norte
  MÁS ALTO, el convenio de la app. Esa función es la de su `true3d`
  (`compute_bt_angles_3d`).
- **El arnés de paridad de audit2** le entrega el `axisTilt` de la APP en
  crudo: `audit2/G1_py.py:39`, `axis_tilts_deg=[p["axisTilt"] for p in C["pairs"]]`.

**La medida** (`audit5/P4_signo_tilt.py`, solo Python, sin el JS; resultado en
`audit5/out/P4_signo_tilt.json`):

- **Montaje:** una pareja plana E-O con el mismo tilt en las dos filas es un
  plano, y ahí el backtracking de pvlib es exacto. Su |θ| en retroceso tiene
  que coincidir con la magnitud sin sombra del 3D de `tracker3d.py` con UNO de
  los dos signos.
- **Base:** 266 instantes con sol > 5° (21-jun y 21-dic, cada 5 min; entre 55
  y 75 en retroceso según el tilt); pitch 6 m, cuerda 2,382 m, θmáx 55°.

| tilt N-S | máx \|\|θ_pvlib(+t)\| − mag3D(t)\| (lo que hace `tracker3d.py`) | con −t (lo que hace el JS) |
|---|---|---|
| 0° (TEST NULO) | 0,0001° | 0,0001° (idéntico) |
| +2° | 17,98° | 0,0001° |
| +5° | 31,64° | 0,0001° |
| −5° | 31,64° | 0,0001° |
| +8° | 39,63° | 0,0001° |

- **Control:** la prueba distingue. Un signo casa a 1e-4° y el otro falla por
  18-40°. Si ninguno casara, habría dicho «NO DISTINGUE» y no se concluiría.

**Qué dice:**

1. **Dentro de `tracker3d.py`, el mismo campo se lee con signos opuestos:**
   pvlib lo lee como lo declara (convenio pvlib) y el 3D como la app. Con
   torsión, su `true3d` combina un 3D y una base pvlib que ven terrenos
   espejo: en `compute_bt_angles_3d` la MISMA clave de pareja pide
   `_bt3d_pair_max_magnitude(..., pair.axis_tilt_deg, ...)` y
   `pvlib.tracking.singleaxis(..., axis_tilt=pair.axis_tilt_deg, ...)`
   (`tracker3d.py:655-662`).
   - Su garantía «No inter-row self-shade in 3-D» (`:607`) la respalda
     `solargpt/tests/test_bt3d_true3d.py`, con torsión (`:135`, `(0, 6.7)`,
     `(5, 4)`…).
   - Pero su ray-cast de fuerza bruta usa el MISMO
     `a = np.array([0, ca, sa])` (`:52`) que el 3D que comprueba: carea el 3D
     consigo mismo en el mismo convenio.
   - **Un control que no puede distinguir no es un control superado:** no ve
     el desacuerdo con pvlib.
2. **El arnés G1 de audit2 no pasaba el mismo terreno a los dos lados.** Con
   tilt ≠ 0, las políticas de pvlib de Python veían el terreno espejo del JS.
   - La divergencia del caso B (`audit2/EVIDENCIA_BT_R2.md`: hasta 65°, lados
     opuestos en 14 de 14, «divergencia SIN torsión: NO EXISTE») lleva dentro,
     como MÍNIMO, este error del arnés.
   - No se ha separado cuánto es del arnés y cuánto de otra cosa.
   - `audit2/` queda intacto: esto se registra aquí.
3. **Ningún cambio de signo en el arnés deja a Python coherente:** si se le
   pasa −t, cuadran sus funciones de pvlib pero se espeja su 3D. Por eso un
   banco de paridad con torsión no puede decir «quién manda» entre el JS y un
   `tracker3d.py` que se contradice. Hace falta antes una decisión.

**PARADA de la paridad (punto de parada del encargo).** Opciones, sin decidir:

- **(p1)** Arreglar el 3D de `tracker3d.py` al convenio que declara (en
  SolarGPTfull, en su propio PR) y medir la paridad después.
- **(p2)** Paridad solo SIN torsión (tilt 0), donde los dos convenios
  coinciden, y el caso con torsión declarado fuera de la paridad hasta (p1).
- **(p3)** El arnés convierte (−t) para las funciones de pvlib de Python y
  declara `true3d` de Python como incoherente, fuera de la paridad.

**Lo que sigue en marcha sin esperar:** el contrato en prosa y en esquema del
lado JS, y sus vectores congelados. No dependen de esta decisión.
