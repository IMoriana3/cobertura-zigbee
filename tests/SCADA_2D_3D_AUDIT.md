# SCADA 2D/3D — attribution and presentation, 2026-09-28

HECHO / BUG: the SCADA screenshot uses the Positions layer (green means deviation ≤2°), while the 3D viewer always used diagnostic Health. These are different variables. A green line is not a whole-plant health verdict; the screenshot also has alarm rings and gray points.

HECHO / LEGACY: `scadaCasar` matched display labels and otherwise nearest coordinates, with a median translation correction and a 6 m tolerance. An unmatched tracker displayed “sin fila … no casado”. It also retained the simulated angle. No asset identity was established by this matching.

DECISIÓN: remove this attribution. The receiver accepts only explicit canonical `tracker_asset_id` → `tcu_asset_id` scene fields and diagnostic `tcu_asset_id`, scoped to the same explicit `plant_id`. The frontend merely joins those supplied references; it does not resolve aliases, create assets or replace IdentityRegistry. Missing or duplicate references remain UNKNOWN; a shared TCU may explicitly drive multiple trackers.

DECISIÓN: version 2 of the existing postMessage handoff supplies plant route, diagnostic date, source rows and selected Positions/Health layer. Both SCADA buttons use it. Validate source window/origin/plant route. Other SCADA variable views open the explicitly labeled Health layer. No historical/RF layer is claimed in 3D.

UI: display plant, date, layer, linked points / scene total, UNKNOWN points and unattached source rows. Explain gray is not evidence of offline. An unknown angle uses an explicitly labeled neutral visual pose, not a simulated pose presented as measured. Positions colors reuse existing 2°/5° UI thresholds; these are not measured-coverage thresholds.

Related sender fix (factiun-cartera): no geographic join when serializing diagnostics; known order-numbered plans cannot show diagnostic colors/angles as spatially verified. Diagnostics remain available by their operational locator outside those map points.

Validation: `node tests/test_scada_identity.js` passes. Sender and existing SCADA suite: 11 scripts pass (12 total across both repositories); inline JavaScript syntax passes. Final FAILED 0, SKIPPED 0. Browser validation against authenticated real diagnostic data NOT_RUN.

UNKNOWN: existing production layouts and diagnostic messages do not supply the required canonical identity projection. This change removes misleading attribution; it does not complete measured map binding or publish Plant Package r1. Current layouts may therefore show all points UNKNOWN. No registry, plant inventory, geometry coordinates, UUIDs, telemetry storage or physical model is changed.
