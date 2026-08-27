/* LOS REPETIDORES DE AYORA: su gateway y su esclavo Modbus, y los SEIS que el DWG no dibuja.

   Un repetidor es un nodo más de la malla: se sondea igual que un TCU o una HSU, y está puesto justo
   para sostener el alcance de un gateway concreto. Pero en el layout solo trae `ncu`, así que
   `gen_coords_cobertura.py` le tiene que ADIVINAR el gateway —«el del TCU más próximo DE esa NCU»—
   y no le puede poner esclavo ninguno. Aquí entra el dato de verdad.

   ── DE DÓNDE SALE ─────────────────────────────────────────────────────────────────────────────

   Del CONTRATO del repo SCADA, que lo tiene careado contra los DOS Excel de la planta y con la
   discrepancia resuelta. Se copia aquí a la vista, como el mapa de códigos de indice_plantas.mjs,
   porque es una TRANSCRIPCIÓN de un documento y no algo que se pueda recalcular:

     · El Excel de coordenadas trae DIEZ filas REPETIDOR (1,2,3,5,6,7,8,9,10,11) con su gateway y su
       esclavo. La hoja de layout de comunicaciones trae ONCE, y su fila de totales dice
       «8 RSU / 11 repetidores»: el que falta es el 4, el de la NCU 8.
     · Regla de numeración de esclavos (Ignacio, 10/08): el primer repetidor de una NCU es el 200; si
       hay más, 201 y 202. La cumplen los diez del Excel, así que el 4 es el 200.
     · El GATEWAY del repetidor 4 es PROVISIONAL, no está en ningún Excel. Va marcado como tal y no
       se escribe en el layout — que además no lo dibuja.

   ── Y POR QUÉ SE PUEDE EMPAREJAR CON LOS 5 DEL DWG ────────────────────────────────────────────

   El DWG dibuja CINCO de los once. Para saber cuál es cuál no basta el orden: se comprueba contra
   una tercera fuente, las constantes de planta de SCADA/index.html, que traen el esclavo de cada
   repetidor y su etiqueta de CENTROS. Y esa etiqueta se puede traducir a NCU porque las HSU de esa
   misma planta traen LAS DOS COSAS: «8» es la NCU 12 y «10» es la NCU 15.

   Los cinco cuadran a la vez en NCU y en esclavo con la tabla del CONTRATO, y los dos repetidores
   que comparten la NCU 12 se distinguen por su esclavo —200 y 201— que es lo que el orden solo no
   podría decidir. El que falta de esa NCU es el del esclavo 202, en el GW2.

       node tools/reps_ncu.mjs                  informe con el careo de las tres fuentes
       node tools/reps_ncu.mjs --write          escribe gw, esclavo y sus procedencias

   NO SE INVENTA NINGUNO DE LOS SEIS QUE FALTAN. Quedan en la nota de la planta, con su NCU, gateway
   y esclavo, para quien configure el colector o los busque en campo. Meterlos en `reps` sería
   dibujar en el layout puntos cuya COORDENADA no tenemos.                                        */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');

/* La tabla del CONTRATO del SCADA, tal cual. `gw_provisional` marca el único que no es dato. */
const CONTRATO = [
  { rep: 1, ncu: 1, gw: 2, esclavo: 200 },
  { rep: 2, ncu: 4, gw: 1, esclavo: 200 },
  { rep: 3, ncu: 7, gw: 2, esclavo: 200 },
  { rep: 4, ncu: 8, gw: 1, esclavo: 200, gw_provisional: true },
  { rep: 5, ncu: 12, gw: 1, esclavo: 200 },
  { rep: 6, ncu: 12, gw: 1, esclavo: 201 },
  { rep: 7, ncu: 12, gw: 2, esclavo: 202 },
  { rep: 8, ncu: 14, gw: 1, esclavo: 200 },
  { rep: 9, ncu: 15, gw: 1, esclavo: 200 },
  { rep: 10, ncu: 16, gw: 2, esclavo: 200 },
  { rep: 11, ncu: 16, gw: 1, esclavo: 201 },
];
const FUENTE = 'CONTRATO del SCADA, careado contra los dos Excel de la planta (hoja de coordenadas y '
  + 'layout de comunicaciones). Comprobado además contra el esclavo que trae SCADA/index.html';

const SCADA_HTML = ['/home/user/SCADA/index.html', '/home/user/scada/index.html',
  new URL('../../SCADA/index.html', import.meta.url).pathname,
  new URL('../../scada/index.html', import.meta.url).pathname]
  .find(p => { try { return existsSync(p); } catch (e) { return false; } });

