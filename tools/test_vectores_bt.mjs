#!/usr/bin/env node
/* PASO 4.2 · VECTORES CONGELADOS DEL BT, con sha256.

     node tools/test_vectores_bt.mjs                       comprueba
     node tools/test_vectores_bt.mjs --regenerar "motivo"   reescribe y DECLARA

   Qué se congela: para cada caso × instante × política, la CONSIGNA que ejecuta la
   página (`segCmd` cortado de backtracking.html: por mesa donde la página va por
   mesa, por línea donde va por línea) y lo que se COBRA con ella (`poaPlantSeg`
   con mesas, `poaPlant` sin ellas), redondeados a 1e-9. Es el canon del paso 4:
   el contrato (audit5/CONTRATO_BT.md) dice QUÉ se publica; esto dice CUÁNTO vale.

   Casos (encargo del titular, 4.2), cada uno con lo que cubre:
     · torsion_mono         — torsión N-S con MÁS de dos valores (−4 … +5°), mono;
     · bifila_rigida        — la misma, bifila rígida (el grupo promedia el tilt,
                              `effRowTilts`, backtracking.html:744);
     · quebrada_preset      — la misma, quebrada (cardan: mismo θ, tilt local);
     · eje_20               — un bloque con OTRO azimut de eje (20°). Sintético a
                              propósito: la página fija axaz=0 al cargar una
                              planta real (backtracking.html:4858), así que no hay
                              bloque real con otro azimut — hueco del contrato;
     · ayora_b0 / ayora_b1  — planta irregular real, dos bloques: líneas de largo
                              distinto, extremos escalonados y retranqueos, bifila;
     · sanjose_b0           — planta real QUEBRADA.
   Instantes: 21-jun 05:00, 07:30, 12:00 y 21-dic 08:15, 12:00, 15:30 UTC en el
   sitio de Ayora — sol bajo (3-8°) y alto (~70°).

   El banco cae si la página da otra cosa que los vectores Y no se ha declarado:
   `--regenerar` exige un MOTIVO y lo apunta en `tools/vectores_bt/CAMBIOS.json`
   con el sha del manifiesto nuevo; el banco exige que la última entrada de
   CAMBIOS lleve el sha del manifiesto vigente (un vector cambiado a mano, o un
   manifiesto reescrito sin declarar, lo pone rojo).
   CONTROL NEGATIVO: una perturbación de 1e-6° en una sola consigna tiene que
   cambiar el sha del caso; si no lo cambia, el redondeo se come diferencias. */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from '../audit5/lib_simulador.mjs';
import { rutasAnuales } from '../audit5/lib_anual_pagina.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'tools', 'vectores_bt');
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const { F, VER } = cargaSimulador(ROOT, ['poaPlant', 'poaPlantSeg', 'effRowTilts', 'driveGroups'], () => html);
const P = rutasAnuales(ROOT, html).F;
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const POL = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
const ALB = 0.2, ALT = 739, TL = 3.5;
const INST = [[5, 21, 5, 0], [5, 21, 7, 30], [5, 21, 12, 0], [11, 21, 8, 15], [11, 21, 12, 0], [11, 21, 15, 30]];
const r9 = v => Math.round(v * 1e9) / 1e9;

function preset(nombre, drive, axisAz = 0) {
  const slopes = [3, -2, 4, 1, -3, 2, 0], tilt = [-4, -2.5, 0, 1.5, 3, 5, 2, -1];
  const groups = F.driveGroups(tilt.length, drive), eff = F.effRowTilts(tilt, drive, groups);
  const pairs = slopes.map((s, i) => ({ slope: s, pitch: 6, axisTilt: (eff[i] + eff[i + 1]) / 2 }));
  return { nombre, T: { pairs, cw: 2.382, axisAz, maxAngle: 55, gcr: 2.382 / 6, z0: 0.17, nBypass: 2, iam: 0.05,
                        rowTilt: eff, groups, drive } };
}
function real(nombre, fichero, bloque) {
  const datos = JSON.parse(fs.readFileSync(path.join(ROOT, fichero), 'utf-8'));
  return { nombre, T: terrenoComoLaPagina(F, datos, 10, bloque).T };
}
const CASOS = [preset('torsion_mono', 'mono'), preset('bifila_rigida', 'bifila'), preset('quebrada_preset', 'quebrado'),
               preset('eje_20', 'mono', 20), real('ayora_b0', 'ayora_cotas.json', 0), real('ayora_b1', 'ayora_cotas.json', 1),
               real('sanjose_b0', 'sanjose_cotas.json', 0)];

