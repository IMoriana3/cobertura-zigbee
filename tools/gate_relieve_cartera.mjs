/* LA PUERTA DE RELIEVE, PASADA A TODA LA CARTERA.
 *
 *   node tools/gate_relieve_cartera.mjs
 *   node tools/gate_relieve_cartera.mjs --csv /tmp/censo.csv
 *
 * POR QUE ESTO NO ES «CORRER LA PUERTA 11 VECES». La puerta
 * (tools/valida_relieve.mjs) contesta «¿me fío de este relieve para configurar
 * backtracking?», y para contestar necesita cotas medidas. De las 11 plantas del
 * índice, NUEVE no tienen ninguna cota: en ellas la puerta no puede decir APTA
 * ni NO EVALUABLE, porque no hay nada que evaluar. Un veredicto ahí sería una
 * respuesta inventada a una pregunta que no se ha podido hacer.
 *
 * Así que esto es un CENSO, no una nota: para cada planta dice en qué escalón
 * está y, si no llega, QUÉ FALTA EXACTAMENTE — que es lo accionable. Los
 * escalones, de menos a más:
 *
 *   NO APLICA        el montaje es fijo. Sin seguimiento no hay backtracking que
 *                    corregir: Dicayagua es FixedMount y su relieve, que además
 *                    es el mejor que tenemos (curvas de nivel propias), no sirve
 *                    para esto. Pedirle un levantamiento de seguidores no tiene
 *                    sentido.
 *   SIN LEVANTAMIENTO no hay cotas de ningún tipo. Es el caso de 8 plantas. Lo
 *                    que hay que pedir es el levantamiento as-built de apoyos.
 *   SIN CASAR        hay levantamiento (<planta>_asbuilt.json) pero no se ha
 *                    generado <planta>_cotas.json: falta pasar cotas_asbuilt.py.
 *   EVALUADA         hay cotas y la puerta se ejecuta de verdad, con su veredicto.
 *
 * LO QUE NO SE HACE, Y POR QUE. Sería fácil rellenar el hueco con un DEM global
 * (terreno.html ya usa teselas Terrarium de ~30 m) y sacar once veredictos. Sería
 * teatro: el vano de estas plantas son 6 m, así que un DEM de 30 m no resuelve la
 * diferencia de cota ENTRE FILAS CONTIGUAS, que es exactamente la magnitud que
 * decide el backtracking. Daría un relieve suave, un «APTA» tranquilizador y una
 * configuración basada en nada. Mejor un hueco declarado.                     */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const CSV = arg('csv');

const IDX = JSON.parse(fs.readFileSync(path.join(ROOT, 'plantas_indice.json'), 'utf-8')).plantas;
const hay = (f) => fs.existsSync(path.join(ROOT, f));

/* Separación medida entre seguidores contiguos DE LA MISMA BANDA. No es el vano:
   en las dos plantas donde conocemos el vano (Ayora 6,00 y San José 6,20) sale
   justo el DOBLE, porque el seguidor del layout es una BIFILA y lleva dos filas.
   Se publica tal cual, sin dividir por dos a ciegas: dónde hay bifila y dónde no
   es dato del proyecto, no algo que deba adivinar un script. */
