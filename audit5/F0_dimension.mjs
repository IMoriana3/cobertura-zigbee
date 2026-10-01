/* R5 · FASE 0 — DIMENSIONAR LOS DOS DEFECTOS EN AYORA (sin tocar nada).
 *
 *   node audit5/F0_dimension.mjs [--json=RUTA]
 *
 * Ayora real (banda del encargo, `plantFromCotas(datos, 500, 0)`: 107 líneas,
 * 1.708 mesas, cada una en la x de SU FILA), 21-jun y 21-dic cada 5 min, sol >
 * 0,5° y backtracking activo (el mismo criterio que F_sombra_extremos: alguna
 * línea con pairwise ≠ astro en más de 0,1°). θ = los que PUBLICA `pairwise` por
 * mesa (`policyAnglesSeg`). Sombra = el motor de la fase 1.
 *
 *   0.1 receptores con MÁS DE UN emisor efectivo;
 *   0.2 emisores efectivos que la política NO enumera — la rama por mesa solo
 *       mira mesas de las líneas r±1 que SOLAPAN en norte (`backtracking.html:2690`);
 *       la rama por línea, las líneas r±1;
 *   0.3 dirección del emisor respecto al receptor;
 *   0.4 LA CEGUERA DEL GEMELO: la sombra de cada receptor (a) con cada emisor en
 *       el MISMO θ que el receptor (lo que suponen las políticas, `:2705`) y (b)
 *       con cada emisor en SU θ publicado.
 *
 * «Emisor efectivo» = sombra > AREA_MIN sobre el receptor. AREA_MIN = 1 cm², un
 * umbral de detección geométrica, declarado; se repite con 100 cm².
 * Para (a) los candidatos se enumeran con el cilindro que barre cada emisor a
 * CUALQUIER θ (radio cuerda/2 + z0 alrededor de su eje): un gemelo girado puede
 * sombrear donde el publicado no.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vectorSol, caraMesa, sombraSobre, relaciones, fraccionArea } from './lib_proyeccion.mjs';
import { lineasDesdeCotas } from './lib_mesas.mjs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { F, VER } = cargaSimulador(ROOT);
const { T } = terrenoComoLaPagina(F, datos, 500, 0);
const LIN = lineasDesdeCotas(datos, 0);
const Z0 = 0.17, CW = datos.cuerda, UMB = [1e-4, 1e-2];
/* VARIANTE por elevación del sol: a sol rasante las sombras miden cientos de
   metros y todo sombrea a todo; la cifra sin partir mezclaría ese régimen con
   el que cuesta energía. Se parte el umbral de 1 cm² en tres bandas. */
const BANDAS = [['<3°', 0, 3], ['3-10°', 3, 10], ['≥10°', 10, 91]];
const banda = e => BANDAS.findIndex(([, a, b]) => e >= a && e < b);
const MES = []; LIN.forEach((L, r) => L.mesas.forEach((m, k) => MES.push({ r, k, m })));
const iDe = new Map(MES.map((q, i) => [q.r + '|' + q.k, i]));
const solapaN = (a, b) => Math.min(a.n[1], b.n[1]) > Math.max(a.n[0], b.n[0]);
const enumMesa = (R, E) => Math.abs(R.r - E.r) === 1 && solapaN(R.m, E.m);        // rama por mesa, :2690
const enumLinea = (R, E) => Math.abs(R.r - E.r) === 1;                              // rama por línea
console.log(`R5 · FASE 0 · ${VER} · Ayora ${LIN.length} líneas · ${MES.length} mesas en la x de su FILA`);

