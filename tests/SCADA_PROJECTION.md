# Shared SCADA identity projection

HECHO: the corrected DWG crosswalk resolves 215 tracker references against
IdentityRegistry r1. Geometry, source TCU/PAN declarations and UUIDs are reused.
No identity is assigned by row order, count, coordinates or label similarity.

DECISIÓN: `tools/export_scada_bindings.py` is a build-time adapter consuming
`factiun_core.plant_package.load_package` and the canonical registry resolver.
It exports references, not geometry or telemetry. Both existing viewers consume
the same `scada-projection.js` presentation adapter and the same existing layout.
The source plant locator is the exact name explicitly associated with plant.id
in operational config; NCU scopes are reconciled through declared PAN bindings,
gateway membership and Modbus slave bindings. No prefix/fuzzy matching is used
by the projection. New source aliases require explicit configuration.

The production artifact is `<plant_route>_scada_bindings.json` beside the layout.
Its `layout_sha256` pins the exact layout bytes. Source template/config hashes
are recorded. The exporter verifies the package's canonical manifest using the
existing loader and, for publication, verifies that every package file belongs
to a commit reachable from main. Provisional records remain read_only=true and
operationally_usable=false; this adapter never supplies commands or setpoints.

```sh
PYTHONPATH=/path/to/SolarGPTfull python tools/export_scada_bindings.py \
  --repo-root /path/to/SolarGPTfull \
  --package /path/to/SolarGPTfull/plants/23003 \
  --layout elburgo_layout.json --template elburgo_tcu.json \
  --config /path/to/scada/config/plants.yml \
  --at 2026-09-24T12:00:00+02:00 \
  --published-commit <merged-package-commit> \
  --output elburgo_scada_bindings.json
```

For development use `--development` instead of `--published-commit` and write
outside the published site. Browser loading rejects this unpublished artifact.
There is no URL parameter that bypasses publication in the production loader.

Both consumers validate observation time against the projection's [from,to)
interval. The measured daily layer requires the entire local day in that
interval, and filters source records to the configured plant locator. Duplicate
diagnostic rows make only their affected TCU unknown. A missing diagnostic does
not affect other TCUs. Multiple trackers can explicitly share one TCU.

The 2D adapter reuses existing infrastructure declarations and converts their
coordinates to the same UTM frame; it does not identify equipment by position.
The 3D adapter attaches references before LAYOUT → NODES → TRK. postMessage
includes plant_id, registry_revision and an aware UTC observation instant.

Validation: `node tests/test_scada_projection.js`, `node tests/test_scada_identity.js`.
The Python integration test accepts real registry/config inputs and uses the
canonical IdentityRegistry, not a local replacement. Its small package wrapper
tests the adapter only. The full exporter with canonical load_package was also
run successfully in development mode against PR #273 HEAD 183a97b4, including
the original workbook and all manifest/source hashes. Publication validation
still requires the merged canonical revision.

HECHO: SolarGPTfull #266 and #273 are merged. The runtime projection was
generated with the full publication CLI from commit
5de36d2f6d56ce878299ed95c41e5e1d18d35ad5. The shallow Git snapshot was retrieved
through the authorized GitHub API: the signed commit, trees and local blobs
were checked against their actual Git object hashes before invoking the CLI.
All manifest/source hashes and exact package bytes passed. The production
browser loader also accepts the generated projection with its exact layout.
Provisional/read-only status is unchanged. Targeted canonical tests: 18 passed
for PR #266 and 49 passed for PR #273, 0 failures/skips in the final runs.

NOT_RUN: authenticated browser QA with actual diagnostic/telemetry records.
Publication of these consumer PRs and their deployments still needs verification.

DECISIÓN (28 September): the first measured map layer is daily telemetry log
continuity (%), using the existing CSV aggregation. It is not RF coverage,
online time or expected-sample availability. A continuous blue scale has no
operational good/bad thresholds. scada-projection.js supplies the exact same
color for both consumers. The sender transmits the already computed historical
metrics, local date/timezone and UTC interval; 3D neither recomputes them nor
substitutes diagnostic health. Missing evidence is gray/UNKNOWN. The whole day
must fall within the published binding validity. The historical layer does not
supply an instantaneous measured tilt and therefore uses a neutral visual pose.

The 2D point detail retains map context and provides links to the CSV files.
3D point detail shows continuity, gaps and contributing record IDs.
The integration test in factiun-cartera/tests/test_scada_continuity_handoff.js
exercises actual daily aggregation, the canonical sender and the real 3D
consumer, including plant/NCU isolation and equal values/colors across views.
