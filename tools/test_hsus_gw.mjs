/* QUE EL GATEWAY DE LA HOJA LLEGUE HASTA EL LAYOUT, hoy que todavía no existe.

   La hoja «Direcciones IP» tiene DOS columnas `RSU`, una por gateway, así que sí dice de cuál cuelga
   cada estación. `make_plantas.py` lo tiraba; desde el 2026-08-26 lo guarda en `hsus_gw` (repo
   SCADA). Pero ese campo NO ESTÁ EN NINGÚN FICHERO todavía: hace falta una pasada con `--excel`, que
   pide la hoja y no está en ningún repo.

   O sea que `tools/meteo_ncu.mjs` tiene una rama que hoy no ejecuta nadie. Eso es exactamente el
   código que se pudre en silencio: el día de la pasada nos enteraríamos de que no va, con el Excel
   delante y la prisa encima. Este banco la ejercita.

   QUÉ HACE. Copia el fichero de la toolbox de San José, le inyecta `hsus_gw` como quedará tras la
   pasada, corre `meteo_ncu.mjs --write` sobre esa planta, comprueba que el gateway ha llegado al
   layout, y DEJA LOS DOS FICHEROS COMO ESTABAN — pase lo que pase, también si algo revienta.

   OJO: el reparto que se inyecta es un FIXTURE, no un dato. Dice qué gateway tendría cada NCU si la
   hoja lo dijera así; cuál es de verdad lo dirá la pasada. Lo que se comprueba es la TUBERÍA, no el
   valor.

       node tools/test_hsus_gw.mjs                                                                 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RAIZ = new URL('..', import.meta.url).pathname;
const TB = ['/home/user/SCADA/tools/tcu-toolbox/plantas/24019-san-jose.json',
  new URL('../../SCADA/tools/tcu-toolbox/plantas/24019-san-jose.json', import.meta.url).pathname,
  new URL('../../scada/tools/tcu-toolbox/plantas/24019-san-jose.json', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });
const LAY = RAIZ + 'sanjose_layout.json';

if (!TB) { console.log('no encuentro el fichero de la toolbox de San José: no hay nada que ejercitar'); process.exit(0); }

/* El fixture: qué gateway declararía la estación de cada NCU. Inventado a propósito MIXTO —unas en
   el GW1 y otras en el GW2— porque es lo que dijo la casa que pasa en San José, y porque un reparto
   todo-a-un-lado no distinguiría una tubería que funciona de una que devuelve siempre lo mismo. */
const FIXTURE = { 1: 2, 6: 2, 8: 1, 11: 1, 21: 1 };
/* Y qué estación va en cada una: el número de la columna RSU. Los cinco son los que la geometría
   ya daba por dos fuentes, así que si la tubería funciona tienen que salir IGUAL —pero con
   procedencia «toolbox» en vez de «dos fuentes», que es justo lo que se comprueba abajo. */
const RSU = { 1: 1, 6: 2, 8: 3, 11: 4, 21: 8 };

const tbAntes = readFileSync(TB, 'utf8');
const layAntes = readFileSync(LAY, 'utf8');
let malo = 0;
const di = (ok, txt) => { if (!ok) malo++; console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${txt}`); };

try {
  /* 1 · sin `hsus_gw` —como está hoy— no se escribe gateway ninguno */
  execFileSync(process.execPath, [RAIZ + 'tools/meteo_ncu.mjs', '--write', 'sanjose'], { stdio: 'pipe' });
  let L = JSON.parse(readFileSync(LAY, 'utf8'));
  const conGwAntes = (L.meteo || []).filter(m => m.gw != null).length;
  di(conGwAntes === 0, `sin hsus_gw en la toolbox no se escribe gateway ninguno (hay ${conGwAntes})`);

  /* 2 · con `hsus_gw`, el gateway llega al layout */
  const d = JSON.parse(tbAntes);
  let inyectadas = 0;
  for (const p of d.plantas || []) {
    const m = /NCU\s*(\d+)/.exec(String(p.nombre || ''));
    if (!m || !p.hsus) continue;
    if (FIXTURE[+m[1]] === (p.puerto === 503 ? 1 : 2)) {
      p.hsus_gw = 1;
      /* Y el NÚMERO de la estación, que es lo que de verdad cierra la planta: un 5 en esa celda
         dice «la HSU 5 cuelga de esta NCU». Con él, la HSU sale de la toolbox y no se deriva. */
      p.rsu = [RSU[+m[1]]];
      inyectadas++;
    }
  }
  di(inyectadas === Object.keys(FIXTURE).length, `el fixture inyecta ${inyectadas} de ${Object.keys(FIXTURE).length} filas`);
  writeFileSync(TB, JSON.stringify(d, null, 1));

  execFileSync(process.execPath, [RAIZ + 'tools/meteo_ncu.mjs', '--write', 'sanjose'], { stdio: 'pipe' });
  L = JSON.parse(readFileSync(LAY, 'utf8'));
  for (const m of L.meteo || []) {
    if (m.ncu == null) continue;
    const esperado = FIXTURE[m.ncu];
    di(m.gw === esperado, `${String(m.name).padEnd(13)} NCU ${String(m.ncu).padStart(2)} → GW ${m.gw ?? '—'} (el fixture dice ${esperado})`);
    if (m.gw != null) di(/^toolbox|^campo|columna RSU/.test(String(m.gw_origen || '')) || /columna RSU/.test(String(m.ncu_origen || '')),
      `${String(m.name).padEnd(13)} y su procedencia dice de dónde sale el gateway`);
    di(/^toolbox/.test(String(m.ncu_origen || '')),
      `${String(m.name).padEnd(13)} sale de la TOOLBOX, no de una deducción`);
  }
  /* 3 · las que no tienen NCU tampoco pueden tener gateway */
  const sueltas = (L.meteo || []).filter(m => m.ncu == null && m.gw != null).length;
  di(sueltas === 0, `ninguna HSU sin NCU se lleva un gateway (hay ${sueltas})`);
} finally {
  /* PASE LO QUE PASE. Este banco toca dos ficheros de verdad, uno de ellos de OTRO repo: dejarlos
     sucios sería peor que no probar nada. */
  writeFileSync(TB, tbAntes);
  writeFileSync(LAY, layAntes);
}

const tbIgual = readFileSync(TB, 'utf8') === tbAntes, layIgual = readFileSync(LAY, 'utf8') === layAntes;
di(tbIgual && layIgual, 'los dos ficheros quedan como estaban');

console.log(`\n${malo ? malo + ' fallo(s)' : 'la tubería del gateway funciona: el día de la pasada, `hsus_gw` entra solo'}`);
process.exit(malo ? 1 : 0);
