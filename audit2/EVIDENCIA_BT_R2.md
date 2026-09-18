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

con `semilla: [1, 7]` (`bancos.yml:189`). Esta corrida usa **semilla 1**.


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

### E-D3  Anual de Ayora real con nb forzado: orden de las políticas — PARCIAL

Commit:      3a57451
Script:      `audit2/D23_anual_variantes.mjs`
Comandos:    `node audit2/D23_anual_variantes.mjs 20 --dias=2,5,8,11 --solo=D.3 --vars=0,1,2 --etiqueta=_D3a`
             `node audit2/D23_anual_variantes.mjs 20 --dias=2,5,8,11 --solo=D.3 --vars=3,4 --etiqueta=_D3b`
Node:        v22.22.2
Salida:      `audit2/out/D3a.txt`, `audit2/out/D3b.txt`
Estado:      **MEDIDO** para nb 0, 2 y 3 · **NO VERIFICADO** para nb 1 y nb 6

`nb` se fuerza con `T.nBypass` y el mismo valor en `Tcfg`. Con `nb = 0`,
`elecLoss` es lineal y no hay escalón de diodos (`backtracking.html:628-632`).
Mismo diseño reducido y mismos parámetros que E-D2; MV sin forzar, o sea **8** por
`if(T.real)`. La columna nb = 2 es la corrida MV 8 de E-D2 (misma configuración).

Energía anual, kWh/m²·año:

| política | nb = 0 | nb = 2 | nb = 3 |
|---|---|---|---|
| astro | 2743,9536 | 2631,8894 | 2673,1460 |
| global | 2707,4372 | 2643,3184 | 2667,3713 |
| row | 2706,7388 | 2648,8196 | 2670,0694 |
| bt2d | 2707,3194 | 2640,7619 | 2666,0507 |
| pairwise | 2298,1223 | 2293,5007 | 2295,2661 |
| true3d | 2283,0564 | 2278,7642 | 2280,3449 |
| mgl | 2331,1919 | 2326,5231 | 2328,3046 |
| optimal | 2743,9536 | 2666,4889 | 2686,0193 |
| optfree | 2743,9607 | 2668,3689 | 2686,7296 |

**ORDEN por energía anual, una columna por nb:**

| puesto | nb = 0 | nb = 2 | nb = 3 |
|---|---|---|---|
| 1 | optfree | optfree | optfree |
| 2 | **astro** ≡ optimal | optimal | optimal |
| 3 | global ← **CAMBIA** | **row** ← **CAMBIA** | **astro** ← **CAMBIA** |
| 4 | bt2d ← **CAMBIA** | global ← **CAMBIA** | row ← **CAMBIA** |
| 5 | row ← **CAMBIA** | bt2d ← **CAMBIA** | global ← **CAMBIA** |
| 6 | mgl | **astro** ← **CAMBIA** | bt2d ← **CAMBIA** |
| 7 | pairwise | mgl | mgl |
| 8 | true3d | pairwise | pairwise |
| 9 | — | true3d | true3d |

**El orden cambia con nb.** `astro` se mueve del puesto 2 (nb = 0) al 6 (nb = 2) y
vuelve al 3 (nb = 3): **cuatro puestos de recorrido** por un parámetro del modelo
eléctrico. `global`, `row` y `bt2d` permutan entre sí en los tres casos. Lo que
**no** cambia: `optfree` es primero en los tres, y `pairwise` y `true3d` son
últimos en los tres.

Con **nb = 0** (pérdida lineal, sin escalón de diodos), `astro` y `optimal` dan
**el mismo número hasta el cuarto decimal**: 2743,9536 kWh/m²·año, y `optfree`
sólo les saca 0,0071 (2743,9607). Con nb = 2 y nb = 3 se separan.

Notas: **tres de los cinco nb** que pide el encargo; faltan nb = 1 y nb = 6,
todavía calculando. El diseño es el reducido de E-D2, con el sesgo de −0,86 %
medido allí sobre el nivel absoluto y de 0,0057 pp sobre la comparación entre
políticas. Un solo año, cielo claro, sin lazo de control.

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

