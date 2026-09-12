import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Point,
  PropertyBase,
  PropertySurface,
  SurfaceKind,
} from "../property-base";
import "./style.css";

const kinds: SurfaceKind[] = [
  "ground",
  "path",
  "patio",
  "driveway",
  "porch",
  "stairs",
  "building",
];
const colors: Record<SurfaceKind, string> = {
  ground: "#d5e5b7",
  path: "#d9dcd5",
  patio: "#d8d6cd",
  driveway: "#d4d8d7",
  porch: "#d3d0c3",
  stairs: "#c1c6bd",
  building: "#b89067",
};

function clampPoint([x, y]: Point): Point {
  return [
    Math.max(0, Math.min(40, Math.round(x * 10) / 10)),
    Math.max(0, Math.min(120, Math.round(y * 10) / 10)),
  ];
}

function imagePlacement(base: PropertyBase) {
  const [left, top, right, bottom] = base.tracing.calibratedImageBounds;
  const width = base.widthFeet / (right - left);
  const height = base.lengthFeet / (bottom - top);
  return {
    x: -left * width,
    y: -top * height,
    width: base.tracing.imageWidth * width,
    height: base.tracing.imageHeight * height,
  };
}

interface MapHistory {
  past: PropertyBase[];
  present: PropertyBase | null;
  future: PropertyBase[];
}

const historyLimit = 100;

