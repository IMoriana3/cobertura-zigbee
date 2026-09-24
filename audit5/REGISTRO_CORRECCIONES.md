# Registro de correcciones

Cifras PUBLICADAS que resultaron estar mal, con la buena, la causa y dónde se
corrigió. No sustituye a los errores propios (E-X1) de cada fase: aquí van las
cifras que salieron de la casa, no los tropiezos del camino. Cada entrada
señala el documento original, que conserva su texto marcado «[corregida]».

## C-1 · El hueco línea → mesa del P1 no era +17,26 %, era +20,03 % (2026-09-24)

- **Publicado:** `audit4/P1_ALCANCE_PAIRDZ.md` (rama
  `r4-correccion-bt-extremos`). Decía que la rama por mesa daba «un 17,3 % más
  de energía» que la ruta por línea en el anual de Ayora (`pairwise`,
  2.307,0294 → 2.705,1154 kWh/m²) y que `driveCoupleSafe` producía «el 93,1 %
  del hueco».
- **Causa:** los dos lados se medían con MÉTRICAS DISTINTAS. La línea usaba
  `crearLazo → poaPlant` y la mesa `crearLazoSeg → poaPlantSeg`
  (`audit4/D_anual_ayora.mjs:13-14`). La cifra mezclaba métrica y política:
  - **ruta: +451,449 kWh/m², el 113,4 %** del hueco publicado;
  - **métrica: −53,363 kWh/m², el −13,4 %**.

  Se compensaban y daban un número que parecía limpio. El control con `astro`
  (+0,17 %) no podía verlo, porque `astro` no acopla líneas.
- **Bueno** (`audit5/P1_1_separa_acople.mjs` →
  `audit5/out/P1_1_separa_acople.{txt,json}`; física de main v1.78.1, Ayora,
  banda de la página, 12 días × 10 min, cielo claro, con lazo):
  - **hueco en la misma métrica por mesa: +20,03 %** (2.253,6664 → 2.705,1154);
  - **el 95,1 % es acoplar LÍNEAS ENTERAS** y **el 4,9 %, un ángulo por línea**;
  - «sin `driveCoupleSafe`» cierra el **95,6 %**, no el 93,1 %;
  - controles: fidelidad exacta con las dos cifras del P1, y test nulo (las dos
    variantes intermedias dan θ distintos en el 56,4 % y el 87,6 % de
    232.000 mesas×instante).
- **Efecto sobre la conclusión:** ninguno en el sentido; la refuerza. P1 → (c)
  es correcta por arquitectura y su cifra pasa a ser +20,03 %.
- **Corregido en:** `audit4/P1_ALCANCE_PAIRDZ.md` (aviso al principio y marcas
  en su sitio) y en la cabecera de `audit4/G_ablacion_anual.mjs`, commit
  `78bc1f3` de la rama `r4-correccion-bt-extremos`; y en
  `audit5/REFUNDACION_P1.md`. En ningún PR ni en `main` se publicó la cifra
  vieja: se buscó con `git grep` en todas las ramas remotas y en los
  comentarios de PR.
