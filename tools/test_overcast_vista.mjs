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

console.log('los trackers se separan del terreno POR BRILLO, no sólo por tono');
/* SE MIDE EL RENDER, NO EL MATERIAL. Fijar `mats.glass.color` a una constante
   pinaría el número que escribí, no la propiedad que importa — y la propiedad
   es que el tracker se distinga del suelo en LUMINANCIA. Se repinta la escena y
   se leen sus píxeles clasificándolos por color: azulados saturados = pala,
   verdosos = terreno, bajo el horizonte.

   POR QUÉ, con la medida que lo motivó. Antes de este cambio:

                    módulos   terreno   contraste
       overcast       65,5      68,4      0,043
       despejado      87,5      84,8      0,031

   O sea el MISMO brillo: se distinguían sólo por tono. En escala de grises la
   planta desaparecía dentro del campo, y quien no separe bien azul de verde no
   la veía. El listón de 0,15 deja fuera con holgura aquel 0,043 y no ata la
   elección exacta del azul. */
async function contrasteRender() {
  return pg.evaluate(() => {
    const cv = TD.renderer.domElement;
    TD.renderer.render(TD.scene, TD.camera);        // repintar y leer en el MISMO turno
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const x = c2.getContext('2d');
    x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, Math.floor(c2.height * 0.30), c2.width, Math.floor(c2.height * 0.65)).data;
    let na = 0, la = 0, nv = 0, lv = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (b > r + 22 && b > g + 10 && sat > 0.30) { na++; la += L; }
      else if (g > r + 8 && g > b + 8) { nv++; lv += L; }
    }
    if (!na || !nv) return { na, nv, contraste: null };
    la /= na; lv /= nv;
    return { na, nv, lumaMod: +la.toFixed(1), lumaTer: +lv.toFixed(1),
             contraste: +(Math.abs(la - lv) / Math.max(la, lv)).toFixed(3) };
  });
}
await pon('overcast');
const CTO = await contrasteRender();
await pon('despejado');
const CTC = await contrasteRender();
/* TEST NULO: si la clasificación no encuentra píxeles de los dos tipos, el
   contraste no mide nada y un cero saldría «verde» por vacío. */
t('la escena tiene píxeles de pala Y de terreno que clasificar', () => {
  if (!(CTO.na > 2000 && CTO.nv > 2000)) throw new Error('pala ' + CTO.na + ' · terreno ' + CTO.nv);
});
t('con cielo cubierto la pala se separa del terreno en brillo', () => {
  if (!(CTO.contraste > 0.15)) throw new Error('contraste ' + CTO.contraste +
    ' (pala ' + CTO.lumaMod + ' vs terreno ' + CTO.lumaTer + ')');
});
t('y con cielo claro también', () => {
  if (!(CTC.contraste > 0.15)) throw new Error('contraste ' + CTC.contraste +
    ' (pala ' + CTC.lumaMod + ' vs terreno ' + CTC.lumaTer + ')');
});

console.log('la transición es de pintura: el θ no pasa por ella');
/* EL CONTROL QUE HACE QUE ESTO PRUEBE ALGO, y es el único que importa de esta
   tanda. Suavizar la luz sería indefendible si suavizara también la física, así
   que no basta con ver que las luces tardan: hay que ver que el θ NO tarda.
   Se salta de overcast a despejado y se mira 120 ms después —bastante menos que
   la constante de 0,18 s— qué ha cambiado ya y qué no.
   Si alguien metiera el θ por el mismo interpolador, la segunda comprobación
   se pondría roja aunque la primera siguiera verde. */
await pon('overcast');
/* SE LEE LA ROTACIÓN DE LA VIGA, NO `thDeg`. La primera versión de esta
   comprobación miraba `TD.zones[0].thDeg` y el mutante que mete el θ por el
   interpolador SALIÓ VERDE: `thDeg` se reescribe con el valor sin suavizar unas
   líneas más abajo, así que estaba vigilando el θ REPORTADO y no el que gira en
   pantalla — que es justo lo que la afirmación promete. Se lee la rotación real
   de la malla, en radianes. */
const rot = () => pg.evaluate(() => ({ sun: TD.sun.intensity,
                                       th: TD.zones[0].thDeg,
                                       rx: TD.zones[0].spins[0].rotation.x }));
