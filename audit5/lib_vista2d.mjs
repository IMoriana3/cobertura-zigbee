/* R5 · LOS TRES CIERRES DEL HALLAZGO DE LAS FILAS ALTERNAS — geometría de vista 2D.
 *
 * La métrica de la página (`poaRow`, backtracking.html:2502) suma para cada fila:
 * haz + circunsolar + cielo isótropo (1+cos β)/2 + banda de horizonte F2·sen β +
 * suelo GHI·ρ·(1−cos β)/2. Ni el cielo ni el suelo saben que hay filas vecinas: la
 * fila empinada no le quita cielo a la plana, y el suelo que ven las dos está
 * entero al sol y con el cielo entero. Aquí se cierran esas dos cosas con
 * geometría, en el PLANO transversal (filas infinitas a lo largo del eje, x = este,
 * z = arriba), el mismo caso de la refutación de 2.6.
 *
 * FILA r: eje en (x_r, 0), suelo en z = −H. Cara colectora a z0 del eje por su
 * normal, cuerda cw: cd = (cos θ, −sen θ), normal n = (sen θ, cos θ) — θ > 0 mira
 * al este (el convenio del motor, lib_proyeccion.mjs:8-9).
 *
 * FACTOR DE VISTA 2D por rayos: desde NP puntos de la cara, rayos en el
 * semiplano delantero con peso cos φ / 2 (φ desde la normal): la suma de pesos es
 * 1. Cada rayo acaba en: otra fila (se pierde: no se modela la reflexión en el
 * dorso de las vecinas, declarado), el suelo (en x_g) o el cielo.
 *
 * CIELO de la cara = DHI·(1−F1)·VF_cielo + DHI·F2·sen β·(fracción visible de la
 * banda de horizonte del lado al que mira), con los F1/F2 de Perez de la página.
 * SUELO de la cara = ρ·Σ G(x_g)·peso: cada punto de suelo recibe
 * DHI·VF_cielo_suelo(x_g) + DNI·cos Z si está al sol (las filas le hacen sombra).
 * Circunsolar y haz: los de la página (sin sombra por construcción del caso).
 *
 * TEST NULO que tiene que cumplirse: SIN vecinas (y suelo sin sombra), VF_cielo
 * = (1+cos β)/2, suelo = GHI·ρ·(1−cos β)/2 y la banda de horizonte entera, o sea
 * `poaRow` exacto.
 */
const D = Math.PI / 180;

export function caraFila(x, theta, z0, cw) {
  const t = theta * D, cd = [Math.cos(t), -Math.sin(t)], n = [Math.sin(t), Math.cos(t)];
  const c = [x + z0 * n[0], z0 * n[1]], h = cw / 2;
  return { x, theta, n, cd, a: [c[0] - h * cd[0], c[1] - h * cd[1]], b: [c[0] + h * cd[0], c[1] + h * cd[1]] };
}

/* intersección del rayo p + s·d (s > eps) con el segmento ab; devuelve s o Infinity */
function corta(p, d, a, b) {
  const ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-14) return Infinity;
  const wx = a[0] - p[0], wz = a[1] - p[1];
  const s = (wx * ez - wz * ex) / den, u = (wx * d[1] - wz * d[0]) / den;
  return (s > 1e-9 && u >= 0 && u <= 1) ? s : Infinity;
}

/* destino de un rayo: 'fila', ['suelo', x] o 'cielo' */
function destino(p, d, caras, excluir, H) {
  let best = Infinity, tipo = 'cielo';
  for (let k = 0; k < caras.length; k++) { if (k === excluir) continue; const s = corta(p, d, caras[k].a, caras[k].b); if (s < best) { best = s; tipo = 'fila'; } }
  if (d[1] < 0) { const s = (-H - p[1]) / d[1]; if (s > 1e-9 && s < best) return ['suelo', p[0] + s * d[0]]; }
  return tipo === 'fila' ? ['fila'] : ['cielo'];
}

/* sol en el plano transversal: el rayo hacia el sol proyectado en (x, z) */
export const solPerfil = (zen, az) => { const z = zen * D, a = az * D, v = [Math.sin(z) * Math.sin(a), Math.cos(z)], l = Math.hypot(...v); return [v[0] / l, v[1] / l]; };

/* un punto de suelo: fracción de cielo visible (peso cos φ/2 sobre la vertical) y si está al sol */
export function suelo(xg, caras, H, sp, NR = 360) {
  const p = [xg, -H + 1e-6]; let vf = 0;
  for (let i = 0; i < NR; i++) { const phi = -90 + (i + 0.5) * 180 / NR, d = [Math.sin(phi * D), Math.cos(phi * D)], w = Math.cos(phi * D) / 2 * (Math.PI / NR);
    if (destino(p, d, caras, -1, H)[0] === 'cielo') vf += w; }
  const alSol = destino(p, sp, caras, -1, H)[0] === 'cielo';
  return { vf, alSol };
}

/* vista de la cara k: VF al cielo, lista de (x_suelo, peso) y visibilidad de la banda de horizonte */
export function vistaCara(k, caras, H, { NP = 24, NR = 720, banda = 6.5 } = {}) {
  const c = caras[k]; let vfC = 0; const sue = []; let hz = 0, hzT = 0;
  for (let j = 0; j < NP; j++) {
    const u = (j + 0.5) / NP, p = [c.a[0] + u * (c.b[0] - c.a[0]) + 1e-7 * c.n[0], c.a[1] + u * (c.b[1] - c.a[1]) + 1e-7 * c.n[1]];
    for (let i = 0; i < NR; i++) {
      const phi = -90 + (i + 0.5) * 180 / NR, cp = Math.cos(phi * D), sp = Math.sin(phi * D);
      const d = [c.n[0] * cp + c.cd[0] * sp, c.n[1] * cp + c.cd[1] * sp], w = cp / 2 * (Math.PI / NR) / NP;
      const r = destino(p, d, caras, k, H);
      if (r[0] === 'cielo') vfC += w; else if (r[0] === 'suelo') sue.push([r[1], w]);
      /* banda de horizonte: rayos con elevación entre 0 y `banda` grados */
      const elev = Math.asin(Math.max(-1, Math.min(1, d[1]))) / D;
      if (elev >= 0 && elev <= banda) { hzT += w; if (r[0] === 'cielo') hz += w; }
    }
  }
  return { vfC, sue, horizonte: hzT > 0 ? hz / hzT : 1 };
}
