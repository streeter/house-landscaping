import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { readDraftRaw } from "./drafts";

test("a compressed link imports a separate named yard in a fresh browser and beside existing yards", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Shared garden 🌱");
  await page
    .getByLabel("Growing conditions")
    .fill("Afternoon shade; café patio");
  page.once("dialog", (dialog) => dialog.accept("Summer 🌻"));
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("button", { name: "Create share link" }).click();
  const field = page.getByLabel("Share URL");
  await expect(field).toBeVisible();
  const url = await field.inputValue();
  expect(url.length).toBeLessThan(8000);
  expect(new URL(url).searchParams.get("yard")).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  await page.getByLabel("Location", { exact: true }).fill("Later local edits");
  await expect(
    page.getByText("This link predates your latest changes.", { exact: false }),
  ).toBeVisible();
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto(url);
    const panel = other.getByRole("region", { name: "Shared yard import" });
    await expect(panel).toContainText("Summer 🌻");
    await panel
      .getByRole("button", { name: "Import as new configuration", exact: true })
      .click();
    await expect(other.getByLabel("Location", { exact: true })).toHaveValue(
      "Shared garden 🌱",
    );
    await expect(other.getByLabel("Growing conditions")).toHaveValue(
      "Afternoon shade; café patio",
    );
    expect(new URL(other.url()).searchParams.has("yard")).toBe(false);
    await other.reload();
    await other.getByRole("button", { name: "Resume browser draft" }).click();
    await expect(other.getByLabel("Location", { exact: true })).toHaveValue(
      "Shared garden 🌱",
    );
  } finally {
    await fresh.close();
  }
  const originalRaw = await readDraftRaw(page);
  await page.goto(url);
  await expect(
    page.getByRole("region", { name: "Shared yard import" }),
  ).toContainText("Summer 🌻");
  expect(await readDraftRaw(page)).toBe(originalRaw);
  const originalId = await page
    .getByLabel("Yard configuration", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Import as new configuration", exact: true })
    .click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Shared garden 🌱",
  );
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(originalId);
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Later local edits",
  );
});

test("invalid shared URLs preserve browser storage and can be dismissed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Keep me");
  const raw = await readDraftRaw(page);
  await page.goto("/?view=map&yard=1.invalid");
  await expect(page.getByRole("alert")).toContainText(
    "Could not open shared yard",
  );
  expect(await readDraftRaw(page)).toBe(raw);
  await page.getByRole("button", { name: "Dismiss shared yard" }).click();
  expect(new URL(page.url()).searchParams.get("view")).toBe("map");
  expect(new URL(page.url()).searchParams.has("yard")).toBe(false);
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Keep me",
  );
});

test("shared additive maps wait for explicit import and incompatible maps are rejected", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Current map");
  const raw = (await readDraftRaw(page))!;
  const { document } = JSON.parse(raw) as {
    document: { property: { version: number; surfaces: { label: string }[] } };
  };
  document.property.version -= 1;
  document.property.surfaces.pop();
  const link = () =>
    `/?yard=1.${gzipSync(JSON.stringify({ name: "Old map", document })).toString("base64url")}`;
  await page.goto(link());
  await expect(
    page.getByRole("region", { name: "Shared yard import" }),
  ).toContainText("map version 0");
  expect(await readDraftRaw(page)).toBe(raw);
  await page
    .getByRole("button", { name: "Update map and import as new configuration" })
    .click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Current map",
  );
  const imported = await readDraftRaw(page);
  document.property.surfaces[0]!.label = "Changed boundary";
  await page.goto(link());
  await expect(page.getByRole("alert")).toContainText(
    "Could not open shared yard",
  );
  expect(await readDraftRaw(page)).toBe(imported);
});

test("oversized yards remain downloadable when they cannot fit a share link", async ({
  page,
}) => {
  await page.goto("/");
  const notes = Array.from({ length: 500 }, () => crypto.randomUUID()).join(
    " ",
  );
  await page.getByLabel("Growing conditions").fill(notes);
  await page.getByRole("button", { name: "Create share link" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Use Save / Download instead",
  );
  await expect(page.getByLabel("Share URL")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  expect((await download).suggestedFilename()).toBe("yard.json");
});

test("clipboard failures leave the share URL available for manual copying", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create share link" }).click();
  await expect(page.getByLabel("Share URL")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Select and copy the Share URL above",
  );
  await expect(page.getByLabel("Share URL")).toBeVisible();
});
