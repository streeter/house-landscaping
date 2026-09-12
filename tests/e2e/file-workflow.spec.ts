import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("browser draft, downloaded file, fresh browser import, and invalid-file recovery", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Location" }).fill("Test yard");
  await page
    .getByRole("textbox", { name: "Timezone" })
    .fill("America/Los_Angeles");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("yard-planner-draft-v1");
        return raw
          ? (JSON.parse(raw) as { document: { location: { name: string } } })
              .document.location.name
          : null;
      }),
    )
    .toBe("Test yard");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Continue your yard?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await expect(page.getByRole("textbox", { name: "Location" })).toHaveValue(
    "Test yard",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const download = await downloadPromise;
  const file = await readFile(await download.path());
  const exported = JSON.parse(file.toString("utf8")) as {
    schemaVersion: number;
    exportId: string;
    property: { version: number };
  };
  expect(exported.schemaVersion).toBe(1);
  expect(exported.exportId).toBeTruthy();
  expect(exported.property.version).toBe(1);
  await expect(page.getByRole("status")).toContainText(
    "Saved/exported to yard.json",
  );

  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    other.on("dialog", (dialog) => {
      void dialog.accept();
    });
    await other.goto("/");
    await other.getByLabel("Open yard JSON").setInputFiles({
      name: "yard.json",
      mimeType: "application/json",
      buffer: file,
    });
    await expect(other.getByRole("textbox", { name: "Location" })).toHaveValue(
      "Test yard",
    );
    await other
      .getByRole("textbox", { name: "Location" })
      .fill("Keep this copy");
    await other.getByLabel("Open yard JSON").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await expect(other.getByRole("alert")).toContainText("Could not open file");
    await expect(other.getByRole("textbox", { name: "Location" })).toHaveValue(
      "Keep this copy",
    );
  } finally {
    await fresh.close();
  }
});
