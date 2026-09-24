/* LAS RUTAS ANUALES DE LA PÁGINA, EJECUTADAS TAL CUAL — no reescritas.
 *
 * El rastro no es la cosa: una reimplementación del anual en un script mediría
 * el script. Aquí se CORTA de `backtracking.html` el código que corre en la
 * página y se ejecuta en Node con su física:
 *   · el bucle del botón del año: desde `const PASO_ANUAL_MIN=10;` hasta
 *     `const ref=tot['pairwise']` (lo mismo que corta tools/test_anual_lazo.mjs);
 *   · el generador del informe `function* grAnualGen(){…}` entero;
 *   · lo que usan fuera de la física: `segOn`, `POL_POR_MESA` y `segCmd`.
 * Lo que es interfaz se inyecta: `c` (la configuración), `T` y `Tcfg`, la lista
 * `POLICIES` (con `on`), `grDiferida` (las caras, que el informe difiere) y
 * `cloudCC` (el deslizador de nubes; en la página vale 0 por defecto).
 */
import fs from 'node:fs';
import path from 'node:path';

function cuerpo(src, cabecera) {
  const i = src.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro «' + cabecera + '» en la página');
  let n = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en «' + cabecera + '»');
}
function linea(src, cabecera) {
  const i = src.indexOf(cabecera);
  if (i < 0) throw new Error('no encuentro «' + cabecera + '» en la página');
  return src.slice(i, src.indexOf('\n', i));
}

export function rutasAnuales(ROOT, html) {
  const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
  const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA');
  const fisica = html.slice(html.lastIndexOf('/*', i0), i1);
  const a0 = html.indexOf('const PASO_ANUAL_MIN=10;'), a1 = html.indexOf("const ref=tot['pairwise']");
  if (a0 < 0 || a1 <= a0) throw new Error('no encuentro el bucle anual del botón');
  const boton = html.slice(a0, a1);
  const gr = cuerpo(html, 'function* grAnualGen(');
  const fuera = [cuerpo(html, 'function segOn('), linea(html, 'const POL_POR_MESA='), cuerpo(html, 'function segCmd(')].join('\n');
  const VER = /const VER='([^']+)'/.exec(html)[1];
  const F = new Function(sol + '\n' + fisica + '\n' + fuera + `
    return {
      boton(c, T, Tcfg, POLICIES, year, days, DIM) {
        const tot = {}; for (const P of POLICIES) if (P.on) tot[P.key] = 0;
        ${boton}
        return tot;
      },
      informe(DAY, POLICIES, grDiferida, cloudCC) {
        const GR = {}; const grFirma = () => 'arnés';
        ${gr}
        for (const _ of grAnualGen());
        return GR.anual;
      },
      segOn, segCmd, POL_POR_MESA, VER: ${JSON.stringify(VER)}
    };`)();
  return { F, fuentes: { boton: boton.length, informe: gr.length, fuera: fuera.length } };
}
