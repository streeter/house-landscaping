import { describe, expect, test } from "vitest";
import {
  applyDefaultSchedule,
  defaultSchedulePrograms,
} from "./default-schedule";
import { newYardDocument, parseYardDocument } from "./document";
import { calculateYardSchedule } from "./timing";

const expected = [
  {
    id: "A",
    weekdays: [0, 2, 4],
    startTimes: ["08:00"],
    minutes: [10, 35, 35, 15, 20, 35, 35, 15, 10],
  },
  {
    id: "B",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startTimes: [],
    minutes: [0, 50, 50, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "C",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startTimes: [],
    minutes: [0, 0, 0, 0, 0, 50, 55, 0, 0],
  },
];

describe("documented default schedule", () => {
  test("new yards contain the exact documented programs, including unused Station 9", () => {
    const document = newYardDocument();
    expect(
      document.controller.settings.programs.map((program) => ({
        id: program.id,
        weekdays: program.weekdays,
        startTimes: program.startTimes,
        minutes: program.stationRuntimes.map((runtime) => runtime.minutes),
      })),
    ).toEqual(expected);
    expect(
      document.controller.settings.programs[0]!.stationRuntimes.reduce(
        (sum, runtime) => sum + runtime.minutes,
        0,
      ),
    ).toBe(210);
    expect(document.zones.some((zone) => zone.stationNumber === 9)).toBe(false);
    expect(document.controller.settings.stationDelaySeconds.value).toBeNull();
    expect(
      document.controller.settings.programs[0]!.waterBudgetPercent.value,
    ).toBeNull();
    document.controller.settings.programs[0]!.weekdays.push(1);
    document.controller.settings.programs[0]!.stationRuntimes[0]!.minutes = 99;
    expect(newYardDocument().controller.settings.programs).toEqual(
      defaultSchedulePrograms(),
    );
  });

  test("loading defaults preserves budgets, execution settings, and yard records but clears old verification", () => {
    const document = newYardDocument();
    document.controller.state = "confirmed";
    document.controller.effectiveDate = "2026-09-07";
    document.controller.verifiedAt = "2026-09-07T12:00:00Z";
    document.controller.settings.stationDelaySeconds = {
      value: 30,
      status: "confirmed",
    };
    document.controller.settings.programs.reverse();
    const program = document.controller.settings.programs[0]!;
    program.weekdays = [1];
    program.startTimes = ["19:00"];
    program.stationRuntimes = [{ stationNumber: 1, minutes: 7 }];
    program.waterBudgetPercent = { value: 80, status: "confirmed" };
    program.monthlyWaterBudget = [{ month: 9, percent: 120 }];
    const before = structuredClone(document);
    const result = applyDefaultSchedule(document);
    expect(result.controller.settings.programs[0]).toEqual({
      ...defaultSchedulePrograms()[2],
      waterBudgetPercent: program.waterBudgetPercent,
      monthlyWaterBudget: program.monthlyWaterBudget,
    });
    expect(result.controller.settings.stationDelaySeconds).toEqual(
      document.controller.settings.stationDelaySeconds,
    );
    expect({ ...result, controller: document.controller }).toEqual(document);
    expect(result.controller.state).toBe("proposed");
    expect(result.controller.verifiedAt).toBeNull();
    expect(result.controller.effectiveDate).toBeNull();
    expect(document).toEqual(before);
    expect(
      parseYardDocument(JSON.parse(JSON.stringify(document))).controller,
    ).toEqual(document.controller);
  });

  test("only A starts automatically despite all B/C weekdays being enabled", () => {
    const document = newYardDocument(new Date("2026-09-07T12:00:00Z"));
    document.location.timezone = "America/Los_Angeles";
    const settings = document.controller.settings;
    settings.mode = { value: "stack", status: "confirmed" };
    settings.stationDelaySeconds = { value: 0, status: "confirmed" };
    settings.monthlyWaterBudgetEnabled = { value: false, status: "confirmed" };
    settings.rainDelayDays = { value: 0, status: "confirmed" };
    settings.sensorAdjustment = { value: "none", status: "confirmed" };
    settings.programs.forEach((program) => {
      program.waterBudgetPercent = { value: 100, status: "confirmed" };
    });
    document.zones.forEach((zone, index) => {
      zone.stationNumber = index + 1;
    });
    const result = calculateYardSchedule(document);
    expect(result.stationEvents).toHaveLength(24);
    expect(
      new Set(result.stationEvents.map((event) => event.programId)),
    ).toEqual(new Set(["A"]));
    expect(
      result.stationEvents
        .filter((event) => event.stationNumber === 1)
        .map((event) => event.start),
    ).toEqual([
      "2026-09-07T08:00:00-07:00",
      "2026-09-09T08:00:00-07:00",
      "2026-09-11T08:00:00-07:00",
    ]);
    expect(result.stationEvents[7]?.end).toBe("2026-09-07T11:20:00-07:00");
    expect(
      result.stationEvents.some((event) => event.stationNumber === 9),
    ).toBe(false);
  });
});
