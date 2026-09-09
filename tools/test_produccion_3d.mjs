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

  for (const [sel, nombre, camino] of [['ayora|2', 'Ayora NCU 2', 'mallas'],
                                      ['sanjose|9', 'San José NCU 9', 'mallas'],
                                      ['ayora', 'Ayora entera', 'instanciado']]) {
    const planta = sel.split('|')[0];
    await pg.selectOption('#plant', sel);
    await pg.waitForFunction((k) => typeof RP !== 'undefined' && RP && RP.key === k && R3.last && cfg().nrows === RP.P.elev.length,
                             planta, { timeout: 300000 });
    await pg.waitForTimeout(1500);

    const m = await pg.evaluate(() => {
      const dirTubo = (mat) => {          // dirección del TUBO en el mundo
        const A = new THREE.Vector3(0, 0, 0).applyMatrix4(mat);
        const B = new THREE.Vector3(1, 0, 0).applyMatrix4(mat);
        return B.sub(A);
      };
      const tiltDe = (d) => { const s = -d.z < 0 ? -1 : 1; return Math.atan2(s * d.y, Math.hypot(s * d.x, s * d.z)) * 180 / Math.PI; };
      const mesas = [];
      const anc = (m4) => ({ ax: m4.elements[12], ay: m4.elements[13], az: m4.elements[14] });
      if (R3.inst) {
        for (const tr of R3.inst.tramos)
          mesas.push(Object.assign({ r: tr.row, k: tr.k, tilt: tiltDe(dirTubo(tr.pre)), y: tr.hubY, x: tr.x, z: tr.zc }, anc(tr.pre)));
      } else {
        R3.world.traverse(g => {
          if (g.userData && g.userData.row !== undefined && g.children.length) {
            let spin = null;
            g.traverse(c => { if (!spin && c.isGroup && c !== g && c.parent && c.parent !== g) spin = c; });
            const t = spin || g.children[0];
            t.updateWorldMatrix(true, false);
            mesas.push({ r: g.userData.row, k: g.userData.k, tilt: tiltDe(dirTubo(t.matrixWorld)),
                         y: g.position.y, x: g.position.x, z: g.position.z,
                         ax: g.position.x, ay: g.position.y, az: g.position.z });
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
               westSeg: T.westSeg, trackers: RP.P.segDrive.length, inst: !!R3.inst,
               segFila: T.segFila, segSide: T.segSide, segArt: T.segArt };
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

    // 2) dentro de una línea, las VIGAS no comparten tilt (las dos mesas de una
    //    viga RÍGIDA sí lo comparten, y eso es el dato: el quiebro solo existe
    //    donde el levantamiento lo midió)
    const porLinea = new Map();
    m.mesas.forEach(q => {
      const f = m.segFila && m.segFila[q.r] ? m.segFila[q.r][q.k] : q.k;
      const v = porLinea.get(q.r) || new Map(); const w = v.get(f) || []; w.push(q.tilt); v.set(f, w); porLinea.set(q.r, v);
    });
    let lin = 0, iguales = 0;
    for (const v of porLinea.values()) {
      if (v.size < 2) continue;
      lin++;
      const medias = [...v.values()].map(w => w.reduce((a, b) => a + b, 0) / w.length);
      if (Math.max(...medias) - Math.min(...medias) < 0.01) iguales++;
    }
    check(`${nombre}: ninguna de las ${lin} líneas con varias vigas las dibuja todas al mismo tilt`, lin > 0 && iguales === 0,
          `${iguales} líneas con sus vigas al mismo tilt`);

    // 3) cada mesa vuela sobre SU terreno, no sobre la cota de su línea
    const hs = m.alturas.filter(v => v != null);
    const lo = Math.min(...hs), hi = Math.max(...hs);
    check(`${nombre}: el tubo va a 2 m del suelo bajo cada mesa (${lo.toFixed(2)}–${hi.toFixed(2)} m)`,
          hs.length === m.mesas.length && lo > 1.5 && hi < 2.5, `${m.mesas.length - hs.length} sin suelo debajo`);

    // 4) accionamiento: un eje por tracker; el motor va en la viga OESTE (sus
    //    DOS mesas la llevan marcada, pero el motor se dibuja una vez, en el
    //    morro: las piezas del accionamiento caen en x≈0 del modelo)
    let motores = 0; m.westSeg.forEach(l => l.forEach(w => { if (w) motores++; }));
    check(`${nombre}: un eje por tracker (${m.trackers}) y la viga oeste marcada en sus dos mesas`,
          m.ejes === m.trackers && motores === 2 * m.trackers,
          `${m.ejes} ejes y ${motores} mesas con motor para ${m.trackers} trackers`);

    // 5) LA VIGA ESTÁ QUEBRADA EN EL MORRO — el fallo que se veía en pantalla:
    //    «dos mesas de la misma fila con el mismo tilt». Sus dos mesas tienen
    //    que pivotar sobre el MISMO punto (el morro, sin junta abierta) y,
    //    donde el levantamiento las midió articuladas, dibujarse a tilts
    //    DISTINTOS.
    {
      const porViga = new Map();
      for (const q of m.mesas) {
        if (!m.segFila || !m.segFila[q.r]) continue;
        const key = q.r + '/' + m.segFila[q.r][q.k];
        if (!porViga.has(key)) porViga.set(key, []);
        porViga.get(key).push(q);
      }
      let vigas = 0, junta = 0, peorJ = 0, art = 0, quebradas = 0, peorQ = 0;
      for (const [key, v] of porViga) {
        if (v.length !== 2) continue;
        vigas++;
        const d = Math.max(Math.abs(v[0].ax - v[1].ax), Math.abs(v[0].ay - v[1].ay), Math.abs(v[0].az - v[1].az));
        if (d > peorJ) peorJ = d;
        if (d > 0.01) junta++;
        if (m.segArt && m.segArt[v[0].r] && m.segArt[v[0].r][v[0].k]) {
          art++;
          const dt = Math.abs(v[0].tilt - v[1].tilt);
          if (dt > 0.2) quebradas++;
          if (dt > peorQ) peorQ = dt;
        }
        void key;
      }
      check(`${nombre}: las ${vigas} vigas pivotan sobre su MORRO (las dos mesas, el mismo punto)`,
            vigas > 0 && junta === 0, `${junta} vigas con junta abierta (peor ${peorJ.toFixed(3)} m)`);
      check(`${nombre}: de las ${art} vigas con quiebro MEDIDO, ${quebradas} se dibujan con sus dos mesas a tilt distinto (peor Δ ${peorQ.toFixed(2)}°)`,
            art === 0 || quebradas > art * 0.5, `solo ${quebradas} de ${art}`);
    }
  }
  // 6) LA FICHA: al pinchar a un lado y otro del morro de la MISMA viga tienen
  //    que salir DOS mesas distintas —la del sur y la del norte—, cada una con
  //    su tilt y diciendo el de su hermana. Antes las dos eran «la misma mesa»
  //    con dos alas y el mismo tilt, que es lo que se leía en pantalla.
  {
    const pts = await pg.evaluate(() => {
      const rct = document.getElementById('c3d').getBoundingClientRect();
      const cand = R3.inst ? R3.inst.tramos : [];
      // una viga con sus dos mesas dibujadas: se pincha el centro de cada una
      const porViga = new Map();
      for (const tr of cand) {
        const key = tr.row + '/' + T.segFila[tr.row][tr.k];
        if (!porViga.has(key)) porViga.set(key, []);
        porViga.get(key).push(tr);
      }
      let v = null;
      for (const g of porViga.values()) if (g.length === 2 && g[0].len > 20) { v = g; break; }
      if (!v) return null;
      v.sort((a, b) => T.segSide[a.row][a.k] - T.segSide[b.row][b.k]);
      // cámara CENITAL sobre la viga: desde el vuelo general la mesa de delante
      // tapa a la de detrás y los dos clics caían en la misma
      const cx = v[0].x, cz = (v[0].zc + v[1].zc) / 2;
      R3.cam.position.set(cx, v[0].hubY + 70, cz + 0.01);
      R3.ctrl.target.set(cx, v[0].hubY, cz);
      R3.ctrl.update(); R3.cam.updateMatrixWorld(true); R3.dirty = true;
      return v.map(tr => {
        const p = new THREE.Vector3(tr.x, tr.hubY + 0.3, tr.zc).project(R3.cam);
        return { x: rct.left + (p.x + 1) / 2 * rct.width, y: rct.top + (1 - p.y) / 2 * rct.height };
      });
    });
    const fichas = [];
    if (pts) for (const pt of pts) { await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(400); fichas.push((await pg.textContent('#pick')).replace(/\s+/g, ' ')); }
    const ks = fichas.map(f => (f.match(/mesa (\d+)\/\d+/) || [])[1]);
    check('a un lado y otro del morro hay DOS mesas distintas, la del sur y la del norte',
          fichas.length === 2 && ks[0] && ks[1] && ks[0] !== ks[1] &&
          /mesa SUR del morro/.test(fichas[0]) && /mesa NORTE del morro/.test(fichas[1]),
          fichas.map(f => f.slice(0, 110)).join(' || '));
    check('la ficha enseña el tilt de la OTRA mesa de su viga y si el quiebro está medido',
          fichas.length === 2 && fichas.every(f => /la otra mesa de su viga, #\d+: -?\d/.test(f) &&
                                                   /(quiebro MEDIDO|viga rígida)/.test(f)),
          fichas[0] ? fichas[0].slice(0, 200) : 'sin ficha');
  }

  check('sin errores de consola', errs.length === 0, errs.slice(0, 3).join(' · '));
  await browser.close();
} finally {
  try { srv.kill(); } catch { /* nada */ }
}
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
