# Communications topology, coverage and routing audit

## Audit identity

| Field | Value |
|---|---|
| TASK_ID | `08-COMMS__cobertura-zigbee` |
| TARGET_CHAT | `08_COMMS` |
| Repository | `cobertura-zigbee` |
| Audited base branch | `work` (the checkout has no local or remote `main` ref) |
| Audited base commit | `080cee58670f732aae2b24ffb7c0e058e122938d` |
| Audit date | `2026-09-21` |
| Audit status | `COMPLETE` |
| Audit mode | Audit-only; this report is the sole authorized persistence change |

## 1. Executive findings

This repository contains four distinct communications domains which must not be conflated:

1. **Field acquisition:** PowerShell collectors discover Digi/XBee routers and capture RSSI, online state, ACK counters, gateway health and source routes.
2. **Measured-mesh reconstruction:** `index.html` turns captured route snapshots into hop depth, route-through counts, articulation points, dominant parents and a period-summary GeoJSON. `tools/malla_medida.py` is an older adapter for already aggregated CSVs.
3. **Configured plant inventory:** layouts, SCADA/toolbox ranges and generated coordinate manifests describe which TCU, HSU, NCU, gateway and repeater should exist and where they are expected.
4. **RF planning/calibration:** local Python code designs field sweeps and fits censored observations, but the canonical link-budget and obstruction physics is imported from the absent sibling repository `cobertura-rf-fv`.

Principal conclusions:

- The repository does **not** implement Zigbee route selection. It observes `xbee source_route` results and derives analytics from them.
- RSSI is a **measured last-hop value**, not a coordinator-distance coverage value. The static mesh attaches a node-period median RSSI to the node's inferred dominant-parent edge; that attachment is an approximation when parents change.
- The exported “real mesh” is a **dominant-parent period-summary tree**, not an instantaneous mesh, neighbor table, configured topology or RF prediction.
- The checked-in collectors conflict with the authoritative schema contract: they write local, zone-less timestamps and omit `schema_version`, while schema v2 requires UTC `Z` and a version on every row. This is a **BUG**.
- No Zigbee LQI acquisition or model was found. Coverage quality uses RSSI, online state and ACK failures only.
- The browser's measured-topology analysis is the current canonical implementation. The Python measured-GeoJSON utility is an adapter/legacy path and consumes a different abstraction.
- The actual RF path-loss model is external. This checkout cannot certify transmit power, sensitivity, path-loss, Fresnel, obstruction or margin calculations without `cobertura-rf-fv`.
- All ten checked-in RF sweep sheets are plans with empty `rssi_medido_dbm` and `llega` fields. They contain no completed calibration campaign.
- `elburgo_real.geojson` is the only checked-in measured aggregate. It reports 406,457 route rows, 8,053 snapshots, 53 nodes and 52 edges, but the current configured El Burgo inventory has 219 nodes. Its scope and generation provenance are not reproducible locally.
- Plant inventory generation deliberately mixes explicit configuration with disclosed inference: HSU quota/distance allocation, nearest-NCU/GW fallbacks, numeric-ID matching and a 20 m cable rule must never be presented as measured topology.

## 2. Classification model

Every audited item is classified using these dimensions:

- Logic: `PHYSICAL_CALCULATION`, `APPROXIMATION`, `DESIGN_RULE`, `MEASURED_DATA`, `CONFIGURED_TOPOLOGY`, or `INFERRED_TOPOLOGY`.
- Implementation role candidate: `CANONICAL`, `MIRROR`, `ADAPTER`, or `LEGACY`.
- Discrepancy: `INTENTIONAL`, `APPROXIMATION`, `LEGACY`, `BUG`, or `UNKNOWN`.

## 3. Complete implementation inventory

### 3.1 Acquisition and data contracts

| File / symbol | Responsibility | Logic classification | Role candidate |
|---|---|---|---|
| `zigbee_logger.ps1` / `$Gateways`, `Invoke-RCI`, discovery loop | Multi-gateway Digi RCI discovery and per-node querying | `MEASURED_DATA` acquisition | `ADAPTER` |
| `zigbee_logger.ps1` / radio mapping | Maps device types to TCU/HSU, converts Digi RSSI magnitude to negative dBm and records ACK/supply/temperature/network address | `MEASURED_DATA` | `ADAPTER` |
| `zigbee_logger.ps1` / `Gw-Carga*` | Regex extraction of gateway CPU, memory and uptime with raw-response fallback | `MEASURED_DATA` plus `APPROXIMATION` | `ADAPTER` |
| `zigbee_routes_logger.ps1` / `Get-NodeMacs` | RCI discovery of router-type nodes | `MEASURED_DATA` | `ADAPTER` |
| `zigbee_routes_logger.ps1` / `TelnetRead`, `ParseRoute` | Telnet negotiation and parsing of `xbee source_route` | `MEASURED_DATA` | `ADAPTER` |
| `zigbee_routes_logger.ps1` / route loop | Writes hop count and coordinator-to-target IDs/addresses | `MEASURED_DATA` | `ADAPTER` |
| `zigbee_inventario.ps1` | Field inventory/configuration capture | `MEASURED_DATA` / `CONFIGURED_TOPOLOGY` observation | `ADAPTER` |
| `zigbee_angulos.ps1` | RF sweep acquisition paired with tracker angle/Modbus state | `MEASURED_DATA` | `ADAPTER` |
| `docs/contrato_datos_zigbee.md` | Normative schemas, units, keys, UTC and legacy-reading rules | `DESIGN_RULE` | `CANONICAL` |

