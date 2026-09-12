import { readDraftRaw, seedLegacyDraft } from "./drafts";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function clickFoot(page: Page, map: Locator, x: number, y: number) {
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
}

test("source note and manual plant coverage remain separate after a zone edit", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => (async () => await readDraftRaw(page))())
    .not.toBeNull();
  await (async () => {
    const draft = JSON.parse((await readDraftRaw(page))!) as {
      document: {
        zones: {
          polygons: [number, number][][];
          stationNumber: number | null;
        }[];
      };
    };
    draft.document.zones[0]!.polygons = [
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
    ];
    draft.document.zones[1]!.polygons = [
      [
        [5, 5],
        [25, 5],
        [25, 25],
        [5, 25],
      ],
    ];
    draft.document.zones[0]!.stationNumber = 2;
    draft.document.zones[1]!.stationNumber = 5;
    await seedLegacyDraft(page, JSON.stringify(draft));
  })();
  await page.reload();
  await page.getByRole("button", { name: "Resume browser draft" }).click();

  const zoneMap = page.getByRole("img", {
    name: "Editable irrigation zone map",
  });
  await clickFoot(page, zoneMap, 10, 10);
  await expect(page.locator(".coverage-inspection")).toContainText(
    "Zone 1, Zone 2",
  );
  await page
    .getByRole("combobox", { name: "Relationship" })
    .first()
    .selectOption("shared-hose");
  await page
    .getByRole("textbox", { name: "Context" })
    .first()
    .fill("Same hose by patio");
  await page.getByRole("button", { name: "Add source note here" }).click();

  const plantMap = page.getByRole("img", { name: "Interactive yard map" });
  await page.getByRole("button", { name: "Place plant" }).click();
  await clickFoot(page, plantMap, 10, 10);
  await expect(page.locator(".coverage-detail").first()).toContainText(
    "zone-1, zone-2",
  );
  await page.getByRole("button", { name: "Correct coverage" }).click();
  await page.getByRole("checkbox", { name: "Zone 3" }).check();
  await page
    .getByRole("textbox", { name: "Reason" })
    .fill("Observed spray reaches this spot");
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(page.locator(".coverage-detail").first()).toContainText(
    "zone-1, zone-2, zone-3",
  );

  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page
    .getByRole("combobox", { name: "Zone", exact: true })
    .selectOption("zone-2");
  await page.getByRole("button", { name: "Delete piece" }).click();
  await expect(page.locator(".saved-source-notes")).toContainText(
    "needs checking",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  const file = JSON.parse(
    (await readFile(await (await downloadPromise).path())).toString("utf8"),
  ) as {
    plants: { manualCoverage: { zoneIds: string[]; reason: string } }[];
    overlapNotes: {
      zoneIds: string[];
      relationship: string;
      notes: string;
      stale: boolean;
    }[];
  };
  expect(file.plants[0]?.manualCoverage.zoneIds).toEqual([
    "zone-1",
    "zone-2",
    "zone-3",
  ]);
  expect(file.overlapNotes[0]).toMatchObject({
    zoneIds: ["zone-1", "zone-2"],
    relationship: "shared-hose",
    notes: "Same hose by patio",
    stale: true,
  });
});
