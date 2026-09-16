/* Tests DETERMINISTAS del núcleo del lazo de control del tracker (js/control_core.js) — sin navegador,
   sin red, sin azar.  Uso:  node tools/test_control_core.mjs

   No comprueban solo que el código haga lo que dice: comprueban las AFIRMACIONES FÍSICAS con las que
   se justifica la pieza, que son las que se le enseñan al cliente.
     · que la banda muerta no cuesta por COSENO (con 1° de banda, menos de 1e-4 de pérdida relativa);
     · que sí deja al tracker MÁS INCLINADO que el límite de sombra cuando la consigna baja —el caso
       de la tarde en backtracking, que es donde de verdad se paga— y que el modo 'seguro' lo impide;
     · que la rejilla en la que corre el lazo CAMBIA el resultado, para que nadie lo evalúe en la de
       integración y se coma el escalón (el fallo ya pagado en overcast.html);
     · que las cuatro mesas de un seguidor salen con el MISMO θ, porque comparten motor. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'js', 'control_core.js'), 'utf-8');
new Function(src)();                         // se cuelga de globalThis, como cableado_core
const C = globalThis.CTRLCORE;

let N = 0, FAIL = 0;
function t(name, fn) {
  N++;
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { FAIL++; console.error('  ✗ ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) { if (!Object.is(a, b)) throw new Error((msg || 'eq') + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); }
function close(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol ?? 1e-9))) throw new Error((msg || 'close') + ': ' + a + ' ≉ ' + b); }
function ok(c, msg) { if (!c) throw new Error(msg || 'falso'); }

const LIBRE  = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55, modo: 'libre',  cicloSeg: 60 };
const SEGURO = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55, modo: 'seguro', cicloSeg: 60 };
const SOL_DEG_MIN = 0.25;                    // el sol deriva 15°/h: la escala de la que se habla

/* Recorre un día sintético con la consigna que se le pase y devuelve la traza. */
function corre(target, loop, bt, dtMin) {
  const dt = dtMin ?? 1, exec = [], errs = [], firmados = [];
  let th = target[0], tPrev = target[0], dir = 0, park = null, arranques = 0;
  for (let i = 1; i < target.length; i++) {
    const antes = th;
    const r = C.execTramo(th, tPrev, target[i], dt, loop, bt ? (bt[i] ?? bt) : false, dir, park);
    th = r.theta; dir = r.dir; park = r.park;
    if (Math.abs(th - antes) > 1e-9) arranques++;
    exec.push(th); errs.push(Math.abs(th - target[i]));
    firmados.push(th - target[i]);               // CON signo: el adelanto vive aquí
    tPrev = target[i];
  }
  return { exec, errs, firmados, arranques, maxErr: Math.max(...errs),
           mediaErr: errs.reduce((a, b) => a + b, 0) / errs.length,
           mediaFirmada: firmados.reduce((a, b) => a + b, 0) / firmados.length };
}

console.log('slewLimit — el actuador no teletransporta');
t('dentro de alcance: llega a la consigna exacta', () => eq(C.slewLimit(0, 5, 60, 0.17), 5));
t('fuera de alcance: avanza justo lo que da la velocidad', () => close(C.slewLimit(0, 50, 60, 0.17), 10.2, 1e-12));
t('y hacia el otro lado igual', () => close(C.slewLimit(0, -50, 60, 0.17), -10.2, 1e-12));
t('velocidad 0 tecleada en la UI NO teletransporta: cae al canónico', () => {
  close(C.slewLimit(0, 50, 60, 0), 10.2, 1e-12);
  close(C.slewLimit(0, 50, 60, -3), 10.2, 1e-12);
});

console.log('step — la banda muerta');
t('deadband 0: ejecuta la consigna (el lazo apagado no hace nada)', () =>
  eq(C.step(10, 10.4, 60, { deadbandDeg: 0, slewDegS: 0.17, maxAngle: 55 }, false).theta, 10.4));
