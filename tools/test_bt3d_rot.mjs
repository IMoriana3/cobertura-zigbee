/* EL SEGUIMIENTO, CON LAS FILAS GIRADAS.
 *
 * Reportado por el cliente al cargar LODOSA: «me hace el seguimiento al revés,
 * de oeste a este». `bt3dAng` calculaba el ángulo con el Este del MUNDO, pero
 * el render dibuja en el marco del seguidor —`trackerBase` gira cada uno por su
 * rumbo y `updateSpin` bascula dentro de ese marco—. Con el tubo a norte-sur
 * las dos referencias coinciden, y por eso llevaba años sin verse: El Burgo,
 * Fayón, Túnez, Ayora, San José y Páramo tienen TODOS rot 0. Lodosa fue el
 * primero con las filas giradas.
 *
 *     python3 -m http.server 8124 --directory .  &
 *     node tools/test_bt3d_rot.mjs elburgo
 */
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const PUERTO = process.env.PUERTO || 8124;
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const b = await chromium.launch({ executablePath: EXE,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 320, height: 200 } });
await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) {} });
const pg = await ctx.newPage(); const t0 = Date.now();
await pg.goto(`http://localhost:${PUERTO}/terreno.html?planta=${process.argv[2] || 'elburgo'}`,
              { waitUntil: 'domcontentloaded', timeout: 120000 });
while (!(await pg.evaluate(() => typeof bt3dAng === 'function' && typeof afbtSol === 'function'))) {
  if (Date.now() - t0 > 300000) throw new Error('la página no expuso bt3dAng/afbtSol');
  await pg.waitForTimeout(400);
}

/* El invariante FÍSICO, y por eso se mide así y no comparando con un número:
   el panel tiene que MIRAR AL SOL. Se comprueba con el producto escalar entre
   la normal del panel —(−sinθ, cosθ) en el marco del tubo, la misma que usa el
   cálculo de POA— y el sol en ESE MISMO marco. Positivo = le da la cara. */
const r = await pg.evaluate(() => {
  const DEG = Math.PI / 180;
  const el = 30 * DEG, az = 91.6 * DEG;                 // sol de la MAÑANA, este
  const sol = { E: Math.cos(el) * Math.sin(az), N: Math.cos(el) * Math.cos(az), U: Math.sin(el) };
  /* El sol de la tarde se espeja EN EL MARCO DEL TUBO, no en el del mundo.
     Primera versión de este test: espejaba `sol.E` a secas y fallaba con rot
     45/90/120 — y no era el código, era la prueba: espejar en el eje N-S del
     MUNDO no es una simetría de un tubo girado. Solo coincide con rot 0 y 180,
     que es exactamente donde pasaba. Se espeja donde sí es simetría. */
  const espejaEnTubo = (sv, rot) => {
    const t = afbtSol(sv, rot);                          // al marco del tubo
    return afbtSol({ E: -t.E, N: t.N, U: t.U }, -rot);   // espejo, y de vuelta
  };
  const antes = { SUN: window.SUN, bt: (typeof btOn !== 'undefined' ? btOn : null) };
  const salida = [];
  for (const rotDeg of [0, 20, 45, 90, 120, 150, 180, -45, -120]) {
    const t = { rot: rotDeg * DEG, mc: { gN: 0, ase: 0, cse: 0, aso: 0, cso: 0 } };
    const fila = { rot: rotDeg };
    for (const [cual, sv] of [['manana', sol], ['tarde', espejaEnTubo(sol, t.rot)]]) {
      window.SUN = { _dir: sv };
      try { window.btOn = false; } catch (e) {}
      const th = bt3dAng(t) * DEG;
      const svT = afbtSol(sv, t.rot);                   // el sol en el marco del tubo
      fila[cual] = { ang: th / DEG, coseno: -Math.sin(th) * svT.E + Math.cos(th) * svT.U };
    }
    salida.push(fila);
  }
  window.SUN = antes.SUN; if (antes.bt !== null) window.btOn = antes.bt;
  return salida;
});

