/* R4 · P0 — VERIFICADOR GEOMÉTRICO INDEPENDIENTE DE SOMBRA EN LOS EXTREMOS.
 *
 *   node audit4/F_sombra_extremos.mjs [--rama=linea|mesa|ambas] [--json=RUTA] [--ci]
 *
 * Para cada solape mesa a / mesa b entre dos líneas vecinas de la banda, en los
 * DOS extremos del solape, con los θ que el simulador PUBLICA hoy, comprueba si
 * la arista alta de la mesa que sombrea mete su sombra en el módulo vecino.
 * Sombra > 0 ⇔ intrusión del rayo sobre el módulo vecino > 1 mm.
 *
 * INDEPENDENCIA, y cómo se garantiza. La geometría vive en
 * `audit4/lib_sombra_geo.mjs`, que NO IMPORTA NADA: no puede llamar a
 * `singleaxis`, a `pairDz` ni a ninguna función de pendiente porque no los
 * alcanza. Este script lo comprueba leyendo el fichero antes de empezar. Del
 * simulador solo se usan (a) los θ publicados, como DATOS, y (b) la posición
 * del sol (`solarPos`), que no es una función de pendiente.
 *
 * QUÉ θ. El simulador publica el θ de `pairwise` por DOS caminos:
 *   · rama LÍNEA — `policyAngles('pairwise', …)`, la que usa `pairDz`
 *     (`backtracking.html:4664-4668`); la usan los dos anuales;
 *   · rama MESA  — `policyAnglesSeg('pairwise', …)` → `anglesPairwiseSeg`
 *     (`:2675`), la que publica el DÍA con levantamiento; NO usa `pairDz`.
 * Se mide la CONSIGNA (lo que la política manda), antes del lazo: es donde vive
 * el defecto que se persigue. El lazo añade su adelanto y su tope aparte.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineasDesdeCotas, intrusion, aoi, zEn, tauDe, centroCara, marco } from './lib_sombra_geo.mjs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_publicado.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const RAMAS = arg('rama', 'ambas') === 'ambas' ? ['linea', 'mesa'] : [arg('rama', 'linea')];
const UMBRAL = 0.001;                                      // m — sombra > 0 ⇔ intrusión > 1 mm
const Z0 = 0.17;

/* ── INDEPENDENCIA, comprobada sobre el fichero y no prometida ───────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'audit4/lib_sombra_geo.mjs'), 'utf-8');
  const imports = (src.match(/^\s*import\s|require\s*\(/gm) || []).length;
  console.log(`INDEPENDENCIA · audit4/lib_sombra_geo.mjs tiene ${imports} import/require`);
  if (imports !== 0) throw new Error('la geometría del verificador importa algo: ya no es independiente');
}

const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, CW = datos.cuerda;

/* ── CONTROL DEL INSTRUMENTO: el caso de libro ─────────────────────────────
   Dos filas llanas coplanarias. La frontera de sombra es la fórmula clásica
   θ_bt = ψ − signo(ψ)·acos(cos ψ / GCR). Un grado más allá TIENE que haber
   sombra y un grado más acá NO. Si no, el verificador no sabe medir. */
{
  const D = Math.PI / 180, P = 6.0, GCR = CW / P;
  const fila = (x) => ({ x, n: [0, 40], z: [0, 0] });
  let bien = true; const out = [];
  for (const [e, este] of [[10, true], [20, true], [10, false], [20, false]]) {
    const s = [(este ? 1 : -1) * Math.cos(e * D), 0, Math.sin(e * D)];
    const psi = (90 - e) * (este ? 1 : -1);
    const tbt = psi - Math.sign(psi) * Math.acos(Math.min(1, Math.cos(psi * D) / GCR)) / D;
    const [em, re] = este ? [fila(P), fila(0)] : [fila(0), fila(P)];
    const a = intrusion(em, re, 20, tbt + Math.sign(psi), tbt + Math.sign(psi), s, CW, Z0).intr;
    const b = intrusion(em, re, 20, tbt - Math.sign(psi), tbt - Math.sign(psi), s, CW, Z0).intr;
    const ok = a > UMBRAL && b === 0; bien = bien && ok;
    out.push(`${este ? 'mañana' : 'tarde'} ${e}°: +1° → ${(1000 * a).toFixed(1)} mm, −1° → ${(1000 * b).toFixed(3)} mm ${ok ? '✓' : '✗'}`);
  }
  console.log('CONTROL DEL INSTRUMENTO · caso de libro (dos filas llanas, GCR ' + (CW / 6).toFixed(4) + ')');
  for (const l of out) console.log('  ' + l);
  if (!bien) throw new Error('el verificador no reproduce el caso de libro');
}

