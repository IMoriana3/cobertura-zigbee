/* CRUCE DE UN DÍA ENTERO DE UNA NCU CONTRA EL SIMULADOR.

   Uso:
     node tools/cruce_ncu_dia.mjs <dir_con_los_CSV> --planta ayora --ncu 12
     node tools/cruce_ncu_dia.mjs /tmp/ncu12 --planta ayora --ncu 12 --csv /tmp/out.csv

   QUÉ CONTESTA, Y POR QUÉ HACÍA FALTA UN DÍA ENTERO DE UNA NCU.
   El volcado de diagnóstico de un instante valida identidad, geometría y
   convenios, pero NO discrimina la política: con sol alto no hay sombra que
   evitar y todas las políticas mandan casi el mismo ángulo. Lo que separa una
   política de otra es la DISPERSIÓN entre seguidores durante el backtracking:
   en seguimiento puro todos apuntan igual, y en backtracking cada uno tiene
   que corregir SU vecina. Por eso hace falta la NCU entera (una TCU sola no
   tiene con quién dispersarse) y el día entero (las puntas son las que
   deciden).

   LA APERTURA es la medida: p95 − p5 de `target_angle` entre los seguidores
   vivos en ese instante. Es ciega al modelo — no compara contra ninguna
   simulación, así que no puede heredar sus errores.

   LAS DOS PREGUNTAS QUE SE CONTESTAN POR SEPARADO:

   a) ¿La planta hace backtracking, y coordinado? -> la firma de apertura.
      Sale del propio volcado, sin tocar el simulador.

   b) ¿Lo hace como nuestro modelo cree? -> el careo del `target_angle`
      mediano contra las políticas. Aquí sí entra el simulador, y por eso se
      publica aparte: si (a) sale y (b) no, el hallazgo es del modelo.

   LO QUE SE APARTA ANTES DE MEDIR, y por qué:
     · lo que no está en AUTO — no sigue consigna, compararlo es ruido;
     · lo que está en posición de seguridad (`active_security_position`) o con
       SoC bajo — tampoco sigue al sol;
     · los ficheros cuyo número de TCU excede el censo de la NCU en el layout:
       no son seguidores de este parque (en Ayora NCU12, TCU_200 y TCU_201).
   Todo lo apartado se CUENTA y se dice. Un seguidor mudo o parado es un
   hallazgo de mantenimiento, no un dato que se tira en silencio.

   EL HUSO se deduce y hay que ganarlo con margen: se busca el desplazamiento
   que mejor alinea el cruce por cero del objetivo mediano con el mediodía
   solar calculado. Si dos husos empatan, esto ABORTA en vez de elegir.       */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = argv.find(a => !a.startsWith('--') && !argv[argv.indexOf(a) - 1]?.startsWith('--'));
const PLANTA = arg('planta', 'ayora');
const NCU = +arg('ncu', '12');
const PASO = +arg('paso', '5');                    // minutos de la rejilla
if (!DIR || !fs.existsSync(DIR)) { console.error('falta el directorio con los CSV'); process.exit(2); }

/* ── física del simulador, sin duplicarla ────────────────────────────────── */
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8');
const F = new Function(_sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) +
  ';return {solarPos,clearskyIneichen,policyAngles,poaPlant,plantFromCotas,slewLimit};')();

const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_layout.json'), 'utf-8'));
const LAT = +lay.clat, LON = +lay.clon, ALT = +cotas.base || 0;
const censo = lay.trackers.filter(t => t.ncu === NCU).length;
if (!censo) { console.error('la NCU ' + NCU + ' no existe en el layout'); process.exit(2); }

/* ── lectura de los CSV ──────────────────────────────────────────────────── */
const q = (a, f) => { const v = a.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))]; };
const med = a => q(a, 0.5);

