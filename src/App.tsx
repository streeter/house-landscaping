import { useEffect, useState, type ChangeEvent } from "react";
import { propertyBase } from "./property-base";
import { YardWorkspace } from "./components/YardWorkspace";
import { ZoneWorkspace } from "./components/ZoneWorkspace";
import { ControllerWorkspace } from "./components/ControllerWorkspace";
import { CareWorkspace } from "./components/CareWorkspace";
import {
  needsChecking,
  renderAdvicePrompt,
  renderYardSummary,
} from "./domain/advice";
import { renderAdviceMapPng } from "./domain/advice-map";
import {
  createFileSnapshot,
  downloadBlob,
  downloadText,
  editWorkingCopy,
  loadBrowserDraft,
  newWorkingCopy,
  openYardText,
  saveBrowserDraft,
  serializeYardFile,
  type WorkingCopy,
} from "./domain/files";

interface AdviceBundle {
  snapshot: WorkingCopy;
  summary: string;
  prompt: string;
  mapPng: Blob;
}

function initialDraft(): { copy: WorkingCopy | null; error: string | null } {
  try {
    return loadBrowserDraft(window.localStorage);
  } catch (error) {
    return { copy: null, error: `Browser draft unavailable: ${String(error)}` };
  }
}

function saveDraft(copy: WorkingCopy): string | null {
  try {
    return saveBrowserDraft(window.localStorage, copy);
  } catch (error) {
    return `Browser draft could not be saved: ${String(error)}`;
  }
}

