/* R5 · FASE 1 — MOTOR DE RELACIONES DE SOMBRA POR PROYECCIÓN.
 *
 * NO IMPORTA NADA. Geometría pura: recibe mesas, un θ por mesa y el vector del
 * sol; devuelve quién sombrea a quién, cuánto y dónde.
 *
 * MARCO: x = ESTE, y = NORTE, z = ARRIBA (m). Sol ŝ = hacia el sol.
 *
 * CONVENIO DE SIGNO (1.3), el del simulador, y con test que cae si se invierte:
 *   θ > 0  ⇒ la cara mira al ESTE (su borde este BAJA);
 *   τ > 0  ⇒ el extremo NORTE de la mesa está MÁS ALTO (τ = atan2(z_N − z_S, n_N − n_S)).
 *   El simulador pasa a pvlib −τ (`pvTilt`, `backtracking.html:606`); aquí τ se
 *   usa en su convenio geométrico y el test lo carea contra `trueTrackAngle` con
 *   `pvTilt`. Precedente medido (R4-A): el convenio contrario explicaba ENTERA la
 *   divergencia JS↔Python del astronómico.
 *
 * MESA (1.1): rectángulo plano. EJE recto de (x, n_S, z_S) a (x, n_N, z_N) —la
 * cota del levantamiento se toma como EJE, como hace el simulador—, x la de su
 * FILA (no la de su línea), su τ propio, su cuerda `cw`, y la cara a `z0` del eje
 * por su normal. Cada mesa rota alrededor de SU eje con SU θ (1.2): emisor y
 * receptor NUNCA comparten dirección de cuerda ni tilt. No hay ningún atajo que
 * evalúe una pareja como gemela.
 *
 * SOMBRA (1.5): los 4 vértices del emisor se recortan al semiespacio DELANTE de
 * la cara receptora (el único que puede tapar el haz que le llega), se proyectan
 * sobre su plano a lo largo de −ŝ (exacto con fuente puntual: un rectángulo
 * plano da un polígono convexo) y se recortan contra el rectángulo receptor
 * (Sutherland-Hodgman). Sin estructura (viga, canto) y sin terreno: solo planos
 * de módulo, declarado.
 *
 * ENUMERACIÓN (1.4): por CONO, sin vecindad, fila, línea ni dirección cardinal.
 * Condición NECESARIA y exacta: si E tapa un punto de R, la proyección de los
 * dos en la VISTA DEL SOL (el plano ⟂ ŝ) se solapa, y E tiene algún punto más
 * cerca del sol que algún punto de R. Se indexa en una rejilla de esa vista.
 * El banco la carea contra fuerza bruta (todas contra todas).
 *
 * UNIÓN (1.6): la sombra de varios emisores se UNE por estaciones axiales —en
 * cada estación, unión de intervalos de cuerda—, no se suma.
 */
const D = Math.PI / 180;
const cruz = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const pesc = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const suma = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const resta = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const esc = (p, k) => [p[0] * k, p[1] * k, p[2] * k];

export function vectorSol(zenDeg, azDeg) {
  const z = zenDeg * D, a = azDeg * D;
  return [Math.sin(z) * Math.sin(a), Math.sin(z) * Math.cos(a), Math.cos(z)];
}

/* marco de la mesa a θ: eje a, cuerda cd (θ>0 ⇒ borde este abajo), normal nr = cd × a */
export function marcoMesa(m, thetaDeg) {
  const dn = m.n[1] - m.n[0], dz = m.z[1] - m.z[0], L = Math.hypot(dn, dz);
  const a = [0, dn / L, dz / L];
  const t = thetaDeg * D;
  const cd = [Math.cos(t), Math.sin(t) * a[2], -Math.sin(t) * a[1]];
  return { a, cd, nr: cruz(cd, a), L };
}