/* ── LA GEOMETRÍA DEL VERIFICADOR, desde las cotas en bruto ─────────────── */
const LIN = lineasDesdeCotas(datos, 0);
/* --x=linea: CONTROL DE MODELO, no veredicto. Coloca cada mesa en la x de su
   LÍNEA, como hace el simulador (`backtracking.html:1946-1948`, xs acumulado
   por pitch de pareja), en vez de la x de su FILA del levantamiento. Sirve para
   separar qué parte de los hallazgos es sólo esa diferencia de modelo. */
const X_LINEA = process.argv.includes('--x=linea');
if (X_LINEA) for (const L of LIN) for (const m of L.mesas) m.x = L.x;
if (X_LINEA) console.log('VARIANTE · --x=linea: mesas en la x de su LÍNEA (modelo del simulador), NO en la de su fila');
const nMesas = LIN.reduce((s, L) => s + L.mesas.length, 0);

/* ── LO QUE EL SIMULADOR PUBLICA, y la correspondencia entre las dos ─────── */
const { F, VER } = cargaSimulador(ROOT);
const { P, T } = terrenoComoLaPagina(F, datos, 500, 0);
{
  /* CONTROL DE CORRESPONDENCIA: mis líneas y mis mesas tienen que ser LAS
     MISMAS que las del simulador, o el θ de cada mesa se le asignaría a otra.
     P.segs va recentrado en norte por nMid; se deshace. */
  /* nMid se recupera de la mesa 0 de la línea 0 y se COMPRUEBA en las 1.708:
     si ese desplazamiento fuera el equivocado, no cuadraría ninguna otra. */
  const nMid = LIN[0].mesas[0].n[0] - P.segs[0][0][0];
  /* y la cota: el simulador resta a TODAS las segZ la cota media de línea
     (`eMean`, `backtracking.html:1716-1718`). Es una TRASLACIÓN PURA y no
     cambia ninguna sombra, pero hay que COMPROBAR que es pura: se recupera
     de una mesa y se exige que el desplazamiento sea el mismo en todas. La
     primera versión de este control pedía igualdad y paró la corrida con
     |Δz| = 33,1 m — que es exactamente esa eMean. */
  const eMean = LIN[0].mesas[0].z[0] - P.segZ[0][0][0];
  let dX = 0, dN = 0, dZ = 0, nMal = 0;
  if (LIN.length !== P.lineX.length) throw new Error(`líneas: verificador ${LIN.length}, simulador ${P.lineX.length}`);
  for (let i = 0; i < LIN.length; i++) {
    dX = Math.max(dX, Math.abs(LIN[i].x - P.lineXAbs[i]));
    if (LIN[i].mesas.length !== P.segs[i].length) { nMal++; continue; }
    for (let k = 0; k < LIN[i].mesas.length; k++) {
      const m = LIN[i].mesas[k];
      dN = Math.max(dN, Math.abs(m.n[0] - nMid - P.segs[i][k][0]), Math.abs(m.n[1] - nMid - P.segs[i][k][1]));
      dZ = Math.max(dZ, Math.abs(m.z[0] - eMean - P.segZ[i][k][0]), Math.abs(m.z[1] - eMean - P.segZ[i][k][1]));
    }
  }
  console.log(`\nCONTROL DE CORRESPONDENCIA · verificador contra simulador (${VER})`);
  console.log(`  líneas ${LIN.length} = ${P.lineX.length} · mesas ${nMesas} · líneas con distinto nº de mesas: ${nMal}`);
  console.log(`  peor |Δx| de línea ${dX.toExponential(2)} m · peor |Δn| de mesa ${dN.toExponential(2)} m (tras nMid) · peor |Δz| ${dZ.toExponential(2)} m (tras eMean = ${eMean.toFixed(6)} m, traslación pura)`);
  if (nMal || dN > 1e-6 || dZ > 1e-6) throw new Error('las mesas del verificador no son las del simulador: la asignación de θ sería falsa');
}

