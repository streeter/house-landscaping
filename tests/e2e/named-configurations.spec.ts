import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { readDraftRaw, seedLegacyDraft } from "./drafts";

test("named configurations keep independent edits, downloads, and targeted replacements", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Original yard");
  page.once("dialog", (dialog) => dialog.accept("Spring"));
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const firstId = await page
    .getByLabel("Yard configuration", { exact: true })
    .inputValue();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const originalFile = await readFile(await (await downloading).path());

  page.once("dialog", (dialog) => dialog.accept("Summer 🌻"));
  await page.getByRole("button", { name: "New", exact: true }).click();
  const secondId = await page
    .getByLabel("Yard configuration", { exact: true })
    .inputValue();
  expect(secondId).not.toBe(firstId);
  await page.getByLabel("Location", { exact: true }).fill("Summer yard");
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(firstId);
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Original yard",
  );
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(secondId);
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Summer yard",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await expect(
    page.getByLabel("Yard configuration", { exact: true }),
  ).toHaveValue(secondId);
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Summer yard",
  );

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Open yard JSON").setInputFiles({
    name: "spring.json",
    mimeType: "application/json",
    buffer: originalFile,
  });
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Summer yard",
  );
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Summer 🌻");
    return dialog.accept();
  });
  await page.getByLabel("Open yard JSON").setInputFiles({
    name: "spring.json",
    mimeType: "application/json",
    buffer: originalFile,
  });
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Original yard",
  );
  await page.getByLabel("Location", { exact: true }).fill("Replacement edited");
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(firstId);
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Original yard",
  );
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(secondId);
  const replacementDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const exported = JSON.parse(
    (await readFile(await (await replacementDownload).path())).toString(),
  ) as { location: { name: string } };
  expect(exported.location.name).toBe("Replacement edited");
});

test("creating a new configuration preserves an incompatible legacy draft", async ({
  page,
}) => {
  await page.goto("/");
  const legacy = '{"document":{"property":{"version":999}}}';
  await seedLegacyDraft(page, legacy);
  await page.reload();
  page.once("dialog", (dialog) => dialog.accept("Fresh yard"));
  await page.getByRole("button", { name: "Start a new yard" }).click();
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption({ label: "Browser draft" });
  await expect(
    page.getByRole("heading", { name: "Browser draft needs attention" }),
  ).toBeVisible();
  expect(await readDraftRaw(page)).toBe(legacy);
  expect(
    await page.evaluate(() => localStorage.getItem("yard-planner-draft-v1")),
  ).toBe(legacy);
});

test("a stale tab retains exportable edits and cannot switch away from failed storage", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("First tab");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Resume browser draft" }).click();
  await other.getByLabel("Location", { exact: true }).fill("Other tab");
  await page.getByLabel("Location", { exact: true }).fill("Keep in memory");
  await expect(page.getByRole("status")).toContainText("another tab");
  page.once("dialog", (dialog) => dialog.accept("Blocked switch"));
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Keep in memory",
  );
  const raw = JSON.parse((await readDraftRaw(page))!) as {
    document: { location: { name: string } };
  };
  expect(raw.document.location.name).toBe("Other tab");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  expect((await readFile(await (await download).path())).toString()).toContain(
    "Keep in memory",
  );
});
