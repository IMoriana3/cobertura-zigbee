/* R5 · FASE A.2 — EL CONTADOR SIN PODA, para carearlo contra sí mismo.
 *
 * `shadeBand3DAll` (backtracking.html:1938) poda sus emisores en tres sitios:
 *   · `if(pl.e===r)continue;` (:2189) — fuera las mesas de la PROPIA LÍNEA;
 *   · `if(dx*sgn<=0||Math.abs(dx)>reachDe(pl.e,r)||…)continue;` (:2191) —
 *     solo el lado del sol y dentro del ALCANCE;
 *   · `cands.push({…,lo:pl.w0+shf-slack,hi:pl.w1+shf+slack})` (:2202) con
 *     `cSeg=cands.filter(c=>c.hi>=v0&&c.lo<=v1)` (:2217) — VENTANA AXIAL.
 * Este parche las pone detrás de banderas, sin tocar nada más de la cuenta
 * (la aritmética por estación es exacta y es la misma):
 *   __BF.poda   = true  ⇒ alcance y ventana axial como la página
 *   __BF.misma  = true  ⇒ entran las mesas de la propia línea (nunca la propia mesa)
 *   __BF.terreno= false ⇒ sin marchador de terreno (para aislar a los emisores)
 *   __BF.encoge = k     ⇒ CONTROL NEGATIVO: el alcance ×k (k < 1 tiene que perder)
 * Con {poda:true, misma:false, terreno:true, encoge:1} el contador parcheado
 * tiene que dar BIT A BIT lo que da la página: es el test nulo del parche, y
 * `A2_contador_poda.mjs` lo comprueba antes de contar nada.
 */
export const BF_DEFECTO = { poda: true, misma: false, terreno: true, encoge: 1 };

const SUST = [
  ['function shadeBand3DAll(zen,az,T,rowAngles,res){',
   'var __BF={poda:true,misma:false,terreno:true,encoge:1};\nfunction __bfSet(o){__BF=Object.assign({poda:true,misma:false,terreno:true,encoge:1},o||{});return __BF;}\nfunction shadeBand3DAll(zen,az,T,rowAngles,res){'],
  ['  const doTerr=true;', '  const doTerr=__BF.terreno;'],
  ['      planes.push({e:e,x:xs[e],w0:w0,', '      planes.push({e:e,kE:kE,x:xs[e],w0:w0,'],
  ['      if(pl.e===r)continue;', '      if(pl.e===r&&!__BF.misma)continue;'],
  ['      if(dx*sgn<=0||Math.abs(dx)>reachDe(pl.e,r)||Math.abs(pl.den)<1e-9)continue;',
   '      if(__BF.poda&&pl.e!==r&&(dx*sgn<=0||Math.abs(dx)>reachDe(pl.e,r)*__BF.encoge))continue;\n      if(Math.abs(pl.den)<1e-9)continue;'],
  ['      cands.push({pl:pl,adx:Math.abs(dx),lo:pl.w0+shf-slack,hi:pl.w1+shf+slack});',
   '      cands.push({pl:pl,adx:Math.abs(dx),lo:(__BF.poda&&pl.e!==r)?pl.w0+shf-slack:-Infinity,hi:(__BF.poda&&pl.e!==r)?pl.w1+shf+slack:Infinity});'],
  ['      const cSeg=cands.filter(c=>c.hi>=v0&&c.lo<=v1).map(c=>c.pl);',
   '      const cSeg=cands.filter(c=>c.hi>=v0&&c.lo<=v1&&!(c.pl.e===r&&c.pl.kE===kR)).map(c=>c.pl);'],
];

/* La página v1.80.0 (R5 fase A) ya trae `kE` en el plano y `doTerr` depende de
   la opción `noTerr`: esas dos anclas se adaptan, el resto es igual. Las
   medidas de audit5/out/A2_*.txt se tomaron sobre v1.78.1 (antes de la fase A). */
const SUST_V180 = [
  ['  const doTerr=!(res&&res.noTerr);', '  const doTerr=!(res&&res.noTerr)&&__BF.terreno;'],
];
/* parche texto → texto; lanza si un ancla no aparece exactamente una vez */
export function parcheBF(html) {
  const v180 = html.includes('planes.push({e:e,kE:kE,');
  const lista = v180 ? [SUST[0], ...SUST_V180, ...SUST.slice(3)] : SUST;
  for (const [a, b] of lista) {
    const n = html.split(a).length - 1;
    if (n !== 1) throw new Error(`ancla del parche BF encontrada ${n} veces: ${a.slice(0, 60)}`);
    html = html.replace(a, b);
  }
  return html;
}
