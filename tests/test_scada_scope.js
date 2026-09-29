/* Synthetic contract/consumer regression. Does not connect to a plant. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../terreno.html'),'utf8');
const ScadaProjection=require('../scada-projection.js');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return html.slice(i,j);}
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const p={plant_id:'23003',registry_revision:'r1',source_plant:'El Burgo I',plant_timezone:'Europe/Madrid',
 valid_from:'2026-09-23T00:00:00+02:00',valid_to:null,source_ncus:{'1':U(21),'2':U(22)}};
const trk=[{id:'a',tracker_asset_id:U(1),tcu_asset_id:U(11),ncu_asset_id:U(21)},
{id:'b',tracker_asset_id:U(2),tcu_asset_id:U(12),ncu_asset_id:U(22)},
{id:'a2',tracker_asset_id:U(3),tcu_asset_id:U(11),ncu_asset_id:U(21)},
{id:'unknown'}];
const msg={version:2,plant_key:'elburgo',plant_id:p.plant_id,registry_revision:p.registry_revision,planta:p.source_plant,
 at:'2026-09-22T22:00:00Z',until:'2026-09-23T22:00:00Z',timezone:p.plant_timezone,
 fuente:'telemetria_csv',capa:'continuidad',fecha:'2026-09-23',scope_ncu:'1',
 filas:[{ncu:'1',tcu_asset_id:U(11),continuidad:{estado:'MEDIDO',porcentaje:91.1}},
 {ncu:'2',tcu_asset_id:U(12),continuidad:{estado:'MEDIDO',porcentaje:100}}]};
const el={style:{}},colors=[];
const ctx={ScadaProjection,PLANT:'elburgo',TRK:trk,LAYOUT:{plant_id:p.plant_id,scada_identity:p},WIND:{},
 scadaOverlay(){},updateSpin(){},panelAngle:()=>0,curMin:720,scadaHud(){},scadaBindClick(){},
 document:{getElementById:()=>el},afbtOn:false,afbtSel:-1,
 THREE:{Color:function(){this.setHex=x=>{this.x=x;};}},
 tintModulos:fn=>{colors.length=0;trk.forEach((t,i)=>colors.push(fn(i).x));}};
vm.createContext(ctx);
vm.runInContext(section('var SCADA3D=null','var _scadaClick='),ctx);
vm.runInContext(section('function scadaFicha(','function tintModulos('),ctx);
vm.runInContext(section('function scadaOverlay(){','function scadaAvisoConexion('),ctx);
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
check('selected NCU uses canonical membership, not index/source labels',()=>{
 assert(ctx.scadaCasar(msg));assert.equal(ctx.SCADA3D.enAmbito,2);assert.equal(ctx.SCADA3D.casados,2);
 assert.equal(ctx.SCADA3D.tcusVinculadas,1);assert(ctx.SCADA3D.fuera[1]);assert(ctx.SCADA3D.fuera[3]);
});
check('outside scope distinct from UNKNOWN and excluded from counts',()=>{
 assert.equal(ctx.SCADA3D.sin,0);assert.equal(colors[1],0x23303D);
 assert(el.innerHTML.includes('2 / 2 trackers'));assert(el.innerHTML.includes('1 TCUs'));assert(el.innerHTML.includes('NCU 1'));
 ctx.scadaFicha(1);assert(el.innerHTML.includes('Fuera del ámbito'));assert(!el.innerHTML.includes('offline'));
});
check('value/color unchanged from shared adapter',()=>assert.equal(colors[0],parseInt(ScadaProjection.continuityColor(msg.filas[0].continuidad).slice(1),16)));
check('switch NCU clears previously attributed trackers',()=>{
 ctx.scadaCasar({...msg,scope_ncu:'2'});assert.equal(ctx.SCADA3D.casados,1);assert(ctx.SCADA3D.fuera[0]);assert(!ctx.SCADA3D.byTrk[0]);
});
check('unknown/malformed scope fails closed, never expands to plant',()=>{
 for(const scope_ncu of ['99','',1,['1']]){ctx.scadaCasar({...msg,scope_ncu});assert.equal(ctx.SCADA3D.casados,0);assert.equal(ctx.SCADA3D.enAmbito,0);assert(el.innerHTML.includes('no verificable'));}
});
check('source NCU mismatch cannot attribute a row in scoped view',()=>{
 ctx.scadaCasar({...msg,filas:[{...msg.filas[0],ncu:'2'}]});assert.equal(ctx.SCADA3D.casados,0);assert.equal(ctx.SCADA3D.sin,2);
});
check('missing/expired registry refuses attribution',()=>{
 p.valid_to='2026-09-23T12:00:00+02:00';ctx.scadaCasar(msg);assert.equal(ctx.SCADA3D.casados,0);p.valid_to=null;
 delete ctx.LAYOUT.scada_identity;ctx.scadaCasar(msg);assert.equal(ctx.SCADA3D.casados,0);ctx.LAYOUT.scada_identity=p;
});
check('legacy unscoped message retains complete-plant behavior',()=>{
 const m={...msg};delete m.scope_ncu;ctx.scadaCasar(m);assert.equal(ctx.SCADA3D.casados,3);assert.equal(ctx.SCADA3D.enAmbito,4);assert.equal(ctx.SCADA3D.sin,1);
 assert(el.innerHTML.includes('Toda la planta'));
});
check('explicit empty/duplicate evidence remains UNKNOWN within scope',()=>{
 ctx.scadaCasar({...msg,filas:[]});assert.equal(ctx.SCADA3D.sin,2);
 ctx.scadaCasar({...msg,filas:[msg.filas[0],msg.filas[0]]});assert.equal(ctx.SCADA3D.casados,0);
});
check('foreign plant cannot overwrite current view',()=>{const old=ctx.SCADA3D;assert.equal(ctx.scadaCasar({...msg,plant_key:'other'}),false);assert.equal(ctx.SCADA3D,old);});
console.log(`${count} SCADA scope checks PASSED, 0 FAILED; no authenticated production data.`);
