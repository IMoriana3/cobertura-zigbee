/* LA MANCHA EN EL AIRE · ¿QUÉ ESTADO ERA? El mensaje del titular no fija el
 * perfil N-S (solo que el HUD decía «tilt N-S 1,5°, rígida: medio del grupo») ni
 * si el preset de terreno llegó a APLICARSE (elegirlo en el desplegable no
 * mueve las cotas: lo hace el botón). Su HUD es una huella —θ fila 5 −3,0°,
 * máx planta 90,8 %, POA planta 33 W/m², luz al suelo 76 %, residual mín
 * −2001 mm— y aquí se buscan los estados que la reproducen ENTERA.
 *
 *   node audit_mancha/M0_busca.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { EXE } from '../tools/pw_navegador.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUERTO = process.env.PUERTO || 8124;
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'audit_mancha/estado_mancha.json'), 'utf-8'));
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
await pg.goto(`http://127.0.0.1:${PUERTO}/backtracking.html?limpio`, { waitUntil: 'load' });
await pg.waitForFunction(() => typeof DAY !== 'undefined' && DAY && DAY.pol && typeof cargaConfig === 'function', null, { timeout: 180000 });
const HUELLA = { theta: '-3.0°', maxp: 90.8, poa: 33, luz: 76, res: -2001 };
/* PRIMER FILTRO, BARATO: el «tilt N-S» del HUD es el medio del grupo bifila
   de la fila 5 (filas 5 y 6) según `nsProfile`, que es determinista. Solo los
   (preset, valor) que dan 1,5° redondeado pasan al cálculo completo. Valores en
   pasos de 0,5 —el `step` del mando— entre −6 y 6. */
const nsOk = await pg.evaluate(() => {
  const out = [];
  for (const ns of ['constante', 'quebrado', 'rotula', 'senoidal', 'aleatorio'])
    for (let v = -6; v <= 6.001; v += 0.5) {
      const p = nsProfile(Object.assign({}, cfg(), { nrows: 8, nspreset: ns, axtilt: +v.toFixed(1) }));
      if (((p[4] + p[5]) / 2).toFixed(1) === '1.5') out.push({ ns, v: +v.toFixed(1) });
    }
  return out;
});
console.log('perfiles N-S con el medio del grupo de la fila 5 = 1,5°: ' + nsOk.map(c => c.ns + ' ' + c.v).join(' · '));
const cands = [];
for (const c of nsOk) for (const aplicado of [true, false]) cands.push({ ...c, aplicado });
const hits = [];
let i = 0;
for (const c of cands) {
  const d = JSON.parse(JSON.stringify(base));
  d.config.perfil_ns = { preset: c.ns, valor: c.v };
  if (!c.aplicado) d.config.terreno.cotas = d.config.terreno.cotas.map(() => 0);
  d.hash = await pg.evaluate(C => hashConfig(C), d.config);
  const h = await pg.evaluate(async x => { await cargaConfig(x); return [...document.querySelectorAll('#hud > div')].map(e => e.innerText.replace(/\s+/g, ' ').trim()); }, d);
  const txt = h.join(' | ');
  const num = re => { const m = txt.match(re); return m ? +m[1] : NaN; };
  const f = { theta: (txt.match(/FILA 5 (-?[\d.]+°)/) || [])[1], tiltns: num(/TILT N-S FILA (-?[\d.]+)°/), maxp: num(/máx planta ([\d.]+)%/),
    poa: num(/POA PLANTA (\d+)/), luz: num(/LUZ AL SUELO (\d+)%/), res: num(/RESIDUAL MÍN (-?\d+) mm/) };
  const ok = f.theta === HUELLA.theta && f.tiltns === 1.5 && Math.abs(f.maxp - HUELLA.maxp) < 0.05 && f.poa === HUELLA.poa && f.luz === HUELLA.luz && f.res === HUELLA.res;
  if (ok || (f.tiltns === 1.5 && f.theta === HUELLA.theta)) hits.push({ ...c, ...f, huella_entera: ok });
  if (++i % 1 === 0) console.error(`  ${i}/${cands.length}`);
}
console.log(`candidatos ${cands.length} · con θ fila 5 = −3,0° y tilt N-S 1,5°: ${hits.length} · con la huella ENTERA: ${hits.filter(h => h.huella_entera).length}`);
for (const h of hits) console.log(`  ${h.huella_entera ? '✔' : ' '} N-S ${h.ns} ${h.v} · terreno ${h.aplicado ? 'aplicado' : 'SIN aplicar (llano)'} · máx ${h.maxp} % · POA ${h.poa} · luz ${h.luz} % · residual ${h.res} mm`);
fs.writeFileSync(path.join(ROOT, 'audit_mancha/out/M0_busca.json'), JSON.stringify(hits, null, 1));
await b.close();
