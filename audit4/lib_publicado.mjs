/* R4 · LO QUE EL SIMULADOR PUBLICA HOY — separado del verificador a propósito.
 *
 * Este módulo SÍ carga el simulador: su trabajo es producir los θ que la
 * página publica, para dárselos como DATOS a un verificador que no lo carga.
 * Arma el terreno EXACTAMENTE como `terrain(c)` con planta real
 * (`backtracking.html:4655-4676`), con los valores por defecto de la página:
 *   tcucfg = levantamiento (la TCU conoce las cotas ⇒ Tcfg === T)
 *   nb = 2 (configurado a mano: ninguna ficha lo trae) · IAM 0,05
 *   θmáx = el de la planta · z0 = 0,17 · azimut de eje 0
 * La banda es la que indexa el encargo: bloque 0 ENTERO,
 * `plantFromCotas(datos, 500, 0)`. La página, por defecto, carga otra
 * (`plantFromCotas(data, 80, …)`: 79 líneas de ese mismo bloque). */
import fs from 'node:fs';
import path from 'node:path';

export function cargaSimulador(ROOT) {
  const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
  const i0 = html.indexOf('FÍSICA PURA'), i1 = html.lastIndexOf('/* FIN-FÍSICA');
  const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n'
            + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
  const VER = /const VER='([^']+)'/.exec(html)[1];
  const F = new Function(sol + '\n' + html.slice(html.lastIndexOf('/*', i0), i1) + `return {
    plantFromCotas, policyAngles, policyAnglesSeg, anglesAstro, solarPos, clearskyIneichen, doyOf };`)();
  return { F, VER };
}

export function terrenoComoLaPagina(F, datos, maxLines, bloque) {
  const P = F.plantFromCotas(datos, maxLines, bloque);
  const pairs = [];
  for (let i = 0; i < P.lineX.length - 1; i++) {
    const dx = Math.max(0.5, P.lineX[i + 1] - P.lineX[i]);
    const dz = (P.pairDz ? P.pairDz[i] : 0);                       // ELEV = P.elev ⇒ delta del editor 0
    pairs.push({ slope: Math.atan2(dz, dx) * 180 / Math.PI, pitch: dx, axisTilt: (P.tilt[i] + P.tilt[i + 1]) / 2 });
  }
  const c = { cw: P.cw, pitch: +P.pitch.toFixed(2), maxang: P.maxAngle, z0: 0.17, nbp: 2, iam: 0.05, drive: P.drive, mods: 28 };
  const groups = c.drive === 'mono' ? null : P.groups;
  const T = { pairs, cw: c.cw, axisAz: 0, maxAngle: c.maxang, gcr: c.cw / c.pitch, z0: c.z0, nBypass: c.nbp, iam: c.iam,
              rowTilt: P.tilt, groups, drive: c.drive, lineX: P.lineX,
              segs: P.segs, segTilt: P.segTilt, segPairs: P.segPairs, segDrive: P.segDrive,
              segZ: P.segZ, segSide: P.segSide, segMorro: P.segMorro,
              filaLen: 2 * c.mods * 1.146 + 0.55, real: P };
  return { P, T, c };
}
