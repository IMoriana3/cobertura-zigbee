/* CONTROL DE ENTRADA DEL RELIEVE — la puerta que decide si una planta se puede
   evaluar, ANTES de dar un número.

   Uso:
     node tools/valida_relieve.mjs --planta ayora
     node tools/valida_relieve.mjs --planta sanjose --bloque 0
   Sale con código 1 si el veredicto es NO EVALUABLE (sirve de gate en CI).

   POR QUÉ EXISTE. El careo de backtracking 3D contra 2D compara dos formas de
   apuntar sobre LA MISMA geometría. Si la geometría está mal, la comparación
   sigue saliendo — con un número perfectamente formateado y perfectamente
   falso. San José es el caso que obligó a escribir esto: su bloque 0 daba
   −0,08 % de «ganancia» sobre una geometría que contiene tres líneas hundidas
   4,8 m, 12,2 m y 12,5 m respecto a SUS DOS VECINAS a la vez. Una fila de
   seguidores en un pozo de 12 m de hondo y 6 m de ancho no existe: es un error
   de cota. El modelo la estaba tratando como terreno y calculando un
   backtracking imposible.

   La regla de la casa es que el simulador diga «no lo decido» cuando no lo
   sabe. Este fichero es esa regla aplicada a la entrada.

   QUÉ ES Y QUÉ NO ES UNA PENDIENTE IMPOSIBLE (esto se afinó a base de
   equivocarse, y conviene dejarlo escrito):

     · La inclinación del EJE, N-S, es la de MONTAJE, y esa sí la limita el
       fabricante (típicamente 10-20 %). Se comprueba aparte. En Ayora el
       máximo es 3,6° y en San José 2,7°: el montaje está sano en las dos.

     · El desnivel entre LÍNEAS CONTIGUAS no es una pendiente de montaje: es
       la geometría que el backtracking necesita conocer. Un bancal produce
       legítimamente un salto grande — en San José las líneas 7 y 36 bajan 2 m
       y SE QUEDAN ABAJO, y eso es terreno real, no un fallo. Rechazar por el
       valor del salto sería rechazar precisamente las plantas donde corregir
       el relieve más vale la pena. Aquí solo se INFORMA.

     · Lo que sí es imposible es una línea que se separa de sus DOS vecinas a
       la vez: baja y vuelve a subir. Eso no es ladera ni bancal — o es una
       vaguada que el as-built tiene que declarar, o es un error de cota en esa
       línea. Es el control que de verdad decide.

   LOS CONTROLES Y DE DÓNDE SALE CADA UMBRAL:

   1) COBERTURA del levantamiento. Sin cota no hay pareja, y una pareja que
      falta no es una pareja plana: es un hueco que desplaza a su vecina.
      Reserva por debajo del 95 %.

   2) INCLINACIÓN DEL EJE (montaje). Reserva por encima de 8,5° (15 %),
      RECHAZO por encima de 11,3° (20 %): por ahí anda el límite de los
      seguidores de eje horizontal del mercado, y por encima el as-built tiene
      que decir qué seguidor es.

   3) VANO por pareja, contra el `pitch` declarado. La separación entre líneas
      es una constante de replanteo, no del terreno. Un «vano» de 12,7 m en
      una planta de 6,20 m no es una fila más separada: entre esas dos líneas
      hay un pasillo, un vial o un bloque distinto que el partidor por huecos
      (> 2,5·pitch) no llegó a partir. Reserva fuera de [0,75 · 1,25]·pitch;
      RECHAZO por encima de 1,5·pitch.

   4) LÍNEA AISLADA EN COTA — el control que decide. Una línea separada de sus
      dos vecinas a la vez, en el mismo sentido, por más de medio vano
      (≈3,1 m con pitch 6,20) no cabe físicamente entre ellas: la cuerda del
      seguidor son 2,38 m. RECHAZO. Entre 1,0 m y medio vano, reserva: puede
      ser una vaguada real, pero hay que confirmarla.

   5) SOLAPE NORTE. Δz se mide en el tramo de norte que las dos líneas
      comparten (si no comparten, no se dan sombra y Δz=0 por diseño). Una
      pareja sin solape es legítima, pero si son muchas el bloque describe
      filas que no se ven entre sí, y la ganancia de corregir el relieve tiende
      a cero por construcción y no por el terreno. Se informa.

   QUÉ NO HACE. No arregla nada ni «limpia» el levantamiento: eso sería
   inventar cotas. Señala la línea, con su x, para que se resuelva donde se
   puede resolver — en el as-built o en campo.                                */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PLANTA = arg('planta', 'ayora');
const BLOQUE = arg('bloque', null);
const MAXL = +arg('maxlineas', 500);

// umbrales (ver cabecera)
const COBERTURA_MIN = 0.95;
const EJE_AVISO = 8.5, EJE_RECHAZO = 11.3;
const VANO_AVISO = [0.75, 1.25], VANO_RECHAZO = 1.5;
const AISLADA_AVISO = 1.0;          // m
const AISLADA_RECHAZO_VANOS = 0.5;  // × pitch
const PEND_INFO = 8.5;              // solo se informa

