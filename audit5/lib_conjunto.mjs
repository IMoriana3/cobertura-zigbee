/* R5 · FASE 2 — POLÍTICA «CONJUNTO SIN SOMBRA EVITABLE».
 *
 * Nunca «sin sombra»: ninguna política lo garantiza (el despachador lo dice,
 * `backtracking.html:3748` «BUSCAN, no GARANTIZAN»), y en Ayora hay 30 extremos
 * irreducibles que son terreno.
 *
 * 2.1 OBJETIVO: máxima POA de PLANTA sujeta a sombra EVITABLE cero, con la sombra
 *     del motor de la fase 1 (`lib_proyeccion.mjs`).
 * 2.2 GRADO DE LIBERTAD: un θ por UNIDAD DE ACCIONAMIENTO (`T.segDrive`: las mesas
 *     que mueve un mismo motor). Como la unidad YA es el motor, no hay regla de
 *     min(|θ|) del grupo, y está prohibido reintroducirla. RANGO: el legítimo de
 *     mando, `rangoHaz` (`backtracking.html:983-998`), con el tilt medio de las
 *     mesas de la unidad y la pendiente transversal de su pareja de líneas.
 * 2.3 ASCENSO COORDINADO con los θ REALES de las vecinas: al evaluar una unidad,
 *     todas las demás están en el θ que tienen EN ESE MOMENTO. Una unidad no puede
 *     aceptar un θ que deje sombra evitable en ella NI en las que ella sombrea.
 * 2.4 PASADA FINAL con todos los θ definitivos: se recalcula la planta entera y la
 *     sombra evitable que quede se REPORTA, no se tapa.
 * POR QUÉ EXISTE, DOS RAZONES INDEPENDIENTES (2026-09-24, audit5/FASE2_PARADA.md):
 *   (1) ve a TODOS sus emisores por proyección con su θ real (las nueve miran
 *       por vecindad y suponen gemelo al vecino);
 *   (2) existen configuraciones SIN SOMBRA que producen más que la tangencia
 *       uniforme, en llano incluido (+4,12 % y +5,90 %, INSTANTES de sol
 *       medio-bajo, MEDIDO EN EL MODELO: audit5/F3_CIERRES_FILAS_ALTERNAS.md),
 *       y ninguna de las nueve puede encontrarlas: todas retroceden hasta la
 *       tangencia, todas igual.
 * 2.5 PREDICADO NO MONÓTONO: nada de bisección. Barrido cada 1° por todo el rango
 *     y refino cada 0,1° alrededor del mejor, y MULTIARRANQUE.
 * 2.7 ENERGÍA: la de `poaPlantSeg` (`backtracking.html:2785`), mesa a mesa —
 *     beam·(1 − elecLoss por estación) + circunsolar·(1 − fracción) + cielo +
 *     suelo, con `poaRow` y `elecLoss` del propio simulador— y la planta ponderada
 *     por largo de mesa. Solo cambia de dónde sale la sombra: del motor nuevo.
 *
 * «SOMBRA EVITABLE» de un receptor (declarado): su fracción de sombra menos su
 * SUELO, el mínimo que le queda con su unidad y las de sus emisores en cualquier
 * θ de sus rangos. El suelo se calcula por separación (cada emisor en el θ que
 * menos le sombrea, dada la del receptor; rejilla de 2,5°, la de
 * PASO_GRUESO_UNI), que es una COTA SUPERIOR del suelo verdadero: puede contar
 * como inevitable algo de sombra que un ajuste conjunto sí quitaría. Solo pesa a
 * sol rasante, donde hay suelo > 0. Se calcula bajo demanda y se memoriza por
 * instante.
 */
import { caraMesa, sombraSobre, fraccionEstacion } from './lib_proyeccion.mjs';

export const TOL_EVIT = 1e-4;      // fracción de área: por debajo, no hay sombra evitable (declarado)
export const PASO_G = 1, PASO_F = 0.1, PASO_SUELO = 2.5, TOPE_PASADAS = 12;

/* emisores POTENCIALES de cada receptor para CUALQUIER θ: cilindro de radio
   cuerda/2 + z0 alrededor del eje de cada mesa, en la vista del sol */
