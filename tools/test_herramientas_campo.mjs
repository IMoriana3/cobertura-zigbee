/* R3 · 4.5 — LAS DOS HERRAMIENTAS DE CAMPO, EN CI Y CON ALGO QUE PUEDA FALLAR
 *
 * `export_consignas.mjs` (lo que se manda al campo) y `careo_produccion.mjs`
 * (el careo del simulador contra la producción por string) no estaban en CI.
 * Se podían romper y nadie se enteraba hasta que alguien las corriera a mano.
 *
 * LO QUE HAY QUE SABER ANTES DE METERLAS: ninguna de las dos llama a
 * `process.exit`. `careo_produccion` imprime «veredicto: IDÉNTICOS» o su
 * contrario y en los dos casos SALE 0. Meterlas en el fichero de CI como un
 * `run:` pelado habría sido la enésima comprobación que pasa sin poder fallar:
 * verde garantizado mientras el careo publica que las dos plantas discrepan.
 * Por eso este banco no mira el código de salida: LEE LO QUE PUBLICAN.
 *
 * COSTE, MEDIDO (no estimado), en esta máquina:
 *   export_consignas --paso  5 : 280,6 s   ← el paso real de campo
 *   export_consignas --paso 30 :  50,3 s   ← el que corre aquí
 *   careo_produccion           : 105,0 s
 * En CI se corre el paso 30 y se dice: con paso 30 la sombra media de planta
 * sale 1,48 % y con paso 5 sale 0,63 %, porque el lazo tiene seis veces más
 * tiempo para alcanzar la consigna. La cifra de CI NO es la publicable; lo que
 * se vigila aquí es que las herramientas corren y que lo que publican cuadra.
 *
 *     node tools/test_herramientas_campo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let N = 0, FAIL = 0;
const t = (n, f) => { N++; try { f(); console.log('  ✓ ' + n); }
  catch (e) { FAIL++; console.error('  ✗ ' + n + ' — ' + e.message); } };
const debe = (c, m) => { if (!c) throw new Error(m); };

/* lector único: devuelve null si el campo NO está, para que el test nulo pueda
   distinguir «vale 0» de «no lo he encontrado» — que es la confusión por la que
   una comprobación pasa sobre un hueco */
const campo = (txt, re) => { const m = re.exec(txt); return m ? m[1] : null; };

