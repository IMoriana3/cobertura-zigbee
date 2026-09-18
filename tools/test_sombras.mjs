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
 * Y SE MIDE EN LOS DOS CAMINOS, escritorio y MOVIL. La pagina los separa por el
 * user-agent: escritorio va con PCFSoftShadowMap y mapa de 8192, movil con
 * PCFShadowMap y 2048. El arreglo de la caja se midio SOLO en escritorio y ROMPIO el
 * movil sin que nadie se enterara: al ceñir la caja a la planta entera el texel paso
 * de 15,6 cm a 45,2 cm (El Burgo) y a 154,1 cm (San Jose), y como `shadow.radius` va
 * en TEXELES —y en PCF si manda, al reves que en PCFSoft— la penumbra se fue a 2,09 m
 * y 7,85 m. Resultado medido en movil: la sombra tocaba el 51 % de los pixeles y solo
 * el 0,33 % quedaba OSCURO. Es decir: gris por todas partes y sombra por ninguna.
 * El banco tenia el MISMO punto ciego que el defecto que vigilaba, asi que ahora corre
 * las dos veces.
 *
 * Y se mide POR FRANJAS. Con el recuadro ceñido la sombra del primer plano seguia
 * estando: lo que desaparecia era la del resto del campo. Un numero global lo habria
 * dado por bueno.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_sombras.mjs elburgo
 *   SOMBRA_CAJA=vieja   node tools/test_sombras.mjs elburgo   (mutacion: TIENE que salir rojo)
 *   SOMBRA_BORRON=viejo node tools/test_sombras.mjs elburgo   (mutacion del movil: idem)
 *
 * EN CI VA SOLO EL BURGO. Medido aqui: El Burgo 9 min 14 s, San Jose 19 min 55 s
 * —2.289 seguidores y un mapa de sombra que cubre 3,2 km de lado—. El defecto es el
 * mismo en las dos y El Burgo lo caza igual, asi que San Jose se corre A MANO cuando
 * se toque esto. Su resultado, para no tener que repetirlo por curiosidad (35 min):
 *
 *   ESCRITORIO · PCFSoft · mapa 8192 · texel 38,5 cm
 *     camara   dentro       sombra   fuerte   borron   sesgo
 *       10 m   2289/2289   16,46 %   9,34 %   0,40 m   0,250 m
 *       30 m   2289/2289   13,25 %   7,13 %   0,40 m   0,250 m
 *       90 m   2289/2289   10,86 %   4,88 %   0,40 m   0,250 m
 *      300 m   2289/2289    7,96 %   2,37 %   0,40 m   0,250 m
 *
 *   MOVIL · PCF · mapa 4096 · texel 77,1 cm
 *       10 m   2289/2289   18,45 %   7,48 %   0,77 m   0,250 m
 *       30 m   2289/2289   14,79 %   5,51 %   0,77 m   0,250 m
 *       90 m   2289/2289   12,24 %   4,02 %   0,77 m   0,250 m
 *      300 m   2289/2289    8,90 %   2,00 %   0,77 m   0,250 m
 *
 * San Jose es la UNICA de las diez que pide mapa de 4096 en movil: con 2048 su texel
 * mide 1,54 m, mas ancho que la cuerda de un modulo, y la sombra de una mesa no cabe.
 * Antes del arreglo de la caja eran 48 de 2.289 con sombra a ras de suelo.
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
/* El UMBRAL separa dos preguntas distintas y las dos hacen falta:
     > 6 de 255  = «aqui HAY sombra» (cualquier oscurecimiento visible)
     > 25 de 255 = «aqui hay sombra DE VERDAD, oscura»
   Lavar la sombra no baja la primera: la sube. Con la penumbra de 7,85 m del movil el
   51 % de la pantalla se oscurecia *un poco* y solo el 0,33 % se oscurecia de verdad.
   Mirando solo el primer numero, aquello parecia el campo lleno de sombras. */
function sombraEnBanda(con, sin, bandas, umbral = 6) {
  const a = luz(con), b = luz(sin), out = [];
  for (const [y0, y1] of bandas) {
    let n = 0, som = 0;
    for (let y = Math.max(0, y0); y < Math.min(a.h, y1); y++) for (let x = 0; x < a.w; x++) {
      const k = y * a.w + x; n++; if (b.L[k] - a.L[k] > umbral) som++; }
    out.push(n ? +(100 * som / n).toFixed(2) : null);
  }
  return out;
}

