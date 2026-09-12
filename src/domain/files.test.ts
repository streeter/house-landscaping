import { describe, expect, test } from "vitest";
import {
  createFileSnapshot,
  editWorkingCopy,
  loadBrowserDraft,
  newWorkingCopy,
  openYardText,
  saveBrowserDraft,
  serializeYardFile,
} from "./files";

describe("browser draft and portable file", () => {
  test("completed edits survive a browser draft round trip", () => {
    const memory = new Map<string, string>();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };
    const initial = newWorkingCopy(new Date("2026-09-11T12:00:00Z"));
    const edited = editWorkingCopy(
      initial,
      (document) => ({
        ...document,
        location: { ...document.location, name: "Home" },
      }),
      new Date("2026-09-11T12:01:00Z"),
    );
    expect(saveBrowserDraft(store, edited)).toBeNull();
    const recovered = loadBrowserDraft(store).copy;
    expect(recovered?.document.id).toBe(initial.document.id);
    expect(recovered?.document.location.name).toBe("Home");
    expect(recovered?.dirtySinceFile).toBe(true);
  });

  test("failed storage retains an exportable in-memory copy", () => {
    const copy = newWorkingCopy();
    const store = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(loadBrowserDraft(store).error).toContain("storage disabled");
    expect(saveBrowserDraft(store, copy)).toContain("quota exceeded");
    expect(
      openYardText(serializeYardFile(createFileSnapshot(copy))).document.id,
    ).toBe(copy.document.id);
  });

  test("invalid file never mutates the working copy", () => {
    const copy = newWorkingCopy();
    expect(() => openYardText("{broken")).toThrow();
    expect(() =>
      openYardText(JSON.stringify({ ...copy.document, schemaVersion: 2 })),
    ).toThrow();
    expect(copy.document.schemaVersion).toBe(1);
  });
});
