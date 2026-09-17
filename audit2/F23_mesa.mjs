#!/usr/bin/env node
/* F.2 / F.3 — granularidad de la transposición sobre AYORA REAL.
   F.2 (a) POA de planta como está (poaPlant, un tilt por FILA, θ medio de la línea)
       (b) POA transponiendo con el tilt POR MESA y ponderando por MÓDULOS reales
           de cada mesa (PLANT_REAL.segMods), no por largo.
       La variante (b) NO toca el motor: reaprovecha poaRow/shadeRows/elecLoss
       exportados por la propia página, con la misma sombra por mesa (sh.seg/segElec).
   F.3 dispersión de POA entre mesas de un MISMO motor (T.segDrive), percentiles 5/50/95.
   Se corre UN DÍA (21-jun-2026) al paso que se pase, con las 9 políticas.
   Ejecutable:  node audit2/F23_mesa.mjs [pasoMin=20]
   Salida: audit2/out/F23.txt + audit2/out/F23.csv                              */
import path from 'node:path'; import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PASO = +(process.argv[2] || 20), PORT = 8300 + (process.pid % 200);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });

const DIA = `(pasoMin) => {
  const c=cfg(), T=terrain(c), Tcfg=terrainTCU(c,T);
  const PR=PLANT_REAL, doy=doyOf(c.date.slice(0,4)+'-06-21');
  const nR=T.pairs.length+1;
  const mods=[]; for(let r=0;r<nR;r++){ const m=(PR.segMods&&PR.segMods[r])?PR.segMods[r]:null;
    mods.push((T.segs[r]||[]).map((s,k)=>{ const v=m&&m[k]!=null?m[k]:null; return v!=null?v:Math.max(1e-6,s[1]-s[0]); })); }
  const conMod=PR.segMods?PR.segMods.reduce((a,f)=>a+(f||[]).filter(v=>v!=null).length,0):0;
  const total=T.segs.reduce((a,f)=>a+(f||[]).length,0);
  const out={mods_declarados:conMod, mesas:total, nR, pol:{}};
  for(const P of POLICIES){
    if(!P.on)continue;
    let sa=0, sb=0, n=0; const disp=[];
    for(let m=0;m<1440;m+=pasoMin){
      const g=solarPos(localToUTCms(c.date.slice(0,4)+'-06-21',m,c.tz),c.lat,c.lon);
      if(g.elev<=0)continue;
      const irr=clearskyIneichen(g.zen,doy,c.alt,c.tl);
      // consignas POR MESA como las publica la página
      const ls=policyAnglesSeg(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo);
      const ang=segLineMean(T,ls);
      // (a) como está
      const A=poaPlant(g.zen,g.az,T,ang,irr,doy,c.albedo).plant;
      // (b) tilt por MESA + peso por MÓDULOS
      const sh=shadeRows(g.zen,g.az,T,ls);
      let sumF=0;
      for(let r=0;r<nR;r++){
        let acc=0, wt=0;
        for(let k=0;k<ls[r].length;k++){
          const p=poaRow(ls[r][k],segTiltAt(T,r,k),T.axisAz,g.zen,g.az,irr,doy,c.albedo,T.iam);
          const fo=Math.max(0,Math.min(1,(sh.seg&&sh.seg[r]&&sh.seg[r][k]!=null)?sh.seg[r][k]:(sh[r]||0)));
          const se=(sh.segElec&&sh.segElec[r]&&sh.segElec[r][k]!=null)?sh.segElec[r][k]:elecLoss(fo,T.nBypass);
          const v=p.beam*(1-se)+p.circ*(1-fo)+p.sky+p.gnd;
          const w=mods[r][k]; acc+=v*w; wt+=w;
        }
        sumF+=wt>0?acc/wt:0;
      }
      const B=sumF/nR;
      sa+=A*(pasoMin/60); sb+=B*(pasoMin/60); n++;
      // F.3: dispersión entre mesas del MISMO motor
      const pseg=poaPlantSeg(g.zen,g.az,T,ls,irr,doy,c.albedo).segs;
      const porMotor={};
      for(let r=0;r<nR;r++)for(let k=0;k<ls[r].length;k++){
        const d=(T.segDrive&&T.segDrive[r]&&T.segDrive[r][k]!=null)?('d'+T.segDrive[r][k]):('r'+r);
        (porMotor[d]=porMotor[d]||[]).push(pseg[r][k]);
      }
      for(const d in porMotor){ const v=porMotor[d]; if(v.length<2)continue;
        const mx=Math.max(...v), mn=Math.min(...v), md=v.reduce((a,b)=>a+b,0)/v.length;
        if(md>1)disp.push((mx-mn)/md); }
    }
    disp.sort((a,b)=>a-b);
    const q=f=>disp.length?disp[Math.min(disp.length-1,Math.floor(f*disp.length))]:null;
    out.pol[P.key]={a:sa, b:sb, n, motores:disp.length, p05:q(0.05), p50:q(0.5), p95:q(0.95), pmax:disp.length?disp[disp.length-1]:null};
  }
  return out;
}`;