export function vecinosPotenciales(mesas, s, rho) {
  const ref = Math.abs(s[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
  const c = [s[1] * ref[2] - s[2] * ref[1], s[2] * ref[0] - s[0] * ref[2], s[0] * ref[1] - s[1] * ref[0]], l = Math.hypot(...c);
  const e1 = c.map(v => v / l), e2 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const K = mesas.map(m => { const P = [[m.x, m.n[0], m.z[0]], [m.x, m.n[1], m.z[1]]];
    const u = P.map(p => p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2]), v = P.map(p => p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]), d = P.map(p => p[0] * s[0] + p[1] * s[1] + p[2] * s[2]);
    return { b: [Math.min(...u) - rho, Math.max(...u) + rho, Math.min(...v) - rho, Math.max(...v) + rho], dmin: Math.min(...d) - rho, dmax: Math.max(...d) + rho }; });
  const G = 4, cel = new Map(), cl = (i, j) => i * 100003 + j;
  K.forEach((k, i) => { for (let a = Math.floor(k.b[0] / G); a <= Math.floor(k.b[1] / G); a++) for (let b = Math.floor(k.b[2] / G); b <= Math.floor(k.b[3] / G); b++) { const q = cl(a, b); if (!cel.has(q)) cel.set(q, []); cel.get(q).push(i); } });
  return K.map((kr, r) => { const out = new Set();
    for (let a = Math.floor(kr.b[0] / G); a <= Math.floor(kr.b[1] / G); a++) for (let b = Math.floor(kr.b[2] / G); b <= Math.floor(kr.b[3] / G); b++)
      for (const e of (cel.get(cl(a, b)) || [])) { if (e === r) continue; const ke = K[e];
        if (ke.b[1] < kr.b[0] || ke.b[0] > kr.b[1] || ke.b[3] < kr.b[2] || ke.b[2] > kr.b[3] || !(ke.dmax > kr.dmin)) continue; out.add(e); }
    return [...out]; });
}

/* LA PLANTA EN UN INSTANTE: estado mutable (θ por unidad) con evaluación
   INCREMENTAL de un movimiento de una unidad. */
