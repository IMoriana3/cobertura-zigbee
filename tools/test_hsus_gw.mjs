/* CADA HSU DEL LAYOUT CONTRA LO QUE DICE LA HOJA.

   La hoja «Direcciones IP» trae, por cada NCU, dos columnas `RSU` —una por gateway— y en la celda
   va el NÚMERO de la estación: un 5 ahí significa «la HSU 5 cuelga de esta NCU, por este gateway».
   `make_plantas.py --excel` lo vuelca a `rsu` en SCADA/tools/tcu-toolbox/plantas/, y
   `tools/meteo_ncu.mjs` lo escribe en el layout. Aquí se comprueba que lo que acabó en el layout es
   exactamente lo que dice la hoja, sin nada de por medio.

   ANTES ESTO ERA OTRA COSA. Mientras el dato no existía, este banco INYECTABA un `hsus_gw` de
   mentira para ejercitar una rama que no corría nadie. El 2026-08-27 llegó la hoja de verdad y esa
   premisa se acabó: simular lo que ya está sería peor que no probar, porque un banco que se miente
   a sí mismo no avisa de nada. Ahora carea el fichero real contra el layout real.

       node tools/test_hsus_gw.mjs

   QUÉ SE EXIGE, y solo esto:

     · si la hoja dice que la HSU n va en la NCU X por el gateway G, el layout tiene que decir lo
       mismo — y con `ncu_origen` empezando por «toolbox», no por una deducción;
     · si la hoja NO dice nada de una estación, el layout puede tener lo que sea (derivado, de campo,
       o nada) y aquí no se opina;
     · y una HSU nunca puede llevar gateway sin NCU, que es dirección sin destino.

   Devuelve 1 si el layout se ha separado de la hoja.                                              */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
/* Los candidatos son todos RELATIVOS a proposito. Habia un
   '/home/user/SCADA/tools/tcu-toolbox/plantas/' absoluto delante —la ruta de
   un contenedor concreto—, redundante porque '../../SCADA/...' ya resuelve
   ahi, y que hacia que el banco careara SIEMPRE en local y NUNCA en CI sin
   que la diferencia se notara. Eso es lo que hay que poder deprivar para
   probar la guarda. */
const DIR = [
  new URL('../../SCADA/tools/tcu-toolbox/plantas/', import.meta.url).pathname,
  new URL('../../scada/tools/tcu-toolbox/plantas/', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });
const TOOLBOX = { ayora: '24025-ayora.json', sanjose: '24019-san-jose.json', fayon: '24007-fayon.json',
  tunez: '24021-tunez.json', bagnarelli: '24030-bagnarelli.json', elburgo: 'elburgo.json' };

/* rc = 2, NO 0. Salia con 0 y en la pagina de checks se veia igual que un
   careo hecho: «comprobado y pasa» y «no comprobado» pintados del mismo
   verde. Es el mismo defecto que #738 arreglo en el banco de configuracion y
   que aparecio despues en cuatro pasos de Siting. El comentario del propio
   workflow ya lo decia —«hoy no vigila nada»— y el codigo de salida decia lo
   contrario; el agregador lee el codigo de salida.
   SCADA es PUBLICO: la CI lo clona, asi que esta rama solo salta cuando de
   verdad no esta. */
const SIN_HOJA = !DIR;
if (SIN_HOJA) {
  console.log('SIN CAREO: no encuentro plantas/ de la toolbox, no hay hoja contra la que carear.');
  console.log('  la escribe SCADA/tools/tcu-toolbox/make_plantas.py --excel');
  console.log('No se ha careado ninguna HSU. Esto no es un verde.');
}

let malo = 0, ok = 0, sinHoja = [];
const di = (bien, txt) => { if (!bien) malo++; console.log(`  ${bien ? 'ok   ' : 'FALLA'} ${txt}`); };
const indice = s => { const m = /(\d+)/.exec(String(s || '')); return m ? +m[1] : null; };

