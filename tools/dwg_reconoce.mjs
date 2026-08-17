/* RECONOCIMIENTO de un DWG: qué capas trae, qué entidades hay en cada una, qué bloques se insertan
   y dónde cae todo. Es el primer paso ANTES de extraer nada: sin esto se acaba adivinando qué capa
   es un seguidor y qué capa es una anotación, y de ahí salen las geometrías inventadas.
   No escribe nada: solo cuenta lo que hay.

       node tools/dwg_reconoce.mjs <fichero.dwg> [--capas] [--bloques]                            */
import { LibreDwg } from '@mlightcad/libredwg-web';
import { readFileSync } from 'node:fs';

const [ruta, ...rest] = process.argv.slice(2);
if (!ruta) { console.error('uso: node tools/dwg_reconoce.mjs <fichero.dwg> [--capas] [--bloques]'); process.exit(2); }
const lib = await LibreDwg.create();
if (typeof lib.dwg_bmp === 'function') lib.dwg_bmp = () => null;   // la miniatura BMP rompe la conversión en algunos ficheros
const db = lib.convert(lib.dwg_read_data(readFileSync(ruta).buffer, 0));
const E = db.entities || [];
const gx = e => e.x ?? e.insertionPoint?.x ?? e.startPoint?.x ?? e.center?.x;
const gy = e => e.y ?? e.insertionPoint?.y ?? e.startPoint?.y ?? e.center?.y;

console.log('· ' + ruta.split('/').pop());
console.log('  entidades ' + E.length.toLocaleString('es'));

/* Recuento por CAPA y tipo: lo que dice de qué va el plano. */
const porCapa = new Map();
for (const e of E) {
  const k = e.layer || '(sin capa)';
  let m = porCapa.get(k); if (!m) porCapa.set(k, m = { n: 0, tipos: new Map(), bloques: new Map() });
  m.n++;
  m.tipos.set(e.type, (m.tipos.get(e.type) || 0) + 1);
  if (e.type === 'INSERT') { const b = e.name || e.blockName || '?'; m.bloques.set(b, (m.bloques.get(b) || 0) + 1); }
}
const capas = [...porCapa.entries()].sort((a, b) => b[1].n - a[1].n);
console.log('  capas ' + capas.length);
for (const [k, m] of capas) {
  const t = [...m.tipos.entries()].sort((a, b) => b[1] - a[1]).map(([a, b]) => a + '×' + b).join(' ');
  const bl = m.bloques.size ? '   bloques: ' + [...m.bloques.entries()].sort((a, b) => b[1] - a[1]).map(([a, b]) => a + '×' + b).join(', ') : '';
  console.log('    ' + String(m.n).padStart(6) + '  ' + k.padEnd(34) + t + bl);
}

/* Extensión del dibujo: dice si viene georreferenciado (coordenadas UTM grandes) o en local. */
let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18, n = 0;
for (const e of E) { const x = gx(e), y = gy(e); if (!isFinite(x) || !isFinite(y)) continue; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
if (n) {
  console.log('  extensión  X ' + x0.toFixed(1) + ' .. ' + x1.toFixed(1) + '   (' + (x1 - x0).toFixed(0) + ' m)');
  console.log('             Y ' + y0.toFixed(1) + ' .. ' + y1.toFixed(1) + '   (' + (y1 - y0).toFixed(0) + ' m)');
  const utm = x0 > 100000 && x0 < 1000000 && y0 > 1000000;
  console.log('  georreferencia: ' + (utm ? 'parece UTM (coordenadas absolutas)' : 'coordenadas LOCALES o desplazadas'));
}

/* Rótulos de texto: de aquí salen los nombres de NCU/HSU y a veces la escala y el huso. */
const TXT = E.filter(e => e.type === 'TEXT' || e.type === 'MTEXT')
  .map(e => (e.text ?? e.textValue ?? '').toString().trim()).filter(Boolean);
console.log('  textos ' + TXT.length);
const interesa = TXT.filter(t => /NCU|HSU|TCU|UTM|ETRS|WGS|EPSG|ESCALA|E:\s*1|\d{6,7}[.,]\d|MW|kWp|módulo|modulo|string/i.test(t));
[...new Set(interesa)].slice(0, 40).forEach(t => console.log('    « ' + t.replace(/\s+/g, ' ').slice(0, 150) + ' »'));
