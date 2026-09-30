import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const Engine=require('../overcast_engine.js');
globalThis.OvercastEngine=Engine;
delete require.cache[require.resolve('../overcast_p1.js')];
const P1=require('../overcast_p1.js');

let ok=0;
function A(x,m){if(!x)throw new Error(m);ok++;}
function sample(){
  const c=(theta,poa,safe=true,excess=0)=>({
    theta_deg:theta,poa_front_effective_w_m2:poa,
    components_w_m2:{beam:poa,isotropic:0,circumsolar:0,horizon:0,ground:0},
    safe,max_shadow_excess_fraction:excess,row_shadow_fraction:[0,0],
    converged:true,convergence_delta_fraction:0
  });
  return {
    schema:'overcast_p1_candidate_surface_v2',operational:false,
    engine:'test',angle_convention:'core_pvlib_positive_east_for_axis_azimuth_0',
    objective:'front_effective_poa',rear_status:'not_validated',rear_votes_in_objective:false,
    site:{plant_id:'P'},asset_ids:['a','b'],asset_row_indices:{a:0,b:1},
    tcu_groups:{T1:['a','b']},
    candidate_config:{angle_step_deg:10,max_angle_deg:55,shadow_excess_tol:0.0001,convergence_tol:0.01,apply_iam:true,iam_n:1.526},
    quality:{all_shadow_runs_converged:true,max_convergence_delta_fraction:0,baseline_shadow_converged:true},
    provenance:{geometry_source:'test'},
    timestamps:[
      {timestamp:'2026-06-21T10:00:00Z',ghi_w_m2:600,dni_w_m2:500,dhi_w_m2:100,tcu:{T1:{asset_ids:['a','b'],baseline_theta_deg:0,current_theta_deg:0,candidates:[c(-10,90),c(0,100),c(10,120),c(20,200,false,.1)]}}},
      {timestamp:'2026-06-21T10:01:00Z',ghi_w_m2:600,dni_w_m2:500,dhi_w_m2:100,tcu:{T1:{asset_ids:['a','b'],baseline_theta_deg:0,current_theta_deg:0,candidates:[c(-10,90),c(0,100),c(10,121),c(20,210,false,.1)]}}},
      {timestamp:'2026-06-21T10:02:00Z',ghi_w_m2:600,dni_w_m2:500,dhi_w_m2:100,tcu:{T1:{asset_ids:['a','b'],baseline_theta_deg:0,current_theta_deg:0,candidates:[c(-10,90),c(0,100),c(10,119),c(20,220,false,.1)]}}}
    ]
  };
}

const p=P1.parse(sample());
A(p.kind==='candidate_surface_v2','parsea P1 v2');
const r=P1.replay(p,'T1',{enterGainW:1,exitLossW:0,confirmMin:0,dwellMin:0,nearOptimalW:0,ghiMin:0});
A(r.decisions[0].theta_deg===10,'elige mejor candidato SEGURO, no el unsafe de 20°');
A(r.decisions.every(d=>d.safe),'ninguna decisión sale de candidatos seguros');
A(r.summary.gain_wh_m2>0,'integra ganancia frente a baseline');
A(r.summary.evidence_gap_steps===0,'sin huecos cuando el grid es estable');
A(r.rear_status==='not_validated','trasera queda declarada fuera');

// Si el ángulo elegido desaparece del siguiente instante no se interpola:
// se declara gap y se vuelve a baseline.
const gap=sample();
gap.timestamps[1].tcu.T1.candidates=gap.timestamps[1].tcu.T1.candidates.filter(c=>c.theta_deg!==10);
const rg=P1.replay(gap,'T1',{enterGainW:1,exitLossW:0,confirmMin:0,dwellMin:0,nearOptimalW:0,ghiMin:0});
A(rg.summary.evidence_gap_steps>=1,'cuenta hueco de evidencia exacta');
A(rg.decisions[1].reason==='P1_EVIDENCE_GAP','el hueco no se interpola');
A(rg.decisions[1].theta_deg===0,'fallback conservador a baseline');

// Guard contractual: una trasera sin validar jamás puede votar.
const rear=sample();rear.rear_votes_in_objective=true;
let threw=false;try{P1.parse(rear);}catch(e){threw=/trasera/i.test(e.message);}
A(threw,'rechaza rear_votes_in_objective=true');

// Guard sombra: no acepta "safe" si el propio candidato declara exceso.
const bad=sample();bad.timestamps[0].tcu.T1.candidates[0].safe=true;bad.timestamps[0].tcu.T1.candidates[0].max_shadow_excess_fraction=.02;
threw=false;try{P1.parse(bad);}catch(e){threw=/safe|sombra/i.test(e.message);}
A(threw,'rechaza evidencia de sombra contradictoria');

console.log('test_overcast_p1:',ok,'checks OK');
