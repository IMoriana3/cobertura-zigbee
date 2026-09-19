#!/usr/bin/env node
/* 3.2 — COMPROBACIÓN CRUZADA de la columna nb = 2 de E-D3.
   Esa columna se publicó IMPORTÁNDOLA de la corrida MV 8 de E-D2, con el
   argumento de que forzar T.mv = 8 dejando nb en cfg (= 2) y forzar
   T.nBypass = 2 dejando MV sin forzar (= 8, por if(T.real)) son la misma
   configuración. Son dos RUTAS DE CÓDIGO distintas dentro de mvPara. Aquí se
   comprueba celda a celda.
   Ejecutable:  node audit2/D6_nb2_cruzada.mjs
   Código de salida: 0 si todas las celdas coinciden, 1 si alguna difiere.   */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
const lee = (fich, cab) => { const t = fs.readFileSync(path.join(OUT, fich), 'utf-8').split('\n');
  const i = t.findIndex(l => l.startsWith(cab)); if (i < 0) throw new Error(`no se encuentra "${cab}" en ${fich}`);
  const o = {}; for (let k = i + 1; k < t.length && /^\s{5}\S/.test(t[k]); k++) {
    const m = t[k].trim().match(/^(\S+)\s+([\d.]+)/); if (m) o[m[1]] = m[2]; }
  return { valores: o, cabecera: t[i].trim() }; };
const A = lee('D2_MV8.txt', 'D.2 · MV 8');                      // ruta T.mv  → if(T.mv)return T.mv
const B = lee('D3a.txt',    'D.3 · MV sin forzar (8) · nb 2');  // ruta T.real → if(T.real)return 8
console.log('═'.repeat(92));
console.log(`E-D6 · comprobación cruzada de la columna nb = 2 · commit ${SHA} · node ${process.version}`);
console.log('═'.repeat(92));
console.log(`\nlas dos rutas, backtracking.html:842-845:`);
console.log(`
function mvPara(T,zen){
  if(!T)return 8;
  if(T.mv)return T.mv;        <-- ruta A: la corrida de E-D2 fuerza T.mv = 8
  if(T.real)return 8;         <-- ruta B: la corrida de E-D3 deja MV sin forzar y sale por aquí
`);
console.log(`A · ${A.cabecera}`);
console.log(`B · ${B.cabecera}`);
console.log(`\n  política    A (ruta T.mv)      B (ruta T.real)    ¿coinciden?`);
let malas = 0;
const POL = ['astro','global','row','bt2d','pairwise','true3d','mgl','optimal','optfree'];
for (const k of POL) {
  const a = A.valores[k], b = B.valores[k];
  const ok = a !== undefined && b !== undefined && a === b;
  if (!ok) malas++;
  console.log(`  ${k.padEnd(10)} ${String(a).padStart(15)}    ${String(b).padStart(15)}    ${ok ? 'SÍ, dígito a dígito' : '*** DIFIEREN ***'}`);
}
console.log(`\n  celdas comparadas: ${POL.length} · coinciden: ${POL.length - malas} · difieren: ${malas}`);
console.log(`  coste de la comprobación: ${B.cabecera.match(/(\d+) s/)?.[1] || '?'} s de CPU`);
if (!malas) {
  console.log(`\n  RESULTADO: la importación habría dado EL MISMO número en las nueve celdas.`);
  console.log(`  La regla M.1 se mantiene igualmente: lo que prohíbe no es el número, es publicar`);
  console.log(`  como hecho una equivalencia de rutas que no se ha comprobado. Aquí se ha comprobado.`);
} else console.log(`\n  RESULTADO: hay ${malas} celda(s) con distinto valor. E-D3 debe corregirse.`);
process.exit(malas ? 1 : 0);
