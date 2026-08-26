/* CRUCE del diagnóstico REAL de una planta contra las consignas del simulador.
   Uso:  node tools/cruce_diagnostico.mjs <diagnostico.json> [planta] [--huso N]
         node tools/cruce_diagnostico.mjs diag.json ayora --csv desv.csv

   El diagnóstico dice qué ángulo decidió cada TCU (`Objetivo`) y dónde acabó
   el seguidor (`Tilt`). El simulador dice qué ángulo tocaría según cada
   política sobre el terreno MEDIDO. Esto los pone uno al lado del otro.

   ── Qué se puede concluir y qué no ────────────────────────────────────────
   Con SOL ALTO ninguna política discrimina: astro, bt2d, pairwise y bt3d dan
   lo mismo porque no hay sombra que evitar. Un volcado de mediodía es el
   CONTROL —valida identidad, geometría, convenio y huso— pero no decide qué
   está haciendo la planta. Eso solo se ve en las HORAS DE BACKTRACKING, que
   es donde las políticas se separan. El informe lo dice en cada ejecución
   para que nadie cite un control como si fuera una prueba.

   ── La identidad, que es donde esto se rompe en silencio ──────────────────
   El id del layout NO codifica la NCU («TK 045-06» tiene ncu=9) y su número
   NO reinicia en 1 en todas ellas (en Ayora, NCU9 va de 45 a 85). El TCU del
   diagnóstico es el RANGO del seguidor dentro de su NCU. Con el emparejado
   ingenuo (número del id) se apareaban 591 de 748; con el rango, 748.

   Y se valida solo: si el mapeo fuera falso, meter de golpe 157 seguidores
   con líneas equivocadas dispararía la desviación. Se comprueba que NO se
   mueva, y si se mueve esto aborta.

   Cuando una NCU declara distinto número de TCUs que el layout, el rango deja
   de ser fiable a partir del primer hueco: esa NCU se marca **SIN VERIFICAR**
   en vez de aparearse a ojo. Con sol alto el desfase de una línea ni se nota
   —las vecinas apuntan casi igual—, así que darlo por bueno sería enterrar el
   problema hasta que alguien lo cite en una reunión.

   ── Lo que se aparta antes de medir ───────────────────────────────────────
   · las filas que no son seguidores (`NCU`, `HSU*`, `Repetidor *`);
   · las que no están en AUTO: no siguen consigna, compararlas es ruido;
   · las que están en POSICIÓN SEGURA por batería (SoC L3 o |Objetivo|≥54,9°):
     tampoco siguen al sol. Se cuentan y se listan aparte, porque son un
     hallazgo de mantenimiento, no un error de modelo.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const libres = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const DIAGP = libres[0];
const PLANTA = (libres[1] || 'ayora').toLowerCase();
const HUSO_FIJO = opt('--huso', null);
const CSV = opt('--csv', null);
if (!DIAGP) { console.error('uso: node tools/cruce_diagnostico.mjs <diagnostico.json> [planta] [--huso N] [--csv f]'); process.exit(2); }

const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
const src = html.slice(html.lastIndexOf('/*', i0), i1);
if (src.length < 5000) throw new Error(`bloque FÍSICA PURA sospechoso: ${src.length} car.`);
/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8');
const F = new Function(_sol + '\n' + src + ';return {solarPos,clearskyIneichen,policyAngles,plantFromCotas};')();

// el volcado de la toolbox viene con BOM
const DIAG = JSON.parse(fs.readFileSync(DIAGP, 'utf-8').replace(/^﻿/, ''));
const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, `${PLANTA}_cotas.json`), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, `${PLANTA}_layout.json`), 'utf-8'));
const POLS = ['astro', 'bt2d', 'pairwise', 'true3d'];

/* ── bloques y ángulos por política, para un instante ─────────────────────── */
const BLOQUES = [];
{
  const sonda = F.plantFromCotas(cotas, 500, 0);
  for (const bk of sonda.blocks) BLOQUES.push({ b: bk.i, P: F.plantFromCotas(cotas, 500, bk.i) });
}
const Tde = (P) => {
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx,
                 axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
           nBypass: 2, iam: 0.05, rowTilt: P.tilt, groups: P.groups, drive: 'bifila',
           segs: P.segs, real: P };
};
const [fch, hor] = String(DIAG.fecha).split(' ');
const [Y, M, D] = fch.split('-').map(Number);
const [hh, mi, ss] = hor.split(':').map(Number);
const doy = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 1)) / 86400000) + 1;
const LAT = +lay.clat, LON = +lay.clon;

