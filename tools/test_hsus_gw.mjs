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
const DIR = ['/home/user/SCADA/tools/tcu-toolbox/plantas/',
  new URL('../../SCADA/tools/tcu-toolbox/plantas/', import.meta.url).pathname,
  new URL('../../scada/tools/tcu-toolbox/plantas/', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });
const TOOLBOX = { ayora: '24025-ayora.json', sanjose: '24019-san-jose.json', fayon: '24007-fayon.json',
  tunez: '24021-tunez.json', bagnarelli: '24030-bagnarelli.json', elburgo: 'elburgo.json' };

if (!DIR) { console.log('no encuentro plantas/ de la toolbox: no hay hoja contra la que carear'); process.exit(0); }

let malo = 0, ok = 0, sinHoja = [];
const di = (bien, txt) => { if (!bien) malo++; console.log(`  ${bien ? 'ok   ' : 'FALLA'} ${txt}`); };
const indice = s => { const m = /(\d+)/.exec(String(s || '')); return m ? +m[1] : null; };

for (const [planta, fichero] of Object.entries(TOOLBOX).sort()) {
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
process.exit(malo ? 1 : 0);
