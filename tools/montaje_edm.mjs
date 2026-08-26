/* EL MONTAJE, CON LOS NOMBRES QUE USA TODO EL MUNDO. Cada layout describe su geometría a su
   manera —`geometria`, `mesa`, `fijas`, `rot` por seguidor— y las constantes que de verdad hacen
   falta para calcular (GCR, ángulo máximo, azimut del eje) viven TECLEADAS en tres fichas. Este
   script escribe en cada `<planta>_layout.json` un bloque `montaje` con los nombres de pvlib, que
   son los mismos que usa EnergyDataModel de Rebase: así una planta nuestra se lee sin traducir.

       node tools/montaje_edm.mjs                 informe, no escribe
       node tools/montaje_edm.mjs --write         lo escribe en los layouts

   REGLA DE LA CASA: cada campo va con su PROCEDENCIA, y no se inventa ninguno.

       medido    sale de una medida sobre el DWG o de la plantilla del fabricante
       derivado  se calcula de otros valores medidos, y se dice de cuáles
       canon     es la constante canónica del proyecto, la misma en el JS y en el core
                 (solargpt_core/tracker.py: CANONICAL_GCR, CANONICAL_MAX_ANGLE_DEG…)
       null      no se sabe, y se dice por qué. Un hueco declarado vale más que un número
                 inventado: quien lo lea sabe que tiene que ir a buscarlo.

   Los seguidores llevan `SingleAxisTrackerMount` y las plantas de estructura fija `FixedMount`,
   que son las dos clases que distingue pvlib (y EDM).                                            */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');

/* Canon del proyecto. NO son valores de planta: son los que el JS y el core comparten y usan por
   defecto cuando nadie dice otra cosa. Por eso salen marcados como `canon` y no como medidos. */
/* max_angle: 55 en TODAS las plantas, dicho por la casa el 2026-08-21. No es una suposicion ni un
   valor por defecto: es el recorrido mecanico del hierro, igual en toda la flota. Lo unico MEDIDO
   -la plantilla TCU de El Burgo, west_sw_limit 55 / east_sw_limit -55- lo confirma. */
const CANON = { gcr: 0.397, max_angle: 55, axis_azimuth: 0, axis_tilt: 0, night_stow_deg: 5 };

/* La cuerda de la mesa: lo que tapa de ancho, perpendicular al tubo. En 1V es el lado largo del
   módulo; en 2V son dos; en 3V, tres. El número de módulos en vertical sale del NOMBRE del bloque
   del DWG (INT_1V14, 2V14, «Generic 3V»…), que es un dato del plano, no una suposición. */
function vDelBloque(L) {
  const nombres = [];
  if (L.mesa && L.mesa.tipos) nombres.push(...Object.keys(L.mesa.tipos));
  if (L.fija && L.fija.tipo) nombres.push(L.fija.tipo);
  for (const n of nombres) { const m = /(\d)\s*V/i.exec(n); if (m) return +m[1]; }
  return null;
}

