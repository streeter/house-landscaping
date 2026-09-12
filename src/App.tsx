import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { IncomingYard, ShareYard } from "./components/YardSharing";
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
  newWorkingCopy,
  openYardText,
  prepareMapUpgrade,
  serializeYardFile,
  type DraftRead,
  type MapUpgradePreview,
  type WorkingCopy,
} from "./domain/files";

import {
  loadLibrary,
  makeEntry,
  readEntry,
  saveLibrary,
  type YardLibrary,
} from "./domain/library";

interface AdviceBundle {
  snapshot: WorkingCopy;
  summary: string;
  prompt: string;
  mapPng: Blob;
}

export function App() {
  const session = useRef<ReturnType<typeof loadLibrary> | null>(null);
  session.current ??= loadLibrary({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  });
  const [library, setLibrary] = useState(session.current.library);
  const selected = library.entries.find(
    (entry) => entry.id === library.activeId,
  )!;
  const [startup, setStartup] = useState<DraftRead>(() => readEntry(selected));
  const [copy, setCopy] = useState<WorkingCopy>(
    () => startup.copy ?? newWorkingCopy(),
  );
  const currentSelection = useRef({ id: selected.id, copy });
  currentSelection.current = { id: selected.id, copy };
  const [ready, setReady] = useState(
    session.current.fresh ||
      (startup.copy === null &&
        startup.upgrade === null &&
        startup.unreadableRaw === null),
  );
  const [storageError, setStorageError] = useState<string | null>(
    session.current.error ?? startup.error,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingUpgrade, setPendingUpgrade] =
    useState<MapUpgradePreview | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [adviceBundle, setAdviceBundle] = useState<AdviceBundle | null>(null);
  const [generatingAdvice, setGeneratingAdvice] = useState(false);
  const [past, setPast] = useState<WorkingCopy["document"][]>([]);
  const [future, setFuture] = useState<WorkingCopy["document"][]>([]);
  const activeUpgrade = pendingUpgrade ?? (!ready ? startup.upgrade : null);

  const commitLibrary = (next: YardLibrary): boolean => {
    try {
      saveLibrary(window.localStorage, session.current!, next);
      setLibrary(next);
      setStorageError(null);
      return true;
    } catch (error) {
      setStorageError(
        `Browser configurations could not be saved: ${String(error)}`,
      );
      return false;
    }
  };

  const persistCurrent = (): boolean => {
    if (!ready) return true;
    const current = session.current!.library;
    return commitLibrary({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === selected.id
          ? { ...entry, raw: JSON.stringify(copy) }
          : entry,
      ),
    });
  };

  useEffect(() => {
    if (ready) {
      const current = session.current!.library;
      try {
        const next = {
          ...current,
          entries: current.entries.map((entry) =>
            entry.id === library.activeId
              ? { ...entry, raw: JSON.stringify(copy) }
              : entry,
          ),
        };
        saveLibrary(window.localStorage, session.current!, next);
        setLibrary(next);
        setStorageError(null);
      } catch (error) {
        setStorageError(
          `Browser configurations could not be saved: ${String(error)}`,
        );
      }
    }
  }, [copy, ready, library.activeId]);

  const clearWorkspace = () => {
    setPast([]);
    setFuture([]);
    setAdviceBundle(null);
    setPendingUpgrade(null);
    setUpgradeNotice(null);
    setFileError(null);
  };

  const selectConfiguration = (id: string) => {
    if (!persistCurrent()) return;
    const current = session.current!.library;
    const entry = current.entries.find((item) => item.id === id)!;
    if (!commitLibrary({ ...current, activeId: id })) return;
    const draft = readEntry(entry);
    setStartup(draft);
    setCopy(draft.copy ?? newWorkingCopy());
    setReady(draft.copy !== null);
    setStorageError(draft.error);
    clearWorkspace();
  };

  const renameConfiguration = () => {
    const name = window.prompt("Configuration name", selected.name)?.trim();
    if (!name) return;
    if (name.length > 100) {
      setFileError("Use a configuration name of 100 characters or fewer.");
      return;
    }
    if (!persistCurrent()) return;
    const current = session.current!.library;
    commitLibrary({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === selected.id ? { ...entry, name } : entry,
      ),
    });
  };

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

  const addConfiguration = (name: string, next: WorkingCopy): boolean => {
    if (!persistCurrent()) return false;
    const entry = makeEntry(name, next);
    const current = session.current!.library;
    if (
      !commitLibrary({
        ...current,
        activeId: entry.id,
        entries: [...current.entries, entry],
      })
    )
      return false;
    setCopy(next);
    setReady(true);
    clearWorkspace();
    return true;
  };

  const startNew = () => {
    const name = window.prompt("New configuration name", "New yard")?.trim();
    if (!name) return;
    if (name.length > 100) {
      setFileError("Use a configuration name of 100 characters or fewer.");
      return;
    }
    const next = newWorkingCopy();
    next.filename = `${name.replace(/[\\/]/g, "")}.json`;
    addConfiguration(name, next);
  };

  const acceptUpgrade = (upgrade: MapUpgradePreview) => {
    if (
      pendingUpgrade &&
      !window.confirm(
        `Replace configuration “${selected.name}” with the updated yard?`,
      )
    )
      return;
    setAdviceBundle(null);
    setCopy(upgrade.copy);
    setPast([]);
    setFuture([]);
    setReady(true);
    setPendingUpgrade(null);
    setFileError(null);
    setUpgradeNotice(
      upgrade.plantsToReview.length > 0
        ? `Review supporting surfaces for: ${upgrade.plantsToReview.join(", ")}.`
        : null,
    );
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (
        currentSelection.current.id !== selected.id ||
        currentSelection.current.copy !== copy
      ) {
        setFileError(
          "The selected yard changed while the file was loading. Upload it again to replace this configuration.",
        );
        return;
      }
      let next: WorkingCopy;
      try {
        next = openYardText(text, file.name);
      } catch (error) {
        const upgrade = prepareMapUpgrade(
          JSON.parse(text) as unknown,
          file.name,
        );
        if (!upgrade) throw error;
        setPendingUpgrade(upgrade);
        setFileError(null);
        return;
      }
      if (
        !window.confirm(
          `Replace configuration “${selected.name}” with ${file.name}? Its current contents will be replaced.`,
        )
      )
        return;
      setAdviceBundle(null);
      setCopy(next);
      setPast([]);
      setFuture([]);
      setReady(true);
      setPendingUpgrade(null);
      setUpgradeNotice(null);
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

      <IncomingYard onImport={addConfiguration} />

      {!ready && startup.copy && !pendingUpgrade && (
        <section className="resume-panel" aria-label="Resume browser draft">
          <h2>Continue your yard?</h2>
          <p>
            Resume “{selected.name}”, choose another configuration, or create a
            new yard.
          </p>
          <button type="button" onClick={() => setReady(true)}>
            Resume browser draft
          </button>
          <button type="button" className="subtle-button" onClick={startNew}>
            Start a new yard
          </button>
        </section>
      )}

      {!ready && startup.unreadableRaw !== null && !pendingUpgrade && (
        <section className="resume-panel" aria-label="Unopened browser draft">
          <h2>Browser draft needs attention</h2>
          <p>
            This browser has a yard draft that cannot be opened with the current
            map. Download a backup before starting a new yard, or open a saved
            file. Creating a new configuration keeps this draft available.
          </p>
          <button
            type="button"
            onClick={() =>
              downloadText(
                startup.unreadableRaw!,
                "yard-browser-draft-backup.json",
              )
            }
          >
            Download draft backup
          </button>
          <button type="button" className="subtle-button" onClick={startNew}>
            Start a new yard
          </button>
        </section>
      )}

      {session.current.backup && (
        <section className="resume-panel" aria-label="Configuration recovery">
          <p>
            The saved configuration library could not be read. Download a backup
            to recover it. Your in-memory yard can still be downloaded.
          </p>
          <button
            type="button"
            onClick={() =>
              downloadText(
                session.current!.backup!,
                "yard-configurations-backup.json",
              )
            }
          >
            Download configurations backup
          </button>
        </section>
      )}
      <div className="file-bar" aria-label="Yard configurations">
        <label>
          Configuration{" "}
          <select
            aria-label="Yard configuration"
            value={selected.id}
            onChange={(event) => selectConfiguration(event.target.value)}
          >
            {library.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="subtle-button"
          onClick={renameConfiguration}
        >
          Rename
        </button>
        <span>Uploads replace the selected configuration.</span>
      </div>
      <div className="file-bar" aria-label="Yard file actions">
        <label className="file-button">
          Upload / Replace
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
      {ready && (
        <ShareYard key={selected.id} copy={copy} name={selected.name} />
      )}
      {fileError && (
        <p className="error-message" role="alert">
          {fileError}
        </p>
      )}
      {upgradeNotice && <p role="status">{upgradeNotice}</p>}

      {activeUpgrade && (
        <section className="resume-panel" aria-label="Update property map">
          <h2>Update this yard to the current map?</h2>
          <p>
            This yard uses map version {activeUpgrade.previousVersion}. The
            current map adds {activeUpgrade.addedSurfaceLabels.join(", ")}.
            Existing plants, zones, and care records will be kept. Save a new
            yard file after updating.
          </p>
          {activeUpgrade.plantsToReview.length > 0 && (
            <p>
              Check supporting surfaces for:{" "}
              {activeUpgrade.plantsToReview.join(", ")}.
            </p>
          )}
          <button type="button" onClick={() => acceptUpgrade(activeUpgrade)}>
            Update map and open yard
          </button>
          <button
            type="button"
            className="subtle-button"
            onClick={() =>
              pendingUpgrade ? setPendingUpgrade(null) : startNew()
            }
          >
            {pendingUpgrade ? "Cancel" : "Start a new yard"}
          </button>
        </section>
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
            key={`${selected.id}-${copy.document.id}`}
            document={copy.document}
            onChange={changeDocument}
          />
          <ZoneWorkspace
            key={`${selected.id}-${copy.document.id}-zones`}
            document={copy.document}
            onChange={changeDocument}
          />
          <ControllerWorkspace
            key={`${selected.id}-${copy.document.id}-controller`}
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
            key={`${selected.id}-${copy.document.id}-care`}
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
