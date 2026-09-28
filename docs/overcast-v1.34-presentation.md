# Overcast v1.34 — scene and landscape

The scene now opens at full width. Configuration uses a separate, collapsible
column; on small screens it enters normal document flow. Canonical references,
model explanations and result sections use native disclosure controls. The
engineering summary remains visible; the rationale, calibration and P1 import
remain available underneath. All 132 existing IDs and 77 original controls keep
their defaults and event wiring.

Synthetic and real layouts now use the same presentation-only landscape:
continuous terrain colour, metre-scale soil detail, a four-metre service road,
and bounded, instanced low vegetation. The terrain beneath trackers stays flat.
The surrounding relief is illustrative, not surveyed topography and is not an
input to shadow or energy calculations. Trackers still come from `seguidor.js`.

No solar, energy or policy calculation changed. The pure physics block is
byte-identical to v1.33. Initial static visible copy falls from 2,308 words to
90; dynamically rendered readings are additional. Explanations remain
accessible rather than being removed from the simulator.

Validation: HTML nesting, original IDs/defaults, script syntax, 122 simulation
checks and the existing engineering contracts. Terrain construction and
geometry are checked with the repository's Three.js on synthetic, Páramo and
San José layouts. Disclosure events are exercised in isolation. The browser
suite is updated for the new controls and samples actual ground geometry rather
than assuming green pixels. Browser pixel/layout validation was unavailable in
this execution environment because Chromium was not installed; it is not
reported as passed.
