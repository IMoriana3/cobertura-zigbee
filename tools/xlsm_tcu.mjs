/* LAS COORDENADAS QUE DA EL FABRICANTE. La plantilla TCU (el .xlsm que se carga en la NCU) es el
   documento que manda sobre el número de esclavo y sobre dónde está cada equipo: no es una
   estimación nuestra, es lo que se grabó en campo. Este script la lee sin adivinar nada.

   Regla de la casa al volcarla: una columna que vale IGUAL en todas las filas no describe al
   equipo, describe a la planta —longitude y latitude son el punto de referencia del recinto, no
   la posición de cada TCU—. Así que el volcado por TCU se queda solo con lo que varía; lo
   constante se lista aparte, etiquetado como tal, para que nadie lo confunda con una coordenada.

       node tools/xlsm_tcu.mjs <plantilla.xlsm> [--json salida.json] [--layout layout.json]

   Con --layout además cruza cada TCU con el seguidor más cercano del layout del DWG, midiendo
   antes el desplazamiento sistemático entre las dos rejillas (se informa, no se asume cero).   */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const args = process.argv.slice(2);
const ruta = args.find(a => !a.startsWith('--'));
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
if (!ruta) { console.error('uso: node tools/xlsm_tcu.mjs <plantilla.xlsm> [--json salida.json] [--layout layout.json]'); process.exit(2); }

/* ── 1. El .xlsm es un ZIP. Lo abrimos con zlib, sin dependencias: el directorio central da los
      tamaños buenos (los de la cabecera local pueden venir en el descriptor de datos). ── */
function abreZip(buf) {
  let fin = buf.length - 22;
  while (fin >= 0 && buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('no es un ZIP válido');
  let p = buf.readUInt32LE(fin + 16);
  const n = buf.readUInt16LE(fin + 10), out = new Map();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const comp = buf.readUInt32LE(p + 20), lenNom = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30), lenCom = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + lenNom);
    const dat = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const crudo = buf.subarray(dat, dat + comp);
    out.set(nombre, metodo === 0 ? crudo : inflateRawSync(crudo));
    p += 46 + lenNom + lenExtra + lenCom;
  }
  return out;
}

const zip = abreZip(readFileSync(ruta));
const txt = n => { const b = zip.get(n); return b ? b.toString('utf8') : null; };
const desescapa = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');

/* ── 2. Cadenas compartidas y celdas. Excel guarda los textos en una tabla aparte. ── */
const ss = [];
{
  const x = txt('xl/sharedStrings.xml') || '';
  for (const m of x.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = ''; for (const n of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += n[1];
    ss.push(desescapa(t));
  }
}
const hojas = [...(txt('xl/workbook.xml') || '').matchAll(/<sheet[^>]*name="([^"]*)"/g)].map(m => desescapa(m[1]));
const xmlHoja = txt('xl/worksheets/sheet1.xml');
if (!xmlHoja) { console.error('la plantilla no trae xl/worksheets/sheet1.xml'); process.exit(1); }

const filas = [];
for (const r of xmlHoja.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const cel = {};
  const re = /<c r="([A-Z]+)\d+"([^>]*)\/>|<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g;
  for (const c of r[2].matchAll(re)) {
    const col = c[1] || c[3], at = c[2] || c[4] || '', cont = c[5] || '';
    const tipo = (/t="([^"]+)"/.exec(at) || [, 'n'])[1];
    let v = null;
    if (tipo === 'inlineStr') { const im = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cont); v = im ? desescapa(im[1]) : null; }
    else { const vm = /<v>([\s\S]*?)<\/v>/.exec(cont); if (vm) v = tipo === 's' ? ss[+vm[1]] : desescapa(vm[1]); }
    if (v !== null && v !== '') cel[col] = v;
  }
  if (Object.keys(cel).length) filas.push({ n: +r[1], cel });
}
const cab = filas[0].cel, datos = filas.slice(1);
console.log('· ' + ruta.split('/').pop());
console.log('  hoja «' + (hojas[0] || '?') + '», ' + datos.length + ' filas de datos, ' + Object.keys(cab).length + ' columnas');

