# Yard planner

A local, file-based yard map and care planner. The implementation follows [the project plan](docs/yard-planning-tool.md). The fixed property map and portable file workflow are in place; plant/zone editing and schedules follow in subsequent PRs.

The app autosaves its working copy in the current browser. On a later visit, choose **Resume browser draft** to continue. **Open file** validates and replaces the working copy; **Save / Download** and **Save As** create a portable `yard.json`. The status line distinguishes browser storage from a file export and identifies edits since the last download. Move the downloaded file to another browser or device and open it there; no account or automatic synchronization is involved.

Use **Place plant** and tap or click the yard map to add a marker. Select an inventory entry to locate it, drag a marker to move it, and edit its plant, growing-setting, and surface details in the panel. The map has zoom, pan, layer switches, and undo/redo. Retiring a plant keeps its record for history; planned plants appear separately from existing ones.

For counted groups, enter the count and draw the area they occupy. The editor warns when that area crosses coverage zones. **Split group** divides the drawn area into two records, retains the notes and original ID on one half, and recalculates each half's coverage. Adjust the resulting outlines when the actual planting layout differs from the automatic split.

In **Irrigation coverage**, assign each yard zone its actual controller station and draw one or more coverage polygons. Drag or numerically edit vertices, add or delete coverage pieces, and click any point to list all covering zones. Overlap areas are hatched on both maps. Zone geometry changes recheck existing overlap notes.

Click an overlap to record whether its zones turn on the same hose or independent sources. Notes stay attached to their mapped point and are flagged for checking after geometry changes. A plant’s **Correct coverage** control records observed zone membership and a reason separately from the geometric result; it never implies a shared hose.

In **Rain Dial schedule**, enter the property timezone, reference Monday, controller mode and execution settings, then weekdays, start times, runtimes, and budgets for programs A/B/C. Record whether each setting is confirmed, assumed, or unknown, and distinguish a proposed schedule from settings verified on the controller. Type `none` for a verified absence of sensor/weather adjustment. The timeline shows predicted station runs; unresolved controller behavior is explained rather than assigned exact times. Each file save recalculates station events and plant/overlap elapsed intervals from the current map and settings.

**Needs checking** lists missing identities, coverage, station mappings, stale overlap notes, and schedule uncertainty. **Export for Advice** freezes one validated snapshot, then offers matching `yard.json`, `yard-summary.md`, and annotated `yard-map.png` downloads plus a copyable prompt for an external LLM. The JSON retains predicted source station events and elapsed intervals without watering-volume or aggregate-duration claims. Regenerate the bundle after editing the yard.

In **Care and chosen schedules**, add dated observations and maintenance tasks for the property, a plant, or a zone. Tasks can repeat and be marked complete or reopened. Save a proposed or verified programmed schedule as a dated settings snapshot; the record keeps the advice export ID that informed it. Existing plant observations remain in the portable file after a plant is retired.

The map uses feet in a `0 0 40 120` coordinate system. [The structural geometry](data/property-base.json) is its source of truth, with named surfaces and explicit approximate edges. `npm run map:generate` regenerates the committed SVG; the unit test checks the asset against an in-memory render. The source image is only a tracing reference, and its illustrated plants are absent from the map.

To correct the fixed map, run `npm run map:edit` from the repository and open `http://127.0.0.1:5174/tools/map-editor.html`. Toggle the tracing image, select a surface, drag or enter vertex coordinates, or draw a new polygon. **Save to repository** validates the edit, increments the map version, and writes `data/property-base.json` and `public/property-base.svg`. Review the diff and run `npm run check` before committing. This editor only runs on the local development server and is not included in the built site. Existing yard files reference their original map version and must be reconciled deliberately after a structural change.

## Setup

Use the Node.js LTS release in `.nvmrc` (for example, `nvm use`), then run:

```sh
npm ci
npx playwright install chromium webkit
npm run dev
```

Open the local URL printed by Vite. No account or deployment credentials are needed.

| Command                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | Run the local editor                                                 |
| `npm run format:check` | Check Prettier formatting                                            |
| `npm run lint`         | Run ESLint with zero warnings allowed                                |
| `npm run typecheck`    | Type-check app, tests, and tooling without output                    |
| `npm test`             | Run Vitest tests once                                                |
| `npm run test:watch`   | Run Vitest in watch mode                                             |
| `npm run build`        | Build the static site                                                |
| `npm run map:generate` | Regenerate the fixed SVG from the property JSON                      |
| `npm run map:edit`     | Run the local structural map editor                                  |
| `npm run test:e2e`     | Run Chromium and WebKit tests against a managed local preview server |
| `npm run check`        | Run all checks above in that order                                   |

GitHub Actions uses the same `npm run check` command after `npm ci` and Playwright browser installation.
