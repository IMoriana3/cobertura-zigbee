/* LAS HSU DEL LAYOUT CONTRA LOS CSV DE COBERTURA.

   `meteo[].ncu`, `.gw` y `.esclavo` los escribe tools/meteo_ncu.mjs. Los CSV de `cobertura_coords/`
   los escribe tools/gen_coords_cobertura.py. Los dos salen —cuando pueden— de la misma fuente: lo
   que la casa tiene transcrito del Excel en SCADA/tools/tcu-toolbox/plantas/. Pero por CAMINOS
   DISTINTOS: el primero empareja por el índice `rsu` de la estación, y el segundo reparte con los
   cupos de `hsus` por NCU y distancia total mínima. Que dos caminos den lo mismo es la comprobación;
   que dejen de darlo es lo que hay que enterarse de que ha pasado.

       node tools/test_meteo_csv.mjs

   ── QUÉ COMPRUEBA HOY, QUE NO ES LO MISMO QUE AYER ────────────────────────────────────────────

   Cuando se escribió, la gracia era carear dos LECTURAS del mismo Excel. Eso se acabó: desde que los
   layouts declaran la NCU de todas sus HSU, los diez manifiestos dicen «layout», o sea que el CSV
   COPIA del layout y compararlos era preguntarle a uno si está de acuerdo consigo mismo. Un banco
   que no puede ponerse rojo da falsa tranquilidad, que es peor que no tenerlo.

   Así que ahora comprueba otra cosa, y sí tiene dientes: que el CSV NO ESTÉ VIEJO. Si alguien toca un
   layout y no regenera, el CSV se queda con la NCU de antes y nadie lo ve — los ficheros de
   `cobertura_coords/` son lo que se lleva al campo a lanzar la medida.

     el layout declara la NCU  ........ el CSV tiene que decir lo MISMO. Si no, está viejo: FALLA.
     el layout la deja en blanco ...... el CSV la rellena por «NCU más cercana», que es la regla que
                                        se equivoca en 3 de 24 casos conocidos. NO es dato y no
                                        decide nada: se informa y ya.

   El careo contra fuentes de verdad —la toolbox, el campo, el nombre del DWG— vive donde debe, en
   `meteo_ncu.mjs --calibra`. Aquí se vigila la frescura.

   El caso de arriba es real y conviene tenerlo a la vista: los CSV de San José traen las OCHO HSU
   con NCU, pero tres están puestas por cercanía porque el fichero del SCADA de esa planta no declara
   las NCU 7, 12, 16, 17 y 19. Quien las vea en el CSV se las puede creer. No son dato.

   Devuelve 1 si algún CSV se ha quedado viejo.                                                    */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const COORDS = RAIZ + 'cobertura_coords/';

/* Las etiquetas llevan comas dentro —«HSU 7 (US, snow)»— así que partir por coma a pelo corre las
   columnas y hace ver diferencias donde no las hay. */
function filas(texto) {
  return texto.split('\n').filter(l => l.trim()).map(l => {
    const o = []; let c = '', q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { o.push(c); c = ''; continue; }
      c += ch;
    }
    o.push(c); return o;
  });
}

let malo = 0, ok = 0, avisos = [];
console.log('planta       HSU                layout        CSV           ');

for (const p of readdirSync(COORDS).sort()) {
  const man = `${COORDS}${p}/manifiesto_${p}.json`;
  const csvf = `${COORDS}${p}/coords_${p}.csv`;
  const lay = `${RAIZ}${p}_layout.json`;
  if (!existsSync(man) || !existsSync(csvf) || !existsSync(lay)) continue;

  const regla = String(JSON.parse(readFileSync(man, 'utf8')).hsus_asignadas_por || '');
  const esDato = /^scada/.test(regla);
  const esCopia = /^layout/.test(regla);      // el CSV copió del layout: sirve para ver si está fresco
  const L = JSON.parse(readFileSync(lay, 'utf8'));
  const csv = filas(readFileSync(csvf, 'utf8')).filter(c => c[4] === 'HSU');

  /* NO SE EMPAREJA POR POSICIÓN. El CSV sale ORDENADO POR NCU, así que su fila i no es la HSU i del
     layout: en Benante las filas salen HSU_02, HSU_01, HSU_04, HSU_03 y comparar por índice inventa
     cuatro divergencias que no existen. El `node_id` sí lo dice —«HSU_07» es la séptima del layout,
     que es como lo numera gen_coords_cobertura.py— y por ahí se emparejan. */
  const porId = new Map(csv.map(c => [String(c[0]).trim(), c]));
  for (const [i, m] of (L.meteo || []).entries()) {
    const c = porId.get('HSU_' + String(i + 1).padStart(2, '0'));
    if (!c) continue;
    const cn = +c[6] || null, ce = c[8] ? +c[8] : null;
    const nom = String(m.name).padEnd(18);
    const izq = `${m.ncu ?? '—'}${m.esclavo != null ? '/' + m.esclavo : ''}`.padEnd(14);
    const der = `${cn ?? '—'}${ce != null ? '/' + ce : ''}`.padEnd(14);

    if (m.ncu == null) {
      /* El layout calla: lo que ponga el CSV es su relleno por cercanía. Se dice y no decide. */
      if (cn != null && !esDato) avisos.push(`${p} ${m.name}: el layout la deja sin NCU y el CSV pone la ${cn}, pero por «NCU más cercana». No es dato`);
      else if (cn != null) { malo++; console.log(`  FALLA ${p.padEnd(10)} ${nom}${izq}${der}el CSV la sabe del Excel y el layout no`); }
      continue;
    }
    if (cn == null) continue;
    const cuadra = m.ncu === cn && (m.esclavo == null || ce == null || m.esclavo === ce);
    if (cuadra) { ok++; continue; }
    /* EL LAYOUT LO DECLARA Y EL CSV DICE OTRA COSA. Si el CSV salió del layout —que es el caso de las
       diez plantas hoy— eso solo puede ser que se generó con un layout anterior. FALLA: los ficheros
       de cobertura_coords son los que se llevan al campo. */
    if (esDato || esCopia) {
      malo++;
      console.log(`  FALLA ${p.padEnd(10)} ${nom}${izq}${der}` +
        (esDato ? 'los dos vienen del Excel y no dicen lo mismo' : 'el CSV salió del layout y no coincide: está VIEJO, hay que regenerarlo'));
    } else avisos.push(`${p} ${m.name}: layout ${m.ncu}, CSV ${cn}, pero el CSV va por la regla débil. No decide`);
  }
}

console.log(`\n${ok} HSU: el CSV dice lo mismo que el layout`);
if (avisos.length) console.log(`\nno deciden (${avisos.length}):\n  ` + avisos.join('\n  '));
console.log(`\n${malo ? malo + ' CSV desincronizado(s) con su layout: correr `python3 tools/gen_coords_cobertura.py`'
  : 'ningún CSV se ha quedado atrás del layout'}`);
process.exit(malo ? 1 : 0);
