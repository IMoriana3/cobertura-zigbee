const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const api = require('../scada-projection.js');
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row = (n,slave,asset) => ({geometry_binding:`geometry-${asset}`,tracker_asset_id:U(asset),
  tcu_asset_id:U(asset+100),ncu_asset_id:U(n+200),source_ncu:String(n),source_slave:String(slave),aliases:{}});
const p = {schema_version:1,plant_id:'23003',source_plant:'El Burgo I',plant_route:'elburgo',
  read_only:true,operationally_usable:false,record_status:'provisional',registry_revision:'r1',
  valid_from:'2026-09-23T00:00:00+02:00',valid_to:'2026-10-01T00:00:00+02:00',
  publication:{published:true,commit:'a'.repeat(40)},source_ncus:{'1':U(201),'2':U(202)},
  trackers:[row(1,100,1),row(2,100,2)]};
api.validate(p);
assert.throws(()=>api.validate({...p,publication:{published:false}}),/publicación/);
assert.throws(()=>api.validate({...p,trackers:[p.trackers[0],p.trackers[0]]}),/ambiguas/);
assert(api.validAt(p,'2026-09-22T22:00:00Z'));
assert(!api.validAt(p,'2026-09-22T21:59:59Z'));
assert(!api.validAt(p,p.valid_to));
const layout = {cE:680000,cN:4600000,trackers:[
  {idPrevio:'geometry-2',id:'100',x:10,n:20},{idPrevio:'geometry-1',id:'100',x:1,n:2}]};
const bound = api.attachLayout(layout,p);
const bundle = {projection:p,layout:bound};
const plan = api.plan(bundle,{ox:680000,oy:4600000,ncus:[{ncu:2,x:3,y:4}],hsus:[]});
assert.equal(plan.tcus[0].tcu_asset_id,U(102));
assert.equal(plan.tcus[0].x,680010);assert.equal(plan.ncus[0].x,680003);
assert.equal(plan.tcus.filter(t=>t.ncu==='1').length,1);
assert(plan.tcus.filter(t=>t.ncu==='1').every(t=>t.tcu_asset_id===U(101)));
const at='2026-09-24T08:00:00Z';
const data=[{ncu:1,tcu:100,salud:'OK',tilt:18,dif:1},{ncu:2,tcu:100,salud:'ALARMA',tilt:20,dif:7}];
let resolved=api.resolveRows(p,data,'El Burgo I',at);
assert.equal(resolved.byAsset.get(U(101)).tilt,18);
assert.equal(resolved.byAsset.get(U(102)).tilt,20);
assert.equal(api.resolveRows(p,data,'San José',at).byAsset.size,0);
assert.equal(api.resolveRows(p,data,'El Burgo I','2026-09-22T00:00:00Z').byAsset.size,0);
assert.equal(api.resolveRows(p,[data[0]],'El Burgo I',at).byAsset.size,1);
assert.equal(api.resolveRows(p,[data[0],data[0],data[1]],'El Burgo I',at).byAsset.size,1);
assert.equal(api.resolveRows(p,[{...data[0],tcu_asset_id:U(102)}],'El Burgo I',at).byAsset.size,0);
// Explicit multipoint: two tracker assets can use the same TCU binding.
api.validate({...p,trackers:[p.trackers[0],{...p.trackers[0],geometry_binding:'extra',tracker_asset_id:U(3)}]});
// Feed the receiver's actual join: shuffled scene and identical display labels
// must retain the same source measurement as the 2D projection.
const html=fs.readFileSync(path.join(__dirname,'../terreno.html'),'utf8');
const start=html.indexOf('var SCADA3D=null'),end=html.indexOf('var _scadaClick=',start);
const c={};vm.createContext(c);vm.runInContext(html.slice(start,end),c);
const msg={plant_id:p.plant_id,filas:[...resolved.byAsset.values()]};
const joined=c.scadaBindings(bound.trackers,msg,p.plant_id);
for(let i=0;i<plan.tcus.length;i++){
  const expected=resolved.byAsset.get(plan.tcus[i].tcu_asset_id);
  assert.equal(joined.byTrk[i].tilt,expected.tilt);
  assert.equal(c.scadaColorFila(joined.byTrk[i],'posiciones'),expected.dif<=2?0x36D399:0xef5f6b);
}
const missing=c.scadaBindings(bound.trackers,{plant_id:p.plant_id,filas:[msg.filas[0]]},p.plant_id);
assert.equal(missing.casados,1);assert.equal(missing.sin,1);
assert.throws(()=>api.attachLayout({...layout,trackers:[layout.trackers[0],layout.trackers[0]]},p));
console.log('Shared 2D/3D projection: plant/NCU isolation, temporal validity, duplicates, missing data, multipoint and parity passed');

// Release artifact: verify the actual committed projection and layout bytes.
const crypto=require('node:crypto');
const released=JSON.parse(fs.readFileSync(path.join(__dirname,'../elburgo_scada_bindings.json'),'utf8'));
api.validate(released,false);
assert.equal(released.publication.commit,'5de36d2f6d56ce878299ed95c41e5e1d18d35ad5');
assert.equal(released.read_only,true);assert.equal(released.operationally_usable,false);
const rawLayout=fs.readFileSync(path.join(__dirname,'../elburgo_layout.json'));
assert.equal(released.layout_sha256,'sha256:'+crypto.createHash('sha256').update(rawLayout).digest('hex'));
const realBound=api.attachLayout(JSON.parse(rawLayout),released);
assert.equal(realBound.trackers.length,released.trackers.length);
const real108=released.trackers.find(t=>t.source_ncu==='1'&&t.source_slave==='108');
assert.equal(real108.geometry_binding,'1.18.7');
assert(!released.trackers.some(t=>t.source_ncu==='2'&&t.source_slave==='108'));
console.log('Published canonical artifact, read-only policy, layout hash and explicit 108 correction passed');

// Regression: 91.1% must not look like 100% on a small map marker.
const measuredColor = porcentaje => api.continuityColor({estado:'MEDIDO',porcentaje});
const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const distance = (a,b) => Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));
assert(distance(measuredColor(91.1),measuredColor(100))>120);
assert(distance(measuredColor(99),measuredColor(100))>50);
assert.equal(api.continuityColor({estado:'UNKNOWN',porcentaje:91.1}),'#6A7B8B');
const legend = api.continuityLegend();
for(const pct of [0,50,90,95,100])assert(legend.includes('data-continuity-percent="'+pct+'"'));
assert(legend.includes(measuredColor(0))&&legend.includes(measuredColor(100)));
assert(legend.includes('Escala ampliada cerca del 100 %'));
assert(legend.includes('sin umbrales de alarma'));
console.log('Continuity scale: 91.1/99 distinguishable from 100, shared labelled scale and UNKNOWN preserved');