/* LOS DOS CAMINOS. La pagina decide por user-agent (`/Mobi|Android|iPhone|iPad|iPod/`)
   el tipo de mapa y su tamaño, asi que aqui se recorre la pagina DOS VECES con dos
   user-agents. Correr solo el de escritorio es lo que dejo pasar la regresion. */
const MODOS = [
  { id: 'escritorio', ua: null },
  { id: 'movil', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
                     '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
];

async function mide(modo) {
  const b = await chromium.launch({ executablePath: EXE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 520 },
                                  ...(modo.ua ? { userAgent: modo.ua } : {}) });
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
  const tomar = await pg.evaluate(({ALTS, VIEJA, BORRON_VIEJO}) => {
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
    }
  /* MUTACION DEL MOVIL, con `SOMBRA_BORRON=viejo`: se devuelve el radio SIN acotar en
     metros —el que rompio el movil— y la sombra fuerte TIENE que desplomarse. Es la
     prueba de que la comprobacion nueva mira algo: sin ella, aquel radio pasaba. */
  if (BORRON_VIEJO) {
    const or2 = window.updateSunShadow;
    window.updateSunShadow = function(){ or2();
      const dir = SUN._ldir || SUN._dir;
      SUN.shadow.radius = Math.min(7, 2 + 1.9/Math.max(0.08, dir.U)); };
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
                    sesgo: SUN.shadow.bias, rango: sc.far - sc.near, solU: +SUN._dir.U.toFixed(3),
                    mapa: SUN.shadow.mapSize.x, radio: SUN.shadow.radius,
                    cap: renderer.capabilities.maxTextureSize,
                    pcfSoft: renderer.shadowMap.type === THREE.PCFSoftShadowMap });
    }
    /* OJO AL ORDEN: `coloca` llama a `updateSunShadow`, y esa funcion vuelve a ENCENDER
       `SUN.castShadow` (`if(SUN.castShadow!==!raso)SUN.castShadow=!raso`). Apagarlo antes
       de colocar la camara no sirve de nada: los cuadros «sin sombra» salian CON sombra y
       la resta daba cero en todas las bandas. Se apaga DESPUES de colocar, cada vez. */
    const g = SUN.castShadow;
    for (let i = 0; i < ALTS.length; i++) { coloca(ALTS[i]); SUN.castShadow = false; salida[i].sin = pinta(); }
    SUN.castShadow = g;
    return salida;
  }, { ALTS: ALTURAS, VIEJA: process.env.SOMBRA_CAJA === 'vieja',
       BORRON_VIEJO: process.env.SOMBRA_BORRON === 'viejo' });

  await b.close();
  return tomar.map(r => {
    const [todo]   = sombraEnBanda(r.con, r.sin, [[0, 1e9]]);
    const [fuerte] = sombraEnBanda(r.con, r.sin, [[0, 1e9]], 25);
    const texel = 2 * r.half / r.mapa;
    return { ...r, modo: modo.id, errores, todo, fuerte, texel, borron: r.radio * texel,
             visibles: r.bandas ? r.bandas.visibles : null, con: null, sin: null };
  });
}

const porModo = [];
for (const m of MODOS) porModo.push(await mide(m));
const todasLasFilas = porModo.flat();
const errores = todasLasFilas.flatMap(f => f.errores);

if (process.env.SOMBRA_CAJA === 'vieja') console.log('### CAJA VIEJA (la que se ceñía a la cámara): este banco TIENE que salir rojo\n');
if (process.env.SOMBRA_BORRON === 'viejo') console.log('### BORRÓN SIN ACOTAR (el radio en téxeles que rompió el móvil): este banco TIENE que salir rojo\n');
const f0 = todasLasFilas[0];
console.log(`\n${PLANTAS[SOLO]} · ${f0.total} seguidores · semilado ${f0.half.toFixed(0)} m · sol ${(Math.asin(f0.solU)*180/Math.PI).toFixed(0)}°`);
for (const filas of porModo) {
  const c = filas[0];
  console.log(`\n--- ${c.modo.toUpperCase()} · ${c.pcfSoft ? 'PCFSoft' : 'PCF'} · mapa ${c.mapa} · texel ${(c.texel*100).toFixed(1)} cm`);
  console.log('camara   dentro del recuadro   en cuadro   sombra   fuerte   borron   sesgo(m)');
  for (const f of filas) console.log(
    String(f.alt).padStart(5) + ' m   ' + String(f.dentro + '/' + f.total).padStart(14) +
    String(f.visibles ?? '—').padStart(12) + String(f.todo).padStart(8) + ' %' +
    String(f.fuerte).padStart(8) + ' %' + String(f.borron.toFixed(2)).padStart(8) + ' m' +
    String((Math.abs(f.sesgo)*f.rango).toFixed(3)).padStart(11));
}

