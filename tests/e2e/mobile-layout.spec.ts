import { expect, test } from "@playwright/test";

test("planner sections and file controls stay usable on narrow screens", async ({
  browser,
}) => {
  for (const width of [320, 375, 768]) {
    const context = await browser.newContext({
      viewport: { width, height: 812 },
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    try {
      const page = await context.newPage();
      await page.goto("/");
      page.once("dialog", (dialog) =>
        dialog.accept("LongConfigurationName".repeat(4)),
      );
      await page.getByRole("button", { name: "Rename", exact: true }).click();
      await page
        .getByRole("region", { name: "Irrigation zone editor" })
        .getByLabel("Name", { exact: true })
        .fill("LongZoneNameWithoutSpaces".repeat(8));
      await page
        .getByLabel("Location", { exact: true })
        .fill("LongLocationNameWithoutSpaces".repeat(8));
      const care = page.getByRole("region", { name: "Care records" });
      await care
        .getByLabel("Observation", { exact: true })
        .fill("LongObservationWithoutSpaces".repeat(8));
      await care.getByRole("button", { name: "Add observation" }).click();
      await expect(care).toContainText("LongObservationWithoutSpaces");

      const layout = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const sections = [
          ".file-bar",
          ".yard-workspace",
          ".zone-workspace",
          ".controller-workspace",
          ".care-workspace",
          ".property-section",
        ];
        return {
          viewport,
          scrollWidth: document.documentElement.scrollWidth,
          sections: sections.map((selector) => {
            const rect = document
              .querySelector(selector)!
              .getBoundingClientRect();
            return { selector, left: rect.left, right: rect.right };
          }),
          fileButtonHeight: document
            .querySelector<HTMLButtonElement>(".file-bar button")!
            .getBoundingClientRect().height,
          zoneInputFont: Number.parseFloat(
            getComputedStyle(
              document.querySelector<HTMLInputElement>(
                ".zone-panel input:not([type])",
              )!,
            ).fontSize,
          ),
        };
      });
      expect(layout.viewport).toBe(width);
      expect(layout.scrollWidth).toBeLessThanOrEqual(width + 1);
      for (const section of layout.sections) {
        expect(section.left, section.selector).toBeGreaterThanOrEqual(0);
        expect(section.right, section.selector).toBeLessThanOrEqual(width + 1);
      }
      expect(layout.fileButtonHeight).toBeGreaterThanOrEqual(44);
      expect(layout.zoneInputFont).toBeGreaterThanOrEqual(16);
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Save / Download" }).click();
      expect((await download).suggestedFilename()).toBe("yard.json");
    } finally {
      await context.close();
    }
  }
});
