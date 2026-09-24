/* BT3D · resumen del anual de `conoHaz` (página frente a la fórmula del comentario).
 *   node audit5/F0_conohaz_resumen.mjs
 * Lee audit5/out/F0_conohaz_anual_<pol>.json de las nueve políticas y publica lo
 * que haya: una política con menos de 12 meses sale como PARCIAL y su Δ no es anual.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POLS = ['astro', 'global', 'row', 'bt2d', 'pairwise', 'true3d', 'mgl', 'optimal', 'optfree'];
console.log('| política | meses | anual página kWh/m² | anual corregida | Δ % | \\|Δθ\\| máx | instantes que llaman a conoHaz |');
console.log('|---|---|---|---|---|---|---|');
for (const p of POLS) {
  let R; try { R = JSON.parse(fs.readFileSync(path.join(ROOT, `audit5/out/F0_conohaz_anual_${p}.json`), 'utf-8')); } catch (e) { console.log(`| ${p} | — | en curso | | | | |`); continue; }
  const s = k => R.meses.reduce((a, m) => a + m[k], 0), n = R.meses.length, pa = s('pagina'), co = s('corregida');
  const fmt = v => v.toFixed(4).replace('.', ',');
  console.log(`| ${p} | ${n}/12${n < 12 ? ' **PARCIAL**' : ''} | ${fmt(pa)} | ${fmt(co)} | ${(100 * (co / pa - 1)).toFixed(4).replace('.', ',')} % | ${Math.max(...R.meses.map(m => m.dth_max)).toFixed(3).replace('.', ',')}° | ${s('instantes_con_llamada')} de ${s('instantes')} |`);
}
