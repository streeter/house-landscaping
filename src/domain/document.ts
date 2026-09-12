import { z } from "zod";
import { propertyBase, type PropertyBase } from "../property-base";
import { revalidateOverlapNotes } from "./geometry";

const id = z.string().min(1);
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const point = z.tuple([z.number().finite(), z.number().finite()]);
const polygon = z.array(point).min(3);
const settingStatus = z.enum(["confirmed", "assumed", "unknown"]);
const setting = <T extends z.ZodType>(value: T) =>
  z.strictObject({ value: value.nullable(), status: settingStatus });
const target = z.strictObject({
  kind: z.enum(["property", "plant", "zone"]),
  id: id.nullable(),
});

const plant = z.strictObject({
  id,
  label: z.string().min(1),
  species: z.string().nullable(),
  position: point,
  group: z
    .strictObject({ count: z.number().int().min(2), area: polygon })
    .nullable(),
  status: z.enum(["existing", "planned", "retired"]),
  establishmentDate: date.nullable(),
  sizeNotes: z.string(),
  sun: z.string().nullable(),
  soil: z.string().nullable(),
  notes: z.string(),
  growingSetting: z.strictObject({
    kind: z.enum(["ground", "container", "planting-pocket"]),
    surfaceId: id,
    containerWidthFeet: z.number().positive().nullable(),
    containerDepthFeet: z.number().positive().nullable(),
    drainageNotes: z.string().nullable(),
  }),
  manualCoverage: z
    .strictObject({ zoneIds: z.array(id), reason: z.string().min(1) })
    .nullable(),
});

const zone = z.strictObject({
  id,
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  stationNumber: z.number().int().min(1).max(9).nullable(),
  polygons: z.array(polygon),
});

const overlapNote = z.strictObject({
  id,
  point,
  zoneIds: z.array(id).min(2),
  relationship: z.enum(["shared-hose", "independent-sources"]),
  notes: z.string(),
  stale: z.boolean(),
});

const program = z.strictObject({
  id: z.enum(["A", "B", "C"]),
  weekdays: z.array(z.number().int().min(0).max(6)),
  startTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(3),
  stationRuntimes: z.array(
    z.strictObject({
      stationNumber: z.number().int().min(1).max(9),
      minutes: z.number().min(0),
    }),
  ),
  waterBudgetPercent: setting(z.number().min(0).max(200)),
  monthlyWaterBudget: z.array(
    z.strictObject({
      month: z.number().int().min(1).max(12),
      percent: z.number().min(0).max(200),
    }),
  ),
});

const controllerSettings = z.strictObject({
  model: z.literal("Irritrol Rain Dial RD-900-R"),
  mode: setting(z.enum(["stack", "overlap"])),
  stationDelaySeconds: setting(z.number().int().min(0).max(7200)),
  monthlyWaterBudgetEnabled: setting(z.boolean()),
  rainDelayDays: setting(z.number().int().min(0)),
  sensorAdjustment: setting(z.string()),
  programs: z.array(program).length(3),
});

const interval = z.strictObject({ start: timestamp, end: timestamp });
const stationEvent = z.strictObject({
  id,
  zoneId: id,
  programId: z.enum(["A", "B", "C"]),
  stationNumber: z.number().int().min(1).max(9),
  start: timestamp,
  end: timestamp,
});
const coveragePeriod = z.strictObject({
  id,
  geometricZoneIds: z.array(id),
  effectiveZoneIds: z.array(id),
  sourceEventIds: z.array(id),
  intervals: z.array(interval),
  sourceNoteIds: z.array(id),
});
export const calculatedSchema = z.strictObject({
  status: z.enum(["complete", "partial", "unresolved"]),
  reason: z.string().nullable(),
  referenceWeekStart: date,
  timezone: z.string().nullable(),
  stationEvents: z.array(stationEvent),
  plantPeriods: z.array(coveragePeriod),
  overlapPeriods: z.array(coveragePeriod),
});

