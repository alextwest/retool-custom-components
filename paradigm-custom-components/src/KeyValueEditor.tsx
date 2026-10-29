import React, { useEffect, useRef, useState } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useAppTheme } from "./theme";
import "./KeyValueEditor.css";

type Data = Record<string, any>;
type Field = {
  label?: string;
  type?: "text" | "number" | "date" | "boolean" | "select" | "json" | "link";
  linkText?: string;
  readOnly?: boolean;
  hidden?: boolean;
  required?: boolean;
  options?: string[];
  group?: string;
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
      "Field configuration keyed by data key: label, type, options, group, hidden, readOnly, required.",
  });
  const [title] = Retool.useStateString({
    name: "title",
    initialValue: "Measure details",
  });
  const [autoSave] = Retool.useStateBoolean({
    name: "autoSave",
    initialValue: false,
  });
  const [debounceMs] = Retool.useStateNumber({
    name: "debounceMs",
    initialValue: 900,
  });
  const [disabled] = Retool.useStateBoolean({
    name: "disabled",
    initialValue: false,
  });
  const [saveResult] = Retool.useStateObject({
    name: "saveResult",
    initialValue: {},
    description:
      "Bind to temporary state. Handler sets {requestId, success, error}.",
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
  const [pending, setPending] = useState<{
    requestId: string;
    value: Data;
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
        setPending(null);
        setErrors({});
        setMessage("");
        attempted.current = "";
      }
    }
  }, [JSON.stringify(data), recordId]);
  useEffect(() => {
    if (!pending || saveResult.requestId !== pending.requestId) return;
    if (saveResult.success === true) {
      setBase(pending.value);
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
  }, [JSON.stringify(saveResult), pending]);
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
    setPending({ requestId, value: draft });
    setMessage("");
    save();
  };
  useEffect(() => {
    if (
      !autoSave ||
      !count ||
      locked ||
      Object.keys(errors).length ||
      attempted.current === JSON.stringify(draft)
    )
      return;
    const timer = setTimeout(requestSave, Math.max(250, debounceMs || 900));
    return () => clearTimeout(timer);
  }, [
    autoSave,
    debounceMs,
    JSON.stringify(draft),
    JSON.stringify(errors),
    locked,
    count,
  ]);
  const edit = (key: string, text: any, type: string, config: Field) => {
    let value = text;
    let error = "";
    if (type === "number" && text !== "") {
      value = Number(text);
      if (!Number.isFinite(value)) error = "Enter a valid number";
    }
    if (type === "json" && text !== "") {
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
  return (
    <div className="kv-editor" style={theme}>
      <header>
        <div>
          <h2>{title}</h2>
          <span className="kv-muted">
            {pending
              ? "Saving..."
              : count
                ? `${count} unsaved change${count === 1 ? "" : "s"}`
                : "Up to date"}
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
          <div className="kv-grid">
            {visible
              .filter(
                (k) =>
                  (((fields[k] || {}) as Field).group || "Details") === group,
              )
              .map((key) => {
                const config = (fields[key] || {}) as Field;
                const value = draft[key];
                const type =
                  config.type ||
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
                return (
                  <label
                    className={`kv-field ${key in changes ? "kv-dirty" : ""}`}
                    key={`${recordId}:${key}`}
                  >
                    <span>
                      {label}
                      {config.required ? " *" : ""}
                      {readOnly && <small>Read only</small>}
                    </span>
                    {type === "link" ? (
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
                    {errors[key] && (
                      <small role="alert" className="kv-error">
                        {errors[key]}
                      </small>
                    )}
                  </label>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
};
