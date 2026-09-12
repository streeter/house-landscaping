import { useEffect, useState } from "react";
import type { WorkingCopy } from "../domain/files";
import {
  createYardLink,
  replaceYardUrl,
  readYardLink,
  type SharedYard,
} from "../domain/sharing";

export function IncomingYard({
  parameter,
  onDismiss,
  onImport,
}: {
  parameter: string;
  onDismiss: () => void;
  onImport: (name: string, copy: WorkingCopy) => boolean;
}) {
  const [shared, setShared] = useState<SharedYard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
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
    replaceYardUrl(url);
    onDismiss();
  };
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

export function YardUrlSync({
  copy,
  name,
  configurationId,
  enabled,
  browserSaved,
}: {
  copy: WorkingCopy;
  name: string;
  configurationId: string;
  enabled: boolean;
  browserSaved: boolean;
}) {
  const [warning, setWarning] = useState<string | null>(null);
  const [updating, setUpdating] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setUpdating(true);
    // Coalesce typing and map dragging, and ignore compression from older edits.
    const timer = window.setTimeout(() => {
      void createYardLink(copy, name, window.location.href)
        .then((link) => {
          if (cancelled) return;
          const url = new URL(window.location.href);
          url.searchParams.set("yard", new URL(link).searchParams.get("yard")!);
          replaceYardUrl(url, browserSaved ? configurationId : undefined);
          setWarning(null);
          setUpdating(false);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          const url = new URL(window.location.href);
          url.searchParams.delete("yard");
          replaceYardUrl(url);
          setWarning(
            reason instanceof Error
              ? reason.message
              : "The yard could not be included in the URL. Download it to share it.",
          );
          setUpdating(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [copy, name, configurationId, enabled, browserSaved]);
  if (!enabled) return null;
  return (
    <div className="share-yard" aria-live="polite">
      {warning ? (
        <p role="alert" className="error-message">
          {warning}
        </p>
      ) : (
        <p>
          {updating
            ? "Updating yard in URL…"
            : "URL updated. Copy the address bar to share this yard, including its location and notes."}
        </p>
      )}
    </div>
  );
}
