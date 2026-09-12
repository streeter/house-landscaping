import { describe, expect, it } from "vitest";
import { newYardDocument } from "./document";
import { calculateYardSchedule, unionIntervals } from "./timing";
import { renderYardSummary } from "./advice";

function fixture() {
  const document = newYardDocument(new Date("2026-09-07T12:00:00Z"));
  document.referenceWeekStart = "2026-09-07";
  document.location.timezone = "America/Los_Angeles";
  document.controller.state = "confirmed";
  document.controller.verifiedAt = "2026-09-06T12:00:00Z";
  const settings = document.controller.settings;
  settings.mode = { value: "stack", status: "confirmed" };
  settings.stationDelaySeconds = { value: 0, status: "confirmed" };
  settings.monthlyWaterBudgetEnabled = { value: false, status: "confirmed" };
  settings.rainDelayDays = { value: 0, status: "confirmed" };
  settings.sensorAdjustment = { value: "", status: "confirmed" };
  for (const program of settings.programs)
    program.waterBudgetPercent = { value: 100, status: "confirmed" };
  document.zones[0]!.stationNumber = 1;
  document.zones[1]!.stationNumber = 2;
  document.zones[0]!.polygons = [
    [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ],
  ];
  document.zones[1]!.polygons = [
    [
      [10, 0],
      [30, 0],
      [30, 20],
      [10, 20],
    ],
  ];
  const plant = {
    id: "plant-1",
    label: "Rose",
    species: "Rose",
    position: [15, 10] as [number, number],
    group: null,
    status: "existing" as const,
    establishmentDate: null,
    sizeNotes: "",
    sun: null,
    soil: null,
    notes: "",
    growingSetting: {
      kind: "ground" as const,
      surfaceId: "lawn",
      containerWidthFeet: null,
      containerDepthFeet: null,
      drainageNotes: null,
    },
    manualCoverage: null,
  };
  document.plants.push(plant);
  return document;
}

