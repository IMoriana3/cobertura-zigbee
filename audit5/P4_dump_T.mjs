/* PASO 4.1 · vuelca el T de Ayora tal como lo monta la página (`real` → {}), para validar el esquema del contrato. */
import fs from 'node:fs';
import { cargaSimulador, terrenoComoLaPagina } from './lib_simulador.mjs';
const ROOT=new URL('..',import.meta.url).pathname.replace(/\/$/,''), E=cargaSimulador(ROOT,[]).F;
const datos=JSON.parse(fs.readFileSync(ROOT+'/ayora_cotas.json','utf-8'));
const T=terrenoComoLaPagina(E,datos,80,0).T;
const lim=o=>JSON.parse(JSON.stringify(o,(k,v)=>k==='real'?{}:v));
fs.writeFileSync(process.argv[2],JSON.stringify({ayora:lim(T)}));
