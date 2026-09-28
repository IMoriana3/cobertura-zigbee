/* The Python 02 adapter uses this worker; there is one supervisor, no port. */
'use strict';
const engine=require('../overcast_engine.js');
const readline=require('node:readline');
let control=null;
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  try{
    const q=JSON.parse(line);
    if(q.configure){control=engine.supervisor(q.configure);process.stdout.write(JSON.stringify({engine:engine.VERSION})+'\n');return;}
    if(!control)throw new Error('configure required');
    const scores=new Map(q.samples.map(p=>[JSON.stringify(p.theta),p]));
    const get=theta=>{const p=scores.get(JSON.stringify(theta));if(!p)throw new Error('Missing evaluated candidate');return p;};
    const out=control.step({...q,evaluate:get,admissible:theta=>get(theta).safe});
    process.stdout.write(JSON.stringify(out)+'\n');
  }catch(e){process.stdout.write(JSON.stringify({error:e.message})+'\n');}
});
