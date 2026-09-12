import { useEffect, useState } from "react";
import type { WorkingCopy } from "../domain/files";
import {
  createYardLink,
  readYardLink,
  type SharedYard,
} from "../domain/sharing";

export function IncomingYard({
  onImport,
}: {
  onImport: (name: string, copy: WorkingCopy) => boolean;
}) {
  const [parameter] = useState(() =>
    new URL(window.location.href).searchParams.get("yard"),
  );
  const [shared, setShared] = useState<SharedYard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (parameter === null) return;
    let cancelled = false;
    void readYardLink(parameter)
      .then((result) => {
        if (!cancelled) setShared(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(`Could not open shared yard: ${String(reason)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [parameter]);
  const dismiss = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("yard");
    window.history.replaceState(null, "", url);
    setDismissed(true);
  };
  if (parameter === null || dismissed) return null;
  return (
    <section className="resume-panel" aria-label="Shared yard import">
      <h2>Shared yard</h2>
      {error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : !shared ? (
        <p>Reading yard link…</p>
      ) : (
        <>
          <p>
            “{shared.name}” contains {shared.copy.document.plants.length}{" "}
            plants. Import it as a new configuration to keep your saved yards.
          </p>
          {shared.upgrade && (
            <p>
              This yard uses map version {shared.upgrade.previousVersion}.
              Importing updates it to the current map, adding{" "}
              {shared.upgrade.addedSurfaceLabels.join(", ")}.
              {shared.upgrade.plantsToReview.length > 0 &&
                ` Review supporting surfaces for: ${shared.upgrade.plantsToReview.join(", ")}.`}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              if (onImport(shared.name, shared.copy)) dismiss();
            }}
          >
            {shared.upgrade
              ? "Update map and import as new configuration"
              : "Import as new configuration"}
          </button>
        </>
      )}
      <button type="button" className="subtle-button" onClick={dismiss}>
        Dismiss shared yard
      </button>
    </section>
  );
}

export function ShareYard({ copy, name }: { copy: WorkingCopy; name: string }) {
  const [link, setLink] = useState<{
    url: string;
    document: WorkingCopy["document"];
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const generate = async () => {
    setBusy(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const url = await createYardLink(copy, name, window.location.href);
      setLink({ url, document: copy.document, name });
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };
  const stale = link && (link.document !== copy.document || link.name !== name);
  return (
    <section className="share-yard" aria-label="Share selected yard">
      <button type="button" onClick={() => void generate()} disabled={busy}>
        {busy ? "Preparing link…" : "Create share link"}
      </button>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {link && (
        <div className="resume-panel">
          <p>
            This link contains a snapshot of the complete yard, including
            location and notes. Anyone with the link can read it. It does not
            update when you edit the yard.
          </p>
          <p>
            {link.url.length.toLocaleString("en-US")} characters. Some services
            may reject long links; use a yard file if needed.
          </p>
          {stale && (
            <p className="stale-note">
              This link predates your latest changes. Create a new link to share
              the current yard.
            </p>
          )}
          <label>
            Share URL
            <textarea
              readOnly
              rows={3}
              value={link.url}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                } catch {
                  setError(
                    "Could not copy automatically. Select and copy the Share URL above.",
                  );
                }
              })();
            }}
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      )}
    </section>
  );
}
