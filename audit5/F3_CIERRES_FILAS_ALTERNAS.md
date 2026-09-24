# R5 · Los tres cierres del hallazgo de las filas alternas

**PUBLICADO** (decisión del titular, 2026-09-24, tras ver los tres cierres):
**+4,12 % a sol 78/105 y +5,90 % a 80/250**, con la difusa enmascarada, el
albedo real y el mismatch medidos, y **ninguno de los tres lo explica**. Es la
cifra del modelo 2D de este documento, con sus límites declarados abajo; no
es medida de campo.

## El hallazgo
En terreno uniforme, a sol bajo, la política de conjunto encuentra
configuraciones **no uniformes y sin sombra** que dan más POA que la tangencia
uniforme (audit5/FASE2_PARADA.md): +6,15 % a 78/105 y +7,08 % a 80/250, en la
métrica de la página (`poaRow`, `backtracking.html:2502`). Esa métrica no
descuenta tres cosas, y las tres podían comerse la ganancia.

## Los cierres (`audit5/F3_filas_alternas_cierres.mjs` → `audit5/out/F3_filas_alternas_cierres.txt`)
Modelo de vista 2D en el plano transversal (`audit5/lib_vista2d.mjs`), el mismo
caso de la refutación: 7 filas planas, paso 6, cuerda 2,384, z0 0,17,
irradiancia 900/800/100, albedo 0,2. El eje está a **2,0 m del suelo**
(`seguidor.js:41`, «del suelo al EJE DEL TUBO»).

1. **Difusa enmascarada.** El cielo isótropo de cada cara se multiplica por su
   factor de vista real, calculado con rayos y con las vecinas en su θ, y no por
   (1+cos β)/2. La banda de horizonte (F2 de Perez) se multiplica por la fracción
   visible de los primeros 6,5° de elevación del lado al que mira la cara.
2. **Albedo con el suelo real.** Cada punto de suelo que ve la cara recibe
   DHI·(su factor de vista al cielo) + DNI·cos Z solo si está al sol. Las filas le
   hacen sombra y le tapan cielo, y eso incluye la sombra de la propia fila.
3. **Mismatch.** Cada string va en un ala de una fila («un string por ala»,
   v1.43). Por eso **no hay mismatch en serie entre filas**. Queda el de strings de
   filas distintas en paralelo en un MPPT, y se toma el **peor caso**: todas las
   filas en un mismo MPPT.
   - Módulo **genérico declarado**, porque no hay ficha en el repositorio: Isc
     13,9 A, Voc 49,6 V, Imp 13,1 A, Vmp 41,2 V.
   - Modelo I–V explícito, con la corriente proporcional a la POA y la tensión
     desplazada 2,22 V por módulo y por unidad de ln(POA/1000).
   - 28 módulos por string, a 25 °C.

**Test nulo:** una fila sola, con el suelo sin sombra, reproduce `poaRow` a
4,0·10⁻⁴, y el factor de vista al cielo es (1+cos β)/2 a 5,0·10⁻⁴.
**Control:** en la configuración uniforme, una fila interior ve 0,9500 de cielo
frente a 0,9688 sin vecinas, así que la máscara actúa.

| sol (cenit/acimut) | alterna | 0 · página | 1 · + difusa enmascarada | 2 · + albedo real | 3 · + mismatch (peor caso) |
|---|---|---|---|---|---|
| 78/105 | 41,7/0/41,7/0/41,7/0/55 | +6,15 % | +6,20 % | +4,70 % | **+4,12 %** |
| 80/250 | −42,3/0/−34,1/−4,4/−29,2/−7,6/−25,8 | +7,08 % | +7,09 % | +6,26 % | **+5,90 %** |
| 70/265 | −55/−33,8/−43,8/−37,4/−41,1/−38,8/−40,2 | +1,29 % | +1,30 % | +1,15 % | **+1,15 %** |
| 72/95 | 55/13,5 alternas | −0,46 % | −0,38 % | −1,28 % | **−1,44 %** |

### Cifra final, con y sin cada cierre

La tabla de arriba es acumulativa, y el orden de los cierres reparte sus
interacciones. Esta no depende del orden: son los tres cierres puestos, y
luego quitando **uno** cada vez con los otros dos puestos. Pedida por el
titular el 2026-09-24.

| sol (cenit/acimut) | página | **los tres** | sin difusa enmascarada | sin albedo real | sin mismatch |
|---|---|---|---|---|---|
| 78/105 | +6,15 % | **+4,12 %** | +4,08 % | +5,59 % | +4,70 % |
| 80/250 | +7,08 % | **+5,90 %** | +5,89 % | +6,71 % | +6,26 % |
| 70/265 | +1,29 % | **+1,15 %** | +1,14 % | +1,29 % | +1,15 % |
| 72/95 | −0,46 % | **−1,44 %** | −1,50 % | −0,55 % | −1,28 % |

Qué resta cada cierre, medido como «sin él» menos «los tres»:

- **albedo real:** 1,47 puntos a 78/105 y 0,81 a 80/250;
- **mismatch:** 0,58 y 0,36 puntos;
- **difusa enmascarada:** −0,04 y −0,01 puntos. Con ella la ganancia es un poco
  **mayor**, no menor.

Los tres cierres son del mismo modelo 2D y tienen las mismas limitaciones,
declaradas abajo.

## Lectura
- **La difusa enmascarada no se come la ganancia: la sube una centésima.** La
  fila empinada le quita cielo a la plana, pero las filas uniformes también se
  tapan entre sí, y un poco más.
- **El albedo es el que más muerde.** El suelo que ve una fila empinada a sol
  bajo está casi todo a la sombra: de 20,5 a entre 1,4 y 2,8 W/m² en las filas de
  41,7° a 78/105. Resta entre 0,15 y 1,45 puntos, según el sol.
- **El mismatch en paralelo es pequeño**, incluso en el peor caso: una pérdida de
  entre 0,007 % y 0,55 % en la alterna y 0 en la uniforme.
- **Balance:** a sol de 10-12° el hallazgo **sobrevive** a los tres cierres, con
  +4,1 % y +5,9 %. En los casos en que la alterna ya perdía, pierde más.

## Lo que NO cierra esto (declarado)
- **2D**: filas infinitas a lo largo del eje, sin efectos de borde norte-sur.
- La luz que reflejan los dorsos de las vecinas no se modela: se pierde.
- El suelo recibe la difusa como isótropa; la banda de horizonte se enmascara con
  una fracción visible de 6,5°, que es una aproximación.
- **Temperatura**: la fila que coge más haz se calienta más y rinde algo menos. No
  se ha modelado y es un cuarto efecto que resta.
- **Módulo genérico**: sin ficha, el mismatch en paralelo es de un módulo típico.
- **Solo las configuraciones que encontró la política** con la métrica de la
  página. Con la métrica corregida el óptimo podría ser otro; no se ha
  reoptimizado.
- Es modelo, no medida de campo.

## Error propio (E-X1)
- **E-X1-R5-F3-1** · La primera versión del test nulo metía en el suelo la
  sombra que la propia fila le hace, que es física real, y salía «NO PASA,
  14 %». El test nulo tiene que comparar con el suelo sin sombra. Esa sombra
  pertenece al cierre 2 y ahí está medida.
