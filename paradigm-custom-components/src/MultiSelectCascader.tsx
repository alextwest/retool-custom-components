import React, { useEffect, useId, useRef, useState } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useAppTheme } from "./theme";
import { normalizeOptions, optionPath, CascaderOption } from "./cascaderOptions";
import "./MultiSelectCascader.css";

export function MultiSelectCascader() {
  const theme = useAppTheme();
  Retool.useComponentSettings({ defaultWidth: 4, defaultHeight: 10 });
  const [data] = Retool.useStateArray({ name: "options", initialValue: [], description: "Flat rows: { value: string, label: string, parent: string | null, disabled?: boolean }. Reuse your Cascader data source." });
  const [value, setValue] = Retool.useStateArray({ name: "value", initialValue: [], description: "Selected leaf values. Clear with setValue([])." });
  const [label] = Retool.useStateString({ name: "label", initialValue: "Measure Status Filter" });
  const [placeholder] = Retool.useStateString({ name: "placeholder", initialValue: "Select options" });
  const [disabled] = Retool.useStateBoolean({ name: "disabled", initialValue: false });
  const [pickerOnly] = Retool.useStateBoolean({ name: "pickerOnly", initialValue: false, description: "Show the picker directly, for use inside a Retool modal or other container." });
  const change = Retool.useEventCallback({ name: "change" });
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const options = normalizeOptions(data);
  const selected = [...new Set(value.filter((v): v is string => typeof v === "string"))];
  const parentValues = new Set(options.map(row => row.parent));
  const isBranch = (row: CascaderOption) => parentValues.has(row.value);
  const pathLabel = (row: CascaderOption) => optionPath(row, options).map(p => p.label).join(" / ");
  const current = options.find(row => row.value === branch);
  const query = search.trim().toLocaleLowerCase();
  const rows = query ? options.filter(row => !isBranch(row) && pathLabel(row).toLocaleLowerCase().includes(query)) : options.filter(row => row.parent === (current?.value ?? null));
  const update = (next: string[]) => { setValue(next); change(); };
  const toggle = (v: string) => update(selected.includes(v) ? selected.filter(item => item !== v) : [...selected, v]);
  useEffect(() => {
    if (open) searchInput.current?.focus();
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <div ref={root} className="msc" style={theme} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    {!pickerOnly && <>
      {label && <label className="msc-label" htmlFor={`${id}-trigger`}>{label}</label>}
      <div className={`msc-control${disabled ? " msc-disabled" : ""}`}>
        <button ref={trigger} id={`${id}-trigger`} className="msc-trigger" type="button" disabled={disabled} aria-label={label || placeholder} aria-expanded={open} aria-controls={`${id}-picker`} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
          <span className={selected.length ? "" : "msc-muted"}>{selected.length ? `${selected.length} selected` : placeholder}</span><span aria-hidden="true">⌄</span>
        </button>
        {!!selected.length && <div className="msc-tags">{selected.map(v => <span className="msc-tag" key={v} title={options.find(row => row.value === v) ? pathLabel(options.find(row => row.value === v)!) : v}>
          <span>{options.find(row => row.value === v)?.label ?? v}</span><button type="button" disabled={disabled} aria-label={`Remove ${options.find(row => row.value === v) ? pathLabel(options.find(row => row.value === v)!) : v}`} onClick={() => toggle(v)}>×</button>
        </span>)}</div>}
      </div>
    </>}
    {(pickerOnly || open) && <div className="msc-picker" id={`${id}-picker`} role={pickerOnly ? "region" : "dialog"} aria-label={label || "Choose options"}>
      <div className="msc-search"><input ref={searchInput} aria-label="Search statuses" placeholder="Search options…" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} /><button type="button" disabled={disabled || !selected.length} onClick={() => update([])}>Clear</button></div>
      {!query && current && <button type="button" className="msc-back" disabled={disabled} onClick={() => setBranch(current.parent)}>‹ {pathLabel(current)}</button>}
      <div className="msc-options" onKeyDown={event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!buttons.length) return;
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }}>
        {rows.map(row => <button className={`msc-option${selected.includes(row.value) ? " msc-selected" : ""}`} type="button" key={row.value} disabled={disabled || row.disabled} aria-pressed={isBranch(row) ? undefined : selected.includes(row.value)} onClick={() => isBranch(row) ? setBranch(row.value) : toggle(row.value)}>
          <span>{query ? pathLabel(row) : row.label}</span><span aria-hidden="true">{isBranch(row) ? "›" : selected.includes(row.value) ? "✓" : ""}</span>
        </button>)}
        {!rows.length && <div className="msc-empty">No options found</div>}
      </div>
      <div className="msc-footer">{selected.length} selected{!pickerOnly && <button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button>}</div>
    </div>}
  </div>;
}
