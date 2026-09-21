/* Arma el ZIP de «Medir en planta» tal como lo arma la página, sin navegador.
 *
 * POR QUE EXISTE. Los bancos de campo corrían el `.ps1` DEL REPO, y el técnico
 * no usa ese: usa el que sale de este ZIP. Entre uno y otro hay transformaciones
 * —el BOM, la sustitución del CONFIG, los fines de línea— y todo eso quedaba
 * fuera de la prueba. Y no es hipotético: el BOM se perdía por el camino
 * (`Response.text()` lo quita al decodificar, `TextEncoder` no lo escribe), así
 * que `zigbee_inventario.ps1` seguía sin compilar en PowerShell 5.1 aunque el
 * fichero del repo estuviera arreglado.
 *
 * Se extrae el MISMO bloque de index.html que usa la página —`preparaColector`,
 * `zipStore`, `leemeDe`— como hacen los demás bancos de este repo. No se
 * reimplementa nada: si la página cambia, esto cambia con ella.
 *
 *   node tools/paquete_planta.mjs <planta> <salida.zip>
 *   node tools/paquete_planta.mjs elburgo /tmp/medir.zip
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [planta, salida] = process.argv.slice(2);
if (!planta || !salida) {
  console.error('uso: node tools/paquete_planta.mjs <planta> <salida.zip>');
  process.exit(2);
}

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const i0 = html.indexOf('/* PAQUETE-INI');
const i1 = html.indexOf('/* PAQUETE-FIN');
if (i0 < 0 || i1 < 0) { console.error('no encuentro PAQUETE-INI / PAQUETE-FIN en index.html'); process.exit(2); }
const F = new Function(html.slice(i0, html.indexOf('*/', i1) + 2) +
  ';return {zipStore,paqueteDeManifiesto,gwsDe,preparaColector,leemeDe};')();

const man = path.join(RAIZ, 'cobertura_coords', planta, 'manifiesto_' + planta + '.json');
if (!fs.existsSync(man)) { console.error('no hay manifiesto para «' + planta + '»: ' + man); process.exit(2); }
const paq = F.paqueteDeManifiesto(JSON.parse(fs.readFileSync(man, 'utf8')));
if (!paq) { console.error('el manifiesto de «' + planta + '» no trae ámbitos'); process.exit(2); }
const gws = F.gwsDe(paq);

/* EL MISMO CAMINO QUE EL BOTON, paso por paso. `Response.text()` decodifica
   UTF-8 y de paso quita el BOM; aquí se hace igual, con TextDecoder, para que
   lo que entre en `preparaColector` sea exactamente lo que le entra en la
   página. Leerlo con fs 'utf8' NO valdría: eso conserva el BOM y taparía el
   fallo, que es justo lo que pasó. */
const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();
const partes = [];
for (const f of paq.colectores) {
  const ruta = path.join(RAIZ, f);
  if (!fs.existsSync(ruta)) { console.error('falta el recolector ' + f); process.exit(2); }
  partes.push({ nombre: paq.planta + '/' + f,
                datos: enc.encode(F.preparaColector(f, dec.decode(fs.readFileSync(ruta)), gws)) });
}
const base = path.join(RAIZ, 'cobertura_coords', planta);
for (const f of paq.ficheros) {
  const ruta = path.join(base, f);
  if (!fs.existsSync(ruta)) { console.error('falta ' + f + ' en ' + base); process.exit(2); }
  partes.push({ nombre: paq.planta + '/' + f, datos: new Uint8Array(fs.readFileSync(ruta)) });
}
partes.unshift({ nombre: paq.planta + '/LEEME.txt', datos: enc.encode(F.leemeDe(paq)) });

fs.writeFileSync(salida, Buffer.from(F.zipStore(partes, new Date(Date.UTC(2026, 0, 1)))));
console.log(partes.length + ' ficheros -> ' + salida);
console.log('recolectores: ' + paq.colectores.join(', '));
console.log('gateways: ' + (gws.length ? gws.map(g => g.ipGw).join(', ') : '(sin IP: lleva el marcador)'));
