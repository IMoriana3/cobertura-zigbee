/* R4 · FASE 2 — LAS POLÍTICAS CARAS, SÓLO BAJO DEMANDA
 *
 * Hasta la v1.77 el informe gráfico calculaba LAS NUEVE políticas siempre
 * (`grSeriesGen`), estuvieran encendidas o no — y con planta real la página
 * apaga ella sola las caras, así que el informe las volvía a encender de facto
 * y el apagado no servía fuera de la escena. Y el criterio de «cara» era
 * `brain==='ncu'` con `mgl` excluida A MANO: preguntaba de QUIÉN es la
 * política, no lo que cuesta, y dejaba fuera a la más cara de las nueve.
 *
 * Medido (R3 #711, `audit3/out/F5_coste_tilt.json`): `mgl`, `optimal` y
 * `optfree` son el 71,0-99,7 % del coste del día en los 22 puntos del barrido.
 *
 * LO QUE ESTE BANCO PROTEGE, y cómo evita ser una comprobación vacía:
 *   1. La FÍSICA PURA no se toca: el bloque entre los delimitadores tiene que
 *      ser IDÉNTICO al de `origin/main`, byte a byte, con el sha256 publicado.
 *      Con su control: el corte tiene que contener física y NO contener la
 *      capa de aplicación, o no estaría cortando donde dice.
 *   2. El criterio de cara es una LISTA MEDIDA con su procedencia escrita, no
 *      una propiedad de la política. Con TEST NULO: la lista tiene que ser
 *      distinta de «las de cerebro NCU», o el cambio no cambia nada.
 *   3. Quien decide qué se difiere está en UN sitio (`grDiferida`) y lo
 *      consultan los DOS caminos caros del informe: la serie del día y el
 *      anual de 12 días.
 *   4. Lo que no se calcula se DICE, con la misma palabra que ya usaba la
 *      columna del año, y sin rellenar con una extrapolación.
 *   5. El rótulo de avance dice el número que de verdad va a calcular.
 *   6. CONTROL NEGATIVO: con el criterio desarmado —`grDiferida` devolviendo
 *      siempre false— la comprobación 3 tiene que ponerse ROJA. Si no, este
 *      banco no distingue el arreglo del defecto.
 *
 *     node tools/test_caras_bajo_demanda.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');

let N = 0, FAIL = 0;
const t = (n, f) => { N++; try { f(); console.log('  ✓ ' + n); }
  catch (e) { FAIL++; console.error('  ✗ ' + n + ' — ' + e.message); } };

/* el bloque de FÍSICA PURA, cortado por la ÚLTIMA aparición de FIN-FÍSICA */
const fisica = (txt) => {
  const i0 = txt.indexOf('FÍSICA PURA'), i1 = txt.lastIndexOf('/* FIN-FÍSICA');
  if (i0 < 0 || i1 < 0) return null;
  return txt.slice(txt.lastIndexOf('/*', i0), i1);
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/* la física SIN la etiqueta de versión, que vive dentro del bloque */
const sinVersion = (f) => f.replace(/const VER='v[\d.]+';/, "const VER='*';");
/* CAMBIOS DE FÍSICA DECLARADOS. Este banco nació para demostrar que el PR de las
   caras (R4 fase 2, v1.78) no tocaba la física, y se quedó en CI exigiendo «0
   hunks» PARA SIEMPRE: cualquier cambio de física posterior, también uno
   autorizado, lo pone rojo. Lo que protege —que la física no cambie EN SILENCIO—
   se conserva así: un cambio sólo pasa si el sha256 de la física nueva (sin la
   versión) está escrito aquí con su versión, su motivo y quién lo autorizó. Es
   la misma salida honrada que `test_doc_version`: obliga a mirar. */
const FISICA_DECLARADA = [
  { ver: 'v1.79.0', sha: '71ddefebbb5db0332da20aa9b3186302048ab7bbb1d21d8e4ecfa29bff8e4fec',
    motivo: 'el eje gira como el actuador puede: tope mecánico en crearLazo, giro limitado tras topeBacktracking (fija); autorizado por el titular el 2026-09-24 (PR #751), con el efecto en energía medido en audit_giro/' },
];
/* el cuerpo exacto de una función, contando llaves y sin tragarse comentarios */
function cuerpoFn(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let n = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('las políticas caras, sólo bajo demanda');

// ── 1 · la física no se toca, y se demuestra ────────────────────────────────
t('FÍSICA PURA idéntica byte a byte a la de `origin/main` (2.2: 0 hunks dentro), o su cambio DECLARADO con sha256, versión y motivo', () => {
  let base;
  try { base = execFileSync('git', ['show', 'origin/main:backtracking.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { throw new Error('no puedo leer `origin/main:backtracking.html` para comparar: ' + e.message); }
  const a = fisica(base), b = fisica(html);
  if (!a || !b) throw new Error('los delimitadores FÍSICA PURA / FIN-FÍSICA no están');
  /* CONTROL DEL CORTE: si cortara donde no debe, lo de arriba pasaría sin
     comparar nada que importe */
  if (!b.includes('function poaPlantSeg')) throw new Error('el corte no contiene física: no está cortando donde dice');
  if (b.includes('function* grSeriesGen')) throw new Error('el corte se ha tragado la capa de aplicación');
  /* LA ETIQUETA DE VERSIÓN VIVE DENTRO DE LOS DELIMITADORES, así que «0 hunks
     dentro» es literalmente imposible para cualquier cambio que suba `VER`.
     No se resuelve con un hash y una excepción a ciegas: se comparan las líneas
     y se EXIGE que la única que difiera sea la de la versión, publicándola. Si
     difiere cualquier otra cosa, esto sigue poniéndose rojo y la nombra. Mover
     `const VER` fuera del bloque es una decisión del titular, no mía. */
  const decl = FISICA_DECLARADA.find(d => d.sha === sha(sinVersion(b)));
  if (a !== b && decl) {
    console.log(`      · la física CAMBIA respecto a main, y el cambio está DECLARADO: ${decl.ver} · ${decl.motivo}`);
  } else if (a !== b) {
    const A = a.split('\n'), B = b.split('\n');
    if (A.length !== B.length)
      throw new Error(`la física ha cambiado: ${A.length} → ${B.length} líneas · ${sha(a).slice(0, 16)} → ${sha(b).slice(0, 16)}`);
    const dif = [];
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) dif.push({ n: i + 1, antes: A[i].trim(), ahora: B[i].trim() });
    const esVersion = (d) => /^const VER='v[\d.]+';$/.test(d.antes) && /^const VER='v[\d.]+';$/.test(d.ahora);
    const reales = dif.filter(d => !esVersion(d));
    if (reales.length)
      throw new Error(`la física ha cambiado en ${reales.length} línea(s) que NO son la versión: ` +
        reales.slice(0, 3).map(d => `${d.n}: «${d.antes}» → «${d.ahora}»`).join(' · '));
    console.log(`      · la ÚNICA diferencia con main es la etiqueta de versión: ${dif.map(d => d.antes + ' → ' + d.ahora).join(', ')}`);
  }
  console.log(`      · ${b.length} caracteres · sha256 ${sha(b).slice(0, 16)}…`);
});

// ── 2 · el criterio es una lista MEDIDA, no una propiedad ───────────────────
t('CONTROL NEGATIVO de la 1 · un cambio en la física que NO sea la versión se ve', () => {
  /* la excepción de la versión no puede ser una puerta trasera: se comprueba
     que con UNA línea de física cambiada el criterio dice que no */
  const b = fisica(html);
  const A = b.split('\n');
  const i = A.findIndex(l => l.includes('function poaPlantSeg'));
  if (i < 0) throw new Error('no encuentro `poaPlantSeg` para el control: el control no dice nada');
  const B = A.slice(); B[i] = B[i] + ' /* mutante */';
  const dif = [];
  for (let k = 0; k < A.length; k++) if (A[k] !== B[k]) dif.push({ antes: A[k].trim(), ahora: B[k].trim() });
  const esVersion = (d) => /^const VER='v[\d.]+';$/.test(d.antes) && /^const VER='v[\d.]+';$/.test(d.ahora);
  if (!dif.filter(d => !esVersion(d)).length)
    throw new Error('con una línea de física mutada el criterio sigue diciendo que no ha cambiado: la excepción de la versión es una puerta trasera');
  /* y la lista de cambios declarados tampoco es una puerta trasera: la física
     mutada no puede coincidir con ningún sha declarado */
  if (FISICA_DECLARADA.some(d => d.sha === sha(sinVersion(B.join('\n')))))
    throw new Error('una física mutada coincide con un cambio declarado: la lista no distingue nada');
});
t('TEST NULO · la lista por COSTE no es la misma que «las de cerebro NCU»', () => {
  const m = /const POL_CARAS=\{([^}]*)\}/.exec(html);
  if (!m) throw new Error('no existe `POL_CARAS`');
  const caras = m[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean).sort();
  const ncu = [...html.matchAll(/\{key:'([a-z0-9]+)'[^}]*brain:'ncu'/g)].map(x => x[1]).sort();
  if (!ncu.length) throw new Error('no encuentro ninguna política de cerebro NCU: el test nulo no puede comparar');
  if (caras.join() === ncu.join())
    throw new Error(`la lista por coste [${caras}] es exactamente la de cerebro NCU: el criterio no ha cambiado de naturaleza`);
  for (const k of ['mgl', 'optimal', 'optfree'])
    if (!caras.includes(k)) throw new Error(`\`${k}\` está medida como una de las tres caras y no está en la lista`);
  console.log(`      · por coste [${caras}] vs por cerebro [${ncu}]`);
});
t('la lista lleva su PROCEDENCIA medida, no una afirmación suelta', () => {
  const m = /const POL_CARAS_FUENTE='([^']+)'/.exec(html);
  if (!m) throw new Error('la lista no declara de dónde sale su medida');
  for (const pista of ['F5_coste_tilt', '%'])
    if (!m[1].includes(pista)) throw new Error(`la procedencia no nombra «${pista}»: ${m[1]}`);
  if (!/#7\d\d/.test(m[1])) throw new Error('la procedencia no nombra el PR de la medida');
});
t('el apagado por COSTE consulta la lista medida, no el cerebro', () => {
  /* `brain` sigue existiendo y está bien que exista: el selector de cerebro
     apaga las de NCU cuando el usuario elige mandar sólo con la TCU
     (`backtracking.html:8089` y `8098`). Eso es una decisión sobre QUIÉN manda
     y no tiene nada que ver con lo que cuesta. Lo que esta comprobación vigila
     es el filtro del apagado por CARAS, y sólo ése. */
  const m = /const caros=POLICIES\.filter\(([^;]*)\);/.exec(html);
  if (!m) throw new Error('no encuentro el filtro de políticas caras');
  if (/brain/.test(m[1])) throw new Error('el filtro de caras sigue preguntando por el cerebro: ' + m[1]);
  if (!/POL_CARAS\[/.test(m[1])) throw new Error('el filtro de caras no consulta la lista medida: ' + m[1]);
  if (/key!==/.test(m[1])) throw new Error('el filtro de caras sigue excluyendo una política A MANO: ' + m[1]);
  /* y el test nulo de ESTA comprobación: el criterio viejo y el nuevo tienen
     que dar conjuntos distintos sobre las nueve políticas de verdad, o daría
     igual cuál se use */
  const ncu = [...html.matchAll(/\{key:'([a-z0-9]+)'[^}]*brain:'ncu'/g)].map(x => x[1]);
  const viejo = ncu.filter(k => k !== 'mgl').sort();
  const nuevo = (/const POL_CARAS=\{([^}]*)\}/.exec(html)[1]).split(',').map(x => x.split(':')[0].trim()).filter(Boolean).sort();
  if (viejo.join() === nuevo.join()) throw new Error('el criterio viejo y el nuevo apagan lo mismo: el cambio no cambia nada');
  console.log(`      · el viejo apagaba [${viejo}] · el nuevo apaga [${nuevo}]`);
});

// ── 3 · una sola puerta, y los dos caminos caros la consultan ───────────────
t('`grDiferida` es la ÚNICA puerta, y la consultan la serie del día Y el anual', () => {
  const g = cuerpoFn(html, 'grDiferida');
  if (!g) throw new Error('no existe `grDiferida`');
  if (!/POL_CARAS\[key\]/.test(g)) throw new Error('`grDiferida` no usa la lista medida');
  if (!/GR\.A/.test(g) || !/GR\.B/.test(g))
    throw new Error('`grDiferida` no exceptúa a las dos políticas del selector: el informe trata de ellas');
  if (!/\.on/.test(g)) throw new Error('`grDiferida` no exceptúa a las que el usuario ha encendido');
  const serie = html.slice(html.indexOf('function* grSeriesGen'), html.indexOf('function grPinta'));
  if (!/grDiferida\(/.test(serie)) throw new Error('la serie del día no consulta la puerta');
  const anual = cuerpoFn(html.replace('function* grAnualGen', 'function grAnualGen'), 'grAnualGen');
  if (!anual || !/grDiferida\(/.test(anual)) throw new Error('el anual del informe no consulta la puerta: 12 días × 144 pasos sin filtrar');
});

// ── 4 · lo que no se calcula, se dice; y con la palabra que ya existía ──────
t('lo diferido se publica como «sin calcular», la MISMA palabra que la columna del año', () => {
  const tab = html.slice(html.indexOf('function grTabla'), html.indexOf('/* ── anual: 12 días'));
  if (!/sin calcular/.test(tab)) throw new Error('la tabla no dice «sin calcular»');
  if (!/e\.sin/.test(tab)) throw new Error('la tabla no distingue la fila diferida');
  if (!/no se rellenan con una extrapolación|no se rellena con una extrapolación/.test(tab))
    throw new Error('falta la frase de no extrapolar junto a lo que no se ha calculado');
  /* y que NO se cuele un número estimado en la fila diferida */
  const fila = tab.slice(tab.indexOf('if(e.sin)'), tab.indexOf('continue;'));
  if (/grNum\(|toFixed\(/.test(fila)) throw new Error('la fila diferida publica alguna cifra: eso es exactamente lo que no debe pasar');
});
t('el rótulo de avance dice el número que de verdad va a calcular', () => {
  if (/'calculando las nueve pol/.test(html)) throw new Error('el rótulo sigue prometiendo las nueve');
  const r = cuerpoFn(html, 'grRotulo');
  if (!r) throw new Error('no existe `grRotulo`');
  if (!/POLICIES\.length/.test(r)) throw new Error('el rótulo no publica el denominador');
  if (!/grDiferida\(/.test(r)) throw new Error('el rótulo no cuenta las diferidas con la misma puerta');
});

// ── 5 · CONTROL NEGATIVO ────────────────────────────────────────────────────
t('CONTROL NEGATIVO · con la puerta desarmada, la comprobación 3 se pone ROJA', () => {
  const g = cuerpoFn(html, 'grDiferida');
  const roto = html.replace(g, 'function grDiferida(key){ return false; }');
  if (roto === html) throw new Error('no he podido desarmar la puerta: el control no dice nada');
  let cayo = false;
  const g2 = cuerpoFn(roto, 'grDiferida');
  if (!/POL_CARAS\[key\]/.test(g2)) cayo = true;
  if (!cayo) throw new Error('desarmada, la comprobación 3 seguiría pasando: este banco no distingue el arreglo del defecto');
});

console.log(`\n${N - FAIL}/${N} comprobaciones en verde (caras bajo demanda, ${/const VER='([^']+)'/.exec(html)[1]})`);
process.exit(FAIL ? 1 : 0);