### 3.2 Browser topology and visualization

| File / symbol | Responsibility | Logic classification | Role candidate |
|---|---|---|---|
| `index.html` / `parseCSV`, `objs` | CSV parser/row adapter | `ADAPTER` concern | `CANONICAL` for browser ingestion |
| `index.html` / `normalizaTs`, `nuevoLectorTs` | v2 UTC validation and v1 plant-timezone/DST conversion | `DESIGN_RULE` | `CANONICAL` |
| `index.html` / `filasDeLog` | Converts logger rows to typed observations | `MEASURED_DATA` adapter | `CANONICAL` |
| `index.html` / `snapsDeRutas` | Parses paths and aggregates parent counts, hops, edge use and distinct dependent destinations | `INFERRED_TOPOLOGY` from `MEASURED_DATA` | `CANONICAL` |
| `index.html` / `articulationPoints` | Tarjan articulation points over an undirected observed graph | `INFERRED_TOPOLOGY` | `CANONICAL` |
| `index.html` / per-snapshot `depth`, `crit`, `pathByTarget`, `spof` | Instantaneous route/hop/criticality representation | `MEASURED_DATA`-derived and `INFERRED_TOPOLOGY` | `CANONICAL` |
| `index.html` / `mallaReal` | Period dominant-parent tree, median RSSI/hops, last ACK counter and static GeoJSON | `INFERRED_TOPOLOGY` / `APPROXIMATION` | `CANONICAL` |
| `index.html` / `medianaDe` | Rounded integer median | `APPROXIMATION` | `CANONICAL` |
| `index.html` / `distM` | Equirectangular small-area distance rounded to metres | `APPROXIMATION` | `CANONICAL` |
| `index.html` / `readingAt`, `snapAt` | Carries last RSSI/route observation forward; first route snapshot is used before its time | `APPROXIMATION` | `CANONICAL` |
| `index.html` / `buildFrames` | ACK deltas; negative reset/wrap deltas clamp to zero | `APPROXIMATION` | `CANONICAL` |
| `index.html` / `colRSSI`, `colACK`, `colHops`, `colCrit`, `colPersist` | Presentation thresholds | `DESIGN_RULE` | `CANONICAL` UI policy |
| `index.html` / `routePath`, `gwPos` | Route polyline using NCU geometry or movable gateway point | `APPROXIMATION` | `CANONICAL` visualization |
| `index.html` / `CABLE_M` | Infers HSU cable connection from 20 m separation | `DESIGN_RULE` + `INFERRED_TOPOLOGY` | `MIRROR` |

### 3.3 Measured-mesh Python path

| File / symbol | Responsibility | Logic classification | Role candidate |
|---|---|---|---|
| `tools/malla_medida.py` / `main` | Converts already aggregated node/edge CSVs to measured GeoJSON | `MEASURED_DATA` adapter | `LEGACY` / `ADAPTER` |
| `tools/malla_medida.py` / coordinate matching | Joins `(NCU, slave, role)` to generated plant inventory | `CONFIGURED_TOPOLOGY` adapter | `ADAPTER` |
| `tools/malla_medida.py` / fallback distance | Local metres-per-degree distance rounded to 0.1 m | `APPROXIMATION` | `LEGACY` / `ADAPTER` |

The Python utility does not mirror the browser algorithm: it expects dominant-parent, hops, descendants and edge metrics to have already been calculated. It has no dynamic snapshot or articulation computation.

### 3.4 Configured inventory and topology generation

