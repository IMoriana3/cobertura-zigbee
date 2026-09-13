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

const LIBRE  = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55, modo: 'libre',  cicloMin: 1 };
const SEGURO = { deadbandDeg: 1, slewDegS: 0.17, maxAngle: 55, modo: 'seguro', cicloMin: 1 };
const SOL_DEG_MIN = 0.25;                    // el sol deriva 15°/h: la escala de la que se habla

/* Recorre un día sintético con la consigna que se le pase y devuelve la traza. */
function corre(target, loop, bt, dtMin) {
  const dt = dtMin ?? 1, exec = [], errs = [];
  let th = target[0], tPrev = target[0], mov = false, arranques = 0;
  for (let i = 1; i < target.length; i++) {
    const antes = th;
    const r = C.execTramo(th, tPrev, target[i], dt, loop, bt ? (bt[i] ?? bt) : false, mov);
    th = r.theta; mov = r.moving;
    if (Math.abs(th - antes) > 1e-9) arranques++;
    exec.push(th); errs.push(Math.abs(th - target[i])); tPrev = target[i];
  }
  return { exec, errs, arranques, maxErr: Math.max(...errs),
           mediaErr: errs.reduce((a, b) => a + b, 0) / errs.length };
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
t('error justo en la banda: arranca', () => eq(C.step(10, 11, 60, LIBRE, false).theta, 11));
t('error por encima: arranca', () => eq(C.step(10, 12, 60, LIBRE, false).theta, 12));
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
  eq(C.step(30, 29.4, 60, SEGURO, true).theta, 29.4));
t("'seguro' sigue aguantando hacia el lado que NO sombrea (más plano)", () =>
  eq(C.step(29.4, 30, 60, SEGURO, true).theta, 29.4));
t("'seguro' sin backtracking recortando se comporta como 'libre'", () =>
  eq(C.step(30, 29.4, 60, SEGURO, false).theta, C.step(30, 29.4, 60, LIBRE, false).theta));
t("'seguro': un aguante que cruzaría el cero también arranca (criterio conservador)", () =>
  eq(C.step(-0.6, 0.2, 60, SEGURO, true).theta, 0.2));

console.log('la sierra: lo que la banda muerta le hace al seguimiento');
const sol = Array.from({ length: 241 }, (_, i) => -30 + SOL_DEG_MIN * i);   // 4 h de deriva limpia,
// de −30 a +30: DENTRO del tope mecánico a propósito. Con 0..60 el tope recortaba a 55 y el
// «desalineo» medía 5° de recorte en vez de la sierra de la banda — se midió, no se supuso.
const rSol = corre(sol, LIBRE, false);
t('el desalineo NUNCA pasa de la banda', () => ok(rSol.maxErr <= LIBRE.deadbandDeg + 1e-9, `max ${rSol.maxErr}`));
t('EL PASO DEL TRACKER ES LA BANDA: cada movimiento avanza una banda exacta', () => {
  // Lo que pidió Ignacio, medido: con banda de 1° y el sol derivando 0,25°/min,
  // el motor no arranca hasta que el error alcanza la banda y entonces avanza
  // eso. 60 movimientos de 1,000° para 60° de recorrido, y ni uno mayor.
  let th = sol[0], tPrev = sol[0], mov = false, saltos = [];
  for (let i = 1; i < sol.length; i++) {
    const antes = th;
    const r = C.execTramo(th, tPrev, sol[i], 1, LIBRE, false, mov);
    th = r.theta; mov = r.moving; tPrev = sol[i];
    if (Math.abs(th - antes) > 1e-9) saltos.push(Math.abs(th - antes));
  }
  eq(saltos.length, 60, 'un paso por banda recorrida');
  for (const d of saltos) close(d, LIBRE.deadbandDeg, 1e-9, 'el paso no es la banda');
});
t('con OTRA banda, el paso es la OTRA banda (no hay 1° escondido)', () => {
  // Muestreo A NIVEL DE CICLO, no por tramo de integración. Un paso es una RÁFAGA de ciclos
  // moviéndose, y con banda 2,5° y ciclo 6 s la ráfaga son 3 ciclos: medida por tramos de 1 min se
  // parte entre dos tramos —con estos números, SIEMPRE, porque 2,5 = 10 × 0,25— y se medía 1,02°,
  // que es la velocidad del actuador. El paso se cierra cuando el motor SE PARA.
  const L2 = { ...LIBRE, deadbandDeg: 2.5, cicloMin: 0.1 };
  let th = -30, tPrev = -30, mov = false, pasos = [], acc = 0;
  for (let i = 1; i <= 2400; i++) {
    const tNow = -30 + SOL_DEG_MIN * i * 0.1;
    const r = C.execTramo(th, tPrev, tNow, 0.1, L2, false, mov);
    acc += Math.abs(r.theta - th); th = r.theta; tPrev = tNow;
    if (mov && !r.moving && acc > 1e-9) { pasos.push(acc); acc = 0; }
    mov = r.moving;
  }
  ok(pasos.length > 15, `pocos pasos cerrados: ${pasos.length}`);
  for (const d of pasos) close(d, L2.deadbandDeg, 0.15, 'el paso tiene que seguir a la banda');
});
t('el desalineo medio es del orden de media banda', () =>
  ok(rSol.mediaErr > 0.25 * LIBRE.deadbandDeg && rSol.mediaErr < 0.75 * LIBRE.deadbandDeg, `media ${rSol.mediaErr}`));
