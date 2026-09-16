/* LAS SOMBRAS ESTAN, Y EN TODO EL CAMPO.
 *
 * Lo reporto el usuario mirando el visor: «por que no todos los trackers tienen
 * sombra?». El recuadro del mapa de sombra se ceñia alrededor de la camara al bajar
 * al suelo y lo que quedaba fuera NO PROYECTABA NADA — a ras de suelo, 83 de 215
 * seguidores en El Burgo y 48 de 2.289 en San Jose.
 *
 * NINGUN BANCO LO VIGILABA, y no por descuido: lo que habia que mirar no es una
 * cifra del modelo sino lo que sale pintado. Aqui se mide PINTANDO el mismo cuadro
 * dos veces, con `SUN.castShadow` y sin el, y contando que pixeles se oscurecen.
 * Esa diferencia ES la sombra, sin depender de adivinar un color ya mezclado.
 *
 * Y se mide POR FRANJAS. Con el recuadro ceñido la sombra del primer plano seguia
 * estando: lo que desaparecia era la del resto del campo. Un numero global lo habria
 * dado por bueno.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_sombras.mjs elburgo
 *   SOMBRA_CAJA=vieja node tools/test_sombras.mjs elburgo    (mutacion: TIENE que salir rojo)
 *
 * EN CI VA SOLO EL BURGO. Medido aqui: El Burgo 9 min 14 s, San Jose 19 min 55 s
 * —2.289 seguidores y un mapa de sombra que cubre 3,2 km de lado—. El defecto es el
 * mismo en las dos y El Burgo lo caza igual, asi que San Jose se corre A MANO cuando
 * se toque esto. Su resultado, para no tener que repetirlo por curiosidad:
 *
 *     camara   dentro del recuadro   px en sombra   sesgo(m)
 *       10 m        2289/2289          16,61 %       0,250
 *       30 m        2289/2289          13,33 %       0,250
 *       90 m        2289/2289          10,93 %       0,250
 *      300 m        2289/2289           8,03 %       0,250
 *
 * Antes del arreglo eran 48 de 2.289 a ras de suelo.
 */
import { chromium } from 'playwright-core';
import zlib from 'node:zlib';
import { EXE } from './pw_navegador.mjs';

const PUERTO = process.env.PUERTO || 8124;
const PLANTAS = { elburgo:'El Burgo', ayora:'Ayora', sanjose:'San José', paramo:'Páramo',
                  fayon:'Fayón', tunez:'Túnez', panbianco:'Panbianco', benante:'Benante',
                  polvorin:'El Polvorín', bagnarelli:'Bagnarelli' };
const SOLO = process.argv[2] || 'elburgo';
if (!PLANTAS[SOLO]) { console.error('planta desconocida. Hay: ' + Object.keys(PLANTAS).join(', ')); process.exit(2); }
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

/* PNG a luminancia, sin dependencias nuevas (el repo no mete paquetes por esto). */
function luz(dataUrl) {
  const b = Buffer.from(dataUrl.split(',')[1], 'base64');
  let i = 8, w = 0, h = 0; const idat = [];
  while (i < b.length) { const len = b.readUInt32BE(i), t = b.toString('ascii', i + 4, i + 8);
    if (t === 'IHDR') { w = b.readUInt32BE(i + 8); h = b.readUInt32BE(i + 12); }
    if (t === 'IDAT') idat.push(b.slice(i + 8, i + 8 + len)); i += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const px = Buffer.alloc(h * stride); let p = 0;
  for (let y = 0; y < h; y++) { const ft = raw[p++]; const ln = raw.slice(p, p + stride); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, u = y > 0 ? px[(y - 1) * stride + x] : 0,
            c = (x >= bpp && y > 0) ? px[(y - 1) * stride + x - bpp] : 0;
      let v = ln[x];
      if (ft === 1) v += a; else if (ft === 2) v += u; else if (ft === 3) v += (a + u) >> 1;
      else if (ft === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? u : c); }
      px[y * stride + x] = v & 255; } }
  const L = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) L[k] = (px[k * 4] + px[k * 4 + 1] + px[k * 4 + 2]) / 3;
  return { w, h, L };
}
/* Fraccion de pixeles que se OSCURECEN al encender la sombra, dentro de una banda de
   filas dada EN PIXELES. Las bandas no se fijan como fraccion de la pantalla: salen de
   donde caen los seguidores proyectados (ver `bandas` en la pagina). Con fracciones
   fijas, a 300 m de altura la banda «lejos» caia en el CIELO y el banco se ponia rojo
   por su propio encuadre, no por un defecto. */
