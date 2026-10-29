import React, { useEffect, useRef, useState } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useAppTheme } from "./theme";
import { StatusDropdown } from "./StatusDropdown";
import { pairedFieldWarnings } from "./pairedFieldWarnings";
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
const equal = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const safeLink = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const diff = (base: Data, draft: Data) =>
  Object.fromEntries(
    Object.keys(draft)
      .filter((k) => !equal(base[k], draft[k]))
      .map((k) => [k, draft[k]]),
  );

export const KeyValueEditor = () => {
  const theme = useAppTheme();
  const [data] = Retool.useStateObject({ name: "data", initialValue: {} });
  const [recordId] = Retool.useStateString({
    name: "recordId",
    initialValue: "",
    description:
      "Bind to the selected record ID. Changing it resets the editor.",
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
      "Autosave delay in milliseconds after leaving a text, number, date, or JSON field. Autosave pauses while editing these fields.",
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
  const change = Retool.useEventCallback({ name: "change" });
  const save = Retool.useEventCallback({ name: "save" });
  const reset = Retool.useEventCallback({ name: "reset" });
  const [base, setBase] = useState<Data>(data);
  const [draft, setDraft] = useState<Data>(data);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [lastEditWasDropdown, setLastEditWasDropdown] = useState(false);
  const [pending, setPending] = useState<{
    requestId: string;
    value: Data;
    original: Data;
    recordId: string;
  } | null>(null);
  const previousId = useRef(recordId);
  const attempted = useRef("");
  const changes = diff(base, draft);
  const count = Object.keys(changes).length;
  const locked = disabled || !!pending;
  const publish = (next: Data, baseline: Data) => {
    const delta = diff(baseline, next);
    setValue(next);
    setChangeset(delta);
    setDirty(Object.keys(delta).length > 0);
  };
  useEffect(() => {
    const switched = previousId.current !== recordId;
    previousId.current = recordId;
    if (switched || (!pending && count === 0)) {
      setBase(data);
      setDraft(data);
      publish(data, data);
      if (switched) {
        setEditingField(null);
        setPending(null);
        setErrors({});
        setMessage("");
        attempted.current = "";
      }
    }
  }, [JSON.stringify(data), recordId]);
  useEffect(() => {
    if (
      !pending ||
      pending.recordId !== recordId ||
      saveResult.requestId !== pending.requestId
    )
      return;
    if (saveResult.success === true) {
      setBase(pending.value);
      setDraft(pending.value);
      publish(pending.value, pending.value);
      setMessage("Saved");
    } else {
      setMessage(
        String(
          saveResult.error ||
            "Save failed. Your changes are still here. Retry Save.",
        ),
      );
    }
    setPending(null);
  }, [JSON.stringify(saveResult), pending, recordId]);
  const requestSave = () => {
    if (locked || !count || Object.keys(errors).length) return;
    const requestId = crypto.randomUUID();
    attempted.current = JSON.stringify(draft);
    setSaveRequest({
      requestId,
      recordId,
      changeset: changes,
      value: draft,
      original: base,
    });
    setPending({ requestId, value: draft, original: base, recordId });
    setMessage("");
    save();
  };
  useEffect(() => {
    if (
      !autoSave ||
      editingField !== null ||
      !count ||
      locked ||
      Object.keys(errors).length ||
      attempted.current === JSON.stringify(draft)
    )
      return;
    const delay = lastEditWasDropdown
      ? debounceMs || 1000
      : typingDebounceMs || 2500;
    const timer = setTimeout(requestSave, Math.max(250, delay));
    return () => clearTimeout(timer);
  }, [
    autoSave,
    debounceMs,
    typingDebounceMs,
    editingField,
    lastEditWasDropdown,
    JSON.stringify(draft),
    JSON.stringify(errors),
    locked,
    count,
  ]);
  const edit = (key: string, text: any, type: string, config: Field) => {
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
    setLastEditWasDropdown(
      type === "boolean" || type === "select" || type === "checkbox",
    );
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
    const nextErrors = { ...errors };
    if (error) nextErrors[key] = error;
    else delete nextErrors[key];
    setErrors(nextErrors);
    const next = { ...draft, [key]: value };
    setDraft(next);
    publish(next, base);
    setMessage("");
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
              "Saving..."
            ) : count ? (
              <>
                {count} unsaved change{count === 1 ? "" : "s"} marked in{" "}
                <span className="kv-dirty-color">blue</span>
              </>
            ) : (
              "Up to date"
            )}
            {autoSave ? " | Autosave on" : ""}
          </span>
        </div>
        <div className="kv-actions">
          <button
            disabled={locked || !count}
            onClick={() => {
              setDraft(base);
              publish(base, base);
              setErrors({});
              setMessage("");
              attempted.current = "";
              reset();
            }}
          >
            Discard
          </button>
          <button
            className="kv-save"
            disabled={locked || !count || !!Object.keys(errors).length}
            onClick={requestSave}
          >
            {pending ? "Saving..." : "Save changes"}
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
                  disabled: locked || readOnly,
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
                              edit(key, e.target.value, type, config)
                            }
                          />
                        </div>
                      )}
                      {canClear && (
                        <button
                          type="button"
                          className="kv-input-clear"
                          aria-label={`Clear ${label}`}
                          disabled={locked}
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
