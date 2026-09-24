# B.2 · La mancha en el aire — lo medido y dónde paro

Encargo del titular del 2026-09-24, bloque B.2. **No se ha arreglado nada.**
Esta sección **se para aquí**: la pregunta 2.1, sobre el objeto que él vio en
bifila, **no se puede cerrar** con lo que hay. El motivo y lo que hace falta
para cerrarla van al final.

Simulador **v1.80.0**, rama `claude/config-json-6th1im`. La física es la misma
que en `main` v1.78.1: esta rama solo añade B.1.

## 0 · El estado, reproducido y fijado como fichero

`audit_mancha/estado_mancha.json` es la primera configuración exportada con
B.1 (hash `4b4cca0b…`). Lo genera `audit_mancha/M0_estado.mjs` con los valores
del mensaje escritos en los mandos.

El mensaje **no fijaba el perfil N-S**. El HUD decía «tilt N-S 1,5°, rígida:
medio del grupo», que es el medio de la pareja de la fila 5. Se buscó con
`audit_mancha/M0_busca.mjs` (salida en `out/M0_busca.txt`):

- Se recorrieron los 5 perfiles N-S con valores de −6 a 6 en pasos de 0,5, que
  es el paso del mando. Tres dan 1,5° en ese grupo: constante 1,5, quebrado
  −1,5 y senoidal 3.
- Cada uno se probó con el terreno aplicado y sin aplicar: **6 estados**.
- **Uno solo reproduce el HUD entero**: «Senoidal», valor 3, terreno aplicado.

| | θ fila 5 | máx planta | POA planta | luz al suelo | residual mín |
|---|---|---|---|---|---|
| captura del titular | −3,0° | 90,8 % | 33 W/m² | 76 % | −2001 mm |
| `estado_mancha.json` | −3,0° | 90,8 % | 33 W/m² | 76 % | −2001 mm |
| el mismo estado con «Constante 1,5» | −3,0° | 34,4 % | 36 W/m² | 71 % | −2525 mm |

La última fila es el control: un estado con el mismo θ y el mismo tilt en el
HUD no da la misma huella.

## 2.1 · ¿Geometría o sombra?

Se contesta con los objetos del render, no por su aspecto. Las sondas son
`M0_sonda.mjs` (inventario de mallas), `M2_geometria.mjs` (silueta contra
vidrio), `M3_apoyo.mjs` (pala contra postes) y `M4_pixeles.mjs` (píxel →
rayo → objeto).

**En bifila (el estado del titular):**

- **Inventario de mallas rojas visibles.** Son de dos clases y no hay más:
  - Los **cables** del modelo del seguidor. Material `cable` a `0xc0392b`
    (`seguidor.js:166`), dentro de cada pala.
  - **36 siluetas de sombra.** Material `ovM_sil` (`backtracking.html:6817`),
    pintadas por `pintaCaraLocal(ov,poly,ovM_sil,T)` (`:6995`) en la
    pegatina de su pala. La pegatina está a `ovg.position.y=0.170`
    (`:6353`) y es hija del `spin`.
- **Las 36 siluetas están SOBRE su pala.** Pasadas al marco local de la pala,
  quedan a 5 mm sobre el vidrio, que va de 0,115 a 0,165 m. Tienen **0
  vértices** a más de 2 cm fuera de la huella del vidrio.
- **Filas afectadas: 3, 4, 7 y 8**, que son las sombreadas: el máx de planta
  es 90,8 %. Las filas 4 y 8 quedan casi enteras en rojo. Una pala cubierta de
  rojo **es** una pala, no una pieza suelta.
- **Cada pala se apoya en su estructura.** En las 8 filas, el eje de la pala
  coincide con la cabeza de sus 3 postes: eje − cabeza = 0,00 m en los 24
  postes, y el pie de cada poste está en el terreno.
  - Las gemelas de la rígida (filas 2, 4, 6 y 8) van con el tilt del grupo
    (±1,5°) y no con el de su terreno (±3°). Los postes lo compensan (de 2,28
    a 3,41 m en la fila 4) y la pala no queda sin apoyo.
- **Por píxel.** Se tomaron 5 cámaras: la de la página y cuatro a ras del
  vano. En cada una se leyeron los píxeles rojizos del framebuffer y se lanzó
  un rayo por píxel. **Todos** caen en una silueta sobre su pala o en el canto
  de una pala. El recuento, en `out/M4_bifila_real.txt`:

  | cámara | píxeles rojizos | en silueta | en canto de pala | en otro objeto |
  |---|---|---|---|---|
  | general | 546 | 542 | 3 | 1 (un eje) |
  | sur_bajo | 44 | 36 | 8 | 0 |
  | oeste_bajo | 2 | 0 | 1 | 1 (un eje) |
  | este_bajo | 2.029 | 1.938 | 89 | 2 (ejes) |
  | vano45 | 5.645 | 5.614 | 27 | 4 (el sol) |

  El muestreo es de 1 píxel de cada 9. «Otro objeto» son ejes y la esfera del
  sol en el borde de la zona roja.

