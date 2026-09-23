/* LA VISTA DE OVERCAST, EN CHROMIUM (overcast.html).
   Uso:  PUERTO=8133 node tools/test_overcast_vista.mjs

   Los bancos de LÓGICA PURA (test_overcast_sim.mjs) ya comprueban la física de
   las políticas. Esto comprueba lo que sólo se ve en la página: que el estado
   del cielo se LEE de la irradiancia que ya existe, que la escena responde al
   manto con las reglas que se midieron, y que se puede seleccionar un tracker.

   POR QUÉ ESTE BANCO EXISTE, con los números que lo motivaron. Antes de tocar
   nada se midió la escena real a mediodía, y de ahí salieron tres defectos que
   nadie vigilaba:

     · la sombra drapeada de las nubes estaba en su MÁXIMO (0,38) justo con
       cielo cubierto — el contraste de sombra de nube no es monótono con la
       nubosidad, necesita huecos Y nube;
     · el manto estaba a 34 m con la cámara encuadrada a 32 m, o sea DE CANTO;
     · `toneMappingExposure` clavado en 1,05 dejaba el overcast infraexpuesto:
       terreno a luma 54,5 contra un cielo a 128,9 (ratio 2,37), que es
       contraste ALTO, lo contrario de lo que enseña un cielo cubierto.

   Cada comprobación de abajo fija una de esas tres, POR COMPORTAMIENTO: no
   mira constantes, mira lo que la escena hace al cambiar de cielo. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUERTO = process.env.PUERTO || 8133;
const BASE = `http://127.0.0.1:${PUERTO}`;

let ok = 0, ko = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); }
                      catch (e) { ko++; console.error('  ✗ ' + n + ' — ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' obtenido ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b)); };

async function vivo() { try { return (await fetch(BASE + '/overcast.html')).ok; } catch { return false; } }
let srv = null;
if (!(await vivo())) {
  srv = spawn('python3', ['-m', 'http.server', String(PUERTO)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await vivo()); i++) await new Promise(r => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: EXE });
const pg = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errores = [];
pg.on('pageerror', e => errores.push(String(e).slice(0, 200)));
await pg.goto(BASE + '/overcast.html', { waitUntil: 'networkidle' });

/* EL PRESET NO SE APLICA AL CAMBIAR EL SELECT: lo aplica el botón. La sonda
   con la que se midió todo esto nació sin pulsarlo y daba números IDÉNTICOS en
   los dos cielos — un instrumento roto leído como hallazgo. Queda aquí escrito
   para que el siguiente no lo repita. */
async function pon(preset, minuto = 720) {
  await pg.selectOption('#skypreset', preset);
  await pg.click('#skyapply');
  await pg.waitForTimeout(900);
  await pg.fill('#hour', String(minuto));
  await pg.dispatchEvent('#hour', 'input');
  await pg.click('#tab3d').catch(() => {});
  await pg.waitForTimeout(1600);
  return pg.evaluate(() => {
    if (!TD) return { sinTD: true };
    const drape = [], nube = [];
    (TD.zones || []).forEach(Z => { if (Z.shadowMat) drape.push(+Z.shadowMat.opacity.toFixed(4)); if (Z.cloudMat) nube.push(+Z.cloudMat.opacity.toFixed(3)); });
    const txt = id => (document.getElementById(id) || {}).textContent || '';
    return {
      exposicion: +TD.renderer.toneMappingExposure.toFixed(3),
      solIntensidad: +TD.sun.intensity.toFixed(4),
      solSombra: TD.sun.castShadow,
      hemiIntensidad: +TD.hemi.intensity.toFixed(3),
      hemiSat: +(1 - Math.min(TD.hemi.color.r, TD.hemi.color.g, TD.hemi.color.b) /
                     Math.max(TD.hemi.color.r, TD.hemi.color.g, TD.hemi.color.b)).toFixed(4),
      drape, nube,
      camY: +TD.camera.position.y.toFixed(1),
      nubeY: (TD.zones[0] && TD.zones[0].cloudMesh) ? +TD.zones[0].cloudMesh.position.y.toFixed(1) : null,
      panel: { visible: document.getElementById('sky3d').style.display !== 'none',
               estado: txt('sky3dTxt').trim(), cc: txt('sky3dCC').trim(),
               ghi: txt('sky3dGHI').trim(), dni: txt('sky3dDNI').trim(), dhi: txt('sky3dDHI').trim(),
               directa: txt('sky3dPD').trim() },
    };
  });
}

