# R3 · ABRIR Y CERRAR LOS DEFECTOS

Cuaderno de la tercera ronda. **El paquete R2 (`audit2/`) está SELLADO y no se
toca**: nada de lo que hay aquí se incorpora a él. Cuando algo de R3 corrija o
contradiga un ítem de R2, se anota aquí con puntero al ítem, y el ítem de R2 se
queda como está.

Reglas en vigor, las mismas de R2: prohibido opinar · `archivo:línea` + fragmento
en toda afirmación · test nulo antes de todo recuento · control negativo antes de
creerse una comprobación que pasa · ninguna cifra sin denominador y sin variante ·
`NO VERIFICADO` en vez de reconstrucciones · coste medido o declarado
desconocido, nunca extrapolado.

| fase | qué cierra | estado |
|---|---|---|
| **0** | mergear el paquete sellado a `main` | **HECHA** |
| 1 | `policyAnglesSeg:2689` — medir ANTES de arreglar | pendiente |
| 2 | el anual por el lazo | pendiente |
| 3 | calibración y transposición | pendiente |
| 4 | texto, indicador y señal | pendiente |

---

## FASE 0 · el paquete sellado, mergeado a `main`

**Qué se ejecutó.** Merge del PR #687 (`claude/backtracking-6th1im` → `main`),
commit de merge `a1bd80e`. Rama en `c948ed7`, `main` antes del merge en
`b7918b9`, base común `91a9a3b`.

**Antes de mergear.** `main` no había tocado `audit2/` en ningún momento desde la
base común — `git diff --name-only 91a9a3b origin/main -- audit2/` devuelve vacío
—, así que el merge no tenía por dónde alterar el paquete. Lo único que la rama
aporta fuera de `audit2/` es `ANATOMIA_BT.md`.

**Después del merge, comprobado y no supuesto.**

| comprobación | resultado |
|---|---|
| sha256 del árbol `audit2/` (97 ficheros, hash de la lista objeto+ruta) antes | `8f72a074e7f0e180…` |
| el mismo, en `main` tras el merge | `8f72a074e7f0e180…` — **idéntico** |
| `git diff origin/claude/backtracking-6th1im origin/main -- audit2/` | **vacío** |
| entradas del `MANIFEST.txt` verificadas | **92 de 92 casan**, 0 no casan |

El verificador es `audit3/verifica_manifiesto.mjs`, ejecutable tal cual. Lleva
**control negativo automático**: antes de dar por buena ninguna comprobación,
cambia un byte de la primera entrada en memoria y exige que el verificador la
marque como NO CASA; si el control no salta, sale con error en vez de publicar un
verde. En la corrida de esta fase el control saltó (`A1.txt` → DETECTADO).

### El defecto del sellado que declaré, y que NO se materializó

`audit2/R3_NOTAS.md` § 1 declara un defecto del propio sellado: la línea 43 del
`MANIFEST` sella `D2mv32.txt` con 1 294 bytes y su sha256, y esos 1 294 bytes son
sólo la cabecera — el productor (E-D8) seguía corriendo al sellar, y el hash
dejaría de casar en cuanto la corrida terminase.

**La corrida no terminó.** Murió con el reinicio del contenedor tras 13 h 48 min
de reloj sin haber escrito ninguna línea de resultado, así que el fichero nunca
cambió:

```
sha256  d43d273924ae64710898bd4c7725966121887537f41eaa47b50a01fb967c7bbc  out/D2mv32.txt
MANIFEST  D2mv32.txt   1294   d43d273924ae64710898bd4c7725966121887537f41eaa47b50a01fb967c7bbc
```

Lo que se anotó como defecto era **de método** —sellar un directorio con un
proceso escribiendo dentro— y sigue siéndolo; la **consecuencia** anunciada no se
produjo. Se deja dicho aquí, y `audit2/R3_NOTAS.md` no se edita.

### Lo que la fase 0 NO comprueba

Que el contenido del paquete sea correcto. Comprueba que es **el mismo**. Son
cosas distintas y el manifiesto sólo puede responder a la segunda.