| File / symbol | Responsibility | Logic classification | Role candidate |
|---|---|---|---|
| `tools/gen_coords_cobertura.py` / `puntos` | Converts layout trackers to TCU coordinates at the motor beam | `CONFIGURED_TOPOLOGY` | `ADAPTER` |
| `tools/gen_coords_cobertura.py` / numbering loop | Per-NCU slave/node numbering and explicit holes for removed TCUs | `CONFIGURED_TOPOLOGY` | `ADAPTER` |
| `tools/gen_coords_cobertura.py` / `gateways` and SCADA ranges | Imports NCU/GW/slave scope and NCU/Digi endpoints | `CONFIGURED_TOPOLOGY` | `ADAPTER` |
| `tools/gen_coords_cobertura.py` / overlapping gateway range choice | Selects lowest gateway and warns that it is not data | `APPROXIMATION` | `ADAPTER` |
| `tools/gen_coords_cobertura.py` / `reparte_hsus` | Quota-constrained minimum-distance HSU-to-NCU assignment | `INFERRED_TOPOLOGY` | `ADAPTER` |
| `tools/gen_coords_cobertura.py` / `cerca_ncu`, `gw_cerca` | Nearest-NCU/GW fallback | `APPROXIMATION` / `INFERRED_TOPOLOGY` | `ADAPTER` |
| `tools/gen_coords_cobertura.py` / `CABLE_M` | HSU wired/radio classification at 20 m | `DESIGN_RULE` / `INFERRED_TOPOLOGY` | `MIRROR` |
| `tools/gen_coords_cobertura.py` / `genera` | Emits plant, NCU and gateway measurement scopes/manifests | `CONFIGURED_TOPOLOGY` | `ADAPTER` |
| `tools/reps_ncu.mjs` / `CONTRATO` | Local transcription of Ayora repeater NCU/GW/slave truth from SCADA and two Excel sources | `CONFIGURED_TOPOLOGY` | `MIRROR` |
| `tools/reps_ncu.mjs` / repeater 4 | Provisional unsourced gateway, deliberately not written to layout | `APPROXIMATION` | `ADAPTER` |
| `tools/reps_ncu.mjs` / `derivaReps`, `MARGEN_MIN=2.51` | Nearest-tracker NCU inference and confidence ratio | `INFERRED_TOPOLOGY` / `DESIGN_RULE` | `ADAPTER` |
| `*_layout.json` | Plant assets, tracker/NCU/HSU/repeater positions and assignments | `CONFIGURED_TOPOLOGY` | `CANONICAL` only for the generated local plant view; source documents remain external |
| `cobertura_coords/**/coords_*.csv` | Generated field-measurement inventories/scopes | `CONFIGURED_TOPOLOGY` plus disclosed inference | `MIRROR` / generated `ADAPTER` output |
| `cobertura_coords/**/manifiesto_*.json` | Counts, scope, source and assignment provenance | `CONFIGURED_TOPOLOGY` metadata | `MIRROR` / generated output |
| `plantas_indice.json` | Generated plant code, CRS, center, timezone and mounting metadata | `CONFIGURED_TOPOLOGY` | `MIRROR` / generated output |
| `*_networks.json` | Civil/electrical trenches/cabling from design drawings | `CONFIGURED_TOPOLOGY`, but **not Zigbee topology** | `MIRROR` |

### 3.5 RF planning, geometry and calibration

| File / symbol | Responsibility | Logic classification | Role candidate |
|---|---|---|---|
| `tools/plan_barrido_rf.py` / external import | Loads sibling `cobertura-rf-fv/python/zigbee_pv_model.py` | External `PHYSICAL_CALCULATION` | local `ADAPTER`; external core `CANONICAL` candidate |
| `tools/plan_barrido_rf.py` / `HTUBE`, `DROP`, `H_NCU`, `H_TCU` | Catalog antenna-height inputs | `CONFIGURED_TOPOLOGY` / design inputs | `ADAPTER` |
| `tools/plan_barrido_rf.py` / `cotas`, `cota_en` | Nearest surveyed terrain row using anisotropic distance | `APPROXIMATION` | `ADAPTER` |
| `tools/plan_barrido_rf.py` / `mesas_entre` | Builds crossed-table bands and passes them to external physics | `PHYSICAL_CALCULATION` on approximate geometry | `ADAPTER` |
| `tools/plan_barrido_rf.py` / `margen` | Calls external `predict_link` | `PHYSICAL_CALCULATION` | `ADAPTER` |
| `tools/plan_barrido_rf.py` / `clase`, bins, `DMAX`, pair counts | Selects geometrically diverse commissioning pairs | `DESIGN_RULE` | `ADAPTER` |
| `tools/calibra_barrido.py` / likelihood and optimizer | Censored/Tobit-like fitting including failed links | `PHYSICAL_CALCULATION` / statistical model | `ADAPTER` |
| `tools/calibra_barrido.py` / `l_mod_db`, `l_roce_db`, `offset_db`, `sigma_db` | Four-parameter plant calibration | `APPROXIMATION` to the physical RF environment | `ADAPTER` |
| `cobertura_coords/*/barrido_*.csv` | Planned RF campaigns with expected geometry/margins | `DESIGN_RULE`; currently not `MEASURED_DATA` | generated `MIRROR` |
| `elburgo_real.geojson` | Historical measured topology and legacy calibration | `MEASURED_DATA` plus `INFERRED_TOPOLOGY` | `LEGACY` data product |

No JavaScript path-loss implementation exists. The browser visualizes measured/static RSSI and routing; it is not a mirror of `zigbee_pv_model`.

