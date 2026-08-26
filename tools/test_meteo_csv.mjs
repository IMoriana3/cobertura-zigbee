/* LAS HSU DEL LAYOUT CONTRA LOS CSV DE COBERTURA.

   `meteo[].ncu`, `.gw` y `.esclavo` los escribe tools/meteo_ncu.mjs. Los CSV de `cobertura_coords/`
   los escribe tools/gen_coords_cobertura.py. Los dos salen —cuando pueden— de la misma fuente: lo
   que la casa tiene transcrito del Excel en SCADA/tools/tcu-toolbox/plantas/. Pero por CAMINOS
   DISTINTOS: el primero empareja por el índice `rsu` de la estación, y el segundo reparte con los
   cupos de `hsus` por NCU y distancia total mínima. Que dos caminos den lo mismo es la comprobación;
   que dejen de darlo es lo que hay que enterarse de que ha pasado.

       node tools/test_meteo_csv.mjs

   NO TODO CSV VALE IGUAL, y por eso aquí se mira el manifiesto de cada planta antes de exigir nada.
   `hsus_asignadas_por` dice con qué regla se pusieron esas NCU:

     scada (cupo) + distancia mínima ...... del Excel. Es dato: si no cuadra, FALLA.
     layout (ncu y gw declarada) .......... el CSV copió del layout. No es prueba de nada: se informa.
     NCU más cercana ...................... la regla débil, la que se equivoca en 3 de 24 casos
                                            conocidos. NO es dato: donde el layout calla, el CSV NO
                                            rellena el hueco.

   Ese último caso es real y conviene tenerlo a la vista: los CSV de San José traen las OCHO HSU con
   NCU, pero tres están puestas por cercanía porque el fichero del SCADA de esa planta no declara las
   NCU 7, 12, 16, 17 y 19. Quien las vea en el CSV se las puede creer. No son dato.

   Devuelve 1 si algo que SÍ es dato no cuadra.                                                    */
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
  const esCopia = /^layout/.test(regla);
  const L = JSON.parse(readFileSync(lay, 'utf8'));
  const csv = filas(readFileSync(csvf, 'utf8')).filter(c => c[4] === 'HSU');

  for (const [i, m] of (L.meteo || []).entries()) {
    const c = csv[i];
    if (!c) continue;
    const cn = +c[6] || null, ce = c[8] ? +c[8] : null;
    const nom = String(m.name).padEnd(18);
    const izq = `${m.ncu ?? '—'}${m.esclavo != null ? '/' + m.esclavo : ''}`.padEnd(14);
    const der = `${cn ?? '—'}${ce != null ? '/' + ce : ''}`.padEnd(14);

    if (m.ncu == null) {
      if (cn != null && !esDato) avisos.push(`${p} ${m.name}: el layout la deja sin NCU y el CSV pone la ${cn}, pero por «${regla.split(':')[0]}». No es dato`);
      else if (cn != null) { malo++; console.log(`  FALLA ${p.padEnd(10)} ${nom}${izq}${der}el CSV la sabe del Excel y el layout no`); }
      continue;
    }
    if (cn == null) continue;
    const cuadra = m.ncu === cn && (m.esclavo == null || ce == null || m.esclavo === ce);
    if (cuadra) { ok++; continue; }
    if (esDato) { malo++; console.log(`  FALLA ${p.padEnd(10)} ${nom}${izq}${der}los dos vienen del Excel y no dicen lo mismo`); }
    else avisos.push(`${p} ${m.name}: layout ${m.ncu}, CSV ${cn}, pero el CSV va por «${regla.split(':')[0]}»${esCopia ? '' : ' (la regla débil)'}. No decide`);
  }
}

console.log(`\n${ok} HSU cuadran entre el layout y el CSV`);
if (avisos.length) console.log(`\nno deciden (${avisos.length}):\n  ` + avisos.join('\n  '));
console.log(`\n${malo ? malo + ' divergencia(s) entre dos lecturas del MISMO Excel: mirar cuál de los dos caminos está mal'
  : 'ninguna divergencia donde las dos fuentes son dato'}`);
process.exit(malo ? 1 : 0);
