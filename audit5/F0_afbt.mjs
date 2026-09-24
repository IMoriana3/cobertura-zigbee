/* BT3D · FASE 0.1 — AUDITORÍA DE «AFECCIÓN BT» (`terreno.html:1606-1762`)
 * CONTRA LOS CONTROLES DEL MOTOR.
 *
 *   node audit5/F0_afbt.mjs [--json=RUTA]
 *
 * Se EJECUTA el código publicado, no una copia: `afbtLoc`, `afbtSol`,
 * `afbtVecinos` y `afbtDeficit` se recortan del texto de terreno.html y se
 * evalúan con sus globales (TC, COTAS, TRK, DEG, SIM_GCR). Solo se sustituyen
 * los dos LECTORES de escena, `afbtPendTubo` y `afbtPuntas` (:1697-1709), que
 * leen el 3D de la página; aquí devuelven la pendiente y las cotas que pone el
 * caso. Todo lo que decide —marco del tubo, desnivel en las puntas, perfil,
 * bisección, vecinos— es el de la página.
 *
 * Controles del motor (audit5/test_motor.mjs) que tienen sentido para una
 * función que devuelve GRADOS DE RECORTE y no un polígono:
 *   C1 · TANGENCIA: filas largas, planas, iguales, sol ⟂ eje → recorte = |ψ| − |θ_bt de pvlib|
 *        (con y sin pendiente transversal); control negativo: la pendiente con el signo cambiado.
 *   C2 · ESPEJO E↔O con cotas irregulares; control negativo: espejo sin cambiar el lado del vecino.
 *   C3 · θ POR MESA (requisito 1.2 del motor): ¿puede la función representar vecinos en θ
 *        distintos? Se lee la firma y se mide la consecuencia con el motor.
 *   C4 · ENUMERACIÓN contra el motor (control 7): en Ayora, 21-jun y 21-dic, con cada unidad a
 *        su θ astronómico (el que el backtracking tiene que corregir), qué parte de los pares
 *        emisor→receptor con sombra real cubre `afbtVecinos`.
 * Los controles de UNIÓN (6) y de sol en el plano del eje (4) no aplican tal cual: la función
 * agrega por MÁXIMO de grados entre vecinos (`afbtAgg`, :1763-1787) y con |sv.E| pequeño
 * devuelve 0 por construcción (`if(s*sv.E<=0)return 0;`, :1714).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador } from './lib_simulador.mjs';
import { cargar, resolver } from './lib_parametros.mjs';
import { vectorSol, caraMesa, sombraSobre, relaciones, fraccionArea } from './lib_proyeccion.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const P = cargar();
const { F, VER } = cargaSimulador(ROOT, ['singleaxis', 'trueTrackAngle']);
const html = fs.readFileSync(path.join(ROOT, 'terreno.html'), 'utf-8');
const linea = i => html.slice(0, i).split('\n').length;
function recorta(nombre) {
  const i0 = html.indexOf(`function ${nombre}(`); if (i0 < 0) throw new Error(`no está ${nombre}`);
  let k = html.indexOf('{', i0), prof = 0;
  for (; k < html.length; k++) { if (html[k] === '{') prof++; else if (html[k] === '}' && --prof === 0) break; }
  return { txt: html.slice(i0, k + 1), l0: linea(i0), l1: linea(k) };
}
const FN = ['afbtLoc', 'afbtSol', 'afbtVecinos', 'afbtDeficit'].map(recorta);
console.log(`BT3D · F0.1 · Afección BT · terreno.html ${FN.map((f, i) => ['afbtLoc', 'afbtSol', 'afbtVecinos', 'afbtDeficit'][i] + ' :' + f.l0 + '-' + f.l1).join(' · ')} · simulador ${VER}`);
/* el entorno de la página que esas funciones leen */
const ENV = new Function('G', `var TC=G.TC,COTAS=G.COTAS,TRK=G.TRK,SIM_GCR=G.SIM_GCR,DEG=Math.PI/180;
  function afbtPendTubo(t){return t._g||0;}
  function afbtPuntas(t,lado){return t._p[lado];}
  ${FN.map(f => f.txt).join('\n')}
  return {afbtVecinos:afbtVecinos,afbtDeficit:afbtDeficit,set:function(k,v){if(k==='TRK')TRK=v;else if(k==='TC')TC=v;else if(k==='COTAS')COTAS=v;}};`);
