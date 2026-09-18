# TABLA DE PROCEDENCIA

Generada por `audit2/procedencia.mjs` sobre `audit2/EVIDENCIA_BT_R2.md`.
Árbol 3096c7bce181c2ac247eaa744ef32cd220d1bb82 · commit auditado 3a57451 · node v22.22.2.

Columna **calibrada**: `S` la cifra sale de un diseño cuyo sesgo está medido ·
`N` no aplica (no hay diseño reducido de por medio) · `NO` haría falta y falta ·
`PARCIAL` la calibración cubre parte de las políticas implicadas.
Una fila a la que le falte cualquier columna, o cuya calibración sea `NO` o
`PARCIAL`, se marca **NO PUBLICABLE**.

| cifra | ítem | script | commit | MV | nb | calibrada | estado |
|---|---|---|---|---|---|---|---|
| POA pairwise anual Ayora 2313,4464 kWh/m²·año | E-A3 | `audit2/A3_anual_ayora.mjs` | 3a57451 | 8 | 2 | N | publicable |
| POA true-3D anual Ayora 2298,7128 kWh/m²·año | E-A3 | `audit2/A3_anual_ayora.mjs` | 3a57451 | 8 | 2 | N | publicable |
| θ de anglesOptimal caso B: f=1, 55,000° ×6 | E-A1 | `audit2/A1_veto_optimal.mjs` | 3a57451 | 33 | 2 | N | publicable |
| POA de la ganadora del veto 241,5138 W/m² | E-A1 | `audit2/A1_veto_optimal.mjs` | 3a57451 | 33 | 2 | N | publicable |
| barridos hasta converger de optfree: 3 | E-A2 | `audit2/A2_ascenso_optfree.mjs` | 3a57451 | 33 | 2 | N | publicable |
| poaPlantSeg pondera por largo de mesa | E-A4 | `audit2/A4_poaplantseg.mjs` | 3a57451 | 33 | 2 | N | publicable |
| 84,33 % de instantes con θ de sombra 0 (3562/4224) | E-C1 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| 25,00 % de instantes con más de un cruce (50/200) | E-C2 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| contraejemplo del min|θ| en 75/200 instantes | E-C3 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| peso energético del contraejemplo 22,79 % | E-C3 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| applyDrive deja sombra evitable: 9/12/5/7 de 112 | E-C4 | `audit2/C4_applydrive.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| |Δθ| bisección vs barrido fino ≤ 0,04987° | E-C5 | `audit2/C5_bisecciones.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| el min|θ| gana energía en 74 de 75 instantes | E-C6 | `audit2/C34_energia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| ΔPOA > 0 en las 41 celdas de E-C7 | E-C7 | `audit2/C34_energia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | publicable |
| el argmax del barrido de θ se mueve con MV | E-D1 | `audit2/D1_cuantizacion_mv.mjs` | 3a57451 | 8/16/32/64/128 | 2 | N | publicable |
| orden de las 9 políticas por nb (tabla de 5 columnas) | E-D3 | `audit2/D23_anual_variantes.mjs` | 3a57451 | 8 | 0/1/2/3/6 | **PARCIAL** | **NO PUBLICABLE** |
| escalón eléctrico mínimo por mesa = 1/(nb·MV) | E-D4 | `audit2/D4_escalon.mjs` | 3a57451 | 8/16/32 | 2/3/6 | N | publicable |
| el escalón de sombra existe sólo con MV = 33 | E-E4 | `audit2/E4_mv_impar.mjs` | 3a57451 | 32/33/34/65/66 | 2 | N | publicable |
| |Δθ| JS↔Python = 0,0000° exacto en el caso A | E-G1 | `audit2/G1_careo.mjs` | 3a57451 | 33 | 2 | N | publicable |
| |Δθ| JS↔Python hasta 65° en el caso B | E-G1 | `audit2/G1_careo.mjs` | 3a57451 | 33 | 2 | N | publicable |
| 7 de 9 políticas tienen contraparte en tracker3d.py | E-G3 | `audit2/G3_arnes.mjs` | 3a57451 | — | — | N | publicable |
| Δ de transponer por mesa: pairwise +0,3524 % | E-F2 | `audit2/F23_mesa.mjs` | 3a57451 | 8 | 2 | **NO** | **NO PUBLICABLE** |
| dispersión intra-motor: mediana 1,12-1,26 % | E-F3 | `audit2/F23_mesa.mjs` | 3a57451 | 8 | 2 | **NO** | **NO PUBLICABLE** |
| sesgo del diseño reducido −0,86 % de nivel | E-D2 | `audit2/D23_anual_variantes.mjs` | 3a57451 | 8 | 2 | S | publicable |

## Filas NO PUBLICABLES y por qué

- **orden de las 9 políticas por nb (tabla de 5 columnas)** — falta: calibración PARCIAL
- **Δ de transponer por mesa: pairwise +0,3524 %** — falta: calibración NO
- **dispersión intra-motor: mediana 1,12-1,26 %** — falta: calibración NO