t('el motor arranca ~una vez por banda recorrida, no en continuo', () => {
  const recorrido = sol[sol.length - 1] - sol[0], esperados = recorrido / LIBRE.deadbandDeg;
  ok(rSol.arranques > 0.5 * esperados && rSol.arranques < 2 * esperados,
     `${rSol.arranques} arranques para ${esperados.toFixed(0)} esperados`);
});
t('sin banda el motor arranca en TODOS los pasos (el mutante del ahorro de desgaste)', () => {
  const r = corre(sol, { deadbandDeg: 0, slewDegS: 0.17, maxAngle: 55, cicloMin: 1 }, false);
  eq(r.arranques, sol.length - 1);
  // El ahorro NO es «de sobra»: es exactamente banda / deriva por paso = 1 / 0,25 = 4. Medido, no
  // supuesto — la primera versión de este test pedía 10× y falló con razón.
  close(r.arranques / rSol.arranques, LIBRE.deadbandDeg / SOL_DEG_MIN, 0.3, 'factor de ahorro');
});
t('LA AFIRMACIÓN DEL COSENO, contra la fórmula: la pérdida media es b²/6 (radianes)', () => {
  // Con el error repartido uniforme en [0, banda] —que es lo que deja la sierra cuando el ciclo es
  // fino— la media de 1−cos(e) vale b²/6. Se muestrea A NIVEL DE CICLO: muestrear al paso de
  // integración da una sierra aliased (con banda 1° y paso 1 min solo salen las fases 0,25/0,5/0,75
  // y la media se queda un 35 % corta).
  // Y ojo con la cuenta fácil: 1−cos es CONVEXO, así que evaluarlo en el error MEDIO subestima
  // (0,0038 % contra 0,0051 % con banda de 1°). Es el error que había en la tarjeta de la página.
  for (const b of [0.5, 1, 2]) {
    const loop = { deadbandDeg: b, slewDegS: 0.17, maxAngle: 55, modo: 'libre', cicloMin: 0.02 };
    let th = -30, tPrev = -30, mov = false, s = 0, n = 0;
    for (let i = 1; i <= 6000; i++) {                      // 120 min a 0,02 min por ciclo
      const tNow = -30 + SOL_DEG_MIN * i * 0.02;
      const r = C.execTramo(th, tPrev, tNow, 0.02, loop, false, mov);
      th = r.theta; mov = r.moving; tPrev = tNow;
      s += 1 - Math.cos(Math.abs(th - tNow) * Math.PI / 180); n++;
    }
    const media = s / n, formula = Math.pow(b * Math.PI / 180, 2) / 6;
    if (!(Math.abs(media / formula - 1) < 0.06))
      throw new Error(`banda ${b}°: medido ${(media*100).toFixed(4)} % contra b²/6 ${(formula*100).toFixed(4)} %`);
  }
});
t('el slew no se supera en ningún paso de la traza', () => {
  let th = sol[0], tPrev = sol[0], mov = false;
  for (let i = 1; i < sol.length; i++) {
    const antes = th;
    const r = C.execTramo(th, tPrev, sol[i], 1, LIBRE, false, mov); th = r.theta; mov = r.moving;
    tPrev = sol[i];
    ok(Math.abs(th - antes) <= LIBRE.slewDegS * 60 + 1e-9, `paso ${i}: ${Math.abs(th - antes)}°/min`);
  }
});

console.log('la tarde en backtracking: donde la banda muerta SÍ cuesta');
// la consigna de backtracking baja hacia plano al caer el sol; aguantar = quedarse sobreinclinado
const tarde = Array.from({ length: 121 }, (_, i) => 30 - 0.25 * i);
const rLibre = corre(tarde, LIBRE, true), rSeguro = corre(tarde, SEGURO, true);
t("'libre' deja al tracker SOBREINCLINADO respecto al límite de sombra", () => {
  const sobre = rLibre.exec.map((e, i) => e - tarde[i + 1]).filter(d => d > 1e-9);
  ok(sobre.length > 0.5 * rLibre.exec.length, `solo ${sobre.length} pasos sobreinclinados de ${rLibre.exec.length}`);
  ok(Math.max(...sobre) <= LIBRE.deadbandDeg + 1e-9, 'la sobreinclinación no puede pasar de la banda');
});
t("'seguro' NO se sobreinclina ni una vez", () => {
  const sobre = rSeguro.exec.map((e, i) => e - tarde[i + 1]).filter(d => d > 1e-9);
  eq(sobre.length, 0, `${sobre.length} pasos sombreando`);
});
t('por la MAÑANA la banda juega al lado seguro sola: nadie se sobreinclina', () => {
  const manana = Array.from({ length: 121 }, (_, i) => 0.25 * i);   // |consigna| creciendo
  const r = corre(manana, LIBRE, true);
  eq(r.exec.map((e, i) => e - manana[i + 1]).filter(d => d > 1e-9).length, 0);
});
t("y con la consigna bajando, 'seguro' paga más desgaste que 'libre' (no sale gratis)", () =>
  ok(rSeguro.arranques > rLibre.arranques, `${rSeguro.arranques} vs ${rLibre.arranques}`));

