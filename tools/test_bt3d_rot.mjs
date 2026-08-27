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

await b.close();
console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
process.exit(ko ? 1 : 0);