/* la cara colectora: rectángulo en 3D, con su marco local (u a lo ancho, v a lo largo) */
export function caraMesa(m, thetaDeg, z0, cw, opt = {}) {
  const M = marcoMesa(m, thetaDeg), h = cw / 2;
  /* VARIANTE DE CONTROL, no de uso: la cuerda del SIMULADOR, en el plano
     vertical E-O —`uD=[cos θ,0,−sin θ]` (`backtracking.html:2101`) y
     `pt=(u2)=>[px0+u2*cR,py0,pz0+u2*s2]` (`:2312`)—, que no es perpendicular al
     eje inclinado: su mesa es un paralelogramo cizallado. Solo para el careo. */
  if (opt.cuerdaSimulador) {
    const t = thetaDeg * D; M.cd = [Math.cos(t), 0, -Math.sin(t)];
    const n = cruz(M.cd, M.a), ln = Math.hypot(...n); M.nr = esc(n, 1 / ln);
  }
  const F0 = suma([m.x, m.n[0], m.z[0]], esc(M.nr, z0));
  const F1 = suma(F0, esc(M.a, M.L));
  const verts = [resta(F0, esc(M.cd, h)), suma(F0, esc(M.cd, h)), suma(F1, esc(M.cd, h)), resta(F1, esc(M.cd, h))];
  /* base afín (cd, a) de la cara; en la mesa real es ortonormal. jac = área del
     paralelogramo unidad, para devolver áreas verdaderas en la variante cizallada */
  const g11 = pesc(M.cd, M.cd), g12 = pesc(M.cd, M.a), g22 = pesc(M.a, M.a), det = g11 * g22 - g12 * g12;
  return { ...M, F0, h, verts, theta: thetaDeg, g11, g12, g22, det, jac: Math.sqrt(det) };
}

/* recorte de un polígono 2D contra un semiplano {q : f(q) ≥ 0}, f lineal */
function recortaSemiplano(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length], fa = f(A), fb = f(B);
    if (fa >= 0) out.push(A);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
  }
  return out;
}
export function areaPoligono(p) {
  let s = 0; for (let i = 0; i < p.length; i++) { const A = p[i], B = p[(i + 1) % p.length]; s += A[0] * B[1] - B[0] * A[1]; }
  return Math.abs(s) / 2;
}

/* SOMBRA EXACTA de la cara E sobre la cara R. Devuelve null si no hay, {sinHaz}
   si R no recibe haz, o {poly (en u,v de R), area}. `sinRecorte` deja el
   polígono proyectado SIN recortar contra R (para la intrusión firmada). */
export function sombraSobre(E, R, s, sinRecorte) {
  const sR = pesc(s, R.nr);
  if (!(sR > 1e-12)) return { sinHaz: true };
  // 1 · recorte del emisor al semiespacio delante de R (d ≥ 0), en 3D
  let poly = E.verts.map(P => ({ P, d: pesc(resta(P, R.F0), R.nr) }));
  const dentro = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    if (A.d >= 0) dentro.push(A);
    if ((A.d >= 0) !== (B.d >= 0)) { const t = A.d / (A.d - B.d); dentro.push({ P: suma(A.P, esc(resta(B.P, A.P), t)), d: 0 }); }
  }
  if (dentro.length < 3) return null;
  // 2 · proyección sobre el plano de R a lo largo de −ŝ, en (u, v) de R
  let pts = dentro.map(({ P, d }) => { const w = resta(resta(P, esc(s, d / sR)), R.F0), b1 = pesc(w, R.cd), b2 = pesc(w, R.a);
    return [(R.g22 * b1 - R.g12 * b2) / R.det, (R.g11 * b2 - R.g12 * b1) / R.det]; });
  if (sinRecorte) return { poly: pts };
  // 3 · recorte contra el rectángulo receptor (Sutherland-Hodgman)
  pts = recortaSemiplano(pts, q => q[0] + R.h);
  pts = recortaSemiplano(pts, q => R.h - q[0]);
  pts = recortaSemiplano(pts, q => q[1]);
  pts = recortaSemiplano(pts, q => R.L - q[1]);
  if (pts.length < 3) return null;
  const area = areaPoligono(pts) * R.jac;
  return area > 0 ? { poly: pts, area } : null;
}

