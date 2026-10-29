import React, { useId, useState } from "react";

export function StatusDropdown({
  value,
  options,
  label,
  disabled,
  invalid,
  clearReason,
  onChange,
}: {
  value: unknown;
  options: string[];
  label: string;
  disabled: boolean;
  invalid: boolean;
  clearReason: string | null;
  onChange: (value: string | null) => void;
}) {
  const hintId = useId();
  const [showHint, setShowHint] = useState(false);
  const populated = value != null && value !== "";
  const canClear = populated && !clearReason;
  return (
    <div className="kv-status">
      <div
        className={`kv-status-control${canClear ? " kv-status-clearable" : ""}`}
      >
        <select
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={clearReason ? hintId : undefined}
          disabled={disabled}
          value={value == null ? "" : String(value)}
          onChange={(event) => {
            if (event.target.value !== "") onChange(event.target.value);
          }}
        >
          <option value="" disabled hidden>
            Not set
          </option>
          {[...new Set([...options, ...(populated ? [String(value)] : [])])]
            .filter(
              (option) =>
                option !== "" && option.trim().toLowerCase() !== "not set",
            )
            .map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
        </select>
        {canClear && (
          <button
            type="button"
            className="kv-status-clear"
            aria-label={`Clear ${label}`}
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(null);
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      {clearReason && (
        <div className="kv-status-info">
          <button
            type="button"
            aria-label={`Why clearing ${label} is unavailable`}
            aria-expanded={showHint}
            aria-controls={hintId}
            title={clearReason}
            onClick={() => setShowHint(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowHint(false);
            }}
            onMouseEnter={() => setShowHint(true)}
            onMouseLeave={() => setShowHint(false)}
            onFocus={() => setShowHint(true)}
            onBlur={() => setShowHint(false)}
          >
            <span aria-hidden="true">ⓘ</span>
          </button>
          <span
            id={hintId}
            className={showHint ? "kv-status-hint" : "kv-sr-only"}
          >
            {clearReason}
          </span>
        </div>
      )}
    </div>
  );
}
