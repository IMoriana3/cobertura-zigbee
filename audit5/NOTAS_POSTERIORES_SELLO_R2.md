# Notas posteriores al sello de R2 (`audit2/EVIDENCIA_BT_R2.md`)

El sello de R2 lo fija así (`audit2/EVIDENCIA_BT_R2.md:3398-3401`):

> «A partir de aquí nada se reescribe en silencio. Cualquier cambio sobre lo
> sellado exige un **ítem nuevo** que diga qué se cambió y por qué […] El material
> nuevo no entra: va a un **paquete R3 aparte**.»

Por eso `audit2/` no se toca, y cada nota de aquí apunta al ítem sellado que
corrige.

---

## N-R2-1 · El arnés de la paridad JS ↔ `tracker3d.py` NO daba el mismo terreno a los dos lados

**Corrige:** E-G1 (`audit2/EVIDENCIA_BT_R2.md:2269`) y, a través de él, E-G3
(`:2456`), E-G4 (`:2584`) y E-G5 (`:2666`).
**Fecha:** 2026-09-24.
**Medida:** `audit5/P4_signo_tilt.py`, con su salida en
`audit5/out/P4_signo_tilt.json`. Hallazgo 4.0 de `audit5/REFUNDACION_P4.md`.

**Qué pasaba:**

- **El lado JS** entrega a pvlib el tilt N-S CONVERTIDO: `pvTilt=t=>-(t||0)`
  (`backtracking.html:610`), porque la app usa «positivo = el extremo hacia
  `axisAz` más alto» y pvlib lo contrario (`:596-609`).
- **El arnés del lado Python** le pasaba a `tracker3d.py` el `axisTilt` de la
  APP sin convertir: `audit2/G1_py.py:39`,
  `axis_tilts_deg=[p["axisTilt"] for p in C["pairs"]]`.
- **`tracker3d.py` declara el convenio de pvlib** (`RowPairTerrain`,
  `tracker3d.py:45` en `main` d521ec85) y así se lo pasa a pvlib.
- **Consecuencia:** con torsión ≠ 0, las políticas de pvlib del lado Python
  veían el terreno ESPEJO del que veía el JS. Los dos lados no recibían el mismo
  terreno.
- **Además, `tracker3d.py` se contradecía a sí mismo.** Su geometría 3D
  (`_bt3d_pair_max_magnitude`, `:490`) leía el campo con el signo de la app. Con
  el arnés, eso casaba por accidente con el JS en el 3D y lo espejaba en pvlib;
  sin el arnés, habría sido al revés.

**Por qué encaja con lo sellado:**

- **E-G5 lo dice sin saberlo:**
  - la rejilla solo tiene dos valores de torsión, y «todas en el de 7,437°»
    (`:2736-2738`);
  - «Apuntan a lados opuestos del eje en 14 de 14» (`:2740`);
  - «divergencia SIN torsión: NO EXISTE en la rejilla medida» (`:2749`).
- **Sin torsión** los dos convenios coinciden, así que el error del arnés no
  tiene efecto. **Con torsión** manda a los dos motores a lados opuestos del
  eje, que es exactamente la forma de la divergencia medida.
- **E-G1 no podía verlo.** Probó el signo de θ a la SALIDA («se prueban las dos
  (θ_py = +θ_js y θ_py = −θ_js)», `:2306`), no el signo del tilt a la
  ENTRADA. Un control que mira la otra magnitud no distingue esta.

**Lo que NO se sabe, y así se registra:**

- **No se ha separado** cuánto de la divergencia del caso B (hasta 65°, lados
  opuestos en 14 de 14) era el arnés y cuánto otra cosa: la incoherencia interna
  de `tracker3d.py`, la ausencia de reparación y de grupos en Python (E-G3), o
  el resto de diferencias de E-G5.
- **Las cifras de E-G1 y E-G5 NO se invalidan ni se reescriben.** Lo que ya no
  sostienen es la LECTURA «el JS y `tracker3d.py` divergen con torsión», porque
  la comparación no cumplía su premisa.

**Cuándo se rehace:** cuando entre (p1), el PR de `SolarGPTfull` que lleva la
geometría 3D de `tracker3d.py` al convenio que declara (paso 4.3 de la
refundación). Se rehará con el arnés arreglado: convertirá el tilt en el borde,
igual que el JS. Mientras tanto, la paridad corre SIN torsión, donde los dos
convenios coinciden (paso 4.4, (p2)).
