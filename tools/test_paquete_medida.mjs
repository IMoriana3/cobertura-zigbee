/* El botón «Medir en planta» de la página de cobertura, sin navegador.
 *
 * Arma el ZIP que se copia en el PC de la planta: los dos recolectores, las
 * coordenadas de todos los ámbitos, el manifiesto y un léeme. Si el ZIP sale mal
 * o la IP va equivocada, quien lo descubre es el que está allí con el portátil.
 *
 * Se extrae el bloque del HTML y se corre en Node, como el resto de bancos de
 * este repo, y el ZIP se abre con el `unzip` del sistema: que lo lea OTRO
 * programa es la única prueba que vale.
 *
 *   node tools/test_paquete_medida.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const i0 = html.indexOf('/* PAQUETE-INI');
const i1 = html.indexOf('/* PAQUETE-FIN');
if (i0 < 0 || i1 < 0) { console.error('no encuentro PAQUETE-INI / PAQUETE-FIN'); process.exit(1); }
const F = new Function(html.slice(i0, html.indexOf('*/', i1) + 2) +
  ';return {crc32,zipStore,dosFecha,paqueteDeManifiesto,gwsDe,preparaLogger,preparaRutas,leemeDe,COLECTORES};')();

check('el CRC32 da el valor canónico de "123456789"',
      F.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926,
      '0x' + F.crc32(new TextEncoder().encode('123456789')).toString(16));

/* ---- LOS DOS APARATOS. Es donde casi me la pego: el manifiesto trae el MODBUS
   de la NCU (503/504) y el recolector habla con el gateway DIGI, que tiene su
   propia IP. En El Burgo las NCU están en .52 y .56 y los gateways en .53, .54,
   .57 y .58 — dato de campo. Escribir la del Modbus en el .ps1 mandaría al de
   planta a medir contra el sitio equivocado. ---- */
const MAN_BURGO = JSON.parse(fs.readFileSync(
  path.join(RAIZ, 'cobertura_coords', 'elburgo', 'manifiesto_elburgo.json'), 'utf8'));
const paq = F.paqueteDeManifiesto(MAN_BURGO);
const gws = F.gwsDe(paq);
check('El Burgo: los gateways DIGI son .53, .54, .57 y .58',
      JSON.stringify(gws.map(g => g.ipGw)) ===
      JSON.stringify(['10.100.1.53','10.100.1.54','10.100.1.57','10.100.1.58']),
      JSON.stringify(gws.map(g => g.ipGw)));
check('y NO son las del Modbus de sus NCU (.52 y .56), que es otra cosa',
      gws.every(g => g.ipGw !== g.ipNcu) &&
      JSON.stringify([...new Set(gws.map(g => g.ipNcu))]) === JSON.stringify(['10.100.1.52','10.100.1.56']),
      JSON.stringify(gws.map(g => g.ipNcu + '->' + g.ipGw)));
check('con su puerto Modbus, uno por gateway (503 y 504)',
      JSON.stringify(gws.map(g => g.puerto)) === JSON.stringify([503,504,503,504]),
      JSON.stringify(gws.map(g => g.puerto)));

