#!/usr/bin/env node
/* 4.2 — TABLA DE PROCEDENCIA. Una fila por cada cifra que el informe publica
   hacia fuera, con su ítem, script, commit, MV, nb y si está calibrada.
   Una cifra que no pueda llenar TODAS sus columnas se marca NO PUBLICABLE.

   La tabla se declara aquí, a mano, porque «qué cifra sale hacia fuera» es una
   decisión del informe y no algo que se pueda extraer del documento: lo que el
   script hace es COMPROBAR que cada fila está completa y que su ítem y su script
   existen de verdad, y marcar las que no.

   Ejecutable:  node audit2/procedencia.mjs
   Salida: audit2/out/PROCEDENCIA.md (tabla) + resumen por stdout
   Código de salida: 0 si ninguna fila queda NO PUBLICABLE, 1 si alguna. */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const DOC = fs.readFileSync(path.join(ROOT, 'audit2', 'EVIDENCIA_BT_R2.md'), 'utf-8');
const C = '3a57451';   // commit auditado

/* cifra | item | script | commit | MV | nb | calibrada
   calibrada: 'S' si la cifra sale de un diseño cuyo sesgo está medido; 'N' si no
   aplica porque no hay diseño reducido de por medio; 'NO' si hace falta y falta. */
const T = [
  // cifra | item | script | commit | MV | nb | calibrada | diseño | ruta de código
  ['POA pairwise anual Ayora 2313,4464 kWh/m²·año',      'E-A3', 'A3_anual_ayora.mjs',      C, '8',    '2', 'N', 'pleno',        '`T.real` → MV 8 · `poaPlant`'],
  ['POA true-3D anual Ayora 2298,7128 kWh/m²·año',       'E-A3', 'A3_anual_ayora.mjs',      C, '8',    '2', 'N', 'pleno',        '`T.real` → MV 8 · `poaPlant`'],
  ['θ de anglesOptimal caso B: f=1, 55,000° ×6',          'E-A1', 'A1_veto_optimal.mjs',     C, '33',   '2', 'N', 'instantáneo',  '`mvPara` adaptativo · `poaPlant`'],
  ['POA de la ganadora del veto 241,5138 W/m²',           'E-A1', 'A1_veto_optimal.mjs',     C, '33',   '2', 'N', 'instantáneo',  '`mvPara` adaptativo · `poaPlant`'],
  ['barridos hasta converger de optfree: 3',              'E-A2', 'A2_ascenso_optfree.mjs',  C, '33',   '2', 'N', 'instantáneo',  '`mvPara` adaptativo · `poaPlant(...,fast)`'],
  ['poaPlantSeg pondera por largo de mesa',               'E-A4', 'A4_poaplantseg.mjs',      C, '33',   '2', 'N', 'instantáneo',  '`poaPlantSeg` · `segTiltAt`'],
  ['84,33 % de instantes con θ de sombra 0 (3562/4224)',  'E-C1', 'C_monotonia.mjs',         C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`shadeBand3DAll` noStruct'],
  ['25,00 % de instantes con más de un cruce (50/200)',   'E-C2', 'C_monotonia.mjs',         C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`shadeBand3DAll` noStruct'],
  ['contraejemplo del min|θ| en 75/200 instantes',        'E-C3', 'C_monotonia.mjs',         C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`shadeBand3DAll` noStruct'],
  ['peso energético del contraejemplo 22,79 %',           'E-C3', 'C_monotonia.mjs',         C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`poaPlant` con θ de pairwise'],
  ['applyDrive deja sombra evitable: 9/12/5/7 de 112',    'E-C4', 'C4_applydrive.mjs',       C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`policyAngles` → `applyDrive`'],
  ['|Δθ| bisección vs barrido fino ≤ 0,04987°',           'E-C5', 'C5_bisecciones.mjs',      C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`bt3dPairMaxMag` · `shadeRows`'],
  ['el min|θ| gana energía en 74 de 75 instantes',        'E-C6', 'C34_energia.mjs',         C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`poaPlant` · θ uniforme'],
  ['ΔPOA > 0 en las 41 celdas de E-C7',                   'E-C7', 'C34_energia.mjs',         C, 'mvPara (17/33)', '2', 'N', 'instantáneo', '`policyAngles` · `poaPlant`'],
  ['el argmax del barrido de θ se mueve con MV',          'E-D1', 'D1_cuantizacion_mv.mjs',  C, '8/16/32/64/128', '2', 'N', 'instantáneo', '`T.mv` forzado · `poaPlant`'],
  ['orden de las 9 políticas por nb (tabla de 5 columnas)','E-D3', 'D23_anual_variantes.mjs', C, '8',   '0/1/2/3/6', 'S4', 'reducido', '`T.nBypass` + `T.real` → MV 8'],
  ['escalón eléctrico mínimo por mesa = 1/(nb·MV)',       'E-D4', 'D4_escalon.mjs',          C, '8/16/32', '2/3/6', 'N', 'instantáneo', '`T.mv` forzado · `elecLoss`'],
  ['offsets del diseño reducido: −0,8451…−0,8678 %',      'E-D5', 'D5_calibracion_plena.mjs', C, '8',   '2', 'S', 'pleno',       '`T.real` → MV 8 · `poaPlant`'],
  ['la columna nb=2 coincide por las dos rutas (9/9)',    'E-D6', 'D6_nb2_cruzada.mjs',      C, '8',    '2', 'S', 'reducido',    '`T.mv` frente a `T.real`'],
  ['el escalón de sombra existe sólo con MV = 33',        'E-E4', 'E4_mv_impar.mjs',         C, '32/33/34/65/66', '2', 'N', 'instantáneo', '`T.mv` forzado · sonda en `shadeBand3DAll`'],
  ['|Δθ| JS↔Python = 0,0000° exacto en el caso A',        'E-G1', 'G1_careo.mjs',            C, '33',   '2', 'N', 'instantáneo', '`policyAngles` ↔ `tracker3d.py`'],
  ['|Δθ| JS↔Python hasta 65° en el caso B',               'E-G1', 'G1_careo.mjs',            C, '33',   '2', 'N', 'instantáneo', '`policyAngles` ↔ `tracker3d.py`'],
  ['repairNoShade descartado: 0 de 14 caen',              'E-G4', 'G4_sin_repair.mjs',       C, '33',   '2', 'N', 'instantáneo', '`repairNoShadeCore` anulado en memoria'],
  ['|θ_JS| < |θ_PY| en 14 de 14 y 103 de 148',            'E-G5', 'G5_caracteriza.mjs',      C, '33',   '2', 'N', 'instantáneo', '`policyAngles` ↔ `tracker3d.py`'],
  ['7 de 9 políticas tienen contraparte en tracker3d.py', 'E-G3', 'G3_arnes.mjs',            C, '—',    '—', 'N', '—',           'lectura de `tracker3d.py`'],
  ['Δ de transponer por mesa: pairwise +0,3524 %',        'E-F2', 'F23_mesa.mjs',            C, '8',    '2', 'DIA', 'un día',    '`poaRow`+`segTiltAt`+`segMods`'],
  ['dispersión intra-motor: mediana 1,12-1,26 %',         'E-F3', 'F23_mesa.mjs',            C, '8',    '2', 'DOM', 'un día',    '`poaPlantSeg` · `T.segDrive`'],
  ['el gate de CI cuenta cancelled como failure',         'E-H1', 'verifica_citas.mjs',      C, '—',    '—', 'N', '—',           'GitHub Actions API'],
];
const CAB = ['cifra', 'ítem', 'script', 'commit', 'MV', 'nb', 'calibrada', 'diseño', 'ruta de código'];
const filas = [], malas = [];
for (const f of T) {
  const [cifra, item, script, commit, mv, nb, cal, dis, ruta] = f;
  const falta = [];
  if (!cifra) falta.push('cifra');
  if (!DOC.includes('### ' + item)) falta.push(`el ítem ${item} no existe en el documento`);
  if (!fs.existsSync(path.join(ROOT, 'audit2', script))) falta.push(`el script audit2/${script} no existe`);
  if (!commit) falta.push('commit');
  if (!mv) falta.push('MV');
  if (!nb) falta.push('nb');
  if (!['S', 'S4', 'N', 'DIA', 'DOM'].includes(cal)) falta.push('calibrada');
  if (!dis) falta.push('diseño');
  if (!ruta) falta.push('ruta de código');
  // DOM = el problema no es de calibración sino de DOMINIO, y calibrar no lo corrige
  if (cal === 'DOM') falta.push('dominio: distribución de un día contra enunciado anual');
  if (falta.length) malas.push({ cifra, falta });
  const ETIQ = { S: 'S', N: 'N',
    S4: '`calibrada en 4 de 9 · offset de modo común verificado en esas 4`',
    DIA: '`INDICIO DIMENSIONADO · un día, no anualizado`',
    DOM: '**NO PUBLICABLE por DOMINIO**' };
  filas.push([cifra, item, '`audit2/' + script + '`', commit, mv, nb, ETIQ[cal], dis, ruta,
              falta.length ? '**NO PUBLICABLE**' : 'publicable']);
}
const md = ['# TABLA DE PROCEDENCIA',
  '', `Generada por \`audit2/procedencia.mjs\` sobre \`audit2/EVIDENCIA_BT_R2.md\`.`,
  `Árbol ${SHA} · commit auditado ${C} · node ${process.version}.`, '',
  'Columna **calibrada**: `S` el sesgo del diseño está medido para esa cifra ·',
  '`N` no aplica (no hay diseño reducido de por medio) ·',
  '`calibrada en 4 de 9` el offset de modo común está verificado en cuatro políticas',
  '(pairwise −0,8622 %, true-3D −0,8678 %, optimal −0,8451 %, optfree −0,8461 %;',
  'se reparten en **0,0227 pp** y el ordinal entre ellas es idéntico en los dos diseños) ·',
  '`INDICIO DIMENSIONADO` la cifra es de un día y no se anualiza, por decisión del auditor ·',
  '`NO PUBLICABLE por DOMINIO` el problema no es de calibración sino de dominio:',
  'una distribución de un día no responde a un enunciado anual, y calibrar no lo corrige.',
  '',
  'Columna **diseño**: `pleno` (12 días, paso 10 min) · `reducido` (4 días, paso 20 min) ·',
  '`instantáneo` (un instante o un barrido de θ) · `un día`.',
  'Columna **ruta de código**: por qué rama se llega al resultado. Está por la lección de',
  'la columna `nb = 2` (regla M.1): dos rutas que deben coincidir no coinciden hasta que',
  'se comprueba, y E-D6 lo comprobó.', '',
  '| ' + [...CAB, 'estado'].join(' | ') + ' |',
  '|' + [...CAB, 'estado'].map(() => '---').join('|') + '|',
  ...filas.map(f => '| ' + f.join(' | ') + ' |'), ''];
if (malas.length) { md.push('## Filas NO PUBLICABLES y por qué', '');
  for (const m of malas) md.push(`- **${m.cifra}** — falta: ${m.falta.join('; ')}`); md.push(''); }
fs.writeFileSync(path.join(ROOT, 'audit2', 'out', 'PROCEDENCIA.md'), md.join('\n'));
console.log(md.join('\n'));
console.log(`\nfilas: ${filas.length} · publicables: ${filas.length - malas.length} · NO PUBLICABLES: ${malas.length}`);
process.exit(malas.length ? 1 : 0);
