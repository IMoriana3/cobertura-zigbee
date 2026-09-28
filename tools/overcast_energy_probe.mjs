import fs from 'node:fs';
import {runtime} from './overcast_test_runtime.mjs';
const R=runtime();
const records=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(records.map(q=>{
  const orient=R.surfaceOrient(q.theta,q.axisTilt,q.axisAz);
  const incident=R.poaTracker(q.theta,q.axisTilt,q.axisAz,q.zen,q.az,q.irr,q.doy,q.albedo);
  return {orient,incident,effective:R.OvercastEnergy.effective(incident,orient.tilt,orient.az,q.zen,q.az)};
})));
