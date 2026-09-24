/* BT3D · BANCO DE LOS PARÁMETROS DECLARADOS Y DEL ENUMERADOR. Sale 1 si falla algo.
 *
 *   node audit5/F0_escenas.mjs && node audit5/test_parametros.mjs
 *
 * Tres cosas no pueden divergir sin que esto caiga:
 *   A · lo que resuelven de `bt3d_parametros.json` el lado JS y el Python;
 *   B · lo declarado y lo que el SIMULADOR usa para lo mismo (θmáx, rejilla,
 *       techo de haz, margen de rango, z0, nb, cuerda, signo de τ);
 *   C · el rango por unidad (copia Python de `rangoHaz`) y el del simulador;
 *   D · el enumerador por envolvente JS y el Python;
 *   E · el enumerador y el MOTOR: ningún par con sombra real a θ aleatorios puede
 *       faltar en la envolvente.
 * Cada comprobación lleva su control negativo: una mutación que TIENE que
 * ponerla roja. Una que siga verde con la mutación no protege nada.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cargar, resolver, canon, rho } from './lib_parametros.mjs';
import { pares } from './lib_envolvente.mjs';
import { vectorSol, caraMesa, sombraSobre, marcoMesa } from './lib_proyeccion.mjs';
import { createHash } from 'node:crypto';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const P = cargar();
let ok = 0, ko = 0;
const t = (n, f) => { try { const r = f(); ok++; console.log(`OK   ${n}${r ? ' · ' + r : ''}`); } catch (e) { ko++; console.log(`FAIL ${n} -> ${e.message}`); } };
const debe = (c, m) => { if (!c) throw new Error(m); };
const py = (args, env = {}) => execFileSync('python3', args, { cwd: ROOT, encoding: 'utf-8', env: { ...process.env, ...env }, maxBuffer: 1 << 26 });
const ESC = pl => JSON.parse(fs.readFileSync(path.join(ROOT, `audit5/out/escenas/${pl}.json`), 'utf-8'));
const E = { ayora: ESC('ayora'), fayon: ESC('fayon') };
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');

/* ── A · JS y Python resuelven lo mismo ─────────────────────────────────── */
for (const pl of ['ayora', 'fayon']) {
  const ids = E[pl].unidades.map(u => u.id);
  t(`A · ${pl}: el texto canónico JS = el Python en las ${ids.length} unidades`, () => {
    const j = canon(resolver(P, pl, ids)), p = py(['-m', 'bt3d.parametros', pl, ...ids]);
    debe(j === p, `difieren:\nJS ${j.split('\n')[0]}\nPY ${p.split('\n')[0]}`);
    return `${j.length} caracteres`;
  });
}
t('A · CONTROL NEGATIVO: con una copia del fichero con la banda muerta a 0,2 solo para Python, el careo CAE', () => {
  const tmp = path.join(os.tmpdir(), `bt3d_par_${process.pid}.json`), Q = JSON.parse(JSON.stringify(P));
  Q.banda_muerta_deg = 0.2; fs.writeFileSync(tmp, JSON.stringify(Q));
  const ids = E.fayon.unidades.map(u => u.id);
  const p = py(['-m', 'bt3d.parametros', 'fayon', ...ids], { BT3D_PARAMETROS: tmp }); fs.unlinkSync(tmp);
  debe(p !== canon(resolver(P, 'fayon', ids)), 'el careo no ve la mutación');
  return 'la ve';
});

