/* DE QUÉ NCU CUELGA CADA HSU, cuando el DWG lo dice en el nombre.

   El Burgo ya lo trae —`meteo[].ncu`, `gw` y `esclavo`— y de ahí sale el careo de `plants.yml` del
   SCADA. Benante y Panbianco no lo traían, pero SÍ lo dicen: sus estaciones se llaman «HSU 03-02»,
   «HSU 12-06»…, y ese primer número es la NCU. El segundo es el orden dentro de la planta, que ya
   está en el nombre y no se guarda.

   NO SE ESCRIBE POR EL NOMBRE A SECAS. Un número en una etiqueta puede ser cualquier cosa, así que
   se corrobora con la geometría: si el primer número es la NCU, cada HSU tiene que caer JUNTO a esa
   NCU y no a otra. Se mide la distancia a las 6 —o a las 12— y solo se escribe si la NCU del nombre
   es además la más cercana, con margen. Si una sola discrepa, no se escribe NADA de esa planta y se
   dice cuál: el nombre y el plano estarían diciendo cosas distintas, y eso hay que mirarlo, no
   promediarlo.

       node tools/meteo_ncu.mjs                  informe con las distancias
       node tools/meteo_ncu.mjs --write          escribe meteo[].ncu en los layouts que cuadren

   LO QUE NO SE PUEDE SACAR DE AQUÍ, y por eso no se escribe:

     · `gw`      — de qué gateway de esa NCU cuelga. En El Burgo hay DOS estaciones por NCU, una por
                   gateway, y ahí el reparto se comprobó en campo. Aquí hay UNA por NCU, así que el
                   nombre no distingue gateway y no hay de dónde deducirlo.
     · `esclavo` — la regla de la casa es 230 en el GW1 y 231 en el GW2. Sin saber el gateway no se
                   puede aplicar, y ponerlo a ojo sería inventar el direccionamiento de la malla.   */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');
const PLANTAS = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* «HSU 03-02» -> 3. También traga «HSU3-2». Lo que no lleve los dos números se queda fuera. */
const ncuDelNombre = s => {
  const m = /(\d+)\s*-\s*(\d+)/.exec(String(s || ''));
  return m ? +m[1] : null;
};
const numNCU = c => {
  const m = /(\d+)/.exec(String(c.name || ''));
  return m ? +m[1] : null;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.n - b.n);

const nombres = PLANTAS.length ? PLANTAS
  : readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort().map(x => x.replace('_layout.json', ''));

let escritas = 0, plantas = 0;
for (const n of nombres) {
  const ruta = RAIZ + n + '_layout.json';
  const L = JSON.parse(readFileSync(ruta, 'utf8'));
  const M = L.meteo || [], C = L.ncus || [];
  if (!M.length || !C.length) continue;
  if (!M.some(m => ncuDelNombre(m.name) != null)) continue;   // esta planta no numera así
  plantas++;

  console.log(`\n· ${n} — ${M.length} HSU, ${C.length} NCU`);
  const filas = [];
  let discrepa = 0, yaTenia = 0;
  for (const m of M) {
    const dice = ncuDelNombre(m.name);
    if (dice == null) { console.log(`  ??    ${m.name}: el nombre no trae el par NN-NN; se deja como está`); continue; }
    const orden = C.map(c => ({ num: numNCU(c), d: dist(m, c) })).sort((a, b) => a.d - b.d);
    const cerca = orden[0], segunda = orden[1];
    const ok = cerca.num === dice;
    if (!ok) discrepa++;
    if (m.ncu != null) yaTenia++;
    filas.push({ m, dice, ok });
    console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${String(m.name).padEnd(12)} nombre dice NCU ${String(dice).padStart(2)}` +
      `  ·  la más cercana es la ${String(cerca.num).padStart(2)} a ${Math.round(cerca.d)} m` +
      (segunda ? `  (la siguiente, la ${segunda.num}, a ${Math.round(segunda.d)} m)` : ''));
  }

  if (discrepa) {
    console.log(`  → ${discrepa} discrepancia(s): NO se escribe nada de ${n}. El nombre y el plano no dicen lo mismo.`);
    continue;
  }
  console.log(`  → el nombre y la geometría coinciden en las ${filas.length}` + (yaTenia ? ` (${yaTenia} ya lo tenían)` : ''));
  if (WRITE) {
    for (const f of filas) f.m.ncu = f.dice;
    writeFileSync(ruta, JSON.stringify(L));
    escritas++;
  }
}

if (!plantas) console.log('ninguna planta numera sus HSU como «HSU <ncu>-<orden>»');
console.log(WRITE ? `\n→ ${escritas} layout(s) escritos` : '\n(informe: nada escrito. Con --write se escribe meteo[].ncu)');
