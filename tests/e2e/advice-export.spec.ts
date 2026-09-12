import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("one advice snapshot provides matching JSON, report, map, and prompt", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Location", exact: true })
    .fill("Example yard");
  await page.getByRole("button", { name: "Export for Advice" }).click();
  const bundle = page.getByRole("region", { name: "Advice export bundle" });
  await expect(
    bundle.getByRole("heading", { name: "Advice export ready" }),
  ).toBeVisible();
  const download = async (name: string) => {
    const promise = page.waitForEvent("download");
    await bundle.getByRole("button", { name }).click();
    return readFile(await (await promise).path());
  };
  const json = JSON.parse(
    (await download("Download yard.json")).toString("utf8"),
  ) as {
    exportId: string;
    exportedAt: string;
    calculated: { status: string };
  };
  const summary = (await download("Download yard-summary.md")).toString("utf8");
  const png = await download("Download yard-map.png");
  expect(json.exportId).toBeTruthy();
  expect(summary).toContain(`Export ID: ${json.exportId}`);
  expect(summary).toContain(`Exported at: ${json.exportedAt}`);
  expect(summary).toContain("Example yard");
  await expect(bundle.getByLabel("Copyable advice prompt")).toHaveValue(
    new RegExp(json.exportId),
  );
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(900);
  expect(png.readUInt32BE(20)).toBe(1280);
  await writeFile("/tmp/yard-map-advice-test.png", png);
});