const propertySnapshot = z.custom<PropertyBase>(
  (value) => canonical(value) === canonical(propertyBase),
  "Property snapshot does not match the built-in map version",
);

const yardSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  modifiedAt: timestamp,
  exportId: id.nullable(),
  exportedAt: timestamp.nullable(),
  referenceWeekStart: date,
  property: propertySnapshot,
  location: z.strictObject({
    name: z.string(),
    timezone: z.string().nullable(),
    growingNotes: z.string(),
  }),
  plants: z.array(plant),
  zones: z.array(zone).length(8),
  overlapNotes: z.array(overlapNote),
  controller: z.strictObject({
    state: z.enum(["proposed", "confirmed"]),
    effectiveDate: date.nullable(),
    verifiedAt: timestamp.nullable(),
    settings: controllerSettings,
  }),
  scheduleRecords: z.array(
    z.strictObject({
      id,
      sourceExportId: id.nullable(),
      state: z.enum(["proposed", "programmed"]),
      effectiveDate: date,
      verifiedAt: timestamp.nullable(),
      notes: z.string(),
      settings: controllerSettings,
    }),
  ),
  observations: z.array(
    z.strictObject({ id, at: timestamp, target, text: z.string().min(1) }),
  ),
  tasks: z.array(
    z.strictObject({
      id,
      target,
      dueDate: date,
      repeatDays: z.number().int().positive().nullable(),
      completedAt: timestamp.nullable(),
      notes: z.string(),
    }),
  ),
  calculated: calculatedSchema,
});

export type YardDocumentV1 = z.infer<typeof yardSchema>;
export type Plant = YardDocumentV1["plants"][number];
export type Zone = YardDocumentV1["zones"][number];
export type OverlapNote = YardDocumentV1["overlapNotes"][number];
export type ControllerSettings = YardDocumentV1["controller"]["settings"];
export type Calculated = YardDocumentV1["calculated"];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function newYardDocument(now = new Date()): YardDocumentV1 {
  const stamp = now.toISOString();
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const referenceWeekStart = monday.toISOString().slice(0, 10);
  const settings: ControllerSettings = {
    model: "Irritrol Rain Dial RD-900-R",
    mode: { value: null, status: "unknown" },
    stationDelaySeconds: { value: null, status: "unknown" },
    monthlyWaterBudgetEnabled: { value: null, status: "unknown" },
    rainDelayDays: { value: null, status: "unknown" },
    sensorAdjustment: { value: null, status: "unknown" },
    programs: (["A", "B", "C"] as const).map((programId) => ({
      id: programId,
      weekdays: [],
      startTimes: [],
      stationRuntimes: [],
      waterBudgetPercent: { value: null, status: "unknown" },
      monthlyWaterBudget: [],
    })),
  };
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    modifiedAt: stamp,
    exportId: null,
    exportedAt: null,
    referenceWeekStart,
    property: structuredClone(propertyBase),
    location: { name: "", timezone: null, growingNotes: "" },
    plants: [],
    zones: Array.from({ length: 8 }, (_, index) => ({
      id: `zone-${index + 1}`,
      name: `Zone ${index + 1}`,
      color: [
        "#4a90a4",
        "#cb6d4d",
        "#8d75b3",
        "#6e9a58",
        "#ce9e48",
        "#5571af",
        "#bd6e95",
        "#7d8b49",
      ][index]!,
      stationNumber: null,
      polygons: [],
    })),
    overlapNotes: [],
    controller: {
      state: "proposed",
      effectiveDate: null,
      verifiedAt: null,
      settings,
    },
    scheduleRecords: [],
    observations: [],
    tasks: [],
    calculated: {
      status: "unresolved",
      reason: "Controller settings and timezone have not been confirmed.",
      referenceWeekStart,
      timezone: null,
      stationEvents: [],
      plantPeriods: [],
      overlapPeriods: [],
    },
  };
}

const unique = (values: string[]): boolean =>
  new Set(values).size === values.length;
const insideLot = ([x, y]: [number, number]): boolean =>
  x >= 0 && x <= 40 && y >= 0 && y <= 120;

