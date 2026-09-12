# Yard map and care-planning tool

## Summary

Build a browser editor with a fixed property drawing, editable plants and irrigation coverage areas, and schedules that match the household’s **Irritrol Rain Dial RD-900-R** controller. Save the working copy in browser local storage and explicitly open/save a portable `yard.json` file. The household coordinates editing and shares the file; no application account, database, or automatic device synchronization is required.

Use React, TypeScript, Vite, and SVG. The app can run from a local web server or a static host. The first version is a complete file-based workflow: open → annotate → enter controller settings → inspect expected watering → save/export → obtain external LLM advice → record chosen schedules and maintenance.

The property is approximately **40 × 120 feet**, or **4,800 square feet**. Preserve the supplied image’s orientation:

| Image edge | Property boundary | Length |
|---|---|---|
| Top: backyard | East | 40 ft |
| Bottom: driveway | West | 40 ft |
| Left | North | 120 ft |
| Right | South | 120 ft |

## Fixed property drawing

Use `data/property.jpg` only as the tracing reference. Its illustrated plants are incorrect and must not appear in the finished base map or seed the plant inventory.

- Trace the property boundary, residence, driveway, patio, porch, paths, and stairs once during development. Review the trace against the original image, including an overlay. Mark edges inferred beneath vegetation as approximate.
- Store named structural shapes and stable surface IDs in a built-in `property-base.json`. Generate `property-base.svg` from that geometry with a repeatable script; the JSON is the source of truth for both drawing and structural context.
- Calibrate the traced lot extents, excluding image margins and overhanging vegetation, to 40 × 120 feet. Correct horizontal and vertical proportions independently during tracing.
- Use feet as the common coordinate unit for the base map, zone polygons, and plants. The SVG view box is `0 0 40 120`: origin at the northeast corner, x increasing southward to the right, y increasing westward downward.
- Show north pointing left, a scale bar, optional grid, and approximate horizontal distances and areas. Structural positions are estimates from the illustration, not surveyed measurements.
- Keep structures fixed during ordinary editing. Later corrections update the versioned built-in map while retaining the same property coordinate system; an imported file with an incompatible map version must be identified before editing.

The base map ships with the app. If hosted, it is accessible to anyone who can access the site, even though editable yard data stays in the browser. Validate locally first; any shared hosting must preserve the desired privacy through host-level access controls, without adding an application account system.

## Plants and zone editing

Provide zoom, pan, selection, dragging, duplication, undo/redo, labels, and layer visibility. Zone areas support polygon drawing and vertex editing. Clicking a plant or zone opens its details; selecting an inventory entry locates it on the map.

Use computers for precise polygon editing. Phones support viewing coverage, placing and moving plant markers, changing details, and recording text observations. Photo attachments are deferred from the first version.

| Record | Essential information |
|---|---|
| Property context | Built-in map ID/version, dimensions, orientation, structure geometry, user-entered location, timezone, and general growing-condition notes |
| Plant or group | Stable ID, label, species or unknown identity, position, optional group area and count, status, establishment, size, sun, soil, and notes |
| Growing setting | Ground, container, or planting pocket; supporting surface ID; optional container dimensions and drainage notes |
| Zone | Stable ID, name, color, controller station number, and one or more coverage polygons |
| Overlap interpretation | Connected overlap area, covering zones, which zones share a watering source there, and whether that interpretation is confirmed or unknown |
| Controller schedule | Model, execution settings, programs A/B/C, weekdays, start times, and station runtimes |
| Care records | Dated observations, simple maintenance tasks, and saved proposed/programmed schedules |

Maintain eight yard zones, mapped to the appropriate station numbers on the controller. Do not assume their station numbers are necessarily 1–8. One zone can contain several disconnected polygons; pieces of the same zone are treated as one coverage area for membership and watering calculations.

Plant anchors must lie inside the property boundary. Plants are allowed on stairs and other paved surfaces, and canopy drawings can extend outside the lot. Infer the supporting surface and allow correction. Allow explicit hand-watered, no-irrigation, or unknown watering status.

Preserve every zone covering a plant’s anchor location, including overlaps and boundary points. Allow a documented manual coverage correction, and distinguish it from the geometric result in the export. Recalculate membership after moving plants or editing zones.

Counted plant groups should share species, growing setting, and watering coverage. Use separate records for mixed beds or groups crossing different coverage areas; identify such crossings instead of assigning the entire group from its centroid. Support splitting a group while retaining its notes. Retire removed/dead plants under their stable IDs, preserve observations, and exclude them from current watering summaries. Planned plants remain separate from the existing inventory.

## Irrigation coverage and shared watering areas

Model irrigation by area, with approximately uniform watering within each zone. Individual drippers, tubing routes, missing outlets, emitter flow, and hydraulic behavior are outside this version. Report runtime and watering frequency; do not estimate gallons or assume equal runtime delivers equal amounts across different zones.

