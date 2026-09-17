#!/usr/bin/env node
/* D.4 — escalón mínimo no nulo de pérdida eléctrica POR MESA, dado MV y nb.
   Derivación del código + verificación numérica sobre un caso construido.
   Ejecutable:  node audit2/D4_escalon.mjs                                      */
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const F = motorDe('HEAD');
const T = caso(F, 'B');
console.log(echo('E-D4 · escalón mínimo de pérdida eléctrica por mesa', F, T).texto);
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);

console.log(`\nDERIVACIÓN, de backtracking.html:2265-2271:`);
console.log(`
        elecSum+=elecLoss(fCol,T.nBypass); nCol++;
        hitS+=fCol; NS++; elecS+=elecLoss(fCol,T.nBypass);   // la cuenta de este tramo (v1.41)
        ...
      segElec[r].push(NS?elecS/NS:0);`);
console.log(`
y de backtracking.html:628-632:

function elecLoss(f,nBypass){
  if(!(f>1e-6))return 0;
  if(nBypass<=0)return Math.min(1,f);
  return Math.min(1,Math.ceil(nBypass*f)/nBypass);
}

Cada estación aporta un múltiplo entero de 1/nb (el escalón de Martinez), y la mesa
promedia sobre sus NS estaciones. El bucle axial es
  for(let j=0;j<MV;j++){ const v=v0+(v1-v0)*(j+0.5)/MV; ... }
con (v0,v1) los extremos de la MESA ⇒ NS = MV exactamente.

  escalón mínimo no nulo de segElec  =  1 / (nb · MV)

y la pérdida por mesa sólo puede tomar los valores  m/(nb·MV)  con m entero 0…nb·MV.`);
console.log(`\ntabla del escalón:`);
console.log(`   nb\\MV        8        16        32        64       128`);
for (const nb of [1, 2, 3, 6]) console.log(`   ${String(nb).padStart(2)}    ` + [8,16,32,64,128].map(mv => (1/(nb*mv)).toFixed(6).padStart(9)).join(' '));
console.log(`   Ayora real publica MV = 8 (if(T.real)return 8, backtracking.html:845) y nb = 2 (cfg)`);
console.log(`   ⇒ escalón = 1/(2·8) = ${(1/16).toFixed(6)} = ${(100/16).toFixed(4)} % de la mesa`);
console.log(`   con nb = 0 elecLoss es LINEAL (min(1,f)) y no hay escalón de diodos; queda el de la cuadratura`);

/* ── verificación numérica: se barre θ finísimo y se listan los valores DISTINTOS
   que toma segElec de una mesa; deben ser todos múltiplos de 1/(nb·MV) ─────── */
console.log(`\nVERIFICACIÓN NUMÉRICA — caso B, instante canónico, una mesa por fila, θ uniforme -55…55 paso 0,01°`);
for (const [mv, nb] of [[8, 2], [8, 3], [16, 2], [32, 6]]) {
  T.mv = mv; T.nBypass = nb;
  const vals = new Set();
  for (let th = -55; th <= 55 + 1e-9; th += 0.01) {
    const sh = F.shadeBand3DAll(g.zen, g.az, T, new Array(6).fill(+th.toFixed(4)));
    if (sh.segElec) for (let r = 0; r < 6; r++) for (const v of (sh.segElec[r] || [])) vals.add(+v.toFixed(12));
  }
  const paso = 1 / (nb * mv);
  const orden = [...vals].sort((a, b) => a - b);
  const noMult = orden.filter(v => Math.abs(v / paso - Math.round(v / paso)) > 1e-9);
  const nz = orden.filter(v => v > 0);
  console.log(`  MV ${String(mv).padStart(3)} nb ${nb}: ${String(orden.length).padStart(3)} valores distintos · mínimo no nulo OBSERVADO ${nz.length ? nz[0].toFixed(8) : '—'} · escalón TEÓRICO 1/(nb·MV) = ${paso.toFixed(8)} · ¿el observado es ese escalón? ${nz.length && Math.abs(nz[0]-paso)<1e-9 ? 'SÍ' : 'NO, es ' + (nz.length ? (nz[0]/paso).toFixed(0) : '—') + ' escalones'} · valores NO múltiplos de 1/(nb·MV): ${noMult.length}`);
}
delete T.mv; T.nBypass = CANON.nBypass;

/* ── el mismo escalón en una MESA de planta real: MV=8, nb=2, y la traducción a W/m² ── */
console.log(`\nTRADUCCIÓN A ENERGÍA — el escalón eléctrico multiplica el haz de la mesa:`);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
const p = F.poaRow(30, 0, 0, g.zen, g.az, irr, CANON.doy, CANON.albedo, CANON.iam);
console.log(`  a θ=30°, tilt 0, este instante: beam ${p.beam.toFixed(4)} W/m² (circ ${p.circ.toFixed(4)}, sky ${p.sky.toFixed(4)}, gnd ${p.gnd.toFixed(4)})`);
console.log(`  un escalón de 1/(2·8) sobre el haz = ${(p.beam/16).toFixed(4)} W/m² de esa mesa`);
console.log(`  (la planta promedia por fila y la fila por largo de mesa: el efecto en la POA de planta se`);
console.log(`   divide por el nº de filas y por la fracción de largo de esa mesa)`);