### 3.6 Plant-specific embedded inventory

The generated manifests cover Ayora, Bagnarelli, Benante, El Burgo, Fayón, Panbianco, Páramo, Polvorín, San José and Túnez. Observed manifest totals include:

| Plant | Nodes | TCU | HSU | Repeaters | NCU | Distinct GW numbers | HSU assignment provenance |
|---|---:|---:|---:|---:|---:|---:|---|
| Ayora | 766 | 751 | 10 | 5 | 16 | 1 | Explicit layout NCU/GW |
| Bagnarelli | 19 | 17 | 2 | 0 | 1 | 1 | Explicit layout NCU/GW; one cable HSU |
| Benante | 734 | 730 | 4 | 0 | 6 | 6 | Explicit layout NCU; gateway declarations absent from SCADA manifest |
| El Burgo | 219 | 215 | 4 | 0 | 2 | 2 | Explicit layout NCU/GW |
| Fayón | 25 | 24 | 1 | 0 | 1 | 1 | Explicit layout NCU/GW; cable HSU |
| Panbianco | 1,484 | 1,476 | 6 | 2 | 12 | 12 | Explicit layout NCU; gateway declarations absent from SCADA manifest |
| Páramo | 399 | 396 | 3 | 0 | 4 | 2 | Explicit layout NCU; gateway declarations absent from SCADA manifest |
| Polvorín | 121 | 119 | 2 | 0 | 2 | 2 | Explicit layout NCU; gateway declarations absent from SCADA manifest |
| San José | 2,306 | 2,289 | 8 | 9 | 21 | 2 | Explicit layout NCU/GW |
| Túnez | 20 | 19 | 1 | 0 | 1 | 1 | Explicit layout NCU/GW; cable HSU |

`gws` in these manifests is the count of distinct gateway numbers, not necessarily the count of physical Digi units across all NCUs.

## 4. Topology, routing and hop findings

### 4.1 Observed route model

The route collector treats an unlabeled first parsed hop as `COORD`, preserves the remaining node labels/16-bit addresses in coordinator-to-destination order, and calculates hops as path node count minus one. This is `MEASURED_DATA` through an `ADAPTER`.

There is no local AODV/Zigbee routing decision, route cost, neighbor-table maintenance or repeater-selection algorithm. Those decisions are external runtime behavior of the Digi/XBee mesh.

### 4.2 Snapshot inference

For each timestamp the browser makes an undirected union of all captured paths. It calculates route depth, route-through counts and Tarjan articulation points, excluding `COORD`. The captured paths are measured; criticality and SPOF are `INFERRED_TOPOLOGY`.

Using an undirected graph is an `APPROXIMATION`: it does not represent asymmetric links, route direction, route cost, retries, neighbor-table state or coordinator boundaries.

### 4.3 Period aggregation

For each destination, immediate-parent occurrences are counted and the most frequent parent becomes `padre_dominante`. Exactly one edge per node is exported. `freq` is the number of complete route rows containing an edge, not only immediate-parent events, so edges near the coordinator carry the accumulated traffic-path count.

This is intentional aggregation, but the result must be named a **period dominant-parent tree**. Calling it the “real mesh” without that qualification is misleading.

### 4.4 Thresholds and defaults

- Static `is_spof`: articulation in at least 50% of snapshots.
- UI persistence bands: chronic ≥60%, frequent 30–60%, intermittent 10–30%, sporadic >0%.
- Hop colors: 1, 2–3, 4–6, 7–9, ≥10.
- Criticality colors: 0, 1–2, 3–6, 7–15, >15 dependents.

These are `DESIGN_RULE`s, not measured or physical thresholds. No external siting standard is cited.

## 5. RF, RSSI and measured-versus-modeled findings

### 5.1 Measured values

The following are measurement outputs when returned by the device: discovery inventory, online response, RSSI, ACK counter, supply voltage, temperature, 16-bit network address, source route, gateway CPU/memory/uptime and any completed survey coordinates.

The Digi RSSI magnitude is negated by the collector (`61` becomes `-61 dBm`). Missing response remains null/offline rather than becoming zero.

### 5.2 RSSI semantics

The collector yields one node RSSI representing the last radio hop, not an RSSI for every edge and not an RSSI to the coordinator. The browser correctly does not invent values for intermediate route edges. However, a static node-period median is attached to the inferred dominant-parent edge even when some samples may have been received through other parents. This is an `APPROXIMATION`.

RSSI presentation bands are ≥−65, −66…−72, −73…−80, −81…−88 and ≤−89 dBm. They are local `DESIGN_RULE`s with no documented receiver/siting authority.

### 5.3 ACK semantics

The live UI differences consecutive cumulative counters and clamps negative deltas to zero. The static mesh exports the last cumulative value. These two meanings share the label `ack_failures`, creating a downstream schema ambiguity.

