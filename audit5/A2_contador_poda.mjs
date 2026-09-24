/* R5 · FASE A.2 — ¿QUÉ DEJA FUERA LA PODA DEL CONTADOR? Contra fuerza bruta.
 *
 *   node audit5/A2_contador_poda.mjs [ayora|sanjose] [--paso=10] [--json=RUTA]
 *
 * El contador de la página (`shadeBand3DAll`, backtracking.html:1938) es la
 * vara con la que se mide la energía. Antes de decidir el ángulo con él hay que
 * saber qué no ve. Aquí se carea contra SÍ MISMO sin poda (lib_contador_bf.mjs):
 * misma aritmética por estación, mismas mesas, mismos θ; solo cambia qué
 * emisores entran. La consigna es la que publica la página por mesa
 * (`policyAnglesSeg('pairwise', …)`), en la banda que carga la página
 * (`plantFromCotas(datos, 80, 0)`), 21-jun y 21-dic, cada `paso` min con sol > 0,5°.
 * Solo planos de módulo (`noStruct`) y SIN terreno: se aíslan los emisores.
 *
 * Variantes, por mesa (tramo) y por instante:
 *   P  · el contador con su poda (lo que mide la página, sin terreno)
 *   B  · sin poda de alcance ni de ventana axial, SIN la propia línea
 *   BM · B y además las mesas de la propia línea (nunca la propia mesa)
 * TEST NULO: el parcheado con la poda puesta y terreno = la página, BIT A BIT.
 * CONTROL NEGATIVO: con el alcance ×0,3 la poda TIENE que perder emisores.
 * Lo que la poda pierde = B − P; lo que la propia línea añade = BM − B.
 *
 * Lo que este guion NO puede ver, por construcción del contador: emisores de
 * OTRO BLOQUE y con OTRO AZIMUT DE EJE. La página simula un bloque
 * (`plantFromCotas(data,80,blockIdx)`) con un solo `T.axisAz`. Eso se mide
 * aparte con el motor de proyección sobre la planta entera (A2_otro_bloque.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
import { parcheBF } from './lib_contador_bf.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PL = process.argv[2] || 'ayora';
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const PASO = +arg('paso', 10);
const EXTRA = ['shadeBand3DAll', 'mvPara'];
const { F, VER } = cargaSimulador(ROOT, EXTRA);
const { F: Fp } = cargaSimulador(ROOT, [...EXTRA, '__bfSet'], parcheBF);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, `${PL}_cotas.json`), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, `${PL}_layout.json`), 'utf-8'));
const { T } = terrenoComoLaPagina(F, datos, 80, 0);
const ALT = datos.base || 0, TL = 3.5, ALB = 0.2;
const nR = T.pairs.length + 1, nMesas = T.segs.reduce((a, l) => a + l.length, 0);

const segs = sh => sh.seg.map(l => l.slice());
const emis = sh => sh.de.map(l => new Set(l.filter(([e]) => e !== 'terreno').map(([e]) => e)));
const R = { planta: PL, ver: VER, lineas: nR, mesas: nMesas, paso_min: PASO, nulo: null, control: null, instantes: [] };
const bandas = [[0, 3], [3, 10], [10, 90]];
const acc = bandas.map(() => ({ inst: 0, mesaInst: 0, conSombraB: 0, perdidasPoda: 0, perdidasPoda1pp: 0, ganaMisma: 0, ganaMisma1pp: 0,
  maxPoda: 0, maxMisma: 0, relB: 0, relPerdidas: 0, relMisma: 0, energiaP: 0, energiaB: 0, energiaBM: 0 }));
const t0 = Date.now();
for (const [mo, dd] of [[5, 21], [11, 21]]) {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-${dd}`, doy = F.doyOf(ds);
  const dia = Date.UTC(2026, mo, dd) - (lay.tz != null ? lay.tz : 0) * 3600000;
  for (let min = 0; min < 1440; min += PASO) {
    const g = F.solarPos(Date.UTC(2026, mo, dd) + min * 60000, lay.clat, lay.clon);
    if (!(g.elev > 0.5)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    const ang = F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, ALB);
    // TEST NULO (una vez, en el primer instante): el parcheado con poda y terreno = la página
    if (!R.nulo) {
      const a = F.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
      Fp.__bfSet({}); const b = Fp.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
      let d = 0; a.seg.forEach((l, r) => l.forEach((v, k) => { d = Math.max(d, Math.abs(v - b.seg[r][k])); }));
      R.nulo = { max_abs: d, iguales: JSON.stringify(a.seg) === JSON.stringify(b.seg) && JSON.stringify(a.de) === JSON.stringify(b.de) };
      if (!R.nulo.iguales) { console.log('TEST NULO FALLA: el parche cambia la cuenta', R.nulo); process.exit(2); }
    }
    Fp.__bfSet({ terreno: false }); const sP = Fp.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
    Fp.__bfSet({ terreno: false, poda: false }); const sB = Fp.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
    Fp.__bfSet({ terreno: false, poda: false, misma: true }); const sBM = Fp.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
    const bi = bandas.findIndex(([lo, hi]) => g.elev >= lo && g.elev < hi), A = acc[bi];
    A.inst++;
    const P = segs(sP), B = segs(sB), BM = segs(sBM), eP = emis(sP), eB = emis(sB), eBM = emis(sBM);
    const rec = { hora_utc: min / 60, dia: ds, elev: +g.elev.toFixed(2), perdidas_poda: [], misma_linea: [] };
    for (let r = 0; r < nR; r++) {
      for (let k = 0; k < P[r].length; k++) {
        A.mesaInst++;
        const dPoda = B[r][k] - P[r][k], dMis = BM[r][k] - B[r][k];
        if (B[r][k] > 1e-9) A.conSombraB++;
        if (dPoda > 1e-9) { A.perdidasPoda++; if (dPoda > 0.01) A.perdidasPoda1pp++; rec.perdidas_poda.push([r, k, +dPoda.toFixed(5)]); }
        if (dMis > 1e-9) { A.ganaMisma++; if (dMis > 0.01) A.ganaMisma1pp++; rec.misma_linea.push([r, k, +dMis.toFixed(5)]); }
        A.maxPoda = Math.max(A.maxPoda, dPoda); A.maxMisma = Math.max(A.maxMisma, dMis);
        // «energía» de sombra: fracción × DNI (W/m² de haz tapado), sumada; se reporta relativa
        A.energiaP += P[r][k] * irr.dni; A.energiaB += B[r][k] * irr.dni; A.energiaBM += BM[r][k] * irr.dni;
      }
      A.relB += eB[r].size; A.relMisma += eBM[r].size - eB[r].size;
      for (const e of eB[r]) if (!eP[r].has(e)) A.relPerdidas++;
    }
    // CONTROL NEGATIVO (una vez, en el primer instante con sombra): alcance ×0,3 tiene que perder
    /* el control tiene que MORDER: se prueba ×0,3, ×0,1 y ×0,03 en cada instante
       con sombra hasta que uno pierda; si ninguno pierde, el control no vale y se dice */
    if ((!R.control || !R.control.perdidas) && B.some(l => l.some(v => v > 1e-9))) {
      for (const k of [0.3, 0.1, 0.03]) {
        Fp.__bfSet({ terreno: false, encoge: k }); const sC = Fp.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true });
        let perd = 0; segs(sC).forEach((l, r) => l.forEach((v, kk) => { if (P[r][kk] - v > 1e-9) perd++; }));
        if (perd) { R.control = { dia: ds, elev: g.elev, encoge: k, perdidas: perd }; break; }
      }
      if (!R.control) R.control = { perdidas: 0 };
    }
    R.instantes.push(rec);
  }
  console.error(`  ${PL} ${ds}: ${R.instantes.length} instantes · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
R.bandas = bandas.map(([lo, hi], i) => ({ sol: `${lo}-${hi}°`, ...acc[i] }));
R.s = (Date.now() - t0) / 1000;
console.log(`R5 · A.2 · el contador contra sí mismo sin poda · ${VER} · ${PL.toUpperCase()} bloque 0, banda de la página (${nR} líneas, ${nMesas} mesas) · 21-jun y 21-dic cada ${PASO} min · solo planos, sin terreno`);
console.log(`  TEST NULO · parcheado con poda y terreno = la página: ${R.nulo.iguales ? 'BIT A BIT' : 'NO'} (máx |Δ| ${R.nulo.max_abs})`);
console.log(`  CONTROL NEGATIVO · alcance encogido: ${R.control && R.control.perdidas ? `×${R.control.encoge} (${R.control.dia}, sol ${R.control.elev.toFixed(1)}°): ${R.control.perdidas} mesas pierden sombra frente a la poda de la página` : 'NINGUNA reducción del alcance pierde sombra en ningún instante: el control NO VALE'}`);
console.log('  sol      inst  mesa×inst   con sombra (B)   PODA pierde (>0 / >1 pp, máx)   relaciones: de B / perdidas   PROPIA LÍNEA añade (>0 / >1 pp, máx)   rel. propia línea   haz tapado P / B / BM');
for (const b of R.bandas) console.log(`  ${b.sol.padEnd(7)} ${String(b.inst).padStart(4)} ${String(b.mesaInst).padStart(10)} ${String(b.conSombraB).padStart(12)}      ${b.perdidasPoda} / ${b.perdidasPoda1pp}, ${(100 * b.maxPoda).toFixed(3)} pp          ${b.relB} / ${b.relPerdidas}            ${b.ganaMisma} / ${b.ganaMisma1pp}, ${(100 * b.maxMisma).toFixed(3)} pp        ${b.relMisma}      ${b.energiaP.toFixed(1)} / ${b.energiaB.toFixed(1)} / ${b.energiaBM.toFixed(1)}`);
console.log(`  coste: ${R.s.toFixed(0)} s (máquina OCUPADA: declarado, no es una medida de tiempo)`);
fs.writeFileSync(path.resolve(ROOT, arg("json", `audit5/out/A2_contador_poda_${PL}.json`)), JSON.stringify(R));
