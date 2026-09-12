import { z } from "zod";
import {
  DRAFT_KEY,
  loadBrowserDraft,
  newWorkingCopy,
  type WorkingCopy,
} from "./files";

export const LIBRARY_KEY = "yard-planner-library-v1";
const entrySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  // Keep unopened documents byte-for-byte, even when their map is incompatible.
  raw: z.string(),
});
const librarySchema = z.strictObject({
  version: z.literal(1),
  activeId: z.string(),
  entries: z.array(entrySchema).min(1),
});
export type YardLibrary = z.infer<typeof librarySchema>;
export type YardEntry = YardLibrary["entries"][number];
export interface LibrarySession {
  library: YardLibrary;
  fresh: boolean;
  storedRaw: string | null;
  error: string | null;
  backup: string | null;
}
type Store = Pick<Storage, "getItem" | "setItem">;

export function makeEntry(name: string, copy: WorkingCopy): YardEntry {
  return { id: crypto.randomUUID(), name, raw: JSON.stringify(copy) };
}
export function readEntry(entry: YardEntry) {
  return loadBrowserDraft({
    getItem: () => entry.raw,
    setItem: () => {
      throw new Error("Read only");
    },
  });
}
export function loadLibrary(store: Store): LibrarySession {
  let raw: string | null = null;
  try {
    raw = store.getItem(LIBRARY_KEY);
    if (raw !== null) {
      const library = librarySchema.parse(JSON.parse(raw));
      if (
        new Set(library.entries.map((entry) => entry.id)).size !==
          library.entries.length ||
        !library.entries.some((entry) => entry.id === library.activeId)
      )
        throw new Error("Invalid configuration IDs");
      return {
        library,
        fresh: false,
        storedRaw: raw,
        error: null,
        backup: null,
      };
    }
    const legacy = store.getItem(DRAFT_KEY);
    const entry = makeEntry(
      legacy === null ? "My yard" : "Browser draft",
      newWorkingCopy(),
    );
    if (legacy !== null) entry.raw = legacy;
    return {
      library: { version: 1, activeId: entry.id, entries: [entry] },
      fresh: legacy === null,
      storedRaw: null,
      error: null,
      backup: null,
    };
  } catch (error) {
    const entry = makeEntry("My yard", newWorkingCopy());
    return {
      library: { version: 1, activeId: entry.id, entries: [entry] },
      fresh: true,
      storedRaw: raw,
      error: `Browser configurations unavailable: ${String(error)}`,
      backup: raw,
    };
  }
}

/** One atomic write; a stale tab cannot replace changes made in another tab. */
export function saveLibrary(
  store: Store,
  session: LibrarySession,
  library: YardLibrary,
): void {
  if (session.error) throw new Error(session.error);
  if (store.getItem(LIBRARY_KEY) !== session.storedRaw)
    throw new Error(
      "Configurations changed in another tab. Download your edits, then reload to continue.",
    );
  const raw = JSON.stringify(library);
  store.setItem(LIBRARY_KEY, raw);
  session.library = library;
  session.storedRaw = raw;
}