ACK delta bands are 0, 1–3, 4–10, 11–30 and >30. They are display policy, not physical thresholds.

### 5.4 LQI gap

No `LQI` collection, schema column, neighbor weighting, topology computation or display was found. “Link quality” in this repository means RSSI/online/ACK proxies unless an external source says otherwise.

### 5.5 Geometry and propagation

Local RF geometry uses layout-plan Euclidean distance; catalog antenna heights; nearest available terrain elevation; tracker row positions; chord and angle; and external table-band geometry. `cota_en` minimizes `dx² + 0.06·dn²`, which heavily discounts north/south separation and is an interpolation heuristic, not propagation physics.

The actual link budget, path loss, receiver sensitivity, Fresnel/LOS behavior, obstruction loss and margin are delegated to `cobertura-rf-fv`. They cannot be audited from this repository alone.

### 5.6 Calibration and data provenance

The local fitter includes failed links as left-censored observations and fits module loss, under-table loss, residual offset and fading sigma. This is stronger than fitting only successful links, but it remains an approximate statistical RF model whose baseline physics and threshold come from the external core.

All ten checked-in sweep sheets have empty measured fields. Therefore no current plant calibration can be reproduced from them.

The El Burgo GeoJSON embeds legacy `bias_db=-33.63`, `sigma_db=6.82`, `n_eff=0.38`, `n_enlaces=49`. It does not embed the source file hashes, generating commit, equation, fit timestamp, confidence intervals or failed-link population. Its calibration schema differs from the current four-parameter fitter.

## 6. Evidence paths and symbols

| Evidence | Relevant symbols/lines inspected | Supports |
|---|---|---|
| `README.md` | Zigbee package overview, last-hop RSSI warning, collector/visualizer architecture | Intended product semantics |
| `docs/contrato_datos_zigbee.md` | schema v2, UTC, keys, RSSI and route schemas | Canonical data contract |
| `zigbee_logger.ps1` | `$Gateways`, `$IntervalSec`, `Invoke-RCI`, `Gw-Carga*`, discovery/radio loop | RSSI/ACK/gateway acquisition and v1-output bug |
| `zigbee_routes_logger.ps1` | `Get-NodeMacs`, `TelnetRead`, `ParseRoute`, route loop | Route/hop acquisition and single-gateway shape |
| `index.html` | `colRSSI`, `colACK`, `colHops`, `colCrit`, `parseCSV`, `normalizaTs`, `filasDeLog`, `snapsDeRutas`, `articulationPoints`, `mallaReal`, `buildFrames`, `snapAt`, `routePath`, `CABLE_M` | Canonical browser topology inference and rules |
| `tools/malla_medida.py` | GeoJSON conversion and distance fallback | Python adapter/legacy path |
| `tools/gen_coords_cobertura.py` | `gateways`, `reparte_hsus`, `ncu_gw`, `puntos`, `cerca_ncu`, `gw_cerca`, `genera` | Configured/inferred plant topology |
| `tools/reps_ncu.mjs` | `CONTRATO`, `MARGEN_MIN`, `derivaReps` | Repeater provenance and inference |
| `tools/plan_barrido_rf.py` | external core import, `cota_en`, `mesas_entre`, `margen`, `clase`, sweep bins | RF geometry and design rules |
| `tools/calibra_barrido.py` | censored likelihood, parameter names and geometry reconstruction | RF calibration adapter |
| `cobertura_coords/*/manifiesto_*.json` | plant counts, gateway scope, HSU provenance | Embedded configured inventory |
| `cobertura_coords/*/barrido_*.csv` | planned rows and empty measurement columns | Absence of completed sweep data |
| `elburgo_real.geojson` | route/snapshot counts, measured nodes/edges, legacy calibration | Historical measured aggregate |
| `plantas_indice.json` | generated source declaration, CRS/timezone/site metadata | Plant metadata provenance |
| `tools/test_malla_real.mjs` | synthetic route/RSSI assertions and El Burgo shape | Measured-mesh test coverage |
| `tools/test_contrato_datos.mjs` | contract and timestamp parsing assertions | Contract-reader coverage |
| `tools/test_barrido_rf.py`, `tools/test_calibra_barrido.py` | physics/calibration test gates | External-core requirement |
| `tools/test_logger_rssi.py`, `tools/test_rutas_telnet.py` | fake-device integration tests | PowerShell acquisition test intent |

## 7. CANONICAL / MIRROR / ADAPTER / LEGACY candidates

### CANONICAL candidates

- `docs/contrato_datos_zigbee.md` for collector CSV semantics.
- `index.html` measured-route parsing, snapshot analysis and browser-export behavior.
- External `cobertura-rf-fv/python/zigbee_pv_model.py` for RF physics, subject to external verification.
- Upstream SCADA/toolbox and original plant documents for NCU/GW/slave assignments; local copies are not canonical.

### MIRROR candidates