t('error por debajo de la banda: el motor NI ARRANCA', () => eq(C.step(10, 10.4, 60, LIBRE, false).theta, 10));
t('error justo en la banda: arranca, y APARCA UNA BANDA MÁS ALLÁ (11 + 1 = 12)', () =>
  eq(C.step(10, 11, 60, LIBRE, false, 0).theta, 12));
t('error por encima: arranca al mismo destino adelantado (12 + 1 = 13)', () =>
  eq(C.step(10, 12, 60, LIBRE, false, 0).theta, 13));
t('la banda es simétrica', () => eq(C.step(10, 9.4, 60, LIBRE, false).theta, 10));
t('el tope mecánico manda sobre todo', () => {
  eq(C.step(54, 80, 600, LIBRE, false).theta, 55);
  eq(C.step(-54, -80, 600, LIBRE, false).theta, -55);
});
t('sin loop: pasa la consigna tal cual', () => eq(C.step(10, 12, 60, null, false).theta, 12));

console.log('step — los dos modos, que es donde está la física');
t("'libre' aguanta aunque la consigna venga recortada por sombra (y ahí sombrea)", () =>
  eq(C.step(30, 29.4, 60, LIBRE, true).theta, 30));
t("'seguro' arranca si está MÁS inclinado que el límite de sombra", () =>
  // y se va al destino adelantado: 29,4 − 1 = 28,4. Sobrepasar hacia el lado
  // PLANO es justo lo que 'seguro' quiere.
  eq(C.step(30, 29.4, 60, SEGURO, true, 0).theta, 28.4));
t("'seguro' sigue aguantando hacia el lado que NO sombrea (más plano)", () =>
  eq(C.step(29.4, 30, 60, SEGURO, true).theta, 29.4));
t("'seguro' sin backtracking recortando se comporta como 'libre'", () =>
  eq(C.step(30, 29.4, 60, SEGURO, false).theta, C.step(30, 29.4, 60, LIBRE, false).theta));
t("'seguro': un aguante que cruzaría el cero también arranca, y SIN adelanto", () =>
  // arranca (criterio conservador: se compara la magnitud) y para EN la consigna, porque
  // adelantarse a 1,2° sería más inclinado que el límite de sombra: |1,2| > |0,2|.
  eq(C.step(-0.6, 0.2, 60, SEGURO, true, 0).theta, 0.2));

console.log('la sierra: lo que la banda muerta le hace al seguimiento');
const sol = Array.from({ length: 241 }, (_, i) => -30 + SOL_DEG_MIN * i);   // 4 h de deriva limpia,
// de −30 a +30: DENTRO del tope mecánico a propósito. Con 0..60 el tope recortaba a 55 y el
// «desalineo» medía 5° de recorte en vez de la sierra de la banda — se midió, no se supuso.
const rSol = corre(sol, LIBRE, false);
t('el desalineo NUNCA pasa de la banda', () => ok(rSol.maxErr <= LIBRE.deadbandDeg + 1e-9, `max ${rSol.maxErr}`));
t('EL PASO DEL TRACKER ES DOS BANDAS, porque la TCU ADELANTA al sol', () => {
  // Corregido en campo por Iñaki: «nosotros adelantamos al sol un grado, es decir,
  // hacemos movimientos de dos grados». El motor arranca cuando se ha quedado una
  // banda atrás y lleva el eje una banda MÁS ALLÁ de la consigna, así que cada
  // movimiento son 2·banda y hay la MITAD de arranques. La versión anterior paraba
  // en la consigna: pasos de una banda, y el error siempre del mismo signo.
  let th = sol[0], tPrev = sol[0], dir = 0, park = null, saltos = [];
  for (let i = 1; i < sol.length; i++) {
    const antes = th;
    const r = C.execTramo(th, tPrev, sol[i], 1, LIBRE, false, dir, park);
    th = r.theta; dir = r.dir; park = r.park; tPrev = sol[i];
    if (Math.abs(th - antes) > 1e-9) saltos.push(Math.abs(th - antes));
  }
  eq(saltos.length, 30, 'un paso por DOS bandas recorridas');
  for (const d of saltos) close(d, 2 * LIBRE.deadbandDeg, 1e-9, 'el paso no es dos bandas');
});

