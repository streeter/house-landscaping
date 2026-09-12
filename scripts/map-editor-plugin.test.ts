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
});
