/* R3 · ¿DICEN LO MISMO LOS DOS LAZOS DE LA CASA?
 *
 * Sin navegador y sin red:  node audit3/F2_careo_lazos.mjs
 *
 * ¿DICEN LO MISMO LOS DOS LAZOS DE LA CASA?
 *   página : backtracking.html · crearLazo()          (dentro de FÍSICA PURA)
 *   núcleo : js/control_core.js · CTRLCORE.execTramo  (el que usa produccion.html
 *            y tools/anual_motor.mjs)
 * Mismo mando, mismo dt, misma banda y mismo slew. Sin navegador. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bt=fs.readFileSync(ROOT+'/backtracking.html','utf8');
const f0=bt.indexOf('FÍSICA PURA'), f1=bt.lastIndexOf('/* FIN-FÍSICA');
const fis=bt.slice(bt.lastIndexOf('/*',f0), f1);
/* la física de la página necesita sol.js e irradiancia.js delante, como hacen
   los bancos: se anteponen igual, no se recorta el bloque */
const sol=fs.readFileSync(ROOT+'/sol.js','utf8')+'\n'+fs.readFileSync(ROOT+'/irradiancia.js','utf8');
const P=new Function(sol+fis+'\nreturn {crearLazo,DEADBAND_DEG,TRACKER_SLEW};').call(globalThis);
new Function(fs.readFileSync(ROOT+'/js/control_core.js','utf8')).call(globalThis);
const C=globalThis.CTRLCORE;
if(!C) throw new Error('CTRLCORE no ha cargado');
console.log('núcleo expone:', Object.keys(C).join(', '));
console.log('CANON:', JSON.stringify(C.CANON));
console.log('página: deadband', P.DEADBAND_DEG, '· slew', P.TRACKER_SLEW);

/* una rampa como la de un día: sube, se para, invierte. Es donde la banda muerta
   y la memoria de sentido deciden, que es justo lo que se quiere carear. */
const DT=600;                                  // 10 min, el paso del anual
const cmds=[];
for(let k=0;k<40;k++) cmds.push([ -50 + 2.5*k ]);          // rampa de subida
for(let k=0;k<20;k++) cmds.push([  50 - 0.4*k ]);          // meseta lenta
for(let k=0;k<40;k++) cmds.push([  42 - 2.5*k ]);          // inversión

const LZ=P.crearLazo();                        // banda y slew canónicos de la página
const loop={deadbandDeg:P.DEADBAND_DEG, slewDegS:P.TRACKER_SLEW, cicloSeg:1, maxAngle:90};
let prevN=null, dirN=0, parkN=null, duN=0, cmdAnt=null;
let maxDif=0, difs=0, n=0, peor=null;
for(const cmd of cmds){
  const pag=LZ.paso(cmd,DT)[0];
  let nuc;
  if(prevN==null){ nuc=pag; cmdAnt=cmd[0]; }   // misma siembra: la primera muestra no pasa por lazo
  else {
    /* `tPrev` es la CONSIGNA anterior, no la posición anterior: el núcleo rampa
       el objetivo de tPrev a tNow dentro del tramo. Pasarle la posición era mi
       segundo error de planteamiento en el mismo careo. */
    const r=C.execTramo(prevN, cmdAnt, cmd[0], DT/60, loop, null, dirN, parkN, duN);
    nuc=r.theta; dirN=r.dir; parkN=r.park; duN=r.dirUlt;
  }
  /* CONTROL, y no es decorativo: la primera versión de este careo leía `r.th`
     —una clave que no existe—, así que `nuc` salía NaN, `NaN > 1e-9` era falso y
     el careo anunciaba «coinciden» sin haber comparado nada. Un NaN aquí para la
     comparación en vez de dejarla pasar. */
  if(!Number.isFinite(pag)||!Number.isFinite(nuc))
    throw new Error('careo INVÁLIDO en el paso '+n+': página='+pag+' núcleo='+nuc);
  prevN=nuc; cmdAnt=cmd[0]; n++;
  const d=Math.abs(pag-nuc);
  if(d>1e-9){ difs++; if(!peor||d>peor.d) peor={paso:n,cmd:cmd[0],pag:pag,nuc:nuc,d:d}; }
  maxDif=Math.max(maxDif,d);
}
console.log('\npasos careados:',n,'· con diferencia:',difs,'· |Δ| máx:',maxDif.toFixed(6),'°');
if(peor) console.log('peor:', JSON.stringify(peor));
console.log(difs===0?'LOS DOS LAZOS COINCIDEN en este careo':'LOS DOS LAZOS DIFIEREN');
