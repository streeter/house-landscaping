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

  test("renders raised planters as a distinct structural surface", () => {
    const base = structuredClone(propertyBase);
    base.surfaces.push({
      id: "raised-planter",
      label: "Raised planter",
      kind: "planter",
      points: [
        [20, 6],
        [25, 6],
        [25, 10],
        [20, 10],
      ],
      approximate: true,
    });
    expect(renderPropertySvg(base)).toContain(
      'id="raised-planter" data-kind="planter"',
    );
  });

  test("renders terraces with their own surface type and color", () => {
    const base = structuredClone(propertyBase);
    base.surfaces.find((surface) => surface.id === "patio")!.kind = "terrace";
    expect(renderPropertySvg(base)).toContain('id="patio" data-kind="terrace"');
    expect(renderPropertySvg(base)).toContain('fill="#c9c4b2"');
  });
});
