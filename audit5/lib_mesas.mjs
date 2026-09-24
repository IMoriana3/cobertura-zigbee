/* R5 · LAS MESAS REALES, reconstruidas desde las cotas del levantamiento.
 *
 * NO IMPORTA NADA. Copia literal de `lineasDesdeCotas`, `zEn` y `tauDe` de
 * `audit4/lib_sombra_geo.mjs` (rama claude/r4-correccion-bt-extremos-6th1im,
 * commit 15c5a98), donde su control de correspondencia contra el simulador dio
 * Δx de línea = Δn = Δz = 0 en las 1.708 mesas de Ayora. Se copia porque esa
 * rama no está en main y R5 va en su propia rama; el banco de R5 REPITE el
 * control de correspondencia en vez de heredarlo.
 *
 * Cada mesa: { x (x de su FILA, no de su línea), n:[sur, norte], z:[cota sur,
 * cota norte], fila, tk, lado, medida }. La línea lleva además su x (media de
 * las de sus filas), que es la que usa el simulador.
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
