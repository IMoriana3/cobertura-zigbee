/* EXPORTADOR DE CONSIGNAS — la tabla de apuntamiento de una planta real, por
   SEGUIDOR y por minuto, con las claves del CONTRATO de la casa (`scada`).

   Uso:
     node tools/export_consignas.mjs --planta ayora --fecha 2026-06-21 \
          --pol pairwise --paso 5 --salida /tmp/consignas.csv

   PARA QUÉ MODELO (las dos preguntas, contestadas en el propio fichero):

   a) QUÉ MODELO genera la consigna. Por defecto, políticas GEOMÉTRICAS —
      pairwise (la canónica de TCU), true-3D, row, min-ground-light—: viven
      enteras dentro de la misión de este módulo (geometría real + sol +
      límites de hardware) y NO dependen del evaluador energético provisional.
      Los óptimos (energy-optimal, óptimo libre) se exportan igual pero salen
      marcados `asesoria=1`: su ELECCIÓN depende del POA/Martinez provisional,
      que se sustituirá por el módulo energético (ver docs, «Frontera de
      módulos»). Mientras tanto no son consigna: son propuesta.

   b) PARA QUÉ CONSUMIDOR. Las claves son las de `diagnostico_tcu`
      (scada/CONTRATO.md): `NCU` + `TCU`, con el TCU como NÚMERO dentro de su
      NCU. Esa fila ya trae del campo lo que hace el seguidor (`Tilt`) y lo que
      su propia TCU quería (`Objetivo`), así que el CSV se cruza con ella por
      (planta, ncu, tcu, fecha) y sale el MODO SOMBRA: lo que mandaríamos
      nosotros contra lo que la planta hizo — sin tocar un solo motor.

   PARA QUÉ PLANTA. Hay dos arquitecturas y cada una tiene SU entregable:
     · si la inteligencia vive en la TCU (cada seguidor calcula su ángulo con
       la pendiente que lleva configurada), lo que hace falta es la FICHA de
       registros — `tools/export_config_tcu.mjs`, que escribe 41098/41100/
       41102/41104 y los vanos;
     · si vive en la NCU (alguien calcula el ángulo por seguidor y lo manda),
       lo que hace falta es ESTA tabla. Es el caso de El Burgo, cuya plantilla
       de TCU lleva `slope = 0` justamente porque la TCU no calcula nada.
   Confundirlas no es un matiz: escribir pendientes en una planta que no las
   usa no hace nada, y mandar consignas a una que las calcula sola, tampoco.

   CONFIRMADO CON EL PRIMER VOLCADO REAL (Ayora, 2026-08-26):
     · el nº de TCU es el RANGO del seguidor dentro de su NCU. NO se toma del
       número del `id` del layout: ese id no codifica la NCU («TK 045-06» tiene
       ncu=9) y su número no reinicia en 1 en todas. Con el número del id se
       apareaban 591 de 748; con el rango, 748.
     · el SIGNO: **θ<0 = ESTE**, o sea que la columna que casa con `Objetivo`
       es `theta_tcu_deg`. Medido sobre 743 seguidores: mediana 0,33° y máximo
       0,55° contra el diagnóstico. Se siguen emitiendo las dos columnas por
       trazabilidad. (Texto histórico, ya resuelto:)
     · el SIGNO. Se emiten DOS columnas: `theta_sim_deg` (marco interno del
       simulador) y `theta_tcu_deg` (convención de presentación TCU, θ<0 =
       este). Cuál de las dos casa con el registro `Objetivo` se decide con una
       lectura, no aquí.                                                      */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PLANTA = arg('planta', 'ayora');
const FECHA = arg('fecha', '2026-06-21');
const PASO = Math.max(1, +arg('paso', 5));
const POLS = arg('pol', 'pairwise').split(',').map(s => s.trim()).filter(Boolean);
const SALIDA = arg('salida', `/tmp/consignas_${PLANTA}_${FECHA}.csv`);
const GEOMETRICAS = new Set(['pairwise', 'true3d', 'row', 'mgl', 'astro', 'global', 'bt2d']);

const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8');
const F = new Function(_sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) + `
  return { solarPos, clearskyIneichen, policyAngles, poaPlant, plantFromCotas, slewLimit };`)();
const VER = (html.match(/const VER='([^']+)'/) || [, '?'])[1];

// ── planta real: cotas (geometría) + layout (identidad: NCU/TCU) ────────────
const cotas = JSON.parse(fs.readFileSync(path.join(ROOT, `${PLANTA}_cotas.json`), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, `${PLANTA}_layout.json`), 'utf-8'));
if (lay.trackers.length !== cotas.t.length)
  throw new Error(`layout ${lay.trackers.length} ≠ cotas ${cotas.t.length}: el orden 1:1 es la base del cruce`);