/* ── B · lo declarado = lo que usa el simulador ─────────────────────────── */
const delSimulador = () => {
  const num = (re, que) => { const m = re.exec(html); if (!m) throw new Error(`no encuentro ${que} en backtracking.html`); return +m[1]; };
  const cot = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
  const fay = JSON.parse(fs.readFileSync(path.join(ROOT, 'fayon_layout.json'), 'utf-8'));
  return {
    rejilla: num(/const PASO_BUSQ=([\d.]+);/, 'PASO_BUSQ'), aoi: num(/const AOI_HAZ=([\d.]+);/, 'AOI_HAZ'),
    margen: num(/let lo=Math\.max\(-T\.maxAngle,Math\.min\(psz,tt,0\)-([\d.]+)\)/, 'el margen de rangoHaz'),
    z0: num(/id="z0" type="number"[^>]*value="([\d.]+)"/, 'input z0'), nb: num(/id="nbp" type="number"[^>]*value="([\d.]+)"/, 'input nbp'),
    signo: /const pvTilt=t=>-\(t\|\|0\);/.test(html) ? -1 : +1,
    ayora: { tmax: cot.limite ?? 55, cuerda: cot.cuerda }, fayon: { tmax: fay.montaje.max_angle, cuerda: fay.mesa.modH * (fay.montaje.modulos_en_vertical || 1) },
  };
};
const compara = (Pd, S) => {
  const d = [];
  if (Pd.rejilla_deg !== S.rejilla) d.push(`rejilla ${Pd.rejilla_deg} ≠ PASO_BUSQ ${S.rejilla}`);
  if (Pd.aoi_haz_deg !== S.aoi) d.push(`aoi ${Pd.aoi_haz_deg} ≠ AOI_HAZ ${S.aoi}`);
  if (Pd.margen_rango_deg !== S.margen) d.push(`margen ${Pd.margen_rango_deg} ≠ ${S.margen}`);
  if (Pd.convencion_signo.tau_a_pvlib_signo !== S.signo) d.push(`signo de τ ${Pd.convencion_signo.tau_a_pvlib_signo} ≠ pvTilt ${S.signo}`);
  for (const pl of ['ayora', 'fayon']) { const a = Pd.plantas[pl], s = S[pl];
    if (a.theta_max_deg !== s.tmax) d.push(`${pl} θmáx ${a.theta_max_deg} ≠ ${s.tmax}`);
    if (Math.abs(a.cuerda_m - s.cuerda) > 1e-12) d.push(`${pl} cuerda ${a.cuerda_m} ≠ ${s.cuerda}`);
    if (a.z0_m !== S.z0) d.push(`${pl} z0 ${a.z0_m} ≠ ${S.z0}`);
    if (a.nb !== S.nb) d.push(`${pl} nb ${a.nb} ≠ ${S.nb}`); }
  return d;
};
t('B · lo declarado = lo que usa el simulador (rejilla, techo de haz, margen de rango, signo de τ, y por planta θmáx, cuerda, z0, nb)', () => {
  const S = delSimulador(), d = compara(P, S); debe(!d.length, d.join(' · '));
  return `PASO_BUSQ ${S.rejilla} · AOI_HAZ ${S.aoi} · margen ${S.margen} · z0 ${S.z0} · nb ${S.nb} · pvTilt signo ${S.signo} · θmáx ${S.ayora.tmax}/${S.fayon.tmax} · cuerda ${S.ayora.cuerda}/${S.fayon.cuerda}`;
});
t('B · CONTROL NEGATIVO: cada campo mutado de uno en uno CAE', () => {
  const muta = [q => { q.rejilla_deg = 0.2; }, q => { q.aoi_haz_deg = 89; }, q => { q.margen_rango_deg = 3; }, q => { q.convencion_signo.tau_a_pvlib_signo = 1; },
    q => { q.plantas.ayora.theta_max_deg = 60; }, q => { q.plantas.fayon.cuerda_m = 2.4; }, q => { q.plantas.ayora.z0_m = 0.15; }, q => { q.plantas.fayon.nb = 3; }];
  const S = delSimulador(), vivos = muta.filter(f => { const q = JSON.parse(JSON.stringify(P)); f(q); return compara(q, S).length === 0; });
  debe(!vivos.length, `${vivos.length} mutaciones no se ven`);
  return `${muta.length} de ${muta.length} mutaciones vistas`;
});
t('B · el signo declarado es el del motor: a θ = +30° la normal mira al ESTE, y el borde este BAJA', () => {
  const M = marcoMesa({ x: 0, n: [0, 10], z: [0, 0] }, 30), c = caraMesa({ x: 0, n: [0, 10], z: [0, 0] }, 30, 0, 2);
  const este = c.verts.reduce((b, v) => (v[0] > b[0] ? v : b));
  debe(M.nr[0] > 0 && este[2] < 0, `nr=${M.nr.map(v => v.toFixed(3))} borde este z=${este[2].toFixed(3)}`);
  const M2 = marcoMesa({ x: 0, n: [0, 10], z: [0, 0] }, -30);
  debe(M2.nr[0] < 0, 'CONTROL: a θ = −30° la normal no mira al oeste');
  return `nr_x = ${M.nr[0].toFixed(3)} (a −30°: ${M2.nr[0].toFixed(3)})`;
});

/* ── C · el rango por unidad del optimizador = el del simulador ─────────── */
for (const pl of ['ayora', 'fayon']) {
  t(`C · ${pl}: rango Python (copia de rangoHaz) = rango del simulador en cada unidad × instante`, () => {
    const [peor, n] = py(['-m', 'bt3d.careo', 'rangos', pl]).trim().split(' ');
    debe(+peor <= 1e-9, `máx |Δ| = ${peor}° en ${n}`);
    const [peorNeg] = py(['-m', 'bt3d.careo', 'rangos', pl, '1']).trim().split(' ');
    debe(+peorNeg > 1, `CONTROL NEGATIVO: con +τ a pvlib el careo no cae (máx |Δ| ${peorNeg})`);
    return `máx |Δ| ${(+peor).toExponential(1)}° en ${n} unidad×instante · control con +τ: ${(+peorNeg).toFixed(2)}°`;
  });
}

