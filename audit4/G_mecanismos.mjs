/* R4 · ¿CUÁNTOS hallazgos de F_sombra_extremos son del mecanismo del caso de
 * 609 mm? — sombra que cae en una mesa vecina que NO SOLAPA en norte con la
 * mesa que la proyecta (la política por mesa solo compara mesas que solapan,
 * `backtracking.html:2690`). Se lee el JSON de F_sombra_extremos y la
 * geometría del verificador; no se recalcula ningún ángulo.
 *
 *   node audit4/G_mecanismos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineasDesdeCotas } from './lib_sombra_geo.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit4/out/F_sombra_extremos_antes.json'), 'utf-8'));
const LIN = lineasDesdeCotas(datos, 0);
const banda = e => e < 1 ? '<1°' : e < 3 ? '1–3°' : e < 6 ? '3–6°' : e < 10 ? '6–10°' : '≥10°';
const BANDAS = ['<1°', '1–3°', '3–6°', '6–10°', '≥10°'];
for (const rama of ['linea', 'mesa']) {
  const H = J.ramas[rama].hallazgos.filter(h => h.evitable);
  const acc = {};
  for (const h of H) {
    const a = LIN[h.emisor].mesas[h.mesaE], b = LIN[h.receptor].mesas[h.mesaR];
    const sol = Math.min(a.n[1], b.n[1]) - Math.max(a.n[0], b.n[0]);
    const tipo = sol > 0 ? 'SOLAPA' : 'NO SOLAPA';
    const k = tipo + '|' + banda(h.elev);
    acc[k] = acc[k] || { n: 0, mesas: new Set(), mm: [] };
    acc[k].n++; acc[k].mesas.add(h.receptor + '|' + h.mesaR); acc[k].mm.push(h.intr_m * 1000);
  }
  console.log(`\nRAMA ${rama.toUpperCase()} · ${H.length} extremos con sombra EVITABLE > 1 mm`);
  console.log(`  ${'receptor/emisor'.padEnd(11)} ${'sol'.padEnd(6)} ${'extremos'.padStart(8)} ${'mesas'.padStart(6)}   mediana   p90     máx (mm)`);
  for (const tipo of ['SOLAPA', 'NO SOLAPA']) for (const b of BANDAS) {
    const v = acc[tipo + '|' + b]; if (!v) continue;
    const s = v.mm.sort((x, y) => x - y), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    console.log(`  ${tipo.padEnd(11)} ${b.padEnd(6)} ${String(v.n).padStart(8)} ${String(v.mesas.size).padStart(6)}   ${q(0.5).toFixed(0).padStart(6)} ${q(0.9).toFixed(0).padStart(6)} ${s[s.length - 1].toFixed(0).padStart(7)}`);
  }
}

/* ── CONTROL DE MODELO: ¿cuántos desaparecen con las mesas en la x de LÍNEA? ─
   Se cruza cada hallazgo evitable (instante, emisor, mesa emisora, extremo)
   con la corrida `--x=linea`. Los que desaparecen son SOLO diferencia de x
   entre el levantamiento (fila) y el simulador (línea). */
const PX = path.join(ROOT, 'audit4/out/F_sombra_extremos_xlinea.json');
if (fs.existsSync(PX)) {
  const X = JSON.parse(fs.readFileSync(PX, 'utf-8'));
  console.log(`\nCONTROL DE MODELO · mismos hallazgos con las mesas en la x de su LÍNEA (F_sombra_extremos_xlinea.json)`);
  for (const rama of ['linea', 'mesa']) {
    const clave = h => `${h.dia}|${h.utc}|${h.emisor}|${h.mesaE}|${h.extremo}|${h.par}`;
    const enX = new Set(X.ramas[rama].hallazgos.filter(h => h.evitable).map(clave));
    const H = J.ramas[rama].hallazgos.filter(h => h.evitable);
    const acc = {};
    for (const h of H) {
      const a = LIN[h.emisor].mesas[h.mesaE], b = LIN[h.receptor].mesas[h.mesaR];
      const tipo = (Math.min(a.n[1], b.n[1]) - Math.max(a.n[0], b.n[0])) > 0 ? 'SOLAPA' : 'NO SOLAPA';
      const k = tipo + '|' + (h.elev >= 10 ? '≥10°' : '<10°');
      acc[k] = acc[k] || { n: 0, sigue: 0, mesasSigue: new Set(), mmSigue: 0 };
      acc[k].n++;
      if (enX.has(clave(h))) { acc[k].sigue++; acc[k].mesasSigue.add(h.receptor + '|' + h.mesaR); acc[k].mmSigue = Math.max(acc[k].mmSigue, h.intr_m * 1000); }
    }
    const nX = X.ramas[rama].hallazgos.filter(h => h.evitable).length;
    console.log(`  RAMA ${rama.toUpperCase()} · evitables: ${H.length} con x de fila → ${nX} con x de línea`);
    for (const k of Object.keys(acc).sort()) { const v = acc[k];
      console.log(`    ${k.padEnd(16)} ${String(v.n).padStart(6)} extremos · siguen con x de línea ${String(v.sigue).padStart(6)} (${(100 * v.sigue / v.n).toFixed(1)} %) en ${v.mesasSigue.size} mesas, máx ${v.mmSigue.toFixed(0)} mm`); }
  }
}
