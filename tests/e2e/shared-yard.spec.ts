import { gzipSync, gunzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import type { YardDocumentV1 } from "../../src/domain/document";
import { readDraftRaw } from "./drafts";

function urlYard(
  page: Page,
): { name: string; document: YardDocumentV1 } | null {
  const parameter = new URL(page.url()).searchParams.get("yard");
  return parameter
    ? (JSON.parse(
        gunzipSync(Buffer.from(parameter.slice(2), "base64url")).toString(),
      ) as { name: string; document: YardDocumentV1 })
    : null;
}

test("a compressed link imports a separate named yard in a fresh browser and beside existing yards", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Shared garden 🌱");
  await page
    .getByLabel("Growing conditions")
    .fill("Afternoon shade; café patio");
  page.once("dialog", (dialog) => dialog.accept("Summer 🌻"));
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect.poll(() => urlYard(page)?.name).toBe("Summer 🌻");
  const url = page.url();
  expect(url.length).toBeLessThan(8000);
  expect(urlYard(page)?.document.location.name).toBe("Shared garden 🌱");
  await page.getByLabel("Location", { exact: true }).fill("Later local edits");
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("Later local edits");
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto(url);
    const panel = other.getByRole("region", { name: "Shared yard import" });
    await expect(panel).toContainText("Summer 🌻");
    await panel
      .getByRole("button", { name: "Import as new configuration", exact: true })
      .click();
    await expect(other.getByLabel("Location", { exact: true })).toHaveValue(
      "Shared garden 🌱",
    );
    await expect(other.getByLabel("Growing conditions")).toHaveValue(
      "Afternoon shade; café patio",
    );
    await expect
      .poll(() => urlYard(other)?.document.location.name)
      .toBe("Shared garden 🌱");
    await other.reload();
    await expect(
      other.getByRole("region", { name: "Shared yard import" }),
    ).toHaveCount(0);
    await other.getByRole("button", { name: "Resume browser draft" }).click();
    await expect(other.getByLabel("Location", { exact: true })).toHaveValue(
      "Shared garden 🌱",
    );
  } finally {
    await fresh.close();
  }
  const originalRaw = await readDraftRaw(page);
  await page.goto(url);
  await expect(
    page.getByRole("region", { name: "Shared yard import" }),
  ).toContainText("Summer 🌻");
  expect(await readDraftRaw(page)).toBe(originalRaw);
  expect(page.url()).toBe(url);
  const originalId = await page
    .getByLabel("Yard configuration", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Import as new configuration", exact: true })
    .click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Shared garden 🌱",
  );
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(originalId);
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Later local edits",
  );
});

test("invalid shared URLs preserve browser storage and can be dismissed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Keep me");
  const raw = await readDraftRaw(page);
  await page.goto("/?view=map&yard=1.invalid");
  await expect(page.getByRole("alert")).toContainText(
    "Could not open shared yard",
  );
  expect(await readDraftRaw(page)).toBe(raw);
  await page.getByRole("button", { name: "Dismiss shared yard" }).click();
  expect(new URL(page.url()).searchParams.get("view")).toBe("map");
  expect(new URL(page.url()).searchParams.has("yard")).toBe(false);
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Keep me",
  );
});

test("shared additive maps wait for explicit import and incompatible maps are rejected", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Location", { exact: true }).fill("Current map");
  const raw = (await readDraftRaw(page))!;
  const { document } = JSON.parse(raw) as {
    document: { property: { version: number; surfaces: { label: string }[] } };
  };
  document.property.version -= 1;
  document.property.surfaces.pop();
  const link = () =>
    `/?yard=1.${gzipSync(JSON.stringify({ name: "Old map", document })).toString("base64url")}`;
  await page.goto(link());
  await expect(
    page.getByRole("region", { name: "Shared yard import" }),
  ).toContainText("map version 0");
  expect(await readDraftRaw(page)).toBe(raw);
  await page
    .getByRole("button", { name: "Update map and import as new configuration" })
    .click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Current map",
  );
  const imported = await readDraftRaw(page);
  document.property.surfaces[0]!.label = "Changed boundary";
  await page.goto(link());
  await expect(page.getByRole("alert")).toContainText(
    "Could not open shared yard",
  );
  expect(await readDraftRaw(page)).toBe(imported);
});