const antes = await rot();
await pg.selectOption('#skypreset', 'despejado');
await pg.click('#skyapply');
await pg.waitForTimeout(120);
const pronto = Object.assign(await rot(), { objSun: await pg.evaluate(() => TD.obj.sunI) });
await pg.waitForTimeout(1500);
const luego = await rot();
t('la luz NO ha llegado a su destino a los 120 ms (hay transición)', () => {
  const recorrido = Math.abs(pronto.sun - antes.sun) / Math.max(1e-9, Math.abs(pronto.objSun - antes.sun));
  if (!(recorrido < 0.92)) throw new Error('a los 120 ms ya ha recorrido el ' + (100 * recorrido).toFixed(0) + ' %: no hay transición');
  if (!(recorrido > 0.05)) throw new Error('a los 120 ms no se ha movido nada (' + (100 * recorrido).toFixed(1) + ' %): no arranca');
});
t('y SÍ llega cuando acaba', () => {
  if (!(Math.abs(luego.sun - pronto.objSun) < 0.02 * Math.max(0.1, pronto.objSun)))
    throw new Error('la luz se queda en ' + luego.sun.toFixed(3) + ' con destino ' + pronto.objSun.toFixed(3));
});
t('EL θ NO SE SUAVIZA: la viga llega entera en el mismo instante', () => {
  // TEST NULO: el θ del instante TIENE que cambiar entre los dos cielos
  // (poa_switch aplana en overcast). Si no cambiara, esto no distinguiría nada.
  if (Math.abs(luego.rx - antes.rx) < 1e-6)
    throw new Error('la viga no se mueve entre los dos cielos: la comprobación no distingue nada');
  if (Math.abs(pronto.rx - luego.rx) > 1e-9)
    throw new Error('a los 120 ms la viga está en ' + pronto.rx.toFixed(6) + ' rad y acaba en ' +
                    luego.rx.toFixed(6) + ': está pasando por el interpolador');
  if (Math.abs(pronto.th - luego.th) > 1e-9)
    throw new Error('el θ publicado a los 120 ms (' + pronto.th + ') no es el final (' + luego.th + ')');
});

console.log('Y TAMBIÉN EN UNA PLANTA REAL, que es por donde se coló');
/* ESTE BLOQUE EXISTE POR UN FALLO CONCRETO. La v1.27 subió el manto de nubes
   en la escena SINTÉTICA porque estaba a 34 m con la cámara a 32 — se veía de
   canto. La rama de PLANTA REAL tiene su propio constructor, con la altura
   CLAVADA en 170 m y un encuadre que pone la cámara en 0,42·L: con Páramo
   (L = 617) eso son 259 m de cámara y las nubes 89 m POR DEBAJO. Resultado:
   los mantos se veían desde arriba, tumbados sobre la planta como churretes
   blancos que velaban los trackers.

   No lo cazó nadie porque verifiqué sobre la sintética y no abrí una planta
   real — y el banco hacía lo mismo. Lo reportó Iñaki mirando Páramo.

   Así que la comprobación no se queda en «la nube está arriba en la escena de
   siempre»: se carga una planta REAL y se exige lo mismo allí. */
await pg.check('#zonalOn');
await pg.selectOption('#realplant', 'paramo');
await pg.waitForTimeout(3500);
await pg.selectOption('#skypreset', 'overcast');
await pg.click('#skyapply');
await pg.waitForTimeout(1200);
await pg.click('#tab3d').catch(() => {});
await pg.waitForTimeout(2500);
const REAL = await pg.evaluate(() => {
  if (!TD.real) return { sinPlanta: true };
  const c = TD.real.cols.map(x => ({ y: +x.cloud.position.y.toFixed(1), op: +x.mw.opacity.toFixed(3) }));
  return { camY: +TD.camera.position.y.toFixed(1), n: c.length,
           yMin: Math.min(...c.map(x => x.y)), opMax: Math.max(...c.map(x => x.op)),
           mesas: (TD.real.groups.find(g => g.key === 'mesa') || {}).n };
});
t('la planta real carga de verdad (si no, lo de abajo no mide nada)', () => {
  if (REAL.sinPlanta) throw new Error('no hay TD.real: la planta no cargó');
  if (!(REAL.n > 0)) throw new Error('sin mantos que comprobar');
});
t('en la planta REAL la nube también está por encima de la cámara', () => {
  if (!(REAL.yMin > REAL.camY)) throw new Error('manto a ' + REAL.yMin +
    ' m con la cámara a ' + REAL.camY + ' m: se ve desde arriba, tumbado sobre la planta');
});
t('y con margen, no rozando (orbitar hacia arriba no debe meterse dentro)', () => {
  if (!(REAL.yMin > 1.8 * REAL.camY)) throw new Error('manto a ' + REAL.yMin +
    ' m contra cámara a ' + REAL.camY + ' m: margen ' + (REAL.yMin / REAL.camY).toFixed(2) + '×');
});

console.log('el rótulo no mengua con la distancia, y cada NCU se ve en el suelo');
/* POR QUÉ ESTAS TRES, con la medida que las motivó. Iñaki dijo «las letras muy
   pixeladas» y la sonda lo reprodujo con su mismo encuadre en Páramo:

       ancho del rótulo en pantalla    47,7 - 52,6 px CSS
       textura                         384 x 132
       minificación                    3,65x - 4,03x
       alto real del texto «NCU»       ~9,9 px de dispositivo

   No era el filtro —ya era el correcto, y mi primera lectura dijo otra cosa
   porque la tabla de constantes estaba desplazada una posición—: era que la
   talla era un tamaño de MUNDO fijo y el rótulo encogía al alejarse la cámara.

   Se mide POR COMPORTAMIENTO: se aleja la cámara y se exige que el ancho EN
   PANTALLA no se mueva. Con la regla vieja esta comprobación sale roja sola,
   porque el ancho caía en proporción a la distancia. */