const DEGR = Math.PI / 180;
const sv = (elev, az) => ({ E: Math.cos(elev * DEGR) * Math.sin(az * DEGR), N: Math.cos(elev * DEGR) * Math.cos(az * DEGR), U: Math.sin(elev * DEGR) });
const out = { ver: VER, lineas: Object.fromEntries(FN.map((f, i) => [['afbtLoc', 'afbtSol', 'afbtVecinos', 'afbtDeficit'][i], [f.l0, f.l1]])) };

/* ── C1 · TANGENCIA contra pvlib ─────────────────────────────────────────── */
{
  const cw = 2.384, d = 6, lim = 55, larga = 2000;
  const A = ENV({ TC: { filaZ: 3, span: larga, modH: cw }, COTAS: { cuerda: cw, limite: lim }, TRK: [], SIM_GCR: 0.4 });
  const tr = (z, dh) => ({ gx: 0, gz: 0, span: larga, rot: 0, _g: 0, _p: { E: [z, z], O: [z, z] } });
  /* se comparan ÁNGULOS de mando: el de Afección BT es ψ recortado (signo de ψ, magnitud
     |ψ| − recorte); el de pvlib, θ_bt. La bisección de Afección BT busca solo entre el
     seguimiento y el plano (m ∈ [0, 1], :1758-1759): si pvlib libra la sombra al OTRO lado de
     la horizontal, ese θ está fuera de su dominio y se cuenta aparte. */
  let peor = 0, peorNeg = 0, n = 0, casos = 0, fuera = [];
  for (const dh of [0, 0.3, -0.3, 0.8, -0.8]) for (const lado of ['E', 'O']) for (let el = 2; el <= 60; el += 2) {
    const az = lado === 'E' ? 90 : 270, a = tr(0), b = { ...tr(0), gx: lado === 'E' ? 12 : -12, _p: { E: [dh, dh], O: [dh, dh] } };
    const rec = A.afbtDeficit(a, b, lado, sv(el, az), d);
    const zW = lado === 'E' ? 0 : dh, zE = lado === 'E' ? dh : 0;
    const cross = Math.atan2(zW - zE, d) / DEGR;                 // declarado: > 0 si el plano BAJA al este
    const psi = F.trueTrackAngle(90 - el, az, 0, 0), ideal = Math.max(-lim, Math.min(lim, psi)), sg = Math.sign(ideal);
    const thAf = sg * (Math.abs(ideal) - rec);
    const bt = F.singleaxis(90 - el, az, { axisTilt: 0, axisAz: 0, maxAngle: lim, backtrack: true, gcr: cw / d, crossAxisTilt: cross });
    const btNeg = F.singleaxis(90 - el, az, { axisTilt: 0, axisAz: 0, maxAngle: lim, backtrack: true, gcr: cw / d, crossAxisTilt: -cross });
    casos++; if (Math.abs(bt - ideal) > 1e-6 || rec > 1e-6) n++;
    if (sg * bt < -1e-9) { fuera.push({ dh, lado, elev: el, theta_pvlib: bt, theta_afbt: thAf }); continue; }
    peor = Math.max(peor, Math.abs(thAf - bt)); if (dh && sg * btNeg >= 0) peorNeg = Math.max(peorNeg, Math.abs(thAf - btNeg));
  }
  out.C1 = { casos, con_recorte: n, en_dominio: casos - fuera.length, max_abs_dif_deg: peor, control_signo_cambiado_max_dif_deg: peorNeg, fuera_de_dominio: fuera };
  console.log(`\nC1 · TANGENCIA (filas de ${larga} m, planas, paso ${d}, cuerda ${cw}, sol ⟂ eje, elevación 2-60°, Δh ∈ {0, ±0,3, ±0,8} m, sol E y O)`);
  console.log(`     ${casos} casos, ${n} con recorte · en su dominio (${casos - fuera.length}): máx |θ_afbt − θ_bt pvlib| = ${peor.toFixed(4)}° ${peor <= 0.01 ? 'PASA' : 'NO PASA'} · control con la pendiente de signo cambiado: ${peorNeg.toFixed(2)}° ${peorNeg > 0.5 ? '(el control cae: protege)' : '(⚠ el control no cae)'}`);
  console.log(`     FUERA de su dominio: ${fuera.length} casos en que pvlib libra la sombra pasando la horizontal (θ_bt de ${Math.min(...fuera.map(f => Math.abs(f.theta_pvlib))).toFixed(2)}° a ${Math.max(...fuera.map(f => Math.abs(f.theta_pvlib))).toFixed(2)}° al otro lado) y Afección BT da recorte TOTAL (θ = 0, «ni en plano se libra», :1757): ` + fuera.map(f => `Δh ${f.dh} sol ${f.lado} elev ${f.elev}°`).join(' · '));
}

