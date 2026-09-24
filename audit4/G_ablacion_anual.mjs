/* R4 · P1 — ¿QUÉ ETAPA DE LA RUTA POR LÍNEA PRODUCE EL RETROCESO DE MÁS?
 *
 *   node audit4/G_ablacion_anual.mjs [--json=RUTA]
 *
 * [CORRECCIÓN 2026-09-24: el 17,3 % mezclaba métrica y política; en la MISMA métrica
 *  por mesa el hueco es 20,03 % (audit5/P1_1_separa_acople.mjs, audit5/REGISTRO_CORRECCIONES.md C-1).]
 * `pairwise` por línea queda un 17,3 % por debajo de la rama por mesa en el anual
 * de Ayora (D_anual_ayora), con el control `astro` en +0,17 %. Aquí se apaga UNA
 * etapa cada vez (`lib_p2_arnes.anglesLineaAblacion`) y se repite el anual de la
 * ruta por línea, con el mismo bucle, los mismos instantes y la misma banda.
 *
 * Controles, por este orden:
 *   1 · FIDELIDAD: con todo encendido, el arnés da los θ de policyAngles con
 *       diferencia 0 en cada paso, y el anual 2307,0294 de D_anual_ayora.
 *   2 · TEST NULO, antes de contar: cada etapa apagada CAMBIA el θ en el
 *       conjunto medido (21-jun y 21-dic, paso 10 min). La que no cambie nada se
 *       dice primero y su fila de energía no informa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaSimulador, terrenoComoLaPagina } from './lib_publicado.mjs';
import { anglesLineaAblacion } from './lib_p2_arnes.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_layout.json'), 'utf-8'));
const { F, VER } = cargaSimulador(ROOT, ['poaPlant', 'crearLazo', 'pairEval3D', 'pairThetaTorsion', 'pairStations',
  'driveCoupleSafe', 'repairNoShade', 'singleaxis', 'trueTrackAngle', 'rangoHaz', 'pvTilt', 'nan0', 'PASO_BUSQ']);
const { T } = terrenoComoLaPagina(F, datos, 80, 0);
const LAT = lay.clat, LON = lay.clon, ALT = datos.base, TL = 3.5, ALB = 0.2, TZ = 1, PASO = 10;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const VAR = { base: [], torsion: ['torsion'], regla: ['regla'], reparacion: ['reparacion'], drive: ['drive'], repair: ['repair'] };
const K = Object.keys(VAR);
const dest = arg('json', '');
const guarda = o => { if (dest) fs.writeFileSync(path.join(ROOT, dest), JSON.stringify({ ver: VER, ...o }, null, 1)); };

console.log(`R4 · P1 · ABLACIÓN DE LA RUTA POR LÍNEA (pairwise) · ${VER} · Ayora, banda de la página (${T.pairs.length + 1} líneas)`);
const instantes = function* (mo) {
  const ds = `2026-${String(mo + 1).padStart(2, '0')}-21`, doy = F.doyOf(ds), dia = Date.UTC(2026, mo, 21) - TZ * 3600000;
  for (let m = 0; m < 1440; m += PASO) {
    const g = F.solarPos(dia + m * 60000, LAT, LON);
    if (g.elev <= 0) continue;
    yield { g, doy, irr: F.clearskyIneichen(g.zen, doy, ALT, TL) };
  }
};

/* 2 · TEST NULO, primero */
const cambia = Object.fromEntries(K.map(k => [k, { n: 0, max: 0 }])); let tot = 0, dFid = 0;
for (const mo of [5, 11]) for (const { g, doy, irr } of instantes(mo)) {
  const pub = F.policyAngles('pairwise', g.zen, g.az, T, irr, doy, ALB).angles;
  const A = Object.fromEntries(K.map(k => [k, anglesLineaAblacion(F, T, g.zen, g.az, irr, doy, ALB, new Set(VAR[k]))]));
  for (let r = 0; r < pub.length; r++) {
    tot++; dFid = Math.max(dFid, Math.abs(A.base[r] - pub[r]));
    for (const k of K) { const d = Math.abs(A[k][r] - A.base[r]); if (d > 1e-9) cambia[k].n++; cambia[k].max = Math.max(cambia[k].max, d); }
  }
}
console.log(`\n1 · FIDELIDAD (21-jun y 21-dic) · peor |θ arnés con todo encendido − policyAngles| = ${dFid.toExponential(3)}° ${dFid === 0 ? '✓' : '✗'}`);
if (dFid !== 0) throw new Error('el arnés no reproduce la ruta publicada: la ablación no valdría');
console.log(`\n2 · TEST NULO (21-jun y 21-dic, ${tot} línea×instante) · ¿apagar la etapa cambia el θ?`);
for (const k of K.slice(1)) console.log(`  sin ${k.padEnd(10)} cambia ${String(cambia[k].n).padStart(6)} de ${tot} (${(100 * cambia[k].n / tot).toFixed(1)} %) · mayor cambio ${cambia[k].max.toFixed(4)}°${cambia[k].n ? '' : '   ⚠ NO CAMBIA NADA: su fila de energía no informa'}`);
guarda({ fidelidad_deg: dFid, test_nulo: cambia, test_nulo_total: tot, parcial: true });

/* EL ANUAL de la ruta por línea, una cadena por variante, en la MISMA pasada */
const E = Object.fromEntries(K.map(k => [k, 0])), meses = [];
const t0 = Date.now();
for (let mo = 0; mo < 12; mo++) {
  const LZ = Object.fromEntries(K.map(k => [k, F.crearLazo()])), eM = Object.fromEntries(K.map(k => [k, 0]));
  for (const { g, doy, irr } of instantes(mo)) {
    const w = (PASO / 60) / 1000 * DIM[mo];
    for (const k of K) {
      const lim = LZ[k].paso(anglesLineaAblacion(F, T, g.zen, g.az, irr, doy, ALB, new Set(VAR[k])), PASO * 60);
      eM[k] += F.poaPlant(g.zen, g.az, T, lim, irr, doy, ALB).plant * w;
    }
  }
  for (const k of K) E[k] += eM[k];
  meses.push({ mes: mo + 1, ...eM });
  console.error(`  mes ${mo + 1} · ${((Date.now() - t0) / 1000).toFixed(0)} s · ` + K.map(k => `${k} ${eM[k].toFixed(3)}`).join(' · '));
  guarda({ fidelidad_deg: dFid, test_nulo: cambia, test_nulo_total: tot, parcial: mo < 11, meses, anual: E });
}
const REF_LIN = 2307.0294, REF_MESA = 2705.1154;   // D_anual_ayora_pairwise.json: por línea y por mesa
console.log(`\n3 · ANUAL de pairwise por LÍNEA, 12/12, kWh/m² · control: base = ${REF_LIN} (D_anual_ayora) → ${E.base.toFixed(4)} ${Math.abs(E.base - REF_LIN) < 5e-5 ? '✓' : '✗'}`);
console.log(`  variante           anual      vs base      cierra del hueco línea→mesa (${REF_LIN} → ${REF_MESA})`);
for (const k of K) console.log(`  ${(k === 'base' ? 'todo encendido' : 'sin ' + k).padEnd(16)} ${E[k].toFixed(4).padStart(10)}  ${(100 * (E[k] / E.base - 1)).toFixed(3).padStart(8)} %  ${(100 * (E[k] - E.base) / (REF_MESA - REF_LIN)).toFixed(1).padStart(8)} %`);
