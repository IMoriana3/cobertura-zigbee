import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';
const cE=683562.922059555, cN=4605080.984298119;     // origen UTM del layout (EPSG:25830) — confirmado con el match de seguidores
const R=(v)=>Math.round(v*100)/100;
function lx(p){return R(p.x-cE);} function ln(p){return R(p.y-cN);}
function entPolylines(e){   // devuelve array de polilíneas [[x,n],...] en coords locales
  const t=e.type, out=[];
  if(t==='LWPOLYLINE'||t==='POLYLINE'){ if(e.vertices&&e.vertices.length>1) out.push(e.vertices.map(v=>[lx(v),ln(v)])); }
  else if(t==='LINE'){ const a=e.startPoint||e.start,b=e.endPoint||e.end; if(a&&b) out.push([[lx(a),ln(a)],[lx(b),ln(b)]]); }
  else if(t==='ARC'){ const c=e.center,r=e.radius; if(c&&r){ let a0=e.startAngle,a1=e.endAngle; if(a1<a0)a1+=2*Math.PI; const N=Math.max(6,Math.round((a1-a0)/0.25)); const pl=[]; for(let i=0;i<=N;i++){const a=a0+(a1-a0)*i/N; pl.push([R(c.x-cE+r*Math.cos(a)),R(c.y-cN+r*Math.sin(a))]);} out.push(pl);} }
  else if(t==='CIRCLE'){ const c=e.center,r=e.radius; if(c&&r){ const pl=[]; for(let i=0;i<=24;i++){const a=2*Math.PI*i/24; pl.push([R(c.x-cE+r*Math.cos(a)),R(c.y-cN+r*Math.sin(a))]);} out.push(pl);} }
  else if(t==='SPLINE'){ const ps=(e.fitPoints&&e.fitPoints.length>1)?e.fitPoints:(e.controlPoints||[]); if(ps.length>1) out.push(ps.map(v=>[lx(v),ln(v)])); }
  return out;
}
const inFoot=(pl)=>pl.some(p=>Math.abs(p[0])<900&&Math.abs(p[1])<750);   // al menos un vértice dentro del footprint (descarta cajetín/leyenda lejana)
// destino: {claveSalida: [substrings de capa]}
const TARGET={
  cable_pos:['EE_Cableado N2 +'], cable_neg:['EE_Cableado N2 -'],
  earth:['EE_Tierra 35mm2'], weld:['EE_Soldadura Alum'],
  trench_string:['EE_Zanjas String'], trench_inv:['Zanjas String-Inversor'],
  trench_n3:['EE_Zanja N3'], trench_mt:['EE_Zanja MT','Cruzamientos _MT','LAMT'],
  cam_range:['CAM RANGES'], arqueta:['EE_Arquetas'], comms:['EE_Equipos comunicaciones'],
};
function matchKey(layer){ for(const k in TARGET){ for(const s of TARGET[k]){ if(layer.includes(s)) return k; } } return null; }
async function grab(path){ const lib=await LibreDwg.create(); const db=lib.convert(lib.dwg_read_data(readFileSync(path).buffer,0)); return db.entities||[]; }
const out={}; for(const k in TARGET) out[k]={raw:0,kept:0,polys:[]};
for(const path of [
  "/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/fbc61f7e-XG23003EL_BURGOCableado_String_03C.dwg",
  "/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/ef5eb3ee-XG23003EL_BURGOLayout_proyecto_v05C.dwg",
]){ const E=await grab(path);
  for(const e of E){ const k=matchKey(e.layer||''); if(!k)continue; for(const pl of entPolylines(e)){ out[k].raw++; if(pl.length>1&&inFoot(pl)){ out[k].kept++; out[k].polys.push(pl);} } }
}
const json={cE,cN,layers:{}};
console.log('layer            raw   kept   bbox(localm)');
for(const k in out){ const o=out[k]; if(!o.kept){console.log(k.padEnd(15),String(o.raw).padStart(5),'   0'); json.layers[k]=[]; continue;}
  let x0=1e9,x1=-1e9,n0=1e9,n1=-1e9; o.polys.forEach(pl=>pl.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);n0=Math.min(n0,p[1]);n1=Math.max(n1,p[1]);}));
  console.log(k.padEnd(15),String(o.raw).padStart(5),String(o.kept).padStart(6),'  x['+x0.toFixed(0)+','+x1.toFixed(0)+'] n['+n0.toFixed(0)+','+n1.toFixed(0)+']');
  json.layers[k]=o.polys;
}
writeFileSync('/home/user/Cobertura-Zigbee/elburgo_networks.json', JSON.stringify(json));
const sz=readFileSync('/home/user/Cobertura-Zigbee/elburgo_networks.json').length;
console.log('\nwrote elburgo_networks.json', (sz/1024).toFixed(0)+' KB');
