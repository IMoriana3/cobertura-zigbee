#!/usr/bin/env node
/* PASO 4.4 (p2) · PARIDAD JS ↔ tracker3d.py, SIN TORSIÓN — job propio, fuera de la
   puerta, con trinquete.

     SOLARGPT_ROOT=<raíz de SolarGPTfull> node tools/test_paridad_py.mjs

   Qué compara: el θ por fila que publica cada política de la página
   (`policyAngles`, la física pura de backtracking.html) frente a la función de
   `tracker3d.py` que el JS declara espejar (mapa de audit2 E-G1), con EL MISMO
   sol y LA MISMA irradiancia: el JS los calcula y el Python los recibe.

   Rejilla declarada:
     · 5 terrenos SIN torsión, 6 filas, pitch 6 m, cuerda 2,382, z0 0,17, ±55°,
       eje N-S, sin grupos de accionamiento (el Python no los tiene, E-G3):
       llano · pendiente uniforme +6° · −6° · ondulado · escalonado fuerte;
     · 21-jun y 21-dic en el sitio canónico de G1 (41,57634 N, −0,79814), cada
       hora en punto con sol > 3°;
     · 7 políticas comparables; bt2d y optfree NO EXISTEN en tracker3d.py.
   Una celda es (terreno, política, instante); está EN PARIDAD si el máx |Δθ| de
   sus filas es ≤ 0,01°.

   Por qué SIN torsión: con tilt N-S ≠ 0 los dos lados no reciben el mismo terreno
   (hallazgo 4.0 de audit5/REFUNDACION_P4.md, nota N-R2-1). Vuelve cuando entre
   (p1). El lado Python RECHAZA un caso con torsión, no lo compara en silencio.

   TRINQUETE: el número de celdas en paridad no puede bajar de `tools/
   paridad_py_piso.json`; si sube, el banco pide subir el piso (R-3).
   CONTROL NEGATIVO: con la pendiente invertida en el lado Python la paridad de
   los terrenos con pendiente TIENE que caer; si no cae, el banco no distingue.
   SIN SolarGPTfull (sin el secreto en CI): «NO COMPROBADO» con su motivo y
   salida 0 — no es verde ni rojo, y el job lo dice.

   Este banco NO decide quién manda: publica dónde discrepan. La decisión es del
   titular (paso 4.5).                                                            */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAIZ = process.env.SOLARGPT_ROOT || '';
if (!RAIZ || !fs.existsSync(path.join(RAIZ, 'solargpt', 'solargpt_core', 'tracker3d.py'))) {
  console.log(`NO COMPROBADO: no hay checkout de SolarGPTfull (SOLARGPT_ROOT=${JSON.stringify(RAIZ)}).`);
  console.log('SolarGPTfull es PRIVADO: en CI hace falta el secreto SOLARGPT_TOKEN (lectura). Sin él la paridad no se comprueba, y se dice.');
  process.exit(0);
}
const bt = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const f0 = bt.indexOf('FÍSICA PURA'), f1 = bt.lastIndexOf('/* FIN-FÍSICA');
const F = new Function(sol + bt.slice(bt.lastIndexOf('/*', f0), f1) +
  'return {policyAngles, solarPos, clearskyIneichen, doyOf};')();
const VER = /const VER='([^']+)'/.exec(bt)[1];

const LAT = 41.57634, LON = -0.79814, ALT = 739, TL = 3.5, ALB = 0.2, PITCH = 6, CW = 2.382;
const TERRENOS = {
  'llano': [0, 0, 0, 0, 0],
  'pendiente +6°': [6, 6, 6, 6, 6],
  'pendiente −6°': [-6, -6, -6, -6, -6],
  'ondulado': [4, -2, 5, 0, -3],
  'escalonado fuerte': [8, -8, 6, -6, 3],
};
const POL = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
const TOL = 0.01;
const T0 = s => ({ pairs: s.map(v => ({ slope: v, pitch: PITCH, axisTilt: 0 })), cw: CW, axisAz: 0, maxAngle: 55,
  gcr: CW / PITCH, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: Array(s.length + 1).fill(0), groups: null, drive: 'mono' });
