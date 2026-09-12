import { writeFile } from "node:fs/promises";
import { renderPropertySvg } from "../src/property-base.ts";

await writeFile(
  new URL("../public/property-base.svg", import.meta.url),
  renderPropertySvg(),
);