- `plantas_indice.json` and `cobertura_coords/**` as generated views.
- `tools/reps_ncu.mjs::CONTRATO` as a local transcription of SCADA/Excel truth.
- `*_layout.json` where generated from DWG/KML/PDF/as-built sources.
- Duplicated 20 m cable-HSU rule in JS and Python.

### ADAPTER candidates

- All PowerShell Digi/Modbus collectors.
- `tools/gen_coords_cobertura.py`.
- `tools/plan_barrido_rf.py` and `tools/calibra_barrido.py`.
- `tools/malla_medida.py` when consuming externally aggregated CSVs.

### LEGACY candidates

- `tools/malla_medida.py` relative to the browser's direct raw-CSV exporter.
- `elburgo_real.geojson` calibration schema (`bias_db`, `n_eff`) and incomplete provenance.
- Zone-less collector CSV v1 support, which remains necessary for historical files but should not be newly emitted.
- Manifest pointers to nonexistent `diagnostico_elburgo.py`.

## 8. Discrepancy register

| ID | Discrepancy | Classification | Rationale / consequence |
|---:|---|---|---|
| D01 | Collectors omit `schema_version=2` and write local `yyyy-MM-dd HH:mm:ss`, contrary to the canonical UTC-`Z` contract | `BUG` | New output is incorrectly treated as legacy v1 and depends on plant timezone/DST repair |
| D02 | README/contract describe v2 output but base scripts produce v1 | `BUG` | Public behavior and implementation disagree |
| D03 | RSSI collector supports multiple gateways; route collector has one `$GwHost` and telnet session | `UNKNOWN` | May require separate processes/files; operational convention is undocumented |
| D04 | Route schema lacks an explicit gateway field | `BUG` candidate | Multi-gateway target IDs can collide and provenance is lost |
| D05 | Node-period RSSI median is attached to the dominant-parent edge | `APPROXIMATION` | Samples may belong to different actual parent links |
| D06 | Static mesh emits one dominant-parent edge per node | `INTENTIONAL` | Useful period summary, but not a complete mesh |
| D07 | Route snapshots carry forward indefinitely and the first is used before its timestamp | `APPROXIMATION` | Can display stale or future topology beside RSSI observations |
| D08 | Static SPOF Boolean uses 50%; UI “chronic” band begins at 60% | `UNKNOWN` | Similar terminology has divergent policies |
| D09 | No Zigbee LQI capture despite general link-quality wording | `UNKNOWN` | May be a deliberate device limitation or an unimplemented requirement |
| D10 | HSU cable/radio status is inferred from 20 m geometry | `APPROXIMATION` | Physical wiring is not explicitly configured |
| D11 | The 20 m rule is duplicated in JS and Python | `BUG` architectural candidate | Constants can drift without a shared source |
| D12 | NCU position is used as gateway/coordinator map position | `APPROXIMATION` | NCU and Digi are explicitly separate devices |
| D13 | Coordinate matching falls back to the last numeric part of an ID | `APPROXIMATION` | Namespace collisions can silently misplace nodes |
| D14 | Current JS rounds even medians; historical El Burgo data contains fractional median RSSI | `LEGACY` | Historical and regenerated output need not match numerically |
| D15 | JS and Python distance formulas/precision differ | `APPROXIMATION` | Small but observable parity difference |
| D16 | All checked-in sweep sheets are unmeasured | `UNKNOWN` | Field campaigns may not have happened or results may live elsewhere |
| D17 | RF model/tests require absent sibling `cobertura-rf-fv` | `INTENTIONAL` | Correct external boundary, but standalone verification is impossible |
| D18 | El Burgo measured aggregate has 53 nodes versus 219 configured now | `LEGACY` / `UNKNOWN` | Likely scoped to one coordinator/period, but metadata does not say |
| D19 | El Burgo calibration schema differs from current fitter | `LEGACY` | Cannot compare or migrate without the original equation/data |
| D20 | Manifest names nonexistent `diagnostico_elburgo.py` | `BUG` | Checked-in workflow instruction cannot be executed |
| D21 | Ayora repeater 4 has a provisional, unsourced gateway | `APPROXIMATION` | Well disclosed and deliberately not persisted as fact |
| D22 | `ack_failures` denotes a live delta and a static cumulative counter | `BUG` | Same name has two incompatible meanings |
| D23 | Presence of RSSI is used as online criterion | `UNKNOWN` | Requires Digi firmware semantics to validate |
| D24 | Gateway load XML is parsed by permissive regex | `APPROXIMATION` | Raw fallback makes failure visible, but field semantics need firmware validation |
| D25 | Gateway endpoints/credentials are edited in source-local PowerShell config | `LEGACY` | No separate operational secrets/configuration boundary |
| D26 | `*_networks.json` sounds like communications topology but contains civil/electrical networks | `UNKNOWN` naming issue | Creates a risk of treating cable/trench geometry as Zigbee links |
| D27 | Manifest `gws` counts distinct GW numbers, not globally unique Digi devices | `UNKNOWN` | Fleet-level totals can be misread |
| D28 | Per-scope manifest field `tcus` may count all node roles | `BUG` metadata candidate | HSU/REP inclusion can make the label semantically false |

