#!/usr/bin/env node
/* CAREO DE LA ESCENA de produccion.html — lo que ningún test de Node ve.
 *
 * Todos los fallos de render de esta tarjeta se han escapado por comprobar el
 * DATO y el TEXTO en vez de mirar lo que se dibuja: el eje de transmisión
 * uniendo trackers distintos, la cota de la línea en vez de la de la mesa, el
 * tilt de línea, y el tilt dibujado con el SIGNO CAMBIADO (−segTilt exacto en
 * las 1.502 mesas de Ayora, así que cada mesa se inclinaba al revés que su
 * terreno). Este test abre la página en Chromium y MIDE la geometría del
 * mundo: la pendiente real de cada tubo, su altura sobre el suelo, y el
 * accionamiento.
 *
 *   node tools/test_produccion_3d.mjs            (levanta su propio servidor)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8123 + (process.pid % 500);
let ok = 0, ko = 0;
const check = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { ko++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
};

const { chromium } = await import(fs.existsSync('/home/user/proyectos/node_modules/playwright/index.mjs')
  ? '/home/user/proyectos/node_modules/playwright/index.mjs' : 'playwright');

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(`http://localhost:${PORT}/produccion.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2000);

  for (const [sel, nombre, camino] of [['ayora|2', 'Ayora NCU 2', 'mallas'], ['ayora', 'Ayora entera', 'instanciado']]) {
    await pg.selectOption('#plant', sel);
    await pg.waitForFunction(() => typeof RP !== 'undefined' && RP && RP.key === 'ayora' && R3.last && cfg().nrows === RP.P.elev.length,
                             null, { timeout: 300000 });
    await pg.waitForTimeout(1500);

    const m = await pg.evaluate(() => {
      const dirTubo = (mat) => {          // dirección del TUBO en el mundo
        const A = new THREE.Vector3(0, 0, 0).applyMatrix4(mat);
        const B = new THREE.Vector3(1, 0, 0).applyMatrix4(mat);
        return B.sub(A);
      };
      const tiltDe = (d) => { const s = -d.z < 0 ? -1 : 1; return Math.atan2(s * d.y, Math.hypot(s * d.x, s * d.z)) * 180 / Math.PI; };
      const mesas = [];
      if (R3.inst) {
        for (const tr of R3.inst.tramos)
          mesas.push({ r: tr.row, k: tr.k, tilt: tiltDe(dirTubo(tr.pre)), y: tr.hubY, x: tr.x, z: tr.zc });
      } else {
        R3.world.traverse(g => {
          if (g.userData && g.userData.row !== undefined && g.children.length) {
            let spin = null;
            g.traverse(c => { if (!spin && c.isGroup && c !== g && c.parent && c.parent !== g) spin = c; });
            const t = spin || g.children[0];
            t.updateWorldMatrix(true, false);
            mesas.push({ r: g.userData.row, k: g.userData.k, tilt: tiltDe(dirTubo(t.matrixWorld)),
                         y: g.position.y, x: g.position.x, z: g.position.z });
          }
        });
      }
      // suelo: el único mesh con colores por vértice
      let gnd = null; R3.world.traverse(o => { if (!gnd && o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.color) gnd = o; });
      const rc = new THREE.Raycaster(); const alturas = [];
      for (const q of mesas) {
        rc.set(new THREE.Vector3(q.x, q.y + 60, q.z), new THREE.Vector3(0, -1, 0));
        const h = rc.intersectObject(gnd, true);
        alturas.push(h.length ? q.y - h[0].point.y : null);
      }
      return { mesas, alturas, segTilt: T.segTilt, ejes: T.ejes ? T.ejes.length : 0,
               westSeg: T.westSeg, trackers: RP.P.segPairs.length, inst: !!R3.inst };
    });

    // 1) el TILT dibujado de cada mesa es el MEDIDO de esa mesa, con su signo
    let peor = 0, peorId = null;
    for (const q of m.mesas) {
      const d = Math.abs(q.tilt - m.segTilt[q.r][q.k]);
      if (d > peor) { peor = d; peorId = `${q.r}/${q.k}: dibujado ${q.tilt.toFixed(2)}° · medido ${m.segTilt[q.r][q.k].toFixed(2)}°`; }
    }
    check(`${nombre} (${camino}): las ${m.mesas.length} mesas se dibujan con SU tilt medido`, peor < 0.01, peorId);
    // y el mutante del signo: invertirlo tiene que empeorar de verdad
    const inv = m.mesas.reduce((a, q) => a + Math.abs(q.tilt + m.segTilt[q.r][q.k]), 0) / m.mesas.length;
    check(`${nombre}: el signo importa (invertido se aparta ${inv.toFixed(2)}°)`, inv > 0.5, 'el careo del signo es vacío');

    // 2) dentro de una línea, las mesas NO comparten tilt
    const porFila = new Map();
    m.mesas.forEach(q => { const v = porFila.get(q.r) || []; v.push(q.tilt); porFila.set(q.r, v); });
    let lin = 0, iguales = 0;
    for (const v of porFila.values()) if (v.length > 1) { lin++; if (Math.max(...v) - Math.min(...v) < 0.01) iguales++; }
    check(`${nombre}: ninguna de las ${lin} líneas con varias mesas las dibuja todas al mismo tilt`, lin > 0 && iguales === 0,
          `${iguales} líneas con sus mesas al mismo tilt`);

    // 3) cada mesa vuela sobre SU terreno, no sobre la cota de su línea
    const hs = m.alturas.filter(v => v != null);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    check(`${nombre}: el tubo va a 2 m del suelo bajo cada mesa (${lo.toFixed(2)}–${hi.toFixed(2)} m)`,
          hs.length === m.mesas.length && lo > 1.5 && hi < 2.5, `${m.mesas.length - hs.length} sin suelo debajo`);

    // 4) accionamiento: un eje y un motor por tracker
    let motores = 0; m.westSeg.forEach(l => l.forEach(w => { if (w) motores++; }));
    check(`${nombre}: un eje y un motor por tracker (${m.trackers})`, m.ejes === m.trackers && motores === m.trackers,
          `${m.ejes} ejes y ${motores} motores`);
  }
  check('sin errores de consola', errs.length === 0, errs.slice(0, 3).join(' · '));
  await browser.close();
} finally {
  try { srv.kill(); } catch { /* nada */ }
}
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
