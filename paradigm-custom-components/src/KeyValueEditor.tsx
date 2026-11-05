import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useAppTheme } from "./theme";
import { StatusDropdown } from "./StatusDropdown";
import { pairedFieldWarnings } from "./pairedFieldWarnings";
import {
  changedValues as diff,
  initialEditorRecord,
  KeyValueSaveQueue,
} from "./keyValueSaveQueue";
import {
  ClearRule,
  statusClearReason,
  statusRules,
  statusDependencyReason,
} from "./statusRules";
import "./KeyValueEditor.css";

type Data = Record<string, any>;
type Field = {
  label?: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "boolean"
    | "select"
    | "checkbox"
    | "json"
    | "link";
  linkText?: string;
  readOnly?: boolean;
  hidden?: boolean;
  required?: boolean;
  options?: string[];
  group?: string;
  pairedField?: string;
};
const safeLink = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const KeyValueEditor = () => {
  const theme = useAppTheme();
  const [data] = Retool.useStateObject({ name: "data", initialValue: {} });
  const [recordId] = Retool.useStateString({
    name: "recordId",
    initialValue: "",
    description:
      "Bind to the selected record ID. Unsaved drafts are cached per record while this component remains mounted.",
  });
  const [fields] = Retool.useStateObject({
    name: "fields",
    initialValue: {},
    description:
      "Field configuration keyed by data key: label, type, options, group, hidden, readOnly, required, pairedField.",
  });
  const [title] = Retool.useStateString({
    name: "title",
    initialValue: "Measure details",
  });
  const [statusClearRules] = Retool.useStateObject({
    name: "statusClearRules",
    initialValue: {},
    description:
      "Optional status clearing overrides: {canClear: boolean, reason?: string}. All five statuses allow clearing when related dates and amounts are cleared; zero amounts do not block clearing.",
  });
  const [autoSave] = Retool.useStateBoolean({
    name: "autoSave",
    initialValue: false,
  });
  const [debounceMs] = Retool.useStateNumber({
    name: "debounceMs",
    initialValue: 1000,
    description: "Autosave delay in milliseconds for dropdown changes.",
  });
  const [typingDebounceMs] = Retool.useStateNumber({
    name: "typingDebounceMs",
    initialValue: 2500,
    description:
      "Idle delay after typing, or after leaving a field. New edits are cached while an earlier request saves.",
  });
  const [saveWhileFocused] = Retool.useStateBoolean({
    name: "saveWhileFocused",
    initialValue: true,
    description:
      "Save after a typing pause even if the field stays focused. Turn off to wait until the field loses focus.",
  });
  const [disabled] = Retool.useStateBoolean({
    name: "disabled",
    initialValue: false,
  });
  const [saveResult] = Retool.useStateObject({
    name: "saveResult",
    initialValue: {},
    description:
      "Bind to temporary state. Handler sets {requestId, success, error}. A matching success acknowledgment marks the submitted changes saved.",
  });
  const [, setValue] = Retool.useStateObject({
    name: "value",
    initialValue: {},
    inspector: "hidden",
  });
  const [, setChangeset] = Retool.useStateObject({
    name: "changeset",
    initialValue: {},
    inspector: "hidden",
  });
  const [, setSaveRequest] = Retool.useStateObject({
    name: "saveRequest",
    initialValue: {},
    inspector: "hidden",
  });
  const [, setDirty] = Retool.useStateBoolean({
    name: "isDirty",
    initialValue: false,
    inspector: "hidden",
  });
  const [, setIsSaving] = Retool.useStateBoolean({
    name: "isSaving",
    initialValue: false,
    inspector: "hidden",
  });
  const [, setHasUnsavedChanges] = Retool.useStateBoolean({
    name: "hasUnsavedChanges",
    initialValue: false,
    inspector: "hidden",
  });
  const change = Retool.useEventCallback({ name: "change" });
  const save = Retool.useEventCallback({ name: "save" });
  const reset = Retool.useEventCallback({ name: "reset" });
  const queueRef = useRef<KeyValueSaveQueue | null>(null);
  if (!queueRef.current) queueRef.current = new KeyValueSaveQueue();
  const queue = queueRef.current;
  const state = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );
  const dataId = data.measure_id ?? data.id;
  const record =
    state.records[recordId] ??
    initialEditorRecord(
      dataId == null || String(dataId) === recordId ? data : {},
    );
  const { base, draft, errors, message } = record;
  const pending = state.pending;
  const currentPending = pending?.recordId === recordId;
  const changes = diff(base, draft);
  const count = Object.keys(changes).length;
  const newerEdits =
    !!currentPending && Object.keys(diff(pending!.value, draft)).length > 0;
  const saveable = currentPending ? newerEdits : count > 0;
  const otherDirtyRecords = Object.entries(state.records).filter(
    ([id, r]) =>
      id !== recordId && Object.keys(diff(r.base, r.draft)).length > 0,
  ).length;
  const hasUnsavedChanges = !!pending || count > 0 || otherDirtyRecords > 0;
  const [search, setSearch] = useState("");
  const publish = (next: Data, baseline: Data) => {
    const delta = diff(baseline, next);
    setValue(next);
    setChangeset(delta);
    setDirty(Object.keys(delta).length > 0);
  };
  useEffect(() => {
    queue.select(recordId, data, Date.now());
  }, [recordId, JSON.stringify(data)]);
  useEffect(() => {
    queue.acknowledge(saveResult);
  }, [JSON.stringify(saveResult)]);
  useEffect(() => {
    publish(draft, base);
  }, [recordId, JSON.stringify(base), JSON.stringify(draft)]);
  useEffect(() => {
    setIsSaving(!!pending);
    setHasUnsavedChanges(hasUnsavedChanges);
  }, [!!pending, hasUnsavedChanges]);
  useEffect(() => {
    const settings = {
      autoSave,
      disabled,
      debounceMs,
      typingDebounceMs,
      saveWhileFocused,
    };
    const delay = queue.delay(settings, Date.now());
    if (delay === null) return;
    const timer = setTimeout(() => {
      const request = queue.start(settings, Date.now(), crypto.randomUUID());
      if (!request) return;
      setSaveRequest(request);
      save();
    }, delay);
    return () => clearTimeout(timer);
  }, [
    state,
    autoSave,
    disabled,
    debounceMs,
    typingDebounceMs,
    saveWhileFocused,
  ]);
  const requestSave = () => {
    if (!disabled) queue.queue(recordId);
  };
  const setEditingField = (field: string | null) =>
    queue.focus(recordId, field, Date.now());
  const edit = (
    key: string,
    text: any,
    type: string,
    config: Field,
    browserInvalid = false,
  ) => {
    if (Object.prototype.hasOwnProperty.call(statusRules, key)) {
      if (typeof text === "string" && text.trim().toLowerCase() === "not set")
        return;
      if (
        (text === "" || text == null) &&
        (statusDependencyReason(key, draft, fields as Record<string, Field>) ||
          statusClearReason(
            key,
            base[key],
            config.label || key,
            !!config.required,
            statusClearRules as Record<string, ClearRule>,
          ))
      )
        return;
    }
    let value = text;
    let error = "";
    if (type === "number" && text !== "" && text != null) {
      value = Number(text);
      if (!Number.isFinite(value)) error = "Enter a valid number";
    }
    if (type === "json" && text !== "" && text != null) {
      try {
        value = JSON.parse(text);
      } catch {
        error = "Enter valid JSON";
      }
    }
    if (text === "") value = null;
    if (config.required && (value === null || value === "")) error = "Required";
    if (browserInvalid)
      error = type === "date" ? "Enter a valid date" : "Enter a valid number";
    queue.edit(
      recordId,
      key,
      value,
      error,
      type === "boolean" || type === "select" || type === "checkbox",
      Date.now(),
    );
    const next = queue.getSnapshot().records[recordId];
    if (next) publish(next.draft, next.base);
    change();
  };
  const visible = Object.keys(draft).filter((key) => {
    const config = (fields[key] || {}) as Field;
    return (
      !config.hidden &&
      `${key} ${config.label || ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const groups = [
    ...new Set(
      visible.map((k) => ((fields[k] || {}) as Field).group || "Details"),
    ),
  ];
  const pairingWarnings = pairedFieldWarnings(
    draft,
    fields as Record<string, Field>,
  );
  return (
    <div className="kv-editor" style={theme}>
      <header>
        <div>
          <h2>{title}</h2>
          <span className="kv-muted">
            {pending ? (
              currentPending ? (
                newerEdits ? (
                  "Saving... New edits queued"
                ) : (
                  "Saving... You can keep editing"
                )
              ) : (
                "Saving another record..."
              )
            ) : count ? (
              <>
                {count} unsaved change{count === 1 ? "" : "s"} marked in{" "}
                <span className="kv-dirty-color">blue</span>
              </>
            ) : (
              "Up to date"
            )}
            {autoSave ? " | Autosave on" : ""}
            {otherDirtyRecords > 0
              ? ` | ${otherDirtyRecords} other record draft${otherDirtyRecords === 1 ? "" : "s"} retained`
              : ""}
          </span>
        </div>
        <div className="kv-actions">
          <button
            disabled={disabled || currentPending || !count}
            onClick={() => {
              queue.discard(recordId);
              reset();
            }}
          >
            Discard
          </button>
          <button
            className="kv-save"
            disabled={
              disabled || !recordId || !saveable || !!Object.keys(errors).length
            }
            onClick={requestSave}
          >
            {pending
              ? record.manual
                ? "Save queued"
                : saveable
                  ? "Queue changes"
                  : "Saving..."
              : "Save changes"}
          </button>
        </div>
      </header>
      {/* Search UI retained for future use.
      <input
        className="kv-search"
        type="search"
        aria-label="Search fields"
        placeholder="Search fields..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      */}
      {message && (
        <div role="status" className="kv-message">
          {message}
        </div>
      )}
      {!visible.length && (
        <p className="kv-muted">
          {Object.keys(draft).length
            ? "No matching fields"
            : "Select a record to view details"}
        </p>
      )}
      {groups.map((group) => (
        <section key={group}>
          <h3>{group}</h3>
          {pairingWarnings
            .filter((warning) => warning.group === group)
            .map((warning) => (
              <p
                className="kv-pair-warning"
                role="status"
                key={warning.message}
              >
                <span aria-hidden="true">⚠ </span>
                {warning.message}
              </p>
            ))}
          <div className="kv-grid">
            {visible
              .filter(
                (k) =>
                  (((fields[k] || {}) as Field).group || "Details") === group,
              )
              .map((key) => {
                const config = (fields[key] || {}) as Field;
                const isStatus = Object.prototype.hasOwnProperty.call(
                  statusRules,
                  key,
                );
                const FieldContainer = "div";
                const value = draft[key];
                const isBid =
                  /^(is_)?bid$/i.test(key) ||
                  config.label?.trim().toLowerCase() === "bid";
                const type = isBid
                  ? "checkbox"
                  : config.type ||
                    (typeof base[key] === "boolean"
                      ? "boolean"
                      : typeof base[key] === "number" || /_amount$/.test(key)
                        ? "number"
                        : base[key] !== null && typeof base[key] === "object"
                          ? "json"
                          : /_date$/.test(key)
                            ? "date"
                            : "text");
                const readOnly =
                  config.readOnly ??
                  /(^id$|_id$|_at$|^source_|^duration_|aging_business_days$)/.test(
                    key,
                  );
                const label =
                  config.label ||
                  key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                const inputProps = {
                  disabled: disabled || readOnly,
                  "aria-label": label,
                  "aria-invalid": !!errors[key],
                };
                const canClear =
                  !isBid &&
                  !isStatus &&
                  type !== "link" &&
                  !readOnly &&
                  !disabled &&
                  value != null &&
                  value !== "";
                return (
                  <FieldContainer
                    className={`kv-field ${key in changes ? "kv-dirty" : ""}`}
                    key={`${recordId}:${key}`}
                  >
                    <span>
                      {label}
                      {config.required ? " *" : ""}
                      {readOnly && <small>Read only</small>}
                    </span>
                    <div
                      className={canClear ? "kv-clearable-input" : undefined}
                    >
                      {isStatus ? (
                        <StatusDropdown
                          {...inputProps}
                          label={label}
                          invalid={!!errors[key]}
                          value={value}
                          options={config.options || []}
                          clearReason={
                            statusDependencyReason(
                              key,
                              draft,
                              fields as Record<string, Field>,
                            ) ||
                            statusClearReason(
                              key,
                              base[key],
                              label,
                              !!config.required,
                              statusClearRules as Record<string, ClearRule>,
                            )
                          }
                          onChange={(next) => edit(key, next, "select", config)}
                        />
                      ) : type === "link" ? (
                        safeLink(value) ? (
                          <a
                            className="kv-link"
                            href={safeLink(value)!}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {config.linkText || String(value)}
                          </a>
                        ) : (
                          <div className="kv-link kv-muted">
                            {value ? "Invalid URL" : "Not set"}
                          </div>
                        )
                      ) : type === "checkbox" ? (
                        <input
                          {...inputProps}
                          type="checkbox"
                          checked={value === true || value === "true"}
                          onChange={(e) =>
                            edit(key, e.target.checked, type, config)
                          }
                        />
                      ) : type === "boolean" || type === "select" ? (
                        <select
                          {...inputProps}
                          value={value == null ? "" : String(value)}
                          onChange={(e) =>
                            edit(
                              key,
                              type === "boolean" && e.target.value !== ""
                                ? e.target.value === "true"
                                : e.target.value,
                              type,
                              config,
                            )
                          }
                        >
                          <option value="">Not set</option>
                          {(type === "boolean"
                            ? ["true", "false"]
                            : [
                                ...new Set([
                                  ...(config.options || []),
                                  ...(value != null ? [String(value)] : []),
                                ]),
                              ]
                          ).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : type === "json" ? (
                        <textarea
                          {...inputProps}
                          onFocus={() => setEditingField(key)}
                          onBlur={() => setEditingField(null)}
                          value={
                            typeof value === "string"
                              ? value
                              : value == null
                                ? ""
                                : JSON.stringify(value, null, 2)
                          }
                          onChange={(e) =>
                            edit(key, e.target.value, type, config)
                          }
                        />
                      ) : (
                        <div
                          className={
                            /_amount$/.test(key) ? "kv-currency" : undefined
                          }
                        >
                          {/_amount$/.test(key) && (
                            <span
                              className="kv-currency-prefix"
                              aria-hidden="true"
                            >
                              $
                            </span>
                          )}
                          <input
                            {...inputProps}
                            onFocus={() => setEditingField(key)}
                            onBlur={() => setEditingField(null)}
                            type={
                              type === "date"
                                ? "date"
                                : type === "number"
                                  ? "number"
                                  : "text"
                            }
                            step={type === "number" ? "any" : undefined}
                            placeholder="Not set"
                            value={value ?? ""}
                            onChange={(e) =>
                              edit(
                                key,
                                e.target.value,
                                type,
                                config,
                                e.target.validity.badInput,
                              )
                            }
                          />
                        </div>
                      )}
                      {canClear && (
                        <button
                          type="button"
                          className="kv-input-clear"
                          aria-label={`Clear ${label}`}
                          disabled={disabled}
                          onClick={() => edit(key, null, type, config)}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      )}
                    </div>
                    {errors[key] && (
                      <small role="alert" className="kv-error">
                        {errors[key]}
                      </small>
                    )}
                  </FieldContainer>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
};
