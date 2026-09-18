#!/usr/bin/env node
/* 2.4 — VERIFICADOR DE CITAS. Entregable de la auditoría, no utilidad interna.
   Comprueba que cada cita `fichero:línea[-línea]` del documento de evidencia
   apunta de verdad al fragmento que el documento pega a continuación.

   CÓMO EMPAREJA. Del bloque hacia atrás, no al revés: para cada bloque ```…```
   busca la cita más cercana ANTERIOR (hasta 500 caracteres). Emparejar «cita ->
   siguiente bloque» daba falsos positivos cuando entre la cita y el bloque hay
   prosa con otra cita en medio, y así se detectó.

   QUÉ BLOQUES SON FRAGMENTO DE FUENTE. Sólo dos formas, y se declara porque de
   ello depende el recuento:
     · bloque con etiqueta de lenguaje (```js, ```yaml…) -> es una cita de código
       y se empareja con la cita anterior más cercana;
     · bloque SIN etiqueta cuya primera línea es ella misma una cita -> esa cita
       manda y el ancla es la línea siguiente.
   Un bloque sin etiqueta y sin cita dentro se empareja SOLO si la cita anterior
   está pegada a él (menos de 120 caracteres: la forma `fichero:línea`: seguida
   del bloque). Más lejos que eso es SALIDA DE UNA CORRIDA, no un fragmento del
   código, y no se empareja con nada. Sin esta regla, los bloques
   de salida se emparejaban con la cita de la prosa anterior y salían como
   rotas. Las citas que aparecen DENTRO de un bloque no entran en el conjunto de
   candidatas de los bloques posteriores, por el mismo motivo.

   TOLERANCIA CON HTML. Si el fichero citado es .html y la comparación directa
   falla, se reintenta quitando las etiquetas de la línea del fichero y se acepta
   si contiene el texto del documento: así se verifica una cita a un documento
   PUBLICADO, donde lo que se pega es lo que se lee en pantalla.

   CÓMO COMPARA. El ancla es la primera línea del bloque que no esté vacía y no
   sea comentario; si esa primera línea es ella misma una cita
   (`fichero:línea`), se usa la siguiente y esa cita manda sobre la anterior.
   La comparación tolera que el documento haya RECORTADO el comentario final de
   la línea (`… // v1.57: …`), que es como se pegan los fragmentos: se acepta si
   la línea del fichero es igual a la del documento o EMPIEZA por ella.

   QUÉ CUENTA COMO FALLO. Sólo que el fragmento no esté en la línea citada
   (citas puntuales) o dentro del rango (citas de tramo). Una cita sin bloque
   detrás no es fallo: se comprueba que la línea exista y se lista aparte, sin
   contar como verificada.

   FICHEROS FUERA DEL REPO. Las rutas se resuelven contra la raíz del repo; para
   citar un fichero de otro árbol (el motor Python de SolarGPT) se pasa su raíz
   con `--extra=<ruta>` y se declara en la salida.

   Ejecutable:  node audit2/verifica_citas.mjs [documento] [--extra=<raíz>]
   Código de salida: 0 si no hay ninguna cita ROTA, 1 si la hay.             */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* el documento es el primer argumento que NO sea una opción: con `--extra=` como
   argv[2] la versión anterior lo tomaba por documento y moría en ENOENT. */
const DOC = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(ROOT, 'audit2', 'EVIDENCIA_BT_R2.md');
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const doc = fs.readFileSync(DOC, 'utf-8');
const EXTRA = (process.argv.find(a => a.startsWith('--extra=')) || '').split('=')[1] || null;
const cache = new Map();
const lee = rel => { if (!cache.has(rel)) {
    let p = path.join(ROOT, rel);
    if (!fs.existsSync(p) && EXTRA) p = path.join(EXTRA, rel);
    cache.set(rel, fs.existsSync(p) ? fs.readFileSync(p, 'utf-8').split('\n') : null); } return cache.get(rel); };
const rs = s => s.replace(/\s+$/, '');

console.log('═'.repeat(94));
console.log(`VERIFICADOR DE CITAS · documento ${path.relative(ROOT, DOC)} · commit ${SHA} · node ${process.version}`);
console.log(`ejecutado: node audit2/verifica_citas.mjs${EXTRA ? ' --extra=' + EXTRA : ''}`);
if (EXTRA) console.log(`raíz externa declarada para ficheros fuera del repo: ${EXTRA}`);
console.log('═'.repeat(94));

const RECITA = /([A-Za-z0-9_./-]+\.(?:html|js|mjs|py|md|yml|json)):(\d+)(?:-(\d+))?/;
const RE = new RegExp(RECITA.source, 'g');
const citas = []; let m;
while ((m = RE.exec(doc)) !== null) citas.push({ rel: m[1], a: +m[2], b: m[3] ? +m[3] : null, pos: m.index, txt: m[0], usada: false });

const bloques = []; const RB = /```([a-z]*)\n([\s\S]*?)```/g;
while ((m = RB.exec(doc)) !== null) bloques.push({ pos: m.index, fin: m.index + m[0].length, lang: m[1], cuerpo: m[2] });
// una cita que vive DENTRO de un bloque no es candidata de los bloques siguientes
for (const c of citas) c.enBloque = bloques.some(b => c.pos > b.pos && c.pos < b.fin);

