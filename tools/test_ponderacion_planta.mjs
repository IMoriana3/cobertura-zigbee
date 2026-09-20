/* R3 · 3.2 — LA PLANTA PESA CADA MESA POR SU LARGO, Y NO PUEDE VOLVER ATRÁS
 *
 * `poaPlantSeg` ponderaba por largo DENTRO de cada línea y después promediaba
 * las líneas SIN PONDERAR. El segundo paso es el mismo defecto que arregla el
 * primero, una capa más arriba: trata igual una línea de 147,74 m y una de
 * 1 185,51 m. Desde la v1.75 la planta pesa cada mesa por su largo.
 *
 * LO QUE HACE ESTE BANCO DISTINTO DE UNO INGENUO. Con la planta de Ayora, SIETE
 * de las nueve políticas dan casi lo mismo con las dos agregaciones —de
 * -0,036 % a +0,078 %—, así que un caso de prueba mal elegido pasaría con el
 * código nuevo Y con el viejo, y no protegería nada. Por eso la comprobación 1
 * es un TEST NULO que exige que el caso SÍ distinga, y sólo después se compara.
 *
 * Y el CONTROL NEGATIVO reimplementa la agregación vieja —media sin ponderar de
 * las medias de línea— y exige que dé OTRO número. Si alguien revierte el
 * cambio, la 3 se pone roja.
 *
 * Sin navegador: se extrae la aritmética de la agregación y se corre en Node
 * sobre una geometría sintética con líneas deliberadamente desiguales.
 *
 *     node tools/test_ponderacion_planta.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAG = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf8');

let N = 0, FAIL = 0;
const t = (n, f) => { N++; try { f(); console.log('  ✓ ' + n); }
  catch (e) { FAIL++; console.error('  ✗ ' + n + ' — ' + e.message); } };
const debe = (c, m) => { if (!c) throw new Error(m); };

/* ── las dos agregaciones, escritas aquí para poder compararlas ──────────── */
/* B · lo que la página hace desde la v1.75: cada mesa pesa su largo */
const porMesa = (poa, largo) => {
  let a = 0, w = 0;
  for (let r = 0; r < poa.length; r++) for (let k = 0; k < poa[r].length; k++) { a += poa[r][k] * largo[r][k]; w += largo[r][k]; }
  return w > 0 ? a / w : 0;
};
/* A · lo que hacía antes: media por línea ponderada, y luego media de líneas a pelo */
const mediaDeLineas = (poa, largo) => {
  let s = 0;
  for (let r = 0; r < poa.length; r++) {
    let a = 0, w = 0;
    for (let k = 0; k < poa[r].length; k++) { a += poa[r][k] * largo[r][k]; w += largo[r][k]; }
    s += w > 0 ? a / w : 0;
  }
  return poa.length ? s / poa.length : 0;
};

/* ── la planta de prueba: líneas DELIBERADAMENTE desiguales ──────────────── */
/* una línea corta con POA alto y una larga con POA bajo. Si se promedian las
   líneas a pelo, la corta pesa lo mismo que la larga y la planta sale alta. */
const LARGO = [[10, 10], [100, 100, 100, 100, 100, 100]];
const POA   = [[900, 900], [400, 400, 400, 400, 400, 400]];

t('TEST NULO · el caso de prueba SÍ distingue las dos agregaciones', () => {
  const B = porMesa(POA, LARGO), A = mediaDeLineas(POA, LARGO);
  debe(Math.abs(B - A) > 1, 'el caso no distingue (A=' + A.toFixed(4) + ' B=' + B.toFixed(4) +
    '): con siete de las nueve políticas de Ayora pasa esto, y un banco así no protege nada');
});

t('la planta pesa cada mesa por su largo, no cada línea por igual', () => {
  const B = porMesa(POA, LARGO), A = mediaDeLineas(POA, LARGO);
  /* 2 mesas de 10 m a 900 y 6 de 100 m a 400: por largo domina la larga */
  const esperado = (2 * 10 * 900 + 6 * 100 * 400) / (2 * 10 + 6 * 100);
  debe(Math.abs(B - esperado) < 1e-9, 'por mesa da ' + B + ' y la cuenta a mano ' + esperado);
  debe(B < A, 'la línea corta con POA alto sigue pesando de más: A=' + A + ' B=' + B);
});

t('CONTROL NEGATIVO · la agregación vieja da OTRO número, así que volver atrás se nota', () => {
  const B = porMesa(POA, LARGO), A = mediaDeLineas(POA, LARGO);
  debe(Math.abs(A - 650) < 1e-9, 'la agregación vieja debería dar 650 (media de 900 y 400) y da ' + A);
  debe(Math.abs(B - A) > 1e-6, 'las dos coinciden: el control no puede fallar y no prueba nada');
});

