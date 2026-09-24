/* LA RUTA ANUAL PASA POR EL LAZO, ES UNA SOLA, Y NINGUNA VISTA SE LA SALTA
 *
 * La cifra de «Estimación anual» es la que sale de la empresa. Hasta v1.70
 * sumaba la consigna que la política PIDE —`policyAngles` y a sumar—, sin banda
 * muerta y sin velocidad de actuador, o sea lo que la planta pediría y no lo que
 * ejecuta. Medido sobre el preset genérico (audit3/F2_anual_lazo.mjs): `astro`
 * se movía +0,0095 % y todas las demás entre −1,7 % y −2,3 %, con lo que la
 * página afirmaba que el backtracking gana +2,638 % sobre el astronómico puro
 * cuando con el lazo gana +0,255 %.
 *
 * REFUNDACIÓN · PASO 2 (v1.82). Este banco cortaba su fuente en el `onclick` del
 * botón del año y por eso NO VEÍA `grAnualGen`, que publicaba otra cifra: sin
 * lazo y con nubes (sexto caso del registro del patrón). Ahora hay UNA ruta,
 * `function* anualGen`, y el banco la cubre a ella y a TODOS sus consumidores:
 *   · la ruta: lazo por día y por política, paso único y coherente, cielo claro,
 *     rama por mesa con mesas;
 *   · el botón del año y el informe gráfico: CONSUMEN la ruta, no calculan;
 *   · `tools/anual_motor.mjs`, la otra cifra anual (otro motor, a 1 min): con
 *     su lazo real encendido;
 *   · CONDUCTA: con la página cortada tal cual (audit5/lib_anual_pagina.mjs),
 *     el botón y el informe dan el MISMO total, bit a bit.
 * CONTROL NEGATIVO, ruta por ruta: se desarma el lazo (o se hace calcular a un
 * consumidor por su cuenta) en CADA ruta por separado, y el banco tiene que
 * ponerse rojo en cada caso.
 *
 *     node tools/test_anual_lazo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HTML = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const MOTOR = fs.readFileSync(path.join(ROOT, 'tools', 'anual_motor.mjs'), 'utf-8');
let ok = 0, fail = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n + (d ? '   ' + d : '')); }
                         else { fail++; console.log('  ✗ ' + n + (d ? '   ' + d : '')); } };

/* el cuerpo exacto de una función, contando llaves */
function cuerpo(src, cab) {
  const i = src.indexOf(cab); if (i < 0) return '';
  let n = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') n++; else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return '';
}