const ficheros = fs.readdirSync(DIR).filter(f => /^TCU_(\d+)_.*\.csv$/i.test(f));
const serie = new Map();                        // tcu -> Map(minuto de rejilla -> muestra)
const fuera = [];
let FECHA = null, nFilas = 0;
for (const f of ficheros) {
  const tcu = +f.match(/^TCU_(\d+)_/i)[1];
  if (tcu > censo) { fuera.push(tcu); continue; }   // no es seguidor de esta NCU
  const txt = fs.readFileSync(path.join(DIR, f), 'utf-8').trim().split('\n');
  const cab = txt[0].split(';').map(s => s.trim());
  const ix = n => cab.indexOf(n);
  const iT = ix('datetime'), iM = ix('main_state'), iB = ix('backtracking'),
        iA = ix('angle'), iG = ix('target_angle'), iS = ix('soc'), iP = ix('active_security_position');
  if (iT < 0 || iG < 0) { console.error('el fichero ' + f + ' no trae datetime/target_angle'); process.exit(2); }
  const g = new Map();
  for (let r = 1; r < txt.length; r++) {
    const c = txt[r].split(';');
    const dt = c[iT]; if (!dt) continue;
    if (!FECHA) FECHA = dt.slice(0, 10);
    const hh = +dt.slice(11, 13), mi = +dt.slice(14, 16);
    const k = Math.floor((hh * 60 + mi) / PASO) * PASO;
    g.set(k, { main: c[iM], bt: c[iB] === 'true', ang: +c[iA], tgt: +c[iG],
               soc: +c[iS], seg: iP >= 0 ? +c[iP] : 0 });   // última muestra del tramo
    nFilas++;
  }
  serie.set(tcu, g);
}
if (!serie.size) { console.error('no encontré ficheros TCU_*.csv en ' + DIR); process.exit(2); }

/* ── huso: se GANA, no se supone ─────────────────────────────────────────── */
// mediodía solar = cuando el objetivo mediano cruza cero. Se compara con el
// mediodía solar calculado y se elige el desplazamiento entero que mejor casa.
const rejilla = [];
for (let m = 0; m < 1440; m += PASO) rejilla.push(m);
const medianaTgt = new Map();
for (const m of rejilla) {
  const v = [];
  for (const [, g] of serie) { const s = g.get(m); if (s && s.main === 'AUTO' && isFinite(s.tgt)) v.push(s.tgt); }
  if (v.length >= 5) medianaTgt.set(m, med(v));
}
let cruce = null, prev = null;
for (const m of rejilla) {
  const y = medianaTgt.get(m); if (y == null) continue;
  if (prev && prev.y < 0 && y >= 0) { cruce = prev.m + PASO * (-prev.y) / (y - prev.y); break; }
  prev = { m, y };
}
// mediodía solar real, en minutos UTC
let mejorUTC = null, mejorErr = 1e9;
for (let m = 0; m < 1440; m++) {
  const g = F.solarPos(Date.UTC(+FECHA.slice(0, 4), +FECHA.slice(5, 7) - 1, +FECHA.slice(8, 10), 0, m), LAT, LON);
  const e = Math.abs(((g.az % 360) + 360) % 360 - 180);
  if (g.elev > 0 && e < mejorErr) { mejorErr = e; mejorUTC = m; }
}
const husos = [];
for (let h = -12; h <= 14; h++) husos.push({ h, err: cruce == null ? NaN : Math.abs(cruce - (mejorUTC + h * 60)) });
husos.sort((a, b) => a.err - b.err);
const HUSO = husos[0].h, margen = husos[1].err - husos[0].err;


/* ── EL LOG DE EVENTOS, que es lo que separa un fallo de un operario ──────
   La mañana del 7-ago-2026 en Ayora, los seguidores apuntaban al tope OESTE
   con el sol saliendo por el este. Parecía un defecto de control grave. Era
   `admin` ejerciendo la planta por sus posiciones de seguridad desde la web:
   posición 7 a las 06:28, posición 1 a las 07:23, liberada a las 07:47.
   Una herramienta que juzga el comportamiento de una planta SIN leer su log
   de eventos acaba culpando a la planta de lo que hizo una persona. */