/* ── LOS SOLAPES ─────────────────────────────────────────────────────────── */
const SOL = [];
for (let i = 0; i + 1 < LIN.length; i++)
  for (let a = 0; a < LIN[i].mesas.length; a++) for (let b = 0; b < LIN[i + 1].mesas.length; b++) {
    const A = LIN[i].mesas[a], B = LIN[i + 1].mesas[b];
    const lo = Math.max(A.n[0], B.n[0]), hi = Math.min(A.n[1], B.n[1]);
    if (hi > lo) SOL.push({ par: i, a, b, lo, hi });
  }
console.log(`\nDENOMINADOR · ${LIN.length} líneas · ${nMesas} mesas · ${LIN.length - 1} parejas · ${SOL.length} solapes mesa-mesa · ${2 * SOL.length} extremos`);

/* ── LOS INSTANTES: cada 5 min con el sol entre 0,5° y 40°, y de ellos los de
   BACKTRACKING ACTIVO — la rama LÍNEA publica en alguna línea un θ que se
   aparta del astronómico más de 0,1°. ──────────────────────────────────── */
const DIAS = [['21-jun', 2026, 5, 21, 2], ['21-dic', 2026, 11, 21, 1]];   // [nombre, año, mes0, día, UTC+h]
const INST = [];
const t0 = Date.now();
for (const [nm, Y, Mo, Dd, off] of DIAS) {
  const doy = F.doyOf(`${Y}-${String(Mo + 1).padStart(2, '0')}-${Dd}`);
  let nBT = 0;
  for (let min = 0; min < 1440; min += 5) {
    const ms = Date.UTC(Y, Mo, Dd, 0, min);
    const g = F.solarPos(ms, LAT, LON);
    if (!(g.elev > 0.5 && g.elev <= 40)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    const lin = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, 0.2).angles;
    const ast = F.policyAngles('astro', g.zen, g.az, T, irr, doy, 0.2).angles;
    let bt = false; for (let r = 0; r < lin.length; r++) if (Math.abs(lin[r] - ast[r]) > 0.1) { bt = true; break; }
    if (!bt) continue;
    const mes = RAMAS.includes('mesa') ? F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, 0.2) : null;
    const hh = Math.floor((min + off * 60) / 60) % 24, mm = (min + off * 60) % 60;
    INST.push({ dia: nm, utc: new Date(ms).toISOString().slice(11, 16), local: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
                zen: g.zen, az: g.az, elev: g.elev, manana: g.az < 180, lin, ast, mes });
    nBT++;
  }
  console.log(`  ${nm}: ${nBT} instantes con backtracking activo · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (nBT < 12) throw new Error(`${nm}: menos de 12 instantes con backtracking activo`);
}

/* ── EL VERIFICADOR ─────────────────────────────────────────────────────────
   Para cada instante, solape y extremo: emisor = la línea del lado del sol.
   El rayo desde su arista alta se desplaza en norte; se busca en qué mesa de
   la línea receptora cae el impacto, y se mide la intrusión en ESA mesa. */
function verifica(thetaDe, etiqueta) {
  const hallazgos = []; let evaluados = 0, sinHaz = 0, fueraDeMesa = 0;
  for (const I of INST) {
    const D = Math.PI / 180;
    const s = [Math.sin(I.zen * D) * Math.sin(I.az * D), Math.sin(I.zen * D) * Math.cos(I.az * D), Math.cos(I.zen * D)];
    const solEste = s[0] > 0;
    for (const S of SOL) {
      const li = S.par, lj = S.par + 1;
      const [lE, kE, lR] = solEste ? [lj, S.b, li] : [li, S.a, lj];   // emisor = el del lado del sol
      const em = LIN[lE].mesas[kE];
      for (const [extremo, n] of [['S', S.lo], ['N', S.hi]]) {
        evaluados++;
        const thE = thetaDe(I, lE, kE);
        // ¿en qué mesa del receptor cae el impacto? se prueba cada una y vale la que lo contiene
        let mejor = null;
        for (let kR = 0; kR < LIN[lR].mesas.length; kR++) {
          const re = LIN[lR].mesas[kR];
          const thR = thetaDe(I, lR, kR);
          const r = intrusion(em, re, n, thE, thR, s, CW, Z0);
          if (r.nImpacto == null) continue;
          if (r.nImpacto >= re.n[0] && r.nImpacto <= re.n[1]) { mejor = { r, kR, thR, re }; break; }
        }
        if (!mejor) { fueraDeMesa++; continue; }
        if (aoi(mejor.re, mejor.thR, s) >= 90) { sinHaz++; continue; }
        if (mejor.r.intr > UMBRAL) {
          /* ¿EVITABLE O IRREDUCIBLE? Se barre un θ COMÚN a emisor y receptor
             —la hipótesis de pairwise para una pareja— de −θmáx a +θmáx cada
             0,1°, dentro del cono de haz del receptor (AOI < 90°). Si ALGUNO
             deja la intrusión ≤ 1 mm, la sombra es EVITABLE y es un defecto de
             la consigna. Si NINGUNO, es IRREDUCIBLE: el terreno tapa al sol
             gire el seguidor lo que gire (`backtracking.html:3487`: «El terreno
             no se repara: ninguna consigna levanta una loma»). */
          let limpio = null;
          for (let k = 0; k <= 1100; k++) {
            const th = -55 + k * 0.1;
            if (aoi(mejor.re, th, s) >= 90) continue;
            const q = intrusion(em, mejor.re, n, th, th, s, CW, Z0);
            /* limpio = la sombra no cae en ESTA mesa: o la intrusión es ≤ 1 mm, o
               el impacto sale de la mesa (entonces cae en otra, que tiene su propio
               solape y su propia comprobación). Primera versión exigía impacto
               DENTRO y ≤ 1 mm: contaba como irreducible la sombra que se va de la
               mesa — sesgo hacia la tesis «T5 imposible» (A3), corregido. */
            const fuera = q.nImpacto == null || q.nImpacto < mejor.re.n[0] || q.nImpacto > mejor.re.n[1];
            if (fuera || q.intr <= UMBRAL) {
              if (limpio == null || Math.abs(th - thE) < Math.abs(limpio - thE)) limpio = th;
            }
          }
          /* Si ningún θ COMÚN la quita, segunda oportunidad: θ emisor y θ receptor
             INDEPENDIENTES (rejilla de 1°, 111×111). Solo si tampoco así se quita
             se llama IRREDUCIBLE. */
          let par = null;
          if (limpio == null) {
            for (let i = 0; i <= 110 && !par; i++) for (let j = 0; j <= 110; j++) {
              const tE = -55 + i, tR = -55 + j;
              if (aoi(mejor.re, tR, s) >= 90) continue;
              const q = intrusion(em, mejor.re, n, tE, tR, s, CW, Z0);
              const fuera = q.nImpacto == null || q.nImpacto < mejor.re.n[0] || q.nImpacto > mejor.re.n[1];
              if (fuera || q.intr <= UMBRAL) { par = [tE, tR]; break; }
            }
          }
          hallazgos.push({ dia: I.dia, local: I.local, utc: I.utc, manana: I.manana, elev: +I.elev.toFixed(3),
                           par: S.par, receptor: lR, mesaR: mejor.kR, filaR: mejor.re.fila, emisor: lE, mesaE: kE,
                           lado: solEste ? 'E' : 'O', extremo, n: +n.toFixed(3),
                           thE: +thE.toFixed(4), thR: +mejor.thR.toFixed(4), intr_m: +mejor.r.intr.toFixed(4),
                           evitable: limpio != null || par != null, theta_limpio: limpio == null ? null : +limpio.toFixed(1),
                           par_limpio: par });
        }
      }
    }
  }
  return { etiqueta, hallazgos, evaluados, sinHaz, fueraDeMesa };
}
const thLinea = (I, l, k) => I.lin[l];
const thMesa = (I, l, k) => I.mes[l][k];
const thAstro = (I, l, k) => I.ast[l];

function informe(R) {
  const porFila = new Map();
  for (const h of R.hallazgos) {
    const k = `${h.receptor}|${h.filaR}`;
    if (!porFila.has(k) || porFila.get(k).intr_m < h.intr_m) porFila.set(k, h);
  }
  const mesas = new Set(R.hallazgos.map(h => `${h.receptor}|${h.mesaR}`));
  console.log(`\n═══ ${R.etiqueta} ═══`);
  console.log(`  extremos evaluados ${R.evaluados} · sin haz en el receptor ${R.sinHaz} · impacto fuera de toda mesa ${R.fueraDeMesa}`);
  console.log(`  CON SOMBRA > 1 mm: ${R.hallazgos.length} extremos · ${mesas.size} mesas distintas · ${porFila.size} filas`);
  const ev = R.hallazgos.filter(h => h.evitable), ir = R.hallazgos.filter(h => !h.evitable);
  const mEv = new Set(ev.map(h => `${h.receptor}|${h.mesaR}`)), mIr = new Set(ir.map(h => `${h.receptor}|${h.mesaR}`));
  const eMax = ev.reduce((m, h) => Math.max(m, h.elev), 0), iMax = ir.reduce((m, h) => Math.max(m, h.elev), 0);
  console.log(`    · EVITABLE (algún θ —común, o emisor≠receptor— en el cono de haz la quita): ${ev.length} extremos · ${mEv.size} mesas · elevación solar hasta ${eMax.toFixed(3)}°`);
  console.log(`    · IRREDUCIBLE (ningún θ común cada 0,1° ni par (θE,θR) cada 1° la quita): ${ir.length} extremos · ${mIr.size} mesas · elevación solar hasta ${iMax.toFixed(3)}°`);
  R.evitables = ev; R.mesasEvitables = mEv.size;
  const top = [...porFila.values()].sort((a, b) => b.intr_m - a.intr_m).slice(0, 12);
  if (top.length) {
    console.log('  por fila, la peor (máx 12):   línea fila            lado ext  día     local  θ_emisor  θ_recep   intrusión');
    for (const h of top)
      console.log(`    ${String(h.receptor).padStart(28)}  ${String(h.filaR).padEnd(14)}  ${h.lado}    ${h.extremo}   ${h.dia}  ${h.local}  ${h.thE.toFixed(3).padStart(8)}  ${h.thR.toFixed(3).padStart(8)}  ${(1000 * h.intr_m).toFixed(1).padStart(7)} mm`);
  }
  return { porFila: [...porFila.values()], mesas: mesas.size };
}

/* CONTROL POSITIVO (A1/A3): con el seguimiento ASTRONÓMICO —sin backtracking—
   tiene que haber sombra de sobra. Si no la hubiera, un «0» de abajo no
   significaría nada: el verificador no sabría encontrarla. */
const RA = verifica(thAstro, 'CONTROL POSITIVO · θ astronómico (sin backtracking)');
const IA = informe(RA);
if (RA.hallazgos.length === 0) throw new Error('con seguimiento astronómico el verificador no encuentra sombra: no sabe medir');

const RES = {};
for (const rama of RAMAS) {
  const R = verifica(rama === 'linea' ? thLinea : thMesa,
    rama === 'linea' ? 'RAMA LÍNEA · policyAngles(pairwise) — usa pairDz' : 'RAMA MESA · policyAnglesSeg(pairwise) — no usa pairDz');
  RES[rama] = { R, I: informe(R) };
}

/* ── PUERTA P0 ───────────────────────────────────────────────────────────────
   Sombra en el extremo NORTE de la pareja 2 —línea 2 sombreada por la 3— por
   la MAÑANA del 21-jun. Se evalúa en la rama LÍNEA, que es la que usa pairDz. */
console.log('\n═══ PUERTA P0 · extremo NORTE de la pareja 2, línea 2 sombreada por la 3, mañana del 21-jun ═══');
for (const rama of RAMAS) {
  const hits = RES[rama].R.hallazgos.filter(h => h.par === 2 && h.receptor === 2 && h.emisor === 3 && h.extremo === 'N' && h.dia === '21-jun' && h.manana);
  const mx = hits.reduce((m, h) => Math.max(m, h.intr_m), 0);
  console.log(`  rama ${rama.padEnd(5)}: ${hits.length} instantes con sombra · intrusión máxima ${(1000 * mx).toFixed(1)} mm`);
  for (const h of hits.slice(0, 6)) console.log(`      ${h.local} (elev ${h.elev}°) · n ${h.n} · θ emisor ${h.thE}° · θ receptor ${h.thR}° · ${(1000 * h.intr_m).toFixed(1)} mm`);
}

/* EL DESGLOSE GEOMÉTRICO DE ESE PUNTO, se abra o no la puerta: es lo que el
   encargo pide si no se abre, y lo que hace falta para creerla si se abre. */
{
  const solN = SOL.filter(S => S.par === 2).reduce((m, S) => (!m || S.hi > m.hi) ? S : m, null);
  const I = INST.filter(x => x.dia === '21-jun' && x.manana).reduce((m, x) => (!m || x.elev < m.elev) ? x : m, null);
  if (solN && I) {
    const em = LIN[3].mesas[solN.b], re = LIN[2].mesas[solN.a], n = solN.hi;
    console.log(`\n  DESGLOSE en n = ${n.toFixed(3)} (extremo norte del solape más al norte de la pareja 2), ${I.dia} ${I.local}, elev ${I.elev.toFixed(3)}°`);
    console.log(`    cota emisor (línea 3, mesa ${solN.b}) en n: ${zEn(em, n).toFixed(4)} m · tilt ${(tauDe(em) * 180 / Math.PI).toFixed(4)}°`);
    console.log(`    cota receptor (línea 2, mesa ${solN.a}) en n: ${zEn(re, n).toFixed(4)} m · tilt ${(tauDe(re) * 180 / Math.PI).toFixed(4)}°`);
    console.log(`    Δz en ese extremo (receptor − emisor): ${(zEn(re, n) - zEn(em, n)).toFixed(4)} m · dx ${(em.x - re.x).toFixed(4)} m`);
    for (const rama of RAMAS) {
      const th = rama === 'linea' ? I.lin[3] : I.mes[3][solN.b], thr = rama === 'linea' ? I.lin[2] : I.mes[2][solN.a];
      const D = Math.PI / 180, s = [Math.sin(I.zen * D) * Math.sin(I.az * D), Math.sin(I.zen * D) * Math.cos(I.az * D), Math.cos(I.zen * D)];
      const r = intrusion(em, re, n, th, thr, s, CW, Z0);
      console.log(`    rama ${rama}: θ publicado emisor ${th.toFixed(4)}° / receptor ${thr.toFixed(4)}° · arista alta a z ${r.P ? r.P[2].toFixed(4) : '—'} m · el rayo llega al plano receptor a z ${r.H ? r.H[2].toFixed(4) : '—'} m, u ${r.u != null ? r.u.toFixed(4) : '—'} m (borde a +${(CW / 2).toFixed(3)}) · intrusión ${(1000 * r.intr).toFixed(1)} mm`);
    }
  }
}

const dest = arg('json', '');
if (dest) {
  const p = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ver: VER, sitio: { lat: LAT, lon: LON, alt: ALT }, cuerda: CW, z0: Z0, umbral_m: UMBRAL,
    denominador: { lineas: LIN.length, mesas: nMesas, solapes: SOL.length, instantes: INST.length },
    control_positivo: { extremos_con_sombra: RA.hallazgos.length, mesas: IA.mesas },
    ramas: Object.fromEntries(Object.entries(RES).map(([k, v]) => [k, { evaluados: v.R.evaluados, sinHaz: v.R.sinHaz,
      fueraDeMesa: v.R.fueraDeMesa, extremos_con_sombra: v.R.hallazgos.length, mesas_con_sombra: v.I.mesas,
      hallazgos: v.R.hallazgos, por_fila: v.I.porFila }])) }, null, 1));
  console.log(`\nJSON en ${dest}`);
}
if (process.argv.includes('--ci')) {
  const n = Object.values(RES).reduce((s, v) => s + v.I.mesas, 0);
  console.log(`\n--ci · mesas con sombra > 1 mm: ${n}`);
  process.exit(n === 0 ? 0 : 1);
}
