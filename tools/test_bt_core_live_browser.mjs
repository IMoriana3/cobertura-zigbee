/* A4 browser integration: UI -> /bt/validate -> canonical scene.
 * The endpoint is intercepted with a fixed canonical response. No JS physics
 * is used to fabricate the result.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE } from './pw_navegador.mjs';

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT=8965+(process.pid%25);
let ok=0,fail=0;
const T=(name,cond,detail='')=>{
  if(cond){ok++;console.log('  ✓ '+name+(detail?' · '+detail:''));}
  else{fail++;console.log('  ✗ '+name+(detail?' · '+detail:''));}
};

const envelope=JSON.parse(readFileSync(
  path.join(ROOT,'tests/fixtures/bt-canonical-result.json'),'utf8'));
const payload=JSON.parse(envelope.payload);
const response={
  schema:'bt-validation-response/v1',
  source_sha:payload.source_sha,
  scope:{reference_only:true,operational:false,transition_validated:false,
         global_optimum_proven:false,environment_included:false},
  input_hash:payload.input_hash,
  reference_digest:payload.reference_digest,
  algorithms:{shadow_safe_tangency:payload.algorithm_id||'fixture'},
  samples:[{
    timestamp_utc:payload.frames[0].timestamp_utc,
    asset_id:payload.rows[0].asset_id,
    geometry_rows:[payload.rows[0].geometry_row_index],
    solar_zenith_deg:payload.frames[0].solar_position.apparent_zenith,
    solar_azimuth_deg:payload.frames[0].solar_position.azimuth,
    theta_true_tracking_deg:-24.0,
    theta_bt25d_deg:-25.0,
    theta_shadow_safe_tangency_deg:
      payload.frames[0].receivers[0].theta_command_deg,
    search_status:payload.frames[0].receivers[0].search_status,
    quality_flag:payload.frames[0].receivers[0].quality_flag
  }],
  scene:envelope
};

const srv=spawn('python3',['-m','http.server',String(PORT),'--directory',ROOT],
                {stdio:'ignore'});
await new Promise(r=>setTimeout(r,1000));
const {chromium}=await import('playwright');
const browser=await chromium.launch({
  executablePath:EXE,
  args:['--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage']
});
try{
  const pg=await browser.newPage({viewport:{width:1280,height:850}});
  const calls=[];
  await pg.route('http://core.test/bt/validate',async route=>{
    const req=route.request();
    const body=JSON.parse(req.postData()||'{}');
    calls.push(body);
    await route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify(response)
    });
  });
  await pg.goto(
    `http://127.0.0.1:${PORT}/backtracking.html?limpio&bt_core=`+
    encodeURIComponent('http://core.test/bt/validate'),
    {waitUntil:'load'});
  await pg.waitForFunction(
    ()=>typeof DAY!=='undefined'&&DAY&&DAY.pol&&window.BTCoreLive&&window.BTCanonicalResults,
    null,{timeout:180000});

  T('el panel A4 está montado',await pg.locator('#bt-core-live').count()===1);
  T('la URL del endpoint viene del query',
    await pg.locator('#bt-core-url').inputValue()==='http://core.test/bt/validate');

  await pg.locator('#bt-core-run').click();
  await pg.waitForFunction(
    ()=>document.getElementById('bt-core-state')?.textContent.includes('core '),
    null,{timeout:120000});
  await pg.waitForFunction(
    ()=>!document.getElementById('bt-core-import')?.querySelector('div[hidden]'),
    null,{timeout:30000}).catch(()=>{});

  T('se hizo exactamente un POST al core',calls.length===1,
    'POSTs='+calls.length);
  const body=calls[0]||{};
  T('el request lleva bindings explícitos',
    body.row_asset_bindings&&Object.keys(body.row_asset_bindings).length===body.n_rows);
  T('el request lleva terreno por vano completo',
    Array.isArray(body.pairs)&&body.pairs.length===body.n_rows-1);
  T('el request lleva offset cara-eje y bypass',
    Number.isFinite(body.surface_to_axis_offset_m)&&
    Number.isInteger(body.n_bypass_diodes));
  T('la respuesta se pinta por el consumidor canónico',
    await pg.locator('#bt-core-import table').count()===1);
  T('el modo canónico oculta el simulador-mirror mientras enseña la referencia',
    await pg.locator('#polcard').evaluate(e=>e.hidden||e.style.display==='none'));
  const state=await pg.locator('#bt-core-state').textContent();
  T('la UI muestra la revisión del core',state.includes(payload.source_sha.slice(0,8)),state);

  // Negative control: unsupported axial layout must fail before fetch.
  await pg.locator('#bt-core-import button').filter({hasText:'Volver al simulador'}).click();
  await pg.selectOption('#nsl','tresbolillo');
  const before=calls.length;
  await pg.locator('#bt-core-run').click();
  await pg.waitForFunction(
    ()=>document.getElementById('bt-core-state')?.textContent==='no calculado',
    null,{timeout:30000});
  T('geometría fuera de A4 falla cerrado antes del HTTP',
    calls.length===before);
}finally{
  await browser.close();srv.kill();
}

console.log('\n'+ok+' OK · '+fail+' FAIL');
process.exit(fail?1:0);
