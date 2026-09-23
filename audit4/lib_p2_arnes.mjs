/* R4 · MEDIDA (c) — P2 REPRODUCIDO EN EL ARNÉS, SIN TOCAR `backtracking.html`.
 *
 * Autorizada por el titular rompiendo el orden R1: «P2 no se puede escribir sin
 * saber qué puede resolver, y medirlo dentro del arnés no toca el motor».
 *
 * Qué reproduce. La ruta por LÍNEA de pairwise es
 *   policyAngles → repairNoShade(driveCoupleSafe(anglesPairwise(…), false))
 * (`backtracking.html:3763`), y `anglesPairwiseRaw` (`:1185-1224`) da UN
 * candidato por pareja:
 *   th[p] = pairThetaTorsion( singleaxis(…, crossAxisTilt: pairs[p].slope) )
 * con pairs[p].slope = atan2(pairDz[p], pitch) y pairDz la media ponderada de
 * (za−zb) en el punto medio de cada solape (`:1733-1745`).
 *
 * P2 (encargo): por solape, dz en sus DOS extremos; dzMin y dzMax de la pareja;
 * DOS candidatos θ(slopeMin), θ(slopeMax), mismo axisTilt/pitch/gcr; la media
 * deja de ser candidato. Aquí eso se hace calculando cada candidato EXACTAMENTE
 * como hoy (singleaxis + pairThetaTorsion), con la pendiente de la pareja
 * puesta a slopeMin o a slopeMax, y quedándose con el más backtrackeado de los
 * dos (min sg·θ), que es la regla con que la fila ya combina candidatos.
 *
 * SUPUESTO DECLARADO (el encargo no lo fija): todo lo que va DESPUÉS del
 * candidato —la reparación por torsión dentro de anglesPairwiseRaw,
 * driveCoupleSafe y repairNoShade— corre sobre el T de siempre, con la
 * pendiente media en pairs[p].slope (la usan para su rangoHaz). P2 real tendrá
 * que decidir qué pendiente ven esas etapas.
 *
 * Modos: 'media' = el comportamiento de HOY reconstruido (control de fidelidad,
 * tiene que dar diferencia 0); 'extremos' = P2.
 */
export function dzPorPareja(P) {
  const out = [];
  for (let i = 0; i < P.segs.length - 1; i++) {
    let acc = 0, w = 0, dMin = Infinity, dMax = -Infinity;
    const A = P.segs[i], ZA = P.segZ[i], B = P.segs[i + 1], ZB = P.segZ[i + 1];
    for (let ai = 0; ai < A.length; ai++) for (let bi = 0; bi < B.length; bi++) {
      const lo = Math.max(A[ai][0], B[bi][0]), hi = Math.min(A[ai][1], B[bi][1]);
      if (hi <= lo) continue;
      const zAt = (S, Z, v) => Z[0] + (Z[1] - Z[0]) * ((v - S[0]) / ((S[1] - S[0]) || 1));
      // la media, con la MISMA expresión y el mismo orden que `:1740-1743`
      const mid = (lo + hi) / 2, len = hi - lo;
      const za = ZA[ai][0] + (ZA[ai][1] - ZA[ai][0]) * ((mid - A[ai][0]) / ((A[ai][1] - A[ai][0]) || 1));
      const zb = ZB[bi][0] + (ZB[bi][1] - ZB[bi][0]) * ((mid - B[bi][0]) / ((B[bi][1] - B[bi][0]) || 1));
      acc += (za - zb) * len; w += len;
      for (const v of [lo, hi]) { const d = zAt(A[ai], ZA[ai], v) - zAt(B[bi], ZB[bi], v); dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); }
    }
    out.push({ media: w > 0 ? acc / w : 0, dzMin: w > 0 ? dMin : null, dzMax: w > 0 ? dMax : null, sumLen: w });
  }
  return out;
}

export function anglesLineaP2(F, T, DZ, zen, az, irr, doy, albedo, modo, diag) {
  const D = 180 / Math.PI;
  const nR = T.pairs.length + 1, out = new Array(nR);
  const ev = F.pairEval3D(zen, az, T, new Map());
  const sg = F.trueTrackAngle(zen, az, 0, T.axisAz) >= 0 ? 1 : -1;
  const cand = (p, slope) => {
    const Tp = { ...T, pairs: T.pairs.map((q, i) => i === p ? { ...q, slope } : q) };
    const q = T.pairs[p];
    return F.pairThetaTorsion(zen, az, Tp, p, F.nan0(F.singleaxis(zen, az, { axisTilt: F.pvTilt(q.axisTilt), axisAz: T.axisAz,
      maxAngle: T.maxAngle, backtrack: true, gcr: T.cw / q.pitch, crossAxisTilt: slope })), ev);
  };
  const th = T.pairs.map((q, p) => {
    if (modo === 'media') return cand(p, q.slope);
    const a = cand(p, Math.atan2(DZ[p].dzMin, q.pitch) * D), b = cand(p, Math.atan2(DZ[p].dzMax, q.pitch) * D);
    if (diag) { const m = cand(p, q.slope); diag.pares++; if (Math.abs(a - m) > 1e-9 || Math.abs(b - m) > 1e-9) diag.distintos++; }
    return sg * a < sg * b ? a : b;
  });
  // desde aquí, `anglesPairwiseRaw` (`:1197-1223`) tal cual
  out[0] = th[0]; out[nR - 1] = th[th.length - 1];
  for (let r = 1; r < nR - 1; r++) out[r] = sg * th[r - 1] < sg * th[r] ? th[r - 1] : th[r];
  if (T.rowTilt && isFinite(zen) && zen < 90 && T.pairs.some((_, i) => F.pairStations(T, i).length > 1)) {
    const ITS = Math.round(12 * 0.5 / F.PASO_BUSQ);
    for (let it = 0; it < ITS; it++) {
      let dirty = false;
      for (let p = 0; p < T.pairs.length; p++) {
        if (ev(p, out[p], out[p + 1]) <= 1e-3) continue;
        let t = sg * out[p] < sg * out[p + 1] ? out[p] : out[p + 1];
        if (out[p] === out[p + 1]) t = t - sg * F.PASO_BUSQ;
        const [hLo, hHi] = F.rangoHaz(zen, az, T, T.pairs[p].axisTilt, T.pairs[p].slope);
        t = Math.max(hLo, Math.min(hHi, t));
        if (out[p] !== t || out[p + 1] !== t) { out[p] = t; out[p + 1] = t; dirty = true; }
      }
      if (!dirty) break;
    }
  }
  // y el resto de la cadena de `policyAngles` (`:3763`)
  return F.repairNoShade(zen, az, T, F.driveCoupleSafe(zen, az, T, out, false), irr, doy, albedo);
}
