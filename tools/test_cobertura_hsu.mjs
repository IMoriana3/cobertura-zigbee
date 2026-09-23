/* LAS HSU SON REPETIDORES, Y EL MAPA DE COBERTURA TIENE QUE CONTARLAS.
 *
 * Lo reporto el usuario: «las HSU tambien son repetidores, TODOS los equipos lo son».
 * cobAnchors() montaba la lista con las NCU y los TCU y dejaba fuera las estaciones
 * meteo. Eso no era neutral: la HSU es la antena MEJOR COLOCADA de la planta —su latigo
 * va a 6,50 m contra los 3,15 de una NCU y el poco mas de dos metros de un TCU—, asi que
 * ignorarla SUBESTIMABA la cobertura de los seguidores que la tienen al lado.
 *
 * LO QUE SE VIGILA NO ES UN NUMERO SINO UNA PROPIEDAD: añadir un repetidor no puede
 * quitarle caminos a nadie. Se calcula la planta CON las HSU como anclas y SIN ellas, y
 * se exige que ningun seguidor empeore y que alguno mejore. Un umbral fijo («en El Burgo
 * son 3 aislados») se rompe el dia que alguien mueva una mesa; la monotonia no.
 *
 *   python3 -m http.server 8124 --directory .  &
 *   node tools/test_cobertura_hsu.mjs
 *   HSU_ANCLAS=no node tools/test_cobertura_hsu.mjs   (mutacion: TIENE que salir rojo)
 */
import { chromium } from 'playwright-core';
import { EXE } from './pw_navegador.mjs';

const PUERTO = process.env.PUERTO || 8124;
const MUT = process.env.HSU_ANCLAS === 'no';
const PLANTA = process.argv[2] || 'elburgo';

let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage();
const errores = [];
pg.on('pageerror', e => errores.push(String(e).slice(0, 130)));
await pg.route('**/tcu.glb', r => r.abort());   // 4,4 MB que aqui no pintan nada
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${PLANTA}`,
              { waitUntil: 'domcontentloaded', timeout: 180000 });
const t0 = Date.now();
/* LA ESPERA MIRABA `typeof HSUS !== 'undefined'`, Y ESO ES CIERTO DESDE EL
   PRIMER INSTANTE: `HSUS` se declara vacio en `terreno.html:310` y no se llena
   hasta que se reconstruye el BOS, en `terreno.html:4465-4477`. Asi que la
   condicion daba por montada una escena que todavia no tenia ni una estacion
   meteo, y lo unico que salvaba la carrera era la espera fija de 2.500 ms de
   la linea siguiente — que basta en un portatil y no basta en el runner.
   Medido: con la espera fija a 0 se reproduce el fallo del runner EXACTO,
   «217 anclas para 2+215+0» y las mismas dos comprobaciones en rojo.
   Un array vacio no es «aun no ha cargado»: es un array vacio. Se espera a lo
   que se va a MEDIR —que haya HSU— en vez de a que el nombre exista. */
while (!(await pg.evaluate(() => typeof TRK !== 'undefined' && TRK && TRK.length &&
                                 typeof cobCompute === 'function' &&
                                 typeof HSUS !== 'undefined' && HSUS.length > 0))) {
  if (Date.now() - t0 > 300000) throw new Error('la escena no montó en 5 min (o la planta no tiene ninguna HSU, y entonces este banco no mide nada)');
  await pg.waitForTimeout(800);
}

const m = await pg.evaluate((MUT) => {
  /* MUTACION: se vacia el registro de HSU, que es exactamente lo que hacia el codigo
     antes —montar las anclas sin las estaciones meteo—. */
  const guarda = HSUS.slice();
  const mide = () => { cobOn = true; cobCompute();
    return { trk: COBTRK.slice(), hsu: COBHSU ? COBHSU.slice() : null }; };

  if (MUT) HSUS.length = 0;
  const A = cobAnchors();
  const con = mide();
  const marcas = HSUS.map(u => u._marca ? { y: +u._marca.position.y.toFixed(2), vis: !!u._marca.visible } : null);
  /* y la misma planta SIN contarlas, para comparar */
  HSUS.length = 0;
  const sin = mide();
  HSUS.push(...guarda);

  return { nGw: GWS.length, nTrk: TRK.length, nHsu: guarda.length, nAnclas: A.length,
           colas: A.slice(-guarda.length || A.length).map(a => ({ hsu: !!a.hsu, h: +(a.h || 0).toFixed(2) })),
           /* que el indice del tracker NO se haya movido: A[GWS.length+i] sigue siendo TRK[i] */
           indiceOk: TRK.every((t, i) => A[GWS.length + i] &&
                      Math.abs(A[GWS.length + i].lat - t.glat) < 1e-9),
           antH: (window.Equipos && Equipos.ANT_H) ? Equipos.ANT_H.hsu : null,
           con, sin, marcas };
}, MUT);

await ctx.close(); await b.close();

const peor = m.con.trk.filter((v, i) => v < m.sin.trk[i]).length;
const mejor = m.con.trk.filter((v, i) => v > m.sin.trk[i]).length;
console.log(`\n${PLANTA} · ${m.nTrk} seguidores · ${m.nGw} NCU · ${m.nHsu} HSU · ${m.nAnclas} anclas`);
console.log('clases de las HSU: ' + (m.con.hsu ? '[' + m.con.hsu.join(' ') + ']' : '—'));
console.log(`seguidores que MEJORAN al contarlas: ${mejor} · que empeoran: ${peor}\n`);

if (MUT) console.log('### SIN LAS HSU COMO ANCLAS (la mutación): este banco TIENE que salir rojo\n');

check('las HSU están en la lista de anclas',
      m.nAnclas === m.nGw + m.nTrk + m.nHsu && m.nHsu > 0,
      m.nAnclas + ' anclas para ' + m.nGw + '+' + m.nTrk + '+' + m.nHsu);
check('y con la altura REAL de su látigo, no la de un TCU',
      m.antH != null && m.colas.every(a => a.hsu && Math.abs(a.h - m.antH) < 0.01),
      'ANT_H.hsu=' + m.antH + ' · colas=' + JSON.stringify(m.colas.slice(0, 3)));
/* el indice del tracker es fragil a proposito: si alguien mete las HSU EN MEDIO de la
   lista, A[GWS.length+i] deja de ser TRK[i] y la cobertura se calcula sobre la antena
   equivocada sin que nada falle a gritos */
check('el índice del seguidor no se ha movido (A[GWS+i] sigue siendo TRK[i])', m.indiceOk);
check('cada HSU tiene su clase de cobertura',
      !!m.con.hsu && m.con.hsu.length === m.nHsu && m.con.hsu.every(v => v != null),
      JSON.stringify(m.con.hsu));
/* LA PROPIEDAD: un repetidor de mas no le quita caminos a nadie, y a alguien se los da */
check('contar las HSU no empeora a NINGÚN seguidor', peor === 0, peor + ' empeoran');
check('y mejora al menos a uno', mejor > 0, mejor + ' mejoran');
check('cada HSU lleva su marca, a la altura de la antena',
      m.marcas.length === m.nHsu && m.marcas.every(k => k && Math.abs(k.y - m.antH) < 0.01 && k.vis),
      JSON.stringify(m.marcas));
check('la página no suelta errores', errores.length === 0, errores[0]);

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
if (MUT) { console.log(ko ? '\n### bien: sin las HSU sale rojo' : '\n### MAL: quitarlas pasa desapercibido');
           process.exit(ko ? 0 : 1); }
process.exit(ko ? 1 : 0);
