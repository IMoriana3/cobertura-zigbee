/* Baja de Supabase la telemetría diaria de una planta y la deja lista para el
   cruce. CÓRRELO TÚ: este contenedor tiene el proxy en denegación por defecto
   y no alcanza supabase.co — tu navegador y tu PC sí.

   Uso:
     node tools/baja_telemetria.mjs --planta elburgo --desde 2026-08-10 --hasta 2026-08-15
     node tools/baja_telemetria.mjs --sondeo          (qué plantas y días hay)

   La clave que lleva dentro es la `anon`/`publishable` de la web estática
   `factiun-cartera/importar-logs.html`: es pública por diseño —la sirve el
   navegador de cualquiera que abra esa página— y solo vale lo que la RLS de
   la tabla le deje leer. No es un secreto y no se guarda nada nuevo.

   ── Qué se baja y por qué así ─────────────────────────────────────────────
   De cada fila (una por equipo y día) interesan `series.t` (segundos desde
   las 00:00) y dentro de `series.v` solo dos campos: `angle` (dónde está el
   seguidor) y `target_angle` (lo que su control decidió). El resto de campos
   —SoC, tensiones, corrientes de motor— multiplican el tamaño por diez y no
   entran en la comparación de apuntamiento, así que se piden aparte si hacen
   falta. Se pide día a día porque un año entero de 219 TCU no cabe en una
   respuesta.

   Salida: un JSON por día, `telemetria_<planta>_<dia>.json`, con la forma que
   `tools/cruce_diagnostico.mjs` sabe leer.                                  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const A = process.argv.slice(2);
const op = (n, d) => { const i = A.indexOf(n); return i >= 0 ? A[i + 1] : d; };

const URL_BASE = process.env.SUPABASE_URL || 'https://icqiwmbbeoeswbcbgflc.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lOmQfLA1rv7Jg0N3vjzcOA_qnbatn2p';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(qs) {
  let r;
  try {
    r = await fetch(`${URL_BASE}/rest/v1/telemetria?${qs}`, { headers: H });
  } catch (e) {
    // el contenedor del agente tiene el proxy en denegación por defecto y
    // supabase.co no está permitido: decirlo en vez de escupir un stack
    console.error(`no se alcanza ${URL_BASE}: ${e && e.message}\n` +
      `Si esto corre dentro del contenedor del agente, es el proxy (denegación por defecto).\n` +
      `Córrelo en tu PC o en la máquina del SCADA, que sí llega.`);
    process.exit(3);
  }
  // el proxy contesta 403/407 al CONNECT y undici lo entrega como respuesta,
  // no como excepción: sin esto el fallo del entorno parecía un fallo de la
  // consulta, que es justo lo que confunde a quien lo corre
  if (r.status === 403 || r.status === 407) {
    console.error(`el proxy denegó la salida a ${new URL(URL_BASE).host} (HTTP ${r.status}).\n` +
      `Este contenedor va en denegación por defecto. Córrelo en tu PC o en la máquina del SCADA.`);
    process.exit(3);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

if (A.includes('--sondeo')) {
  // qué hay: plantas, clases y días, sin bajar una sola serie
  const v = await get('select=planta,ncu,clase,dia,equipo,cobertura,paso_s&limit=4000');
  const por = new Map();
  for (const x of v) {
    const k = `${x.planta} · ${x.clase}`;
    if (!por.has(k)) por.set(k, { dias: new Set(), ncus: new Set(), n: 0, cob: [] });
    const e = por.get(k);
    e.dias.add(x.dia); e.ncus.add(x.ncu); e.n++;
    if (x.cobertura != null) e.cob.push(+x.cobertura);
  }
  console.log(`${v.length} filas visibles\n`);
  for (const [k, e] of [...por].sort()) {
    const d = [...e.dias].sort();
    const c = e.cob.length ? (e.cob.reduce((a, b) => a + b, 0) / e.cob.length).toFixed(1) + '%' : '—';
    console.log(`  ${k.padEnd(28)} ${String(e.n).padStart(5)} filas · ${e.ncus.size} NCU · ` +
                `${d.length} días (${d[0]} → ${d[d.length - 1]}) · cobertura media ${c}`);
  }
  console.log('\nsi la lista sale corta, la RLS limita lo que ve esta clave: hace falta sesión.');
  process.exit(0);
}

const PLANTA = op('--planta');
const DESDE = op('--desde'), HASTA = op('--hasta', DESDE);
if (!PLANTA || !DESDE) {
  console.error('uso: node tools/baja_telemetria.mjs --planta <p> --desde AAAA-MM-DD [--hasta AAAA-MM-DD]');
  console.error('     node tools/baja_telemetria.mjs --sondeo');
  process.exit(2);
}

const dias = [];
for (let d = new Date(DESDE + 'T00:00:00Z'); d <= new Date(HASTA + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
  dias.push(d.toISOString().slice(0, 10));

const SEL = 'ncu,equipo,clase,dia,tz,paso_s,cobertura,series';
for (const dia of dias) {
  process.stdout.write(`${dia} … `);
  let v;
  try {
    v = await get(`planta=eq.${encodeURIComponent(PLANTA)}&clase=eq.tcu&dia=eq.${dia}&select=${SEL}`);
  } catch (e) { console.log(`ERROR ${e.message}`); continue; }
  if (!v.length) { console.log('sin datos'); continue; }
  // adelgazar: solo el eje de tiempos y los dos ángulos
  const out = { planta: PLANTA, dia, equipos: v.map(x => ({
    ncu: x.ncu, equipo: x.equipo, tz: x.tz, paso_s: x.paso_s, cobertura: x.cobertura,
    t: (x.series && x.series.t) || [],
    angle: (x.series && x.series.v && x.series.v.angle) || null,
    target_angle: (x.series && x.series.v && x.series.v.target_angle) || null,
  })) };
  const f = path.join(ROOT, `telemetria_${PLANTA}_${dia}.json`);
  fs.writeFileSync(f, JSON.stringify(out));
  const conObj = out.equipos.filter(e => e.target_angle && e.target_angle.length).length;
  console.log(`${out.equipos.length} equipos · ${conObj} con objetivo · ${(fs.statSync(f).size / 1e6).toFixed(1)} MB → ${path.basename(f)}`);
}
console.log('\nsúbeme esos JSON y el cruce los lee tal cual.');
