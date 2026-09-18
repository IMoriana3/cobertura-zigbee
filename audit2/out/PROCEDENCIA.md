# TABLA DE PROCEDENCIA

Generada por `audit2/procedencia.mjs` sobre `audit2/EVIDENCIA_BT_R2.md`.
Árbol acec1c36cc4979e40d8203a8fe7c9973922a5e27 · commit auditado 3a57451 · node v22.22.2.

Columna **calibrada**: `S` el sesgo del diseño está medido para esa cifra ·
`N` no aplica (no hay diseño reducido de por medio) ·
`calibrada en 4 de 9` el offset de modo común está verificado en cuatro políticas
(pairwise −0,8622 %, true-3D −0,8678 %, optimal −0,8451 %, optfree −0,8461 %;
se reparten en **0,0227 pp** y el ordinal entre ellas es idéntico en los dos diseños) ·
`INDICIO DIMENSIONADO` la cifra es de un día y no se anualiza, por decisión del auditor ·
`NO PUBLICABLE por DOMINIO` el problema no es de calibración sino de dominio:
una distribución de un día no responde a un enunciado anual, y calibrar no lo corrige.

Columna **diseño**: `pleno` (12 días, paso 10 min) · `reducido` (4 días, paso 20 min) ·
`instantáneo` (un instante o un barrido de θ) · `un día`.
Columna **ruta de código**: por qué rama se llega al resultado. Está por la lección de
la columna `nb = 2` (regla M.1): dos rutas que deben coincidir no coinciden hasta que
se comprueba, y E-D6 lo comprobó.

