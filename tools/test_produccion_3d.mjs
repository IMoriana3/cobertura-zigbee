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
      // el PANEL dibujado de cada mesa: su ancho a lo largo del tubo y cuántos
      // módulos implica con la ficha del módulo de esta planta
      const paneles = [];
      if (!R3.inst && T.mod) R3.world.traverse(g => {
        if (g.userData && g.userData.row !== undefined && g.children.length) {
          let ancho = null;
          g.traverse(o => { const p = o.geometry && o.geometry.parameters;
            if (p && p.width > 5 && p.depth > 2 && p.depth < 3 && (ancho == null || p.width > ancho)) ancho = p.width; });
          if (ancho != null) paneles.push({ ancho, med: g.userData.s1 - g.userData.s0,
            md: (T.segMods && T.segMods[g.userData.row]) ? T.segMods[g.userData.row][g.userData.k] : null,
            mods: Math.round((ancho + T.mod.gapMod) / (T.mod.modW + T.mod.gapMod)) });
        }
      });
      return { mesas, alturas, paneles, segTilt: T.segTilt, ejes: T.ejes ? T.ejes.length : 0,
               westSeg: T.westSeg, trackers: RP.P.segDrive.length, inst: !!R3.inst,
               segFila: T.segFila, segSide: T.segSide, segArt: T.segArt, mod: T.mod || null };
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

    // 3bis) EL MÓDULO ES DE PROYECTO: cada mesa se dibuja con LOS MÓDULOS que
    //       dice el levantamiento y con el ancho de módulo de SU planta (Ayora
    //       1,303 m · San José 1,134). Con el ancho de la casa fijo, una mesa
    //       de Ayora salía con 32 módulos de 1,134 donde hay 28 de 1,303: el
    //       largo cuadraba y el conteo no.
    if (!m.inst) {
      const dif = m.paneles.map(o => o.ancho - o.med).sort((a, b) => a - b);
      const malMods = m.paneles.filter(o => o.md > 0 && o.mods !== o.md).length;
      check(`${nombre}: cada mesa dibuja los módulos del levantamiento (${[...new Set(m.paneles.map(o => o.md))].filter(Boolean).sort((a, b) => a - b).join('/')})`,
            m.paneles.length > 0 && malMods === 0,
            `${malMods} de ${m.paneles.length} mesas con otro nº de módulos`);
      check(`${nombre}: y el panel mide lo que mide la mesa (desvío mediana ${dif.length ? dif[dif.length >> 1].toFixed(2) : '—'} m)`,
            dif.length > 0 && Math.abs(dif[dif.length >> 1]) < 0.5 && Math.abs(dif[0]) < 1.2 && Math.abs(dif[dif.length - 1]) < 1.2,
            `desvíos ${dif[0]?.toFixed(2)} … ${dif[dif.length - 1]?.toFixed(2)} m`);
    }

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
    // v1.24: la ficha nombra la mesa por su CUADRANTE (sur/norte del morro ×
    // viga este/oeste) y da las dos nomenclaturas — la del tracker en la
    // planta y la nuestra — más el tilt de ESA mesa
    const cuad = fichas.map(f => (f.match(/mesa (SUROESTE|SURESTE|NOROESTE|NORESTE)/) || [])[1]);
    const nuestro = fichas.map(f => (f.match(/\bS(\d+\.\d+)\b/) || [])[1]);
    const trk = fichas.map(f => (f.match(/^([A-Z][^·]*?)\s*·/) || [])[1]);
    check('la mesa se nombra por su CUADRANTE: las dos del morro son SUR… y NOR… de la MISMA viga',
          fichas.length === 2 && cuad[0] && cuad[1] && cuad[0] !== cuad[1] &&
          /^SUR/.test(cuad[0]) && /^NOR/.test(cuad[1]) &&
          cuad[0].replace(/^SUR/, '') === cuad[1].replace(/^NOR/, ''),
          fichas.map(f => f.slice(0, 110)).join(' || '));
    check('la ficha da la nomenclatura del TRACKER y la nuestra, y el tilt de esa mesa',
          fichas.length === 2 && trk[0] && trk[0] === trk[1] &&
          nuestro[0] && nuestro[1] && nuestro[0] !== nuestro[1] &&
          fichas.every(f => /tilt N-S -?\d+\.\d+°/.test(f)),
          fichas[0] ? fichas[0].slice(0, 200) : 'sin ficha');
    check('y NO enseña la contabilidad interna (x de la línea, ordinal de la mesa, cota)',
          fichas.length === 2 && fichas.every(f => !/línea x=/.test(f) && !/mesa \d+\/\d+/.test(f) && !/· cota /.test(f)),
          fichas[0] ? fichas[0].slice(0, 200) : 'sin ficha');
  }

  // 7) EL CONTORNO DE LA SELECCIÓN VA EN EL MARCO DE LA MESA. Era una caja
  //    alineada con los ejes del mundo: con el seguidor basculado a −53° dejaba
  //    de abrazar el string («¿por qué el rectángulo no es paralelo al
  //    string?»). Ahora es el contorno del panel, así que su normal se separa
  //    de la vertical EXACTAMENTE lo que dice el θ de esa mesa.
  {
    await pg.selectOption('#plant', 'ayora|2');
    await pg.waitForFunction(() => typeof RP !== 'undefined' && RP && RP.key === 'ayora' && R3.last && cfg().nrows === RP.P.elev.length,
                             null, { timeout: 300000 });
    await pg.waitForTimeout(1500);
    await pg.fill('#hour', '1160'); await pg.dispatchEvent('#hour', 'input');   // 19:20, θ ≈ −50°
    await pg.waitForTimeout(1200);
    const pt = await pg.evaluate(() => {
      const rct = document.getElementById('c3d').getBoundingClientRect();
      const cand = [];
      R3.world.traverse(g => { if (g.userData && g.userData.row !== undefined && g.children.length) {
        const sg = T.segs[g.userData.row][g.userData.k];
        cand.push({ x: g.position.x, y: g.position.y, zc: -(sg[0] + sg[1]) / 2, len: sg[1] - sg[0] }); } });
      const m = cand.find(o => o.len > 30) || cand[0];
      R3.cam.fov = 45; R3.cam.updateProjectionMatrix();
      R3.cam.position.set(m.x, m.y + 55, m.zc + 0.01); R3.ctrl.target.set(m.x, m.y, m.zc);
      R3.ctrl.update(); R3.cam.updateMatrixWorld(true); R3.dirty = true;
      const p = new THREE.Vector3(m.x, m.y + 0.3, m.zc).project(R3.cam);
      return { x: rct.left + (p.x + 1) / 2 * rct.width, y: rct.top + (1 - p.y) / 2 * rct.height };
    });
    await pg.waitForTimeout(900);
    await pg.mouse.click(pt.x, pt.y);
    await pg.waitForTimeout(700);
    const g = await pg.evaluate(() => {
      if (!pickHelper || !PICK) return null;
      pickHelper.updateWorldMatrix(true, false);
      const M = pickHelper.matrixWorld;
      const o = new THREE.Vector3(0, 0, 0).applyMatrix4(M);
      const ex = new THREE.Vector3(0.5, 0, 0).applyMatrix4(M).sub(o).normalize();   // a lo LARGO del tubo
      const n = new THREE.Vector3(0, 0, 1).applyMatrix4(M).sub(o).normalize();      // normal del panel
      const th = (R3.last.inst.segAng ? R3.last.inst.segAng[PICK.row][PICK.k] : R3.last.inst.ang[PICK.row]);
      const tilt = T.segTilt ? T.segTilt[PICK.row][PICK.k] : 0;
      return { incl: Math.acos(Math.min(1, Math.abs(n.y))) * 180 / Math.PI,
               ejeY: Math.asin(Math.max(-1, Math.min(1, ex.y))) * 180 / Math.PI, th, tilt };
    });
    check('el contorno de la selección va en el marco de la MESA: su normal se inclina lo que dice el θ',
          !!g && Math.abs(Math.abs(g.th) - g.incl) < 1.5 && Math.abs(g.th) > 20,
          g ? `θ ${g.th.toFixed(1)}° · normal del contorno a ${g.incl.toFixed(1)}° de la vertical` : 'sin selección');
    check('y su eje largo sigue el TILT N-S de la mesa, no la horizontal del mundo',
          !!g && Math.abs(g.ejeY - g.tilt) < 1.0,
          g ? `eje a ${g.ejeY.toFixed(2)}° · tilt ${g.tilt.toFixed(2)}°` : 'sin selección');
  }

  check('sin errores de consola', errs.length === 0, errs.slice(0, 3).join(' · '));
  await browser.close();
} finally {
  try { srv.kill(); } catch { /* nada */ }
}
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
