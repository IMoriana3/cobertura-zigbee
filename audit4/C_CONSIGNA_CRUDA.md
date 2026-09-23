# R4 · C — POR QUÉ LA CONSIGNA CRUDA GANABA A LOS DOS MODELOS

**Ya no gana.** La causa está localizada y es una: **la casa aplica SIEMPRE una
banda muerta que la TCU solo aplica DURANTE EL BACKTRACKING.**

**Acota, no arregla.** Sonda: `audit4/C_consigna_cruda.mjs` →
`audit4/out/C_consigna.json`.

---

## C.4 · Test nulo, delante de cualquier recuento

Si los tres modelos coincidieran en la mayoría de los instantes, el RMS no
discriminaría y ninguna cifra de abajo significaría nada.

| pareja | instantes idénticos | de 2.213 |
|---|---|---|
| página == núcleo | 66 | **3,0 %** |
| página == mando | 33 | **1,5 %** |
| núcleo == mando | 33 | **1,5 %** |

**Los tres discrepan en el 97-98,5 % de los instantes.** El RMS discrimina.

---

## C.1 · Sincronía — **REFUTADA**

Barrido de un desfase artificial entre consigna y encoder, ±5 pasos
(`desfase +1` = al instante *k* se le atribuye la consigna del *k+1*, o sea el
encoder va retrasado respecto al mando).

| desfase | página | núcleo | mando (control) |
|---|---|---|---|
| −2 | 2,3452° | 2,5603° | 2,1788° |
| −1 | 1,9723° | 2,1228° | 1,5625° |
| **0** | **0,9215°** | **0,6847°** | **0,4867°** |
| +1 | 1,2493° | 0,9645° | 1,4886° |
| +2 | 1,8384° | 1,3854° | 2,0735° |

**El mínimo cae en desfase 0 para los tres**, y la curva es limpia a ambos
lados. **No hay problema de convenio temporal.** El aviso del encargo sobre el
adelanto de v1.69 queda cubierto: si el adelanto estuviera desplazando la
predicción en el tiempo, el mínimo caería fuera del cero. No cae.

---

## C.2 · Banda muerta — **AQUÍ ESTÁ**

### Primero, la conversión pulsos→grados, que no se da por 1,0°

El registro **41061** (`tools/modbus_src/tcu_v6.json`) trae **45 pulsos** por
defecto, y el mapa **no publica la constante pulsos/grado** — lo declara la
propia casa (`backtracking.html:3308`, `config_tcu_ayora.meta.json`).

La **única** conversión que existe en los repos accesibles está en el gemelo
digital (`gemelo-digital/sim/planta.js:461`): los topes 41037/41038 valen
**±1910 pulsos** (verificado en el mapa: `Maximum west tilt angle`, def 1910) y
se les atribuye **±55°**, de donde salen **34,7 pulsos por grado**.

```
45 pulsos ÷ 34,727 pulsos/° = 1,296°
```

**Así que ni siquiera es 1,0°: bajo la única conversión de la casa serían
1,296°.** El eslabón débil es explícito: **el mapa nunca dice que 1910 pulsos
sean 55°** — eso lo pone el θmáx canónico. Se publica la cadena entera para que
se vea dónde está la suposición.

Y no rescata nada: **1,296° ajusta PEOR que 1,0°** en los dos regímenes.

### El barrido de la banda como parámetro libre

| banda | página | núcleo |
|---|---|---|
| 0,000° | 0,4867° | 0,4867° |
| **0,100°** | **0,4776°** | 0,5018° |
| 0,500° | 0,5645° | 0,5239° |
| 1,000° (canónico) | 0,9215° | 0,6847° |
| 1,296° (pulsos) | 1,1563° | 0,7883° |
| 2,000° | 1,7162° | 1,5666° |

Sobre la muestra entera, el RMS **crece monótonamente con la banda**. A banda 0
los dos modelos colapsan en el mando crudo, que es lo que la teoría dice y por
tanto un control de que la sonda hace lo que cree.

### C.2b · La partición que el propio registro pide

El 41061 se llama, **literalmente**, «Deadband when backtracking **is
active**». Y en los 325 registros del mapa **no hay ninguno para la banda fuera
del backtracking**: solo 41061 y 41063, los dos «when backtracking is active».

> **El canónico de 1,0° de la casa sale de un registro que, por su propia
> descripción, solo manda durante el backtracking. La casa lo aplica siempre.**

Se parte la muestra por la señal `backtracking` del propio fichero de campo:

**BT ACTIVO — 285 instantes · mando crudo 0,5401°**

| banda | página | núcleo |
|---|---|---|
| 0,000° | 0,5401° | 0,5401° |
| 0,250° | 0,4549° | 0,5566° |
| 0,500° | 0,3493° | 0,5575° |
| **0,750°** | **0,3489°** | 0,7381° |
| 1,000° | 0,4964° | 0,9633° |
| 1,296° | 0,7454° | 0,8490° |