t('EL ADELANTO: el eje pasa por delante y por detrás, con media CERO', () => {
  // Es la comprobación que faltaba y que se vio en pantalla: la columna de
  // desalineo salía SIEMPRE del mismo signo. Con el adelanto el error barre de
  // +banda a −banda, así que su media es ~0 y hay tantas muestras por delante
  // como por detrás.
  const f = rSol.firmados;
  const delante = f.filter(v => v > 1e-9).length, detras = f.filter(v => v < -1e-9).length;
  ok(delante > 0.3 * f.length, `solo ${delante} de ${f.length} muestras por delante: no hay adelanto`);
  ok(detras  > 0.3 * f.length, `solo ${detras} de ${f.length} muestras por detrás`);
  ok(Math.abs(rSol.mediaFirmada) < 0.15 * LIBRE.deadbandDeg,
     `la media firmada es ${rSol.mediaFirmada.toFixed(4)}°: el barrido no está centrado`);
  ok(rSol.maxErr <= LIBRE.deadbandDeg + 1e-9,
     `el error se sale de la banda: ${rSol.maxErr}°`);
});
t('con OTRA banda, el paso es la OTRA banda (no hay 1° escondido)', () => {
  // Muestreo A NIVEL DE CICLO, no por tramo de integración. Un paso es una RÁFAGA de ciclos
  // moviéndose, y con banda 2,5° y ciclo 6 s la ráfaga son 3 ciclos: medida por tramos de 1 min se
  // parte entre dos tramos —con estos números, SIEMPRE, porque 2,5 = 10 × 0,25— y se medía 1,02°,
  // que es la velocidad del actuador. El paso se cierra cuando el motor SE PARA.
  const L2 = { ...LIBRE, deadbandDeg: 2.5, cicloSeg: 6 };
  let th = -30, tPrev = -30, dir = 0, park = null, pasos = [], acc = 0;
  for (let i = 1; i <= 2400; i++) {
    const tNow = -30 + SOL_DEG_MIN * i * 0.1;
    const r = C.execTramo(th, tPrev, tNow, 0.1, L2, false, dir, park);
    acc += Math.abs(r.theta - th); th = r.theta; tPrev = tNow;
    if (dir && !r.dir && acc > 1e-9) { pasos.push(acc); acc = 0; }
    dir = r.dir; park = r.park;
  }
  ok(pasos.length > 7, `pocos pasos cerrados: ${pasos.length}`);
  for (const d of pasos) close(d, 2 * L2.deadbandDeg, 0.3, 'el paso tiene que seguir a DOS bandas');
});
t('el |desalineo| medio es del orden de media banda', () =>
  ok(rSol.mediaErr > 0.25 * LIBRE.deadbandDeg && rSol.mediaErr < 0.75 * LIBRE.deadbandDeg, `media ${rSol.mediaErr}`));
