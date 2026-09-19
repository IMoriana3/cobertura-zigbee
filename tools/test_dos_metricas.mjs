/* LA PÁGINA PUBLICA LAS DOS MÉTRICAS, Y NO ELIGE UNA EN SILENCIO
 *
 * `poaPlantSeg` usa el tilt, la sombra y el largo de CADA MESA. `poaPlant` usa
 * los de la LÍNEA y promedia líneas sin ponderar. No son dos precisiones de lo
 * mismo: son dos agregaciones, y el ORDEN entre políticas depende de cuál se
 * use — medido en R3 fase 1 (audit3/out/F1_seg_metrica.json): `optimal` gana por
 * línea en 86 de 86 instantes y pierde por mesa en 58 de 86.
 *
 * Hasta v1.73 la página elegía una según hubiera `segTilt` y no lo decía.
 *
 *     node tools/test_dos_metricas.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
let ok = 0, fail = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n + (d ? '   ' + d : '')); }
                         else { fail++; console.log('  ✗ ' + n + (d ? '   ' + d : '')); } };

/* el cuerpo de la serie del día, con su TEST NULO antes de nada */
const serie = html.slice(html.indexOf('function* serieDiaGen'), html.indexOf('function serieDia('));
T('el corte de serieDiaGen no está vacío',
  serie.length > 1000 && serie.includes('crearLazoSeg'), serie.length + ' caracteres');

/* 1 · la serie guarda las DOS, y la segunda sale del MISMO estado ejecutado */
T('la serie guarda la POA por línea además de la publicada',
  /poaLin\[t\]\s*=/.test(serie) && /poaLin:\s*poaLin/.test(serie));
T('la segunda métrica se calcula sobre el θ EJECUTADO, no sobre el mando',
  /poaLin\[t\]=poaPlant\(g\.zen,g\.az,T,\s*lim\s*,/.test(serie),
  'lo único que cambia entre las dos cifras es la agregación');
T('en la rama sin mesas las dos son la MISMA cifra, no dos cuentas',
  /poaLin\[t\]=pp\.plant\b/.test(serie));

/* 2 · la integral del día lleva las dos */
const kpis = html.slice(html.indexOf('function kpisSerie'), html.indexOf('function dayKpis'));
T('el corte de kpisSerie no está vacío', kpis.length > 500, kpis.length + ' caracteres');
T('kpisSerie integra la segunda métrica y la devuelve',
  /kwhLin\s*\+=/.test(kpis) && /kwhLin:\s*kwhLin/.test(kpis));
T('y cuando la serie no la trae, cae a la misma y no inventa',
  /poaLin\[t\]!=null\)\s*\?\s*p\.poaLin\[t\]\s*:\s*pp\.plant/.test(kpis));

/* 3 · la tabla la publica, y sólo donde difiere */
/* el ancla de cierre tiene que ir DESPUÉS de la de apertura. La primera versión
   cerraba en `/* ══ CAREO`, que está 1.800 líneas ANTES en el fichero, así que
   indexOf devolvía un índice menor y el corte salía VACÍO. Lo cazó el test nulo
   —y no los dos controles, que pasaron igual sobre el corte vacío: ver abajo. */
const iT0 = html.indexOf('function fillDayTable'), iT1 = html.indexOf('function informeHTML', iT0);
const tabla = (iT0 >= 0 && iT1 > iT0) ? html.slice(iT0, iT1) : '';
T('el corte de fillDayTable no está vacío',
  tabla.length > 800 && tabla.includes('POA planta'), tabla.length + ' caracteres');
T('la tabla decide por la propia serie si hay mesas, no por una bandera aparte',
  /const DOS=kk\.some\(e=>e\.k&&e\.k\.porMesa\)/.test(tabla));
T('la cabecera etiqueta LAS DOS columnas', /\(por mesa\)/.test(tabla) && /\(por línea\)/.test(tabla));
T('la celda de la segunda columna sale de kwhLin', /e\.k\.kwhLin\.toFixed/.test(tabla));
T('y la columna NO aparece sin mesas', /\(DOS\?'<td[^']*kwhLin/.test(tabla.replace(/\s+/g, ' ')) ||
  /DOS\?'<td class="mut">'\+e\.k\.kwhLin/.test(tabla));

/* CONTROL NEGATIVO · sobre el código de antes, esto tiene que ponerse rojo.
   Sin él serían expresiones regulares que nadie ha visto fallar. */
/* Y LOS CONTROLES EXIGEN QUE EL CORTE VALGA. La primera versión los escribió
   como negaciones, y una negación sobre una cadena VACÍA es verdadera: los dos
   pasaron en verde sobre el corte roto de arriba, que es justo el defecto que
   vienen a impedir. Ahora cada uno comprueba primero que el original SÍ cumple. */
const viejo = serie.replace(/poaLin\[t\][^;]*;/g, '').replace(/poaLin:poaLin,/, '');
T('CONTROL · sobre la serie de antes, el banco se pondría rojo',
  /poaLin\[t\]\s*=/.test(serie) && !/poaLin\[t\]\s*=/.test(viejo) &&
  /poaLin:\s*poaLin/.test(serie) && !/poaLin:\s*poaLin/.test(viejo));
const tablaVieja = tabla.replace(/const DOS=[^;]+;/, 'const DOS=false;').replace(/e\.k\.kwhLin\.toFixed\(3\)/, '0');
T('CONTROL · con la columna quitada, el banco se pondría rojo',
  /const DOS=kk\.some/.test(tabla) && /e\.k\.kwhLin\.toFixed/.test(tabla) &&
  (!/const DOS=kk\.some/.test(tablaVieja) || !/e\.k\.kwhLin\.toFixed/.test(tablaVieja)));

console.log('\n' + ok + ' OK · ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
