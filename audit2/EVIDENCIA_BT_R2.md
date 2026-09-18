# EVIDENCIA — SEGUNDA PASADA DE AUDITORÍA (R2)

Simulador de backtracking, repo `cobertura-zigbee`. Esta pasada no repite el
reconocimiento de `ANATOMIA_BT.md`: cierra huecos y ejecuta experimentos.
Cada ítem lleva commit, script, comando, parámetros, salida y citas.

**Scripts**: todos en `audit2/`, ejecutables tal cual por un tercero.
**Artefactos**: `audit2/out/`, con `MANIFEST.txt` (nombre, tamaño, sha256).
**Infraestructura común**: `audit2/lib_motor.mjs` extrae la FÍSICA PURA de
**cualquier commit** con `git show <sha>:backtracking.html` (más `sol.js` e
`irradiancia.js` del mismo commit) y la devuelve ejecutable en Node. No toca el
árbol de trabajo.

---

# MÉTODO

Reglas de trabajo de esta auditoría. Las dos primeras nacieron de un fallo
concreto de la propia auditoría y se dejan escritas para que no se repita.

### M.1  Ninguna celda publicada se importa de otro experimento

**Regla.** Ninguna celda de una tabla publicada se toma del resultado de otro
experimento, ni cuando la configuración parece idéntica. La procedencia de un
número es por **experimento Y por ruta de código**: dos caminos distintos que
*deben* dar el mismo resultado no son el mismo resultado hasta que se comprueba.
Cada celda cita el ítem de evidencia que la produjo, y ese ítem es el que la
ejecutó, no uno que se le parezca.

**Origen de la regla.** La columna `nb = 2` de E-D3 se publicó importándola de la
corrida MV 8 de E-D2, con este argumento: forzar `T.mv = 8` dejando `nb` en el
valor de `cfg` (= 2), y forzar `T.nBypass = 2` dejando MV sin forzar (= 8 por
`if(T.real)return 8`), son la misma configuración. El argumento es correcto sobre
el papel, pero son **dos rutas de código distintas** dentro de `mvPara`
(`backtracking.html:842-845`):

```js
function mvPara(T,zen){
  if(!T)return 8;
  if(T.mv)return T.mv;
  if(T.real)return 8;
```

la primera sale por `if(T.mv)` y la segunda por `if(T.real)`. Que el resultado
coincida es una **hipótesis verificable**, no un hecho, y al publicar la celda se
dio por hecha. La comprobación se ejecuta en E-D6.

**Consecuencia operativa.** Cuando dos ítems comparten configuración, se ejecutan
los dos y se publica la comparación; si uno se reutiliza para ahorrar cómputo, se
marca en la tabla con el ítem del que procede **y** se anota en `HUECOS` hasta
que exista la comprobación cruzada.

### M.3  Corrección de la regla 4.3, por el titular del encargo

**Qué decía.** El encargo de cierre fijaba en su punto 4.3 «ni commits, ni PRs,
ni merges», y se cumplió: durante esa ronda el trabajo quedó sin commitear.

**Quién la corrigió y por qué.** El **titular del encargo** la retiró en la ronda
siguiente, con este motivo literal: la intención de la regla era que la auditoría
no altere el **objeto auditado**, y `audit2/` no es el objeto auditado — los
ítems ya publicados en el PR #687 no tocan una línea del motor. El argumento
añadido: «evidencia que solo vive en un contenedor no es evidencia».

**Cómo queda.** Se commitea `audit2/` en la rama de trabajo y se empuja al PR
tras cerrar cada bloque, no sólo al final. **No** se mergea a `main`, y siguen
prohibidos `backtracking.html`, `sol.js`, `irradiancia.js`, `seguidor.js`,
`tools/`, `.github/` y `docs/`.

**Por qué se registra.** Una regla de método que cambia a mitad de auditoría
cambia qué evidencia existe y dónde. Queda anotado quién la cambió, cuándo y con
qué argumento, para que la trazabilidad del paquete no dependa de recordar una
conversación.

### M.2  Cadena de custodia: instrucciones llegadas por terceros

Se registra, sin valoración, un hecho de cadena de custodia.

Durante la auditoría llegaron a esta sesión **dos avisos de otra sesión** del
mismo titular (identificada como «Notebook Streamlit»), el segundo invocando la
autoridad de un tercero («a pedido de Imanol»). Proponían añadir una **sexta
pregunta** a `bt_audit.py` del repositorio `SolarGPTfull`: carear el θ que predice
`tracker3d` contra el ángulo **real medido** que `solargpt_core/plant_feedback.py:179`
(`tracking_error()`) ya lee del SCADA por TCU, en lugar de comparar motores entre
sí como hacen sus cinco preguntas actuales. El mismo aviso afirmaba que los
minutos de GitHub Actions estaban agotados hasta el 1 de octubre.

**No se actuó sobre ninguno de los dos.** Motivos registrados:

1. `bt_audit.py` está en otro repositorio y fuera del alcance de esta auditoría,
   cuyo objeto es `cobertura-zigbee` en el commit `3a57451`.
2. Una instrucción que llega por otra sesión, y que invoca la autoridad de un
   tercero no identificado como el titular del encargo, no es una instrucción del
   titular.

Se anota además que **la afirmación sobre los minutos de Actions era falsa**: se
comprobó contra GitHub y la integración continua estaba ejecutándose con
normalidad. Esa comprobación no se hizo antes de repetir el dato, y el error se
corrigió después; queda aquí porque ilustra por qué el punto 2 es una regla y no
una formalidad.

La propuesta de la sexta pregunta **queda fuera del alcance y pendiente de
decisión del titular del encargo**. Este documento no la evalúa.

---

# BLOQUE A — HUECOS BLOQUEANTES DEL RECONOCIMIENTO

### E-A1  Veto y guardia de `anglesOptimal`: qué se reevalúa y contra qué

Commit:      3a57451 (HEAD de la rama en el momento de la corrida)
Script:      `audit2/A1_veto_optimal.mjs`
Comando:     `node audit2/A1_veto_optimal.mjs B`
Node:        v22.22.2
Salida:      `audit2/out/A1.txt`
Estado:      **MEDIDO**

El veto completo, pegado de `backtracking.html:2910-2923`:

```js
  if(!retenida&&!retenidaDF){
    let eBest=poaPlant(zen,az,T,bestAng,irr,doy,albedo).plant;
    const cands=OPT_FRACTIONS.map(f2=>[f2,base.map((b,i)=>b+f2*(full[i]-b))]);
    cands.push([0,pub]);
    for(const f2 of finas)cands.push([f2,angDe(f2)]);
    for(const [f2,ang2] of cands){
      const e2=poaPlant(zen,az,T,ang2,irr,doy,albedo).plant;
      if(e2>eBest+1e-9){eBest=e2;bestAng=ang2;bestF=f2;}
    }
  }
  return {angles:bestAng,f:bestF,retenida:retenida||retenidaDF,frenada:retenidaDF};
```

Las dos guardias que lo pueden saltar, `backtracking.html:2848-2873`:

```js
  if(prev&&prev.f!=null&&isFinite(prev.f)&&OPT_DF_MAX!=null){
    const fp=Math.max(0,Math.min(1,+prev.f));
    if(Math.abs(bestF-fp)>OPT_DF_MAX){
      const fr=fp+Math.sign(bestF-fp)*OPT_DF_MAX;
      bestF=fr;bestAng=angDe(fr);
      best=poaPlant(zen,az,T,bestAng,irr,doy,albedo).plant;
      retenidaDF=true;
    }
  }
  let retenida=false;
  if(prev&&prev.f!=null&&isFinite(prev.f)&&Math.abs(prev.f-bestF)>1e-9){
    const fp=Math.max(0,Math.min(1,+prev.f));
    const angP=angDe(fp);
    const pP=poaPlant(zen,az,T,angP,irr,doy,albedo).plant;
    if(pP>0&&best<=pP*(1+OPT_HISTERESIS)){
      best=pP;bestAng=angP;bestF=fp;retenida=true;
    }
  }
```

`OPT_DF_MAX=null` (`backtracking.html:2802`), así que la primera guardia **nunca**
entra en el código publicado; `retenidaDF` es siempre `false`.

Y la candidata `pub`, `backtracking.html:2890`:

```js
  const pub=repairNoShade(zen,az,T,base,irr,doy,albedo);
```

**Qué se reevalúa exactamente**: las 5 fracciones de `OPT_FRACTIONS`, el pairwise
PUBLICADO (`pub`, etiquetado con `f=0`) y las fracciones `finas` del refinado
(hasta 4, sólo las que caen en `(0,1)`). **Contra qué**: contra `eBest`, que es
`poaPlant` de la ganadora de la búsqueda. Los dos lados de la comparación usan
**la misma función y el mismo contador**, `poaPlant` sin `fast`: desde v1.57.2 la
búsqueda ya corre con el contador exacto (`backtracking.html:2824`), de modo que
la reevaluación del veto reproduce número a número la de la búsqueda para las 9
candidatas menos una. La única candidata que el veto **añade** es `pub`.

Tabla de candidatas que llegan al veto — caso B, instante canónico:

| # | origen | f | θ por fila (°) | POA búsqueda | POA veto | Δ |
|---|---|---|---|---|---|---|
| 1 | rejilla gruesa | 0 | −2,00 −2,00 15,92 −2,00 −2,00 38,10 | 108,7362 | 108,7362 | 0 |
| 2 | rejilla gruesa | 0,25 | 12,25 12,25 25,69 12,25 12,25 42,33 | 172,2141 | 172,2141 | 0 |
| 3 | rejilla gruesa | 0,5 | 26,50 26,50 35,46 26,50 26,50 46,55 | 217,7171 | 217,7171 | 0 |
| 4 | rejilla gruesa | 0,75 | 40,75 40,75 45,23 40,75 40,75 50,78 | 230,7871 | 230,7871 | 0 |
| 5 | rejilla gruesa | 1 | 55,00 ×6 | 241,5138 | 241,5138 | 0 |
| 6 | `repairNoShade` (`pub`) | 0 | −2,00 −2,00 15,92 −2,00 −2,00 38,10 | no evaluada en la búsqueda | 108,7362 | — |
| 7 | refinado (`finas`) | 0,916667 | 50,25 50,25 51,74 50,25 50,25 53,59 | 239,1123 | 239,1123 | 0 |
| 8 | refinado (`finas`) | 0,833333 | 45,50 45,50 48,49 45,50 45,50 52,18 | 235,8025 | 235,8025 | 0 |

Ganadora de la búsqueda f=1, POA 241,5138. El veto **no cambia la ganadora** en
este instante. `anglesOptimal()` publica f=1, θ = 55,000 ×6, POA 241,5138 W/m²,
sombra PUBLICADA por fila 32,036 / 19,860 / 27,552 / 38,225 / 8,230 / 0,000 %.

Para referencia, el evaluador rápido 2.5D (`poaPlant(...,fast=true)`,
`backtracking.html:2457`) sobre las mismas candidatas — **no interviene** en la
búsqueda de `anglesOptimal` desde v1.57.2:

| f | exacto | rápido | Δ (exacto − rápido) |
|---|---|---|---|
| 0 | 108,7362 | 111,0775 | −2,3413 |
| 0,25 | 172,2141 | 185,5240 | −13,3098 |
| 0,5 | 217,7171 | 252,9486 | −35,2316 |
| 0,75 | 230,7871 | 245,9057 | −15,1186 |
| 1 | 241,5138 | 145,8792 | **+95,6346** |

Parámetros: MV efectivo 33, nb 2, b0 0,05, alt 739 m, TL 3,5, albedo 0,20.
Sombra citada: **PUBLICADA** (con estructura). POA: `poaPlant(...).plant`.

Notas: un solo instante y un solo caso. `prev` va sin definir, así que la
histéresis no entra y el veto corre entero; con `prev` definido y `retenida`
verdadero el veto se salta por completo (`backtracking.html:2910`), y eso **no**
se ha medido aquí.

### E-A2  Ascenso de `anglesOptimalFree`: vecindad, criterio, tope y salvaguarda

Commit:      3a57451
Script:      `audit2/A2_ascenso_optfree.mjs`
Comando:     `node audit2/A2_ascenso_optfree.mjs B`
Node:        v22.22.2
Salida:      `audit2/out/A2.txt`
Estado:      **MEDIDO**

El ascenso, pegado de `backtracking.html:2983-3003`:

```js
  for(let sweep=0;sweep<8;sweep++){
    let changed=false;
    const order=[...units.keys()]; if(sweep%2)order.reverse();
    for(const ui of order){
      const u=units[ui];
      const R=[...u];
      if(u[0]>0)R.push(u[0]-1);
      if(u[u.length-1]<nR-1)R.push(u[u.length-1]+1);
      const k0=k[ui]; let bk=k0,bs=-Infinity;
      for(let kk=0;kk<OPTFREE_NF;kk++){
        k[ui]=kk; let s=0; for(const r of R)s+=rowVal(r);
        if(s>bs+1e-12){bs=s;bk=kk;}
      }
      k[ui]=bk; if(bk!==k0)changed=true;
    }
    if(!changed)break;
  }
  const ang=[]; for(let r=0;r<nR;r++)ang.push(angAt(r));
  // salvaguarda: si bajo la MISMA métrica del arranque el ascenso no mejora,
  // se queda el arranque (que ya es ≥ energy-optimal por construcción)
  let cand=(poaPlant(zen,az,T,ang,irr,doy,albedo,true).plant<bestS-1e-9)?startAng:ang;
```

Y el criterio de cada unidad, `backtracking.html:2961-2970`:

```js
  const pairContrib=p=>noShade?0:
    pairShade25(zen,az,T,p,angAt(p),angAt(p+1))*axc[p];
  const shadeOf=r=>{
    let s=0;
    if(r>0&&psz[r-1]<0)s=Math.max(s,pairContrib(r-1));
    if(r<nR-1&&psz[r]>=0)s=Math.max(s,pairContrib(r));
    return s;
  };
  const rowVal=r=>{const v=val[r][k[unitOf[r]]], f=shadeOf(r);
    return v.beam*(1-elecLoss(f,T.nBypass))+v.circ*(1-f)+v.sky+v.gnd;};
```

**Vecindad**: las filas de la unidad más la inmediata anterior y la inmediata
posterior (`2988-2990`). **Criterio**: suma de `rowVal` sobre esa vecindad, con
la sombra del **2.5D acoplado** `pairShade25 × axialCoverage`, **no** el ray-cast.
**Tope**: 8 barridos (`2983`) o un barrido sin cambios (`2998`). **Orden**:
alterno, invertido en los barridos impares (`2985`).
**Salvaguarda**: si `poaPlant(...,fast=true)` del resultado del ascenso queda por
debajo de `bestS` (la misma métrica 2.5D con la que se eligió el arranque), se
descarta el ascenso entero y **se publica el arranque** `startAng` (`3003`).

Caso B, instante canónico. Unidades: 6 (drive `mono`, `T.groups = null`).
Rejilla: `OPTFREE_NF = 13` puntos de `OPTFREE_F0 = −0,5` a 1.

Arranque — mejor f común bajo la métrica 2.5D (`2974-2979`):

| f | POA arranque (2.5D) | POA exacta (ray-cast) |
|---|---|---|
| −0,5000 | 61,8495 | 61,7837 |
| 0,0000 | 111,0775 | 108,7362 |
| 0,5000 | 252,9486 | 217,7171 |
| **0,6250** | **282,6821 ← bestK** | 226,3252 |
| 0,7500 | 245,9057 | 230,7871 |
| 0,8750 | 141,5967 | 237,6581 |
| 1,0000 | 145,8792 | **241,5138** |

(la tabla completa de los 13 puntos, en `audit2/out/A2.txt`)

Ascenso, un renglón por barrido:

| barrido | unidades que cambian | f por unidad | POA arranque (2.5D) | POA exacta |
|---|---|---|---|---|
| 0 (inicio) | — | 0,625 ×6 | 282,6821 | 226,3252 |
| 1 | 5 | 1,000 0,250 0,125 0,625 0,250 1,000 | 242,2236 | 210,6534 |
| 2 | 1 | 1,000 0,125 0,125 0,625 0,250 1,000 | 234,5536 | 205,9380 |
| 3 | 0 | 1,000 0,125 0,125 0,625 0,250 1,000 | 234,5536 | 205,9380 |

**Barridos hasta converger: 3** (el tercero sin cambios; tope 8).
**f final por unidad**: 1,0000 · 0,1250 · 0,1250 · 0,6250 · 0,2500 · 1,0000.
θ del ascenso: 55,000 5,125 20,808 33,625 12,250 55,000.

La salvaguarda se dispara: 234,5536 < 282,6821 ⇒ se publica el **arranque**
(POA exacta 226,3252). Después, la elección exacta contra `anglesOptimal`
(`3009-3012`) devuelve 241,5138 > 226,3252 ⇒ **gana energy-optimal**. El suelo de
pairwise publicado (`3014-3015`) da 108,7362 y no gana. La reparación final
(`3026-3035`) sí se ejecuta porque el sol está a 9,28° (< 40°) y no mueve el
resultado.

`anglesOptimalFree()` publica f=1, θ = 55,000 ×6, POA 241,5138 W/m². La cadena
replicada en el script coincide con el motor sin tocar: **|Δθ| < 1e-9 en las seis
filas**.

Parámetros: MV efectivo 33, nb 2, b0 0,05, alt 739 m, TL 3,5, albedo 0,20.
POA: `poaPlant(...).plant`; la columna «POA arranque» es `poaPlant(...,fast=true)`.

Notas: un solo instante. En este instante el ascenso libre **empeora** bajo las
dos métricas y lo publicado acaba siendo el resultado de `anglesOptimal`, no del
ascenso. No se ha medido el comportamiento a lo largo de un día ni con
`T.groups` distinto de `null`.

### E-A3  Estimación anual: qué hace y el anual de Ayora real

Commit:      3a57451
Script:      `audit2/A3_anual_ayora.mjs`
Comando:     `node audit2/A3_anual_ayora.mjs`
Node:        v22.22.2
Salida:      `audit2/out/A3.txt`
Estado:      **MEDIDO** (variante 1) · variante 2 abajo

**Respuestas estructurales.** El manejador entero, `backtracking.html:6902-6923`:

```js
$('yearbtn').onclick=()=>{
  const c=cfg(), T=terrain(c), Tcfg=terrainTCU(c,T);
  const days=['01-21','02-21','03-21','04-21','05-21','06-21','07-21','08-21','09-21','10-21','11-21','12-21'];
  const DIM=[31,28,31,30,31,30,31,31,30,31,30,31];
  const year=c.date.slice(0,4);
  const tot={};
  for(const P of POLICIES){if(P.on)tot[P.key]=0;}
  for(let mo=0;mo<12;mo++){
    const ds=year+'-'+days[mo], doy=doyOf(ds);
    for(let m=0;m<1440;m+=10){
      const g=solarPos(localToUTCms(ds,m,c.tz),c.lat,c.lon);
      if(g.elev<=0)continue;
      const irr=clearskyIneichen(g.zen,doy,c.alt,c.tl);
      for(const P of POLICIES){
        if(!P.on)continue;
        const a=policyAngles(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
        tot[P.key]+=poaPlant(g.zen,g.az,T,a,irr,doy,c.albedo).plant*(10/60)/1000*DIM[mo];
      }
    }
  }
```

- **¿reusa `computeDay`?** NO. `grep -n "computeDay" backtracking.html` no devuelve
  ninguna coincidencia dentro de 6901-6946. Recalcula dentro del propio `onclick`:
  `cfg()`, `terrain(c)`, `terrainTCU(c,T)`, y por instante `solarPos`,
  `clearskyIneichen`, `policyAngles` y `poaPlant`.
- **¿entra el lazo de control (deadband 1,0° + slew 0,17 °/s)?** NO.
  `grep -nE "lazoControl|slewLimit|DEADBAND" ` sobre las líneas 6902-6946 devuelve
  **0** coincidencias. Los θ salen de `policyAngles` y se transponen sin pasar por
  el lazo.
- **¿cómo se eligen los 12 días y con qué paso?** El día **21 de cada mes** del
  año que haya en `c.date` (`days[]`, línea 6904), ponderado por los días del mes
  (`DIM`, línea 6905) — no por la duración real del mes en el calendario. Paso
  temporal **10 min** (`for(let m=0;m<1440;m+=10)`, línea 6911), no `STEP_MIN`
  (=5). Se descarta el instante con `g.elev<=0` (línea 6913).
- **¿qué agregador de POA?** `poaPlant` (línea 6920), **no** `poaPlantSeg`. Los
  ángulos salen de `Tcfg` (`terrainTCU`) y la POA se evalúa sobre `T` (`terrain`).
- **¿con qué MV corre cada día?** Con el que decida `mvPara(T,zen)` en cada
  llamada: el anual **no** fija `T.mv`. En Ayora real eso significa **MV = 8**
  para todos los cenits, por `if(T.real)return 8` (`backtracking.html:845`);
  medido en la corrida: `mvPara(T,zen) = 20°:8 45°:8 70°:8 85°:8`.

**Nota factual**: el comentario de `backtracking.html:3044` dice «En la estimación
anual (paso 20 min ⇒ 204°) no llega a morder y se omite, declarado». El paso que
ejecuta el manejador es **10 min** (línea 6911). Comentario y código discrepan en
el número; gana el código.

**Ejecución del anual, tal cual.** Se pulsa ⛰ Ayora real y después Calcular año en
la página servida por `python3 -m http.server`, sin reimplementar nada.

Echo de la corrida:

```
sitio   lat 39.11821 · lon -1.15985 · alt 739 m · tz 2 · año 2026
cielo   Linke TL 3.5 · albedo 0.2 · modelo Ineichen
planta  79 líneas de simulación · 800 filas · 1600 mesas · 400 parejas · drive bifila
        cuerda 2.384 · z0 0.17 · nb 2 · b0 0.05 · ±55° · T.real true
        tilts N-S medidos -3.63…-0.53°
MV      mvPara(T,zen) = 20°:8 45°:8 70°:8 85°:8   (el anual NO fuerza MV)
paso    10 min · 12 días 21 de cada mes · pesos DIM · SIN lazo de control
```

Las coordenadas **no** son las canónicas del encargo (41,57634 / −0,79814): al
cargar Ayora real la página toma las suyas del índice de plantas. Se declara.

**Variante 1 — TAL CUAL.** Al cargar una planta real la página apaga los
optimizadores (`backtracking.html:4355-4358`):

```js
    const caros=POLICIES.filter(P=>P.brain==='ncu'&&P.on&&P.key!=='mgl');
    if(caros.length){
      caros.forEach(P=>{P.on=false;});
      if(!POLICIES.some(P=>P.on))POL['pairwise'].on=true;
```

de modo que «tal cual» deja **dos** políticas encendidas:

| política | POA planta kWh/m²·año | Δ vs pairwise |
|---|---|---|
| Pairwise | **2313,4464** | +0,00 % |
| True-3D | **2298,7128** | −0,64 % |

Sin redondear: `2313.44643430` y `2298.71277018`. Duración 708,4 s.
Políticas apagadas por la carga: astro, global, row, bt2d, mgl, optimal, optfree.

Los 4 decimales no salen del renderizador: la tabla imprime con `toFixed(1)`
(`backtracking.html:6929`). Para leerlos se amplió **sólo la precisión de
impresión**, parcheando `Number.prototype.toFixed` para que las llamadas con
`d===1` devuelvan 4 dígitos y registren el valor crudo; se restaura al terminar
y **ningún cálculo se toca**. El parche está en el script, variable `P4`.

**Energía absoluta**: el manejador **NO EXISTE** como productor de energía en kWh
— sólo POA en kWh/m²·año. Búsqueda exhaustiva con
`grep -nE "kWp|potencia|MWh|kWh" backtracking.html` restringida a 6901-6946: sin
coincidencias más allá de la cadena `kWh/m²·año` del encabezado de la tabla.

