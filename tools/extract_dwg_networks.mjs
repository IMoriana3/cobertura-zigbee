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
  earth_lat:['EE_Latiguillo Desnudo'],                                        // latiguillos de equipotencialidad REALES (~1 m, plano RDT-1: 234 uds dibujadas en 468 trazos)
  trench_string:['EE_Zanjas String'], trench_inv:['Zanjas String-Inversor'],
  trench_n3:['EE_Zanja N3'], trench_mt:['EE_Zanja MT','Cruzamientos _MT','LAMT'],
  cam_range:['CAM RANGES'], arqueta:['EE_Arquetas'], comms:['EE_Equipos comunicaciones'],
};
function matchKey(layer){ for(const k in TARGET){ for(const s of TARGET[k]){ if(layer.includes(s)) return k; } } return null; }
async function grab(path){ const lib=await LibreDwg.create(); const db=lib.convert(lib.dwg_read_data(readFileSync(path).buffer,0)); return db.entities||[]; }
const out={}; for(const k in TARGET) out[k]={raw:0,kept:0,polys:[]};
const picas=[];                                                               // INSERTs del bloque "Pica PAT" (plano RDT-1): posiciones exactas de picas/terminales
// tierra/latiguillos/picas SOLO del DWG del plano de tierras (RDT-1): el layout duplica la capa EE_Tierra
for(const [path,keyOK,takePicas] of [
  ["/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/fbc61f7e-XG23003EL_BURGOCableado_String_03C.dwg", k=>k!=='earth'&&k!=='earth_lat', false],
  ["/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/ef5eb3ee-XG23003EL_BURGOLayout_proyecto_v05C.dwg", k=>k!=='earth'&&k!=='earth_lat', false],
  ["/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/6f4e3655-Viales_El_Burgo.dwg", k=>k==='earth'||k==='earth_lat', true],
]){ const E=await grab(path);
  for(const e of E){
    if(takePicas&&e.type==='INSERT'&&/pica/i.test(e.name||'')&&e.insertionPoint){ const p=[lx(e.insertionPoint),ln(e.insertionPoint)];
      if(Math.abs(p[0])<900&&Math.abs(p[1])<750&&!picas.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<0.3))picas.push(p); continue; }
    const k=matchKey(e.layer||''); if(!k||!keyOK(k))continue; for(const pl of entPolylines(e)){ out[k].raw++; if(pl.length>1&&inFoot(pl)){ out[k].kept++; out[k].polys.push(pl);} } }
}
// DEDUPE: el DWG de tierras trae cada polilínea POR TRIPLICADO (y los latiguillos por duplicado:
// 468=2×234, el número exacto del cuadro RDT-1) — solapadas se veían como "cada vez más cables"
for(const k in out){ const seen=new Set();
  out[k].polys=out[k].polys.filter(pl=>{ const key=pl.map(p=>Math.round(p[0]*10)+','+Math.round(p[1]*10)).join(';');
    const rev=pl.slice().reverse().map(p=>Math.round(p[0]*10)+','+Math.round(p[1]*10)).join(';');
    if(seen.has(key)||seen.has(rev))return false; seen.add(key); return true; });
  out[k].kept=out[k].polys.length; }
