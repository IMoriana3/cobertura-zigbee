/* EL BANCO DE `pares_observados.mjs`.
 *
 * Existe porque el crudo del que se alimenta —248 MB del PC de la planta— NO
 * está en el repo, así que el útil no se puede probar contra él en CI. Lo que
 * sí se puede es probarlo contra CSV sintéticos que ejerciten cada decisión,
 * y eso es lo que hay aquí: la suciedad, la dirección, la frecuencia y el
 * manifiesto.
 *
 * LA SUCIEDAD SE PRUEBA, NO SE CONFÍA. Las dos políticas —el salto a sí mismo
 * descarta el SALTO y el nodo repetido descarta la RUTA— son decisiones, y una
 * decisión sin banco es una intención.
 *
 *   node tools/test_pares_observados.mjs
 *   MUTA=<clave> node tools/test_pares_observados.mjs   (TIENE que salir rojo)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UTIL = path.join(RAIZ, 'tools', 'pares_observados.mjs');

const MUTACIONES = {
  // el salto a sí mismo deja de descartarse: `a>a` entra como par
  tragaSaltoASiMismo: [/if \(ruta\.length && ruta\[ruta\.length - 1\] === x\) sucio\.saltoASiMismo\+\+; else ruta\.push\(x\);/,
                       'ruta.push(x);'],
  // la ruta con un nodo repetido entra entera, inventando las adyacencias del bucle
  tragaBucle: [/if \(new Set\(ruta\)\.size !== ruta\.length\) \{ sucio\.rutasConNodoRepetido\+\+; continue; \}/,
               'if (new Set(ruta).size !== ruta.length) { sucio.rutasConNodoRepetido++; }'],
  // el par pierde la dirección: `conInversoObservado` deja de significar nada
  sinDireccion: [/p\.n\+\+; if \(a === p\.a\) p\.ab\+\+; else p\.ba\+\+;/, 'p.n++; p.ab++;'],
  // el manifiesto pierde el sha: nadie sabe de qué exportación salió el número
  sinSha: [/sha256: sha256\(CSV\),/, 'sha256: null,'],
  // y la frecuencia se aplana: un par visto 1 vez pesa como uno visto 8.000
  sinFrecuencia: [/p\.n\+\+;/, 'p.n = 1;'],
  // la puerta del manifiesto se apaga: cualquier exportación pasa por la buena
  // la tabla se apaga: cualquier exportación pasa por declarada
  tragaOtroFichero: [/if \(!PROCEDENCIA\) \{\n  console\.log\(''\);/, "if (false) {\n  console.log('');"],
  // o la declaración puede mentir sin consecuencia
  tragaDeclaracionFalsa: [/if \(d\.length\) \{\n      console\.log\('    ROJO/, "if (false) {\n      console.log('    ROJO"],
};
const MUTA = process.env.MUTA;
let copia = null;
if (MUTA) {
  const m = MUTACIONES[MUTA];
  if (!m) { console.error('mutacion desconocida. Hay: ' + Object.keys(MUTACIONES).join(', ')); process.exit(2); }
  const orig = fs.readFileSync(UTIL, 'utf8');
  const nuevo = orig.replace(m[0], m[1]);
  if (nuevo === orig) { console.error('la mutacion «' + MUTA + '» no casó con el fuente'); process.exit(2); }
  copia = orig; fs.writeFileSync(UTIL, nuevo);
  console.log('### MUTACION «' + MUTA + '» PUESTA: este banco TIENE que salir rojo\n');
}
const restaura = () => { if (copia) fs.writeFileSync(UTIL, copia); };
process.on('exit', restaura);
process.on('SIGINT', () => { restaura(); process.exit(130); });

let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pares-'));
function corre(filas, nombre) {
  const csv = path.join(tmp, nombre + '.csv');
  fs.writeFileSync(csv, '"timestamp","target","hop_count","path_ids","path_addrs"\n' + filas.join('\n') + '\n');
  const out = path.join(tmp, nombre + '.json');
  const r = spawnSync(process.execPath, [UTIL, 'prueba', csv, '--salida', out], { encoding: 'utf8' });
  return { rc: r.status, txt: (r.stdout || '') + (r.stderr || ''),
           j: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null };
}
const fila = (ts, ruta) => '"' + ts + '","X","' + (ruta.split('>').length - 1) + '","' + ruta + '","-"';

/* ── 1 · LA RUTA NORMAL: cada par consecutivo es un salto ───────────────── */
console.log('· la ruta se trocea en pares consecutivos');
{
  const r = corre([fila('2026-06-16 13:50:38', 'A>B>C>COORD')], 'normal');
  /* rc = 2 y NO 0: estos CSV sintéticos son exportaciones SIN DECLARAR, que es
     justo lo que la tabla de EXPORTACIONES quiere que no pase en silencio. Los
     pares se escriben igual —el fichero puede ser bueno— pero la procedencia
     no está comprobada. */
  check('sale con 2: los pares están, la procedencia no', r.rc === 2, r.rc);
  check('y lo dice en la salida', /PROCEDENCIA SIN DECLARAR/.test(r.txt));
  check('con la línea lista para pegar en EXPORTACIONES', /planta: 'prueba', sha256: '[0-9a-f]{12}'/.test(r.txt), r.txt.slice(-400));
  check('el manifiesto lo marca', r.j.fuente.procedencia.declarada === false, r.j.fuente.procedencia);
  const p = r.j.pares.map(x => x.a + '-' + x.b).sort();
  check('tres pares de una ruta de cuatro nodos', p.length === 3, p);
  check('y son los consecutivos, no todos contra todos',
        p.join(' ') === 'A-B B-C C-COORD'.split(' ').sort().join(' '), p);
  check('el manifiesto trae el sha de la exportación', /^[0-9a-f]{64}$/.test(r.j.fuente.sha256 || ''), r.j.fuente.sha256);
  check('y la ventana', r.j.fuente.ventana.desde === '2026-06-16 13:50:38', r.j.fuente.ventana);
  check('y dice que el esquema v1 no declara zona', /SIN zona/.test(r.j.fuente.esquema));
}

