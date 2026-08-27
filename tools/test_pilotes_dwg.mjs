/* El extractor de apoyos (`extract_dwg_pilotes.mjs`), sin DWG.
 *
 * No hay ningún DWG en el repo —la retícula de El Burgo se transcribió a mano de
 * uno que se procesó fuera—, así que no se puede probar de punta a punta. Lo que
 * sí se puede es probar el NÚCLEO, que es puro: se le dan círculos SINTÉTICOS
 * construidos desde la retícula publicada de El Burgo y sus 215 seguidores
 * reales, y se le exige que devuelva exactamente esa retícula.
 *
 * Si el día de mañana aparece un DWG y el extractor saca otra cosa, será por
 * cómo se leen los CIRCLE, no por la geometría: eso queda cubierto aquí.
 *
 *   node tools/test_pilotes_dwg.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reticulaDesdeCirculos, agrupa, ejeDe, familia } from './extract_dwg_pilotes.mjs';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const layout = JSON.parse(readFileSync(path.join(RAIZ, 'elburgo_layout.json'), 'utf8'));
const REJ = layout.pilotes.porTipo;
const TRK = layout.trackers;
const FILAZ = 3.0;                        // El Burgo es BIFILO: dos vigas a ±3 m del eje

/* Círculos como los dibujaría el plano: por cada seguidor, los apoyos de su tipo
   en LAS DOS vigas. Con `ruido` se les mete dispersión de replanteo. */
function circulosDe(trackers, rej, ruido = 0, semilla = 1) {
  let s = semilla;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s / 2147483648 - 0.5) * 2; };
  const out = [];
  for (const t of trackers) {
    const { ux, un } = ejeDe(t.rot || 0);
    for (const a of (rej[familia(t.t)] || []))
      for (const lado of [FILAZ, -FILAZ])
        out.push({ x: t.x + a * ux + lado * un + rnd() * ruido,
                   n: t.n + a * un - lado * ux + rnd() * ruido });
  }
  return out;
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* --- 1. el caso limpio: tiene que devolver la retícula publicada, tal cual --- */
{
  const c = circulosDe(TRK, REJ);
  const { porTipo, informe } = reticulaDesdeCirculos(TRK, c);
  check('recupera las tres retículas de El Burgo, exactas',
        igual(porTipo.interior, REJ.interior) && igual(porTipo.exterior, REJ.exterior) &&
        igual(porTipo.medio, REJ.medio), JSON.stringify(porTipo));
  check('y con el número de apoyos de cada tipo (8 · 10 · 4)',
        informe.tipos.interior.apoyos === 8 && informe.tipos.exterior.apoyos === 10 &&
        informe.tipos.medio.apoyos === 4,
        Object.entries(informe.tipos).map(([k, v]) => k + ':' + v.apoyos).join(' '));
  check('sin círculos huérfanos', informe.huerfanos === 0, informe.huerfanos);
  /* El BIFILO no debe duplicar la retícula: las dos vigas comparten las mismas X
     a lo largo del tubo, así que colapsan en las mismas posiciones. */
  check('las dos vigas del bifilo colapsan en las mismas X, no las duplican',
        informe.tipos.interior.circulos === informe.tipos.interior.seguidores * 8 * 2 &&
        informe.tipos.interior.porPosicion.every(n => n === informe.tipos.interior.seguidores * 2),
        JSON.stringify(informe.tipos.interior));
}

/* --- 2. con dispersión de replanteo: la mediana aguanta --- */
{
  const { porTipo } = reticulaDesdeCirculos(TRK, circulosDe(TRK, REJ, 0.08, 7));
  const cerca = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.06);
  check('con 8 cm de dispersión de replanteo sigue dando la misma retícula',
        cerca(porTipo.interior, REJ.interior) && cerca(porTipo.exterior, REJ.exterior) &&
        cerca(porTipo.medio, REJ.medio), JSON.stringify(porTipo.medio) + ' vs ' + JSON.stringify(REJ.medio));
}

/* --- 3. un eje girado: Bagnarelli va a 23,7° ---
   Una planta sintética de verdad: seis seguidores a 12 m de paso PERPENDICULAR a
   un eje girado 23,7°. Girar solo el rumbo de los de El Burgo dejando sus sitios
   no vale: los ejes se cruzarían entre sí, que es una planta que no existe. */
{
  const ROT = 23.7, e = ejeDe(ROT);
  const gir = [];
  for (let i = 0; i < 6; i++)                      // perpendicular al eje: (un, -ux)
    gir.push({ x: i * 12 * e.un, n: i * 12 * -e.ux, rot: ROT, t: 'Interior sin rótula' });
  const { porTipo, informe } = reticulaDesdeCirculos(gir, circulosDe(gir, REJ));
  check('con el eje girado 23,7° la retícula sale igual (se proyecta sobre el tubo)',
        igual(porTipo.interior, REJ.interior), JSON.stringify(porTipo.interior));
  check('y sin huérfanos ni posiciones de más', informe.huerfanos === 0 &&
        informe.tipos.interior.apoyos === 8, JSON.stringify(informe.tipos.interior));
}

/* --- 4. lo que NO debe tragarse --- */
{
  /* Una arqueta lejos de todo seguidor: fuera, y contada. */
  const c = circulosDe(TRK, REJ).concat([{ x: TRK[0].x + 500, n: TRK[0].n + 500 }]);
  const { informe } = reticulaDesdeCirculos(TRK, c);
  check('un círculo que no es un apoyo (lejos del eje) se descarta y se cuenta',
        informe.huerfanos === 1, informe.huerfanos);
  /* Un apoyo de menos en un seguidor: el reparto por posición deja de ser parejo
     y la herramienta ABORTA en vez de escribir una retícula a medias. */
  const c2 = circulosDe(TRK, REJ); c2.splice(0, 1);
  const { informe: i2 } = reticulaDesdeCirculos(TRK, c2);
  check('si a un seguidor le falta un apoyo, el reparto sale DISPAR (y aborta)',
        i2.tipos.interior.dispares || i2.tipos.exterior.dispares || i2.tipos.medio.dispares,
        JSON.stringify(Object.entries(i2.tipos).map(([k, v]) => k + ':' + v.porPosicion.join('/'))));
}

/* --- 5. el agrupador, aparte --- */
{
  check('agrupa devuelve la MEDIANA, que no se la lleva un valor suelto',
        agrupa([10, 10.01, 10.02, 10.03, 99], 0.5)[0].x === 10.02,
        JSON.stringify(agrupa([10, 10.01, 10.02, 10.03, 99], 0.5)));
  check('y separa dos posiciones que distan más que la tolerancia',
        agrupa([1, 1.1, 5, 5.1], 0.5).length === 2, agrupa([1, 1.1, 5, 5.1], 0.5).length);
  check('la familia sale del tipo del layout',
        familia('Exterior con rótula') === 'exterior' && familia('Medio sin rotula') === 'medio' &&
        familia('Interior sin rótula') === 'interior' && familia('completo') === 'interior');
}

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
