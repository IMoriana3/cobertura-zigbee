/* BT3D · los dos `conoHaz`: el de la página y el de su comentario.
 *
 * La página (backtracking.html:1030):
 *   const sa=Math.sin(Z)*Math.cos(dA)*Math.sin(atr)+Math.cos(Z)*Math.cos(atr);   // s·a (eje inclinado)
 * Su comentario (backtracking.html:992-994, en rangoHaz): «cos AOI = cos(θ − ψ)·cos λ,
 * con sin λ = s·a». Para el eje a = (sin A·cos τ, cos A·cos τ, sin τ), s·a =
 * sin Z·cos ΔA·cos τ + cos Z·sin τ. El parche pone ESA cuenta, y nada más.
 * `F0_conohaz.mjs` midió que con ella el cono coincide con el del motor a 0,010°
 * (el paso del barrido) y con la de la página se aparta hasta 8,06°.
 */
export const LINEA_PAGINA = 'const sa=Math.sin(Z)*Math.cos(dA)*Math.sin(atr)+Math.cos(Z)*Math.cos(atr);';
export const LINEA_CORRECTA = 'const sa=Math.sin(Z)*Math.cos(dA)*Math.cos(atr)+Math.cos(Z)*Math.sin(atr);';
export function parcheCorrecto(html) {
  const n = html.split(LINEA_PAGINA).length - 1;
  if (n !== 1) throw new Error(`el ancla de conoHaz aparece ${n} veces (se esperaba 1): el parche no mediría lo que dice`);
  return html.replace(LINEA_PAGINA, LINEA_CORRECTA);
}
/* contador de llamadas, para el test nulo: qué políticas pasan de verdad por conoHaz */
export function parcheContador(html) {
  const ancla = 'function conoHaz(zen,az,T,axisTilt){';
  if (html.split(ancla).length !== 2) throw new Error('ancla de conoHaz no única');
  return html.replace(ancla, ancla + 'globalThis.__conoHaz=(globalThis.__conoHaz||0)+1;');
}