async function anchoRotulo() {
  return pg.evaluate(() => {
    const r = document.querySelector('#view3d canvas').getBoundingClientRect();
    let s = null; TD.scene.traverse(o => { if (!s && o.isSprite && o.userData && o.userData.rotulo) s = o; });
    if (!s) return null;
    const c = new THREE.Vector3(); s.getWorldPosition(c);
    const der = new THREE.Vector3(); TD.camera.getWorldDirection(der);
    der.crossVectors(der, new THREE.Vector3(0, 1, 0)).normalize();
    const a = c.clone().addScaledVector(der, -s.scale.x / 2).project(TD.camera);
    const b = c.clone().addScaledVector(der,  s.scale.x / 2).project(TD.camera);
    const cam = new THREE.Vector3(); TD.camera.getWorldPosition(cam);
    return { px: Math.abs(b.x - a.x) / 2 * r.width, d: cam.distanceTo(c) };
  });
}
const ROT1 = await anchoRotulo();
await pg.evaluate(() => { TD.camera.position.multiplyScalar(1.8); TD.controls.update(); });
await pg.waitForTimeout(500);
const ROT2 = await anchoRotulo();
t('TEST NULO: la cámara se ha alejado de verdad', () => {
  if (!ROT1 || !ROT2) throw new Error('no hay rótulo que medir');
  if (!(ROT2.d > 1.4 * ROT1.d)) throw new Error('distancia ' + ROT1.d.toFixed(0) + ' -> ' + ROT2.d.toFixed(0) + ': no se ha alejado');
});
t('el rótulo mantiene su ancho EN PANTALLA al alejarse la cámara', () => {
  const rel = Math.abs(ROT2.px - ROT1.px) / Math.max(1, ROT1.px);
  if (!(rel < 0.08)) throw new Error('ancho ' + ROT1.px.toFixed(1) + ' -> ' + ROT2.px.toFixed(1) +
    ' px (' + (100 * rel).toFixed(0) + ' %): está menguando con la distancia');
});
t('y a esa talla la textura ya no se minifica: el texto se lee', () => {
  if (!(ROT2.px * 2 > 0.4 * 384)) throw new Error('rótulo a ' + ROT2.px.toFixed(1) +
    ' px CSS: la textura de 384 px se minifica más de 2,5x y el texto se deshace');
});
/* LA HUELLA NO SE INVENTA LA PARTICIÓN: sale del layout. Se exige que las
   bandas cubran TODAS las filas y que repartan entre TODAS las NCUs que el
   layout declara — si alguien las pintara todas del mismo color, o se dejara
   una zona fuera, esto se pone rojo. */
const HU = await pg.evaluate(() => {
  const h = TD.real && TD.real.huella;
  if (!h) return { sinHuella: true };
  const filas = TD.real.groups.filter(g => g.key === 'mesa').reduce((s, g) => s + g.rows.length, 0);
  const cols = new Set(); const c = new THREE.Color();
  for (let i = 0; i < h.count; i++) { h.getColorAt(i, c); cols.add(c.getHexString()); }
  return { visible: h.visible, n: h.count, filas: filas, tonos: cols.size,
           nZonas: TD.real.nZones };
});
t('la planta real dibuja la huella de las NCUs', () => {
  if (HU.sinHuella) throw new Error('no hay TD.real.huella');
  if (!HU.visible) throw new Error('la huella existe pero está oculta con el zonal puesto');
});
t('hay una banda por fila: la huella no se inventa suelo', () => {
  if (HU.n !== HU.filas) throw new Error(HU.n + ' bandas contra ' + HU.filas + ' filas de mesa');
});
t('y hay tantos colores como NCUs declara el layout', () => {
  if (HU.tonos !== HU.nZonas) throw new Error(HU.tonos + ' tonos para ' + HU.nZonas + ' NCUs');
});
/* EN MODO PLANTA NO HAY PARTICIÓN, así que pintar cuatro manchas sería mentir. */
await pg.uncheck('#zonalOn');
await pg.waitForTimeout(1200);
const HU_OFF = await pg.evaluate(() => !!(TD.real && TD.real.huella && TD.real.huella.visible));
t('en modo PLANTA la huella se apaga (no hay NCUs que separar)', () => eq(HU_OFF, false));
await pg.check('#zonalOn');
await pg.waitForTimeout(1200);

t('la página no ha lanzado ningún error', () => {
  if (errores.length) throw new Error(errores[0]);
});

await browser.close(); if (srv) srv.kill();
console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