function sameMap(a: PropertyBase, b: PropertyBase): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Editor() {
  const [history, setHistory] = useState<MapHistory>({
    past: [],
    present: null,
    future: [],
  });
  const [savedBase, setSavedBase] = useState<PropertyBase | null>(null);
  const base = history.present;
  const dirty = Boolean(base && savedBase && !sameMap(base, savedBase));
  const [selectedId, setSelectedId] = useState("residence");
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [drawing, setDrawing] = useState<Point[]>([]);
  const [draftFuture, setDraftFuture] = useState<Point[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Loading map…");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    surfaceId: string;
    vertex: number;
    startBase: PropertyBase;
  } | null>(null);

  const reload = async () => {
    const response = await fetch("/__map", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the repository map");
    const next = (await response.json()) as PropertyBase;
    setHistory({ past: [], present: next, future: [] });
    setSavedBase(next);
    setDrawing([]);
    setDraftFuture([]);
    setDrawMode(false);
    setStatus(`Map version ${next.version} loaded from repository`);
  };

  useEffect(() => {
    void reload().catch((error: unknown) => setStatus(String(error)));
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const selected =
    base?.surfaces.find((surface) => surface.id === selectedId) ?? null;

  useEffect(() => {
    if (!base) return;
    if (!selected) {
      setSelectedId("lawn");
      setSelectedVertex(null);
    } else if (
      selectedVertex !== null &&
      selectedVertex >= selected.points.length
    ) {
      setSelectedVertex(null);
    }
  }, [base, selected, selectedVertex]);

  const undo = () => {
    if (drawMode && drawing.length > 0) {
      setDrawing(drawing.slice(0, -1));
      setDraftFuture([drawing.at(-1)!, ...draftFuture]);
      setStatus("Drawing point removed");
      return;
    }
    if (history.past.length === 0 || !base) return;
    const previous = history.past.at(-1)!;
    setHistory({
      past: history.past.slice(0, -1),
      present: previous,
      future: [base, ...history.future],
    });
    setDrawing([]);
    setDraftFuture([]);
    setDrawMode(false);
    setStatus(
      savedBase && sameMap(previous, savedBase)
        ? "Map matches repository"
        : "Unsaved structural changes",
    );
  };

  const redo = () => {
    if (drawMode && draftFuture.length > 0) {
      setDrawing([...drawing, draftFuture[0]!]);
      setDraftFuture(draftFuture.slice(1));
      setStatus("Drawing point restored");
      return;
    }
    if (history.future.length === 0 || !base) return;
    const next = history.future[0]!;
    setHistory({
      past: [...history.past, base].slice(-historyLimit),
      present: next,
      future: history.future.slice(1),
    });
    setDrawing([]);
    setDraftFuture([]);
    setDrawMode(false);
    setStatus(
      savedBase && sameMap(next, savedBase)
        ? "Map matches repository"
        : "Unsaved structural changes",
    );
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (
        key === "z" &&
        !event.shiftKey &&
        (history.past.length > 0 || (drawMode && drawing.length > 0))
      ) {
        event.preventDefault();
        undo();
      } else if (
        ((key === "z" && event.shiftKey) ||
          (key === "y" && event.ctrlKey && !event.shiftKey)) &&
        (history.future.length > 0 || (drawMode && draftFuture.length > 0))
      ) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const mutate = (
    update: (current: PropertyBase) => PropertyBase,
    record = true,
  ) => {
    setHistory((current) => {
      if (!current.present) return current;
      const next = update(current.present);
      if (sameMap(next, current.present)) return current;
      return {
        past: record
          ? [...current.past, current.present].slice(-historyLimit)
          : current.past,
        present: next,
        future: record ? [] : current.future,
      };
    });
    setStatus("Unsaved structural changes");
  };

  const updateSurface = (
    surfaceId: string,
    update: (surface: PropertySurface) => PropertySurface,
    record = true,
  ) => {
    mutate(
      (current) => ({
        ...current,
        surfaces: current.surfaces.map((surface) =>
          surface.id === surfaceId ? update(surface) : surface,
        ),
      }),
      record,
    );
  };

  const updateVertex = (
    surfaceId: string,
    index: number,
    point: Point,
    record = true,
  ) => {
    updateSurface(
      surfaceId,
      (surface) => ({
        ...surface,
        points: surface.points.map((vertex, vertexIndex) =>
          vertexIndex === index ? clampPoint(point) : vertex,
        ),
      }),
      record,
    );
  };

  const svgPoint = (clientX: number, clientY: number): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    return clampPoint([point.x, point.y]);
  };

  const startDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    surfaceId: string,
    vertex: number,
  ) => {
    if (drawMode) return;
    event.stopPropagation();
    event.preventDefault();
    if (!base) return;
    dragRef.current = { surfaceId, vertex, startBase: base };
    setSelectedId(surfaceId);
    setSelectedVertex(vertex);
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    setHistory((current) => {
      if (!current.present || sameMap(current.present, drag.startBase))
        return current;
      return {
        ...current,
        past: [...current.past, drag.startBase].slice(-historyLimit),
        future: [],
      };
    });
  };

  const insertVertex = () => {
    if (!selected) return;
    const index = selectedVertex ?? selected.points.length - 1;
    const a = selected.points[index]!;
    const b = selected.points[(index + 1) % selected.points.length]!;
    const point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    updateSurface(selected.id, (surface) => ({
      ...surface,
      points: [
        ...surface.points.slice(0, index + 1),
        point,
        ...surface.points.slice(index + 1),
      ],
    }));
    setSelectedVertex(index + 1);
  };

  const deleteVertex = () => {
    if (!selected || selectedVertex === null || selected.points.length <= 3)
      return;
    updateSurface(selected.id, (surface) => ({
      ...surface,
      points: surface.points.filter((_, index) => index !== selectedVertex),
    }));
    setSelectedVertex(null);
  };

  const finishPolygon = () => {
    if (drawing.length < 3) {
      setStatus("Click at least three map points to create a polygon");
      return;
    }
    const id = `surface-${crypto.randomUUID().slice(0, 8)}`;
    mutate((current) => ({
      ...current,
      surfaces: [
        ...current.surfaces,
        {
          id,
          label: "New surface",
          kind: "path",
          approximate: true,
          points: drawing,
        },
      ],
    }));
    setSelectedId(id);
    setSelectedVertex(null);
    setDrawing([]);
    setDraftFuture([]);
    setDrawMode(false);
  };

  const removeSurface = () => {
    if (
      !selected ||
      selected.id === "lawn" ||
      !window.confirm(`Delete ${selected.label}?`)
    )
      return;
    mutate((current) => ({
      ...current,
      surfaces: current.surfaces.filter(
        (surface) => surface.id !== selected.id,
      ),
    }));
    setSelectedId("lawn");
    setSelectedVertex(null);
  };

  const save = async () => {
    if (!base) return;
    try {
      const response = await fetch("/__map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(base),
      });
      const result: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result === "object" && result !== null && "error" in result
            ? String(result.error)
            : "Save failed",
        );
      const saved = result as PropertyBase;
      setHistory({ past: [], present: saved, future: [] });
      setSavedBase(saved);
      setDrawing([]);
      setDraftFuture([]);
      setDrawMode(false);
      setStatus(
        `Saved map version ${saved.version} to data/property-base.json and public/property-base.svg`,
      );
    } catch (error) {
      setStatus(
        `Save failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const image = base ? imagePlacement(base) : null;

  return (
    <main className="editor-shell">
      <header>
        <div>
          <p className="eyebrow">Local maintenance tool</p>
          <h1>Property map editor</h1>
          <p>
            Adjust the fixed structural trace, then save a new map version
            directly into this repository.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary"
            onClick={undo}
            disabled={
              history.past.length === 0 && !(drawMode && drawing.length > 0)
            }
            title="Undo (⌘/Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary"
            onClick={redo}
            disabled={
              history.future.length === 0 &&
              !(drawMode && draftFuture.length > 0)
            }
            title="Redo (⌘/Ctrl+Shift+Z or Ctrl+Y)"
          >
            Redo
          </button>
          <button type="button" onClick={() => void save()} disabled={!dirty}>
            Save to repository
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void reload()}
            disabled={!base}
          >
            Discard / reload
          </button>
        </div>
      </header>
      <p className="status" role="status">
        {status}
      </p>
      <div className="editor-layout">
        <section className="canvas-panel" aria-label="Structural SVG editor">
          <div className="canvas-tools">
            <label>
              <input
                type="checkbox"
                checked={showReference}
                onChange={(event) => setShowReference(event.target.checked)}
              />{" "}
              Show tracing image
            </label>
            <label>
              Zoom{" "}
              <input
                type="range"
                min="1"
                max="3"
                step="0.25"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />{" "}
              {zoom}×
            </label>
            {!drawMode ? (
              <button
                type="button"
                onClick={() => {
                  setDrawMode(true);
                  setDrawing([]);
                  setDraftFuture([]);
                }}
              >
                Draw new surface
              </button>
            ) : (
              <>
                <button type="button" onClick={finishPolygon}>
                  Finish polygon ({drawing.length})
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setDrawMode(false);
                    setDrawing([]);
                    setDraftFuture([]);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
          <div className="canvas-scroll">
            {base && (
              <svg
                ref={svgRef}
                viewBox="0 0 40 120"
                width={350 * zoom}
                height={1050 * zoom}
                onPointerMove={(event) => {
                  if (dragRef.current)
                    updateVertex(
                      dragRef.current.surfaceId,
                      dragRef.current.vertex,
                      svgPoint(event.clientX, event.clientY),
                      false,
                    );
                }}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onClick={(event) => {
                  if (drawMode) {
                    setDrawing((points) => [
                      ...points,
                      svgPoint(event.clientX, event.clientY),
                    ]);
                    setDraftFuture([]);
                  }
                }}
                aria-label="Editable property map"
              >
                {showReference && image && (
                  <image
                    href="/data/property.jpg"
                    {...image}
                    preserveAspectRatio="none"
                    opacity="0.55"
                    pointerEvents="none"
                  />
                )}
                {base.surfaces.map((surface) => (
                  <g key={surface.id}>
                    <polygon
                      points={surface.points
                        .map(([x, y]) => `${x},${y}`)
                        .join(" ")}
                      fill={colors[surface.kind]}
                      fillOpacity={showReference ? 0.45 : 1}
                      stroke={surface.id === selectedId ? "#c94f2d" : "#657766"}
                      strokeWidth={surface.id === selectedId ? 0.45 : 0.16}
                      strokeDasharray={
                        surface.approximate ? ".6 .35" : undefined
                      }
                      onClick={(event) => {
                        if (!drawMode) {
                          event.stopPropagation();
                          setSelectedId(surface.id);
                          setSelectedVertex(null);
                        }
                      }}
                    />
                    {surface.id === selectedId &&
                      !drawMode &&
                      surface.points.map(([x, y], index) => (
                        <circle
                          key={index}
                          cx={x}
                          cy={y}
                          r={index === selectedVertex ? 0.8 : 0.58}
                          fill={index === selectedVertex ? "#c94f2d" : "#fff"}
                          stroke="#9d3e29"
                          strokeWidth=".2"
                          onPointerDown={(event) =>
                            startDrag(event, surface.id, index)
                          }
                        />
                      ))}
                  </g>
                ))}
                {drawing.length > 0 && (
                  <polyline
                    points={drawing.map(([x, y]) => `${x},${y}`).join(" ")}
                    fill="none"
                    stroke="#c94f2d"
                    strokeWidth=".4"
                  />
                )}
                <rect
                  x=".2"
                  y=".2"
                  width="39.6"
                  height="119.6"
                  fill="none"
                  stroke="#4e6951"
                  strokeWidth=".3"
                  strokeDasharray="1 .5"
                  pointerEvents="none"
                />
              </svg>
            )}
          </div>
          <p className="hint">
            Click a shape to select it. Drag its orange-outlined vertices, or
            click the canvas to add points while drawing. Coordinates are in
            feet; north is left.
          </p>
        </section>
        <aside className="properties-panel">
          <h2>Surfaces</h2>
          <label>
            Select surface
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSelectedVertex(null);
              }}
            >
              {base?.surfaces.map((surface) => (
                <option key={surface.id} value={surface.id}>
                  {surface.label} ({surface.id})
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <p className="surface-id">Stable ID: {selected.id}</p>
              <label>
                Label
                <input
                  value={selected.label}
                  onChange={(event) =>
                    updateSurface(selected.id, (surface) => ({
                      ...surface,
                      label: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Surface type
                <select
                  value={selected.kind}
                  onChange={(event) =>
                    updateSurface(selected.id, (surface) => ({
                      ...surface,
                      kind: event.target.value as SurfaceKind,
                    }))
                  }
                >
                  {kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={selected.approximate}
                  onChange={(event) =>
                    updateSurface(selected.id, (surface) => ({
                      ...surface,
                      approximate: event.target.checked,
                    }))
                  }
                />{" "}
                Edge is approximate
              </label>
              <h3>Vertices ({selected.points.length})</h3>
              <div className="vertex-list">
                {selected.points.map(([x, y], index) => (
                  <button
                    type="button"
                    key={index}
                    className={
                      selectedVertex === index
                        ? "active-vertex"
                        : "vertex-button"
                    }
                    onClick={() => setSelectedVertex(index)}
                  >
                    {index + 1}. {x}, {y} ft
                  </button>
                ))}
              </div>
              {selectedVertex !== null && (
                <div className="coordinate-fields">
                  <label>
                    X (south){" "}
                    <input
                      type="number"
                      min="0"
                      max="40"
                      step="0.1"
                      value={selected.points[selectedVertex]?.[0] ?? 0}
                      onChange={(event) =>
                        updateVertex(selected.id, selectedVertex, [
                          Number(event.target.value),
                          selected.points[selectedVertex]![1],
                        ])
                      }
                    />
                  </label>
                  <label>
                    Y (west){" "}
                    <input
                      type="number"
                      min="0"
                      max="120"
                      step="0.1"
                      value={selected.points[selectedVertex]?.[1] ?? 0}
                      onChange={(event) =>
                        updateVertex(selected.id, selectedVertex, [
                          selected.points[selectedVertex]![0],
                          Number(event.target.value),
                        ])
                      }
                    />
                  </label>
                </div>
              )}
              <div className="property-actions">
                <button type="button" onClick={insertVertex}>
                  Insert vertex
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={deleteVertex}
                  disabled={
                    selectedVertex === null || selected.points.length <= 3
                  }
                >
                  Delete vertex
                </button>
              </div>
              <button
                type="button"
                className="danger"
                onClick={removeSurface}
                disabled={selected.id === "lawn"}
              >
                Delete surface
              </button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

const root = document.getElementById("map-editor-root");
if (!root) throw new Error("Missing map editor root");
createRoot(root).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
