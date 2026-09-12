import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("a mixed group can be drawn and split without losing notes or stable identity", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("yard-planner-draft-v1")),
    )
    .not.toBeNull();
  await page.evaluate(() => {
    const draft = JSON.parse(
      localStorage.getItem("yard-planner-draft-v1")!,
    ) as { document: { zones: { polygons: [number, number][][] }[] } };
    draft.document.zones[0]!.polygons = [
      [
        [0, 0],
        [10, 0],
        [10, 20],
        [0, 20],
      ],
    ];
    draft.document.zones[1]!.polygons = [
      [
        [10, 0],
        [20, 0],
        [20, 20],
        [10, 20],
      ],
    ];
    localStorage.setItem("yard-planner-draft-v1", JSON.stringify(draft));
  });
  await page.reload();
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  const map = page.getByRole("img", { name: "Interactive yard map" });
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
  await page.getByRole("button", { name: "Place plant" }).click();
  await clickFoot(10, 10);
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Older bed");
  await page.getByRole("spinbutton", { name: "Group count" }).fill("6");
  await page.getByRole("button", { name: "Draw group area" }).click();
  for (const [x, y] of [
    [5, 5],
    [15, 5],
    [15, 15],
    [5, 15],
  ])
    await clickFoot(x!, y!);
  await page.getByRole("button", { name: /^Finish group area/ }).click();
  await expect(page.locator(".group-warning")).toContainText(
    "crosses coverage",
  );
  const originalId = await page.evaluate(() => {
    const draft = JSON.parse(
      localStorage.getItem("yard-planner-draft-v1")!,
    ) as { document: { plants: { id: string }[] } };
    return draft.document.plants[0]!.id;
  });
  await page.getByRole("button", { name: "Split group" }).click();
  await expect(
    page.getByRole("heading", { name: "Existing (2)" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const file = JSON.parse(
    (await readFile(await (await downloadPromise).path())).toString("utf8"),
  ) as {
    plants: {
      id: string;
      notes: string;
      group: { count: number } | null;
      position: [number, number];
    }[];
  };
  expect(file.plants.map((plant) => plant.group?.count)).toEqual([3, 3]);
  expect(file.plants.map((plant) => plant.notes)).toEqual([
    "Older bed",
    "Older bed",
  ]);
  expect(file.plants[0]?.id).toBe(originalId);
  expect(file.plants[1]?.id).not.toBe(originalId);
  expect(file.plants[0]!.position[0]).toBeLessThan(10);
  expect(file.plants[1]!.position[0]).toBeGreaterThan(10);
});
