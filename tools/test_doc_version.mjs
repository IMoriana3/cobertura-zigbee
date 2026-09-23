/* R3 · 4.4 — EL DOCUMENTO NO PUEDE QUEDARSE ATRÁS EN SILENCIO
 *
 * `docs/algoritmos_backtracking.html` es prosa escrita a mano: no se regenera
 * desde el código, y decir que sí sería inventarlo. Lo que sí se puede es que
 * NO SE QUEDE ATRÁS SIN QUE NADIE SE ENTERE, que es lo que pasó: el documento
 * declaraba la v1.57.2 mientras el código iba por la v1.74.0 — diecisiete
 * versiones, ningún banco mirando `docs/`, ninguna señal.
 *
 * Es el mismo vicio que el propio código tiene documentado en
 * `backtracking.html:521`: «la versión vivía DOS VECES y las dos se quedaron
 * atrás». Aquí vive en tres sitios —el sello legible por máquina, el texto
 * visible y `const VER`— y este banco los ata.
 *
 * LA COMPROBACIÓN QUE IMPORTA es la 2: `data-contrastado-con` tiene que ser la
 * VER de la página. En cuanto VER se mueva, esto se pone rojo. El arreglo son
 * dos salidas honradas: actualizar el documento, o volver a contrastarlo y
 * anotar en la banda qué ha cambiado. Las dos obligan a MIRAR. Coste medido de
 * la segunda: un minuto. Está puesto a propósito y se dice aquí para que nadie
 * lo descubra como sorpresa.
 *
 * No hay cláusula de escape del tipo «...o que lleve el aviso puesto»: el aviso
 * está puesto siempre, así que esa comprobación pasaría sin poder fallar nunca.
 *
 *     node tools/test_doc_version.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOC = path.join(ROOT, 'docs', 'algoritmos_backtracking.html');
const PAG = path.join(ROOT, 'backtracking.html');
const doc = fs.readFileSync(DOC, 'utf8');
const pag = fs.readFileSync(PAG, 'utf8');

let N = 0, FAIL = 0;
const t = (n, f) => { N++; try { f(); console.log('  ✓ ' + n); }
  catch (e) { FAIL++; console.error('  ✗ ' + n + ' — ' + e.message); } };
const debe = (c, m) => { if (!c) throw new Error(m); };

/* ── lectores, uno por sitio donde vive la versión ────────────────────────── */
const verPagina = s => { const m = /const\s+VER\s*=\s*'(v[\d.]+)'\s*;/.exec(s); return m && m[1]; };
const sello     = (s, k) => { const m = new RegExp('<html\\b[^>]*\\b' + k + '="([^"]+)"').exec(s); return m && m[1]; };

/* ── 1 · el sello existe y está bien formado ──────────────────────────────── */
t('el documento lleva sello legible por máquina en <html>', () => {
  for (const k of ['data-describe-ver', 'data-contrastado-con', 'data-contrastado-el']) {
    const v = sello(doc, k);
    debe(v, 'falta ' + k + ' en la etiqueta <html> de docs/algoritmos_backtracking.html');
  }
  debe(/^v\d+\.\d+(\.\d+)?$/.test(sello(doc, 'data-describe-ver')),
    'data-describe-ver no parece una versión: ' + sello(doc, 'data-describe-ver'));
  debe(/^\d{4}-\d{2}-\d{2}$/.test(sello(doc, 'data-contrastado-el')),
    'data-contrastado-el no es una fecha ISO: ' + sello(doc, 'data-contrastado-el'));
});

t('TEST NULO · el lector del sello devuelve null cuando el atributo no está', () => {
  debe(sello('<html lang="es">', 'data-contrastado-con') === null,
    'el lector inventa un valor donde no hay atributo: la comprobación 1 no probaría nada');
});

/* ── 2 · LA COMPROBACIÓN QUE IMPORTA ──────────────────────────────────────── */
t('`const VER` de la página existe y se lee', () => {
  debe(verPagina(pag), 'no encuentro `const VER` en backtracking.html; sin eso la 2 no puede fallar');
});

t('el documento está contrastado contra la VER que la página tiene HOY', () => {
  const v = verPagina(pag), c = sello(doc, 'data-contrastado-con');
  debe(v === c, 'el documento se contrastó contra ' + c + ' y la página va por ' + v +
    '. Arréglalo por una de las dos salidas: actualiza el documento, o vuelve a ' +
    'contrastarlo y anota en la banda de desfase qué ha cambiado. Las dos obligan a mirar.');
});

t('CONTROL NEGATIVO · si la VER de la página se mueve, la 2 se pone roja', () => {
  const movida = pag.replace(/const\s+VER\s*=\s*'v[\d.]+'\s*;/, "const VER='v9.99.9';");
  debe(movida !== pag, 'el control no ha cambiado nada: no prueba nada');
  debe(verPagina(movida) !== sello(doc, 'data-contrastado-con'),
    'con la VER movida la comprobación 2 SEGUIRÍA pasando: pasa sin poder fallar');
});

