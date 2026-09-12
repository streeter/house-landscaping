# Yard planner

A local, file-based yard map and care planner. The implementation follows [the project plan](docs/yard-planning-tool.md). The fixed property map is in place; editing and schedule features follow in subsequent PRs.

The map uses feet in a `0 0 40 120` coordinate system. [The structural geometry](data/property-base.json) is its source of truth, with named surfaces and explicit approximate edges. `npm run map:generate` regenerates the committed SVG; the unit test checks the asset against an in-memory render. The source image is only a tracing reference, and its illustrated plants are absent from the map.

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
| `npm run test:e2e`     | Run Chromium and WebKit tests against a managed local preview server |
| `npm run check`        | Run all checks above in that order                                   |

GitHub Actions uses the same `npm run check` command after `npm ci` and Playwright browser installation.
