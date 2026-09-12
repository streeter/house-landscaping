# Repository guidance

- `data/property-base.json` is the structural map source. Regenerate `public/property-base.svg` with `npm run map:generate`; do not edit the SVG by hand.
- Map coordinates are feet in `0 0 40 120`: origin northeast, x south, y west. Do not guess obscured features from `data/property.jpg`; get placement details.
- Keep surface IDs stable. Add new surface kinds to the shared type, local editor, save validator, and SVG renderer. Structural map changes advance its version; only unchanged old surfaces plus additions qualify for yard-file upgrades.
- Preserve portable `yard.json` and browser drafts. Do not silently replace or merge yard data when maps differ.
- Run `npm run check`. Keep checks non-mutating and cover map/file behavior in Chromium and WebKit.
- Use a focused branch and small PR for each body of work; merge with `gh` after CI is green.
