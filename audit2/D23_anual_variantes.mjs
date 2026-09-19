#!/usr/bin/env node
/* D.2 / D.3 — anual de Ayora real variando MV y nb.
   El bucle es el MISMO cuerpo del manejador `$('yearbtn').onclick`
   (backtracking.html:6901-6924), ejecutado dentro de la página con sus propias
   funciones (`cfg`, `terrain`, `terrainTCU`, `policyAngles`, `poaPlant`). Lo
   único que se añade son los dos mandos que el manejador no tiene:
     MV  ← `T.mv` (gana a todo en mvPara, backtracking.html:842-845)
     nb  ← `T.nBypass` (y el mismo valor en Tcfg)
   DISEÑO REDUCIDO, declarado (ver CRÍTICA DEL ENCARGO): el anual publicado son 12
   días a paso 10 min; medido, con las 9 políticas cuesta ~30 min de CPU POR DÍA
   sobre Ayora real (los dos optimizadores se llevan el grueso,
   backtracking.html:4344-4346), o sea ~6 h por variante y ~54 h por las nueve
   variantes de D.2+D.3. Esta corrida usa `dias` días representativos y `pasoMin`
   minutos, y se declara el sesgo comparando la variante de referencia con el
   anual publicado de E-A3.
   Ejecutable:  node audit2/D23_anual_variantes.mjs [pasoMin=10] [--probe]
                                                    [--dias=3,5,8,11] [--solo=D.2|D.3]
                                                    [--etiqueta=xx]
   Salida: audit2/out/D23<etiqueta>.csv  +  resumen por stdout                   */
import path from 'node:path'; import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PASO = +(process.argv[2] || 10), PROBE = process.argv.includes('--probe');
const arg = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : null; };
const DIAS = (arg('dias') || '0,1,2,3,4,5,6,7,8,9,10,11').split(',').map(Number);
const SOLO = arg('solo'), ETQ = arg('etiqueta') || '';
const PORT = 8600 + (process.pid % 300);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });

