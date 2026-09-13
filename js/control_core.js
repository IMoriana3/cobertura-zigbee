/* Núcleo PURO del lazo de control del tracker — sin DOM, sin THREE, sin estado global.
   Es lo que hay ENTRE la consigna que calcula la política (astro / backtracking) y el θ que el
   tracker EJECUTA de verdad: banda muerta (deadband), velocidad del actuador (slew) y tope mecánico.
   Lo consumen produccion.html (la estimación de generación va con el θ ejecutado, no con el ideal)
   y los tests Node (tools/test_control_core.mjs).

   POR QUÉ IMPORTA, Y POR QUÉ NO IMPORTA POR DONDE PARECE. El deadband desalinea el panel del óptimo,
   pero eso se paga por COSENO y es de segundo orden: con 1° de banda el desalineo medio es 0,5° y
   cos(0,5°) = 0,99996, o sea 0,004 %. Lo que de verdad cuesta es la SOMBRA. En backtracking la
   consigna baja hacia plano por la tarde (el ángulo que deja la sombra justo en el borde del vecino);
   si el motor no arranca, el tracker se queda MÁS inclinado que ese límite y sombrea a la fila de al
   lado, que en un string en serie es pérdida de primer orden. Por la mañana la banda juega al lado
   seguro —más plano de lo que haría falta—, así que el efecto es ASIMÉTRICO por construcción.

   DOS MODOS, porque hay dos TCUs reales:
     · 'libre'  — banda muerta a secas: no arranca mientras |consigna − actual| < deadband. Es lo que
                  hace la mayoría, y es la que sombrea por la tarde.
     · 'seguro' — la TCU sabe que está backtrackeando y solo se permite aguantar hacia el lado que NO
                  sombrea: si la consigna está recortada por sombra y el tracker está más inclinado
                  que ella, arranca aunque no llegue a la banda. Criterio conservador: se compara la
                  MAGNITUD, así que un aguante que cruzase el cero también arranca.

   EL ACTUADOR NO VIVE EN LA REJILLA DE INTEGRACIÓN. La TCU decide cada `cicloMin` y el actuador rampa
   a `slewDegS` constante; la app integra energía cada 5 min (o cada hora en los agregados largos).
   Correr el lazo en la rejilla de integración es un error físico ya pagado en overcast.html: a paso
   horario el techo por paso es 0,17·3600 = 612°, más que el recorrido entero del tracker, así que el
   slew NUNCA ataba y el deadband no veía el escalón real. Aquí la consigna se interpola al ciclo de
   la TCU (execTramo) y el lazo corre AHÍ; la integración solo lee el θ al final del tramo. */
