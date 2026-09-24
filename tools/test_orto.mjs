/* De donde sale la ortofoto: `orto.js`, y que las paginas lo USEN.
 * ---------------------------------------------------------------------------
 * ESTO NACE DE UN DEFECTO REAL, no de una simetria bonita. Las fuentes de la
 * ortofoto estaban escritas CUATRO veces y no decian lo mismo:
 *
 *   terreno.html  PNOA primero, ESRI de respaldo tesela a tesela.
 *   plano.html    SOLO ESRI. Sin PNOA. La misma planta salia BORROSA aqui y
 *                 nitida en el terreno -- PNOA da 25 cm/px -- y nada lo decia.
 *   simulador RF  como terreno, con los parametros de PNOA en otro orden.
 *   index.html    plantilla de Leaflet, tambien solo ESRI (se queda aparte a
 *                 proposito: no carga scripts externos, viaja en el ZIP).
 *
 * Nadie las comparaba nunca, asi que la de plano.html podia llevar ahi desde el
 * principio. Ahora hay una sola definicion y este banco vigila dos cosas: que
 * diga lo correcto, y que las paginas no se vuelvan a escribir la suya.
 *
 * Mutacion: `ORTO_SUELTO=si` finge que las paginas siguen con su copia.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const Orto = createRequire(import.meta.url)(path.join(RAIZ, 'orto.js'));

let ok = 0, ko = 0;
const check = (n, c, extra = '') => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FALLO ' + n + (extra ? ' -- ' + extra : '')); } };

console.log('### la ortofoto sale de un solo sitio ###');

/* 1. EL ORDEN x/y, que es el error clasico de esta familia de URLs. Se piden
      con valores distinguibles: si alguien los cambia de sitio, el mosaico sale
      de otro punto del planeta y la pagina no chilla, solo enseña otro campo. */
const eUrl = Orto.ESRI(17, 111, 222);
check('ESRI numera la ruta /{z}/{y}/{x} -- la FILA antes que la columna',
      eUrl.endsWith('/17/222/111'), eUrl);
const pUrl = new URL(Orto.PNOA(17, 111, 222));
check('PNOA manda la fila en `tilerow` y la columna en `tilecol`',
      pUrl.searchParams.get('tilerow') === '222' && pUrl.searchParams.get('tilecol') === '111',
      pUrl.search);
check('PNOA pide el zoom como `tilematrix`', pUrl.searchParams.get('tilematrix') === '17');
check('PNOA pide la capa de ortofoto maxima actualidad',
      pUrl.searchParams.get('layer') === 'OI.OrthoimageCoverage', pUrl.searchParams.get('layer'));
check('PNOA pide la rejilla que casa con las teselas de Web Mercator',
      pUrl.searchParams.get('tilematrixset') === 'GoogleMapsCompatible');

/* 2. LA CAJA, contra las plantas DE VERDAD. Una caja mal puesta no se nota en
      una prueba con numeros inventados; se nota cuando una planta española se
      queda sin PNOA. Asi que se pregunta por las plantas que hay en el repo. */
const layouts = readdirSync(RAIZ).filter(f => f.endsWith('_layout.json'));
check('hay layouts contra los que preguntar', layouts.length > 0, `${layouts.length}`);
let esp = 0, fuera = 0, mudas = 0, sinRespaldo = [];
for (const f of layouts) {
  let L; try { L = JSON.parse(readFileSync(path.join(RAIZ, f), 'utf8')); } catch { continue; }
  if (typeof L.clat !== 'number' || typeof L.clon !== 'number') { mudas++; continue; }
  const cadena = Orto.fuentes(L.clat, L.clon).map(s => s.fuente);
  check(`${f.replace('_layout.json', '')} (${L.clat.toFixed(2)}, ${L.clon.toFixed(2)}) pide ${cadena.join(' -> ')}`,
        cadena[cadena.length - 1] === 'ESRI' && cadena.length <= 2 && cadena[0] !== undefined);
  if (cadena[cadena.length - 1] !== 'ESRI' || !cadena.length) sinRespaldo.push(f);
  if (cadena[0] === 'PNOA') esp++; else fuera++;
}
/* Agregado y NO tautologico: se cuenta sobre las plantas recorridas. ESRI cubre
   el mundo entero y PNOA solo España, asi que una cadena que no termine en ESRI
   es una planta que se queda sin ortofoto -- y eso no se ve, se ve suelo liso. */
check('ninguna planta se queda sin respaldo: la cadena SIEMPRE acaba en ESRI',
      layouts.length > 0 && sinRespaldo.length === 0, sinRespaldo.join(', '));
console.log(`     (${esp} en España con PNOA delante, ${fuera} fuera con ESRI solo, ${mudas} sin georreferencia)`);
check('alguna planta cae dentro de España y alguna fuera: la caja separa de verdad',
      esp > 0 && fuera > 0, `dentro=${esp} fuera=${fuera}`);

/* 3. QUE LAS PAGINAS LO USEN. Es la mitad que de verdad evita la reincidencia:
      tener el modulo no sirve de nada si mañana alguien vuelve a pegar la URL. */
const SUELTO = process.env.ORTO_SUELTO === 'si';
for (const pag of ['terreno.html', 'plano.html']) {
  const txt = SUELTO
    ? 'var SAT=function(z,x,y){return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/"+z+"/"+y+"/"+x;};'
    : readFileSync(path.join(RAIZ, pag), 'utf8');
  check(`${pag} carga orto.js`, SUELTO ? false : txt.includes('src="orto.js"'));
  check(`${pag} no se escribe su propia URL de teselas`,
        !/["'`]https:\/\/server\.arcgisonline\.com|["'`]https:\/\/www\.ign\.es\/wmts/.test(txt));
}

console.log();
console.log(ko ? `${ko} FALLOS de ${ok + ko}` : `TODAS OK (${ok} comprobaciones)`);
process.exit(ko ? 1 : 0);