/* ── C2 · ESPEJO E↔O con cotas irregulares ──────────────────────────────── */
{
  const A = ENV({ TC: { filaZ: 3, span: 70, modH: 2.384 }, COTAS: { cuerda: 2.384, limite: 55 }, TRK: [], SIM_GCR: 0.4 });
  let sem = 7; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
  let peor = 0, peorNeg = 0, casos = 0, conRec = 0;
  for (let k = 0; k < 400; k++) {
    const g = (rnd() - 0.5) * 0.06, pa = [rnd() - 0.5, rnd() - 0.5], pb = [rnd() * 2 - 1, rnd() * 2 - 1], dn = (rnd() - 0.5) * 20;
    const el = 3 + rnd() * 50, az = 40 + rnd() * 100, gap = 5 + rnd() * 3;
    const a = { gx: 0, gz: 0, span: 70, rot: 0, _g: g, _p: { E: pa, O: pa } }, b = { gx: 12, gz: dn, span: 70, rot: 0, _g: g, _p: { E: pb, O: pb } };
    const bm = { ...b, gx: -12 }, s = sv(el, az), sm = { E: -s.E, N: s.N, U: s.U };
    const r1 = A.afbtDeficit(a, b, 'E', s, gap), r2 = A.afbtDeficit(a, bm, 'O', sm, gap), r3 = A.afbtDeficit(a, bm, 'E', sm, gap);
    casos++; if (r1 > 1e-6) conRec++;
    peor = Math.max(peor, Math.abs(r1 - r2)); peorNeg = Math.max(peorNeg, Math.abs(r1 - r3));
  }
  out.C2 = { casos, con_recorte: conRec, max_abs_dif_deg: peor, control_max_dif_deg: peorNeg };
  console.log(`\nC2 · ESPEJO E↔O (${casos} casos aleatorios, ${conRec} con recorte): máx |Δ| = ${peor.toExponential(2)}° ${peor <= 1e-9 ? 'PASA' : 'NO PASA'} · control (espejo sin cambiar el lado): ${peorNeg.toFixed(2)}° ${peorNeg > 0.5 ? '(cae: protege)' : '(⚠ no cae)'}`);
}