console.log('Sol de mañana (az 91,6°) y su espejo de tarde. El panel debe MIRAR al sol.\n');
console.log(' rot      θ mañana   cos(AOI)      θ tarde   cos(AOI)');
for (const f of r) {
  console.log('  ' + String(f.rot).padStart(4) + '°   ' +
    f.manana.ang.toFixed(1).padStart(7) + '°   ' + f.manana.coseno.toFixed(3).padStart(7) + '   ' +
    f.tarde.ang.toFixed(1).padStart(9) + '°   ' + f.tarde.coseno.toFixed(3).padStart(7));
}
console.log('');

for (const f of r) {
  check(`rot ${f.rot}°: por la mañana el panel MIRA al sol`, f.manana.coseno > 0.5,
        `cos(AOI)=${f.manana.coseno.toFixed(3)} con θ=${f.manana.ang.toFixed(1)}°`);
  check(`rot ${f.rot}°: por la tarde también`, f.tarde.coseno > 0.5,
        `cos(AOI)=${f.tarde.coseno.toFixed(3)}`);
}
/* Y la ANTISIMETRÍA: con el sol espejado, el ángulo tiene que ser el opuesto.
   Es lo que rompe el fallo — con rot>90 los dos salían del mismo signo. */
for (const f of r) {
  check(`rot ${f.rot}°: mañana y tarde dan ángulos OPUESTOS`,
        Math.abs(f.manana.ang + f.tarde.ang) < 0.5,
        `${f.manana.ang.toFixed(1)}° vs ${f.tarde.ang.toFixed(1)}°`);
}
/* CONTROL: los seis emplazamientos reales tienen rot 0 y NO se pueden mover. */
const cero = r.find(f => f.rot === 0);
/* −55 y no −60: hay TOPE (`COTAS.limite`, 55° por defecto) y el seguimiento
   puro a esa hora se pasa. La primera versión esperaba −60 y falló — mi
   expectativa, no el código. Queda el número con su motivo al lado. */
check('CONTROL rot 0 (El Burgo, Fayón, Túnez, Ayora, San José, Páramo): sin cambio',
      Math.abs(cero.manana.ang - (-55)) < 0.05, `θ=${cero.manana.ang.toFixed(2)}°`);



/* ── LA SEGUNDA PUERTA, la que Lodosa pisa de verdad ─────────────────────
 * La primera cura se hizo solo en `bt3dAng` y el cliente respondió: «en el
 * 5.90 sigue girando al revés». Tenía razón: `bt3dAng` exige levantamiento
 * con cotas (solo El Burgo). Un layout IMPORTADO pasa por `updateSpin` con el
 * `panelAngle` global — tubo N-S del mundo, rot ignorado. El banco de arriba
 * daba 28 verdes sin proteger el caso del cliente: verde que no vigila.   */
const pg2 = await ctx.newPage(); const t1 = Date.now();
await pg2.goto(`http://localhost:${PUERTO}/terreno.html?planta=${process.argv[2] || 'elburgo'}`,
               { waitUntil: 'domcontentloaded', timeout: 120000 });
