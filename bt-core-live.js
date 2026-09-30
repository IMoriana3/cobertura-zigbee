/* Live bridge from the existing BT simulator UI to SolarGPT canonical core.
 * No tracking/shadow/control equations live here. It only serializes an exact
 * subset of the existing UI, POSTs it to /bt/validate, and asks the already
 * audited canonical-result consumer to display the returned scene.
 */
(function(root){
  'use strict';

  function fail(msg){ throw new Error(msg); }
  function finite(v){ return typeof v==='number' && Number.isFinite(v); }

  function utcTimestamp(date, minuteLocal, tzHours){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Fecha inválida.');
    if(!Number.isInteger(minuteLocal)||minuteLocal<0||minuteLocal>1439) fail('Minuto local inválido.');
    if(!finite(tzHours)) fail('Huso horario inválido.');
    const [y,m,d]=date.split('-').map(Number);
    const ms=Date.UTC(y,m-1,d,0,minuteLocal,0)-tzHours*3600000;
    return new Date(ms).toISOString();
  }

  function declaredBindings(nRows, groups){
    if(!Number.isInteger(nRows)||nRows<2) fail('Número de filas inválido.');
    const source=groups||Array.from({length:nRows},(_,i)=>[i]);
    const out={}, seen=new Set();
    source.forEach((g,m)=>{
      if(!Array.isArray(g)||!g.length) fail('Grupo de accionamiento vacío.');
      const id='sim-motor-'+String(m+1).padStart(4,'0');
      g.forEach(r=>{
        if(!Number.isInteger(r)||r<0||r>=nRows||seen.has(r)) fail('Binding de accionamiento inválido.');
        seen.add(r); out[r]=id;
      });
    });
    if(seen.size!==nRows) fail('Los motores declarados no cubren todas las filas.');
    return out;
  }

  function unsupportedReason(c,T,plantReal){
    if(plantReal) return 'La planta real usa geometría segmentada/as-built que A4-v1 todavía no serializa.';
    if(!T||!Array.isArray(T.pairs)||!T.pairs.length) return 'Terreno sin parejas explícitas.';
    const p=T.pairs[0];
    if(T.rotula) return 'El quiebro en rótula requiere geometría segmentada y queda fuera de A4-v1.';
    if(c.nsl!=='alineadas'||c.ntrk!==1)
      return 'La implantación axial no es una fila continua alineada; A4-v1 no la simplifica.';
    if(Array.isArray(T.rowTilt)&&T.rowTilt.some(v=>Math.abs(v-p.axisTilt)>1e-10))
      return 'Hay tilts longitudinales distintos por fila; A4-v1 no los promedia.';
    return null;
  }

  function buildRequest(c,T,minuteLocal,plantReal,options){
    const why=unsupportedReason(c,T,plantReal);
    if(why) fail(why);
    const p=T.pairs[0];
    const groups=T.groups||null;
    return {
      latitude_deg:Number(c.lat),
      longitude_deg:Number(c.lon),
      altitude_m:Number(c.alt),
      timestamps_utc:[utcTimestamp(c.date,minuteLocal,Number(c.tz))],
      n_rows:Number(c.nrows),
      pitch_m:Number(p.pitch),
      collector_width_m:Number(T.cw),
      max_angle_deg:Number(T.maxAngle),
      axis_azimuth_deg:Number(T.axisAz),
      axis_tilt_deg:Number(p.axisTilt),
      cross_axis_slope_deg:Number(p.slope),
      pairs:T.pairs.map(x=>({
        pitch_m:Number(x.pitch),
        cross_axis_slope_deg:Number(x.slope),
        axis_tilt_deg:Number(x.axisTilt)
      })),
      gcr:finite(Number(T.gcr))?Number(T.gcr):Number(T.cw)/Number(p.pitch),
      surface_to_axis_offset_m:Number(T.z0||0),
      n_bypass_diodes:Number((options&&options.nBypassDiodes)!=null?options.nBypassDiodes:3),
      row_length_m:Number(T.filaLen),
      row_asset_bindings:declaredBindings(Number(c.nrows),groups),
      identity_revision:'simulator-explicit-a4-v1',
      geometry_revision:'simulator-ui-a4-v1'
    };
  }

  async function requestCore(endpoint,payload,fetchFn){
    if(typeof endpoint!=='string'||!endpoint.trim()) fail('Configura la URL del core SolarGPT.');
    const fetcher=fetchFn||root.fetch;
    if(typeof fetcher!=='function') fail('fetch no disponible.');
    const response=await fetcher(endpoint.trim(),{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
    });
    let data=null;
    try{data=await response.json();}catch(e){fail('El core no devolvió JSON.');}
    if(!response.ok) fail((data&&data.detail)||('HTTP '+response.status));
    if(!data||data.schema!=='bt-validation-response/v1'||!data.scene) fail('Respuesta canónica desconocida.');
    return data;
  }

  function tableFor(samples){
    const hasAC=samples.some(x=>x.theta_ac_optimal_deg!==null&&x.theta_ac_optimal_deg!==undefined);
    const head='<tr><th>Motor</th><th>True tracking</th><th>BT2.5D</th><th>Shadow-Safe + Tangency</th>'+
      '<th>POA-optimal</th>'+(hasAC?'<th>AC-optimal</th>':'')+'<th>Estado</th></tr>';
    const rows=samples.map(x=>'<tr><td>'+escapeHtml(x.asset_id)+'</td><td>'+num(x.theta_true_tracking_deg)+'°</td><td>'+
      num(x.theta_bt25d_deg)+'°</td><td>'+num(x.theta_shadow_safe_tangency_deg)+'°</td><td>'+
      num(x.theta_poa_optimal_deg)+'°</td>'+(hasAC?'<td>'+num(x.theta_ac_optimal_deg)+'°</td>':'')+'<td>'+
      escapeHtml(x.search_status)+'</td></tr>').join('');
    return '<table>'+head+rows+'</table>';
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function num(v){return Number.isFinite(Number(v))?Number(v).toFixed(1):'—';}

  function mount(document){
    if(!document||document.getElementById('bt-core-live')) return;
    const pol=document.getElementById('polcard'); if(!pol)return;
    const card=document.createElement('section'); card.className='card'; card.id='bt-core-live';
    card.innerHTML='<h2>🧠 Core SolarGPT <span class="sn">A4 · cálculo canónico</span></h2>'+
      '<div class="f"><label>Endpoint /bt/validate</label><input id="bt-core-url" value="http://127.0.0.1:8765/bt/validate"></div>'+
      '<div class="f"><label>Diodos bypass por módulo · core</label><input id="bt-core-bypass" type="number" min="0" step="1" value="3"></div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
      '<button class="btn acc" id="bt-core-run">Recalcular este instante con el core</button>'+
      '<span class="pill" id="bt-core-state">sin ejecutar</span></div>'+
      '<div class="nota" id="bt-core-note">Solo usa el dominio que el adaptador puede representar exactamente. Si la geometría queda fuera, se rechaza: no se sustituye por el mirror JS.</div>'+
      '<div id="bt-core-table" style="margin-top:8px"></div>';
    pol.before(card);
    const url=document.getElementById('bt-core-url');
    const query=new URLSearchParams(root.location&&root.location.search||'');
    try{url.value=query.get('bt_core')||root.localStorage.getItem('BT_CORE_VALIDATE_URL')||url.value;}catch(e){url.value=query.get('bt_core')||url.value;}
    url.onchange=()=>{try{root.localStorage.setItem('BT_CORE_VALIDATE_URL',url.value.trim());}catch(e){}};
    document.getElementById('bt-core-run').onclick=async()=>{
      const state=document.getElementById('bt-core-state'), note=document.getElementById('bt-core-note');
      state.textContent='calculando…'; state.style.color='';
      try{
        let snapshot=null;
        if(typeof root.BTCoreUISnapshot==='function')snapshot=root.BTCoreUISnapshot();
        else if(typeof root.cfg==='function'&&typeof root.terrain==='function'){
          const c=root.cfg(); snapshot={c:c,T:root.terrain(c),plantReal:null};
        }else fail('La UI del simulador no está inicializada.');
        const c=snapshot.c, T=snapshot.T, minute=Number(document.getElementById('hour').value);
        const bypass=Number(document.getElementById('bt-core-bypass').value);
        if(!Number.isInteger(bypass)||bypass<0) fail('Diodos bypass: entero >= 0.');
        const payload=buildRequest(c,T,minute,snapshot.plantReal||null,{nBypassDiodes:bypass});
        const result=await requestCore(url.value,payload);
        document.getElementById('bt-core-table').innerHTML=tableFor(result.samples);
        state.textContent='core '+result.source_sha.slice(0,8)+' · '+result.samples.length+' resultado(s)';
        state.style.color='var(--ok)';
        const ac=result.algorithms&&result.algorithms.ac_optimal?' · AC-optimal incluido':' · AC-optimal no ejecutado (sin full_chain explícito)';
        note.textContent='Resultado recibido del core · '+(result.weather_source||'irradiancia no declarada')+ac+
          '. El visor canónico valida SHA256 y oculta el mirror mientras muestra esta referencia.';
        root.dispatchEvent(new CustomEvent('bt-canonical-load',{
          detail:{envelope:result.scene,label:'Resultado recalculado por SolarGPT'}
        }));
      }catch(e){
        state.textContent='no calculado';state.style.color='var(--err)';
        note.textContent=e.message;
      }
    };
  }

  const api={utcTimestamp,declaredBindings,unsupportedReason,buildRequest,requestCore,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.BTCoreLive=api;
  if(typeof document!=='undefined'){
    const boot=()=>mount(document);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  }
})(typeof globalThis!=='undefined'?globalThis:this);
