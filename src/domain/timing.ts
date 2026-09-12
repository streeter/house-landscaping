import { coveringZoneIds, effectiveZoneIds } from "./geometry";
import type {
  Calculated,
  ControllerSettings,
  YardDocumentV1,
} from "./document";

type Program = ControllerSettings["programs"][number];
type Event = Calculated["stationEvents"][number];
interface Request {
  at: number;
  program: Program;
  day: number;
  startIndex: number;
}
const dayMs = 86_400_000;

function offsetMinutes(timezone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const number = (kind: string) =>
    Number(parts.find((part) => part.type === kind)?.value);
  const local = Date.UTC(
    number("year"),
    number("month") - 1,
    number("day"),
    number("hour"),
    number("minute"),
    number("second"),
  );
  return Math.round((local - instant) / 60_000);
}

function localMidnight(date: string, timezone: string): number {
  const nominal = Date.parse(`${date}T00:00:00Z`);
  let instant = nominal - offsetMinutes(timezone, nominal) * 60_000;
  instant = nominal - offsetMinutes(timezone, instant) * 60_000;
  return instant;
}

function stamp(instant: number, timezone: string): string {
  const offset = offsetMinutes(timezone, instant);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const local = new Date(instant + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function unionIntervals(
  intervals: { start: string; end: string }[],
): { start: string; end: string }[] {
  const sorted = [...intervals].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  const result: typeof sorted = [];
  for (const interval of sorted) {
    const last = result.at(-1);
    if (last && Date.parse(interval.start) <= Date.parse(last.end)) {
      if (Date.parse(interval.end) > Date.parse(last.end))
        last.end = interval.end;
    } else result.push({ ...interval });
  }
  return result;
}

function unresolved(document: YardDocumentV1, reason: string): Calculated {
  return {
    status: "unresolved",
    reason,
    referenceWeekStart: document.referenceWeekStart,
    timezone: document.location.timezone,
    stationEvents: [],
    plantPeriods: [],
    overlapPeriods: [],
  };
}

function budget(
  program: Program,
  month: number,
  settings: ControllerSettings,
): number | null {
  if (settings.monthlyWaterBudgetEnabled.value === null) return null;
  if (settings.monthlyWaterBudgetEnabled.value) {
    return (
      program.monthlyWaterBudget.find((item) => item.month === month)
        ?.percent ?? null
    );
  }
  return program.waterBudgetPercent.value;
}

/** Expected operation for a local Monday–Sunday week; source records are never mutated. */
export function calculateYardSchedule(document: YardDocumentV1): Calculated {
  const timezone = document.location.timezone;
  const settings = document.controller.settings;
  if (!timezone) return unresolved(document, "Property timezone is unknown.");
  let weekStart: number;
  try {
    weekStart = localMidnight(document.referenceWeekStart, timezone);
  } catch {
    return unresolved(document, "Property timezone is invalid.");
  }
  const weekEnd = localMidnight(
    new Date(Date.parse(`${document.referenceWeekStart}T00:00:00Z`) + 7 * dayMs)
      .toISOString()
      .slice(0, 10),
    timezone,
  );
  if (weekEnd - weekStart !== 7 * dayMs)
    return unresolved(
      document,
      "A daylight-saving transition in the reference week needs controller verification.",
    );
  if (
    settings.mode.value === null ||
    settings.stationDelaySeconds.value === null ||
    settings.monthlyWaterBudgetEnabled.value === null
  )
    return unresolved(
      document,
      "Stack/Overlap mode, station delay, or monthly water budget use is unknown.",
    );
  if (
    settings.rainDelayDays.value === null ||
    settings.rainDelayDays.value > 0 ||
    settings.sensorAdjustment.value === null ||
    settings.sensorAdjustment.value.trim()
  )
    return unresolved(
      document,
      "Rain delay or sensor/weather adjustment needs verification.",
    );

  const requests: Request[] = [];
  const monday = Date.parse(`${document.referenceWeekStart}T00:00:00Z`);
  for (let day = -2; day <= 6; day++) {
    const date = new Date(monday + day * dayMs).toISOString().slice(0, 10);
    const midnight = localMidnight(date, timezone);
    const weekday = ((day % 7) + 7) % 7;
    for (const program of settings.programs) {
      if (!program.weekdays.includes(weekday)) continue;
      for (const [startIndex, time] of program.startTimes.entries()) {
        const [hour, minute] = time.split(":").map(Number);
        requests.push({
          at: midnight + (hour! * 60 + minute!) * 60_000,
          program,
          day,
          startIndex,
        });
      }
    }
  }
  requests.sort((a, b) => a.at - b.at);
  const available: Record<string, number> = {
    A: -Infinity,
    B: -Infinity,
    C: -Infinity,
  };
  let globalAvailable = -Infinity;
  const allEvents: Event[] = [];
  let ambiguity: string | null = null;
  for (const request of requests) {
    if (
      requests.some(
        (other) =>
          other !== request &&
          other.at === request.at &&
          other.program.id !== request.program.id &&
          settings.mode.value === "stack",
      )
    ) {
      ambiguity =
        "Equal-time starts in Stack mode have unverified queue priority.";
      break;
    }
    const month = new Date(monday + request.day * dayMs).getUTCMonth() + 1;
    const percent = budget(request.program, month, settings);
    if (percent === null)
      return unresolved(
        document,
        `Water budget for program ${request.program.id} in month ${month} is unknown.`,
      );
    if (percent === 0) continue;
    const start = Math.max(
      request.at,
      available[request.program.id]!,
      settings.mode.value === "stack" ? globalAvailable : -Infinity,
    );
    const midnightAfter = localMidnight(
      new Date(monday + (request.day + 1) * dayMs).toISOString().slice(0, 10),
      timezone,
    );
    if (
      settings.mode.value === "stack" &&
      start >= midnightAfter &&
      start > request.at
    )
      continue;
    let cursor = start;
    const cycles = percent > 100 ? 2 : 1;
    const runtimes = [...request.program.stationRuntimes]
      .filter((item) => item.minutes > 0)
      .sort((a, b) => a.stationNumber - b.stationNumber);
    for (let cycle = 0; cycle < cycles; cycle++) {
      for (const [index, runtime] of runtimes.entries()) {
        const duration = (runtime.minutes * percent * 600) / cycles;
        const end = cursor + duration;
        const zone = document.zones.find(
          (item) => item.stationNumber === runtime.stationNumber,
        );
        if (zone && end > weekStart && cursor < weekEnd) {
          allEvents.push({
            id: `${request.program.id}-${request.day}-${request.startIndex}-${cycle}-${runtime.stationNumber}`,
            zoneId: zone.id,
            programId: request.program.id,
            stationNumber: runtime.stationNumber,
            start: stamp(cursor, timezone),
            end: stamp(end, timezone),
          });
        }
        cursor = end;
        if (index < runtimes.length - 1 || cycle < cycles - 1)
          cursor += settings.stationDelaySeconds.value * 1000;
      }
    }
    available[request.program.id] = cursor;
    if (settings.mode.value === "stack") globalAvailable = cursor;
  }
  if (ambiguity) return unresolved(document, ambiguity);
  allEvents.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (settings.mode.value === "overlap") {
    for (let index = 0; index < allEvents.length; index++) {
      const event = allEvents[index]!;
      if (
        allEvents
          .slice(index + 1)
          .some(
            (other) =>
              other.stationNumber === event.stationNumber &&
              other.programId !== event.programId &&
              Date.parse(other.start) < Date.parse(event.end) &&
              Date.parse(other.end) > Date.parse(event.start),
          )
      )
        return unresolved(
          document,
          "Concurrent programs requesting one station have unverified behavior.",
        );
    }
  }
  const period = (
    id: string,
    geometric: string[],
    effective: string[],
    sourceNoteIds: string[],
  ) => {
    const sources = allEvents.filter((event) =>
      effective.includes(event.zoneId),
    );
    return {
      id,
      geometricZoneIds: geometric,
      effectiveZoneIds: effective,
      sourceEventIds: sources.map((event) => event.id),
      intervals: unionIntervals(
        sources.map(({ start, end }) => ({ start, end })),
      ),
      sourceNoteIds,
    };
  };
  const plantPeriods = document.plants
    .filter((plant) => plant.status !== "retired")
    .map((plant) => {
      const geometric = coveringZoneIds(plant.position, document.zones);
      const effective = effectiveZoneIds(plant, document.zones);
      const notes = document.overlapNotes
        .filter(
          (note) =>
            !note.stale &&
            note.zoneIds.every((zoneId) => effective.includes(zoneId)),
        )
        .map((note) => note.id);
      return period(plant.id, geometric, effective, notes);
    });
  const overlapPeriods = document.overlapNotes
    .filter((note) => !note.stale)
    .map((note) => period(note.id, note.zoneIds, note.zoneIds, [note.id]));
  const assumed =
    settings.mode.status === "assumed" ||
    settings.stationDelaySeconds.status === "assumed" ||
    settings.monthlyWaterBudgetEnabled.status === "assumed" ||
    settings.rainDelayDays.status === "assumed" ||
    settings.sensorAdjustment.status === "assumed" ||
    settings.programs.some(
      (program) => program.waterBudgetPercent.status === "assumed",
    );
  const unmapped = document.zones.some(
    (zone) => zone.polygons.length > 0 && zone.stationNumber === null,
  );
  const provisional =
    document.controller.state !== "confirmed" ||
    document.controller.verifiedAt === null ||
    assumed ||
    unmapped;
  return {
    status: provisional ? "partial" : "complete",
    reason: unmapped
      ? "A coverage zone has no confirmed controller station mapping."
      : provisional
        ? "Timing uses proposed, unverified, or assumed controller settings."
        : null,
    referenceWeekStart: document.referenceWeekStart,
    timezone,
    stationEvents: allEvents,
    plantPeriods,
    overlapPeriods,
  };
}
