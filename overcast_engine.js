/* 02 control / evaluation contracts. No solar, irradiance or shadow physics.
 * Shared by the existing Overcast view and Node/batch adapters. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OvercastEngine=api;})(globalThis,function(){
  'use strict';
  const VERSION='adaptive-supervisor-v2';
  const DEFAULTS=Object.freeze({enterGainW:4,exitLossW:2,confirmMin:10,dwellMin:20,nearOptimalW:2,ghiMin:50});
  const REASONS=Object.freeze({TRACKING:'Seguimiento de referencia',WAIT_CONFIRM:'Esperando persistencia de la ganancia',MIN_DWELL:'Mantiene el modo durante la permanencia mínima',HOLD_NEAR_OPTIMAL:'Retiene: mover apenas mejora la captación',GAIN_CONFIRMED:'Ganancia de POA total confirmada',RECOVER_BEAM:'Recupera seguimiento al reaparecer la directa',LOW_SIGNAL:'Radiación insuficiente para una maniobra adicional',INVALID_WEATHER:'Dato no válido: vuelve a referencia',SHADOW_GUARD:'La sombra obliga a volver a referencia',HARD_CONSTRAINT:'Una restricción superior de CONTROL bloquea la optimización difusa'});
  function config(input={}){
    const c={...DEFAULTS,...input};
    for(const k of Object.keys(DEFAULTS))if(!Number.isFinite(c[k])||c[k]<0)throw new Error('Parámetro inválido: '+k);
    return c;
  }
  function supervisor(input){
    const c=config(input);let mode=false,pending=null,since=0,lastSwitch=-Infinity,lastTime=-Infinity,lastCloud=null;
    return {step(q){
      if(!Number.isFinite(q.t)||q.t<=lastTime)throw new Error('El reloj de control debe crecer');lastTime=q.t;
      let reason='TRACKING',target=q.baseline;
      const cloudCover=Number.isFinite(q.cloudCover)?q.cloudCover:null;
      const cloudDelta=cloudCover!==null&&lastCloud!==null?cloudCover-lastCloud:null;
      if(cloudCover!==null)lastCloud=cloudCover;
      if(q.locked===true){
        const hard=q.hardTarget===undefined?q.baseline:q.hardTarget,vals=Array.isArray(hard)?hard:[hard];
        if(!vals.length||vals.some(v=>!Number.isFinite(v)))throw new Error('CONTROL duro sin target explícito');
        mode=false;pending=null;since=q.t;lastSwitch=q.t;
        return {theta:hard,flag:false,reason:'HARD_CONSTRAINT',mode:'locked',
          gainW:0,pendingSince:null,fd:q.ghi>0?q.dhi/q.ghi:null,
          locked:true,constraintSource:q.constraintSource||'hard_constraint',
          cloudCover,cloudDelta};
      }
      const base=q.evaluate(q.baseline),cur=q.evaluate(q.current);
      const valid=q.valid!==false&&Number.isFinite(base.total)&&Number.isFinite(cur.total);
      const safeCurrent=q.admissible(q.current);
      let best={theta:q.baseline,total:base.total};
      for(const p of (q.candidates||[]))if(p.safe&&Number.isFinite(p.total)&&p.total>best.total+1e-9)best=p;
      const gain=best.total-base.total;
      const inactive=!valid||q.ghi<=c.ghiMin||!safeCurrent;
      if(inactive){
        mode=false;pending=null;
        reason=!valid?'INVALID_WEATHER':q.ghi<=c.ghiMin?'LOW_SIGNAL':'SHADOW_GUARD';
      }else{
        const want=mode ? (gain>c.exitLossW) : (gain>c.enterGainW);
        if(want!==mode){
          if(pending!==want){pending=want;since=q.t;}
          if(q.t-since+1e-9<c.confirmMin)reason='WAIT_CONFIRM';
          else if(q.t-lastSwitch+1e-9<c.dwellMin)reason='MIN_DWELL';
          else {mode=want;pending=null;lastSwitch=q.t;reason=mode?'GAIN_CONFIRMED':'RECOVER_BEAM';}
        }else pending=null;
        if(mode){
          target=pending===false?q.current:best.theta;
          if(best.total-cur.total<=c.nearOptimalW&&cur.total>=base.total-c.exitLossW){target=q.current;if(reason==='TRACKING')reason='HOLD_NEAR_OPTIMAL';}
          else if(reason==='TRACKING')reason='GAIN_CONFIRMED';
        }
      }
      const arr=v=>Array.isArray(v)?v:[v],tt=arr(target),cc=arr(q.current);
      const flat=tt.every(v=>Math.abs(v)<.05),held=tt.length===cc.length&&tt.every((v,i)=>Math.abs(v-cc[i])<.05);
      return {theta:target,flag:mode,reason,mode:mode?(flat?'flat':held?'hold':'intermediate'):'track',gainW:gain,pendingSince:pending===null?null:since,fd:q.ghi>0?q.dhi/q.ghi:null,locked:false,constraintSource:null,cloudCover,cloudDelta};
    }};
  }
  function curve({min,max,step=.1,baseline,current,evaluate,admissible,nearOptimalW=2}){
    if(!(step>0)||!Number.isFinite(min)||!Number.isFinite(max)||max<min)throw new Error('Rejilla angular inválida');
    const values=new Set([baseline,current]);
    for(let k=Math.ceil((min-1e-9)/step);k<=Math.floor((max+1e-9)/step);k++)values.add(Math.round(k*step*1e8)/1e8);
    const points=[...values].filter(t=>t>=min-1e-8&&t<=max+1e-8).sort((a,b)=>a-b).map(theta=>({theta,...evaluate(theta),safe:admissible(theta)}));
    let best=points.find(p=>Math.abs(p.theta-baseline)<1e-8&&p.safe)||null;
    for(const p of points)if(p.safe&&Number.isFinite(p.total)&&(!best||p.total>best.total+1e-9))best=p;
    const near=best?points.filter(p=>p.safe&&p.total>=best.total-nearOptimalW):[];
    // Disjoint bands stay disjoint: never bridge a forbidden shadow interval.
    const bands=[];for(const p of near){const last=bands[bands.length-1];if(last&&p.theta-last[1]<=step*1.01)last[1]=p.theta;else bands.push([p.theta,p.theta]);}
    return {points,best,nearBands:bands,stepDeg:step,nearOptimalW};
  }
  function runCandidateSurface(pkg,input={}){
    if(!pkg||pkg.schema!=='overcast_p1_candidates_v2'||!Array.isArray(pkg.steps)||!pkg.steps.length)throw new Error('Contrato P1 v2 incompatible');
    const slewDegS=Number.isFinite(input.slewDegS)?input.slewDegS:.17,control=supervisor(input),out=[];
    const arr=v=>Array.isArray(v)?v:[v],dist=(a,b)=>Math.max(...arr(a).map((v,i)=>Math.abs(v-arr(b)[i])));
    const moveToward=(from,to,reach)=>arr(from).map((v,i)=>{const d=arr(to)[i]-v;return v+Math.sign(d)*Math.min(Math.abs(d),reach);});
    let current=null,lastT=null,maxProjectionErrorDeg=0;
    for(let i=0;i<pkg.steps.length;i++){
      const step=pkg.steps[i],stamp=Date.parse(step.timestamp),all=step.candidates;
      if(!Number.isFinite(stamp)||!Array.isArray(all)||!all.length)throw new Error('Paso P1 v2 inválido');
      const base=all[step.baseline_candidate];
      if(!base||!Array.isArray(base.theta_by_asset_deg))throw new Error('Baseline P1 v2 inválida');
      if(current===null)current=base.theta_by_asset_deg.slice();
      const nearest=[...all].sort((a,b)=>dist(a.theta_by_asset_deg,current)-dist(b.theta_by_asset_deg,current))[0];
      maxProjectionErrorDeg=Math.max(maxProjectionErrorDeg,dist(nearest.theta_by_asset_deg,current));
      const surrogateCurrent=nearest.theta_by_asset_deg.slice();
      const lookup=theta=>[...all].sort((a,b)=>dist(a.theta_by_asset_deg,theta)-dist(b.theta_by_asset_deg,theta))[0];
      const ctrl=step.control&&typeof step.control==='object'?step.control:null;
      const locked=!!(ctrl&&ctrl.locked===true);
      const hardTarget=locked?ctrl.target_by_asset_deg:undefined;
      if(locked&&(!Array.isArray(hardTarget)||hardTarget.length!==base.theta_by_asset_deg.length||hardTarget.some(v=>!Number.isFinite(v))))throw new Error('Paso P1 v2 bloqueado sin target CONTROL explícito');
      const q={
        t:stamp/60000,
        baseline:base.theta_by_asset_deg,
        current:surrogateCurrent,
        ghi:Number.isFinite(step.ghi)?step.ghi:100,
        dhi:Number.isFinite(step.dhi)?step.dhi:0,
        valid:step.valid!==false,
        cloudCover:Number.isFinite(step.cloud_cover_fraction)?step.cloud_cover_fraction:null,
        locked,
        hardTarget,
        constraintSource:locked?(ctrl.constraint_source||'hard_constraint'):null,
        candidates:all.map(c=>({theta:c.theta_by_asset_deg,total:c.poa_front_effective_w_m2,safe:c.admissible!==false,source:c})),
        evaluate:theta=>({total:lookup(theta).poa_front_effective_w_m2}),
        admissible:theta=>lookup(theta).admissible!==false
      };
      const decision=control.step(q),dtSec=lastT===null?Infinity:Math.max(0,(stamp-lastT)/1000),reach=slewDegS*dtSec;
      if(decision.locked){
        const actualTheta=moveToward(current,decision.theta,reach);
        const limited=dist(actualTheta,decision.theta)>1e-8;
        current=actualTheta.slice();lastT=stamp;
        out.push({...decision,theta:current.slice(),requestedTheta:decision.theta,candidate:null,reason:'HARD_CONSTRAINT',slewLimited:limited,physicsScored:false});
        continue;
      }
      const safe=all.filter(c=>c.admissible!==false&&dist(c.theta_by_asset_deg,current)<=reach+1e-9);
      if(!safe.length){
        lastT=stamp;
        out.push({...decision,theta:current.slice(),requestedTheta:decision.theta,candidate:null,reason:'SLEW_NO_CANDIDATE',slewLimited:true,physicsScored:false});
        continue;
      }
      safe.sort((a,b)=>dist(a.theta_by_asset_deg,decision.theta)-dist(b.theta_by_asset_deg,decision.theta)||b.poa_front_effective_w_m2-a.poa_front_effective_w_m2);
      const actual=safe[0],limited=dist(actual.theta_by_asset_deg,decision.theta)>1e-8;
      current=actual.theta_by_asset_deg.slice();lastT=stamp;
      out.push({...decision,theta:current.slice(),requestedTheta:decision.theta,candidate:actual,reason:limited?'SLEW_CANDIDATE':decision.reason,slewLimited:limited,physicsScored:true});
    }
    return {decisions:out,maxProjectionErrorDeg,objective:pkg.objective,provenance:pkg.provenance};
  }
  function chronologicalSplit(days,fraction=.7){
    const sorted=[...days].sort((a,b)=>a.date.localeCompare(b.date));
    if(sorted.length<4)throw new Error('Se necesitan al menos cuatro días independientes');
    if(new Set(sorted.map(d=>d.date)).size!==sorted.length)throw new Error('Fechas duplicadas: el mismo día no puede aparecer en ajuste y validación');
    const n=Math.max(2,Math.min(sorted.length-2,Math.floor(sorted.length*fraction)));
    return {train:sorted.slice(0,n),validation:sorted.slice(n)};
  }
  function aggregate(records){
    let base=0,value=0,motor=0,baseMotor=0,moves=0,lossDays=0,violations=0;const monthly={};
    for(const r of records){base+=r.baselineWh;value+=r.poaWh;motor+=r.motorWh;baseMotor+=r.baselineMotorWh;moves+=r.moves;lossDays+=r.poaWh<r.baselineWh-1e-6?1:0;violations+=r.violations||0;const mo=r.date.slice(0,7);const m=monthly[mo]||(monthly[mo]={baselineWh:0,poaWh:0,days:0});m.baselineWh+=r.baselineWh;m.poaWh+=r.poaWh;m.days++;}
    return {days:records.length,baselineWh:base,poaWh:value,gainWh:value-base,gainPct:base?100*(value/base-1):null,motorWh:motor,baselineMotorWh:baseMotor,moves,lossDays,violations,monthly};
  }
  function selectConfiguration(runs,{motorBudgetWh=Infinity,maxMoves=Infinity}={}){
    // Only TRAINING records enter this function. A validation result never
    // changes the winner; failed validation means no recommendation.
    const ranked=runs.map(r=>({...r,summary:aggregate(r.records)})).filter(r=>r.summary.violations===0&&r.records.every(d=>d.motorWh<=motorBudgetWh&&d.moves<=maxMoves));
    ranked.sort((a,b)=>b.summary.poaWh-a.summary.poaWh||a.summary.motorWh-b.summary.motorWh||a.id.localeCompare(b.id));
    return ranked[0]||null;
  }
  return Object.freeze({VERSION,DEFAULTS,REASONS,config,supervisor,runCandidateSurface,curve,chronologicalSplit,aggregate,selectConfiguration});
});
