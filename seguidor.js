/* ============================================================================
 * seguidor.js — FUENTE ÚNICA del seguidor solar (cotas + piezas + materiales)
 * ----------------------------------------------------------------------------
 * La consumen los DOS visores, cada uno a su manera, SIN duplicar la definición:
 *   · Gemelo Digital  -> Seguidor.buildGroup(THREE, {detail:'full'})  (mallas sueltas, 1 ud)
 *   · Cobertura 3D    -> Seguidor.parts(THREE, {detail:'mass'})       (InstancedMesh, 215 ud)
 * Mejorar este archivo (una cota, un material, una pieza) mejora AMBOS.
 * Se sincroniza IDÉNTICO en los dos repos (como zigbee_pv_model.js).
 *
 * MARCO CANÓNICO (local del seguidor):
 *   +X = a lo largo del tubo de par (eje N-S)      Y = arriba      Z = transversal
 *   Basculación del panel = giro sobre X.   Motor del slew sale hacia -Z.
 *   Cada app coloca el seguidor en su mundo con su PROPIA matriz base (orientación
 *   + posición + drape al terreno); el resto del frame del visor no cambia.
 *
 * CONTRATO para renderizar una pieza p en el mundo:
 *   spin=true : M = base · Rx(ángulo) · p.m        (bascula con el tubo)
 *   spin=false: M = base · p.m                      (fija: slew drive)
 *   donde base = matriz de colocación del seguidor (la pone la app) y
 *         Rx(ángulo) = giro de basculación sobre el eje del tubo (X canónica).
 * ==========================================================================*/