function angulosEn(huso) {
  const g = F.solarPos(Date.UTC(Y, M - 1, D, hh - huso, mi, ss || 0), LAT, LON);
  const irr = F.clearskyIneichen(g.zen, doy, +cotas.base || 700, 3.5);
  const m = new Map();
  for (const B of BLOQUES) {
    const T = Tde(B.P), p = {};
    for (const k of POLS) p[k] = F.policyAngles(k, g.zen, g.az, T, irr, doy, 0.20).angles;
    m.set(B.b, p);
  }
  return { g, ang: m };
}

/* ── identidad: seguidor → (bloque, línea), por RANGO dentro de su NCU ────── */
const crudos = [];
let fueraMapa = 0;
for (let i = 0; i < lay.trackers.length; i++) {
  const tk = lay.trackers[i], t = cotas.t[i];
  const xr = ((t && t.f) || []).map(a => a.x).filter(v => isFinite(v));
  if (!xr.length) { fueraMapa++; continue; }
  const x0 = Math.min(...xr);
  let mejor = null, dMin = Infinity;
  for (const B of BLOQUES) for (let r = 0; r < B.P.lineX.length; r++) {
    // lineX va RECENTRADO por bloque: la x cruda es xFrom + lineX
    const e = Math.abs(B.P.xFrom + B.P.lineX[r] - x0);
    if (e < dMin) { dMin = e; mejor = { b: B.b, r }; }
  }
  if (!mejor || dMin > (+cotas.pitch || 6) / 2) { fueraMapa++; continue; }
  const m = String(tk.id || '').match(/(\d+)/);
  crudos.push({ ncu: String(tk.ncu), nnn: m ? +m[1] : NaN, pos: mejor });
}
const SEG = new Map(), nLay = new Map();
{
  const porNcu = new Map();
  for (const c of crudos) { if (!porNcu.has(c.ncu)) porNcu.set(c.ncu, []); porNcu.get(c.ncu).push(c); }
  for (const [ncu, v] of porNcu) {
    v.sort((a, b) => a.nnn - b.nnn);
    nLay.set(ncu, v.length);
    v.forEach((c, i) => SEG.set(`${ncu}|${i + 1}`, c.pos));
  }
}

/* ── filas del diagnóstico, clasificadas ─────────────────────────────────── */
const esSeguidor = (x) => /^\d+$/.test(String(x.TCU));
const enSeguro = (x) => Math.abs(+x.Objetivo) >= 54.9 || /SoC insuficiente/i.test(x.Alarmas || '');
const segs = DIAG.tcus.filter(esSeguidor);
const nDiag = new Map();
for (const x of segs) nDiag.set(String(x.NCU), (nDiag.get(String(x.NCU)) || 0) + 1);
// una NCU cuyo recuento no casa pierde el rango a partir del primer hueco
const SIN_VERIFICAR = new Set();
for (const [ncu, n] of nDiag) if ((nLay.get(ncu) || 0) !== n) SIN_VERIFICAR.add(ncu);

/* ── huso: se elige por la mediana, y tiene que ganar con holgura ─────────── */
const medianaDe = (huso) => {
  const { ang } = angulosEn(huso);
  const v = [];
  for (const x of segs) {
    if (enSeguro(x) || x.Modo !== 'AUTO' || x.Objetivo == null) continue;
    const s = SEG.get(`${x.NCU}|${+x.TCU}`); if (!s) continue;
    v.push(Math.abs(+x.Objetivo - (-ang.get(s.b).astro[s.r])));
  }
  v.sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : Infinity;
};
let HUSO;
if (HUSO_FIJO != null) HUSO = +HUSO_FIJO;
else {
  const cand = [0, 1, 2, 3].map(h => ({ h, m: medianaDe(h) })).sort((a, b) => a.m - b.m);
  // el bueno tiene que ser MUCHO mejor que el segundo: media hora de huso son
  // varios grados de seguidor, así que un empate significa que algo no cuadra
  if (!(cand[1].m > cand[0].m * 5 + 1)) {
    console.error(`no se puede fijar el huso: ${cand.slice(0, 2).map(c => `+${c.h}→${c.m.toFixed(2)}°`).join(' vs ')}. ` +
                  `Pásalo con --huso en vez de dejar que esto adivine.`);
    process.exit(1);
  }
  HUSO = cand[0].h;
}
const { g, ang } = angulosEn(HUSO);

