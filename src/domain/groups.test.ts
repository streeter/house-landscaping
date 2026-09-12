import { expect, test } from "vitest";
import { newYardDocument, type Plant } from "./document";
import { coveringZoneIds, pointInPolygon } from "./geometry";
import { splitPlantGroup } from "./groups";

test("splitting a mixed group retains notes, IDs, and distinct geometric coverage", () => {
  const document = newYardDocument();
  document.zones[0]!.polygons = [
    [
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ],
  ];
  document.zones[1]!.polygons = [
    [
      [10, 0],
      [20, 0],
      [20, 20],
      [10, 20],
    ],
  ];
  const plant: Plant = {
    id: "group-1",
    label: "Lavender",
    species: "Lavandula",
    position: [10, 10],
    group: {
      count: 6,
      area: [
        [5, 5],
        [15, 5],
        [15, 15],
        [5, 15],
      ],
    },
    status: "existing",
    establishmentDate: null,
    sizeNotes: "",
    sun: "full",
    soil: null,
    notes: "Older bed",
    growingSetting: {
      kind: "ground",
      surfaceId: "lawn",
      containerWidthFeet: null,
      containerDepthFeet: null,
      drainageNotes: null,
    },
    manualCoverage: null,
  };
  const [left, right] = splitPlantGroup(plant, "group-2");
  expect([left.id, right.id]).toEqual(["group-1", "group-2"]);
  expect([left.group?.count, right.group?.count]).toEqual([3, 3]);
  expect(left.notes).toBe("Older bed");
  expect(right.notes).toBe("Older bed");
  expect(pointInPolygon(left.position, left.group!.area)).toBe(true);
  expect(pointInPolygon(right.position, right.group!.area)).toBe(true);
  expect(coveringZoneIds(left.position, document.zones)).toEqual(["zone-1"]);
  expect(coveringZoneIds(right.position, document.zones)).toEqual(["zone-2"]);
});