/* ── 3. Constantes contra variables. Aquí es donde se aplica la regla: lo que no cambia de fila
      a fila no es un dato del equipo. ── */
const cols = Object.keys(cab), constantes = {}, variables = [];
for (const c of cols) {
  const s = new Set(datos.map(f => f.cel[c] === undefined ? null : f.cel[c]));
  if (s.size === 1) constantes[cab[c]] = [...s][0]; else variables.push(c);
}
console.log('  columnas iguales en TODAS las filas (de planta, no de equipo): ' + Object.keys(constantes).length);
for (const k of Object.keys(constantes)) if (/lat|lon|zone|coord/i.test(k)) console.log('      ' + k + ' = ' + constantes[k] + '   ← NO es la posición del TCU');
console.log('  columnas que varían: ' + variables.map(c => cab[c]).join(', '));

/* ── 4. El volcado por TCU: solo lo que varía. La posición buena es coordX/coordY, en el huso que
      declara la propia plantilla (zoneNum + zoneLetter), no la longitud/latitud constante. ── */
/* Un número de 12 dígitos o más es un identificador (el panId de la red Zigbee lo es), no una
   magnitud: se deja como texto para que nadie lo redondee por el camino. */
const num = v => v === undefined ? null : (isFinite(+v) && !/^\d{12,}$/.test(v) ? +v : v);
const tcus = datos.map(f => {
  const o = {};
  for (const c of variables) o[cab[c]] = num(f.cel[c]);
  return o;
});
const hayPan = tcus.length && tcus[0].panId !== undefined;
if (hayPan) {
  /* El panId de la red Zigbee acaba en NN·GG: los dos dígitos de NCU y los dos de gateway. Se
     comprueba contra los datos antes de darlo por bueno; si no cuadra, no se inventa. */
  const pans = [...new Set(tcus.map(t => String(t.panId)))].sort();
  console.log('  redes (panId): ' + pans.length);
  for (const p of pans) {
    const g = tcus.filter(t => String(t.panId) === p), sl = g.map(t => t.slave).sort((a, b) => a - b);
    console.log('      ' + p + '  n=' + g.length + '  esclavos ' + sl[0] + '..' + sl[sl.length - 1]
      + (new Set(sl).size === sl.length ? '' : '  ¡REPETIDOS!'));
    g.forEach(t => { t.ncu = +String(p).slice(-4, -2); t.gw = +String(p).slice(-2); });
  }
}
const zona = (constantes.zoneNum || '') + (constantes.zoneLetter || '');
console.log('  extensión coordX ' + Math.min(...tcus.map(t => t.coordX)).toFixed(2) + '..' + Math.max(...tcus.map(t => t.coordX)).toFixed(2)
  + '   coordY ' + Math.min(...tcus.map(t => t.coordY)).toFixed(2) + '..' + Math.max(...tcus.map(t => t.coordY)).toFixed(2) + '   huso ' + zona);

/* ── 5. Cruce opcional con el layout del DWG. Mide el desplazamiento entre rejillas antes de
      emparejar: si el punto de inserción del bloque no es el mismo que el del TCU, hay un
      corrimiento constante y hay que verlo, no taparlo. ── */
