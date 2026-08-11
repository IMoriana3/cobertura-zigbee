import { chromium } from '/home/user/cobertura-zigbee/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const dem=readFileSync('/tmp/dem_pendiente.png');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const c=await b.newContext({viewport:{width:1000,height:700}});
await c.route('**/elevation-tiles-prod/**', r=>r.fulfill({status:200,contentType:'image/png',body:dem}));
await c.route('**/server.arcgisonline.com/**', r=>r.abort());
await c.route('**/pnoa**', r=>r.abort());
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8123/terreno.html?planta=fayon',{waitUntil:'load',timeout:150000});
try{ await p.waitForFunction(()=>window.TRK&&window.TRK.length>0,{timeout:120000}); }catch(e){}
await p.waitForTimeout(9000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const ct=LAYOUT.cts[0].slice(); if(Math.hypot(ct[0][0]-ct[ct.length-1][0],ct[0][1]-ct[ct.length-1][1])<1e-6)ct.pop();
  const cx=ct.reduce((s,q)=>s+q[0],0)/ct.length, cn=ct.reduce((s,q)=>s+q[1],0)/ct.length;
  let muros=null;
  bosGroup.children.forEach(o=>{ if(!o.geometry||o.geometry.type!=='ExtrudeGeometry')return;
    const bb=new THREE.Box3().setFromObject(o);
    const ox=(bb.min.x+bb.max.x)/2, on=-(bb.min.z+bb.max.z)/2;
    if(Math.hypot(ox-cx,on-cn)<5 && (bb.max.y-bb.min.y)>1) muros={min:+bb.min.y.toFixed(2),max:+bb.max.y.toFixed(2)};});
  const esq=ct.map(q=>({p:[q[0],q[1]], suelo:+terrainMeshY(q[0],q[1]).toFixed(2)}));
  const yBase=muros?muros.min:0;
  esq.forEach(e=>e.hueco=+(yBase-e.suelo).toFixed(2));
  return {esquinas:esq, hueco_max:+Math.max(...esq.map(e=>e.hueco)).toFixed(2), baseElev:+baseElev.toFixed(1), vex, relieve_trk:[+Math.min(...TRK.map(t=>t.rel)).toFixed(2),+Math.max(...TRK.map(t=>t.rel)).toFixed(2)],
    CT_centro:[+cx.toFixed(2),+cn.toFixed(2)], muros_y:muros,
    localElevY_CT:+localElevY(cx,cn).toFixed(2), terrainMeshY_CT:+terrainMeshY(cx,cn).toFixed(2),
    hueco_bajo_el_CT:muros?+(muros.min-terrainMeshY(cx,cn)).toFixed(2):null,
    NCU_y:+gwMasts[0].position.y.toFixed(2), suelo_en_NCU:+terrainMeshY(gwMasts[0].position.x,-gwMasts[0].position.z).toFixed(2),
    RAYO:(function(){ // altura REAL de la malla dibujada, por raycast vertical
      var rc=new THREE.Raycaster(); rc.set(new THREE.Vector3(cx,5000,-cn), new THREE.Vector3(0,-1,0));
      var h=rc.intersectObject(terrain,true);
      var r2=new THREE.Raycaster(); r2.set(new THREE.Vector3(TRK[0].gx,5000,TRK[0].gz), new THREE.Vector3(0,-1,0));
      var h2=r2.intersectObject(terrain,true);
      return {malla_bajo_CT:h.length?+h[0].point.y.toFixed(2):null,
              malla_bajo_TK0:h2.length?+h2[0].point.y.toFixed(2):null,
              terrainMeshY_TK0:+terrainMeshY(TRK[0].gx,-TRK[0].gz).toFixed(2),
              escala_terreno:[terrain.scale.x,terrain.scale.y,terrain.scale.z]};})()};}),null,1));
console.log('errores:',errs.length?errs.slice(0,2):'ninguno');
await b.close();
