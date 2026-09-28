# Overcast v1.32 — SUNNY / OVERCAST y corrección Perez

Continuación de IMoriana3/cobertura-zigbee#763 sobre
`6246d35260ea434f8741dfde7df6a6e7efded577`.

## Cambios

- El simulador existente conserva `seguidor.js`, políticas, lazo, gráficos,
  exportaciones y layouts. SUNNY y OVERCAST pasan por el mismo pipeline.
- OVERCAST aplica cobertura 1: DNI=0 y DHI=GHI. La luz directa, el disco y
  las sombras duras se apagan; fondo y luz ambiente convergen a gris neutro.
- Restaurar cielo recupera la fuente meteorológica, datos y cielos por NCU.
- Vista natural por defecto; mapa de radiancia opcional. La explicación
  numérica permanece en ambos. El óptimo se rotula como diagnóstico.
- BUG: recortar las componentes Perez por separado añadía POA ficticia.
  Se preserva su signo y se recorta sólo el total, como pvlib 0.16.1.
- BUG: la caché del óptimo omitía posición solar y albedo. Ahora pertenece al
  día y contempla todos los inputs del instante. De noche no emite un óptimo.

## Verificación y límites

- `node tools/test_overcast_sim.mjs`: 122 comprobaciones correctas, incluido
  el golden del core de 1.104 pasos. No se regeneró el golden.
- Control negativo histórico: el HEAD anterior falló cuatro comprobaciones
  en el job 108919253329, incluidas 681 discrepancias contra ese golden.
- Paridad de componentes con pvlib 0.16.1: validada por el arnés real de
  SolarGPTfull#333, incluyendo horizonte negativo frontal y trasero.
- Controles SUNNY/OVERCAST y restauración: PASSED en Happy DOM con el JS
  real de la página. Se simula Canvas; no constituye validación visual.
- El banco de navegador se amplía para botones, restauración exacta, luz,
  sombras y cambio de vista. Ejecución WebGL local: ENVIRONMENT_BLOCKED
  (`socket() failed: Operation not permitted`); el CI debe ejecutarlo.
- No se ha fusionado en main ni cambiado el público del simulador existente.
  La revisión privada es una distribución de estos mismos archivos.
- El mapa angular sigue siendo una aproximación explicativa. El óptimo
  difuso de la página no es una consigna con certificación geométrica P1.
- Los gates completos #308/#328/#332/#333 se cierran sólo con su CI vigente.
