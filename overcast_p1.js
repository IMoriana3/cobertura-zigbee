/* Consumer for SolarGPT overcast_p1_candidate_surface_v2.
 * No solar/shadow physics lives here: it validates evidence and replays the
 * shared causal supervisor. v1 files remain readable as retrospective evidence.
 */
(function(root,factory){
  const api=factory(root.OvercastEngine || (typeof require==="function"?require("./overcast_engine.js"):null));
  if(typeof module==="object"&&module.exports)module.exports=api;else root.OvercastP1=api;
})(globalThis,function(Engine){
  "use strict";
  const V1="overcast_p1_sequence_v1",V2="overcast_p1_candidate_surface_v2";
  const finite=x=>Number.isFinite(+x);
  const unique=a=>new Set(a).size===a.length;

  function parse(input){
    const p=typeof input==="string"?JSON.parse(input):input;
    if(!p||typeof p!=="object")throw new Error("P1: JSON inválido");
    if(p.schema===V1)return parseV1(p);
    if(p.schema===V2)return parseV2(p);
    throw new Error("Contrato P1 incompatible: "+String(p.schema||"sin schema"));
  }
  function explicitPartition(assetIds,groups){
    if(!Array.isArray(assetIds)||!assetIds.length||!unique(assetIds)||assetIds.some(a=>typeof a!=="string"||!a.trim()))
      throw new Error("P1: asset_ids no es una identidad explícita válida");
    const members=Object.values(groups||{}).flat();
    if(members.length!==assetIds.length||!unique(members)||members.some(a=>!assetIds.includes(a)))
      throw new Error("P1: tcu_groups no particiona asset_ids exactamente");
  }
  function parseV1(p){
    const n=p.timestamp&&p.timestamp.length,r=p.asset_ids&&p.asset_ids.length;
    explicitPartition(p.asset_ids||[],p.tcu_groups||{});
    if(!n||!r||p.operational!==false)throw new Error("P1 v1 incompleto");
    const t=p.timestamp.map(Date.parse);
    if(t.some((v,i)=>!finite(v)||(i&&v<=t[i-1])))throw new Error("P1 v1: reloj no válido");
    for(const k of ["theta_exec_deg","theta_baseline_exec_deg","shadow_row_fraction","baseline_shadow_row_fraction"])
      if(!Array.isArray(p[k])||p[k].length!==n||p[k].some(a=>!Array.isArray(a)||a.length!==r||a.some(v=>!finite(v))))
        throw new Error("P1 v1: matriz inválida "+k);
    for(const k of ["poa_effective_w_m2","poa_baseline_effective_w_m2"])
      if(!Array.isArray(p[k])||p[k].length!==n||p[k].some(v=>!finite(v)))
        throw new Error("P1 v1: serie inválida "+k);
    if(!p.provenance||!p.summary)throw new Error("P1 v1 sin procedencia/resumen");
    return {...p,kind:"retrospective_v1"};
  }
  function parseV2(p){
    if(p.operational!==false)throw new Error("P1 v2 debe declarar operational=false");
    if(p.objective!=="front_effective_poa")throw new Error("P1 v2: objetivo no soportado");
    if(p.rear_votes_in_objective!==false)throw new Error("P1 v2: la trasera no validada no puede votar");
    explicitPartition(p.asset_ids||[],p.tcu_groups||{});
    if(!p.provenance||!p.quality||!p.candidate_config)throw new Error("P1 v2 sin procedencia/calidad/config");
    const rows=p.asset_row_indices||{};
    if(Object.keys(rows).length!==p.asset_ids.length||p.asset_ids.some(a=>!Number.isInteger(rows[a])))
      throw new Error("P1 v2 sin binding asset->fila explícito");
    if(!Array.isArray(p.timestamps)||!p.timestamps.length)throw new Error("P1 v2 sin timestamps");
    let last=-Infinity;
    for(const step of p.timestamps){
      const t=Date.parse(step.timestamp);
      if(!finite(t)||t<=last)throw new Error("P1 v2: reloj repetido o desordenado");
      last=t;
      if(!finite(step.ghi_w_m2)||!finite(step.dni_w_m2)||!finite(step.dhi_w_m2))throw new Error("P1 v2: meteo inválida");
      for(const id of Object.keys(p.tcu_groups)){
        const q=step.tcu&&step.tcu[id];
        if(!q||!finite(q.baseline_theta_deg)||!finite(q.current_theta_deg)||!Array.isArray(q.candidates)||!q.candidates.length)
          throw new Error("P1 v2: superficie ausente para "+id);
        if(q.asset_ids.join("\u0000")!==p.tcu_groups[id].join("\u0000"))throw new Error("P1 v2: binding TCU cambió dentro de la serie");
        let prev=-Infinity,hasBaseline=false;
        for(const c of q.candidates){
          if(!finite(c.theta_deg)||c.theta_deg<=prev||!finite(c.poa_front_effective_w_m2)||typeof c.safe!=="boolean")
            throw new Error("P1 v2: candidato inválido/no ordenado");
          prev=c.theta_deg;
          if(Math.abs(c.theta_deg-q.baseline_theta_deg)<1e-8)hasBaseline=true;
          if(!finite(c.max_shadow_excess_fraction)||!Array.isArray(c.row_shadow_fraction))throw new Error("P1 v2: evidencia de sombra inválida");
          if(c.safe&&c.max_shadow_excess_fraction>(p.candidate_config.shadow_excess_tol||0)+1e-9)
            throw new Error("P1 v2: candidato marcado safe con exceso de sombra");
        }
        if(!hasBaseline)throw new Error("P1 v2: falta baseline exacta entre candidatos");
      }
    }
    return {...p,kind:"candidate_surface_v2"};
  }
  function exact(q,theta){
    return q.candidates.find(c=>Math.abs(c.theta_deg-theta)<1e-8)||null;
  }
  function replay(p,tcuId,config={}){
    p=parse(p);
    if(p.schema!==V2)throw new Error("El replay causal requiere P1 v2");
    if(!Engine||typeof Engine.supervisor!=="function")throw new Error("OvercastEngine no disponible");
    if(!p.tcu_groups[tcuId])throw new Error("TCU no existe en P1: "+tcuId);
    const ctl=Engine.supervisor(config),out=[];
    let current=p.timestamps[0].tcu[tcuId].current_theta_deg;
    let firstMs=Date.parse(p.timestamps[0].timestamp),lastMs=null;
    let gainWh=0,baselineWh=0,valueWh=0,degraded=0;
    for(const step of p.timestamps){
      const q=step.tcu[tcuId],ms=Date.parse(step.timestamp);
      const dtMin=lastMs===null?0:(ms-lastMs)/60000;lastMs=ms;
      const base=exact(q,q.baseline_theta_deg);
      let cur=exact(q,current),valid=true;
      if(!cur){cur=base;valid=false;degraded++;}
      const candidates=q.candidates.map(c=>({theta:c.theta_deg,total:c.poa_front_effective_w_m2,safe:c.safe}));
      const byTheta=new Map(q.candidates.map(c=>[String(c.theta_deg),c]));
      const ev=theta=>{
        const hit=byTheta.get(String(theta))||q.candidates.find(c=>Math.abs(c.theta_deg-theta)<1e-8);
        return hit?{total:hit.poa_front_effective_w_m2}:{total:NaN};
      };
      const dec=ctl.step({
        t:(ms-firstMs)/60000,baseline:q.baseline_theta_deg,current:valid?current:q.baseline_theta_deg,
        ghi:step.ghi_w_m2,dhi:step.dhi_w_m2,valid,
        candidates,evaluate:ev,admissible:theta=>{const c=exact(q,theta);return !!(c&&c.safe);}
      });
      const chosen=exact(q,dec.theta)||base;
      current=chosen.theta_deg;
      if(dtMin>0){baselineWh+=base.poa_front_effective_w_m2*dtMin/60;valueWh+=chosen.poa_front_effective_w_m2*dtMin/60;gainWh+=(chosen.poa_front_effective_w_m2-base.poa_front_effective_w_m2)*dtMin/60;}
      out.push({
        timestamp:step.timestamp,theta_deg:current,baseline_theta_deg:q.baseline_theta_deg,
        poa_front_effective_w_m2:chosen.poa_front_effective_w_m2,
        baseline_poa_front_effective_w_m2:base.poa_front_effective_w_m2,
        reason:valid?dec.reason:"P1_EVIDENCE_GAP",mode:valid?dec.mode:"track",
        gain_w_m2:chosen.poa_front_effective_w_m2-base.poa_front_effective_w_m2,
        safe:chosen.safe,evidence_exact:valid
      });
    }
    return {
      schema:"overcast_p1_replay_v1",operational:false,tcu_id:tcuId,
      objective:p.objective,rear_status:p.rear_status,
      decisions:out,summary:{baseline_wh_m2:baselineWh,poa_wh_m2:valueWh,gain_wh_m2:gainWh,
        gain_pct:baselineWh?100*(valueWh/baselineWh-1):null,evidence_gap_steps:degraded}
    };
  }
  return Object.freeze({V1,V2,parse,replay});
});
