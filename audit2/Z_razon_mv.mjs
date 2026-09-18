/* ¿CUÁNTO CUESTA DE VERDAD SUBIR EL MV? — medida de la razón, no extrapolación.
 *
 * POR QUÉ. La estimación del coste de E-D8 (anual con MV 32) salió de multiplicar
 * el coste medido a MV 8 por 1,86, y ese 1,86 se midió SÓLO sobre `poaPlant`.
 * Pero el bucle del anual llama a DOS cosas por instante y por política:
 * `policyAngles`, que es donde buscan los optimizadores, y `poaPlant`, que es el
 * contador. Si `policyAngles` también escala con MV —lo hace en la parte que usa
 * el ray-cast 3D: `repairNoShade`— la razón verdadera es mayor y la estimación se
 * queda corta. Que es lo que ha pasado.
 *
 * QUÉ MIDE. El coste del PAR COMPLETO (`policyAngles` + `poaPlant`) sobre los
 * mismos instantes, a MV 8 y a MV 32, con la planta real de Ayora cargada — la
 * misma que usa E-D8. Y por separado, para saber dónde está el coste.
 *
 * NO TOCA la corrida en curso: abre su propio navegador, en uno de los cuatro
 * núcleos, y no escribe en ningún artefacto publicado.
 *
 *     node audit2/Z_razon_mv.mjs [nInstantes]
 */
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8900 + (process.pid % 90);
const N = +(process.argv[2] || 6);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
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
  console.log('═'.repeat(80));
  console.log(`RAZÓN DE COSTE POR MV · commit ${sha} · ${N} instantes · políticas ${on.length}`);
  console.log('═'.repeat(80));

  const MIDE = `(mvF, N) => {
    const c=cfg(), T=terrain(c), Tcfg=terrainTCU(c,T);
    T.mv=mvF; Tcfg.mv=mvF;
    const doy=doyOf(c.date);
    // instantes repartidos por el día con sol, los mismos para las dos medidas
    const gs=[];
    for(let m=360;m<1200&&gs.length<N;m+=Math.floor(840/N)){
      const g=solarPos(localToUTCms(c.date,m,c.tz),c.lat,c.lon);
      if(g.elev>0)gs.push(g);
    }
    let tAng=0, tPoa=0, nA=0, nP=0;
    for(const g of gs){
      const irr=clearskyIneichen(g.zen,doy,c.alt,c.tl);
      for(const P of POLICIES){
        if(!P.on)continue;
        const a0=performance.now();
        const a=policyAngles(P.key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
        const a1=performance.now();
        poaPlant(g.zen,g.az,T,a,irr,doy,c.albedo);
        const a2=performance.now();
        tAng+=a1-a0; nA++; tPoa+=a2-a1; nP++;
      }
    }
    return {mv:mvF, instantes:gs.length, tAng, tPoa, nA, nP, total:tAng+tPoa};
  }`;

  const r8  = await pg.evaluate(`(${MIDE})(8, ${N})`);
  const r32 = await pg.evaluate(`(${MIDE})(32, ${N})`);
  const f = (v) => v.toFixed(3);
  for (const r of [r8, r32]) {
    console.log(`MV ${String(r.mv).padStart(2)} · ${r.instantes} instantes × ${on.length} políticas = ${r.nA} pares`);
    console.log(`     policyAngles ${f(r.tAng / r.nA)} ms/llamada · total ${f(r.tAng / 1000)} s`);
    console.log(`     poaPlant     ${f(r.tPoa / r.nP)} ms/llamada · total ${f(r.tPoa / 1000)} s`);
    console.log(`     PAR COMPLETO ${f(r.total / r.nA)} ms · total ${f(r.total / 1000)} s`);
  }
  const rAng = r32.tAng / r8.tAng, rPoa = r32.tPoa / r8.tPoa, rTot = r32.total / r8.total;
  console.log('─'.repeat(80));
  console.log(`RAZÓN MV 32 / MV 8 — policyAngles ${f(rAng)}× · poaPlant ${f(rPoa)}× · PAR COMPLETO ${f(rTot)}×`);
  const base = 14871;   // s, medido: D.2 · MV 8 · mismo diseño (audit2/out/D2_MV8.txt)
  console.log(`\nAplicado al coste MEDIDO del mismo diseño a MV 8 (${base} s = ${(base/3600).toFixed(2)} h):`);
  console.log(`   con la razón del par completo ${f(rTot)}×  ⇒  ${(base*rTot/3600).toFixed(2)} h`);
  console.log(`   con la razón de poaPlant sola ${f(rPoa)}×  ⇒  ${(base*rPoa/3600).toFixed(2)} h   ← la que se usó y se quedó corta`);
} finally {
  await browser.close();
  srv.kill();
}
