/* R4 · FASE 1 — EL VETO DE `optimal` PUNTÚA CON LA MÉTRICA QUE SE COBRA
 *
 * Hasta la v1.75 `anglesOptimal` buscaba y vetaba con `poaPlant` —por LÍNEA—
 * y en una planta con cotas se le cobraba con `poaPlantSeg` —por MESA—. Medido
 * en R3 fase 1 (audit3/out/F1_seg_metrica.json, Ayora real, 21-jun, 86
 * instantes con haz): `optimal` no perdía NUNCA por su propia métrica —0 de
 * 86— y perdía por la publicada en 58 de 86, con el día en −0,5103 %. El
 * control sin torsión lo dejó claro: el defecto NO es la geometría quebrada,
 * es que el veto comprueba con una regla distinta de la que cobra.
 *
 * Desde la v1.76 manda `anglesOptimalSeg`: extremos del huso por mesa —los que
 * `pairwise` y `astro` PUBLICAN—, acoplado con el accionamiento real
 * (`T.segDrive`), y toda puntuación con `poaPlantSeg`.
 *
 * QUÉ HACE ESTE BANCO DISTINTO DE UNO INGENUO
 *   · El TEST NULO va primero, y son dos: que la planta de prueba TENGA torsión
 *     y que las dos métricas DIFIERAN en ella. Sin las dos, la comprobación de
 *     abajo pasaría igual con el código roto y no protegería nada.
 *   · El CONTROL NEGATIVO no es una opinión sobre el código: reconstruye
 *     `anglesOptimalSeg` desde la fuente de la página con UNA sustitución —el
 *     marcador vuelve a `poaPlant`— y EXIGE que la comprobación 5 se ponga
 *     roja. Si no se pone roja, el banco no distingue nada y se dice así.
 *
 * Sin navegador: el bloque FÍSICA PURA se ejecuta en Node, y la geometría sale
 * de `plantFromCotas` sobre `ayora_cotas.json`, que ya trae `segTilt`,
 * `segPairs` y `segDrive`.
 *
 *     node tools/test_veto_por_mesa.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');

let N = 0, FAIL = 0;
const t = (n, f) => { N++; try { f(); console.log('  ✓ ' + n); }
  catch (e) { FAIL++; console.error('  ✗ ' + n + ' — ' + e.message); } };

/* el cuerpo EXACTO de una función, contando llaves y sin tragarse comentarios
   (la misma cautela que `cuerpoFn` del banco de física, que ya falló dos veces
   buscando «hasta el siguiente function») */
function cuerpoFn(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let n = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}
/* quita // y comentarios de bloque: contar MENCIONES en vez de LLAMADAS ya dio
   8 donde hay 6, porque el comentario que documenta el defecto nombra las dos
   funciones (R4, error E-X1 19) */
function sinComentarios(s) {
  let o = '', i = 0, b = false;
  while (i < s.length) {
    if (b) { if (s[i] === '*' && s[i + 1] === '/') { b = false; i += 2; } else i++; continue; }
    if (s[i] === '/' && s[i + 1] === '*') { b = true; i += 2; continue; }
    if (s[i] === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); if (j < 0) break; i = j; continue; }
    o += s[i++];
  }
  return o;
}

// ── el bloque de física, ejecutado de verdad ────────────────────────────────
const i0 = html.indexOf('FÍSICA PURA');
const i1 = html.lastIndexOf('/* FIN-FÍSICA');
if (i0 < 0 || i1 < 0) { console.error('no encuentro los delimitadores FÍSICA PURA / FIN-FÍSICA'); process.exit(1); }
const src = html.slice(html.lastIndexOf('/*', i0), i1);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n'
          + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const EXPORTA = `return { plantFromCotas, solarPos, clearskyIneichen, poaPlant, poaPlantSeg,
  anglesPairwiseSeg, anglesAstroSeg, applyDriveSeg, policyAnglesSeg, segLineMean, segTiltAt,
  anglesOptimal, anglesOptimalSeg, anglesOptimalFreeSeg, rowTiltAt, E_EMPATE_W,
  OPT_FRACTIONS, OPT_REFINA, OPT_HISTERESIS, OPT_DF_MAX };`;
const F = new Function(sol + '\n' + src + '\n' + EXPORTA)();