/* ── 3 · el sello de máquina y el texto visible no pueden divergir ────────── */
t('la banda visible nombra las DOS versiones que el sello declara', () => {
  const d = sello(doc, 'data-describe-ver'), c = sello(doc, 'data-contrastado-con');
  const banda = /<div class="box bad">([\s\S]*?)<\/div>/.exec(doc);
  debe(banda, 'no encuentro la banda de desfase (<div class="box bad">) en el documento');
  debe(banda[1].includes(d), 'la banda visible no dice ' + d + ', que es lo que el sello declara describir');
  debe(banda[1].includes(c), 'la banda visible no dice ' + c + ', que es contra lo que el sello dice estar contrastado');
});

t('CONTROL NEGATIVO · si la banda deja de nombrar una versión, la 3 se pone roja', () => {
  const c = sello(doc, 'data-contrastado-con');
  const banda = /<div class="box bad">([\s\S]*?)<\/div>/.exec(doc);
  debe(banda && banda[1].includes(c), 'el original no cumple la propiedad: el control no prueba nada');
  debe(!banda[1].split(c).join('').includes(c), 'quitando la versión del texto, la 3 seguiría pasando');
});

/* ── 4 · ninguna cifra de banco sin su versión al lado ────────────────────── */
/* «192 comprobaciones» estuvo publicado hasta hoy con el banco en 211. Una cifra
   de recuento sin versión caduca en silencio; con versión, envejece a la vista. */
const RECUENTO = /(\d[\d.]*)\s+comprobaciones([\s\S]{0,140})/g;
t('toda cifra de «N comprobaciones» lleva su versión al lado', () => {
  let m, vistos = 0, sinVer = [];
  while ((m = RECUENTO.exec(doc))) { vistos++;
    if (!/v\d+\.\d+/.test(m[2])) sinVer.push(m[1]); }
  debe(vistos > 0, 'no hay ninguna cifra de recuento en el documento: la comprobación no mira nada');
  debe(sinVer.length === 0, 'cifras de recuento sin versión al lado: ' + sinVer.join(', '));
});

t('TEST NULO · la comprobación 4 encuentra de verdad cifras que mirar', () => {
  RECUENTO.lastIndex = 0;
  const n = (doc.match(/(\d[\d.]*)\s+comprobaciones/g) || []).length;
  debe(n >= 1, 'no hay cifras de recuento: la 4 pasa por vacío');
});

t('CONTROL NEGATIVO · una cifra de recuento sin versión pone roja la 4', () => {
  const falso = doc + '\n<p>1.000 comprobaciones y ni una versión cerca de aquí.</p>';
  let m, sinVer = 0; const R = new RegExp(RECUENTO.source, 'g');
  while ((m = R.exec(falso))) if (!/v\d+\.\d+/.test(m[2])) sinVer++;
  debe(sinVer === 1, 'la 4 no caza una cifra sin versión metida a propósito (contadas ' + sinVer + ')');
});

/* ── 5 · la lista de desfase apunta a sitios que existen ──────────────────── */
t('cada puntero `backtracking.html:N` de la banda señala una línea que existe', () => {
  const banda = /<div class="box bad">([\s\S]*?)<\/div>/.exec(doc)[1];
  const lineas = pag.split('\n');
  const refs = [...banda.matchAll(/backtracking\.html:(\d+)/g)].map(m => +m[1]);
  debe(refs.length > 0, 'la banda no lleva ni un puntero: no se puede comprobar nada');
  for (const n of refs) debe(n >= 1 && n <= lineas.length,
    'la banda apunta a backtracking.html:' + n + ' y el fichero tiene ' + lineas.length + ' líneas');
});

/* ── 5b · Y SEÑALA LO QUE DICE SEÑALAR (v1.76) ─────────────────────────────
   «Existe» es un listón que cualquier número dentro del fichero cruza. Con
   eso, CINCO de los siete punteros de esta banda llevaban tiempo apuntando a
   líneas sin ninguna relación con su texto —el de `function nbDe` caía en un
   `const cerca=x=>{`, el de `BT_UMBRAL_DEG` en un `const mx=+c.maxang||55`—
   y el banco los daba por buenos. Se pudrieron en silencio porque cualquier
   inserción por encima los desplaza y nada lo mira.
   Cuando la entrada NOMBRA su destino en un `<code>` detrás del puntero, la
   línea tiene que contenerlo. Las que no nombran símbolo se quedan con la
   comprobación de existencia de arriba: no se puede exigir lo que no se
   declara, y obligar a nombrarlo sería reescribir la banda entera. */
t('y cada puntero que NOMBRA su destino cae en la línea que lo contiene', () => {
  const banda = /<div class="box bad">([\s\S]*?)<\/div>/.exec(doc)[1];
  const lineas = pag.split('\n');
  // «backtracking.html:N</code>, <code>SIMBOLO</code>»
  const re = /backtracking\.html:(\d+)<\/code>\s*,\s*<code>([^<]+)<\/code>/g;
  const pares = [...banda.matchAll(re)].map(m => [+m[1], m[2].trim()]);
  debe(pares.length > 0,
    'ningún puntero de la banda nombra su destino: esta comprobación no mira nada');
  for (const [n, sim] of pares) {
    const l = lineas[n - 1] || '';
    debe(l.includes(sim),
      'la banda dice que `' + sim + '` está en backtracking.html:' + n +
      ' y ahí pone «' + l.trim().slice(0, 60) + '». Un puntero que señala otra cosa ' +
      'es peor que ninguno: manda a quien lo sigue a leer código que no viene a cuento');
  }
});

console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