test("oversized yards drop only the yard parameter, keep saving, and regain their URL when reduced", async ({
  page,
}) => {
  await page.goto("/?view=map#plants");
  await expect.poll(() => urlYard(page)).not.toBeNull();
  const historyLength = await page.evaluate(() => history.length);
  const notes = Array.from({ length: 500 }, () => crypto.randomUUID()).join(
    " ",
  );
  await page.getByLabel("Growing conditions").fill(notes);
  await expect(page.getByRole("alert")).toContainText(
    "This yard is too big to include in the URL. You'll need to download it to share it.",
  );
  expect(new URL(page.url()).searchParams.has("yard")).toBe(false);
  expect(new URL(page.url()).searchParams.get("view")).toBe("map");
  expect(new URL(page.url()).hash).toBe("#plants");
  expect(
    (JSON.parse((await readDraftRaw(page))!) as { document: YardDocumentV1 })
      .document.location.growingNotes,
  ).toBe(notes);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save / Download" }).click();
  expect((await download).suggestedFilename()).toBe("yard.json");
  await page.getByLabel("Growing conditions").fill("Fits again 🌱");
  await expect
    .poll(() => urlYard(page)?.document.location.growingNotes)
    .toBe("Fits again 🌱");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test("edits, undo, rename, switching, and file replacement update the address automatically", async ({
  page,
}) => {
  await page.goto("/?view=map#plants");
  await page.evaluate(() =>
    history.replaceState({ existingState: "keep" }, ""),
  );
  const historyLength = await page.evaluate(() => history.length);
  await page.getByLabel("Location", { exact: true }).fill("First yard");
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("First yard");
  const original = urlYard(page)!;
  await page.getByLabel("Location", { exact: true }).fill("Second edit");
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("Second edit");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("First yard");
  page.once("dialog", (dialog) => dialog.accept("Renamed yard"));
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect.poll(() => urlYard(page)?.name).toBe("Renamed yard");
  const firstId = await page
    .getByLabel("Yard configuration", { exact: true })
    .inputValue();
  page.once("dialog", (dialog) => dialog.accept("Another yard"));
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect.poll(() => urlYard(page)?.name).toBe("Another yard");
  expect(urlYard(page)?.document.location.name).toBe("");
  const secondId = await page
    .getByLabel("Yard configuration", { exact: true })
    .inputValue();
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(firstId);
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("First yard");
  await page
    .getByLabel("Yard configuration", { exact: true })
    .selectOption(secondId);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Open yard JSON").setInputFiles({
    name: "first.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original.document)),
  });
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("First yard");
  await expect.poll(() => urlYard(page)?.name).toBe("Another yard");
  expect(new URL(page.url()).searchParams.get("view")).toBe("map");
  expect(new URL(page.url()).hash).toBe("#plants");
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(
    await page.evaluate(
      () => (history.state as { existingState: string }).existingState,
    ),
  ).toBe("keep");
});

test("an older compression result cannot replace a newer edit", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => urlYard(page)).not.toBeNull();
  // Hold the first compression response until the next edit has been encoded.
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      Response.prototype,
      "arrayBuffer",
    )!.value as (this: Response) => Promise<ArrayBuffer>;
    let release: (() => void) | undefined;
    let calls = 0;
    let completed = 0;
    Response.prototype.arrayBuffer = async function () {
      const bytes = await original.call(this);
      calls += 1;
      if (calls === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      else {
        window.setTimeout(() => release?.(), 50);
        Response.prototype.arrayBuffer = original;
      }
      completed += 1;
      return bytes;
    };
    Object.defineProperty(window, "compressionCompleted", {
      get: () => completed === 2,
      configurable: true,
    });
    Object.defineProperty(window, "compressionStarted", {
      get: () => calls > 0,
      configurable: true,
    });
  });
  await page.getByLabel("Location", { exact: true }).fill("Slow old edit");
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "compressionStarted") as boolean),
    )
    .toBe(true);
  await page.getByLabel("Location", { exact: true }).fill("Latest edit");
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("Latest edit");
  await expect
    .poll(() =>
      page.evaluate(
        () => Reflect.get(window, "compressionCompleted") as boolean,
      ),
    )
    .toBe(true);
  expect(urlYard(page)?.document.location.name).toBe("Latest edit");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Shared yard import" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Resume browser draft" }).click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Latest edit",
  );
});

test("the URL can recover edits after browser autosave fails", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Location", { exact: true })
    .fill("Saved before failure");
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("Saved before failure");
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      "setItem",
    )!.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (key, value) {
      if (key === "yard-planner-library-v1") throw new Error("quota exceeded");
      original.call(this, key, value);
    };
  });
  await page
    .getByLabel("Location", { exact: true })
    .fill("Recover these unsaved edits");
  await expect(page.getByRole("status")).toContainText("quota exceeded");
  await expect
    .poll(() => urlYard(page)?.document.location.name)
    .toBe("Recover these unsaved edits");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Shared yard import" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import as new configuration", exact: true })
    .click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveValue(
    "Recover these unsaved edits",
  );
});