// La planta se parte SOLA en bloques por los huecos de x (caminos): el modelo
// de una banda no cubre el parque entero, así que se recorre bloque a bloque.
// Cada bloque es una planta completa a efectos de física (sus filas, sus
// parejas, su terreno) — y ningún seguidor se queda sin consigna.
const sonda = F.plantFromCotas(cotas, 500, 0);
const NBLOQUES = (sonda.blocks || [{ i: 0 }]).length;
const BLOQUES = [];
for (let b = 0; b < NBLOQUES; b++) {
  let P;
  try { P = F.plantFromCotas(cotas, 500, b); } catch (e) { continue; }
  if (!P.lineX || P.lineX.length < 2) continue;
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  BLOQUES.push({ b, P,
    T: { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
         nBypass: 3, rowTilt: P.tilt, groups: P.groups, drive: P.drive || 'bifila', segs: P.segs, real: P } });
}
if (!BLOQUES.length) throw new Error('la planta no produce ningún bloque modelable');

// cada SEGUIDOR del layout ↔ (bloque, línea) por x: un tracker bifila ocupa DOS
// líneas y la consigna es la de su MOTORA (la gemela va soldada al mismo eje)
const SEG = [];
let fuera = 0;
for (let i = 0; i < lay.trackers.length; i++) {
  const tk = lay.trackers[i], f = cotas.t[i].f || [];
  const xs = f.map(a => a.x).filter(v => isFinite(v));
  if (!xs.length) { fuera++; continue; }
  const x0 = Math.min(...xs);
  // OJO: lineX va RECENTRADO a 0 en cada bloque; la x cruda es xFrom + lineX
  let mejor = null, dMin = Infinity;
  for (const B of BLOQUES) for (let r = 0; r < B.P.lineX.length; r++) {
    const e = Math.abs(B.P.xFrom + B.P.lineX[r] - x0);
    if (e < dMin) { dMin = e; mejor = { B, r }; }
  }
  if (!mejor || dMin > (sonda.pitch || 6) / 2) { fuera++; continue; }   // misma tolerancia que el clúster
  const m = String(tk.id || '').match(/(\d+)/);
  SEG.push({ id: tk.id, ncu: String(tk.ncu), nnn: m ? +m[1] : NaN, gw: tk.gw,
             bloque: mejor.B.b, fila: mejor.r });
}
/* El nº de TCU es el RANGO del seguidor dentro de su NCU, no el número del id.
   El id NO codifica la NCU («TK 045-06» tiene ncu=9) y su número no reinicia
   en 1 en todas ellas (en Ayora, NCU9 va de 45 a 85). Tomarlo del id apareja
   mal 157 de 748 seguidores en cinco NCUs — y una consigna con el TCU
   equivocado se le manda a OTRO seguidor. Cazado al cruzar el primer volcado
   real de Ayora (2026-08-26); ver tools/cruce_diagnostico.mjs. */
{
  const porNcu = new Map();
  for (const s2 of SEG) { if (!porNcu.has(s2.ncu)) porNcu.set(s2.ncu, []); porNcu.get(s2.ncu).push(s2); }
  for (const [, v] of porNcu) {
    v.sort((a, b) => a.nnn - b.nnn);
    v.forEach((s2, i) => { s2.tcu = i + 1; });
  }
}
const nLineasTot = BLOQUES.reduce((s2, B) => s2 + B.P.lineX.length, 0);

// ── día: huso de la planta (misma regla que la página) ──────────────────────
const huso = lay.tzFijo != null ? lay.tzFijo / 60
  : (() => { const d = new Date(FECHA + 'T12:00:00');
             const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
             return (doy >= 88 && doy <= 298) ? 2 : 1; })();
const [Y, M, D] = FECHA.split('-').map(Number);
const day0 = Date.UTC(Y, M - 1, D, 0, 0, 0) - huso * 3600000;   // 00:00 LOCAL en ms UTC
const doy = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(Y, 0, 1)) / 86400000) + 1;
const LAT = cotas.lat != null ? cotas.lat : (lay.clat != null ? lay.clat : 39.1182081);
const LON = cotas.lon != null ? cotas.lon : (lay.clon != null ? lay.clon : -1.1598527);
const ALT = 739, TL = 3.5, ALB = 0.20, TH_DISP = -1;

