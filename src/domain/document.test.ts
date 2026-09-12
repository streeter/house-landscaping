import { describe, expect, test } from "vitest";
import {
  newYardDocument,
  parseYardDocument,
  upgradeAdditiveMap,
} from "./document";

describe("yard document handoff", () => {
  test("new file starts with eight empty, unmapped zones, the documented schedule, and unknown execution settings", () => {
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
    document.referenceWeekStart = "2026-06-01";
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
    expect(parsed.calculated.referenceWeekStart).toBe("2026-06-01");
    expect(parsed.overlapNotes[0]?.stale).toBe(false);
  });

  test("opens earlier files with minute-based station delay", () => {
    const document = newYardDocument();
    const old = structuredClone(document) as unknown as {
      controller: { settings: Record<string, unknown> };
    };
    delete old.controller.settings.stationDelaySeconds;
    old.controller.settings.stationDelayMinutes = {
      value: 1.5,
      status: "confirmed",
    };
    expect(
      parseYardDocument(old).controller.settings.stationDelaySeconds,
    ).toEqual({
      value: 90,
      status: "confirmed",
    });
  });

  test("offers a deliberate upgrade only when old surfaces are unchanged", () => {
    const document = newYardDocument();
    document.location.name = "Existing yard";
    document.plants.push({
      id: "inside-added-surface",
      label: "Plant to check",
      species: null,
      position: [20, 70],
      group: null,
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
    });
    document.property.version -= 1;
    document.property.surfaces.pop();
    const upgraded = upgradeAdditiveMap(
      document,
      new Date("2026-09-12T12:00:00Z"),
    );
    expect(upgraded?.document.location.name).toBe("Existing yard");
    expect(upgraded?.document.property.version).toBe(
      document.property.version + 1,
    );
    expect(upgraded?.addedSurfaces.map((surface) => surface.id)).toEqual([
      "residence",
    ]);
    expect(upgraded?.plantsToReview).toEqual(["Plant to check"]);
    expect(upgraded?.document.plants[0]?.growingSetting.surfaceId).toBe("lawn");
    expect(upgraded?.document.exportId).toBeNull();
    document.property.surfaces[1]!.points[0] = [8, 8];
    expect(upgradeAdditiveMap(document)).toBeNull();
  });
});
