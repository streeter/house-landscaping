import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { newWorkingCopy } from "./files";
import {
  createYardLink,
  MAX_SHARED_BYTES,
  MAX_SHARE_URL_LENGTH,
  readYardLink,
} from "./sharing";

const encode = (value: unknown) =>
  `1.${gzipSync(JSON.stringify(value)).toString("base64url")}`;

describe("compressed yard links", () => {
  test("round trips the full Unicode yard and configuration name through URL-safe Base64", async () => {
    const copy = newWorkingCopy();
    copy.document.location.growingNotes = "Café 🌱 / + ? & # 日本語";
    const url = new URL(
      await createYardLink(
        copy,
        "Summer 🌻",
        "https://example.com/planner/?view=map&yard=old#plants",
      ),
    );
    expect(url.searchParams.getAll("yard")).toHaveLength(1);
    expect(url.searchParams.get("view")).toBe("map");
    expect(url.hash).toBe("#plants");
    const encoded = url.searchParams.get("yard")!;
    expect(encoded).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    const shared = await readYardLink(encoded);
    expect(shared.name).toBe("Summer 🌻");
    expect(shared.copy.document).toEqual({
      ...copy.document,
      exportId: shared.copy.document.exportId,
      exportedAt: shared.copy.document.exportedAt,
    });
    expect(shared.copy.document.exportId).toEqual(expect.any(String));
    expect(shared.copy.document.exportedAt).toEqual(expect.any(String));
    expect(shared.copy.dirtySinceFile).toBe(true);
    expect(copy.document.exportId).toBeNull();
    expect(shared.upgrade).toBeNull();
  });

  test("rejects malformed, truncated, unsupported, and invalid documents", async () => {
    for (const value of [
      "",
      "2.abc",
      "1.a+b",
      "1.abc",
      encode({ name: "Bad", document: { schemaVersion: 99 } }),
    ])
      await expect(readYardLink(value)).rejects.toThrow();
    const valid = encode({
      name: "Truncated",
      document: newWorkingCopy().document,
    });
    await expect(readYardLink(valid.slice(0, -8))).rejects.toThrow();
    await expect(
      readYardLink(`1.${"a".repeat(MAX_SHARE_URL_LENGTH)}`),
    ).rejects.toThrow("length");
  });

  test("offers only explicit additive map upgrades and rejects changed maps", async () => {
    const copy = newWorkingCopy();
    copy.document.property.version -= 1;
    copy.document.property.surfaces.pop();
    const shared = await readYardLink(
      encode({ name: "Older", document: copy.document }),
    );
    expect(shared.upgrade?.previousVersion).toBe(0);
    expect(copy.document.property.version).toBe(0);
    copy.document.property.surfaces[0]!.label = "Changed surface";
    await expect(
      readYardLink(encode({ name: "Changed", document: copy.document })),
    ).rejects.toThrow();
  });

  test("limits the full URL length, including the app address", async () => {
    const copy = newWorkingCopy();
    await expect(
      createYardLink(
        copy,
        "Yard",
        `https://example.com/${"x".repeat(MAX_SHARE_URL_LENGTH)}`,
      ),
    ).rejects.toThrow("Save / Download");
    copy.document.location.growingNotes = Array.from({ length: 500 }, () =>
      crypto.randomUUID(),
    ).join(" ");
    await expect(
      createYardLink(copy, "Large", "https://example.com/"),
    ).rejects.toThrow("characters");
  });

  test("stops highly compressed oversized payloads before parsing", async () => {
    const copy = newWorkingCopy();
    copy.document.location.growingNotes = "x".repeat(MAX_SHARED_BYTES);
    const value = encode({ name: "Oversized", document: copy.document });
    expect(value.length).toBeLessThan(MAX_SHARE_URL_LENGTH);
    await expect(readYardLink(value)).rejects.toThrow("expanded yard");
    await expect(
      createYardLink(copy, "Oversized", "https://example.com/"),
    ).rejects.toThrow("too large");
  });
});
