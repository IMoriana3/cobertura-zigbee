/* ¿Gana el astronómico o el backtracking? — la BANDA, no un número.
   Uso:  node tools/banda_astro_bt.mjs [dias]

   El anual de Ayora sale ±0,1% entre pairwise y astro: eso está DENTRO del
   error del modelo, así que publicar un número sería mentir con decimales. Lo
   honesto es acotar: recorrer el rango plausible de los parámetros que aún no
   sabemos fijar y mirar si TODO el intervalo tiene el mismo signo.
     · si la banda entera cae de un lado → cerrado, aunque el modelo sea tosco
     · si cruza el cero → NO se puede decidir modelando: hay que medir

   Ejes de la banda (los tres declarados como abiertos en la doc):
     n   = subcadenas que la sombra cruza (1 retrato entero · 2 media célula
           —Ayora— · 3 tumbado): decide el signo, v1.30
     b₀  = IAM ASHRAE (0 = sin IAM · 0,05 = vidrio limpio de libro): el único
           término conocido que empuja HACIA astro, v1.31
     circunsolar = cómo lo trata la sombra:
             hi  → sin sombrear (lo que hacíamos hasta v1.30, favorece a astro)
             pub → tapado en proporción al ÁREA sombreada (lo publicado, v1.31)
             lo  → la subcadena muerta tampoco lo convierte (cota pesimista)

   Lo que NO está en la banda, y por tanto no acota: mismatch entre módulos en
   serie del mismo string, puntos calientes/garantía, cielo real (esto es cielo
   claro) y factor de vista de la bóveda bloqueada por la fila de delante. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA');
const src = html.slice(html.lastIndexOf('/*', i0), i1);
/* El bloque de FÍSICA PURA ya no lleva el sol dentro: la posición NOAA y el
   `singleaxis` viven en `sol.js`, que la página carga aparte. Se antepone aquí,
   igual que hace el navegador, o el bloque extraído se queda sin `Sol`. */
const _sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8')
             + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