// RECORTE del pasillo norte (lóbulo del HSU 1): los dos anillos perimetrales del DWG suben por él
// (x≈-90,7, n 148→280) siguiendo la zanja CCTV, pero en el gemelo ese tramo sobra ("este tramo sobra")
// — se parte la polilínea y se retira el tramo del lóbulo (y las colillas que quedarían flotando)
{ const LOBO=p=>p[1]>152&&p[0]>-93&&p[0]<-58;
  const out2=[];
  for(const pl of out.earth.polys){ let cur=[];
    for(const p of pl){ if(LOBO(p)){ if(cur.length>1)out2.push(cur); cur=[]; } else cur.push(p); }
    if(cur.length>1)out2.push(cur); }
  console.log('recorte lóbulo norte: earth',out.earth.polys.length,'->',out2.length,'polilíneas');
  out.earth.polys=out2; out.earth.kept=out2.length;
}
// EARTH_CROSS derivado: el RDT-1 pone en 5 líneas E-O un terminal+latiguillo por fila (234), pero NI el PDF
// NI el DWG dibujan el conductor entre terminales (verificado a 600 dpi y contra las 22.941 entidades del DWG).
// Se tiende recto por cada línea de terminales y se ata a la red dibujada en el primer corte de cada extremo.
{ const mids=out.earth_lat.polys.map(pl=>{const A=pl[0],B=pl[pl.length-1];return [(A[0]+B[0])/2,(A[1]+B[1])/2];});
  const cls=[];
  for(const m of mids){let c=cls.find(c=>Math.abs(c.sn/c.k-m[1])<3);if(!c){c={sn:0,k:0,xs:[]};cls.push(c);}c.sn+=m[1];c.k++;c.xs.push(m[0]);}
  const ES=[];out.earth.polys.forEach(pl=>{for(let i=0;i+1<pl.length;i++)ES.push([pl[i],pl[i+1]]);});
  const TRKS=JSON.parse(readFileSync('/home/user/Cobertura-Zigbee/elburgo_layout.json','utf8')).trackers, HLT=32.5;
  const cross=[];
  for(const c of cls){ const n=Math.round(c.sn/c.k*100)/100, x0=Math.min(...c.xs), x1=Math.max(...c.xs);
    const tie=(xa,dir)=>{let best=null;
      for(const [a,b] of ES){const dn=b[1]-a[1];if(Math.abs(dn)<1e-9)continue;const t=(n-a[1])/dn;if(t<0||t>1)continue;
        const X=a[0]+t*(b[0]-a[0]),d=(X-xa)*dir;if(d>0.01&&d<100&&(!best||d<best.d))best={d,X};}
      if(!best)return xa;
      for(let s=1.5;s<best.d;s+=1.5){const X2=xa+dir*s;                              // la prolongación solo vale si llega SIN pisar un seguidor
        if(TRKS.some(t=>Math.abs(X2-t.x)<3.05&&Math.abs(n-t.n)<HLT))return xa;}      // (si no, muere en su último terminal: ya ata por sus cruces intermedios)
      return Math.round(best.X*100)/100;};
    cross.push([[tie(x0,-1),n],[tie(x1,1),n]]); }
  var CROSS=cross;
  console.log('earth_cross (derivado de líneas de terminales):',cross.map(pl=>'n='+pl[0][1]+' x['+pl[0][0]+','+pl[1][0]+']').join(' · '));
}
const json={cE,cN,layers:{}};
console.log('layer            raw   kept   bbox(localm)');
for(const k in out){ const o=out[k]; if(!o.kept){console.log(k.padEnd(15),String(o.raw).padStart(5),'   0'); json.layers[k]=[]; continue;}
  let x0=1e9,x1=-1e9,n0=1e9,n1=-1e9; o.polys.forEach(pl=>pl.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);n0=Math.min(n0,p[1]);n1=Math.max(n1,p[1]);}));
  console.log(k.padEnd(15),String(o.raw).padStart(5),String(o.kept).padStart(6),'  x['+x0.toFixed(0)+','+x1.toFixed(0)+'] n['+n0.toFixed(0)+','+n1.toFixed(0)+']');
  json.layers[k]=o.polys;
}
json.layers.earth_pica=picas;
json.layers.earth_cross=CROSS;
console.log('earth_pica (INSERTs Pica PAT):',picas.length);
writeFileSync('/home/user/Cobertura-Zigbee/elburgo_networks.json', JSON.stringify(json));
const sz=readFileSync('/home/user/Cobertura-Zigbee/elburgo_networks.json').length;
console.log('\nwrote elburgo_networks.json', (sz/1024).toFixed(0)+' KB');

// NOTA: tras regenerar desde los DWG, ejecuta también tools/snap_cables_to_rows.mjs
// (imanta el cableado DC al eje de su fila; el DWG lo dibuja a media calle por legibilidad CAD).
