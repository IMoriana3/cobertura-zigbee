/* R4 · FASE 5 — CAMPO: DE VERIFICADO A VALIDADO, SIN CAMPAÑA.
 *
 *   node audit4/F5_campo.mjs [--json=RUTA]
 *
 * Solo con datos QUE YA SE REGISTRAN. Lo que no está a mi alcance sale como
 * `NO DISPONIBLE` con qué haría falta y a quién pedirlo. No se inventa ninguna
 * ruta: si un fichero no está, no está.
 *
 * Cubre 5.1 (exactitud de seguimiento) y 5.4 (eventos de alto contraste).
 * 5.2, 5.3 y 5.5 se resuelven en el documento, porque la respuesta es que el
 * dato no existe en este repo — y eso también hay que medirlo, no suponerlo:
 * el barrido de patrones va aquí abajo con su control.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RAIZ || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'tools/fixture_ncu12');

/* ── lectura, con lo que se tira contado (mismo lector que 3.4) ───────────── */
function lee(f) {
  const crudo = fs.readFileSync(path.join(DIR, f));
  const lineas = crudo.toString('latin1').split('\n');
  const cab = lineas[0].trim().split(';');
  const filas = [], rotas = [];
  for (let i = 1; i < lineas.length; i++) {
    const L = lineas[i];
    if (!L.trim()) continue;
    if (L.includes('\u0000')) { rotas.push(i); continue; }
    const c = L.trim().split(';');
    if (c.length !== cab.length) { rotas.push(i); continue; }
    const o = {}; cab.forEach((k, j) => o[k] = c[j]);
    const t = Date.parse(o.datetime.replace(' ', 'T') + 'Z');
    const a = parseFloat(o.angle), g = parseFloat(o.target_angle);
    if (!Number.isFinite(t) || !Number.isFinite(a) || !Number.isFinite(g)) { rotas.push(i); continue; }
    filas.push({ t, a, g, e: o.main_state, seg: o.active_security_position, bt: o.backtracking === 'true',
                 a1: o.alarms_1, a2: o.alarms_2, hw: o.hw_alarms, mot: o.motor_state, soc: +o.soc });
  }
  return { filas, rotas, cab };
}

const FICH = fs.readdirSync(DIR).filter(f => /^TCU_\d+_.*\.csv$/.test(f)).sort();
const est = a => {
  const n = a.length, abs = a.map(Math.abs).sort((x, y) => x - y);
  return { n, mae: a.reduce((s, x) => s + Math.abs(x), 0) / n,
    rmse: Math.sqrt(a.reduce((s, x) => s + x * x, 0) / n),
    max: abs[n - 1], p95: abs[Math.min(n - 1, Math.floor(0.95 * n))],
    sesgo: a.reduce((s, x) => s + x, 0) / n };
};

console.log('R4 · FASE 5 — CAMPO\n');
console.log('FUENTE: tools/fixture_ncu12/ · 2026-08-07 · ' + FICH.length + ' TCU. Es lo ÚNICO que este repo');
console.log('registra con consigna Y posición medida a la vez.\n');

/* ═══ 5.1 · EXACTITUD DE SEGUIMIENTO ═══════════════════════════════════════
   error = `angle` − `target_angle`, CON SIGNO. Misma definición que
   `tracking_error` de `plant_feedback.py:179` (allí `tilt_angle` − `target`),
   y con sus mismas exclusiones: fuera lo que NO está siguiendo por decisión
   propia (OFF, posición de seguridad) y fuera lo que está en alarma, que es
   otra conversación y se cuenta aparte. */