function calcula({ nombre, T }) {
  const conMesas = !!(T.segTilt && T.segs);
  const out = { caso: nombre, VER, mesas: conMesas ? T.segs.flat().length : 0, lineas: T.pairs.length + 1,
    entrada: { pairs: T.pairs.map(p => [r9(p.slope), r9(p.pitch), r9(p.axisTilt)]), axisAz: T.axisAz, drive: T.drive,
               rowTilt: T.rowTilt.map(r9), groups: T.groups }, instantes: [] };
  for (const [mo, d, h, mi] of INST) {
    const doy = F.doyOf(`2026-${String(mo + 1).padStart(2, '0')}-${d}`);
    const g = F.solarPos(Date.UTC(2026, mo, d, h, mi), lay.clat, lay.clon);
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL), I = { utc: `${d}/${mo + 1} ${h}:${String(mi).padStart(2, '0')}`,
      zen: r9(g.zen), az: r9(g.az), pol: {} };
    for (const k of POL) {
      // la ruta que EJECUTA la página (R-1): con mesas, `segCmd`; sin ellas,
      // `policyAngles` — `segsBroadcast` sin `segs` devuelve [] (:2651-2653)
      const cmd = conMesas ? P.segCmd(k, g.zen, g.az, T, T, irr, doy, ALB) : F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles;
      const cobro = conMesas ? F.poaPlantSeg(g.zen, g.az, T, cmd, irr, doy, ALB).plant
                             : F.poaPlant(g.zen, g.az, T, cmd, irr, doy, ALB).plant;
      I.pol[k] = { consigna: conMesas ? cmd.map(l => l.map(r9)) : cmd.map(r9), cobro_Wm2: r9(cobro) };
    }
    out.instantes.push(I);
  }
  return out;
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const ser = o => JSON.stringify(o);
const regen = process.argv.indexOf('--regenerar');
const t0 = Date.now();
const vect = CASOS.map(c => calcula(c));
if (regen >= 0) {
  const motivo = process.argv[regen + 1];
  if (!motivo || motivo.startsWith('--') || motivo.length < 15) { console.log('FALLO: --regenerar exige un MOTIVO de al menos 15 caracteres'); process.exit(1); }
  fs.mkdirSync(DIR, { recursive: true });
  const man = { VER, casos: {} };
  for (const v of vect) { const s = ser(v); fs.writeFileSync(path.join(DIR, v.caso + '.json'), s); man.casos[v.caso] = sha(s); }
  const sMan = ser(man); fs.writeFileSync(path.join(DIR, 'MANIFIESTO.json'), sMan);
  const cf = path.join(DIR, 'CAMBIOS.json'), cambios = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf-8')) : [];
  cambios.push({ fecha: new Date().toISOString().slice(0, 10), VER, motivo, sha_manifiesto: sha(sMan) });
  fs.writeFileSync(cf, JSON.stringify(cambios, null, 1) + '\n');
  console.log(`regenerados ${vect.length} casos · manifiesto ${sha(sMan).slice(0, 16)} · declarado en CAMBIOS.json: «${motivo}»`);
  process.exit(0);
}
let fallos = 0, n = 0;
const ok = (c, m) => { n++; console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };
console.log(`VECTORES CONGELADOS DEL BT · ${VER} · ${CASOS.length} casos × ${INST.length} instantes × ${POL.length} políticas`);
const manF = path.join(DIR, 'MANIFIESTO.json');
if (!fs.existsSync(manF)) { console.log('FALLO: no hay vectores (tools/vectores_bt/MANIFIESTO.json)'); process.exit(1); }
const sMan = fs.readFileSync(manF, 'utf-8'), man = JSON.parse(sMan);
const cambios = JSON.parse(fs.readFileSync(path.join(DIR, 'CAMBIOS.json'), 'utf-8'));
ok(cambios.length && cambios[cambios.length - 1].sha_manifiesto === sha(sMan),
   `el manifiesto vigente está DECLARADO (última entrada de CAMBIOS.json: «${cambios.at(-1)?.motivo}»)`);
for (const [caso, h] of Object.entries(man.casos)) {
  const s = fs.readFileSync(path.join(DIR, caso + '.json'), 'utf-8');
  ok(sha(s) === h, `${caso}: el fichero congelado es el del manifiesto (sha ${h.slice(0, 12)})`);
}
ok(Object.keys(man.casos).length === CASOS.length && CASOS.every(c => man.casos[c.nombre]), `los ${CASOS.length} casos del banco son los del manifiesto (ni sobra ni falta ninguno)`);
for (const v of vect) {
  const h = sha(ser(v));
  if (h === man.casos[v.caso]) { ok(true, `${v.caso}: la página reproduce los vectores (${v.lineas} líneas${v.mesas ? ` · ${v.mesas} mesas` : ''})`); continue; }
  const viejo = JSON.parse(fs.readFileSync(path.join(DIR, v.caso + '.json'), 'utf-8')), dif = [];
  v.instantes.forEach((I, i) => POL.forEach(k => { if (ser(I.pol[k]) !== ser(viejo.instantes[i]?.pol[k])) dif.push(`${I.utc} ${k}`); }));
  ok(false, `${v.caso}: la página ya NO da los vectores congelados — ${dif.length} celdas: ${dif.slice(0, 6).join(', ')}${dif.length > 6 ? '…' : ''}. Si es a propósito: --regenerar "motivo"`);
}
const nFin = (html.match(/\/\* FIN-FÍSICA/g) || []).length, nIni = (html.match(/FÍSICA PURA —/g) || []).length;
ok(nFin === 1 && nIni === 1, `INVARIANTE 5: un solo «/* FIN-FÍSICA» (${nFin}) y un solo «FÍSICA PURA —» (${nIni}) — produccion.html corta por el primero y los bancos por el último`);
const v0 = JSON.parse(ser(vect[0])); const c0 = v0.instantes[1].pol.pairwise.consigna; c0[0] = r9(c0[0] + 1e-6);   // torsion_mono: sin mesas, una consigna por línea
ok(sha(ser(v0)) !== man.casos[vect[0].caso], 'CONTROL NEGATIVO: 1e-6° en una sola consigna cambia el sha del caso');
console.log(fallos ? `\n${fallos} FALLO(S) de ${n}` : `\nTODO OK — ${n} comprobaciones · ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fallos ? 1 : 0);