**Conclusión en bifila.** En este estado, con estas cámaras, **no hay ningún
objeto rojo en el aire**. Todo lo rojo es sombra dibujada sobre una
superficie, la pala. **La mancha que describe el titular no se reproduce**, y
2.1 queda sin contestar para ese objeto.

**En monofila (2.5), en cambio, SÍ aparece un objeto rojo que no está sobre
ninguna superficie.**

- Es el **HAZ DE SOMBRA**: `TD.hazGrp`, material `ovM_haz`, rojo con opacidad
  0,09 (`:6842`), construido en `:6985-6993`.
- Solo se dibuja para la fila elegida en «fila N», y solo si tiene sombra
  (`:6985`). En bifila la fila 5 tiene 0,0 % y **no hay haz**. En monofila
  tiene 1,5 % y **sí lo hay**.
- **Es un prisma, no una sombra.** Une el contorno del emisor (`cut`) con su
  proyección `Hs` sobre el plano **infinito** de la pala receptora
  (`const H=[P[0]+t*dsh[0],…]`, `:6965`). La silueta se recorta a la pala
  (`poly=clipPoly(poly,edge)`, `:6973`); el haz usa `Hs` **sin recortar**.
- **Medido.** El prisma va de x = 4,83 a 23,93 m (19 m, cuatro vanos). De sus
  extremos sobre el plano receptor:
  - dos caen dentro del vidrio de la fila 5, a 0,05 y 0,63 m del eje en la
    cuerda (semicuerda 1,19 m);
  - **dos caen a 13,9 y 14,5 m del eje**, fuera del largo de la pala y a
    **1,22 m sobre el terreno**.

  El haz acaba colgado en un plano suelto: ahí no hay nada que reciba.
- **Contra la pista del titular.** Las caras del haz contienen el rayo: su
  normal forma **90°** con él. Son **paralelas** al rayo, no perpendiculares.
  Así que el haz **no** encaja con «la mancha se ve perpendicular al rayo».

## DEFECTO DE RENDER registrado (independiente de la mancha)

Pedido por el titular el 2026-09-24. Es un defecto sea o no la mancha que vio.

- El HAZ DE SOMBRA proyecta sobre el **plano infinito** de la pala receptora y
  **no recorta a la pala** (`backtracking.html:6965`,
  `const H=[P[0]+t*dsh[0],…]`).
- La silueta sí se recorta (`:6973`, `poly=clipPoly(poly,edge)`).
- Su comentario dice «el volumen que va del objeto que sombrea **a su mancha
  sobre la mesa**» (`:6841`).
- Resultado: **dibuja volumen donde no hay superficie**. Medido en monofila,
  llega a 13,9 y 14,5 m del eje de la receptora, a 1,22 m del suelo.
- Es el **séptimo caso** del registro del patrón
  (`audit5/PATRON_CODIGO_Y_DESCRIPCION.md`, rama `claude/r5-bt3d-f0-6th1im`,
  commit `3ff900a`).
- **No arreglado.**
- **No es la respuesta a 2.1.** El haz es candidato: sus caras son paralelas
  al rayo y la pista del titular decía perpendicular. La mancha sigue
  **ABIERTA** hasta su ⤓.

## 2.2 · Si es sombra, ¿intersección o contorno colgado?

- **La sombra que se pinta y se cuenta es intersección.**
  - La silueta proyecta el emisor sobre el plano de **cada mesa receptora**,
    con la cota por tramo y la corrección oblicua del contador, y **se recorta
    a la mesa** (`:6973`).
  - Medido: 36 de 36 siluetas dentro de su vidrio.
- **El haz es otra cosa.** Es la proyección del contorno colgada en el plano
  infinito de la receptora, sin recorte: la segunda opción de la pregunta.
  - Pero el haz **no se cuenta**: es una ayuda visual. El contador no usa esa
    proyección sin recortar.
  - Su comentario (`:6841`) dice «el volumen que va del objeto que sombrea a su
    mancha sobre la mesa». El código lo lleva a `Hs`, que puede caer a 14 m de
    la mesa.

  El titular pidió registrarlo como séptimo caso del patrón y está registrado
  (ver arriba). Registrarlo **no** decide si la mancha del titular es esto.

## 2.3 · Si es geometría

No se ha llegado a 2.3: en bifila no se encontró ninguna mesa fuera de su
sitio. La hipótesis del revisor (la segunda mesa de la rígida, desalineada del
terreno senoidal) **se probó y no se sostiene en este estado**:

