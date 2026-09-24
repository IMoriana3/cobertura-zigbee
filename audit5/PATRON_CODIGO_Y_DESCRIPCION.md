# Patrón: el código y su descripción dejaron de coincidir

Registro pedido por el titular (2026-09-24), al señalar `conoHaz` como el cuarto
caso. En los cuatro primeros, el código y el texto que lo describe (un
comentario, a veces la interfaz) decían cosas distintas, y nadie miraba el
código porque se leía el texto. En el quinto pasó lo mismo con la vista de la
escena.

Criterio para entrar en el registro: la descripción está escrita al lado del
código (o en la página, a la vista del usuario), afirma una conducta concreta, y
se ha **medido** que el código hace otra cosa. Cada caso lleva las dos citas y lo
que costaba.

La lista de los cuatro primeros la he reconstruido yo a partir de lo documentado
en este repo. El titular habló de «los otros tres» sin nombrarlos: si alguno no
es el que él tenía en mente, se corrige aquí.

| # | dónde | lo que dice la descripción | lo que hace el código | cómo se vio | estado |
|---|---|---|---|---|---|
| 1 | `backtracking.html` · anual (`yearbtn`) | el comentario que justificaba omitir el slew en el anual decía «paso 20 min» | el bucle iba a 10 min | `audit3/NOTAS.md` §2.3 (R3) | **arreglado**: `const PASO_ANUAL_MIN=10`, que usan el bucle, la ponderación y el lazo; `tools/test_anual_lazo.mjs` prohíbe que un comentario afirme otro paso |
| 2 | `backtracking.html:1729-1732` · `pairDz` | «Δz por PAREJA medido en el SOLAPE norte de las dos líneas» | recorre TODAS las mesas de la línea i contra TODAS las de la i+1 y promedia por solape: 0 de 106 parejas de Ayora dan el Δz del solape norte (peor diferencia 0,2523 m) | `audit4/P1_ALCANCE_PAIRDZ.md` (R4, P1) | medido y declarado; la decisión P1 → (c) va por otro lado (el anual consume la rama por mesa) |
| 3 | `backtracking.html:726` y `:2747` · regla del grupo bifila | «reducir \|θ\| desde un ángulo de backtracking nunca crea sombra» | la propia página, en su nota de la interfaz (`:217-221`), lo desmiente con medida: en cuesta SÍ puede crearla, 75 de 200 instantes (semilla 1) y 68 de 200 (semilla 7) | la nota de `:219` (barrido de terrenos) | los dos comentarios siguen diciendo «nunca»; la nota de la interfaz es la que tiene razón |
| 4 | `backtracking.html:992-994` frente a `:1030` · `conoHaz` | «cos AOI = cos(θ − ψ)·cos λ, con sin λ = s·a» | `sa = sin Z·cos ΔA·sin τ + cos Z·cos τ`: seno y coseno de τ cambiados. El cono se aparta del del motor hasta 8,06° (p50 0,91° en Ayora); `rangoHaz` cambia hasta 0,55° con sol < 10° | `audit5/F0_conohaz.mjs` (BT3D, fase 0) | **no se toca la página** (decisión del titular); el BT3D usa la fórmula del comentario; efecto en el anual de las nueve medido en `audit5/F0_conohaz_anual.mjs` |
| 5 | `backtracking.html` · `consignaEscena` / `sceneInstant` (v1.78.1) | el comentario de `consignaEscena`: «Ahora la escena interpola entre las dos muestras que la rodean… ningún par de minutos consecutivos se separa más de \|Δmuestra\|/STEP_MIN ≤ SLEW·60» | `sceneInstant` no la usaba. Los optimizadores mantenían la muestra y saltaban en el último minuto; el resto iba hacia la consigna del minuto. Resultado: 51° en un minuto (0→51° a las 06:35; 56,0° → 5,0° a las 22:04-22:05 en la captura del titular) con un actuador de 10,2°/min | reportado por el titular viendo la escena; medido con `tools/test_giro_maximo.mjs` | **arreglado** en la rama `claude/giro-maximo-6th1im` (v1.79.0), junto con los otros dos defectos del giro (tope tras el lazo y aparcamiento fuera de ±θmáx); pendiente del visto bueno del titular a las cifras de energía |

## Lo que tienen en común

En los cinco el texto era **razonable**: describía lo que el código debía hacer.
Por eso nadie lo contrastó. En tres (2, 4, 5) el error estaba en una rama o en
una línea que las pruebas de conducta no tocaban: `pairDz` solo en líneas
escalonadas, `conoHaz` solo en el extremo trasero del rango con sol bajo, la
escena solo entre muestras de la malla. Lo que funcionó cada vez fue medir el
código contra una referencia independiente: el Δz del solape, el cono de la
normal del motor, la escena minuto a minuto contra el tope del actuador.

La defensa que ya existe para el caso 1 —un banco que falla si un comentario
afirma algo que el código no hace— es la que falta en los otros. Para el 5 ya la
hay (`tools/test_giro_maximo.mjs` mide la conducta, no el texto). Para el 4, el
banco C de `audit5/test_parametros.mjs` fija la diferencia declarada entre la
página y el BT3D.
