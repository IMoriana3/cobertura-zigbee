/* BANCO DE LA ARITMÉTICA de tools/anual_motor.mjs.

   La medida anual cuesta 45 min y no cabe en CI, pero las dos cuentas de las
   que cuelga su conclusión son baratas y sí caben: CÓMO se segmentan las
   maniobras y CON QUÉ modelo se cobra cada una. Si una de las dos se mueve, la
   cifra del motor cambia sin que nadie lo note, y el neto de la comparación
   entre políticas es una resta de esas dos cosas.

   Y el tercer bloque es un CANARIO CRUZADO: las constantes del motor no viven
   aquí, las lee `motorDelCore` del fuente de solargpt_core. Si el core
   recalibra —o si mueve esas líneas de sitio— esto se pone rojo, que es
   exactamente lo que tiene que pasar: la cifra publicada sale de esos números.

       node tools/test_anual_motor.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maniobras, costeMotor, motorDelCore, BANDAS_FLOTA } from './anual_motor.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ok = 0, mal = 0;
const bien = (q, c, d) => { if (c) { ok++; console.log('  ✓ ' + q); } else { mal++; console.log('  ✗ ' + q + (d ? ' — ' + d : '')); } };
const cerca = (a, b, t) => Math.abs(a - b) <= t;

console.log('\nmaniobras: un tramo CONTIGUO de movimiento es UN arranque');
{
  // la invariante que el core enuncia palabra por palabra: «una rampa de 55° en
  // pasos de 1° es UNA maniobra de 55°, no 55 maniobras de 1°»
  const rampa = Array.from({ length: 56 }, (_, i) => i);
  const m = maniobras(rampa, 0.05);
  bien('una rampa de 55° en pasos de 1° es UNA maniobra de 55°',
       m.length === 1 && cerca(m[0], 55, 1e-9), m.length + ' maniobras de ' + m.map(v => v.toFixed(1)));

  const quieto = [10, 10, 10, 10.01, 10, 10];        // ruido de encoder, por debajo de ε
  bien('por debajo de ε=0,05° no hay maniobra, hay ruido',
       maniobras(quieto, 0.05).length === 0, JSON.stringify(maniobras(quieto, 0.05)));

  const dos = [0, 1, 2, 2, 2, 2, 3, 4];              // mueve, para, vuelve a mover
  const md = maniobras(dos, 0.05);
  bien('parar entre medias PARTE la maniobra en dos arranques',
       md.length === 2 && cerca(md[0], 2, 1e-9) && cerca(md[1], 2, 1e-9), JSON.stringify(md));

  const ida = [0, 5, 10, 5, 0];                      // ida y vuelta sin parar
  const mi = maniobras(ida, 0.05);
  bien('ida y vuelta SIN parar es un solo arranque, y su amplitud es el RECORRIDO (20°, no 0)',
       mi.length === 1 && cerca(mi[0], 20, 1e-9), JSON.stringify(mi));

  const cola = [0, 1, 2, 3];                         // el día acaba en movimiento
  bien('una maniobra que llega al final de la traza se cierra igual',
       maniobras(cola, 0.05).length === 1, JSON.stringify(maniobras(cola, 0.05)));
}

console.log('\ncoste: cada maniobra con el modelo medido EN SU régimen');
{
  const M = { monofila: { k: 0.05, e0: 1.0 }, bifila: { k: 0.06, e0: 2.0 },
              flota: { e0: 0.09, k: 0.04 }, dominio: 20, eps: 0.05 };
  const g = costeMotor([55], M, 'monofila');
  bien('|Δθ|≥20° va por el ENSAYO: 1,0 + 0,05·55 = 3,75 Wh',
       cerca(g.wh, 3.75, 1e-9) && g.nG === 1 && g.nP === 0, g.wh.toFixed(4));

  const p = costeMotor([1.5], M, 'monofila');
  bien('|Δθ|<20° va por el AJUSTE DE FLOTA: 0,09 + 0,04·1,5 = 0,15 Wh',
       cerca(p.wh, 0.15, 1e-9) && p.nP === 1 && p.nG === 0, p.wh.toFixed(4));

  // lo que el core prohíbe: cobrar el intercepto del ensayo a una micro-maniobra
  const conEnsayo = M.monofila.e0 + M.monofila.k * 1.5;
  bien('cobrar la micro-maniobra con el intercepto del ensayo daría ' +
       (conEnsayo / p.wh).toFixed(0) + '× más — por eso NO se hace',
       conEnsayo / p.wh > 5, (conEnsayo / p.wh).toFixed(1) + '×');

  const mix = costeMotor([55, 1.5, 0.5], M, 'monofila');
  bien('la mezcla reparte por lados y los dos sumandos cuadran con el total',
       cerca(mix.grande + mix.peque, mix.wh, 1e-12) && mix.nG === 1 && mix.nP === 2,
       JSON.stringify({ g: mix.grande, p: mix.peque, wh: mix.wh }));

  bien('el reparto del recorrido también cuadra con lo que entró',
       cerca(mix.recG + mix.recP, 57, 1e-9), (mix.recG + mix.recP).toFixed(2));

  bien('sin maniobras no hay consumo', costeMotor([], M, 'monofila').wh === 0);

  // la bifila cuesta MÁS que la monofila al mismo recorrido: media estructura
  // frente a estructura entera. No son la dispersión de un régimen.
  bien('bifila > monofila al mismo recorrido (28 % en el recorrido completo, dato del core)',
       costeMotor([110], M, 'bifila').wh > costeMotor([110], M, 'monofila').wh);

  // la segunda opinión: el coste por grado CRECE al bajar la amplitud
  const wd = BANDAS_FLOTA.map(b => b.whDeg);
  bien('la tabla por bandas es MONÓTONA decreciente en amplitud (0,2262 → 0,0653 Wh/°)',
       wd.every((v, i) => i === 0 || v < wd[i - 1]), JSON.stringify(wd));
  bien('…y por eso la opinión de bandas y la del ajuste NO son la misma cuenta',
       Math.abs(costeMotor([1.5], M, 'monofila').pequeBanda - p.peque) > 1e-6);
}

console.log('\ncanario cruzado: las constantes SALEN del core, no de aquí');
{
  const hermano = path.join(path.dirname(ROOT), 'SolarGPTfull');
  if (!fs.existsSync(hermano)) {
    console.log('  – sin SolarGPTfull al lado: el canario cruzado no se puede correr');
  } else {
    const M = motorDelCore();
    // Fase 2.L de solargpt_core.motor_energy, Consumos_motor_02.xlsx, 8 ensayos
    bien('MONOFILA k=0,0489 Wh/° e0=1,222 Wh', M.monofila.k === 0.0489 && M.monofila.e0 === 1.222,
         JSON.stringify(M.monofila));
    bien('BIFILA   k=0,0615 Wh/° e0=2,425 Wh', M.bifila.k === 0.0615 && M.bifila.e0 === 2.425,
         JSON.stringify(M.bifila));
    bien('AJUSTE_FLOTA 0,0901 + 0,0447·|Δθ| sobre 14.759 maniobras',
         M.flota.e0 === 0.0901 && M.flota.k === 0.0447 && M.flota.n === 14759, JSON.stringify(M.flota));
    bien('el dominio medido sigue siendo |Δθ|≥20° y ε=0,05°', M.dominio === 20 && M.eps === 0.05,
         M.dominio + ' / ' + M.eps);
    // y la coherencia entre las dos fuentes de flota: el ajuste y la banda
    // pequeña salen del MISMO careo, así que en su amplitud media tienen que
    // decir casi lo mismo. Es lo que hace legítimo usar el ajuste abajo.
    const amp = 0.50, eAj = M.flota.e0 + M.flota.k * amp, eBd = amp * BANDAS_FLOTA[0].whDeg;
    bien('ajuste y banda <1° coinciden en su amplitud media (0,50°): ' +
         eAj.toFixed(4) + ' contra ' + eBd.toFixed(4) + ' Wh',
         Math.abs(eAj - eBd) / eBd < 0.02, ((eAj / eBd - 1) * 100).toFixed(1) + ' %');
  }
}

console.log('\n' + (mal ? mal + ' FALLOS de ' + (ok + mal) : '✓ ' + ok + ' comprobaciones, todas bien'));
process.exit(mal ? 1 : 0);