/* ── 2 · EL SALTO A SÍ MISMO: fuera el SALTO, la ruta sigue ─────────────── */
console.log('\n· `a>a` descarta el salto, no la ruta');
{
  const r = corre([fila('t1', 'A>A>B>COORD')], 'auto');
  const p = r.j.pares.map(x => x.a + '-' + x.b).sort();
  check('el par A-A no existe', !p.includes('A-A'), p);
  check('pero los otros dos saltos de la ruta SÍ', p.length === 2, p);
  check('y queda contado', r.j.suciedad.saltoASiMismo === 1, r.j.suciedad);
}

/* ── 3 · EL BUCLE: fuera la RUTA ENTERA ─────────────────────────────────── */
console.log('\n· una ruta con un nodo repetido se descarta entera');
{
  const r = corre([fila('t1', 'A>B>A>C>COORD'), fila('t2', 'D>E>COORD')], 'bucle');
  const p = r.j.pares.map(x => x.a + '-' + x.b).sort();
  check('ningún par de la ruta con bucle', !p.includes('A-B') && !p.includes('A-C'), p);
  check('la ruta limpia sí entra', p.includes('D-E') && p.includes('COORD-E'), p);
  check('y queda contada', r.j.suciedad.rutasConNodoRepetido === 1, r.j.suciedad);
  check('la política va escrita en el manifiesto',
        /RUTA ENTERA/.test(r.j.suciedad.politica.rutasConNodoRepetido));
}

/* ── 4 · FRECUENCIA Y DIRECCIÓN ─────────────────────────────────────────── */
console.log('\n· la frecuencia y la dirección, que es lo que separa evidencia de anécdota');
{
  const f = [];
  for (let i = 0; i < 12; i++) f.push(fila('t' + i, 'A>B>COORD'));
  f.push(fila('tz', 'B>A>COORD'));          // el inverso de A-B, una vez
  f.push(fila('ty', 'C>D>COORD'));          // un par visto una sola vez
  const r = corre(f, 'frec');
  const ab = r.j.pares.find(x => x.a === 'A' && x.b === 'B');
  check('el par A-B se ha visto 13 veces', ab && ab.n === 13, ab);
  check('con los dos sentidos contados aparte', ab && ab.ab === 12 && ab.ba === 1, ab);
  check('el inverso observado se cuenta', r.j.recuento.conInversoObservado === 1, r.j.recuento);
  /* 2 y 3, COMPROBADO A MANO antes de escribirlo aqui: 12×A>B>COORD dan A-B 12
     y B-COORD 12; 1×B>A>COORD sube A-B a 13 y deja A-COORD en 1; 1×C>D>COORD
     deja C-D y D-COORD en 1. O sea >=10: A-B y B-COORD. Vistos 1: A-COORD,
     C-D, D-COORD. Mi primera expectativa decia 1 y era mia, no del util:
     se me olvido que cada ruta da VARIOS pares. */
  check('el corte de ≥10 coge los dos que lo pasan',
        r.j.recuento.porFrecuencia.ge10 === 2, r.j.recuento.porFrecuencia);
  check('y los vistos una vez son tres', r.j.recuento.porFrecuencia.vistos1 === 3, r.j.recuento.porFrecuencia);
}

