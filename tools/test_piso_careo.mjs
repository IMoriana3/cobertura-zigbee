/* EL VIGILANTE DEL VIGILANTE: la tabla de pisos contra el workflow.
 *
 * `tools/con_piso.mjs --tabla` carea su tabla (pisos, exenciones y la lista de
 * la matriz `navegador`) con lo que el CI CORRE, en los dos sentidos. Este
 * banco comprueba que ese careo MIRA: con el workflow de verdad sale verde, y
 * con cada mutante —uno por dirección y por lista— sale ROJO diciendo por qué.
 * Sin esto, el careo podría leer mal el workflow y dar verde a todo, que es
 * exactamente el defecto que existe para cazar.
 *
 *     node tools/test_piso_careo.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YML = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'bancos.yml'), 'utf8');
let ok = 0, ko = 0;
const t = (n, c, extra) => { if (c) { ok++; console.log('  ✓ ' + n + (extra ? '   ' + extra : '')); } else { ko++; console.log('  ✗ ' + n + (extra ? ' — ' + extra : '')); } };

function tabla(yml) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'piso-')), 'bancos.yml');
  fs.writeFileSync(f, yml);
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'tools', 'con_piso.mjs'), '--tabla'],
    { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, CON_PISO_YML: f } });
  return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('el contador del piso, careado con el workflow');
const real = tabla(YML);
t('con el workflow de verdad, la tabla cuadra (rc 0)', real.rc === 0, real.rc === 0 ? '' : real.out.split('\n').filter(l => /ROJO/.test(l)).join(' | '));

/* un mutante por cada cosa que el careo dice vigilar; cada uno TIENE que dar
   rc 1 y nombrar lo que ha visto */
const primeraMatriz = /\n\s*-\s*\{\s*banco:[^\n]*\}[^\n]*/.exec(YML.slice(YML.indexOf('\n  navegador:')));
const MUT = [
  ['SENTIDO 1 · una entrada de la matriz que la lista no conoce',
   primeraMatriz ? YML.replace(primeraMatriz[0], primeraMatriz[0] + '\n          - { banco: test_fantasma.mjs }') : YML,
   /test_fantasma\.mjs.*NO en MATRIZ_SIN_MEDIR/],
  ['SENTIDO 2 · QUITAR una entrada de la matriz (la lista la sigue contando)',
   primeraMatriz ? YML.replace(primeraMatriz[0], '') : YML,
   /ya NO está en la matriz/],
  ['SENTIDO 1 · un banco nuevo en un paso, sin piso',
   YML.replace('\n  navegador:', '\n      - name: banco sin registrar\n        run: node tools/test_sin_piso_nuevo.mjs\n  navegador:'),
   /test_sin_piso_nuevo\.mjs corre en el workflow y no tiene piso/],
  ['SENTIDO 2 · un piso que ningún paso aplica (se quita el envoltorio de test_orto)',
   YML.replace(/node tools\/con_piso\.mjs tools\/test_orto\.mjs/g, 'node tools/test_orto.mjs'),
   /test_orto\.mjs tiene piso .*NINGÚN paso/],
  ['un banco NOMBRADO solo en un comentario no cuenta como aplicado',
   YML.replace(/node tools\/con_piso\.mjs tools\/test_orto\.mjs/g, 'true') + '\n# node tools/con_piso.mjs tools/test_orto.mjs\n',
   /test_orto\.mjs tiene piso .*NINGÚN paso/],
];
for (const [nombre, y, rx] of MUT) {
  if (y === YML) { t('CONTROL · ' + nombre + ': el mutante no se pudo construir', false); continue; }
  const r = tabla(y);
  t('CONTROL · ' + nombre + ' → ROJO', r.rc === 1 && rx.test(r.out),
    r.rc === 1 ? (r.out.split('\n').find(l => rx.test(l)) || 'rojo, pero no dice lo esperado: ' + r.out.split('\n').filter(l => /ROJO/.test(l)).join(' | ')) : 'rc=' + r.rc + ' — NO LO VE');
}
console.log(ko ? `${ko} FALLOS de ${ok + ko}` : `TODO OK — ${ok} comprobaciones`);
process.exit(ko ? 1 : 0);
