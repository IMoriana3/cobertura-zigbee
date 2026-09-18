# R3 · MATERIAL POSTERIOR AL SELLADO

**Este fichero NO forma parte del paquete R2.** Tampoco lo forman los demás
ficheros con prefijo `R3_` (`audit2/R3_*.mjs` y `audit2/out/R3_*`): son material
posterior y **no están en `audit2/out/MANIFEST.txt`**, que sella el estado de
`audit2/out` en el momento del sellado y no se regenera. R2 quedó sellado el 2026-09-18 en
el commit `3a2630c`, con 42 ítems, 4 reglas de método y 12 huecos abiertos. Nada
de lo que hay aquí se incorpora a él: por la regla del sellado, el material nuevo
abre un paquete R3 aparte y sólo el auditor decide qué entra.

---

## 1 · DEFECTO DEL SELLADO, declarado el mismo día

`audit2/out/MANIFEST.txt`, línea 43, sella este artefacto:

```
D2mv32.txt                         1294  d43d273924ae64710898bd4c7725966121887537f41eaa47b50a01fb967c7bbc
```

**Esos 1 294 bytes son sólo la cabecera.** Es el fichero de salida de la corrida
de E-D8, que **seguía viva al sellar** (9 h 55 min de reloj en ese momento) y que
escribe su tabla al terminar. O sea: el manifiesto sella el hash de un artefacto
**incompleto cuyo productor seguía corriendo**, y ese hash dejará de casar en
cuanto la corrida termine.

No es un error de cálculo: es que se selló un directorio con un fichero abierto.
Se declara aquí, el mismo día, en vez de esperar a que alguien encuentre un
manifiesto que no cuadra y no sepa por qué.

**Cómo se resuelve cuando caiga:** el resultado se copia a `R3_D2mv32.txt` y se
anotan **los dos hashes** —el sellado, de la cabecera sola, y el del fichero
completo—. El manifiesto de R2 **no se regenera**: rehacerlo cambiaría el paquete
sellado, que es justamente lo que el sello prohíbe.

**Para R3:** al sellar un directorio, comprobar antes que no hay ningún proceso
escribiendo en él. Un manifiesto sólo vale si lo que sella está quieto.

---

## 2 · E-D8, nota para cuando se retome

La corrida ha estado **diez horas sin decir dónde iba**. El motivo está en el
propio script: `audit2/D23_anual_variantes.mjs` imprime la tabla de cada variante
**al terminarla** (`console.log` en el bucle `for (const v of VAR)`), y el anual
entero es **un único `evaluate` síncrono** que bloquea la página de punta a punta.
No hay estado intermedio ni forma de preguntar: cualquier consulta se encola
detrás y no vuelve hasta el final.

**Anotado, no implementado** —el script está en el paquete sellado y tocarlo
ahora lo cambiaría—: debe **imprimir por política conforme avanza**, no al final.
Con una línea por política terminada se puede:

- saber dónde va sin tocar nada;
- **parar en cuanto la respuesta esté clara** — si el orden de las nueve ya se ve
  a la quinta política, las cuatro restantes no hacen falta para contestar la
  pregunta 2;
- estimar el resto con una medida en vez de con una extrapolación, que es
  exactamente el defecto que E-X1 registra tres veces.

Requiere ceder el control dentro del bucle del anual (partirlo por política o por
mes y volver del `evaluate` entre trozos), que es el mismo patrón que ya usa
`computeDayGen` en la página.

---

## 3 · Lo demás que abre R3

Lo que el paquete sellado deja apuntado, sin desarrollar:

- **E-D8**, si la corrida cae, con sus tres preguntas ya escritas en la entrada
  19 de `HUECOS` de R2.
- El hallazgo de otra sesión sobre **`policyAnglesSeg:2689`** —`optimal` maximiza
  `poaPlant` **por línea** y se puntúa con `poaPlantSeg` **por mesa**, −0,556 % en
  Ayora real—, **pendiente de la comprobación decisiva y NO verificado en R2**.
- El **certificado** (`pintaCertificado:7287`), cuyo agujero de identidad del día
  se cerró en el PR #691, **después** del commit auditado `3a57451`.

---

## 4 · HALLAZGO NUEVO · el indicador «BT ON» se enciende sin backtracking

**Cómo apareció.** Mirando la pantalla del simulador: **21-jun, 14:00, sol a
70,5°, GCR 0,340**, y el indicador decía **BT ON** con la sombra en **0,0 %**. A
esa altura de sol y con ese GCR no hay auto-sombra posible, así que el indicador
no podía estar diciendo lo que su nombre dice.