t('el motor arranca ~una vez por DOS bandas recorridas, no en continuo', () => {
  const recorrido = sol[sol.length - 1] - sol[0], esperados = recorrido / (2 * LIBRE.deadbandDeg);
  ok(rSol.arranques > 0.5 * esperados && rSol.arranques < 2 * esperados,
     `${rSol.arranques} arranques para ${esperados.toFixed(0)} esperados`);
});
t('sin banda el motor arranca en TODOS los pasos (el mutante del ahorro de desgaste)', () => {
  const r = corre(sol, { deadbandDeg: 0, slewDegS: 0.17, maxAngle: 55, cicloSeg: 60 }, false);
  eq(r.arranques, sol.length - 1);
  // El ahorro NO es «de sobra»: es DOS bandas / deriva por paso = 2 / 0,25 = 8, porque con el
  // adelanto cada arranque recorre dos bandas. Medido, no supuesto — la primera versión pedía 10×
  // y falló con razón, y luego pedía 4× porque el eje paraba en la consigna.
  close(r.arranques / rSol.arranques, 2 * LIBRE.deadbandDeg / SOL_DEG_MIN, 0.3, 'factor de ahorro');
});
t('LA AFIRMACIÓN DEL COSENO, contra la fórmula: la pérdida media es b²/6 (radianes)', () => {
  // Con el error repartido uniforme —en [0, banda] cuando el eje paraba en la consigna, y ahora en
  // [−banda, +banda] con el adelanto— la media de 1−cos(e) vale 1−sin(b)/b ≈ b²/6, y la FÓRMULA ES
  // LA MISMA en los dos casos porque 1−cos es par. El adelanto cambia el signo del error, no su
  // coste por coseno. Se muestrea A NIVEL DE CICLO: muestrear al paso de
  // integración da una sierra aliased (con banda 1° y paso 1 min solo salen las fases 0,25/0,5/0,75
  // y la media se queda un 35 % corta).
  // Y ojo con la cuenta fácil: 1−cos es CONVEXO, así que evaluarlo en el error MEDIO subestima
  // (0,0038 % contra 0,0051 % con banda de 1°). Es el error que había en la tarjeta de la página.
  for (const b of [0.5, 1, 2]) {
    const loop = { deadbandDeg: b, slewDegS: 0.17, maxAngle: 55, modo: 'libre', cicloSeg: 1.2 };
    let th = -30, tPrev = -30, dir = 0, park = null, s = 0, n = 0;
    for (let i = 1; i <= 6000; i++) {                      // 120 min a 0,02 min por ciclo
      const tNow = -30 + SOL_DEG_MIN * i * 0.02;
      const r = C.execTramo(th, tPrev, tNow, 0.02, loop, false, dir, park);
      th = r.theta; dir = r.dir; park = r.park; tPrev = tNow;
      s += 1 - Math.cos(Math.abs(th - tNow) * Math.PI / 180); n++;
    }
    const media = s / n, formula = Math.pow(b * Math.PI / 180, 2) / 6;
    if (!(Math.abs(media / formula - 1) < 0.06))
      throw new Error(`banda ${b}°: medido ${(media*100).toFixed(4)} % contra b²/6 ${(formula*100).toFixed(4)} %`);
  }
});
t('el slew no se supera en ningún paso de la traza', () => {
  let th = sol[0], tPrev = sol[0], dir = 0, park = null;
  for (let i = 1; i < sol.length; i++) {
    const antes = th;
    const r = C.execTramo(th, tPrev, sol[i], 1, LIBRE, false, dir, park); th = r.theta; dir = r.dir; park = r.park;
    tPrev = sol[i];
    ok(Math.abs(th - antes) <= LIBRE.slewDegS * 60 + 1e-9, `paso ${i}: ${Math.abs(th - antes)}°/min`);
  }
});

