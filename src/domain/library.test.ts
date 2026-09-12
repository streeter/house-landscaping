import { describe, expect, test } from "vitest";
import { DRAFT_KEY, newWorkingCopy } from "./files";
import {
  LIBRARY_KEY,
  loadLibrary,
  makeEntry,
  readEntry,
  saveLibrary,
} from "./library";

function memoryStore(initial: [string, string][] = []) {
  const memory = new Map(initial);
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
}

describe("named browser configurations", () => {
  test("migrates a legacy draft without changing its backup and keeps separate entries with the same document ID", () => {
    const copy = newWorkingCopy();
    const legacy = JSON.stringify(copy);
    const store = memoryStore([[DRAFT_KEY, legacy]]);
    const session = loadLibrary(store);
    expect(session.fresh).toBe(false);
    expect(session.library.entries[0]?.raw).toBe(legacy);
    const second = makeEntry("Summer 🌻", copy);
    saveLibrary(store, session, {
      ...session.library,
      activeId: second.id,
      entries: [...session.library.entries, second],
    });
    const recovered = loadLibrary(store);
    expect(recovered.library.entries).toHaveLength(2);
    expect(recovered.library.activeId).toBe(second.id);
    expect(readEntry(recovered.library.entries[1]!).copy?.document).toEqual(
      copy.document,
    );
    expect(store.getItem(DRAFT_KEY)).toBe(legacy);
  });

  test("keeps incompatible entries untouched while saving a different configuration", () => {
    const raw = '{"document":{"property":{"version":999}}}';
    const store = memoryStore([[DRAFT_KEY, raw]]);
    const session = loadLibrary(store);
    const next = makeEntry("New yard", newWorkingCopy());
    saveLibrary(store, session, {
      ...session.library,
      activeId: next.id,
      entries: [...session.library.entries, next],
    });
    expect(loadLibrary(store).library.entries[0]?.raw).toBe(raw);
    expect(readEntry(session.library.entries[0]!).unreadableRaw).toBe(raw);
  });

  test("quota failures do not advance the session or lose the previous library", () => {
    const store = memoryStore();
    const session = loadLibrary(store);
    saveLibrary(store, session, session.library);
    const raw = session.storedRaw;
    expect(() =>
      saveLibrary(
        {
          ...store,
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
        session,
        {
          ...session.library,
          entries: [makeEntry("Failed", newWorkingCopy())],
        },
      ),
    ).toThrow("quota exceeded");
    expect(session.storedRaw).toBe(raw);
    expect(store.getItem(LIBRARY_KEY)).toBe(raw);
  });

  test("a stale tab cannot overwrite another tab", () => {
    const store = memoryStore();
    const first = loadLibrary(store);
    saveLibrary(store, first, first.library);
    const stale = loadLibrary(store);
    saveLibrary(store, first, {
      ...first.library,
      entries: first.library.entries.map((entry) => ({
        ...entry,
        name: "Renamed",
      })),
    });
    expect(() => saveLibrary(store, stale, stale.library)).toThrow(
      "another tab",
    );
    expect(loadLibrary(store).library.entries[0]?.name).toBe("Renamed");
  });

  test("a damaged library is backed up and cannot be overwritten", () => {
    const store = memoryStore([[LIBRARY_KEY, "{broken"]]);
    const session = loadLibrary(store);
    expect(session.backup).toBe("{broken");
    expect(() => saveLibrary(store, session, session.library)).toThrow(
      "unavailable",
    );
    expect(store.getItem(LIBRARY_KEY)).toBe("{broken");
  });
});
