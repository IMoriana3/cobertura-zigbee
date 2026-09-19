/* Cuánto tarda el DÍA con Ayora real. Se mide el reloj de computeDay, no el de
   la página entera: se cronometra dentro, con el mismo botón que usa el usuario. */
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE } from '/home/user/cobertura-zigbee/tools/pw_navegador.mjs';
const ROOT = process.env.RAIZ || '/home/user/cobertura-zigbee';
const PORT = 8810 + (process.pid % 60);
const sha = execFileSync('git',['rev-parse','--short','HEAD'],{cwd:ROOT}).toString().trim();
const { chromium } = await import('playwright');
const srv=spawn('python3',['-m','http.server',String(PORT),'--directory',ROOT],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({executablePath:EXE,args:['--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage']});
try{
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`,{waitUntil:'load'});
  await pg.waitForFunction(()=>typeof DAY!=='undefined'&&DAY&&DAY.pol,null,{timeout:120000});
  await pg.evaluate(()=>document.getElementById('ayorabtn').click());
  await pg.waitForFunction(()=>{const T=terrain(cfg());return !!(T&&T.segs&&T.segTilt);},null,{timeout:300000});
  await pg.waitForFunction(()=>{const x=document.getElementById('calcbusy');return !x||getComputedStyle(x).display==='none';},null,{timeout:900000});
  // ahora, con todo cargado y quieto, se cronometra UN computeDay
  const r=await pg.evaluate(()=>{ const t=performance.now(); const d=computeDay();
    return { ms:+(performance.now()-t).toFixed(0), lineas:d.T.segs?d.T.segs.length:null,
             instantes:d.times.length, politicas:Object.keys(d.pol).length,
             porMesa:!!(d.T.segTilt&&d.T.segs) }; });
  console.log(JSON.stringify(Object.assign({commit:sha, raiz:ROOT}, r)));
} finally { await b.close(); srv.kill(); }