console.log('la tarde en backtracking: donde la banda muerta SÍ cuesta');
// la consigna de backtracking baja hacia plano al caer el sol; aguantar = quedarse sobreinclinado
const tarde = Array.from({ length: 121 }, (_, i) => 30 - 0.25 * i);
const rLibre = corre(tarde, LIBRE, true), rSeguro = corre(tarde, SEGURO, true);
t("'libre' deja al tracker SOBREINCLINADO la mitad del tiempo (la otra mitad va por delante)", () => {
  const sobre = rLibre.exec.map((e, i) => e - tarde[i + 1]).filter(d => d > 1e-9);
  // Con el eje parando EN la consigna, el aguante era siempre del lado que sombrea y salían >50 %
  // de los pasos. Con el ADELANTO el error barre de +banda a −banda, así que se sombrea la MITAD
  // del tiempo — y la otra mitad el eje va por delante, del lado plano. La banda sigue acotando
  // cuánto se sobreinclina, que es lo que de verdad se afirma aquí.
  ok(sobre.length > 0.2 * rLibre.exec.length, `solo ${sobre.length} pasos sobreinclinados de ${rLibre.exec.length}`);
  ok(sobre.length < 0.8 * rLibre.exec.length, `${sobre.length} de ${rLibre.exec.length}: con adelanto no puede sombrear casi siempre`);
  ok(Math.max(...sobre) <= LIBRE.deadbandDeg + 1e-9, 'la sobreinclinación no puede pasar de la banda');
});
t("'seguro' NO se sobreinclina ni una vez", () => {
  const sobre = rSeguro.exec.map((e, i) => e - tarde[i + 1]).filter(d => d > 1e-9);
  eq(sobre.length, 0, `${sobre.length} pasos sombreando`);
});
t('POR LA MAÑANA YA NO SE SALVA SOLA: el adelanto también sobreinclina, y eso lo cambió campo', () => {
  // ESTA AFIRMACIÓN SE CAYÓ, y conviene que quede escrito por qué. Con el eje parando EN la
  // consigna el error solo podía ir por detrás, así que con la |consigna| CRECIENDO (mañana) el
  // aguante dejaba al tracker MÁS PLANO de lo necesario: el lado seguro, gratis, y el test pedía
  // CERO sobreinclinaciones. Con el adelanto el eje se pasa una banda en el sentido de la marcha,
  // así que por la mañana se pasa hacia MÁS inclinado y sombrea igual que por la tarde. O sea que
  // la asimetría mañana/tarde del modelo anterior era un artefacto del modelo, no de la planta, y
  // el modo 'seguro' pasa de ser una mejora de la tarde a ser el que sujeta el día entero.
  const manana = Array.from({ length: 121 }, (_, i) => 0.25 * i);   // |consigna| creciendo
  const r = corre(manana, LIBRE, true);
  const sobre = r.exec.map((e, i) => e - manana[i + 1]).filter(d => d > 1e-9);
  ok(sobre.length > 0.2 * r.exec.length, `${sobre.length} de ${r.exec.length}: el adelanto tendría que sobreinclinar también de mañana`);
  ok(Math.max(...sobre) <= LIBRE.deadbandDeg + 1e-9, 'y sin pasar de la banda');
  // y 'seguro' sí la sujeta, que es el punto
  const rs = corre(manana, SEGURO, true);
  eq(rs.exec.map((e, i) => e - manana[i + 1]).filter(d => d > 1e-9).length, 0,
     "'seguro' tiene que dejar la mañana a cero");
});
t("y con la consigna bajando, 'seguro' paga más desgaste que 'libre' (no sale gratis)", () =>
  ok(rSeguro.arranques > rLibre.arranques, `${rSeguro.arranques} vs ${rLibre.arranques}`));

console.log('execTramo — la rejilla en la que corre el lazo cambia el resultado');
t('lazo apagado: el tramo acaba EXACTAMENTE en la consigna', () =>
  close(C.execTramo(0, 0, 12, 60, { deadbandDeg: 0, slewDegS: 99, maxAngle: 55, cicloSeg: 60 }, false).theta, 12, 1e-12));