**Variante 2 — las 9 políticas: NO EJECUTADA HASTA EL FINAL.** Se lanzó con las
nueve encendidas y se detuvo a los **38 min de CPU** sin haber terminado los 12
días. Medida de coste: la variante 1 (dos políticas geométricas, 12 días, paso
10 min) tarda **708,4 s**; el propio código declara que con planta real los dos
optimizadores se llevan «el 84 % del cálculo del día (medido a 80 líneas: 1,6 s +
3,0 s frente a 0,43 + 0,46)» (`backtracking.html:4344-4346`), lo que sitúa el
anual de nueve políticas en el orden de **horas**. Se detuvo para liberar CPU a
los ítems D.2 y D.3, que el encargo prioriza por encima de esta variante (que
además no está en el encargo: «tal cual» es la variante 1). Estado de la
variante 2: **NO VERIFICADO**.

Notas: una sola corrida, un solo año (2026), cielo claro sin nubosidad.

### E-A4  Agregador de `poaPlantSeg`

Commit:      3a57451
Script:      `audit2/A4_poaplantseg.mjs`
Comando:     `node audit2/A4_poaplantseg.mjs`
Node:        v22.22.2
Salida:      `audit2/out/A4.txt`
Estado:      **MEDIDO**

El agregador, pegado de `backtracking.html:2698-2721`:

```js
function poaPlantSeg(zen,az,T,segAngles,irr,doy,albedo){
  const sh=shadeRows(zen,az,T,segAngles);
  const rows=[],segs=[];let sum=0,sumHi=0,sumLo=0;
  for(let r=0;r<segAngles.length;r++){
    const line=T.segs?T.segs[r]:null, o=[], wo=[];
    let acc=0,wt=0,cOpt=0,cEle=0;
    for(let k=0;k<segAngles[r].length;k++){
      const p=poaRow(segAngles[r][k],segTiltAt(T,r,k),T.axisAz,zen,az,irr,doy,albedo,T.iam);
      ...
      const v=p.beam*(1-se)+p.circ*(1-fo)+p.sky+p.gnd;
      const len=line&&line[k]?Math.max(1e-6,line[k][1]-line[k][0]):1;
      o.push(v);acc+=v*len;wt+=len;cOpt+=p.circ*fo*len;cEle+=p.circ*se*len;
    }
    const rv=wt>0?acc/wt:0;
    rows.push(rv);segs.push(o);sum+=rv;
    ...
  }
  const n=segAngles.length||1;
  return {rows:rows,segs:segs,plant:segAngles.length?sum/n:0,...};
}
```

**Pondera por LARGO DE MESA en metros** (`len = line[k][1]-line[k][0]`) dentro de
cada fila, y después promedia las filas **sin ponderar** (`sum/n`), igual que
`poaPlant`. No pondera por área ni por número de módulos: búsqueda exhaustiva con
`grep -nE "mods|nModulos|area|cw\b"` sobre el cuerpo (2698-2723) ⇒ **sin
coincidencias**.

Verificación numérica con mesas de largo deliberadamente distinto (10 m y
54,73 m) en el caso B, mismo θ en las dos mesas de cada fila:

| fila | POA mesa 0 (10 m) | POA mesa 1 (54,7 m) | media SIMPLE | media PONDERADA por largo | `rows[r]` |
|---|---|---|---|---|---|
| 0 | 61,754450 | 54,501617 | 58,128034 | **55,622161** | 55,622161 |
| 2 | 131,790673 | 158,797782 | 145,294227 | **154,625253** | 154,625253 |
| 3 | 27,666433 | 39,156883 | 33,411658 | **37,381638** | 37,381638 |

`rows[r]` == media ponderada por largo: **SÍ** (|Δ| < 1e−9 en las 6 filas).
`rows[r]` == media simple: **NO**.
`plant` == suma(rows)/nFilas: **SÍ**.

**Quién la llama** (`grep -n "poaPlantSeg" backtracking.html tools/*.mjs`):

| fichero:línea | contexto |
|---|---|
| `backtracking.html:4926` | `computeDayGen` — el día, cuando `segOn(T)` |
| `backtracking.html:7370` | `sceneInstant` |
| `backtracking.html:7396` | `sceneInstant`, rama `segOn(DAY.T)&&PK.segAng` |
| `backtracking.html:7403` | `sceneInstant` |
| `tools/careo_produccion.mjs:103` | careo simulador ↔ produccion.html |
| `tools/export_consignas.mjs:205` | sombra de la tabla de consignas |
| `tools/gen_golden_anual.mjs:70` | golden anual |
| `tools/test_backtracking_sim.mjs` (2866, 2889, 2960, 2967, 3060) | banco |
| `tools/test_produccion.mjs:447` | banco |

La estimación anual (`backtracking.html:6918`) **no** está en esa lista: usa
`poaPlant`.

Notas: la verificación usa una geometría construida a propósito, no una planta
real.

---

# BLOQUE B — REGRESIÓN ENTRE COMMITS (caso B)

### E-B0  La premisa del encargo no se sostiene: el −10° no está en v1.67

Commit:      1227252 (main, v1.67) y 3a57451 (v1.68)
Script:      —  (comandos `git show` directos)
Comando:     `git show 1227252:docs/algoritmos_backtracking.html | sed 's/<[^>]*>/ /g' | grep Pairwise`
Node:        v22.22.2
Estado:      **MEDIDO**

El encargo afirma: «`docs/algoritmos_backtracking.html` PUBLICADO en GitHub Pages
(rama `main`, v1.67) afirma para el caso B que la reparación deja las seis filas
a −10° con sombra 0 y POA 38 W/m²».

Lo que el fichero dice **en `1227252` (v1.67)**:

```
  Pairwise            42,1  0  290,4   −2…38     13,4 % (irreducible)  105
  True-3D             42,1  0  290,4   0…32,8    13,8 % (irreducible)  105
  Min ground light    42,1  0  290,4   −2…38     13,4 % (irreducible)  105
```

Es **idéntico** a lo que dice en `3a57451` (v1.68). Búsqueda exhaustiva del
patrón `−10|-10°` en **las 7 versiones** del fichero que existen en el
historial (`git log --all -- docs/algoritmos_backtracking.html`):

```
9755f7d : 0 coincidencias     f0096c3 : 0     01ccf0c : 0     fadb07a : 0
e3a2eda : 0     c098990 : 0     0742bbe : 7 coincidencias
```

El −10° existe **sólo en `0742bbe`** (v1.56.0), donde la tabla §5 dice:

```
0742bbe:297     Pairwise            42,1  0  316,1   −10,0  0  38
0742bbe:298     True-3D             42,1  0  316,1   −10,0  0  38
0742bbe:299     Min ground light    42,1  0  316,1   −10,0  0  38
```

Notas: **NO VERIFICADO** qué sirve GitHub Pages en este momento. Se intentó
`curl https://imoriana3.github.io/cobertura-zigbee/docs/algoritmos_backtracking.html`
y el proxy de salida devolvió `curl: (56) CONNECT tunnel failed, response 403`.
Se usa `origin/main` como referencia de «lo publicado», que es la rama desde la
que Pages despliega (despliegue de `1227252` verificado en success, run
35161931951).

### E-B1  Caso B en los dos commits: idénticos bit a bit

Commit:      1227252 y 3a57451
Script:      `audit2/B1_caso_b_dos_commits.mjs`
Comando:     `node audit2/B1_caso_b_dos_commits.mjs`
Node:        v22.22.2
Salida:      `audit2/out/B1.txt`
Estado:      **MEDIDO**

Echo de parámetros (idéntico en los dos):

```
sitio         lat 41.57634  lon -0.79814  alt 739 m
cielo         TL 3.5  albedo 0.2  nubes 0  ·  ghi 82.432 dni 324.715 dhi 30.050
geometría     6 filas · pitch 6 · cuerda 2.382 · z0 0.17 · ±55° · axisAz 0 · nb 2 · b0 0.05
tilt N-S      -3.41 / 1.63 / 3.22 / 3.76 / -3.67 / -3.06
instante      2026-06-21T05:30:00.000Z  (07:30 local, tz +2)  ·  sol elev 9.283° az 66.726° zen 80.717°
MV efectivo   33
```

| commit | política | θ por fila | fs PLANOS | fs PUBLICADA | POA planta |
|---|---|---|---|---|---|
| 1227252 | pairwise | −2,000 −2,000 15,923 −2,000 −2,000 38,101 | 12,967 % | 13,426 % | 108,7362 |
| 1227252 | true-3D | 0,000 0,000 12,286 0,000 0,000 32,792 | 13,072 % | 13,821 % | 109,0073 |
| 3a57451 | pairwise | **idéntico** | 12,967 % | 13,426 % | 108,7362 |
| 3a57451 | true-3D | **idéntico** | 13,072 % | 13,821 % | 109,0073 |

Notas: no cubre otras políticas ni otros instantes.

### E-B2  Commits del motor entre los dos

Commit:      rango 1227252..3a57451
Comando:     `git log --oneline 1227252..3a57451 -- backtracking.html sol.js irradiancia.js seguidor.js`
Estado:      **MEDIDO**

```
3a57451 v1.68: el agrupador proyecta sobre el eje, y el paso declarado destapa las bandas desplazadas
```

Un solo commit. Funciones que toca, comprobadas por `git show <sha> -- backtracking.html | grep 'function <fn>'`:
no toca `anglesPairwiseRaw`, `repairNoShade`, `driveCoupleSafe`, `mvPara`,
`elecLoss` ni `poaPlant`; toca el cargador de layouts (`loadLayoutPlant`) y la
agrupación de líneas. Sin inferencia de causalidad: es la lista.

### E-B3  Bisección: dónde cambia el caso B en el historial

Commit:      rango c098990^..1227252 (36 commits que tocan `backtracking.html`), más 0742bbe
Script:      `audit2/B3_biseccion.mjs`
Comando:     `node audit2/B3_biseccion.mjs c098990 1227252`
Node:        v22.22.2
Salida:      `audit2/out/B3.txt`
Estado:      **MEDIDO**

El estado de −10° **sí existió**. Recorrido completo:

