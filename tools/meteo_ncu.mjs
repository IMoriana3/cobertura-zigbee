/* DE QUÉ NCU CUELGA CADA HSU, y con qué autoridad lo sabemos.

   El careo de `plants.yml` del SCADA (tools/test_plants_yml.py, en el repo SCADA) compara el
   `hsu_count` declarado contra `meteo[].ncu` del layout. Es lo que cazó un `hsu_count` corto en El
   Burgo que dejaba TRES DE CUATRO estaciones sin leer. Para que ese careo sirva en más plantas hace
   falta el campo, y para que no MIENTA hace falta saber de dónde sale cada valor. Por eso cada HSU
   escrita lleva también `ncu_origen`.

   TRES PROCEDENCIAS, de más a menos autoridad:

     campo     El Burgo. Sale de los .bat de Sunner y del registro real de la malla, comprobado.
               Este fichero NO lo toca; solo le pone la etiqueta.
     nombre    Benante y Panbianco. El DWG las llama «HSU 03-02», «HSU 12-06»…, y ese primer número
               es la NCU. Se corrobora con la geometría antes de escribir (ver más abajo).
     única     Bagnarelli, Fayón, Túnez. Una sola NCU en la planta: la estación cuelga de ella porque
               no hay otra. No se deduce nada, se constata.
     derivado  Ayora, San José, Páramo, El Polvorín. Sus HSU van numeradas seguidas —«HSU 1 (US)»…—
               y el nombre no dice la NCU. Aquí SÍ se infiere, y con cuentas. Sigue leyendo.

   ── POR QUÉ LA REGLA ES «EL SEGUIDOR MÁS CERCANO» Y NO «LA NCU MÁS CERCANA» ────────────────────

   Lo obvio sería asignar cada HSU a la NCU que tenga más cerca. Se probó contra los 14 casos que ya
   conocemos —los 4 de El Burgo por campo, los 10 de Benante y Panbianco por nombre— y FALLA UNO: la
   HSU 3 de El Burgo está a 280 m de la NCU 1 y a 357 m de la NCU 2, y cuelga de la 2.

   La regla que acierta las 14 es la NCU del SEGUIDOR más cercano, que además es la que tiene sentido
   físico: la estación se asocia a la malla que la rodea, no al armario que le queda a tiro de regla.

       NCU más cercana ................. 13/14
       NCU del seguidor más cercano .... 14/14   ← ésta
       mayoría de los 10 más cercanos .. 13/14   (falla el mismo caso)

   ── Y POR QUÉ NO SE ESCRIBE SIEMPRE ───────────────────────────────────────────────────────────

   14 de 14 no autoriza a escribirla en cualquier sitio: autoriza a escribirla DONDE SE PARECE a los
   casos con los que se validó. Los 14 tienen el seguidor de la segunda NCU candidata a más del doble
   de distancia; el más justo es x2,51. Por debajo de ahí la regla no está probada, así que no se
   escribe y se dice cuál queda pendiente. En Ayora eso deja fuera una —la HSU 1, con la NCU 2 a 71 m
   y la NCU 1 a 74 m, que es cara o cruz— y en San José, cinco de ocho.

   Un umbral ajustado a los datos que lo justifican es un umbral honesto solo si se dice que lo es:
   con 14 casos no hay para más, y si mañana aparece el dato de campo de otra planta, este número se
   vuelve a mirar en vez de heredarse.

       node tools/meteo_ncu.mjs                  informe con los márgenes
       node tools/meteo_ncu.mjs --write          escribe meteo[].ncu y meteo[].ncu_origen
       node tools/meteo_ncu.mjs --calibra        vuelve a medir las reglas contra los casos conocidos

   LO QUE NO SE ESCRIBE NUNCA AQUÍ: `gw` y `esclavo`. En El Burgo hay DOS estaciones por NCU, una por
   gateway, y el reparto 230/231 se comprobó en campo. En las demás hay UNA por NCU: nada en el plano
   distingue gateway, y sin gateway el esclavo sería inventarse el direccionamiento de la malla.    */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const WRITE = process.argv.includes('--write');
const CALIBRA = process.argv.includes('--calibra');
const PLANTAS = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* El margen del caso más justo de los 14 conocidos. Ver la cabecera: no es un número redondo
   elegido a ojo, es el punto hasta donde la regla está comprobada. */
const MARGEN_MIN = 2.51;