// ── la planta de prueba: Ayora con sus cotas, que es donde hay torsión ──────
const P = F.plantFromCotas(JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8')), 500, 0);
const pairs = [];
for (let i = 0; i < P.lineX.length - 1; i++) {
  const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
  pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
}
const T = { pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
            nBypass: 3, rowTilt: P.tilt, groups: P.groups, drive: P.drive, segs: P.segs,
            segTilt: P.segTilt, segPairs: P.segPairs, segDrive: P.segDrive, segZ: P.segZ,
            segSide: P.segSide, segMorro: P.segMorro, real: P };
const LAT = 39.1182081, LON = -1.1598527;
/* los instantes: el 21-jun de Ayora, con haz. Son los MISMOS del ítem medido,
   diezmados para que el banco quepa en CI — el recuento completo vive en la
   sonda, no aquí. */
/* EL PASO ES UNA DECISIÓN DE COSTE, y va con su medida al lado. Con paso 30
   (29 instantes) el banco tarda más de 8 minutos sólo en `optfree`, porque
   `anglesOptimalFreeSeg` corre el ascenso por línea Y el óptimo por mesa. El
   recuento completo vive en la sonda (`audit4/out/F1_*.json`); aquí basta con
   que el banco DISTINGA el arreglo del defecto, y el control negativo
   comprueba que lo distingue. `optfree` va sobre un subconjunto, declarado. */
const DOY = 172, DIA = Date.UTC(2026, 5, 21);
const INST = [];
for (let m = 0; m < 1440; m += 60) {
  const g = F.solarPos(DIA + m * 60000, LAT, LON);
  if (!(g.elev > 0)) continue;
  const irr = F.clearskyIneichen(g.zen, DOY, 500, 3.5);
  if (!(irr.dni > 25)) continue;
  INST.push({ m, g, irr });
}
const ALB = 0.2;
/* `optfree` sobre uno de cada tres: sale más caro que `optimal` porque arrastra
   el ascenso coordinado de la rama por línea. El denominador va impreso. */
const INST_OF = INST.filter((_, i) => i % 3 === 0);
const crono = (f) => { const t0 = Date.now(); const r = f(); return { r, s: (Date.now() - t0) / 1000 }; };

console.log(`veto por mesa · planta ${T.segs.length} líneas · ${INST.length} instantes con haz (21-jun, paso 60 min)`);

// ── 1-2 · LOS DOS TESTS NULOS, antes de cualquier recuento ──────────────────
t('TEST NULO A · la planta de prueba TIENE torsión (si no, no hay nada que distinguir)', () => {
  let n = 0, mx = 0;
  for (let r = 0; r < T.segTilt.length; r++)
    for (let k = 0; k < T.segTilt[r].length; k++) {
      const d = Math.abs(T.segTilt[r][k] - F.rowTiltAt(T, r));
      if (d > 1e-9) n++; mx = Math.max(mx, d);
    }
  if (!(n > 0)) throw new Error('ninguna mesa se aparta del tilt de su línea: el caso no distingue nada');
  console.log(`      · ${n} mesas con torsión, máx ${mx.toFixed(4)}°`);
});
t('TEST NULO B · las DOS métricas difieren en esta planta (si coincidieran, la 5 pasaría rota)', () => {
  let dif = 0, mx = 0;
  for (const { g, irr } of INST) {
    const seg = F.policyAnglesSeg('pairwise', g.zen, g.az, T, irr, DOY, ALB);
    const a = F.poaPlantSeg(g.zen, g.az, T, seg, irr, DOY, ALB).plant;
    const b = F.poaPlant(g.zen, g.az, T, F.segLineMean(T, seg), irr, DOY, ALB).plant;
    if (Math.abs(a - b) > 1e-9) dif++; mx = Math.max(mx, Math.abs(a - b));
  }
  if (dif === 0) throw new Error('por mesa y por línea dan lo mismo en los ' + INST.length + ' instantes: el caso no distingue nada');
  console.log(`      · difieren en ${dif} de ${INST.length} instantes, máx ${mx.toFixed(4)} W/m²`);
});

// ── 3-4 · la fuente: con qué puntúa lo que manda ────────────────────────────
t('`anglesOptimalSeg` existe y NO llama a `poaPlant` ni una vez (comentarios aparte)', () => {
  const b = cuerpoFn(src, 'anglesOptimalSeg');
  if (!b) throw new Error('no existe `anglesOptimalSeg`');
  const cod = sinComentarios(b);
  const pp = (cod.match(/\bpoaPlant\s*\(/g) || []).length;
  const ps = (cod.match(/\bpoaPlantSeg\s*\(/g) || []).length;
  if (ps < 1) throw new Error('no puntúa con `poaPlantSeg` ni una vez');
  if (pp > 0) throw new Error(`el veto ha vuelto a la métrica por línea: ${pp} llamada(s) a poaPlant`);
});
t('`policyAnglesSeg` encamina `optimal` y `optfree` por mesa, no por reparto de línea', () => {
  const b = sinComentarios(cuerpoFn(src, 'policyAnglesSeg'));
  for (const [k, fn] of [['optimal', 'anglesOptimalSeg'], ['optfree', 'anglesOptimalFreeSeg']])
    if (!new RegExp(`key===['"]${k}['"][\\s\\S]{0,80}${fn}\\(`).test(b))
      throw new Error(`\`${k}\` no va a \`${fn}\``);
  if (/key===['"]optimal['"][\s\S]{0,80}segsBroadcast/.test(b))
    throw new Error('`optimal` sigue repartiendo el ángulo de su línea');
});

// ── 5-6 · LO QUE TIENE QUE CUMPLIRSE, con la métrica que se cobra ───────────
function peorMargen(fnOpt, lista) {
  let peor = Infinity, donde = null;
  for (const { m, g, irr } of (lista || INST)) {
    const pw = F.applyDriveSeg(F.anglesPairwiseSeg(g.zen, g.az, T), T.segDrive || T.segPairs);
    const op = fnOpt(g.zen, g.az, T, irr, DOY, ALB).angles;
    const d = F.poaPlantSeg(g.zen, g.az, T, op, irr, DOY, ALB).plant
            - F.poaPlantSeg(g.zen, g.az, T, pw, irr, DOY, ALB).plant;
    if (d < peor) { peor = d; donde = m; }
  }
  return { peor, donde };
}
t(`\`optimal\` ≥ \`pairwise\` POR MESA en los ${INST.length} instantes, dentro de E_EMPATE_W`, () => {
  const { r: { peor, donde }, s } = crono(() => peorMargen(F.anglesOptimalSeg));
  console.log(`      · margen peor ${peor.toFixed(4)} W/m² (minuto ${donde}) · banda ${F.E_EMPATE_W} · ${s.toFixed(1)} s`);
  if (!(peor >= -F.E_EMPATE_W)) throw new Error(`pierde ${(-peor).toFixed(4)} W/m² en el minuto ${donde}`);
});
t(`\`optfree\` ≥ \`pairwise\` POR MESA en ${INST_OF.length} de los ${INST.length} instantes (uno de cada tres, por coste)`, () => {
  const { r: { peor, donde }, s } = crono(() => peorMargen(F.anglesOptimalFreeSeg, INST_OF));
  console.log(`      · margen peor ${peor.toFixed(4)} W/m² (minuto ${donde}) · ${s.toFixed(1)} s`);
  if (!(peor >= -F.E_EMPATE_W)) throw new Error(`pierde ${(-peor).toFixed(4)} W/m² en el minuto ${donde}`);
});

// ── 7 · EL CONTROL NEGATIVO: visto fallar con el arreglo desarmado ──────────
t('CONTROL NEGATIVO · con el veto de vuelta en `poaPlant`, la 5 SE PONE ROJA', () => {
  const cuerpo = cuerpoFn(src, 'anglesOptimalSeg');
  const MARCA = 'const poa=a=>poaPlantSeg(zen,az,T,a,irr,doy,albedo).plant;';
  if (cuerpo.indexOf(MARCA) < 0)
    throw new Error('no encuentro el marcador que desarmar: el control no puede construirse, así que no dice nada');
  /* la ÚNICA sustitución: se puntúa la misma candidata por LÍNEA, que es lo que
     hacía la v1.75. Todo lo demás —extremos por mesa, rejilla, refinado,
     veto— queda igual, para que lo que cambie sea la métrica y nada más. */
  const roto = cuerpo.replace(MARCA,
    'const poa=a=>poaPlant(zen,az,T,segLineMean(T,a),irr,doy,albedo).plant;')
    .replace('function anglesOptimalSeg(', 'function anglesOptimalSegRoto(');
  const G = new Function(sol + '\n' + src + '\n' + roto + '\nreturn anglesOptimalSegRoto;')();
  const { r: { peor, donde }, s } = crono(() => peorMargen(G));
  console.log(`      · desarmado: margen peor ${peor.toFixed(4)} W/m² (minuto ${donde}) · ${s.toFixed(1)} s`);
  if (peor >= -F.E_EMPATE_W)
    throw new Error(`desarmado TAMBIÉN pasa (peor ${peor.toFixed(4)} ≥ −${F.E_EMPATE_W}): este banco no distingue el arreglo del defecto`);
});

console.log(`\n${N - FAIL}/${N} comprobaciones en verde (veto por mesa, ${html.match(/const VER='([^']+)'/)[1]})`);
process.exit(FAIL ? 1 : 0);