function validateSettings(settings: ControllerSettings): void {
  const programIds = settings.programs.map((item) => item.id);
  if (
    !unique(programIds) ||
    !["A", "B", "C"].every((programId) =>
      programIds.includes(programId as "A" | "B" | "C"),
    )
  )
    throw new Error("Controller must contain programs A, B, and C");
  for (const program of settings.programs) {
    if (
      !unique(program.weekdays.map(String)) ||
      !unique(program.startTimes) ||
      !unique(
        program.stationRuntimes.map((runtime) => String(runtime.stationNumber)),
      ) ||
      !unique(program.monthlyWaterBudget.map((budget) => String(budget.month)))
    )
      throw new Error(`Duplicate setting in program ${program.id}`);
  }
}

export function parseYardDocument(input: unknown): YardDocumentV1 {
  // Derived data in a handoff file is never trusted as source data.
  const candidate =
    typeof input === "object" && input !== null
      ? { ...input, calculated: newYardDocument().calculated }
      : input;
  const document = yardSchema.parse(candidate);
  const zoneIds = document.zones.map((item) => item.id);
  const plantIds = document.plants.map((item) => item.id);
  const surfaceIds = document.property.surfaces.map((item) => item.id);
  const mappedStations = document.zones.flatMap((item) =>
    item.stationNumber === null ? [] : [item.stationNumber],
  );
  if (
    !unique(zoneIds) ||
    !unique(plantIds) ||
    !unique(document.overlapNotes.map((item) => item.id))
  )
    throw new Error("Duplicate record ID");
  if (
    !unique(document.scheduleRecords.map((item) => item.id)) ||
    !unique(document.observations.map((item) => item.id)) ||
    !unique(document.tasks.map((item) => item.id))
  )
    throw new Error("Duplicate care record ID");
  if (new Set(mappedStations).size !== mappedStations.length)
    throw new Error("Duplicate station mapping");
  validateSettings(document.controller.settings);
  for (const record of document.scheduleRecords)
    validateSettings(record.settings);
  for (const item of document.plants) {
    if (!insideLot(item.position))
      throw new Error(`Plant ${item.id} is outside the property`);
    if (!surfaceIds.includes(item.growingSetting.surfaceId))
      throw new Error(`Unknown surface for plant ${item.id}`);
    if (
      item.manualCoverage &&
      (!unique(item.manualCoverage.zoneIds) ||
        item.manualCoverage.zoneIds.some((zoneId) => !zoneIds.includes(zoneId)))
    )
      throw new Error(`Broken manual coverage for plant ${item.id}`);
    if (item.group?.area.some((vertex) => !insideLot(vertex)))
      throw new Error(`Plant group ${item.id} extends outside the property`);
  }
  for (const item of document.zones) {
    if (
      item.polygons.some((shape) => shape.some((vertex) => !insideLot(vertex)))
    )
      throw new Error(`Zone ${item.id} extends outside the property`);
  }
  for (const item of document.overlapNotes) {
    if (
      !insideLot(item.point) ||
      !unique(item.zoneIds) ||
      item.zoneIds.some((zoneId) => !zoneIds.includes(zoneId))
    )
      throw new Error(`Broken overlap note ${item.id}`);
  }
  for (const item of [...document.observations, ...document.tasks]) {
    if (
      item.target.kind === "plant" &&
      !plantIds.includes(item.target.id ?? "")
    )
      throw new Error(`Unknown plant target ${item.id}`);
    if (item.target.kind === "zone" && !zoneIds.includes(item.target.id ?? ""))
      throw new Error(`Unknown zone target ${item.id}`);
    if (item.target.kind === "property" && item.target.id !== null)
      throw new Error(`Invalid property target ${item.id}`);
  }
  return {
    ...document,
    overlapNotes: revalidateOverlapNotes(document.overlapNotes, document.zones),
    calculated: {
      ...document.calculated,
      referenceWeekStart: document.referenceWeekStart,
      timezone: document.location.timezone,
    },
  };
}