/* ── C3 · θ POR MESA ───────────────────────────────────────────────────── */
{
  const dTxt = FN[3].txt, iAmbas = dTxt.indexOf('ambas filas a tilt phi');
  const firma = /function afbtDeficit\(([^)]*)\)/.exec(dTxt)[1];
  /* consecuencia, con el motor: dos filas planas de 50 m a paso 6, sol del ESTE a 10°.
     A (oeste) en el ángulo que da Afección BT como libre de sombra (gemelo); B (este, fila
     delantera: al este no tiene a nadie) en su θ astronómico, que es lo que hace un
     seguidor sin nadie delante. El motor mide la sombra de B sobre A. */
  const A = ENV({ TC: { filaZ: 3, span: 50, modH: 2.384 }, COTAS: { cuerda: 2.384, limite: 55 }, TRK: [], SIM_GCR: 0.4 });
  const filas = [];
  for (const el of [5, 10, 15, 20, 25, 30]) {
    const s0 = sv(el, 90), a = { gx: 0, gz: 0, span: 50, rot: 0, _g: 0, _p: { E: [0, 0], O: [0, 0] } }, b = { ...a, gx: 12 };
    const rec = A.afbtDeficit(a, b, 'E', s0, 6), psi = Math.min(55, F.trueTrackAngle(90 - el, 90, 0, 0));
    const thA = psi - rec, thB = psi;                                     // θ > 0 = mira al este
    const s = vectorSol(90 - el, 90), mA = { x: 0, n: [0, 50], z: [0, 0] }, mB = { x: 6, n: [0, 50], z: [0, 0] };
    const RA = caraMesa(mA, thA, 0.17, 2.384);
    const gem = sombraSobre(caraMesa(mB, thA, 0.17, 2.384), RA, s), real = sombraSobre(caraMesa(mB, thB, 0.17, 2.384), RA, s);
    const fg = gem ? fraccionArea(RA, [gem.poly], 256) : 0, fr = real ? fraccionArea(RA, [real.poly], 256) : 0;
    filas.push({ elev: el, recorte_afbt: rec, thA, thB, sombra_gemelo: fg, sombra_B_en_su_theta: fr });
  }
  out.C3 = { firma, linea_ambas_filas: linea(html.indexOf('ambas filas a tilt phi')), casos: filas };
  console.log(`\nC3 · θ POR MESA · firma afbtDeficit(${firma}): no recibe el θ del vecino; la sombra se evalúa con «ambas filas a tilt phi» (terreno.html:${out.C3.linea_ambas_filas}). NO PASA por construcción.`);
  console.log(`     consecuencia (motor, filas planas de 50 m, paso 6, sol del este; A en el θ que Afección BT da por libre, B fila delantera en su θ astronómico):`);
  for (const f of filas) console.log(`     elev ${String(f.elev).padStart(2)}° · recorte ${f.recorte_afbt.toFixed(2)}° · θA ${f.thA.toFixed(2)}° θB ${f.thB.toFixed(2)}° · sombra sobre A: gemelo ${(100 * f.sombra_gemelo).toFixed(2)} % · con B en su θ ${(100 * f.sombra_B_en_su_theta).toFixed(2)} %`);
}

