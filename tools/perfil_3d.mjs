/* DÓNDE SE VA EL TIEMPO AL ABRIR EL 3D DE UNA PLANTA.
 *
 * POR QUÉ EXISTE. «El 3D va muy lento» es una queja real y cara de diagnosticar a ojo: el visor
 * hace una docena de cosas al arrancar —seguidores, BOS, vegetación, AO de contacto, sombras de
 * nube, redes— y bajar un umbral sin saber cuál pesa es cambiar código para nada, y de paso
 * degradar el aspecto de una planta que iba bien. Esto cronometra cada fase por separado.
 *
 * CÓMO. Se envuelve cada función de build() con un cronómetro ANTES de que build() arranque,
 * inyectando el envoltorio en el HTML servido. No se toca el fichero del repo: lo que se mide es
 * exactamente el código que se publica.
 *
 * CUIDADO CON LOS HUÉRFANOS. Este banco es de CPU pura y el entorno tiene 4 núcleos: un
 * renderizador de una medición anterior que se quedara vivo se come tres y falsea el reloj —me pasó
 * midiendo Benante y di un número que no era—. Antes de medir:  pkill -f headless_shell
 *
 *     python3 -m http.server 8124 &
 *     node tools/perfil_3d.mjs <planta> [<planta> ...]
 */
import pw from '/home/user/Cobertura-Zigbee/node_modules/playwright-core/index.js';
const { chromium } = pw;
const FN=['buildTrackers','layoutTrackers','buildBOS','buildVeg','buildContactAO','buildCloudShadows',
          'buildGateways','buildCorridor','buildSunPath','dressMaterials','indexaEquipos','redesPanel','invPanel'];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage']});
for(const PL of process.argv.slice(2)){
  const pg=await b.newPage({viewport:{width:640,height:420}});
  await pg.addInitScript(()=>{localStorage.cobertura_offline='1';});
  await pg.route('**/terreno.html*', async r=>{
    const res=await r.fetch(); let h=await res.text();
    const patch='<script>window.__T={};window.__crono=function(ns){ns.forEach(function(n){var f=window[n];if(typeof f!=="function")return;'
      +'window[n]=function(){var t=performance.now();try{return f.apply(this,arguments);}finally{window.__T[n]=(window.__T[n]||0)+(performance.now()-t);}};});};<\/script>';
    h=h.replace('</head>',patch+'</head>');
    h=h.replace('build().catch(', 'window.__crono('+JSON.stringify(FN)+'),build().catch(');
    await r.fulfill({response:res,body:h,headers:{...res.headers(),'content-type':'text/html; charset=utf-8'}});
  });
  const t0=Date.now();
  await pg.goto('http://localhost:8124/terreno.html?planta='+PL,{waitUntil:'domcontentloaded',timeout:120000});
  let ok=true;
  try{ await pg.waitForFunction(()=>typeof TRK!=='undefined'&&TRK.length>0&&typeof bosGroup!=='undefined'&&bosGroup&&bosGroup.children.length>0,{timeout:900000}); }catch(e){ok=false;}
  const r=await pg.evaluate(()=>({T:window.__T,trk:(typeof TRK!=='undefined'?TRK.length:0),
    piezas:(typeof SEG!=='undefined'&&SEG)?SEG.length:0,
    veg:(function(){let n=0;scene.traverse(o=>{if(o.isInstancedMesh)n+=o.count;});return n;})()}));
  const tot=Date.now()-t0;
  console.log(PL.padEnd(11)+(ok?'':'(INCOMPLETO) ')+'total '+(tot/1000).toFixed(0)+' s · trk '+r.trk+' · piezas/seguidor '+r.piezas+' · instancias '+r.veg);
  Object.entries(r.T).sort((a,c)=>c[1]-a[1]).slice(0,8).forEach(([k,v])=>{if(v>60)console.log('   '+k.padEnd(20)+(v/1000).toFixed(1)+' s');});
  await pg.close();
}
await b.close();