console.log('el estado del cielo sale de la irradiancia que ya existe');
const OV = await pon('overcast');
const CL = await pon('despejado');
t('con manto cerrado el panel dice OVERCAST', () => eq(OV.panel.estado, 'OVERCAST'));
t('y con cielo claro dice DESPEJADO', () => eq(CL.panel.estado, 'DESPEJADO'));
t('el panel está a la vista en la escena', () => eq(OV.panel.visible, true));
/* NO SE INVENTA NADA: en overcast el core declara DNI = 0 y DHI = GHI (el
   overcast canónico del escenario de test del core). Si el panel se estuviera
   alimentando de otra cosa, estas tres no cuadrarían entre sí. */
t('overcast: DNI = 0 y DHI = GHI, que es el overcast canónico', () => {
  eq(OV.panel.dni, '0 W/m²');
  if (OV.panel.dhi !== OV.panel.ghi) throw new Error('DHI ' + OV.panel.dhi + ' ≠ GHI ' + OV.panel.ghi);
});
t('overcast: el reparto dice 0 % directa', () => eq(OV.panel.directa, 'DIRECTA 0 %'));
t('y con cielo claro la directa NO es 0 %', () => {
  if (CL.panel.directa === 'DIRECTA 0 %') throw new Error('directa 0 % con cielo claro');
});

console.log('la sombra de nube no es monótona con la nubosidad');
/* EL CONTROL QUE HACE QUE ESTO PRUEBE ALGO. Con la regla vieja —0,38·min(1,
   cc·1,4)— la sombra CRECE con la nubosidad y satura en cc = 0,714, así que
   con cc 0,95 estaría en su máximo y esta comprobación saldría roja. Se exige
   que el cielo cubierto deje MENOS mancha que el parcial, que es lo que pasa
   de verdad: bajo tapa cerrada no hay bordes que proyectar. */
const PAR = await pon('tarde', 1020);
t('el cielo cubierto deja MENOS sombra drapeada que el parcialmente nublado', () => {
  const ov = Math.max(...OV.drape, 0), pa = Math.max(...PAR.drape, 0);
  if (!(ov < pa)) throw new Error('overcast ' + ov + ' no es menor que parcial ' + pa);
});
t('y con manto cerrado la mancha es casi nula', () => {
  const ov = Math.max(...OV.drape, 0);
  if (!(ov < 0.12)) throw new Error('drape ' + ov + ' sigue alto con cc≈0,95');
});

console.log('sin haz no hay sombra dura');
t('overcast a mediodía: la direccional deja de proyectar', () => eq(OV.solSombra, false));
t('despejado a mediodía: la direccional SÍ proyecta', () => eq(CL.solSombra, true));

console.log('la exposición se adapta; la física no');
t('el cielo cubierto se expone más que el claro', () => {
  if (!(OV.exposicion > CL.exposicion)) throw new Error('overcast ' + OV.exposicion + ' ≤ claro ' + CL.exposicion);
});
t('y la directa del motor sigue cayendo con el DNI (la física no se ha tocado)', () => {
  if (!(OV.solIntensidad < 0.2 * CL.solIntensidad)) throw new Error('sol overcast ' + OV.solIntensidad + ' vs claro ' + CL.solIntensidad);
});
t('la luz ambiente del cielo cubierto es MÁS NEUTRA que la del claro', () => {
  if (!(OV.hemiSat < CL.hemiSat)) throw new Error('sat overcast ' + OV.hemiSat + ' ≥ claro ' + CL.hemiSat);
});