/* intervalo de cuerda [u0,u1] que un polígono convexo (u,v) ocupa en la estación v */
function intervaloEn(poly, v) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    if ((A[1] - v) * (B[1] - v) > 0) continue;
    if (A[1] === B[1]) { lo = Math.min(lo, A[0], B[0]); hi = Math.max(hi, A[0], B[0]); continue; }
    const u = A[0] + (v - A[1]) / (B[1] - A[1]) * (B[0] - A[0]);
    lo = Math.min(lo, u); hi = Math.max(hi, u);
  }
  return lo <= hi ? [lo, hi] : null;
}
/* UNIÓN por estación: fracción de cuerda cubierta por la unión de los polígonos */
export function fraccionEstacion(R, polys, v) {
  const iv = []; for (const p of polys) { const I = intervaloEn(p, v); if (I) iv.push([Math.max(-R.h, I[0]), Math.min(R.h, I[1])]); }
  if (!iv.length) return 0;
  iv.sort((a, b) => a[0] - b[0]);
  let len = 0, [c0, c1] = iv[0];
  for (let k = 1; k < iv.length; k++) { if (iv[k][0] > c1) { len += Math.max(0, c1 - c0); [c0, c1] = iv[k]; } else c1 = Math.max(c1, iv[k][1]); }
  return (len + Math.max(0, c1 - c0)) / (2 * R.h);
}
/* fracción de ÁREA de la unión: media sobre NS estaciones en el punto medio de NS tramos */
export function fraccionArea(R, polys, NS = 512) {
  if (!polys.length) return 0;
  let s = 0; for (let j = 0; j < NS; j++) s += fraccionEstacion(R, polys, R.L * (j + 0.5) / NS);
  return s / NS;
}

/* ── ENUMERACIÓN POR CONO (vista del sol) ────────────────────────────────────
   caras: array de caras (caraMesa). Devuelve, por receptor, la lista de
   emisores con sombra > 0: {e, area, poly}. `opt.mutarPoda` encoge las cajas
   de la vista un 30 % — SOLO para el control negativo del banco. */
export function relaciones(caras, s, opt = {}) {
  const ref = Math.abs(s[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
  const e1n = cruz(s, ref), l1 = Math.hypot(...e1n), e1 = esc(e1n, 1 / l1), e2 = cruz(s, e1);
  const K = caras.map(c => {
    const pu = c.verts.map(P => pesc(P, e1)), pv = c.verts.map(P => pesc(P, e2)), pd = c.verts.map(P => pesc(P, s));
    let b = [Math.min(...pu), Math.max(...pu), Math.min(...pv), Math.max(...pv)];
    if (opt.mutarPoda) { const cu = (b[0] + b[1]) / 2, cv = (b[2] + b[3]) / 2, ku = (b[1] - b[0]) * 0.35, kv = (b[3] - b[2]) * 0.35; b = [cu - ku, cu + ku, cv - kv, cv + kv]; }
    return { b, dmin: Math.min(...pd), dmax: Math.max(...pd) };
  });
  const G = opt.celda || 3;
  const celdas = new Map(), clave = (i, j) => i * 100003 + j;
  K.forEach((k, idx) => {
    for (let i = Math.floor(k.b[0] / G); i <= Math.floor(k.b[1] / G); i++)
      for (let j = Math.floor(k.b[2] / G); j <= Math.floor(k.b[3] / G); j++) {
        const c = clave(i, j); if (!celdas.has(c)) celdas.set(c, []); celdas.get(c).push(idx);
      }
  });
  const out = caras.map(() => []);
  let candidatos = 0;
  caras.forEach((R, r) => {
    const kr = K[r], vistos = new Set();
    for (let i = Math.floor(kr.b[0] / G); i <= Math.floor(kr.b[1] / G); i++)
      for (let j = Math.floor(kr.b[2] / G); j <= Math.floor(kr.b[3] / G); j++)
        for (const e of (celdas.get(clave(i, j)) || [])) {
          if (e === r || vistos.has(e)) continue; vistos.add(e);
          const ke = K[e];
          if (ke.b[1] < kr.b[0] || ke.b[0] > kr.b[1] || ke.b[3] < kr.b[2] || ke.b[2] > kr.b[3]) continue;
          if (!(ke.dmax > kr.dmin)) continue;                  // E no tiene nada más cerca del sol que R
          candidatos++;
          const sh = sombraSobre(caras[e], R, s);
          if (sh && sh.area > 0) out[r].push({ e, area: sh.area, poly: sh.poly });
        }
  });
  out.candidatos = candidatos;
  return out;
}

/* fuerza bruta, para el control de la poda: todas contra todas */
export function relacionesFuerzaBruta(caras, s) {
  return caras.map((R, r) => {
    const l = [];
    caras.forEach((E, e) => { if (e === r) return; const sh = sombraSobre(E, R, s); if (sh && sh.area > 0) l.push({ e, area: sh.area }); });
    return l;
  });
}