export function App() {
  const [startup] = useState(initialDraft);
  const [copy, setCopy] = useState<WorkingCopy>(
    () => startup.copy ?? newWorkingCopy(),
  );
  const [ready, setReady] = useState(startup.copy === null);
  const [storageError, setStorageError] = useState<string | null>(
    startup.error,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [adviceBundle, setAdviceBundle] = useState<AdviceBundle | null>(null);
  const [generatingAdvice, setGeneratingAdvice] = useState(false);
  const [past, setPast] = useState<WorkingCopy["document"][]>([]);
  const [future, setFuture] = useState<WorkingCopy["document"][]>([]);

  useEffect(() => {
    if (ready) setStorageError(saveDraft(copy));
  }, [copy, ready]);

  const changeDocument = (next: WorkingCopy["document"]) => {
    setPast((items) => [...items, copy.document].slice(-50));
    setFuture([]);
    setCopy((previous) => editWorkingCopy(previous, () => next));
  };

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([copy.document, ...future]);
    setCopy((current) => editWorkingCopy(current, () => previous));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, copy.document]);
    setCopy((current) => editWorkingCopy(current, () => next));
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

  const editLocation = (
    field: "name" | "timezone" | "growingNotes",
    value: string,
  ) => {
    changeDocument({
      ...copy.document,
      location: {
        ...copy.document.location,
        [field]: field === "timezone" ? value || null : value,
      },
    });
  };

  const startNew = () => {
    if (
      copy.dirtySinceFile &&
      !window.confirm("Discard edits made since the last file save?")
    )
      return;
    setCopy(newWorkingCopy());
    setPast([]);
    setFuture([]);
    setReady(true);
    setFileError(null);
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      copy.dirtySinceFile &&
      !window.confirm(
        "Replace the working yard with this file? Unsaved edits will be lost.",
      )
    )
      return;
    try {
      const next = openYardText(await file.text(), file.name);
      setCopy(next);
      setPast([]);
      setFuture([]);
      setReady(true);
      setFileError(null);
    } catch (error) {
      setFileError(
        `Could not open file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const saveFile = (saveAs: boolean) => {
    const requestedName = saveAs
      ? window.prompt("Save yard file as", copy.filename)
      : copy.filename;
    if (requestedName === null) return;
    const filename = requestedName.trim().replace(/[\\/]/g, "") || "yard.json";
    try {
      const next = createFileSnapshot({
        ...copy,
        filename: filename.endsWith(".json") ? filename : `${filename}.json`,
      });
      downloadText(serializeYardFile(next), next.filename);
      setCopy(next);
      setFileError(null);
    } catch (error) {
      setFileError(
        `Could not save file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const generateAdvice = async () => {
    setGeneratingAdvice(true);
    setFileError(null);
    try {
      const snapshot = createFileSnapshot(copy);
      const mapPng = await renderAdviceMapPng(snapshot.document);
      setAdviceBundle({
        snapshot,
        summary: renderYardSummary(snapshot.document),
        prompt: renderAdvicePrompt(snapshot.document),
        mapPng,
      });
    } catch (error) {
      setFileError(
        `Could not prepare advice export: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setGeneratingAdvice(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">House landscape</p>
          <h1>Yard planner</h1>
          <p className="intro">Your property map and portable yard file.</p>
        </div>
        <p className="dimensions">40 × 120 ft · approximately 4,800 sq ft</p>
      </header>

      {!ready && startup.copy && (
        <section className="resume-panel" aria-label="Resume browser draft">
          <h2>Continue your yard?</h2>
          <p>
            A working copy was found in this browser. Resume it or open a saved
            file.
          </p>
          <button type="button" onClick={() => setReady(true)}>
            Resume browser draft
          </button>
          <button type="button" className="subtle-button" onClick={startNew}>
            Start a new yard
          </button>
        </section>
      )}

      <div className="file-bar" aria-label="Yard file actions">
        <label className="file-button">
          Open file
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Open yard JSON"
            onChange={(event) => {
              void openFile(event);
            }}
          />
        </label>
        <button type="button" onClick={() => saveFile(false)} disabled={!ready}>
          Save / Download
        </button>
        <button type="button" onClick={() => saveFile(true)} disabled={!ready}>
          Save As
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={undo}
          disabled={!ready || past.length === 0}
        >
          Undo
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={redo}
          disabled={!ready || future.length === 0}
        >
          Redo
        </button>
        <button
          type="button"
          onClick={() => void generateAdvice()}
          disabled={!ready || generatingAdvice}
        >
          {generatingAdvice ? "Preparing advice export…" : "Export for Advice"}
        </button>
        <button
          type="button"
          className="subtle-button"
          onClick={startNew}
          disabled={!ready}
        >
          New
        </button>
      </div>
      <div className="save-status" role="status">
        <span>
          {storageError ??
            (ready ? "Saved in this browser" : "Browser draft available")}
        </span>
        <span>
          {copy.dirtySinceFile
            ? "Changes since last file save"
            : `Saved/exported to ${copy.filename}`}
        </span>
      </div>
      {fileError && (
        <p className="error-message" role="alert">
          {fileError}
        </p>
      )}

      {ready && adviceBundle && (
        <section className="advice-export" aria-label="Advice export bundle">
          <h2>Advice export ready</h2>
          <p>
            Snapshot {adviceBundle.snapshot.document.exportId} ·{" "}
            {adviceBundle.snapshot.document.exportedAt}. Download each artifact
            and attach the JSON, summary, and map to your external advice
            request.
          </p>
          {copy.document.modifiedAt !==
            adviceBundle.snapshot.document.modifiedAt && (
            <p className="stale-note">
              This snapshot predates your latest edits. Generate a new one for
              current data.
            </p>
          )}
          <div className="file-bar">
            <button
              type="button"
              onClick={() => {
                downloadText(
                  serializeYardFile(adviceBundle.snapshot),
                  "yard.json",
                );
                if (
                  copy.document.modifiedAt ===
                  adviceBundle.snapshot.document.modifiedAt
                )
                  setCopy(adviceBundle.snapshot);
              }}
            >
              Download yard.json
            </button>
            <button
              type="button"
              onClick={() =>
                downloadText(
                  adviceBundle.summary,
                  "yard-summary.md",
                  "text/markdown",
                )
              }
            >
              Download yard-summary.md
            </button>
            <button
              type="button"
              onClick={() => downloadBlob(adviceBundle.mapPng, "yard-map.png")}
            >
              Download yard-map.png
            </button>
          </div>
          <label>
            Copyable advice prompt
            <textarea readOnly rows={5} value={adviceBundle.prompt} />
          </label>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(adviceBundle.prompt)
                .catch((error: unknown) =>
                  setFileError(`Could not copy prompt: ${String(error)}`),
                )
            }
          >
            Copy prompt
          </button>
        </section>
      )}

      {ready && (
        <>
          <YardWorkspace
            key={copy.document.id}
            document={copy.document}
            onChange={changeDocument}
          />
          <ZoneWorkspace
            key={`${copy.document.id}-zones`}
            document={copy.document}
            onChange={changeDocument}
          />
          <ControllerWorkspace
            key={`${copy.document.id}-controller`}
            document={copy.document}
            onChange={changeDocument}
          />
          <section className="needs-checking" aria-label="Needs checking">
            <h2>Needs checking</h2>
            <ul>
              {needsChecking(copy.document).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {needsChecking(copy.document).length === 0 && (
              <p>No outstanding checks identified.</p>
            )}
          </section>
          <CareWorkspace
            key={`${copy.document.id}-care`}
            document={copy.document}
            onChange={changeDocument}
          />
          <div className="property-section">
            <aside className="map-notes" aria-label="Property details">
              <h2>Property details</h2>
              <label>
                Location
                <input
                  value={copy.document.location.name}
                  onChange={(event) => editLocation("name", event.target.value)}
                  placeholder="City or address description"
                />
              </label>
              <label>
                Timezone
                <input
                  value={copy.document.location.timezone ?? ""}
                  onChange={(event) =>
                    editLocation("timezone", event.target.value)
                  }
                  placeholder="America/Los_Angeles"
                />
              </label>
              <label>
                Growing conditions
                <textarea
                  value={copy.document.location.growingNotes}
                  onChange={(event) =>
                    editLocation("growingNotes", event.target.value)
                  }
                  rows={4}
                  placeholder="Sun, soil, slope, and seasonal notes"
                />
              </label>
              <h2>Map orientation</h2>
              <dl>
                <div>
                  <dt>Top</dt>
                  <dd>East · backyard</dd>
                </div>
                <div>
                  <dt>Bottom</dt>
                  <dd>West · driveway</dd>
                </div>
                <div>
                  <dt>Left</dt>
                  <dd>North</dd>
                </div>
                <div>
                  <dt>Right</dt>
                  <dd>South</dd>
                </div>
              </dl>
              <p>{propertyBase.tracing.note}</p>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
