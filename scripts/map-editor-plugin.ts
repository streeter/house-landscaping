import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import prettier from "prettier";
import {
  renderPropertySvg,
  type PropertyBase,
  type PropertySurface,
} from "../src/property-base";

const dataFile = new URL("../data/property-base.json", import.meta.url);
const svgFile = new URL("../public/property-base.svg", import.meta.url);
const kinds = new Set([
  "ground",
  "planter",
  "path",
  "patio",
  "driveway",
  "porch",
  "stairs",
  "building",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validPoint(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= 0 &&
    value[0] <= 40 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[1] >= 0 &&
    value[1] <= 120
  );
}

function validSurface(value: unknown): value is PropertySurface {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[a-z][a-z0-9-]*$/.test(value.id) &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    typeof value.kind === "string" &&
    kinds.has(value.kind) &&
    typeof value.approximate === "boolean" &&
    Array.isArray(value.points) &&
    value.points.length >= 3 &&
    value.points.every(validPoint)
  );
}

export function validateMapEdit(
  input: unknown,
  current: PropertyBase,
): PropertyBase {
  if (
    !isRecord(input) ||
    input.id !== current.id ||
    input.version !== current.version
  )
    throw new Error(
      "Map ID or version changed; reload the editor before saving",
    );
  if (
    input.widthFeet !== 40 ||
    input.lengthFeet !== 120 ||
    JSON.stringify(input.orientation) !== JSON.stringify(current.orientation) ||
    JSON.stringify(input.tracing) !== JSON.stringify(current.tracing)
  )
    throw new Error(
      "Property dimensions, orientation, and tracing calibration are fixed",
    );
  if (!Array.isArray(input.surfaces) || !input.surfaces.every(validSurface))
    throw new Error(
      "Each surface needs a valid ID, kind, label, and polygon inside the lot",
    );
  const surfaces = input.surfaces;
  if (
    new Set(surfaces.map((surface) => surface.id)).size !== surfaces.length ||
    surfaces[0]?.id !== "lawn" ||
    surfaces[0].kind !== "ground"
  )
    throw new Error(
      "Surface IDs must be unique and lawn must remain the base layer",
    );
  return { ...current, surfaces, version: current.version + 1 };
}

async function readCurrent(): Promise<PropertyBase> {
  return JSON.parse(await readFile(dataFile, "utf8")) as PropertyBase;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Map edit is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function respond(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export function mapEditorPlugin(): Plugin {
  return {
    name: "local-map-editor",
    configureServer(server) {
      server.middlewares.use("/__map", (request, response, next) => {
        if (request.method !== "GET" && request.method !== "POST")
          return next();
        void (async () => {
          try {
            const current = await readCurrent();
            if (request.method === "GET")
              return respond(response, 200, current);
            if (
              request.headers.host !== "127.0.0.1:5174" ||
              request.headers.origin !== "http://127.0.0.1:5174" ||
              !request.headers["content-type"]?.startsWith("application/json")
            )
              throw new Error(
                "Map writes require the local editor origin and JSON content type",
              );
            const nextMap = validateMapEdit(await readBody(request), current);
            const formatted = await prettier.format(JSON.stringify(nextMap), {
              parser: "json",
            });
            await writeFile(dataFile, formatted);
            await writeFile(svgFile, renderPropertySvg(nextMap));
            respond(response, 200, nextMap);
          } catch (error) {
            respond(response, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      });
    },
  };
}