export function crearPlanta(o) {
  const { mesas, unidades, rangos, s, zen, az, irr, doy, alb, iam, z0, cw, nb, NST, poaRow, elecLoss } = o;
  const nM = mesas.length, uDe = new Int32Array(nM);
  unidades.forEach((U, u) => U.forEach(i => { uDe[i] = u; }));
  const pot = vecinosPotenciales(mesas, s, cw / 2 + z0);
  const inv = mesas.map(() => []); pot.forEach((l, r) => l.forEach(e => inv[e].push(r)));
  const len = mesas.map(m => Math.max(1e-6, m.n[1] - m.n[0])), sumLen = len.reduce((a, b) => a + b, 0);
  const tilt = mesas.map(m => Math.atan2(m.z[1] - m.z[0], (m.n[1] - m.n[0]) || 1) * 180 / Math.PI);
  const th = new Float64Array(unidades.length);
  const cara = new Array(nM), fo = new Float64Array(nM), se = new Float64Array(nM), v = new Float64Array(nM);
  const suelo = new Map();
  const sombra = (i, C) => {                 // fracción y pérdida eléctrica de la mesa i con las caras C
    const R = C[i]; if (!(s[0] * R.nr[0] + s[1] * R.nr[1] + s[2] * R.nr[2] > 1e-12)) return [0, 0];
    const polys = []; for (const e of pot[i]) { const sh = sombraSobre(C[e], R, s); if (sh && sh.area > 0) polys.push(sh.poly); }
    if (!polys.length) return [0, 0];
    let f = 0, el = 0; for (let j = 0; j < NST; j++) { const q = fraccionEstacion(R, polys, R.L * (j + 0.5) / NST); f += q; el += elecLoss(q, nb); }
    return [f / NST, el / NST];
  };
  const valor = (i, thI, f, e) => { const p = poaRow(thI, tilt[i], 0, zen, az, irr, doy, alb, iam); return p.beam * (1 - e) + p.circ * (1 - f) + p.sky + p.gnd; };
  const rejilla = (lo, hi, paso) => { const g = []; for (let t = lo; t <= hi + 1e-9; t += paso) g.push(t); if (g[g.length - 1] < hi - 1e-9) g.push(hi); return g; };
  /* SUELO del receptor i: por separación, rejilla PASO_SUELO */
  function sueloDe(i) {
    if (suelo.has(i)) return suelo.get(i);
    const uR = uDe[i], mR = mesas[i]; let mejor = Infinity;
    for (const tR of rejilla(rangos[uR][0], rangos[uR][1], PASO_SUELO)) {
      const R = caraMesa(mR, tR, z0, cw); if (!(s[0] * R.nr[0] + s[1] * R.nr[1] + s[2] * R.nr[2] > 1e-12)) continue;
      const polys = [];
      for (const e of pot[i]) {
        if (uDe[e] === uR) { const sh = sombraSobre(caraMesa(mesas[e], tR, z0, cw), R, s); if (sh && sh.area > 0) polys.push(sh.poly); continue; }
        let min = null;
        for (const tE of rejilla(rangos[uDe[e]][0], rangos[uDe[e]][1], PASO_SUELO)) {
          const sh = sombraSobre(caraMesa(mesas[e], tE, z0, cw), R, s);
          if (!sh || !(sh.area > 0)) { min = null; break; }
          if (!min || sh.area < min.area) min = sh;
        }
        if (min) polys.push(min.poly);
      }
      let f = 0; for (let j = 0; j < NST; j++) f += fraccionEstacion(R, polys, R.L * (j + 0.5) / NST); f /= NST;
      if (f < mejor) mejor = f; if (mejor <= 0) break;
    }
    suelo.set(i, mejor === Infinity ? 0 : mejor); return suelo.get(i);
  }
  /* o.sinRestriccion: SOLO para el control negativo del banco (la política sin
     su restricción tiene que dejar de degenerar a pairwise) */
  const evit = (i, f) => (o.sinRestriccion ? 0 : (f > TOL_EVIT ? Math.max(0, f - sueloDe(i)) : 0));
  function fijar(thU) {
    for (let u = 0; u < unidades.length; u++) { th[u] = thU[u]; for (const i of unidades[u]) cara[i] = caraMesa(mesas[i], th[u], z0, cw); }
    for (let i = 0; i < nM; i++) { const [f, e] = sombra(i, cara); fo[i] = f; se[i] = e; v[i] = valor(i, th[uDe[i]], f, e); }
  }
  const afectadas = u => { const A = new Set(); for (const i of unidades[u]) { A.add(i); for (const r of inv[i]) A.add(r); } return [...A]; };
  /* evalúa mover la unidad u a t: Δ de la suma Σ v·len, y la sombra evitable en las afectadas */
  function probar(u, t, A) {
    const guard = unidades[u].map(i => cara[i]);
    for (const i of unidades[u]) cara[i] = caraMesa(mesas[i], t, z0, cw);
    let d = 0, eMax = 0, eSum = 0; const nuevos = [];
    for (const i of A) { const [f, e] = sombra(i, cara), ti = uDe[i] === u ? t : th[uDe[i]], vi = valor(i, ti, f, e);
      d += (vi - v[i]) * len[i]; const ev = evit(i, f); eMax = Math.max(eMax, ev); eSum += ev * len[i]; nuevos.push([i, f, e, vi]); }
    unidades[u].forEach((i, k) => { cara[i] = guard[k]; });
    return { d, eMax, eSum, nuevos };
  }
  function aceptar(u, t, r) { th[u] = t; for (const i of unidades[u]) cara[i] = caraMesa(mesas[i], t, z0, cw); for (const [i, f, e, vi] of r.nuevos) { fo[i] = f; se[i] = e; v[i] = vi; } }
  const evitActual = A => { let eMax = 0, eSum = 0; for (const i of A) { const ev = evit(i, fo[i]); eMax = Math.max(eMax, ev); eSum += ev * len[i]; } return { eMax, eSum }; };
  /* 2.3 · ASCENSO COORDINADO */
  function ascenso(thIni, tope = TOPE_PASADAS) {
    fijar(thIni);
    let pasadas = 0, movs = 0;
    for (; pasadas < tope; pasadas++) {
      let movio = false;
      for (let u = 0; u < unidades.length; u++) {
        const A = afectadas(u), cur = evitActual(A);
        const mejorDe = (lista, ref) => { let b = ref;
          for (const t of lista) { const r = probar(u, t, A);
            const factible = r.eMax <= TOL_EVIT;
            const gana = b.factible ? (factible && r.d > b.d + 1e-9) : (factible || r.eSum < b.eSum - 1e-12 || (Math.abs(r.eSum - b.eSum) <= 1e-12 && r.d > b.d + 1e-9));
            if (gana) b = { t, d: r.d, eSum: r.eSum, factible, r }; }
          return b; };
        const ref0 = { t: th[u], d: 0, eSum: cur.eSum, factible: cur.eMax <= TOL_EVIT, r: null };
        let b = mejorDe(rejilla(rangos[u][0], rangos[u][1], PASO_G), ref0);
        b = mejorDe(rejilla(Math.max(rangos[u][0], b.t - PASO_G), Math.min(rangos[u][1], b.t + PASO_G), PASO_F), b);
        if (b.r && b.t !== th[u]) { aceptar(u, b.t, b.r); movio = true; movs++; }
      }
      if (!movio) break;
    }
    return { pasadas: pasadas + 1, movs, agotado: pasadas >= tope };
  }
  /* 2.4 · PASADA FINAL con todos los θ definitivos */
  function pasadaFinal() {
    fijar(Array.from(th));
    let poa = 0, eMax = 0, conEvit = 0, conSombra = 0, sombraTot = 0;
    for (let i = 0; i < nM; i++) { poa += v[i] * len[i]; sombraTot += fo[i] * len[i]; if (fo[i] > TOL_EVIT) conSombra++;
      const ev = evit(i, fo[i]); if (ev > TOL_EVIT) conEvit++; eMax = Math.max(eMax, ev); }
    return { poa: poa / sumLen, sombraMedia: sombraTot / sumLen, mesasConSombra: conSombra, mesasConEvitable: conEvit, evitMax: eMax, th: Array.from(th) };
  }
  function poaPlanta(thU) { fijar(thU); let p = 0; for (let i = 0; i < nM; i++) p += v[i] * len[i]; return p / sumLen; }
  return { ascenso, pasadaFinal, poaPlanta, fijar, uDe, pot, get th() { return th; }, evitDe: i => evit(i, fo[i]), fo };
}

