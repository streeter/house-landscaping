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
      for (const vertex of polygon) {
        if (pointInPolygon(vertex, area)) samples.push(vertex);
      }
    }
  }
  return zones
    .filter((zone) => {
      const memberships = samples.map((sample) =>
        zone.polygons.some((polygon) => pointInPolygon(sample, polygon)),
      );
      return memberships.some(Boolean) && memberships.some((value) => !value);
    })
    .map((zone) => zone.id);
}
