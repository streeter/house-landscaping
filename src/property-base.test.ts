import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { propertyBase, renderPropertySvg } from "./property-base";

describe("fixed property map", () => {
  test("preserves the lot coordinate system and orientation", () => {
    expect(propertyBase.widthFeet * propertyBase.lengthFeet).toBe(4800);
    expect(propertyBase.orientation.left).toBe("north");
    expect(propertyBase.orientation.bottom).toBe("west/driveway");
    expect(propertyBase.surfaces.map((surface) => surface.id)).toContain(
      "porch-stairs",
    );
    for (const surface of propertyBase.surfaces) {
      for (const [x, y] of surface.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(40);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(120);
      }
    }
  });

  test("committed SVG equals the in-memory render", async () => {
    const asset = await readFile(
      new URL("../public/property-base.svg", import.meta.url),
      "utf8",
    );
    expect(asset).toBe(renderPropertySvg());
    expect(asset).not.toContain("vegetation");
  });
});