- las gemelas van al tilt del grupo;
- sus postes llegan al eje;
- su vidrio está donde dice su `spin`.

El recorrido por todas las plantas del repo **no se ha hecho**: el propio
encargo lo condiciona a que 2.1 diga geometría.

## 2.4 · El residual de −2001 mm

- **Sale de la física, no del render.** Lo calcula `tangentResidualMm`
  (`:1377`) con `T.pairs`, que da pendiente y tilt de cada pareja, y el θ de
  las filas. El HUD lo publica en `:7452`. No lee ningún objeto de la escena.
- **Por pareja**, en mm (cobertura axial 0,96 en todas):

  | pareja | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|
  | bifila | 20.924 | **−2.001** | −1.372 | 19.105 | 20.924 | **−2.001** | −1.372 |
  | monofila | 37.631 | **−9.344** | −2.518 | 7.907 | 37.631 | **−9.344** | −2.518 |

- El mínimo está en las parejas 2 (filas 2→3) y 6 (filas 6→7): el rayo por el
  borde de la fila 2 entra 2,0 m en la cara de la 3. Casa con las siluetas de
  las filas 3 y 7.
- **No explica ninguna mancha en el aire**, porque en bifila no se encontró
  ninguna. Que el contador y la escena vean lo mismo **está medido para la
  silueta**: 36 de 36 sobre su pala. **No lo está para el objeto del titular**.

## 2.5 · ¿Cambia con monofila?

**Sí, y no debería.** Con el mismo estado y monofila:

- aparece el haz colgado de 2.1, porque la fila 5 pasa a tener 1,5 % de sombra;
- las siluetas siguen todas sobre su pala.

Que el haz aparezca o no depende de que la fila elegida tenga sombra, y eso sí
depende del accionamiento. **El defecto del haz, en cambio, es de
construcción**: cuando se dibuja, su extremo cae donde caiga el plano infinito.

## Por qué paro, y qué hace falta

La mancha del titular **no se reproduce en bifila** con su estado exacto: la
huella del HUD es idéntica y el recuento se hizo por píxel en 5 cámaras. Faltan
dos cosas que su mensaje no trae:

- **la cámara**, porque con 5 puntos de vista no se puede afirmar que no haya
  nada desde el suyo;
- **la versión de la página** que tenía abierta.

**Petición:** que reproduzca la mancha en la página de esta rama y pulse
**⤓ configuración**. El JSON lleva el estado, la cámara (`vista.camara`), las
capas y la `ver`. Con ese fichero, 2.1 se contesta objeto por objeto con estas
mismas sondas.

## Errores propios (E-X1)

- **E-X1-B2-1.** Primera sonda con el estado mal reconstruido: perfil N-S
  «Constante 1,5», supuesto a partir del HUD. Salió máx planta 34,4 % contra
  su 90,8 %. Se cazó comparando la huella antes de sacar conclusiones, y se
  corrigió buscando el estado (`M0_busca.mjs`).
- **E-X1-B2-2.** Métrica mal planteada en `M2_geometria.mjs`: el «hueco
  mínimo al terreno» comparaba el punto más bajo de **toda** la pala con el
  terreno de cada estación. Dio 0,33 m en las gemelas y no mide nada. Se
  sustituyó por el apoyo eje-poste de `M3_apoyo.mjs`, que da 0,00 m en los 24
  postes. La columna sigue en su JSON, pero **no se usa**.
## REGLA (no es una entrada de errores)

Un error que reaparece después de registrado necesita una barrera, no otra
anotación (titular, 2026-09-24).

**Regla.** En esta sesión está **prohibido matar procesos por patrón**:
`pkill` con la opción de línea completa, `pgrep` en esa modalidad encadenado a
`kill`, y `killall` con expresión regular. El patrón puede casar con la línea
de órdenes de la propia shell que lo lanza, y la mata. Pasó dos veces.

Se mata **por PID**:

1. leerlo antes con `ps -eo pid,args`;
2. `kill <PID>`;
3. verificar después con `ps -p <PID>`.

**Barrera.** Un hook `PreToolUse` sobre Bash (`~/.claude/barreras/no_pkill_f.py`,
declarado en `~/.claude/settings.json`) rechaza la orden **antes de
ejecutarla**.

- Probado fuera del hook: 6 formas prohibidas rechazadas y 4 legítimas que
  pasan (`kill <PID>`, `pgrep` sin matar, `ps | grep`, `pkill` por nombre
  exacto).
- Probado dentro de la sesión: la orden prohibida no llegó a ejecutarse.
- **Limitación declarada:** mira el TEXTO de la orden. Por eso también
  rechaza un heredoc que solo menciona la forma prohibida. Así lo cazó al
  escribir esta misma sección, que hubo que editar sin shell. Se prefiere
  estricta.
