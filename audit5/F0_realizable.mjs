/* BT3D · FASE 0.2 (b) — EL GRAFO QUE SE REALIZA, para acotar la anchura por ABAJO.
 *
 *   node audit5/F0_realizable.mjs [--cada=6] [--k=12]
 *
 * La envolvente de rotación da un SUPERCONJUNTO del grafo del problema (cota
 * superior de su anchura). Aquí se busca, para cada arista de la envolvente
 * entre unidades U→V, un par de θ DENTRO DE LOS RANGOS del instante (el dominio
 * del problema: `rangoHaz` del simulador por unidad, en la escena) con el que el
 * MOTOR da sombra de alguna mesa de U sobre alguna de V. Se prueban K valores
 * equiespaciados de cada rango (extremos incluidos). La arista encontrada ES del
 * grafo del problema; las que no se encuentran pueden serlo con un θ entre dos
 * de la rejilla. Por eso el grafo que sale es un SUBGRAFO del verdadero y su
 * anchura es una COTA INFERIOR de la del problema:
 *     anchura(realizado) ≤ anchura(problema) ≤ anchura(envolvente).
 * Se muestrea un instante de cada `cada` (declarado) para acotar el coste.
 * Se busca por (unidad emisora, MESA receptora), no por pareja de unidades: la
 * pérdida de una receptora depende de la UNIÓN de todos sus emisores, así que el
 * grafo que manda es el MORAL (bt3d/grafo.py) y ese necesita saber qué unidades
 * sombrean a CADA mesa. Cada elemento de `aristas_realizadas` es [unidad
 * emisora, mesa receptora].
 * Salida: audit5/out/F0_realizable.json, que lee `python3 -m bt3d.f0_estructura`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargar, resolver, rho } from './lib_parametros.mjs';
import { pares } from './lib_envolvente.mjs';
import { vectorSol, caraMesa, sombraSobre } from './lib_proyeccion.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || ('--' + n + '=' + d)).slice(n.length + 3);
const CADA = +arg('cada', 6), K = +arg('k', 12);
const P = cargar(), out = { cada: CADA, k: K, plantas: {} };
for (const pl of ['ayora', 'fayon']) {
  const E = JSON.parse(fs.readFileSync(path.join(ROOT, `audit5/out/escenas/${pl}.json`), 'utf-8'));
  const par = resolver(P, pl, ['x'])[0], r = rho(P, pl), filas = [];
  const t0 = process.hrtime.bigint();
  E.instantes.forEach((q, qi) => {
    if (qi % CADA) return;
    const s = vectorSol(q.zen, q.az_malla), ti = process.hrtime.bigint();   // el sol en el marco de la planta
    const pm = pares(E.mesas, s, r);
    const porArista = new Map();
    for (const [e, rr] of pm) { const ue = E.mesas[e].u, ur = E.mesas[rr].u; if (ue === ur) continue;
      const k = ue + ',' + rr; if (!porArista.has(k)) porArista.set(k, []); porArista.get(k).push([e, rr]); }
    const rej = u => { const [lo, hi] = q.rangos[u]; return Array.from({ length: K }, (_, j) => (K === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (K - 1))); };
    const caras = new Map(); const cara = (i, j) => { const k = i * K + j; if (!caras.has(k)) caras.set(k, caraMesa(E.mesas[i], rej(E.mesas[i].u)[j], par.z0, par.cuerda)); return caras.get(k); };
    const realiz = [];
    for (const [k, lista] of porArista) {
      let hay = false;
      for (let jr = 0; jr < K && !hay; jr++) for (const [e, rr] of lista) { const R = cara(rr, jr);
        if (!(s[0] * R.nr[0] + s[1] * R.nr[1] + s[2] * R.nr[2] > 1e-12)) continue;
        for (let je = 0; je < K && !hay; je++) { const sh = sombraSobre(cara(e, je), R, s); if (sh && sh.area > 1e-4) hay = true; }
        if (hay) break; }
      if (hay) realiz.push(k.split(',').map(Number));
    }
    filas.push({ i: qi, fecha: q.fecha, min: q.min, elev: q.elev, aristas_envolvente: porArista.size, aristas_realizadas: realiz, ms: Number(process.hrtime.bigint() - ti) / 1e6 });
    process.stderr.write(`\r${pl} ${qi}/${E.instantes.length} elev ${q.elev.toFixed(1)}° env ${porArista.size} real ${realiz.length}      `);
  });
  out.plantas[pl] = { unidades: E.unidades.length, instantes: filas, ms_total: Number(process.hrtime.bigint() - t0) / 1e6 };
  process.stderr.write('\n');
  console.log(`${pl}: ${filas.length} instantes muestreados · pares unidad→mesa en la envolvente ${filas.reduce((a, f) => a + f.aristas_envolvente, 0)} · realizadas con la rejilla de ${K} θ por rango ${filas.reduce((a, f) => a + f.aristas_realizadas.length, 0)} · ${(out.plantas[pl].ms_total / 1000).toFixed(1)} s`);
}
fs.writeFileSync(path.join(ROOT, 'audit5/out/F0_realizable.json'), JSON.stringify(out));
