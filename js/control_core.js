/* Núcleo PURO del lazo de control del tracker — sin DOM, sin THREE, sin estado global.
   Es lo que hay ENTRE la consigna que calcula la política (astro / backtracking) y el θ que el
   tracker EJECUTA de verdad: banda muerta (deadband), velocidad del actuador (slew) y tope mecánico.
   Lo consumen produccion.html (la estimación de generación va con el θ ejecutado, no con el ideal)
   y los tests Node (tools/test_control_core.mjs).

   POR QUÉ IMPORTA, Y POR QUÉ NO IMPORTA POR DONDE PARECE. El deadband desalinea el panel del óptimo,
   pero eso se paga por COSENO y es de segundo orden. La cuenta buena es la MEDIA DE LA PÉRDIDA, no la
   pérdida del error medio: 1−cos es convexo, así que evaluarlo en el error medio se queda corto (con
   banda de 1°, 0,0038 % contra 0,0051 % — Jensen). Con el error repartido uniforme en [0, banda] la
   media de 1−cos(e) es b²/6 en radianes: 0,0013 % a 0,5°, 0,0051 % a 1°, 0,020 % a 2°, 0,127 % a 5°,
   y el banco lo exige contra la fórmula, no contra una cota holgada. Lo que de verdad cuesta es la
   SOMBRA. En backtracking la
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

   EL ACTUADOR NO VIVE EN LA REJILLA DE INTEGRACIÓN. La TCU decide cada `cicloSeg` y el actuador rampa
   a `slewDegS` constante; la app integra energía cada 5 min (o cada hora en los agregados largos).
   Correr el lazo en la rejilla de integración es un error físico ya pagado en overcast.html: a paso
   horario el techo por paso es 0,17·3600 = 612°, más que el recorrido entero del tracker, así que el
   slew NUNCA ataba y el deadband no veía el escalón real. Aquí la consigna se interpola al ciclo de
   la TCU (execTramo) y el lazo corre AHÍ; la integración solo lee el θ al final del tramo.

   EL CICLO ES DE UN SEGUNDO, Y ESO ES DE CAMPO. La primera versión puso el ciclo en MINUTOS con un
   canónico de 1 min, y escribió que venía de overcast.html «como los canónicos de la casa»: FALSO.
   El CANON de overcast solo trae deadband y slew; su «ciclo» es la resolución que elige el usuario
   para simular, no el periodo de la TCU. La TCU real CALCULA CADA SEGUNDO —lo dice Iñaki, que las
   configura, y el mapa Modbus de la TCU (tools/modbus_src/tcu_v6.json) trae la banda muerta en el
   41061 pero no publica su periodo de scan, así que la autoridad aquí es el campo—. La diferencia no
   es cosmética: a 0,17°/s, en un ciclo de 60 s el actuador recorre 10,2°, así que CUALQUIER
   movimiento cabía en un ciclo y el enclavamiento no ataba nunca; en uno de 1 s recorre 0,17°, y un
   paso de banda de 1° son SEIS ciclos de motor en marcha. Por eso la unidad es `cicloSeg`: en
   minutos el valor de verdad es 1/60, y un campo cuyo valor honrado es 0,0167 pide que alguien
   teclee 1 «porque es lo normal» y se coma un factor de sesenta. */