y quien lo lee, `backtracking.html`:

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

Las divergencias se concentran en **sol bajo** (07:30, 09:00, 18:30). A sol alto
(12:00 y 16:00) el |Δθ| máximo de todas las políticas comparables del caso B es
**0,7530°**.

Diferencias estructurales que el careo NO neutraliza, y que hay que tener
presentes al leer las columnas de POA:

1. El JS mide la sombra con el **ray-cast 3D multi-emisora con estructura** (viga
   y canto) y malla axial MV; el Python con `compute_shade`, sin estructura y sin
   malla axial. Por eso |ΔPOA| es no nulo incluso donde |Δθ| = 0.
2. El tilt de transposición: el Python usa
   `terrain.pairs[min(r, n_pairs-1)].axis_tilt_deg` (`tracker3d.py:1631`), el JS
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

Lo que el encargo pide y **no** se ha ejecutado, con la razón.

| ítem | estado | razón |
|---|---|---|
| **A.3 variante 9 políticas** | NO VERIFICADO | detenida a los 38 min de CPU sin terminar; coste del orden de horas (medido en E-A3) |
| **D.2 · MV 16, 32 y 64** | NO VERIFICADO | 14 871 s por variante medidos (4 h 8 min); MV 8 sí está en E-D2, y el efecto de MV sobre el argmax está medido aparte en E-D1 |
| **D.3 · nb 1 y nb 6** | NO VERIFICADO | ídem; nb 0, 2 y 3 sí están en E-D3, y el cambio de orden queda documentado con esos tres |
| **C.3 / C.4 con columna de energía** | NO EJECUTADO | el encargo pide sólo sombra; la variante con POA de las dos posturas es la corrección de la CRÍTICA nº 5 y no dio tiempo |
| **C.1 / C.2 con la semilla 7** | NO EJECUTADO | CI corre las semillas 1 y 7 (`bancos.yml:189`); sólo se ha corrido la 1 |
| **C.5 (3)** penetración de terreno | NO EJECUTADO | `terrBlocked` no exportado y no bisecta en θ (CRÍTICA nº 9) |
| **E.1 · mecanismo de la cuadratura para MV impar** | NO VERIFICADO | se ha medido que el escalón es exclusivo de MV = 33 y que la poda no cambia; **no** se ha abierto el promedio por estaciones para explicar por qué |
| **F.2 / F.3 · el ANUAL** | NO VERIFICADO | E-F2 y E-F3 miden **un día** (21-jun, paso 20 min), no el anual que pide F.2; mismo motivo de coste |
| **F.2 en el caso B** | NO APLICABLE | el caso B tiene **una mesa por fila y sin `segTilt`**: la variante (b) coincide con (a) por construcción — sería un test nulo, no una medida |
| **F.2 · separar tilt de peso** | NO EJECUTADO | el experimento cambia el tilt por mesa y el peso por módulos a la vez, como pide el enunciado; no se ha aislado cuánto aporta cada uno |
| **G.1 · `bt2d` y `optfree`** | NO EXISTE en `tracker3d.py` | búsqueda exhaustiva con `grep -nE "bt2d\|optfree\|free\|per_unit"` ⇒ sin coincidencias |
| **G.1 · origen de las divergencias a sol bajo** | NO VERIFICADO | el ítem las mide (hasta 65° en pairwise del caso B); no se ha investigado la causa |
| **A.1 · veto con `prev` definido** | NO VERIFICADO | la corrida usa un instante aislado (`prev` sin definir), así que la histéresis y el salto del veto (`backtracking.html:2910`) no se ejercitan |
| **A.2 · ascenso a lo largo de un día y con `T.groups`** | NO VERIFICADO | medido en un instante y con `drive: 'mono'` (6 unidades de una fila) |
| **B · políticas distintas de pairwise y true-3D** | NO VERIFICADO | E-B1 cubre esas dos |
| **Páginas publicadas (GitHub Pages)** | NO VERIFICADO | el `fetch` a Pages devuelve `curl: (56) CONNECT tunnel failed, response 403` desde este contenedor; se usa `origin/main` como referencia de lo publicado |