## 9. Unresolved UNKNOWN items

1. Whether the single-gateway route collector is an intentional one-process-per-Digi deployment convention.
2. Whether node IDs are globally unique enough to compensate for the missing gateway column in route observations.
3. Whether the 50% static and 60% UI SPOF thresholds intentionally answer different questions.
4. Whether deployed Digi firmware exposes usable LQI and whether product requirements need it.
5. Whether a reachable radio response may legitimately omit RSSI, invalidating “RSSI present = online.”
6. Whether completed RF sweep datasets exist outside this repository.
7. The exact NCU/GW/time scope of `elburgo_real.geojson`.
8. The raw observations and equation that produced El Burgo's legacy calibration.
9. Whether plant `gws` is intentionally “gateway number cardinality” rather than physical gateway count.
10. Whether `ambitos[].tcus` is intentionally a generic node count despite its name.
11. Whether `*_networks.json` naming is governed by another domain contract.
12. Which siting authority owns RSSI, hops, criticality, persistence and repeater thresholds.

## 10. Tests and programmatic checks executed

| Command | Result |
|---|---|
| `node tools/test_malla_real.mjs` | **PASS** — 30 checks, 0 failures. Covered route rows/snapshots, coordinator inclusion, hop depth, dominant parent, descendants, SPOF, median/null RSSI, last cumulative ACK, gateway, distance, edge frequency and El Burgo's 53-node/52-edge tree. |
| `node tools/test_malla_pagina.mjs` | **ENVIRONMENT LIMITATION** — Playwright Chromium executable absent. |
| `node tools/test_contrato_datos.mjs` | **PARTIAL / ENVIRONMENT LIMITATION** — contract and pure timestamp checks passed; browser phase stopped because Playwright Chromium is absent. |
| `python3 tools/test_barrido_rf.py` | **ENVIRONMENT LIMITATION** — explicitly requires sibling `/workspace/cobertura-rf-fv/python`. |
| `python3 tools/test_calibra_barrido.py` | **ENVIRONMENT LIMITATION** — same missing RF core. |
| `python3 tools/test_logger_rssi.py` | **ENVIRONMENT LIMITATION** — `pwsh` absent. |
| `python3 tools/test_rutas_telnet.py` | **ENVIRONMENT LIMITATION** — `pwsh` absent. |
| Python manifest inventory script over `cobertura_coords/*/manifiesto_*.json` | **PASS** — enumerated all ten plants and entity totals. |
| Shell/awk scan over `cobertura_coords/*/barrido_*.csv` | **PASS** — all ten plans contain zero populated RSSI and zero populated reachability results. |
| Python GeoJSON metadata scan | **PASS** — El Burgo contains 53 points, 52 lines, 406,457 route rows and 8,053 snapshots. |
| `git status --short --branch` before persistence | **PASS** — audit did not modify repository state; pre-existing dirt was confined to `node_modules`. |

Test gaps:

- The contract test did not catch that the actual collectors still emit v1 data.
- No test enforces gateway identity on route rows.
- No test proves RSSI-to-edge attribution while parents change.
- No JS/Python distance parity test exists.
- No checked-in measured RF campaign supports end-to-end physical validation.
- Browser and PowerShell integration checks require missing runtime artifacts in this environment.

## 11. External repositories and sources still requiring verification

### 11.1 `cobertura-rf-fv` — mandatory

Verify `python/zigbee_pv_model.py`, especially:

- `LinkParams` defaults: transmit power, frequency, antenna gains, cable losses, sensitivity and path-loss exponent;
- `predict_link()` equation, units and output semantics;
- `table_band()` geometry;
- LOS/Fresnel and terrain behavior;
- TCU-to-TCU versus coordinator-to-TCU heights;
- directionality/asymmetry;
- obstruction/table/module losses;
- uncertainty and calibration serialization;
- compatibility, if any, with El Burgo's legacy `bias_db/n_eff` values.

### 11.2 SCADA / `tcu-toolbox`

Verify the canonical NCU/GW/slave ranges, Digi `ip_gw`, NCU Modbus endpoints, HSU counts/slaves, repeater assignments and plant constants. Local repeater tables and generated manifests are mirrors/adapters of that material.

### 11.3 Original plant design and survey sources

Verify tracker/NCU/Digi/HSU/repeater coordinates, actual wiring, antenna heights/orientation, chord, vertical datum, removed TCUs, gateway-range overlaps and missing repeater positions against the original DWG/KML/PDF/Excel/as-built sources.

### 11.4 Digi/XBee firmware documentation

