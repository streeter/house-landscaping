# Yard planner cleanup plan

Follow-up to the implementation review against [the original plan](yard-planning-tool.md), conducted on September 12, 2026 at commit `5332850` with three reviewers and an independent cross-review pass.

Baseline: `npm run check` passes, including 31 unit tests and 38 browser tests. The findings below include reproduced defects, source-confirmed risks, and explicitly identified enhancements. Passing checks currently do not cover these cases.

Each unchecked task is a focused PR candidate. P1 protects existing work; P2 fixes correctness, completes planned behavior, or adds necessary coverage; P3 covers cleanup and workflow improvements. Complete P1 first. Within P2, fix map-maintenance fixtures before changing the property map, then address editing, timing, and exports. Split a task further if its implementation becomes difficult to review.

## P1 — Preserve user work

- [ ] **P1.1 Prevent stale advice downloads from replacing the active yard.**
  - Finding: generate advice for Yard A, open Yard B with a different ID but the same `modifiedAt`, then download the old advice JSON. The UI and browser draft revert to A. Reproduced in Chromium and WebKit.
  - Change: bind bundles and asynchronous export completion to document identity and revision; invalidate bundles on Open, New, and map upgrade. Downloading should update saved metadata only when applicable, never replace live source content.
  - Acceptance: both browsers preserve Yard B in the same-timestamp case; opening a different yard while export generation is pending cannot install a stale bundle.
  - Code: `src/App.tsx`, advice bundle generation and download handlers.

- [ ] **P1.2 Protect unsaved startup drafts during file replacement.**
  - Finding: opening a file from the resume screen bypasses the dirty-draft confirmation because `ready` is false. Reproduced in both browsers.
  - Change: apply replacement protection to startup recovery as well as the active editor. Check upgradeable and unreadable draft paths too.
  - Acceptance: declining replacement preserves the exact stored draft; accepting replacement opens the chosen file. Cover both browsers.
  - Code: `src/App.tsx`, `openFile` and draft recovery.

- [ ] **P1.3 Preserve edits made during structural map saves.**
  - Finding: a delayed save response replaces newer edits and clears their history. Reproduced in both browsers with intercepted responses.
  - Change: reconcile responses against the submitted revision, or prevent editing and history changes while saving. Handle repeated saves and failures consistently.
  - Acceptance: delayed responses cannot discard newer edits; failure and retry retain recoverable work and an accurate saved indicator.
  - Code: `src/map-editor/main.tsx`, `save`.

## P2 — Map maintenance and editor correctness

- [ ] **P2.1 Make map tests independent of incidental current geometry.**
  - Finding: incrementing the map version in an isolated copy breaks a test that assumes version 2 is incompatible. Other tests hardcode versions 0/1, assume the last surface is Residence, or depend on the current patio label and coordinates.
  - Change: use explicit synthetic fixtures for upgrade, label, and geometry behavior; derive current-version expectations where appropriate. Retain real-asset reproducibility and coordinate-system checks.
  - Acceptance: a valid map version increment or added planter does not invalidate unrelated assertions. Run the maintenance scenario in temporary paths without modifying repository assets.
  - Code: `src/domain/document.test.ts`, `scripts/map-editor-plugin.test.ts`, map-editor and file-workflow browser tests.

- [ ] **P2.2 Serialize map persistence and recover from paired-file failures.**
  - Finding: concurrent requests can validate against the same old version. JSON is written before SVG, so a failed second write can leave mismatched assets. Confirmed by source inspection; no destructive repository-write probe was performed.
  - Change: serialize the complete read/validate/write operation; prepare both outputs before replacement and provide recovery for partial failure.
  - Acceptance: temporary-directory integration tests exercise actual POST persistence, stale/concurrent requests, and injected write failures. A failed save must not silently leave inconsistent map files.
  - Code: `scripts/map-editor-plugin.ts`.

- [ ] **P2.3 Reconcile zone selection after undo and redo.**
  - Finding: Insert vertex → Undo → Insert vertex dereferences a deleted vertex and throws in both browsers.
  - Change: reconcile selected zone, piece, and vertex indexes after document changes and guard geometry handlers.
  - Acceptance: insertion, deletion, and piece changes remain usable across undo/redo in Chromium and WebKit, including keyboard shortcuts.
  - Code: `src/components/ZoneWorkspace.tsx`.

