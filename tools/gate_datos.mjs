/* EL GATE DEL DATO: un comando que corre todos los careos y todos los invariantes.

   Hay ya seis bancos que comprueban que los layouts, la toolbox del SCADA y los CSV de cobertura
   dicen lo mismo. El problema es que hay que acordarse de los seis. `release_gate.mjs` no vale: ése
   es del simulador de backtracking, otra cosa. Quien toque un layout no se entera de que ha roto un
   careo hasta que alguien lo corre a mano, y eso es tanto como no tenerlo.

       node tools/gate_datos.mjs                 todo
       node tools/gate_datos.mjs --rapido        salta lo que necesita el repo del SCADA al lado

   Corre TODOS los pasos aunque uno falle —interesa el parte entero, no el primer tropiezo— y sale
   con 1 si alguno ha fallado.

   ── LOS INVARIANTES DEL DATO ──────────────────────────────────────────────────────────────────

   Además de los bancos, aquí van las reglas que no vive nadie más y que solo se ven mirando los once
   layouts a la vez:

     · un `gw` sin `ncu` no significa nada: el gateway es DE una NCU.
     · un `esclavo` sin `gw` tampoco: la dirección Modbus es dentro de un gateway.
     · todo lo escrito lleva su procedencia. Un `ncu` a secas se lee como medido, y en cuatro plantas
       está derivado por cercanía: sin `ncu_origen` esa distinción se pierde.
     · Dicayagua guarda sus 5.493 mesas EN DOS ARRAYS: `trackers` con la malla (ncu, gw) y `fijas`
       con la geometría (dimensiones, inclinación). Son las MISMAS mesas, emparejadas por índice.
       No es un duplicado que quitar —cada vista tiene lo suyo— pero es una trampa: sumar los dos
       arrays cuenta 10.986, y leer solo `trackers` deja las mesas sin geometría. Ya nos pilló dos
       veces. Aquí se comprueba que siguen emparejadas, porque el día que alguien edite una y no la
       otra, nadie lo vería.                                                                       */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RAIZ = new URL('..', import.meta.url).pathname;
const RAPIDO = process.argv.includes('--rapido');
/* Relativos a proposito: habia dos rutas absolutas de un contenedor concreto
   delante, redundantes con los relativos, y que hacian que esto encontrara el
   SCADA SIEMPRE en local y NUNCA en CI sin que la diferencia se notara. */
const SCADA = [
  new URL('../../SCADA/', import.meta.url).pathname, new URL('../../scada/', import.meta.url).pathname]
  .find(p => { try { return existsSync(p + 'tools'); } catch (e) { return false; } });

let malo = 0, sinComprobar = 0;
/* TRES ESTADOS, no dos. `paso()` daba FALLA a cualquier rc distinto de 0, o sea
   que confundia «se ha roto» con «no he podido comprobarlo» — el error
   contrario al que acabamos de arreglar, pero la misma confusion. La
   convencion es la de #738: 1 = fallo, 2 = no comprobado. Un rc = 2 NO cuenta
   como fallo (un hermano ausente no es un hallazgo) pero TAMPOCO como ok, y
   sale en el recuento del final. */
const paso = (nombre, cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd: cwd || RAIZ, encoding: 'utf8' });
  const est = r.status === 0 ? 'ok   ' : (r.status === 2 ? '··   ' : 'FALLA');
  if (r.status === 2) sinComprobar++; else if (r.status !== 0) malo++;
  const cola = String(r.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || String(r.stderr || '').trim().split('\n').slice(-1)[0] || '';
  console.log(`  ${est} ${nombre.padEnd(34)} ${r.status === 2 ? 'NO COMPROBADO · ' : ''}${cola.slice(0, 80)}`);
  return r;
};

