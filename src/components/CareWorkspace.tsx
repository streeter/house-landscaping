import { useState } from "react";
import type { YardDocumentV1 } from "../domain/document";

interface Props {
  document: YardDocumentV1;
  onChange: (next: YardDocumentV1) => void;
}

type Target = YardDocumentV1["tasks"][number]["target"];
const localInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const today = () => new Date().toISOString().slice(0, 10);

function targetValue(target: Target): string {
  return target.kind === "property"
    ? "property"
    : `${target.kind}:${target.id}`;
}
function parseTarget(value: string): Target {
  if (value === "property") return { kind: "property", id: null };
  const [kind, ...parts] = value.split(":");
  return { kind: kind as "plant" | "zone", id: parts.join(":") };
}

function TargetPicker({
  document,
  value,
  onChange,
  label,
}: {
  document: YardDocumentV1;
  value: Target;
  onChange: (target: Target) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={targetValue(value)}
      onChange={(event) => onChange(parseTarget(event.target.value))}
    >
      <option value="property">Whole property</option>
      {document.plants.map((plant) => (
        <option key={plant.id} value={`plant:${plant.id}`}>
          Plant: {plant.label}
        </option>
      ))}
      {document.zones.map((zone) => (
        <option key={zone.id} value={`zone:${zone.id}`}>
          Zone: {zone.name}
        </option>
      ))}
    </select>
  );
}

function targetLabel(target: Target, document: YardDocumentV1): string {
  if (target.kind === "property") return "Property";
  if (target.kind === "plant")
    return (
      document.plants.find((plant) => plant.id === target.id)?.label ??
      target.id ??
      "Unknown plant"
    );
  return (
    document.zones.find((zone) => zone.id === target.id)?.name ??
    target.id ??
    "Unknown zone"
  );
}