/* 2.5 · MULTIARRANQUE: devuelve el ganador y de qué arranque sale */
export function conjuntoSinSombraEvitable(planta, arranques) {
  const res = [];
  for (const [nombre, thIni] of arranques) {
    const a = planta.ascenso(thIni), f = planta.pasadaFinal();
    res.push({ nombre, ...a, ...f });
  }
  const factibles = res.filter(r => r.mesasConEvitable === 0);
  const g = (factibles.length ? factibles : res).reduce((b, r) => (!b || (factibles.length ? r.poa > b.poa : r.evitMax < b.evitMax)) ? r : b, null);
  return { ganador: g, arranques: res };
}

/* 2.6 REESCRITO (decisión del titular, 2026-09-24, opción 1 de FASE2_PARADA.md) ·
   LA POLÍTICA RESTRINGIDA A UN θ COMÚN. En terreno uniforme la política de
   conjunto NO tiene por qué degenerar a `pairwise` (filas alternas: +6-7 % sin
   sombra a sol bajo, refutación de 2.6); lo que sí tiene que cumplir es que, en
   el subespacio de un θ COMÚN a todas las unidades —el único donde la uniforme
   es el óptimo—, encuentre lo mismo que `pairwise`. Mismo barrido y misma
   rejilla que la política (PASO_G y refino PASO_F sobre el rango común), misma
   restricción (sombra evitable cero), misma energía. */
export function optimoComun(planta, lo, hi) {
  const rejilla = (a, b, p) => { const g = []; for (let t = a; t <= b + 1e-9; t += p) g.push(t); if (g[g.length - 1] < b - 1e-9) g.push(b); return g; };
  const nU = planta.th.length;
  const evalua = t => { const r = (planta.fijar(new Array(nU).fill(t)), planta.pasadaFinal()); return { t, poa: r.poa, factible: r.mesasConEvitable === 0, evit: r.mesasConEvitable }; };
  let b = null;
  for (const t of rejilla(lo, hi, PASO_G)) { const r = evalua(t); if (r.factible && (!b || r.poa > b.poa + 1e-12)) b = r; }
  if (!b) return null;
  for (const t of rejilla(Math.max(lo, b.t - PASO_G), Math.min(hi, b.t + PASO_G), PASO_F)) { const r = evalua(t); if (r.factible && r.poa > b.poa + 1e-12) b = r; }
  return b;
}