**Qué se ejecutó.** `audit2/R3_bt_indicador.mjs` sobre `b7918b9` (`main` del
momento), reproduciendo esa configuración exacta: lat 42,32059, lon −5,59981,
UTC+2, alt 1563 m, TL 3,5, albedo 0,20, nubosidad 0, pitch 7,00, cuerda 2,382,
±55°, 65 filas pedidas, azimut de eje 0, z0 0,17, 21-jun-2026, instante 14:00.
Salida cruda en `audit2/out/R3_bt_indicador.json`.

**Reejecutada.** El guion se volvió a correr desde cero en un `git worktree`
aparte, en `--detach` sobre `b7918b9`, y devolvió los mismos valores en todos
los campos. La salida lleva su propio `commit` estampado por el guion
(`git rev-parse HEAD`), no escrito a mano.

**Qué salió.**

| magnitud | valor |
|---|---|
| sol | elev **70,46°** · az 163,2° |
| sombra máxima de planta | **0,000000** |
| **mando crudo de `pairwise`** (`policyAngles`) | **5,8624°** |
| **mando crudo de `astro`** (`anglesAstro`) | **5,8624°** |
| **diferencia de MANDO** | **0,0000°, en las 24 filas** |
| publicado tras el lazo | **4,8624°** |
| referencia astro tras *su* lazo | **6,0680°** |
| **diferencia de lo PUBLICADO** | **1,2055°** |
| umbral del indicador | **0,5°** |
| filas por encima del umbral | **24 de 24** |
| indicador | **BT ON** |

**El mecanismo.** El predicado del indicador compara **salidas del lazo**, no
mandos:

`b7918b9:backtracking.html:7665-7671`
```js
function btActivoSerie(p,t){
  if(!DAY||!DAY.astroAng||!p)return false;
  if(DAY.sun[t].elev<=0)return false;
  const a=p.ang[t], ref=DAY.astroAng[t];
  for(let r=0;r<a.length;r++)if(Math.abs(a[r]-ref[r])>0.5)return true;
  return false;
}
```

`p.ang[t]` y `DAY.astroAng[t]` salen de **dos lazos independientes**, cada uno con
su propia memoria —posición anterior, sentido de la marcha y destino enclavado— y
con banda muerta `b7918b9:backtracking.html:3130`:
```js
const DEADBAND_DEG=1.0;                              // ° (canónico del core; TCU 41061 = 45 pulsos)
```

Dentro de la banda el motor no arranca, así que **dos lazos alimentados con el
MISMO mando se quedan parados en puntos distintos** según su historia. Y el
umbral del indicador, **0,5°, es la mitad de la banda muerta**: por construcción
puede encenderse por deriva del lazo sin que exista nada de backtracking. Aquí la
separación medida es **1,2055°**, más del doble del umbral, con diferencia de
mando **exactamente cero**.

**Lo que el propio código declara sobre ese predicado.** El comentario que
acompaña a la construcción de la referencia, `b7918b9:backtracking.html:5134-5139`:
```js
  // referencia ASTRONÓMICA con el MISMO límite de slew: backtracking ⇔ la
  // consigna se aparta de ella (>0,5°) — así la rampa del alba no cuenta como
  // BT en la política astro, y en las demás marca exactamente las horas de BT
  const astroAng=new Array(nT); const LZA=crearLazo();
  for(let t2=0;t2<nT;t2++){
    const limA=LZA.paso(anglesAstro(sun[t2].zen,sun[t2].az,Tcfg),STEP_MIN*60);
```
El texto declara que se comparte el límite de slew para que un efecto del
accionamiento —«la rampa del alba»— no cuente como BT. La medida de arriba se
tomó a las 14:00, con mando idéntico y sombra cero, y el indicador se encendió:
compartir el límite de slew no cubre la banda muerta, porque cada lazo tiene su
propia memoria. `LZA` es un lazo, y el de la política es otro
(`b7918b9:backtracking.html:5137`).

**Qué es y qué no es.** Es un defecto **del indicador**, no del cálculo: la
consigna, la sombra y la POA de esa pantalla son correctas. Afecta a lo que la
interfaz **afirma**, y a las horas ámbar de la barra de tiempo, que usan el mismo
predicado (`b7918b9:backtracking.html:7681`).

**No se ha tocado nada.** Es posterior al sellado y no es un fallo de los PR #689
ni #691. Las dos salidas naturales —comparar **mandos** en vez de salidas del
lazo, o subir el umbral por encima de la banda muerta— son decisión del auditor
al abrir R3, no de esta nota.

**Alcance de esta medida.** Un instante, una configuración, un `main` (`b7918b9`).
No se ha medido cuántas horas del día ni cuántas configuraciones lo levantan, ni
si el adelanto de v1.69 lo agrava respecto de v1.68. `NO VERIFICADO`.

---

## 5 · Resultado de E-D8

*(pendiente: se escribe aquí en cuanto la corrida termine, con el fichero crudo en
`R3_D2mv32.txt` y las respuestas a las tres preguntas de la entrada 19)*