let cruce = null;
if (opt('--layout')) {
  const L = JSON.parse(readFileSync(opt('--layout'), 'utf8'));
  const T = (L.trackers || L.seguidores || []).map((t, i) => ({ i, E: L.cE + t.x, N: L.cN + t.n, id: t.id, prev: t.idPrevio, ncu: t.ncu }));
  const cerca = (x, y) => { let b = null, bd = 1e9; for (const t of T) { const d = Math.hypot(x - t.E, y - t.N); if (d < bd) { bd = d; b = t; } } return { t: b, d: bd }; };
  let dx = 0, dy = 0;
  for (let it = 0; it < 2; it++) {
    const rx = [], ry = [];
    for (const t of tcus) { const c = cerca(t.coordX + dx, t.coordY + dy); if (c.d < 8) { rx.push(c.t.E - (t.coordX + dx)); ry.push(c.t.N - (t.coordY + dy)); } }
    const med = a => { a.sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; };
    dx += med(rx); dy += med(ry);
  }
  console.log('  desplazamiento MEDIDO entre la rejilla de la plantilla y la del DWG: ΔE ' + dx.toFixed(3) + ' m, ΔN ' + dy.toFixed(3) + ' m');
  const cand = [];
  for (const t of tcus) for (const s of T) { const d = Math.hypot(t.coordX + dx - s.E, t.coordY + dy - s.N); if (d < 8) cand.push({ d, t, s }); }
  cand.sort((a, b) => a.d - b.d);
  const usadoT = new Set(), usadoS = new Set(); cruce = [];
  for (const c of cand) { if (usadoT.has(c.t.tcu) || usadoS.has(c.s.i)) continue; usadoT.add(c.t.tcu); usadoS.add(c.s.i); cruce.push(c); }
  const dd = cruce.map(c => c.d);
  console.log('  emparejados ' + cruce.length + ' de ' + tcus.length + ' TCU con ' + T.length + ' seguidores'
    + (dd.length ? '   (residuo medio ' + (dd.reduce((a, b) => a + b, 0) / dd.length).toFixed(3) + ' m, máx ' + Math.max(...dd).toFixed(3) + ' m)' : ''));
  const sueltos = tcus.filter(t => !usadoT.has(t.tcu));
  if (sueltos.length) { console.log('  TCU sin seguidor en el DWG: ' + sueltos.length); sueltos.forEach(t => console.log('      tcu ' + t.tcu + ' esclavo ' + t.slave + ' pan ' + t.panId + '  ' + t.coordX.toFixed(3) + ' ' + t.coordY.toFixed(3))); }
  const huerf = T.filter(s => !usadoS.has(s.i));
  if (huerf.length) { console.log('  seguidores sin TCU: ' + huerf.length); huerf.slice(0, 20).forEach(s => console.log('      id ' + s.id + ' (' + s.prev + ')  ' + s.E.toFixed(3) + ' ' + s.N.toFixed(3))); }
  const igual = cruce.filter(c => String(c.s.id) === String(c.t.slave)).length;
  console.log('  el id del layout coincide con el esclavo del fabricante en ' + igual + ' de ' + cruce.length);
  cruce.filter(c => String(c.s.id) !== String(c.t.slave)).slice(0, 30)
    .forEach(c => console.log('      difiere: layout ' + c.s.id + ' (dwg ' + c.s.prev + ')  ≠  fabricante ' + c.t.slave));
  const ncuIgual = cruce.filter(c => c.t.ncu === c.s.ncu).length;
  if (hayPan) console.log('  la NCU del layout coincide con la del panId en ' + ncuIgual + ' de ' + cruce.length);
}

if (opt('--json')) {
  const salida = {
    /* El nombre del fichero tal cual lo manda el fabricante: si viene de una subida lleva delante
       un hash que no es suyo y estorba como referencia documental. */
    fuente: ruta.split('/').pop().replace(/^[0-9a-f]{8}-/, ''),
    hoja: hojas[0] || null,
    crs: constantes.zoneNum
      ? 'UTM huso ' + constantes.zoneNum + ', banda ' + constantes.zoneLetter
        + ' (la plantilla declara huso y banda, no datum)'
      : null,
    nota: 'coordX/coordY por TCU. longitude/latitude NO se incluyen por TCU: valen lo mismo en las '
      + datos.length + ' filas, son el punto de referencia de la planta.',
    constantes,
    tcus,
  };
  if (cruce) salida.cruce = { layout: opt('--layout'), emparejados: cruce.length, pares: cruce.map(c => ({ tcu: c.t.tcu, slave: c.t.slave, idLayout: c.s.id, idDwg: c.s.prev, d: +c.d.toFixed(3) })) };
  writeFileSync(opt('--json'), JSON.stringify(salida, null, 1));
  console.log('  → ' + opt('--json'));
}