- [ ] **P2.4 Move group footprints together with their anchors.**
  - Finding: dragging a group changes its anchor but leaves its area behind. The group can receive another zone's coverage without a warning; import validation accepts the inconsistency.
  - Change: translate the whole group and enforce anchor/area consistency during coordinate edits and imports. Define lot-edge behavior without distorting the polygon.
  - Acceptance: drag, coordinate editing, duplication near boundaries, and file round-trip preserve the group's shape and valid anchor placement.
  - Code: `src/components/YardWorkspace.tsx`, `src/domain/document.ts`.

- [ ] **P2.5 Detect mixed group coverage geometrically.**
  - Finding: finite sampling misses uncovered interior holes, allowing a mixed group to receive one misleading coverage summary. Reproduced with four zone pieces surrounding an uncovered patch.
  - Change: use geometric intersection/difference or complete spatial partitioning instead of treating sampled agreement as proof of uniform coverage.
  - Acceptance: tests cover off-center holes, narrow slivers, concave shapes, and disconnected pieces. Mixed groups cannot receive an unqualified single-coverage summary.
  - Code: `src/domain/geometry.ts`, `groupCrossingZoneIds`.

- [ ] **P2.6 Render structural labels from editable surface records.**
  - Finding: Patio, Residence, Porch, and Driveway labels have hardcoded text and positions. Edits leave stale labels; new planters receive none.
  - Change: derive labels from surface data using a placement policy or explicit label anchors.
  - Acceptance: rename, move, delete, and add operations produce matching labels in the generated SVG, workspace, and advice map.
  - Code: `src/property-base.ts`.

## P2 — Document and input integrity

- [ ] **P2.7 Keep incomplete form text out of persisted documents.**
  - Finding: clearing a controller start time stores an empty string. Autosave succeeds, but reopening and exporting fail validation. Raw recovery data survives. Empty dates and out-of-range numeric inputs need the same audit.
  - Change: retain incomplete input locally until valid, or normalize deletion explicitly. Show actionable validation without committing invalid source records.
  - Acceptance: clear/edit/reload/export tests in both browsers retain a usable document; include start times, reference dates, and numeric bounds.
  - Code: `src/components/ControllerWorkspace.tsx`, `src/domain/files.ts`.

- [ ] **P2.8 Validate old documents before additive map upgrades.**
  - Finding: replacing the map and timestamps before validation can legitimize broken old surface references and malformed original timestamps. Reproduced with a plant referencing Residence while its old snapshot omits that surface.
  - Change: validate the original schema and reference graph against the original snapshot, apply only the supported additive transformation, then validate the result.
  - Acceptance: valid old yards retain source records; malformed old references or timestamps are rejected without replacing the current yard or draft.
  - Code: `src/domain/document.ts`, `upgradeAdditiveMap`.

## P2 — Controller timing and provenance

- [ ] **P2.9 Handle DST throughout the simulation window.**
  - Finding: for the week beginning March 9, 2026 in Los Angeles, a preceding Sunday 23:00 two-hour run becomes Monday 00:00–02:00 and is marked complete. The DST guard covers only the reference week.
  - Change: use civil-time conversion and ambiguity checks across the entire lookback window. Where behavior remains unverified, return unresolved timing.
  - Acceptance: spring/fall transition tests cover preceding-Sunday carry-in and explicit UTC offsets; the reproduced case starts Sunday 23:00 or is clearly unresolved.
  - Code: `src/domain/timing.ts`.

- [ ] **P2.10 Detect conflicts before filtering out unmapped stations.**
  - Finding: concurrent programs requesting the same unmapped station can yield a complete downstream timeline despite unverified station-conflict behavior.
  - Change: calculate and validate all physical station events before projecting them onto mapped zones.
  - Acceptance: simultaneous station-9 requests from two programs are flagged even when station 9 is unmapped; cover downstream mapped events in repeated budget cycles.
  - Code: `src/domain/timing.ts`.

- [ ] **P2.11 Account for runs and queues older than two days.**
  - Finding: accepted runtimes, budgets, and station delays can produce runs longer than 48 hours; the fixed two-day lookback omits earlier starts still watering on Monday.
  - Change: derive sufficient history or explicitly mark an unknown initial queue state unresolved.
  - Acceptance: independently expected cases cover long runs and accumulated repeat-start queues crossing into the reference week.
  - Code: `src/domain/timing.ts`.

