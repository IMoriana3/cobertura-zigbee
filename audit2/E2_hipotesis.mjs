/* E.2 — qué combinación reproduce sombra 13,4 % y POA 105 del §5 del documento.
   Se prueban las hipótesis UNA A UNA. Ejecutable: node audit2/E2_hipotesis.mjs */
import { motorDe, caso, CANON } from './lib_motor.mjs';
const F = motorDe('3a57451'), T = caso(F, 'B');
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
console.log(`E.2 · commit 3a57451 · node ${process.version}`);
console.log(`sol elev ${g.elev.toFixed(3)}° az ${g.az.toFixed(3)}° zen ${g.zen.toFixed(3)}°`);
console.log(`objetivo del documento §5: sombra 13,4 % · POA 105 · y su cielo declarado: GHI 80 · DNI 300 · DHI 32`);
console.log('');
const corre = (alt, tl, alb, etiq) => {
  const irr = F.clearskyIneichen(g.zen, CANON.doy, alt, tl);
  const o = F.policyAngles('pairwise', g.zen, g.az, T, irr, CANON.doy, alb);
  const shP = F.shadeBand3DAll(g.zen, g.az, T, o.angles, { noStruct: true });
  const shT = F.shadeBand3DAll(g.zen, g.az, T, o.angles);
  let mp = 0, mt = 0; for (let r = 0; r < 6; r++) { mp = Math.max(mp, shP[r] || 0); mt = Math.max(mt, shT[r] || 0); }
  const P = F.poaPlant(g.zen, g.az, T, o.angles, irr, CANON.doy, alb).plant;
  console.log(`${etiq.padEnd(34)} ghi ${irr.ghi.toFixed(1).padStart(6)} dni ${irr.dni.toFixed(1).padStart(6)} dhi ${irr.dhi.toFixed(1).padStart(5)}  ·  fs planos ${(100*mp).toFixed(3).padStart(7)} %  fs publicada ${(100*mt).toFixed(3).padStart(7)} %  ·  POA ${P.toFixed(3).padStart(8)}`);
  return { ghi: irr.ghi, dni: irr.dni, P, mp, mt };
};
console.log('— (a) planos vs publicada, con los parámetros canónicos —');
corre(CANON.alt, CANON.tl, CANON.albedo, 'canónico alt 739 TL 3,5 alb 0,20');
console.log('');
console.log('— (b) altitud: se busca la que da el cielo del documento —');
for (const alt of [0, 100, 200, 207, 250, 300, 500, 739]) corre(alt, CANON.tl, CANON.albedo, `alt ${alt} m`);
console.log('');
console.log('— (b2) turbidez, a la altitud canónica —');
for (const tl of [2.5, 3.0, 3.5, 4.0, 4.5]) corre(CANON.alt, tl, CANON.albedo, `TL ${tl}`);
console.log('');
console.log('— (c) MV: el contador con distintas estaciones, cielo canónico —');
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const o = F.policyAngles('pairwise', g.zen, g.az, T, irr, CANON.doy, CANON.albedo);
for (const mv of [8, 16, 33, 64, 128]) {
  const shP = F.shadeBand3DAll(g.zen, g.az, T, o.angles, { noStruct: true, MV: mv });
  const shT = F.shadeBand3DAll(g.zen, g.az, T, o.angles, { MV: mv });
  let mp = 0, mt = 0; for (let r = 0; r < 6; r++) { mp = Math.max(mp, shP[r] || 0); mt = Math.max(mt, shT[r] || 0); }
  console.log(`MV ${String(mv).padEnd(31)} fs planos ${(100*mp).toFixed(3).padStart(7)} %  ·  fs publicada ${(100*mt).toFixed(3).padStart(7)} %`);
}