const filas = [];
const resumen = {};
for (const pol of POLS) {
  let nPasos = 0, sombraAcum = 0, nSombra = 0;
  const prev = new Map();                            // consigna anterior POR BLOQUE (slew)
  for (let mm = 0; mm < 1440; mm += PASO) {
    const g = F.solarPos(day0 + mm * 60000, LAT, LON);
    const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
    const diurno = g.elev > 0;
    const hh = String(Math.floor(mm / 60)).padStart(2, '0'), mi = String(mm % 60).padStart(2, '0');
    const angDe = new Map(), shDe = new Map();
    for (const B of BLOQUES) {
      const o = F.policyAngles(pol, g.zen, g.az, B.T, irr, doy, ALB);
      // la consigna que la planta puede EJECUTAR: limitada por el actuador
      const ang = F.slewLimit(prev.get(B.b) || null, o.angles, PASO * 60);
      prev.set(B.b, ang);
      if (!diurno) continue;
      angDe.set(B.b, ang);
      shDe.set(B.b, F.poaPlant(g.zen, g.az, B.T, ang, irr, doy, ALB).shade);
    }
    if (!diurno) continue;                           // de noche no se manda nada
    nPasos++;
    for (const s2 of SEG) {
      const ang = angDe.get(s2.bloque), sh = shDe.get(s2.bloque);
      if (!ang) continue;
      const th = ang[s2.fila], sPl = sh.pl ? sh.pl[s2.fila] : null;
      sombraAcum += sh[s2.fila]; nSombra++;
      filas.push([PLANTA, FECHA, `${hh}:${mi}`, s2.ncu, s2.tcu == null ? '' : s2.tcu, s2.id,
        s2.bloque, s2.fila, pol, th.toFixed(3), (TH_DISP * th).toFixed(3),
        (100 * sh[s2.fila]).toFixed(2), sPl != null ? (100 * Math.max(0, sh[s2.fila] - sPl)).toFixed(2) : '',
        GEOMETRICAS.has(pol) ? 0 : 1].join(','));
    }
  }
  resumen[pol] = { pasos: nPasos, sombraMediaPct: nSombra ? 100 * sombraAcum / nSombra : 0,
                   asesoria: !GEOMETRICAS.has(pol) };
}

const cab = 'planta,fecha_local,hora_local,ncu,tcu,tracker,bloque,linea,politica,' +
            'theta_sim_deg,theta_tcu_deg,sombra_fila_pct,sombra_estructura_pct,asesoria';
fs.writeFileSync(SALIDA, cab + '\n' + filas.join('\n') + '\n');
const meta = {
  generado_por: `backtracking.html ${VER} · tools/export_consignas.mjs`,
  planta: PLANTA, fecha_local: FECHA, huso_utc: huso, paso_min: PASO,
  politicas: POLS, seguidores: SEG.length, seguidores_fuera_del_modelo: fuera,
  bloques: BLOQUES.length, lineas_modelo: nLineasTot, filas: filas.length,
  claves_cruce: 'CONTRATO de scada · diagnostico_tcu: (planta, NCU, TCU) + fecha',
  convenciones: {
    theta_sim_deg: 'marco interno del simulador',
    theta_tcu_deg: 'presentación TCU: θ<0 = este (TH_DISP=-1). CUÁL casa con el registro Objetivo se confirma con una lectura real',
    consigna: 'ya limitada por la velocidad del actuador (slewLimit)',
    bifila: 'la consigna es la de la línea MOTORA; la gemela va soldada al mismo eje',
  },
  declarado: {
    asesoria: 'las políticas de optimización dependen del evaluador POA/eléctrico PROVISIONAL: son propuesta, no consigna, hasta que exista el módulo energético y la validación contra SCADA',
    meteo: 'cielo claro (Ineichen), sin TMY ni pérdidas de planta',
  },
  resumen,
};
fs.writeFileSync(SALIDA.replace(/\.csv$/, '') + '.meta.json', JSON.stringify(meta, null, 2));

console.log(`consignas → ${SALIDA}`);
console.log(`  planta ${PLANTA} · ${FECHA} (UTC${huso >= 0 ? '+' : ''}${huso}) · paso ${PASO} min · ${VER}`);
console.log(`  ${SEG.length} seguidores · ${BLOQUES.length} bloques · ${nLineasTot} líneas` + (fuera ? ` · ${fuera} sin línea (declarado)` : ''));
console.log(`  ${filas.length} filas · políticas: ${POLS.join(', ')}`);
for (const [k, v] of Object.entries(resumen))
  console.log(`   · ${k.padEnd(9)} ${v.pasos} pasos diurnos · sombra media de planta ${v.sombraMediaPct.toFixed(2)}%` + (v.asesoria ? '  [ASESORÍA: depende del evaluador provisional]' : ''));