/* ── cruce ───────────────────────────────────────────────────────────────── */
const est = {}; for (const k of POLS) est[k] = [];
const det = [], seguro = [];
let noAuto = 0, sinPar = 0;
for (const x of segs) {
  // el estado de batería se mira ANTES que el modo: un seguidor muerto que
  // además está en OFF caía en «no-AUTO» y desaparecía del informe, que es
  // justo donde tiene que salir (pasó con el peor caso de Ayora: mudo 14 días
  // y parado en el tope CONTRARIO al que se le pedía)
  if (enSeguro(x)) { seguro.push(x); continue; }
  if (x.Modo !== 'AUTO' || x.Objetivo == null) { noAuto++; continue; }
  const s = SEG.get(`${x.NCU}|${+x.TCU}`);
  if (!s) { sinPar++; continue; }
  const p = ang.get(s.b);
  const fila = { ncu: String(x.NCU), tcu: +x.TCU, obj: +x.Objetivo, tilt: +x.Tilt,
                 dif: +x.Dif, edad: +x.Edad_s, dudosa: SIN_VERIFICAR.has(String(x.NCU)) };
  // TH_DISP = −1: la página presenta θ<0 = ESTE, igual que la TCU
  for (const k of POLS) { fila[k] = +(x.Objetivo - (-p[k][s.r])).toFixed(3); est[k].push(fila[k]); }
  det.push(fila);
}
if (!det.length) { console.error('ningún seguidor cruzado: revisa planta y volcado'); process.exit(1); }

const stat = (v) => {
  const s = v.slice().sort((a, b) => a - b), n = s.length;
  const abs = v.map(Math.abs).sort((a, b) => a - b);
  return { n, media: v.reduce((a, b) => a + b, 0) / n, mediana: s[Math.floor(n / 2)],
           p95: abs[Math.floor(n * 0.95)], max: abs[n - 1] };
};

/* ── informe ─────────────────────────────────────────────────────────────── */
const f2 = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
console.log(`${PLANTA} · volcado ${DIAG.fecha} (huso +${HUSO}${HUSO_FIJO != null ? ', dado' : ', deducido'})` +
            `${DIAG.toolbox ? ' · toolbox ' + DIAG.toolbox : ''}`);
console.log(`sol: elevación ${g.elev.toFixed(2)}° · azimut ${g.az.toFixed(2)}°`);
console.log(`seguidores en seguimiento: ${det.length} · en posición segura: ${seguro.length} · ` +
            `no-AUTO: ${noAuto} · sin pareja: ${sinPar} · fuera del mapa: ${fueraMapa}\n`);
console.log('  Objetivo(TCU) − θ(simulador), grados · convenio θ<0 = ESTE');
console.log('  política     n      media    mediana    p95|Δ|     máx|Δ|');
for (const k of POLS) {
  const s = stat(est[k]);
  console.log(`  ${k.padEnd(11)}${String(s.n).padStart(4)}   ${f2(s.media).padStart(8)}  ${f2(s.mediana).padStart(8)}` +
              `  ${s.p95.toFixed(3).padStart(8)}  ${s.max.toFixed(3).padStart(9)}`);
}

// ¿discrimina este volcado? con sol alto no hay sombra y todas coinciden
const sep = Math.abs(stat(est.astro).mediana - stat(est.pairwise).mediana);
console.log(`\n  separación astro↔bt3d en este instante: ${sep.toFixed(3)}°` +
  (sep < 0.25
    ? '  ⇒ este volcado NO DISCRIMINA la política (sol alto: sin sombra que evitar).\n' +
      '     Vale como CONTROL de identidad, geometría, convenio y huso. La prueba\n' +
      '     está en las horas de BACKTRACKING, al orto y al ocaso.'
    : '  ⇒ las políticas SE SEPARAN: este volcado sí discrimina.'));

if (SIN_VERIFICAR.size) {
  console.log(`\n  ⚠ NCUs SIN VERIFICAR (el layout y el diagnóstico no cuentan lo mismo, así que el`);
  console.log(`    rango deja de ser fiable tras el primer hueco):`);
  for (const n of [...SIN_VERIFICAR].sort((a, b) => +a - +b))
    console.log(`      NCU${n}: layout ${nLay.get(n) || 0} seguidores · diagnóstico ${nDiag.get(n)}` +
                ` · ${det.filter(d => d.ncu === n).length} cruzados y marcados como dudosos`);
}