for (const [planta, fichero] of (SIN_HOJA ? [] : Object.entries(TOOLBOX).sort())) {
  const ruta = DIR + fichero, lay = `${RAIZ}${planta}_layout.json`;
  if (!existsSync(ruta) || !existsSync(lay)) continue;
  const L = JSON.parse(readFileSync(lay, 'utf8'));
  const M = L.meteo || [];

  /* Lo que la hoja dice: índice de estación → NCU y gateway. El gateway sale del puerto del
     passthrough, 503 el GW1 y 504 el GW2, que es como lo escribe make_plantas. */
  const dice = {};
  for (const p of JSON.parse(readFileSync(ruta, 'utf8')).plantas || []) {
    const m = /NCU\s*(\d+)/.exec(String(p.nombre || ''));
    if (!m) continue;
    for (const [k, n] of (p.rsu || []).entries()) {
      dice[n] = { ncu: +m[1], gw: p.puerto === 503 ? 1 : 2, esclavo: (p.hsu_esclavos || [])[k] };
    }
  }
  const cuantas = Object.keys(dice).length;
  if (!cuantas) { sinHoja.push(`${planta} (${fichero} no trae ninguna \`rsu\`)`); continue; }

  console.log(`\n· ${planta} — la hoja declara ${cuantas} de las ${M.length} del DWG`);
  for (const [i, m] of M.entries()) {
    const n = indice(m.name) ?? (i + 1);
    const d = dice[n];
    if (!d) continue;                                   // la hoja no habla de ésta: aquí no se opina
    const bien = m.ncu === d.ncu && m.gw === d.gw && /^toolbox/.test(String(m.ncu_origen || ''));
    if (bien) ok++;
    di(bien, `${String(m.name).padEnd(16)} hoja: NCU ${String(d.ncu).padStart(2)} GW ${d.gw}` +
      `   layout: NCU ${String(m.ncu ?? '—').padStart(2)} GW ${m.gw ?? '—'}` +
      (bien ? '' : `   ← ${m.ncu !== d.ncu ? 'otra NCU' : m.gw !== d.gw ? 'otro gateway' : 'la procedencia no dice «toolbox»'}`));
    if (d.esclavo != null) di(m.esclavo === d.esclavo,
      `${String(m.name).padEnd(16)} y su esclavo Modbus: hoja ${d.esclavo}, layout ${m.esclavo ?? '—'}`);
  }
}

/* Y esto vale para todas, hable la hoja o no: un gateway sin NCU es dirección sin destino. */
let sueltas = 0;
for (const f of readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x))) {
  const L = JSON.parse(readFileSync(RAIZ + f, 'utf8'));
  sueltas += (L.meteo || []).filter(m => m.gw != null && m.ncu == null).length;
}
console.log('');
di(sueltas === 0, `ninguna HSU con gateway y sin NCU en los once layouts (hay ${sueltas})`);

if (sinHoja.length) console.log('\nsin `rsu` en su fichero, así que no se carean: ' + sinHoja.join(', '));
console.log(`\n${malo ? malo + ' divergencia(s): el layout se ha separado de la hoja'
  : `${ok} HSU dicen en el layout exactamente lo que dice la hoja`}`);

/* EL PISO. Sin esto, encontrar la carpeta y no carear NI UNA HSU salia igual
   de verde que carearlas todas: el bucle hace `continue` cuando falta el
   fichero de una planta, asi que con la carpeta presente pero vacia daba
   ok = 0, malo = 0 y rc = 0. Un cero no es un aprobado.
   El numero es el MEDIDO —22 el 2026-09-23: ayora 10 HSU (20 comprobaciones,
   con su esclavo Modbus), bagnarelli 2 y fayon 1— y solo se BAJA a proposito,
   con el motivo escrito, igual que los pisos de
   factiun-cartera/tests/correr.sh. San Jose, Tunez y El Burgo no entran
   porque su fichero de la toolbox no trae `rsu`, y el banco ya lo dice.
   Se pone en 20 y no en 22 para que anyadir una HSU no lo rompa solo: lo que
   tiene que cazar es que el careo DESAPAREZCA, no que crezca. */
const PISO = 20;
if (malo) process.exit(1);
if (SIN_HOJA) process.exit(2);
if (ok < PISO) {
  console.log(`\nSIN CAREO SUFICIENTE: ${ok} HSU careadas, y el piso son ${PISO}.`);
  console.log('Encontrar la carpeta y no carear casi nada no es un verde.');
  process.exit(2);
}
process.exit(0);