/* candidatos para el GEMELO: cilindro de radio ρ = cw/2 + z0 alrededor del eje, en la vista del sol */
const RHO = CW / 2 + Z0;
function candidatosGemelo(s) {
  const ref = Math.abs(s[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
  const e1 = (() => { const c = [s[1] * ref[2] - s[2] * ref[1], s[2] * ref[0] - s[0] * ref[2], s[0] * ref[1] - s[1] * ref[0]]; const l = Math.hypot(...c); return c.map(v => v / l); })();
  const e2 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const K = MES.map(({ m }) => { const P = [[m.x, m.n[0], m.z[0]], [m.x, m.n[1], m.z[1]]];
    const u = P.map(p => p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2]), v = P.map(p => p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]), d = P.map(p => p[0] * s[0] + p[1] * s[1] + p[2] * s[2]);
    return { b: [Math.min(...u) - RHO, Math.max(...u) + RHO, Math.min(...v) - RHO, Math.max(...v) + RHO], dmin: Math.min(...d) - RHO, dmax: Math.max(...d) + RHO }; });
  const G = 4, cel = new Map(), cl = (i, j) => i * 100003 + j;
  K.forEach((k, i) => { for (let a = Math.floor(k.b[0] / G); a <= Math.floor(k.b[1] / G); a++) for (let b = Math.floor(k.b[2] / G); b <= Math.floor(k.b[3] / G); b++) { const c = cl(a, b); if (!cel.has(c)) cel.set(c, []); cel.get(c).push(i); } });
  return K.map((kr, r) => { const out = new Set();
    for (let a = Math.floor(kr.b[0] / G); a <= Math.floor(kr.b[1] / G); a++) for (let b = Math.floor(kr.b[2] / G); b <= Math.floor(kr.b[3] / G); b++)
      for (const e of (cel.get(cl(a, b)) || [])) { if (e === r) continue; const ke = K[e];
        if (ke.b[1] < kr.b[0] || ke.b[0] > kr.b[1] || ke.b[3] < kr.b[2] || ke.b[2] > kr.b[3] || !(ke.dmax > kr.dmin)) continue; out.add(e); }
    return [...out]; });
}

const DIAS = [['21-jun', 2026, 5, 21], ['21-dic', 2026, 11, 21]];
const nuevaCuenta = () => ({ multi_ri: 0, multi_mesas: new Set(), rel: 0, noMesa: 0, noLinea: 0, noMesa_mesas: new Set(), cat: {}, dir: {},
    gem_ri: 0, gemNo_b: 0, gemSi_bNo: 0, gemAmbas: 0, dif: [], inst: 0, ri: 0 });
const PB = BANDAS.map(nuevaCuenta);
const acc = { instantes: 0, recep_inst: 0,
  u: UMB.map(() => ({ multi_ri: 0, multi_mesas: new Set(), rel: 0, noMesa: 0, noLinea: 0, noMesa_mesas: new Set(), cat: {}, dir: {},
    gem_ri: 0, gemNo_b: 0, gemSi_bNo: 0, gemAmbas: 0, dif: [] })) };
