/* EL ÍNDICE DE PLANTAS: un solo sitio del que salen el código, el huso y las coordenadas.
   Hoy esos tres datos están repartidos y copiados a mano. El huso vive en `<planta>_layout.json`
   y ESTÁ COPIADO en `sim-solar.html`. Las coordenadas están en la cartera, donde faltan en 17 de
   las 22 plantas, mientras el layout de esas mismas plantas SÍ las trae en `clat`/`clon`.

   Esto genera `plantas_indice.json` a partir de los layouts, que son la autoridad, y lo publica
   junto a ellos. Las fichas lo piden una vez y dejan de guardar copias.

       node tools/indice_plantas.mjs                informe
       node tools/indice_plantas.mjs --write        escribe el índice

   EL CÓDIGO DE CARTERA se empareja por NOMBRE, y esa correspondencia es una decisión, no un dato
   del fichero: por eso va escrita aquí a la vista y no adivinada al vuelo. Dicayagua no está en la
   cartera y Túnez aparece dos veces (24021 y 26322); las dos cosas quedan dichas.                */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');

/* Emparejamiento layout ↔ cartera. Revisado a mano contra los 22 proyectos del SEED. */
const CODIGO = {
  elburgo: '24002', fayon: '24007', sanjose: '24019', tunez: '24021', ayora: '24025',
  bagnarelli: '24030', paramo: '25019', polvorin: '25082', benante: '25004', panbianco: '25004.2',
  dicayagua: null,                       // no está en la cartera: el Panel la lleva como tarjeta, el SEED no
};
const NOTA_CODIGO = {
  dicayagua: 'no figura en el SEED de la cartera; si se da de alta, ponerle aquí su número',
  tunez: 'la cartera trae DOS Túnez, 24021 (con coordenadas) y 26322 (sin). Se toma el 24021, que es el que tiene el dato',
  polvorin: 'en la cartera es «El polvorin + Higueras»',
};

/* La regla peninsular del huso, la misma de backtracking y overcast: del día 88 al 298, UTC+2. */
const REGLA_PENINSULAR = 'UTC+2 del día 88 al 298 y UTC+1 el resto (regla peninsular; vale también para las italianas)';

const filas = [];
for (const f of readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort()) {
  const nombre = f.replace('_layout.json', '');
  const L = JSON.parse(readFileSync(RAIZ + f, 'utf8'));
  const T = L.trackers || L.seguidores || [];
  filas.push({
    planta: nombre,
    codigo: CODIGO[nombre] !== undefined ? CODIGO[nombre] : null,
    codigo_nota: NOTA_CODIGO[nombre] || null,
    lat: L.clat != null ? +L.clat.toFixed(6) : null,
    lon: L.clon != null ? +L.clon.toFixed(6) : null,
    crs: L.crs || null,
    tz_fijo_min: L.tzFijo != null ? L.tzFijo : null,
    tz_regla: L.tzFijo != null ? 'huso FIJO declarado en el layout, sin cambio de hora' : REGLA_PENINSULAR,
    fija: !!L.fija,
    unidades: T.length,
    montaje: L.montaje || null,
  });
}

console.log('planta        código    lat        lon         huso                unidades  montaje');
for (const r of filas) {
  console.log(
    r.planta.padEnd(13) + String(r.codigo || '—').padEnd(10) +
    String(r.lat ?? '—').padStart(10) + String(r.lon ?? '—').padStart(12) + '  ' +
    (r.tz_fijo_min != null ? ('fijo ' + (r.tz_fijo_min / 60) + ' h').padEnd(18) : 'regla peninsular  ') +
    String(r.unidades).padStart(8) + '  ' + (r.montaje ? r.montaje.tipo : '—'));
}
const sinCodigo = filas.filter(r => !r.codigo).map(r => r.planta);
const sinCoord = filas.filter(r => r.lat == null).map(r => r.planta);
console.log('\nsin código de cartera: ' + (sinCodigo.join(', ') || 'ninguna'));
console.log('sin coordenadas en el layout: ' + (sinCoord.join(', ') || 'ninguna'));

if (WRITE) {
  const doc = {
    generado_por: 'tools/indice_plantas.mjs',
    que_es: 'Índice de las plantas que tienen layout. Es la FUENTE del huso, del código de cartera y '
      + 'de las coordenadas: quien las necesite las pide de aquí en vez de guardar una copia.',
    ojo: 'Generado. No se edita a mano: se cambia el layout y se vuelve a generar.',
    plantas: filas,
  };
  writeFileSync(RAIZ + 'plantas_indice.json', JSON.stringify(doc, null, 1));
  console.log('\n→ plantas_indice.json (' + filas.length + ' plantas)');
} else console.log('\n(informe: nada escrito. Con --write se genera plantas_indice.json)');