const J = { VER, casos: {} };
for (const [nombre, s] of Object.entries(TERRENOS)) {
  const T = T0(s), c = { ...T, instantes: [] };
  for (const [mes, dia] of [[5, 21], [11, 21]]) {
    const doy = F.doyOf(`2026-${String(mes + 1).padStart(2, '0')}-${dia}`);
    for (let h = 0; h < 24; h++) {
      const ms = Date.UTC(2026, mes, dia, h, 0), g = F.solarPos(ms, LAT, LON);
      if (!(g.elev > 3)) continue;
      const irr = F.clearskyIneichen(g.zen, doy, ALT, TL), ang = {};
      for (const k of POL) ang[k] = F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles.map(v => +v.toFixed(8));
      c.instantes.push({ utc: new Date(ms).toISOString(), zen: g.zen, az: g.az, elev: g.elev, ghi: irr.ghi, dni: irr.dni, dhi: irr.dhi, ang });
    }
  }
  J.casos[nombre] = c;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paridad-py-'));
const ent = path.join(tmp, 'js.json'); fs.writeFileSync(ent, JSON.stringify(J));
const py = (sal, extra = []) => {
  const r = spawnSync('python3', [path.join(ROOT, 'tools', 'paridad_py.py'), ent, sal, ...extra],
    { encoding: 'utf-8', env: { ...process.env, SOLARGPT_ROOT: RAIZ } });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status !== 0) { console.log(`FALLO: el lado Python salió con ${r.status}`); process.exit(1); }
  return JSON.parse(fs.readFileSync(sal, 'utf-8'));
};
const P = py(path.join(tmp, 'py.json')), Pc = py(path.join(tmp, 'py_control.json'), ['--control']);
const sha = spawnSync('git', ['-C', RAIZ, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout.trim();

const careo = (Py) => {
  const celdas = [];
  for (const [nombre, c] of Object.entries(J.casos))
    c.instantes.forEach((I, i) => {
      for (const k of POL) {
        const B = Py.casos[nombre][i].ang[k];
        if (!B) { celdas.push({ nombre, k, i, estado: 'ausente', motivo: Py.casos[nombre][i].error[k] }); continue; }
        const d = Math.max(...I.ang[k].map((v, r) => Math.abs(v - B[r])));
        celdas.push({ nombre, k, i, d, estado: d <= TOL ? 'paridad' : 'discrepa' });
      }
    });
  return celdas;
};
const C = careo(P), Cc = careo(Pc);
const n = (arr, f) => arr.filter(f).length;
console.log(`\nPARIDAD JS ↔ tracker3d.py SIN torsión · JS VER ${VER} · SolarGPTfull ${sha.slice(0, 10)} · ${P.tracker3d} · pvlib ${P.pvlib}`);
console.log(`rejilla: ${Object.keys(TERRENOS).length} terrenos × ${POL.length} políticas × instantes con sol > 3° (21-jun y 21-dic, cada hora) · tolerancia ${TOL}°`);
console.log(`\n${'política'.padEnd(10)} ${Object.keys(TERRENOS).map(t => t.padStart(18)).join('')}   (celdas en paridad / comparadas · máx |Δθ|)`);
for (const k of POL) {
  const fila = Object.keys(TERRENOS).map(t => {
    const cs = C.filter(x => x.k === k && x.nombre === t);
    if (cs.every(x => x.estado === 'ausente')) return 'NO EXISTE'.padStart(18);
    const ok = n(cs, x => x.estado === 'paridad'), mx = Math.max(...cs.map(x => x.d));
    return `${ok}/${cs.length} · ${mx.toFixed(3)}°`.padStart(18);
  });
  console.log(`${k.padEnd(10)} ${fila.join('')}`);
}
console.log(`\nceldas que discrepan (terreno · política · UTC · elevación · máx |Δθ|):`);
for (const x of C.filter(x => x.estado === 'discrepa')) {
  const I = J.casos[x.nombre].instantes[x.i];
  console.log(`  ${x.nombre.padEnd(18)} ${x.k.padEnd(9)} ${I.utc.slice(0, 16)}  sol ${I.elev.toFixed(1).padStart(5)}°  ${x.d.toFixed(3).padStart(7)}°`);
}
const enParidad = n(C, x => x.estado === 'paridad'), comparadas = n(C, x => x.estado !== 'ausente');
const conPendiente = x => x.nombre !== 'llano';
const okCtrl = n(Cc.filter(conPendiente), x => x.estado === 'paridad'), okReal = n(C.filter(conPendiente), x => x.estado === 'paridad');
console.log(`\nen paridad: ${enParidad} de ${comparadas} celdas comparables (${n(C, x => x.estado === 'ausente')} sin contraparte en Python)`);
console.log(`CONTROL (pendiente invertida en Python), terrenos con pendiente: ${okCtrl} en paridad frente a ${okReal} sin invertir`);
let fallos = 0;
if (!(okCtrl < okReal)) { console.log('FALLO: el control no rompe la paridad — el banco no distingue la pendiente'); fallos++; }
const pisoF = path.join(ROOT, 'tools', 'paridad_py_piso.json');
const piso = fs.existsSync(pisoF) ? JSON.parse(fs.readFileSync(pisoF, 'utf-8')) : null;
if (!piso) { console.log(`FALLO: falta ${path.relative(ROOT, pisoF)} (trinquete)`); fallos++; }
else if (comparadas !== piso.comparadas) { console.log(`FALLO: la rejilla cambió (${comparadas} comparables, el piso dice ${piso.comparadas}): se declara a propósito`); fallos++; }
else if (enParidad < piso.en_paridad) { console.log(`FALLO (trinquete): ${enParidad} en paridad < piso ${piso.en_paridad}`); fallos++; }
else if (enParidad > piso.en_paridad) console.log(`AVISO: ${enParidad} en paridad > piso ${piso.en_paridad} — sube el piso (R-3: el piso sube con el banco)`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLO(S)` : `\nTODO OK — ${enParidad}/${comparadas} celdas en paridad (piso ${piso.en_paridad}); control ${okCtrl} < ${okReal}`);
process.exit(fallos ? 1 : 0);
