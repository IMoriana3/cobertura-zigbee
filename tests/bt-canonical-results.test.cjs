'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const api=require('../bt-canonical-results.js');
const fixture=JSON.parse(fs.readFileSync(__dirname+'/fixtures/bt-canonical-result.json','utf8'));
let tests=0;
async function main(){
 const data=await api.decode(fixture,crypto.webcrypto);tests++;
 assert.equal(data.frames[0].receivers[0].theta_command_deg, -25.7);tests++;
 const frame=api.viewFrame(data,0);frame.receivers[0].theta_command_deg=5;
 assert.equal(api.viewFrame(data,0).receivers[0].theta_command_deg,-25.7);tests++;
 assert.throws(()=>api.viewFrame(data,1));tests++;
 await assert.rejects(()=>api.decode({...fixture,payload:fixture.payload+' '},crypto.webcrypto));tests++;
 await assert.rejects(()=>api.decode({...fixture,sha256:'0'.repeat(64)},crypto.webcrypto));tests++;
 const mutations=[
  x=>x.operational=true,
  x=>x.transition_validated=true,
  x=>x.global_optimum_proven=true,
  x=>x.coordinate_frame='unknown',
  x=>x.frames=[],
  x=>x.rows.push(x.rows[0]),
  x=>x.frames[0].receivers[1].asset_id='another-motor',
  x=>x.frames[0].receivers[1].theta_command_deg=0,
  x=>x.frames[0].receivers[0].shadow_fraction=1.1,
  x=>x.frames[0].receivers[0].clearance_m=-1,
  x=>x.frames[0].receivers[0].clearance_status='no_forward_blocker',
  x=>x.frames[0].receivers.pop(),
  x=>x.frames[0].surfaces.pop(),
  x=>x.frames[0].surfaces.push(x.frames[0].surfaces[0]),
  x=>x.frames[0].surfaces[0].corners_m[0]=[1,2],
  x=>x.frames[0].surfaces[0].geometry_row_index=87,
  x=>x.frames.push(x.frames[0]),
  x=>x.frames[0].timestamp_utc='2024-01-01',
  x=>x.frames[0].solar_position.apparent_zenith=190,
  x=>x.frames[0].environment_included=true,
 ];
 for(const mutate of mutations){const x=JSON.parse(JSON.stringify(data));mutate(x);assert.throws(()=>api.validate(x));tests++;}
 console.log(JSON.stringify({status:'PASSED',tests,scope:'browser result transport, not JS physics or deployed AUTO'}));
}
main().catch(e=>{console.error(e);process.exit(1);});
