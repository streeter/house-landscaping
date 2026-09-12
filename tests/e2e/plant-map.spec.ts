import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("phone touch places a container plant on porch stairs and preserves it in the file", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Place plant" }).click();
    const map = page.getByRole("img", { name: "Interactive yard map" });
    await map.evaluate((element) => {
      const location = new DOMPoint(10, 105).matrixTransform(
        (element as SVGSVGElement).getScreenCTM()!,
      );
      window.scrollBy(0, location.y - 400);
    });
    const location = await map.evaluate((element) => {
      const point = new DOMPoint(10, 105).matrixTransform(
        (element as SVGSVGElement).getScreenCTM()!,
      );
      return { x: point.x, y: point.y };
    });
    await page.touchscreen.tap(location.x, location.y);
    await expect(page.getByRole("textbox", { name: "Label" })).toHaveValue(
      "New plant",
    );
    await expect(
      page.getByRole("combobox", { name: "Supporting surface" }),
    ).toHaveValue("porch-stairs");
    await page.getByRole("textbox", { name: "Label" }).fill("Stair pot");
    await page
      .getByRole("combobox", { name: "Growing setting" })
      .selectOption("container");
    await page
      .getByRole("textbox", { name: "Notes", exact: true })
      .fill("Gets morning light");
    await page.getByRole("spinbutton", { name: "Width (ft)" }).fill("1.5");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save / Download" }).click();
    const downloaded = await downloadPromise;
    const file = JSON.parse(
      (await readFile(await downloaded.path())).toString("utf8"),
    ) as {
      plants: {
        label: string;
        position: [number, number];
        growingSetting: {
          surfaceId: string;
          kind: string;
          containerWidthFeet: number;
        };
        notes: string;
      }[];
    };
    expect(file.plants).toHaveLength(1);
    expect(file.plants[0]).toMatchObject({
      label: "Stair pot",
      notes: "Gets morning light",
      growingSetting: {
        surfaceId: "porch-stairs",
        kind: "container",
        containerWidthFeet: 1.5,
      },
    });
    expect(Math.abs(file.plants[0]!.position[0] - 10)).toBeLessThan(0.3);
    expect(Math.abs(file.plants[0]!.position[1] - 105)).toBeLessThan(0.3);
    await page.reload();
    await page.getByRole("button", { name: "Resume browser draft" }).click();
    await page.getByRole("button", { name: /Stair pot/ }).click();
    await expect(
      page.getByRole("textbox", { name: "Notes", exact: true }),
    ).toHaveValue("Gets morning light");
  } finally {
    await context.close();
  }
});

test("plant duplication, undo/redo, and marker dragging update the draft", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByRole("img", { name: "Interactive yard map" });
  const screen = (x: number, y: number) =>
    map.evaluate(
      (element, position) => {
        const point = new DOMPoint(position.x, position.y).matrixTransform(
          (element as SVGSVGElement).getScreenCTM()!,
        );
        return { x: point.x, y: point.y };
      },
      { x, y },
    );
  await page.getByRole("button", { name: "Place plant" }).click();
  const first = await screen(20, 20);
  await page.mouse.click(first.x, first.y);
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    page.getByRole("heading", { name: "Existing (2)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Existing (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(
    page.getByRole("heading", { name: "Existing (2)" }),
  ).toBeVisible();

  const from = await screen(21, 21);
  const to = await screen(25, 25);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("yard-planner-draft-v1");
        const parsed = raw
          ? (JSON.parse(raw) as {
              document: { plants: { position: [number, number] }[] };
            })
          : null;
        return parsed?.document.plants[1]?.position[0] ?? null;
      }),
    )
    .toBeGreaterThan(24.7);
});
