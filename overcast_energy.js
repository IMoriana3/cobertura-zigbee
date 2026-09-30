/* 04 adapter: existing Perez components + generated canonical IAM tables.
 * No duplicate solar position, transposition or shadow solver. */
(function(r){'use strict';
  const tables=typeof module==='object'&&module.exports?require('./overcast_iam.generated.js'):r.OvercastIAM;
  function lookup(name,angle){
    const x=Math.max(0,Math.min(180,angle))*10,k=Math.min(1799,Math.floor(x)),f=x-k,a=tables[name];return a[k]+f*(a[k+1]-a[k]);
  }
  function effective(p,tilt,azimuth,zenith,sunAzimuth,shade=0){
    const R=Math.PI/180,ca=Math.cos(zenith*R)*Math.cos(tilt*R)+Math.sin(zenith*R)*Math.sin(tilt*R)*Math.cos((sunAzimuth-azimuth)*R);
    const aoi=Math.acos(Math.max(-1,Math.min(1,ca)))/R,b=lookup('beam',aoi);
    const beam=p.beam*b*(1-shade),iso=p.iso*lookup('sky',tilt),circ=p.circ*b*(1-shade),hor=p.hor*lookup('horizon',tilt),ground=p.gnd*lookup('ground',tilt);
    return {total:beam+iso+circ+hor+ground,beam,iso,circ,hor,ground,diff:iso+circ+hor+ground,shade};
  }
  const api=Object.freeze({effective,lookup,metadata:tables.metadata});
  if(typeof module==='object'&&module.exports)module.exports=api;else r.OvercastEnergy=api;
})(globalThis);
