import {
  coveringZoneIds,
  effectiveZoneIds,
  groupCrossingZoneIds,
} from "./geometry";
import type { YardDocumentV1 } from "./document";

const display = (value: string | null | undefined) =>
  value?.trim() ? value.trim() : "unknown";
const zoneNames = (ids: string[], document: YardDocumentV1) =>
  ids.length
    ? ids
        .map((id) => document.zones.find((zone) => zone.id === id)?.name ?? id)
        .join(", ")
    : "none mapped";

export function needsChecking(document: YardDocumentV1): string[] {
  const result: string[] = [];
  if (!document.location.timezone)
    result.push("Confirm the property timezone.");
  if (!document.location.name)
    result.push("Add the property location or climate context.");
  for (const zone of document.zones) {
    if (zone.stationNumber === null)
      result.push(`Map ${zone.name} to its controller station.`);
    if (zone.polygons.length === 0)
      result.push(`Draw coverage for ${zone.name}, or confirm it has none.`);
  }
  for (const plant of document.plants.filter(
    (item) => item.status !== "retired",
  )) {
    if (!plant.species) result.push(`Identify ${plant.label} (${plant.id}).`);
    if (effectiveZoneIds(plant, document.zones).length === 0)
      result.push(`Check automatic coverage for ${plant.label} (${plant.id}).`);
    if (groupCrossingZoneIds(plant, document.zones).length > 0)
      result.push(
        `Split or redraw mixed-coverage group ${plant.label} (${plant.id}).`,
      );
  }
  for (const note of document.overlapNotes.filter((item) => item.stale))
    result.push(`Recheck stale overlap note ${note.id}.`);
  if (document.calculated.status !== "complete")
    result.push(
      `Verify controller timing: ${document.calculated.reason ?? "incomplete prediction"}`,
    );
  return result;
}

