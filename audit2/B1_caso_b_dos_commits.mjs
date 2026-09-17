/* B.1 — caso B (instante y parámetros canónicos) en 1227252 (v1.67) y 3a57451 (v1.68).
   Ejecutable tal cual:  node audit2/B1_caso_b_dos_commits.mjs                        */
import { motorDe, caso, echo, CANON } from './lib_motor.mjs';
const SHAS = process.argv.slice(2).length ? process.argv.slice(2) : ['1227252', '3a57451'];
for (const sha of SHAS) {
  const F = motorDe(sha);
  const T = caso(F, 'B');
  const { texto, g, irr } = echo(`B.1 · caso B · commit ${sha}`, F, T);
  console.log(texto);
  for (const k of ['pairwise', 'true3d']) {
    let o; try { o = F.policyAngles(k, g.zen, g.az, T, irr, CANON.doy, CANON.albedo); }
    catch (e) { console.log(`${k}: ERROR ${e.message}`); continue; }
    const shP = F.shadeBand3DAll(g.zen, g.az, T, o.angles, { noStruct: true });
    const shT = F.shadeBand3DAll(g.zen, g.az, T, o.angles);
    let mp = 0, mt = 0; for (let r = 0; r < T.pairs.length + 1; r++) { mp = Math.max(mp, shP[r] || 0); mt = Math.max(mt, shT[r] || 0); }
    const P = F.poaPlant(g.zen, g.az, T, o.angles, irr, CANON.doy, CANON.albedo);
    console.log(`${k.padEnd(9)} θ  = ${o.angles.map(v => v.toFixed(3).padStart(8)).join(' ')}`);
    console.log(`${''.padEnd(9)} sombra PLANOS máx ${(100 * mp).toFixed(3)} %  ·  sombra PUBLICADA máx ${(100 * mt).toFixed(3)} %  ·  POA planta ${P.plant.toFixed(4)} W/m²`);
  }
  console.log('');
}