t('evaluar el lazo en la rejilla de integración se come el escalón', () => {
  // Barrido de derivas horarias en vez de una sola. Con una suelta el test es frágil de verdad: si
  // el periodo de la sierra (banda/deriva, en pasos) DIVIDE al número de pasos del tramo, el tramo
  // acaba clavado en la consigna y el fino sale igual que el burdo por conmensurabilidad, no porque
  // el lazo no haga nada. Pasó con 15°/h (periodo 4) y con 13,7°/h (periodo 5). Lo que se afirma es
  // que la rejilla CAMBIA el resultado, y eso se mide en promedio.
  const dt = 60, derivas = [5, 7, 9, 11, 13, 17, 19, 23];
  let sFino = 0, peorBurdo = 0, sBurdoFirmado = 0;
  for (const d of derivas) {
    // CENTRADO en 0 y solo tres tramos: con −30 + 19·i la consigna llegaba a 65° y el tope recortaba
    // a 55, así que el «desalineo» medía 10° de recorte. Ya me pilló una vez en el barrido del sol.
    const tgt = Array.from({ length: 4 }, (_, i) => -1.5 * d + d * i);
    const fino  = corre(tgt, { ...LIBRE, cicloSeg: 60  }, false, dt);
    const burdo = corre(tgt, { ...LIBRE, cicloSeg: dt * 60 }, false, dt);
    sFino += fino.mediaErr; peorBurdo = Math.max(peorBurdo, burdo.maxErr);
    sBurdoFirmado += burdo.mediaFirmada;
    ok(fino.maxErr <= LIBRE.deadbandDeg + 1e-9, `sierra sin acotar con ${d}°/h: ${fino.maxErr}`);
  }
  // Con UN ciclo por tramo el slew no ata nunca, así que el eje llega SIEMPRE a su destino y el
  // error se queda clavado en +banda: un sesgo constante en vez de la sierra que barre ±banda.
  // (Con el eje parando en la consigna, lo que salía era 0: la banda literalmente invisible.)
  close(peorBurdo, LIBRE.deadbandDeg, 1e-9, 'un paso por tramo deja el error clavado en la banda');
  close(sBurdoFirmado / derivas.length, LIBRE.deadbandDeg, 1e-9,
        'y con signo constante, que es la firma de que la rejilla se ha comido el escalón');
  ok(sFino / derivas.length > 0.1 * LIBRE.deadbandDeg,
     `con la rejilla del ciclo la banda deja sierra: desalineo medio ${(sFino / derivas.length).toFixed(3)}°`);
});
t('el slew ata dentro del tramo: 55° de inversión no se hacen en un minuto', () =>
  close(C.execTramo(-55, -55, 55, 1, LIBRE, false).theta, -44.8, 1e-9));
t('tramo de paso 0 o negativo no cuelga ni devuelve NaN', () => {
  ok(Number.isFinite(C.execTramo(0, 0, 10, 0, LIBRE, false).theta));
  ok(Number.isFinite(C.execTramo(0, 0, 10, -5, LIBRE, false).theta));
});
t('ciclo 0 o negativo cae al canónico en vez de dividir por cero', () => {
  ok(Number.isFinite(C.execTramo(0, 0, 10, 5, { ...LIBRE, cicloSeg: 0 }, false).theta));
  ok(Number.isFinite(C.execTramo(0, 0, 10, 5, { ...LIBRE, cicloSeg: -60 }, false).theta));
});

console.log('execVector — un motor por seguidor');
t('las cuatro mesas de un seguidor comparten consigna → comparten θ ejecutado', () => {
  const tgt = [20.4, 20.4, 20.4, 20.4], prev = [20, 20, 20, 20];
  const out = C.execVector(prev, prev, tgt, 1, LIBRE, false).theta;
  eq(new Set(out).size, 1, 'las mesas del mismo motor se han separado: ' + JSON.stringify(out));
  eq(out[0], 20, 'y además aguantan: el error está por debajo de la banda');
});
t('mesas con consignas distintas se mueven cada una con la suya', () => {
  const out = C.execVector([0, 0], [0, 0], [0.4, 5], 1, LIBRE, false).theta;
  eq(out[0], 0, 'la que no llega a la banda no se mueve');
  eq(out[1], 6, 'la que arranca aparca una banda más allá: 5 + 1');
});
t('sin θ previo (primer paso del día) arranca en la consigna, sin rampa fantasma', () =>
  eq(C.execVector([null, null], [null, null], [30, -30], 1, LIBRE, false).theta.join(','), '30,-30'));
t('el vector respeta el bt por elemento', () => {
  const out = C.execVector([30, 30], [30, 30], [29.4, 29.4], 1, SEGURO, [true, false]).theta;
  close(out[0], 28.4, 1e-12, 'la que backtrackea arranca (y el adelanto hacia plano sí vale)');
  eq(out[1], 30, 'la que no, aguanta');
});

