/* audit2/lib_motor.mjs — extrae la FÍSICA PURA de un commit dado y la devuelve
   ejecutable en Node. No modifica nada del repo: usa `git show <sha>:<ruta>`.
   Uso:  import { motorDe, echo } from './lib_motor.mjs';
         const F = motorDe('3a57451');                                        */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const leeDe = (sha, rel) => execFileSync('git', ['show', `${sha}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf-8');

export const EXPORTA = ['policyAngles','anglesPairwise','anglesPairwiseRaw','anglesAstro','anglesRow','anglesGlobal',
  'anglesBt2d','anglesTrue3d','anglesMinGroundLight','anglesOptimal','anglesOptimalFree','driveCoupleSafe','applyDrive',
  'repairNoShade','poaPlant','poaPlantSeg','poaRow','shadeBand3DAll','shadeRows','shadeRows25','solarPos','clearskyIneichen',
  'pairsFromElev','mulberry32','mvPara','elecLoss','rowTiltAt','trueTrackAngle','rangosUnidad','tangentResidualMm',
  'axialCoverage','bt3dPairMaxMag','groundLightFrac','pairShade25','surfaceOrient','pvTilt','singleaxis','VER',
  'OPT_FRACTIONS','OPT_REFINA','OPTFREE_F0','OPTFREE_NF','PASO_BUSQ','E_EMPATE_W','DEADBAND_DEG','TRACKER_SLEW'];

export function motorDe(sha) {
  const html = leeDe(sha, 'backtracking.html');
  const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
  if (i0 < 0 || i1 < 0) throw new Error(`sin delimitadores de FÍSICA PURA en ${sha}`);
  const j0 = html.lastIndexOf('/*', i0);
  const sol = leeDe(sha, 'sol.js') + '\n' + leeDe(sha, 'irradiancia.js');
  const dev = EXPORTA.map(n => `typeof ${n}!=='undefined'?${n}:undefined`).join(',');
  const F = new Function(sol + '\n' + html.slice(j0, i1) + `return [${dev}];`)();
  const o = {}; EXPORTA.forEach((n, i) => { o[n] = F[i]; });
  o.__sha = sha; o.__html = html;
  return o;
}

/* Los parámetros CANÓNICOS del encargo, en un solo sitio. */
export const CANON = {
  lat: 41.57634, lon: -0.79814, alt: 739,
  tl: 3.5, albedo: 0.20, nubes: 0,
  nR: 6, pitch: 6.00, cw: 2.382, z0: 0.17, maxAngle: 55,
  axisAz: 0, nBypass: 2, iam: 0.05,
  instanteUTC: Date.UTC(2026, 5, 21, 5, 30), doy: 172, tz: 2,
};

/* caso A (pendiente 8°, tilt N-S 0) y caso B (+ tilt aleatorio amp 4, semilla 1234) */
export function caso(F, cual, nR = CANON.nR) {
  const RAD = Math.PI / 180, L = 2 * 28 * 1.146 + 0.55;
  const r = F.mulberry32(1234); const tilts = [];
  for (let i = 0; i < nR; i++) tilts.push(cual === 'B' ? (r() * 2 - 1) * 4 : 0);
  const ELEV = []; for (let i = 0; i < nR; i++) ELEV.push(-i * CANON.pitch * Math.tan(8 * RAD));
  const segs = []; for (let i = 0; i < nR; i++) segs.push([[-L / 2, L / 2]]);
  return { pairs: F.pairsFromElev(ELEV, CANON.pitch, tilts), cw: CANON.cw, axisAz: CANON.axisAz,
           maxAngle: CANON.maxAngle, gcr: CANON.cw / CANON.pitch, z0: CANON.z0, nBypass: CANON.nBypass,
           iam: CANON.iam, rowTilt: tilts, groups: null, drive: 'mono', segs };
}

/* El ECHO obligatorio: todos los parámetros tal como se usan, el commit y Node. */
export function echo(titulo, F, T, extra = {}) {
  const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
  const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);
  const L = [];
  L.push('════ ' + titulo + ' ════');
  L.push(`commit        ${F.__sha}   ·   VER en el fichero: ${F.VER}`);
  L.push(`node          ${process.version}`);
  L.push(`sitio         lat ${CANON.lat}  lon ${CANON.lon}  alt ${CANON.alt} m`);
  L.push(`cielo         TL ${CANON.tl}  albedo ${CANON.albedo}  nubes ${CANON.nubes}  ·  ghi ${irr.ghi.toFixed(3)} dni ${irr.dni.toFixed(3)} dhi ${irr.dhi.toFixed(3)}`);
  L.push(`geometría     ${T.pairs.length + 1} filas · pitch ${CANON.pitch} · cuerda ${T.cw} · z0 ${T.z0} · ±${T.maxAngle}° · axisAz ${T.axisAz} · nb ${T.nBypass} · b0 ${T.iam}`);
  L.push(`tilt N-S      ${T.rowTilt.map(v => v.toFixed(2)).join(' / ')}`);
  L.push(`instante      ${new Date(CANON.instanteUTC).toISOString()}  (07:30 local, tz +${CANON.tz})  ·  sol elev ${g.elev.toFixed(3)}° az ${g.az.toFixed(3)}° zen ${g.zen.toFixed(3)}°`);
  // mvPara no existe antes de v1.57 (estaciones adaptativas): se declara en vez de romper
  const mv = (typeof F.mvPara === 'function') ? F.mvPara(T, g.zen) : 'NO EXISTE mvPara en este commit (MV fijo en el contador)';
  L.push(`MV efectivo   ${mv}` + (extra.mv != null ? `  (forzado a ${extra.mv})` : ''));
  for (const k in extra) if (k !== 'mv') L.push(`${k.padEnd(13)} ${extra[k]}`);
  L.push('─'.repeat(70));
  return { texto: L.join('\n'), g, irr };
}
