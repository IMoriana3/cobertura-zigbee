/* Enriched view of the existing simulator. All scores, shadows, actuator
 * trajectories and motor costs are supplied by the shared engines. */
(function(root){'use strict';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=(x,n=1)=>Number.isFinite(x)?x.toFixed(n):'—';
const signed=(x,n=1)=>(x>=0?'+':'')+f(x,n);
const hour=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(Math.floor(m%60)).padStart(2,'0');
const yieldUI=()=>new Promise(r=>setTimeout(r,0));
function parseCSV(text,name){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  const sep=lines[0]&&lines[0].includes(';')?';':',';
  const head=(lines.shift()||'').split(sep).map(s=>s.trim().toLowerCase());
  for(const k of ['timestamp','ghi','dni','dhi'])if(!head.includes(k))throw new Error('CSV: falta columna '+k);
  const om={tms:[],ghi:[],dni:[],dhi:[],cc:[],source:'imported_csv',file:name};
  for(let i=0;i<lines.length;i++){
    const a=lines[i].split(sep).map(s=>s.trim()),at=k=>a[head.indexOf(k)];
    const stamp=at('timestamp');if(!/(Z|[+-]\d\d:\d\d)$/i.test(stamp))throw new Error('CSV: timestamp sin zona horaria en fila '+(i+2));
    const t=Date.parse(stamp);if(!Number.isFinite(t)||(om.tms.length&&t<=om.tms.at(-1)))throw new Error('CSV: reloj repetido o desordenado en fila '+(i+2));
    om.tms.push(t);
    for(const k of ['ghi','dni','dhi']){const v=at(k)===''?NaN:Number(at(k));if(!Number.isFinite(v)||v<0)throw new Error('CSV: '+k+' no válido en fila '+(i+2));om[k].push(v);}
    const cc=head.includes('cc')&&at('cc')!==''?Number(at('cc')):NaN;
    if(Number.isFinite(cc)&&(cc<0||cc>1))throw new Error('CSV: cc debe estar entre 0 y 1');om.cc.push(cc);
  }
  if(om.tms.length<2)throw new Error('CSV sin suficientes muestras');
  const dt=om.tms.slice(1).map((t,i)=>(t-om.tms[i])/60000).sort((a,b)=>a-b);
  om.resolutionMin=dt[Math.floor(dt.length/2)];return om;
}
function parseP1(text){
  const p=JSON.parse(text),n=p.timestamp&&p.timestamp.length,r=p.asset_ids&&p.asset_ids.length;
  const v2=p.schema==='overcast_p1_sequence_v2';
  if(!(p.schema==='overcast_p1_sequence_v1'||v2)||!n||!r||new Set(p.asset_ids).size!==r||p.asset_ids.some(a=>typeof a!=='string'||!a.trim())||p.operational!==false)throw new Error('Contrato P1 incompatible o identidades duplicadas.');
  const members=Object.values(p.tcu_groups||{}).flat();
  if(members.length!==r||new Set(members).size!==r||members.some(a=>!p.asset_ids.includes(a)))throw new Error('P1 sin partición TCU explícita y completa.');
  const t=p.timestamp.map(Date.parse);if(t.some((v,i)=>!Number.isFinite(v)||(i&&v<=t[i-1])))throw new Error('Reloj P1 no válido.');
  for(const k of ['theta_exec_deg','theta_baseline_exec_deg','shadow_row_fraction','baseline_shadow_row_fraction'])if(!Array.isArray(p[k])||p[k].length!==n||p[k].some(a=>!Array.isArray(a)||a.length!==r||a.some(v=>!Number.isFinite(v))))throw new Error('Matriz P1 inválida: '+k);
  for(const k of ['poa_effective_w_m2','poa_baseline_effective_w_m2'])if(!Array.isArray(p[k])||p[k].length!==n||p[k].some(v=>!Number.isFinite(v)))throw new Error('Serie P1 inválida: '+k);
  if(!p.provenance||!p.summary||!Number.isFinite(p.summary.poa_wh_m2)||!Number.isFinite(p.summary.baseline_wh_m2))throw new Error('P1 sin procedencia o resumen.');
  if(v2){
    if(!p.objective||!['front_effective','front_plus_rear_effective'].includes(p.objective.mode))throw new Error('P1 v2 sin objetivo explícito.');
    if(!Array.isArray(p.candidate_sets)||p.candidate_sets.length!==n)throw new Error('P1 v2 sin candidatos por instante.');
    p.candidate_sets.forEach((set,i)=>{
      if(!Array.isArray(set)||!set.length)throw new Error('P1 v2 sin candidatos en paso '+i);
      let selected=0;
      for(const c of set){
        if(!Array.isArray(c.theta_deg)||c.theta_deg.length!==r||c.theta_deg.some(v=>!Number.isFinite(v)))throw new Error('P1 v2 candidato angular inválido en paso '+i);
        if(typeof c.safe!=='boolean'||!Number.isFinite(c.transition_total_effective_w_m2))throw new Error('P1 v2 candidato incompleto en paso '+i);
        if(c.selected)selected++;
      }
      if(selected!==1)throw new Error('P1 v2 debe declarar exactamente un candidato seleccionado en paso '+i);
    });
  }
  return p;
}
function mount(el,bridge){
  el.innerHTML=`<style>
    .eng-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.eng-head h2{margin:0}
    .eng-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.eng-kpis>div{border:1px solid #2e4055;border-radius:9px;padding:11px}.eng-kpis b{display:block;font-size:1.25rem;color:#e4edf8;margin-top:5px}.eng-kpis small{color:#a9b9ca;font-size:14px}
    .eng-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.eng-grid canvas,.eng-p1curve{width:100%;height:230px;display:block;background:#101a29;border-radius:9px}.eng-controls{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.eng-controls label{display:grid;gap:5px;color:#9bb0c6;font-size:.75rem}.eng-controls input{width:100px}.eng-controls select{max-width:300px}.eng-wide{grid-column:1/-1}.eng-note{color:#9bb0c6;line-height:1.6;font-size:.78rem;margin:10px 0}.eng-reason{padding:12px 14px;border-left:3px solid #fb923c;background:#182534;line-height:1.6;font-size:.85rem}.eng-table{overflow:auto}.eng-note strong{color:#c8d9ec}.eng-status{white-space:pre-wrap}.eng-grid h3{font-size:.84rem;font-weight:550;color:#dbe8f7;margin:10px 0}
    #engineeringDock .eng-note,#engineeringDock .eng-controls label,#engineeringDock .eng-grid h3{font-size:14px}#engineeringDock .eng-reason{font-size:16px}
    @media(max-width:850px){.eng-grid{grid-template-columns:1fr}.eng-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:450px){.eng-controls input{width:100px}.eng-kpis b{font-size:18px}}
  </style>
  <div class="eng-head"><h2>Decisión adaptativa</h2><button class="btn small acc" data-e="view">Ver en la planta</button></div>
  <div class="eng-kpis" data-e="kpis"></div>
  <details data-e="detail"><summary>¿Por qué este ángulo?</summary>
    <p class="eng-reason" data-e="reason"></p>
    <div class="eng-grid">
      <section><h3>POA útil frente al ángulo · instante seleccionado</h3><canvas data-e="curve" aria-label="POA total y difusa frente al ángulo TCU; regiones rojas con más sombra que la referencia"></canvas><p class="eng-note">Total naranja · difusa azul · rojo: más sombra que baseline · verde: banda casi óptima. Líneas: ejecutado naranja, baseline gris, mejor candidato cian.</p></section>
      <section><h3>Ganancia acumulada frente a baseline</h3><canvas data-e="cumulative" aria-label="Ganancia de POA efectiva acumulada en Wh por metro cuadrado"></canvas><p class="eng-note">Integra el ángulo ejecutado y los tránsitos al minuto. Motor en Wh por TCU, separado de la captación en Wh/m².</p></section>
      <section class="eng-wide"><h3>Hora × ángulo · pulsa para cambiar el instante</h3><canvas data-e="heat" aria-label="Mapa temporal de POA útil y trayectoria ejecutada del tracker"></canvas><p class="eng-note">Brillo: fracción del máximo de cada instante; comparación angular, no irradiancia absoluta. Rojo: sombra adicional. Trazo blanco: trayectoria ejecutada. Noche en oscuro.</p></section>
    </div><div class="eng-table"><table data-e="components"></table></div>
    <p class="eng-note" data-e="quality"></p>
  </details>
  <details data-e="parameters"><summary>Parámetros y alcance</summary><p class="eng-note" data-e="scope"></p><div class="eng-controls">
    <label>Ganancia entrada · W/m²<input data-e="enterGainW" type="number" min="0" step="1" value="4"></label>
    <label>Ganancia mínima salida · W/m²<input data-e="exitLossW" type="number" min="0" step="1" value="2"></label>
    <label>Confirmar · min<input data-e="confirmMin" type="number" min="0" step="5" value="10"></label>
    <label>Permanencia · min<input data-e="dwellMin" type="number" min="0" step="5" value="20"></label>
    <label>Banda casi óptima · W/m²<input data-e="nearOptimalW" type="number" min="0" step=".5" value="2"></label>
    <label>Presupuesto motor · Wh/día<input data-e="motorBudget" type="number" min="0" placeholder="Sin límite"></label>
    <label>Máximo arranques/día<input data-e="maxMoves" type="number" min="0" placeholder="Sin límite"></label>
  </div><p class="eng-note">El presupuesto sirve para rechazar configuraciones durante la calibración. No sustituye al balance de batería, la reserva de seguridad ni al stow por viento. Estos parámetros son hipótesis ajustables, no valores óptimos universales.</p></details>
  <details data-e="study"><summary>Ajustar y validar con otros días</summary>
    <div class="eng-controls"><label>Conjunto de días<select data-e="source"><option value="synthetic">48 días sintéticos reproducibles</option><option value="archive">Archivo meteorológico cargado</option></select></label>
    <label>Cargar datos propios · CSV<input data-e="csv" type="file" accept=".csv,text/csv" style="width:220px"></label></div>
    <p class="eng-note">CSV: <code>timestamp,ghi,dni,dhi</code> y <code>cc</code> opcional (0–1). Hora ISO con zona; W/m². Se interpreta cada registro en su instante, sin desplazarlo. La importación no presupone que sea una medición. El archivo ERA5 del panel anual también queda disponible aquí.</p>
    <div class="eng-controls"><button class="btn acc" data-e="tune">Ajustar y validar</button><button class="btn" data-e="cancel" disabled>Cancelar</button><button class="btn" data-e="apply" disabled>Aplicar candidato</button><button class="btn" data-e="export">Exportar estudio JSON</button><button class="btn" data-e="csvout">Exportar decisiones CSV</button></div>
    <p class="eng-note eng-status" data-e="status" role="status">70 % de días iniciales para ajuste; 30 % posteriores reservados. La selección no consulta la validación. Los días sintéticos sólo ensayan el método.</p>
    <div class="eng-table"><table data-e="ranking"></table></div><div class="eng-table"><table data-e="validation"></table></div>
  </details>
  <details data-e="p1detail"><summary>Importar / usar estudio 3D · P1</summary>
    <p class="eng-note">Importa el resultado del motor 02/03/04/05: cotas y segmentos explícitos, identidad de cada tracker y acoplamiento por TCU. P1 v2 incluye además las alternativas 3D realmente evaluadas por el motor; la interfaz las muestra, no recalcula su física.</p>
    <div class="eng-controls"><label>Resultado P1 · JSON<input data-e="p1file" type="file" accept=".json,application/json" style="width:220px"></label><label>Tracker del estudio<select data-e="p1asset"><option>Sin estudio</option></select></label></div>
    <p class="eng-note" data-e="p1status">Sin datos de cotas e identidad: no se deducen del orden del dibujo.</p>
    <div class="eng-table"><table data-e="p1table"></table></div>
    <div data-e="p1v2" hidden>
      <h3>Candidatos P1 3D · instante seleccionado</h3>
      <canvas data-e="p1curve" class="eng-p1curve" aria-label="Candidatos 3D evaluados por SolarGPT; el eje X muestra el ángulo del activo seleccionado"></canvas>
      <p class="eng-note" data-e="p1note"></p>
      <div class="eng-table"><table data-e="p1candidates"></table></div>
    </div>
  </details>`;
  const $=id=>el.querySelector('[data-e="'+id+'"]');
  let revision=0,busy=false,cancel=false,archive=null,study=null,p1=null,cached=null,lastClock=-1,heatSim=null;
  const keys=['enterGainW','exitLossW','confirmMin','dwellMin','nearOptimalW'];
  const config=()=>Object.fromEntries(keys.map(k=>[k,+$(k).value]));
  const limits=()=>({motorBudgetWh:$('motorBudget').value===''?Infinity:+$('motorBudget').value,maxMoves:$('maxMoves').value===''?Infinity:+$('maxMoves').value});
  function context(){const q=bridge.get();if(!q.sim)return null;const s=q.sim,base=s.res.pvlib;if(!base)return null;
    if(!cached||cached.sim!==s){cached={sim:s,baseline:bridge.metrics(s.dayF,base,s.thNF,s.loop),adaptive:s.res.adaptive?bridge.metrics(s.dayF,s.res.adaptive,s.thNF,s.loop):null};}
    return {...q,...cached};}
  function quality(day){const q=day.quality.filter((_,i)=>day.zen[i]<90),counts={};for(const v of q)counts[v.source]=(counts[v.source]||0)+1;
    return {daylightMinutes:q.length*day.dtMin,missingMinutes:q.filter(v=>!v.valid).length*day.dtMin,dniCappedMinutes:q.filter(v=>v.dniCapped).length*day.dtMin,balanceWarningMinutes:q.filter(v=>v.balanceWarning).length*day.dtMin,sources:counts};}
  function recomputed(){revision++;lastClock=-1;heatSim=null;cached=null;if(busy)cancel=true;
    const q=context();if(!q)return;const a=q.adaptive,b=q.baseline;
    $('scope').textContent=q.title+' · Perez + IAM y sombra en filas planas (1D). Objetivo frontal; trasera diagnóstica. Las cotas y vecinas reales requieren validación P1.';
    $('kpis').innerHTML=[['Ganancia del día',a?signed(100*(a.poaWh/b.poaWh-1),2)+' %':'—','POA frontal / baseline'],['Motor por TCU',a?f(a.motorWh,2)+' Wh':'—','baseline '+f(b.motorWh,2)+' Wh'],['Arranques',a?String(a.moves):'—','baseline '+b.moves],['Guarda de sombra',a?(a.violations?'Revisar':'Sin excesos 1D'):'—','Pendiente de validar en P1']].map(([x,y,z])=>'<div><small>'+x+'</small><b>'+y+'</b><small>'+z+'</small></div>').join('');
    if(study){$('apply').disabled=true;$('status').textContent='La configuración ha cambiado. El estudio exportable conserva sus entradas; vuelve a validar antes de aplicar.';}
    clock();
  }
  function canvas(id){const cv=$(id),box=cv.getBoundingClientRect(),w=Math.max(280,box.width||cv.clientWidth||600),h=230,dpr=root.devicePixelRatio||1;cv.width=w*dpr;cv.height=h*dpr;const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);x.font='11px system-ui';return {cv,x,w,h};}
  function axes(o,xlabel,ylabel){const {x,w,h}=o;x.strokeStyle='#304359';x.strokeRect(48,18,w-64,h-53);x.fillStyle='#9bb0c6';x.fillText(ylabel,8,12);x.fillText(xlabel,w/2-30,h-7);}
  function plot(o,points,X,Y,color,width=2){const x=o.x;x.strokeStyle=color;x.lineWidth=width;x.beginPath();let start=false;for(const p of points){if(!Number.isFinite(p[1])){start=false;continue;}if(start)x.lineTo(X(p[0]),Y(p[1]));else{x.moveTo(X(p[0]),Y(p[1]));start=true;}}x.stroke();}
  function clock(){if(p1)drawP1();if(!$('detail').open)return;const q=context();if(!q)return;const s=q.sim,i=Math.min(s.dayF.n-1,Math.floor(q.minute/s.dayF.dtMin));if(lastClock===i&&heatSim===s)return;lastClock=i;
    const r=s.res[q.policy]||s.res.adaptive||s.res.pvlib,current=r.execF[i],base=s.thNF[i],curve=bridge.curve(s.dayF,i,base,current,config().nearOptimalW);
    const now=bridge.score(s.dayF,i,current),bn=bridge.score(s.dayF,i,s.res.pvlib.execF[i]);
    const di=Math.min(s.day.n-1,Math.floor(q.minute/s.day.dtMin)),dec=s.res.adaptive&&s.res.adaptive.decisions[di],irr=s.dayF.irr[i];
    $('reason').textContent=hour(q.minute)+' · '+bridge.name(q.policy)+' · θ ejecutado '+f(-current)+'° TCU. '+(dec?'Supervisor adaptativo: '+OvercastEngine.REASONS[dec.reason]+'. ':'')+'POA útil '+f(now.total)+' W/m²; '+signed(now.total-bn.total)+' frente a baseline ejecutado. DHI/GHI '+(irr.ghi>0?f(100*irr.dhi/irr.ghi,0)+' %':'—')+'. '+(s.dayF.zen[i]>=90?'Noche: sin óptimo solar.':'Banda a ≤ '+f(config().nearOptimalW)+' W/m² del máximo: '+curve.nearBands.map(b=>'['+f(-b[1])+', '+f(-b[0])+']° TCU').join(' · ')+'.');
    const o=canvas('curve'),max=Math.max(1,...curve.points.map(p=>p.total)),X=t=>48+(t+s.dayF.maxAngle)/(2*s.dayF.maxAngle)*(o.w-64),Y=p=>o.h-35-p/max*(o.h-53);axes(o,'θ TCU · grados','W/m² efectivos');
    for(const p of curve.points){if(!p.safe){o.x.fillStyle='rgba(239,68,68,.25)';o.x.fillRect(X(-p.theta),18,Math.max(1,(o.w-64)*.1/(2*s.dayF.maxAngle)),o.h-53);}}
    o.x.fillStyle='rgba(52,211,153,.16)';for(const b of curve.nearBands)o.x.fillRect(X(-b[1]),18,X(-b[0])-X(-b[1]),o.h-53);
    plot(o,curve.points.map(p=>[-p.theta,p.total]),X,Y,'#fb923c');plot(o,curve.points.map(p=>[-p.theta,p.diff]),X,Y,'#5aa9ff');
    for(const [t,c] of [[current,'#fb923c'],[s.res.pvlib.execF[i],'#9bb0c6'],[curve.best&&curve.best.theta,'#22d3ee']])if(t!==null&&t!==undefined){o.x.strokeStyle=c;o.x.setLineDash([3,4]);o.x.beginPath();o.x.moveTo(X(-t),18);o.x.lineTo(X(-t),o.h-35);o.x.stroke();}o.x.setLineDash([]);
    o.x.fillStyle='#9bb0c6';for(const t of [-s.dayF.maxAngle,0,s.dayF.maxAngle])o.x.fillText(f(t,0),X(t)-10,o.h-20);o.x.fillText(f(max,0),4,24);o.x.fillText('0',30,o.h-35);
    $('components').innerHTML='<tr><th>Componente efectiva</th><th>Ejecutado W/m²</th><th>Baseline W/m²</th></tr>'+[['beam','Directa'],['iso','Isotrópica'],['circ','Circumsolar'],['hor','Horizonte (con signo)'],['ground','Suelo'],['total','Total frontal']].map(([k,n])=>'<tr><td>'+n+'</td><td>'+f(now[k],2)+'</td><td>'+f(bn[k],2)+'</td></tr>').join('');
    const qa=quality(s.dayF);$('quality').textContent='Calidad diurna: '+qa.missingMinutes+' min sin datos externos (relleno sintético sólo para la escena); '+qa.dniCappedMinutes+' min con DNI recortado; '+qa.balanceWarningMinutes+' min con residuo GHI−DHI−DNI·cos(z) > 30 W/m² o 10 %. Fuente: '+Object.keys(qa.sources).join(', ')+'. La bóveda es una reconstrucción orientativa, no una imagen medida del cielo.';
    if(heatSim!==s){drawCumulative(q);drawHeat(q);heatSim=s;}
  }
  function drawCumulative(q){const o=canvas('cumulative'),a=q.adaptive,b=q.baseline;if(!a)return;let sum=0;const v=a.effective.map((p,i)=>[q.sim.dayF.tmin[i],sum+=(p-b.effective[i])*q.sim.dayF.dtMin/60]);const lo=Math.min(0,...v.map(p=>p[1])),hi=Math.max(1,...v.map(p=>p[1]));const X=t=>48+t/1440*(o.w-64),Y=p=>o.h-35-(p-lo)/(hi-lo)*(o.h-53);axes(o,'hora local','Δ Wh/m²');plot(o,[[0,0],[1440,0]],X,Y,'#52677e',1);plot(o,v,X,Y,'#fb923c');o.x.fillStyle='#9bb0c6';o.x.fillText(f(hi,1),2,24);o.x.fillText(f(lo,1),2,o.h-35);for(const h of [0,6,12,18,24])o.x.fillText(String(h),X(h*60)-5,o.h-20);}
  function drawHeat(q){const o=canvas('heat'),d=q.sim.day,st=d.maxAngle,X=t=>48+t/1440*(o.w-64),Y=t=>18+(t+st)/(2*st)*(o.h-53);axes(o,'hora local','θ TCU');
    const stride=Math.max(1,Math.ceil(10/d.dtMin));
    for(let i=0;i<d.n;i+=stride){if(d.zen[i]>=90)continue;const cv=bridge.curve(d,i,q.sim.thN[i],q.sim.thN[i],config().nearOptimalW);const max=Math.max(1,cv.best?cv.best.total:1);for(let k=0;k<cv.points.length;k+=10){const p=cv.points[k],v=Math.max(0,Math.min(1,p.total/max));o.x.fillStyle=p.safe?'hsl('+(235-190*v)+' 65% '+(13+40*v)+'%)':'#752c40';o.x.fillRect(X(d.tmin[i]),Y(-p.theta),Math.max(1,(o.w-64)*d.dtMin*stride/1440+1),Math.max(1,(o.h-53)/(2*st)+1));}}
    const r=q.sim.res.adaptive||q.sim.res.pvlib;plot(o,r.execF.map((t,i)=>[q.sim.dayF.tmin[i],-t]),X,Y,'#fff',1.5);o.x.fillStyle='#a8bad0';for(const h of [0,6,12,18,24])o.x.fillText(String(h),X(h*60)-5,o.h-20);for(const t of [-st,0,st])o.x.fillText(f(t,0),8,Y(t));
  }
  function daysFor(q){
    if($('source').value==='archive'){
      if(!archive)throw new Error('Carga un CSV o el archivo meteorológico del panel anual.');
      const off=q.cfg.tz*3600000,from=new Date(archive.tms[0]+off+86400000).toISOString().slice(0,10),to=new Date(archive.tms.at(-1)+off-86400000).toISOString().slice(0,10),days=[];
      for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000)days.push({date:new Date(t).toISOString().slice(0,10),om:archive,cc:new Array(288).fill(0)});
      return days;
    }
    const year=q.cfg.dateStr.slice(0,4),days=[];
    for(let m=1;m<=12;m++)for(let k=0;k<4;k++){
      const date=year+'-'+String(m).padStart(2,'0')+'-'+String(4+7*k).padStart(2,'0');let cc;
      if(k===0)cc=bridge.clouds('claro');else if(k===1)cc=new Array(288).fill(1);else {cc=bridge.clouds('parcial').map((v,i)=>k===2?v:(i%17<7?.95:.12));}
      days.push({date,cc,om:null});
    }return days;
  }
  function record(q,descriptor,choice){
    const cfg={...q.cfg,dateStr:descriptor.date,cc:descriptor.cc,om:descriptor.om},day=bridge.buildDay(cfg),fine=bridge.buildDay({...cfg,dtMin:1});
    if(fine.quality.some((p,i)=>fine.zen[i]<90&&!p.valid))return null;
    const thN=bridge.baseline(day),thNF=bridge.baseline(fine),reference={thN,thNF};
    const d={...q.diffuse,adaptive:choice.params||q.diffuse.adaptive};
    const br=bridge.evaluate('pvlib',day,fine,d,q.loop,q.motor,reference),b=bridge.metrics(fine,br,thNF,q.loop);
    const rr=choice.key==='pvlib'?br:bridge.evaluate(choice.key,day,fine,d,q.loop,q.motor,reference),a=choice.key==='pvlib'?b:bridge.metrics(fine,rr,thNF,q.loop);
    return {date:descriptor.date,poaWh:a.poaWh,baselineWh:b.poaWh,motorWh:a.motorWh,baselineMotorWh:b.motorWh,moves:a.moves,travelDeg:a.travelDeg,violations:a.violations,baselineViolations:b.violations,shadowMinutes:a.shadowMinutes};
  }
  async function tune(){if(busy)return;const q=bridge.get(),epoch=revision;busy=true;cancel=false;$('tune').disabled=true;$('cancel').disabled=false;$('apply').disabled=true;
    try{
      const list=daysFor(q),split=OvercastEngine.chronologicalSplit(list),choices=[...['pvlib','diffuse_flat','diffuse_limited','diffuse_continuous','diffuse_poa_switch'].map(key=>({id:key,key,params:null,records:[]}))];
      for(const enterGainW of [2,5,10])for(const confirmMin of [5,15])for(const dwellMin of [15,45])choices.push({id:'adaptive_'+enterGainW+'_'+confirmMin+'_'+dwellMin,key:'adaptive',params:{...config(),enterGainW,confirmMin,dwellMin},records:[]});
      let excluded=0;
      // Day-outer loop shares each day's angular matrix across configurations;
      // references become unreachable after each day (bounded memory).
      for(let i=0;i<split.train.length;i++){
        const desc=split.train[i],cfg={...q.cfg,dateStr:desc.date,cc:desc.cc,om:desc.om},day=bridge.buildDay(cfg),fine=bridge.buildDay({...cfg,dtMin:1});
        if(fine.quality.some((p,j)=>fine.zen[j]<90&&!p.valid)){excluded++;continue;}
        const reference={thN:bridge.baseline(day),thNF:bridge.baseline(fine)},br=bridge.evaluate('pvlib',day,fine,q.diffuse,q.loop,q.motor,reference),b=bridge.metrics(fine,br,reference.thNF,q.loop);
        for(const choice of choices){
          if(cancel||revision!==epoch)throw new Error('Estudio cancelado; no se aplica ningún resultado.');
          const rr=choice.key==='pvlib'?br:bridge.evaluate(choice.key,day,fine,{...q.diffuse,adaptive:choice.params||q.diffuse.adaptive},q.loop,q.motor,reference),a=choice.key==='pvlib'?b:bridge.metrics(fine,rr,reference.thNF,q.loop);
          choice.records.push({date:desc.date,poaWh:a.poaWh,baselineWh:b.poaWh,motorWh:a.motorWh,baselineMotorWh:b.motorWh,moves:a.moves,travelDeg:a.travelDeg,violations:a.violations,baselineViolations:b.violations,shadowMinutes:a.shadowMinutes});
        }
        $('status').textContent='Ajuste: '+(i+1)+'/'+split.train.length+' días · '+choices.length+' configuraciones · decisión '+day.dtMin+' min / actuador 1 min';await yieldUI();
      }
      if(choices[0].records.length<2)throw new Error('No hay suficientes días completos para ajustar.');
      const winner=OvercastEngine.selectConfiguration(choices,limits());
      if(!winner)throw new Error('Ninguna configuración pasa los límites de sombra, velocidad, motor y arranques. Revisa el estudio; no se recomienda una consigna.');
      const validation=[];
      for(let i=0;i<split.validation.length;i++){
        if(cancel||revision!==epoch)throw new Error('Estudio cancelado; no se aplica ningún resultado.');
        const r=record(q,split.validation[i],winner);if(r)validation.push(r);else excluded++;
        $('status').textContent='Validación reservada: '+(i+1)+'/'+split.validation.length+' días · candidato fijado '+bridge.name(winner.key);await yieldUI();
      }
      if(validation.length<2)throw new Error('No hay dos días completos en la reserva de validación.');
      const val=OvercastEngine.aggregate(validation),lim=limits();
      const passed=val.gainWh>=-1e-6&&val.violations===0&&validation.every(r=>r.motorWh<=lim.motorBudgetWh&&r.moves<=lim.maxMoves);
      // Sensitivity replays the FIXED candidate, never retunes it on held-out days.
      const sensitivities=[];
      for(const delta of [-.05,.05]){const records=[];for(const desc of split.validation){if(cancel||revision!==epoch)throw new Error('Estudio cancelado.');const r=record({...q,cfg:{...q.cfg,albedo:Math.max(0,Math.min(1,q.cfg.albedo+delta))}},desc,winner);if(r)records.push(r);await yieldUI();}sensitivities.push({albedo:Math.max(0,Math.min(1,q.cfg.albedo+delta)),summary:OvercastEngine.aggregate(records)});}
      study={schema:'overcast_site_study_v1',createdAt:new Date().toISOString(),engine:OvercastEngine.VERSION,version:q.version,site:{plant:q.plant,title:q.title,lat:q.cfg.lat,lon:q.cfg.lon,tz:q.cfg.tz},geometry:{mode:'flat_rows_1d',gcr:q.cfg.gcr,axisAz:q.cfg.axisAz,maxAngle:q.cfg.maxAngle,finite3DValidated:false,rearInObjective:false},objective:'front_effective_poa_after_iam_and_1d_beam_circumsolar_shade',weather:{source:$('source').value==='archive'?archive.source:'synthetic_48_days_v1',resolutionMin:$('source').value==='archive'?archive.resolutionMin:5,excludedDays:excluded},inputs:{cfg:{...q.cfg,om:null,cc:null},diffuse:q.diffuse,loop:q.loop,motor:q.motor,limits:{motorBudgetWh:Number.isFinite(lim.motorBudgetWh)?lim.motorBudgetWh:null,maxMoves:Number.isFinite(lim.maxMoves)?lim.maxMoves:null}},split:{method:'chronological_70_30',train:split.train.map(d=>d.date),validation:split.validation.map(d=>d.date)},training:choices.map(c=>({...c,summary:OvercastEngine.aggregate(c.records)})),winner:{id:winner.id,key:winner.key,params:winner.params},validation:{records:validation,summary:val,passed},sensitivity:{method:'albedo +/- 0.05, fixed candidate, same validation days; not a confidence interval',runs:sensitivities},operational:false};
      $('status').textContent=(passed?'Candidato supera este ensayo: ':'Candidato no supera la validación: ')+bridge.name(winner.key)+'. Ganancia reservada '+signed(val.gainPct,2)+' %; '+val.lossDays+'/'+val.days+' días con pérdida. '+excluded+' días excluidos. '+(study.weather.source==='synthetic_48_days_v1'?'Es un ensayo sintético; no demuestra la ganancia del emplazamiento. ':'La geometría 1D limita la recomendación; falta P1 con cotas e identidades reales.')+' Sensibilidad al albedo: '+sensitivities.map(s=>signed(s.summary.gainPct,2)+' %').join(' / ')+'.';
      const ranked=[...study.training].sort((a,b)=>b.summary.poaWh-a.summary.poaWh);
      $('ranking').innerHTML='<tr><th>Ajuste · configuración</th><th>Δ POA útil</th><th>Motor Wh</th><th>Excesos</th></tr>'+ranked.map(c=>'<tr><td>'+esc(c.id)+(c.id===winner.id?' · seleccionado':'')+'</td><td>'+signed(c.summary.gainPct,2)+' %</td><td>'+f(c.summary.motorWh)+'</td><td>'+c.summary.violations+'</td></tr>').join('');
      $('validation').innerHTML='<tr><th>Validación reservada · mes</th><th>Días</th><th>Δ Wh/m²</th></tr>'+Object.entries(val.monthly).map(([mo,r])=>'<tr><td>'+mo+'</td><td>'+r.days+'</td><td>'+signed(r.poaWh-r.baselineWh)+'</td></tr>').join('');$('apply').disabled=!passed;
    }catch(e){$('status').textContent=e.message;}finally{busy=false;$('tune').disabled=false;$('cancel').disabled=true;}
  }
  function snapshot(){const q=context();if(!q)return null;const s=q.sim,r=s.res.adaptive;return {schema:'overcast_engineering_review_v1',version:q.version,engine:OvercastEngine.VERSION,site:{plant:q.plant,title:q.title,lat:q.cfg.lat,lon:q.cfg.lon},date:q.cfg.dateStr,inputs:{...q.cfg,om:q.cfg.om,diffuse:q.diffuse,loop:q.loop,motor:q.motor},quality:quality(s.dayF),geometry:{mode:'flat_rows_1d',finite3DValidated:false,rearInObjective:false},iam:OvercastEnergy.metadata,sign:'core positive east at axisAz=0; displayed TCU sign is opposite',daily:{timeMin:s.dayF.tmin,weather:s.dayF.irr,baseline:{theta:s.res.pvlib.execF,metrics:q.baseline},adaptive:r?{theta:r.execF,commands:r.theta,decisions:r.decisions,metrics:q.adaptive}:null},study,p1};}
  function drawP1(){if(!p1)return;const q=bridge.get(),t=Date.parse(q.cfg.dateStr+'T00:00:00Z')+(q.minute-q.cfg.tz*60)*60000,T=p1.timestamp.map(Date.parse);let i=-1;for(let k=0;k<T.length;k++)if(T[k]<=t)i=k;const span=T.length>1?T.at(-1)-T.at(-2):60000;
    const site=p1.site&&p1.site.plant_id,match=!site||site===q.plant,v2=p1.schema==='overcast_p1_sequence_v2',obj=v2?p1.objective:null;
    const moveSummary=v2&&Number.isFinite(p1.summary.tcu_travel_deg)?' Movimiento TCU total '+f(p1.summary.tcu_travel_deg,1)+'° · '+p1.summary.tcu_maneuvers+' maniobras. ':'';
    $('p1status').textContent='Procedencia del archivo: '+p1.geometry_source+' · '+p1.engine+' · '+(site||'emplazamiento no declarado')+'. Ganancia integrada '+signed(p1.summary.poa_wh_m2-p1.summary.baseline_wh_m2,3)+' Wh/m². Excesos de sombra: '+p1.summary.shadow_excess_samples+'; transiciones sin candidato: '+p1.summary.no_admissible_transition_samples+'. '+moveSummary+(v2?'Objetivo '+obj.mode+'; trasera '+(obj.rear_authority||'no declarada')+'. ':'')+(!match?'Este estudio corresponde a otra planta. ':'')+'La escena mantiene el escenario seleccionado; el expediente P1 conserva sus cotas y su propio cálculo.';
    if(i<0||t>T.at(-1)+span){$('p1table').innerHTML='<tr><td>El reloj está fuera del intervalo importado: '+esc(p1.timestamp[0])+' → '+esc(p1.timestamp.at(-1))+'</td></tr>';$('p1v2').hidden=true;return;}
    const a=Math.max(0,Math.min(p1.asset_ids.length-1,+$('p1asset').value||0)),group=Object.entries(p1.tcu_groups||{}).find(([,ids])=>ids.includes(p1.asset_ids[a])),dec=p1.decisions&&p1.decisions[i],lock=dec&&dec.locked;
    const tcuId=group?group[0]:null,move=tcuId&&p1.movement_by_tcu&&p1.movement_by_tcu[tcuId],motor=tcuId&&p1.motor_by_tcu&&p1.motor_by_tcu[tcuId]&&p1.motor_by_tcu[tcuId].adaptive;
    const movementSignal=move?(f(move.travel_deg,1)+'° · '+move.maneuvers+' maniobras'+(motor&&Number.isFinite(motor.motor_energy_wh)?' · '+f(motor.motor_energy_wh,2)+' Wh':' · motor no cuantificado')):'—';
    const skySignal=dec?('DHI/GHI '+(Number.isFinite(dec.fd)?f(100*dec.fd,0)+' %':'—')+(Number.isFinite(dec.cloudCover)?' · nube '+f(100*dec.cloudCover,0)+' %'+(Number.isFinite(dec.cloudDelta)?' (Δ '+signed(100*dec.cloudDelta,0)+' pp)':''):' · nube no aportada')):'—';
    $('p1table').innerHTML='<tr><th>Activo / TCU</th><th>θ ejecutado / baseline · TCU</th><th>Sombra / baseline</th><th>POA útil planta / baseline</th><th>Decisión</th><th>Señal cielo</th><th>Movimiento TCU</th></tr><tr><td>'+esc(p1.asset_ids[a])+' / '+esc(group?group[0]:'sin vínculo')+'</td><td>'+f(-p1.theta_exec_deg[i][a])+'° / '+f(-p1.theta_baseline_exec_deg[i][a])+'°</td><td>'+f(100*p1.shadow_row_fraction[i][a],2)+' % / '+f(100*p1.baseline_shadow_row_fraction[i][a],2)+' %</td><td>'+f(p1.poa_effective_w_m2[i])+' / '+f(p1.poa_baseline_effective_w_m2[i])+' W/m²</td><td>'+esc(lock?('CONTROL: '+(dec.constraintSource||'restricción dura')):(dec?(OvercastEngine.REASONS[dec.reason]||dec.reason):'—'))+'</td><td>'+esc(skySignal)+'</td><td>'+esc(movementSignal)+'</td></tr>';
    $('p1v2').hidden=!v2;if(!v2)return;
    const set=p1.candidate_sets[i],chosen=set.find(c=>c.selected)||set[0],rear=set.some(c=>Number.isFinite(c.transition_rear_effective_w_m2));
    $('p1note').textContent='Cada punto es un vector completo de consignas P1; X muestra sólo '+p1.asset_ids[a]+'. Y es captación media durante la maniobra, no una POA instantánea aislada. '+(rear?'La trasera aparece porque el proveedor del contrato la declaró utilizable para este estudio.':'La trasera no entra: el contrato no dispone de una autoridad válida para esta geometría.');
    $('p1candidates').innerHTML='<tr><th>θ '+esc(p1.asset_ids[a])+' · TCU</th><th>Seguro P1</th><th>Frontal</th><th>Trasera</th><th>Total transición</th><th>Origen</th></tr>'+set.map(c=>'<tr'+(c.selected?' class="best"':'')+'><td>'+f(-c.theta_deg[a],1)+'°</td><td>'+(c.safe?'sí':'NO')+'</td><td>'+f(c.transition_front_effective_w_m2,1)+'</td><td>'+f(c.transition_rear_effective_w_m2,1)+'</td><td>'+f(c.transition_total_effective_w_m2,1)+'</td><td>'+esc(c.source||'candidato')+(c.selected?' · ELEGIDO':'')+'</td></tr>').join('');
    const o=canvas('p1curve'),xs=set.map(c=>-c.theta_deg[a]),ys=set.map(c=>c.transition_total_effective_w_m2),xmin=Math.min(...xs)-1,xmax=Math.max(...xs)+1,ymin=Math.min(0,...ys),ymax=Math.max(1,...ys),X=x=>48+(x-xmin)/Math.max(1e-9,xmax-xmin)*(o.w-64),Y=y=>o.h-35-(y-ymin)/Math.max(1e-9,ymax-ymin)*(o.h-53);axes(o,'θ TCU · activo seleccionado','W/m² · transición');
    for(const c of set){const x=X(-c.theta_deg[a]),y=Y(c.transition_total_effective_w_m2);o.x.beginPath();o.x.arc(x,y,c.selected?5:3,0,Math.PI*2);o.x.fillStyle=!c.safe?'#f87272':c.selected?'#fb923c':'#5aa9ff';o.x.fill();}
    o.x.fillStyle='#9bb0c6';o.x.fillText(f(xmin,0),X(xmin)-8,o.h-20);o.x.fillText(f(xmax,0),X(xmax)-8,o.h-20);o.x.fillText(f(ymax,0),2,24);o.x.fillText(f(ymin,0),2,o.h-35);
  }
  function exportCSV(){const q=context();if(!q||!q.sim.res.adaptive)return;const s=q.sim,r=s.res.adaptive;const rows=['# '+q.version+' '+OvercastEngine.VERSION+'; flat_rows_1d; effective frontal POA; no P1 certification','minute,ghi,dni,dhi,theta_baseline_tcu,theta_executed_tcu,poa_baseline_effective_w_m2,poa_adaptive_effective_w_m2,reason,weather_source,weather_valid'];for(let i=0;i<s.dayF.n;i++){const w=s.dayF.irr[i],d=r.decisions[Math.min(r.decisions.length-1,Math.floor(i*s.dayF.dtMin/s.day.dtMin))];rows.push([s.dayF.tmin[i],w.ghi,w.dni,w.dhi,-s.res.pvlib.execF[i],-r.execF[i],q.baseline.effective[i],q.adaptive.effective[i],d.reason,s.dayF.quality[i].source,s.dayF.quality[i].valid].join(','));}bridge.download('overcast_decisiones_'+q.cfg.dateStr+'.csv',rows.join('\n'));}
  $('view').onclick=()=>{bridge.select('adaptive');$('detail').open=true;clock();};
  $('detail').addEventListener('toggle',()=>{lastClock=-1;clock();});
  $('heat').onclick=e=>{const b=$('heat').getBoundingClientRect();bridge.setMinute(Math.max(0,Math.min(1439,Math.round((e.clientX-b.left-48)/(b.width-64)*1440))));};
  for(const k of keys)$(k).onchange=()=>{try{OvercastEngine.config(config());bridge.recompute();}catch(e){$('status').textContent=e.message;}};
  for(const k of ['motorBudget','maxMoves','source'])$(k).onchange=()=>{revision++;cancel=true;$('apply').disabled=true;};
  $('tune').onclick=tune;$('cancel').onclick=()=>{cancel=true;};
  $('apply').onclick=()=>{if(!study||!study.validation.passed)return;const w=study.winner;if(w.params)for(const k of keys)$(k).value=w.params[k];bridge.select(w.key);};
  $('export').onclick=()=>{const s=snapshot();if(s)bridge.download('overcast_estudio_'+s.date+'.json',JSON.stringify(s,null,2),'application/json');};$('csvout').onclick=exportCSV;
  $('csv').onchange=async()=>{try{const file=$('csv').files[0];if(!file)return;const om=parseCSV(await file.text(),file.name);archive=om;$('source').value='archive';bridge.importWeather(om);$('status').textContent=file.name+' · '+om.tms.length+' registros · resolución mediana '+om.resolutionMin+' min. Ajuste y validación usarán sólo días completos.';}catch(e){$('status').textContent=e.message;}};
  $('p1file').onchange=async()=>{try{const file=$('p1file').files[0];if(!file)return;p1=parseP1(await file.text());$('p1asset').innerHTML=p1.asset_ids.map((id,i)=>'<option value="'+i+'">'+esc(id)+'</option>').join('');lastClock=-1;drawP1();clock();}catch(e){$('p1status').textContent=e.message;}};$('p1asset').onchange=()=>{lastClock=-1;drawP1();};
  root.addEventListener('resize',()=>{lastClock=-1;heatSim=null;clock();});
  return {config,recomputed,clock,tune,snapshot,parseCSV,setWeatherArchive(om){archive=om;$('status').textContent='Archivo disponible: '+om.tms.length+' muestras · '+om.source;},getStudy:()=>study};
}
root.OvercastWorkbench=Object.freeze({mount,parseCSV,parseP1});
})(globalThis);
