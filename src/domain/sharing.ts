import { z } from "zod";
import {
  createFileSnapshot,
  openYardText,
  prepareMapUpgrade,
  type MapUpgradePreview,
  type WorkingCopy,
} from "./files";

// A portability budget, not a universal browser/server URL limit.
export const MAX_SHARE_URL_LENGTH = 8000;
export const MAX_SHARED_BYTES = 2 * 1024 * 1024;
const envelopeSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  document: z.unknown(),
});
export interface SharedYard {
  name: string;
  copy: WorkingCopy;
  upgrade: MapUpgradePreview | null;
}

const historyMarker = z.object({
  yardPlanner: z.object({ parameter: z.string(), configurationId: z.string() }),
});

// Reloading an address generated in this tab should resume the browser draft,
// while a copied link (or one with a changed parameter) still needs importing.
export function incomingYardParameter(
  url: string,
  state: unknown,
  configurationId: string,
): string | null {
  const parameter = new URL(url).searchParams.get("yard");
  const marker = historyMarker.safeParse(state);
  if (
    marker.success &&
    marker.data.yardPlanner.parameter === parameter &&
    marker.data.yardPlanner.configurationId === configurationId
  )
    return null;
  return parameter;
}

export function replaceYardUrl(url: URL, configurationId?: string): void {
  const previous: unknown = window.history.state;
  const state: Record<string, unknown> =
    previous !== null &&
    typeof previous === "object" &&
    !Array.isArray(previous)
      ? { ...previous }
      : {};
  if (configurationId)
    state.yardPlanner = {
      parameter: url.searchParams.get("yard"),
      configurationId,
    };
  else delete state.yardPlanner;
  window.history.replaceState(state, "", url);
}

function checkSupport(): void {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  )
    throw new Error(
      "This browser does not support compressed yard links. Use a yard JSON file instead.",
    );
}

export async function createYardLink(
  copy: WorkingCopy,
  name: string,
  base: string,
): Promise<string> {
  checkSupport();
  const snapshot = createFileSnapshot(copy);
  const text = JSON.stringify(
    envelopeSchema.parse({ name, document: snapshot.document }),
  );
  if (new TextEncoder().encode(text).byteLength > MAX_SHARED_BYTES)
    throw new Error(
      "This yard is too big to include in the URL. You'll need to download it to share it.",
    );
  const compressed = await new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(compressed))
    binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = new URL(base);
  url.searchParams.set("yard", `1.${encoded}`);
  if (url.href.length > MAX_SHARE_URL_LENGTH)
    throw new Error(
      "This yard is too big to include in the URL. You'll need to download it to share it.",
    );
  return url.href;
}

export async function readYardLink(value: string): Promise<SharedYard> {
  checkSupport();
  if (value.length > MAX_SHARE_URL_LENGTH)
    throw new Error(
      "The yard link exceeds the supported length. Ask for the yard JSON file instead.",
    );
  if (!/^1\.[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid or unsupported yard link.");
  const encoded = value.slice(2).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_SHARED_BYTES) {
        await reader.cancel();
        throw new Error(
          "The expanded yard exceeds the supported size. Use a yard JSON file instead.",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const expanded = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    expanded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const envelope = envelopeSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(expanded)),
  );
  try {
    return {
      name: envelope.name,
      copy: {
        ...openYardText(JSON.stringify(envelope.document)),
        dirtySinceFile: true,
      },
      upgrade: null,
    };
  } catch (error) {
    const upgrade = prepareMapUpgrade(envelope.document);
    if (!upgrade) throw error;
    return { name: envelope.name, copy: upgrade.copy, upgrade };
  }
}
