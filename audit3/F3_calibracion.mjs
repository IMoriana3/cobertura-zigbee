#!/usr/bin/env node
/* R3 FASE 3.1 — LAS CINCO POLÍTICAS QUE FALTAN DE LA CALIBRACIÓN
 *
 * Copia de `audit2/D5_calibracion_plena.mjs`, que está SELLADO y no se toca.
 * Cambian tres cosas y se dicen las tres:
 *
 *   1. Escribe en `audit3/out/`, no en `audit2/out/`. Correr el original hoy
 *      reescribiría `audit2/out/D5.csv` y rompería el sello.
 *   2. Lleva DIARIO por política: al arrancar lee lo que ya esté hecho y se
 *      salta esas. El contenedor se ha reiniciado dos veces esta noche y esta
 *      corrida dura horas.
 *   3. El coste se MIDE por política y se imprime con lo que queda, en vez de
 *      extrapolarse. R2 registra tres fallos de estimación por extrapolar.
 *
 * AVISO QUE VA ANTES DE LA CIFRA. Este guion lleva CONGELADO el cuerpo del anual
 * SIN LAZO —es una copia literal del manejador tal como estaba cuando se midió
 * E-D2/E-D3—, no llama al de la página. Eso es deliberado: la calibración compara
 * el diseño PLENO con el REDUCIDO sobre la MISMA física, y las cuatro políticas
 * ya calibradas se midieron así. Pero desde la fase 2 la página publica su anual
 * CON lazo, así que lo que esta calibración corrige es el ORDEN DE E-D3, que es
 * un artefacto de R2, y NO la cifra que la página enseña hoy. Recalibrar las
 * nueve sobre la ruta nueva es otra corrida y no se ha hecho: `NO MEDIDO`.
 *
 * 1.1 — CALIBRACIÓN DE LAS POLÍTICAS QUE ENCABEZAN LA TABLA DE E-D3.
   Ejecuta el anual PLENO (12 días, paso 10 min: el diseño que publica el
   manejador de backtracking.html:6902-6923, sin reducir) sobre Ayora real con
   nb 2 y MV sin forzar, para las políticas que se indiquen.
   El offset frente al diseño reducido de E-D2 es la calibración que falta.

   `pairwise` va de CONTROL: su anual pleno ya está medido en E-A3 variante 1
   (2313,44643430). Si esta corrida no lo reproduce, el arnés no vale y se dice.

   Se imprime CADA política en cuanto termina, para que una corrida interrumpida
   siga sirviendo.

   Ejecutable:  node audit3/F3_calibracion.mjs [politicas] [pasoMin=10]
                por defecto, las CINCO que faltan: astro,global,row,bt2d,mgl
   Salida: stdout + audit3/out/F3_calibracion.csv
           diario reanudable en /tmp/claude-0/f3/calibracion.jsonl (F3_DIARIO)  */
import path from 'node:path'; import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POLS = (process.argv[2] || 'astro,global,row,bt2d,mgl').split(',');   // las CINCO que faltan
const DIARIO = process.env.F3_DIARIO || '/tmp/claude-0/f3/calibracion.jsonl';
const PASO = +(process.argv[3] || 10);
const PORT = 8100 + (process.pid % 200);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });

/* cuerpo del manejador $('yearbtn').onclick (backtracking.html:6902-6923),
   restringido a UNA política para poder publicar resultados parciales. */
const UNA = `(key, pasoMin) => {
  const c=cfg(), T=terrain(c), Tcfg=terrainTCU(c,T);
  const days=['01-21','02-21','03-21','04-21','05-21','06-21','07-21','08-21','09-21','10-21','11-21','12-21'];
  const DIM=[31,28,31,30,31,30,31,31,30,31,30,31];
  const year=c.date.slice(0,4);
  let tot=0, nInst=0;
  for(let mo=0;mo<12;mo++){
    const ds=year+'-'+days[mo], doy=doyOf(ds);
    for(let m=0;m<1440;m+=pasoMin){
      const g=solarPos(localToUTCms(ds,m,c.tz),c.lat,c.lon);
      if(g.elev<=0)continue;
      const irr=clearskyIneichen(g.zen,doy,c.alt,c.tl);
      const a=policyAngles(key,g.zen,g.az,Tcfg,irr,doy,c.albedo).angles;
      tot+=poaPlant(g.zen,g.az,T,a,irr,doy,c.albedo).plant*(pasoMin/60)/1000*DIM[mo];
      nInst++;
    }
  }
  return {tot, nInst, nR:T.pairs.length+1, mv:mvPara(T,45), nb:T.nBypass};
}`;

