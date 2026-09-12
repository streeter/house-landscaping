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

test("older browser draft is kept until an additive map update is accepted", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("yard-planner-draft-v1")),
    )
    .not.toBeNull();
  await page.evaluate(() => {
    const key = "yard-planner-draft-v1";
    const raw = localStorage.getItem(key)!;
    const draft = JSON.parse(raw) as {
      document: {
        property: { version: number; surfaces: unknown[] };
        location: { name: string };
      };
    };
    draft.document.location.name = "Keep this yard";
    draft.document.property.version -= 1;
    draft.document.property.surfaces.pop();
    localStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Update this yard to the current map?" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("yard-planner-draft-v1")!;
        return (
          JSON.parse(raw) as { document: { property: { version: number } } }
        ).document.property.version;
      }),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Update map and open yard" }).click();
  await expect(page.getByRole("textbox", { name: "Location" })).toHaveValue(
    "Keep this yard",
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("yard-planner-draft-v1")!;
        return (
          JSON.parse(raw) as { document: { property: { version: number } } }
        ).document.property.version;
      }),
    )
    .toBe(1);
});

test("an older yard file waits for map upgrade approval before replacing the working yard", async ({
  page,
}) => {
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Location" }).fill("Current yard");
  const raw = await page.evaluate(() =>
    localStorage.getItem("yard-planner-draft-v1"),
  );
  expect(raw).not.toBeNull();
  const older = (
    JSON.parse(raw!) as {
      document: {
        property: { version: number; surfaces: unknown[] };
        location: { name: string };
      };
    }
  ).document;
  older.location.name = "Older yard";
  older.property.version -= 1;
  older.property.surfaces.pop();
  await page.getByLabel("Open yard JSON").setInputFiles({
    name: "older-yard.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(older)),
  });
  await expect(
    page.getByRole("heading", { name: "Update this yard to the current map?" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Location" })).toHaveValue(
    "Current yard",
  );
  await page.getByRole("button", { name: "Update map and open yard" }).click();
  await expect(page.getByRole("textbox", { name: "Location" })).toHaveValue(
    "Older yard",
  );
  await expect(page.getByRole("status")).toContainText(
    "Changes since last file save",
  );
});

test("an incompatible browser draft is preserved for backup", async ({
  page,
}) => {
  await page.goto("/");
  const raw = '{"document":{"property":{"version":999}}}';
  await page.evaluate(
    (value) => localStorage.setItem("yard-planner-draft-v1", value),
    raw,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Browser draft needs attention" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("yard-planner-draft-v1")),
  ).toBe(raw);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft backup" }).click();
  const download = await downloadPromise;
  expect((await readFile(await download.path())).toString("utf8")).toBe(raw);
});
