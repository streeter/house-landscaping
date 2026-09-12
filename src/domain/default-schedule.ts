import type { ControllerSettings, YardDocumentV1 } from "./document";

/** Owner's documented RD-900-R program values; zero minutes means Off. */
export function defaultSchedulePrograms(): ControllerSettings["programs"] {
  const runtimes = {
    A: [10, 35, 35, 15, 20, 35, 35, 15, 10],
    B: [0, 50, 50, 0, 0, 0, 0, 0, 0],
    C: [0, 0, 0, 0, 0, 50, 55, 0, 0],
  };
  return (["A", "B", "C"] as const).map((id) => ({
    id,
    weekdays: id === "A" ? [0, 2, 4] : [0, 1, 2, 3, 4, 5, 6],
    startTimes: id === "A" ? ["08:00"] : [],
    stationRuntimes: runtimes[id].map((minutes, index) => ({
      stationNumber: index + 1,
      minutes,
    })),
    waterBudgetPercent: { value: null, status: "unknown" },
    monthlyWaterBudget: [],
  }));
}

export function applyDefaultSchedule(document: YardDocumentV1): YardDocumentV1 {
  const defaults = defaultSchedulePrograms();
  return {
    ...document,
    controller: {
      ...document.controller,
      // A previously verified custom schedule does not verify this replacement.
      state: "proposed",
      effectiveDate: null,
      verifiedAt: null,
      settings: {
        ...document.controller.settings,
        programs: document.controller.settings.programs.map((program) => {
          const baseline = defaults.find((item) => item.id === program.id)!;
          return {
            ...program,
            weekdays: baseline.weekdays,
            startTimes: baseline.startTimes,
            stationRuntimes: baseline.stationRuntimes,
          };
        }),
      },
    },
  };
}