// ── física del simulador, sin duplicarla ──────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
if (i0 < 0 || i1 < 0) { console.error('no encuentro el bloque de física en backtracking.html'); process.exit(2); }
const F = new Function(html.slice(html.lastIndexOf('/*', i0), i1) + ';return {plantFromCotas};')();

const fCotas = path.join(ROOT, PLANTA + '_cotas.json');
if (!fs.existsSync(fCotas)) { console.error('falta ' + path.basename(fCotas)); process.exit(2); }
const cotas = JSON.parse(fs.readFileSync(fCotas, 'utf-8'));
const P = F.plantFromCotas(cotas, MAXL, BLOQUE == null ? null : +BLOQUE);

const pitchDecl = cotas.pitch || 6;
const nTrk = cotas.n_trk || (cotas.t || []).length;
const nCon = cotas.n_con != null ? cotas.n_con : nTrk;
const nInc = cotas.n_inc || 0;
const cobertura = nTrk ? nCon / nTrk : 0;

const med = a => a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))] : NaN;

// ── parejas ───────────────────────────────────────────────────────────────
const pares = [];
for (let i = 0; i < P.lineX.length - 1; i++) {
  const vano = P.lineX[i + 1] - P.lineX[i];
  const dz = P.pairDz[i];
  pares.push({ i, vano, dz, pend: Math.atan2(dz, Math.max(0.5, vano)) * 180 / Math.PI });
}
const vanos = pares.map(p => p.vano).sort((a, b) => a - b);
const absPend = pares.map(p => Math.abs(p.pend)).sort((a, b) => a - b);
const absEje = P.tilt.map(Math.abs).sort((a, b) => a - b);

const hallazgos = [];
const add = (nivel, control, texto, detalle) => hallazgos.push({ nivel, control, texto, detalle: detalle || [] });

// 1) cobertura
if (cobertura < COBERTURA_MIN)
  add('reserva', 'cobertura',
    'solo ' + (100 * cobertura).toFixed(1) + ' % de los seguidores traen cota medida (' +
    nCon + ' de ' + nTrk + ')' + (nInc ? '; ' + nInc + ' con cota incompleta' : ''));

// 2) inclinación del eje (montaje)
const ejeMalo = P.tilt.filter(t => Math.abs(t) > EJE_RECHAZO).length;
const ejeRaro = P.tilt.filter(t => Math.abs(t) > EJE_AVISO && Math.abs(t) <= EJE_RECHAZO).length;
if (ejeMalo)
  add('rechazo', 'eje',
    ejeMalo + ' línea(s) con eje inclinado más de ' + EJE_RECHAZO + '° (20 %): por encima de lo que ' +
    'monta un seguidor de eje horizontal estándar — el as-built tiene que decir qué seguidor es');
else if (ejeRaro)
  add('reserva', 'eje',
    ejeRaro + ' línea(s) con eje entre ' + EJE_AVISO + '° y ' + EJE_RECHAZO + '°: confirmar con fabricante');

// 3) vano
const vanoMalo = pares.filter(p => p.vano > VANO_RECHAZO * pitchDecl);
const vanoRaro = pares.filter(p => p.vano <= VANO_RECHAZO * pitchDecl &&
  (p.vano < VANO_AVISO[0] * pitchDecl || p.vano > VANO_AVISO[1] * pitchDecl));
if (vanoMalo.length)
  add('rechazo', 'vano',
    vanoMalo.length + ' pareja(s) con vano > ' + (VANO_RECHAZO * pitchDecl).toFixed(2) +
    ' m (' + VANO_RECHAZO + '·pitch): entre esas líneas hay un hueco, no una fila vecina', vanoMalo);
if (vanoRaro.length)
  add('reserva', 'vano',
    vanoRaro.length + ' pareja(s) con vano fuera de [' + (VANO_AVISO[0] * pitchDecl).toFixed(2) +
    ', ' + (VANO_AVISO[1] * pitchDecl).toFixed(2) + '] m', vanoRaro);

// 4) LÍNEA AISLADA EN COTA — el que decide
const umbralRech = AISLADA_RECHAZO_VANOS * pitchDecl;
const aisladas = [];
for (let j = 1; j < P.lineX.length - 1; j++) {
  const a = P.pairDz[j - 1], b = P.pairDz[j];   // a = z[j]-z[j-1], b = z[j+1]-z[j]
  if (Math.sign(a) === Math.sign(b)) continue;  // ladera o bancal continuo: no es aislada
  const sep = Math.min(Math.abs(a), Math.abs(b));
  if (sep < AISLADA_AVISO) continue;
  aisladas.push({ j, x: P.lineX[j], dzPrev: a, dzNext: b, sep, sentido: a < 0 ? 'hundida' : 'elevada' });
}
const aisMalas = aisladas.filter(o => o.sep > umbralRech);
const aisRaras = aisladas.filter(o => o.sep <= umbralRech);
if (aisMalas.length)
  add('rechazo', 'línea aislada',
    aisMalas.length + ' línea(s) separada(s) de SUS DOS vecinas a la vez más de ' + umbralRech.toFixed(2) +
    ' m (medio vano): no cabe físicamente entre ellas — la cuerda del seguidor son ' +
    P.cw.toFixed(2) + ' m. Es un error de cota, no terreno',
    aisMalas.map(o => ({ aislada: o })));