console.log('· los bancos\n');
paso('la regla, contra fuentes externas', process.execPath, [RAIZ + 'tools/meteo_ncu.mjs', '--calibra']);
paso('layout contra los CSV de cobertura', process.execPath, [RAIZ + 'tools/test_meteo_csv.mjs']);
paso('la tubería del gateway (hsus_gw)', process.execPath, [RAIZ + 'tools/test_hsus_gw.mjs']);
paso('los repetidores contra el CONTRATO', process.execPath, [RAIZ + 'tools/reps_ncu.mjs']);
if (SCADA && !RAPIDO) {
  paso('plants.yml contra el DWG', 'python3', [SCADA + 'tools/test_plants_yml.py'], SCADA);
  paso('las dos columnas RSU de la hoja', 'python3', [SCADA + 'tools/tcu-toolbox/test_columnas_rsu.py'], SCADA);
} else console.log(`  ··    ${'los dos del SCADA'.padEnd(34)} ${SCADA ? 'saltados (--rapido)' : 'no encuentro el repo del SCADA al lado'}`);

/* ── los invariantes ──────────────────────────────────────────────────────────────────────────*/
console.log('\n· los invariantes del dato\n');
const di = (ok, txt) => { if (!ok) malo++; console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${txt}`); };
const roto = { gwSinNcu: [], escSinGw: [], sinOrigen: [] };

for (const f of readdirSync(RAIZ).filter(x => /_layout\.json$/.test(x)).sort()) {
  const n = f.replace('_layout.json', '');
  const L = JSON.parse(readFileSync(RAIZ + f, 'utf8'));
  for (const [clave, quien] of [['meteo', 'HSU'], ['reps', 'REP']]) {
    for (const o of L[clave] || []) {
      const donde = `${n} ${quien} ${o.name || o.nombre || '?'}`;
      if (o.gw != null && o.ncu == null) roto.gwSinNcu.push(donde);
      if (o.esclavo != null && o.gw == null) roto.escSinGw.push(donde);
      if (o.ncu != null && !o.ncu_origen && !o.origen) roto.sinOrigen.push(donde);
    }
  }
  if (n === 'dicayagua') {
    const T = L.trackers || [], F = L.fijas || [];
    di(T.length === F.length, `dicayagua: las dos vistas de sus mesas tienen el mismo número (${T.length} y ${F.length})`);
    let mal = 0, peor = 0;
    for (let i = 0; i < Math.min(T.length, F.length); i++) {
      const d = Math.hypot(T[i].x - F[i].x, T[i].n - F[i].n);
      if (d > 0.001) mal++;
      if (d > peor) peor = d;
    }
    di(mal === 0, `dicayagua: siguen emparejadas por índice (${mal} descuadradas, la peor a ${peor.toFixed(3)} m)`);
  }
}
di(!roto.gwSinNcu.length, `ningún gateway sin su NCU${roto.gwSinNcu.length ? ': ' + roto.gwSinNcu.slice(0, 4).join('; ') : ''}`);
di(!roto.escSinGw.length, `ningún esclavo Modbus sin su gateway${roto.escSinGw.length ? ': ' + roto.escSinGw.slice(0, 4).join('; ') : ''}`);
di(!roto.sinOrigen.length, `todo lo escrito lleva su procedencia${roto.sinOrigen.length ? ': ' + roto.sinOrigen.slice(0, 4).join('; ') : ''}`);

/* ── y la foto, que no falla nunca pero conviene ver ──────────────────────────────────────────*/
console.log('\n· el inventario (informativo, no falla)\n');
const inv = spawnSync(process.execPath, [RAIZ + 'tools/estado_datos.mjs', '--pendientes'], { encoding: 'utf8' });
console.log('  ' + String(inv.stdout || '').trim().split('\n')[0]);

console.log(`\n${malo ? malo + ' paso(s) en rojo'
  : sinComprobar ? `los invariantes cuadran, PERO ${sinComprobar} paso(s) NO SE HAN COMPROBADO`
  : 'el dato cuadra: bancos y invariantes, todo en verde'}`);
if (sinComprobar && !malo) console.log('Un «no comprobado» no es un verde entero.');
/* 1 = algo esta roto · 2 = algo no se ha podido comprobar · 0 = todo medido */
process.exit(malo ? 1 : sinComprobar ? 2 : 0);