describe("controller timing", () => {
  it("sequences ascending stations and unions adjacent exposures without losing sources", () => {
    const document = fixture();
    const program = document.controller.settings.programs[0]!;
    program.weekdays = [0, 2, 4];
    program.startTimes = ["08:00"];
    program.stationRuntimes = [
      { stationNumber: 2, minutes: 10 },
      { stationNumber: 1, minutes: 10 },
    ];
    const result = calculateYardSchedule(document);
    expect(result.status).toBe("complete");
    expect(result.stationEvents).toHaveLength(6);
    expect(
      result.stationEvents.slice(0, 2).map((event) => event.stationNumber),
    ).toEqual([1, 2]);
    expect(
      result.stationEvents.slice(0, 2).map((event) => [event.start, event.end]),
    ).toEqual([
      ["2026-09-07T08:00:00-07:00", "2026-09-07T08:10:00-07:00"],
      ["2026-09-07T08:10:00-07:00", "2026-09-07T08:20:00-07:00"],
    ]);
    expect(result.plantPeriods[0]?.sourceEventIds).toHaveLength(6);
    expect(result.plantPeriods[0]?.intervals).toHaveLength(3);
    expect(result.plantPeriods[0]?.intervals[0]).toEqual({
      start: "2026-09-07T08:00:00-07:00",
      end: "2026-09-07T08:20:00-07:00",
    });
  });

  it("unions simultaneous, overlapping, adjacent, and separate intervals", () => {
    const interval = (start: number, end: number) => ({
      start: new Date(start * 60_000).toISOString(),
      end: new Date(end * 60_000).toISOString(),
    });
    expect(
      unionIntervals([
        interval(0, 10),
        interval(0, 10),
        interval(5, 15),
        interval(15, 20),
        interval(30, 40),
      ]),
    ).toEqual([interval(0, 20), interval(30, 40)]);
  });

  it("applies monthly budget, two cycles, station delay, and midnight crossing", () => {
    const document = fixture();
    document.controller.settings.monthlyWaterBudgetEnabled.value = true;
    const program = document.controller.settings.programs[0]!;
    program.weekdays = [5];
    program.startTimes = ["23:55"];
    program.stationRuntimes = [
      { stationNumber: 1, minutes: 10 },
      { stationNumber: 2, minutes: 10 },
    ];
    program.monthlyWaterBudget = [{ month: 9, percent: 150 }];
    document.controller.settings.stationDelaySeconds.value = 30;
    const result = calculateYardSchedule(document);
    expect(result.status).toBe("complete");
    expect(result.stationEvents).toHaveLength(4);
    expect(result.stationEvents[0]?.end).toBe("2026-09-13T00:02:30-07:00");
    expect(result.stationEvents[2]?.start).toBe("2026-09-13T00:11:00-07:00");
  });

  it("flags unverified concurrent station behavior instead of inventing an exact run", () => {
    const document = fixture();
    document.controller.settings.mode.value = "overlap";
    for (const program of document.controller.settings.programs.slice(0, 2)) {
      program.weekdays = [0];
      program.startTimes = ["08:00"];
      program.stationRuntimes = [{ stationNumber: 1, minutes: 10 }];
    }
    const result = calculateYardSchedule(document);
    expect(result.status).toBe("unresolved");
    expect(result.reason).toMatch(/Concurrent programs/);
    expect(result.stationEvents).toEqual([]);
  });

  it("waits for a repeat start of the same program", () => {
    const document = fixture();
    document.controller.settings.mode.value = "overlap";
    const program = document.controller.settings.programs[0]!;
    program.weekdays = [0];
    program.startTimes = ["08:00", "08:05"];
    program.stationRuntimes = [{ stationNumber: 1, minutes: 10 }];
    const result = calculateYardSchedule(document);
    expect(result.stationEvents.map((event) => event.start)).toEqual([
      "2026-09-07T08:00:00-07:00",
      "2026-09-07T08:10:00-07:00",
    ]);
  });

  it("keeps simultaneous different-station events and a single elapsed plant period", () => {
    const document = fixture();
    document.controller.settings.mode.value = "overlap";
    const [a, b] = document.controller.settings.programs;
    a!.weekdays = [0];
    a!.startTimes = ["08:00"];
    a!.stationRuntimes = [{ stationNumber: 1, minutes: 10 }];
    b!.weekdays = [0];
    b!.startTimes = ["08:00"];
    b!.stationRuntimes = [{ stationNumber: 2, minutes: 10 }];
    const result = calculateYardSchedule(document);
    expect(result.status).toBe("complete");
    expect(result.stationEvents).toHaveLength(2);
    expect(result.plantPeriods[0]?.sourceEventIds).toHaveLength(2);
    expect(result.plantPeriods[0]?.intervals).toEqual([
      {
        start: "2026-09-07T08:00:00-07:00",
        end: "2026-09-07T08:10:00-07:00",
      },
    ]);
  });

  it("cancels a stacked program still queued at midnight", () => {
    const document = fixture();
    const [a, b] = document.controller.settings.programs;
    a!.weekdays = [0];
    a!.startTimes = ["23:00"];
    a!.stationRuntimes = [{ stationNumber: 1, minutes: 120 }];
    b!.weekdays = [0];
    b!.startTimes = ["23:30"];
    b!.stationRuntimes = [{ stationNumber: 2, minutes: 10 }];
    const result = calculateYardSchedule(document);
    expect(result.status).toBe("complete");
    expect(result.stationEvents.map((event) => event.programId)).toEqual(["A"]);
    expect(result.stationEvents[0]?.end).toBe("2026-09-08T01:00:00-07:00");
  });

  it("withholds one watering assignment for a mixed group while retaining station events", () => {
    const document = fixture();
    document.plants[0]!.group = {
      count: 4,
      area: [
        [5, 5],
        [25, 5],
        [25, 15],
        [5, 15],
      ],
    };
    const program = document.controller.settings.programs[0]!;
    program.weekdays = [0];
    program.startTimes = ["08:00"];
    program.stationRuntimes = [
      { stationNumber: 1, minutes: 10 },
      { stationNumber: 2, minutes: 10 },
    ];
    const result = calculateYardSchedule(document);
    expect(result.status).toBe("partial");
    expect(result.reason).toMatch(/Mixed coverage/);
    expect(result.stationEvents).toHaveLength(2);
    expect(result.plantPeriods[0]?.effectiveZoneIds).toEqual([]);
    expect(result.plantPeriods[0]?.sourceEventIds).toEqual([]);
    expect(result.plantPeriods[0]?.intervals).toEqual([]);
    document.calculated = result;
    expect(renderYardSummary(document)).toContain("withheld for mixed group");
  });
});
