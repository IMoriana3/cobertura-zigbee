# Overcast v1.33 — banco de ingeniería del emplazamiento

Evolución del simulador existente en #763. Conserva `seguidor.js`, layouts,
bóveda, selección, timeline, políticas, zonal, actuador y exportaciones.
No crea otra aplicación ni modifica la visibilidad del sitio.

## Qué cambia

- `evaluatePolicyDay` es la única evaluación para día, año y calibración.
  El año usa el ciclo configurado y las mismas guardas; el actuador integra
  al minuto. Los meses sintéticos se ponderan por sus días reales.
- Una guarda posterior al lazo podía crear un salto imposible. La salida
  se proyecta ahora sobre el intervalo físicamente alcanzable y admisible
  por sombra 1D. Si no existe solución se conserva el slew y se declara el
  exceso, sin certificar un movimiento imposible.
- `overcast_engine.js` contiene el supervisor causal compartido con Node y
  el adaptador Python P1. No contiene física solar, POA ni geometría.
  Compara POA total, confirma durante minutos transcurridos, exige dwell
  y retiene dentro de una banda casi óptima. No consulta nubosidad futura.
- El adaptativo frontal usa Perez existente + IAM producido por el motor
  04: physical (n=1.526), Martin-Ruiz (a_r=0.16), horizonte Marion. La tabla
  a 0,1° se genera con `build_overcast_iam_tables.py`; no se edita a mano.
  La selección explora 2° y refina ±2° a 0,1°. No se declara óptimo global.
- Curva diagnóstica completa a 0,1°, bandas casi óptimas separadas, regiones
  de sombra, trayectoria hora/ángulo, POA efectiva acumulada, componentes,
  motivos de decisión y calidad comparten reloj y resultados del motor.
- Se comparan cinco políticas existentes y doce ajustes del adaptativo.
  Selección en el 70 % cronológico inicial, comprobación de la ganadora
  en el 30 % posterior. No se usa el resultado reservado para reelegir.
  Límites de motor/arranques rechazan candidatos; no equivalen a un SoC.
- CSV propio o archivo ERA5; 48 días sintéticos reproducibles para probar
  el método. Los días con huecos diurnos se excluyen del ajuste. Faltantes,
  recorte del DNI y residuo de irradiancia se declaran. Sin CC, DHI/GHI sólo
  aproxima el aspecto del cielo; no se presenta como cobertura medida.
- JSON conserva entradas, procedencia, motor, configuración, división de
  días, ranking, pérdidas diarias/mensuales, sensibilidad al albedo y trazas.
  CSV exporta ejecutado, referencia, POA efectiva y motivo al minuto.
- Importación `overcast_p1_sequence_v1` por activo/TCU: lee los resultados
  finitos del motor canónico, sin recalcularlos en la UI ni inferir identidad
  por el orden del dibujo. La escena 1D y el expediente P1 se identifican.

## Verificación local (2026-09-28)

- 122 comprobaciones existentes correctas; golden de 1.104 pasos preservado.
- 11 contratos nuevos: causalidad, confirm/dwell efectivos en la salida,
  sombra, huecos, bandas disjuntas, presupuesto, división cronológica y slew.
- Regresión 2026-02-25, ciclo 15 min: antes máximo 0,184374°/s; ahora
  0,17°/s y cero minutos con sombra adicional en ese caso.
- 180 casos / 1.080 componentes contra `evaluate_effective_poa` de 04 con
  pvlib 0.16.1; máximo desvío 0,007480 W/m², tolerancia 0,01 W/m². Incluye
  ángulos fuera de rejilla, ejes girados/inclinados y horizonte negativo.
- Cuatro pruebas del adaptador temporal finito P1 correctas: identidad,
  ejecución con slew, huecos rechazados y resolución temporal exigida.
- Controles reales en Happy DOM: SUNNY/OVERCAST/restaurar, selección de
  adaptativo, reloj, exportación y ausencia de errores. Canvas simulado.
  Banco Playwright ampliado; WebGL local bloqueado por el entorno. No se
  afirma validación local de píxeles ni CI completo cerrado.
- Ensayo sintético: 41,5763 N, −0,7981 E, altitud 300 m, TL 3,5, albedo 0,2,
  ciclo 15 min, año 2026. 33 días de ajuste, 15 reservados. Ganadora
  `diffuse_limited`: +0,763364 % en reserva, 202,030 Wh de motor frente a
  213,193 Wh, 420 arranques, 1/15 días con pérdida, cero excesos evaluados.
  Con albedo 0,15 / 0,25: +0,812901 % / +0,714164 %. Es un ensayo de método,
  no rendimiento medido del emplazamiento ni resultado del ciclo de 1 min.

## Alcance que sigue abierto

El navegador calcula filas planas y objetivo frontal. Una planta real dibujada
no valida sus cotas, obstáculos, acoplamientos, difusión apantallada ni cara
trasera. P1 requiere geometría finita e identidades explícitas. Su adaptador
evalúa directa/circumsolar y la transición muestreada con Sol fijo; no prueba
seguridad continua, viento, recarga/SoC ni ganancia bifacial eléctrica.
No hay una política óptima de campo sin ejecutar y validar esos datos reales.

La media horaria de ERA5 no acota por sí sola el error de nube rápida. Se ha
retirado la afirmación anterior de que necesariamente infraestima la ganancia.
Referencia del contrato temporal: https://open-meteo.com/en/docs/historical-weather-api
IAM: https://pvlib-python.readthedocs.io/en/v0.16.1/reference/generated/pvlib.iam.marion_diffuse.html
