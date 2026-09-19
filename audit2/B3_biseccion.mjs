/* B.3 — bisección: en qué commit cambia el caso B (instante y parámetros canónicos).
   Recorre TODOS los commits que tocan backtracking.html en el rango y publica el θ de
   pairwise; los cambios se marcan. Ejecutable: node audit2/B3_biseccion.mjs [desde] [hasta] */
import { execFileSync } from 'node:child_process';
import { motorDe, caso, CANON, ROOT } from './lib_motor.mjs';
const desde = process.argv[2] || 'c098990', hasta = process.argv[3] || '1227252';
const shas = execFileSync('git', ['rev-list', '--reverse', `${desde}^..${hasta}`, '--', 'backtracking.html'],
  { cwd: ROOT, maxBuffer: 1 << 26 }).toString().trim().split('\n').filter(Boolean);
console.log(`bisección sobre ${shas.length} commits que tocan backtracking.html (${desde}^..${hasta})`);
console.log('node ' + process.version + ' · instante ' + new Date(CANON.instanteUTC).toISOString());
console.log('');
let prev = null;
for (const sha of shas) {
  const msg = execFileSync('git', ['log', '-1', '--format=%s', sha], { cwd: ROOT }).toString().trim();
  let linea, marca = ' ';
  try {
    const F = motorDe(sha);
    const T = caso(F, 'B');
    const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
    const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
    const o = F.policyAngles('pairwise', g.zen, g.az, T, irr, CANON.doy, CANON.albedo);
    const sh = F.shadeBand3DAll(g.zen, g.az, T, o.angles, { noStruct: true });
    let mp = 0; for (let r = 0; r < 6; r++) mp = Math.max(mp, sh[r] || 0);
    const P = F.poaPlant(g.zen, g.az, T, o.angles, irr, CANON.doy, CANON.albedo).plant;
    linea = o.angles.map(v => v.toFixed(2)).join('/') + `  fs ${(100 * mp).toFixed(3)} %  POA ${P.toFixed(3)}`;
    if (prev !== null && linea !== prev) marca = '<';
    prev = linea;
  } catch (e) { linea = 'ERROR ' + e.message.slice(0, 60); }
  console.log(`${marca} ${sha.slice(0, 7)}  ${linea.padEnd(62)}  ${msg.slice(0, 58)}`);
}
console.log('');
console.log('«<» marca el commit en que el resultado CAMBIA respecto al anterior de la lista.');