const LOGGER = fs.readFileSync(path.join(RAIZ, 'zigbee_logger.ps1'), 'utf8');
const listo = F.preparaLogger(LOGGER, gws);
check('el recolector sale con los cuatro gateways puestos',
      ['53','54','57','58'].every(o => listo.includes('Host = "10.100.1.' + o + '"')),
      listo.split('\n').filter(l => /Host =/.test(l) && !/^#/.test(l)).length + ' hosts');
check('y guarda debajo la línea que traía, para poder deshacerlo',
      /# --- lo que traia el fichero antes de prepararlo ---/.test(listo) &&
      /#\s+@\{ Name = "GW-01"; Host = "10\.100\.1\.54"/.test(listo));
/* DE DÓNDE SALE LA IP, dicho en el propio fichero. Hoy se DERIVA (la hoja
   «Direcciones IP» trae la columna buena y el toolbox aún no la exporta); cuando
   la exporte, la misma comprobación tiene que ver «DECLARADOS». Las dos ramas se
   prueban, porque la segunda entra sola el día que se rehaga la pasada. */
check('el recolector dice que la IP está DERIVADA, y que hay que comprobarla',
      /DERIVADOS/.test(listo) && /[Ee]s una REGLA, no un dato/.test(listo) && /COMPRUEBALO/.test(listo),
      listo.split('\n').slice(12,15).join(' | '));
{
  const conIp = gws.map(g => ({ ...g, ip_gw: '10.9.9.' + g.gw, declarada: true }));
  const dec = F.preparaLogger(LOGGER, conIp);
  check('y cuando la hoja la declare, lo dirá y usará ESA, no la derivada',
        /DECLARADOS en la hoja/.test(dec) && !/DERIVADOS/.test(dec), dec.split('\n')[12]);
}
{
  /* La preferencia, en el sitio donde se decide: si el manifiesto trae `ip_gw`,
     manda el dato y no la regla. */
  const man = JSON.parse(JSON.stringify(MAN_BURGO));
  man.ambitos.filter(a => a.ip).forEach(a => { a.ip_gw = '10.9.9.' + a.gw; });
  const g2 = F.gwsDe(F.paqueteDeManifiesto(man));
  check('con `ip_gw` en el manifiesto, manda el dato y no la regla',
        g2.every(g => g.declarada) && g2[0].ipGw === '10.9.9.1',
        g2.map(g => g.ipGw).join(' '));
}
const RUTAS = fs.readFileSync(path.join(RAIZ, 'zigbee_routes_logger.ps1'), 'utf8');
check('el de rutas apunta al primer gateway', /\$GwHost\s*=\s*"10\.100\.1\.53"/.test(F.preparaRutas(RUTAS, gws)));
/* Sin IP declarada NO se toca: mejor el original con su «edita esto» que uno con
   una IP inventada. */
check('sin gateways declarados, los recolectores se dejan INTACTOS',
      F.preparaLogger(LOGGER, []) === LOGGER && F.preparaRutas(RUTAS, []) === RUTAS);

/* ---- AYORA: un gateway por NCU. Es el caso que se perdía: el ámbito de gateway
   solo se emitía con MÁS de uno, así que sus 16 IP se leían del toolbox y se
   tiraban. Ahora la IP va también en el ámbito de NCU. ---- */
const MAN_AYORA = JSON.parse(fs.readFileSync(
  path.join(RAIZ, 'cobertura_coords', 'ayora', 'manifiesto_ayora.json'), 'utf8'));
const gwsA = F.gwsDe(F.paqueteDeManifiesto(MAN_AYORA));
check('Ayora trae sus 16 NCU con IP, aunque cada una tenga un solo gateway',
      gwsA.length === 16 && gwsA[0].ipNcu === '192.168.4.10', gwsA.length + ' con IP');
check('y su gateway se deriva igual que en El Burgo (NCU + nº de GW)',
      gwsA[0].ipGw === '192.168.4.11' && gwsA[1].ipGw === '192.168.4.21',
      gwsA.slice(0,2).map(g=>g.ipNcu+'->'+g.ipGw).join(' '));

/* ---- el paquete y el léeme ---- */
check('el paquete lleva los dos recolectores', JSON.stringify(paq.colectores) ===
      JSON.stringify(['zigbee_logger.ps1','zigbee_routes_logger.ps1']));
check('y las coordenadas de todos sus ámbitos, con el manifiesto',
      paq.ficheros.includes('coords_elburgo_NCU01_GW1.csv') &&
      paq.ficheros.includes('ncus_elburgo.csv') &&
      paq.ficheros.includes('manifiesto_elburgo.json'), paq.ficheros.length + ' ficheros');
const leeme = F.leemeDe(paq);
check('el léeme empieza por lo que se teclea en el PC de planta',
      /ExecutionPolicy Bypass -File \.\\zigbee_logger\.ps1/.test(leeme));
check('separa las DOS direcciones: la del gateway y la del Modbus de la NCU',
      /10\.100\.1\.53   \(su NCU esta en 10\.100\.1\.52\)/.test(leeme) &&
      /NO es la dirección del recolector/.test(leeme),
      leeme.split('\n').find(l => /10\.100\.1\.53/.test(l)));
check('y dice qué hacer al volver', /adaptador_elburgo\.py/.test(leeme) && /elburgo_real/.test(leeme));

/* ---- el ZIP, abierto por otro programa ---- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paq-'));
const fzip = path.join(dir, 'medir.zip');
fs.writeFileSync(fzip, Buffer.from(F.zipStore([
  { nombre: 'elburgo/LEEME.txt', datos: leeme },
  { nombre: 'elburgo/zigbee_logger.ps1', datos: listo },
  { nombre: 'elburgo/coords.csv', datos: 'node_id,lat,lon\nTCU_1,41.5,-0.8\n' },
], new Date(Date.UTC(2026, 8, 3, 9, 30, 0)))));
const corre = (a) => { try { return { out: execFileSync('unzip', a, { encoding:'utf8', stdio:['ignore','pipe','pipe'] }), err:'' }; }
                       catch (e) { return { out: String(e.stdout||''), err: String(e.stderr||e.message) }; } };
const t = corre(['-t', fzip]);
/* Hay que mirar TAMBIÉN el stderr: con el directorio central mal, `unzip -t`
   avisa por ahí y sigue diciendo que no hay errores. */
check('`unzip` da el ZIP por bueno', /No errors detected/.test(t.out) && !t.err.trim(),
      (t.err || t.out).trim().split('\n').pop());
check('y el recolector sale del ZIP intacto',
      corre(['-p', fzip, 'elburgo/zigbee_logger.ps1']).out === listo);
const vac = path.join(dir, 'v.zip');
fs.writeFileSync(vac, Buffer.from(F.zipStore([], new Date(Date.UTC(2026,0,1)))));
const v = corre(['-t', vac]);
check('un paquete vacío sigue siendo un ZIP válido', /empty|No errors/i.test(v.out + v.err));

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
