/* R3 · ¿SIGUE INTACTO EL PAQUETE SELLADO R2?
 *
 * Recorre `audit2/out/MANIFEST.txt` y comprueba, entrada a entrada, que el
 * fichero existe, que mide los bytes declarados y que su sha256 es el sellado.
 * Los artefactos viven en `audit2/out/`; los guiones, en `audit2/`.
 *
 * CONTROL NEGATIVO, obligatorio y automático. Antes de dar por buena la
 * comprobación, el guion se verifica a sí mismo: toma la primera entrada, le
 * cambia UN byte en una copia temporal y exige que el verificador la marque
 * como NO CASA. Si el control no salta, la comprobación no puede fallar y no
 * informa de nada: el guion sale con error y lo dice.
 *
 *     node audit3/verifica_manifiesto.mjs
 *
 * Salida 0 = las N entradas casan y el control negativo saltó.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const MAN = path.join(OUT, 'MANIFEST.txt');

const LINEA = /^(\S+)\s+(\d+)\s+([0-9a-f]{64})\s*$/;

function entradas() {
  return readFileSync(MAN, 'utf8').split('\n')
    .map(l => LINEA.exec(l)).filter(Boolean)
    .map(m => ({ f: m[1], bytes: +m[2], sha: m[3] }));
}
/* resuelve en out/ y, si no, en la raíz del paquete: el manifiesto mezcla
   artefactos y guiones y no lleva el directorio en el nombre */
function ruta(f) {
  for (const c of [path.join(OUT, f), path.join(ROOT, 'audit2', f)])
    if (existsSync(c)) return c;
  return null;
}
/* comprueba una entrada contra un contenido dado (el del disco, o el mutado
   por el control negativo) */
function casa(e, buf) {
  return buf !== null && buf.length === e.bytes
      && createHash('sha256').update(buf).digest('hex') === e.sha;
}

const E = entradas();
if (E.length === 0) { console.log('SIN ENTRADAS: el manifiesto no se ha podido leer'); process.exit(2); }

/* ── CONTROL NEGATIVO ─────────────────────────────────────────────────── */
const c0 = E[0], p0 = ruta(c0.f);
if (!p0) { console.log('CONTROL IMPOSIBLE: no encuentro ' + c0.f); process.exit(2); }
const mut = Buffer.from(readFileSync(p0));
mut[0] = mut[0] ^ 0xff;                       // un byte, el primero
const controlSalta = !casa(c0, mut);
console.log('control negativo · un byte cambiado en ' + c0.f + ' → ' +
            (controlSalta ? 'DETECTADO' : 'NO DETECTADO'));
if (!controlSalta) { console.log('\nLA COMPROBACIÓN NO PUEDE FALLAR: no informa de nada.'); process.exit(2); }

/* ── VERIFICACIÓN ─────────────────────────────────────────────────────── */
let ok = 0; const malos = [];
for (const e of E) {
  const p = ruta(e.f);
  if (!p) { malos.push('NO EXISTE  ' + e.f); continue; }
  const buf = readFileSync(p);
  if (casa(e, buf)) ok++;
  else malos.push('NO CASA    ' + e.f + '  bytes ' + statSync(p).size + '/' + e.bytes);
}
console.log('entradas del manifiesto : ' + E.length);
console.log('  CASAN                 : ' + ok);
console.log('  NO CASAN              : ' + malos.length);
for (const m of malos) console.log('  ' + m);
console.log('\nRESULTADO: ' + (malos.length ? 'EL PAQUETE SELLADO HA CAMBIADO' : 'paquete sellado intacto'));
process.exit(malos.length ? 1 : 0);