const evFile = fs.readdirSync(DIR).find(f => /EVENT_LOG/i.test(f));
const humanos = [];
if (evFile) {
  for (const l of fs.readFileSync(path.join(DIR, evFile), 'utf-8').trim().split('\n')) {
    const i = l.indexOf(';'); if (i < 0) continue;
    const t = l.slice(0, i), txt = l.slice(i + 1);
    if (!/by "|web interface/i.test(txt)) continue;      // solo lo que hizo una persona
    if (/Requesting safe position/i.test(txt)) continue;  // consecuencia, no acción
    humanos.push({ t, txt });
  }
}

/* ── informe ─────────────────────────────────────────────────────────────── */
const L = [];
L.push('CRUCE DE UN DÍA · ' + PLANTA.toUpperCase() + ' · NCU ' + NCU + ' · ' + FECHA);
L.push('  ' + serie.size + ' seguidores con datos de ' + censo + ' que declara el layout · ' +
  nFilas.toLocaleString('es') + ' muestras · rejilla ' + PASO + ' min');
if (fuera.length) L.push('  apartados por no ser seguidores de esta NCU (nº > censo): TCU ' + fuera.join(', '));
const faltan = [];
for (let k = 1; k <= censo; k++) if (!serie.has(k)) faltan.push(k);
if (faltan.length) L.push('  SIN DATOS en el volcado: TCU ' + faltan.join(', ') + ' (' + faltan.length + ' de ' + censo + ')');
L.push('');
L.push('  HUSO deducido: UTC' + (HUSO >= 0 ? '+' : '') + HUSO +
  '  (mediodía solar calculado ' + String(Math.floor(mejorUTC / 60)).padStart(2, '0') + ':' +
  String(mejorUTC % 60).padStart(2, '0') + ' UTC · el objetivo mediano cruza cero a las ' +
  (cruce == null ? '—' : String(Math.floor(cruce / 60)).padStart(2, '0') + ':' + String(Math.round(cruce % 60)).padStart(2, '0')) + ')');
if (!isFinite(margen) || margen < 30) {
  L.push('  ABORTA: el huso no gana con margen (segundo candidato a ' + margen.toFixed(0) + ' min).');
  console.log(L.join('\n')); process.exit(1);
}
L.push('  gana por ' + margen.toFixed(0) + ' min sobre el siguiente candidato.');
L.push('');

L.push('');
if (evFile) {
  if (!humanos.length) L.push('  log de eventos: sin intervenciones humanas en el día.');
  else {
    const t0 = humanos[0].t.slice(11, 16), t1 = humanos[humanos.length - 1].t.slice(11, 16);
    L.push('  LOG DE EVENTOS: ' + humanos.length + ' intervenciones HUMANAS entre las ' + t0 + ' y las ' + t1 + '.');
    const pos = humanos.filter(h => /Position \d+ enabled/i.test(h.txt));
    if (pos.length) {
      const cuales = [...new Set(pos.map(h => (h.txt.match(/Position (\d+)/i) || [])[1]))];
      L.push('    posiciones de seguridad ' + cuales.join(', ') + ' activadas a mano en ' + pos.length + ' grupos');
      L.push('    → esos pasos NO son comportamiento de la TCU y quedan fuera de la firma');
    }
    for (const h of humanos.slice(0, 3)) L.push('    ' + h.t.slice(11, 19) + '  ' + h.txt.slice(0, 86));
    if (humanos.length > 3) L.push('    … y ' + (humanos.length - 3) + ' más');
  }
} else {
  L.push('  SIN log de eventos en el volcado: no puedo distinguir un fallo de la planta');
  L.push('  de una maniobra de un operario. Pídelo antes de concluir nada raro.');
}

/* ── (a) LA FIRMA: apertura, ciega al modelo ─────────────────────────────── */
L.push('(a) FIRMA DE DISPERSIÓN — sale del volcado, sin tocar el simulador');
L.push('');
L.push('  hora     sol   n   bandera   θ mediana   APERTURA   régimen medido');
const filas = [];
for (const m of rejilla) {
  const g = F.solarPos(Date.UTC(+FECHA.slice(0, 4), +FECHA.slice(5, 7) - 1, +FECHA.slice(8, 10), 0, m), LAT, LON);
  const v = [], flags = [];
  let nAuto = 0, nSeg = 0, nOff = 0;
  for (const [, s2] of serie) {
    const s = s2.get(m); if (!s) continue;
    if (s.main !== 'AUTO') { nOff++; continue; }
    if (s.seg) { nSeg++; continue; }
    nAuto++; if (isFinite(s.tgt)) v.push(s.tgt);
    flags.push(s.bt);
  }
  if (v.length < 5) continue;
  const ap = q(v, 0.95) - q(v, 0.05);
  const bt = flags.filter(Boolean).length / Math.max(1, flags.length);
  filas.push({ m, elev: g.elev, n: nAuto, nSeg, nOff, tgt: med(v), ap, bt, v });
}
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const local = m => hhmm(m);   // el reloj DEL FICHERO, que es el que se compara
for (const f of filas) {
  if (f.m % 30) continue;
  const reg = Math.abs(f.tgt) > 54.5 ? 'TOPE' : f.ap > 1 ? 'BACKTRACKING' : 'seguimiento puro';
  L.push('  ' + local(f.m) + '  ' + f.elev.toFixed(1).padStart(5) + '°' + String(f.n).padStart(4) +
    (f.bt > 0.5 ? '    BT   ' : '    —    ') + f.tgt.toFixed(2).padStart(9) + '°' +
    f.ap.toFixed(2).padStart(10) + '°   ' + reg);
}
const conBT = filas.filter(f => f.bt > 0.5), sinBT = filas.filter(f => f.bt <= 0.5 && Math.abs(f.tgt) <= 54.5);
const mm2 = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
L.push('');
L.push('  con bandera BACKTRACKING:  ' + String(conBT.length).padStart(3) + ' pasos · apertura media ' +
  mm2(conBT.map(f => f.ap)).toFixed(2) + '° · máx ' + (conBT.length ? Math.max(...conBT.map(f => f.ap)).toFixed(2) : '—') + '°');
L.push('  sin bandera (seguimiento): ' + String(sinBT.length).padStart(3) + ' pasos · apertura media ' +
  mm2(sinBT.map(f => f.ap)).toFixed(2) + '° · máx ' + (sinBT.length ? Math.max(...sinBT.map(f => f.ap)).toFixed(2) : '—') + '°');
const razon = mm2(conBT.map(f => f.ap)) / Math.max(1e-9, mm2(sinBT.map(f => f.ap)));
L.push('');
/* El veredicto NO puede ser una RAZÓN a secas. El registro `target_angle`
   viene cuantizado a 0,1°, así que una apertura de 0,07° contra otra de 0,01°
   da «×9» y no significa nada: los dos números están en el suelo de
   resolución. Con la fixture de 6 seguidores esto llegó a declarar
   «backtracking COORDINADO» en una planta que reparte el MISMO ángulo a
   todos — o sea, una conclusión falsa sobre la planta, que es justo lo que
   esta herramienta existe para no producir.
   Hace falta un SUELO ABSOLUTO: para hablar de dispersión, la apertura tiene
   que despegar de la resolución. El modelo predice 6-13° cuando las
   pendientes están configuradas, así que 1° es un umbral holgado. */
const RESOL = 0.1;                       // resolución del registro, en grados
const SUELO = 1.0;                       // por debajo no hay dispersión que medir
const apBT = mm2(conBT.map(f => f.ap));
if (!conBT.length) {
  L.push('  VEREDICTO (a): la bandera de backtracking no se levanta en ningún paso con');
  L.push('  seguidores en AUTO. No se puede medir la firma.');
} else if (apBT < SUELO) {
  L.push('  VEREDICTO (a): la apertura durante el backtracking es de ' + apBT.toFixed(2) +
    '°, por debajo del');
  L.push('  suelo de ' + SUELO.toFixed(1) + '° — y el registro sólo resuelve ' + RESOL.toFixed(1) +
    '°. NO hay dispersión medible:');
  L.push('  todos los seguidores reciben el MISMO ángulo. La planta backtrackea PLANO,');
  L.push('  sin corregir el relieve seguidor a seguidor.');
  L.push('  (la razón contra el seguimiento sale ×' + razon.toFixed(1) + ', pero es ruido de');
  L.push('   cuantización dividido por ruido de cuantización: no se concluye de ahí.)');
} else if (razon > 5) {
  L.push('  VEREDICTO (a): los seguidores SE ABREN ×' + razon.toFixed(0) + ' cuando la TCU declara');
  L.push('  backtracking. Es backtracking COORDINADO: cada seguidor apunta distinto, que es');
  L.push('  lo que exige corregir la vecina de cada uno.');
} else {
  L.push('  VEREDICTO (a): la apertura durante el backtracking (×' + razon.toFixed(1) + ') NO se separa');
  L.push('  de la del seguimiento. Todos apuntan casi igual: la planta backtrackea PLANO,');
  L.push('  sin corregir relieve seguidor a seguidor.');
}

/* ── (b) EL CAREO contra las políticas ───────────────────────────────────── */
const idx = new Set(lay.trackers.map((t, i) => t.ncu === NCU ? i : -1).filter(i => i >= 0));
const sub = Object.assign({}, cotas, { t: cotas.t.filter((_, i) => idx.has(i)) });
let P = null;
try { P = F.plantFromCotas(sub, 500, null); } catch (e) { /* sin geometría */ }
L.push('');
L.push('(b) CAREO contra las políticas del simulador (geometría medida de esta NCU)');
if (!P) { L.push('  no pude construir la geometría de la NCU: se omite.'); }
else {
  const mkT = conPend => {
    const pairs = [];
    for (let i = 0; i < P.lineX.length - 1; i++) {
      const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
      pairs.push({ slope: conPend ? Math.atan2(P.pairDz[i], dx) * 180 / Math.PI : 0,
                   pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
    }
    return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
             nBypass: 2, iam: 0.05, rowTilt: P.tilt, groups: P.groups, drive: 'bifila',
             segs: P.segs, real: P };
  };
  const Treal = mkT(true), T0 = mkT(false);
  L.push('  ' + P.lineX.length + ' líneas · ' + P.nFilas + ' filas · registros a CERO = T0');
  L.push('');
  L.push('  hora     sol    planta   astro   sin cfg   con cfg    bt3d   |  mejor');
  const doy = Math.round((Date.UTC(+FECHA.slice(0, 4), +FECHA.slice(5, 7) - 1, +FECHA.slice(8, 10)) -
    Date.UTC(+FECHA.slice(0, 4), 0, 1)) / 86400000) + 1;
  const err = { astro: [], cero: [], cfg: [], tri: [] };
  for (const f of filas) {
    const g = F.solarPos(Date.UTC(+FECHA.slice(0, 4), +FECHA.slice(5, 7) - 1, +FECHA.slice(8, 10), 0, f.m), LAT, LON);
    if (g.elev <= 0) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, 3.5);
    const pol = {
      astro: F.policyAngles('astro', g.zen, g.az, T0, irr, doy, 0.20).angles,
      cero: F.policyAngles('pairwise', g.zen, g.az, T0, irr, doy, 0.20).angles,
      cfg: F.policyAngles('pairwise', g.zen, g.az, Treal, irr, doy, 0.20).angles,
      tri: F.policyAngles('true3d', g.zen, g.az, Treal, irr, doy, 0.20).angles,
    };
    const m2 = {};
    for (const k in pol) { const a = pol[k].filter(isFinite); m2[k] = a.length ? med(a) : NaN; }
    // el simulador va en θ interno; la TCU publica θ<0 = este -> mismo signo
    for (const k in m2) if (isFinite(m2[k])) err[k].push(Math.abs(-m2[k] - f.tgt));
    if (f.m % 30) continue;
    const cand = Object.keys(m2).filter(k => isFinite(m2[k]));
    const mejor = cand.sort((a, b) => Math.abs(-m2[a] - f.tgt) - Math.abs(-m2[b] - f.tgt))[0];
    L.push('  ' + local(f.m) + '  ' + g.elev.toFixed(1).padStart(5) + '°' + f.tgt.toFixed(2).padStart(9) + '°' +
      cand.slice(0, 4).map(() => '').join('') +
      [m2.astro, m2.cero, m2.cfg, m2.tri].map(v => isFinite(v) ? (-v).toFixed(2).padStart(9) : '        —').join('') +
      '  |  ' + mejor);
  }
  L.push('');
  L.push('  desviación mediana contra el objetivo real de la planta:');
  for (const k of ['astro', 'cero', 'cfg', 'tri'])
    if (err[k].length) L.push('     ' + k.padEnd(6) + ' ' + med(err[k]).toFixed(2) + '°   (p90 ' + q(err[k], 0.9).toFixed(2) + '°)');
  const ganador = ['astro', 'cero', 'cfg', 'tri'].filter(k => err[k].length)
    .sort((a, b) => med(err[a]) - med(err[b]));
  if (ganador.length >= 2) {
    const d = med(err[ganador[1]]) - med(err[ganador[0]]);
    L.push('');
    L.push('  VEREDICTO (b): la política que mejor explica lo que hace la planta es ' +
      '«' + ganador[0] + '»' + (d < 0.3 ? ', pero gana por solo ' + d.toFixed(2) +
      '°: NO discrimina, no se puede concluir de aquí.' : ', por ' + d.toFixed(2) + '° sobre la siguiente.'));
  }
}
console.log(L.join('\n'));

if (argv.includes('--csv')) {
  const out = arg('csv', '/tmp/cruce_' + PLANTA + '_ncu' + NCU + '_' + FECHA + '.csv');
  const R = ['planta,ncu,fecha,hora_utc,hora_local,elev_sol,n_auto,n_seguridad,n_no_auto,bandera_bt,theta_mediana,apertura_p95_p5'];
  for (const f of filas)
    R.push([PLANTA, NCU, FECHA, hhmm(f.m), local(f.m), f.elev.toFixed(2), f.n, f.nSeg, f.nOff,
            f.bt > 0.5 ? 1 : 0, f.tgt.toFixed(2), f.ap.toFixed(2)].join(','));
  fs.writeFileSync(out, R.join('\n') + '\n');
  console.log('\n  csv → ' + out + '  (' + filas.length + ' pasos)');
}