function sombraEnBanda(con, sin, bandas) {
  const a = luz(con), b = luz(sin), out = [];
  for (const [y0, y1] of bandas) {
    let n = 0, som = 0;
    for (let y = Math.max(0, y0); y < Math.min(a.h, y1); y++) for (let x = 0; x < a.w; x++) {
      const k = y * a.w + x; n++; if (b.L[k] - a.L[k] > 6) som++; }
    out.push(n ? +(100 * som / n).toFixed(2) : null);
  }
  return out;
}

const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 520 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage();
const errores = [];
pg.on('pageerror', e => errores.push(String(e).slice(0, 140)));
await pg.route('**/tcu.glb', r => r.abort());   // 4,4 MB que aqui no pintan nada
const t0 = Date.now();
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${SOLO}`,
              { waitUntil: 'domcontentloaded', timeout: 180000 });
while (!(await pg.evaluate(() => typeof NODES !== 'undefined' && NODES && NODES.length &&
                                 window.SUN && window.renderer && SH_HALF > 0))) {
  if (Date.now() - t0 > 300000) throw new Error('la escena no montó en 5 min');
  await pg.waitForTimeout(600);
}
/* se congela lo que se anima solo: si no, entre el cuadro CON y el SIN se mueven las
   nubes y su sombra, y la resta deja de medir lo que se quiere medir */
await pg.evaluate(() => { try { TOUR_ON = false; } catch (e) {} try { playing = false; } catch (e) {}
  for (const f of ['animateSky','animateMeteo','cloudShadowStep','genPulse','stowStep','viajeStep','flyStep'])
    try { window[f] = function(){}; } catch (e) {} });
await pg.waitForTimeout(500);

const ALTURAS = [10, 30, 90, 300];
/* DOS PASADAS, y no una por altura. Ahora que la caja es FIJA, el mapa de sombra no
   depende de donde este la camara: es el mismo para las cuatro alturas. Se hacen los
   cuatro cuadros CON sombra (una sola reconstruccion del mapa) y luego los cuatro SIN.
   Apagar y encender `castShadow` en cada altura obligaba a reconstruir el mapa de
   8192x8192 ocho veces, que bajo SwiftShader son 67 Mpx en software cada vez. */
const tomar = await pg.evaluate(({ALTS, VIEJA}) => {
  setTime(15 * 60);
  /* PRUEBA DE MUTACION, con `SOMBRA_CAJA=vieja`: se vuelve a poner el recuadro que se
     ceñia a la camara —el defecto que se arreglo— y el banco TIENE que ponerse rojo.
     Es de donde salen los umbrales: no se eligen a ojo, se eligen entre lo que da el
     codigo bueno y lo que da el malo. Fuera de esta prueba no se usa. */
  if (VIEJA) {
    const orig = updateSunShadow;
    window.updateSunShadow = function(){
      orig();
      const sc = SUN.shadow.camera, dir = SUN._ldir || SUN._dir;
      const HALF = (typeof SHX_HALF !== 'undefined' && SHX_HALF) ? SHX_HALF : SH_HALF;
      const CX = (typeof SHX_HALF !== 'undefined' && SHX_HALF) ? SHX_CX : SH_CX;
      const CZ = (typeof SHX_HALF !== 'undefined' && SHX_HALF) ? SHX_CZ : SH_CZ;
      let cx = CX, cz = CZ, half = HALF;
      const hAd = Math.min(HALF, Math.max(160, Math.ceil((100 + 2.4*camera.position.y)/20)*20));
      if (hAd < HALF - 1) {
        half = hAd;
        const vd = camera.getWorldDirection(new THREE.Vector3());
        const bx = camera.position.x + vd.x*half*0.45, bz = camera.position.z + vd.z*half*0.45;
        cx = Math.max(CX-(HALF-half), Math.min(CX+(HALF-half), bx));
        cz = Math.max(CZ-(HALF-half), Math.min(CZ+(HALF-half), bz));
        const tw = 2*half/(SUN.shadow.mapSize.x||4096);
        cx = Math.round(cx/tw)*tw; cz = Math.round(cz/tw)*tw;
      }
      sc.left=-half; sc.right=half; sc.top=half; sc.bottom=-half;
      const d = half*4+700; sc.near=Math.max(1,d-half*2.6); sc.far=d+half*2.6; sc.updateProjectionMatrix();
      const uS = Math.max(0.02, dir.U);
      SUN.position.set(cx+dir.E*d, uS*d, cz-dir.N*d);
      SUN.target.position.set(cx,0,cz); SUN.target.updateMatrixWorld();
      SUN.shadow.bias = -0.0003;                    // el sesgo de antes, en unidades de frustum
      renderer.shadowMap.needsUpdate = true;        // la caja se mueve con la camara: hay que rehacer el mapa
    };
  }                               // sol de tarde: sombras largas y legibles
  /* la camara, anclada a un seguidor REAL y no al centro del recuadro: en San Jose ese
     centro cae en campo vacio y se mide el desierto */
  let sx = 0, sz = 0; for (const n of NODES) { sx += n.gx; sz += n.gz; }
  const cx = sx / NODES.length, cz = sz / NODES.length;
  let cerca = NODES[0], best = Infinity;
  for (const n of NODES) { const d = Math.hypot(n.gx - cx, n.gz - cz); if (d < best) { best = d; cerca = n; } }
  const y0 = (typeof elevAt === 'function') ? (elevAt(cerca.gx, cerca.gz) || 0) : 0;
  const coloca = (A) => {
    camera.position.set(cerca.gx - A * 0.6, y0 + A, cerca.gz + A * 1.2);
    controls.target.set(cerca.gx + A * 1.4, y0 + 1, cerca.gz - A * 2.4);
    controls.update(); camera.updateMatrixWorld(true); updateSunShadow();
  };
  /* LAS BANDAS SALEN DE LA GEOMETRIA. Se proyectan los seguidores a pantalla, se
     ordenan por distancia a la camara y se cogen el tercio MAS LEJANO y el mas
     cercano; la banda es el rango de filas que ocupan. Asi «lejos» es lejos de verdad
     y no una fraccion de pantalla que a 300 m de altura cae en el cielo. */
  const bandasDe = () => {
    const v = new THREE.Vector3(), vis = [];
    for (const n of NODES) {
      v.set(n.gx, (typeof elevAt === 'function' ? (elevAt(n.gx, n.gz) || 0) : 0) + 2, n.gz);
      const d = camera.position.distanceTo(v);
      v.project(camera);
      if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) continue;   // fuera de cuadro
      vis.push({ d, fila: Math.round((1 - v.y) / 2 * renderer.domElement.height) });
    }
    if (vis.length < 20) return null;
    vis.sort((a, b) => a.d - b.d);
    const tercio = Math.max(5, Math.floor(vis.length / 3));
    const franja = (arr) => { const f = arr.map(o => o.fila).sort((a, b) => a - b);
      return [f[Math.floor(f.length * 0.1)], f[Math.floor(f.length * 0.9)] + 1]; };
    return { cerca: franja(vis.slice(0, tercio)), lejos: franja(vis.slice(-tercio)),
             visibles: vis.length };
  };
  const pinta = () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); };
  const salida = [];
  /* UN SOLO MAPA DE SOMBRA PARA TODO. `shadowMap.autoUpdate` lo reconstruye en CADA
     cuadro, y son 8192x8192 en software: la primera version de esto tardaba 9 min 32 s
     porque hacia ocho reconstrucciones sin necesidad. Como la caja ya no depende de la
     camara y las animaciones estan congeladas, el mapa vale para las ocho tomas: se
     construye una vez y se apaga la reconstruccion automatica. */
  coloca(ALTS[0]); renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
  if (!VIEJA) renderer.shadowMap.autoUpdate = false;   // con la caja vieja el mapa cambia con la camara: no se puede reutilizar
  for (const A of ALTS) {
    coloca(A);
    const bandas = bandasDe();
    const sc = SUN.shadow.camera, tx = SUN.target.position.x, tz = SUN.target.position.z;
    let dentro = 0;
    for (const n of NODES) if (Math.abs(n.gx - tx) <= sc.right && Math.abs(n.gz - tz) <= sc.right) dentro++;
    salida.push({ alt: A, con: pinta(), bandas, dentro, total: NODES.length, half: sc.right,
                  sesgo: SUN.shadow.bias, rango: sc.far - sc.near, solU: +SUN._dir.U.toFixed(3) });
  }
  /* OJO AL ORDEN: `coloca` llama a `updateSunShadow`, y esa funcion vuelve a ENCENDER
     `SUN.castShadow` (`if(SUN.castShadow!==!raso)SUN.castShadow=!raso`). Apagarlo antes
     de colocar la camara no sirve de nada: los cuadros «sin sombra» salian CON sombra y
     la resta daba cero en todas las bandas. Se apaga DESPUES de colocar, cada vez. */
  const g = SUN.castShadow;
  for (let i = 0; i < ALTS.length; i++) { coloca(ALTS[i]); SUN.castShadow = false; salida[i].sin = pinta(); }
  SUN.castShadow = g;
  return salida;
}, { ALTS: ALTURAS, VIEJA: process.env.SOMBRA_CAJA === 'vieja' });

const filas = tomar.map(r => {
  const [todo] = sombraEnBanda(r.con, r.sin, [[0, 1e9]]);
  return { ...r, todo, visibles: r.bandas ? r.bandas.visibles : null };
});

if (process.env.SOMBRA_CAJA === 'vieja') console.log('### CAJA VIEJA (la que se ceñía a la cámara): este banco TIENE que salir rojo\n');
console.log(`\n${PLANTAS[SOLO]} · ${filas[0].total} seguidores · semilado ${filas[0].half.toFixed(0)} m · sol ${(Math.asin(filas[0].solU)*180/Math.PI).toFixed(0)}°`);
console.log('camara   dentro del recuadro   seguidores en cuadro   pixeles en sombra   semilado   sesgo(m)');
for (const f of filas) console.log(
  String(f.alt).padStart(5) + ' m   ' + String(f.dentro + '/' + f.total).padStart(14) +
  String(f.visibles ?? '—').padStart(22) + String(f.todo).padStart(17) + ' %' +
  String(f.half.toFixed(0)).padStart(11) + String((Math.abs(f.sesgo)*f.rango).toFixed(3)).padStart(11));

/* ---- LO QUE SE EXIGE ----
   1) TODOS los seguidores dentro del recuadro, a cualquier altura. Es la condicion
      necesaria, y es la que se rompio: bastaba con bajar la camara.
   2) Sombra visible LEJOS, que es lo que desaparecia. Un umbral flojo a proposito:
      lo que se vigila es que HAYA, no cuanta —eso depende del sol y del encuadre—.
   3) Y que no dependa de la altura de la camara: si al bajar se pierde la mitad de
      la sombra lejana, ha vuelto el recuadro adaptativo por alguna puerta. */
check('todos los seguidores caen dentro del recuadro, suba o baje la cámara',
      filas.every(f => f.dentro === f.total),
      filas.map(f => f.alt + 'm:' + f.dentro + '/' + f.total).join(' '));
check('el recuadro no cambia de tamaño con la cámara (es la planta, no la vista)',
      new Set(filas.map(f => Math.round(f.half))).size === 1,
      filas.map(f => f.half.toFixed(0)).join(' / '));
/* Si a alguna altura no hay seguidores en cuadro no se mide nada: se DICE, no se da
   por bueno en silencio (un banco que no encuentra que mirar no esta pasando). */
check('a las cuatro alturas hay seguidores en cuadro que medir',
      filas.every(f => f.visibles != null),
      filas.map(f => f.alt + 'm:' + (f.visibles ?? 'sin cuadro')).join(' '));
/* AQUI HABIA UNA COMPROBACION POR BANDAS —«sombra en el campo LEJANO»— y se ha
   quitado porque NO DISCRIMINABA. Medida con la caja nueva y con la vieja da
   practicamente lo mismo:

       altura    nueva    vieja
        10 m     0,42 %   0,51 %
        30 m    10,12 %   9,16 %
        90 m    12,42 %  11,83 %
       300 m     7,40 %   6,86 %

   Y tiene su logica: desde 10 m de altura lo que se alcanza a ver son unos cientos
   de metros, que es mas o menos lo que cubria la caja vieja. Los seguidores que se
   quedaban sin sombra estan lejos y desde el suelo apenas ocupan pixeles junto al
   horizonte. Una comprobacion que da igual con el codigo bueno que con el malo no
   vigila nada, y encima esa fallaba sobre el codigo bueno. Lo que SI caza el defecto
   son las tres de arriba (recuadro, tamaño y sesgo), con margenes enormes.

   LO QUE MIDEN LOS PIXELES, entonces, es otra cosa y hace falta igual: que la sombra
   este DIBUJADA y no lavada. Es lo que pasaba al agrandar la caja con el sesgo en
   unidades de frustum —la sombra fuerte caia de 5,30 % a 0,24 %— y ninguna medida
   geometrica lo habria visto, porque los seguidores seguian todos dentro del
   recuadro. El tope va bajo a proposito: vigila que HAYA sombra, no cuanta, que eso
   depende del sol, del encuadre y de la planta. */
check('hay sombra dibujada de verdad a todas las alturas (no lavada por el sesgo)',
      filas.every(f => f.todo >= 3), filas.map(f => f.alt + 'm:' + f.todo + '%').join(' '));
/* EL SESGO, EN METROS. Es lo que lavaba las sombras al agrandar la caja: `shadow.bias`
   va en profundidad normalizada y el rango near..far crece con el recuadro, asi que un
   sesgo fijo vale 0,25 m en una planta pequeña y 2,46 m en San Jose — y a 2,46 m se
   traga la sombra de cualquier panel. Se comprueba el VALOR EN METROS, que es el que
   tiene sentido fisico, no el numero que se le pasa a three.js. */
const metros = filas.map(f => Math.abs(f.sesgo) * f.rango);
check('el sesgo de profundidad vale lo mismo EN METROS en toda planta (0,25 m)',
      metros.every(m => Math.abs(m - 0.25) < 0.02), metros.map(m => m.toFixed(3)).join(' / '));
check('la página no suelta errores mientras tanto', errores.length === 0, errores[0]);

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
await b.close();
if (process.env.SOMBRA_CAJA === 'vieja') {
  console.log(ko ? '\n### bien: con la caja vieja sale rojo' : '\n### MAL: la caja vieja pasa desapercibida');
  process.exit(ko ? 0 : 1);
}
process.exit(ko ? 1 : 0);
