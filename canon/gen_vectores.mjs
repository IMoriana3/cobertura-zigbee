/* R4 · FASE 4.3 — LOS VECTORES DE REFERENCIA DEL BACKTRACKING, CONGELADOS
 *
 * La paridad que existe (audit2, R2) cubre DOS casos: torsión N-S toda a 0,00°
 * y UN vector concreto. Con eso no se puede decir nada de la torsión: dos
 * puntos no son una cobertura, son dos puntos.
 *
 * Estos vectores son la ENTRADA congelada del careo JS↔Python. Se generan una
 * vez, se sellan con sha256 y no se regeneran: si alguien los cambia, el hash
 * canta. Lo que NO llevan es la salida — la salida es lo que cada motor tiene
 * que producir, y meterla aquí sería congelar la respuesta junto con la
 * pregunta.
 *
 * QUÉ CUBREN, y por qué cada uno:
 *   · torsión N-S en SIETE amplitudes (0 · ±0,5 · ±1 · ±2 · ±3 · ±4 · ±6°) y
 *     tres formas (constante, quebrado, senoidal) — la paridad actual tiene dos
 *     valores y ninguna forma;
 *   · sol BAJO (elev 5° y 10°) y ALTO (45° y 70°): el backtracking sólo actúa
 *     con sol bajo, y con sol alto la pregunta es si se está quieto;
 *   · bifila RÍGIDA y QUEBRADA, que reparten el tilt de forma distinta, más
 *     monofila como control;
 *   · la PLANTA REAL de Ayora, con sus cotas y su torsión medida.
 *
 * EL SOL Y EL CIELO VAN DENTRO, como valores. Si cada motor regenerase su sol,
 * el careo compararía dos modelos de cielo en vez del backtracking, y un fallo
 * en cualquiera de los dos taparía al otro. Es la misma doctrina que el golden
 * del núcleo (`tools/gen_golden_core.py`).
 *
 * Y LOS DOS EXTREMOS DE CADA MESA VAN DENTRO, no el tilt ya calculado: el tilt
 * es una DERIVADA de las cotas y quien lo consuma tiene que poder recalcularlo
 * y discrepar. Congelar la derivada en vez del dato esconde justo el paso que
 * puede estar mal.
 *
 *     node canon/gen_vectores.mjs            (escribe canon/vectores.json + .sha256)
 */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url'; import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(sol + '\n' + html.slice(j0, i1) + `return { solarPos, clearskyIneichen, plantFromCotas,
  driveGroups, effRowTilts, nsSegments, pairsFromElev, rotulaMesas, mulberry32 };`)();
const RAD = Math.PI / 180;

/* ── el sol: instantes ELEGIDOS por elevación, no por hora ──────────────────
   Una hora fija significa elevaciones distintas según la fecha y el sitio, y
   entonces «sol bajo» quiere decir cosas distintas en cada fila de la tabla. */
const SITIO = { nm: 'Zaragoza', lat: 41.5763, lon: -0.7981, alt: 300, tl: 3.5 };
function instantePorElevacion(dia, doy, objetivo) {
  let mejor = null;
  for (let m = 0; m < 1440; m += 1) {
    const g = F.solarPos(dia + m * 60000, SITIO.lat, SITIO.lon);
    if (!(g.elev > 0)) continue;
    const d = Math.abs(g.elev - objetivo);
    if (!mejor || d < mejor.d) mejor = { d, m, g, doy };
  }
  if (!mejor || mejor.d > 0.6) return null;      // si no lo encuentra, se DICE
  const irr = F.clearskyIneichen(mejor.g.zen, doy, SITIO.alt, SITIO.tl);
  return { minuto: mejor.m, elev_objetivo: objetivo,
           sol: { zen: +mejor.g.zen.toFixed(9), az: +mejor.g.az.toFixed(9), elev: +mejor.g.elev.toFixed(9) },
           cielo: { ghi: +irr.ghi.toFixed(9), dni: +irr.dni.toFixed(9), dhi: +irr.dhi.toFixed(9) } };
}
const DIAS = [['21-jun', Date.UTC(2026, 5, 21), 172], ['21-dic', Date.UTC(2026, 11, 21), 355]];
const ELEVS = [5, 10, 45, 70];
const instantes = [];
for (const [nm, dia, doy] of DIAS)
  for (const e of ELEVS) {
    const it = instantePorElevacion(dia, doy, e);
    if (it) instantes.push(Object.assign({ dia: nm, doy }, it));
    else instantes.push({ dia: nm, doy, elev_objetivo: e, NO_EXISTE: `el ${nm} el sol no llega a ${e}° en este sitio` });
  }

/* ── las geometrías ─────────────────────────────────────────────────────── */
const nsPerfil = (forma, v, n) => {
  const out = new Array(n).fill(v);
  if (forma === 'quebrado') for (let i = 0; i < n; i++) out[i] = i < n / 2 ? v : -v;
  else if (forma === 'senoidal') for (let i = 0; i < n; i++) out[i] = v * Math.sin(2 * Math.PI * i / Math.max(3, Math.floor(n / 2)));
  return out;
};
function geomSintetica(c) {
  const n = c.nrows, pitch = 6;
  const ELEV = Array.from({ length: n }, (_, i) => -i * pitch * Math.tan(c.pendienteEO * RAD));
  const groups = F.driveGroups(n, c.drive);
  const eff = F.effRowTilts(nsPerfil(c.forma, c.amplitud, n), c.drive, groups);
  const filaLen = 2 * 28 * 1.146 + 0.55;
  const segs = F.nsSegments(n, 'alineadas', 1, filaLen, 1.0, c.drive === 'mono' ? 1 : 2);
  if (groups) for (const g of groups) if (g.length === 2) segs[g[1]] = segs[g[0]].map(s => s.slice());
  /* LA TORSIÓN POR MESA SÓLO LA PRODUCE EL QUIEBRO EN LA RÓTULA. Los perfiles
     N-S (quebrado, senoidal) varían el tilt POR LÍNEA: dos mesas de la misma
     línea siguen llevando el mismo. La primera versión de estos vectores no lo
     tenía en cuenta y su propio test nulo lo cazó — 58 geometrías con DOS
     valores de torsión, o sea ninguna cobertura sobre lo que ya había.
     Y la rótula sólo la SIGUE la bifila quebrada (cardan); rígida y monofila
     llevan el tubo recto al tilt medio. Esa diferencia también se cubre. */
  const RM = F.rotulaMesas(c.rotula ? 'rotula' : 'constante', c.rotula || c.amplitud, c.drive, segs, ELEV, groups, 0.55);
  const T = { pairs: F.pairsFromElev(ELEV, pitch, eff), cw: 2.382, axisAz: 0, maxAngle: 55,
              gcr: 2.382 / pitch, z0: 0.17, nBypass: 2, iam: 0.05, rowTilt: eff, groups,
              drive: c.drive, segs: RM ? RM.segs : segs };
  if (RM) Object.assign(T, { segTilt: RM.segTilt, segPairs: RM.segPairs, segDrive: RM.segDrive, segZ: RM.segZ });
  return T;
}
const geometrias = [];
for (const forma of ['constante', 'quebrado', 'senoidal'])
  for (const amplitud of [0, 0.5, 1, 2, 3, 4, 6])
    for (const drive of ['mono', 'bifila', 'quebrado'])
      for (const rotula of [0, 1, 2, 4]) {
      if (forma !== 'constante' && amplitud === 0) continue;          // sería la constante 0 repetida
      if (rotula && forma !== 'constante') continue;                  // una cosa cada vez: o perfil de línea, o quiebro por mesa
      const c = { nrows: 6, pendienteEO: 8, forma, amplitud, drive, rotula };
      const T = geomSintetica(c);
      geometrias.push({ id: `sint-${forma}-${amplitud}-${drive}${rotula ? '-rot' + rotula : ''}`, tipo: 'sintetica', cfg: c,
        /* LOS DOS EXTREMOS DE CADA MESA, no el tilt ya calculado */
        segs: T.segs, segTilt: T.segTilt || null, segZ: T.segZ || null,
        pairs: T.pairs.map(p => ({ slope: +p.slope.toFixed(9), pitch: +p.pitch.toFixed(9), axisTilt: +p.axisTilt.toFixed(9) })),
        rowTilt: T.rowTilt.map(v => +v.toFixed(9)),
        cw: T.cw, axisAz: T.axisAz, maxAngle: T.maxAngle, gcr: +T.gcr.toFixed(9), z0: T.z0,
        nBypass: T.nBypass, iam: T.iam, drive: T.drive, groups: T.groups });
    }
/* la PLANTA REAL, un bloque para que quepa */
{
  const P = F.plantFromCotas(JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')), 30, 0);
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    pairs.push({ slope: +(Math.atan2(P.pairDz[i], dx) * 180 / Math.PI).toFixed(9), pitch: +dx.toFixed(9),
                 axisTilt: +((P.tilt[i] + P.tilt[i + 1]) / 2).toFixed(9) });
  }
  geometrias.push({ id: 'ayora-real-30', tipo: 'real', cfg: { fuente: 'ayora_cotas.json', maxLines: 30 },
    segs: P.segs, segTilt: P.segTilt, segZ: P.segZ, pairs,
    rowTilt: P.tilt.map(v => +v.toFixed(9)), cw: P.cw, axisAz: 0, maxAngle: P.maxAngle,
    gcr: +(P.cw / P.pitch).toFixed(9), z0: 0.17, nBypass: 3, iam: 0.05, drive: P.drive, groups: P.groups });
}

/* ── TEST NULO de los propios vectores ─────────────────────────────────────
   Si todas las geometrías tuvieran la misma torsión, el conjunto no cubriría
   nada de lo que dice cubrir. */
const torsionDe = (g) => {
  if (!g.segTilt) return 0;
  let mx = 0;
  for (let r = 0; r < g.segTilt.length; r++)
    for (const v of g.segTilt[r]) mx = Math.max(mx, Math.abs(v - (g.rowTilt[r] || 0)));
  return +mx.toFixed(6);
};
const torsiones = [...new Set(geometrias.map(torsionDe))].sort((a, b) => a - b);
const nulo = {
  valores_distintos_de_torsion: torsiones.length,
  torsiones: torsiones,
  ok: torsiones.length > 2,
  por_que: 'la paridad de R2 tiene DOS valores de torsión; estos vectores tienen que tener más, o no aportan nada',
  geometrias_con_mesa: geometrias.filter(g => g.segTilt).length + ' de ' + geometrias.length,
};

const salida = {
  contrato_version: '1.0.0',
  generado_por: 'canon/gen_vectores.mjs',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(),
  motor_ver: /const VER='([^']+)'/.exec(html)[1],
  advertencia: 'ESTO ES LA ENTRADA, NO LA RESPUESTA. No lleva ángulos: los ángulos son lo que cada motor tiene que producir, y congelarlos aquí sería congelar la respuesta junto con la pregunta.',
  sitio: SITIO,
  test_nulo: nulo,
  instantes, geometrias,
};
const txt = JSON.stringify(salida, null, 1);
fs.writeFileSync(path.join(ROOT, 'canon/vectores.json'), txt);
const h = crypto.createHash('sha256').update(txt).digest('hex');
fs.writeFileSync(path.join(ROOT, 'canon/vectores.sha256'), h + '  vectores.json\n');
console.log(`vectores: ${geometrias.length} geometrías × ${instantes.filter(i => !i.NO_EXISTE).length} instantes`);
console.log(`torsión: ${torsiones.length} valores distintos — ${nulo.ok ? 'TEST NULO OK' : 'TEST NULO FALLA: no cubren más que la paridad de R2'}`);
console.log(`sha256 ${h}`);