console.log('execTramo — la rejilla en la que corre el lazo cambia el resultado');
t('lazo apagado: el tramo acaba EXACTAMENTE en la consigna', () =>
  close(C.execTramo(0, 0, 12, 60, { deadbandDeg: 0, slewDegS: 99, maxAngle: 55, cicloMin: 1 }, false).theta, 12, 1e-12));
t('evaluar el lazo en la rejilla de integración se come el escalón', () => {
  // Barrido de derivas horarias en vez de una sola. Con una suelta el test es frágil de verdad: si
  // el periodo de la sierra (banda/deriva, en pasos) DIVIDE al número de pasos del tramo, el tramo
  // acaba clavado en la consigna y el fino sale igual que el burdo por conmensurabilidad, no porque
  // el lazo no haga nada. Pasó con 15°/h (periodo 4) y con 13,7°/h (periodo 5). Lo que se afirma es
  // que la rejilla CAMBIA el resultado, y eso se mide en promedio.
  const dt = 60, derivas = [5, 7, 9, 11, 13, 17, 19, 23];
  let sFino = 0, peorBurdo = 0;
  for (const d of derivas) {
    // CENTRADO en 0 y solo tres tramos: con −30 + 19·i la consigna llegaba a 65° y el tope recortaba
    // a 55, así que el «desalineo» medía 10° de recorte. Ya me pilló una vez en el barrido del sol.
    const tgt = Array.from({ length: 4 }, (_, i) => -1.5 * d + d * i);
    const fino  = corre(tgt, { ...LIBRE, cicloMin: 1  }, false, dt);
    const burdo = corre(tgt, { ...LIBRE, cicloMin: dt }, false, dt);
    sFino += fino.mediaErr; peorBurdo = Math.max(peorBurdo, burdo.maxErr);
    ok(fino.maxErr <= LIBRE.deadbandDeg + 1e-9, `sierra sin acotar con ${d}°/h: ${fino.maxErr}`);
  }
  close(peorBurdo, 0, 1e-12, 'un paso por tramo planta al tracker en la consigna: banda invisible');
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
  ok(Number.isFinite(C.execTramo(0, 0, 10, 5, { ...LIBRE, cicloMin: 0 }, false).theta));
  ok(Number.isFinite(C.execTramo(0, 0, 10, 5, { ...LIBRE, cicloMin: -1 }, false).theta));
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
  eq(out[0], 0); eq(out[1], 5);
});
t('sin θ previo (primer paso del día) arranca en la consigna, sin rampa fantasma', () =>
  eq(C.execVector([null, null], [null, null], [30, -30], 1, LIBRE, false).theta.join(','), '30,-30'));
t('el vector respeta el bt por elemento', () => {
  const out = C.execVector([30, 30], [30, 30], [29.4, 29.4], 1, SEGURO, [true, false]).theta;
  close(out[0], 29.4, 1e-12, 'la que backtrackea arranca');
  eq(out[1], 30, 'la que no, aguanta');
});

console.log('desalineo y sanidad');
t('desalineo medio: la media de |ejecutado − consigna|', () =>
  close(C.desalineo([10, 20, 30], [10.5, 19, 30]), (0.5 + 1 + 0) / 3, 1e-12));
t('desalineo ignora los huecos', () => close(C.desalineo([10, null, 30], [11, 99, 30]), 0.5, 1e-12));
t('nada de NaN/Infinity en un barrido determinista de parámetros', () => {
  for (const db of [0, 0.1, 1, 5, 20]) for (const sl of [0, 0.01, 0.17, 5])
    for (const mo of ['libre', 'seguro']) for (const ci of [0.5, 1, 10]) {
      const r = corre(sol, { deadbandDeg: db, slewDegS: sl, maxAngle: 55, modo: mo, cicloMin: ci }, true);
      ok(r.exec.every(Number.isFinite), `db=${db} slew=${sl} ${mo} ciclo=${ci}`);
      ok(r.exec.every(v => Math.abs(v) <= 55 + 1e-9), `tope roto con db=${db} slew=${sl}`);
    }
});
t('determinista: dos pasadas iguales dan lo mismo', () =>
  eq(JSON.stringify(corre(sol, LIBRE, true)), JSON.stringify(corre(sol, LIBRE, true))));
t('los canónicos son los de la casa (overcast.html): 1,0° y 0,17°/s', () => {
  eq(C.CANON.deadbandDeg, 1.0); eq(C.CANON.slewDegS, 0.17);
});

console.log('');
if (FAIL) { console.error(`FALLAN ${FAIL}/${N}`); process.exit(1); }
console.log(`OK — ${N}/${N} tests`);