function separacionMedida(planta) {
  const f = path.join(ROOT, planta + '_layout.json');
  if (!fs.existsSync(f)) return null;
  const T = JSON.parse(fs.readFileSync(f, 'utf-8')).trackers || [];
  if (T.length < 2) return null;
  const G = new Map();
  T.forEach((t, i) => { const b = Math.floor(t.n / 25); if (!G.has(b)) G.set(b, []); G.get(b).push(i); });
  const d = [];
  T.forEach((t, i) => {
    let mejor = null;
    for (const b of [Math.floor(t.n / 25) - 1, Math.floor(t.n / 25), Math.floor(t.n / 25) + 1])
      for (const j of (G.get(b) || [])) {
        if (j === i || Math.abs(T[j].n - t.n) > 20) continue;
        const dx = Math.abs(T[j].x - t.x);
        if (dx > 0.5 && dx < 40 && (mejor === null || dx < mejor)) mejor = dx;
      }
    if (mejor !== null) d.push(mejor);
  });
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

function correPuerta(planta) {
  try {
    const s = execFileSync('node', [path.join(ROOT, 'tools', 'valida_relieve.mjs'), '--planta', planta],
      { encoding: 'utf-8' });
    return { salida: s, codigo: 0 };
  } catch (e) { return { salida: (e.stdout || '') + (e.stderr || ''), codigo: e.status }; }
}

const filas = [];
for (const p of IDX) {
  const n = p.planta, m = p.montaje || {};
  const fila = {
    planta: n, unidades: p.unidades, montaje: m.tipo || '—',
    vano_declarado: m.pitch ?? null, sep_medida: separacionMedida(n),
    escalon: '', veredicto: '', falta: '', detalle: '',
  };
  if (m.tipo && m.tipo !== 'SingleAxisTrackerMount') {
    fila.escalon = 'NO APLICA';
    fila.falta = 'nada: montaje ' + m.tipo + ', sin seguimiento no hay backtracking que corregir';
    if (hay(n + '_relieve.json')) fila.detalle = 'tiene relieve propio (curvas de nivel), pero no le sirve a esto';
  } else if (hay(n + '_cotas.json')) {
    const r = correPuerta(n);
    const v = (r.salida.match(/VEREDICTO: (.+)/) || [])[1];
    fila.escalon = 'EVALUADA';
    fila.veredicto = v ? v.trim() : ('sin veredicto (código ' + r.codigo + ')');
    const cob = (r.salida.match(/(\d+)\/(\d+) seguidores con cota \(([\d.]+) %\)/) || []);
    if (cob.length) fila.detalle = 'cobertura ' + cob[3] + ' %';
  } else if (hay(n + '_asbuilt.json')) {
    fila.escalon = 'SIN CASAR';
    fila.falta = 'pasar tools/cotas_asbuilt.py ' + n;
  } else {
    fila.escalon = 'SIN LEVANTAMIENTO';
    fila.falta = 'levantamiento as-built de apoyos (cota por extremo de fila)';
    if (hay(n + '_relieve.json')) fila.detalle = 'hay malla de relieve, pero no cotas de seguidor';
  }
  filas.push(fila);
}

const anchoV = Math.max(...filas.map(f => (f.veredicto || f.escalon).length));
console.log('PUERTA DE RELIEVE · CARTERA ENTERA (' + filas.length + ' plantas del índice)');
console.log('');
console.log('  ' + 'planta'.padEnd(12) + 'uds'.padStart(6) + '  ' + 'montaje'.padEnd(24) +
  'vano'.padStart(7) + 'sep.med'.padStart(9) + '  ' + 'estado'.padEnd(anchoV + 2) + 'detalle');
for (const f of filas) {
  console.log('  ' + f.planta.padEnd(12) + String(f.unidades).padStart(6) + '  ' +
    f.montaje.padEnd(24) +
    (f.vano_declarado == null ? '—' : String(f.vano_declarado)).padStart(7) +
    (f.sep_medida == null ? '—' : f.sep_medida.toFixed(2)).padStart(9) + '  ' +
    (f.veredicto || f.escalon).padEnd(anchoV + 2) + (f.detalle || ''));
}

const porEscalon = {};
for (const f of filas) (porEscalon[f.escalon] ||= []).push(f.planta);
console.log('');
for (const [e, ps] of Object.entries(porEscalon))
  console.log('  ' + e.padEnd(19) + ps.length + ' · ' + ps.join(', '));

const pedir = filas.filter(f => f.escalon === 'SIN LEVANTAMIENTO');
if (pedir.length) {
  console.log('');
  console.log('  LO QUE HAY QUE PEDIR, y a quién le vale la pena:');
  console.log('    ' + pedir.reduce((a, f) => a + f.unidades, 0) + ' seguidores en ' + pedir.length +
    ' plantas sin una sola cota. Ordenadas por tamaño, que es por donde empieza a pagar:');
  for (const f of [...pedir].sort((a, b) => b.unidades - a.unidades))
    console.log('      ' + f.planta.padEnd(12) + String(f.unidades).padStart(6) + ' seguidores');
}

const sinVano = filas.filter(f => f.vano_declarado == null && f.montaje === 'SingleAxisTrackerMount');
if (sinVano.length) {
  console.log('');
  console.log('  ADEMÁS, SIN VANO DECLARADO (' + sinVano.length + '): ' + sinVano.map(f => f.planta).join(', '));
  console.log('    El vano es la base de la geometría de backtracking: sin él no hay gcr real ni');
  console.log('    sombra que calcular. La separación medida está en la tabla, pero NO es el vano');
  console.log('    directamente — en Ayora y San José, las dos que conocemos, sale el DOBLE porque');
  console.log('    el seguidor del layout es una bifila. Cuál es bifila y cuál no es dato del');
  console.log('    proyecto: se confirma, no se adivina.');
}

if (CSV) {
  const cab = ['planta', 'unidades', 'montaje', 'vano_declarado', 'separacion_medida_m', 'estado', 'veredicto', 'falta', 'detalle'];
  const esc = v => (v == null ? '' : String(v).includes(';') ? '"' + v + '"' : String(v));
  const txt = '﻿' + cab.join(';') + '\n' + filas.map(f => [f.planta, f.unidades, f.montaje,
    f.vano_declarado, f.sep_medida == null ? '' : f.sep_medida.toFixed(2).replace('.', ','),
    f.escalon, f.veredicto, f.falta, f.detalle].map(esc).join(';')).join('\n') + '\n';
  fs.writeFileSync(CSV, txt);
  console.log('\n  -> ' + CSV);
}
