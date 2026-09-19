/* R3 · FASE 2 — EL ANUAL CON Y SIN LAZO, SOBRE LA MISMA CORRIDA
 *
 * La ruta anual que publica la página no pasa por el lazo de control: llama a
 * `policyAngles` y suma, sin banda muerta y sin velocidad de actuador.
 *
 *     for(let m=0;m<1440;m+=10){ … const a=policyAngles(P.key,…).angles;
 *       tot[P.key]+=poaPlant(…,a,…).plant*(10/60)/1000*DIM[mo]; }
 *
 * Este guion calcula las DOS cifras en la misma pasada: la de hoy y la que
 * saldría con el lazo entero —UN LAZO POR CADENA, creado por política y por día,
 * que es la doctrina que el cuerpo del día ya sigue—. Así el antes y el después
 * no dependen de dos ejecuciones distintas.
 *
 * SIN TOCAR EL MOTOR: usa `crearLazo()` de la propia página, no una copia.
 *
 * Imprime por política y por mes conforme avanza, y escribe un diario a disco en
 * cuanto cada mes cierra: E-D8 estuvo 13 h sin decir por dónde iba y se perdió
 * entera. El diario va FUERA del repositorio.
 *
 *     node audit3/F2_anual_lazo.mjs            (progreso por stderr)
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { EXE } = await import(path.join(ROOT, 'tools', 'pw_navegador.mjs'));
const PORT = 8860 + (process.pid % 50);
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const DIARIO = process.env.F2_DIARIO || '/tmp/claude-0/f2/meses.jsonl';
fs.mkdirSync(path.dirname(DIARIO), { recursive: true });
const hechos = new Map();
if (fs.existsSync(DIARIO)) for (const l of fs.readFileSync(DIARIO, 'utf8').split('\n')) {
  if (!l.trim()) continue;
  try { const o = JSON.parse(l); hechos.set(o.mes, o); } catch (e) { /* línea truncada */ }
}
if (hechos.size) console.error(`reanudando: ${hechos.size} meses ya en ${DIARIO}`);