try {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  pg.setDefaultTimeout(0);
  await pg.goto(`http://localhost:${PORT}/backtracking.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => document.getElementById('ayorabtn').click());
  await pg.waitForFunction(() => typeof PLANT_REAL !== 'undefined' && PLANT_REAL !== null, null, { timeout: 180000 });
  await pg.waitForTimeout(1500);
  const c0 = await pg.evaluate(() => { const c = cfg(), T = terrain(c);
    return { lat: c.lat, lon: c.lon, alt: c.alt, tz: c.tz, tl: c.tl, albedo: c.albedo, nb: c.nbp, b0: c.iam,
             cw: c.cw, z0: c.z0, maxang: c.maxang, axaz: c.axaz, drive: c.drive,
             nR: T.pairs.length + 1, real: !!T.real, mv: mvPara(T, 45), ver: VER, date: c.date }; });
  console.log('═'.repeat(92));
  console.log(`E-D5 · ANUAL PLENO de Ayora real · calibración de los optimizadores · commit ${sha}`);
  console.log(`node ${process.version} · VER ${c0.ver}`);
  console.log(`sitio   lat ${c0.lat} · lon ${c0.lon} · alt ${c0.alt} m · tz ${c0.tz} · año ${c0.date.slice(0,4)}`);
  console.log(`cielo   Linke TL ${c0.tl} · albedo ${c0.albedo} · Ineichen`);
  console.log(`planta  ${c0.nR} líneas de simulación · cuerda ${c0.cw} · z0 ${c0.z0} · ±${c0.maxang}° · axisAz ${c0.axaz} · drive ${c0.drive} · T.real ${c0.real}`);
  console.log(`MV      ${c0.mv} (sin forzar: if(T.real)return 8, backtracking.html:845) · nb ${c0.nb} · b0 ${c0.b0}`);
  console.log(`DISEÑO  PLENO: 12 días 21 de cada mes · paso ${PASO} min · pesos DIM · SIN lazo de control`);
  console.log(`        (es el diseño del manejador publicado; E-D2/E-D3 usan el reducido de 4 días y 20 min)`);
  console.log(`políticas, en orden de ejecución: ${POLS.join(', ')}`);
  console.log(`control: pairwise debe reproducir 2313,44643430 kWh/m²·año de E-A3 variante 1`);
  console.log('═'.repeat(92));
  const filas = [];
  fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
  const yaHechas = new Map();
  if (fs.existsSync(DIARIO)) for (const l of fs.readFileSync(DIARIO, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { const o = JSON.parse(l); yaHechas.set(o.key, o); } catch (e) { /* línea truncada */ }
  }
  if (yaHechas.size) console.log(`reanudando: ya medidas ${[...yaHechas.keys()].join(', ')}`);
  const tArranque = Date.now();
  let hechas = 0;
  for (const key of POLS) {
    if (yaHechas.has(key)) { const y = yaHechas.get(key);
      console.log(`PLENO · ${key.padEnd(9)} ${(+y.tot).toFixed(8).padStart(18)} kWh/m²·año · (del diario)`);
      filas.push([key, (+y.tot).toFixed(8), y.nInst, y.mv, y.nb, y.seg].join(',')); hechas++; continue; }
    const t0 = Date.now();
    const r = await pg.evaluate(`(${UNA})(${JSON.stringify(key)}, ${PASO})`);
    const seg = (Date.now() - t0) / 1000;
    fs.appendFileSync(DIARIO, JSON.stringify({ key, tot: r.tot, nInst: r.nInst, mv: r.mv, nb: r.nb, seg: seg.toFixed(1) }) + '\n');
    hechas++;
    const transc = (Date.now() - tArranque) / 1000, quedan = POLS.length - hechas;
    console.log(`PLENO · ${key.padEnd(9)} ${r.tot.toFixed(8).padStart(18)} kWh/m²·año · ${r.nInst} instantes · MV ${r.mv} · nb ${r.nb} · ${seg.toFixed(0)} s` +
                (quedan ? `  ·  quedan ${quedan}, ~${(transc / hechas * quedan / 60).toFixed(0)} min MEDIDOS sobre ${hechas}` : '  ·  última'));
    filas.push([key, r.tot.toFixed(8), r.nInst, r.mv, r.nb, seg.toFixed(1)].join(','));
    fs.writeFileSync(path.join(ROOT, 'audit3', 'out', 'F3_calibracion.csv'), 'politica,kWh_m2_ano_PLENO,n_instantes,MV,nb,segundos\n' + filas.join('\n') + '\n');
  }
  console.log(`\nCSV: audit3/out/F3_calibracion.csv`);
  await browser.close();
} finally { try { srv.kill(); } catch { } }
