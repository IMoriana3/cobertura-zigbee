# ANATOMÍA DEL SIMULADOR DE BACKTRACKING

**Documento de reconocimiento para auditoría externa.** Describe lo que el código
hace, con cita de `archivo:línea`. No contiene valoraciones ni recomendaciones.

## Estado auditado

| | |
|---|---|
| Repo | `cobertura-zigbee` |
| Rama | `claude/backtracking-6th1im` |
| Commit | `3a57451` — «v1.68: el agrupador proyecta sobre el eje, y el paso declarado destapa las bandas desplazadas» |
| `VER` en el fichero | `v1.68.0` (`backtracking.html:459`) |
| `main` publicado | `1227252`, `VER = v1.67.0` |

**Advertencia sobre el estado.** El commit auditado **no es** el publicado en
`main`: va un cambio por delante (PR #684, abierto y sin fusionar en el momento
de escribir esto). Además, antes de empezar se apartó del árbol de trabajo un
cambio sin comprometer (una tarjeta de HUD), para que la auditoría describa un
estado definido y reproducible; ese cambio **no** está en lo que se describe
aquí. Quien repita estas medidas debe situarse en `3a57451`.

Convenciones del documento: `NO ENCONTRADO` = se buscó y no aparece;
`NO VERIFICADO` = aparece pero no se ha comprobado su comportamiento en ejecución.

---

# BLOQUE 1 — MAPA Y LINAJE

## 1.1 Archivos que componen el motor

| Archivo | Papel |
|---|---|
| `backtracking.html` | Página entera: física, aplicación, escena 3D, corte 2D, HUD, curvas, informes. Contiene el bloque **FÍSICA PURA** |
| `sol.js` | Posición solar NOAA, `singleaxis` de pvlib, estética de luz/cielo |
| `irradiancia.js` | Extraterrestre (Spencer 1971), masa de aire (Kasten & Young 1989), cielo claro Ineichen-Perrin, orientación de pala |
| `seguidor.js` | Geometría y materiales del seguidor para los visores 3D (cotas y piezas) |
| `lib/three.min.js`, `lib/OrbitControls.js`, `lib/leaflet.js`, `lib/GLTFLoader.js` | Librerías locales |
| `docs/algoritmos_backtracking.html` | Documentación de algoritmos (441 líneas) |
| `tools/*.mjs` | Bancos y herramientas (ver bloque 10) |

**Delimitación del bloque FÍSICA PURA**, declarada en el propio fichero:

```
backtracking.html:427-448
/* ═══════════════════════════════════════════════════════════════════════════
   FÍSICA PURA — de aquí a FIN-FÍSICA no se toca el DOM.
```

```
backtracking.html:4006
/* FIN-FÍSICA ═══════════════════════════════════════════════════════════════ */
```

Es decir: **líneas 427 a 4006** de `backtracking.html` (3.580 líneas). La QA de
Node extrae exactamente ese tramo; ver bloque 10.2.

## 1.2 Líneas por archivo y por bloque funcional

| Archivo | Líneas |
|---|---|
| `backtracking.html` | 7.983 |
| `seguidor.js` | 680 |
| `sol.js` | 209 |
| `irradiancia.js` | 91 |
| `docs/algoritmos_backtracking.html` | 441 |
| `tools/test_backtracking_sim.mjs` | 4.390 |
| `tools/barrido_terrenos.mjs` | 401 |
| `tools/test_render_sol.mjs` | 266 |
| `tools/careo_produccion.mjs` | 136 |

Bloques funcionales de `backtracking.html`, por sus propias cabeceras de sección
(línea de inicio → línea anterior a la siguiente cabecera):

| Línea | Sección | Líneas aprox. |
|---|---|---|
| 427 | FÍSICA PURA (cabecera) | 35 |
| 462 | Posición solar NOAA (vive en `sol.js`) | 25 |
| 487 | Cielo claro, masa de aire, orientación de pala (en `irradiancia.js`) | 48 |
| 535 | `pvlib.tracking.singleaxis` Eq. 14 (en `sol.js`) | 7 |
| 542 | Sombra entre filas: geometría exacta en el plano ⊥ eje | 92 |
| 634 | Terreno | 15 |
| 649 | Accionamiento: monofila / bifila rígida / bifila quebrada | 165 |
| 814 | Políticas de ángulo | 518 |
| 1332 | Implantación a lo largo del eje | 135 |
| 1467 | Planta REAL desde cotas X,Y,Z | 927 |
| 2394 | POA por fila (Perez 1990) | 159 |
| 2553 | POR MESA (fila medida), no por línea | 174 |
| 2727 | Rejilla fina e histéresis | 675 |
| 3402 | QA autocontenida | 396 |
| 3798 | Nubosidad | 10 |
| 3808 | Modo manual | 8 |
| 3816 | Producción por fila en color | 11 |
| 3827 | El probador | 179 |
| 4006 | **FIN-FÍSICA** | — |
| 4008 | APLICACIÓN (DOM, escena, curvas) | — |
| 5142 | Escena: corte transversal | 304 |
| 5446 | Escena 3D (three.js local) | 1.250 |
| 6696 | HUD | 92 |
| 6788 | Curvas | 63 |
| 6851 | Tabla del día | 50 |
| 6901 | Estimación anual | 48 |
| 6949 | Informe del emplazamiento | 131 |
| 7080 | El probador en pantalla | — |

## 1.3 Relación con `tracker3d.py`

El Python **sí es accesible** desde esta sesión:

```
/home/user/SolarGPTfull/solargpt/solargpt_core/tracker3d.py   (2.186 líneas)
```

La declaración de paridad está escrita en la cabecera de la sección de políticas:

```
backtracking.html:814
/* ── políticas de ángulo — mismas semánticas que tracker3d.py ────────────── */
```

y en la de POA:

```
backtracking.html:2394
/* ── POA por fila (Perez 1990) — espejo de compute_bt3d_poa_per_row ──────── */
```

**Test de paridad automatizado entre el JS y el Python: NO ENCONTRADO.** No hay
en `tools/` ningún banco que importe o ejecute `tracker3d.py` ni que compare sus
salidas; lo que existe son bancos JS contra oráculos JS (bloque 10). La paridad
está afirmada en comentarios, no ejercitada por un test, hasta donde alcanza esta
revisión.

## 1.4 Dependencias externas

Todas **locales, sin CDN**, declaradas así:

```
backtracking.html:378-382
<script src="lib/three.min.js"></script><!-- librerías LOCALES (sin CDN), las mismas que terreno.html: offline -->
<script src="lib/OrbitControls.js"></script>
<script src="seguidor.js?v=0.4.22"></script><!-- FUENTE ÚNICA del seguidor (la misma que terreno.html y el gemelo) -->
<script src="sol.js?v=0.3.0"></script><!-- FUENTE ÚNICA del sol: posición NOAA, singleaxis y la estética de los 3D -->
<script src="irradiancia.js?v=0.1.0"></script><!-- FUENTE ÚNICA de cielo claro, masa de aire y orientación de pala -->
```

| Dependencia | Versión | Origen |
|---|---|---|
| three.js | **r128** (`REVISION` minificada como `e="128"`; licencia «Copyright 2010-2021 Three.js Authors») | `lib/three.min.js`, 603.445 bytes |
| OrbitControls | sin número de versión en el fichero — `NO VERIFICADO` | `lib/OrbitControls.js`, 26.375 bytes |
| Leaflet | **1.9.4** (cadena «Leaflet 1.9.4» en el fichero) | `lib/leaflet.js` |
| GLTFLoader | sin número de versión en el fichero — `NO VERIFICADO` | `lib/GLTFLoader.js` |
| `seguidor.js` | `?v=0.4.22` (versión declarada en el `src`) | repo |
| `sol.js` | `?v=0.3.0` | repo |
| `irradiancia.js` | `?v=0.1.0` | repo |


---

# BLOQUE 2 — MODELO DE DATOS Y GRANULARIDAD

## 2.1 Estructura de una FILA y de una MESA/TRAMO

### El terreno `T` (lo que consume la física)

```
backtracking.html:634-637
/* ── terreno ──────────────────────────────────────────────────────────────
   T = {pairs:[{slope,pitch,axisTilt}], cw, axisAz, maxAngle, gcr, z0, nBypass}
   nRows = pairs.length + 1. Cotas por fila ↔ pendientes por pareja:
   z[p+1] = z[p] − pitch·tan(slope_p).                                       */
```

Campos adicionales que se le cuelgan y que la física lee: `T.segs`, `T.segZ`,
`T.segTilt`, `T.segDrive`, `T.segSide`, `T.segMorro`, `T.segPairs`, `T.rowTilt`,
`T.groups`, `T.drive`, `T.real`, `T.lineX`, `T.iam`, `T.z0`. Punto donde se
trasplantan desde la planta medida:

```
backtracking.html:4169
  if(RM){T.segTilt=RM.segTilt;T.segZ=RM.segZ;T.segSide=RM.segSide;T.segMorro=RM.segMorro;T.segPairs=RM.segPairs;T.segDrive=RM.segDrive;}
```

### El TRAMO (mesa) — definición

```
backtracking.html:1332-1339
/* ── implantación a lo largo del eje: líneas con VARIOS trackers ────────────
   T.segs[r] = lista de tramos [y0,y1] (m, y = +norte) ocupados por filas en la
   línea r. Sin T.segs se asume fila infinita (el modelo clásico). La sombra
   transversal solo existe donde HAY emisor delante: la fracción se pondera por
   el solape axial receptor∩(emisor desplazado por la deflexión de la sombra a
   lo largo del eje). Exacto para el prisma de sombra; cubre los mil casos
   reales — tracker corto delante del largo, tresbolillo, huecos. La sombra
   punta-a-punta ENTRE trackers de la misma línea no se modela (declarado). */
```

### La planta REAL (desde cotas), estructura devuelta

```
backtracking.html:1722-1729
  return {elev:elev,tilt:tilt,segs:segs,segZ:segZ,segTilt:segTilt,segPairs:segPairs,segDrive:segDrive,segTrk:segTrk,segMods:segMods,segEst:segEst,segOrig:segOrig,segRp:segRp,segSide:segSide,segFila:segFila,segArt:segArt,segMorro:segMorro,mod:data.mod||null,groups:groups,lineX:lineX,lineXAbs:lineXAbs,pairDz:pairDz,
          pitch:pitch,cw:data.cuerda||2.382,maxAngle:data.limite||55,
          drive:(nArt>nPairs/2)?'quebrado':'bifila',
          xFrom:band[0].x,xTo:band[band.length-1].x,
          nFilas:band.reduce((s2,l)=>s2+l.f.length,0),
          nMesas:segs.reduce((s2,l)=>s2+l.length,0),      // 2 por fila: la del sur y la del norte del morro
          nQueb:segArt.reduce((s2,l)=>s2+l.filter(Boolean).length,0)/2,   // filas con el quiebro MEDIDO
          nArt:nArt,nPairs:nPairs,blocks:meta,block:bi,huerfanas:huerfanas};
```

### Construcción de las DOS mesas de cada fila

```
backtracking.html:1596-1611
      const hinge=(f.nm!=null&&f.nm>nS+1&&f.nm<nN-1);
      const nb=hinge?f.nm:(nS+nN)/2;
      const zb=hinge?f.ym:zS+(zN-zS)*((nb-nS)/((nN-nS)||1));
      const g=Math.min(gDrive/2,Math.max(0,(Math.min(nb-nS,nN-nb))/4));
      const pS=(zb-zS)/((nb-nS)||1), pN=(zN-zb)/((nN-nb)||1);
      const com={trk:f.trk,md:f.md,est:f.est,hm:f.hm,ye:f.ye,rp:f.rp,art:hinge,fila:fi};
      const eyS=(f.ye===1||f.ye===3), eyN=(f.ye===2||f.ye===3);
      sg.push(Object.assign({s:[nS-nMid,nb-g-nMid],z:[zS,zb-pS*g],side:0,morro:[nb-nMid,zb]},com,{est:f.est||eyS}));
      sg.push(Object.assign({s:[nb+g-nMid,nN-nMid],z:[zb+pN*g,zN],side:1,morro:[nb-nMid,zb]},com,{est:f.est||eyN}));
```

Campos por mesa efectivamente publicados (mismo bucle, `backtracking.html:1616-1640`):
`segs[r][k] = [y0,y1]`, `segZ[r][k] = [z0,z1]` (**dos cotas por mesa**),
`segTilt[r][k]`, `segTrk`, `segMods`, `segEst`, `segOrig`, `segRp`, `segSide`
(0 = sur del morro, 1 = norte), `segFila`, `segArt`.

## 2.2 Entidad atómica de cada cálculo

| Cálculo | Entidad atómica | Cita |
|---|---|---|
| Sombra | **mesa (tramo) × estación axial** — el contador recorre `T.segs[r][k]` y pondera por solape axial; ver bloque 4 | `backtracking.html:1339` (`axialCoverage`), `2553` («POR MESA (fila medida), no por línea») |
| POA | **mesa**, con la sección declarada «POR MESA (fila medida), no por línea» | `backtracking.html:2553` |
| Consigna | **unidad de accionamiento** (grupo de filas con un motor); dentro del grupo el θ es común | `backtracking.html:651-653`, `applyDrive` en `675-683` |

## 2.3 Tilt N-S: uno por fila, uno por mesa, dos cotas por mesa

Las tres representaciones existen a la vez:

- **Dos cotas por mesa** (lo medido): `segZ[r][k] = [z0,z1]`, construido en
  `backtracking.html:1609-1610`.
- **Tilt por MESA**, derivado de esas dos cotas sin promediar:

```
backtracking.html:1618-1621
    // tilt N-S de CADA MESA: la z de sus dos extremos, sin promediar ni por
    // línea ni por fila — es lo que su TCU ve y lo que la transposición
    // necesita mesa a mesa (v1.41 «el tilt por mesa», v1.48 por MESA de verdad)
    segTilt.push(sg.map(o=>Math.atan2(o.z[1]-o.z[0],(o.s[1]-o.s[0])||1)*DEG));
```

- **Tilt por FILA**, media ponderada por largo:

```
backtracking.html:1614-1616
    elev.push(e/L.f.length);
    tilt.push(wt>0?(tw/wt)*DEG:0);
    segs.push(sg.map(o=>o.s));
```

**¿Pueden coexistir varios tilts dentro de una misma unidad de accionamiento?**
Sí, y está escrito como el rasgo que separa los dos tipos de bifila:

```
backtracking.html:655-658
   · la RÍGIDA además comparte geometría de eje: tilt N-S = media del grupo
     (un tubo de transmisión recto no se dobla) ⇒ en terreno N-S quebrado los
     paneles quedan desalineados del terreno y el POA lo enseña;
   · la QUEBRADA lleva cardan: mismo θ, pero cada fila conserva su tilt local.
```

El colapso de la rígida, pegado:

```
backtracking.html:666-673
function effRowTilts(rowTilt,mode,groups){
  if(!groups||mode!=='bifila')return rowTilt.slice();
  const out=rowTilt.slice();
  for(const g of groups)if(g.length===2){
    const m=(rowTilt[g[0]]+rowTilt[g[1]])/2; out[g[0]]=m; out[g[1]]=m;
  }
  return out;
}
```

## 2.4 Unidad de accionamiento

```
backtracking.html:661-666
function driveGroups(nRows,mode){
  if(mode!=='bifila'&&mode!=='quebrado')return null;   // monofila: sin acoplar
  const g=[];
  for(let r=0;r<nRows;r+=2)g.push(r+1<nRows?[r,r+1]:[r]);
  return g;
}
```