function constante(nombre) {
  if (!SCADA_HTML) return null;
  const h = readFileSync(SCADA_HTML, 'utf8');
  const i = h.indexOf('const ' + nombre + '={');
  if (i < 0) return null;
  let j = h.indexOf('{', i), p = 0;
  for (let k = j; k < h.length; k++) {
    if (h[k] === '{') p++;
    else if (h[k] === '}' && !--p) { try { return JSON.parse(h.slice(j, k + 1)); } catch (e) { return null; } }
  }
  return null;
}

/* ── LOS REPETIDORES DE LAS DEMAS PLANTAS ──────────────────────────────────────────────────────
   Panbianco y San Jose dibujan repetidores y no dicen de que NCU cuelgan. Se deriva igual que las
   HSU —la NCU del SEGUIDOR mas cercano— y con el MISMO umbral, porque es la misma regla y el mismo
   regimen: no hay motivo para ser mas laxo con un repetidor que con una estacion.

   Y aqui la regla SI se puede validar para repetidores, porque Ayora trae los cinco suyos con NCU
   del DWG: acierta los CINCO, con margenes de x2,14 a x14,8. Se vuelve a medir en cada pasada, y si
   alguna vez fallara, no se escribe nada.

   El umbral se queda en el de las HSU y no en el x2,14 de Ayora: bajarlo a la medida del caso mas
   justo de CINCO seria ajustar el listón a un solo dato, que es justo lo que no se hace aqui.      */
const MARGEN_MIN = 2.51;

function derivaReps(L) {
  const T = (L.trackers || []).filter(t => t.ncu != null);
  return (L.reps || []).map(r => {
    const mejor = {};
    for (const t of T) { const x = Math.hypot(r.x - t.x, r.n - t.n); if (mejor[t.ncu] == null || x < mejor[t.ncu]) mejor[t.ncu] = x; }
    const o = Object.keys(mejor).map(k => ({ n: +k, d: mejor[k] })).sort((a, b) => a.d - b.d);
    if (!o.length) return { r, sin: 'el layout no trae NCU por seguidor' };
    const margen = o[1] ? o[1].d / o[0].d : Infinity;
    return { r, gana: o[0].n, d1: o[0].d, seg: o[1] ? o[1].n : null, d2: o[1] ? o[1].d : null, margen };
  });
}

const ruta = RAIZ + 'ayora_layout.json';
const L = JSON.parse(readFileSync(ruta, 'utf8'));
const R = L.reps || [];
const S = constante('AYORA');
if (!S) { console.error('no encuentro SCADA/index.html: sin la tercera fuente no se empareja nada'); process.exit(2); }

/* El mapa centros → NCU sale de las HSU de la propia planta, que traen las dos cosas. */
const mapa = {};
(L.meteo || []).forEach((m, k) => { const gz = String((S.hsus[k] || [])[1] || ''); if (gz && m.ncu != null) mapa[gz] = m.ncu; });

