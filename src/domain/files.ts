import {
  newYardDocument,
  parseYardDocument,
  type YardDocumentV1,
} from "./document";

export const DRAFT_KEY = "yard-planner-draft-v1";

export interface WorkingCopy {
  document: YardDocumentV1;
  dirtySinceFile: boolean;
  filename: string;
}

interface DraftRead {
  copy: WorkingCopy | null;
  error: string | null;
}

type DraftStore = Pick<Storage, "getItem" | "setItem">;

export function loadBrowserDraft(store: DraftStore): DraftRead {
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (raw === null) return { copy: null, error: null };
    const input: unknown = JSON.parse(raw);
    if (typeof input !== "object" || input === null || !("document" in input))
      throw new Error("Invalid browser draft");
    const envelope = input as Record<string, unknown>;
    if (
      typeof envelope.dirtySinceFile !== "boolean" ||
      typeof envelope.filename !== "string"
    )
      throw new Error("Invalid browser draft metadata");
    return {
      copy: {
        document: parseYardDocument(envelope.document),
        dirtySinceFile: envelope.dirtySinceFile,
        filename: envelope.filename,
      },
      error: null,
    };
  } catch (error) {
    return {
      copy: null,
      error: `Browser draft unavailable: ${message(error)}`,
    };
  }
}

export function saveBrowserDraft(
  store: DraftStore,
  copy: WorkingCopy,
): string | null {
  try {
    store.setItem(DRAFT_KEY, JSON.stringify(copy));
    return null;
  } catch (error) {
    return `Browser draft could not be saved: ${message(error)}`;
  }
}

export function openYardText(
  text: string,
  filename = "yard.json",
): WorkingCopy {
  const input: unknown = JSON.parse(text);
  return {
    document: parseYardDocument(input),
    dirtySinceFile: false,
    filename,
  };
}

export function newWorkingCopy(now = new Date()): WorkingCopy {
  return {
    document: newYardDocument(now),
    dirtySinceFile: true,
    filename: "yard.json",
  };
}

export function editWorkingCopy(
  copy: WorkingCopy,
  update: (document: YardDocumentV1) => YardDocumentV1,
  now = new Date(),
): WorkingCopy {
  return {
    ...copy,
    document: { ...update(copy.document), modifiedAt: now.toISOString() },
    dirtySinceFile: true,
  };
}

export function createFileSnapshot(
  copy: WorkingCopy,
  now = new Date(),
  exportId = crypto.randomUUID(),
): WorkingCopy {
  const stamp = now.toISOString();
  return {
    ...copy,
    document: { ...copy.document, exportId, exportedAt: stamp },
    dirtySinceFile: false,
  };
}

export function serializeYardFile(copy: WorkingCopy): string {
  return `${JSON.stringify(copy.document, null, 2)}\n`;
}

export function downloadText(
  text: string,
  filename: string,
  mimeType = "application/json",
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
