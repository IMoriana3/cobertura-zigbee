/* =============================================================================
 * irradiancia.js — cielo claro, masa de aire y orientación de la pala
 * =============================================================================
 * Lo que necesitan por igual el simulador de backtracking y el de nubes, y que
 * estaba escrito en los dos:
 *
 *   1. IRRADIANCIA EXTRATERRESTRE — Spencer (1971) con constante solar 1366,1,
 *      que es lo que usa por defecto `pvlib.irradiance.get_extra_radiation` y
 *      por tanto el core.
 *   2. MASA DE AIRE — Kasten & Young (1989), relativa.
 *   3. CIELO CLARO — Ineichen-Perrin, el de `pvlib.clearsky.ineichen`.
 *   4. ORIENTACIÓN DE LA PALA — tilt y azimut de superficie para un ángulo de
 *      seguimiento sobre eje inclinado.
 *
 * POR QUÉ ESTÁ AQUÍ, y no es una limpieza. `overcast.html` corrigió `dniExtra`
 * a Spencer y lo dejó escrito: «la fórmula simple 1367·(1+0,033·cos(2πd/365))
 * que había aquí se desviaba ~1 W/m², y eso entra en Perez por
 * delta = DHI·airmass/dni_extra y descuadra F1/F2: el golden del core lo cazó
 * con 0,134 W/m² de POA». `backtracking.html` se quedó con la vieja. El arreglo
 * estaba hecho en una página y no en la otra: eso es lo que pasa con dos copias,
 * y por eso hay una sola.
 * ============================================================================= */
(function (root) {
  'use strict';
  var I = {};
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;

  /* Irradiancia extraterrestre normal [W/m²] para el día del año.
     Spencer (1971), verificado contra pvlib al microvatio en los días 1, 172 y 355. */
  I.dniExtra = function (doy) {
    var B = 2 * Math.PI * (doy - 1) / 365;
    return 1366.1 * (1.00011 + 0.034221 * Math.cos(B) + 0.00128 * Math.sin(B)
                     + 0.000719 * Math.cos(2 * B) + 0.000077 * Math.sin(2 * B));
  };

  /* Masa de aire relativa (Kasten & Young 1989). NaN de noche, como pvlib. */
  I.airmassKY = function (zenDeg) {
    if (zenDeg >= 90) return NaN;
    return 1 / (Math.cos(zenDeg * RAD) + 0.50572 * Math.pow(96.07995 - zenDeg, -1.6364));
  };

  /* Cielo claro Ineichen-Perrin. zen [grados], doy, altitud [m], turbiedad Linke.
     Devuelve {ghi, dni, dhi} en W/m². */
  I.clearskyIneichen = function (zenDeg, doy, altM, TL) {
    if (!(zenDeg < 90)) return { ghi: 0, dni: 0, dhi: 0 };
    var amR = I.airmassKY(zenDeg);
    /* Masa de aire ABSOLUTA: la relativa por la presión de la atmósfera estándar
       a esa altitud. Sin este factor el GHI se va casi medio por ciento. */
    var press = Math.pow(1 - 2.25577e-5 * altM, 5.25588);
    var am = amR * press;
    var I0 = I.dniExtra(doy), cz = Math.cos(zenDeg * RAD);
    var fh1 = Math.exp(-altM / 8000), fh2 = Math.exp(-altM / 1250);
    var cg1 = 5.09e-5 * altM + 0.868, cg2 = 3.92e-5 * altM + 0.0387;
    var ghi = cg1 * I0 * cz * Math.exp(-cg2 * am * (fh1 + fh2 * (TL - 1))) * Math.exp(0.01 * Math.pow(am, 1.8));
    ghi = Math.max(0, ghi);
    var b = 0.664 + 0.163 / fh1;
    var bnci = b * I0 * Math.exp(-0.09 * am * (TL - 1));
    var bnci2 = cz > 1e-6 ? ghi * (1 - (0.1 - 0.2 * Math.exp(-TL)) / (0.1 + 0.882 / fh1)) / cz : 0;
    var dni = Math.max(0, Math.min(bnci, bnci2));
    return { ghi: ghi, dni: dni, dhi: Math.max(0, ghi - dni * cz) };
  };

  /* Orientación de la pala para un ángulo de seguimiento sobre eje inclinado:
     {tilt, az} en grados, azimut en compás (0 = norte, + al este). */
  I.surfaceOrient = function (thetaDeg, axisTilt, axisAz) {
    var tilt = Math.acos(Math.cos(thetaDeg * RAD) * Math.cos(axisTilt * RAD)) * DEG;
    var sT = Math.sin(tilt * RAD), azd;
    if (Math.abs(sT) < 1e-12) azd = 90;
    else {
      azd = Math.asin(Math.max(-1, Math.min(1, Math.sin(thetaDeg * RAD) / sT))) * DEG;
      if (Math.abs(thetaDeg) >= 90) azd = -azd + Math.sign(thetaDeg) * 180;
    }
    return { tilt: tilt, az: ((axisAz + azd) % 360 + 360) % 360 };
  };

  I.VERSION = '0.1.0';
  root.Irr = I;
  if (typeof module !== 'undefined' && module.exports) module.exports = I;
})(typeof window !== 'undefined' ? window : this);
