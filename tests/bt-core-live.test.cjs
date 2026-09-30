'use strict';
const assert=require('node:assert/strict');
const api=require('../bt-core-live.js');
let tests=0;

const c={lat:38,lon:0,alt:200,date:'2024-12-21',tz:1,nrows:4,nsl:'alineadas',ntrk:1};
const T={pairs:[
 {slope:3,pitch:6,axisTilt:4},{slope:3,pitch:6,axisTilt:4},{slope:3,pitch:6,axisTilt:4}],
 cw:2.382,maxAngle:55,axisAz:0,filaLen:40,rowTilt:[4,4,4,4],groups:[[0,1],[2,3]],rotula:null};

assert.equal(api.utcTimestamp('2024-12-21',600,1),'2024-12-21T09:00:00.000Z');tests++;
assert.deepEqual(api.declaredBindings(4,T.groups),{0:'sim-motor-0001',1:'sim-motor-0001',2:'sim-motor-0002',3:'sim-motor-0002'});tests++;
assert.equal(api.unsupportedReason(c,T,null),null);tests++;
const req=api.buildRequest(c,T,600,null);
assert.deepEqual(req.timestamps_utc,['2024-12-21T09:00:00.000Z']);tests++;
assert.equal(req.cross_axis_slope_deg,3);assert.equal(req.axis_tilt_deg,4);tests++;
assert.equal(req.pairs.length,3);assert.equal(req.pairs[1].cross_axis_slope_deg,3);tests++;
assert.equal(req.gcr,2.382/6);tests++;
const nonuniform={...T,pairs:[T.pairs[0],{...T.pairs[1],slope:4,pitch:6.2},T.pairs[2]]};
assert.equal(api.unsupportedReason(c,nonuniform,null),null);tests++;
const nonReq=api.buildRequest(c,nonuniform,600,null);
assert.equal(nonReq.pairs[1].cross_axis_slope_deg,4);assert.equal(nonReq.pairs[1].pitch_m,6.2);tests++;
assert.ok(api.unsupportedReason({...c,nsl:'tresbolillo'},T,null));tests++;
assert.ok(api.unsupportedReason(c,T,{real:true}));tests++;

(async()=>{
 const fake=async(url,options)=>({ok:true,status:200,json:async()=>({
   schema:'bt-validation-response/v1',source_sha:'a'.repeat(40),samples:[],scene:{schema:'bt-canonical-scene/v1'}
 })});
 const out=await api.requestCore('http://core/bt/validate',req,fake);
 assert.equal(out.schema,'bt-validation-response/v1');tests++;
 await assert.rejects(()=>api.requestCore('',req,fake));tests++;
 console.log(JSON.stringify({status:'PASSED',tests,scope:'A4 request bridge only; no browser-side physics'}));
})().catch(e=>{console.error(e);process.exit(1);});
