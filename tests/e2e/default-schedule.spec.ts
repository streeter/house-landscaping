import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import type { YardDocumentV1 } from "../../src/domain/document";
import { readDraftRaw } from "./drafts";

test("new yards show and export the documented schedule with B/C starts off", async ({
  page,
}) => {
  await page.goto("/");
  const schedule = page.getByRole("region", { name: "Controller schedule" });
  const a = schedule.getByRole("group", { name: "Program A" });
  for (const day of ["Mon", "Wed", "Fri"])
    await expect(a.getByLabel(day, { exact: true })).toBeChecked();
  for (const day of ["Tue", "Thu", "Sat", "Sun"])
    await expect(a.getByLabel(day, { exact: true })).not.toBeChecked();
  await expect(a.getByLabel("Start 1", { exact: true })).toHaveValue("08:00");
  await expect(a).toContainText("Off: Start 2, Start 3");
  await expect(a.getByLabel("Station 9", { exact: true })).toHaveValue("10");
  const minutes = {
    A: [10, 35, 35, 15, 20, 35, 35, 15, 10],
    B: [0, 50, 50, 0, 0, 0, 0, 0, 0],
    C: [0, 0, 0, 0, 0, 50, 55, 0, 0],
  };
  for (const [id, values] of Object.entries(minutes)) {
    const program = schedule.getByRole("group", { name: `Program ${id}` });
    for (const [index, value] of values.entries())
      await expect(
        program.getByLabel(`Station ${index + 1}`, { exact: true }),
      ).toHaveValue(String(value));
    if (id !== "A") {
      await expect(program).toContainText("All three start times are off");
      await expect(program.locator('input[type="time"]')).toHaveCount(0);
      for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        await expect(program.getByLabel(day, { exact: true })).toBeChecked();
    }
  }
  await expect(
    schedule.getByLabel("Documented default schedule"),
  ).toContainText("no watering area was found");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const document = JSON.parse(
    (await readFile(await (await downloading).path())).toString(),
  ) as YardDocumentV1;
  expect(
    document.controller.settings.programs.map((program) => program.startTimes),
  ).toEqual([["08:00"], [], []]);
  expect(
    document.controller.settings.programs.map((program) =>
      program.stationRuntimes.map((runtime) => runtime.minutes),
    ),
  ).toEqual(Object.values(minutes));
  await expect
    .poll(() => {
      const parameter = new URL(page.url()).searchParams.get("yard");
      if (!parameter) return null;
      const shared = JSON.parse(
        gunzipSync(Buffer.from(parameter.slice(2), "base64url")).toString(),
      ) as { document: YardDocumentV1 };
      return shared.document.controller.settings.programs;
    })
    .toEqual(document.controller.settings.programs);
});

test("existing schedules survive reload and loading defaults is one undoable edit", async ({
  page,
}) => {
  await page.goto("/");
  const schedule = page.getByRole("region", { name: "Controller schedule" });
  const a = schedule.getByRole("group", { name: "Program A" });
  await a.getByLabel("Station 1", { exact: true }).fill("7");
  await a.getByLabel("Start 1", { exact: true }).fill("19:00");
  await a.getByLabel("Mon", { exact: true }).uncheck();
  await a.getByLabel("Basic water budget (%)").fill("80");
  await schedule.getByLabel("Station delay (seconds)").fill("30");
  await schedule.getByLabel("Schedule state").selectOption("confirmed");
  await schedule.getByLabel("Verified at").fill("2026-09-07T12:00");
  await page.reload();
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await expect(a.getByLabel("Station 1", { exact: true })).toHaveValue("7");
  const before = (
    JSON.parse((await readDraftRaw(page))!) as { document: YardDocumentV1 }
  ).document.controller;
  await schedule
    .getByRole("button", { name: "Load documented schedule" })
    .click();
  await expect(a.getByLabel("Station 1", { exact: true })).toHaveValue("10");
  await expect(a.getByLabel("Start 1", { exact: true })).toHaveValue("08:00");
  await expect(a.getByLabel("Mon", { exact: true })).toBeChecked();
  await expect(a.getByLabel("Basic water budget (%)")).toHaveValue("80");
  await expect(schedule.getByLabel("Station delay (seconds)")).toHaveValue(
    "30",
  );
  await expect(schedule.getByLabel("Schedule state")).toHaveValue("proposed");
  await expect(schedule.getByLabel("Verified at")).toHaveValue("");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const restored = (
    JSON.parse((await readDraftRaw(page))!) as { document: YardDocumentV1 }
  ).document.controller;
  expect(restored).toEqual(before);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(a.getByLabel("Station 1", { exact: true })).toHaveValue("10");
});
