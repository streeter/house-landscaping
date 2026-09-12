import { readDraftRaw } from "./drafts";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("controller edits regenerate the predicted file timeline", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Timezone" })
    .fill("America/Los_Angeles");
  const schedule = page.getByRole("region", { name: "Controller schedule" });
  await schedule.getByLabel("Reference Monday").fill("2026-09-07");
  await schedule.getByLabel("Schedule state").selectOption("confirmed");
  await schedule.getByLabel("Verified at").fill("2026-09-06T12:00");
  await schedule.getByLabel("Stack / Overlap").selectOption("stack");
  await schedule.getByLabel("Station delay (seconds)").fill("0");
  await schedule.getByLabel("Monthly water budget").selectOption("false");
  await schedule.getByLabel("Rain delay (days)").fill("0");
  await schedule.getByLabel("Sensor / weather adjustment").fill("none");
  const program = schedule.getByRole("group", { name: "Program A" });
  await program.getByLabel("Mon").check();
  await program.getByRole("button", { name: "Add start" }).click();
  await program.getByLabel("Station 1").fill("10");
  await program.getByLabel("Basic water budget (%)").fill("100");
  const zone = page.getByRole("region", { name: "Irrigation zone editor" });
  await zone.getByLabel("Controller station").selectOption("1");
  const draft = await (async () =>
    JSON.parse((await readDraftRaw(page))!) as {
      document: {
        controller: {
          settings: {
            rainDelayDays: { value: number | null };
            sensorAdjustment: { value: string | null };
          };
        };
      };
    })();
  expect(draft.document.controller.settings.rainDelayDays.value).toBe(0);
  expect(draft.document.controller.settings.sensorAdjustment.value).toBe(
    "none",
  );
  await expect(schedule.getByLabel("Expected watering timeline")).toContainText(
    "2026-09-07T08:00:00-07:00",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const file = JSON.parse(
    (await readFile(await (await downloadPromise).path())).toString("utf8"),
  ) as {
    controller: {
      settings: { programs: { stationRuntimes: { minutes: number }[] }[] };
    };
    calculated: {
      status: string;
      stationEvents: { start: string; end: string }[];
    };
  };
  expect(
    file.controller.settings.programs[0]?.stationRuntimes[0]?.minutes,
  ).toBe(10);
  expect(file.calculated.stationEvents).toEqual([
    expect.objectContaining({
      start: "2026-09-07T08:00:00-07:00",
      end: "2026-09-07T08:10:00-07:00",
    }),
  ]);
  expect(JSON.stringify(file)).not.toMatch(
    /totalMinutes|weeklyMinutes|wateringPeriodCount/,
  );
});
