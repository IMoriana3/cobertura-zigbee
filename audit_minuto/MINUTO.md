# La sombra cambia en un minuto y el HUD no — lo medido (2026-09-24)

Estado: `audit_mancha/estado_mancha.json` (el de la mancha), 21-jun-2026,
`pairwise`, fila 5, a las 12:40 y a las 12:41 (hora local, UTC+2). No se ha
arreglado nada.

Sondas y salidas:

- `audit_minuto/N0_dos_minutos.mjs` → `audit_minuto/out/N0_dos_minutos.json`: todo el estado calculado;
- `audit_minuto/N1_pixeles.mjs` → `audit_minuto/out/N1_*`: el render, píxel a píxel;
- `audit_minuto/N2_con_751.mjs` → `audit_minuto/out/N2_con_751.json`: la misma prueba con la escena de #751.

## 6 · Test nulo: el minuto SÍ cambia el estado, por diseño distinto en cada minuto

- **12:40 es múltiplo de 5.** `sceneInstant` devuelve `null` y la escena y el
  HUD leen la **malla de 5 min** del día (`backtracking.html:8144`,
  `if(m%STEP_MIN===0)return null;`).
- **12:41 cae entre muestras.** `sceneInstant` **recalcula la física del
  minuto** (`:8146-8181`): sol, cielo, consigna y POA.
- Los dos minutos comparten `timeIndex()` = 152 (`:8010`, `Math.floor(hour/STEP_MIN)`).

| magnitud | 12:40 | 12:41 | |
|---|---|---|---|
| sol | 61,3216° / az 122,9173° | 61,4764° / az 123,2706° | cambia |
| GHI / DNI | 950,31 / 921,56 | 951,91 / 921,85 | cambia |
| θ fila 5 (presentación TCU) | −23,50° | −24,28° | cambia |
| θ por fila | 24,63 24,63 23,66 23,66 23,50 23,50 24,66 24,66 | 24,28 24,28 24,44 24,44 24,28 24,28 24,44 24,44 | cambia |
| **sombra por fila** | **0 en las 8** | **0 en las 8** | igual |
| POA de planta | **1.043,94** W/m² | **1.044,17** W/m² | cambia 0,23 |
| rayo crítico (borde → impacto, m) | (28,976; 4,679; 0) → (26,827; 0; −1,391) | (28,984; 4,693; 0) → (26,852; 0; −1,399) | cambia 1-2 cm |

## 4 · El HUD NO está congelado: redondea

De las 8 tarjetas, 5 salen iguales y 3 cambian (sol, GHI/DNI, θ fila 5). Las 5
iguales lo son porque el cambio queda por debajo de la resolución con que se
imprimen:

- POA de planta 1.043,94 → 1.044,17: las dos se escriben «1044»;
- el rótulo «haz 3,38 m · 56 % del vano»: el impacto se mueve 2,5 cm;
- «luz al suelo 56 %»;
- sombra 0,0 % en los dos minutos.

El HUD lee el estado del minuto que toca (`inst ? inst.pv : DAY.pol[key]`), no
una caché.

## 1 y 3 · Qué capa de la escena cambia

- **Ni la silueta (`ovM_sil`) ni el haz (`ovM_haz`)**: hay **0 mallas rojas** en
  los dos minutos. Tiene que ser así, porque la sombra contada es 0 en las 8
  filas y sin sombra no se dibuja ninguna de las dos (`:6675`).
- **Render**, con la cámara fija y el framebuffer comparado píxel a píxel:
  - control: dos renders del mismo minuto dan **0** píxeles distintos (es
    determinista);
  - entre 12:40 y 12:41 cambian 504-676 píxeles, la mayoría sobre palas;
  - con el **mapa de sombras de WebGL apagado** siguen cambiando 572-611. **No
    es el mapa de sombras:** es la geometría, porque las palas giran 0,77°.
- **No se reproduce, desde las 3 cámaras probadas, ninguna sombra que aparezca
  sobre un módulo y desaparezca.** La del titular necesita su cámara; el ⤓ de
  #753 la trae (`vista.camara`).

## 2 · Lo que SÍ es defecto: la escena salta fuera de la malla y vuelve

| hora | θ fila 5 · escena de `main` (v1.78.1) | θ fila 5 · escena de #751 (`interpMalla`) |
|---|---|---|
| 12:40 (malla) | 23,503° | 23,503° |
| 12:41 | **24,277°** | 23,503° |
| 12:42 | 24,051° | 23,503° |
| 12:43 | 23,825° | 23,503° |
| 12:44 | 23,599° | 23,503° |
| 12:45 (malla) | 23,503° | 23,503° |

- **Con la escena de `main`:** en la malla (12:40) el θ es la salida del
  **lazo**, con banda muerta y aparcado. En los minutos intermedios,
  `sceneInstant` pide la consigna fresca de la política y le aplica solo el
  giro (`slewLimit(PK.ang[tIdx],policyAngles(...).angles,dt)`, `:8173-8175`),
  **sin el lazo**. Por eso a las 12:41 todas las filas saltan hacia la consigna
  del minuto (+0,77° en la fila 5) y a las 12:45 vuelven a la del lazo: un
  diente de sierra cada 5 minutos.
- Es el **quinto caso del registro del patrón**
  (`audit5/PATRON_CODIGO_Y_DESCRIPCION.md`). El comentario de `consignaEscena`
  dice que la escena interpola entre las muestras, y `sceneInstant` no lo hacía.
- **Con #751 desaparece.** `sceneInstant` interpola la malla publicada
  (`interpMalla`): la fila 5 se queda en 23,503° dentro de la banda muerta y el
  resto se mueve 0,05-0,45° por minuto, sin salto.
- **Guardián de identidad:** la escena no necesita uno aparte. Su caché
  `INSTANT` lleva el mismo sello del día (`INSTANT.stamp===DAY`, `:8151`) y se
  invalida con él. Lo que falla no es una mezcla de estado viejo y nuevo, es qué
  física aplica la escena entre muestras.

## 5 · «BT OFF» es un INDICADOR, no un interruptor

`btflag` (`:342`) dice «BACKTRACKING: ON cuando la consigna de la política de la
escena está fuera de la posición astronómica (>0,5° en alguna fila…)». Lo
calcula `btActivoSerie` (`:8229-8235`), que compara el mando de la política con
el de `astro`. No cambia ningún cálculo.

A mediodía, con el sol a 61°, `pairwise` no necesita retroceder: sigue al sol.
El −23,5° que publica es **seguimiento astronómico**, y por eso el indicador
dice OFF. Lo que se ve es lo que se cuenta.

## Qué queda

- La sombra concreta que vio el titular: necesita su cámara. Hace falta el ⤓ de
  #753 con la vista.
- El salto de θ entre minutos lo arregla **#751**, pendiente de merge. No se
  toca aquí.
