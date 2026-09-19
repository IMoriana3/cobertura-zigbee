#!/usr/bin/env node
/* G.1 (lado JS) — rejilla declarada {caso A, caso B} × {9 políticas} ×
   {07:30, 09:00, 12:00, 16:00, 18:30 locales del 21-jun-2026, tz +2}.
   Escribe audit2/out/G1_js.json con el terreno, el sol, la irradiancia, los θ por
   fila y la POA de planta. El lado Python lo lee y usa EL MISMO sol y LA MISMA
   irradiancia, para que la comparación aísle el motor y no el modelo de cielo.
   Ejecutable:  node audit2/G1_js.mjs                                           */
import fs from 'node:fs'; import path from 'node:path';
import { motorDe, CANON, caso, ROOT } from './lib_motor.mjs';
import { execFileSync } from 'node:child_process';
const F = motorDe('HEAD');
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const HORAS = ['07:30', '09:00', '12:00', '16:00', '18:30'];
const POL = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
const out = { commit: SHA, node: process.version, VER: F.VER, canon: CANON, horas: HORAS, politicas: POL, casos: {} };
for (const cual of ['A', 'B']) {
  const T = caso(F, cual);
  const c = { pairs: T.pairs.map(p => ({ slope: p.slope, pitch: p.pitch, axisTilt: p.axisTilt })),
              cw: T.cw, axisAz: T.axisAz, maxAngle: T.maxAngle, gcr: T.gcr, z0: T.z0,
              nBypass: T.nBypass, iam: T.iam, rowTilt: T.rowTilt, drive: T.drive, instantes: [] };
  for (const h of HORAS) {
    const [hh, mm] = h.split(':').map(Number);
    const ms = Date.UTC(2026, 5, 21, hh - CANON.tz, mm);
    const g = F.solarPos(ms, CANON.lat, CANON.lon);
    const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
    const ang = {}, poa = {}, sombra = {};
    for (const k of POL) {
      const a = F.policyAngles(k, g.zen, g.az, T, irr, CANON.doy, CANON.albedo).angles;
      ang[k] = a.map(v => +v.toFixed(8));
      const p = F.poaPlant(g.zen, g.az, T, a, irr, CANON.doy, CANON.albedo);
      poa[k] = +p.plant.toFixed(8);
      sombra[k] = p.shade.slice(0, T.pairs.length + 1).map(v => +(+v).toFixed(8));
    }
    c.instantes.push({ hora: h, utc: new Date(ms).toISOString(), zen: g.zen, az: g.az, elev: g.elev,
                       ghi: irr.ghi, dni: irr.dni, dhi: irr.dhi, ang, poa, sombra });
  }
  out.casos[cual] = c;
}
fs.writeFileSync(path.join(ROOT, 'audit2', 'out', 'G1_js.json'), JSON.stringify(out, null, 1));
console.log(`G1_js.json escrito · commit ${SHA} · VER ${F.VER} · node ${process.version}`);
for (const cual of ['A', 'B']) { const c = out.casos[cual];
  console.log(`\ncaso ${cual}: ${c.pairs.length + 1} filas · tilt N-S ${c.rowTilt.map(v => v.toFixed(2)).join(' ')} · pendiente ${c.pairs[0].slope.toFixed(3)}°`);
  for (const i of c.instantes) console.log(`  ${i.hora} zen ${i.zen.toFixed(3)}° az ${i.az.toFixed(3)}° · ghi ${i.ghi.toFixed(2)} dni ${i.dni.toFixed(2)} dhi ${i.dhi.toFixed(2)}`);
}