**BT INACTIVO — 1.928 instantes · mando crudo 0,4783°**

| banda | página | núcleo |
|---|---|---|
| 0,000° | 0,4783° | 0,4783° |
| **0,100°** | **0,4714°** | 0,4950° |
| 0,500° | 0,5896° | 0,5188° |
| 1,000° | 0,9687° | 0,6332° |
| 1,296° | 1,2052° | 0,7789° |

### La explicación, en una frase

**Con backtracking activo el lazo de la página SÍ gana al mando crudo** —
0,3489° contra 0,5401°, un **35 % mejor**— con una banda de **0,75°**, cerca del
canónico. **Sin backtracking la mejor banda es 0,1°**, o sea prácticamente
ninguna.

La cifra agregada de la fase 3 —0,9215° contra 0,4867° del mando— era la media
de **dos regímenes que no se parecen**: uno donde el modelo ayuda (BT, **285
instantes, el 12,9 %**) y otro donde estorba mucho (no-BT, **1.928 instantes, el
87,1 %**), porque se le está poniendo una banda que ahí no toca.

> **La consigna cruda no ganaba por falta de física: ganaba porque a 7 de cada 8
> muestras se les aplicaba una banda muerta que la máquina no aplica ahí.**

---

## C.3 · Lo que queda después de C.2

**No todo.** Con la banda ajustada por régimen, el residuo del mejor modelo es
**0,3489°** (BT) y **0,4714°** (no-BT). No es cero, y lo que queda ya **no es
banda muerta ni sincronía**.

Lo que el encargo apuntaba —el encoder mide el **accionamiento** y la mesa va
con la deflexión torsional del tubo, que depende del viento del instante—
**no se puede separar con estos datos**, y se declara así:

**RESIDUO NO MODELABLE CON LOS DATOS DISPONIBLES.**

Motivos, cada uno comprobable:

* el fichero trae `wind_speed` **por HSU**, no por tracker, y la deflexión
  depende del viento **en cada mesa**;
* no hay ninguna medida de la mesa: el `angle` publicado **es** el del
  accionamiento (fase 5, mismo límite);
* la cuantización del propio dato es de **0,1°** —comprobado: de los 430 valores
  distintos de `angle` del fichero, **cero** tienen el segundo decimal distinto
  de 0, y la menor separación no nula entre valores es exactamente 0,1°—, o sea
  que el residuo de 0,35-0,47° es solo **3,5-4,7 cuantos**, y a esa escala una
  parte podría ser el propio redondeo.

Y un intento fallido que conviene dejar escrito, porque parecía una
confirmación: el registro **41080 «Pulse resolution»** trae **4** por defecto, y
4 pulsos ÷ 34,727 = **0,1152°**, sospechosamente cerca de la cuantización
observada. **No cuadra.** Si el ángulo publicado estuviera cuantizado por
pulsos, los escalones serían múltiplos de 0,0288° y saldrían irregulares al
mirarlos en grados; son exactamente 0,1°, o sea que **la TCU redondea a una
décima para publicar** y la resolución de pulso queda invisible en este dato.
Así que esto **no corrobora** los 34,7 pulsos/grado: es un redondeo decimal, y
confundirlo con una coincidencia física habría sido inventar una segunda fuente
donde solo hay una.

**Qué haría falta**: **inclinómetro en la mesa** (no en el tubo) en una muestra
de trackers, con viento registrado en el mismo punto y a la misma resolución.

---

## DOS COSAS MÁS QUE EL BARRIDO DEL MAPA DESTAPÓ

**1 · `41060` y `41062` existen y están SIN DESCRIPCIÓN** en el volcado, con los
mismos valores por defecto que sus vecinos (45 y 90 pulsos). O son la otra mitad
de un par de 32 bits, o son las bandas fuera del backtracking y **la descripción
se perdió en la extracción**. No se decide aquí: se reporta, porque si son lo
segundo, ahí está el dato que C.2b necesita.

**2 · `41067 Motor speed at no load = 200 mdeg/sec`**, o sea **0,200 °/s**,
frente al canónico de la casa **0,17 °/s** (`backtracking.html:3299`). Puede ser
legítimo —«at no load» no es «con carga»—, pero **es otra constante del mapa que
la casa usa con otro valor sin decir de dónde sale el suyo**. Queda anotado.

---

## LO QUE C DEJA

**Refutado**: la sincronía (C.1). El mínimo cae en desfase 0 para los tres
modelos.

**Explicado y medido**: la banda muerta canónica se aplica **siempre** y el
registro del que sale dice **«when backtracking is active»**. Partiendo por esa
señal, el lazo de la página **gana al mando crudo por un 35 %** en el régimen
que le corresponde.

**Declarado**: el residuo de 0,35-0,47° no es modelable con estos datos, y hace
falta inclinómetro en mesa.

**Abierto, y es decisión del titular**: si la casa debe distinguir dos bandas
—una en BT y otra fuera—, y con qué valores. Aquí solo se mide que **la máquina
las distingue y el modelo no**.