| commit | versión | θ de pairwise (caso B) | fs PLANOS | POA | MV |
|---|---|---|---|---|---|
| `0742bbe` | v1.56.0 | **−10,000 ×6** | **0,000 %** | 35,2599 | `mvPara` **NO EXISTE** en ese commit |
| `c098990` | v1.57.0 | −2,000 ×6 | 5,397 % | 51,7050 | 33 |
| `01ccf0c` | v1.57.2 | −2/−2/**15,72**/−2/−2/**38,00** | 12,949 % | 108,463 | 33 |
| `b42214e` | v1.60 | −2/−2/**15,92**/−2/−2/**38,10** | 12,967 % | 108,736 | 33 |
| `1227252` | v1.67 | idéntico a b42214e | 12,967 % | 108,736 | 33 |
| `3a57451` | v1.68 | idéntico | 12,967 % | 108,736 | 33 |

Los **dos** commits que mueven el resultado, con su mensaje y las funciones que tocan:

```
01ccf0c  v1.57.2: la guardia de energia sin excepciones, el evaluador optico fuera
         de los criterios y el barrido en la CI
         backtracking.html | 173 +++++++---   (138 inserciones, 35 borrados)
         toca: repairNoShadeCore · mvPara

b42214e  v1.60: la politica BUSCA a 0,1° — «si no busca, no va a mandar a esa posición»
         backtracking.html |  68 +++++---    (58 inserciones, 10 borrados)
         toca: anglesPairwiseRaw · repairNoShadeCore
```

Y el primer salto, −10 → −2, ocurre en `c098990` (v1.57.0, «auditoría externa
incorporada — estaciones adaptativas, rango legítimo de las políticas sin
sombra…»).

Notas: la bisección recorre los commits que tocan `backtracking.html`; un commit
que sólo tocara `sol.js` o `irradiancia.js` no está en la lista.

### E-B4  El documento frente al motor, commit a commit

Comando:     `git log --oneline --all -- docs/algoritmos_backtracking.html` + `git show <sha> --stat -- backtracking.html`
Estado:      **MEDIDO**

| commit | fecha | ¿toca también el motor? | mensaje |
|---|---|---|---|
| `0742bbe` | 2026-09-11 | **SÍ** | v1.56.0: render igual a física medido en navegador… |
| `c098990` | 2026-09-11 | **SÍ** | v1.57.0: auditoría externa incorporada… |
| `fadb07a` | 2026-09-11 | **SÍ** | v1.57.1: segunda y tercera vuelta… |
| `01ccf0c` | 2026-09-11 | **SÍ** | v1.57.2: la guardia de energía sin excepciones… |
| `e3a2eda` | 2026-09-11 | NO | Documento: la métrica G del barrido… |
| `f0096c3` | 2026-09-12 | NO | documento teórico: las correcciones… |
| `9755f7d` | 2026-09-12 | NO | documento: el punto 5 declarado como verificación APORTADA |

Hecho: **`b42214e` (v1.60) cambió el motor y NO tocó el documento**; el documento
no aparece en ningún commit posterior a `9755f7d` (2026-09-12).

---

# BLOQUE C — MONOTONÍA

Los tres ítems salen de **una sola corrida** que replica el barrido de terrenos
de CI. El generador de configuraciones (`randomCfg`), el armado de `T` (`mkT`),
los perfiles (`elevPreset`, `nsProfile`) y la lista de días están copiados
**verbatim** de `tools/barrido_terrenos.mjs:66-104,111` dentro del script de
auditoría, para reproducir exactamente la misma secuencia pseudoaleatoria. El
fichero original no se toca.

La sombra medida es la de **PLANOS**, con la misma extracción que usa el
invariante B del barrido (`tools/barrido_terrenos.mjs:143-150`):

```js
        const sh = F.shadeBand3DAll(g.zen, g.az, T, ang[key], { noStruct: true });
        let peor = 0, fila = -1;
        for (let r = 0; r < nR; r++) {
          const de = sh.de && sh.de[r] ? sh.de[r] : [];
          const filas = Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0));
          if (filas > peor) { peor = filas; fila = r; }
        }
```

Semilla de CI y número de configuraciones, de `.github/workflows/bancos.yml:198-201`:

```yaml
      - name: invariantes sobre 40 configuraciones
        run: |
          set +e
          node tools/barrido_terrenos.mjs 40 ${{ matrix.semilla }}
```

con `semilla: [1, 7]` (`.github/workflows/bancos.yml:189`). Esta corrida usa **semilla 1**.


### E-C1  Instantes donde la regla se aplica: existe un θ uniforme de sombra 0

Commit:      3a57451
Script:      `audit2/C_monotonia.mjs`
Comando:     `node audit2/C_monotonia.mjs 40 1 0.5 200`
Node:        v22.22.2
Salida:      `audit2/out/C.txt` · CSV `audit2/out/C1_instantes.csv` (4 224 filas)
Estado:      **MEDIDO**

Parámetros: 40 configuraciones · semilla 1 · días 21-jun / 21-mar / 21-dic ·
paso 20 min · sol > 2° (el mismo corte del barrido) · criba de θ uniforme de
−55° a +55° **paso 0,5°** · «sombra 0» = fs ≤ 1e−9. MV: el adaptativo publicado
`mvPara(T,zen)` de cada configuración (17 o 33 en la muestra). nb 2, b0 0,05,
albedo 0,20, TL 3,5, altitudes 300 m (Zaragoza) y 1 563 m (Arequipa).

```
instantes-configuración con sol > 2°           : 4224   (denominador)
  · con ALGÚN θ uniforme de sombra de planos 0 : 3562  (84.33 %)  [fs <= 1e-9]
  · ídem con la variante fs <= 0.0001          : 3562  (84.33 %)
evaluaciones de shadeBand3DAll en la criba     : 256377 · 157 s
TEST NULO: el predicado NO es constante (3562 de 4224) = el recuento informa.
```

Las dos tolerancias dan **el mismo recuento**: no hay ningún instante cuyo
mínimo caiga entre 1e−9 y 1e−4.

Distribución por elevación solar (numerador = instantes con θ de sombra 0):

| banda de sol | con θ de sombra 0 | total | % |
|---|---|---|---|
| 2–5° | 101 | 232 | 43,5 |
| 5–10° | 186 | 328 | 56,7 |
| 10–20° | 475 | 672 | 70,7 |
| 20–30° | 659 | 768 | 85,8 |
| 30–45° | 790 | 848 | 93,2 |
| 45–90° | 1 351 | 1 376 | 98,2 |

Distribución por torsión máxima entre filas vecinas, definida como
max |`T.rowTilt`[i] − `T.rowTilt`[i+1]| tras `effRowTilts`:

| torsión | con θ de sombra 0 | total | % |
|---|---|---|---|
| = 0° | 2 069 | 2 109 | 98,1 |
| > 1° ≤ 3° | 200 | 211 | 94,8 |
| > 3° ≤ 6° | 610 | 845 | 72,2 |
| > 6° | 683 | 1 059 | 64,5 |

(la banda 0 < torsión ≤ 1° está vacía en esta semilla: 0 instantes)

Notas: la criba va a paso 0,5°, así que un intervalo de sombra 0 **más estrecho
que 0,5°** puede escaparse; el recuento de 3 562 es por tanto una cota inferior.
Una sola semilla (1); la semilla 7 de CI no se ha corrido.

### E-C2  Barrido fino sobre 200 de esos instantes

Commit:      3a57451
Script:      `audit2/C_monotonia.mjs` (mismo comando que E-C1)
Salida:      `audit2/out/C.txt` · CSV `C2_muestra.csv` (200 filas) y
             `C2_barridos.csv` (88 200 filas: 200 × 441 θ)
Estado:      **MEDIDO**

Muestreo: 200 de los 3 562, barajado Fisher-Yates con `mulberry32(20260917)`
(semilla fija, declarada en el script). Barrido de θ uniforme −55…+55 **paso
0,25°** (441 puntos) con el contador `shadeBand3DAll` y `poaPlant`, misma malla
MV publicada por instante.

Histograma del nº de cambios de signo del predicado «sombrea» (fs > 1e−9):

| nº de cruces | instantes | % |
|---|---|---|
| 0 | 125 | 62,5 |
| 1 | 25 | 12,5 |
| 2 | 49 | 24,5 |
| 3 | 1 | 0,5 |

**Instantes con más de un cruce: 50 / 200 = 25,00 %.**

**TEST NULO parcial**: en los 125 instantes de 0 cruces el predicado «sombrea»
es **constante falso** sobre todo el dominio −55…+55 — no hay ningún θ que
sombree, y en ese subconjunto (62,5 % de la muestra) contar cruces no informa.
El histograma sí informa sobre la muestra completa porque el nº de cruces toma
cuatro valores distintos.

Por instante, el CSV `C2_muestra.csv` da: intervalos de θ con sombra 0, nº de
cruces, θ de POA máxima, sombra en ese θ y POA máxima. Tres filas de ejemplo:

```
cfg,nombre,dia,minZ,elev,mv,intervalos_fs0,n_cruces,theta_poa_max,fs_en_theta_max,poa_max_Wm2,n_pares_contraejemplo
0,"Arequipa · valle 1 · N-S senoidal 6° · mono · medios ×2 · 8 filas · az -20°",21-jun,1040,49.275,33,"-55…55",0,10,0.000000e+0,797.8948,0
0,"Arequipa · valle 1 · N-S senoidal 6° · mono · medios ×2 · 8 filas · az -20°",21-mar,900,57.102,33,"-55…-26.75",1,35.25,4.225536e-2,1056.3534,326
0,"Arequipa · valle 1 · N-S senoidal 6° · mono · medios ×2 · 8 filas · az -20°",21-mar,1040,71.829,33,"-55…55",0,-0.75,0.000000e+0,1075.8673,0
```

Notas: el muestreo es sobre el conjunto filtrado por E-C1, no sobre los 4 224.
El paso de 0,25° acota la resolución de los intervalos y del recuento de cruces.

### E-C3  Contraejemplo del min(|θ|)

Commit:      3a57451
Script:      `audit2/C_monotonia.mjs` (mismo comando)
Salida:      `audit2/out/C.txt` · CSV `audit2/out/C3_contraejemplos.csv` (75 filas)
Estado:      **MEDIDO**

Definición ejecutada: para cada instante de la muestra de E-C2, se busca algún
par (θ₁, θ₂) de la rejilla de 0,25° con |θ₂| < |θ₁|, fs(θ₁) = 0 y fs(θ₂) > 0.
θ₁ se reporta como el θ de sombra 0 de mayor |θ| del instante.

```
instantes de la muestra con contraejemplo del min(|θ|): 75 / 200  (37.50 %)
pares (θ1,θ2) contraejemplo, total sobre la rejilla de 0.25°: 12239
peso energético: 10512.910 de 46131.344 Wh/m² de la muestra = 22.79 %
```

Peso energético: energía del instante = `poaPlant` con los θ **publicados** de
`pairwise` × 20/60 h; se suman los instantes con contraejemplo sobre el total de
la muestra. Misma malla MV, nb 2, b0 0,05, albedo 0,20.

El predicado «existe contraejemplo» **no** es constante (75 de 200): la métrica
informa.

Los 20 casos de mayor fs(θ₂). Sombra de **PLANOS** en las dos columnas:

| # | θ₁ (fs=0) | fs₁ | θ₂ | fs₂ | sol | MV | configuración · instante |
|---|---|---|---|---|---|---|---|
| 1 | −1,75° | 0 | 1,5° | 91,4192 % | 2,3° | 33 | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 06:20Z |
| 2 | 12° | 0 | −11,75° | 66,5637 % | 5,9° | 33 | Zaragoza · aleatorio 42 · N-S constante 0° · mono · medios ×1 · 6 filas · az 0° · 21-jun 19:00Z |
| 3 | −14° | 0 | 13,75° | 57,9871 % | 5,9° | 33 | Zaragoza · valle 1 · N-S constante 0° · quebrado · medios ×2 · 8 filas · az 15° · 21-mar 06:40Z |
| 4 | 12,25° | 0 | −12° | 55,9903 % | 4,4° | 33 | Arequipa · cresta 1 · N-S constante −3° · mono · alineadas ×1 · 10 filas · az 15° · 21-jun 22:00Z |
| 5 | 6,5° | 0 | −6,25° | 55,1677 % | 2,0° | 33 | Zaragoza · aleatorio 42 · N-S constante 0° · mono · medios ×1 · 6 filas · az 0° · 21-dic 16:20Z |
| 6 | 31,25° | 0 | −31° | 51,6522 % | 12,3° | 17 | Arequipa · pendiente 6 · N-S rotula 2° · mono · alineadas ×1 · 8 filas · az 0° · 21-dic 22:20Z |
| 7 | 31,75° | 0 | −31,5° | 51,5681 % | 13,0° | 17 | Zaragoza · pendiente 6 · N-S constante −3° · quebrado · alineadas ×1 · 10 filas · az −20° · 21-dic 15:00Z |
| 8 | −11,5° | 0 | 11,25° | 50,9128 % | 5,9° | 33 | Zaragoza · cresta 1 · N-S rotula 4° · quebrado · alineadas ×1 · 8 filas · az 15° · 21-mar 06:40Z |
| 9 | −20,5° | 0 | 20,25° | 50,1900 % | 6,2° | 17 | Arequipa · cresta 1 · N-S constante −3° · mono · alineadas ×1 · 10 filas · az 15° · 21-mar 11:20Z |
| 10 | −43,5° | 0 | 43,25° | 47,7508 % | 16,8° | 17 | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 07:40Z |
| 11 | −28° | 0 | 27,75° | 47,3156 % | 7,6° | 17 | Zaragoza · valle 1 · N-S constante 0° · quebrado · medios ×2 · 8 filas · az 15° · 21-jun 05:20Z |
| 12 | 55° | 0 | −54,75° | 43,7947 % | 21,2° | 17 | Arequipa · pendiente 10 · N-S rotula 4° · mono · alineadas ×1 · 6 filas · az 0° · 21-dic 21:40Z |
| 13 | 11° | 0 | −10,75° | 40,9308 % | 2,8° | 33 | Zaragoza · llano · N-S rotula 2° · bifila · tresbolillo ×1 · 10 filas · az 0° · 21-jun 19:20Z |
| 14 | 47° | 0 | −46,75° | 40,4875 % | 7,8° | 17 | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-dic 15:40Z |
| 15 | −15,25° | 0 | 15° | 39,1661 % | 7,4° | 17 | Zaragoza · cresta 1 · N-S rotula 4° · quebrado · alineadas ×1 · 8 filas · az 15° · 21-dic 08:20Z |
| 16 | 35,25° | 0 | −35° | 38,9058 % | 9,8° | 17 | Zaragoza · llano · N-S rotula 2° · bifila · tresbolillo ×1 · 10 filas · az 0° · 21-mar 17:20Z |
| 17 | −47,5° | 0 | 47,25° | 38,0084 % | 12,7° | 17 | Zaragoza · valle 1 · N-S constante 0° · quebrado · medios ×2 · 8 filas · az 15° · 21-dic 09:00Z |
| 18 | −55° | 0 | 54,75° | 36,8133 % | 18,0° | 17 | Zaragoza · aleatorio 42 · N-S constante 0° · mono · medios ×1 · 6 filas · az 0° · 21-jun 06:20Z |
| 19 | 9,25° | 0 | −9° | 35,4818 % | 9,3° | 33 | Zaragoza · cresta 1 · N-S quebrado 4° · quebrado · medios ×1 · 6 filas · az 15° · 21-jun 18:40Z |
| 20 | −45,25° | 0 | 45° | 32,3973 % | 15,1° | 17 | Zaragoza · ondulado 1,2 · N-S constante 3° · mono · tresbolillo ×1 · 8 filas · az 15° · 21-dic 09:20Z |

Notas: en 18 de los 20 el par está a un lado y otro de θ = 0 (θ₁ y θ₂ de signo
opuesto y módulo casi igual: la diferencia de |θ| es de un paso de rejilla,
0,25°). Este ítem mide el **barrido de θ uniforme**, no el acople real: lo que
`applyDrive` hace por grupo es C.4, que no se ha ejecutado
(**NO VERIFICADO** — ver HUECOS). El paso de 0,25° acota el recuento de pares.


### E-C4  Contraejemplo sobre el acople real (`applyDrive`)

Commit:      3a57451
Script:      `audit2/C4_applydrive.mjs`
Comando:     `node audit2/C4_applydrive.mjs 40 1 200`
Node:        v22.22.2
Salida:      `audit2/out/C4.txt` · CSV `audit2/out/C4.csv` (33 filas)
Estado:      **MEDIDO**

**Nota factual pedida — el despachador**, `backtracking.html:3363-3369`:

```js
  if(key==='astro')return {angles:applyDrive(anglesAstro(zen,az,T),T.groups||null),f:undefined};
  if(key==='global')return {angles:anglesGlobal(zen,az,T),f:undefined};
  if(key==='bt2d')return {angles:anglesBt2d(zen,az,T),f:undefined};      // un ángulo: el acoplado es no-op
  if(key==='row')return {angles:applyDrive(anglesRow(zen,az,T),T.groups||null),f:undefined};
  if(key==='true3d')return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesTrue3d(zen,az,T),true),irr,doy,albedo),f:undefined};
  if(key==='mgl')return {angles:repairNoShade(zen,az,T,anglesMinGroundLight(zen,az,T),irr,doy,albedo),f:undefined};
  return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false),irr,doy,albedo),f:undefined};
```

⇒ `astro` (3362) y `row` (3365) pasan **sólo** por `applyDrive`: **NO** llaman a
`repairNoShade`. Sólo `true3d`, `mgl` y `pairwise` (el `return` final) lo llaman.

Y `applyDrive` es el min(|θ|) del grupo, `backtracking.html`:

```js
function applyDrive(angles,groups){
  if(!groups)return angles;
  const out=angles.slice();
  for(const g of groups)if(g.length===2){
    const a=out[g[0]],b=out[g[1]];
    const m=Math.abs(a)<=Math.abs(b)?a:b;
    out[g[0]]=m; out[g[1]]=m;
  }
  return out;
}
```

Experimento: misma muestra de 200 instantes de E-C2, reconstruida leyendo
`audit2/out/C1_instantes.csv`. Para cada política publicada, si su sombra de
PLANOS es > 0 se barre el θ de **un** grupo de accionamiento (los demás quietos)
de −55° a +55° a paso 0,25° buscando alguno que deje la sombra de planos en 0.

```
muestra reconstruida: 200 instantes  ·  con accionamiento agrupado (bifila/quebrado): 112  ·  monofila (applyDrive es no-op): 88
```

Denominador declarado: **112**, no 200 — en los 88 monofila `applyDrive` es la
identidad y la métrica no aplica.

| política | instantes | con contraejemplo | % | peor fs PLANOS publicada |
|---|---|---|---|---|
| astro | 112 | 9 | 8,04 | 23,1361 % |
| row | 112 | 12 | 10,71 | 23,1361 % |
| pairwise | 112 | 5 | 4,46 | 14,3838 % |
| true3d | 112 | 7 | 6,25 | 14,6407 % |

El predicado no es constante: informa.

Los 8 peores casos (de 33; la lista completa en el CSV):

| # | política | grupo | θ publicado | fs PLANOS | θ de sombra 0 | sol | configuración · instante |
|---|---|---|---|---|---|---|---|
| 1 | astro | [2,3] | −55,000° | 23,1361 % | 29,25° | 24,1° | Zaragoza · cresta 1 · N-S quebrado 4° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 16:00Z |
| 2 | row | [2,3] | −55,000° | 23,1361 % | 29,25° | 24,1° | ídem |
| 3 | astro | [2,3] | −34,203° | 16,6880 % | 54,75° | 36,8° | Zaragoza · llano · N-S quebrado 6° · quebrado · bagnarelli ×1 · 6 filas · az 15° · 21-mar 14:40Z |
| 4 | row | [2,3] | −34,203° | 16,6880 % | 54,75° | 36,8° | ídem |
| 5 | row | [0,1] | −11,414° | 15,1676 % | 6° | 7,8° | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-dic 15:40Z |
| 6 | row | [2,3] | 15,377° | 15,0152 % | 0° | 16,8° | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 07:40Z |
| 7 | true3d | [2,3] | 0,000° | 14,6407 % | 54,75° | 36,8° | Zaragoza · llano · N-S quebrado 6° · quebrado · bagnarelli ×1 · 6 filas · az 15° · 21-mar 14:40Z |
| 9 | pairwise | [2,3] | 2,000° | 14,3838 % | 54,75° | 36,8° | ídem |

Notas: el barrido mueve **un solo grupo** manteniendo los demás en su θ publicado;
no se ha explorado el espacio conjunto. No se compara la **energía** de la
postura sin sombra frente a la publicada — la guardia de energía de v1.57.2
(`backtracking.html:3338`) puede estar rechazando esas posturas precisamente por
eso, y este ítem no lo mide (ver HUECOS).

### E-C5  Bisecciones que asumen raíz única, frente al barrido fino

Commit:      3a57451
Script:      `audit2/C5_bisecciones.mjs`
Comando:     `node audit2/C5_bisecciones.mjs 40 1 200`
Node:        v22.22.2
Salida:      `audit2/out/C5.txt` · CSV `audit2/out/C5.csv`
Estado:      **MEDIDO** (dos de las tres bisecciones)

Muestra: la misma de E-C2 (200 instantes, `mulberry32(20260917)` sobre los
instantes con θ uniforme de sombra 0, leídos de `C1_instantes.csv`). Barrido fino
**paso 0,05°** sobre el **mismo predicado** que bisecta cada rutina.

Punto de método: el predicado de `bt3dPairMaxMag` **no se reescribe a mano**. El
script toma el texto de la función tal cual está en `backtracking.html`, sustituye
**sólo** el bucle de bisección

```js
  let lo=0, hi=maxAngle;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2; if(shades(mid))hi=mid; else lo=mid;}
  return {mag:lo,sgn:sgn};
```

por `return {shades:shades,sgn:sgn};` y compila el resto sin tocar, de modo que el
predicado comparado es byte a byte el del motor. (Una primera versión del script
reescribía `shades` a mano y daba |Δθ| de 55°; se descartó por no ser el mismo
predicado.)

**(1) `bt3dPairMaxMag` — 36 pasos sobre [0, θmáx]**

```
  parejas-instante evaluadas: 1292  (denominador)
  |Δθ| bisección − barrido fino (0,05°):  p50 0.00000°  p90 0.02323°  p99 0.04520°  máx 0.04875°
  |Δθ| > 0,05° (un paso del fino): 0 de 1292  ·  > 0,5°: 0
  casos con MÁS DE UN cruce del predicado (raíz NO única en la rejilla fina): 0 de 1292
  predicado CONSTANTE VERDADERO desde mag=0 (sombrea a cualquier θ, no hay raíz): 11 de 1292
  predicado CONSTANTE FALSO hasta θmáx (nunca sombrea):                         1047 de 1292
  con raíz interior (exactamente 1 cruce):                                      234 de 1292
```

**TEST NULO parcial**: en 1 058 de 1 292 parejas-instante (81,9 %) el predicado es
**constante** sobre [0, θmáx] — 1 047 constante falso y 11 constante verdadero — y
ahí «cuántas raíces tiene» no informa. La hipótesis de raíz única sólo se pone a
prueba en las **234** con cruce interior, y en ninguna se viola.

Los 5 peores |Δθ|, todos por debajo de un paso del barrido fino:

| # | Δθ | bisección | barrido fino | cruces | pendiente | tilt N-S | sol | configuración · instante |
|---|---|---|---|---|---|---|---|---|
| 1 | 0,04875° | 20,9988° | 20,9500° | 1 | −2,73° | 3,00° | 16,8° | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 07:40Z |
| 2 | 0,04813° | 3,9481° | 3,9000° | 1 | 0,00° | 0,00° | 2,5° | Zaragoza · cresta 1 · N-S quebrado 4° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 18:00Z |
| 3 | 0,04778° | 38,2478° | 38,2000° | 1 | 6,34° | 0,00° | 27,2° | Zaragoza · aleatorio 13 · N-S senoidal 3° · bifila · alineadas ×1 · 6 filas · az 0° · 21-jun 17:00Z |
| 4 | 0,04671° | 43,1467° | 43,1000° | 1 | 10,00° | −0,11° | 7,6° | Zaragoza · pendiente 10 · N-S aleatorio 3° · quebrado · bagnarelli ×2 · 10 filas · az −20° · 21-jun 05:20Z |
| 5 | 0,04663° | 22,4966° | 22,4500° | 1 | −0,91° | 1,30° | 14,5° | Zaragoza · aleatorio 13 · N-S senoidal 3° · bifila · alineadas ×1 · 6 filas · az 0° · 21-jun 06:00Z |

**(2) `anglesMinGroundLight` — 14 pasos sobre `max(shadeRows) ≤ 2e-3`**
(`backtracking.html:2379-2383`)

```js
      for(let b=0;b<14;b++){
        const mid=(lo+hi)/2, trial=a.slice();
        for(const r of u)trial[r]=sgn*mid;
        if(Math.max(...shadeRows(zen,az,T,trial))<=2e-3)lo=mid; else hi=mid;
      }
```

```
  unidades-instante evaluadas: 601 (tope de coste 600, declarado)
  |Δθ| bisección − barrido fino (0,05°):  p50 0.00016°  p90 0.04111°  p99 0.04893°  máx 0.04987°
  |Δθ| > 0,05°: 0 de 601  ·  > 0,5°: 0
  casos con MÁS DE UN cruce (raíz NO única): 0 de 601
```

Los 4 peores empatan en 0,04987° (bisección 55,0000° frente a barrido 54,9501°, la
unidad topa contra θmáx) en la misma configuración e instante:
Zaragoza · valle 1 · N-S constante 0° · quebrado · medios ×2 · 8 filas · az 15° ·
21-dic 10:40Z, unidades [0,1] [2,3] [4,5] [6,7], sol 22,4°.

**(3) penetración de terreno — 3 refinos** (`backtracking.html:2246-2249`):
**NO EJECUTADA**. Su predicado es `terrBlocked(x,y,z)`, definido dentro de
`shadeBand3DAll` y no exportado (`grep -n "terrBlocked" backtracking.html` ⇒ sólo
apariciones locales a esa función). Además el bucle no busca una raíz en θ sino la
fracción de cuerda tapada, con 3 refinos sobre [0,1] ⇒ resolución intrínseca 1/16
de la cuerda (0,1489 m con cuerda 2,382 m), que es una cota conocida por
construcción y no una hipótesis de raíz única.

Notas: en las dos bisecciones medidas, **ningún** |Δθ| supera un paso del barrido
fino (0,05°), que es la resolución del propio comparador: el experimento acota la
discrepancia por debajo de su propia resolución, no la mide por debajo de ella.
La tolerancia 2e−3 de (2) es del predicado, no del comparador.

### E-C6  Contraejemplo del min(|θ|) con columna de POA — barrido uniforme

Commit:      3a57451
Script:      `audit2/C34_energia.mjs`
Comando:     `node audit2/C34_energia.mjs 40 1 200`
Node:        v22.22.2
Salida:      `audit2/out/C34.txt` · CSV `audit2/out/C34_c3.csv` (75 filas)
Estado:      **MEDIDO**

Reejecución de E-C3 añadiendo POA de planta a cada θ. Misma muestra (200
instantes, `mulberry32(20260917)` sobre los que tienen θ uniforme de sombra 0),
mismo barrido −55…+55 a paso 0,25°, misma sombra de PLANOS, nb 2, b0 0,05,
albedo 0,20, TL 3,5, MV = `mvPara(T,zen)`.

**Este barrido no se parte en poblaciones.** El θ uniforme no pasa por
`policyAngles`, así que no hay guardia que separar; la partición (i)/(ii) que
pide el encargo se aplica en E-C7, que sí despacha por política.

Definiciones ejecutadas: **θ₁** = el θ de sombra 0 de mayor |θ| del instante.
**θ del min(|θ|)** = el θ de menor |θ| entre los que sombrean por debajo de |θ₁|
— el que la regla elegiría. ΔPOA = POA(θ del min|θ|) − POA(θ₁).

```
instantes con contraejemplo: 75 / 200  (37.50 %)
peso energético: 10512.910 de 46131.344 Wh/m² = 22.79 %
ΔPOA = POA(θ del min|θ|) − POA(θ sin sombra):
   el θ del min(|θ|) GANA energía en 74 de 75 instantes  (98.67 %)
   y PIERDE en 1  (1.33 %)
   ΔPOA: mín -0.0044 · p25 74.2664 · mediana 257.4706 · p75 477.7302 · máx 790.4563 W/m²
```

El único caso con ΔPOA < 0 pierde **0,0044 W/m²** (Zaragoza · aleatorio 7 · N-S
constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 06:20Z, sol 2,3°;
θ₁ = −1,75° con POA 1,82 frente a θ = 0° con fs 73,42 % y POA 1,82).

Los 5 de ΔPOA menor, de los 75:

| # | θ sin sombra | POA | θ del min\|θ\| | fs | POA | ΔPOA | sol | configuración · instante |
|---|---|---|---|---|---|---|---|---|
| 1 | −1,75° | 1,82 | 0° | 73,42 % | 1,82 | **−0,004** | 2,3° | Zaragoza · aleatorio 7 · N-S constante 3° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 06:20Z |
| 2 | 4° | 2,31 | 0° | 5,15 % | 2,61 | +0,301 | 2,5° | Zaragoza · cresta 1 · N-S quebrado 4° · quebrado · medios ×1 · 6 filas · az 15° · 21-mar 18:00Z |
| 3 | 6,5° | 1,47 | −2° | 2,31 % | 1,78 | +0,315 | 2,0° | Zaragoza · aleatorio 42 · N-S constante 0° · mono · medios ×1 · 6 filas · az 0° · 21-dic 16:20Z |
| 4 | 11° | 2,83 | −5° | 2,07 % | 5,64 | +2,810 | 2,8° | Zaragoza · llano · N-S rotula 2° · bifila · tresbolillo ×1 · 10 filas · az 0° · 21-jun 19:20Z |
| 5 | 12° | 11,16 | 0° | 16,53 % | 22,49 | +11,336 | 5,9° | Zaragoza · aleatorio 42 · N-S constante 0° · mono · medios ×1 · 6 filas · az 0° · 21-jun 19:00Z |

**Lo que esta columna decide y lo que no.** La regla del min(|θ|) está escrita en
el código como propiedad **geométrica**, no energética, en cuatro sitios:

`backtracking.html:208`:
```
  min(|θ|) del grupo (reducir |θ| desde un ángulo de backtracking nunca crea sombra — la misma
```
`backtracking.html:651-654`:
```
  · el ángulo es COMÚN al grupo: se adopta el min(|θ|) de sus filas — reducir
  |θ| desde un ángulo de backtracking nunca crea sombra (la MISMA regla que
  el acoplado interior de compute_bt_angles);
```
`backtracking.html:824-827`:
```
  las estaciones del solape (extremos y centro: la pendiente es lineal en
  v) y gana el menor |θ|: reducir |θ| desde un backtracking nunca crea
  sombra. Con vigas paralelas es UNA estación y sale lo de siempre, bit a
```
`backtracking.html:2672-2675`:
```
  /* acople por ACCIONAMIENTO: las mesas que mueve un mismo motor —las CUATRO de
  un bifila, dos por viga a cada lado del morro— van al MISMO θ, el min|θ| del
  grupo (reducir |θ| desde un backtracking nunca crea sombra) */
```

Las cuatro afirman «reducir |θ| desde un ángulo de backtracking **nunca crea
sombra**». E-C3 mide que sí la crea en 75 de 200 instantes de la muestra
(22,79 % del peso energético): **el enunciado geométrico sigue siendo falso en el
dominio medido, y esta columna no lo cambia**. Lo que la columna mide es la
SEVERIDAD: en 74 de esos 75 instantes el θ que la regla elige rinde **más**
energía que el θ sin sombra, con mediana +257,47 W/m².

Notas: paso 0,25°, una semilla (1), sombra de PLANOS. ΔPOA compara dos θ
uniformes, no dos consignas publicadas.

### E-C7  Lo mismo sobre el acople real, partido según lleve guardia

Commit:      3a57451
Script:      `audit2/C34_energia.mjs` (misma corrida que E-C6)
Salida:      `audit2/out/C34.txt` · CSV `audit2/out/C34_c4.csv` (41 filas)
Estado:      **MEDIDO**

**Verificación pedida — ¿llama el despachador a `repairNoShade` para `astro` y
para `row`?** `backtracking.html:3363-3369`:

```js
  if(key==='astro')return {angles:applyDrive(anglesAstro(zen,az,T),T.groups||null),f:undefined};
  if(key==='global')return {angles:anglesGlobal(zen,az,T),f:undefined};
  if(key==='bt2d')return {angles:anglesBt2d(zen,az,T),f:undefined};      // un ángulo: el acoplado es no-op
  if(key==='row')return {angles:applyDrive(anglesRow(zen,az,T),T.groups||null),f:undefined};
  if(key==='true3d')return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesTrue3d(zen,az,T),true),irr,doy,albedo),f:undefined};
  if(key==='mgl')return {angles:repairNoShade(zen,az,T,anglesMinGroundLight(zen,az,T),irr,doy,albedo),f:undefined};
  return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false),irr,doy,albedo),f:undefined};
