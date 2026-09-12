import { useEffect, useRef, useState, type PointerEvent } from "react";
import { inferSurfaceId } from "../domain/geometry";
import type { Plant, YardDocumentV1 } from "../domain/document";
import type { Point } from "../property-base";

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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [showBase, setShowBase] = useState(true);
  const [showPlants, setShowPlants] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const [past, setPast] = useState<YardDocumentV1[]>([]);
  const [future, setFuture] = useState<YardDocumentV1[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; point: Point } | null>(null);

  const viewWidth = 40 / zoom;
  const viewHeight = 120 / zoom;
  const selected =
    document.plants.find((plant) => plant.id === selectedId) ?? null;
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
    if (placing) return;
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

  return (
    <section
      className="yard-workspace"
      aria-label="Yard map and plant inventory"
    >
      <div className="workspace-toolbar">
        <button
          type="button"
          onClick={() => setPlacing(!placing)}
          aria-pressed={placing}
        >
          {placing ? "Cancel placement" : "Place plant"}
        </button>
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
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />{" "}
          5 ft grid
        </label>
        <span>
          {placing
            ? "Tap or click the property to place a plant."
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
              <h2>Selected plant</h2>
              <p className="record-id">ID: {selected.id}</p>
              <p>
                {selected.label} · {selected.growingSetting.surfaceId}
              </p>
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
