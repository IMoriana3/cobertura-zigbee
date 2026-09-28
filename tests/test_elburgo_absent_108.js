const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '../elburgo_layout.json'), 'utf8'));
const at = (rows, ncu, id) => rows.filter(row => row.ncu === ncu && row.id === id);
// Field confirmation 2026-09-28: this locator is scoped to NCU 2.
assert.equal(at(layout.trackers, 2, '108').length, 0);
assert.equal(at(layout.tcuSinMesa, 2, '108').length, 0);
assert.equal(at(layout.trackers, 1, '108').length, 1);
assert.equal(at(layout.tcuSinMesa, 2, '109').length, 1);
assert.match(layout.numeracion.correccionCampo108, /NCU 2 \/ 108 no existe/);
console.log('El Burgo: nonexistent NCU 2/108 excluded; NCU 1/108 and NCU 2/109 preserved: passed');
