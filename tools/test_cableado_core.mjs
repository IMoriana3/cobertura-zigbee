/* Tests DETERMINISTAS del núcleo puro del cableado DC (js/cableado_core.js) — sin WebGL, sin red, sin azar.
   Uso:  node tools/test_cableado_core.mjs
   Cubren los invariantes físicos que el visor exige al mazo: sin calle / una / dos calles, tramos ascendentes y
   descendentes, medio tracker, perfil vacío / un nudo / nudos repetidos, pendiente límite, sin NaN/Infinity,
   ninguna arista aérea cruza un eje de calle y cada corte de calle genera su bajada. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'js', 'cableado_core.js'), 'utf-8');
new Function(src)();                         // UMD clásico: se cuelga de globalThis (independiente de "type" del package)
const C = globalThis.CABLECORE;

let N = 0, FAIL = 0;
function t(name, fn) {
  N++;
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) { if (!Object.is(a, b)) throw new Error((msg || 'eq') + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); }
function close(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol ?? 1e-9))) throw new Error((msg || 'close') + ': ' + a + ' ≉ ' + b); }
function deepEq(a, b, msg) { eq(JSON.stringify(a), JSON.stringify(b), msg); }

// Ejes de calle REALES de El Burgo (n locales, _streetAxes()): dos calles internas
const STX = [-187.6, 14.9];

console.log('cruzaCalle');
t('sin calle: no cruza', () => eq(C.cruzaCalle(20, 80, [], 0), null));
t('una calle: la detecta', () => eq(C.cruzaCalle(20, -30, [14.9], 0), 14.9));
t('sentido descendente también', () => eq(C.cruzaCalle(-30, 20, [14.9], 0), 14.9));
t('dos calles: devuelve la MÁS CERCANA al origen (a)', () => eq(C.cruzaCalle(50, -250, STX, 0), 14.9));
t('dos calles, origen al sur: la más cercana es la otra', () => eq(C.cruzaCalle(-250, 50, STX, 0), -187.6));
t('extremo exactamente SOBRE el eje: no es cruce', () => eq(C.cruzaCalle(14.9, -50, STX, 0), null));
t('tolerancia: extremo a 0,1 m del eje con tol 0,2 no cuenta', () => eq(C.cruzaCalle(15.0, -50, [14.9], 0.2), null));
t('tolerancia: a 0,3 m del eje con tol 0,2 SÍ cuenta', () => eq(C.cruzaCalle(15.2, -50, [14.9], 0.2), 14.9));
t('tramo que no llega a la calle: null', () => eq(C.cruzaCalle(20, 16, [14.9], 0), null));

console.log('cortes');
t('sin cruce → []', () => deepEq(C.cortes(20, 80, STX), []));
t('ascendente: orden a→b', () => deepEq(C.cortes(-250, 50, STX), [-187.6, 14.9]));
t('descendente: orden a→b (invertido)', () => deepEq(C.cortes(50, -250, STX), [14.9, -187.6]));
t('una sola calle en medio', () => deepEq(C.cortes(-50, 50, STX), [14.9]));

console.log('subtramos');
t('sin calle → un único tramo [a,b]', () => deepEq(C.subtramos(20, 80, STX), [[20, 80]]));
t('una calle → dos tramos que empalman en el eje', () => deepEq(C.subtramos(-50, 50, STX), [[-50, 14.9], [14.9, 50]]));
t('dos calles → tres tramos, extremos preservados', () => deepEq(C.subtramos(-250, 50, STX), [[-250, -187.6], [-187.6, 14.9], [14.9, 50]]));
t('descendente: tres tramos en el sentido a→b', () => deepEq(C.subtramos(50, -250, STX), [[50, 14.9], [14.9, -187.6], [-187.6, -250]]));
t('NINGÚN sub-tramo cruza un eje (invariante aéreo)', () => {
  for (const [a, b] of [[-250, 50], [50, -250], [-50, 50], [-200, -100], [10, 20]])
    for (const [u, v] of C.subtramos(a, b, STX))
      eq(C.cruzaCalle(u, v, STX, 0), null, `tramo [${u},${v}] de [${a},${b}]`);
});
t('los cortes generan bajadas: extremos interiores = ejes cortados', () => {
  const tr = C.subtramos(-250, 50, STX), cortes = C.cortes(-250, 50, STX);
  const interiores = tr.slice(1).map(x => x[0]);        // el arranque de cada tramo salvo el primero = un corte = una bajada a cada lado
  deepEq(interiores, cortes);
  eq(tr.length, cortes.length + 1, 'nº tramos = nº cortes + 1');
});

console.log('clampViga');
const NODOS = [[-33.2, 101.2], [-16.6, 101.0], [0, 100.8], [16.6, 100.9], [33.2, 101.1]];   // 5 postes de una viga estándar (~66 m)
t('perfil vacío: no recorta', () => deepEq(C.clampViga(-500, 500, [], 2.2), [-500, 500]));
t('dentro de la viga: intacto', () => deepEq(C.clampViga(-10, 10, NODOS, 2.2), [-10, 10]));
t('se pasa por ambas punteras: recorta a ±(extremo+margen)', () => {
  const [a, b] = C.clampViga(-500, 500, NODOS, 2.2); close(a, -35.4, 1e-9); close(b, 35.4, 1e-9);
});
t('medio tracker (~33 m): su clamp es el de SU viga corta', () => {
  const MED = [[-16.8, 99.5], [0, 99.4], [16.8, 99.6]];
  deepEq(C.clampViga(-40, 40, MED, 2.2), [-19, 19]);
});
t('sentido descendente: también recorta', () => {
  const [a, b] = C.clampViga(500, -500, NODOS, 2.2); close(a, 35.4, 1e-9); close(b, -35.4, 1e-9);
});

console.log('tubeY');
const TY = 96.0;                                          // cota de terreno del punto consultado
t('perfil vacío → fallback (encerrado en el cinturón)', () => close(C.tubeY([], 0, TY, TY + 2.0), TY + 2.0));
t('fallback fuera del cinturón → se encierra', () => {
  close(C.tubeY([], 0, TY, TY + 9.0), TY + 4.5, 1e-9, 'techo');
  close(C.tubeY([], 0, TY, TY + 0.1), TY + 0.6, 1e-9, 'suelo');
});
t('un solo nudo → su cota', () => close(C.tubeY([[0, TY + 2.1]], 12, TY, 0), TY + 2.1));
t('interpolación entre nudos', () => close(C.tubeY([[0, TY + 2.0], [10, TY + 3.0]], 5, TY, 0), TY + 2.5));
t('nudos repetidos (misma n): sin NaN ni Infinity', () => {
  const y = C.tubeY([[5, TY + 2.0], [5, TY + 2.4], [9, TY + 2.2]], 5, TY, 0);
  if (!Number.isFinite(y)) throw new Error('no finito: ' + y);
});
t('pendiente límite: extrapolación capada a ±0,6 m/m', () => {
  // dos nudos casi coincidentes en n con salto de cota → pendiente bruta enorme; a 10 m la cota extrapolada
  // debe quedar ≤ nudo + 0,6·10 (y después el cinturón la encierra) — así murieron los "cables al cielo" de v4.70
  const nodos = [[0, TY + 2.0], [0.001, TY + 3.0]];
  const y = C.tubeY(nodos, 10.001, TY, 0, 0.6, 0.6, 40);   // techo alto para observar el cap, no el cinturón
  if (y > TY + 3.0 + 0.6 * 10 + 1e-6) throw new Error('cap de pendiente roto: ' + (y - TY));
});
t('cinturón: nunca <ty+0,6 ni >ty+4,5 aunque el perfil diga otra cosa', () => {
  close(C.tubeY([[0, TY - 3]], 0, TY, 0), TY + 0.6, 1e-9, 'suelo');
  close(C.tubeY([[0, TY + 30]], 0, TY, 0), TY + 4.5, 1e-9, 'techo');
});
t('barrido: sin NaN/Infinity en 400 consultas con perfiles retorcidos', () => {
  const perfiles = [[], [[3, TY + 2]], [[0, TY + 2], [0, TY + 2.5]], NODOS.map(p => [p[0], p[1] - 4]),
    [[-5, TY + 1], [-5 + 1e-9, TY + 4], [8, TY + 2]]];
  for (const P of perfiles) for (let n = -50; n <= 50; n += 0.25) {
    const y = C.tubeY(P, n, TY, TY + 2);
    if (!Number.isFinite(y)) throw new Error(`NaN/Inf con perfil ${JSON.stringify(P)} en n=${n}`);
  }
});

console.log('postePorLado');
// postes [x, n, yTop, fila]: filas 0-1 en la línea 0 (fila 0 al oeste x=-2, fila 1 al este x=+2), fila 2 en la línea 1
const POSTS = [
  [-2, -30, 101, 0], [-2, 0, 101, 0], [-2, 30, 101, 0],
  [2, -30, 101, 1], [2, 0, 101, 1], [2, 30, 101, 1],
  [40, 0, 101, 2],
];
const LOF = { 0: 0, 1: 0, 2: 1 };
t('elige el poste más cercano en n de SU viga', () => deepEq(C.postePorLado(POSTS, LOF, 0, 0, -1, 4, 0), [-2, 0, 101, 0]));
t('lado sd: la viga este no ve los postes oeste', () => deepEq(C.postePorLado(POSTS, LOF, 0, 0, 1, 4, 0), [2, 0, 101, 1]));
t('otra línea queda excluida', () => { const p = C.postePorLado(POSTS, LOF, 0, 0, 1, 4, 0); eq(p[3] !== 2, true); });
t('lado de llegada sg=+1: no baja en un poste con (n−nT)·sg<−0,5 (al otro lado de la calle)', () =>
  deepEq(C.postePorLado(POSTS, LOF, 0, 0, -1, 28, 1), [-2, 30, 101, 0]));   // el de n=0 queda a −28 → excluido; el de 30 (Δ=+2) vale
t('lado de llegada sg=−1: simétrico', () =>
  deepEq(C.postePorLado(POSTS, LOF, 0, 0, -1, -28, -1), [-2, -30, 101, 0]));
t('holgura −0,5: un poste APENAS detrás (Δ·sg=−0,4) sigue siendo válido', () =>
  deepEq(C.postePorLado(POSTS, LOF, 0, 0, -1, 30.4, 1), [-2, 30, 101, 0]));
t('sin candidatos → null', () => eq(C.postePorLado(POSTS, LOF, 7, 0, 1, 0, 0), null));

console.log('integración pura: la cadena subtramos→clamp→cruzaCalle nunca deja un tramo aéreo cruzando');
t('barrido determinista de 21×21 pares (a,b) sobre las calles reales', () => {
  for (let a = -260; a <= 60; a += 16) for (let b = -260; b <= 60; b += 16) {
    if (a === b) continue;
    for (const [u, v] of C.subtramos(a, b, STX)) {
      const [cu, cv] = C.clampViga(u, v, NODOS.map(p => [p[0] - 100, p[1]]), 2.2);   // viga desplazada: clamp agresivo
      if (Math.abs(cv - cu) < 0.05) continue;                                        // tramo degenerado: no se dibuja
      // el recorte de calle del visor: si aún cruza (clamp no lo garantiza), se recorta al borde ±1,2
      let nB = cv; const st = C.cruzaCalle(cu, cv, STX, 0);
      if (st !== null) nB = st + (cu < st ? -1.2 : 1.2);
      eq(C.cruzaCalle(cu, nB, STX, 0), null, `queda cruce vivo en [${cu},${nB}]`);
    }
  }
});

console.log('');
if (FAIL) { console.error(`FALLAN ${FAIL}/${N}`); process.exit(1); }
console.log(`OK — ${N}/${N} tests`);