/* ---- LO QUE SE EXIGE ----
   1) TODOS los seguidores dentro del recuadro, a cualquier altura. Es la condicion
      necesaria, y es la que se rompio: bastaba con bajar la camara.
   2) Sombra visible LEJOS, que es lo que desaparecia. Un umbral flojo a proposito:
      lo que se vigila es que HAYA, no cuanta —eso depende del sol y del encuadre—.
   3) Y que no dependa de la altura de la camara: si al bajar se pierde la mitad de
      la sombra lejana, ha vuelto el recuadro adaptativo por alguna puerta. */
const etq = f => f.modo + '/' + f.alt + 'm';
check('todos los seguidores caen dentro del recuadro, suba o baje la cámara',
      todasLasFilas.every(f => f.dentro === f.total),
      todasLasFilas.map(f => etq(f) + ':' + f.dentro + '/' + f.total).join(' '));
check('el recuadro no cambia de tamaño con la cámara (es la planta, no la vista)',
      new Set(todasLasFilas.map(f => Math.round(f.half))).size === 1,
      todasLasFilas.map(f => f.half.toFixed(0)).join(' / '));
/* Si a alguna altura no hay seguidores en cuadro no se mide nada: se DICE, no se da
   por bueno en silencio (un banco que no encuentra que mirar no esta pasando). */
check('a las cuatro alturas hay seguidores en cuadro que medir',
      todasLasFilas.every(f => f.visibles != null),
      todasLasFilas.map(f => etq(f) + ':' + (f.visibles ?? 'sin cuadro')).join(' '));
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
      todasLasFilas.every(f => f.todo >= 3),
      todasLasFilas.map(f => etq(f) + ':' + f.todo + '%').join(' '));
/* EL SESGO, EN METROS. Es lo que lavaba las sombras al agrandar la caja: `shadow.bias`
   va en profundidad normalizada y el rango near..far crece con el recuadro, asi que un
   sesgo fijo vale 0,25 m en una planta pequeña y 2,46 m en San Jose — y a 2,46 m se
   traga la sombra de cualquier panel. Se comprueba el VALOR EN METROS, que es el que
   tiene sentido fisico, no el numero que se le pasa a three.js. */
const metros = todasLasFilas.map(f => Math.abs(f.sesgo) * f.rango);
check('el sesgo de profundidad vale lo mismo EN METROS en toda planta (0,25 m)',
      metros.every(m => Math.abs(m - 0.25) < 0.02), metros.map(m => m.toFixed(3)).join(' / '));