console.log(`el DWG dibuja ${R.length} repetidores de los ${CONTRATO.length} que dice el Excel\n`);
console.log('REP    layout   SCADA gz   esclavo   la fila del CONTRATO           ');
let malo = 0;
const pon = [];
for (const [k, r] of R.entries()) {
  const s = S.reps[k] || [];
  const gz = String(s[1] || ''), esc = +s[4] || null;
  const fila = CONTRATO.find(c => c.ncu === r.ncu && c.esclavo === esc);
  const trad = mapa[gz];
  const etiqueta = trad == null ? `«${gz}» no sale en las HSU` : (trad === r.ncu ? `«${gz}» = NCU ${trad}` : `¡«${gz}» es la NCU ${trad}!`);
  const ok = !!fila && (trad == null || trad === r.ncu);
  if (!ok) malo++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${String(r.name).padEnd(6)} NCU ${String(r.ncu).padStart(2)}` +
    `   ${etiqueta.padEnd(26)} ${String(esc).padStart(4)}   ` +
    (fila ? `rep ${fila.rep}: NCU ${fila.ncu}, GW ${fila.gw}, esclavo ${fila.esclavo}` : 'NINGUNA cuadra en NCU y esclavo a la vez'));
  if (fila) pon.push([r, fila]);
}

const puestos = new Set(pon.map(([, f]) => f.rep));
const faltan = CONTRATO.filter(c => !puestos.has(c.rep));
console.log(`\nlos ${faltan.length} que el DWG NO dibuja:`);
for (const c of faltan) console.log(`  rep ${String(c.rep).padStart(2)}   NCU ${String(c.ncu).padStart(2)}   GW ${c.gw}${c.gw_provisional ? ' (PROVISIONAL, no está en ningún Excel)' : ''}   esclavo ${c.esclavo}`);

const NOTA = `El Excel dice ${CONTRATO.length} repetidores y el DWG dibuja ${R.length}. Los ${R.length} dibujados llevan ya su `
  + `gateway y su esclavo (${FUENTE}). Los ${faltan.length} que faltan, con su NCU/GW/esclavo, son: `
  + faltan.map(c => `NCU ${c.ncu} GW ${c.gw}${c.gw_provisional ? '(provisional)' : ''} esclavo ${c.esclavo}`).join('; ')
  + `. NO se meten en \`reps\` porque no tenemos su coordenada: dibujarlos sería inventarse dónde están. `
  + `El GW del de la NCU 8 no sale de ningún Excel; un INVENTARIO de esa NCU sobre el esclavo 200 en los dos `
  + `gateways lo resuelve en dos lecturas.`;

if (malo) { console.log(`\n${malo} repetidor(es) sin emparejar: NO se escribe nada`); process.exit(1); }

/* ── la regla, medida contra los cinco de Ayora ───────────────────────────────────────────────*/
const cal = derivaReps(L);
let aciertos = 0, masJusto = Infinity;
for (const [k, c] of cal.entries()) {
  const real = R[k].ncu;
  if (c.gana === real) { aciertos++; if (c.margen < masJusto) masJusto = c.margen; }
}
console.log(`\n· la regla del seguidor mas cercano contra los ${R.length} de Ayora: ${aciertos}/${R.length}` +
  (aciertos === R.length ? `, el mas justo a x${masJusto.toFixed(2)}` : '   ← NO se deriva nada en las demas'));

/* ── y aplicada donde falta ───────────────────────────────────────────────────────────────────*/
const otras = [];
if (aciertos === R.length) {
  for (const f of readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort()) {
    const n = f.replace('_layout.json', '');
    if (n === 'ayora') continue;
    const Y = JSON.parse(readFileSync(RAIZ + f, 'utf8'));
    const sinNcu = (Y.reps || []).filter(x => x.ncu == null);
    if (!sinNcu.length) continue;
    console.log(`\n· ${n} — ${sinNcu.length} repetidor(es) sin NCU`);
    const pon2 = [];
    for (const c of derivaReps(Y)) {
      if (c.r.ncu != null) continue;
      const m = c.margen === Infinity ? '∞' : c.margen.toFixed(2);
      if (c.sin || c.margen < MARGEN_MIN) {
        console.log(`  ··    ${String(c.r.name).padEnd(12)} NCU ${String(c.gana ?? '?').padStart(2)}? a ${Math.round(c.d1)} m, ` +
          `pero la ${c.seg} a ${Math.round(c.d2)} m (margen x${m} < x${MARGEN_MIN}): NO se escribe`);
        continue;
      }
      console.log(`  ok    ${String(c.r.name).padEnd(12)} NCU ${String(c.gana).padStart(2)}  ·  seguidor suyo a ${Math.round(c.d1)} m, ` +
        `el de la ${c.seg} a ${Math.round(c.d2)} m (margen x${m})`);
      pon2.push([c.r, c.gana, `DERIVADO, no medido: NCU del seguidor mas cercano (a ${Math.round(c.d1)} m; el de la ${c.seg}, ` +
        `a ${Math.round(c.d2)} m, margen x${m}). La regla acierta los ${R.length} repetidores de Ayora, que si traen ` +
        `NCU del DWG. Confirmar en campo`]);
    }
    console.log(`  → ${pon2.length} de ${sinNcu.length}`);
    if (WRITE && pon2.length) {
      for (const [r, ncu, origen] of pon2) { r.ncu = ncu; r.origen = origen; }
      writeFileSync(RAIZ + f, JSON.stringify(Y));
      otras.push(n);
    }
  }
}
console.log(`\nlos ${pon.length} cuadran a la vez en NCU y en esclavo con la tabla del CONTRATO`);
if (WRITE) {
  for (const [r, f] of pon) {
    r.gw = f.gw; r.esclavo = f.esclavo;
    r.origen = `campo/Excel · ${FUENTE}. Fila ${f.rep} de su tabla`;
  }
  L.reps_nota = NOTA;
  writeFileSync(ruta, JSON.stringify(L));
  console.log('→ ayora_layout.json');
  if (otras.length) console.log('→ ' + otras.join(', '));
} else console.log('(informe: nada escrito. Con --write se escribe)');
