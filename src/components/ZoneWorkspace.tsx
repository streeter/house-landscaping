import { useRef, useState, type PointerEvent } from "react";
import { coveringZoneIds, revalidateOverlapNotes } from "../domain/geometry";
import { unionIntervals } from "../domain/timing";
import type { OverlapNote, YardDocumentV1, Zone } from "../domain/document";
import type { Point } from "../property-base";
import { ZoneLayers } from "./ZoneLayers";

interface Props {
  document: YardDocumentV1;
  onChange: (next: YardDocumentV1) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const roundPoint = ([x, y]: Point): Point => [
  Math.round(clamp(x, 0, 40) * 10) / 10,
  Math.round(clamp(y, 0, 120) * 10) / 10,
];
const pointString = (polygon: Point[]) =>
  polygon.map(([x, y]) => `${x},${y}`).join(" ");
const area = (polygon: Point[]) =>
  Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2,
  );

export function ZoneWorkspace({ document, onChange }: Props) {
  const [selectedZoneId, setSelectedZoneId] = useState(
    document.zones[0]?.id ?? "",
  );
  const [pieceIndex, setPieceIndex] = useState(0);
  const [vertexIndex, setVertexIndex] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [inspectionPoint, setInspectionPoint] = useState<Point | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draftRelationship, setDraftRelationship] = useState<
    OverlapNote["relationship"] | ""
  >("");
  const [draftNoteText, setDraftNoteText] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    zoneId: string;
    piece: number;
    vertex: number;
    point: Point;
  } | null>(null);
  const selected =
    document.zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const selectedPiece = selected?.polygons[pieceIndex] ?? null;
  const viewWidth = 40 / zoom;
  const viewHeight = 120 / zoom;

  const commitZones = (zones: Zone[]) =>
    onChange({
      ...document,
      zones,
      overlapNotes: revalidateOverlapNotes(document.overlapNotes, zones),
    });
  const updateZone = (id: string, update: (zone: Zone) => Zone) =>
    commitZones(
      document.zones.map((zone) => (zone.id === id ? update(zone) : zone)),
    );
  const updatePiece = (
    id: string,
    index: number,
    update: (points: Point[]) => Point[],
  ) =>
    updateZone(id, (zone) => ({
      ...zone,
      polygons: zone.polygons.map((polygon, piece) =>
        piece === index ? update(polygon) : polygon,
      ),
    }));

  const svgPoint = (clientX: number, clientY: number): Point => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    return roundPoint([point.x, point.y]);
  };

  const startDrag = (
    event: PointerEvent<SVGCircleElement>,
    zoneId: string,
    piece: number,
    vertex: number,
    point: Point,
  ) => {
    if (drawing) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { zoneId, piece, vertex, point };
    setSelectedZoneId(zoneId);
    setPieceIndex(piece);
    setVertexIndex(vertex);
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPreviewPoint(null);
    if (!drag) return;
    const current = document.zones.find((zone) => zone.id === drag.zoneId)
      ?.polygons[drag.piece]?.[drag.vertex];
    if (
      !current ||
      (current[0] === drag.point[0] && current[1] === drag.point[1])
    )
      return;
    updatePiece(drag.zoneId, drag.piece, (points) =>
      points.map((point, index) =>
        index === drag.vertex ? drag.point : point,
      ),
    );
  };

  const finishPiece = () => {
    if (!selected || draftPoints.length < 3) return;
    updateZone(selected.id, (zone) => ({
      ...zone,
      polygons: [...zone.polygons, draftPoints],
    }));
    setPieceIndex(selected.polygons.length);
    setVertexIndex(null);
    setDraftPoints([]);
    setDrawing(false);
  };

  const insertVertex = () => {
    if (!selected || !selectedPiece) return;
    const index = vertexIndex ?? selectedPiece.length - 1;
    const a = selectedPiece[index]!;
    const b = selectedPiece[(index + 1) % selectedPiece.length]!;
    const point = roundPoint([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    updatePiece(selected.id, pieceIndex, (points) => [
      ...points.slice(0, index + 1),
      point,
      ...points.slice(index + 1),
    ]);
    setVertexIndex(index + 1);
  };

  const deleteVertex = () => {
    if (
      !selected ||
      !selectedPiece ||
      vertexIndex === null ||
      selectedPiece.length <= 3
    )
      return;
    updatePiece(selected.id, pieceIndex, (points) =>
      points.filter((_, index) => index !== vertexIndex),
    );
    setVertexIndex(null);
  };

  const deletePiece = () => {
    if (
      !selected ||
      !selectedPiece ||
      !window.confirm(`Delete this coverage piece from ${selected.name}?`)
    )
      return;
    updateZone(selected.id, (zone) => ({
      ...zone,
      polygons: zone.polygons.filter((_, index) => index !== pieceIndex),
    }));
    setPieceIndex(0);
    setVertexIndex(null);
  };

  const changeZoom = (next: number) => {
    const value = clamp(next, 1, 4);
    const center: Point = [pan[0] + viewWidth / 2, pan[1] + viewHeight / 2];
    setZoom(value);
    setPan([
      clamp(center[0] - 20 / value, 0, 40 - 40 / value),
      clamp(center[1] - 60 / value, 0, 120 - 120 / value),
    ]);
  };

  const moveView = (x: number, y: number) =>
    setPan(([oldX, oldY]) => [
      clamp(oldX + x * viewWidth * 0.25, 0, 40 - viewWidth),
      clamp(oldY + y * viewHeight * 0.25, 0, 120 - viewHeight),
    ]);

  const covering = inspectionPoint
    ? coveringZoneIds(inspectionPoint, document.zones)
    : [];
  const coveringEvents = document.calculated.stationEvents.filter((event) =>
    covering.includes(event.zoneId),
  );
  const elapsedAtPoint = unionIntervals(
    coveringEvents.map(({ start, end }) => ({ start, end })),
  );
  const selectedNote =
    document.overlapNotes.find((note) => note.id === selectedNoteId) ?? null;

  const addNote = () => {
    if (!inspectionPoint || covering.length < 2 || !draftRelationship) return;
    const note: OverlapNote = {
      id: crypto.randomUUID(),
      point: inspectionPoint,
      zoneIds: covering,
      relationship: draftRelationship,
      notes: draftNoteText,
      stale: false,
    };
    onChange({ ...document, overlapNotes: [...document.overlapNotes, note] });
    setSelectedNoteId(note.id);
    setDraftRelationship("");
    setDraftNoteText("");
  };

  const updateNote = (id: string, update: (note: OverlapNote) => OverlapNote) =>
    onChange({
      ...document,
      overlapNotes: document.overlapNotes.map((note) =>
        note.id === id ? update(note) : note,
      ),
    });

  return (
    <section className="zone-workspace" aria-label="Irrigation zone editor">
      <h2>Irrigation coverage</h2>
      <p>
        Draw one or more polygons for each of the eight yard zones. Colored
        borders identify zones; hatching marks intersections.
      </p>
      <div className="workspace-toolbar">
        {!drawing ? (
          <button
            type="button"
            onClick={() => {
              setDrawing(true);
              setDraftPoints([]);
            }}
          >
            Draw coverage piece
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={finishPiece}
              disabled={draftPoints.length < 3}
            >
              Finish polygon ({draftPoints.length})
            </button>
            <button
              type="button"
              className="subtle-button"
              onClick={() => {
                setDrawing(false);
                setDraftPoints([]);
              }}
            >
              Cancel drawing
            </button>
          </>
        )}
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="subtle-button"
          onClick={() => changeZoom(zoom - 1)}
          aria-label="Zone map zoom out"
        >
          −
        </button>
        <span>{zoom}×</span>
        <button
          type="button"
          className="subtle-button"
          onClick={() => changeZoom(zoom + 1)}
          aria-label="Zone map zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(-1, 0)}
          aria-label="Zone map pan north"
        >
          ←
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(1, 0)}
          aria-label="Zone map pan south"
        >
          →
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(0, -1)}
          aria-label="Zone map pan east"
        >
          ↑
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={() => moveView(0, 1)}
          aria-label="Zone map pan west"
        >
          ↓
        </button>
      </div>
      <div className="workspace-layout">
        <figure className="interactive-map zone-map">
          <svg
            ref={svgRef}
            role="img"
            aria-label="Editable irrigation zone map"
            viewBox={`${pan[0]} ${pan[1]} ${viewWidth} ${viewHeight}`}
            onClick={(event) => {
              const point = svgPoint(event.clientX, event.clientY);
              if (drawing) setDraftPoints((points) => [...points, point]);
              else setInspectionPoint(point);
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
            <image
              href="/property-base.svg"
              x="0"
              y="0"
              width="40"
              height="120"
              pointerEvents="none"
            />
            <ZoneLayers zones={document.zones} idPrefix="zone-editor" />
            {document.zones.flatMap((zone) =>
              zone.polygons.map((polygon, index) => (
                <polygon
                  key={`${zone.id}-${index}`}
                  points={pointString(polygon)}
                  fill="transparent"
                  stroke={
                    zone.id === selectedZoneId && index === pieceIndex
                      ? "#c34b2b"
                      : "transparent"
                  }
                  strokeWidth=".5"
                  onClick={(event) => {
                    if (!drawing) {
                      event.stopPropagation();
                      setSelectedZoneId(zone.id);
                      setPieceIndex(index);
                      setVertexIndex(null);
                      setInspectionPoint(
                        svgPoint(event.clientX, event.clientY),
                      );
                    }
                  }}
                />
              )),
            )}
            {selectedPiece &&
              !drawing &&
              selectedPiece.map((point, index) => {
                const position =
                  dragRef.current?.zoneId === selectedZoneId &&
                  dragRef.current.piece === pieceIndex &&
                  dragRef.current.vertex === index &&
                  previewPoint
                    ? previewPoint
                    : point;
                return (
                  <circle
                    key={index}
                    cx={position[0]}
                    cy={position[1]}
                    r={vertexIndex === index ? 0.8 : 0.58}
                    fill="white"
                    stroke="#b9442b"
                    strokeWidth=".22"
                    onPointerDown={(event) =>
                      startDrag(event, selectedZoneId, pieceIndex, index, point)
                    }
                  />
                );
              })}
            {draftPoints.length > 0 && (
              <polyline
                points={pointString(draftPoints)}
                fill="none"
                stroke="#c34b2b"
                strokeWidth=".4"
              />
            )}
            {document.overlapNotes.map((note) => (
              <g
                key={note.id}
                onClick={(event) => {
                  if (drawing) return;
                  event.stopPropagation();
                  setSelectedNoteId(note.id);
                  setInspectionPoint(note.point);
                }}
              >
                <circle
                  cx={note.point[0]}
                  cy={note.point[1]}
                  r=".85"
                  fill={note.stale ? "#b44c3d" : "#263f31"}
                  stroke="white"
                  strokeWidth=".2"
                />
                <text
                  x={note.point[0]}
                  y={note.point[1] + 0.35}
                  textAnchor="middle"
                  fontSize="1"
                  fill="white"
                  pointerEvents="none"
                >
                  i
                </text>
                <title>
                  {note.relationship === "shared-hose"
                    ? "Shared hose"
                    : "Independent sources"}
                  {note.stale ? " (needs checking)" : ""}
                </title>
              </g>
            ))}
          </svg>
          <figcaption>
            Click to inspect coverage; drag a selected polygon’s vertices to
            reshape it.
          </figcaption>
        </figure>
        <aside className="zone-panel">
          <label>
            Zone
            <select
              value={selectedZoneId}
              onChange={(event) => {
                setSelectedZoneId(event.target.value);
                setPieceIndex(0);
                setVertexIndex(null);
              }}
            >
              {document.zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <p className="record-id">Stable ID: {selected.id}</p>
              <label>
                Name
                <input
                  value={selected.name}
                  onChange={(event) =>
                    updateZone(selected.id, (zone) => ({
                      ...zone,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={selected.color}
                  onChange={(event) =>
                    updateZone(selected.id, (zone) => ({
                      ...zone,
                      color: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Controller station
                <select
                  value={selected.stationNumber ?? ""}
                  onChange={(event) =>
                    updateZone(selected.id, (zone) => ({
                      ...zone,
                      stationNumber: event.target.value
                        ? Number(event.target.value)
                        : null,
                    }))
                  }
                >
                  <option value="">Unmapped</option>
                  {Array.from({ length: 9 }, (_, index) => index + 1)
                    .filter(
                      (station) =>
                        station === selected.stationNumber ||
                        !document.zones.some(
                          (zone) =>
                            zone.id !== selected.id &&
                            zone.stationNumber === station,
                        ),
                    )
                    .map((station) => (
                      <option key={station} value={station}>
                        Station {station}
                      </option>
                    ))}
                </select>
              </label>
              <h3>Coverage pieces ({selected.polygons.length})</h3>
              <div className="piece-list">
                {selected.polygons.map((polygon, index) => (
                  <button
                    type="button"
                    key={index}
                    className={
                      index === pieceIndex ? "active-piece" : "subtle-button"
                    }
                    onClick={() => {
                      setPieceIndex(index);
                      setVertexIndex(null);
                    }}
                  >
                    Piece {index + 1} · ~{area(polygon).toFixed(1)} sq ft
                  </button>
                ))}
              </div>
              {selectedPiece && (
                <>
                  <h3>Vertices</h3>
                  <div className="vertex-list">
                    {selectedPiece.map(([x, y], index) => (
                      <button
                        type="button"
                        key={index}
                        className={
                          index === vertexIndex
                            ? "active-piece"
                            : "subtle-button"
                        }
                        onClick={() => setVertexIndex(index)}
                      >
                        {index + 1}. {x}, {y}
                      </button>
                    ))}
                  </div>
                  {vertexIndex !== null && (
                    <div className="plant-field-grid">
                      <label>
                        X (south)
                        <input
                          type="number"
                          min="0"
                          max="40"
                          step="0.1"
                          value={selectedPiece[vertexIndex]?.[0] ?? 0}
                          onChange={(event) =>
                            updatePiece(selected.id, pieceIndex, (points) =>
                              points.map((point, index) =>
                                index === vertexIndex
                                  ? roundPoint([
                                      Number(event.target.value),
                                      point[1],
                                    ])
                                  : point,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Y (west)
                        <input
                          type="number"
                          min="0"
                          max="120"
                          step="0.1"
                          value={selectedPiece[vertexIndex]?.[1] ?? 0}
                          onChange={(event) =>
                            updatePiece(selected.id, pieceIndex, (points) =>
                              points.map((point, index) =>
                                index === vertexIndex
                                  ? roundPoint([
                                      point[0],
                                      Number(event.target.value),
                                    ])
                                  : point,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                  )}
                  <div className="zone-actions">
                    <button type="button" onClick={insertVertex}>
                      Insert vertex
                    </button>
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={deleteVertex}
                      disabled={
                        vertexIndex === null || selectedPiece.length <= 3
                      }
                    >
                      Delete vertex
                    </button>
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={deletePiece}
                    >
                      Delete piece
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <div className="coverage-inspection">
            <h3>At selected point</h3>
            {inspectionPoint ? (
              <>
                <p>
                  {inspectionPoint[0]}, {inspectionPoint[1]} ft:{" "}
                  {covering.length
                    ? covering
                        .map(
                          (id) =>
                            document.zones.find((zone) => zone.id === id)
                              ?.name ?? id,
                        )
                        .join(", ")
                    : "No mapped automatic coverage"}
                </p>
                <h4>Predicted elapsed watering</h4>
                <p>
                  {document.calculated.status}
                  {document.calculated.reason
                    ? ` · ${document.calculated.reason}`
                    : ""}
                </p>
                {elapsedAtPoint.length ? (
                  <ol>
                    {elapsedAtPoint.map((interval) => (
                      <li key={interval.start}>
                        {interval.start} to {interval.end}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>
                    No calculable intervals for this point in the reference
                    week.
                  </p>
                )}
                <details>
                  <summary>
                    Source station events ({coveringEvents.length})
                  </summary>
                  <ol>
                    {coveringEvents.map((event) => (
                      <li key={event.id}>
                        {event.zoneId} · program {event.programId}, station{" "}
                        {event.stationNumber}: {event.start} to {event.end}
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            ) : (
              <p>Click the map to inspect all covering zones.</p>
            )}
            {inspectionPoint && covering.length >= 2 && (
              <div className="source-note-form">
                <h4>Record sources in this overlap</h4>
                <label>
                  Relationship
                  <select
                    value={draftRelationship}
                    onChange={(event) =>
                      setDraftRelationship(
                        event.target.value as OverlapNote["relationship"] | "",
                      )
                    }
                  >
                    <option value="">Choose what you observed</option>
                    <option value="shared-hose">
                      Zones activate the same hose
                    </option>
                    <option value="independent-sources">
                      Independent watering sources
                    </option>
                  </select>
                </label>
                <label>
                  Context
                  <textarea
                    rows={2}
                    value={draftNoteText}
                    onChange={(event) => setDraftNoteText(event.target.value)}
                    placeholder="Optional location or hose detail"
                  />
                </label>
                <button
                  type="button"
                  onClick={addNote}
                  disabled={!draftRelationship}
                >
                  Add source note here
                </button>
              </div>
            )}
          </div>
          {document.overlapNotes.length > 0 && (
            <div className="saved-source-notes">
              <h3>Source notes</h3>
              {document.overlapNotes.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  className={
                    selectedNoteId === note.id
                      ? "selected-source-note"
                      : "subtle-button"
                  }
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setInspectionPoint(note.point);
                  }}
                >
                  {note.relationship === "shared-hose"
                    ? "Shared hose"
                    : "Independent sources"}{" "}
                  · {note.point.join(", ")} ft
                  {note.stale ? " · needs checking" : ""}
                </button>
              ))}
              {selectedNote && (
                <div className="source-note-details">
                  {selectedNote.stale && (
                    <p className="stale-note">
                      Coverage changed here. Check this note before relying on
                      it.
                    </p>
                  )}
                  <p>Zones: {selectedNote.zoneIds.join(", ")}</p>
                  <label>
                    Relationship
                    <select
                      value={selectedNote.relationship}
                      onChange={(event) =>
                        updateNote(selectedNote.id, (note) => ({
                          ...note,
                          relationship: event.target
                            .value as OverlapNote["relationship"],
                        }))
                      }
                    >
                      <option value="shared-hose">
                        Zones activate the same hose
                      </option>
                      <option value="independent-sources">
                        Independent watering sources
                      </option>
                    </select>
                  </label>
                  <label>
                    Context
                    <textarea
                      rows={2}
                      value={selectedNote.notes}
                      onChange={(event) =>
                        updateNote(selectedNote.id, (note) => ({
                          ...note,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="zone-actions">
                    <button
                      type="button"
                      className="subtle-button"
                      disabled={!inspectionPoint || covering.length < 2}
                      onClick={() => {
                        if (!inspectionPoint || covering.length < 2) return;
                        updateNote(selectedNote.id, (note) => ({
                          ...note,
                          point: inspectionPoint,
                          zoneIds: covering,
                          stale: false,
                        }));
                      }}
                    >
                      Re-anchor here
                    </button>
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => {
                        if (window.confirm("Remove this source note?")) {
                          onChange({
                            ...document,
                            overlapNotes: document.overlapNotes.filter(
                              (note) => note.id !== selectedNote.id,
                            ),
                          });
                          setSelectedNoteId(null);
                        }
                      }}
                    >
                      Remove note
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