```
backtracking.html:675-683
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

Cuántas mesas gobierna un motor — la cuenta la hace `nMotorsSegs`:

```
backtracking.html:688-700
function nMotorsSegs(T){
  // n_motors con implantación: monofila = un motor por TRAMO (tracker);
  // bifila = un motor por fila de la línea MOTORA del grupo (la gemela va
  // por transmisión); líneas sueltas, motor propio por tramo
  if(!T.segs)return nMotors(T.pairs.length+1,T.drive||'mono');
  // v1.54: presets con quiebro en la rótula — un motor por accionamiento
  // (las mesas de un tracker) y uno por mesa suelta
  if(!T.real&&T.segDrive&&T.segDrive.length){
    const inD=new Set();T.segDrive.forEach(g=>g.forEach(m=>inD.add(m[0]+'|'+m[1])));
    let m=T.segDrive.length;T.segs.forEach((l,r)=>l.forEach((sg,k)=>{if(!inD.has(r+'|'+k))m++;}));
    return m;
  }
  const segsOf=r=>(T.segs[r]||[]).length||1;
```

| Accionamiento | Filas por motor | Mesas por motor |
|---|---|---|
| monofila | 1 | las mesas de esa fila (`segsOf(r)`); en planta medida, 2 por fila (sur y norte del morro) |
| bifila rígida | 2 (`[r,r+1]`) | las mesas de las dos filas; además comparten tilt (media) |
| bifila quebrada | 2 | igual, pero cada fila conserva su tilt |
| nº impar de filas | la última va sola: `g.push(r+1<nRows?[r,r+1]:[r])` | — |

## 2.5 Colapsos de geometría por mesa a magnitud por fila

Lista de los que se han localizado, con operador:

| Línea | Qué colapsa | Operador |
|---|---|---|
| `backtracking.html:1614` | cota de la línea desde las cotas de sus filas | **media** `e/L.f.length` |
| `backtracking.html:1615` | tilt N-S de la línea desde el de sus filas | **media ponderada por largo** `tw/wt` |
| `backtracking.html:1643` | recentrado de cotas | **media** `elev.reduce(...)/elev.length` |
| `backtracking.html:669` | tilt del grupo en bifila RÍGIDA | **media de las dos filas** |
| `backtracking.html:679-681` | θ del grupo de accionamiento | **min(\|θ\|)** de las dos filas |
| `backtracking.html:809-811` | terreno «medio» de la planta (`slope`, `pitch`, `axisTilt`) | **media sobre parejas** |
| `backtracking.html:1157-1160` | tilt de fila cuando no hay perfil por fila | **media de las dos parejas vecinas** |
| `backtracking.html:1168-1169` | GCR y pendiente que entran a `singleaxis` por fila | **media de las dos parejas** (`(lo.pitch+hi.pitch)/2`, `(lo.slope+hi.slope)/2`) |
| `backtracking.html:1512` | posición x de una línea al agrupar trackers | **media acumulada** |

`rowTiltAt`, que es el punto donde se decide si se usa el perfil por fila o la media:

```
backtracking.html:1154-1160
function rowTiltAt(T,r){
  // tilt N-S de la fila: el perfil por fila si el terreno lo trae (T.rowTilt),
  // si no la media de sus parejas (regla de compute_bt_angles_rowwise)
  if(T.rowTilt)return T.rowTilt[r];
  const nP=T.pairs.length;
  const lo=T.pairs[Math.max(r-1,0)], hi=T.pairs[Math.min(r,nP-1)];
  return (lo.axisTilt+hi.axisTilt)/2;
}
```

`NO VERIFICADO`: no se ha recorrido el fichero entero buscando colapsos; la lista
sale de una búsqueda por patrones (`reduce(...)/`, `Math.min/max(...)`, «medio»,
«media del grupo») y de la lectura de las secciones de terreno, accionamiento y
planta real. Puede haber más en las secciones de escena y de informe.

---

# BLOQUE 3 — CONVENCIONES DE SIGNO Y TIEMPO

## 3.1 Convención de θ y puntos donde se aplica `TH_DISP`

```
backtracking.html:4012-4016
/* CONVENCIÓN DE SIGNOS DE PRESENTACIÓN (como la TCU): θ NEGATIVO = cara al
   ESTE, positivo = oeste. La física interna mantiene su marco (+x = azimut
   del eje + 90°, θ>0 cara a +x) con toda su QA — el volteo es SOLO al mostrar,
   en un único factor para que no pueda haber mezcla de convenios. */
const TH_DISP=-1;
```

`TH_DISP` se declara **fuera** del bloque FÍSICA PURA (línea 4016 > 4006), es
decir, la física no lo ve. Todos los usos localizados:

| Línea | Uso |
|---|---|
| 6069 | θ de la etiqueta de mesa en la escena 3D |
| 6716 | rango θ por mesas en el HUD |
| 6724 | tarjeta «θ fila N» del HUD |
| 6807 | curva θ(t) |
| 7041 | tabla del informe |
| 7154 | listado de θ del certificado |
| 7348 | **entrada**: inicializa el mando manual desde la consigna publicada |
| 7367 | **entrada**: el θ del slider entra a la física cruzado |
| 7653 | tabla del día |
| 7721 | globo de mesa (picking 3D) |

**¿Algún camino donde el signo se cruce dos veces o ninguna?** Los dos usos de
*entrada* (7348 y 7367) forman un par: 7348 saca de física a pantalla y 7367
devuelve de pantalla a física, así que un valor que entra y sale queda como
estaba. El comentario de 7347 lo declara:

```
backtracking.html:7347-7348
  // el slider habla en convención TCU (− = este) y la física al revés: se cruza por TH_DISP
  MANUAL_ROWS=Array.from({length:nR},(_,r)=>Math.round(TH_DISP*(a[r]!=null?a[r]:0)));
```

`NO VERIFICADO`: no se ha recorrido cada camino de datos de la página (escena,
corte 2D, exportaciones, informe) comprobando la paridad de cruces uno a uno. Lo
que sí consta es que el fichero tiene **un único factor** y que la QA del banco
cubre el caso del mando (ver `tools/test_render_sol.mjs`, «el manual cruza el
signo»).

## 3.2 Signo de la pendiente transversal y del tilt N-S

Relación cotas ↔ pendiente de pareja, declarada:

```
backtracking.html:636-637
   nRows = pairs.length + 1. Cotas por fila ↔ pendientes por pareja:
   z[p+1] = z[p] − pitch·tan(slope_p).
```

Tilt N-S por mesa, deducido de las dos cotas de la mesa:

```
backtracking.html:1621
    segTilt.push(sg.map(o=>Math.atan2(o.z[1]-o.z[0],(o.s[1]-o.s[0])||1)*DEG));
```

Convenio del tilt N-S respecto a pvlib (frontera declarada):

```
backtracking.html:496-499
/* CONVENIO DEL TILT N-S — LA FRONTERA CON pvlib. En toda la app el tilt del
   eje es POSITIVO cuando el extremo que apunta al azimut del eje (el norte,
   con axaz=0) está MÁS ALTO: así lo miden las cotas (segTilt = atan2(Δz,
```

## 3.3 Generación del valor que se escribe en la TCU

**Sí existe**, en `tools/export_consignas.mjs`. Emite **dos columnas**:

```
tools/export_consignas.mjs:177
const ALT = 739, TL = 3.5, ALB = 0.20, TH_DISP = -1;
```

```
tools/export_consignas.mjs:231
        s2.bloque, s2.fila, conMesa ? s2.mesa + 1 : '', pol, th.toFixed(3), (TH_DISP * th).toFixed(3),
```

```
tools/export_consignas.mjs:253
    theta_tcu_deg: 'presentación TCU: θ<0 = este (TH_DISP=-1). CUÁL casa con el registro Objetivo se confirma con una lectura real',
```

Cuál de las dos casa con el registro, y con qué evidencia:

```
tools/export_consignas.mjs:42-45
     · el SIGNO: **θ<0 = ESTE**, o sea que la columna que casa con `Objetivo`
       es `theta_tcu_deg`. Medido sobre 743 seguidores: mediana 0,33° y máximo
       0,55° contra el diagnóstico. Se siguen emitiendo las dos columnas por
       trazabilidad. (Texto histórico, ya resuelto:)
```

**Quién lo prueba**: hay comprobaciones en la batería que leen ese fichero
(`tools/test_backtracking_sim.mjs:1359`, `2234`, `3539`). **`export_consignas.mjs`
no aparece en el workflow de CI** (`.github/workflows/bancos.yml`): `NO ENCONTRADO`.
Nota: `TH_DISP` está escrito **dos veces** — en `backtracking.html:4016` y en
`tools/export_consignas.mjs:177` — como dos constantes independientes.

## 3.4 Algoritmo solar, refracción y huso

Implementación NOAA en `sol.js`:

```
sol.js:62-66
  S.solarPos = function (dateUTCms, lat, lon, opts) {
    var jd = julianDay(dateUTCms), T = (jd - 2451545) / 36525;
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360; if (L0 < 0) L0 += 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
```

Refracción: existe y el simulador la **activa siempre**:

```
backtracking.html:472
const solarPos=(ms,lat,lon)=>Sol.solarPos(ms,lat,lon,{refract:true});
```

```
sol.js:42-49
  S.refraction = function (elev) {
    var te = Math.tan(elev * RAD), r;
    if (elev > 85) r = 0;
    else if (elev > 5) r = 58.1 / te - 0.07 / (te * te * te) + 0.000086 / Math.pow(te, 5);
    else if (elev > -0.575) r = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
    else r = -20.772 / te;
    return r / 3600;
  };
```

Con `refract:true` se devuelve elevación **aparente** y el cénit se recalcula con
ella (`sol.js:94-96`).

**Todo el cálculo interno va en UTC**: la hora local se convierte antes de llamar
al sol.

```
backtracking.html:478-481
function localToUTCms(dateStr,localMin,tzOff){
  const p=dateStr.split('-');
  return Date.UTC(+p[0],+p[1]-1,+p[2],0,0,0)+(localMin-tzOff*60)*60000;
}
```

Huso y verano/invierno:

```
backtracking.html:4239-4249
function husoPlanta(lay,fechaISO,lon,lat){
  if(lay&&lay.tzFijo!=null)return lay.tzFijo/60;
  // v1.55: la regla peninsular solo vale en su sitio (Península, Italia y
  // alrededores: lon −10…19, lat 35…48). Fuera de ahí, el huso ESTÁNDAR de la
  // longitud — «debe estar en hora local»: con Arequipa y 21-dic el cambio de
  // fecha ponía +1 (regla de Madrid) y a las 10:56 el sol salía bajo horizonte
  if(lon!=null&&isFinite(lon)&&!(lon>=-10&&lon<=19&&(lat==null||(lat>=35&&lat<=48))))return tzDeLongitud(lon);
  const d=new Date((fechaISO||'')+'T12:00:00');
  const doy=isNaN(d)?172:Math.floor((d-new Date(d.getFullYear(),0,0))/86400000);
  return (doy>=88&&doy<=298)?2:1;
}
```

Es decir: huso fijo si el layout lo declara (`tzFijo`); si no y el sitio cae
fuera de la ventana peninsular, huso estándar por longitud; dentro de ella,
**+2 entre los días 88 y 298 del año, +1 el resto** (regla de fechas, no de
reglamento).

## 3.5 Sello temporal

El día se muestrea a paso fijo y cada muestra es **instantánea**: se calcula la
posición solar en el minuto `m` y se etiqueta con ese mismo `m`.

```
backtracking.html:4858
const STEP_MIN=5;
```

```
backtracking.html:4901-4905
  for(let m=0;m<1440;m+=STEP_MIN){
    const g=solarPos(localToUTCms(c.date,m,c.tz),c.lat,c.lon);
    times.push(m); sun.push(g);
    irr.push(skyWithClouds(clearskyIneichen(g.zen,doy,c.alt,c.tl),cloudCC(),g.zen));
  }
```

La etiqueta es, por tanto, el **inicio** del paso (`m` va de 0 a 1435 en saltos
de 5), y no hay promediado de intervalo en el muestreo. La integración a energía
sí usa el paso como anchura:

```
backtracking.html:4963
  const dtH=STEP_MIN/60;
```

---

# BLOQUE 4 — EL CONTADOR DE SOMBRA

## 4.1 Funciones de entrada

Hay **dos caminos** con firmas distintas:

### (a) Analítico por pareja, en el plano ⊥ al eje — 2.5D

```
backtracking.html:551
function shadeFracPair(pszDeg,thLeft,thRight,pitch,cw,slopeDeg,z0){
```

Devuelve un escalar en [0,1]: fracción de cuerda sombreada de la receptora.

Acompañante que devuelve el rayo crítico con la MISMA geometría:

```
backtracking.html:576-579
function criticalRayPair(pszDeg,thLeft,thRight,pitch,cw,slopeDeg,z0){
...
  return {fs:fs,edge:edge,hit:hit,mu:mu,u:u,v1:v1,v2:v2,
          upIsRight:pszDeg>=0,zR:zR,pitch:pitch};
```

### (b) Ray-cast 3D multiemisor

```
backtracking.html:1865-1871
function shadeBand3DAll(zen,az,T,rowAngles,res){
  const nR=T.pairs.length+1;
  const out=new Array(nR).fill(0);
  const azR=(az-T.axisAz)*RAD, el=(90-zen)*RAD;
  const sv=[Math.sin(azR)*Math.cos(el),Math.cos(azR)*Math.cos(el),Math.sin(el)];
  if(sv[2]<=0)return out;
  const hw=T.cw/2, PRr=T.real, SZ=T.segZ||(PRr&&PRr.segZ)||null;   // v1.54: cota por mesa en T
```

Devuelve un array por fila con propiedades colgadas: `out[r]` (fracción con
estructura), y además `out.pl` (solo planos), `out.de[r]` (atribución por
emisora), `out.st[r]` (franjas de terreno), `out.seg`/`out.wing` (por tramo y por
ala) — construidos en `backtracking.html:2118-2121`:

```
backtracking.html:2118-2121
  const elec=new Array(nR).fill(0), plOnly=new Array(nR).fill(0);
  const atr=new Array(nR), nSt=new Array(nR).fill(0);   // DE QUIÉN viene la sombra de cada fila: {fila emisora|terreno: fracción}
  const segOut=new Array(nR), segElec=new Array(nR);   // por TRAMO (v1.41)
  const wingOut=new Array(nR), wingElec=new Array(nR); // por ALA de cada tramo (v1.43): [sur (n bajo), norte]
```

## 4.2 Enumeración emisor-receptor: mesa × mesa

**Es mesa × mesa (tramo × tramo), no fila × fila.** Los emisores se construyen
recorriendo cada tramo de cada fila:

```
backtracking.html:2020-2026
  const planes=[];
  for(let e=0;e<nR;e++){
    const sgE=segsOf(e);
    for(let kE=0;kE<sgE.length;kE++){
      const sg=sgE[kE], thE=thOf(e,kE)*RAD;
      const w0=Math.min(sg[0],sg[1]), w1=Math.max(sg[0],sg[1]);
      const z0e=cot(e,w0), z1e=cot(e,w1);
```

y los receptores igual, tramo a tramo dentro de cada fila:

```
backtracking.html:2137-2145
    const sgR=segsOf(r);
    for(let kR=0;kR<sgR.length;kR++){
      const sg=sgR[kR];
      thR=thOf(r,kR)*RAD;
      let hitS=0,NS=0,elecS=0;                        // la cuenta de ESTE tramo
      const hitW=[0,0],NW=[0,0],elecW=[0,0];          // y la de cada ALA (v1.43): un string por ala en la mesa larga
      const v0=Math.min(sg[0],sg[1]), v1=Math.max(sg[0],sg[1]);
      const cSeg=cands.filter(c=>c.hi>=v0&&c.lo<=v1).map(c=>c.pl);
```

El θ se toma **por tramo** cuando la consigna viene por mesa:

```
backtracking.html:2017-2019
  const thOf=(e,k)=>Array.isArray(rowAngles[e])?rowAngles[e][k]:rowAngles[e];
```

**No hay elección de «par crítico»** en este camino: se enumeran todos los planos
candidatos tras la poda (4.6) y se unen sus intervalos. El concepto de par
crítico vive en el camino 2.5D (`criticalRayPair`) y en el dibujo.

## 4.3 Dirección transversal: intersección analítica de intervalos

En el camino 2.5D, la fracción es el solape de las proyecciones sobre el eje ⊥
al rayo, dividido por la proyección de la receptora:

```
backtracking.html:563-570
  const u=(P)=>P[0]*Math.cos(ps)-P[1]*Math.sin(ps);   // proyección ⊥ al rayo solar
  const u1=Math.min(u(up[0]),u(up[1])), u2=Math.max(u(up[0]),u(up[1]));
  const v1=Math.min(u(dn[0]),u(dn[1])), v2=Math.max(u(dn[0]),u(dn[1]));
  const w=v2-v1;
  const ov=Math.max(0,Math.min(u2,v2)-Math.max(u1,v1));
  if(w<1e-9)return ov>0?1:0;                          // receptora de canto al sol
  return Math.max(0,Math.min(1,ov/w));
```

En el camino 3D, la penetración de cuerda de cada estación se resuelve **en
cerrado** como intersección de semiplanos lineales en `u` (la coordenada de
cuerda), no por muestreo:

```
backtracking.html:2186-2196
        for(const pl of cSeg){
          const t0=(pl.C[0]-px0)*pl.nE[0]+(pl.C[1]-py0)*pl.nE[1]+(pl.C[2]-pz0)*pl.nE[2];
          const tc=cR*pl.nE[0]+s2*pl.nE[2];
          let lo=-hw, hi=hw, ok=true;
          const lin=(A,B)=>{                 // A·u ≤ B; A~0 ⇒ no depende de u
            if(A>1e-12){const x=B/A;if(x<hi)hi=x;}
            else if(A<-1e-12){const x=B/A;if(x>lo)lo=x;}
            else if(B<-1e-12)ok=false;
          };
          if(pl.den>0)lin(tc,t0-1e-6*pl.den); else lin(-tc,1e-6*pl.den-t0);   // t>0
          const q=sv[1]/pl.den;                                               // H1∈[w0,w1]
```

con la justificación declarada:

```
backtracking.html:2180-2185
        // CUERDA ANALÍTICA (v1.25): el impacto contra cada plano emisor es
        // LINEAL en u ⇒ la sombra de la estación es una unión de intervalos
        // en cerrado, sin discretizar la cuerda. El muestreo MU=6 cuantizaba
        // la penetración a saltos de 1/6 y sesgaba el POA anual +0,52%
        // (estudio de convergencia de la auditoría, Ayora 12 días).
```

## 4.4 Dirección axial: cuadratura por estaciones

Sí, es cuadratura de punto medio con `MV` estaciones por tramo:

```
backtracking.html:2149
      const dvSt=(v1-v0)/MV;
```

```
backtracking.html:2172-2173
      for(let j=0;j<MV;j++){
        const v=v0+(v1-v0)*(j+0.5)/MV;
```

Número de estaciones — **adaptativo**:

```
backtracking.html:842-856
function mvPara(T,zen){
  if(!T)return 8;
  if(T.mv)return T.mv;
  if(T.real)return 8;
  // sol muy rasante (<6°): la sombra barre la mesa entera en pocos metros y el
  // barrido de terrenos midió hasta 3,7 pp de diferencia contra la malla fina
  // justo ahí — se dobla la densidad, que son pocos instantes del día
  const rasante=(zen!=null&&zen>84)?2:1;
  let L=0;
  if(T.segs)for(const sg of T.segs)for(const s2 of (sg||[]))L=Math.max(L,Math.abs(s2[1]-s2[0]));
  if(!(L>0))L=60;
  let tor=0;
  if(T.rowTilt)for(let r=0;r+1<T.rowTilt.length;r++)tor=Math.max(tor,Math.abs((T.rowTilt[r]||0)-(T.rowTilt[r+1]||0)));
  if(T.segTilt)for(const st of T.segTilt)if(st)for(let k=0;k+1<st.length;k++)tor=Math.max(tor,Math.abs(st[k]-st[k+1]));
  return Math.max(8,Math.min(64,Math.ceil(rasante*L/(tor>=0.5?2:4))));
```

Es decir: **8 en planta medida (`T.real`) y 8 como suelo; hasta 64**; el
denominador es 2 m por estación si hay torsión ≥ 0,5° y 4 m si no; se **duplica**
la densidad con cénit > 84°. Se puede forzar con `T.mv` o con `res.MV`
(`backtracking.html:2088`).

Ponderación de las cubiertas: **media aritmética simple sobre las estaciones**,
por tramo y por ala:

```
backtracking.html:2292-2296
        hitS+=fCol; NS++; elecS+=elecLoss(fCol,T.nBypass);   // la cuenta de este tramo (v1.41)
        {const wg=v<(v0+v1)/2?0:1;hitW[wg]+=fCol;NW[wg]++;elecW[wg]+=elecLoss(fCol,T.nBypass);}   // la estación cae en su ala
...
      segOut[r].push(NS?hitS/NS:0);
```

## 4.5 Varios emisores sobre la misma receptora: se UNEN

Cada emisor aporta su intervalo de cuerda y **se unen** (no se suman). El
acumulador y la unión:

```
backtracking.html:2211
          if(ok&&hi-lo>1e-12){(ivs=ivs||[]).push([lo,hi]);(ivP=ivP||[]).push([lo,hi]);(porE[pl.e]=porE[pl.e]||[]).push([lo,hi]);}
```

```
backtracking.html:2226
        let fCol=unir(ivs);
```

La función de unión, que ordena y funde solapes:

```
backtracking.html:2089-2101
  const unir=(iv)=>{
    if(!iv)return 0;
    iv.sort((a,b)=>a[0]-b[0]);
    let len=0,cl=iv[0][0],ch=iv[0][1];
    for(let k=1;k<iv.length;k++){
      if(iv[k][0]>ch){len+=ch-cl;cl=iv[k][0];ch=iv[k][1];}
      else if(iv[k][1]>ch)ch=iv[k][1];
    }
    return Math.min(1,(len+ch-cl)/T.cw);
  };
```

La atribución por emisora sí se guarda aparte, y también por unión:

```
backtracking.html:2262
        for(const e in porE)atr[r][e]=(atr[r][e]||0)+unir(porE[e]);
```

## 4.6 Alcance y poda

Alcance **por pareja emisora-receptora**, con suelo de 9 m:

```
backtracking.html:2080-2083
  const reachDe=(e,r)=>{
    const dz=(isFinite(zMaxR[e])&&isFinite(zMinR[r]))?zMaxR[e]-zMinR[r]:0;
    return (horiz>1e-6?Math.max(9,dz+T.cw+1)*horiz/Math.max(sv[2],1e-4):1e9)+T.cw;
  };
```

Poda por fila (lado del sol, alcance, denominador no degenerado) y ventana axial:

```
backtracking.html:2118-2133
    for(const pl of planes){
      if(pl.e===r)continue;
      const dx=pl.x-xs[r];
      if(dx*sgn<=0||Math.abs(dx)>reachDe(pl.e,r)||Math.abs(pl.den)<1e-9)continue;
      const shf=ratio===null?0:-dx*ratio;
...
      const dzMax=Math.max(Math.abs(pl.C[2]-cot(r,pl.w0)),Math.abs(pl.C[2]-cot(r,pl.w1)))+T.cw;
      const axial=Math.abs(sv[1])/Math.max(sv[2],1e-3);
      const slack=ratio===null?1e9:4+hw*Math.abs(ratio)+Math.abs(dx)*0.02+dzMax*axial;
      cands.push({pl:pl,adx:Math.abs(dx),lo:pl.w0+shf-slack,hi:pl.w1+shf+slack});
    }
```

Poda exacta de la estructura por tramo receptor (caja entera por detrás del plano
receptor):

```
backtracking.html:2163-2171
      const solDelante=(sv[0]*nu0+sv[1]*nu1+sv[2]*nu2)>0;
      const A0r=[xs[r]+of0,(v0+v1)/2+of1,cot(r,(v0+v1)/2)+of2];
      const detras=(bx)=>{
        if(!solDelante)return false;
        const d=(bx.C[0]-A0r[0])*nu0+(bx.C[1]-A0r[1])*nu1+(bx.C[2]-A0r[2])*nu2;
        let rad=0;
        for(let k=0;k<3;k++)rad+=bx.hf[k]*Math.abs(bx.ax[k][0]*nu0+bx.ax[k][1]*nu1+bx.ax[k][2]*nu2);
        return d+rad<=0;
      };
```

Nota declarada: **sin emisoras del lado del sol NO se salta la fila**, porque el
terreno puede taparla (`backtracking.html:2134-2138`).

## 4.7 Separación planos / estructura

Se mantienen **dos cuentas simultáneas**: `ivs` (todo) e `ivP` (solo planos).

```
backtracking.html:2226-2231
        let fCol=unir(ivs);
        const fColSinTerr=fCol;                           // lo que NO es terreno (para atribuir)
        // la MISMA cuenta SIN la estructura de la mesa (el terreno se le suma
        // igual, más abajo): así la diferencia out−pl es exactamente el hierro
        // —viga y canto—, que ninguna consigna puede evitar
        let fPl=hayStr?unir(ivP):fCol;
```

Cotas de viga y canto, y de dónde salen:

```
backtracking.html:2053-2062
        tb:{C:axC,ax:[e1,e2,e3],hf:[TUBE/2,TUBE/2,Math.abs(w1-w0)*lv/2]},
        // CANTO del módulo: el laminado+marco tiene 6 cm y su cara INFERIOR
        // sombrea 3 cm por debajo del plano — con sol a 0,6° eso son 2,6 m de
        // sombra que se veía en pantalla sin contar. El plano sigue estando
        // (es subconjunto de la loncha): la unión no cambia el caso normal
        sl:{C:[axC[0]+(zOff-GLASS/2)*nu[0],axC[1]+(zOff-GLASS/2)*nu[1],axC[2]+(zOff-GLASS/2)*nu[2]],
            ax:[e1,e2,e3],hf:[hw,GLASS/2,Math.abs(w1-w0)*lv/2]}});
```

La viga es cuadrada de `TUBE` (120 mm, «seguidor.js D.tube») y el canto `GLASS`
(6 cm). La altura de la cara colectora sobre el eje sale de **una sola fuente**:

```
backtracking.html:2011-2015
  // UNA sola fuente para la altura de la cara colectora sobre el eje: el campo
  // «cara sup–eje» (T.z0), el mismo que usan el corte 2D, el rayo crítico, el
  // visor del vano y shadeFracPair. Antes el contador 3D la llevaba a fuego y
  // había dos verdades para el mismo número.
  const zOff=(T.z0!=null&&isFinite(T.z0))?T.z0:REC_OFF;
```

## 4.8 El hueco de 0,55 m entre mesas

**Está en la física**, como separación entre las dos mesas de una fila al
construir la planta medida:

```
backtracking.html:1572-1573
  // hueco del accionamiento (el MORRO): separa las dos mesas de una fila
  const gDrive=(data.mod&&data.mod.gapDrive!=null)?data.mod.gapDrive:0.55;
```

```
backtracking.html:1600
      const g=Math.min(gDrive/2,Math.max(0,(Math.min(nb-nS,nN-nb))/4));
```

Ese `g` recorta los extremos de las dos mesas (`s:[nS-nMid,nb-g-nMid]` y
`s:[nb+g-nMid,nN-nMid]`, líneas 1609-1610), así que el hueco existe como ausencia
de tramo y el contador no encuentra emisor ahí.

En el render, la excepción declarada en sentido contrario está escrita en el
banco:

```
tools/test_render_sol.mjs:13-18
 *      EXCEPCIÓN DECLARADA (no se prueba aquí, está medida): en los presets sin
 *      quiebro la física modela el tramo como vidrio CONTINUO (sin el hueco del
 *      motor, 0,55 m de 65) y el modelo 3D sí lleva el hueco: desde el sol se
 *      ven ~50 px de rojo a través del hueco de la emisora (la física cobra esa
 *      sombra de más, 0,85 % del largo). El quiebro en la rótula ya parte las
 *      mesas con su hueco y pasa a cero. Pendiente: partir todas las mesas.
```

Es decir: **en planta medida el hueco está en la física; en los presets sin
quiebro no, y la discrepancia con el render está declarada y cuantificada**.

## 4.9 Sombra punta a punta dentro de la misma línea

Excluida, y **por diseño (no se enumera)**: el bucle receptor salta los planos de
su propia fila.

```
backtracking.html:2116
      if(pl.e===r)continue;
```

Declarado además en la cabecera de la sección:

```
backtracking.html:1339
   reales — tracker corto delante del largo, tresbolillo, huecos. La sombra
   punta-a-punta ENTRE trackers de la misma línea no se modela (declarado). */
```

---

# BLOQUE 5 — POLÍTICAS, UNA POR UNA

## Orden de aplicación (común): el despachador

Es la única secuencia real de llamadas, y difiere por política:

```
backtracking.html:3344-3370
function policyAngles(key,zen,az,T,irr,doy,albedo,prev){
...
  if(key==='optimal')return anglesOptimal(zen,az,T,irr,doy,albedo,prev);
  if(key==='optfree')return anglesOptimalFree(zen,az,T,irr,doy,albedo,prev);
...
  if(key==='astro')return {angles:applyDrive(anglesAstro(zen,az,T),T.groups||null),f:undefined};
  if(key==='global')return {angles:anglesGlobal(zen,az,T),f:undefined};
  if(key==='bt2d')return {angles:anglesBt2d(zen,az,T),f:undefined};      // un ángulo: el acoplado es no-op
  if(key==='row')return {angles:applyDrive(anglesRow(zen,az,T),T.groups||null),f:undefined};
  if(key==='true3d')return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesTrue3d(zen,az,T),true),irr,doy,albedo),f:undefined};
  if(key==='mgl')return {angles:repairNoShade(zen,az,T,anglesMinGroundLight(zen,az,T),irr,doy,albedo),f:undefined};   // ya acoplado; busca no-sombra de planos vecinos, con la misma guardia
  return {angles:repairNoShade(zen,az,T,driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false),irr,doy,albedo),f:undefined};
}
```

| Política | Acople | Reparación global | Límite ±θmáx |
|---|---|---|---|
| astro | `applyDrive` (min\|θ\|) | no | dentro de `singleaxis` |
| global | no (un solo ángulo) | no | `singleaxis` |
| bt2d | no (no-op) | no | `singleaxis` |
| row | `applyDrive` | no | `singleaxis` |
| pairwise | `driveCoupleSafe(...,false)` | **sí** | `singleaxis` + `clampR` en la reparación |
| true3d | `driveCoupleSafe(...,true)` | **sí** | explícito `Math.max(-T.maxAngle,Math.min(T.maxAngle,v))` (`1262`) |
| mgl | ya acoplado dentro | **sí** | `maxA=T.maxAngle` y rango legítimo |
| optimal | acople **en los dos extremos** antes de interpolar | **no** llama a `repairNoShade` | extremos ya acotados |
| optfree | ídem | **no** | `Math.max(-T.maxAngle,Math.min(...))` (`2953`) |

**Stow: `NO ENCONTRADO`** en la cadena de `policyAngles`. No aparece ninguna
llamada ni rama de stow/refugio en el despachador.

---

## 5.A astro

```
backtracking.html:1180-1190
function anglesAstro(zen,az,T){
  // seguimiento astronómico pleno, sin backtracking (el que auto-sombrea)
  const nR=T.pairs.length+1, nP=Math.max(T.pairs.length,1), out=new Array(nR);
  for(let r=0;r<nR;r++){
    const p=T.pairs[Math.min(r,nP-1)];
    out[r]=nan0(singleaxis(zen,az,{axisTilt:pvTilt(rowTiltAt(T,r)),axisAz:T.axisAz,maxAngle:T.maxAngle,
      backtrack:false,gcr:T.gcr,crossAxisTilt:p.slope}));
  }
  return out;
}
```

- **Entradas**: `zen`, `az`, `T` (tilt por fila vía `rowTiltAt`, `axisAz`, `maxAngle`, `gcr`, `slope` de la pareja).
- **No iterativo.**
- **Agregación**: `applyDrive` en el despachador → **min(\|θ\|)** por grupo.

## 5.B global

```
backtracking.html:1173-1179
function anglesGlobal(zen,az,T){
  // "un motor, un ángulo": pendiente media de la planta para todas las filas
  const m=meanPair(T);
  const th=nan0(singleaxis(zen,az,{axisTilt:pvTilt(m.axisTilt),axisAz:T.axisAz,maxAngle:T.maxAngle,
    backtrack:true,gcr:T.cw/m.pitch,crossAxisTilt:m.slope}));
  return new Array(T.pairs.length+1).fill(th);
}
```

- **Agregación**: media de `slope`, `pitch` y `axisTilt` sobre parejas (`meanPair`, `backtracking.html:809-811`).

## 5.C BT2D plano

```
backtracking.html:2337-2343
function anglesBt2d(zen,az,T){
  const pitch=T.pairs.length?T.pairs[0].pitch:6;
  const th=nan0(singleaxis(zen,az,{axisTilt:0,axisAz:T.axisAz,maxAngle:T.maxAngle,
    backtrack:true,gcr:T.cw/pitch,crossAxisTilt:0}));
  return new Array(T.pairs.length+1).fill(th);
}
```

- Usa **el pitch de la primera pareja** y fuerza `axisTilt:0`, `crossAxisTilt:0`.

## 5.D row

```
backtracking.html:1162-1172
function anglesRow(zen,az,T){
  // por fila INDEPENDIENTE con su terreno local (media de sus dos parejas)
  const nR=T.pairs.length+1, nP=T.pairs.length, out=new Array(nR);
  for(let r=0;r<nR;r++){
    const lo=T.pairs[Math.max(r-1,0)], hi=T.pairs[Math.min(r,nP-1)];
    out[r]=nan0(singleaxis(zen,az,{axisTilt:pvTilt(rowTiltAt(T,r)),axisAz:T.axisAz,
      maxAngle:T.maxAngle,backtrack:true,gcr:T.cw/((lo.pitch+hi.pitch)/2),
      crossAxisTilt:(lo.slope+hi.slope)/2}));
  }
  return out;
}
```

- **Agregación**: media de las dos parejas para `gcr` y `slope`; después `applyDrive`.

## 5.E pairwise

```
backtracking.html:1112-1125
function anglesPairwiseRaw(zen,az,T){
  // por pareja; filas interiores adoptan min(|θ|) de sus dos parejas
  const nR=T.pairs.length+1, out=new Array(nR);
  const ev=pairEval3D(zen,az,T,new Map());
  const th=T.pairs.map((p,i)=>pairThetaTorsion(zen,az,T,i,nan0(singleaxis(zen,az,{axisTilt:pvTilt(p.axisTilt),axisAz:T.axisAz,
    maxAngle:T.maxAngle,backtrack:true,gcr:T.cw/p.pitch,crossAxisTilt:p.slope})),ev));
  out[0]=th[0]; out[nR-1]=th[th.length-1];
```

### 5.2 Regla del candidato de la fila interior

```
backtracking.html:1119-1123
  // la fila interior toma el de sus dos parejas MÁS backtrackeado: min(sg·θ)
  // con sg el lado del sol — con candidatos del lado del sol es min|θ|, lo de
  // siempre; con torsión un candidato puede haber pasado de cero (−5°) y
  // min|θ| lo habría descartado frente a un +3° que sí sombrea
  const sg=trueTrackAngle(zen,az,0,T.axisAz)>=0?1:-1;
  for(let r=1;r<nR-1;r++)out[r]=sg*th[r-1]<sg*th[r]?th[r-1]:th[r];
```

### Reparación interna con torsión (iterativa)

```
backtracking.html:1131-1151
  if(T.rowTilt&&isFinite(zen)&&zen<90&&T.pairs.some((_,i)=>pairStations(T,i).length>1)){
...
    const ITS=Math.round(12*0.5/PASO_BUSQ);
    for(let it=0;it<ITS;it++){
      let dirty=false;
      for(let p=0;p<T.pairs.length;p++){
        if(ev(p,out[p],out[p+1])<=1e-3)continue;
        let t=sg*out[p]<sg*out[p+1]?out[p]:out[p+1];
        if(out[p]===out[p+1])t=t-sg*PASO_BUSQ;
        // v1.57: dentro del semiespacio solar de la pareja (antes bajaba hasta la posición de canto)
        const [hLo,hHi]=rangoHaz(zen,az,T,T.pairs[p].axisTilt,T.pairs[p].slope);
        t=Math.max(hLo,Math.min(hHi,t));
        if(out[p]!==t||out[p+1]!==t){out[p]=t;out[p+1]=t;dirty=true;}
      }
      if(!dirty)break;
    }
  }
```

- **Predicado**: `ev(p,·,·) > 1e-3` (fracción sombreada de la pareja por ray-cast 3D).
- **Paso**: `PASO_BUSQ` = 0,1°. **Tope**: `ITS = round(12·0,5/0,1) = 60` iteraciones.
- **Parada**: ninguna pareja sombrea (`!dirty`) o se agota el tope.

Nota: la cita del enunciado sobre «barrido de 0,5° del caso con torsión» **no
corresponde al código auditado**: el empuje va a `PASO_BUSQ` = 0,1° y el
comentario declara el cambio (v1.60, líneas 1132-1137). `PASO_GRUESO` = 0,5° sí
existe, pero se usa en `conoHaz`/`rangosFila` (`backtracking.html:1075`, `1083`),
no aquí.

### Memoización

```
backtracking.html:1100-1110
function anglesPairwise(zen,az,T){
  let memo=_APW.get(T);
  const sig=sigT(T);
  if(!memo||memo.sig!==sig){memo={sig:sig,map:new Map()};_APW.set(T,memo);}
  const mk=zen+'|'+az;
  const hitA=memo.map.get(mk);
  if(hitA)return hitA.slice();
```

## 5.F true-3D

### 5.1 Punto del emisor, bisección, margen y deferral

El rayo se lanza desde **el borde MÁS ALTO** de la emisora (no ambas esquinas, no muestreo):

```
backtracking.html:1200-1214
  const shades=(mag)=>{
    const th=sgn*mag*RAD;
    const cd=[Math.cos(th),Math.sin(th)*sa,-Math.sin(th)*ca];
    const eW=[Cup[0]-hw*cd[0],Cup[1]-hw*cd[1],Cup[2]-hw*cd[2]];
    const eE=[Cup[0]+hw*cd[0],Cup[1]+hw*cd[1],Cup[2]+hw*cd[2]];
    const Ph=eW[2]>eE[2]?eW:eE;                       // el borde MÁS ALTO manda
```

**Bisección de 36 pasos sobre [0, maxAngle]**, que asume que `shades(mag)` cambia
de falso a verdadero una sola vez:

```
backtracking.html:1215-1217
  let lo=0, hi=maxAngle;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2; if(shades(mid))hi=mid; else lo=mid;}
  return {mag:lo,sgn:sgn};
```

**Margen 0,5°, deferral y suelo en la baseline**:

```
backtracking.html:1226-1244
  const MARGIN=0.5, EPS_TILT=0.5;
...
    pm.push(Math.min(full,Math.max(0,Math.min(b.mag-MARGIN,T.maxAngle))));
    pc.push(Math.max(0,Math.min(b.mag,T.maxAngle)));
```

```
backtracking.html:1250-1265
  const meaningful=zen<82;
...
    // suelo en la baseline (energía ≥ baseline) solo donde la baseline no auto-sombrea en 3D
    if(!meaningful||bAbs<=ceil[r]+1e-9){
      const flip=Math.sign(v)||1;
      v=flip*Math.max(Math.abs(v),bAbs);
    }
    if(!meaningful)v=base[r];                          // deferral: zen ≥ 82° ES la baseline
    out[r]=Math.max(-T.maxAngle,Math.min(T.maxAngle,v));
```

Guard de degeneración 2.5D (sin tilt N-S, el resultado **es** la baseline):

```
backtracking.html:1266-1271
  const pdeg=T.pairs.map(p=>Math.abs(p.axisTilt)<=EPS_TILT);
  for(let r=0;r<nR;r++){
    const d=(r===0)?pdeg[0]:(r===nR-1)?pdeg[pdeg.length-1]:(pdeg[r-1]&&pdeg[r]);
    if(d)out[r]=base[r];
  }
```

Además hay un corte previo en `zen<87` (`1226`) y, con torsión, **el tope 3D es
el de la PEOR estación de la pareja** (`1233-1237`).

## 5.G min-ground-light

```
backtracking.html:2358-2390
function anglesMinGroundLight(zen,az,T){
  const base=T.groups?driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false)
                     :anglesPairwise(zen,az,T);
  if(!(isFinite(zen)&&zen<87))return base;
  const a=base.slice(), maxA=T.maxAngle;
  const RG=rangosUnidad(zen,az,T);
  const units=T.groups?T.groups:a.map((_,r)=>[r]);
  const glSum=ang=>ang.reduce((s,th)=>s+groundLightFrac(th,zen,az,T.gcr,T.axisAz),0);
  for(let it=0;it<3;it++){
    let improved=false;
    for(const u of units){
      const r0=u[0];
      const sgn=Math.sign(a[r0])||1;
      let lo=Math.abs(a[r0]), hi=Math.min(maxA,sgn>0?RG[r0][1]:-RG[r0][0]);
      if(hi-lo<0.25)continue;
      for(let b=0;b<14;b++){
        const mid=(lo+hi)/2, trial=a.slice();
        for(const r of u)trial[r]=sgn*mid;
        if(Math.max(...shadeRows(zen,az,T,trial))<=2e-3)lo=mid; else hi=mid;
      }
```

- **Iterativo**: hasta **3 pasadas** sobre las unidades; dentro, **14 pasos de
  bisección** por unidad.
- **Predicado de la bisección**: `max(shadeRows) ≤ 2e-3`.
- **Criterio de aceptación**: la suma de `groundLightFrac` debe bajar
  (`glSum(trial)<glSum(a)-1e-12`, línea 2385).
- **Parada**: ninguna unidad mejora (`!improved`).
- Función objetivo auxiliar (port de infinite-sheds), `backtracking.html:2346-2353`.

## 5.H energy-optimal

### 5.5 Rejilla de f y las dos rutas de evaluación

```
backtracking.html:2726
const OPT_FRACTIONS=[0,0.25,0.5,0.75,1];
```

```
backtracking.html:2781
const OPT_REFINA=2;
```

```
backtracking.html:2803-2828
function anglesOptimal(zen,az,T,irr,doy,albedo,prev){
  const base=driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false);
  const full=applyDrive(anglesAstro(zen,az,T),T.groups||null);
  if(!(zen<90)||irr.ghi<=0)return {angles:base,f:0};
  const angDe=f=>base.map((b,i)=>b+f*(full[i]-b));
  const paso=(OPT_FRACTIONS.length>1)?(OPT_FRACTIONS[1]-OPT_FRACTIONS[0]):0.25;
  let best=-Infinity, bestAng=base, bestF=0;
  for(const f of OPT_FRACTIONS){
    const ang=base.map((b,i)=>b+f*(full[i]-b));
    const p=poaPlant(zen,az,T,ang,irr,doy,albedo).plant;
    if(p>best+1e-12){best=p;bestAng=ang;bestF=f;}
  }
```

**Segunda etapa, refinado alrededor de la ganadora**:

```
backtracking.html:2829-2841
  const finas=[];
  for(let j=1;j<=OPT_REFINA;j++){
    const d=paso*j/(OPT_REFINA+1);
    for(const f2 of [bestF-d,bestF+d])
      if(f2>0&&f2<1&&finas.indexOf(f2)<0)finas.push(f2);
  }
  for(const f2 of finas){
    const ang2=angDe(f2);
    const p2=poaPlant(zen,az,T,ang2,irr,doy,albedo).plant;
    if(p2>best+1e-12){best=p2;bestAng=ang2;bestF=f2;}
```

O sea: rejilla gruesa de 5 valores **más** 4 valores finos a ±0,25·j/3 (j=1,2)
alrededor de la ganadora, todos recortados a (0,1).

**Las dos rutas de evaluación.** El comentario declara que el guía 2.5D **ya no
se usa en la búsqueda** de esta política, y que ahora la búsqueda entera va con
el contador exacto:

```
backtracking.html:2817-2824
    /* v1.57.2 (cuarta auditoría): la BÚSQUEDA también con el contador exacto.
       El guía 2.5D lee cero donde la mesa mira casi de canto —211 de 430
       candidatos del caso B difieren más de 5 pp del contador— y con eso la
       lista de candidatas que llega al veto se construía ciega: un veto sólo
       rechaza, no propone lo que la búsqueda no le trajo. Medido: cuesta un
       19 % más de tiempo (1.513 → 1.799 ms el día del caso B) y da la MISMA
       energía, 10,5100 Wh/m². El guía rápido se queda para nada crítico. */
```

`NO VERIFICADO`: no se ha leído el resto de `anglesOptimal` (veto y guardia,
líneas 2841-2937) con el detalle suficiente para enumerar exactamente qué
candidatos adicionales se reevalúan; el comentario de las líneas 2846-2863
describe un veto que compara contra los DOS extremos y contra el pairwise
publicado.

## 5.I óptimo libre

### 5.6 Rejilla, unidades y ascenso coordinado

```
backtracking.html:2937
const OPTFREE_F0=-0.5, OPTFREE_NF=13;
```

```
backtracking.html:2938-2955
function anglesOptimalFree(zen,az,T,irr,doy,albedo,prev){
  const base=driveCoupleSafe(zen,az,T,anglesPairwise(zen,az,T),false);
  if(!(zen<90)||irr.ghi<=0)return {angles:base,f:0};
  const full=applyDrive(anglesAstro(zen,az,T),T.groups||null);
  const nR=T.pairs.length+1;
  // unidades de accionamiento (cada fila en exactamente una)
  const seen=new Set(); const units=[];
  for(const g of (T.groups||[])){units.push(g.slice().sort((a,b)=>a-b));g.forEach(r=>seen.add(r));}
  for(let r=0;r<nR;r++)if(!seen.has(r))units.push([r]);
  units.sort((a,b)=>a[0]-b[0]);
  const unitOf=new Array(nR); units.forEach((u,i)=>u.forEach(r=>unitOf[r]=i));
  const GRID=[]; for(let i=0;i<OPTFREE_NF;i++)GRID.push(OPTFREE_F0+(1-OPTFREE_F0)*i/(OPTFREE_NF-1));
```

- **Rejilla**: 13 valores de f, **de −0,5 a 1** (paso 0,125).
- **Unidad**: una f por **unidad de accionamiento**; una fila sin grupo es su
  propia unidad (línea 2946).
- Caches por instante: POA por fila × candidato y geometría por pareja (2949-2956).

`NO VERIFICADO`: la vecindad exacta que mira cada unidad y el criterio de
convergencia del ascenso están en las líneas 2960-3040, que no se han pegado
aquí por extensión. Lo que sí consta en esa zona es una salvaguarda declarada:
«si bajo la MISMA métrica del arranque el ascenso no mejora» (línea ~3001).

## 5.7 Consigna retenida: dónde entra el lazo

```
backtracking.html:3044
const TRACKER_SLEW=0.17;                             // °/s (spec del actuador)
```

```
backtracking.html:3061-3070
const DEADBAND_DEG=1.0;                              // ° (canónico del core; TCU 41061 = 45 pulsos)
/* El lazo entero, en un sitio: por debajo del umbral el motor NI ARRANCA, y lo
   que arranca va limitado a la velocidad del actuador. Misma regla y mismo
   orden que apply_control_loop del core (y que overcast.html). */
function lazoControl(prev,cmd,dtSec,deadband,rate){
  if(!prev)return slewLimit(prev,cmd,dtSec,rate);
  const db=(deadband==null?DEADBAND_DEG:deadband);
  const des=cmd.map((v,i)=>(db>0&&Math.abs(v-prev[i])<db)?prev[i]:v);
  return slewLimit(prev,des,dtSec,rate);
}
```

Se aplica **en el pipeline del día**, después de la política:

```
backtracking.html:4925-4931
        const ls=lazoControlSeg(prevS,segCmd(P.key,g.zen,g.az,Tcfg,T,o,irr[t],doy,c.albedo),STEP_MIN*60); prevS=ls;
...
        lim=lazoControl(prev,o.angles,STEP_MIN*60); prev=lim;
```

y también al astronómico de referencia (`backtracking.html:4945`).

**¿Entra en el cálculo anual?** `NO VERIFICADO`: la estimación anual está en
`backtracking.html:6901` y no se ha leído para comprobar si reusa `computeDay`
(que sí lleva lazo) o recalcula sin él.

---

# BLOQUE 6 — LA HIPÓTESIS DE MONOTONÍA

## 6.1 Puntos que asumen que reducir |θ| no puede crear sombra

Los cuatro sitios donde está escrita explícitamente:

```
backtracking.html:208
      min(|θ|) del grupo (reducir |θ| desde un ángulo de backtracking nunca crea sombra — la misma
```
(texto de la interfaz)

```
backtracking.html:651-654
   · el ángulo es COMÚN al grupo: se adopta el min(|θ|) de sus filas — reducir
     |θ| desde un ángulo de backtracking nunca crea sombra (la MISMA regla que
     el acoplado interior de compute_bt_angles);
```
→ implementado en `applyDrive` (`backtracking.html:675-683`), citado en 2.4.

```
backtracking.html:824-827
   v) y gana el menor |θ|: reducir |θ| desde un backtracking nunca crea
   sombra. Con vigas paralelas es UNA estación y sale lo de siempre, bit a
   bit. Solo con perfil por fila declarado (T.rowTilt): sin él el contador
   dibuja las filas horizontales y no hay torsión que mirar. */
```
→ `pairThetaTorsion`.

```
backtracking.html:2672-2675
/* acople por ACCIONAMIENTO: las mesas que mueve un mismo motor —las CUATRO de
   un bifila, dos por viga a cada lado del morro— van al MISMO θ, el min|θ| del
   grupo (reducir |θ| desde un backtracking nunca crea sombra) */
function applyDriveSeg(segAngles,grupos){
```

**Hay un punto donde el propio código declara que la hipótesis NO se cumple** —
con torsión, y por eso existe la reparación de `anglesPairwiseRaw`:

```
backtracking.html:1126-1130
  // REPARACIÓN con torsión: pasada de cero, la sombra de una pareja ya no es
  // monótona en cada fila por separado (la receptora a −11° y la emisora a
  // −6° sombrean donde las dos a −11° no). Se comprueba cada pareja con el
  // ray-cast 3D y, si sombrea, las dos filas van al más backtrackeado de los
  // dos (o medio grado más allá si ya iban iguales), hasta que ninguna
```

y otro donde se declara que aplanar hacia cero puede empeorar:

```
backtracking.html:742-745
  // OJO: la tangencia a sol rasante vive en θ ≈ pendiente del par (CON signo:
  // pvlib alinea el panel al plano del terreno), no en θ=0 — aplanar hacia cero
  // puede EMPEORAR. Por eso la búsqueda barre el rango firmado entero y elige
  // el ángulo sin sombra más CERCANO al actual (mínima distorsión de energía).
```

## 6.2 Bisecciones / búsquedas de raíz con predicado de un solo cruce

| Sitio | Iteraciones | Predicado |
|---|---|---|
| `backtracking.html:1215-1217` (`bt3dPairMaxMag`) | **36** | `shades(mag)` — auto-sombra 3D de la pareja |
| `backtracking.html:2379-2383` (`anglesMinGroundLight`) | **14** por unidad | `max(shadeRows(...)) <= 2e-3` |
| `backtracking.html:2246` (terreno, dentro del contador) | **3** refinos (tras 2 marchas) | `terrBlocked(...)` |

Cita de la primera, que es la que el documento del auditor llama «la bisección»:

```
backtracking.html:1215-1217
  let lo=0, hi=maxAngle;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2; if(shades(mid))hi=mid; else lo=mid;}
  return {mag:lo,sgn:sgn};
```

La estructura `lo/hi` con `if(shades(mid))hi=mid; else lo=mid;` converge al menor
`mag` que sombrea **sólo si el predicado es monótono en `mag`**; el código no
comprueba esa condición.

## 6.3 ¿Hay comprobación, test, assert o guarda de la hipótesis?

**NO EXISTE.** Búsqueda de «monoton» en `backtracking.html` y en
`tools/test_backtracking_sim.mjs`: sin coincidencias. Las dos únicas
coincidencias del repo están en otros simuladores y sobre otras magnitudes:

```
tools/test_overcast_sim.mjs:453
  // DENTRO de la misma banda —que es donde el escalón fallaba— y exige monotonía
```
```
tools/test_produccion.mjs:759
  // monotonía: bajar Pnom nunca sube el AC de ningún inversor
```

Lo que sí existe es la **reparación** citada en 6.1 (`backtracking.html:1126-1151`),
que corrige a posteriori los casos en que la hipótesis falla con torsión, pero no
es una comprobación de la hipótesis.

---

# BLOQUE 7 — MODELO ELÉCTRICO

## 7.1 Pérdida por subcadenas

```
backtracking.html:626-631
function elecLoss(f,nBypass){
  if(!(f>1e-6))return 0;
  if(nBypass<=0)return Math.min(1,f);
  return Math.min(1,Math.ceil(nBypass*f)/nBypass);
}
```

Con su justificación:

```
backtracking.html:617-625
/* Martinez escalonado: la sombra que sube por la cuerda va matando subcadenas
   de una en una, y cada una se lleva 1/n en cuanto se le sombrea UNA célula.
   OJO — n NO es «los diodos del módulo», es CUÁNTAS subcadenas atraviesa la
   sombra fila-a-fila, que depende de cómo esté montado el módulo:
     · retrato de célula entera → las tres corren a lo largo de la cuerda y la
       sombra las cruza a la vez: n=1 (se va el módulo entero);
     · retrato de media célula → las dos mitades van en paralelo: n=2;
     · tumbado → se apilan atravesando la cuerda: n=3.
```

## 7.2 De dónde sale `nb` (nBypass)

**Es un campo de configuración de la página, valor por defecto 2**, rango 0-6:

```
backtracking.html:179
      <div class="f"><label>Subcadenas en la cuerda</label><input id="nbp" type="number" step="1" min="0" max="6" value="2" title="CUÁNTAS subcadenas de diodo atraviesa la sombra al subir por la cuerda ...
```

No se deriva de datos del módulo. La justificación del valor por defecto:

```
backtracking.html:626-628
   El defecto es 2, que es la mesa 1V de Ayora (módulo de 2,384 m sobre la
   cuerda). Con n=3 —geometría de módulo tumbado— el astronómico ganaba al
   backtracking; con n=1 pierde. Es el parámetro que decide ese signo. */
```

## 7.3 A qué entidad se aplica y cómo se promedia

Se aplica **por estación axial** y se promedia sobre las estaciones del tramo:

```
backtracking.html:2176-2179
        // por ESTACIÓN axial: la sombra 3D es parcheada — Martinez se aplica a
        // la penetración de cuerda de CADA estación y se promedia eléctricamente
        // (aplicarlo al promedio de fila trataba un parche local como banda
        // uniforme en toda la mesa y multiplicaba la pérdida indebidamente)
```

```
backtracking.html:2291-2296
        elecSum+=elecLoss(fCol,T.nBypass); nCol++;
        hitS+=fCol; NS++; elecS+=elecLoss(fCol,T.nBypass);   // la cuenta de este tramo (v1.41)
        {const wg=v<(v0+v1)/2?0:1;hitW[wg]+=fCol;NW[wg]++;elecW[wg]+=elecLoss(fCol,T.nBypass);}   // la estación cae en su ala
```

y después, media aritmética por tramo: `segElec[r].push(NS?elecS/NS:0)`
(`backtracking.html:2297`). En el camino 2.5D (banda uniforme) se aplica sobre la
fracción de fila:

```
backtracking.html:2463-2465
    // sombra parcheada 3D: Martinez por estación axial (sh.elec); banda 2.5D
    // uniforme: Martinez sobre la fracción de fila, como siempre
    const se=(sh.elec&&sh.elec[r]!=null)?sh.elec[r]:elecLoss(sh[r],T.nBypass);
```

## 7.4 ¿Hay representación de string, caja de string, MPPT o inversor?

**En el modelo de cálculo, NO EXISTE.** No hay entidad eléctrica por encima de la
subcadena: `poaPlant` promedia POA por fila y no hay agrupación por string ni
inversor.

Lo que sí existe son **datos** de string en el levantamiento, usados para
geometría y para el reparto por ala, no para un modelo eléctrico:

```
backtracking.html:1631
    segMods.push(sg.map(o=>o.md!=null?o.md:null));   // módulos del STRING de esta mesa (del levantamiento)
```

```
backtracking.html:2479-2483
/* POA por ALA (v1.43): la misma cuenta que la fila/mesa (beam·(1−Martinez) +
   circunsolar·(1−óptica) + difusa) con la sombra que el contador 3D midió en
   CADA ala — la mesa larga lleva un string por ala y se sombrean distinto
```

## 7.5 ¿Se descuenta la difusa de cielo bloqueada por la fila vecina?

**No entra, y está declarado como pendiente**:

```
backtracking.html:2424-2428
/* Devuelve la difusa DESGLOSADA: el circunsolar (F1·A/B) es luz que viene del
   cono del sol, así que LO TAPA LA MISMA SOMBRA que tapa el haz — v1.31. El
   resto (isótropa + horizonte + albedo) viene de toda la bóveda y aquí no se
   sombrea: el bloqueo de cielo por la fila de delante es factor de vista, y
   está DECLARADO como pendiente. */
```

También declarado en la interfaz (`backtracking.html:294`).

## 7.6 Circunsolar: oclusión y factor

Se ocluye con la **fracción óptica** sombreada (no con la eléctrica), y lleva el
mismo IAM que el haz:

```
backtracking.html:2443-2445
    const A=Math.max(0,cosAoi), B=Math.max(Math.cos(85*RAD),Math.cos(z));
    circ=irr.dhi*F1*A/B*kBeam;                       // cono del sol → IAM del haz
```

```
backtracking.html:2466-2473
    const fo=Math.max(0,Math.min(1,sh[r]||0));       // fracción ÓPTICA sombreada
    // el circunsolar viene del cono del sol: lo tapa la sombra, en proporción
    // al ÁREA tapada (sin amplificación de subcadena — eso es óptica, no
    // electricidad). Las dos cotas de la banda salen del mismo cálculo:
    //   plantHi = circunsolar SIN sombrear (lo que hacíamos hasta v1.30)
    //   plantLo = la subcadena muerta tampoco convierte SU circunsolar
    const v=p.beam*(1-se)+p.circ*(1-fo)+p.sky+p.gnd;
    cOpt+=p.circ*fo; cEle+=p.circ*se;
```

El modelo de difusa es **Perez 1990** con los coeficientes tabulados en
`backtracking.html:2395-2405` y `PEREZ_BINS` en `2395`.

---

# BLOQUE 8 — AGREGACIÓN DE POA

## 8.1 y 8.2 Cálculo de la POA de planta

```
backtracking.html:2453-2478
function poaPlant(zen,az,T,rowAngles,irr,doy,albedo,fast){
  // beam·(1 − Martinez) + difusa, fila a fila; planta = MEDIA por fila (la
  // agregación energética correcta: POA(θ media) ≠ media de POA(θ_r)).
  // fast=true: contador 2.5D rápido — SOLO para la búsqueda de optimizadores
  const sh=fast?shadeRows25(zen,az,T,rowAngles):shadeRows(zen,az,T,rowAngles);
  let sum=0, cOpt=0, cEle=0; const rows=[];
...
  for(let r=0;r<rowAngles.length;r++){
    const p=poaRow(rowAngles[r],rowTiltAt(T,r),T.axisAz,zen,az,irr,doy,albedo,T.iam);
...
    rows.push(v); sum+=v;
  }
  const n=rowAngles.length;
  return {rows:rows,plant:sum/n,plantHi:(sum+cOpt)/n,plantLo:(sum-(cEle-cOpt))/n,shade:sh,wings:wings};
}
```

**Media aritmética SOBRE FILAS, no ponderada**: `sum/n` con `n = rowAngles.length`.
No hay ponderación por área, por largo de mesa ni por número de módulos en esta
función.

Existe además una variante por mesa:

```
backtracking.html:2698-2699
function poaPlantSeg(zen,az,T,segAngles,irr,doy,albedo){
  const sh=shadeRows(zen,az,T,segAngles);
```
`NO VERIFICADO`: no se ha leído su agregador para decir si pondera por mesa o
promedia igual.

## 8.3 Filas de borde sin emisora

**Entran en la media**: el bucle de `poaPlant` recorre `r = 0 … rowAngles.length-1`
sin excluir extremos, y divide por `n = rowAngles.length`. No hay filtro de borde
en esa función.

## 8.4 Del instante al día y del día al año

Paso temporal e integración:

```
backtracking.html:4858
const STEP_MIN=5;
```
```
backtracking.html:4963
  const dtH=STEP_MIN/60;
```

`NO VERIFICADO`: la elección de los 12 días representativos y el paso de la
estimación anual están en `backtracking.html:6901` y siguientes, que no se han
leído en esta pasada.

---

# BLOQUE 11 — DOS CÁLCULOS CONCRETOS

Ejecutado con la física extraída del bloque FÍSICA PURA en Node (no navegador),
sobre el commit `3a57451`.

**Parámetros que el enunciado NO fija y que se han tenido que elegir** (afectan a
la POA y por tanto son parte del resultado): lat/lon **41,57634 / −0,79814**,
huso **+2** (21-jun ⇒ 07:30 local = **05:30 UTC**), altitud **739 m**, turbidez
Linke **3,5**, albedo **0,20**. Los tres últimos son los que declara
`tools/export_consignas.mjs:177` (`const ALT = 739, TL = 3.5, ALB = 0.20`).
El instante UTC coincide con el que usa la batería para el caso B
(`tools/test_backtracking_sim.mjs:343`: `Date.UTC(2026, 5, 21, 5, 30)`).

La semilla reproduce **exactamente** los seis tilts del enunciado:

```
tilts que produce mulberry32(1234) con amplitud 4: -3.41 / 1.63 / 3.22 / 3.76 / -3.67 / -3.06
los del enunciado:                                 -3.41 / 1.63 / 3.22 / 3.76 / -3.67 / -3.06
```

## 11.1 Caso B — NO REPRODUCE

Salida real:

```
=== 11.1 CASO B ===
sol: elev 9.283°  az 66.726°  zen 80.717°
cielo: ghi 82.43  dni 324.71  dhi 30.05
tilts N-S: -3.41 / 1.63 / 3.22 / 3.76 / -3.67 / -3.06
MV (estaciones): 33
pairwise  θ = -2.00 / -2.00 / 15.92 / -2.00 / -2.00 / 38.10
          POA planta = 108.74 W/m²  ·  sombra planos máx = 12.97 %
true3d    θ = 0.00 / 0.00 / 12.29 / 0.00 / 0.00 / 32.79
          POA planta = 109.01 W/m²  ·  sombra planos máx = 13.07 %
=== 11.2 BARRIDO DE θ UNIFORME, CONTADOR EXACTO, paso 0,25° ===
```

| | enunciado | obtenido |
|---|---|---|
| pairwise θ | −10° | **−2,00 / −2,00 / 15,92 / −2,00 / −2,00 / 38,10** |
| true-3D θ | −10° | **0,00 / 0,00 / 12,29 / 0,00 / 0,00 / 32,79** |
| POA | 38 W/m² | **108,74** (pairwise) · **109,01** (true-3D) |

No se ha encontrado en la batería ninguna comprobación que fije −10° ni 38 W/m²
para este caso: las que usan `casoB` son de convergencia de estaciones
(`tools/test_backtracking_sim.mjs:350`) y de oráculo independiente (`:366`).

**Lo obtenido SÍ casa con la tabla de `docs/algoritmos_backtracking.html` §5**,
que para el caso B publica:

```
  Pairwise   θ −2…38     sombra 13,4 % (irreducible)   POA 105
  True-3D    θ 0…32,8    sombra 13,8 % (irreducible)   POA 105
```

frente a lo ejecutado aquí: pairwise θ **−2,00 … 38,10**, sombra de planos
**12,97 %**, POA **108,74**; true-3D θ **0,00 … 32,79**, sombra **13,07 %**, POA
**109,01**. Los rangos de θ coinciden; las diferencias de sombra (0,4-0,7 pp) y
de POA (≈3,7 W/m²) `NO VERIFICADO` a qué se deben — candidatos no comprobados:
que la sombra del documento sea la publicada (con estructura) y no la de planos,
y los parámetros de cielo que el enunciado no fija (altitud, turbidez, albedo).

`NO VERIFICADO` de dónde salen los valores «−10° y 38 W/m²» del enunciado: no
están en el código, ni en la batería, ni en la tabla de la documentación. Se hace
constar, sin interpretarlo, que el valor **38** aparece en el vector de θ
obtenido (la última fila, 38,10°) y que la documentación escribe ese mismo rango
como «−2…38».

## 11.2 Barrido de θ uniforme, contador exacto, −55° a +55° en pasos de 0,25°

Mismo instante y mismo terreno. «Sombra de planos» = `shadeBand3DAll(...,{noStruct:true})`,
máximo sobre las 6 filas. «Sombra publicada» = `shadeBand3DAll(...)` sin
`noStruct` (con viga y canto), máximo sobre las 6 filas. POA de planta =
`poaPlant(...).plant`.

```
theta;sombra_planos_max_%;sombra_publicada_max_%;POA_planta_W_m2
-55.00;27.891;28.413;23.262
-54.75;27.754;28.280;23.247
-54.50;27.615;28.144;23.232
-54.25;27.473;28.007;23.217
-54.00;27.330;27.868;23.202
-53.75;27.185;27.727;23.187
-53.50;27.043;27.584;23.171
-53.25;26.960;27.440;23.156
-53.00;26.875;27.293;23.140
-52.75;26.803;27.144;23.124
-52.50;26.730;26.993;23.108
-52.25;26.657;26.840;23.092
-52.00;26.582;26.752;23.076
-51.75;26.506;26.678;23.060
-51.50;26.429;26.603;23.043
-51.25;26.352;26.526;23.027
-51.00;26.273;26.449;23.010
-50.75;26.193;26.371;22.993
-50.50;26.112;26.291;22.976
-50.25;26.030;26.210;22.959
-50.00;25.946;26.129;22.942
-49.75;25.862;26.046;22.925
-49.50;25.776;25.962;22.907
-49.25;25.689;25.876;22.890
-49.00;25.601;25.790;22.872
-48.75;25.512;25.702;22.854
-48.50;25.421;25.613;22.836
-48.25;25.329;25.523;22.818
-48.00;25.236;25.431;22.800
-47.75;25.142;25.338;22.782
-47.50;25.050;25.248;22.763
-47.25;24.970;25.170;22.745
-47.00;24.888;25.090;22.726
-46.75;24.805;25.009;22.707
-46.50;24.721;24.927;22.689
-46.25;24.636;24.843;22.670
-46.00;24.549;24.758;22.650
-45.75;24.462;24.672;22.631
-45.50;24.372;24.585;22.612
-45.25;24.282;24.496;22.592
-45.00;24.190;24.406;22.573
-44.75;24.096;24.315;22.553
-44.50;24.002;24.222;22.533
-44.25;23.905;24.128;22.513
-44.00;23.807;24.032;22.493
-43.75;23.708;23.935;22.473
-43.50;23.607;23.836;22.453
-43.25;23.505;23.735;22.433
-43.00;23.400;23.633;22.412
-42.75;23.295;23.530;22.392
-42.50;23.189;23.426;22.371
-42.25;23.100;23.339;22.350
-42.00;23.009;23.251;22.329
-41.75;22.918;23.161;22.308
-41.50;22.824;23.070;22.287
-41.25;22.729;22.977;22.266
-41.00;22.633;22.883;22.245
-40.75;22.534;22.787;22.223
-40.50;22.434;22.690;22.201
-40.25;22.333;22.591;22.180
-40.00;22.229;22.490;22.158
-39.75;22.124;22.387;22.136
-39.50;22.017;22.283;22.114
-39.25;21.908;22.177;22.092
-39.00;21.797;22.068;22.070
-38.75;21.684;21.958;22.048
-38.50;21.569;21.846;22.025
-38.25;21.452;21.732;22.003
-38.00;21.333;21.615;21.980
-37.75;21.212;21.497;21.957
-37.50;21.113;21.401;21.935
-37.25;21.012;21.303;21.912
-37.00;20.909;21.203;21.889
-36.75;20.805;21.102;21.866
-36.50;20.698;20.998;21.842
-36.25;20.589;20.893;21.819
-36.00;20.478;20.785;21.796
-35.75;20.365;20.675;21.772
-35.50;20.229;20.563;21.749
-35.25;20.084;20.449;21.725
-35.00;19.937;20.332;21.701
-34.75;19.787;20.213;21.677
-34.50;19.633;20.092;21.653
-34.25;19.465;19.968;21.629
-34.00;19.277;19.820;21.605
-33.75;19.112;19.689;21.581
-33.50;18.945;19.557;21.556
-33.25;18.774;19.422;21.532
-33.00;18.617;19.307;21.507
-32.75;18.439;19.184;21.483
-32.50;18.257;19.041;21.458
-32.25;18.071;18.896;21.433
-32.00;17.881;18.746;21.408
-31.75;17.686;18.594;21.383
-31.50;17.487;18.431;21.358
-31.25;17.283;18.239;21.333
-31.00;17.075;18.043;21.308
-30.75;16.861;17.841;21.282
-30.50;16.643;17.635;21.257
-30.25;16.419;17.424;21.231
-30.00;16.189;17.208;21.206
-29.75;15.954;16.986;21.180
-29.50;15.713;16.759;21.154
-29.25;15.465;16.526;21.129
-29.00;15.211;16.287;21.103
-28.75;14.955;16.045;21.077
-28.50;14.726;15.831;21.050
-28.25;14.490;15.612;21.024
-28.00;14.271;15.408;20.998
-27.75;14.061;15.214;20.972
-27.50;13.862;15.016;20.945
-27.25;13.681;14.812;20.919
-27.00;13.495;14.601;20.892
-26.75;13.304;14.385;20.866
-26.50;13.108;14.162;20.839
-26.25;12.905;13.933;20.812
-26.00;12.696;13.723;20.785
-25.75;12.481;13.524;20.758
-25.50;12.259;13.319;20.731
-25.25;12.030;13.108;20.704
-25.00;11.793;12.889;20.677
-24.75;11.549;12.664;20.650
-24.50;11.297;12.431;20.622
-24.25;11.082;12.236;20.595
-24.00;10.864;12.038;20.568
-23.75;10.638;11.834;20.540
-23.50;10.404;11.622;20.512
-23.25;10.180;11.402;20.485
-23.00;9.983;11.174;20.457
-22.75;9.779;10.938;20.429
-22.50;9.568;10.693;20.402
-22.25;9.403;10.493;20.374
-22.00;9.232;10.285;20.346
-21.75;9.053;10.101;20.318
-21.50;8.868;9.938;20.290
-21.25;8.674;9.767;20.261
-21.00;8.472;9.589;20.233
-20.75;8.260;9.403;20.205
-20.50;8.040;9.209;20.177
-20.25;7.816;9.013;20.148
-20.00;7.645;8.870;20.120
-19.75;7.465;8.721;20.091
-19.50;7.277;8.565;20.063
-19.25;7.079;8.400;20.034
-19.00;6.917;8.227;20.005
-18.75;6.779;8.044;19.977
-18.50;6.633;7.851;19.948
-18.25;6.479;7.648;19.919
-18.00;6.316;7.432;19.890
-17.75;6.144;7.301;19.861
-17.50;5.960;7.151;19.832
-17.25;5.765;7.031;19.803
-17.00;5.557;6.913;19.774
-16.75;5.335;6.787;19.745
-16.50;5.097;6.652;19.716
-16.25;4.841;6.506;19.687
-16.00;4.625;6.408;19.658
-15.75;4.450;6.361;19.629
-15.50;4.260;6.309;19.599
-15.25;4.054;6.253;19.570
-15.00;3.835;6.192;19.541
-14.75;3.732;6.125;19.511
-14.50;3.618;6.052;19.482
-14.25;3.492;5.971;19.453
-14.00;3.352;5.881;19.423
-13.75;3.196;5.780;19.394
-13.50;3.022;5.667;19.364
-13.25;2.824;5.540;19.335
-13.00;2.599;5.394;19.305
-12.75;2.341;5.227;19.276
-12.50;2.040;5.032;19.246
-12.25;1.686;4.803;19.217
-12.00;1.281;4.546;19.187
-11.75;1.094;4.539;19.157
-11.50;0.863;4.455;19.128
-11.25;0.569;4.435;19.098
-11.00;0.182;4.407;19.069
-10.75;0.091;4.368;19.039
-10.50;0.750;4.312;19.010
-10.25;1.168;4.222;18.980
-10.00;1.456;4.054;18.951
-9.75;1.667;3.864;18.921
-9.50;1.828;3.953;18.892
-9.25;1.955;4.022;18.862
-9.00;2.058;4.078;18.833
-8.75;2.143;4.124;18.804
-8.50;2.214;4.251;18.974
-8.25;2.274;4.329;19.651
-8.00;2.327;4.380;20.447
-7.75;2.372;4.415;21.243
-7.50;2.412;4.440;22.039
-7.25;2.447;4.460;22.835
-7.00;2.479;4.541;23.630
-6.75;2.507;4.610;24.376
-6.50;2.533;4.870;25.163
-6.25;2.663;5.089;26.156
-6.00;2.814;5.275;27.221
-5.75;2.952;5.436;28.285
-5.50;3.078;5.577;29.641
-5.25;3.195;5.700;31.242
-5.00;3.303;5.809;32.844
-4.75;3.404;5.907;34.434
-4.50;3.603;5.994;36.031
-4.25;3.789;6.073;37.628
-4.00;3.962;6.144;39.162
-3.75;4.124;6.210;40.755
-3.50;4.276;6.269;42.347
-3.25;4.419;6.324;43.940
-3.00;4.553;6.374;45.533
-2.75;4.753;6.421;47.046
-2.50;4.956;6.548;48.546
-2.25;5.164;6.690;50.125
-2.00;5.397;6.823;51.705
-1.75;5.616;6.947;53.233
-1.50;5.820;7.063;54.809
-1.25;6.012;7.193;56.285
-1.00;6.192;7.340;57.858
-0.75;6.362;7.492;59.432
-0.50;6.523;7.704;61.006
-0.25;6.759;7.990;62.466
0.00;6.986;8.263;64.038
0.25;7.201;8.522;65.611
0.50;7.456;8.768;67.185
0.75;7.722;9.001;68.761
1.00;7.975;9.222;70.337
1.25;8.216;9.433;71.914
1.50;8.458;9.646;73.257
1.75;8.743;9.905;74.826
2.00;9.016;10.152;76.395
2.25;9.278;10.388;77.858
2.50;9.527;10.614;79.423
2.75;9.767;10.830;80.874
3.00;9.996;11.038;82.313
3.25;10.217;11.279;83.866
3.50;10.429;11.527;85.419
3.75;10.632;11.765;86.970
4.00;10.828;11.994;88.520
4.25;11.016;12.215;89.895
4.50;11.198;12.427;91.302
4.75;11.421;12.632;92.659
5.00;11.641;12.830;94.194
5.25;11.901;13.069;95.725
5.50;12.157;13.304;97.255
5.75;12.421;13.549;98.434
6.00;12.708;13.816;99.754
6.25;12.985;14.075;101.104
6.50;13.254;14.326;102.612
6.75;13.514;14.568;104.118
7.00;13.765;14.803;105.623
7.25;14.010;15.030;107.125
7.50;14.246;15.251;108.626
7.75;14.476;15.465;109.944
8.00;14.699;15.673;111.436
8.25;14.915;15.875;112.926
8.50;15.125;16.070;114.035
8.75;15.329;16.261;115.316
9.00;15.528;16.446;116.788
9.25;15.721;16.625;118.258
9.50;15.908;16.800;119.725
9.75;16.091;16.971;121.190
10.00;16.276;17.143;122.401
10.25;16.486;17.341;123.857
10.50;16.691;17.534;125.311
10.75;16.903;17.735;126.761
11.00;17.134;17.955;127.985
11.25;17.359;18.170;129.425
11.50;17.579;18.379;130.863
11.75;17.793;18.583;132.299
12.00;18.003;18.782;133.732
12.25;18.207;18.944;135.163
12.50;18.406;19.101;136.593
12.75;18.601;19.255;137.733
13.00;18.791;19.404;139.154
13.25;18.977;19.551;140.572
13.50;19.151;19.694;141.987
13.75;19.297;19.812;143.401
14.00;19.441;19.918;144.812
14.25;19.581;20.022;145.956
14.50;19.734;20.140;146.500
14.75;19.897;20.268;147.612
15.00;20.057;20.394;148.991
15.25;20.184;20.506;150.090
15.50;20.309;20.598;151.461
15.75;20.430;20.688;152.829
16.00;20.550;20.776;153.894
16.25;20.667;20.862;155.252
16.50;20.781;20.947;156.607
16.75;20.900;21.053;157.957
17.00;21.010;21.135;159.306
17.25;21.118;21.214;160.337
17.50;21.224;21.292;161.676
17.75;21.328;21.369;162.702
18.00;21.429;21.444;164.030
18.25;21.518;21.518;165.355
18.50;21.590;21.591;166.356
18.75;21.661;21.662;167.339
19.00;21.738;21.739;168.283
19.25;21.831;21.831;169.584
19.50;21.922;21.922;170.881
19.75;22.011;22.012;172.175
20.00;22.099;22.099;173.465
20.25;22.185;22.185;174.402
20.50;22.270;22.270;175.681
20.75;22.353;22.353;176.958
21.00;22.434;22.435;177.882
21.25;22.515;22.515;178.793
21.50;22.594;22.594;180.050
21.75;22.671;22.672;180.935
22.00;21.859;22.748;181.782
22.25;22.033;22.823;183.022
22.50;22.204;22.897;183.893
22.75;22.373;22.969;185.123
23.00;22.538;23.100;186.349
23.25;22.702;23.258;187.186
23.50;22.862;23.414;188.401
23.75;23.021;23.567;189.194
24.00;23.176;23.718;189.971
24.25;23.330;23.867;191.164
24.50;23.481;24.013;192.358
24.75;23.630;24.158;193.144
25.00;23.777;24.312;194.325
25.25;23.921;24.470;195.503
25.50;24.063;24.624;196.682
25.75;24.203;24.777;197.859
26.00;24.342;24.927;199.032
26.25;24.478;25.075;199.793
26.50;24.626;25.221;200.531
26.75;24.775;25.365;201.264
27.00;24.922;25.507;201.988
27.25;25.067;25.647;203.122
27.50;25.209;25.785;204.256
27.75;25.366;25.937;205.389
28.00;25.521;26.087;206.077
28.25;25.673;26.234;206.761
28.50;25.826;26.384;207.435
28.75;25.990;26.543;208.060
29.00;26.151;26.700;208.709
29.25;26.311;26.854;209.793
29.50;26.468;27.007;209.970
29.75;26.623;27.157;210.591
30.00;26.775;27.306;211.200
30.25;26.926;27.452;212.254
30.50;27.075;27.597;213.304
30.75;27.221;27.739;213.889
31.00;27.366;27.880;214.927
31.25;27.509;28.018;215.021
31.50;27.649;28.155;216.045
31.75;27.788;28.290;216.593
32.00;27.925;28.423;217.605
32.25;28.061;28.554;218.103
32.50;28.194;28.684;218.130
32.75;28.326;28.811;219.102
33.00;28.456;28.944;219.092
33.25;28.584;29.081;220.049
33.50;28.711;29.217;220.512
33.75;28.836;29.351;220.948
34.00;28.959;29.483;221.896
34.25;29.081;29.613;221.280
34.50;29.208;29.742;222.217
34.75;29.339;29.869;222.137
35.00;29.469;29.995;222.520
35.25;29.609;30.131;223.434
35.50;29.748;30.266;223.833
35.75;29.885;30.398;223.676
36.00;30.020;30.530;224.052
36.25;30.153;30.659;224.935
36.50;30.285;30.787;224.215
36.75;30.415;30.913;225.080
37.00;30.550;31.045;225.419
37.25;30.689;31.180;225.186
37.50;30.825;31.313;226.029
37.75;30.960;31.444;226.868
38.00;31.094;31.573;226.601
38.25;31.225;31.701;227.425
38.50;31.355;31.827;227.160
38.75;31.483;31.952;227.396
39.00;31.610;32.075;228.198
39.25;31.735;32.196;228.450
39.50;31.859;32.316;228.661
39.75;31.981;32.435;228.894
40.00;32.101;32.552;229.670
40.25;32.220;32.667;229.272
40.50;32.338;32.781;228.911
40.75;32.454;32.894;229.662
41.00;32.569;33.005;229.818
41.25;32.682;33.115;229.994
41.50;32.794;33.224;230.727
41.75;32.905;33.331;230.289
42.00;33.014;33.437;231.008
42.25;33.122;33.541;231.723
42.50;33.228;33.650;231.278
42.75;33.333;33.761;231.375
43.00;33.437;33.871;231.486
43.25;33.540;33.979;231.594
43.50;33.641;34.086;231.660
43.75;33.742;34.194;232.333
44.00;33.856;34.308;232.412
44.25;33.971;34.420;233.073
44.50;34.086;34.530;231.891
44.75;34.199;34.640;232.536
45.00;34.310;34.748;233.177
45.25;34.420;34.854;233.187
45.50;34.529;34.959;233.817
45.75;34.636;35.063;234.443
46.00;34.742;35.166;235.065
46.25;34.847;35.267;235.049
46.50;34.951;35.368;235.660
46.75;35.053;35.466;235.651
47.00;35.155;35.566;235.003
47.25;35.262;35.671;234.333
47.50;35.369;35.774;234.915
47.75;35.474;35.875;235.493
48.00;35.578;35.976;235.421
48.25;35.680;36.075;235.989
48.50;35.781;36.173;236.552
48.75;35.881;36.270;236.489
49.00;35.980;36.365;236.390
49.25;36.077;36.459;236.301
49.50;36.173;36.552;236.842
49.75;36.268;36.644;237.378
50.00;36.362;36.735;237.251
50.25;36.455;36.824;237.777
50.50;36.546;36.912;238.298
50.75;36.636;37.000;238.816
51.00;36.725;37.086;238.689
51.25;36.813;37.170;238.528
51.50;36.900;37.254;239.030
51.75;36.986;37.337;238.874
52.00;37.070;37.418;239.365
52.25;37.154;37.499;238.522
52.50;37.236;37.578;239.001
52.75;37.317;37.650;239.477
53.00;37.398;37.722;239.948
53.25;37.477;37.792;240.415
53.50;37.555;37.861;240.196
53.75;37.632;37.928;240.654
54.00;37.708;37.989;241.107
54.25;37.780;38.050;241.556
54.50;37.848;38.110;240.644
54.75;37.915;38.169;241.081
55.00;37.981;38.225;241.514
```

### Los cinco datos pedidos

```
fs(θ=0°) = 6.986 %   ·   POA(θ=0°) = 64.038 W/m²
θ de POA máxima = 54.25°  ·  POA = 241.556 W/m²  ·  su sombra de planos = 37.780 %
θ con sombra de planos EXACTAMENTE 0: NINGUNO
cambios de signo del predicado «sombrea / no sombrea»: 0
```

- **fs(θ = 0°) = 6,986 %** · **POA(θ = 0°) = 64,038 W/m²**
- **θ uniforme de POA máxima = +54,25°**, POA **241,556 W/m²**, con sombra de
  planos **37,780 %**
- **θ con sombra de planos exactamente 0: NINGUNO** en todo el barrido
- **Cambios de signo del predicado «sombrea / no sombrea»: 0**

Sin interpretación.

---

# BLOQUE 9 — CONSTANTES CABLEADAS

Tabla de las constantes numéricas localizadas que influyen en una decisión.
«Configurable» = existe un campo de la interfaz que la cambia (lista en
`backtracking.html:7593`, `INPUT_IDS`).

| archivo:línea | nombre | valor | qué decide | config. | origen documentado |
|---|---|---|---|---|---|
| `backtracking.html:877` | `AOI_HAZ` | 88 | techo del cono de haz (AOI máximo aceptado) | N | S (comentario de `conoHaz`) |
| `backtracking.html:894` | `E_EMPATE_W` | 0,05 W/m² | banda de empate energético en guardias y certificados | N | S |
| `backtracking.html:907` | `PASO_BUSQ` | 0,1° | resolución de mando de las búsquedas | N | S («la que busca la política») |
| `backtracking.html:908` | `PASO_GRUESO` | 0,5° | paso del tramo antes de afinar | N | S |
| `backtracking.html:909` | `PASO_GRUESO_UNI` | 2,5° | tramo del barrido uniforme | N | S |
| `backtracking.html:1216` | (literal) | **36** iteraciones | bisección de `bt3dPairMaxMag` | N | S (`438`: «bisección 36 iteraciones») |
| `backtracking.html:1226` | `MARGIN` | 0,5° | margen bajo el tope sin auto-sombra (true-3D) | N | S |
| `backtracking.html:1226` | `EPS_TILT` | 0,5° | umbral de degeneración 2.5D | N | S |
| `backtracking.html:1250` | (literal) | `zen<82` | deferral de true-3D a la baseline | N | S |
| `backtracking.html:1226` | (literal) | `zen<87` | corte superior de true-3D | N | parcial |
| `backtracking.html:1138` | `ITS` | 60 (= 12·0,5/0,1) | tope de la reparación con torsión de pairwise | N | S (v1.60) |
| `backtracking.html:746` | `paso` | 0,25° / 1,0° | paso del barrido de `driveCoupleSafe` (1,0 si >30 parejas) | N | S |
| `backtracking.html:745` | (literal) | 6 | iteraciones de `driveCoupleSafe` | N | N |
| `backtracking.html:2372` | (literal) | **3** pasadas | ascenso de min-ground-light | N | N |
| `backtracking.html:2379` | (literal) | **14** | bisección por unidad en min-ground-light | N | N |
| `backtracking.html:2381` | (literal) | 2e-3 | umbral de sombra en esa bisección | N | N |
| `backtracking.html:3181` | (literal) | **0,02** | umbral de entrada de la reparación global (`E.mx<=0.02` ⇒ no repara) | N | S |
| `backtracking.html:3193` | (literal) | **5°** | paso del barrido uniforme de arranque de la reparación | N | S |
| `backtracking.html:3194` | (literal) | 2,5 / 1,25 / 0,625 | refinos de ese arranque | N | S |
| `backtracking.html:3225` | `ESCALERA` | [2, 0,5, 0,1] | pasos del descenso de la reparación | N | S (v1.61, con medida) |
| `backtracking.html:3227` | (literal) | **36** | iteraciones del descenso | N | N |
| `backtracking.html:2726` | `OPT_FRACTIONS` | [0, 0,25, 0,5, 0,75, 1] | rejilla gruesa de f del energy-optimal | N | S |
| `backtracking.html:2781` | `OPT_REFINA` | 2 | refinos por lado alrededor de la f ganadora | N | S |
| `backtracking.html:2937` | `OPTFREE_F0`, `OPTFREE_NF` | −0,5 · 13 | rango y nº de la rejilla del óptimo libre | N | parcial |
| `backtracking.html:3044` | `TRACKER_SLEW` | 0,17 °/s | velocidad del actuador en el lazo | N (constante) | S («spec del actuador») |
| `backtracking.html:3061` | `DEADBAND_DEG` | 1,0° | banda muerta del lazo | parámetro opcional de `lazoControl` | S (canónico del core; TCU 41061 = 45 pulsos) |
| `backtracking.html:1828` | `MOD_OFF` | 0,14 m | cara del módulo sobre el eje | N | S (`seguidor.js`) |
| `backtracking.html:1828` | `TUBE` | 0,12 m | lado de la viga de torsión | N | S (`seguidor.js D.tube`) |
| `backtracking.html:1828` | `GLASS` | 0,06 m | canto del laminado | N | S |
| `backtracking.html:1832` | `REC_OFF` | 0,17 m | defecto del campo «cara sup–eje» | **S** (`z0`) | S |
| `backtracking.html:1572` | `gDrive` | 0,55 m | hueco del morro entre las dos mesas | del dato (`data.mod.gapDrive`) | S |
| `backtracking.html:167` | `cw` | 2,382 m | ancho del colector | **S** | N |
| `backtracking.html:171` | `maxang` | **±55°** | tope mecánico | **S** | N |
| `backtracking.html:179` | `nbp` (`nBypass`) | **2** | subcadenas que cruza la sombra (Martinez) | **S** | S (comentario de `elecLoss`) |
| `backtracking.html:180` | `iam` (`b0`) | **0,05** | IAM ASHRAE | **S** | S |
| `backtracking.html:842-856` | `mvPara` | 8 … 64 (8 en planta medida) | estaciones axiales de cuadratura | vía `T.mv`/`res.MV` | S |
| `backtracking.html:2246` | (literal) | 3 | refinos de la bisección de terreno | N | S (comentario «2 marchas + 3 refinos») |
| `backtracking.html:2082` | (literal) | 9 m | suelo de la altura útil para el alcance | N | S |
| `backtracking.html:3856` | `CERT_PASO` | 0,1° | paso del barrido del probador | N | S |
| `backtracking.html:3865` | `CERT_VECINOS` | 40 (±4°) | perturbación de una unidad sola en el probador | N | S |
| `backtracking.html:4858` | `STEP_MIN` | 5 min | paso temporal del día | N | S |
| `backtracking.html:2395` | `PEREZ_BINS` | 8 bins | modelo de difusa Perez 1990 | N | S |

**Del listado que pedía el enunciado, no se ha encontrado**: «8° de deferral»
(el deferral del código es por **cénit ≥ 82°**, `backtracking.html:1250`, no 8°),
«2 % de reparación» (el umbral del código es **0,02 en fracción**, es decir 2 %,
`backtracking.html:3181` — coincide), «8 barridos» (`NO ENCONTRADO`), «32
estaciones» (el código usa 8…64 adaptativo, `backtracking.html:842-856`; 32 no es
una constante del código, aparece en comentarios como valor probado), «0,06 m» =
`GLASS` ✓, «0,12 m» = `TUBE` ✓, «0,17 m» = `REC_OFF` ✓, «0,55 m» = `gDrive` ✓.

---

# BLOQUE 12 — DETERMINISMO Y REPRODUCIBILIDAD

## 12.1 ¿Mismo input, mismo output bit a bit? ¿Hay aleatoriedad?

Hay un generador pseudoaleatorio **con semilla explícita**, `mulberry32`, usado
para los presets de terreno aleatorio:

```
backtracking.html (sandbox de la batería lo exporta como `mulberry32`)
tools/test_backtracking_sim.mjs:337
  const r = F.mulberry32(1234); const tilts = []; for (let i = 0; i < nR; i++) tilts.push(conTorsion ? (r() * 2 - 1) * 4 : 0);
```

Comprobado en esta sesión: con semilla 1234 y amplitud 4 devuelve exactamente
`-3.41 / 1.63 / 3.22 / 3.76 / -3.67 / -3.06` (bloque 11).

`Math.random`: `NO VERIFICADO` — no se ha hecho una búsqueda exhaustiva en el
fichero.

**Orden de iteración de objetos**: hay al menos un punto donde se itera un objeto
con `for...in` y el resultado se acumula:

```
backtracking.html:2262
        for(const e in porE)atr[r][e]=(atr[r][e]||0)+unir(porE[e]);
```
Las claves son índices de fila (enteros), cuyo orden de iteración está
especificado en JS (ascendente), así que ahí no hay indeterminación. `NO
VERIFICADO` si hay otros `for...in` sobre claves no enteras que afecten a un
resultado numérico.

Hay **memoización** que puede hacer que el resultado dependa del historial de
llamadas dentro de un proceso:

```
backtracking.html:1100-1110
function anglesPairwise(zen,az,T){
  let memo=_APW.get(T);
  const sig=sigT(T);
  if(!memo||memo.sig!==sig){memo={sig:sig,map:new Map()};_APW.set(T,memo);}
```
```
backtracking.html:3190-3196
  const M=repairNoShade._memo;
  if(!M||M.key!==key||M.T!==T){
```
La segunda está cacheada por `(zen, az, hLo, hHi)` **y por identidad de `T`**; el
comentario de `pairEval3D` advierte de que los tests mutan `T` in situ
(`backtracking.html:829-831`), lo que motivó memorizar por entradas numéricas en
ese otro caso.

## 12.2 ¿Los resultados publicados llevan versión, SHA y hash de inputs?

**Versión sí.** El sello del certificador y el informe leen `VER`:

```
backtracking.html:4010-4011
/* VER ya no se declara aquí: vive dentro de FÍSICA PURA para que el sello del
   certificador pueda leerla. Ver el comentario de su declaración. */
```

El exportador de consignas sella con versión y herramienta:

```
tools/export_consignas.mjs:244
  generado_por: `backtracking.html ${VER} · tools/export_consignas.mjs`,
```

**SHA de commit y hash de inputs: NO ENCONTRADO.** No se ha localizado ningún
punto que incruste el SHA de git ni un hash de los ficheros de entrada en la
salida.

## 12.3 Versionado

```
backtracking.html:459
const VER='v1.68.0';
```

Vive **dentro** del bloque FÍSICA PURA (427-4006), por la razón citada arriba.
Qué lo cambia: se edita a mano en cada cambio publicado; existe además un banco
que exige que no se quede por detrás de la versión más nueva que el propio
fichero se nombra en sus comentarios (traído por el PR #673, ver bloque 10.6), y
un careo entre repos que compara esa constante con la tarjeta del Panel
(`proyectos/tests/test_versiones_app.mjs`).

---

# BLOQUE 10 — VERIFICACIÓN EXISTENTE

## 10.1 `tools/test_backtracking_sim.mjs`

El fichero tiene **136 comprobaciones registradas con `t(...)`** (`grep -c '^t('`),
no 177; la salida de la última ejecución en esta sesión decía **211
comprobaciones** porque varias `t()` se generan en bucle (barrido reducido) y
porque el contador `N` cuenta invocaciones, no literales. `NO VERIFICADO`: no se
ha desglosado una por una con su tolerancia; lo que sigue son los grupos
identificados por sus nombres y las tolerancias que aparecen en su código.

| Grupo (prefijo del nombre) | Qué asertan | Tolerancia citada |
|---|---|---|
| `H1` convergencia de estaciones | `shadeBand3DAll` publicado ≡ convergido MV 256 | `|Δ| ≤ 0,015` (1,5 pp) y no menos de la mitad del convergido (`:356-358`) |
| `H7` oráculo independiente | contador ≡ oráculo de rectángulos con muestreo 200×400 | **≤ 0,5 pp** (título, `:366`) |
| barrido reducido | contador ≡ oráculo, sin-sombra ≤ 5 % de filas, energía y acople | ver 10.3 |
| v1.62 slew | ningún par de minutos consecutivos supera `SLEW·60` | exacto |
| v1.62 certificado | `tipoDeMargen` sobre márgenes reportados | banda `E_EMPATE_W` y 0,05 pp |
| v1.62 coordenadas | prohíbe coordenadas del índice escritas a mano | exacto |
| optimal ≥ pairwise / optfree ≥ optimal | invariantes de energía | `1e-3` relativo (`:…`) |

`NO VERIFICADO` el resto de grupos.

## 10.2 El oráculo de ray-cast — qué comparte y qué no

**Dónde vive**: dentro del propio banco, como función local del test, no en un
módulo aparte:

```
tools/test_backtracking_sim.mjs:366-369
t('H7: ORÁCULO INDEPENDIENTE — rectángulos con rotación exacta sobre el eje inclinado y muestreo denso ≡ contador convergido (≤0,5 pp)', () => {
  // c = (cos θ, sin θ·sin τ, −sin θ·cos τ), a = (0, cos τ, sin τ): base ortonormal de la pala; 200×400 muestras; sin código del contador
  const RAD = Math.PI / 180;
  const oracleRot = (zen, az, T, ang, NU, NV) => {
```

**Qué comparte con lo auditado:**

1. **`sol.js` e `irradiancia.js`: SÍ**, íntegros. El sandbox los antepone al
   bloque extraído:

```
tools/test_backtracking_sim.mjs:184-188
/* El bloque de FÍSICA PURA ya no lleva dentro el sol: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Aquí se antepone,
...
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
            + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
```

   Es decir: **la posición solar del oráculo y la del contador son la misma
   función**. El oráculo no recalcula el sol; recibe `gB.zen`, `gB.az` que salen
   de `F.solarPos` (`tools/test_backtracking_sim.mjs:343`).

2. **El terreno `T`: SÍ**, es el mismo objeto (`casoB(...)`), construido con
   `F.pairsFromElev` — función **del código auditado**
   (`tools/test_backtracking_sim.mjs:340`). O sea que la conversión cotas ↔
   pendientes de pareja es compartida.

3. **El vector solar**: el oráculo lo recalcula con su propia línea

```
tools/test_backtracking_sim.mjs:372
    const azR = (az - T.axisAz) * RAD, el = (90 - zen) * RAD, sv = [Math.sin(azR) * Math.cos(el), Math.cos(azR) * Math.cos(el), Math.sin(el)];
```
   que es **la misma expresión** que `backtracking.html:1868-1869`. No es código
   compartido por referencia, pero es la misma fórmula escrita dos veces.

4. **La cadena de posiciones x y cotas**: el oráculo la reconstruye con su propio
   bucle

```
tools/test_backtracking_sim.mjs:373
    const xs = [0], zch = [0]; for (let i = 0; i < T.pairs.length; i++) { xs.push(xs[i] + T.pairs[i].pitch); zch.push(zch[i] - T.pairs[i].pitch * Math.tan(T.pairs[i].slope * RAD)); }
```
   idéntico en forma a `backtracking.html:1872-1876`.

**Qué NO comparte:**

- **La proyección geométrica y la detección de bloqueo**: el oráculo muestrea
  200×400 puntos del rectángulo y lanza un rayo por punto contra el plano de cada
  emisora, resolviendo `s` y comprobando `|ue| ≤ hw` y `ve` dentro del tramo
  (`:381-388`). El contador usa intersección analítica de semiplanos en `u` y
  cuadratura por estaciones (bloque 4.3, 4.4). **Son dos derivaciones distintas.**
- **La estructura**: el oráculo modela **solo el plano del módulo** (con `z0`),
  sin viga ni canto; por eso se carea contra `{noStruct:true}`
  (`tools/test_backtracking_sim.mjs:394`).
- **El terreno**: el oráculo no tiene marchador de terreno.
- **Las podas**: el oráculo no poda (recorre todas las emisoras).

**Resumen literal**: comparte **el sol, la irradiancia, el objeto T y las fórmulas
del vector solar y de la cadena de cotas** (las dos últimas por reescritura, no
por llamada); **no comparte** la proyección de sombra, la agregación, la
estructura, el terreno ni las podas.

Existe además un segundo oráculo, para el detector de referencias verticales:

```
tools/test_backtracking_sim.mjs:3149-3153
// ORÁCULO INDEPENDIENTE del detector. No comparte una línea con la versión de
...
function oraculoRefVertical(P, umbral = 3, dy = 10, dx = 30, minv = 3) {
```

y un tercero, `shadeBrute`, que vive **dentro del código auditado**:

```
backtracking.html:3372-3375
/* ray-cast BRUTO para el QA: muestrea M puntos del panel sombreado y lanza el
   rayo solar contra el segmento vecino. Independiente de shadeFracPair — dos
   derivaciones distintas que deben coincidir, como el core valida su bisección. */
function shadeBrute(pszDeg,thLeft,thRight,pitch,cw,slopeDeg,z0,M){
```

## 10.3 `tools/barrido_terrenos.mjs`

**Configuraciones**: el número **no está fijado en el script**, es un argumento
con defecto 200:

```
tools/barrido_terrenos.mjs:42
const NCFG = +(args.find(a => /^\d+$/.test(a)) || 200), SEED = +(args.filter(a => /^\d+$/.test(a))[1] || 1);
```

En **CI se fijan 40** a propósito:

```
.github/workflows/bancos.yml:196-199
      # el numero de configuraciones va FIJADO aqui, no heredado del default del
      # script: si alguien cambia ese default, el gate se encogeria en silencio
      - name: invariantes sobre 40 configuraciones
        run: |
```

**Fechas: tres**, y el paso **20 min**:

```
tools/barrido_terrenos.mjs:106
const DIAS = [['21-jun', Date.UTC(2026, 5, 21), 172], ['21-mar', Date.UTC(2026, 2, 21), 80], ['21-dic', Date.UTC(2026, 11, 21), 355]];
```
```
tools/barrido_terrenos.mjs:334
console.log(`barrido: ${NCFG} configuraciones × 3 fechas × cada 20 min · ${seg} s`);
```

**Definición de «fallo de política» frente a «sombra física»**:

```
tools/barrido_terrenos.mjs:150-161
        res.B.n++;
        const tope = g.elev >= 10 ? 0.02 : 0.05;
        if (peor > tope) {
          // ¿era ALCANZABLE? la mejor sombra de filas con un θ uniforme (barrido de
          // 2,5°): si ningún θ baja de la mitad de lo que dejó la política, es física
          // (terreno, geometría), no política — se apunta pero no cuenta como fallo
          /* v1.57.2 (cuarta auditoría): FALLO sólo si el θ uniforme baja la
             sombra SIN perder energía de planta. Comparar sólo sombra óptica es
             el mismo vicio que esta auditoría persiguió en cuatro sitios del
             motor, metido en la métrica que juzga: medido, un θ uniforme que
             baja la sombra del 32,9 % al 15,2 % publica 298,7 W/m² frente a
             662,1. `alc` se sigue informando como cota (optimista, declarada). */
```

Es decir: umbral **2 % con sol ≥ 10°, 5 % por debajo**; y es **fallo** sólo si
existe un θ uniforme (barrido de **2,5°**, dentro del rango legítimo de cada
unidad, `:164`) que baje la sombra **sin perder energía de planta**; si no,
se contabiliza como sombra física.

Las dos cuentas se publican separadas:

```
tools/barrido_terrenos.mjs:338-339
console.log(`B  sombra de planos con pairwise/true3d/mgl: ${res.B.n} instantes-política · FALLOS de política (había un θ mejor): ${res.B.casos.length} · sombra física (ningún θ la evita): ${res.B.fisica.length}`);
console.log(`B2 sombra PUBLICADA (estructura, 32 estaciones): ${res.B2.n} instantes-política · FALLOS (había un θ uniforme mejor): ${res.B2.casos.length} · física (ningún θ la evita): ${res.B2.fisica.length}`);
```

## 10.4 `tools/careo_produccion.mjs` — definición de «interior»

«Interior» = todo lo que **no** es borde, y borde son los extremos de la ventana
**más sus gemelas de accionamiento**:

```
tools/careo_produccion.mjs:79-82
// (en bifila la gemela copia el θ de la motora: el borde se propaga por el eje
const borde = new Set([0, Ps.lineX.length - 1]);
for (const g of (Ps.groups || [])) if (g.some(r => borde.has(r))) g.forEach(r => borde.add(r));
```

Qué queda fuera del careo estricto: las líneas de `borde` tienen su propio
acumulador y no rompen la identidad:

```
tools/careo_produccion.mjs:109-112
    const tgt = borde.has(i) ? [peorThB, peorPoaB] : [peorTh, peorPoa];
...
    if (!borde.has(i) && (dth > 1e-9 || dpoa > 1e-9)) ident = false;
```

O sea: **la identidad bit a bit se exige sólo en el interior** (`1e-9`), y el
borde se informa aparte (`:119-122`).

## 10.5 `tools/test_render_sol.mjs` — qué se asserta y con qué tolerancia de píxel

Cabecera con los tres asertos originales (`tools/test_render_sol.mjs:1-26`), y la
tolerancia de píxel es **cero rojos**:

```
tools/test_render_sol.mjs:100-102
    const r = await rojoDesdeElSol();
    check(`desde el sol no se ve rojo — ${c.nm}`, r.rojo === 0 && r.azul > 1000 && r.sombra > 0.05,
          `rojos ${r.rojo} · pala ${r.azul} px · sombra máx ${(r.sombra * 100).toFixed(1)} %`);
```

Criterio de clasificación de un píxel como rojo / azul:

```
tools/test_render_sol.mjs:86-88
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 170 && px[i + 1] < 110 && px[i + 2] < 110) rojo++;
        if (px[i + 2] > px[i] + 20 && px[i + 2] > 60) azul++;            // pala vista desde el sol
```

Es decir: **rojo = 0 exacto**, con dos guardas de que la escena no esté vacía
(`azul > 1000 px`, `sombra > 5 %`). En esta versión el fichero lleva además las
secciones 4 (tope del mando manual) y 5 (mesa de espaldas), que cuentan mallas
por material, no píxeles.

## 10.6 Qué se ejecuta en CI y qué no

```
.github/workflows/bancos.yml:26-34
on:
  push:
    branches: [main]
  pull_request:

# Un empujón nuevo cancela la ejecución anterior de la misma rama: lo que
# interesa es el estado de AHORA, no la cola.
concurrency:
  group: bancos-${{ github.ref }}
  cancel-in-progress: true
```

Jobs: **núcleo (python)**, **scripts de campo (pwsh)**, **datos y física (node)**,
**barrido de terrenos** (matriz de semillas, 40 configuraciones fijadas en el
workflow) y **visor** (matriz, un navegador por banco). Lo que corre el motor
auditado:

```
.github/workflows/bancos.yml:133-134
      - name: simulador de backtracking
        run: node tools/test_backtracking_sim.mjs
```

**Qué NO está en CI** (comprobado por búsqueda del nombre en el workflow):

| Herramienta | ¿en CI? |
|---|---|
| `tools/careo_produccion.mjs` | **NO** |
| `tools/export_consignas.mjs` | **NO** (sí lo leen tres comprobaciones de la batería) |
| `tools/audit_sweep.mjs` | **NO** |
| `tools/careo_sombra.mjs` | **NO** |

Hay además dos pasos de higiene repetidos («los bancos no han tocado el repo»,
líneas 90 y 211).

---

# BLOQUE 13 — DISCREPANCIAS Y HUECOS

## 13.1 Discrepancias entre `docs/algoritmos_backtracking.html` y el código

| # | Documento | Código | Nota |
|---|---|---|---|
| 1 | §5, caso B: «Pairwise θ **−2…38**, sombra **13,4 %**, POA **105**» | ejecutado: θ −2,00…38,10, sombra de planos **12,97 %**, POA **108,74** | rangos de θ coinciden; sombra y POA difieren (ver 11.1). El enunciado de esta auditoría pide confirmar «−10° y POA 38», que **no** coincide ni con el código ni con el documento |
| 2 | §3.6 (true-3D): «bisección (36 iteraciones)» | `backtracking.html:1216`: `for(let i=0;i<36;i++)` | **coincide** |
| 3 | «Límites conocidos»: el documento lista **diez** entradas | el enunciado de esta auditoría habla de **5 «límites conocidos»** | discrepancia entre el enunciado y el documento, no entre documento y código |
| 4 | Límite «Malla axial en plantas medidas … 8 estaciones» | `backtracking.html:845`: `if(T.real)return 8;` | **coincide** |
| 5 | H4: «Apagado por defecto, opcional con `perezEnhancement`» | `irradiancia.js:53`: `var realce = !!(opts && opts.perezEnhancement);` | **coincide** |
| 6 | §7 «Hueco del motor en presets … la física cobra un 0,85 % del largo de más» | `backtracking.html:1572-1600` (el hueco SÍ existe en planta medida) y `tools/test_render_sol.mjs:13-18` (excepción declarada en presets) | **coincide**, con la matización de que el hueco sí está en planta medida |
| 7 | §3.4 (pairwise) «barrido» — el enunciado de esta auditoría pide «el barrido de 0,5° del caso con torsión» | el empuje del código va a `PASO_BUSQ` = **0,1°** con tope 60 iteraciones (`backtracking.html:1138-1148`), declarado como cambio de v1.60 | el 0,5° del enunciado **no** está en esa función |
| 8 | Enunciado: «8° de deferral» | el deferral es por **cénit ≥ 82°** (`backtracking.html:1250`) | `NO ENCONTRADO` ningún deferral de 8° |

`NO VERIFICADO`: no se ha careado el documento entero (441 líneas) frase a frase
contra el código. Las filas de arriba son las que se han comprobado.

## 13.2 Los «límites conocidos» del documento, verificados en el código

El documento lista **diez**, no cinco. Verificación de los que se han podido
comprobar:

| Límite (documento) | ¿Es como se declara? | ¿Exclusión por diseño o por omisión? |
|---|---|---|
| **Hueco del motor en presets** | **Sí.** En planta medida el hueco existe (`backtracking.html:1572`, `1600`); en presets sin quiebro, no | **por omisión declarada** («Pendiente: partir todas las mesas en presets») |
| **Estructura en tangencia** | **Sí.** El contador mantiene dos cuentas, con y sin estructura (`backtracking.html:2226-2231`), y la diferencia es «exactamente el hierro» | **por diseño**: no se corrige, se publica |
| **Residuo irreducible del accionamiento** | **Sí.** `applyDrive` impone θ común (`675-683`) y `driveCoupleSafe` minimiza cuando no puede anular (`736-741`) | **propiedad del modelo**, no exclusión |
| **Torsión: la garantía de no sombra deja de existir** | **Sí**, y el código lo dice en dos sitios: la reparación de `anglesPairwiseRaw` (`1126-1130`) y el despachador («BUSCAN, no GARANTIZAN», `3352-3360`) | **por diseño**, marcado como irreducible |
| **Enmascaramiento de difusa** | **Sí.** `poaRow` no sombrea isótropa ni albedo (`backtracking.html:2424-2428`) | **por omisión declarada** («está DECLARADO como pendiente») |
| **Malla axial en plantas medidas (8 estaciones)** | **Sí** (`backtracking.html:845`) | **por diseño**, con el motivo escrito (coste) |
| **La pala es un paralelogramo** | `NO VERIFICADO` — no se ha comprobado la desviación de 0,07°/0,41° | declarado en el documento |
| **El tercer decimal de la POA (IAM en difusa e isótropa)** | **Sí.** `iamSkyEq`/`iamGndEq` usan ángulos equivalentes de Duffie-Beckman (`backtracking.html:2421-2422`, y el comentario de `2407-2413`) | **por diseño declarado** |
| **Perfil «quebrado (dos aguas)»** | `NO VERIFICADO` | — |
| **Sombra punta a punta en la misma línea** (no está en la lista de límites pero sí declarada) | **Sí**, excluida **por diseño**: `if(pl.e===r)continue;` (`backtracking.html:2116`) y declarado en `1339` | **por diseño (no se enumera)** |

## 13.3 Lista completa de `NO ENCONTRADO` / `NO VERIFICADO`

**NO ENCONTRADO**

1. Test de paridad automatizado entre el JS y `tracker3d.py` (bloque 1.3).
2. Número de versión en `lib/OrbitControls.js` y `lib/GLTFLoader.js` (1.4).
3. Llamada o rama de **stow** en la cadena de `policyAngles` (5, orden de aplicación).
4. `tools/export_consignas.mjs` en el workflow de CI (3.3 y 10.6).
5. **SHA de commit y hash de inputs** en los resultados publicados (12.2).
6. Comprobación, test, assert o guarda de la **hipótesis de monotonía** (6.3) — «NO EXISTE».
7. Constante «8 barridos» del listado del enunciado (9).
8. Deferral de «8°» (13.1, fila 8): el del código es por cénit ≥ 82°.
9. Constante «32 estaciones» como valor del código (9): la malla es 8…64 adaptativa.
10. Origen de los valores «−10° y 38 W/m²» del enunciado para el caso B (11.1).

**NO VERIFICADO**

1. Paridad de cruces de `TH_DISP` en cada camino de datos de la página (3.1).
2. Si la estimación anual (`backtracking.html:6901`) reusa `computeDay` y por tanto el lazo (5.7, 8.4).
3. Cómo se eligen los 12 días representativos y con qué paso (8.4).
4. Agregador de `poaPlantSeg`: si pondera por mesa o promedia igual que `poaPlant` (8.1).
5. Lista exhaustiva de colapsos por mesa → fila; la de 2.5 sale de búsqueda por patrones (2.5).
6. Qué candidatos exactos reevalúa el veto de `anglesOptimal` (líneas 2841-2937) (5.5).
7. Vecindad y criterio de convergencia del ascenso de `anglesOptimalFree` (líneas 2960-3040) (5.6).
8. Desglose de las 136 `t(...)` de la batería una por una con su tolerancia (10.1).
9. Presencia de `Math.random` en `backtracking.html` (12.1).
10. Otros `for...in` sobre claves no enteras que afecten a un resultado numérico (12.1).
11. Careo frase a frase del documento de algoritmos contra el código (13.1).
12. Límites «la pala es un paralelogramo» y «perfil quebrado (dos aguas)» (13.2).
13. A qué se deben las diferencias de sombra (0,4-0,7 pp) y POA (≈3,7 W/m²) entre lo ejecutado y la tabla §5 del documento (11.1).

---

## Dónde se ha parado este documento

Se han entregado **los trece bloques**. Los que quedan incompletos dentro de sí
mismos están marcados arriba con `NO VERIFICADO`, uno a uno, en 13.3. Los más
grandes de esos huecos, por si el auditor quiere pedirlos: el desglose de las 136
comprobaciones de la batería (10.1), el interior de `anglesOptimal` y
`anglesOptimalFree` (5.5 y 5.6), y la estimación anual (8.4).