const { chromium } = await import('playwright');
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => console.error('PAGEERROR ' + e.message));
  await pg.goto(`http://localhost:${PORT}/backtracking.html?limpio`, { waitUntil: 'load' });
  await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol, null, { timeout: 120000 });
  await pg.waitForFunction(() => { const x = document.getElementById('calcbusy');
    return !x || getComputedStyle(x).display === 'none'; }, null, { timeout: 300000 });

  const cab = await pg.evaluate(() => {
    const c = cfg(), T = terrain(c);
    return { preset: 'genérico de arranque', lat: c.lat, lon: c.lon, filas: T.pairs.length + 1,
             /* el gcr sale de T, no de una división improvisada: la primera versión
                dividía por `T.pitch`, que no existe, y publicaba `gcr: null` tan
                tranquila. Un campo que no resuelve no se imprime: se declara. */
             gcr: (typeof T.gcr === 'number') ? +T.gcr.toFixed(4) : 'NO DISPONIBLE',
             drive: c.drive, paso_min: 10,
             porMesa: !!(T.segTilt && T.segs),
             politicas: POLICIES.map(P => P.key),
             deadband: DEADBAND_DEG, slew: TRACKER_SLEW };
  });
  console.error('config: ' + JSON.stringify(cab));
  if (cab.porMesa) console.error('AVISO · esta geometría es POR MESA y el anual va por línea: declararlo');

  const DIAS = ['01-21','02-21','03-21','04-21','05-21','06-21','07-21','08-21','09-21','10-21','11-21','12-21'];
  const t0 = Date.now();
  for (let mo = 0; mo < 12; mo++) {
    if (hechos.has(mo)) { console.error(`  mes ${mo + 1}: ya estaba`); continue; }
    const r = await pg.evaluate((mo) => {
      const DIAS = ['01-21','02-21','03-21','04-21','05-21','06-21','07-21','08-21','09-21','10-21','11-21','12-21'];
      const DIM = [31,28,31,30,31,30,31,31,30,31,30,31];
      const c = cfg(), T = terrain(c), Tcfg = terrainTCU(c, T);
      const ds = c.date.slice(0, 4) + '-' + DIAS[mo], doy = doyOf(ds);
      const sin = {}, con = {};
      for (const P of POLICIES) { sin[P.key] = 0; con[P.key] = 0; }
      /* UN LAZO POR CADENA: uno por política y por día, como en el cuerpo del día.
         Se crea aquí fuera del bucle de instantes porque su estado ES la cadena. */
      const LZ = {}; for (const P of POLICIES) LZ[P.key] = crearLazo();
      for (let m = 0; m < 1440; m += 10) {
        const g = solarPos(localToUTCms(ds, m, c.tz), c.lat, c.lon);
        if (g.elev <= 0) continue;
        const irr = clearskyIneichen(g.zen, doy, c.alt, c.tl);
        for (const P of POLICIES) {
          const a = policyAngles(P.key, g.zen, g.az, Tcfg, irr, doy, c.albedo).angles;
          const w = (10 / 60) / 1000 * DIM[mo];
          sin[P.key] += poaPlant(g.zen, g.az, T, a, irr, doy, c.albedo).plant * w;
          const lim = LZ[P.key].paso(a, 10 * 60);          // el paso REAL del bucle: 10 min
          con[P.key] += poaPlant(g.zen, g.az, T, lim, irr, doy, c.albedo).plant * w;
        }
      }
      return { mes: mo, fecha: ds, sin: sin, con: con };
    }, mo);
    fs.appendFileSync(DIARIO, JSON.stringify(r) + '\n');
    hechos.set(mo, r);
    const s = (Date.now() - t0) / 1000, n = hechos.size;
    console.error(`  mes ${mo + 1}/12 · ${s.toFixed(0)} s · restante ~${(s / n * (12 - n)).toFixed(0)} s`);
  }

  const sin = {}, con = {};
  for (const k of cab.politicas) { sin[k] = 0; con[k] = 0; }
  for (const r of hechos.values()) for (const k of cab.politicas) { sin[k] += r.sin[k] || 0; con[k] += r.con[k] || 0; }
  const tabla = cab.politicas.map(k => ({ politica: k,
    sinLazo_kWh_m2: +sin[k].toFixed(2), conLazo_kWh_m2: +con[k].toFixed(2),
    deriva_pct: +(100 * (con[k] / sin[k] - 1)).toFixed(4) }));
  const ord = o => cab.politicas.slice().sort((a, b) => o[b] - o[a]);
  /* EL ORDEN, CON SU TEST NULO. Ordenar empates y anunciar «el orden cambia» es
     publicar ruido: en un preset llano varias políticas dan el MISMO número y el
     `sort` las baraja. Así que primero se buscan los empates —al 0,01 % del
     valor, que es resolución de sobra para una cifra anual— y sólo se dice que
     el orden cambia si lo hace entre políticas que NO están empatadas. */
  const empates = (o) => { const g = {};
    for (const k of cab.politicas) { const key = (o[k] / 1e4).toFixed(4); (g[key] = g[key] || []).push(k); }
    return Object.values(g).filter(v => v.length > 1); };
  const rango = (o) => { const r = {}; let i = 0;
    for (const k of ord(o)) { const prev = ord(o)[i - 1];
      r[k] = (i > 0 && Math.abs(o[k] - o[prev]) / o[k] < 1e-4) ? r[prev] : i; i++; }
    return r; };
  const rs = rango(sin), rc = rango(con);
  const cambian = cab.politicas.filter(k => rs[k] !== rc[k]);
  console.log(JSON.stringify({ commit: sha, config: cab, tabla: tabla,
    ordenSinLazo: ord(sin), ordenConLazo: ord(con),
    empatesSinLazo: empates(sin), empatesConLazo: empates(con),
    politicasQueCambianDePUESTO_sinContarEmpates: cambian,
    elOrdenCambia: cambian.length > 0 }, null, 1));
} finally { await b.close(); srv.kill(); }
