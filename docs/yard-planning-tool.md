# Shared yard map and care-planning tool

## Summary

Build a private website with one shared household login. Use computers for precise drawing and phones for placing plants, updating details, and taking photos.

The property is approximately **40 × 120 feet**, or **4,800 square feet**. Preserve the supplied image’s orientation:

| Image edge | Property boundary | Length |
|---|---|---|
| Top: backyard | East | 40 ft |
| Bottom: driveway | West | 40 ft |
| Left | North | 120 ft |
| Right | South | 120 ft |

The website edits a portable `yard.json` model and exports a readable report for an external LLM. Users then record chosen watering schedules and maintenance tasks in the site.

Use Next.js and TypeScript on Vercel, React Konva for map editing, and Supabase for authentication, database storage, and private photos. [Konva documentation](https://konvajs.org/docs/react/Drag_And_Drop.html), [Vercel documentation](https://vercel.com/docs/frameworks/full-stack/nextjs)

## Map, calibration, and records

Start with the supplied image as a background. Prepare editable draft outlines for the property, residence, driveway, patio, porch, paths, and stairs. Mark the tracing as approximate until reviewed. Illustrated vegetation remains background artwork until actual plants are entered.

Calibrate against the **traced property boundaries**, excluding image margins and overhanging vegetation:

- Map the short horizontal span to 40 feet and the long vertical span to 120 feet.
- Calibrate horizontal and vertical dimensions independently, rendering the background and annotations together with corrected proportions.
- Show a compass pointing north toward the image’s left, a scale bar, optional grid, ruler, and approximate areas and line lengths.
- Store geometry in fixed image coordinates with calibration separately. Adjusting boundary alignment or measurements preserves annotations.
- Export the supplied dimensions, compass orientation, coordinate convention, and approximate measurement status. Measurements represent horizontal distances.

Provide selection, dragging, polygon and line drawing, vertex editing, duplication, undo/redo, zoom, pan, labels, and layer visibility. Selecting a map object opens its details; selecting an inventory entry locates it on the map.

Use these records:

| Record | Essential information |
|---|---|
| Property | Boundary, dimensions, calibration, orientation, location, timezone, general soil and climate notes |
| Surface or bed | Named polygon for house, driveway, stairs, patio, path, planting bed, or another surface |
| Plant or group | Stable ID, label, species or unknown identity, point or area, count, existing/planned status, photos, establishment, size, sun, soil, and notes |
| Growing setting | Ground, container, or planting pocket; supporting surface; optional pot dimensions and drainage notes |
| Irrigation zone | Eight numbered controller zones, editable names and colors, equipment notes, current schedule |
| Irrigation equipment | Drip tubing, emitter sets, inline drip, or sprinkler; zone assignment, optional geometry, output specifications, and verification notes |
| Watering connection | Explicit relationship between equipment and the plants or groups it waters |
| Care records | Observations, maintenance tasks, and watering schedules linked to plants or zones |

Allow plants on stairs and paved surfaces. Plant anchor locations belong inside the boundary; canopy drawings may extend beyond it.

A zone may serve disconnected locations. Colored coverage areas aid visualization; explicit watering connections determine which plants receive water.

## Shared editing and storage

- Provision one household email/password account and disable public signup. Enforce access rules for property records, exports, and images; keep the background and photos in private storage. [Supabase private storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- Store one versioned JSON document per property in Postgres, attachment metadata, and the latest 50 saved revisions. Store photo bytes separately.
- Autosave completed edits with saving, saved, and unsaved indicators. Preserve a recoverable local draft when saving fails.
- Require the expected document revision on every save. Reject stale writes and preserve local work for recovery before loading another session’s changes.
- On phones, support map viewing, plant placement, details, photos, and observations. Reserve boundary, calibration, and tubing geometry editing for computers.
- Provide validated JSON import/export and a ZIP backup containing the document, background, and photos. Imports create a new revision while retaining the previous state.

Define a schema-versioned `YardDocumentV1` contract with stable IDs and explicit references. Validate geometry, units, and references on save and import. Represent unknown values explicitly.

## Irrigation and care workflow

Make drip entry quick: select a plant, choose zone 1–8, and optionally enter emitter count and gallons per hour. Create a connected emitter set even when its precise location is undrawn. Add tubing routes later.

Calculate nominal delivered volume only from known output and runtime. Equipment serving a group produces a group total; do not credit that entire volume to every plant. Keep plant water requirements separate from delivery calculations. [UC drip application guidance](https://ucanr.edu/site/maintenance-microirrigation-systems/calculation-drip-application-rate-gph-hr)

“Export for advice” produces:

- `yard.json`: structured records, geometry, calibration, connections, schedules, observations, and attachment references.
- `yard-summary.md`: inventory grouped by zone, growing conditions, delivery estimates, current schedules, and missing information.
- `yard-map.png`: annotated map with labels, legend, compass, and scale.
- A copyable prompt requesting seasonal zone schedules, supplemental hand-watering needs, maintenance tasks, and questions needed before selecting runtimes.

Distinguish confirmed facts, estimates, unknowns, and planned changes. Offer photos separately for upload alongside the report.

Include a “needs checking” list for unidentified plants, uncertain irrigation assignments, and missing output measurements.

Users manually record chosen advice. Schedules support weekdays or intervals, start times, runtime, cycle/soak settings, effective dates, and draft/current/archived status. Tasks support a target, due date, optional repeat interval, completion, and notes.

## Acceptance criteria and defaults

Verify that:

- The initial lot measures 40 × 120 feet and approximately 4,800 square feet, with the west driveway at the bottom and north on the left.
- Calibration excludes image margins; distances and areas remain correct through zooming, saving, and importing.
- A container plant on stairs retains its surface, photos, and watering connections.
- One zone can serve disconnected beds; plants can have multiple watering connections or be marked hand-watered.
- Two 1-GPH emitters running for 30 minutes yield a nominal 1-gallon delivery; unknown flow yields no invented volume.
- Browser sessions cannot silently overwrite each other, and failed saves preserve recoverable work.
- Unauthenticated visitors cannot retrieve property data, images, or exports.
- JSON and ZIP restoration preserve IDs, relationships, calibration, and attachments.
- The complete workflow works: review tracing → inventory → connect irrigation → export → record schedules and maintenance.

Defaults: one property, eight zones, feet and US gallons, approximate horizontal measurements, and existing inventory shown initially. Plant identities, equipment specifications, location, and growing conditions are entered during setup.

Defer built-in AI advice, controller automation, weather integration, 3D terrain, and simultaneous live drawing.
