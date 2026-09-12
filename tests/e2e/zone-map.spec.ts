import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("draws disconnected zone pieces and preserves overlapping station coverage", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByRole("img", { name: "Editable irrigation zone map" });
  const clickFoot = async (x: number, y: number) => {
    await map.evaluate(
      (element, point) => {
        const screen = new DOMPoint(point.x, point.y).matrixTransform(
          (element as SVGSVGElement).getScreenCTM()!,
        );
        window.scrollBy(0, screen.y - 400);
      },
      { x, y },
    );
    const point = await map.evaluate(
      (element, location) => {
        const screen = new DOMPoint(location.x, location.y).matrixTransform(
          (element as SVGSVGElement).getScreenCTM()!,
        );
        return { x: screen.x, y: screen.y };
      },
      { x, y },
    );
    await page.mouse.click(point.x, point.y);
  };
  const draw = async (coordinates: [number, number][]) => {
    await page.getByRole("button", { name: "Draw coverage piece" }).click();
    for (const [x, y] of coordinates) await clickFoot(x, y);
    await page.getByRole("button", { name: /^Finish polygon/ }).click();
  };

  await page
    .getByRole("combobox", { name: "Controller station" })
    .selectOption("2");
  await draw([
    [2, 2],
    [20, 2],
    [20, 20],
    [2, 20],
  ]);
  await draw([
    [2, 40],
    [20, 40],
    [20, 60],
    [2, 60],
  ]);
  await expect(
    page.getByRole("heading", { name: "Coverage pieces (2)" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Zone", exact: true })
    .selectOption("zone-2");
  await page
    .getByRole("combobox", { name: "Controller station" })
    .selectOption("5");
  await draw([
    [10, 10],
    [30, 10],
    [30, 30],
    [10, 30],
  ]);
  await clickFoot(15, 15);
  await expect(page.locator(".coverage-inspection")).toContainText(
    "Zone 1, Zone 2",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const downloaded = await downloadPromise;
  const file = JSON.parse(
    (await readFile(await downloaded.path())).toString("utf8"),
  ) as {
    zones: { stationNumber: number | null; polygons: [number, number][][] }[];
  };
  expect(file.zones[0]?.stationNumber).toBe(2);
  expect(file.zones[0]?.polygons).toHaveLength(2);
  expect(file.zones[1]?.stationNumber).toBe(5);
  expect(file.zones[1]?.polygons).toHaveLength(1);
});
