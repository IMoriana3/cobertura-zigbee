/* R4 · ¿DÓNDE deja de ser evitable la sombra al exigir el rango que la política
 * puede mandar (`rangoHaz`, `backtracking.html:983-998`)? Por elevación solar y
 * por solape en norte, las dos rutas. Lee F_sombra_extremos_antes.json.
 *   node audit4/G_rango.mjs
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
for (const rama of ['linea', 'mesa']) {
  const H = J.ramas[rama].hallazgos.filter(h => h.evitable);
  const acc = {};
  for (const h of H) {
    const a = LIN[h.emisor].mesas[h.mesaE], b = LIN[h.receptor].mesas[h.mesaR];
    const sol = (Math.min(a.n[1], b.n[1]) - Math.max(a.n[0], b.n[0])) > 0 ? 'SOLAPA' : 'NO SOLAPA';
    const k = sol + '|' + banda(h.elev);
    acc[k] = acc[k] || { n: 0, r: 0, mesasR: new Set(), mmR: [] };
    acc[k].n++;
    if (h.evitable_rango) { acc[k].r++; acc[k].mesasR.add(h.receptor + '|' + h.mesaR); acc[k].mmR.push(h.intr_m * 1000); }
  }
  console.log(`\nRAMA ${rama.toUpperCase()} · evitables (AOI < 90°) → evitables dentro de rangoHaz`);
  console.log(`  ${'solape'.padEnd(10)} ${'sol'.padEnd(6)} ${'evitables'.padStart(9)} ${'en rango'.padStart(9)} ${'%'.padStart(6)} ${'mesas'.padStart(6)}  mediana/p90/máx (mm) de los que siguen evitables en rango`);
  for (const sol of ['SOLAPA', 'NO SOLAPA']) for (const b of ['<1°', '1–3°', '3–6°', '6–10°', '≥10°']) {
    const v = acc[sol + '|' + b]; if (!v) continue;
    const s = v.mmR.sort((x, y) => x - y), q = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(0) : '—';
    console.log(`  ${sol.padEnd(10)} ${b.padEnd(6)} ${String(v.n).padStart(9)} ${String(v.r).padStart(9)} ${(100 * v.r / v.n).toFixed(1).padStart(6)} ${String(v.mesasR.size).padStart(6)}  ${q(0.5)}/${q(0.9)}/${s.length ? s[s.length - 1].toFixed(0) : '—'}`);
  }
}
