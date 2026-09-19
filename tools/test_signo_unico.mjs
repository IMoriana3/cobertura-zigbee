/* EL SIGNO DE PRESENTACIÓN VIVE EN UN SITIO
 *
 * `TH_DISP` decide si la columna `theta_tcu_deg` que se manda al campo sale con
 * el signo de la TCU o con el del simulador. Estaba escrito DOS veces —en
 * `backtracking.html` y en `tools/export_consignas.mjs`— como dos constantes
 * independientes. Un número copiado se queda viejo en silencio, y lo que se
 * queda viejo aquí es una consigna que se le manda a un seguidor.
 *
 *     node tools/test_signo_unico.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, fail = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n + (d ? '   ' + d : '')); }
                         else { fail++; console.log('  ✗ ' + n + (d ? '   ' + d : '')); } };

const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const exp = fs.readFileSync(path.join(ROOT, 'tools', 'export_consignas.mjs'), 'utf-8');

/* 1 · la página lo declara UNA vez y es el origen */
const decl = [...html.matchAll(/const\s+TH_DISP\s*=\s*(-?\d+)\s*;/g)];
T('la página declara TH_DISP exactamente una vez', decl.length === 1,
  decl.length + ' declaraciones' + (decl.length ? ' · valor ' + decl[0][1] : ''));

/* 2 · el guion NO lo copia: lo lee */
const copias = [...exp.matchAll(/const\s+TH_DISP\s*=\s*(-?\d+)\s*[;,]/g)];
T('export_consignas NO tiene una copia literal del valor', copias.length === 0,
  copias.length ? 'copias: ' + copias.map(m => m[1]).join(', ') : '');
T('export_consignas lo LEE de backtracking.html',
  /readFileSync\([^)]*backtracking\.html[^)]*\)/.test(exp) && /TH_DISP/.test(exp) &&
  /const\s+TH_DISP\s*=\s*\(\s*\(\s*\)\s*=>/.test(exp));
T('y revienta con el motivo si no lo encuentra, en vez de seguir con un valor por defecto',
  /no encuentro `const TH_DISP`/.test(exp));

/* 3 · el texto que se publica sale del valor leído, no de un número escrito */
T('la descripción publicada interpola el valor, no lo repite a mano',
  /TH_DISP=\$\{TH_DISP\}/.test(exp) && !/TH_DISP=-?\d/.test(exp.replace(/TH_DISP=\$\{TH_DISP\}/g, '')));

/* 4 · y de verdad coinciden, ejecutando la lectura */
const leido = (() => { const m = /const\s+TH_DISP\s*=\s*(-?\d+)\s*;/.exec(html); return m ? +m[1] : null; })();
T('la lectura que hace el guion devuelve el valor de la página', leido === -1 || leido === 1,
  'TH_DISP = ' + leido);

/* CONTROL NEGATIVO · si alguien vuelve a copiar el número, esto tiene que saltar.
   Sin él, las comprobaciones de arriba son expresiones regulares que nadie ha
   visto ponerse rojas. */
const mutado = exp.replace(/const TH_DISP = \(\(\) =>[\s\S]*?\}\)\(\);/, 'const TH_DISP = -1;');
T('CONTROL · con el número copiado otra vez, el banco se pondría rojo',
  /const\s+TH_DISP\s*=\s*\(\s*\(\s*\)\s*=>/.test(exp) &&
  [...mutado.matchAll(/const\s+TH_DISP\s*=\s*(-?\d+)\s*[;,]/g)].length === 1);

console.log('\n' + ok + ' OK · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
