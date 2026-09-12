import { expect, test } from "@playwright/test";

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
