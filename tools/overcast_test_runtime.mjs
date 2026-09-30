import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function runtime(){
  const html=fs.readFileSync(path.join(root,'overcast.html'),'utf8');
  const begin=html.indexOf('const RAD=Math.PI/180'),end=html.indexOf('/* FIN-FÍSICA');
  const libs=['sol.js','irradiancia.js','overcast_iam.generated.js','overcast_energy.js','overcast_engine.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
  return new Function(libs+'\n'+html.slice(begin,end)+`\nreturn {buildDay,thetaBaselineDay,poaSeries,execOnFineGrid,evaluatePolicyDay,engineeringMetrics,engineeringScore,engineeringCurve,engineeringCandidates,polAdaptive,CANON,DCFG_DEFAULT,OvercastEngine,OvercastEnergy,poaTracker,surfaceOrient,solarPos,omInterp};`)();
}
