/* CAREO POR SOMBRA — qué sombra tiene la planta según CÓMO ESTÉ CONFIGURADA.

   Uso:
     node tools/careo_sombra.mjs --planta ayora
     node tools/careo_sombra.mjs --planta ayora --dia 2026-06-21 --paso 5

   POR QUÉ NO BASTA CON EL CAREO DE ENERGÍA. El careo de kWh contesta «cuánto
   se gana». Un cliente pregunta antes otra cosa: «¿mi planta se hace sombra, y
   si se la hace, de quién es la culpa?». Eso no se contesta con un porcentaje
   de energía, se contesta con la sombra HORA A HORA y, sobre todo, separando
   los dos casos que parecen el mismo en una gráfica:

     · SOMBRA EVITABLE — la que desaparece si la TCU lleva configurada la
       pendiente real de su vecina. Es la que justifica la intervención.
     · SOMBRA INEVITABLE — la que queda aunque el seguidor haga todo bien,
       porque ya está contra su TOPE MECÁNICO y no puede girar más. Ningún
       ajuste de configuración la quita: sale del binomio vano/límite de giro,
       o sea del diseño de la planta.

   Prometer «cero sombras» es falso en cualquier planta con topes finitos, y un
   cliente que lo compre y luego mire su SCADA a las 09:00 no vuelve. Lo que sí
   se sostiene es: «a estas horas no hay sombra, a estas otras la hay y es
   inevitable por el tope de ±X°, y esta de aquí en medio es la que le estamos
   quitando».

   LAS CONFIGURACIONES QUE SE CAREAN (misma geometría, mismo sol, mismo
   contador — sólo cambia lo que la TCU CREE que tiene delante):

     A · SIN CONFIGURAR  la MISMA política que corre la TCU, pero con el
                      registro de pendiente a su valor por defecto (0). Es el
                      seguidor recién puesto en marcha.
     B · CONFIGURADA  la misma política con la pendiente MEDIDA hacia cada
                      vecina — lo que escribe `tools/export_config_tcu.mjs` en
                      41098/41100 y 41102/41104. Es la propuesta.
     C · 3D COMPLETO  resuelve la geometría entera. Requiere inteligencia en la
                      NCU: NO se consigue configurando registros. OJO: no es un
                      «techo» de sombra y no hay que venderlo como tal —
                      optimiza ENERGÍA de planta, no sombra mínima, así que
                      puede aceptar algo más de sombra en una fila si con ello
                      gana apuntamiento en las demás.
     D · BT2D DE MANUAL  referencia bibliográfica (un ángulo para toda la
                      planta con el vano medio). NO es el baseline del cliente
                      y no debe usarse como tal.

   ── UN ERROR QUE ESTUVO AQUÍ, Y POR QUÉ SE DEJA ESCRITO ───────────────────
   La primera versión usaba `bt2d` como configuración A, con la etiqueta «la
   TCU cree que el terreno es horizontal». Está MAL: `bt2d` no es «pairwise con
   pendiente 0», es otra política (un solo ángulo con el vano medio de planta,
   sin el mínimo por pareja). Con esa etiqueta, el 21-dic salía que configurar
   el levantamiento EMPEORA la sombra —14,15 % contra 12,88 %—, que es
   justamente lo contrario de la verdad y lo que se le habría contado a un
   cliente. Comparando lo comparable —misma política, registro a cero contra
   registro medido— sale 14,31 % sin configurar contra 14,15 % configurada: la
   configuración mejora, poco pero mejora.

   La diferencia A-vs-B tiene que aislar UNA variable: el contenido del
   registro. Si cambia también la política, el careo mide otra cosa.

   QUÉ NO ES ESTO. No dice qué tiene la planta configurada HOY: eso sale de
   leer los registros en un volcado de diagnóstico, no de aquí. Esto dice qué
   PASARÍA con cada configuración. Para afirmar el estado actual hace falta el
   volcado, y entonces se cruza con `tools/cruce_diagnostico.mjs`.

   PRECONDICIÓN. La planta tiene que pasar `tools/valida_relieve.mjs`. Si el
   levantamiento no describe una planta construible, esta tabla tampoco vale.  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PLANTA = arg('planta', 'ayora');
const DIA = arg('dia', '2026-06-21');
const PASO = Math.max(1, +arg('paso', 5));
const BLOQUE = arg('bloque', null);
const ALB = +arg('albedo', 0.20);
const TL = +arg('linke', 3.5);
const UMBRAL = +arg('umbral', 1.0);        // % de sombra por debajo del cual se considera «sin sombra»

const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8');
const F = new Function(_sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) +
  ';return {solarPos,clearskyIneichen,policyAngles,poaPlant,plantFromCotas,slewLimit};')();

const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, PLANTA + '_layout.json'), 'utf-8'));
const P = F.plantFromCotas(cotas, 500, BLOQUE == null ? null : +BLOQUE);

// Dos plantas IDÉNTICAS salvo por el contenido del registro de pendiente: es
// la única variable que puede cambiar entre A y B, o el careo mide otra cosa.
function planta(conPendiente) {
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: conPendiente ? Math.atan2(P.pairDz[i], dx) * 180 / Math.PI : 0,
                 pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  return { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
           nBypass: 2, iam: 0.05, rowTilt: P.tilt, groups: P.groups, drive: 'bifila',
           segs: P.segs, real: P };
}
const T = planta(true), T0 = planta(false);
// peso de cada línea = cuántos seguidores lleva; si no, una línea de 3 pesaría
// lo mismo que una de 25 y la sombra «media de planta» sería de otra planta
const W = P.segs.map(s => Math.max(1, s.length));
const WT = W.reduce((a, b) => a + b, 0);

const LAT = +lay.clat, LON = +lay.clon, ALT = +cotas.base || 0;
const [Y, M, D] = DIA.split('-').map(Number);
const day0 = Date.UTC(Y, M - 1, D) - 2 * 3600000;      // hora LOCAL UTC+2
const doy = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 1)) / 86400000) + 1;

const CFG = [
  { k: 'plana',   pol: 'pairwise', T: T0, nm: 'A · SIN CONFIGURAR (registro = 0)' },
  { k: 'levanta', pol: 'pairwise', T: T,  nm: 'B · CONFIGURADA (41098/41102)' },
  { k: 'tri',     pol: 'true3d',   T: T,  nm: 'C · 3D COMPLETO (pide NCU)' },
  { k: 'manual',  pol: 'bt2d',     T: T,  nm: 'D · BT2D de manual (referencia)' },
];

const pasos = [];
const prev = {};
for (let mm = 0; mm < 1440; mm += PASO) {
  const g = F.solarPos(day0 + mm * 60000, LAT, LON);
  if (g.elev <= 0) continue;
  const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
  const hh = String(Math.floor(mm / 60)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0');
  const fila = { hh, elev: g.elev, dni: irr.dni, por: {} };
  for (const c of CFG) {
    const Tc = c.T;
    const o = F.policyAngles(c.pol, g.zen, g.az, Tc, irr, doy, ALB).angles;
    const ang = F.slewLimit(prev[c.k] || null, o, PASO * 60);
    prev[c.k] = ang;
    // el CONTADOR usa siempre la geometría REAL (T): la planta tiene la
    // pendiente que tiene, la crea o no la crea su TCU
    const sh = F.poaPlant(g.zen, g.az, T, ang, irr, doy, ALB).shade;
    // sombra media PONDERADA, y de dónde viene la que hay
    // Descomposición EXHAUSTIVA: evitable + inevitable + residual = media.
    // El residual es la sombra de seguidores por debajo del umbral de
    // «sin sombra»: existe, es despreciable una a una, y si no se declarase
    // las dos primeras columnas no sumarían la tercera y la tabla mentiría.
    let med = 0, evit = 0, inev = 0, resto = 0, nSom = 0, peor = 0, iPeor = 0, nTope = 0;
    for (let i = 0; i < W.length; i++) {
      const s = (sh[i] || 0) * 100;
      med += s * W[i];
      if (s > peor) { peor = s; iPeor = i; }
      const enTope = Math.abs(ang[i]) >= Tc.maxAngle - 0.05;
      if (enTope) nTope += W[i];
      if (s <= UMBRAL) { resto += s * W[i]; continue; }
      nSom += W[i];
      // ¿el seguidor está contra su tope? entonces no puede hacer nada más:
      // esa sombra no la quita ninguna configuración, la quita el diseño
      if (enTope) inev += s * W[i]; else evit += s * W[i];
    }
    fila.por[c.k] = { med: med / WT, evit: evit / WT, inev: inev / WT, resto: resto / WT,
                      frac: 100 * nSom / WT, peor, iPeor, tope: 100 * nTope / WT };
  }
  pasos.push(fila);
}

// ── informe ───────────────────────────────────────────────────────────────
const f2 = (v, n = 2) => v.toFixed(n);
console.log('CAREO POR SOMBRA · ' + PLANTA.toUpperCase() + ' · ' + DIA +
  ' (hora local UTC+2) · paso ' + PASO + ' min');
console.log('  ' + P.lineX.length + ' líneas · ' + WT + ' seguidores · vano medio ' +
  f2((P.lineX[P.lineX.length - 1] - P.lineX[0]) / (P.lineX.length - 1)) + ' m · tope ±' +
  T.maxAngle + '° · «sin sombra» = por debajo de ' + UMBRAL + ' %');
console.log('');
console.log('  sombra media de planta, ponderada por nº de seguidores; «peor» = el seguidor');
console.log('  más tapado de la planta en ese instante. evit+inev+resto = media (resto = los');
console.log('  que sombrean por debajo del umbral).');
console.log('');
console.log('           ── A · SIN CONFIGURAR ────  ── B · CONFIGURADA ───────  ── C · 3D ──');
console.log('hora   sol   media  evit  inev  peor   media  evit  inev  peor   media   peor');
for (const f of pasos) {
  if (!(f.hh.endsWith(':00') || f.hh.endsWith(':30'))) continue;
  const a = f.por.plana, b = f.por.levanta, c = f.por.tri;
  console.log(f.hh + ' ' + f2(f.elev, 1).padStart(5) + '°' +
    f2(a.med).padStart(7) + f2(a.evit).padStart(6) + f2(a.inev).padStart(6) + f2(a.peor).padStart(6) + '  ' +
    f2(b.med).padStart(7) + f2(b.evit).padStart(6) + f2(b.inev).padStart(6) + f2(b.peor).padStart(6) + '  ' +
    f2(c.med).padStart(7) + f2(c.peor).padStart(7));
}

console.log('');
console.log('RESUMEN DEL DÍA');
const res = {};
for (const c of CFG) {
  const v = pasos.map(f => f.por[c.k]);
  const medDia = v.reduce((s, o) => s + o.med, 0) / v.length;
  const evitDia = v.reduce((s, o) => s + o.evit, 0) / v.length;
  const inevDia = v.reduce((s, o) => s + o.inev, 0) / v.length;
  const restoDia = v.reduce((s, o) => s + o.resto, 0) / v.length;
  const limpios = v.filter(o => o.peor <= UMBRAL).length;
  // PONDERADA POR IRRADIANCIA: la media temporal da el mismo peso a las 21:30
  // —84 % de sombra— que al mediodía, y a esa hora la DNI es de 1 W/m². Una
  // planta puede tener 6 % de sombra media y perder 0,5 % de energía sin
  // contradicción ninguna, y ésta es la cifra que lo explica.
  let sw = 0, wsum = 0;
  for (let i = 0; i < pasos.length; i++) { const w = pasos[i].dni; sw += v[i].med * w; wsum += w; }
  const medPond = wsum > 0 ? sw / wsum : 0;

  res[c.k] = { medDia, evitDia, inevDia, restoDia, limpios, pond: medPond };
  console.log('  ' + c.nm.padEnd(34) +
    'sombra media ' + f2(medDia).padStart(5) + ' %   ·   ponderada por irradiancia ' +
    f2(medPond) + ' %');
  console.log('  '.padEnd(36) + 'evitable ' + f2(evitDia) + ' + inevitable (tope) ' +
    f2(inevDia) + ' + residual ' + f2(restoDia) + ' = ' + f2(evitDia + inevDia + restoDia));
  console.log('  '.padEnd(36) + 'pasos SIN NINGUNA sombra: ' + limpios + ' de ' + v.length +
    '  (' + f2(100 * limpios / v.length, 1) + ' % del día)');
}
console.log('');
const quita = res.plana.medDia - res.levanta.medDia;
const quitaP = res.plana.pond - res.levanta.pond;
console.log('  LO QUE QUITA CONFIGURAR EL REGISTRO (misma politica, A -> B): ' + f2(quita) + ' puntos');
console.log('  (de ' + f2(res.plana.medDia) + ' % a ' + f2(res.levanta.medDia) + ' %)');
console.log('  ponderado por irradiancia: ' + f2(quitaP) + ' puntos (de ' + f2(res.plana.pond) + ' % a ' + f2(res.levanta.pond) + ' %) — ESTA es la que se ve en los kWh');
console.log('  LO QUE NO SE PUEDE QUITAR con ninguna configuración: ' + f2(res.levanta.inevDia) +
  ' % — el seguidor ya está en su tope de ±' + T.maxAngle + '°');

// la franja limpia, que es la frase que el cliente entiende
const limpios = pasos.filter(f => f.por.levanta.peor <= UMBRAL);
if (limpios.length) {
  console.log('');
  console.log('  VENTANA LIMPIA con la configuración B (ningún seguidor por encima del umbral): ' + limpios[0].hh + ' → ' +
    limpios[limpios.length - 1].hh + ' sin sombra en NINGÚN seguidor de la planta');
  const huecos = [];
  for (let i = 1; i < limpios.length; i++) {
    const ia = pasos.indexOf(limpios[i - 1]), ib = pasos.indexOf(limpios[i]);
    if (ib - ia > 1) huecos.push(pasos[ia + 1].hh + '–' + pasos[ib - 1].hh);
  }
  console.log('  ' + (huecos.length ? 'con interrupciones en ' + huecos.join(', ') : 'sin una sola interrupción'));
}

if (process.argv.includes('--csv')) {
  const out = arg('salida', '/tmp/careo_sombra_' + PLANTA + '_' + DIA + '.csv');
  const L = ['planta,fecha,hora,elev_sol,dni,config,sombra_media_pct,evitable_pct,inevitable_pct,frac_seguidores_pct,peor_pct'];
  for (const f of pasos) for (const c of CFG) {
    const o = f.por[c.k];
    L.push([PLANTA, DIA, f.hh, f2(f.elev, 2), f2(f.dni, 1), c.k,
            f2(o.med, 3), f2(o.evit, 3), f2(o.inev, 3), f2(o.frac, 2), f2(o.peor, 2)].join(','));
  }
  fs.writeFileSync(out, L.join('\n') + '\n');
  console.log('\n  csv → ' + out + '  (' + (L.length - 1) + ' filas)');
}
