import { describe, expect, test } from "vitest";
import { newYardDocument, type Plant } from "./document";
import {
  coveringZoneIds,
  effectiveZoneIds,
  groupCrossingZoneIds,
  pointInPolygon,
  revalidateOverlapNotes,
} from "./geometry";

const square = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): [number, number][] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

describe("coverage geometry", () => {
  test("includes boundaries and disconnected polygons once", () => {
    const zones = newYardDocument().zones;
    zones[0]!.polygons = [square(0, 0, 10, 10), square(20, 20, 30, 30)];
    zones[1]!.polygons = [square(10, 0, 20, 10)];
    expect(pointInPolygon([10, 5], zones[0]!.polygons[0]!)).toBe(true);
    expect(coveringZoneIds([10, 5], zones)).toEqual(["zone-1", "zone-2"]);
    expect(coveringZoneIds([25, 25], zones)).toEqual(["zone-1"]);
  });

  test("manual correction remains distinct and never creates a hose relationship", () => {
    const document = newYardDocument();
    const plant: Plant = {
      id: "plant-1",
      label: "Pot",
      species: null,
      position: [10, 105],
      group: null,
      status: "existing",
      establishmentDate: null,
      sizeNotes: "",
      sun: null,
      soil: null,
      notes: "On the stairs",
      growingSetting: {
        kind: "container",
        surfaceId: "porch-stairs",
        containerWidthFeet: 1,
        containerDepthFeet: 1,
        drainageNotes: null,
      },
      manualCoverage: {
        zoneIds: ["zone-2"],
        reason: "Observed spray reaches this pot",
      },
    };
    document.zones[0]!.polygons = [square(8, 103, 12, 107)];
    expect(coveringZoneIds(plant.position, document.zones)).toEqual(["zone-1"]);
    expect(effectiveZoneIds(plant, document.zones)).toEqual(["zone-2"]);
  });

  test("geometry changes stale only affected overlap notes", () => {
    const document = newYardDocument();
    document.zones[0]!.polygons = [square(0, 0, 15, 15)];
    document.zones[1]!.polygons = [square(5, 5, 20, 20)];
    const notes = [
      {
        id: "note-1",
        point: [10, 10] as [number, number],
        zoneIds: ["zone-1", "zone-2"],
        relationship: "shared-hose" as const,
        notes: "Same hose",
        stale: false,
      },
    ];
    expect(revalidateOverlapNotes(notes, document.zones)[0]?.stale).toBe(false);
    document.zones[1]!.polygons = [square(20, 20, 30, 30)];
    expect(revalidateOverlapNotes(notes, document.zones)[0]?.stale).toBe(true);
  });

  test("group crossing a coverage edge is flagged", () => {
    const document = newYardDocument();
    document.zones[0]!.polygons = [square(0, 0, 10, 10)];
    const plant: Plant = {
      id: "group",
      label: "Bed",
      species: "Lavender",
      position: [10, 5],
      group: { count: 3, area: square(8, 3, 12, 7) },
      status: "existing",
      establishmentDate: null,
      sizeNotes: "",
      sun: null,
      soil: null,
      notes: "",
      growingSetting: {
        kind: "ground",
        surfaceId: "lawn",
        containerWidthFeet: null,
        containerDepthFeet: null,
        drainageNotes: null,
      },
      manualCoverage: null,
    };
    expect(groupCrossingZoneIds(plant, document.zones)).toEqual(["zone-1"]);
    document.zones[0]!.polygons = [square(8.2, 0, 8.4, 10)];
    expect(groupCrossingZoneIds(plant, document.zones)).toEqual(["zone-1"]);
    document.zones[0]!.polygons = [square(0, 0, 10, 10)];
    document.zones[1]!.polygons = [square(10, 0, 20, 10)];
    plant.position = [8, 5];
    plant.group!.area = square(5, 3, 10, 7);
    expect(groupCrossingZoneIds(plant, document.zones)).toEqual([]);
  });
});
