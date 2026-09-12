import { describe, expect, test } from "vitest";
import { newYardDocument, parseYardDocument } from "./document";

describe("yard document handoff", () => {
  test("new file starts with eight empty, unmapped zones and unknown controller settings", () => {
    const document = newYardDocument(new Date("2026-09-11T18:00:00Z"));
    expect(document.zones).toHaveLength(8);
    expect(
      document.zones.every(
        (zone) => zone.stationNumber === null && zone.polygons.length === 0,
      ),
    ).toBe(true);
    expect(document.controller.settings.mode.status).toBe("unknown");
    expect(parseYardDocument(JSON.parse(JSON.stringify(document))).id).toBe(
      document.id,
    );
  });

  test("rejects incompatible maps, bad references, and malformed records", () => {
    const document = newYardDocument();
    expect(() =>
      parseYardDocument({ ...document, schemaVersion: 2 }),
    ).toThrow();
    expect(() =>
      parseYardDocument({
        ...document,
        property: { ...document.property, version: 2 },
      }),
    ).toThrow();
    expect(() => parseYardDocument({ ...document, zones: [] })).toThrow();
    expect(() =>
      parseYardDocument({ ...document, plants: [{ id: "broken" }] }),
    ).toThrow();
    const duplicateStations = structuredClone(document);
    duplicateStations.zones[0]!.stationNumber = 3;
    duplicateStations.zones[1]!.stationNumber = 3;
    expect(() => parseYardDocument(duplicateStations)).toThrow(
      "Duplicate station mapping",
    );
  });

  test("discards imported calculations and revalidates overlap notes", () => {
    const document = newYardDocument();
    document.zones[0]!.polygons = [
      [
        [0, 0],
        [15, 0],
        [15, 15],
        [0, 15],
      ],
    ];
    document.zones[1]!.polygons = [
      [
        [5, 5],
        [20, 5],
        [20, 20],
        [5, 20],
      ],
    ];
    document.overlapNotes = [
      {
        id: "note",
        point: [10, 10],
        zoneIds: ["zone-1", "zone-2"],
        relationship: "shared-hose",
        notes: "Observed together",
        stale: true,
      },
    ];
    const input = { ...document, calculated: { weeklyMinutes: 999999 } };
    const parsed = parseYardDocument(input);
    expect(parsed.calculated.stationEvents).toEqual([]);
    expect(parsed.overlapNotes[0]?.stale).toBe(false);
  });
});
