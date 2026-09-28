const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
const layout = read('elburgo_layout.json');
const template = read('elburgo_tcu.json');
// DWG screenshot supplied 2026-09-28 and existing IdentityRegistry bindings:
// these are distinct labels, not a duplicate tracker or a coordinate-based join.
for (const [slave, label] of [[106, '1.18.5'], [108, '1.18.7']]) {
  const trackers = layout.trackers.filter(t => t.ncu === 1 && t.id === String(slave));
  assert.equal(trackers.length, 1);
  assert.equal(trackers[0].idPrevio, label);
  const source = template.tcus.filter(t => t.ncu === 1 && t.slave === slave);
  assert.equal(source.length, 1);
  const pairs = template.cruce.pares.filter(p => p.tcu === source[0].tcu);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].slave, slave);
  assert.equal(pairs[0].idDwg, label);
}
assert.equal(layout.trackers.filter(t => t.idPrevio === '1.18.5').length, 1);
assert.equal(layout.trackers.filter(t => t.idPrevio === '1.18.7').length, 1);
assert.equal(new Set(layout.trackers.map(t => t.idPrevio)).size, layout.trackers.length);
assert.equal(new Set(template.cruce.pares.map(p => p.idDwg)).size, template.cruce.pares.length);
// Input ordering cannot alter the explicit source relationships.
const sourceById = new Map([...template.tcus].reverse().map(t => [t.tcu, t]));
for (const pair of [...template.cruce.pares].reverse()) {
  const source = sourceById.get(pair.tcu);
  assert(source);
  const rows = layout.trackers.filter(t => t.ncu === source.ncu && t.id === pair.idLayout);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].idPrevio, pair.idDwg);
  assert.equal(source.slave, pair.slave);
}
console.log('El Burgo DWG labels and persisted crosswalk: passed');
