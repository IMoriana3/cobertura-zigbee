const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../terreno.html'),'utf8');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+1);assert(i>=0&&j>i);return html.slice(i,j);}
const c={};vm.createContext(c);
vm.runInContext(section('var SCADA3D=null','var _scadaClick='),c);
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const t1={tracker_asset_id:U(1),tcu_asset_id:U(11),id:'100',glat:1,glon:1};
const t2={tracker_asset_id:U(2),tcu_asset_id:U(12),id:'100',glat:1,glon:1};
const f1={tcu_asset_id:U(11),ncu:1,tcu:100,salud:'ALARMA',tilt:20,dif:1};
const f2={tcu_asset_id:U(12),ncu:2,tcu:100,salud:'OFFLINE',tilt:10,dif:0};
const msg=filas=>({tipo:'scada3d',plant_id:'23003',plant_key:'elburgo',version:2,filas});
let r=c.scadaBindings([t2,t1],msg([f1,f2]),'23003');
assert.equal(r.byTrk[0],f2);assert.equal(r.byTrk[1],f1);assert.equal(r.casados,2);
r=c.scadaBindings([t1,t2],msg([f1]),'23003');assert.equal(r.casados,1);assert.equal(r.sin,1);
assert.equal(c.scadaBindings([t1,t2],msg([f1,f1,f2]),'23003').casados,1);
assert.equal(c.scadaBindings([t1,t1],msg([f1]),'23003').casados,0);
assert.equal(c.scadaBindings([t1],msg([f1]),'24019').casados,0);
assert.equal(c.scadaBindings([t1],msg([f1]),null).casados,0);
// Existing layout labels/coordinates/slaves cannot invent a binding, even when identical.
r=c.scadaBindings([{id:'100',glat:1,glon:1,ncu:1}],msg([{eti:'100',lat:1,lon:1,ncu:1,tcu:100,salud:'OK'}]),'23003');
assert.equal(r.casados,0);assert.equal(r.sin,1);assert.equal(r.filasSinVinculo,1);
assert.equal(c.scadaBindings([t1,{...t2,tcu_asset_id:U(11)}],msg([f1]),'23003').casados,2); // explicit multipoint supported
assert.equal(c.scadaColorFila(f1,'posiciones'),0x36D399);
assert.equal(c.scadaColorFila(f1,'salud'),0xef5f6b);
assert.equal(c.scadaColorFila({...f1,dif:5},'posiciones'),0xF2A900);
assert.equal(c.scadaColorFila({...f1,dif:5.1},'posiciones'),0xef5f6b);
for(const tilt of [null,'',undefined,'-','bad']){
 assert.equal(c.scadaColorFila({...f1,tilt},'posiciones'),0x6A7B8B);
 assert.equal(c.scadaAnguloFila({tilt}),0);
}
assert.equal(c.scadaColorFila(f2,'posiciones'),0x6A7B8B);
assert.equal(c.scadaAnguloFila(f1),20);assert.equal(c.scadaAnguloFila(null),0);
assert(html.includes('if(SCADA3D)_ang=scadaAnguloFila(SCADA3D.byTrk[i])'));
assert(!section('var SCADA3D=null','var _scadaClick=').includes('vecino'));
c.PLANT='elburgo';c.TRK=[t1,t2];c.LAYOUT={plant_id:'23003'};c.WIND={};
c.scadaOverlay=()=>{};c.updateSpin=()=>{};c.panelAngle=()=>0;c.curMin=720;c.scadaHud=()=>{};c.scadaBindClick=()=>{};
assert.equal(c.scadaCasar({...msg([f1]),plant_key:'sanjose'}),false);assert.equal(c.SCADA3D,null);
assert.equal(c.scadaCasar({...msg([f1]),planta:'El Burgo I',capa:'posiciones'}),true);
assert.equal(c.SCADA3D.casados,1);assert.equal(c.SCADA3D.capa,'posiciones');
let listener,acks=[];const opener={postMessage:(...x)=>acks.push(x)};
Object.assign(c,{scadaAvisoConexion:()=>{},location:{search:'?scada=1'},URLSearchParams,window:{opener},addEventListener:(_,fn)=>listener=fn,setInterval:()=>0});
vm.runInContext(section("if(new URLSearchParams(location.search).get('scada')==='1')",'function updateSpin('),c);
listener({source:opener,origin:'https://wrong.invalid',data:msg([f2])});assert.equal(acks.length,0);
listener({source:{},origin:'https://factiun-cartera.imoriana3.workers.dev',data:msg([f2])});assert.equal(acks.length,0);
listener({source:opener,origin:'https://factiun-cartera.imoriana3.workers.dev',data:msg([f2])});assert.equal(acks.length,1);
assert.equal(acks[0][0].plant_key,'elburgo');assert.equal(acks[0][1],'https://factiun-cartera.imoriana3.workers.dev');
const panel={style:{}};c.document={getElementById:()=>panel};
vm.runInContext(section('function scadaFicha(', 'function tintModulos('),c);
c.scadaFicha(0);assert(panel.innerHTML.includes('UNKNOWN'));assert(panel.innerHTML.includes('no demuestra'));
console.log('SCADA 3D identity, colors, missing data and message isolation: passed');
