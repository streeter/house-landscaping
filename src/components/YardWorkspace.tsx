import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  coveringZoneIds,
  effectiveZoneIds,
  groupCrossingZoneIds,
  inferSurfaceId,
  pointInPolygon,
} from "../domain/geometry";
import { splitPlantGroup } from "../domain/groups";
import type { Plant, YardDocumentV1 } from "../domain/document";
import type { Point } from "../property-base";
import { ZoneLayers } from "./ZoneLayers";

interface Props {
  document: YardDocumentV1;
  onChange: (next: YardDocumentV1) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const clampPoint = ([x, y]: Point): Point => [
  Math.round(clamp(x, 0, 40) * 10) / 10,
  Math.round(clamp(y, 0, 120) * 10) / 10,
];

function createPlant(point: Point): Plant {
  return {
    id: crypto.randomUUID(),
    label: "New plant",
    species: null,
    position: point,
    group: null,
    status: "existing",
    establishmentDate: null,
    sizeNotes: "",
    sun: null,
    soil: null,
    notes: "",
    growingSetting: {
      kind: "ground",
      surfaceId: inferSurfaceId(point),
      containerWidthFeet: null,
      containerDepthFeet: null,
      drainageNotes: null,
    },
    manualCoverage: null,
  };
}

export function YardWorkspace({ document, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [drawingGroup, setDrawingGroup] = useState(false);
  const [groupPoints, setGroupPoints] = useState<Point[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [showBase, setShowBase] = useState(true);
  const [showPlants, setShowPlants] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [coverageDraft, setCoverageDraft] = useState<{
    plantId: string;
    zoneIds: string[];
    reason: string;
  } | null>(null);
  const [past, setPast] = useState<YardDocumentV1[]>([]);
  const [future, setFuture] = useState<YardDocumentV1[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; point: Point } | null>(null);

  const viewWidth = 40 / zoom;
  const viewHeight = 120 / zoom;
  const selected =
    document.plants.find((plant) => plant.id === selectedId) ?? null;
  const selectedPeriod = document.calculated.plantPeriods.find(
    (period) => period.id === selectedId,
  );
  const active = document.plants.filter((plant) => plant.status === "existing");
  const planned = document.plants.filter((plant) => plant.status === "planned");
  const retired = document.plants.filter((plant) => plant.status === "retired");

  const commit = (next: YardDocumentV1) => {
    setPast((items) => [...items, document].slice(-50));
    setFuture([]);
    onChange(next);
  };

  const updatePlant = (id: string, update: (plant: Plant) => Plant) => {
    commit({
      ...document,
      plants: document.plants.map((plant) =>
        plant.id === id ? update(plant) : plant,
      ),
    });
  };

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([document, ...future]);
    onChange(previous);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, document]);
    onChange(next);
  };

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z")
        return;
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
      )
        return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  const svgPoint = (clientX: number, clientY: number): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    return clampPoint([point.x, point.y]);
  };

  const moveView = (x: number, y: number) =>
    setPan(([oldX, oldY]) => [
      clamp(oldX + x * viewWidth * 0.25, 0, 40 - viewWidth),
      clamp(oldY + y * viewHeight * 0.25, 0, 120 - viewHeight),
    ]);

  const changeZoom = (next: number) => {
    const newZoom = clamp(next, 1, 4);
    const center: Point = [pan[0] + viewWidth / 2, pan[1] + viewHeight / 2];
    setZoom(newZoom);
    setPan([
      clamp(center[0] - 20 / newZoom, 0, 40 - 40 / newZoom),
      clamp(center[1] - 60 / newZoom, 0, 120 - 120 / newZoom),
    ]);
  };

  const locate = (plant: Plant) => {
    setSelectedId(plant.id);
    const newZoom = Math.max(zoom, 2);
    setZoom(newZoom);
    setPan([
      clamp(plant.position[0] - 20 / newZoom, 0, 40 - 40 / newZoom),
      clamp(plant.position[1] - 60 / newZoom, 0, 120 - 120 / newZoom),
    ]);
  };

  const placePlant = (point: Point) => {
    const plant = createPlant(point);
    commit({ ...document, plants: [...document.plants, plant] });
    setSelectedId(plant.id);
    setPlacing(false);
  };

  const startDrag = (event: PointerEvent<SVGCircleElement>, plant: Plant) => {
    if (placing || drawingGroup) return;
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = { id: plant.id, point: plant.position };
    setSelectedId(plant.id);
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const endDrag = () => {
    const dragging = dragRef.current;
    dragRef.current = null;
    setPreviewPoint(null);
    if (!dragging) return;
    const plant = document.plants.find((item) => item.id === dragging.id);
    if (
      !plant ||
      (plant.position[0] === dragging.point[0] &&
        plant.position[1] === dragging.point[1])
    )
      return;
    updatePlant(dragging.id, (item) => ({
      ...item,
      position: dragging.point,
      growingSetting: {
        ...item.growingSetting,
        surfaceId: inferSurfaceId(dragging.point),
      },
    }));
  };

  const duplicate = () => {
    if (!selected) return;
    const position = clampPoint([
      selected.position[0] + 1,
      selected.position[1] + 1,
    ]);
    const clone: Plant = {
      ...structuredClone(selected),
      id: crypto.randomUUID(),
      label: `${selected.label} copy`,
      position,
      growingSetting: {
        ...selected.growingSetting,
        surfaceId: inferSurfaceId(position),
      },
      group: selected.group
        ? {
            ...selected.group,
            area: selected.group.area.map(([x, y]) =>
              clampPoint([x + 1, y + 1]),
            ),
          }
        : null,
    };
    commit({ ...document, plants: [...document.plants, clone] });
    setSelectedId(clone.id);
  };

  const finishGroupArea = () => {
    if (!selected || groupPoints.length < 3) return;
    if (!pointInPolygon(selected.position, groupPoints)) {
      setGroupError("Group area must include the plant marker.");
      return;
    }
    updatePlant(selected.id, (plant) => ({
      ...plant,
      group: { count: plant.group?.count ?? 2, area: groupPoints },
    }));
    setGroupPoints([]);
    setDrawingGroup(false);
    setGroupError(null);
  };

  const splitGroup = () => {
    if (!selected?.group) return;
    try {
      const [first, second] = splitPlantGroup(selected, crypto.randomUUID());
      commit({
        ...document,
        plants: [
          ...document.plants.map((plant) =>
            plant.id === selected.id ? first : plant,
          ),
          second,
        ],
      });
      setGroupError(null);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : String(error));
    }
  };

  const setField = (
    field:
      | "label"
      | "species"
      | "notes"
      | "sun"
      | "soil"
      | "sizeNotes"
      | "establishmentDate",
    value: string,
  ) => {
    if (!selected) return;
    updatePlant(selected.id, (plant) => ({
      ...plant,
      [field]: ["species", "sun", "soil", "establishmentDate"].includes(field)
        ? value || null
        : value,
    }));
  };

  return (
    <section
      className="yard-workspace"
      aria-label="Yard map and plant inventory"
    >
      <div className="workspace-toolbar">
        <button
          type="button"
          onClick={() => {
            setPlacing(!placing);
            setDrawingGroup(false);
            setGroupPoints([]);
          }}
          aria-pressed={placing}
        >
          {placing ? "Cancel placement" : "Place plant"}
        </button>
        {selected &&
          (!drawingGroup ? (
            <button
              type="button"
              className="subtle-button"
              onClick={() => {
                setDrawingGroup(true);
                setPlacing(false);
                setGroupPoints([]);
              }}
            >
              Draw group area
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={finishGroupArea}
                disabled={groupPoints.length < 3}
              >
                Finish group area ({groupPoints.length})
              </button>
              <button
                type="button"
                className="subtle-button"
                onClick={() => {
                  setDrawingGroup(false);
                  setGroupPoints([]);
                }}
              >
                Cancel group area
              </button>
            </>
          ))}
        <button
          type="button"
          className="subtle-button"
          onClick={undo}
          disabled={past.length === 0}
        >
          Undo
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={redo}
          disabled={future.length === 0}
        >
          Redo
        </button>
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="subtle-button"
          onClick={() => changeZoom(zoom - 1)}
          aria-label="Zoom out"
        >
          −
        </button>
        <span>{zoom}×</span>
        <button
          type="button"
          className="subtle-button"
          onClick={() => changeZoom(zoom + 1)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(-1, 0)}
          aria-label="Pan north"
        >
          ←
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(1, 0)}
          aria-label="Pan south"
        >
          →
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(0, -1)}
          aria-label="Pan east"
        >
          ↑
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(0, 1)}
          aria-label="Pan west"
        >
          ↓
        </button>
      </div>
      <div className="layer-tools">
        <label>
          <input
            type="checkbox"
            checked={showBase}
            onChange={(event) => setShowBase(event.target.checked)}
          />{" "}
          Structures
        </label>
        <label>
          <input
            type="checkbox"
            checked={showPlants}
            onChange={(event) => setShowPlants(event.target.checked)}
          />{" "}
          Plants
        </label>
        <label>
          <input
            type="checkbox"
            checked={showZones}
            onChange={(event) => setShowZones(event.target.checked)}
          />{" "}
          Zones
        </label>
        <label>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />{" "}
          5 ft grid
        </label>
        <span>
          {placing
            ? "Tap or click the property to place a plant."
            : drawingGroup
              ? "Click at least three points around the counted group."
              : "Select a plant or drag its marker."}
        </span>
      </div>
      <div className="workspace-layout">
        <figure className="interactive-map">
          <svg
            ref={svgRef}
            viewBox={`${pan[0]} ${pan[1]} ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label="Interactive yard map"
            onClick={(event) => {
              if (placing) placePlant(svgPoint(event.clientX, event.clientY));
              else if (drawingGroup)
                setGroupPoints((points) => [
                  ...points,
                  svgPoint(event.clientX, event.clientY),
                ]);
            }}
            onPointerMove={(event) => {
              if (dragRef.current) {
                dragRef.current.point = svgPoint(event.clientX, event.clientY);
                setPreviewPoint(dragRef.current.point);
              }
            }}
            onPointerUp={endDrag}
            onPointerCancel={() => {
              dragRef.current = null;
              setPreviewPoint(null);
            }}
          >
            <rect x="0" y="0" width="40" height="120" fill="#d5e5b7" />
            {showBase && (
              <image
                href="/property-base.svg"
                x="0"
                y="0"
                width="40"
                height="120"
                pointerEvents="none"
              />
            )}
            {showZones && (
              <ZoneLayers zones={document.zones} idPrefix="plant-map" />
            )}
            {showGrid && (
              <g
                stroke="#658463"
                strokeOpacity=".45"
                strokeWidth=".08"
                pointerEvents="none"
              >
                {Array.from({ length: 9 }, (_, index) => (
                  <line
                    key={`x${index}`}
                    x1={index * 5}
                    y1="0"
                    x2={index * 5}
                    y2="120"
                  />
                ))}
                {Array.from({ length: 25 }, (_, index) => (
                  <line
                    key={`y${index}`}
                    x1="0"
                    y1={index * 5}
                    x2="40"
                    y2={index * 5}
                  />
                ))}
              </g>
            )}
            {showPlants &&
              document.plants.map((plant) => {
                const position =
                  dragRef.current?.id === plant.id && previewPoint
                    ? previewPoint
                    : plant.position;
                return (
                  <g
                    key={plant.id}
                    opacity={plant.status === "retired" ? 0.45 : 1}
                  >
                    {plant.group && (
                      <polygon
                        points={plant.group.area
                          .map(([x, y]) => `${x},${y}`)
                          .join(" ")}
                        fill="#3b8052"
                        fillOpacity=".18"
                        stroke="#3b8052"
                        strokeWidth=".18"
                      />
                    )}
                    <circle
                      cx={position[0]}
                      cy={position[1]}
                      r={selectedId === plant.id ? 1.1 : 0.8}
                      fill={plant.status === "planned" ? "#f1bb63" : "#266b48"}
                      stroke="white"
                      strokeWidth=".25"
                      onPointerDown={(event) => startDrag(event, plant)}
                      onClick={(event) => {
                        event.stopPropagation();
                        locate(plant);
                      }}
                    />
                    <text
                      x={position[0] + 1.1}
                      y={position[1] - 0.8}
                      fontSize="1.6"
                      fill="#1d3c29"
                      stroke="white"
                      strokeWidth=".3"
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {plant.label}
                    </text>
                  </g>
                );
              })}
            {groupPoints.length > 0 && (
              <polyline
                points={groupPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="#b64b2b"
                strokeWidth=".4"
              />
            )}
          </svg>
          <figcaption>
            North points left. Coordinates and approximate distances are in
            feet.
          </figcaption>
        </figure>
        <aside className="plant-panel">
          <h2>Plant inventory</h2>
          {(
            [
              ["Existing", active],
              ["Planned", planned],
              ["Retired", retired],
            ] as const
          ).map(([heading, plants]) => (
            <div key={heading} className="inventory-group">
              <h3>
                {heading} ({plants.length})
              </h3>
              {plants.length === 0 ? (
                <p>None yet</p>
              ) : (
                plants.map((plant) => (
                  <button
                    type="button"
                    key={plant.id}
                    className={
                      selectedId === plant.id
                        ? "inventory-item selected"
                        : "inventory-item"
                    }
                    onClick={() => locate(plant)}
                  >
                    {plant.label}{" "}
                    <span>{plant.species ?? "Unknown species"}</span>
                  </button>
                ))
              )}
            </div>
          ))}
          {selected && (
            <div className="plant-details">
              <h2>Plant details</h2>
              <p className="record-id">ID: {selected.id}</p>
              <p className="coverage-detail">
                Geometric coverage:{" "}
                {coveringZoneIds(selected.position, document.zones).join(
                  ", ",
                ) || "none mapped"}
                <br />
                Effective coverage:{" "}
                {effectiveZoneIds(selected, document.zones).join(", ") ||
                  "none mapped"}
              </p>
              <div className="plant-timing">
                <h3>Predicted watering</h3>
                <p>
                  {document.calculated.status}
                  {document.calculated.reason
                    ? ` · ${document.calculated.reason}`
                    : ""}
                </p>
                {selectedPeriod?.intervals.length ? (
                  <ol>
                    {selectedPeriod.intervals.map((interval) => (
                      <li key={interval.start}>
                        {interval.start} to {interval.end}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>
                    No calculable intervals for this plant in the reference
                    week.
                  </p>
                )}
                {selectedPeriod && (
                  <p>
                    Source station events:{" "}
                    {selectedPeriod.sourceEventIds.join(", ") || "none"}
                  </p>
                )}
              </div>
              {selected.manualCoverage && (
                <p className="coverage-detail">
                  Manual correction: {selected.manualCoverage.reason}
                </p>
              )}
              {coverageDraft?.plantId === selected.id ? (
                <div className="coverage-correction">
                  <h3>Correct mapped coverage</h3>
                  <p>
                    Select every zone reaching this anchor. This changes
                    membership only; it does not assert a shared hose.
                  </p>
                  {document.zones.map((zone) => (
                    <label key={zone.id} className="coverage-zone-choice">
                      <input
                        type="checkbox"
                        checked={coverageDraft.zoneIds.includes(zone.id)}
                        onChange={(event) =>
                          setCoverageDraft((draft) =>
                            draft
                              ? {
                                  ...draft,
                                  zoneIds: event.target.checked
                                    ? [...draft.zoneIds, zone.id]
                                    : draft.zoneIds.filter(
                                        (id) => id !== zone.id,
                                      ),
                                }
                              : null,
                          )
                        }
                      />{" "}
                      {zone.name}
                    </label>
                  ))}
                  <label>
                    Reason
                    <input
                      value={coverageDraft.reason}
                      onChange={(event) =>
                        setCoverageDraft((draft) =>
                          draft
                            ? { ...draft, reason: event.target.value }
                            : null,
                        )
                      }
                      placeholder="What did you observe?"
                    />
                  </label>
                  <div className="plant-actions">
                    <button
                      type="button"
                      disabled={!coverageDraft.reason.trim()}
                      onClick={() => {
                        updatePlant(selected.id, (plant) => ({
                          ...plant,
                          manualCoverage: {
                            zoneIds: coverageDraft.zoneIds,
                            reason: coverageDraft.reason.trim(),
                          },
                        }));
                        setCoverageDraft(null);
                      }}
                    >
                      Apply correction
                    </button>
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => setCoverageDraft(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="plant-actions coverage-actions">
                  <button
                    type="button"
                    className="subtle-button"
                    onClick={() =>
                      setCoverageDraft({
                        plantId: selected.id,
                        zoneIds: effectiveZoneIds(selected, document.zones),
                        reason: selected.manualCoverage?.reason ?? "",
                      })
                    }
                  >
                    Correct coverage
                  </button>
                  {selected.manualCoverage && (
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() =>
                        updatePlant(selected.id, (plant) => ({
                          ...plant,
                          manualCoverage: null,
                        }))
                      }
                    >
                      Clear correction
                    </button>
                  )}
                </div>
              )}
              <label>
                Label
                <input
                  value={selected.label}
                  onChange={(event) => setField("label", event.target.value)}
                />
              </label>
              <label>
                Species
                <input
                  value={selected.species ?? ""}
                  onChange={(event) => setField("species", event.target.value)}
                  placeholder="Unknown"
                />
              </label>
              <label>
                Status
                <select
                  value={selected.status}
                  onChange={(event) =>
                    updatePlant(selected.id, (plant) => ({
                      ...plant,
                      status: event.target.value as Plant["status"],
                    }))
                  }
                >
                  <option value="existing">Existing</option>
                  <option value="planned">Planned</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
              <label>
                Growing setting
                <select
                  value={selected.growingSetting.kind}
                  onChange={(event) =>
                    updatePlant(selected.id, (plant) => ({
                      ...plant,
                      growingSetting: {
                        ...plant.growingSetting,
                        kind: event.target
                          .value as Plant["growingSetting"]["kind"],
                      },
                    }))
                  }
                >
                  <option value="ground">Ground</option>
                  <option value="container">Container</option>
                  <option value="planting-pocket">Planting pocket</option>
                </select>
              </label>
              <label>
                Supporting surface
                <select
                  value={selected.growingSetting.surfaceId}
                  onChange={(event) =>
                    updatePlant(selected.id, (plant) => ({
                      ...plant,
                      growingSetting: {
                        ...plant.growingSetting,
                        surfaceId: event.target.value,
                      },
                    }))
                  }
                >
                  {document.property.surfaces.map((surface) => (
                    <option key={surface.id} value={surface.id}>
                      {surface.label}
                    </option>
                  ))}
                </select>
              </label>
              {selected.growingSetting.kind === "container" && (
                <div className="plant-field-grid">
                  <label>
                    Width (ft)
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={selected.growingSetting.containerWidthFeet ?? ""}
                      onChange={(event) =>
                        updatePlant(selected.id, (plant) => ({
                          ...plant,
                          growingSetting: {
                            ...plant.growingSetting,
                            containerWidthFeet:
                              Number(event.target.value) || null,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Depth (ft)
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={selected.growingSetting.containerDepthFeet ?? ""}
                      onChange={(event) =>
                        updatePlant(selected.id, (plant) => ({
                          ...plant,
                          growingSetting: {
                            ...plant.growingSetting,
                            containerDepthFeet:
                              Number(event.target.value) || null,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="full-width">
                    Drainage notes
                    <input
                      value={selected.growingSetting.drainageNotes ?? ""}
                      onChange={(event) =>
                        updatePlant(selected.id, (plant) => ({
                          ...plant,
                          growingSetting: {
                            ...plant.growingSetting,
                            drainageNotes: event.target.value || null,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              <div className="plant-field-grid">
                <label>
                  Sun
                  <input
                    value={selected.sun ?? ""}
                    onChange={(event) => setField("sun", event.target.value)}
                  />
                </label>
                <label>
                  Soil
                  <input
                    value={selected.soil ?? ""}
                    onChange={(event) => setField("soil", event.target.value)}
                  />
                </label>
              </div>
              <label>
                Established
                <input
                  type="date"
                  value={selected.establishmentDate ?? ""}
                  onChange={(event) =>
                    setField("establishmentDate", event.target.value)
                  }
                />
              </label>
              <label>
                Size
                <input
                  value={selected.sizeNotes}
                  onChange={(event) =>
                    setField("sizeNotes", event.target.value)
                  }
                />
              </label>
              <label>
                Group count
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={selected.group?.count ?? 1}
                  onChange={(event) => {
                    const count = Math.floor(Number(event.target.value));
                    updatePlant(selected.id, (plant) => {
                      const [x, y] = plant.position;
                      const area: Point[] = [
                        [clamp(x - 1, 0, 40), clamp(y - 1, 0, 120)],
                        [clamp(x + 1, 0, 40), clamp(y - 1, 0, 120)],
                        [clamp(x + 1, 0, 40), clamp(y + 1, 0, 120)],
                        [clamp(x - 1, 0, 40), clamp(y + 1, 0, 120)],
                      ];
                      return {
                        ...plant,
                        group:
                          count > 1
                            ? { count, area: plant.group?.area ?? area }
                            : null,
                      };
                    });
                  }}
                />
              </label>
              {selected.group && (
                <div className="group-details">
                  <p>
                    Group area: {selected.group.area.length} vertices. Draw a
                    new area on the map or adjust coordinates here.
                  </p>
                  {selected.group.area.map(([x, y], index) => (
                    <div key={index} className="plant-field-grid">
                      <label>
                        Vertex {index + 1} X
                        <input
                          type="number"
                          min="0"
                          max="40"
                          step="0.1"
                          value={x}
                          onChange={(event) =>
                            updatePlant(selected.id, (plant) => ({
                              ...plant,
                              group: plant.group
                                ? {
                                    ...plant.group,
                                    area: plant.group.area.map(
                                      (point, vertex) =>
                                        vertex === index
                                          ? clampPoint([
                                              Number(event.target.value),
                                              point[1],
                                            ])
                                          : point,
                                    ),
                                  }
                                : null,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Y
                        <input
                          type="number"
                          min="0"
                          max="120"
                          step="0.1"
                          value={y}
                          onChange={(event) =>
                            updatePlant(selected.id, (plant) => ({
                              ...plant,
                              group: plant.group
                                ? {
                                    ...plant.group,
                                    area: plant.group.area.map(
                                      (point, vertex) =>
                                        vertex === index
                                          ? clampPoint([
                                              point[0],
                                              Number(event.target.value),
                                            ])
                                          : point,
                                    ),
                                  }
                                : null,
                            }))
                          }
                        />
                      </label>
                    </div>
                  ))}
                  {groupCrossingZoneIds(selected, document.zones).length >
                    0 && (
                    <p className="group-warning">
                      This group crosses coverage from{" "}
                      {groupCrossingZoneIds(selected, document.zones).join(
                        ", ",
                      )}
                      . Split it or redraw the group area before using one
                      watering summary.
                    </p>
                  )}
                  {groupError && (
                    <p className="group-warning" role="alert">
                      {groupError}
                    </p>
                  )}
                  <button
                    type="button"
                    className="subtle-button"
                    onClick={splitGroup}
                  >
                    Split group
                  </button>
                </div>
              )}
              <label>
                Notes
                <textarea
                  rows={3}
                  value={selected.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                />
              </label>
              <p className="coordinates">
                Anchor: {selected.position[0]}, {selected.position[1]} ft
              </p>
              <div className="plant-actions">
                <button type="button" onClick={duplicate}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() =>
                    updatePlant(selected.id, (plant) => ({
                      ...plant,
                      status: "retired",
                    }))
                  }
                  disabled={selected.status === "retired"}
                >
                  Retire
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