while (!(await pg2.evaluate(() => typeof panelAngle === 'function' && typeof afbtSol === 'function'))) {
  if (Date.now() - t1 > 300000) throw new Error('la página no expuso panelAngle');
  await pg2.waitForTimeout(400);
}
const r2 = await pg2.evaluate(() => {
  const DEG = Math.PI / 180;
  const antes = { sim: window.simOn, bt: (typeof btOn !== 'undefined' ? btOn : null) };
  try { window.simOn = true; window.btOn = false; } catch (e) {}
  // una mañana de verdad de la planta: el primer minuto con el sol alto al este
  let m0 = null;
  for (let m = 300; m < 800; m += 5) { const sv = sunVec(m); if (sv.U > 0.35 && sv.E > 0.35) { m0 = m; break; } }
  const salida = { m0, filas: [] };
  if (m0 !== null) {
    for (const rotDeg of [0, 45, 120, 180, -120]) {
      const rot = rotDeg * DEG;
      const th = panelAngle(m0, rot) * DEG;         // COMO updateSpin lo llama: rot en rad
      const svT = afbtSol(sunVec(m0), rot);
      /* El invariante NO es «cos(AOI) alto»: con el sol casi a lo largo del
         tubo (rot −120° por la mañana) ni el seguimiento perfecto pasa de
         ~0,45. Es «el cos DEL ÓPTIMO ALCANZABLE»: θ* = −atan2(E,U) topado a
         ±55°. La primera versión pedía >0,5 a secas y falló en −120° — mi
         física, no el código. */
      const thOpt = Math.max(-55 * DEG, Math.min(55 * DEG, -Math.atan2(svT.E, svT.U)));
      salida.filas.push({ rot: rotDeg, ang: th / DEG,
                          coseno: -Math.sin(th) * svT.E + Math.cos(th) * svT.U,
                          optimo: -Math.sin(thOpt) * svT.E + Math.cos(thOpt) * svT.U,
                          viejo: panelAngle(m0) * DEG / DEG });
    }
  }
  window.simOn = antes.sim; if (antes.bt !== null) window.btOn = antes.bt;
  return salida;
});
check('hay una mañana de prueba en la planta', r2.m0 !== null, 'sunVec no dio sol alto');
for (const f of r2.filas) {
  check(`panelAngle(rot ${f.rot}°): el panel alcanza el ÓPTIMO de su tubo`,
        f.coseno > f.optimo - 1e-6,
        `cos=${f.coseno.toFixed(3)} vs óptimo ${f.optimo.toFixed(3)} con θ=${f.ang.toFixed(1)}°`);
}
const f0 = r2.filas.find(f => f.rot === 0);
check('CONTROL: panelAngle con rot 0 == panelAngle de siempre (los 6 emplazamientos)',
      f0 && Math.abs(f0.ang - f0.viejo) < 1e-9, f0 && `${f0.ang} vs ${f0.viejo}`);
const f180 = r2.filas.find(f => f.rot === 180);
check('con el eje a 180° (Lodosa) el ángulo se INVIERTE respecto al tubo N-S',
      f180 && Math.abs(f180.ang + f180.viejo) < 0.6,
      f180 && `${f180.ang.toFixed(1)}° vs global ${f180.viejo.toFixed(1)}°`);
/* Y que updateSpin USA esta puerta: sin esto, panelAngle sabría de rot y nadie
 * se lo pediría — exactamente el agujero que tapó al cliente. */
const src = await pg2.evaluate(() => updateSpin.toString());
check('updateSpin pide el ángulo POR TRACKER cuando hay rumbo',
      src.includes('panelAngle(curMin,t.rot)'), 'la rama de rot no está en updateSpin');
check('…pero NO transforma la consigna de stow ni la telemetría (marco del tubo ya)',
      src.includes('_STOWANG==null') && src.includes('simOn||!ANG'));

/* ── LA POA, con los rumbos de la planta ─────────────────────────────────
 * `genModel` usaba el tubo N-S del mundo para toda la producción: con las
 * filas giradas, la cifra era de otro campo (−8,5 % a 45°, −32 % a 90°,
 * medido). Aquí se sustituye TRK por plantas sintéticas de puro rumbo y se
 * exigen invariantes físicos, no números mágicos.                        */