console.log('la nube está por encima de la escena, no de canto');
t('el manto está muy por encima del ojo de la cámara', () => {
  if (OV.nubeY == null) throw new Error('sin manto');
  if (!(OV.nubeY > 2 * OV.camY)) throw new Error('nube a ' + OV.nubeY + ' m con la cámara a ' + OV.camY + ' m');
});

console.log('seleccionar un tracker');
await pon('overcast');
/* LA VISTA 3D VIVE POR DEBAJO DEL PLIEGUE. `getBoundingClientRect()` da
   coordenadas de VENTANA, así que sin traerla a pantalla el clic caía fuera y
   los cuatro casos de selección salían rojos — con el raycast funcionando
   perfectamente por dentro (comprobado: acertaba la viga z0·f2). Banco roto
   leído como página rota; se apunta para no repetirlo. */
await pg.locator('#view3d').scrollIntoViewIfNeeded();
await pg.waitForTimeout(300);
/* NO SE CLICA A CIEGAS EN EL CENTRO. Se probó, y falla por una razón que
   merece quedar escrita: con cielo cubierto las mesas se ponen PLANAS (θ ≈ +1°)
   y el centro del lienzo cae entre dos filas, sobre el suelo. El mismo clic
   acertaba con el preset de tarde, donde el θ es de −30° y la pala tapa el
   hueco. Un banco que depende de por dónde ande el tracker no mide la
   selección: mide la hora. Se proyecta la posición REAL de una viga conocida
   con la cámara de la escena y se clica ahí. */
const caja = await pg.evaluate(() => {
  const r = document.querySelector('#view3d canvas').getBoundingClientRect();
  let obj = null;
  TD.world.traverse(o => { if (!obj && o.userData && o.userData.pick) obj = o; });
  if (!obj) return null;
  const v = new THREE.Vector3();
  obj.getWorldPosition(v);
  v.project(TD.camera);
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height,
           objetivo: obj.userData.pick };
});
if (!caja) { console.error('  ✗ no hay ninguna viga con identidad en la escena'); process.exit(1); }
await pg.mouse.click(caja.x, caja.y);
await pg.waitForTimeout(400);
const ficha = await pg.evaluate(() => {
  const b = document.getElementById('pick3d');
  return { visible: b.style.display !== 'none', tit: document.getElementById('pickTit').textContent,
           cuerpo: document.getElementById('pickBody').textContent };
});
t('un clic sobre la planta abre la ficha del tracker', () => eq(ficha.visible, true));
t('y la ficha es la del tracker que se ha clicado', () => {
  if (!ficha.cuerpo.includes('#' + String(caja.objetivo.fila + 1).padStart(2, '0')))
    throw new Error('se clicó la fila ' + caja.objetivo.fila + ' y la ficha dice ' + ficha.cuerpo.slice(0, 60));
});
t('y la ficha trae el θ EJECUTADO', () => {
  if (!/θ ejecutado/.test(ficha.cuerpo)) throw new Error('sin θ: ' + ficha.cuerpo.slice(0, 80));
});
t('y las tres componentes de irradiancia que sí existen', () => {
  for (const k of ['GHI', 'DNI', 'DHI'])
    if (!ficha.cuerpo.includes(k)) throw new Error('falta ' + k);
});
/* ARRASTRAR NO ES SELECCIONAR: OrbitControls usa el mismo botón, así que sin
   esta regla orbitar terminaba siempre abriendo la ficha. */
await pg.mouse.move(caja.x, caja.y);
await pg.mouse.down();
await pg.mouse.move(caja.x + 60, caja.y + 30, { steps: 6 });
await pg.mouse.up();
await pg.waitForTimeout(300);
const trasArrastre = await pg.evaluate(() => document.getElementById('pick3d').style.display !== 'none');
t('orbitar (arrastrar) NO cambia la selección por accidente', () => eq(trasArrastre, true));

t('la página no ha lanzado ningún error', () => {
  if (errores.length) throw new Error(errores[0]);
});

await browser.close(); if (srv) srv.kill();
console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
