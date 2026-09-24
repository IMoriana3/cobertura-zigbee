/* R5 · FASE A.2 (b) — LA SOMBRA QUE EL CONTADOR NO PUEDE VER POR CONSTRUCCIÓN.
 *
 *   node audit5/A2_fuera_de_dominio.mjs [ayora|sanjose] [--paso=20]
 *
 * El contador de la página cuenta dentro de lo que la página carga: UNA BANDA
 * de ≤ 79 líneas de UN bloque (`plantFromCotas(data,80,blockIdx)`), con un solo
 * azimut de eje (`T.axisAz`), y sin las mesas de su propia línea
 * (`backtracking.html:2189`). Todo emisor fuera de eso no existe para él, por
 * mucho que la poda fuera perfecta. Aquí se mide cuánta sombra real viene de
 * ahí, con el motor de proyección de la fase 1 (enumeración por cono sin poda
 * de alcance, validada contra fuerza bruta: `audit5/test_motor.mjs`) sobre la
 * PLANTA ENTERA —los dos bloques— en la x de su FILA.
 *
 * θ: el `pairwise` por mesa que publica la página, calculado bloque a bloque con
 * el bloque ENTERO (`plantFromCotas(datos,500,b)`; el casado mesa a mesa es el
 * de F1_careo_ayora: `ang[r][k]` ↔ `lineasDesdeCotas(datos,b)[r].mesas[k]`).
 *
 * Cada relación de sombra (receptor, emisor) se clasifica:
 *   (solo receptores DENTRO de la banda: los de fuera la página no los simula,
 *   y se cuentan aparte) OTRO_BLOQUE · FUERA_DE_BANDA (emisor en una línea que
 *   la banda no carga) · MISMA_LINEA (en la x de su FILA, que el contador no
 *   usa: con la x de línea las mesas de una línea son colineales) · DENTRO.
 * Por receptor: fracción de área con TODOS sus emisores frente a solo DENTRO
 * (unión, no suma); la diferencia es sombra que el contador no puede contar.
 * «Haz tapado» = fracción × DNI de cielo claro, sumado (W/m²·mesa), por banda de sol.
 * TEST NULO: con los emisores DENTRO, la fracción «solo DENTRO» es la de todos
 * cuando no hay relaciones fuera (se comprueba mesa a mesa en cada instante).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vectorSol, caraMesa, relaciones, fraccionArea } from './lib_proyeccion.mjs';
import { lineasDesdeCotas } from './lib_mesas.mjs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PL = process.argv[2] || 'ayora';
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const PASO = +arg('paso', 20), NS = 64, Z0 = 0.17;
const { F, VER } = cargaSimulador(ROOT, []);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, `${PL}_cotas.json`), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, `${PL}_layout.json`), 'utf-8'));
const CW = datos.cuerda, ALT = datos.base || 0;
/* bloques, mesas y la banda de la página */
const B = [];
for (let b = 0; ; b++) {
  let L; try { L = lineasDesdeCotas(datos, b); } catch (e) { break; } if (!L || !L.length) break;
  const T = terrenoComoLaPagina(F, datos, 500, b).T;
  if (T.segs.length !== L.length || T.segs.some((l, r) => l.length !== L[r].mesas.length)) throw new Error(`bloque ${b}: el casado mesa a mesa no cuadra`);
  const banda = new Set(F.plantFromCotas(datos, 80, b).lineXAbs.map(x => +x.toFixed(2)));   // x ABSOLUTA: `lineX` es relativa al origen de cada carga
  const Pb = F.plantFromCotas(datos, 500, b);
  const enBanda = Pb.lineXAbs.map(x => banda.has(+x.toFixed(2)));
  if (enBanda.filter(Boolean).length !== F.plantFromCotas(datos, 80, b).lineXAbs.length) throw new Error(`bloque ${b}: la banda de la página no casa por x absoluta`);
  B.push({ b, L, T, enBanda });
}
const mesas = [];   // {b, r, k, m, enBanda}
B.forEach(({ b, L, enBanda }) => L.forEach((Ln, r) => Ln.mesas.forEach((m, k) => mesas.push({ b, r, k, m, enBanda: enBanda[r] }))));
const bandas = [[0, 3], [3, 10], [10, 90]];
const acc = bandas.map(() => ({ inst: 0, receptorFuera: 0, rel: { OTRO_BLOQUE: 0, FUERA_DE_BANDA: 0, MISMA_LINEA: 0, DENTRO: 0 }, hazTodo: 0, hazDentro: 0, mesasConPerdida: 0, mesasConPerdida1pp: 0, peor: 0 }));
let nuloMal = 0;
const t0 = Date.now();
for (const [mo, dd] of [[5, 21], [11, 21]]) {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-${dd}`, doy = F.doyOf(ds);
  for (let min = 0; min < 1440; min += PASO) {
    const g = F.solarPos(Date.UTC(2026, mo, dd) + min * 60000, lay.clat, lay.clon);
    if (!(g.elev > 0.5)) continue;
    const irr = F.clearskyIneichen(g.zen, doy, ALT, 3.5);
    const ang = B.map(({ T }) => F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, doy, 0.2));
    const s = vectorSol(g.zen, g.az);
    const C = mesas.map(q => caraMesa(q.m, ang[B.findIndex(x => x.b === q.b)][q.r][q.k], Z0, CW));
    const rel = relaciones(C, s);
    const A = acc[bandas.findIndex(([lo, hi]) => g.elev >= lo && g.elev < hi)]; A.inst++;
    rel.forEach((lst, i) => {
      if (!lst.length) return;
      const R = mesas[i], dentro = [];
      /* un receptor FUERA de la banda la página no lo simula: no es sombra que
         el contador pierda, es una mesa que no calcula. Se cuenta aparte. */
      if (!R.enBanda) { A.receptorFuera += lst.length; return; }
      for (const x of lst) {
        const E = mesas[x.e];
        const cl = E.b !== R.b ? 'OTRO_BLOQUE' : !E.enBanda ? 'FUERA_DE_BANDA' : E.r === R.r ? 'MISMA_LINEA' : 'DENTRO';
        A.rel[cl]++; if (cl === 'DENTRO') dentro.push(x.poly);
      }
      const fT = fraccionArea(C[i], lst.map(x => x.poly), NS), fD = fraccionArea(C[i], dentro, NS);
      if (dentro.length === lst.length && Math.abs(fT - fD) > 1e-15) nuloMal++;
      A.hazTodo += fT * irr.dni; A.hazDentro += fD * irr.dni;
      if (fT - fD > 1e-9) { A.mesasConPerdida++; if (fT - fD > 0.01) A.mesasConPerdida1pp++; A.peor = Math.max(A.peor, fT - fD); }
    });
  }
  console.error(`  ${PL} ${ds}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const R = { planta: PL, ver: VER, bloques: B.map(x => ({ b: x.b, lineas: x.L.length, en_banda: x.enBanda.filter(Boolean).length })), mesas: mesas.length, paso_min: PASO,
  test_nulo_fallos: nuloMal, bandas: bandas.map(([lo, hi], i) => ({ sol: `${lo}-${hi}°`, ...acc[i] })), s: (Date.now() - t0) / 1000 };
console.log(`R5 · A.2 (b) · sombra fuera del dominio del contador · ${VER} · ${PL.toUpperCase()} planta entera: ${R.bloques.map(b => `bloque ${b.b} ${b.lineas} líneas (${b.en_banda} en la banda de la página)`).join(' · ')} · ${mesas.length} mesas · 21-jun y 21-dic cada ${PASO} min · solo planos, sin terreno`);
console.log(`  TEST NULO · receptores sin relaciones fuera: fracción «todo» = «solo dentro» en todos (${nuloMal} fallos)`);
console.log('  sol      inst   rel. con receptor fuera de banda (no simulado)   relaciones: OTRO_BLOQUE / FUERA_DE_BANDA / MISMA_LINEA / DENTRO   mesas×inst con sombra que el contador no ve (>0 / >1 pp, peor)   haz tapado: todo / solo dentro');
for (const b of R.bandas) console.log(`  ${b.sol.padEnd(7)} ${String(b.inst).padStart(4)}   ${b.receptorFuera}   ${b.rel.OTRO_BLOQUE} / ${b.rel.FUERA_DE_BANDA} / ${b.rel.MISMA_LINEA} / ${b.rel.DENTRO}   ${b.mesasConPerdida} / ${b.mesasConPerdida1pp}, ${(100 * b.peor).toFixed(2)} pp   ${b.hazTodo.toFixed(1)} / ${b.hazDentro.toFixed(1)}`);
console.log(`  coste: ${R.s.toFixed(0)} s (máquina OCUPADA: declarado, no es una medida de tiempo)`);
fs.writeFileSync(path.resolve(ROOT, arg('json', `audit5/out/A2_fuera_de_dominio_${PL}.json`)), JSON.stringify(R));
