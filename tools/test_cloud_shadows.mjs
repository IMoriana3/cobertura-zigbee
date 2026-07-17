/* Checks DETERMINISTAS de las sombras de nube (terreno.html) — sin WebGL ni canvas.
   Uso:  node tools/test_cloud_shadows.mjs
   a) _cloudBlobTex no usa createRadialGradient (ni arcos): los gradientes radiales pintaban círculos evidentes;
   b) buildCloudShadows usa una semilla DISTINTA por manto;
   c) la máscara generada tiene alpha 0 en los bordes del plano (sin marco);
   d) el interior tiene masa con variación real (ni vacío ni plano uniforme) y cada semilla da un campo distinto. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'terreno.html'), 'utf-8');

let N = 0, FAIL = 0;
function t(name, fn) {
  N++;
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + ' — ' + e.message); }
}
function slice(from, to, label) {
  const i = html.indexOf(from);
  if (i < 0) throw new Error('no encuentro ' + label);
  const j = html.indexOf(to, i);
  return html.slice(i, j < 0 ? undefined : j);
}

const srcTex = slice('function _cloudBlobTex', 'function buildCloudShadows', '_cloudBlobTex');
const srcBuild = slice('function buildCloudShadows', 'function cloudShadowStep', 'buildCloudShadows');
const srcField = slice('function _cloudAlphaField', 'function _cloudBlobTex', '_cloudAlphaField');
const srcStep = slice('function cloudShadowStep', '\nfunction ', 'cloudShadowStep');

console.log('estático');
t('a) _cloudBlobTex sin createRadialGradient ni arc()', () => {
  if (/createRadialGradient\s*\(/.test(srcTex)) throw new Error('usa createRadialGradient');   // la LLAMADA, con paréntesis: el comentario que explica por qué se evita menciona el nombre
  if (/\.arc\(/.test(srcTex)) throw new Error('usa arc()');
});
t('b) buildCloudShadows: semilla distinta por manto (_cloudBlobTex(i+1) dentro del for)', () => {
  if (!/_cloudBlobTex\(i\+1\)/.test(srcBuild)) throw new Error('no pasa i+1 como semilla');
  if (/_cloudBlobTex\(\)/.test(srcBuild)) throw new Error('queda una llamada sin semilla');
});
t('la textura configura LinearFilter y ClampToEdge', () => {
  if (!/minFilter=THREE\.LinearFilter/.test(srcTex) || !/magFilter=THREE\.LinearFilter/.test(srcTex)) throw new Error('sin LinearFilter');
  if (!/ClampToEdgeWrapping/.test(srcTex)) throw new Error('sin clamp');
});
t('cloudShadowStep conserva GENCLOUD, solo-día y drapeo con localElevY', () => {
  if (!/GENCLOUD/.test(srcStep) || !/localElevY/.test(srcStep) || !/U>0\.02/.test(srcStep)) throw new Error('perdió GENCLOUD/día/drapeo');
});

// ejecuta el campo PURO en Node
const field = new Function(srcField + '; return _cloudAlphaField;')();
const S = 128;

console.log('campo de alpha (S=' + S + ', semillas 1/2/3)');
[1, 2, 3].forEach(seed => {
  const A = field(S, seed);
  t('c) semilla ' + seed + ': alpha EXACTAMENTE 0 en todo el perímetro', () => {
    let mx = 0;
    for (let i = 0; i < S; i++) mx = Math.max(mx, A[i], A[(S - 1) * S + i], A[i * S], A[i * S + S - 1]);
    if (mx > 0) throw new Error('alpha de borde ' + mx);
  });
  t('d) semilla ' + seed + ': masa interior con variación (no vacía, no plana, con borde irregular)', () => {
    let mn = 1e9, mx = -1e9, sum = 0, sum2 = 0, cov = 0, n = 0;
    for (let j = S >> 2; j < S - (S >> 2); j++) for (let i = S >> 2; i < S - (S >> 2); i++) {
      const v = A[j * S + i]; mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; sum2 += v * v; if (v > 0.03) cov++; n++;
    }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    if (mx < 0.3) throw new Error('sin masa (max ' + mx.toFixed(2) + ')');
    if (mx - mn < 0.3) throw new Error('interior plano (rango ' + (mx - mn).toFixed(2) + ')');
    if (sd < 0.05) throw new Error('sin variación (σ ' + sd.toFixed(3) + ')');
    if (cov / n < 0.15 || cov / n > 0.97) throw new Error('cobertura rara ' + (cov / n).toFixed(2));
  });
});
t('semillas distintas → campos distintos (1 vs 2 vs 3)', () => {
  const A = field(S, 1), B = field(S, 2), C = field(S, 3);
  const dif = (P, Q) => { let d = 0; for (let k = 0; k < S * S; k++) d += Math.abs(P[k] - Q[k]); return d / (S * S); };
  if (dif(A, B) < 0.02 || dif(A, C) < 0.02 || dif(B, C) < 0.02) throw new Error('dos mantos casi iguales');
});
t('determinista: la misma semilla reproduce el mismo campo', () => {
  const A = field(S, 2), B = field(S, 2);
  for (let k = 0; k < S * S; k++) if (A[k] !== B[k]) throw new Error('no determinista en k=' + k);
});
t('sin simetría radial: correlación de la MASA central con su giro de 90° baja', () => {
  // se mide solo la zona de meseta (central): el anillo de borde es alpha 0 en ambos campos y sus ceros
  // compartidos inflaban r midiendo la VENTANA, no la forma de la masa — con el patrón radial antiguo
  // esta métrica daría r≈1 (invariante bajo giro), así que sigue cazando discos
  const A = field(S, 1), lo = Math.round(S * 0.2), hi = Math.round(S * 0.8);
  let sAB = 0, sA = 0, sB = 0, sA2 = 0, sB2 = 0, n = 0;
  for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) {
    const a = A[j * S + i], b = A[i * S + (S - 1 - j)];   // giro 90°
    sAB += a * b; sA += a; sB += b; sA2 += a * a; sB2 += b * b; n++;
  }
  const cov = sAB / n - (sA / n) * (sB / n), va = sA2 / n - (sA / n) ** 2, vb = sB2 / n - (sB / n) ** 2;
  const r = cov / Math.sqrt(Math.max(1e-12, va * vb));
  if (r > 0.5) throw new Error('demasiado simétrico (r=' + r.toFixed(2) + ')');
});

console.log('');
if (FAIL) { console.error(`FALLAN ${FAIL}/${N}`); process.exit(1); }
console.log(`OK — ${N}/${N} tests`);
