#!/usr/bin/env node
/* E.1 — tramo θ 21,75° → 22,00° del caso B, paso 0,01°.
   Entrega fs de PLANOS, fs PUBLICADA, nº de emisores candidatos tras la poda por
   fila receptora, y qué emisor entra o sale.
   La cuenta de candidatos NO existe en el motor: se obtiene ejecutando una COPIA
   INSTRUMENTADA del bloque FÍSICA PURA (en memoria; el fichero del repo no se
   toca) con una sonda insertada justo en la línea de la poda,
   `backtracking.html:2133`  ->  cands.sort((a,b)=>a.adx-b.adx);
   La copia se valida contra el motor original: fs debe coincidir bit a bit.
   Ejecutable:  node audit2/E1_tramo_2175_2200.mjs
   Salida: audit2/out/E1.csv + resumen por stdout                              */
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { motorDe, CANON, caso, echo } from './lib_motor.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'audit2', 'out');
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

const F = motorDe('HEAD'), T = caso(F, 'B');
console.log(echo('E-E1 · tramo θ 21,75→22,00 del caso B, paso 0,01°', F, T).texto);
const g = F.solarPos(CANON.instanteUTC, CANON.lat, CANON.lon);
const irr = F.clearskyIneichen(g.zen, CANON.doy, CANON.alt, CANON.tl);

/* ── copia instrumentada ───────────────────────────────────────────────── */
const html = fs.readFileSync(path.join(ROOT, 'backtracking.html'), 'utf-8');
const i0 = html.indexOf('FÍSICA PURA'), i1 = html.indexOf('/* FIN-FÍSICA'), j0 = html.lastIndexOf('/*', i0);
const sol = fs.readFileSync(path.join(ROOT, 'sol.js'), 'utf-8') + '\n' + fs.readFileSync(path.join(ROOT, 'irradiancia.js'), 'utf-8');
let src = html.slice(j0, i1);
const ANCLA = 'cands.sort((a,b)=>a.adx-b.adx);';
const nAnclas = src.split(ANCLA).length - 1;
if (nAnclas !== 1) throw new Error(`el ancla de la sonda aparece ${nAnclas} veces; se esperaba 1`);
src = src.replace(ANCLA, 'if(globalThis.__SONDA)globalThis.__SONDA(r,cands);' + ANCLA);
const FI = new Function(sol + '\n' + src + `return { shadeBand3DAll, poaPlant };`)();
console.log(`\nsonda insertada en la ÚNICA aparición de \`${ANCLA}\` (backtracking.html:2133), dentro de shadeBand3DAll.`);
console.log(`La poda que la precede es backtracking.html:2115-2132 (ventana axial con \`slack\`); la poda del\n` +
            `lado opuesto al sol y el marchador de terreno están en 2134-2141, y el descarte de cajas detrás\n` +
            `del plano receptor en 2160-2171 (\`detras(bx)\`, sólo con estructura: \`if(!noStruct)\`).`);

const fsPlanos = (Fx, ang) => { const sh = Fx.shadeBand3DAll(g.zen, g.az, T, ang, { noStruct: true }); let p = 0;
  for (let r = 0; r < 6; r++) { const de = sh.de && sh.de[r] ? sh.de[r] : [];
    p = Math.max(p, Math.min(sh[r], de.filter(q => q[0] !== 'terreno').reduce((a, q) => a + q[1], 0))); } return p; };
const fsPub = (Fx, ang) => { const sh = Fx.shadeBand3DAll(g.zen, g.az, T, ang); let p = 0;
  for (let r = 0; r < 6; r++) p = Math.max(p, sh[r]); return p; };

const TH = []; for (let t = 21.75; t <= 22.0 + 1e-12; t += 0.01) TH.push(+t.toFixed(4));
const filas = [], reg = [];
let maxD = 0;
for (const th of TH) {
  const ang = new Array(6).fill(th);
  const p0 = fsPlanos(F, ang), q0 = fsPub(F, ang);
  const cnt = new Array(6).fill(0), emis = new Array(6).fill(null).map(() => new Set());
  globalThis.__SONDA = (r, cands) => { cnt[r] = cands.length; for (const c of cands) emis[r].add(c.pl.e); };
  const p1 = fsPlanos(FI, ang);
  globalThis.__SONDA = null;
  maxD = Math.max(maxD, Math.abs(p0 - p1));
  reg.push({ th, p0, q0, cnt: cnt.slice(), emis: emis.map(s => [...s].sort((a, b) => a - b)) });
  filas.push([th, (100*p0).toFixed(6), (100*q0).toFixed(6), cnt.join(' '), emis.map(s => '[' + [...s].sort((a,b)=>a-b).join(' ') + ']').join(' ')].join(','));
}
console.log(`\nvalidación de la copia instrumentada: |Δ fs PLANOS| máximo frente al motor original = ${maxD.toExponential(3)}  ⇒ ${maxD === 0 ? 'IDÉNTICA bit a bit' : 'DIFIERE'}`);
console.log(`\n   θ        fs PLANOS    fs PUBLICADA   Δ(pub−planos)   candidatos tras poda, por fila receptora [0..5]`);
for (const x of reg)
  console.log(`  ${x.th.toFixed(2)}°  ${(100*x.p0).toFixed(4).padStart(9)} %  ${(100*x.q0).toFixed(4).padStart(9)} %  ${(100*(x.q0-x.p0)).toFixed(4).padStart(11)} pp   ${x.cnt.join(' ')}`);
console.log(`\nemisores candidatos por fila receptora (índice de fila emisora, tras la poda):`);
for (const x of reg) console.log(`  ${x.th.toFixed(2)}°  ` + x.emis.map((s, r) => `r${r}:[${s.join(',')}]`).join('  '));
console.log(`\nCAMBIOS de la lista de emisores entre θ consecutivos:`);
let cambios = 0;
for (let i = 1; i < reg.length; i++) for (let r = 0; r < 6; r++) {
  const a = reg[i-1].emis[r].join(','), b = reg[i].emis[r].join(',');
  if (a !== b) { cambios++;
    const sa = new Set(reg[i-1].emis[r]), sb = new Set(reg[i].emis[r]);
    const entra = reg[i].emis[r].filter(e => !sa.has(e)), sale = reg[i-1].emis[r].filter(e => !sb.has(e));
    console.log(`  ${reg[i-1].th.toFixed(2)}° → ${reg[i].th.toFixed(2)}°  fila receptora ${r}: ${entra.length ? 'ENTRA ' + entra.join(',') : ''}${sale.length ? ' SALE ' + sale.join(',') : ''}  (${a} → ${b})`); }
  if (reg[i-1].cnt[r] !== reg[i].cnt[r] && a === b)
    console.log(`  ${reg[i-1].th.toFixed(2)}° → ${reg[i].th.toFixed(2)}°  fila receptora ${r}: MISMOS emisores, nº de candidatos ${reg[i-1].cnt[r]} → ${reg[i].cnt[r]} (cambia un TRAMO, no una fila)`);
}
if (!cambios) console.log(`  ninguno: la lista de filas emisoras candidatas es CONSTANTE en todo el tramo.`);
fs.writeFileSync(path.join(OUT, 'E1.csv'), 'theta_deg,fs_planos_pct,fs_publicada_pct,candidatos_por_fila,emisores_por_fila\n' + filas.join('\n') + '\n');
console.log(`\nCSV: audit2/out/E1.csv (${filas.length} filas)`);