/* ── 5 · LA PUERTA DEL MANIFIESTO: un fichero que NO es el declarado ─────
   Hay dos exportaciones distintas del mismo recolector y sus números no se
   mezclan. Si a `elburgo` —que sí está declarado en ESPERADO— se le da otro
   fichero, tiene que salir ROJO en vez de escribir un manifiesto que parece
   el bueno. */
console.log('\n· un fichero que no es el declarado sale ROJO');
{
  const csv = path.join(tmp, 'otro.csv');
  fs.writeFileSync(csv, '"timestamp","target","hop_count","path_ids","path_addrs"\n' + fila('t1', 'A>B>COORD') + '\n');
  const r = spawnSync(process.execPath, [UTIL, 'elburgo', csv, '--salida', path.join(tmp, 'otro.json')], { encoding: 'utf8' });
  const txt = (r.stdout || '') + (r.stderr || '');
  check('un fichero de elburgo que no casa con ninguna: rc = 2, no 1', r.status === 2, r.status);
  check('dice cuántas declaradas hay y que no casó ninguna',
        /exportaciones declaradas\s+\d+/.test(txt) && /ha casado\s+NINGUNA/.test(txt), txt.split('\n').slice(0, 6));
  check('y los pares se escriben igual: el útil NO queda inservible',
        fs.existsSync(path.join(tmp, 'otro.json')));

  /* LA RAMA QUE NO SE PODÍA PROBAR sin un sha a medida: el sha CASA y el
     contenido no. Se consigue calculando el sha real del CSV y declarándolo en
     la tabla con unas `filas` falsas. Es la única forma de ejercitarla, y sin
     ella esa rama no estaría probada. */
  const shaReal = crypto.createHash('sha256').update(fs.readFileSync(csv)).digest('hex');
  const orig = fs.readFileSync(UTIL, 'utf8');
  fs.writeFileSync(UTIL, orig.replace(/const EXPORTACIONES = \[/,
    "const EXPORTACIONES = [\n  { planta: 'miente', sha256: '" + shaReal.slice(0, 12)
    + "', filas: 999999, instantaneas: 1, nodos: 1, desde: 'x', hasta: 'y', traida: 'banco' },"));
  const r3 = spawnSync(process.execPath, [UTIL, 'miente', csv, '--salida', path.join(tmp, 'm.json')], { encoding: 'utf8' });
  fs.writeFileSync(UTIL, orig);
  const t3 = (r3.stdout || '') + (r3.stderr || '');
  check('sha que CASA con contenido que NO: sale ROJO', r3.status === 1, r3.status);
  check('y dice que la declaración miente', /la declaración miente/.test(t3), t3.split('\n').slice(-4));
}

/* ── 6 · SIN CRUDO: rc = 2, NO 0 ────────────────────────────────────────── */
console.log('\n· sin el crudo, «no comprobado» y no un verde');
{
  const r = spawnSync(process.execPath, [UTIL, 'prueba', path.join(tmp, 'no-existe.csv')], { encoding: 'utf8' });
  check('sale con 2, no con 0 ni con 1', r.status === 2, r.status);
  check('y lo dice', /no es un verde/i.test((r.stdout || '') + (r.stderr || '')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('');
console.log(ko ? 'FALLAN ' + ko + ' de ' + (ok + ko) : 'TODO OK — ' + ok + ' comprobaciones');
if (MUTA) console.log(ko ? '### bien: la mutacion «' + MUTA + '» sale roja'
                         : '### MAL: la mutacion «' + MUTA + '» pasa desapercibida');
process.exit(ko ? 1 : 0);
