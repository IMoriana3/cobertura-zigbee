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