const correr = (guion, args) => {
  const t0 = Date.now();
  const out = execFileSync('node', [path.join('tools', guion), ...args],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { out, seg: (Date.now() - t0) / 1000 };
};

/* ── export_consignas ─────────────────────────────────────────────────────── */
console.log('export_consignas (paso 30)');
const CSV = '/tmp/consignas_ci_ayora.csv';
if (fs.existsSync(CSV)) fs.unlinkSync(CSV);
const E = correr('export_consignas.mjs',
  ['--planta', 'ayora', '--fecha', '2026-06-21', '--paso', '30', '--salida', CSV]);
console.error(`  (${E.seg.toFixed(1)} s)`);

t('el exportador corre y escribe el CSV donde dice', () => {
  const dest = campo(E.out, /consignas → (\S+)/);
  debe(dest, 'el exportador no ha dicho dónde escribe: no hay nada que comprobar');
  debe(fs.existsSync(dest), 'dice que escribe en ' + dest + ' y ahí no hay fichero');
  debe(dest === CSV, 'ha escrito en ' + dest + ' y se le pidió ' + CSV);
});

t('las filas que ANUNCIA son las filas que ESCRIBE', () => {
  const dichas = campo(E.out, /(\d+) filas/);
  debe(dichas, 'el exportador no anuncia cuántas filas escribe');
  const reales = fs.readFileSync(CSV, 'utf8').trimEnd().split('\n').length - 1;  // menos la cabecera
  debe(+dichas === reales, 'anuncia ' + dichas + ' filas y el CSV tiene ' + reales);
});

t('la versión que sella el exportador es la `const VER` de la página', () => {
  const sellada = campo(E.out, /·\s+(v[\d.]+)\s*$/m);
  const pag = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf8');
  const VER = campo(pag, /const\s+VER\s*=\s*'(v[\d.]+)'\s*;/);
  debe(sellada, 'el exportador no sella ninguna versión en su resumen');
  debe(VER, 'no encuentro `const VER` en backtracking.html');
  debe(sellada === VER, 'el CSV sale sellado ' + sellada + ' y la página va por ' + VER);
});

t('publica pasos diurnos y sombra, y son números, no huecos', () => {
  const pasos = campo(E.out, /(\d+) pasos diurnos/);
  const sombra = campo(E.out, /sombra media de planta ([\d.]+)%/);
  debe(pasos && +pasos > 0, 'pasos diurnos ausente o cero: ' + pasos);
  debe(sombra !== null && Number.isFinite(+sombra), 'sombra media ausente o no numérica: ' + sombra);
});

/* ── careo_produccion ─────────────────────────────────────────────────────── */
console.log('careo_produccion');
const C = correr('careo_produccion.mjs', []);
console.error(`  (${C.seg.toFixed(1)} s)`);

t('TEST NULO · el careo publica de verdad los campos que se le van a mirar', () => {
  for (const [nom, re] of [['sin casar', /sin casar: (\d+)/],
                           ['sol distinto', /sol distinto entre páginas: (\d+)/],
                           ['peor |Δθ| interior', /peor \|Δθ\| interior: ([\d.]+)°/],
                           ['veredicto', /veredicto: (.+)/]])
    debe(campo(C.out, re) !== null, 'el careo NO publica «' + nom + '»: la comprobación que lo mire pasaría sobre un hueco');
});

t('ninguna mesa se queda sin casar entre las dos plantas', () => {
  const s = campo(C.out, /sin casar: (\d+)/);
  debe(+s === 0, 'quedan ' + s + ' mesas sin casar');
});

t('las dos páginas ven el mismo sol en todos los instantes', () => {
  const s = campo(C.out, /sol distinto entre páginas: (\d+)/);
  debe(+s === 0, s + ' instantes con sol distinto: el careo compara dos cielos, no dos plantas');
});

t('las mesas interiores siguen siendo idénticas bit a bit', () => {
  const dth = campo(C.out, /peor \|Δθ\| interior: ([\d.]+)°/);
  const dpo = campo(C.out, /peor \|ΔPOA\| interior: ([\d.]+) W\/m²/);
  debe(+dth === 0, 'peor |Δθ| interior ' + dth + '°, y el careo lo da por idéntico');
  debe(+dpo === 0, 'peor |ΔPOA| interior ' + dpo + ' W/m²');
});

t('el veredicto dice IDÉNTICOS', () => {
  const v = campo(C.out, /veredicto: (.+)/);
  debe(/IDÉNTICOS/.test(v), 'veredicto: ' + v);
});

/* ── el control negativo: lo que el `run:` pelado NO habría cazado ────────── */
t('CONTROL NEGATIVO · un careo que discrepa pone rojo este banco', () => {
  const roto = C.out.replace(/sin casar: 0/, 'sin casar: 3')
                    .replace(/peor \|Δθ\| interior: [\d.]+°/, 'peor |Δθ| interior: 4.2000°')
                    .replace(/veredicto: .+/, 'veredicto: DISCREPAN en 3 mesas interiores');
  debe(roto !== C.out, 'el control no ha alterado nada: no prueba nada');
  debe(+campo(roto, /sin casar: (\d+)/) !== 0, 'con 3 sin casar la comprobación seguiría pasando');
  debe(+campo(roto, /peor \|Δθ\| interior: ([\d.]+)°/) !== 0, 'con 4,2° la comprobación seguiría pasando');
  debe(!/IDÉNTICOS/.test(campo(roto, /veredicto: (.+)/)), 'con el veredicto roto la comprobación seguiría pasando');
});

t('CONTROL NEGATIVO · el código de salida NO basta: los dos guiones salen 0 siempre', () => {
  for (const g of ['export_consignas.mjs', 'careo_produccion.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, 'tools', g), 'utf8');
    debe(!/process\.exit\(\s*[^0\s)]/.test(src),
      g + ' ya sale con código distinto de 0; si eso ha cambiado, revisa si este banco sigue siendo el que protege');
  }
});

console.log(FAIL === 0 ? `OK — ${N} comprobaciones` : `${FAIL}/${N} FALLOS`);
process.exit(FAIL === 0 ? 0 : 1);