console.log('═══ 5.1 · EXACTITUD DE SEGUIMIENTO ═══');
console.log('  error = angle − target_angle, con signo. Exclusiones: OFF, posición de seguridad, alarma.');
const enAlarma = f => !(f.a1 === '0' && f.a2 === '0' && f.hw === '0');
let totErr = [], totAl = [], nOff = 0, nSeg = 0, nAl = 0, nRot = 0, nTot = 0;
const porTcu = [];
for (const f of FICH) {
  const { filas, rotas } = lee(f);
  nRot += rotas.length; nTot += filas.length + rotas.length;
  const err = [], al = [];
  for (const r of filas) {
    if (r.e !== 'AUTO') { nOff++; continue; }
    if (r.seg !== '0') { nSeg++; continue; }
    if (enAlarma(r)) { nAl++; al.push(r.a - r.g); continue; }
    err.push(r.a - r.g);
  }
  totErr = totErr.concat(err); totAl = totAl.concat(al);
  porTcu.push({ tcu: f, ...est(err), alarmadas: al.length });
}
console.log(`\n  denominador: ${nTot} filas · ${nRot} corruptas · ${nOff} no-AUTO · ${nSeg} en seguridad · ${nAl} en alarma`);
console.log(`  utilizables: ${totErr.length}\n`);
console.log('  TCU                              n      MAE      RMSE      P95       máx     sesgo   (alarma)');
for (const m of porTcu)
  console.log(`  ${m.tcu.padEnd(28)} ${String(m.n).padStart(5)}  ${m.mae.toFixed(4).padStart(7)}° ${m.rmse.toFixed(4).padStart(8)}° ${m.p95.toFixed(4).padStart(8)}° ${m.max.toFixed(4).padStart(8)}° ${m.sesgo.toFixed(4).padStart(8)}°  ${String(m.alarmadas).padStart(5)}`);
const F = est(totErr);
console.log(`  ${'FLOTA'.padEnd(28)} ${String(F.n).padStart(5)}  ${F.mae.toFixed(4).padStart(7)}° ${F.rmse.toFixed(4).padStart(8)}° ${F.p95.toFixed(4).padStart(8)}° ${F.max.toFixed(4).padStart(8)}° ${F.sesgo.toFixed(4).padStart(8)}°  ${String(totAl.length).padStart(5)}`);
if (totAl.length) { const A = est(totAl); console.log(`  (las ${A.n} en alarma, aparte: MAE ${A.mae.toFixed(4)}° · máx ${A.max.toFixed(4)}°)`); }

/* CONTROL: si la métrica no supiera dar distinto, no diría nada. Las filas en
   posición de seguridad TIENEN que salir mucho peor — no están siguiendo. */
{
  const seg = [];
  for (const f of FICH) for (const r of lee(f).filas) if (r.seg !== '0') seg.push(r.a - r.g);
  const S = seg.length ? est(seg) : null;
  console.log(`\n  CONTROL · las ${nSeg} filas EXCLUIDAS por posición de seguridad: MAE ${S ? S.mae.toFixed(4) : '—'}°, máx ${S ? S.max.toFixed(4) : '—'}°`);
  console.log('    Si salieran como las otras, la exclusión no estaría excluyendo nada.');
}
console.log('\n  GRADO: **solo acotado**. El encoder mide el ACCIONAMIENTO, no la mesa — con rótula');
console.log('  o con bifila rota, la mesa puede estar en otro ángulo y esto no lo ve. Y es UN día');
console.log('  de UNA planta: no es una validación del seguimiento, es su cota superior medida.');

/* ═══ 5.4 · EVENTOS DE ALTO CONTRASTE ══════════════════════════════════════*/
console.log('\n═══ 5.4 · EVENTOS ÚTILES COMO ENSAYOS DE ALTO CONTRASTE ═══');
const ev = [];
for (const f of FICH) {
  const { filas } = lee(f);
  for (let i = 1; i < filas.length; i++) {
    const p = filas[i - 1], r = filas[i];
    if (p.e !== r.e) ev.push({ tcu: f, t: new Date(r.t).toISOString(), tipo: 'cambio de main_state', de: p.e, a: r.e, ang: r.a, cmd: r.g });
    if (p.seg !== r.seg) ev.push({ tcu: f, t: new Date(r.t).toISOString(), tipo: 'posición de seguridad', de: p.seg, a: r.seg, ang: r.a, cmd: r.g });
    if (enAlarma(p) !== enAlarma(r)) ev.push({ tcu: f, t: new Date(r.t).toISOString(), tipo: 'alarma', de: `${p.a1}/${p.a2}/${p.hw}`, a: `${r.a1}/${r.a2}/${r.hw}`, ang: r.a, cmd: r.g });
  }
}
const tipos = {}; for (const e of ev) tipos[e.tipo] = (tipos[e.tipo] || 0) + 1;
console.log(`  ${ev.length} transiciones en los ${FICH.length} ficheros:`);
for (const [k, v] of Object.entries(tipos)) console.log(`    · ${k}: ${v}`);
console.log('\n  los primeros de cada tipo, con el ángulo y la consigna del instante:');
for (const k of Object.keys(tipos)) {
  const e = ev.find(x => x.tipo === k);
  console.log(`    ${k.padEnd(24)} ${e.t} · ${e.tcu.slice(0, 7)} · ${e.de} → ${e.a} · θ ${e.ang} (consigna ${e.cmd})`);
}
const LOG = path.join(DIR, 'NCU_EVENT_LOG_2026-08-07.csv');
if (fs.existsSync(LOG)) {
  const l = fs.readFileSync(LOG, 'latin1').split('\n').filter(x => x.trim());
  console.log(`\n  Y el registro de eventos de la NCU: ${l.length} líneas (${path.relative(ROOT, LOG)}).`);
}
console.log('\n  GRADO: **solo acotado**. Hay eventos y están fechados, pero sin corriente de string');
console.log('  no se pueden usar como ensayo de contraste: no hay contra qué contrastar (ver 5.2).');

