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

Los tres primeros los reconstruí yo a partir de lo documentado en el repo; el
titular confirmó (2026-09-24) que son los que él tenía. El sexto lo señaló él,
el mismo día. El séptimo lo pidió registrar él (2026-09-24), a partir de la
medida de B.2.

| # | dónde | lo que dice la descripción | lo que hace el código | cómo se vio | estado |
|---|---|---|---|---|---|
| 1 | `backtracking.html` · anual (`yearbtn`) | el comentario que justificaba omitir el slew en el anual decía «paso 20 min» | el bucle iba a 10 min | `audit3/NOTAS.md` §2.3 (R3) | **arreglado**: `const PASO_ANUAL_MIN=10`, que usan el bucle, la ponderación y el lazo; `tools/test_anual_lazo.mjs` prohíbe que un comentario afirme otro paso |
| 2 | `backtracking.html:1729-1732` · `pairDz` | «Δz por PAREJA medido en el SOLAPE norte de las dos líneas» | recorre TODAS las mesas de la línea i contra TODAS las de la i+1 y promedia por solape: 0 de 106 parejas de Ayora dan el Δz del solape norte (peor diferencia 0,2523 m) | `audit4/P1_ALCANCE_PAIRDZ.md` (R4, P1) | medido y declarado; la decisión P1 → (c) va por otro lado (el anual consume la rama por mesa) |
| 3 | `backtracking.html:726` y `:2747` · regla del grupo bifila | «reducir \|θ\| desde un ángulo de backtracking nunca crea sombra» | la propia página, en su nota de la interfaz (`:217-221`), lo desmiente con medida: en cuesta SÍ puede crearla, 75 de 200 instantes (semilla 1) y 68 de 200 (semilla 7) | la nota de `:219` (barrido de terrenos) | **eliminado** en la refundación del BT, paso 3.2 (v1.83.0, rama `claude/refundacion-p3-6th1im`): las cuatro afirmaciones reescritas (nota de la interfaz y tres comentarios); `grep -i "nunca crea sombra" backtracking.html` → 0 |
| 4 | `backtracking.html:992-994` frente a `:1030` · `conoHaz` | «cos AOI = cos(θ − ψ)·cos λ, con sin λ = s·a» | `sa = sin Z·cos ΔA·sin τ + cos Z·cos τ`: seno y coseno de τ cambiados. El cono se aparta del del motor hasta 8,06° (p50 0,91° en Ayora); `rangoHaz` cambia hasta 0,55° con sol < 10° | `audit5/F0_conohaz.mjs` (BT3D, fase 0) | **no se toca la página** (decisión del titular); el BT3D usa la fórmula del comentario; efecto en el anual de las nueve medido en `audit5/F0_conohaz_anual.mjs` |
| 5 | `backtracking.html` · `consignaEscena` / `sceneInstant` (v1.78.1) | el comentario de `consignaEscena`: «Ahora la escena interpola entre las dos muestras que la rodean… ningún par de minutos consecutivos se separa más de \|Δmuestra\|/STEP_MIN ≤ SLEW·60» | `sceneInstant` no la usaba. Los optimizadores mantenían la muestra y saltaban en el último minuto; el resto iba hacia la consigna del minuto. Resultado: 51° en un minuto (0→51° a las 06:35; 56,0° → 5,0° a las 22:04-22:05 en la captura del titular) con un actuador de 10,2°/min | reportado por el titular viendo la escena; medido con `tools/test_giro_maximo.mjs` | **arreglado** en la rama `claude/giro-maximo-6th1im` (v1.79.0), junto con los otros dos defectos del giro (tope tras el lazo y aparcamiento fuera de ±θmáx); pendiente del visto bueno del titular a las cifras de energía |
| 6 | `tools/test_anual_lazo.mjs` · un BANCO, no un comentario | su título: «LA RUTA ANUAL PASA POR EL LAZO, Y NO PUEDE VOLVER A SALTÁRSELO» (`:1`) | corta su fuente en el `onclick` del botón del año —de `$('yearbtn').onclick` a `const ref=tot['pairwise']` (`:26-28`)— y por eso no ve la OTRA ruta anual de la página: `grAnualGen` (`backtracking.html:9627-9659`) suma `policyAngles → poaPlant` sin `crearLazo`, y es lo que publica la columna del año del informe gráfico (`:9599`). El banco está en verde con esa ruta saltándose el lazo | señalado por el titular; verificado leyendo las dos citas | **registrado, no arreglado**: arreglar `grAnualGen` mueve las cifras del informe; lo decide el titular. Es el peor de los seis: un comentario desactualizado engaña a quien lo lee; un banco que no ve lo que dice vigilar engaña a todo el mundo |
| 7 | `backtracking.html` · el HAZ DE SOMBRA (`ovM_haz`) de la escena 3D | su comentario: «HAZ DE SOMBRA: el volumen que va del objeto que sombrea a su mancha sobre la mesa» (`:6839` en `main` v1.78.1 · `:6841` en v1.80.0) | lleva el volumen hasta `Hs`, la proyección del contorno emisor sobre el plano INFINITO de la pala receptora (`const H=[P[0]+t*dsh[0],…]`, `:6963` · `:6965`), SIN recortar a la pala; la silueta, que es la sombra que se pinta, sí se recorta (`poly=clipPoly(poly,edge)`, `:6971` · `:6973`). Medido en el estado de la «mancha» con monofila: dos de los cuatro extremos del haz caen a 13,9 y 14,5 m del eje de la pala receptora, fuera de su largo y a 1,22 m sobre el terreno: dibuja volumen donde no hay superficie | medido en B.2 (`audit_mancha/MANCHA.md` y sondas `M0`–`M4`, rama `claude/config-json-6th1im`, PR #753) | **registrado, no arreglado** (el titular no lo ha pedido). Defecto de render por sí solo, sea o no la mancha que vio el titular (esa sigue ABIERTA: el haz es candidato, no respuesta — sus caras son paralelas al rayo y su pista decía perpendicular). No afecta al contador: el haz es una ayuda visual y no se cuenta |
| 8 | `backtracking.html` · el ANUAL del informe gráfico (`grAnualGen`) frente al deslizador de nubes | la ayuda del deslizador (`main` v1.78.1, `:169`, `title` de `id="cloud"`): «Cobertura nubosa del DÍA simulado… La tabla ANUAL sigue siendo cielo claro y lo declara» | `grAnualGen` aplicaba esas nubes al anual del informe: `const irr=skyWithClouds(clearskyIneichen(g.zen,doy,c.alt,c.tl),cloudCC(),g.zen);` (`main` v1.78.1, `:9609`). Con nubes al 60 % el informe cambiaba el orden de las políticas (`mgl` de −0,24 % a +0,72 % sobre `astro`), y sin lazo publicaba para `pairwise` +2,46 % donde el botón +0,70 % (genérica, `audit5/P2_1_tres_rutas.mjs`) | medido en la refundación del BT, paso 2.1 (rama `claude/refundacion-p2-6th1im`) | **eliminado por construcción** en el paso 2 (v1.82.0): hay UNA ruta anual, `function* anualGen`, con lazo y cielo claro; el informe la consume con `yield*` y ya no lee el deslizador. `tools/test_anual_lazo.mjs` se pone rojo si vuelven nubes a la ruta (mutante «nubes DENTRO de la ruta única») |
| 9 · **por el otro lado** | `backtracking.html` · `driveCoupleSafe` (paso 2, `:789`) | el NOMBRE: «**Safe**», acople seguro. Esta vez la descripción decía la VERDAD | la función acopla el grupo (`applyDrive`) y además REPARA la sombra entre parejas: busca el candidato sin contacto más cercano, con el residuo de tangencia 3D en `true3d`. En el paso 3 se leyó como «el acople» y se retiró entera: `true3d` pasó de 53 a 119 parejas de líneas en contacto 3D (48 instantes × 78 parejas, Ayora) y perdió −0,42 % / −0,57 % del día | medido en la refundación del BT, paso 3.3 (`audit5/P3_3_reparacion.mjs`, rama `claude/refundacion-p3-6th1im`) | **en corrección**: decisión (a) del titular, la reparación se conserva con cada línea como su unidad (los mismos 53 contactos). No se aplica hasta medir la energía. El banco gana una comprobación de PROPIEDAD (regla R-4, `audit5/REGLAS.md` de esa rama) |
| 10 · **por una tercera cara** | `tools/test_terreno_plantas.mjs:10-11` frente a 9 bancos del navegador (22 ficheros cargan `terreno.html` con su propio `chromium.launch`) | la RAZÓN, escrita en #479 (1509bad, 2026-08-17) y viva hoy: «Un navegador POR PLANTA a propósito: reusando uno solo, el proceso de render se quedaba ocupado con la planta anterior y la siguiente no arrancaba nunca.» | la clase entera repite el patrón: `test_solapes` carga **6 plantas en un navegador**, y también `test_relieve_plantas`, `test_suelo`, `test_gcr_planta`, `test_tope_mapa`, `test_bt3d_rot`, `test_panel_plegable` (con la primera página aún abierta), y `test_equipos`/`test_fps` sin argumento. Medido: el proceso de GPU es de todo el navegador; con la escena anterior en él, la página siguiente recibe su HTML (200) y no arranca. Mismo navegador, 7 de 12 lentas (~80 s) o colgadas; navegador nuevo, 12 de 12 en 0,44-1,70 s. **Se pagó y se RODEÓ TRES VECES sin conectarlo:** (1) #479 lo documentó y lo esquivó en su banco; (2) #741 vio «relieve · grandes» cancelado tras 33 min con El Burgo y lo rodeó sacando El Burgo a su propia entrada; (3) `test_equipos` lo rodea no esperando `ctx.close()` —«Ahi estaba TODO el tiempo de este banco: El Burgo ctx.close 96,0 s de 107 totales · Ayora 157,9 s de 162» (`:558-575`)— y matando a los hijos por PID (`:603-607`). Y `test_bt3d_rot` se colgó en CI en #753 y #759 | diagnóstico de `test_bt3d_rot` (ramas `claude/bt3d-rot-contexto-6th1im` y `claude/pw-una-pagina-6th1im`); lectura de los 33 ficheros de la matriz `navegador` | **en corrección, por mecanismo**: `navegador()` en `tools/pw_navegador.mjs` LANZA un error si se carga una segunda página pesada en el mismo navegador, y un guardia en `tools/test_pw_navegador.mjs` exige que todo banco que cargue `terreno.html` lance por ahí (con su control negativo). Lo que impide la cuarta vez no es documentarlo mejor: es que no se pueda hacer. Yo mismo di la razón por inexistente al principio (busqué junto al `launch` y no en la cabecera), y medí la clase dos veces por lo bajo (4 bancos, luego 9) |
| 11 · **el control que no puede distinguir** | `SolarGPTfull/solargpt/tests/test_bt3d_true3d.py:52` (y su gemelo `tests/test_bt3d_touching_shadows.py:64`), el ray-cast de fuerza bruta que respalda la garantía 4 del motor bancable | la cabecera del test: «NO inter-row self-shade in full 3-D at meaningful sun (brute-force ray-cast)» (`:13`), y el docstring de la fuerza bruta: «Ground-truth 3-D ray-cast» (`:50`) | construía el eje y la cuerda con el MISMO `a = np.array([0, ca, sa])` que el motor que comprobaba (`tracker3d.py:490`): careaba el 3D consigo mismo, en su propio convenio. Ese convenio era el ESPEJO del que el fichero declara (`RowPairTerrain`, `tracker3d.py:45`: pvlib) y del que recibe pvlib en el mismo fichero. Medido: en un plano inclinado el límite 3D casa con pvlib a 1e-4° solo con el tilt cambiado de signo; con el que usa, se separa 18-40° (`audit5/P4_signo_tilt.py`). Lo que costaba: la «ganancia 3D en torsión» era el espejo — los «casos estrella» de la matriz de 30 topografías pasan de +11,6 % … +16,8 % a −0,09 % … −0,15 %, y en un plano `true3d` cobraba un 2 % MENOS que `pairwise` | el careo JS ↔ `tracker3d.py` del paso 4 (hallazgo 4.0 de `audit5/REFUNDACION_P4.md`); el test lo vio por fin cuando su fuerza bruta se construyó desde `pvlib.tracking.calc_surface_orientation` y no desde el motor | **en corrección** (paso 4.3, (p1), PR propio en `SolarGPTfull`): una sola frontera de signo (`_axis_rise_rad`), la fuerza bruta desde pvlib (`tests/geometria_pvlib.py`) y un test de anclaje contra pvlib con el tilt espejado como control negativo. Informe con efecto antes/después: `docs/audit/BT3D-SIGNO-TILT.md` de ese repo. Es el caso más puro del registro: la descripción no mentía sobre el código, mentía sobre lo que el test PODÍA ver |

## Lo que tienen en común

En los ocho primeros el texto era **razonable**: describía lo que el código
debía hacer. Por eso nadie lo contrastó.

**El noveno es el mismo defecto visto desde el otro lado.** Allí el texto
mentía y se creía; aquí el nombre decía la verdad —«Safe»— y se leyó como otra
cosa, «acopla». En los dos casos, el que cambia el código no lee el código:
lee lo que cree que dice. La defensa es la misma. El banco tiene que verificar
la PROPIEDAD que la función sostiene, no la forma del cambio que se hizo sobre
ella (regla R-4).

**El undécimo es el más puro: un control que no puede distinguir no es un
control superado.** El test estaba bien escrito, corría, pasaba y comprobaba lo
que decía comprobar —que el 3D no sombrea según una fuerza bruta 3D—. Lo que no
podía hacer es dar un resultado distinto si el convenio estaba al revés, porque
la «verdad» contra la que careaba estaba construida con la misma fórmula que el
motor. La defensa es sacar la referencia de un tercero (aquí, pvlib) y ponerle al
lado un control negativo que tenga que suspender: el tilt espejado. Y su hermana,
escrita en el contrato del paso 4 (`audit5/CONTRATO_BT.md`): **un esquema que
nadie valida es un rastro, no la cosa** — por eso el esquema se valida contra el
`T` que monta la página y contra seis mutaciones que tienen que suspender
(`tools/test_esquema_contrato.py`, en CI).

**El décimo, por una tercera cara:** ni un comentario desactualizado ni un nombre
mal leído. La solución y su razón estaban escritas y correctas, pero en UN sitio.
El que se topó con el cuelgue lo rodeó en su banco y lo explicó allí; los bancos
vecinos repitieron el patrón que lo provoca, y el mismo defecto se volvió a
pagar y a rodear DOS veces más sin conectarlo: #741 aislando El Burgo y
`test_equipos` dejando de esperar al cierre y matando procesos. La defensa no es un banco más: es que la razón viva
donde está la regla, en el sitio que usan todos (el lanzador común de navegador,
`tools/pw_navegador.mjs`), y no en la cabecera del primero que la pagó. En tres (2, 4, 5) el error estaba en una rama o en
una línea que las pruebas de conducta no tocaban: `pairDz` solo en líneas
escalonadas, `conoHaz` solo en el extremo trasero del rango con sol bajo, la
escena solo entre muestras de la malla. Lo que funcionó cada vez fue medir el
código contra una referencia independiente: el Δz del solape, el cono de la
normal del motor, la escena minuto a minuto contra el tope del actuador.

La defensa que ya existe para el caso 1 —un banco que falla si un comentario
afirma algo que el código no hace— es la que falta en los otros. Y el caso 6
enseña su límite: un banco también es una descripción, y si corta la fuente por
un sitio y la conducta vive en otro, afirma lo que no mira. Un banco de FUENTE
tiene que demostrar que su corte cubre TODAS las rutas que dice vigilar (por
ejemplo, contando las llamadas a `poaPlant` del fichero entero y exigiendo que
cada una tenga su lazo), no solo la que encontró primero. Para el 5 ya la
hay (`tools/test_giro_maximo.mjs` mide la conducta, no el texto). Para el 4, el
banco C de `audit5/test_parametros.mjs` fija la diferencia declarada entre la
página y el BT3D.