/* Plantas cuya NCU por HSU viene de fuera de este fichero. Escrito a la vista, como el mapa de
   códigos de indice_plantas.mjs: es una DECISIÓN sobre la procedencia, no un dato del layout. */
const ORIGEN_EXTERNO = {
  elburgo: 'campo · .bat de Sunner y registro real de la malla, comprobado. Cada NCU tiene DOS HSU, una por gateway (230/231)',
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.n - b.n);
const numNCU = c => { const m = /(\d+)/.exec(String(c.name || '')); return m ? +m[1] : null; };
/* «HSU 03-02» -> 3. También traga «HSU3-2». Lo que no lleve los dos números se queda fuera. */
const ncuDelNombre = s => { const m = /(\d+)\s*-\s*(\d+)/.exec(String(s || '')); return m ? +m[1] : null; };

/* La NCU del seguidor más cercano, y a qué distancia queda el seguidor de la siguiente candidata. */
function porSeguidor(m, L) {
  const mejor = {};
  for (const t of L.trackers || []) {
    if (t.ncu == null) continue;
    const x = dist(m, t);
    if (mejor[t.ncu] == null || x < mejor[t.ncu]) mejor[t.ncu] = x;
  }
  const o = Object.keys(mejor).map(k => ({ n: +k, d: mejor[k] })).sort((a, b) => a.d - b.d);
  if (!o.length) return null;
  return { gana: o[0].n, d1: o[0].d, seg: o[1] ? o[1].n : null, d2: o[1] ? o[1].d : null,
           margen: o[1] ? o[1].d / o[0].d : Infinity };
}

const nombres = PLANTAS.length ? PLANTAS
  : readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort().map(x => x.replace('_layout.json', ''));

/* ── --calibra: las reglas contra los casos que ya sabemos ─────────────────────────────────────*/
if (CALIBRA) {
  const casos = [];
  for (const n of nombres) {
    const L = JSON.parse(readFileSync(RAIZ + n + '_layout.json', 'utf8'));
    for (const m of L.meteo || []) if (m.ncu != null) casos.push({ n, L, m });
  }
  const reglas = {
    'NCU más cercana': (m, L) => {
      const o = (L.ncus || []).map(c => ({ n: numNCU(c), d: dist(m, c) })).sort((a, b) => a.d - b.d);
      return o.length ? o[0].n : null;
    },
    'NCU del seguidor más cercano': (m, L) => (porSeguidor(m, L) || {}).gana ?? null,
  };
  console.log(`calibración contra ${casos.length} caso(s) con NCU ya conocida\n`);
  for (const [nom, f] of Object.entries(reglas)) {
    const mal = casos.filter(c => f(c.m, c.L) !== c.m.ncu);
    console.log(`  ${nom.padEnd(30)} ${casos.length - mal.length}/${casos.length}   ` +
      (mal.map(c => `${c.n} ${c.m.name}: dice ${f(c.m, c.L)} y es ${c.m.ncu}`).join('; ') || '—'));
  }
  const margenes = casos.map(c => (porSeguidor(c.m, c.L) || {}).margen).filter(x => isFinite(x));
  if (margenes.length) console.log(`\n  margen del caso más justo: x${Math.min(...margenes).toFixed(2)}` +
    `   ·   el umbral de este fichero está en x${MARGEN_MIN}`);
  process.exit(0);
}

