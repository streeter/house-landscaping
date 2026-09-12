import rawPropertyBase from "../data/property-base.json" with { type: "json" };

export type Point = [number, number];
export type SurfaceKind =
  | "ground"
  | "planter"
  | "path"
  | "patio"
  | "driveway"
  | "porch"
  | "stairs"
  | "building";

export interface PropertySurface {
  id: string;
  label: string;
  kind: SurfaceKind;
  points: Point[];
  approximate: boolean;
}

export interface PropertyBase {
  id: string;
  version: number;
  widthFeet: number;
  lengthFeet: number;
  orientation: Record<"top" | "bottom" | "left" | "right", string>;
  tracing: {
    reference: string;
    imageWidth: number;
    imageHeight: number;
    calibratedImageBounds: [number, number, number, number];
    note: string;
  };
  surfaces: PropertySurface[];
}

export const propertyBase = rawPropertyBase as PropertyBase;

const colors: Record<SurfaceKind, string> = {
  ground: "#d5e5b7",
  planter: "#b28457",
  path: "#d9dcd5",
  patio: "#d8d6cd",
  driveway: "#d4d8d7",
  porch: "#d3d0c3",
  stairs: "#c1c6bd",
  building: "#b89067",
};

const escapeXml = (text: string): string =>
  text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character] ?? character;
  });

export function renderPropertySvg(base: PropertyBase = propertyBase): string {
  const surfaces = base.surfaces
    .map((surface) => {
      const points = surface.points.map(([x, y]) => `${x},${y}`).join(" ");
      const stroke =
        surface.kind === "building" || surface.kind === "planter"
          ? "#5c4a38"
          : "#8e9989";
      const dash = surface.approximate ? ' stroke-dasharray="0.5 0.35"' : "";
      const strokeWidth =
        surface.kind === "building"
          ? 0.4
          : surface.kind === "planter"
            ? 0.3
            : 0.16;
      return `<polygon id="${escapeXml(surface.id)}" data-kind="${surface.kind}" points="${points}" fill="${colors[surface.kind]}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}><title>${escapeXml(surface.label)}${surface.approximate ? " (approximate)" : ""}</title></polygon>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${base.widthFeet} ${base.lengthFeet}" role="img" aria-labelledby="map-title map-desc">
  <title id="map-title">Fixed property base map</title>
  <desc id="map-desc">${base.widthFeet} by ${base.lengthFeet} feet. North is left; driveway and west boundary are at the bottom. Structural positions are estimated from an illustration.</desc>
  <defs>
    <pattern id="wood" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 0v2 M1 0v2" stroke="#785c42" stroke-opacity=".18" stroke-width=".12"/></pattern>
    <pattern id="steps" width="2" height="1.2" patternUnits="userSpaceOnUse"><path d="M0 0h2" stroke="#818d85" stroke-width=".18"/></pattern>
  </defs>
  ${surfaces}
  <polygon points="${
    base.surfaces
      .find((s) => s.id === "residence")
      ?.points.map(([x, y]) => `${x},${y}`)
      .join(" ") ?? ""
  }" fill="url(#wood)"/>
  <rect x="0.2" y="0.2" width="${base.widthFeet - 0.4}" height="${base.lengthFeet - 0.4}" fill="none" stroke="#4e6951" stroke-width=".4" stroke-dasharray="1 .5"/>
  <g fill="#314837" font-family="system-ui, sans-serif" text-anchor="middle">
    <text x="19" y="33" font-size="2.4">Patio</text>
    <text x="20" y="70" font-size="3">Residence</text>
    <text x="11" y="97" font-size="1.8">Porch</text>
    <text x="24" y="111" font-size="2.4">Driveway</text>
  </g>
  <g fill="#314837" font-family="system-ui, sans-serif" font-size="1.6">
    <path d="M7 10H2 M2 10l2-1.2 M2 10l2 1.2" fill="none" stroke="#314837" stroke-width=".35"/><text x="2" y="8">N</text>
    <path d="M2 116h10 M2 115v2 M7 115v2 M12 115v2" fill="none" stroke="#314837" stroke-width=".3"/><text x="7" y="114">10 ft</text>
  </g>
</svg>
`;
}