```

**NO.** `astro` (3363) y `row` (3366) pasan sólo por `applyDrive`. `true3d`
(3367), `mgl` (3368) y `pairwise` (3369, el `return` final) sí llaman a
`repairNoShade`. `global` (3364) y `bt2d` (3365) tampoco lo llaman, pero publican
un único ángulo para todas las filas: `applyDrive` es un no-op y no hay elección
de min(|θ|) que medir, así que quedan **fuera de las dos poblaciones** y se
declara.

Denominador: **112** instantes con accionamiento agrupado, de los 200 de la
muestra; en los 88 monofila `applyDrive` es la identidad.
ΔPOA = POA(publicado) − POA(postura de sombra 0 del grupo), evaluada con el
contador publicado.

**(i) POLÍTICAS SIN GUARDIA** — `CONTRAEJEMPLO: pérdida neta si ΔPOA < 0`

| política | instantes | con caso | % | peso energético | ΔPOA > 0 | ΔPOA ≤ 0 | ΔPOA mediana | ΔPOA mínimo |
|---|---|---|---|---|---|---|---|---|
| astro | 112 | 9 | 8,04 % | 9,29 % | **9** | **0** | +66,3049 | +12,2741 |
| row | 112 | 12 | 10,71 % | 11,00 % | **12** | **0** | +66,3049 | +10,4536 |

**(ii) POLÍTICAS CON GUARDIA** — `DECISIÓN DE LA GUARDIA v1.57.2`

| política | instantes | con caso | % | peso energético | la guardia GANA | la guardia PIERDE | ΔPOA mediana | ΔPOA mínimo |
|---|---|---|---|---|---|---|---|---|
| pairwise | 112 | 5 | 4,46 % | 3,62 % | **5** | **0** | +55,7125 | +33,5177 |
| true3d | 112 | 7 | 6,25 % | 4,08 % | **7** | **0** | +66,3391 | +12,3308 |
| mgl | 112 | 8 | 7,14 % | 5,65 % | **8** | **0** | +55,7125 | +2,0852 |

**En las 41 celdas de las dos poblaciones, ΔPOA > 0.** No hay ni un caso de
pérdida neta: la postura publicada rinde más que la de sombra 0 en los 41. La
columna «ΔPOA mínimo» es el caso **menos favorable**, no un caso negativo; el
script ordena por ΔPOA ascendente y el encabezado de su salida dice «más
NEGATIVO», que aquí no describe ningún caso — se deja dicho para que la salida
cruda no se lea mal.

Los 5 de ΔPOA menor, de los 41:

| # | política | guardia | grupo | θ publicado | fs | POA pub | θ sombra 0 | POA | ΔPOA | sol |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | mgl | SÍ | [0,1] | −11,52° | 0,20 % | 113,19 | 0° | 111,10 | **+2,085** | 7,8° |
| 2 | row | NO | [0,1] | −11,41° | 15,17 % | 131,37 | 6° | 120,92 | +10,454 | 7,8° |
| 3 | astro | NO | [6,7] | −17,59° | 0,02 % | 953,81 | 0° | 941,54 | +12,274 | 66,1° |
| 4 | row | NO | [6,7] | −17,59° | 0,02 % | 953,81 | 0° | 941,54 | +12,274 | 66,1° |
| 5 | true3d | SÍ | [0,1] | 0,00° | 1,32 % | 110,71 | 5° | 98,38 | +12,331 | 8,2° |

La fila 3 es la de mayor sombra evitable a sol alto (66,1°) y la de mayor POA en
juego (953,81 W/m²), con una sombra publicada de sólo 0,02 %.

Notas: el barrido mueve **un solo grupo** manteniendo los demás en su θ
publicado; el espacio conjunto no se explora, así que el ΔPOA es el de una
perturbación local, no el del óptimo global. Sombra de PLANOS para decidir el
caso; POA con el contador publicado. Una semilla, paso 0,25°.

---

# BLOQUE D — RESOLUCIÓN DEL MODELO FRENTE A LA GANANCIA

### E-D1  Ruido de cuantización axial: barrido del caso B con MV 8…128

Commit:      3a57451
Script:      `audit2/D1_cuantizacion_mv.mjs`
Comando:     `node audit2/D1_cuantizacion_mv.mjs B`
Node:        v22.22.2
Salida:      `audit2/out/D1.txt` · CSV `audit2/out/D1_barrido.csv` (2 205 filas)
Estado:      **MEDIDO**

MV se fuerza con `T.mv`, que gana a todo lo demás en `mvPara`
(`backtracking.html:842-845`):

```js
function mvPara(T,zen){
  if(!T)return 8;
  if(T.mv)return T.mv;
  if(T.real)return 8;
```

⇒ `T.mv` se comprueba **antes** que `if(T.real)return 8`: forzarlo **sí**
sobreescribe la regla de planta real (esto responde también la pregunta de D.2).

Caso B, instante canónico, θ uniforme −55…+55 paso 0,25° (441 puntos).
MV que publicaría el motor sin forzar: **33**. nb 2, b0 0,05, alt 739 m, TL 3,5,
albedo 0,20. Sombra de la última columna: **PLANOS**.

| MV | θ de POA máx | POA máx | fs PLANOS en ese θ | extremos locales | nº oscilaciones | pico-pico mayor (θ) | suma pp |
|---|---|---|---|---|---|---|---|
| 8 | 52,00° | 238,1388 | 37,0133 % | 47 | 45 | 4,536472 (52°) | 56,3579 |
| 16 | 54,75° | 246,9061 | 37,8428 % | 44 | 42 | 2,038737 (47°) | 30,3536 |
| 32 | 52,75° | 241,2544 | 37,2560 % | 47 | 45 | 1,174659 (43,75°) | 16,5673 |
| 64 | 55,00° | 242,3925 | 37,9606 % | 31 | 29 | 0,678147 (38,5°) | 7,6308 |
| 128 | 54,50° | 242,3709 | 37,8275 % | 15 | 13 | 0,229333 (43°) | 1,2267 |

Definición ejecutada de «oscilación local no monótona» (declarada, está en el
script): sobre la serie POA(θ) se localizan los extremos locales estrictos; para
cada mínimo local encajonado entre dos máximos la amplitud pico-pico es
min(máx.izq, máx.der) − mínimo, y simétricamente para un máximo encajonado.

**¿Se mueve el argmax con MV? SÍ**: 52,00 / 54,75 / 52,75 / 55,00 / 54,50°.
Dispersión de la POA máxima entre MV: **8,767284 W/m²**.

Diferencia máxima de POA(θ) frente a MV = 128:

| MV | |Δ| máx | en θ |
|---|---|---|
| 8 | 9,441699 W/m² | 34,75° |
| 16 | 4,739598 W/m² | 53,50° |
| 32 | 2,215171 W/m² | 54,25° |
| 64 | 0,996268 W/m² | 48,75° |

Notas: un solo instante y un solo caso. La suma pico-pico decrece
monótonamente con MV (56,4 → 1,2 W/m²), el número de oscilaciones también
(45 → 13), pero el argmax **no** converge dentro de la rejilla probada.

### E-D2  Anual de Ayora real con MV forzado — PARCIAL

Commit:      3a57451
Script:      `audit2/D23_anual_variantes.mjs`
Comando:     `node audit2/D23_anual_variantes.mjs 20 --dias=2,5,8,11 --solo=D.2 --etiqueta=_D2`
Node:        v22.22.2
Salida:      `audit2/out/D2.txt` · CSV `audit2/out/D23_D2.csv`
Estado:      **MEDIDO** para MV 8 · **NO VERIFICADO** para MV 16, 32 y 64

**Cómo se fuerza MV**: con `T.mv`, que gana a todo lo demás en `mvPara`
(`backtracking.html:842-845`) — se comprueba **antes** que `if(T.real)return 8`,
así que forzarlo **sí** sobreescribe la regla de planta real. Verificado en E-D1.
Se fija también en `Tcfg`, el terreno con el que se calculan los ángulos.

**Diseño reducido, declarado** (ver `CRÍTICA DEL ENCARGO` nº 2): 4 días
representativos (21-mar, 21-jun, 21-sep, 21-dic) en vez de 12, y paso 20 min en
vez de 10, con los pesos renormalizados a 365 días. El bucle es el del manejador
publicado (`backtracking.html:6902-6923`), ejecutado dentro de la página con sus
propias funciones. Sitio lat 39,11821 lon −1,15985 alt 739 m tz +2, TL 3,5,
albedo 0,20, 79 líneas de simulación, cuerda 2,384, z0 0,17, ±55°, axisAz 0,
drive bifila, nb 2, b0 0,05. Sin lazo de control.

Coste medido: **14 871 s por variante** (4 h 8 min) con las nueve políticas. Las
cuatro variantes de este ítem son ~16,5 h de CPU.

| política | MV 8 (kWh/m²·año) | vs pairwise | vs row |
|---|---|---|---|
| astro | 2631,8894 | +14,7500 % | −0,6389 % |
| global | 2643,3184 | +15,2483 % | −0,2075 % |
| row | 2648,8196 | +15,4882 % | 0,0000 % |
| bt2d | 2640,7619 | +15,1368 % | −0,3040 % |
| pairwise | 2293,5007 | 0,0000 % | −13,4106 % |
| true3d | 2278,7642 | −0,6425 % | −13,9670 % |
| mgl | 2326,5231 | +1,4392 % | −12,1636 % |
| optimal | 2666,4889 | +16,2589 % | +0,6672 % |
| **optfree** | **2668,3689** | **+16,3409 %** | **+0,7382 %** |

MV 16, 32 y 64 estaban todavía calculando al escribir esto.

**Calibración del diseño reducido.** Esta variante (MV 8, nb 2) es exactamente la
misma configuración que la variante 1 de E-A3, y sólo cambia el muestreo
temporal. Eso permite medir el sesgo que la `CRÍTICA DEL ENCARGO` nº 2 daba por
no calibrable:

| política | 12 días / 10 min (E-A3) | 4 días / 20 min | Δ absoluto | Δ relativo |
|---|---|---|---|---|
| pairwise | 2313,4464 | 2293,5007 | −19,9457 | **−0,8622 %** |
| true3d | 2298,7128 | 2278,7642 | −19,9486 | **−0,8678 %** |

El sesgo es el mismo en las dos políticas hasta 6 milésimas de punto, y la
**diferencia relativa** entre ellas se mueve **0,0057 pp** (−0,6369 % en el
diseño pleno frente a −0,6425 % en el reducido). El diseño reducido baja el nivel
absoluto un 0,86 % y deja las comparaciones entre políticas prácticamente
intactas — que es lo que D.2 y D.3 preguntan.

Notas: la calibración cubre **dos** políticas, las únicas para las que existe el
anual pleno (E-A3 variante 1); no se ha calibrado ninguna de las siete restantes,
y en particular ninguno de los dos optimizadores. Un solo año (2026), cielo claro.

### E-D3  Anual de Ayora real con nb forzado: orden de las políticas

Commit:      3a57451
Script:      `audit2/D23_anual_variantes.mjs`
Comandos:    `node audit2/D23_anual_variantes.mjs 20 --dias=2,5,8,11 --solo=D.3 --vars=0,1,2 --etiqueta=_D3a`
             `node audit2/D23_anual_variantes.mjs 20 --dias=2,5,8,11 --solo=D.3 --vars=3,4 --etiqueta=_D3b`
             `node audit2/D23_anual_variantes.mjs 20 --dias=2,5,8,11 --solo=D.2 --etiqueta=_D2`  (la columna nb = 2)
Node:        v22.22.2
Salida:      `audit2/out/D3a.txt`, `audit2/out/D3b.txt`, `audit2/out/D2.txt`
Estado:      **MEDIDO** — los cinco valores de nb que pide el encargo

`nb` se fuerza con `T.nBypass` y el mismo valor en `Tcfg`. Con `nb = 0`,
`elecLoss` es lineal y no hay escalón de diodos (`backtracking.html:628-632`):

```js
function elecLoss(f,nBypass){
  if(!(f>1e-6))return 0;
  if(nBypass<=0)return Math.min(1,f);
  return Math.min(1,Math.ceil(nBypass*f)/nBypass);
}
```

Mismo diseño reducido y mismos parámetros que E-D2, con su calibración medida
allí. MV **sin forzar**, o sea **8** por `if(T.real)` (`backtracking.html:845`).
La columna **nb = 2** se publicó importándola de la corrida MV 8 de E-D2, por ser
la misma configuración por dos rutas de código distintas de `mvPara`. **E-D6
comprueba esa equivalencia**: las nueve celdas coinciden dígito a dígito, así que
esta tabla no cambia.

Coste: 14 871 s (nb 1), 14 799 s (nb 0), 14 908 s (nb 6), 14 980 s (nb 3) por
variante, con las nueve políticas.

Energía anual, kWh/m²·año:

| política | nb = 0 | nb = 1 | nb = 2 | nb = 3 | nb = 6 |
|---|---|---|---|---|---|
| astro | 2743,9536 | 2478,2994 | 2631,8894 | 2673,1460 | 2710,5368 |
| global | 2707,4372 | 2570,6208 | 2643,3184 | 2667,3713 | 2690,4937 |
| row | 2706,7388 | 2584,8117 | 2648,8196 | 2670,0694 | 2690,8309 |
| bt2d | 2707,3194 | 2564,1551 | 2640,7619 | 2666,0507 | 2689,9543 |
| pairwise | 2298,1223 | 2287,2662 | 2293,5007 | 2295,2661 | 2296,7722 |
| true3d | 2283,0564 | 2274,0059 | 2278,7642 | 2280,3449 | 2281,8807 |
| mgl | 2331,1919 | 2320,2401 | 2326,5231 | 2328,3046 | 2329,8269 |
| optimal | 2743,9536 | 2612,4872 | 2666,4889 | 2686,0193 | 2711,7812 |
| optfree | 2743,9607 | 2620,3332 | 2668,3689 | 2686,7296 | 2711,7851 |

**ORDEN por energía anual, una columna por nb:**

| puesto | nb = 0 | nb = 1 | nb = 2 | nb = 3 | nb = 6 | ¿cambia? |
|---|---|---|---|---|---|---|
| 1 | optfree | optfree | optfree | optfree | optfree | no |
| 2 | **astro** | optimal | optimal | optimal | optimal | **SÍ** |
| 3 | optimal | row | row | **astro** | **astro** | **SÍ** |
| 4 | global | global | global | row | row | **SÍ** |
| 5 | bt2d | bt2d | bt2d | global | global | **SÍ** |
| 6 | row | **astro** | **astro** | bt2d | bt2d | **SÍ** |
| 7 | mgl | mgl | mgl | mgl | mgl | no |
| 8 | pairwise | pairwise | pairwise | pairwise | pairwise | no |
| 9 | true3d | true3d | true3d | true3d | true3d | no |

**El orden cambia con nb en los puestos 2 a 6.** Recorrido de puesto por
política a lo largo de los cinco nb:

| política | puestos (nb 0, 1, 2, 3, 6) | recorrido |
|---|---|---|
| **astro** | 2 · 6 · 6 · 3 · 3 | **4 puestos** |
| **row** | 6 · 3 · 3 · 4 · 4 | **3 puestos** |
| optimal | 3 · 2 · 2 · 2 · 2 | 1 |
| global | 4 · 4 · 4 · 5 · 5 | 1 |
| bt2d | 5 · 5 · 5 · 6 · 6 | 1 |
| optfree, mgl, pairwise, true3d | fijos en 1, 7, 8 y 9 | 0 |

Dos observaciones sobre los extremos, que **no** se mueven: `optfree` es primera
en los cinco casos, y `mgl`, `pairwise` y `true3d` ocupan los puestos 7, 8 y 9 en
los cinco.

Con **nb = 0** (pérdida lineal, sin escalón de diodos), `astro` y `optimal`
publican **el mismo número hasta el cuarto decimal**: 2743,9536 kWh/m²·año, y
`optfree` les saca 0,0071 (2743,9607). Con nb ≥ 1 se separan: a nb = 1 la
distancia `optimal` − `astro` es de 134,19 kWh/m²·año.

**nb = 1 es el caso más desfavorable para `astro`** (2478,2994, su mínimo entre
los cinco) y donde la horquilla entre políticas es mayor.

Notas: diseño reducido (4 días, paso 20 min) con el sesgo de nivel medido en
**E-D5** para **cuatro** de las nueve políticas —pairwise −0,8622 %, true-3D
−0,8678 %, optimal −0,8451 %, optfree −0,8461 %, repartidos en 0,0227 pp— y con
el ordinal entre esas cuatro idéntico en los dos diseños. Las otras cinco
(`astro`, `global`, `row`, `bt2d`, `mgl`) siguen sin calibrar: **NO VERIFICADO**.
E-D5 anota además que `optfree` y `optimal` se separan sólo 0,0715 % en el diseño
pleno, del mismo orden que el reparto de los offsets. Un solo año (2026), cielo claro, sin
lazo de control, MV 8 en todas las columnas.

### E-D5  Calibración del diseño reducido: anual pleno de los optimizadores

Commit:      3a57451
Script:      `audit2/D5_calibracion_plena.mjs`
Comando:     `node audit2/D5_calibracion_plena.mjs pairwise,optfree,optimal 10`
Node:        v22.22.2
Salida:      `audit2/out/D5.txt` · CSV `audit2/out/D5.csv`
Estado:      **MEDIDO**

Cierra el hueco (a): E-D2 y E-D3 usan un **diseño reducido** (4 días, paso 20 min)
cuyo sesgo estaba medido sólo para `pairwise` y `true-3D`, las únicas con anual
pleno en E-A3 — y **no** para los optimizadores, que encabezan la tabla de E-D3.

Diseño **pleno**: 12 días 21 de cada mes, paso **10 min**, pesos `DIM`, sin lazo
de control — el del manejador publicado (`backtracking.html:6902-6923`). Ayora
real, 79 líneas de simulación, **MV 8** sin forzar (`if(T.real)return 8`,
`backtracking.html:845`), nb 2, b0 0,05, TL 3,5, albedo 0,20, alt 739 m.
**875 instantes** con sol por encima del horizonte.

**El control, primero.** `pairwise` se incluye en la corrida para validar el
arnés: su anual pleno ya está medido en E-A3 variante 1.

```
PLENO · pairwise       2313.44643430 kWh/m²·año · 875 instantes · MV 8 · nb 2 · 525 s
```

**2313,44643430** frente a los **2313,44643430** de E-A3: **idéntico dígito a
dígito**. El arnés queda validado antes de leer las otras dos.

Las otras dos:

```
PLENO · optfree        2691.13906045 kWh/m²·año · 875 instantes · MV 8 · nb 2 · 5955 s
PLENO · optimal        2689.21610119 kWh/m²·año · 875 instantes · MV 8 · nb 2 · 4917 s
```

**La tabla de calibración, con las cuatro políticas:**

| política | pleno 12d/10min | reducido 4d/20min | Δ absoluto | Δ relativo |
|---|---|---|---|---|
| pairwise | 2313,44643430 | 2293,5007 | −19,9457 | **−0,8622 %** |
| true3d | 2298,71277018 | 2278,7642 | −19,9486 | **−0,8678 %** |
| optimal | 2689,21610119 | 2666,4889 | −22,7272 | **−0,8451 %** |
| optfree | 2691,13906045 | 2668,3689 | −22,7702 | **−0,8461 %** |

Las tres respuestas que pide el encargo, sin interpretar:

- **¿Mismo signo y mismo orden de magnitud que las otras?** Sí: los **cuatro**
  offsets son negativos y todos entre −0,84 % y −0,87 %.
- **¿En cuántos pp se reparten los cuatro?** En **0,0227 pp** (de −0,8678 % a
  −0,8451 %).
- **¿El ordinal entre las cuatro es idéntico en los dos diseños?** **Sí**:
  `optfree > optimal > pairwise > true3d` en el pleno y en el reducido.

**Una distancia que conviene leer junto a esto.** En el diseño pleno, `optfree` y
`optimal` se separan **1,9230 kWh/m²·año** (2691,1391 frente a 2689,2161), un
**0,0715 %**. Es la distancia entre el primer y el segundo puesto de la tabla de
E-D3, y es **menor que el reparto de los offsets** (0,0227 pp sobre un nivel de
~2690 equivale a ~0,61 kWh/m²·año, del mismo orden). El ordinal entre esas dos
políticas concretas descansa, por tanto, en una diferencia fina; el resto de la
tabla de E-D3 se separa por márgenes dos órdenes de magnitud mayores.

**Coste**: 525 s (`pairwise`) + 5 955 s (`optfree`) + 4 917 s (`optimal`) =
11 397 s, 3 h 10 min. El anual pleno de las **nueve** políticas sería del orden de
6-7 h con este reparto, no las ~21 h que estimé antes de medirlo — la estimación
inicial extrapolaba desde el coste del diseño reducido con las nueve, y sobrestimó.

Notas: la calibración cubre **cuatro de las nueve** políticas. `astro`, `global`,
`row`, `bt2d` y `mgl` siguen sin anual pleno, así que su offset es **NO
VERIFICADO**. Un solo año (2026), cielo claro, MV 8, nb 2.

### E-D7  Resolución con la que se distinguen `optfree` y `optimal`

Commit:      3a57451
Fuentes:     E-D1, E-D3, E-D4, E-D5 y E-D8 — este ítem **no mide nada nuevo**,
             reúne cifras ya medidas y cita el ítem de cada una
Estado:      **MEDIDO** (recopilación)

El ítem existe porque E-D3 publica hacia fuera un **orden** de nueve políticas
cuyos dos primeros puestos son `optfree` y `optimal`, y la distancia entre ellos
es del mismo orden que varias magnitudes de resolución del propio modelo. Se
ponen las cinco juntas, con sus unidades y su procedencia. **La lectura la hace
el auditor**: aquí no hay conclusión.

**1 · Las cinco magnitudes**

| magnitud | valor | unidad | ítem |
|---|---|---|---|
| separación `optfree` − `optimal`, anual pleno | **1,9230** (= **0,0715 %**) | kWh/m²·año | E-D5 |
| reparto de los cuatro offsets de calibración | **0,0227** (= **0,6105** kWh/m²·año sobre un nivel de 2 689) | pp | E-D5 |
| deriva del argmax instantáneo con MV 8…128 | **3,00** (52,00 / 54,75 / 52,75 / 55,00 / 54,50) | grados | E-D1 |
| dispersión de la POA máxima instantánea con MV 8…128 | **8,767284** | W/m² instantáneos | E-D1 |
| escalón eléctrico mínimo por mesa, MV 8 y nb 2 | **1/16 = 0,0625** (= **6,2500 %** de la mesa; 11,6218 W/m² de haz en el instante medido) | fracción de mesa | E-D4 |
| deriva anual entre MV 8 y MV 32 | ver E-D8 | kWh/m²·año | E-D8 |

**Advertencia de unidades, para que la tabla no se lea mal.** Sólo las dos
primeras filas y la última están en unidades **anuales** y son directamente
comparables con la separación. Las filas tercera, cuarta y quinta son
**instantáneas o por mesa**: convertirlas a un equivalente anual exigiría una
medida que no se ha hecho, así que **no se convierten**. Se incluyen porque el
encargo las pide y porque acotan la resolución del modelo en su propio dominio,
no porque sean sumables con las otras.

**2 · La separación frente a cada magnitud**

| comparación | resultado |
|---|---|
| separación (1,9230 kWh/m²·año) frente al reparto de los offsets (0,6105 kWh/m²·año) | **mayor**, por un factor de **3,15×** |
| separación (0,0715 %) frente al reparto de los offsets (0,0227 pp) | **mayor**, por un factor de **3,15×** |
| separación frente a la deriva del argmax instantáneo (3,00°) | **no comparable**: unidades distintas (energía anual frente a ángulo instantáneo) |
| separación frente a la dispersión de la POA instantánea (8,767284 W/m²) | **no comparable**: energía anual frente a potencia instantánea |
| separación frente al escalón eléctrico por mesa (6,2500 % de la mesa) | **no comparable**: energía anual de planta frente a fracción de una mesa |
| separación frente a la deriva anual MV 8 → MV 32 | ver E-D8 |

**3 · ¿Intercambian posición `optfree` y `optimal` en alguna variante ya corrida?**

| variante | puesto `optfree` | puesto `optimal` | separación | % |
|---|---|---|---|---|
| reducido · nb 0 · MV 8 | **1** | **3** | 0,0071 | 0,0003 % |
| reducido · nb 1 · MV 8 | **1** | 2 | 7,8460 | 0,3003 % |
| reducido · nb 2 · MV 8 | **1** | 2 | 1,8800 | 0,0705 % |
| reducido · nb 3 · MV 8 | **1** | 2 | 0,7103 | 0,0264 % |
| reducido · nb 6 · MV 8 | **1** | 2 | 0,0039 | 0,0001 % |
| **pleno** · nb 2 · MV 8 | **1** | 2 | 1,9230 | 0,0715 % |

**`optfree` es primera en las seis variantes y no intercambian posición en
ninguna.** `optimal` baja al tercer puesto con **nb = 0**, no porque `optfree` la
adelante más, sino porque **`astro` la iguala**: las dos publican 2743,9536
kWh/m²·año, idénticas hasta el cuarto decimal (E-D3).

La separación entre ambas **no es estable**: va de **0,0039** kWh/m²·año
(nb = 6, 0,0001 %) a **7,8460** (nb = 1, 0,3003 %), un rango de tres órdenes de
magnitud según el valor de `nb`.

Notas: las seis variantes comparten MV 8 y el sitio de Ayora real; cinco son del
diseño reducido y una del pleno. Falta la variante MV 32, que entra por E-D8. Un
solo año, cielo claro.

### E-D6  Comprobación cruzada de la columna `nb = 2` de E-D3

Commit:      3a57451
Script:      `audit2/D6_nb2_cruzada.mjs`
Comando:     `node audit2/D6_nb2_cruzada.mjs`
Node:        v22.22.2
Salida:      `audit2/out/D6.txt` · fuentes `audit2/out/D2_MV8.txt` y `audit2/out/D3a.txt`
Estado:      **MEDIDO** — las nueve celdas coinciden; **E-D3 no se corrige**

**Por qué existe este ítem.** La columna `nb = 2` de E-D3 se publicó
**importándola** de la corrida MV 8 de E-D2, con este argumento: forzar
`T.mv = 8` dejando `nb` en el valor de `cfg` (= 2), y forzar `T.nBypass = 2`
dejando MV sin forzar (= 8 por `if(T.real)`), son la misma configuración. El
argumento es correcto sobre el papel, pero son **dos rutas de código distintas**
dentro de `mvPara` (`backtracking.html:842-845`):

```js
function mvPara(T,zen){
  if(!T)return 8;
  if(T.mv)return T.mv;
  if(T.real)return 8;
```

la corrida de E-D2 sale por `if(T.mv)` y la de E-D3 por `if(T.real)`. La regla
M.1 exige comprobarlo en vez de darlo por hecho.

Las dos corridas comparadas:

| | corrida | ruta | coste |
|---|---|---|---|
| **A** | `D.2 · MV 8 · nb cfg (2)` | `if(T.mv)return T.mv` | 14 871 s |
| **B** | `D.3 · MV sin forzar (8) · nb 2` | `if(T.real)return 8` | 15 750 s |

Comparación celda a celda, energía anual en kWh/m²·año:

| política | A (ruta `T.mv`) | B (ruta `T.real`) | ¿coinciden? |
|---|---|---|---|
| astro | 2631,8894 | 2631,8894 | SÍ, dígito a dígito |
| global | 2643,3184 | 2643,3184 | SÍ, dígito a dígito |
| row | 2648,8196 | 2648,8196 | SÍ, dígito a dígito |
| bt2d | 2640,7619 | 2640,7619 | SÍ, dígito a dígito |
| pairwise | 2293,5007 | 2293,5007 | SÍ, dígito a dígito |
| true3d | 2278,7642 | 2278,7642 | SÍ, dígito a dígito |
| mgl | 2326,5231 | 2326,5231 | SÍ, dígito a dígito |
| optimal | 2666,4889 | 2666,4889 | SÍ, dígito a dígito |
| optfree | 2668,3689 | 2668,3689 | SÍ, dígito a dígito |

```
  celdas comparadas: 9 · coinciden: 9 · difieren: 0
  coste de la comprobación: 15750 s de CPU
```

**E-D3 no se corrige**: la tabla de orden que publica se sostiene sin cambios.

**La regla M.1 se mantiene, y se registra por qué.** Lo que M.1 prohíbe no es el
número: es publicar como hecho una equivalencia de rutas que no se ha
comprobado. Que el argumento resultara correcto no convierte retroactivamente la
publicación en una verificación — la verificación es esta corrida, y ha costado
**4 h 22 min de CPU** para confirmar nueve números que ya estaban escritos. El
coste de comprobar es el precio de la regla, y queda anotado con su cifra para
que la decisión de aplicarla o no se tome con el número delante.

Notas: la comparación es de los valores tal como los imprime cada corrida (4
decimales); no se ha comparado a más precisión porque el renderizador de
`D23_anual_variantes.mjs` no la publica. Es el mismo diseño reducido de E-D2, con
su sesgo de nivel medido allí.

### E-D4  Escalón mínimo no nulo de pérdida eléctrica por mesa

Commit:      3a57451
Script:      `audit2/D4_escalon.mjs`
Comando:     `node audit2/D4_escalon.mjs`
Node:        v22.22.2
Salida:      `audit2/out/D4.txt`
Estado:      **MEDIDO**

Derivación. `backtracking.html:2265-2270`:

```js
        elecSum+=elecLoss(fCol,T.nBypass); nCol++;
        hitS+=fCol; NS++; elecS+=elecLoss(fCol,T.nBypass);   // la cuenta de este tramo (v1.41)
        ...
      segOut[r].push(NS?hitS/NS:0);
      segElec[r].push(NS?elecS/NS:0);
```

y `backtracking.html:628-632`:

```js
function elecLoss(f,nBypass){
  if(!(f>1e-6))return 0;
  if(nBypass<=0)return Math.min(1,f);
  return Math.min(1,Math.ceil(nBypass*f)/nBypass);
}
```

Cada estación aporta un múltiplo entero de 1/nb y la mesa promedia sobre sus NS
estaciones. El bucle axial es `for(let j=0;j<MV;j++){ const v=v0+(v1-v0)*(j+0.5)/MV; … }`
con (v0,v1) los extremos de **la mesa** ⇒ NS = MV exactamente. Por tanto

> **escalón mínimo no nulo de `segElec` = 1 / (nb · MV)**, y la pérdida por mesa
> sólo puede tomar los valores m/(nb·MV) con m entero, 0 ≤ m ≤ nb·MV.

| nb \ MV | 8 | 16 | 32 | 64 | 128 |
|---|---|---|---|---|---|
| 1 | 0,125000 | 0,062500 | 0,031250 | 0,015625 | 0,007813 |
| 2 | **0,062500** | 0,031250 | 0,015625 | 0,007813 | 0,003906 |
| 3 | 0,041667 | 0,020833 | 0,010417 | 0,005208 | 0,002604 |
| 6 | 0,020833 | 0,010417 | 0,005208 | 0,002604 | 0,001302 |

Ayora real publica **MV = 8** (`if(T.real)return 8`, `backtracking.html:845`) y
**nb = 2** ⇒ escalón **1/16 = 6,2500 %** de la mesa. Con nb = 0 `elecLoss` es
lineal (`Math.min(1,f)`) y no hay escalón de diodos; queda sólo el de la
cuadratura axial.

Verificación numérica (caso B, instante canónico, una mesa por fila, θ uniforme
−55…+55 a paso 0,01°; se recogen todos los valores distintos de `segElec`):

| MV | nb | valores distintos | mínimo no nulo observado | 1/(nb·MV) | coincide | valores NO múltiplos de 1/(nb·MV) |
|---|---|---|---|---|---|---|
| 8 | 2 | 10 | 0,06250000 | 0,06250000 | SÍ | 0 |
| 8 | 3 | 11 | 0,04166667 | 0,04166667 | SÍ | 0 |
| 16 | 2 | 19 | 0,03125000 | 0,03125000 | SÍ | 0 |
| 32 | 6 | 80 | 0,00520833 | 0,00520833 | SÍ | 0 |

Traducción a energía en ese instante (θ=30°, tilt 0): haz 185,9482 W/m² ⇒ un
escalón vale **11,6218 W/m² de esa mesa**. La fila pondera por largo de mesa y la
planta promedia por fila (E-A4), así que sobre la POA de planta el escalón se
divide por el nº de filas y por la fracción de largo de la mesa.

Notas: `NS = MV` se ha verificado por lectura del bucle, no instrumentando el
contador. La verificación numérica es sobre el caso B, no sobre Ayora real.

---

# BLOQUE E — ANOMALÍAS

### E-E1  Tramo θ 21,75° → 22,00° del caso B, paso 0,01°

Commit:      3a57451
Scripts:     `audit2/E1_tramo_2175_2200.mjs` y `audit2/E13_detalle.mjs`
Comando:     `node audit2/E1_tramo_2175_2200.mjs` · `node audit2/E13_detalle.mjs`
Node:        v22.22.2
Salida:      `audit2/out/E1.txt`, `audit2/out/E13.txt` · CSV `audit2/out/E1.csv`
Estado:      **MEDIDO**

El nº de emisores candidatos tras la poda **no lo publica el motor**. Se obtiene
ejecutando una **copia instrumentada** del bloque FÍSICA PURA, construida en
memoria: se localiza la única aparición de la línea de la poda
(`backtracking.html:2135`, `cands.sort((a,b)=>a.adx-b.adx);`) y se le antepone una
sonda. **El fichero del repo no se toca.** Validación: la copia instrumentada da
|Δ fs PLANOS| = **0,000e+0** frente al motor original en los 26 puntos del tramo.

Poda implicada, `backtracking.html:2115-2130`:

```js
    for(const pl of planes){
      if(pl.e===r)continue;
      const dx=pl.x-xs[r];
      if(dx*sgn<=0||Math.abs(dx)>reachDe(pl.e,r)||Math.abs(pl.den)<1e-9)continue;
      const shf=ratio===null?0:-dx*ratio;
      const dzMax=Math.max(Math.abs(pl.C[2]-cot(r,pl.w0)),Math.abs(pl.C[2]-cot(r,pl.w1)))+T.cw;
      const axial=Math.abs(sv[1])/Math.max(sv[2],1e-3);
      const slack=ratio===null?1e9:4+hw*Math.abs(ratio)+Math.abs(dx)*0.02+dzMax*axial;
      cands.push({pl:pl,adx:Math.abs(dx),lo:pl.w0+shf-slack,hi:pl.w1+shf+slack});
    }
```

y el descarte de cajas detrás del plano receptor, `backtracking.html:2164-2172`
(sólo con estructura — `if(!noStruct)`):

```js
      const detras=(bx)=>{
        if(!solDelante)return false;
        const d=(bx.C[0]-A0r[0])*nu0+(bx.C[1]-A0r[1])*nu1+(bx.C[2]-A0r[2])*nu2;
        let rad=0;
        for(let k=0;k<3;k++)rad+=bx.hf[k]*Math.abs(bx.ax[k][0]*nu0+bx.ax[k][1]*nu1+bx.ax[k][2]*nu2);
        return d+rad<=0;
      };
      if(!noStruct)for(const pl of cSeg){pl.verTb=!detras(pl.tb);pl.verSl=!detras(pl.sl);}
```

Resultado (MV = `mvPara(T,zen)` = **33**, el que publica el motor; sombra de
PLANOS y PUBLICADA como máximo por filas):

| θ | fs PLANOS | fs PUBLICADA | Δ (pub − planos) | candidatos tras poda [fila 0..5] |
|---|---|---|---|---|
| 21,90° | 22,6866 % | 22,6872 % | 0,0006 pp | 5 4 3 2 1 0 |
| 21,91° | 22,7202 % | 22,7208 % | 0,0006 pp | 5 4 3 2 1 0 |
| **21,92°** | **21,8027 %** | **22,7238 %** | **0,9211 pp** | 5 4 3 2 1 0 |
| 21,93° | 21,8098 % | 22,7269 % | 0,9171 pp | 5 4 3 2 1 0 |
| 22,00° | 21,8590 % | 22,7481 % | 0,8891 pp | 5 4 3 2 1 0 |

**Qué emisor entra o sale: NINGUNO.** La lista de filas emisoras candidatas tras
la poda es **constante en todo el tramo** —
`r0:[1,2,3,4,5] r1:[2,3,4,5] r2:[3,4,5] r3:[4,5] r4:[5] r5:[]` — y el número de
candidatos también (5 4 3 2 1 0). El salto no viene de la poda.

Desglose por fila del salto (script `E13_detalle.mjs`):

| θ | fila 0 | fila 1 | fila 2 | fila 3 | fila 4 | fila 5 | máx | fila del máx |
|---|---|---|---|---|---|---|---|---|
| 21,91° PLANOS | **22,7202** | 2,1773 | 5,6385 | 21,7957 | 0 | 0 | 22,7202 % | 0 |
| 21,92° PLANOS | **21,3207** | 2,1820 | 5,6410 | 21,8027 | 0 | 0 | 21,8027 % | **3** |
| 21,91° PUBLICADA | 22,7208 | 2,1793 | 5,6407 | 22,3796 | 0 | 0 | 22,7208 % | 0 |
| 21,92° PUBLICADA | 22,7238 | 2,1840 | 5,6432 | 22,3864 | 0 | 0 | 22,7238 % | 0 |

La fila 0 **de planos** cae 1,40 pp entre 21,91° y 21,92°; la misma fila 0
**publicada** sube 0,0030 pp sin discontinuidad. Al caer la fila 0, el máximo de
planos pasa de la fila 0 a la fila 3, y de ahí el escalón de la columna «fs
PLANOS» del barrido.

El mismo salto con MV forzado:

| MV | fs PLANOS 21,91° | fs PLANOS 21,92° | salto |
|---|---|---|---|
| 8 | 22,7523 % | 22,7565 % | +0,0042 pp |
| 16 | 22,4332 % | 22,4357 % | +0,0025 pp |
| 32 | 22,5365 % | 22,5399 % | +0,0034 pp |
| **33** (el adaptativo) | 22,7202 % | 21,8027 % | **−0,9175 pp** |
| 64 | 22,4537 % | 22,4572 % | +0,0034 pp |
| 128 | 22,4589 % | 22,4625 % | +0,0036 pp |
| 256 | 22,6390 % | 22,6425 % | +0,0036 pp |

El escalón aparece **sólo en MV = 33** — el valor que `mvPara` elige para este
caso. Con MV 8, 16, 32, 64, 128 y 256 la sombra de planos sube ~0,003 pp de forma
continua.

Notas: la explicación del mecanismo interno de la cuadratura para MV impar no se
ha medido (**NO VERIFICADO**); lo medido es que el escalón es exclusivo de MV=33
y que la lista de emisores no cambia.

### E-E2  Qué combinación reproduce «13,4 % / 105» del §5

Commit:      3a57451
Script:      `audit2/E2_hipotesis.mjs`
Comando:     `node audit2/E2_hipotesis.mjs`
Node:        v22.22.2
Salida:      `audit2/out/E2.txt`
Estado:      **MEDIDO — la combinación existe y es exacta**

Hipótesis probadas una a una (todas con commit 3a57451, caso B, instante canónico):

**(a) planos vs publicada** — con los parámetros canónicos del encargo:

```
alt 739 TL 3,5 alb 0,20   ghi 82.4 dni 324.7 dhi 30.1
                          fs planos 12,967 %   fs PUBLICADA 13,426 %   POA 108,736
```
La **publicada** es 13,426 %, que redondea al **13,4 %** del documento.

**(b) altitud** — barrido, con TL 3,5 y albedo 0,20:

```
alt   0 m   ghi  82.3  dni 284.3  dhi 36.4   POA 106.231
alt 100 m   ghi  81.1  dni 289.6  dhi 34.4   POA 105.358
alt 200 m   ghi  80.5  dni 294.9  dhi 32.9   POA 104.974
alt 300 m   ghi  80.2  dni 300.3  dhi 31.7   POA 105.007      <-- 
alt 500 m   ghi  80.6  dni 311.3  dhi 30.4   POA 106.089
alt 739 m   ghi  82.4  dni 324.7  dhi 30.1   POA 108.736
```

A **alt 300 m** el cielo sale **GHI 80,2 · DNI 300,3 · DHI 31,7**, que es
literalmente el que el documento declara en su §4:

```
docs/algoritmos_backtracking.html:115
 Sol (NOAA) elevación 9,28° · azimut 66,7° (E-NE) · cénit 80,72°   Cielo claro (Ineichen, T L 3,5)  GHI 80 · DNI 300 · DHI 32 W/m² (≡ pvlib)
```

y el mismo que la nota H4 del documento da como careo contra pvlib («80,2 /
300,3 / 31,7 W/m², frente a los 80,1 / 300,2 / 31,7 de pvlib»).

**300 m es el valor por defecto del propio campo de la página**:

```
backtracking.html:154
      <div class="f"><label>Altitud m</label><input id="alt" type="number" step="10" value="300"></div>
```

**(c) MV** — no cierra por sí sola, pero se entrega el barrido:

```
MV   8   fs planos 10,822 %   fs publicada 10,838 %
MV  16   fs planos 12,256 %   fs publicada 13,195 %
MV  33   fs planos 12,967 %   fs publicada 13,426 %      (el efectivo)
MV  64   fs planos 12,987 %   fs publicada 13,691 %
MV 128   fs planos 12,955 %   fs publicada 13,682 %
```

**(d) commit** — descartada por E-B1: 1227252 y 3a57451 dan lo mismo.

**Combinación que reproduce el documento**: **altitud 300 m** (no 739) **y
sombra PUBLICADA** (no de planos):

```
POA 105,007   →  el «105» del documento
fs publicada 13,426 %  →  el «13,4 %» del documento
```

Notas: el valor **739 m** de los «parámetros canónicos» del encargo procede de
`tools/export_consignas.mjs:177` (`const ALT = 739`), que es la altitud de
**Ayora**, no la del caso de Zaragoza. Ver `CRÍTICA DEL ENCARGO`.

### E-E3  θ 54,25° frente a 55,00° con MV alto

Commit:      3a57451
Script:      `audit2/E13_detalle.mjs`
Comando:     `node audit2/E13_detalle.mjs`
Node:        v22.22.2
Salida:      `audit2/out/E13.txt`
Estado:      **MEDIDO**

POA de planta (W/m²) en el tramo, caso B, instante canónico:

| MV | 54,00 | 54,25 | 54,50 | 54,75 | 55,00 | argmax del tramo | argmax en −55…55 |
|---|---|---|---|---|---|---|---|
| 8 | 236,2997 | 236,7371 | 237,1710 | 237,6008 | 238,0266 | 55,00° | 52,00° |
| 16 | 245,5368 | 245,9975 | 246,4539 | 246,9061 | 245,9664 | 54,75° | 54,75° |
| 32 | 240,1485 | 239,8871 | 240,3272 | 240,7634 | 241,1959 | 55,00° | 52,75° |
| **33** | 241,1070 | **241,5563** | 240,6438 | 241,0808 | 241,5138 | **54,25°** | 54,25° |
| 64 | 242,0200 | 241,4286 | 241,5183 | 241,9575 | 242,3925 | 55,00° | 55,00° |
| **128** | 241,6545 | 242,1022 | **242,3709** | 242,2842 | 242,3687 | **54,50°** | 54,50° |
| 256 | 241,9380 | 242,1236 | 242,3093 | 242,3998 | **242,7470** | 55,00° | 55,00° |

**Con MV = 128 el argmax NO se mantiene en 54,25°**: pasa a 54,50°, tanto dentro
del tramo como en el barrido completo. El 54,25° sólo es argmax con MV = 33, el
valor adaptativo que publica el motor para este caso. Con MV = 256 el argmax del
tramo es 55,00°.

Notas: un solo instante. La diferencia entre candidatos sigue siendo del orden de
décimas de W/m² en todos los MV, por debajo de las amplitudes pico-pico medidas
en E-D1 para MV ≤ 64.

### E-E4  El escalón de MV = 33: la hipótesis del muestreo impar, puesta a prueba

Commit:      3a57451
Script:      `audit2/E4_mv_impar.mjs`
Comando:     `node audit2/E4_mv_impar.mjs`
Node:        v22.22.2
Salida:      `audit2/out/E4.txt` · CSV `audit2/out/E4_estaciones.csv`
Estado:      **MEDIDO** — la hipótesis del auditor **NO explica el escalón**

Hipótesis a poner a prueba, enunciada por el auditor: MV = 33 es impar y los
demás valores probados son pares; el muestreo es de punto medio, así que existe
una estación exactamente en el centro de la mesa si y sólo si MV es impar, y el
centro es donde discrimina el reparto por alas.

La aritmética de la hipótesis es correcta. `backtracking.html:2173`:
```js
        const v=v0+(v1-v0)*(j+0.5)/MV;
```
`backtracking.html:2267`:
```js
        {const wg=v<(v0+v1)/2?0:1;hitW[wg]+=fCol;NW[wg]++;elecW[wg]+=elecLoss(fCol,T.nBypass);}
```
Una estación cae en el centro cuando `(j+0.5)/MV = 0.5`, o sea `j = (MV−1)/2`,
entero **si y sólo si MV es impar**; y ahí `v < (v0+v1)/2` es falso, así que la
estación central cae en el ala 1 y el reparto queda asimétrico:

| MV | ¿j=(MV−1)/2 entero? | estaciones ala 0 | ala 1 | reparto |
|---|---|---|---|---|
| 32 | no | 16 | 16 | simétrico |
| **33** | **SÍ, j=16** | 16 | 17 | **asimétrico** |
| 34 | no | 17 | 17 | simétrico |
| **65** | **SÍ, j=32** | 32 | 33 | **asimétrico** |
| 66 | no | 33 | 33 | simétrico |

La cuenta por estación no la publica el motor: se obtiene con una **copia
instrumentada en memoria** del bloque FÍSICA PURA, con la sonda tras la única
aparición del reparto por alas. Validación: **|Δ fs PLANOS| = 0,000e+0** frente
al motor original en todo el tramo. El fichero del repo no se toca.

**(1) El tramo θ 21,85°→22,00° a paso 0,01°, sombra de PLANOS.** Salto máximo
entre θ consecutivos:

| MV | paridad | salto máximo | entre |
|---|---|---|---|
| 32 | par | +0,0034 pp | 21,85° y 21,86° |
| **33** | **IMPAR** | **−0,9175 pp** | **21,91° y 21,92°** |
| 34 | par | +0,0067 pp | 21,85° y 21,86° |
| **65** | **IMPAR** | **+0,0037 pp** | 21,85° y 21,86° |
| 66 | par | +0,0035 pp | 21,85° y 21,86° |

> **MV 65 es impar y NO produce el escalón.** La paridad no es condición
> suficiente: la hipótesis queda refutada por contraejemplo dentro del propio
> experimento que la pone a prueba.

**(2) Qué estación aporta la discontinuidad.** Diferencia de fracción entre
21,92° y 21,91°, fila receptora 0, MV = 33, las 8 mayores en módulo:

| j | Δ fracción | ala | ¿centro? |
|---|---|---|---|
| **30** | **−46,2850 pp** | 1 | no |
| 20 | +0,0262 pp | 1 | no |
| 21 | +0,0222 pp | 1 | no |
| 22 | +0,0183 pp | 1 | no |
| 23 | +0,0143 pp | 1 | no |
| 24 | +0,0104 pp | 1 | no |
| 25 | +0,0064 pp | 1 | no |
| 26 | +0,0025 pp | 1 | no |

> **La estación responsable es j = 30, no la central j = 16.** Toda la
> discontinuidad la aporta **una sola estación** que pasa de 46,3 % a 0 % en
> 0,01° de giro; las otras 32 se mueven menos de 0,03 pp cada una. Segunda
> refutación de la hipótesis, independiente de la primera: el centro exacto no
> interviene.

j = 30 con MV = 33 cae en v = 27,46 m sobre una mesa de −32,365 a +32,365 m, es
decir **cerca del extremo**, no del centro. La suma de las diferencias dividida
por las 33 estaciones da −1,3995 pp, que es la caída de la fila 0 medida en E-E1
(de 22,7202 % a 21,3207 %); el máximo publicado pasa entonces a la fila 3, como
ya recogía ese ítem.

**(3) Reparto por alas** en esos dos θ:

| MV | θ | est. ala 0 | ala 1 | fracción media ala 0 | ala 1 | diferencia |
|---|---|---|---|---|---|---|
| 32 | 21,91° | 16 | 16 | 0,0000 % | 45,0730 % | 45,0730 pp |
| 32 | 21,92° | 16 | 16 | 0,0000 % | 45,0798 % | 45,0798 pp |
| 33 | 21,91° | 16 | 17 | 0,0000 % | 44,1039 % | 44,1039 pp |
| 33 | 21,92° | 16 | 17 | 0,0000 % | **41,3872 %** | 41,3872 pp |
| 34 | 21,91° | 17 | 17 | 0,0000 % | 42,9269 % | 42,9269 pp |
| 34 | 21,92° | 17 | 17 | 0,0000 % | 42,9348 % | 42,9348 pp |

El ala 0 está a 0,0000 % en los tres MV y los dos θ: toda la sombra vive en el
ala 1. El reparto asimétrico de MV = 33 (16/17) existe, pero el ala 0 no
participa, así que la asimetría no es el mecanismo.

**(4) ¿Puede `mvPara` devolver impares?** `backtracking.html:856`:
```js
  return Math.max(8,Math.min(64,Math.ceil(rasante*L/(tor>=0.5?2:4))));
```
`Math.ceil` de un cociente no tiene paridad garantizada. Barrido del dominio
(largo de mesa 10…130 m a paso 0,5 m × torsión por encima y por debajo de 0,5° ×
rasante 1 y 2): **378 de 964 combinaciones (39,2 %) dan MV impar**. Ejemplos:
L = 16,5…18 m con torsión ≥ 0,5° ⇒ MV = 9; L = 20,5…22 m ⇒ MV = 11. El caso B de
esta auditoría (L = 64,73 m, torsión máxima 7,437°, cénit 80,72°) ⇒ **MV = 33**.

**Qué descarta el experimento y qué no.** Descarta que la paridad de MV sea la
causa (MV 65 es impar y no lo produce) y que intervenga la estación central o el
reparto por alas (la responsable es j = 30 y el ala 0 está a cero). **No**
identifica el mecanismo: qué hace que esa estación concreta pase de 46,3 % a 0 %
en 0,01° queda **NO VERIFICADO**. Lo medido es que la discontinuidad es de **una
sola estación de cuadratura**, no de la malla, y que aparecer o no depende de que
alguna estación caiga sobre ese cruce — con 33 estaciones cae, con 32, 34, 65 y
66 no.

Notas: un solo instante, un solo caso (B), una sola fila receptora en el desglose
por estación. El barrido de `mvPara` es sobre el dominio de sus entradas, no sobre
plantas reales.

---

# BLOQUE F — GRANULARIDAD DE LA TRANSPOSICIÓN

### E-F1  Granularidad de la transposición: `rowTiltAt` frente al tilt por mesa

Commit:      3a57451
Comando:     lecturas y `grep` (sin experimento numérico)
Estado:      **MEDIDO** (documental)

`poaPlant` transpone con `rowTiltAt`, `backtracking.html:2461`:

```js
    const p=poaRow(rowAngles[r],rowTiltAt(T,r),T.axisAz,zen,az,irr,doy,albedo,T.iam);
```

y `rowTiltAt`, `backtracking.html:1154-1160`:

```js
function rowTiltAt(T,r){
  // tilt N-S de la fila: el perfil por fila si el terreno lo trae (T.rowTilt),
  // si no la media de sus parejas (regla de compute_bt_angles_rowwise)
  if(T.rowTilt)return T.rowTilt[r];
  const nP=T.pairs.length;
  const lo=T.pairs[Math.max(r-1,0)], hi=T.pairs[Math.min(r,nP-1)];
  return (lo.axisTilt+hi.axisTilt)/2;
}
```

Matiz respecto al enunciado: la media de las dos parejas es la **segunda** rama.
Si `T.rowTilt` existe —y en Ayora real existe, `terrain()` lo pone a `P.tilt`
(`backtracking.html:4147`)— devuelve el tilt **por fila**, no la media de parejas.
En los dos casos es **un solo tilt por fila**, nunca por mesa.

El contador sí usa tilt por mesa. `backtracking.html:1621`:

```js
    // tilt N-S de CADA MESA: la z de sus dos extremos, sin promediar ni por
    // línea ni por fila — es lo que su TCU ve y lo que la transposición
    // necesita mesa a mesa (v1.41 «el tilt por mesa», v1.48 por MESA de verdad)
    segTilt.push(sg.map(o=>Math.atan2(o.z[1]-o.z[0],(o.s[1]-o.s[0])||1)*DEG));
```

y quien lo lee, `backtracking.html:2562`:

```js
function segTiltAt(T,r,k){
  return (T.segTilt&&T.segTilt[r]&&T.segTilt[r][k]!=null)?T.segTilt[r][k]:rowTiltAt(T,r);
}
```

`poaPlantSeg` transpone con `segTiltAt` (`backtracking.html:2706`); `poaPlant`, no.

**Llamantes de `poaPlant`** — 30 en `backtracking.html` (líneas 2824, 2839, 2853,
2865, 2911, 2916, 2978, 3003, 3010, 3011, 3014, 3033, 3163, 3282, 3283, 3309,
3338, 3521, 3522, 3625, 3626, 3673, 3883, 4932, 4970, **6918**, 7263, 7370, 7397,
7406) más `tools/audit_sweep.mjs`, `tools/banda_astro_bt.mjs`,
`tools/barrido_terrenos.mjs`, `tools/careo_sombra.mjs`, `tools/sensib_azimut.mjs`,
`tools/test_backtracking_sim.mjs`, `tools/test_produccion.mjs`.
Entre ellos están **todos los evaluadores de los optimizadores** (2824-3033) y la
**estimación anual** (6918).

**Llamantes de `poaPlantSeg`**: la tabla de E-A4.

Notas: no se ha ejecutado el experimento de cota de F.2 (transposición por mesa
ponderada por área de módulo) ni el de dispersión intra-accionamiento de F.3
(**NO VERIFICADO** — ver HUECOS).

### E-F2  Transposición por mesa y peso por módulos, frente a la publicada

Commit:      3a57451
Script:      `audit2/F23_mesa.mjs`
Comando:     `node audit2/F23_mesa.mjs 20`
Node:        v22.22.2
Salida:      `audit2/out/F23.txt` · CSV `audit2/out/F23.csv`
Estado:      **MEDIDO** (Ayora real) · **NO APLICABLE** (caso B, ver notas)

Ayora real, **día 21-jun-2026 a paso 20 min**, las 9 políticas. 79 líneas de
simulación, cuerda 2,384, z0 0,17, ±55°, axisAz 0, drive bifila, **MV 8**
(`if(T.real)return 8`), nb 2, b0 0,05, TL 3,5, albedo 0,20, alt 739 m.
Sombra: la **PUBLICADA** (`shadeRows`, con estructura) en las dos variantes.
Duración 3 820 s.

- **(a)** como está: `poaPlant` con **un tilt por fila** (`rowTiltAt`) y el θ medio
  de la línea (`segLineMean`).
- **(b)** `poaRow` con `segTiltAt(T,r,k)` —**el tilt de cada mesa**— y la fila
  agregada ponderando por el **nº de módulos real de cada mesa**
  (`PLANT_REAL.segMods`), no por largo. La sombra por mesa es la misma
  (`sh.seg` / `sh.segElec`): lo único que cambia entre (a) y (b) es la
  transposición y el peso. **No se toca el motor**: (b) se monta en el script con
  las funciones que la propia página exporta.

**Test nulo descartado**: **1 600 de 1 600 mesas** declaran nº de módulos en el
levantamiento, así que el peso por módulos no degenera al peso por largo y la
variante (b) mide lo que el encargo pide.

| política | (a) tilt por FILA | (b) tilt por MESA + peso por MÓDULOS | Δ (b−a) | Δ relativo |
|---|---|---|---|---|
| astro | 11 063,6677 | 11 058,3936 | −5,2741 | −0,0477 % |
| global | 11 090,5951 | 11 089,7764 | −0,8187 | −0,0074 % |
| row | 11 114,8047 | 11 113,8748 | −0,9299 | −0,0084 % |
| bt2d | 11 132,4522 | 11 131,7933 | −0,6589 | −0,0059 % |
| **pairwise** | 11 184,7569 | 11 224,1768 | **+39,4199** | **+0,3524 %** |
| true3d | 9 759,8216 | 9 758,8492 | −0,9725 | −0,0100 % |
| mgl | 9 949,5526 | 9 948,8448 | −0,7077 | −0,0071 % |
| optimal | 11 172,1032 | 11 168,7840 | −3,3192 | −0,0297 % |
| optfree | 11 179,6672 | 11 176,7285 | −2,9387 | −0,0263 % |

(Wh/m² de planta del día 21-jun)

Ocho de las nueve políticas dan Δ **negativo** y por debajo de 0,05 %. `pairwise`
es la única con signo contrario y el único Δ por encima de 0,1 %: **+0,3524 %**,
un orden de magnitud mayor que el de cualquier otra.

**Caso B: NO APLICABLE.** El caso B canónico tiene **una sola mesa por fila y sin
`segTilt`** (`audit2/lib_motor.mjs`, función `caso`: `segs.push([[-L/2, L/2]])`),
de modo que `segTiltAt` cae en su rama de respaldo `rowTiltAt` y el peso por
módulos degenera a uno solo. La variante (b) coincidiría con (a) **por
construcción**: sería un test nulo, no una medida. Se declara en vez de publicar
un cero.

Notas: **un solo día** (21-jun), no el anual que pide el encargo — el anual de
nueve políticas sobre Ayora real es el coste documentado en la `CRÍTICA DEL
ENCARGO` nº 2. El paso es 20 min, no los 10 del manejador publicado. No se ha
separado cuánto del Δ viene del tilt por mesa y cuánto del peso por módulos: el
experimento cambia las dos cosas a la vez, como pide el enunciado.

### E-F3  Dispersión de POA entre mesas del mismo accionamiento

Commit:      3a57451
Script:      `audit2/F23_mesa.mjs` (mismo comando y misma corrida que E-F2)
Salida:      `audit2/out/F23.txt` · CSV `audit2/out/F23.csv`
Estado:      **MEDIDO**

Métrica ejecutada, declarada: para cada instante del día y cada **motor**
(`T.segDrive`, las mesas que comparten un accionamiento), se toma la POA por mesa
que publica `poaPlantSeg` y se calcula **(máx − mín) / media** entre las mesas de
ese motor. Se descartan los motores con media ≤ 1 W/m² de planta (sol casi nulo:
el cociente se dispara sin significar nada) y los motores de una sola mesa.

| política | motores-instante | p05 | p50 | p95 | máx |
|---|---|---|---|---|---|
| astro | 3 388 | 0,0000 % | 1,1319 % | 177,1359 % | 614,0185 % |
| global | 3 388 | 0,0000 % | 1,1659 % | 60,9708 % | 129,6577 % |
| row | 3 388 | 0,0000 % | 1,1845 % | 56,1334 % | 104,8138 % |
| bt2d | 3 388 | 0,0000 % | 1,1318 % | 55,6846 % | 103,7918 % |
| pairwise | 3 382 | 0,0000 % | 1,1447 % | 69,6740 % | 206,5126 % |
| **true3d** | 3 322 | 0,0000 % | 1,2607 % | **22,6100 %** | **73,7259 %** |
| mgl | 3 322 | 0,0000 % | 1,2224 % | 27,6840 % | 73,7259 % |
| optimal | 3 388 | 0,0000 % | 1,1223 % | 116,8704 % | 614,0185 % |
| optfree | 3 388 | 0,0000 % | 1,1157 % | 116,8704 % | 614,0185 % |

La mediana está entre **1,12 % y 1,26 %** en las nueve políticas: 14 puntos
básicos de separación entre la mayor y la menor. El p95 y el máximo sí separan:
`true3d` y `mgl` tienen el p95 más bajo (22,6 % y 27,7 %) y `astro`, `optimal` y
`optfree` el máximo más alto (614,0 %, el mismo valor en las tres).

Los denominadores no son iguales entre políticas: 3 388 motores-instante para las
que no filtran, 3 382 para `pairwise` y 3 322 para `true3d` y `mgl` — la
diferencia son motores cuya media cae por debajo del corte de 1 W/m² sólo en esas
políticas.

Notas: un solo día y paso 20 min, igual que E-F2. La métrica es un cociente y se
dispara cuando la media es pequeña; el corte de 1 W/m² está declarado pero no
elimina el efecto, y por eso los máximos de tres dígitos **no** deben leerse como
dispersión a sol alto. No se ha cruzado con la hora del instante.

---

# BLOQUE G — PARIDAD CON EL MOTOR BANCABLE

### E-G1  Paridad JS ↔ `tracker3d.py` sobre la rejilla declarada

Commit:      3a57451 (JS) · `tracker3d.py` de `/home/user/SolarGPTfull/solargpt/solargpt_core/`
Scripts:     `audit2/G1_js.mjs` · `audit2/G1_py.py` · `audit2/G1_careo.mjs`
Comandos:    `node audit2/G1_js.mjs`
             `PYTHONPATH=/home/user/SolarGPTfull/solargpt python3 audit2/G1_py.py`
             `node audit2/G1_careo.mjs`
Node:        v22.22.2 · Python 3.11.15 · numpy 2.4.6 · pvlib 0.15.2
Salida:      `audit2/out/G1.txt` · JSON `G1_js.json`, `G1_py.json` · CSV `G1_careo.csv`
Estado:      **MEDIDO** (rejilla parcial: 7 de las 9 políticas)

Rejilla: {caso A, caso B} × {9 políticas} × {07:30, 09:00, 12:00, 16:00, 18:30
locales del 21-jun-2026, tz +2}. Parámetros canónicos: lat 41,57634, lon
−0,79814, alt 739 m, TL 3,5, albedo 0,20, 6 filas, pitch 6,00, cuerda 2,382,
z0 0,17, ±55°, axisAz 0, nb 2.

**El sol (zen, az) y la irradiancia (GHI/DNI/DHI) se pasan idénticos al Python**
desde el JSON que escribe el lado JS, para que la comparación aísle el motor y no
el modelo de cielo. Declarado. El Python **no se ha adaptado**: se llama tal cual,
y las dos funciones que devuelven tupla (`compute_bt_angles_min_ground_light` →
`(out, info)`, `compute_bt_angles_energy_optimal` → `(best_angles, detail)`) se
desempaquetan en el lado del comparador.

Mapa de políticas y cobertura:

| política JS | función `tracker3d.py` | ¿comparable? |
|---|---|---|
| astro | `compute_theta_full_tracking` | SÍ |
| global | `compute_bt_angles_global` | SÍ |
| row | `compute_bt_angles_rowwise` | SÍ |
| pairwise | `compute_bt_angles` | SÍ |
| true3d | `compute_bt_angles_3d` | SÍ |
| mgl | `compute_bt_angles_min_ground_light` | SÍ |
| optimal | `compute_bt_angles_energy_optimal` | SÍ |
| **bt2d** | — | **NO EXISTE en `tracker3d.py`** |
| **optfree** | — | **NO EXISTE en `tracker3d.py`** |

Convención de signo: se prueban las dos (θ_py = +θ_js y θ_py = −θ_js) y se informa
cuál deja el |Δ| mediano menor. En **todas** las políticas comparables de los dos
casos gana **θ_py = +θ_js**: la convención coincide, no hay que invertir.

**Caso A** (pendiente 8°, tilt N-S 0 — terreno uniforme):

| política | conv. | \|Δθ\| máx | \|Δθ\| mediana | POA JS (media) | POA PY (media) | \|ΔPOA\| máx | \|ΔPOA\| mediana | n |
|---|---|---|---|---|---|---|---|---|
| astro | +θ | **0,0000°** | 0,0000° | 786,6409 | 785,9611 | 22,1818 | 5,4401 | 30 |
| global | +θ | **0,0000°** | 0,0000° | 799,7369 | 804,7886 | 6,4762 | 5,4401 | 30 |
| row | +θ | **0,0000°** | 0,0000° | 799,7369 | 804,7886 | 6,4762 | 5,4401 | 30 |
| pairwise | +θ | **0,0000°** | 0,0000° | 799,7369 | 804,7886 | 6,4762 | 5,4401 | 30 |
| true3d | +θ | **0,0000°** | 0,0000° | 799,7369 | 804,7886 | 6,4762 | 5,4401 | 30 |
| mgl | +θ | **0,0000°** | 0,0000° | 799,7369 | 804,7886 | 6,4762 | 5,4401 | 30 |
| optimal | +θ | **0,0000°** | 0,0000° | 799,7369 | 804,7886 | 6,4762 | 5,4401 | 30 |

n = 30 = 6 filas × 5 instantes.

**Caso B** (pendiente 8° + tilt N-S aleatorio, amplitud 4°, semilla 1234):

| política | conv. | \|Δθ\| máx | \|Δθ\| mediana | POA JS (media) | POA PY (media) | \|ΔPOA\| máx | \|ΔPOA\| mediana | n |
|---|---|---|---|---|---|---|---|---|
| astro | +θ | 0,7963° | 0,0000° | 743,1455 | 785,7580 | 161,1698 | 24,8348 | 30 |
| global | +θ | 0,8374° | 0,0753° | 741,0440 | 790,5976 | 161,1698 | 9,6415 | 30 |
| row | +θ | 7,8953° | 0,5226° | 741,7128 | 790,3173 | 161,1698 | 7,7580 | 30 |
| **pairwise** | +θ | **65,0000°** | 0,7486° | 618,1422 | 803,5690 | 428,2832 | 197,1386 | 30 |
| **true3d** | +θ | **57,0000°** | 14,9723° | 629,0985 | 798,7029 | 373,7726 | 172,5372 | 30 |
| **mgl** | +θ | **65,0000°** | 0,7486° | 618,1422 | 803,5690 | 428,2832 | 197,1386 | 30 |
| optimal | +θ | 16,8262° | 0,4632° | 743,1455 | 803,5971 | 161,1698 | 61,4729 | 30 |

Detalle de `pairwise` en el caso B, θ por fila:

```
     07:30  JS   -2.00   -2.00   15.92   -2.00   -2.00   38.10
            PY   41.00   41.00   45.20   42.13   38.17   38.17   |Δ|  43.000  43.000  29.276  44.135  40.174   0.073
     09:00  JS   -2.00   -2.00   55.00   32.50   -2.00   55.00
            PY   55.00   55.00   55.00   55.00   55.00   55.00   |Δ|  57.000  57.000   0.000  22.500  57.000   0.000
     12:00  JS   29.32   28.97   28.88   28.88   29.21   29.64
            PY   29.12   29.12   29.51   29.22   28.89   28.89   |Δ|   0.199   0.150   0.636   0.346   0.325   0.753
     16:00  JS  -27.10  -26.75  -26.66  -26.66  -26.99  -27.41
            PY  -26.90  -26.90  -27.29  -27.00  -26.67  -26.67   |Δ|   0.197   0.149   0.629   0.343   0.322   0.744
     18:30  JS   10.00   10.00  -20.80   10.00   10.00  -55.00
            PY  -55.00  -55.00  -55.00  -55.00  -55.00  -55.00   |Δ|  65.000  65.000  34.200  65.000  65.000   0.000
```

y de `true3d`:

```
     07:30  JS    0.00    0.00   12.29    0.00    0.00   32.79
            PY   42.69   38.70   37.48   37.48   41.52   45.94   |Δ|  42.688  38.696  25.192  37.478  41.522  13.145
     18:30  JS    0.00    0.00  -14.82    0.00    0.00  -38.20
            PY  -55.00  -55.00  -55.00  -55.00  -55.00  -55.00   |Δ|  55.000  55.000  40.181  55.000  55.000  16.800
```

Las divergencias se concentran en los instantes 07:30, 09:00 y 18:30. A sol alto
(12:00 y 16:00) el |Δθ| máximo de todas las políticas comparables del caso B es
**0,7530°**.

> **CORREGIDO por E-G3.** La primera redacción de este párrafo llamaba «sol bajo»
> a esos tres instantes. Sólo 07:30 lo es (elevación 9,28°); 09:00 está a 25,32° y
> 18:30 a 32,75°. Medido por bandas en E-G3, el máximo |Δθ| cae en la banda
> **20-40°**, no por debajo de 10°.

Diferencias estructurales que el careo NO neutraliza, y que hay que tener
presentes al leer las columnas de POA:

1. El JS mide la sombra con el **ray-cast 3D multi-emisora con estructura** (viga
   y canto) y malla axial MV; el Python con `compute_shade`, sin estructura y sin
   malla axial. Por eso |ΔPOA| es no nulo incluso donde |Δθ| = 0.
2. El tilt de transposición: el Python usa
   `terrain.pairs[min(r, n_pairs-1)].axis_tilt_deg` (`solargpt_core/tracker3d.py:1631`), el JS
   `rowTiltAt` (`backtracking.html:1154`) que devuelve `T.rowTilt[r]` cuando
   existe. En el caso B esos dos números difieren por construcción.
3. El terreno Python es `PlantTerrain3D` con `pairs` (pendiente, pitch, axis_tilt):
   **no admite mesas** (`segs`), así que el JS corre con una mesa por fila y el
   Python con la fila entera.

Notas: 5 instantes de un solo día. `bt2d` y `optfree` quedan fuera por no existir
en el Python (búsqueda exhaustiva: `grep -nE "bt2d|optfree|free|per_unit"` sobre
`tracker3d.py` ⇒ sin coincidencias). No se ha investigado el origen de las
divergencias a sol bajo; este ítem las **mide**, no las explica.

### E-G2  Funciones de `tracker3d.py` que el JS declara espejar

Commit:      3a57451 (JS) · `/home/user/SolarGPTfull/solargpt/solargpt_core/tracker3d.py`, 2 186 líneas (Python)
Comando:     `grep -n "^def " tracker3d.py` y lecturas cruzadas
Estado:      **MEDIDO** (documental)

Dónde lo declara el JS:

| `backtracking.html` | texto |
|---|---|
| 111 | «Espejo JS del motor BT3D de SolarGPT (`tracker3d.py`)» |
| 641 | «core en `compute_bt_angles_rowwise` (fila = media de sus dos parejas)» |
| 654 | «el acoplado interior de `compute_bt_angles`» |
| 814 | «políticas de ángulo — mismas semánticas que `tracker3d.py`» |
| 1156 | «si no la media de sus parejas (regla de `compute_bt_angles_rowwise`)» |
| 1220 | «pipeline de `compute_bt_angles_3d`: cap = no_shade − margen, suelo en la baseline» |
| 2354 | «`min_ground_light` — port de `compute_bt_angles_min_ground_light`» |
| 2394 | «POA por fila (Perez 1990) — espejo de `compute_bt3d_poa_per_row`» |
| 3049 | «Canónicos del core: deadband 1,0° · slew 0,17 °/s» |

| función Python | ¿existe con ese nombre? | firma Python | contraparte JS | ¿misma firma? |
|---|---|---|---|---|
| `compute_bt_angles` | SÍ, línea 222 | `(zen, azi, terrain)` → `(n_t, n_rows)` | `anglesPairwise(zen,az,T)` | **NO**: el JS es de UN instante (escalar), el Python vectoriza sobre un array de instantes |
| `compute_bt_angles_rowwise` | SÍ, 254 | `(zen, azi, terrain)` | `anglesRow(zen,az,T)` | NO, misma diferencia |
| `compute_bt_angles_global` | SÍ, 304 | `(zen, azi, terrain)` | `anglesGlobal(zen,az,T)` | NO, misma diferencia |
| `compute_theta_full_tracking` | SÍ, 346 | `(zen, azi, terrain)` | `anglesAstro(zen,az,T)` | NO, misma diferencia + nombre distinto |
| `compute_bt_angles_energy_optimal` | SÍ, 375 | `(solar_position, weather, terrain, *, base_angles=None, albedo=0.20, fractions=BT3D_ENERGY_OPT_FRACTIONS)` | `anglesOptimal(zen,az,T,irr,doy,albedo,prev)` | **NO**: el JS añade `prev` (histéresis) y `doy`; el Python no tiene histéresis ni el parámetro `prev` |
| `compute_bt_angles_3d` | SÍ, 532 | `(zen, azi, terrain, safety_margin_deg=0.5, enforce_2p5d_degeneracy=True, epsilon_axis_tilt_deg=0.5, epsilon_angle_deg=0.0, transition_band_deg=BT3D_TRANSITION_BAND_DEG, return_detail=False)` | `anglesTrue3d(zen,az,T)` | **NO**: el JS no expone ninguno de los seis parámetros; los lleva cableados |
| `compute_bt_angles_min_ground_light` | SÍ, 1164 | `(zen, azi, terrain, tol=2e-3, step_deg=0.25, max_iter=60)` | `anglesMinGroundLight(zen,az,T)` | **NO**: el JS no expone `tol`, `step_deg` ni `max_iter` |
| `compute_bt3d_poa_per_row` | SÍ, 1614 | `(solar_position, weather, terrain, row_angles, shade_elec=None, albedo=0.20)` | `poaPlant(zen,az,T,rowAngles,irr,doy,albedo,fast)` | **NO**: el JS añade `doy` y el conmutador `fast` |
| `electrical_shade_loss` | SÍ, 1066 | `(shade_frac, n_bypass, threshold=1e-6)` | `elecLoss(f,nBypass)` | **NO**: el JS no expone `threshold`, lo lleva cableado a `1e-6` |
| `ground_light_fraction` | SÍ, 1092 | `(theta_deg, solar_zenith, solar_azimuth, gcr, axis_azimuth_deg=0.0)` | `groundLightFrac(thetaDeg,zen,az,gcr,axisAz)` | SÍ (mismo orden y significado; el JS exige `axisAz`) |
| `compute_shade` | SÍ, 983 | `(zen, azi, row_angles, terrain)` | `shadeRows(zen,az,T,rowAngles)` | **NO**: orden de argumentos distinto (`T` al final en Python, tercero en JS) |
| `physical_shade_fraction` | SÍ, 1121 | `(zen, azi, terrain, row_angles)` | sin contraparte declarada · **NO ENCONTRADO** en el JS con ese nombre |
| `no_shade_violation` | SÍ, 1158 | `(zen, azi, terrain, row_angles, tol=2e-3)` | `repairNoShade` no es su espejo (repara, no verifica) · **NO ENCONTRADO** |
| `bt3d_tangent_residual_mm` | SÍ, 841 | `(zen, azi, terrain, row_angles)` | `tangentResidualMm` (exportada por el JS) | firma **SÍ** coincide en orden |
| `_bt3d_pair_max_magnitude` | SÍ, 472 (privada) | `(zen, azi, cross_slope_deg, axis_tilt_deg, pitch_m, …)` | `bt3dPairMaxMag(zen,az,slope,axisTilt,pitch,cw,axisAz,maxAngle)` | parcial |
| `run_tracker_bt3d` | SÍ, 1780 | `(solar_position, geom, weather=None)` | sin contraparte (es el orquestador del servicio) | — |
| `optimize_annual_touch_target`, `optimize_rowwise_touching_shadows`, `_touching_*` | SÍ (1259, 1381, 1434, 1549) | — | **NO ENCONTRADO** en el JS: no hay política «touching» |
| política `optfree` del JS (`anglesOptimalFree`) | — | — | **NO EXISTE** en `tracker3d.py`: búsqueda exhaustiva con `grep -nE "optfree\|free\|per_unit\|OPTFREE"` sobre `tracker3d.py` ⇒ sin coincidencias |
| política `bt2d` del JS (`anglesBt2d`) | — | — | **NO ENCONTRADO** con ese nombre |

Constantes cableadas, comparadas:

| concepto | Python | JS | ¿igual? |
|---|---|---|---|
| fracciones del energy-optimal | `BT3D_ENERGY_OPT_FRACTIONS = (0.0, 0.25, 0.5, 0.75, 1.0)` (340) | `OPT_FRACTIONS=[0,0.25,0.5,0.75,1]` (2726) | **SÍ** |
| refinado alrededor de la ganadora | **NO EXISTE** en el Python (sin `refine`/`OPT_REFINA`) | `OPT_REFINA=2` (2781) | **NO** |
| histéresis del energy-optimal | **NO EXISTE** | `OPT_HISTERESIS=0.01` (2782) | **NO** |
| límite de velocidad de f | **NO EXISTE** | `OPT_DF_MAX=null` (2802) — desactivado | n/a |
| banda de transición 3D | `BT3D_TRANSITION_BAND_DEG = 0.5` (529) | `MARGIN=0.5` en `anglesTrue3d` (1226) | **SÍ** en valor |
| epsilon de degeneración 2.5D | `epsilon_axis_tilt_deg=0.5` (534) | `EPS_TILT=0.5` (1226) | **SÍ** |
| `epsilon_angle_deg` | `0.0` (535) | no expuesto | — |
| umbral de polvo de `elecLoss` | `threshold=1e-6` (1066) | `if(!(f>1e-6))return 0;` (629) | **SÍ** |
| tolerancia de no-sombra | `tol=2e-3` (1158, 1164) | **NO ENCONTRADO** con ese valor en el JS | **NO** |
| paso del ascenso de min-ground-light | `step_deg=0.25` (1165) | el JS usa `PASO_BUSQ=0.1` (907) y `PASO_GRUESO=0.5` (908) | **NO** |
| iteraciones de min-ground-light | `max_iter=60` (1165) | `for(let it=0;it<3;it++)` (2372) | **NO** |
| zenit de corte del 3D | `zen_max=82.0` (893) | `zen<87` en `anglesTrue3d` (1225) y `zen>=82` en el deferral | **parcial** |
| deadband del lazo | no está en `tracker3d.py` (**NO ENCONTRADO**) | `DEADBAND_DEG=1.0` (3061) | — |
| slew del actuador | no está en `tracker3d.py` (**NO ENCONTRADO**) | `TRACKER_SLEW=0.17` (3044) | — |
| rejilla del óptimo libre | no existe | `OPTFREE_F0=-0.5, OPTFREE_NF=13` (2937) | **NO** |

Notas: la comparación es de **nombres, firmas y constantes**, no de resultados
numéricos. La paridad numérica (G.1) **NO se ha ejecutado** — ver HUECOS.
La búsqueda de constantes en el Python se hizo con
`grep -nE "^BT3D_|^[A-Z_]{3,} *=" ` y
`grep -nE "safety_margin_deg=|tol=|step_deg=|max_iter=|threshold=|zen_max=|bind_margin_deg=|tol_mm=|gap_margin_m=|epsilon_"`.

### E-G3  Auditoría del arnés de G.1, y qué etapa acompaña a los 65°

Commit:      3a57451
Script:      `audit2/G3_arnes.mjs`
Comando:     `node audit2/G3_arnes.mjs`
Node:        v22.22.2
Salida:      `audit2/out/G3.txt`
Estado:      **MEDIDO**

**Por qué este ítem va antes de creerse el número.** En E-C5 un predicado
reescrito a mano daba |Δθ| de 55° por un error de copia, no del motor. Antes de
publicar los 65° de E-G1 se comprueba que el arnés no repite ese fallo.

**(1) ¿Reimplementa el arnés alguna función del motor?** Se buscan definiciones
de función en los cuatro ficheros de la ruta de G.1 y se cruzan contra una lista
de 38 nombres del motor JS y del Python:

```
  audit2/G1_js.mjs         define  0 funciones: (ninguna)
  audit2/G1_py.py          define  0 funciones: (ninguna)
  audit2/G1_careo.mjs      define  0 funciones: (ninguna)
  audit2/lib_motor.mjs     define  3 funciones: motorDe, caso, echo
  ⇒ funciones del motor redefinidas en el arnés: 0
```

El lado JS extrae la física del fichero (`audit2/lib_motor.mjs`, `motorDe`:
`git show <sha>:backtracking.html`, recorte entre `FÍSICA PURA` y `/* FIN-FÍSICA`
y `new Function`). El lado Python importa `solargpt_core.tracker3d` y llama a sus
funciones por `getattr`. `G1_careo.mjs` sólo compara dos JSON y no contiene
física.

Lo único que el arnés construye a mano es `caso(F, 'A'|'B')`: las cotas
(`-i·pitch·tan(8°)`) y los tilts (`mulberry32(1234)`, amplitud 4) **son la
definición de los casos que da el encargo**, no lógica del motor; las parejas
salen de `F.pairsFromElev`, que sí es del motor. Se declara.

**(2) Cruce de los tres candidatos del auditor.**

**(a) Umbral de deferral.** `backtracking.html:1250`:
```js
  const meaningful=zen<82;
```
Lado Python: `solargpt_core/tracker3d.py:893`
```py
def _bt3d_active_mask(zen, azi, terrain, zen_max=82.0, bind_margin_deg=1.0):
```
Los dos llevan el **mismo 82°**, y `compute_bt_angles_3d` (532-771) lo usa. **No
es una constante que difiera.**

**(b) `repairNoShade` en el lado Python.** Búsqueda exhaustiva con
`grep -nE "repair" tracker3d.py`: las coincidencias son **verificadores**
(`solargpt_core/tracker3d.py:851` `_no_shade_violations_from_residual`, `solargpt_core/tracker3d.py:1158`
`no_shade_violation`), no reparadores. **La etapa `repairNoShade` del JS
(`backtracking.html:3367-3369`) no tiene contraparte en el Python.**

**(c) Acople por accionamiento.** `grep -nE "groups|drive|apply_drive" tracker3d.py`
⇒ **sin coincidencias**; `PlantTerrain3D` no tiene campo de accionamiento. Pero en
esta rejilla el JS corre con `drive: 'mono'` y `T.groups = null`, así que
`applyDrive` es la identidad **en los dos lados**: este candidato **no puede
explicar la divergencia** y queda descartado.

**(3) Los casos de mayor |Δθ|.**

| caso | hora | política | fila | θ JS | θ PY | \|Δθ\| | sol | torsión máx | etapa que difiere |
|---|---|---|---|---|---|---|---|---|---|
| B | 18:30 | pairwise | 0,1,3,4 | 10,00° | −55,00° | **65,000°** | 32,7° | 7,44° | `repairNoShade` sólo en JS |
| B | 18:30 | mgl | 0,1,3,4 | 10,00° | −55,00° | **65,000°** | 32,7° | 7,44° | `repairNoShade` sólo en JS |
| B | 09:00 | pairwise | 0,1,4 | −2,00° | 55,00° | **57,000°** | 25,3° | 7,44° | `repairNoShade` sólo en JS |
| B | 09:00 | true3d | 0,1,4 | −2,00° | 55,00° | **57,000°** | 25,3° | 7,44° | `repairNoShade` sólo en JS |

**Las 14 divergencias mayores son todas de políticas que llevan `repairNoShade`
en el JS y no lo tienen en el Python.** Eso es lo que se mide: esa etapa existe en
un lado y no en el otro. **No** se afirma que sea la causa.

> **DESMENTIDO por E-G4.** Ejecutado el JS con `repairNoShade` desactivado,
> **ninguna de las 14 cae** y el \|Δθ\| máximo residual es el mismo, 65,0000°. La
> coincidencia de que todas sean de políticas que llevan la etapa **no era
> prueba**: divergen por otra razón. Los tres candidatos quedan descartados.

Además, en los cuatro casos de 65° y 57° el JS publica un θ **de signo contrario**
al del Python y de módulo pequeño (10,00° y −2,00° frente a ±55,00°): el Python va
al tope del rango y el JS se queda cerca del plano.

**(4) |Δθ| por banda de elevación solar**, todas las políticas comparables de los
casos A y B:

| banda | n | mediana | máximo |
|---|---|---|---|
| sol < 10° | 84 | 0,0000° | 44,1346° |
| sol 10-20° | 0 | — | — (la rejilla no tiene ningún instante en esa banda) |
| sol 20-40° | 168 | 0,0000° | **65,0000°** |
| sol > 40° | 168 | 0,0753° | 0,7963° |

**CORRECCIÓN A E-G1.** Ese ítem dice que «las divergencias se concentran en sol
bajo (07:30, 09:00, 18:30)». Es **incorrecto en cuanto a la elevación**: de los
tres instantes, sólo 07:30 es de sol bajo (9,28°); 09:00 está a **25,32°** y 18:30
a **32,75°**. La banda con el máximo es **20-40°**, no la de menos de 10°. Lo que
sí se sostiene de aquel enunciado es que 12:00 y 16:00 (58,30° y 59,98°) quedan
por debajo de 0,80°. El ítem E-G1 se corrige en su nota.

**(5) `bt2d` y `optfree` en `tracker3d.py`**, con los patrones de búsqueda:

```
   grep -n "bt2d" tracker3d.py     ⇒ SIN COINCIDENCIAS
   grep -n "optfree" tracker3d.py  ⇒ SIN COINCIDENCIAS
   grep -n "free" tracker3d.py     ⇒ SIN COINCIDENCIAS
   grep -n "per_unit" tracker3d.py ⇒ SIN COINCIDENCIAS
   grep -n "OPTFREE" tracker3d.py  ⇒ SIN COINCIDENCIAS
```

**Confirmado: no existen.** Cobertura de las 9 políticas del JS:

| # | política JS | función de `tracker3d.py` | cubierta |
|---|---|---|---|
| 1 | astro | `compute_theta_full_tracking` (346) | SÍ |
| 2 | global | `compute_bt_angles_global` (304) | SÍ |
| 3 | row | `compute_bt_angles_rowwise` (254) | SÍ |
| 4 | **bt2d** | — | **NO EXISTE** |
| 5 | pairwise | `compute_bt_angles` (222) | SÍ |
| 6 | true3d | `compute_bt_angles_3d` (532) | SÍ |
| 7 | mgl | `compute_bt_angles_min_ground_light` (1164) | SÍ |
| 8 | optimal | `compute_bt_angles_energy_optimal` (375) | SÍ |
| 9 | **optfree** | — | **NO EXISTE** |

7 de 9. Notas: la rejilla es de 5 instantes de un día y 2 casos; el reparto por
bandas de elevación tiene 0 instantes entre 10° y 20°, así que esa banda no
informa.

### E-G4  La rejilla de G.1 con `repairNoShade` desactivado

Commit:      3a57451
Script:      `audit2/G4_sin_repair.mjs`
Comando:     `node audit2/G4_sin_repair.mjs`
Node:        v22.22.2
Salida:      `audit2/out/G4.txt` · CSV `audit2/out/G4.csv`
Estado:      **MEDIDO** — `repairNoShade` **queda descartado** como causa

**El parche, exacto.** Sobre el texto de la FÍSICA PURA extraído del fichero —no
sobre el fichero— se sustituye el **cuerpo** de `repairNoShadeCore`
(`backtracking.html:3103`, 241 líneas, 14 961 caracteres) por la identidad
`{ return ang; }`. La envoltura `repairNoShade` (`backtracking.html:3098-3102`)
queda intacta, para que la marca `sinReparar` y el tipo de retorno no cambien:

```js
function repairNoShade(zen,az,T,ang,irr,doy,albedo){
  const out=repairNoShadeCore(zen,az,T,ang,irr,doy,albedo);
  if(!(irr&&irr.ghi>0)){try{Object.defineProperty(out,'sinReparar',{value:true,enumerable:false});}catch(e){}}
  return out;
}
```

Se parchea el núcleo y no la envoltura porque el contrato de retorno de la
envoltura forma parte de lo que se compara. Comprobación del parche:
`repairNoShadeCore` parcheado devuelve **el mismo objeto** que recibe (identidad
estricta `===`).

**Los tres controles, antes del resultado.**

| control | qué exige | medido |
|---|---|---|
| **1 · identidad sin parche** | el motor reconstruido sin parchear reproduce `G1_js.json` | \|Δθ\| máx sobre 540 valores = **0,000e+0** — idéntico dígito a dígito |
| **2 · políticas sin la etapa** | `astro` (3363), `global` (3364), `bt2d` (3365) y `row` (3366) no la llaman, así que no pueden moverse | \|Δθ\| máx sobre 240 valores = **0,000e+0** — el parche no toca de más |
| **3 · TEST NULO** | desactivarla tiene que cambiar *algo*, o la comparación no informa | mueve el θ en **3 de 30** combinaciones (10,0 %), \|Δθ\| máximo **34,5000°** ⇒ **el predicado no es constante: informa** |

**El resultado.** \|Δθ\| contra `tracker3d.py`, con la etapa activa y desactivada:

| caso | política | n | \|Δθ\| máx CON | \|Δθ\| máx SIN | mediana CON | mediana SIN | \|ΔPOA\| máx CON | SIN |
|---|---|---|---|---|---|---|---|---|
| A | las 7 comparables | 30 | 0,0000° | 0,0000° | 0,0000° | 0,0000° | 6,476–22,182 | igual |
| B | astro | 30 | 0,7963° | 0,7963° | 0,0000° | 0,0000° | 161,170 | 161,170 |
| B | global | 30 | 0,8374° | 0,8374° | 0,0753° | 0,0753° | 161,170 | 161,170 |
| B | row | 30 | 7,8953° | 7,8953° | 0,5262° | 0,5262° | 161,170 | 161,170 |
| B | **pairwise** | 30 | **65,0000°** | **65,0000°** | 0,7528° | 0,7528° | 428,283 | 428,283 |
| B | **true3d** | 30 | **57,0000°** | **55,0000°** | 16,7995° | 16,7995° | 373,773 | 373,773 |
| B | **mgl** | 30 | **65,0000°** | **65,0000°** | 0,7528° | 0,7528° | 428,283 | 428,283 |
| B | optimal | 30 | 16,8262° | 16,8262° | 0,4660° | 0,4660° | 161,170 | 161,170 |

**Las 14 divergencias mayores, una a una** (tolerancia declarada para «cae»:
\|Δθ\| < 1,0°):

| # | caso | hora | política | fila | θ JS CON | θ JS SIN | θ PY | \|Δθ\| CON | \|Δθ\| SIN | ¿cae? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1-4 | B | 18:30 | pairwise | 0,1,3,4 | 10,00° | **10,00°** | −55,00° | 65,000° | **65,000°** | no |
| 5-8 | B | 18:30 | mgl | 0,1,3,4 | 10,00° | **10,00°** | −55,00° | 65,000° | **65,000°** | no |
| 9-11 | B | 09:00 | pairwise | 0,1,4 | −2,00° | **−2,00°** | 55,00° | 57,000° | **57,000°** | no |
| 12-14 | B | 09:00 | true3d | 0,1,4 | −2,00° | **0,00°** | 55,00° | 57,000° | **55,000°** | no |

```
  de las 14 mayores, caen por debajo de 1.0° al desactivar la etapa: 0 de 14
  |Δθ| máximo RESIDUAL en toda la rejilla, con la etapa desactivada: 65.0000°
  |Δθ| máximo con la etapa ACTIVA (E-G1):                            65.0000°
```

> **`repairNoShade` queda descartado.** Ninguna de las 14 cae, el máximo residual
> es **el mismo número** (65,0000°) y en 11 de las 14 el θ del JS **no se mueve
> en absoluto** al desactivar la etapa: en esos instantes la etapa no estaba
> actuando. Sólo las tres filas de `true3d` a las 09:00 se mueven, y de −2,00° a
> 0,00°, que **reduce** el \|Δθ\| de 57° a 55° sin acercarlo a la tolerancia.

**CORRECCIÓN A E-G3.** Ese ítem concluye que, descartados el umbral de deferral y
el acople, «`repairNoShade` queda como el único candidato en pie», y observa que
las 14 divergencias mayores son todas de políticas que lo llevan. La observación
es cierta pero **no era prueba**: medido aquí, esas políticas divergen por otra
razón. Con este experimento **los tres candidatos del auditor quedan descartados**
y el hueco (d) sigue **ABIERTO sin candidato**.

Notas: la rejilla es la de E-G1 (2 casos × 5 instantes × 9 políticas); `bt2d` y
`optfree` siguen sin contraparte. El parche anula la etapa **entera**; no se ha
explorado desactivar partes de ella. No se ha buscado el candidato siguiente.

### E-G5  Caracterización de las divergencias JS ↔ `tracker3d.py`

Commit:      3a57451
Script:      `audit2/G5_caracteriza.mjs`
Comando:     `node audit2/G5_caracteriza.mjs`
Node:        v22.22.2
Salida:      `audit2/out/G5.txt` · CSV `audit2/out/G5.csv` (420 filas)
Estado:      **MEDIDO**

Descartados los tres candidatos (E-G3, E-G4), este ítem **describe** la
divergencia; no propone causa. Sin cómputo nuevo: relee `G1_js.json` y
`G1_py.json` y recalcula la columna del parche con el mismo procedimiento de
E-G4. Rejilla: 2 casos × 5 instantes × 9 políticas × 6 filas = **420 valores**,
de los cuales 420 − 120 (bt2d y optfree sin contraparte) = **300 comparables**.

**1.1 · Las 14 divergencias mayores.**

| # | caso | hora | política | fila | elev | azimut | torsión | θ_JS | θ_PY | Δθ con signo | ΔPOA | ¿se movió sin repair? (fila / política) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1-4 | B | 18:30 | pairwise | 0,1,3,4 | 32,75° | 273,56° | 7,437° | +10,00° | −55,00° | **+65,000°** | −428,283 | no / no |
| 5-8 | B | 18:30 | mgl | 0,1,3,4 | 32,75° | 273,56° | 7,437° | +10,00° | −55,00° | **+65,000°** | −428,283 | no / no |
| 9-11 | B | 09:00 | pairwise | 0,1,4 | 25,32° | 80,27° | 7,437° | −2,00° | +55,00° | **−57,000°** | −286,389 | **no / SÍ** |
| 12-14 | B | 09:00 | true3d | 0,1,4 | 25,32° | 80,27° | 7,437° | −2,00° | +55,00° | **−57,000°** | −286,389 | SÍ / SÍ |

La columna del parche se da **por fila y por política**: en las filas 9-11 el θ de
esa fila no se mueve al desactivar `repairNoShade`, pero el vector de la política
sí cambia en otras filas. E-G4 lo reporta por fila; las dos tablas coinciden.

**1.2 · Comparaciones numéricas.**

**(a) ¿Más empinado o más plano?** Δθ = θ_JS − θ_PY. El signo de Δθ **no** es
«más empinado», porque θ>0 y θ<0 son lados distintos del eje; se dan los dos
indicadores:

| conjunto | n | Δθ>0 | Δθ<0 | Δθ=0 | media con signo | \|θ_JS\|>\|θ_PY\| | \|θ_JS\|<\|θ_PY\| | lectura |
|---|---|---|---|---|---|---|---|---|
| las 14 mayores | 14 | 8 | 6 | 0 | +12,7143° | **0** | **14** | el JS va más plano |
| rejilla con Δθ ≠ 0 | 148 | 67 | 81 | 0 | −1,5582° | 45 | **103** | el JS va más plano |
| rejilla completa | 420 | 67 | 81 | 272 | −0,5491° | 45 | **103** | el JS va más plano |

El **signo de Δθ alterna** (8 contra 6 en las 14; 67 contra 81 en la rejilla),
pero el **módulo no**: en las 14 mayores, |θ_JS| < |θ_PY| en **14 de 14**, y en
toda la rejilla en 103 de 148. El JS publica ángulos **más cercanos al plano**.

**(b) Concentración por política.**

| política | en las 14 | en la rejilla (Δθ≠0 / total) | \|Δθ\| máx |
|---|---|---|---|
| astro | 0 | 12 / 60 | 0,7963° |
| global | 0 | 18 / 60 | 0,8374° |
| row | 0 | 18 / 60 | 7,8953° |
| bt2d | 0 | NO COMPARABLE | — |
| **pairwise** | **7** | 27 / 60 | **65,0000°** |
| **true3d** | **3** | 28 / 60 | **57,0000°** |
| **mgl** | **4** | 27 / 60 | **65,0000°** |
| optimal | 0 | 18 / 60 | 16,8262° |
| optfree | 0 | NO COMPARABLE | — |

Las 14 se reparten entre **pairwise, true3d y mgl**, que son exactamente las tres
que llevan `repairNoShade` — pero E-G4 mide que desactivarla no las mueve.
`astro`, `global` y `optimal` se quedan por debajo de 0,84°; `row` llega a 7,90°.

**(c) Relación con la torsión.**

| torsión | n | Δθ≠0 | \|Δθ\| máx | mediana |
|---|---|---|---|---|
| 0,000° (caso A) | 210 | **0** | 0,0000° | 0,0000° |
| 7,437° (caso B) | 210 | **148** | 65,0000° | 0,3682° |

Rango de torsión de las 14: 7,437…7,437°. De la rejilla: 0,000…7,437°.
**La rejilla sólo tiene dos valores de torsión**, así que no admite ajuste ni
tendencia: lo único afirmable es en cuál de los dos aparecen las divergencias —
todas en el de 7,437°.

**(d) Signos de θ_JS y θ_PY.** Apuntan a **lados opuestos del eje en 14 de 14**:
`10/−55` ×8 y `−2/55` ×6. No es una diferencia de magnitud sobre el mismo lado;
los dos motores mandan el tracker a lados contrarios.

**1.3 · ¿Divergencia sin torsión?**

```
      valores de la rejilla con torsión N-S = 0 : 210  (el caso A entero)
      de ellos, con |Δθ| > 0 : 0
      ⇒ divergencia SIN torsión: NO EXISTE en la rejilla medida.
```

El caso A tiene tilt N-S 0 en las seis filas (`audit2/lib_motor.mjs`, función
`caso`: `tilts.push(cual === 'B' ? (r() * 2 - 1) * 4 : 0)`, y el eco de la corrida
lo confirma: «caso A · tilt N-S 0.00 ×6»), y ahí **los 210 valores dan Δθ = 0
exacto**. La divergencia sólo aparece con torsión.

Notas: `NO EXISTE en la rejilla medida` no es `NO EXISTE`: la rejilla tiene dos
casos, cinco instantes y un solo valor de torsión no nula. No se ha explorado
torsión intermedia ni otros azimuts de eje.

---

# BLOQUE H — EL SISTEMA DE VERIFICACIÓN

### E-H1  El gate de CI trata `cancelled` igual que `failure`

Commit:      3a57451 · árbol de la rama al medir: `d64e2cb`
Comando:     `mcp github actions_list` sobre `bancos.yml`, rama `claude/backtracking-6th1im`,
             y `get_job_logs` del job 105554114569
Node:        v22.22.2 (la medida es de la API de GitHub, no de un script)
Salida:      `audit2/out/H1_runs.txt`
Estado:      **MEDIDO** · no se corrige: `.github/` no se toca

**La política de concurrencia**, `.github/workflows/bancos.yml:33-35`:

```yaml
concurrency:
  group: bancos-${{ github.ref }}
  cancel-in-progress: true
```

**El gate**, `.github/workflows/bancos.yml:311-333`:

```yaml
  puerta:
    name: bancos en verde
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: [nucleo, powershell, datos, barrido, navegador]
    if: always()
    steps:
      - name: ninguno ha fallado
        run: |
          for j in "nucleo ${{ needs.nucleo.result }}" \
                   "powershell ${{ needs.powershell.result }}" \
                   "datos ${{ needs.datos.result }}" \
                   "barrido ${{ needs.barrido.result }}" \
                   "navegador ${{ needs.navegador.result }}"; do echo "$j"; done
```

El `if: always()` hace que el gate corra aunque sus dependencias se cancelen, y
la comparación exige `== success` en los cinco. Un `cancelled` no es `success`,
así que el gate sale en rojo.

**El caso observado.** Run 35330463872 sobre `dfda36c`, log del job 105554114569:

```
nucleo success
powershell success
datos cancelled
barrido cancelled
navegador cancelled
##[error]hay bancos que no han pasado
##[error]Process completed with exit code 1.
```

Tres jobs en `cancelled`, **ninguno en `failure`**. La cancelación la provocó el
push de `d64e2cb`, que entró en el mismo grupo de concurrencia 47 s después.

**Segundo caso, observado mientras se redactaba este ítem.** Run 35330672062
sobre `d64e2cb`, job 105556506944:

```
nucleo success
powershell success
datos cancelled
barrido cancelled
navegador success
##[error]hay bancos que no han pasado
##[error]Process completed with exit code 1.
```

Aquí `navegador` **sí llegó a terminar en `success`** antes de la cancelación:
sólo dos jobs quedaron en `cancelled` y el gate salió en rojo igual. Lo canceló el
push de `467c941`. Confirma que basta **un** `cancelled` para el rojo, sin que
ningún banco haya fallado.

**Nota sobre la frecuencia futura.** La regla M.3 de esta auditoría pide
commitear y empujar al cerrar cada bloque. Cada push entra en el mismo grupo de
concurrencia y cancela el anterior, así que el 13,3 % medido **subirá** mientras
dure este modo de trabajo. Es una consecuencia de la cadencia de trabajo, no del
contenido de los commits, y se registra para que no se lea como degradación de
los bancos.

**Asimetría medida entre el run y el check.** La conclusión del *run* es
`cancelled`; la del *check run* «bancos en verde» que se publica en el PR es
`failure`. Un consumidor que mire el check —el PR, o una automatización
suscrita a `check_run.completed`— ve un fallo donde el run dice cancelación.

**Frecuencia en el historial reciente.** Se han examinado **30 runs** de
`bancos.yml` en la rama `claude/backtracking-6th1im`, ventana
**2026-09-11T10:06 → 2026-09-18T09:39**:

| conclusión del run | nº |
|---|---|
| `success` | 24 |
| `cancelled` | **4** |
| `failure` | 1 |
| en curso al medir | 1 |

Los cuatro `cancelled`, con su commit y su run:

| fecha | commit | run |
|---|---|---|
| 2026-09-18T09:37 | `dfda36c` | 35330463872 |
| 2026-09-16T15:01 | `37a911e` | 35112473824 |
| 2026-09-16T13:40 | `d3732ae` | 35103411778 |
| 2026-09-13T10:58 | `b42214e` | 34753232999 |

**4 de 30 runs (13,3 %)** en esa ventana acabaron cancelados por la política de
concurrencia. El único `failure` de run es de `0742bbe` (2026-09-11T11:49, run
34595882409), anterior a la ventana de trabajo de esta auditoría y no examinado.

**Recuento al cerrar la auditoría.** Durante la ronda de cierre, trabajando con la
cadencia de M.3, se han observado **cuatro** casos con el log inspeccionado, todos
con el mismo patrón —ningún `failure`, sólo `cancelled`— y todos causados por el
push siguiente de esta misma sesión:

| run | commit cancelado | lo canceló | jobs en `cancelled` |
|---|---|---|---|
| 35330463872 | `dfda36c` | `d64e2cb` | datos, barrido, navegador |
| 35330672062 | `d64e2cb` | `467c941` | datos, barrido (navegador llegó a `success`) |
| 35331432509 | `467c941` | `796bdde` | datos, barrido, navegador |
| 35334693199 | `acec1c3` | `a4c5545` | datos, barrido, navegador |

El único head que completó corrida sin ser superado, `796bdde`, salió **verde
24/24** (run 35331552512): ninguno de los cuatro rojos correspondía a un banco
roto.

Notas: los cuatro casos de la ronda de cierre tienen log inspeccionado; de los
cuatro `cancelled` de la tabla histórica, dos coinciden con estos y los otros dos
(`37a911e`, `d3732ae`, `b42214e`) siguen como **NO VERIFICADO** en cuanto a si
produjeron check en rojo, aunque el gate es el mismo. La ventana es de una rama y de 30 runs, no del
repositorio entero. No se propone corrección: `.github/` está fuera del alcance.

---

# BLOQUE X — CORRECCIONES DE LA PROPIA AUDITORÍA

### E-X1  Correcciones a ítems ya publicados

Commit:      3a57451
Comando:     lecturas y `grep`; los números proceden de los ítems que se citan
Estado:      **MEDIDO** (documental)

Registro de las afirmaciones que esta auditoría publicó y luego tuvo que
corregir. Se recogen aquí juntas porque una auditoría que se corrige a sí misma
tiene que dejar constancia de qué dijo antes, no sólo de lo que dice ahora.

**1 · E-G1 — «las divergencias se concentran en sol bajo»**

| | |
|---|---|
| **qué decía** | «Las divergencias se concentran en **sol bajo** (07:30, 09:00, 18:30). A sol alto (12:00 y 16:00) el \|Δθ\| máximo … es 0,7530°.» |
| **qué dice ahora** | «Las divergencias se concentran en los instantes 07:30, 09:00 y 18:30», con una nota que remite a E-G3 |
| **qué la motivó** | E-G3 midió la elevación solar de cada instante de la rejilla: 07:30 → **9,28°**, 09:00 → **25,32°**, 12:00 → 58,30°, 16:00 → 59,98°, 18:30 → **32,75°**. Sólo uno de los tres es de sol bajo |
| **qué cambia** | el máximo \|Δθ\| cae en la banda **20-40°**, no por debajo de 10°. Medido en E-G3: banda <10° máximo 44,1346°; banda 20-40° máximo **65,0000°**; banda >40° máximo 0,7963° |
| **qué NO cambia** | los números de \|Δθ\| y \|ΔPOA\| de E-G1, que no dependían de la etiqueta |

**2 · E-G3 — «`repairNoShade` queda como el único candidato en pie»**

| | |
|---|---|
| **qué decía** | descartados el deferral y el acople, `repairNoShade` «queda como el único candidato en pie», y las 14 divergencias mayores son todas de políticas que lo llevan |
| **qué dice ahora** | lo mismo, con un recuadro que lo **desmiente** y remite a E-G4 |
| **qué la motivó** | E-G4 ejecutó el JS con la etapa desactivada: **0 de 14** divergencias caen por debajo de 1,0°, el máximo residual es el mismo **65,0000°**, y en **11 de 14** el θ del JS no se mueve |
| **qué cambia** | los **tres** candidatos quedan descartados y el hueco (d) pasa a ABIERTO **sin candidato** |
| **la lección** | la observación de partida era cierta —las 14 son de políticas que llevan la etapa— y **no era prueba**. Coincidencia no es causa, y el experimento que lo separaba estaba a una corrida de distancia |

**3 · La columna `nb = 2` de E-D3**

| | |
|---|---|
| **qué decía** | la columna se importó de la corrida MV 8 de E-D2 «porque son la misma configuración» |
| **qué dice ahora** | remite a E-D6, que ejecutó las dos rutas y comprobó la equivalencia |
| **qué la motivó** | son dos rutas distintas de `mvPara` (`backtracking.html:842-845`), y publicar la equivalencia como hecho era darla por supuesta |
| **qué cambia** | **nada en los números**: las nueve celdas coinciden dígito a dígito. Cambia el estatuto: de supuesto a verificado, y nace la regla M.1 |

**4 · Citas `archivo:línea` desplazadas**

38 citas puntuales estaban desplazadas respecto a la línea que decían señalar
(por ejemplo el veto en 2911 cuando empieza en 2910, o `cands.sort` en 2133
cuando está en 2135). Se corrigieron 29 en una primera pasada manual, y el
verificador de 2.4 encontró **5 más** —tres rutas sin prefijo, una cita ausente y
una de HTML— y **3 defectos en sí mismo**. Estado actual del documento: **0 citas
rotas**, comprobado por `audit2/verifica_citas.mjs`.

**5 · El predicado reescrito a mano de E-C5**

La primera versión de `C5_bisecciones.mjs` reescribía a mano el predicado
`shades(mag)` de `bt3dPairMaxMag` y daba \|Δθ\| de **55°**. Era la copia, no el
motor. El script vigente **extrae el texto de la función del fichero** y sólo le
sustituye el bucle de bisección; el resultado publicado es **\|Δθ\| ≤ 0,04875°**.
De ahí sale la precondición que el encargo impuso a 2.3 y que E-G3 ejecuta.

**6 · La estimación del coste del anual pleno**

Se estimó que el anual pleno de las nueve políticas costaría **~21 h**,
extrapolando desde el coste del diseño reducido con las nueve. Medido en E-D5:
tres políticas cuestan 11 397 s, así que las nueve serían **6-7 h**. La
extrapolación sobrestimaba por un factor de tres.

**7 · Un dato relatado sin verificar**

Se repitió, procedente de otra sesión, que los minutos de GitHub Actions estaban
agotados hasta el 1 de octubre, y se escribió en el cuerpo del PR. **Era falso**:
la comprobación contra GitHub mostró CI ejecutándose con normalidad. Se corrigió
el cuerpo del PR y el hecho quedó registrado en la regla **M.2**.

Notas: este ítem no mide nada nuevo; es el registro de las correcciones. Las
cifras que cita proceden de E-G3, E-G4, E-D5, E-D6, E-C5 y del verificador.

---

# CRÍTICA DEL ENCARGO

Los puntos donde el encargo, tal como está escrito, no se puede ejecutar como
pide o mide otra cosa de la que dice. En cada uno se ha hecho **lo pedido tal cual
y además el planteamiento alternativo**, y los dos están arriba.

### 1 · A.3 «entregando POA/energía por política con 4 decimales»

El manejador del anual imprime con `toFixed(1)` (`backtracking.html:6929`): **no
existe** una salida de 4 decimales que ejecutar «tal cual». Ejecutado lo pedido:
se corre el manejador sin tocarlo y se amplía **sólo la precisión de impresión**
parcheando `Number.prototype.toFixed` en el navegador y restaurándolo al acabar.
Ningún cálculo cambia. Y **energía** no la produce ese manejador: sólo POA en
kWh/m²·año; no hay potencia instalada en ese camino (`NO EXISTE`, con el patrón de
búsqueda declarado en E-A3).

Segundo punto: «tal cual» y «por política» chocan. Al cargar Ayora real la página
apaga los optimizadores (`backtracking.html:4355-4358`), así que «tal cual» son
**dos** políticas, no nueve. Ejecutadas las dos variantes; la de nueve se
interrumpió por coste y queda declarada NO VERIFICADO.

### 2 · D.2 y D.3 piden nueve anuales completos de Ayora real

Coste medido: el anual de Ayora real con dos políticas geométricas tarda 708,4 s;
con las nueve, 38 min de CPU no bastaron para terminarlo. Las nueve variantes que
piden D.2 (4 MV) y D.3 (5 nb) son, por tanto, del orden de **decenas de horas**.

Planteamiento alternativo ejecutado, **declarado en la cabecera de cada corrida**:
mismos parámetros, mismas nueve políticas, mismo bucle (copiado del manejador y
ejecutado dentro de la página con sus propias funciones), pero
**4 días representativos** (21-mar, 21-jun, 21-sep, 21-dic) en vez de 12 y **paso
20 min** en vez de 10, con los pesos renormalizados a 365 días
(`peso(mes) = DIM[mes]·365/Σ DIM de los meses usados`). Es 1/6 del coste. Lo que
esto puede sesgar: el reparto estacional (4 días en vez de 12) y el aliasing del
paso (20 min en vez de 10). La pregunta que D.3 hace —el **orden** de las nueve
políticas— es robusta a ese sesgo sólo si las diferencias entre políticas son
mayores que él. **Eso sí se ha podido calibrar**, aunque no como esperaba: la
variante MV 8 de D.2 resulta ser la misma configuración que la variante 1 de
E-A3 (MV 8, nb 2), de modo que la única diferencia entre las dos es el muestreo
temporal. Medido (E-D2): el diseño reducido baja el nivel absoluto **−0,8622 %**
en pairwise y **−0,8678 %** en true-3D, y la **diferencia relativa** entre las
dos se mueve **0,0057 pp**. El sesgo es de nivel, no de orden. La calibración
cubre dos políticas, no las nueve.

Coste real, para que la cuenta quede con su número: **14 871 s por variante
reducida** (4 h 8 min) con las nueve políticas sobre Ayora real. Las nueve
variantes de D.2 + D.3 son ~37 h de CPU en el diseño reducido, y en el diseño
publicado (12 días, paso 10 min) serían ~6 veces más.

### 3 · C.1 pide «al menos un θ uniforme con sombra de planos = 0»

El enunciado no fija ni el paso del barrido ni la tolerancia de «= 0». Ejecutado
con paso de criba 0,5° y dos tolerancias (1e−9 y 1e−4), las dos declaradas y con
el mismo recuento. Consecuencia declarada: un intervalo de sombra 0 más estrecho
que 0,5° puede escaparse, así que 3 562 es **cota inferior**.

### 4 · C.3 «el peso energético» no está definido en el encargo

«Fracción de energía del barrido en instantes donde el contraejemplo existe» deja
abierto de qué política es esa energía y con qué paso se integra. Ejecutado con
una definición explícita: `poaPlant` con los θ **publicados de pairwise** × 20/60 h,
sumado sobre la muestra de 200 y no sobre los 4 224. Con otra política de
referencia el número cambia.

### 5 · C.3 y C.4 miden sombra, no energía

Los dos ítems buscan posturas de **sombra menor**. Desde v1.57.2 el motor tiene
una guardia incondicional que rechaza la postura sin sombra cuando **cuesta
energía de planta** (`backtracking.html:3338`). Un «contraejemplo» de sombra puede
por tanto ser una decisión deliberada del motor y no un defecto. El experimento
pedido **no lo distingue**; el planteamiento correcto añade la columna de POA de
las dos posturas. No se ha ejecutado esa variante (ver HUECOS): lo que se entrega
es el recuento de sombra que el encargo pide, con esta advertencia.

### 6 · E.1 pide «nº de emisores candidatos tras poda» y el motor no lo publica

No hay contador expuesto. Se ejecutó con una **copia instrumentada en memoria**
del bloque FÍSICA PURA, validada contra el original (|Δ| = 0,000e+0 en los 26
puntos). El fichero del repo no se toca. Y el resultado contradice la premisa del
enunciado: **ningún emisor entra ni sale** en ese tramo.

### 7 · E.3 «di si el argmax se mantiene en 54,25°» presupone un argmax estable

El argmax de ese barrido se mueve con MV en cinco de los siete valores probados
(E-D1, E-E3). Preguntar por MV=128 en aislamiento sugiere que 54,25° es una
propiedad del problema; lo medido es que es una propiedad de **MV=33**.

### 8 · G.1 «sobre la rejilla declarada … las 9 políticas»

Dos de las nueve (`bt2d` y `optfree`) **no existen** en `tracker3d.py`, así que la
rejilla sólo puede ser parcial: 7 de 9. Además, el careo de POA compara dos
contadores de sombra distintos (ray-cast 3D con estructura y malla axial frente a
`compute_shade` sin estructura ni malla): la columna |ΔPOA| **no** mide
discrepancia de transposición aunque lo parezca. Ejecutado igual, con las tres
diferencias estructurales listadas en E-G1.

### 9 · C.5 «las tres bisecciones»

La tercera (penetración de terreno, 3 refinos) **no bisecta en θ**: bisecta la
fracción de cuerda tapada sobre [0,1], y su predicado `terrBlocked` no está
exportado. No es un caso de «raíz única en θ» y no se ha ejecutado como tal.

---

# TESTS NULOS DETECTADOS

Métricas de conteo cuyo predicado resulta constante —del todo o en parte— en el
dominio medido, escritas aquí antes que su cifra.

| ítem | predicado | ¿constante? | consecuencia |
|---|---|---|---|
| **E-C2** | «sombrea» (fs > 1e−9) sobre θ ∈ [−55, 55] | **SÍ en 125 de 200 instantes** (62,5 %): constante **falso** — ningún θ sombrea | en ese 62,5 % contar cruces no informa. El histograma informa sobre la muestra completa sólo porque el nº de cruces toma cuatro valores |
| **E-C5 (1)** | `shades(mag)` de `bt3dPairMaxMag` sobre [0, θmáx] | **SÍ en 1 058 de 1 292** (81,9 %): 1 047 constante falso, 11 constante verdadero | la hipótesis de raíz única sólo se pone a prueba en 234 casos; el resto no informa |
| **E-C4** | «`applyDrive` deja sombra evitable» | NO (9 / 12 / 5 / 7 de 112 según política) | informa; el denominador correcto es **112** (instantes con grupos), no 200: en los 88 monofila `applyDrive` es la identidad |
| **E-C1** | «existe θ uniforme con sombra de planos 0» | NO (3 562 de 4 224) | informa |
| **E-C3** | «existe par contraejemplo del min(\|θ\|)» | NO (75 de 200) | informa |
| **E-C5 (2)** | `max(shadeRows) ≤ 2e−3` en [lo, hi] de cada unidad | NO | informa (0 casos con más de un cruce de 601) |
| **E-E1** | «la lista de emisores candidatos cambia» | **SÍ: constante** en los 26 puntos del tramo | el recuento de «qué emisor entra o sale» no informa: no entra ni sale ninguno |
| **E-A1** | «el veto cambia la ganadora» | medido en **un solo instante** (no cambia) | un punto no es una distribución: no se entrega porcentaje |
| **E-F2** | «el peso por módulos difiere del peso por largo» | NO: **1 600 de 1 600** mesas declaran módulos | descartado antes de medir — si ninguna los declarase, (b) degeneraría a (a) y el Δ sería cero por construcción |
| **E-F2 · caso B** | ídem sobre el caso B | **SÍ, constante**: una mesa por fila y sin `segTilt` | (b) ≡ (a) por construcción ⇒ declarado NO APLICABLE en vez de publicar un cero |

---

# HUECOS

Las 16 entradas de la ronda anterior, reclasificadas una a una. **CERRADA** lleva
el ítem que la cierra. **ABIERTA** lleva: qué falta en una frase ejecutable, el
coste, y qué cifra publicada depende de ella (o `ninguna`).

## CERRADAS

| # | hueco | la cierra | resultado |
|---|---|---|---|
| 1 | **C.3 / C.4 con columna de energía** | **E-C6, E-C7** | ver la redacción (b) abajo |
| 2 | **D.2 · calibración de las políticas que encabezan la tabla** | **E-D5** | offsets de las cuatro: pairwise −0,8622 %, true-3D −0,8678 %, optimal −0,8451 %, optfree −0,8461 %; se reparten en **0,0227 pp** y el ordinal entre ellas es idéntico en los dos diseños |
| 3 | **G.1 · `bt2d` y `optfree`** | **E-G3** | confirmado con cinco patrones de búsqueda: no existen en `tracker3d.py`. Tabla de cobertura de las 9 políticas: 7 comparables |
| 4 | **F.2 en el caso B** | **E-F2** | NO APLICABLE por construcción: una mesa por fila y sin `segTilt`, así que (b) ≡ (a). Declarado en vez de publicar un cero |
| 5 | **A.3 variante 9 políticas** | **E-D5** (parcialmente) | la pregunta de fondo era el coste y la calibración. Medido: el pleno de tres políticas cuesta 11 397 s, así que el de nueve serían 6-7 h — no las ~21 h estimadas. La variante en sí sigue sin ejecutarse, pero ninguna cifra publicada la necesita |
| 6 | **Comprobación de la columna `nb = 2`** (abierto por M.1) | **E-D6** | las nueve celdas coinciden dígito a dígito; E-D3 no se corrige |

## ABIERTAS

| # | hueco | qué falta (frase ejecutable) | coste | cifra publicada que depende |
|---|---|---|---|---|
| 7 | **(c) MV = 33** | abrir el promedio por estaciones de `shadeBand3DAll` e identificar qué hace que la estación j=30 pase de 46,3 % a 0 % en 0,01° de giro | ~4 h de lectura del ray-cast + ~1 h de sonda | **ninguna** — E-E4 acota el fenómeno y ninguna cifra del informe lo usa |
| 8 | **(d) paridad JS↔Python** | ver la redacción abajo | no acotable: es depuración de causa raíz en dos motores | `\|Δθ\| JS↔Python hasta 65° en el caso B` (E-G1), que se publica como medida, no como diagnóstico |
| 9 | **D.2 · MV 16 y 64** | ejecutar las dos variantes del anual reducido | 2 × 4 h 8 min = **8 h 16 min** de compute | **ninguna** — cerradas por decisión del auditor, no por fallo (punto 0.1 del encargo de cierre) |
| 10 | **Calibración de las 5 políticas restantes** | anual pleno de `astro`, `global`, `row`, `bt2d` y `mgl` | ~4-5 h de compute (por extrapolación de E-D5) | `orden de las 9 políticas por nb` (E-D3), publicada con la etiqueta `calibrada en 4 de 9` |
| 11 | **C.1 / C.2 con la semilla 7** | repetir `C_monotonia.mjs` con semilla 7, la otra de CI (`.github/workflows/bancos.yml:189`) | ~30 min de compute | los recuentos de E-C1, E-C2 y E-C3, que se publican con «una semilla» declarado |
| 12 | **F.2 / F.3 · el anual** | anualizar la corrida de un día de `F23_mesa.mjs` | ~6 h de compute | `Δ de transponer por mesa +0,3524 %` (E-F2), publicada como `INDICIO DIMENSIONADO · un día, no anualizado`; y la de E-F3, **no publicable por dominio** |
| 13 | **F.2 · separar tilt de peso** | repetir la variante (b) cambiando sólo el tilt por mesa, y luego sólo el peso por módulos | ~2 × 1 h de compute | la misma de la fila 12 |
| 14 | **A.1 · veto con `prev` definido** | recorrer un día encadenando `prev` para ejercitar la histéresis y el salto del veto (`backtracking.html:2910`) | ~20 min de compute | **ninguna** — E-A1 declara que mide un instante con `prev` sin definir |
| 15 | **A.2 · ascenso con `T.groups` y a lo largo de un día** | repetir `A2_ascenso_optfree.mjs` con drive bifila y sobre un día | ~30 min de compute | **ninguna** — E-A2 declara su alcance |
| 16 | **B · políticas distintas de pairwise y true-3D** | repetir `B1_caso_b_dos_commits.mjs` con las otras siete | ~10 min de compute | **ninguna** — E-B1 declara que cubre dos |
| 17 | **C.5 (3) · penetración de terreno** | exportar `terrBlocked` o instrumentarlo, y comparar los 3 refinos contra un barrido fino de la fracción de cuerda | ~2 h de lectura + ~1 h de sonda | **ninguna** — no bisecta en θ y su resolución (1/16 de cuerda) es conocida por construcción |
| 18 | **Páginas publicadas (GitHub Pages)** | comprobar lo desplegado contra `origin/main` desde una red con salida a Pages | ~10 min, requiere red | **ninguna** — se usa `origin/main` como referencia, declarado |

## Redacciones fijadas por el auditor

### (b) La regla del min(\|θ\|) — **CERRADA** por E-C3, E-C6 y E-C7

El enunciado tiene **dos partes que no se funden**:

1. **El enunciado geométrico es FALSO.** `backtracking.html:208`, `651-654`,
   `824-827` y `2672-2675` afirman que reducir \|θ\| desde un ángulo de
   backtracking «nunca crea sombra». Medido: la crea en **75 de 200 instantes**
   de la muestra, que pesan el **22,79 %** de la energía del barrido.
2. **La regla derivada es energéticamente favorable.** El θ que la regla elige
   gana energía en **74 de 75** casos medidos, con mediana **+257,47 W/m²**, y el
   único caso adverso cuesta **0,0044 W/m²** — cinco órdenes de magnitud por
   debajo de la mediana de la ganancia.

Sobre el acople real, **ΔPOA > 0 en las 41 celdas** de las dos poblaciones, y eso
incluye `astro` y `row`, que **no llaman a `repairNoShade`**
(`backtracking.html:3363` y `3366`): no es la guardia de energía la que lo
explica en esas dos.

### (c) El escalón de MV = 33 — **ABIERTA**

La cuadratura adaptativa puede introducir discontinuidades en la fracción
sombreada; medido en MV = 33 con la estación **j = 30** aportando **46,285 pp**
mientras las otras 32 se mueven **menos de 0,03 pp**; hipótesis de la paridad
**refutada** (MV 65 es impar y no lo reproduce); reparto por alas **descartado**
(el ala 0 está a 0,0000 % en los tres MV); `mvPara` devuelve impares en el
**39,2 %** de su dominio; **causa NO IDENTIFICADA**. No se persigue más en esta
ronda; su coste está en la fila 7.

### (d) Paridad JS ↔ `tracker3d.py` — **ABIERTA**

Dos implementaciones declaradas espejo divergen hasta **65,0000°** en el rango
**20-40°** de elevación solar. Los tres candidatos declarados quedan **descartados
por medida**: deferral (mismo 82° en ambos, E-G3), acople (`drive:'mono'`,
`groups:null` en ambos, E-G3) y `repairNoShade` (**0 de 14** divergencias caen al
desactivarla, máximo residual idéntico **65,0000°**, y en **11 de 14** el θ del JS
no se mueve, E-G4). La divergencia **no procede de una etapa que sobre en un
lado**: el cálculo base difiere. **Causa NO IDENTIFICADA**. `bt2d` y `optfree` no
existen en `tracker3d.py`.

Lo que E-G5 añade a la descripción, para quien vaya a buscarla: las 14 mayores
apuntan a **lados opuestos del eje en 14 de 14**; \|θ_JS\| < \|θ_PY\| en **14 de
14** y en **103 de 148** de la rejilla, o sea el JS publica ángulos más cercanos
al plano; con torsión N-S = 0 el Δθ es **cero exacto en los 210 valores** del caso
A, así que la divergencia **sólo aparece con torsión** — con la salvedad de que la
rejilla sólo tiene dos valores de torsión y no admite tendencia.