(function(g){
  'use strict';
  var C={};

  /* Los canónicos: deadband y slew son los de la casa (los mismos que overcast.html CANON, que
     los toma del core); el ciclo de 1 s es el de la TCU real, y no vive en ningún CANON de código. */
  C.CANON={deadbandDeg:1.0, slewDegS:0.17, cicloSeg:1};

  /* Recorte por velocidad del actuador. UNA sola pieza: si se toca, se toca aquí. */
  C.slewLimit=function(prev,cmd,dtSec,rateDegS){
    var r=(rateDegS>0?rateDegS:C.CANON.slewDegS)*dtSec, d=cmd-prev;
    if(Math.abs(d)<=r)return cmd;
    return prev+(d>0?r:-r);
  };

  /* UN ciclo del lazo, de dtSec segundos.
       prev     θ ejecutado al empezar el ciclo (grados)
       target   consigna de la política (grados)
       loop     {deadbandDeg, slewDegS, cicloSeg, maxAngle, modo}
       btLimita ¿la consigna está recortada por backtracking? — solo lo mira el modo 'seguro'
       dir      sentido en VUELO del ciclo anterior: +1, −1 o 0 (parado). Es el enclavamiento.
       park     destino ENCLAVADO del movimiento en curso (null = parado).
     Devuelve {theta, dir, park}.

     LA BANDA ARRANCA EL MOTOR, PERO NO LO PARA. Un deadband sin condición de parada no es un
     deadband: arranca al alcanzar la banda y, en cuanto el actuador recorta el error por debajo de
     ella, se vuelve a parar — el tracker avanza lo que dé la velocidad en UN ciclo y se queda a
     medio camino, con más arranques y no menos, que es justo lo contrario de para lo que está la
     banda. Se vio con banda de 2,5° y ciclo de 6 s: el paso salía 1,02° = 0,17·6, la velocidad del
     actuador, en vez de los 2,5° de la banda. Así que hay ENCLAVAMIENTO: la banda decide el
     ARRANQUE y el motor sigue hasta LLEGAR a su destino (o hasta el tope mecánico).

     Y EL DESTINO NO ES LA CONSIGNA: LA TCU ADELANTA AL SOL. Esto estaba mal, y lo estaba en todas
     partes. La versión anterior paraba el eje EN la consigna, así que el error solo podía ir POR
     DETRÁS: la columna de desalineo de la tabla salía siempre del mismo signo, y eso se vio en
     pantalla («no siempre vamos detrás»). La TCU real arranca cuando se ha quedado un grado atrás y
     lleva el eje un grado MÁS ALLÁ de donde está el sol, o sea que el movimiento es de DOS grados y
     el error barre de +banda a −banda con media cero. El core NO lo hace: `apply_control_loop`,
     `run_tcu_sim` y la máquina direccional de `direction.py` rampan con `_advance(prev, tgt, dt)` y
     paran en la consigna; el gemelo tiene una «banda de llegada» (`dead*0,5`), que también es de
     parada. Así que aquí el destino es `consigna + banda·sentido`, y con eso:
       · el paso del tracker es DOS veces la banda, no una;
       · el desalineo medio es CERO y el |desalineo| medio es banda/2, no banda/2 con signo fijo;
       · el eje pasa la mitad del tiempo por delante de la consigna, que en las horas de
         backtracking es el lado que NO sombrea (la trayectoria va hacia plano por la tarde).
     EL SENTIDO SE ENCLAVA, y hace falta. Con el destino pasado la consigna, en cuanto el eje la
     cruza el error cambia de signo; recalcular el sentido en cada ciclo daría destino nuevo hacia
     atrás y el motor se pararía justo al llegar a la consigna —el adelanto no se haría nunca—. Por
     eso el estado que cruza el ciclo y el tramo es el SENTIDO (+1/−1/0), no un booleano. */
  C.step=function(prev,target,dtSec,loop,btLimita,dir,park){
    var db=(loop&&loop.deadbandDeg>0)?loop.deadbandDeg:0;
    var max=(loop&&loop.maxAngle>0)?loop.maxAngle:90;
    var d=(dir>0?1:(dir<0?-1:0));
    var err=target-prev, destino;
    if(d&&park!=null){
      // EN VUELO hacia el destino ENCLAVADO al arrancar. No se recalcula: la TCU decide UNA vez
      // —«vete a la consigna de ahora más una banda»— y conduce hasta ahí. Recalculándolo, con la
      // consigna derivando el eje se queda de SEGUIDOR perpetuo una banda por delante y el paso de
      // dos bandas no se hace nunca: medido en el core (media firmada +0,925° y ni una parada en
      // una hora) y visible en cuanto el ciclo es largo.
      if((park-prev)*d<=1e-12)d=0;                 // ha llegado: se para
      else destino=park;
    }
    if(!d){                                        // parado: ¿arranca?
      var arranca=db<=0||Math.abs(err)>=db;
      // modo 'seguro': si la consigna viene recortada por sombra y el tracker está MÁS inclinado que
      // ella, arranca aunque no llegue a la banda (aguantar ahí sombrearía al vecino)
      if(!arranca&&loop&&loop.modo==='seguro'&&btLimita&&Math.abs(prev)>Math.abs(target))arranca=true;
      if(!arranca)return {theta:prev,dir:0,park:null};
      d=err>0?1:(err<0?-1:0);
      if(!d)return {theta:prev,dir:0,park:null};    // ya está clavado en la consigna
      // EL DESTINO: la consigna adelantada una banda en el sentido de la marcha
      destino=target+db*d;
      // …PERO EL ADELANTO NO VALE HACIA EL LADO QUE SOMBREA. Si la consigna viene recortada por
      // backtracking, pasarse de ella hacia MÁS inclinado sombrea al vecino por definición: el
      // límite es el límite. En modo 'seguro' el adelanto se conserva solo cuando va hacia PLANO.
      // Sin esto, 'seguro' dejaba de servir en cuanto la TCU adelanta: con el eje parando en la
      // consigna la mañana se salvaba sola —el aguante caía siempre del lado plano—, y con adelanto
      // sobreinclinaba 59 de 120 pasos. Lo cazó el banco del núcleo al cambiar la ley.
      if(loop&&loop.modo==='seguro'&&btLimita&&Math.abs(destino)>Math.abs(target))destino=target;
    }
    // Un slew de 0 tecleado en la UI sería un actuador de velocidad infinita: el tracker se
    // teletransportaría y el deadband dejaría de tener forma de escalón. Cae al canónico.
    var th=C.slewLimit(prev,destino,dtSec,(loop&&loop.slewDegS>0)?loop.slewDegS:C.CANON.slewDegS);
    th=Math.max(-max,Math.min(max,th));
    // sigue en vuelo mientras no haya llegado a SU destino; en el tope mecánico se para
    var sigue=(destino-th)*d>1e-9&&Math.abs(th)<max-1e-9;
    return {theta:th,dir:sigue?d:0,park:sigue?destino:null};
  };

  /* Un TRAMO de integración completo: la consigna pasa de tPrev a tNow en dtMin minutos y el lazo
     corre dentro, en la rejilla del ciclo de la TCU, con la consigna interpolada linealmente (el sol
     va suave; el codo del paso backtracking→seguimiento se suaviza, y eso va declarado).
     Devuelve el θ ejecutado al FINAL del tramo, que es el que ve la integración. */
  C.execTramo=function(prev,tPrev,tNow,dtMin,loop,btLimita,dir,park){
    var ciclo=(loop&&loop.cicloSeg>0)?loop.cicloSeg:C.CANON.cicloSeg;   // segundos
    var n=Math.max(1,Math.round(dtMin*60/ciclo)), dtS=(dtMin/n)*60, th=prev, d=(dir>0?1:(dir<0?-1:0));
    var pk=(park==null?null:+park);
    // EL ENCLAVAMIENTO CRUZA LA FRONTERA DEL TRAMO. La primera versión lo reiniciaba en cada tramo
    // pensando que solo importaría en un movimiento que no cupiera en uno; es falso, y se midió:
    // si el arranque cae en los ÚLTIMOS ciclos del tramo, el movimiento se trunca en la frontera y
    // el tracker se queda a medio paso. Con banda 2,5°, ciclo de 6 s y deriva 0,25°/min el arranque
    // cae siempre en el último ciclo (2,5 = 10 × 0,25: conmensurable) y el paso salía 1,02° —la
    // velocidad del actuador— en TODOS los movimientos. Así que el estado que arrastra la app son
    // dos cosas: el θ y el SENTIDO en que va (que además es lo que hace posible el adelanto).
    for(var i=1;i<=n;i++){
      var r=C.step(th,tPrev+(tNow-tPrev)*(i/n),dtS,loop,btLimita,d,pk);
      th=r.theta; d=r.dir; pk=r.park;
    }
    return {theta:th,dir:d,park:pk};
  };

  /* Lo mismo sobre un VECTOR de trackers (una consigna por fila o por mesa). Las cuatro mesas de un
     seguidor comparten motor y por tanto consigna: aplicar el lazo elemento a elemento las deja con
     el mismo θ por construcción, y la QA lo exige. prev/tPrev/tNow del mismo largo. */
  C.execVector=function(prev,tPrev,tNow,dtMin,loop,bt,dir,park){
    var th=new Array(tNow.length), dd=new Array(tNow.length), pp=new Array(tNow.length);
    for(var i=0;i<tNow.length;i++){
      var r=C.execTramo(prev[i]==null?tNow[i]:prev[i],
                        tPrev[i]==null?tNow[i]:tPrev[i],tNow[i],dtMin,loop,
                        bt?!!bt[i]:false,dir?dir[i]:0,park?park[i]:null);
      th[i]=r.theta; dd[i]=r.dir; pp[i]=r.park;
    }
    return {theta:th,dir:dd,park:pp};
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