console.log('desalineo y sanidad');
t('desalineo medio: la media de |ejecutado − consigna|', () =>
  close(C.desalineo([10, 20, 30], [10.5, 19, 30]), (0.5 + 1 + 0) / 3, 1e-12));
t('desalineo ignora los huecos', () => close(C.desalineo([10, null, 30], [11, 99, 30]), 0.5, 1e-12));
t('nada de NaN/Infinity en un barrido determinista de parámetros', () => {
  for (const db of [0, 0.1, 1, 5, 20]) for (const sl of [0, 0.01, 0.17, 5])
    for (const mo of ['libre', 'seguro']) for (const ci of [1, 6, 60]) {
      const r = corre(sol, { deadbandDeg: db, slewDegS: sl, maxAngle: 55, modo: mo, cicloSeg: ci }, true);
      ok(r.exec.every(Number.isFinite), `db=${db} slew=${sl} ${mo} ciclo=${ci}`);
      ok(r.exec.every(v => Math.abs(v) <= 55 + 1e-9), `tope roto con db=${db} slew=${sl}`);
    }
});
t('determinista: dos pasadas iguales dan lo mismo', () =>
  eq(JSON.stringify(corre(sol, LIBRE, true)), JSON.stringify(corre(sol, LIBRE, true))));
t('los canónicos: 1,0° y 0,17°/s de la casa, y el ciclo de la TCU REAL en 1 s', () => {
  eq(C.CANON.deadbandDeg, 1.0); eq(C.CANON.slewDegS, 0.17);
  // el ciclo NO viene de overcast.html —su CANON solo trae deadband y slew, y su
  // «ciclo» es la resolución con la que el usuario simula—: la TCU calcula cada
  // segundo, y eso es de campo. La primera versión puso 1 MINUTO diciendo que era
  // un canónico de la casa, y con eso el enclavamiento no ataba nunca (a 0,17°/s,
  // en 60 s el actuador recorre 10,2° y cualquier paso cabe en un ciclo).
  eq(C.CANON.cicloSeg, 1);
});

t('EL CICLO DECIDE SI EL ENCLAVAMIENTO ATA, y por eso importa que sea 1 s', () => {
  // un paso de banda a ciclo de 1 s son varios ciclos de motor en marcha; a 60 s
  // cabe en uno solo. Con la banda de 1° y 0,17°/s: 1/0,17 = 5,88 → 6 ciclos.
  const dtMin = 5, subida = 6;                       // consigna que sube 6° en 5 min
  const ciclos = (cicloSeg) => {
    let th = 0, mov = 0, pk = null, arranques = 0, marchando = 0;
    const n = Math.round(dtMin * 60 / cicloSeg);
    for (let i = 1; i <= n; i++) {
      const antes = mov;
      const r = C.step(th, subida * (i / n), cicloSeg, { ...LIBRE, cicloSeg }, false, mov, pk);
      if (r.dir && !antes) arranques++;
      if (r.dir) marchando++;
      th = r.theta; mov = r.dir; pk = r.park;
    }
    return { arranques, marchando, n };
  };
  const uno = ciclos(1), sesenta = ciclos(60);
  // a 60 s el movimiento se resuelve dentro del ciclo: nunca queda «en marcha»
  ok(sesenta.marchando === 0, `a 60 s el motor queda en marcha ${sesenta.marchando} veces: cabría revisar`);
  // a 1 s el enclavamiento es el que lleva el paso hasta el final, varios ciclos
  ok(uno.marchando >= 4 * uno.arranques,
     `a 1 s el motor marcha ${uno.marchando} ciclos en ${uno.arranques} arranques: el paso no se está enclavando`);
});

