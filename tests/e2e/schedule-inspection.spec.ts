import { readDraftRaw, seedLegacyDraft } from "./drafts";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { YardDocumentV1 } from "../../src/domain/document";

test("a two-zone overlap shows one elapsed period and both source events", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect
    .poll(() => (async () => await readDraftRaw(page))())
    .not.toBeNull();
  await (async () => {
    const envelope = JSON.parse((await readDraftRaw(page))!) as {
      document: YardDocumentV1;
    };
    const yard = envelope.document;
    yard.referenceWeekStart = "2026-09-07";
    yard.location.timezone = "America/Los_Angeles";
    yard.controller.state = "confirmed";
    yard.controller.verifiedAt = "2026-09-06T12:00:00Z";
    const settings = yard.controller.settings;
    settings.mode = { value: "overlap", status: "confirmed" };
    settings.stationDelaySeconds = { value: 0, status: "confirmed" };
    settings.monthlyWaterBudgetEnabled = { value: false, status: "confirmed" };
    settings.rainDelayDays = { value: 0, status: "confirmed" };
    settings.sensorAdjustment = { value: "none", status: "confirmed" };
    for (const program of settings.programs)
      program.waterBudgetPercent = { value: 100, status: "confirmed" };
    settings.programs[0]!.weekdays = [0];
    settings.programs[0]!.startTimes = ["08:00"];
    settings.programs[0]!.stationRuntimes = [{ stationNumber: 1, minutes: 10 }];
    settings.programs[1]!.weekdays = [0];
    settings.programs[1]!.startTimes = ["08:00"];
    settings.programs[1]!.stationRuntimes = [{ stationNumber: 2, minutes: 10 }];
    yard.zones[0]!.stationNumber = 1;
    yard.zones[1]!.stationNumber = 2;
    yard.zones[0]!.polygons = [
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
    ];
    yard.zones[1]!.polygons = [
      [
        [10, 0],
        [30, 0],
        [30, 20],
        [10, 20],
      ],
    ];
    yard.plants = [
      {
        id: "plant-overlap",
        label: "Test shrub",
        species: "Shrub",
        position: [15, 10],
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
      },
    ];
    yard.overlapNotes = [
      {
        id: "note-overlap",
        point: [15, 10],
        zoneIds: ["zone-1", "zone-2"],
        relationship: "independent-sources",
        notes: "Separate lines",
        stale: false,
      },
    ];
    await seedLegacyDraft(page, JSON.stringify(envelope));
  })();
  await page.reload();
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await page.getByRole("button", { name: /Test shrub/ }).click();
  const plant = page.locator(".plant-timing");
  await expect(plant).toContainText(
    "2026-09-07T08:00:00-07:00 to 2026-09-07T08:10:00-07:00",
  );
  await expect(plant.getByRole("listitem")).toHaveCount(1);
  const zoneMap = page.getByRole("img", {
    name: "Editable irrigation zone map",
  });
  await zoneMap.evaluate((element) => {
    const screen = new DOMPoint(15, 10).matrixTransform(
      (element as SVGSVGElement).getScreenCTM()!,
    );
    window.scrollBy(0, screen.y - 400);
  });
  const point = await zoneMap.evaluate((element) => {
    const screen = new DOMPoint(15, 10).matrixTransform(
      (element as SVGSVGElement).getScreenCTM()!,
    );
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  const inspection = page.locator(".coverage-inspection");
  await expect(inspection.getByRole("listitem")).toHaveCount(1);
  await expect(inspection).toContainText("Source station events (2)");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const downloadedPath = await (await promise).path();
  const file = JSON.parse(
    (await readFile(downloadedPath)).toString("utf8"),
  ) as {
    calculated: {
      stationEvents: unknown[];
      plantPeriods: { intervals: unknown[]; sourceEventIds: string[] }[];
      overlapPeriods: { intervals: unknown[]; sourceEventIds: string[] }[];
    };
  };
  expect(file.calculated.stationEvents).toHaveLength(2);
  expect(file.calculated.plantPeriods[0]?.intervals).toHaveLength(1);
  expect(file.calculated.plantPeriods[0]?.sourceEventIds).toHaveLength(2);
  expect(file.calculated.overlapPeriods[0]?.intervals).toHaveLength(1);
  expect(file.calculated.overlapPeriods[0]?.sourceEventIds).toHaveLength(2);
  const context = await browser.newContext();
  try {
    const reopened = await context.newPage();
    await reopened.goto("/");
    reopened.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await reopened.getByLabel("Open yard JSON").setInputFiles(downloadedPath);
    await reopened.getByRole("button", { name: /Test shrub/ }).click();
    await expect(reopened.locator(".plant-timing")).toContainText(
      "2026-09-07T08:00:00-07:00 to 2026-09-07T08:10:00-07:00",
    );
  } finally {
    await context.close();
  }
});