| cifra | ítem | script | commit | MV | nb | calibrada | diseño | ruta de código | estado |
|---|---|---|---|---|---|---|---|---|---|
| POA pairwise anual Ayora 2313,4464 kWh/m²·año | E-A3 | `audit2/A3_anual_ayora.mjs` | 3a57451 | 8 | 2 | N | pleno | `T.real` → MV 8 · `poaPlant` | publicable |
| POA true-3D anual Ayora 2298,7128 kWh/m²·año | E-A3 | `audit2/A3_anual_ayora.mjs` | 3a57451 | 8 | 2 | N | pleno | `T.real` → MV 8 · `poaPlant` | publicable |
| θ de anglesOptimal caso B: f=1, 55,000° ×6 | E-A1 | `audit2/A1_veto_optimal.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `mvPara` adaptativo · `poaPlant` | publicable |
| POA de la ganadora del veto 241,5138 W/m² | E-A1 | `audit2/A1_veto_optimal.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `mvPara` adaptativo · `poaPlant` | publicable |
| barridos hasta converger de optfree: 3 | E-A2 | `audit2/A2_ascenso_optfree.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `mvPara` adaptativo · `poaPlant(...,fast)` | publicable |
| poaPlantSeg pondera por largo de mesa | E-A4 | `audit2/A4_poaplantseg.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `poaPlantSeg` · `segTiltAt` | publicable |
| 84,33 % de instantes con θ de sombra 0 (3562/4224) | E-C1 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `shadeBand3DAll` noStruct | publicable |
| 25,00 % de instantes con más de un cruce (50/200) | E-C2 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `shadeBand3DAll` noStruct | publicable |
| contraejemplo del min|θ| en 75/200 instantes | E-C3 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `shadeBand3DAll` noStruct | publicable |
| peso energético del contraejemplo 22,79 % | E-C3 | `audit2/C_monotonia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `poaPlant` con θ de pairwise | publicable |
| applyDrive deja sombra evitable: 9/12/5/7 de 112 | E-C4 | `audit2/C4_applydrive.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `policyAngles` → `applyDrive` | publicable |
| |Δθ| bisección vs barrido fino ≤ 0,04987° | E-C5 | `audit2/C5_bisecciones.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `bt3dPairMaxMag` · `shadeRows` | publicable |
| el min|θ| gana energía en 74 de 75 instantes | E-C6 | `audit2/C34_energia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `poaPlant` · θ uniforme | publicable |
| ΔPOA > 0 en las 41 celdas de E-C7 | E-C7 | `audit2/C34_energia.mjs` | 3a57451 | mvPara (17/33) | 2 | N | instantáneo | `policyAngles` · `poaPlant` | publicable |
| el argmax del barrido de θ se mueve con MV | E-D1 | `audit2/D1_cuantizacion_mv.mjs` | 3a57451 | 8/16/32/64/128 | 2 | N | instantáneo | `T.mv` forzado · `poaPlant` | publicable |
| orden de las 9 políticas por nb (tabla de 5 columnas) | E-D3 | `audit2/D23_anual_variantes.mjs` | 3a57451 | 8 | 0/1/2/3/6 | `calibrada en 4 de 9 · offset de modo común verificado en esas 4` | reducido | `T.nBypass` + `T.real` → MV 8 | publicable |
| escalón eléctrico mínimo por mesa = 1/(nb·MV) | E-D4 | `audit2/D4_escalon.mjs` | 3a57451 | 8/16/32 | 2/3/6 | N | instantáneo | `T.mv` forzado · `elecLoss` | publicable |
| offsets del diseño reducido: −0,8451…−0,8678 % | E-D5 | `audit2/D5_calibracion_plena.mjs` | 3a57451 | 8 | 2 | S | pleno | `T.real` → MV 8 · `poaPlant` | publicable |
| la columna nb=2 coincide por las dos rutas (9/9) | E-D6 | `audit2/D6_nb2_cruzada.mjs` | 3a57451 | 8 | 2 | S | reducido | `T.mv` frente a `T.real` | publicable |
| el escalón de sombra existe sólo con MV = 33 | E-E4 | `audit2/E4_mv_impar.mjs` | 3a57451 | 32/33/34/65/66 | 2 | N | instantáneo | `T.mv` forzado · sonda en `shadeBand3DAll` | publicable |
| |Δθ| JS↔Python = 0,0000° exacto en el caso A | E-G1 | `audit2/G1_careo.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `policyAngles` ↔ `tracker3d.py` | publicable |
| |Δθ| JS↔Python hasta 65° en el caso B | E-G1 | `audit2/G1_careo.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `policyAngles` ↔ `tracker3d.py` | publicable |
| repairNoShade descartado: 0 de 14 caen | E-G4 | `audit2/G4_sin_repair.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `repairNoShadeCore` anulado en memoria | publicable |
| |θ_JS| < |θ_PY| en 14 de 14 y 103 de 148 | E-G5 | `audit2/G5_caracteriza.mjs` | 3a57451 | 33 | 2 | N | instantáneo | `policyAngles` ↔ `tracker3d.py` | publicable |
| 7 de 9 políticas tienen contraparte en tracker3d.py | E-G3 | `audit2/G3_arnes.mjs` | 3a57451 | — | — | N | — | lectura de `tracker3d.py` | publicable |
| Δ de transponer por mesa: pairwise +0,3524 % | E-F2 | `audit2/F23_mesa.mjs` | 3a57451 | 8 | 2 | `INDICIO DIMENSIONADO · un día, no anualizado` | un día | `poaRow`+`segTiltAt`+`segMods` | publicable |
| dispersión intra-motor: mediana 1,12-1,26 % | E-F3 | `audit2/F23_mesa.mjs` | 3a57451 | 8 | 2 | **NO PUBLICABLE por DOMINIO** | un día | `poaPlantSeg` · `T.segDrive` | **NO PUBLICABLE** |
| el gate de CI cuenta cancelled como failure | E-H1 | `audit2/verifica_citas.mjs` | 3a57451 | — | — | N | — | GitHub Actions API | publicable |

## Filas NO PUBLICABLES y por qué

- **dispersión intra-motor: mediana 1,12-1,26 %** — falta: dominio: distribución de un día contra enunciado anual