const r3 = await pg2.evaluate(() => {
  const DEG = Math.PI / 180;
  const antes = { sim: window.simOn, bt: (typeof btOn !== 'undefined' ? btOn : null),
                  trk: window.TRK, stow: window._STOWANG };
  try { window.simOn = true; window.btOn = false; window._STOWANG = null; } catch (e) {}
  let m0 = null;
  for (let m = 300; m < 800; m += 5) { const sv = sunVec(m); if (sv.U > 0.35 && sv.E > 0.35) { m0 = m; break; } }
  const poaCon = rots => { window.TRK = rots.map(r => ({ rot: r * DEG })); return genModel(m0).poa; };
  const salida = { m0 };
  if (m0 !== null) {
    salida.p0    = poaCon([0]);
    salida.p180  = poaCon([180]);          // el mismo eje físico, marco volteado
    salida.p90   = poaCon([90]);           // tubo E-O: otra física, PEOR mañana
    salida.pMix  = poaCon([0, 90]);        // planta mixta: media de las dos
    salida.pMix2 = poaCon([0, 0, 90]);     // DESIGUAL: 2 a 1 — la ponderación de verdad
    /* Ancla ABSOLUTA para el tubo a 90°, calculada aquí con la física a mano:
       sin ella, el mutante «ignora los rumbos» sobrevivía a la comprobación
       mixta, que era autoconsistente bajo el propio mutante (medido: mataba
       2 de 4 predichos). Contra un número independiente no hay consistencia
       interna que valga. */
    {
      const sv = sunVec(m0), svT = afbtSol(sv, 90 * DEG);
      const AM = 1 / Math.max(0.05, sv.U);
      const dni = 1361 * Math.pow(0.7, Math.pow(AM, 0.678)), dhi = 0.10 * 1361 * sv.U;
      const th = Math.max(-55 * DEG, Math.min(55 * DEG, -Math.atan2(svT.E, svT.U)));
      salida.esperado90 = Math.max(0, dni * Math.max(0, -Math.sin(th) * svT.E + Math.cos(th) * svT.U) + dhi);
    }
    /* Con GEN_KWP a 0 (planta sin capa de generación) el día sale 0 MWh con
       cualquier rumbo y la comprobación no distingue nada — le pasó a la
       primera versión de este check. Se le da potencia y se restaura. */
    const kwpAntes = window.GEN_KWP; window.GEN_KWP = 1000;
    salida.dia0  = (window.TRK = [{ rot: 0 }],        genDayMWh());
    salida.dia90 = (window.TRK = [{ rot: 90 * DEG }], genDayMWh());
    window.GEN_KWP = kwpAntes;
    // y el POR QUÉ del fallo original: la fórmula vieja para el tubo a 90°
    const sv = sunVec(m0), th = panelAngle(m0) * DEG;
    salida.viejo90 = Math.max(0, (1361 * Math.pow(0.7, Math.pow(1 / Math.max(0.05, sv.U), 0.678))) *
      Math.max(0, -Math.sin(th) * afbtSol(sv, 90 * DEG).E + Math.cos(th) * afbtSol(sv, 90 * DEG).U) +
      0.10 * 1361 * sv.U);
  }
  window.TRK = antes.trk; window.simOn = antes.sim; window._STOWANG = antes.stow;
  if (antes.bt !== null) window.btOn = antes.bt;
  return salida;
});
check('POA · control rot 0: un solo grupo, el ángulo de siempre', r3.p0 > 0);
check('POA · rot 180 == rot 0 (es el MISMO eje físico, solo el marco volteado)',
      Math.abs(r3.p180 - r3.p0) < 1e-6, `${r3.p180?.toFixed(2)} vs ${r3.p0?.toFixed(2)}`);
check('POA · el tubo E-O (rot 90) rinde MENOS esa mañana, pero no se hunde',
      r3.p90 > 0 && r3.p90 < r3.p0, `p90=${r3.p90?.toFixed(1)} p0=${r3.p0?.toFixed(1)}`);
check('POA · una planta MIXTA es la media ponderada de sus rumbos',
      Math.abs(r3.pMix - (r3.p0 + r3.p90) / 2) < 1e-6,
      `${r3.pMix?.toFixed(2)} vs ${((r3.p0 + r3.p90) / 2).toFixed(2)}`);
check('POA · con rot 90 ya NO sale la cifra del fallo (apuntar N-S, medir E-O)',
      Math.abs(r3.p90 - r3.viejo90) > 1,
      `nueva=${r3.p90?.toFixed(1)} vieja=${r3.viejo90?.toFixed(1)}`);
check('POA · rot 90 CASA con la física a mano (ancla absoluta, no consistencia)',
      Math.abs(r3.p90 - r3.esperado90) < 1e-6,
      `p90=${r3.p90?.toFixed(3)} esperado=${r3.esperado90?.toFixed(3)}`);
check('POA · la mezcla DESIGUAL (2×rot0 + 1×rot90) pondera por TRACKERS, no por grupos',
      Math.abs(r3.pMix2 - (2 * r3.p0 + r3.p90) / 3) < 1e-6,
      `${r3.pMix2?.toFixed(2)} vs ${((2 * r3.p0 + r3.p90) / 3).toFixed(2)}`);
check('la CACHÉ diaria distingue plantas con rumbos distintos',
      Math.abs(r3.dia0 - r3.dia90) > 1e-9,
      `dia0=${r3.dia0?.toFixed(4)} dia90=${r3.dia90?.toFixed(4)} — la clave no lleva la firma de rumbos`);

await b.close();
console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
process.exit(ko ? 1 : 0);
