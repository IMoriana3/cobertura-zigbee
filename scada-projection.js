/* Read-only presentation adapter. Canonical resolution is performed by the
 * Python exporter, using 06_PLANT. These references are not a new inventory. */
(function(root) {
  'use strict';
  const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
  const key = (n, s) => String(n) + '/' + String(s);
  function validate(p, development) {
    if (!p || p.schema_version !== 1 || !p.plant_id || !p.source_plant ||
        p.read_only !== true || p.operationally_usable !== false || !Array.isArray(p.trackers))
      throw Error('Proyección de identidad inválida');
    if (!development && (!p.publication || p.publication.published !== true ||
        !/^[0-9a-f]{40}$/.test(p.publication.commit || '')))
      throw Error('Identidad pendiente de publicación');
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(String(p.valid_from)) ||
        (p.valid_to !== null && !/(?:Z|[+-]\d{2}:\d{2})$/.test(String(p.valid_to))) ||
        !Number.isFinite(Date.parse(p.valid_from)) ||
        (p.valid_to !== null && (!Number.isFinite(Date.parse(p.valid_to)) || Date.parse(p.valid_to) <= Date.parse(p.valid_from))))
      throw Error('Vigencia de identidad inválida');
    const assets = new Set(), geometry = new Set(), sources = new Map();
    for (const r of p.trackers) {
      if (!uuid(r.tracker_asset_id) || !uuid(r.tcu_asset_id) || !uuid(r.ncu_asset_id) ||
          !r.geometry_binding || assets.has(r.tracker_asset_id) || geometry.has(r.geometry_binding) ||
          p.source_ncus[r.source_ncu] !== r.ncu_asset_id)
        throw Error('Referencias canónicas ambiguas');
      const k = key(r.source_ncu, r.source_slave);
      if (sources.has(k) && sources.get(k) !== r.tcu_asset_id) throw Error('Locator ambiguo');
      sources.set(k, r.tcu_asset_id); assets.add(r.tracker_asset_id); geometry.add(r.geometry_binding);
    }
    return p;
  }
  function validAt(p, at) {
    if (typeof at !== 'number' && !/(?:Z|[+-]\d{2}:\d{2})$/.test(String(at))) return false;
    const t = typeof at === 'number' ? at : Date.parse(at);
    return Number.isFinite(t) && t >= Date.parse(p.valid_from) &&
      (p.valid_to === null || t < Date.parse(p.valid_to));
  }
  function attachLayout(layout, p) {
    const byGeometry = new Map(p.trackers.map(r => [r.geometry_binding, r]));
    const seen = new Set();
    const trackers = layout.trackers.map(t => {
      const r = byGeometry.get(t.idPrevio);
      if (!r || seen.has(t.idPrevio)) throw Error('Plano sin binding geométrico único');
      seen.add(t.idPrevio);
      return Object.assign({}, t, r);
    });
    if (seen.size !== byGeometry.size) throw Error('Plano y proyección de distinta revisión');
    return Object.assign({}, layout, {trackers, plant_id: p.plant_id, scada_identity: p});
  }
  async function load(baseURL, route) {
    // route is an explicit navigation configuration, never a guessed plant name.
    if (!/^[a-z0-9_-]+$/.test(route)) throw Error('Ruta de planta inválida');
    const responses = await Promise.all([
      fetch(baseURL + route + '_scada_bindings.json', {cache:'no-store'}),
      fetch(baseURL + route + '_layout.json', {cache:'no-store'})
    ]);
    if (responses.some(r => !r.ok)) throw Error('Identidad publicada aún no disponible');
    const p = validate(await responses[0].json(), false);
    if (p.plant_route !== route) throw Error('Proyección de otra planta');
    const raw = await responses[1].text();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hash = 'sha256:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    if (hash !== p.layout_sha256) throw Error('Plano e identidad de distinta revisión');
    return {projection:p, layout:attachLayout(JSON.parse(raw), p)};
  }
  function resolveRows(p, rows, sourcePlant, at) {
    const byAsset = new Map(), ambiguous = new Set(), unresolved = [];
    if (sourcePlant !== p.source_plant || !validAt(p, at))
      return {byAsset, unresolved:rows.slice(), reason:'Planta o fecha fuera del binding publicado'};
    const refs = new Map(p.trackers.map(r => [key(r.source_ncu, r.source_slave), r]));
    for (const row of rows) {
      const r = refs.get(key(row.ncu, row.tcu));
      if (!r || (row.tcu_asset_id && row.tcu_asset_id !== r.tcu_asset_id)) {unresolved.push(row); continue;}
      if (byAsset.has(r.tcu_asset_id)) {ambiguous.add(r.tcu_asset_id); unresolved.push(row); continue;}
      byAsset.set(r.tcu_asset_id, Object.assign({}, row, {tcu_asset_id:r.tcu_asset_id, ncu_asset_id:r.ncu_asset_id}));
    }
    for (const id of ambiguous) {unresolved.push(byAsset.get(id)); byAsset.delete(id);}
    return {byAsset, unresolved, reason:null};
  }
  function plan(bundle, previous) {
    const l = bundle.layout, p = bundle.projection;
    // Keep existing infrastructure declarations; coordinate conversion is not
    // identity matching. Trackers come exclusively from the bound DWG layout.
    const move = rows => (rows || []).map(r => {
      if (r.x > 100000 && r.y > 1000000) return r;
      if (!Number.isFinite(previous.ox) || !Number.isFinite(previous.oy))
        throw Error('Infraestructura sin referencia de coordenadas');
      return {...r,x:r.x+previous.ox,y:r.y+previous.oy};
    });
    return {...previous,plant_id:p.plant_id, identity:p, origen:'Plant Package · bindings explícitos · solo lectura',
      ox:0, oy:0,
      tcus:l.trackers.map(t => ({x:t.x+l.cE,y:t.n+l.cN,ncu:t.source_ncu,tcu:t.source_slave,
        etiqueta:(t.aliases && (t.aliases.client || t.aliases.construction)) || t.geometry_binding,
        tracker_asset_id:t.tracker_asset_id,tcu_asset_id:t.tcu_asset_id})),
      ncus:move(previous.ncus),hsus:move(previous.hsus),reps:move(previous.reps)};
  }
  const api = {validate, validAt, attachLayout, load, resolveRows, plan};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScadaProjection = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
