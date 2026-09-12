import type { ControllerSettings, YardDocumentV1 } from "../domain/document";
import { calculateYardSchedule } from "../domain/timing";

interface Props {
  document: YardDocumentV1;
  onChange: (next: YardDocumentV1) => void;
}

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Status = "confirmed" | "assumed" | "unknown";

function StatusSelect({
  value,
  onChange,
}: {
  value: Status;
  onChange: (value: Status) => void;
}) {
  return (
    <select
      aria-label="Setting certainty"
      value={value}
      onChange={(event) => onChange(event.target.value as Status)}
    >
      <option value="unknown">Unknown</option>
      <option value="assumed">Assumed</option>
      <option value="confirmed">Confirmed</option>
    </select>
  );
}

export function ControllerWorkspace({ document, onChange }: Props) {
  const settings = document.controller.settings;
  const calculation = calculateYardSchedule(document);
  const update = (settings: ControllerSettings) =>
    onChange({
      ...document,
      controller: { ...document.controller, settings },
    });
  const updateProgram = (
    id: "A" | "B" | "C",
    change: (
      program: ControllerSettings["programs"][number],
    ) => ControllerSettings["programs"][number],
  ) =>
    update({
      ...settings,
      programs: settings.programs.map((program) =>
        program.id === id ? change(program) : program,
      ),
    });
  const numberOrNull = (raw: string): number | null =>
    raw === "" ? null : Number(raw);

  return (
    <section className="controller-workspace" aria-label="Controller schedule">
      <h2>Rain Dial schedule</h2>
      <p>
        Enter what the controller is set to. Expected intervals are predictions,
        not observed watering. Unknown or ambiguous settings are called out
        below.
      </p>
      <div className="controller-grid">
        <label>
          Reference Monday
          <input
            type="date"
            value={document.referenceWeekStart}
            onChange={(event) =>
              onChange({ ...document, referenceWeekStart: event.target.value })
            }
          />
        </label>
        <label>
          Schedule state
          <select
            value={document.controller.state}
            onChange={(event) =>
              onChange({
                ...document,
                controller: {
                  ...document.controller,
                  state: event.target.value as "proposed" | "confirmed",
                },
              })
            }
          >
            <option value="proposed">Proposed</option>
            <option value="confirmed">Confirmed on controller</option>
          </select>
        </label>
        <label>
          Effective date
          <input
            type="date"
            value={document.controller.effectiveDate ?? ""}
            onChange={(event) =>
              onChange({
                ...document,
                controller: {
                  ...document.controller,
                  effectiveDate: event.target.value || null,
                },
              })
            }
          />
        </label>
        <label>
          Verified at
          <input
            type="datetime-local"
            value={document.controller.verifiedAt?.slice(0, 16) ?? ""}
            onChange={(event) =>
              onChange({
                ...document,
                controller: {
                  ...document.controller,
                  verifiedAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                },
              })
            }
          />
        </label>
        <label>
          Stack / Overlap
          <select
            value={settings.mode.value ?? ""}
            onChange={(event) =>
              update({
                ...settings,
                mode: {
                  ...settings.mode,
                  value:
                    event.target.value === ""
                      ? null
                      : (event.target.value as "stack" | "overlap"),
                  status:
                    event.target.value === ""
                      ? "unknown"
                      : settings.mode.status,
                },
              })
            }
          >
            <option value="">Unknown</option>
            <option value="stack">Stack (1:On)</option>
            <option value="overlap">Overlap (3:On)</option>
          </select>
          <StatusSelect
            value={settings.mode.status}
            onChange={(status) =>
              update({ ...settings, mode: { ...settings.mode, status } })
            }
          />
        </label>
        <label>
          Station delay (seconds)
          <input
            type="number"
            min="0"
            max="7200"
            step="1"
            value={settings.stationDelaySeconds.value ?? ""}
            onChange={(event) =>
              update({
                ...settings,
                stationDelaySeconds: {
                  ...settings.stationDelaySeconds,
                  value: numberOrNull(event.target.value),
                },
              })
            }
          />
          <StatusSelect
            value={settings.stationDelaySeconds.status}
            onChange={(status) =>
              update({
                ...settings,
                stationDelaySeconds: {
                  ...settings.stationDelaySeconds,
                  status,
                },
              })
            }
          />
        </label>
        <label>
          Monthly water budget
          <select
            value={
              settings.monthlyWaterBudgetEnabled.value === null
                ? ""
                : String(settings.monthlyWaterBudgetEnabled.value)
            }
            onChange={(event) =>
              update({
                ...settings,
                monthlyWaterBudgetEnabled: {
                  ...settings.monthlyWaterBudgetEnabled,
                  value:
                    event.target.value === ""
                      ? null
                      : event.target.value === "true",
                },
              })
            }
          >
            <option value="">Unknown</option>
            <option value="false">Off</option>
            <option value="true">On</option>
          </select>
          <StatusSelect
            value={settings.monthlyWaterBudgetEnabled.status}
            onChange={(status) =>
              update({
                ...settings,
                monthlyWaterBudgetEnabled: {
                  ...settings.monthlyWaterBudgetEnabled,
                  status,
                },
              })
            }
          />
        </label>
        <label>
          Rain delay (days)
          <input
            type="number"
            min="0"
            step="1"
            value={settings.rainDelayDays.value ?? ""}
            onChange={(event) =>
              update({
                ...settings,
                rainDelayDays: {
                  ...settings.rainDelayDays,
                  value: numberOrNull(event.target.value),
                },
              })
            }
          />
          <StatusSelect
            value={settings.rainDelayDays.status}
            onChange={(status) =>
              update({
                ...settings,
                rainDelayDays: { ...settings.rainDelayDays, status },
              })
            }
          />
        </label>
        <label>
          Sensor / weather adjustment
          <input
            value={settings.sensorAdjustment.value ?? ""}
            placeholder="Type none, or describe adjustment"
            onChange={(event) =>
              update({
                ...settings,
                sensorAdjustment: {
                  ...settings.sensorAdjustment,
                  value: event.target.value,
                },
              })
            }
          />
          <StatusSelect
            value={settings.sensorAdjustment.status}
            onChange={(status) =>
              update({
                ...settings,
                sensorAdjustment: { ...settings.sensorAdjustment, status },
              })
            }
          />
        </label>
      </div>
      <div className="program-list">
        {settings.programs.map((program) => (
          <fieldset key={program.id} className="program-card">
            <legend>Program {program.id}</legend>
            <div
              className="weekday-list"
              aria-label={`Program ${program.id} weekdays`}
            >
              {weekdayNames.map((name, day) => (
                <label key={name}>
                  <input
                    type="checkbox"
                    checked={program.weekdays.includes(day)}
                    onChange={(event) =>
                      updateProgram(program.id, (current) => ({
                        ...current,
                        weekdays: event.target.checked
                          ? [...current.weekdays, day].sort()
                          : current.weekdays.filter((value) => value !== day),
                      }))
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
            <div className="program-settings">
              <div>
                <strong>Start times</strong>
                {program.startTimes.map((time, index) => (
                  <label key={index}>
                    Start {index + 1}
                    <input
                      type="time"
                      value={time}
                      onChange={(event) =>
                        updateProgram(program.id, (current) => ({
                          ...current,
                          startTimes: current.startTimes.map((value, item) =>
                            item === index ? event.target.value : value,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() =>
                        updateProgram(program.id, (current) => ({
                          ...current,
                          startTimes: current.startTimes.filter(
                            (_, item) => item !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </label>
                ))}
                <button
                  type="button"
                  disabled={program.startTimes.length >= 3}
                  onClick={() =>
                    updateProgram(program.id, (current) => ({
                      ...current,
                      startTimes: [
                        ...current.startTimes,
                        ["08:00", "12:00", "18:00"].find(
                          (time) => !current.startTimes.includes(time),
                        ) ?? "00:00",
                      ],
                    }))
                  }
                >
                  Add start
                </button>
              </div>
              <div>
                <strong>Station runtimes (minutes)</strong>
                <div className="runtime-grid">
                  {Array.from({ length: 9 }, (_, index) => index + 1).map(
                    (station) => (
                      <label key={station}>
                        Station {station}
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={
                            program.stationRuntimes.find(
                              (item) => item.stationNumber === station,
                            )?.minutes ?? ""
                          }
                          onChange={(event) =>
                            updateProgram(program.id, (current) => ({
                              ...current,
                              stationRuntimes: [
                                ...current.stationRuntimes.filter(
                                  (item) => item.stationNumber !== station,
                                ),
                                ...(event.target.value === ""
                                  ? []
                                  : [
                                      {
                                        stationNumber: station,
                                        minutes: Number(event.target.value),
                                      },
                                    ]),
                              ].sort(
                                (a, b) => a.stationNumber - b.stationNumber,
                              ),
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="program-budget">
              <label>
                Basic water budget (%)
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={program.waterBudgetPercent.value ?? ""}
                  onChange={(event) =>
                    updateProgram(program.id, (current) => ({
                      ...current,
                      waterBudgetPercent: {
                        ...current.waterBudgetPercent,
                        value: numberOrNull(event.target.value),
                      },
                    }))
                  }
                />
                <StatusSelect
                  value={program.waterBudgetPercent.status}
                  onChange={(status) =>
                    updateProgram(program.id, (current) => ({
                      ...current,
                      waterBudgetPercent: {
                        ...current.waterBudgetPercent,
                        status,
                      },
                    }))
                  }
                />
              </label>
              {settings.monthlyWaterBudgetEnabled.value && (
                <div
                  className="monthly-grid"
                  aria-label={`Program ${program.id} monthly budgets`}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (month) => (
                      <label key={month}>
                        Month {month}
                        <input
                          type="number"
                          min="0"
                          max="200"
                          value={
                            program.monthlyWaterBudget.find(
                              (item) => item.month === month,
                            )?.percent ?? ""
                          }
                          onChange={(event) =>
                            updateProgram(program.id, (current) => ({
                              ...current,
                              monthlyWaterBudget: [
                                ...current.monthlyWaterBudget.filter(
                                  (item) => item.month !== month,
                                ),
                                ...(event.target.value === ""
                                  ? []
                                  : [
                                      {
                                        month,
                                        percent: Number(event.target.value),
                                      },
                                    ]),
                              ].sort((a, b) => a.month - b.month),
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="timeline" aria-label="Expected watering timeline">
        <h3>Expected watering · {document.referenceWeekStart}</h3>
        <p className={`calculation-status ${calculation.status}`}>
          Calculation: {calculation.status}
          {calculation.reason ? ` — ${calculation.reason}` : ""}
        </p>
        {calculation.stationEvents.length === 0 ? (
          <p>No predictable station events for this week.</p>
        ) : (
          <ol>
            {calculation.stationEvents.map((event) => (
              <li key={event.id}>
                {event.start}–{event.end} · Program {event.programId}, station{" "}
                {event.stationNumber},{" "}
                {document.zones.find((zone) => zone.id === event.zoneId)
                  ?.name ?? event.zoneId}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
