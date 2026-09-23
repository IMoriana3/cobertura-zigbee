# Errores propios — PR de corrección del backtracking (R4)

Formato E-X1: qué decía · qué dice ahora · qué lo destapó.

## E-X1-C1 · El contador de «irreducibles» se rompía hacia mi propia tesis

- **Qué decía:** que unos 7.400 extremos con sombra (rama línea 7.396, rama mesa
  7.183, 1.521/1.515 mesas; con θ astronómico 8.587) eran IRREDUCIBLES, es decir,
  que ningún θ los quitaba. De ahí salía la tesis «T5 no se puede cumplir».
- **Qué dice ahora:** son **30 extremos en 23 mesas**, los mismos en las tres
  ramas y todos con el sol a ≤ 1,245°.
- **Qué lo destapó:** el barrido solo daba por limpia una sombra si el impacto
  seguía DENTRO de la misma mesa receptora y con ≤ 1 mm. Si al mover θ el impacto
  salía de esa mesa (y caía en otra, que tiene su propia comprobación), lo contaba
  como irreducible. El error inflaba justo el número que sostenía mi conclusión:
  es el caso exacto de la regla del instrumento que se rompe hacia el resultado
  que se espera (A3). Corregido en `audit4/F_sombra_extremos.mjs` (comentario en el
  barrido) y añadido un segundo barrido con θ emisor ≠ θ receptor antes de llamar
  irreducible a nada.

## E-X1-C2 · El «θ publicado» del documento E no era la cadena publicada

- **Qué decía:** `AUDITORIA_PENDIENTE_POR_LADO.md` daba «publica 19,9783°» para la
  línea 3.
- **Qué dice ahora:** ese valor es `singleaxis` a secas con la pendiente de
  `pairDz`; la cadena publicada añade `pairThetaTorsion`, el acople y
  `repairNoShade`. Además estaba medido en la banda del encargo
  (`plantFromCotas(datos, 500, 0)`, 107 líneas), no en la de la página
  (`plantFromCotas(data, 80, …)`, 79 líneas).
- **Qué lo destapó:** montar `audit4/lib_publicado.mjs` replicando `terrain(c)`
  (`backtracking.html:4655-4676`) para que F_sombra_extremos use lo que la página
  publica de verdad.

## E-X1-C3 · Cité el filtro de solape de la rama mesa en una línea que no es

- **Qué decía:** `backtracking.html:2687-2688` para `if(hi<=lo)continue;` de
  `anglesPairwiseSeg`, en el informe del bloqueo 2, en la consulta al revisor y
  en los comentarios de `G_careo_609.mjs` y `G_mecanismos.mjs`.
- **Qué dice ahora:** `:2689` calcula `lo`/`hi` y el filtro está en `:2690`.
  El filtro homólogo de `pairDz` (rama línea) está en `:1739`.
- **Qué lo destapó:** contrastar la respuesta del revisor, que heredó la cita,
  con el código imprimiendo las líneas. Una cita rota viaja: el revisor
  construyó un argumento sobre ella.

---

# Errores del revisor, retirados por él (misma forma)

## E-R1 · El «2,3 % al ponderar por mesa»

- **Qué decía:** que `pairwise` retrocedía un 2,3 % al ponderar la planta por
  mesa, y que eso era la métrica viendo lo que el mando tiraba.
- **Qué dice ahora:** ese 2,3 % es la caída de `pairwise` **al encender el lazo**,
  medida en otra sesión con `anual_motor.mjs`; no tiene nada que ver con la
  ponderación. Lo que el repo registra de la ponderación por mesa (v1.75) es
  −2,07 % en `true3d`, −2,13 % en `mgl` y menos del 0,08 % en las otras siete,
  `pairwise` incluida (`docs/algoritmos_backtracking.html:66`).
- **Qué lo destapó:** contrastar la premisa con ese registro antes de escribirla en P1.

## E-R2 · «El escalar promediado obliga a proteger a la fila peor»

- **Qué decía:** que el retroceso de más de la ruta por línea nace de que el
  promedio obliga a proteger a la peor de 35 filas.
- **Qué dice ahora:** explicación sin medida. `pairDz` es una **media**, no un
  peor caso, y por sí sola no produce eso. Qué etapa produce el retroceso se mide
  con la ablación de P1.
- **Qué lo destapó:** leer el acumulador (`:1743-1745`): suma ponderada, no máximo.

## E-R3 · «(b) descartada por medida»

- **Qué decía:** que el −18,5 % de P2 era el techo medido de (b) y la descartaba.
- **Qué dice ahora:** el −18,5 % es de **extremos con sombra evitable** (T5a), no
  de energía. La energía de (b) no está medida.
- **Qué lo destapó:** la etiqueta de la cifra en su propia tabla.
