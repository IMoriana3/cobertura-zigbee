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
import { EXE } from './pw_navegador.mjs';   // la ruta del navegador, en un solo sitio

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8123 + (process.pid % 500);
let ok = 0, ko = 0;
const check = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { ko++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
};

const { chromium } = await import('playwright');

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || EXE });   // EXE sale de pw_navegador.mjs: undefined en CI = «usa el tuyo»
try {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(`http://localhost:${PORT}/produccion.html`, { waitUntil: 'load' });
  await pg.waitForTimeout(2000);

  /* 8) LOS LÍMITES DE MESA. Un listón claro en cada extremo del paño de tinte,
        porque con el color de producción por mesa cuatro mesas seguidas del
        mismo tracker se leen como una viga continua de 65 m. Lo que se mide no
        es que existan: es que estén DONDE está el paño (mismo centro, la misma
        separación que su largo) y que basculen con él (misma normal). Si
        alguien cambia la receta del tinte y no la de los límites, esto se pone
        rojo — que es el fallo que pueden tener.
        Se mide en LOS DOS caminos de render, porque son dos códigos distintos:
        el de mallas cuelga los listones del grupo que bascula y el instanciado
        los recoloca por fotograma en su propia InstancedMesh. */
  const mideBordes = () => {
    const I = R3.inst;
    const Z = new THREE.Vector3(0, 0, 1);
    let peorMid = 0, peorLargo = 0, peorNorm = 0, pares = 0, n = 0, nTint = 0, vis = null;
    if (I && I.bordes) {                       // camino INSTANCIADO
      const Mt = new THREE.Matrix4(), Mb = new THREE.Matrix4();
      let ib = 0, it = 0;
      n = I.bordes.count; nTint = I.tint.count; vis = I.bordes.visible;
      for (const tr of I.tramos) for (let q = 0; q < tr.Ltint.length; q++) {
        I.tint.getMatrixAt(it++, Mt);
        const ct = new THREE.Vector3().setFromMatrixPosition(Mt);
        const largo = new THREE.Vector3().setFromMatrixColumn(Mt, 0).length();
        const nt = Z.clone().transformDirection(Mt);
        I.bordes.getMatrixAt(ib++, Mb);
        const a = new THREE.Vector3().setFromMatrixPosition(Mb);
        const nb = Z.clone().transformDirection(Mb);
        I.bordes.getMatrixAt(ib++, Mb);
        const c2 = new THREE.Vector3().setFromMatrixPosition(Mb);
        peorMid = Math.max(peorMid, a.clone().add(c2).multiplyScalar(0.5).distanceTo(ct));
        peorLargo = Math.max(peorLargo, Math.abs(a.distanceTo(c2) - largo));
        peorNorm = Math.max(peorNorm, nt.angleTo(nb) * 180 / Math.PI);
        pares++;
      }
      return { via: 'instanciado', n, nTint, pares, peorMid, peorLargo, peorNorm, vis };
    }
    const bors = R3.bordesMesh || [];          // camino de MALLAS
    n = bors.length; vis = bors.length ? bors[0].visible : null;
    const porPadre = new Map();
    for (const b of bors) { if (!porPadre.has(b.parent)) porPadre.set(b.parent, []); porPadre.get(b.parent).push(b); }
    for (const [par, bs] of porPadre) {
      const ts = par.children.filter(o => o.isMesh && o.material && o.material.opacity === 0.62);
      nTint += ts.length;
      for (const t of ts) {
        const largo = t.geometry.parameters.width;
        const mios = bs.filter(b => Math.abs(Math.abs(b.position.x - t.position.x) - largo / 2) < 0.03);
        if (mios.length !== 2) continue;
        pares++;
        par.updateWorldMatrix(true, false);
        const ct = t.getWorldPosition(new THREE.Vector3());
        const a = mios[0].getWorldPosition(new THREE.Vector3()), c2 = mios[1].getWorldPosition(new THREE.Vector3());
        peorMid = Math.max(peorMid, a.clone().add(c2).multiplyScalar(0.5).distanceTo(ct));
        peorLargo = Math.max(peorLargo, Math.abs(a.distanceTo(c2) - largo));
        peorNorm = Math.max(peorNorm, Z.clone().transformDirection(t.matrixWorld)
                                       .angleTo(Z.clone().transformDirection(mios[0].matrixWorld)) * 180 / Math.PI);
      }
    }
    return { via: 'mallas', n, nTint, pares, peorMid, peorLargo, peorNorm, vis };
  };
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
      // el panel se dibuja con los módulos del TIPO, así que su largo es el
      // nominal; la mesa medida puede apartarse de él lo que el generador
      // deja pasar (LARGO_FUERA de reparte_levantamiento.py son 3 m por FILA,
      // o sea 1,5 por mesa) y esas pocas van nombradas en su aviso
      check(`${nombre}: y el panel mide lo que mide la mesa (desvío mediana ${dif.length ? dif[dif.length >> 1].toFixed(2) : '—'} m)`,
            dif.length > 0 && Math.abs(dif[dif.length >> 1]) < 0.5 && Math.abs(dif[0]) < 1.6 && Math.abs(dif[dif.length - 1]) < 1.6,
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

    // los LÍMITES DE MESA de este camino de render (ver la nota de mideBordes)
    {
      const b = await pg.evaluate(mideBordes);
      check(`${nombre}: límites de mesa, DOS por paño de tinte y pintados (${b ? b.via : '?'})`,
            !!b && b.via === camino && b.n === 2 * b.nTint && b.pares === b.nTint && b.nTint > 100 && b.vis === true,
            b ? `${b.n} límites para ${b.nTint} paños · ${b.pares} pareados · visible ${b.vis}` : 'sin escena');
      check(`${nombre}: cada límite en el EXTREMO de su paño, basculando con él`,
            !!b && b.peorMid < 0.02 && b.peorLargo < 0.02 && b.peorNorm < 0.05,
            b ? `centro ${b.peorMid.toFixed(4)} m · separación ${b.peorLargo.toFixed(4)} m · normal ${b.peorNorm.toFixed(3)}°` : '');
      await pg.uncheck('#bordes');
      await pg.waitForTimeout(300);
      const off = await pg.evaluate(() => {
        const I = R3.inst;
        if (I && I.bordes) return I.bordes.visible === false;
        const bs = R3.bordesMesh || [];
        return bs.length > 0 && bs.every(x => !x.visible);
      });
      check(`${nombre}: la casilla los apaga (son VISTA: no cambian ni un vatio)`, off === true, 'apagados: ' + off);
      await pg.check('#bordes');
      await pg.waitForTimeout(300);
    }  }
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


  /* 9) EL ACUSE DE RECIBO DEL CLIC. «Cuando voy a marcar el check no me lo coge»
        era esto: el manejador de la casilla del lazo recalculaba todo DENTRO del
        `change`, síncrono, y el navegador no podía repintar la casilla hasta que
        acabara — 10.709 ms medidos en esta misma NCU. El clic entraba y parecía
        perdido, y el segundo lo desmarcaba.
        Lo que se vigila no es que sea rápido —no puede serlo: son tres millones
        de pasos de lazo, y es física— sino que la página ACUSE el clic antes de
        ponerse a trabajar. Si alguien quita el `conAcuse`, esto se pone rojo. */
  {
    await pg.evaluate(() => { for (const d of document.querySelectorAll('details.card'))
      if (/Lazo de control/.test(d.querySelector('summary')?.textContent || '')) d.open = true; });
    await pg.waitForTimeout(300);
    const t0 = Date.now();
    await pg.locator('#ctrlOn').click({ noWaitAfter: true });
    let acuse = null;
    for (let k = 0; k < 60 && !acuse; k++) {
      const p = await pg.evaluate(() => ({ pill: document.getElementById('modepill').textContent,
                                           marcada: document.getElementById('ctrlOn').checked })).catch(() => null);
      if (p && /calculando/.test(p.pill)) acuse = { ms: Date.now() - t0, marcada: p.marcada };
      else await pg.waitForTimeout(50);
    }
    check('el clic en el lazo se ACUSA antes de ponerse a calcular',
          !!acuse && acuse.ms < 2000 && acuse.marcada === true,
          acuse ? `avisó en ${acuse.ms} ms con la casilla ya marcada` :
                  'nunca apareció el acuse: el trabajo corre dentro del change y el clic parece perdido');
    await pg.waitForFunction(() => !/calculando/.test(document.getElementById('modepill').textContent),
                             null, { timeout: 180000 });
    const fin = await pg.evaluate(() => ({ pill: document.getElementById('modepill').textContent,
                                           marcada: document.getElementById('ctrlOn').checked }));
    check('y al acabar la casilla queda marcada y el chip vuelve a su estado',
          fin.marcada === true && /paso/.test(fin.pill), `chip «${fin.pill}»`);
    // y la prosa larga de la tarjeta viene PLEGADA: el motivo de la queja gemela
    const pros = await pg.evaluate(() => {
      const det = [...document.querySelectorAll('details')]
        .find(d => /los números, y de dónde salen/.test(d.querySelector('summary')?.textContent || ''));
      return det ? { abierto: det.open, palabras: det.textContent.trim().split(/\s+/).length } : null;
    });
    check('los números del lazo van PLEGADOS, no en un muro de texto',
          !!pros && pros.abierto === false && pros.palabras > 100,
          pros ? `${pros.palabras} palabras detrás del resumen` : 'no hay plegable');
  }

  /* ── LA CABECERA NO VUELVE A COLUMNAS ──────────────────────────────────────
     Estuvo en `columns:3 54ch` y en pantalla ancha eso no ahorra alto: reparte
     el MISMO texto en tiras y el bloque mide lo que la tira más larga. Medido
     con este mismo Chromium, en una sonda aparte a 2560 px: 48 px en un flujo
     contra 67 en tres columnas, o sea 19 px que empujaban hacia abajo el visor
     3D (a 1440 y 1920 daba igual, 86 y 67 px con columnas y sin ellas). Este
     candado no mide el alto —esta pestaña va a 1280, donde no se nota—: vigila
     que no vuelvan las columnas. */
  {
    const cab = await pg.evaluate(() => {
      const s = document.querySelector('.sub');
      const cs = getComputedStyle(s);
      return { cols: cs.columnCount, ancho: cs.columnWidth, regla: cs.columnRuleWidth };
    });
    check('la cabecera va en UN flujo, no en columnas',
          cab.cols === 'auto' && (cab.ancho === 'auto' || cab.ancho === 'normal'),
          `column-count ${cab.cols} · column-width ${cab.ancho}`);
  }

  /* ── GENERACIÓN FRENTE A POSICIÓN ─────────────────────────────────────────*/
  {
    const dib = await pg.evaluate(async () => {
      document.getElementById('hour').value = '720';
      document.getElementById('hour').dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      document.getElementById('bqbtn').click();
      await new Promise(r => setTimeout(r, 4000));
      const g = document.getElementById('bqgraf'), o = document.getElementById('bqout');
      return { svg: !!g.querySelector('svg'),
               curva: g.querySelectorAll('path').length,
               marcas: g.querySelectorAll('line[stroke-dasharray]').length,
               punto: g.querySelectorAll('circle').length,
               txt: (o.textContent || '') };
    });
    check('el barrido de posición DIBUJA: curva, las tres marcas y el punto de la política',
          dib.svg && dib.curva >= 1 && dib.marcas === 3 && dib.punto === 1,
          `curva ${dib.curva} · marcas ${dib.marcas} · punto ${dib.punto}`);
    check('y dice el óptimo, el astronómico y lo que cuesta un grado',
          /mejor ángulo ÚNICO/.test(dib.txt) && /astronómico/.test(dib.txt) && /un grado/.test(dib.txt),
          dib.txt.slice(0, 120));
    /* De noche NO se pinta una recta a cero —que se lee como un fallo—: se dice
       que la POA es cero a cualquier ángulo y dónde duerme la mesa. */
    const noche = await pg.evaluate(async () => {
      document.getElementById('hour').value = '0';
      document.getElementById('hour').dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      document.getElementById('bqbtn').click();
      await new Promise(r => setTimeout(r, 2500));
      return { svg: !!document.getElementById('bqgraf').querySelector('svg'),
               txt: document.getElementById('bqout').textContent || '' };
    });
    check('de noche no dibuja una recta a cero: dice que no hay curva y dónde duerme la mesa',
          !noche.svg && /cero a cualquier ángulo/.test(noche.txt) && /duerme a 5°/.test(noche.txt),
          noche.txt.slice(0, 140));
  }

  /* ────────────────────────────────────────────────────────────────────────────
     QUE LA ESCENA SE VEA. Este banco miraba el MODELO —posiciones, normales,
     tintes— y nunca lo PINTADO, y por ese hueco se colo que la pagina no mostrara
     absolutamente nada: solo cielo. La causa fue que `coloca()` movia la camara sin
     apuntarla (quien la orienta es R3.ctrl.update(), que corre DESPUES del bucle de
     encuadre), asi que el bucle proyectaba las ocho esquinas contra una vista que no
     era la real, `lleno()` no bajaba nunca y la distancia se multiplicaba por su tope
     1,7 las ocho vueltas: 1,7^8 = 70, y los 134 m de salida acababan en 9,3 km. Con
     el plano lejano en 6000 m la escena entera quedaba recortada.

     Se comprueban las dos caras del mismo hecho, porque cada una caza cosas
     distintas: que la caja de la escena OCUPE el lienzo (geometria) y que el lienzo
     tenga COLORES (pixeles). Lo segundo sobrevive a que alguien deje la camara bien
     y rompa el render por otro sitio. */
  {
    const m = await pg.evaluate(() => {
      const bb = new THREE.Box3().setFromObject(R3.world);
      let mx = 0, my = 0;
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(i & 1 ? bb.min.x : bb.max.x, i & 2 ? bb.min.y : bb.max.y,
                                    i & 4 ? bb.min.z : bb.max.z).project(R3.cam);
        if (!isFinite(p.x) || !isFinite(p.y)) return { roto: true };
        mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y));
      }
      const R = R3.renderer, gl = R.getContext(), cv = R.domElement, w = cv.width, h = cv.height;
      R.render(R3.scene, R3.cam);                       // PINTAR antes de leer: con
      const bf = new Uint8Array(w * h * 4);             // preserveDrawingBuffer apagado
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bf);   // el buffer llega vacio
      const col = new Set();
      for (let i = 0; i < w * h; i += 13) col.add(bf[i * 4] + ',' + bf[i * 4 + 1] + ',' + bf[i * 4 + 2]);
      const tam = bb.getSize(new THREE.Vector3());
      return { lleno: +Math.max(mx, my).toFixed(2), colores: col.size,
               dist: +R3.cam.position.distanceTo(R3.ctrl.target).toFixed(0),
               diag: +tam.length().toFixed(0) };
    });
    /* el objetivo del codigo es 0,86 del lienzo; la banda va holgada porque depende
       del tamano del lienzo, pero 9,3 km de camara dan 0,00 y eso no se salva */
    check('la escena OCUPA el lienzo (no se ha ido la cámara a tomar viento)',
          !m.roto && m.lleno >= 0.45 && m.lleno <= 1.15,
          'lleno=' + m.lleno + ' objetivo 0,86');
    /* y que la distancia guarde relacion con el tamano: un multiplo sano anda por 1-3
       diagonales, nunca por 60 */
    check('la cámara está a una distancia del orden del tamaño de la escena',
          !m.roto && m.dist < m.diag * 6,
          'dist=' + m.dist + ' m · diagonal=' + m.diag + ' m · ' + (m.dist / m.diag).toFixed(1) + '×');
    /* y que se PINTE: un lienzo de solo cielo da un punado de colores del degradado */
    check('el lienzo pinta la escena, no solo el cielo',
          m.colores >= 40, 'colores distintos: ' + m.colores);
  }

  check('sin errores de consola', errs.length === 0, errs.slice(0, 3).join(' · '));
  await browser.close();
} finally {
  try { srv.kill(); } catch { /* nada */ }
}
console.log('');
console.log(ko === 0 ? `OK — ${ok} comprobaciones` : `${ko} FALLOS de ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
