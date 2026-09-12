import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("care history and schedule decisions survive a portable file", async ({
  page,
}) => {
  await page.goto("/");
  const firstDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const first = JSON.parse(
    (await readFile(await (await firstDownload).path())).toString("utf8"),
  ) as { exportId: string };
  const care = page.getByRole("region", { name: "Care records" });
  const observation = care.locator(".care-card").nth(0);
  await observation
    .getByLabel("Observation", { exact: true })
    .fill("Leaves curling after hot afternoon");
  await observation.getByRole("button", { name: "Add observation" }).click();
  await expect(observation).toContainText("Leaves curling after hot afternoon");
  const task = care.locator(".care-card").nth(1);
  await task.getByLabel("Task target").selectOption("zone:zone-1");
  await task.getByLabel("Due date").fill("2026-09-20");
  await task.getByLabel("Repeat every (days, optional)").fill("14");
  await task.getByLabel("Task notes").fill("Inspect emitter coverage");
  await task.getByRole("button", { name: "Add task" }).click();
  await task.getByRole("button", { name: "Complete" }).click();
  const schedule = care.locator(".care-card").nth(2);
  await schedule.getByLabel("Effective date").fill("2026-09-21");
  await schedule.getByLabel("Decision notes").fill("Awaiting review");
  await schedule.getByRole("button", { name: "Save schedule record" }).click();
  await schedule.getByLabel("Decision state").selectOption("programmed");
  await schedule.getByLabel("Verified at").fill("2026-09-22T12:00");
  await schedule.getByLabel("Decision notes").fill("Entered on controller");
  await schedule.getByRole("button", { name: "Save schedule record" }).click();
  const finalDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const file = JSON.parse(
    (await readFile(await (await finalDownload).path())).toString("utf8"),
  ) as {
    observations: { text: string }[];
    tasks: {
      dueDate: string;
      repeatDays: number;
      completedAt: string | null;
      target: { id: string };
    }[];
    scheduleRecords: {
      state: string;
      effectiveDate: string;
      sourceExportId: string;
      verifiedAt: string | null;
      notes: string;
    }[];
  };
  expect(file.observations[0]?.text).toBe("Leaves curling after hot afternoon");
  expect(file.tasks[0]).toEqual(
    expect.objectContaining({
      dueDate: "2026-09-20",
      repeatDays: 14,
      target: { kind: "zone", id: "zone-1" },
    }),
  );
  expect(file.tasks[0]?.completedAt).toBeTruthy();
  expect(file.scheduleRecords.map((record) => record.state)).toEqual([
    "proposed",
    "programmed",
  ]);
  expect(file.scheduleRecords.map((record) => record.sourceExportId)).toEqual([
    first.exportId,
    first.exportId,
  ]);
  expect(file.scheduleRecords[0]?.verifiedAt).toBeNull();
  expect(file.scheduleRecords[1]?.verifiedAt).toBeTruthy();
});
