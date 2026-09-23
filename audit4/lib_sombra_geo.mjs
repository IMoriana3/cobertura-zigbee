/* R4 · GEOMETRÍA PURA DEL VERIFICADOR DE SOMBRA EN LOS EXTREMOS.
 *
 * ESTE MÓDULO NO IMPORTA NADA. Ni el simulador, ni `singleaxis`, ni `pairDz`,
 * ni ninguna función de pendiente. Solo recibe: las cotas del levantamiento
 * (tal como vienen en `*_cotas.json`), la cuerda, el offset cara-eje, el θ de
 * cada mesa y el vector del sol. Que no importe nada no es una promesa: es un
 * hecho del fichero, y `F_sombra_extremos.mjs` lo comprueba leyéndolo.
 *
 * MARCO: x = ESTE, y = NORTE, z = ARRIBA (metros).
 * θ del seguidor: θ > 0 = el panel mira al ESTE (su borde este BAJA). Es el
 * convenio interno de la página; se usa aquí solo para interpretar el θ que
 * el simulador publica, no para calcularlo.
 */

/* ── 1 · líneas y mesas, reconstruidas desde las cotas en bruto ──────────────
   Misma regla que la página, reimplementada (no importada):
   · las filas se agrupan en LÍNEAS por x con tolerancia medio pitch;
   · la planta se parte en BLOQUES por huecos de x > 2,5·pitch;
   · cada fila son DOS mesas: corte en el morro (nm/ym) si está a más de 1 m de
     las puntas, si no en el punto medio; hueco g = min(gapDrive/2, ¼ del
     tramo más corto) a cada lado del corte. */
export function lineasDesdeCotas(datos, bloque) {
  const pitch = datos.pitch || 6;
  const gDrive = (datos.mod && datos.mod.gapDrive != null) ? datos.mod.gapDrive : 0.55;
  const filas = [];
  for (const trk of (datos.t || [])) {
    if (!trk || !trk.f) continue;
    for (const f of trk.f) {
      if (!f || !f.n || !f.y || f.n.length < 2 || f.y.length < 2) continue;
      filas.push({ x: f.x, n0: f.n[0], n1: f.n[1], y0: f.y[0], y1: f.y[1],
                   nm: (f.nm != null && f.ym != null) ? f.nm : null,
                   ym: (f.nm != null && f.ym != null) ? f.ym : null,
                   id: f.id, tk: trk.tk, zo: trk.zo, ye: f.ye | 0, hm: !!f.hm, est: !!trk.est });
    }
  }
  filas.sort((a, b) => a.x - b.x);
  const lineas = [];
  for (const f of filas) {
    const L = lineas[lineas.length - 1];
    if (L && Math.abs(f.x - L.x) < pitch / 2) { L.f.push(f); L.x = (L.x * (L.f.length - 1) + f.x) / L.f.length; }
    else lineas.push({ x: f.x, f: [f] });
  }
  const bloques = []; let cur = [lineas[0]];
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i].x - lineas[i - 1].x > 2.5 * pitch) { bloques.push(cur); cur = []; }
    cur.push(lineas[i]);
  }
  bloques.push(cur);
  const banda = bloques[bloque];
  return banda.map(L => {
    const mesas = [];
    for (const f of L.f) {
      const asc = f.n0 <= f.n1;
      const nS = Math.min(f.n0, f.n1), nN = Math.max(f.n0, f.n1);
      const zS = asc ? f.y0 : f.y1, zN = asc ? f.y1 : f.y0;
      const bisagra = (f.nm != null && f.nm > nS + 1 && f.nm < nN - 1);
      const nb = bisagra ? f.nm : (nS + nN) / 2;
      const zb = bisagra ? f.ym : zS + (zN - zS) * ((nb - nS) / ((nN - nS) || 1));
      const g = Math.min(gDrive / 2, Math.max(0, Math.min(nb - nS, nN - nb) / 4));
      const pS = (zb - zS) / ((nb - nS) || 1), pN = (zN - zb) / ((nN - nb) || 1);
      const medida = !(f.est || f.hm || f.ye);
      mesas.push({ x: f.x, n: [nS, nb - g], z: [zS, zb - pS * g], fila: f.id, tk: f.tk, lado: 'S', medida });
      mesas.push({ x: f.x, n: [nb + g, nN], z: [zb + pN * g, zN], fila: f.id, tk: f.tk, lado: 'N', medida });
    }
    mesas.sort((a, b) => a.n[0] - b.n[0]);
    return { x: L.x, mesas };
  });
}

/* cota de una mesa en una coordenada norte: la mesa es una VIGA RECTA, así
   que entre sus dos puntas la cota es lineal y exacta (salvo flecha) */
export const zEn = (m, n) => m.z[0] + (m.z[1] - m.z[0]) * ((n - m.n[0]) / ((m.n[1] - m.n[0]) || 1));
export const tauDe = m => Math.atan2(m.z[1] - m.z[0], (m.n[1] - m.n[0]) || 1);   // rad, + = sube al norte

