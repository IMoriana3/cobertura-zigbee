/* Genera el `planos/<planta>.json` que consume el SCADA de operación (factiun-cartera/scada.html).
 *
 * El SCADA es multiplanta y se alimenta de esos ficheros; por eso solo tienen botón El Burgo, Ayora
 * y San José: son las tres que tienen plano. Fayón, Túnez, Bagnarelli y Páramo no lo tenían, y sus
 * layouts del DWG sí existen desde hace tiempo.
 *
 * `factiun-cartera` NO está en el alcance de esta sesión, así que esto deja los ficheros listos en
 * tools/planos_cartera/ para que la sesión que sí lo tiene los copie. El traspaso va escrito en el
 * CONTRATO, que es el canal acordado.
 *
 * FORMATO, del CONTRATO (sección E):
 *   {planta, origen, ncus[], tcus[{ncu, tcu, x, y, etiqueta}], hsus[], reps[]}
 * Y la conversión está VERIFICADA contra la tabla de Ayora que el propio CONTRATO trae:
 *   x = cE + t.x    y = cN + t.n     -> TK 040-05 sale en 659513,6 / 4331585,5, clavado, y con su
 *   NCU 7, que es la que dice la tabla. Dos muestras a 0,00 m y una a 0,10 m (redondeo).
 *
 *   node tools/gen_plano_cartera.mjs <planta> [--write]
 *   node tools/gen_plano_cartera.mjs ayora --verifica     comprueba contra la muestra del CONTRATO
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url).pathname;
const [planta, ...rest] = process.argv.slice(2);
const WRITE = rest.includes('--write'), VERIFICA = rest.includes('--verifica');
if (!planta) { console.error('uso: node tools/gen_plano_cartera.mjs <planta> [--write|--verifica]'); process.exit(2); }

/* WGS84/ETRS89 -> UTM (Krüger). La misma de Siting/tools/gen_siting.mjs, validada contra las tres
   plantas cuyo layout trae cE/cN: 3 mm en el peor caso, en tres zonas distintas. */
function utm(lat, lon, zona, sur) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const lam0 = ((zona - 1) * 6 - 180 + 3) * Math.PI / 180, phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - 2 * Math.sqrt(n) / (1 + n) * Math.atanh(2 * Math.sqrt(n) / (1 + n) * Math.sin(phi)));
  const xi = Math.atan(t / Math.cos(lam - lam0)), eta = Math.atanh(Math.sin(lam - lam0) / Math.sqrt(1 + t * t));
  let E = eta, N = xi;
  for (let j = 1; j <= 3; j++) { E += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + k0 * A * E, (sur ? 10000000 : 0) + k0 * A * N];
}
const zonaDe = crs => { const m = String(crs).match(/(\d{5})$/); if (!m) return null; const c = +m[1];
  if (c >= 25828 && c <= 25838) return { z: c - 25800, s: false };
  if (c >= 32601 && c <= 32660) return { z: c - 32600, s: false };
  if (c >= 32701 && c <= 32760) return { z: c - 32700, s: true };
  return null; };

const L = JSON.parse(readFileSync(RAIZ + planta + '_layout.json', 'utf8'));
let cE = L.cE, cN = L.cN, origenUTM = 'del propio layout';
if (!isFinite(cE) || !isFinite(cN)) {
  const z = zonaDe(L.crs);
  if (!z) { console.error('CRS no reconocido: ' + L.crs); process.exit(1); }
  [cE, cN] = utm(L.clat, L.clon, z.z, z.s);
  origenUTM = `calculado de clat/clon (${L.crs})`;
}
const r1 = v => +v.toFixed(1);
const X = v => r1(cE + v), Y = v => r1(cN + v);

/* NÚMERO DE ESCLAVO. El layout NO lo trae: es el id Modbus dentro de su NCU y sale de la topología
   (export de IPs / toolbox), no del DWG. Se numera correlativo dentro de cada NCU, respetando el
   orden del DWG, y se marca `tcu_derivado` para que nadie lo dé por bueno sin contrastarlo. En las
   plantas de UNA sola NCU es lo más probable, pero probable no es medido. */