- [ ] **P2.12 Round-trip verification timestamps in the intended timezone.**
  - Finding: the datetime input displays UTC text but parses edits as browser-local time, shifting displayed values outside UTC.
  - Change: use a consistent local-input formatter and make the timezone convention clear.
  - Acceptance: a non-UTC browser test enters a verification time, edits it, saves, and reopens without a display shift.
  - Code: `src/components/ControllerWorkspace.tsx`.

- [ ] **P2.13 Preserve the originating advice export on schedule decisions.**
  - Finding: `sourceExportId` comes from the latest ordinary file save, which may differ from the advice that prompted the decision.
  - Change: retain or select the source advice export independently of routine save metadata.
  - Acceptance: advice export E1 → later save E2 → decision based on E1 retains E1 as provenance. Unknown provenance remains explicit.
  - Code: `src/components/CareWorkspace.tsx`, `src/domain/files.ts`.

## P2 — Complete overlap and advice exports

- [ ] **P2.14 Associate overlap context with actual areas.**
  - Finding: source notes have exact-point scope; nearby plants do not inherit them, and unnoted overlap areas lack exported overlap-period records. This is conservative behavior but falls short of the planned area model.
  - Change: introduce explicit spatial scope for notes and export overlap-area intervals independently of source knowledge. Revalidate scope after geometry changes. Do not infer shared hoses merely from matching zone IDs.
  - Acceptance: disconnected intersections and mixed three-zone regions retain correct membership, optional source context, and interval provenance after edits and file round-trip.
  - Code: `src/domain/document.ts`, `src/domain/geometry.ts`, `src/domain/timing.ts`, `src/components/ZoneWorkspace.tsx`.
  - Split into schema/geometry and UI/export PRs if needed; preserve file compatibility throughout.

- [ ] **P2.15 Include entered growing and controller context in Markdown.**
  - Finding: the readable report omits general growing notes, container dimensions/drainage, and controller execution mode, delay, rain/sensor settings, and their confirmation context. JSON retains these fields.
  - Change: include meaningful source values and explicit unknowns in the readable summary.
  - Acceptance: a populated fixture verifies seasonal notes, container conditions, and confirmed/assumed/unknown controller settings against independently stated expected content.
  - Code: `src/domain/advice.ts`.

- [ ] **P2.16 Complete map annotations and verify rendered exports.**
  - Finding: the PNG lacks direct zone labels and schedule verification status required by the plan. Planned/existing plants differ only by color without a status key. The current browser test uses an empty yard and verifies PNG signature/dimensions rather than map semantics.
  - Change: add readable zone labels, verification metadata, and a plant-status key. Use a populated fixture with overlaps, a group, a plant on stairs, containers, and long labels. Check generated SVG content and the rendered PNG.
  - Acceptance: artifacts agree on one snapshot and expose required labels, hatching, identity, and status. Test edits during asynchronous generation, same-colored zones, and edge-position labels in both browsers.
  - Code: `src/domain/advice-map.ts`, `tests/e2e/advice-export.spec.ts`.

## P3 — Cleanup and workflow improvements

- [ ] **P3.1 Consolidate shared map definitions.** Share surface-kind/color definitions and suitable coordinate helpers across the renderer, editor, and save validator. Preserve existing behavior and avoid a broad component rewrite.
- [ ] **P3.2 Isolate browser test artifacts.** Replace the shared `/tmp/yard-map-advice-test.png` output with per-test paths and attach rendered artifacts for CI inspection.
- [ ] **P3.3 Clarify verification after controller edits.** Consider a confirmation reminder or an explicit action to verify current settings. Retaining verification after every edit is a policy question: an edit may correct transcription of already-verified settings, so automatic invalidation is not an established requirement.
- [ ] **P3.4 Show group footprints in exported maps.** Improve parity with the editor and make group coverage easier to interpret. This is an enhancement rather than an explicit PNG acceptance requirement.

## Completion rules

- Add meaningful regression coverage with each fix; test map/file browser behavior in Chromium and WebKit.
- Run the non-mutating `npm run check` command for each PR. Keep persistence probes and map-maintenance fixtures in temporary paths.
- Use a focused branch and small PR per body of work; merge with `gh` only after CI is green.
- The three terraced planter polygons are intentionally excluded: the user will place them. Preserve the existing deferrals in the original plan.