export function renderYardSummary(document: YardDocumentV1): string {
  const calculated = document.calculated;
  const lines = [
    "# Yard care summary",
    "",
    `Export ID: ${document.exportId ?? "draft"}`,
    `Exported at: ${document.exportedAt ?? "not exported"}`,
    `Reference week: ${document.referenceWeekStart}`,
    `Property timezone: ${display(document.location.timezone)}`,
    `Location: ${display(document.location.name)}`,
    `Controller: ${document.controller.state}; verified ${display(document.controller.verifiedAt)}`,
    `Calculation: ${calculated.status}${calculated.reason ? ` — ${calculated.reason}` : ""}`,
    "",
    "The map is an approximate structural trace. Coverage polygons describe areas, not emitter flow. Intervals predict scheduled operation; actual watering and volume are unknown.",
    "",
    "## Programs",
    "",
  ];
  for (const program of document.controller.settings.programs) {
    lines.push(`### Program ${program.id}`, "");
    lines.push(
      `Weekdays: ${program.weekdays.map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", ") || "none"}`,
    );
    lines.push(`Starts: ${program.startTimes.join(", ") || "none"}`);
    lines.push(
      `Station runtimes: ${program.stationRuntimes.map((runtime) => `${runtime.stationNumber}: ${runtime.minutes} min`).join(", ") || "none"}`,
    );
    lines.push(
      `Basic water budget: ${program.waterBudgetPercent.value ?? "unknown"}% (${program.waterBudgetPercent.status})`,
    );
    lines.push(
      `Monthly budgets: ${program.monthlyWaterBudget.map((item) => `${item.month}: ${item.percent}%`).join(", ") || "none entered"}`,
      "",
    );
  }
  lines.push("## Plants by effective coverage", "");
  const groups = new Map<string, typeof document.plants>();
  for (const plant of document.plants.filter(
    (item) => item.status !== "retired",
  )) {
    const key = effectiveZoneIds(plant, document.zones).sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), plant]);
  }
  for (const [key, plants] of groups) {
    const ids = key ? key.split("|") : [];
    lines.push(`### ${zoneNames(ids, document)}`, "");
    for (const plant of plants) {
      const period = calculated.plantPeriods.find(
        (item) => item.id === plant.id,
      );
      lines.push(
        `- **${plant.label}** (${plant.status}; ${display(plant.species)}; ID ${plant.id})`,
      );
      lines.push(
        `  - Setting: ${plant.growingSetting.kind} on ${plant.growingSetting.surfaceId}; ${plant.group ? `${plant.group.count} plants in a drawn group` : "single plant"}.`,
      );
      lines.push(
        `  - Sun: ${display(plant.sun)}; soil: ${display(plant.soil)}; established: ${display(plant.establishmentDate)}; size: ${display(plant.sizeNotes)}.`,
      );
      lines.push(
        `  - Geometric coverage: ${zoneNames(coveringZoneIds(plant.position, document.zones), document)}; effective coverage: ${zoneNames(ids, document)}${plant.manualCoverage ? ` (manual correction: ${plant.manualCoverage.reason})` : ""}.`,
      );
      lines.push(
        `  - Predicted elapsed periods: ${period?.intervals.length ? period.intervals.map((item) => `${item.start} to ${item.end}`).join("; ") : "none calculable"}. Source station event IDs: ${period?.sourceEventIds.length ? period.sourceEventIds.join(", ") : "none"}.`,
      );
      lines.push(`  - Notes: ${display(plant.notes)}`);
    }
    lines.push("");
  }
  lines.push("## Source context", "");
  for (const note of document.overlapNotes)
    lines.push(
      `- ${note.id}: ${zoneNames(note.zoneIds, document)}; ${note.relationship}; ${note.stale ? "stale" : "current"}; ${display(note.notes)}.`,
    );
  if (document.overlapNotes.length === 0)
    lines.push("No physical source relationships recorded.");
  lines.push("", "## Care history and decisions", "");
  for (const record of document.observations)
    lines.push(
      `- Observation ${record.at} for ${record.target.kind} ${record.target.id ?? "property"}: ${record.text}`,
    );
  for (const task of document.tasks)
    lines.push(
      `- Task due ${task.dueDate} for ${task.target.kind} ${task.target.id ?? "property"}: ${task.notes}; repeat ${task.repeatDays ? `every ${task.repeatDays} days` : "none"}; ${task.completedAt ? `completed ${task.completedAt}` : "open"}.`,
    );
  for (const record of document.scheduleRecords)
    lines.push(
      `- Schedule decision ${record.effectiveDate}: ${record.state}; verified ${record.verifiedAt ?? "not yet"}; source export ${record.sourceExportId ?? "none"}; ${display(record.notes)}.`,
    );
  if (
    document.observations.length +
      document.tasks.length +
      document.scheduleRecords.length ===
    0
  )
    lines.push("No care records or saved schedule decisions yet.");
  lines.push("", "## Needs checking", "");
  const checks = needsChecking(document);
  lines.push(
    ...(checks.length
      ? checks.map((item) => `- ${item}`)
      : ["No outstanding checks identified."]),
  );
  lines.push("");
  return lines.join("\n");
}

export function renderAdvicePrompt(document: YardDocumentV1): string {
  return `Use the attached yard.json and yard-summary.md for care advice. Export ID ${document.exportId ?? "draft"}, exported ${document.exportedAt ?? "not exported"}; reference week ${document.referenceWeekStart}, timezone ${display(document.location.timezone)}. Controller settings are ${document.controller.state} and were verified ${display(document.controller.verifiedAt)}. Treat calculated intervals as predicted, with status ${document.calculated.status}${document.calculated.reason ? ` (${document.calculated.reason})` : ""}; do not infer observed watering or water volume. Distinguish confirmed facts, estimates, unknowns, planned plants, and proposed schedules. Recommend care, weekday-based schedules expressible through Rain Dial programs A/B/C, maintenance tasks, and questions that would resolve missing information. Preserve plant and zone IDs when referring to records. Do not claim that overlapping zones share a hose unless a source note says so.`;
}