export function CareWorkspace({ document, onChange }: Props) {
  const [observationTarget, setObservationTarget] = useState<Target>({
    kind: "property",
    id: null,
  });
  const [observationAt, setObservationAt] = useState(localInput(new Date()));
  const [observationText, setObservationText] = useState("");
  const [taskTarget, setTaskTarget] = useState<Target>({
    kind: "property",
    id: null,
  });
  const [taskDue, setTaskDue] = useState(today());
  const [taskRepeat, setTaskRepeat] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [scheduleState, setScheduleState] = useState<"proposed" | "programmed">(
    "proposed",
  );
  const [scheduleDate, setScheduleDate] = useState(today());
  const [scheduleVerified, setScheduleVerified] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");

  const addObservation = () => {
    if (!observationText.trim() || !observationAt) return;
    onChange({
      ...document,
      observations: [
        ...document.observations,
        {
          id: crypto.randomUUID(),
          at: new Date(observationAt).toISOString(),
          target: observationTarget,
          text: observationText.trim(),
        },
      ],
    });
    setObservationText("");
  };
  const addTask = () => {
    if (
      !taskDue ||
      !taskNotes.trim() ||
      (taskRepeat !== "" &&
        (!Number.isInteger(Number(taskRepeat)) || Number(taskRepeat) < 1))
    )
      return;
    onChange({
      ...document,
      tasks: [
        ...document.tasks,
        {
          id: crypto.randomUUID(),
          target: taskTarget,
          dueDate: taskDue,
          repeatDays: taskRepeat ? Number(taskRepeat) : null,
          completedAt: null,
          notes: taskNotes.trim(),
        },
      ],
    });
    setTaskNotes("");
    setTaskRepeat("");
  };
  const saveSchedule = () => {
    if (!scheduleDate || (scheduleState === "programmed" && !scheduleVerified))
      return;
    onChange({
      ...document,
      scheduleRecords: [
        ...document.scheduleRecords,
        {
          id: crypto.randomUUID(),
          sourceExportId: document.exportId,
          state: scheduleState,
          effectiveDate: scheduleDate,
          verifiedAt:
            scheduleState === "programmed"
              ? new Date(scheduleVerified).toISOString()
              : null,
          notes: scheduleNotes.trim(),
          settings: structuredClone(document.controller.settings),
        },
      ],
    });
    setScheduleNotes("");
  };

  return (
    <section className="care-workspace" aria-label="Care records">
      <h2>Care and chosen schedules</h2>
      <p>
        Record observations, maintenance, and schedule decisions. A saved
        schedule is a dated copy of the controller settings; it does not change
        the current controller editor.
      </p>
      <div className="care-grid">
        <div className="care-card">
          <h3>Add observation</h3>
          <div className="target-field">
            Target
            <TargetPicker
              document={document}
              value={observationTarget}
              onChange={setObservationTarget}
              label="Observation target"
            />
          </div>
          <label>
            Observed at
            <input
              type="datetime-local"
              value={observationAt}
              onChange={(event) => setObservationAt(event.target.value)}
            />
          </label>
          <label>
            Observation
            <textarea
              value={observationText}
              onChange={(event) => setObservationText(event.target.value)}
              rows={3}
            />
          </label>
          <button
            type="button"
            disabled={!observationText.trim() || !observationAt}
            onClick={addObservation}
          >
            Add observation
          </button>
          <h4>History</h4>
          {document.observations.length === 0 ? (
            <p>None yet</p>
          ) : (
            <ol>
              {document.observations.map((record) => (
                <li key={record.id}>
                  <strong>{new Date(record.at).toLocaleString()}</strong> ·{" "}
                  {targetLabel(record.target, document)}: {record.text}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="care-card">
          <h3>Add maintenance task</h3>
          <div className="target-field">
            Target
            <TargetPicker
              document={document}
              value={taskTarget}
              onChange={setTaskTarget}
              label="Task target"
            />
          </div>
          <label>
            Due date
            <input
              type="date"
              value={taskDue}
              onChange={(event) => setTaskDue(event.target.value)}
            />
          </label>
          <label>
            Repeat every (days, optional)
            <input
              type="number"
              min="1"
              step="1"
              value={taskRepeat}
              onChange={(event) => setTaskRepeat(event.target.value)}
            />
          </label>
          <label>
            Task notes
            <textarea
              value={taskNotes}
              onChange={(event) => setTaskNotes(event.target.value)}
              rows={3}
            />
          </label>
          <button
            type="button"
            disabled={
              !taskDue ||
              !taskNotes.trim() ||
              (taskRepeat !== "" &&
                (!Number.isInteger(Number(taskRepeat)) ||
                  Number(taskRepeat) < 1))
            }
            onClick={addTask}
          >
            Add task
          </button>
          <h4>Tasks</h4>
          {document.tasks.length === 0 ? (
            <p>None yet</p>
          ) : (
            <ol>
              {document.tasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.dueDate}</strong> ·{" "}
                  {targetLabel(task.target, document)}: {task.notes}
                  {task.repeatDays
                    ? ` · every ${task.repeatDays} days`
                    : ""} · {task.completedAt ? "completed" : "open"}
                  <button
                    type="button"
                    className="subtle-button"
                    onClick={() =>
                      onChange({
                        ...document,
                        tasks: document.tasks.map((item) =>
                          item.id === task.id
                            ? {
                                ...item,
                                completedAt: item.completedAt
                                  ? null
                                  : new Date().toISOString(),
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    {task.completedAt ? "Reopen" : "Complete"}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="care-card">
          <h3>Save schedule decision</h3>
          <label>
            Decision state
            <select
              value={scheduleState}
              onChange={(event) =>
                setScheduleState(
                  event.target.value as "proposed" | "programmed",
                )
              }
            >
              <option value="proposed">Proposed</option>
              <option value="programmed">Programmed on controller</option>
            </select>
          </label>
          <label>
            Effective date
            <input
              type="date"
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
            />
          </label>
          {scheduleState === "programmed" && (
            <label>
              Verified at
              <input
                type="datetime-local"
                value={scheduleVerified}
                onChange={(event) => setScheduleVerified(event.target.value)}
              />
            </label>
          )}
          <label>
            Decision notes
            <textarea
              value={scheduleNotes}
              onChange={(event) => setScheduleNotes(event.target.value)}
              rows={3}
            />
          </label>
          <p>Source advice export: {document.exportId ?? "none yet"}</p>
          <button
            type="button"
            disabled={
              !scheduleDate ||
              (scheduleState === "programmed" && !scheduleVerified)
            }
            onClick={saveSchedule}
          >
            Save schedule record
          </button>
          <h4>Saved decisions</h4>
          {document.scheduleRecords.length === 0 ? (
            <p>None yet</p>
          ) : (
            <ol>
              {document.scheduleRecords.map((record) => (
                <li key={record.id}>
                  <strong>{record.effectiveDate}</strong> · {record.state} ·
                  verified{" "}
                  {record.verifiedAt
                    ? new Date(record.verifiedAt).toLocaleString()
                    : "not yet"}{" "}
                  · source export {record.sourceExportId ?? "none"}.{" "}
                  {record.notes}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