Overlapping zone polygons are valid. Use translucent fills, distinct labeled borders, and hatching on intersections. Selecting an overlap lists all covering zones and shows its combined expected schedule; do not rely on blended colors alone.

For each connected overlap area, record whether the covering zones activate the **same watering source**, **independent sources**, or an **unknown arrangement**. The user has identified at least two places where different zones activate the same hose. These can be marked as shared sources without drawing the hose or its drippers. Different intersections may have different interpretations. Revalidate affected overlap interpretations after polygon changes and mark unresolved ones for review.

Combine overlapping or directly adjoining time intervals within each shared source. For illustration, if these are the actual station running times on Monday:

| Zone A | Zone B | Shared-source watering |
|---|---|---|
| 08:00–08:10 | 08:00–08:10 | One 10-minute period |
| 08:00–08:10 | 08:05–08:15 | One continuous 15-minute period |
| 08:00–08:10 | 08:10–08:20 | One continuous 20-minute period |
| 08:00–08:10 | 09:00–09:10 | Two periods, 20 minutes total |

For independent sources, retain separate source timelines and identify simultaneous delivery; do not treat their combined operation as a single equal-flow source. If a region has both shared and independent sources, combine intervals only within each shared group. Unknown source relationships remain explicit and do not produce an asserted combined water amount.

## Rain Dial RD-900-R schedule model

