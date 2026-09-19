/* R3 · FASE 4.1 — EL INDICADOR «BT ON», ANTES Y DESPUÉS
 *
 * Mide sobre la MISMA corrida los dos predicados, para que el antes y el después
 * no dependan de dos ejecuciones distintas:
 *
 *   VIEJO   |ang[r] − astroAng[r]| > 0,5°     ← salidas de lazo (lo que había)
 *   NUEVO   |cmd[r] − astroCmd[r]| > 0,5°     ← mandos, antes del lazo
 *
 * Los cuatro apartados que imprime:
 *   1. el instante de la captura que abrió el hallazgo (21-jun, 14:00)
 *   2. el día entero: horas BT por política con cada predicado
 *   3. TEST NULO: ninguno de los dos predicados puede ser constante en el
 *      dominio medido, o el recuento no informa de nada
 *   4. CONTROL: astro contra su propia referencia tiene que dar 0 exacto con el
 *      predicado nuevo, y es justamente donde el viejo fallaba
 *
 *     node audit3/F41_indicador.mjs
 */
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8901 + (process.pid % 70);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.log('ERR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.evaluate(() => {
    const s = (id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('change')); };
    s('lat','42.32059'); s('lon','-5.59981'); s('tz','2'); s('alt','1563');
    s('albedo','0.20'); s('tl','3.5'); s('cloud','0');
    s('pitch','7.00'); s('cw','2.382'); s('maxang','55'); s('nrows','65');
    s('axaz','0'); s('z0','0.17');
    const d = document.getElementById('date'); d.value = '2026-06-21'; d.dispatchEvent(new Event('change'));
  });
  await pg.waitForFunction(() => DAY && DAY.pol && DAY.astroCmd, null, { timeout: 180000 });
  await pg.waitForFunction(() => { const b = document.getElementById('calcbusy'); return !b || b.style.display === 'none'; }, null, { timeout: 300000 });
  await pg.waitForTimeout(400);

  const r = await pg.evaluate(() => {
    const U = 0.5, nT = DAY.times.length;
    const viejo = (p,t) => { if(DAY.sun[t].elev<=0) return false;
      const a=p.ang[t], q=DAY.astroAng[t];
      for(let i=0;i<a.length;i++) if(Math.abs(a[i]-q[i])>U) return true; return false; };
    const nuevo = (p,t) => { if(DAY.sun[t].elev<=0) return false;
      const a=p.cmd[t], q=DAY.astroCmd[t];
      for(let i=0;i<a.length;i++) if(Math.abs(a[i]-q[i])>U) return true; return false; };
    const keys = Object.keys(DAY.pol);
    const t14 = Math.round(14*60/STEP_MIN), P = DAY.pol.pairwise || DAY.pol[keys[0]];
    const dif = (A,B) => { let m=0; for(let i=0;i<A.length;i++) m=Math.max(m,Math.abs(A[i]-B[i])); return m; };

    // 2 · el día entero, por política
    const dia = keys.map(k => { const p=DAY.pol[k]; let v=0,n=0;
      for(let t=0;t<nT;t++){ if(viejo(p,t))v++; if(nuevo(p,t))n++; }
      return {pol:k, hViejo:+(v*STEP_MIN/60).toFixed(2), hNuevo:+(n*STEP_MIN/60).toFixed(2)}; });

    // 3 · test nulo: los dos predicados tienen que variar en el dominio medido
    const diurnos = []; for(let t=0;t<nT;t++) if(DAY.sun[t].elev>0) diurnos.push(t);
    const val = f => { const s=new Set(); for(const k of keys) for(const t of diurnos) s.add(f(DAY.pol[k],t)); return [...s].sort().join('/'); };

    return {
      commit:'', paso_min:STEP_MIN, filas:DAY.astroCmd[0].length, instantes_diurnos:diurnos.length,
      politicas:keys.length,
      captura:{ hora:hhmm(DAY.times[t14]), elev:+DAY.sun[t14].elev.toFixed(2),
        difMandoMax:+dif(P.cmd[t14],DAY.astroCmd[t14]).toFixed(4),
        difPosicionMax:+dif(P.ang[t14],DAY.astroAng[t14]).toFixed(4),
        sombraMax:+Math.max(...P.shade[t14]).toFixed(6),
        indicadorViejo:viejo(P,t14), indicadorNuevo:nuevo(P,t14), indicadorPagina:btActiveAt(t14) },
      dia:dia,
      testNulo:{ valoresDelPredicadoViejo:val(viejo), valoresDelPredicadoNuevo:val(nuevo) },
      /* la política astro puede no estar encendida en la escena, así que su serie
         se calcula aquí con la MISMA maquinaria de la página */
      control:(()=>{ const dA={}; for(const _ of serieDiaGen('astro',DAY.D,dA)); const A=dA.s;
        let mM=0,mP=0,nV=0,nN=0;
        for(let t=0;t<nT;t++){ mM=Math.max(mM,dif(A.cmd[t],DAY.astroCmd[t]));
          mP=Math.max(mP,dif(A.ang[t],DAY.astroAng[t]));
          if(viejo(A,t))nV++; if(nuevo(A,t))nN++; }
        return { astro_difMandoMax:+mM.toFixed(6), astro_difPosicionMax:+mP.toFixed(6),
                 astro_horasBT_viejo:+(nV*STEP_MIN/60).toFixed(2),
                 astro_horasBT_nuevo:+(nN*STEP_MIN/60).toFixed(2) }; })(),
    };
  });
  r.commit = sha;
  console.log(JSON.stringify(r, null, 1));
} finally { await browser.close(); srv.kill(); }
