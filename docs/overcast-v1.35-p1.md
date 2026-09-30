# Overcast v1.35 — P1 v2 y precedencia de CONTROL

v1.35 no añade otro optimizador. Mantiene el supervisor causal único de
`overcast_engine.js` y amplía su frontera con SolarGPT.

## Qué cambia

- `adaptive-supervisor-v2` acepta un estado `locked` de 05_CONTROL. Viento,
  granizo, nieve, batería o noche ganan a la optimización difusa y reinician la
  memoria de confirmación/permanencia. Al liberar la restricción la ganancia
  debe confirmarse otra vez.
- El worker Node puede ejecutar esos pasos bloqueados sin una lista ficticia de
  candidatos.
- El banco de ingeniería acepta `overcast_p1_sequence_v2` además de v1.
  P1 v2 exige una superficie de candidatos por instante, seguridad P1,
  captación media de la transición y exactamente un candidato seleccionado.
- La interfaz muestra esas alternativas 3D y su vector físico sin recalcular
  sombra, terreno ni POA. El eje X de la gráfica es el ángulo del activo
  seleccionado; cada punto sigue representando el vector completo de la TCU.
- El contrato distingue `front_effective` de
  `front_plus_rear_effective` y declara `rear_authority`. Una trasera
  ausente se muestra como desconocida, nunca como 0 W/m².

## Lo que no cambia

La escena local de Overcast sigue siendo un preview 1D de filas planas. El
resultado 3D autoritativo llega desde SolarGPT P1 con identidad y acoplamiento
explícitos. La UI no crea un segundo juez 3D.

El expediente P1 sigue siendo de ingeniería (`operational=false`) hasta que
el proveedor del contrato pueda demostrar todas las capas de seguridad y la
validación de campo correspondientes.

## Gates

`tools/test_overcast_engine.mjs` comprueba:

- precedencia de CONTROL y reinicio de memoria;
- rechazo de candidatos con sombra;
- compatibilidad scalar/vector del supervisor;
- contrato P1 v1 legacy;
- contrato P1 v2 y unicidad del candidato seleccionado.

Los bancos de vista y simulador existentes continúan cubriendo la escena,
curvas, actuador y paridad del resto de Overcast.