const OK = [], ROTAS = [], FUERA = [], AUSENTE = [];
for (const bl of bloques) {
  const lineas = bl.cuerpo.split('\n').map(rs).filter(s => s.trim());
  if (!lineas.length) continue;
  let ancla = null, cita = null;
  // ¿la primera línea del bloque es una cita? entonces manda ella y el ancla es la siguiente
  const mi = lineas[0].trim().match(new RegExp('^' + RECITA.source + '$'));
  if (mi) { cita = { rel: mi[1], a: +mi[2], b: mi[3] ? +mi[3] : null, txt: lineas[0].trim() };
            ancla = lineas.slice(1).find(s => s.trim() && !/^\s*(\/\/|#|<!--)/.test(s)) || null; }
  else if (bl.lang) {                       // bloque con lenguaje: fragmento de código
         ancla = lineas.find(s => !/^\s*(\/\/|#|<!--)/.test(s)) || null;
         let mejor = null;
         for (const c of citas) if (!c.enBloque && c.pos < bl.pos && bl.pos - c.pos < 500 && (!mejor || c.pos > mejor.pos)) mejor = c;
         cita = mejor; }
  else {                                    // bloque sin lenguaje: sólo si la cita está PEGADA
         let mejor = null;
         for (const c of citas) if (!c.enBloque && c.pos < bl.pos && bl.pos - c.pos < 120 && (!mejor || c.pos > mejor.pos)) mejor = c;
         if (!mejor) continue;                // cita lejana o inexistente: es salida de una corrida
         cita = mejor;
         ancla = lineas.find(s => s.trim()) || null; }
  if (!cita || !ancla) continue;
  if (cita.usada !== undefined) cita.usada = true;
  const L = lee(cita.rel);
  if (!L) { AUSENTE.push({ ...cita, ancla: ancla.trim() }); continue; }
  const fin = cita.b || cita.a;
  if (cita.a < 1 || fin > L.length) { FUERA.push({ ...cita, n: L.length }); continue; }
  const esHtml = /\.html$/.test(cita.rel);
  // las etiquetas se sustituyen por un ESPACIO, no por nada: entre dos celdas de
  // una tabla el navegador separa, y el documento pega lo que se lee en pantalla.
  const destag = s2 => s2.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const casa = (fl, dl) => { const a = rs(fl), b = rs(dl);
    if (a === b || a.startsWith(b)) return true;
    if (esHtml) { const A = destag(a), B = dl.replace(/\s+/g, ' ').trim(); return B.length > 12 && A.includes(B); }
    return false; };
  let hallada = -1;
  for (let i = cita.a; i <= fin; i++) if (L[i-1] !== undefined && casa(L[i-1], ancla)) { hallada = i; break; }
  if (hallada > 0 && (cita.b ? true : hallada === cita.a)) OK.push({ ...cita, hallada, ancla: ancla.trim() });
  else { const todas = []; for (let i = 0; i < L.length; i++) if (casa(L[i], ancla)) todas.push(i+1);
         ROTAS.push({ ...cita, ancla: ancla.trim(), real: todas }); }
}
const sinBloque = citas.filter(c => !c.usada);
const conFichero = sinBloque.filter(c => lee(c.rel));
const fueraSB = conFichero.filter(c => c.a < 1 || (c.b || c.a) > lee(c.rel).length);
FUERA.push(...fueraSB.map(c => ({ ...c, n: lee(c.rel).length })));
AUSENTE.push(...sinBloque.filter(c => !lee(c.rel)));

console.log(`\ncitas encontradas en el documento           : ${citas.length}`);
console.log(`bloques de código del documento             : ${bloques.length}`);
console.log(`  · VERIFICADAS (fragmento en su línea/rango): ${OK.length}`);
console.log(`  · SIN FRAGMENTO pegado detrás              : ${sinBloque.length - fueraSB.length}   (se comprueba sólo que la línea exista)`);
console.log(`  · ROTAS                                    : ${ROTAS.length}`);
console.log(`  · fuera del rango del fichero              : ${FUERA.length}`);
console.log(`  · fichero no encontrado                    : ${AUSENTE.length}`);

if (ROTAS.length) { console.log(`\n── CITAS ROTAS ──────────────────────────────────────────────────────────`);
  for (const r of ROTAS) console.log(`  ${r.txt}\n     fragmento : ${r.ancla.slice(0,84)}\n     está en   : ${r.real.length ? r.real.join(', ') : 'NO APARECE en el fichero'}`); }
if (FUERA.length) { console.log(`\n── FUERA DE RANGO ───────────────────────────────────────────────────────`);
  for (const r of FUERA) console.log(`  ${r.txt}  (el fichero tiene ${r.n} líneas)`); }
if (AUSENTE.length) { console.log(`\n── FICHERO NO ENCONTRADO ────────────────────────────────────────────────`);
  for (const r of AUSENTE) console.log(`  ${r.txt}`); }

console.log(`\n── VERIFICADAS, una por línea ───────────────────────────────────────────`);
for (const o of OK) { const L = lee(o.rel);
  console.log(`  OK  ${o.txt.padEnd(32)} L${String(o.hallada).padStart(5)}  ${L[o.hallada-1].trim().slice(0,66)}`); }
if (sinBloque.length - fueraSB.length > 0) {
  console.log(`\n── SIN FRAGMENTO (la línea existe; el contenido no se puede verificar) ──`);
  const vistas = new Set();
  for (const s of sinBloque) { if (fueraSB.includes(s) || !lee(s.rel) || vistas.has(s.txt)) continue; vistas.add(s.txt);
    console.log(`  --  ${s.txt.padEnd(32)}        ${(lee(s.rel)[s.a-1]||'').trim().slice(0,66)}`); } }

const mal = ROTAS.length + FUERA.length + AUSENTE.length;
console.log(`\nRESULTADO: ${mal === 0 ? 'ninguna cita rota' : mal + ' cita(s) con problema'}`);
process.exit(mal === 0 ? 0 : 1);