if (aisRaras.length)
  add('reserva', 'línea aislada',
    aisRaras.length + ' línea(s) separada(s) de sus dos vecinas entre ' + AISLADA_AVISO.toFixed(1) +
    ' m y ' + umbralRech.toFixed(2) + ' m: puede ser vaguada real, confirmar en as-built',
    aisRaras.map(o => ({ aislada: o })));

// 5) solape
const sinSolape = pares.filter(p => Math.abs(p.dz) < 1e-12).length;
if (sinSolape > pares.length * 0.10)
  add('reserva', 'solape',
    sinSolape + ' de ' + pares.length + ' parejas no comparten tramo de norte: esas líneas no se ' +
    'dan sombra y la ganancia sale diluida por geometría, no por el terreno');

// ── veredicto ─────────────────────────────────────────────────────────────
const rechazos = hallazgos.filter(h => h.nivel === 'rechazo');
const reservas = hallazgos.filter(h => h.nivel === 'reserva');
const veredicto = rechazos.length ? 'NO EVALUABLE' : reservas.length ? 'APTA CON RESERVAS' : 'APTA';

const L = [];
L.push('CONTROL DE ENTRADA DEL RELIEVE · ' + PLANTA.toUpperCase() +
  (BLOQUE == null ? ' · bloque mayor' : ' · bloque ' + BLOQUE));
L.push('');
L.push('  levantamiento    ' + nCon + '/' + nTrk + ' seguidores con cota (' +
  (100 * cobertura).toFixed(1) + ' %)' + (nInc ? ' · ' + nInc + ' incompletos' : ''));
L.push('  bloque cargado   ' + P.lineX.length + ' líneas · ' + P.nFilas + ' filas · ' +
  pares.length + ' parejas · cuerda ' + P.cw.toFixed(2) + ' m');
L.push('  vano             declarado ' + pitchDecl.toFixed(2) + ' m · medido mín ' +
  vanos[0].toFixed(2) + ' / mediana ' + med(vanos).toFixed(2) + ' / máx ' +
  vanos[vanos.length - 1].toFixed(2) + ' m');
L.push('  eje (montaje)    mediana ' + med(absEje).toFixed(2) + '° · p95 ' +
  pct(absEje, 0.95).toFixed(2) + '° · máx ' + absEje[absEje.length - 1].toFixed(2) + '°');
L.push('  desnivel entre líneas contiguas (informativo — un bancal lo produce legítimamente):');
L.push('                   mediana ' + med(absPend).toFixed(2) + '° · p95 ' +
  pct(absPend, 0.95).toFixed(2) + '° · máx ' + absPend[absPend.length - 1].toFixed(2) + '° · ' +
  pares.filter(p => Math.abs(p.pend) > PEND_INFO).length + ' pareja(s) por encima de ' + PEND_INFO + '°');
L.push('');
if (!hallazgos.length) L.push('  sin hallazgos.');
for (const h of hallazgos) {
  L.push('  [' + (h.nivel === 'rechazo' ? 'RECHAZO' : 'reserva') + '] ' + h.control + ' — ' + h.texto);
  for (const p of h.detalle.slice(0, 6)) {
    if (p.aislada) {
      const o = p.aislada;
      L.push('        línea ' + o.j + ' (x=' + o.x.toFixed(1) + ' m): ' + o.sentido + ' ' +
        Math.abs(o.dzPrev).toFixed(2) + ' m respecto a la ' + (o.j - 1) + ' y ' +
        Math.abs(o.dzNext).toFixed(2) + ' m respecto a la ' + (o.j + 1));
    } else {
      L.push('        pareja ' + p.i + '→' + (p.i + 1) + ': vano ' + p.vano.toFixed(2) +
        ' m · Δz ' + p.dz.toFixed(2) + ' m · ' + p.pend.toFixed(2) + '°');
    }
  }
  if (h.detalle.length > 6) L.push('        … y ' + (h.detalle.length - 6) + ' más');
}
L.push('');
L.push('  VEREDICTO: ' + veredicto);
if (veredicto === 'NO EVALUABLE') {
  L.push('  No se emite ganancia de backtracking 3D para este bloque hasta resolver los');
  L.push('  RECHAZO en el as-built o en campo. Un número calculado sobre esta geometría');
  L.push('  no describiría la planta construida.');
}
console.log(L.join('\n'));

if (process.argv.includes('--json'))
  fs.writeFileSync(arg('json-salida', '/tmp/valida_' + PLANTA + '.json'),
    JSON.stringify({ planta: PLANTA, bloque: BLOQUE, veredicto, cobertura, pitchDecl,
      lineas: P.lineX.length, parejas: pares.length, hallazgos }, null, 1));

process.exit(rechazos.length ? 1 : 0);
