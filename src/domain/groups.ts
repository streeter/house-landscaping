import type { Point } from "../property-base";
import type { Plant } from "./document";
import { inferSurfaceId, pointInPolygon } from "./geometry";

function clipHalf(
  polygon: Point[],
  axis: 0 | 1,
  boundary: number,
  lower: boolean,
): Point[] {
  const inside = (point: Point) =>
    lower ? point[axis] <= boundary : point[axis] >= boundary;
  const output: Point[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const startInside = inside(start);
    const endInside = inside(end);
    if (startInside !== endInside) {
      const factor = (boundary - start[axis]) / (end[axis] - start[axis]);
      output.push([
        start[0] + factor * (end[0] - start[0]),
        start[1] + factor * (end[1] - start[1]),
      ]);
    }
    if (endInside) output.push(end);
  }
  return output.filter((point, index) => {
    const previous = output[(index - 1 + output.length) % output.length];
    return (
      !previous ||
      Math.abs(point[0] - previous[0]) > 1e-8 ||
      Math.abs(point[1] - previous[1]) > 1e-8
    );
  });
}

function representativePoint(polygon: Point[]): Point {
  const bounds = {
    minX: Math.min(...polygon.map((point) => point[0])),
    maxX: Math.max(...polygon.map((point) => point[0])),
    minY: Math.min(...polygon.map((point) => point[1])),
    maxY: Math.max(...polygon.map((point) => point[1])),
  };
  const center: Point = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
  ];
  if (pointInPolygon(center, polygon)) return center;
  for (let step = 1; step <= 9; step++) {
    for (let x = 1; x <= 9; x++) {
      const point: Point = [
        bounds.minX + (x / 10) * (bounds.maxX - bounds.minX),
        bounds.minY + (step / 10) * (bounds.maxY - bounds.minY),
      ];
      if (pointInPolygon(point, polygon)) return point;
    }
  }
  return polygon[0]!;
}

/** Split a counted group into two smaller areas while retaining its original ID on the first part. */
export function splitPlantGroup(plant: Plant, newId: string): [Plant, Plant] {
  if (!plant.group) throw new Error("Only counted groups can be split");
  const polygon = plant.group.area;
  const width =
    Math.max(...polygon.map((point) => point[0])) -
    Math.min(...polygon.map((point) => point[0]));
  const height =
    Math.max(...polygon.map((point) => point[1])) -
    Math.min(...polygon.map((point) => point[1]));
  const axis: 0 | 1 = width >= height ? 0 : 1;
  const boundary =
    (Math.min(...polygon.map((point) => point[axis])) +
      Math.max(...polygon.map((point) => point[axis]))) /
    2;
  const left = clipHalf(polygon, axis, boundary, true);
  const right = clipHalf(polygon, axis, boundary, false);
  if (left.length < 3 || right.length < 3)
    throw new Error("Group area cannot be split at its midpoint");
  const countA = Math.floor(plant.group.count / 2);
  const countB = plant.group.count - countA;
  const oldCoverageNote = plant.manualCoverage
    ? `\nPrevious group coverage correction: ${plant.manualCoverage.reason}`
    : "";
  const makePart = (
    id: string,
    label: string,
    count: number,
    area: Point[],
  ): Plant => {
    const position = representativePoint(area);
    return {
      ...structuredClone(plant),
      id,
      label,
      position,
      group: count > 1 ? { count, area } : null,
      growingSetting: {
        ...plant.growingSetting,
        surfaceId: inferSurfaceId(position),
      },
      manualCoverage: null,
      notes: `${plant.notes}${oldCoverageNote}`,
    };
  };
  return [
    makePart(plant.id, `${plant.label} (1)`, countA, left),
    makePart(newId, `${plant.label} (2)`, countB, right),
  ];
}