const clase = (R, E) => {
  const dl = E.r - R.r, ns = solapaN(R.m, E.m) ? 'solapa' : (E.m.n[0] >= R.m.n[1] ? 'al norte' : 'al sur');
  return `Δlínea ${dl === 0 ? '0' : (Math.abs(dl) >= 3 ? (dl > 0 ? '≥+3' : '≤−3') : (dl > 0 ? '+' + dl : String(dl)))} · ${ns}`;
};
const rumbo = (R, E) => { const dx = E.m.x - R.m.x, dy = (E.m.n[0] + E.m.n[1] - R.m.n[0] - R.m.n[1]) / 2; const a = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(a / 45) % 8]; };
for (const [nm, Y, Mo, Dd] of DIAS) {
  const doy = F.doyOf(`${Y}-${String(Mo + 1).padStart(2, '0')}-${Dd}`);
  for (let min = 0; min < 1440; min += 5) {
    const g = F.solarPos(Date.UTC(Y, Mo, Dd, 0, min), lay.clat, lay.clon);
    if (!(g.elev > 0.5)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, datos.base, 3.5);
    const lin = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, 0.2).angles, ast = F.policyAngles('astro', g.zen, g.az, T, irr, doy, 0.2).angles;
    if (!lin.some((v, r) => Math.abs(v - ast[r]) > 0.1)) continue;
    const ang = F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, 0.2), s = vectorSol(g.zen, g.az);
    acc.instantes++; const B = PB[banda(g.elev)]; B.inst++;
    const C = MES.map(({ r, k, m }) => caraMesa(m, ang[r][k], Z0, CW));
    const rel = relaciones(C, s), cg = candidatosGemelo(s);
    C.forEach((R, i) => {
      if (!(s[0] * R.nr[0] + s[1] * R.nr[1] + s[2] * R.nr[2] > 1e-12)) return;          // sin haz: no hay sombra que medir
      acc.recep_inst++; B.ri++;
      /* (a) gemelo: cada candidato girado al θ del receptor */
      const polA = []; for (const e of cg[i]) { const sh = sombraSobre(caraMesa(MES[e].m, R.theta, Z0, CW), R, s); if (sh && sh.area > 0) polA.push(sh); }
      [[UMB[0], acc.u[0]], [UMB[1], acc.u[1]], [UMB[0], B]].forEach(([umb, A]) => {
        const efec = rel[i].filter(x => x.area > umb);
        if (efec.length >= 2) { A.multi_ri++; A.multi_mesas.add(i); }
        for (const x of efec) { A.rel++; const Rq = MES[i], Eq = MES[x.e];
          if (!enumMesa(Rq, Eq)) { A.noMesa++; A.noMesa_mesas.add(i); } if (!enumLinea(Rq, Eq)) A.noLinea++;
          const c = clase(Rq, Eq); A.cat[c] = (A.cat[c] || 0) + 1; const d = rumbo(Rq, Eq); A.dir[d] = (A.dir[d] || 0) + 1; }
        const aA = polA.filter(x => x.area > umb), fb = fraccionArea(R, efec.map(x => x.poly), 256), fa = fraccionArea(R, aA.map(x => x.poly), 256);
        const sa = aA.length > 0, sb = efec.length > 0;
        if (sa || sb) { A.gem_ri++; A.dif.push(fb - fa); if (!sa && sb) A.gemNo_b++; if (sa && !sb) A.gemSi_bNo++; if (sa && sb) A.gemAmbas++; }
      });
    });
  }
  console.error(`  ${nm}: ${acc.instantes} instantes acumulados`);
}
console.log(`\nDENOMINADOR · ${acc.instantes} instantes con BT activo · ${acc.recep_inst} receptor×instante con haz (de ${acc.instantes * MES.length})`);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
UMB.forEach((umb, u) => {
  const A = acc.u[u];
  console.log(`\n═══ emisor efectivo = sombra > ${umb * 1e4} cm² ═══`);
  console.log(`  TEST NULO · relaciones que la rama por mesa NO enumera: ${A.noMesa} de ${A.rel} · casos en que gemelo (a) y real (b) difieren en presencia: ${A.gemNo_b + A.gemSi_bNo}${(A.noMesa && (A.gemNo_b + A.gemSi_bNo)) ? '' : '   ⚠ LA FASE 0 NO INFORMA en esto'}`);
  console.log(`  0.1 · receptor×instante con ≥2 emisores efectivos: ${A.multi_ri} · mesas distintas: ${A.multi_mesas.size} de ${MES.length}`);
  console.log(`  0.2 · relaciones emisor→receptor efectivas: ${A.rel} · NO enumeradas por la rama por mesa: ${A.noMesa} (${(100 * A.noMesa / Math.max(1, A.rel)).toFixed(1)} %) en ${A.noMesa_mesas.size} mesas · NO enumeradas por la rama por línea (r±1): ${A.noLinea} (${(100 * A.noLinea / Math.max(1, A.rel)).toFixed(1)} %)`);
  console.log(`  0.3 · por relación (Δlínea emisor−receptor · norte/sur): ` + Object.entries(A.cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' | '));
  console.log(`        por rumbo del emisor visto desde el receptor: ` + Object.entries(A.dir).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`  0.4 · receptor×instante con sombra en (a) o (b): ${A.gem_ri} · el GEMELO dice «sin sombra» y con los θ reales HAY: ${A.gemNo_b} · al revés: ${A.gemSi_bNo} · las dos con sombra: ${A.gemAmbas}`);
  console.log(`        fracción real − fracción gemelo (pp): mín ${(100 * q(A.dif, 0)).toFixed(3)} · p10 ${(100 * q(A.dif, 0.1)).toFixed(3)} · mediana ${(100 * q(A.dif, 0.5)).toFixed(3)} · p90 ${(100 * q(A.dif, 0.9)).toFixed(3)} · máx ${(100 * q(A.dif, 1)).toFixed(3)}`);
});
console.log(`\n═══ POR ELEVACIÓN DEL SOL · emisor efectivo = sombra > 1 cm² ═══`);
console.log(`  banda    instantes  rec×inst   ≥2 emisores (mesas)   relaciones  NO enum. mesa        NO enum. línea   gemelo no/real sí   gemelo sí/real no   real−gemelo p10/p90 (pp)`);
PB.forEach((A, b) => console.log(`  ${BANDAS[b][0].padEnd(7)} ${String(A.inst).padStart(9)} ${String(A.ri).padStart(9)}   ${String(A.multi_ri).padStart(8)} (${String(A.multi_mesas.size).padStart(4)})   ${String(A.rel).padStart(10)}  ${String(A.noMesa).padStart(7)} (${(100 * A.noMesa / Math.max(1, A.rel)).toFixed(1).padStart(4)} %)  ${String(A.noLinea).padStart(7)} (${(100 * A.noLinea / Math.max(1, A.rel)).toFixed(1).padStart(4)} %)  ${String(A.gemNo_b).padStart(10)}          ${String(A.gemSi_bNo).padStart(10)}          ${(100 * q(A.dif, 0.1)).toFixed(3)} / ${(100 * q(A.dif, 0.9)).toFixed(3)}`));
PB.forEach((A, b) => console.log(`  ${BANDAS[b][0]} · por relación: ` + Object.entries(A.cat).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join(' | ')));
const dest = arg('json', '');
if (dest) fs.writeFileSync(path.join(ROOT, dest), JSON.stringify({ ver: VER, denominador: { instantes: acc.instantes, receptor_instante: acc.recep_inst, mesas: MES.length },
  umbrales_m2: UMB, por_elevacion: PB.map((A, b) => ({ banda: BANDAS[b][0], instantes: A.inst, receptor_instante: A.ri, multi_ri: A.multi_ri, multi_mesas: A.multi_mesas.size,
    relaciones: A.rel, no_enum_mesa: A.noMesa, no_enum_linea: A.noLinea, por_clase: A.cat, gemelo_no_real_si: A.gemNo_b, gemelo_si_real_no: A.gemSi_bNo, ambas: A.gemAmbas,
    dif_pp_p10: 100 * q(A.dif, 0.1), dif_pp_p90: 100 * q(A.dif, 0.9) })), resultados: acc.u.map((A, u) => ({ umbral_m2: UMB[u], multi_ri: A.multi_ri, multi_mesas: A.multi_mesas.size, relaciones: A.rel, no_enum_mesa: A.noMesa,
  no_enum_linea: A.noLinea, no_enum_mesa_mesas: A.noMesa_mesas.size, por_clase: A.cat, por_rumbo: A.dir, gemelo: { con_sombra: A.gem_ri, gemelo_no_real_si: A.gemNo_b, gemelo_si_real_no: A.gemSi_bNo, ambas: A.gemAmbas,
  dif_pp: { min: 100 * q(A.dif, 0), p10: 100 * q(A.dif, 0.1), med: 100 * q(A.dif, 0.5), p90: 100 * q(A.dif, 0.9), max: 100 * q(A.dif, 1) } } })) }, null, 1));