Verify RSSI meaning/update timing, ACK counter scope/width/reset, source-route order/cache/staleness, device type codes, LQI availability, empty-RSSI behavior and gateway CPU/memory query schemas for deployed firmware.

### 11.5 Communications siting authority

Locate the controlling standard for RSSI acceptance, maximum hops, RF margin, repeater siting, redundancy, SPOF persistence, antenna installation and tracker-angle sweep conditions. Current local thresholds are design rules without a cited authority.

## 12. Candidate domain boundaries

1. **`comms-acquisition`:** Digi protocols, endpoint/auth configuration, immutable raw observations, timestamps, cycle IDs and schema versioning.
2. **`plant-comms-inventory`:** stable device identity, TCU/HSU/REP/NCU/GW membership, slaves, explicit wired/radio field, coordinates and per-field provenance.
3. **`topology-observation`:** gateway-qualified route snapshots, directed paths, hops and freshness.
4. **`topology-analytics`:** articulation, dependents, dominant-parent summaries, persistence and redundancy, each with observation window/method/threshold metadata.
5. **`rf-geometry`:** antenna positions/heights, terrain, tracker/table geometry and LOS/Fresnel geometry.
6. **`rf-propagation-core`:** link budget, path loss, obstruction, sensitivity, probability and model version; likely `cobertura-rf-fv`.
7. **`rf-calibration`:** campaign design, successful and failed observations, censored fit, confidence intervals and validation artifacts.
8. **`comms-visualization`:** map/timeline/presentation policy without hidden physical or topology assumptions.
9. **`plant-source-adapters`:** SCADA, DWG, KML, PDF, Excel and survey reconciliation with explicit provenance.

## 13. Questions to escalate to `00_MASTER`

1. Is `cobertura-rf-fv` the approved canonical RF core, and which revision must be paired with this repository?
2. Where is the approved communications siting standard for RSSI, sensitivity, hop count, RF margin, repeater placement, redundancy and SPOF persistence?
3. Are the checked-in PowerShell collectors required to emit schema v2? If yes, why do they still produce local zone-less v1 timestamps without `schema_version`?
4. Must every route observation carry an explicit plant/NCU/gateway identity?
5. What is the stable device identity: extended MAC, `node_id`, `(plant, NCU, GW, slave)`, or a central asset UUID?
6. What exactly does Digi `radio.rssi` mean on deployed firmware, and does it correspond to the current route's final hop?
7. What are `ack_failures` scope, width, rollover and reset semantics?
8. Should LQI be collected, or should all product language explicitly say RSSI/ACK proxies?
9. Should topology analytics use a directed graph rather than the current undirected union?
10. Is the dominant-parent tree an approved deliverable, and should it be renamed to prevent confusion with a mesh?
11. What route freshness/expiry policy should replace indefinite carry-forward and use of a future first snapshot?
12. Should chronic SPOF mean 50% or 60%?
13. Is “HSU within 20 m of NCU means cable” an approved design rule, and can it become an explicit inventory field?
14. Where are actual Digi antenna coordinates stored rather than NCU proxy positions?
15. Which source wins when layout, SCADA and plant spreadsheets disagree about HSU/repeater assignment?
16. Can Ayora repeater 4's gateway and the six unlocated repeaters be resolved from commissioning records?
17. What NCU/GW/time window does `elburgo_real.geojson` represent, and why does it contain 53 versus 219 configured nodes?
18. Can El Burgo's raw 49-link dataset, failed observations, equation, fitter revision and confidence intervals be recovered?
19. Should legacy `bias_db/n_eff` calibration be migrated to or isolated from the current `l_mod/l_roce/offset/sigma` schema?
20. Have any of the ten RF sweep plans been executed, and where are the results?
21. Where should the nonexistent `diagnostico_elburgo.py` workflow point now?
22. Should cumulative and delta ACK values be renamed `ack_failures_counter` and `ack_failures_delta`?
23. Should every generated topology attribute retain per-field source and inference method?
24. Should civil/electrical `*_networks.json` be renamed or separately schematized to avoid confusion with Zigbee networks?
25. What is the security/retention policy for checked-in plant endpoints and collector credentials?
26. Which CI matrix is mandatory: PowerShell 5.1, pinned Chromium, sibling RF core, multi-gateway identity tests and at least one reproducible measured RF dataset?

## 14. Final audit disposition

The repository is strong at making many inferences visible in comments and tests, but its communication products currently mix measured observations, configured inventory, inferred topology, RF model outputs and display rules in closely adjacent files. The highest-priority corrections outside this audit report are the schema-v2 collector mismatch, explicit gateway identity for routes, separation of cumulative versus delta ACK semantics, removal of stale/nonexistent workflow pointers, and external verification/version pinning of `cobertura-rf-fv`.

Audit status: **COMPLETE**, with the `UNKNOWN` items above explicitly unresolved rather than silently promoted to facts.