/* ── FIRMA DE DISPERSIÓN: la prueba binaria de qué hace la planta ──────────
   Con eje N-S, el ángulo ASTRONÓMICO es casi el mismo para toda la planta a
   cualquier hora (solo lo mueve el tilt N-S del eje, y a sol bajo ni eso). El
   bt3d, en cambio, ABRE los ángulos porque cada pareja tiene su pendiente: en
   Ayora, 0,4° a mediodía pero ~12° al ocaso.
   Así que basta contar cuántos ángulos DISTINTOS manda la planta y compararlo
   con lo que predice cada política. No hace falta comparar medianas: si a sol
   bajo la planta sigue mandando un valor único, está haciendo seguimiento
   GLOBAL y se está dejando el relieve sin corregir. */
{
  const objs = [...new Set(det.map(d => d.obj))].sort((a, b) => a - b);
  const rangoReal = objs.length ? objs[objs.length - 1] - objs[0] : 0;
  const rango = (k) => {
    const v = [];
    for (const [, p] of ang) for (const k2 of [k]) v.push(...p[k2]);
    v.sort((a, b) => a - b);
    return v.length ? v[v.length - 1] - v[0] : 0;
  };
  const rAstro = rango('astro'), rBt3d = rango('true3d');
  console.log(`\n  FIRMA: la planta manda ${objs.length} ángulo(s) distinto(s), rango ${rangoReal.toFixed(2)}°`);
  console.log(`         el modelo predice, entre líneas:  astro ${rAstro.toFixed(2)}°  ·  bt3d ${rBt3d.toFixed(2)}°`);
  if (rBt3d - rAstro < 1)
    console.log('         ⇒ a esta hora las dos firmas son iguales: NO distingue. Hace falta sol bajo.');
  else if (rangoReal < rAstro + (rBt3d - rAstro) * 0.25)
    console.log(`         ⇒ la planta hace seguimiento GLOBAL (un ángulo para todos): NO corrige el relieve.`);
  else if (rangoReal > rAstro + (rBt3d - rAstro) * 0.75)
    console.log('         ⇒ la planta ABRE los ángulos como el bt3d: sí corrige el relieve.');
  else
    console.log('         ⇒ dispersión INTERMEDIA: ni global ni bt3d pleno. Mirar el detalle.');
}

const at = det.filter(d => Math.abs(d.astro) > 2).sort((a, b) => Math.abs(b.astro) - Math.abs(a.astro));
console.log(`\n  atípicos |Δ|>2°: ${at.length} de ${det.length}`);
for (const a of at.slice(0, 10))
  console.log(`     NCU${a.ncu}/TCU${a.tcu}  obj=${a.obj}  tilt=${a.tilt}  Δastro=${f2(a.astro)}${a.dudosa ? '  (NCU sin verificar)' : ''}`);

if (seguro.length) {
  console.log(`\n  en POSICIÓN SEGURA (${seguro.length}) — mantenimiento, no modelo:`);
  for (const x of seguro.sort((a, b) => (+b.Edad_s || 0) - (+a.Edad_s || 0)))
    console.log(`     NCU${x.NCU}/TCU${x.TCU}  obj=${x.Objetivo}  tilt=${x.Tilt}  ${x.Salud}/${x.Modo}` +
                `  ${(+x.Edad_s > 3600) ? `mudo ${(x.Edad_s / 86400).toFixed(1)} días` : 'comunica'}` +
                `${Math.abs(+x.Tilt - +x.Objetivo) > 5 ? '  ⚠ está en el tope CONTRARIO al pedido' : ''}` +
                `  · ${x.Alarmas || ''}`);
}

// el sesgo del barrido, descartable con la edad de cada lectura
const ed = det.map(d => d.edad).filter(isFinite).sort((a, b) => a - b);
if (ed.length) {
  const sMed = stat(est.astro).mediana;
  console.log(`\n  edad de las lecturas: ${ed[0]}–${ed[ed.length - 1]} s (mediana ${ed[Math.floor(ed.length / 2)]} s).` +
    ` Sesgo mediano ${f2(sMed)}°: para explicarlo con el barrido harían falta` +
    ` ~${Math.abs(sMed / 0.28).toFixed(0)} min de retraso.`);
}

if (CSV) {
  const cab = ['planta', 'ncu', 'tcu', 'objetivo_deg', 'tilt_deg', 'dif_deg', 'edad_s', 'ncu_sin_verificar', ...POLS.map(k => 'd_' + k)];
  const filas = det.map(d => [PLANTA, d.ncu, d.tcu, d.obj, d.tilt, d.dif, d.edad, d.dudosa ? 1 : 0, ...POLS.map(k => d[k])]);
  fs.writeFileSync(path.resolve(CSV), cab.join(',') + '\n' + filas.map(f => f.join(',')).join('\n') + '\n');
  console.log(`\n  desviación por seguidor → ${CSV}`);
}
