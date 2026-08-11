import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';
const lib=await LibreDwg.create(); if(typeof lib.dwg_bmp==='function')lib.dwg_bmp=()=>null;
const db=lib.convert(lib.dwg_read_data(readFileSync('/root/.claude/uploads/e2ea25af-641a-5b73-b560-20aebae95f84/a9a48d1e-LO.25.019_R04C__Layout_Comunicaciones_Paramo_string_2324__R04C.dwg').buffer,0));
const E=db.entities||[]; const gx=e=>e.x??e.insertionPoint?.x, gy=e=>e.y??e.insertionPoint?.y;
const pts=e=>(e.vertices||e.points||[]).map(v=>({x:v.x,y:v.y})).filter(p=>isFinite(p.x));
const TXT=E.filter(e=>e.type==='TEXT'||e.type==='MTEXT').map(e=>({t:(e.text??e.textValue??'').toString().trim(),
  x:gx(e)??e.startPoint?.x, y:gy(e)??e.startPoint?.y})).filter(o=>/^(NCU|HSU)\s*\d/i.test(o.t)&&isFinite(o.x));
function nombra(x,y,pref){ let b=null,bd=1e18;
  TXT.filter(t=>t.t.toUpperCase().startsWith(pref)).forEach(t=>{const d=Math.hypot(t.x-x,t.y-y); if(d<bd){bd=d;b=t;}});
  return {n:b?b.t:pref, d:bd};}
const NCU=E.filter(e=>e.type==='INSERT'&&e.layer==='NCU').map(e=>({x:gx(e),y:gy(e)})).filter(o=>isFinite(o.x));
const TOR=E.filter(e=>e.type==='INSERT'&&/Torre/i.test(e.layer||'')).map(e=>({x:gx(e),y:gy(e)})).filter(o=>isFinite(o.x));
console.log('INSERT NCU:',NCU.length,'| torres:',TOR.length);
NCU.forEach(o=>{const r=nombra(o.x,o.y,'NCU'); console.log(`  NCU (${o.x.toFixed(2)}, ${o.y.toFixed(2)}) -> rotulo "${r.n}" a ${r.d.toFixed(1)} m`);});
TOR.forEach(o=>{const r=nombra(o.x,o.y,'HSU'); console.log(`  Torre (${o.x.toFixed(2)}, ${o.y.toFixed(2)}) -> rotulo "${r.n}" a ${r.d.toFixed(1)} m`);});
// contorno de los edificios de CT
console.log('\npoligonos en capas de edificio:');
E.filter(e=>/Edificio/i.test(e.layer||'')&&['LWPOLYLINE','POLYLINE2D'].includes(e.type)).forEach(e=>{
  const P=pts(e); if(P.length<3)return;
  const xs=P.map(p=>p.x),ys=P.map(p=>p.y);
  console.log(`   ${e.layer}: ${P.length} vert  ${(Math.max(...xs)-Math.min(...xs)).toFixed(2)} x ${(Math.max(...ys)-Math.min(...ys)).toFixed(2)} m  centro (${((Math.min(...xs)+Math.max(...xs))/2).toFixed(1)}, ${((Math.min(...ys)+Math.max(...ys))/2).toFixed(1)})`);});
writeFileSync('/tmp/paramo_com.json',JSON.stringify({NCU:NCU.map(o=>({x:o.x,y:o.y,n:nombra(o.x,o.y,'NCU').n})),TOR:TOR.map(o=>({x:o.x,y:o.y,n:nombra(o.x,o.y,'HSU').n}))}));