const ANUAL = `(mvF, nbF, pasoMin, soloUnDia, MESES) => {
  // ── cuerpo de $('yearbtn').onclick, backtracking.html:6902-6923 ──
  const c=cfg(), T=terrain(c), Tcfg=terrainTCU(c,T);
  if(mvF){T.mv=mvF;Tcfg.mv=mvF;}
  if(nbF!=null){T.nBypass=nbF;Tcfg.nBypass=nbF;}
  const days=['01-21','02-21','03-21','04-21','05-21','06-21','07-21','08-21','09-21','10-21','11-21','12-21'];
  const DIM=[31,28,31,30,31,30,31,31,30,31,30,31];
  const year=c.date.slice(0,4);
  const tot={}; for(const P of POLICIES){if(P.on)tot[P.key]=0;}
  const LISTA=soloUnDia?[5]:MESES;
  const PESO={}; { const suma=LISTA.reduce((a,m)=>a+DIM[m],0); for(const m of LISTA)PESO[m]=DIM[m]*365/suma; }
  for(const mo of LISTA){
    const ds=year+'-'+days[mo], doy=doyOf(ds);
    for(let m=0;m<1440;m+=pasoMin){
      const g=solarPos(localToUTCms(ds,m,c.tz),c.lat,c.lon);
      if(g.elev<=0)continue;
      const irr=clearskyIneichen(g.zen,doy,c.alt,c.tl);
      for(const P of POLICIES){
        if(!P.on)continue;
        const a=policyAngles(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
        tot[P.key]+=poaPlant(g.zen,g.az,T,a,irr,doy,c.albedo).plant*(pasoMin/60)/1000*PESO[mo];
      }
    }
  }
  return {tot, nR:T.pairs.length+1, mv:(T.mv||mvPara(T,45)), nb:T.nBypass};
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
    return { lat: c.lat, lon: c.lon, alt: c.alt, tz: c.tz, tl: c.tl, albedo: c.albedo, date: c.date, cw: c.cw, z0: c.z0,
             nb: c.nbp, b0: c.iam, maxang: c.maxang, axaz: c.axaz, drive: c.drive, mods: c.mods,
             nR: T.pairs.length + 1, real: !!T.real, mv: mvPara(T, 45), ver: VER }; });
  console.log('═'.repeat(88));
  console.log(`E-D2/E-D3 · anual de Ayora real variando MV y nb · commit ${sha} · node ${process.version} · VER ${c0.ver}`);
  console.log(`sitio lat ${c0.lat} lon ${c0.lon} alt ${c0.alt} m tz ${c0.tz} · TL ${c0.tl} · albedo ${c0.albedo} · año ${c0.date.slice(0,4)}`);
  console.log(`planta ${c0.nR} líneas de simulación · cuerda ${c0.cw} · z0 ${c0.z0} · ±${c0.maxang}° · axisAz ${c0.axaz} · drive ${c0.drive} · T.real ${c0.real}`);
  console.log(`MV sin forzar = ${c0.mv} (if(T.real)return 8, backtracking.html:845) · nb de cfg = ${c0.nb} · b0 ${c0.b0}`);
  console.log(`DISEÑO REDUCIDO DECLARADO: paso ${PASO} min (el manejador publicado usa 10) · días 21 de los meses [${DIAS.map(d=>d+1).join(', ')}] de 12`);
  console.log(`   los pesos se renormalizan a 365 días: peso(mes) = DIM[mes]·365/suma(DIM de los meses usados)`);
  console.log(`   ${SOLO ? 'sólo el bloque ' + SOLO : 'bloques D.2 y D.3'} · SIN lazo de control`);
  console.log(`políticas: ${on.join(', ')}  (${on.length})`);
  console.log('═'.repeat(88));

  if (PROBE) {
    const t = Date.now();
    const r = await pg.evaluate(`(${ANUAL})(null,null,${PASO},true,${JSON.stringify(DIAS)})`);
    console.log(`SONDA · un solo día (21-jun), ${on.length} políticas, paso ${PASO} min: ${((Date.now()-t)/1000).toFixed(1)} s`);
    console.log(`  ⇒ anual completo (12 días) estimado: ${(12*(Date.now()-t)/1000/60).toFixed(1)} min por variante`);
    console.log(JSON.stringify(r.tot));
    await browser.close(); srv.kill(); process.exit(0);
  }

  let VAR = [];
  for (const mv of [8, 16, 32, 64]) VAR.push({ et: 'D.2', mv, nb: null });
  for (const nb of [0, 1, 2, 3, 6])  VAR.push({ et: 'D.3', mv: null, nb });
  if (SOLO) VAR = VAR.filter(v => v.et === SOLO);
  const VARS = arg('vars'); if (VARS) VAR = VARS.split(',').map(i => VAR[+i]).filter(Boolean);
  const filas = [], resultados = [];
  for (const v of VAR) {
    const t = Date.now();
    const r = await pg.evaluate(`(${ANUAL})(${v.mv},${v.nb},${PASO},false,${JSON.stringify(DIAS)})`);
    resultados.push({ ...v, tot: r.tot, mvEf: r.mv, nbEf: r.nb, seg: (Date.now() - t) / 1000 });
    console.log(`${v.et} · MV ${v.mv ?? 'sin forzar (' + r.mv + ')'} · nb ${v.nb ?? 'cfg (' + r.nb + ')'} — ${((Date.now()-t)/1000).toFixed(0)} s`);
    for (const k of on) { console.log(`     ${k.padEnd(9)} ${r.tot[k].toFixed(4)} kWh/m²·año`); filas.push([v.et, v.mv ?? '', v.nb ?? '', k, r.tot[k].toFixed(6)].join(',')); }
  }
  fs.writeFileSync(path.join(ROOT, 'audit2', 'out', 'D23' + ETQ + '.csv'), 'bloque,MV_forzado,nb_forzado,politica,kWh_m2_ano\n' + filas.join('\n') + '\n');

  console.log(`\n── D.2 · ganancia relativa sobre pairwise y sobre row, por MV ──`);
  for (const r of resultados.filter(q => q.et === 'D.2')) {
    console.log(`  MV ${r.mv}:`);
    for (const k of on) console.log(`     ${k.padEnd(9)} ${r.tot[k].toFixed(4)}   vs pairwise ${(100*(r.tot[k]/r.tot.pairwise-1)).toFixed(4)} %   vs row ${(100*(r.tot[k]/r.tot.row-1)).toFixed(4)} %`);
  }
  console.log(`\n── D.3 · ORDEN de las políticas por energía anual, una columna por nb ──`);
  const d3 = resultados.filter(q => q.et === 'D.3');
  const ord = d3.map(r => on.slice().sort((a, b) => r.tot[b] - r.tot[a]));
  console.log(`  puesto | ` + d3.map(r => `nb=${r.nb}`.padEnd(12)).join('| '));
  for (let i = 0; i < on.length; i++)
    console.log(`     ${i + 1}    | ` + ord.map(o => o[i].padEnd(12)).join('| ') + (new Set(ord.map(o => o[i])).size > 1 ? '   ← CAMBIA' : ''));
  console.log(`\n  energía (kWh/m²·año) por política y nb:`);
  console.log(`  política   | ` + d3.map(r => `nb=${r.nb}`.padStart(12)).join(' | '));
  for (const k of on) console.log(`  ${k.padEnd(10)} | ` + d3.map(r => r.tot[k].toFixed(4).padStart(12)).join(' | '));
  console.log(`\nCSV: audit2/out/D23${ETQ}.csv`);
  await browser.close();
} finally { try { srv.kill(); } catch { } }