const F = new Function(_sol + '\n' + src + ';return {solarPos,clearskyIneichen,policyAngles,poaPlant,plantFromCotas};')();

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'ayora_cotas.json'), 'utf-8'));
const P = F.plantFromCotas(data, 500, 0);
const pairs = [];
for (let i = 0; i < P.lineX.length - 1; i++) {
  const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
  pairs.push({ slope: Math.atan2(P.pairDz[i], dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
}
const baseT = {
  pairs, cw: P.cw, axisAz: 0, maxAngle: P.maxAngle, gcr: P.cw / P.pitch, z0: 0.17,
  rowTilt: P.tilt, groups: P.groups, drive: 'bifila', segs: P.segs, real: P,
};
const LAT = 39.1182081, LON = -1.1598527, ALT = 739, TL = 3.5, ALB = 0.20, STEP = 20;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MESES = +(process.argv[2] || 12);

const VAR = ['lo', 'pub', 'hi'];
const pick = (p, v) => v === 'hi' ? p.plantHi : v === 'lo' ? p.plantLo : p.plant;

/* un año para un (n, b₀): devuelve kWh/m²·año por política y variante */
function anual(nbp, b0) {
  const T = Object.assign({}, baseT, { nBypass: nbp, iam: b0 });
  const acc = { pairwise: { lo: 0, pub: 0, hi: 0 }, astro: { lo: 0, pub: 0, hi: 0 } };
  for (let mo = 0; mo < MESES; mo++) {
    const day = Date.UTC(2026, mo, 21), doy = Math.round((day - Date.UTC(2026, 0, 1)) / 86400000) + 1;
    for (let m = 0; m < 1440; m += STEP) {
      const g = F.solarPos(day + m * 60000, LAT, LON);
      if (g.elev <= 0) continue;
      const irr = F.clearskyIneichen(g.zen, doy, ALT, TL);
      const w = STEP / 60 / 1000 * DIM[mo];
      // por policyAngles, NO por anglesPairwise/anglesAstro a pelo: es donde se
      // aplica el acoplado de accionamiento (bifila), que es lo que la planta
      // puede EJECUTAR. Sin él el pairwise sale mejor de lo que la planta da.
      for (const k of ['pairwise', 'astro']) {
        const ang = F.policyAngles(k, g.zen, g.az, T, irr, doy, ALB).angles;
        const p = F.poaPlant(g.zen, g.az, T, ang, irr, doy, ALB);
        for (const v of VAR) acc[k][v] += pick(p, v) * w;
      }
    }
  }
  return acc;
}

const NS = [1, 2, 3], B0S = [0, 0.05];
const filas = [];
for (const n of NS) {
  for (const b0 of B0S) {
    const a = anual(n, b0);
    for (const v of VAR) {
      const pw = a.pairwise[v], as = a.astro[v];
      filas.push({ n, b0, circ: v, pw, as, d: 100 * (as / pw - 1) });
    }
    console.error(`n=${n} b₀=${b0} ok`);
  }
}

console.log(`\nAYORA · ${MESES} días · astro frente a backtracking (pairwise), % de POA anual`);
console.log('signo + = gana ASTRO · signo − = gana el BACKTRACKING\n');
console.log('  n  b₀     circunsolar   pairwise kWh/m²   astro−pw');
for (const f of filas)
  console.log(`  ${f.n}  ${f.b0.toFixed(2)}   ${f.circ.padEnd(11)}   ${f.pw.toFixed(1).padStart(14)}   ${(f.d >= 0 ? '+' : '') + f.d.toFixed(3)}%`);

/* La banda PLAUSIBLE es [lo … pub], NO [lo … hi].
   «hi» = el circunsolar no lo tapa nada. Eso no es un valor plausible del
   parámetro: es la AUSENCIA del término, que es lo que hacíamos hasta v1.30.
   Dentro de Perez el circunsolar entra como fuente PUNTUAL en la posición del
   sol (por eso su POA usa el cos AOI del haz), así que la sombra que tapa el
   haz lo tapa a él: «pub» no es una elección, es la coherencia del modelo.
   Se sigue imprimiendo «hi» porque acota lo que costaría resolver el cono real
   de ~25° del circunsolar —que suavizaría el bloqueo— y porque mide lo que
   pesaba el fallo. */
const rango = (fs2) => { const d = fs2.map(f => f.d); return [Math.min(...d), Math.max(...d)]; };
const veredicto = ([lo, hi], q) => console.log(lo < -1e-9 && hi > 1e-9
  ? `⇒ ${q}: LA BANDA CRUZA EL CERO — el modelo no decide.`
  : (lo > 0 ? `⇒ ${q}: gana ASTRO en todo el rango.` : `⇒ ${q}: gana el BACKTRACKING en todo el rango.`));

const plaus = filas.filter(f => f.circ !== 'hi');
const [pl, ph] = rango(plaus);
console.log(`\nBANDA DEL MODELO (todas las n · b₀ · circunsolar lo/pub): ${(pl >= 0 ? '+' : '') + pl.toFixed(3)}% … ${(ph >= 0 ? '+' : '') + ph.toFixed(3)}%`);
veredicto([pl, ph], 'con la n sin fijar');

const ay = plaus.filter(f => f.n === 2);
const [al, ah] = rango(ay);
console.log(`AYORA (n=2, que SÍ sabemos: mesa 1V en retrato): ${(al >= 0 ? '+' : '') + al.toFixed(3)}% … ${(ah >= 0 ? '+' : '') + ah.toFixed(3)}%`);
veredicto([al, ah], 'en Ayora');

const [tl, th] = rango(filas);
console.log(`\nSi ADEMÁS se admite el techo «hi» (circunsolar sin tapar — el fallo de ≤v1.30, y el`);
console.log(`extremo de resolver el cono de 25°): ${(tl >= 0 ? '+' : '') + tl.toFixed(3)}% … ${(th >= 0 ? '+' : '') + th.toFixed(3)}%`);
veredicto([tl, th], 'con el techo');
console.log('\nLo que sigue FUERA de toda banda: mismatch de módulos en serie del mismo string,');
console.log('puntos calientes/garantía, cielo real (esto es cielo claro) y el bloqueo de bóveda');
console.log('por la fila de delante. Los dos primeros penalizan a quien deja sombra: astro.');
