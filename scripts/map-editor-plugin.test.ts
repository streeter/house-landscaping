import { describe, expect, test } from "vitest";
import { propertyBase } from "../src/property-base";
import { validateMapEdit } from "./map-editor-plugin";

describe("local map save", () => {
  test("increments the version after a valid structural edit", () => {
    const input = structuredClone(propertyBase);
    input.surfaces.find((surface) => surface.id === "patio")!.label =
      "Revised patio";
    const saved = validateMapEdit(input, propertyBase);
    expect(saved.version).toBe(propertyBase.version + 1);
    expect(
      saved.surfaces.find((surface) => surface.id === "patio")?.label,
    ).toBe("Revised patio");
    expect(
      propertyBase.surfaces.find((surface) => surface.id === "patio")?.label,
    ).toBe("Patio");
  });

  test("rejects stale versions and out-of-bounds vertices", () => {
    const input = structuredClone(propertyBase);
    input.version += 1;
    expect(() => validateMapEdit(input, propertyBase)).toThrow("reload");
    input.version = propertyBase.version;
    input.surfaces[1]!.points[0] = [41, 0];
    expect(() => validateMapEdit(input, propertyBase)).toThrow(
      "inside the lot",
    );
  });

  test("accepts a raised planter surface", () => {
    const input = structuredClone(propertyBase);
    input.surfaces.push({
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
    const saved = validateMapEdit(input, propertyBase);
    expect(saved.surfaces.at(-1)?.kind).toBe("planter");
  });

  test("accepts a terrace surface without changing stable IDs", () => {
    const input = structuredClone(propertyBase);
    input.surfaces.find((surface) => surface.id === "patio")!.kind = "terrace";
    const saved = validateMapEdit(input, propertyBase);
    expect(saved.surfaces.find((surface) => surface.id === "patio")?.kind).toBe(
      "terrace",
    );
    expect(saved.surfaces[0]).toMatchObject({ id: "lawn", kind: "ground" });
  });
});