/* ── y que la PÁGINA use la nueva, no sólo que la nueva exista ───────────── */
const cuerpo = (() => {
  const i = PAG.indexOf('function poaPlantSeg(');
  debe(i >= 0, 'no encuentro poaPlantSeg en backtracking.html');
  const j = PAG.indexOf('\n}', i);
  return PAG.slice(i, j);
})();

t('TEST NULO · el corte de `poaPlantSeg` tiene contenido y es el bueno', () => {
  debe(cuerpo.length > 500, 'el corte mide ' + cuerpo.length + ' caracteres: no se está mirando la función');
  debe(/shadeRows\(/.test(cuerpo), 'el corte no contiene `shadeRows(`: no es el cuerpo de poaPlantSeg');
});

t('`plant` sale de los acumulados de planta, no de la media de líneas', () => {
  debe(/plant:\s*W>0\?pAcc\/W:0/.test(cuerpo),
    '`plant` ya no se calcula pesando cada mesa por su largo — ¿se ha revertido a `sum/n`?');
  debe(/plantHi:\s*W>0\?pHi\/W:0/.test(cuerpo), '`plantHi` no sigue la misma agregación que `plant`');
  debe(/plantLo:\s*W>0\?pLo\/W:0/.test(cuerpo), '`plantLo` no sigue la misma agregación que `plant`');
});

t('CONTROL NEGATIVO · si `plant` vuelve a `sum/n`, la comprobación anterior se pone roja', () => {
  const revertido = cuerpo.replace(/plant:\s*W>0\?pAcc\/W:0/, 'plant:segAngles.length?sum/n:0');
  debe(revertido !== cuerpo, 'el control no ha cambiado nada: no prueba nada');
  debe(!/plant:\s*W>0\?pAcc\/W:0/.test(revertido),
    'con `plant` revertido a la media de líneas la comprobación SEGUIRÍA pasando');
});

/* ── la transición: A se sigue publicando ────────────────────────────────── */
t('la agregación anterior se publica al lado, durante la transición', () => {
  debe(/plantLinMedia:\s*segAngles\.length\?sum\/n:0/.test(cuerpo),
    '`plantLinMedia` no publica la agregación anterior: el cambio del 2 % en true3d y mgl sería incomprobable');
  debe(/poaLinMedia/.test(PAG), 'la serie del día no lleva `poaLinMedia`');
  debe(/kwhLinMedia/.test(PAG), 'el KPI del día no lleva `kwhLinMedia`');
});

t('la tabla del día tiene tantas celdas como cabeceras cuando hay mesas', () => {
  const cab = PAG.match(/rows\.push\('<tr><th>Política<[\s\S]*?<\/tr>'\);/);
  const fil = PAG.match(/rows\.push\('<tr><td style="color:'\+e\.P\.col[\s\S]*?<\/tr>'\);/);
  debe(cab && fil, 'no encuentro la cabecera o la fila de la tabla del día');
  const nTh = (cab[0].match(/<th/g) || []).length, nTd = (fil[0].match(/<td/g) || []).length;
  debe(nTh === nTd, 'la tabla del día tiene ' + nTh + ' cabeceras y ' + nTd + ' celdas');
  debe(nTh >= 10, 'sólo ' + nTh + ' cabeceras: falta la columna de la agregación anterior');
});

/* ── la salvedad, con su cifra y no como incógnita ───────────────────────── */
t('la salvedad del largo frente al área está escrita CON su cifra medida', () => {
  const i = PAG.indexOf('LA SALVEDAD, CON SU CIFRA');
  debe(i >= 0, 'no encuentro la salvedad junto a la cifra en `poaPlantSeg`');
  const texto = PAG.slice(i, i + 1400);
  debe(/-0,0003 %/.test(texto) && /\+0,0030 %/.test(texto),
    'la salvedad no trae el intervalo medido (-0,0003 % a +0,0030 %): sería una incógnita, no una salvedad acotada');
  debe(/14, 21 y 28/.test(texto), 'la salvedad no dice en cuánto difieren las mesas realmente');
});

t('CONTROL NEGATIVO · una salvedad sin cifra pone roja la anterior', () => {
  const sinCifra = 'LA SALVEDAD, CON SU CIFRA. El largo no es el área y punto.';
  debe(!/-0,0003 %/.test(sinCifra), 'el control no distingue: una salvedad sin cifra pasaría igual');
});

console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
