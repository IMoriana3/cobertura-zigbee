# SCADA 2D/3D — attribution and presentation, 2026-09-28

HECHO / BUG: the SCADA screenshot uses the Positions layer (green means deviation ≤2°), while the 3D viewer always used diagnostic Health. These are different variables. A green line is not a whole-plant health verdict; the screenshot also has alarm rings and gray points.

HECHO / LEGACY: `scadaCasar` matched display labels and otherwise nearest coordinates, with a median translation correction and a 6 m tolerance. An unmatched tracker displayed “sin fila … no casado”. It also retained the simulated angle. No asset identity was established by this matching.

DECISIÓN: remove this attribution. The receiver accepts only explicit canonical `tracker_asset_id` → `tcu_asset_id` scene fields and diagnostic `tcu_asset_id`, scoped to the same explicit `plant_id`. The frontend merely joins those supplied references; it does not resolve aliases, create assets or replace IdentityRegistry. Missing or duplicate references remain UNKNOWN; a shared TCU may explicitly drive multiple trackers.

DECISIÓN: version 2 of the existing postMessage handoff supplies plant route, diagnostic date, source rows and selected Positions/Health layer. Both SCADA buttons use it. Validate source window/origin/plant route. Other SCADA variable views open the explicitly labeled Health layer. No historical/RF layer is claimed in 3D.

UI: display plant, date, layer, linked points / scene total, UNKNOWN points and unattached source rows. Explain gray is not evidence of offline. An unknown angle uses an explicitly labeled neutral visual pose, not a simulated pose presented as measured. Positions colors reuse existing 2°/5° UI thresholds; these are not measured-coverage thresholds.

Related sender fix (factiun-cartera): no geographic join when serializing diagnostics; known order-numbered plans cannot show diagnostic colors/angles as spatially verified. Diagnostics remain available by their operational locator outside those map points.

Validation: `node tests/test_scada_identity.js` passes. Sender and existing SCADA suite: 11 scripts pass (12 total across both repositories); inline JavaScript syntax passes. Final FAILED 0, SKIPPED 0. Browser validation against authenticated real diagnostic data NOT_RUN.

UNKNOWN: existing production layouts and diagnostic messages do not supply the required canonical identity projection. This change removes misleading attribution; it does not complete measured map binding or publish Plant Package r1. Current layouts may therefore show all points UNKNOWN. No registry, plant inventory, geometry coordinates, UUIDs, telemetry storage or physical model is changed.

## Follow-up: existing crosswalk and scoped field confirmation

HECHO: the manufacturer-template export `elburgo_tcu.json` already persists 215 DWG/TCU crosswalk rows. A development reconciliation against Plant Package r1, using canonical IdentityRegistry.resolve_binding with explicit network_pan → gateway member_of → NCU scope → modbus_slave and geometry_binding → controlled_by, resolves 213 rows. Two layout rows (NCU 1 / 106 and NCU 1 / 108) share geometry locator 1.18.5. This is an integration issue plus a local ambiguity, not evidence that the entire plant lacks correspondence. These results do not publish the provisional package or finish the runtime join.

HECHO / user field confirmation, 2026-09-28: “la 108 de la 2” identifies the nonexistent unit as El Burgo NCU 2 / 108. It does NOT authorize removing NCU 1 / 108. The registry has no Modbus binding for NCU 2 / 108; the drawn tracker list also excludes it. An obsolete entry remained in tcuSinMesa.

BUG corrected in this branch: remove only that explicit NCU 2 / 108 auxiliary-list entry and record the source of the correction in numeracion.correccionCampo108. Keep the raw manufacturer export as historical source evidence. All geometry, NCU 1 / 108, and NCU 2 / 109 remain unchanged. No asset_id is created, removed or reassigned.

Validation: node tests/test_elburgo_absent_108.js and node tests/test_scada_identity.js: PASSED 2 scripts, FAILED 0, SKIPPED 0. Structural comparison confirms all other layout fields are unchanged. Production deployment and end-to-end canonical map integration remain pending; the PR is a draft.

## Correction after viewing the user's DWG screenshot (2026-09-28)

HECHO / BUG: the screenshot shows distinct DWG labels 1.18.5 and 1.18.7. The previous attribution of the duplicate to the DWG was unsupported and is withdrawn. It was the exported JSON idPrevio and the persisted derived crosswalk idDwg that both contained 1.18.5. The existing canonical registry already maps NCU 1 / slave 108 to tracker asset eddb7905-6f8a-40e7-996d-71a11c2db49c, geometry_binding 1.18.7. NCU 1 / 106 retains 1.18.5.

Correction in #765 (also applied to this draft): change only the derived labels for NCU 1 / 108 to 1.18.7. The raw manufacturer telemetry locators, coordinates, PANs, scene geometry and registry UUIDs are unchanged. The canonical development reconciliation now resolves 215/215 crosswalk rows with unique tracker assets; provisional means read_only=true and operationally_usable=false. The historical 213/215 result above describes the defective export before this correction. Runtime publication/integration remains pending.

UNKNOWN: the exact exporter stage that originally copied the wrong label. Do not infer it from nearest-neighbor behavior elsewhere.
