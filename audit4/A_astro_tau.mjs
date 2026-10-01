/* R4 · ENCARGO A — LA DIVERGENCIA JS↔PYTHON DEL ASTRONÓMICO, CONTRA τ.
 *
 *   node audit4/A_astro_tau.mjs > audit4/out/A_astro_js.json
 *
 * Lado JS. Vuelca el ángulo del seguimiento astronómico pleno para un barrido
 * DENSO de inclinación N-S del eje (τ), con los mismos instantes que el lado
 * Python. Sin backtracking: A pregunta por el ASTRONÓMICO, no por el BT.
 *
 * Vuelca DOS columnas por τ, y esa es toda la gracia de la sonda:
 *   `js_mas`   singleaxis con axisTilt = +τ   (lo que el JS NO hace)
 *   `js_menos` singleaxis con axisTilt = −τ   (lo que el JS SÍ hace, vía
 *              `pvTilt`, `backtracking.html:606`)
 * Con las dos y la de pvlib se separa lo que es diferencia de FÓRMULA de lo
 * que es diferencia de CONVENIO DE SIGNO — que razonando no se separa.
 *
 * NO arregla nada. Cuál de los dos signos es el correcto es decisión del
 * titular, y necesita A.2 delante.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA');
const src = html.slice(html.lastIndexOf('/*', i0), i1);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n'
          + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + src + '\nreturn { singleaxis, pvTilt, anglesAstro, solarPos, nan0 };')();

/* el barrido de τ: DENSO y con los dos signos, porque un ajuste con quince
   puntos incidentales no es un ajuste */
/* EL BARRIDO LLEGA A ±40°, Y NO PORQUE HAYA PLANTAS ASÍ. Entre 0 y 8°
   —el rango físico— `τ`, `sin τ` y `tan τ` son indistinguibles a efectos de
   ajuste (difieren menos del 1 %), así que un barrido físico NO puede
   contestar a A.1: cualquiera de los tres «ajusta». Se extiende el barrido
   hasta donde las tres familias sí se separan, que es identificación de
   modelo, no una afirmación sobre el terreno. El tramo físico va marcado en
   la salida. */
const TAU = [];
for (let t = -8; t <= 8.0001; t += 0.25) TAU.push(+t.toFixed(4));
for (let t = 9; t <= 40.0001; t += 1) { TAU.push(+t.toFixed(4)); TAU.push(+(-t).toFixed(4)); }
TAU.sort((a, b) => a - b);

/* los instantes: el mismo criterio que los vectores sellados —por ELEVACIÓN,
   no por hora— más una malla del día para que el ajuste no dependa de cuatro
   puntos. Zaragoza. */
const LAT = 41.5763, LON = -0.7981;
const INST = [];
for (const [nm, dia, doy] of [['21-jun', Date.UTC(2026, 5, 21), 172], ['21-dic', Date.UTC(2026, 11, 21), 355]]) {
  for (let m = 0; m < 1440; m += 30) {
    const g = F.solarPos(dia + m * 60000 - 3600000, LAT, LON);
    if (!(g.elev > 3)) continue;                    // por debajo de 3° el θ deja de ser informativo
    INST.push({ dia: nm, doy, min: m, zen: g.zen, az: g.az, elev: g.elev });
  }
}

const GEO = { axisAz: 0, maxAngle: 55, gcr: 0.397, slope: 0 };
const fila = [];
for (const tau of TAU) {
  const mas = [], menos = [];
  for (const i of INST) {
    mas.push(F.nan0(F.singleaxis(i.zen, i.az, { axisTilt: tau, axisAz: GEO.axisAz, maxAngle: GEO.maxAngle, backtrack: false, gcr: GEO.gcr, crossAxisTilt: GEO.slope })));
    menos.push(F.nan0(F.singleaxis(i.zen, i.az, { axisTilt: F.pvTilt(tau), axisAz: GEO.axisAz, maxAngle: GEO.maxAngle, backtrack: false, gcr: GEO.gcr, crossAxisTilt: GEO.slope })));
  }
  fila.push({ tau, js_mas: mas.map(x => +x.toFixed(9)), js_menos: menos.map(x => +x.toFixed(9)) });
}

console.log(JSON.stringify({
  que: 'seguimiento astronómico pleno (singleaxis, backtrack=false) del lado JS',
  pvTilt: 'backtracking.html:606 — const pvTilt=t=>-(t||0)',
  geometria: GEO, sitio: { lat: LAT, lon: LON },
  instantes: INST.map(i => ({ dia: i.dia, doy: i.doy, min: i.min, zen: +i.zen.toFixed(9), az: +i.az.toFixed(9), elev: +i.elev.toFixed(6) })),
  tau: TAU, filas: fila,
}));
