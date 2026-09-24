/* =============================================================================
 * orto.js — de dónde sale la ortofoto del suelo, y en qué orden se pide
 * =============================================================================
 * FUENTE ÚNICA, compartida por `terreno.html`, `plano.html` y el simulador de
 * cobertura RF (`cobertura-rf-fv/index.html`, que lo sincroniza).
 *
 * POR QUÉ EXISTE ESTE FICHERO. Estaba escrito TRES veces, y las tres no decían
 * lo mismo:
 *
 *   · `terreno.html` — PNOA primero y ESRI de respaldo, tesela a tesela.
 *   · `plano.html`   — SOLO ESRI. Sin PNOA. La misma planta salía BORROSA en
 *                      el plano y nítida en el terreno, sin que nada lo dijera.
 *   · el simulador   — como terreno, pero con los parámetros de la URL de PNOA
 *                      en otro orden.
 *
 * Nada vigilaba que coincidieran, así que la diferencia de `plano.html` podía
 * llevar ahí desde el principio sin que saltara nada. Una implantación es UNA y
 * un terreno es UNO: la ortofoto también.
 *
 * LA CUARTA COPIA, Y POR QUÉ SE QUEDA FUERA. `index.html` pide las mismas
 * teselas de ESRI como plantilla de Leaflet (`{z}/{y}/{x}`), y también sin PNOA.
 * Esa plantilla SALE de aquí —`Orto.ESRI('{z}','{x}','{y}')` la devuelve exacta—
 * pero esa página no carga NI UN script externo a propósito: lleva service
 * worker, tiene modo OFFLINE y viaja empaquetada en el ZIP de planta. Colgarle
 * un `<script src>` la rompería justo donde más importa, en el PC de planta y sin
 * red. Así que se queda con su literal, y queda escrito aquí que son cuatro
 * sitios y no tres.
 *
 * QUÉ NO ESTÁ AQUÍ. El armado del mosaico. Cada página lo hace distinto a
 * propósito —una pinta a canvas para medir, otra fabrica una textura— y eso es
 * legítimo. Lo que NO puede diferir es de dónde salen las teselas, en qué orden
 * se intentan y cómo se numeran: un x/y cambiado de sitio da un mosaico de otro
 * punto del planeta, y es el error clásico de esta familia de URLs.
 * ---------------------------------------------------------------------------*/
(function (root) {
  'use strict';

  /* ESRI World Imagery. OJO AL ORDEN: la ruta es /{z}/{y}/{x} — la fila ANTES
     que la columna, al revés que casi todo lo demás. */
  var ESRI = function (z, x, y) {
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' +
           z + '/' + y + '/' + x;
  };
  ESRI.fuente = 'ESRI';

  /* PNOA máxima actualidad (IGN, 25 cm/px): mucho más nítida que ESRI en
     España. WMTS por KVP, así que `tilerow` es y y `tilecol` es x. */
  var PNOA = function (z, x, y) {
    return 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0' +
           '&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg' +
           '&tilematrixset=GoogleMapsCompatible' +
           '&tilematrix=' + z + '&tilerow=' + y + '&tilecol=' + x;
  };
  PNOA.fuente = 'PNOA';

  /* La caja de España, península e islas incluidas. Generosa a propósito: fuera
     de ella el IGN no sirve nada y pedirle teselas sólo gasta un viaje por
     tesela antes de caer a ESRI. */
  var CAJA_ES = { latMin: 27, latMax: 44.2, lonMin: -18.5, lonMax: 4.7 };

  function enEspana(lat, lon) {
    return lat > CAJA_ES.latMin && lat < CAJA_ES.latMax &&
           lon > CAJA_ES.lonMin && lon < CAJA_ES.lonMax;
  }

  /* El orden importa y es tesela a tesela, no en bloque: donde el IGN no sirve
     ese zoom cae ESA tesela a ESRI y no el mosaico entero. */
  function fuentes(lat, lon) {
    return enEspana(lat, lon) ? [PNOA, ESRI] : [ESRI];
  }

  var O = { ESRI: ESRI, PNOA: PNOA, CAJA_ES: CAJA_ES,
            enEspana: enEspana, fuentes: fuentes, VERSION: '0.1.0' };

  root.Orto = O;
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
})(typeof window !== 'undefined' ? window : this);