try {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  pg.setDefaultTimeout(0);
  await pg.goto(`http://localhost:${PORT}/backtracking.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => typeof PLANT_REAL !== 'undefined' && PLANT_REAL !== null, null, { timeout: 180000 });
  await pg.waitForTimeout(1500);
  const on = await pg.evaluate(() => { document.querySelectorAll('#polbox input[data-k]').forEach(i => { if (!i.checked) { i.checked = true; i.onchange(); } });
                                       return POLICIES.filter(P => P.on).map(P => P.key); });
  const c0 = await pg.evaluate(() => { const c = cfg(), T = terrain(c);
    return { lat: c.lat, lon: c.lon, alt: c.alt, tz: c.tz, tl: c.tl, albedo: c.albedo, nb: c.nbp, b0: c.iam,
             cw: c.cw, z0: c.z0, maxang: c.maxang, axaz: c.axaz, drive: c.drive, nR: T.pairs.length + 1, mv: mvPara(T, 45), ver: VER }; });
  console.log('═'.repeat(92));
  console.log(`E-F2/E-F3 · Ayora real · commit ${sha} · node ${process.version} · VER ${c0.ver}`);
  console.log(`sitio lat ${c0.lat} lon ${c0.lon} alt ${c0.alt} m tz ${c0.tz} · TL ${c0.tl} · albedo ${c0.albedo} · nb ${c0.nb} · b0 ${c0.b0}`);
  console.log(`planta ${c0.nR} líneas de simulación · cuerda ${c0.cw} · z0 ${c0.z0} · ±${c0.maxang}° · axisAz ${c0.axaz} · drive ${c0.drive} · MV ${c0.mv}`);
  console.log(`DÍA: 21-jun-2026, paso ${PASO} min · ${on.length} políticas: ${on.join(', ')}`);
  console.log(`sombra: la PUBLICADA (shadeRows, con estructura) en las dos variantes`);
  console.log('═'.repeat(92));
  const t0 = Date.now();
  const r = await pg.evaluate(`(${DIA})(${PASO})`);
  console.log(`(${((Date.now()-t0)/1000).toFixed(0)} s)`);
  console.log(`\nmesas con nº de MÓDULOS declarado en el levantamiento: ${r.mods_declarados} de ${r.mesas}`);
  if (!r.mods_declarados) console.log(`TEST NULO: ninguna mesa declara módulos ⇒ el peso por módulos degenera al peso por largo y (b) NO mide lo que pide el encargo.`);
  console.log(`\n── F.2 · energía del día 21-jun (Wh/m² de planta) ──`);
  console.log(`  política    (a) poaPlant, tilt por FILA   (b) tilt por MESA + peso por MÓDULOS   Δ (b−a)      Δ relativo`);
  const filas = [];
  for (const k of on) { const p = r.pol[k];
    console.log(`  ${k.padEnd(10)} ${p.a.toFixed(4).padStart(27)}   ${p.b.toFixed(4).padStart(38)}   ${(p.b-p.a).toFixed(4).padStart(9)}   ${(100*(p.b/p.a-1)).toFixed(4).padStart(9)} %`);
    filas.push(['F.2', k, p.a.toFixed(6), p.b.toFixed(6), (p.b-p.a).toFixed(6), (100*(p.b/p.a-1)).toFixed(6)].join(',')); }
  console.log(`\n── F.3 · dispersión de POA entre mesas del MISMO motor, (máx−mín)/media a lo largo del día ──`);
  console.log(`  política    motores-instante   p05        p50        p95        máx`);
  for (const k of on) { const p = r.pol[k];
    console.log(`  ${k.padEnd(10)} ${String(p.motores).padStart(16)}   ${p.p05==null?'—':(100*p.p05).toFixed(4)+' %'}   ${p.p50==null?'—':(100*p.p50).toFixed(4)+' %'}   ${p.p95==null?'—':(100*p.p95).toFixed(4)+' %'}   ${p.pmax==null?'—':(100*p.pmax).toFixed(4)+' %'}`);
    filas.push(['F.3', k, p.motores, p.p05, p.p50, p.p95, p.pmax].join(',')); }
  fs.writeFileSync(path.join(ROOT, 'audit2', 'out', 'F23.csv'), 'bloque,politica,col1,col2,col3,col4\n' + filas.join('\n') + '\n');
  console.log(`\nCSV: audit2/out/F23.csv`);
  await browser.close();
} finally { try { srv.kill(); } catch { } }
