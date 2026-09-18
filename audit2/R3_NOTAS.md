# R3 · MATERIAL POSTERIOR AL SELLADO

**Este fichero NO forma parte del paquete R2.** R2 quedó sellado el 2026-09-18 en
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

## 4 · Resultado de E-D8

*(pendiente: se escribe aquí en cuanto la corrida termine, con el fichero crudo en
`R3_D2mv32.txt` y las respuestas a las tres preguntas de la entrada 19)*