/* LA SOMBRA, OSCURA Y NO UN GRIS LAVADO. Esta es la que faltaba, y la que habria
   cazado que el arreglo de la caja rompiera el movil. Un borron ancho no BORRA la
   sombra: la reparte, y el numero de arriba («hay sombra») SUBE en vez de bajar. Con
   la penumbra de 7,85 m del movil salia 50,54 % de sombra y 0,33 % de sombra fuerte:
   mirando solo el primer numero, aquello parecia el campo entero sombreado.

   SE MIDE LA PROPORCION, no el valor absoluto, y no por elegancia: un umbral fijo en
   «% de la pantalla» lo puse primero en 3 % y lo tumbo el propio banco, con razon —a
   300 m de altura los seguidores ocupan cuatro pixeles y la sombra fuerte cae a 2,21 %
   en escritorio y 1,25 % en movil sin que nada este mal—. Lo que se quiere saber no es
   cuanta sombra hay (eso depende del encuadre, del sol y de la planta) sino QUE PARTE
   de la sombra que hay es oscura, que es justo lo que arruina el borron. Medido:

       de los pixeles en sombra, cuantos quedan OSCUROS   (camara a 10, 30, 90, 300 m)
       El Burgo  escritorio             86 / 83 / 79 / 65 %
       El Burgo  movil, acotado         51 / 53 / 51 / 31 %
       San Jose  escritorio             57 / 54 / 45 / 30 %
       San Jose  movil, acotado (4096)  41 / 37 / 33 / 22 %   <- el peor caso bueno
       El Burgo  movil, SIN acotar       1 /  0 /  0 /  0 %   <- el defecto

   El tope va en 15 %, no en 20: lo puse en 20 mirando solo El Burgo, cuyo peor caso es
   31 %, y San Jose en movil a 300 m da 22 % sin que nada este mal —es una planta cuatro
   veces mas grande y desde 300 m entra entera en el cuadro, con los seguidores a cuatro
   pixeles—. A 20 % eso quedaba a un 10 % de ponerse rojo por nada. A 15 % hay factor
   1,5 contra el peor caso bueno y factor 15 contra el defecto, que es el reparto que
   se quiere: holgado con lo bueno, implacable con lo malo.

   Ojo a la columna de al lado en la mutacion: el total de sombra SUBE a 51,02 % justo
   donde la sombra oscura se hunde al 1 %. Por eso la proporcion y no el total. */
check('la sombra es OSCURA y no un gris lavado, en los dos caminos',
      todasLasFilas.every(f => f.fuerte / f.todo >= 0.15),
      todasLasFilas.map(f => etq(f) + ':' + (100*f.fuerte/f.todo).toFixed(0) + '% de ' + f.todo + '%').join(' '));
/* LA PENUMBRA, EN METROS. `shadow.radius` va en TEXELES, asi que el mismo radio vale
   0,46 m en El Burgo y 7,85 m en San Jose. Se comprueba el ANCHO REAL, que es el que
   tiene sentido fisico. Es el SEMIANCHO: el nucleo PCF muestrea de -radio*texel a
   +radio*texel (mirado en el getShadow de lib/three.min.js), asi que 0,40 aqui son
   0,80 m de penumbra total, contra 1,13 m de cuerda de modulo. El suelo es UN TEXEL: por debajo el PCF no difumina nada, asi
   que en una planta de texel grueso el borron no puede bajar de ahi y exigirlo seria
   exigir un imposible — lo que arregla eso es el mapa, y lo vigila la de abajo. */
check('el semiancho de la penumbra no pasa de 0,40 m (o de un téxel, suelo del PCF)',
      todasLasFilas.every(f => f.borron <= Math.max(0.40, f.texel) * 1.02 + 1e-6),
      todasLasFilas.map(f => etq(f) + ':' + f.borron.toFixed(2) + 'm/tex' + f.texel.toFixed(2)).join(' '));
/* EL TEXEL, CONTRA LA CUERDA DE UN MODULO (1,13 m). Si un texel mide mas que una mesa,
   su sombra no cabe en el mapa y no hay radio que la salve: hay que subir el mapa, que
   es lo que hace build() en movil. Se admite una excepcion honesta: que el mapa ya este
   en el tope que declara la GPU — entonces no es un defecto del codigo sino una GPU que
   no da para esa planta, y conviene que lo diga en vez de fingir que pasa. */
check('el téxel no supera 0,80 m, o el mapa ya está en el tope de la GPU',
      todasLasFilas.every(f => f.texel <= 0.80 * 1.02 ||
                               f.mapa >= Math.min(f.cap, f.modo === 'movil' ? 4096 : 8192)),
      todasLasFilas.map(f => etq(f) + ':' + (f.texel*100).toFixed(0) + 'cm mapa' + f.mapa + '/cap' + f.cap).join(' '));
check('la página no suelta errores mientras tanto', errores.length === 0, errores[0]);

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
const MUT = process.env.SOMBRA_CAJA === 'vieja' ? 'la caja vieja'
          : process.env.SOMBRA_BORRON === 'viejo' ? 'el borrón sin acotar' : null;
if (MUT) {
  console.log(ko ? `\n### bien: con ${MUT} sale rojo` : `\n### MAL: ${MUT} pasa desapercibido`);
  process.exit(ko ? 0 : 1);
}
process.exit(ko ? 1 : 0);