/* ── 2 · vectores de la mesa a un θ dado ─────────────────────────────────────
   eje   a  = (0, cos τ, sin τ)                     (a lo largo de la viga)
   cuerda cd = (cos θ, sin θ·sin τ, −sin θ·cos τ)   (perpendicular a a; θ>0 ⇒ borde ESTE abajo)
   normal nr = cd × a                               (hacia el cielo con θ = 0)
   Derivado aquí; no se copia de ninguna función del simulador. */
const cruz = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const pesc = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
export function marco(m, thetaDeg) {
  const t = tauDe(m), th = thetaDeg * Math.PI / 180;
  const a = [0, Math.cos(t), Math.sin(t)];
  const cd = [Math.cos(th), Math.sin(th) * Math.sin(t), -Math.sin(th) * Math.cos(t)];
  const nr = cruz(cd, a);
  const nr0 = cruz([1, 0, 0], a);                 // normal a θ = 0
  return { a, cd, nr, nr0 };
}

/* centro de la CARA COLECTORA en la coordenada norte n. La cota del
   levantamiento se midió SOBRE EL MÓDULO; se supone medida con la mesa
   horizontal (θ = 0) — SUPUESTO declarado —, así que el eje está a z0 por
   debajo de esa cara según la normal a θ = 0, y la cara, a z0 por encima del
   eje según la normal a θ. */
export function centroCara(m, n, thetaDeg, z0) {
  const M = marco(m, thetaDeg);
  const p = [m.x, n, zEn(m, n)];
  return [p[0] + z0 * (M.nr[0] - M.nr0[0]), p[1] + z0 * (M.nr[1] - M.nr0[1]), p[2] + z0 * (M.nr[2] - M.nr0[2])];
}

/* ── 3 · ¿el borde alto del emisor mete sombra en el receptor? ──────────────
   En la coordenada norte n del EMISOR:
     · se toman las dos aristas de su cara (centro ± c/2·cd) y se queda la MÁS
       ALTA — la que manda;
     · se lanza el rayo desde ella ALEJÁNDOSE del sol (−ŝ), EN 3D, así que el
       impacto se desplaza a lo largo de la fila si el sol tiene componente N;
     · se corta con el plano de la cara del receptor y se expresa el impacto en
       la base del receptor (u a lo ancho de la cuerda, v a lo largo del eje);
     · INTRUSIÓN = cuánto se mete ese impacto dentro de la cuerda del receptor,
       contado desde su borde que da al emisor. 0 si cae antes de él.
   Devuelve también dónde cayó el impacto en norte, para saber si cae DENTRO
   de la mesa receptora o en un hueco. */
export function intrusion(em, re, n, thE, thR, sol, cw, z0) {
  const ME = marco(em, thE), MR = marco(re, thR);
  const C = centroCara(em, n, thE, z0);
  const e1 = [C[0] + cw / 2 * ME.cd[0], C[1] + cw / 2 * ME.cd[1], C[2] + cw / 2 * ME.cd[2]];
  const e2 = [C[0] - cw / 2 * ME.cd[0], C[1] - cw / 2 * ME.cd[1], C[2] - cw / 2 * ME.cd[2]];
  const P = e1[2] >= e2[2] ? e1 : e2;                      // la arista ALTA manda
  const Q = centroCara(re, n, thR, z0);                    // un punto de la cara receptora
  const den = pesc(sol, MR.nr);
  if (Math.abs(den) < 1e-12) return { intr: 0, nota: 'rayo paralelo a la cara' };
  const t = pesc([P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]], MR.nr) / den;
  if (!(t > 0)) return { intr: 0, nota: 'el receptor no está detrás del emisor' };
  const H = [P[0] - t * sol[0], P[1] - t * sol[1], P[2] - t * sol[2]];
  const d = [H[0] - Q[0], H[1] - Q[1], H[2] - Q[2]];
  const u = pesc(d, MR.cd);                                 // a lo ancho: + = hacia el ESTE
  const emisorAlEste = em.x > re.x;
  const bordeFrente = emisorAlEste ? cw / 2 : -cw / 2;      // el borde del receptor que da al emisor
  let intr = emisorAlEste ? (bordeFrente - u) : (u - bordeFrente);
  const cae = intr > 0;
  intr = Math.max(0, Math.min(cw, intr));
  return { intr, u, nImpacto: H[1], cae, H, P };
}

/* ángulo de incidencia del sol sobre la cara (grados). ≥ 90° ⇒ la cara no
   recibe haz, y ahí no hay sombra que medir: se cuenta aparte. */
export function aoi(m, thetaDeg, sol) {
  const M = marco(m, thetaDeg);
  return Math.acos(Math.max(-1, Math.min(1, pesc(M.nr, sol)))) * 180 / Math.PI;
}
