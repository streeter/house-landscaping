import { expect, test } from "@playwright/test";

test("undo and redo follow edits across plant and zone workspaces", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Place plant" }).click();
  const map = page.getByRole("img", { name: "Interactive yard map" });
  const point = await map.evaluate((element) => {
    const screen = new DOMPoint(10, 10).matrixTransform(
      (element as SVGSVGElement).getScreenCTM()!,
    );
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByRole("heading", { name: "Existing (1)" }),
  ).toBeVisible();
  const zone = page.getByRole("region", { name: "Irrigation zone editor" });
  await zone.getByLabel("Controller station").selectOption("1");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(zone.getByLabel("Controller station")).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Existing (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Existing (0)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(
    page.getByRole("heading", { name: "Existing (1)" }),
  ).toBeVisible();
  await expect(zone.getByLabel("Controller station")).toHaveValue("1");
});