/* ── C4 · ENUMERACIÓN contra el motor, en Ayora ─────────────────────────── */
{
  const E = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit5/out/escenas/ayora.json'), 'utf-8'));
  const par = resolver(P, 'ayora', ['x'])[0];
  /* TRK como lo arma la página: un seguidor por unidad, centro = media de sus filas;
     gz = −norte (terreno.html:844); span = el de su fila más larga */
  const TRK = E.unidades.map(u => { const M = u.mesas.map(i => E.mesas[i]);
    const xs = [...new Set(M.map(m => m.x))], n0 = Math.min(...M.map(m => m.n[0])), n1 = Math.max(...M.map(m => m.n[1]));
    return { gx: xs.reduce((a, b) => a + b, 0) / xs.length, gz: -(n0 + n1) / 2, span: n1 - n0, rot: 0 }; });
  const A = ENV({ TC: { filaZ: 3, span: 74.758, modH: par.cuerda }, COTAS: { cuerda: par.cuerda, limite: par.theta_max }, TRK, SIM_GCR: 0.4 });
  const vec = TRK.map((_, i) => A.afbtVecinos(i));
  /* la fila de cada mesa dentro de su unidad: 'O' u 'E' */
  const lado = E.mesas.map(m => (m.x < TRK[m.u].gx ? 'O' : 'E'));
  const BANDAS = [['<3°', 0, 3], ['3-10°', 3, 10], ['10-30°', 10, 30], ['≥30°', 30, 91]];
  const C = BANDAS.map(() => ({ inst: 0, rel: 0, cubre: 0, intra: 0, mismo_tubo: 0, lejos: 0, fila_trasera: 0, filtrado: 0 }));
  for (const q of E.instantes) {
    const b = BANDAS.findIndex(([, a0, a1]) => q.elev >= a0 && q.elev < a1), K = C[b]; K.inst++;
    const s = vectorSol(q.zen, q.az);
    const th = E.unidades.map(u => Math.max(-par.theta_max, Math.min(par.theta_max, F.trueTrackAngle(q.zen, q.az, -u.tilt, 0))));
    const caras = E.mesas.map(m => caraMesa(m, th[m.u], par.z0, par.cuerda));
    const rel = relaciones(caras, s);
    rel.forEach((l, r) => l.forEach(x => {
      if (!(x.area > 1e-4)) return; K.rel++;
      const e = x.e, ue = E.mesas[e].u, ur = E.mesas[r].u;
      if (ue === ur) { K.intra++; return; }
      const dx = TRK[ue].gx - TRK[ur].gx;
      if (Math.abs(dx) < 3) { K.mismo_tubo++; return; }
      if (Math.abs(dx) > 2.6 * 6) { K.lejos++; return; }
      const v = vec[ur].find(w => w.j === ue);
      if (!v) { K.filtrado++; return; }
      /* Afección BT solo modela la fila de B que da a A contra la fila de A que da a B */
      const ladoB = v.lado, frenteA = ladoB, frenteB = ladoB === 'E' ? 'O' : 'E';
      if (lado[r] !== frenteA || lado[e] !== frenteB) { K.fila_trasera++; return; }
      K.cubre++;
    }));
  }
  out.C4 = BANDAS.map(([nm], i) => ({ banda: nm, ...C[i] }));
  const tot = C.reduce((a, k) => { for (const z in k) a[z] = (a[z] || 0) + k[z]; return a; }, {});
  out.C4_total = tot;
  console.log(`\nC4 · ENUMERACIÓN en Ayora (${E.unidades.length} unidades, ${E.mesas.length} mesas; 21-jun y 21-dic cada ${P.paso_min} min; cada unidad a su θ astronómico; par = sombra > 1 cm²)`);
  console.log(`     banda    instantes  pares reales  los cubre Afección BT   intra-unidad  mismo tubo  > 2,6·paso  fila trasera  quitado por el filtro de 2ª fila`);
  const pc = (a, b) => `${a} (${(100 * a / Math.max(1, b)).toFixed(1)} %)`;
  for (const [i, [nm]] of BANDAS.entries()) { const k = C[i];
    console.log(`     ${nm.padEnd(7)} ${String(k.inst).padStart(9)} ${String(k.rel).padStart(13)}   ${pc(k.cubre, k.rel).padEnd(20)}  ${pc(k.intra, k.rel).padEnd(12)}  ${pc(k.mismo_tubo, k.rel).padEnd(10)}  ${pc(k.lejos, k.rel).padEnd(10)}  ${pc(k.fila_trasera, k.rel).padEnd(12)}  ${pc(k.filtrado, k.rel)}`); }
  console.log(`     TOTAL   ${String(tot.inst).padStart(9)} ${String(tot.rel).padStart(13)}   ${pc(tot.cubre, tot.rel)}`);
}
const dest = arg('json', '');
if (dest) fs.writeFileSync(path.join(ROOT, dest), JSON.stringify(out, null, 1));