/* ── LA CONSIGNA QUE RETROCEDE: el defecto que este banco NO cubría ─────────
   Este núcleo enclavaba el destino al arrancar y NO lo recalculaba nunca, así
   que con la consigna bajando —el codo del backtracking, una nube en la
   política óptima, la puesta— el eje seguía viaje a un destino que ya nadie
   pedía. Y el banco lo dejó pasar: 44 comprobaciones en verde con el defecto
   dentro, porque ninguna movía la consigna HACIA ATRÁS a media maniobra.
   La autoridad es `solargpt_core/direction.py` (caso 06 de su contrato) y
   `overcast.html` ya la implementaba; este era el único cabezal atrasado.
   Los números son los MEDIDOS a los dos lados con la misma serie —sube a 1,2°,
   baja 0,12°/paso hasta 0— y se fijan exactos, no aproximados. */
t('la consigna que RETROCEDE abandona el destino rancio, con la trayectoria de la autoridad', () => {
  const loop = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55, modo: 'libre', cicloSeg: 1 };
  const cons = [];
  for (let k = 0; k < 40; k++) cons.push(k < 5 ? 1.2 : (k < 25 ? 1.2 - 0.12 * (k - 5) : 0));
  let th = 0, dir = 0, park = null, dirUlt = 0, peor = 0;
  for (const tgt of cons) {
    const r = C.step(th, tgt, 1, loop, false, dir, park, dirUlt);
    th = r.theta; dir = r.dir; park = r.park; dirUlt = r.dirUlt;
    peor = Math.max(peor, th);
  }
  // lo que da direction.py con la MISMA serie, medido ejecutándolo
  close(peor, 1.70, 1e-9);
  close(th, -0.40, 1e-9);
  // y el ORÁCULO PUEDE PONERSE ROJO: con la ley vieja (destino solo enclavado)
  // esta misma serie daba 2,200 de máximo y −0,760 de final. Si alguien la
  // devuelve, estos dos números vuelven y el test lo dice.
  ok(Math.abs(peor - 2.20) > 1e-6 && Math.abs(th + 0.76) > 1e-6,
     `la trayectoria es la de la ley VIEJA (máx ${peor.toFixed(3)}, final ${th.toFixed(3)}): ` +
     'el destino se ha vuelto a enclavar sin recalcular');
});

t('…y con la consigna que AVANZA el paso sigue siendo de DOS bandas exactas', () => {
  // el otro mal, y por eso el destino efectivo es el MÁS CERCANO de los dos:
  // recalculando solo el vivo, con la consigna derivando el destino huye y el
  // eje se queda de seguidor perpetuo una banda por delante, sin dar nunca el
  // paso. Con deriva hacia delante el enclavado tiene que seguir mandando.
  const loop = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55, modo: 'libre', cicloSeg: 1 };
  let th = -40, dir = 0, park = null, dirUlt = 0;
  const pasos = [];
  for (let k = 0; k < 400; k++) {
    const tgt = -40 + 0.02 * k;                    // deriva suave, como el sol
    const antes = th;
    const r = C.step(th, tgt, 1, loop, false, dir, park, dirUlt);
    th = r.theta; dir = r.dir; park = r.park; dirUlt = r.dirUlt;
    if (r.dir === 0 && dir === 0 && Math.abs(th - antes) < 1e-12 && pasos.length &&
        pasos[pasos.length - 1].abierto) pasos[pasos.length - 1].abierto = false;
    if (r.dir !== 0 && (!pasos.length || !pasos[pasos.length - 1].abierto))
      pasos.push({ desde: antes, abierto: true });
    if (pasos.length && pasos[pasos.length - 1].abierto) pasos[pasos.length - 1].hasta = th;
  }
  const largos = pasos.filter(x => !x.abierto).map(x => Math.abs(x.hasta - x.desde));
  ok(largos.length >= 3, `solo ${largos.length} pasos completos: la serie no ejercita el enclavamiento`);
  for (const L of largos)
    ok(Math.abs(L - 2) < 0.06, `un paso mide ${L.toFixed(3)}° y la ley manda dos bandas (2,0°)`);
});

console.log('');
if (FAIL) { console.error(`FALLAN ${FAIL}/${N}`); process.exit(1); }
console.log(`OK — ${N}/${N} tests`);