/* ═══ 5.2 / 5.3 · EL DATO QUE NO ESTÁ, MEDIDO ══════════════════════════════
   Decir «no hay corriente de string» sin haberlo buscado sería exactamente lo
   que esta auditoría persigue. Se barre, con su control. */
console.log('\n═══ 5.2 y 5.3 · ¿EXISTE CORRIENTE DE STRING EN ALGÚN DATO REGISTRADO? ═══');
const PAT = ['string_current', 'corriente_string', 'i_string', 'istring', 'current_string', 'amp_string', 'idc_', 'i_dc'];
const CTRL = 'motor_current';                     // existe seguro: está en la cabecera de las TCU
const vistos = [], aciertos = {}; let nCtrl = 0;
(function anda(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (['.git', 'node_modules', 'audit2', 'audit3'].includes(e.name)) continue;
  /* Y FUERA LA SALIDA DE ESTA MISMA SONDA. `audit4/out/F5_campo.json` guarda
     la LISTA DE PATRONES que se buscan, así que el barrido se encontraba a sí
     mismo y daba acierto en los ocho. Es el error E-X1 19 otra vez, con mi
     propia salida como rastro: el rastro no es la cosa. */
  const f = path.join(d, e.name);
  if (path.relative(ROOT, f) === path.join('audit4', 'out')) continue;
  if (e.isDirectory()) { anda(f); continue; }
  /* `continue`, NO `return`: con `return` la primera entrada que no fuera un
     fichero de dato abortaba el recorrido ENTERO del directorio y el barrido
     miraba CERO ficheros — publicando «ningún patrón encontrado» como si fuera
     una medida. Lo cazó el control de abajo, que salió a 0 donde tenía que dar
     un número grande (R4, error E-X1 29). La ausencia de señal no es señal. */
  if (!/\.(json|csv|geojson|jsonl)$/i.test(e.name)) continue;
  let t; try { t = fs.readFileSync(f, 'utf-8').toLowerCase(); } catch { continue; }
  vistos.push(f);
  if (t.includes(CTRL)) nCtrl++;
  for (const p of PAT) if (t.includes(p)) (aciertos[p] = aciertos[p] || []).push(path.relative(ROOT, f));
} })(ROOT);
console.log(`  ficheros de dato barridos: ${vistos.length}`);
console.log(`  CONTROL · el barrido no está ciego: «${CTRL}» aparece en ${nCtrl} fichero(s)`);
console.log(`  patrones de corriente de string encontrados: ${Object.keys(aciertos).length ? JSON.stringify(aciertos) : 'NINGUNO en los ' + PAT.length + ' patrones'}`);
console.log('\n  GRADO: **NO DISPONIBLE**. Sin corriente por string no hay 5.2 ni 5.3, y no se');
console.log('  sustituye por nada: un `nb` «medido» sobre una señal que no existe sería inventado.');

const dest = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({
    fuente: 'tools/fixture_ncu12', ficheros: FICH, dia: '2026-08-07',
    denominador: { filas: nTot, corruptas: nRot, no_auto: nOff, en_seguridad: nSeg, en_alarma: nAl, utilizables: totErr.length },
    por_tcu: porTcu, flota: F,
    eventos: { total: ev.length, por_tipo: tipos, muestra: ev.slice(0, 40) },
    corriente_string: { ficheros_barridos: vistos.length, control_motor_current: nCtrl, aciertos, patrones: PAT },
  }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
