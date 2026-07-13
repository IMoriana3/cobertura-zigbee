// Extrae la NUMERACIÓN EXACTA de strings del DWG de cableado (capa FDO Seguidores$0$Strings_numeración):
// 824 TEXT "G.I.T.S" (grupo.inversor.seguidor.string) con su posición → elburgo_strings.json.
// Da la asignación REAL string→seguidor→inversor (adiós estimaciones en la ficha del inversor).
// Uso: node tools/extract_strings.mjs /ruta/al/XG23003..Cableado_String..dwg
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync, writeFileSync } from 'node:fs';
const DWG = process.argv[2] || '/root/.claude/uploads/73817923-79b4-5d11-9e5e-27a79f17b20a/fbc61f7e-XG23003EL_BURGOCableado_String_03C.dwg';
const OUT = new URL('../elburgo_strings.json', import.meta.url).pathname;
const cE = 683562.922059555, cN = 4605080.984298119;   // origen local del layout (verificado con el match de seguidores)
const lib = await LibreDwg.create();
const db = lib.convert(lib.dwg_read_data(readFileSync(DWG).buffer, 0));
const E = (db.entities || []).filter(e => e.type === 'TEXT' && (e.layer || '').includes('Strings_numer'));
const out = [];
for (const e of E) {
  const m = String(e.text || '').trim().match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) continue;
  const p = e.startPoint || e.insertionPoint || { x: 0, y: 0 };
  out.push({ id: m[0], g: +m[1], i: +m[2], t: +m[3], s: +m[4], x: Math.round((p.x - cE) * 100) / 100, n: Math.round((p.y - cN) * 100) / 100 });
}
out.sort((a, b) => a.g - b.g || a.i - b.i || a.t - b.t || a.s - b.s);
const byInv = {};
for (const s of out) { const k = s.g + '.' + s.i; byInv[k] = (byInv[k] || 0) + 1; }
writeFileSync(OUT, JSON.stringify({ src: 'XEC0000471 Strings_numeración', count: out.length, byInv, strings: out }));
console.log('strings:', out.length, '· inversores:', Object.keys(byInv).length);
console.log('por inversor:', JSON.stringify(byInv));