/* ── D · el enumerador JS = el Python, instante a instante ──────────────── */
const huella = l => createHash('sha1').update(l.map(p => `${p[0]},${p[1]}`).sort((a, b) => { const [a0, a1] = a.split(',').map(Number), [b0, b1] = b.split(',').map(Number); return a0 - b0 || a1 - b1; }).join(';')).digest('hex').slice(0, 16);
for (const pl of ['ayora', 'fayon']) {
  t(`D · ${pl}: pares de la envolvente JS = Python en todos los instantes`, () => {
    const Es = E[pl], r = rho(P, pl), lin = py(['-m', 'bt3d.careo', 'pares', pl]).trim().split('\n');
    debe(lin.length === Es.instantes.length, `instantes ${lin.length} ≠ ${Es.instantes.length}`);
    let dif = 0, tot = 0, difNeg = 0;
    Es.instantes.forEach((q, i) => { const s = vectorSol(q.zen, q.az), pj = pares(Es.mesas, s, r), [, n, h] = lin[i].split(' ');
      tot += pj.length; if (+n !== pj.length || h !== huella(pj)) dif++;
      if (i % 12 === 0) { const pn = pares(Es.mesas, s, r * 0.99); if (huella(pn) !== h) difNeg++; } });
    debe(dif === 0, `${dif} instantes difieren`);
    debe(difNeg > 0, 'CONTROL NEGATIVO: con ρ·0,99 en JS las huellas siguen iguales');
    return `${Es.instantes.length} instantes, ${tot} pares mesa→mesa, 0 diferencias · control ρ·0,99: ${difNeg} de ${Math.ceil(Es.instantes.length / 12)} instantes muestreados cambian`;
  });
}

/* ── E · el enumerador no pierde ningún par del MOTOR ───────────────────── */
/* θ aleatorio por mesa en [−θmáx, θmáx] (cualquier θ que la unidad pueda
   tener, no solo el del rango de hoy), fuerza bruta todos contra todos con el
   motor en una ventana; semilla fija. */
const VENTANA = 120;
let sem = 12345; const rnd = () => ((sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648);
function completitud(pl, factor, cada) {
  const Es = E[pl], par = resolver(P, pl, ['x'])[0], r = rho(P, pl) * factor;
  /* ventana: las VENTANA mesas más cercanas a la mediana de la planta (en Fayón, todas) */
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], cx = med(Es.mesas.map(m => m.x)), cn = med(Es.mesas.map(m => (m.n[0] + m.n[1]) / 2));
  const dc = m => Math.hypot(m.x - cx, (m.n[0] + m.n[1]) / 2 - cn);
  const sub = Es.mesas.slice().sort((a, b) => dc(a) - dc(b)).slice(0, VENTANA);
  let reales = 0, faltan = 0, inst = 0;
  Es.instantes.forEach((q, k) => {
    if (k % cada) return; inst++;
    const s = vectorSol(q.zen, q.az), env = new Set(pares(sub, s, r).map(([e, rr]) => e + ',' + rr));
    for (let rep = 0; rep < 2; rep++) {
      const C = sub.map(m => caraMesa(m, (2 * rnd() - 1) * par.theta_max, par.z0, par.cuerda));
      for (let a = 0; a < C.length; a++) for (let b = 0; b < C.length; b++) { if (a === b) continue;
        const R = C[b]; if (!(s[0] * R.nr[0] + s[1] * R.nr[1] + s[2] * R.nr[2] > 1e-12)) continue;
        const sh = sombraSobre(C[a], R, s); if (sh && sh.area > 0) { reales++; if (!env.has(a + ',' + b)) faltan++; } }
    }
  });
  return { reales, faltan, inst, n: sub.length };
}
for (const [pl, cada] of [['ayora', 6], ['fayon', 3]]) {
  t(`E · ${pl}: ningún par con sombra del motor (θ aleatorios) falta en la envolvente`, () => {
    const a = completitud(pl, 1, cada); debe(a.reales > 0, 'test nulo: el motor no da ningún par con sombra');
    debe(a.faltan === 0, `faltan ${a.faltan} de ${a.reales}`);
    const b = completitud(pl, 0.7, cada); debe(b.faltan > 0, 'CONTROL NEGATIVO: con ρ·0,7 no falta nada: la comprobación no protege');
    return `${a.reales} pares reales en ${a.inst} instantes × 2 sorteos, ventana de ${a.n} mesas: faltan 0 · control ρ·0,7: faltan ${b.faltan} de ${b.reales}`;
  });
}

console.log(`\n${ok} OK · ${ko} FAIL`);
process.exit(ko ? 1 : 0);
