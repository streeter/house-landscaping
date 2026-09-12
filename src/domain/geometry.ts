import { propertyBase, type Point } from "../property-base";
import type { OverlapNote, Plant, Zone } from "./document";

const epsilon = 1e-9;

function onSegment(point: Point, a: Point, b: Point): boolean {
  const cross =
    (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point[0] >= Math.min(a[0], b[0]) - epsilon &&
    point[0] <= Math.max(a[0], b[0]) + epsilon &&
    point[1] >= Math.min(a[1], b[1]) - epsilon &&
    point[1] <= Math.max(a[1], b[1]) + epsilon
  );
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    if (onSegment(point, a, b)) return true;
    if (a[1] > point[1] !== b[1] > point[1]) {
      const crossingX =
        a[0] + ((point[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (point[0] < crossingX) inside = !inside;
    }
  }
  return inside;
}

const onPolygonEdge = (point: Point, polygon: Point[]): boolean =>
  polygon.some((a, index) =>
    onSegment(point, a, polygon[(index + 1) % polygon.length]!),
  );

export function coveringZoneIds(point: Point, zones: Zone[]): string[] {
  return zones
    .filter((zone) =>
      zone.polygons.some((polygon) => pointInPolygon(point, polygon)),
    )
    .map((zone) => zone.id);
}

export function effectiveZoneIds(plant: Plant, zones: Zone[]): string[] {
  return (
    plant.manualCoverage?.zoneIds ?? coveringZoneIds(plant.position, zones)
  );
}

export function inferSurfaceId(point: Point): string {
  return (
    [...propertyBase.surfaces]
      .reverse()
      .find((surface) => pointInPolygon(point, surface.points))?.id ?? "lawn"
  );
}

export function revalidateOverlapNotes(
  notes: OverlapNote[],
  zones: Zone[],
): OverlapNote[] {
  return notes.map((note) => {
    const covering = coveringZoneIds(note.point, zones);
    return {
      ...note,
      stale: covering.length < 2 || !sameIds(covering, note.zoneIds),
    };
  });
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

/** A mixed group is flagged if sampled locations within its area have different zone membership. */
export function groupCrossingZoneIds(plant: Plant, zones: Zone[]): string[] {
  if (!plant.group) return [];
  const area = plant.group.area;
  const samples: Point[] = [...area];
  for (let index = 0; index < area.length; index++) {
    const a = area[index]!;
    const b = area[(index + 1) % area.length]!;
    samples.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  const center: Point = [
    area.reduce((sum, vertex) => sum + vertex[0], 0) / area.length,
    area.reduce((sum, vertex) => sum + vertex[1], 0) / area.length,
  ];
  if (pointInPolygon(center, area)) samples.push(center);
  for (const zone of zones) {
    for (const polygon of zone.polygons) {
      const polygonCenter: Point = [
        polygon.reduce((sum, vertex) => sum + vertex[0], 0) / polygon.length,
        polygon.reduce((sum, vertex) => sum + vertex[1], 0) / polygon.length,
      ];
      if (
        pointInPolygon(polygonCenter, polygon) &&
        pointInPolygon(polygonCenter, area)
      )
        samples.push(polygonCenter);
      for (const vertex of polygon) {
        if (pointInPolygon(vertex, area)) samples.push(vertex);
      }
      for (let groupEdge = 0; groupEdge < area.length; groupEdge++) {
        const a = area[groupEdge]!;
        const b = area[(groupEdge + 1) % area.length]!;
        for (let zoneEdge = 0; zoneEdge < polygon.length; zoneEdge++) {
          const c = polygon[zoneEdge]!;
          const d = polygon[(zoneEdge + 1) % polygon.length]!;
          const rx = b[0] - a[0],
            ry = b[1] - a[1];
          const sx = d[0] - c[0],
            sy = d[1] - c[1];
          const denominator = rx * sy - ry * sx;
          if (Math.abs(denominator) < epsilon) continue;
          const qx = c[0] - a[0],
            qy = c[1] - a[1];
          const alongGroup = (qx * sy - qy * sx) / denominator;
          const alongZone = (qx * ry - qy * rx) / denominator;
          if (
            alongGroup < 0 ||
            alongGroup > 1 ||
            alongZone < 0 ||
            alongZone > 1
          )
            continue;
          for (const delta of [-0.0001, 0.0001]) {
            const t = Math.max(0, Math.min(1, alongGroup + delta));
            samples.push([a[0] + t * rx, a[1] + t * ry]);
          }
        }
      }
    }
  }
  return zones
    .filter((zone) => {
      const memberships = samples
        .filter(
          (sample) =>
            !zone.polygons.some((polygon) => onPolygonEdge(sample, polygon)),
        )
        .map((sample) =>
          zone.polygons.some((polygon) => pointInPolygon(sample, polygon)),
        );
      return memberships.some(Boolean) && memberships.some((value) => !value);
    })
    .map((zone) => zone.id);
}
