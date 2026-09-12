import {
  newYardDocument,
  parseYardDocument,
  upgradeAdditiveMap,
  type YardDocumentV1,
} from "./document";
import { calculateYardSchedule } from "./timing";

export const DRAFT_KEY = "yard-planner-draft-v1";

export interface WorkingCopy {
  document: YardDocumentV1;
  dirtySinceFile: boolean;
  filename: string;
}

export interface MapUpgradePreview {
  copy: WorkingCopy;
  previousVersion: number;
  addedSurfaceLabels: string[];
  plantsToReview: string[];
}

export interface DraftRead {
  copy: WorkingCopy | null;
  upgrade: MapUpgradePreview | null;
  unreadableRaw: string | null;
  error: string | null;
}

type DraftStore = Pick<Storage, "getItem" | "setItem">;

export function loadBrowserDraft(store: DraftStore): DraftRead {
  let raw: string | null = null;
  try {
    raw = store.getItem(DRAFT_KEY);
    if (raw === null)
      return { copy: null, upgrade: null, unreadableRaw: null, error: null };
    const input: unknown = JSON.parse(raw);
    if (typeof input !== "object" || input === null || !("document" in input))
      throw new Error("Invalid browser draft");
    const envelope = input as Record<string, unknown>;
    if (
      typeof envelope.dirtySinceFile !== "boolean" ||
      typeof envelope.filename !== "string"
    )
      throw new Error("Invalid browser draft metadata");
    try {
      return {
        copy: {
          document: withCalculation(parseYardDocument(envelope.document)),
          dirtySinceFile: envelope.dirtySinceFile,
          filename: envelope.filename,
        },
        upgrade: null,
        unreadableRaw: null,
        error: null,
      };
    } catch (error) {
      const upgrade = prepareMapUpgrade(envelope.document, envelope.filename);
      if (upgrade)
        return { copy: null, upgrade, unreadableRaw: null, error: null };
      throw error;
    }
  } catch (error) {
    return {
      copy: null,
      upgrade: null,
      unreadableRaw: raw,
      error: `Browser draft unavailable: ${message(error)}`,
    };
  }
}

export function prepareMapUpgrade(
  input: unknown,
  filename = "yard.json",
): MapUpgradePreview | null {
  const upgrade = upgradeAdditiveMap(input);
  if (!upgrade) return null;
  return {
    copy: {
      document: withCalculation(upgrade.document),
      dirtySinceFile: true,
      filename,
    },
    previousVersion: upgrade.previousVersion,
    addedSurfaceLabels: upgrade.addedSurfaces.map((surface) => surface.label),
    plantsToReview: upgrade.plantsToReview,
  };
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
    document: withCalculation(parseYardDocument(input)),
    dirtySinceFile: false,
    filename,
  };
}

export function newWorkingCopy(now = new Date()): WorkingCopy {
  return {
    document: withCalculation(newYardDocument(now)),
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
    document: withCalculation({
      ...update(copy.document),
      modifiedAt: now.toISOString(),
    }),
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
    document: withCalculation(
      parseYardDocument({ ...copy.document, exportId, exportedAt: stamp }),
    ),
    dirtySinceFile: false,
  };
}

function withCalculation(document: YardDocumentV1): YardDocumentV1 {
  return { ...document, calculated: calculateYardSchedule(document) };
}

export function serializeYardFile(copy: WorkingCopy): string {
  return `${JSON.stringify(copy.document, null, 2)}\n`;
}

export function downloadText(
  text: string,
  filename: string,
  mimeType = "application/json",
): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
