/* Canonical BT RESULT consumer. No solar/shadow/BT/control solver lives here.
 * The payload contains core-computed corners, commands and receiver evidence.
 * SHA256 is integrity, not authentication. Import is a read-only reference mode.
 */
(function (root) {
  'use strict';
  const SCHEMA = 'bt-canonical-scene/v1';
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const fail = message => { throw new Error(message); };
  function validate(data) {
    if (!data || data.schema !== SCHEMA || data.reference_only !== true ||
        data.operational !== false || data.transition_validated !== false ||
        data.global_optimum_proven !== false) fail('El paquete no declara su alcance de referencia.');
    if (!/^[a-f0-9]{40}$/.test(data.source_sha) || !/^[a-f0-9]{64}$/.test(data.reference_digest) ||
        !/^[a-f0-9]{64}$/.test(data.input_hash)) fail('Procedencia incompleta.');
    if (data.coordinate_frame !== 'tracker_local_x_cross_y_axis_z_up_m') fail('Marco de coordenadas desconocido.');
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 20000 ||
        !Array.isArray(data.frames) || !data.frames.length) fail('Escena vacía o demasiado grande.');
    const ids = new Map();
    for (const row of data.rows) {
      if (!Number.isInteger(row.geometry_row_index) || row.geometry_row_index < 0 ||
          ids.has(row.geometry_row_index) || typeof row.asset_id !== 'string' ||
          !row.asset_id || row.asset_id.trim() !== row.asset_id) fail('Bindings geométricos/identidad inválidos.');
      ids.set(row.geometry_row_index, row.asset_id);
    }
    let previous = -Infinity, count = 0;
    let slots = null;
    for (const frame of data.frames) {
      const ms = Date.parse(frame.timestamp_utc);
      if (!/Z$|[+-]00:00$/.test(frame.timestamp_utc) || !finite(ms) || ms <= previous)
        fail('Instantes UTC duplicados, desordenados o inválidos.');
      previous = ms;
      const sun = frame.solar_position;
      if (!sun || !finite(sun.apparent_zenith) || sun.apparent_zenith < 0 || sun.apparent_zenith > 180 ||
          !finite(sun.azimuth)) fail('Posición solar inválida.');
      if (frame.environment_included !== false) fail('Esta vista no certifica el entorno.');
      if (!Array.isArray(frame.receivers) || frame.receivers.length !== ids.size ||
          !Array.isArray(frame.surfaces) || !frame.surfaces.length) fail('Frame incompleto.');
      const seen = new Set(), motors = new Map();
      for (const r of frame.receivers) {
        if (seen.has(r.geometry_row_index) || ids.get(r.geometry_row_index) !== r.asset_id)
          fail('Receptor sin binding explícito o duplicado.');
        seen.add(r.geometry_row_index);
        if (!finite(r.theta_command_deg) || Math.abs(r.theta_command_deg) >= 90) fail('Ángulo fuera de dominio.');
        if (motors.has(r.asset_id) && motors.get(r.asset_id) !== r.theta_command_deg)
          fail('Un motor compartido tiene dos consignas.');
        motors.set(r.asset_id, r.theta_command_deg);
        if (r.shadow_fraction !== null && (!finite(r.shadow_fraction) || r.shadow_fraction < 0 || r.shadow_fraction > 1))
          fail('Fracción de sombra inválida.');
        if (r.clearance_status === 'measured') {
          if (!finite(r.clearance_m) || r.clearance_m < 0) fail('Margen medido inválido.');
        } else if (!['no_forward_blocker', 'not_evaluated'].includes(r.clearance_status) || r.clearance_m !== null) {
          fail('Ausencia de margen mal representada.');
        }
        if (typeof r.search_status !== 'string' || typeof r.quality_flag !== 'string') fail('Falta el estado de búsqueda.');
      }
      const slotSet = new Set();
      const surfaced = new Set();
      for (const face of frame.surfaces) {
        if (!ids.has(face.geometry_row_index) || !Number.isInteger(face.segment_index) || face.segment_index < 0)
          fail('Superficie con locator desconocido.');
        const key = face.geometry_row_index + ':' + face.segment_index;
        if (slotSet.has(key)) fail('Superficie duplicada.');
        slotSet.add(key); surfaced.add(face.geometry_row_index);
        for (const [points, n] of [[face.corners_m, 4], [face.axis_endpoints_m, 2]]) {
          if (!Array.isArray(points) || points.length !== n || points.some(p =>
            !Array.isArray(p) || p.length !== 3 || !p.every(finite))) fail('Vértices inválidos.');
        }
      }
      if (surfaced.size !== ids.size) fail('Hay receptores sin superficie.');
      const currentSlots = Array.from(slotSet).sort();
      if (slots && JSON.stringify(currentSlots) !== JSON.stringify(slots)) fail('La geometría cambia de identidad entre frames.');
      slots = currentSlots; count += currentSlots.length;
      if (count > 200000) fail('Escena demasiado grande.');
    }
    return data;
  }
  async function decode(envelope, cryptoProvider) {
    if (!envelope || envelope.schema !== SCHEMA || typeof envelope.payload !== 'string' ||
        envelope.payload.length > 100000000 || !/^[a-f0-9]{64}$/.test(envelope.sha256)) fail('Sobre inválido.');
    const provider = cryptoProvider || root.crypto;
    if (!provider || !provider.subtle) fail('Este navegador no permite comprobar SHA256.');
    const digest = await provider.subtle.digest('SHA-256', new TextEncoder().encode(envelope.payload));
    const hex = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
    if (hex !== envelope.sha256) fail('SHA256 no coincide: el resultado ha cambiado.');
    return validate(JSON.parse(envelope.payload));
  }
  function viewFrame(data, index) {
    validate(data);
    if (!Number.isInteger(index) || index < 0 || index >= data.frames.length) fail('Frame fuera de rango.');
    // Deliberately no interpolation or re-rounding of angles or measurements.
    return JSON.parse(JSON.stringify(data.frames[index]));
  }
  function mount(document) {
    if (!document || !document.getElementById('polcard') || document.getElementById('bt-core-import')) return;
    const host = document.createElement('section'); host.className = 'card'; host.id = 'bt-core-import';
    const title = document.createElement('strong'); title.textContent = 'Resultado canónico · SolarGPT';
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.setAttribute('aria-label', 'Importar resultado canónico SolarGPT');
    const status = document.createElement('p'); status.className = 'nota';
    status.textContent = 'Importa el .scene.json del paquete de consignas. Solo lectura; no ejecuta un optimizador JavaScript.';
    const panel = document.createElement('div'); panel.hidden = true;
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 440;
    canvas.style.cssText = 'width:100%;height:440px;touch-action:none;border:1px solid #2a3a50;border-radius:8px';
    canvas.setAttribute('aria-label', 'Geometría canónica importada, proyección 3D interactiva');
    const controls = document.createElement('div'); controls.className = 'timerow';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.step = '1';
    const when = document.createElement('span');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn small'; close.textContent = 'Volver al simulador';
    controls.append(slider, when, close);
    const table = document.createElement('table');
    panel.append(controls, canvas, table); host.append(title, input, status, panel);
    document.getElementById('polcard').before(host);
    let data = null, yaw = -.7, pitch = .55, drag = null, hidden = [], epoch = 0;
    const legacy = () => Array.from(document.querySelectorAll('.wrap > .cols, #polcard'));
    function restore() {
      hidden.forEach(([e, value, display]) => { e.hidden = value; e.style.display = display; }); hidden = [];
      panel.hidden = true; data = null; input.value = ''; epoch++;
      status.textContent = 'Modo de simulación original. Ningún input ni cálculo ha sido sobrescrito.';
      root.dispatchEvent(new CustomEvent('bt-canonical-mode', {detail: {active: false}}));
    }
    close.onclick = restore;
    function draw() {
      if (!data) return;
      const f = data.frames[Number(slider.value)];
      when.textContent = f.timestamp_utc + ' · muestra ' + (Number(slider.value) + 1) + '/' + data.frames.length;
      const context = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      context.clearRect(0,0,w,h); context.fillStyle = '#101722'; context.fillRect(0,0,w,h);
      const project = p => {
        const x = p[0]*Math.cos(yaw)-p[1]*Math.sin(yaw), y = p[0]*Math.sin(yaw)+p[1]*Math.cos(yaw);
        return [x, y*Math.sin(pitch)-p[2]*Math.cos(pitch), y*Math.cos(pitch)+p[2]*Math.sin(pitch)];
      };
      const projected = f.surfaces.map(s => ({s, p: s.corners_m.map(project)}));
      const points = projected.flatMap(o => o.p);
      let loX=Infinity, hiX=-Infinity, loY=Infinity, hiY=-Infinity;
      for (const p of points) { loX=Math.min(loX,p[0]); hiX=Math.max(hiX,p[0]); loY=Math.min(loY,p[1]); hiY=Math.max(hiY,p[1]); }
      const scale = Math.min((w-70)/Math.max(.01,hiX-loX),(h-60)/Math.max(.01,hiY-loY));
      const xy = p => [(p[0]-(loX+hiX)/2)*scale+w/2,(p[1]-(loY+hiY)/2)*scale+h/2];
      const rs = new Map(f.receivers.map(r => [r.geometry_row_index, r]));
      projected.sort((a,b) => a.p.reduce((s,p)=>s+p[2],0)-b.p.reduce((s,p)=>s+p[2],0));
      for (const o of projected) {
        const r = rs.get(o.s.geometry_row_index), coords = o.p.map(xy);
        context.beginPath(); coords.forEach((p,i) => i ? context.lineTo(...p) : context.moveTo(...p)); context.closePath();
        context.fillStyle = r.shadow_fraction === null ? '#64748b' : r.shadow_fraction > 0 ? '#e9a23b' : '#245b83';
        context.fill(); context.strokeStyle = '#d5e8f6'; context.lineWidth = 1; context.stroke();
      }
      table.replaceChildren();
      const head = document.createElement('tr');
      ['Motor','θ consigna','Sombra 3D','Margen','Resultado'].forEach(t => {const th=document.createElement('th');th.textContent=t;head.append(th);});
      table.append(head);
      for (const r of f.receivers) {
        const row=document.createElement('tr');
        const values=[r.asset_id, String(r.theta_command_deg)+'°', r.shadow_fraction===null?'No evaluada':(100*r.shadow_fraction).toFixed(4)+' %',
          r.clearance_m===null?(r.clearance_status==='no_forward_blocker'?'Sin emisor hacia delante':'No evaluado'):(1000*r.clearance_m).toFixed(3)+' mm', r.search_status];
        values.forEach(v=>{const td=document.createElement('td');td.textContent=v;row.append(td);}); table.append(row);
      }
      root.dispatchEvent(new CustomEvent('bt-canonical-frame',{detail:{timestamp_utc:f.timestamp_utc,reference_digest:data.reference_digest}}));
    }
    slider.oninput=draw;
    canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
    canvas.onpointerup=()=>{drag=null;};
    canvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.006;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];draw();};
    async function activateEnvelope(envelope, label) {
      const generation=++epoch;
      const candidate=await decode(envelope);
      if(generation!==epoch)return false;
      if(!hidden.length)hidden=legacy().map(e=>[e,e.hidden,e.style.display]);
      hidden.forEach(([e])=>{e.hidden=true;e.style.display='none';});
      data=candidate; slider.max=String(data.frames.length-1);slider.value='0';panel.hidden=false;
      status.textContent=(label||'Referencia canónica')+' · '+data.algorithm_id+' · core '+data.source_sha.slice(0,8)+
        ' · sin recálculo JS · sin control operativo ni entorno. Color: estado del receptor, no máscara de sombra.';
      root.dispatchEvent(new CustomEvent('bt-canonical-mode',{detail:{active:true}}));draw();
      return true;
    }
    input.onchange=async()=>{
      const file=input.files[0]; if(!file)return;
      try {
        if(file.size>100000000) fail('Archivo demasiado grande.');
        await activateEnvelope(JSON.parse(await file.text()), 'Referencia importada');
      } catch(e) {status.textContent='No importado: '+e.message;}
    };
    const onLoad=ev=>{
      const detail=ev&&ev.detail||{};
      activateEnvelope(detail.envelope, detail.label||'Resultado calculado por SolarGPT')
        .catch(e=>{status.textContent='No cargado: '+e.message;});
    };
    root.addEventListener('bt-canonical-load',onLoad);
    return {
      restore,
      loadEnvelope:activateEnvelope,
      getFrame:()=>data?viewFrame(data,Number(slider.value)):null,
      destroy:()=>root.removeEventListener('bt-canonical-load',onLoad)
    };
  }
  const api={SCHEMA,validate,decode,viewFrame,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.BTCanonicalResults=api;
  if(typeof document!=='undefined') {
    const boot=()=>{api.controller=mount(document);};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
    else boot();
  }
})(typeof globalThis!=='undefined'?globalThis:this);
