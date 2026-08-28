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
  ';return {crc32,zipStore,dosFecha,paqueteDeManifiesto,gwsDe,preparaLogger,preparaRutas,preparaInventario,preparaColector,leemeDe,COLECTORES};')();

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
/* EL INVENTARIO TAMBIÉN LLEVA LA IP PUESTA. Lee por HTTP/RCI como el logger, y
   si sale con la IP de ejemplo el que está en la planta inventaría el gateway de
   El Burgo desde Ayora — o nada. Es el mismo error caro de siempre. */
const INV = fs.readFileSync(path.join(RAIZ, 'zigbee_inventario.ps1'), 'utf8');
const invListo = F.preparaColector('zigbee_inventario.ps1', INV, gws);
check('el inventario sale con los gateways de la planta escritos',
      /Host = "10\.100\.1\.53"/.test(invListo) && /Host = "10\.100\.1\.57"/.test(invListo),
      (invListo.match(/Host = "[^"]*"/g)||[]).slice(0,3).join(' '));
check('y no se queda la IP de ejemplo del fichero',
      !/^\s*@\{ Name = "GW-01"; Host = "10\.100\.1\.54"/m.test(invListo));
check('el despachador manda cada recolector a su preparador',
      F.preparaColector('zigbee_logger.ps1', LOGGER, gws) === F.preparaLogger(LOGGER, gws) &&
      F.preparaColector('zigbee_routes_logger.ps1', RUTAS, gws) === F.preparaRutas(RUTAS, gws));
check('y uno que no conozca lo deja TAL CUAL, sin inventarle una IP',
      F.preparaColector('otro.ps1', LOGGER, gws) === LOGGER);
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
check('el paquete lleva los cuatro recolectores y el cruce', JSON.stringify(paq.colectores) ===
      JSON.stringify(['zigbee_logger.ps1','zigbee_routes_logger.ps1','zigbee_inventario.ps1',
                      'zigbee_angulos.ps1','rellena_barrido.ps1']),
      JSON.stringify(paq.colectores));
/* TODO LO DEL ZIP TIENE QUE PODER CORRERSE ALLI. En el PC de la planta hay
   PowerShell y no hay Python: un paso del léeme que pida `python3` es un paso
   que no se puede dar, y el que está allí no lo puede arreglar. */
check('todo lo que se copia allí es PowerShell',
      paq.colectores.every(f => f.endsWith('.ps1')), paq.colectores.join(','));
/* EL DE ÁNGULOS VA AL REVÉS QUE LOS OTROS TRES: lee el registro 30111 del MODBUS
   de la NCU (503/504), no del ConnectPort. Escribirle la del gateway sería el
   mismo error caro de siempre, del otro lado. */
const ANG = fs.readFileSync(path.join(RAIZ, 'zigbee_angulos.ps1'), 'utf8');
const angListo = F.preparaColector('zigbee_angulos.ps1', ANG, gws);
check('el de ángulos sale con la IP del MODBUS de la NCU, no con la del gateway',
      /Host = "10\.100\.1\.52"; Port = 503/.test(angListo) &&
      !/Host = "10\.100\.1\.53"/.test(angListo),
      (angListo.match(/Host = "[^"]*"; Port = \d+/g)||[]).slice(0,3).join(' '));
check('y con los dos puertos, uno por gateway',
      /Port = 503/.test(angListo) && /Port = 504/.test(angListo));
/* y el de siempre sigue yendo al gateway: son direcciones distintas y no se
   pueden cruzar */
check('mientras el logger sigue apuntando al ConnectPort',
      /Host = "10\.100\.1\.53"/.test(F.preparaColector('zigbee_logger.ps1', LOGGER, gws)));
/* LA HOJA DE BARRIDO. Es la única medida que CALIBRA: los recolectores solo ven
   los enlaces que la malla eligió —los que van bien—, y con esa muestra el ajuste
   sale de r = +0,16. Si no viaja en el ZIP, el que va a la planta no la lleva, y
   volver es otro viaje. */
check('y la hoja de barrido, que es lo único que calibra',
      paq.ficheros.includes('barrido_elburgo_NCU02.csv'),
      paq.ficheros.filter(f=>f.startsWith('barrido')).join(','));
check('la declara el manifiesto, no una lista escrita a mano aquí',
      Array.isArray(MAN_BURGO.barridos) && MAN_BURGO.barridos.length > 0, MAN_BURGO.barridos);
/* y una planta sin hoja no se rompe: se lleva lo demás */
const sinB = F.paqueteDeManifiesto({...MAN_BURGO, barridos: undefined});
check('una planta sin barrido sigue armando su paquete',
      sinB.ficheros.length > 0 && !sinB.ficheros.some(f=>f.startsWith('barrido')),
      sinB.ficheros.length);
check('y las coordenadas de todos sus ámbitos, con el manifiesto',
      paq.ficheros.includes('coords_elburgo_NCU01_GW1.csv') &&
      paq.ficheros.includes('ncus_elburgo.csv') &&
      paq.ficheros.includes('manifiesto_elburgo.json'), paq.ficheros.length + ' ficheros');
const leeme = F.leemeDe(paq);
check('el léeme empieza por lo que se teclea en el PC de planta',
      /ExecutionPolicy Bypass -File \.\\zigbee_logger\.ps1/.test(leeme));
check('y dice cómo lanzar el inventario',
      /ExecutionPolicy Bypass -File \.\\zigbee_inventario\.ps1/.test(leeme));
check('y el de ángulos, con su aviso de que va al Modbus y no al gateway',
      /ExecutionPolicy Bypass -File \.\\zigbee_angulos\.ps1/.test(leeme) &&
      /MODBUS de la NCU \(503\/504\), no contra el gateway/.test(leeme));
check('el léeme manda cruzar los ángulos, no apuntarlos a mano',
      /rellena_barrido\.ps1/.test(leeme) && /EL ANGULO NO SE APUNTA A MANO/.test(leeme));
/* y ningún paso del léeme puede pedir Python, porque allí no lo hay. El
   `adaptador_*.py` del final es lo único que se hace de vuelta, no en la planta. */
const enPlanta = leeme.slice(0, leeme.indexOf('AL VOLVER'));
check('ningún paso EN LA PLANTA pide python3',
      !/python3?\s/i.test(enPlanta),
      (enPlanta.match(/.*python.*/gi)||[]).join(' | '));
check('y avisa de que lo que no case en el tiempo se deja vacío',
      /se deja VACIO/.test(leeme) && /angulo inventado/.test(leeme));
/* El número de serie de un XBee ES su dirección de 64 bits. Decirlo evita que
   alguien se ponga a buscar otro número por las cajas. */
check('explica que el nº de serie es la dirección de 64 bits de la etiqueta',
      /NUMERO DE SERIE/.test(leeme) && /64 bits/.test(leeme) && /etiqueta/.test(leeme));
check('y que hay que mandar también el volcado en bruto',
      /zigbee_inventario_crudo\.xml/.test(leeme) && /MANDA LOS DOS/.test(leeme));
check('el léeme explica el barrido y por qué los recolectores no bastan',
      /barrido_elburgo_NCU02\.csv/.test(leeme) && /r = \+0,16/.test(leeme) &&
      /LOS CEROS SON LA MITAD/.test(leeme));
check('y dice qué dos columnas se rellenan a mano',
      /`llega`/.test(leeme) && /`beta_grados`/.test(leeme));
check('que la malla cambia y hay que dejarlo días',
      /DEJALOS DIAS, no horas/.test(leeme));
const leemeSinB = F.leemeDe(sinB);
check('sin hoja de barrido, el léeme no habla de un fichero que no está',
      !/barrido/i.test(leemeSinB) && /AL VOLVER/.test(leemeSinB));
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