(function (root) {
  'use strict';
  var S = {};

  /* ---------- COTAS CANÓNICAS (m) — módulo 1134×2382, cadena de 28 ---------- */
  var D = {
    modW: 1.134, modH: 2.382, gapMod: 0.012, gapDrive: 0.55, modsPerStr: 28,
    off: 0.14,            // cara del módulo sobre el eje del tubo
    tube: 0.12,           // viga de torsión cuadrada 120 mm
    postH: 2.0, filaZ: 3.0,
    purlY: 0.085,         // correas apoyadas sobre el tubo
    jbY: 0.09, jbZ: 0.71, // cajas de conexión bajo el módulo
    tcuX: 1.4,            // TCU desplazada a lo largo del tubo, junto al motor
    medioFactor: 0.504    // el seguidor "Medio" mide ~la mitad
  };
  D.pitch  = D.modW + D.gapMod;
  D.strLen = D.modsPerStr * D.pitch;        // largo de UN ala
  D.span   = 2 * D.strLen + D.gapDrive;     // tubo completo (largo)
  D.mesaC  = D.gapDrive / 2 + D.strLen / 2; // centro de cada ala
  S.DIMS = D;

  /* ---------- MATERIALES (cada app crea los suyos con su THREE) ---------- */
  S.materials = function (THREE) {
    return {
      glass:  new THREE.MeshStandardMaterial({ color:0xffffff, roughness:.14, metalness:.10, emissive:0x0a1626, emissiveIntensity:.07 }),
      frame:  new THREE.MeshStandardMaterial({ color:0xb8c0c8, roughness:.35, metalness:.70 }),
      steel:  new THREE.MeshStandardMaterial({ color:0x9aa3ac, roughness:.45, metalness:.65 }),
      blue:   new THREE.MeshStandardMaterial({ color:0x2f5fb0, roughness:.40, metalness:.40 }),
      motor:  new THREE.MeshStandardMaterial({ color:0x1a1c20, roughness:.50, metalness:.55 }),
      correa: new THREE.MeshStandardMaterial({ color:0x707a85, roughness:.50, metalness:.55 }),
      cable:  new THREE.MeshStandardMaterial({ color:0xc0392b, roughness:.60 }),
      jbox:   new THREE.MeshStandardMaterial({ color:0x101216, roughness:.70 }),
      tcu:    new THREE.MeshStandardMaterial({ color:0x232f3b, roughness:.50, metalness:.30 }),
      silver: new THREE.MeshStandardMaterial({ color:0xaab4be, roughness:.40, metalness:.60 })
    };
  };

  function mT(THREE, x, y, z){ return new THREE.Matrix4().makeTranslation(x, y, z); }
  // catenaria (cable con caída) entre dos puntos locales -> geometría tubular
  function catenary(THREE, a, b, sag, r){
    var mid = a.clone().lerp(b, 0.5); mid.y -= (sag||0.10);
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 12, r||0.012, 6, false);
  }

  /* ====================================================================
   * PIEZAS de UN tubo (una fila). Devuelve una lista de descriptores:
   *   { key, mat, spin, cast, geom(THREE), m:Matrix4 }
   * opts.size   : 'largo' (2 alas) | 'medio' (1 ala centrada)
   * opts.detail : 'full'  -> módulos uno a uno, correa por hueco, cable
   *                          módulo→módulo, caja por módulo   (GEMELO)
   *               'mass'  -> 1 mesa texturizada por ala + correas repr.
   *                          + canaleta + cajas               (COBERTURA 215 ud)
   * Postes/piers y la disposición en campo los pone CADA app (difieren).
   * ==================================================================== */
  S.parts = function (THREE, opts) {
    opts = opts || {};
    var size   = opts.size   || 'largo';
    var detail = opts.detail || 'full';
    var medio  = (size === 'medio');
    var out = [];
    var push = function (key, mat, spin, cast, geom, m){ out.push({ key:key, mat:mat, spin:spin, cast:cast, geom:geom, m:m }); };

    /* --- TUBO DE PAR (bascula) --- */
    var tubeLen = medio ? D.span * D.medioFactor : D.span;
    push('tube', 'steel', true, true,
      function (TH){ return new TH.BoxGeometry(tubeLen, D.tube, D.tube); }, mT(THREE, 0,0,0));

    /* --- ALAS: 'medio' = 1 ala centrada en X=0; 'largo' = 2 alas (+X / -X) --- */
    var wings = medio ? [ { dir:+1, edge:-D.strLen/2 } ]                       // centrada
                      : [ { dir:+1, edge:+D.gapDrive/2 }, { dir:-1, edge:-D.gapDrive/2 } ];

    wings.forEach(function (w) {
      // X del centro del módulo m (0..27) y del borde b (0..28) del ala
      var modX = function (m){ return w.edge + w.dir * (m + 0.5) * D.pitch; };
      var brdX = function (b){ return w.edge + w.dir * b * D.pitch; };
      var wingC = w.edge + w.dir * D.strLen / 2;   // centro del ala

      if (detail === 'full') {
        /* módulos uno a uno: marco + vidrio + caja; CORREAS 2n+1 (2 por módulo, paso medio); cable módulo→módulo */
        for (var b = 0; b <= 2 * D.modsPerStr; b++) {
          var bx = w.edge + w.dir * b * (D.pitch / 2);
          push('correa', 'correa', true, false,
            function (TH){ return new TH.BoxGeometry(0.05, 0.05, D.modH*0.96); }, mT(THREE, bx, D.purlY, 0));
        }
        for (var m = 0; m < D.modsPerStr; m++) {
          var cx = modX(m);
          push('frame', 'frame', true, true,
            function (TH){ return new TH.BoxGeometry(D.modW, 0.045, D.modH); }, mT(THREE, cx, D.off-0.004, 0));
          push('glass', 'glass', true, true,
            function (TH){ return new TH.BoxGeometry(D.modW-0.05, 0.05, D.modH-0.05); }, mT(THREE, cx, D.off, 0));
          push('jbox', 'jbox', true, false,
            function (TH){ return new TH.BoxGeometry(0.10, 0.05, 0.16); }, mT(THREE, cx, D.jbY, D.jbZ));
          if (m < D.modsPerStr - 1) {                      // cable + del módulo → − del siguiente
            // geometría CANÓNICA (un vano de paso 'pitch') + traslación: así todas las
            // mangueras comparten una sola geometría y cobertura las puede instanciar.
            var midx = (cx + modX(m+1)) / 2;
            push('cable', 'cable', true, false, function (TH){
              return catenary(TH, new TH.Vector3(-D.pitch/2, D.jbY-0.02, D.jbZ+0.06),
                                  new TH.Vector3(+D.pitch/2, D.jbY-0.02, D.jbZ-0.06), 0.10, 0.012);
            }, mT(THREE, midx, 0, 0));
          }
        }
      } else {
        /* 'mass': 1 MESA por ala (textura de células) + correas repr. + canaleta + cajas */
        push('mesa', 'glass', true, true,
          function (TH){ return new TH.BoxGeometry(D.strLen, 0.05, D.modH); }, mT(THREE, wingC, D.off, 0));
        var NPUR = 8;                                       // correas representativas por ala
        for (var i = 0; i < NPUR; i++) {
          var px = w.edge + w.dir * (i + 0.5) * (D.strLen / NPUR);
          push('correa', 'correa', true, false,
            function (TH){ return new TH.BoxGeometry(0.05, 0.05, D.modH*0.96); }, mT(THREE, px, D.purlY, 0));
        }
        push('cable', 'cable', true, false,                 // canaleta de string a lo largo del ala
          function (TH){ return new TH.BoxGeometry(D.strLen*0.94, 0.05, 0.035); }, mT(THREE, wingC, D.jbY-0.02, D.jbZ));
        for (var j = 0; j < 3; j++) {                       // 3 cajas por ala
          var jx = w.edge + w.dir * (j + 0.5) * (D.strLen / 3);
          push('jbox', 'jbox', true, false,
            function (TH){ return new TH.BoxGeometry(0.16, 0.05, 0.10); }, mT(THREE, jx, D.jbY, D.jbZ));
        }
      }
    });

    /* --- TCU colgada del tubo (bascula con él), junto al motor --- */
    push('tcu_brk', 'silver', true, true,
      function (TH){ return new TH.BoxGeometry(0.46, 0.07, 0.30); }, mT(THREE, D.tcuX, -0.05, 0));
    push('tcu', 'tcu', true, true,
      function (TH){ return new TH.BoxGeometry(0.50, 0.26, 0.36); }, mT(THREE, D.tcuX, -0.22, 0));

    /* --- SLEW DRIVE en el centro del tubo (FIJO: no bascula; el tubo gira dentro) --- */
    push('corona', 'blue', false, true,                     // corona slew (disco alrededor del tubo)
      function (TH){ var g=new TH.CylinderGeometry(0.25,0.25,0.16,24); g.rotateZ(Math.PI/2); return g; }, mT(THREE, 0,0,0));
    push('reductora', 'blue', false, true,                  // cuerpo de la reductora (worm)
      function (TH){ return new TH.BoxGeometry(0.30,0.36,0.26); }, mT(THREE, 0,-0.04,0));
    push('cuello', 'blue', false, true,                     // cuello reductora → motor
      function (TH){ var g=new TH.CylinderGeometry(0.06,0.06,0.12,14); g.rotateX(Math.PI/2); return g; }, mT(THREE, 0,-0.04,-0.20));
    push('motor', 'motor', false, true,                     // MOTOR horizontal saliendo hacia -Z
      function (TH){ var g=new TH.CylinderGeometry(0.085,0.085,0.40,18); g.rotateX(Math.PI/2); return g; }, mT(THREE, 0,-0.04,-0.46));
    push('tapa', 'blue', false, true,                       // tapa del motor
      function (TH){ var g=new TH.CylinderGeometry(0.092,0.092,0.05,18); g.rotateX(Math.PI/2); return g; }, mT(THREE, 0,-0.04,-0.68));
    push('control', 'silver', false, true,                  // caja de control / finales de carrera (gris) atornillada al frontal de la reductora
      function (TH){ return new TH.BoxGeometry(0.20, 0.20, 0.13); }, mT(THREE, 0.22, 0.04, -0.17));
    // SOPORTE de la corona: poste ROBUSTO hasta el suelo (terrainScaled: la app lo estira desde la corona al terreno)
    out.push({ key:'soporte', mat:'steel', spin:false, cast:true, terrainScaled:true,
      geom:function (TH){ return new TH.BoxGeometry(0.26, 1.0, 0.42); }, m:mT(THREE, 0,-0.6,0) });

    return out;
  };

  /* ====================================================================
   * CONVENIENCIA PARA EL GEMELO: construye mallas sueltas.
   * Devuelve { spin, static } (dos THREE.Group): la app rota 'spin' con el
   * ángulo de basculación y deja 'static' fijo. Comparten materiales.
   * ==================================================================== */
  S.buildGroup = function (THREE, opts) {
    opts = opts || {};
    var mats = opts.materials || S.materials(THREE);
    var spin = new THREE.Group(), stat = new THREE.Group();
    S.parts(THREE, opts).forEach(function (p) {
      var mesh = new THREE.Mesh(p.geom(THREE), mats[p.mat]);
      mesh.applyMatrix4(p.m);
      mesh.castShadow = !!p.cast; mesh.receiveShadow = true;
      (p.spin ? spin : stat).add(mesh);
    });
    return { spin: spin, static: stat, dims: D };
  };

  /* ====================================================================
   * CONVENIENCIA PARA COBERTURA (instanciado). Agrupa las piezas por tipo
   * (geometría+material) para que la app cree UN InstancedMesh por tipo y
   * coloque N copias. Las 'spin' se rematrizan por frame; las fijas, una vez.
   *   plan = Seguidor.instancePlan(THREE, {detail:'mass', size:'largo'})
   *   -> [{ key, mat, geom, spin, cast, locals:[Matrix4,...] }]
   * La app: por cada tracker t y cada local L -> setMatrixAt(base_t · (spin?Rx:1) · L)
   * ==================================================================== */
  S.instancePlan = function (THREE, opts) {
    var byType = {}, order = [];
    S.parts(THREE, opts).forEach(function (p) {
      if (!byType[p.key]) { byType[p.key] = { key:p.key, mat:p.mat, geom:p.geom, spin:p.spin, cast:p.cast, terrainScaled:!!p.terrainScaled, locals:[] }; order.push(p.key); }
      byType[p.key].locals.push(p.m);
    });
    return order.map(function (k){ return byType[k]; });
  };

  S.VERSION = '0.1.2';
  root.Seguidor = S;
})(typeof window !== 'undefined' ? window : this);
