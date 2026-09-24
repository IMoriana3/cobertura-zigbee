// PASO 3 · REFUTACIÓN: ¿qué hacía driveCoupleSafe además de acoplar? Parejas en contacto 3D (residuo < −1 mm)
// de true3d en Ayora (banda de la página), 21-jun y 21-dic cada 30 min con sol > 1°: ángulo crudo, con
// driveCoupleSafe (acople de líneas enteras + reparación) y con la reparación tomando cada línea como su unidad.
//     node audit5/P3_3_reparacion.mjs
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const F=cargaSimulador(ROOT,['driveCoupleSafe','tangentResidualPairMm','applyDrive','anglesTrue3d']).F;
const datos=JSON.parse(fs.readFileSync(path.join(ROOT,'ayora_cotas.json'),'utf8')), lay=JSON.parse(fs.readFileSync(path.join(ROOT,'ayora_layout.json'),'utf8'));
const T=terrenoComoLaPagina(F,datos,80,0).T;
let tot={crudo:0,acoplado:0,reparaPorLinea:0,n:0};
for(const d of [172,355]) for(let h=5;h<=19;h+=1) for(const mm of [0,30]){
  const doy=d, dt=Date.UTC(2026,0,1)+(d-1)*864e5+(h*60+mm)*6e4;
  const g=F.solarPos(dt,lay.clat,lay.clon); if(g.elev<=1)continue;
  const crudo=F.anglesTrue3d(g.zen,g.az,T), acop=F.driveCoupleSafe(g.zen,g.az,T,crudo,true);
  const cuenta=a=>{let n=0;for(let p=0;p<T.pairs.length;p++){const r=F.tangentResidualPairMm(g.zen,g.az,T,a,p);if(isFinite(r)&&r<-1)n++;}return n;};
  const Tu=Object.assign({},T,{groups:T.pairs.map((_,i)=>[i]).concat([[T.pairs.length]])}); const unit=F.driveCoupleSafe(g.zen,g.az,Tu,crudo,true); tot.reparaPorLinea+=cuenta(unit); tot.crudo+=cuenta(crudo); tot.acoplado+=cuenta(acop); tot.n++;
}
console.log(JSON.stringify(tot), 'parejas:', T.pairs.length);
