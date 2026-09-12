import type { Page } from "@playwright/test";

export function readDraftRaw(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("yard-planner-library-v1");
    if (!raw) return localStorage.getItem("yard-planner-draft-v1");
    const library = JSON.parse(raw) as {
      activeId: string;
      entries: { id: string; raw: string }[];
    };
    return library.entries.find((entry) => entry.id === library.activeId)!.raw;
  });
}

export function seedLegacyDraft(page: Page, raw: string): Promise<void> {
  return page.evaluate((value) => {
    localStorage.removeItem("yard-planner-library-v1");
    localStorage.setItem("yard-planner-draft-v1", value);
  }, raw);
}