(function(g){
  'use strict';
  var C={};

  /* Los canónicos de la casa, los mismos que el simulador de difusa (overcast.html CANON). */
  C.CANON={deadbandDeg:1.0, slewDegS:0.17, cicloMin:1};

  /* Recorte por velocidad del actuador. UNA sola pieza: si se toca, se toca aquí. */
  C.slewLimit=function(prev,cmd,dtSec,rateDegS){
    var r=(rateDegS>0?rateDegS:C.CANON.slewDegS)*dtSec, d=cmd-prev;
    if(Math.abs(d)<=r)return cmd;
    return prev+(d>0?r:-r);
  };

  /* UN ciclo del lazo, de dtSec segundos.
       prev     θ ejecutado al empezar el ciclo (grados)
       target   consigna de la política (grados)
       loop     {deadbandDeg, slewDegS, maxAngle, modo}
       btLimita ¿la consigna está recortada por backtracking? — solo lo mira el modo 'seguro'
       moving   ¿venía ya MOVIÉNDOSE? (el enclavamiento; ver abajo)
     Devuelve {theta, moving}.

     LA BANDA ARRANCA EL MOTOR, PERO NO LO PARA. Un deadband sin condición de parada no es un
     deadband: arranca al alcanzar la banda y, en cuanto el actuador recorta el error por debajo de
     ella, se vuelve a parar — el tracker avanza lo que dé la velocidad en UN ciclo y se queda a
     medio camino, con más arranques y no menos, que es justo lo contrario de para lo que está la
     banda. Se vio con banda de 2,5° y ciclo de 6 s: el paso salía 1,02° = 0,17·6, la velocidad del
     actuador, en vez de los 2,5° de la banda. Así que hay ENCLAVAMIENTO: la banda decide el
     ARRANQUE y el motor sigue hasta LLEGAR a la consigna (o hasta el tope mecánico). Con eso el
     paso del tracker es la banda, sea la que sea. */
  C.step=function(prev,target,dtSec,loop,btLimita,moving){
    var db=(loop&&loop.deadbandDeg>0)?loop.deadbandDeg:0;
    var max=(loop&&loop.maxAngle>0)?loop.maxAngle:90;
    var arranca=!!moving||db<=0||Math.abs(target-prev)>=db;
    // modo 'seguro': si la consigna viene recortada por sombra y el tracker está MÁS inclinado que
    // ella, arranca aunque no llegue a la banda (aguantar ahí sombrearía al vecino)
    if(!arranca&&loop&&loop.modo==='seguro'&&btLimita&&Math.abs(prev)>Math.abs(target))arranca=true;
    if(!arranca)return {theta:prev,moving:false};
    // Un slew de 0 tecleado en la UI sería un actuador de velocidad infinita: el tracker se
    // teletransportaría y el deadband dejaría de tener forma de escalón. Cae al canónico.
    var th=C.slewLimit(prev,target,dtSec,(loop&&loop.slewDegS>0)?loop.slewDegS:C.CANON.slewDegS);
    th=Math.max(-max,Math.min(max,th));
    // sigue moviéndose mientras no haya llegado; en el tope mecánico se para
    return {theta:th,moving:Math.abs(target-th)>1e-9&&Math.abs(th)<max-1e-9};
  };

  /* Un TRAMO de integración completo: la consigna pasa de tPrev a tNow en dtMin minutos y el lazo
     corre dentro, en la rejilla del ciclo de la TCU, con la consigna interpolada linealmente (el sol
     va suave; el codo del paso backtracking→seguimiento se suaviza, y eso va declarado).
     Devuelve el θ ejecutado al FINAL del tramo, que es el que ve la integración. */
  C.execTramo=function(prev,tPrev,tNow,dtMin,loop,btLimita,moving){
    var ciclo=(loop&&loop.cicloMin>0)?loop.cicloMin:C.CANON.cicloMin;
    var n=Math.max(1,Math.round(dtMin/ciclo)), dtS=(dtMin/n)*60, th=prev, mov=!!moving;
    // EL ENCLAVAMIENTO CRUZA LA FRONTERA DEL TRAMO. La primera versión lo reiniciaba en cada tramo
    // pensando que solo importaría en un movimiento que no cupiera en uno; es falso, y se midió:
    // si el arranque cae en los ÚLTIMOS ciclos del tramo, el movimiento se trunca en la frontera y
    // el tracker se queda a medio paso. Con banda 2,5°, ciclo 6 s y deriva 0,25°/min el arranque
    // cae siempre en el último ciclo (2,5 = 10 × 0,25: conmensurable) y el paso salía 1,02° —la
    // velocidad del actuador— en TODOS los movimientos. Así que el estado que arrastra la app son
    // dos cosas: el θ y el «me estoy moviendo».
    for(var i=1;i<=n;i++){
      var r=C.step(th,tPrev+(tNow-tPrev)*(i/n),dtS,loop,btLimita,mov);
      th=r.theta; mov=r.moving;
    }
    return {theta:th,moving:mov};
  };

  /* Lo mismo sobre un VECTOR de trackers (una consigna por fila o por mesa). Las cuatro mesas de un
     seguidor comparten motor y por tanto consigna: aplicar el lazo elemento a elemento las deja con
     el mismo θ por construcción, y la QA lo exige. prev/tPrev/tNow del mismo largo. */
  C.execVector=function(prev,tPrev,tNow,dtMin,loop,bt,mov){
    var th=new Array(tNow.length), mo=new Array(tNow.length);
    for(var i=0;i<tNow.length;i++){
      var r=C.execTramo(prev[i]==null?tNow[i]:prev[i],
                        tPrev[i]==null?tNow[i]:tPrev[i],tNow[i],dtMin,loop,
                        bt?!!bt[i]:false,mov?!!mov[i]:false);
      th[i]=r.theta; mo[i]=r.moving;
    }
    return {theta:th,moving:mo};
  };

  /* Desalineo del paso: lo que separa al panel de su consigna. Es la magnitud que explica la pérdida
     por coseno, y sirve para enseñar en pantalla que es pequeña. */
  C.desalineo=function(exec,target){
    var s=0,n=0;
    for(var i=0;i<target.length;i++){if(exec[i]==null)continue;s+=Math.abs(exec[i]-target[i]);n++;}
    return n?s/n:0;
  };

  g.CTRLCORE=C;
})(typeof window!=='undefined'?window:globalThis);
