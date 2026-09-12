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