/* ── el barrido ────────────────────────────────────────────────────────────────────────────────*/
let escritas = 0, pendientes = [];
for (const n of nombres) {
  const ruta = RAIZ + n + '_layout.json';
  const L = JSON.parse(readFileSync(ruta, 'utf8'));
  const M = L.meteo || [], C = L.ncus || [];
  if (!M.length || !C.length) continue;

  console.log(`\n· ${n} — ${M.length} HSU, ${C.length} NCU`);
  const pon = [];                       // [meteo, ncu, origen] a escribir si la planta entera cuadra
  let corta = false;

  for (const m of M) {
    const nom = String(m.name).padEnd(16);
    const s = porSeguidor(m, L);
    const margen = s ? `margen x${s.margen === Infinity ? '∞' : s.margen.toFixed(2)}` : 'sin seguidores con NCU';

    /* 1 · procedencia externa: no se toca el valor, solo se etiqueta */
    if (ORIGEN_EXTERNO[n]) {
      if (m.ncu == null) { console.log(`  ??    ${nom} ${n} está declarada de procedencia externa y esta HSU no trae ncu`); continue; }
      const cuadra = s && s.gana === m.ncu;
      console.log(`  ${cuadra ? 'ok   ' : '??   '} ${nom} NCU ${String(m.ncu).padStart(2)} de campo` +
        (s ? `  ·  el seguidor más cercano es de la ${s.gana} (${margen})` : ''));
      pon.push([m, m.ncu, ORIGEN_EXTERNO[n]]);
      continue;
    }

    /* 2 · el nombre lo dice, y la geometría lo corrobora */
    const delNombre = ncuDelNombre(m.name);
    if (delNombre != null) {
      const cerca = C.map(c => ({ n: numNCU(c), d: dist(m, c) })).sort((a, b) => a.d - b.d)[0];
      const ok = cerca && cerca.n === delNombre;
      console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${nom} el nombre dice NCU ${String(delNombre).padStart(2)}` +
        `  ·  la NCU más cercana es la ${cerca.n} a ${Math.round(cerca.d)} m`);
      if (!ok) { corta = true; continue; }
      pon.push([m, delNombre, `nombre del DWG «${m.name}», corroborado con la geometría: la NCU ${delNombre} es también la más cercana, a ${Math.round(cerca.d)} m`]);
      continue;
    }

    /* 3 · una sola NCU en la planta: no hay de dónde elegir */
    if (C.length === 1) {
      const u = numNCU(C[0]) ?? 1;
      console.log(`  ok    ${nom} NCU ${String(u).padStart(2)}  ·  es la única de la planta`);
      pon.push([m, u, `única NCU de la planta («${C[0].name}»): no se deduce, se constata`]);
      continue;
    }

    /* 4 · derivado, y solo dentro del régimen donde la regla está validada */
    if (!s) { console.log(`  ??    ${nom} el layout no trae NCU por seguidor: no se puede derivar`); continue; }
    if (s.margen < MARGEN_MIN) {
      console.log(`  ··    ${nom} NCU ${String(s.gana).padStart(2)}? a ${Math.round(s.d1)} m, pero la ${s.seg} está a ${Math.round(s.d2)} m` +
        ` (${margen} < x${MARGEN_MIN}): NO se escribe, queda para confirmar en campo`);
      pendientes.push(`${n} ${m.name} (¿${s.gana} o ${s.seg}?, ${margen})`);
      continue;
    }
    console.log(`  ok    ${nom} NCU ${String(s.gana).padStart(2)}  ·  seguidor suyo a ${Math.round(s.d1)} m, ` +
      `el de la ${s.seg} a ${Math.round(s.d2)} m (${margen})`);
    pon.push([m, s.gana, `DERIVADO, no medido: NCU del seguidor más cercano (a ${Math.round(s.d1)} m; ` +
      `el de la ${s.seg}, a ${Math.round(s.d2)} m, ${margen}). Regla validada 14/14 contra El Burgo, ` +
      `Benante y Panbianco. Confirmar en campo`]);
  }

  if (corta) { console.log(`  → el nombre y el plano no dicen lo mismo: NO se escribe nada de ${n}`); continue; }

  /* DOS HSU EN LA MISMA NCU no es un error —El Burgo tiene dos por NCU, una por gateway— pero en una
     planta que va a UNA por NCU sí es una señal de que la derivación puede estar torcida. Se dice, y
     se deja escrito: quien lo confirme en campo sabe por dónde empezar. */
  const reparto = {};
  for (const [, ncu] of pon) reparto[ncu] = (reparto[ncu] || 0) + 1;
  const repes = Object.keys(reparto).filter(k => reparto[k] > 1);
  if (repes.length && !ORIGEN_EXTERNO[n] && C.length > 1) console.log(`  ojo   ${repes.map(k => `${reparto[k]} HSU salen de la NCU ${k}`).join('; ')}` +
    `. En El Burgo eso es lo normal —una por gateway—, pero aquí conviene mirarlo`);

  console.log(`  → ${pon.length} de ${M.length}` + (pon.length < M.length ? `, el resto sin escribir` : ''));
  if (WRITE && pon.length) {
    for (const [m, ncu, origen] of pon) { m.ncu = ncu; m.ncu_origen = origen; }
    writeFileSync(ruta, JSON.stringify(L));
    escritas++;
  }
}

if (pendientes.length) console.log(`\npor confirmar en campo (${pendientes.length}):\n  ` + pendientes.join('\n  '));
console.log(WRITE ? `\n→ ${escritas} layout(s) escritos` : '\n(informe: nada escrito. Con --write se escribe)');
