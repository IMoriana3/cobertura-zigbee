/* Núcleo PURO del cableado DC — sin THREE, sin DOM, sin estado global: cada función recibe datos y devuelve datos.
   Lo consumen buildNetLayer/updateCableSpin (terreno.html) y los tests Node (tools/test_cableado_core.mjs).
   Invariantes físicas (El Burgo): mazo embridado a la cara exterior de su viga; aéreo solo por su línea,
   saltando pasillos entre punteras; JAMÁS cruza una calle en aéreo; perfil de tubo por viga con pendiente
   de extrapolación capada y cota encerrada respecto al terreno. */
(function(g){
  'use strict';
  var C={};

  // ¿el intervalo [a,b] cruza algún eje de calle? → devuelve el eje cruzado más cercano a `a`, o null.
  // tol EXPLÍCITA: un extremo a menos de `tol` del eje no cuenta como cruce (evita falsos positivos en bordes).
  C.cruzaCalle=function(a,b,axes,tol){ tol=tol||0; var best=null,bd=Infinity;
    for(var i=0;i<axes.length;i++){var st=axes[i];
      if((a-st)*(b-st)<0&&Math.abs(a-st)>tol&&Math.abs(b-st)>tol){var d=Math.abs(st-a);if(d<bd){bd=d;best=st;}}}
    return best; };

  // cortes de calle de un tramo, ordenados en el sentido a→b
  C.cortes=function(a,b,axes){ var out=[];
    for(var i=0;i<axes.length;i++){var st=axes[i];if((a-st)*(b-st)<0)out.push(st);}
    out.sort(function(A,B){return a<b?A-B:B-A;}); return out; };

  // clamp del tramo aéreo al largo FÍSICO de la viga: nodos [ [n,y], ... ] ordenados + margen de puntera
  C.clampViga=function(nA,nB,nodes,margen){ if(!nodes||!nodes.length)return [nA,nB];
    var b0=nodes[0][0]-margen,b1=nodes[nodes.length-1][0]+margen;
    return [Math.max(b0,Math.min(b1,nA)),Math.max(b0,Math.min(b1,nB))]; };

  // perfil del tubo de UNA viga: interpolación por nodos [n,y], extrapolación con pendiente capada ±maxSlope,
  // y cota final encerrada en [ty+minH, ty+maxH] respecto al terreno ty. fallbackY si no hay nodos.
  C.tubeY=function(nodes,n,ty,fallbackY,maxSlope,minH,maxH){
    maxSlope=(maxSlope===undefined)?0.6:maxSlope;minH=(minH===undefined)?0.6:minH;maxH=(maxH===undefined)?4.5:maxH;
    var y;
    if(!nodes||!nodes.length)y=fallbackY;
    else if(nodes.length===1)y=nodes[0][1];
    else if(n<=nodes[0][0]){var s0=Math.max(-maxSlope,Math.min(maxSlope,(nodes[1][1]-nodes[0][1])/((nodes[1][0]-nodes[0][0])||1)));y=nodes[0][1]+s0*(n-nodes[0][0]);}
    else{var m=nodes.length-1;
      if(n>=nodes[m][0]){var s1=Math.max(-maxSlope,Math.min(maxSlope,(nodes[m][1]-nodes[m-1][1])/((nodes[m][0]-nodes[m-1][0])||1)));y=nodes[m][1]+s1*(n-nodes[m][0]);}
      else{y=nodes[m][1];for(var j=0;j+1<nodes.length;j++){if(n>=nodes[j][0]&&n<=nodes[j+1][0]){var t=(n-nodes[j][0])/((nodes[j+1][0]-nodes[j][0])||1);y=nodes[j][1]+t*(nodes[j+1][1]-nodes[j][1]);break;}}}}
    return Math.max(ty+minH,Math.min(ty+maxH,y)); };

  // poste de bajada: el MÁS CERCANO a nT entre los postes de la línea `l` y viga `sd`,
  // restringido al lado de LLEGADA sg (nunca al otro lado de la calle). posts=[ [x,n,yTop,fila] ], lineOf[fila]=línea.
  C.postePorLado=function(posts,lineOf,l,lx,sd,nT,sg){ var bp=null,bd=Infinity;
    for(var i=0;i<posts.length;i++){var P=posts[i];
      if(lineOf[P[3]]!==l)continue;
      if((P[0]-lx)*sd<0)continue;
      if(sg&&(P[1]-nT)*sg<-0.5)continue;
      var d=Math.abs(P[1]-nT);if(d<bd){bd=d;bp=P;}}
    return bp; };

  // extremos de cada sub-tramo al partir [a,b] por las calles: [[u,v],...] en orden a→b
  C.subtramos=function(a,b,axes){ var cuts=C.cortes(a,b,axes),pts=[a].concat(cuts,[b]),out=[];
    for(var i=0;i+1<pts.length;i++)out.push([pts[i],pts[i+1]]);
    return out; };

  g.CABLECORE=C;
})(typeof window!=='undefined'?window:globalThis);