The controller has nine station outputs and three programs, **A, B, and C**, each supporting up to three daily start times. Model weekdays and runtimes through these programs, with references to the eight mapped yard zones. Keep weekday selection as the app’s scheduling interface; skip-day and odd/even scheduling are not part of this version. [Irritrol specifications](https://www.irritrol.com/en/controllers/raindial-r)

Enter program weekdays, start times, and station runtimes as shown on the controller. Display derived minutes/day, days/week, total weekly minutes, and expected start/end times for each zone. These summaries are calculated views, not independently editable schedules. Keep proposed settings distinct from settings confirmed as programmed, with effective dates and a verification date.

The timing calculator must account for the documented controller behavior:

- Within a program, assigned stations run in ascending station-number order. A program start is not a simultaneous start for all its stations.
- `3:On` allows programs to overlap; `1:On` stacks programs. A repeat start of an already-running program waits. Running cycles can continue across midnight; stacked programs still waiting at midnight are canceled.
- Include any station delay and the applicable program water-budget percentage, including monthly settings when used. Above 100%, the adjusted program runs in two cycles, with half the adjusted station duration in each cycle.

These rules come from the [Rain Dial-R user guide, printed pages 18–19 and 27–30](https://cdn2.toro.com/en/-/media/Files/Irritrol/products/controllers/rain-dial-r-series/373-0538V_d.ashx).

For example, Program A starting at 08:00 with stations 1 and 2 each set to 10 minutes produces 08:00–08:10 and 08:10–08:20 when water budget is 100% and station delay is zero. Their shared watering area therefore receives one continuous 20-minute period under the shared-source assumption.

Do not infer the installed execution settings from factory defaults. Record Stack/Overlap mode, station delay, water budget, and any relevant rain delay or sensor/weather adjustment as confirmed, assumed, or unknown. Use the property’s user-confirmed timezone and an identified reference week for date-dependent calculations.

Where behavior is not established—such as equal-time queue priority or the same station requested by concurrent programs—flag the affected timing as unresolved until verified against the controller. Preserve the original settings and explain the ambiguity instead of inventing a precise timeline. The calculator describes **expected scheduled operation**, not a history of observed watering; manual operation, rain interruptions, or faults are not inferred.

Split daily totals at midnight while retaining continuity across the boundary, including the Sunday/Monday transition. Compute station events first, then intersect their coverage with plants and overlap areas, then combine intervals according to the source relationships. Keep this calculation as a pure, testable function shared by the UI and exports.

## Local storage and shared file workflow

- On first use, create a yard document with the fixed map and eight empty zone records, or open an existing `yard.json`. On later visits, offer to resume the browser draft or open a file.
- Autosave completed edits locally, including recovery across reloads. Clearly distinguish “saved in this browser” from “saved/exported to a file,” and indicate edits made since the last file save/export.
- Provide explicit Open, Save/Download, and Save As actions. Support standard file upload/download across browsers; direct file saving is an optional enhancement where supported. Do not depend on that API for the core workflow. [Browser file-saving support](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)
- The shared disk file is the handoff between editors. Opening a file explicitly replaces the working document after handling unsaved edits; do not merge it silently with a local draft. The household coordinates which copy is current. There are no editing locks, conflict merges, or automatic synchronization.
- Validate the complete file before replacing the current document. Reject malformed data, incompatible schema/map versions, and broken references without losing the working copy. Treat imported derived summaries as disposable and recalculate them.
- Handle unavailable/full browser storage visibly while retaining the in-memory document and the ability to export it. Local storage is a convenience, not the only backup. Its contents are specific to the browser and site origin. [Local storage documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

Use a stable local URL or hosting origin. A move to another browser, device, or origin requires opening the saved file. Phone and computer edits use the same file exchange workflow.

## JSON contract, LLM export, and care records

Define a versioned `YardDocumentV1` contract containing document identity, schema version, modification/export timestamps, a read-only property/base-map snapshot, plants, zone polygons, overlap interpretations, controller settings, schedule records, and text care records. Use stable IDs, explicit references, feet for coordinates, and explicit time units. Unknown values stay unknown.

Include the structural geometry and labels in the property snapshot, even though they are fixed in the app. The JSON must be understandable without the LLM fetching the app or interpreting an external SVG. On import, check that this read-only snapshot matches the referenced built-in map version.

The same `yard.json` is both the editable handoff file and the structured LLM input. Its calculated section contains expected station runs and plant/area watering summaries, with source zone/program IDs, weekday/date, start/end times, continuous period counts, and total minutes. Shared-source assumptions and unresolved timing must appear alongside those summaries. Derived values are regenerated from the current source records on save/export.

For a plant in two shared-source zones, the readable output should say, for example:

> This plant is covered by zones 2 and 5, which activate the same watering source here. Both are expected to run Monday from 08:00 to 08:10. The plant receives one scheduled 10-minute watering period. Overlapping runtime is counted once; water volume is unknown.

Provide an Export for Advice action that generates, from one immutable in-memory snapshot:

- `yard.json`: complete source data, structural context, assumptions, and calculated watering summaries.
- `yard-summary.md`: plants and growing conditions grouped by coverage, program settings, effective watering periods, and missing information.
- `yard-map.png`: a readable annotated map with zone borders, overlap hatching, plant labels, legend, compass, and scale.
- A copyable prompt requesting care advice, weekday-based schedules expressible through programs A/B/C, maintenance tasks, and questions needed to resolve missing information.

Stamp all artifacts with the same document/export identity and time. Include the reference week, timezone, schedule verification status, and approximation assumptions. Keep confirmed facts, estimates, unknowns, planned plants, and proposed schedules distinct.

Show a “needs checking” list for unidentified plants, incomplete zone coverage, unknown overlap relationships, missing station mappings, and controller settings that prevent reliable timing. Location, sun, establishment, soil/container conditions, and seasonal context remain useful inputs even though precise water volume is outside scope.

Users obtain advice from an external LLM and manually record chosen schedules and maintenance. Retain the source export identity with advice-derived schedule records. Text tasks support a plant/zone/property target, due date, optional repeat interval, completion, and notes. Photo attachments and ZIP asset packages are deferred; the first version’s JSON is self-contained without external photo files.

## Implementation order and acceptance criteria

1. Prepare and review the structural trace, then generate the fixed SVG and property metadata.
2. Implement plant/zone editing, overlap visualization, and the local draft + file open/save workflow.
3. Add controller program entry, timing calculation, combined watering summaries, advice exports, and simple care records.

Verify these scenarios:

- The fixed lot measures 40 × 120 feet, with the west driveway at the bottom and north on the left. Incorrect illustrated plants are absent; zoom and export preserve geometry and scale.
- A container plant on stairs can belong to multiple zones and retain its supporting surface and notes after file round-trip.
- Disconnected pieces of one zone do not duplicate watering; intersections between different zones remain visible and retain all memberships. Editing geometry invalidates affected interpretations when necessary.
- Shared-source overlap matches all four time examples above. Independent sources remain separate, and an unknown arrangement produces a clear qualification. Mixed three-zone overlaps combine only the identified shared sources.
- Program sequencing, Stack/Overlap, repeated starts, station delays, water-budget cycles, and midnight/week transitions produce consistent station and plant timelines. Unverified controller behavior is not presented as exact.
- A Monday/Wednesday/Friday program assigning a station 10 minutes once per day yields three scheduled days and 30 station-minutes/week when confirmed settings introduce no adjustment or additional runs.
- Retiring a plant preserves its history but removes it from current advice. Mixed plant groups cannot silently receive one misleading coverage summary.
- Local drafts survive reloads; failed storage writes remain exportable. Opening an invalid or incompatible file preserves the current document. Opening a valid file does not silently merge it with a stale draft.
- Open → edit → save → open in another browser preserves IDs, source settings, plants, polygons, overlap assumptions, and notes. No database or network write is needed.
- JSON, report, and map agree on one export snapshot. Recomputed summaries reflect moved plants, changed polygons, and edited controller programs. Proposed settings cannot masquerade as verified controller settings.

Deferred: individual irrigation hardware and flow estimates, a general-purpose structural drawing editor, photo attachments, application accounts, cloud database/synchronization, concurrent-edit recovery, built-in AI, automatic controller programming, live weather integration, and 3D terrain.