function montajeDe(nombre, L) {
  const T = L.trackers || L.seguidores || [];
  const org = {};                                   // procedencia campo a campo
  const mesa = L.mesa || {};
  const g = L.geometria || {};

  /* — paso entre filas — */
  let pitch = null;
  if (typeof g.pasoEntreFilas === 'number') { pitch = g.pasoEntreFilas; org.pitch = 'medido · geometria.pasoEntreFilas'; }
  else if (typeof mesa.pasoFila === 'number') { pitch = mesa.pasoFila; org.pitch = 'medido · mesa.pasoFila'; }
  else if (L.fija && typeof L.fija.pitch === 'number') { pitch = L.fija.pitch; org.pitch = 'medido · fija.pitch'; }
  else org.pitch = null;

  /* — cuerda — */
  const v = vDelBloque(L);
  const esFija = !!L.fija;
  let cuerda = null;
  const modH = mesa.modH != null ? mesa.modH : null;
  /* En las FIJAS `mesa.modH` ya es el fondo de la mesa ENTERA, no el módulo: multiplicarlo por la
     V daba un GCR de 2,47 en Dicayagua, que es imposible. En los seguidores sí es el módulo. */
  if (esFija && modH != null) { cuerda = modH; org.cuerda = `medido · mesa.modH ${modH}, que en una mesa fija ya es el fondo entero`; }
  else if (modH != null && v != null) { cuerda = +(modH * v).toFixed(4); org.cuerda = `derivado · mesa.modH ${modH} × ${v}V del nombre del bloque`; }
  else if (modH != null) { cuerda = modH; org.cuerda = `derivado · mesa.modH ${modH}, suponiendo 1V (el bloque no dice la V)`; }
  else {
    /* Sin bloque `mesa`, la plantilla del fabricante sirve: trae panelWidth medido en campo. */
    try {
      const tcu = JSON.parse(readFileSync(RAIZ + nombre + '_tcu.json', 'utf8'));
      const pw = tcu.constantes && +tcu.constantes.panelWidth;
      if (pw > 0) { cuerda = +pw.toFixed(4); org.cuerda = `medido · panelWidth de ${tcu.fuente}`; }
    } catch (e) { }
    if (cuerda == null) org.cuerda = 'null · esta planta no trae bloque `mesa` ni plantilla del fabricante';
  }

  /* — GCR — */
  let gcr = null;
  if (cuerda != null && pitch) { gcr = +(cuerda / pitch).toFixed(4); org.gcr = `derivado · cuerda ${cuerda} / paso ${pitch}`; }
  else { gcr = CANON.gcr; org.gcr = 'canon · CANONICAL_GCR del proyecto, no medido en esta planta'; }

  /* — azimut del eje. `rot` es el rumbo del seguidor en el layout; la convención de pvlib para el
       eje N-S es 0. Solo se declara distinto cuando el DWG lo midió distinto. — */
  const rots = [...new Set(T.map(t => +t.rot || 0))];
  let axis_azimuth = CANON.axis_azimuth;
  if (rots.length === 1 && Math.abs(rots[0]) > 0.05) { axis_azimuth = rots[0]; org.axis_azimuth = `medido · rot de los ${T.length} seguidores`; }
  else if (rots.length > 1) { axis_azimuth = null; org.axis_azimuth = `null · la planta tiene ${rots.length} rumbos distintos, va por seguidor en trackers[].rot`; }
  else org.axis_azimuth = 'canon · eje N-S (0), que es lo que mide el DWG';

  if (esFija) {
    const incl = [...new Set((L.fijas || []).map(f => f.inclinacion))];
    const azs = [...new Set((L.fijas || []).map(f => f.azimut))];
    return {
      montaje: {
        tipo: 'FixedMount',
        surface_tilt: incl.length === 1 ? incl[0] : (L.fija.tilt != null ? L.fija.tilt : null),
        surface_azimuth: azs.length === 1 ? azs[0] : null,
        gcr, pitch, cuerda,
        modulos_en_vertical: v,
      },
      montaje_origen: Object.assign(org, {
        tipo: 'del layout · L.fija',
        surface_tilt: incl.length === 1 ? `medido · las ${(L.fijas || []).length} mesas del DWG dan ${incl[0]}°` : 'null · hay varias inclinaciones',
        surface_azimuth: azs.length === 1 ? `medido · las ${(L.fijas || []).length} mesas del DWG dan ${azs[0]}°` : 'null · hay varios azimuts',
        modulos_en_vertical: v != null ? `medido · del nombre del bloque del DWG` : null,
      }),
    };
  }

  return {
    montaje: {
      tipo: 'SingleAxisTrackerMount',
      axis_tilt: CANON.axis_tilt,
      axis_azimuth,
      max_angle: nombre === 'elburgo' ? 55 : CANON.max_angle,
      backtrack: true,
      gcr,
      cross_axis_tilt: 0,
      module_height: null,
      night_stow_deg: CANON.night_stow_deg,
      pitch, cuerda,
      modulos_en_vertical: v,
    },
    montaje_origen: Object.assign(org, {
      tipo: 'del layout · la planta es de seguidores',
      axis_tilt: 'canon · el eje se genera horizontal; el terreno se aplica aparte (bt3d)',
      max_angle: nombre === 'elburgo'
        ? 'medido · plantilla del fabricante TCU_Template_V1.4: west_sw_limit 55 / east_sw_limit -55'
        : 'declarado por la casa · 55° en TODAS las plantas (2026-08-21). Coincide con el '
          + 'CANONICAL_MAX_ANGLE_DEG del core y con lo unico medido, la plantilla TCU de El Burgo',
      backtrack: 'canon · CANONICAL_BACKTRACK, y es lo que ejecutan las fichas',
      cross_axis_tilt: 'canon · 0, que es lo que pasa el JS a singleaxis',
      module_height: 'null · no se ha medido la altura del tubo en ninguna planta',
      night_stow_deg: 'canon · 5° al este, dato de proyecto',
      modulos_en_vertical: v != null ? 'medido · del nombre del bloque del DWG' : 'null · el bloque no dice la V',
    }),
  };
}

const ficheros = readdirSync(RAIZ).filter(f => /_layout\.json$/.test(f)).sort();
console.log('planta        tipo                    tilt/az   máx  GCR     paso  cuerda  V   procedencia del GCR');
let escritos = 0;
for (const f of ficheros) {
  const nombre = f.replace('_layout.json', '');
  const L = JSON.parse(readFileSync(RAIZ + f, 'utf8'));
  const { montaje, montaje_origen } = montajeDe(nombre, L);
  const m = montaje;
  const ang = m.tipo === 'FixedMount' ? `${m.surface_tilt ?? '—'}/${m.surface_azimuth ?? '—'}` : `${m.axis_tilt}/${m.axis_azimuth ?? 'x seg'}`;
  console.log(
    nombre.padEnd(13) + m.tipo.padEnd(23) +
    String(ang).padStart(8) + String(m.max_angle ?? '—').padStart(6) +
    String(m.gcr ?? '—').padStart(8) + String(m.pitch ?? '—').padStart(6) +
    String(m.cuerda ?? '—').padStart(8) + String(m.modulos_en_vertical ?? '—').padStart(4) +
    '   ' + (montaje_origen.gcr || '').slice(0, 44));
  if (WRITE) { L.montaje = montaje; L.montaje_origen = montaje_origen; writeFileSync(RAIZ + f, JSON.stringify(L)); escritos++; }
}
console.log(WRITE ? `\n${escritos} layouts escritos` : '\n(informe: nada escrito. Con --write se guarda en los layouts)');
