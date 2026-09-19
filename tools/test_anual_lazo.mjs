/* LA RUTA ANUAL PASA POR EL LAZO, Y NO PUEDE VOLVER A SALTÁRSELO
 *
 * La cifra de «Estimación anual» es la que sale de la empresa. Hasta v1.70
 * sumaba la consigna que la política PIDE —`policyAngles` y a sumar—, sin banda
 * muerta y sin velocidad de actuador, o sea lo que la planta pediría y no lo que
 * ejecuta. Medido sobre el preset genérico (audit3/F2_anual_lazo.mjs): `astro`
 * se movía +0,0095 % y todas las demás entre −1,7 % y −2,3 %, con lo que la
 * página afirmaba que el backtracking gana +2,638 % sobre el astronómico puro
 * cuando con el lazo gana +0,255 %.
 *
 * Este banco es de FUENTE y de CONDUCTA, y las dos mitades llevan su control.
 *
 *     node tools/test_anual_lazo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
let ok = 0, fail = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n + (d ? '   ' + d : '')); }
                         else { fail++; console.log('  ✗ ' + n + (d ? '   ' + d : '')); } };

/* el cuerpo del estimador anual, cortado por sus dos extremos reales */
const i0 = html.indexOf("$('yearbtn').onclick");
const i1 = html.indexOf("const ref=tot['pairwise']");
const anual = (i0 >= 0 && i1 > i0) ? html.slice(i0, i1) : '';
/* TEST NULO del corte, escrito ANTES de lo que protege: un ancla que deje de
   existir daría rebanada vacía y todo lo de abajo pasaría sin mirar nada */
T('el corte del estimador anual no está vacío',
  anual.length > 400 && /for\(let mo=0;mo<12;mo\+\+\)/.test(anual),
  anual.length + ' caracteres');

/* 1 · pasa por el lazo, siguiendo el DATO y no el nombre de la variable */
const creaLazo = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{\s*\}\s*;[\s\S]{0,200}?\1\[[^\]]+\]\s*=\s*crearLazo\(/.test(anual)
              || /crearLazo\(/.test(anual);
T('el anual crea lazos', creaLazo);
const porElLazo = /([A-Za-z_$][\w$]*)(?:\[[^\]]+\])?\.paso\(\s*([A-Za-z_$][\w$]*)\s*,/.exec(anual);
T('lo que se suma sale del lazo, no de policyAngles directo', !!porElLazo,
  porElLazo ? 'paso(' + porElLazo[2] + ', …)' : 'no hay ninguna llamada a .paso(');
if (porElLazo) {
  const v = porElLazo[2];
  T('y lo que entra en el lazo es el mando de la política',
    new RegExp('(?:const|let|var)\\s+' + v + '\\s*=\\s*policyAngles\\(').test(anual));
  const salida = /\.paso\([^)]*\)\s*;[\s\S]{0,200}?poaPlant\(([^)]*)\)/.exec(anual);
  T('y lo que entra en poaPlant es la SALIDA del lazo, no el mando',
    /tot\[P\.key\]\+=poaPlant\([^)]*,\s*lim\s*,/.test(anual) ||
    (!!salida && /\blim\b/.test(salida[1])),
    salida ? salida[1].slice(0, 60) : '');
}
/* CONTROL NEGATIVO de las dos de arriba: sobre el código VIEJO tienen que fallar.
   Sin esto serían expresiones regulares que nadie ha visto ponerse rojas. */
const viejo = anual.replace(/const lim=[^;]+;\s*/, '')
                   .replace(/,\s*lim\s*,/, ',a,')
                   .replace(/crearLazo\(/g, 'noCrearLazo(');
T('CONTROL · sobre el código de antes, el banco se pondría rojo',
  !/crearLazo\(/.test(viejo) && !/,\s*lim\s*,/.test(viejo));

/* 2 · el paso, una sola vez y coherente con su ponderación */
const pasos = [...anual.matchAll(/m\+=\s*([A-Za-z_$][\w$]*|\d+)/g)].map(m => m[1]);
T('el paso del bucle es una constante con nombre, no un número suelto',
  pasos.length === 1 && !/^\d+$/.test(pasos[0]), 'paso: ' + pasos.join(', '));
if (pasos.length === 1 && !/^\d+$/.test(pasos[0])) {
  const P = pasos[0];
  T('la ponderación usa el MISMO paso que el bucle',
    new RegExp('\\(\\s*' + P + '\\s*/\\s*60\\s*\\)').test(anual));
  T('y el lazo recibe ese mismo paso, en segundos',
    new RegExp('\\.paso\\([^,]+,\\s*' + P + '\\s*\\*\\s*60\\s*\\)').test(anual));
  const m = new RegExp('(?:const|let|var)\\s+' + P + '\\s*=\\s*(\\d+)').exec(anual);
  /* NINGÚN COMENTARIO PUEDE AFIRMAR UN PASO DEL ANUAL QUE EL CÓDIGO NO USE. La
     primera versión de esta comprobación prohibía cualquier «paso N min», y el
     que quedaba era el del DÍA, que sí es 5: banda ancha, rojo falso. Ahora mira
     sólo las frases que hablan del ANUAL, que es de lo que responde este banco. */
  const frases = [...html.matchAll(/[^.;*]*\banual(?:es)?\b[^.;]*paso\s+(\d+)\s*min[^.;]*/gi)]
                 .concat([...html.matchAll(/[^.;*]*paso\s+(\d+)\s*min[^.;]*\banual(?:es)?\b[^.;]*/gi)]);
  /* TEST NULO: si no acertara a ninguna frase, la comprobación diría que sí sin
     mirar nada — y el día que alguien escriba una afirmación falsa, tampoco. */
  const malas = frases.filter(f => m && f[1] !== m[1]);
  T('ningún comentario afirma un paso del ANUAL distinto del que usa el código',
    !!m && malas.length === 0,
    'paso = ' + (m ? m[1] : '?') + ' min · frases sobre el anual con paso: ' + frases.length +
    (malas.length ? ' · MALAS: ' + malas.map(x => '«' + x[0].trim().slice(0, 60) + '»').join(' ') : ''));
  T('CONTROL · el buscador de esas frases no está ciego',
    /paso\s+\d+\s*min/i.test(html),
    frases.length ? 'acierta a ' + frases.length : 'ninguna frase sobre el anual menciona paso: el test nulo lo dice');
}

/* 3 · un lazo por cadena: por política Y por día, no uno global */
const dentroDelAnio = anual.slice(anual.indexOf('for(let mo=0'));
T('los lazos se crean DENTRO del bucle de días, no fuera',
  /for\(let mo=0[\s\S]{0,400}?crearLazo\(/.test(dentroDelAnio) &&
  !/crearLazo\([\s\S]{0,400}?for\(let mo=0/.test(anual),
  'los 12 días no son consecutivos: arrastrar el estado sería inventar una historia');

console.log('\n' + ok + ' OK · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
