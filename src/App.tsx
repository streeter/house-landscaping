import { useEffect, useState, type ChangeEvent } from "react";
import { propertyBase } from "./property-base";
import { YardWorkspace } from "./components/YardWorkspace";
import { ZoneWorkspace } from "./components/ZoneWorkspace";
import { ControllerWorkspace } from "./components/ControllerWorkspace";
import {
  createFileSnapshot,
  downloadText,
  editWorkingCopy,
  loadBrowserDraft,
  newWorkingCopy,
  openYardText,
  saveBrowserDraft,
  serializeYardFile,
  type WorkingCopy,
} from "./domain/files";

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

  useEffect(() => {
    if (ready) setStorageError(saveDraft(copy));
  }, [copy, ready]);

  const editLocation = (
    field: "name" | "timezone" | "growingNotes",
    value: string,
  ) => {
    setCopy((previous) =>
      editWorkingCopy(previous, (document) => ({
        ...document,
        location: {
          ...document.location,
          [field]: field === "timezone" ? value || null : value,
        },
      })),
    );
  };

  const startNew = () => {
    if (
      copy.dirtySinceFile &&
      !window.confirm("Discard edits made since the last file save?")
    )
      return;
    setCopy(newWorkingCopy());
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

      {ready && (
        <>
          <YardWorkspace
            key={copy.document.id}
            document={copy.document}
            onChange={(next) =>
              setCopy((previous) => editWorkingCopy(previous, () => next))
            }
          />
          <ZoneWorkspace
            key={`${copy.document.id}-zones`}
            document={copy.document}
            onChange={(next) =>
              setCopy((previous) => editWorkingCopy(previous, () => next))
            }
          />
          <ControllerWorkspace
            key={`${copy.document.id}-controller`}
            document={copy.document}
            onChange={(next) =>
              setCopy((previous) => editWorkingCopy(previous, () => next))
            }
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
