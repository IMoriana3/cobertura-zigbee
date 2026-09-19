/* R3 · FASE 2 — ¿la página, ya cambiada, publica lo que la sonda predijo?
 *
 * Pulsa «Calcular año» y lee la tabla que sale a pantalla. No recalcula nada por
 * su cuenta: lo que compara es lo PUBLICADO contra los números de
 * audit3/out/F2_anual_lazo.json, que se midieron ANTES de tocar el motor.
 *
 *     node audit3/F2_verifica_pagina.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { EXE } = await import(path.join(ROOT, 'tools', 'pw_navegador.mjs'));
const PORT = 8840;
const { chromium } = await import('playwright');
const srv=spawn('python3',['-m','http.server',String(PORT),'--directory',ROOT],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({executablePath:EXE,args:['--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage']});
try{
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  pg.on('pageerror',e=>console.log('PAGEERROR '+e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`,{waitUntil:'load'});
  await pg.waitForFunction(()=>typeof DAY!=='undefined'&&DAY&&DAY.pol,null,{timeout:120000});
  await pg.waitForFunction(()=>{const x=document.getElementById('calcbusy');return !x||getComputedStyle(x).display==='none';},null,{timeout:300000});
  await pg.evaluate(()=>document.getElementById('yearbtn').click());
  await pg.waitForTimeout(2000);
  await pg.waitForFunction(()=>{const t=document.getElementById('yeartab');return t&&t.innerHTML.trim().length>80;},null,{timeout:600000});
  const r=await pg.evaluate(()=>{
    const filas=[...document.querySelectorAll('#yeartab tr')].slice(1).map(tr=>{
      const td=[...tr.children].map(x=>x.textContent.trim());
      return {politica:td[0], kwh:parseFloat(td[1]), delta:td[2]};
    });
    return {filas:filas, politicasEncendidas:POLICIES.filter(P=>P.on).map(P=>P.key)};
  });
  console.log(JSON.stringify(r,null,1));
} finally { await b.close(); srv.kill(); }