const cuenta = {};
const tcus = (L.trackers || []).map(t => {
  const ncu = t.ncu || 1;
  cuenta[ncu] = (cuenta[ncu] || 0) + 1;
  return { ncu, tcu: cuenta[ncu], x: X(t.x), y: Y(t.n), etiqueta: t.id || '' };
});
const ncus = (L.ncus || []).map((n, i) => ({ ncu: i + 1, x: X(n.x), y: Y(n.n), etiqueta: n.name || ('NCU ' + (i + 1)) }));
const hsus = (L.meteo || []).map((m, i) => ({ hsu: i + 1, ncu: 1, x: X(m.x), y: Y(m.n), etiqueta: m.name || ('HSU ' + (i + 1)) }));
const reps = (L.reps || []).map((p, i) => ({ rep: i + 1, ncu: p.ncu || 1, x: X(p.x), y: Y(p.n), etiqueta: p.name || ('REP ' + (i + 1)) }));

const COD = { elburgo: 23003, ayora: 24025, sanjose: 24019, fayon: 24007, tunez: 24021, bagnarelli: 24030, paramo: 25019 };
const plano = {
  planta: L.title || planta,
  codigo: COD[planta] || null,
  origen: { crs: L.crs, cE: +cE.toFixed(3), cN: +cN.toFixed(3), nota: origenUTM },
  ncus, tcus, hsus, reps,
  tcu_derivado: true,
  generado_de: `cobertura-zigbee/${planta}_layout.json (del DWG) · tools/gen_plano_cartera.mjs`
};

if (VERIFICA) {
  /* Muestra que el propio CONTRATO trae para Ayora: si esto cuadra, la conversión es la que usa
     el plano que ya está publicado, no una interpretación mía. */
  const m = [['TK 040-05', 7, 659513.6, 4331585.5], ['TK 050-05', 7, 659573.6, 4331628.0], ['TK 051-05', 7, 659585.6, 4331628.1]];
  let peor = 0, mal = 0;
  for (const [et, ncu, x, y] of m) {
    const t = tcus.find(t => t.etiqueta === et);
    if (!t) { console.log(`  FALLO ${et} no está`); mal++; continue; }
    const d = Math.hypot(t.x - x, t.y - y);
    if (d > peor) peor = d;
    const bienNcu = t.ncu === ncu;
    console.log(`  ${d < 0.2 && bienNcu ? 'ok   ' : 'FALLO'} ${et} → ${t.x} ${t.y} (contrato ${x} ${y}, ${d.toFixed(2)} m) · NCU ${t.ncu}${bienNcu ? '' : ' ≠ ' + ncu}`);
    if (d >= 0.2 || !bienNcu) mal++;
  }
  console.log(mal ? '\n✗ no cuadra con el CONTRATO' : `\n✓ cuadra con la muestra del CONTRATO (peor ${peor.toFixed(2)} m)`);
  process.exit(mal ? 1 : 0);
}

const porNcu = {};
tcus.forEach(t => porNcu[t.ncu] = (porNcu[t.ncu] || 0) + 1);
console.log(`${plano.planta} (${plano.codigo}) · ${L.crs} · origen ${origenUTM}`);
console.log(`  ${tcus.length} TCU en ${ncus.length} NCU (${Object.entries(porNcu).map(([k, v]) => 'NCU' + k + ':' + v).join(' ')}) · ${hsus.length} HSU · ${reps.length} repetidores`);
console.log(`  esquina UTM ${Math.min(...tcus.map(t => t.x)).toFixed(0)} ${Math.min(...tcus.map(t => t.y)).toFixed(0)} → ${Math.max(...tcus.map(t => t.x)).toFixed(0)} ${Math.max(...tcus.map(t => t.y)).toFixed(0)}`);
console.log(`  ⚠ el nº de esclavo de cada TCU va DERIVADO (correlativo por NCU): el layout no lo trae, sale de la topología`);

if (!WRITE) { console.log('\n(dry-run: pasa --write para escribir tools/planos_cartera/)'); process.exit(0); }
mkdirSync(RAIZ + 'tools/planos_cartera', { recursive: true });
const ruta = RAIZ + 'tools/planos_cartera/' + planta.replace('sanjose', 'san-jose') + '.json';
writeFileSync(ruta, JSON.stringify(plano));
console.log('\nescrito ' + ruta.replace(RAIZ, ''));
