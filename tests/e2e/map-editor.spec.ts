import { expect, test } from "@playwright/test";

test("local map editor adjusts geometry without writing source files", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174/tools/map-editor.html");
  await expect(page.getByRole("status")).toContainText(
    "loaded from repository",
  );
  await page.getByRole("checkbox", { name: "Show tracing image" }).check();
  await expect(page.locator("svg image")).toHaveAttribute(
    "href",
    "/data/property.jpg",
  );
  await page
    .getByRole("combobox", { name: "Select surface" })
    .selectOption("patio");
  await page.getByRole("button", { name: /^1\. 10,/ }).click();
  await page.getByRole("spinbutton", { name: "X (south)" }).fill("11");
  await expect(
    page.getByRole("button", { name: "Save to repository" }),
  ).toBeEnabled();
  await expect(page.getByRole("status")).toContainText(
    "Unsaved structural changes",
  );
});

test("undo and redo shortcuts work with a coordinate field focused", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174/tools/map-editor.html");
  await expect(page.getByRole("status")).toContainText(
    "loaded from repository",
  );
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  const save = page.getByRole("button", { name: "Save to repository" });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Select surface" })
    .selectOption("patio");
  await page.getByRole("button", { name: /^1\. 10,/ }).click();
  const x = page.getByRole("spinbutton", { name: "X (south)" });
  await x.fill("11");
  await expect(x).toHaveValue("11");
  await expect(undo).toBeEnabled();
  await expect(save).toBeEnabled();

  await x.press("Meta+z");
  await expect(x).toHaveValue("10");
  await expect(save).toBeDisabled();
  await expect(redo).toBeEnabled();
  await x.press("Meta+Shift+z");
  await expect(x).toHaveValue("11");
  await x.press("Control+z");
  await expect(x).toHaveValue("10");
  await x.press("Control+y");
  await expect(x).toHaveValue("11");

  await undo.click();
  await expect(x).toHaveValue("10");
  await x.fill("12");
  await expect(redo).toBeDisabled();
});

test("a vertex drag is one undo step and reload clears history", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174/tools/map-editor.html");
  await expect(page.getByRole("status")).toContainText(
    "loaded from repository",
  );
  await page
    .getByRole("combobox", { name: "Select surface" })
    .selectOption("patio");
  const handle = page.locator("svg circle").first();
  const before = await handle.getAttribute("cx");
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 18,
    bounds!.y + bounds!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute("cx", before!);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(handle).toHaveAttribute("cx", before!);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(handle).not.toHaveAttribute("cx", before!);
  await page.getByRole("button", { name: "Discard / reload" }).click();
  await expect(handle).toHaveAttribute("cx", before!);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
});

test("undo and redo include points in a polygon draft", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174/tools/map-editor.html");
  await expect(page.getByRole("status")).toContainText(
    "loaded from repository",
  );
  await page.getByRole("button", { name: "Draw new surface" }).click();
  const svg = page.getByRole("img", { name: "Editable property map" });
  await svg.click({ position: { x: 100, y: 100 } });
  await svg.click({ position: { x: 120, y: 120 } });
  await expect(
    page.getByRole("button", { name: "Finish polygon (2)" }),
  ).toBeVisible();
  await page.keyboard.press("Meta+z");
  await expect(
    page.getByRole("button", { name: "Finish polygon (1)" }),
  ).toBeVisible();
  await page.keyboard.press("Meta+Shift+z");
  await expect(
    page.getByRole("button", { name: "Finish polygon (2)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await svg.click({ position: { x: 140, y: 140 } });
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save to repository" }),
  ).toBeDisabled();
});