/* TODAS las comprobaciones de fuente, como lista de fallos: [] = verde */
function revisa(html, motor) {
  const mal = [];
  const no = (c, n) => { if (!c) mal.push(n); };
  const ruta = cuerpo(html, 'function* anualGen(');
  // TEST NULO del corte, antes de lo que protege
  no(ruta.length > 800 && /for\(let mo=0;mo<12;mo\+\+\)/.test(ruta), 'el corte de la ruta anual está vacío o no es la ruta');
  // 1 · pasa por el lazo, y lo que se suma es la SALIDA del lazo
  no(/crearLazo(Seg)?\(\)/.test(ruta), 'la ruta no crea lazos');
  const paso = /(?:const|let)\s+lim\s*=\s*LZ\[P\.key\]\.paso\(\s*a\s*,/.test(ruta);
  no(paso, 'lo que se suma no sale del lazo (`lim = LZ[…].paso(a, …)`)');
  no(/(?:const|let)\s+a\s*=\s*(?:segA\s*\?\s*segCmd\([^;]*:\s*)?policyAngles\(/.test(ruta), 'lo que entra en el lazo no es el mando de la política');
  no(/poaPlant(?:Seg)?\(g\.zen,g\.az,T,lim,/.test(ruta) && !/poaPlant(?:Seg)?\(g\.zen,g\.az,T,a,/.test(ruta), 'lo que entra en la POA no es la salida del lazo');
  // 2 · el paso: una constante con nombre, el mismo en el bucle, la ponderación y el lazo
  const pasos = [...ruta.matchAll(/m\+=\s*([A-Za-z_$][\w$]*|\d+)/g)].map(m => m[1]);
  no(pasos.length === 1 && !/^\d+$/.test(pasos[0]), 'el paso del bucle no es UNA constante con nombre');
  if (pasos.length === 1) {
    const P = pasos[0];
    no(new RegExp('\\(\\s*' + P + '\\s*/\\s*60\\s*\\)').test(ruta), 'la ponderación no usa el paso del bucle');
    no(new RegExp('\\.paso\\([^,]+,\\s*' + P + '\\s*\\*\\s*60\\s*\\)').test(ruta), 'el lazo no recibe el paso del bucle en segundos');
  }
  // 3 · un lazo por política Y por día
  const dentro = ruta.slice(ruta.indexOf('for(let mo=0'));
  no(/for\(let mo=0[\s\S]{0,500}?crearLazo(Seg)?\(/.test(dentro) && !/crearLazo(Seg)?\([\s\S]{0,500}?for\(let mo=0/.test(ruta), 'los lazos no se crean DENTRO del bucle de días');
  // 4 · cielo CLARO: lo que el deslizador de nubes declara del anual
  no(/clearskyIneichen\(/.test(ruta) && !/skyWithClouds\(|cloudCC\(/.test(ruta), 'la ruta anual no es de cielo claro');
  // 5 · rama por mesa con mesas (paso 1)
  no(/(?:const|let)\s+segA\s*=\s*segOn\(T\)/.test(ruta) && /segA\s*\?\s*segCmd\(/.test(ruta) && /segA\s*\?\s*poaPlantSeg\(/.test(ruta)
     && /segA\s*\?\s*crearLazoSeg\(\)/.test(ruta), 'con mesas la ruta no usa segCmd → crearLazoSeg → poaPlantSeg');
  // 6 · los CONSUMIDORES consumen, no calculan
  const i0 = html.indexOf("$('yearbtn').onclick"), i1 = html.indexOf("const ref=tot['pairwise']");
  const boton = (i0 >= 0 && i1 > i0) ? html.slice(i0, i1) : '';
  no(boton.length > 50, 'el corte del botón del año está vacío');
  no(/anualGen\(/.test(boton) && !/policyAngles\(|poaPlant(?:Seg)?\(|clearskyIneichen\(|crearLazo/.test(boton), 'el botón del año calcula por su cuenta en vez de consumir la ruta');
  const gr = cuerpo(html, 'function* grAnualGen(');
  no(gr.length > 50, 'el corte de grAnualGen está vacío');
  no(/yield\*\s*anualGen\(/.test(gr) && !/policyAngles\(|poaPlant(?:Seg)?\(|clearskyIneichen\(|skyWithClouds\(/.test(gr), 'el informe (grAnualGen) calcula por su cuenta en vez de consumir la ruta');
  // 7 · la otra cifra anual, tools/anual_motor.mjs: con su lazo REAL encendido
  no(/c\.ctrl\s*=\s*\{\s*on:\s*true\b/.test(motor), 'tools/anual_motor.mjs no enciende el lazo real');
  return mal;
}

console.log('la ruta anual: una, con lazo, y todas las vistas la consumen');
const mal = revisa(HTML, MOTOR);
T('FUENTE · la página y anual_motor cumplen todas las comprobaciones', mal.length === 0, mal.join(' · '));

/* CONTROL NEGATIVO ruta por ruta: cada mutante tiene que ponerlo ROJO */
const mut = [
  ['el lazo DESARMADO en la ruta única', HTML.replace(/(const lim=)LZ\[P\.key\]\.paso\(a,PASO_ANUAL_MIN\*60\);/, '$1a;')],
  ['el BOTÓN calcula por su cuenta, sin lazo', HTML.replace(/const tot=drenaGen\(anualGen\([^;]*\)\)\.tot;/,
    "const tot={};for(const P of POLICIES)if(P.on){tot[P.key]=poaPlant(0,0,T,policyAngles(P.key,0,0,Tcfg,clearskyIneichen(0,1,0,3),1,0.2).angles,{},1,0.2).plant;}")],
  ['el INFORME calcula por su cuenta, sin lazo y con nubes', HTML.replace(/const r=yield\* anualGen\([^;]*\);/,
    "const r={mes:{},tot:{}};for(const P of POLS){const irr=skyWithClouds(clearskyIneichen(0,1,0,3),cloudCC(),0);r.tot[P.key]=poaPlant(0,0,DAY.T,policyAngles(P.key,0,0,DAY.Tcfg,irr,1,0.2).angles,irr,1,0.2).plant;}yield 1;")],
  ['nubes DENTRO de la ruta única', HTML.replace(/const irr=clearskyIneichen\(g\.zen,doy,c\.alt,c\.tl\);/, 'const irr=skyWithClouds(clearskyIneichen(g.zen,doy,c.alt,c.tl),cloudCC(),g.zen);')],
];
for (const [nombre, h] of mut) {
  if (h === HTML) { T('CONTROL · ' + nombre + ': el mutante no se pudo construir', false); continue; }
  const m = revisa(h, MOTOR);
  T('CONTROL · ' + nombre + ' → el banco se pone ROJO', m.length > 0, m.length ? m.join(' · ') : 'NO LO VE');
}
{
  const hm = MOTOR.replace(/c\.ctrl\s*=\s*\{\s*on:\s*true/, 'c.ctrl = { on: false');
  const m = hm === MOTOR ? [] : revisa(HTML, hm);
  T('CONTROL · el lazo DESARMADO en tools/anual_motor.mjs → el banco se pone ROJO', m.length > 0, m.length ? m.join(' · ') : 'NO LO VE');
}

/* NINGÚN COMENTARIO afirma un paso del ANUAL que el código no use */
{
  const ruta = cuerpo(HTML, 'function* anualGen(');
  const m = /(?:const|let)\s+PASO_ANUAL_MIN\s*=\s*(\d+)/.exec(ruta);
  const frases = [...HTML.matchAll(/[^.;*]*\banual(?:es)?\b[^.;]*paso\s+(\d+)\s*min[^.;]*/gi)]
                 .concat([...HTML.matchAll(/[^.;*]*paso\s+(\d+)\s*min[^.;]*\banual(?:es)?\b[^.;]*/gi)]);
  const malas = frases.filter(f => m && f[1] !== m[1]);
  T('ningún comentario afirma un paso del ANUAL distinto del que usa el código', !!m && malas.length === 0,
    'paso = ' + (m ? m[1] : '?') + ' min · frases sobre el anual con paso: ' + frases.length +
    (malas.length ? ' · MALAS: ' + malas.map(x => '«' + x[0].trim().slice(0, 60) + '»').join(' ') : ''));
  T('CONTROL · el buscador de esas frases no está ciego', /paso\s+\d+\s*min/i.test(HTML), 'acierta a ' + frases.length);
}

/* CONDUCTA: la página cortada tal cual; el botón y el informe, el MISMO total */
{
  const { rutasAnuales } = await import('../audit5/lib_anual_pagina.mjs');
  const n = 4, pitch = 6, z = [...Array(n)].map((_, i) => -i * pitch * Math.tan(4 * Math.PI / 180));
  const pairs = []; for (let i = 0; i < n - 1; i++) pairs.push({ slope: Math.atan2(z[i] - z[i + 1], pitch) * 180 / Math.PI, pitch, axisTilt: 0 });
  const Tp = { pairs, cw: 2.382, axisAz: 0, maxAngle: 55, gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: new Array(n).fill(0), groups: null, drive: 'mono' };
  const c = { lat: 41.5763, lon: -0.7981, tz: 2, alt: 300, tl: 3.5, albedo: 0.2, date: '2026-06-21' };
  const P = [{ key: 'astro', on: true }, { key: 'pairwise', on: true }];
  const F = rutasAnuales(ROOT, HTML).F;
  const b = F.boton(c, Tp, Tp, P), i = F.informe({ c, T: Tp, Tcfg: Tp }, P, () => false, () => 0.6).tot;
  T('CONDUCTA · el botón y el informe dan el MISMO anual, bit a bit (4 filas, astro y pairwise; el deslizador de nubes a 0,6 no entra)',
    b.astro === i.astro && b.pairwise === i.pairwise, `pairwise ${b.pairwise.toFixed(4)} / ${i.pairwise.toFixed(4)} kWh/m²`);
  const Fsin = rutasAnuales(ROOT, mut[0][1]).F;
  const bs = Fsin.boton(c, Tp, Tp, P);
  T('CONTROL · con el lazo desarmado, el anual CAMBIA (la conducta de arriba mira)', bs.pairwise !== b.pairwise,
    `pairwise con lazo ${b.pairwise.toFixed(4)} · sin lazo ${bs.pairwise.toFixed(4)}`);
}

console.log('\n' + ok + ' OK · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
