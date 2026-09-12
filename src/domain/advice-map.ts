import { renderPropertySvg } from "../property-base";
import type { YardDocumentV1 } from "./document";

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
const points = (polygon: [number, number][]) =>
  polygon.map(([x, y]) => `${x},${y}`).join(" ");

export function renderAdviceMapSvg(document: YardDocumentV1): string {
  const base = renderPropertySvg(document.property).replace(
    "<svg ",
    '<svg x="0" y="0" width="40" height="120" ',
  );
  const clipShapes = document.zones.flatMap((zone, zoneIndex) =>
    zone.polygons.map((polygon, polygonIndex) => ({
      id: `coverage-${zoneIndex}-${polygonIndex}`,
      polygon,
    })),
  );
  const clips = clipShapes
    .map(
      ({ id, polygon }) =>
        `<clipPath id="${id}"><polygon points="${points(polygon)}"/></clipPath>`,
    )
    .join("");
  const hatches: string[] = [];
  for (let left = 0; left < document.zones.length; left++) {
    for (let right = left + 1; right < document.zones.length; right++) {
      for (const a of document.zones[left]!.polygons.keys())
        for (const b of document.zones[right]!.polygons.keys())
          hatches.push(
            `<g clip-path="url(#coverage-${left}-${a})"><g clip-path="url(#coverage-${right}-${b})"><rect width="40" height="120" fill="url(#overlap-hatch)"/></g></g>`,
          );
    }
  }
  const zoneShapes = document.zones
    .map((zone) =>
      zone.polygons
        .map(
          (polygon) =>
            `<polygon points="${points(polygon)}" fill="${zone.color}" fill-opacity=".24" stroke="${zone.color}" stroke-width=".35"/>`,
        )
        .join(""),
    )
    .join("");
  const plantShapes = document.plants
    .filter((plant) => plant.status !== "retired")
    .map(
      (plant) =>
        `<g><circle cx="${plant.position[0]}" cy="${plant.position[1]}" r=".85" fill="${plant.status === "planned" ? "#d88935" : "#176542"}" stroke="white" stroke-width=".25"/><text x="${plant.position[0] + 1.2}" y="${plant.position[1] - 0.5}" font-size="1.6" fill="#153d2a" stroke="white" stroke-width=".28" paint-order="stroke">${xml(plant.label)}</text></g>`,
    )
    .join("");
  const legend = document.zones
    .map(
      (zone, index) =>
        `<g transform="translate(460 ${138 + index * 56})"><rect width="22" height="22" fill="${zone.color}" fill-opacity=".42" stroke="${zone.color}" stroke-width="2"/><text x="33" y="17" font-size="20" fill="#213e2a">${xml(zone.name)} · station ${zone.stationNumber ?? "?"}</text></g>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1280" viewBox="0 0 900 1280">
    <rect width="900" height="1280" fill="#fffdf8"/>
    <defs>${clips}<pattern id="overlap-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V2" stroke="#293c31" stroke-opacity=".55" stroke-width=".24"/></pattern></defs>
    <text x="20" y="27" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#183e2a">Yard map · ${xml(document.location.name || "Property")}</text>
    <g transform="translate(20 40) scale(10)">${base}${zoneShapes}${hatches.join("")}${plantShapes}</g>
    <g font-family="Arial,sans-serif">${legend}
      <text x="460" y="95" font-size="24" font-weight="bold" fill="#183e2a">Coverage legend</text>
      <text x="460" y="640" font-size="19" fill="#283f30">North ← · 10 ft scale on map</text>
      <text x="460" y="680" font-size="17" fill="#283f30">Hatching: overlapping zones</text>
      <text x="460" y="730" font-size="16" fill="#4f6254">Structural edges are approximate.</text>
      <text x="460" y="760" font-size="16" fill="#4f6254">Coverage is area-based; flow unknown.</text>
      <text x="460" y="1160" font-size="14" fill="#4f6254">Export ${xml(document.exportId ?? "draft")}</text>
      <text x="460" y="1185" font-size="14" fill="#4f6254">${xml(document.exportedAt ?? "not exported")}</text>
      <text x="460" y="1210" font-size="14" fill="#4f6254">Week ${xml(document.referenceWeekStart)} · ${xml(document.location.timezone ?? "timezone unknown")}</text>
    </g>
  </svg>`;
}

export async function renderAdviceMapPng(
  document: YardDocumentV1,
): Promise<Blob> {
  const svg = new Blob([renderAdviceMapSvg(document)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Could not render annotated yard map"));
      image.src = url;
    });
    const canvas = documentCanvas();
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not encode yard map PNG")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function documentCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1280;
  return canvas;
}
